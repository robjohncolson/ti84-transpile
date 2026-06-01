#!/usr/bin/env node
/**
 * probe-phase484-full-line-wrap.mjs
 *
 * Render a full 26-character home-screen row via ROM character output at
 * 0x0059C6, then verify D00596 wraps to column 0 and D00595 advances to row 1.
 * Finally render one more character at row 1, column 0.
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

function changedInsideGlyphCell(addr, row, col) {
  if (addr === null) return false;
  const base = expectedVramAddress(row, col);
  const offset = addr - base;
  if (offset < 0 || offset > 7 * 640 + 11) return false;
  return (offset % 640) < 12;
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
      pad(`'${row.char}'`, 6),
      pad(hex(row.code), 6),
      pad(`${row.colBefore}->${row.colAfter}`, 7),
      pad(`${row.rowBefore}->${row.rowAfter}`, 7),
      pad(row.vramChanged, 7),
      pad(hex(row.d0059cAfter, 6), 10),
      pad(hex(row.expectedStart, 6), 10),
      pad(row.firstChanged === null ? 'none' : hex(row.firstChanged, 6), 10),
      pad(row.steps, 6),
      pad(row.termination, 13),
    ].join('  '));
  });
}

function rowColSequenceOk(rows) {
  return rows.every((row, index) => {
    const expectedBeforeCol = index;
    const expectedBeforeRow = 0;
    const expectedAfterCol = index === 25 ? 0 : index + 1;
    const expectedAfterRow = index === 25 ? 1 : 0;

    return row.colBefore === expectedBeforeCol
      && row.rowBefore === expectedBeforeRow
      && row.colAfter === expectedAfterCol
      && row.rowAfter === expectedAfterRow;
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

console.log('[phase484] Boot stage 1: z80 reset from 0x000000');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log('[phase484] Boot stage 1 complete');

console.log('[phase484] Boot stage 2: kernel init from 0x08C331');
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase484] Boot stage 2 complete');

console.log('[phase484] Boot stage 3: post-init from 0x0802B2');
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase484] Boot stage 3 complete');

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

console.log('[phase484] Display state initialized:');
console.log(`  Boot SP: ${hex(bootStackTop, 6)}`);
console.log(`  D00595 (row): ${hex(mem[CURSOR_ROW_ADDR])}`);
console.log(`  D00596 (col): ${hex(mem[CURSOR_COL_ADDR])}`);
console.log(`  D0059C (VRAM ptr): ${hex(read24(VRAM_PTR_ADDR), 6)}`);
console.log(`  Expected row 0 col 0 VRAM: ${hex(expectedVramAddress(0, 0), 6)}`);

// ========== RENDER A-Z ==========

const initialVram = snapshotVram();
const lineRows = [];

for (let code = 0x41; code <= 0x5A; code++) {
  lineRows.push(runChar(String.fromCharCode(code), code, bootStackTop));
}

const afterLineVram = diffVram(initialVram);
const wrappedAfterLine = mem[CURSOR_COL_ADDR] === 0 && mem[CURSOR_ROW_ADDR] === 1;

// ========== RENDER ONE CHARACTER ON ROW 1 ==========

const extraRow = runChar('a', 0x61, bootStackTop);
const allRows = [...lineRows, extraRow];

// ========== FINAL REPORT ==========

console.log('');
console.log('[phase484] ========== CHARACTER SUMMARY ==========');
printSummaryTable(allRows);

const expectedLineBytes = 26 * 96;
const lineVramInExpectedRange = Math.abs(afterLineVram.count - expectedLineBytes) <= 26 * 16;
const lineCallsCompleted = lineRows.every(completedUnderStepLimit);
const lineCharsChangedVram = lineRows.every((row) => row.vramChanged > 0);
const sequenceOk = rowColSequenceOk(lineRows);
const extraCompleted = completedUnderStepLimit(extraRow);
const extraCursorOk = extraRow.rowBefore === 1
  && extraRow.colBefore === 0
  && extraRow.rowAfter === 1
  && extraRow.colAfter === 1;
const extraVramOk = extraRow.vramChanged > 0
  && changedInsideGlyphCell(extraRow.firstChanged, 1, 0);

const passed = lineCallsCompleted
  && lineCharsChangedVram
  && sequenceOk
  && wrappedAfterLine
  && lineVramInExpectedRange
  && extraCompleted
  && extraCursorOk
  && extraVramOk;

console.log('');
console.log('[phase484] ========== RESULTS ==========');
console.log(`[phase484] A-Z VRAM bytes changed: ${afterLineVram.count} (expected about ${expectedLineBytes})`);
console.log(`[phase484] After A-Z D00596 (col): ${mem[CURSOR_COL_ADDR] === 1 ? extraRow.colBefore : mem[CURSOR_COL_ADDR]}`);
console.log(`[phase484] After A-Z D00595 (row): ${extraRow.rowBefore}`);
console.log(`[phase484] After 'a' D00596 (col): ${mem[CURSOR_COL_ADDR]}`);
console.log(`[phase484] After 'a' D00595 (row): ${mem[CURSOR_ROW_ADDR]}`);
console.log(`[phase484] Row 1 col 0 expected VRAM: ${hex(expectedVramAddress(1, 0), 6)}`);
console.log(`[phase484] Row 1 col 0 first changed VRAM: ${extraRow.firstChanged === null ? 'none' : hex(extraRow.firstChanged, 6)}`);

console.log('');
if (passed) {
  console.log('[phase484] PASS: full line rendered, wrapped to row 1, and rendered row 1 col 0');
} else {
  console.log('[phase484] FAIL:');
  if (!lineCallsCompleted) console.log('  - At least one A-Z call hit max steps or errored');
  if (!lineCharsChangedVram) console.log('  - At least one A-Z character produced no VRAM changes');
  if (!sequenceOk) console.log('  - D00596/D00595 did not follow the expected 0..25->0 row-wrap sequence');
  if (!wrappedAfterLine) console.log('  - After 26 chars, D00596/D00595 was not col 0 row 1');
  if (!lineVramInExpectedRange) console.log(`  - A-Z VRAM changed ${afterLineVram.count}, expected about ${expectedLineBytes}`);
  if (!extraCompleted) console.log("  - The row 1 'a' call hit max steps or errored");
  if (!extraCursorOk) console.log("  - The row 1 'a' cursor transition was not row 1 col 0 -> row 1 col 1");
  if (!extraVramOk) console.log("  - The row 1 'a' VRAM change did not land in the expected row 1 col 0 glyph cell");
  process.exitCode = 1;
}

console.log('');
console.log('[phase484] Summary JSON:');
console.log(JSON.stringify({
  line: lineRows,
  extra: extraRow,
  afterLine: {
    row: extraRow.rowBefore,
    col: extraRow.colBefore,
    vramChanged: afterLineVram.count,
    firstChanged: afterLineVram.first,
    lastChanged: afterLineVram.last,
  },
  final: {
    row: mem[CURSOR_ROW_ADDR],
    col: mem[CURSOR_COL_ADDR],
    d0059c: read24(VRAM_PTR_ADDR),
  },
  checks: {
    lineCallsCompleted,
    lineCharsChangedVram,
    sequenceOk,
    wrappedAfterLine,
    lineVramInExpectedRange,
    extraCompleted,
    extraCursorOk,
    extraVramOk,
  },
  passed,
}, null, 2));
