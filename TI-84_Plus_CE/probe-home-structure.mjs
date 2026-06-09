#!/usr/bin/env node
// Iteration 7: SEE what the correct-VAT home paint actually draws.
// Iteration 6 variant B: correct VAT pointers -> VAT search terminates, ~8549
// NON-WHITE (colored, not black) pixels painted. The black-only map missed them.
// This maps NON-WHITE density + per-row counts + color histogram to判断 whether
// it's a structured home screen (status bar + blank body) or noise.

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

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

// Confirm MEM_INIT disasm: 0x09DEE0 should be 21 81 A8 D1 (ld hl,0xD1A881).
console.log('ROM @0x09DEE0:', [...romBytes.slice(0x09DEE0, 0x09DEE0 + 12)].map((b) => b.toString(16).padStart(2, '0')).join(' '));

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

// Correct VAT seed (from MEM_INIT 0x09DEE0 disasm).
write24(mem, 0xD02587, 0xD1A881); write24(mem, 0xD0258A, 0xD1A881);
write24(mem, 0xD0258D, 0xD1A881); write24(mem, 0xD025A0, 0xD1A881);
write24(mem, 0xD0259A, 0xD3FFFF); write24(mem, 0xD02590, 0xD3FFFF);
write24(mem, 0xD02593, 0xD3FFFF); write24(mem, 0xD0259D, 0xD3FFFF);
write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
mem[0xD007E0] = 0x40;
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 24; cpu.push(0x08C33D & 0xFFFFFF);
write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
const r = executor.runFrom(0x058241, 'adl', { maxSteps: 1_200_000, maxLoopIterations: 60000 });

// Stats.
let nonWhite = 0, black = 0; const colors = new Map();
for (let i = 0; i < W * H; i++) {
  const a = VRAM_BASE + i * 2; const v = mem[a] | (mem[a + 1] << 8);
  if (v !== 0xFFFF) nonWhite++;
  if (v === 0x0000) black++;
  colors.set(v, (colors.get(v) || 0) + 1);
}
const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${hex(c, 4)}:${n}`).join(' ');
console.log(`\ndrive 0x058241: steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}`);
console.log(`nonWhite=${nonWhite} black=${black}`);
console.log(`top colors: ${topColors}\n`);

console.log('per-row NON-WHITE counts (rows with content):');
for (let y = 0; y < H; y++) {
  let nw = 0; for (let x = 0; x < W; x++) if (word(mem, x, y) !== 0xFFFF) nw++;
  if (nw > 0) console.log(`  row ${String(y).padStart(3)}: ${nw}`);
}

console.log('\nNON-WHITE density map (64x32, # dense / + some / . sparse):');
const CW = Math.ceil(W / 64), CH = Math.ceil(H / 32);
for (let cy = 0; cy < 32; cy++) {
  let line = '';
  for (let cx = 0; cx < 64; cx++) {
    let nw = 0, tot = 0;
    for (let dy = 0; dy < CH; dy++) for (let dx = 0; dx < CW; dx++) {
      const x = cx * CW + dx, y = cy * CH + dy;
      if (x >= W || y >= H) continue;
      tot++; if (word(mem, x, y) !== 0xFFFF) nw++;
    }
    const f = tot ? nw / tot : 0;
    line += f > 0.5 ? '#' : f > 0.15 ? '+' : f > 0 ? '.' : ' ';
  }
  if (line.trim()) console.log(`${String(cy * CH).padStart(3)}|${line}`);
}
