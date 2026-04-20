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

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_LEN = 26;

const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const OS_MBASE = 0xD0;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const WORKSPACE_FILL_ROW_START = 75;
const WORKSPACE_FILL_ROW_END = 219;
const ENTRY_FILL_ROW_START = 220;
const ENTRY_FILL_ROW_END = 239;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(memory) {
  memory.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function resetStack(cpu, memory, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  memory.fill(0xFF, cpu.sp, cpu.sp + size);
}

function coldBoot(executor, cpu, memory) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = OS_MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return boot;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, memory) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  memory.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStage(executor, label, entry, maxSteps) {
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(
    `${label}: entry=${hex(entry)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`,
  );

  return result;
}

function seedModeBuffer(memory) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    memory[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function seedDisplayBuffer(memory) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    memory[DISPLAY_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function fillRowsWhite(memory, rowStart, rowEnd) {
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      memory[offset] = 0xFF;
      memory[offset + 1] = 0xFF;
    }
  }
}

async function main() {
  console.log('=== Phase 202G - LCD Mirror Probe ===');

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error('Missing ROM.transpiled.js. Run `node scripts/transpile-ti84-rom.mjs` first.');
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);
  clearVram(memory);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, memory);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  const ramSnapshot = new Uint8Array(memory.slice(0x400000, 0xE00000));
  const cpuSnapshot = snapshotCpu(cpu);

  memory.set(ramSnapshot, 0x400000);
  clearVram(memory);
  restoreCpu(cpu, cpuSnapshot, memory);

  runStage(executor, 'stage 1 status bar background', STAGE_1_ENTRY, 30000);

  restoreCpu(cpu, cpuSnapshot, memory);
  memory[0xD0009B] &= ~0x40;
  runStage(executor, 'stage 2 status dots', STAGE_2_ENTRY, 30000);

  seedModeBuffer(memory);
  seedDisplayBuffer(memory);
  console.log(`stage 3 seed mode buffer: "${MODE_BUF_TEXT}"`);

  restoreCpu(cpu, cpuSnapshot, memory);
  runStage(executor, 'stage 3 home row strip', STAGE_3_ENTRY, 50000);

  restoreCpu(cpu, cpuSnapshot, memory);
  runStage(executor, 'stage 4 history area', STAGE_4_ENTRY, 50000);

  fillRowsWhite(memory, WORKSPACE_FILL_ROW_START, WORKSPACE_FILL_ROW_END);
  console.log(`stage 5 workspace fill: rows ${WORKSPACE_FILL_ROW_START}-${WORKSPACE_FILL_ROW_END} -> 0xFFFF`);

  fillRowsWhite(memory, ENTRY_FILL_ROW_START, ENTRY_FILL_ROW_END);
  console.log(`stage 6 entry line fill: rows ${ENTRY_FILL_ROW_START}-${ENTRY_FILL_ROW_END} -> 0xFFFF`);

  const stats = cpu.getLcdF80Stats();
  console.log(`0xF80000 writes: ${stats.writes}`);

  for (const [index, entry] of stats.log.slice(0, 10).entries()) {
    console.log(
      `  [${index}] addr=${hex(entry.addr)} value=${hex(entry.value, 2)} pc=${hex(entry.pc)}`,
    );
  }

  console.log(`lcdMmio.upbase final: ${hex(executor.lcdMmio?.upbase ?? null)}`);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
}

process.exitCode = 0;
