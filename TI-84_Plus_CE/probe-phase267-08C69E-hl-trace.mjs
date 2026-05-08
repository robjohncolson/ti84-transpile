#!/usr/bin/env node
/**
 * Phase 267 — Trace HL zeroing between 0x08C69E and 0x08C745
 *
 * Session 266 found that JP(HL) at 0x08C745 jumps to 0x000000 because HL
 * was zeroed somewhere in the 0x08C69E→0x08C745 call chain. D007D0 is
 * seeded with 0x06C546 before the call, but by the time HL is used it's 0.
 *
 * This probe instruments every block in the 0x08C69E-0x08C745 range to
 * track HL value, D007D0 memory contents, and flag when HL transitions
 * to zero.
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
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const RETURN_SENTINEL = 0x7FFFFE;

const TARGET_FUNC = 0x062055;

const D007D0 = 0xD007D0;
const D0230F = 0xD0230F;
const D007FA = 0xD007FA;

const TRACE_LO = 0x08C69E;
const TRACE_HI = 0x08C745;

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

function snapshotCpu(cpu) {
  const fields = [
    'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
  ];
  return Object.fromEntries(fields.map((f) => [f, cpu[f]]));
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 267 — Trace HL zeroing between 0x08C69E and 0x08C745 ===\n');

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

  // Snapshot post-boot state
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // ── Restore and set up for experiment ──────────────────────────────
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) {
    cpu[f] = v;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu.madl = 1; // ADL = true

  // B=3 to pass gate
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  // Stack with return sentinel
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Seed memory
  mem[D0230F & MEM_MASK] = 0x3F;
  write24(mem, D007D0, 0x06C546);
  write24(mem, D007FA, cpu.sp);

  console.log(`\nPre-call state:`);
  console.log(`  cpu.madl = ${cpu.madl}`);
  console.log(`  cpu._hl  = ${hex(cpu._hl)}`);
  console.log(`  D007D0   = ${hex(read24(mem, D007D0))}`);
  console.log(`  D0230F   = ${hex(mem[D0230F & MEM_MASK], 2)}`);
  console.log(`  SP       = ${hex(cpu.sp)}`);

  // ── Instrumented run ───────────────────────────────────────────────

  const traceLog = [];
  let prevHL = cpu._hl;
  let stepCounter = 0;

  // Also track ALL blocks to see the full path
  const allBlocks = [];

  const result = executor.runFrom(TARGET_FUNC, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, step) => {
      stepCounter++;
      const currentHL = cpu._hl;
      const d007d0_val = read24(mem, D007D0);

      allBlocks.push({ step: stepCounter, pc, mode, hl: currentHL, d007d0: d007d0_val });

      const inRange = (pc >= TRACE_LO && pc <= TRACE_HI);
      if (inRange) {
        const hlChanged = currentHL !== prevHL;
        const hlZeroed = hlChanged && currentHL === 0;
        traceLog.push({
          step: stepCounter,
          pc,
          mode,
          hl: currentHL,
          prevHL,
          d007d0: d007d0_val,
          hlChanged,
          hlZeroed,
        });
      }
      prevHL = currentHL;
    },
  });

  // ── Output ─────────────────────────────────────────────────────────

  console.log(`\nExecution result:`);
  console.log(`  steps = ${result.steps}`);
  console.log(`  termination = ${result.termination}`);
  console.log(`  lastPc = ${hex(result.lastPc)}`);
  console.log(`  lastMode = ${result.lastMode}`);
  console.log(`  final cpu._hl = ${hex(cpu._hl)}`);
  console.log(`  final D007D0 = ${hex(read24(mem, D007D0))}`);

  // Full execution trace (all blocks)
  console.log(`\n--- Full execution trace (${allBlocks.length} blocks) ---`);
  console.log('Step  | PC       | Mode | HL       | D007D0');
  console.log('------+----------+------+----------+----------');
  for (const b of allBlocks) {
    const marker = (b.pc >= TRACE_LO && b.pc <= TRACE_HI) ? ' *' : '';
    console.log(
      `${String(b.step).padStart(5)} | ${hex(b.pc)} | ${b.mode.padEnd(4)} | ${hex(b.hl)} | ${hex(b.d007d0)}${marker}`
    );
  }

  // Detailed trace for 0x08C69E-0x08C745 range
  if (traceLog.length === 0) {
    console.log(`\n--- No blocks executed in range ${hex(TRACE_LO)}-${hex(TRACE_HI)} ---`);
    console.log('Looking for blocks near the range...');
    for (const b of allBlocks) {
      if (b.pc >= 0x08C000 && b.pc <= 0x08D000) {
        console.log(`  step=${b.step} pc=${hex(b.pc)} mode=${b.mode} hl=${hex(b.hl)}`);
      }
    }
  } else {
    console.log(`\n--- Trace in range ${hex(TRACE_LO)}-${hex(TRACE_HI)} (${traceLog.length} entries) ---`);
    console.log('Step  | PC       | Mode | HL       | prevHL   | D007D0   | Changed | Zeroed');
    console.log('------+----------+------+----------+----------+----------+---------+--------');
    for (const t of traceLog) {
      console.log(
        `${String(t.step).padStart(5)} | ${hex(t.pc)} | ${t.mode.padEnd(4)} | ${hex(t.hl)} | ${hex(t.prevHL)} | ${hex(t.d007d0)} | ${t.hlChanged ? 'YES' : '   '} | ${t.hlZeroed ? '** ZERO **' : ''}`
      );
    }
  }

  // Highlight the HL zeroing moment across ALL blocks
  console.log('\n--- HL transition points (all blocks) ---');
  let prev = allBlocks.length > 0 ? allBlocks[0].hl : 0;
  for (let i = 1; i < allBlocks.length; i++) {
    const b = allBlocks[i];
    if (b.hl !== prev) {
      console.log(
        `  step=${b.step} pc=${hex(b.pc)}: HL changed from ${hex(prev)} to ${hex(b.hl)}` +
        (b.hl === 0 ? ' ** ZEROED **' : '')
      );
    }
    prev = b.hl;
  }

  // Check what's at 0x08C745 specifically
  console.log('\n--- Block at/near 0x08C745 ---');
  for (const b of allBlocks) {
    if (b.pc >= 0x08C740 && b.pc <= 0x08C750) {
      console.log(`  step=${b.step} pc=${hex(b.pc)} mode=${b.mode} hl=${hex(b.hl)} d007d0=${hex(b.d007d0)}`);
    }
  }

  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`\nMissing blocks (first 20):`);
    for (const mb of result.missingBlocks.slice(0, 20)) {
      console.log(`  ${mb}`);
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
