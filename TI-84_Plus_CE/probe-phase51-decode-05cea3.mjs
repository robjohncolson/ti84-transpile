#!/usr/bin/env node
// Phase 51.2: decode 0x05cea3 at stride 1 with the explicit-init screen template.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const outPath = path.join(__dirname, 'phase51-decode-05cea3-stride1.txt');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const TARGET_ENTRY = 0x05CEA3;

const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xD00080;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;
const PROBE_MAX_STEPS = 200000;
const PROBE_MAX_LOOPS = 5000;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const ASCII_ROW_START = 36;
const ASCII_ROW_END = 95;
const ASCII_COL_START = 0;
const ASCII_COL_END = 130;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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

function clearVram(mem) {
  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    mem[VRAM_BASE + offset] = VRAM_SENTINEL & 0xFF;
    mem[VRAM_BASE + offset + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
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
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function asciiSlice(mem, rowStart, rowEnd, colStart, colEnd) {
  const lines = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '?';
    }

    line += '|';
    lines.push(line);
  }

  return lines.join('\n');
}

function callExplicitOsInit(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOPS,
  });
}

function callSetTextFgColor(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.hl = TEXT_FG_COLOR;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);
}

async function main() {
  const romBytes = fs.readFileSync(romPath);
  const blocks = await loadBlocks();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  callExplicitOsInit(executor, cpu, mem);
  clearVram(mem);
  callSetTextFgColor(executor, cpu, mem);
  prepareProbe(cpu, mem);

  const result = executor.runFrom(TARGET_ENTRY, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
    maxLoopIterations: PROBE_MAX_LOOPS,
  });

  const stats = collectVramStats(mem);
  const ascii = asciiSlice(mem, ASCII_ROW_START, ASCII_ROW_END, ASCII_COL_START, ASCII_COL_END);

  const output = [
    `entry=${hex(TARGET_ENTRY)}`,
    `steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`,
    `drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} other=${stats.other} bbox=r${stats.bbox.minRow}-${stats.bbox.maxRow} c${stats.bbox.minCol}-${stats.bbox.maxCol}`,
    `rows ${ASCII_ROW_START}-${ASCII_ROW_END} cols ${ASCII_COL_START}-${ASCII_COL_END} stride 1`,
    'legend: " " = sentinel, "." = bg, "#" = fg',
    '',
    ascii,
  ].join('\n');

  fs.writeFileSync(outPath, output);
  console.log(output);
}

await main();
