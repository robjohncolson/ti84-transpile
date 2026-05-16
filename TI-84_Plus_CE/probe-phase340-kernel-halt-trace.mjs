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

const HALT_STUB = 0x0019B5;
const RST28_FP_EXIT = 0x000028;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const TRACE_BUDGET = 750;

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
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
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
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

// ── Load ROM and runtime ───────────────────────────────────────────────────────

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

console.log('Phase 340: kernel halt trace');
console.log('============================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}`);
console.log(`Kernel init entry:   ${hex(KERNEL_INIT_ENTRY)}`);
console.log(`Trace budget:        ${formatCount(TRACE_BUDGET)} steps`);
console.log(`Halt stub address:   ${hex(HALT_STUB)}`);
console.log(`RST 0x28 FP exit:    ${hex(RST28_FP_EXIT)}`);
console.log(`Timer interrupt:     disabled`);

// ── Phase 1: Boot ──────────────────────────────────────────────────────────────

const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: BOOT_MAX_STEPS,
  maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

console.log('\nBoot phase');
console.log(`  steps=${formatCount(boot.steps)} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);

// ── Phase 2: Reset for kernel init ─────────────────────────────────────────────

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
resetStack(cpu, mem);

// ── Phase 3: Trace kernel init using onBlock callback ──────────────────────────

console.log('\nKernel init trace (per-block, up to 750 steps)');
console.log('-----------------------------------------------');

const traceLog = [];
const visitCounts = {};
let haltStubHits = 0;
let rst28Hits = 0;

const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: TRACE_BUDGET,
  maxLoopIterations: 500000,
  onBlock(blockPc, mode, meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const currentMode = mode ?? 'adl';

    const entry = {
      step: steps,
      pc,
      mode: currentMode,
    };
    traceLog.push(entry);

    const pcKey = hex(pc);
    visitCounts[pcKey] = (visitCounts[pcKey] ?? 0) + 1;

    if (pc === HALT_STUB) {
      haltStubHits++;
      console.log(`  *** HALT STUB HIT at step ${formatCount(steps)} ***`);
    }
    if (pc === RST28_FP_EXIT) {
      rst28Hits++;
      console.log(`  *** RST 0x28 HIT at step ${formatCount(steps)} ***`);
    }

    console.log(
      `  [${String(traceLog.length).padStart(4, '0')}] step=${String(steps).padStart(5)} ` +
      `PC=${hex(pc)}:${currentMode}`
    );
  },
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n========== SUMMARY ==========');
console.log(`Total steps executed:     ${formatCount(kernelInit.steps)}`);
console.log(`Total blocks traced:      ${formatCount(traceLog.length)}`);
console.log(`Termination:              ${kernelInit.termination}`);
console.log(`Last PC:                  ${hex(kernelInit.lastPc)}:${kernelInit.lastMode}`);
console.log(`Halt stub (${hex(HALT_STUB)}) hits: ${haltStubHits}`);
console.log(`RST 0x28 (${hex(RST28_FP_EXIT)}) hits: ${rst28Hits}`);
console.log(`Missing blocks:           ${formatCount(kernelInit.missingBlocks?.length ?? 0)}`);
console.log(`Loops forced:             ${formatCount(kernelInit.loopsForced ?? 0)}`);

// Most-visited PCs
const sortedVisits = Object.entries(visitCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log('\nTop 20 most-visited PCs');
for (let i = 0; i < sortedVisits.length; i++) {
  const [pc, count] = sortedVisits[i];
  console.log(`  ${String(i + 1).padStart(2, '0')}. ${pc} -> ${formatCount(count)} visit(s)`);
}

// Last 20 blocks before halt
const last20 = traceLog.slice(-20);
console.log('\nLast 20 blocks before halt/termination');
for (const entry of last20) {
  console.log(
    `  step=${String(entry.step).padStart(5)} PC=${hex(entry.pc)}:${entry.mode}`
  );
}

// Final register state
console.log('\nFinal register state');
console.log(`  SP=${hex(cpu.sp & 0xFFFFFF)}`);
console.log(`  A=${hex8(cpu.a & 0xFF)}`);
console.log(`  HL=${hex(cpu.hl & 0xFFFFFF)}`);
console.log(`  DE=${hex(cpu.de & 0xFFFFFF)}`);
console.log(`  BC=${hex(cpu.bc & 0xFFFFFF)}`);
console.log(`  IX=${hex(cpu.ix & 0xFFFFFF)}`);
console.log(`  IY=${hex(cpu.iy & 0xFFFFFF)}`);
console.log(`  MBASE=${hex8(cpu.mbase & 0xFF)}`);

// Stack trace: read top 10 return addresses from stack
console.log('\nStack contents (top 10 return addresses)');
const spNow = cpu.sp & 0xFFFFFF;
for (let i = 0; i < 10; i++) {
  const addr = (spNow + i * 3) & 0xFFFFFF;
  const value = read24(mem, addr);
  const marker = value === RETURN_SENTINEL ? ' <- RETURN_SENTINEL' : '';
  console.log(`  SP+${String(i * 3).padStart(2, '0')}: [${hex(addr)}] = ${hex(value)}${marker}`);
}

// Block visits map for downstream analysis
if (kernelInit.blockVisits) {
  const uniqueBlocks = Object.keys(kernelInit.blockVisits).length;
  console.log(`\nUnique blocks visited: ${formatCount(uniqueBlocks)}`);
}
