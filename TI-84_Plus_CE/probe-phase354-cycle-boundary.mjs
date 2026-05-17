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
const SKIP_STEPS = 5000;
const RECORD_STEPS = 5000;
const TOTAL_STEPS = SKIP_STEPS + RECORD_STEPS;
const MAX_LOOP_ITERATIONS = 100000;
const TRANSITION_PREVIEW = 8;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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

function createMemory(romBytes) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return memory;
}

function findLongestAdjacentRepeat(sequence) {
  const n = sequence.length;

  for (let length = Math.floor(n / 2); length >= 2; length--) {
    let run = 0;

    for (let i = 0; i + length < n; i++) {
      if (sequence[i] === sequence[i + length]) {
        run++;
        if (run >= length) {
          return {
            start: i - length + 1,
            length,
          };
        }
      } else {
        run = 0;
      }
    }
  }

  return null;
}

function rotateSequence(sequence, startIndex) {
  if (startIndex === 0) {
    return [...sequence];
  }

  return sequence.slice(startIndex).concat(sequence.slice(0, startIndex));
}

function chooseBoundaryStart(cycleSequence) {
  let best = null;

  for (let i = 0; i < cycleSequence.length; i++) {
    const current = cycleSequence[i];
    const next = cycleSequence[(i + 1) % cycleSequence.length];
    const drop = current - next;

    if (drop <= 0) {
      continue;
    }

    if (
      !best
      || drop > best.drop
      || (drop === best.drop && next < best.firstBlock)
      || (drop === best.drop && next === best.firstBlock && i < best.lastIndex)
    ) {
      best = {
        reason: 'largest backward PC transition inside the repeated period',
        drop,
        lastIndex: i,
        startIndex: (i + 1) % cycleSequence.length,
        lastBlock: current,
        firstBlock: next,
      };
    }
  }

  if (best) {
    return best;
  }

  let startIndex = 0;
  for (let i = 1; i < cycleSequence.length; i++) {
    if (cycleSequence[i] < cycleSequence[startIndex]) {
      startIndex = i;
    }
  }

  const lastIndex = (startIndex - 1 + cycleSequence.length) % cycleSequence.length;
  return {
    reason: 'lowest block address in cycle (fallback)',
    drop: cycleSequence[lastIndex] - cycleSequence[startIndex],
    lastIndex,
    startIndex,
    lastBlock: cycleSequence[lastIndex],
    firstBlock: cycleSequence[startIndex],
  };
}

function collectOrderedUnique(sequence) {
  const seen = new Set();
  const ordered = [];

  for (const pc of sequence) {
    if (seen.has(pc)) {
      continue;
    }
    seen.add(pc);
    ordered.push(pc);
  }

  return ordered;
}

function formatSequence(sequence) {
  return sequence.map((pc) => hex(pc)).join(', ');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const memory = createMemory(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });
const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });

const stepPcSequence = new Array(TOTAL_STEPS);
const missingBlockEvents = [];

console.log('Phase 354: Trace cycle boundary');
console.log('================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Skip steps:          ${SKIP_STEPS.toLocaleString()}`);
console.log(`Record steps:        ${RECORD_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
console.log(`PLL delay:           2`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: TOTAL_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  wakeFromHalt: 'nmi',
  onBlock(blockPc, _mode, _meta, steps) {
    if (steps < TOTAL_STEPS) {
      stepPcSequence[steps] = blockPc & 0xFFFFFF;
    }
  },
  onMissingBlock(pc, mode, steps) {
    missingBlockEvents.push({
      pc: pc & 0xFFFFFF,
      mode: mode ?? 'adl',
      step: steps,
    });
  },
});

const capturedSteps = Math.min(run.steps, TOTAL_STEPS);
const recordStart = Math.min(SKIP_STEPS, capturedSteps);
const recordEnd = Math.min(SKIP_STEPS + RECORD_STEPS, capturedSteps);
const recordedSequence = stepPcSequence.slice(recordStart, recordEnd);

console.log('Results');
console.log('=======');
console.log(`Termination reason:  ${run.termination}`);
console.log(`Total steps:         ${capturedSteps.toLocaleString()}`);
console.log(`Recorded window:     steps ${recordStart}..${Math.max(recordStart, recordEnd - 1)}`);
console.log(`Missing blocks:      ${missingBlockEvents.length}`);

if (recordedSequence.length < 4) {
  console.log('');
  console.log('Not enough captured steps after the skip window to detect a cycle.');
  process.exit(1);
}

const repeat = findLongestAdjacentRepeat(recordedSequence);

if (!repeat) {
  console.log('');
  console.log('No adjacent repeated block sequence found in the recorded window.');
  process.exit(1);
}

const rawCycle = recordedSequence.slice(repeat.start, repeat.start + repeat.length);
const boundary = chooseBoundaryStart(rawCycle);
const canonicalCycle = rotateSequence(rawCycle, boundary.startIndex);
const uniqueCycleBlocks = collectOrderedUnique(canonicalCycle);
const boundaryRecordOffset = repeat.start + boundary.startIndex;
const boundaryAbsoluteStep = recordStart + boundaryRecordOffset;
const lastCycleStep = boundaryAbsoluteStep + canonicalCycle.length - 1;
const nextCycleStartStep = boundaryAbsoluteStep + canonicalCycle.length;
const tailPreview = canonicalCycle.slice(-Math.min(TRANSITION_PREVIEW, canonicalCycle.length));
const headPreview = canonicalCycle.slice(0, Math.min(TRANSITION_PREVIEW, canonicalCycle.length));

console.log('');
console.log('Cycle detection');
console.log('---------------');
console.log(`Detected repeated window: recorded offsets ${repeat.start} and ${repeat.start + repeat.length}`);
console.log(`Cycle length:           ${repeat.length} steps`);
console.log(`Boundary normalization: ${boundary.reason}`);
console.log(`Backward drop:          ${boundary.drop > 0 ? hex(boundary.drop) : 'n/a'}`);
console.log(`Cycle N start step:     ${boundaryAbsoluteStep}`);
console.log(`Cycle N end step:       ${lastCycleStep}`);
console.log(`Cycle N+1 start step:   ${nextCycleStartStep}`);
console.log(`LAST block of cycle N:  ${hex(canonicalCycle[canonicalCycle.length - 1])}`);
console.log(`FIRST block of cycle N+1: ${hex(canonicalCycle[0])}`);

console.log('');
console.log('Transition point');
console.log('----------------');
console.log(`Cycle N tail (${tailPreview.length}):  ${formatSequence(tailPreview)}`);
console.log(`Cycle N+1 head (${headPreview.length}): ${formatSequence(headPreview)}`);

console.log('');
console.log(`Canonical cycle trace (${canonicalCycle.length} steps)`);
console.log('-----------------------------------------');
for (let i = 0; i < canonicalCycle.length; i++) {
  console.log(
    `  [${String(i).padStart(4)} | step ${String(boundaryAbsoluteStep + i).padStart(5)}] ${hex(canonicalCycle[i])}`,
  );
}

console.log('');
console.log(`Unique blocks in canonical cycle (${uniqueCycleBlocks.length})`);
console.log('--------------------------------------');
for (let i = 0; i < uniqueCycleBlocks.length; i++) {
  console.log(`  [${String(i).padStart(3)}] ${hex(uniqueCycleBlocks[i])}`);
}

if (missingBlockEvents.length > 0) {
  console.log('');
  console.log('Missing block events');
  console.log('--------------------');
  for (const evt of missingBlockEvents) {
    console.log(`  step=${String(evt.step).padStart(5)} pc=${hex(evt.pc)}:${evt.mode}`);
  }
}

console.log('');
console.log('--- probe complete ---');
