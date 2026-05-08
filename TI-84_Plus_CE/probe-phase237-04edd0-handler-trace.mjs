#!/usr/bin/env node

/**
 * Phase 237: Trace 0x04EDD0 — Key Code Action Handler
 *
 * Session 236 decoded function 0x04EB02 as a three-way key code classifier:
 *   CP 0x40 → JR Z 0x04EB13
 *   CP 0x1D → JR Z 0x04EB13
 *   CP 0x44 → fall-through to 0x04EB13
 * All three converge on CALL 0x04EDD0 → JR 0x04EAD8 (loop).
 *
 * 0x1D and 0x44 take identical downstream paths through 0x04EDD0
 * (61 unique blocks, stuck at 0x09EFDE computation loop).
 * Unrecognized keys return A=0x00 in 8 steps.
 *
 * This probe:
 *   1. Disassembles ROM around 0x04EDD0 to understand its structure
 *   2. Traces 0x04EDD0 with A=0x1D (synthetic key code), max 500 steps
 *   3. Traces 0x04EDD0 with A=0x44 (the "2" key code), compare paths
 *   4. Traces 0x04EDD0 with A=0x40 (another recognized key code), compare
 *   5. Captures key RAM reads/writes: IY flags, D00824, D0058E, D0059F,
 *      OP registers (0xD005F8..0xD00620)
 *   6. Identifies what 0x04EDD0 does: display writes? edit buffer? mode flags?
 */

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

const TARGET_ADDR = 0x04EDD0;
const DISASM_START = 0x04EDC0;
const DISASM_END = 0x04EE30;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;

// Key RAM addresses to watch
const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;
const D003E0_ADDR = 0xD003E0;
const D00824_ADDR = 0xD00824;
const D003DA_ADDR = 0xD003DA;
const D007E0_ADDR = 0xD007E0;
const D00000_ADDR = 0xD00000;

// OP register area (0xD005F8..0xD00620)
const OP_START = 0xD005F8;
const OP_END = 0xD00620;

// Downstream chain addresses for waypoint tracking
const DOWNSTREAM_WAYPOINTS = new Map([
  [0x04EDD0, 'ENTRY — 0x04EDD0 handler'],
  [0x04ECCE, 'CALL 0x04ECCE (first downstream)'],
  [0x07F984, 'CALL 0x07F984 (second downstream)'],
  [0x08BF22, 'CALL 0x08BF22 (third downstream)'],
  [0x09EFDE, '0x09EFDE computation loop (stuck point)'],
  [0x04EAD8, '0x04EAD8 loop return target'],
  [0x04EB02, '0x04EB02 classifier entry'],
  [0x04EB13, '0x04EB13 convergence point'],
  [0x04EDB1, '0x04EDB1 D00824←D003DA writer'],
  [0x04EF17, '0x04EF17 D00824←XOR A writer'],
]);

const STEP_LIMIT = 500;
const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 8, 18, 29, 40, 0x4B, 0x34, 87];

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

// ---------- Helpers ----------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
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
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.reg).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.reg).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'or-reg':
      return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg':
      return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg':
      return `XOR ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'cp-reg':
      return `CP ${String(inst.src).toUpperCase()}`;
    default: {
      let s = inst.tag;
      if (inst.target !== undefined) s += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` ${hexByte(inst.value)}`;
      if (inst.dest !== undefined) s += ` ${String(inst.dest).toUpperCase()}`;
      if (inst.src !== undefined) s += `,${String(inst.src).toUpperCase()}`;
      return s;
    }
  }
}

function decodeAt(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const len = inst.length || 1;
    const bytes = romBytes.subarray(pc, pc + len);
    return {
      pc: pc >>> 0,
      length: len,
      bytes: bytesToHex(bytes),
      text: formatInstruction(inst),
      inst,
    };
  } catch {
    return {
      pc: pc >>> 0,
      length: 1,
      bytes: hexByte(romBytes[pc]),
      text: '(decode error)',
      inst: null,
    };
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase237-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(mem, blocks, peripherals) {
  const executor = cpuRuntime.createExecutor(blocks, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function snapshotIyFlags(mem, iyBase) {
  const snapshot = {};
  for (const offset of IY_OFFSETS) {
    snapshot[`IY+${offset}`] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snapshot;
}

function formatIySnapshot(snapshot) {
  return IY_OFFSETS
    .map((offset) => `IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')}=${hexByte(snapshot[`IY+${offset}`])}`)
    .join(' ');
}

function diffIySnapshots(before, after) {
  const changes = [];
  for (const offset of IY_OFFSETS) {
    const key = `IY+${offset}`;
    if (before[key] !== after[key]) {
      changes.push(`IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')}:${hexByte(before[key])}->${hexByte(after[key])}`);
    }
  }
  return changes;
}

function snapshotOpRegs(mem) {
  const snapshot = {};
  for (let addr = OP_START; addr < OP_END; addr++) {
    snapshot[hex(addr)] = mem[addr & MEM_MASK];
  }
  return snapshot;
}

function diffOpRegs(before, after) {
  const changes = [];
  for (let addr = OP_START; addr < OP_END; addr++) {
    const key = hex(addr);
    if (before[key] !== after[key]) {
      changes.push(`${key}:${hexByte(before[key])}->${hexByte(after[key])}`);
    }
  }
  return changes;
}

function snapshotWatchedRAM(mem) {
  return {
    D0058E: mem[D0058E_ADDR],
    D0058D: mem[D0058D_ADDR],
    D0059F: mem[D0059F_ADDR],
    D003E0: mem[D003E0_ADDR],
    D00824: mem[D00824_ADDR],
    D003DA: mem[D003DA_ADDR],
    D007E0: mem[D007E0_ADDR],
    D00000: mem[D00000_ADDR],
  };
}

function diffWatchedRAM(before, after) {
  const changes = [];
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      changes.push(`${key}: ${hexByte(before[key])} -> ${hexByte(after[key])}`);
    }
  }
  return changes;
}

function makeStopError(reason, pc) {
  const error = new Error('__PHASE237_STOP__');
  error.phase237Stop = {
    reason,
    pc: pc & 0xFFFFFF,
  };
  return error;
}

// ---------- PART 1: Disassembly ----------

function printDisassembly(romBytes) {
  console.log('========================================================================');
  console.log('PART 1: Disassembly around 0x04EDD0');
  console.log('========================================================================');
  console.log('');

  let pc = DISASM_START;
  while (pc < DISASM_END) {
    const row = decodeAt(romBytes, pc);
    const marker = (pc === TARGET_ADDR) ? ' <-- ENTRY: 0x04EDD0 handler' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += row.length;
  }
  console.log('');
}

// ---------- PART 2: Dynamic traces ----------

function runTrace(blocks, romBytes, label, seedA, note) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = createMemoryBus(romBytes);
  const { cpu, executor } = createCPU(mem, blocks, peripherals);

  // Seed CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.f = 0x00;
  cpu.a = seedA & 0xFF;
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  // Seed RAM defaults (home screen state)
  mem[D0058E_ADDR] = 0x00;
  mem[D0058D_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D003E0_ADDR] = 0x00;
  mem[D00824_ADDR] = 0x00; // home-screen mode
  mem[D003DA_ADDR] = 0x00;
  mem[D007E0_ADDR] = 0x40; // home-screen context
  mem[D00000_ADDR] = 0x00;

  // Clear IY flag region
  for (let i = 0; i < 128; i++) {
    mem[(IY_BASE + i) & MEM_MASK] = 0x00;
  }

  // Snapshots before
  const iyBefore = snapshotIyFlags(mem, cpu.iy);
  const ramBefore = snapshotWatchedRAM(mem);
  const opBefore = snapshotOpRegs(mem);

  const visited = [];
  const waypointLog = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = TARGET_ADDR;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        // Log waypoints
        if (DOWNSTREAM_WAYPOINTS.has(currentPc)) {
          waypointLog.push({
            step: steps,
            pc: currentPc,
            a: cpu.a & 0xFF,
            note: DOWNSTREAM_WAYPOINTS.get(currentPc),
          });
        }

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
  } catch (error) {
    if (error?.phase237Stop) {
      stopReason = error.phase237Stop.reason;
      stopPc = error.phase237Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  const iyAfter = snapshotIyFlags(mem, cpu.iy);
  const ramAfter = snapshotWatchedRAM(mem);
  const opAfter = snapshotOpRegs(mem);

  // Deduplicate visited blocks
  const uniqueBlocks = [...new Set(visited)];

  return {
    label,
    note,
    seedA,
    steps,
    stopReason,
    stopPc,
    visited,
    uniqueBlocks,
    waypointLog,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
    ramBefore,
    ramAfter,
    ramChanges: diffWatchedRAM(ramBefore, ramAfter),
    iyBefore,
    iyAfter,
    iyChanges: diffIySnapshots(iyBefore, iyAfter),
    opChanges: diffOpRegs(opBefore, opAfter),
  };
}

function printTrace(result) {
  console.log('------------------------------------------------------------------------');
  console.log(`${result.label}: A=${hexByte(result.seedA)} (${result.note})`);
  console.log('------------------------------------------------------------------------');
  console.log(`Stop reason:   ${result.stopReason}`);
  console.log(`Stop PC:       ${hex(result.stopPc)}`);
  console.log(`Steps:         ${result.steps}`);
  console.log(`Final regs:    A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} HL=${hex(result.finalHL)} DE=${hex(result.finalDE)} BC=${hex(result.finalBC)}`);
  console.log(`Final SP:      ${hex(result.finalSP)}  IY=${hex(result.finalIY)}`);
  console.log('');

  // RAM watch
  console.log('  RAM watch:');
  for (const key of Object.keys(result.ramAfter)) {
    const before = result.ramBefore[key];
    const after = result.ramAfter[key];
    const changed = before !== after ? ` <-- CHANGED from ${hexByte(before)}` : '';
    console.log(`    ${key}: ${hexByte(after)}${changed}`);
  }
  console.log('');

  // RAM changes summary
  console.log(`  RAM changes:   ${result.ramChanges.length ? result.ramChanges.join(', ') : '(none in watched addresses)'}`);

  // IY flag changes
  console.log(`  IY before:     ${formatIySnapshot(result.iyBefore)}`);
  console.log(`  IY after:      ${formatIySnapshot(result.iyAfter)}`);
  console.log(`  IY changes:    ${result.iyChanges.length ? result.iyChanges.join('  ') : '(none in watched offsets)'}`);
  console.log('');

  // OP register changes
  if (result.opChanges.length > 0) {
    console.log(`  OP reg changes (D005F8..D00620):`);
    for (const change of result.opChanges) {
      console.log(`    ${change}`);
    }
  } else {
    console.log(`  OP reg changes: (none)`);
  }
  console.log('');

  // Waypoint log
  if (result.waypointLog.length > 0) {
    console.log(`  Waypoints hit (${result.waypointLog.length}):`);
    for (const wp of result.waypointLog) {
      console.log(`    Step ${String(wp.step).padStart(4)}: ${hex(wp.pc)} A=${hexByte(wp.a)} — ${wp.note}`);
    }
  } else {
    console.log('  Waypoints hit: (none)');
  }
  console.log('');

  // Block chain
  console.log(`  Unique blocks: ${result.uniqueBlocks.length}`);
  const blockStr = result.uniqueBlocks.map((pc) => hex(pc)).join(' -> ');
  // Wrap long block chains
  const MAX_LINE = 100;
  if (blockStr.length <= MAX_LINE) {
    console.log(`  Block chain:   ${blockStr}`);
  } else {
    console.log('  Block chain:');
    let line = '    ';
    for (let i = 0; i < result.uniqueBlocks.length; i++) {
      const token = hex(result.uniqueBlocks[i]);
      const sep = i > 0 ? ' -> ' : '';
      if (line.length + sep.length + token.length > MAX_LINE && line.trim()) {
        console.log(line);
        line = '      ' + token;
      } else {
        line += sep + token;
      }
    }
    if (line.trim()) console.log(line);
  }
  console.log('');
}

// ---------- PART 3: Analysis ----------

function printAnalysis(traceResults) {
  console.log('========================================================================');
  console.log('PART 3: Analysis — what does 0x04EDD0 do?');
  console.log('========================================================================');
  console.log('');

  const trace1D = traceResults.find(r => r.seedA === 0x1D);
  const trace44 = traceResults.find(r => r.seedA === 0x44);
  const trace40 = traceResults.find(r => r.seedA === 0x40);

  // Path comparison
  console.log('  Path comparison (unique block counts):');
  for (const t of traceResults) {
    console.log(`    A=${hexByte(t.seedA)}: ${t.uniqueBlocks.length} unique blocks, ${t.steps} steps, stop=${t.stopReason} at ${hex(t.stopPc)}`);
  }
  console.log('');

  // Do 0x1D and 0x44 take the same path?
  if (trace1D && trace44) {
    const set1D = new Set(trace1D.uniqueBlocks);
    const set44 = new Set(trace44.uniqueBlocks);
    const only1D = trace1D.uniqueBlocks.filter(pc => !set44.has(pc));
    const only44 = trace44.uniqueBlocks.filter(pc => !set1D.has(pc));
    const common = trace1D.uniqueBlocks.filter(pc => set44.has(pc));

    console.log('  A=0x1D vs A=0x44 path comparison:');
    console.log(`    Common blocks: ${common.length}`);
    console.log(`    Only in 0x1D:  ${only1D.length ? only1D.map(hex).join(', ') : '(none)'}`);
    console.log(`    Only in 0x44:  ${only44.length ? only44.map(hex).join(', ') : '(none)'}`);
    console.log(`    Paths identical: ${only1D.length === 0 && only44.length === 0 ? 'YES' : 'NO'}`);
    console.log('');
  }

  // Do 0x1D and 0x40 differ?
  if (trace1D && trace40) {
    const set1D = new Set(trace1D.uniqueBlocks);
    const set40 = new Set(trace40.uniqueBlocks);
    const only1D = trace1D.uniqueBlocks.filter(pc => !set40.has(pc));
    const only40 = trace40.uniqueBlocks.filter(pc => !set1D.has(pc));

    console.log('  A=0x1D vs A=0x40 path comparison:');
    console.log(`    Only in 0x1D:  ${only1D.length ? only1D.map(hex).join(', ') : '(none)'}`);
    console.log(`    Only in 0x40:  ${only40.length ? only40.map(hex).join(', ') : '(none)'}`);
    console.log(`    Paths identical: ${only1D.length === 0 && only40.length === 0 ? 'YES' : 'NO'}`);
    console.log('');
  }

  // What does 0x04EDD0 modify?
  console.log('  Side effects summary:');
  for (const t of traceResults) {
    console.log(`    A=${hexByte(t.seedA)}:`);
    console.log(`      Final A: ${hexByte(t.finalA)}  (input was ${hexByte(t.seedA)}, ${t.finalA === t.seedA ? 'unchanged' : 'MODIFIED'})`);
    console.log(`      RAM changes: ${t.ramChanges.length ? t.ramChanges.join(', ') : '(none)'}`);
    console.log(`      IY changes:  ${t.iyChanges.length ? t.iyChanges.join(', ') : '(none)'}`);
    console.log(`      OP changes:  ${t.opChanges.length ? t.opChanges.join(', ') : '(none)'}`);
  }
  console.log('');

  // Downstream chain analysis
  console.log('  Downstream chain analysis:');
  const chainAddrs = [0x04ECCE, 0x07F984, 0x08BF22, 0x09EFDE];
  for (const t of traceResults) {
    const hitChain = chainAddrs.filter(addr => t.uniqueBlocks.includes(addr));
    const missChain = chainAddrs.filter(addr => !t.uniqueBlocks.includes(addr));
    console.log(`    A=${hexByte(t.seedA)}: hit ${hitChain.map(hex).join(', ') || '(none)'}`);
    if (missChain.length) {
      console.log(`           miss ${missChain.map(hex).join(', ')}`);
    }
  }
  console.log('');

  // Functional role hypothesis
  console.log('  Functional role hypothesis:');
  console.log('    0x04EDD0 is called by the three-way classifier at 0x04EB02');
  console.log('    when a recognized key code (0x40, 0x1D, 0x44) is detected.');
  console.log('    It chains into 0x04ECCE -> 0x07F984 -> 0x08BF22 -> 0x09EFDE.');
  console.log('');

  // Check if it writes to display-related RAM
  const displayRelated = traceResults.some(t =>
    t.ramChanges.some(c => c.includes('D00824') || c.includes('D007E0'))
  );
  const opRelated = traceResults.some(t => t.opChanges.length > 0);
  const iyRelated = traceResults.some(t => t.iyChanges.length > 0);

  if (displayRelated) {
    console.log('    EVIDENCE: Modifies display/mode RAM (D00824 or D007E0).');
    console.log('    -> Likely a mode-change or display-update handler.');
  }
  if (opRelated) {
    console.log('    EVIDENCE: Modifies OP registers (D005F8..D00620).');
    console.log('    -> Likely involves FPU/arithmetic computation.');
  }
  if (iyRelated) {
    console.log('    EVIDENCE: Modifies IY flags.');
    console.log('    -> Likely involves state/mode flag updates.');
  }
  if (!displayRelated && !opRelated && !iyRelated) {
    console.log('    No watched RAM, OP registers, or IY flags were modified.');
    console.log('    The function may write to addresses outside the watch list,');
    console.log('    or it may be a pure computation/lookup that returns a value');
    console.log('    in registers without side effects to the watched locations.');
  }
  console.log('');
}

// ---------- Main ----------

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

    console.log('Phase 237: Trace 0x04EDD0 — Key Code Action Handler');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Runtime seed: MBASE=${hexByte(MBASE)} IY=${hex(IY_BASE)} SP=${hex(STACK_TOP)} timerInterrupt=false`);
    console.log(`Step limit: ${STEP_LIMIT}`);
    console.log('');

    // PART 1: Disassembly
    printDisassembly(romBytes);

    // PART 2: Dynamic traces
    console.log('========================================================================');
    console.log('PART 2: Dynamic traces from 0x04EDD0 (500 steps each)');
    console.log('========================================================================');
    console.log('');

    const scenarios = [
      { label: 'Trace A', seedA: 0x1D, note: 'synthetic code (0x1D = mode-replaced 0x44 key)' },
      { label: 'Trace B', seedA: 0x44, note: 'raw "2" key code (physical key)' },
      { label: 'Trace C', seedA: 0x40, note: 'key code 0x40 (recognized by CP 0x40 in classifier)' },
    ];

    const traceResults = [];
    for (const scenario of scenarios) {
      const result = runTrace(blocks, romBytes, scenario.label, scenario.seedA, scenario.note);
      printTrace(result);
      traceResults.push(result);
    }

    // PART 3: Analysis
    printAnalysis(traceResults);

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
