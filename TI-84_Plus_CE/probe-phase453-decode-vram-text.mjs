#!/usr/bin/env node

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

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const BYTES_PER_ROW = VRAM_WIDTH * 2;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_REFRESH_MODE_ADDR = 0xD177B7;

const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
const FLASH_ROUTINE_RAM_DST = 0xD18C22;
const FLASH_ROUTINE_LEN = 0x5A;

const KEY_ONE_SCAN = 0x12;
const CONSUME_BURST_STEPS = 500;
const EVENT_LOOP_STEPS = 500000;
const PROCESS_CHUNK_STEPS = 2000;
const MAX_LOOP_ITERATIONS = 5000;

const FULL_WIDTH_ASCII_SCALE = 2;
const SEGMENT_GAP_MIN = 2;
const SPACE_GAP_MIN = 5;
const SEARCH_WINDOW_START = 0x030000;
const SEARCH_WINDOW_END = 0x0A0000;
const SEARCH_HIT_LIMIT = 8;

const LARGE_FONT_BASE = 0x0040EE;
const LARGE_FONT_STRIDE = 28;
const LARGE_FONT_RENDERED_WIDTH = 10;
const LARGE_FONT_HEIGHT = 14;
const LARGE_FONT_COMPARE_THRESHOLD = 0.20;

const BANDS = [
  { key: 'status', label: 'status bar', rowStart: 119, rowEnd: 132 },
  { key: 'line1', label: 'text line 1', rowStart: 159, rowEnd: 172 },
  { key: 'line2', label: 'text line 2', rowStart: 183, rowEnd: 192 },
  { key: 'line3', label: 'text line 3', rowStart: 199, rowEnd: 212 },
];

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function formatTransitions(map) {
  if (!map || map.size === 0) {
    return '--';
  }
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([transition, occurrences]) => `${transition} x${count(occurrences)}`)
    .join(', ');
}

function recordTransition(map, beforeValue, afterValue) {
  const key = `${hex(beforeValue, 4)} -> ${hex(afterValue, 4)}`;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));
  return mem;
}

function runStage(executor, label, entry, mode, options) {
  const result = executor.runFrom(entry, mode, options);
  console.log(
    `  ${label.padEnd(10)} entry=${hex(entry)} mode=${mode} `
    + `steps=${count(result.steps)} term=${result.termination} `
    + `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? mode}`,
  );
  return result;
}

function bootToHomeScreen(executor, cpu, mem) {
  console.log('=== Boot Sequence ===');

  runStage(executor, 'boot', BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  runStage(executor, 'kernelInit', KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  runStage(executor, 'postInit', POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  for (const [index, entry] of STAGE_ENTRIES.entries()) {
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

    runStage(executor, `stage${index + 1}`, entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
  }

  mem.copyWithin(FLASH_ROUTINE_RAM_DST, FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN);
  console.log(
    `  ramCopy    rom=${hex(FLASH_ROUTINE_ROM_SRC)} -> ram=${hex(FLASH_ROUTINE_RAM_DST)} `
    + `bytes=${count(FLASH_ROUTINE_LEN)}`,
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

function seedEventLoopFlags(mem) {
  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_REFRESH_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
}

function injectKeyOne(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_GATE_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function snapshotVram(mem) {
  return mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(snapshot, row, col) {
  const offset = row * BYTES_PER_ROW + col * 2;
  return snapshot[offset] | (snapshot[offset + 1] << 8);
}

function runKeyProcessing(executor, startPc, startMode) {
  let totalSteps = 0;
  let currentPc = startPc;
  let currentMode = startMode;
  let lastResult = null;

  const burstResult = executor.runFrom(currentPc, currentMode, {
    maxSteps: CONSUME_BURST_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    diHaltBypass: true,
  });

  totalSteps += burstResult.steps ?? 0;
  currentPc = burstResult.lastPc ?? currentPc;
  currentMode = burstResult.lastMode ?? currentMode;
  lastResult = burstResult;

  let remainingSteps = EVENT_LOOP_STEPS;
  while (remainingSteps > 0) {
    const chunkSteps = Math.min(PROCESS_CHUNK_STEPS, remainingSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: chunkSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
    });

    totalSteps += result.steps ?? 0;
    currentPc = result.lastPc ?? currentPc;
    currentMode = result.lastMode ?? currentMode;
    lastResult = result;
    remainingSteps -= chunkSteps;

    if ((result.steps ?? 0) === 0 || result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    totalSteps,
    lastPc: currentPc,
    lastMode: currentMode,
    burst: burstResult,
    final: lastResult,
  };
}

function computeDiffSummary(beforeSnapshot, afterSnapshot) {
  const changedRows = new Map();
  const transitions = new Map();
  const changedRowNumbers = [];

  let totalChangedPixels = 0;
  let totalChangedBytes = 0;
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (let index = 0; index < VRAM_BYTE_SIZE; index += 1) {
    if (beforeSnapshot[index] !== afterSnapshot[index]) {
      totalChangedBytes += 1;
    }
  }

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    const bits = new Uint8Array(VRAM_WIDTH);
    let rowChanged = false;

    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const beforePixel = readPixel(beforeSnapshot, row, col);
      const afterPixel = readPixel(afterSnapshot, row, col);
      if (beforePixel === afterPixel) {
        continue;
      }

      bits[col] = 1;
      rowChanged = true;
      totalChangedPixels += 1;
      recordTransition(transitions, beforePixel, afterPixel);

      if (minRow === null || row < minRow) minRow = row;
      if (maxRow === null || row > maxRow) maxRow = row;
      if (minCol === null || col < minCol) minCol = col;
      if (maxCol === null || col > maxCol) maxCol = col;
    }

    if (rowChanged) {
      changedRows.set(row, bits);
      changedRowNumbers.push(row);
    }
  }

  const bbox = minRow === null ? null : {
    minRow,
    maxRow,
    minCol,
    maxCol,
    width: (maxCol - minCol) + 1,
    height: (maxRow - minRow) + 1,
  };

  return {
    totalChangedBytes,
    totalChangedPixels,
    transitions,
    changedRows,
    changedRowNumbers,
    bbox,
  };
}

function columnsToRuns(columns) {
  if (!columns || columns.length === 0) {
    return [];
  }

  const sorted = [...columns].sort((left, right) => left - right);
  const runs = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    runs.push({ start, end: previous });
    start = current;
    previous = current;
  }

  runs.push({ start, end: previous });
  return runs;
}

function formatRuns(runs) {
  if (!runs || runs.length === 0) {
    return '--';
  }
  return runs
    .map((run) => (run.start === run.end ? String(run.start) : `${run.start}-${run.end}`))
    .join(', ');
}

function mergeRunsByGap(activeRuns, gapMin) {
  if (activeRuns.length === 0) {
    return [];
  }

  const merged = [{ ...activeRuns[0] }];
  for (const run of activeRuns.slice(1)) {
    const previous = merged[merged.length - 1];
    const gapWidth = run.start - previous.end - 1;
    if (gapWidth < gapMin) {
      previous.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function extractTrimmedBitmap(rows, colStart, colEnd) {
  let top = null;
  let bottom = null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    let any = false;
    for (let col = colStart; col <= colEnd; col += 1) {
      if (rows[rowIndex][col]) {
        any = true;
        break;
      }
    }
    if (!any) {
      continue;
    }
    if (top === null) {
      top = rowIndex;
    }
    bottom = rowIndex;
  }

  if (top === null || bottom === null) {
    return {
      width: 0,
      height: 0,
      top: null,
      bottom: null,
      bitmap: new Uint8Array(0),
    };
  }

  const width = (colEnd - colStart) + 1;
  const height = (bottom - top) + 1;
  const bitmap = new Uint8Array(width * height);

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      if (rows[rowIndex][col]) {
        bitmap[(rowIndex - top) * width + (col - colStart)] = 1;
      }
    }
  }

  return { width, height, top, bottom, bitmap };
}

function trimBitmap(width, height, bitmap) {
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!bitmap[row * width + col]) {
        continue;
      }
      if (minRow === null || row < minRow) minRow = row;
      if (maxRow === null || row > maxRow) maxRow = row;
      if (minCol === null || col < minCol) minCol = col;
      if (maxCol === null || col > maxCol) maxCol = col;
    }
  }

  if (minRow === null || minCol === null) {
    return { width: 0, height: 0, bitmap: new Uint8Array(0) };
  }

  const trimmedWidth = (maxCol - minCol) + 1;
  const trimmedHeight = (maxRow - minRow) + 1;
  const trimmed = new Uint8Array(trimmedWidth * trimmedHeight);

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (bitmap[row * width + col]) {
        trimmed[(row - minRow) * trimmedWidth + (col - minCol)] = 1;
      }
    }
  }

  return {
    width: trimmedWidth,
    height: trimmedHeight,
    bitmap: trimmed,
  };
}

function buildAsciiRows(rows, compression) {
  const lines = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    let art = '';
    for (let startCol = 0; startCol < VRAM_WIDTH; startCol += compression) {
      let on = false;
      const endCol = Math.min(VRAM_WIDTH - 1, startCol + compression - 1);
      for (let col = startCol; col <= endCol; col += 1) {
        if (rows[rowIndex][col]) {
          on = true;
          break;
        }
      }
      art += on ? '#' : '.';
    }
    lines.push(art);
  }
  return lines;
}

function formatBitmapAscii(bitmapWidth, bitmapHeight, bitmap) {
  if (bitmapWidth === 0 || bitmapHeight === 0) {
    return ['(empty)'];
  }

  const lines = [];
  for (let row = 0; row < bitmapHeight; row += 1) {
    let line = '';
    for (let col = 0; col < bitmapWidth; col += 1) {
      line += bitmap[row * bitmapWidth + col] ? '#' : '.';
    }
    lines.push(line);
  }
  return lines;
}

function decodeRenderedLargeFontGlyph(romBytes, charCode) {
  const index = charCode - 0x20;
  if (index < 0 || index > 0x5F) {
    return null;
  }

  const offset = LARGE_FONT_BASE + index * LARGE_FONT_STRIDE;
  const bitmap = new Uint8Array(LARGE_FONT_RENDERED_WIDTH * LARGE_FONT_HEIGHT);

  for (let row = 0; row < LARGE_FONT_HEIGHT; row += 1) {
    const leftByte = romBytes[offset + row * 2];
    const rightByte = romBytes[offset + row * 2 + 1];

    for (let col = 0; col < 5; col += 1) {
      bitmap[row * LARGE_FONT_RENDERED_WIDTH + col] = (leftByte >> (7 - col)) & 1;
      bitmap[row * LARGE_FONT_RENDERED_WIDTH + 5 + col] = (rightByte >> (7 - col)) & 1;
    }
  }

  return trimBitmap(LARGE_FONT_RENDERED_WIDTH, LARGE_FONT_HEIGHT, bitmap);
}

function buildReferenceGlyphs(romBytes) {
  const glyphs = [];
  for (let charCode = 0x20; charCode <= 0x7E; charCode += 1) {
    const glyph = decodeRenderedLargeFontGlyph(romBytes, charCode);
    if (!glyph || glyph.width === 0 || glyph.height === 0) {
      continue;
    }
    glyphs.push({
      code: charCode,
      char: String.fromCharCode(charCode),
      ...glyph,
    });
  }
  return glyphs;
}

function bitmapDistance(left, right) {
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  const area = width * height;
  if (area === 0) {
    return { diff: 0, area: 0, normalized: 0 };
  }

  let diff = 0;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const leftBit = row < left.height && col < left.width ? left.bitmap[row * left.width + col] : 0;
      const rightBit = row < right.height && col < right.width ? right.bitmap[row * right.width + col] : 0;
      if (leftBit !== rightBit) {
        diff += 1;
      }
    }
  }

  return { diff, area, normalized: diff / area };
}

function recognizeGlyph(candidate, referenceGlyphs) {
  if (!candidate || candidate.width === 0 || candidate.height === 0) {
    return null;
  }

  let best = null;
  for (const reference of referenceGlyphs) {
    if (Math.abs(reference.height - candidate.height) > 4) {
      continue;
    }
    const distance = bitmapDistance(candidate, reference);
    if (!best || distance.normalized < best.normalized) {
      best = {
        char: reference.char,
        code: reference.code,
        width: reference.width,
        height: reference.height,
        diff: distance.diff,
        area: distance.area,
        normalized: distance.normalized,
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    ...best,
    confident: best.normalized <= LARGE_FONT_COMPARE_THRESHOLD,
  };
}

function analyzeBand(diffSummary, band, referenceGlyphs) {
  const rows = [];
  const changedRows = [];
  const columnInk = new Array(VRAM_WIDTH).fill(0);
  let changedPixels = 0;

  for (let row = band.rowStart; row <= band.rowEnd; row += 1) {
    const bits = diffSummary.changedRows.get(row) ?? new Uint8Array(VRAM_WIDTH);
    rows.push(bits);
    let rowChanged = false;
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      if (!bits[col]) {
        continue;
      }
      changedPixels += 1;
      rowChanged = true;
      columnInk[col] += 1;
    }
    if (rowChanged) {
      changedRows.push(row);
    }
  }

  const activeCols = [];
  for (let col = 0; col < VRAM_WIDTH; col += 1) {
    if (columnInk[col] > 0) {
      activeCols.push(col);
    }
  }

  const activeRuns = columnsToRuns(activeCols);
  const glyphRuns = mergeRunsByGap(activeRuns, SEGMENT_GAP_MIN);
  const glyphs = glyphRuns.map((run, index) => {
    const trimmed = extractTrimmedBitmap(rows, run.start, run.end);
    const candidate = trimBitmap(trimmed.width, trimmed.height, trimmed.bitmap);
    const recognition = recognizeGlyph(candidate, referenceGlyphs);
    return {
      index,
      startCol: run.start,
      endCol: run.end,
      width: (run.end - run.start) + 1,
      topRow: trimmed.top === null ? null : band.rowStart + trimmed.top,
      bottomRow: trimmed.bottom === null ? null : band.rowStart + trimmed.bottom,
      height: trimmed.height,
      bitmap: candidate.bitmap,
      bitmapWidth: candidate.width,
      bitmapHeight: candidate.height,
      recognition,
      gapBefore: index === 0 ? null : run.start - glyphRuns[index - 1].end - 1,
    };
  });

  let tentativeText = '';
  for (const glyph of glyphs) {
    if (glyph.gapBefore !== null && glyph.gapBefore >= SPACE_GAP_MIN) {
      tentativeText += ' ';
    }
    tentativeText += glyph.recognition?.confident ? glyph.recognition.char : '?';
  }

  return {
    ...band,
    changedRows,
    rows,
    changedPixels,
    activeCols,
    activeRuns,
    glyphs,
    columnInk,
    activeMinCol: activeCols.length ? activeCols[0] : null,
    activeMaxCol: activeCols.length ? activeCols[activeCols.length - 1] : null,
    activeWidth: activeCols.length ? (activeCols[activeCols.length - 1] - activeCols[0]) + 1 : 0,
    tentativeText,
    asciiRows: buildAsciiRows(rows, FULL_WIDTH_ASCII_SCALE),
  };
}

function describeChangedRowsOutsideBands(changedRows) {
  const covered = new Set();
  for (const band of BANDS) {
    for (let row = band.rowStart; row <= band.rowEnd; row += 1) {
      covered.add(row);
    }
  }
  return changedRows.filter((row) => !covered.has(row));
}

function selectSearchGlyph(bandAnalyses) {
  let best = null;
  for (const band of bandAnalyses) {
    for (const glyph of band.glyphs) {
      const candidate = {
        bandKey: band.key,
        bandLabel: band.label,
        ...glyph,
      };

      if (glyph.recognition?.confident) {
        return { ...candidate, confident: true };
      }

      if (!best) {
        best = candidate;
        continue;
      }

      const currentScore = glyph.recognition?.normalized ?? Number.POSITIVE_INFINITY;
      const bestScore = best.recognition?.normalized ?? Number.POSITIVE_INFINITY;
      if (currentScore < bestScore) {
        best = candidate;
      }
    }
  }

  return best ? { ...best, confident: false } : null;
}

function packBitmap(bitmapWidth, bitmapHeight, bitmap, targetWidth, targetHeight, leftPad, topPad, bitOrder) {
  const rowBytes = Math.ceil(targetWidth / 8);
  const bytes = new Uint8Array(rowBytes * targetHeight);

  for (let row = 0; row < bitmapHeight; row += 1) {
    for (let col = 0; col < bitmapWidth; col += 1) {
      if (!bitmap[row * bitmapWidth + col]) {
        continue;
      }
      const outRow = topPad + row;
      const outCol = leftPad + col;
      const byteIndex = outRow * rowBytes + Math.floor(outCol / 8);
      const bitIndex = outCol % 8;
      const mask = bitOrder === 'lsb' ? (1 << bitIndex) : (0x80 >> bitIndex);
      bytes[byteIndex] |= mask;
    }
  }

  return bytes;
}

function buildSearchPatterns(romBytes, searchGlyph) {
  if (!searchGlyph || searchGlyph.bitmapWidth === 0 || searchGlyph.bitmapHeight === 0) {
    return [];
  }

  const patterns = [];
  const seen = new Set();
  const recognizedCharCode = searchGlyph.recognition?.confident ? searchGlyph.recognition.code : null;
  const addPattern = (label, bytes, charCode = null, assumedStride = null) => {
    if (!bytes || bytes.length === 0) {
      return;
    }
    const signature = `${label}:${Buffer.from(bytes).toString('hex')}`;
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    patterns.push({ label, bytes, charCode, assumedStride });
  };

  const { bitmapWidth, bitmapHeight, bitmap } = searchGlyph;

  addPattern(
    `captured-exact-${bitmapWidth}x${bitmapHeight}-msb`,
    packBitmap(bitmapWidth, bitmapHeight, bitmap, bitmapWidth, bitmapHeight, 0, 0, 'msb'),
    recognizedCharCode,
    Math.ceil(bitmapWidth / 8) * bitmapHeight,
  );
  addPattern(
    `captured-exact-${bitmapWidth}x${bitmapHeight}-lsb`,
    packBitmap(bitmapWidth, bitmapHeight, bitmap, bitmapWidth, bitmapHeight, 0, 0, 'lsb'),
    recognizedCharCode,
    Math.ceil(bitmapWidth / 8) * bitmapHeight,
  );

  const targetWidths = [...new Set([bitmapWidth, 8, 10, 12, 14, 16].filter((value) => value >= bitmapWidth))];
  const targetHeights = [...new Set([bitmapHeight, 14, 16].filter((value) => value >= bitmapHeight))];

  for (const targetWidth of targetWidths) {
    const leftPads = [...new Set([0, Math.floor((targetWidth - bitmapWidth) / 2), targetWidth - bitmapWidth])]
      .filter((value) => value >= 0);
    for (const targetHeight of targetHeights) {
      const topPads = [...new Set([0, Math.floor((targetHeight - bitmapHeight) / 2), targetHeight - bitmapHeight])]
        .filter((value) => value >= 0);
      for (const leftPad of leftPads) {
        for (const topPad of topPads) {
          for (const bitOrder of ['msb', 'lsb']) {
            addPattern(
              `captured-${targetWidth}x${targetHeight}-${bitOrder}-lp${leftPad}-tp${topPad}`,
              packBitmap(bitmapWidth, bitmapHeight, bitmap, targetWidth, targetHeight, leftPad, topPad, bitOrder),
              recognizedCharCode,
              Math.ceil(targetWidth / 8) * targetHeight,
            );
          }
        }
      }
    }
  }

  if (recognizedCharCode !== null) {
    const index = recognizedCharCode - 0x20;
    if (index >= 0) {
      const offset = LARGE_FONT_BASE + index * LARGE_FONT_STRIDE;
      addPattern(
        `low-rom-raw-28-${searchGlyph.recognition.char}`,
        romBytes.subarray(offset, offset + LARGE_FONT_STRIDE),
        recognizedCharCode,
        LARGE_FONT_STRIDE,
      );
    }
  }

  return patterns;
}

function findAllPattern(haystack, needle, limit) {
  const hits = [];
  if (!needle || needle.length === 0) {
    return hits;
  }

  let offset = 0;
  while (hits.length < limit) {
    const hit = haystack.indexOf(needle, offset);
    if (hit === -1) {
      break;
    }
    hits.push(hit);
    offset = hit + 1;
  }
  return hits;
}

function searchFontCandidates(romBytes, searchGlyph) {
  const patterns = buildSearchPatterns(romBytes, searchGlyph);
  const searchWindow = Buffer.from(romBytes.subarray(SEARCH_WINDOW_START, SEARCH_WINDOW_END));

  const baseCandidates = new Map();
  const blobCandidates = [];

  for (const pattern of patterns) {
    const hits = findAllPattern(searchWindow, Buffer.from(pattern.bytes), SEARCH_HIT_LIMIT);
    for (const hit of hits) {
      const address = SEARCH_WINDOW_START + hit;
      const candidate = {
        address,
        label: pattern.label,
        bytes: pattern.bytes.length,
      };

      if (pattern.assumedStride && pattern.charCode !== null && pattern.charCode !== undefined) {
        const glyphIndex = pattern.charCode - 0x20;
        const inferredBase = address - (glyphIndex * pattern.assumedStride);
        if (inferredBase >= SEARCH_WINDOW_START && inferredBase < SEARCH_WINDOW_END) {
          const key = `${inferredBase}:${pattern.assumedStride}`;
          const existing = baseCandidates.get(key) ?? {
            base: inferredBase,
            stride: pattern.assumedStride,
            supports: [],
          };
          existing.supports.push({
            glyphAddr: address,
            label: pattern.label,
            bytes: pattern.bytes.length,
          });
          baseCandidates.set(key, existing);
          continue;
        }
      }

      blobCandidates.push(candidate);
    }
  }

  return {
    patternsTested: patterns.length,
    baseCandidates: [...baseCandidates.values()]
      .sort((left, right) => right.supports.length - left.supports.length || left.base - right.base),
    blobCandidates: blobCandidates.sort((left, right) => left.address - right.address),
  };
}

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

  const mem = createMemoryImage(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const referenceGlyphs = buildReferenceGlyphs(romBytes);

  console.log('=== Phase 453 Decode VRAM Text Probe ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log(`VRAM: base=${hex(VRAM_BASE)} size=${count(VRAM_BYTE_SIZE)} bytes (${VRAM_WIDTH}x${VRAM_HEIGHT} @ 16bpp)`);
  console.log(`Search window: ${hex(SEARCH_WINDOW_START)}-${hex(SEARCH_WINDOW_END - 1)} (${count(SEARCH_WINDOW_END - SEARCH_WINDOW_START)} bytes)`);
  console.log(`Key injection: label="1" scan=${hex(KEY_ONE_SCAN, 2)}`);
  console.log(`Reference glyphs: low-ROM large-font base=${hex(LARGE_FONT_BASE)} count=${count(referenceGlyphs.length)}`);
  console.log('');

  const bootState = bootToHomeScreen(executor, cpu, mem);
  console.log('');

  seedEventLoopFlags(mem);
  console.log('=== Event Loop Seed State ===');
  console.log(`  D14091=${hex(mem[KEY_PROCESSING_ENABLE_ADDR], 2)}  D177B7=${hex(mem[DISPLAY_REFRESH_MODE_ADDR], 2)}  D177BA=${hex(mem[KEY_GATE_ADDR], 2)}`);
  console.log(`  D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}  D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}  D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  const beforeSnapshot = snapshotVram(mem);

  injectKeyOne(mem);
  console.log('=== Injected Key State ===');
  console.log(`  D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}  D177BA=${hex(mem[KEY_GATE_ADDR], 2)}  D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  const eventLoopResult = runKeyProcessing(executor, bootState.resumePc, bootState.resumeMode);
  const afterSnapshot = snapshotVram(mem);
  const diffSummary = computeDiffSummary(beforeSnapshot, afterSnapshot);
  const bandAnalyses = BANDS.map((band) => analyzeBand(diffSummary, band, referenceGlyphs));
  const outsideRows = describeChangedRowsOutsideBands(diffSummary.changedRowNumbers);
  const searchGlyph = selectSearchGlyph(bandAnalyses);
  const fontSearch = searchGlyph ? searchFontCandidates(romBytes, searchGlyph) : null;

  console.log('=== Event Loop Result ===');
  console.log(
    `  totalSteps=${count(eventLoopResult.totalSteps)} `
    + `burstTerm=${eventLoopResult.burst.termination} finalTerm=${eventLoopResult.final?.termination ?? 'n/a'} `
    + `lastPc=${hex(eventLoopResult.lastPc)} lastMode=${eventLoopResult.lastMode ?? 'n/a'}`,
  );
  console.log(`  final D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)} final D177BA=${hex(mem[KEY_GATE_ADDR], 2)} final D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  console.log('=== Diff Summary ===');
  console.log(`  totalChangedBytes=${count(diffSummary.totalChangedBytes)}`);
  console.log(`  totalChangedPixels=${count(diffSummary.totalChangedPixels)}`);
  console.log(`  changedRows=${diffSummary.changedRowNumbers.length ? diffSummary.changedRowNumbers.join(', ') : 'none'}`);
  if (diffSummary.bbox) {
    console.log(
      `  changedBBox rows=${diffSummary.bbox.minRow}-${diffSummary.bbox.maxRow} `
      + `cols=${diffSummary.bbox.minCol}-${diffSummary.bbox.maxCol} `
      + `size=${diffSummary.bbox.width}x${diffSummary.bbox.height}`,
    );
  } else {
    console.log('  changedBBox=none');
  }
  console.log(`  globalPixelTransitions=${formatTransitions(diffSummary.transitions)}`);
  console.log(`  changedRowsOutsideKnownBands=${outsideRows.length ? outsideRows.join(', ') : 'none'}`);
  console.log('');

  console.log('=== Band ASCII Art (changed pixels only, full 320 cols scaled 2:1) ===');
  for (const band of bandAnalyses) {
    console.log(
      `--- ${band.label} rows ${band.rowStart}-${band.rowEnd} `
      + `changedPixels=${count(band.changedPixels)} activeCols=${band.activeMinCol === null ? '--' : `${band.activeMinCol}-${band.activeMaxCol}`} `
      + `activeWidth=${band.activeWidth} glyphs=${band.glyphs.length}`,
    );
    for (let index = 0; index < band.asciiRows.length; index += 1) {
      console.log(`  r${String(band.rowStart + index).padStart(3, '0')}: ${band.asciiRows[index]}`);
    }
  }
  console.log('');

  console.log('=== Glyph Segmentation ===');
  for (const band of bandAnalyses) {
    const widths = band.glyphs.map((glyph) => glyph.width).join(', ') || '--';
    const boxes = band.glyphs
      .map((glyph) => `g${glyph.index}:${glyph.startCol}-${glyph.endCol} w${glyph.width} h${glyph.bitmapHeight}`)
      .join(' | ') || 'none';
    console.log(`  ${band.label}: candidateGlyphs=${band.glyphs.length} widths=[${widths}]`);
    console.log(`    activeRuns=${formatRuns(band.activeRuns)}`);
    console.log(`    glyphBoxes=${boxes}`);
    console.log(`    tentativeOCR=${JSON.stringify(band.tentativeText)}`);
  }
  console.log('');

  console.log('=== Search Glyph ===');
  if (!searchGlyph) {
    console.log('  no changed glyph-like segments were found');
  } else {
    console.log(
      `  selected=${searchGlyph.bandLabel} g${searchGlyph.index} cols=${searchGlyph.startCol}-${searchGlyph.endCol} `
      + `rows=${searchGlyph.topRow ?? 'n/a'}-${searchGlyph.bottomRow ?? 'n/a'} size=${searchGlyph.bitmapWidth}x${searchGlyph.bitmapHeight}`,
    );
    if (searchGlyph.recognition) {
      console.log(
        `  lowRomBest=${JSON.stringify(searchGlyph.recognition.char)} code=${hex(searchGlyph.recognition.code, 2)} `
        + `diff=${searchGlyph.recognition.diff}/${searchGlyph.recognition.area} `
        + `normalized=${searchGlyph.recognition.normalized.toFixed(3)} confident=${searchGlyph.recognition.confident ? 'yes' : 'no'}`,
      );
    } else {
      console.log('  lowRomBest=none');
    }
    console.log('  bitmap:');
    for (const line of formatBitmapAscii(searchGlyph.bitmapWidth, searchGlyph.bitmapHeight, searchGlyph.bitmap)) {
      console.log(`    ${line}`);
    }
  }
  console.log('');

  console.log('=== Font Search ===');
  if (!fontSearch) {
    console.log('  skipped: no glyph available to search');
  } else {
    console.log(`  patternsTested=${count(fontSearch.patternsTested)}`);
    if (fontSearch.baseCandidates.length > 0) {
      console.log('  candidateFontBases:');
      for (const candidate of fontSearch.baseCandidates.slice(0, SEARCH_HIT_LIMIT)) {
        const supportText = candidate.supports
          .map((support) => `${hex(support.glyphAddr)} ${support.label} (${support.bytes} bytes)`)
          .join('; ');
        console.log(`    base=${hex(candidate.base)} stride=${candidate.stride} supports=${candidate.supports.length} :: ${supportText}`);
      }
    } else {
      console.log('  candidateFontBases: none');
    }
    if (fontSearch.blobCandidates.length > 0) {
      console.log('  candidateGlyphBlobAddresses:');
      for (const candidate of fontSearch.blobCandidates.slice(0, SEARCH_HIT_LIMIT)) {
        console.log(`    addr=${hex(candidate.address)} ${candidate.label} (${candidate.bytes} bytes)`);
      }
    } else {
      console.log('  candidateGlyphBlobAddresses: none');
    }
    if (fontSearch.baseCandidates.length === 0 && fontSearch.blobCandidates.length === 0) {
      console.log('  no match found');
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
