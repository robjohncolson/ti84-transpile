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

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  console.log('ROM.transpiled.js missing. Running transpiler...');
  execFileSync(process.execPath, [TRANSPILER_PATH], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error('Transpile failed');
  return true;
}

if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

// Match browser-shell.html config exactly
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const uniqueBlocks = new Set();
const missingBlocks = [];
let furthestPc = 0;
let furthestStep = 0;

console.log('Phase 352: Browser shell boot verification');
console.log('==========================================');
console.log('Config: boot 0x000000:z80, maxSteps=20000, timerInterrupt=false, pllDelay=2');
console.log('(Matches browser-shell.html configuration exactly)');
console.log('');

const run = executor.runFrom(0x000000, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 50000,
  wakeFromHalt: 'nmi',
  onBlock(blockPc, mode, _meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const key = `${pc.toString(16).padStart(6,'0')}:${mode ?? 'adl'}`;
    uniqueBlocks.add(key);
    if (pc > furthestPc) { furthestPc = pc; furthestStep = steps; }
  },
  onMissingBlock(pc, mode, steps) {
    missingBlocks.push({ pc, mode, step: steps });
  },
});

console.log('Results');
console.log('=======');
console.log(`Termination:     ${run.termination}`);
console.log(`Total steps:     ${run.steps.toLocaleString()}`);
console.log(`Unique blocks:   ${uniqueBlocks.size}`);
console.log(`Furthest PC:     ${hex(furthestPc)} at step ${furthestStep}`);
console.log(`Last PC:         ${hex(run.lastPc)}:${run.lastMode}`);
console.log('');

if (missingBlocks.length > 0) {
  console.log(`Missing blocks (${missingBlocks.length}):`);
  for (const mb of missingBlocks.slice(0, 10)) {
    console.log(`  step=${mb.step} pc=${hex(mb.pc)}:${mb.mode}`);
  }
} else {
  console.log('Missing blocks:  NONE (boot runs without gaps!)');
}

console.log('');
console.log('Comparison with 10K probe:');
console.log(`  10K steps → 270 unique blocks, no missing blocks`);
console.log(`  20K steps → ${uniqueBlocks.size} unique blocks, ${missingBlocks.length} missing blocks`);
console.log(`  Browser shell benefits from GPIO fix: ${missingBlocks.length === 0 ? 'YES' : 'NEEDS INVESTIGATION'}`);
console.log('');
console.log('--- probe complete ---');
