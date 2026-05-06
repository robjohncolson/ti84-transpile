#!/usr/bin/env node
/**
 * probe-phase199-stat-write-watch.mjs
 *
 * Watch writes to RAM 0xD008E6/0xD008E7 during the STAT history path.
 *
 * Experiments:
 *   A. L1 = {1.0, 2.0, 3.0}
 *   B. L1 = {1.0}
 *   C. L1 = {1.0, 2.0, 3.0, 4.0, 5.0}
 *
 * The requested write8 hook is installed verbatim in spirit, and a companion
 * write16 hook is also added because the lifted runtime performs
 * `sis ld (0x0008e6), hl` through `cpu.write16(...)`, which bypasses write8.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const LOAD_BLOCK = 0x092226;
const WATCH_ADDR = 0xD008E6;
const WATCH_ADDR_HI = WATCH_ADDR + 1;
const SCRATCH_SENTINEL = 0x55AA;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE199_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const LIST_DATA_ADDR = 0xD10000;
const VAT_ENTRY_ADDR = 0xD1A800;
const LIST_PTR_TABLE_ADDR = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const CURR_LIST_HIGHLIGHT_ADDR = 0xD0244B;
const LIST_NAME1_ADDR = 0xD02459;
const LIST_NAME_STRIDE = 5;
const LIST_NAME_SLOTS = 20;
const STATFLAGS_ADDR = 0xD00089;
const STATFLAGS2_ADDR = 0xD0009A;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const VAT_ENTRY_BYTES = Uint8Array.from([
  0x01,
  LIST_DATA_ADDR & 0xFF,
  (LIST_DATA_ADDR >>> 8) & 0xFF,
  (LIST_DATA_ADDR >>> 16) & 0xFF,
  0x00,
  0x00,
  0x01,
  0x00,
]);

const EXPERIMENTS = [
  { label: 'A', values: [1, 2, 3] },
  { label: 'B', values: [1] },
  { label: 'C', values: [1, 2, 3, 4, 5] },
];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function write16Raw(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
  mem[(a + 2) & mask] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & mask] = bytes[index] & 0xFF;
  }
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
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
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? STAT_TRACE_MAX_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;
  const onMissingBlock = options.onMissingBlock ?? null;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitSentinel = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hitSentinel) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, meta, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) {
            onBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              meta,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) {
            onMissingBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentObservedSteps;
      if (error?.message === TRACE_STOP) {
        hitSentinel = {
          name: error.stopName,
          pc: hex(error.stopPc),
        };
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (!hitSentinel && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitSentinel,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForStatEntry(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function createRuntimeFromMemory(memImage) {
  const mem = memImage.slice();
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function buildPreparedBaseMemory() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const runtime = createRuntimeFromMemory(mem);
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
      finalMode: memInit.lastMode,
      errorMessage: memInit.errorMessage,
    },
    baseMemory: runtime.mem.slice(),
  };
}

function makeListElements(values) {
  return values.map((value) => Uint8Array.from([
    0x00,
    0x80,
    ((Number(value) & 0x0F) << 4) & 0xF0,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]));
}

function seedStatLists(mem, values) {
  const elements = makeListElements(values);
  const listDataLen = 2 + (elements.length * 9);
  const listDataEnd = LIST_DATA_ADDR + listDataLen;

  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_ADDR + 0x200);
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + 0x20);
  write16Raw(mem, LIST_DATA_ADDR, elements.length);
  for (let index = 0; index < elements.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), elements[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    values,
    elementCount: values.length,
    listDataAddr: hex(LIST_DATA_ADDR),
    listDataLen,
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    pointer0: hex(LIST_DATA_ADDR),
    activeListByte: hex(mem[ACTIVE_LIST_ADDR], 2),
  };
}

function seedScratchSentinel(mem) {
  write16Raw(mem, WATCH_ADDR, SCRATCH_SENTINEL);
  return {
    addr: hex(WATCH_ADDR),
    word: hex(SCRATCH_SENTINEL, 4),
    bytes: {
      e6: hex(mem[WATCH_ADDR], 2),
      e7: hex(mem[WATCH_ADDR_HI], 2),
    },
  };
}

function pushWriteEvent(writeLog, watchState, addr, value, source, word = null) {
  writeLog.push({
    step: watchState.stepCount,
    addr: hex(addr),
    val: hex(value, 2),
    pc: hex(watchState.currentPc),
    block: watchState.currentBlockKey,
    source,
    word,
  });
}

function installScratchWriteWatch(cpu, watchState) {
  const writeLog = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);

  cpu.write8 = function(addr, val) {
    const byteAddr = addr & 0xFFFFFF;
    if (byteAddr === WATCH_ADDR || byteAddr === WATCH_ADDR_HI) {
      pushWriteEvent(writeLog, watchState, byteAddr, val & 0xFF, 'write8');
    }
    return origWrite8(addr, val);
  };

  cpu.write16 = function(addr, val) {
    const baseAddr = addr & 0xFFFFFF;
    const word = hex(val & 0xFFFF, 4);
    for (let offset = 0; offset < 2; offset += 1) {
      const byteAddr = (baseAddr + offset) & 0xFFFFFF;
      if (byteAddr === WATCH_ADDR || byteAddr === WATCH_ADDR_HI) {
        pushWriteEvent(writeLog, watchState, byteAddr, (val >>> (offset * 8)) & 0xFF, 'write16', word);
      }
    }
    return origWrite16(addr, val);
  };

  return writeLog;
}

function summarizeWrites(writeLog) {
  return {
    count: writeLog.length,
    uniqueBlocks: [...new Set(writeLog.map((entry) => entry.block))],
    uniquePcs: [...new Set(writeLog.map((entry) => entry.pc))],
  };
}

function runExperiment(preparedBase, experiment) {
  const runtime = createRuntimeFromMemory(preparedBase.baseMemory);
  const seed = seedStatLists(runtime.mem, experiment.values);
  const preEntryScratch = seedScratchSentinel(runtime.mem);
  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  const watchState = {
    stepCount: 0,
    currentPc: ENTRY_ADDR,
    currentBlockKey: blockKey(ENTRY_ADDR, 'adl'),
  };
  runtime.cpu.pc = ENTRY_ADDR;

  const writeLog = installScratchWriteWatch(runtime.cpu, watchState);
  const uniqueVisited = new Set();
  const uniqueMissing = new Set();
  let reachedLoadBlock = false;
  let loadBlockStep = null;

  const trace = runTraceSegmented(runtime.executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      watchState.stepCount = event.step;
      watchState.currentPc = event.pc;
      watchState.currentBlockKey = blockKey(event.pc, event.mode);
      runtime.cpu.pc = event.pc;
      uniqueVisited.add(watchState.currentBlockKey);
      if (event.pc === LOAD_BLOCK && !reachedLoadBlock) {
        reachedLoadBlock = true;
        loadBlockStep = event.step;
      }
    },
    onMissingBlock(event) {
      watchState.stepCount = event.step;
      watchState.currentPc = event.pc;
      watchState.currentBlockKey = blockKey(event.pc, event.mode);
      runtime.cpu.pc = event.pc;
      uniqueMissing.add(watchState.currentBlockKey);
    },
  });

  const finalWord = runtime.cpu.read16(WATCH_ADDR) & 0xFFFF;

  return {
    label: experiment.label,
    values: experiment.values,
    seed,
    preEntryScratch,
    trace: {
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      errorMessage: trace.errorMessage,
      uniqueVisitedCount: uniqueVisited.size,
      uniqueMissingBlockCount: uniqueMissing.size,
      reached092226: reachedLoadBlock,
      stepAt092226: loadBlockStep,
    },
    writeEvents: writeLog,
    writeSummary: summarizeWrites(writeLog),
    finalD008E6: {
      word: hex(finalWord, 4),
      bytes: {
        e6: hex(runtime.mem[WATCH_ADDR], 2),
        e7: hex(runtime.mem[WATCH_ADDR_HI], 2),
      },
    },
  };
}

function main() {
  const preparedBase = buildPreparedBaseMemory();
  const experiments = EXPERIMENTS.map((experiment) => runExperiment(preparedBase, experiment));

  const output = {
    probe: 'probe-phase199-stat-write-watch.mjs',
    constraints: {
      timerInterrupt: false,
      mbase: hex(SHORT_MBASE, 2),
      ix: hex(0xD1A860),
      entryAddr: hex(ENTRY_ADDR),
      watchAddr: hex(WATCH_ADDR),
      stepBudget: STAT_TRACE_MAX_STEPS,
    },
    hookStrategy: {
      requestedWrite8WatchInstalled: true,
      write16CompanionWatchInstalled: true,
      reason: 'cpu-runtime.js implements sis ld (0x0008e6),hl via cpu.write16(...), so write8 alone would miss that store.',
    },
    preparedBase: {
      boot: preparedBase.boot,
      memInit: preparedBase.memInit,
    },
    experiments,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
