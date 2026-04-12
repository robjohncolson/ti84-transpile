#!/usr/bin/env node
// Try to call the OS character print routine 0x0059c6 and see if it draws a glyph to VRAM.
// The routine takes a character code in A and draws it to the LCD.

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

// Boot
ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

// Set up for the print call: IY=system vars, cursor/row positions in RAM
cpu._iy = 0xD00080;

// Default cursor position (row=0, col=0)
mem[0xD00595] = 0; // curCol
mem[0xD00596] = 0; // curRow
mem[0xD005A0] = 0; // row multiplier input

// Clear a flag at (iy+5) to take the normal path (not the special big-font path)
mem[0xD00080 + 5] = 0x00;

// Call 0x0059c6 with A = 'H' (0x48)
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.a = 0x48; // 'H'
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

console.log(`Calling 0x0059c6 with A=0x48 ('H')...`);
const r = ex.runFrom(0x0059c6, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 500,
  onMissingBlock: (pc, mode) => console.log(`  MISSING: ${hex(pc)}:${mode}`),
});

console.log(`\nResult: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);

// Check VRAM
let vramNz = 0;
let firstNz = -1;
let lastNz = -1;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) {
    vramNz++;
    if (firstNz < 0) firstNz = i;
    lastNz = i;
  }
}
console.log(`VRAM non-zero: ${vramNz} bytes`);
if (vramNz > 0) {
  console.log(`  First non-zero: ${hex(firstNz)}`);
  console.log(`  Last non-zero: ${hex(lastNz)}`);
  // Compute row/col from VRAM offset
  const off = firstNz - 0xD40000;
  const row = Math.floor(off / (320 * 2));
  const col = Math.floor((off % (320 * 2)) / 2);
  console.log(`  First pixel at: row=${row}, col=${col}`);
}
console.log(`CPU: A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`Missing blocks: ${[...(r.missingBlocks || [])].slice(0, 5).join(', ')}`);
