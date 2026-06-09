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
const VRAM_BASE = 0xD40000;
const W = 320;
const H = 240;
const IDLE_LOOP = 0x0019be;
const LAUNCH_HOME_INIT = 0x09DD62;
const VAT_PTRS = [0xD02587, 0xD0258A, 0xD0258D, 0xD02590, 0xD02593, 0xD0259A, 0xD0259D, 0xD025A0];
const VERIFY_ADDRS = [
  ...VAT_PTRS,
  0xD007CA, 0xD007E0, 0xD00082, 0xD008E0,
  0xD005F8, 0xD005F9, 0xD00603, 0xD00604,
  0xD0231A, 0xD0243A,
];
const WATCH = {
  populator: 0x044D3F,
  popCore: 0x07D583,
  postPop: 0x044FC2,
  walker: 0x07D1B4,
  rasterizer: 0x0A1799,
  renderStr: 0x0A29EC,
  vatSearch: 0x084711,
  bail: 0x044D3B,
  errHandler: 0x061D52,
};
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const hex = (v, w = 6) => `0x${((v ?? 0) >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

function vramStats(mem) {
  let black = 0, white = 0, nonWhite = 0, bodyNonWhite = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = word(mem, x, y);
      if (v === 0x0000) black++;
      if (v === 0xFFFF) white++;
      else {
        nonWhite++;
        if (y >= 30) bodyNonWhite++;
      }
    }
  }
  return { black, white, nonWhite, bodyNonWhite };
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
      let hasColor = false;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const x = cx * cellW + dx;
          const y = cy * cellH + dy;
          if (x >= W || y >= H) continue;
          const v = word(mem, x, y);
          if (v === 0x0000) hasBlack = true;
          else if (v !== 0xFFFF) hasColor = true;
        }
      }
      line += hasBlack ? '#' : hasColor ? '+' : ' ';
    }
    lines.push(`${String(cy * cellH).padStart(3)}|${line}`);
  }
  return lines.join('\n');
}

function printAddrs(label, addrs) {
  console.log(label);
  for (let i = 0; i < addrs.length; i += 4) {
    console.log('  ' + addrs.slice(i, i + 4).map((a) => `${hex(a, 6)}=${hex(read24(mem, a), 6)} b=${hex(mem[a], 2)}`).join('  '));
  }
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
  return executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
}

function setupLaunchFrame() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const sp = STACK_RESET_TOP - 24;
  cpu.sp = sp;
  mem.fill(0xFF, sp, STACK_RESET_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, IDLE_LOOP);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
}

function restorePostInit() {
  mem.set(postInitRamSnap, 0x400000);
  for (const [f, v] of Object.entries(postInitCpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) {
    const sp = STACK_RESET_TOP - 24;
    cpu.sp = sp;
    mem.fill(0xFF, sp, STACK_RESET_TOP);
    cpu.sp -= 3;
    write24(mem, cpu.sp, IDLE_LOOP);
  }
  if (read24(mem, 0xD008E0) === 0) write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
}

function runVariant(name, entry, mutate) {
  restorePostInit();
  if (mutate) mutate();
  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  let result;
  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps: 1_500_000,
      maxLoopIterations: 60000,
      onBlock(pc) {
        const p = pc & 0xFFFFFF;
        for (const [watchName, watchPc] of Object.entries(WATCH)) {
          if (p === watchPc) hits[watchName]++;
        }
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) };
  }
  const stats = vramStats(mem);
  console.log(`\n### ${name}: entry=${hex(entry)} ###`);
  console.log(`  run: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ' err=' + result.error : ''}`);
  console.log(`  watch hits: ${Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  edit cursors: D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))}`);
  console.log(`  VRAM: black=${stats.black} nonWhite=${stats.nonWhite} bodyNonWhite=${stats.bodyNonWhite}`);
  console.log(`  --- ASCII map (${name}) ---\n${asciiMap(mem)}`);
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-postinit-display: real launch-home init then display variants ===\n');
const idle = bootToIdle();
console.log(`boot-to-idle: steps=${idle.steps} term=${idle.termination} lastPc=${hex(idle.lastPc)}`);

setupLaunchFrame();
const init = executor.runFrom(LAUNCH_HOME_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log(`launch-home init 0x09DD62: steps=${init.steps} term=${init.termination} lastPc=${hex(init.lastPc)}`);
printAddrs('post-init VERIFY:', VERIFY_ADDRS);
const postInitStats = vramStats(mem);
console.log(`post-init VRAM: black=${postInitStats.black} nonWhite=${postInitStats.nonWhite} bodyNonWhite=${postInitStats.bodyNonWhite}`);

const postInitRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const postInitCpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

runVariant('V1 repaint pre-handler', 0x058241);
runVariant('V2 real cxMain handler', 0x0585E9);
runVariant('V3 MathPrint populator direct', 0x044D3F);
if ((postInitRamSnap[0xD00082 - 0x400000] & 0x80) === 0) {
  runVariant('V3b MathPrint populator direct with D00082 bit7 set', 0x044D3F, () => { mem[0xD00082] |= 0x80; });
} else {
  console.log('\n### V3b skipped: D00082 bit7 already set by real init ###');
}

console.log('\n=== SUCCESS SIGNALS: nonzero edit cursors, watch hits in popCore/walker/rasterizer, or bodyNonWhite/ascii body pixels ===');
