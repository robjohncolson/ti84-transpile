#!/usr/bin/env node

/**
 * Phase 361: New Seeds Probe (0x0086B0 and 0x0000FA)
 *
 * Session 360 boot reached 323 unique blocks before terminating at:
 *   - 0x0086B0:adl
 *   - 0x0000FA:adl
 *   - 0xA86301:adl
 *
 * This probe checks whether the two new ROM seeds are present and hit during
 * boot, whether boot progresses beyond the session 360 baseline, and whether
 * the missing-block terminator changes. RAM trampoline fallback for copied RAM
 * code is provided by cpu-runtime.js's runFrom().
 */

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
const BOOT_MAX_STEPS = 50000;
const MAX_LOOP_ITERATIONS = 50000;

const SESSION_360_BASELINE = 323;
const NEW_SEEDS = [0x0086B0, 0x0000FA];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

const SESSION_360_MISSING_TERMINATORS = new Set([
  blockKey(0x0086B0, 'adl'),
  blockKey(0x0000FA, 'adl'),
  blockKey(0xA86301, 'adl'),
]);

function addressSpace(pc) {
  if (pc >= 0xD00000) {
    return 'RAM';
  }
  if (pc < 0x400000) {
    return 'ROM';
  }
  return 'FLASH';
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function collapseMissingBlocks(missingBlocks) {
  const collapsed = new Map();

  for (const block of missingBlocks) {
    const key = blockKey(block.pc, block.mode);
    const existing = collapsed.get(key);
    if (existing) {
      existing.hits++;
      continue;
    }
    collapsed.set(key, { ...block, hits: 1 });
  }

  return [...collapsed.values()];
}

let cpuRuntimeModule;
let peripheralsModule;

function runBoot(PRELIFTED_BLOCKS, romBytes) {
  console.log('=== BOOT (built-in RAM trampoline) ===');
  console.log('');

  const { createExecutor } = cpuRuntimeModule;
  const { createPeripheralBus } = peripheralsModule;

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const uniqueBlocks = new Set();
  const missingBlocks = [];
  const blockHistory = [];

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      uniqueBlocks.add(blockKey(normalizedPc, normalizedMode));
      blockHistory.push({ step: step + 1, pc: normalizedPc, mode: normalizedMode });
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({
        step: step + 1,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  const uniqueMissingBlocks = collapseMissingBlocks(missingBlocks);
  const terminalMissingKey = result.termination === 'missing_block'
    ? blockKey(result.lastPc, result.lastMode ?? 'adl')
    : null;
  const terminalMissingIsNew = terminalMissingKey !== null
    && !SESSION_360_MISSING_TERMINATORS.has(terminalMissingKey);

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:       ${result.termination}`);
  console.log(`  steps:             ${result.steps}`);
  console.log(`  unique blocks:     ${uniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  if (uniqueMissingBlocks.length > 0) {
    console.log(`Missing blocks (${uniqueMissingBlocks.length} unique):`);
    for (const mb of uniqueMissingBlocks) {
      console.log(
        `  first_step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  ${addressSpace(mb.pc)}  hits=${mb.hits}`,
      );
    }
    console.log('');
  }

  const last20 = blockHistory.slice(-20);
  if (last20.length > 0) {
    console.log('Last 20 blocks before termination:');
    for (const entry of last20) {
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}`);
    }
    console.log('');
  }

  console.log('Missing-block terminator comparison:');
  if (terminalMissingKey === null) {
    console.log('  boot did not terminate on missing_block');
  } else if (terminalMissingIsNew) {
    console.log(`  NEW terminator vs session 360: ${terminalMissingKey}`);
  } else {
    console.log(`  known session 360 terminator:  ${terminalMissingKey}`);
  }
  console.log('');

  return {
    result,
    uniqueBlocks,
    uniqueMissingBlocks,
    terminalMissingKey,
    terminalMissingIsNew,
  };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  cpuRuntimeModule = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  peripheralsModule = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const seedPresence = NEW_SEEDS.map((seed) => ({
    seed,
    present: Boolean(PRELIFTED_BLOCKS[blockKey(seed, 'adl')]),
  }));

  console.log('Phase 361: New Seeds Probe (0x0086B0 and 0x0000FA)');
  console.log('===================================================');
  console.log(`ROM:                  ${ROM_PATH}`);
  console.log(`Transpiled ROM:       ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Total blocks:         ${Object.keys(PRELIFTED_BLOCKS).length}`);
  for (const { seed, present } of seedPresence) {
    console.log(`Seed ${hex(seed)}:          ${present ? 'PRESENT' : 'MISSING'}`);
  }
  console.log(`Session 360 baseline: ${SESSION_360_BASELINE} unique blocks`);
  console.log('');

  const boot = runBoot(PRELIFTED_BLOCKS, romBytes);
  const delta = boot.uniqueBlocks.size - SESSION_360_BASELINE;

  console.log('Comparison');
  console.log('----------');
  console.log(`  session 360 baseline:       ${SESSION_360_BASELINE} unique blocks`);
  console.log(`  phase 361 unique blocks:    ${boot.uniqueBlocks.size}`);
  console.log(`  delta vs session 360:       ${delta >= 0 ? '+' : ''}${delta}`);
  console.log('');

  console.log('New seed usage:');
  for (const seed of NEW_SEEDS) {
    console.log(`  ${hex(seed)} hit during boot:  ${boot.uniqueBlocks.has(blockKey(seed, 'adl')) ? 'YES' : 'NO'}`);
  }
  console.log('');

  if (boot.terminalMissingKey !== null) {
    console.log('Terminating missing block:');
    console.log(`  ${boot.terminalMissingKey}`);
    console.log('');
  }

  console.log(
    `Result: ${boot.uniqueBlocks.size > SESSION_360_BASELINE
      ? 'IMPROVED - boot progressed beyond 323 blocks'
      : 'NO IMPROVEMENT - boot did not exceed 323 blocks'}`,
  );
  console.log('');
  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
