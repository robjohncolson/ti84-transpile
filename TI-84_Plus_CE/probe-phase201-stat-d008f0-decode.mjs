#!/usr/bin/env node
/**
 * probe-phase201-stat-d008f0-decode.mjs
 *
 * Decode the meaning of the value at 0xD008F0 (BC=5 loaded by block 0x09201E).
 *
 * Part A: ROM references to 0xD008F0 (byte pattern scan)
 * Part B: STAT memory region dump after memInit
 * Part C: Parametric experiment — vary 0xD008F0, observe computed size at 0xD008E6
 * Part D: Write-watch on 0xD008F0 during STAT entry at 0x058BA9
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

const STAT_ENTRY = 0x058BA9;
const BLOCK_09201E = 0x09201E;
const WATCH_ADDR = 0xD008E6;
const STRUCT_CURSOR_ADDR = 0xD008F0;
const DUMP_START = 0xD008E0;
const DUMP_LENGTH = 64;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE201_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;

// STAT seeding addresses (from probe-phase200)
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
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const LIST_VALUES = [1, 2, 3];

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

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function read16Raw(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[a + 1] << 8);
}

function read24Raw(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function write16Raw(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1)] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[a + index] = bytes[index] & 0xFF;
  }
}

function hexSlice(buffer, addr, len) {
  const parts = [];
  for (let index = 0; index < len; index += 1) {
    parts.push((buffer[addr + index] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
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
  const totalMaxSteps = options.totalMaxSteps ?? 5000;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitSentinel = null;

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
      throw error;
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

function seedStatLists(mem) {
  const listElementBytes = makeListElements(LIST_VALUES);
  const listDataLen = 2 + (listElementBytes.length * 9);
  const listDataEnd = LIST_DATA_ADDR + listDataLen;
  const vatEntryBytes = Uint8Array.from([
    0x01,
    LIST_DATA_ADDR & 0xFF,
    (LIST_DATA_ADDR >>> 8) & 0xFF,
    (LIST_DATA_ADDR >>> 16) & 0xFF,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);

  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_ADDR + 0x200);
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + 0x20);
  write16Raw(mem, LIST_DATA_ADDR, listElementBytes.length);
  for (let index = 0; index < listElementBytes.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), listElementBytes[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
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
    runtime,
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
    },
    baselineMem: new Uint8Array(runtime.mem),
  };
}

// ── Part A: ROM references to 0xD008F0 ──

function partA_romReferences() {
  const results = [];
  const romLen = Math.min(romBytes.length, 0x400000);

  // Pattern 1: F0 08 D0 (little-endian 0xD008F0)
  for (let offset = 0; offset < romLen - 2; offset += 1) {
    if (romBytes[offset] === 0xF0 && romBytes[offset + 1] === 0x08 && romBytes[offset + 2] === 0xD0) {
      const contextStart = Math.max(0, offset - 8);
      const contextEnd = Math.min(romLen, offset + 8);
      results.push({
        pattern: 'F0 08 D0',
        address: hex(offset),
        interpretation: 'absolute 0xD008F0',
        context: hexSlice(romBytes, contextStart, contextEnd - contextStart),
        contextStartAddr: hex(contextStart),
      });
    }
  }

  // Pattern 2: F0 08 00 (MBASE-relative 0x0008F0)
  for (let offset = 0; offset < romLen - 2; offset += 1) {
    if (romBytes[offset] === 0xF0 && romBytes[offset + 1] === 0x08 && romBytes[offset + 2] === 0x00) {
      const contextStart = Math.max(0, offset - 8);
      const contextEnd = Math.min(romLen, offset + 8);
      results.push({
        pattern: 'F0 08 00',
        address: hex(offset),
        interpretation: 'MBASE-relative 0x0008F0 → 0xD008F0 with MBASE=0xD0',
        context: hexSlice(romBytes, contextStart, contextEnd - contextStart),
        contextStartAddr: hex(contextStart),
      });
    }
  }

  return {
    totalMatches: results.length,
    matches: results,
  };
}

// ── Part B: STAT memory region dump ──

function partB_memoryDump(mem) {
  const dumpBytes = [];
  const nonZeroOffsets = [];

  for (let offset = 0; offset < DUMP_LENGTH; offset += 1) {
    const addr = DUMP_START + offset;
    const byte = mem[addr] & 0xFF;
    dumpBytes.push(hexByte(byte));
    if (byte !== 0) {
      nonZeroOffsets.push({
        offset: hex(offset, 2),
        address: hex(addr),
        value: hexByte(byte),
      });
    }
  }

  return {
    startAddr: hex(DUMP_START),
    endAddr: hex(DUMP_START + DUMP_LENGTH),
    length: DUMP_LENGTH,
    hexDump: hexSlice(mem, DUMP_START, DUMP_LENGTH),
    bytes: dumpBytes,
    nonZeroBytes: nonZeroOffsets,
    structCursorAddr: hex(STRUCT_CURSOR_ADDR),
    structCursorValue: hex(read24Raw(mem, STRUCT_CURSOR_ADDR)),
    watchAddr: hex(WATCH_ADDR),
    watchValue: hex(read16Raw(mem, WATCH_ADDR), 4),
  };
}

// ── Part C: Parametric experiment ──

function partC_parametric(baselineMem) {
  const testValues = [1, 3, 5, 7, 10];
  const results = [];

  for (const bcValue of testValues) {
    const mem = new Uint8Array(baselineMem);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    // Seed STAT lists
    seedStatLists(mem);

    // Reset CPU for the block run
    resetCpuForOsCall(cpu, mem);

    // Write the test value at 0xD008F0 as 24-bit LE
    write24Raw(mem, STRUCT_CURSOR_ADDR, bcValue);

    // Record pre-state
    const preD008E6 = read16Raw(mem, WATCH_ADDR);

    // Set up return sentinel
    cpu.sp -= 3;
    write24Raw(mem, cpu.sp, RETURN_SENTINEL);

    // Run from 0x09201E for 200 steps
    const trace = runTraceSegmented(executor, BLOCK_09201E, 'adl', {
      totalMaxSteps: 200,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      sentinels: new Map([[RETURN_SENTINEL, 'return_hit']]),
    });

    const postD008E6 = read16Raw(mem, WATCH_ADDR);

    results.push({
      bc_value: bcValue,
      bc_hex: hex(bcValue, 4),
      pre_d008e6: hex(preD008E6, 4),
      computed_size: postD008E6,
      computed_size_hex: hex(postD008E6, 4),
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
    });
  }

  // Analyze for linear relationship: size = a*bc + b
  const pairs = results.map((r) => ({ x: r.bc_value, y: r.computed_size }));
  let linearFit = null;
  if (pairs.length >= 2) {
    const x0 = pairs[0].x;
    const y0 = pairs[0].y;
    const x1 = pairs[1].x;
    const y1 = pairs[1].y;
    if (x1 !== x0) {
      const slope = (y1 - y0) / (x1 - x0);
      const intercept = y0 - slope * x0;
      const allMatch = pairs.every((p) => Math.abs(p.y - (slope * p.x + intercept)) < 0.01);
      linearFit = {
        slope,
        intercept,
        formula: `size = ${slope} * bc + ${intercept}`,
        allPointsMatch: allMatch,
        residuals: pairs.map((p) => ({
          bc: p.x,
          actual: p.y,
          predicted: slope * p.x + intercept,
          residual: p.y - (slope * p.x + intercept),
        })),
      };
    }
  }

  return {
    testValues,
    results,
    linearAnalysis: linearFit,
  };
}

// ── Part D: Write-watch on 0xD008F0 ──

function partD_writeWatch(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Seed STAT lists
  seedStatLists(mem);

  // Reset for STAT entry
  resetCpuForStatEntry(cpu, mem);

  const writeEvents = [];
  let prevD008F0 = [mem[STRUCT_CURSOR_ADDR], mem[STRUCT_CURSOR_ADDR + 1], mem[STRUCT_CURSOR_ADDR + 2]];

  const trace = runTraceSegmented(executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: 3000,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[RETURN_SENTINEL, 'return_hit']]),
    onBlock(event) {
      const currD008F0 = [mem[STRUCT_CURSOR_ADDR], mem[STRUCT_CURSOR_ADDR + 1], mem[STRUCT_CURSOR_ADDR + 2]];
      const changed = currD008F0[0] !== prevD008F0[0]
        || currD008F0[1] !== prevD008F0[1]
        || currD008F0[2] !== prevD008F0[2];

      if (changed) {
        const oldValue = prevD008F0[0] | (prevD008F0[1] << 8) | (prevD008F0[2] << 16);
        const newValue = currD008F0[0] | (currD008F0[1] << 8) | (currD008F0[2] << 16);
        writeEvents.push({
          step: event.step,
          block: hex(event.pc),
          oldValue: hex(oldValue),
          newValue: hex(newValue),
          oldValue16: hex(oldValue & 0xFFFF, 4),
          newValue16: hex(newValue & 0xFFFF, 4),
          cpuState: {
            a: hex(cpu.a, 2),
            bc: hex(cpu._bc),
            de: hex(cpu._de),
            hl: hex(cpu._hl),
            sp: hex(cpu.sp),
          },
        });
        prevD008F0 = [...currD008F0];
      }
    },
  });

  return {
    entry: hex(STAT_ENTRY),
    maxSteps: 3000,
    traceSteps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    finalPc: hex(trace.lastPc),
    writeEventsCount: writeEvents.length,
    writeEvents,
    finalD008F0: hex(read24Raw(mem, STRUCT_CURSOR_ADDR)),
    finalD008F0_16: hex(read16Raw(mem, STRUCT_CURSOR_ADDR), 4),
  };
}

// ── Main ──

function main() {
  const baseline = createBaselineState();
  const { runtime, baselineMem } = baseline;

  const partA = partA_romReferences();
  const partB = partB_memoryDump(runtime.mem);
  const partC = partC_parametric(baselineMem);
  const partD = partD_writeWatch(baselineMem);

  const output = {
    probe: 'probe-phase201-stat-d008f0-decode',
    generatedAt: new Date().toISOString(),
    constraints: {
      timerInterrupt: false,
      mbase: hex(SHORT_MBASE, 2),
      structCursorAddr: hex(STRUCT_CURSOR_ADDR),
      watchAddr: hex(WATCH_ADDR),
      statEntry: hex(STAT_ENTRY),
      block09201E: hex(BLOCK_09201E),
    },
    baseline: {
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    partA,
    partB,
    partC,
    partD,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
