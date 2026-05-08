#!/usr/bin/env node
/**
 * Phase 268 — 0x0582BC event-loop deep trace
 *
 * Cold-boot the ROM, restore the post-boot snapshot, then enter the
 * home-screen body at 0x0582BC with the same warm-state pattern used in
 * phase267. Two traces are run: 10,000 steps and 50,000 steps.
 */

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
const MEM_MASK = MEM_SIZE - 1;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;

const TRACE_ENTRY = 0x0582BC;
const TRACE_MODE = 'adl';
const TRACE_BUDGETS = [10000, 50000];
const TRACE_MAX_LOOP_ITERATIONS = 200;

const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const TRACKED_ADDRESSES = [
  { addr: 0x082BE2, label: 'event loop' },
  { addr: 0x0159C0, label: 'foreground keyboard scanner' },
  { addr: 0x081648, label: 'GetCSC' },
  { addr: 0x0159BD, label: 'near keyboard scanner' },
  { addr: 0x058D54, label: 'token class lookup' },
  { addr: 0x0589E5, label: 'key dispatch CP chain' },
  { addr: 0x058BA9, label: 'STAT entry' },
  { addr: 0x058AC9, label: 'BufInsert path' },
  { addr: 0x0585E9, label: 'cxMain body' },
  { addr: 0x058241, label: 'cxMain' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return result;
}

function snapshotCpu(cpu) {
  const fields = [
    'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
  ];
  return Object.fromEntries(fields.map((field) => [field, cpu[field]]));
}

function restorePostBootState(cpu, mem, cpuSnap, ramSnap) {
  mem.set(ramSnap, RAM_SNAPSHOT_START);
  for (const [field, value] of Object.entries(cpuSnap)) {
    cpu[field] = value;
  }
}

function prepareHomeBodyState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3F;

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);
}

function formatBlock(record) {
  return `${hex(record.pc)}:${record.mode} visits=${record.count} firstStep=${record.firstStep}`;
}

function printBlockList(title, blocks) {
  console.log(`\n${title} (${blocks.length})`);
  if (blocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of blocks) {
    console.log(`  ${formatBlock(block)}`);
  }
}

function printTrackedSummary(trackedStats) {
  console.log('\nTracked address hits');
  for (const stat of trackedStats) {
    console.log(
      `  ${hex(stat.addr)} ${stat.label.padEnd(28)} `
      + `visits=${String(stat.count).padStart(5, ' ')} `
      + `firstStep=${stat.firstStep === null ? 'n/a' : stat.firstStep}`
    );
  }
}

function runTrace(executor, cpu, mem, cpuSnap, ramSnap, maxSteps) {
  restorePostBootState(cpu, mem, cpuSnap, ramSnap);
  prepareHomeBodyState(cpu, mem);

  const blockMap = new Map();
  const trackedHits = new Map(TRACKED_ADDRESSES.map(({ addr }) => [addr, { count: 0, firstStep: null }]));

  const result = executor.runFrom(TRACE_ENTRY, TRACE_MODE, {
    maxSteps,
    maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc >>> 0;
      const normalizedMode = mode ?? TRACE_MODE;
      const key = `${normalizedPc.toString(16).padStart(6, '0')}:${normalizedMode}`;

      let record = blockMap.get(key);
      if (!record) {
        record = {
          pc: normalizedPc,
          mode: normalizedMode,
          count: 0,
          firstStep: step + 1,
        };
        blockMap.set(key, record);
      }
      record.count++;

      const tracked = trackedHits.get(normalizedPc);
      if (tracked) {
        tracked.count++;
        if (tracked.firstStep === null) tracked.firstStep = step + 1;
      }
    },
  });

  const allBlocks = [...blockMap.values()].sort((left, right) => {
    if (left.pc !== right.pc) return left.pc - right.pc;
    return left.mode.localeCompare(right.mode);
  });

  const topBlocks = [...blockMap.values()]
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      if (left.pc !== right.pc) return left.pc - right.pc;
      return left.mode.localeCompare(right.mode);
    })
    .slice(0, 50);

  const range0159 = allBlocks.filter((block) => block.pc >= 0x015900 && block.pc < 0x015A00);
  const range058x = allBlocks.filter((block) => block.pc >= 0x058000 && block.pc < 0x059000);

  const trackedStats = TRACKED_ADDRESSES.map(({ addr, label }) => ({
    addr,
    label,
    count: trackedHits.get(addr).count,
    firstStep: trackedHits.get(addr).firstStep,
  }));

  const keyboardScanReached = trackedHits.get(0x0159C0).count > 0;
  const nearKeyboardReached = trackedHits.get(0x0159BD).count > 0;
  const getCSCReached = trackedHits.get(0x081648).count > 0;

  console.log(`\n${'='.repeat(72)}`);
  console.log(`Trace from ${hex(TRACE_ENTRY)} for ${maxSteps.toLocaleString()} steps`);
  console.log(`${'='.repeat(72)}`);
  console.log(`entry = ${hex(TRACE_ENTRY)}:${TRACE_MODE}`);
  console.log(`IX=${hex(cpu._ix)} IY=${hex(cpu._iy)} SP=${hex(cpu.sp)} D007FA=${hex(read24(mem, D007FA))}`);
  console.log(`madl=${cpu.madl} mbase=${hex(cpu.mbase, 2)} D0230F=${hex(mem[D0230F & MEM_MASK], 2)}`);

  console.log('\nExecution result');
  console.log(`  steps=${result.steps}`);
  console.log(`  termination=${result.termination}`);
  console.log(`  lastPc=${hex(result.lastPc)}`);
  console.log(`  lastMode=${result.lastMode}`);
  console.log(`  loopsForced=${result.loopsForced}`);
  console.log(`  missingBlocks=${result.missingBlocks.length}`);

  printTrackedSummary(trackedStats);
  printBlockList('Top 50 most-visited blocks', topBlocks);
  printBlockList('0x0159xx blocks', range0159);
  printBlockList('0x058xxx blocks', range058x);
  printBlockList('All unique blocks visited', allBlocks);

  if (result.missingBlocks.length > 0) {
    console.log('\nMissing blocks encountered');
    for (const missing of result.missingBlocks) {
      console.log(`  ${missing}`);
    }
  }

  console.log('\nSummary');
  console.log(`  total unique blocks = ${allBlocks.length}`);
  console.log(`  total steps executed = ${result.steps}`);
  console.log(`  event loop reached = ${trackedHits.get(0x082BE2).count > 0}`);
  console.log(`  keyboard scan reached (0x0159C0) = ${keyboardScanReached}`);
  console.log(`  near keyboard block reached (0x0159BD) = ${nearKeyboardReached}`);
  console.log(`  GetCSC reached (0x081648) = ${getCSCReached}`);
  console.log(`  any 0x0159xx blocks reached = ${range0159.length > 0}`);

  return {
    maxSteps,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced,
    missingBlocks: result.missingBlocks,
    uniqueBlocks: allBlocks,
    trackedStats,
    range0159,
    range058x,
    keyboardScanReached,
    nearKeyboardReached,
    getCSCReached,
  };
}

async function main() {
  console.log('=== Phase 268 — 0x0582BC Event Loop Deep Trace ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`post-boot madl=${cpu.madl} mbase=${hex(cpu.mbase, 2)} sp=${hex(cpu.sp)}`);

  const ramSnap = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnap = snapshotCpu(cpu);

  const traces = TRACE_BUDGETS.map((budget) => runTrace(executor, cpu, mem, cpuSnap, ramSnap, budget));

  console.log(`\n${'='.repeat(72)}`);
  console.log('Overall comparison');
  console.log(`${'='.repeat(72)}`);
  for (const trace of traces) {
    const eventLoopVisits = trace.trackedStats.find((entry) => entry.addr === 0x082BE2)?.count ?? 0;
    const scanVisits = trace.trackedStats.find((entry) => entry.addr === 0x0159C0)?.count ?? 0;
    const nearScanVisits = trace.trackedStats.find((entry) => entry.addr === 0x0159BD)?.count ?? 0;
    const getCSCVisits = trace.trackedStats.find((entry) => entry.addr === 0x081648)?.count ?? 0;

    console.log(`\n${trace.maxSteps.toLocaleString()}-step run:`);
    console.log(`  steps=${trace.steps} termination=${trace.termination} lastPc=${hex(trace.lastPc)}:${trace.lastMode}`);
    console.log(`  uniqueBlocks=${trace.uniqueBlocks.length} loopsForced=${trace.loopsForced} missingBlocks=${trace.missingBlocks.length}`);
    console.log(`  eventLoopVisits=${eventLoopVisits}`);
    console.log(`  keyboardScanVisits(0x0159C0)=${scanVisits}`);
    console.log(`  nearKeyboardVisits(0x0159BD)=${nearScanVisits}`);
    console.log(`  GetCSCVisits(0x081648)=${getCSCVisits}`);
    console.log(`  any0x0159xx=${trace.range0159.length > 0} any0x058xxx=${trace.range058x.length > 0}`);
  }

  const shorter = traces[0];
  const deeper = traces[1];
  const shorterKeys = new Set(shorter.uniqueBlocks.map((block) => `${block.pc}:${block.mode}`));
  const deeperOnly = deeper.uniqueBlocks.filter((block) => !shorterKeys.has(`${block.pc}:${block.mode}`));

  console.log('\n50,000-step-only new blocks');
  if (deeperOnly.length === 0) {
    console.log('  none');
  } else {
    for (const block of deeperOnly) {
      console.log(`  ${formatBlock(block)}`);
    }
  }

  console.log('\nDone.');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
