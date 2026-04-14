#!/usr/bin/env node
// Phase 49.3:
// Re-verify the key Phase 47.x/48 screen hits with the corrected template:
// cold boot only, no explicit 0x08C331 rerun after reset.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const SCREEN_STACK_BYTES = 12;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const PROBE_MAX_STEPS = 200000;
const PROBE_MAX_LOOP_ITERATIONS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const ASCII_STRIDE = 2;
const ASCII_DUMP_LIMIT = 10;
const IMPROVEMENT_THRESHOLD_PCT = 50;
const ANCHOR_SCAN_BYTES = 0x200;
const ANCHOR_MIN_LEN = 6;
const PROBE_TIMEOUT_MESSAGE = 'phase49_probe_timeout';
const CATALOG_REFERENCE_ADDR = 0x04E1D0;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

const KNOWN_MENU_NAMES = [
  'CATALOG',
  'LIST OPS',
  'STAT PLOT',
  'Y-VARS',
  'FINANCE',
  'FNANCE',
  'DRAW',
  'PRGM',
  'STRING',
  'MATRIX',
  'ANGLE',
  'TEST',
  'MATH',
  'STAT',
  'MEM',
  'MODE',
  'TABLE',
  'LINK',
  'VARS',
];

const PROBES = [
  { addr: 0x09EBF6, label: 'ABOUT screen', oldDrawn: 22824 },
  { addr: 0x0B9C64, label: 'Transformation Graphing main', oldDrawn: 32470 },
  { addr: 0x074817, label: 'Inequality Graphing main', oldDrawn: 30028 },
  { addr: 0x028944, label: 'TEST MODE colorful', oldDrawn: 25568 },
  { addr: 0x028977, label: 'TEST MODE variant', oldDrawn: 22560 },
  { addr: 0x074610, label: 'InEqGraph 2-row', oldDrawn: 14304 },
  { addr: 0x0B9887, label: 'TransGraph 2-row', oldDrawn: 14088 },
  { addr: 0x074422, label: 'InEqGraph 1-row', oldDrawn: 10692 },
  { addr: 0x0B9A58, label: 'TransGraph 2-row narrower', oldDrawn: 9768 },
  { addr: 0x028CFF, label: 'small TEST MODE row', oldDrawn: 2844 },
  { addr: 0x04615C, label: 'Keyboard Test', oldDrawn: 6732 },
  { addr: 0x046246, label: 'FLASH System Test', oldDrawn: 7812 },
  { addr: 0x06AFF0, label: 'Store Results?', oldDrawn: 4176 },
  { addr: 0x089100, label: "'Done' text (Phase 43.5)", oldDrawn: null },
  {
    addr: 0x045DE1,
    label: '2-line text (Phase 44.3)',
    oldDrawn: null,
    oldBbox: { minRow: 77, maxRow: 134, minCol: 0, maxCol: 229 },
  },
  { addr: 0x081670, label: 'STAT/MATRIX editor (Phase 31)', oldDrawn: null },
  {
    addr: 0x09EC0E,
    label: '0x09exxx 3-bar (Phase 46.6)',
    oldDrawn: 20340,
    oldBbox: { minRow: 18, maxRow: 234, minCol: 0, maxCol: 253 },
  },
  {
    addr: 0x09CC2A,
    label: 'CATALOG-like mystery A',
    oldDrawn: 54528,
    oldBbox: { minRow: 37, maxRow: 234, minCol: 0, maxCol: 313 },
  },
  {
    addr: 0x096AEE,
    label: 'CATALOG-like mystery B',
    oldDrawn: 54459,
    oldBbox: { minRow: 37, maxRow: 234, minCol: 0, maxCol: 313 },
  },
  {
    addr: 0x04E1D0,
    label: 'CATALOG (anchor 0x04e0dc)',
    oldDrawn: 54456,
    oldBbox: { minRow: 37, maxRow: 234, minCol: 0, maxCol: 313 },
  },
  {
    addr: 0x05CEA3,
    label: 'top-half mystery',
    oldDrawn: 6984,
    oldBbox: { minRow: 37, maxRow: 74, minCol: 0, maxCol: 229 },
  },
  { addr: 0x0B79AF, label: '0x0b79af mystery', oldDrawn: 6984 },
  { addr: 0x06B6F7, label: '0x06b6f7 mystery', oldDrawn: 3528 },
  { addr: 0x062160, label: '0x062160 mystery', oldDrawn: 2404 },
  { addr: 0x09D520, label: '0x09d520 mystery', oldDrawn: 1116 },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatHex(value, width = 6) {
  if (!Number.isInteger(value)) {
    return 'n/a';
  }

  return hex(value, width);
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; this script will not re-transpile the ROM.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xFF;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function snapshotCpu(cpu) {
  const snapshot = {};

  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }

  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (!lcdMmio || !lcdSnapshot) {
    return;
  }

  lcdMmio.upbase = lcdSnapshot.upbase;
  lcdMmio.control = lcdSnapshot.control;
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - SCREEN_STACK_BYTES;
  fillSentinel(mem, cpu.sp, SCREEN_STACK_BYTES);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function readPixelFromVram(vram, row, col) {
  const offset = row * VRAM_WIDTH * 2 + col * 2;
  return vram[offset] | (vram[offset + 1] << 8);
}

function collectVramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let other = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;

      if (pixel === TEXT_FG_COLOR) fg++;
      else if (pixel === TEXT_BG_COLOR) bg++;
      else other++;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawn,
    fg,
    bg,
    other,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function callSetTextFgColor(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function formatBbox(bbox) {
  if (!bbox) {
    return '[none]';
  }

  return `[${bbox.minRow}-${bbox.maxRow},${bbox.minCol}-${bbox.maxCol}]`;
}

function formatHistoricalBbox(bbox) {
  if (!bbox) {
    return 'unknown';
  }

  return formatBbox(bbox);
}

function formatBboxChange(oldBbox, newBbox) {
  return `${formatHistoricalBbox(oldBbox)} -> ${formatBbox(newBbox)}`;
}

function buildAsciiFromVram(vram, bbox, stride = ASCII_STRIDE) {
  if (!bbox) {
    return null;
  }

  const lines = [];

  for (let row = bbox.minRow; row <= bbox.maxRow; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = bbox.minCol; col <= bbox.maxCol; col += stride) {
      const pixel = readPixelFromVram(vram, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '+';
    }

    lines.push(line);
  }

  return lines.join('\n');
}

function formatNumber(value) {
  if (typeof value !== 'number') {
    return 'unknown';
  }

  return String(value);
}

function deltaPct(oldValue, newValue) {
  if (typeof oldValue !== 'number' || oldValue <= 0) {
    return null;
  }

  return ((newValue - oldValue) / oldValue) * 100;
}

function formatDeltaPct(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function classifyVerdict(oldValue, newValue) {
  const pct = deltaPct(oldValue, newValue);
  if (pct === null) {
    return 'n/a';
  }

  if (newValue === oldValue) {
    return 'same';
  }

  return pct > 0 ? 'improved' : 'regressed';
}

function compareResultsByDrawn(a, b) {
  if (b.stats.drawn !== a.stats.drawn) {
    return b.stats.drawn - a.stats.drawn;
  }

  return a.addr - b.addr;
}

function compareImprovementCandidates(a, b) {
  if (b.deltaPct !== a.deltaPct) {
    return b.deltaPct - a.deltaPct;
  }

  if (b.stats.drawn !== a.stats.drawn) {
    return b.stats.drawn - a.stats.drawn;
  }

  return a.addr - b.addr;
}

function isPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7E;
}

function cleanAnchorText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function scanPrintableStringsBefore(rom, entryAddr, bytes = ANCHOR_SCAN_BYTES, minLen = ANCHOR_MIN_LEN) {
  const start = Math.max(0, entryAddr - bytes);
  const hits = [];
  let runStart = -1;

  for (let addr = start; addr <= entryAddr; addr++) {
    const byte = addr < entryAddr ? rom[addr] : 0x00;

    if (addr < entryAddr && isPrintable(byte)) {
      if (runStart === -1) {
        runStart = addr;
      }
      continue;
    }

    if (runStart === -1) {
      continue;
    }

    const len = addr - runStart;
    if (len >= minLen) {
      const rawText = Buffer.from(rom.subarray(runStart, addr)).toString('ascii');
      const text = cleanAnchorText(rawText);

      if (text.length > 0) {
        hits.push({ addr: runStart, len, text });
      }
    }

    runStart = -1;
  }

  hits.sort((a, b) => b.addr - a.addr);
  return hits;
}

function uniqueAnchors(strings) {
  const seen = new Set();
  const deduped = [];

  for (const entry of strings) {
    const key = `${entry.addr}:${entry.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function selectAnchorGuess(strings) {
  for (const entry of strings) {
    const upper = entry.text.toUpperCase();
    for (const name of KNOWN_MENU_NAMES) {
      if (upper.includes(name)) {
        return name;
      }
    }
  }

  return null;
}

function sameBbox(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.minRow === b.minRow &&
    a.maxRow === b.maxRow &&
    a.minCol === b.minCol &&
    a.maxCol === b.maxCol
  );
}

function guessCatalogFamily(addr, anchors, resultsByAddr) {
  const directGuess = selectAnchorGuess(anchors);
  if (directGuess) {
    return directGuess;
  }

  const reference = resultsByAddr.get(CATALOG_REFERENCE_ADDR);
  const current = resultsByAddr.get(addr);
  if (!reference || !current) {
    return 'unknown catalog-like page';
  }

  const sameLayout = sameBbox(reference.stats.bbox, current.stats.bbox);
  const drawnDelta = Math.abs(reference.stats.drawn - current.stats.drawn);

  if (sameLayout && drawnDelta <= 256) {
    return 'CATALOG-family page (same renderer family as 0x04e1d0)';
  }

  return 'unknown catalog-like page';
}

function writeAsciiDump(result) {
  if (!result.vram || !result.stats.bbox) {
    return null;
  }

  const ascii = buildAsciiFromVram(result.vram, result.stats.bbox, ASCII_STRIDE);
  if (!ascii) {
    return null;
  }

  const outPath = path.join(
    __dirname,
    `phase49-reverify-${result.addr.toString(16).padStart(6, '0')}.txt`,
  );

  const lines = [
    `addr=${hex(result.addr)}`,
    `label=${result.label}`,
    `oldDrawn=${formatNumber(result.oldDrawn)}`,
    `newDrawn=${result.stats.drawn}`,
    `deltaPct=${formatDeltaPct(result.deltaPct)}`,
    `steps=${result.run.steps}`,
    `ms=${result.run.ms}`,
    `termination=${result.run.termination}@${formatHex(result.run.lastPc)}`,
    `fg=${result.stats.fg} bg=${result.stats.bg} other=${result.stats.other}`,
    `bbox=${formatBbox(result.stats.bbox)}`,
    `oldBbox=${formatHistoricalBbox(result.oldBbox)}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii,
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

function runProbe(ex, addr) {
  const startedAt = Date.now();
  const raw = ex.runFrom(addr, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
    maxLoopIterations: PROBE_MAX_LOOP_ITERATIONS,
    onBlock() {
      if (Date.now() - startedAt > PROBE_TIMEOUT_MS) {
        throw new Error(PROBE_TIMEOUT_MESSAGE);
      }
    },
  });

  const ms = Date.now() - startedAt;
  const timedOut =
    raw.termination === 'error' &&
    raw.error instanceof Error &&
    raw.error.message === PROBE_TIMEOUT_MESSAGE;

  return {
    ...raw,
    ms,
    timedOut,
    termination: timedOut ? 'timeout' : raw.termination,
  };
}

function formatProbeProgress(result) {
  return [
    hex(result.addr),
    result.label.padEnd(32),
    `drawn=${String(result.stats.drawn).padStart(6, ' ')}`,
    `fg=${String(result.stats.fg).padStart(6, ' ')}`,
    `bg=${String(result.stats.bg).padStart(6, ' ')}`,
    `other=${String(result.stats.other).padStart(6, ' ')}`,
    `bbox=${formatBbox(result.stats.bbox).padEnd(20, ' ')}`,
    `term=${`${result.run.termination}@${formatHex(result.run.lastPc)}`.padEnd(18, ' ')}`,
    `ms=${String(result.run.ms).padStart(5, ' ')}`,
  ].join('  ');
}

function formatComparisonRow(result) {
  return [
    hex(result.addr).padEnd(10, ' '),
    result.label.padEnd(32, ' '),
    formatNumber(result.oldDrawn).padStart(8, ' '),
    String(result.stats.drawn).padStart(8, ' '),
    formatDeltaPct(result.deltaPct).padStart(8, ' '),
    formatBboxChange(result.oldBbox, result.stats.bbox).padEnd(38, ' '),
    classifyVerdict(result.oldDrawn, result.stats.drawn),
  ].join('  ');
}

function printComparisonTable(results) {
  console.log('\n=== Comparison Table (sorted by new drawn cells) ===');
  console.log(
    [
      'Address'.padEnd(10, ' '),
      'Label'.padEnd(32, ' '),
      'Old'.padStart(8, ' '),
      'New'.padStart(8, ' '),
      'Delta%'.padStart(8, ' '),
      'Bbox change'.padEnd(38, ' '),
      'Verdict',
    ].join('  '),
  );

  for (const result of results) {
    console.log(formatComparisonRow(result));
  }
}

function printAnchorSection(addr, anchors) {
  console.log(`\n${hex(addr)}:`);

  if (anchors.length === 0) {
    console.log('  none');
    return;
  }

  for (const entry of anchors) {
    console.log(`  ${hex(entry.addr)}  "${entry.text}"`);
  }
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;
  const clearedVram = buildClearedVramSnapshot();

  console.log('=== Phase 49.3 - corrected template re-verify ===');
  console.log('template: cold boot only; no explicit 0x08C331 call after reset');

  const boot = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  console.log(`boot: ${boot.steps} steps -> ${boot.termination}@${formatHex(boot.lastPc)}`);

  const setTextFgColor = callSetTextFgColor(ex, cpu, mem);
  console.log(
    `setTextFgColor: ${setTextFgColor.steps} steps -> ` +
    `${setTextFgColor.termination}@${formatHex(setTextFgColor.lastPc)}`,
  );

  const ramSnapshot = new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  const lcdSnapshot = ex.lcdMmio
    ? { upbase: ex.lcdMmio.upbase, control: ex.lcdMmio.control }
    : null;

  const results = [];

  console.log('\n=== Probe Progress ===');

  for (const probe of PROBES) {
    restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, ex.lcdMmio, lcdSnapshot);
    prepareProbe(cpu, mem);

    const run = runProbe(ex, probe.addr);
    const stats = collectVramStats(mem);
    const delta = deltaPct(probe.oldDrawn, stats.drawn);

    const result = {
      ...probe,
      run,
      stats,
      deltaPct: delta,
      vram: mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE),
    };

    results.push(result);
    console.log(formatProbeProgress(result));
  }

  const sortedByDrawn = [...results].sort(compareResultsByDrawn);
  printComparisonTable(sortedByDrawn);

  const asciiCandidates = results
    .filter((result) => typeof result.deltaPct === 'number' && result.deltaPct >= IMPROVEMENT_THRESHOLD_PCT)
    .sort(compareImprovementCandidates)
    .slice(0, ASCII_DUMP_LIMIT);

  console.log('\n=== ASCII Dumps (delta >= 50%) ===');
  if (asciiCandidates.length === 0) {
    console.log('none');
  } else {
    for (const result of asciiCandidates) {
      const outPath = writeAsciiDump(result);
      console.log(`${hex(result.addr)}  ${outPath ? path.basename(outPath) : 'not written'}`);
    }
  }

  const anchorTargets = [0x09CC2A, 0x096AEE];
  const anchorMap = new Map(
    anchorTargets.map((addr) => [addr, uniqueAnchors(scanPrintableStringsBefore(romBytes, addr))]),
  );

  console.log('\n=== String Anchors (512 bytes before entry, printable len >= 6) ===');
  for (const addr of anchorTargets) {
    printAnchorSection(addr, anchorMap.get(addr) ?? []);
  }

  const resultsByAddr = new Map(results.map((result) => [result.addr, result]));
  const guess09cc2a = guessCatalogFamily(0x09CC2A, anchorMap.get(0x09CC2A) ?? [], resultsByAddr);
  const guess096aee = guessCatalogFamily(0x096AEE, anchorMap.get(0x096AEE) ?? [], resultsByAddr);

  console.log('\n=== Final Guess ===');
  console.log(`0x09cc2a -> ${guess09cc2a}`);
  console.log(`0x096aee -> ${guess096aee}`);
}

await main();
