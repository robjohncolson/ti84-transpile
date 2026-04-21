#!/usr/bin/env node
// Phase 99E per-cell diagnostic: for each cell at stride=12 row=19 col=2,
// dump the raw extracted cell and the top 5 signature matches at various
// compareWidth values.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  buildFontSignatures,
  extractCell,
  hamming,
  hammingCols,
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

// For each cell position at stride=12 row=19 col=2:
// - dump the extracted cell (inverse)
// - show top 5 matches at cw=8, cw=10, cw=12

const stride = 12;
const startRow = 19;
const startCol = 2;

for (let i = 0; i < 19; i++) {
  const col = startCol + i * stride;
  const expected = MODE_BUF_TEXT[i];
  const cell = extractCell(mem, startRow, col, true);

  let allZero = true;
  for (let k = 0; k < cell.length; k++) if (cell[k]) { allZero = false; break; }

  console.log(`\n=== pos ${i} expected='${expected}' col=${col} ${allZero ? '(all zeros)' : ''} ===`);
  for (let r = 0; r < GLYPH_HEIGHT; r++) {
    let line = '  ';
    for (let c = 0; c < GLYPH_WIDTH; c++) {
      line += cell[r * GLYPH_WIDTH + c] ? '#' : '.';
    }
    console.log(line);
  }

  if (!allZero) {
    for (const cw of [8, 10, 12]) {
      const scored = signatures.map(sig => ({ sig, dist: hammingCols(cell, sig.bitmap, cw) }));
      scored.sort((a, b) => a.dist - b.dist);
      const top5 = scored.slice(0, 5).map(s => `'${s.sig.char}'(${s.dist})`).join(' ');
      console.log(`  cw=${cw}: ${top5}`);
    }
  }
}
