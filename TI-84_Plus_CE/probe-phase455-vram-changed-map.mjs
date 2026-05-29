#!/usr/bin/env node
// Phase 455 probe: map which VRAM bytes actually CHANGE per key press.
//
// For each key in [1, +, 1, ENTER], snapshots VRAM before and after processing,
// then reports row/column ranges, per-row histograms, and cross-key common regions.
//
// Uses the same processInjectedKey pattern from phase 454 to ensure all keys
// are properly consumed.

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
const SYSTEM_CHECK_ENTRY = 0x001713;
const CHK_OS_INTERRUPT_ENTRY = 0x0008BB;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;

const KEY_ONE = { label: '1', scan: 0x12 };
const KEY_PLUS = { label: '+', scan: 0x2A };
const KEY_ENTER = { label: 'ENTER', scan: 0x29 };
const SEQUENCE = [KEY_ONE, KEY_PLUS, KEY_ONE, KEY_ENTER];

const ROW_STRIDE = 640; // 320 pixels * 2 bytes per pixel

const CONSUME_BURST_STEPS = 500;
const POST_CONSUME_STEPS = 500000;
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

// Verbatim from probe-phase454
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

  // Pre-copy flash self-test routine from ROM into RAM trampoline target
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

// Adapted from phase 454's processInjectedKey
function processKey(executor, cpu, mem, key, startPc, startMode) {
  const trace = createTraceState();
  let totalSteps = 0;
  let currentPc = startPc;
  let currentMode = startMode;

  injectScanCode(mem, key);

  // Burst to consume the key
  const burstResult = runTracked(executor, currentPc, currentMode, CONSUME_BURST_STEPS, totalSteps, trace);
  totalSteps += burstResult.steps ?? 0;
  currentPc = burstResult.lastPc ?? currentPc;
  currentMode = burstResult.lastMode ?? currentMode;

  const bit3Cleared = !isScanCodePending(mem);
  const scanAfterBurst = mem[KEY_SCAN_CODE_ADDR];
  const consumed = bit3Cleared && scanAfterBurst === 0x00;

  // Post-process (rendering)
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

function analyzeVramDiff(before, after) {
  const changedOffsets = [];
  for (let offset = 0; offset < VRAM_BYTE_SIZE; offset++) {
    if (before[offset] !== after[offset]) {
      changedOffsets.push(offset);
    }
  }

  const rowChangeCounts = new Map();
  let minRow = 999, maxRow = -1;
  let minCol = 999, maxCol = -1;

  for (const offset of changedOffsets) {
    const row = Math.floor(offset / ROW_STRIDE);
    const col = Math.floor((offset % ROW_STRIDE) / 2);

    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;

    rowChangeCounts.set(row, (rowChangeCounts.get(row) || 0) + 1);
  }

  return { changedOffsets, rowChangeCounts, minRow, maxRow, minCol, maxCol };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_END);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- phase 455 probe: VRAM changed-byte map ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);

  // Enable key processing
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[KEY_GATE_ADDR] = 0;
  console.log('  D14091=' + hex(mem[0xD14091], 2) + ' D177B7=' + hex(mem[0xD177B7], 2) + ' D177BA=' + hex(mem[KEY_GATE_ADDR], 2));

  console.log('');
  console.log('phase 2: process keys and map VRAM changes');
  console.log('');

  const perKeyResults = [];
  let currentPc = EVENT_LOOP_ENTRY;
  let currentMode = 'adl';

  for (let ki = 0; ki < SEQUENCE.length; ki++) {
    const key = SEQUENCE[ki];

    // Set up for key injection (same as phase 454)
    mem[0xD177B7] = 0x55;
    mem[KEY_BUFFER_ADDR] = 0x00;
    mem[KEY_GATE_ADDR] = 0;

    // Snapshot VRAM before
    const before = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));

    // Process the key using phase 454's pattern
    const keyResult = processKey(executor, cpu, mem, key, currentPc, currentMode);

    // Snapshot VRAM after
    const after = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));

    // Analyze diff
    const diff = analyzeVramDiff(before, after);

    perKeyResults.push({
      label: key.label,
      scan: key.scan,
      consumed: keyResult.consumed,
      totalSteps: keyResult.totalSteps,
      haltReached: keyResult.haltReached,
      termination: keyResult.termination,
      error: keyResult.error,
      changedRows: new Set(diff.rowChangeCounts.keys()),
      rowChangeCounts: diff.rowChangeCounts,
      totalChanged: diff.changedOffsets.length,
      minRow: diff.minRow,
      maxRow: diff.maxRow,
      minCol: diff.minCol,
      maxCol: diff.maxCol,
    });

    console.log('=== Key ' + (ki + 1) + ': "' + key.label + '" (scan ' + hex(key.scan, 2) + ') ===');
    console.log('  Consumed: ' + (keyResult.consumed ? 'yes' : 'no') + '  steps=' + keyResult.totalSteps + '  halt=' + (keyResult.haltReached ? 'yes' : 'no') + '  term=' + keyResult.termination);
    if (keyResult.error) {
      console.log('  ERROR: ' + keyResult.error);
    }
    console.log('  Total changed bytes: ' + diff.changedOffsets.length);
    if (diff.changedOffsets.length > 0) {
      console.log('  Row range: ' + diff.minRow + ' to ' + diff.maxRow + ' (' + (diff.maxRow - diff.minRow + 1) + ' rows)');
      console.log('  Column range: ' + diff.minCol + ' to ' + diff.maxCol + ' (' + (diff.maxCol - diff.minCol + 1) + ' pixel columns)');
      console.log('  Per-row histogram (rows with >100 changed bytes):');

      const sortedRows = [...diff.rowChangeCounts.entries()].sort((a, b) => a[0] - b[0]);
      for (const [row, count] of sortedRows) {
        if (count > 100) {
          const barLen = Math.min(60, Math.round(count / 10));
          const bar = '#'.repeat(barLen);
          console.log('    row ' + String(row).padStart(3) + ': ' + String(count).padStart(4) + ' bytes  ' + bar);
        }
      }

      // Show rows with small changes (1-100)
      const smallChangeRows = sortedRows.filter(function(entry) { return entry[1] <= 100; });
      if (smallChangeRows.length > 0) {
        console.log('  Rows with 1-100 changed bytes (' + smallChangeRows.length + ' rows):');
        for (const [row, count] of smallChangeRows) {
          console.log('    row ' + String(row).padStart(3) + ': ' + String(count).padStart(4) + ' bytes');
        }
      }
    }
    console.log('');

    // Reset for next key - restart from event loop entry
    currentPc = EVENT_LOOP_ENTRY;
    currentMode = 'adl';

    // Reset CPU state for next iteration
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu._iy = 0xD00080;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  }

  // Cross-key analysis
  console.log('=== Cross-Key Analysis ===');

  if (perKeyResults.length === 4) {
    // Find rows changed by ALL 4 keys
    const allHaveChanges = perKeyResults.every(function(r) { return r.totalChanged > 0; });

    if (allHaveChanges) {
      let commonRows = new Set(perKeyResults[0].changedRows);
      for (let i = 1; i < perKeyResults.length; i++) {
        const next = perKeyResults[i].changedRows;
        commonRows = new Set([...commonRows].filter(function(r) { return next.has(r); }));
      }
      const sortedCommon = [...commonRows].sort(function(a, b) { return a - b; });
      console.log('');
      console.log('Rows changed by ALL 4 keys (' + sortedCommon.length + ' rows):');
      if (sortedCommon.length <= 50) {
        console.log('  ' + sortedCommon.join(', '));
      } else {
        console.log('  ' + sortedCommon.slice(0, 25).join(', ') + ' ... ' + sortedCommon.slice(-25).join(', '));
      }
      if (sortedCommon.length > 0) {
        console.log('  Range: row ' + sortedCommon[0] + ' to row ' + sortedCommon[sortedCommon.length - 1]);
      }
    } else {
      console.log('');
      console.log('Not all keys produced VRAM changes - cross-key comparison limited.');
      for (let i = 0; i < perKeyResults.length; i++) {
        console.log('  Key "' + perKeyResults[i].label + '": ' + perKeyResults[i].totalChanged + ' changed bytes, consumed=' + (perKeyResults[i].consumed ? 'yes' : 'no'));
      }
    }

    // Find rows unique to each key
    for (let i = 0; i < perKeyResults.length; i++) {
      const entry = perKeyResults[i];
      if (entry.totalChanged === 0) {
        console.log('');
        console.log('Key "' + entry.label + '": no VRAM changes');
        continue;
      }
      const uniqueRows = [...entry.changedRows].filter(function(r) {
        for (let j = 0; j < perKeyResults.length; j++) {
          if (j !== i && perKeyResults[j].changedRows.has(r)) return false;
        }
        return true;
      }).sort(function(a, b) { return a - b; });

      if (uniqueRows.length > 0) {
        console.log('');
        console.log('Rows UNIQUE to key "' + entry.label + '" (' + uniqueRows.length + ' rows):');
        if (uniqueRows.length <= 30) {
          console.log('  ' + uniqueRows.join(', '));
        } else {
          console.log('  ' + uniqueRows.slice(0, 15).join(', ') + ' ... ' + uniqueRows.slice(-15).join(', '));
        }
      } else {
        console.log('');
        console.log('No rows unique to key "' + entry.label + '"');
      }
    }
  }

  // Summary table
  console.log('');
  console.log('=== Summary ===');
  for (let i = 0; i < perKeyResults.length; i++) {
    const r = perKeyResults[i];
    const rowRange = r.totalChanged > 0 ? ('rows ' + r.minRow + '-' + r.maxRow) : 'none';
    const colRange = r.totalChanged > 0 ? ('cols ' + r.minCol + '-' + r.maxCol) : 'none';
    console.log('  Key ' + (i + 1) + ' "' + r.label.padEnd(5) + '": ' + String(r.totalChanged).padStart(6) + ' bytes changed  ' + rowRange + '  ' + colRange + '  consumed=' + (r.consumed ? 'yes' : 'no'));
  }

  console.log('');
  console.log('--- phase 455 probe complete ---');
}

main();
