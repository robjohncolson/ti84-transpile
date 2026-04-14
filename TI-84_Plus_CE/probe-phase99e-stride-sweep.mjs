#!/usr/bin/env node
// Phase 99E - Stride sweep probe v2.
// Uses the full init pattern from probe-phase98a-decode-verify.mjs, then
// sweeps (stride, compareWidth, startRow, startCol, maxDist, mode) to find
// the best decode of the "Normal Float Radian" mode strip.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  buildFontSignatures,
  decodeTextStrip,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  FONT_BASE,
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
const VRAM_SENTINEL = 0xAAAA;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

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

console.log('=== Phase 99E v2 - Stride Sweep Probe (compareWidth) ===');
console.log(`fontDecoder: base=${hex(FONT_BASE, 6)} glyph=${GLYPH_WIDTH}x${GLYPH_HEIGHT}`);

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuFields = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];
const cpuSnap = Object.fromEntries(cpuFields.map(f => [f, cpu[f]]));

function resetCpu() {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
}

mem.set(ramSnap, 0x400000); clearVram(mem); resetCpu();
executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

for (let i = 0; i < MODE_BUF_LEN; i++) {
  mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
}

resetCpu();
executor.runFrom(0x0a29ec, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

function countVram() {
  let drawn = 0, fg = 0, bg = 0;
  let rMin = VRAM_HEIGHT, rMax = -1;
  for (let r = 0; r < VRAM_HEIGHT; r++) {
    for (let c = 0; c < VRAM_WIDTH; c++) {
      const off = VRAM_BASE + (r * VRAM_WIDTH + c) * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px === 0xFFFF) bg++; else fg++;
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
  }
  return { drawn, fg, bg, rMin, rMax };
}
const totals = countVram();
console.log(`composite: drawn=${totals.drawn} fg=${totals.fg} bg=${totals.bg} rMin=${totals.rMin} rMax=${totals.rMax}`);

function scoreDecode(text) {
  const a = {
    normal: text.includes('Normal'),
    float: text.includes('Float'),
    radian: text.includes('Radian'),
  };
  const passCount = Number(a.normal) + Number(a.float) + Number(a.radian);
  let exact = 0;
  for (let i = 0; i < Math.min(text.length, MODE_BUF_TEXT.length); i++) {
    if (text[i] === MODE_BUF_TEXT[i]) exact++;
  }
  const unknowns = (text.match(/\?/g) || []).length;
  return { passCount, exact, unknowns, a };
}

const signatures = buildFontSignatures(romBytes);
console.log(`signatures=${signatures.length}`);

if (totals.drawn === 0) {
  console.log('COMPOSITE BROKEN - drawn=0');
  process.exitCode = 1;
} else {
  const strides = [10, 11, 12, 13];
  const compareWidths = [8, 9, 10, 11, 12];
  const rows = [17, 18, 19, 20, 21];
  const cols = [0, 1, 2, 3, 4];
  const maxDistances = [30, 40, 50, 60, 80];
  const modes = ['auto', 'inverse'];

  let bestOverall = null;
  const topResults = [];

  for (const stride of strides) {
    for (const compareWidth of compareWidths) {
      if (compareWidth > stride) continue; // don't compare beyond stride
      for (const row of rows) {
        for (const col of cols) {
          for (const maxDist of maxDistances) {
            for (const mode of modes) {
              const text = decodeTextStrip(mem, row, col, MODE_BUF_LEN, signatures, maxDist, mode, stride, compareWidth);
              const sc = scoreDecode(text);
              if (sc.passCount > 0 || sc.exact >= 10) {
                topResults.push({ stride, compareWidth, row, col, maxDist, mode, text, ...sc });
              }
              if (!bestOverall ||
                  sc.passCount > bestOverall.passCount ||
                  (sc.passCount === bestOverall.passCount && sc.exact > bestOverall.exact) ||
                  (sc.passCount === bestOverall.passCount && sc.exact === bestOverall.exact && sc.unknowns < bestOverall.unknowns)) {
                bestOverall = { stride, compareWidth, row, col, maxDist, mode, text, ...sc };
              }
            }
          }
        }
      }
    }
  }

  topResults.sort((a, b) => {
    if (b.passCount !== a.passCount) return b.passCount - a.passCount;
    if (b.exact !== a.exact) return b.exact - a.exact;
    return a.unknowns - b.unknowns;
  });

  console.log('\n=== Top 30 decode results ===');
  for (const r of topResults.slice(0, 30)) {
    console.log(`stride=${r.stride} cw=${r.compareWidth} row=${r.row} col=${r.col} dist=${r.maxDist} mode=${r.mode} pass=${r.passCount} exact=${r.exact} unk=${r.unknowns} text="${r.text}"`);
  }

  console.log('\n=== Best overall ===');
  if (bestOverall) {
    console.log(`stride=${bestOverall.stride} cw=${bestOverall.compareWidth} row=${bestOverall.row} col=${bestOverall.col} dist=${bestOverall.maxDist} mode=${bestOverall.mode}`);
    console.log(`decoded="${bestOverall.text}"`);
    console.log(`passCount=${bestOverall.passCount} exact=${bestOverall.exact} unknowns=${bestOverall.unknowns}`);
    console.log(`Normal: ${bestOverall.a.normal ? 'PASS' : 'FAIL'}`);
    console.log(`Float: ${bestOverall.a.float ? 'PASS' : 'FAIL'}`);
    console.log(`Radian: ${bestOverall.a.radian ? 'PASS' : 'FAIL'}`);
    process.exitCode = bestOverall.passCount === 3 ? 0 : 1;
  } else {
    console.log('no results');
    process.exitCode = 1;
  }
}
