#!/usr/bin/env node
// Verify the iteration-5 home-screen paint is STRUCTURED (real UI), not noise.
// Boot -> force empty VAT -> drive home repaint 0x058241 (timer on) -> render a
// downsampled ASCII black-density map of VRAM + per-row black counts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const W = 320, H = 240;
const IDLE_LOOP = 0x0019be;
const VAT_PTRS = [0xD02590, 0xD02593, 0xD0258A, 0xD0258D, 0xD0259A, 0xD0259D];

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

mem[0xD007E0] = 0x40;
for (const a of VAT_PTRS) write24(mem, a, 0xD3FFFF);
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
cpu.push(0x08C33D & 0xFFFFFF);
write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
const r = executor.runFrom(0x058241, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 60000 });

// Stats + distinct colors.
let black = 0; const colors = new Map();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = word(mem, x, y);
  if (v === 0x0000) black++;
  colors.set(v, (colors.get(v) || 0) + 1);
}
const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  .map(([c, n]) => `${hex(c, 4)}:${n}`).join(' ');

console.log(`steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)} black=${black}`);
console.log(`top colors: ${topColors}\n`);

// Per-row black counts (every 8th row).
console.log('row black-pixel counts (rows with content):');
for (let y = 0; y < H; y += 4) {
  let b = 0; for (let x = 0; x < W; x++) if (word(mem, x, y) === 0x0000) b++;
  if (b > 0) console.log(`  row ${String(y).padStart(3)}: ${b}`);
}

// Downsample to 80x40 ASCII density map (each cell = 4x6 px).
console.log('\nVRAM black-density map (80x40, # dense / + some / . sparse / space none):');
const CW = Math.ceil(W / 80), CH = Math.ceil(H / 40);
for (let cy = 0; cy < 40; cy++) {
  let line = '';
  for (let cx = 0; cx < 80; cx++) {
    let b = 0, tot = 0;
    for (let dy = 0; dy < CH; dy++) for (let dx = 0; dx < CW; dx++) {
      const x = cx * CW + dx, y = cy * CH + dy;
      if (x >= W || y >= H) continue;
      tot++; if (word(mem, x, y) === 0x0000) b++;
    }
    const f = tot ? b / tot : 0;
    line += f > 0.5 ? '#' : f > 0.2 ? '+' : f > 0 ? '.' : ' ';
  }
  if (line.trim()) console.log(`${String(cy * CH).padStart(3)}|${line}`);
}
