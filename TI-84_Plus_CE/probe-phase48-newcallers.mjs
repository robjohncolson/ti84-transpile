#!/usr/bin/env node
// Phase 48: probe uncovered 0x0a1cac caller regions for app/info screens.
// The script boots once, snapshots post-init RAM/CPU state, restores that
// snapshot per target, and ranks callers that produce text-like VRAM output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  TARGET_ADDR,
  findNearbyAsciiStrings,
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
const MENU_MODE_ADDR = 0xD007E0;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const MAX_PROBES = 80;
const MAX_STEPS = 200000;
const MAX_LOOP_ITERATIONS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const ASCII_STRIDE = 2;
const TOP_HITS_TO_PRINT = 10;
const TOP_ASCII_DUMPS = 5;

const PROBE_TIMEOUT_MESSAGE = 'phase48_probe_timeout';

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; Phase 48 should not rerun the transpiler.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function readPixelFromVram(vram, row, col) {
  const offset = row * VRAM_WIDTH * 2 + col * 2;
  return vram[offset] | (vram[offset + 1] << 8);
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
  return {
    a: cpu.a,
    f: cpu.f,
    _bc: cpu._bc,
    _de: cpu._de,
    _hl: cpu._hl,
    _a2: cpu._a2,
    _f2: cpu._f2,
    _bc2: cpu._bc2,
    _de2: cpu._de2,
    _hl2: cpu._hl2,
    sp: cpu.sp,
    _ix: cpu._ix,
    _iy: cpu._iy,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    mbase: cpu.mbase,
    halted: cpu.halted,
    cycles: cpu.cycles,
  };
}

function restoreCpu(cpu, snapshot) {
  cpu.a = snapshot.a;
  cpu.f = snapshot.f;
  cpu._bc = snapshot._bc;
  cpu._de = snapshot._de;
  cpu._hl = snapshot._hl;
  cpu._a2 = snapshot._a2;
  cpu._f2 = snapshot._f2;
  cpu._bc2 = snapshot._bc2;
  cpu._de2 = snapshot._de2;
  cpu._hl2 = snapshot._hl2;
  cpu.sp = snapshot.sp;
  cpu._ix = snapshot._ix;
  cpu._iy = snapshot._iy;
  cpu.i = snapshot.i;
  cpu.im = snapshot.im;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.madl = snapshot.madl;
  cpu.mbase = snapshot.mbase;
  cpu.halted = snapshot.halted;
  cpu.cycles = snapshot.cycles;
}

function restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (lcdMmio && lcdSnapshot) {
    lcdMmio.upbase = lcdSnapshot.upbase;
    lcdMmio.control = lcdSnapshot.control;
  }
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  mem[MENU_MODE_ADDR] = 0x40;
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

function formatBbox(bbox) {
  if (!bbox) {
    return '[none]';
  }

  return `[${bbox.minRow}-${bbox.maxRow},${bbox.minCol}-${bbox.maxCol}]`;
}

function collectHintStrings(hit) {
  const seen = new Set();
  const hints = [];

  for (const center of [hit.caller, hit.entry]) {
    for (const hint of findNearbyAsciiStrings(romBytes, center, 0x100, 4)) {
      const key = `${hint.addr}:${hint.text}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      hints.push(hint);
    }
  }

  hints.sort((a, b) => {
    const da = Math.abs(a.addr - hit.caller);
    const db = Math.abs(b.addr - hit.caller);
    if (da !== db) return da - db;
    return a.addr - b.addr;
  });

  return hints.slice(0, 5);
}

function summarizeHints(hints) {
  if (hints.length === 0) {
    return 'none';
  }

  return hints.map((hint) => `${hex(hint.addr)}:"${hint.text}"`).join(' | ');
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

  return {
    stride,
    text: lines.join('\n'),
  };
}

function writeAsciiDump(row) {
  if (!row.vram || !row.stats.bbox) {
    return null;
  }

  const ascii = buildAsciiFromVram(row.vram, row.stats.bbox, ASCII_STRIDE);
  if (!ascii) {
    return null;
  }

  const outPath = path.join(
    __dirname,
    `phase48-newcallers-${row.caller.toString(16).padStart(6, '0')}.txt`,
  );

  const lines = [
    `caller=${hex(row.caller)}`,
    `entry=${hex(row.entry)}`,
    `kind=${row.kind}`,
    `region=${row.region.label}`,
    `entryHeuristic=${row.entryHeuristic}`,
    `steps=${row.run.steps}`,
    `ms=${row.run.ms}`,
    `termination=${row.run.termination}`,
    `drawn=${row.stats.drawn} fg=${row.stats.fg} bg=${row.stats.bg} other=${row.stats.other}`,
    `bbox=${formatBbox(row.stats.bbox)}`,
    `hints=${summarizeHints(row.hints)}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii.text,
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

function runProbe(ex, target) {
  const startedAt = Date.now();

  const raw = ex.runFrom(target, 'adl', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
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
    termination: timedOut ? 'timeout' : raw.termination,
    timedOut,
  };
}

function compareRows(a, b) {
  if (Number(b.isLegible) !== Number(a.isLegible)) {
    return Number(b.isLegible) - Number(a.isLegible);
  }

  if (b.stats.drawn !== a.stats.drawn) {
    return b.stats.drawn - a.stats.drawn;
  }

  if (b.stats.fg !== a.stats.fg) {
    return b.stats.fg - a.stats.fg;
  }

  if (b.stats.bg !== a.stats.bg) {
    return b.stats.bg - a.stats.bg;
  }

  return a.caller - b.caller;
}

function formatProbeRow(row) {
  return [
    row.isLegible ? 'hit' : row.run.timedOut ? 'tmo' : '   ',
    hex(row.caller),
    `entry=${hex(row.entry)}`,
    `drawn=${String(row.stats.drawn).padStart(6, ' ')}`,
    `fg=${String(row.stats.fg).padStart(5, ' ')}`,
    `bg=${String(row.stats.bg).padStart(5, ' ')}`,
    `other=${String(row.stats.other).padStart(5, ' ')}`,
    `ms=${String(row.run.ms).padStart(5, ' ')}`,
    `term=${row.run.termination}`,
    `bbox=${formatBbox(row.stats.bbox)}`,
    `hints=${summarizeHints(row.hints)}`,
  ].join('  ');
}

async function main() {
  const allCallers = listPhase48Callers(romBytes);
  const probeTargets = allCallers.slice(0, MAX_PROBES);

  console.log(`=== Phase 48: probe uncovered ${hex(TARGET_ADDR)} callers ===`);
  console.log(`filtered_callers=${allCallers.length}  probe_cap=${MAX_PROBES}  probing=${probeTargets.length}`);
  console.log('');

  if (probeTargets.length === 0) {
    console.log('No uncovered callers found.');
    return;
  }

  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const ramSnapshot = mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END);
  const cpuSnapshot = snapshotCpu(cpu);
  const clearedVram = buildClearedVramSnapshot();
  const lcdSnapshot = ex.lcdMmio
    ? { upbase: ex.lcdMmio.upbase, control: ex.lcdMmio.control }
    : null;

  const rows = [];

  for (const hit of probeTargets) {
    restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, ex.lcdMmio, lcdSnapshot);
    prepareProbe(cpu, mem);

    const run = runProbe(ex, hit.entry);
    const stats = collectVramStats(mem);
    const hints = collectHintStrings(hit);
    const isLegible = !run.timedOut && stats.fg > 100 && stats.bg > 100;

    const row = {
      ...hit,
      run,
      stats,
      hints,
      isLegible,
      vram: isLegible ? mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE) : null,
    };

    rows.push(row);
    console.log(formatProbeRow(row));
  }

  const ranked = [...rows].sort(compareRows);
  const legible = ranked.filter((row) => row.isLegible);
  const topHits = legible.slice(0, TOP_HITS_TO_PRINT);
  const asciiRows = legible.slice(0, TOP_ASCII_DUMPS);

  console.log('');
  console.log(`new_callers_found=${allCallers.length}`);
  console.log(`legible_text_probes=${legible.length}`);
  console.log(`timeouts=${rows.filter((row) => row.run.timedOut).length}`);
  console.log('');
  console.log(`=== Top ${Math.min(TOP_HITS_TO_PRINT, topHits.length)} hits by drawn cells ===`);

  for (const row of topHits) {
    console.log(
      `${hex(row.caller)}  entry=${hex(row.entry)}  drawn=${row.stats.drawn}  fg=${row.stats.fg}  bg=${row.stats.bg}  other=${row.stats.other}  bbox=${formatBbox(row.stats.bbox)}  hints=${summarizeHints(row.hints)}`,
    );
  }

  if (topHits.length === 0) {
    console.log('No legible hits (fg > 100 and bg > 100).');
  }

  console.log('');
  console.log(`=== Writing top ${Math.min(TOP_ASCII_DUMPS, asciiRows.length)} ASCII dumps ===`);

  for (const row of asciiRows) {
    const outPath = writeAsciiDump(row);
    console.log(`${hex(row.caller)}  ascii=${outPath ? path.basename(outPath) : 'n/a'}`);
  }
}

await main();
