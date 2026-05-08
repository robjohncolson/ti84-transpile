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

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const DISPATCHER_ENTRY = 0x02FD8F;
const EVENT_LOOP_REENTRY = 0x02FD99;
const IDLE_HALT_PC = 0x040D40;
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
const TRACE_STEP_LIMIT = 50000;

const D00000_ADDR = 0xD00000;
const D0009D_ADDR = 0xD0009D;
const D003E0_ADDR = 0xD003E0;
const D0058C_ADDR = 0xD0058C;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const D02A86_ADDR = 0xD02A86;
const ERR_NO_ADDR = 0xD008DF;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_LENGTH = 0x11;

const KEY_SCAN_CODE = 0x22;
const KEY_CODE = 0x8F;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const STOP_SENTINEL = '__PHASE249_STOP__';

const WATCHED_BLOCKS = [
  { addr: 0x0585D3, label: '0x0585D3 JP (HL) dispatch table' },
  { addr: 0x0585E9, label: '0x0585E9 cxMain entry' },
  { addr: 0x05877A, label: '0x05877A cascading CP chain' },
  { addr: 0x0589E5, label: '0x0589E5 class comparison chain' },
  { addr: 0x058AC9, label: '0x058AC9 BufInsert gate (CP 0x5A)' },
  { addr: 0x058D54, label: '0x058D54 token class lookup' },
  { addr: 0x05E2A0, label: '0x05E2A0 BufInsert' },
  { addr: 0x05E620, label: '0x05E620 ConvKeyToTok' },
  { addr: 0x05E6A4, label: '0x05E6A4 ConvKeyToTok' },
  { addr: 0x09927F, label: '0x09927F key handler' },
];

const STUB_CONFIGS = [
  { addr: 0x049656, action: 'ret', label: '0x049656 USB/timer HALT bypass' },
  { addr: 0x03FA09, action: 'load-key-ret', label: '0x03FA09 key delivery (A <- D0058E)' },
];
const STUB_MAP = new Map(STUB_CONFIGS.map((stub) => [stub.addr, stub]));

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
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

    const stub = STUB_MAP.get(pc);
    if (stub) {
      if (stub.action === 'load-key-ret') {
        this.a = mem[D0058E_ADDR & MEM_MASK] & 0xFF;
      }
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
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase249-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
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

  mem[D0058C_ADDR] = 0x00;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D0009D_ADDR] &= ~0x01;

  mem[D00000_ADDR] = 0xCC;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;
}

function stepUntilHalt(cpu, maxSteps) {
  const firstVisitOrder = [];
  const seenBlocks = new Set();
  const stubbedCalls = [];

  for (let step = 0; step < maxSteps; step++) {
    const pc = cpu.pc & 0xFFFFFF;

    if (!seenBlocks.has(pc)) {
      seenBlocks.add(pc);
      firstVisitOrder.push(pc);
    }

    if (STUB_MAP.has(pc)) {
      stubbedCalls.push({ step: step + 1, pc });
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

function buildWatchState(executor) {
  return WATCHED_BLOCKS.map((watch) => ({
    ...watch,
    exactAdlBlock: typeof executor.compiledBlocks[blockKey(watch.addr, 'adl')] === 'function',
    exactZ80Block: typeof executor.compiledBlocks[blockKey(watch.addr, 'z80')] === 'function',
    hits: 0,
    firstStep: null,
  }));
}

function traceDigitPath(cpu, mem, maxSteps, watchState) {
  const watchIndex = new Map(watchState.map((watch) => [watch.addr, watch]));
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const visitLog = [];
  const tail = [];
  const stubbedCalls = [];
  const syntheticReentries = [];

  let termination = 'step_limit';
  let haltPc = null;
  let errorMessage = null;
  let segment = 1;
  let executedSteps = 0;
  let finalPc = cpu.pc & 0xFFFFFF;

  for (let step = 0; step < maxSteps; step++) {
    const stepNumber = step + 1;
    const pc = cpu.pc & 0xFFFFFF;
    const currentSegment = segment;
    const notes = [];
    const watch = watchIndex.get(pc);
    const stub = STUB_MAP.get(pc);

    if (!seenBlocks.has(pc)) {
      seenBlocks.add(pc);
      uniqueBlocks.push(pc);
    }

    if (watch) {
      watch.hits += 1;
      if (watch.firstStep === null) {
        watch.firstStep = stepNumber;
      }
      notes.push(`watch:${watch.label}`);
    }

    if (stub) {
      stubbedCalls.push({ step: stepNumber, pc, label: stub.label });
      notes.push(`stub:${stub.label}`);
    }

    tail.push(pc);
    if (tail.length > 32) {
      tail.shift();
    }

    let result;
    try {
      result = cpu.step();
    } catch (error) {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
      executedSteps = stepNumber;
      finalPc = pc;
      visitLog.push({
        step: stepNumber,
        segment: currentSegment,
        pc,
        next: 'EXCEPTION',
        a: cpu.a & 0xFF,
        d0058e: mem[D0058E_ADDR] & 0xFF,
        sp: cpu.sp & 0xFFFFFF,
        notes: [...notes, 'exception'],
      });
      break;
    }

    executedSteps = stepNumber;
    finalPc = cpu.pc & 0xFFFFFF;

    if (result === -1) {
      termination = 'halt';
      haltPc = pc;
      visitLog.push({
        step: stepNumber,
        segment: currentSegment,
        pc,
        next: 'HALT',
        a: cpu.a & 0xFF,
        d0058e: mem[D0058E_ADDR] & 0xFF,
        sp: cpu.sp & 0xFFFFFF,
        notes,
      });
      break;
    }

    if (result === -2) {
      termination = 'sleep';
      visitLog.push({
        step: stepNumber,
        segment: currentSegment,
        pc,
        next: 'SLEEP',
        a: cpu.a & 0xFF,
        d0058e: mem[D0058E_ADDR] & 0xFF,
        sp: cpu.sp & 0xFFFFFF,
        notes,
      });
      break;
    }

    let nextDisplay = hex(cpu.pc & 0xFFFFFF);
    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      const preservedKey = mem[D0058E_ADDR] & 0xFF;
      syntheticReentries.push({
        step: stepNumber,
        fromPc: pc,
        returnPc: RETURN_SENTINEL,
        reentryPc: EVENT_LOOP_REENTRY,
        preservedKey,
      });

      cpu.halted = false;
      cpu.pc = EVENT_LOOP_REENTRY;
      cpu.sp = STACK_TOP;
      push24(cpu, mem, RETURN_SENTINEL);
      segment += 1;
      finalPc = cpu.pc & 0xFFFFFF;
      nextDisplay = `${hex(RETURN_SENTINEL)} => ${hex(EVENT_LOOP_REENTRY)}`;
      notes.push(`return-sentinel->reentry#${segment}`);
      notes.push(`preserve-D0058E=${hexByte(preservedKey)}`);
    }

    visitLog.push({
      step: stepNumber,
      segment: currentSegment,
      pc,
      next: nextDisplay,
      a: cpu.a & 0xFF,
      d0058e: mem[D0058E_ADDR] & 0xFF,
      sp: cpu.sp & 0xFFFFFF,
      notes,
    });
  }

  if (termination === 'step_limit' && executedSteps < maxSteps && !errorMessage) {
    termination = 'completed_early';
  }

  return {
    executedSteps,
    termination,
    haltPc,
    finalPc,
    errorMessage,
    uniqueBlocks,
    visitLog,
    tail,
    stubbedCalls,
    syntheticReentries,
    watchState,
    finalState: {
      d00000: mem[D00000_ADDR] & 0xFF,
      d0058c: mem[D0058C_ADDR] & 0xFF,
      d0058d: mem[D0058D_ADDR] & 0xFF,
      d0058e: mem[D0058E_ADDR] & 0xFF,
      d0059f: mem[D0059F_ADDR] & 0xFF,
      d007e0: mem[D007E0_ADDR] & 0xFF,
      d00824: mem[D00824_ADDR] & 0xFF,
      d0009d: mem[D0009D_ADDR] & 0xFF,
      d003e0: mem[D003E0_ADDR] & 0xFF,
      d02a86: mem[D02A86_ADDR] & 0xFF,
      editBuffer: bytesToHex(mem, EDIT_BUF_START, EDIT_BUF_LENGTH),
      sp: cpu.sp & 0xFFFFFF,
    },
  };
}

function printBootSummary(bootInfo, memInit, stages) {
  console.log('=== Phase 249: Event Loop Digit Trace ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
  console.log('');
  console.log('Boot sequence:');
  console.log(
    `  cold boot: steps=${bootInfo.boot.steps} term=${bootInfo.boot.termination} lastPc=${hex(bootInfo.boot.lastPc)}`,
  );
  console.log(
    `  kernelInit ${hex(KERNEL_INIT_ENTRY)}: steps=${bootInfo.kernelInit.steps} term=${bootInfo.kernelInit.termination} lastPc=${hex(bootInfo.kernelInit.lastPc)}`,
  );
  console.log(
    `  postInit ${hex(POST_INIT_ENTRY)}: steps=${bootInfo.postInit.steps} term=${bootInfo.postInit.termination} lastPc=${hex(bootInfo.postInit.lastPc)}`,
  );
  console.log(
    `  memInit ${hex(MEM_INIT_ENTRY)}: steps=${memInit.steps} term=${memInit.termination} hitStop=${memInit.hitStop} lastPc=${hex(memInit.lastPc)}`,
  );
  for (const stage of stages) {
    console.log(
      `  ${stage.label}: entry=${hex(stage.entry)} steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)}`,
    );
  }
  console.log('');
}

function printInitialHalt(initialRun) {
  console.log('Event loop idle probe:');
  if (!initialRun.completed) {
    console.log(
      `  FAILED: reason=${initialRun.reason} steps=${initialRun.steps} finalPc=${hex(initialRun.finalPc)}`,
    );
    return;
  }

  console.log(`  First HALT reached at ${hex(initialRun.haltPc)} after ${initialRun.steps} block steps`);
  console.log(`  Expected idle HALT: ${hex(IDLE_HALT_PC)} (${initialRun.haltPc === IDLE_HALT_PC ? 'matched' : 'different'})`);
  if (initialRun.stubbedCalls.length) {
    console.log('  Stubbed blocks before idle HALT:');
    for (const stub of initialRun.stubbedCalls) {
      console.log(`    step ${String(stub.step).padStart(4, ' ')}  ${hex(stub.pc)}  ${STUB_MAP.get(stub.pc)?.label ?? ''}`);
    }
  }
  console.log('');
}

function injectKey(mem, haltPc) {
  const beforeFlag = mem[D0009D_ADDR] & 0xFF;
  mem[D0058C_ADDR] = KEY_SCAN_CODE;
  mem[D0058E_ADDR] = KEY_CODE;
  mem[D0009D_ADDR] = beforeFlag | 0x01;

  console.log('Key injection:');
  console.log(`  D0058C <= ${hexByte(KEY_SCAN_CODE)}`);
  console.log(`  D0058E <= ${hexByte(KEY_CODE)}`);
  console.log(`  D0009D bit0: ${hexByte(beforeFlag)} -> ${hexByte(mem[D0009D_ADDR])}`);
  console.log(`  Resume PC: ${hex(haltPc + HALT_RESUME_OFFSET)}`);
  console.log('');
}

function printWatchSummary(watchState) {
  console.log('Watched addresses:');
  for (const watch of watchState) {
    const exactBlockSummary = `ADL=${watch.exactAdlBlock ? 'yes' : 'no'} Z80=${watch.exactZ80Block ? 'yes' : 'no'}`;
    const hitSummary = watch.hits > 0
      ? `HIT firstStep=${watch.firstStep} visits=${watch.hits}`
      : 'MISS';
    console.log(`  ${hex(watch.addr)}  ${hitSummary}  exactBlocks(${exactBlockSummary})  ${watch.label}`);
  }
  console.log('');
}

function printTraceLog(trace) {
  console.log(`Trace log after key injection (${trace.executedSteps} steps, limit=${TRACE_STEP_LIMIT}):`);
  for (const entry of trace.visitLog) {
    const noteText = entry.notes.length ? ` [${entry.notes.join('; ')}]` : '';
    console.log(
      `  [${String(entry.step).padStart(5, '0')}] seg=${entry.segment} pc=${hex(entry.pc)} -> ${entry.next} ` +
      `A=${hexByte(entry.a)} D0058E=${hexByte(entry.d0058e)} SP=${hex(entry.sp)}${noteText}`,
    );
  }
  console.log('');
}

function printTraceSummary(trace) {
  console.log('Trace summary:');
  console.log(`  Termination: ${trace.termination}`);
  console.log(`  Steps: ${trace.executedSteps}`);
  console.log(`  Final PC: ${hex(trace.finalPc)}`);
  console.log(`  Final HALT PC: ${trace.haltPc !== null ? hex(trace.haltPc) : 'n/a'}`);
  console.log(`  Unique blocks: ${trace.uniqueBlocks.length}`);
  console.log(`  Synthetic reentries: ${trace.syntheticReentries.length}`);
  console.log(`  Stubbed blocks during trace: ${trace.stubbedCalls.length}`);
  if (trace.syntheticReentries.length) {
    console.log('  Reentry timeline:');
    for (const reentry of trace.syntheticReentries) {
      console.log(
        `    step ${String(reentry.step).padStart(5, ' ')}  ${hex(reentry.fromPc)} -> ${hex(reentry.returnPc)} -> ${hex(reentry.reentryPc)} ` +
        `D0058E=${hexByte(reentry.preservedKey)}`,
      );
    }
  }
  if (trace.tail.length) {
    console.log(`  Tail (${trace.tail.length} blocks): ${trace.tail.map((pc) => hex(pc)).join(' -> ')}`);
  }
  if (trace.errorMessage) {
    console.log('  Error:');
    console.log(trace.errorMessage);
  }
  console.log('');
}

function printFinalRam(trace) {
  console.log('Final RAM state:');
  console.log(`  D00000: ${hexByte(trace.finalState.d00000)}`);
  console.log(`  D0058C: ${hexByte(trace.finalState.d0058c)}`);
  console.log(`  D0058D: ${hexByte(trace.finalState.d0058d)}`);
  console.log(`  D0058E: ${hexByte(trace.finalState.d0058e)}`);
  console.log(`  D0059F: ${hexByte(trace.finalState.d0059f)}`);
  console.log(`  D007E0: ${hexByte(trace.finalState.d007e0)}`);
  console.log(`  D00824: ${hexByte(trace.finalState.d00824)}`);
  console.log(`  D0009D: ${hexByte(trace.finalState.d0009d)}`);
  console.log(`  D003E0: ${hexByte(trace.finalState.d003e0)}`);
  console.log(`  D02A86: ${hexByte(trace.finalState.d02a86)}`);
  console.log(`  D00A00-D00A10: ${trace.finalState.editBuffer}`);
  console.log(`  SP: ${hex(trace.finalState.sp)}`);
  console.log('');
}

function printConclusion(trace) {
  const anyWatchedHit = trace.watchState.some((watch) => watch.hits > 0);
  console.log('Conclusion:');
  console.log(`  Any watched digit-processing blocks reached: ${anyWatchedHit ? 'yes' : 'no'}`);
  console.log(`  Key consumed (D0058E == 0x00): ${trace.finalState.d0058e === 0x00 ? 'yes' : 'no'}`);
  console.log(
    `  Edit buffer changed from zero fill: ${trace.finalState.editBuffer === '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00' ? 'no' : 'yes'}`,
  );
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
    const initialRun = stepUntilHalt(cpu, FIRST_HALT_STEP_LIMIT);
    printInitialHalt(initialRun);
    if (!initialRun.completed) {
      process.exitCode = 1;
      return;
    }

    injectKey(mem, initialRun.haltPc);

    cpu.halted = false;
    cpu.pc = (initialRun.haltPc + HALT_RESUME_OFFSET) & 0xFFFFFF;

    const watchState = buildWatchState(executor);
    const trace = traceDigitPath(cpu, mem, TRACE_STEP_LIMIT, watchState);

    printWatchSummary(trace.watchState);
    printTraceLog(trace);
    printTraceSummary(trace);
    printFinalRam(trace);
    printConclusion(trace);

    process.exitCode = trace.termination === 'exception' ? 1 : 0;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
