#!/usr/bin/env node
// Phase 456 probe: re-arm D177B7 before each injected key and compare VRAM diffs.
//
// This is derived from probe-phase455-vram-changed-map.mjs. It preserves the
// same boot path and injected-key processing loop, but explicitly re-arms
// D177B7=0x55 before every key so each key can trigger the display refresh path.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2; // 153,600 bytes
const VRAM_END = VRAM_BASE + VRAM_BYTE_SIZE;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_DIRTY_FLAG_ADDR = 0xD177B7;
const KEY_GATE_ADDR = 0xD177BA;

const KEY_ONE = { label: '1', scan: 0x12 };
const KEY_PLUS = { label: '+', scan: 0x11 };
const KEY_ENTER = { label: 'ENTER', scan: 0x10 };
const SEQUENCE = [KEY_ONE, KEY_PLUS, KEY_ONE, KEY_ENTER];

const ROW_STRIDE = 640; // 320 pixels * 2 bytes per pixel

const CONSUME_BURST_STEPS = 500;
const KEY_STEP_BUDGET = 200000;
const POST_CONSUME_STEPS = KEY_STEP_BUDGET - CONSUME_BURST_STEPS;
const PROCESS_CHUNK_STEPS = 2000;
const MAX_LOOPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function isHaltPc(pc) {
  return pc >= HALT_RANGE_START && pc <= HALT_RANGE_END;
}

function isScanCodePending(mem) {
  return (mem[KEY_AVAILABLE_FLAG_ADDR] & KEY_AVAILABLE_FLAG_MASK) !== 0;
}

// Verbatim boot path from probe-phase455-vram-changed-map.mjs
function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log('  boot: steps=' + bootResult.steps + ' term=' + bootResult.termination + ' lastPc=' + hex(bootResult.lastPc));
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log('  kernel: steps=' + kernelResult.steps + ' term=' + kernelResult.termination + ' lastPc=' + hex(kernelResult.lastPc));
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log('  postInit: steps=' + postInitResult.steps + ' term=' + postInitResult.termination + ' lastPc=' + hex(postInitResult.lastPc));

  let lastResult = postInitResult;
  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    lastResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log('  stage' + (i + 1) + ': entry=' + hex(entry) + ' steps=' + lastResult.steps + ' term=' + lastResult.termination + ' lastPc=' + hex(lastResult.lastPc));
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );
  console.log('  pre-copied ' + FLASH_ROUTINE_LEN + ' bytes from ROM ' + hex(FLASH_ROUTINE_ROM_SRC) + ' to RAM ' + hex(FLASH_ROUTINE_RAM_DST));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function injectScanCode(mem, key) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = key.scan;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function createTraceState() {
  return {
    haltReached: false,
    haltPc: null,
    haltStep: null,
    haltMode: null,
  };
}

function runTracked(executor, startPc, startMode, maxSteps, stepOffset, trace) {
  try {
    return executor.runFrom(startPc, startMode, {
      maxSteps,
      maxLoopIterations: MAX_LOOPS,
      diHaltBypass: true,
      onBlock: (pc, mode, _meta, steps) => {
        const normalizedPc = pc & 0xFFFFFF;
        const absoluteStep = stepOffset + steps;
        if (isHaltPc(normalizedPc) && trace.haltStep === null) {
          trace.haltReached = true;
          trace.haltPc = normalizedPc;
          trace.haltStep = absoluteStep;
          trace.haltMode = mode ?? startMode;
        }
      },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      steps: 0,
      termination: 'throw',
      lastPc: startPc,
      lastMode: startMode,
    };
  }
}

// Same key-processing pattern as phase 455, kept under a 200,000-step total budget.
function processInjectedKey(executor, cpu, mem, key, startPc, startMode) {
  const trace = createTraceState();
  let totalSteps = 0;
  let currentPc = startPc;
  let currentMode = startMode;

  injectScanCode(mem, key);

  const burstResult = runTracked(executor, currentPc, currentMode, CONSUME_BURST_STEPS, totalSteps, trace);
  totalSteps += burstResult.steps ?? 0;
  currentPc = burstResult.lastPc ?? currentPc;
  currentMode = burstResult.lastMode ?? currentMode;

  const bit3Cleared = !isScanCodePending(mem);
  const scanAfterBurst = mem[KEY_SCAN_CODE_ADDR];
  const consumed = bit3Cleared && scanAfterBurst === 0x00;

  let lastResult = burstResult;
  let remainingProcessSteps = POST_CONSUME_STEPS;

  while (consumed && !trace.haltReached && remainingProcessSteps > 0) {
    const chunkSteps = Math.min(PROCESS_CHUNK_STEPS, remainingProcessSteps);
    const chunkResult = runTracked(executor, currentPc, currentMode, chunkSteps, totalSteps, trace);

    lastResult = chunkResult;
    totalSteps += chunkResult.steps ?? 0;
    currentPc = chunkResult.lastPc ?? currentPc;
    currentMode = chunkResult.lastMode ?? currentMode;
    remainingProcessSteps -= chunkSteps;

    if (trace.haltReached || chunkResult.error || (chunkResult.steps ?? 0) === 0 || chunkResult.termination !== 'max_steps') {
      break;
    }
  }

  return {
    consumed,
    totalSteps,
    haltReached: trace.haltReached,
    finalPc: currentPc,
    finalMode: currentMode,
    termination: lastResult.termination,
    error: burstResult.error ?? lastResult.error ?? null,
  };
}

function summarizeChangedOffsets(changedOffsets) {
  const changedRows = new Set();
  const changedCols = new Set();
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (const offset of changedOffsets) {
    const row = Math.floor(offset / ROW_STRIDE);
    const col = Math.floor((offset % ROW_STRIDE) / 2);

    changedRows.add(row);
    changedCols.add(col);

    if (minRow === null || row < minRow) minRow = row;
    if (maxRow === null || row > maxRow) maxRow = row;
    if (minCol === null || col < minCol) minCol = col;
    if (maxCol === null || col > maxCol) maxCol = col;
  }

  return {
    changedOffsets,
    changedRows,
    changedCols,
    totalChanged: changedOffsets.length,
    minRow,
    maxRow,
    minCol,
    maxCol,
  };
}

function analyzeVramDiff(before, after) {
  const changedOffsets = [];
  for (let offset = 0; offset < VRAM_BYTE_SIZE; offset++) {
    if (before[offset] !== after[offset]) {
      changedOffsets.push(offset);
    }
  }
  return summarizeChangedOffsets(changedOffsets);
}

function formatRanges(values, spanLimit = 12) {
  if (values.length === 0) return 'none';

  const spans = [];
  let start = values[0];
  let prev = values[0];

  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    if (value === prev + 1) {
      prev = value;
      continue;
    }

    spans.push(start === prev ? String(start) : (start + '-' + prev));
    start = value;
    prev = value;
  }

  spans.push(start === prev ? String(start) : (start + '-' + prev));

  if (spans.length <= spanLimit) {
    return spans.join(', ');
  }

  const headCount = Math.ceil(spanLimit / 2);
  const tailCount = Math.floor(spanLimit / 2);
  return spans.slice(0, headCount).join(', ') + ' ... ' + spans.slice(-tailCount).join(', ');
}

function intersectSets(sets) {
  if (sets.length === 0) return new Set();

  const ordered = [...sets].sort(function(a, b) { return a.size - b.size; });
  const seed = ordered[0];
  const rest = ordered.slice(1);
  const intersection = new Set();

  for (const value of seed) {
    let shared = true;
    for (const set of rest) {
      if (!set.has(value)) {
        shared = false;
        break;
      }
    }
    if (shared) {
      intersection.add(value);
    }
  }

  return intersection;
}

function describeOffsetSet(offsetSet) {
  const offsets = [...offsetSet].sort(function(a, b) { return a - b; });
  return summarizeChangedOffsets(offsets);
}

function uniqueOffsetsForEntry(perKeyResults, index) {
  const entry = perKeyResults[index];
  const uniqueOffsets = [];

  for (const offset of entry.changedOffsets) {
    let seenElsewhere = false;
    for (let i = 0; i < perKeyResults.length; i++) {
      if (i !== index && perKeyResults[i].changedOffsetSet.has(offset)) {
        seenElsewhere = true;
        break;
      }
    }

    if (!seenElsewhere) {
      uniqueOffsets.push(offset);
    }
  }

  return uniqueOffsets;
}

function logRegionSummary(prefix, summary) {
  if (summary.totalChanged === 0) {
    console.log(prefix + 'none');
    return;
  }

  const rows = [...summary.changedRows].sort(function(a, b) { return a - b; });
  const cols = [...summary.changedCols].sort(function(a, b) { return a - b; });
  console.log(prefix + summary.totalChanged + ' bytes');
  console.log('    rows: ' + formatRanges(rows) + ' (range ' + summary.minRow + '-' + summary.maxRow + ')');
  console.log('    cols: ' + formatRanges(cols) + ' (range ' + summary.minCol + '-' + summary.maxCol + ')');
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_END);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- phase 456 probe: VRAM re-arm changed-byte map ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);

  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_DIRTY_FLAG_ADDR] = 0x55;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_GATE_ADDR] = 0x00;
  console.log('  D14091=' + hex(mem[KEY_PROCESSING_ENABLE_ADDR], 2) + ' D177B7=' + hex(mem[DISPLAY_DIRTY_FLAG_ADDR], 2) + ' D141B5=' + hex(mem[KEY_BUFFER_ADDR], 2) + ' D177BA=' + hex(mem[KEY_GATE_ADDR], 2));
  console.log('  per-key budget=' + KEY_STEP_BUDGET + ' steps (' + CONSUME_BURST_STEPS + ' burst + ' + POST_CONSUME_STEPS + ' post-consume)');

  console.log('');
  console.log('phase 2: re-arm D177B7 before each key and diff VRAM');
  console.log('');

  const perKeyResults = [];
  let currentPc = bootState.lastPc;
  let currentMode = bootState.lastMode ?? 'adl';

  for (let ki = 0; ki < SEQUENCE.length; ki++) {
    const key = SEQUENCE[ki];

    mem[DISPLAY_DIRTY_FLAG_ADDR] = 0x55;
    mem[KEY_BUFFER_ADDR] = 0x00;
    mem[KEY_GATE_ADDR] = 0x00;
    const dirtyBefore = mem[DISPLAY_DIRTY_FLAG_ADDR];

    const before = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));
    const keyResult = processInjectedKey(executor, cpu, mem, key, currentPc, currentMode);
    const after = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));

    const diff = analyzeVramDiff(before, after);
    const changedRowsSorted = [...diff.changedRows].sort(function(a, b) { return a - b; });
    const changedColsSorted = [...diff.changedCols].sort(function(a, b) { return a - b; });

    perKeyResults.push({
      index: ki + 1,
      label: key.label,
      scan: key.scan,
      consumed: keyResult.consumed,
      totalSteps: keyResult.totalSteps,
      haltReached: keyResult.haltReached,
      termination: keyResult.termination,
      error: keyResult.error,
      dirtyBefore,
      dirtyAfter: mem[DISPLAY_DIRTY_FLAG_ADDR],
      keyBufferAfter: mem[KEY_BUFFER_ADDR],
      changedOffsets: diff.changedOffsets,
      changedOffsetSet: new Set(diff.changedOffsets),
      changedRows: diff.changedRows,
      changedCols: diff.changedCols,
      totalChanged: diff.totalChanged,
      minRow: diff.minRow,
      maxRow: diff.maxRow,
      minCol: diff.minCol,
      maxCol: diff.maxCol,
      changedRowsText: formatRanges(changedRowsSorted),
      changedColsText: formatRanges(changedColsSorted),
    });

    console.log('=== Key ' + (ki + 1) + ': "' + key.label + '" (scan ' + hex(key.scan, 2) + ') ===');
    console.log('  D177B7: ' + hex(dirtyBefore, 2) + ' -> ' + hex(mem[DISPLAY_DIRTY_FLAG_ADDR], 2) + '  D141B5=' + hex(mem[KEY_BUFFER_ADDR], 2));
    console.log('  Consumed: ' + (keyResult.consumed ? 'yes' : 'no') + '  steps=' + keyResult.totalSteps + '  halt=' + (keyResult.haltReached ? 'yes' : 'no') + '  term=' + keyResult.termination);
    if (keyResult.error) {
      console.log('  ERROR: ' + keyResult.error);
    }
    console.log('  Total changed bytes: ' + diff.totalChanged);
    if (diff.totalChanged > 0) {
      console.log('  Rows affected: ' + formatRanges(changedRowsSorted) + ' (range ' + diff.minRow + '-' + diff.maxRow + ')');
      console.log('  Columns affected: ' + formatRanges(changedColsSorted) + ' (range ' + diff.minCol + '-' + diff.maxCol + ')');
    } else {
      console.log('  Rows affected: none');
      console.log('  Columns affected: none');
    }
    console.log('');

    currentPc = EVENT_LOOP_ENTRY;
    currentMode = 'adl';

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu._iy = 0xD00080;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  }

  console.log('=== Cross-Key Comparison ===');

  const commonByteOffsets = intersectSets(perKeyResults.map(function(entry) { return entry.changedOffsetSet; }));
  const commonRows = intersectSets(perKeyResults.map(function(entry) { return entry.changedRows; }));
  const commonCols = intersectSets(perKeyResults.map(function(entry) { return entry.changedCols; }));
  const commonByteSummary = describeOffsetSet(commonByteOffsets);
  const commonRowsSorted = [...commonRows].sort(function(a, b) { return a - b; });
  const commonColsSorted = [...commonCols].sort(function(a, b) { return a - b; });

  console.log('');
  logRegionSummary('Shared changed bytes across all 4 keys: ', commonByteSummary);
  console.log('Rows touched by all 4 keys: ' + formatRanges(commonRowsSorted));
  console.log('Columns touched by all 4 keys: ' + formatRanges(commonColsSorted));

  console.log('');
  console.log('Pairwise shared changed-byte counts:');
  for (let i = 0; i < perKeyResults.length; i++) {
    for (let j = i + 1; j < perKeyResults.length; j++) {
      const left = perKeyResults[i];
      const right = perKeyResults[j];
      const shared = intersectSets([left.changedOffsetSet, right.changedOffsetSet]);
      console.log('  Key ' + left.index + ' "' + left.label + '" vs Key ' + right.index + ' "' + right.label + '": ' + shared.size + ' bytes');
    }
  }

  for (let i = 0; i < perKeyResults.length; i++) {
    const entry = perKeyResults[i];
    const uniqueOffsets = uniqueOffsetsForEntry(perKeyResults, i);
    const uniqueSummary = summarizeChangedOffsets(uniqueOffsets);
    console.log('');
    logRegionSummary('Unique to key ' + entry.index + ' "' + entry.label + '": ', uniqueSummary);
  }

  console.log('');
  console.log('=== Summary ===');
  for (const entry of perKeyResults) {
    const rowRange = entry.totalChanged > 0 ? ('rows ' + entry.minRow + '-' + entry.maxRow) : 'rows none';
    const colRange = entry.totalChanged > 0 ? ('cols ' + entry.minCol + '-' + entry.maxCol) : 'cols none';
    console.log('  Key ' + entry.index + ' "' + entry.label.padEnd(5) + '": ' + String(entry.totalChanged).padStart(6) + ' bytes changed  ' + rowRange + '  ' + colRange + '  consumed=' + (entry.consumed ? 'yes' : 'no') + '  D177B7=' + hex(entry.dirtyBefore, 2) + '->' + hex(entry.dirtyAfter, 2));
  }

  console.log('');
  console.log('--- phase 456 probe complete ---');
}

main();
