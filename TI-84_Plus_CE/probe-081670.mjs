#!/usr/bin/env node
// Phase 31: Deep-dive 0x081670 (jump-table[748]). Survey v2 saw 408 writes
// at maxSteps=300. Catalog probe at maxSteps=1000 saw 775 pixels in rows
// 55-209, cols 12-248 — a substantial UI element. Run with maxSteps=10000
// to see what it actually draws.

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

ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
console.log(`Setup done. mbase=${hex(cpu.mbase, 2)}`);

// Clear VRAM
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.a = 0; cpu.bc = 0; cpu.de = 0; cpu.hl = 0;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

console.log('Calling 0x081670 with maxSteps=20000...');
const start = Date.now();
const r = ex.runFrom(0x081670, 'adl', {
  maxSteps: 20000,
  maxLoopIterations: 500,
});
const elapsed = Date.now() - start;
console.log(`Result: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)} in ${elapsed}ms`);

// Render
let nz = 0, minR = 240, maxR = 0, minC = 320, maxC = 0;
const colors = new Map();
for (let row = 0; row < 240; row++) {
  for (let col = 0; col < 320; col++) {
    const off = row * 640 + col * 2;
    if (mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0) {
      nz++;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
      const c = (mem[0xD40000 + off] << 8) | mem[0xD40000 + off + 1];
      colors.set(c, (colors.get(c) || 0) + 1);
    }
  }
}
console.log(`\nNon-zero pixels: ${nz}`);
console.log(`Bounding box: rows ${minR}-${maxR} (${maxR-minR+1}), cols ${minC}-${maxC} (${maxC-minC+1})`);
console.log(`Colors: ${colors.size}`);
for (const [c, n] of [...colors.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10)) {
  console.log(`  0x${c.toString(16).padStart(4,'0')}: ${n}`);
}

// 4x downsampled render
console.log('\nFull screen (4x downsampled, # = pixel on):');
for (let row = 0; row < 240; row += 4) {
  let line = '';
  for (let col = 0; col < 320; col += 4) {
    let any = false;
    for (let dr = 0; dr < 4 && !any; dr++) {
      for (let dc = 0; dc < 4 && !any; dc++) {
        const off = (row + dr) * 640 + (col + dc) * 2;
        if (mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0) any = true;
      }
    }
    line += any ? '#' : '.';
  }
  console.log('  ' + line);
}
