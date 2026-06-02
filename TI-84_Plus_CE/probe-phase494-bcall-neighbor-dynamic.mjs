#!/usr/bin/env node
/**
 * Phase 494 — BCALL neighbor dynamic probe
 *
 * Tests BCALL table entries near entry 832 (cursor erase at 0x061003)
 * to find the cursor DRAW function.  For each candidate we:
 *   1. Boot CPU to idle state
 *   2. Snapshot VRAM
 *   3. Set cursor position and IY, then run the target address
 *   4. Compare VRAM to snapshot — count changes and bounding box
 *   5. If VRAM changed, repeat with a different cursor position
 *      to see if the write region moves (draw vs erase).
 */

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
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Cursor position RAM locations
const CURSOR_ROW_ADDR = 0xD00595;
const CURSOR_COL_ADDR = 0xD00596;

// Target entries: entry number -> jump target address
const TARGETS = [
  { entry: 826, addr: 0x060B8D },
  { entry: 827, addr: 0x060C23 },
  { entry: 828, addr: 0x060C39 },
  { entry: 829, addr: 0x060EF5 },
  { entry: 830, addr: 0x060F85 },
  { entry: 831, addr: 0x060FEA },
  { entry: 833, addr: 0x06118A },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function snapshotVram(mem) {
  return new Uint8Array(mem.buffer, VRAM_BASE, VRAM_BYTE_SIZE).slice();
}

function compareVram(mem, snapshot) {
  let changes = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let i = 0; i < VRAM_BYTE_SIZE; i += 2) {
    const oldLo = snapshot[i];
    const oldHi = snapshot[i + 1];
    const newLo = mem[VRAM_BASE + i];
    const newHi = mem[VRAM_BASE + i + 1];

    if (oldLo !== newLo || oldHi !== newHi) {
      changes++;
      const pixelIndex = i / 2;
      const row = Math.floor(pixelIndex / VRAM_WIDTH);
      const col = pixelIndex % VRAM_WIDTH;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  const boundingBox = changes > 0
    ? { minRow, maxRow, minCol, maxCol, width: maxCol - minCol + 1, height: maxRow - minRow + 1 }
    : null;

  return { changes, boundingBox };
}

function purgeRamBlocks(executor) {
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) {
      delete blocks[key];
    }
  }
}

function testEntry(target, cursorRow, cursorCol) {
  // Fresh CPU for each test to avoid state contamination
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  // Clear VRAM to white (0xFFFF per pixel)
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Boot to idle state
  coldBoot(executor, cpu, mem);

  // Snapshot VRAM after boot
  const vramSnap = snapshotVram(mem);

  // Set cursor position
  mem[CURSOR_ROW_ADDR] = cursorRow;
  mem[CURSOR_COL_ADDR] = cursorCol;

  // Set IY
  cpu._iy = 0xD00080;

  // Prepare stack with return address in unmapped space (causes termination)
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  // Purge RAM blocks for clean execution
  purgeRamBlocks(executor);

  // Run from target address
  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(target.addr, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000 || pc >= 0xF00000) {
          throw new Error(`ram_halt at ${hex(pc)} after ${steps} steps`);
        }
      },
    });
    stepsUsed = result.steps;
    termination = result.termination;
    lastPc = result.lastPc;
  } catch (e) {
    const match = e.message.match(/after (\d+) steps/);
    stepsUsed = match ? parseInt(match[1]) : -1;
    termination = e.message;
    lastPc = cpu.pc;
  }

  // Compare VRAM
  const { changes, boundingBox } = compareVram(mem, vramSnap);

  return {
    entry: target.entry,
    address: hex(target.addr),
    cursorRow,
    cursorCol,
    stepsUsed,
    termination,
    lastPc: hex(lastPc),
    vramChanges: changes,
    boundingBox,
  };
}

function main() {
  console.log('=== Phase 494 — BCALL Neighbor Dynamic Probe ===');
  console.log(`Testing ${TARGETS.length} entries near cursor erase (entry 832 = 0x061003)`);
  console.log('');

  const positionA = { row: 3, col: 10 };
  const positionB = { row: 7, col: 20 };

  const results = [];

  for (const target of TARGETS) {
    console.log(`--- Entry ${target.entry} @ ${hex(target.addr)} ---`);

    // First test: cursor position A
    const resultA = testEntry(target, positionA.row, positionA.col);
    console.log(`  Position A (row=${positionA.row}, col=${positionA.col}):`);
    console.log(`    ${JSON.stringify(resultA)}`);

    if (resultA.vramChanges > 0) {
      // Second test: cursor position B — check if write region moves
      const resultB = testEntry(target, positionB.row, positionB.col);
      console.log(`  Position B (row=${positionB.row}, col=${positionB.col}):`);
      console.log(`    ${JSON.stringify(resultB)}`);

      // Analyze: did the write region move with cursor position?
      const boxA = resultA.boundingBox;
      const boxB = resultB.boundingBox;
      const moved = boxA && boxB &&
        (boxA.minRow !== boxB.minRow || boxA.minCol !== boxB.minCol);
      const sizeMatch = boxA && boxB &&
        Math.abs(boxA.width - boxB.width) <= 2 &&
        Math.abs(boxA.height - boxB.height) <= 2;

      console.log(`  Analysis: moved=${moved}, sizeMatch=${sizeMatch}`);
      if (moved && sizeMatch) {
        console.log(`  >>> CURSOR DRAW CANDIDATE: write region moves with cursor position <<<`);
      }

      results.push({ ...resultA, resultB, moved, sizeMatch });
    } else {
      console.log(`  No VRAM changes — skipping position B test`);
      results.push(resultA);
    }

    console.log('');
  }

  // Summary
  console.log('=== SUMMARY ===');
  for (const r of results) {
    const tag = r.moved && r.sizeMatch ? ' *** CURSOR DRAW CANDIDATE ***' : '';
    console.log(`  Entry ${r.entry} @ ${r.address}: ${r.vramChanges} VRAM changes${tag}`);
    if (r.boundingBox) {
      console.log(`    BBox: rows ${r.boundingBox.minRow}-${r.boundingBox.maxRow}, cols ${r.boundingBox.minCol}-${r.boundingBox.maxCol} (${r.boundingBox.width}x${r.boundingBox.height})`);
    }
  }

  console.log('\nDone.');
}

main();
