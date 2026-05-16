#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;
const COORMON_ENTRY = 0x08BF22;
const COORMON_BRANCH_POINT = 0x08BF3C;
const COORMON_KEY_PRESENT_TARGET = 0x08BF68;
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const GETCSC_ADDR = 0x3B0033;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 50000;
const COORMON_MAX_LOOP_ITERATIONS = 50000;

const ITERATION_PLAN = [
  { index: 1, keyName: 'ENTER', scanCode: 0x09 },
  { index: 2, keyName: 'NONE', scanCode: 0x00 },
  { index: 3, keyName: 'RIGHT', scanCode: 0x03 },
  { index: 4, keyName: 'NONE', scanCode: 0x00 },
  { index: 5, keyName: 'CLEAR', scanCode: 0x0F },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatBlock(pc, mode) {
  return `${hex(pc)}:${mode ?? 'n/a'}`;
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function resetExecutionState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
}

function prepareForCoorMon(cpu, mem) {
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  resetExecutionState(cpu, mem);
}

function createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, PRELIFTED_BLOCKS) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const phase1 = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetExecutionState(cpu, mem);

  const phase2 = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  prepareForCoorMon(cpu, mem);
  write24(mem, CXMAIN_PTR, HOME_HANDLER);

  return { mem, peripherals, executor, cpu, phase1, phase2 };
}

function runIteration(env, iteration) {
  const { mem, executor, cpu } = env;

  mem[GETCSC_ADDR] = iteration.scanCode;
  prepareForCoorMon(cpu, mem);

  const state = {
    uniqueBlocks: new Set(),
    hitBranchPoint: false,
    aAtBranchPoint: null,
    hitKeyPresentTarget: false,
  };

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: COORMON_MAX_STEPS,
    maxLoopIterations: COORMON_MAX_LOOP_ITERATIONS,
    onBlock(pc) {
      const blockPc = pc & 0xFFFFFF;
      state.uniqueBlocks.add(blockPc);

      if (!state.hitBranchPoint && blockPc === COORMON_BRANCH_POINT) {
        state.hitBranchPoint = true;
        state.aAtBranchPoint = cpu.a & 0xFF;
      }

      if (blockPc === COORMON_KEY_PRESENT_TARGET) {
        state.hitKeyPresentTarget = true;
      }
    },
  });

  return {
    ...iteration,
    hitBranchPoint: state.hitBranchPoint,
    aAtBranchPoint: state.aAtBranchPoint,
    hitKeyPresentTarget: state.hitKeyPresentTarget,
    steps: result.steps,
    uniqueBlocks: state.uniqueBlocks.size,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  };
}

function formatTable(rows) {
  const widths = rows[0].map((_, columnIndex) => (
    Math.max(...rows.map((row) => String(row[columnIndex]).length))
  ));

  const renderRow = (row) => row
    .map((cell, columnIndex) => String(cell).padEnd(widths[columnIndex], ' '))
    .join(' | ');

  const divider = widths
    .map((width) => '-'.repeat(width))
    .join('-+-');

  return [
    renderRow(rows[0]),
    divider,
    ...rows.slice(1).map(renderRow),
  ].join('\n');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const env = createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, PRELIFTED_BLOCKS);
const results = ITERATION_PLAN.map((iteration) => runIteration(env, iteration));

console.log('Phase 338: Multi-iteration CoorMon event loop');
console.log('='.repeat(72));
console.log(`Boot phase:   steps=${env.phase1.steps} termination=${env.phase1.termination} lastPc=${formatBlock(env.phase1.lastPc, env.phase1.lastMode)}`);
console.log(`Kernel init:  steps=${env.phase2.steps} termination=${env.phase2.termination} lastPc=${formatBlock(env.phase2.lastPc, env.phase2.lastMode)}`);
console.log(`cxMain ptr:   ${hex(CXMAIN_PTR)} -> ${hex(read24(env.mem, CXMAIN_PTR))}`);
console.log(`GetCSC byte:  ${hex(GETCSC_ADDR)}`);
console.log(`Iterations:   ${results.length}`);
console.log('');

const tableRows = [
  [
    'Iter',
    'Key',
    'Inject',
    `Hit ${hex(COORMON_BRANCH_POINT)}`,
    `A @ ${hex(COORMON_BRANCH_POINT)}`,
    `Hit ${hex(COORMON_KEY_PRESENT_TARGET)}`,
    'Steps',
    'Blocks',
    'Termination',
    'Last PC',
  ],
  ...results.map((result) => [
    String(result.index),
    result.keyName,
    hex8(result.scanCode),
    result.hitBranchPoint ? 'yes' : 'no',
    hex8(result.aAtBranchPoint),
    result.hitKeyPresentTarget ? 'yes' : 'no',
    String(result.steps),
    String(result.uniqueBlocks),
    result.termination,
    hex(result.lastPc),
  ]),
];

console.log(formatTable(tableRows));
