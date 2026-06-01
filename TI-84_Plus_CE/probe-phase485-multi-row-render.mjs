#!/usr/bin/env node
/**
 * probe-phase485-multi-row-render.mjs
 *
 * Render 54 characters across 3 text rows via ROM character output at 0x0059C6:
 *   Row 0: 'A'-'Z' (26 chars)
 *   Row 1: 'a'-'z' (26 chars)
 *   Row 2: '0'-'1' (2 chars)
 *
 * Verifies cursor tracking (D00595/D00596), VRAM writes, and row spacing.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const CHAR_OUTPUT_ADDR = 0x0059C6;
const SENTINEL_ADDR = 0x500000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const CURSOR_ROW_ADDR = 0xD00595;
const CURSOR_COL_ADDR = 0xD00596;
const VRAM_PTR_ADDR = 0xD0059C;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 2) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function read24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24(addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function expectedVramAddress(row, col) {
  return (VRAM_START + ((row * 20 + 37) * 640) + ((col * 12 + 2) * 2)) & 0xFFFFFF;
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  let count = 0;
  let first = null;
  let last = null;

  for (let offset = 0; offset < before.length; offset++) {
    if (before[offset] !== mem[VRAM_START + offset]) {
      count++;
      const addr = VRAM_START + offset;
      if (first === null) first = addr;
      last = addr;
    }
  }

  return { count, first, last };
}

function setAccumulator(code) {
  const byte = code & 0xFF;
  cpu.a = byte;
  if (cpu.registers && 'a' in cpu.registers) {
    cpu.registers.a = byte;
  }
  cpu._a = byte << 24;
}

function pushSentinelReturn(stackTop) {
  cpu.sp = (stackTop - 3) & 0xFFFFFF;
  mem[cpu.sp] = SENTINEL_ADDR & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_ADDR >>> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_ADDR >>> 16) & 0xFF;
}

function runChar(char, code, stackTop) {
  const rowBefore = mem[CURSOR_ROW_ADDR];
  const colBefore = mem[CURSOR_COL_ADDR];
  const d0059cBefore = read24(VRAM_PTR_ADDR);
  const expectedStart = expectedVramAddress(rowBefore, colBefore);
  const before = snapshotVram();

  cpu.mbase = 0xD0;
  cpu.iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  setAccumulator(code);
  cpu.pc = CHAR_OUTPUT_ADDR;
  pushSentinelReturn(stackTop);

  const result = executor.runFrom(CHAR_OUTPUT_ADDR, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 100,
  });

  const changed = diffVram(before);
  const rowAfter = mem[CURSOR_ROW_ADDR];
  const colAfter = mem[CURSOR_COL_ADDR];
  const d0059cAfter = read24(VRAM_PTR_ADDR);

  return {
    char,
    code,
    rowBefore,
    rowAfter,
    colBefore,
    colAfter,
    d0059cBefore,
    d0059cAfter,
    expectedStart,
    firstChanged: changed.first,
    lastChanged: changed.last,
    vramChanged: changed.count,
    steps: result.steps,
    termination: result.termination,
    missingBlocks: result.missingBlocks,
  };
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function printSummaryTable(rows) {
  const columns = [
    ['#', 3],
    ['Char', 6],
    ['Code', 6],
    ['Col', 7],
    ['Row', 7],
    ['VRAM', 7],
    ['D0059C', 10],
    ['Expected', 10],
    ['First', 10],
    ['Steps', 6],
    ['Term', 13],
  ];

  console.log(columns.map(([label, width]) => pad(label, width)).join('  '));
  console.log(columns.map(([, width]) => '-'.repeat(width)).join('  '));

  rows.forEach((row, index) => {
    console.log([
      pad(index + 1, 3),
      pad("'" + row.char + "'", 6),
      pad(hex(row.code), 6),
      pad(row.colBefore + '->' + row.colAfter, 7),
      pad(row.rowBefore + '->' + row.rowAfter, 7),
      pad(row.vramChanged, 7),
      pad(hex(row.d0059cAfter, 6), 10),
      pad(hex(row.expectedStart, 6), 10),
      pad(row.firstChanged === null ? 'none' : hex(row.firstChanged, 6), 10),
      pad(row.steps, 6),
      pad(row.termination, 13),
    ].join('  '));
  });
}

function completedUnderStepLimit(row) {
  return row.steps < 500 && row.termination !== 'max_steps' && row.termination !== 'error';
}

// ========== CREATE EXECUTOR ==========

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ========== 3-STAGE BOOT ==========

console.log('[phase485] Boot stage 1: z80 reset from 0x000000');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log('[phase485] Boot stage 1 complete');

console.log('[phase485] Boot stage 2: kernel init from 0x08C331');
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase485] Boot stage 2 complete');

console.log('[phase485] Boot stage 3: post-init from 0x0802B2');
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase485] Boot stage 3 complete');

// ========== SET UP DISPLAY STATE ==========

const bootStackTop = cpu.sp & 0xFFFFFF;

mem[CURSOR_ROW_ADDR] = 0x00;
mem[CURSOR_COL_ADDR] = 0x00;
write24(VRAM_PTR_ADDR, expectedVramAddress(0, 0));

mem[0xD0058B] = 0x70;
mem[0xD0058C] = 0x00;
mem[0xD0058E] = 0x00;

cpu.mbase = 0xD0;
cpu.iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;

console.log('[phase485] Display state initialized:');
console.log('  Boot SP: ' + hex(bootStackTop, 6));
console.log('  D00595 (row): ' + hex(mem[CURSOR_ROW_ADDR]));
console.log('  D00596 (col): ' + hex(mem[CURSOR_COL_ADDR]));
console.log('  D0059C (VRAM ptr): ' + hex(read24(VRAM_PTR_ADDR), 6));
console.log('  Expected row 0 col 0 VRAM: ' + hex(expectedVramAddress(0, 0), 6));
console.log('  Expected row 1 col 0 VRAM: ' + hex(expectedVramAddress(1, 0), 6));
console.log('  Expected row 2 col 0 VRAM: ' + hex(expectedVramAddress(2, 0), 6));
console.log('  Row spacing (bytes): ' + (expectedVramAddress(1, 0) - expectedVramAddress(0, 0)));

// ========== RENDER 54 CHARACTERS ==========

const initialVram = snapshotVram();
const allRows = [];

// Row 0: A-Z (26 chars, codes 0x41-0x5A)
console.log('[phase485] Rendering row 0: A-Z (26 chars)');
for (let code = 0x41; code <= 0x5A; code++) {
  allRows.push(runChar(String.fromCharCode(code), code, bootStackTop));
}

// Snapshot after row 0
const afterRow0Vram = diffVram(initialVram);
const row0Wrapped = mem[CURSOR_COL_ADDR] === 0 && mem[CURSOR_ROW_ADDR] === 1;
console.log('[phase485] After row 0: col=' + mem[CURSOR_COL_ADDR] + ', row=' + mem[CURSOR_ROW_ADDR] + ', VRAM changed=' + afterRow0Vram.count);

// Row 1: a-z (26 chars, codes 0x61-0x7A)
console.log('[phase485] Rendering row 1: a-z (26 chars)');
const preRow1Vram = snapshotVram();
for (let code = 0x61; code <= 0x7A; code++) {
  allRows.push(runChar(String.fromCharCode(code), code, bootStackTop));
}

const afterRow1Vram = diffVram(preRow1Vram);
const row1Wrapped = mem[CURSOR_COL_ADDR] === 0 && mem[CURSOR_ROW_ADDR] === 2;
console.log('[phase485] After row 1: col=' + mem[CURSOR_COL_ADDR] + ', row=' + mem[CURSOR_ROW_ADDR] + ', VRAM changed=' + afterRow1Vram.count);

// Row 2: '0'-'1' (2 chars, codes 0x30-0x31)
console.log('[phase485] Rendering row 2: 0-1 (2 chars)');
const preRow2Vram = snapshotVram();
for (let code = 0x30; code <= 0x31; code++) {
  allRows.push(runChar(String.fromCharCode(code), code, bootStackTop));
}

const afterRow2Vram = diffVram(preRow2Vram);
console.log('[phase485] After row 2: col=' + mem[CURSOR_COL_ADDR] + ', row=' + mem[CURSOR_ROW_ADDR] + ', VRAM changed=' + afterRow2Vram.count);

// ========== FINAL REPORT ==========

console.log('');
console.log('[phase485] ========== CHARACTER SUMMARY ==========');
printSummaryTable(allRows);

// ========== VERIFICATION ==========

// Check 1: All 54 chars produce VRAM writes
const allCharsChangedVram = allRows.every((row) => row.vramChanged > 0);

// Check 2: All calls completed under step limit
const allCallsCompleted = allRows.every(completedUnderStepLimit);

// Check 3: D00596 (col) cycles correctly
// Row 0 chars (0-25): col goes 0->1, 1->2, ..., 24->25, 25->0
// Row 1 chars (26-51): col goes 0->1, 1->2, ..., 24->25, 25->0
// Row 2 chars (52-53): col goes 0->1, 1->2
const colSequenceOk = allRows.every((row, index) => {
  const charInRow = index % 26;
  const expectedColBefore = charInRow;
  const isLastInFullRow = charInRow === 25 && index < 52;
  const expectedColAfter = isLastInFullRow ? 0 : charInRow + 1;
  return row.colBefore === expectedColBefore && row.colAfter === expectedColAfter;
});

// Check 4: D00595 (row) tracks correctly
// Chars 0-25 (row 0): rowBefore=0, rowAfter=0 (except char 25 which wraps: rowAfter=1)
// Chars 26-51 (row 1): rowBefore=1, rowAfter=1 (except char 51 which wraps: rowAfter=2)
// Chars 52-53 (row 2): rowBefore=2, rowAfter=2
const rowSequenceOk = allRows.every((row, index) => {
  let expectedRowBefore;
  if (index < 26) expectedRowBefore = 0;
  else if (index < 52) expectedRowBefore = 1;
  else expectedRowBefore = 2;

  let expectedRowAfter;
  if (index === 25) expectedRowAfter = 1;
  else if (index === 51) expectedRowAfter = 2;
  else expectedRowAfter = expectedRowBefore;

  return row.rowBefore === expectedRowBefore && row.rowAfter === expectedRowAfter;
});

// Check 5: Row spacing -- first char of row 1 starts ~12800 bytes after first char of row 0
const row0FirstVram = allRows[0].firstChanged;
const row1FirstVram = allRows[26].firstChanged;
const row2FirstVram = allRows[52].firstChanged;

const ROW_SPACING = 20 * 640; // 12800
const SPACING_TOLERANCE = 4 * 640; // 4 pixel rows tolerance (glyphs start rendering at different vertical offsets)

const row0to1Spacing = row1FirstVram !== null && row0FirstVram !== null
  ? row1FirstVram - row0FirstVram
  : null;
const row1to2Spacing = row2FirstVram !== null && row1FirstVram !== null
  ? row2FirstVram - row1FirstVram
  : null;

const row0to1SpacingOk = row0to1Spacing !== null
  && Math.abs(row0to1Spacing - ROW_SPACING) <= SPACING_TOLERANCE;
const row1to2SpacingOk = row1to2Spacing !== null
  && Math.abs(row1to2Spacing - ROW_SPACING) <= SPACING_TOLERANCE;

// Check 6: Row wraps happened correctly
const row0WrapOk = row0Wrapped;
const row1WrapOk = row1Wrapped;

const passed = allCharsChangedVram
  && allCallsCompleted
  && colSequenceOk
  && rowSequenceOk
  && row0to1SpacingOk
  && row1to2SpacingOk
  && row0WrapOk
  && row1WrapOk;

console.log('');
console.log('[phase485] ========== RESULTS ==========');
console.log('[phase485] Total characters rendered: ' + allRows.length);
console.log('[phase485] Row 0 (A-Z) VRAM bytes changed: ' + afterRow0Vram.count);
console.log('[phase485] Row 1 (a-z) VRAM bytes changed: ' + afterRow1Vram.count);
console.log('[phase485] Row 2 (0-1) VRAM bytes changed: ' + afterRow2Vram.count);
console.log('[phase485] Row 0 first VRAM addr: ' + (row0FirstVram === null ? 'none' : hex(row0FirstVram, 6)));
console.log('[phase485] Row 1 first VRAM addr: ' + (row1FirstVram === null ? 'none' : hex(row1FirstVram, 6)));
console.log('[phase485] Row 2 first VRAM addr: ' + (row2FirstVram === null ? 'none' : hex(row2FirstVram, 6)));
console.log('[phase485] Row 0->1 spacing: ' + row0to1Spacing + ' bytes (expected ~' + ROW_SPACING + ')');
console.log('[phase485] Row 1->2 spacing: ' + row1to2Spacing + ' bytes (expected ~' + ROW_SPACING + ')');
console.log('[phase485] After row 0: wrapped to row 1 col 0: ' + row0Wrapped);
console.log('[phase485] After row 1: wrapped to row 2 col 0: ' + row1Wrapped);
console.log('[phase485] Final cursor: row=' + mem[CURSOR_ROW_ADDR] + ', col=' + mem[CURSOR_COL_ADDR]);

console.log('');
if (passed) {
  console.log('[phase485] PASS: 54 chars rendered across 3 rows, wraps and spacing verified');
} else {
  console.log('[phase485] FAIL:');
  if (!allCallsCompleted) console.log('  - At least one character call hit max steps or errored');
  if (!allCharsChangedVram) console.log('  - At least one character produced no VRAM changes');
  if (!colSequenceOk) console.log('  - D00596 (col) did not follow expected cycling pattern');
  if (!rowSequenceOk) console.log('  - D00595 (row) did not follow expected 0/1/2 pattern');
  if (!row0WrapOk) console.log('  - After row 0 (A-Z), cursor did not wrap to row 1 col 0');
  if (!row1WrapOk) console.log('  - After row 1 (a-z), cursor did not wrap to row 2 col 0');
  if (!row0to1SpacingOk) console.log('  - Row 0->1 VRAM spacing ' + row0to1Spacing + ' not within ' + SPACING_TOLERANCE + ' of ' + ROW_SPACING);
  if (!row1to2SpacingOk) console.log('  - Row 1->2 VRAM spacing ' + row1to2Spacing + ' not within ' + SPACING_TOLERANCE + ' of ' + ROW_SPACING);
  process.exitCode = 1;
}

console.log('');
console.log('[phase485] Summary JSON:');
console.log(JSON.stringify({
  totalChars: allRows.length,
  row0: {
    chars: 26,
    vramChanged: afterRow0Vram.count,
    firstVram: row0FirstVram,
    wrapped: row0Wrapped,
  },
  row1: {
    chars: 26,
    vramChanged: afterRow1Vram.count,
    firstVram: row1FirstVram,
    wrapped: row1Wrapped,
  },
  row2: {
    chars: 2,
    vramChanged: afterRow2Vram.count,
    firstVram: row2FirstVram,
  },
  spacing: {
    row0to1: row0to1Spacing,
    row1to2: row1to2Spacing,
    expected: ROW_SPACING,
  },
  finalCursor: {
    row: mem[CURSOR_ROW_ADDR],
    col: mem[CURSOR_COL_ADDR],
    d0059c: read24(VRAM_PTR_ADDR),
  },
  checks: {
    allCallsCompleted,
    allCharsChangedVram,
    colSequenceOk,
    rowSequenceOk,
    row0WrapOk,
    row1WrapOk,
    row0to1SpacingOk,
    row1to2SpacingOk,
  },
  passed,
}, null, 2));
