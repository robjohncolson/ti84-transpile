#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const TARGET_PC = 0x009006;
const TARGET_MODE = 'z80';

const RUN_MAX_STEPS = 2000000;
const RUN_MAX_LOOP_ITERATIONS = 500000;
const TRACE_TAIL = 20;

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

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const traceTail = [];
let traceEntries = 0;
let targetFirstTraceStep = null;
let targetLastTraceStep = null;
let postTargetFirstStep = null;
let firstMissingBlock = null;
let targetSeen = false;

console.log('Phase 342: kernel init z80 seed follow-up');
console.log('=========================================');
console.log(`Boot entry:             ${hex(BOOT_ENTRY)}`);
console.log(`Target block:           ${hex(TARGET_PC)}:${TARGET_MODE}`);
console.log(`Run max steps:          ${formatCount(RUN_MAX_STEPS)}`);
console.log(`Timer interrupt:        disabled`);

const run = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: RUN_MAX_STEPS,
  maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const currentMode = mode ?? 'adl';
    traceEntries++;
    traceTail.push({ step: steps, pc, mode: currentMode });
    if (traceTail.length > TRACE_TAIL) {
      traceTail.shift();
    }

    if (pc === TARGET_PC && currentMode === TARGET_MODE) {
      if (targetFirstTraceStep === null) {
        targetFirstTraceStep = steps;
      }
      targetLastTraceStep = steps;
      targetSeen = true;
      return;
    }

    if (targetSeen && postTargetFirstStep === null) {
      postTargetFirstStep = steps;
    }
  },
  onMissingBlock(pc, mode, steps) {
    if (firstMissingBlock === null) {
      firstMissingBlock = {
        step: steps,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      };
    }
  },
});

const targetKey = blockKey(TARGET_PC, TARGET_MODE);
const blockVisits = run.blockVisits ?? {};
const missingBlocks = run.missingBlocks ?? [];
const targetVisitCount = blockVisits[targetKey] ?? 0;
const uniqueBlockCount = Object.keys(blockVisits).length;
const targetVisited = targetVisitCount > 0;
const targetMissing = missingBlocks.includes(targetKey);
const passedTarget = targetVisited && !targetMissing;

console.log('\nExecution summary');
console.log(`  steps=${formatCount(run.steps)}`);
console.log(`  traced block entries=${formatCount(traceEntries)}`);
console.log(`  unique blocks=${formatCount(uniqueBlockCount)}`);
console.log(`  termination=${run.termination}`);
console.log(`  lastPc=${hex(run.lastPc)}:${run.lastMode}`);
console.log(`  loopsForced=${formatCount(run.loopsForced)}`);
console.log(`  missingBlocks=${formatCount(missingBlocks.length)}`);

console.log('\nTarget check');
console.log(`  visited ${hex(TARGET_PC)}:${TARGET_MODE} = ${targetVisited ? 'yes' : 'no'}`);
console.log(`  target visit count = ${formatCount(targetVisitCount)}`);
console.log(`  target present in missingBlocks = ${targetMissing ? 'yes' : 'no'}`);
console.log(`  first target trace step = ${targetFirstTraceStep === null ? 'n/a' : formatCount(targetFirstTraceStep)}`);
console.log(`  last target trace step = ${targetLastTraceStep === null ? 'n/a' : formatCount(targetLastTraceStep)}`);
console.log(`  first post-target step = ${postTargetFirstStep === null ? 'n/a' : formatCount(postTargetFirstStep)}`);
console.log(`  passed through target = ${passedTarget ? 'yes' : 'no'}`);

if (firstMissingBlock) {
  console.log('\nFirst missing block callback');
  console.log(
    `  step=${formatCount(firstMissingBlock.step)} pc=${hex(firstMissingBlock.pc)}:${firstMissingBlock.mode}`,
  );
}

if (missingBlocks.length) {
  console.log('\nRecorded missing blocks');
  for (const entry of missingBlocks.slice(0, 10)) {
    console.log(`  ${entry}`);
  }
}

console.log(`\nLast ${Math.min(TRACE_TAIL, traceTail.length)} traced blocks`);
for (const entry of traceTail) {
  console.log(`  step=${String(entry.step).padStart(7)} pc=${hex(entry.pc)}:${entry.mode}`);
}

if (targetMissing) {
  console.error(`\nFailure: ${hex(TARGET_PC)}:${TARGET_MODE} is still recorded as a missing block.`);
  process.exitCode = 1;
} else if (!targetVisited) {
  console.error(
    `\nFailure: execution did not visit ${hex(TARGET_PC)}:${TARGET_MODE} within ${formatCount(RUN_MAX_STEPS)} steps.`,
  );
  process.exitCode = 1;
}
