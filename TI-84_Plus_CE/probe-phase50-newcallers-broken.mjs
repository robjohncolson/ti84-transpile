#!/usr/bin/env node
// Phase 50.1: re-probe the uncovered 0x0a1cac caller regions with the
// explicit 0x08c331 init step, while also recomputing a boot-only baseline
// so every caller gets old/new fg deltas in one run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  TARGET_ADDR,
  hex,
  listPhase48Callers,
  loadRom,
} from './scan-a1cac-callers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const romBytes = loadRom(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const SCREEN_STACK_BYTES = 12;
const MENU_MODE_ADDR = 0xD007E0;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const MAX_PROBES = 80;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;
const PROBE_MAX_STEPS = 200000;
const PROBE_MAX_LOOPS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const LEGIBLE_SCORE_THRESHOLD = 1500;
const ASCII_STRIDE = 2;
const TOP_ASCII_DUMPS = 10;
const ANCHOR_SCAN_BYTES = 0x200;
const ANCHOR_MIN_LEN = 6;

const PROBE_TIMEOUT_MESSAGE = 'phase50_probe_timeout';

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

const TEMPLATE_VARIANTS = {
  bootOnly: { label: 'boot-only', explicitInit: false },
  explicitInit: { label: 'explicit-init', explicitInit: true },
};

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

      drawn += 1;

      if (pixel === TEXT_FG_COLOR) fg += 1;
      else if (pixel === TEXT_BG_COLOR) bg += 1;
      else other += 1;

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
    score: fg + other,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function callExplicitOsInit(ex, cpu, mem) {
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
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - SCREEN_STACK_BYTES;
  fillSentinel(mem, cpu.sp, SCREEN_STACK_BYTES);
  mem[MENU_MODE_ADDR] = 0x40;
}

function restoreBaseState(runner) {
  const { mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot } = runner;

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (!lcdMmio || !lcdSnapshot) {
    return;
  }

  lcdMmio.upbase = lcdSnapshot.upbase;
  lcdMmio.control = lcdSnapshot.control;
}

function runProbe(ex, target) {
  const startedAt = Date.now();

  const raw = ex.runFrom(target, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
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

function runCaller(runner, hit) {
  restoreBaseState(runner);
  prepareProbe(runner.cpu, runner.mem);

  const run = runProbe(runner.ex, hit.entry);
  const stats = collectVramStats(runner.mem);

  return {
    run,
    stats,
    isLegible: !run.timedOut && stats.score > LEGIBLE_SCORE_THRESHOLD,
    vram: runner.mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE),
  };
}

function formatBbox(bbox) {
  if (!bbox) {
    return '[none]';
  }

  return `[${bbox.minRow}-${bbox.maxRow},${bbox.minCol}-${bbox.maxCol}]`;
}

function formatMetrics(stats) {
  if (!stats) {
    return 'n/a';
  }

  return `d=${stats.drawn} fg=${stats.fg} bg=${stats.bg}`;
}

function formatNewMetrics(stats) {
  if (!stats) {
    return 'n/a';
  }

  return `d=${stats.drawn} fg=${stats.fg} bg=${stats.bg} other=${stats.other}`;
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

  for (let addr = start; addr <= entryAddr; addr += 1) {
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
        hits.push({
          addr: runStart,
          len,
          text,
        });
      }
    }

    runStart = -1;
  }

  hits.sort((a, b) => b.addr - a.addr);
  return hits;
}

function uniqueAnchors(anchors) {
  const seen = new Set();
  const deduped = [];

  for (const anchor of anchors) {
    const key = `${anchor.addr}:${anchor.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(anchor);
  }

  return deduped;
}

function trimAnchorText(text, maxLen = 24) {
  if (text.length <= maxLen) {
    return text;
  }

  return `${text.slice(0, maxLen - 3)}...`;
}

function summarizeAnchors(anchors, limit = 2, maxLen = 24) {
  if (!anchors || anchors.length === 0) {
    return 'none';
  }

  return anchors
    .slice(0, limit)
    .map((anchor) => `${hex(anchor.addr)}:"${trimAnchorText(anchor.text, maxLen)}"`)
    .join(' | ');
}

function buildAsciiFromVram(vram, bbox, stride = ASCII_STRIDE) {
  if (!bbox) {
    return null;
  }

  const lines = [];

  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
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

function classifyVerdict(oldResult, newResult) {
  if (newResult.run.timedOut) {
    return 'timeout';
  }

  if (newResult.isLegible && !oldResult.isLegible) {
    return 'new legible';
  }

  if (newResult.stats.fg > oldResult.stats.fg) {
    return newResult.isLegible ? 'more text' : 'more fg';
  }

  if (newResult.stats.fg < oldResult.stats.fg) {
    return 'less fg';
  }

  if (newResult.isLegible) {
    return 'legible';
  }

  return 'flat';
}

function compareRows(a, b) {
  if (b.new.stats.score !== a.new.stats.score) {
    return b.new.stats.score - a.new.stats.score;
  }

  if (b.new.stats.fg !== a.new.stats.fg) {
    return b.new.stats.fg - a.new.stats.fg;
  }

  if (b.new.stats.drawn !== a.new.stats.drawn) {
    return b.new.stats.drawn - a.new.stats.drawn;
  }

  return a.caller - b.caller;
}

function formatProgressRow(row) {
  const deltaFg = row.new.stats.fg - row.old.stats.fg;
  const sign = deltaFg >= 0 ? '+' : '';

  return [
    row.new.isLegible ? 'hit' : row.new.run.timedOut ? 'tmo' : '   ',
    hex(row.caller),
    `entry=${hex(row.entry)}`,
    `old_fg=${String(row.old.stats.fg).padStart(5, ' ')}`,
    `new_fg=${String(row.new.stats.fg).padStart(5, ' ')}`,
    `delta_fg=${`${sign}${deltaFg}`.padStart(7, ' ')}`,
    `score=${String(row.new.stats.score).padStart(5, ' ')}`,
    `bbox=${formatBbox(row.new.stats.bbox)}`,
    `anchor=${summarizeAnchors(row.anchors, 1)}`,
  ].join('  ');
}

function formatSummaryRow(row) {
  const deltaFg = row.new.stats.fg - row.old.stats.fg;
  const sign = deltaFg >= 0 ? '+' : '';

  return [
    hex(row.caller).padEnd(10, ' '),
    hex(row.entry).padEnd(10, ' '),
    formatMetrics(row.old.stats).padEnd(24, ' '),
    formatNewMetrics(row.new.stats).padEnd(32, ' '),
    `${sign}${deltaFg}`.padStart(8, ' '),
    String(row.new.stats.score).padStart(7, ' '),
    formatBbox(row.new.stats.bbox).padEnd(20, ' '),
    summarizeAnchors(row.anchors, 1).padEnd(28, ' '),
    row.verdict,
  ].join('  ');
}

function writeAsciiDump(row) {
  const ascii = buildAsciiFromVram(row.new.vram, row.new.stats.bbox, ASCII_STRIDE);
  if (!ascii) {
    return null;
  }

  const outPath = path.join(
    __dirname,
    `phase50-newcallers-${row.caller.toString(16).padStart(6, '0')}.txt`,
  );

  const deltaFg = row.new.stats.fg - row.old.stats.fg;
  const lines = [
    `caller=${hex(row.caller)}`,
    `entry=${hex(row.entry)}`,
    `kind=${row.kind}`,
    `region=${row.region.label}`,
    `entryHeuristic=${row.entryHeuristic}`,
    `old=${formatMetrics(row.old.stats)}`,
    `new=${formatNewMetrics(row.new.stats)}`,
    `newScore=${row.new.stats.score}`,
    `deltaFg=${deltaFg}`,
    `bbox=${formatBbox(row.new.stats.bbox)}`,
    `verdict=${row.verdict}`,
    `anchors=${summarizeAnchors(row.anchors, 5, 80)}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii,
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

async function buildRunner(blocks, template) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  const boot = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  let explicitInit = null;
  if (template.explicitInit) {
    explicitInit = callExplicitOsInit(ex, cpu, mem);
  }

  const setText = callSetTextFgColor(ex, cpu, mem);

  return {
    ...template,
    mem,
    ex,
    cpu,
    lcdMmio: ex.lcdMmio,
    lcdSnapshot: ex.lcdMmio
      ? { upbase: ex.lcdMmio.upbase, control: ex.lcdMmio.control }
      : null,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVramSnapshot(),
    setup: {
      boot,
      explicitInit,
      setText,
    },
  };
}

async function main() {
  const allCallers = listPhase48Callers(romBytes);
  const probeTargets = allCallers.slice(0, MAX_PROBES);

  console.log(`=== Phase 50.1: re-probe uncovered ${hex(TARGET_ADDR)} callers ===`);
  console.log(`filtered_callers=${allCallers.length}  probe_cap=${MAX_PROBES}  probing=${probeTargets.length}`);
  console.log('old baseline: boot-only template (Phase 48.4 style), recomputed locally');
  console.log('new template: explicit 0x08c331 init before SetTextFgColor');
  console.log('');

  if (probeTargets.length === 0) {
    console.log('No uncovered callers found.');
    return;
  }

  const blocks = await loadBlocks();
  const oldRunner = await buildRunner(blocks, TEMPLATE_VARIANTS.bootOnly);
  const newRunner = await buildRunner(blocks, TEMPLATE_VARIANTS.explicitInit);

  console.log(
    `boot-only setup: boot=${oldRunner.setup.boot.termination}@${hex(oldRunner.setup.boot.lastPc ?? 0)} ` +
    `setText=${oldRunner.setup.setText.termination}@${hex(oldRunner.setup.setText.lastPc ?? 0)}`,
  );
  console.log(
    `explicit-init setup: boot=${newRunner.setup.boot.termination}@${hex(newRunner.setup.boot.lastPc ?? 0)} ` +
    `osInit=${newRunner.setup.explicitInit?.termination ?? 'n/a'}@${hex(newRunner.setup.explicitInit?.lastPc ?? 0)} ` +
    `setText=${newRunner.setup.setText.termination}@${hex(newRunner.setup.setText.lastPc ?? 0)}`,
  );
  console.log('');
  console.log('=== Probe Progress ===');

  const rows = [];

  for (const hit of probeTargets) {
    const oldResult = runCaller(oldRunner, hit);
    const newResult = runCaller(newRunner, hit);
    const anchors = uniqueAnchors(scanPrintableStringsBefore(romBytes, hit.entry));

    const row = {
      ...hit,
      old: oldResult,
      new: newResult,
      anchors,
      verdict: classifyVerdict(oldResult, newResult),
    };

    rows.push(row);
    console.log(formatProgressRow(row));
  }

  const ranked = [...rows].sort(compareRows);
  const legible = ranked.filter((row) => row.new.isLegible);
  const asciiRows = ranked.slice(0, Math.min(TOP_ASCII_DUMPS, ranked.length));

  console.log('');
  console.log(`legible_text_probes=${legible.length}  threshold=fg+other>${LEGIBLE_SCORE_THRESHOLD}`);
  console.log(`new_timeouts=${rows.filter((row) => row.new.run.timedOut).length}`);
  console.log(`old_timeouts=${rows.filter((row) => row.old.run.timedOut).length}`);
  console.log('');
  console.log('=== Final Summary (sorted by new fg+other) ===');
  console.log(
    [
      'Caller'.padEnd(10, ' '),
      'Entry'.padEnd(10, ' '),
      'Old(d/fg/bg)'.padEnd(24, ' '),
      'New(d/fg/bg/o)'.padEnd(32, ' '),
      'DeltaFg'.padStart(8, ' '),
      'NewS'.padStart(7, ' '),
      'Bbox'.padEnd(20, ' '),
      'String anchor'.padEnd(28, ' '),
      'Verdict',
    ].join('  '),
  );

  for (const row of ranked) {
    console.log(formatSummaryRow(row));
  }

  console.log('');
  console.log(`=== Writing top ${asciiRows.length} ASCII dumps ===`);

  for (const row of asciiRows) {
    const outPath = writeAsciiDump(row);
    console.log(
      `${hex(row.caller)}  entry=${hex(row.entry)}  newScore=${row.new.stats.score}  ascii=${outPath ? path.basename(outPath) : 'n/a'}`,
    );
  }
}

await main();
