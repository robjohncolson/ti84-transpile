#!/usr/bin/env node
// Test each jump-table target from index 250 to 280, log timing per call.
// Find which one is slow.

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

const RAM_BASE = 0xD00000;
const RAM_END = 0xE00000;
const snapRam = new Uint8Array(mem.slice(RAM_BASE, RAM_END));
const snapRegs = {
  a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
  sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2,
  im: cpu.im, madl: cpu.madl, mbase: cpu.mbase,
};

function restore() {
  mem.set(snapRam, RAM_BASE);
  Object.assign(cpu, snapRegs);
  cpu._ix = snapRegs.ix; cpu._iy = snapRegs.iy;
  cpu.halted = false;
}

console.log(`mbase=${hex(cpu.mbase, 2)}`);
console.log();

for (let i = 245; i < 280; i++) {
  const slotAddr = 0x020104 + i * 4;
  const target = romBytes[slotAddr + 1] | (romBytes[slotAddr + 2] << 8) | (romBytes[slotAddr + 3] << 16);
  restore();
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  const start = Date.now();
  let blocks = 0;
  const r = ex.runFrom(target, 'adl', {
    maxSteps: 300,
    maxLoopIterations: 100,
    onBlock: () => blocks++,
  });
  const elapsed = Date.now() - start;
  const flag = elapsed > 100 ? ' SLOW' : '';
  console.log(`[${i}] ${hex(target)} → ${r.termination} (${r.steps} steps, ${blocks} blocks) in ${elapsed}ms${flag}`);
}
