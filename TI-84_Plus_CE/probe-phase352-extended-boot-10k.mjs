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
const MAX_STEPS = 10000;
const LOOP_VISIT_THRESHOLD = 50;
const TOP_BLOCKS_LIMIT = 20;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
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

function normalizePort(port) {
  return Number(port) & 0xFFFF;
}

function normalizeValue(value) {
  return Number(value) & 0xFF;
}

function portAccessKey(dir, port) {
  return `${dir}:${normalizePort(port)}`;
}

function formatValueList(values) {
  if (!values || values.size === 0) {
    return 'none';
  }

  return [...values]
    .sort((a, b) => a - b)
    .map((value) => hex(value, 2))
    .join(', ');
}

function sortBlocksByVisits(entries) {
  return [...entries].sort((a, b) => {
    if (b.visits !== a.visits) return b.visits - a.visits;
    if (a.pc !== b.pc) return a.pc - b.pc;
    return a.mode.localeCompare(b.mode);
  });
}

function sortPortAccesses(entries) {
  const dirRank = { IN: 0, OUT: 1 };

  return [...entries].sort((a, b) => {
    if (a.port !== b.port) return a.port - b.port;
    if (dirRank[a.dir] !== dirRank[b.dir]) return dirRank[a.dir] - dirRank[b.dir];
    return a.dir.localeCompare(b.dir);
  });
}

// --- Main ---

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

const peripherals = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });
const ioLog = [];
const portAccesses = new Map();
let currentStep = 0;

function recordPortAccess(dir, port, value, step) {
  const normalizedPort = normalizePort(port);
  const normalizedValue = normalizeValue(value);
  const key = portAccessKey(dir, normalizedPort);
  const existing = portAccesses.get(key);

  if (existing) {
    existing.count++;
    existing.values.add(normalizedValue);
    if (dir === 'IN' && normalizedValue === 0xFF) {
      existing.ffReads++;
    }
    return;
  }

  portAccesses.set(key, {
    dir,
    port: normalizedPort,
    count: 1,
    ffReads: dir === 'IN' && normalizedValue === 0xFF ? 1 : 0,
    values: new Set([normalizedValue]),
  });
}

const originalRead = peripherals.read.bind(peripherals);
const originalWrite = peripherals.write.bind(peripherals);

peripherals.read = (port) => {
  const normalizedPort = normalizePort(port);
  const value = normalizeValue(originalRead(normalizedPort));
  ioLog.push({ dir: 'IN', port: normalizedPort, value, step: currentStep });
  recordPortAccess('IN', normalizedPort, value, currentStep);
  return value;
};

peripherals.write = (port, value) => {
  const normalizedPort = normalizePort(port);
  const normalizedValue = normalizeValue(value);
  ioLog.push({ dir: 'OUT', port: normalizedPort, value: normalizedValue, step: currentStep });
  recordPortAccess('OUT', normalizedPort, normalizedValue, currentStep);
  return originalWrite(normalizedPort, normalizedValue);
};

const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const uniqueBlocks = new Map();
const missingBlockEvents = [];

let furthestPc = 0;
let furthestPcStep = 0;

console.log('Phase 352: Extended boot trace (10K steps) with full I/O logging');
console.log('================================================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps:           ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
console.log(`PLL delay:           2`);
console.log(`Loop threshold:      > ${LOOP_VISIT_THRESHOLD} visits to same block`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: 50000,
  wakeFromHalt: 'nmi',
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const normalizedMode = mode ?? 'adl';
    const key = blockKey(pc, normalizedMode);

    currentStep = steps;

    if (pc > furthestPc) {
      furthestPc = pc;
      furthestPcStep = steps;
    }

    if (!uniqueBlocks.has(key)) {
      uniqueBlocks.set(key, {
        key,
        pc,
        mode: normalizedMode,
        firstStep: steps,
        visits: 1,
      });
      return;
    }

    uniqueBlocks.get(key).visits++;
  },
  onMissingBlock(pc, mode, steps) {
    missingBlockEvents.push({
      pc: pc & 0xFFFFFF,
      mode: mode ?? 'adl',
      step: steps,
    });
  },
});

const blockEntries = [...uniqueBlocks.values()];
const topVisitedBlocks = sortBlocksByVisits(blockEntries).slice(0, TOP_BLOCKS_LIMIT);
const likelyLoopBlocks = sortBlocksByVisits(blockEntries).filter(
  (entry) => entry.visits > LOOP_VISIT_THRESHOLD,
);
const portAccessEntries = sortPortAccesses([...portAccesses.values()]);
const repeatedFfReads = portAccessEntries.filter((entry) => entry.dir === 'IN' && entry.ffReads > 10);

// --- Results ---

console.log('\n');
console.log('Results');
console.log('=======');
console.log(`Termination reason:  ${run.termination}`);
console.log(`Total steps:         ${run.steps.toLocaleString()}`);
console.log(`Unique blocks:       ${uniqueBlocks.size}`);
console.log(`Last PC:             ${hex(run.lastPc)}:${run.lastMode ?? 'adl'}`);
console.log(`Furthest PC reached: ${hex(furthestPc)} at step ${furthestPcStep}`);

if (missingBlockEvents.length > 0) {
  console.log(`\nMissing block terminations (${missingBlockEvents.length}):`);
  for (const evt of missingBlockEvents) {
    console.log(`  step=${String(evt.step).padStart(6)} pc=${hex(evt.pc)}:${evt.mode}`);
  }
} else {
  console.log('\nMissing block terminations: none');
}

if (likelyLoopBlocks.length > 0) {
  console.log(`\nLikely stuck blocks (> ${LOOP_VISIT_THRESHOLD} visits):`);
  for (const entry of likelyLoopBlocks) {
    console.log(
      `  visits=${String(entry.visits).padStart(5)} firstStep=${String(entry.firstStep).padStart(6)} ${entry.key}`,
    );
  }
} else {
  console.log(`\nLikely stuck blocks (> ${LOOP_VISIT_THRESHOLD} visits): none`);
}

console.log(`\nTop ${Math.min(TOP_BLOCKS_LIMIT, topVisitedBlocks.length)} most-visited blocks:`);
if (topVisitedBlocks.length === 0) {
  console.log('  none');
} else {
  for (const entry of topVisitedBlocks) {
    const loopFlag = entry.visits > LOOP_VISIT_THRESHOLD ? ' LOOP?' : '';
    console.log(
      `  visits=${String(entry.visits).padStart(5)} firstStep=${String(entry.firstStep).padStart(6)} ${entry.key}${loopFlag}`,
    );
  }
}

console.log(`\nUnique port accesses (${portAccessEntries.length}):`);
if (portAccessEntries.length === 0) {
  console.log('  none');
} else {
  for (const entry of portAccessEntries) {
    const suffix = entry.dir === 'IN' ? ` ffReads=${entry.ffReads}` : '';
    console.log(
      `  port=${hex(entry.port, 4)} dir=${entry.dir.padEnd(3)} count=${String(entry.count).padStart(5)} values=[${formatValueList(entry.values)}]${suffix}`,
    );
  }
}

if (repeatedFfReads.length > 0) {
  console.log('\nPorts returning 0xFF more than 10 times:');
  for (const entry of repeatedFfReads) {
    console.log(
      `  port=${hex(entry.port, 4)} ffReads=${entry.ffReads} totalReads=${entry.count} values=[${formatValueList(entry.values)}]`,
    );
  }
} else {
  console.log('\nPorts returning 0xFF more than 10 times: none');
}

console.log(`\nFull I/O log (${ioLog.length} events):`);
if (ioLog.length === 0) {
  console.log('  none');
} else {
  for (const entry of ioLog) {
    console.log(
      `  step=${String(entry.step).padStart(6)} ${entry.dir.padEnd(3)} port=${hex(entry.port, 4)} value=${hex(entry.value, 2)}`,
    );
  }
}

console.log('\n--- probe complete ---');
