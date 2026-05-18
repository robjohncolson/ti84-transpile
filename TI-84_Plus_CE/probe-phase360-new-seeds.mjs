#!/usr/bin/env node

/**
 * Phase 360: New Seeds Probe (0x00868E and 0x0088DD)
 *
 * After session 359's RAM trampoline bypassed flash self-test at 0xD18C22,
 * boot terminated at missing_block for two ROM addresses: 0x00868E and 0x0088DD.
 * This probe tests whether adding seeds for those addresses (now in phase200-seeds.txt)
 * lets boot progress beyond the previous 318-block ceiling.
 *
 * Structure: baseline boot (no trampoline) + trampoline boot (with RAM fallback).
 * Compares against the session 359 baseline of 318 unique blocks.
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

const RAM_TRAMPOLINE_PC = 0xD18C22;
const RAM_THRESHOLD = 0xD00000;

const SESSION_359_BASELINE = 318; // unique blocks from session 359

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
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

// Shared module references, set once in main()
let cpuRuntimeModule;
let peripheralsModule;

function runBoot(label, PRELIFTED_BLOCKS, romBytes, { injectTrampolines = false } = {}) {
  console.log(`=== ${label} ===`);
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

  const trampolineTargets = new Set();

  function injectRamTrampoline(targetPc) {
    const key = blockKey(targetPc, 'adl');
    if (executor.compiledBlocks[key]) {
      return;
    }
    trampolineTargets.add(targetPc);
    executor.compiledBlocks[key] = (cpu) => {
      const mem = cpu.mem;
      const sp = cpu.sp & 0xFFFFFF;
      const retAddr = mem[sp] | (mem[sp + 1] << 8) | (mem[sp + 2] << 16);
      cpu.sp = (sp + 3) & 0xFFFFFF;
      return retAddr;
    };
  }

  if (injectTrampolines) {
    // Pre-inject known RAM trampoline target as fallback
    injectRamTrampoline(RAM_TRAMPOLINE_PC);
  }

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
      const normalizedPc = pc & 0xFFFFFF;
      missingBlocks.push({
        step: step + 1,
        pc: normalizedPc,
        mode: mode ?? 'adl',
      });

      // Dynamically inject RAM trampolines
      if (injectTrampolines && normalizedPc >= RAM_THRESHOLD) {
        injectRamTrampoline(normalizedPc);
      }
    },
  });

  // Summary
  console.log(`${label} summary`);
  console.log('-'.repeat(label.length + 8));
  console.log(`  termination:       ${result.termination}`);
  console.log(`  steps:             ${result.steps}`);
  console.log(`  unique blocks:     ${uniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  // Missing blocks
  if (missingBlocks.length > 0) {
    console.log(`Missing blocks (${missingBlocks.length}):`);
    for (const mb of missingBlocks) {
      const isRam = mb.pc >= RAM_THRESHOLD;
      console.log(`  step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  ${isRam ? '(RAM)' : '(ROM)'}`);
    }
    console.log('');
  }

  // Last 20 blocks before termination
  const last20 = blockHistory.slice(-20);
  if (last20.length > 0) {
    console.log('Last 20 blocks before termination:');
    for (const entry of last20) {
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}`);
    }
    console.log('');
  }

  if (injectTrampolines && trampolineTargets.size > 0) {
    console.log('RAM trampolines injected:');
    for (const target of [...trampolineTargets].sort((a, b) => a - b)) {
      console.log(`  ${hex(target)}`);
    }
    console.log('');
  }

  return { result, uniqueBlocks, missingBlocks };
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

  // Check that new seed blocks exist
  const seed868E = PRELIFTED_BLOCKS[blockKey(0x00868E, 'adl')];
  const seed88DD = PRELIFTED_BLOCKS[blockKey(0x0088DD, 'adl')];
  console.log('Phase 360: New Seeds Probe (0x00868E and 0x0088DD)');
  console.log('===================================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Total blocks:        ${Object.keys(PRELIFTED_BLOCKS).length}`);
  console.log(`Seed 0x00868E:       ${seed868E ? 'PRESENT' : 'MISSING'}`);
  console.log(`Seed 0x0088DD:       ${seed88DD ? 'PRESENT' : 'MISSING'}`);
  console.log(`Session 359 baseline: ${SESSION_359_BASELINE} unique blocks`);
  console.log('');

  // --- Baseline boot (no trampoline) ---
  const baseline = runBoot('BASELINE BOOT (no trampoline)', PRELIFTED_BLOCKS, romBytes);

  // --- Trampoline boot ---
  const trampoline = runBoot('TRAMPOLINE BOOT (with RAM fallback)', PRELIFTED_BLOCKS, romBytes, {
    injectTrampolines: true,
  });

  // --- Comparison ---
  console.log('Comparison');
  console.log('----------');
  console.log(`  session 359 baseline:       ${SESSION_359_BASELINE} unique blocks`);
  console.log(`  baseline unique blocks:     ${baseline.uniqueBlocks.size}`);
  console.log(`  trampoline unique blocks:   ${trampoline.uniqueBlocks.size}`);
  console.log(`  delta vs session 359:       ${trampoline.uniqueBlocks.size > SESSION_359_BASELINE ? '+' : ''}${trampoline.uniqueBlocks.size - SESSION_359_BASELINE}`);
  console.log(`  baseline termination:       ${baseline.result.termination} at ${hex(baseline.result.lastPc)}`);
  console.log(`  trampoline termination:     ${trampoline.result.termination} at ${hex(trampoline.result.lastPc)}`);
  console.log('');

  // New blocks in trampoline vs baseline
  const newBlocks = [...trampoline.uniqueBlocks].filter(k => !baseline.uniqueBlocks.has(k));
  if (newBlocks.length > 0) {
    console.log(`New blocks in trampoline vs baseline (${newBlocks.length}, showing first 30):`);
    for (const key of newBlocks.slice(0, 30)) {
      console.log(`  ${key}`);
    }
    if (newBlocks.length > 30) {
      console.log(`  ... and ${newBlocks.length - 30} more`);
    }
    console.log('');
  }

  // Check if new seeds were actually hit
  const hitSeed868E = trampoline.uniqueBlocks.has(blockKey(0x00868E, 'adl'));
  const hitSeed88DD = trampoline.uniqueBlocks.has(blockKey(0x0088DD, 'adl'));
  console.log('New seed usage:');
  console.log(`  0x00868E hit during boot:  ${hitSeed868E ? 'YES' : 'NO'}`);
  console.log(`  0x0088DD hit during boot:  ${hitSeed88DD ? 'YES' : 'NO'}`);
  console.log('');

  const improved = trampoline.uniqueBlocks.size > SESSION_359_BASELINE;
  console.log(`Result: ${improved ? 'IMPROVED — boot progressed beyond 318 blocks' : 'NO IMPROVEMENT — boot did not exceed 318 blocks'}`);
  console.log('');
  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
