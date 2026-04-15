#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const STAGES = [
  {
    name: 'status_bar_bg',
    entry: 0x0a2b72,
    maxSteps: 30000,
    baselineSteps: 65,
  },
  {
    name: 'status_dots',
    entry: 0x0a3301,
    maxSteps: 30000,
    baselineSteps: 217,
  },
  {
    name: 'home_row_strip',
    entry: 0x0a29ec,
    maxSteps: 50000,
    baselineSteps: 17513,
    seedModeBuffer: true,
  },
  {
    name: 'history_area',
    entry: 0x0a2854,
    maxSteps: 50000,
    baselineSteps: 521,
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  cpu._ix = cpu.sp;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index++) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function runStage(executor, cpu, cpuSnap, mem, stage) {
  if (stage.seedModeBuffer) {
    seedModeBuffer(mem);
  }

  restoreCpu(cpu, cpuSnap, mem);

  const spAtEntry = cpu.sp;
  const ixAtEntry = cpu._ix;
  const result = executor.runFrom(stage.entry, 'adl', {
    maxSteps: stage.maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  return {
    name: stage.name,
    entry: hex(stage.entry, 6),
    baselineSteps: stage.baselineSteps,
    steps: result.steps,
    stepsDelta: result.steps - stage.baselineSteps,
    increasedVsBaseline: result.steps > stage.baselineSteps,
    termination: result.termination,
    lastPc: hex(result.lastPc, 6),
    spAtEntry: hex(spAtEntry, 6),
    spAtExit: hex(cpu.sp, 6),
    ixAtEntry: hex(ixAtEntry, 6),
    ixAtExit: hex(cpu._ix, 6),
  };
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  mem.set(ramSnap, 0x400000);
  clearVram(mem);

  const stages = [];

  for (const stage of STAGES) {
    stages.push(runStage(executor, cpu, cpuSnap, mem, stage));
  }

  return {
    phase: '161',
    fix: 'IX=SP in restoreCpu',
    comparisonSource: 'phase99d-report.md',
    boot: {
      steps: bootResult.steps,
      termination: bootResult.termination,
      lastPc: hex(bootResult.lastPc, 6),
    },
    stages,
    summary: {
      improvedStages: stages.filter((stage) => stage.increasedVsBaseline).map((stage) => stage.name),
      allEntryIxMatchSp: stages.every((stage) => stage.spAtEntry === stage.ixAtEntry),
    },
  };
}

try {
  const summary = await main();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    phase: '161',
    fix: 'IX=SP in restoreCpu',
    error: error.message,
    stack: error.stack,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
