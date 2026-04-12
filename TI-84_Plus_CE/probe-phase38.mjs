#!/usr/bin/env node
// Phase 38: probe more screen-render entries found via string-anchor search.
// Candidates:
//   0x08aab3  — starts with LD HL, 0x08aa8e; CALL 0x08c782 — TABLE SETUP area
//   0x09e3b4  — zero callers, starts with BIT 0, (IY+9); JP NZ, 0x08aad9
//               (dispatches into the same 0x08aaxx region)
//   0x096e22  — function enclosing 0x96ebe (has 5 callers)
//   0x020ac0  — JP target from 0x96e22 (possibly the top-level dispatch)
//   0x0b8c11  — another JP target

import fs from 'node:fs';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const romBytes = fs.readFileSync('ROM.rom');
const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

function freshRun(entry, mode, maxSteps = 500000) {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;

  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0;

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E - 12;
  for (let i = 0; i < 12; i++) mem[cpu.sp + i] = 0xFF;
  cpu.f = 0x40;

  let blocks = 0, vramWrites = 0;
  const regions = new Map();
  const w = cpu.write8.bind(cpu);
  cpu.write8 = function (addr, value) {
    if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) vramWrites++;
    return w(addr, value);
  };
  const r = ex.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations: 2000,
    onBlock: (pc) => {
      blocks++;
      const region = (pc >> 16) & 0xFF;
      regions.set(region, (regions.get(region) || 0) + 1);
    },
  });

  let nz = 0, minR = 240, maxR = -1, minC = 320, maxC = -1;
  for (let row = 0; row < 240; row++) for (let col = 0; col < 320; col++) {
    const off = row * 640 + col * 2;
    if (mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0) {
      nz++;
      if (row < minR) minR = row; if (row > maxR) maxR = row;
      if (col < minC) minC = col; if (col > maxC) maxC = col;
    }
  }
  const topR = [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { r, blocks, vramWrites, nz, minR, maxR, minC, maxC, topR, mem };
}

// Phase 39b: candidates from (0xd00824) dispatch table (72 sites, 45 targets)
const candidates = [
  { addr: 0x085707, name: '85707' },
  { addr: 0x08574b, name: '8574b' },
  { addr: 0x0857ea, name: '857ea' },
  { addr: 0x08582a, name: '8582a' },
  { addr: 0x085954, name: '85954' },
  { addr: 0x087508, name: '87508' },
  { addr: 0x087560, name: '87560' },
  { addr: 0x087957, name: '87957' },
  { addr: 0x087b89, name: '87b89' },
  { addr: 0x0885ff, name: '885ff' },
  { addr: 0x088805, name: '88805' },
  { addr: 0x0ba71f, name: 'ba71f' },
  { addr: 0x0ba82a, name: 'ba82a' },
  { addr: 0x0ac69f, name: 'ac69f' },
  { addr: 0x074dff, name: '74dff' },
];

for (const c of candidates) {
  console.log('\n' + '='.repeat(68));
  console.log(`${c.name}  —  ${hex(c.addr)}`);
  console.log('='.repeat(68));
  const res = freshRun(c.addr, 'adl', 300000);
  console.log(`  ${res.r.steps} steps → ${res.r.termination} at ${hex(res.r.lastPc)}`);
  console.log(`  blocks=${res.blocks} vramWrites=${res.vramWrites} nonZero=${res.nz}`);
  if (res.maxR >= 0) {
    console.log(`  bbox: rows ${res.minR}-${res.maxR} × cols ${res.minC}-${res.maxC}`);
  }
  console.log(`  regions: ${res.topR.map(([k, v]) => `0x${k.toString(16).padStart(2,'0')}xxxx:${v}`).join(' ')}`);
  if (res.nz > 200 && res.nz < 30000) {
    // ascii art (compact)
    const r0 = Math.max(0, res.minR);
    const r1 = Math.min(239, res.maxR);
    const c0 = Math.max(0, res.minC);
    const c1 = Math.min(319, res.maxC);
    console.log(`  render:`);
    for (let row = r0; row <= r1; row++) {
      let line = '';
      for (let col = c0; col <= c1; col++) {
        const off = row * 640 + col * 2;
        line += (res.mem[0xD40000 + off] !== 0 || res.mem[0xD40000 + off + 1] !== 0) ? '#' : '.';
      }
      if (line.length > 160) line = line.slice(0, 160);
      console.log('    ' + line);
      if (row - r0 > 40) { console.log('    ...'); break; }
    }
  }
}
