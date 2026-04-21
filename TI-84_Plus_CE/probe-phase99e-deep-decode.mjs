#!/usr/bin/env node
// Phase 99E deep decode: at the best-performing stride/row/col, dump
// raw cell bitmaps and top-5 signature matches per cell to understand
// why some chars are missing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  buildFontSignatures,
  extractCell,
  hamming,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  VRAM_BASE,
} from './font-decoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function clearVram(mem) {
  for (let i = 0; i < VRAM_SIZE; i += 2) {
    mem[VRAM_BASE + i] = 0xAA;
    mem[VRAM_BASE + i + 1] = 0xAA;
  }
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuFields = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];
const cpuSnap = Object.fromEntries(cpuFields.map(f => [f, cpu[f]]));
function resetCpu() {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

mem.set(ramSnap, 0x400000); clearVram(mem); resetCpu();
executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

for (let i = 0; i < MODE_BUF_TEXT.length; i++) {
  mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
}

resetCpu();
executor.runFrom(0x0a29ec, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

const signatures = buildFontSignatures(romBytes);

// Print ASCII preview of r17-r34 cols 0-215 with col index markers
console.log('=== ASCII preview r17-r34, cols 0-215 ===');
console.log('         0         1         2         3         4         5         6         7         8         9         0         1         2         3         4         5         6         7         8         9         0');
console.log('         0         1         2         3         4         5         6         7         8         9         0         1         2         3         4         5         6         7         8         9         0');

let colRuler = '      ';
for (let col = 0; col < 216; col++) {
  colRuler += String(col % 10);
}
console.log(colRuler);
for (let row = 17; row <= 34; row++) {
  let line = `  r${row.toString().padStart(2, '0')}: `;
  for (let col = 0; col < 216; col++) {
    const off = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    line += px === 0xAAAA ? '.' : px === 0xFFFF ? ' ' : '#';
  }
  console.log(line);
}

// Find the actual starting column and widths by scanning for transitions
console.log('\n=== Dark-to-light transitions on row 23 (mid-glyph) ===');
const row = 23;
let prevBlack = true;
const transitions = [];
for (let col = 0; col < 216; col++) {
  const off = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  const px = mem[off] | (mem[off + 1] << 8);
  const isBlack = px !== 0xFFFF && px !== 0xAAAA;
  if (isBlack !== prevBlack) {
    transitions.push({ col, from: prevBlack ? 'black' : 'white', to: isBlack ? 'black' : 'white' });
    prevBlack = isBlack;
  }
}
for (const t of transitions.slice(0, 40)) {
  console.log(`  col ${t.col.toString().padStart(3)}: ${t.from} -> ${t.to}`);
}

// Dump the raw extracted cells for a few positions and print top 5 matches
function dumpCell(row, col, inverse, label) {
  console.log(`\n=== Cell row=${row} col=${col} ${inverse ? 'inverse' : 'normal'} ${label} ===`);
  const cell = extractCell(mem, row, col, inverse);
  for (let r = 0; r < GLYPH_HEIGHT; r++) {
    let line = '  ';
    for (let c = 0; c < GLYPH_WIDTH; c++) {
      line += cell[r * GLYPH_WIDTH + c] ? '#' : '.';
    }
    console.log(line);
  }
  let allZero = true;
  for (let i = 0; i < cell.length; i++) if (cell[i]) { allZero = false; break; }
  if (allZero) {
    console.log('  (all zeros)');
    return;
  }
  const scored = signatures.map(sig => ({ sig, dist: hamming(cell, sig.bitmap) }));
  scored.sort((a, b) => a.dist - b.dist);
  console.log('  top 5 matches:');
  for (const s of scored.slice(0, 5)) {
    console.log(`    '${s.sig.char}' (0x${s.sig.code.toString(16)}) dist=${s.dist}`);
  }
}

// Best from stride sweep: stride=12 row=19 col=2
// Expected: N o r m a l space F l o a t space R a d i a n
for (let i = 0; i < 7; i++) {
  const col = 2 + i * 12;
  const expected = MODE_BUF_TEXT[i];
  dumpCell(19, col, false, `expected='${expected}'`);
  dumpCell(19, col, true, `expected='${expected}' INV`);
}

// Try also starting at col 0 and stride 13
console.log('\n\n=== ALT: row=19 stride=13 start col=0 ===');
for (let i = 0; i < 7; i++) {
  const col = 0 + i * 13;
  const expected = MODE_BUF_TEXT[i];
  dumpCell(19, col, true, `expected='${expected}' INV`);
}
