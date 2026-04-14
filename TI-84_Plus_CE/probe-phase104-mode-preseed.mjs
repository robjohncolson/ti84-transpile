#!/usr/bin/env node

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

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MAX_STEPS = 500000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const STACK_RESET_TOP = 0xD1A87E;

const SETUP_ENTRY = 0x0B2AEA;
const SETUP_MAX_STEPS = 50000;
const SETUP_MAX_LOOP_ITERATIONS = 500;

const MODE_PIPELINE_ENTRY = 0x0B2D8A;
const MODE_PIPELINE_MAX_STEPS = 500000;
const MODE_PIPELINE_MAX_LOOP_ITERATIONS = 10000;

const EVENT_LOOP_ENTRY = 0x0019BE;
const EVENT_LOOP_MAX_STEPS = 500000;
const EVENT_LOOP_MAX_LOOP_ITERATIONS = 20000;

const MODE_STATE_START = 0xD00080;
const MODE_STATE_END = 0xD000FF;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;

const KEY_MODE_ADDRS = [0xD00080, 0xD00085, 0xD0008A, 0xD0008E, 0xD00092];
const MAX_WRITE_SAMPLES = 32;

const SEED_EXPERIMENTS = [
  {
    id: 'A',
    label: 'zero-fill 0xD00080..0xD000FF',
    apply(mem) {
      mem.fill(0x00, MODE_STATE_START, MODE_STATE_END + 1);
    },
  },
  {
    id: 'B',
    label: 'zero-fill + 0xD0008A=0x01 (Degree)',
    apply(mem) {
      mem.fill(0x00, MODE_STATE_START, MODE_STATE_END + 1);
      mem[0xD0008A] = 0x01;
    },
  },
];

const VARIANTS = [
  {
    id: 'direct',
    label: '0x0b2d8a only',
    stages: [
      {
        label: 'mode_pipeline',
        entry: MODE_PIPELINE_ENTRY,
        mode: 'adl',
        maxSteps: MODE_PIPELINE_MAX_STEPS,
        maxLoopIterations: MODE_PIPELINE_MAX_LOOP_ITERATIONS,
        prepare(runtime) {
          runtime.cpu.halted = false;
        },
      },
    ],
  },
  {
    id: 'setup_then_pipeline',
    label: '0x0b2aea -> 0x0b2d8a',
    stages: [
      {
        label: 'setup',
        entry: SETUP_ENTRY,
        mode: 'adl',
        maxSteps: SETUP_MAX_STEPS,
        maxLoopIterations: SETUP_MAX_LOOP_ITERATIONS,
        prepare(runtime) {
          runtime.cpu.halted = false;
        },
      },
      {
        label: 'mode_pipeline',
        entry: MODE_PIPELINE_ENTRY,
        mode: 'adl',
        maxSteps: MODE_PIPELINE_MAX_STEPS,
        maxLoopIterations: MODE_PIPELINE_MAX_LOOP_ITERATIONS,
        prepare(runtime) {
          runtime.cpu.halted = false;
        },
      },
    ],
  },
  {
    id: 'event_loop',
    label: '0x0019BE event loop',
    stages: [
      {
        label: 'event_loop',
        entry: EVENT_LOOP_ENTRY,
        mode: 'adl',
        maxSteps: EVENT_LOOP_MAX_STEPS,
        maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
        prepare(runtime) {
          clearPendingInterrupts(runtime.peripherals);
          runtime.cpu.halted = false;
          runtime.cpu.iff1 = 1;
          runtime.cpu.iff2 = 1;
          resetStack(runtime.cpu, runtime.mem);
        },
      },
    ],
  },
];

function hex(value, width = 2) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function isPrintableAscii(value) {
  return value >= 0x20 && value < 0x7F;
}

function formatAsciiByte(value) {
  if (!isPrintableAscii(value)) {
    return '.';
  }

  return String.fromCharCode(value);
}

function formatHexBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function formatAscii(bytes) {
  return bytes.map(formatAsciiByte).join('');
}

function formatLastPc(result) {
  if (result.lastPc === undefined || result.lastPc === null) {
    return 'n/a';
  }

  return hex(result.lastPc, 6);
}

function summarizeTermination(result) {
  if (result.termination === 'missing_block' && result.lastPc === 0xFFFFFF) {
    return 'top_level_ret_via_missing_block_sentinel';
  }

  return result.termination;
}

function readModeBuffer(mem) {
  const bytes = Array.from(mem.slice(MODE_BUF_START, MODE_BUF_START + MODE_BUF_LEN));
  return {
    bytes,
    hex: formatHexBytes(bytes),
    ascii: formatAscii(bytes),
  };
}

function readKeyModeBytes(mem) {
  const snapshot = {};

  for (const addr of KEY_MODE_ADDRS) {
    snapshot[addr] = mem[addr];
  }

  return snapshot;
}

function formatKeyModeBytes(snapshot) {
  return KEY_MODE_ADDRS
    .map((addr) => `${hex(addr, 6)}=${hex(snapshot[addr], 2)}`)
    .join(' ');
}

function diffBuffers(left, right) {
  const changes = [];

  for (let index = 0; index < left.bytes.length; index++) {
    if (left.bytes[index] === right.bytes[index]) {
      continue;
    }

    changes.push({
      offset: index,
      addr: MODE_BUF_START + index,
      before: left.bytes[index],
      after: right.bytes[index],
    });
  }

  return changes;
}

function findPrintablePromotions(before, after) {
  return diffBuffers(before, after).filter(
    (change) => change.before === 0xFF && isPrintableAscii(change.after),
  );
}

function formatDiffList(changes) {
  if (changes.length === 0) {
    return 'none';
  }

  return changes
    .map(
      (change) =>
        `${hex(change.addr, 6)}:${hex(change.before, 2)}(${formatAsciiByte(change.before)}) -> ${hex(change.after, 2)}(${formatAsciiByte(change.after)})`,
    )
    .join(', ');
}

function resetStack(cpu, mem, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  mem.fill(0xFF, cpu.sp, cpu.sp + size);
}

function clearPendingInterrupts(peripherals) {
  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function buildRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function bootAndInit(runtime) {
  const { mem, cpu, executor, peripherals } = runtime;

  const coldBootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
  clearPendingInterrupts(peripherals);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  const osInitResult = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  clearPendingInterrupts(peripherals);

  return {
    coldBootResult,
    osInitResult,
    postInitResult,
    bufferAfterInit: readModeBuffer(mem),
  };
}

function installModeBufferWriteHook(cpu) {
  const writes = [];
  let currentStage = 'idle';
  let currentStep = 0;
  let currentPc = null;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value) {
    if (addr < MODE_BUF_START || addr >= MODE_BUF_START + MODE_BUF_LEN) {
      return;
    }

    if (writes.length >= MAX_WRITE_SAMPLES) {
      return;
    }

    writes.push({
      stage: currentStage,
      step: currentStep,
      pc: currentPc,
      addr,
      value: value & 0xFF,
    });
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value);
    recordByte(addr + 1, value >> 8);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value);
    recordByte(addr + 1, value >> 8);
    recordByte(addr + 2, value >> 16);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext(stage, step, pc) {
      currentStage = stage;
      currentStep = step;
      currentPc = pc;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStage(runtime, hook, baselineBuffer, config, stepBase) {
  const interrupts = [];

  config.prepare?.(runtime);
  hook.setContext(config.label, stepBase, config.entry);

  const result = runtime.executor.runFrom(config.entry, config.mode, {
    maxSteps: config.maxSteps,
    maxLoopIterations: config.maxLoopIterations,
    onBlock(pc, blockMode, meta, steps) {
      hook.setContext(config.label, stepBase + steps + 1, pc);
    },
    onInterrupt(type, returnPc, vector, steps) {
      interrupts.push({
        type,
        returnPc,
        vector,
        step: stepBase + steps,
      });
    },
  });

  const bufferAfterStage = readModeBuffer(runtime.mem);

  return {
    label: config.label,
    entry: config.entry,
    mode: config.mode,
    maxSteps: config.maxSteps,
    maxLoopIterations: config.maxLoopIterations,
    steps: result.steps,
    termination: summarizeTermination(result),
    rawTermination: result.termination,
    lastPc: result.lastPc,
    loopsForced: result.loopsForced,
    missingBlockCount: result.missingBlocks?.length ?? 0,
    interrupts,
    bufferAfterStage,
    diffFromBaseline: diffBuffers(baselineBuffer, bufferAfterStage),
    printablePromotions: findPrintablePromotions(baselineBuffer, bufferAfterStage),
    stepEnd: stepBase + result.steps,
  };
}

function runExperiment(seedConfig, variantConfig) {
  const runtime = buildRuntime();
  const boot = bootAndInit(runtime);

  seedConfig.apply(runtime.mem);
  const seededModeBytes = readKeyModeBytes(runtime.mem);
  const bufferBeforeRun = readModeBuffer(runtime.mem);

  const hook = installModeBufferWriteHook(runtime.cpu);
  const stages = [];
  let stepBase = 0;

  try {
    for (const stageConfig of variantConfig.stages) {
      const stage = runStage(runtime, hook, bufferBeforeRun, stageConfig, stepBase);
      stages.push(stage);
      stepBase = stage.stepEnd;
    }
  } finally {
    hook.restore();
  }

  const finalBuffer = stages.length > 0
    ? stages[stages.length - 1].bufferAfterStage
    : bufferBeforeRun;

  return {
    seedId: seedConfig.id,
    seedLabel: seedConfig.label,
    variantId: variantConfig.id,
    variantLabel: variantConfig.label,
    boot,
    seededModeBytes,
    bufferBeforeRun,
    stages,
    finalBuffer,
    finalDiff: diffBuffers(bufferBeforeRun, finalBuffer),
    finalPrintablePromotions: findPrintablePromotions(bufferBeforeRun, finalBuffer),
    writes: hook.writes.slice(),
  };
}

function printBootSummary(boot) {
  console.log(
    `  boot: cold=${summarizeTermination(boot.coldBootResult)} steps=${boot.coldBootResult.steps} lastPc=${formatLastPc(boot.coldBootResult)} | os_init=${summarizeTermination(boot.osInitResult)} steps=${boot.osInitResult.steps} lastPc=${formatLastPc(boot.osInitResult)} | post_init=${summarizeTermination(boot.postInitResult)} steps=${boot.postInitResult.steps} lastPc=${formatLastPc(boot.postInitResult)}`,
  );
  console.log(`  buffer after init: ${boot.bufferAfterInit.hex}`);
  console.log(`  buffer after init ascii: ${boot.bufferAfterInit.ascii}`);
}

function printStage(stage) {
  console.log(
    `  stage ${stage.label}: entry=${hex(stage.entry, 6)} steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc, 6)} loopsForced=${stage.loopsForced} missingBlocks=${stage.missingBlockCount} interrupts=${stage.interrupts.length}`,
  );
  console.log(`    buffer after stage: ${stage.bufferAfterStage.hex}`);
  console.log(`    ascii after stage: ${stage.bufferAfterStage.ascii}`);
  console.log(`    baseline diff: ${formatDiffList(stage.diffFromBaseline)}`);
  console.log(`    0xff -> printable: ${formatDiffList(stage.printablePromotions)}`);
}

function printWrites(writes) {
  if (writes.length === 0) {
    console.log('  buffer write samples: none');
    return;
  }

  console.log(`  buffer write samples (${writes.length} captured):`);

  for (const write of writes) {
    console.log(
      `    ${write.stage} step=${write.step} pc=${hex(write.pc, 6)} addr=${hex(write.addr, 6)} value=${hex(write.value, 2)} ascii=${formatAsciiByte(write.value)}`,
    );
  }
}

function printExperiment(experiment) {
  console.log('');
  console.log(`=== Experiment ${experiment.seedId} / ${experiment.variantId} ===`);
  console.log(`  seed: ${experiment.seedLabel}`);
  console.log(`  variant: ${experiment.variantLabel}`);
  printBootSummary(experiment.boot);
  console.log(`  seeded mode bytes: ${formatKeyModeBytes(experiment.seededModeBytes)}`);
  console.log(`  buffer before run: ${experiment.bufferBeforeRun.hex}`);
  console.log(`  buffer before run ascii: ${experiment.bufferBeforeRun.ascii}`);

  for (const stage of experiment.stages) {
    printStage(stage);
  }

  console.log(`  final buffer: ${experiment.finalBuffer.hex}`);
  console.log(`  final ascii: ${experiment.finalBuffer.ascii}`);
  console.log(`  final diff: ${formatDiffList(experiment.finalDiff)}`);
  console.log(`  final 0xff -> printable: ${formatDiffList(experiment.finalPrintablePromotions)}`);
  printWrites(experiment.writes);
}

function buildVariantDiffs(experiments) {
  const diffs = [];

  for (const variant of VARIANTS) {
    const experimentA = experiments.find(
      (experiment) => experiment.seedId === 'A' && experiment.variantId === variant.id,
    );
    const experimentB = experiments.find(
      (experiment) => experiment.seedId === 'B' && experiment.variantId === variant.id,
    );

    diffs.push({
      variantId: variant.id,
      variantLabel: variant.label,
      entries: diffBuffers(experimentA.finalBuffer, experimentB.finalBuffer),
    });
  }

  return diffs;
}

function printVariantDiffs(variantDiffs) {
  console.log('');
  console.log('=== Experiment A vs B Diffs ===');

  for (const diff of variantDiffs) {
    console.log(`  ${diff.variantId} (${diff.variantLabel}): ${formatDiffList(diff.entries)}`);
  }
}

function buildVerdict(experiments, variantDiffs) {
  const anyPrintablePromotion = experiments.some((experiment) =>
    experiment.stages.some((stage) => stage.printablePromotions.length > 0),
  );
  const anyFinalPrintablePromotion = experiments.some(
    (experiment) => experiment.finalPrintablePromotions.length > 0,
  );
  const anyABDiff = variantDiffs.some((diff) => diff.entries.length > 0);

  if (anyPrintablePromotion || anyFinalPrintablePromotion) {
    if (anyABDiff) {
      return 'WIN: pre-seeding produced printable ASCII in the mode buffer, and Experiment B changed the final buffer relative to Experiment A.';
    }

    return 'PARTIAL WIN: pre-seeding produced printable ASCII in the mode buffer, but Experiment B did not produce a distinct A/B final-buffer diff.';
  }

  if (anyABDiff) {
    return 'NO TEXT WIN: Experiment B changed bytes relative to Experiment A, but neither run promoted any 0xFF bytes to printable ASCII.';
  }

  return 'NO: pre-seeding the mode-state bytes did not populate 0xD020A6..0xD020BF with printable ASCII in any tested path, and setting 0xD0008A=0x01 did not produce an A/B final-buffer diff.';
}

function main() {
  console.log('=== Phase 104 - Event loop with pre-seeded mode-state bytes ===');
  console.log(`modeStateRange=${hex(MODE_STATE_START, 6)}..${hex(MODE_STATE_END, 6)}`);
  console.log(`modeBufferRange=${hex(MODE_BUF_START, 6)}..${hex(MODE_BUF_START + MODE_BUF_LEN - 1, 6)}`);

  const experiments = [];

  for (const seedConfig of SEED_EXPERIMENTS) {
    for (const variantConfig of VARIANTS) {
      const experiment = runExperiment(seedConfig, variantConfig);
      experiments.push(experiment);
      printExperiment(experiment);
    }
  }

  const variantDiffs = buildVariantDiffs(experiments);
  printVariantDiffs(variantDiffs);

  const verdict = buildVerdict(experiments, variantDiffs);
  console.log('');
  console.log(`VERDICT: ${verdict}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
