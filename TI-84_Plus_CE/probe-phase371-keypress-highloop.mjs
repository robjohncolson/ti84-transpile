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

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_LOOP_OPTS = { maxSteps: 500000, maxLoopIterations: 100000 };

const HOT_BLOCK_LIMIT = 30;
const BLOCK_PREVIEW_LIMIT = 40;
const MISSING_BLOCK_PREVIEW_LIMIT = 20;
const WATCHED_TARGETS = [
  0x001713,
  0x001933,
  0x001853,
  0x000721,
  KEY_DETECT_BLOCK,
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

function sortedUniqueBlockKeys(result) {
  return Object.keys(result.blockVisits ?? {}).sort();
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

function collectBlockKeys(results) {
  const blocks = new Set();
  for (const result of results) {
    for (const key of sortedUniqueBlockKeys(result)) {
      blocks.add(key);
    }
  }
  return blocks;
}

function difference(leftKeys, rightKeysSet) {
  return leftKeys.filter((key) => !rightKeysSet.has(key));
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

function printBlockPreview(label, blocks, limit = BLOCK_PREVIEW_LIMIT) {
  console.log(`${label}: ${blocks.length}`);
  if (blocks.length === 0) {
    return;
  }

  for (const key of blocks.slice(0, limit)) {
    console.log(`  ${key}`);
  }
  if (blocks.length > limit) {
    console.log(`  ... and ${blocks.length - limit} more`);
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

function printNewBlocks(newBlocks, coldBootPhase) {
  if (coldBootPhase) {
    console.log('New blocks vs cold-boot baseline: 0 (phase is part of the baseline)');
    return;
  }

  printBlockPreview('New blocks vs cold-boot baseline', newBlocks);
}

function printMissingBlocks(result) {
  const missing = result.missingBlocks ?? [];
  console.log(`Missing blocks: ${missing.length}`);
  for (const key of missing.slice(0, MISSING_BLOCK_PREVIEW_LIMIT)) {
    console.log(`  ${key}`);
  }
  if (missing.length > MISSING_BLOCK_PREVIEW_LIMIT) {
    console.log(`  ... and ${missing.length - MISSING_BLOCK_PREVIEW_LIMIT} more`);
  }
}

function printWatchedTargets(result) {
  console.log('Watched addresses:');
  for (const addr of WATCHED_TARGETS) {
    console.log(`  ${hex(addr)} count=${visitCountForAddress(result, addr)}`);
  }
}

function printPhaseReport(phase, coldBootBlocks) {
  const { label, input, result, coldBootPhase } = phase;
  const entries = sortedBlockEntries(result);
  const blocks = sortedUniqueBlockKeys(result);
  const newBlocks = coldBootPhase ? [] : difference(blocks, coldBootBlocks);

  console.log(`--- ${label} ---`);
  if (input) {
    console.log(`Input: ${input}`);
  }
  console.log(`Total steps: ${result.steps}`);
  console.log(`Termination: ${result.termination}`);
  console.log(`Last PC: ${hex(result.lastPc)} lastMode=${result.lastMode ?? 'n/a'}`);
  console.log(`Unique blocks discovered: ${blocks.length}`);
  console.log(`Loops forced count: ${result.loopsForced ?? 0}`);
  printNewBlocks(newBlocks, coldBootPhase);
  printHotBlocks(entries);
  printWatchedTargets(result);
  printMissingBlocks(result);
  console.log('');
}

function printWatchedComparison(enterResult, noKeyResult) {
  console.log('Watched address comparison (ENTER vs no-key):');
  for (const addr of WATCHED_TARGETS) {
    const enterCount = visitCountForAddress(enterResult, addr);
    const noKeyCount = visitCountForAddress(noKeyResult, addr);
    console.log(`  ${hex(addr)} -> enter=${enterCount} noKey=${noKeyCount}`);
  }
}

function summarizeDispatchAdvance(enterResult, noKeyResult) {
  const enterBlocks = new Set(sortedUniqueBlockKeys(enterResult));
  const noKeyBlocks = new Set(sortedUniqueBlockKeys(noKeyResult));
  const enterOnlyBlockCount = difference([...enterBlocks].sort(), noKeyBlocks).length;

  const enterOnlyWatched = WATCHED_TARGETS.filter((addr) => (
    addr !== KEY_DETECT_BLOCK &&
    visitCountForAddress(enterResult, addr) > 0 &&
    visitCountForAddress(noKeyResult, addr) === 0
  ));

  if (enterOnlyWatched.length > 0) {
    return `Yes; ENTER reaches additional watched dispatch blocks: ${enterOnlyWatched.map((addr) => hex(addr)).join(', ')}`;
  }

  const higherWatched = WATCHED_TARGETS.filter((addr) => (
    addr !== KEY_DETECT_BLOCK &&
    visitCountForAddress(enterResult, addr) > visitCountForAddress(noKeyResult, addr)
  ));

  if (higherWatched.length > 0) {
    return `Possibly; ENTER does not add new watched dispatch blocks, but it increases visit counts at ${higherWatched.map((addr) => hex(addr)).join(', ')}`;
  }

  if (enterOnlyBlockCount > 0) {
    return `ENTER reaches ${enterOnlyBlockCount} block(s) not seen in the no-key run, but none of the watched dispatch blocks beyond ${hex(KEY_DETECT_BLOCK)}.`;
  }

  return 'No; ENTER does not reach any additional watched dispatch blocks or unique blocks beyond the no-key control.';
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

console.log('=== Phase 371 - Keypress High-Loop Probe ===');
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
const phase4 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', EVENT_LOOP_OPTS);
phases.push({
  label: 'Phase 4 (Event loop with ENTER)',
  input: 'ENTER via keyMatrix[1] bit 0 (scan code 0x10)',
  result: phase4,
  coldBootPhase: false,
});

resetEventLoopState(cpu, mem);
resetKeyboard(peripherals, keyboardState);
const phase5 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', EVENT_LOOP_OPTS);
phases.push({
  label: 'Phase 5 (Event loop with no key)',
  input: 'No key pressed; key matrix left at 0xFF for all groups',
  result: phase5,
  coldBootPhase: false,
});

console.log(`Cold-boot baseline unique blocks (Phases 1-3): ${coldBootBlocks.size}`);
console.log('');

for (const phase of phases) {
  printPhaseReport(phase, coldBootBlocks);
}

const enterBlocks = sortedUniqueBlockKeys(phase4);
const noKeyBlocks = sortedUniqueBlockKeys(phase5);
const enterOnlyBlocks = difference(enterBlocks, new Set(noKeyBlocks));
const noKeyOnlyBlocks = difference(noKeyBlocks, new Set(enterBlocks));
const enterNewBlocks = difference(enterBlocks, coldBootBlocks);
const noKeyNewBlocks = difference(noKeyBlocks, coldBootBlocks);

console.log('=== Comparison Summary ===');
console.log(`ENTER unique blocks: ${enterBlocks.length}`);
console.log(`No-key unique blocks: ${noKeyBlocks.length}`);
console.log(`ENTER new blocks vs baseline: ${enterNewBlocks.length}`);
console.log(`No-key new blocks vs baseline: ${noKeyNewBlocks.length}`);
printBlockPreview('Blocks only reached with ENTER', enterOnlyBlocks);
printBlockPreview('Blocks only reached with no-key', noKeyOnlyBlocks);
printWatchedComparison(phase4, phase5);
console.log(`Dispatch advancement: ${summarizeDispatchAdvance(phase4, phase5)}`);
