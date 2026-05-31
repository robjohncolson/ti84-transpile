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

// ── State setup (no key injection - idle loop only) ──

console.log('\n=== Setting state variables ===');

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
mem[cpu.sp]     = 0x99;      // low byte of 0x02FD99
mem[cpu.sp + 1] = 0xFD;      // mid byte
mem[cpu.sp + 2] = 0x02;      // high byte

console.log(`  D00587=${hex(mem[0xD00587])} D00080=${hex(mem[0xD00080])} D00824=${hex(mem[0xD00824])}`);
console.log(`  D007E0=${hex(mem[0xD007E0])} D14091=${hex(mem[0xD14091])}`);

// ── Hex dump of 0x03013A ──

console.log('\n=== Hex dump: 0x03013A (64 bytes) ===');
for (let row = 0; row < 4; row++) {
  const base = 0x03013A + row * 16;
  let line = hex(base, 6) + ':';
  for (let col = 0; col < 16; col++) {
    line += ' ' + mem[base + col].toString(16).toUpperCase().padStart(2, '0');
  }
  console.log('  ' + line);
}

// ── Tracking ──

const TRACKED_PCS = [
  0x02FD99, 0x02FDB6, 0x03FA09, 0x02FDD8, 0x03030E, 0x02FE73,
  0x03013A,
];

const hitCounts = new Map();
const firstHits = new Map();
for (const pc of TRACKED_PCS) {
  hitCounts.set(pc, 0);
  firstHits.set(pc, []);
}

// RET-point stack restoration addresses
const RET_POINTS = new Set([0x02FDB6]);

// Inside-0x03013A tracking
let inside03013A = false;
const trace03013APCs = [];
const unique03013APCs = new Set();

function onBlock(pc, mode, meta, steps) {
  const addr = pc & 0xFFFFFF;

  // Track inside 0x03013A
  if (addr === 0x03013A) {
    inside03013A = true;
  } else if (addr === 0x02FDB6) {
    inside03013A = false;
  }

  if (inside03013A) {
    unique03013APCs.add(addr);
    if (trace03013APCs.length < 30) {
      trace03013APCs.push(addr);
    }
  }

  if (!hitCounts.has(addr)) return;

  const count = hitCounts.get(addr) + 1;
  hitCounts.set(addr, count);

  // Log first 10 hits
  const log = firstHits.get(addr);
  if (log.length < 10) {
    log.push({ step: steps, hitNum: count });
  }

  // Restore return address at RET points
  if (RET_POINTS.has(addr)) {
    mem[cpu.sp]     = 0x99;
    mem[cpu.sp + 1] = 0xFD;
    mem[cpu.sp + 2] = 0x02;
  }
}

// ── Run event loop ──

console.log('\n=== Running event loop at 0x02FD99 ===');

const result = executor.runFrom(0x02FD99, 'adl', {
  maxSteps: 10000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});

console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);

// ── Report ──

console.log('\n=== Unique PCs inside 0x03013A ===');
const sortedUnique = [...unique03013APCs].sort((a, b) => a - b);
console.log(`  Count: ${sortedUnique.length}`);
for (const pc of sortedUnique) {
  console.log(`  ${hex(pc, 6)}`);
}

console.log('\n=== First 30 PCs in trace order inside 0x03013A ===');
for (let i = 0; i < trace03013APCs.length; i++) {
  console.log(`  [${i}] ${hex(trace03013APCs[i], 6)}`);
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

// Final state JSON
const hitCountsObj = {};
for (const pc of TRACKED_PCS) {
  hitCountsObj[hex(pc, 6)] = hitCounts.get(pc);
}

console.log('\n=== JSON Report ===');
console.log(JSON.stringify({
  hitCounts: hitCountsObj,
  uniquePCsInside03013A: sortedUnique.map(pc => hex(pc, 6)),
  trace03013AFirst30: trace03013APCs.map(pc => hex(pc, 6)),
  finalState: {
    D00587: hex(mem[0xD00587]),
    D00080: hex(mem[0xD00080]),
    D00824: hex(mem[0xD00824]),
    D007E0: hex(mem[0xD007E0]),
    D14091: hex(mem[0xD14091]),
  },
  terminationReason: result?.reason || result?.termination || (cpu.halted ? 'halted' : 'unknown'),
}, null, 2));
