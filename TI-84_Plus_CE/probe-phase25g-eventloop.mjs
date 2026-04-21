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

const EVENT_LOOP_ENTRY = 0x0019BE;
const ISR_ENTRY = 0x000038;
const TARGET_BLOCK = 0x00B608;
const CALLBACK_PTR = 0xD02AD7;
const SYS_FLAG_ADDR = 0xD0009B;
const SYS_FLAG_MASK = 0x40;
const STACK_TOP = 0xD1A87E;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function write24(memory, addr, value) {
  memory[addr] = value & 0xFF;
  memory[addr + 1] = (value >> 8) & 0xFF;
  memory[addr + 2] = (value >> 16) & 0xFF;
}

function read24(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
}

// --- Load ROM and transpiled blocks ---

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS;

const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

// --- Step A: Boot to HALT (z80 mode, 5000 steps) ---

console.log('Phase 25G Event Loop Probe (ISR-dispatch version)');
console.log('==================================================');

const boot = executor.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});

console.log(`Boot: ${boot.steps} steps → ${boot.termination} at ${hex(boot.lastPc)}`);

// --- Step B: Initialize state AFTER boot ---

// Write callback pointer: mem[0xD02AD7..0xD02AD9] = 0x0019BE (little-endian)
write24(memory, CALLBACK_PTR, EVENT_LOOP_ENTRY);

// Set system flag: (IY+27) bit 6 = ISR dispatch ready
memory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;

// Press ENTER: SDK Group 6 = keyMatrix[1], bit 0
peripherals.keyboard.keyMatrix[1] = 0xFE;
peripherals.setKeyboardIRQ(true);

// Enable keyboard in interrupt controller
peripherals.write(0x5006, 0x08);

console.log(`Callback: 0xD02AD7 = ${hex(read24(memory, CALLBACK_PTR))}`);
console.log(`System flag (IY+27): ${hex(memory[SYS_FLAG_ADDR], 2)}`);
console.log(`Keyboard: ENTER pressed, IRQ bit 19 set`);
console.log('');

// --- Step C: Wake CPU for ISR and run from 0x000038 (not 0x0019BE) ---

cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu.sp = STACK_TOP;
cpu.push(boot.lastPc + 1);

const blockTrace = [];
const missingHits = [];
const uniqueBlocks = new Set();

const result = executor.runFrom(ISR_ENTRY, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 200,
  onBlock(pc, mode, meta, step) {
    const entry = {
      step: step + 1,
      pc: pc >>> 0,
      mode,
      dasm: meta?.instructions?.[0]?.dasm ?? '???',
    };

    blockTrace.push(entry);
    uniqueBlocks.add(`${hex(entry.pc)}:${entry.mode}`);

    if (blockTrace.length <= 30 || entry.pc === TARGET_BLOCK) {
      console.log(`[block ${String(entry.step).padStart(5, ' ')}] ${hex(entry.pc)}:${entry.mode} ${entry.dasm}`);
    }
  },
  onMissingBlock(pc, mode, step) {
    const entry = {
      step: step + 1,
      pc: pc >>> 0,
      mode,
    };

    missingHits.push(entry);
    console.log(`[missing ${String(entry.step).padStart(5, ' ')}] ${hex(entry.pc)}:${entry.mode}`);
  },
});

const targetReached = blockTrace.some((entry) => entry.pc === TARGET_BLOCK);
const targetMissing = missingHits.find((entry) => entry.pc === TARGET_BLOCK) ?? null;

// Region breakdown
const regions = new Map();
for (const entry of blockTrace) {
  const region = (entry.pc >> 16) & 0xFF;
  regions.set(region, (regions.get(region) || 0) + 1);
}

console.log('');
console.log('ISR Run Summary');
console.log('---------------');
console.log(`Termination: ${result.termination}`);
console.log(`Final PC: ${hex(result.lastPc)}:${result.lastMode ?? 'adl'}`);
console.log(`Block executions: ${blockTrace.length}`);
console.log(`Unique blocks: ${uniqueBlocks.size}`);
console.log(`Missing block hits: ${missingHits.length}`);
console.log(`Reached ${hex(TARGET_BLOCK)}: ${targetReached ? 'YES' : 'no'}`);

if (targetMissing) {
  console.log(`${hex(TARGET_BLOCK)} missing at step ${targetMissing.step}`);
}

console.log(`Code regions:`);
for (const [region, count] of [...regions.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${hex(region, 2)}xxxx: ${count} blocks`);
}

if (missingHits.length > 0) {
  console.log('Missing blocks encountered:');
  for (const entry of missingHits.slice(0, 20)) {
    console.log(`  step ${String(entry.step).padStart(5, ' ')} -> ${hex(entry.pc)}:${entry.mode}`);
  }
  if (missingHits.length > 20) {
    console.log(`  ... and ${missingHits.length - 20} more`);
  }
}

console.log(`Callback after ISR: ${hex(read24(memory, CALLBACK_PTR))}`);
console.log(`System flag after: ${hex(memory[SYS_FLAG_ADDR], 2)}`);

// --- Step D: ISR Cycling (5 rounds) ---

console.log('');
console.log('--- ISR Cycling (5 rounds) ---');

let anyReachedTarget = targetReached;

for (let cycle = 0; cycle < 5; cycle++) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.sp = STACK_TOP;

  // Push sentinel return address onto stack (manual write, like test 23)
  cpu.sp -= 3;
  memory[cpu.sp] = 0xFF;
  memory[cpu.sp + 1] = 0xFF;
  memory[cpu.sp + 2] = 0xFF;

  const cycleMissing = [];
  let cycleReachedTarget = false;

  const cycleResult = executor.runFrom(ISR_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 200,
    onBlock(pc) {
      if ((pc >>> 0) === TARGET_BLOCK) {
        cycleReachedTarget = true;
      }
    },
    onMissingBlock(pc, mode) {
      cycleMissing.push(hex(pc));
    },
  });

  if (cycleReachedTarget) {
    anyReachedTarget = true;
  }

  const cb = read24(memory, CALLBACK_PTR);

  // Check first 64 VRAM bytes for activity
  let vramNow = 0;
  for (let i = 0xD40000; i < 0xD40000 + 64; i++) {
    if (memory[i] !== 0) vramNow++;
  }

  const missInfo = cycleMissing.length > 0
    ? ` missing=[${[...new Set(cycleMissing)].join(',')}]`
    : '';

  const targetInfo = cycleReachedTarget ? ' ← TARGET HIT' : '';

  console.log(
    `  Cycle ${cycle}: ${cycleResult.steps} steps → ${cycleResult.termination}` +
    ` | cb=${hex(cb)} | vram=${vramNow > 0 ? vramNow + ' non-zero' : 'empty'}` +
    `${missInfo}${targetInfo}`
  );
}

console.log('');
console.log(`=== ${hex(TARGET_BLOCK)} reached in ANY cycle: ${anyReachedTarget ? 'YES' : 'NO'} ===`);
