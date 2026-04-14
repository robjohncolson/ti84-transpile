#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const asciiOutputPath = path.join(__dirname, 'phase65b-013d11-ascii.txt');

if (!fs.existsSync(romPath)) {
  throw new Error(`Missing ${romPath}`);
}

const romBytes = fs.readFileSync(romPath);

const TARGET_ENTRY = 0x013d11;
const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const SCREEN_STACK_TOP = 0xd1a87e;
const PROBE_IY = 0xd00080;

const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;

const MAX_ASCII_WIDTH = 200;
const ASCII_PREVIEW_ROWS = 20;
const ASCII_ELLIPSIS = '...';

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

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }

  return bytes;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let vramWrites = 0;
  let fgWrites = 0;
  let bgWrites = 0;
  let otherWrites = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      vramWrites += 1;
      if (pixel === 0x0000) {
        fgWrites += 1;
      } else if (pixel === 0xffff) {
        bgWrites += 1;
      } else {
        otherWrites += 1;
      }

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    vramWrites,
    fgWrites,
    bgWrites,
    otherWrites,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function pixelToAscii(pixel) {
  if (pixel === 0x0000) {
    return '#';
  }

  if (pixel === 0xffff) {
    return '.';
  }

  if (pixel === VRAM_SENTINEL) {
    return '?';
  }

  return 'o';
}

function buildAsciiArt(mem, bbox) {
  if (!bbox) {
    return {
      text: '',
      lines: [],
      previewLines: [],
      fullWidth: 0,
      visibleWidth: 0,
      truncated: false,
    };
  }

  const fullWidth = bbox.maxCol - bbox.minCol + 1;
  const truncated = fullWidth > MAX_ASCII_WIDTH;
  const visibleWidth = truncated
    ? MAX_ASCII_WIDTH - ASCII_ELLIPSIS.length
    : fullWidth;
  const lines = [];

  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
    let line = '';

    for (let offset = 0; offset < visibleWidth; offset += 1) {
      const col = bbox.minCol + offset;
      line += pixelToAscii(readPixel(mem, row, col));
    }

    if (truncated) {
      line += ASCII_ELLIPSIS;
    }

    lines.push(line);
  }

  return {
    text: lines.join('\n'),
    lines,
    previewLines: lines.slice(0, ASCII_PREVIEW_ROWS),
    fullWidth,
    visibleWidth: truncated ? MAX_ASCII_WIDTH : visibleWidth,
    truncated,
  };
}

async function buildProbeEnv() {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  const osInitResult = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  const setTextFgResult = executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
    bootResult,
    osInitResult,
    setTextFgResult,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? {
          upbase: executor.lcdMmio.upbase,
          control: executor.lcdMmio.control,
        }
      : null,
  };
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (env.executor.lcdMmio && env.lcdSnapshot) {
    env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = env.lcdSnapshot.control;
  }
}

function runProbe(env) {
  restoreBaseState(env);

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.mbase = 0xd0;
  env.cpu._iy = PROBE_IY;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  const raw = env.executor.runFrom(TARGET_ENTRY, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });
  const stats = collectVramStats(env.mem);
  const ascii = buildAsciiArt(env.mem, stats.bbox);
  const totalSteps =
    env.bootResult.steps +
    env.osInitResult.steps +
    env.setTextFgResult.steps +
    raw.steps;

  return {
    raw,
    totalSteps,
    ...stats,
    ascii,
  };
}

function writeAsciiOutput(ascii) {
  const body = ascii.text.length > 0 ? `${ascii.text}\n` : '';
  fs.writeFileSync(asciiOutputPath, body);
}

function printSummary(result) {
  const bbox = result.bbox;
  const bboxWidth = bbox ? bbox.maxCol - bbox.minCol + 1 : 0;
  const bboxHeight = bbox ? bbox.maxRow - bbox.minRow + 1 : 0;

  console.log('=== Phase 65B: 0x013d11 ASCII decode probe ===');
  console.log(`entry=${hex(TARGET_ENTRY)} totalSteps=${result.totalSteps} probeSteps=${result.raw.steps}`);
  console.log(
    `termination=${result.raw.termination} lastPc=${hex(result.raw.lastPc)} lastMode=${result.raw.lastMode}`,
  );
  console.log(
    `vramWrites=${result.vramWrites} fg=${result.fgWrites} bg=${result.bgWrites} other=${result.otherWrites}`,
  );
  console.log(
    `bbox=${formatBbox(bbox)} width=${bboxWidth} height=${bboxHeight} asciiWidth=${result.ascii.visibleWidth} truncated=${result.ascii.truncated}`,
  );
  console.log(`asciiFile=${path.basename(asciiOutputPath)}`);
  console.log('');
  console.log(`=== ASCII preview (first ${ASCII_PREVIEW_ROWS} rows) ===`);

  if (result.ascii.previewLines.length === 0) {
    console.log('(no rendered pixels)');
    return;
  }

  for (const line of result.ascii.previewLines) {
    console.log(line);
  }
}

async function main() {
  const env = await buildProbeEnv();
  const result = runProbe(env);

  writeAsciiOutput(result.ascii);
  printSummary(result);
}

await main();
