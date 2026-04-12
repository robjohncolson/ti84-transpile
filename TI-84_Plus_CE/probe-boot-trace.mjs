#!/usr/bin/env node
// Trace the full boot path from reset vector, capturing the block-by-block
// execution order plus register state. Goal: find what decides to halt at
// 0x0019b5 instead of continuing to OS init.

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

// Enable NMI timer so the power-down halt can wake and continue
const p = createPeripheralBus({
  trace: false,
  pllDelay: 2,
  timerInterrupt: true,
  timerMode: 'nmi',
  timerInterval: 50,
});
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

const trail = [];
const blockCounts = new Map();
const r = ex.runFrom(0x000000, 'z80', {
  maxSteps: 50000,
  maxLoopIterations: 32,
  onBlock: (pc, mode) => {
    const key = `${hex(pc)}:${mode}`;
    blockCounts.set(key, (blockCounts.get(key) || 0) + 1);
    if (trail.length < 200 || blockCounts.get(key) <= 2) {
      trail.push(`${key} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} SP=${hex(cpu.sp)} madl=${cpu.madl}`);
    }
  },
  onInterrupt: (type, fromPc, vector, step) => {
    trail.push(`  [INT ${type}] fromPc=${hex(fromPc)} vector=${hex(vector)} step=${step}`);
  },
});

console.log(`Boot: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Unique blocks visited: ${blockCounts.size}`);
console.log(`\nTop 15 most-visited blocks:`);
const hot = [...blockCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [key, count] of hot) console.log(`  ${key}: ${count}`);
console.log(`\nTrail (first + last 40 entries):`);
const showFirst = trail.slice(0, 60);
const showLast = trail.length > 100 ? trail.slice(-40) : [];
showFirst.forEach((line, idx) => console.log(`  [${String(idx).padStart(4, ' ')}] ${line}`));
if (showLast.length > 0) {
  console.log('  ...');
  showLast.forEach((line) => console.log(`  ${line}`));
}
