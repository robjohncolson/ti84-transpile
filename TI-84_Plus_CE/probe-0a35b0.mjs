#!/usr/bin/env node
// Phase 31: investigate 0x0a35b0 — a small VRAM writer (238 writes / 11 blocks)
// from Survey v2. Tiny function that completes cleanly. What does it draw?

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
console.log(`After boot: mbase=${hex(cpu.mbase, 2)}`);
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

// Clear VRAM so we can see exactly what gets drawn
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;

// Snapshot for re-call
const snapMem = new Uint8Array(mem);
const snapRegs = {
  a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
  sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2,
  im: cpu.im, madl: cpu.madl, mbase: cpu.mbase,
};

function restore() {
  mem.set(snapMem);
  Object.assign(cpu, snapRegs);
  cpu._ix = snapRegs.ix; cpu._iy = snapRegs.iy;
  cpu.halted = false;
}

function call(label, regs) {
  restore();
  if (regs.a !== undefined) cpu.a = regs.a;
  if (regs.bc !== undefined) cpu.bc = regs.bc;
  if (regs.de !== undefined) cpu.de = regs.de;
  if (regs.hl !== undefined) cpu.hl = regs.hl;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  let vramWrites = 0;
  const writeAddrs = [];
  const origWrite = cpu.write8.bind(cpu);
  cpu.write8 = function(addr, value) {
    if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) {
      vramWrites++;
      if (writeAddrs.length < 50) writeAddrs.push({ addr, value });
    }
    return origWrite(addr, value);
  };

  const trail = [];
  const r = ex.runFrom(0x0a35b0, 'adl', {
    maxSteps: 1000,
    maxLoopIterations: 100,
    onBlock: (pc) => trail.push(`${hex(pc)} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)}`),
  });
  cpu.write8 = origWrite;

  console.log(`\n=== ${label} ===`);
  console.log(`Result: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
  console.log(`VRAM writes: ${vramWrites}`);
  console.log('Block trail:');
  for (const t of trail) console.log('  ' + t);
  if (writeAddrs.length > 0) {
    console.log('First 20 VRAM writes:');
    for (const w of writeAddrs.slice(0, 20)) {
      const off = w.addr - 0xD40000;
      const row = Math.floor(off / 640);
      const col = Math.floor((off % 640) / 2);
      console.log(`  ${hex(w.addr)}=${hex(w.value, 2)} (row=${row}, col=${col})`);
    }
  }

  // Find non-zero VRAM region
  let minR = 240, maxR = 0, minC = 320, maxC = 0;
  let nz = 0;
  for (let row = 0; row < 240; row++) {
    for (let col = 0; col < 320; col++) {
      const off = row * 640 + col * 2;
      if (mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0) {
        nz++;
        if (row < minR) minR = row;
        if (row > maxR) maxR = row;
        if (col < minC) minC = col;
        if (col > maxC) maxC = col;
      }
    }
  }
  console.log(`Non-zero pixels: ${nz}`);
  if (nz > 0) {
    console.log(`Bounding box: rows ${minR}-${maxR}, cols ${minC}-${maxC}`);
    console.log('ASCII render:');
    for (let row = Math.max(0, minR - 1); row <= Math.min(239, maxR + 1); row++) {
      let line = '';
      for (let col = Math.max(0, minC - 1); col <= Math.min(319, maxC + 1); col++) {
        const off = row * 640 + col * 2;
        const isOn = mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0;
        line += isOn ? '#' : '.';
      }
      console.log('  ' + line);
    }
  }
}

call('A=0', { a: 0 });
call('A=H', { a: 0x48 });
call('zero with HL=vram', { a: 0, hl: 0xD40000 });
