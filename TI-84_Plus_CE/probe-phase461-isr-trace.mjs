#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
const FLASH_ROUTINE_RAM_DST = 0xD18C22;
const FLASH_ROUTINE_LEN = 0x5A;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const BOOT_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const KERNEL_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const POST_INIT_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const STAGE_OPTS = { maxSteps: 50000, maxLoopIterations: 500 };
const TRACE_OPTS = { maxSteps: 50000, maxLoopIterations: 50000, diHaltBypass: true };

const FLAG_Z = 0x40;

const D177BA_ADDR = 0xD177BA;
const D177B7_ADDR = 0xD177B7;
const D14091_ADDR = 0xD14091;

const WATCHED_PCS = [
  [0x000038, 'IM1_VECTOR'],
  [0x0006F3, 'ISR_FRONTEND'],
  [0x001713, 'ISR_GUARD'],
  [0x0008BB, 'ROM_SIG_CHECK'],
  [0x0019B5, 'REDUCED_HALT_GATE'],
  [0x0019BE, 'REDUCED_HANDLER'],
  [0x02010C, 'FULL_DISPATCH_TRAMPOLINE'],
  [0x03CF7D, 'FULL_ISR_DISPATCHER'],
  [0x03F994, 'KBDSCAN'],
];

const WATCHED_LABELS = new Map(WATCHED_PCS);
const ROM_SIG_RET_PC = 0x0008C7;

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw
        .filter((entry) => entry?.id)
        .map((entry) => [entry.id, entry]),
    );
  }

  return raw ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function minDefined(...values) {
  const filtered = values.filter((value) => Number.isInteger(value));
  return filtered.length === 0 ? null : Math.min(...filtered);
}

function bootToHomeScreen(executor, cpu, mem) {
  const phaseResults = [];

  phaseResults.push({
    label: 'boot',
    entry: BOOT_ENTRY,
    mode: 'z80',
    result: executor.runFrom(BOOT_ENTRY, 'z80', BOOT_OPTS),
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseResults.push({
    label: 'kernel',
    entry: KERNEL_INIT_ENTRY,
    mode: 'adl',
    result: executor.runFrom(KERNEL_INIT_ENTRY, 'adl', KERNEL_OPTS),
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseResults.push({
    label: 'postInit',
    entry: POST_INIT_ENTRY,
    mode: 'adl',
    result: executor.runFrom(POST_INIT_ENTRY, 'adl', POST_INIT_OPTS),
  });

  for (let index = 0; index < STAGE_ENTRIES.length; index += 1) {
    const entry = STAGE_ENTRIES[index];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = EVENT_RESET_SP;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    phaseResults.push({
      label: `stage${index + 1}`,
      entry,
      mode: 'adl',
      result: executor.runFrom(entry, 'adl', STAGE_OPTS),
    });
  }

  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return {
    phaseResults: phaseResults.map((phase) => ({
      label: phase.label,
      entry: hex(phase.entry),
      mode: phase.mode,
      steps: phase.result.steps ?? 0,
      termination: phase.result.termination ?? 'unknown',
      lastPc: hex(phase.result.lastPc),
    })),
    bootSteps: phaseResults.reduce((sum, phase) => sum + (phase.result.steps ?? 0), 0),
    resumePc: EVENT_LOOP_ENTRY,
    resumeMode: 'adl',
  };
}

function installPostBootTimer(peripherals, interval = 200) {
  const originalTick = peripherals.tick.bind(peripherals);
  let wrappedTicks = 0;
  let armedCount = 0;
  let immediateArms = 0;

  peripherals.tick = () => {
    originalTick();
    wrappedTicks += 1;

    if ((wrappedTicks % interval) === 0) {
      peripherals.triggerIRQ();
      armedCount += 1;
    }
  };

  return {
    interval,
    enableNow() {
      peripherals.triggerIRQ();
      armedCount += 1;
      immediateArms += 1;
    },
    stats() {
      return {
        interval,
        wrappedTicks,
        armedCount,
        immediateArms,
      };
    },
  };
}

function buildHitReport(hitCounts, firstHits) {
  return Object.fromEntries(
    WATCHED_PCS.map(([pc, label]) => [
      `${hex(pc)} (${label})`,
      {
        hits: hitCounts.get(pc) ?? 0,
        firstStep: firstHits.get(pc) ?? null,
      },
    ]),
  );
}

function classifyRoute(hitCounts, firstHits) {
  const reducedObserved = (hitCounts.get(0x0019B5) ?? 0) > 0 || (hitCounts.get(0x0019BE) ?? 0) > 0;
  const fullObserved = (hitCounts.get(0x02010C) ?? 0) > 0 || (hitCounts.get(0x03CF7D) ?? 0) > 0;
  const kbdScanObserved = (hitCounts.get(0x03F994) ?? 0) > 0;

  const firstReducedStep = minDefined(firstHits.get(0x0019B5), firstHits.get(0x0019BE));
  const firstFullStep = minDefined(firstHits.get(0x02010C), firstHits.get(0x03CF7D));

  let firstObservedRoute = 'no_dispatch_observed';
  if (firstReducedStep !== null && firstFullStep !== null) {
    firstObservedRoute = firstReducedStep <= firstFullStep ? 'reduced_handler' : 'full_dispatcher';
  } else if (firstReducedStep !== null) {
    firstObservedRoute = 'reduced_handler';
  } else if (firstFullStep !== null) {
    firstObservedRoute = 'full_dispatcher';
  }

  let overallRoute = 'no_dispatch_observed';
  if (reducedObserved && fullObserved) {
    overallRoute = 'mixed';
  } else if (reducedObserved) {
    overallRoute = 'reduced_handler';
  } else if (fullObserved) {
    overallRoute = 'full_dispatcher';
  }

  return {
    firstObservedRoute,
    overallRoute,
    reducedObserved,
    fullObserved,
    kbdScanObserved,
    firstReducedStep,
    firstFullStep,
  };
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootToHomeScreen(executor, cpu, mem);

  const preEnableState = {
    d177ba: hexByte(mem[D177BA_ADDR]),
    d177b7: hexByte(mem[D177B7_ADDR]),
    d14091: hexByte(mem[D14091_ADDR]),
    mbase: hexByte(cpu.mbase),
    iff1: cpu.iff1 ? 1 : 0,
    iff2: cpu.iff2 ? 1 : 0,
  };

  const hitCounts = new Map(WATCHED_PCS.map(([pc]) => [pc, 0]));
  const firstHits = new Map(WATCHED_PCS.map(([pc]) => [pc, null]));
  const watchedSequence = [];
  const romSigReturnSamples = [];
  const d177baAtGuardCall = [];
  const interruptEvents = [];

  const timer = installPostBootTimer(peripherals, 200);
  timer.enableNow();

  const runResult = executor.runFrom(boot.resumePc, boot.resumeMode, {
    ...TRACE_OPTS,
    onBlock(pc, _mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;

      if (hitCounts.has(normalizedPc)) {
        hitCounts.set(normalizedPc, (hitCounts.get(normalizedPc) ?? 0) + 1);

        if (firstHits.get(normalizedPc) === null) {
          firstHits.set(normalizedPc, step);
        }

        if (watchedSequence.length < 128) {
          watchedSequence.push({
            step,
            pc: hex(normalizedPc),
            label: WATCHED_LABELS.get(normalizedPc),
          });
        }
      }

      if (normalizedPc === ROM_SIG_RET_PC) {
        romSigReturnSamples.push({
          step,
          z: (cpu.f & FLAG_Z) !== 0,
          f: hexByte(cpu.f),
        });
      }

      if (normalizedPc === 0x001713) {
        d177baAtGuardCall.push({
          step,
          value: hexByte(mem[D177BA_ADDR]),
          f: hexByte(cpu.f),
          sp: hex(cpu.sp),
        });
      }
    },
    onInterrupt(type, returnPc, vector, step) {
      if (interruptEvents.length < 64) {
        interruptEvents.push({
          type,
          step,
          returnPc: hex(returnPc),
          vector: hex(vector),
        });
      }
    },
  });

  const zSetCount = romSigReturnSamples.filter((sample) => sample.z).length;
  const zClearCount = romSigReturnSamples.length - zSetCount;
  const route = classifyRoute(hitCounts, firstHits);

  const report = {
    probe: 'phase461-isr-trace',
    boot: {
      timerInterruptDuringBoot: false,
      totalBootSteps: boot.bootSteps,
      phases: boot.phaseResults,
    },
    preEnableState,
    timerEnable: {
      method: 'wrapped peripherals.tick + peripherals.triggerIRQ()',
      note: 'The peripheral bus has no public post-construction timer-enable setter, so this probe re-arms IRQ delivery after boot by wrapping tick() and issuing triggerIRQ().',
      stats: timer.stats(),
    },
    run: {
      entryPc: hex(boot.resumePc),
      entryMode: boot.resumeMode,
      stepBudget: TRACE_OPTS.maxSteps,
      steps: runResult.steps ?? 0,
      termination: runResult.termination ?? 'unknown',
      lastPc: hex(runResult.lastPc),
      lastMode: runResult.lastMode ?? null,
      halted: Boolean(runResult.halted),
      loopsForced: runResult.loopsForced ?? 0,
    },
    interrupts: {
      observedCount: interruptEvents.length,
      events: interruptEvents,
    },
    route,
    watchedHits: buildHitReport(hitCounts, firstHits),
    romSigReturnAt0x0008C7: {
      sampleCount: romSigReturnSamples.length,
      zSetCount,
      zClearCount,
      samples: romSigReturnSamples,
    },
    d177baAt0x001713: {
      sampleCount: d177baAtGuardCall.length,
      uniqueValues: [...new Set(d177baAtGuardCall.map((sample) => sample.value))],
      samples: d177baAtGuardCall,
    },
    watchedSequence,
  };

  console.log('=== Phase 461 ISR Trace Probe ===');
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
