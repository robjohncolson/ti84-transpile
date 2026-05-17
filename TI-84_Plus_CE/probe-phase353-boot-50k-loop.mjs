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
const MAX_STEPS = 50000;
const TOP_BLOCKS_LIMIT = 10;

const MILESTONE_STEPS = [1000, 5000, 10000, 20000, 30000, 40000, 50000];
const PC_CAPTURE_START = 9000;
const PC_CAPTURE_END = 9050;
const CYCLE_DETECT_START = 9000;
const CYCLE_DETECT_WINDOW = 200;

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

function sortBlocksByVisits(entries) {
  return [...entries].sort((a, b) => {
    if (b.visits !== a.visits) return b.visits - a.visits;
    if (a.pc !== b.pc) return a.pc - b.pc;
    return a.mode.localeCompare(b.mode);
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

// Port I/O tracking for cycle analysis (populated during second pass)
const cycleIoLog = [];

const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const uniqueBlocks = new Map();
const pcSequence = new Array(MAX_STEPS);
const milestoneCounts = new Map();
const missingBlockEvents = [];

let lastNewBlockStep = 0;
let currentStep = 0;

console.log('Phase 353: Extended boot trace (50K steps) with loop cycle analysis');
console.log('===================================================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps:           ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
console.log(`PLL delay:           2`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: 100000,
  wakeFromHalt: 'nmi',
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const normalizedMode = mode ?? 'adl';
    const key = blockKey(pc, normalizedMode);

    currentStep = steps;
    pcSequence[steps] = pc;

    // Record milestone counts
    if (MILESTONE_STEPS.includes(steps)) {
      milestoneCounts.set(steps, uniqueBlocks.size + (uniqueBlocks.has(key) ? 0 : 1));
    }

    if (!uniqueBlocks.has(key)) {
      uniqueBlocks.set(key, {
        key,
        pc,
        mode: normalizedMode,
        firstStep: steps,
        visits: 1,
      });
      lastNewBlockStep = steps;
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

const actualSteps = run.steps;

// --- Cycle detection from step 9000 ---

const segmentStart = CYCLE_DETECT_START;
const segmentEnd = Math.min(segmentStart + CYCLE_DETECT_WINDOW, actualSteps);
const segment = pcSequence.slice(segmentStart, segmentEnd);

let cycleLen = 0;
if (segment.length > 1) {
  for (let n = 1; n <= Math.floor(segment.length / 2); n++) {
    let match = true;
    for (let i = 0; i < n && i + n < segment.length; i++) {
      if (segment[i] !== segment[i + n]) { match = false; break; }
    }
    if (match) { cycleLen = n; break; }
  }
}

// --- Collect blocks in one cycle ---

const cycleBlocks = new Set();
if (cycleLen > 0) {
  for (let i = segmentStart; i < segmentStart + cycleLen && i < actualSteps; i++) {
    const pc = pcSequence[i];
    if (pc !== undefined) {
      cycleBlocks.add(pc);
    }
  }
}

// --- Second pass: capture port I/O for one cycle ---

if (cycleLen > 0) {
  const mem2 = new Uint8Array(MEM_SIZE);
  mem2.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

  const peripherals2 = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });
  let step2 = 0;

  const origRead2 = peripherals2.read.bind(peripherals2);
  const origWrite2 = peripherals2.write.bind(peripherals2);

  peripherals2.read = (port) => {
    const np = normalizePort(port);
    const v = normalizeValue(origRead2(np));
    if (step2 >= segmentStart && step2 < segmentStart + cycleLen) {
      cycleIoLog.push({ dir: 'IN', port: np, value: v, step: step2 });
    }
    return v;
  };

  peripherals2.write = (port, value) => {
    const np = normalizePort(port);
    const nv = normalizeValue(value);
    if (step2 >= segmentStart && step2 < segmentStart + cycleLen) {
      cycleIoLog.push({ dir: 'OUT', port: np, value: nv, step: step2 });
    }
    return origWrite2(np, nv);
  };

  const executor2 = createExecutor(PRELIFTED_BLOCKS, mem2, { peripherals: peripherals2 });

  executor2.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: segmentStart + cycleLen + 1,
    maxLoopIterations: 100000,
    wakeFromHalt: 'nmi',
    onBlock(_blockPc, _mode, _meta, steps) {
      step2 = steps;
    },
    onMissingBlock() {},
  });
}

// --- Results ---

const blockEntries = [...uniqueBlocks.values()];
const topVisitedBlocks = sortBlocksByVisits(blockEntries).slice(0, TOP_BLOCKS_LIMIT);

console.log('\n');
console.log('Results');
console.log('=======');
console.log(`Termination reason:  ${run.termination}`);
console.log(`Total steps:         ${actualSteps.toLocaleString()}`);
console.log(`Unique blocks:       ${uniqueBlocks.size}`);
console.log(`Last PC:             ${hex(run.lastPc)}:${run.lastMode ?? 'adl'}`);

// --- Milestone unique block counts ---

console.log('\nUnique blocks discovered over time:');
for (const step of MILESTONE_STEPS) {
  const count = milestoneCounts.get(step);
  if (count !== undefined) {
    console.log(`  step ${String(step).padStart(6)}: ${count} unique blocks`);
  } else if (step <= actualSteps) {
    console.log(`  step ${String(step).padStart(6)}: (not recorded)`);
  } else {
    console.log(`  step ${String(step).padStart(6)}: (not reached)`);
  }
}

// --- Last new block ---

console.log(`\nLast NEW unique block first seen at step: ${lastNewBlockStep}`);

// --- PC sequence at steps 9000-9050 ---

console.log(`\nPC sequence at steps ${PC_CAPTURE_START}-${PC_CAPTURE_END} (${PC_CAPTURE_END - PC_CAPTURE_START + 1} entries):`);
if (actualSteps <= PC_CAPTURE_START) {
  console.log('  (boot did not reach step 9000)');
} else {
  const captureEnd = Math.min(PC_CAPTURE_END + 1, actualSteps);
  for (let i = PC_CAPTURE_START; i < captureEnd; i++) {
    const pc = pcSequence[i];
    console.log(`  step ${String(i).padStart(6)}: ${pc !== undefined ? hex(pc) : 'n/a'}`);
  }
}

// --- Cycle detection results ---

console.log('\nCycle detection (from step 9000):');
if (actualSteps <= segmentStart) {
  console.log('  (boot did not reach step 9000)');
} else if (cycleLen === 0) {
  console.log('  No repeating cycle found in 200-step window');
} else {
  console.log(`  Cycle length: ${cycleLen} steps`);
  console.log(`  Blocks in one cycle (${cycleBlocks.size}):`);
  const sortedCycleBlocks = [...cycleBlocks].sort((a, b) => a - b);
  for (const pc of sortedCycleBlocks) {
    console.log(`    ${hex(pc)}`);
  }
}

// --- Top 10 most-visited blocks ---

console.log(`\nTop ${Math.min(TOP_BLOCKS_LIMIT, topVisitedBlocks.length)} most-visited blocks:`);
if (topVisitedBlocks.length === 0) {
  console.log('  none');
} else {
  for (const entry of topVisitedBlocks) {
    console.log(
      `  visits=${String(entry.visits).padStart(6)} firstStep=${String(entry.firstStep).padStart(6)} ${entry.key}`,
    );
  }
}

// --- Port I/O during one cycle ---

console.log('\nPort I/O during one cycle iteration:');
if (cycleLen === 0) {
  console.log('  (no cycle detected)');
} else if (cycleIoLog.length === 0) {
  console.log('  (no port I/O during cycle)');
} else {
  // Summarize by port
  const portSummary = new Map();
  for (const entry of cycleIoLog) {
    const key = `${entry.dir}:${entry.port}`;
    const existing = portSummary.get(key);
    if (existing) {
      existing.count++;
      existing.values.add(entry.value);
    } else {
      portSummary.set(key, {
        dir: entry.dir,
        port: entry.port,
        count: 1,
        values: new Set([entry.value]),
      });
    }
  }

  const sortedPortSummary = [...portSummary.values()].sort((a, b) => {
    if (a.port !== b.port) return a.port - b.port;
    return a.dir.localeCompare(b.dir);
  });

  console.log(`  Total I/O events in cycle: ${cycleIoLog.length}`);
  for (const entry of sortedPortSummary) {
    const valList = [...entry.values].sort((a, b) => a - b).map((v) => hex(v, 2)).join(', ');
    console.log(
      `  port=${hex(entry.port, 4)} dir=${entry.dir.padEnd(3)} count=${String(entry.count).padStart(3)} values=[${valList}]`,
    );
  }

  console.log('\n  Detailed I/O log for one cycle:');
  for (const entry of cycleIoLog) {
    console.log(
      `    step=${String(entry.step).padStart(6)} ${entry.dir.padEnd(3)} port=${hex(entry.port, 4)} value=${hex(entry.value, 2)}`,
    );
  }
}

// --- Missing blocks ---

if (missingBlockEvents.length > 0) {
  console.log(`\nMissing block terminations (${missingBlockEvents.length}):`);
  for (const evt of missingBlockEvents) {
    console.log(`  step=${String(evt.step).padStart(6)} pc=${hex(evt.pc)}:${evt.mode}`);
  }
} else {
  console.log('\nMissing block terminations: none');
}

console.log('\n--- probe complete ---');
