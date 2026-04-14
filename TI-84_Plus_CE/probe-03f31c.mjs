#!/usr/bin/env node
// Phase 46.7 — probe 0x03f31c, suspected DispMessageAt variant (DE=cursor, HL=string)
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

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  // Boot + OS init + SetTextFgColor
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const snap = new Uint8Array(mem.subarray(0x400000, 0xE00000));

  // Test multiple cursor positions × strings
  const tests = [
    { entry: 0x03f31c, de: 0x000302, hl: 0x062338, label: '0x03f31c row=3 col=2 OVERFLOW' },
    { entry: 0x03f31c, de: 0x000502, hl: 0x062338, label: '0x03f31c row=5 col=2 OVERFLOW' },
    { entry: 0x03f31c, de: 0x000805, hl: 0x062338, label: '0x03f31c row=8 col=5 OVERFLOW' },
    { entry: 0x03f31d, de: 0x000302, hl: 0x062338, label: '0x03f31d (skip first byte) row=3 OVERFLOW' },
    { entry: 0x03f322, de: 0x000302, hl: 0x062338, label: '0x03f322 (skip cursor LD) row=3 OVERFLOW' },
  ];

  for (const test of tests) {
    mem.set(snap, 0x400000);
    clearVram(mem);
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.hl = test.hl;
    cpu.de = test.de;
    cpu.bc = 0x1B;  // 27 bytes copy length, matching 0x03f300's behavior
    cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

    const t0 = Date.now();
    const result = ex.runFrom(test.entry, 'adl', { maxSteps: 100000, maxLoopIterations: 5000 });
    const ms = Date.now() - t0;
    const stats = vramStats(mem);

    const bboxStr = stats.bbox ? `r${stats.bbox.minR}-${stats.bbox.maxR}c${stats.bbox.minC}-${stats.bbox.maxC}` : 'none';
    console.log(`${test.label}: steps=${result.steps} ${ms}ms drawn=${stats.drawn} fg=${stats.fg} bbox=${bboxStr} term=${result.termination}@${hex(result.lastPc)}`);
  }
}

await main();
