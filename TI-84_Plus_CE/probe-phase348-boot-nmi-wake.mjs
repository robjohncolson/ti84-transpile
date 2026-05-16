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

const HALT_STUB_ENTRY = 0x0019B5;
const NMI_HANDLER = 0x000066;
const FORWARD_PATH = 0x001AFA;

const MAX_STEPS = 50000;

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

let reachedHaltStub = false;
let haltStubStep = null;
let reachedNmiHandler = false;
let nmiHandlerStep = null;
let reachedForwardPath = false;
let forwardPathStep = null;
let furthestPc = 0;
let furthestPcStep = 0;
let nmiWakeEvent = null;

console.log('Phase 348: Boot NMI wake probe');
console.log('===============================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`HALT stub entry:     ${hex(HALT_STUB_ENTRY)}`);
console.log(`NMI handler:         ${hex(NMI_HANDLER)}`);
console.log(`Forward path target: ${hex(FORWARD_PATH)}`);
console.log(`Max steps:           ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:     disabled`);
console.log(`wakeFromHalt:        'nmi'`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: 50000,
  wakeFromHalt: 'nmi',
  onWake(haltPc, vectorPc, mode) {
    nmiWakeEvent = { haltPc, vectorPc, mode };
    console.log(`  *** NMI WAKE: HALT at ${hex(haltPc)} -> vector ${hex(vectorPc)}:${mode} ***`);
  },
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const normalizedMode = mode ?? 'adl';
    const key = blockKey(pc, normalizedMode);

    if (pc > furthestPc) {
      furthestPc = pc;
      furthestPcStep = steps;
    }

    if (!reachedHaltStub && pc === HALT_STUB_ENTRY) {
      reachedHaltStub = true;
      haltStubStep = steps;
      console.log(`  *** MILESTONE: reached HALT stub ${hex(HALT_STUB_ENTRY)} at step ${steps} ***`);
    }

    if (!reachedNmiHandler && pc === NMI_HANDLER) {
      reachedNmiHandler = true;
      nmiHandlerStep = steps;
      console.log(`  *** MILESTONE: reached NMI handler ${hex(NMI_HANDLER)} at step ${steps} ***`);
    }

    if (!reachedForwardPath && pc === FORWARD_PATH) {
      reachedForwardPath = true;
      forwardPathStep = steps;
      console.log(`  *** MILESTONE: reached forward path ${hex(FORWARD_PATH)} at step ${steps} ***`);
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

console.log('Milestone checks:');
console.log(`  HALT stub (${hex(HALT_STUB_ENTRY)}):    ${reachedHaltStub ? `YES at step ${haltStubStep}` : 'NO'}`);
console.log(`  NMI handler (${hex(NMI_HANDLER)}):  ${reachedNmiHandler ? `YES at step ${nmiHandlerStep}` : 'NO'}`);
console.log(`  Forward path (${hex(FORWARD_PATH)}): ${reachedForwardPath ? `YES at step ${forwardPathStep}` : 'NO'}`);
console.log('');

console.log(`Furthest PC reached: ${hex(furthestPc)} at step ${furthestPcStep}`);

if (nmiWakeEvent) {
  console.log(`\nNMI wake event:      HALT at ${hex(nmiWakeEvent.haltPc)} -> ${hex(nmiWakeEvent.vectorPc)}:${nmiWakeEvent.mode}`);
} else {
  console.log('\nNMI wake event:      NONE (HALT was never hit or wakeFromHalt did not fire)');
}

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
