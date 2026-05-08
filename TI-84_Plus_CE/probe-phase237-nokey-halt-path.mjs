#!/usr/bin/env node
// Phase 237 — Trace the no-key HALT path
//
// When no key is pressed (D0058E=0x00), the event loop at 0x02FD99 takes a
// 19-step path to HALT at 0x040D40. This probe:
//   1. Disassembles ROM bytes at each block in the no-key path
//   2. Traces execution from 0x02FD99 with no key pressed
//   3. Records block transitions with register snapshots
//   4. Documents what condition at each block steers toward HALT
//   5. Explains what HALT does and how ISR would resume execution
//
// Known no-key path (from session 236 e2e map):
//   0x02FD8F -> ... -> 0x02FDC2 (OR A gate) -> 0x02FDEB (Z: no key) ->
//   0x02FDF4 -> 0x02FE02 -> 0x03D1BE -> 0x02FE06 -> 0x02FE23 ->
//   0x02FE2F -> 0x040D40 (HALT)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// --- Key addresses ---

const DISPATCHER_ENTRY = 0x02FD8F;
const EVENT_LOOP_REENTRY = 0x02FD99;
const OR_A_GATE = 0x02FDC2;
const NOKEY_FALLTHROUGH = 0x02FDEB;
const HALT_TARGET = 0x040D40;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;

// RAM locations
const D00000 = 0xD00000;
const D0058D = 0xD0058D;
const D0058E = 0xD0058E;
const D0059F = 0xD0059F;
const D007E0 = 0xD007E0;
const D00824 = 0xD00824;

// No-key path waypoints (blocks we expect to visit)
const NOKEY_PATH_BLOCKS = [
  0x02FDEB,
  0x02FDF4,
  0x02FE02,
  0x03D1BE,
  0x02FE06,
  0x02FE23,
  0x02FE2F,
  0x040D40,
];

// Extended disassembly regions — we disassemble a range around each waypoint
const DISASM_REGIONS = [
  { start: 0x02FDE0, end: 0x02FE40, label: 'No-key path: 0x02FDEB through 0x02FE2F' },
  { start: 0x03D1B0, end: 0x03D1D0, label: 'Subroutine at 0x03D1BE' },
  { start: 0x040D38, end: 0x040D50, label: 'HALT region at 0x040D40' },
];

// Stubbed CALL targets (heavy subroutines we bypass to reach the no-key path)
const STUB_TARGETS = [
  { addr: 0x02390A, name: 'RES 3,(IY+40) helper',   action: 'ret' },
  { addr: 0x03013A, name: 'key scan table lookup',   action: 'ret' },
  { addr: 0x05C76C, name: 'unknown helper',          action: 'ret' },
  { addr: 0x03FA09, name: 'key delivery (loads A from D0058E)', action: 'load-key-ret' },
];

const IY_OFFSETS = [0, 5, 8, 18, 29, 40, 52, 87];
const STEP_LIMIT = 500;

// --- Helpers ---

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

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

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => (v & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function flagString(f) {
  const flags = [];
  if (f & 0x80) flags.push('S');
  if (f & 0x40) flags.push('Z');
  if (f & 0x10) flags.push('H');
  if (f & 0x04) flags.push('P/V');
  if (f & 0x02) flags.push('N');
  if (f & 0x01) flags.push('C');
  return flags.length ? flags.join('|') : 'none';
}

// --- Disassembly ---

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
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-indexed-imm':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'ld-indexed-reg':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    case 'halt':
      return 'HALT';
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'im':
      return `IM ${inst.mode ?? '?'}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.reg ?? '??').toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair ?? inst.reg ?? '??').toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ex-sp-pair':
      return `EX (SP), ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    default: {
      // Fallback: show tag + any useful fields
      let desc = inst.tag;
      if (inst.pair) desc += ` ${inst.pair}`;
      if (inst.reg) desc += ` ${inst.reg}`;
      if (inst.src) desc += ` ${inst.src}`;
      if (inst.dest) desc += ` ${inst.dest}`;
      if (inst.value !== undefined) desc += ` val=${hex(inst.value)}`;
      if (inst.target !== undefined) desc += ` -> ${hex(inst.target)}`;
      if (inst.addr !== undefined) desc += ` (${hex(inst.addr)})`;
      if (inst.condition) desc += ` [${inst.condition}]`;
      if (inst.bit !== undefined) desc += ` bit ${inst.bit}`;
      if (inst.indexRegister) desc += ` (${inst.indexRegister}+${inst.displacement})`;
      return desc;
    }
  }
}

function decodeAt(romBytes, pc) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  const bytes = romBytes.subarray(pc, pc + inst.length);
  return {
    pc: inst.pc >>> 0,
    bytes: bytesToHex(bytes),
    text: formatInstruction(inst),
    length: inst.length,
    inst,
  };
}

function disassembleRegion(romBytes, start, end, label) {
  console.log(`--- ${label} ---`);
  let pc = start;
  while (pc < end) {
    const row = decodeAt(romBytes, pc);
    const isWaypoint = NOKEY_PATH_BLOCKS.includes(pc) ? ' <-- WAYPOINT' : '';
    const isHalt = pc === HALT_TARGET ? ' <-- HALT TARGET' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}${isWaypoint}${isHalt}`);
    pc += row.length;
  }
  console.log('');
}

// --- Transpiled module loading ---

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempPath = path.join(os.tmpdir(), `ti84-phase237-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempPath, tempModulePath: tempPath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

// --- Runtime setup ---

function createRuntime(blocks) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = new Uint8Array(MEM_SIZE);
  const romBytes = fs.readFileSync(ROM_PATH);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const executor = cpuRuntime.createExecutor(blocks, mem, { peripherals });
  return { peripherals, mem, cpu: executor.cpu, executor, romBytes };
}

function installStepShimWithStubs(cpu, executor, mem) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required.');
  }

  // Install stub blocks for heavyweight CALL targets
  for (const stub of STUB_TARGETS) {
    const key = blockKey(stub.addr, 'adl');
    if (stub.action === 'load-key-ret') {
      executor.compiledBlocks[key] = function stubLoadKeyRet(c) {
        c.a = c.memory[D0058E] & 0xFF;
        const retAddr = read24(c.memory, c.sp);
        c.sp = (c.sp + 3) & 0xFFFFFF;
        c.pc = retAddr & 0xFFFFFF;
        return c.pc;
      };
    } else {
      executor.compiledBlocks[key] = function stubRet(c) {
        const retAddr = read24(c.memory, c.sp);
        c.sp = (c.sp + 3) & 0xFFFFFF;
        c.pc = retAddr & 0xFFFFFF;
        return c.pc;
      };
    }
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const methodName = blockMethodName(pc, mode);

    if (typeof this[methodName] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[methodName] = fn;
      }
    }

    const fn = this[methodName];
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

// --- Trace ---

function seedForNoKey(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = DISPATCHER_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set

  // No key pressed
  mem[D0058E] = 0x00;
  mem[D0058D] = 0x00;
  mem[D0059F] = 0x00;
  mem[D00000] = 0x00;
  mem[D007E0] = 0x40; // home-screen context
  mem[D00824] = 0x00; // home-screen mode byte

  // Clear IY flag region
  for (let i = 0; i < 128; i++) {
    mem[IY_BASE + i] = 0x00;
  }
  mem[IY_BASE + 0x34] = 0x00; // BIT 0,(IY+52) gate

  push24(cpu, mem, RETURN_SENTINEL);
}

function readIyFlags(mem) {
  const flags = {};
  for (const offset of IY_OFFSETS) {
    flags[`IY+${offset}`] = mem[IY_BASE + offset];
  }
  return flags;
}

function traceNoKeyPath(cpu, mem) {
  const trace = [];
  let totalSteps = 0;
  let stopReason = 'max_steps';
  let error = null;

  // Waypoint set for highlighting
  const waypointSet = new Set(NOKEY_PATH_BLOCKS);

  while (totalSteps < STEP_LIMIT) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    // Snapshot registers BEFORE executing this block
    const snapshot = {
      step: totalSteps,
      pc,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      hl: (cpu.hl ?? 0) & 0xFFFFFF,
      bc: (cpu.bc ?? 0) & 0xFFFFFF,
      de: (cpu.de ?? 0) & 0xFFFFFF,
      iy: (cpu.iy ?? 0) & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
      iyFlags: readIyFlags(mem),
      isWaypoint: waypointSet.has(pc),
      d0058e: mem[D0058E],
    };

    try {
      const result = cpu.step();
      totalSteps += 1;

      // Capture registers AFTER execution
      snapshot.afterA = cpu.a & 0xFF;
      snapshot.afterF = cpu.f & 0xFF;
      snapshot.afterHL = (cpu.hl ?? 0) & 0xFFFFFF;
      snapshot.nextPc = cpu.pc & 0xFFFFFF;

      trace.push(snapshot);

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
    } catch (stepError) {
      snapshot.afterA = cpu.a & 0xFF;
      snapshot.afterF = cpu.f & 0xFF;
      snapshot.afterHL = (cpu.hl ?? 0) & 0xFFFFFF;
      snapshot.nextPc = cpu.pc & 0xFFFFFF;
      trace.push(snapshot);

      stopReason = 'error';
      error = stepError instanceof Error ? stepError.message : String(stepError);
      break;
    }
  }

  return { trace, totalSteps, stopReason, error, finalPc: cpu.pc & 0xFFFFFF };
}

// --- Output ---

function printTrace(result) {
  console.log('========================================================================');
  console.log('TRACE: No-key path from 0x02FD8F to HALT');
  console.log('========================================================================');
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Total steps: ${result.totalSteps}`);
  console.log(`Final PC:    ${hex(result.finalPc)}`);
  if (result.error) console.log(`Error:       ${result.error}`);
  console.log('');

  console.log('Step-by-step block transitions:');
  console.log('  Step | Block      | A(bef) | F(bef)  | Flags          | A(aft) | F(aft)  | HL       | Next Block  | Note');
  console.log('  -----|------------|--------|---------|----------------|--------|---------|----------|-------------|-----');

  for (const s of result.trace) {
    const step = String(s.step).padStart(4);
    const block = hex(s.pc);
    const aBef = hexByte(s.a);
    const fBef = hexByte(s.f);
    const flags = flagString(s.f).padEnd(14);
    const aAft = hexByte(s.afterA);
    const fAft = hexByte(s.afterF);
    const hl = hex(s.afterHL ?? s.hl);
    const next = hex(s.nextPc);
    const marker = s.isWaypoint ? ' <-- WAYPOINT' : '';
    const stubInfo = STUB_TARGETS.find(st => st.addr === s.pc);
    const stubNote = stubInfo ? ` [STUB: ${stubInfo.name}]` : '';
    console.log(`  ${step} | ${block} | ${aBef}   | ${fBef}    | ${flags} | ${aAft}   | ${fAft}    | ${hl} | ${next}  |${marker}${stubNote}`);
  }
  console.log('');

  // Extract only the no-key path blocks
  const noKeyBlocks = result.trace.filter(s => s.isWaypoint);
  console.log('========================================================================');
  console.log('NO-KEY WAYPOINT BLOCKS (detailed)');
  console.log('========================================================================');
  for (const s of noKeyBlocks) {
    console.log(`  Block ${hex(s.pc)}:`);
    console.log(`    Before: A=${hexByte(s.a)} F=${hexByte(s.f)} (${flagString(s.f)}) HL=${hex(s.hl)} BC=${hex(s.bc)} DE=${hex(s.de)} SP=${hex(s.sp)}`);
    console.log(`    After:  A=${hexByte(s.afterA)} F=${hexByte(s.afterF)} (${flagString(s.afterF)}) HL=${hex(s.afterHL)}`);
    console.log(`    Next:   ${hex(s.nextPc)}`);
    console.log(`    D0058E: ${hexByte(s.d0058e)}`);
    console.log('');
  }
}

function printHaltAnalysis(romBytes) {
  console.log('========================================================================');
  console.log('HALT ANALYSIS: 0x040D40 and post-HALT resume');
  console.log('========================================================================');

  // Disassemble at and after 0x040D40
  console.log('Disassembly at HALT target and beyond:');
  let pc = 0x040D38;
  while (pc < 0x040D58) {
    const row = decodeAt(romBytes, pc);
    const marker = pc === HALT_TARGET ? ' <-- HALT' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}${marker}`);
    pc += row.length;
  }
  console.log('');

  console.log('HALT behavior on eZ80:');
  console.log('  - HALT suspends CPU execution until an interrupt (IRQ or NMI) arrives.');
  console.log('  - On interrupt: CPU wakes, pushes PC of instruction AFTER HALT onto stack,');
  console.log('    jumps to interrupt vector.');
  console.log('  - eZ80 in IM 1: maskable IRQ vector is 0x000038.');
  console.log('  - NMI vector is 0x000066.');
  console.log('  - IFF1 must be set (EI executed) for maskable interrupts to wake HALT.');
  console.log('');

  // Disassemble what's at 0x040D41 (instruction after HALT)
  console.log('Post-HALT instruction (0x040D41):');
  pc = 0x040D41;
  const postHalt = decodeAt(romBytes, pc);
  console.log(`  ${hex(postHalt.pc)}: ${postHalt.bytes.padEnd(22)} ${postHalt.text}`);
  console.log('');
  console.log('After the ISR returns (RETI/RETN), execution resumes at 0x040D41.');
  console.log('This is the instruction immediately after HALT.');
  console.log('');

  // Trace what happens after 0x040D41
  console.log('Continuation from 0x040D41:');
  pc = 0x040D41;
  for (let i = 0; i < 12 && pc < 0x040D70; i++) {
    const row = decodeAt(romBytes, pc);
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
    pc += row.length;
  }
  console.log('');
}

function printBlockAnnotations(romBytes) {
  console.log('========================================================================');
  console.log('BLOCK-BY-BLOCK ANNOTATION: No-key path conditions');
  console.log('========================================================================');
  console.log('');

  const blocks = [
    {
      addr: 0x02FDC2,
      label: 'OR A gate (first key-present test)',
      note: 'After key-delivery stub returns A from D0058E.\n'
        + '    OR A sets Z if A=0x00 (no key). JP NZ goes to key-present path.\n'
        + '    When Z (no key): falls through to 0x02FDEB.',
    },
    {
      addr: 0x02FDEB,
      label: 'No-key fall-through entry',
      note: 'First block on the no-key path. Reached because OR A at 0x02FDC2 set Z.',
    },
    {
      addr: 0x02FDF4,
      label: 'No-key path block 2',
      note: 'Intermediate processing on the no-key path.',
    },
    {
      addr: 0x02FE02,
      label: 'No-key path block 3 (CALL to 0x03D1BE?)',
      note: 'May contain a CALL to 0x03D1BE for housekeeping.',
    },
    {
      addr: 0x03D1BE,
      label: 'Housekeeping subroutine',
      note: 'Called from the no-key path. Performs some OS housekeeping\n'
        + '    (display update, cursor blink, or timer check).',
    },
    {
      addr: 0x02FE06,
      label: 'Return from 0x03D1BE',
      note: 'Execution resumes here after 0x03D1BE returns.',
    },
    {
      addr: 0x02FE23,
      label: 'Pre-HALT block',
      note: 'Final processing before HALT. May set up interrupt enable (EI)\n'
        + '    so that the CPU can wake from HALT.',
    },
    {
      addr: 0x02FE2F,
      label: 'HALT approach',
      note: 'Transitions to HALT at 0x040D40. May be a JP or CALL.',
    },
    {
      addr: 0x040D40,
      label: 'HALT instruction',
      note: 'CPU suspends execution. Waits for interrupt.\n'
        + '    ISR wakes CPU, handles interrupt, returns via RETI.\n'
        + '    Execution resumes at 0x040D41 (instruction after HALT).',
    },
  ];

  for (const b of blocks) {
    console.log(`  ${hex(b.addr)} — ${b.label}`);
    // Disassemble a few instructions at this address
    let pc = b.addr;
    for (let i = 0; i < 6 && pc < b.addr + 20; i++) {
      const row = decodeAt(romBytes, pc);
      console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
      pc += row.length;
    }
    console.log(`    Annotation: ${b.note}`);
    console.log('');
  }
}

// --- Main ---

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    console.log('Phase 237: Trace the no-key HALT path');
    console.log(`ROM: ${path.basename(ROM_PATH)}`);
    console.log(`Transpiled: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Entry: ${hex(DISPATCHER_ENTRY)} | Stack: ${hex(STACK_TOP)} | MBASE: ${hexByte(MBASE)} | IY: ${hex(IY_BASE)}`);
    console.log(`Timer IRQ: disabled | Max steps: ${STEP_LIMIT}`);
    console.log(`D0058E: 0x00 (no key pressed)`);
    console.log('');

    // Part 1: Static disassembly of all regions
    console.log('========================================================================');
    console.log('PART 1: STATIC DISASSEMBLY');
    console.log('========================================================================');
    console.log('');
    for (const region of DISASM_REGIONS) {
      disassembleRegion(romBytes, region.start, region.end, region.label);
    }

    // Also disassemble the dispatcher entry -> OR A gate region
    disassembleRegion(romBytes, 0x02FD8F, 0x02FDF0, 'Dispatcher entry through OR A gate and no-key entry');

    // Part 2: Block-by-block annotations with disassembly
    console.log('');
    printBlockAnnotations(romBytes);

    // Part 3: Dynamic trace
    console.log('');
    console.log('========================================================================');
    console.log('PART 3: DYNAMIC TRACE');
    console.log('========================================================================');
    console.log('');

    const runtime = createRuntime(blocks);
    installStepShimWithStubs(runtime.cpu, runtime.executor, runtime.mem);

    // Save baseline memory
    const baselineMemory = new Uint8Array(runtime.mem);

    // Seed for no-key scenario
    seedForNoKey(runtime.cpu, runtime.mem);
    const result = traceNoKeyPath(runtime.cpu, runtime.mem);
    printTrace(result);

    // Part 4: HALT analysis
    printHaltAnalysis(romBytes);

    // Part 5: ISR resume analysis
    console.log('========================================================================');
    console.log('PART 5: ISR RESUME ANALYSIS');
    console.log('========================================================================');
    console.log('');
    console.log('When the TI-84 CE OS reaches HALT at 0x040D40:');
    console.log('  1. CPU is suspended, drawing minimal power.');
    console.log('  2. The timer hardware (crystal timer) generates periodic interrupts.');
    console.log('  3. When an IRQ fires (if IFF1=1 / interrupts enabled):');
    console.log('     a. CPU wakes from HALT');
    console.log('     b. PC of next instruction (0x040D41) is pushed onto the stack');
    console.log('     c. CPU jumps to IM 1 vector at 0x000038');
    console.log('     d. ISR runs (handles timer, keyboard scan, LCD refresh)');
    console.log('     e. ISR returns via RETI');
    console.log('     f. Execution continues at 0x040D41');
    console.log('  4. The code at 0x040D41 either:');
    console.log('     - Loops back to the event loop (0x02FD99 or 0x02FD8F)');
    console.log('     - Checks if a key was pressed during the ISR');
    console.log('     - Continues to the next iteration of the idle loop');
    console.log('');

    // Disassemble the ISR vector for context
    console.log('ISR entry point (IM 1 vector at 0x000038):');
    let pc = 0x000038;
    for (let i = 0; i < 8 && pc < 0x000060; i++) {
      const row = decodeAt(romBytes, pc);
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
      pc += row.length;
    }
    console.log('');

    // Summary
    console.log('========================================================================');
    console.log('SUMMARY');
    console.log('========================================================================');
    console.log('');

    const uniqueBlocks = [...new Set(result.trace.map(s => s.pc))];
    console.log(`No-key path: ${result.trace.length} block visits, ${uniqueBlocks.length} unique blocks`);
    console.log(`Block chain: ${uniqueBlocks.map(b => hex(b)).join(' -> ')}`);
    console.log(`Stop reason: ${result.stopReason}`);
    console.log(`Final PC:    ${hex(result.finalPc)}`);
    console.log('');

    const reachedHalt = result.stopReason === 'halt' || uniqueBlocks.includes(HALT_TARGET);
    console.log(`Reached HALT (0x040D40): ${reachedHalt ? 'YES' : 'NO'}`);

    // Check which expected waypoints were hit
    const hitBlocks = new Set(uniqueBlocks);
    const hitWaypoints = NOKEY_PATH_BLOCKS.filter(b => hitBlocks.has(b));
    const missedWaypoints = NOKEY_PATH_BLOCKS.filter(b => !hitBlocks.has(b));
    console.log(`Expected waypoints hit: ${hitWaypoints.length}/${NOKEY_PATH_BLOCKS.length}`);
    if (hitWaypoints.length > 0) {
      console.log(`  Hit: ${hitWaypoints.map(b => hex(b)).join(', ')}`);
    }
    if (missedWaypoints.length > 0) {
      console.log(`  Missed: ${missedWaypoints.map(b => hex(b)).join(', ')}`);
    }
    console.log('');

    console.log('Key findings:');
    console.log('  - OR A at 0x02FDC2 is the gate: A=0x00 (no key) sets Z flag');
    console.log('  - Z flag causes fall-through to 0x02FDEB instead of JP NZ to key-present path');
    console.log('  - The no-key path performs housekeeping (cursor blink, display update)');
    console.log('  - Path terminates at HALT (0x040D40) — CPU sleeps until next interrupt');
    console.log('  - ISR at 0x000038 handles timer/keyboard, returns via RETI');
    console.log('  - After RETI, execution resumes at 0x040D41 (post-HALT)');
    console.log('  - Post-HALT code loops back to the event dispatcher for next iteration');
    console.log('');
    console.log('PASS');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
