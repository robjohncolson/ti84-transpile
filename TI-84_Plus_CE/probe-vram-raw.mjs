#!/usr/bin/env node
// Check raw VRAM values after MODE screen render. If we see alternating
// pixel values (text on background), the solid-bar ascii art is misleading.
// If we see uniform 0xFFFF throughout, the bars really are solid fills.

import fs from 'node:fs';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const romBytes = fs.readFileSync('ROM.rom');
const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xd1a87e - 3;
mem[cpu.sp] = 0xff; mem[cpu.sp + 1] = 0xff; mem[cpu.sp + 2] = 0xff;
ex.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

for (let i = 0xd40000; i < 0xd40000 + 320 * 240 * 2; i++) mem[i] = 0;

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = 0xd00080;
cpu.sp = 0xd1a87e - 12;
for (let i = 0; i < 12; i++) mem[cpu.sp + i] = 0xff;
cpu.f = 0x40;

ex.runFrom(0x0296dd, 'adl', { maxSteps: 200000, maxLoopIterations: 2000 });

// Count unique pixel values across the whole VRAM
const counts = new Map();
for (let i = 0xd40000; i < 0xd40000 + 320 * 240 * 2; i += 2) {
  const px = mem[i] | (mem[i + 1] << 8);
  counts.set(px, (counts.get(px) || 0) + 1);
}
console.log('MODE screen unique pixel values:');
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
for (const [px, count] of sorted.slice(0, 10)) {
  console.log(`  0x${px.toString(16).padStart(4, '0')}: ${count}`);
}

// Sample a horizontal strip at row 40 (middle of a "solid" bar)
console.log('\nRow 40, cols 0-40 raw pixels:');
let line = '';
for (let col = 0; col < 40; col++) {
  const off = 0xd40000 + 40 * 640 + col * 2;
  const px = mem[off] | (mem[off + 1] << 8);
  line += px.toString(16).padStart(4, '0') + ' ';
}
console.log('  ' + line);

// Row 45
console.log('\nRow 45, cols 0-40 raw pixels:');
line = '';
for (let col = 0; col < 40; col++) {
  const off = 0xd40000 + 45 * 640 + col * 2;
  const px = mem[off] | (mem[off + 1] << 8);
  line += px.toString(16).padStart(4, '0') + ' ';
}
console.log('  ' + line);

// Render row 40 with distinct symbols per unique value
console.log('\nRow 40 with per-value symbols (first 120 cols):');
const symMap = new Map();
const syms = '#@*+x.<>=?';
let symIdx = 0;
let rendered = '';
for (let col = 0; col < 120; col++) {
  const off = 0xd40000 + 40 * 640 + col * 2;
  const px = mem[off] | (mem[off + 1] << 8);
  if (px === 0) rendered += '.';
  else {
    if (!symMap.has(px)) {
      symMap.set(px, syms[symIdx++ % syms.length]);
    }
    rendered += symMap.get(px);
  }
}
console.log('  ' + rendered);
console.log('  symbol legend:');
for (const [px, sym] of symMap) console.log(`    ${sym} = 0x${px.toString(16)}`);
