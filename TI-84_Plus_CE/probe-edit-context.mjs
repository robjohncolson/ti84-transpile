#!/usr/bin/env node
// "Make it run" iteration 1: drive the home-screen populator to a live edit
// context, then feed '2'. The populator 0x044D3F (true entry; 0x044DB3 is the
// populator section) has gating exits we must characterize:
//   - mode select via IY+15 bits 2/3/4
//   - gate: D02032 must contain mode bits else JP 0x061D46
//   - early exit: D00603==0 -> JP 0x0446F2
//   - alt render: D0008F bit0 -> JP 0x044BD3
//   - MathPrint cursor populator only runs if D00082 bit7 set (else skipped)
// This probe drives the populator and reports which path/exit it takes and
// whether VRAM + edit RAM (D0231A cursor) come alive.

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
const VRAM_BYTES = 320 * 240 * 2;
const EDIT_CURSOR = 0xD0231A;
const EDIT_BOUND  = 0xD0231D;

const WATCH = {
  entry:        0x044D3F,
  redrawChk:    0x045357,
  populator:    0x07D583,
  postLoop:     0x044FC2,
  walker:       0x07D1B4,
  rasterizer:   0x0A1799,
  exitEarly:    0x0446F2,   // D00603==0 exit
  exitGate:     0x061D46,   // mode-gate fail exit
  exitAlt:      0x044BD3,   // D0008F bit0 alt-render
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

function coldBoot(executor, cpu, mem) {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function vramFingerprint(mem) {
  let nz = 0, hash = 0;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_BYTES; i += 2) {
    const v = mem[i] | (mem[i + 1] << 8);
    if (v !== 0) nz++;
    hash = (hash + v * (i & 0xFFFF)) >>> 0;
  }
  return { nz, hash };
}

function makeTracker() {
  const order = [], ramAddrs = new Set(), watchHits = {};
  for (const k of Object.keys(WATCH)) watchHits[k] = 0;
  return {
    order, ramAddrs, watchHits,
    onBlock(pc) {
      for (const [n, a] of Object.entries(WATCH)) if (pc === a) { watchHits[n]++; if (order.length < 60) order.push(n); }
    },
    onMissingBlock(pc) { if (pc >= 0xD00000) ramAddrs.add(pc >>> 0); },
  };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Edit-context iteration 1: drive home-screen populator ===\n');

coldBoot(executor, cpu, mem);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 24; mem.fill(0xFF, cpu.sp, cpu.sp + 24);
}

function gateState(label) {
  const d00082 = mem[0xD00082], d0008f = mem[0xD0008F], d00603 = mem[0xD00603], d02032 = mem[0xD02032];
  const iy15 = mem[0xD0008F]; // IY+15 = D0008F
  console.log(`  ${label}: D00082=${hex(d00082,2)}(MathPrint bit7=${(d00082>>7)&1}) D0008F=${hex(d0008f,2)}(bit0=${d0008f&1}) D00603=${hex(d00603,2)} D02032=${hex(d02032,2)}`);
}

function drivePopulator(label, entry, setup) {
  restoreIdle();
  if (setup) setup();
  const t = makeTracker();
  const vb = vramFingerprint(mem);
  cpu.push(0x044708 & 0xFFFFFF);
  // Seed D008E0 (saved main-loop SP for the longjmp unwind) so an error-bail /
  // longjmp lands cleanly instead of crashing on a garbage SP.
  mem[0xD008E0] = cpu.sp & 0xFF;
  mem[0xD008E1] = (cpu.sp >> 8) & 0xFF;
  mem[0xD008E2] = (cpu.sp >> 16) & 0xFF;
  let r;
  try {
    r = executor.runFrom(entry, 'adl', {
      maxSteps: 2_000_000, maxLoopIterations: 100000,
      onBlock: (pc) => t.onBlock(pc), onMissingBlock: (pc) => t.onMissingBlock(pc),
    });
  } catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
  const va = vramFingerprint(mem);
  const cur = [...mem.slice(EDIT_CURSOR, EDIT_CURSOR + 6)].map((b) => hex(b, 2)).join(' ');
  console.log(`\n--- ${label} (entry ${hex(entry)}) ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  path: ${t.order.join(' -> ') || '(no watch points hit)'}`);
  console.log(`  reached: ${Object.keys(WATCH).filter((k) => t.watchHits[k] > 0).join(', ') || '(none)'}`);
  console.log(`  VRAM nz ${vb.nz} -> ${va.nz} (${va.hash !== vb.hash ? 'CHANGED' : 'same'})`);
  console.log(`  editCursor[${hex(EDIT_CURSOR)}] = ${cur}`);
  console.log(`  RAM gap: ${t.ramAddrs.size}${t.ramAddrs.size ? ' [' + [...t.ramAddrs].slice(0,6).map(a=>hex(a)).join(' ') + ']' : ''}`);
  return t;
}

console.log('Gate state at idle:');
gateState('idle');

// Attempt A: drive populator as-is (whatever idle state produced).
drivePopulator('populator as-is', 0x044D3F);

// Attempt B: force MathPrint on (D00082 bit7) so the cursor populator path runs.
drivePopulator('populator + MathPrint on', 0x044D3F, () => { mem[0xD00082] |= 0x80; });

// Attempt C: also clear D0008F bit0 (avoid alt-render skip) + nonzero D00603.
drivePopulator('populator + MathPrint + gates', 0x044D3F, () => {
  mem[0xD00082] |= 0x80; mem[0xD0008F] &= ~0x01; if (mem[0xD00603] === 0) mem[0xD00603] = 0x01;
});

// Attempt D: the populator section entry directly.
drivePopulator('populator section 0x044DB3', 0x044DB3, () => { mem[0xD00082] |= 0x80; });

console.log('\n=== READ: which gate stops the home screen from coming alive? ===');
