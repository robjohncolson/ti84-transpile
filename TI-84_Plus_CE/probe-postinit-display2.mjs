#!/usr/bin/env node

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
const INIT_IDLE_LOOP = 0x0019be;
const VARIANT_IDLE_LOOP = 0x0019b5;
const LAUNCH_INIT = 0x09DD62;
const VRAM_BASE = 0xD40000;
const W = 320;
const H = 240;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const WATCH = {
  populatorMP: 0x044D3F,
  populator2: 0x044DB3,
  popCore: 0x07D583,
  postPop: 0x044FC2,
  walker: 0x07D1B4,
  rasterizer: 0x0A1799,
  rStrCurRow: 0x0A29EC,
  vatSearch: 0x084711,
  bail: 0x044D3B,
  errHandler: 0x061D52,
  cxMainHandler: 0x0585E9,
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

function snapshotCpu(cpu) {
  return Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
}

function vramStats(mem) {
  let black = 0;
  let nonWhite = 0;
  let bodyNonWhite = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = word(mem, x, y);
      if (v === 0x0000) black++;
      if (v !== 0xFFFF) {
        nonWhite++;
        if (y >= 30) bodyNonWhite++;
      }
    }
  }
  return { black, nonWhite, bodyNonWhite };
}

function asciiMap(mem) {
  const cols = 64;
  const rows = 24;
  const cellW = Math.ceil(W / cols);
  const cellH = Math.ceil(H / rows);
  const lines = [];
  for (let cy = 0; cy < rows; cy++) {
    let line = '';
    for (let cx = 0; cx < cols; cx++) {
      let hasBlack = false;
      let hasNonWhite = false;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const x = cx * cellW + dx;
          const y = cy * cellH + dy;
          if (x >= W || y >= H) continue;
          const v = word(mem, x, y);
          if (v === 0x0000) hasBlack = true;
          else if (v !== 0xFFFF) hasNonWhite = true;
        }
      }
      line += hasBlack ? '#' : hasNonWhite ? '+' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function createHits() {
  return Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
}

function formatHits(hits) {
  return Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ');
}

function runWithWatches(executor, entry, maxSteps, maxLoopIterations) {
  const hits = createHits();
  let result;
  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      maxLoopIterations,
      onBlock(pc) {
        const p = pc & 0xFFFFFF;
        for (const [name, watchPc] of Object.entries(WATCH)) {
          if (p === watchPc) hits[name]++;
        }
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  return { result, hits };
}

function bootToIdle() {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  return executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
}

function launchInit() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_RESET_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, INIT_IDLE_LOOP);
  write24(mem, 0xD008E0, launchSp);
  return executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
}

function restorePostInit() {
  mem.set(postRamSnap, 0x400000);
  restoreCpu(cpu, postCpuSnap);
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, VARIANT_IDLE_LOOP);
  if (read24(mem, 0xD008E0) === 0) write24(mem, 0xD008E0, cpu.sp);
}

function runVariant(name, entry, maxSteps, maxLoopIterations, mutate) {
  restorePostInit();
  if (mutate) mutate();
  const beforeCx = read24(mem, 0xD007CA);
  const { result, hits } = runWithWatches(executor, entry, maxSteps, maxLoopIterations);
  const stats = vramStats(mem);
  const d0231a = read24(mem, 0xD0231A);
  const d0243a = read24(mem, 0xD0243A);
  const d007ca = read24(mem, 0xD007CA);
  const success = stats.bodyNonWhite > 0 && (d0231a !== 0 || d0243a !== 0) &&
    (hits.walker > 0 || hits.rasterizer > 0);

  console.log(`\n### ${name}: entry=${hex(entry)} ###`);
  console.log(`  pre-run D007CA=${hex(beforeCx)}`);
  console.log(`  run: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ` err=${result.error}` : ''}`);
  console.log(`  watch hits: ${formatHits(hits)}`);
  console.log(`  edit cursors: D0231A=${hex(d0231a)} D0243A=${hex(d0243a)}`);
  console.log(`  D007CA after=${hex(d007ca)} D008E0 after=${hex(read24(mem, 0xD008E0))}`);
  console.log(`  VRAM: black=${stats.black} nonWhite=${stats.nonWhite} bodyNonWhite=${stats.bodyNonWhite}`);
  console.log(`  success signal: ${success ? 'YES' : 'no'}`);
  console.log(`  ASCII map:\n${asciiMap(mem)}`);

  return { name, result, hits, d0231a, d0243a, d007ca, stats, success };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-postinit-display2: post real launch-init display variants ===\n');

const idleRun = bootToIdle();
console.log(`boot-to-idle: steps=${idleRun.steps} term=${idleRun.termination} lastPc=${hex(idleRun.lastPc)}`);

const initRun = launchInit();
const initCx = read24(mem, 0xD007CA);
console.log(`launch-init: steps=${initRun.steps} term=${initRun.termination} lastPc=${hex(initRun.lastPc)}`);
console.log(
  `post-init: D007CA=${hex(initCx)} D007E0=${hex(mem[0xD007E0], 2)} ` +
  `D00082=${hex(mem[0xD00082], 2)} D008E0=${hex(read24(mem, 0xD008E0))}`,
);
if (initCx !== 0x0585E9) {
  console.error(`ABORT: expected post-init D007CA=0x0585E9, got ${hex(initCx)}`);
  process.exit(2);
}

const postRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const postCpuSnap = snapshotCpu(cpu);

const results = [];
results.push(runVariant('V1 event loop no key', 0x08C331, 2_000_000, 100000));
results.push(runVariant('V2 repaint pre-handler', 0x058241, 1_500_000, 60000));
results.push(runVariant('V3 real cxMain handler direct', 0x0585E9, 1_500_000, 60000));
results.push(runVariant('V4 MathPrint populator from real descriptor state', 0x044D3F, 1_500_000, 60000, () => {
  mem[0xD00082] |= 0x80;
}));

console.log('\n=== summary ===');
for (const r of results) {
  const chain = Object.entries(r.hits).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)';
  console.log(`${r.name}: success=${r.success ? 'YES' : 'no'} bodyNonWhite=${r.stats.bodyNonWhite} cursors=${hex(r.d0231a)}/${hex(r.d0243a)} D007CA=${hex(r.d007ca)} chain=${chain}`);
}
