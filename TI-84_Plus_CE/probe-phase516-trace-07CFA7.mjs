#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load ROM and transpiled blocks
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// Constants
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

// Target: standard text renderer (one level above rasterizer)
const TEXT_RENDERER = 0x07CFA7;

// Sub-functions called by 0x07CFA7 (for tracing)
const SUB_CALLS = new Map([
  [0x07CF9D, 'pre-render setup'],
  [0x07FE9C, 'type rewriter/normalizer'],
  [0x07F7A4, 'type classifier'],
  [0x07FE5A, 'remap'],
  [0x07F16C, 'unknown (A=4)'],
  [0x07C8B7, 'BCD position calc (key render)'],
  [0x07F7D6, 'post-type-check'],
  [0x07CF8E, 'post-render + LDIR backup'],
  [0x07FE24, 'alternate exit'],
  [0x0A1799, 'glyph rasterizer'],
]);

// Cursor / descriptor RAM locations
const CUR_ROW = 0xD00595;
const CUR_COL = 0xD00596;
const DESC_TYPE = 0xD005F8;
const GLYPH_CODE = 0xD005F9;

// D00603 area -- 55-byte descriptor backup destination
const D00603 = 0xD00603;
const D02B39 = 0xD02B39;

// Additional state needed by 0x07C8B7 (BCD position calc)
const D005FA = 0xD005FA; // flag read by 0x07FD4A -- must be non-zero
const D00605 = 0xD00605; // read by 0x07FD50 -- must be non-zero

const FAKE_RET = 0xFEFEFE;
const MAX_STEPS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

function countNonZeroVram(mem, startOffset, length) {
  let count = 0;
  for (let i = 0; i < length; i++) {
    if (mem[startOffset + i] !== 0) count++;
  }
  return count;
}

function scanVramRegion(mem, rowStart, rowEnd, colStart, colEnd) {
  let nonWhite = 0;
  let nonZero = 0;
  let total = 0;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      total++;
      if (pixel !== 0x0000) nonZero++;
      if (pixel !== 0xFFFF) nonWhite++;
    }
  }

  return { total, nonZero, nonWhite };
}

async function main() {
  console.log('=== Phase 516 - Trace 0x07CFA7 Standard Text Renderer ===');
  console.log('Target: standard text renderer at ' + hex(TEXT_RENDERER));
  console.log('Chain: 0x07CFA7 -> 0x07C8B7 (BCD pos calc) -> 0x0A1799 (rasterizer)');

  // Set up memory and CPU
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Cold boot
  console.log('\n--- Phase 1: Cold Boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log('boot: steps=' + bootResult.steps + ' term=' + bootResult.termination + ' lastPc=' + hex(bootResult.lastPc));

  // Clear VRAM
  mem.fill(0x00, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  // Phase 2: Seed descriptor and cursor state
  console.log('\n--- Phase 2: Seed Descriptor + Cursor State ---');

  // Descriptor type byte -- standard text type.
  // From 0x07FE9C decoder: type 0x20 -> C=0x00 (normalized).
  // Type=0x00 is the simplest standard text descriptor.
  mem[DESC_TYPE] = 0x00;
  mem[GLYPH_CODE] = 0x41; // 'A'
  console.log('D005F8 (desc type): ' + hex(mem[DESC_TYPE], 2));
  console.log('D005F9 (glyph code): ' + hex(mem[GLYPH_CODE], 2) + " ('A')");

  // Cursor position: row 2, col 3 (avoid row 0 which might be status bar)
  mem[CUR_ROW] = 2;
  mem[CUR_COL] = 3;
  console.log('curRow (' + hex(CUR_ROW) + '): ' + mem[CUR_ROW]);
  console.log('curCol (' + hex(CUR_COL) + '): ' + mem[CUR_COL]);

  // Seed D005FA (flag for 0x07FD4A -- non-zero to proceed past RET Z)
  // and D00605 (read by 0x07FD50 -- non-zero to proceed past JP Z)
  mem[D005FA] = 0x01;
  mem[D00605] = 0x01;
  console.log('D005FA (0x07FD4A flag): ' + hex(mem[D005FA], 2));
  console.log('D00605 (0x07FD50 flag): ' + hex(mem[D00605], 2));

  // Seed BCD digit accumulators D00601-D00617 with a simple number
  // Place digit '4' (0x41 = 'A' glyph code after BCD -> ASCII) in first position
  mem[0xD00601] = 0x00;
  mem[0xD00602] = 0x00;
  console.log('BCD accumulators seeded at D00601-D00617');

  // Snapshot D00603 region before (post-render does LDIR D00603->D02B39, 55 bytes)
  const d00603Before = new Uint8Array(55);
  d00603Before.set(mem.slice(D00603, D00603 + 55));

  const d02b39Before = new Uint8Array(55);
  d02b39Before.set(mem.slice(D02B39, D02B39 + 55));

  // Snapshot VRAM
  const vramBefore = countNonZeroVram(mem, VRAM_BASE, VRAM_BYTE_SIZE);
  console.log('VRAM non-zero bytes before: ' + vramBefore);

  // Phase 3: Call 0x07CFA7
  console.log('\n--- Phase 3: Call 0x07CFA7 (Standard Text Renderer) ---');

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1; // ADL mode
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 3;

  // Push fake return address (3 bytes in ADL mode)
  cpu.sp -= 3;
  mem[cpu.sp] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

  console.log('SP=' + hex(cpu.sp) + ', fake ret=' + hex(FAKE_RET));
  console.log('Starting execution at ' + hex(TEXT_RENDERER) + '...');

  let result;
  try {
    result = executor.runFrom(TEXT_RENDERER, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: 2000,
      onMissingBlock(pc, _mode, steps) {
        if (pc === FAKE_RET || pc >= 0xFE0000) {
          throw Object.assign(new Error('fake_ret'), { haltPc: pc, haltSteps: steps });
        }
        if (pc >= 0xD00000) {
          throw Object.assign(new Error('ram_halt'), { haltPc: pc, haltSteps: steps });
        }
      },
    });
  } catch (err) {
    if (err.message === 'fake_ret') {
      result = { steps: err.haltSteps, termination: 'returned', lastPc: err.haltPc };
    } else if (err.message === 'ram_halt') {
      result = { steps: err.haltSteps, termination: 'ram_halt', lastPc: err.haltPc };
    } else {
      result = { steps: 0, termination: 'error', lastPc: 0, error: err.message };
      console.error('Execution error: ' + err.message);
      if (err.stack) console.error(err.stack);
    }
  }

  console.log('Result: steps=' + result.steps + ' term=' + result.termination + ' lastPc=' + hex(result.lastPc));

  // Phase 4: Cursor state changes
  console.log('\n--- Phase 4: Cursor State After ---');
  console.log('curRow: ' + mem[CUR_ROW] + ' (was 2)');
  console.log('curCol: ' + mem[CUR_COL] + ' (was 3)');
  console.log('D005F8 (desc type): ' + hex(mem[DESC_TYPE], 2) + ' (was 0x00)');
  console.log('D005F9 (glyph): ' + hex(mem[GLYPH_CODE], 2) + ' (was 0x41)');

  // Check D00603->D02B39 LDIR backup
  let d00603Changed = 0;
  let d02b39Changed = 0;
  for (let i = 0; i < 55; i++) {
    if (mem[D00603 + i] !== d00603Before[i]) d00603Changed++;
    if (mem[D02B39 + i] !== d02b39Before[i]) d02b39Changed++;
  }
  console.log('D00603 region: ' + d00603Changed + '/55 bytes changed');
  console.log('D02B39 region: ' + d02b39Changed + '/55 bytes changed (LDIR target)');

  // Phase 6: VRAM analysis
  console.log('\n--- Phase 6: VRAM Analysis ---');

  const vramAfter = countNonZeroVram(mem, VRAM_BASE, VRAM_BYTE_SIZE);
  console.log('VRAM non-zero bytes after: ' + vramAfter);
  console.log('VRAM change: ' + (vramAfter - vramBefore) + ' bytes');

  // Scan different regions
  const topLeft = scanVramRegion(mem, 0, 29, 0, 29);
  console.log('Top-left 30x30: total=' + topLeft.total + ' nonZero=' + topLeft.nonZero + ' nonWhite=' + topLeft.nonWhite);

  // Row 2, col 3 area (where cursor was set -- each text row ~14px, each col ~10px)
  // Approximate pixel region: row 2*14=28..41, col 3*10=30..45
  const cursorArea = scanVramRegion(mem, 20, 50, 20, 60);
  console.log('Cursor area (rows 20-50, cols 20-60): total=' + cursorArea.total + ' nonZero=' + cursorArea.nonZero + ' nonWhite=' + cursorArea.nonWhite);

  // Wider scan
  const fullWidth = scanVramRegion(mem, 0, 59, 0, VRAM_WIDTH - 1);
  console.log('First 60 rows full width: total=' + fullWidth.total + ' nonZero=' + fullWidth.nonZero + ' nonWhite=' + fullWidth.nonWhite);

  // First 20 non-zero pixel locations
  console.log('\nFirst 20 non-zero pixel locations:');
  let found = 0;
  for (let row = 0; row < VRAM_HEIGHT && found < 20; row++) {
    for (let col = 0; col < VRAM_WIDTH && found < 20; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== 0x0000) {
        console.log('  pixel(' + row + ', ' + col + ') = ' + hex(pixel, 4));
        found++;
      }
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  const vramChanged = vramAfter > vramBefore;
  console.log('VRAM modified: ' + (vramChanged ? 'YES' : 'NO') + ' (' + vramAfter + ' non-zero bytes)');
  console.log('Terminated: ' + result.termination);
  console.log('Steps: ' + result.steps);
  console.log('Expected sub-calls: ' + Array.from(SUB_CALLS.entries()).map(function(e) { return hex(e[0]) + ' (' + e[1] + ')'; }).join(', '));
  console.log('Cursor moved: row ' + (mem[CUR_ROW] !== 2 ? 'YES' : 'NO') + ', col ' + (mem[CUR_COL] !== 3 ? 'YES' : 'NO'));
  console.log('D02B39 backup written: ' + (d02b39Changed > 0 ? 'YES' : 'NO') + ' (' + d02b39Changed + ' bytes)');

  if (vramChanged && result.steps > 100) {
    console.log('RESULT: 0x07CFA7 rendered to VRAM via full chain');
  } else if (result.steps > 10) {
    console.log('RESULT: 0x07CFA7 executed but no VRAM change -- check descriptor type setup');
  } else {
    console.log('RESULT: 0x07CFA7 bailed early -- likely descriptor validation failure');
  }

  process.exitCode = (result.steps > 0) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
