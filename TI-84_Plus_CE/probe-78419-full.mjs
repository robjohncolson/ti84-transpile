#!/usr/bin/env node
// Phase 36b: give 0x078419 more steps to complete and dump the full render.

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

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// Boot + OS init
ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
const init = ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
console.log(`OS init: ${init.steps} steps → ${init.termination}`);

// Clear VRAM
for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_SIZE; i++) mem[i] = 0x00;

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = 0xD00080;
cpu.sp = 0xD1A87E - 12;
for (let i = 0; i < 12; i++) mem[cpu.sp + i] = 0xFF;
cpu.f = 0x40;

let blocks = 0;
let vramWrites = 0;
let lastVramWriteStep = 0;
const origWrite8 = cpu.write8.bind(cpu);
cpu.write8 = function (addr, value) {
  if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) {
    vramWrites++;
    lastVramWriteStep = blocks;
  }
  return origWrite8(addr, value);
};

const r = ex.runFrom(0x078419, 'adl', {
  maxSteps: 2000000,
  maxLoopIterations: 2000,
  onBlock: () => { blocks++; },
});
console.log(`Run: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Blocks=${blocks}, VRAM writes=${vramWrites}, last write at block ${lastVramWriteStep}`);

// Compute bbox
let minR = 240, maxR = -1, minC = 320, maxC = -1, nz = 0;
for (let row = 0; row < 240; row++) {
  for (let col = 0; col < 320; col++) {
    const off = row * 640 + col * 2;
    if (mem[VRAM_BASE + off] !== 0 || mem[VRAM_BASE + off + 1] !== 0) {
      nz++;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }
  }
}
console.log(`Non-zero: ${nz}`);
console.log(`bbox: rows ${minR}-${maxR} × cols ${minC}-${maxC}`);

// Render the full bbox, one row per line, scaled down 2:1 if needed
const r0 = Math.max(0, minR - 1);
const r1 = Math.min(239, maxR + 1);
const c0 = Math.max(0, minC - 1);
const c1 = Math.min(319, maxC + 1);
console.log(`\nFull bbox render (${r1 - r0 + 1} rows × ${c1 - c0 + 1} cols):`);
for (let row = r0; row <= r1; row++) {
  let line = '';
  for (let col = c0; col <= c1; col++) {
    const off = row * 640 + col * 2;
    line += (mem[VRAM_BASE + off] !== 0 || mem[VRAM_BASE + off + 1] !== 0) ? '#' : '.';
  }
  // Trim if > 160 chars
  console.log(row.toString().padStart(3) + ' ' + (line.length > 160 ? line.slice(0, 160) : line));
}
