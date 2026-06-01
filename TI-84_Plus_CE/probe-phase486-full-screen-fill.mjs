#!/usr/bin/env node
/**
 * probe-phase486-full-screen-fill.mjs
 *
 * Render 260 characters across all 10 text rows via ROM character output at
 * 0x0059C6. This extends the phase 485 3-row probe to verify full-screen
 * cursor wrap behavior:
 *   - 26 columns per row
 *   - 10 rows total
 *   - D00596 wraps at 26
 *   - D00595 wraps from 9 back to 0
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

const ROW_COUNT = 10;
const COL_COUNT = 26;
const TOTAL_CHARS = ROW_COUNT * COL_COUNT;
const PRINTABLE_CYCLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const EXPECTED_TOTAL_VRAM_BYTES = TOTAL_CHARS * 96;
const TOTAL_VRAM_TOLERANCE = 6000;

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

function printRowSummaryTable(rows) {
  const columns = [
    ['Row', 4],
    ['Chars', 5],
    ['Sequence', 28],
    ['VRAM', 7],
    ['D00595', 6],
    ['D00596', 6],
    ['First', 10],
    ['Last', 10],
    ['Wrap', 5],
  ];

  console.log(columns.map(([label, width]) => pad(label, width)).join('  '));
  console.log(columns.map(([, width]) => '-'.repeat(width)).join('  '));

  rows.forEach((row) => {
    console.log([
      pad(row.row, 4),
      pad(row.chars, 5),
      pad(row.sequence, 28),
      pad(row.vramChanged, 7),
      pad(row.cursorRowAfter, 6),
      pad(row.cursorColAfter, 6),
      pad(row.firstChanged === null ? 'none' : hex(row.firstChanged, 6), 10),
      pad(row.lastChanged === null ? 'none' : hex(row.lastChanged, 6), 10),
      pad(row.wrapOk, 5),
    ].join('  '));
  });
}

function completedUnderStepLimit(row) {
  return row.steps < 500 && row.termination !== 'max_steps' && row.termination !== 'error';
}

function charForIndex(index) {
  return PRINTABLE_CYCLE[index % PRINTABLE_CYCLE.length];
}

// ========== CREATE EXECUTOR ==========

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ========== 3-STAGE BOOT ==========

console.log('[phase486] Boot stage 1: z80 reset from 0x000000');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log('[phase486] Boot stage 1 complete');

console.log('[phase486] Boot stage 2: kernel init from 0x08C331');
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase486] Boot stage 2 complete');

console.log('[phase486] Boot stage 3: post-init from 0x0802B2');
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase486] Boot stage 3 complete');

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

console.log('[phase486] Display state initialized:');
console.log('  Boot SP: ' + hex(bootStackTop, 6));
console.log('  D00595 (row): ' + hex(mem[CURSOR_ROW_ADDR]));
console.log('  D00596 (col): ' + hex(mem[CURSOR_COL_ADDR]));
console.log('  D0059C (VRAM ptr): ' + hex(read24(VRAM_PTR_ADDR), 6));
console.log('  Expected row 0 col 0 VRAM: ' + hex(expectedVramAddress(0, 0), 6));
console.log('  Expected row 1 col 0 VRAM: ' + hex(expectedVramAddress(1, 0), 6));
console.log('  Expected row 9 col 0 VRAM: ' + hex(expectedVramAddress(9, 0), 6));
console.log('  Row spacing (bytes): ' + (expectedVramAddress(1, 0) - expectedVramAddress(0, 0)));

// ========== RENDER 260 CHARACTERS ==========

const initialVram = snapshotVram();
const allRows = [];
const rowSummaries = [];

for (let row = 0; row < ROW_COUNT; row++) {
  const preRowVram = snapshotVram();
  const firstCharIndex = allRows.length;
  const sequence = [];

  console.log('[phase486] Rendering row ' + row + ' (26 chars)');

  for (let col = 0; col < COL_COUNT; col++) {
    const index = row * COL_COUNT + col;
    const char = charForIndex(index);
    const code = char.charCodeAt(0);

    sequence.push(char);
    allRows.push(runChar(char, code, bootStackTop));
  }

  const rowVram = diffVram(preRowVram);
  const renderedChars = allRows.slice(firstCharIndex);
  const expectedCursorRow = (row + 1) % ROW_COUNT;
  const wrapOk = mem[CURSOR_COL_ADDR] === 0 && mem[CURSOR_ROW_ADDR] === expectedCursorRow;

  rowSummaries.push({
    row,
    chars: renderedChars.length,
    sequence: sequence.join(''),
    vramChanged: rowVram.count,
    cursorRowAfter: mem[CURSOR_ROW_ADDR],
    cursorColAfter: mem[CURSOR_COL_ADDR],
    firstChanged: rowVram.first,
    lastChanged: rowVram.last,
    wrapOk,
  });

  console.log(
    '[phase486] After row ' + row
    + ': col=' + mem[CURSOR_COL_ADDR]
    + ', row=' + mem[CURSOR_ROW_ADDR]
    + ', VRAM changed=' + rowVram.count
    + ', wrapped=' + wrapOk
  );
}

// ========== ROW SUMMARY ==========

console.log('');
console.log('[phase486] ========== ROW SUMMARY ==========');
printRowSummaryTable(rowSummaries);

// ========== VERIFICATION ==========

const totalVramChanged = diffVram(initialVram);
const failedVramRows = allRows.filter((row) => row.vramChanged <= 0);
const allCharsChangedVram = failedVramRows.length === 0;
const allCallsCompleted = allRows.every(completedUnderStepLimit);
const allRowsWrapped = rowSummaries.every((row) => row.wrapOk);

const colSequenceOk = allRows.every((row, index) => {
  const charInRow = index % COL_COUNT;
  const expectedColBefore = charInRow;
  const expectedColAfter = charInRow === COL_COUNT - 1 ? 0 : charInRow + 1;
  return row.colBefore === expectedColBefore && row.colAfter === expectedColAfter;
});

const rowSequenceOk = allRows.every((row, index) => {
  const charInRow = index % COL_COUNT;
  const expectedRowBefore = Math.floor(index / COL_COUNT) % ROW_COUNT;
  const expectedRowAfter = charInRow === COL_COUNT - 1
    ? (expectedRowBefore + 1) % ROW_COUNT
    : expectedRowBefore;

  return row.rowBefore === expectedRowBefore && row.rowAfter === expectedRowAfter;
});

const finalRowWrapOk = mem[CURSOR_ROW_ADDR] === 0;
const finalColWrapOk = mem[CURSOR_COL_ADDR] === 0;
const totalVramApproxOk = Math.abs(totalVramChanged.count - EXPECTED_TOTAL_VRAM_BYTES) <= TOTAL_VRAM_TOLERANCE;

const passed = allRows.length === TOTAL_CHARS
  && allCallsCompleted
  && allCharsChangedVram
  && colSequenceOk
  && rowSequenceOk
  && allRowsWrapped
  && finalRowWrapOk
  && finalColWrapOk
  && totalVramApproxOk;

console.log('');
console.log('[phase486] ========== RESULTS ==========');
console.log('[phase486] Total characters rendered: ' + allRows.length);
console.log('[phase486] Total VRAM bytes changed from initial: ' + totalVramChanged.count);
console.log('[phase486] Expected total VRAM bytes: ~' + EXPECTED_TOTAL_VRAM_BYTES + ' (+/- ' + TOTAL_VRAM_TOLERANCE + ')');
console.log('[phase486] Characters with no VRAM writes: ' + failedVramRows.length);
console.log('[phase486] Final cursor: row=' + mem[CURSOR_ROW_ADDR] + ', col=' + mem[CURSOR_COL_ADDR]);
console.log('[phase486] Final D0059C (VRAM ptr): ' + hex(read24(VRAM_PTR_ADDR), 6));
console.log('[phase486] D00595 wrapped 9->0 after row 9: ' + finalRowWrapOk);
console.log('[phase486] D00596 wrapped to 0 after 260 chars: ' + finalColWrapOk);

console.log('');
if (passed) {
  console.log('[phase486] PASS: 260 chars rendered across all 10 rows, full-screen fill verified');
} else {
  console.log('[phase486] FAIL:');
  if (allRows.length !== TOTAL_CHARS) console.log('  - Rendered ' + allRows.length + ' chars, expected ' + TOTAL_CHARS);
  if (!allCallsCompleted) console.log('  - At least one character call hit max steps or errored');
  if (!allCharsChangedVram) console.log('  - ' + failedVramRows.length + ' character(s) produced no VRAM changes');
  if (!colSequenceOk) console.log('  - D00596 (col) did not follow expected 0-25 wrapping pattern');
  if (!rowSequenceOk) console.log('  - D00595 (row) did not follow expected 0-9 wrapping pattern');
  if (!allRowsWrapped) console.log('  - At least one 26-character row did not end at next row col 0');
  if (!finalRowWrapOk) console.log('  - Final D00595 row is ' + mem[CURSOR_ROW_ADDR] + ', expected 0');
  if (!finalColWrapOk) console.log('  - Final D00596 col is ' + mem[CURSOR_COL_ADDR] + ', expected 0');
  if (!totalVramApproxOk) {
    console.log(
      '  - Total VRAM changed ' + totalVramChanged.count
      + ' not within ' + TOTAL_VRAM_TOLERANCE
      + ' of ' + EXPECTED_TOTAL_VRAM_BYTES
    );
  }
  process.exitCode = 1;
}

console.log('');
console.log('[phase486] Summary JSON:');
console.log(JSON.stringify({
  totalChars: allRows.length,
  rows: rowSummaries,
  totalVramChanged: {
    count: totalVramChanged.count,
    first: totalVramChanged.first,
    last: totalVramChanged.last,
    expectedApprox: EXPECTED_TOTAL_VRAM_BYTES,
    tolerance: TOTAL_VRAM_TOLERANCE,
  },
  failedVramWrites: failedVramRows.map((row, index) => ({
    index,
    char: row.char,
    code: row.code,
    rowBefore: row.rowBefore,
    colBefore: row.colBefore,
  })),
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
    allRowsWrapped,
    finalRowWrapOk,
    finalColWrapOk,
    totalVramApproxOk,
  },
  passed,
}, null, 2));
