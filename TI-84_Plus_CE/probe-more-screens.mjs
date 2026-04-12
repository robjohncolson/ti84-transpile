#!/usr/bin/env node
// Phase 36: probe more screen-render entry points found via string-anchor search.
// Same pattern as probe-mode-screen.mjs: boot → OS init → runFrom(candidate)
// with sentinel stack, count VRAM writes and bbox.
//
// Anchors used:
//   0x0778b4 "Plot1" (stat plot editor / Y= screen) → LD HL at 0x784ad
//     → function 0x78419 → parent 0x782fd → dispatcher 0x77e9d (zero callers)
//
//   0x03ed08 "MATRX" (VARS menu label table) → no direct LD HL xrefs
//     → adjacent labels: EQU, GDB, PIC, PRGM — probably VARS menu
//
//   0x07b992 "STAT" → single xref at 0x07b886 prev=0x07 (data table entry)
//   0x07b9e6 "ZOOM" → single xref at 0x07b8ad prev=0x07 (data table entry)
//     These two are in a shared "menu-bar names" table starting around 0x07b886,
//     with offset-based menu entry records. Scanning the xrefs might show the
//     menu-draw function.

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

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

function freshEnv() {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  return { ex, cpu: ex.cpu, mem, p };
}

function bootAndInit(env) {
  const { ex, cpu, mem } = env;
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
}

function bbox(mem) {
  let minR = 240, maxR = -1, minC = 320, maxC = -1, nz = 0;
  for (let row = 0; row < 240; row++) {
    for (let col = 0; col < 320; col++) {
      const off = row * 640 + col * 2;
      if (mem[VRAM_BASE + off] !== 0 || mem[VRAM_BASE + off + 1] !== 0) {
        nz++;
        if (row < minR) minR = row;
        if (row > maxR) maxR = row;
        if (col < minC) minC = col;
        if (col > maxC) maxC = col;
      }
    }
  }
  return { nz, minR, maxR, minC, maxC };
}

function asciiArt(mem, b, maxWidth = 120, maxRows = 30) {
  if (b.maxR < 0) return [];
  const lines = [];
  const r0 = Math.max(0, b.minR - 1);
  const r1 = Math.min(239, b.maxR + 1);
  const c0 = Math.max(0, b.minC - 1);
  const c1 = Math.min(319, Math.min(b.maxC + 1, c0 + maxWidth - 1));
  for (let row = r0; row <= r1; row++) {
    let line = '';
    for (let col = c0; col <= c1; col++) {
      const off = row * 640 + col * 2;
      line += (mem[VRAM_BASE + off] !== 0 || mem[VRAM_BASE + off + 1] !== 0) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines;
}

const candidates = [
  // From Plot1 xref chain
  { addr: 0x077e9d, name: 'Plot dispatcher top (77e9d, zero callers)' },
  { addr: 0x0782fd, name: 'Plot screen parent (782fd)' },
  { addr: 0x078419, name: 'Plot draw inner (78419, contains LD HL Plot1)' },
  // STAT PLOT menu string table area
  { addr: 0x07b886, name: 'Menu-bar table area (7b886)' },
  // Y= editor variations — guess around 0x062xxx area of Xmin/Xmax strings
  { addr: 0x06281f, name: 'Y= area near Y1 string' },
  // From VARS MATRX label — the only xref at 0x3ecb3 may be a data table entry,
  // not useful. Try the string address directly (data, will fail) — skip.
];

for (const c of candidates) {
  console.log('\n' + '='.repeat(70));
  console.log(`${c.name}  —  entry=${hex(c.addr)}`);
  console.log('='.repeat(70));
  const env = freshEnv();
  bootAndInit(env);
  const { ex, cpu, mem } = env;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_SIZE; i++) mem[i] = 0x00;

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E - 9;
  for (let i = 0; i < 9; i++) mem[cpu.sp + i] = 0xFF;
  cpu.f = 0x40; // Z flag set — so RET NZ at function entry is not taken

  let blocks = 0;
  let vramWrites = 0;
  const regions = new Map();
  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = function (addr, value) {
    if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) vramWrites++;
    return origWrite8(addr, value);
  };

  const r = ex.runFrom(c.addr, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      blocks++;
      const region = (pc >> 16) & 0xFF;
      regions.set(region, (regions.get(region) || 0) + 1);
    },
  });

  const b = bbox(mem);
  console.log(`  ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
  console.log(`  blocks=${blocks} vramWrites=${vramWrites} nonZero=${b.nz}`);
  if (b.maxR >= 0) {
    console.log(`  bbox: rows ${b.minR}-${b.maxR} × cols ${b.minC}-${b.maxC}`);
  }
  const topR = [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`  regions: ${topR.map(([k, v]) => `0x${k.toString(16).padStart(2,'0')}xxxx:${v}`).join(' ')}`);
  if (b.nz > 200 && b.nz < 40000) {
    const art = asciiArt(mem, b);
    console.log(`  render (${art.length} rows × ${art[0]?.length || 0} cols):`);
    for (const line of art.slice(0, 25)) console.log('    ' + line);
    if (art.length > 25) console.log(`    ... (${art.length - 25} more rows)`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('Phase 36 probe complete.');
