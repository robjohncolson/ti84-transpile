#!/usr/bin/env node
// Probe: simulate post-HALT main loop resumption
// Strategy: boot, set keyboard IRQ, push 0x0019b5 (halt block) as return,
// run from 0x0019be directly and see what it does before halting again.

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

const p = createPeripheralBus({ trace: false, pllDelay: 2, timerMode: 'nmi', timerInterval: 200 });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// Boot
ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
console.log(`Boot halt at ${hex(ex.cpu.halted ? 0x0019b5 : 0, 6)}`);

// Setup keyboard + init flag (post-OS-init state)
mem[0xD177BA] = 0xFF;
mem[0xD0009B] |= 0x40;
p.keyboard.keyMatrix[1] = 0xFE; // ENTER
p.setKeyboardIRQ(true);
p.write(0x5006, 0x08);

// Wake CPU with a meaningful state
cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu.sp = 0xD1A87E;
cpu._iy = 0xD00080;

// Push 0x0019b5 (re-halt block) as return address — so when this "main loop"
// call returns, it goes back to the halt block
cpu.sp -= 3;
mem[cpu.sp] = 0xb5; mem[cpu.sp + 1] = 0x19; mem[cpu.sp + 2] = 0x00;

const blockHits = new Map();
const regionHits = new Map();
const trail = [];
let lcdControlWrites = 0;
let vramWrites = 0;
let lastPc = 0;

// Wrap mem writes so we can track VRAM activity
const origWrite8 = cpu.write8.bind(cpu);
cpu.write8 = function(addr, value) {
  if (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) vramWrites++;
  if (addr >= 0xE00000 && addr < 0xE00030) lcdControlWrites++;
  return origWrite8(addr, value);
};

const r = ex.runFrom(0x0019be, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 200,
  wakeFromHalt: { vector: 0x000066, mode: 'adl', returnPc: 0x0019be },
  onBlock: (pc, mode) => {
    const key = hex(pc);
    blockHits.set(key, (blockHits.get(key) || 0) + 1);
    const region = (pc >> 12) & 0xFFF;
    regionHits.set(region, (regionHits.get(region) || 0) + 1);
    trail.push(key);
    if (trail.length > 40) trail.shift();
    lastPc = pc;
  },
  onMissingBlock: (pc, mode) => {
    // silence missing-block logging — too many during exploration
  },
});

console.log(`\nResult: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Unique blocks: ${blockHits.size}`);
console.log(`VRAM writes: ${vramWrites}, LCD MMIO writes: ${lcdControlWrites}`);

let vramNz = 0;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) if (mem[i] !== 0) vramNz++;
console.log(`VRAM non-zero bytes: ${vramNz}`);
console.log(`LCD state:`, ex.lcdMmio);

console.log('\nTop 20 hot blocks:');
const hot = [...blockHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pc, count] of hot) {
  const pct = (count / r.steps * 100).toFixed(1);
  console.log(`  ${pc}  ${count.toString().padStart(6)}  ${pct}%`);
}

console.log('\nActive regions (4KB):');
const regions = [...regionHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [region, count] of regions) {
  console.log(`  0x${region.toString(16).padStart(3, '0')}xxx  ${count} blocks`);
}

console.log('\nLast 40 blocks before termination:');
for (const pc of trail) console.log(`  ${pc}`);
