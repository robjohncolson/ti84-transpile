#!/usr/bin/env node
// Phase 46.1: batch probe all 0x02xxxx text-loop callers discovered from the
// 0x0a1cac scan. Boot + OS init once, then restore the post-init snapshot for
// each caller and score the resulting VRAM output.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  TARGET_ADDR,
  findTextLoopRegionCallers,
  loadRom,
} from './scan-0a1cac-045xxx.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const REGION_NAME = '024xxx';
const REGION_START = 0x020000;
const REGION_END = 0x02FFFF;
const OUTPUT_PREFIX = 'phase46-024xxx';

const romBytes = loadRom(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;

const TEXT_FG_ADDR = 0xD02688;
const TEXT_BG_ADDR = 0xD0268A;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;

const CALL_MAX_STEPS = 400000;
const CALL_MAX_LOOP_ITERATIONS = 5000;

const HIT_MIN_DRAWN = 500;
const HIT_MIN_FG = 100;
const ASCII_STRIDE = 2;

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const hex16 = (value) => `0x${(value & 0xFFFF).toString(16).padStart(4, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')],
      { cwd: repoRoot, stdio: 'inherit' },
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let off = 0; off < VRAM_SIZE; off += 2) {
    bytes[off] = VRAM_SENTINEL & 0xFF;
    bytes[off + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function read16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
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

function callSetTextFgColor(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const helperResult = ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  const fg = read16(mem, TEXT_FG_ADDR);
  const bg = read16(mem, TEXT_BG_ADDR);

  if (fg !== TEXT_FG_COLOR || bg !== TEXT_BG_COLOR) {
    throw new Error(
      `SetTextFgColor mismatch: fg=${hex16(fg)} bg=${hex16(bg)} expected fg=${hex16(TEXT_FG_COLOR)} bg=${hex16(TEXT_BG_COLOR)}`,
    );
  }

  return helperResult;
}

function prepareCallerRun(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._iy = 0xD00080;
  cpu.sp = SCREEN_STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
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
  const histogram = new Map();

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      histogram.set(pixel, (histogram.get(pixel) || 0) + 1);

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
    histogram,
    bbox: maxRow >= 0
      ? { minRow, maxRow, minCol, maxCol }
      : null,
  };
}

function formatBbox(bbox) {
  if (!bbox) {
    return '[none]';
  }

  return `[${bbox.minRow}-${bbox.maxRow},${bbox.minCol}-${bbox.maxCol}]`;
}

function formatHistogramLines(histogram) {
  return [...histogram.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] - b[0];
    })
    .map(([pixel, count]) => `${hex16(pixel)}: ${count}`);
}

function buildAsciiFullBbox(mem, bbox) {
  if (!bbox) {
    return null;
  }

  const rowStart = bbox.minRow;
  const rowEnd = bbox.maxRow;
  const colStart = bbox.minCol;
  const colEnd = bbox.maxCol;
  const lines = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    let line = `${row.toString().padStart(3, '0')} `;

    for (let col = colStart; col <= colEnd; col += ASCII_STRIDE) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '+';
    }

    lines.push(line);
  }

  return {
    rowStart,
    rowEnd,
    colStart,
    colEnd,
    stride: ASCII_STRIDE,
    text: lines.join('\n'),
  };
}

function writeHitAsciiFile(addr, result, stats, excerpt) {
  const outPath = path.join(
    __dirname,
    `${OUTPUT_PREFIX}-${addr.toString(16).padStart(6, '0')}.txt`,
  );

  const lines = [
    `addr=${hex(addr)}`,
    `steps=${result.steps}`,
    `term=${result.termination}`,
    `drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} other=${stats.other}`,
    `bbox=${formatBbox(stats.bbox)}`,
    `rows=${excerpt.rowStart}-${excerpt.rowEnd} cols=${excerpt.colStart}-${excerpt.colEnd} stride=${excerpt.stride}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    excerpt.text,
    '',
    'histogram:',
    ...formatHistogramLines(stats.histogram),
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

function shouldSkipMidFunctionCaller(caller, result) {
  return caller.addr % 4 !== 0 && result.termination === 'missing_block' && result.steps <= 5;
}

function formatSummaryRow(row) {
  const addr = hex(row.addr).padEnd(10, ' ');
  const drawn = String(row.stats.drawn).padStart(7, ' ');
  const fg = String(row.stats.fg).padStart(6, ' ');
  const bg = String(row.stats.bg).padStart(6, ' ');
  const other = String(row.stats.other).padStart(7, ' ');
  const steps = String(row.result.steps).padStart(7, ' ');
  const term = row.result.termination.padEnd(12, ' ');
  const bbox = formatBbox(row.stats.bbox);
  const tag = row.isHit ? 'hit' : row.skipped ? 'skp' : '   ';
  return `${tag}  ${addr}  ${drawn}  ${fg}  ${bg}  ${other}  ${steps}  ${term}  ${bbox}`;
}

async function main() {
  const callers = findTextLoopRegionCallers(romBytes, {
    target: TARGET_ADDR,
    regionStart: REGION_START,
    regionEnd: REGION_END,
  });

  if (callers.length === 0) {
    console.log(`No callers found for ${hex(TARGET_ADDR)} in ${hex(REGION_START)}-${hex(REGION_END)}`);
    return;
  }

  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  console.log(`=== Phase 46.1 - batch probe ${REGION_NAME} text-loop callers ===`);
  console.log(`target=${hex(TARGET_ADDR)} region=${hex(REGION_START)}-${hex(REGION_END)} callers=${callers.length}`);
  console.log('');

  const bootResult = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const initResult = ex.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  console.log(`boot:    ${bootResult.steps} steps -> ${bootResult.termination} at ${hex(bootResult.lastPc)}`);
  console.log(`os init: ${initResult.steps} steps -> ${initResult.termination} at ${hex(initResult.lastPc)}`);
  console.log('');

  const ramSnapshot = mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END);
  const cpuSnapshot = snapshotCpu(cpu);
  const clearedVram = buildClearedVramSnapshot();
  const lcdSnapshot = ex.lcdMmio
    ? { upbase: ex.lcdMmio.upbase, control: ex.lcdMmio.control }
    : null;

  const rows = [];

  for (const caller of callers) {
    try {
      restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, ex.lcdMmio, lcdSnapshot);
      callSetTextFgColor(ex, cpu, mem);
      prepareCallerRun(cpu, mem);

      const result = ex.runFrom(caller.addr, 'adl', {
        maxSteps: CALL_MAX_STEPS,
        maxLoopIterations: CALL_MAX_LOOP_ITERATIONS,
      });

      if (shouldSkipMidFunctionCaller(caller, result)) {
        console.log(
          `addr=${hex(caller.addr)}  steps=${result.steps}  drawn=0  fg=0  bg=0  bbox=[skip]  term=skip-midfunc`,
        );

        rows.push({
          addr: caller.addr,
          kind: caller.kind,
          result: {
            steps: result.steps,
            termination: 'skip-midfunc',
            lastPc: result.lastPc,
          },
          stats: {
            drawn: 0,
            fg: 0,
            bg: 0,
            other: 0,
            bbox: null,
          },
          isHit: false,
          skipped: true,
          asciiPath: null,
        });
        continue;
      }

      const stats = collectVramStats(mem);
      const isHit = stats.drawn > HIT_MIN_DRAWN && stats.fg > HIT_MIN_FG;

      const row = {
        addr: caller.addr,
        kind: caller.kind,
        result,
        stats,
        isHit,
        skipped: false,
        asciiPath: null,
      };

      console.log(
        `addr=${hex(caller.addr)}  steps=${result.steps}  drawn=${stats.drawn}  fg=${stats.fg}  bg=${stats.bg}  bbox=${formatBbox(stats.bbox)}  term=${result.termination}`,
      );

      if (isHit) {
        const excerpt = buildAsciiFullBbox(mem, stats.bbox);

        if (excerpt) {
          row.asciiPath = writeHitAsciiFile(caller.addr, result, stats, excerpt);
        }

        console.log(`  histogram for ${hex(caller.addr)}:`);
        for (const line of formatHistogramLines(stats.histogram)) {
          console.log(`    ${line}`);
        }

        if (row.asciiPath) {
          console.log(`  ascii=${path.relative(__dirname, row.asciiPath)}`);
        }
      }

      rows.push(row);
    } catch (error) {
      console.log(
        `addr=${hex(caller.addr)}  steps=0  drawn=0  fg=0  bg=0  bbox=[error]  term=error`,
      );
      console.log(`  error=${error instanceof Error ? error.message : String(error)}`);

      rows.push({
        addr: caller.addr,
        kind: caller.kind,
        result: {
          steps: 0,
          termination: 'error',
          lastPc: caller.addr,
        },
        stats: {
          drawn: 0,
          fg: 0,
          bg: 0,
          other: 0,
          bbox: null,
        },
        isHit: false,
        skipped: false,
        asciiPath: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('');
  console.log('=== Summary (sorted by drawn desc) ===');
  console.log('tag  addr         drawn      fg      bg    other    steps  term          bbox');

  const sorted = [...rows].sort((a, b) => {
    if (b.stats.drawn !== a.stats.drawn) return b.stats.drawn - a.stats.drawn;
    return a.addr - b.addr;
  });

  for (const row of sorted) {
    console.log(formatSummaryRow(row));
  }

  const hits = sorted.filter((row) => row.isHit);
  const skipped = sorted.filter((row) => row.skipped);
  console.log('');
  console.log(`hits (drawn>${HIT_MIN_DRAWN}, fg>${HIT_MIN_FG}): ${hits.length}`);
  console.log(`skipped mid-function entries: ${skipped.length}`);

  for (const hit of hits) {
    console.log(
      `  ${hex(hit.addr)}  drawn=${hit.stats.drawn}  fg=${hit.stats.fg}  ascii=${hit.asciiPath ? path.relative(__dirname, hit.asciiPath) : 'n/a'}`,
    );
  }
}

await main();
