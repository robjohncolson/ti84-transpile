#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const EVENT_LOOP_ENTRY = 0x003A73;
const KEY_DETECT_BLOCK = 0x003A77;
const KEY_DETECT_INSTR = 0x003A79;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const KEYPRESS_OPTS = { maxSteps: 500000, maxLoopIterations: 10 };

const HOT_BLOCK_LIMIT = 20;
const NEW_BLOCK_PREVIEW_LIMIT = 40;
const MISSING_BLOCK_PREVIEW_LIMIT = 20;
const WATCHED_TARGETS = [
  0x001713,
  0x001933,
  0x001853,
  0x000721,
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function sortedBlockEntries(result) {
  return Object.entries(result.blockVisits ?? {}).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
}

function blockKeysForAddress(result, addr) {
  const prefix = `${(addr >>> 0).toString(16).padStart(6, '0')}:`;
  return Object.keys(result.blockVisits ?? {}).filter((key) => key.startsWith(prefix));
}

function visitCountForAddress(result, addr) {
  let total = 0;
  for (const key of blockKeysForAddress(result, addr)) {
    total += result.blockVisits[key] ?? 0;
  }
  return total;
}

function uniqueBlockKeys(result) {
  return Object.keys(result.blockVisits ?? {});
}

function collectBlockKeys(results) {
  const blocks = new Set();
  for (const result of results) {
    for (const key of uniqueBlockKeys(result)) {
      blocks.add(key);
    }
  }
  return blocks;
}

function resetPhase123Stack(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function resetEventLoopState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function getKeyboardState(peripherals) {
  const keyboardState = peripherals.keyboardState ?? peripherals.keyboard;
  if (!keyboardState?.keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }
  if (!peripherals.keyboardState) {
    peripherals.keyboardState = keyboardState;
  }
  return keyboardState;
}

function resetKeyboard(peripherals, keyboardState) {
  keyboardState.keyMatrix.fill(0xFF);
  keyboardState.groupSelect = 0xFF;
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function printHotBlocks(entries) {
  if (entries.length === 0) {
    console.log('Top hottest blocks: none');
    return;
  }

  console.log(`Top ${Math.min(HOT_BLOCK_LIMIT, entries.length)} hottest blocks:`);
  for (const [key, visits] of entries.slice(0, HOT_BLOCK_LIMIT)) {
    console.log(`  ${key} : ${visits} visit(s)`);
  }
}

function printNewBlocks(newBlocks, isColdBootPhase) {
  if (isColdBootPhase) {
    console.log('New blocks vs cold-boot baseline: 0 (phase is part of the baseline)');
    return;
  }

  console.log(`New blocks vs cold-boot baseline: ${newBlocks.length}`);
  if (newBlocks.length === 0) {
    return;
  }

  console.log(`First ${Math.min(NEW_BLOCK_PREVIEW_LIMIT, newBlocks.length)} new block(s):`);
  for (const key of newBlocks.slice(0, NEW_BLOCK_PREVIEW_LIMIT)) {
    console.log(`  ${key}`);
  }
  if (newBlocks.length > NEW_BLOCK_PREVIEW_LIMIT) {
    console.log(`  ... and ${newBlocks.length - NEW_BLOCK_PREVIEW_LIMIT} more`);
  }
}

function printMissingBlocks(result) {
  const missing = result.missingBlocks ?? [];
  if (missing.length === 0) {
    console.log('Missing blocks: none');
    return;
  }

  console.log(`Missing blocks: ${missing.length}`);
  for (const key of missing.slice(0, MISSING_BLOCK_PREVIEW_LIMIT)) {
    console.log(`  ${key}`);
  }
  if (missing.length > MISSING_BLOCK_PREVIEW_LIMIT) {
    console.log(`  ... and ${missing.length - MISSING_BLOCK_PREVIEW_LIMIT} more`);
  }
}

function printWatchedTargets(result) {
  console.log('Watched targets:');
  for (const addr of WATCHED_TARGETS) {
    const visits = visitCountForAddress(result, addr);
    console.log(`  ${hex(addr)} visited=${visits > 0 ? 'yes' : 'no'} count=${visits}`);
  }

  const keyDetectVisits = visitCountForAddress(result, KEY_DETECT_BLOCK);
  console.log(
    `  ${hex(KEY_DETECT_INSTR)} visited=${keyDetectVisits > 0 ? 'yes' : 'no'} count=${keyDetectVisits} ` +
    `(counted via ${hex(KEY_DETECT_BLOCK)} basic block)`,
  );
}

function printPhaseReport(phase, coldBootBlocks) {
  const { label, input, result, coldBootPhase } = phase;
  const entries = sortedBlockEntries(result);
  const blocks = entries.map(([key]) => key);
  const newBlocks = coldBootPhase ? [] : blocks.filter((key) => !coldBootBlocks.has(key));

  console.log(`--- ${label} ---`);
  if (input) {
    console.log(`Input: ${input}`);
  }
  console.log(
    `steps=${result.steps} termination=${result.termination} ` +
    `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? 'n/a'}`,
  );
  console.log(`Unique blocks discovered: ${blocks.length}`);
  if ((result.loopsForced ?? 0) > 0) {
    console.log(`Loops forced: ${result.loopsForced}`);
  }
  printNewBlocks(newBlocks, coldBootPhase);
  printHotBlocks(entries);
  printWatchedTargets(result);
  printMissingBlocks(result);
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS =
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule;

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const keyboardState = getKeyboardState(peripherals);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 370 - Keypress Event Loop Probe ===');
console.log('');

const phases = [];

const phase1 = executor.runFrom(0x000000, 'z80', PHASE1_OPTS);
phases.push({
  label: 'Phase 1 (Z80 cold boot)',
  result: phase1,
  coldBootPhase: true,
});

resetPhase123Stack(cpu, mem);

const phase2 = executor.runFrom(0x08C331, 'adl', PHASE2_OPTS);
phases.push({
  label: 'Phase 2 (Kernel init)',
  result: phase2,
  coldBootPhase: true,
});

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
resetPhase123Stack(cpu, mem);

const phase3 = executor.runFrom(0x0802B2, 'adl', PHASE3_OPTS);
phases.push({
  label: 'Phase 3 (Post-init)',
  result: phase3,
  coldBootPhase: true,
});

const coldBootBlocks = collectBlockKeys([phase1, phase2, phase3]);

resetEventLoopState(cpu, mem);
resetKeyboard(peripherals, keyboardState);
keyboardState.keyMatrix[1] &= ~(1 << 0);
const phase4 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', KEYPRESS_OPTS);
phases.push({
  label: 'Phase 4 (Event loop with ENTER)',
  input: 'ENTER via keyMatrix[1] bit 0 (scan code 0x10)',
  result: phase4,
  coldBootPhase: false,
});

resetEventLoopState(cpu, mem);
resetKeyboard(peripherals, keyboardState);
keyboardState.keyMatrix[2] &= ~(1 << 2);
const phase5 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', KEYPRESS_OPTS);
phases.push({
  label: 'Phase 5 (Event loop with requested "5" key)',
  input: 'Requested matrix position keyMatrix[2] bit 2 (scan code 0x22)',
  result: phase5,
  coldBootPhase: false,
});

console.log(`Cold-boot baseline unique blocks (Phases 1-3): ${coldBootBlocks.size}`);
console.log('');

for (const phase of phases) {
  printPhaseReport(phase, coldBootBlocks);
}

console.log('=== Comparison Summary ===');
console.log(
  `Phase 4 ${hex(KEY_DETECT_INSTR)} count: ${visitCountForAddress(phase4, KEY_DETECT_BLOCK)}`,
);
console.log(
  `Phase 5 ${hex(KEY_DETECT_INSTR)} count: ${visitCountForAddress(phase5, KEY_DETECT_BLOCK)}`,
);
for (const addr of WATCHED_TARGETS) {
  console.log(
    `${hex(addr)} counts -> phase4=${visitCountForAddress(phase4, addr)} ` +
    `phase5=${visitCountForAddress(phase5, addr)}`,
  );
}
