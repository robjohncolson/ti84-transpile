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
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const BCD_DIGIT_RENDERER = 0x0B8505;
const GLYPH_RASTERIZER = 0x0A1799;

// Descriptor / cursor RAM locations
const DESC_BASE = 0xD005F8;
const GLYPH_CODE = 0xD005F9;
const DESC_DATA = 0xD005FA;
const VRAM_PTR_LO = 0xD008D2;
const VRAM_ROW_HI = 0xD008D5;
const CUR_ROW = 0xD00595;
const CUR_COL = 0xD00596;

const FAKE_RET = 0xFEFEFE;
const MAX_STEPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, 'z80', {
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

function findVramBoundingBox(mem) {
  let minRow = VRAM_HEIGHT, maxRow = -1;
  let minCol = VRAM_WIDTH, maxCol = -1;
  let nonZeroCount = 0;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== 0x0000) {
        nonZeroCount++;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
  }

  if (maxRow === -1) return { nonZeroCount, bbox: null };
  return {
    nonZeroCount,
    bbox: { minRow, maxRow, minCol, maxCol },
  };
}

async function main() {
  console.log('=== Phase 517 - Trace 0x0B8505 (BCD Digit Renderer) End-to-End ===');
  console.log(`Target: BCD digit renderer at ${hex(BCD_DIGIT_RENDERER)}`);
  console.log(`Expected downstream: glyph rasterizer at ${hex(GLYPH_RASTERIZER)}`);

  // Set up memory and CPU
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Cold boot
  console.log('\n--- Phase 1: Cold Boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  // Clear VRAM so we can detect writes
  mem.fill(0x00, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  // Phase 2: Seed BCD descriptor for "42"
  console.log('\n--- Phase 2: Seed BCD Descriptor ---');

  // Descriptor type byte (non-zero to pass gate at 0x07FD4A)
  mem[DESC_BASE] = 0x01;
  // Glyph code / digit count
  mem[GLYPH_CODE] = 0x02;  // 2 digits
  // BCD data for "42": 0x42 packed BCD
  mem[DESC_DATA + 0] = 0x42;
  mem[DESC_DATA + 1] = 0x00;
  mem[DESC_DATA + 2] = 0x00;
  mem[DESC_DATA + 3] = 0x00;
  mem[DESC_DATA + 4] = 0x00;
  mem[DESC_DATA + 5] = 0x00;
  mem[DESC_DATA + 6] = 0x00;

  // Seed VRAM position - row 37 area (from golden regression)
  // Row 37 in 320-wide 16bpp = 37 * 320 * 2 = 0x5C80
  mem[VRAM_PTR_LO + 0] = 0x80;  // low byte
  mem[VRAM_PTR_LO + 1] = 0x5C;  // high byte
  // D008D5 = row high byte (0x2C for ~row 37 in 12-scanline units)
  mem[VRAM_ROW_HI] = 0x2C;

  // Set cursor position
  mem[CUR_ROW] = 3;
  mem[CUR_COL] = 0;

  console.log(`D005F8 (desc type): ${hex(mem[DESC_BASE], 2)}`);
  console.log(`D005F9 (digit count): ${hex(mem[GLYPH_CODE], 2)}`);
  console.log(`D005FA-D00600 (BCD data): ${Array.from(mem.slice(DESC_DATA, DESC_DATA + 7)).map(b => hex(b, 2)).join(' ')}`);
  console.log(`D008D2-D008D3 (VRAM ptr): ${hex(mem[VRAM_PTR_LO] | (mem[VRAM_PTR_LO + 1] << 8), 4)}`);
  console.log(`D008D5 (row hi): ${hex(mem[VRAM_ROW_HI], 2)}`);
  console.log(`curRow=${mem[CUR_ROW]} curCol=${mem[CUR_COL]}`);

  // Phase 3: Execute 0x0B8505
  console.log('\n--- Phase 3: Execute BCD Digit Renderer ---');

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;  // ADL mode
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 3;

  // Push fake return address (3 bytes in ADL mode)
  cpu.sp -= 3;
  mem[cpu.sp] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

  console.log(`SP=${hex(cpu.sp)}, fake ret=${hex(FAKE_RET)}`);
  console.log(`Starting execution at ${hex(BCD_DIGIT_RENDERER)}...`);

  // Track whether we pass through the rasterizer via onBlock
  let rasterizerHit = false;
  let rasterizerHitStep = -1;
  const pcTrace = [];  // sample block PCs for debugging

  let result;
  try {
    result = executor.runFrom(BCD_DIGIT_RENDERER, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: 500,
      onBlock(pc, mode, meta, steps) {
        // Check if we pass through the rasterizer entry
        if (pc === GLYPH_RASTERIZER && !rasterizerHit) {
          rasterizerHit = true;
          rasterizerHitStep = steps;
          console.log(`  >>> HIT rasterizer ${hex(GLYPH_RASTERIZER)} at step ${steps}`);
        }
        // Capture block PCs for trace (first 50, then every 100th)
        if (steps < 50 || steps % 100 === 0) {
          pcTrace.push({ step: steps, pc });
        }
      },
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

  console.log(`\nResult: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log(`Rasterizer ${hex(GLYPH_RASTERIZER)} reached: ${rasterizerHit ? `YES (step ${rasterizerHitStep})` : 'NO'}`);

  // Print PC trace
  console.log(`\nPC trace (${pcTrace.length} samples):`);
  for (const { step, pc } of pcTrace.slice(0, 40)) {
    console.log(`  step ${String(step).padStart(5)}: PC=${hex(pc)}`);
  }
  if (pcTrace.length > 40) {
    console.log(`  ... (${pcTrace.length - 40} more samples)`);
  }

  // Phase 4: Check registers
  console.log('\n--- Phase 4: Register State ---');
  console.log(`A=${hex(cpu._a, 2)} F=${hex(cpu._f, 2)}`);
  console.log(`HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);
  console.log(`IX=${hex(cpu._ix)} IY=${hex(cpu._iy)} SP=${hex(cpu.sp)}`);

  // Phase 5: Check descriptor state after execution
  console.log('\n--- Phase 5: Descriptor State After ---');
  console.log(`D005F8 (desc type): ${hex(mem[DESC_BASE], 2)}`);
  console.log(`D005F9 (digit count): ${hex(mem[GLYPH_CODE], 2)}`);
  console.log(`D005FA-D00600 (BCD data): ${Array.from(mem.slice(DESC_DATA, DESC_DATA + 7)).map(b => hex(b, 2)).join(' ')}`);
  console.log(`D008D2-D008D3 (VRAM ptr): ${hex(mem[VRAM_PTR_LO] | (mem[VRAM_PTR_LO + 1] << 8), 4)}`);
  console.log(`D008D5 (row hi): ${hex(mem[VRAM_ROW_HI], 2)}`);
  console.log(`curRow=${mem[CUR_ROW]} curCol=${mem[CUR_COL]}`);

  // Phase 6: VRAM analysis
  console.log('\n--- Phase 6: VRAM Analysis ---');

  const fullVram = findVramBoundingBox(mem);
  console.log(`Full VRAM non-zero pixels: ${fullVram.nonZeroCount}`);

  if (fullVram.bbox) {
    const bb = fullVram.bbox;
    console.log(`Bounding box: rows [${bb.minRow}..${bb.maxRow}], cols [${bb.minCol}..${bb.maxCol}]`);
    console.log(`Size: ${bb.maxRow - bb.minRow + 1} rows x ${bb.maxCol - bb.minCol + 1} cols`);
  } else {
    console.log('No bounding box (no non-zero pixels)');
  }

  // Non-zero byte count in VRAM
  const nonZeroBytes = countNonZeroVram(mem, VRAM_BASE, VRAM_BYTE_SIZE);
  console.log(`Full VRAM non-zero bytes: ${nonZeroBytes} / ${VRAM_BYTE_SIZE}`);

  // Dump first 20 non-zero pixel locations
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

  // Summary
  console.log('\n=== Summary ===');
  console.log(`BCD digit renderer (${hex(BCD_DIGIT_RENDERER)}): ${result.steps} steps, ${result.termination}`);
  console.log(`Rasterizer (${hex(GLYPH_RASTERIZER)}) reached: ${rasterizerHit ? 'YES' : 'NO'}`);
  console.log(`VRAM modified: ${nonZeroBytes > 0 ? 'YES' : 'NO'} (${nonZeroBytes} non-zero bytes)`);

  if (rasterizerHit && nonZeroBytes > 0) {
    console.log('RESULT: BCD digit renderer -> rasterizer -> VRAM pipeline VERIFIED end-to-end');
  } else if (rasterizerHit) {
    console.log('RESULT: Rasterizer reached but no VRAM output (state setup may need adjustment)');
  } else if (nonZeroBytes > 0) {
    console.log('RESULT: VRAM written but rasterizer not detected at expected address');
  } else {
    console.log('RESULT: Neither rasterizer reached nor VRAM written - needs investigation');
  }

  process.exitCode = (result.steps > 0) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
