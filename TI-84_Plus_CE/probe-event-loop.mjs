#!/usr/bin/env node
// Probe the OS event loop to see what blocks it executes during cycle 0
// and why it never reaches LCD write code.

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

// Wire callback + system flag + keyboard IRQ
mem[0xD02AD7] = 0xBE;
mem[0xD02AD8] = 0x19;
mem[0xD02AD9] = 0x00;
mem[0xD0009B] |= 0x40;
mem[0xD177BA] = 0xFF; // "deep init already done" flag — routes 0x001713 to return early
p.keyboard.keyMatrix[1] = 0xFE; // ENTER
p.setKeyboardIRQ(true);
p.write(0x5006, 0x08);

// Skip initial ISR — run the interesting one directly
console.log(`Pre-ISR port 0x5016 (masked status byte 2): ${hex(p.read(0x5016), 2)}`);
console.log(`Pre-ISR port 0x5006 (enable mask byte 2): ${hex(p.read(0x5006), 2)}`);

cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

const blockHits = new Map();
const regionHits = new Map();
const trail = [];
const TRAIL_SIZE = 30;
let blockCount = 0;
let prevPc = -1;
const predecessorsOf001c33 = new Map();
const firstEntryTrail = [];
let firstEntryDone = false;

const result = ex.runFrom(0x000038, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 200,
  onBlock: (pc, mode) => {
    blockCount++;
    const key = hex(pc);
    blockHits.set(key, (blockHits.get(key) || 0) + 1);
    const region = (pc >> 12) & 0xFFF;
    regionHits.set(region, (regionHits.get(region) || 0) + 1);
    trail.push(key);
    if (trail.length > TRAIL_SIZE) trail.shift();

    if (pc === 0x001c33) {
      const pk = hex(prevPc);
      predecessorsOf001c33.set(pk, (predecessorsOf001c33.get(pk) || 0) + 1);
    }

    if (!firstEntryDone) {
      firstEntryTrail.push(`${hex(pc, 6)}:${mode} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl, 6)} DE=${hex(cpu.de, 6)} BC=${hex(cpu.bc, 6)} madl=${cpu.madl}`);
      if (pc === 0x001c33) {
        firstEntryDone = true;
      }
      if (firstEntryTrail.length > 60) firstEntryTrail.shift();
    }

    prevPc = pc;
  },
});

console.log(`Cycle 0: ${result.steps} steps → ${result.termination} at ${hex(result.lastPc)}`);
console.log(`Unique blocks: ${blockHits.size}, total block hits: ${blockCount}`);

console.log('\nTop 20 hot blocks:');
const hot = [...blockHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pc, count] of hot) {
  const pct = (count / blockCount * 100).toFixed(1);
  console.log(`  ${pc}  ${count.toString().padStart(6)}  ${pct}%`);
}

console.log('\nActive regions (4KB):');
const regions = [...regionHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [region, count] of regions) {
  console.log(`  0x${region.toString(16).padStart(3, '0')}xxx  ${count} blocks`);
}

console.log('\nLast 30 blocks before termination:');
for (const pc of trail) console.log(`  ${pc}`);

console.log('\nPredecessors of 0x001c33 (who enters the loop):');
const preds = [...predecessorsOf001c33.entries()].sort((a, b) => b[1] - a[1]);
for (const [pc, count] of preds) console.log(`  ${pc}  ${count}`);

console.log('\nFirst path leading to 0x001c33 (with register state):');
for (const step of firstEntryTrail) console.log(`  ${step}`);

// Check VRAM + LCD state
let vramNz = 0;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) vramNz++;
}
console.log(`\nVRAM non-zero: ${vramNz} bytes`);
console.log(`LCD MMIO state:`, ex.lcdMmio);
console.log(`CPU: A=${hex(cpu.a, 2)} HL=${hex(cpu.hl, 6)} DE=${hex(cpu.de, 6)} BC=${hex(cpu.bc, 6)} IY=${hex(cpu._iy, 6)}`);
console.log(`Keyboard state: matrix=[${[...p.keyboard.keyMatrix].map(b => b.toString(16)).join(',')}]`);
console.log(`Port 0x5006 (enable mask): ${hex(p.read(0x5006), 2)}`);
console.log(`Port 0x5014 (raw status): ${hex(p.read(0x5014), 2)}`);
console.log(`Port 0x5016 (masked status): ${hex(p.read(0x5016), 2)}`);
