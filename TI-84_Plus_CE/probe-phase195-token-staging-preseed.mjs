#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A880;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;
const SENTINEL_TAG = '__PHASE195_SENTINEL__';

const TOKEN_STAGING_ADDR = 0xD0230E;
const TOKEN_LENGTH = 9;

const OP1_ADDR = 0xD005F8;
const OP1_TOKEN_LENGTH = 9;
const OP1_WATCH_START = 0xD005F8;
const OP1_WATCH_END = 0xD00609;
const OP1_WATCH_LENGTH = OP1_WATCH_END - OP1_WATCH_START + 1;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const BUF_INSERT_ENTRY = 0x05E2A0;
const SEEDED_KEY_CODE = 0x92;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STEP_LIMIT = 2000;
const SEGMENT_STEP_LIMIT = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const SEED_REAL_4 = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SEED_TYPE6_4 = Uint8Array.from([0x06, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const EXPERIMENTS = [
  {
    id: 'A',
    entry: 0x05E620,
    description: 'ConvKeyToTok tail entry with TOKEN_STAGING pre-seeded as real token 4.',
    tokenSeed: SEED_REAL_4,
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      pushStackValues(mem, cpu, [
        TOKEN_STAGING_ADDR,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
      ]);
    },
  },
  {
    id: 'B',
    entry: 0x05E620,
    description: 'ConvKeyToTok tail entry with TOKEN_STAGING pre-seeded as type 0x06 / token 4.',
    tokenSeed: SEED_TYPE6_4,
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      pushStackValues(mem, cpu, [
        TOKEN_STAGING_ADDR,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
        TRACE_RET,
      ]);
    },
  },
  {
    id: 'C',
    entry: 0x05849F,
    description: 'Home-handler Copy9/classify path with TOKEN_STAGING pre-seeded to the Copy9 4-token payload.',
    tokenSeed: SEED_REAL_4,
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      pushSentinelChain(mem, cpu, 6);
    },
  },
  {
    id: 'D',
    entry: 0x0584A3,
    description: 'Direct CALL 0x07F9FB entry with HL already set to TOKEN_STAGING.',
    tokenSeed: SEED_REAL_4,
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      cpu.hl = TOKEN_STAGING_ADDR;
      pushSentinelChain(mem, cpu, 6);
    },
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let i = 0; i < length; i += 1) {
    out.push(hexByte(buffer[(start + i) & 0xFFFFFF] ?? 0));
  }
  return out.join(' ');
}

function write24(buffer, addr, value) {
  const a = addr & 0xFFFFFF;
  buffer[a] = value & 0xFF;
  buffer[a + 1] = (value >>> 8) & 0xFF;
  buffer[a + 2] = (value >>> 16) & 0xFF;
}

function overlapSlice(addr, width, start, length) {
  const overlapStart = Math.max(addr, start);
  const overlapEnd = Math.min(addr + width, start + length);
  if (overlapStart >= overlapEnd) return null;
  return {
    start: overlapStart,
    length: overlapEnd - overlapStart,
    offset: overlapStart - addr,
  };
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function makeSentinelError(hit, pc) {
  const error = new Error(SENTINEL_TAG);
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const budget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: budget,
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

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) throw makeSentinelError(name, normalizedPc);
    }
  };

  while (totalSteps < totalMaxSteps && hit === null) {
    const budget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: budget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        hit = error.hit;
        termination = 'sentinel';
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
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

function resetCpuForExperiment(cpu, mem) {
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
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, STACK_TOP - 0x40, STACK_TOP);
}

function runMemInit(executor, cpu, mem) {
  resetCpuForExperiment(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  return runUntilHitSegmented(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function seedKeyContext(mem, cpu) {
  cpu.a = SEEDED_KEY_CODE;
  mem[KBD_RAW_SCAN_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_KEY_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_GETKY_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_GETCSC_SCAN_ADDR] = SEEDED_KEY_CODE;
}

function pushStackValues(mem, cpu, values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, values[i] & 0xFFFFFF);
  }
}

function pushSentinelChain(mem, cpu, depth = 4) {
  const values = Array.from({ length: depth }, () => TRACE_RET);
  pushStackValues(mem, cpu, values);
}

function installWriteWatchers(cpu, mem, state) {
  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordWrite(target, addr, width, beforeBytes) {
    const overlap = overlapSlice(addr, width, target.start, target.length);
    if (!overlap) return;
    target.events.push({
      step: state.currentStep,
      block: hex(cpu._currentBlockPc ?? 0),
      mode: state.currentMode,
      writeAddr: hex(addr),
      width,
      overlapStart: hex(overlap.start),
      overlapLength: overlap.length,
      before: Array.from(
        beforeBytes.slice(overlap.offset, overlap.offset + overlap.length),
        (value) => hexByte(value),
      ).join(' '),
      after: hexBytes(mem, overlap.start, overlap.length),
      fullRangeAfter: hexBytes(mem, target.start, target.length),
      cpu: {
        a: hex(cpu.a, 2),
        e: hex(cpu.e, 2),
        hl: hex(cpu.hl),
        de: hex(cpu.de),
        sp: hex(cpu.sp),
      },
    });
  }

  function wrapWrite(width, fn) {
    return (addr, value) => {
      const normalizedAddr = Number(addr) & 0xFFFFFF;
      const beforeBytes = Array.from(mem.slice(normalizedAddr, normalizedAddr + width));
      fn(normalizedAddr, value);
      recordWrite(state.op1Writes, normalizedAddr, width, beforeBytes);
      recordWrite(state.tokenStagingWrites, normalizedAddr, width, beforeBytes);
    };
  }

  cpu.write8 = wrapWrite(1, original.write8);
  cpu.write16 = wrapWrite(2, original.write16);
  cpu.write24 = wrapWrite(3, original.write24);

  return () => {
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function createTraceState() {
  return {
    currentStep: 0,
    currentMode: 'adl',
    effectiveStartBlock: null,
    blockTrace: [],
    uniqueBlocks: [],
    uniqueBlockSet: new Set(),
    missingBlocks: [],
    missingBlockSet: new Set(),
    bufInsertHits: [],
    op1Writes: { start: OP1_WATCH_START, length: OP1_WATCH_LENGTH, events: [] },
    tokenStagingWrites: { start: TOKEN_STAGING_ADDR, length: TOKEN_LENGTH, events: [] },
  };
}

function noteBlock(state, cpu, pc, mode, step, missing) {
  const normalizedPc = pc & 0xFFFFFF;
  state.currentStep = step;
  state.currentMode = mode ?? state.currentMode;
  if (state.effectiveStartBlock === null) state.effectiveStartBlock = hex(normalizedPc);
  state.blockTrace.push({
    step,
    pc: hex(normalizedPc),
    mode: mode ?? state.currentMode,
    missing,
  });

  const renderedPc = hex(normalizedPc);
  if (missing) {
    if (!state.missingBlockSet.has(renderedPc)) {
      state.missingBlockSet.add(renderedPc);
      state.missingBlocks.push(renderedPc);
    }
  } else if (!state.uniqueBlockSet.has(renderedPc)) {
    state.uniqueBlockSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }

  if (normalizedPc === BUF_INSERT_ENTRY) {
    state.bufInsertHits.push({
      step,
      pc: renderedPc,
      a: hex(cpu.a, 2),
      e: hex(cpu.e, 2),
      hl: hex(cpu.hl),
      de: hex(cpu.de),
      sp: hex(cpu.sp),
    });
  }

  if (normalizedPc === TRACE_RET) throw makeSentinelError('trace_ret', normalizedPc);
}

function runExperimentTrace(executor, cpu, mem, config, state) {
  let currentPc = config.entry & 0xFFFFFF;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let hit = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastMode = currentMode;

  while (totalSteps < STEP_LIMIT && hit === null) {
    const budget = Math.min(SEGMENT_STEP_LIMIT, STEP_LIMIT - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: budget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode, _meta, step) {
          noteBlock(state, cpu, pc, mode, totalSteps + step, false);
        },
        onMissingBlock(pc, mode, step) {
          noteBlock(state, cpu, pc, mode, totalSteps + step, true);
        },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        hit = error.hit;
        termination = 'sentinel';
        lastPc = error.pc;
        break;
      }
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
      break;
    }
  }

  if (totalSteps >= STEP_LIMIT && (termination === null || termination === 'max_steps') && hit === null) {
    termination = 'step_limit';
  }

  return { steps: totalSteps, termination, hit, lastPc, lastMode, errorMessage };
}

function makeSetupFailure(config, setupError) {
  return {
    id: config.id,
    description: config.description,
    entry: hex(config.entry),
    tokenSeed: Array.from(config.tokenSeed, (value) => hexByte(value)).join(' '),
    setupStatus: 'failed',
    error: setupError?.stack ?? String(setupError),
    bufInsertReached: false,
    blockTrace: [],
    uniqueBlocks: [],
    missingBlocks: [],
    op1Writes: [],
    tokenStagingWrites: [],
  };
}

function runExperiment(config) {
  let env;
  let boot;
  let memInit;

  try {
    env = createEnv();
    boot = bootRuntime(env.executor, env.cpu, env.mem);
    memInit = runMemInit(env.executor, env.cpu, env.mem);
  } catch (setupError) {
    return makeSetupFailure(config, setupError);
  }

  const { mem, executor, cpu } = env;
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.fill(0x00, OP1_WATCH_START, OP1_WATCH_START + OP1_WATCH_LENGTH);
  mem.set(config.tokenSeed, TOKEN_STAGING_ADDR);

  resetCpuForExperiment(cpu, mem);
  config.setup(cpu, mem);

  const state = createTraceState();
  const before = {
    tokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    op1Token: hexBytes(mem, OP1_ADDR, OP1_TOKEN_LENGTH),
    op1Window: hexBytes(mem, OP1_WATCH_START, OP1_WATCH_LENGTH),
  };
  const initialCpu = snapshotCpu(cpu);

  const releaseWatchers = installWriteWatchers(cpu, mem, state);
  let trace;
  try {
    trace = runExperimentTrace(executor, cpu, mem, config, state);
  } finally {
    releaseWatchers();
  }

  const after = {
    tokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    op1Token: hexBytes(mem, OP1_ADDR, OP1_TOKEN_LENGTH),
    op1Window: hexBytes(mem, OP1_WATCH_START, OP1_WATCH_LENGTH),
  };

  return {
    id: config.id,
    description: config.description,
    entry: hex(config.entry),
    entryHasCompiledBlock: Boolean(
      executor.compiledBlocks[`${config.entry.toString(16).padStart(6, '0')}:adl`],
    ),
    tokenSeed: Array.from(config.tokenSeed, (value) => hexByte(value)).join(' '),
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: hex(memInit.lastPc),
      errorMessage: memInit.errorMessage,
    },
    initialCpu,
    before,
    after,
    op1Changed: before.op1Token !== after.op1Token || before.op1Window !== after.op1Window,
    tokenStagingChanged: before.tokenStaging !== after.tokenStaging,
    bufInsertReached: state.bufInsertHits.length > 0,
    bufInsertHits: state.bufInsertHits,
    effectiveStartBlock: state.effectiveStartBlock,
    steps: trace.steps,
    termination: trace.termination,
    hit: trace.hit,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    finalSp: hex(cpu.sp),
    finalCpu: snapshotCpu(cpu),
    errorMessage: trace.errorMessage,
    blockTrace: state.blockTrace,
    uniqueBlocks: state.uniqueBlocks,
    missingBlocks: state.missingBlocks,
    op1Writes: state.op1Writes.events,
    tokenStagingWrites: state.tokenStagingWrites.events,
  };
}

function main() {
  const results = EXPERIMENTS.map((config) => runExperiment(config));
  console.log(JSON.stringify({
    probe: 'phase195-token-staging-preseed',
    stepLimit: STEP_LIMIT,
    op1WatchRange: `${hex(OP1_WATCH_START)}-${hex(OP1_WATCH_END)}`,
    tokenStagingAddr: hex(TOKEN_STAGING_ADDR),
    experiments: results,
  }, null, 2));
}

main();
