#!/usr/bin/env node
// Phase 45 — pass real string pointers to 0x03f300 to render legible mem-mgmt messages
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const VRAM_BASE = 0xD40000;
const VRAM_W = 320, VRAM_H = 240, VRAM_SIZE = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL = 0xAAAA;

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], { cwd: repoRoot, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) { mem.fill(0xff, start, start + bytes); }
function clearVram(mem) {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off] = VRAM_SENTINEL & 0xff;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }
}
function readPixel(mem, row, col) {
  const off = VRAM_BASE + row * VRAM_W * 2 + col * 2;
  return mem[off] | (mem[off + 1] << 8);
}
function vramStats(mem) {
  let drawn = 0, fg = 0, bg = 0, other = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  for (let row = 0; row < VRAM_H; row++) {
    for (let col = 0; col < VRAM_W; col++) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px === 0x0000) fg++;
      else if (px === 0xffff) bg++;
      else other++;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }
  }
  return { drawn, fg, bg, other, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}
function asciiSlice(mem, rowStart, rowEnd, colStart, colEnd, stride = 1) {
  const lines = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;
    for (let col = colStart; col <= colEnd; col += stride) {
      const px = readPixel(mem, row, col);
      let ch;
      if (px === VRAM_SENTINEL) ch = ' ';
      else if (px === 0xffff) ch = '.';
      else if (px === 0x0000) ch = '#';
      else ch = '?';
      line += ch;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  // Boot + OS init
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  // SetTextFgColor
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Snapshot RAM after init
  const snap = new Uint8Array(mem.subarray(0x400000, 0xE00000));

  const tests = [
    { hl: 0x06aeb9, label: '"dy/dx=" (6 chars from CALC region)' },
    { hl: 0x06aec0, label: '"Minimum" (7 chars)' },
    { hl: 0x06aed0, label: '"Intersection" (12 chars)' },
    { hl: 0x062338, label: '"OVERFLOW" (8 chars from error region)' },
    { hl: 0x062391, label: '"DIVIDE BY 0" (11 chars)' },
    { hl: 0x029e51, label: '"RESET: RAM & ARCHIVE" (20 chars)' },
  ];

  for (const test of tests) {
    mem.set(snap, 0x400000);
    clearVram(mem);
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.hl = test.hl;
    cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

    const t0 = Date.now();
    const result = ex.runFrom(0x03f300, 'adl', { maxSteps: 100000, maxLoopIterations: 5000 });
    const ms = Date.now() - t0;
    const stats = vramStats(mem);

    console.log(`\n=== HL=${hex(test.hl)} (${test.label}) ===`);
    console.log(`steps=${result.steps} ms=${ms} term=${result.termination}@${hex(result.lastPc)}`);
    console.log(`drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg}`);
    if (stats.bbox) {
      console.log(`bbox: r${stats.bbox.minR}-${stats.bbox.maxR} c${stats.bbox.minC}-${stats.bbox.maxC}`);
      // Stride 1 ASCII art for the bbox
      const r0 = Math.max(0, stats.bbox.minR);
      const r1 = Math.min(239, stats.bbox.maxR);
      const c0 = Math.max(0, stats.bbox.minC);
      const c1 = Math.min(319, stats.bbox.maxC);
      const ascii = asciiSlice(mem, r0, r1, c0, c1, 1);

      const fname = `phase45-03f300-hl${test.hl.toString(16)}.txt`;
      const outPath = path.join(__dirname, fname);
      fs.writeFileSync(outPath, ascii);
      console.log(`wrote ${fname}`);
      // Also print first 4 rows for inline preview
      const preview = ascii.split('\n').slice(0, 4).join('\n');
      console.log(preview);
    }
  }
}

await main();
