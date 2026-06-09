#!/usr/bin/env node
// "Make it run" iteration 6: run the real OS memory/VAT init (MEM_INIT 0x09DEE0)
// that our shortcut boot skips, then drive the home repaint and check for a
// CLEAN render (structured text, not the iteration-5 garbled black band).
//
// MEM_INIT 0x09DEE0 (decode corpus phase25w):
//   ld hl,0xD1A881 -> D02587 tempMem, D0258A FPSbase, D0258D FPS, D025A0 newDataPtr
//   ld hl,0xD3FFFF -> D0259A pTemp, D02590 OPBase, D02593 OPS, D0259D progPtr
//   ... call 0x08A98F, set IY+71 bit7, heap size -> D025C5; RET @0x09DF34
// Iteration 5 wrongly forced FPSbase/FPS to 0xD3FFFF; correct base is 0xD1A881.

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
const VAT_PTRS = [0xD02587, 0xD0258A, 0xD0258D, 0xD02590, 0xD02593, 0xD0259A, 0xD0259D, 0xD025A0];

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

function vramStats(mem) {
  let black = 0, white = 0;
  for (let i = 0; i < W * H; i++) {
    const a = VRAM_BASE + i * 2; const v = mem[a] | (mem[a + 1] << 8);
    if (v === 0x0000) black++; else if (v === 0xFFFF) white++;
  }
  return { black, white };
}
function asciiMap(mem) {
  const CW = Math.ceil(W / 64), CH = Math.ceil(H / 32);
  const lines = [];
  for (let cy = 0; cy < 32; cy++) {
    let line = '';
    for (let cx = 0; cx < 64; cx++) {
      let b = 0, tot = 0;
      for (let dy = 0; dy < CH; dy++) for (let dx = 0; dx < CW; dx++) {
        const x = cx * CW + dx, y = cy * CH + dy;
        if (x >= W || y >= H) continue;
        tot++; if (word(mem, x, y) === 0x0000) b++;
      }
      const f = tot ? b / tot : 0;
      line += f > 0.5 ? '#' : f > 0.15 ? '+' : f > 0 ? '.' : ' ';
    }
    lines.push(`${String(cy * CH).padStart(3)}|${line}`);
  }
  return lines.filter((l) => l.slice(4).trim()).join('\n');
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Iteration 6: run real MEM_INIT, then paint the home screen ===\n');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const idleVram = vramStats(mem);
console.log(`idle: VRAM black=${idleVram.black} white=${idleVram.white}\n`);
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
}

function dumpVat(label) {
  console.log(`  VAT after ${label}: ` + VAT_PTRS.map((a) => `${hex(a, 5)}=${hex(read24(mem, a))}`).join(' '));
}

function driveAndReport(label) {
  mem[0xD007E0] = 0x40;
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(0x08C33D & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
  let searchLoop = 0;
  let r;
  try {
    r = executor.runFrom(0x058241, 'adl', {
      maxSteps: 1_200_000, maxLoopIterations: 60000,
      onBlock: (pc) => { if (pc === 0x084711) searchLoop++; },
    });
  } catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
  const va = vramStats(mem);
  console.log(`  drive 0x058241: steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  VAT search-loop 0x084711 iters=${searchLoop}`);
  console.log(`  VRAM black ${idleVram.black} -> ${va.black}, white ${idleVram.white} -> ${va.white}`);
  console.log(`  --- ASCII map (${label}) ---\n${asciiMap(mem)}\n`);
}

// VARIANT A: run real MEM_INIT 0x09DEE0 standalone, then paint.
console.log('### VARIANT A: run MEM_INIT 0x09DEE0 ###');
restoreIdle();
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 24; cpu.push(0x0019be & 0xFFFFFF);
const mi = executor.runFrom(0x09DEE0, 'adl', { maxSteps: 300000, maxLoopIterations: 20000 });
console.log(`  MEM_INIT: steps=${mi.steps} term=${mi.termination} lastPc=${hex(mi.lastPc)}`);
dumpVat('MEM_INIT');
driveAndReport('MEM_INIT then paint');

// VARIANT B: surgical correct-value seed (control), then paint.
console.log('### VARIANT B: surgical correct VAT seed ###');
restoreIdle();
write24(mem, 0xD02587, 0xD1A881); write24(mem, 0xD0258A, 0xD1A881);
write24(mem, 0xD0258D, 0xD1A881); write24(mem, 0xD025A0, 0xD1A881);
write24(mem, 0xD0259A, 0xD3FFFF); write24(mem, 0xD02590, 0xD3FFFF);
write24(mem, 0xD02593, 0xD3FFFF); write24(mem, 0xD0259D, 0xD3FFFF);
write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
dumpVat('surgical seed');
driveAndReport('surgical seed then paint');

console.log('=== READ: does correct VAT init produce a clean home-screen render? ===');
