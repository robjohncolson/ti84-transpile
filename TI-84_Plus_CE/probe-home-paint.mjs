#!/usr/bin/env node
// "Make it run" iteration 4: paint the home screen through OS code.
//
// Diagnosis from iteration 3 + decode corpus:
//  - D007E0=0x00 at idle (invalid mode) -> display dispatcher 0x062055 paints
//    nothing. 0x062055 writes D007E0=0x40 at 0x0620C0 then CALL 0x058241
//    (home-screen repaint, 423B). But 0x062055 has zero static callers.
//  - Prior probes (phase129/130) drove 0x058241 and it STALLED at a busy-wait
//    0x09EFDE "waiting for hardware interrupts that never arrive" -- but those
//    ran with the timer OFF.
//
// Hypothesis: the busy-wait wants the timer IRQ. cpu-runtime wakes EI;HALT and
// preempts blocks on a pending IRQ. So enabling the timer may let the repaint
// get past 0x09EFDE and actually paint (black/text pixels on the blank screen).
//
// This probe boots to idle, seeds D007E0=0x40, then drives candidate home
// entries with the timer ON vs OFF, reporting where each spends its time
// (hot-PC histogram), where it stalls, and whether black/text pixels appear.

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

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const WATCH = {
  dispatcher: 0x062055,   // event-loop display dispatcher (writes D007E0=0x40)
  repaint:    0x058241,   // home-screen repaint (cxMain pre-handler)
  coorMon:    0x0582B8,   // narrow CoorMon
  coorMon2:   0x08BF22,   // CoorMon event loop entry (the phase129 stall caller)
  busyWait:   0x09EFDE,   // the documented MMIO busy-wait
  cxTable:    0x0585D3,   // cxMain dispatch table JP (HL)
  statusBar:  0x0A2B72,   // golden-regression paint routines
  modeText:   0x0A29EC,
  walker:     0x07D1B4,
  rasterizer: 0x0A1799,
};

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
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Iteration 4: paint the home screen through OS code ===\n');

// Boot to idle (proven sequence).
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
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const idleVram = vramStats(mem);
console.log(`idle: VRAM black=${idleVram.black} white=${idleVram.white} | D007E0=${hex(mem[0xD007E0], 2)} D007CA=${hex(mem[0xD007CA] | (mem[0xD007CB] << 8) | (mem[0xD007CC] << 16))}\n`);

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
}

function runVariant(label, entry, { timer, seedMode }) {
  restoreIdle();
  if (seedMode) mem[0xD007E0] = 0x40;        // valid main-display mode
  if (timer) peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(0x08C33D & 0xFFFFFF);             // event-loop cleanup as return target
  mem[0xD008E0] = cpu.sp & 0xFF; mem[0xD008E1] = (cpu.sp >> 8) & 0xFF; mem[0xD008E2] = (cpu.sp >> 16) & 0xFF;

  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  const ramGap = new Set();
  const pcCount = new Map();
  let irqs = 0;

  let r;
  try {
    r = executor.runFrom(entry, 'adl', {
      maxSteps: 1_000_000, maxLoopIterations: 60000,
      onBlock: (pc) => {
        pcCount.set(pc, (pcCount.get(pc) || 0) + 1);
        for (const [n, a] of Object.entries(WATCH)) if (pc === a) hits[n]++;
      },
      onMissingBlock: (pc) => { if (pc >= 0xD00000) ramGap.add(pc >>> 0); },
      onInterrupt: () => { irqs++; },
    });
  } catch (e) {
    r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) };
  }

  const va = vramStats(mem);
  const reached = Object.keys(WATCH).filter((k) => hits[k] > 0);
  const hot = [...pcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([pc, c]) => `${hex(pc)}:${c}`).join(' ');
  console.log(`--- ${label} (entry ${hex(entry)}, timer=${timer ? 'on' : 'off'}, seedMode=${seedMode ? 'Y' : 'N'}) ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)} IRQs=${irqs}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  chain: ${reached.length ? reached.map((k) => `${k}x${hits[k]}`).join(' ') : '(none)'}`);
  console.log(`  hot blocks: ${hot}`);
  console.log(`  VRAM black ${idleVram.black} -> ${va.black} (${va.black !== idleVram.black ? '*** TEXT/BLACK APPEARED ***' : 'no black'}), changed=${va.hash !== idleVram.hash ? 'YES' : 'no'}`);
  console.log(`  D007E0=${hex(mem[0xD007E0], 2)} RAM gap: ${ramGap.size}${ramGap.size ? ' [' + [...ramGap].slice(0, 6).map((a) => hex(a)).join(' ') + ']' : ''}\n`);
}

runVariant('repaint 0x058241 timer-ON',  0x058241, { timer: true,  seedMode: true });
runVariant('repaint 0x058241 timer-OFF', 0x058241, { timer: false, seedMode: true });
runVariant('dispatcher 0x062055 timer-ON', 0x062055, { timer: true, seedMode: false });
runVariant('CoorMon 0x08BF22 timer-ON',  0x08BF22, { timer: true,  seedMode: true });

console.log('=== READ: does enabling the timer IRQ let the home screen paint? ===');
