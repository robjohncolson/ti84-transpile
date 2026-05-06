#!/usr/bin/env node
/**
 * probe-phase203-stat-near-seed.mjs
 *
 * Compare the STAT 1-Var path with seeded list data placed near the OS list
 * area (0xD01600) versus the legacy far address (0xD10000).
 *
 * The probe:
 *   1. Cold-boots once and snapshots RAM after memInit.
 *   2. Replays STAT entry 0x058BA9 with L1 seeded to {1.0, 2.0, 3.0}.
 *   3. Records unique blocks, the first 0x092263 LDDR entry state, whether the
 *      inline successor 0x092265 was reached, and writes around 0xD008E6.
 *   4. Emits one JSON object to stdout with side-by-side results.
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
const RAW_BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
const TRACE_BLOCKS = instrumentBlocks(RAW_BLOCKS);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const BLOCK_092263 = 0x092263;
const SUCCESSOR_PC = 0x092265;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE203_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 10000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const NEAR_LIST_DATA_ADDR = 0xD01600;
const FAR_LIST_DATA_ADDR = 0xD10000;
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
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const STAT_STRUCT_BASE = 0xD008E6;
const STAT_WRITE_WINDOW_BEFORE = 0x200;
const STAT_WRITE_WINDOW_AFTER = 0x40;
const STAT_WRITE_WINDOW_START = STAT_STRUCT_BASE - STAT_WRITE_WINDOW_BEFORE;
const STAT_WRITE_WINDOW_END = STAT_STRUCT_BASE + STAT_WRITE_WINDOW_AFTER;

const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function instrumentBlocks(blocks) {
  const instrumented = {};
  for (const [key, block] of Object.entries(blocks)) {
    if (key !== '092263:adl' || !block?.source) {
      instrumented[key] = block;
      continue;
    }
    instrumented[key] = {
      ...block,
      source: block.source.replace(
        '  cpu.lddr();\n',
        '  cpu.lddr();\n  if (cpu._probeAfterLddr) cpu._probeAfterLddr(0x092265);\n',
      ),
    };
  }
  return instrumented;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16Raw(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8);
}

function read24Raw(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8) | (mem[(a + 2) & MEM_MASK] << 16);
}

function write16Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const a = addr & MEM_MASK;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & MEM_MASK] = bytes[index] & 0xFF;
  }
}

function hexSlice(mem, addr, len) {
  const parts = [];
  const start = addr & MEM_MASK;
  for (let index = 0; index < len; index += 1) {
    parts.push((mem[(start + index) & MEM_MASK] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
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
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
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
  write24Raw(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function createRuntime(blocks = RAW_BLOCKS) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function createBaselineState() {
  const runtime = createRuntime(RAW_BLOCKS);
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
    },
    baselineMem: new Uint8Array(runtime.mem),
  };
}

function seedStatList(mem, listDataAddr) {
  const listDataLen = 2 + (LIST_ELEMENTS.length * 9);
  const listDataEnd = listDataAddr + listDataLen;
  const vatEntryBytes = Uint8Array.from([
    0x01,
    listDataAddr & 0xFF,
    (listDataAddr >>> 8) & 0xFF,
    (listDataAddr >>> 16) & 0xFF,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);

  write16Raw(mem, listDataAddr, LIST_ELEMENTS.length);
  for (let index = 0; index < LIST_ELEMENTS.length; index += 1) {
    writeBytes(mem, listDataAddr + 2 + (index * 9), LIST_ELEMENTS[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, listDataAddr);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    listDataAddr: hex(listDataAddr),
    listLength: LIST_ELEMENTS.length,
    listDataBytes: hexSlice(mem, listDataAddr, listDataLen),
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    vatEntryBytes: hexSlice(mem, VAT_ENTRY_ADDR, vatEntryBytes.length),
    listPointer: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
    newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
    listCountByte: hex(mem[LIST_COUNT_ADDR], 2),
    activeListByte: hex(mem[ACTIVE_LIST_ADDR], 2),
    expectedBcDeltaFromListCount: hex((listDataAddr - LIST_COUNT_ADDR) & 0xFFFFFF),
  };
}

function captureRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    bcRaw: cpu.bc,
    de: hex(cpu.de),
    deRaw: cpu.de,
    hl: hex(cpu.hl),
    hlRaw: cpu.hl,
    sp: hex(cpu.sp),
    spRaw: cpu.sp,
  };
}

function attachStatWriteProbe(cpu, mem) {
  const writes = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function maybeRecordByte(addr, value, sourceWidth) {
    const norm = addr & 0xFFFFFF;
    if (norm < STAT_WRITE_WINDOW_START || norm >= STAT_WRITE_WINDOW_END) return;
    writes.push({
      step: cpu._probeStep ?? null,
      blockPc: hex(cpu._currentBlockPc ?? 0),
      addr: hex(norm),
      previous: hex(mem[norm & MEM_MASK], 2),
      value: hex(value, 2),
      valueRaw: value & 0xFF,
      sourceWidth,
    });
  }

  cpu.write8 = (addr, value) => {
    maybeRecordByte(addr, value & 0xFF, 1);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    maybeRecordByte(addr, value & 0xFF, 2);
    maybeRecordByte(addr + 1, (value >>> 8) & 0xFF, 2);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    maybeRecordByte(addr, value & 0xFF, 3);
    maybeRecordByte(addr + 1, (value >>> 8) & 0xFF, 3);
    maybeRecordByte(addr + 2, (value >>> 16) & 0xFF, 3);
    return origWrite24(addr, value);
  };

  return {
    writes,
    watchWindow: {
      start: hex(STAT_WRITE_WINDOW_START),
      base: hex(STAT_STRUCT_BASE),
      endExclusive: hex(STAT_WRITE_WINDOW_END),
    },
  };
}

function runExperiment(baselineMem, label, listDataAddr) {
  const runtime = createRuntime(TRACE_BLOCKS);
  runtime.mem.set(baselineMem);
  const seed = seedStatList(runtime.mem, listDataAddr);
  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  const uniqueBlocks = [];
  const uniqueBlockSet = new Set();
  const blockVisitCounts = {};
  const missingTargets = [];
  const missingTargetSet = new Set();
  const missingTargetCounts = {};
  let lddrEntry = null;
  let successorReached = false;
  let successorReachedInline = false;
  let successorReachedAsTarget = false;

  runtime.cpu._probeStep = 0;
  runtime.cpu._probeAfterLddr = (pc) => {
    successorReached = true;
    successorReachedInline = true;
    if (!missingTargetSet.has(`inline:${pc & 0xFFFFFF}`)) {
      missingTargetSet.add(`inline:${pc & 0xFFFFFF}`);
    }
  };

  const statWriteProbe = attachStatWriteProbe(runtime.cpu, runtime.mem);

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      runtime.cpu._probeStep = event.step;
      const key = hex(event.pc);
      blockVisitCounts[key] = (blockVisitCounts[key] ?? 0) + 1;
      if (!uniqueBlockSet.has(event.pc)) {
        uniqueBlockSet.add(event.pc);
        uniqueBlocks.push(key);
      }
      if (event.pc === BLOCK_092263 && !lddrEntry) {
        lddrEntry = {
          step: event.step,
          pc: key,
          ...captureRegisters(runtime.cpu),
        };
      }
    },
    onMissingBlock(event) {
      runtime.cpu._probeStep = event.step;
      const key = hex(event.pc);
      missingTargetCounts[key] = (missingTargetCounts[key] ?? 0) + 1;
      if (!missingTargetSet.has(event.pc)) {
        missingTargetSet.add(event.pc);
        missingTargets.push(key);
      }
      if (event.pc === SUCCESSOR_PC) {
        successorReached = true;
        successorReachedAsTarget = true;
      }
    },
  });

  return {
    label,
    listDataAddr: hex(listDataAddr),
    seed,
    trace: {
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      errorMessage: trace.errorMessage,
      uniqueBlockCount: uniqueBlocks.length,
      uniqueBlocks,
      blockVisitCounts,
      missingTargetCount: missingTargets.length,
      missingTargets,
      missingTargetCounts,
      lddrEntry,
      successorReached,
      successorReachedInline,
      successorReachedAsTarget,
      statWriteWindow: statWriteProbe.watchWindow,
      statAreaWriteCount: statWriteProbe.writes.length,
      statAreaWrites: statWriteProbe.writes,
      statAreaFinalBytes: hexSlice(runtime.mem, STAT_WRITE_WINDOW_START, STAT_WRITE_WINDOW_END - STAT_WRITE_WINDOW_START),
    },
  };
}

function buildComparison(nearExperiment, farExperiment) {
  const nearBcRaw = nearExperiment.trace.lddrEntry?.bcRaw ?? null;
  const farBcRaw = farExperiment.trace.lddrEntry?.bcRaw ?? null;
  const deltaRaw = nearBcRaw !== null && farBcRaw !== null ? farBcRaw - nearBcRaw : null;

  return {
    lddrEntryBc: {
      nearSeed: nearExperiment.trace.lddrEntry?.bc ?? null,
      nearSeedRaw: nearBcRaw,
      farSeed: farExperiment.trace.lddrEntry?.bc ?? null,
      farSeedRaw: farBcRaw,
      differenceRaw: deltaRaw,
      differenceHex: deltaRaw !== null ? hex(deltaRaw) : null,
    },
    successorReached: {
      nearSeed: nearExperiment.trace.successorReached,
      farSeed: farExperiment.trace.successorReached,
      nearSeedInline: nearExperiment.trace.successorReachedInline,
      farSeedInline: farExperiment.trace.successorReachedInline,
      nearSeedAsTarget: nearExperiment.trace.successorReachedAsTarget,
      farSeedAsTarget: farExperiment.trace.successorReachedAsTarget,
    },
    statAreaWriteCount: {
      nearSeed: nearExperiment.trace.statAreaWriteCount,
      farSeed: farExperiment.trace.statAreaWriteCount,
    },
    uniqueBlockCount: {
      nearSeed: nearExperiment.trace.uniqueBlockCount,
      farSeed: farExperiment.trace.uniqueBlockCount,
    },
  };
}

const baseline = createBaselineState();
const nearExperiment = runExperiment(baseline.baselineMem, 'near_seed_0xD01600', NEAR_LIST_DATA_ADDR);
const farExperiment = runExperiment(baseline.baselineMem, 'far_seed_0xD10000', FAR_LIST_DATA_ADDR);

const output = {
  probe: 'probe-phase203-stat-near-seed',
  entry: hex(STAT_ENTRY),
  limits: {
    traceMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
  },
  addresses: {
    nearListDataAddr: hex(NEAR_LIST_DATA_ADDR),
    farListDataAddr: hex(FAR_LIST_DATA_ADDR),
    listCountAddr: hex(LIST_COUNT_ADDR),
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    lddrBlock: hex(BLOCK_092263),
    successorPc: hex(SUCCESSOR_PC),
    statStructBase: hex(STAT_STRUCT_BASE),
  },
  baseline: {
    boot: baseline.boot,
    memInit: baseline.memInit,
  },
  experiments: {
    nearSeed: nearExperiment,
    farSeed: farExperiment,
  },
  comparison: buildComparison(nearExperiment, farExperiment),
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
