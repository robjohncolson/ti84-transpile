#!/usr/bin/env node
/**
 * probe-phase205-stat-extended-30k.mjs
 *
 * Extend the STAT pipeline trace to 50000 steps (fallback 30000) to see what
 * happens past the 15000-step window observed in session 204.
 *
 * Near-seed setup: L1 = {1.0, 2.0, 3.0, 4.0, 5.0} at 0xD01600 in BCD float
 * format. Enter at 0x058BA9 (cxErrorEP — STAT entry).
 *
 * Reports:
 *   - Total unique blocks visited
 *   - FP/math block reachability (0x075000-0x07D000, 0x07C700-0x07C800)
 *   - Block visit frequency (loop indicators: any block visited >10 times)
 *   - OP1/OP2/OP3 values at end
 *   - STAT structure at 0xD008E6-0xD00920
 *   - Termination kind (HALT/RET-to-zero/step-limit)
 *   - Last 20 unique blocks (frontier)
 *   - Timing
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

// Ensure transpiled JS exists
if (!fs.existsSync(TRANSPILED_PATH)) {
  const result = spawnSync(process.execPath, [TRANSPILE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Transpile failed with status ${result.status ?? 'unknown'}`);
  }
}

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase205', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

// ─── Constants ───────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE205_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const PRIMARY_STEP_LIMIT = 50000;
const FALLBACK_STEP_LIMIT = 30000;

// Near-seed list data address
const NEAR_LIST_DATA_ADDR = 0xD01600;
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

// OP register addresses (TI-OS standard)
const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00601;
const OP3_ADDR = 0xD0060A;

// STAT structure range
const STAT_STRUCT_START = 0xD008E6;
const STAT_STRUCT_END = 0xD00920;

// 5-element list: {1.0, 2.0, 3.0, 4.0, 5.0}
const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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
  for (let i = 0; i < bytes.length; i += 1) {
    mem[(a + i) & MEM_MASK] = bytes[i] & 0xFF;
  }
}

function hexBytes(mem, addr, len) {
  const parts = [];
  const a = addr & MEM_MASK;
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[(a + i) & MEM_MASK] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

// ─── Runtime setup ───────────────────────────────────────────────────────────

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
  const totalMaxSteps = options.totalMaxSteps ?? PRIMARY_STEP_LIMIT;
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
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) onBlock(norm, dispatchMode, meta, totalSteps + localStep);
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) onMissingBlock(norm, dispatchMode, totalSteps + localStep);
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
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

function seedStatList(mem) {
  const listDataLen = 2 + (LIST_ELEMENTS.length * 9);
  const listDataEnd = NEAR_LIST_DATA_ADDR + listDataLen;
  const vatEntryBytes = Uint8Array.from([
    0x01,
    NEAR_LIST_DATA_ADDR & 0xFF,
    (NEAR_LIST_DATA_ADDR >>> 8) & 0xFF,
    (NEAR_LIST_DATA_ADDR >>> 16) & 0xFF,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);

  // Write list header (element count) + element data
  write16Raw(mem, NEAR_LIST_DATA_ADDR, LIST_ELEMENTS.length);
  for (let i = 0; i < LIST_ELEMENTS.length; i += 1) {
    writeBytes(mem, NEAR_LIST_DATA_ADDR + 2 + (i * 9), LIST_ELEMENTS[i]);
  }

  // VAT entry
  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  // List pointer table
  write24Raw(mem, LIST_PTR_TABLE_ADDR, NEAR_LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  // Stat flags
  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  // List editor state
  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    listDataAddr: hex(NEAR_LIST_DATA_ADDR),
    listLength: LIST_ELEMENTS.length,
    listDataEnd: hex(listDataEnd),
  };
}

// ─── Main trace ──────────────────────────────────────────────────────────────

function runExtendedStatTrace(stepLimit) {
  const startTime = performance.now();

  // Create and boot runtime
  const runtime = createRuntime();
  const bootInfo = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);

  const bootTime = performance.now();

  // Seed list data
  const seedInfo = seedStatList(runtime.mem);

  // Set up CPU for STAT entry
  resetCpuForOsCall(runtime.cpu, runtime.mem);
  runtime.cpu.a = 0x31;
  runtime.cpu._ix = 0xD1A860;
  runtime.cpu._iy = 0xD00080;
  runtime.cpu.sp = 0xD1A860;
  runtime.cpu.sp -= 3;
  write24Raw(runtime.mem, runtime.cpu.sp, RETURN_SENTINEL);

  // Tracking structures
  const blockVisitCount = new Map();
  const uniqueBlockOrder = [];
  const uniqueBlockSet = new Set();
  let fpMathBlocksReached = [];
  let missingBlocks = [];

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: stepLimit,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_sentinel'],
      [BOOT_ENTRY, 'boot_crash'],
      [0x000000, 'zero_crash'],
    ]),
    onBlock(pc, mode, meta, globalStep) {
      // Count visits
      blockVisitCount.set(pc, (blockVisitCount.get(pc) ?? 0) + 1);

      // Track unique block discovery order
      if (!uniqueBlockSet.has(pc)) {
        uniqueBlockSet.add(pc);
        uniqueBlockOrder.push({ pc, step: globalStep });
      }

      // Check FP/math range
      if ((pc >= 0x075000 && pc < 0x07D000) || (pc >= 0x07C700 && pc < 0x07C800)) {
        if (!fpMathBlocksReached.some((b) => b.pc === pc)) {
          fpMathBlocksReached.push({ pc: hex(pc), step: globalStep });
        }
      }
    },
    onMissingBlock(pc, mode, globalStep) {
      blockVisitCount.set(pc, (blockVisitCount.get(pc) ?? 0) + 1);
      if (!uniqueBlockSet.has(pc)) {
        uniqueBlockSet.add(pc);
        uniqueBlockOrder.push({ pc, step: globalStep });
      }
      if (!missingBlocks.some((b) => b.pc === pc)) {
        missingBlocks.push({ pc: hex(pc), step: globalStep });
      }
    },
  });

  const traceTime = performance.now();

  // ─── Post-trace analysis ─────────────────────────────────────────────────

  const { mem, cpu } = runtime;

  // OP1/OP2/OP3
  const op1 = hexBytes(mem, OP1_ADDR, 9);
  const op2 = hexBytes(mem, OP2_ADDR, 9);
  const op3 = hexBytes(mem, OP3_ADDR, 9);

  // STAT structure
  const statStructLen = STAT_STRUCT_END - STAT_STRUCT_START;
  const statStruct = hexBytes(mem, STAT_STRUCT_START, statStructLen);

  // Loop indicators: blocks visited >10 times
  const loopIndicators = [];
  for (const [pc, count] of blockVisitCount) {
    if (count > 10) {
      loopIndicators.push({ pc: hex(pc), count });
    }
  }
  loopIndicators.sort((a, b) => b.count - a.count);

  // Last 20 unique blocks (frontier)
  const frontier = uniqueBlockOrder.slice(-20).map((entry) => ({
    pc: hex(entry.pc),
    step: entry.step,
  }));

  // Block frequency distribution
  const freqDist = { visits1: 0, visits2to5: 0, visits6to10: 0, visits11to50: 0, visits51to100: 0, visits100plus: 0 };
  for (const count of blockVisitCount.values()) {
    if (count === 1) freqDist.visits1 += 1;
    else if (count <= 5) freqDist.visits2to5 += 1;
    else if (count <= 10) freqDist.visits6to10 += 1;
    else if (count <= 50) freqDist.visits11to50 += 1;
    else if (count <= 100) freqDist.visits51to100 += 1;
    else freqDist.visits100plus += 1;
  }

  // Top 20 most visited blocks
  const topVisited = [...blockVisitCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc, count]) => ({ pc: hex(pc), count }));

  // Final registers
  const finalRegisters = {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc ?? cpu._bc),
    de: hex(cpu.de ?? cpu._de),
    hl: hex(cpu.hl ?? cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    mbase: hex(cpu.mbase, 2),
    madl: cpu.madl,
  };

  return {
    probe: 'phase205-stat-extended-30k',
    generatedAt: new Date().toISOString(),
    stepLimit,
    timing: {
      bootMs: Math.round(bootTime - startTime),
      traceMs: Math.round(traceTime - bootTime),
      totalMs: Math.round(traceTime - startTime),
    },
    boot: bootInfo,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
    },
    seed: seedInfo,
    trace: {
      entry: hex(STAT_ENTRY),
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      errorMessage: trace.errorMessage,
    },
    uniqueBlocks: {
      total: uniqueBlockSet.size,
      frontier,
    },
    fpMathBlocks: {
      reached: fpMathBlocksReached.length > 0,
      count: fpMathBlocksReached.length,
      blocks: fpMathBlocksReached.slice(0, 50),
    },
    loopIndicators: {
      count: loopIndicators.length,
      top20: loopIndicators.slice(0, 20),
    },
    blockFrequencyDistribution: freqDist,
    topVisitedBlocks: topVisited,
    missingBlocks: {
      count: missingBlocks.length,
      blocks: missingBlocks.slice(0, 30),
    },
    opRegisters: { op1, op2, op3 },
    statStructure: {
      range: `${hex(STAT_STRUCT_START)}-${hex(STAT_STRUCT_END)}`,
      bytes: statStruct,
    },
    finalRegisters,
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

let result;
const t0 = performance.now();

try {
  result = runExtendedStatTrace(PRIMARY_STEP_LIMIT);
} catch (err) {
  const elapsed = performance.now() - t0;
  if (elapsed > 120_000) {
    // Took too long — fallback to 30k
    console.error(`Primary run (${PRIMARY_STEP_LIMIT} steps) took ${Math.round(elapsed)}ms, falling back to ${FALLBACK_STEP_LIMIT}`);
    result = runExtendedStatTrace(FALLBACK_STEP_LIMIT);
  } else {
    throw err;
  }
}

console.log(JSON.stringify(result, null, 2));
