#!/usr/bin/env node
// Deep investigation of 0x045d26 — the 9-region deep executor from the
// overnight survey. It sets HL=0xd40000, pushes it, clears A, then calls
// 0x046b4c. Looks like it might be a "draw full screen with filler" routine.

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

// Clear VRAM
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;

// Call 0x045d26 with longer budget
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

let vramWrites = 0;
const origWrite = cpu.write8.bind(cpu);
cpu.write8 = function(addr, value) {
  if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) vramWrites++;
  return origWrite(addr, value);
};

const regionHits = new Set();
let blockCount = 0;
const blockHits = new Map();

const r = ex.runFrom(0x045d26, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 1000,
  onBlock: (pc) => {
    blockCount++;
    regionHits.add((pc >> 16) & 0xFF);
    const key = hex(pc);
    blockHits.set(key, (blockHits.get(key) || 0) + 1);
  },
});
cpu.write8 = origWrite;

console.log(`Result: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Blocks visited: ${blockCount}`);
console.log(`Unique blocks: ${blockHits.size}`);
console.log(`Regions: ${[...regionHits].sort().map(r => '0x'+r.toString(16).padStart(2,'0')+'xxxx').join(', ')}`);
console.log(`VRAM writes: ${vramWrites}`);

// Count VRAM colors
const colorCounts = new Map();
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  colorCounts.set(mem[i], (colorCounts.get(mem[i]) || 0) + 1);
}
console.log(`\nTop 10 VRAM byte values:`);
for (const [val, count] of [...colorCounts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  0x${val.toString(16).padStart(2,'0')}: ${count} bytes`);
}

// Count non-default pixels (assume default is the most common byte value)
const sorted = [...colorCounts.entries()].sort((a,b) => b[1] - a[1]);
const dominantByte = sorted[0][0];
let nonDominant = 0;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== dominantByte) nonDominant++;
}
console.log(`\nDominant byte: 0x${dominantByte.toString(16).padStart(2,'0')} (${sorted[0][1]} bytes)`);
console.log(`Non-dominant bytes: ${nonDominant}`);

// 4x downsampled view
console.log(`\nFull screen (4x downsampled, non-dominant=#):`);
for (let row = 0; row < 240; row += 4) {
  let line = '';
  for (let col = 0; col < 320; col += 4) {
    let any = false;
    for (let dr = 0; dr < 4 && !any; dr++) {
      for (let dc = 0; dc < 4 && !any; dc++) {
        const off = (row + dr) * 640 + (col + dc) * 2;
        if (mem[0xD40000 + off] !== dominantByte || mem[0xD40000 + off + 1] !== dominantByte) any = true;
      }
    }
    line += any ? '#' : '.';
  }
  console.log('  ' + line);
}

// Top 20 most-visited blocks
console.log(`\nTop 20 hot blocks:`);
const hot = [...blockHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pc, count] of hot) {
  console.log(`  ${pc}  ${count.toString().padStart(6)}`);
}
