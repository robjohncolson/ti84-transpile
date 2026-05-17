#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 1000000;
const PHASE348_BASELINE_UNIQUE_BLOCKS = 35;
const NEW_TERRITORY_PC = 0x005998;
const TIMER_DISPATCH_PC = 0x001713;

const TESTS = [
  {
    label: 'Test 1: timer enabled, default interval',
    intervalLabel: 'default (200)',
    effectiveTimerInterval: 200,
    peripheralOptions: { timerInterrupt: true },
  },
  {
    label: 'Test 2: timer enabled, interval=1000',
    intervalLabel: '1000',
    effectiveTimerInterval: 1000,
    peripheralOptions: { timerInterrupt: true, timerInterval: 1000 },
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase349-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));

  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatVectorCounts(vectorCounts) {
  if (vectorCounts.size === 0) {
    return 'none';
  }

  return [...vectorCounts.entries()]
    .map(([key, count]) => `${key} x${formatCount(count)}`)
    .join(', ');
}

function formatPhase348Comparison(summary) {
  const delta = summary.uniqueBlockDelta;
  if (delta > 0) {
    return `YES (+${formatCount(delta)} by count vs 35-block baseline)`;
  }
  if (delta === 0) {
    return 'NO (matches the 35-block baseline count)';
  }
  return `NO (${formatCount(Math.abs(delta))} fewer by count than the 35-block baseline)`;
}

function metricWinner(left, right, field) {
  if (left[field] > right[field]) return left.label;
  if (right[field] > left[field]) return right.label;
  return 'tie';
}

function runBootProbe(createExecutor, createPeripheralBus, blocks, romBytes, test) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ ...test.peripheralOptions });
  const executor = createExecutor(blocks, mem, { peripherals });

  const uniqueBlocks = new Map();
  const interruptVectorCounts = new Map();
  const firstMissingBlocks = [];

  let totalMissingBlockEvents = 0;
  let furthestPc = 0;
  let firstBeyond = null;
  let timerDispatchEntries = 0;
  let irqInterrupts = 0;
  let nmiInterrupts = 0;

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(blockPc, mode, _meta, steps) {
      const pc = blockPc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(pc, normalizedMode);

      if (!uniqueBlocks.has(key)) {
        uniqueBlocks.set(key, { pc, mode: normalizedMode, step: steps });
      }

      if (pc > furthestPc) {
        furthestPc = pc;
      }

      if (firstBeyond === null && pc > NEW_TERRITORY_PC) {
        firstBeyond = { pc, mode: normalizedMode, step: steps };
      }

      if (pc === TIMER_DISPATCH_PC) {
        timerDispatchEntries++;
      }
    },
    onMissingBlock(pc, mode, steps) {
      totalMissingBlockEvents++;
      if (firstMissingBlocks.length < 5) {
        firstMissingBlocks.push({
          pc: pc & 0xFFFFFF,
          mode: mode ?? 'adl',
          step: steps,
        });
      }
    },
    onInterrupt(type, _fromPc, vector) {
      if (type === 'irq') irqInterrupts++;
      if (type === 'nmi') nmiInterrupts++;

      const key = `${type}@${hex(vector & 0xFFFFFF)}`;
      interruptVectorCounts.set(key, (interruptVectorCounts.get(key) ?? 0) + 1);
    },
  });

  return {
    label: test.label,
    intervalLabel: test.intervalLabel,
    effectiveTimerInterval: test.effectiveTimerInterval,
    peripheralOptions: test.peripheralOptions,
    termination: result.termination,
    steps: result.steps ?? 0,
    lastPc: result.lastPc ?? null,
    lastMode: result.lastMode ?? BOOT_MODE,
    loopsForced: result.loopsForced ?? 0,
    error: result.error ? (result.error.stack || result.error.message || String(result.error)) : null,
    uniqueBlocks: uniqueBlocks.size,
    uniqueBlockDelta: uniqueBlocks.size - PHASE348_BASELINE_UNIQUE_BLOCKS,
    firstMissingBlocks,
    totalMissingBlockEvents,
    reachedBeyondNewTerritory: firstBeyond !== null,
    firstBeyond,
    furthestPc,
    irqInterrupts,
    nmiInterrupts,
    timerDispatchEntries,
    interruptVectorCounts,
  };
}

function printRunSummary(summary) {
  console.log(summary.label);
  console.log('-'.repeat(summary.label.length));
  console.log(`Timer interval:             ${summary.intervalLabel}`);
  console.log(`Termination:                ${summary.termination}`);
  console.log(`Total steps:                ${formatCount(summary.steps)}`);
  console.log(`Unique blocks:              ${formatCount(summary.uniqueBlocks)}`);
  console.log(`Phase 348 comparison:       ${formatPhase348Comparison(summary)}`);
  console.log(
    `Beyond ${hex(NEW_TERRITORY_PC)}:            `
      + (summary.reachedBeyondNewTerritory
        ? `YES first ${hex(summary.firstBeyond.pc)}:${summary.firstBeyond.mode} at step ${formatCount(summary.firstBeyond.step)}`
        : 'NO'),
  );
  console.log(`Furthest PC reached:        ${hex(summary.furthestPc)}`);
  console.log(`IRQ callbacks observed:     ${formatCount(summary.irqInterrupts)}`);
  console.log(`NMI callbacks observed:     ${formatCount(summary.nmiInterrupts)}`);
  console.log(`Interrupt vectors observed: ${formatVectorCounts(summary.interruptVectorCounts)}`);
  console.log(`0x001713 entries:           ${formatCount(summary.timerDispatchEntries)}`);
  console.log(`Missing block events:       ${formatCount(summary.totalMissingBlockEvents)}`);

  if (summary.firstMissingBlocks.length === 0) {
    console.log('First 5 missing blocks:     none');
  } else {
    console.log('First 5 missing blocks:');
    for (const entry of summary.firstMissingBlocks) {
      console.log(`  step=${formatCount(entry.step)} pc=${hex(entry.pc)}:${entry.mode}`);
    }
  }

  console.log(`Last PC:                    ${hex(summary.lastPc)}:${summary.lastMode}`);
  console.log(`Loops forced:               ${formatCount(summary.loopsForced)}`);
  if (summary.error) {
    console.log(`Error:                      ${summary.error}`);
  }
  console.log('');
}

function printComparison(left, right) {
  console.log('Comparison');
  console.log('----------');
  console.log(`Unique-block winner:        ${metricWinner(left, right, 'uniqueBlocks')}`);
  console.log(`IRQ-callback winner:        ${metricWinner(left, right, 'irqInterrupts')}`);
  console.log(`0x001713-entry winner:      ${metricWinner(left, right, 'timerDispatchEntries')}`);
  console.log(
    `New-territory reach:        ${left.label}=${left.reachedBeyondNewTerritory ? 'YES' : 'NO'}, `
      + `${right.label}=${right.reachedBeyondNewTerritory ? 'YES' : 'NO'}`,
  );
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
    const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS
      ?? romModule.default?.PRELIFTED_BLOCKS
      ?? romModule.default
      ?? romModule,
    );

    console.log('Phase 349: Boot with timer enabled');
    console.log('==================================');
    console.log(`Boot entry:                 ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
    console.log(`Max steps per run:          ${formatCount(MAX_STEPS)}`);
    console.log('Timer interval option:      timerInterval (supported by createPeripheralBus)');
    console.log(
      `Phase 348 baseline:         ${formatCount(PHASE348_BASELINE_UNIQUE_BLOCKS)} unique blocks `
        + '(timer disabled, count-only comparison)',
    );
    console.log(`New-territory threshold:    > ${hex(NEW_TERRITORY_PC)}`);
    console.log(`Timer dispatch watch:       ${hex(TIMER_DISPATCH_PC)}`);
    console.log(
      `Transpiled source:          ${assets.source === 'js' ? path.basename(TRANSPILED_JS_PATH) : path.basename(TRANSPILED_GZ_PATH)}`,
    );
    console.log('');

    const results = TESTS.map((test) => runBootProbe(
      createExecutor,
      createPeripheralBus,
      blocks,
      romBytes,
      test,
    ));

    for (const summary of results) {
      printRunSummary(summary);
    }

    printComparison(results[0], results[1]);
    console.log('--- probe complete ---');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
