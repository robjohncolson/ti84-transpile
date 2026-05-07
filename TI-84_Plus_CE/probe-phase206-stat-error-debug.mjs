#!/usr/bin/env node
/**
 * probe-phase206-stat-error-debug.mjs
 *
 * Debug the STAT error condition. Session 205 found the OS loops at 0x082BE2
 * with "Error" at STAT structure offset 14 and OP1=0x03 0x2D (error type).
 *
 * This probe:
 *   1. Dumps the full STAT structure at 0xD008E6 (32 bytes) at multiple
 *      points: before STAT entry, after step 100, and at step 3000.
 *   2. Verifies list data BCD format for L1={1.0, 2.0, 3.0}.
 *   3. Checks VAT entry format at 0xD1A800.
 *   4. Checks STAT-mode context RAM locations.
 *   5. Tests four different initializations (A-D) to see which avoids the
 *      error condition.
 *
 * Output: one JSON object on stdout.
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

ensureTranspiled();

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase206', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
const TRACE_STOP = '__PHASE206_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const EXPERIMENT_TRACE_STEPS = 5000;
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

const STAT_STRUCT_START = 0xD008E6;
const STAT_STRUCT_LEN = 32;

const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;

const MENU_MODE_ADDR = 0xD02504;

const CONTEXT_ADDRS = {
  menuMode: 0xD02504,
  statStruct: STAT_STRUCT_START,
  listPtrTable: LIST_PTR_TABLE_ADDR,
  listD01D0B: 0xD01D0B,
};

// BCD floats for L1={1.0, 2.0, 3.0}
const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

const LIST_DATA_LEN = 2 + (LIST_ELEMENTS.length * 9);
const LIST_DATA_END = NEAR_LIST_DATA_ADDR + LIST_DATA_LEN;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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
  return Array.from(bytes, (v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function bytesToAscii(bytes) {
  return Array.from(bytes, (v) => (v >= 0x20 && v <= 0x7E) ? String.fromCharCode(v) : '.').join('');
}

function dumpRegion(mem, addr, len) {
  const bytes = sliceBytes(mem, addr, len);
  return {
    addr: hex(addr),
    length: len,
    hex: bytesToHex(bytes),
    ascii: bytesToAscii(bytes),
  };
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

// ---------------------------------------------------------------------------
// Runtime setup
// ---------------------------------------------------------------------------

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
  const totalMaxSteps = options.totalMaxSteps ?? EXPERIMENT_TRACE_STEPS;
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
        onLoopBreak() {
          loopBreakCount += 1;
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
      finalPc: hex(memInit.lastPc),
    },
    baselineMem: new Uint8Array(runtime.mem),
  };
}

// ---------------------------------------------------------------------------
// Seeding functions
// ---------------------------------------------------------------------------

function seedNearList(mem) {
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

  write16Raw(mem, NEAR_LIST_DATA_ADDR, LIST_ELEMENTS.length);
  for (let index = 0; index < LIST_ELEMENTS.length; index += 1) {
    writeBytes(mem, NEAR_LIST_DATA_ADDR + 2 + (index * 9), LIST_ELEMENTS[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, LIST_DATA_END);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, NEAR_LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));
}

// ---------------------------------------------------------------------------
// Part 1: STAT structure dumps at multiple trace points
// ---------------------------------------------------------------------------

function captureOpSlot(mem, addr) {
  const bytes = sliceBytes(mem, addr, 11);
  return {
    hex: bytesToHex(bytes),
    ascii: bytesToAscii(bytes),
    type: hex(bytes[0], 2),
  };
}

function captureSnapshot(mem) {
  return {
    statStruct: dumpRegion(mem, STAT_STRUCT_START, STAT_STRUCT_LEN),
    statStructExtended: dumpRegion(mem, STAT_STRUCT_START, 64),
    op1: captureOpSlot(mem, OP1_ADDR),
    op2: captureOpSlot(mem, OP2_ADDR),
    d008e0_range: dumpRegion(mem, 0xD008E0, 32),
  };
}

function runStructureDumps(baselineMem) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  const beforeEntry = captureSnapshot(runtime.mem);

  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  let afterStep100 = null;
  let afterStep3000 = null;

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: 5000,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      if (event.step === 100 && !afterStep100) {
        afterStep100 = captureSnapshot(runtime.mem);
      }
      if (event.step === 3000 && !afterStep3000) {
        afterStep3000 = captureSnapshot(runtime.mem);
      }
    },
  });

  const afterTrace = captureSnapshot(runtime.mem);

  return {
    beforeEntry,
    afterStep100: afterStep100 ?? { note: 'step 100 not reached' },
    afterStep3000: afterStep3000 ?? { note: 'step 3000 not reached' },
    afterTrace,
    traceSteps: trace.steps,
    traceTermination: trace.termination,
    traceFinalPc: hex(trace.lastPc),
  };
}

// ---------------------------------------------------------------------------
// Part 2: BCD format verification
// ---------------------------------------------------------------------------

function verifyBcdFormat(mem) {
  const results = [];
  const expectedBcd = [
    { value: 1.0, bytes: [0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { value: 2.0, bytes: [0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { value: 3.0, bytes: [0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
  ];

  const countBytes = sliceBytes(mem, NEAR_LIST_DATA_ADDR, 2);
  const count = countBytes[0] | (countBytes[1] << 8);

  results.push({
    field: 'elementCount',
    addr: hex(NEAR_LIST_DATA_ADDR),
    rawBytes: bytesToHex(countBytes),
    decodedCount: count,
    expectedCount: 3,
    correct: count === 3,
  });

  for (let index = 0; index < expectedBcd.length; index += 1) {
    const elemAddr = NEAR_LIST_DATA_ADDR + 2 + (index * 9);
    const actualBytes = sliceBytes(mem, elemAddr, 9);
    const expectedBytes = Uint8Array.from(expectedBcd[index].bytes);
    const match = bytesToHex(actualBytes) === bytesToHex(expectedBytes);

    results.push({
      field: `element[${index}]`,
      addr: hex(elemAddr),
      expectedValue: expectedBcd[index].value,
      expectedHex: bytesToHex(expectedBytes),
      actualHex: bytesToHex(actualBytes),
      correct: match,
      signByte: hex(actualBytes[0], 2),
      exponentByte: hex(actualBytes[1], 2),
      mantissaDigits: bytesToHex(actualBytes.subarray(2)),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Part 3: VAT entry format verification
// ---------------------------------------------------------------------------

function verifyVatEntry(mem) {
  const vatBytes = sliceBytes(mem, VAT_ENTRY_ADDR, 8);
  const type = vatBytes[0];
  const dataPtr = vatBytes[1] | (vatBytes[2] << 8) | (vatBytes[3] << 16);
  const version = vatBytes[4];
  const flags = vatBytes[5];
  const nameLen = vatBytes[6];
  const nameByte = vatBytes[7];

  return {
    addr: hex(VAT_ENTRY_ADDR),
    rawHex: bytesToHex(vatBytes),
    type: {
      value: hex(type, 2),
      expected: '0x01 (real list)',
      correct: type === 0x01,
    },
    dataPointer: {
      value: hex(dataPtr),
      expected: hex(NEAR_LIST_DATA_ADDR),
      correct: dataPtr === NEAR_LIST_DATA_ADDR,
    },
    version: hex(version, 2),
    flags: hex(flags, 2),
    nameLength: {
      value: nameLen,
      expected: 1,
      note: 'L1 name is 0x5D 0x00 (2 bytes) but nameLen=1 means 1 char after type token',
    },
    nameByte: {
      value: hex(nameByte, 2),
      expected: '0x00 (L1)',
      correct: nameByte === 0x00,
    },
  };
}

// ---------------------------------------------------------------------------
// Part 4: STAT-mode context RAM checks
// ---------------------------------------------------------------------------

function checkContextRam(mem) {
  return {
    menuMode_D02504: {
      addr: hex(MENU_MODE_ADDR),
      value: hex(mem[MENU_MODE_ADDR], 2),
      note: '0x40 = STAT mode',
    },
    statStruct_D008E0_to_D008FF: dumpRegion(mem, 0xD008E0, 32),
    listPtrTable_D01508: {
      addr: hex(LIST_PTR_TABLE_ADDR),
      pointer0: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
      countByte: hex(mem[LIST_COUNT_ADDR], 2),
      activeList: hex(mem[ACTIVE_LIST_ADDR], 2),
    },
    addr_D01D0B: {
      addr: hex(0xD01D0B),
      byte: hex(mem[0xD01D0B], 2),
      region: dumpRegion(mem, 0xD01D00, 16),
    },
    statFlags: {
      d00089: hex(mem[STATFLAGS_ADDR], 2),
      d0009A: hex(mem[STATFLAGS2_ADDR], 2),
    },
    allocatorPointers: {
      opBase: hex(read24Raw(mem, OPBASE_ADDR)),
      ops: hex(read24Raw(mem, OPS_ADDR)),
      pTemp: hex(read24Raw(mem, PTEMP_ADDR)),
      progPtr: hex(read24Raw(mem, PROGPTR_ADDR)),
      newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
    },
  };
}

// ---------------------------------------------------------------------------
// Part 5: Experiment variants A-D
// ---------------------------------------------------------------------------

function runExperiment(baselineMem, label, setupFn) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);

  // Apply the standard near-seed baseline
  seedNearList(runtime.mem);

  // Apply experiment-specific overrides
  setupFn(runtime.mem);

  // Capture pre-trace state
  const preTraceSnapshot = captureSnapshot(runtime.mem);
  const preContextRam = checkContextRam(runtime.mem);

  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  const uniqueBlocks = new Set();
  let errorStringFound = false;
  let errorFoundAtStep = null;
  let block082BE2Count = 0;

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: EXPERIMENT_TRACE_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      uniqueBlocks.add(event.pc);
      if (event.pc === 0x082BE2) {
        block082BE2Count += 1;
      }
      // Check for "Error" in STAT struct every 500 steps
      if (event.step % 500 === 0 && !errorStringFound) {
        const structBytes = sliceBytes(runtime.mem, STAT_STRUCT_START, STAT_STRUCT_LEN);
        const ascii = bytesToAscii(structBytes);
        if (ascii.includes('Error') || ascii.includes('error')) {
          errorStringFound = true;
          errorFoundAtStep = event.step;
        }
      }
    },
  });

  // Final check for error
  const postSnapshot = captureSnapshot(runtime.mem);
  const postStructBytes = sliceBytes(runtime.mem, STAT_STRUCT_START, STAT_STRUCT_LEN);
  const postAscii = bytesToAscii(postStructBytes);
  if (!errorStringFound && (postAscii.includes('Error') || postAscii.includes('error'))) {
    errorStringFound = true;
    errorFoundAtStep = trace.steps;
  }

  return {
    label,
    steps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    finalPc: hex(trace.lastPc),
    uniqueBlockCount: uniqueBlocks.size,
    block082BE2_visits: block082BE2Count,
    errorStringFound,
    errorFoundAtStep,
    loopBreakCount: trace.loopBreakCount,
    op1_after: postSnapshot.op1,
    statStruct_after: postSnapshot.statStruct,
    preTraceMenuMode: hex(runtime.mem[MENU_MODE_ADDR], 2),
    errorMessage: trace.errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const startTime = Date.now();

  // Create baseline
  const baseline = createBaselineState();

  // Part 1: Structure dumps at multiple trace points
  const structureDumps = runStructureDumps(baseline.baselineMem);

  // Part 2: BCD format verification
  const bcdRuntime = createRuntime();
  bcdRuntime.mem.set(baseline.baselineMem);
  seedNearList(bcdRuntime.mem);
  const bcdVerification = verifyBcdFormat(bcdRuntime.mem);

  // Part 3: VAT entry format
  const vatVerification = verifyVatEntry(bcdRuntime.mem);

  // Part 4: Context RAM after seed (before trace)
  const contextRam = checkContextRam(bcdRuntime.mem);

  // Part 5: Four experiments
  const experimentA = runExperiment(baseline.baselineMem, 'A_baseline_near_seed', (mem) => {
    // No extra modifications — baseline near seed
  });

  const experimentB = runExperiment(baseline.baselineMem, 'B_stat_mode_0x40', (mem) => {
    // Set menu mode byte to 0x40 (STAT mode)
    mem[MENU_MODE_ADDR] = 0x40;
  });

  const experimentC = runExperiment(baseline.baselineMem, 'C_prepopulate_stat_header', (mem) => {
    // Pre-populate STAT structure header with plausible values
    // Byte 0-1: stat mode flags (0x01 = 1-Var Stats)
    mem[STAT_STRUCT_START] = 0x01;
    mem[STAT_STRUCT_START + 1] = 0x00;
    // Bytes 2-4: pointer to XList data (L1)
    write24Raw(mem, STAT_STRUCT_START + 2, NEAR_LIST_DATA_ADDR);
    // Bytes 5-7: pointer to YList data (0 = none for 1-Var)
    write24Raw(mem, STAT_STRUCT_START + 5, 0x000000);
    // Bytes 8-9: XList name token (0x5D00 = L1)
    mem[STAT_STRUCT_START + 8] = 0x5D;
    mem[STAT_STRUCT_START + 9] = 0x00;
    // Bytes 10-11: YList name token (none)
    mem[STAT_STRUCT_START + 10] = 0x00;
    mem[STAT_STRUCT_START + 11] = 0x00;
    // Byte 12: frequency flag (0 = no freq list)
    mem[STAT_STRUCT_START + 12] = 0x00;
    // Byte 13: reserved
    mem[STAT_STRUCT_START + 13] = 0x00;
    // Also set menu mode
    mem[MENU_MODE_ADDR] = 0x40;
  });

  const experimentD = runExperiment(baseline.baselineMem, 'D_proper_bcd_count_prefix', (mem) => {
    // Use a real list type byte (0x00 = real) in the count position
    // TI-OS stores element count as 2-byte LE integer
    // Also ensure the list "dimension" word at data pointer is correct
    // This is already done by seedNearList, but let's also set:
    // - STAT structure XList pointer
    write24Raw(mem, STAT_STRUCT_START + 2, NEAR_LIST_DATA_ADDR);
    // - Menu mode
    mem[MENU_MODE_ADDR] = 0x40;
    // - STAT type = 1-Var
    mem[STAT_STRUCT_START] = 0x01;
    // - Set IY+12 bit 7 (editor active flag from session 205)
    const iy12Addr = 0xD00080 + 12; // 0xD0008C
    mem[iy12Addr] |= 0x80;
    // - Clear any pre-existing error state
    // OP1 type = 0x00 (real), not 0x03 (error)
    mem[OP1_ADDR] = 0x00;
  });

  const elapsedMs = Date.now() - startTime;

  const output = {
    probe: 'probe-phase206-stat-error-debug',
    statEntry: hex(STAT_ENTRY),
    constraints: {
      timerInterrupt: false,
      experimentTraceSteps: EXPERIMENT_TRACE_STEPS,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    },
    baseline: {
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    part1_structureDumps: structureDumps,
    part2_bcdVerification: bcdVerification,
    part3_vatVerification: vatVerification,
    part4_contextRam: contextRam,
    part5_experiments: {
      A_baseline: experimentA,
      B_statMode: experimentB,
      C_statHeader: experimentC,
      D_fullSetup: experimentD,
    },
    elapsedMs,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
