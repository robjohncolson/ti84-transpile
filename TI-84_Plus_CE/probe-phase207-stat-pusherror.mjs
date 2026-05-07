#!/usr/bin/env node
/**
 * Phase 207 Probe: Can PushErrorHandler catch the STAT pipeline error?
 *
 * The STAT (1-Var Stats) pipeline enters an infinite error/redraw loop
 * when run headless. PushErrorHandler (0x07C88B) installs an error frame
 * so that JError jumps to a recovery address instead of the dismiss loop.
 *
 * Experiment 1: Baseline STAT with no PushErrorHandler (5000 steps)
 * Experiment 2: STAT with PushErrorHandler pre-installed (10000 steps)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const RECOVERY_SENTINEL = 0x7FFFE0;
const MAX_LOOP_ITERATIONS = 8192;

// STAT addresses
const STAT_ENTRY = 0x058BA9;
const PUSH_ERROR_HANDLER = 0x07C88B;
const EVENT_LOOP = 0x082BE2;

// OP1
const OP1_ADDR = 0xD005F8;

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

// ── Memory / CPU setup ───────────────────────────────────────────────

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }

  return { returned };
}

function createBaseline() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    mem: new Uint8Array(mem),
    memInitReturned: memInit.returned,
  };
}

// ── List seeding ─────────────────────────────────────────────────────

function seedList(mem) {
  const listBase = 0xD01600;
  // count = 3 (little-endian 16-bit)
  mem[listBase] = 0x03;
  mem[listBase + 1] = 0x00;

  // Element 1: 1.0 in TI BCD (9 bytes: sign/exp, then mantissa)
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

  // VAT entry for L1
  const vatBase = 0xD1A800;
  mem[vatBase] = 0x01;       // type = real list
  mem[vatBase+1] = 0x00;    // ptr low
  mem[vatBase+2] = 0x16;    // ptr mid
  mem[vatBase+3] = 0xD0;    // ptr high (little-endian 24-bit -> 0xD01600)
  mem[vatBase+4] = 0x5D;    // name byte 1 (L)
  mem[vatBase+5] = 0x00;    // name byte 2 (1 = subscript 0)
}

// ── Experiment runner ────────────────────────────────────────────────

function runStatExperiment(baselineMem, label, stepLimit, setupFn) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);

  resetOsState(cpu, mem);
  seedList(mem);

  // Apply experiment-specific setup
  if (setupFn) setupFn(cpu, mem, executor);

  // Push return sentinel on stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Trace execution
  const visitedBlocks = [];
  const visitedSet = new Set();
  let steps = 0;
  let lastPc = STAT_ENTRY;
  let termination = 'max_steps';
  let errorMessage = null;
  let reachedEventLoop = false;
  let reachedRecoverySentinel = false;

  // Track block visit frequency for top-10
  const blockFreq = new Map();

  try {
    const result = executor.runFrom(STAT_ENTRY, 'adl', {
      maxSteps: stepLimit,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const normalized = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = normalized;

        blockFreq.set(normalized, (blockFreq.get(normalized) || 0) + 1);

        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(hex(normalized));
        }

        if (normalized === EVENT_LOOP) reachedEventLoop = true;
        if (normalized === RECOVERY_SENTINEL) {
          reachedRecoverySentinel = true;
          throw new Error('__RECOVERY__');
        }
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
      onMissingBlock(pc, _mode, step) {
        const normalized = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = normalized;

        blockFreq.set(normalized, (blockFreq.get(normalized) || 0) + 1);

        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(hex(normalized));
        }

        if (normalized === EVENT_LOOP) reachedEventLoop = true;
        if (normalized === RECOVERY_SENTINEL) {
          reachedRecoverySentinel = true;
          throw new Error('__RECOVERY__');
        }
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.message === '__RET__') {
      termination = 'return';
    } else if (error?.message === '__RECOVERY__') {
      termination = 'recovery_sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.message ?? String(error);
    }
  }

  // Top-10 most visited blocks
  const top10 = [...blockFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pc, count]) => ({ block: hex(pc), count }));

  return {
    label,
    run: {
      steps,
      termination,
      lastPc: hex(lastPc),
      uniqueBlocks: visitedBlocks.length,
      reachedEventLoop,
      reachedRecoverySentinel,
    },
    top10Blocks: top10,
    firstBlocks: visitedBlocks.slice(0, 30),
    lastBlocks: visitedBlocks.slice(-20),
    op1After: bytesFor(mem, OP1_ADDR, 9),
    registers: {
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      bc: hex(cpu.bc),
      de: hex(cpu.de),
      hl: hex(cpu.hl),
      sp: hex(cpu.sp),
    },
    error: errorMessage,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const baseline = createBaseline();

  // Experiment 1: Baseline STAT, no PushErrorHandler
  const exp1 = runStatExperiment(baseline.mem, 'baseline_no_pusherror', 5000, null);

  // Experiment 2: STAT with PushErrorHandler pre-installed
  // PushErrorHandler (0x07C88B) takes HL = recovery address
  // We call it first, then enter STAT
  const exp2 = runStatExperiment(baseline.mem, 'with_pusherror_recovery_sentinel', 10000, (cpu, mem, executor) => {
    // Set HL = recovery sentinel address before calling PushErrorHandler
    cpu.hl = RECOVERY_SENTINEL;
    cpu.sp -= 3;
    // Push a return address for PushErrorHandler to return to
    const pehRetAddr = 0x7FFFD0;
    write24(mem, cpu.sp, pehRetAddr);

    let pehReturned = false;
    try {
      executor.runFrom(PUSH_ERROR_HANDLER, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 64,
        onBlock(pc) {
          if ((pc & 0xFFFFFF) === pehRetAddr) throw new Error('__PEH_RET__');
        },
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === pehRetAddr) throw new Error('__PEH_RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__PEH_RET__') pehReturned = true;
      else throw e;
    }

    // Reset for STAT entry
    cpu.halted = false;
  });

  // Experiment 3: PushErrorHandler with EVENT_LOOP as recovery (real block)
  const exp3 = runStatExperiment(baseline.mem, 'with_pusherror_eventloop_recovery', 10000, (cpu, mem, executor) => {
    cpu.hl = EVENT_LOOP;
    cpu.sp -= 3;
    const pehRetAddr = 0x7FFFD0;
    write24(mem, cpu.sp, pehRetAddr);

    try {
      executor.runFrom(PUSH_ERROR_HANDLER, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 64,
        onBlock(pc) {
          if ((pc & 0xFFFFFF) === pehRetAddr) throw new Error('__PEH_RET__');
        },
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === pehRetAddr) throw new Error('__PEH_RET__');
        },
      });
    } catch (e) {
      if (e?.message !== '__PEH_RET__') throw e;
    }

    cpu.halted = false;
  });

  return {
    probe: 'probe-phase207-stat-pusherror.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
    },
    experiments: {
      baseline: exp1,
      withPushErrorRecoverySentinel: exp2,
      withPushErrorEventLoop: exp3,
    },
    analysis: {
      baselineTermination: exp1.run.termination,
      recoverySentinelHit: exp2.run.reachedRecoverySentinel,
      eventLoopReachedInExp3: exp3.run.reachedEventLoop,
      pathDiverged: exp1.run.uniqueBlocks !== exp2.run.uniqueBlocks,
    },
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase207-stat-pusherror.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
