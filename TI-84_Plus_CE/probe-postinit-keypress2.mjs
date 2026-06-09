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
const IDLE_RETURN = 0x0019b5;
const INIT_RETURN = 0x0019be;
const EVENT_LOOP = 0x08C331;
const LAUNCH_INIT = 0x09DD62;
const REPAINT = 0x058241;
const CX_MAIN_HANDLER = 0x0585E9;
const VRAM_BASE = 0xD40000;
const VRAM_WORDS = 320 * 240;

const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const WATCH = {
  evloop: 0x08C331,
  getcsc: 0x03FA09,
  keypre: 0x06CE73,
  dispatch: 0x099921,
  keyToToken: 0x061D1A,
  tokenProc: 0x03E1B4,
  walker: 0x07D1B4,
  populatorMP: 0x044D3F,
  populator2: 0x044DB3,
  rasterizer: 0x0A1799,
  rStrCurRow: 0x0A29EC,
  cxMainHandler: CX_MAIN_HANDLER,
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }

function snapshotCpu(cpu) {
  return Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
}

function vramStats(mem) {
  let black = 0;
  let nonWhite = 0;
  let hash = 0;
  for (let i = 0; i < VRAM_WORDS; i++) {
    const a = VRAM_BASE + i * 2;
    const v = mem[a] | (mem[a + 1] << 8);
    if (v === 0x0000) black++;
    if (v !== 0xFFFF) nonWhite++;
    hash = (hash + Math.imul(v, (i & 0xFFFF) + 1)) >>> 0;
  }
  return { black, nonWhite, hash };
}

function bodyNonWhite(mem) {
  let count = 0;
  for (let row = 30; row < 240; row++) {
    for (let col = 0; col < 320; col++) {
      const a = VRAM_BASE + (row * 320 + col) * 2;
      const v = mem[a] | (mem[a + 1] << 8);
      if (v !== 0xFFFF) count++;
    }
  }
  return count;
}

function hexdump(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(mem[addr + i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function createWatchHits() {
  return Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
}

function formatHits(hits) {
  return Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ');
}

function clearMatrix(peripherals) {
  for (let g = 0; g < 8; g++) {
    for (let b = 0; b < 8; b++) peripherals.setMatrixKey(g, b, false);
  }
}

function pressKey() {
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function runWithWatches(entry, maxSteps, maxLoopIterations) {
  const hits = createWatchHits();
  let irqs = 0;
  const irqVectors = [];
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
      onInterrupt(type, _retPc, vector) {
        irqs++;
        if (irqVectors.length < 8) irqVectors.push(`${type}@${hex(vector)}`);
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  return { result, hits, irqs, irqVectors };
}

function pushReturn(addr) {
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, addr);
  if (read24(mem, 0xD008E0) === 0) write24(mem, 0xD008E0, cpu.sp);
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-postinit-keypress2: post launch-init digit-2 key flow ===');
console.log(`digit 2 OS scan=${hex(OS_SCAN_2, 2)} internal=${hex(INTERNAL_2, 2)} keyMatrix[${KEY_MATRIX_GROUP}] bit${KEY_MATRIX_BIT}`);
console.log('');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(EVENT_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
const idleRun = executor.runFrom(INIT_RETURN, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
console.log(`boot-to-idle: steps=${idleRun.steps} term=${idleRun.termination} lastPc=${hex(idleRun.lastPc)}`);

peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = STACK_RESET_TOP - 24;
cpu.sp = launchSp;
write24(mem, launchSp, INIT_RETURN);
write24(mem, 0xD008E0, launchSp);
const launchRun = executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log(`launch-init: steps=${launchRun.steps} term=${launchRun.termination} lastPc=${hex(launchRun.lastPc)}`);
console.log(
  `post-init: D007CA=${hex(read24(mem, 0xD007CA))} D007E0=${hex(mem[0xD007E0], 2)} ` +
  `D008E0=${hex(read24(mem, 0xD008E0))} D00080=${hex(mem[0xD00080], 2)}`,
);

if (read24(mem, 0xD007CA) !== CX_MAIN_HANDLER) {
  throw new Error(`ABORT: launch-init did not install cxMainHandler; D007CA=${hex(read24(mem, 0xD007CA))}, expected ${hex(CX_MAIN_HANDLER)}`);
}
console.log('');

const postRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const postCpuSnap = snapshotCpu(cpu);

function restorePostInit() {
  mem.set(postRamSnap, 0x400000);
  restoreCpu(cpu, postCpuSnap);
  peripherals.setTimerEnabled(false);
  clearMatrix(peripherals);
}

function prepareEventLoop(timer) {
  pressKey();
  peripherals.setTimerEnabled(timer);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
}

function reportVariant(name, result, hits, irqs, irqVectors, beforeVram) {
  const afterVram = vramStats(mem);
  const keyConsumed = (mem[0xD00080] & 0x08) === 0;
  const stateSurvived = read24(mem, 0xD007CA) === CX_MAIN_HANDLER;
  console.log(`--- ${name} ---`);
  console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ` err=${result.error}` : ''}`);
  console.log(`  IRQs=${irqs}${irqVectors.length ? ` [${irqVectors.join(' ')}]` : ''}`);
  console.log(`  chain hits: ${formatHits(hits)}`);
  console.log(`  key consumed (D00080 bit3 cleared): ${keyConsumed ? 'YES' : 'no'} D00080=${hex(mem[0xD00080], 2)}`);
  console.log(`  D00587=${hex(mem[0xD00587], 2)} D0058E=${hex(mem[0xD0058E], 2)} D0058D=${hex(mem[0xD0058D], 2)}`);
  console.log(`  edit cursors: D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))}`);
  console.log(`  D02434[32]: ${hexdump(mem, 0xD02434, 32)}`);
  console.log(`  VRAM black ${beforeVram.black}->${afterVram.black} nonWhite ${beforeVram.nonWhite}->${afterVram.nonWhite} hashChanged=${afterVram.hash !== beforeVram.hash ? 'YES' : 'no'}`);
  console.log(`  body rows 30-239 nonWhite after=${bodyNonWhite(mem)}`);
  console.log(`  D007CA still ${hex(CX_MAIN_HANDLER)}: ${stateSurvived ? 'YES' : 'no'} (${hex(read24(mem, 0xD007CA))})`);
  console.log('');
}

function runVariant(name, setup, timer, maxSteps = 800000, maxLoopIterations = 100000) {
  restorePostInit();
  const beforeVram = setup?.() || vramStats(mem);
  prepareEventLoop(timer);
  const { result, hits, irqs, irqVectors } = runWithWatches(EVENT_LOOP, maxSteps, maxLoopIterations);
  reportVariant(name, result, hits, irqs, irqVectors, beforeVram);
}

runVariant('V1 timer ON @ event loop top', () => vramStats(mem), true);
runVariant('V2 timer OFF @ event loop top', () => vramStats(mem), false);
runVariant('V3 repaint, then timer ON @ event loop top', () => {
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  pushReturn(IDLE_RETURN);
  const repaint = executor.runFrom(REPAINT, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 60000 });
  const painted = vramStats(mem);
  console.log(`V3 repaint: steps=${repaint.steps} term=${repaint.termination} lastPc=${hex(repaint.lastPc)} VRAM nonWhite=${painted.nonWhite}`);
  return painted;
}, true);

console.log('=== done ===');
