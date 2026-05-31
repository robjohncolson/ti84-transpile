#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;

// ── Load ROM + transpiled blocks ──

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: true, timerInterval: 500 });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

// ── Hex dump helper ──

function hexDump(startAddr, length) {
  const lines = [];
  for (let off = 0; off < length; off += 16) {
    const bytes = [];
    for (let i = 0; i < 16 && off + i < length; i++) {
      bytes.push(mem[startAddr + off + i].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`  ${hex(startAddr + off, 6)}: ${bytes.join(' ')}`);
  }
  return lines.join('\n');
}

// ── 3-stage boot ──

console.log('=== Stage 1: Cold boot ===');
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`  steps=${bootResult.steps} term=${bootResult.termination}`);
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('=== Stage 2: Kernel init ===');
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  steps=${kernelResult.steps} term=${kernelResult.termination}`);
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('=== Stage 3: Post-init ===');
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  steps=${postInitResult.steps} term=${postInitResult.termination}`);

// ── State setup ──

console.log('\n=== Setting state variables ===');

// No key injection - we want to observe the idle loop

// Clear D0009D so 0x030300 doesn't exit early via BIT 0 test
mem[0xD0009D] = 0x00;

// Mode variables
mem[0xD14091] = 1;           // key processing enable gate
mem[0xD00824] = 0x48;        // mode = 'H' (home screen)
mem[0xD007E0] = 0x48;        // companion mode = 'H'

// Display state
mem[0xD000B4] |= 0x01;      // bit 0 enables display path at 0x02FDD8
mem[0xD000C6] |= 0x01;      // bit 0 enables CALL NZ 0x030078

// OS state
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;      // bit 3

// CPU state
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;

// Stack with return address pointing back to event loop top
cpu.sp = STACK_RESET_TOP - 3;
mem[cpu.sp]     = 0xBE;      // low byte of 0x02FDBE
mem[cpu.sp + 1] = 0xFD;      // mid byte
mem[cpu.sp + 2] = 0x02;      // high byte

console.log(`  D0009D=${hex(mem[0xD0009D])} D00080=${hex(mem[0xD00080])} D00824=${hex(mem[0xD00824])}`);
console.log(`  D007E0=${hex(mem[0xD007E0])} D14091=${hex(mem[0xD14091])}`);

// ── Hex dumps ──

console.log('\n=== ROM bytes at 0x03030E (80 bytes) ===');
console.log(hexDump(0x03030E, 80));

console.log('\n=== ROM bytes at 0x04C979 (16 bytes) ===');
console.log(hexDump(0x04C979, 16));

// ── Tracking ──

const TRACKED_PCS = [
  0x02FD99, 0x03030E, 0x04C979, 0x040D11, 0x030300, 0x03FA09,
];

const hitCounts = new Map();
const firstHits = new Map();   // PC -> array of { step, hitNum } (first 10)
for (const pc of TRACKED_PCS) {
  hitCounts.set(pc, 0);
  firstHits.set(pc, []);
}

const deValues = [];

function onBlock(pc, mode, meta, steps) {
  const addr = pc & 0xFFFFFF;

  if (!hitCounts.has(addr)) return;

  const count = hitCounts.get(addr) + 1;
  hitCounts.set(addr, count);

  // Log first 10 hits
  const log = firstHits.get(addr);
  if (log.length < 10) {
    log.push({ step: steps, hitNum: count });
  }

  // Track DE values at 0x04C979
  if (addr === 0x04C979 && deValues.length < 20) {
    deValues.push({ step: steps, de: cpu._de, hl: cpu._hl });
  }
}

// ── Run from 0x02FD99 (idle loop entry) ──

console.log('\n=== Running from 0x02FD99 (idle loop) ===');

const result = executor.runFrom(0x02FD99, 'adl', {
  maxSteps: 5000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});

console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);

// ── Report ──

console.log('\n=== DE/HL values at 0x04C979 calls ===');
if (deValues.length === 0) {
  console.log('  (no calls to 0x04C979)');
} else {
  for (const entry of deValues) {
    console.log(`  step ${entry.step}: DE=${hex(entry.de, 6)} HL=${hex(entry.hl, 6)}`);
  }
}

console.log('\n=== Hit counts ===');
for (const pc of TRACKED_PCS) {
  const count = hitCounts.get(pc);
  const label = hex(pc, 6);
  console.log(`  ${label}: ${count}`);
  const log = firstHits.get(pc);
  if (log.length > 0) {
    for (const entry of log) {
      console.log(`    hit #${entry.hitNum} at step ${entry.step}`);
    }
  }
}

// Final state
console.log('\n=== Final state ===');
console.log(`  D0009D=${hex(mem[0xD0009D])} D00080=${hex(mem[0xD00080])} D00587=${hex(mem[0xD00587])}`);
console.log(`  D00824=${hex(mem[0xD00824])} D007E0=${hex(mem[0xD007E0])} D14091=${hex(mem[0xD14091])}`);
console.log(`  terminationReason=${result?.reason || result?.termination || (cpu.halted ? 'halted' : 'unknown')}`);
