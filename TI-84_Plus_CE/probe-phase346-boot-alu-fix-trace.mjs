#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const SEEDED_ENTRY = 0x000800;
const FORMER_DIVERSION = 0x0008BB;
const PREVIOUS_TERMINUS = 0x0019B5;

const MAX_STEPS = 5000000;
const MAX_LOOP_ITERATIONS = 500000;
const IO_SAMPLE_LIMIT = 200;
const LOOP_BREAK_SAMPLE_LIMIT = 32;
const MISSING_BLOCK_SAMPLE_LIMIT = 32;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hexPort(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function formatValueSet(values) {
  if (values.size === 0) {
    return '[]';
  }

  return `[${[...values].sort((a, b) => a - b).map((value) => hexByte(value)).join(', ')}]`;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const uniqueBlocks = new Map();
const uniqueAddresses = new Set();
const ioByPort = new Map();
const ioSamples = [];
const missingBlockEvents = [];
const loopBreakEvents = [];

let currentStep = 0;
let currentPc = BOOT_ENTRY;
let currentMode = BOOT_MODE;

let reachedSeed = false;
let seedFirstStep = null;
let seedTraceCount = 0;

let reachedFormerDiversion = false;
let formerDiversionStep = null;
let passedFormerDiversion = false;
let formerDiversionPassEvent = null;

let previousTerminusVisit = null;
let firstMissingBlock = null;

function noteIo(dir, port, value) {
  const normalizedPort = port & 0xFFFF;
  const normalizedValue = value & 0xFF;

  let summary = ioByPort.get(normalizedPort);
  if (!summary) {
    summary = {
      reads: 0,
      writes: 0,
      readValues: new Set(),
      writeValues: new Set(),
    };
    ioByPort.set(normalizedPort, summary);
  }

  if (dir === 'R') {
    summary.reads++;
    summary.readValues.add(normalizedValue);
  } else {
    summary.writes++;
    summary.writeValues.add(normalizedValue);
  }

  if (ioSamples.length < IO_SAMPLE_LIMIT) {
    ioSamples.push({
      step: currentStep,
      pc: currentPc,
      mode: currentMode,
      dir,
      port: normalizedPort,
      value: normalizedValue,
    });
  }
}

const originalOnIoRead = cpu.onIoRead?.bind(cpu) ?? (() => {});
const originalOnIoWrite = cpu.onIoWrite?.bind(cpu) ?? (() => {});

cpu.onIoRead = (port, value) => {
  noteIo('R', port, value);
  originalOnIoRead(port, value);
};

cpu.onIoWrite = (port, value) => {
  noteIo('W', port, value);
  originalOnIoWrite(port, value);
};

console.log('Phase 346: boot trace after ALU fix + 0x000800 seed');
console.log('====================================================');
console.log(`Boot entry:               ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Seeded entry:             ${hex(SEEDED_ENTRY)}`);
console.log(`Former diversion point:   ${hex(FORMER_DIVERSION)}`);
console.log(`Previous terminus:        ${hex(PREVIOUS_TERMINUS)}`);
console.log(`Max steps:                ${formatCount(MAX_STEPS)}`);
console.log(`Max loop iterations:      ${formatCount(MAX_LOOP_ITERATIONS)}`);
console.log('Timer interrupt:          disabled');
console.log(
  `Transpiled ROM:           ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('Seed-path behavior:       every block from 0x000800 onward is emitted inline');

console.log('\nUnique block visits (first visit per pc:mode)');
console.log('---------------------------------------------');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const normalizedMode = mode ?? 'adl';
    const key = blockKey(pc, normalizedMode);

    currentStep = steps;
    currentPc = pc;
    currentMode = normalizedMode;

    if (!passedFormerDiversion && reachedFormerDiversion && steps > formerDiversionStep) {
      passedFormerDiversion = true;
      formerDiversionPassEvent = {
        step: steps,
        pc,
        mode: normalizedMode,
      };
      console.log(
        `  *** milestone: advanced beyond ${hex(FORMER_DIVERSION)} to ${hex(pc)}:${normalizedMode} at step ${formatCount(steps)} ***`,
      );
    }

    if (!reachedFormerDiversion && pc === FORMER_DIVERSION) {
      reachedFormerDiversion = true;
      formerDiversionStep = steps;
      console.log(
        `  *** milestone: reached former diversion point ${hex(FORMER_DIVERSION)}:${normalizedMode} at step ${formatCount(steps)} ***`,
      );
    }

    if (!uniqueBlocks.has(key)) {
      uniqueBlocks.set(key, {
        step: steps,
        pc,
        mode: normalizedMode,
      });
      uniqueAddresses.add(pc);
      console.log(
        `  [${String(uniqueBlocks.size).padStart(6, '0')}] step=${String(steps).padStart(7)} pc=${hex(pc)}:${normalizedMode}`,
      );
    }

    if (!reachedSeed && pc === SEEDED_ENTRY) {
      reachedSeed = true;
      seedFirstStep = steps;
      console.log(
        `  *** milestone: reached seeded block ${hex(SEEDED_ENTRY)}:${normalizedMode} at step ${formatCount(steps)} ***`,
      );
      console.log('\nSeed-path trace (every block from 0x000800 onward)');
      console.log('--------------------------------------------------');
    }

    if (reachedSeed) {
      seedTraceCount++;
      console.log(
        `  [seed ${String(seedTraceCount).padStart(6, '0')}] step=${String(steps).padStart(7)} pc=${hex(pc)}:${normalizedMode}`,
      );
    }

    if (previousTerminusVisit === null && pc === PREVIOUS_TERMINUS) {
      previousTerminusVisit = {
        step: steps,
        pc,
        mode: normalizedMode,
      };
      console.log(
        `  *** milestone: revisited previous terminus ${hex(PREVIOUS_TERMINUS)}:${normalizedMode} at step ${formatCount(steps)} ***`,
      );
    }
  },
  onMissingBlock(pc, mode, steps) {
    const event = {
      step: steps,
      pc: pc & 0xFFFFFF,
      mode: mode ?? 'adl',
    };

    if (firstMissingBlock === null) {
      firstMissingBlock = event;
    }

    if (missingBlockEvents.length < MISSING_BLOCK_SAMPLE_LIMIT) {
      missingBlockEvents.push(event);
    }
  },
  onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
    if (loopBreakEvents.length >= LOOP_BREAK_SAMPLE_LIMIT) {
      return;
    }

    loopBreakEvents.push({
      pc: pc & 0xFFFFFF,
      mode: mode ?? 'adl',
      loopHitCount,
      fallthroughTarget: fallthroughTarget === null || fallthroughTarget === undefined
        ? null
        : (fallthroughTarget & 0xFFFFFF),
    });
  },
});

const finalPc = run.lastPc & 0xFFFFFF;
const finalMode = run.lastMode ?? 'adl';
const missingBlocks = run.missingBlocks ?? [];
const blockVisits = run.blockVisits ?? {};
const totalUniqueBlocks = Object.keys(blockVisits).length;
const totalUniqueAddresses = uniqueAddresses.size;
const endedAtPreviousTerminus = run.termination === 'halt' && finalPc === PREVIOUS_TERMINUS;
const divergedFromPreviousTerminus = !endedAtPreviousTerminus;
const ioSummary = [...ioByPort.entries()]
  .sort((a, b) => {
    const countA = a[1].reads + a[1].writes;
    const countB = b[1].reads + b[1].writes;
    return countB - countA || a[0] - b[0];
  });

console.log('\n========== SUMMARY ==========');
console.log(`Steps executed:            ${formatCount(run.steps)}`);
console.log(`Unique blocks visited:     ${formatCount(totalUniqueBlocks)}`);
console.log(`Unique addresses visited:  ${formatCount(totalUniqueAddresses)}`);
console.log(`Seed-path entries:         ${formatCount(seedTraceCount)}`);
console.log(`Termination:               ${run.termination}`);
console.log(`Last PC:                   ${hex(finalPc)}:${finalMode}`);
console.log(`Loops forced:              ${formatCount(run.loopsForced)}`);
console.log(`Missing blocks recorded:   ${formatCount(missingBlocks.length)}`);
console.log(`Reached 0x000800:          ${reachedSeed ? 'yes' : 'no'}`);
console.log(`Passed 0x0008BB:           ${passedFormerDiversion ? 'yes' : 'no'}`);
console.log(`Still ends at 0x0019B5:    ${endedAtPreviousTerminus ? 'yes' : 'no'}`);
console.log(`Diverged from 0x0019B5:    ${divergedFromPreviousTerminus ? 'yes' : 'no'}`);

console.log('\nMilestones');
if (reachedSeed) {
  console.log(`  Reached seeded entry at step ${formatCount(seedFirstStep)}.`);
} else {
  console.log(`  Seeded entry ${hex(SEEDED_ENTRY)} was not reached.`);
}
if (formerDiversionPassEvent) {
  console.log(
    `  First block after ${hex(FORMER_DIVERSION)}: step=${formatCount(formerDiversionPassEvent.step)} pc=${hex(formerDiversionPassEvent.pc)}:${formerDiversionPassEvent.mode}`,
  );
} else if (reachedFormerDiversion) {
  console.log(`  Reached ${hex(FORMER_DIVERSION)} but did not advance beyond it before termination.`);
} else {
  console.log(`  Former diversion point ${hex(FORMER_DIVERSION)} was not reached.`);
}
if (previousTerminusVisit) {
  console.log(
    `  Revisited previous terminus at step ${formatCount(previousTerminusVisit.step)} (${hex(previousTerminusVisit.pc)}:${previousTerminusVisit.mode}).`,
  );
} else {
  console.log(`  Previous terminus ${hex(PREVIOUS_TERMINUS)} was not visited.`);
}

console.log('\nTermination detail');
if (run.termination === 'missing_block') {
  const missing = firstMissingBlock ?? {
    step: run.steps,
    pc: finalPc,
    mode: finalMode,
  };
  console.log(
    `  missing_block at step ${formatCount(missing.step)} -> ${hex(missing.pc)}:${missing.mode}`,
  );
} else if (run.termination === 'halt') {
  console.log(`  halt at ${hex(finalPc)}:${finalMode}`);
} else if (run.termination === 'max_steps') {
  console.log(
    `  max_steps exhausted at ${hex(finalPc)}:${finalMode} (probable long-running path or unresolved loop)`,
  );
} else if (run.termination === 'sleep') {
  console.log(`  sleep at ${hex(finalPc)}:${finalMode}`);
} else {
  console.log(`  ${run.termination} at ${hex(finalPc)}:${finalMode}`);
}

if (loopBreakEvents.length > 0) {
  console.log('\nLoop-break callbacks');
  for (const event of loopBreakEvents) {
    const target = event.fallthroughTarget === null ? 'carry-forced' : hex(event.fallthroughTarget);
    console.log(
      `  pc=${hex(event.pc)}:${event.mode} loopHits=${formatCount(event.loopHitCount)} breakTarget=${target}`,
    );
  }
}

if (missingBlockEvents.length > 0) {
  console.log('\nMissing-block callbacks');
  for (const event of missingBlockEvents) {
    console.log(
      `  step=${formatCount(event.step)} pc=${hex(event.pc)}:${event.mode}`,
    );
  }
}

console.log('\nExecution path from 0x000800 onward');
if (!reachedSeed) {
  console.log('  No path emitted because 0x000800 was never reached.');
} else {
  console.log(
    `  Full path emitted inline above (${formatCount(seedTraceCount)} block entries beginning at step ${formatCount(seedFirstStep)}).`,
  );
}

console.log('\nPort I/O summary');
if (ioSummary.length === 0) {
  console.log('  none');
} else {
  for (const [port, entry] of ioSummary) {
    console.log(
      `  ${hexPort(port)} reads=${formatCount(entry.reads)} writes=${formatCount(entry.writes)} readValues=${formatValueSet(entry.readValues)} writeValues=${formatValueSet(entry.writeValues)}`,
    );
  }
}

if (ioSamples.length > 0) {
  console.log(`\nPort I/O sample (first ${formatCount(ioSamples.length)})`);
  for (const entry of ioSamples) {
    console.log(
      `  step=${formatCount(entry.step)} pc=${hex(entry.pc)}:${entry.mode} ${entry.dir}${hexPort(entry.port)}=${hexByte(entry.value)}`,
    );
  }
}
