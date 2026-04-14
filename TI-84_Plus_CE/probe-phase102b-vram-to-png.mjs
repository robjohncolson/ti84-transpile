#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'module';

import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const require = createRequire(import.meta.url);

let PNG = null;
try {
  ({ PNG } = require('pngjs'));
} catch {
  PNG = null;
}

const { PRELIFTED_BLOCKS, TRANSPILATION_META, decodeEmbeddedRom } = await import('./ROM.transpiled.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LCD_VRAM_BASE = 0xD40000;
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const LCD_BYTES_PER_PIXEL = 2;
const LCD_VRAM_BYTES = LCD_WIDTH * LCD_HEIGHT * LCD_BYTES_PER_PIXEL;
const LCD_PIXEL_COUNT = LCD_WIDTH * LCD_HEIGHT;

const HOME_SCREEN_MODE_BUF = 0xD020A6;
const HOME_SCREEN_MODE_TEXT = 'Normal Float Radian       ';

const SCREEN_STACK_TOP = 0xD1A87E;
const SCREEN_RENDER_STACK_BYTES = 0x400;
const SHORT_RETURN_FRAME_BYTES = 3;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const STACK_SENTINEL_BYTE = 0xFE;
const VRAM_SENTINEL_BYTE = 0xAA;
const VRAM_SENTINEL_WORD = 0xAAAA;

const OUTPUT_PATH = path.join(__dirname, 'home-screen-render.png');

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

if (HOME_SCREEN_MODE_TEXT.length !== 26) {
  throw new Error(`Expected 26-byte mode text, got ${HOME_SCREEN_MODE_TEXT.length}.`);
}

function fillSentinel(mem, start, bytes, value = STACK_SENTINEL_BYTE) {
  mem.fill(value, start, start + bytes);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, mem, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - SCREEN_RENDER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, SCREEN_RENDER_STACK_BYTES);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < 26; index += 1) {
    mem[HOME_SCREEN_MODE_BUF + index] = HOME_SCREEN_MODE_TEXT.charCodeAt(index);
  }
}

function fillEntryLineWhite(mem) {
  for (let row = 220; row <= 239; row += 1) {
    for (let col = 0; col < LCD_WIDTH; col += 1) {
      const offset = LCD_VRAM_BASE + (row * LCD_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function runHomeScreenPipeline() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const stages = {};

  stages.coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - SHORT_RETURN_FRAME_BYTES;
  fillSentinel(mem, cpu.sp, SHORT_RETURN_FRAME_BYTES);
  stages.osInit = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - SHORT_RETURN_FRAME_BYTES;
  fillSentinel(mem, cpu.sp, SHORT_RETURN_FRAME_BYTES);
  stages.postInit = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.fill(VRAM_SENTINEL_BYTE, LCD_VRAM_BASE, LCD_VRAM_BASE + LCD_VRAM_BYTES);

  restoreCpu(cpu, mem, cpuSnapshot);
  stages.statusBarBackground = executor.runFrom(0x0A2B72, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });

  restoreCpu(cpu, mem, cpuSnapshot);
  stages.statusDots = executor.runFrom(0x0A3301, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });

  seedModeBuffer(mem);

  restoreCpu(cpu, mem, cpuSnapshot);
  stages.homeRow = executor.runFrom(0x0A29EC, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  restoreCpu(cpu, mem, cpuSnapshot);
  stages.historyArea = executor.runFrom(0x0A2854, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  fillEntryLineWhite(mem);

  return { mem, stages };
}

function vramWordToRgba(raw, rgba, rgbaOffset) {
  const red = Math.round((((raw >> 11) & 0x1F) * 255) / 31);
  const green = Math.round((((raw >> 5) & 0x3F) * 255) / 63);
  const blue = Math.round(((raw & 0x1F) * 255) / 31);

  rgba[rgbaOffset] = red;
  rgba[rgbaOffset + 1] = green;
  rgba[rgbaOffset + 2] = blue;
  rgba[rgbaOffset + 3] = 255;
}

function convertVramToRgba(mem) {
  const rgba = new Uint8Array(LCD_PIXEL_COUNT * 4);
  let nonSentinelPixelCount = 0;

  for (let pixelIndex = 0; pixelIndex < LCD_PIXEL_COUNT; pixelIndex += 1) {
    const vramOffset = LCD_VRAM_BASE + pixelIndex * 2;
    const raw = mem[vramOffset] | (mem[vramOffset + 1] << 8);

    if (raw !== VRAM_SENTINEL_WORD) {
      nonSentinelPixelCount += 1;
    }

    vramWordToRgba(raw, rgba, pixelIndex * 4);
  }

  return { rgba, nonSentinelPixelCount };
}

function buildCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }

    table[index] = crc >>> 0;
  }

  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;

  for (const value of buffer) {
    crc = CRC_TABLE[(crc ^ value) & 0xFF] ^ (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodeMinimalPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let row = 0; row < height; row += 1) {
    const rawRowOffset = row * (stride + 1);
    const rgbaRowOffset = row * stride;

    raw[rawRowOffset] = 0;
    raw.set(rgba.subarray(rgbaRowOffset, rgbaRowOffset + stride), rawRowOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const imageData = deflateSync(raw);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', header),
    makeChunk('IDAT', imageData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodePng(width, height, rgba) {
  if (PNG) {
    const png = new PNG({ width, height });
    png.data = Buffer.from(rgba);
    return PNG.sync.write(png);
  }

  return encodeMinimalPng(width, height, rgba);
}

const { mem, stages } = runHomeScreenPipeline();
const { rgba, nonSentinelPixelCount } = convertVramToRgba(mem);
const pngBuffer = encodePng(LCD_WIDTH, LCD_HEIGHT, rgba);

writeFileSync(OUTPUT_PATH, pngBuffer);

const stageSummary = [
  ['coldBoot', stages.coldBoot],
  ['osInit', stages.osInit],
  ['postInit', stages.postInit],
  ['statusBarBackground', stages.statusBarBackground],
  ['statusDots', stages.statusDots],
  ['homeRow', stages.homeRow],
  ['historyArea', stages.historyArea],
]
  .map(([label, result]) => `${label}=${result.steps}`)
  .join(' ');

console.log(
  `Loaded ROM (${TRANSPILATION_META.blockCount} blocks, ${TRANSPILATION_META.coveragePercent}% coverage).`,
);
console.log(`PNG encoder: ${PNG ? 'pngjs' : 'built-in fallback'}`);
console.log(`Stage steps: ${stageSummary}`);
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Dimensions: ${LCD_WIDTH}x${LCD_HEIGHT}`);
console.log(`Non-sentinel pixels: ${nonSentinelPixelCount}/${LCD_PIXEL_COUNT}`);
console.log(`File size: ${statSync(OUTPUT_PATH).size} bytes`);
