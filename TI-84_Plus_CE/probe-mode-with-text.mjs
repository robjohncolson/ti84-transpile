#!/usr/bin/env node
// Phase 41.1: verify the Phase 40 text-color fix end-to-end on the MODE
// screen. This is a focused variant of probe-mode-screen.mjs:
//   boot -> OS init (0x08C331) -> set text fg/bg RAM vars -> call 0x0296dd
//
// Output:
//   - total non-zero VRAM cells and bounding box
//   - full 16-bit BGR565 histogram
//   - ASCII art for rows 37-114, cols 0-241, column stride 4
//   - comparison note vs the old solid-bar output

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const romBytes = fs.readFileSync(romPath);

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const MODE_ENTRY = 0x0296DD;

const TEXT_FG_ADDR = 0xD02688;
const TEXT_BG_ADDR = 0xD0268A;
const FG_COLOR = 0x0000;
const BG_COLOR = 0xFFFF;

const ASCII_ROW_START = 37;
const ASCII_ROW_END = 114;
const ASCII_COL_START = 0;
const ASCII_COL_END = 241;
const ASCII_COL_STRIDE = 4;

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const hex16 = (value) => `0x${(value & 0xFFFF).toString(16).padStart(4, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    console.log('ROM.transpiled.js missing. Generating it with node scripts/transpile-ti84-rom.mjs ...');
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')],
      { cwd: repoRoot, stdio: 'inherit' },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  const moduleUrl = pathToFileURL(transpiledPath).href;
  const mod = await import(moduleUrl);
  return mod.PRELIFTED_BLOCKS;
}

function freshEnv(preliftedBlocks) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(preliftedBlocks, mem, { peripherals });
  return { ex, cpu: ex.cpu, mem };
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function bootAndInit(env) {
  const { ex, cpu, mem } = env;

  const bootResult = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  fillSentinel(mem, cpu.sp, 3);

  const initResult = ex.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  return { bootResult, initResult };
}

const VRAM_SENTINEL = 0xAAAA;

function clearVram(mem) {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off] = VRAM_SENTINEL & 0xFF;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }
}

function prepareModeRender(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12;
  fillSentinel(mem, cpu.sp, 12);
}

function applyTextColorFix(mem) {
  mem[TEXT_FG_ADDR] = 0x00;
  mem[TEXT_FG_ADDR + 1] = 0x00;
  mem[TEXT_BG_ADDR] = 0xFF;
  mem[TEXT_BG_ADDR + 1] = 0xFF;
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let drawnCells = 0;
  let textCells = 0;
  let bgCells = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;
  const histogram = new Map();

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      histogram.set(pixel, (histogram.get(pixel) || 0) + 1);
      if (pixel === VRAM_SENTINEL) continue;

      drawnCells++;
      if (pixel === FG_COLOR) textCells++;
      if (pixel === BG_COLOR) bgCells++;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawnCells,
    textCells,
    bgCells,
    bbox: maxRow >= 0
      ? { minRow, maxRow, minCol, maxCol }
      : null,
    histogram,
  };
}

function formatHistogram(histogram) {
  return [...histogram.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] - b[0];
    })
    .map(([pixel, count]) => `${hex16(pixel)}: ${count}`)
    .join('\n');
}

function renderAsciiSlice(mem) {
  const lines = [];

  for (let row = ASCII_ROW_START; row <= ASCII_ROW_END; row++) {
    let line = `${row.toString().padStart(3, '0')} `;
    for (let col = ASCII_COL_START; col <= ASCII_COL_END; col += ASCII_COL_STRIDE) {
      const pixel = readPixel(mem, row, col);
      let ch;
      if (pixel === VRAM_SENTINEL) ch = ' ';
      else if (pixel === BG_COLOR) ch = '.';
      else if (pixel === FG_COLOR) ch = '#';
      else ch = '?';
      line += ch;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

async function main() {
  const PRELIFTED_BLOCKS = await loadBlocks();
  const env = freshEnv(PRELIFTED_BLOCKS);
  const { ex, cpu, mem } = env;

  console.log('=== MODE Probe With Text Fix ===');
  console.log(`boot entry: ${hex(BOOT_ENTRY)} z80`);
  console.log(`os init:    ${hex(OS_INIT_ENTRY)} adl`);
  console.log(`mode entry: ${hex(MODE_ENTRY)} adl`);
  console.log(`text fg/bg: ${hex(TEXT_FG_ADDR)}=${hex16(FG_COLOR)}, ${hex(TEXT_BG_ADDR)}=${hex16(BG_COLOR)}`);

  const { bootResult, initResult } = bootAndInit(env);
  console.log(`boot:    ${bootResult.steps} steps -> ${bootResult.termination} at ${hex(bootResult.lastPc)}`);
  console.log(`os init: ${initResult.steps} steps -> ${initResult.termination} at ${hex(initResult.lastPc)} mbase=${hex(cpu.mbase, 2)}`);

  clearVram(mem);
  prepareModeRender(cpu, mem);
  applyTextColorFix(mem);

  const renderResult = ex.runFrom(MODE_ENTRY, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 2000,
  });

  const stats = collectVramStats(mem);

  console.log(`render:  ${renderResult.steps} steps -> ${renderResult.termination} at ${hex(renderResult.lastPc)}`);
  console.log('');
  console.log('VRAM summary:');
  console.log(`  drawn cells (non-sentinel): ${stats.drawnCells}`);
  console.log(`  text glyph cells (fg=0x0000): ${stats.textCells}`);
  console.log(`  bar bg cells (bg=0xffff):     ${stats.bgCells}`);
  if (stats.bbox) {
    console.log(`  bbox: rows ${stats.bbox.minRow}-${stats.bbox.maxRow}, cols ${stats.bbox.minCol}-${stats.bbox.maxCol}`);
  } else {
    console.log('  bbox: none');
  }

  console.log('');
  console.log('Pixel histogram (BGR565):');
  console.log(formatHistogram(stats.histogram));

  console.log('');
  console.log(`ASCII art rows ${ASCII_ROW_START}-${ASCII_ROW_END}, cols ${ASCII_COL_START}-${ASCII_COL_END}, stride ${ASCII_COL_STRIDE}:`);
  console.log('Legend: " " = sentinel 0xAAAA (untouched), "." = bg fill 0xffff, "#" = text glyph 0x0000, "?" = other');
  console.log(renderAsciiSlice(mem));

  console.log('');
  console.log('Comparison vs probe-mode-screen.mjs:');
  console.log('  The older probe left the text fg/bg vars at 0xffff/0xffff, so text rasterization collapsed into solid bars.');
  console.log('  This probe sets fg=0x0000 and bg=0xffff before 0x0296dd, so visible glyph structure should appear inside those bars.');
}

await main();
