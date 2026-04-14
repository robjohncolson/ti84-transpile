#!/usr/bin/env node
// Phase 42 — probe candidate shell main-loop entries in the 0x040xxx region.
// Hypothesis: one of these is the home-screen renderer.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const VRAM_BASE = 0xD40000;
const VRAM_W = 320, VRAM_H = 240, VRAM_SIZE = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL = 0xAAAA;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;

// Phase 44.1 — text-loop callers from various regions
const CANDIDATES = [
  { addr: 0x024528, label: 'text caller, 0x024xxx' },
  { addr: 0x028a17, label: 'text caller, 0x028xxx' },
  { addr: 0x02fc87, label: 'text caller, 0x02fxxx' },
  { addr: 0x03dc1b, label: 'text caller, 0x03dxxx' },
  { addr: 0x040aea, label: 'text caller, 0x040xxx' },
  { addr: 0x04552f, label: 'text caller, 0x045xxx (heavy region)' },
  { addr: 0x045de1, label: 'text caller, 0x045xxx' },
  { addr: 0x046126, label: 'text caller, 0x046xxx' },
  { addr: 0x09ed4c, label: 'JP to text loop, 0x09exxx' },
  { addr: 0x0b252c, label: 'JP to text loop, 0x0b2xxx' },
];

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex16 = (v) => `0x${(v & 0xffff).toString(16).padStart(4, '0')}`;

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

function vramStats(mem) {
  let drawn = 0, fg = 0, bg = 0, other = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  const hist = new Map();
  for (let row = 0; row < VRAM_H; row++) {
    for (let col = 0; col < VRAM_W; col++) {
      const off = VRAM_BASE + row * VRAM_W * 2 + col * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      hist.set(px, (hist.get(px) || 0) + 1);
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
  return { drawn, fg, bg, other, hist, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}

async function freshRunOnce(blocks, candidate) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  // Boot
  ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  // OS init
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  // SetTextFgColor (HL=0x0000 → fg=black, bg=white)
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Clear VRAM, prep, run candidate
  clearVram(mem);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;  // Z set to pass conditional rets
  cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

  const t0 = Date.now();
  const result = ex.runFrom(candidate.addr, 'adl', { maxSteps: 300000, maxLoopIterations: 5000 });
  const ms = Date.now() - t0;
  const stats = vramStats(mem);
  return { result, stats, ms };
}

async function main() {
  console.log('=== Phase 42 — 0x040xxx shell candidate probe ===\n');
  const blocks = await loadBlocks();

  for (const cand of CANDIDATES) {
    process.stdout.write(`probing ${hex(cand.addr)} (${cand.label})... `);
    try {
      const { result, stats, ms } = await freshRunOnce(blocks, cand);
      console.log(`${result.steps} steps in ${ms}ms -> ${result.termination} at ${hex(result.lastPc)}`);
      console.log(`  drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} other=${stats.other}`);
      if (stats.bbox) {
        console.log(`  bbox: rows ${stats.bbox.minR}-${stats.bbox.maxR}, cols ${stats.bbox.minC}-${stats.bbox.maxC}`);
      }
      const top = [...stats.hist.entries()]
        .filter(([px]) => px !== VRAM_SENTINEL)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      if (top.length) {
        console.log(`  top colors: ${top.map(([px, n]) => `${hex16(px)}=${n}`).join(', ')}`);
      }
      console.log('');
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }
}

await main();
