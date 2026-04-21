#!/usr/bin/env node
// Phase 98A end-to-end verification: run home screen composite, decode mode row via font decoder.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  buildFontSignatures,
  extractCell,
  matchCell,
  decodeTextStrip,
  VRAM_BASE,
  VRAM_WIDTH,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
} from './font-decoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).padStart(w, '0'); }
function clearVram(mem) {
  for (let i = 0; i < 320 * 240 * 2; i += 2) {
    mem[VRAM_BASE + i] = 0xAA;
    mem[VRAM_BASE + i + 1] = 0xAA;
  }
}

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Boot
console.log('Booting...');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

// Snapshot RAM + CPU
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuFields = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];
const cpuSnap = Object.fromEntries(cpuFields.map(f => [f, cpu[f]]));
function resetCpu() {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// Build composite
console.log('Building composite...');
mem.set(ramSnap, 0x400000); clearVram(mem); resetCpu();
executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

// Seed mode buffer
const modeText = 'Normal Float Radian       ';
for (let i = 0; i < 26; i++) mem[0xD020A6 + i] = modeText.charCodeAt(i);

resetCpu();
executor.runFrom(0x0a29ec, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

// Now decode the mode row. First, find where text exists by scanning rows 15-35
console.log('\n=== VRAM content r15-r35 ===');
for (let row = 15; row <= 35; row++) {
  let drawn = 0, fg = 0;
  for (let col = 0; col < 320; col++) {
    const off = VRAM_BASE + (row * 320 + col) * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    if (px === 0xAAAA) continue;
    drawn++;
    if (px !== 0xFFFF) fg++;
  }
  if (drawn > 0) console.log(`  r${row}: drawn=${drawn} fg=${fg}`);
}

// ASCII preview of the mode row area
console.log('\n=== ASCII preview r17-r30, cols 0-215 ===');
for (let row = 17; row <= 30; row++) {
  let line = `  r${row.toString().padStart(2, '0')}: `;
  for (let col = 0; col < 216; col++) {
    const off = VRAM_BASE + (row * 320 + col) * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    line += px === 0xAAAA ? '.' : px === 0xFFFF ? ' ' : '#';
  }
  console.log(line);
}

// Build signatures
const signatures = buildFontSignatures(romBytes);
console.log(`\n${signatures.length} font signatures built`);

// Scan all plausible baselines in both modes; rank by non-? chars.
console.log('\n=== Decode attempts (all inverse) ===');
const best = [];
for (let startRow = 17; startRow <= 22; startRow++) {
  for (let startCol = 0; startCol <= 8; startCol++) {
    const text = decodeTextStrip(mem, startRow, startCol, 26, signatures, 30, 'inverse');
    const score = 26 - (text.match(/\?/g) || []).length;
    best.push({ startRow, startCol, score, text });
  }
}
best.sort((a, b) => b.score - a.score);
for (const b of best.slice(0, 10)) {
  console.log(`  r${b.startRow} c${b.startCol} score=${b.score}: "${b.text}"`);
}

// Dump the highest-score inverse extraction at its first char for visual check
console.log('\n=== Raw inverse cell at best position, first char ===');
{
  const { startRow, startCol } = best[0];
  const cell = extractCell(mem, startRow, startCol, true);
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    let line = '  ';
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      line += cell[row * GLYPH_WIDTH + col] ? '#' : '.';
    }
    console.log(line);
  }
}

console.log('\nDone.');
