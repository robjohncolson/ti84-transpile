#!/usr/bin/env node
// Phase 57: render every pointer-table-backed TI-84 error banner via 0x062160.
//
// Calling convention:
// - mem[0xD008DF] = selector value
// - selector values 1..N map to pointer-table entries 0..N-1 at 0x062290
// - selector 0 switches to a separate mode/status path keyed by 0xD00824

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const BANNER_ENTRY = 0x062160;

const POINTER_TABLE = 0x062290;
const POINTER_RANGE_START = 0x062000;
const POINTER_RANGE_END = 0x063000;

const ERROR_SELECTOR = 0xd008df;
const MODE_SELECTOR = 0xd00824;

const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;
const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xffff;

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
  let fgPixels = 0;
  let bgPixels = 0;
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

      if (pixel === TEXT_FG_COLOR) fgPixels += 1;
      if (pixel === TEXT_BG_COLOR) bgPixels += 1;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
    fgPixels,
    bgPixels,
  };
}

function read24(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
}

function readCString(addr) {
  let end = addr;

  while (end < romBytes.length && romBytes[end] !== 0x00) {
    end += 1;
  }

  return Buffer.from(romBytes.slice(addr, end)).toString('ascii');
}

function decodeErrorPointerTable() {
  const entries = [];

  for (let index = 0; index < 80; index += 1) {
    const ptrAddr = POINTER_TABLE + index * 3;
    const stringAddr = read24(ptrAddr);

    if (stringAddr < POINTER_RANGE_START || stringAddr >= POINTER_RANGE_END) {
      break;
    }

    entries.push({
      index,
      stringAddr,
      stringText: readCString(stringAddr),
    });
  }

  return entries;
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (!env.executor.lcdMmio || !env.lcdSnapshot) {
    return;
  }

  env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
  env.executor.lcdMmio.control = env.lcdSnapshot.control;
}

function prepareHelperCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
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

function buildProbeEnv() {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  prepareHelperCall(cpu, mem);
  executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  prepareHelperCall(cpu, mem);
  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
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

function runBanner(env, entry) {
  restoreBaseState(env);
  prepareProbe(env.cpu, env.mem);

  env.mem[ERROR_SELECTOR] = (entry.index + 1) & 0xff;
  env.mem[MODE_SELECTOR] = 0x00;

  let raw;

  try {
    raw = env.executor.runFrom(BANNER_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 5000,
    });
  } catch (error) {
    raw = {
      termination: 'error',
      lastPc: env.cpu.pc,
      steps: 0,
      error,
    };
  }

  const vram = collectVramStats(env.mem);

  return {
    index: entry.index,
    stringAddr: hex(entry.stringAddr),
    stringText: entry.stringText,
    bbox: vram.bbox,
    fgPixels: vram.fgPixels,
    bgPixels: vram.bgPixels,
    termination: `${raw.termination}@${hex(raw.lastPc ?? 0)}`,
  };
}

function writeResults(entries) {
  const outPath = path.join(__dirname, 'error-banners.json');
  fs.writeFileSync(outPath, `${JSON.stringify(entries, null, 2)}\n`);
  return outPath;
}

function main() {
  const pointerEntries = decodeErrorPointerTable();
  const env = buildProbeEnv();
  const results = pointerEntries.map((entry) => runBanner(env, entry));
  const outPath = writeResults(results);

  console.log(`Rendered ${results.length} pointer-table-backed banners to ${outPath}`);
  for (const entry of results) {
    const span = entry.bbox
      ? `r${entry.bbox.minRow}-${entry.bbox.maxRow} c${entry.bbox.minCol}-${entry.bbox.maxCol}`
      : 'none';
    console.log(
      `${String(entry.index).padStart(2, '0')} ${entry.stringAddr} ${entry.stringText} ${span} ${entry.termination}`,
    );
  }
}

main();
