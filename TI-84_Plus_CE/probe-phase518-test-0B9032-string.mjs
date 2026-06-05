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

const STRING_RENDERER = 0x0B9032;
const GLYPH_RASTERIZER = 0x0A1799;
const CHAR_RENDERER = 0x0A1B5B;    // normal-column char renderer called by 0x0B9032

// RAM locations (from disassembly + session 517)
const CUR_ROW = 0xD00595;
const CUR_COL = 0xD00596;
const VRAM_PTR_LO = 0xD008D2;   // 2-byte VRAM offset (low)
const VRAM_ROW_HI = 0xD008D5;   // row high byte

// String data goes in RAM at a safe location
const STRING_ADDR = 0xD01000;

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
  console.log('=== Phase 518 - Test 0x0B9032 (String Renderer) End-to-End ===');
  console.log('');
  console.log('Static disassembly summary of 0x0B9032:');
  console.log('  PUSH BC; PUSH AF');
  console.log('  SET 0,(IY+0x08); SET 1,(IY+0x05)');
  console.log('  LOOP: LD A,(HL)   ; read char from string pointer');
  console.log('        OR A; SCF');
  console.log('        JR Z,cleanup ; 0x00 = terminator');
  console.log('        LD A,(D00596); CP 0x19  ; check curCol vs 25');
  console.log('        LD A,(HL)    ; reload char');
  console.log('        JR C,normal  ; if col<25 -> normal path');
  console.log('        CALL 0x0A1799; XOR A; JR cleanup  ; col>=25: rasterize + exit');
  console.log('  normal: CALL 0x0A1B5B  ; render char normally');
  console.log('        INC HL; JR LOOP');
  console.log('  cleanup: RES 0,(IY+0x08); RES 1,(IY+0x05); POP AF; POP BC; RET');
  console.log('');
  console.log('Key: HL=string pointer, 0x00=terminator, normal path calls 0x0A1B5B (not 0x0A1799)');
  console.log('     0x0A1799 only called for column-wrap case (col>=25)');

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

  // Clear VRAM
  mem.fill(0x00, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  // Phase 2: Set up string data + cursor/VRAM state
  console.log('\n--- Phase 2: Setup ---');

  // Write a short null-terminated string "Hi" (ASCII: H=0x48, i=0x69)
  // TI-OS uses single-byte tokens for standard ASCII chars (1:1 mapping).
  const testString = [0x48, 0x69, 0x00];  // "Hi" + null terminator
  for (let i = 0; i < testString.length; i++) {
    mem[STRING_ADDR + i] = testString[i];
  }
  console.log(`String at ${hex(STRING_ADDR)}: ${testString.map(b => hex(b, 2)).join(' ')} ("Hi\\0")`);

  // Seed VRAM position (same as session 517)
  // Row 37 in 320-wide 16bpp = 37 * 320 * 2 = 0x5C80
  mem[VRAM_PTR_LO + 0] = 0x80;  // low byte
  mem[VRAM_PTR_LO + 1] = 0x5C;  // high byte
  mem[VRAM_ROW_HI] = 0x2C;

  // Set cursor position -- col must be < 25 (0x19) for normal path
  mem[CUR_ROW] = 3;
  mem[CUR_COL] = 0;

  console.log(`VRAM ptr: ${hex(mem[VRAM_PTR_LO] | (mem[VRAM_PTR_LO + 1] << 8), 4)}`);
  console.log(`VRAM row hi: ${hex(mem[VRAM_ROW_HI], 2)}`);
  console.log(`curRow=${mem[CUR_ROW]} curCol=${mem[CUR_COL]}`);

  // Phase 3: Execute 0x0B9032
  console.log('\n--- Phase 3: Execute String Renderer ---');

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;  // ADL mode
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = STRING_ADDR;  // HL = pointer to string
  cpu.sp = STACK_RESET_TOP - 3;

  // Push fake return address (3 bytes in ADL mode)
  cpu.sp -= 3;
  mem[cpu.sp] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

  console.log(`HL=${hex(cpu._hl)} (string pointer)`);
  console.log(`SP=${hex(cpu.sp)}, fake ret=${hex(FAKE_RET)}`);
  console.log(`Starting at ${hex(STRING_RENDERER)}...`);

  // Track block hits
  let rasterizerHits = 0;
  let charRendererHits = 0;
  const pcTrace = [];
  const interestingPCs = new Map();  // PC -> count

  let result;
  try {
    result = executor.runFrom(STRING_RENDERER, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: 500,
      onBlock(pc, mode, meta, steps) {
        if (pc === GLYPH_RASTERIZER) {
          rasterizerHits++;
          console.log(`  >>> HIT glyph rasterizer ${hex(GLYPH_RASTERIZER)} at step ${steps}`);
        }
        if (pc === CHAR_RENDERER) {
          charRendererHits++;
          console.log(`  >>> HIT char renderer ${hex(CHAR_RENDERER)} at step ${steps}`);
        }
        // Track interesting PCs
        interestingPCs.set(pc, (interestingPCs.get(pc) || 0) + 1);
        // Sample trace
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
  console.log(`Glyph rasterizer (${hex(GLYPH_RASTERIZER)}) hits: ${rasterizerHits}`);
  console.log(`Char renderer (${hex(CHAR_RENDERER)}) hits: ${charRendererHits}`);

  // PC trace
  console.log(`\nPC trace (${pcTrace.length} samples):`);
  for (const { step, pc } of pcTrace.slice(0, 40)) {
    console.log(`  step ${String(step).padStart(5)}: PC=${hex(pc)}`);
  }
  if (pcTrace.length > 40) {
    console.log(`  ... (${pcTrace.length - 40} more samples)`);
  }

  // Top visited blocks
  const sorted = [...interestingPCs.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\nTop 20 visited blocks:`);
  for (const [pc, count] of sorted.slice(0, 20)) {
    console.log(`  ${hex(pc)}: ${count} hits`);
  }

  // Phase 4: Registers
  console.log('\n--- Phase 4: Register State ---');
  console.log(`A=${hex(cpu._a, 2)} F=${hex(cpu._f, 2)}`);
  console.log(`HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);
  console.log(`IX=${hex(cpu._ix)} IY=${hex(cpu._iy)} SP=${hex(cpu.sp)}`);

  // Phase 5: Cursor state after
  console.log('\n--- Phase 5: Cursor State After ---');
  console.log(`curRow=${mem[CUR_ROW]} curCol=${mem[CUR_COL]}`);
  console.log(`VRAM ptr: ${hex(mem[VRAM_PTR_LO] | (mem[VRAM_PTR_LO + 1] << 8), 4)}`);
  console.log(`VRAM row hi: ${hex(mem[VRAM_ROW_HI], 2)}`);

  // Phase 6: VRAM analysis
  console.log('\n--- Phase 6: VRAM Analysis ---');
  const vram = findVramBoundingBox(mem);
  console.log(`Non-zero pixels: ${vram.nonZeroCount}`);

  if (vram.bbox) {
    const bb = vram.bbox;
    console.log(`Bounding box: rows [${bb.minRow}..${bb.maxRow}], cols [${bb.minCol}..${bb.maxCol}]`);
    console.log(`Size: ${bb.maxRow - bb.minRow + 1} rows x ${bb.maxCol - bb.minCol + 1} cols`);
  } else {
    console.log('No bounding box (no non-zero pixels)');
  }

  // Count non-zero VRAM bytes
  let nonZeroBytes = 0;
  for (let i = 0; i < VRAM_BYTE_SIZE; i++) {
    if (mem[VRAM_BASE + i] !== 0) nonZeroBytes++;
  }
  console.log(`Non-zero VRAM bytes: ${nonZeroBytes} / ${VRAM_BYTE_SIZE}`);

  // First 20 non-zero pixels
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
  console.log(`String renderer (${hex(STRING_RENDERER)}): ${result.steps} steps, ${result.termination}`);
  console.log(`Char renderer (${hex(CHAR_RENDERER)}) hits: ${charRendererHits} (expected: 2 for "Hi")`);
  console.log(`Glyph rasterizer (${hex(GLYPH_RASTERIZER)}) hits: ${rasterizerHits}`);
  console.log(`VRAM modified: ${nonZeroBytes > 0 ? 'YES' : 'NO'} (${nonZeroBytes} non-zero bytes)`);

  if (charRendererHits > 0 && nonZeroBytes > 0) {
    console.log('RESULT: String renderer -> char renderer -> VRAM pipeline VERIFIED');
  } else if (rasterizerHits > 0 && nonZeroBytes > 0) {
    console.log('RESULT: String renderer -> glyph rasterizer -> VRAM pipeline VERIFIED (wrap path)');
  } else if (charRendererHits > 0 || rasterizerHits > 0) {
    console.log('RESULT: Renderer(s) reached but no VRAM output');
  } else if (result.termination === 'returned' && result.steps < 100) {
    console.log('RESULT: Returned quickly - string may have been read as empty (check HL setup)');
  } else {
    console.log('RESULT: Needs investigation');
  }

  process.exitCode = (result.steps > 0) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
