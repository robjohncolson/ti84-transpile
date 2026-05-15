#!/usr/bin/env node

/**
 * Phase 330 — Map ALL writers to shared VRAM state variables
 *
 * Target addresses:
 *   D02FD6  clip Y-offset (24-bit)
 *   D02FD9  screen width  (24-bit)
 *   D02FDC  screen height (24-bit)
 *   D02FE0  VRAM row stride (24-bit)
 *   D02FE3  VRAM base address (24-bit)
 *
 * These are read by both text renderers:
 *   0x054FC6 (variable-width) and 0x054E21 (fixed-width).
 *
 * This probe:
 *   1. Statically enumerates every write site in the transpiled code
 *   2. Boots to home screen and reads final values
 *   3. Classifies each writer: init-time, mode-switch, or runtime
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);
const MEM_SIZE = 0x1000000;

// ─── Target addresses ───

const VRAM_STATE = {
  D02FD6: { addr: 0xD02FD6, name: 'clip Y-offset', width: 24 },
  D02FD9: { addr: 0xD02FD9, name: 'screen width', width: 24 },
  D02FDC: { addr: 0xD02FDC, name: 'screen height', width: 24 },
  D02FE0: { addr: 0xD02FE0, name: 'VRAM row stride', width: 24 },
  D02FE3: { addr: 0xD02FE3, name: 'VRAM base address', width: 24 },
};

// ─── ROM data tables ───

const DEFAULT_PARAMS_ROM = 0x05550C;   // 13 bytes: default 320x240 RGB565 layout
const ALT_PARAMS_ROM     = 0x055519;   // 13 bytes: alternate 320x240 8bpp layout

// ─── Known writer sites (from static analysis of ROM.transpiled.js) ───

const WRITER_SITES = [
  // ── D02FD6 direct writers ──
  {
    block: 0x0551EA,
    pc: 0x0551EA,
    target: 'D02FD6',
    instruction: 'ld (0xd02fd6), bc',
    kind: 'direct-store',
    classification: 'init-time',
    description:
      'LCD sync gate slow path (0x05519F). Stores conditional clip offset: ' +
      '0x001E if LCD type (D007E0) == 0x58, else 0x000000. ' +
      'Runs exactly once, guarded by D000C6 bit 1. ' +
      'Then falls through to LDIR that copies 13 bytes from ROM 0x05550C → D02FD9.',
    callers: ['0x055191 (sync gate, boot-time)'],
  },
  {
    block: 0x05563B,
    pc: 0x055647,
    target: 'D02FD6',
    instruction: 'ld (0xd02fd6), hl',
    kind: 'direct-store',
    classification: 'runtime-API',
    description:
      'Public setter: os_SetClipRegion or similar. ' +
      'Takes arg at (ix+6) and stores to D02FD6. ' +
      'Called via JP from 0x022092.',
    callers: ['0x022092 (jp 0x05563b)'],
  },
  {
    block: 0x08C6D5,
    pc: 0x08C6D9,
    target: 'D02FD6',
    instruction: 'ld (0xd02fd6), hl (hl=0)',
    kind: 'direct-store',
    classification: 'mode-switch',
    description:
      'Full VRAM reset: sets D02FD6=0 then calls 0x0551EF ' +
      '(the LDIR sub that copies default params from ROM 0x05550C → D02FD9). ' +
      'Called from 0x08C6C1 which clears several IY flags (mode/state reset). ' +
      '0x08C6C1 calls 0x027204 first, then falls through to 0x08C6D5.',
    callers: ['0x08C6C1 (state-reset sequence)'],
  },

  // ── D02FD9–D02FE5 LDIR writers (write all 4 fields as a 13-byte block) ──
  {
    block: 0x0551EA,
    pc: 0x0551FB,
    target: 'D02FD9-D02FE5',
    instruction: 'LDIR (13 bytes, src=ROM 0x05550C, dst=D02FD9)',
    kind: 'ldir-block',
    classification: 'init-time',
    description:
      'Boot-time init via sync gate. Copies default VRAM layout: ' +
      'width=320, height=240, stride=640, vbase=0xD40000. ' +
      'Source: ROM 0x05550C. This is the standard 16bpp (RGB565) framebuffer.',
    callers: ['0x055191 (sync gate, boot-time)'],
    sourceROM: DEFAULT_PARAMS_ROM,
  },
  {
    block: 0x055760,
    pc: 0x055772,
    target: 'D02FD9-D02FE5',
    instruction: 'LDIR (13 bytes, src=ROM 0x05550C via 0x055760, dst=D02FD9)',
    kind: 'ldir-block',
    classification: 'mode-switch',
    description:
      'Mode-switch path (bit 2 of (iy+70) clear): reloads default VRAM params. ' +
      '0x055760 sets HL=0x05550C then JR to 0x05576A which does the LDIR. ' +
      'Reached from 0x055743 (VRAM mode selector). ' +
      'This is the "return to normal 16bpp mode" path.',
    callers: ['0x055743 via 0x05575A → 0x055760 → 0x05576A'],
    sourceROM: DEFAULT_PARAMS_ROM,
  },
  {
    block: 0x055766,
    pc: 0x055772,
    target: 'D02FD9-D02FE5',
    instruction: 'LDIR (13 bytes, src=ROM 0x055519, dst=D02FD9)',
    kind: 'ldir-block',
    classification: 'mode-switch',
    description:
      'Mode-switch path (bit 2 of (iy+70) set): loads ALTERNATE VRAM params. ' +
      '0x055766 sets HL=0x055519 then falls through to 0x05576A (LDIR). ' +
      'Alternate layout: width=320, height=240, stride=320 (8bpp), vbase=0xD52C00. ' +
      'This is the 8bpp indexed-color mode (half stride, different VRAM base).',
    callers: ['0x055743 via 0x05575A → 0x055766 → 0x05576A'],
    sourceROM: ALT_PARAMS_ROM,
  },
  {
    block: 0x05576A,
    pc: 0x055772,
    target: 'D02FD9-D02FE5',
    instruction: 'LDIR (13 bytes, src=HL, dst=D02FD9)',
    kind: 'ldir-block',
    classification: 'mode-switch',
    description:
      'Shared LDIR tail for mode-switch. HL is set by either 0x055760 (default) ' +
      'or 0x055766 (alternate) before jumping here. ' +
      'Also reachable directly from 0x055758 if Z flag is NOT set (NZ path), ' +
      'in which case HL was set by the caller of 0x055743.',
    callers: ['0x055760 (default path)', '0x055766 (alternate path)', '0x055758 (NZ path, HL from caller)'],
    sourceROM: null, // depends on HL at entry
  },
  {
    block: 0x08C6D5,
    pc: 0x0551FB,
    target: 'D02FD9-D02FE5',
    instruction: 'LDIR via CALL 0x0551EF (13 bytes, src=ROM 0x05550C, dst=D02FD9)',
    kind: 'ldir-via-call',
    classification: 'mode-switch',
    description:
      'Full VRAM reset from 0x08C6D5: after setting D02FD6=0, ' +
      'calls 0x0551EF which is the LDIR body extracted from the sync gate. ' +
      'Always loads default params (0x05550C source). ' +
      'Part of the broader state-reset at 0x08C6C1.',
    callers: ['0x08C6C1 (state-reset sequence)'],
    sourceROM: DEFAULT_PARAMS_ROM,
  },
];

// ─── Helpers ───

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8) | ((buffer[addr + 2] ?? 0) << 16)) >>> 0;
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >> 8) & 0xFF;
  buffer[addr + 2] = (value >> 16) & 0xFF;
}

function formatROMParams(baseAddr) {
  const w = read24(rom, baseAddr);
  const h = read24(rom, baseAddr + 3);
  const extraByte = rom[baseAddr + 6];
  const stride = read24(rom, baseAddr + 7);
  const vbase = read24(rom, baseAddr + 10);
  return { width: w, height: h, extraByte, stride, vbase };
}

// ─── Module loading ───

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase330-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
    return normalizeBlocks(rawBlocks);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

// ─── Dynamic boot trace ───

const SYNC_GATE = 0x055191;
const STACK_BASE = 0xD1A800;
const RETURN_SENTINEL = 0xFFFFFE;
const GUARD_FLAG_ADDR = 0xD000C6;
const LCD_TYPE_ADDR = 0xD007E0;

async function bootAndReadState(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals, trackMemoryMapped: true });
  const cpu = executor.cpu;

  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.ix = 0x000000;
  cpu.iy = 0x000000;
  cpu.sp = STACK_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  write24(mem, STACK_BASE, RETURN_SENTINEL);
  mem[GUARD_FLAG_ADDR] &= ~0x02;  // clear sync gate guard so slow path runs
  mem[LCD_TYPE_ADDR] = 0x00;       // not 0x58, so clip offset = 0

  // Clear target addresses
  for (const entry of Object.values(VRAM_STATE)) {
    write24(mem, entry.addr, 0x000000);
  }

  // Track writes to our target addresses
  const vramWrites = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function isTargetRange(addr, width) {
    const lo = addr & 0xFFFFFF;
    const hi = lo + (width === 8 ? 0 : width === 16 ? 1 : 2);
    return lo >= 0xD02FD6 && lo <= 0xD02FE5 || hi >= 0xD02FD6 && hi <= 0xD02FE5;
  }

  function interceptWrite(origFn, addr, value, width) {
    if (isTargetRange(addr, width)) {
      vramWrites.push({
        addr: addr & 0xFFFFFF,
        value: value & (width === 8 ? 0xFF : width === 16 ? 0xFFFF : 0xFFFFFF),
        width,
        pc: cpu._currentBlockPc ?? 0,
      });
    }
    return origFn(addr, value);
  }

  cpu.write8 = (addr, value) => interceptWrite(origWrite8, addr, value, 8);
  cpu.write16 = (addr, value) => interceptWrite(origWrite16, addr, value, 16);
  cpu.write24 = (addr, value) => interceptWrite(origWrite24, addr, value, 24);

  const result = executor.runFrom(SYNC_GATE, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 16,
  });

  const logicalTermination =
    result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL
      ? 'returned_to_sentinel'
      : result.termination;

  return { logicalTermination, steps: result.steps, mem, vramWrites };
}

// ─── Main ───

console.log('=== Phase 330: Map ALL Writers to Shared VRAM State Variables ===\n');

// Part 1: ROM data tables
console.log('1) ROM data tables\n');

const defaultParams = formatROMParams(DEFAULT_PARAMS_ROM);
const altParams = formatROMParams(ALT_PARAMS_ROM);

console.log(`  Default params at ROM ${hex(DEFAULT_PARAMS_ROM)} (16bpp RGB565):`);
console.log(`    width  = ${defaultParams.width} (${hex(defaultParams.width)})`);
console.log(`    height = ${defaultParams.height} (${hex(defaultParams.height)})`);
console.log(`    extra  = ${hex(defaultParams.extraByte, 2)} (bits-per-pixel indicator? 0x10 = 16bpp)`);
console.log(`    stride = ${defaultParams.stride} (${hex(defaultParams.stride)}) = width * 2`);
console.log(`    vbase  = ${hex(defaultParams.vbase)}`);
console.log('');
console.log(`  Alternate params at ROM ${hex(ALT_PARAMS_ROM)} (8bpp indexed):`);
console.log(`    width  = ${altParams.width} (${hex(altParams.width)})`);
console.log(`    height = ${altParams.height} (${hex(altParams.height)})`);
console.log(`    extra  = ${hex(altParams.extraByte, 2)} (bits-per-pixel indicator? 0x08 = 8bpp)`);
console.log(`    stride = ${altParams.stride} (${hex(altParams.stride)}) = width * 1`);
console.log(`    vbase  = ${hex(altParams.vbase)}`);
console.log('');

// Part 2: VRAM state layout
console.log('2) VRAM state variable layout (D02FD6 – D02FE5)\n');
console.log('  D02FD6 (3 bytes): Clip Y-offset. 0x001E (30px) for LCD type 0x58, else 0.');
console.log('                    Also set to caller-supplied value via 0x05563B API.');
console.log('  D02FD9 (3 bytes): Screen width in pixels (320 = 0x000140).');
console.log('  D02FDC (3 bytes): Screen height in pixels (240 = 0x0000F0).');
console.log('  D02FDF (1 byte):  Bits-per-pixel indicator (0x10 = 16bpp, 0x08 = 8bpp).');
console.log('                    (Byte +6 of the 13-byte LDIR block.)');
console.log('  D02FE0 (3 bytes): VRAM row stride in bytes.');
console.log('                    640 (0x000280) for 16bpp, 320 (0x000140) for 8bpp.');
console.log('  D02FE3 (3 bytes): VRAM base address.');
console.log('                    0xD40000 for 16bpp, 0xD52C00 for 8bpp.');
console.log('');

// Part 3: All writer sites
console.log('3) All writer sites (static analysis of ROM.transpiled.js)\n');

const byClassification = {};
for (const site of WRITER_SITES) {
  const cls = site.classification;
  if (!byClassification[cls]) byClassification[cls] = [];
  byClassification[cls].push(site);
}

for (const [cls, sites] of Object.entries(byClassification)) {
  console.log(`  --- ${cls.toUpperCase()} ---\n`);
  for (const site of sites) {
    console.log(`  Block ${hex(site.block)} | PC ${hex(site.pc)}`);
    console.log(`    Target: ${site.target}`);
    console.log(`    Instruction: ${site.instruction}`);
    console.log(`    Description: ${site.description}`);
    if (site.sourceROM !== undefined && site.sourceROM !== null) {
      console.log(`    ROM source: ${hex(site.sourceROM)}`);
    }
    console.log(`    Callers: ${site.callers.join(', ')}`);
    console.log('');
  }
}

// Part 4: Mode-switch function flow
console.log('4) Mode-switch function flow (0x055743)\n');
console.log('  0x055743: push ix; set ix=sp; iy=0xD00080; hl=(ix+6); call 0x000138 (multiply)');
console.log('    return → 0x055758');
console.log('');
console.log('  0x055758: JR NZ → 0x05576A (LDIR with HL from multiply result)');
console.log('            fall-through → 0x05575A');
console.log('');
console.log('  0x05575A: BIT 2, (IY+70)    ← checks flag at D000C6 area');
console.log('            JR NZ → 0x055766 (alternate 8bpp params)');
console.log('            fall-through → 0x055760 (default 16bpp params)');
console.log('');
console.log('  0x055760: LD HL, 0x05550C    ← default ROM table');
console.log('            JR → 0x05576A');
console.log('');
console.log('  0x055766: LD HL, 0x055519    ← alternate ROM table');
console.log('            fall-through → 0x05576A');
console.log('');
console.log('  0x05576A: LDIR (13 bytes from HL → D02FD9)');
console.log('            POP IX; RET');
console.log('');
console.log('  Known caller: 0x055265 pushes HL=0x055519 and calls 0x055743.');
console.log('  This means the mode-switch can also be invoked with a caller-supplied');
console.log('  ROM source table (passed on stack at ix+6).');
console.log('');

// Part 5: State-reset function flow
console.log('5) State-reset function flow (0x08C6C1 → 0x08C6D5)\n');
console.log('  0x08C6C1: RES 2,(IY+87); RES 3,(IY+87); RES 6,(IY+50); RES 2,(IY+1)');
console.log('            CALL 0x027204 (unknown sub)');
console.log('    return → 0x08C6D5');
console.log('');
console.log('  0x08C6D5: LD HL, 0x000000');
console.log('            LD (0xD02FD6), HL   ← clip offset = 0');
console.log('            CALL 0x0551EF       ← LDIR sub (default params from 0x05550C)');
console.log('    return → 0x08C6E1');
console.log('');
console.log('  This is a full reset: clears clip offset AND reloads default 16bpp VRAM layout.');
console.log('');

// Part 6: Dynamic boot trace
console.log('6) Dynamic boot trace — values after sync gate init\n');

const blocksMap = await loadBlocks();
const trace = await bootAndReadState(blocksMap);

console.log(`  Termination: ${trace.logicalTermination}`);
console.log(`  Steps: ${trace.steps}`);
console.log('');

console.log('  Writes to VRAM state during boot:');
for (const w of trace.vramWrites) {
  const valWidth = w.width <= 8 ? 2 : w.width <= 16 ? 4 : 6;
  console.log(`    ${hex(w.addr)} = ${hex(w.value, valWidth)} (${w.width}-bit, from block ${hex(w.pc)})`);
}
console.log('');

console.log('  Final VRAM state after boot:');
for (const entry of Object.values(VRAM_STATE)) {
  const value = read24(trace.mem, entry.addr);
  console.log(`    ${hex(entry.addr)} (${entry.name}): ${hex(value)} = ${value}`);
}
console.log('');

// Part 7: Summary
console.log('7) Summary — writer classification\n');
console.log('  INIT-TIME (runs once at boot, guarded by D000C6 bit 1):');
console.log('    0x0551EA: D02FD6 = conditional clip offset, then LDIR default params → D02FD9');
console.log('');
console.log('  MODE-SWITCH (called when screen mode changes):');
console.log('    0x055743: VRAM mode selector. Dispatches to one of:');
console.log('      0x055760 → 0x05576A: LDIR default (16bpp, stride=640, vbase=D40000)');
console.log('      0x055766 → 0x05576A: LDIR alternate (8bpp, stride=320, vbase=D52C00)');
console.log('      0x05576A direct (NZ): LDIR with caller-supplied HL as ROM source');
console.log('    0x08C6D5: Full reset — D02FD6=0, then CALL 0x0551EF (default params)');
console.log('');
console.log('  RUNTIME-API (callable by apps):');
console.log('    0x05563B: Set D02FD6 (clip offset) from stack arg. JP target from 0x022092.');
console.log('');
console.log('  Two ROM tables define the layout:');
console.log(`    ${hex(DEFAULT_PARAMS_ROM)}: 16bpp (stride=640, vbase=0xD40000)`);
console.log(`    ${hex(ALT_PARAMS_ROM)}:     8bpp  (stride=320, vbase=0xD52C00)`);
console.log('');
console.log('  D02FD6 is the only field written independently — all others');
console.log('  are always written as a 13-byte block via LDIR.');
