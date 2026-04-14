#!/usr/bin/env node
// Phase 47.4 — Batch probe all 0x05c634 (ClrScreen) callers as candidate info screen renderers
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

// Find all CALL 0x05c634 sites in ROM
function findClrScreenCallers() {
  const hits = [];
  for (let i = 0; i < romBytes.length - 4; i++) {
    if (romBytes[i] === 0xcd
        && romBytes[i + 1] === 0x34
        && romBytes[i + 2] === 0xc6
        && romBytes[i + 3] === 0x05) {
      hits.push(i);
    }
  }
  return hits;
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const snap = new Uint8Array(mem.subarray(0x400000, 0xE00000));

  const callers = findClrScreenCallers();
  console.log(`Found ${callers.length} CALL 0x05c634 sites; probing each as candidate info screen...\n`);

  const results = [];
  for (const caller of callers) {
    mem.set(snap, 0x400000);
    clearVram(mem);
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

    const t0 = Date.now();
    const result = ex.runFrom(caller, 'adl', { maxSteps: 200000, maxLoopIterations: 5000 });
    const ms = Date.now() - t0;
    const stats = vramStats(mem);
    const bboxStr = stats.bbox ? `r${stats.bbox.minR}-${stats.bbox.maxR}c${stats.bbox.minC}-${stats.bbox.maxC}` : 'none';
    console.log(`${hex(caller)}: steps=${result.steps.toString().padStart(7)} ${ms.toString().padStart(4)}ms drawn=${stats.drawn.toString().padStart(6)} fg=${stats.fg.toString().padStart(5)} bg=${stats.bg.toString().padStart(5)} other=${stats.other.toString().padStart(5)} bbox=${bboxStr}`);
    results.push({ caller, ...stats, result, ms });
  }

  console.log('\n=== Top 20 by drawn cells (with text — fg+bg both > 100) ===');
  const interesting = results.filter(r => r.fg > 100 && r.bg > 100);
  interesting.sort((a, b) => b.drawn - a.drawn);
  for (const r of interesting.slice(0, 20)) {
    const bboxStr = r.bbox ? `r${r.bbox.minR}-${r.bbox.maxR}c${r.bbox.minC}-${r.bbox.maxC}` : 'none';
    console.log(`  ${hex(r.caller)} drawn=${r.drawn} fg=${r.fg} bg=${r.bg} bbox=${bboxStr}`);
  }
}

await main();
