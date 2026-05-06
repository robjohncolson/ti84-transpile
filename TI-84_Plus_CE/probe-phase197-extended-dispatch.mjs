#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const ROM_PATH = './TI-84_Plus_CE/ROM.rom';
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const HOME_COPY9_ENTRY = 0x0584A3;
const COPY9_ENTRY = 0x07F9FB;
const KEY_CLASSIFIER_ENTRY = 0x07F7BD;
const BUF_INSERT_ENTRY = 0x05E2A0;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const TOKEN_LENGTH = 9;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_RESET_TOP = 0xD1A87E;
const EXPERIMENT_SP = 0xD1A860;

const MEMINIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 1000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const WRITE_EVENT_LIMIT = 32;
const TRACE_STACK_DEPTH = 8;

const EXPERIMENTS = [
  {
    id: 'A',
    label: 'digit_4',
    tokenSeed: Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  },
  {
    id: 'B',
    label: 'digit_0',
    tokenSeed: Uint8Array.from([0x00, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  },
  {
    id: 'C',
    label: 'plus',
    tokenSeed: Uint8Array.from([0x00, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  },
];

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Run node scripts/transpile-ti84-rom.mjs first.',
  );
}

const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesToHexArray(mem, start, length) {
  return Array.from(mem.slice(start, start + length), (value) => hexByte(value));
}

function formatHexBytes(bytes) {
  return bytes.join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
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

function cap(list, value, limit = WRITE_EVENT_LIMIT) {
  if (list.length < limit) list.push(value);
}

// Local compatibility helpers: this checkout exposes createExecutor rather than
// createMemory/loadROM/createCPU, so the probe layers the requested helpers on
// top of the current runtime API without modifying cpu-runtime.js.
function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem, romPath) {
  const resolved = path.resolve(process.cwd(), romPath);
  const romBytes = fs.readFileSync(resolved);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE197_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations, handlers = {}) {
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, meta, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onBlock) handlers.onBlock(pc, blockMode, meta, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onMissingBlock) handlers.onMissingBlock(pc, blockMode, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
    });

    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: (result.lastPc ?? lastPc) & 0xFFFFFF,
      lastMode: result.lastMode ?? lastMode,
      termination: result.termination ?? null,
      errorMessage: result.error ? (result.error.stack || String(result.error)) : null,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        hit: error.hit,
        steps,
        lastPc: error.pc,
        lastMode,
        termination: 'sentinel',
        errorMessage: null,
      };
    }

    return {
      hit: null,
      steps,
      lastPc,
      lastMode,
      termination: 'exception',
      errorMessage: error?.stack || String(error),
    };
  }
}

function resetOsState(cpu, mem, stackTop = STACK_RESET_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x60), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: {
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc),
    },
    postInit: {
      steps: postInit.steps,
      termination: postInit.termination,
      lastPc: hex(postInit.lastPc),
    },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_RESET_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEMINIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function createCPU(mem, peripherals) {
  const executor = cpuRuntime.createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.memInit = () => runMemInit(executor, cpu, mem);
  return { cpu, executor };
}

function createBaseline() {
  const mem = createMemory();
  const romBytesLoaded = loadROM(mem, ROM_PATH);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);

  cpu.mbase = MBASE;
  const boot = coldBoot(executor, cpu, mem);
  const memInit = cpu.memInit(mem);

  return {
    romBytesLoaded,
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: hex(memInit.lastPc),
      errorMessage: memInit.errorMessage,
    },
    baselineMem: new Uint8Array(mem),
  };
}

function createExperimentEnv(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  return { mem, cpu, executor };
}

function pushSentinelChain(mem, cpu, depth = TRACE_STACK_DEPTH) {
  for (let i = 0; i < depth; i += 1) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }
}

function createTraceState() {
  return {
    effectiveStartBlock: null,
    blockTrace: [],
    uniqueBlocks: [],
    uniqueBlockSet: new Set(),
    missingBlocks: [],
    missingBlockSet: new Set(),
    hits: {
      homeCopy9: [],
      copy9: [],
      keyClassifier: [],
      bufInsert: [],
    },
    op1Writes: [],
  };
}

function noteHit(state, label, cpu, pc, step) {
  cap(state.hits[label], {
    step: (step ?? 0) + 1,
    pc: hex(pc),
    a: hex(cpu.a, 2),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    sp: hex(cpu.sp),
  });
}

function noteBlock(state, cpu, pc, step, missing) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);

  state.blockTrace.push(renderedPc);

  if (state.effectiveStartBlock === null) {
    state.effectiveStartBlock = renderedPc;
  }

  if (missing) {
    if (!state.missingBlockSet.has(renderedPc)) {
      state.missingBlockSet.add(renderedPc);
      state.missingBlocks.push(renderedPc);
    }
    return;
  }

  if (!state.uniqueBlockSet.has(renderedPc)) {
    state.uniqueBlockSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }

  if (normalizedPc === HOME_COPY9_ENTRY) noteHit(state, 'homeCopy9', cpu, normalizedPc, step);
  if (normalizedPc === COPY9_ENTRY) noteHit(state, 'copy9', cpu, normalizedPc, step);
  if (normalizedPc === KEY_CLASSIFIER_ENTRY) noteHit(state, 'keyClassifier', cpu, normalizedPc, step);
  if (normalizedPc === BUF_INSERT_ENTRY) noteHit(state, 'bufInsert', cpu, normalizedPc, step);
}

function installOp1WriteWatch(cpu, mem, state) {
  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordWrite(addr, width, beforeBytes) {
    const overlap = overlapSlice(addr, width, OP1_ADDR, TOKEN_LENGTH);
    if (!overlap) return;

    cap(state.op1Writes, {
      step: state.op1Writes.length + 1,
      block: hex(cpu._currentBlockPc ?? cpu.pc ?? 0),
      writeAddr: hex(addr),
      width,
      overlapStart: hex(overlap.start),
      overlapLength: overlap.length,
      before: Array.from(
        beforeBytes.slice(overlap.offset, overlap.offset + overlap.length),
        (value) => hexByte(value),
      ),
      after: bytesToHexArray(mem, overlap.start, overlap.length),
      op1After: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    });
  }

  function wrap(width, fn) {
    return (addr, value) => {
      const normalizedAddr = Number(addr) & 0xFFFFFF;
      const beforeBytes = Array.from(mem.slice(normalizedAddr, normalizedAddr + width));
      fn(normalizedAddr, value);
      recordWrite(normalizedAddr, width, beforeBytes);
    };
  }

  cpu.write8 = wrap(1, original.write8);
  cpu.write16 = wrap(2, original.write16);
  cpu.write24 = wrap(3, original.write24);

  return () => {
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function stopReasonForTrace(trace) {
  if (trace.hit === 'bufInsert') return 'BufInsert sentinel';
  if (trace.hit === 'keyClassifierReentry') return 'KeyClassifier re-entry sentinel';
  if (trace.hit === 'homeCopy9Reentry') return 'HOME_COPY9 re-entry sentinel';
  if (trace.hit === 'ret') return 'TRACE_RET sentinel';
  if (trace.termination === 'max_steps') return 'step limit';
  if (trace.termination === 'missing_block') return 'missing block';
  if (trace.termination === 'exception') return 'exception';
  if (trace.termination === 'no_return') return 'no return';
  if (trace.termination === 'halt') return 'halt';
  if (trace.termination === 'sleep') return 'sleep';
  return trace.termination ?? 'unknown';
}

function runExperiment(experiment, baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  resetOsState(cpu, mem, EXPERIMENT_SP);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  mem.set(experiment.tokenSeed, TOKEN_STAGING_ADDR);

  cpu.hl = TOKEN_STAGING_ADDR;
  cpu.pc = HOME_COPY9_ENTRY;
  cpu._currentBlockPc = HOME_COPY9_ENTRY;
  cpu.sp = EXPERIMENT_SP;
  pushSentinelChain(mem, cpu, TRACE_STACK_DEPTH);

  const op1Before = bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH);
  const stagingBefore = bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH);
  const releaseWatch = installOp1WriteWatch(cpu, mem, state);

  let trace;
  try {
    trace = runUntilHit(
      executor,
      HOME_COPY9_ENTRY,
      'adl',
      {
        ret: TRACE_RET,
        bufInsert: BUF_INSERT_ENTRY,
      },
      TRACE_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
      {
        onBlock(pc, _mode, _meta, step) {
          noteBlock(state, cpu, pc, step, false);
          if (state.hits.keyClassifier.length > 1) {
            throw makeSentinelError('keyClassifierReentry', pc);
          }
          if (state.hits.homeCopy9.length > 1) {
            throw makeSentinelError('homeCopy9Reentry', pc);
          }
        },
        onMissingBlock(pc, _mode, step) {
          noteBlock(state, cpu, pc, step, true);
        },
      },
    );
  } finally {
    releaseWatch();
  }

  const op1After = bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH);

  return {
    id: experiment.id,
    label: experiment.label,
    steps: trace.steps,
    stopReason: stopReasonForTrace(trace),
    stepLimited: trace.hit === null && trace.termination === 'max_steps',
    uniqueBlocks: state.uniqueBlocks.length,
    blockTrace: state.blockTrace,
    last10Blocks: state.blockTrace.slice(-10),
    op1Before,
    op1After,
    tokenStagingBefore: stagingBefore,
    bufInsertReached: trace.hit === 'bufInsert' || state.hits.bufInsert.length > 0,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    missingBlocks: state.missingBlocks,
    errorMessage: trace.errorMessage,
  };
}

function renderHeader(baseline) {
  return [
    'Probe: phase197-extended-dispatch',
    `Generated at: ${new Date().toISOString()}`,
    `ROM path: ${ROM_PATH}`,
    `Trace step limit: ${TRACE_MAX_STEPS}`,
    `BufInsert sentinel: ${hex(BUF_INSERT_ENTRY)}`,
    `KeyClassifier re-entry sentinel: ${hex(KEY_CLASSIFIER_ENTRY)}`,
    `HOME_COPY9 re-entry sentinel: ${hex(HOME_COPY9_ENTRY)}`,
    `Baseline boot steps: ${baseline.boot.boot.steps}/${baseline.boot.kernelInit.steps}/${baseline.boot.postInit.steps}`,
    `Baseline memInit: ${baseline.memInit.termination} after ${baseline.memInit.steps} steps at ${baseline.memInit.lastPc}`,
    '',
  ].join('\n');
}

function renderExperimentTrace(result) {
  const lines = [
    `=== Experiment ${result.id}: ${result.label} ===`,
    `Token seed: ${formatHexBytes(result.tokenStagingBefore)}`,
    'Block trace:',
  ];

  if (result.blockTrace.length === 0) {
    lines.push('(none)');
  } else {
    lines.push(...result.blockTrace);
  }

  lines.push(`Total steps: ${result.steps}`);
  lines.push(`BufInsert hit: ${result.bufInsertReached ? 'YES' : 'NO'}`);
  lines.push(`Final OP1: ${formatHexBytes(result.op1After)}`);
  lines.push('');
  return lines.join('\n');
}

function renderExperimentSummary(result) {
  const lines = [
    `Experiment ${result.id} (${result.label})`,
    `Total steps taken before stop: ${result.steps}`,
    `Stop reason: ${result.stopReason}`,
    `Unique blocks visited: ${result.uniqueBlocks}`,
    `Final OP1 bytes: ${formatHexBytes(result.op1After)}`,
    `BufInsert reached: ${result.bufInsertReached ? 'YES' : 'NO'}`,
  ];

  if (result.stepLimited) {
    lines.push('Last 10 block PCs visited:');
    if (result.last10Blocks.length === 0) {
      lines.push('(none)');
    } else {
      lines.push(...result.last10Blocks);
    }
  }

  if (result.stopReason === 'missing block' && result.missingBlocks.length > 0) {
    lines.push(`Missing blocks observed: ${result.missingBlocks.join(', ')}`);
  }

  if (result.errorMessage) {
    lines.push(`Error: ${result.errorMessage.split('\n', 1)[0]}`);
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const baseline = createBaseline();
  const experiments = EXPERIMENTS.map((experiment) => runExperiment(experiment, baseline.baselineMem));

  const sections = [renderHeader(baseline)];
  for (const experiment of experiments) {
    sections.push(renderExperimentTrace(experiment));
  }
  sections.push('=== Summary ===');
  for (const experiment of experiments) {
    sections.push(renderExperimentSummary(experiment));
  }

  console.log(sections.join('\n'));
}

main();
