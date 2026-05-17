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

const PLL_GATE_PC = 0x005998;
const MAX_STEPS = 10000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
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

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const uniqueBlocks = new Map();
const missingBlockEvents = [];

let passedPllGate = false;
let pllGateStep = null;
let furthestPc = 0;
let furthestPcStep = 0;

console.log('Phase 349: PLL fix verification probe');
console.log('======================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`PLL gate PC:         ${hex(PLL_GATE_PC)}`);
console.log(`Max steps:           ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
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

    if (pc > furthestPc) {
      furthestPc = pc;
      furthestPcStep = steps;
    }

    if (!passedPllGate && pc > PLL_GATE_PC) {
      passedPllGate = true;
      pllGateStep = steps;
      console.log(`  *** MILESTONE: passed PLL gate (${hex(PLL_GATE_PC)}) at step ${steps}, pc=${hex(pc)} ***`);
    }

    if (!uniqueBlocks.has(key)) {
      uniqueBlocks.set(key, { step: steps, pc, mode: normalizedMode });
    }
  },
  onMissingBlock(pc, mode, steps) {
    missingBlockEvents.push({ pc, mode, step: steps });
  },
});

// --- Results ---

console.log('\n');
console.log('Results');
console.log('=======');
console.log(`Termination:         ${run.termination}`);
console.log(`Total steps:         ${run.steps.toLocaleString()}`);
console.log(`Unique blocks:       ${uniqueBlocks.size}`);
console.log(`Last PC:             ${hex(run.lastPc)}:${run.lastMode}`);
console.log('');

console.log(`Passed PLL gate (>${hex(PLL_GATE_PC)}): ${passedPllGate ? `YES at step ${pllGateStep}` : 'NO'}`);
console.log(`Furthest PC reached: ${hex(furthestPc)} at step ${furthestPcStep}`);

if (missingBlockEvents.length > 0) {
  console.log(`\nMissing block terminations (${missingBlockEvents.length}):`);
  for (const evt of missingBlockEvents.slice(0, 20)) {
    console.log(`  step=${evt.step} pc=${hex(evt.pc)}:${evt.mode}`);
  }
  if (missingBlockEvents.length > 20) {
    console.log(`  ... and ${missingBlockEvents.length - 20} more`);
  }
} else {
  console.log('\nMissing blocks:      none');
}

console.log('\nFirst 50 unique block visits:');
console.log('-----------------------------');
let count = 0;
for (const [key, info] of uniqueBlocks) {
  if (count >= 50) break;
  console.log(`  [${String(count + 1).padStart(3)}] step=${String(info.step).padStart(6)} ${key}`);
  count++;
}

if (uniqueBlocks.size > 50) {
  console.log(`  ... and ${uniqueBlocks.size - 50} more unique blocks`);
}

console.log('\n--- probe complete ---');
