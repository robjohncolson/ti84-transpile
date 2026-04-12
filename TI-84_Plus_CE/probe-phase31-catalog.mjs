#!/usr/bin/env node
// Phase 31: Catalog all small-VRAM-writer candidates from Survey v2.
// Tests each with HL=0xD40000 (the "draw at HL" calling convention discovered
// from 0x0a35b0) and captures bounding box + pixel pattern for each.

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

console.log(`After boot+init: mbase=${hex(cpu.mbase, 2)}, initFlag=${hex(mem[0xD177BA], 2)}`);

// Snapshot RAM only — VRAM is the variable we want to vary
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
  // Clear VRAM
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;
}

function describeVram() {
  let nz = 0, minR = 240, maxR = 0, minC = 320, maxC = 0;
  const colors = new Map();
  for (let row = 0; row < 240; row++) {
    for (let col = 0; col < 320; col++) {
      const off = row * 640 + col * 2;
      const b1 = mem[0xD40000 + off];
      const b2 = mem[0xD40000 + off + 1];
      if (b1 !== 0 || b2 !== 0) {
        nz++;
        if (row < minR) minR = row;
        if (row > maxR) maxR = row;
        if (col < minC) minC = col;
        if (col > maxC) maxC = col;
        const c = (b1 << 8) | b2;
        colors.set(c, (colors.get(c) || 0) + 1);
      }
    }
  }
  return { nz, minR, maxR, minC, maxC, colors };
}

function probe(label, target) {
  console.log(`\n=== ${label} (${hex(target)}) ===`);

  // Try several calling conventions
  const conventions = [
    { name: 'no args', regs: {} },
    { name: 'HL=VRAM', regs: { hl: 0xD40000 } },
    { name: 'A=H', regs: { a: 0x48 } },
    { name: 'A=H + HL=VRAM', regs: { a: 0x48, hl: 0xD40000 } },
    { name: 'IX=VRAM', regs: { ix: 0xD40000 } },
    { name: 'IY=VRAM', regs: { iy: 0xD40000 } },
  ];

  let bestNz = 0;
  let bestConvention = null;
  let bestDesc = null;

  for (const c of conventions) {
    restore();
    if (c.regs.a !== undefined) cpu.a = c.regs.a;
    if (c.regs.bc !== undefined) cpu.bc = c.regs.bc;
    if (c.regs.de !== undefined) cpu.de = c.regs.de;
    if (c.regs.hl !== undefined) cpu.hl = c.regs.hl;
    if (c.regs.ix !== undefined) cpu._ix = c.regs.ix;
    if (c.regs.iy !== undefined) cpu._iy = c.regs.iy;
    cpu.sp -= 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

    let blocks = 0;
    let r;
    try {
      r = ex.runFrom(target, 'adl', {
        maxSteps: 1000,
        maxLoopIterations: 200,
        onBlock: () => blocks++,
      });
    } catch (e) {
      console.log(`  ${c.name}: ERROR ${e.message.slice(0, 60)}`);
      continue;
    }

    const desc = describeVram();
    const flag = desc.nz > 0 ? '*' : ' ';
    console.log(`  ${flag} ${c.name.padEnd(20)} → ${r.termination.padEnd(13)} ${blocks} blk, ${desc.nz} px${desc.nz > 0 ? ` rows ${desc.minR}-${desc.maxR} cols ${desc.minC}-${desc.maxC}` : ''}`);

    if (desc.nz > bestNz) {
      bestNz = desc.nz;
      bestConvention = c;
      bestDesc = desc;
    }
  }

  // For the best convention, render the result
  if (bestNz > 0 && bestNz < 1000) {
    restore();
    const c = bestConvention;
    if (c.regs.a !== undefined) cpu.a = c.regs.a;
    if (c.regs.bc !== undefined) cpu.bc = c.regs.bc;
    if (c.regs.de !== undefined) cpu.de = c.regs.de;
    if (c.regs.hl !== undefined) cpu.hl = c.regs.hl;
    if (c.regs.ix !== undefined) cpu._ix = c.regs.ix;
    if (c.regs.iy !== undefined) cpu._iy = c.regs.iy;
    cpu.sp -= 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    ex.runFrom(target, 'adl', { maxSteps: 1000, maxLoopIterations: 200 });

    const d = describeVram();
    if (d.maxR - d.minR < 30 && d.maxC - d.minC < 80) {
      console.log(`  Render (${c.name}, ${d.nz} pixels):`);
      for (let row = Math.max(0, d.minR - 1); row <= Math.min(239, d.maxR + 1); row++) {
        let line = '';
        for (let col = Math.max(0, d.minC - 1); col <= Math.min(319, d.maxC + 1); col++) {
          const off = row * 640 + col * 2;
          const isOn = mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0;
          line += isOn ? '#' : '.';
        }
        console.log(`    ${line}`);
      }
    }
    if (d.colors.size <= 5) {
      console.log(`  Colors: ${[...d.colors.entries()].map(([c, n]) => `0x${c.toString(16).padStart(4,'0')}(${n})`).join(', ')}`);
    }
  }
}

const candidates = [
  { addr: 0x0a35b0, label: 'horiz-line primitive (known)' },
  { addr: 0x07fae7, label: 'jump-table[?]' },
  { addr: 0x07fd3a, label: 'jump-table[?]' },
  { addr: 0x0a2854, label: 'jump-table[468]' },
  { addr: 0x0976ed, label: 'jump-table[636]' },
  { addr: 0x097ac8, label: 'jump-table[805] (was diagonal)' },
  { addr: 0x08a850, label: 'jump-table[839]' },
  { addr: 0x081670, label: 'jump-table[748]' },
  { addr: 0x06f274, label: 'jump-table[715]' },
];

for (const { addr, label } of candidates) {
  probe(label, addr);
}
