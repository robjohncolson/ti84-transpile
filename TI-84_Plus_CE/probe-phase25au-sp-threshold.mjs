#!/usr/bin/env node

/**
 * Phase 25AU: find the direct-ParseInp SP threshold and capture the first
 * allocator/ErrMemory trace on the failing side of that threshold.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TEMPMEM_ADDR = 0xd02587;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;

const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MEMINIT_BUDGET = 100000;
const CALL_BUDGET = 50000;
const TRACE_BUDGET = 2000;
const MAX_LOOP_ITER = 8192;
const TRACE_WINDOW = 20;

const SWEEP_START_SP = 0xd1a872;
const SWEEP_END_SP = 0xd1a86f;

const ALLOCATOR_RANGE_START = 0x082200;
const ALLOCATOR_RANGE_END = 0x082800;
const ERRMEMORY_PC = 0x061d3e;
const WATCH_PCS = new Set([0x082273, 0x0822a2, ERRMEMORY_PC]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function wrapMem(mem) {
  return {
    read8(addr) {
      return mem[addr] & 0xff;
    },
    write8(addr, value) {
      mem[addr] = value & 0xff;
    },
  };
}

function decodeOp1(mem) {
  try {
    return readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
  };
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedScenario(mem, cpu) {
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  write24(mem, cpu.sp, FAKE_RET);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainSp: cpu.sp & 0xffffff,
    errFrameBase,
  };
}

function inAllocatorRange(pc) {
  return pc >= ALLOCATOR_RANGE_START && pc <= ALLOCATOR_RANGE_END;
}

function isWatchedPc(pc) {
  return inAllocatorRange(pc) || WATCH_PCS.has(pc);
}

function isPass(result) {
  return (
    result.termination === 'return_hit'
    && result.errNo === 0x8d
    && typeof result.op1Decoded === 'number'
    && Math.abs(result.op1Decoded - 5) < 1e-9
  );
}

function runCall(executor, cpu, mem, options) {
  const {
    entry,
    returnPc,
    budget,
    collectTrace = false,
  } = options;

  let stepCount = 0;
  let finalPc = entry & 0xffffff;
  let rawTermination = 'max_steps';
  let returnHit = false;
  let errCaught = false;
  const trace = [];
  let firstWatchedHit = null;
  let firstAllocatorEntry = null;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    const stepNumber = typeof step === 'number' ? step + 1 : stepCount + 1;
    stepCount = Math.max(stepCount, stepNumber);
    finalPc = norm;

    if (collectTrace) {
      trace.push({ step: stepNumber, pc: norm });
    }

    if (!firstWatchedHit && isWatchedPc(norm)) {
      firstWatchedHit = { step: stepNumber, pc: norm };
    }

    if (!firstAllocatorEntry && inAllocatorRange(norm)) {
      firstAllocatorEntry = {
        step: stepNumber,
        pc: norm,
        snapshot: {
          cpuSp: cpu.sp & 0xffffff,
          ...snapshotPointers(mem),
        },
      };
    }

    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        notePc(pc, step);
      },
    });

    stepCount = Math.max(stepCount, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    rawTermination = result.termination ?? rawTermination;
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      rawTermination = 'return_hit';
      finalPc = returnPc & 0xffffff;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      rawTermination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  const termination = returnHit
    ? 'return_hit'
    : errCaught
      ? 'err_caught'
      : rawTermination === 'max_steps'
        ? 'budget_exhausted'
        : rawTermination;

  return {
    termination,
    rawTermination,
    returnHit,
    errCaught,
    stepCount,
    finalPc,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    op1Decoded: decodeOp1(mem),
    trace,
    firstWatchedHit,
    firstAllocatorEntry,
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const result = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    returnPc: MEMINIT_RET,
    budget: MEMINIT_BUDGET,
  });

  if (!result.returnHit) {
    throw new Error(`MEM_INIT failed: termination=${result.termination} finalPc=${hex(result.finalPc)}`);
  }

  return result;
}

function runParseInpForSp(testSp, options = {}) {
  const { traceBudget = null } = options;
  const { mem, executor, cpu } = createEnv();

  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);

  prepareCallState(cpu, mem);
  cpu.sp = testSp & 0xffffff;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  const frame = seedScenario(mem, cpu);
  const seededPointers = snapshotPointers(mem);

  const call = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    returnPc: FAKE_RET,
    budget: traceBudget ?? CALL_BUDGET,
    collectTrace: traceBudget !== null,
  });

  return {
    sp: testSp & 0xffffff,
    frame,
    seededPointers,
    ...call,
    pass: isPass(call),
  };
}

function buildSweepResults() {
  const results = [];
  for (let sp = SWEEP_START_SP; sp >= SWEEP_END_SP; sp -= 1) {
    results.push(runParseInpForSp(sp));
  }
  return results;
}

function findThreshold(results) {
  let lastPass = null;
  let firstFail = null;
  const transitions = [];

  for (let index = 0; index < results.length; index += 1) {
    const current = results[index];
    if (current.pass) lastPass = current.sp;

    if (index > 0) {
      const previous = results[index - 1];
      if (previous.pass && !current.pass) {
        transitions.push({
          lastPass: previous.sp,
          firstFail: current.sp,
        });
      }
    }
  }

  firstFail = results.find((result) => !result.pass)?.sp ?? null;

  return {
    lastPass,
    firstFail,
    transitions,
  };
}

function buildTable(rows) {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    headers.forEach((header, index) => {
      widths[index] = Math.max(widths[index], String(row[header]).length);
    });
  }

  const renderRow = (row) => headers
    .map((header, index) => String(row[header]).padEnd(widths[index]))
    .join('  ');

  return [
    renderRow(Object.fromEntries(headers.map((header) => [header, header]))),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(renderRow),
  ];
}

function traceWindow(trace, hitIndex) {
  if (hitIndex < 0) return [];
  return trace.slice(Math.max(0, hitIndex - TRACE_WINDOW), hitIndex);
}

function pointerComparisons(snapshot) {
  return [
    { name: 'FPS', value: snapshot.fps, delta: snapshot.cpuSp - snapshot.fps },
    { name: 'OPBase', value: snapshot.opBase, delta: snapshot.cpuSp - snapshot.opBase },
    { name: 'tempMem', value: snapshot.tempMem, delta: snapshot.cpuSp - snapshot.tempMem },
    { name: 'pTemp', value: snapshot.pTemp, delta: snapshot.cpuSp - snapshot.pTemp },
    { name: 'OPS', value: snapshot.ops, delta: snapshot.cpuSp - snapshot.ops },
  ];
}

function describeThresholdCandidate(threshold, comparisons) {
  if (threshold.lastPass === null || threshold.firstFail === null) {
    return 'No PASS->FAIL threshold was observed in the sweep.';
  }

  const lo = Math.min(threshold.lastPass, threshold.firstFail);
  const hi = Math.max(threshold.lastPass, threshold.firstFail);
  const crossed = comparisons.filter((comparison) => comparison.value >= lo && comparison.value <= hi);
  if (crossed.length > 0) {
    return `Tracked pointer(s) inside the threshold window [${hex(lo)}, ${hex(hi)}]: ${crossed.map((comparison) => `${comparison.name}=${hex(comparison.value)}`).join(', ')}.`;
  }

  const nearest = [...comparisons].sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0];
  return `No tracked pointer lies inside the 1-byte threshold window; nearest tracked value at allocator entry is ${nearest.name}=${hex(nearest.value)} (SP delta ${formatSigned(nearest.delta)}).`;
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AU: direct ParseInp SP threshold probe ===');
  log(`Validated scratch tokens @ ${hex(SCRATCH_TOKEN_BASE)} = [${Array.from(INPUT_TOKENS, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);
  log(`endPC=${hex(SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1)} ParseInp=${hex(PARSEINP_ENTRY)} MEM_INIT=${hex(MEMINIT_ENTRY)}`);
  log(`Sweep: ${hex(SWEEP_START_SP)} down to ${hex(SWEEP_END_SP)} | ParseInp budget=${CALL_BUDGET} | trace budget=${TRACE_BUDGET}`);
  log();

  const sweepResults = buildSweepResults();
  const threshold = findThreshold(sweepResults);

  const tableRows = sweepResults.map((result) => ({
    SP: hex(result.sp),
    Status: result.pass ? 'PASS' : 'FAIL',
    Termination: result.termination,
    Steps: String(result.stepCount),
    errNo: hex(result.errNo, 2),
    OP1: formatNumber(result.op1Decoded),
  }));

  log('--- Part A: SP sweep ---');
  for (const line of buildTable(tableRows)) log(line);
  log();

  if (threshold.transitions.length === 0) {
    if (threshold.firstFail === null) {
      log('Threshold: no FAIL result observed in the requested SP window.');
    } else if (threshold.lastPass === null) {
      log('Threshold: no PASS result observed in the requested SP window.');
    } else {
      log('Threshold: PASS/FAIL results were non-monotonic in the requested SP window.');
    }
  } else {
    const transition = threshold.transitions[0];
    log(`Threshold: last PASS at ${hex(transition.lastPass)}, first FAIL at ${hex(transition.firstFail)}.`);
    log(`Behavior flips between ${hex(transition.lastPass)} and ${hex(transition.firstFail)}; closest failing SP is ${hex(transition.firstFail)}.`);
  }
  log();

  const firstFail = sweepResults.find((result) => !result.pass) ?? null;
  if (!firstFail) {
    log('No failing SP was observed; Part B and Part C have nothing to trace.');
    return;
  }

  const tracedFail = runParseInpForSp(firstFail.sp, { traceBudget: TRACE_BUDGET });
  const firstWatchedHit = tracedFail.firstWatchedHit;
  const firstAllocatorEntry = tracedFail.firstAllocatorEntry;

  log(`--- Part B: first failing SP trace (${hex(tracedFail.sp)}) ---`);
  log(`Trace run: termination=${tracedFail.termination} steps=${tracedFail.stepCount} errNo=${hex(tracedFail.errNo, 2)} OP1=${formatNumber(tracedFail.op1Decoded)}`);
  if (firstWatchedHit) {
    log(`First allocator/ErrMemory hit: step ${firstWatchedHit.step}, pc=${hex(firstWatchedHit.pc)}`);
    const hitIndex = tracedFail.trace.findIndex((entry) => entry.step === firstWatchedHit.step && entry.pc === firstWatchedHit.pc);
    const preceding = traceWindow(tracedFail.trace, hitIndex);
    log(`20 PCs leading up to ${hex(firstWatchedHit.pc)}:`);
    for (const entry of preceding) {
      log(`  step ${String(entry.step).padStart(4, '0')}  pc=${hex(entry.pc)}`);
    }
    if (preceding.length === 0) {
      log('  <no prior PCs>');
    }
  } else {
    log(`No allocator/ErrMemory-region PC was hit within the first ${TRACE_BUDGET} traced steps.`);
  }
  log();

  log('--- Part C: allocator-entry pointer snapshot ---');
  if (firstAllocatorEntry) {
    const snapshot = firstAllocatorEntry.snapshot;
    const comparisons = pointerComparisons(snapshot);

    log(`First allocator-range PC: step ${firstAllocatorEntry.step}, pc=${hex(firstAllocatorEntry.pc)}.`);
    log(`SP=${hex(snapshot.cpuSp)} FPS=${hex(snapshot.fps)} OPBase=${hex(snapshot.opBase)} tempMem=${hex(snapshot.tempMem)} pTemp=${hex(snapshot.pTemp)}`);
    log(`Additional context: OPS=${hex(snapshot.ops)} errFrame=${hex(tracedFail.frame.errFrameBase)}`);
    log('SP deltas at allocator entry:');
    for (const comparison of comparisons) {
      log(`  ${comparison.name.padEnd(7)} value=${hex(comparison.value)}  SP-delta=${formatSigned(comparison.delta)}`);
    }
    log(describeThresholdCandidate(threshold, comparisons));
  } else {
    log(`Allocator range ${hex(ALLOCATOR_RANGE_START)}..${hex(ALLOCATOR_RANGE_END)} was not entered within the first ${TRACE_BUDGET} traced steps.`);
  }
  log();

  const summary = {
    sweep: sweepResults.map((result) => ({
      sp: hex(result.sp),
      status: result.pass ? 'PASS' : 'FAIL',
      termination: result.termination,
      steps: result.stepCount,
      errNo: hex(result.errNo, 2),
      op1: formatNumber(result.op1Decoded),
    })),
    threshold: {
      lastPass: threshold.lastPass === null ? null : hex(threshold.lastPass),
      firstFail: threshold.firstFail === null ? null : hex(threshold.firstFail),
      transitions: threshold.transitions.map((transition) => ({
        lastPass: hex(transition.lastPass),
        firstFail: hex(transition.firstFail),
      })),
    },
    failingTrace: {
      sp: hex(tracedFail.sp),
      termination: tracedFail.termination,
      steps: tracedFail.stepCount,
      errNo: hex(tracedFail.errNo, 2),
      op1: formatNumber(tracedFail.op1Decoded),
      firstWatchedHit: firstWatchedHit
        ? { step: firstWatchedHit.step, pc: hex(firstWatchedHit.pc) }
        : null,
      firstAllocatorEntry: firstAllocatorEntry
        ? {
          step: firstAllocatorEntry.step,
          pc: hex(firstAllocatorEntry.pc),
          cpuSp: hex(firstAllocatorEntry.snapshot.cpuSp),
          fps: hex(firstAllocatorEntry.snapshot.fps),
          opBase: hex(firstAllocatorEntry.snapshot.opBase),
          tempMem: hex(firstAllocatorEntry.snapshot.tempMem),
          pTemp: hex(firstAllocatorEntry.snapshot.pTemp),
          ops: hex(firstAllocatorEntry.snapshot.ops),
        }
        : null,
    },
  };

  log('Summary JSON:');
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
