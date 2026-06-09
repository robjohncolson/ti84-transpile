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
const VRAM_WORDS = 320 * 240;
const IDLE_LOOP = 0x0019be;
const PAINT = 0x058241;
const PAINT_RETURN = 0x08C33D;

const OS_SCAN_2 = 0x31;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const WATCH = {
  getCSC: 0x03FA09,
  scanTranslate: 0x03011C,
  dispatcher: 0x099921,
  keyToToken: 0x061D1A,
  tokenProcessor: 0x03E1B4,
  walker: 0x07D1B4,
  populator: 0x044D3F,
  rasterizer: 0x0A1799,
  keyPreProcessor: 0x06CE73,
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function hexdump(mem, start, end) {
  const out = [];
  for (let a = start; a < end; a += 16) {
    const bytes = [];
    for (let b = 0; b < 16 && a + b < end; b++) bytes.push(mem[a + b].toString(16).padStart(2, '0'));
    out.push(`${hex(a)}: ${bytes.join(' ')}`);
  }
  return out.join('\n');
}

function vramStats(mem) {
  let black = 0, nonWhite = 0, hash = 0;
  for (let i = 0; i < VRAM_WORDS; i++) {
    const a = VRAM_BASE + i * 2;
    const v = mem[a] | (mem[a + 1] << 8);
    if (v === 0x0000) black++;
    if (v !== 0xFFFF) nonWhite++;
    hash = (hash + v * ((i & 0xFFFF) + 1)) >>> 0;
  }
  return { black, nonWhite, hash };
}

function seedVat(mem) {
  write24(mem, 0xD02587, 0xD1A881);
  write24(mem, 0xD0258A, 0xD1A881);
  write24(mem, 0xD0258D, 0xD1A881);
  write24(mem, 0xD025A0, 0xD1A881);
  write24(mem, 0xD0259A, 0xD3FFFF);
  write24(mem, 0xD02590, 0xD3FFFF);
  write24(mem, 0xD02593, 0xD3FFFF);
  write24(mem, 0xD0259D, 0xD3FFFF);
  write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
}

function installKey(mem, peripherals) {
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== keypress roundtrip after VAT seed + status paint ===');
console.log(`digit 2: OS scan=${hex(OS_SCAN_2, 2)} internal=${hex(INTERNAL_2, 2)} matrix=[${KEY_MATRIX_GROUP},${KEY_MATRIX_BIT}]\n`);

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
const idleRun = executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
console.log(`boot idle: steps=${idleRun.steps} term=${idleRun.termination} lastPc=${hex(idleRun.lastPc)}\n`);

const idleRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const idleCpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(idleRamSnap, 0x400000);
  for (const [f, v] of Object.entries(idleCpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
  for (let g = 0; g < 8; g++) peripherals.setMatrixKey(g, KEY_MATRIX_BIT, false);
}

function preparePaint(mathPrint) {
  restoreIdle();
  seedVat(mem);
  mem[0xD007E0] = 0x40;
  if (mathPrint) mem[0xD00082] = (mem[0xD00082] | 0x80) & 0xFF;
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(PAINT_RETURN & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
  return executor.runFrom(PAINT, 'adl', { maxSteps: 1_200_000, maxLoopIterations: 60000 });
}

function runVariant(label, { pendingKey = false, mathPrint = false } = {}) {
  const paintRun = preparePaint(mathPrint);
  const baseline = vramStats(mem);
  const paintedRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const paintedCpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

  mem.set(paintedRamSnap, 0x400000);
  for (const [f, v] of Object.entries(paintedCpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(true);
  installKey(mem, peripherals);
  if (pendingKey) mem[0xD0146D] = INTERNAL_2;
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;

  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  let irqs = 0;
  const irqVectors = [];
  let run;
  try {
    run = executor.runFrom(IDLE_LOOP, 'adl', {
      maxSteps: 1_500_000,
      maxLoopIterations: 100000,
      onBlock: (pc) => {
        for (const [name, addr] of Object.entries(WATCH)) if (pc === addr) hits[name]++;
      },
      onInterrupt: (type, retPc, vector) => {
        irqs++;
        if (irqVectors.length < 8) irqVectors.push(`${type}@${hex(vector)}`);
      },
    });
  } catch (e) {
    run = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) };
  }

  const after = vramStats(mem);
  const fired = Object.entries(hits).filter(([, n]) => n > 0).map(([name, n]) => `${name}x${n}`);
  console.log(`--- ${label} ---`);
  console.log(`  paint: steps=${paintRun.steps} term=${paintRun.termination} lastPc=${hex(paintRun.lastPc)}`);
  console.log(`  event: steps=${run.steps} term=${run.termination} lastPc=${hex(run.lastPc)}${run.error ? ' err=' + run.error : ''}`);
  console.log(`  IRQs=${irqs}${irqVectors.length ? ' [' + irqVectors.join(' ') + ']' : ''}`);
  console.log(`  chain: ${fired.length ? fired.join(' ') : '(none)'}`);
  console.log(`  key consumed (D00080 bit3 cleared): ${(mem[0xD00080] & 0x08) === 0 ? 'YES' : 'no'}; D00080=${hex(mem[0xD00080], 2)} D0146D=${hex(mem[0xD0146D], 2)}`);
  console.log(`  edit cursors: D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))}`);
  console.log(`  D02434-D02460:\n${hexdump(mem, 0xD02434, 0xD02460)}`);
  console.log(`  VRAM delta vs post-paint: black ${baseline.black}->${after.black} (${after.black - baseline.black}), nonWhite ${baseline.nonWhite}->${after.nonWhite} (${after.nonWhite - baseline.nonWhite}), changed=${baseline.hash === after.hash ? 'no' : 'YES'}\n`);
}

runVariant('variant 1: plain timer-IRQ delivery');
runVariant('variant 2: timer-IRQ delivery + D0146D pending key', { pendingKey: true });
runVariant('variant 3: MathPrint bit before paint + plain delivery', { mathPrint: true });

console.log('=== READ: did digit 2 reach dispatcher/token/edit/VRAM after painted home context? ===');
