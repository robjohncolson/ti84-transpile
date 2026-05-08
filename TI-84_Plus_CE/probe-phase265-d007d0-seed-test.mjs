#!/usr/bin/env node
/**
 * Phase 265: D007D0 Seed Test
 *
 * Boot the CPU through the full standard sequence, then test 4 different
 * D007D0 seed values by calling 0x062055 (cxMain dispatch).  Measures which
 * seed lets execution proceed furthest without crashing at 0x08C69E.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Boot constants (from probe-phase99d-home-verify.mjs)
// ---------------------------------------------------------------------------
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

// Target addresses
const D007D0 = 0xD007D0;
const D0230F = 0xD0230F;
const CXMAIN_DISPATCH = 0x062055;
const CRASH_SITE = 0x08C69E;

// Seed candidates
const SEEDS = [
  { label: 'A', name: 'home-screen handler',   value: 0x06C546 },
  { label: 'B', name: 'cxMain address',        value: 0x058241 },
  { label: 'C', name: 'home/editor dispatch',   value: 0x0AB8D4 },
  { label: 'D', name: 'control (null)',         value: 0x000000 },
];

const TEST_STEPS = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpuFromSnapshot(cpu, snapshot) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
}

function write24(mem, addr, val) {
  mem[addr] = val & 0xFF;
  mem[addr + 1] = (val >> 8) & 0xFF;
  mem[addr + 2] = (val >> 16) & 0xFF;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

// ---------------------------------------------------------------------------
// Cold boot (copied from probe-phase99d)
// ---------------------------------------------------------------------------
function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, 'z80', {
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

function runStage(executor, cpu, cpuSnap, label, entry, maxSteps) {
  restoreCpuFromSnapshot(cpu, cpuSnap);
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;

  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(`  ${label}: entry=${hex(entry)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Phase 265: D007D0 Seed Test ===\n');

  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // -----------------------------------------------------------------------
  // Full boot sequence
  // -----------------------------------------------------------------------
  console.log('--- Cold boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  // Snapshot after boot
  const cpuSnapAfterBoot = snapshotCpu(cpu);

  // Run homescreen stages 1-4 (same as phase99d)
  console.log('\n--- Homescreen stages ---');
  runStage(executor, cpu, cpuSnapAfterBoot, 'stage 1 status bar', STAGE_1_ENTRY, 30000);
  runStage(executor, cpu, cpuSnapAfterBoot, 'stage 2 status dots', STAGE_2_ENTRY, 30000);
  runStage(executor, cpu, cpuSnapAfterBoot, 'stage 3 home row', STAGE_3_ENTRY, 50000);
  runStage(executor, cpu, cpuSnapAfterBoot, 'stage 4 history', STAGE_4_ENTRY, 50000);

  // Snapshot RAM + CPU after full boot (includes all stage side effects on RAM)
  const ramSnapAfterBoot = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnapFinal = snapshotCpu(cpu);

  // -----------------------------------------------------------------------
  // Check D0230F (gates cxMain vs graph)
  // -----------------------------------------------------------------------
  const d0230fVal = mem[D0230F];
  const d007d0Val = read24(mem, D007D0);
  console.log(`\n--- Post-boot state ---`);
  console.log(`D0230F = ${hex(d0230fVal, 2)} (gates cxMain dispatch)`);
  console.log(`D007D0 = ${hex(d007d0Val)} (current value, expected 0x000000)`);

  // -----------------------------------------------------------------------
  // Test each seed value
  // -----------------------------------------------------------------------
  console.log('\n--- Seed tests (calling 0x062055 with different D007D0 values) ---\n');

  for (const seed of SEEDS) {
    // Restore full state from after boot
    mem.set(ramSnapAfterBoot, 0x400000);
    restoreCpuFromSnapshot(cpu, cpuSnapFinal);
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    // Seed D007D0
    write24(mem, D007D0, seed.value);
    const verify = read24(mem, D007D0);
    console.log(`Test ${seed.label}: ${seed.name} — D007D0 = ${hex(seed.value)}`);
    console.log(`  verify write: ${hex(verify)}`);

    // Track execution
    const visitedBlocks = new Set();
    const pcHistory = [];
    let reachedCrashSite = false;
    let stepCount = 0;

    const result = executor.runFrom(CXMAIN_DISPATCH, 'adl', {
      maxSteps: TEST_STEPS,
      maxLoopIterations: 200,
      onBlock: (pc, mode, meta, stageSteps) => {
        visitedBlocks.add(pc);
        pcHistory.push(pc);
        stepCount = stageSteps;
        if (pc === CRASH_SITE) {
          reachedCrashSite = true;
        }
      },
      onMissingBlock: (pc, mode, stageSteps) => {
        visitedBlocks.add(pc);
        pcHistory.push(pc);
        stepCount = stageSteps;
        if (pc === CRASH_SITE) {
          reachedCrashSite = true;
        }
      },
    });

    const last10 = pcHistory.slice(-10).map((pc) => hex(pc));
    const d007d0After = read24(mem, D007D0);

    console.log(`  steps: ${result.steps}`);
    console.log(`  termination: ${result.termination}`);
    console.log(`  lastPc: ${hex(result.lastPc)}`);
    console.log(`  unique blocks: ${visitedBlocks.size}`);
    console.log(`  reached crash site (0x08C69E): ${reachedCrashSite}`);
    console.log(`  D007D0 after: ${hex(d007d0After)}`);
    console.log(`  last 10 PCs: ${last10.join(', ')}`);
    console.log('');
  }

  console.log('=== Phase 265 complete ===');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
