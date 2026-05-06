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

// Y= loop addresses
const SCREEN_UPDATE_LOOP = 0x0A1B59;
const ROW_INDEX_COMP = 0x0A29D6;
const D00596_ADDR = 0xD00596;
const D00595_ADDR = 0xD00595;
const D02505_ADDR = 0xD02505;

const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const TRACE_MAX_STEPS = 1000;

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
  const error = new Error('__PHASE198_SENTINEL__');
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

// -- Loop Entry Experiment --

function runLoopEntryExperiment(label, counterValue, executor, cpu, mem, baselineMem) {
  // Reset memory to baseline
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  // Set up context per spec
  cpu._ix = IX_ADDR;
  cpu._iy = IY_ADDR;
  mem[D00595_ADDR] = 0xFF;  // attribute flag
  mem[D02505_ADDR] = 0x00;  // comparison target (so check does not short-circuit)
  mem[D00596_ADDR] = counterValue;

  // Push return sentinel onto stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);
  // Extra stack frames for nested calls
  for (let i = 0; i < 8; i++) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }

  // Track block visits and VRAM writes
  const blockTrace = [];
  const uniqueBlockSet = new Set();
  let rowIndexCompReached = false;
  let totalSteps = 0;
  let currentPc = SCREEN_UPDATE_LOOP;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;

  // VRAM write tracking
  const vramWrites = [];
  let totalVramWrites = 0;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function trackVramWrite(addr, width, value, originalFn) {
    const normalizedAddr = addr & 0xFFFFFF;
    const result = originalFn(normalizedAddr, value);
    if (normalizedAddr >= VRAM_START && normalizedAddr < VRAM_END) {
      totalVramWrites++;
      if (vramWrites.length < 5) {
        vramWrites.push(hex(normalizedAddr));
      }
    }
    return result;
  }

  cpu.write8 = (addr, value) => trackVramWrite(addr, 1, value, originalWrite8);
  cpu.write16 = (addr, value) => trackVramWrite(addr, 2, value, originalWrite16);
  cpu.write24 = (addr, value) => trackVramWrite(addr, 3, value, originalWrite24);

  const noteBlock = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    blockTrace.push(normalizedPc);
    uniqueBlockSet.add(normalizedPc);
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

  // Restore original writes
  cpu.write8 = originalWrite8;
  cpu.write16 = originalWrite16;
  cpu.write24 = originalWrite24;

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
    totalSteps,
    stopReason,
    uniqueBlocks: Array.from(uniqueBlockSet).map(pc => hex(pc)),
    uniqueBlockCount: uniqueBlockSet.size,
    rowIndexCompReached,
    totalVramWrites,
    first5VramAddresses: vramWrites,
    finalD00596: hex(mem[D00596_ADDR], 2),
    finalPc: hex(currentPc),
    first20Blocks: blockTrace.slice(0, 20).map(pc => hex(pc)),
    totalBlocksVisited: blockTrace.length,
    errorMessage,
  };
}

// -- Main --

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Boot + MemInit + CreateReal(Ans)
  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase198-yeq-loop-entry',
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
      probe: 'phase198-yeq-loop-entry',
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

  // Run 5 experiments with different counter values at 0xD00596
  const expA = runLoopEntryExperiment('Exp_A (counter=0x19)', 0x19, executor, cpu, mem, baselineMem);
  const expB = runLoopEntryExperiment('Exp_B (counter=0x15)', 0x15, executor, cpu, mem, baselineMem);
  const expC = runLoopEntryExperiment('Exp_C (counter=0x10)', 0x10, executor, cpu, mem, baselineMem);
  const expD = runLoopEntryExperiment('Exp_D (counter=0x05)', 0x05, executor, cpu, mem, baselineMem);
  const expE = runLoopEntryExperiment('Exp_E (counter=0x00)', 0x00, executor, cpu, mem, baselineMem);

  // Compare block traces between experiments
  const traceA = expA.first20Blocks.join(',');
  const traceB = expB.first20Blocks.join(',');
  const traceC = expC.first20Blocks.join(',');
  const traceD = expD.first20Blocks.join(',');
  const traceE = expE.first20Blocks.join(',');

  const allTracesIdentical = (traceA === traceB) && (traceB === traceC) && (traceC === traceD) && (traceD === traceE);
  const uniqueTraceCount = new Set([traceA, traceB, traceC, traceD, traceE]).size;

  // Compare unique block sets
  const blocksA = expA.uniqueBlocks.sort().join(',');
  const blocksB = expB.uniqueBlocks.sort().join(',');
  const blocksC = expC.uniqueBlocks.sort().join(',');
  const blocksD = expD.uniqueBlocks.sort().join(',');
  const blocksE = expE.uniqueBlocks.sort().join(',');

  const allBlockSetsIdentical = (blocksA === blocksB) && (blocksB === blocksC) && (blocksC === blocksD) && (blocksD === blocksE);
  const uniqueBlockSetCount = new Set([blocksA, blocksB, blocksC, blocksD, blocksE]).size;

  const comparison = {
    blockTracesIdentical: allTracesIdentical,
    uniqueTracePatterns: uniqueTraceCount,
    blockSetsIdentical: allBlockSetsIdentical,
    uniqueBlockSetPatterns: uniqueBlockSetCount,
    conclusion: allTracesIdentical
      ? 'NO DIFFERENCE: Counter value does NOT affect block trace from 0x0A1B59. Row selection must happen elsewhere.'
      : 'DIFFERENT TRACES: Counter value DOES affect execution path from 0x0A1B59. Row mapping happens in the loop body.',
    vramWritesDiffer: !(expA.totalVramWrites === expB.totalVramWrites &&
                        expB.totalVramWrites === expC.totalVramWrites &&
                        expC.totalVramWrites === expD.totalVramWrites &&
                        expD.totalVramWrites === expE.totalVramWrites),
    d00596FinalsDiffer: !(expA.finalD00596 === expB.finalD00596 &&
                          expB.finalD00596 === expC.finalD00596 &&
                          expC.finalD00596 === expD.finalD00596 &&
                          expD.finalD00596 === expE.finalD00596),
  };

  console.log(JSON.stringify({
    probe: 'phase198-yeq-loop-entry',
    status: 'completed',
    description: 'Enter Y= screen update loop at 0x0A1B59 with different counter values at 0xD00596',
    hypothesis: 'Row selection happens in the CALLER (0x0A1B59) before renderer 0x0A1799 is called',
    keyAddresses: {
      loopEntry: hex(SCREEN_UPDATE_LOOP),
      rowIndexComputation: hex(ROW_INDEX_COMP),
      rowCounter: hex(D00596_ADDR),
      attributeFlag: hex(D00595_ADDR),
      comparisonTarget: hex(D02505_ADDR),
    },
    setup: {
      D00595: '0xFF (attribute flag set)',
      D02505: '0x00 (comparison target, prevents short-circuit)',
      IX: hex(IX_ADDR),
      IY: hex(IY_ADDR),
      SP: 'STACK_TOP with sentinel at 0x7FFFF0',
      maxSteps: TRACE_MAX_STEPS,
    },
    boot,
    memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination },
    createReal: { hit: createReal.hit, steps: createReal.steps, termination: createReal.termination },
    experiments: {
      A: expA,
      B: expB,
      C: expC,
      D: expD,
      E: expE,
    },
    comparison,
  }, null, 2));
}

main();