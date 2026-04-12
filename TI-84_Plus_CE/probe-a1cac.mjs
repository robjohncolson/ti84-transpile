#!/usr/bin/env node
// Phase 36c: test whether 0x0a1cac is the text-draw primitive that 0x028f02
// calls after rendering its background. Call it directly with HL="RADIAN".

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

// Clear VRAM
for (let i = 0xd40000; i < 0xd40000 + 320 * 240 * 2; i++) mem[i] = 0;

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = 0xd00080;
cpu.sp = 0xd1a87e - 9;
for (let i = 0; i < 9; i++) mem[cpu.sp + i] = 0xff;
cpu.f = 0x40;
cpu.hl = 0x029139; // "RADIAN"

let blocks = 0, writes = 0;
const w = cpu.write8.bind(cpu);
cpu.write8 = function (a, v) {
  if (a >= 0xd40000 && a < 0xd40000 + 320 * 240 * 2) writes++;
  return w(a, v);
};
const r = ex.runFrom(0x0a1cac, 'adl', { maxSteps: 100000, maxLoopIterations: 500, onBlock: () => blocks++ });
console.log(`0x0a1cac: ${r.steps} steps → ${r.termination} at 0x${r.lastPc.toString(16)}`);
console.log(`blocks=${blocks} writes=${writes}`);

let nz = 0, minR = 240, maxR = -1, minC = 320, maxC = -1;
for (let row = 0; row < 240; row++) for (let col = 0; col < 320; col++) {
  const off = row * 640 + col * 2;
  if (mem[0xd40000 + off] !== 0 || mem[0xd40000 + off + 1] !== 0) {
    nz++;
    if (row < minR) minR = row; if (row > maxR) maxR = row;
    if (col < minC) minC = col; if (col > maxC) maxC = col;
  }
}
console.log(`nz=${nz} bbox rows ${minR}-${maxR} cols ${minC}-${maxC}`);
if (nz > 0 && nz < 5000) {
  for (let row = minR - 1; row <= maxR + 1; row++) {
    let line = row.toString().padStart(3) + ' ';
    for (let col = minC - 1; col <= maxC + 1; col++) {
      const off = row * 640 + col * 2;
      line += (mem[0xd40000 + off] !== 0 || mem[0xd40000 + off + 1] !== 0) ? '#' : '.';
    }
    console.log(line);
  }
}
