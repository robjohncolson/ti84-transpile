#!/usr/bin/env node
// Deep investigation of 0x097ac8 — the 2× VRAM writer discovered in the
// overnight survey. Calls it with various inputs and captures the rendered
// VRAM state as ASCII art.

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

const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// Boot + OS init
ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

// Clear VRAM so we can see exactly what this function draws
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;

// Snapshot state for re-calls
const snapMem = new Uint8Array(mem);
const snapRegs = {
  a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
  sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2, im: cpu.im, madl: cpu.madl,
};

function restore() {
  mem.set(snapMem);
  for (const k of Object.keys(snapRegs)) {
    if (k === 'ix') cpu._ix = snapRegs.ix;
    else if (k === 'iy') cpu._iy = snapRegs.iy;
    else cpu[k] = snapRegs[k];
  }
  cpu.halted = false;
}

function callWith(regs = {}, label = '') {
  restore();
  if (regs.a !== undefined) cpu.a = regs.a;
  if (regs.bc !== undefined) cpu.bc = regs.bc;
  if (regs.de !== undefined) cpu.de = regs.de;
  if (regs.hl !== undefined) cpu.hl = regs.hl;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  let vramWrites = 0;
  const byteCounts = new Map();
  const origWrite = cpu.write8.bind(cpu);
  cpu.write8 = function(addr, value) {
    if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) {
      vramWrites++;
      byteCounts.set(value, (byteCounts.get(value) || 0) + 1);
    }
    return origWrite(addr, value);
  };

  const regionHits = new Set();
  let blockCount = 0;
  const r = ex.runFrom(0x097ac8, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 1000,
    onBlock: (pc) => { blockCount++; regionHits.add((pc >> 16) & 0xFF); },
  });

  cpu.write8 = origWrite;

  // Gather non-zero VRAM stats
  let nz = 0;
  let firstNz = -1, lastNz = -1;
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
    if (mem[i] !== 0) {
      nz++;
      if (firstNz < 0) firstNz = i;
      lastNz = i;
    }
  }

  console.log(`\n=== Call ${label} (A=${hex(regs.a ?? 0, 2)}, BC=${hex(regs.bc ?? 0)}, DE=${hex(regs.de ?? 0)}, HL=${hex(regs.hl ?? 0)}) ===`);
  console.log(`  Result: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
  console.log(`  Blocks visited: ${blockCount}`);
  console.log(`  Regions: ${[...regionHits].sort().map(r => '0x'+r.toString(16).padStart(2,'0')+'xxxx').join(', ')}`);
  console.log(`  VRAM writes: ${vramWrites}, non-zero after: ${nz}`);
  if (nz > 0) {
    console.log(`  VRAM range: ${hex(firstNz)} → ${hex(lastNz)}`);
  }
  console.log(`  Unique byte values written: ${byteCounts.size}`);
  if (byteCounts.size <= 10) {
    for (const [val, count] of [...byteCounts.entries()].sort((a,b) => b[1]-a[1])) {
      console.log(`    0x${val.toString(16).padStart(2,'0')}: ${count} writes`);
    }
  }

  return { vramWrites, nz, byteCounts, blocks: blockCount, regions: [...regionHits] };
}

// Try different inputs
callWith({ a: 0x00 }, 'A=0 (zero)');
callWith({ a: 0x48 }, 'A=H');
callWith({ a: 0xFF }, 'A=0xFF');
callWith({ a: 0x00, bc: 0x0000FF }, 'BC=ff (color?)');
callWith({ a: 0x00, hl: 0xD40000 }, 'HL=VRAM base');

// Full render dump for the most interesting call — A=0
restore();
cpu.a = 0;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x097ac8, 'adl', { maxSteps: 100000, maxLoopIterations: 1000 });

// Find where NON-WHITE pixels cluster — those are all the drawn features
// on the mostly-white background.
const drawnPixels = [];
for (let row = 0; row < 240; row++) {
  for (let col = 0; col < 320; col++) {
    const off = row * 640 + col * 2;
    const b1 = mem[0xD40000 + off];
    const b2 = mem[0xD40000 + off + 1];
    if (!(b1 === 0xFF && b2 === 0xFF)) {
      drawnPixels.push({ row, col, b1, b2 });
    }
  }
}
console.log(`\n\n${drawnPixels.length} non-white pixels in the rendered screen`);
const zeroPixels = drawnPixels.filter(p => p.b1 === 0 && p.b2 === 0);
console.log(`${zeroPixels.length} are pure black (0x0000)`);
if (drawnPixels.length > 0) {
  let minR = 240, maxR = 0, minC = 320, maxC = 0;
  for (const p of drawnPixels) {
    if (p.row < minR) minR = p.row;
    if (p.row > maxR) maxR = p.row;
    if (p.col < minC) minC = p.col;
    if (p.col > maxC) maxC = p.col;
  }
  console.log(`Non-white bounding box: rows ${minR}-${maxR}, cols ${minC}-${maxC}`);

  // ASCII render of the entire screen (down-sampled if large), showing non-white pixels
  // We'll scale down the 320x240 screen to a readable size — divide by 4
  console.log(`\nFull screen (4x downsampled, non-white=#):`);
  for (let row = 0; row < 240; row += 4) {
    let line = '';
    for (let col = 0; col < 320; col += 4) {
      let any = false;
      for (let dr = 0; dr < 4 && !any; dr++) {
        for (let dc = 0; dc < 4 && !any; dc++) {
          const r = row + dr, c = col + dc;
          if (r >= 240 || c >= 320) continue;
          const off = r * 640 + c * 2;
          if (!(mem[0xD40000 + off] === 0xFF && mem[0xD40000 + off + 1] === 0xFF)) any = true;
        }
      }
      line += any ? '#' : '.';
    }
    console.log('  ' + line);
  }

  // Now a full-res render of JUST the bounding box
  if (maxR - minR < 50 && maxC - minC < 200) {
    console.log(`\nFull-res render of bounded region (non-white=#):`);
    for (let row = Math.max(0, minR - 1); row <= Math.min(239, maxR + 1); row++) {
      let line = '';
      for (let col = Math.max(0, minC - 1); col <= Math.min(319, maxC + 1); col++) {
        const off = row * 640 + col * 2;
        const isWhite = mem[0xD40000 + off] === 0xFF && mem[0xD40000 + off + 1] === 0xFF;
        line += isWhite ? '.' : '#';
      }
      console.log('  ' + line);
    }
  }
}

// Top 10 colors used
console.log('\n\nTop 16 VRAM color bytes (from final state):');
const colorCounts = new Map();
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  colorCounts.set(mem[i], (colorCounts.get(mem[i]) || 0) + 1);
}
for (const [val, count] of [...colorCounts.entries()].sort((a,b) => b[1] - a[1])) {
  console.log(`  0x${val.toString(16).padStart(2,'0')}: ${count} bytes`);
}
