#!/usr/bin/env node
// Phase 453 probe: decode rendered text from VRAM diff.
//
// Boots to home screen, injects key "1", computes a pixel-level VRAM diff,
// renders ASCII art of changed rows, and attempts glyph segmentation by
// finding vertical gap columns between characters in each text band.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

// --- Constants ---
const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2; // 153600
const PIXELS_PER_ROW = 320;
const LCD_ROWS = 240;
const BYTES_PER_ROW = PIXELS_PER_ROW * 2;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
const FLASH_ROUTINE_RAM_DST = 0xD18C22;
const FLASH_ROUTINE_LEN = 0x5A;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_BUFFER_ADDR = 0xD141B5;

const KEY_ONE_SCAN = 0x12;
const EVENT_LOOP_STEPS = 500000;
const MAX_LOOP_ITERATIONS = 5000;

const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

// --- Boot sequence (copied from phase 451/452) ---

function bootToHomeScreen(executor, cpu, mem, romBytes) {
  console.log('=== Boot Sequence ===');

  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(
    `  boot: steps=${count(bootResult.steps)} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  console.log(
    `  kernel: steps=${count(kernelResult.steps)} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`,
  );

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
  console.log(
    `  postInit: steps=${count(postInitResult.steps)} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`,
  );

  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    fillSentinel(mem, cpu.sp, 12);

    const stageResult = executor.runFrom(entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
    console.log(
      `  stage${i + 1}: entry=${hex(entry)} steps=${count(stageResult.steps)} term=${stageResult.termination} lastPc=${hex(stageResult.lastPc)}`,
    );
  }

  // Pre-copy flash self-test routine from ROM to RAM.
  mem.copyWithin(FLASH_ROUTINE_RAM_DST, FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN);
  console.log(
    `  ramCopy: rom=${hex(FLASH_ROUTINE_ROM_SRC)} -> ram=${hex(FLASH_ROUTINE_RAM_DST)} bytes=${FLASH_ROUTINE_LEN}`,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);

  return { resumePc: EVENT_LOOP_ENTRY, resumeMode: 'adl' };
}

// --- Event loop with DI+HALT bypass ---

function runEventLoopWithHaltBypass(executor, cpu, startPc, startMode, maxSteps) {
  let totalSteps = 0;
  let haltBypasses = 0;
  let currentPc = startPc;
  let currentMode = startMode;
  let lastResult = null;

  while (totalSteps < maxSteps) {
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: maxSteps - totalSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
    });

    lastResult = result;
    totalSteps += result.steps ?? 0;
    currentPc = result.lastPc ?? currentPc;
    currentMode = result.lastMode ?? currentMode;

    const normalizedPc = currentPc & 0xFFFFFF;
    const shouldBypassHalt = (
      result.termination === 'halt'
      && normalizedPc >= HALT_RANGE_START
      && normalizedPc <= HALT_RANGE_END
    );

    if (!shouldBypassHalt) {
      break;
    }

    haltBypasses += 1;
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    cpu.madl = 1;
    cpu.pc = EVENT_LOOP_ENTRY;
    currentPc = EVENT_LOOP_ENTRY;
    currentMode = 'adl';
  }

  return {
    steps: totalSteps,
    termination: totalSteps >= maxSteps ? 'max_steps' : (lastResult?.termination ?? 'unknown'),
    lastPc: currentPc,
    lastMode: currentMode,
    haltBypasses,
  };
}

// --- VRAM diff and analysis ---

function snapshotVram(mem) {
  return mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel16(snapshot, row, col) {
  const offset = (row * PIXELS_PER_ROW + col) * 2;
  return snapshot[offset] | (snapshot[offset + 1] << 8);
}

function computePixelDiff(beforeSnap, afterSnap) {
  // For each row, produce a boolean array: true if pixel changed.
  const rowDiffs = [];
  let totalChanged = 0;

  for (let row = 0; row < LCD_ROWS; row++) {
    const cols = new Uint8Array(PIXELS_PER_ROW); // 0 = unchanged, 1 = changed
    let rowChanged = 0;
    for (let col = 0; col < PIXELS_PER_ROW; col++) {
      const offset = (row * PIXELS_PER_ROW + col) * 2;
      const beforeLo = beforeSnap[offset];
      const beforeHi = beforeSnap[offset + 1];
      const afterLo = afterSnap[offset];
      const afterHi = afterSnap[offset + 1];
      if (beforeLo !== afterLo || beforeHi !== afterHi) {
        cols[col] = 1;
        rowChanged++;
        totalChanged++;
      }
    }
    rowDiffs.push({ row, cols, changedCount: rowChanged });
  }

  return { rowDiffs, totalChanged };
}

function findChangedRowRanges(rowDiffs) {
  // Group consecutive rows that have changes into bands.
  const bands = [];
  let inBand = false;
  let bandStart = 0;

  for (let i = 0; i < rowDiffs.length; i++) {
    if (rowDiffs[i].changedCount > 0) {
      if (!inBand) {
        bandStart = i;
        inBand = true;
      }
    } else {
      if (inBand) {
        bands.push({ startRow: bandStart, endRow: i - 1 });
        inBand = false;
      }
    }
  }
  if (inBand) {
    bands.push({ startRow: bandStart, endRow: rowDiffs.length - 1 });
  }

  return bands;
}

function printAsciiArt(rowDiffs) {
  console.log('=== ASCII Art of Changed Rows (# = changed pixel, . = unchanged) ===');
  console.log('  (every-other-pixel sampling for readability, 160 chars wide)');
  console.log('');

  const changedRows = rowDiffs.filter((r) => r.changedCount > 0);
  if (changedRows.length === 0) {
    console.log('  No changed rows found.');
    return;
  }

  // Find the column range with changes across all changed rows.
  let globalMinCol = PIXELS_PER_ROW;
  let globalMaxCol = 0;
  for (const { cols } of changedRows) {
    for (let c = 0; c < PIXELS_PER_ROW; c++) {
      if (cols[c]) {
        if (c < globalMinCol) globalMinCol = c;
        if (c > globalMaxCol) globalMaxCol = c;
      }
    }
  }

  console.log(`  Changed column range: ${globalMinCol}-${globalMaxCol} (${globalMaxCol - globalMinCol + 1}px wide)`);
  console.log('');

  let prevRow = -2;
  for (const { row, cols } of changedRows) {
    // Print separator if there is a gap between row bands.
    if (row > prevRow + 2) {
      console.log('  ---');
    }
    prevRow = row;

    // Sample every other pixel across full 320px width.
    let line = '';
    for (let c = 0; c < PIXELS_PER_ROW; c += 2) {
      // Use OR of the two adjacent pixels for the sampled column.
      const changed = cols[c] || (c + 1 < PIXELS_PER_ROW ? cols[c + 1] : 0);
      line += changed ? '#' : '.';
    }
    console.log(`  r${String(row).padStart(3, '0')}: ${line}`);
  }
}

function segmentGlyphs(rowDiffs, bands) {
  console.log('');
  console.log('=== Glyph Segmentation ===');

  if (bands.length === 0) {
    console.log('  No text bands found.');
    return;
  }

  for (const band of bands) {
    const height = band.endRow - band.startRow + 1;
    console.log('');
    console.log(`  Band rows ${band.startRow}-${band.endRow} (${height}px tall):`);

    // Find the column range with any changes in this band.
    let minCol = PIXELS_PER_ROW;
    let maxCol = 0;
    for (let r = band.startRow; r <= band.endRow; r++) {
      const { cols } = rowDiffs[r];
      for (let c = 0; c < PIXELS_PER_ROW; c++) {
        if (cols[c]) {
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
        }
      }
    }

    if (minCol > maxCol) {
      console.log('    No changed pixels in this band.');
      continue;
    }

    const bandWidth = maxCol - minCol + 1;
    console.log(`    Active columns: ${minCol}-${maxCol} (${bandWidth}px wide)`);

    // For each column in the active range, check if ALL rows in the band
    // have that column unchanged (a vertical gap).
    const gapColumns = [];
    for (let c = minCol; c <= maxCol; c++) {
      let anyChanged = false;
      for (let r = band.startRow; r <= band.endRow; r++) {
        if (rowDiffs[r].cols[c]) {
          anyChanged = true;
          break;
        }
      }
      if (!anyChanged) {
        gapColumns.push(c);
      }
    }

    console.log(`    Vertical gap columns (all-unchanged): ${gapColumns.length}`);

    // Find contiguous gap runs (potential inter-character spaces).
    const gapRuns = [];
    if (gapColumns.length > 0) {
      let start = gapColumns[0];
      let prev = gapColumns[0];
      for (let i = 1; i < gapColumns.length; i++) {
        if (gapColumns[i] === prev + 1) {
          prev = gapColumns[i];
        } else {
          gapRuns.push({ start, end: prev, width: prev - start + 1 });
          start = gapColumns[i];
          prev = gapColumns[i];
        }
      }
      gapRuns.push({ start, end: prev, width: prev - start + 1 });
    }

    // Show gap runs.
    if (gapRuns.length > 0) {
      console.log('    Gap runs:');
      for (const run of gapRuns) {
        console.log(`      cols ${run.start}-${run.end} (${run.width}px wide)`);
      }
    }

    // Segment glyphs: regions between gaps.
    // A "significant" gap is at least 1 pixel wide of all-unchanged columns.
    const glyphs = [];
    let glyphStart = minCol;

    for (const gap of gapRuns) {
      // Everything from glyphStart to gap.start-1 is a glyph (if non-empty).
      if (gap.start > glyphStart) {
        glyphs.push({
          startCol: glyphStart,
          endCol: gap.start - 1,
          width: gap.start - glyphStart,
        });
      }
      glyphStart = gap.end + 1;
    }
    // Trailing glyph after last gap.
    if (glyphStart <= maxCol) {
      glyphs.push({
        startCol: glyphStart,
        endCol: maxCol,
        width: maxCol - glyphStart + 1,
      });
    }

    console.log(`    Candidate glyphs: ${glyphs.length}`);
    if (glyphs.length > 0) {
      const widths = glyphs.map((g) => g.width);
      console.log(`    Glyph widths: [${widths.join(', ')}]`);
      for (const [i, glyph] of glyphs.entries()) {
        console.log(
          `      glyph ${i}: cols ${glyph.startCol}-${glyph.endCol} (${glyph.width}px)`,
        );
      }
    }

    // Print zoomed ASCII art for just this band's active region.
    console.log('');
    console.log(`    Zoomed ASCII art (cols ${minCol}-${maxCol}):`);
    for (let r = band.startRow; r <= band.endRow; r++) {
      let line = '';
      for (let c = minCol; c <= maxCol; c++) {
        line += rowDiffs[r].cols[c] ? '#' : '.';
      }
      console.log(`      r${String(r).padStart(3, '0')}: ${line}`);
    }
  }
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));

  // Fill VRAM with 0xAA sentinel (baseline).
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 453: Decode Rendered Text from VRAM Diff ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log(`VRAM: base=${hex(VRAM_BASE)} size=${count(VRAM_BYTE_SIZE)} bytes (${PIXELS_PER_ROW}x${LCD_ROWS} @ 16bpp)`);
  console.log('');

  // Step 1: Boot to home screen.
  const bootState = bootToHomeScreen(executor, cpu, mem, romBytes);
  console.log('');

  // Step 2: Seed event loop flags.
  mem[0xD14091] = 1;    // key processing enabled
  mem[0xD177B7] = 0x55; // display refresh mode
  mem[KEY_GATE_ADDR] = 0;
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;

  console.log('=== Pre-injection State ===');
  console.log(`  D14091=${hex(mem[0xD14091], 2)}  D177B7=${hex(mem[0xD177B7], 2)}  D177BA=${hex(mem[KEY_GATE_ADDR], 2)}`);
  console.log(`  D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}  D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}  D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  // Step 3: Take VRAM snapshot before key injection.
  const beforeSnapshot = snapshotVram(mem);
  console.log('  VRAM baseline snapshot taken (0xAA-filled).');

  // Step 4: Inject key "1" (scan code 0x12).
  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;

  console.log(`  Injected key "1": D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)} D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  // Step 5: Run event loop with DI+HALT bypass.
  console.log('=== Running Event Loop (500,000 steps, diHaltBypass=true) ===');
  const eventResult = runEventLoopWithHaltBypass(
    executor,
    cpu,
    bootState.resumePc,
    bootState.resumeMode,
    EVENT_LOOP_STEPS,
  );
  console.log(
    `  steps=${count(eventResult.steps)} term=${eventResult.termination} `
    + `lastPc=${hex(eventResult.lastPc)} haltBypasses=${count(eventResult.haltBypasses)}`,
  );
  console.log('');

  // Step 6: Take VRAM snapshot after key processing.
  const afterSnapshot = snapshotVram(mem);
  console.log('  VRAM post-processing snapshot taken.');

  // Step 7: Compute pixel-level diff.
  console.log('');
  console.log('=== VRAM Diff Analysis ===');
  const diff = computePixelDiff(beforeSnapshot, afterSnapshot);
  console.log(`  Total changed pixels: ${count(diff.totalChanged)}`);

  const changedRows = diff.rowDiffs.filter((r) => r.changedCount > 0);
  console.log(`  Rows with changes: ${changedRows.length}`);

  if (changedRows.length > 0) {
    const firstRow = changedRows[0].row;
    const lastRow = changedRows[changedRows.length - 1].row;
    console.log(`  Row range: ${firstRow}-${lastRow}`);
  }

  // Step 8: Print ASCII art of changed rows.
  console.log('');
  printAsciiArt(diff.rowDiffs);

  // Step 9: Find text bands and segment glyphs.
  const bands = findChangedRowRanges(diff.rowDiffs);
  console.log('');
  console.log('=== Text Bands Detected ===');
  console.log(`  Number of bands: ${bands.length}`);
  for (const band of bands) {
    const height = band.endRow - band.startRow + 1;
    console.log(`    rows ${band.startRow}-${band.endRow} (${height}px tall)`);
  }

  segmentGlyphs(diff.rowDiffs, bands);

  // Step 10: Summary.
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Changed pixels: ${count(diff.totalChanged)}`);
  console.log(`  Text bands: ${bands.length}`);
  for (const [i, band] of bands.entries()) {
    const height = band.endRow - band.startRow + 1;
    console.log(`    Band ${i + 1}: rows ${band.startRow}-${band.endRow} (${height}px tall)`);
  }
  console.log('  Done.');
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
