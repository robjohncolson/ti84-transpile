#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const OP1_ADDR = 0xD005F8;
const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFFE;
const BOOT_CRASH_PC = 0x000000;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;
const WRITE_EVENT_LIMIT = 256;

// Y= editor addresses
const YEQ_ENTRY_FULL = 0x09CB14;       // CALL 0x0A2B72 then JR to loop
const YEQ_ENTRY_LOOP = 0x09CB08;       // loop body: CALL 0x05E27E, DEC, CALL 0x0A1B59
const ATTR_UPDATER = 0x0A2B72;         // attribute updater standalone
const D00596_ADDR = 0xD00596;
const D00595_ADDR = 0xD00595;

const RAM_WATCH_START = 0xD00590;
const RAM_WATCH_END = 0xD005A1;         // 0xD00590-0xD005A0 inclusive
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function bytesToString(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatWriteValue(width, value) {
  return hex(value, Math.max(2, width * 2));
}

function snapshotCpu(cpu, pc = cpu._currentBlockPc ?? 0) {
  return {
    pc: hex(pc),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE195_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
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
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw makeSentinelError(name, normalizedPc);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = 'sentinel';
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function overlapRange(addr, width, start, end) {
  const normalizedAddr = addr & 0xFFFFFF;
  const normalizedWidth = Math.max(1, width | 0);
  const overlapStart = Math.max(normalizedAddr, start);
  const overlapEnd = Math.min(normalizedAddr + normalizedWidth, end);
  if (overlapStart >= overlapEnd) return null;
  return {
    start: overlapStart,
    length: overlapEnd - overlapStart,
  };
}

function installWriteWatcher(cpu, mem, state, start, end) {
  const events = [];
  let totalWrites = 0;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordWrite(addr, width, value, originalWrite) {
    const normalizedAddr = Number(addr) & 0xFFFFFF;
    const hit = overlapRange(normalizedAddr, width, start, end);
    const before = hit ? Array.from(mem.slice(hit.start, hit.start + hit.length)) : null;
    const result = originalWrite(normalizedAddr, value);
    if (!hit) return result;

    totalWrites += 1;
    if (events.length < WRITE_EVENT_LIMIT) {
      const after = Array.from(mem.slice(hit.start, hit.start + hit.length));
      events.push({
        step: state.currentStep,
        pc: hex(state.currentPc),
        addr: hex(normalizedAddr),
        width,
        value: formatWriteValue(width, value),
        overlap: `${hex(hit.start)}+${hit.length}`,
        before: bytesToString(before),
        after: bytesToString(after),
      });
    }
    return result;
  }

  cpu.write8 = (addr, value) => recordWrite(addr, 1, value, originalWrite8);
  cpu.write16 = (addr, value) => recordWrite(addr, 2, value, originalWrite16);
  cpu.write24 = (addr, value) => recordWrite(addr, 3, value, originalWrite24);

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    return { totalWrites, events };
  };
}

function normalizeTermination(hit, termination, maxStepsReached) {
  if (hit === 'ret') return 'returned';
  if (hit === 'boot') return 'boot_crash';
  if (termination === 'exception') return 'exception';
  if (termination === 'error') return 'error';
  if (termination === 'missing_block') return 'missing_block';
  if (termination === 'halt') return 'halt';
  if (termination === 'sleep') return 'sleep';
  if (termination === 'no_return') return 'no_return';
  if (maxStepsReached || termination === 'max_steps') return 'step_limit';
  return termination ?? 'completed';
}

// ── Experiment A: Full 0x09CB14 trace with 20000-step limit ──

function runExperimentA(executor, cpu, mem, baselineMem) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const uniqueBlocks = new Set();
  const blockPcs = [];
  const missingBlocks = [];
  const missingSeen = new Set();
  const d00596Values = [];
  const iterationBlocks = [];
  let currentIterationBlocks = [];

  const MAX_STEPS = 20000;
  const state = { currentPc: YEQ_ENTRY_FULL, currentStep: 0 };

  const restoreWatcher = installWriteWatcher(cpu, mem, state, RAM_WATCH_START, RAM_WATCH_END);

  let totalSteps = 0;
  let currentPc = YEQ_ENTRY_FULL;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let lastObservedStep = 0;
  let lastD00596 = mem[D00596_ADDR];

  // Track the initial value
  d00596Values.push({ step: 0, value: hex(lastD00596, 2), event: 'initial' });

  const noteBlock = (pc, mode, stepBase, stepInSegment, missing = false) => {
    const normalizedPc = pc & 0xFFFFFF;
    const visitStep = stepBase + (stepInSegment ?? 0) + 1;
    lastObservedStep = Math.max(lastObservedStep, visitStep);
    state.currentPc = normalizedPc;
    state.currentStep = visitStep;
    lastPc = normalizedPc;
    lastMode = mode ?? lastMode;

    if (!uniqueBlocks.has(normalizedPc)) {
      uniqueBlocks.add(normalizedPc);
      blockPcs.push(normalizedPc);
    }

    currentIterationBlocks.push(normalizedPc);

    if (missing && !missingSeen.has(normalizedPc)) {
      missingSeen.add(normalizedPc);
      missingBlocks.push(normalizedPc);
    }

    // Check if 0xD00596 changed
    const curVal = mem[D00596_ADDR];
    if (curVal !== lastD00596) {
      // New iteration boundary
      iterationBlocks.push(currentIterationBlocks.map((p) => hex(p)));
      currentIterationBlocks = [];
      d00596Values.push({ step: visitStep, value: hex(curVal, 2), event: 'changed' });
      lastD00596 = curVal;
    }

    if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
    if (normalizedPc === BOOT_CRASH_PC) throw makeSentinelError('boot', normalizedPc);
  };

  try {
    while (totalSteps < MAX_STEPS && !hit) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MAX_STEPS - totalSteps);
      const stepBase = totalSteps;

      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step, false); },
          onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step, true); },
        });

        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        lastPc = currentPc;
        lastMode = currentMode;
        state.currentPc = currentPc;
        state.currentStep = totalSteps;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        if (error?.isSentinel) {
          hit = error.hit;
          termination = 'sentinel';
          lastPc = error.pc;
          totalSteps = Math.max(totalSteps, lastObservedStep);
          break;
        }
        totalSteps = Math.max(totalSteps, lastObservedStep);
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } finally {
    // Flush remaining iteration blocks
    if (currentIterationBlocks.length > 0) {
      iterationBlocks.push(currentIterationBlocks.map((p) => hex(p)));
    }
  }

  const watched = restoreWatcher();
  const maxStepsReached = totalSteps >= MAX_STEPS && hit === null;
  const normalizedTermination = normalizeTermination(hit, termination, maxStepsReached);

  return {
    experiment: 'A',
    description: 'Full 0x09CB14 trace with default state',
    entry: hex(YEQ_ENTRY_FULL),
    stepLimit: MAX_STEPS,
    steps: totalSteps,
    blocks: uniqueBlocks.size,
    termination: normalizedTermination,
    sentinelHit: hit ? (hit === 'ret' ? hex(TRACE_RET) : hex(BOOT_CRASH_PC)) : null,
    lastPc: hex(lastPc),
    lastMode,
    finalRegs: snapshotCpu(cpu, lastPc),
    d00596Trace: d00596Values,
    d00596Final: hex(mem[D00596_ADDR], 2),
    iterationCount: iterationBlocks.length,
    iterationBlockCounts: iterationBlocks.map((blocks) => blocks.length),
    ramWrites: watched.events,
    ramWriteCount: watched.totalWrites,
    missingBlocks: missingBlocks.map((pc) => hex(pc)),
    errorMessage,
  };
}

// ── Experiment B: Seeded 0xD00596=3, enter at 0x09CB08 ──

function runExperimentSeeded(executor, cpu, mem, baselineMem, seedValue, label) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  // Pre-seed 0xD00596
  mem[D00596_ADDR] = seedValue;

  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const uniqueBlocks = new Set();
  const blockPcs = [];
  const missingBlocks = [];
  const missingSeen = new Set();
  const d00596Values = [];
  const iterationBlocks = [];
  let currentIterationBlocks = [];

  const MAX_STEPS = 5000;
  const state = { currentPc: YEQ_ENTRY_LOOP, currentStep: 0 };

  const restoreWatcher = installWriteWatcher(cpu, mem, state, RAM_WATCH_START, RAM_WATCH_END);

  let totalSteps = 0;
  let currentPc = YEQ_ENTRY_LOOP;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let lastObservedStep = 0;
  let lastD00596 = mem[D00596_ADDR];

  d00596Values.push({ step: 0, value: hex(lastD00596, 2), event: 'initial (seeded)' });

  const noteBlock = (pc, mode, stepBase, stepInSegment, missing = false) => {
    const normalizedPc = pc & 0xFFFFFF;
    const visitStep = stepBase + (stepInSegment ?? 0) + 1;
    lastObservedStep = Math.max(lastObservedStep, visitStep);
    state.currentPc = normalizedPc;
    state.currentStep = visitStep;
    lastPc = normalizedPc;
    lastMode = mode ?? lastMode;

    if (!uniqueBlocks.has(normalizedPc)) {
      uniqueBlocks.add(normalizedPc);
      blockPcs.push(normalizedPc);
    }

    currentIterationBlocks.push(normalizedPc);

    if (missing && !missingSeen.has(normalizedPc)) {
      missingSeen.add(normalizedPc);
      missingBlocks.push(normalizedPc);
    }

    const curVal = mem[D00596_ADDR];
    if (curVal !== lastD00596) {
      iterationBlocks.push(currentIterationBlocks.map((p) => hex(p)));
      currentIterationBlocks = [];
      d00596Values.push({ step: visitStep, value: hex(curVal, 2), event: 'decremented' });
      lastD00596 = curVal;
    }

    if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
    if (normalizedPc === BOOT_CRASH_PC) throw makeSentinelError('boot', normalizedPc);
  };

  try {
    while (totalSteps < MAX_STEPS && !hit) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MAX_STEPS - totalSteps);
      const stepBase = totalSteps;

      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step, false); },
          onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step, true); },
        });

        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        lastPc = currentPc;
        lastMode = currentMode;
        state.currentPc = currentPc;
        state.currentStep = totalSteps;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        if (error?.isSentinel) {
          hit = error.hit;
          termination = 'sentinel';
          lastPc = error.pc;
          totalSteps = Math.max(totalSteps, lastObservedStep);
          break;
        }
        totalSteps = Math.max(totalSteps, lastObservedStep);
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } finally {
    if (currentIterationBlocks.length > 0) {
      iterationBlocks.push(currentIterationBlocks.map((p) => hex(p)));
    }
  }

  const watched = restoreWatcher();
  const maxStepsReached = totalSteps >= MAX_STEPS && hit === null;
  const normalizedTermination = normalizeTermination(hit, termination, maxStepsReached);

  return {
    experiment: label,
    description: `Seeded 0xD00596=${seedValue}, enter at 0x09CB08`,
    entry: hex(YEQ_ENTRY_LOOP),
    seedValue: hex(seedValue, 2),
    stepLimit: MAX_STEPS,
    steps: totalSteps,
    blocks: uniqueBlocks.size,
    blockPcs: blockPcs.map((pc) => hex(pc)),
    termination: normalizedTermination,
    sentinelHit: hit ? (hit === 'ret' ? hex(TRACE_RET) : hex(BOOT_CRASH_PC)) : null,
    lastPc: hex(lastPc),
    lastMode,
    finalRegs: snapshotCpu(cpu, lastPc),
    d00596Trace: d00596Values,
    d00596Final: hex(mem[D00596_ADDR], 2),
    iterationCount: iterationBlocks.length,
    iterationBlockCounts: iterationBlocks.map((blocks) => blocks.length),
    ramWrites: watched.events,
    ramWriteCount: watched.totalWrites,
    missingBlocks: missingBlocks.map((pc) => hex(pc)),
    errorMessage,
  };
}

// ── Experiment D: 0x0A2B72 standalone with different initial values ──

function runExperimentD(executor, cpu, mem, baselineMem) {
  const testValues = [0x00, 0x05, 0x19, 0xFF];
  const results = [];

  for (const initValue of testValues) {
    mem.set(baselineMem);
    resetCpuForOsCall(cpu, mem);

    // Set initial values
    mem[D00596_ADDR] = initValue;
    mem[D00595_ADDR] = 0x00;

    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);

    const uniqueBlocks = new Set();
    const blockPcs = [];
    const missingBlocks = [];
    const missingSeen = new Set();

    const state = { currentPc: ATTR_UPDATER, currentStep: 0 };
    const restoreWatcher = installWriteWatcher(cpu, mem, state, RAM_WATCH_START, RAM_WATCH_END);

    let totalSteps = 0;
    let currentPc = ATTR_UPDATER;
    let currentMode = 'adl';
    let termination = null;
    let errorMessage = null;
    let hit = null;
    let lastPc = currentPc;
    let lastMode = currentMode;
    let lastObservedStep = 0;

    const d00596Before = mem[D00596_ADDR];
    const d00595Before = mem[D00595_ADDR];

    const noteBlock = (pc, mode, stepBase, stepInSegment, missing = false) => {
      const normalizedPc = pc & 0xFFFFFF;
      const visitStep = stepBase + (stepInSegment ?? 0) + 1;
      lastObservedStep = Math.max(lastObservedStep, visitStep);
      state.currentPc = normalizedPc;
      state.currentStep = visitStep;
      lastPc = normalizedPc;
      lastMode = mode ?? lastMode;

      if (!uniqueBlocks.has(normalizedPc)) {
        uniqueBlocks.add(normalizedPc);
        blockPcs.push(normalizedPc);
      }

      if (missing && !missingSeen.has(normalizedPc)) {
        missingSeen.add(normalizedPc);
        missingBlocks.push(normalizedPc);
      }

      if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
      if (normalizedPc === BOOT_CRASH_PC) throw makeSentinelError('boot', normalizedPc);
    };

    const TRACE_MAX = 3000;

    try {
      while (totalSteps < TRACE_MAX && !hit) {
        const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX - totalSteps);
        const stepBase = totalSteps;

        try {
          const result = executor.runFrom(currentPc, currentMode, {
            maxSteps: segmentBudget,
            maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
            onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step, false); },
            onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step, true); },
          });

          totalSteps += result.steps ?? 0;
          currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
          currentMode = result.lastMode ?? currentMode;
          lastPc = currentPc;
          lastMode = currentMode;
          state.currentPc = currentPc;
          state.currentStep = totalSteps;
          termination = result.termination ?? null;
          if (result.error) errorMessage = result.error?.stack ?? String(result.error);
          if (termination !== 'max_steps') break;
        } catch (error) {
          if (error?.isSentinel) {
            hit = error.hit;
            termination = 'sentinel';
            lastPc = error.pc;
            totalSteps = Math.max(totalSteps, lastObservedStep);
            break;
          }
          totalSteps = Math.max(totalSteps, lastObservedStep);
          errorMessage = error?.stack ?? String(error);
          termination = 'exception';
          break;
        }
      }
    } catch (_) { /* handled above */ }

    const watched = restoreWatcher();
    const maxStepsReached = totalSteps >= TRACE_MAX && hit === null;
    const normalizedTermination = normalizeTermination(hit, termination, maxStepsReached);

    results.push({
      initD00596: hex(d00596Before, 2),
      initD00595: hex(d00595Before, 2),
      finalD00596: hex(mem[D00596_ADDR], 2),
      finalD00595: hex(mem[D00595_ADDR], 2),
      d00596Changed: mem[D00596_ADDR] !== d00596Before,
      d00595Changed: mem[D00595_ADDR] !== d00595Before,
      steps: totalSteps,
      blocks: uniqueBlocks.size,
      blockPcs: blockPcs.map((pc) => hex(pc)),
      termination: normalizedTermination,
      lastPc: hex(lastPc),
      ramWrites: watched.events,
      ramWriteCount: watched.totalWrites,
      missingBlocks: missingBlocks.map((pc) => hex(pc)),
      errorMessage,
    });
  }

  return {
    experiment: 'D',
    description: '0x0A2B72 standalone with different initial D00596 values',
    entry: hex(ATTR_UPDATER),
    testCases: results,
    alwaysWrites0x19: results.every((r) => r.finalD00596 === '0x19'),
  };
}

// ── Experiment E: VRAM inspection after single iteration ──

function runExperimentE(executor, cpu, mem, baselineMem) {
  // First, run a single iteration (same as Experiment C)
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);
  mem[D00596_ADDR] = 1;
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  // Zero out VRAM so we can detect writes
  mem.fill(0, VRAM_START, VRAM_END);

  const uniqueBlocks = new Set();
  const state = { currentPc: YEQ_ENTRY_LOOP, currentStep: 0 };

  // Watch VRAM this time
  const restoreWatcher = installWriteWatcher(cpu, mem, state, VRAM_START, VRAM_END);

  let totalSteps = 0;
  let currentPc = YEQ_ENTRY_LOOP;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let lastObservedStep = 0;

  const MAX_STEPS = 5000;

  const noteBlock = (pc, mode, stepBase, stepInSegment, missing = false) => {
    const normalizedPc = pc & 0xFFFFFF;
    const visitStep = stepBase + (stepInSegment ?? 0) + 1;
    lastObservedStep = Math.max(lastObservedStep, visitStep);
    state.currentPc = normalizedPc;
    state.currentStep = visitStep;
    lastPc = normalizedPc;
    lastMode = mode ?? lastMode;

    if (!uniqueBlocks.has(normalizedPc)) {
      uniqueBlocks.add(normalizedPc);
    }

    if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
    if (normalizedPc === BOOT_CRASH_PC) throw makeSentinelError('boot', normalizedPc);
  };

  try {
    while (totalSteps < MAX_STEPS && !hit) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MAX_STEPS - totalSteps);
      const stepBase = totalSteps;

      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step, false); },
          onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step, true); },
        });

        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        lastPc = currentPc;
        lastMode = currentMode;
        state.currentPc = currentPc;
        state.currentStep = totalSteps;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        if (error?.isSentinel) {
          hit = error.hit;
          termination = 'sentinel';
          lastPc = error.pc;
          totalSteps = Math.max(totalSteps, lastObservedStep);
          break;
        }
        totalSteps = Math.max(totalSteps, lastObservedStep);
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } catch (_) { /* handled above */ }

  const watched = restoreWatcher();
  const maxStepsReached = totalSteps >= MAX_STEPS && hit === null;
  const normalizedTermination = normalizeTermination(hit, termination, maxStepsReached);

  // Scan VRAM for non-zero regions
  const ROW_BYTES = 320 * 2;  // 320 cols x 2 bytes per pixel (RGB565)
  const TOTAL_ROWS = 240;
  const nonZeroRows = [];
  let totalNonZeroPixels = 0;
  let minCol = 320;
  let maxCol = 0;

  for (let row = 0; row < TOTAL_ROWS; row++) {
    const rowStart = VRAM_START + row * ROW_BYTES;
    let rowHasData = false;
    for (let col = 0; col < 320; col++) {
      const pixelAddr = rowStart + col * 2;
      const pixel = mem[pixelAddr] | (mem[pixelAddr + 1] << 8);
      if (pixel !== 0) {
        rowHasData = true;
        totalNonZeroPixels++;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
    if (rowHasData) {
      nonZeroRows.push(row);
    }
  }

  return {
    experiment: 'E',
    description: 'VRAM inspection after single Y= iteration (D00596=1)',
    entry: hex(YEQ_ENTRY_LOOP),
    steps: totalSteps,
    blocks: uniqueBlocks.size,
    termination: normalizedTermination,
    lastPc: hex(lastPc),
    d00596Final: hex(mem[D00596_ADDR], 2),
    vramWriteCount: watched.totalWrites,
    vramWriteSamples: watched.events.slice(0, 20),
    vramScan: {
      totalNonZeroPixels,
      hasVramData: totalNonZeroPixels > 0,
      nonZeroRowCount: nonZeroRows.length,
      nonZeroRowRange: nonZeroRows.length > 0
        ? { first: nonZeroRows[0], last: nonZeroRows[nonZeroRows.length - 1] }
        : null,
      nonZeroColRange: totalNonZeroPixels > 0
        ? { first: minCol, last: maxCol }
        : null,
    },
    errorMessage,
  };
}

// ── Main ──

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Boot + MemInit + CreateReal(Ans) — same as reference probe
  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase195-yeq-d00596',
      status: 'aborted',
      reason: 'MemInit did not return',
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
        lastPc: hex(memInit.lastPc),
        errorMessage: memInit.errorMessage,
      },
    }, null, 2));
    return;
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase195-yeq-d00596',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
      },
      createReal: {
        hit: createReal.hit,
        steps: createReal.steps,
        termination: createReal.termination,
        lastPc: hex(createReal.lastPc),
        errBase: createReal.errBase,
        errorMessage: createReal.errorMessage,
      },
    }, null, 2));
    return;
  }

  const baselineMem = mem.slice();

  // Run all 5 experiments
  const experimentA = runExperimentA(executor, cpu, mem, baselineMem);
  const experimentB = runExperimentSeeded(executor, cpu, mem, baselineMem, 3, 'B');
  const experimentC = runExperimentSeeded(executor, cpu, mem, baselineMem, 1, 'C');
  const experimentD = runExperimentD(executor, cpu, mem, baselineMem);
  const experimentE = runExperimentE(executor, cpu, mem, baselineMem);

  console.log(JSON.stringify({
    probe: 'phase195-yeq-d00596',
    status: 'completed',
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
    },
    createReal: {
      hit: createReal.hit,
      steps: createReal.steps,
      termination: createReal.termination,
      errBase: createReal.errBase,
    },
    experiments: {
      A: experimentA,
      B: experimentB,
      C: experimentC,
      D: experimentD,
      E: experimentE,
    },
  }, null, 2));
}

main();
