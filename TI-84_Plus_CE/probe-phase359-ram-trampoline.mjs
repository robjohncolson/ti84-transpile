#!/usr/bin/env node

/**
 * Phase 359: RAM Trampoline Probe
 *
 * Problem: Boot hits missing_block at RAM address 0xD18C22 because block
 * 0x000D82 copies 90 bytes of flash self-test code from ROM 0x000EBB to
 * RAM 0xD18C22, then jumps there via JP (IX). No transpiled block exists
 * at 0xD18C22, so boot terminates at ~273 blocks.
 *
 * Solution: Inject a synthetic compiled block at d18c22:adl that simulates
 * "flash test passed, return" by popping the return address from the stack
 * and returning it as the next PC.
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

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
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

  // --- Baseline boot (no trampoline) ---
  console.log('Phase 359: RAM Trampoline for Flash Self-Test Bypass');
  console.log('====================================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  console.log('=== BASELINE BOOT (no trampoline) ===');
  console.log('');

  const baselineMem = createMemory(romBytes);
  const baselinePeripherals = createPeripheralBus({ timerInterrupt: false });
  const baselineExecutor = createExecutor(PRELIFTED_BLOCKS, baselineMem, { peripherals: baselinePeripherals });

  const baselineCpu = baselineExecutor.cpu;
  baselineCpu.mem = baselineMem;
  baselineCpu.io = baselinePeripherals;
  baselineCpu.pc = BOOT_ENTRY;
  baselineCpu.madl = 0;
  baselineCpu.adl = false;
  baselineCpu.halted = false;

  const baselineUniqueBlocks = new Set();
  const baselineMissingBlocks = [];

  const baselineResult = baselineExecutor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, _step) {
      baselineUniqueBlocks.add(blockKey(pc & 0xFFFFFF, mode ?? 'adl'));
    },
    onMissingBlock(pc, mode, step) {
      baselineMissingBlocks.push({
        step: step + 1,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  console.log('Baseline boot summary');
  console.log('---------------------');
  console.log(`  termination:       ${baselineResult.termination}`);
  console.log(`  steps:             ${baselineResult.steps}`);
  console.log(`  unique blocks:     ${baselineUniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(baselineResult.lastPc)}:${baselineResult.lastMode}`);
  console.log('');

  if (baselineMissingBlocks.length > 0) {
    console.log('Baseline missing blocks:');
    for (const mb of baselineMissingBlocks) {
      const isRam = mb.pc >= RAM_THRESHOLD;
      console.log(`  step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  ${isRam ? '(RAM)' : '(ROM)'}`);
    }
    console.log('');
  }

  // --- Trampoline boot ---
  console.log('=== TRAMPOLINE BOOT (synthetic RAM blocks) ===');
  console.log('');

  const trampolineMem = createMemory(romBytes);
  const trampolinePeripherals = createPeripheralBus({ timerInterrupt: false });
  const trampolineExecutor = createExecutor(PRELIFTED_BLOCKS, trampolineMem, { peripherals: trampolinePeripherals });

  // Inject synthetic blocks for ALL RAM addresses that get jumped to.
  // The synthetic block simulates RET in ADL mode: pop 3 bytes from stack as return address.
  const trampolineTargets = new Set();

  function injectRamTrampoline(targetPc) {
    const key = blockKey(targetPc, 'adl');
    if (trampolineExecutor.compiledBlocks[key]) {
      return; // already exists
    }

    trampolineTargets.add(targetPc);
    trampolineExecutor.compiledBlocks[key] = (cpu) => {
      // Simulate RET in ADL mode: pop 24-bit return address from stack
      const mem = cpu.mem;
      const sp = cpu.sp & 0xFFFFFF;
      const retAddr = mem[sp] | (mem[sp + 1] << 8) | (mem[sp + 2] << 16);
      cpu.sp = (sp + 3) & 0xFFFFFF;
      return retAddr;
    };
  }

  // Pre-inject the known target
  injectRamTrampoline(RAM_TRAMPOLINE_PC);

  const trampolineCpu = trampolineExecutor.cpu;
  trampolineCpu.mem = trampolineMem;
  trampolineCpu.io = trampolinePeripherals;
  trampolineCpu.pc = BOOT_ENTRY;
  trampolineCpu.madl = 0;
  trampolineCpu.adl = false;
  trampolineCpu.halted = false;

  const trampolineUniqueBlocks = new Set();
  const trampolineMissingBlocks = [];
  const trampolineFired = [];
  const blockSequenceAroundTrampoline = [];
  let trampolineStepSeen = null;

  const trampolineResult = trampolineExecutor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(normalizedPc, normalizedMode);
      trampolineUniqueBlocks.add(key);

      // Track if this is a trampoline block firing
      if (trampolineTargets.has(normalizedPc)) {
        trampolineFired.push({ step: step + 1, pc: normalizedPc, mode: normalizedMode });
        if (trampolineStepSeen === null) {
          trampolineStepSeen = step + 1;
        }
      }

      // Capture block sequence around first trampoline firing
      if (trampolineStepSeen !== null) {
        const relativeStep = (step + 1) - trampolineStepSeen;
        if (relativeStep >= -10 && relativeStep <= 20 && blockSequenceAroundTrampoline.length < 40) {
          blockSequenceAroundTrampoline.push({
            step: step + 1,
            pc: normalizedPc,
            mode: normalizedMode,
            isTrampoline: trampolineTargets.has(normalizedPc),
          });
        }
      }

      // If we're within 10 blocks BEFORE the trampoline, capture those too
      if (trampolineStepSeen === null && blockSequenceAroundTrampoline.length < 15) {
        blockSequenceAroundTrampoline.push({
          step: step + 1,
          pc: normalizedPc,
          mode: normalizedMode,
          isTrampoline: false,
        });
      }
      // Trim pre-trampoline buffer to last 10 entries
      if (trampolineStepSeen === null && blockSequenceAroundTrampoline.length > 10) {
        blockSequenceAroundTrampoline.shift();
      }
    },
    onMissingBlock(pc, mode, step) {
      const normalizedPc = pc & 0xFFFFFF;
      trampolineMissingBlocks.push({
        step: step + 1,
        pc: normalizedPc,
        mode: mode ?? 'adl',
      });

      // If this is a RAM address we haven't seen yet, inject a trampoline dynamically
      if (normalizedPc >= RAM_THRESHOLD) {
        injectRamTrampoline(normalizedPc);
      }
    },
  });

  console.log('Trampoline boot summary');
  console.log('-----------------------');
  console.log(`  termination:       ${trampolineResult.termination}`);
  console.log(`  steps:             ${trampolineResult.steps}`);
  console.log(`  unique blocks:     ${trampolineUniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(trampolineResult.lastPc)}:${trampolineResult.lastMode}`);
  console.log('');

  console.log('RAM trampolines injected');
  console.log('------------------------');
  if (trampolineTargets.size === 0) {
    console.log('  (none)');
  } else {
    for (const target of [...trampolineTargets].sort((a, b) => a - b)) {
      console.log(`  ${hex(target)}`);
    }
  }
  console.log('');

  console.log('Trampoline activations');
  console.log('----------------------');
  if (trampolineFired.length === 0) {
    console.log('  (none fired)');
  } else {
    for (const entry of trampolineFired) {
      console.log(`  step=${String(entry.step).padStart(6)}  pc=${hex(entry.pc)}:${entry.mode}`);
    }
  }
  console.log('');

  console.log('Block sequence around trampoline');
  console.log('--------------------------------');
  if (blockSequenceAroundTrampoline.length === 0) {
    console.log('  (no sequence captured)');
  } else {
    for (const entry of blockSequenceAroundTrampoline) {
      const marker = entry.isTrampoline ? ' <<< TRAMPOLINE' : '';
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}${marker}`);
    }
  }
  console.log('');

  if (trampolineMissingBlocks.length > 0) {
    console.log('New missing blocks (with trampoline)');
    console.log('------------------------------------');
    for (const mb of trampolineMissingBlocks) {
      const isRam = mb.pc >= RAM_THRESHOLD;
      console.log(`  step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  ${isRam ? '(RAM — trampoline injected)' : '(ROM)'}`);
    }
    console.log('');
  }

  // Comparison
  console.log('Comparison');
  console.log('----------');
  console.log(`  baseline unique blocks:     ${baselineUniqueBlocks.size}`);
  console.log(`  trampoline unique blocks:   ${trampolineUniqueBlocks.size}`);
  console.log(`  delta:                      +${trampolineUniqueBlocks.size - baselineUniqueBlocks.size}`);
  console.log(`  baseline termination:       ${baselineResult.termination} at ${hex(baselineResult.lastPc)}`);
  console.log(`  trampoline termination:     ${trampolineResult.termination} at ${hex(trampolineResult.lastPc)}`);
  const continued = trampolineUniqueBlocks.size > baselineUniqueBlocks.size;
  console.log(`  continued past trampoline:  ${continued ? 'YES' : 'NO'}`);
  console.log('');

  // New blocks discovered (in trampoline but not in baseline)
  const newBlocks = [...trampolineUniqueBlocks].filter(k => !baselineUniqueBlocks.has(k));
  if (newBlocks.length > 0) {
    console.log(`New blocks discovered (${newBlocks.length} total, showing first 30)`);
    console.log('--------------------------------------------------');
    for (const key of newBlocks.slice(0, 30)) {
      console.log(`  ${key}`);
    }
    if (newBlocks.length > 30) {
      console.log(`  ... and ${newBlocks.length - 30} more`);
    }
    console.log('');
  }

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
