#!/usr/bin/env node
/**
 * Phase 495 — Text editing cluster scan (0x05F000-0x05FFFF)
 *
 * Step 1: Extract BCALL entries whose target falls in 0x05F000-0x05FFFF
 * Step 2: Static scan each entry's ROM bytes for cursor-position and
 *         charRenderer references
 * Step 3: Dynamic test cursor-referencing entries (VRAM diff at two positions)
 * Step 4: Ranked candidate summary
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

const bcallTable = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'bcall-table.json'), 'utf8')
);

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

const CURSOR_ROW_ADDR = 0xD00595;
const CURSOR_COL_ADDR = 0xD00596;

// Byte patterns to search for (little-endian)
const PATTERN_CURSOR_ROW = [0x95, 0x05, 0xD0]; // D00595
const PATTERN_CURSOR_COL = [0x96, 0x05, 0xD0]; // D00596
const PATTERN_CHAR_RENDERER = [0xC6, 0x59, 0x00]; // 0059C6

const CLUSTER_LO = 0x05F000;
const CLUSTER_HI = 0x05FFFF;
const SCAN_WINDOW = 200;

// ── helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesMatch(buf, offset, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (buf[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function scanForPatterns(rom, startAddr, length) {
  const refs = { cursorRow: false, cursorCol: false, charRenderer: false };
  const end = Math.min(startAddr + length, rom.length - 3);
  for (let a = startAddr; a < end; a++) {
    if (bytesMatch(rom, a, PATTERN_CURSOR_ROW)) refs.cursorRow = true;
    if (bytesMatch(rom, a, PATTERN_CURSOR_COL)) refs.cursorCol = true;
    if (bytesMatch(rom, a, PATTERN_CHAR_RENDERER)) refs.charRenderer = true;
  }
  return refs;
}

// ── boot / snapshot / compare (from phase 494) ──────────────────────

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

// ── dynamic test ────────────────────────────────────────────────────

function testEntry(target, cursorRow, cursorCol) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const vramSnap = snapshotVram(mem);

  mem[CURSOR_ROW_ADDR] = cursorRow;
  mem[CURSOR_COL_ADDR] = cursorCol;

  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  purgeRamBlocks(executor);

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

// ── main ────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 495 — Text Editing Cluster Scan (0x05F000-0x05FFFF) ===\n');

  // ── Step 1: Extract cluster entries ──
  console.log('--- Step 1: BCALL entries with target in 0x05F000-0x05FFFF ---');

  const clusterEntries = [];
  for (const entry of bcallTable) {
    const addr = parseInt(entry.target_hex, 16);
    if (addr >= CLUSTER_LO && addr <= CLUSTER_HI) {
      clusterEntries.push({ entry: entry.index, addr });
    }
  }

  console.log(`Found ${clusterEntries.length} entries in cluster:\n`);
  for (const e of clusterEntries) {
    console.log(`  Entry ${e.entry}  ->  ${hex(e.addr)}`);
  }
  console.log('');

  // ── Step 2: Static scan for cursor references ──
  console.log('--- Step 2: Static scan for cursor/charRenderer references ---\n');

  const cursorCandidates = [];
  const allScanResults = [];

  for (const e of clusterEntries) {
    const refs = scanForPatterns(romBytes, e.addr, SCAN_WINDOW);
    const hasCursor = refs.cursorRow || refs.cursorCol;
    const tag = [];
    if (refs.cursorRow) tag.push('cursorRow(D00595)');
    if (refs.cursorCol) tag.push('cursorCol(D00596)');
    if (refs.charRenderer) tag.push('charRenderer(0059C6)');

    const label = tag.length > 0 ? tag.join(', ') : 'none';
    console.log(`  Entry ${e.entry} @ ${hex(e.addr)}: ${label}`);

    allScanResults.push({ ...e, refs });

    if (hasCursor) {
      cursorCandidates.push(e);
    }
  }
  console.log(`\n${cursorCandidates.length} entries reference cursor position RAM.\n`);

  // ── Step 3: Dynamic test of cursor-referencing entries ──
  console.log('--- Step 3: Dynamic VRAM tests ---\n');

  const positionA = { row: 3, col: 10 };
  const positionB = { row: 7, col: 20 };

  const dynamicResults = [];

  for (const e of clusterEntries) {
    const hasCursor = cursorCandidates.some(c => c.entry === e.entry);

    if (!hasCursor) {
      console.log(`  Entry ${e.entry} @ ${hex(e.addr)}: no cursor refs, skipped.`);
      dynamicResults.push({
        entry: e.entry, addr: e.addr, skipped: true,
        vramChangesA: 0, boundingBoxA: null,
        vramChangesB: 0, boundingBoxB: null,
        moved: false, sizeMatch: false,
      });
      continue;
    }

    console.log(`  Entry ${e.entry} @ ${hex(e.addr)}: testing...`);

    const resultA = testEntry(e, positionA.row, positionA.col);
    console.log(`    Position A (row=${positionA.row}, col=${positionA.col}):`);
    console.log(`      changes=${resultA.vramChanges}, steps=${resultA.stepsUsed}, term=${resultA.termination}`);
    if (resultA.boundingBox) {
      const b = resultA.boundingBox;
      console.log(`      bbox: rows ${b.minRow}-${b.maxRow}, cols ${b.minCol}-${b.maxCol} (${b.width}x${b.height})`);
    }

    let resultB = null;
    let moved = false;
    let sizeMatch = false;

    if (resultA.vramChanges > 0) {
      resultB = testEntry(e, positionB.row, positionB.col);
      console.log(`    Position B (row=${positionB.row}, col=${positionB.col}):`);
      console.log(`      changes=${resultB.vramChanges}, steps=${resultB.stepsUsed}, term=${resultB.termination}`);
      if (resultB.boundingBox) {
        const b = resultB.boundingBox;
        console.log(`      bbox: rows ${b.minRow}-${b.maxRow}, cols ${b.minCol}-${b.maxCol} (${b.width}x${b.height})`);
      }

      const boxA = resultA.boundingBox;
      const boxB = resultB.boundingBox;
      moved = boxA && boxB &&
        (boxA.minRow !== boxB.minRow || boxA.minCol !== boxB.minCol);
      sizeMatch = boxA && boxB &&
        Math.abs(boxA.width - boxB.width) <= 2 &&
        Math.abs(boxA.height - boxB.height) <= 2;

      console.log(`    Analysis: moved=${moved}, sizeMatch=${sizeMatch}`);
      if (moved && sizeMatch) {
        console.log(`    >>> CURSOR DRAW CANDIDATE: write region moves with cursor position <<<`);
      }
    } else {
      console.log(`    No VRAM changes -- skipping position B test`);
    }

    dynamicResults.push({
      entry: e.entry,
      addr: e.addr,
      skipped: false,
      vramChangesA: resultA.vramChanges,
      boundingBoxA: resultA.boundingBox,
      vramChangesB: resultB ? resultB.vramChanges : 0,
      boundingBoxB: resultB ? resultB.boundingBox : null,
      moved,
      sizeMatch,
      stepsA: resultA.stepsUsed,
      stepsB: resultB ? resultB.stepsUsed : 0,
      terminationA: resultA.termination,
      terminationB: resultB ? resultB.termination : null,
    });

    console.log('');
  }

  // ── Step 4: Summary ──
  console.log('\n=== SUMMARY — Ranked Candidate List ===\n');

  const ranked = [...dynamicResults].sort((a, b) => {
    const scoreA = (a.moved && a.sizeMatch ? 100 : 0) + (a.vramChangesA || 0);
    const scoreB = (b.moved && b.sizeMatch ? 100 : 0) + (b.vramChangesA || 0);
    return scoreB - scoreA;
  });

  for (const r of ranked) {
    if (r.skipped) {
      console.log(`  Entry ${r.entry} @ ${hex(r.addr)}: SKIPPED (no cursor refs)`);
      continue;
    }

    const tags = [];
    if (r.moved && r.sizeMatch) tags.push('*** CURSOR DRAW CANDIDATE ***');
    if (r.moved && !r.sizeMatch) tags.push('moves but size differs');
    if (!r.moved && (r.vramChangesA || 0) > 0) tags.push('VRAM changes but no position shift');

    const changesLabel = `${r.vramChangesA || 0} VRAM px`;
    console.log(`  Entry ${r.entry} @ ${hex(r.addr)}: ${changesLabel} ${tags.join(' ')}`);

    if (r.boundingBoxA) {
      const b = r.boundingBoxA;
      const cursorSized = b.width >= 12 && b.width <= 16 && b.height >= 14 && b.height <= 16;
      console.log(`    BBox A: rows ${b.minRow}-${b.maxRow}, cols ${b.minCol}-${b.maxCol} (${b.width}x${b.height})${cursorSized ? ' <-- cursor-cell sized' : ''}`);
    }
    if (r.boundingBoxB) {
      const b = r.boundingBoxB;
      const cursorSized = b.width >= 12 && b.width <= 16 && b.height >= 14 && b.height <= 16;
      console.log(`    BBox B: rows ${b.minRow}-${b.maxRow}, cols ${b.minCol}-${b.maxCol} (${b.width}x${b.height})${cursorSized ? ' <-- cursor-cell sized' : ''}`);
    }
  }

  console.log('\nDone.');
}

main();
