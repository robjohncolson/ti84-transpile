#!/usr/bin/env node
/*
Phase 125 summary:
- Status bar rows 0-16 are scanned for decodable text, but this composite
  normally paints background plus status dots/icons rather than ASCII text.
- Mode rows 17-34 are the golden regression window. The expected decode is
  "Normal Float Radian       " at r19 c2 with 26/26 exact matches.
- History rows 37-74 are split into two scan windows (37-56 and 57-74).
  Fresh home-screen composites should decode as empty or all whitespace.
- Entry rows 220-239 are white-filled and should decode as all whitespace
  unless later phases add editable text.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import * as fontDecoder from './font-decoder.mjs';

const {
  buildFontSignatures,
  decodeTextStrip,
  extractCell,
  hammingCols,
  matchCell,
  FONT_BASE,
  GLYPH_STRIDE,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  VRAM_BASE,
  VRAM_WIDTH,
  VRAM_HEIGHT,
  VRAM_SENTINEL,
} = fontDecoder;

const decodeGlyphRendered = fontDecoder.decodeGlyphRendered ?? function decodeGlyphRenderedFallback(romBytes, charCode) {
  const index = charCode - 0x20;

  if (index < 0 || index > 0x5F) {
    return null;
  }

  const offset = FONT_BASE + index * GLYPH_STRIDE;
  const bitmap = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);

  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const leftByte = romBytes[offset + row * 2];
    const rightByte = romBytes[offset + row * 2 + 1];

    for (let col = 0; col < 5; col++) {
      bitmap[row * GLYPH_WIDTH + col] = (leftByte >> (7 - col)) & 1;
      bitmap[row * GLYPH_WIDTH + 5 + col] = (rightByte >> (7 - col)) & 1;
    }
  }

  return bitmap;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase125-full-text-decode-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const WHITE_PIXEL = 0xFFFF;

const STRIDE = 12;
const EXTRACT_WIDTH = Math.min(STRIDE, GLYPH_WIDTH);
const MAX_DIST = 40;
const SCAN_COL_START = 0;
const SCAN_COL_END = 310;

const DEFAULT_COMPARE_WIDTHS = [8, 9, 10];
const STATUS_COMPARE_WIDTHS = [8];

const WORKSPACE_FILL_ROW_START = 75;
const WORKSPACE_FILL_ROW_END = 219;
const ENTRY_FILL_ROW_START = 220;
const ENTRY_FILL_ROW_END = 239;

const STATUS_DOT_ROWS_START = 3;
const STATUS_DOT_ROWS_END = 6;
const STATUS_DOT_LEFT_COL_START = 146;
const STATUS_DOT_LEFT_COL_END = 150;
const STATUS_DOT_RIGHT_COL_START = 306;
const STATUS_DOT_RIGHT_COL_END = 310;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const REGIONS = [
  {
    key: 'statusBar',
    label: 'Status bar',
    rowStart: 0,
    rowEnd: 16,
    compareWidths: STATUS_COMPARE_WIDTHS,
  },
  {
    key: 'modeRow',
    label: 'Mode row',
    rowStart: 17,
    rowEnd: 34,
    compareWidths: DEFAULT_COMPARE_WIDTHS,
    expectedText: MODE_BUF_TEXT,
    preferredStartRow: 19,
    preferredStartCol: 2,
    preferredCompareWidth: 10,
  },
  {
    key: 'historyTop',
    label: 'History r37-56',
    rowStart: 37,
    rowEnd: 56,
    compareWidths: DEFAULT_COMPARE_WIDTHS,
  },
  {
    key: 'historyBottom',
    label: 'History r57-74',
    rowStart: 57,
    rowEnd: 74,
    compareWidths: DEFAULT_COMPARE_WIDTHS,
  },
  {
    key: 'entryLine',
    label: 'Entry line',
    rowStart: 220,
    rowEnd: 239,
    compareWidths: DEFAULT_COMPARE_WIDTHS,
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  if (row < 0 || row >= VRAM_HEIGHT || col < 0 || col >= VRAM_WIDTH) {
    return VRAM_SENTINEL;
  }

  const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[offset] | (mem[offset + 1] << 8);
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

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStage(executor, label, entry, maxSteps) {
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(
    `${label}: entry=${hex(entry)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`,
  );

  return {
    label,
    entry,
    maxSteps,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
  };
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function fillWorkspaceWhite(mem) {
  for (let row = WORKSPACE_FILL_ROW_START; row <= WORKSPACE_FILL_ROW_END; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function fillEntryLineWhite(mem) {
  for (let row = ENTRY_FILL_ROW_START; row <= ENTRY_FILL_ROW_END; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function countColoredPixels(mem, rowStart, rowEnd, colStart, colEnd) {
  let count = 0;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }

  return count;
}

function countComposite(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let rMin = VRAM_HEIGHT;
  let rMax = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;

      if (pixel === WHITE_PIXEL) {
        bg++;
      } else {
        fg++;
      }

      if (row < rMin) {
        rMin = row;
      }

      if (row > rMax) {
        rMax = row;
      }
    }
  }

  return {
    drawn,
    fg,
    bg,
    rMin: rMax < 0 ? null : rMin,
    rMax: rMax < 0 ? null : rMax,
  };
}

function buildComposite(executor, cpu, mem) {
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  const ramSnapshot = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnapshot = snapshotCpu(cpu);

  mem.set(ramSnapshot, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnapshot, mem);

  const stages = [];
  stages.push(runStage(executor, 'stage 1 status bar background', STAGE_1_ENTRY, 30000));

  restoreCpu(cpu, cpuSnapshot, mem);
  const statusDots = {
    leftBeforeStage: countColoredPixels(
      mem,
      STATUS_DOT_ROWS_START,
      STATUS_DOT_ROWS_END,
      STATUS_DOT_LEFT_COL_START,
      STATUS_DOT_LEFT_COL_END,
    ),
    rightBeforeStage: countColoredPixels(
      mem,
      STATUS_DOT_ROWS_START,
      STATUS_DOT_ROWS_END,
      STATUS_DOT_RIGHT_COL_START,
      STATUS_DOT_RIGHT_COL_END,
    ),
  };
  stages.push(runStage(executor, 'stage 2 status dots', STAGE_2_ENTRY, 30000));
  statusDots.leftAfterStage = countColoredPixels(
    mem,
    STATUS_DOT_ROWS_START,
    STATUS_DOT_ROWS_END,
    STATUS_DOT_LEFT_COL_START,
    STATUS_DOT_LEFT_COL_END,
  );
  statusDots.rightAfterStage = countColoredPixels(
    mem,
    STATUS_DOT_ROWS_START,
    STATUS_DOT_ROWS_END,
    STATUS_DOT_RIGHT_COL_START,
    STATUS_DOT_RIGHT_COL_END,
  );

  seedModeBuffer(mem);
  console.log(`stage 3 seed mode buffer: "${MODE_BUF_TEXT}"`);

  restoreCpu(cpu, cpuSnapshot, mem);
  stages.push(runStage(executor, 'stage 3 mode row', STAGE_3_ENTRY, 50000));

  restoreCpu(cpu, cpuSnapshot, mem);
  stages.push(runStage(executor, 'stage 4 history area', STAGE_4_ENTRY, 50000));

  fillWorkspaceWhite(mem);
  console.log(`stage 5 workspace fill: rows ${WORKSPACE_FILL_ROW_START}-${WORKSPACE_FILL_ROW_END}`);

  fillEntryLineWhite(mem);
  console.log(`stage 6 entry line fill: rows ${ENTRY_FILL_ROW_START}-${ENTRY_FILL_ROW_END}`);

  statusDots.leftFinal = countColoredPixels(
    mem,
    STATUS_DOT_ROWS_START,
    STATUS_DOT_ROWS_END,
    STATUS_DOT_LEFT_COL_START,
    STATUS_DOT_LEFT_COL_END,
  );
  statusDots.rightFinal = countColoredPixels(
    mem,
    STATUS_DOT_ROWS_START,
    STATUS_DOT_ROWS_END,
    STATUS_DOT_RIGHT_COL_START,
    STATUS_DOT_RIGHT_COL_END,
  );
  statusDots.assertions = {
    left: statusDots.leftAfterStage > statusDots.leftBeforeStage,
    right: statusDots.rightAfterStage > statusDots.rightBeforeStage,
  };

  return {
    bootResult,
    cpuSnapshot,
    ramSnapshot,
    stages,
    statusDots,
    totals: countComposite(mem),
  };
}

function maxCellsForStartCol(startCol) {
  if (startCol < SCAN_COL_START || startCol > SCAN_COL_END) {
    return 0;
  }

  return Math.floor((SCAN_COL_END - startCol) / STRIDE) + 1;
}

const renderedGlyphCache = new Map();

function getRenderedGlyph(char) {
  const code = char.charCodeAt(0);

  if (!renderedGlyphCache.has(code)) {
    renderedGlyphCache.set(code, decodeGlyphRendered(romBytes, code));
  }

  return renderedGlyphCache.get(code);
}

function evaluateCell(mem, startRow, startCol, compareWidth, signatures, decodedChar) {
  const normalCell = extractCell(mem, startRow, startCol, false, EXTRACT_WIDTH);
  const inverseCell = extractCell(mem, startRow, startCol, true, EXTRACT_WIDTH);
  const normalMatch = matchCell(normalCell, signatures, compareWidth);
  const inverseMatch = matchCell(inverseCell, signatures, compareWidth);
  const useInverse = inverseMatch.dist < normalMatch.dist;
  const bestMatch = useInverse ? inverseMatch : normalMatch;
  const chosenCell = useInverse ? inverseCell : normalCell;

  if (decodedChar === '?') {
    return {
      char: decodedChar,
      dist: bestMatch.dist,
      exactRendered: false,
      inverse: useInverse,
    };
  }

  const renderedGlyph = getRenderedGlyph(decodedChar);
  const exactRendered = Boolean(renderedGlyph) && hammingCols(chosenCell, renderedGlyph, compareWidth) === 0;

  return {
    char: decodedChar,
    dist: bestMatch.dist,
    exactRendered,
    inverse: useInverse,
  };
}

function countExactMatches(actual, expected) {
  let exactMatches = 0;

  for (let index = 0; index < Math.min(actual.length, expected.length); index++) {
    if (actual[index] === expected[index]) {
      exactMatches++;
    }
  }

  return exactMatches;
}

function scoreAttempt(region, attempt) {
  let score = attempt.exactGlyphs * 10000;
  score += attempt.wordChars * 200;
  score += attempt.visibleChars * 20;
  score -= attempt.unknownCount * 100;
  score += attempt.numCells;

  if (region.expectedText) {
    score += attempt.expectedExactMatches * 1000000;
    score -= Math.abs(attempt.startRow - region.preferredStartRow) * 25;
    score -= Math.abs(attempt.startCol - region.preferredStartCol);
    score -= Math.abs(attempt.compareWidth - region.preferredCompareWidth) * 5;
  } else {
    score -= attempt.startCol;
  }

  return score;
}

function isMeaningfulText(attempt) {
  return attempt.wordChars >= 3 || attempt.visibleChars >= 4;
}

function analyzeAttempt(mem, region, startRow, startCol, compareWidth, signatures) {
  const numCells = maxCellsForStartCol(startCol);

  if (numCells <= 0) {
    return null;
  }

  const text = decodeTextStrip(
    mem,
    startRow,
    startCol,
    numCells,
    signatures,
    MAX_DIST,
    'auto',
    STRIDE,
    compareWidth,
  );

  let exactGlyphs = 0;
  let wordChars = 0;
  let visibleChars = 0;
  let unknownCount = 0;
  let spaceCount = 0;

  for (let index = 0; index < text.length; index++) {
    const decodedChar = text[index];
    const cellCol = startCol + index * STRIDE;
    const cell = evaluateCell(mem, startRow, cellCol, compareWidth, signatures, decodedChar);

    if (cell.exactRendered) {
      exactGlyphs++;
    }

    if (decodedChar === '?') {
      unknownCount++;
      continue;
    }

    if (decodedChar === ' ') {
      spaceCount++;
      continue;
    }

    visibleChars++;

    if ((decodedChar >= 'A' && decodedChar <= 'Z') || (decodedChar >= 'a' && decodedChar <= 'z') || (decodedChar >= '0' && decodedChar <= '9')) {
      wordChars++;
    }
  }

  const expectedExactMatches = region.expectedText ? countExactMatches(text, region.expectedText) : null;
  const allWhitespace = text.trim().length === 0 && unknownCount === 0;
  const attempt = {
    regionKey: region.key,
    rowRange: `r${region.rowStart}-${region.rowEnd}`,
    startRow,
    startCol,
    compareWidth,
    numCells,
    text,
    exactGlyphs,
    wordChars,
    visibleChars,
    unknownCount,
    spaceCount,
    allWhitespace,
    expectedExactMatches,
  };

  attempt.meaningfulText = isMeaningfulText(attempt);
  attempt.score = scoreAttempt(region, attempt);

  return attempt;
}

function betterAttempt(currentBest, candidate) {
  if (!currentBest) {
    return true;
  }

  if (candidate.score !== currentBest.score) {
    return candidate.score > currentBest.score;
  }

  if (candidate.exactGlyphs !== currentBest.exactGlyphs) {
    return candidate.exactGlyphs > currentBest.exactGlyphs;
  }

  if (candidate.visibleChars !== currentBest.visibleChars) {
    return candidate.visibleChars > currentBest.visibleChars;
  }

  if (candidate.startRow !== currentBest.startRow) {
    return candidate.startRow < currentBest.startRow;
  }

  if (candidate.startCol !== currentBest.startCol) {
    return candidate.startCol < currentBest.startCol;
  }

  return candidate.compareWidth > currentBest.compareWidth;
}

function scanRegion(mem, region, signatures) {
  let best = null;
  let attemptsScanned = 0;
  const maxStartRow = region.rowEnd - GLYPH_HEIGHT + 1;

  for (let startRow = region.rowStart; startRow <= maxStartRow; startRow++) {
    for (const compareWidth of region.compareWidths) {
      for (let startCol = SCAN_COL_START; startCol <= SCAN_COL_END; startCol++) {
        const attempt = analyzeAttempt(mem, region, startRow, startCol, compareWidth, signatures);

        if (!attempt) {
          continue;
        }

        attemptsScanned++;

        if (betterAttempt(best, attempt)) {
          best = attempt;
        }
      }
    }
  }

  return {
    ...region,
    attemptsScanned,
    best,
  };
}

function formatDecodedText(regionResult) {
  const attempt = regionResult.best;

  if (!attempt) {
    return 'empty';
  }

  if (attempt.allWhitespace) {
    return 'all whitespace';
  }

  if (!attempt.meaningfulText) {
    return 'empty';
  }

  return JSON.stringify(attempt.text);
}

function formatConfidence(regionResult) {
  if (!regionResult.best) {
    return '0/0';
  }

  return `${regionResult.best.exactGlyphs}/${regionResult.best.numCells}`;
}

function buildTextMap(regionResults) {
  const labels = [
    { label: 'Status bar (r0-16):', key: 'statusBar' },
    { label: 'Mode row (r17-34):', key: 'modeRow' },
    { label: 'History r37-56:', key: 'historyTop' },
    { label: 'History r57-74:', key: 'historyBottom' },
    { label: 'Entry line (r220-239):', key: 'entryLine' },
  ];
  const lines = ['=== TI-84 CE Home Screen Text Map ==='];

  for (const entry of labels) {
    const regionResult = regionResults[entry.key];
    lines.push(`${entry.label.padEnd(24, ' ')} ${formatDecodedText(regionResult)}`);
  }

  return lines.join('\n');
}

function buildReport({ composite, regionResults, orderedRegions, goldenRegression }) {
  const lines = [];

  lines.push('# Phase 125 - Full Text Decode Probe');
  lines.push('');
  lines.push('Generated by `probe-phase125-full-text-decode.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Font decoder base: \`${hex(FONT_BASE)}\``);
  lines.push(`- Font decoder glyph size: \`${GLYPH_WIDTH}x${GLYPH_HEIGHT}\``);
  lines.push(`- Boot result: \`steps=${composite.bootResult.steps} termination=${composite.bootResult.termination} lastPc=${hex(composite.bootResult.lastPc)}\``);
  lines.push(`- Seed text: \`${MODE_BUF_TEXT}\``);
  lines.push(`- Scan columns: \`${SCAN_COL_START}-${SCAN_COL_END}\``);
  lines.push(`- Stride: \`${STRIDE}\``);
  lines.push('');
  lines.push('## Composite Summary');
  lines.push('');
  lines.push(`- Totals: \`drawn=${composite.totals.drawn} fg=${composite.totals.fg} bg=${composite.totals.bg} rMin=${composite.totals.rMin ?? 'n/a'} rMax=${composite.totals.rMax ?? 'n/a'}\``);
  lines.push(`- Status dots left: \`before=${composite.statusDots.leftBeforeStage} after=${composite.statusDots.leftAfterStage} final=${composite.statusDots.leftFinal}\``);
  lines.push(`- Status dots right: \`before=${composite.statusDots.rightBeforeStage} after=${composite.statusDots.rightAfterStage} final=${composite.statusDots.rightFinal}\``);
  lines.push('');
  lines.push('| stage | entry | maxSteps | steps | termination | lastPc |');
  lines.push('|---|---|---:|---:|---|---|');

  for (const stage of composite.stages) {
    lines.push(
      `| ${stage.label} | \`${hex(stage.entry)}\` | ${stage.maxSteps} | ${stage.steps} | \`${stage.termination}\` | \`${hex(stage.lastPc)}\` |`,
    );
  }

  lines.push('');
  lines.push('## Screen Text Map');
  lines.push('');
  lines.push('```text');
  lines.push(buildTextMap(regionResults));
  lines.push('```');
  lines.push('');
  lines.push('## Region Scans');
  lines.push('');

  for (const regionResult of orderedRegions) {
    const attempt = regionResult.best;
    const decodedText = formatDecodedText(regionResult);

    lines.push(`### ${regionResult.label} (${regionResult.rowStart}-${regionResult.rowEnd})`);
    lines.push('');

    if (!attempt) {
      lines.push(`- Row range scanned: \`r${regionResult.rowStart}-${regionResult.rowEnd}\``);
      lines.push('- Decoded text: `empty`');
      lines.push('- Match confidence: `0/0`');
      lines.push('- Attempts scanned: `0`');
      lines.push('');
      continue;
    }

    lines.push(`- Row range scanned: \`r${regionResult.rowStart}-${regionResult.rowEnd}\``);
    lines.push(`- Best alignment: \`r${attempt.startRow} c${attempt.startCol} compareWidth=${attempt.compareWidth}\``);
    lines.push(`- Decoded text: ${decodedText === 'all whitespace' || decodedText === 'empty' ? `\`${decodedText}\`` : `\`${attempt.text}\``}`);
    lines.push(`- Match confidence: \`${attempt.exactGlyphs}/${attempt.numCells} exact glyphs\``);
    lines.push(`- Attempts scanned: \`${regionResult.attemptsScanned}\``);

    if (attempt.expectedExactMatches !== null) {
      lines.push(`- Seed-text exact matches: \`${attempt.expectedExactMatches}/${MODE_BUF_LEN}\``);
    }

    lines.push('');
  }

  lines.push('## Golden Regression');
  lines.push('');
  lines.push(`- Probe: \`r${goldenRegression.startRow} c${goldenRegression.startCol} compareWidth=${goldenRegression.compareWidth}\``);
  lines.push(`- Decoded text: \`${goldenRegression.text}\``);
  lines.push(`- Exact matches vs seed: \`${goldenRegression.expectedExactMatches}/${MODE_BUF_LEN}\``);
  lines.push(`- Exact glyphs: \`${goldenRegression.exactGlyphs}/${goldenRegression.numCells}\``);
  lines.push(`- Result: \`${goldenRegression.passed ? 'PASS' : 'FAIL'}\``);

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  const lines = [];
  lines.push('# Phase 125 - Full Text Decode Probe');
  lines.push('');
  lines.push('Generated by `probe-phase125-full-text-decode.mjs`.');
  lines.push('');
  lines.push('## Failure');
  lines.push('');
  lines.push('```text');
  lines.push(error.stack || String(error));
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

async function main() {
  console.log('=== Phase 125 - Full Text Decode Probe ===');
  console.log(`fontDecoder: base=${hex(FONT_BASE)} glyph=${GLYPH_WIDTH}x${GLYPH_HEIGHT}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const composite = buildComposite(executor, cpu, mem);
  console.log(`drawn=${composite.totals.drawn} fg=${composite.totals.fg} bg=${composite.totals.bg} rMin=${composite.totals.rMin ?? 'n/a'} rMax=${composite.totals.rMax ?? 'n/a'}`);

  const signatures = buildFontSignatures(romBytes);
  const orderedRegions = REGIONS.map((region) => scanRegion(mem, region, signatures));
  const regionResults = Object.fromEntries(orderedRegions.map((region) => [region.key, region]));

  for (const region of orderedRegions) {
    const attempt = region.best;
    const decodedText = formatDecodedText(region);

    if (!attempt) {
      console.log(`${region.label}: no decodes`);
      continue;
    }

    console.log(
      `${region.label}: rows=r${region.rowStart}-${region.rowEnd} best=r${attempt.startRow} c${attempt.startCol} cw=${attempt.compareWidth} exact=${attempt.exactGlyphs}/${attempt.numCells} text=${decodedText === 'all whitespace' || decodedText === 'empty' ? decodedText : JSON.stringify(attempt.text)}`,
    );
  }

  const goldenRegression = analyzeAttempt(
    mem,
    REGIONS[1],
    19,
    2,
    10,
    signatures,
  );
  goldenRegression.passed = Boolean(
    goldenRegression &&
    goldenRegression.text === MODE_BUF_TEXT &&
    goldenRegression.expectedExactMatches === MODE_BUF_LEN,
  );

  const textMap = buildTextMap(regionResults);
  console.log('');
  console.log(textMap);
  console.log('');
  console.log(
    `goldenRegression: r19 c2 cw10 decoded=${JSON.stringify(goldenRegression.text)} exactMatches=${goldenRegression.expectedExactMatches}/${MODE_BUF_LEN} exactGlyphs=${goldenRegression.exactGlyphs}/${goldenRegression.numCells} result=${goldenRegression.passed ? 'PASS' : 'FAIL'}`,
  );

  const report = buildReport({
    composite,
    regionResults,
    orderedRegions,
    goldenRegression,
  });
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = goldenRegression.passed ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, buildFailureReport(error));
  process.exitCode = 1;
}
