#!/usr/bin/env node
/**
 * probe-phase485-vram-offset.mjs
 *
 * Investigate VRAM address discrepancy: session 484 showed "Normal Float Radian"
 * rendering at VRAM 0xD4618C, but the formula says row 0 col 0 should be at
 * 0xD40000 + 37*640 + 2*2 = 0xD45C84. That is a ~1288-byte (2 pixel rows) offset.
 *
 * Tests whether D0059C is purely an output variable (always overwritten by the
 * renderer from D00595/D00596) or whether pre-existing values in D0059C or D005A0
 * influence the render target address.
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
const SCRATCH_PIXEL_ROW_ADDR = 0xD005A0;
const D000B2_ADDR = 0xD000B2;
const D00085_ADDR = 0xD00085;

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

function renderChar(charCode, stackTop) {
  cpu.mbase = 0xD0;
  cpu.iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  setAccumulator(charCode);
  cpu.pc = CHAR_OUTPUT_ADDR;
  pushSentinelReturn(stackTop);

  return executor.runFrom(CHAR_OUTPUT_ADDR, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 100,
  });
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

const bootStackTop = cpu.sp & 0xFFFFFF;

// ========== RECORD POST-BOOT STATE ==========

console.log('');
console.log('[phase485] ========== POST-BOOT STATE (before any rendering) ==========');
console.log(`  Boot SP:          ${hex(bootStackTop, 6)}`);
console.log(`  D00595 (row):     ${hex(mem[CURSOR_ROW_ADDR])}`);
console.log(`  D00596 (col):     ${hex(mem[CURSOR_COL_ADDR])}`);
console.log(`  D0059C (VRAM ptr): ${hex(read24(VRAM_PTR_ADDR), 6)}`);
console.log(`  D005A0 (scratch):  ${hex(mem[SCRATCH_PIXEL_ROW_ADDR])}`);
console.log(`  D000B2:           ${hex(mem[D000B2_ADDR])}`);
console.log(`  D00085:           ${hex(mem[D00085_ADDR])}`);
console.log(`  Expected row 0 col 0: ${hex(expectedVramAddress(0, 0), 6)}`);

const postBootD005A0 = mem[SCRATCH_PIXEL_ROW_ADDR];

// Set display flags (same as probe-phase484)
mem[0xD0058B] = 0x70;
mem[0xD0058C] = 0x00;
mem[0xD0058E] = 0x00;

// ========== TEST HELPERS ==========

function setupTest(label, row, col, vramPtr, charCode, charLabel) {
  mem[CURSOR_ROW_ADDR] = row;
  mem[CURSOR_COL_ADDR] = col;
  write24(VRAM_PTR_ADDR, vramPtr);

  // Restore display flags
  mem[0xD0058B] = 0x70;
  mem[0xD0058C] = 0x00;
  mem[0xD0058E] = 0x00;

  const d005a0Before = mem[SCRATCH_PIXEL_ROW_ADDR];
  const before = snapshotVram();

  console.log('');
  console.log(`[phase485] ========== ${label} ==========`);
  console.log(`  Setup: row=${row}, col=${col}, D0059C=${hex(vramPtr, 6)}, char='${charLabel}' (${hex(charCode)})`);
  console.log(`  D005A0 before render: ${hex(d005a0Before)} (decimal: ${d005a0Before})`);
  console.log(`  Expected VRAM addr (formula): ${hex(expectedVramAddress(row, col), 6)}`);

  const result = renderChar(charCode, bootStackTop);
  const changed = diffVram(before);

  const rowAfter = mem[CURSOR_ROW_ADDR];
  const colAfter = mem[CURSOR_COL_ADDR];
  const d0059cAfter = read24(VRAM_PTR_ADDR);
  const d005a0After = mem[SCRATCH_PIXEL_ROW_ADDR];

  console.log(`  Result: steps=${result.steps}, termination=${result.termination}`);
  console.log(`  Cursor after: row=${rowAfter}, col=${colAfter}`);
  console.log(`  D0059C after:  ${hex(d0059cAfter, 6)}`);
  console.log(`  D005A0 after:  ${hex(d005a0After)} (decimal: ${d005a0After})`);
  console.log(`  VRAM changed:  ${changed.count} bytes`);
  console.log(`  First changed: ${changed.first === null ? 'none' : hex(changed.first, 6)}`);
  console.log(`  Last changed:  ${changed.last === null ? 'none' : hex(changed.last, 6)}`);

  if (changed.first !== null) {
    const formulaAddr = expectedVramAddress(row, col);
    const offset = changed.first - formulaAddr;
    console.log(`  Offset from formula: ${offset} bytes (${(offset / 640).toFixed(2)} pixel rows)`);
  }

  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`  Missing blocks: ${result.missingBlocks.map(b => hex(b, 6)).join(', ')}`);
  }

  return {
    label,
    row,
    col,
    vramPtrInput: vramPtr,
    charCode,
    charLabel,
    rowAfter,
    colAfter,
    d0059cAfter,
    d005a0Before,
    d005a0After,
    firstChanged: changed.first,
    lastChanged: changed.last,
    vramChanged: changed.count,
    steps: result.steps,
    termination: result.termination,
    expectedAddr: expectedVramAddress(row, col),
  };
}

// ========== TEST 1: row=0, col=0, D0059C=expected (0xD45C84) ==========

const test1 = setupTest(
  'TEST 1: row=0 col=0, D0059C=expected',
  0, 0, expectedVramAddress(0, 0), 0x41, 'A'
);

// ========== TEST 2: row=0, col=1, D0059C=0xD40000 (deliberately wrong) ==========

const test2 = setupTest(
  'TEST 2: row=0 col=1, D0059C=0xD40000 (wrong)',
  0, 1, 0xD40000, 0x42, 'B'
);

// ========== TEST 3: row=0, col=2, D0059C=0xD50000 (way off) ==========

const test3 = setupTest(
  'TEST 3: row=0 col=2, D0059C=0xD50000 (way off)',
  0, 2, 0xD50000, 0x43, 'C'
);

// ========== TEST 4: row=1, col=0, D0059C=0xD40000 (wrong) ==========

const test4 = setupTest(
  'TEST 4: row=1 col=0, D0059C=0xD40000 (wrong)',
  1, 0, 0xD40000, 0x44, 'D'
);

// ========== ANALYSIS ==========

console.log('');
console.log('[phase485] ========== ANALYSIS ==========');

const expectedAddrs = {
  test1: expectedVramAddress(0, 0),
  test2: expectedVramAddress(0, 1),
  test3: expectedVramAddress(0, 2),
  test4: expectedVramAddress(1, 0),
};

console.log('Expected addresses (from formula row*20+37):');
console.log(`  Test 1 (r0c0): ${hex(expectedAddrs.test1, 6)}`);
console.log(`  Test 2 (r0c1): ${hex(expectedAddrs.test2, 6)}`);
console.log(`  Test 3 (r0c2): ${hex(expectedAddrs.test3, 6)}`);
console.log(`  Test 4 (r1c0): ${hex(expectedAddrs.test4, 6)}`);

console.log('');
console.log('Actual first-changed addresses:');
console.log(`  Test 1: ${test1.firstChanged === null ? 'none' : hex(test1.firstChanged, 6)}`);
console.log(`  Test 2: ${test2.firstChanged === null ? 'none' : hex(test2.firstChanged, 6)}`);
console.log(`  Test 3: ${test3.firstChanged === null ? 'none' : hex(test3.firstChanged, 6)}`);
console.log(`  Test 4: ${test4.firstChanged === null ? 'none' : hex(test4.firstChanged, 6)}`);

// Check if D0059C is purely output
const tests = [test1, test2, test3, test4];
const allMatchFormula = tests.every(t => t.firstChanged === t.expectedAddr);
const anyOffset = tests.some(t => t.firstChanged !== null && t.firstChanged !== t.expectedAddr);

console.log('');
console.log('D0059C output values after render:');
tests.forEach(t => {
  console.log(`  ${t.label}: D0059C=${hex(t.d0059cAfter, 6)} (expected next col: ${hex(expectedVramAddress(t.row, t.col + 1), 6)})`);
});

console.log('');
console.log('D005A0 values:');
console.log(`  Post-boot (before any render): ${hex(postBootD005A0)} (decimal: ${postBootD005A0})`);
tests.forEach(t => {
  console.log(`  After ${t.label}: ${hex(t.d005a0After)} (decimal: ${t.d005a0After})`);
});

// Check for consistent offset
if (anyOffset) {
  const offsets = tests
    .filter(t => t.firstChanged !== null)
    .map(t => t.firstChanged - t.expectedAddr);
  const allSameOffset = offsets.every(o => o === offsets[0]);

  console.log('');
  console.log(`Offsets from formula: [${offsets.join(', ')}]`);
  if (allSameOffset && offsets[0] !== 0) {
    const offsetBytes = offsets[0];
    const offsetRows = offsetBytes / 640;
    console.log(`CONSISTENT OFFSET: ${offsetBytes} bytes = ${offsetRows} pixel rows`);
    console.log('This suggests boot state is influencing the render address.');

    if (postBootD005A0 !== 37) {
      console.log(`D005A0 post-boot is ${postBootD005A0} (expected 37 for formula constant).`);
      console.log('If the renderer reads D005A0 before overwriting it, this would explain the offset.');
    }
  }
}

// ========== VERDICT ==========

console.log('');
console.log('[phase485] ========== VERDICT ==========');

if (allMatchFormula) {
  console.log('[phase485] CONCLUSION (a): D0059C is purely OUTPUT.');
  console.log('  The renderer always computes VRAM address from D00595/D00596 using the formula.');
  console.log('  Pre-existing D0059C value is always overwritten. The session 484 offset');
  console.log('  must come from a different row/col state, not from D0059C leaking in.');
} else if (anyOffset) {
  const offsets = tests
    .filter(t => t.firstChanged !== null)
    .map(t => t.firstChanged - t.expectedAddr);
  const allSameOffset = offsets.every(o => o === offsets[0]);

  if (allSameOffset) {
    console.log('[phase485] CONCLUSION (c): Boot state causes a consistent offset.');
    console.log(`  All renders are offset by ${offsets[0]} bytes from the formula prediction.`);
    console.log('  D0059C input does NOT matter (different inputs, same offset).');
    console.log('  Likely cause: a boot-time variable (D005A0 or similar) shifts the base.');
  } else {
    console.log('[phase485] CONCLUSION (b): D0059C or other state influences the renderer.');
    console.log('  Different D0059C inputs produced different offsets:');
    tests.forEach(t => {
      if (t.firstChanged !== null) {
        console.log(`    ${t.label}: offset=${t.firstChanged - t.expectedAddr}`);
      }
    });
  }
} else {
  console.log('[phase485] INCONCLUSIVE: no VRAM changes detected in any test.');
}

const passed = tests.every(t => t.vramChanged > 0 && t.termination !== 'error');

console.log('');
if (passed) {
  console.log('[phase485] PASS: all 4 tests rendered characters and produced VRAM changes.');
} else {
  console.log('[phase485] FAIL:');
  tests.forEach(t => {
    if (t.vramChanged === 0) console.log(`  - ${t.label}: no VRAM changes`);
    if (t.termination === 'error') console.log(`  - ${t.label}: terminated with error`);
  });
  process.exitCode = 1;
}

console.log('');
console.log('[phase485] Summary JSON:');
console.log(JSON.stringify({
  postBoot: {
    d00595: mem[CURSOR_ROW_ADDR],
    d00596: mem[CURSOR_COL_ADDR],
    d0059c: read24(VRAM_PTR_ADDR),
    d005a0: postBootD005A0,
    d000b2: mem[D000B2_ADDR],
    d00085: mem[D00085_ADDR],
  },
  tests: tests.map(t => ({
    label: t.label,
    row: t.row,
    col: t.col,
    vramPtrInput: t.vramPtrInput,
    expectedAddr: t.expectedAddr,
    firstChanged: t.firstChanged,
    d0059cAfter: t.d0059cAfter,
    d005a0Before: t.d005a0Before,
    d005a0After: t.d005a0After,
    vramChanged: t.vramChanged,
    offsetFromFormula: t.firstChanged !== null ? t.firstChanged - t.expectedAddr : null,
    steps: t.steps,
    termination: t.termination,
  })),
  allMatchFormula,
  passed,
}, null, 2));
