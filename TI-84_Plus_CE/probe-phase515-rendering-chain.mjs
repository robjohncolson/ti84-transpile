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

const GLYPH_RASTERIZER = 0x0A1799;
const FONT_ATLAS_BASE = 0x003D6E;
const GLYPH_W = 16;
const GLYPH_H = 14;
const GLYPH_BYTES = 28;

// Cursor / glyph RAM locations
const CUR_ROW = 0xD00595;
const CUR_COL = 0xD00596;
const GLYPH_CODE = 0xD005F9;

const FAKE_RET = 0xFEFEFE;
const RASTERIZER_MAX_STEPS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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
  console.log('=== Phase 515 - Rendering Chain Probe ===');
  console.log(`Target: glyph rasterizer at ${hex(GLYPH_RASTERIZER)}`);
  console.log(`Font atlas: ${hex(FONT_ATLAS_BASE)} (${GLYPH_W}x${GLYPH_H}, ${GLYPH_BYTES} bytes/glyph)`);

  // Set up memory and CPU
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Cold boot (standard OS init)
  console.log('\n--- Phase 1: Cold Boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  // Clear VRAM to zero so we can detect any writes
  mem.fill(0x00, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  // Snapshot VRAM before rasterizer call
  const vramBefore = countNonZeroVram(mem, VRAM_BASE, 2048);
  console.log(`VRAM first 2KB non-zero bytes before: ${vramBefore}`);

  // Phase 2: Set up rendering state
  console.log('\n--- Phase 2: Set Up Rendering State ---');
  mem[CUR_ROW] = 0;
  mem[CUR_COL] = 0;
  mem[GLYPH_CODE] = 0x41; // 'A'
  console.log(`curRow (${hex(CUR_ROW)}): ${mem[CUR_ROW]}`);
  console.log(`curCol (${hex(CUR_COL)}): ${mem[CUR_COL]}`);
  console.log(`glyphCode (${hex(GLYPH_CODE)}): 0x${mem[GLYPH_CODE].toString(16)} ('${String.fromCharCode(mem[GLYPH_CODE])}')`);

  // Verify font atlas has data at the expected glyph offset
  const glyphOffset = FONT_ATLAS_BASE + (0x41 * GLYPH_BYTES);
  let fontBytes = 0;
  for (let i = 0; i < GLYPH_BYTES; i++) {
    if (romBytes[glyphOffset + i] !== 0) fontBytes++;
  }
  console.log(`Font atlas 'A' at ${hex(glyphOffset)}: ${fontBytes}/${GLYPH_BYTES} non-zero bytes`);

  // Phase 3: Call glyph rasterizer
  console.log('\n--- Phase 3: Call Glyph Rasterizer ---');

  // Set up stack with fake return address
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

  console.log(`SP=${hex(cpu.sp)}, fake ret=${hex(FAKE_RET)}`);
  console.log(`Starting execution at ${hex(GLYPH_RASTERIZER)}...`);

  let result;
  try {
    result = executor.runFrom(GLYPH_RASTERIZER, 'adl', {
      maxSteps: RASTERIZER_MAX_STEPS,
      maxLoopIterations: 500,
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
      console.error(`Execution error: ${err.message}`);
    }
  }

  console.log(`Rasterizer: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);

  // Phase 4: Check VRAM for changes
  console.log('\n--- Phase 4: VRAM Analysis ---');

  const vramAfter = countNonZeroVram(mem, VRAM_BASE, 2048);
  console.log(`VRAM first 2KB non-zero bytes after: ${vramAfter}`);
  console.log(`VRAM change in first 2KB: ${vramAfter - vramBefore} bytes`);

  // Check the full VRAM
  const fullVramNonZero = countNonZeroVram(mem, VRAM_BASE, VRAM_BYTE_SIZE);
  console.log(`Full VRAM non-zero bytes: ${fullVramNonZero} / ${VRAM_BYTE_SIZE}`);

  // Scan the top-left region where row=0 col=0 glyph should render
  // At row 0, col 0 the glyph occupies roughly 16x14 pixels starting near (0,0)
  const topLeft = scanVramRegion(mem, 0, 19, 0, 19);
  console.log(`Top-left 20x20: total=${topLeft.total} nonZero=${topLeft.nonZero} nonWhite=${topLeft.nonWhite}`);

  // Wider scan for first few rows
  const firstRows = scanVramRegion(mem, 0, 29, 0, VRAM_WIDTH - 1);
  console.log(`First 30 rows full width: total=${firstRows.total} nonZero=${firstRows.nonZero} nonWhite=${firstRows.nonWhite}`);

  // Dump first few non-zero pixel locations
  console.log('\nFirst 20 non-zero pixel locations:');
  let found = 0;
  for (let row = 0; row < VRAM_HEIGHT && found < 20; row++) {
    for (let col = 0; col < VRAM_WIDTH && found < 20; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== 0x0000) {
        console.log(`  pixel(${row}, ${col}) = ${hex(pixel, 4)}`);
        found++;
      }
    }
  }

  // Check curRow/curCol after rasterizer (may have advanced)
  console.log(`\ncurRow after: ${mem[CUR_ROW]}`);
  console.log(`curCol after: ${mem[CUR_COL]}`);

  // Summary
  console.log('\n=== Summary ===');
  const vramChanged = fullVramNonZero > 0;
  console.log(`VRAM modified: ${vramChanged ? 'YES' : 'NO'} (${fullVramNonZero} non-zero bytes)`);
  console.log(`Rasterizer terminated: ${result.termination}`);
  console.log(`Steps taken: ${result.steps}`);

  if (vramChanged) {
    console.log('RESULT: Glyph rasterizer wrote to VRAM');
  } else {
    console.log('RESULT: No VRAM changes detected - rasterizer may need different setup');
  }

  // Exit 0 if we got any VRAM changes or the rasterizer at least ran some steps
  process.exitCode = (result.steps > 0) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
