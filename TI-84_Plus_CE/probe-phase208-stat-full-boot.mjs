#!/usr/bin/env node
/**
 * Phase 208 Probe: STAT entry from FULL BOOT + CoorMon path
 *
 * Tests whether STAT works after a full OS boot (kernelInit -> memInit ->
 * homescreen stages 1-4 with IX=0xD1A860), rather than the cold-boot-only
 * baseline used in sessions 204-207.
 *
 * After full boot, seeds L1={1.0,2.0,3.0} and enters STAT via 0x058BA9.
 * Reports unique blocks, error loop presence, OP1 contents, FP blocks
 * reached, and RAM at 0xD008E6 for comparison with cold-boot STAT (264 blocks).
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
transpiledUrl.searchParams.set('phase208', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

// ── Constants ────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

// Homescreen stage entries (from golden regression probe-phase99d)
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const STAT_ENTRY = 0x058BA9;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE208_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;
const STAT_STEP_LIMIT = 50000;

// STAT / error loop addresses
const EVENT_LOOP = 0x082BE2;

// OP slots
const OP1_ADDR = 0xD005F8;
const OP_REAL_LEN = 9;

// STAT structure
const STAT_STRUCT_START = 0xD008E6;
const STAT_STRUCT_LEN = 0x3B; // 0xD008E6..0xD00920

// FP/math address ranges
const FP_RANGE_START = 0x07B000;
const FP_RANGE_END = 0x07DFFF;

// List seeding addresses
const LIST_DATA_ADDR = 0xD01600;
const VAT_ENTRY_ADDR = 0xD1A800;
const OPBASE_ADDR = 0xD1A800;
const OPS_PTEMP_ADDR = 0xD1A808;
const NEWDATA_PTR_ADDR = 0xD0161D;

// ── Helpers ──────────────────────────────────────────────────────────

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
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr & MEM_MASK] = value & 0xFF;
  mem[(addr + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return (
    (mem[addr & MEM_MASK]) |
    (mem[(addr + 1) & MEM_MASK] << 8) |
    (mem[(addr + 2) & MEM_MASK] << 16)
  ) >>> 0;
}

// ── Boot sequence ────────────────────────────────────────────────────

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

function coldBoot(executor, cpu, mem) {
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
  mem[0xD008DF] = 0x00;

  const sentinels = new Map([[MEM_INIT_RET, 'mem_init_return']]);
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels,
  });
}

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, cpuSnap) {
  const stages = [];

  // Stage 1: status bar background
  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  const s1 = runStageInSegments(executor, STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage1_statusbar', steps: s1.steps, lastPc: hex(s1.lastPc), termination: s1.termination });

  // Stage 2: status dots
  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  mem[0xD0009B] &= ~0x40;
  const s2 = runStageInSegments(executor, STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage2_statusdots', steps: s2.steps, lastPc: hex(s2.lastPc), termination: s2.termination });

  // Stage 3: home row strip
  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  const s3 = runStageInSegments(executor, STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage3_homerow', steps: s3.steps, lastPc: hex(s3.lastPc), termination: s3.termination });

  // Stage 4: history area
  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  const s4 = runStageInSegments(executor, STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({ label: 'stage4_history', steps: s4.steps, lastPc: hex(s4.lastPc), termination: s4.termination });

  return stages;
}

// ── Trace runner ─────────────────────────────────────────────────────

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? STAT_STEP_LIMIT;
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
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) onBlock({ pc: norm, mode: dispatchMode ?? lastMode, meta, step: totalSteps + localStep });
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) onMissingBlock({ pc: norm, mode: dispatchMode ?? lastMode, step: totalSteps + localStep });
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
        hitSentinel = { name: error.stopName, pc: hex(error.stopPc) };
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

// ── List seeding ─────────────────────────────────────────────────────

function seedListL1(mem) {
  const listBase = LIST_DATA_ADDR;

  // count = 3 (little-endian 16-bit)
  mem[listBase] = 0x03;
  mem[listBase + 1] = 0x00;

  // Element 1: 1.0 in TI BCD (9 bytes)
  const e1 = listBase + 2;
  mem[e1] = 0x00; mem[e1+1] = 0x80; mem[e1+2] = 0x10;
  mem[e1+3] = 0x00; mem[e1+4] = 0x00; mem[e1+5] = 0x00;
  mem[e1+6] = 0x00; mem[e1+7] = 0x00; mem[e1+8] = 0x00;

  // Element 2: 2.0
  const e2 = e1 + 9;
  mem[e2] = 0x00; mem[e2+1] = 0x80; mem[e2+2] = 0x20;
  mem[e2+3] = 0x00; mem[e2+4] = 0x00; mem[e2+5] = 0x00;
  mem[e2+6] = 0x00; mem[e2+7] = 0x00; mem[e2+8] = 0x00;

  // Element 3: 3.0
  const e3 = e2 + 9;
  mem[e3] = 0x00; mem[e3+1] = 0x80; mem[e3+2] = 0x30;
  mem[e3+3] = 0x00; mem[e3+4] = 0x00; mem[e3+5] = 0x00;
  mem[e3+6] = 0x00; mem[e3+7] = 0x00; mem[e3+8] = 0x00;

  // VAT entry for L1 at 0xD1A800
  const vatBase = VAT_ENTRY_ADDR;
  mem[vatBase] = 0x01;       // type = real list
  mem[vatBase + 1] = 0x00;   // data ptr low  (0xD01600 LE)
  mem[vatBase + 2] = 0x16;   // data ptr mid
  mem[vatBase + 3] = 0xD0;   // data ptr high
  mem[vatBase + 4] = 0x5D;   // name byte 1 (L)
  mem[vatBase + 5] = 0x00;   // name byte 2 (subscript 0 = L1)

  // Allocator pointers
  // opBase = 0xD1A800
  write24(mem, 0xD02590, OPBASE_ADDR);
  // ops/pTemp = 0xD1A808
  write24(mem, 0xD02593, OPS_PTEMP_ADDR);
  write24(mem, 0xD0259A, OPS_PTEMP_ADDR);
  // newDataPtr = 0xD0161D (past the 3 elements: 0xD01600 + 2 + 3*9 = 0xD0161D)
  write24(mem, 0xD025A0, NEWDATA_PTR_ADDR);
}

// ── STAT trace with block tracking ──────────────────────────────────

function runStatTrace(executor, cpu, mem, stepLimit) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;  // STAT token
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const visitedBlocks = [];
  const visitedSet = new Set();
  const blockFreq = new Map();
  let reachedEventLoop = false;
  const fpBlocks = new Set();

  const sentinels = new Map([
    [RETURN_SENTINEL, 'return_sentinel'],
  ]);

  const result = runTraceSegmented(executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: stepLimit,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels,
    onBlock({ pc }) {
      const norm = pc & 0xFFFFFF;
      blockFreq.set(norm, (blockFreq.get(norm) || 0) + 1);
      if (!visitedSet.has(norm)) {
        visitedSet.add(norm);
        visitedBlocks.push(norm);
      }
      if (norm === EVENT_LOOP) reachedEventLoop = true;
      if (norm >= FP_RANGE_START && norm <= FP_RANGE_END) fpBlocks.add(norm);
    },
    onMissingBlock({ pc }) {
      const norm = pc & 0xFFFFFF;
      blockFreq.set(norm, (blockFreq.get(norm) || 0) + 1);
      if (!visitedSet.has(norm)) {
        visitedSet.add(norm);
        visitedBlocks.push(norm);
      }
      if (norm === EVENT_LOOP) reachedEventLoop = true;
      if (norm >= FP_RANGE_START && norm <= FP_RANGE_END) fpBlocks.add(norm);
    },
  });

  // Top-15 most visited blocks
  const top15 = [...blockFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([pc, count]) => ({ block: hex(pc), count }));

  // FP blocks sorted
  const fpBlocksSorted = [...fpBlocks].sort((a, b) => a - b).map((pc) => hex(pc));

  return {
    trace: result,
    uniqueBlocks: visitedBlocks.length,
    reachedEventLoop,
    top15Blocks: top15,
    firstBlocks: visitedBlocks.slice(0, 30).map((pc) => hex(pc)),
    lastBlocks: visitedBlocks.slice(-20).map((pc) => hex(pc)),
    fpBlocks: fpBlocksSorted,
    fpBlockCount: fpBlocksSorted.length,
    op1After: bytesToHex(mem, OP1_ADDR, 9),
    statStructAfter: bytesToHex(mem, STAT_STRUCT_START, STAT_STRUCT_LEN),
    ramD008E6: bytesToHex(mem, STAT_STRUCT_START, 16),
    registers: {
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      bc: hex(cpu.bc),
      de: hex(cpu.de),
      hl: hex(cpu.hl),
      sp: hex(cpu.sp),
      ix: hex(cpu._ix),
      iy: hex(cpu._iy),
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 208: STAT entry from full boot ===');

  // 1. Create runtime
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // 2. Cold boot (z80 boot -> kernelInit -> postInit)
  console.log('Running cold boot...');
  const bootInfo = coldBoot(executor, cpu, mem);
  console.log(`  boot: ${JSON.stringify(bootInfo.boot)}`);
  console.log(`  kernelInit: ${JSON.stringify(bootInfo.kernelInit)}`);
  console.log(`  postInit: ${JSON.stringify(bootInfo.postInit)}`);

  // 3. memInit
  console.log('Running memInit...');
  const memInit = runMemInit(executor, cpu, mem);
  console.log(`  memInit: steps=${memInit.steps} termination=${memInit.termination} sentinel=${JSON.stringify(memInit.hitSentinel)}`);

  // 4. Snapshot CPU after boot+memInit, then run homescreen stages
  const cpuSnap = snapshotCpu(cpu);
  console.log('Running homescreen stages 1-4 (IX=0xD1A860)...');
  const stages = runHomescreenStages(executor, cpu, mem, cpuSnap);
  for (const s of stages) {
    console.log(`  ${s.label}: steps=${s.steps} lastPc=${s.lastPc} term=${s.termination}`);
  }

  // 5. Seed list data L1={1,2,3}
  console.log('Seeding L1={1.0, 2.0, 3.0}...');
  seedListL1(mem);

  // Capture pre-STAT state
  const preStatOP1 = bytesToHex(mem, OP1_ADDR, 9);
  const preStatStruct = bytesToHex(mem, STAT_STRUCT_START, STAT_STRUCT_LEN);

  // 6. Run STAT via 0x058BA9 for 50000 steps
  console.log(`Running STAT from ${hex(STAT_ENTRY)} for ${STAT_STEP_LIMIT} steps...`);
  const statResult = runStatTrace(executor, cpu, mem, STAT_STEP_LIMIT);

  console.log(`  termination: ${statResult.trace.termination}`);
  console.log(`  steps: ${statResult.trace.steps}`);
  console.log(`  uniqueBlocks: ${statResult.uniqueBlocks}`);
  console.log(`  reachedEventLoop (0x082BE2): ${statResult.reachedEventLoop}`);
  console.log(`  fpBlocks reached: ${statResult.fpBlockCount}`);
  console.log(`  OP1 after: ${statResult.op1After}`);
  console.log(`  RAM@D008E6: ${statResult.ramD008E6}`);

  // 7. Also run cold-boot-only STAT for comparison
  console.log('\n--- Cold-boot-only STAT comparison ---');
  const mem2 = new Uint8Array(MEM_SIZE);
  mem2.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals2 = createPeripheralBus({ timerInterrupt: false });
  const executor2 = createExecutor(BLOCKS, mem2, { peripherals: peripherals2 });
  const cpu2 = executor2.cpu;

  // Cold boot only (no homescreen stages)
  coldBoot(executor2, cpu2, mem2);
  const memInit2 = runMemInit(executor2, cpu2, mem2);

  // Seed same list
  seedListL1(mem2);

  const coldStatResult = runStatTrace(executor2, cpu2, mem2, STAT_STEP_LIMIT);
  console.log(`  cold-boot STAT uniqueBlocks: ${coldStatResult.uniqueBlocks}`);
  console.log(`  cold-boot STAT reachedEventLoop: ${coldStatResult.reachedEventLoop}`);
  console.log(`  cold-boot STAT fpBlocks: ${coldStatResult.fpBlockCount}`);
  console.log(`  cold-boot STAT termination: ${coldStatResult.trace.termination}`);

  // 8. Build output
  const output = {
    probe: 'probe-phase208-stat-full-boot.mjs',
    generatedAt: new Date().toISOString(),
    runtime: { timerInterrupt: false },
    boot: bootInfo,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      loopBreakCount: memInit.loopBreakCount,
    },
    homescreenStages: stages,
    listSeed: {
      listDataAddr: hex(LIST_DATA_ADDR),
      vatEntryAddr: hex(VAT_ENTRY_ADDR),
      elements: 3,
      values: [1.0, 2.0, 3.0],
    },
    fullBootStat: {
      entry: hex(STAT_ENTRY),
      stepLimit: STAT_STEP_LIMIT,
      termination: statResult.trace.termination,
      steps: statResult.trace.steps,
      lastPc: hex(statResult.trace.lastPc),
      uniqueBlocks: statResult.uniqueBlocks,
      reachedEventLoop: statResult.reachedEventLoop,
      fpBlockCount: statResult.fpBlockCount,
      fpBlocks: statResult.fpBlocks,
      top15Blocks: statResult.top15Blocks,
      firstBlocks: statResult.firstBlocks,
      lastBlocks: statResult.lastBlocks,
      op1Before: preStatOP1,
      op1After: statResult.op1After,
      statStructBefore: preStatStruct,
      statStructAfter: statResult.statStructAfter,
      ramD008E6: statResult.ramD008E6,
      registers: statResult.registers,
      loopBreakCount: statResult.trace.loopBreakCount,
      errorMessage: statResult.trace.errorMessage,
    },
    coldBootStat: {
      entry: hex(STAT_ENTRY),
      stepLimit: STAT_STEP_LIMIT,
      termination: coldStatResult.trace.termination,
      steps: coldStatResult.trace.steps,
      lastPc: hex(coldStatResult.trace.lastPc),
      uniqueBlocks: coldStatResult.uniqueBlocks,
      reachedEventLoop: coldStatResult.reachedEventLoop,
      fpBlockCount: coldStatResult.fpBlockCount,
      fpBlocks: coldStatResult.fpBlocks,
      top15Blocks: coldStatResult.top15Blocks,
      firstBlocks: coldStatResult.firstBlocks,
      lastBlocks: coldStatResult.lastBlocks,
      op1After: coldStatResult.op1After,
      ramD008E6: coldStatResult.ramD008E6,
      registers: coldStatResult.registers,
      loopBreakCount: coldStatResult.trace.loopBreakCount,
      errorMessage: coldStatResult.trace.errorMessage,
    },
    comparison: {
      fullBootUniqueBlocks: statResult.uniqueBlocks,
      coldBootUniqueBlocks: coldStatResult.uniqueBlocks,
      blockDelta: statResult.uniqueBlocks - coldStatResult.uniqueBlocks,
      fullBootReachedEventLoop: statResult.reachedEventLoop,
      coldBootReachedEventLoop: coldStatResult.reachedEventLoop,
      fullBootFpBlocks: statResult.fpBlockCount,
      coldBootFpBlocks: coldStatResult.fpBlockCount,
      fullBootTermination: statResult.trace.termination,
      coldBootTermination: coldStatResult.trace.termination,
    },
  };

  return output;
}

// ── Entry point ──────────────────────────────────────────────────────

try {
  const result = main();
  console.log('\n' + JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.stack || String(error));
  console.log(JSON.stringify({
    probe: 'probe-phase208-stat-full-boot.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
