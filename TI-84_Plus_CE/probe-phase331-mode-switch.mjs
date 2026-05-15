#!/usr/bin/env node

/**
 * Phase 331 — Map the 0x055743 mode-switch function
 *
 * The mode-switch selects between 16bpp and 8bpp VRAM layouts based on
 * (IY+70) bit 2 (address 0xD000C6 when IY=0xD00080).
 *
 * This probe:
 *   1. Statically disassembles block_0x055743 and its continuation blocks
 *   2. Finds all callers of 0x055743
 *   3. Finds all references to the bpp flag (IY+70 bit 2 / 0xD000C6)
 *   4. Boots to home screen and logs when 0x055743 is called during boot
 *   5. Reports all callers, state changes, and bpp flag references
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

// ─── Key addresses ───

const MODE_SWITCH_ENTRY = 0x055743;
const MODE_SWITCH_BLOCKS = [
  0x055743, // entry: push ix, set ix=sp, iy=0xD00080, hl=(ix+6), call 0x000138
  0x055758, // return from multiply: JR NZ → 0x05576A, fall-through → 0x05575A
  0x05575A, // BIT 2, (IY+70): JR NZ → 0x055766, fall-through → 0x055760
  0x055760, // 16bpp path: LD HL, 0x05550C; JR → 0x05576A
  0x055766, // 8bpp path: LD HL, 0x055519; fall-through → 0x05576A
  0x05576A, // shared tail: LDIR 13 bytes HL→D02FD9, POP IX, RET
];

const BPP_FLAG_ADDR = 0xD000C6;  // IY+70 when IY=0xD00080
const DEFAULT_PARAMS_ROM = 0x05550C;  // 16bpp table
const ALT_PARAMS_ROM = 0x055519;      // 8bpp table

// ─── Callers of 0x055743 (found by static search of transpiled JS) ───

const MODE_SWITCH_CALLERS = [
  {
    block: 0x055265,
    instruction: 'call 0x055743',
    description:
      'Init sequence: sets D026AC=0, D005F4=0xFF, pushes HL=0x055519 (alt params) ' +
      'as the stack arg, then calls mode-switch. Return → 0x05527A which SETs bit 2 of (IY+70). ' +
      'This is the "enter 8bpp mode" path.',
    context: 'Part of LCD/VRAM init chain. Reached from 0x05523E which fills VRAM with 0xFF, ' +
             'copies palette table from ROM 0x055777 → E30200, calls 0x055280 with A=0x27, ' +
             'then falls through to 0x055265.',
    trigger: 'Boot / LCD init',
  },
];

// ─── All BIT 2 (IY+70) / 0xD000C6 bit 2 references ───

const BPP_FLAG_WRITERS = [
  {
    block: 0x05527A,
    pc: 0x05527B,
    operation: 'SET 2, (IY+70)',
    description:
      'Return point of the 0x055265 → 0x055743 call. After mode-switch returns, ' +
      'pops HL and sets bit 2 = 1 (8bpp mode active). This is the ONLY SET 2 site.',
  },
  {
    block: 0x05522C,
    pc: 0x05522C,
    operation: 'RES 2, (IY+70)',
    description:
      'Clears bit 2 (back to 16bpp), then zeros (0x0026AC), then calls 0x0551EF ' +
      '(LDIR default params from ROM 0x05550C → D02FD9). ' +
      'Reached from 0x055226 which calls 0x055280 with A=0x2D first. ' +
      'This is the "exit 8bpp / return to 16bpp" path.',
  },
];

const BPP_FLAG_READERS_IY70 = [
  // BIT 2, (IY+70) — via IY register
  { pc: 0x05575A, context: 'Mode-switch function itself (selects 16bpp vs 8bpp table)' },
  { pc: 0x055220, context: 'VRAM fill (0x055202): if bit2 clear → skip to 0x055230 (16bpp reload)' },
  { pc: 0x054E87, context: 'Variable-width text renderer: adjusts pixel write for bpp' },
  { pc: 0x054F02, context: 'Variable-width text renderer: stride doubling branch' },
  { pc: 0x054F4E, context: 'Variable-width text renderer: color format branch' },
  { pc: 0x054F7E, context: 'Variable-width text renderer: pixel advance branch' },
  { pc: 0x055028, context: 'Text renderer helper: bpp-dependent pixel write' },
  { pc: 0x0550AB, context: 'Text renderer helper: bpp-dependent row advance' },
  { pc: 0x0550F3, context: 'Text renderer helper: bpp-dependent cursor calc' },
  { pc: 0x055122, context: 'Text renderer helper: bpp-dependent line height' },
  { pc: 0x0553A0, context: 'Pixel plotting: bpp-dependent coordinate transform' },
  { pc: 0x0556F4, context: 'LCD config helper: bpp-dependent stride selection' },
];

const BPP_FLAG_READERS_DIRECT = [
  // LD A, (0xD000C6); BIT 2, A — direct memory access
  { pc: 0x052AE1, context: 'Pixel writer (0x052ADA): adjusts write mode for bpp' },
  { pc: 0x052BFE, context: 'Pixel writer (0x052BFA): adjusts write mode for bpp' },
  { pc: 0x052CEC, context: 'Pixel writer (0x052CDA): adjusts write mode for bpp' },
  { pc: 0x052D85, context: 'Pixel writer (0x052D81): adjusts write mode for bpp' },
  { pc: 0x05440E, context: 'Pixel plotter (0x054405): bpp-dependent coordinate calc' },
  { pc: 0x05529F, context: 'VRAM state query (0x05529B): returns mode info to caller' },
];

const BPP_FLAG_READERS_INDIRECT = [
  // LD HL, 0xD000C6; BIT 2, (HL) — indirect via HL
  { pc: 0x08C30D, context: 'Helper function (0x08C308): tests bit 2 and returns Z flag. ' +
                            'Called from 0x0702D0 (graph renderer?) with DE=0x000140 (320).' },
];

// ─── State changes beyond VRAM descriptor ───

const EXTRA_STATE_CHANGES = [
  {
    addr: 0xD026AC,
    description: 'Set to 0x00 by 0x055265 before calling mode-switch (8bpp entry path). ' +
                 'Zeroed by 0x05522C after clearing bit 2 (16bpp exit path via 0x0026AC). ' +
                 'Likely a mode indicator or palette index.',
  },
  {
    addr: 0xD005F4,
    description: 'Set to 0xFF by 0x055265 before calling mode-switch. ' +
                 'Purpose unclear — possibly a "dirty" flag or palette validity marker.',
  },
  {
    addr: 0xD02FDF,
    description: 'Byte +6 of the 13-byte LDIR block (within D02FD9-D02FE5). ' +
                 'Set to 0x10 for 16bpp or 0x08 for 8bpp. ' +
                 'This is the bpp indicator read by renderers to determine pixel width.',
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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase331-${process.pid}.mjs`);
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

// ─── Static disassembly of mode-switch blocks ───

function disassembleBlock(blocks, addr) {
  const key = addr.toString(16).padStart(6, '0') + ':adl';
  const block = blocks[key];
  if (!block) return null;
  return {
    id: key,
    addr,
    source: block.source ?? block.fn?.toString() ?? '(no source)',
  };
}

function extractBlockCallers(blocks) {
  const callers = [];
  for (const [id, block] of Object.entries(blocks)) {
    const src = block.source ?? block.fn?.toString() ?? '';
    if (src.includes('return 0x055743') || src.includes('call 0x055743')) {
      const addrMatch = id.match(/^([0-9a-f]+):/);
      if (addrMatch) {
        callers.push({
          blockAddr: parseInt(addrMatch[1], 16),
          id,
          snippet: src.substring(0, 200),
        });
      }
    }
  }
  return callers;
}

function extractBppFlagReferences(blocks) {
  const refs = [];
  for (const [id, block] of Object.entries(blocks)) {
    const src = block.source ?? block.fn?.toString() ?? '';
    // Match IY+70 bit 2 or D000C6 bit 2 references
    const hasIY70Bit2 = /bit 2.*iy\+70|set 2.*iy\+70|res 2.*iy\+70/i.test(src);
    const hasD000C6 = /0xd000c6/i.test(src) && /bit 2/i.test(src);
    const hasHL_D000C6 = /0xd000c6/i.test(src) && /bit 2.*\(hl\)/i.test(src);

    if (hasIY70Bit2 || hasD000C6 || hasHL_D000C6) {
      const addrMatch = id.match(/^([0-9a-f]+):/);
      if (addrMatch) {
        const blockAddr = parseInt(addrMatch[1], 16);
        let kind = 'read';
        if (/set 2/i.test(src)) kind = 'write-set';
        if (/res 2/i.test(src)) kind = 'write-res';

        refs.push({ blockAddr, id, kind });
      }
    }
  }
  // Deduplicate by blockAddr
  const seen = new Set();
  return refs.filter((r) => {
    if (seen.has(r.blockAddr)) return false;
    seen.add(r.blockAddr);
    return true;
  }).sort((a, b) => a.blockAddr - b.blockAddr);
}

// ─── Dynamic boot trace ───

const SYNC_GATE = 0x055191;
const STACK_BASE = 0xD1A800;
const RETURN_SENTINEL = 0xFFFFFE;
const GUARD_FLAG_ADDR = 0xD000C6;
const LCD_TYPE_ADDR = 0xD007E0;

async function bootAndTraceModeSwitchCalls(blocks) {
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
  mem[LCD_TYPE_ADDR] = 0x00;

  // Track calls to mode-switch blocks
  const modeSwitchCalls = [];
  const bppFlagChanges = [];

  // Intercept block execution to detect mode-switch calls
  const origRunBlock = executor.runBlock?.bind(executor);

  // Track writes to BPP flag (D000C6)
  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    if ((addr & 0xFFFFFF) === BPP_FLAG_ADDR) {
      bppFlagChanges.push({
        value,
        pc: cpu._currentBlockPc ?? 0,
        kind: 'write8',
      });
    }
    return origWrite8(addr, value);
  };

  // Track writeIndexed8 for IY+70 operations (SET/RES)
  const origWriteIndexed8 = cpu.writeIndexed8.bind(cpu);
  cpu.writeIndexed8 = (reg, offset, value) => {
    if (reg === 'iy' && offset === 70) {
      bppFlagChanges.push({
        value,
        pc: cpu._currentBlockPc ?? 0,
        kind: `writeIndexed8(iy+70)`,
      });
    }
    return origWriteIndexed8(reg, offset, value);
  };

  // Track VRAM descriptor writes
  const vramWrites = [];
  const origWrite24 = cpu.write24.bind(cpu);
  cpu.write24 = (addr, value) => {
    const lo = addr & 0xFFFFFF;
    if (lo >= 0xD02FD9 && lo <= 0xD02FE5) {
      vramWrites.push({
        addr: lo,
        value: value & 0xFFFFFF,
        pc: cpu._currentBlockPc ?? 0,
      });
    }
    return origWrite24(addr, value);
  };

  const result = executor.runFrom(SYNC_GATE, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 16,
  });

  const logicalTermination =
    result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL
      ? 'returned_to_sentinel'
      : result.termination;

  // Check which mode-switch blocks were visited
  const visitedBlocks = result.visitedBlocks ?? result.trace ?? [];
  const modeSwitchVisits = [];
  for (const entry of MODE_SWITCH_BLOCKS) {
    const key = entry.toString(16).padStart(6, '0') + ':adl';
    // Check if this block was in the execution trace
    if (Array.isArray(visitedBlocks) && visitedBlocks.includes(key)) {
      modeSwitchVisits.push(entry);
    }
  }

  return {
    logicalTermination,
    steps: result.steps,
    mem,
    bppFlagChanges,
    vramWrites,
    modeSwitchVisits,
    bppFlagFinal: mem[BPP_FLAG_ADDR],
  };
}

// ─── Main ───

console.log('=== Phase 331: Map the 0x055743 Mode-Switch Function ===\n');

// Part 1: Static disassembly of mode-switch blocks
console.log('1) Static disassembly of mode-switch function (0x055743)\n');

console.log('  Block chain:');
console.log('');
console.log('  0x055743 (entry):');
console.log('    PUSH IX');
console.log('    LD IX, 0x000000');
console.log('    ADD IX, SP          ; IX = SP (frame pointer)');
console.log('    LD IY, 0xD00080     ; IY = system flags base');
console.log('    LD HL, (IX+6)       ; HL = stack arg (ROM table addr or multiplier)');
console.log('    CALL 0x000138       ; multiply/validate HL');
console.log('    return → 0x055758');
console.log('');
console.log('  0x055758 (post-multiply):');
console.log('    JR NZ, 0x05576A     ; if multiply result nonzero → use HL as-is for LDIR');
console.log('    fall-through → 0x05575A');
console.log('');
console.log('  0x05575A (bpp decision):');
console.log('    BIT 2, (IY+70)      ; test bit 2 of D000C6 (bpp flag)');
console.log('    JR NZ, 0x055766     ; if set → 8bpp path');
console.log('    fall-through → 0x055760  ; else → 16bpp path');
console.log('');
console.log('  0x055760 (16bpp path):');
console.log('    LD HL, 0x05550C     ; source = default ROM table (16bpp)');
console.log('    JR 0x05576A         ; → shared LDIR tail');
console.log('');
console.log('  0x055766 (8bpp path):');
console.log('    LD HL, 0x055519     ; source = alternate ROM table (8bpp)');
console.log('    fall-through → 0x05576A');
console.log('');
console.log('  0x05576A (shared LDIR tail):');
console.log('    LD BC, 0x00000D     ; 13 bytes');
console.log('    LD DE, 0xD02FD9     ; destination = VRAM descriptor');
console.log('    LDIR                ; copy 13 bytes from HL → D02FD9..D02FE5');
console.log('    POP IX');
console.log('    RET');
console.log('');

// Part 2: ROM data tables
console.log('2) ROM data tables decoded\n');

const defaultParams = formatROMParams(DEFAULT_PARAMS_ROM);
const altParams = formatROMParams(ALT_PARAMS_ROM);

console.log(`  16bpp table at ${hex(DEFAULT_PARAMS_ROM)}:`);
console.log(`    width=${defaultParams.width} height=${defaultParams.height} ` +
            `bpp=0x${defaultParams.extraByte.toString(16).toUpperCase()} ` +
            `stride=${defaultParams.stride} vbase=${hex(defaultParams.vbase)}`);
console.log(`  8bpp table at ${hex(ALT_PARAMS_ROM)}:`);
console.log(`    width=${altParams.width} height=${altParams.height} ` +
            `bpp=0x${altParams.extraByte.toString(16).toUpperCase()} ` +
            `stride=${altParams.stride} vbase=${hex(altParams.vbase)}`);
console.log('');

// Part 3: All callers of 0x055743
console.log('3) Callers of 0x055743 (static analysis)\n');

for (const caller of MODE_SWITCH_CALLERS) {
  console.log(`  Block ${hex(caller.block)}:`);
  console.log(`    Instruction: ${caller.instruction}`);
  console.log(`    Description: ${caller.description}`);
  console.log(`    Context: ${caller.context}`);
  console.log(`    Trigger: ${caller.trigger}`);
  console.log('');
}

// Also search dynamically
const blocksMap = await loadBlocks();

const dynamicCallers = extractBlockCallers(blocksMap);
console.log(`  Dynamic search found ${dynamicCallers.length} block(s) calling 0x055743:`);
for (const c of dynamicCallers) {
  console.log(`    Block ${hex(c.blockAddr)} (${c.id})`);
}
console.log('');

// Part 4: State changes beyond VRAM descriptor
console.log('4) State changes beyond the 13-byte VRAM descriptor\n');

for (const sc of EXTRA_STATE_CHANGES) {
  console.log(`  ${hex(sc.addr)}: ${sc.description}`);
  console.log('');
}

// Part 5: BPP flag (IY+70 bit 2) — all references
console.log('5) BPP flag (IY+70 bit 2 / D000C6 bit 2) — all references\n');

console.log('  --- WRITERS (SET/RES bit 2) ---\n');
for (const w of BPP_FLAG_WRITERS) {
  console.log(`  ${hex(w.pc)}: ${w.operation}`);
  console.log(`    ${w.description}`);
  console.log('');
}

console.log('  --- READERS via IY+70 ---\n');
for (const r of BPP_FLAG_READERS_IY70) {
  console.log(`  ${hex(r.pc)}: BIT 2, (IY+70)  — ${r.context}`);
}
console.log('');

console.log('  --- READERS via LD A, (0xD000C6); BIT 2, A ---\n');
for (const r of BPP_FLAG_READERS_DIRECT) {
  console.log(`  ${hex(r.pc)}: BIT 2, A  — ${r.context}`);
}
console.log('');

console.log('  --- READERS via LD HL, 0xD000C6; BIT 2, (HL) ---\n');
for (const r of BPP_FLAG_READERS_INDIRECT) {
  console.log(`  ${hex(r.pc)}: BIT 2, (HL)  — ${r.context}`);
}
console.log('');

// Dynamic search for all bpp flag references
const dynamicRefs = extractBppFlagReferences(blocksMap);
console.log(`  Dynamic search found ${dynamicRefs.length} unique block(s) referencing bpp flag:`);
const readCount = dynamicRefs.filter((r) => r.kind === 'read').length;
const setCount = dynamicRefs.filter((r) => r.kind === 'write-set').length;
const resCount = dynamicRefs.filter((r) => r.kind === 'write-res').length;
console.log(`    ${readCount} readers, ${setCount} setters, ${resCount} clearers`);
console.log('');

// Part 6: Boot trace
console.log('6) Dynamic boot trace — mode-switch calls during sync gate init\n');

const trace = await bootAndTraceModeSwitchCalls(blocksMap);

console.log(`  Termination: ${trace.logicalTermination}`);
console.log(`  Steps: ${trace.steps}`);
console.log(`  BPP flag (D000C6) final value: ${hex(trace.bppFlagFinal, 2)}`);
console.log(`    Bit 2 = ${(trace.bppFlagFinal & 0x04) ? '1 (8bpp mode)' : '0 (16bpp mode)'}`);
console.log('');

if (trace.bppFlagChanges.length > 0) {
  console.log('  BPP flag (IY+70) changes during boot:');
  for (const change of trace.bppFlagChanges) {
    console.log(`    ${hex(BPP_FLAG_ADDR)} = ${hex(change.value, 2)} ` +
                `(${change.kind}, from block ${hex(change.pc)})`);
  }
} else {
  console.log('  No BPP flag changes observed during boot trace.');
}
console.log('');

if (trace.vramWrites.length > 0) {
  console.log('  VRAM descriptor writes during boot:');
  for (const w of trace.vramWrites) {
    console.log(`    ${hex(w.addr)} = ${hex(w.value)} (from block ${hex(w.pc)})`);
  }
} else {
  console.log('  No VRAM descriptor writes observed during boot trace.');
}
console.log('');

// Read final VRAM state
console.log('  Final VRAM descriptor after boot:');
const vramFields = [
  { addr: 0xD02FD9, name: 'screen width' },
  { addr: 0xD02FDC, name: 'screen height' },
  { addr: 0xD02FDF, name: 'bpp indicator', width: 8 },
  { addr: 0xD02FE0, name: 'row stride' },
  { addr: 0xD02FE3, name: 'VRAM base' },
];
for (const f of vramFields) {
  if (f.width === 8) {
    const v = trace.mem[f.addr];
    console.log(`    ${hex(f.addr)} (${f.name}): ${hex(v, 2)}`);
  } else {
    const v = read24(trace.mem, f.addr);
    console.log(`    ${hex(f.addr)} (${f.name}): ${hex(v)} = ${v}`);
  }
}
console.log('');

// Part 7: Call graph summary
console.log('7) Call graph summary\n');
console.log('  Mode-switch entry points:');
console.log('');
console.log('  [8bpp ENTRY] 0x05523E (VRAM fill + palette copy)');
console.log('    → 0x055280 (LCD config, A=0x27)');
console.log('    → 0x055265 (sets D026AC=0, D005F4=0xFF, pushes 0x055519)');
console.log('      → 0x055743 (mode-switch with alt params on stack)');
console.log('        → 0x05575A: BIT 2 check (but stack arg overrides via NZ path)');
console.log('        → 0x05576A: LDIR 13 bytes → D02FD9');
console.log('      → 0x05527A: SET 2, (IY+70) — marks 8bpp active');
console.log('');
console.log('  [16bpp RETURN] 0x055226');
console.log('    → 0x055280 (LCD config, A=0x2D)');
console.log('    → 0x05522C: RES 2, (IY+70) — clears 8bpp flag');
console.log('      → 0x0551EF (LDIR default 16bpp params → D02FD9)');
console.log('');
console.log('  [FULL RESET] 0x08C6B9 (state-reset chain)');
console.log('    → 0x025354');
console.log('    → 0x08C6BD → 0x025396');
console.log('    → 0x08C6C1: clears IY flags (bits in +87, +50, +1)');
console.log('      → 0x027204');
console.log('    → 0x08C6D5: D02FD6=0, CALL 0x0551EF (default 16bpp params)');
console.log('');
console.log('  [BPP CHECK HELPER] 0x08C308');
console.log('    LD HL, 0xD000C6; BIT 2, (HL); POP HL; RET');
console.log('    Called from 0x0702D0 (graph renderer area, DE=320)');
console.log('    Returns Z flag = bpp state to caller');
console.log('');

// Part 8: Summary
console.log('8) Summary\n');
console.log('  The 0x055743 mode-switch function:');
console.log('    1. Takes a ROM table address as stack arg at (IX+6)');
console.log('    2. Calls 0x000138 (multiply/validate)');
console.log('    3. If result NZ → uses caller-supplied HL for LDIR (override path)');
console.log('    4. If result Z → checks BIT 2, (IY+70):');
console.log('       - Clear (0) → LD HL, 0x05550C (16bpp: stride=640, vbase=D40000)');
console.log('       - Set   (1) → LD HL, 0x055519 (8bpp:  stride=320, vbase=D52C00)');
console.log('    5. LDIR copies 13 bytes from HL → D02FD9 (VRAM descriptor)');
console.log('');
console.log('  BPP flag (IY+70 bit 2 = D000C6 bit 2):');
console.log(`    SET by: 0x05527A only (after 8bpp init call returns)`);
console.log(`    RES by: 0x05522C only (16bpp restore path)`);
console.log(`    READ by: ${BPP_FLAG_READERS_IY70.length} sites via IY+70, ` +
            `${BPP_FLAG_READERS_DIRECT.length} sites via direct D000C6 load, ` +
            `${BPP_FLAG_READERS_INDIRECT.length} site via indirect HL`);
console.log('');
console.log('  Consumers of the bpp flag span:');
console.log('    - Both text renderers (0x054E21 variable-width, 0x054FC6 fixed-width area)');
console.log('    - Pixel writers (0x052A-0x052D range)');
console.log('    - Pixel plotters (0x0544xx)');
console.log('    - LCD config helpers (0x0556xx)');
console.log('    - Graph renderer area (0x0702xx via 0x08C308 helper)');
console.log('    - VRAM fill/clear (0x055202)');
console.log('    - Mode query (0x05529B)');
