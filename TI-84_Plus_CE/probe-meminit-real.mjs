#!/usr/bin/env node
// Run the real OS memory/VAT init from its surrounding call paths, capture all
// RAM side effects, then drive the home repaint using the known paint path.

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
const RAM_DIFF_START = 0xD00000;
const RAM_DIFF_END = 0xD40000;
const VRAM_BASE = 0xD40000;
const W = 320, H = 240;
const IDLE_LOOP = 0x0019be;
const VAT_PTRS = [0xD02587, 0xD0258A, 0xD0258D, 0xD02590, 0xD02593, 0xD0259A, 0xD0259D, 0xD025A0];

const hex = (v, w = 6) => `0x${((v ?? 0) >>> 0).toString(16).padStart(w, '0')}`;
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

console.log('=== probe-meminit-real: real OS memory/VAT init side effects ===\n');

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
  console.log(`  heap-size D025C5=${hex(read24(mem, 0xD025C5))}`);
}

function dumpRamDiff(before, label) {
  console.log(`  --- RAM diff ${hex(RAM_DIFF_START)}-${hex(RAM_DIFF_END)} (${label}) ---`);
  let lines = 0, changes = 0, runs = 0;
  for (let off = 0; off < before.length;) {
    if (before[off] === mem[RAM_DIFF_START + off]) {
      off++;
      continue;
    }
    const start = off;
    while (off < before.length && before[off] !== mem[RAM_DIFF_START + off]) off++;
    const end = off;
    runs++;
    if (lines < 400) console.log(`  run ${hex(RAM_DIFF_START + start)}-${hex(RAM_DIFF_START + end - 1)} len=${end - start}`);
    lines++;
    for (let i = start; i < end; i++) {
      changes++;
      if (lines < 400) console.log(`    ${hex(RAM_DIFF_START + i)}: ${hex(before[i], 2)} -> ${hex(mem[RAM_DIFF_START + i], 2)}`);
      lines++;
    }
  }
  if (!changes) {
    console.log('    (no changes)');
  } else {
    console.log(`  diff summary: changed_bytes=${changes} runs=${runs}${lines > 400 ? ` output_capped_at=400 omitted_lines=${lines - 400}` : ''}`);
  }
}

function seedVat() {
  write24(mem, 0xD02587, 0xD1A881); write24(mem, 0xD0258A, 0xD1A881);
  write24(mem, 0xD0258D, 0xD1A881); write24(mem, 0xD025A0, 0xD1A881);
  write24(mem, 0xD0259A, 0xD3FFFF); write24(mem, 0xD02590, 0xD3FFFF);
  write24(mem, 0xD02593, 0xD3FFFF); write24(mem, 0xD0259D, 0xD3FFFF);
  write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
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

function runVariant(name, entry) {
  console.log(`### VARIANT ${name}: run ${hex(entry)} ###`);
  restoreIdle();
  peripherals.setTimerEnabled(false);
  const before = new Uint8Array(mem.slice(RAM_DIFF_START, RAM_DIFF_END));
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp -= 3;
  write24(mem, cpu.sp, IDLE_LOOP & 0xFFFFFF);
  let r;
  try {
    r = executor.runFrom(entry, 'adl', { maxSteps: 500000, maxLoopIterations: 30000 });
  } catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
  console.log(`  init: steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  dumpVat(name);
  dumpRamDiff(before, name);
  driveAndReport(name);
}

runVariant('A 0x09DD14 function entry', 0x09DD14);
runVariant('B 0x09DD62 call site', 0x09DD62);

console.log('### COMPARISON: direct 0x09DEE0 known MEM_INIT entry ###');
restoreIdle();
peripherals.setTimerEnabled(false);
const directBefore = new Uint8Array(mem.slice(RAM_DIFF_START, RAM_DIFF_END));
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 24;
cpu.sp -= 3;
write24(mem, cpu.sp, IDLE_LOOP & 0xFFFFFF);
let direct;
try {
  direct = executor.runFrom(0x09DEE0, 'adl', { maxSteps: 300000, maxLoopIterations: 20000 });
} catch (e) { direct = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
console.log(`  init: steps=${direct.steps} term=${direct.termination} lastPc=${hex(direct.lastPc)}${direct.error ? ' err=' + direct.error : ''}`);
dumpVat('direct 0x09DEE0');
dumpRamDiff(directBefore, 'direct 0x09DEE0');
driveAndReport('direct 0x09DEE0');

console.log('### CONTROL: seedVat then paint ###');
restoreIdle();
seedVat();
dumpVat('seedVat control');
driveAndReport('seedVat control');

console.log('=== READ: compare real init RAM side effects against clean seedVat paint ===');
