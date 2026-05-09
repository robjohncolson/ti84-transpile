#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const BOOT_MODE = 'z80';
const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D005F8 = 0xD005F8;
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D02590 = 0xD02590;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;
const D02AD7 = 0xD02AD7;

const REQUESTED_D0259A = 0xD3FFF6;
const ENTRY_START = 0xD3FFF7;
const MATCH_FB_ADDR = ENTRY_START + 0;
const MATCH_FA_ADDR = ENTRY_START + 1;
const MATCH_F9_ADDR = ENTRY_START + 2;
const PAYLOAD_B_ADDR = ENTRY_START + 3;
const PAYLOAD_D_ADDR = ENTRY_START + 4;
const PAYLOAD_E_ADDR = ENTRY_START + 5;
const RESULT_BYTE_ADDR = ENTRY_START + 8;

const WATCH_ADDRS = new Set([D005F8, D02590, D0259A, D0259D, D02AD7, D02AD7 + 1, D02AD7 + 2]);
const TERMINATING_TAGS = new Set(['jp', 'jr', 'ret', 'reti', 'retn']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), hexByte).join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0)
    | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)
    | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase278-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function withModePrefix(inst, text) {
  return inst.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackMnemonic(inst) {
  const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'kind', 'nextMode']);
  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (ignored.has(key) || value === undefined || value === null || key === 'tag') {
      continue;
    }
    parts.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
  }
  return withModePrefix(inst, parts.length ? `${inst.tag} ${parts.join(', ')}` : inst.tag);
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'alu-imm':
      return withModePrefix(inst, `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${String(inst.op).toUpperCase()} ${inst.src === '(hl)' ? '(HL)' : String(inst.src).toUpperCase()}`);
    case 'call':
      return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'dec-pair':
      return withModePrefix(inst, `DEC ${String(inst.pair).toUpperCase()}`);
    case 'inc-pair':
      return withModePrefix(inst, `INC ${String(inst.pair).toUpperCase()}`);
    case 'jp':
      return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'jr':
      return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withModePrefix(inst, `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`);
      }
      return withModePrefix(inst, `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'pop':
      return withModePrefix(inst, `POP ${String(inst.pair).toUpperCase()}`);
    case 'push':
      return withModePrefix(inst, `PUSH ${String(inst.pair).toUpperCase()}`);
    case 'ret':
      return withModePrefix(inst, 'RET');
    case 'ret-conditional':
      return withModePrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'sbc-pair':
      return withModePrefix(inst, `SBC HL, ${String(inst.src).toUpperCase()}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function decodeWindow(rom, start, maxBytes = 0x40) {
  const out = [];
  let pc = start;
  let consumed = 0;
  while (pc < rom.length && consumed < maxBytes) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(inst.length ?? 1, 1);
    out.push({ ...inst, bytes: hexBytes(rom, pc, length) });
    pc += length;
    consumed += length;
    if (TERMINATING_TAGS.has(inst.tag)) {
      break;
    }
  }
  return out;
}

function printDisasm(title, instructions) {
  console.log(`\n${title}`);
  for (const inst of instructions) {
    console.log(`  ${hex(inst.pc)}  ${inst.bytes.padEnd(17, ' ')} ${formatMnemonic(inst)}`);
  }
}

function summarizeHelper(instructions) {
  const hlReads = [];
  const control = [];
  const directRefs = [];
  for (const inst of instructions) {
    if (inst.tag === 'ld-reg-ind' && inst.src === 'hl') {
      hlReads.push(inst);
    }
    if (inst.tag === 'alu-reg' && inst.src === '(hl)') {
      hlReads.push(inst);
    }
    if (['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional', 'ret', 'ret-conditional'].includes(inst.tag)) {
      control.push(inst);
    }
    if (Number.isInteger(inst.addr)) {
      directRefs.push(inst);
    }
  }
  console.log('\nStatic findings for 0x04C885');
  console.log(`  HL reads: ${hlReads.length === 0 ? 'none' : hlReads.map((inst) => hex(inst.pc)).join(', ')}`);
  console.log(`  Control transfers inside block: ${control.map((inst) => `${hex(inst.pc)} ${formatMnemonic(inst)}`).join(' | ')}`);
  console.log(`  Direct memory refs: ${directRefs.map((inst) => `${hex(inst.addr)} @ ${hex(inst.pc)}`).join(' | ')}`);
  console.log(`  D005F8 referenced: ${directRefs.some((inst) => inst.addr === D005F8) ? 'yes' : 'no'}`);
  console.log(`  D0259x referenced: ${directRefs.some((inst) => inst.addr >= 0xD02590 && inst.addr <= 0xD0259F) ? 'yes' : 'no'}`);
  console.log(`  Effect: A <- B; (0xD02AD7..0xD02AD9) <- [E, D, B]; DE <- read24(0xD02AD7); RET`);
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function seedScenario(mem, cpu) {
  mem.fill(0x00, 0xD3F000, 0xD40000);
  mem[D005F8 & MEM_MASK] = 0xAA;
  mem[D005F9 & MEM_MASK] = 0x49;
  mem[D005FA & MEM_MASK] = 0x00;
  mem[D005FB & MEM_MASK] = 0x00;

  write24(mem, D02590, ENTRY_START);
  write24(mem, D0259A, REQUESTED_D0259A);
  write24(mem, D0259D, ENTRY_START);
  write24(mem, D02AD7, 0x112233);

  mem[MATCH_FB_ADDR & MEM_MASK] = 0x00;
  mem[MATCH_FA_ADDR & MEM_MASK] = 0x00;
  mem[MATCH_F9_ADDR & MEM_MASK] = 0x49;
  mem[PAYLOAD_B_ADDR & MEM_MASK] = 0x05;
  mem[PAYLOAD_D_ADDR & MEM_MASK] = 0x83;
  mem[PAYLOAD_E_ADDR & MEM_MASK] = 0x22;
  mem[(ENTRY_START + 6) & MEM_MASK] = 0x00;
  mem[(ENTRY_START + 7) & MEM_MASK] = 0x00;
  mem[RESULT_BYTE_ADDR & MEM_MASK] = 0x7C;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.hl = MATCH_F9_ADDR;
  cpu.b = mem[PAYLOAD_B_ADDR & MEM_MASK];
  cpu.de = (mem[PAYLOAD_D_ADDR & MEM_MASK] << 8) | mem[PAYLOAD_E_ADDR & MEM_MASK];
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function installWriteWatch(cpu) {
  const writes = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const masked = addr & MEM_MASK;
    if (WATCH_ADDRS.has(masked)) {
      writes.push({ kind: 'write8', addr: masked, value: value & 0xFF });
    }
    return origWrite8(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const masked = addr & MEM_MASK;
    if (WATCH_ADDRS.has(masked) || WATCH_ADDRS.has((masked + 1) & MEM_MASK) || WATCH_ADDRS.has((masked + 2) & MEM_MASK)) {
      writes.push({ kind: 'write24', addr: masked, value: value & 0xFFFFFF });
    }
    return origWrite24(addr, value);
  };

  return writes;
}

function printEntryLayout(mem) {
  console.log('\nCaller-consumed record layout');
  console.log(`  Requested by task: D0259A = ${hex(read24(mem, D0259A))}`);
  console.log(`  Normal non-0x24 path actually uses D0259D = ${hex(read24(mem, D0259D))} and starts from HL = 0xD3FFFF`);
  console.log(`  The match tail at 0x08472C..0x08474C consumes this top-aligned 9-byte window:`);
  console.log(`    ${hex(MATCH_FB_ADDR)}  key byte for D005FB = ${hex(mem[MATCH_FB_ADDR & MEM_MASK], 2)}`);
  console.log(`    ${hex(MATCH_FA_ADDR)}  key byte for D005FA = ${hex(mem[MATCH_FA_ADDR & MEM_MASK], 2)}`);
  console.log(`    ${hex(MATCH_F9_ADDR)}  key byte for D005F9 = ${hex(mem[MATCH_F9_ADDR & MEM_MASK], 2)}  <- HL restored here before payload walk`);
  console.log(`    ${hex(PAYLOAD_B_ADDR)}  payload byte loaded into B = ${hex(mem[PAYLOAD_B_ADDR & MEM_MASK], 2)}`);
  console.log(`    ${hex(PAYLOAD_D_ADDR)}  payload byte loaded into D = ${hex(mem[PAYLOAD_D_ADDR & MEM_MASK], 2)}`);
  console.log(`    ${hex(PAYLOAD_E_ADDR)}  payload byte loaded into E = ${hex(mem[PAYLOAD_E_ADDR & MEM_MASK], 2)}`);
  console.log(`    ${hex(ENTRY_START + 6)}  padding = ${hex(mem[(ENTRY_START + 6) & MEM_MASK], 2)}`);
  console.log(`    ${hex(ENTRY_START + 7)}  padding = ${hex(mem[(ENTRY_START + 7) & MEM_MASK], 2)}`);
  console.log(`    ${hex(RESULT_BYTE_ADDR)}  post-helper byte later copied to D005F8 = ${hex(mem[RESULT_BYTE_ADDR & MEM_MASK], 2)}`);
  console.log(`  If the intended 24-bit value is 0x058322, the bytes consumed by 0x08473F..0x084743 must be 05 83 22 (B,D,E), not 22 83 05.`);
}

function printDynamicTrace(trace, mem, cpu) {
  console.log('\nDynamic trace from 0x04C885');
  console.log(`  Termination: ${trace.result.termination}`);
  console.log(`  Steps: ${trace.result.steps}`);
  console.log(`  Last PC/mode: ${hex(trace.result.lastPc)} / ${trace.result.lastMode}`);
  console.log(`  Visited blocks: ${trace.visited.map((item) => `${hex(item.pc)}:${item.mode}#${item.step}`).join(' -> ')}`);
  console.log(`  Dynamic targets: ${trace.result.dynamicTargets.length ? trace.result.dynamicTargets.map((pc) => hex(pc)).join(', ') : 'none'}`);
  console.log(`  Missing blocks: ${trace.result.missingBlocks.length ? trace.result.missingBlocks.join(', ') : 'none'}`);
  console.log(`  Watched writes: ${trace.writes.length ? '' : 'none'}`);
  for (const event of trace.writes) {
    if (event.kind === 'write24') {
      console.log(`    ${event.kind} ${hex(event.addr)} <- ${hex(event.value)}`);
    } else {
      console.log(`    ${event.kind} ${hex(event.addr)} <- ${hex(event.value, 2)}`);
    }
  }
  console.log(`  Final A=${hex(cpu.a, 2)} B=${hex(cpu.b, 2)} DE=${hex(cpu.de)} HL=${hex(cpu.hl)} SP=${hex(cpu.sp)}`);
  console.log(`  D02AD7 scratch after helper: ${hex(read24(mem, D02AD7))}`);
  console.log(`  D005F8 after helper: ${hex(mem[D005F8 & MEM_MASK], 2)} (should remain seeded value 0xAA)`);
  console.log(`  D02590/D0259A/D0259D after helper: ${hex(read24(mem, D02590))} / ${hex(read24(mem, D0259A))} / ${hex(read24(mem, D0259D))}`);
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const helperDisasm = decodeWindow(rom, 0x04C885, 0x40);
    const callerDisasm = decodeWindow(rom, 0x08472C, 0x40);
    const preludeDisasm = decodeWindow(rom, 0x0846F2, 0x20);

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    coldBoot(executor, cpu, mem);
    seedScenario(mem, cpu);
    printEntryLayout(mem);

    console.log('Phase 278 - 0x04C885 match helper trace');
    printDisasm('Selector prelude (0x0846F2, shows D0259A is only used for key 0x24)', preludeDisasm);
    printDisasm('Match tail caller context (0x08472C)', callerDisasm);
    printDisasm('Static disassembly of 0x04C885', helperDisasm);
    summarizeHelper(helperDisasm);

    const writes = installWriteWatch(cpu);
    const visited = [];
    const result = executor.runFrom(0x04C885, 'adl', {
      maxSteps: 100,
      maxLoopIterations: 100,
      onBlock(pc, mode, _meta, step) {
        visited.push({ pc, mode, step: step + 1 });
      },
    });

    printDynamicTrace({ result, writes, visited }, mem, cpu);

    console.log('\nConclusion');
    console.log('  0x04C885 is not a dispatch stub and never jumps to a handler address.');
    console.log('  It widens the caller-provided byte tuple B:D:E into a 24-bit value by writing it through 0xD02AD7..0xD02AD9 and reloading DE.');
    console.log('  The write to D005F8 happens later in the caller at 0x08474B/0x08474C, and the D0259x pointer cluster is not touched by 0x04C885.');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
