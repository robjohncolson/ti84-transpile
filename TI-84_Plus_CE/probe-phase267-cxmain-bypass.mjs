#!/usr/bin/env node
/**
 * Phase 267 — cxMain bypass probe
 *
 * The boot path from 0x062055 reaches 0x08C69E, which eventually does
 * JP(HL) at 0x08C745 — but HL gets zeroed, causing a reset-vector jump.
 * This probe tests bypassing that path entirely by jumping directly into
 * cxMain (0x058241), its body (0x0585E9), or the home body (0x0582BC).
 *
 * Experiments:
 *   1. Direct entry to cxMain (0x058241)
 *   2. Direct entry to cxMain body (0x0585E9)
 *   3. Direct entry to home body (0x0582BC)
 *   4. Boot from 0x062055 with BIT 5 of (IY+0x25) set
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

// Key addresses to track
const ADDR_CXMAIN       = 0x058241;
const ADDR_CXMAIN_BODY  = 0x0585E9;
const ADDR_HOME_BODY    = 0x0582BC;
const ADDR_EVENT_LOOP   = 0x082BE2;
const ADDR_08C69E       = 0x08C69E;
const ADDR_08C745       = 0x08C745;
const ADDR_RESET        = 0x000000;
const ADDR_062055       = 0x062055;

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
    entryPC,
    seedD007D0 = false,
    seedBit5 = false,
    maxSteps = 500,
  } = opts;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Experiment: ${label}`);
  console.log(`  entry PC = ${hex(entryPC)}`);
  console.log(`${'='.repeat(60)}`);

  // Restore RAM + CPU from post-boot snapshot
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) {
    cpu[f] = v;
  }

  // Set up CPU state (standard for all experiments)
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;          // ADL=true
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  // D0230F = 0x3F
  mem[D0230F & MEM_MASK] = 0x3F;

  // Set B=3 (bits 8-15 of _bc)
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  // Set up stack with return sentinel
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Seed D007FA with SP value
  write24(mem, D007FA, cpu.sp);

  // Experiment-specific seeds
  if (seedD007D0) {
    write24(mem, D007D0, 0x06C546);
  }

  if (seedBit5) {
    // Set bit 5 of (IY+0x25) = mem[0xD000A5]
    const targetAddr = (cpu._iy + 0x25) & MEM_MASK;
    mem[targetAddr] = mem[targetAddr] | 0x20;
    console.log(`  Seeded (IY+0x25) = mem[${hex(targetAddr)}] = ${hex(mem[targetAddr], 2)}`);
    // Also seed D007D0 for experiment 4
    write24(mem, D007D0, 0x06C546);
  }

  console.log(`  Pre-call state:`);
  console.log(`    cpu.madl = ${cpu.madl}`);
  console.log(`    cpu.mbase = ${hex(cpu.mbase, 2)}`);
  console.log(`    cpu.sp = ${hex(cpu.sp)}`);
  console.log(`    cpu._bc = ${hex(cpu._bc)} (B=${(cpu._bc >>> 8) & 0xFF})`);
  console.log(`    cpu.a = ${hex(cpu.a, 2)}, cpu._hl = ${hex(cpu._hl)}, cpu._de = ${hex(cpu._de)}`);
  console.log(`    D0230F = ${hex(mem[D0230F & MEM_MASK], 2)}`);
  console.log(`    D007D0 = ${hex(read24(mem, D007D0))}`);
  console.log(`    D007FA = ${hex(read24(mem, D007FA))}`);
  console.log(`    (IY+0x25) = ${hex(mem[(cpu._iy + 0x25) & MEM_MASK], 2)}`);

  // Track blocks visited
  const blocksVisited = [];
  const uniqueBlocks = new Set();

  // Key address tracking
  let hitCxMain = false;
  let hitCxMainBody = false;
  let hitHomeBody = false;
  let hitEventLoop = false;
  let hit08C69E = false;
  let hit08C745 = false;
  let hitReset = false;

  const result = executor.runFrom(entryPC, 'adl', {
    maxSteps,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, step) => {
      const blockKey = `${hex(pc)}:${mode}`;
      blocksVisited.push(blockKey);
      uniqueBlocks.add(blockKey);

      if (pc === ADDR_CXMAIN)      hitCxMain = true;
      if (pc === ADDR_CXMAIN_BODY) hitCxMainBody = true;
      if (pc === ADDR_HOME_BODY)   hitHomeBody = true;
      if (pc === ADDR_EVENT_LOOP)  hitEventLoop = true;
      if (pc === ADDR_08C69E)      hit08C69E = true;
      if (pc === ADDR_08C745)      hit08C745 = true;
      if (pc === ADDR_RESET)       hitReset = true;
    },
  });

  console.log(`\n  Execution result:`);
  console.log(`    steps = ${result.steps}`);
  console.log(`    termination = ${result.termination}`);
  console.log(`    lastPc = ${hex(result.lastPc)}`);
  console.log(`    lastMode = ${result.lastMode}`);
  console.log(`    loopsForced = ${result.loopsForced}`);

  console.log(`\n  Final registers:`);
  console.log(`    A = ${hex(cpu.a, 2)}, HL = ${hex(cpu._hl)}, BC = ${hex(cpu._bc)}, DE = ${hex(cpu._de)}`);
  console.log(`    SP = ${hex(cpu.sp)}, PC(last) = ${hex(result.lastPc)}`);

  console.log(`\n  Block statistics:`);
  console.log(`    total blocks executed = ${blocksVisited.length}`);
  console.log(`    unique blocks = ${uniqueBlocks.size}`);

  console.log(`\n  Key addresses reached:`);
  console.log(`    0x058241 (cxMain)       = ${hitCxMain}`);
  console.log(`    0x0585E9 (cxMain body)  = ${hitCxMainBody}`);
  console.log(`    0x0582BC (home body)    = ${hitHomeBody}`);
  console.log(`    0x082BE2 (event loop)   = ${hitEventLoop}`);
  console.log(`    0x08C69E                = ${hit08C69E}`);
  console.log(`    0x08C745 (JP HL)        = ${hit08C745}`);
  console.log(`    0x000000 (reset)        = ${hitReset}`);

  // Show unique blocks sorted
  const sortedBlocks = [...uniqueBlocks].sort();
  console.log(`\n  Unique blocks (first 50 of ${sortedBlocks.length}):`);
  for (const block of sortedBlocks.slice(0, 50)) {
    console.log(`    ${block}`);
  }

  // Execution trace (first 40)
  console.log(`\n  Execution trace (first 40 blocks):`);
  for (let i = 0; i < Math.min(40, blocksVisited.length); i++) {
    console.log(`    [${i}] ${blocksVisited[i]}`);
  }

  // Low-address warning
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

  // Post-execution memory
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
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    uniqueBlocks: sortedBlocks,
    hitCxMain,
    hitCxMainBody,
    hitHomeBody,
    hitEventLoop,
    hit08C69E,
    hit08C745,
    hitReset,
    lowAddrBlocks,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 267 — cxMain bypass probe ===\n');

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

  // Experiment 1: Direct entry to cxMain (0x058241)
  const exp1 = runExperiment('Exp1: Direct cxMain (0x058241)', executor, cpu, mem, cpuSnap, ramSnap, {
    entryPC: ADDR_CXMAIN,
    maxSteps: 500,
  });

  // Experiment 2: Direct entry to cxMain body (0x0585E9)
  const exp2 = runExperiment('Exp2: Direct cxMain body (0x0585E9)', executor, cpu, mem, cpuSnap, ramSnap, {
    entryPC: ADDR_CXMAIN_BODY,
    maxSteps: 500,
  });

  // Experiment 3: Direct entry to home body (0x0582BC)
  const exp3 = runExperiment('Exp3: Direct home body (0x0582BC)', executor, cpu, mem, cpuSnap, ramSnap, {
    entryPC: ADDR_HOME_BODY,
    maxSteps: 500,
  });

  // Experiment 4: Boot from 0x062055 with BIT 5 of (IY+0x25) SET
  const exp4 = runExperiment('Exp4: 0x062055 with BIT5(IY+0x25) set', executor, cpu, mem, cpuSnap, ramSnap, {
    entryPC: ADDR_062055,
    seedD007D0: true,
    seedBit5: true,
    maxSteps: 500,
  });

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  for (const exp of [exp1, exp2, exp3, exp4]) {
    console.log(`\n${exp.label}:`);
    console.log(`  steps=${exp.steps}  term=${exp.termination}  lastPc=${hex(exp.lastPc)}  mode=${exp.lastMode}`);
    console.log(`  cxMain=${exp.hitCxMain}  body=${exp.hitCxMainBody}  home=${exp.hitHomeBody}  eventLoop=${exp.hitEventLoop}`);
    console.log(`  08C69E=${exp.hit08C69E}  08C745=${exp.hit08C745}  reset=${exp.hitReset}`);
    console.log(`  unique blocks=${exp.uniqueBlocks.length}  low-ROM=${exp.lowAddrBlocks.length}`);
  }

  console.log('\nDone.');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
