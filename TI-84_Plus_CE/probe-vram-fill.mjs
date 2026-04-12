#!/usr/bin/env node
// Option A: call 0x005b96 directly (VRAM fill function) and verify VRAM activity.
// This proves the end-to-end pipeline: lifted block → VRAM write → canvas intercept.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const p = createPeripheralBus({ trace: false, pllDelay: 2 });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// Boot to halt
ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

// Snapshot VRAM state BEFORE the call
let vramBefore = 0;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) vramBefore++;
}
console.log(`VRAM non-zero before call: ${vramBefore}`);

// Set up a clean call into 0x005b96
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu._iy = 0xD00080;

// Push sentinel return address
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

const trail = [];
const r = ex.runFrom(0x005b96, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 1000,
  onBlock: (pc, mode) => {
    trail.push(hex(pc));
    if (trail.length > 20) trail.shift();
  },
});

console.log(`\nResult: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Last 20 blocks:`);
for (const pc of trail) console.log(`  ${pc}`);

// Check VRAM
let vramAfter = 0;
let firstNonZero = -1;
let lastNonZero = -1;
const byteCounts = new Map();
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) {
    vramAfter++;
    if (firstNonZero < 0) firstNonZero = i;
    lastNonZero = i;
    byteCounts.set(mem[i], (byteCounts.get(mem[i]) || 0) + 1);
  }
}
console.log(`\nVRAM non-zero after call: ${vramAfter} bytes`);
if (vramAfter > 0) {
  console.log(`  First non-zero: ${hex(firstNonZero)}`);
  console.log(`  Last non-zero:  ${hex(lastNonZero)}`);
  console.log(`  Unique values: ${byteCounts.size}`);
  for (const [val, count] of [...byteCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5)) {
    console.log(`    0x${val.toString(16).padStart(2,'0')}: ${count} bytes`);
  }
}
console.log(`LCD state:`, ex.lcdMmio);
console.log(`CPU: A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)}`);
