#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const SCAN_ROWS = 15;
const SCAN_BYTE_SIZE = SCAN_ROWS * VRAM_WIDTH * 2;
const SENTINEL_BYTE = 0xaa;
const SENTINEL_PIXEL = 0xaaaa;
const WHITE_PIXEL = 0xffff;

const GOLDEN_ROW_START = 6;
const GOLDEN_ROW_END = 13;
const GOLDEN_COL_START = 290;
const GOLDEN_COL_END = 305;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const STAGE_2_ENTRY = 0x0a3301;
const STAGE_2_MODE = 'adl';

const FIXED_IX = 0xd1a860;
const FIXED_IY = 0xd00080;
const FIXED_SP = 0xd1a872;
const FIXED_MBASE = 0xd0;

function hex(value, width = 4) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

async function loadBlocks() {
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const rawBlocks = romModule.PRELIFTED_BLOCKS;

  return Array.isArray(rawBlocks)
    ? Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]))
    : rawBlocks;
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = FIXED_MBASE;
  cpu._iy = FIXED_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function fillScanRowsWithSentinel(mem) {
  mem.fill(SENTINEL_BYTE, VRAM_BASE, VRAM_BASE + SCAN_BYTE_SIZE);
}

function prepareStage2Cpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = FIXED_IX;
  cpu._iy = FIXED_IY;
  cpu.sp = FIXED_SP;
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;

  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  mem[0xd0009b] &= 0xbf;
}

function readPixel(mem, row, col) {
  const addr = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[addr] | (mem[addr + 1] << 8);
}

function scanPixelMap(mem) {
  const pixels = [];
  let fgCount = 0;
  let bgCount = 0;
  let rowMin = SCAN_ROWS;
  let rowMax = -1;
  let colMin = VRAM_WIDTH;
  let colMax = -1;
  let inGoldenRegion = 0;

  for (let row = 0; row < SCAN_ROWS; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const value = readPixel(mem, row, col);

      if (value === SENTINEL_PIXEL) {
        continue;
      }

      const type = value === WHITE_PIXEL ? 'bg' : 'fg';
      pixels.push({ row, col, value, type });

      if (type === 'fg') {
        fgCount += 1;
      } else {
        bgCount += 1;
      }

      if (row < rowMin) {
        rowMin = row;
      }

      if (row > rowMax) {
        rowMax = row;
      }

      if (col < colMin) {
        colMin = col;
      }

      if (col > colMax) {
        colMax = col;
      }

      if (
        row >= GOLDEN_ROW_START &&
        row <= GOLDEN_ROW_END &&
        col >= GOLDEN_COL_START &&
        col <= GOLDEN_COL_END
      ) {
        inGoldenRegion += 1;
      }
    }
  }

  return {
    pixels,
    total: pixels.length,
    fgCount,
    bgCount,
    rowMin: pixels.length > 0 ? rowMin : null,
    rowMax: pixels.length > 0 ? rowMax : null,
    colMin: pixels.length > 0 ? colMin : null,
    colMax: pixels.length > 0 ? colMax : null,
    inGoldenRegion,
    outsideGoldenRegion: pixels.length - inGoldenRegion,
  };
}

function formatBoundingBox(scan) {
  if (scan.total === 0) {
    return 'none';
  }

  return `rows ${scan.rowMin}-${scan.rowMax}, cols ${scan.colMin}-${scan.colMax}`;
}

function buildRecommendation(scan) {
  if (scan.total === 0) {
    return 'no non-sentinel pixels were observed in rows 0-14.';
  }

  if (scan.outsideGoldenRegion > 0) {
    return `update the golden regression scan to rows ${scan.rowMin}-${scan.rowMax}, cols ${scan.colMin}-${scan.colMax}.`;
  }

  return 'the existing golden regression region already covers all observed pixels.';
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  fillScanRowsWithSentinel(mem);
  prepareStage2Cpu(cpu, mem);

  const stage2Result = executor.runFrom(STAGE_2_ENTRY, STAGE_2_MODE, {
    maxSteps: 500,
    maxLoopIterations: 500,
  });

  const scan = scanPixelMap(mem);

  console.log('=== Phase 189c - Status Dots Pixel Location Map ===');
  console.log(`Stage 2 result: steps=${stage2Result.steps} termination=${stage2Result.termination}`);
  console.log(`Total non-sentinel pixels: ${scan.total}`);
  console.log(`  FG (non-white): ${scan.fgCount}`);
  console.log(`  BG (white 0xFFFF): ${scan.bgCount}`);
  console.log('');
  console.log('Pixel map (non-sentinel only):');

  if (scan.total === 0) {
    console.log('  (none)');
  } else {
    for (const pixel of scan.pixels) {
      console.log(`  row=${pixel.row} col=${pixel.col} value=${hex(pixel.value)}  (type: ${pixel.type})`);
    }
  }

  console.log('');
  console.log(`Bounding box: ${formatBoundingBox(scan)}`);
  console.log('');
  console.log('Golden regression region check (rows 6-13, cols 290-305):');
  console.log(`  Pixels in region: ${scan.inGoldenRegion}`);
  console.log(`  Pixels OUTSIDE region: ${scan.outsideGoldenRegion}`);
  console.log('');
  console.log(`Recommendation: ${buildRecommendation(scan)}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
