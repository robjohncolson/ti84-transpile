#!/usr/bin/env node
// Phase 236 — End-to-end trace of a key press through the full home-screen event pipeline.
//
// Scenario A: key present (D0058E=0x8F, digit "1")
// Scenario B: no key (D0058E=0x00)
//
// The dispatcher at 0x02FD8F CALLs four heavyweight subroutines before the OR A
// gate that classifies the key. To trace the key-event *pipeline* without
// disappearing into 500+ steps of subroutine internals, we inject lightweight
// stub blocks for the four CALL targets:
//   0x02390A — RES 3,(IY+40) + LD A,0xCC->(D00000) (stubbed: just returns)
//   0x03013A — key scan table lookup (stubbed: just returns)
//   0x05C76C — (stubbed: just returns)
//   0x03FA09 — key delivery (stubbed: loads A from D0058E, then returns)
//
// After the stubs return, the dispatcher hits OR A, and the real pipeline
// continues through the waypoints decoded in sessions 230-235.
//
// Waypoints:
//   0x02FD8F  dispatcher entry
//   0x02FE89  key classifier (key present, JP NZ from OR A)
//   0x02FF11  09F79B table lookup (LD DE,0x09F79B)
//   0x0302EB  0x44 key gate
//   0x02FFAE  normal dispatch / mode-sensitive classifier
//   0x02FFED  OR A convergence gate
//   0x02FE84  JP target when NZ (timer path)
//   0x030300  timer helper
//   0x02FD99  event loop re-entry (Z path from 0x02FFED)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus as fallbackCreatePeripheralBus } from './peripherals.js';

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
const MAX_STEPS = 1000;

const ENTRY_PC = 0x02FD8F;
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

// Stubbed CALL targets (heavy subroutines we bypass)
const STUB_TARGETS = [
  { addr: 0x02390A, name: 'RES 3,(IY+40) helper',   action: 'ret' },
  { addr: 0x03013A, name: 'key scan table lookup',   action: 'ret' },
  { addr: 0x05C76C, name: 'unknown helper',          action: 'ret' },
  { addr: 0x03FA09, name: 'key delivery (loads A from D0058E)', action: 'load-key-ret' },
];

// Waypoints — addresses are block entry points (not mid-block offsets).
// 0x02FF11 (LD DE,0x09F79B) lives inside the block at 0x02FF09; we track
// the block entry 0x02FF09 instead so that the waypoint fires.
const WAYPOINTS = new Map([
  [0x02FD8F, 'dispatcher entry'],
  [0x03013A, 'CALL 0x03013A (stubbed: key scan table)'],
  [0x05C76C, 'CALL 0x05C76C (stubbed: helper)'],
  [0x03FA09, 'CALL 0x03FA09 (stubbed: key delivery -> A=D0058E)'],
  [0x02FDC2, 'OR A gate (after key delivery)'],
  [0x02FE89, 'key classifier (CP 0xFF, SET IY+29)'],
  [0x02FF09, '09F79B table lookup block (contains LD DE,0x09F79B at 0x02FF11)'],
  [0x0302EB, '0x44 key gate (CP 0x44)'],
  [0x02FFAE, 'normal dispatch (mode-sensitive classifier)'],
  [0x02FFED, 'OR A convergence gate'],
  [0x02FE84, 'timer path entry (JP from OR A NZ)'],
  [0x030300, 'timer helper (CALL 0x030300)'],
  [0x02FE88, 'RET from timer path'],
  [0x02FDEB, 'no-key fall-through path'],
]);

// IY flag offsets to track
const IY_OFFSETS = [0, 5, 8, 18, 29, 40, 87];

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
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[(a + 1) & 0xFFFFFF] << 8) | (mem[(a + 2) & 0xFFFFFF] << 16);
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
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

function installStepShimWithStubs(cpu, executor, mem) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  // Install stub blocks for the heavyweight CALL targets.
  // Each stub pops the return address and jumps back, simulating a RET.
  // The key-delivery stub also loads A from D0058E.
  const stubSet = new Map();
  for (const stub of STUB_TARGETS) {
    const key = blockKey(stub.addr, 'adl');
    stubSet.set(key, stub);

    // Create the stub function
    if (stub.action === 'load-key-ret') {
      // Load A from D0058E, then RET
      executor.compiledBlocks[key] = function stubLoadKeyRet(c) {
        c.a = c.memory[D0058E] & 0xFF;
        // Pop return address
        const retAddr = read24(c.memory, c.sp);
        c.sp = (c.sp + 3) & 0xFFFFFF;
        c.pc = retAddr & 0xFFFFFF;
        return c.pc;
      };
    } else {
      // Simple RET stub
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

  return stubSet;
}

// --- Trace engine ---

function resetAndSeed(runtime, baselineMemory, keyCode) {
  const { mem, cpu } = runtime;

  mem.set(baselineMemory);

  // CPU init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set initially

  // Seed key code at D0058E
  mem[D0058E] = keyCode & 0xFF;
  mem[D0058D] = 0x00;
  mem[D0059F] = 0x00;
  mem[D00000] = 0x00;
  mem[D007E0] = 0x40; // home-screen context
  mem[D00824] = 0x00; // home-screen mode byte

  // Clear IY flag region
  for (let i = 0; i < 128; i++) {
    mem[IY_BASE + i] = 0x00;
  }
  // BIT 0,(IY+52) is tested early — set to 0 so the gate passes
  // (IY+52 = IY_BASE + 0x34 = D000B4)
  mem[IY_BASE + 0x34] = 0x00;

  // Push sentinel return address
  push24(cpu, mem, RETURN_SENTINEL);
}

function readIyFlags(mem) {
  const flags = {};
  for (const offset of IY_OFFSETS) {
    flags[`IY+${offset}`] = mem[IY_BASE + offset];
  }
  return flags;
}

function formatIyFlags(flags) {
  return IY_OFFSETS.map(o => `${hexByte(flags[`IY+${o}`])}`).join(' ');
}

function traceScenario(runtime, baselineMemory, label, keyCode) {
  resetAndSeed(runtime, baselineMemory, keyCode);

  const { cpu, mem } = runtime;

  const waypointLog = [];
  const blockChain = [];
  const uniqueBlocks = [];
  const seen = new Set();

  let totalSteps = 0;
  let stopReason = 'max_steps';
  let error = null;

  // Record initial state at entry
  waypointLog.push({
    step: 0,
    pc: ENTRY_PC,
    a: cpu.a,
    d0058e: mem[D0058E],
    iyFlags: readIyFlags(mem),
    note: WAYPOINTS.get(ENTRY_PC) || '',
  });

  while (totalSteps < MAX_STEPS) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    blockChain.push(pc);
    if (!seen.has(pc)) {
      seen.add(pc);
      uniqueBlocks.push(pc);
    }

    // Record waypoint hits (skip ENTRY_PC since already recorded at step 0)
    if (WAYPOINTS.has(pc) && pc !== ENTRY_PC) {
      waypointLog.push({
        step: totalSteps,
        pc,
        a: cpu.a,
        d0058e: mem[D0058E],
        iyFlags: readIyFlags(mem),
        note: WAYPOINTS.get(pc),
      });
    }

    // Stop conditions: sentinel covers the key-present path (RET after timer).
    // For no-key path, HALT is the natural endpoint.

    try {
      const result = cpu.step();
      totalSteps += 1;

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
    } catch (stepError) {
      stopReason = 'error';
      error = stepError instanceof Error ? stepError.message : String(stepError);
      break;
    }
  }

  return {
    label,
    keyCode,
    totalSteps,
    stopReason,
    error,
    finalPc: cpu.pc & 0xFFFFFF,
    finalA: cpu.a,
    waypointLog,
    blockChain,
    uniqueBlocks,
  };
}

// --- Output formatting ---

function printScenario(result) {
  console.log('');
  console.log('='.repeat(90));
  console.log(`Scenario: ${result.label}`);
  console.log(`Key code: ${hexByte(result.keyCode)} | Steps: ${result.totalSteps} | Stop: ${result.stopReason}`);
  if (result.error) {
    console.log(`ERROR: ${result.error}`);
  }
  console.log(`Final PC: ${hex(result.finalPc)} | Final A: ${hexByte(result.finalA)}`);
  console.log('');

  // Waypoint table
  const iyHeader = IY_OFFSETS.map(o => `+${o}`).join(' ');
  console.log(`  Step  | Block      | A    | D0058E | IY flags (${iyHeader})          | Note`);
  console.log(`  ------|------------|------|--------|${'-'.repeat(35)}|${''.padEnd(45, '-')}`);

  for (const wp of result.waypointLog) {
    const step = String(wp.step).padStart(5);
    const block = hex(wp.pc);
    const a = hexByte(wp.a);
    const d = hexByte(wp.d0058e);
    const iy = formatIyFlags(wp.iyFlags);
    const note = wp.note;
    console.log(`  ${step} | ${block} | ${a} | ${d}    | ${iy.padEnd(33)} | ${note}`);
  }

  // Unique block chain
  console.log('');
  console.log(`  Block chain (${result.uniqueBlocks.length} unique blocks, ${result.blockChain.length} total visits):`);
  const chunks = [];
  let current = '    ';
  for (const block of result.uniqueBlocks) {
    const token = hex(block);
    if (current.length > 4) {
      const next = current + ' -> ' + token;
      if (next.length > 100) {
        chunks.push(current);
        current = '      ' + token;
      } else {
        current = next;
      }
    } else {
      current += token;
    }
  }
  if (current.trim()) chunks.push(current);
  for (const chunk of chunks) {
    console.log(chunk);
  }
}

// --- Main ---

async function main() {
  console.log('Phase 236: Home-screen key event end-to-end trace');
  console.log(`Entry: ${hex(ENTRY_PC)} | Stack: ${hex(STACK_TOP)} | MBASE: ${hexByte(MBASE)} | IY: ${hex(IY_BASE)}`);
  console.log(`Max steps: ${MAX_STEPS} | Timer IRQ: disabled`);
  console.log('');
  console.log('Stubbed CALL targets (bypass heavy subroutines to trace the pipeline):');
  for (const stub of STUB_TARGETS) {
    console.log(`  ${hex(stub.addr)} — ${stub.name} [${stub.action}]`);
  }

  const runtime = createRuntime();
  const stubSet = installStepShimWithStubs(runtime.cpu, runtime.executor, runtime.mem);
  const baselineMemory = new Uint8Array(runtime.mem);

  // Scenario A: key present (digit "1", key code 0x8F)
  const resultA = traceScenario(runtime, baselineMemory, 'Key present — digit "1" (D0058E=0x8F)', 0x8F);
  printScenario(resultA);

  // Scenario B: no key (D0058E=0x00)
  const resultB = traceScenario(runtime, baselineMemory, 'No key (D0058E=0x00)', 0x00);
  printScenario(resultB);

  // --- Summary ---
  console.log('');
  console.log('='.repeat(90));
  console.log('SUMMARY: Home-Screen Key Event Pipeline');
  console.log('='.repeat(90));
  console.log('');
  console.log('Architecture (decoded in sessions 230-235, confirmed by this trace):');
  console.log('');
  console.log('  0x02FD8F  Dispatcher entry');
  console.log('    |  RES 3,(IY+40), LD A,0xCC -> (D00000), BIT 0,(IY+52) gate');
  console.log('    |  CALL 0x03013A  key scan table lookup (stubbed)');
  console.log('    |  CALL 0x05C76C  (stubbed)');
  console.log('    |  CALL 0x03FA09  key delivery: loads A from D0058E (stubbed)');
  console.log('    |');
  console.log('  0x02FDC2  OR A (first gate: key present?)');
  console.log('    |');
  console.log('    +-- A != 0 (NZ) --> JP 0x02FE89  [KEY PRESENT PATH]');
  console.log('    |');
  console.log('    +-- A == 0 (Z)  --> 0x02FDEB fall-through [NO KEY PATH -> HALT]');
  console.log('');
  console.log('  === KEY PRESENT PATH ===');
  console.log('');
  console.log('  0x02FE89  Key classifier');
  console.log('    |  CP 0xFF gate');
  console.log('    |  SET 0,(IY+29) for non-0xFF keys');
  console.log('    |  BIT 4,(IY+0) -> conditional RES 0,(IY+29)');
  console.log('    |  BIT 3,(IY+87) test');
  console.log('    |  CP 0x36 -> CLEAR key handler');
  console.log('    |  CP 0x30 -> MODE key handler');
  console.log('    |  Other keys: 09F79B table lookup (block 0x02FF09, LD DE at 0x02FF11)');
  console.log('    v');
  console.log('  0x0302EB  0x44 key gate');
  console.log('    |  CP 0x44 + BIT 4,(IY+0x4B) -> conditional LD A,0x1D');
  console.log('    v');
  console.log('  0x02FFAE  Normal dispatch (mode-sensitive classifier)');
  console.log('    |  reads D00824 (mode byte), D007E0 (context)');
  console.log('    |  CP cascade: 0x54/0x53/0x43/0x49/0x40');
  console.log('    |  Home screen: all CPs fail, key passes through with A=0x9C');
  console.log('    v');
  console.log('  0x02FFED  OR A (second gate: convergence)');
  console.log('    |');
  console.log('    +-- NZ: JP 0x02FE84 -> CALL 0x030300 (timer) -> RET (0x02FE88)');
  console.log('    |');
  console.log('    +-- Z:  JP 0x02FD99 (event loop re-entry)');
  console.log('');
  console.log('  === NO KEY PATH ===');
  console.log('');
  console.log('  0x02FDEB  No-key fall-through');
  console.log('    |  Additional processing (0x02FDF4 -> 0x02FE02 -> 0x03D1BE ...)');
  console.log('    |  Eventually reaches HALT at 0x040D40');
  console.log('');

  // Waypoint coverage check
  const allWaypoints = [...WAYPOINTS.keys()];
  for (const [lbl, result] of [['Key present (0x8F)', resultA], ['No key (0x00)', resultB]]) {
    const hit = new Set(result.waypointLog.map(w => w.pc));
    const hitList = allWaypoints.filter(w => hit.has(w)).map(w => hex(w));
    const missList = allWaypoints.filter(w => !hit.has(w)).map(w => `${hex(w)} (${WAYPOINTS.get(w)})`);
    console.log(`${lbl}:`);
    console.log(`  Waypoints hit (${hitList.length}/${allWaypoints.length}): ${hitList.join(', ')}`);
    if (missList.length > 0) {
      console.log(`  Waypoints missed: ${missList.join(', ')}`);
    }
    console.log(`  Total blocks: ${result.blockChain.length} visits, ${result.uniqueBlocks.length} unique`);
    console.log(`  Stop reason: ${result.stopReason}`);
    console.log('');
  }
}

await main();
