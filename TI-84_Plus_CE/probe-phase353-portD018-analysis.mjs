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
const MAX_STEPS = 5000;
const TARGET_PORT = 0xD018;

const TEST_VALUES = [
  { label: '0xFF (default/no handler)', value: 0xFF },
  { label: '0x00 (all bits clear)',     value: 0x00 },
  { label: '0x04 (BIT 4 clear path)',   value: 0x04 },
  { label: '0x80 (high bit set)',       value: 0x80 },
];

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

// --- Main ---

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 353: Port 0xD018 read-value analysis');
console.log('==========================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps:           ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
console.log(`PLL delay:           2`);
console.log(`Target port:         ${hex(TARGET_PORT, 4)}`);
console.log(`Test values:         ${TEST_VALUES.map((t) => t.label).join(', ')}`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const results = [];

for (const testConfig of TEST_VALUES) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

  const peripherals = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });

  // Register custom handler for port 0xD018
  peripherals.register(TARGET_PORT, {
    read() {
      return testConfig.value;
    },
    write(port, value) {
      // Accept writes silently — don't break LCD SPI commands
    },
  });

  // Intercept reads to log which PCs trigger port 0xD018 reads
  const origRead = peripherals.read.bind(peripherals);
  const portReads = [];
  let currentStep = 0;

  peripherals.read = function (port) {
    const val = origRead(port);
    if ((port & 0xFFFF) === TARGET_PORT) {
      portReads.push({ step: currentStep, pc: null, value: val });
    }
    return val;
  };

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  const uniqueBlocks = new Map();
  const missingBlockEvents = [];
  let furthestPc = 0;
  let furthestPcStep = 0;
  let lastBlockPc = 0;

  const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS,
    maxLoopIterations: 50000,
    wakeFromHalt: 'nmi',
    onBlock(blockPc, mode, _meta, steps) {
      const pc = blockPc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(pc, normalizedMode);

      currentStep = steps;
      lastBlockPc = pc;

      if (pc > furthestPc) {
        furthestPc = pc;
        furthestPcStep = steps;
      }

      // Tag any pending portReads with this block's PC
      for (const entry of portReads) {
        if (entry.pc === null) {
          entry.pc = pc;
        }
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

  results.push({
    label: testConfig.label,
    returnValue: testConfig.value,
    termination: run.termination,
    steps: run.steps,
    uniqueBlocks: uniqueBlocks.size,
    lastPc: run.lastPc,
    lastMode: run.lastMode ?? 'adl',
    furthestPc,
    furthestPcStep,
    missingBlocks: missingBlockEvents.length,
    portReads,
    missingBlockEvents,
  });
}

// --- Results ---

console.log('Comparison Table');
console.log('================');
console.log(
  'Return Value'.padEnd(30) +
  'Unique Blocks'.padEnd(16) +
  'Steps'.padEnd(10) +
  'Furthest PC'.padEnd(16) +
  'Last PC'.padEnd(16) +
  'D018 Reads'.padEnd(12) +
  'Termination',
);
console.log('-'.repeat(110));

for (const r of results) {
  console.log(
    r.label.padEnd(30) +
    String(r.uniqueBlocks).padEnd(16) +
    String(r.steps).padEnd(10) +
    hex(r.furthestPc).padEnd(16) +
    `${hex(r.lastPc)}:${r.lastMode}`.padEnd(16) +
    String(r.portReads.length).padEnd(12) +
    r.termination,
  );
}

// Highlight best performer
const sorted = [...results].sort((a, b) => b.uniqueBlocks - a.uniqueBlocks);
const best = sorted[0];
const worst = sorted[sorted.length - 1];

console.log('');
if (best.uniqueBlocks > worst.uniqueBlocks) {
  console.log(
    `FINDING: Best coverage = ${best.label} (${best.uniqueBlocks} blocks) vs worst = ${worst.label} (${worst.uniqueBlocks} blocks). Delta = ${best.uniqueBlocks - worst.uniqueBlocks} blocks.`,
  );
} else {
  console.log(
    `FINDING: All test values produce the same unique block count (${best.uniqueBlocks}). Port 0xD018 read value does NOT gate boot progress at ${MAX_STEPS} steps.`,
  );
}

// Detailed per-config read logs
console.log('\n');
console.log('Port 0xD018 Read Events (per configuration)');
console.log('============================================');

for (const r of results) {
  console.log(`\n--- ${r.label} (${r.portReads.length} reads) ---`);

  if (r.portReads.length === 0) {
    console.log('  no reads');
    continue;
  }

  for (const evt of r.portReads) {
    console.log(
      `  step=${String(evt.step).padStart(6)} pc=${hex(evt.pc)} value=${hex(evt.value, 2)}`,
    );
  }

  // Summarize unique PCs that trigger reads
  const uniquePcs = new Set(r.portReads.map((e) => e.pc));
  console.log(`  Unique PCs triggering reads: ${[...uniquePcs].map((pc) => hex(pc)).join(', ')}`);
}

// Missing block details
const anyMissing = results.some((r) => r.missingBlocks > 0);
if (anyMissing) {
  console.log('\n');
  console.log('Missing Block Events');
  console.log('====================');
  for (const r of results) {
    if (r.missingBlockEvents.length === 0) continue;
    console.log(`\n--- ${r.label} (${r.missingBlockEvents.length} missing) ---`);
    for (const evt of r.missingBlockEvents) {
      console.log(`  step=${String(evt.step).padStart(6)} pc=${hex(evt.pc)}:${evt.mode}`);
    }
  }
}

console.log('\n--- probe complete ---');
