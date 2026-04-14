#!/usr/bin/env node
// Phase 50.2 - sweep 0x081670 across menu_mode values with the explicit-init
// template, then cross-check a few known renderers under mode 0x00 vs 0x40.

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
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const MODE_SWEEP_ENTRY = 0x081670;
const MENU_MODE_ADDR = 0xD007E0;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xD00080;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;
const PROBE_MAX_LOOPS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const ASCII_STRIDE = 2;
const ASCII_DUMP_LIMIT = 5;
const PROBE_TIMEOUT_MESSAGE = 'phase50_probe_timeout';
const BASELINE_MODE = 0x00;
const ALT_MODE = 0x40;

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

const MODE_VALUES = [
  0x00,
  0x40,
  0x41,
  0x42,
  0x43,
  0x44,
  0x45,
  0x46,
  0x47,
  0x48,
  0x49,
  0x4A,
  0x4B,
  0x4C,
  0x4D,
  0x4E,
  0x4F,
  0x50,
  0x52,
  0x53,
  0x54,
  0x55,
  0x56,
  0x57,
  0x58,
  0x59,
  0x5A,
  0x5B,
  0x7F,
  0x80,
  0xFF,
];

const CANDIDATE_MODE_VALUES = [0x00, 0x40];

const CANDIDATE_PROBES = [
  { addr: 0x081670, label: 'STAT/MATRIX editor', maxSteps: 200000 },
  { addr: 0x0296DD, label: 'MODE screen', maxSteps: 200000 },
  { addr: 0x078419, label: 'Y= / STAT PLOT editor', maxSteps: 2000000 },
  { addr: 0x089100, label: 'Done text', maxSteps: 100000 },
  { addr: 0x09EBF6, label: 'ABOUT', maxSteps: 400000 },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hex2(value) {
  return (value & 0xFF).toString(16).padStart(2, '0').toUpperCase();
}

function formatModeValue(mode) {
  const label = `0x${hex2(mode)}`;
  if (mode === 0x00) {
    return label;
  }

  if (mode >= 0x20 && mode <= 0x7E) {
    return `${label} (${String.fromCharCode(mode)})`;
  }

  return label;
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
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

function prepareProbe(cpu, mem, mode) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);
  mem[MENU_MODE_ADDR] = mode & 0xFF;
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

function bboxWidth(bbox) {
  if (!bbox) {
    return 0;
  }

  return bbox.maxCol - bbox.minCol + 1;
}

function bboxHeight(bbox) {
  if (!bbox) {
    return 0;
  }

  return bbox.maxRow - bbox.minRow + 1;
}

function bboxTouchesStatusBar(bbox) {
  return Boolean(bbox && bbox.minRow <= 30);
}

function bboxTouchesBottomPrompt(bbox) {
  return Boolean(bbox && bbox.maxRow >= 230);
}

function hasSparseText(stats) {
  return stats.fg >= 100 && stats.fg <= 1000;
}

function looksMenuLike(stats) {
  if (!stats.bbox) {
    return false;
  }

  return (
    stats.bg > stats.fg &&
    stats.drawn >= 20000 &&
    bboxWidth(stats.bbox) >= 250 &&
    bboxHeight(stats.bbox) >= 120
  );
}

function statsSignature(stats) {
  const bbox = stats.bbox
    ? `${stats.bbox.minRow}:${stats.bbox.maxRow}:${stats.bbox.minCol}:${stats.bbox.maxCol}`
    : 'none';

  return `${stats.drawn}/${stats.fg}/${stats.bg}/${stats.other}/${bbox}`;
}

function sameAsBaseline(stats, baselineStats) {
  if (!baselineStats) {
    return false;
  }

  return statsSignature(stats) === statsSignature(baselineStats);
}

function bboxNoveltyScore(bbox, baselineBbox) {
  if (!bbox) {
    return 0;
  }

  if (!baselineBbox) {
    return 40;
  }

  return (
    Math.abs(bbox.minRow - baselineBbox.minRow) +
    Math.abs(bbox.maxRow - baselineBbox.maxRow) +
    Math.abs(bbox.minCol - baselineBbox.minCol) +
    Math.abs(bbox.maxCol - baselineBbox.maxCol)
  );
}

function isHomeLike(stats, baselineStats) {
  if (!stats.bbox || stats.drawn === 0) {
    return false;
  }

  const sparse = hasSparseText(stats);
  const edgeSignal = bboxTouchesStatusBar(stats.bbox) || bboxTouchesBottomPrompt(stats.bbox);
  const sameBaseline = sameAsBaseline(stats, baselineStats);

  if (sameBaseline && !edgeSignal && !sparse) {
    return false;
  }

  return (
    stats.bg >= stats.fg &&
    sparse &&
    (edgeSignal || stats.drawn <= 12000)
  );
}

function buildVerdict(result, baselineStats) {
  const { stats, mode } = result;

  if (stats.drawn === 0) {
    return 'blank';
  }

  const verdict = [];
  const sameBaseline = sameAsBaseline(stats, baselineStats);

  if (mode === BASELINE_MODE) {
    verdict.push('baseline');
  } else if (sameBaseline) {
    verdict.push('same as 0x00');
  } else {
    verdict.push('variant');
  }

  if (looksMenuLike(stats)) {
    verdict.push('menu/page');
  }

  if (bboxTouchesStatusBar(stats.bbox)) {
    verdict.push('status-bar');
  }

  if (bboxTouchesBottomPrompt(stats.bbox)) {
    verdict.push('bottom-prompt');
  }

  if (hasSparseText(stats)) {
    verdict.push('sparse-text');
  }

  if (isHomeLike(stats, baselineStats)) {
    verdict.push('home?');
  }

  return verdict.join(', ');
}

function interestingScore(result, baselineStats) {
  const { stats, mode } = result;

  if (stats.drawn === 0 || !stats.bbox) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (bboxTouchesStatusBar(stats.bbox)) score += 100000;
  if (bboxTouchesBottomPrompt(stats.bbox)) score += 90000;
  if (hasSparseText(stats)) score += 70000 - Math.abs(stats.fg - 400) * 20;
  if (isHomeLike(stats, baselineStats)) score += 60000;
  if (looksMenuLike(stats)) score -= 20000;
  if (sameAsBaseline(stats, baselineStats) && mode !== BASELINE_MODE) score -= 40000;
  if (mode === BASELINE_MODE) score -= 10000;

  score += Math.min(30000, bboxNoveltyScore(stats.bbox, baselineStats?.bbox) * 400);

  if (baselineStats) {
    score += Math.min(25000, Math.abs(stats.drawn - baselineStats.drawn));
  }

  if (stats.bg > stats.fg) {
    score += 10000;
  }

  if (stats.drawn >= 300 && stats.drawn <= 12000) {
    score += 20000;
  }

  score -= Math.min(20000, stats.other * 2);

  return score;
}

function compareInteresting(left, right) {
  if (right.interestingScore !== left.interestingScore) {
    return right.interestingScore - left.interestingScore;
  }

  if (right.stats.drawn !== left.stats.drawn) {
    return right.stats.drawn - left.stats.drawn;
  }

  if (left.addr !== right.addr) {
    return left.addr - right.addr;
  }

  return left.mode - right.mode;
}

function compareEntryThenMode(left, right) {
  if (left.addr !== right.addr) {
    return left.addr - right.addr;
  }

  return left.mode - right.mode;
}

function buildAsciiFromVram(vram, bbox, stride = ASCII_STRIDE) {
  if (!bbox || !vram) {
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

function writeAsciiDump(result) {
  if (!result.vram || !result.stats.bbox) {
    return null;
  }

  const ascii = buildAsciiFromVram(result.vram, result.stats.bbox, ASCII_STRIDE);
  if (!ascii) {
    return null;
  }

  const outPath = path.join(__dirname, `phase50-081670-mode${hex2(result.mode)}.txt`);
  const lines = [
    `entry=${hex(result.addr)}`,
    `label=${result.label}`,
    `mode=${formatModeValue(result.mode)}`,
    `steps=${result.run.steps}`,
    `ms=${result.run.ms}`,
    `termination=${result.run.termination}@${hex(result.run.lastPc)}`,
    `drawn=${result.stats.drawn} fg=${result.stats.fg} bg=${result.stats.bg} other=${result.stats.other}`,
    `bbox=${formatBbox(result.stats.bbox)}`,
    `verdict=${result.verdict}`,
    `interestingScore=${result.interestingScore}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii,
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; this probe will not re-transpile the ROM.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function callOsInit(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOPS,
  });
}

function callSetTextFgColor(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = TEXT_FG_COLOR;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function runProbe(ex, addr, maxSteps) {
  const startedAt = Date.now();
  const raw = ex.runFrom(addr, 'adl', {
    maxSteps,
    maxLoopIterations: PROBE_MAX_LOOPS,
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

function executeProbe(ex, cpu, mem, sharedState, probe, mode, keepVram = false) {
  restoreBaseState(
    mem,
    cpu,
    sharedState.ramSnapshot,
    sharedState.cpuSnapshot,
    sharedState.clearedVram,
    sharedState.lcdMmio,
    sharedState.lcdSnapshot,
  );
  prepareProbe(cpu, mem, mode);

  const run = runProbe(ex, probe.addr, probe.maxSteps);
  const stats = collectVramStats(mem);

  return {
    addr: probe.addr,
    label: probe.label,
    mode,
    run,
    stats,
    vram: keepVram ? new Uint8Array(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_SIZE)) : null,
  };
}

function annotateResults(results, baselineLookup) {
  return results.map((result) => {
    const baselineStats = baselineLookup(result);
    return {
      ...result,
      verdict: buildVerdict(result, baselineStats),
      interestingScore: interestingScore(result, baselineStats),
    };
  });
}

function formatModeRow(result) {
  return [
    formatModeValue(result.mode).padEnd(10, ' '),
    String(result.stats.drawn).padStart(6, ' '),
    String(result.stats.fg).padStart(6, ' '),
    String(result.stats.bg).padStart(6, ' '),
    String(result.stats.other).padStart(6, ' '),
    formatBbox(result.stats.bbox).padEnd(18, ' '),
    result.verdict,
  ].join(' | ');
}

function formatCandidateRow(result) {
  return [
    hex(result.addr).padEnd(10, ' '),
    result.label.padEnd(22, ' '),
    formatModeValue(result.mode).padEnd(10, ' '),
    String(result.stats.drawn).padStart(6, ' '),
    String(result.stats.fg).padStart(6, ' '),
    String(result.stats.bg).padStart(6, ' '),
    String(result.stats.other).padStart(6, ' '),
    formatBbox(result.stats.bbox).padEnd(18, ' '),
    result.verdict,
  ].join(' | ');
}

function formatInterestingRow(result) {
  return [
    hex(result.addr).padEnd(10, ' '),
    result.label.padEnd(22, ' '),
    formatModeValue(result.mode).padEnd(10, ' '),
    String(result.interestingScore).padStart(8, ' '),
    String(result.stats.drawn).padStart(6, ' '),
    formatBbox(result.stats.bbox).padEnd(18, ' '),
    result.verdict,
  ].join(' | ');
}

function printModeSweepTable(results) {
  console.log('\n=== 0x081670 Mode Sweep (sorted by interestingness) ===');
  console.log('mode_value |  drawn |     fg |     bg |  other | bbox               | verdict');

  for (const result of results) {
    console.log(formatModeRow(result));
  }
}

function printCandidateTable(results) {
  console.log('\n=== Candidate Entry Cross-Check (explicit-init, mode 0x00 vs 0x40) ===');
  console.log('entry      | label                  | mode_value |  drawn |     fg |     bg |  other | bbox               | verdict');

  for (const result of results) {
    console.log(formatCandidateRow(result));
  }
}

function printInterestingTable(results, limit = 12) {
  console.log('\n=== Top Interesting Results Across All Probes ===');
  console.log('entry      | label                  | mode_value |    score |  drawn | bbox               | verdict');

  for (const result of results.slice(0, limit)) {
    console.log(formatInterestingRow(result));
  }
}

function printProgress(prefix, result) {
  console.log(
    `${prefix} ${formatModeValue(result.mode).padEnd(10, ' ')} ` +
    `drawn=${String(result.stats.drawn).padStart(6, ' ')} ` +
    `fg=${String(result.stats.fg).padStart(6, ' ')} ` +
    `bg=${String(result.stats.bg).padStart(6, ' ')} ` +
    `other=${String(result.stats.other).padStart(6, ' ')} ` +
    `bbox=${formatBbox(result.stats.bbox).padEnd(18, ' ')} ` +
    `term=${`${result.run.termination}@${hex(result.run.lastPc)}`.padEnd(19, ' ')} ` +
    `ms=${String(result.run.ms).padStart(5, ' ')}`,
  );
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;
  const lcdMmio = ex.lcdMmio ?? null;
  const clearedVram = buildClearedVramSnapshot();

  console.log('=== Phase 50.2 - 0x081670 menu_mode sweep ===');
  console.log('template: boot + explicit 0x08c331 rerun + explicit 0x0802b2 SetTextFgColor');

  const boot = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  const osInit = callOsInit(ex, cpu, mem);
  const setTextFg = callSetTextFgColor(ex, cpu, mem);

  console.log(`boot:        ${boot.steps} steps -> ${boot.termination}@${hex(boot.lastPc)}`);
  console.log(`os init:     ${osInit.steps} steps -> ${osInit.termination}@${hex(osInit.lastPc)}`);
  console.log(`set text fg: ${setTextFg.steps} steps -> ${setTextFg.termination}@${hex(setTextFg.lastPc)}`);

  const sharedState = {
    ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram,
    lcdMmio,
    lcdSnapshot: lcdMmio
      ? { upbase: lcdMmio.upbase, control: lcdMmio.control }
      : null,
  };

  console.log(
    `snapshot:    RAM ${hex(RAM_SNAPSHOT_START)}-${hex(RAM_SNAPSHOT_END)} ` +
    `(${(RAM_SNAPSHOT_END - RAM_SNAPSHOT_START).toLocaleString()} bytes)`,
  );

  const rawModeResults = [];
  const sweepProbe = { addr: MODE_SWEEP_ENTRY, label: 'STAT/MATRIX editor', maxSteps: 200000 };

  console.log('\n=== Running 0x081670 sweep ===');
  for (const mode of MODE_VALUES) {
    const result = executeProbe(ex, cpu, mem, sharedState, sweepProbe, mode, true);
    rawModeResults.push(result);
    printProgress('081670', result);
  }

  const modeBaseline = rawModeResults.find((result) => result.mode === BASELINE_MODE)?.stats ?? null;
  const modeResults = annotateResults(rawModeResults, () => modeBaseline).sort(compareInteresting);

  const rawModeLookup = new Map(
    rawModeResults.map((result) => [`${result.addr}:${result.mode}`, result]),
  );

  const rawCandidateResults = [];

  console.log('\n=== Running candidate cross-checks ===');
  for (const probe of CANDIDATE_PROBES) {
    for (const mode of CANDIDATE_MODE_VALUES) {
      const cacheKey = `${probe.addr}:${mode}`;
      const cached = rawModeLookup.get(cacheKey);

      const result = cached
        ? {
            addr: cached.addr,
            label: probe.label,
            mode: cached.mode,
            run: { ...cached.run },
            stats: { ...cached.stats, bbox: cached.stats.bbox ? { ...cached.stats.bbox } : null },
            vram: null,
            reusedFromSweep: true,
          }
        : executeProbe(ex, cpu, mem, sharedState, probe, mode, false);

      rawCandidateResults.push(result);
      printProgress(hex(probe.addr), result);
    }
  }

  const candidateBaselines = new Map();
  for (const result of rawCandidateResults) {
    if (result.mode === BASELINE_MODE) {
      candidateBaselines.set(result.addr, result.stats);
    }
  }

  const candidateResults = annotateResults(
    rawCandidateResults,
    (result) => candidateBaselines.get(result.addr) ?? null,
  ).sort(compareEntryThenMode);

  const allInteresting = [...modeResults, ...candidateResults].sort(compareInteresting);
  const topModeResults = modeResults
    .filter((result) => result.stats.drawn > 0 && result.stats.bbox)
    .slice(0, ASCII_DUMP_LIMIT);

  printModeSweepTable(modeResults);
  printCandidateTable(candidateResults);
  printInterestingTable(allInteresting);

  console.log('\n=== ASCII Dumps (top 5 interesting 0x081670 modes) ===');
  if (topModeResults.length === 0) {
    console.log('none');
  } else {
    for (const result of topModeResults) {
      const outPath = writeAsciiDump(result);
      console.log(`${formatModeValue(result.mode)} -> ${outPath ? path.basename(outPath) : 'not written'}`);
    }
  }

  const homeLikeModes = modeResults.filter((result) => isHomeLike(result.stats, modeBaseline));

  console.log('\n=== Final Guess ===');
  if (homeLikeModes.length === 0) {
    const best = modeResults[0] ?? null;
    console.log('No convincing 0x081670 home-screen-like variant showed up in this sweep.');
    if (best) {
      console.log(
        `Best lead: ${formatModeValue(best.mode)} -> ${best.verdict}; ` +
        `drawn=${best.stats.drawn}, fg=${best.stats.fg}, bg=${best.stats.bg}, ` +
        `bbox=${formatBbox(best.stats.bbox)}`,
      );
    }
    console.log('If the top ASCII dumps still look like editor/menu layouts, 0x081670 is probably not the home-screen renderer.');
    return;
  }

  const best = homeLikeModes[0];
  console.log(
    `Possible home-screen-like modes: ${homeLikeModes.map((result) => formatModeValue(result.mode)).join(', ')}`,
  );
  console.log(
    `Top guess: ${formatModeValue(best.mode)} -> ${best.verdict}; ` +
    `drawn=${best.stats.drawn}, fg=${best.stats.fg}, bg=${best.stats.bg}, ` +
    `bbox=${formatBbox(best.stats.bbox)}`,
  );
}

await main();
