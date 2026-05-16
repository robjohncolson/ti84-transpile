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
const KERNEL_INIT_ENTRY = 0x00069A;
const STACK_RESET_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0xFFFFFF;

const TARGET_PC = 0x00001A;
const TARGET_MODE = 'z80';
const BASELINE_BLOCK_ENTRIES = 707;
const BASELINE_TERMINATION = 'missing_block';
const BASELINE_LAST_PC = 0x00001A;
const BASELINE_LAST_MODE = 'z80';

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_MAX_STEPS = 50000;
const KERNEL_MAX_LOOP_ITERATIONS = 500000;
const TRACE_TAIL = 20;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
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
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
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

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 341: kernel init z80 seed follow-up');
console.log('=========================================');
console.log(`Boot entry:             ${hex(BOOT_ENTRY)}`);
console.log(`Kernel init entry:      ${hex(KERNEL_INIT_ENTRY)}`);
console.log(`Target block:           ${hex(TARGET_PC)}:${TARGET_MODE}`);
console.log(`Kernel max steps:       ${formatCount(KERNEL_MAX_STEPS)}`);
console.log(`Timer interrupt:        disabled`);

const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: BOOT_MAX_STEPS,
  maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

console.log('\nBoot phase');
console.log(`  steps=${formatCount(boot.steps)} termination=${boot.termination} lastPc=${hex(boot.lastPc)}:${boot.lastMode}`);

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
resetStack(cpu, mem);

const traceLog = [];
let targetFirstTraceStep = null;
let firstMissingBlock = null;

const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: KERNEL_MAX_STEPS,
  maxLoopIterations: KERNEL_MAX_LOOP_ITERATIONS,
  onBlock(blockPc, mode, meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const currentMode = mode ?? 'adl';
    traceLog.push({ step: steps, pc, mode: currentMode });

    if (pc === TARGET_PC && currentMode === TARGET_MODE && targetFirstTraceStep === null) {
      targetFirstTraceStep = steps;
    }
  },
  onMissingBlock(pc, mode, steps) {
    if (firstMissingBlock === null) {
      firstMissingBlock = {
        step: steps,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      };
    }
  },
});

const targetKey = blockKey(TARGET_PC, TARGET_MODE);
const blockVisits = kernelInit.blockVisits ?? {};
const targetVisitCount = blockVisits[targetKey] ?? 0;
const targetVisited = targetVisitCount > 0;
const uniqueBlockCount = Object.keys(blockVisits).length;
const traceEntries = traceLog.length;
const traceDelta = traceEntries - BASELINE_BLOCK_ENTRIES;
const progressedPastBaseline = targetVisited && (
  kernelInit.termination !== BASELINE_TERMINATION ||
  kernelInit.lastPc !== BASELINE_LAST_PC ||
  kernelInit.lastMode !== BASELINE_LAST_MODE ||
  traceEntries > BASELINE_BLOCK_ENTRIES
);
const missingBlocks = kernelInit.missingBlocks ?? [];

console.log('\nKernel init summary');
console.log(`  steps=${formatCount(kernelInit.steps)}`);
console.log(`  traced block entries=${formatCount(traceEntries)}`);
console.log(`  unique blocks=${formatCount(uniqueBlockCount)}`);
console.log(`  termination=${kernelInit.termination}`);
console.log(`  lastPc=${hex(kernelInit.lastPc)}:${kernelInit.lastMode}`);
console.log(`  loopsForced=${formatCount(kernelInit.loopsForced)}`);
console.log(`  missingBlocks=${formatCount(missingBlocks.length)}`);

console.log('\nTarget check');
console.log(`  visited ${hex(TARGET_PC)}:${TARGET_MODE} = ${targetVisited ? 'yes' : 'no'}`);
console.log(`  target visit count = ${formatCount(targetVisitCount)}`);
console.log(`  first target trace step = ${targetFirstTraceStep === null ? 'n/a' : formatCount(targetFirstTraceStep)}`);

console.log('\nSession 340 baseline');
console.log(`  termination=${BASELINE_TERMINATION}`);
console.log(`  lastPc=${hex(BASELINE_LAST_PC)}:${BASELINE_LAST_MODE}`);
console.log(`  traced block entries=${formatCount(BASELINE_BLOCK_ENTRIES)}`);

console.log('\nComparison');
console.log(`  trace delta vs baseline = ${traceDelta >= 0 ? '+' : ''}${formatCount(traceDelta)}`);
console.log(`  progressed past baseline = ${progressedPastBaseline ? 'yes' : 'no'}`);

if (firstMissingBlock) {
  console.log('\nFirst missing block callback');
  console.log(
    `  step=${formatCount(firstMissingBlock.step)} pc=${hex(firstMissingBlock.pc)}:${firstMissingBlock.mode}`,
  );
}

if (missingBlocks.length) {
  console.log('\nRecorded missing blocks');
  for (const entry of missingBlocks.slice(0, 10)) {
    console.log(`  ${entry}`);
  }
}

const lastTrace = traceLog.slice(-TRACE_TAIL);
console.log(`\nLast ${Math.min(TRACE_TAIL, lastTrace.length)} traced blocks`);
for (const entry of lastTrace) {
  console.log(`  step=${String(entry.step).padStart(5)} pc=${hex(entry.pc)}:${entry.mode}`);
}
