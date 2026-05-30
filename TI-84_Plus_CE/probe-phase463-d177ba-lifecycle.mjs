#!/usr/bin/env node
// Phase 463 probe: trace the D177BA event-gate lifecycle across boot and the event loop.

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
const TARGET_ADDR = 0xD177BA;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const EVENT_LOOP_ENTRY = 0x003A73;
const EVENT_LOOP_MAX_STEPS = 500000;
const EVENT_LOOP_MAX_LOOP_ITERATIONS = 5000;
const PROGRESS_INTERVAL = 100000;

const WRITE_SITES = [
  { pc: 0x000863, label: 'clear_000863', class: 'clear', expected: 0x00 },
  { pc: 0x0008AF, label: 'clear_0008AF', class: 'clear', expected: 0x00 },
  { pc: 0x0014B7, label: 'clear_0014B7', class: 'clear', expected: 0x00 },
  { pc: 0x0014C0, label: 'set7f_0014C0', class: 'set7f', expected: 0x7F },
  { pc: 0x001855, label: 'set7f_001855', class: 'set7f', expected: 0x7F },
  { pc: 0x00F045, label: 'clear_00F045', class: 'clear', expected: 0x00 },
  { pc: 0x014557, label: 'setff_014557', class: 'setff', expected: 0xFF },
  { pc: 0x02BA85, label: 'clear_02BA85', class: 'clear', expected: 0x00 },
  { pc: 0x02BBAE, label: 'clear_02BBAE', class: 'clear', expected: 0x00 },
];

const WRITE_SITE_MAP = new Map(WRITE_SITES.map((site) => [site.pc, site]));
const CLEAR_SITE_PCS = new Set(
  WRITE_SITES.filter((site) => site.class === 'clear').map((site) => site.pc),
);

function hex(value, width = 6) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function resetStack(cpu, mem, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  mem.fill(0xFF, cpu.sp, cpu.sp + size);
}

function clearPendingInterrupts(peripherals) {
  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function formatValues(values) {
  if (values.length === 0) {
    return '(none)';
  }
  return values.map((value) => hex(value, 2)).join(', ');
}

function formatPhaseSet(values) {
  return values.length === 0 ? '(none)' : values.join(', ');
}

function createSiteStats() {
  const stats = new Map();
  for (const site of WRITE_SITES) {
    stats.set(site.pc, {
      ...site,
      hitCount: 0,
      phases: new Set(),
      values: new Set(),
      hits: [],
    });
  }
  return stats;
}

function installTargetWriteHook(cpu, mem, siteStats) {
  const writesByPhase = {
    boot: [],
    event_loop: [],
    other: [],
  };

  let context = {
    phase: 'other',
    stage: 'idle',
    step: 0,
    stageStep: 0,
    absoluteStep: 0,
    pc: null,
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(kind, baseAddr, byteOffset, value) {
    const normalizedBase = baseAddr & 0xFFFFFF;
    const addr = (normalizedBase + byteOffset) & 0xFFFFFF;
    if (addr !== TARGET_ADDR) {
      return;
    }

    const before = mem[TARGET_ADDR] & 0xFF;
    const after = (value >>> (byteOffset * 8)) & 0xFF;
    const site = WRITE_SITE_MAP.get(context.pc ?? -1) ?? null;
    const entry = {
      phase: context.phase,
      stage: context.stage,
      step: context.step,
      stageStep: context.stageStep,
      absoluteStep: context.absoluteStep,
      pc: context.pc,
      before,
      after,
      kind,
      baseAddr: normalizedBase,
      byteOffset,
      siteLabel: site?.label ?? null,
      siteClass: site?.class ?? null,
      expected: site?.expected ?? null,
    };

    const bucket = writesByPhase[entry.phase] ?? writesByPhase.other;
    bucket.push(entry);

    if (site) {
      const stat = siteStats.get(site.pc);
      stat.hitCount++;
      stat.phases.add(entry.phase);
      stat.values.add(entry.after);
      if (stat.hits.length < 16) {
        stat.hits.push({
          phase: entry.phase,
          stage: entry.stage,
          step: entry.step,
          stageStep: entry.stageStep,
          absoluteStep: entry.absoluteStep,
          before: entry.before,
          after: entry.after,
          kind: entry.kind,
        });
      }
    }

    console.log(
      `  D177BA write: phase=${entry.phase} step=${entry.step} stage=${entry.stage} `
      + `pc=${hex(entry.pc)} before=${hex(entry.before, 2)} after=${hex(entry.after, 2)} `
      + `via=${entry.kind}${entry.siteLabel ? ` site=${entry.siteLabel}` : ''}`,
    );
  }

  cpu.write8 = (addr, value) => {
    recordByte('write8', addr, 0, value);
    return origWrite8(addr, value);
  };

  // Wide writes bypass write8 in this runtime, so mirror overlapping bytes here.
  cpu.write16 = (addr, value) => {
    recordByte('write16', addr, 0, value);
    recordByte('write16', addr, 1, value);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte('write24', addr, 0, value);
    recordByte('write24', addr, 1, value);
    recordByte('write24', addr, 2, value);
    return origWrite24(addr, value);
  };

  return {
    writesByPhase,
    setContext(nextContext) {
      context = { ...nextContext };
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStage(executor, hook, options) {
  const {
    phase,
    label,
    entry,
    mode,
    maxSteps,
    maxLoopIterations,
    phaseStepBase,
    absoluteStepBase,
    progressEvery = 0,
    runOptions = {},
  } = options;

  const { onBlock: userOnBlock, ...forwardedRunOptions } = runOptions;

  let nextProgress = progressEvery > 0
    ? phaseStepBase + progressEvery
    : Number.POSITIVE_INFINITY;

  hook.setContext({
    phase,
    stage: label,
    step: phaseStepBase,
    stageStep: 0,
    absoluteStep: absoluteStepBase,
    pc: entry,
  });

  console.log(
    `run ${label}: entry=${hex(entry)} mode=${mode} maxSteps=${maxSteps} `
    + `maxLoopIterations=${maxLoopIterations}`,
  );

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    ...forwardedRunOptions,
    onBlock(pc, blockMode, meta, steps) {
      const stageStep = steps + 1;
      const phaseStep = phaseStepBase + stageStep;
      const absoluteStep = absoluteStepBase + stageStep;
      hook.setContext({
        phase,
        stage: label,
        step: phaseStep,
        stageStep,
        absoluteStep,
        pc: pc & 0xFFFFFF,
      });

      if (phaseStep >= nextProgress) {
        console.log(`  progress ${label}: phaseStep=${phaseStep} pc=${hex(pc)}`);
        nextProgress += progressEvery;
      }

      userOnBlock?.(pc, blockMode, meta, steps);
    },
  });

  console.log(
    `result ${label}: steps=${result.steps} term=${result.termination} `
    + `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? 'n/a'}`,
  );

  return {
    phase,
    label,
    entry,
    mode,
    stepBase: phaseStepBase,
    stepEnd: phaseStepBase + result.steps,
    absoluteStepBase,
    absoluteStepEnd: absoluteStepBase + result.steps,
    result,
  };
}

function reportStageSummary(stageResults) {
  console.log('');
  console.log('=== Stage Summary ===');
  for (const stage of stageResults) {
    console.log(
      `  ${stage.label}: phase=${stage.phase} entry=${hex(stage.entry)} `
      + `steps=${stage.result.steps} term=${stage.result.termination} `
      + `lastPc=${hex(stage.result.lastPc)}`,
    );
  }
}

function reportPhaseWrites(label, writes) {
  console.log('');
  console.log(`=== ${label.toUpperCase()} D177BA Writes ===`);
  console.log(`count=${writes.length}`);

  if (writes.length === 0) {
    console.log('  none observed');
    return;
  }

  for (const [index, entry] of writes.entries()) {
    console.log(
      `  [${String(index + 1).padStart(2, '0')}] step=${entry.step} stageStep=${entry.stageStep} `
      + `abs=${entry.absoluteStep} stage=${entry.stage} pc=${hex(entry.pc)} `
      + `${hex(entry.before, 2)} -> ${hex(entry.after, 2)} via=${entry.kind}`
      + `${entry.siteLabel ? ` site=${entry.siteLabel}` : ''}`,
    );
  }
}

function reportSiteCoverage(siteStats) {
  console.log('');
  console.log('=== Known Write-Site Coverage ===');
  for (const site of WRITE_SITES) {
    const stat = siteStats.get(site.pc);
    const phases = [...stat.phases].sort();
    const values = [...stat.values].sort((left, right) => left - right);
    console.log(
      `  ${hex(site.pc)} ${site.label} expected=${hex(site.expected, 2)} `
      + `class=${site.class} hits=${stat.hitCount} phases=${formatPhaseSet(phases)} `
      + `values=${formatValues(values)}`,
    );
    if (stat.hits.length === 0) {
      continue;
    }
    for (const hit of stat.hits) {
      console.log(
        `    phase=${hit.phase} step=${hit.step} stage=${hit.stage} `
        + `pc=${hex(site.pc)} ${hex(hit.before, 2)} -> ${hex(hit.after, 2)} via=${hit.kind}`,
      );
    }
    if (stat.hitCount > stat.hits.length) {
      console.log(`    ... ${stat.hitCount - stat.hits.length} additional hit(s) omitted`);
    }
  }
}

function reportUnexpectedWriters(writes) {
  const unexpected = writes.filter((entry) => !WRITE_SITE_MAP.has(entry.pc ?? -1));

  console.log('');
  console.log('=== Unexpected Writer PCs ===');
  if (unexpected.length === 0) {
    console.log('  none');
    return;
  }

  for (const [index, entry] of unexpected.entries()) {
    console.log(
      `  [${String(index + 1).padStart(2, '0')}] phase=${entry.phase} step=${entry.step} `
      + `stage=${entry.stage} pc=${hex(entry.pc)} ${hex(entry.before, 2)} -> ${hex(entry.after, 2)}`,
    );
  }
}

function buildVerdict(eventLoopWrites, bootValue, finalValue) {
  const eventLoopClearSiteWrites = eventLoopWrites.filter((entry) => CLEAR_SITE_PCS.has(entry.pc ?? -1));
  const eventLoopClearToZero = eventLoopClearSiteWrites.filter((entry) => entry.after === 0x00);
  const eventLoopKnownWriters = eventLoopWrites.filter((entry) => WRITE_SITE_MAP.has(entry.pc ?? -1));
  const uniqueKnownEventWriterPcs = [...new Set(eventLoopKnownWriters.map((entry) => entry.pc))];

  let message;
  if (eventLoopClearToZero.length > 0) {
    const pcs = [...new Set(eventLoopClearToZero.map((entry) => hex(entry.pc)))];
    message = `YES: clear-site write(s) to 0x00 were observed during the event loop at ${pcs.join(', ')}.`;
  } else if (eventLoopWrites.length === 0 && finalValue === bootValue) {
    message = `NO: no D177BA writes were observed during the 500000-step event-loop run; D177BA stayed ${hex(finalValue, 2)} after boot.`;
  } else if (eventLoopClearSiteWrites.length === 0) {
    message = `NO: none of the six clear sites fired during the 500000-step event-loop run.`;
  } else {
    const pcs = [...new Set(eventLoopClearSiteWrites.map((entry) => hex(entry.pc)))];
    message = `NO clear-to-0x00 write observed: clear-site PC(s) ${pcs.join(', ')} executed, but none wrote 0x00.`;
  }

  return {
    message,
    eventLoopClearSiteWrites,
    eventLoopClearToZero,
    uniqueKnownEventWriterPcs,
  };
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const siteStats = createSiteStats();
  const hook = installTargetWriteHook(cpu, mem, siteStats);
  const stageResults = [];
  const eventMissingBlocks = [];

  let bootValue = null;
  let finalValue = null;

  let absoluteStepBase = 0;
  let bootPhaseStepBase = 0;

  console.log('=== Phase 463: D177BA Lifecycle ===');
  console.log(`target=${hex(TARGET_ADDR)} timerInterrupt=false eventLoop=${hex(EVENT_LOOP_ENTRY)}`);
  console.log('');

  try {
    stageResults.push(runStage(executor, hook, {
      phase: 'boot',
      label: 'boot_rom',
      entry: BOOT_ENTRY,
      mode: BOOT_MODE,
      maxSteps: BOOT_MAX_STEPS,
      maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
      phaseStepBase: bootPhaseStepBase,
      absoluteStepBase,
    }));
    bootPhaseStepBase = stageResults[stageResults.length - 1].stepEnd;
    absoluteStepBase = stageResults[stageResults.length - 1].absoluteStepEnd;

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, mem, 3);

    stageResults.push(runStage(executor, hook, {
      phase: 'boot',
      label: 'kernel_init',
      entry: KERNEL_INIT_ENTRY,
      mode: 'adl',
      maxSteps: KERNEL_INIT_MAX_STEPS,
      maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
      phaseStepBase: bootPhaseStepBase,
      absoluteStepBase,
      progressEvery: PROGRESS_INTERVAL,
    }));
    bootPhaseStepBase = stageResults[stageResults.length - 1].stepEnd;
    absoluteStepBase = stageResults[stageResults.length - 1].absoluteStepEnd;

    cpu.mbase = 0xD0;
    cpu._iy = 0xD00080;
    cpu._hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, mem, 3);

    stageResults.push(runStage(executor, hook, {
      phase: 'boot',
      label: 'post_init',
      entry: POST_INIT_ENTRY,
      mode: 'adl',
      maxSteps: POST_INIT_MAX_STEPS,
      maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
      phaseStepBase: bootPhaseStepBase,
      absoluteStepBase,
    }));
    bootPhaseStepBase = stageResults[stageResults.length - 1].stepEnd;
    absoluteStepBase = stageResults[stageResults.length - 1].absoluteStepEnd;

    bootValue = mem[TARGET_ADDR] & 0xFF;

    console.log('');
    console.log('--- Post-boot state ---');
    console.log(`D177BA after boot: ${hex(bootValue, 2)}${bootValue === 0x7F ? ' (expected)' : ' (unexpected)'}`);
    console.log(
      `cpu.pc=${hex(cpu.pc)} cpu.sp=${hex(cpu.sp)} cpu.mbase=${hex(cpu.mbase, 2)} `
      + `cpu.iy=${hex(cpu.iy ?? cpu._iy)} cpu.iff1=${cpu.iff1} cpu.iff2=${cpu.iff2}`,
    );
    console.log('');

    clearPendingInterrupts(peripherals);
    peripherals.setTimerEnabled?.(false);
    cpu.halted = false;

    stageResults.push(runStage(executor, hook, {
      phase: 'event_loop',
      label: 'event_loop',
      entry: EVENT_LOOP_ENTRY,
      mode: 'adl',
      maxSteps: EVENT_LOOP_MAX_STEPS,
      maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
      phaseStepBase: 0,
      absoluteStepBase,
      progressEvery: PROGRESS_INTERVAL,
      runOptions: {
        diHaltBypass: true,
        onMissingBlock(pc, mode, steps) {
          if (eventMissingBlocks.length < 20) {
            eventMissingBlocks.push({
              step: steps + 1,
              pc: pc & 0xFFFFFF,
              mode,
            });
          }
        },
      },
    }));
  } finally {
    hook.restore();
  }

  finalValue = mem[TARGET_ADDR] & 0xFF;

  const bootWrites = hook.writesByPhase.boot;
  const eventLoopWrites = hook.writesByPhase.event_loop;
  const allWrites = [...bootWrites, ...eventLoopWrites, ...hook.writesByPhase.other];
  const verdict = buildVerdict(eventLoopWrites, bootValue, finalValue);

  reportStageSummary(stageResults);

  console.log('');
  console.log('=== Value Checkpoints ===');
  console.log(`  after boot:      ${hex(bootValue, 2)}`);
  console.log(`  after eventloop: ${hex(finalValue, 2)}`);

  reportPhaseWrites('boot', bootWrites);
  reportPhaseWrites('event_loop', eventLoopWrites);
  reportSiteCoverage(siteStats);
  reportUnexpectedWriters(allWrites);

  console.log('');
  console.log('=== Event-Loop Missing Blocks ===');
  if (eventMissingBlocks.length === 0) {
    console.log('  none');
  } else {
    for (const entry of eventMissingBlocks) {
      console.log(`  step=${entry.step} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
  }

  console.log('');
  console.log('=== Verdict ===');
  console.log(`  ${verdict.message}`);
  console.log(
    `  Known event-loop writer PCs: ${
      verdict.uniqueKnownEventWriterPcs.length === 0
        ? '(none)'
        : verdict.uniqueKnownEventWriterPcs.map((pc) => hex(pc)).join(', ')
    }`,
  );
  console.log(
    `  Clear-site PCs hit in event loop: ${
      verdict.eventLoopClearSiteWrites.length === 0
        ? '(none)'
        : [...new Set(verdict.eventLoopClearSiteWrites.map((entry) => hex(entry.pc)))].join(', ')
    }`,
  );
  console.log(
    `  Clear-to-0x00 writes in event loop: ${
      verdict.eventLoopClearToZero.length === 0
        ? '(none)'
        : verdict.eventLoopClearToZero
          .map((entry) => `${hex(entry.pc)}@step${entry.step}`)
          .join(', ')
    }`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
