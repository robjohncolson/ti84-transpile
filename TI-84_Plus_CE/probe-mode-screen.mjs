#!/usr/bin/env node
// Phase 34: call the MODE screen render chain directly after boot + OS init.
// Strings found by anchor search:
//   0x029139 = "RADIAN"  (MODE option-label table)
//   0x029132 = "DEGREE"
// Xref chain from RADIAN label:
//   0x0296f8 (LD HL, 0x029139) is inside function 0x0296dd (MODE inner helper)
//   0x0296dd is called from 0x029683 / 0x296ad, both inside 0x029610
//   0x029610 is called from 0x029441 inside 0x0293ea
//   0x0293ea is called from 0x040b16 inside 0x04082f — the top of the shell
//     coroutine that pops a callback off the stack and installs it at 0xD02AD7
//     (classic shell screen pattern)
//
// Try each candidate as a runFrom entry after boot+OS init, with a sentinel
// stack frame. Report VRAM delta. The one that renders the most cells is the
// closest-to-the-top working entry point.

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

function bootAndInit(env, silent = false) {
  const { ex, cpu, mem } = env;
  const bootR = ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  if (!silent) console.log(`  boot: ${bootR.steps} steps → ${bootR.termination} mbase=${hex(cpu.mbase, 2)}`);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E; cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  const initR = ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  if (!silent) console.log(`  os init: ${initR.steps} steps → ${initR.termination}`);
}

function countVramNz(mem) {
  let nz = 0;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_SIZE; i++) if (mem[i] !== 0) nz++;
  return nz;
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

function asciiArt(mem, b) {
  if (b.maxR < 0) return [];
  const lines = [];
  const r0 = Math.max(0, b.minR - 1);
  const r1 = Math.min(239, b.maxR + 1);
  const c0 = Math.max(0, b.minC - 1);
  const c1 = Math.min(319, b.maxC + 1);
  for (let row = r0; row <= r1; row++) {
    let line = '';
    for (let col = c0; col <= c1; col++) {
      const off = row * 640 + col * 2;
      const on = mem[VRAM_BASE + off] !== 0 || mem[VRAM_BASE + off + 1] !== 0;
      line += on ? '#' : '.';
    }
    lines.push(line);
  }
  return lines;
}

const candidates = [
  { addr: 0x04082f, name: 'MODE shell coroutine (top)', stackPrep: (cpu, mem) => {
    // Function pops DE (return addr) then HL (callback to install). We supply
    // two sentinels so the pops succeed and LD (0xD02AD7), HL stores 0xFFFFFF.
    cpu.sp = 0xD1A87E - 6;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    mem[cpu.sp + 3] = 0xFF; mem[cpu.sp + 4] = 0xFF; mem[cpu.sp + 5] = 0xFF;
    // Also needs IX/IY to be pushable (function does POP IY; POP IX mid-way)
    // Add two more sentinels below that.
    cpu.sp -= 6;
    for (let i = 0; i < 6; i++) mem[cpu.sp + i] = 0xFF;
  }},
  { addr: 0x0293ea, name: 'MODE body (depth 0)', stackPrep: (cpu, mem) => {
    cpu.sp = 0xD1A87E - 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  }},
  { addr: 0x029610, name: 'MODE field-row renderer', stackPrep: (cpu, mem) => {
    cpu.sp = 0xD1A87E - 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  }},
  { addr: 0x0296dd, name: 'MODE helper (RADIAN/DEGREE row)', stackPrep: (cpu, mem) => {
    cpu.sp = 0xD1A87E - 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  }},
  { addr: 0x028f02, name: 'Draw-label primitive', stackPrep: (cpu, mem) => {
    cpu.sp = 0xD1A87E - 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    // This one takes HL = string ptr, A = position code
    cpu.hl = 0x029139; // "RADIAN"
    cpu.a = 0x92;
  }},
];

for (const c of candidates) {
  console.log('\n' + '='.repeat(70));
  console.log(`${c.name}  —  entry=${hex(c.addr)}`);
  console.log('='.repeat(70));
  const env = freshEnv();
  bootAndInit(env, true);
  const { ex, cpu, mem } = env;

  // Clear VRAM so we can measure delta
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_SIZE; i++) mem[i] = 0x00;

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  c.stackPrep(cpu, mem);

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
  console.log(`  blocks visited: ${blocks}`);
  console.log(`  VRAM writes: ${vramWrites}`);
  console.log(`  VRAM non-zero cells: ${b.nz}`);
  if (b.maxR >= 0) {
    console.log(`  bbox: rows ${b.minR}-${b.maxR} (${b.maxR - b.minR + 1} tall), cols ${b.minC}-${b.maxC} (${b.maxC - b.minC + 1} wide)`);
  }
  console.log(`  top regions:`);
  for (const [region, count] of [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`    0x${region.toString(16).padStart(2, '0')}xxxx: ${count}`);
  }
  console.log(`  missing blocks: ${r.missingBlocks?.length ?? 0}`);

  // If something rendered, show a compact ascii art of the bbox
  if (b.nz > 0 && b.nz < 30000) {
    const art = asciiArt(mem, b);
    console.log(`  render (${art.length} rows):`);
    for (const line of art.slice(0, 40)) console.log('    ' + line.slice(0, 120));
    if (art.length > 40) console.log(`    ... (${art.length - 40} more rows)`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('Phase 34 probe complete.');
