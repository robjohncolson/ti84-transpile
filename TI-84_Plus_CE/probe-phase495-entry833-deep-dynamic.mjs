#!/usr/bin/env node
/**
 * Phase 495 — Deep dynamic test of BCALL entry 833 (0x06118A)
 *
 * Tests cursor draw candidate at 3 cursor positions with 100K step limit.
 * For each position: cold boot, snapshot VRAM, set cursor row/col + IY,
 * run from 0x06118A, compare VRAM (changes + bounding box).
 *
 * Verifies: does the write region consistently match cursor-cell size?
 * Does position move with row/col?
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

// Target address — BCALL entry 833
const TARGET_ADDR = 0x06118A;

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

function testPosition(label, cursorRow, cursorCol) {
  console.log(`--- Position ${label}: row=${cursorRow}, col=${cursorCol} ---`);

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

  // Run from target address with 100K step limit
  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 1000,
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

  const result = {
    label,
    cursorRow,
    cursorCol,
    stepsUsed,
    termination,
    lastPc: hex(lastPc),
    vramChanges: changes,
    boundingBox,
  };

  console.log(`  Steps:       ${stepsUsed}`);
  console.log(`  Termination: ${termination}`);
  console.log(`  Last PC:     ${hex(lastPc)}`);
  console.log(`  VRAM changes: ${changes} pixels`);
  if (boundingBox) {
    console.log(`  Bounding box: rows ${boundingBox.minRow}-${boundingBox.maxRow}, cols ${boundingBox.minCol}-${boundingBox.maxCol}`);
    console.log(`  BBox size:    ${boundingBox.width}x${boundingBox.height}`);
  } else {
    console.log('  No VRAM changes detected');
  }
  console.log('');

  return result;
}

function main() {
  console.log('=== Phase 495 — Entry 833 Deep Dynamic Probe (100K steps) ===');
  console.log(`Target: BCALL entry 833 @ ${hex(TARGET_ADDR)}`);
  console.log('');

  // Test 3 cursor positions
  const resultA = testPosition('A', 3, 10);
  const resultB = testPosition('B', 7, 20);
  const resultC = testPosition('C', 0, 0);

  // Summary analysis
  console.log('=== SUMMARY ===');
  console.log('');

  const results = [resultA, resultB, resultC];

  // Print compact table
  console.log('  Label | Row,Col | VRAM Changes | BBox Size    | Steps  | Termination');
  console.log('  ------|---------|--------------|--------------|--------|------------');
  for (const r of results) {
    const bbox = r.boundingBox ? `${r.boundingBox.width}x${r.boundingBox.height}` : 'N/A';
    const bboxPad = bbox.padEnd(12);
    console.log(`  ${r.label.padEnd(5)} | ${String(r.cursorRow).padStart(3)},${String(r.cursorCol).padEnd(3)} | ${String(r.vramChanges).padStart(12)} | ${bboxPad} | ${String(r.stepsUsed).padStart(6)} | ${r.termination}`);
  }
  console.log('');

  // Check if region moves with cursor position
  const allHaveChanges = results.every(r => r.vramChanges > 0);
  if (allHaveChanges) {
    const boxes = results.map(r => r.boundingBox);

    // Check position movement
    const positionsMoved = (
      boxes[0].minRow !== boxes[1].minRow ||
      boxes[0].minCol !== boxes[1].minCol
    ) && (
      boxes[1].minRow !== boxes[2].minRow ||
      boxes[1].minCol !== boxes[2].minCol
    );

    // Check consistent size (within tolerance of 2 pixels)
    const sizeConsistent = boxes.every(b =>
      Math.abs(b.height - boxes[0].height) <= 2 &&
      Math.abs(b.width - boxes[0].width) <= 2
    );

    // Check if height matches cursor cell (14 pixels)
    const heightMatchesCursorCell = boxes.every(b =>
      b.height >= 12 && b.height <= 16
    );

    console.log(`  All positions have VRAM changes: YES`);
    console.log(`  Write region moves with cursor position: ${positionsMoved ? 'YES' : 'NO'}`);
    console.log(`  Consistent bounding box size: ${sizeConsistent ? 'YES' : 'NO'}`);
    console.log(`  Height matches cursor cell (~14px): ${heightMatchesCursorCell ? 'YES' : 'NO'}`);

    if (positionsMoved && sizeConsistent && heightMatchesCursorCell) {
      console.log('');
      console.log('  >>> CONFIRMED: Entry 833 is the cursor DRAW function <<<');
    } else if (positionsMoved && sizeConsistent) {
      console.log('');
      console.log('  >>> STRONG CANDIDATE: region moves and size is consistent <<<');
    }
  } else {
    console.log('  Not all positions produced VRAM changes.');
    for (const r of results) {
      if (r.vramChanges === 0) {
        console.log(`    Position ${r.label} (row=${r.cursorRow}, col=${r.cursorCol}): NO changes`);
      }
    }
  }

  console.log('');
  console.log('Done.');
}

main();
