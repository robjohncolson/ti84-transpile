#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

// The repo's working full-boot probes use the concrete lifted init bodies at
// 0x08C331 and 0x09DEE0. The task prompt's named 0x000292 / 0x020818 entries
// are not exposed as practical lifted init bodies in this runtime.
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

// 0x02FD8F = dispatcher entry (one-time setup: RES 3,(IY+40), LD A,0xCC → (D00000))
// 0x02FD99 = mid-block reentry (steady-state loop, skips one-time setup)
const DISPATCHER_ENTRY = 0x02FD8F;
const EVENT_LOOP_REENTRY = 0x02FD99;
// The idle HALT at 0x040D40 is: EI (0xFB, 1 byte) + HALT (0x76, 1 byte).
// After ISR wake, execution resumes at the instruction AFTER HALT = 0x040D42.
// Since haltPc is the block address (0x040D40), offset is 2.
const HALT_RESUME_OFFSET = 2;

const STACK_TOP = 0xD1A87E;
const STACK_FILL_SPAN = 0x40;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const SEGMENT_STEP_LIMIT = 2000;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

const FIRST_HALT_STEP_LIMIT = 5000;
const CYCLE_STEP_LIMIT = 200000;
const CHECKPOINT_INTERVAL = 10000;

const D0058C_ADDR = 0xD0058C;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D0009D_ADDR = 0xD0009D; // IY+29
const D003E0_ADDR = 0xD003E0;
const D007E0_ADDR = 0xD007E0;
const D02A86_ADDR = 0xD02A86;
const ERR_NO_ADDR = 0xD008DF;

const KEY_SCAN_CODE = 0x22; // "2" scan code
const KEY_CODE = 0x8F;      // "2" key code

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const STOP_SENTINEL = '__PHASE246_STOP__';

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
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

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) {
    return currentMode;
  }
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function installStepShim(cpu, executor, mem) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for block stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;

    // Stub check: if this block should be stubbed, simulate the configured action
    const stubAction = STUB_MAP.get(pc);
    if (stubAction) {
      if (stubAction === 'load-key-ret') {
        this.a = mem[D0058E_ADDR & MEM_MASK] & 0xFF;
      }
      // Simulate RET: pop 24-bit return address from stack
      const retAddr = mem[this.sp & MEM_MASK]
        | (mem[(this.sp + 1) & MEM_MASK] << 8)
        | (mem[(this.sp + 2) & MEM_MASK] << 16);
      this.sp = (this.sp + 3) & 0xFFFFFF;
      this.pc = retAddr & 0xFFFFFF;
      return retAddr & 0xFFFFFF;
    }

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected block result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
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
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase246-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));

  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function makeStop(name, pc) {
  const error = new Error(STOP_SENTINEL);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });

    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;

    if (result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    steps: totalSteps,
    lastPc: (lastResult.lastPc ?? currentPc) & 0xFFFFFF,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runToStopPc(executor, entry, mode, stopPc, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitStop = false;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hitStop) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, _meta, step) {
          const norm = pc & 0xFFFFFF;
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (norm === stopPc) {
            throw makeStop('stop_pc', norm);
          }
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (norm === stopPc) {
            throw makeStop('stop_pc', norm);
          }
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        break;
      }
    } catch (error) {
      totalSteps += segmentObservedSteps;
      if (error?.message === STOP_SENTINEL) {
        hitStop = true;
        lastPc = error.stopPc;
        termination = 'stop_pc';
      } else {
        termination = 'exception';
        errorMessage = error?.stack ?? String(error);
      }
      break;
    }
  }

  if (!hitStop && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitStop,
    errorMessage,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, BOOT_MODE, BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERR_NO_ADDR] = 0x00;

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, cpuSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s1 = runStageInSegments(executor, STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage1_statusbar', entry: STAGE_1_ENTRY, ...s1 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  mem[0xD0009B] &= ~0x40;
  const s2 = runStageInSegments(executor, STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage2_statusdots', entry: STAGE_2_ENTRY, ...s2 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s3 = runStageInSegments(executor, STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage3_homerow', entry: STAGE_3_ENTRY, ...s3 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s4 = runStageInSegments(executor, STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage4_history', entry: STAGE_4_ENTRY, ...s4 });

  return stages;
}

function prepareEventLoopCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = DISPATCHER_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;

  const fillStart = Math.max(0, (cpu.sp - STACK_FILL_SPAN) & MEM_MASK);
  mem.fill(0xFF, fillStart, Math.min(MEM_SIZE, cpu.sp + 3));
  push24(cpu, mem, RETURN_SENTINEL);

  // Start from a no-key idle baseline, but keep the booted home-screen RAM.
  mem[D0058C_ADDR] = 0x00;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D0009D_ADDR] &= ~0x01;

  // D00000 must be 0xCC for the event loop gate at 0x02FDC2 to reach the
  // no-key HALT path. The one-time setup at 0x02FD8F (dispatcher entry)
  // writes LD A,0xCC → (D00000), but since we enter mid-block at 0x02FD99
  // that setup is skipped. Seed it explicitly.
  mem[0xD00000] = 0xCC;

  // D007E0 = home-screen context (0x40). Required for display/key paths.
  mem[D007E0_ADDR] = 0x40;

  // D00824 = home-screen mode byte (0x00).
  mem[0xD00824] = 0x00;
}

function blockGroupLabel(pc) {
  const highByte = (pc >>> 16) & 0xFF;
  switch (highByte) {
    case 0x02: return '0x02xxxx = event loop / key dispatch';
    case 0x03: return '0x03xxxx = scan / loop glue / helpers';
    case 0x04: return '0x04xxxx = key handler / housekeeping';
    case 0x05: return '0x05xxxx = cxMain / token dispatch';
    case 0x07: return '0x07xxxx = display / FP';
    case 0x08: return '0x08xxxx = display management';
    case 0x09: return '0x09xxxx = VRAM / display';
    case 0x0A: return '0x0Axxxx = display setup';
    default: return `0x${highByte.toString(16).toUpperCase().padStart(2, '0')}xxxx = other`;
  }
}

function addFirstVisit(pc, firstVisitOrder, seenBlocks) {
  if (seenBlocks.has(pc)) {
    return;
  }
  seenBlocks.add(pc);
  firstVisitOrder.push(pc);
}

function captureCheckpoint(step, cpu, mem, uniqueCount) {
  const pc = cpu.pc & 0xFFFFFF;
  return {
    step,
    pc,
    group: blockGroupLabel(pc),
    sp: cpu.sp & 0xFFFFFF,
    d0058e: mem[D0058E_ADDR] & 0xFF,
    d02a86: mem[D02A86_ADDR] & 0xFF,
    d007e0: mem[D007E0_ADDR] & 0xFF,
    d003e0: mem[D003E0_ADDR] & 0xFF,
    uniqueBlocks: uniqueCount,
  };
}

// The event loop idle HALT at 0x040D40 is the target stop.
const EXPECTED_IDLE_HALT = 0x040D40;

// Stubbed CALL targets. These are heavy subsystems that we bypass.
// Each entry: { addr, action }
//   'ret' = pop return address and jump there (simulate RET)
//   'load-key-ret' = set A = mem[D0058E], then simulate RET
// 0x049656 = USB/timer subsystem (contains HALT; prevents reaching idle HALT)
// 0x03FA09 = key delivery (loads A from D0058E; heavy subroutine with many
//            internal blocks; stub to ensure A reflects the key code for the
//            OR A gate at 0x02FDC2)
const STUB_CONFIGS = [
  { addr: 0x049656, action: 'ret' },
  { addr: 0x03FA09, action: 'load-key-ret' },
];
const STUB_MAP = new Map(STUB_CONFIGS.map((s) => [s.addr, s.action]));
const STUB_BLOCKS = new Set(STUB_CONFIGS.map((s) => s.addr));

function stepUntilHalt(cpu, mem, maxSteps) {
  const seenBlocks = new Set();
  const firstVisitOrder = [];
  const stubbedCalls = [];

  for (let step = 0; step < maxSteps; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    addFirstVisit(pc, firstVisitOrder, seenBlocks);

    // Track stubbed blocks
    if (STUB_BLOCKS.has(pc)) {
      stubbedCalls.push({ pc, step: step + 1 });
    }

    const result = cpu.step();

    if (result === -1) {
      return {
        completed: true,
        haltPc: pc,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }

    if (result === -2) {
      return {
        completed: false,
        reason: 'sleep',
        finalPc: pc,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }

    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      return {
        completed: false,
        reason: 'returned_sentinel',
        finalPc: cpu.pc & 0xFFFFFF,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }
  }

  return {
    completed: false,
    reason: 'step_limit',
    finalPc: cpu.pc & 0xFFFFFF,
    steps: maxSteps,
    firstVisitOrder,
    stubbedCalls,
  };
}

function traceFullCycle(cpu, mem, maxSteps) {
  const seenBlocks = new Set();
  const firstVisitOrder = [];
  const checkpoints = [];
  const tail = [];
  const stubbedCalls = [];

  let secondHaltPc = null;
  let termination = 'step_limit';
  let finalPc = cpu.pc & 0xFFFFFF;
  let executedSteps = 0;

  for (let step = 0; step < maxSteps; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    addFirstVisit(pc, firstVisitOrder, seenBlocks);
    tail.push(pc);
    if (tail.length > 32) {
      tail.shift();
    }

    if (STUB_BLOCKS.has(pc)) {
      stubbedCalls.push({ pc, step: step + 1 });
    }

    const result = cpu.step();
    executedSteps = step + 1;
    finalPc = cpu.pc & 0xFFFFFF;

    if (executedSteps % CHECKPOINT_INTERVAL === 0) {
      checkpoints.push(captureCheckpoint(executedSteps, cpu, mem, seenBlocks.size));
    }

    if (result === -1) {
      secondHaltPc = pc;
      termination = 'halt';
      break;
    }

    if (result === -2) {
      termination = 'sleep';
      break;
    }

    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      // The event loop returned to its caller. Re-enter the event loop to
      // continue the cycle (simulates the main loop re-calling the event loop).
      cpu.pc = EVENT_LOOP_REENTRY;
      cpu.sp = STACK_TOP;
      push24(cpu, mem, RETURN_SENTINEL);
      // Clear the key so the re-entered event loop sees no-key and reaches HALT
      mem[D0058E_ADDR] = 0x00;
      continue;
    }
  }

  return {
    executedSteps,
    termination,
    secondHaltPc,
    finalPc,
    checkpoints,
    firstVisitOrder,
    tail,
    stubbedCalls,
    finalState: {
      d0058e: mem[D0058E_ADDR] & 0xFF,
      d02a86: mem[D02A86_ADDR] & 0xFF,
      d007e0: mem[D007E0_ADDR] & 0xFF,
      d003e0: mem[D003E0_ADDR] & 0xFF,
      sp: cpu.sp & 0xFFFFFF,
    },
  };
}

function groupBlocksByRange(firstVisitOrder) {
  const groups = new Map();
  for (const pc of firstVisitOrder) {
    const label = blockGroupLabel(pc);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(pc);
  }
  return groups;
}

function formatBlockList(blocks, indent = '  ', width = 108) {
  if (!blocks.length) {
    return [`${indent}(none)`];
  }

  const lines = [];
  let current = indent;

  for (const pc of blocks) {
    const token = hex(pc);
    if (current.trim().length === 0) {
      current = `${indent}${token}`;
      continue;
    }

    const candidate = `${current} -> ${token}`;
    if (candidate.length > width) {
      lines.push(current);
      current = `${indent}${token}`;
    } else {
      current = candidate;
    }
  }

  if (current.trim().length > 0) {
    lines.push(current);
  }

  return lines;
}

function printBootSummary(bootInfo, memInit, stages) {
  console.log('=== Phase 246: Full Event Loop Cycle with Key Injection ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
  console.log('');

  console.log('Boot sequence:');
  console.log(
    `  cold boot: steps=${bootInfo.boot.steps} term=${bootInfo.boot.termination} lastPc=${hex(bootInfo.boot.lastPc)}`,
  );
  console.log(
    `  kernelInit (concrete body ${hex(KERNEL_INIT_ENTRY)}): steps=${bootInfo.kernelInit.steps} term=${bootInfo.kernelInit.termination} lastPc=${hex(bootInfo.kernelInit.lastPc)}`,
  );
  console.log(
    `  postInit: steps=${bootInfo.postInit.steps} term=${bootInfo.postInit.termination} lastPc=${hex(bootInfo.postInit.lastPc)}`,
  );
  console.log(
    `  memInit (concrete body ${hex(MEM_INIT_ENTRY)}): steps=${memInit.steps} term=${memInit.termination} hitStop=${memInit.hitStop} lastPc=${hex(memInit.lastPc)}`,
  );
  for (const stage of stages) {
    console.log(
      `  ${stage.label}: entry=${hex(stage.entry)} steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)}`,
    );
  }
  console.log('');
}

function printInitialHalt(initialRun) {
  console.log('Boot-to-HALT event-loop run:');
  if (!initialRun.completed) {
    console.log(
      `  FAILED: reason=${initialRun.reason} steps=${initialRun.steps} finalPc=${hex(initialRun.finalPc)}`,
    );
  } else {
    console.log(
      `  HALT reached at ${hex(initialRun.haltPc)} after ${initialRun.steps} block steps`,
    );
  }

  // Show stubbed calls
  if (initialRun.stubbedCalls?.length) {
    console.log(`  Stubbed CALL blocks: ${initialRun.stubbedCalls.length}`);
    for (const s of initialRun.stubbedCalls) {
      console.log(`    ${hex(s.pc)} stubbed at step ${s.step}`);
    }
  }

  // Show block visit order for diagnostic purposes
  if (initialRun.firstVisitOrder?.length) {
    console.log(`  Block visit order (${initialRun.firstVisitOrder.length} unique blocks):`);
    for (const line of formatBlockList(initialRun.firstVisitOrder, '    ')) {
      console.log(line);
    }
  }
  console.log('');
}

function printInjection(mem, haltPc) {
  const beforeFlag = mem[D0009D_ADDR] & 0xFF;
  mem[D0058E_ADDR] = KEY_CODE;
  mem[D0058C_ADDR] = KEY_SCAN_CODE;
  mem[D0009D_ADDR] = beforeFlag | 0x01;

  console.log('Key injection:');
  console.log(`  D0058E <= ${hexByte(KEY_CODE)}`);
  console.log(`  D0058C <= ${hexByte(KEY_SCAN_CODE)}`);
  console.log(`  D0009D bit0: ${hexByte(beforeFlag)} -> ${hexByte(mem[D0009D_ADDR])}`);
  console.log(`  Resume PC: ${hex(haltPc + HALT_RESUME_OFFSET)}`);
  console.log('');
}

function printCheckpoints(cycle) {
  console.log(`Cycle checkpoints (every ${CHECKPOINT_INTERVAL} steps):`);
  if (!cycle.checkpoints.length) {
    console.log('  (no checkpoints hit before termination)');
  } else {
    for (const checkpoint of cycle.checkpoints) {
      console.log(
        `  step=${checkpoint.step} pc=${hex(checkpoint.pc)} block=${checkpoint.group} ` +
        `sp=${hex(checkpoint.sp)} D0058E=${hexByte(checkpoint.d0058e)} ` +
        `D02A86=${hexByte(checkpoint.d02a86)} D007E0=${hexByte(checkpoint.d007e0)} ` +
        `D003E0=${hexByte(checkpoint.d003e0)} uniqueBlocks=${checkpoint.uniqueBlocks}`,
      );
    }
  }
  console.log('');
}

function printBlockSummary(cycle) {
  console.log('Unique block sequence by address range (first-visit order):');
  const groups = groupBlocksByRange(cycle.firstVisitOrder);
  for (const [label, blocks] of groups.entries()) {
    console.log(`  ${label} (${blocks.length})`);
    for (const line of formatBlockList(blocks, '    ')) {
      console.log(line);
    }
  }
  console.log('');
}

function printFinalReport(initialRun, cycle) {
  console.log('Report:');
  if (initialRun.completed && cycle.termination === 'halt') {
    console.log(
      `  COMPLETE: HALT -> key -> processing -> HALT succeeded in ${cycle.executedSteps} block steps`,
    );
    console.log(`  Initial HALT: ${hex(initialRun.haltPc)}`);
    console.log(`  Final HALT:   ${hex(cycle.secondHaltPc)}`);
  } else {
    console.log('  INCOMPLETE: cycle did not reach HALT again');
    console.log(`  Termination: ${cycle.termination}`);
    console.log(`  Steps: ${cycle.executedSteps}/${CYCLE_STEP_LIMIT}`);
    console.log(`  Final PC: ${hex(cycle.finalPc)}`);
    console.log(`  Tail: ${cycle.tail.map((pc) => hex(pc)).join(' -> ')}`);
  }

  if (cycle.stubbedCalls?.length) {
    console.log(`  Stubbed calls during cycle: ${cycle.stubbedCalls.length}`);
    const uniqueStubPcs = [...new Set(cycle.stubbedCalls.map((s) => s.pc))];
    for (const pc of uniqueStubPcs) {
      const count = cycle.stubbedCalls.filter((s) => s.pc === pc).length;
      console.log(`    ${hex(pc)}: ${count} time(s)`);
    }
  }

  console.log(`  Final D0058E: ${hexByte(cycle.finalState.d0058e)}`);
  console.log(`  Final D02A86: ${hexByte(cycle.finalState.d02a86)}`);
  console.log(`  Final D007E0: ${hexByte(cycle.finalState.d007e0)}`);
  console.log(`  Final D003E0: ${hexByte(cycle.finalState.d003e0)}`);
  console.log(`  Final SP: ${hex(cycle.finalState.sp)}`);
  console.log('');
}

async function main() {
  const assets = ensureTranspiledModule();

  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
    );

    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;
    installStepShim(cpu, executor, mem);

    const bootInfo = coldBoot(executor, cpu, mem);
    const memInit = runMemInit(executor, cpu, mem);
    if (!memInit.hitStop) {
      throw new Error(
        `memInit did not return via ${hex(MEM_INIT_RET)}. termination=${memInit.termination} lastPc=${hex(memInit.lastPc)}`,
      );
    }

    const postMemInitCpu = snapshotCpu(cpu);
    const stages = runHomescreenStages(executor, cpu, mem, postMemInitCpu);
    printBootSummary(bootInfo, memInit, stages);

    prepareEventLoopCpu(cpu, mem);
    const initialRun = stepUntilHalt(cpu, mem, FIRST_HALT_STEP_LIMIT);
    printInitialHalt(initialRun);

    if (!initialRun.completed) {
      process.exitCode = 1;
      return;
    }

    printInjection(mem, initialRun.haltPc);

    cpu.halted = false;
    cpu.pc = (initialRun.haltPc + HALT_RESUME_OFFSET) & 0xFFFFFF;

    const cycle = traceFullCycle(cpu, mem, CYCLE_STEP_LIMIT);
    printCheckpoints(cycle);
    printBlockSummary(cycle);
    printFinalReport(initialRun, cycle);

    process.exitCode = cycle.termination === 'halt' ? 0 : 1;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
