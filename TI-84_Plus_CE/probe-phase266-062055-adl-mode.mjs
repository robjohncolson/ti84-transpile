#!/usr/bin/env node
/**
 * Phase 266 — Investigate z80-mode bug at 0x062055
 *
 * 0x062055 is the OS context-switching dispatcher. Session 265 found that
 * calling it dynamically after boot produces a z80-mode loop through
 * 0x000000-0x00069A instead of reaching cxMain (0x058241). This probe
 * checks whether the ADL mode bit is the root cause.
 *
 * Experiments:
 *   1. ADL=true,  D0230F=0x3F, D007D0=0x06C546 (home handler)
 *   2. ADL=false, D0230F=0x3F, D007D0=0x06C546 (confirm z80 loop)
 *   3. ADL=true,  D0230F=0x00, D007D0=0x06C546 (non-0x3F path)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── ROM + transpiled blocks ──────────────────────────────────────────

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const RETURN_SENTINEL = 0x7FFFFE;

const TARGET_FUNC = 0x062055;
const CXMAIN_ADDR = 0x058241;
const GRAPH_PATH = 0x05FE15;
const GATE_080151 = 0x080151;

const D007D0 = 0xD007D0;
const D007E0 = 0xD007E0;
const D0230F = 0xD0230F;
const D007FA = 0xD007FA;

// ── Helpers ──────────────────────────────────────────────────────────

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
  return mem[base] | (mem[base + 1] << 8) | (mem[base + 2] << 16);
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
  return Object.fromEntries(fields.map((f) => [f, cpu[f]]));
}

// ── Run an experiment ────────────────────────────────────────────────

function runExperiment(label, executor, cpu, mem, cpuSnap, ramSnap, opts) {
  const {
    adlMode,
    d0230fValue,
    d007d0Value,
    maxSteps = 500,
  } = opts;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Experiment: ${label}`);
  console.log(`  ADL=${adlMode}, D0230F=${hex(d0230fValue, 2)}, D007D0=${hex(d007d0Value)}`);
  console.log(`${'='.repeat(60)}`);

  // Restore RAM + CPU from post-boot snapshot
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) {
    cpu[f] = v;
  }

  // Set up CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  // Set ADL mode
  cpu.madl = adlMode ? 1 : 0;

  // Set B=3 (to pass the 0x080151 gate)
  // B is the high byte of BC in eZ80
  const oldBC = cpu._bc;
  cpu._bc = (oldBC & 0xFF00FF) | (3 << 8);
  // Actually B is bits 8-15 of _bc in 24-bit mode
  // Let's just set it more carefully
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  // Set up stack with return sentinel
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Seed memory
  mem[D0230F & MEM_MASK] = d0230fValue & 0xFF;
  write24(mem, D007D0, d007d0Value);

  // Seed D007FA with SP value (function does LD SP,(D007FA))
  write24(mem, D007FA, cpu.sp);

  console.log(`  Pre-call state:`);
  console.log(`    cpu.madl = ${cpu.madl}`);
  console.log(`    cpu.mbase = ${hex(cpu.mbase, 2)}`);
  console.log(`    cpu.sp = ${hex(cpu.sp)}`);
  console.log(`    cpu._bc = ${hex(cpu._bc)} (B=${(cpu._bc >>> 8) & 0xFF})`);
  console.log(`    D0230F = ${hex(mem[D0230F & MEM_MASK], 2)}`);
  console.log(`    D007D0 = ${hex(read24(mem, D007D0))}`);
  console.log(`    D007FA = ${hex(read24(mem, D007FA))}`);

  // Track blocks visited
  const blocksVisited = [];
  const uniqueBlocks = new Set();
  let reachedCxMain = false;
  let reachedGraphPath = false;
  let reached08C69E = false;
  let reachedGate = false;
  let z80BlockCount = 0;
  let adlBlockCount = 0;

  const startMode = adlMode ? 'adl' : 'z80';

  const result = executor.runFrom(TARGET_FUNC, startMode, {
    maxSteps,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, step) => {
      const blockKey = `${hex(pc)}:${mode}`;
      blocksVisited.push(blockKey);
      uniqueBlocks.add(blockKey);

      if (mode === 'z80') z80BlockCount++;
      else adlBlockCount++;

      if (pc === CXMAIN_ADDR) reachedCxMain = true;
      if (pc === GRAPH_PATH) reachedGraphPath = true;
      if (pc === 0x08C69E) reached08C69E = true;
      if (pc === GATE_080151) reachedGate = true;
    },
  });

  console.log(`\n  Execution result:`);
  console.log(`    steps = ${result.steps}`);
  console.log(`    termination = ${result.termination}`);
  console.log(`    lastPc = ${hex(result.lastPc)}`);
  console.log(`    lastMode = ${result.lastMode}`);
  console.log(`    cpu.madl after = ${cpu.madl}`);
  console.log(`    loopsForced = ${result.loopsForced}`);

  console.log(`\n  Block statistics:`);
  console.log(`    total blocks executed = ${blocksVisited.length}`);
  console.log(`    unique blocks = ${uniqueBlocks.size}`);
  console.log(`    z80-mode blocks = ${z80BlockCount}`);
  console.log(`    adl-mode blocks = ${adlBlockCount}`);

  console.log(`\n  Key addresses reached:`);
  console.log(`    0x080151 (gate)     = ${reachedGate}`);
  console.log(`    0x058241 (cxMain)   = ${reachedCxMain}`);
  console.log(`    0x05FE15 (graph)    = ${reachedGraphPath}`);
  console.log(`    0x08C69E            = ${reached08C69E}`);

  // Show first 30 unique blocks
  const sortedBlocks = [...uniqueBlocks].sort();
  console.log(`\n  Unique blocks (first 50 of ${sortedBlocks.length}):`);
  for (const block of sortedBlocks.slice(0, 50)) {
    console.log(`    ${block}`);
  }

  // Show execution trace (first 40 blocks)
  console.log(`\n  Execution trace (first 40 blocks):`);
  for (let i = 0; i < Math.min(40, blocksVisited.length); i++) {
    console.log(`    [${i}] ${blocksVisited[i]}`);
  }

  // Check z80 low-address pattern
  const lowAddrBlocks = sortedBlocks.filter((b) => {
    const addr = parseInt(b.split(':')[0].replace('0x', ''), 16);
    return addr < 0x001000;
  });
  if (lowAddrBlocks.length > 0) {
    console.log(`\n  WARNING: ${lowAddrBlocks.length} blocks in low ROM (< 0x001000):`);
    for (const b of lowAddrBlocks) {
      console.log(`    ${b}`);
    }
  }

  // Post-execution memory state
  console.log(`\n  Post-execution memory:`);
  console.log(`    D007D0 = ${hex(read24(mem, D007D0))}`);
  console.log(`    D007E0 = ${hex(read24(mem, D007E0))}`);
  console.log(`    D0230F = ${hex(mem[D0230F & MEM_MASK], 2)}`);

  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`\n  Missing blocks (first 20):`);
    for (const mb of result.missingBlocks.slice(0, 20)) {
      console.log(`    ${mb}`);
    }
  }

  return {
    label,
    adlMode,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    uniqueBlocks: sortedBlocks,
    z80BlockCount,
    adlBlockCount,
    reachedCxMain,
    reachedGraphPath,
    reached08C69E,
    reachedGate,
    lowAddrBlocks,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 266 — Investigate z80-mode bug at 0x062055 ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Full boot
  console.log('--- Cold boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`Post-boot cpu.madl = ${cpu.madl}`);
  console.log(`Post-boot cpu.mbase = ${hex(cpu.mbase, 2)}`);
  console.log(`Post-boot cpu.sp = ${hex(cpu.sp)}`);

  // Snapshot post-boot state
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // Experiment 1: ADL=true, D0230F=0x3F, D007D0=0x06C546
  const exp1 = runExperiment('Exp1: ADL=true, D0230F=0x3F', executor, cpu, mem, cpuSnap, ramSnap, {
    adlMode: true,
    d0230fValue: 0x3F,
    d007d0Value: 0x06C546,
    maxSteps: 500,
  });

  // Experiment 2: ADL=false, D0230F=0x3F, D007D0=0x06C546
  const exp2 = runExperiment('Exp2: ADL=false, D0230F=0x3F', executor, cpu, mem, cpuSnap, ramSnap, {
    adlMode: false,
    d0230fValue: 0x3F,
    d007d0Value: 0x06C546,
    maxSteps: 500,
  });

  // Experiment 3: ADL=true, D0230F=0x00, D007D0=0x06C546
  const exp3 = runExperiment('Exp3: ADL=true, D0230F=0x00', executor, cpu, mem, cpuSnap, ramSnap, {
    adlMode: true,
    d0230fValue: 0x00,
    d007d0Value: 0x06C546,
    maxSteps: 500,
  });

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  for (const exp of [exp1, exp2, exp3]) {
    console.log(`\n${exp.label}:`);
    console.log(`  steps=${exp.steps}  term=${exp.termination}  lastPc=${hex(exp.lastPc)}`);
    console.log(`  z80 blocks=${exp.z80BlockCount}  adl blocks=${exp.adlBlockCount}`);
    console.log(`  reached gate=${exp.reachedGate}  cxMain=${exp.reachedCxMain}  graph=${exp.reachedGraphPath}  08C69E=${exp.reached08C69E}`);
    console.log(`  low-ROM blocks=${exp.lowAddrBlocks.length}`);
  }

  console.log('\nDone.');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
