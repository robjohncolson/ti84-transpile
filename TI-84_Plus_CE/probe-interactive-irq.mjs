#!/usr/bin/env node
// "Make it run" iteration 3: interrupt-driven keypress -> render.
//
// Every prior probe killed interrupts (timerInterrupt:false) and drove OS
// internals cold (dispatcher 0x099874, populator 0x044D3F). They all fall
// straight back into the idle HALT at 0x0019b5 without processing anything.
//
// The CE is interrupt-driven: the OS idle is `EI; HALT` waiting for the timer
// IRQ; the timer ISR scans the keyboard and feeds the event loop. cpu-runtime
// implements IM2 wake-from-HALT. So the untried path is: boot to idle, press a
// key, then let the OS's OWN loop read+dispatch it — either by polling the
// key-available RAM flag (D00080 bit3) or by enabling the timer IRQ so the OS
// ISR scans the key matrix naturally.
//
// This probe boots once, snapshots idle, then runs variants:
//   A. resume event loop 0x08C331, poll-only (timer off, key seeded in RAM+matrix)
//   B. resume event loop 0x08C331, timer IRQ on (key seeded in RAM+matrix)
//   C. resume idle loop  0x0019be, timer IRQ on
//   D. resume idle loop  0x0019be, poll-only
// and reports, per variant: IRQs fired, which chain stages ran, whether the key
// was consumed, edit-context RAM, and whether black (text) pixels appeared.

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
const VRAM_WORDS = 320 * 240;          // 16-bit words
const EVENT_LOOP = 0x08C331;
const IDLE_LOOP = 0x0019be;

// '2' key: OS scan code, internal code, and matrix cell (from tracer-bullet v3).
const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];   // translation table lookup
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

// Full key -> render chain plus the key-read front end.
const WATCH = {
  evloop:     0x08C331,   // event loop top
  getcsc:     0x03FA09,   // _GetCSC (key consumed)
  keysetup:   0x0A27DD,   // key input setup
  keypre:     0x06CE73,   // key dispatch pre-processor
  dispatch:   0x099921,   // character dispatcher
  keyToToken: 0x061D1A,   // key-to-token / longjmp path
  tokenProc:  0x03E1B4,   // token insertion into edit buffer
  walker:     0x07D1B4,   // descriptor walker (render)
  rasterizer: 0x0A1799,   // glyph -> VRAM
  rStrCurRow: 0x0A29EC,   // render-string current row (proven glyph draw)
  populator:  0x044DB3,   // home-screen populator section
};

const RAM_WATCH = {
  keyAvail:  0xD00080,    // bit3 = key available
  scanCode:  0xD00587,
  internal:  0xD0058E,
  internal2: 0xD0058D,
  mathprint: 0xD00082,
};

function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }

function vramStats(mem) {
  let black = 0, white = 0, hash = 0;
  for (let i = 0; i < VRAM_WORDS; i++) {
    const a = VRAM_BASE + i * 2;
    const v = mem[a] | (mem[a + 1] << 8);
    if (v === 0x0000) black++;
    else if (v === 0xFFFF) white++;
    hash = (hash + v * ((i & 0xFFFF) + 1)) >>> 0;
  }
  return { black, white, hash };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
// Boot uses timerInterrupt:false to avoid the 0x1713 init hijack (per CLAUDE.md).
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Iteration 3: interrupt-driven keypress -> render ===');
console.log(`'2': OS scan ${hex(OS_SCAN_2, 2)} -> internal ${hex(INTERNAL_2, 2)}, matrix [${KEY_MATRIX_GROUP},${KEY_MATRIX_BIT}]\n`);

// ---- Boot to idle (proven sequence from probe-edit-context / tracer-bullet) ----
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
const idleRun = executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const idleVram = vramStats(mem);
console.log(`idle: term=${idleRun.termination} lastPc=${hex(idleRun.lastPc)} | VRAM black=${idleVram.black} white=${idleVram.white} I=${hex(cpu.i, 2)} im=${cpu.im} iff1=${cpu.iff1}`);
console.log(`idle editCursor D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))} keyAvail=${hex(mem[0xD00080], 2)}\n`);

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
  // Clear any pressed matrix keys.
  for (let g = 0; g < 8; g++) peripherals.setMatrixKey(g, KEY_MATRIX_BIT, false);
}

function pressKey() {
  // Drive both the poll model (RAM flag) and the hardware model (matrix).
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function runVariant(label, resumePc, { timer }) {
  restoreIdle();
  pressKey();
  if (timer) peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  // Keep the OS's own idle SP; just guarantee a sane floor + longjmp anchor.
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  mem[0xD008E0] = cpu.sp & 0xFF;
  mem[0xD008E1] = (cpu.sp >> 8) & 0xFF;
  mem[0xD008E2] = (cpu.sp >> 16) & 0xFF;

  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  const ramGap = new Set();
  let irqs = 0; const irqVectors = [];

  let r;
  try {
    r = executor.runFrom(resumePc, 'adl', {
      maxSteps: 800_000, maxLoopIterations: 100000,
      onBlock: (pc) => { for (const [n, a] of Object.entries(WATCH)) if (pc === a) hits[n]++; },
      onMissingBlock: (pc) => { if (pc >= 0xD00000) ramGap.add(pc >>> 0); },
      onInterrupt: (type, retPc, vector) => { irqs++; if (irqVectors.length < 4) irqVectors.push(`${type}@${hex(vector)}`); },
    });
  } catch (e) {
    r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) };
  }

  const va = vramStats(mem);
  const reached = Object.keys(WATCH).filter((k) => hits[k] > 0);
  const keyConsumed = (mem[0xD00080] & 0x08) === 0;
  console.log(`--- ${label} (resume ${hex(resumePc)}, timer=${timer ? 'on' : 'off'}) ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  IRQs=${irqs}${irqVectors.length ? ' [' + irqVectors.join(' ') + ']' : ''}`);
  console.log(`  chain: ${reached.length ? reached.map((k) => `${k}x${hits[k]}`).join(' ') : '(none)'}`);
  console.log(`  key consumed (D00080 bit3 cleared): ${keyConsumed ? 'YES' : 'no'} | scanCode D00587=${hex(mem[0xD00587], 2)}`);
  console.log(`  editCursor D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))} mathprint D00082=${hex(mem[0xD00082], 2)}`);
  console.log(`  VRAM black ${idleVram.black} -> ${va.black} (${va.black !== idleVram.black ? 'TEXT APPEARED' : 'no black pixels'}), changed=${va.hash !== idleVram.hash ? 'YES' : 'no'}`);
  console.log(`  RAM gap: ${ramGap.size}${ramGap.size ? ' [' + [...ramGap].slice(0, 6).map((a) => hex(a)).join(' ') + ']' : ''}\n`);
  return { hits, va, keyConsumed, irqs };
}

runVariant('B timer-IRQ @ event loop', EVENT_LOOP, { timer: true });
runVariant('A poll-only @ event loop', EVENT_LOOP, { timer: false });
runVariant('C timer-IRQ @ idle loop', IDLE_LOOP, { timer: true });
runVariant('D poll-only @ idle loop', IDLE_LOOP, { timer: false });

console.log('=== READ: does the OS event loop process a key when driven naturally? ===');
