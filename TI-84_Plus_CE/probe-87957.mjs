#!/usr/bin/env node
// Check if 0x087957 renders actual text glyphs (unlike MODE's solid bars)

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

ex.runFrom(0x087957, 'adl', { maxSteps: 200000, maxLoopIterations: 2000 });

// Bbox
let minR = 240, maxR = -1, minC = 320, maxC = -1, nz = 0;
for (let row = 0; row < 240; row++) for (let col = 0; col < 320; col++) {
  const off = row * 640 + col * 2;
  if (mem[0xd40000 + off] !== 0 || mem[0xd40000 + off + 1] !== 0) {
    nz++;
    if (row < minR) minR = row; if (row > maxR) maxR = row;
    if (col < minC) minC = col; if (col > maxC) maxC = col;
  }
}
console.log(`nz=${nz} bbox rows ${minR}-${maxR} × cols ${minC}-${maxC}`);

// Full ascii art of the bbox
for (let row = minR; row <= Math.min(maxR, minR + 30); row++) {
  let line = row.toString().padStart(3) + ' ';
  for (let col = minC; col <= maxC; col++) {
    const off = row * 640 + col * 2;
    const on = mem[0xd40000 + off] !== 0 || mem[0xd40000 + off + 1] !== 0;
    line += on ? '#' : '.';
  }
  console.log(line);
}
