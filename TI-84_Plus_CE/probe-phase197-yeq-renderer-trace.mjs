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
const TRACE_RET = 0x7FFFF0;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;

// Y= renderer addresses
const YEQ_RENDERER_ENTRY = 0x0A1799;
const D00596_ADDR = 0xD00596;
const D00595_ADDR = 0xD00595;
const VRAM_CURSOR_ADDR = 0xD0059C; // 3-byte LE pointer
const GLYPH_LOADER = 0x07BF61;
const ROW_INDEX_COMP = 0x0A29D6;

const TRACE_MAX_STEPS = 500;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE197_SENTINEL__');
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

// ── Renderer Trace Experiment ──

function runRendererExperiment(label, counterValue, executor, cpu, mem, baselineMem) {
  // Reset memory to baseline
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  // Set up Y= renderer context
  mem[D00596_ADDR] = counterValue;
  mem[D00595_ADDR] = 0x00;
  cpu.a = 0x3A; // colon character loaded by caller at 0x0A1B59

  // VRAM cursor at 0xD0059C = 0xD40000 (valid VRAM start)
  write24(mem, VRAM_CURSOR_ADDR, 0xD40000);

  // Push return sentinel onto stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);
  // Push a few more for nested calls
  for (let i = 0; i < 6; i++) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }

  // Track block visits
  const blockTrace = [];
  const uniqueBlockSet = new Set();
  let glyphLoaderReached = false;
  let rowIndexCompReached = false;
  let totalSteps = 0;
  let currentPc = YEQ_RENDERER_ENTRY;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;

  const noteBlock = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    blockTrace.push(normalizedPc);
    uniqueBlockSet.add(normalizedPc);
    if (normalizedPc === GLYPH_LOADER) glyphLoaderReached = true;
    if (normalizedPc === ROW_INDEX_COMP) rowIndexCompReached = true;
    if (normalizedPc === TRACE_RET) {
      throw makeSentinelError('ret', normalizedPc);
    }
  };

  try {
    while (totalSteps < TRACE_MAX_STEPS && !hit) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc) { noteBlock(pc); },
          onMissingBlock(pc) { noteBlock(pc); },
        });
        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        if (error?.isSentinel) {
          hit = error.hit;
          termination = 'sentinel';
          break;
        }
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } catch (_) { /* handled above */ }

  // Determine stop reason
  let stopReason = 'unknown';
  if (hit === 'ret') stopReason = 'sentinel';
  else if (termination === 'halt') stopReason = 'halt';
  else if (termination === 'missing_block') stopReason = 'missing_block';
  else if (totalSteps >= TRACE_MAX_STEPS) stopReason = 'step_limit';
  else if (termination) stopReason = termination;

  return {
    label,
    counterValue: hex(counterValue, 2),
    expectedRow: `Y${counterValue + 1}=`,
    totalSteps,
    stopReason,
    uniqueBlockCount: uniqueBlockSet.size,
    first30Blocks: blockTrace.slice(0, 30).map(pc => hex(pc)),
    totalBlocksVisited: blockTrace.length,
    glyphLoaderReached,
    rowIndexCompReached,
    finalPc: hex(currentPc),
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

  // Boot + MemInit + CreateReal(Ans) — same as phase196
  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase197-yeq-renderer-trace',
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
      probe: 'phase197-yeq-renderer-trace',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      createReal: {
        hit: createReal.hit,
        steps: createReal.steps,
        termination: createReal.termination,
        lastPc: hex(createReal.lastPc),
        errorMessage: createReal.errorMessage,
      },
    }, null, 2));
    return;
  }

  // Save baseline memory
  const baselineMem = mem.slice();

  // Run 3 experiments with different counter values
  const experimentA = runRendererExperiment('row_0 (Y1=)', 0x00, executor, cpu, mem, baselineMem);
  const experimentB = runRendererExperiment('row_1 (Y2=)', 0x01, executor, cpu, mem, baselineMem);
  const experimentC = runRendererExperiment('row_5 (Y6=)', 0x05, executor, cpu, mem, baselineMem);

  console.log(JSON.stringify({
    probe: 'phase197-yeq-renderer-trace',
    status: 'completed',
    description: 'Trace Y= renderer at 0x0A1799 with different row counter values',
    keyAddresses: {
      rendererEntry: hex(YEQ_RENDERER_ENTRY),
      rowCounter: hex(D00596_ADDR),
      rowComparison: hex(D00595_ADDR),
      vramCursor: hex(VRAM_CURSOR_ADDR),
      glyphLoader: hex(GLYPH_LOADER),
      rowIndexComputation: hex(ROW_INDEX_COMP),
    },
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
    },
    experiments: {
      A: experimentA,
      B: experimentB,
      C: experimentC,
    },
  }, null, 2));
}

main();
