#!/usr/bin/env node
/**
 * probe-phase205-stat-extended-30k.mjs
 *
 * Extend the near-seeded STAT trace beyond the 15K-step window from phase 204.
 *
 * Experiments:
 *   A. 50,000-step near-seed trace
 *   B. 30,000-step sanity trace
 *
 * Output: one JSON object on stdout with:
 *   - baseline boot + memInit state
 *   - near-seed setup summary for L1 = {1,2,3,4,5}
 *   - unique-block, frontier, repeat-block, and missing-target summaries
 *   - whether the trace reaches the requested FP/math address ranges
 *   - whether 0x082BE2 is terminal or execution continues past it
 *   - OP1..OP6 and STAT-structure snapshots before/after the trace
 *   - termination classification and wall-clock runtime for both budgets
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

ensureTranspiled();

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase205', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

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
const RET_TO_ZERO_PC = 0x000000;
const TRACE_STOP = '__PHASE205_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_50K_STEPS = 50000;
const TRACE_30K_STEPS = 30000;
const OS_MAX_LOOP_ITERATIONS = 8192;

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

const BLOCK_092263 = 0x092263;
const BLOCK_0921CA = 0x0921CA;
const BLOCK_09205B = 0x09205B;
const BLOCK_092979 = 0x092979;
const BLOCK_082BE2 = 0x082BE2;

const FP_MATH_RANGE_START = 0x075000;
const FP_MATH_RANGE_END_EXCLUSIVE = 0x07D000;
const FP_CORE_RANGE_START = 0x07C700;
const FP_CORE_RANGE_END_EXCLUSIVE = 0x07C800;

const OP_SLOT_LEN = 11;
const OP_REAL_LEN = 9;
const STAT_STRUCT_START = 0xD008E6;
const STAT_STRUCT_END_EXCLUSIVE = 0xD00921;

const OP_SLOTS = [
  { name: 'OP1', addr: 0xD005F8 },
  { name: 'OP2', addr: 0xD00603 },
  { name: 'OP3', addr: 0xD0060E },
  { name: 'OP4', addr: 0xD00619 },
  { name: 'OP5', addr: 0xD00624 },
  { name: 'OP6', addr: 0xD0062F },
];

const MILESTONES = [
  { name: 'block092263', pc: BLOCK_092263 },
  { name: 'block0921CA', pc: BLOCK_0921CA },
  { name: 'block09205B', pc: BLOCK_09205B },
  { name: 'block092979', pc: BLOCK_092979 },
  { name: 'block082BE2', pc: BLOCK_082BE2 },
];

const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

function ensureTranspiled() {
  if (fs.existsSync(TRANSPILED_PATH)) return;

  const result = spawnSync(process.execPath, [TRANSPILE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Transpile failed with status ${result.status ?? 'unknown'}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function blockFor(pc, mode = 'adl') {
  return BLOCKS[blockKey(pc, mode)] ?? null;
}

function firstInstructionLabel(pc, mode = 'adl') {
  return blockFor(pc, mode)?.instructions?.[0]?.dasm ?? null;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
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

function sliceBytes(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let index = 0; index < len; index += 1) {
    out[index] = mem[(addr + index) & MEM_MASK] & 0xFF;
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function decodeWordsLE(bytes, baseAddr) {
  const words = [];
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    words.push({
      addr: hex(baseAddr + offset),
      value: hex(value, 4),
    });
  }
  return words;
}

function memReader(mem) {
  return {
    read8(addr) {
      return mem[addr & MEM_MASK] & 0xFF;
    },
  };
}

function looksLikeBcdReal(bytes) {
  if (!bytes || bytes.length < OP_REAL_LEN) return false;
  if ((bytes[0] & 0x7F) !== 0) return false;
  for (let index = 2; index < OP_REAL_LEN; index += 1) {
    if (((bytes[index] >>> 4) & 0x0F) > 9) return false;
    if ((bytes[index] & 0x0F) > 9) return false;
  }
  return true;
}

function safeDecodeReal(mem, addr) {
  const bytes = sliceBytes(mem, addr, OP_REAL_LEN);
  if (!looksLikeBcdReal(bytes)) return null;
  try {
    return readReal(memReader(mem), addr);
  } catch {
    return null;
  }
}

function diffBytes(beforeBytes, afterBytes, baseAddr) {
  const changed = [];
  const len = Math.min(beforeBytes.length, afterBytes.length);
  for (let index = 0; index < len; index += 1) {
    if (beforeBytes[index] === afterBytes[index]) continue;
    changed.push({
      offset: index,
      addr: hex(baseAddr + index),
      before: hex(beforeBytes[index], 2),
      after: hex(afterBytes[index], 2),
    });
  }
  return changed;
}

function captureRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    sp: hex(cpu.sp),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
    halted: Boolean(cpu.halted),
  };
}

function captureOpSlots(mem) {
  return Object.fromEntries(OP_SLOTS.map(({ name, addr }) => {
    const raw11 = sliceBytes(mem, addr, OP_SLOT_LEN);
    const real9 = raw11.subarray(0, OP_REAL_LEN);
    return [name, {
      name,
      addr,
      raw11,
      real9,
      decodedReal: safeDecodeReal(mem, addr),
    }];
  }));
}

function formatOpComparisons(beforeSlots, afterSlots) {
  return Object.fromEntries(OP_SLOTS.map(({ name, addr }) => {
    const before = beforeSlots[name];
    const after = afterSlots[name];
    return [name, {
      addr: hex(addr),
      changed: bytesToHex(before.raw11) !== bytesToHex(after.raw11),
      decodedRealBefore: before.decodedReal,
      decodedRealAfter: after.decodedReal,
      real9BeforeHex: bytesToHex(before.real9),
      real9AfterHex: bytesToHex(after.real9),
      raw11BeforeHex: bytesToHex(before.raw11),
      raw11AfterHex: bytesToHex(after.raw11),
      changedBytes: diffBytes(before.raw11, after.raw11, addr),
    }];
  }));
}

function captureStatStruct(mem) {
  const bytes = sliceBytes(mem, STAT_STRUCT_START, STAT_STRUCT_END_EXCLUSIVE - STAT_STRUCT_START);
  return {
    bytes,
    hex: bytesToHex(bytes),
    wordsLE: decodeWordsLE(bytes, STAT_STRUCT_START),
    nonZeroByteCount: Array.from(bytes).filter((value) => value !== 0).length,
  };
}

function formatStatStructComparison(before, after) {
  return {
    start: hex(STAT_STRUCT_START),
    endExclusive: hex(STAT_STRUCT_END_EXCLUSIVE),
    changedByteCount: diffBytes(before.bytes, after.bytes, STAT_STRUCT_START).length,
    changedBytes: diffBytes(before.bytes, after.bytes, STAT_STRUCT_START),
    beforeHex: before.hex,
    afterHex: after.hex,
    beforeWordsLE: before.wordsLE,
    afterWordsLE: after.wordsLE,
    beforeNonZeroByteCount: before.nonZeroByteCount,
    afterNonZeroByteCount: after.nonZeroByteCount,
    keyWords: {
      d008e6: hex(read16FromBytes(after.bytes, 0), 4),
      d008e8: hex(read16FromBytes(after.bytes, 2), 4),
      d008ea: hex(read16FromBytes(after.bytes, 4), 4),
      d008ec: hex(read16FromBytes(after.bytes, 6), 4),
      d008ee: hex(read16FromBytes(after.bytes, 8), 4),
      d008f0: hex(read16FromBytes(after.bytes, 10), 4),
    },
  };
}

function read16FromBytes(bytes, offset) {
  if (offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
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
  const totalMaxSteps = options.totalMaxSteps ?? TRACE_50K_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;
  const onMissingBlock = options.onMissingBlock ?? null;
  const onLoopBreak = options.onLoopBreak ?? null;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let lastEventKind = null;
  let termination = null;
  let hitSentinel = null;
  let errorMessage = null;
  let loopBreakCount = 0;

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
          lastEventKind = 'block';
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
          lastEventKind = 'missing';
          if (onMissingBlock) {
            onMissingBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onLoopBreak(pc, dispatchMode, loopHitCount, fallthroughTarget) {
          loopBreakCount += 1;
          if (onLoopBreak) {
            onLoopBreak({
              pc: pc & 0xFFFFFF,
              mode: dispatchMode,
              loopHitCount,
              fallthroughTarget: fallthroughTarget === null || fallthroughTarget === undefined
                ? null
                : (fallthroughTarget & 0xFFFFFF),
            });
          }
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
    lastEventKind,
    termination,
    hitSentinel,
    loopBreakCount,
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function createBaselineState() {
  const runtime = createRuntime();
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      loopBreakCount: memInit.loopBreakCount,
      finalPc: hex(memInit.lastPc),
      finalMode: memInit.lastMode,
    },
    baselineMem: new Uint8Array(runtime.mem),
  };
}
