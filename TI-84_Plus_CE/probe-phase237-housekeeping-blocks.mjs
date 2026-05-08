#!/usr/bin/env node

/**
 * Phase 237: Investigate housekeeping loop blocks 0x03030E, 0x04C979, 0x03034F, 0x02FE73
 *
 * The event loop self-loop path (decoded in session 236) is:
 *   0x02FD99 -> 0x02FDA6 -> 0x03013A(key scan) -> 0x05C76C -> 0x03FA09(key delivery)
 *   -> 0x02FDC2 -> housekeeping -> 0x03030E -> 0x03034F -> 0x02FE73 -> 0x02FD99
 *
 * This probe investigates what each housekeeping block does:
 *   - 0x03030E: first housekeeping entry
 *   - 0x04C979: possibly called from 0x03030E
 *   - 0x03034F: second housekeeping block
 *   - 0x02FE73: final jump back to 0x02FD99
 *
 * For each block:
 *   1. Disassemble the first ~16 bytes from ROM.rom
 *   2. Trace execution from that block, recording unique blocks visited (max 200 steps)
 *   3. Capture key RAM reads/writes: IY flags, D00824, VRAM area, timers, cursor state
 *   4. Determine purpose (cursor blink, display refresh, battery check, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus as fallbackCreatePeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const {
  createCPU: runtimeCreateCPU,
  createMemoryBus: runtimeCreateMemoryBus,
  createPeripheralBus: runtimeCreatePeripheralBus,
  createExecutor,
} = cpuRuntime;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const transpiledModule = await import('./ROM.transpiled.js');
const BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  null;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const rom = fs.readFileSync(ROM_PATH);

// --- Constants ---

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const MAX_STEPS = 200;

const HOUSEKEEPING_BLOCKS = [
  { addr: 0x03030E, name: 'housekeeping entry' },
  { addr: 0x04C979, name: 'housekeeping sub (04C979)' },
  { addr: 0x03034F, name: 'housekeeping block 2' },
  { addr: 0x02FE73, name: 'loop-back to 02FD99' },
];

const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;

// Key RAM addresses to watch
const WATCHED_RAM = [
  { addr: 0xD00000, name: 'D00000 (cursor type)' },
  { addr: 0xD00080, name: 'IY+0 (flags byte 0)' },
  { addr: 0xD00081, name: 'IY+1 (flags byte 1)' },
  { addr: 0xD00082, name: 'IY+2 (flags byte 2)' },
  { addr: 0xD00085, name: 'IY+5 (flags byte 5)' },
  { addr: 0xD00092, name: 'IY+18 (flags byte 18)' },
  { addr: 0xD0009D, name: 'IY+29 (flags byte 29)' },
  { addr: 0xD000A8, name: 'IY+40 (flags byte 40)' },
  { addr: 0xD000B4, name: 'IY+52 (flags byte 52)' },
  { addr: 0xD000D7, name: 'IY+87 (flags byte 87)' },
  { addr: 0xD0058D, name: 'D0058D (key state)' },
  { addr: 0xD0058E, name: 'D0058E (key code)' },
  { addr: 0xD0059F, name: 'D0059F (key modifier)' },
  { addr: 0xD007E0, name: 'D007E0 (cursor col)' },
  { addr: 0xD007E2, name: 'D007E2 (cursor row)' },
  { addr: 0xD00824, name: 'D00824 (mode byte)' },
  { addr: 0xD00825, name: 'D00825 (mode byte +1)' },
  { addr: 0xD40000, name: 'D40000 (VRAM base)' },
  { addr: 0xD40001, name: 'D40001 (VRAM base+1)' },
  { addr: 0xF20000, name: 'F20000 (LCD ctrl base)' },
  { addr: 0xF20010, name: 'F20010 (LCD timing)' },
];

const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 8, 18, 29, 34, 40, 52, 87];

const DISASM_BYTES = 24; // disassemble first ~24 bytes at each block

// --- Helpers ---

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function blockMethodName(addr, mode = 'adl') {
  return `block_${(addr >>> 0).toString(16).padStart(6, '0')}_${mode === 'adl' ? 1 : 0}`;
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8) | (mem[(a + 2) & MEM_MASK] << 16);
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-indexed-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg16-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg16-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg16':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.src).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.dest).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.dest).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.dest).toUpperCase()}`;
    case 'inc-reg16':
      return `INC ${String(inst.dest).toUpperCase()}`;
    case 'dec-reg16':
      return `DEC ${String(inst.dest).toUpperCase()}`;
    case 'cp-imm':
      return `CP ${hexByte(inst.value)}`;
    case 'or-reg':
      return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg':
      return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg':
      return `XOR ${String(inst.src).toUpperCase()}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'ex':
      return `EX ${String(inst.a).toUpperCase()}, ${String(inst.b).toUpperCase()}`;
    case 'out':
      return `OUT (${hexByte(inst.port)}), ${String(inst.src).toUpperCase()}`;
    case 'in':
      return `IN ${String(inst.dest).toUpperCase()}, (${hexByte(inst.port)})`;
    default:
      return inst.tag;
  }
}

function decodeAt(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = inst.length || 1;
    const bytes = Array.from(rom.subarray(pc, pc + len), b => hexByte(b)).join(' ');
    return {
      pc,
      bytes,
      text: formatInstruction(inst),
      length: len,
    };
  } catch {
    return {
      pc,
      bytes: hexByte(rom[pc]),
      text: `DB ${hexByte(rom[pc])}`,
      length: 1,
    };
  }
}

// --- Runtime setup ---

function createPeripheralBusCompat(options) {
  if (typeof runtimeCreatePeripheralBus === 'function') {
    return runtimeCreatePeripheralBus(options);
  }
  return fallbackCreatePeripheralBus(options);
}

function createMemoryBusCompat(romBytes, peripherals) {
  if (typeof runtimeCreateMemoryBus === 'function') {
    const created = runtimeCreateMemoryBus(romBytes, peripherals);
    if (ArrayBuffer.isView(created) && typeof created.set === 'function') {
      return created;
    }
  }
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function createCpuCompat(mem, peripherals) {
  if (typeof runtimeCreateCPU === 'function') {
    const created = runtimeCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor?.compiledBlocks) {
      return { cpu: created.cpu, executor: created.executor };
    }
  }
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const peripherals = createPeripheralBusCompat({ timerInterrupt: false });
  const mem = createMemoryBusCompat(rom, peripherals);
  const { cpu, executor } = createCpuCompat(mem, peripherals);
  return { peripherals, mem, cpu, executor };
}

function installStepShim(cpu, executor, mem) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const method = blockMethodName(pc, mode);

    if (typeof this[method] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[method] = fn;
      }
    }

    const fn = this[method];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      this.pc = result & 0xFFFFFF;
    }

    return result;
  };
}

// --- Disassembly ---

function disassembleBlock(addr, label) {
  console.log(`--- Disassembly: ${hex(addr)} (${label}) ---`);
  let pc = addr;
  const end = addr + DISASM_BYTES;
  while (pc < end && pc < rom.length) {
    const row = decodeAt(pc);
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
    pc += row.length;
    // Stop at unconditional JP/RET to keep output clean
    if (row.text.startsWith('JP 0x') || row.text === 'RET') break;
  }
  console.log('');
}

// --- Trace engine ---

function snapshotWatchedRam(mem) {
  const snap = {};
  for (const w of WATCHED_RAM) {
    snap[w.addr] = mem[w.addr & MEM_MASK];
  }
  return snap;
}

function snapshotIyFlags(mem, iyBase) {
  const snap = {};
  for (const offset of IY_OFFSETS) {
    snap[offset] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snap;
}

function diffSnapshots(before, after, labels) {
  const changes = [];
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      const label = labels?.[key] || `addr ${hex(Number(key))}`;
      changes.push({
        key,
        label,
        before: before[key],
        after: after[key],
      });
    }
  }
  return changes;
}

function traceFromBlock(entryAddr, label) {
  console.log(`========================================================================`);
  console.log(`TRACE: ${hex(entryAddr)} (${label})`);
  console.log(`========================================================================`);

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  installStepShim(cpu, executor, mem);

  // CPU init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryAddr;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  // Snapshot RAM before
  const ramBefore = snapshotWatchedRam(mem);
  const iyBefore = snapshotIyFlags(mem, cpu.iy);

  // Trace
  const visited = [];
  const visitedSet = new Set();
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = entryAddr;

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const pc = cpu.pc & 0xFFFFFF;
      visited.push(pc);
      visitedSet.add(pc);
      stopPc = pc;
      steps = i + 1;

      // Stop conditions
      if (pc === RETURN_SENTINEL) {
        stopReason = 'return_sentinel';
        break;
      }
      if (pc === 0x02FD99 && i > 0) {
        stopReason = 'reached_02FD99 (loop back)';
        break;
      }
      if (pc === 0x02FD8F && i > 0) {
        stopReason = 'reached_02FD8F (dispatcher)';
        break;
      }

      cpu.step();
    }
  } catch (err) {
    stopReason = `error: ${err?.message ?? String(err)}`;
  }

  // Snapshot RAM after
  const ramAfter = snapshotWatchedRam(mem);
  const iyAfter = snapshotIyFlags(mem, cpu.iy);

  // Build RAM labels map
  const ramLabels = {};
  for (const w of WATCHED_RAM) {
    ramLabels[w.addr] = w.name;
  }

  const ramChanges = diffSnapshots(ramBefore, ramAfter, ramLabels);
  const iyLabels = {};
  for (const offset of IY_OFFSETS) {
    iyLabels[offset] = `IY+${offset}`;
  }
  const iyChanges = diffSnapshots(iyBefore, iyAfter, iyLabels);

  // Print results
  console.log(`Stop reason: ${stopReason}`);
  console.log(`Stop PC:     ${hex(stopPc)}`);
  console.log(`Steps:       ${steps}`);
  console.log(`Unique blocks: ${visitedSet.size}`);
  console.log(`Final regs: A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} BC=${hex(cpu.bc)} DE=${hex(cpu.de)} HL=${hex(cpu.hl)}`);
  console.log(`            SP=${hex(cpu.sp)} IY=${hex(cpu.iy)} IX=${hex(cpu.ix)}`);
  console.log('');

  // Block chain (abbreviated if long)
  if (visited.length <= 30) {
    console.log(`Block chain: ${visited.map(pc => hex(pc)).join(' -> ')}`);
  } else {
    const first15 = visited.slice(0, 15).map(pc => hex(pc)).join(' -> ');
    const last10 = visited.slice(-10).map(pc => hex(pc)).join(' -> ');
    console.log(`Block chain (first 15): ${first15}`);
    console.log(`Block chain (last 10):  ${last10}`);
  }
  console.log('');

  // RAM changes
  if (ramChanges.length > 0) {
    console.log('RAM changes:');
    for (const c of ramChanges) {
      console.log(`  ${c.label}: ${hexByte(c.before)} -> ${hexByte(c.after)}`);
    }
  } else {
    console.log('RAM changes: (none in watched locations)');
  }

  // IY flag changes
  if (iyChanges.length > 0) {
    console.log('IY flag changes:');
    for (const c of iyChanges) {
      console.log(`  ${c.label}: ${hexByte(c.before)} -> ${hexByte(c.after)}`);
    }
  } else {
    console.log('IY flag changes: (none in watched offsets)');
  }
  console.log('');

  // Look for VRAM writes (check a few bytes in VRAM region)
  let vramWrites = 0;
  for (let i = 0xD40000; i < 0xD40100; i++) {
    if (mem[i] !== rom[i] && mem[i] !== 0) {
      vramWrites++;
    }
  }
  console.log(`VRAM writes (D40000-D400FF): ${vramWrites > 0 ? vramWrites + ' bytes modified' : 'none detected'}`);

  // Check port I/O in the block chain — look for known blocks that do port access
  const portBlocks = [];
  for (const pc of visitedSet) {
    // Check if any visited block is in the LCD controller region (F20000+)
    // or known timer/port addresses
    if ((pc & 0xFF0000) === 0xF20000) {
      portBlocks.push(pc);
    }
  }
  if (portBlocks.length > 0) {
    console.log(`Port/MMIO blocks visited: ${portBlocks.map(pc => hex(pc)).join(', ')}`);
  }
  console.log('');

  return {
    entryAddr,
    label,
    stopReason,
    stopPc,
    steps,
    visited,
    visitedSet,
    ramChanges,
    iyChanges,
    vramWrites,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
  };
}

// --- Purpose classifier ---

function classifyPurpose(result, disasmLines) {
  const { ramChanges, iyChanges, visitedSet, vramWrites } = result;

  const clues = [];

  // Check if it touches cursor-related RAM
  const cursorAddrs = [0xD007E0, 0xD007E2, 0xD00000];
  const touchesCursor = ramChanges.some(c => cursorAddrs.includes(Number(c.key)));
  if (touchesCursor) clues.push('CURSOR (touches cursor col/row/type RAM)');

  // Check if it touches VRAM
  if (vramWrites > 0) clues.push('DISPLAY REFRESH (writes to VRAM)');

  // Check if it touches mode byte
  const touchesMode = ramChanges.some(c => Number(c.key) === 0xD00824);
  if (touchesMode) clues.push('MODE UPDATE (writes D00824)');

  // Check IY flag changes — bit operations on IY+29 are common for key state
  const touchesIy29 = iyChanges.some(c => Number(c.key) === 29);
  if (touchesIy29) clues.push('KEY STATE FLAG (modifies IY+29)');

  // Check IY+40 — RES 3,(IY+40) is a known housekeeping operation
  const touchesIy40 = iyChanges.some(c => Number(c.key) === 40);
  if (touchesIy40) clues.push('HOUSEKEEPING FLAG (modifies IY+40)');

  // Check if it visits known addresses
  if (visitedSet.has(0x03FA09)) clues.push('CALLS key delivery (0x03FA09)');
  if (visitedSet.has(0x03013A)) clues.push('CALLS key scan (0x03013A)');
  if (visitedSet.has(0x02390A)) clues.push('CALLS RES helper (0x02390A)');

  // Check if it's a simple jump-through
  if (result.steps <= 3 && result.stopReason.includes('02FD99')) {
    clues.push('SIMPLE JUMP-THROUGH (direct path back to event loop)');
  }

  // Check for timer-related blocks
  if (visitedSet.has(0x030300)) clues.push('TIMER HELPER (calls 0x030300)');

  // Check for battery/power blocks (typically in 04xxxx-05xxxx)
  const highBlocks = [...visitedSet].filter(pc => pc >= 0x040000 && pc < 0x060000);
  if (highBlocks.length > 2) clues.push(`OS SUBSYSTEM (visits ${highBlocks.length} blocks in 04-05xxxx)`);

  return clues.length > 0 ? clues : ['UNKNOWN PURPOSE'];
}

// --- Main ---

async function main() {
  console.log('Phase 237: Housekeeping Loop Blocks Investigation');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
  console.log(`Blocks loaded from ROM.transpiled.js`);
  console.log(`Timer interrupt: disabled`);
  console.log(`Max steps per trace: ${MAX_STEPS}`);
  console.log('');

  // Part 1: Static disassembly of each housekeeping block
  console.log('========================================================================');
  console.log('PART 1: Static Disassembly');
  console.log('========================================================================');
  console.log('');

  for (const block of HOUSEKEEPING_BLOCKS) {
    disassembleBlock(block.addr, block.name);
  }

  // Also disassemble context blocks
  disassembleBlock(0x02FDC2, 'OR A gate (housekeeping entry context)');
  disassembleBlock(0x02FD99, 'event loop re-entry (destination of 0x02FE73)');

  // Part 2: Dynamic trace from each block
  console.log('========================================================================');
  console.log('PART 2: Dynamic Traces');
  console.log('========================================================================');
  console.log('');

  const results = [];
  for (const block of HOUSEKEEPING_BLOCKS) {
    const result = traceFromBlock(block.addr, block.name);
    results.push(result);
  }

  // Part 3: Purpose classification
  console.log('========================================================================');
  console.log('PART 3: Purpose Classification');
  console.log('========================================================================');
  console.log('');

  for (const result of results) {
    const clues = classifyPurpose(result);
    console.log(`${hex(result.entryAddr)} (${result.label}):`);
    for (const clue of clues) {
      console.log(`  -> ${clue}`);
    }
    console.log('');
  }

  // Part 4: Block relationship analysis
  console.log('========================================================================');
  console.log('PART 4: Block Relationships');
  console.log('========================================================================');
  console.log('');

  // Check which housekeeping blocks appear in each other's traces
  for (const result of results) {
    const otherHousekeeping = HOUSEKEEPING_BLOCKS
      .filter(b => b.addr !== result.entryAddr)
      .filter(b => result.visitedSet.has(b.addr));

    if (otherHousekeeping.length > 0) {
      console.log(`${hex(result.entryAddr)} visits other housekeeping blocks:`);
      for (const other of otherHousekeeping) {
        console.log(`  -> ${hex(other.addr)} (${other.name})`);
      }
    } else {
      console.log(`${hex(result.entryAddr)}: does NOT visit other housekeeping blocks`);
    }
  }
  console.log('');

  // Part 5: Summary
  console.log('========================================================================');
  console.log('SUMMARY');
  console.log('========================================================================');
  console.log('');
  console.log('Housekeeping path: 0x03030E -> 0x04C979? -> 0x03034F -> 0x02FE73 -> 0x02FD99');
  console.log('');

  for (const result of results) {
    const clues = classifyPurpose(result);
    console.log(`  ${hex(result.entryAddr)}: ${result.steps} steps, stopped at ${hex(result.stopPc)} (${result.stopReason})`);
    console.log(`    Purpose: ${clues.join('; ')}`);
    console.log(`    RAM changes: ${result.ramChanges.length}`);
    console.log(`    IY changes: ${result.iyChanges.length}`);
  }
  console.log('');
  console.log('DONE');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
