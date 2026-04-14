#!/usr/bin/env node

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import {
  buildFontSignatures,
  decodeTextStrip,
  FONT_BASE,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
} from './font-decoder.mjs';

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const HOME_STAGE_1 = 0x0A2B72;
const HOME_STAGE_2 = 0x0A3301;
const HOME_STAGE_3 = 0x0A29EC;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_WATCH_END = 0xD52C00;
const FULL_VRAM_END = VRAM_BASE + VRAM_SIZE;

const ENTRY_POINTS = [
  { label: 'menu_0b6a58', address: 0x0B6A58 },
  { label: 'candidate_0b6834', address: 0x0B6834 },
  { label: 'candidate_0b6b48', address: 0x0B6B48 },
  { label: 'about_09eb9e', address: 0x09EB9E },
];

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(address, mode = 'adl') {
  return `${address.toString(16).padStart(6, '0')}:${mode}`;
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: hex(run.lastPc, 6),
    lastMode: run.lastMode ?? 'n/a',
    loopsForced: run.loopsForced ?? 0,
    missingBlockCount: run.missingBlocks?.length ?? 0,
    missingBlocks: (run.missingBlocks ?? []).slice(0, 20),
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function prepareHomeStageCpu(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index++) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function summarizeRenderedVram(mem) {
  let drawnPixels = 0;
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);

      if (pixel === 0xAAAA) {
        continue;
      }

      drawnPixels++;

      if (minRow === null || row < minRow) minRow = row;
      if (maxRow === null || row > maxRow) maxRow = row;
      if (minCol === null || col < minCol) minCol = col;
      if (maxCol === null || col > maxCol) maxCol = col;
    }
  }

  return {
    drawnPixels,
    rowRange: minRow === null ? null : `${minRow}-${maxRow}`,
    bbox: minRow === null ? null : `r${minRow}-${maxRow} c${minCol}-${maxCol}`,
  };
}

function uniqueInts(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
}

function analyzeVramDiff(beforeMem, afterMem) {
  const rowStats = Array.from({ length: VRAM_HEIGHT }, (_, row) => ({
    row,
    changedPixels: 0,
    minCol: null,
    maxCol: null,
  }));

  let changedBytes = 0;
  let changedPixels = 0;
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const lowChanged = beforeMem[offset] !== afterMem[offset];
      const highChanged = beforeMem[offset + 1] !== afterMem[offset + 1];

      if (!lowChanged && !highChanged) {
        continue;
      }

      changedBytes += Number(lowChanged) + Number(highChanged);
      changedPixels++;
      rowStats[row].changedPixels++;

      if (rowStats[row].minCol === null || col < rowStats[row].minCol) {
        rowStats[row].minCol = col;
      }

      if (rowStats[row].maxCol === null || col > rowStats[row].maxCol) {
        rowStats[row].maxCol = col;
      }

      if (minRow === null || row < minRow) minRow = row;
      if (maxRow === null || row > maxRow) maxRow = row;
      if (minCol === null || col < minCol) minCol = col;
      if (maxCol === null || col > maxCol) maxCol = col;
    }
  }

  const changedRows = rowStats
    .filter((row) => row.changedPixels > 0)
    .map((row) => row.row);

  const rowBands = [];
  let currentBand = null;

  for (const row of rowStats) {
    if (row.changedPixels === 0) {
      if (currentBand) {
        rowBands.push(currentBand);
        currentBand = null;
      }
      continue;
    }

    if (!currentBand) {
      currentBand = {
        start: row.row,
        end: row.row,
        changedPixels: row.changedPixels,
        minCol: row.minCol,
        maxCol: row.maxCol,
      };
      continue;
    }

    currentBand.end = row.row;
    currentBand.changedPixels += row.changedPixels;
    currentBand.minCol = Math.min(currentBand.minCol, row.minCol);
    currentBand.maxCol = Math.max(currentBand.maxCol, row.maxCol);
  }

  if (currentBand) {
    rowBands.push(currentBand);
  }

  return {
    changedBytes,
    changedPixels,
    changedRows,
    rowRange: minRow === null ? null : `${minRow}-${maxRow}`,
    bbox: minRow === null ? null : `r${minRow}-${maxRow} c${minCol}-${maxCol}`,
    rowStats,
    rowBands,
  };
}

function analyzeDecodedText(rawText) {
  const text = rawText.replace(/\s+/g, ' ').trim();

  if (!text) {
    return {
      text,
      score: 0,
      identifiable: false,
      questionCount: 0,
      alnumCount: 0,
      alphaRuns: [],
      fuzzyLetterCount: 0,
    };
  }

  const questionCount = (text.match(/\?/g) || []).length;
  const alnumCount = (text.match(/[A-Za-z0-9]/g) || []).length;
  const alphaRuns = text.match(/[A-Za-z]{3,}/g) || [];
  const fuzzyRuns = text.match(/[A-Za-z?]{4,}/g) || [];
  const fuzzyLetterCount = fuzzyRuns.reduce((best, token) => {
    const letters = (token.match(/[A-Za-z]/g) || []).length;
    return Math.max(best, letters);
  }, 0);

  const score = (
    alphaRuns.length * 50
    + fuzzyLetterCount * 6
    + alnumCount * 2
    - questionCount * 6
  );

  const identifiable = (
    alnumCount >= 4
    && (alphaRuns.length > 0 || fuzzyLetterCount >= 3)
    && questionCount <= Math.max(4, alnumCount)
  );

  return {
    text,
    score,
    identifiable,
    questionCount,
    alnumCount,
    alphaRuns,
    fuzzyLetterCount,
  };
}

function compareDecodedCandidates(a, b) {
  if (a.identifiable !== b.identifiable) {
    return Number(b.identifiable) - Number(a.identifiable);
  }

  if (a.score !== b.score) {
    return b.score - a.score;
  }

  if (a.questionCount !== b.questionCount) {
    return a.questionCount - b.questionCount;
  }

  if (a.startRow !== b.startRow) {
    return a.startRow - b.startRow;
  }

  return a.startCol - b.startCol;
}

function buildDecodeRowCandidates(band, rowStats) {
  const denseRows = rowStats
    .slice(band.start, band.end + 1)
    .filter((row) => row.changedPixels > 0)
    .sort((a, b) => b.changedPixels - a.changedPixels || a.row - b.row)
    .slice(0, 6)
    .map((row) => row.row);

  const rowCandidates = new Set();

  for (const anchor of denseRows) {
    for (let offset = 0; offset < GLYPH_HEIGHT; offset++) {
      const startRow = anchor - offset;
      if (startRow >= 0 && startRow <= VRAM_HEIGHT - GLYPH_HEIGHT) {
        rowCandidates.add(startRow);
      }
    }
  }

  for (let row = band.start - 2; row <= band.start + 2; row++) {
    if (row >= 0 && row <= VRAM_HEIGHT - GLYPH_HEIGHT) {
      rowCandidates.add(row);
    }
  }

  return [...rowCandidates].sort((a, b) => a - b);
}

function buildDecodeColCandidates(band) {
  const anchor = band.minCol ?? 0;
  return uniqueInts([
    ...Array.from({ length: 17 }, (_, index) => index),
    ...Array.from({ length: 13 }, (_, index) => anchor - 4 + index),
    anchor,
    anchor - (anchor % 12),
    anchor - (anchor % GLYPH_WIDTH),
  ].filter((value) => value >= 0 && value <= VRAM_WIDTH - GLYPH_WIDTH));
}

function decodeWrittenRows(mem, signatures, diffInfo) {
  const candidates = [];

  for (const band of diffInfo.rowBands) {
    if (band.changedPixels < 40) {
      continue;
    }

    const rowCandidates = buildDecodeRowCandidates(band, diffInfo.rowStats);
    const colCandidates = buildDecodeColCandidates(band);

    for (const startRow of rowCandidates) {
      for (const startCol of colCandidates) {
        for (const stride of [GLYPH_WIDTH, 12]) {
          const numCells = Math.max(4, Math.min(26, Math.floor((VRAM_WIDTH - startCol) / stride)));
          const rawText = decodeTextStrip(
            mem,
            startRow,
            startCol,
            numCells,
            signatures,
            32,
            'auto',
            stride,
            GLYPH_WIDTH,
          );
          const analysis = analyzeDecodedText(rawText);

          if (analysis.score <= 0) {
            continue;
          }

          candidates.push({
            band: `r${band.start}-${band.end}`,
            startRow,
            startCol,
            stride,
            text: analysis.text,
            score: analysis.score,
            identifiable: analysis.identifiable,
            questionCount: analysis.questionCount,
            alnumCount: analysis.alnumCount,
          });
        }
      }
    }
  }

  candidates.sort(compareDecodedCandidates);

  const uniqueCandidates = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const key = `${candidate.band}|${candidate.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  const identifiable = uniqueCandidates.filter((candidate) => candidate.identifiable);
  return (identifiable.length > 0 ? identifiable : uniqueCandidates).slice(0, 5);
}

function captureRollingWrite(list, entry, maxItems) {
  if (list.length < maxItems) {
    list.push(entry);
    return;
  }

  list.shift();
  list.push(entry);
}

function probeEntry(executor, cpu, mem, baselineMem, baselineCpu, entry, signatures) {
  const key = blockKey(entry.address);

  if (!PRELIFTED_BLOCKS[key]) {
    return {
      label: entry.label,
      entry: hex(entry.address, 6),
      key,
      available: false,
      reason: 'missing_prelifted_block',
    };
  }

  mem.set(baselineMem);
  restoreCpu(cpu, baselineCpu);

  const watchedRows = new Set();
  const fullRows = new Set();
  const firstWrites = [];
  const lastWrites = [];
  let watchedVramWriteCount = 0;
  let fullVramWriteCount = 0;

  const previousWrite8 = cpu.write8;
  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr >>> 0;
    const normalizedValue = value & 0xFF;

    if (normalizedAddr >= VRAM_BASE && normalizedAddr < FULL_VRAM_END) {
      fullVramWriteCount++;
      fullRows.add(Math.floor((normalizedAddr - VRAM_BASE) / (VRAM_WIDTH * 2)));
    }

    if (normalizedAddr >= VRAM_BASE && normalizedAddr < VRAM_WATCH_END) {
      watchedVramWriteCount++;
      watchedRows.add(Math.floor((normalizedAddr - VRAM_BASE) / (VRAM_WIDTH * 2)));

      const write = {
        addr: hex(normalizedAddr, 6),
        value: hex(normalizedValue, 2),
      };

      if (firstWrites.length < 20) {
        firstWrites.push(write);
      }
      captureRollingWrite(lastWrites, write, 20);
    }

    return previousWrite8.call(cpu, addr, value);
  };

  let run;
  try {
    run = executor.runFrom(entry.address, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 1000,
    });
  } finally {
    cpu.write8 = previousWrite8;
  }

  const diffInfo = analyzeVramDiff(baselineMem, mem);
  const shouldDecode = fullVramWriteCount > 100 || diffInfo.changedBytes > 100;
  const decodedText = shouldDecode ? decodeWrittenRows(mem, signatures, diffInfo) : [];
  const hasIdentifiableText = decodedText.some((candidate) => candidate.identifiable);

  return {
    label: entry.label,
    entry: hex(entry.address, 6),
    key,
    available: true,
    run: summarizeRun(run),
    watchedVramWriteCount,
    fullVramWriteCount,
    watchedRowRange: watchedRows.size === 0
      ? null
      : `${Math.min(...watchedRows)}-${Math.max(...watchedRows)}`,
    fullRowRange: fullRows.size === 0
      ? null
      : `${Math.min(...fullRows)}-${Math.max(...fullRows)}`,
    firstWrites,
    lastWrites,
    changedVramBytes: diffInfo.changedBytes,
    changedPixels: diffInfo.changedPixels,
    changedRowRange: diffInfo.rowRange,
    changedRows: diffInfo.changedRows,
    rowBands: diffInfo.rowBands,
    decodedText,
    hasIdentifiableText,
    verdictHit: fullVramWriteCount > 500 && hasIdentifiableText,
  };
}

function runStage(executor, cpu, mem, snapshot, label, entry) {
  prepareHomeStageCpu(cpu, snapshot, mem);
  const run = executor.runFrom(entry, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    label,
    entry: hex(entry, 6),
    ...summarizeRun(run),
  };
}

async function main() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const signatures = buildFontSignatures(romBytes);

  const coldBoot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;

  const osInit = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  const homeBaseCpu = snapshotCpu(cpu);

  clearVram(mem);

  const homeStages = [];
  homeStages.push(runStage(executor, cpu, mem, homeBaseCpu, 'stage_1_home_background', HOME_STAGE_1));
  homeStages.push(runStage(executor, cpu, mem, homeBaseCpu, 'stage_2_status_dots', HOME_STAGE_2));
  seedModeBuffer(mem);
  homeStages.push(runStage(executor, cpu, mem, homeBaseCpu, 'stage_3_mode_strip', HOME_STAGE_3));

  const compositeCpu = snapshotCpu(cpu);
  const compositeMem = mem.slice();
  const compositeStats = summarizeRenderedVram(mem);

  const probes = ENTRY_POINTS.map((entry) => (
    probeEntry(executor, cpu, mem, compositeMem, compositeCpu, entry, signatures)
  ));

  const verdict = probes.some((probe) => probe.verdictHit)
    ? 'MENU_RENDER_FOUND'
    : 'MENU_RENDER_NOT_FOUND';

  const report = {
    probe: 'phase109-menu-render',
    note: 'watchedVramWriteCount follows the requested 0xD40000-0xD52C00 write8 window; fullVramWriteCount and diff fields track the full 320x240x2 VRAM buffer.',
    transpilationMetaKeys: Object.keys(TRANSPILATION_META ?? {}).length,
    fontDecoder: {
      base: hex(FONT_BASE, 6),
      glyphWidth: GLYPH_WIDTH,
      glyphHeight: GLYPH_HEIGHT,
      signatures: signatures.length,
    },
    boot: {
      coldBoot: summarizeRun(coldBoot),
      osInit: summarizeRun(osInit),
      postInit: summarizeRun(postInit),
    },
    homeComposite: {
      modeBufferText: MODE_BUF_TEXT,
      stages: homeStages,
      renderedVram: compositeStats,
      cpuSnapshot: {
        sp: hex(compositeCpu.sp, 6),
        iy: hex(compositeCpu._iy, 6),
        mbase: hex(compositeCpu.mbase, 2),
        madl: compositeCpu.madl,
      },
    },
    probes,
    verdict,
  };

  console.log(JSON.stringify(report, null, 2));
}

await main();
