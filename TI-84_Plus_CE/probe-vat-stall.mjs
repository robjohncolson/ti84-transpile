#!/usr/bin/env node
// "Make it run" iteration 5: confirm the home-screen stall is a runaway VAT
// (symbol-table) search, not an event-wait.
//
// Iteration 4 showed the home repaint 0x058241 -> CoorMon spins in the hot loop
// 0x082be2 <-> 0x084711..0x084723 (~195K iters). The decode corpus identifies:
//   0x0846EA = symbol-table searcher (search loop body 0x084711)
//   0x082BE2 = record rewind (HL -= 6)
// The searcher walks HL DOWN by 6 each step until HL < DE (boundary from VAT
// pointers D0259D/D0259A/D02590). A runaway means the boundary is uninitialized
// (0 / garbage), so the search never terminates -> CoorMon never paints.
//
// This probe: (1) dumps the VAT pointers at idle, (2) confirms 0x084711 is the
// runaway, (3) tests whether forcing an "empty VAT" (boundary = top of RAM) lets
// the search terminate and the home screen paint (black/text pixels appear).

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

// VAT / symbol-table region pointers (3-byte each) read by the searcher's bounds check.
const VAT_PTRS = {
  D02590: 0xD02590, D02593: 0xD02593, D0258A: 0xD0258A, D0258D: 0xD0258D,
  D0259A: 0xD0259A, D0259D: 0xD0259D,
};
const SEARCH_LOOP = 0x084711;   // 0x0846EA search-loop body
const SEARCH_ENTRY = 0x0846EA;

function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }

function vramStats(mem) {
  let black = 0, white = 0;
  for (let i = 0; i < VRAM_WORDS; i++) {
    const a = VRAM_BASE + i * 2;
    const v = mem[a] | (mem[a + 1] << 8);
    if (v === 0x0000) black++;
    else if (v === 0xFFFF) white++;
  }
  return { black, white };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Iteration 5: is the home-screen stall a runaway VAT search? ===\n');

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
console.log('VAT / symbol-table pointers at idle:');
for (const [name, a] of Object.entries(VAT_PTRS)) console.log(`  ${name} = ${hex(read24(mem, a))}`);
console.log(`idle VRAM black=${idleVram.black} white=${idleVram.white}\n`);

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
}

function driveRepaint(label, { emptyVat }) {
  restoreIdle();
  mem[0xD007E0] = 0x40;
  if (emptyVat) {
    // Force every VAT boundary pointer to the top of RAM so any symbol search
    // (HL walks DOWN to boundary DE) terminates on iteration 0 (HL < DE).
    for (const a of Object.values(VAT_PTRS)) write24(mem, a, 0xD3FFFF);
  }
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(0x08C33D & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);

  let searchLoop = 0, searchEntry = 0;
  let r;
  try {
    r = executor.runFrom(0x058241, 'adl', {
      maxSteps: 1_500_000, maxLoopIterations: 60000,
      onBlock: (pc) => { if (pc === SEARCH_LOOP) searchLoop++; else if (pc === SEARCH_ENTRY) searchEntry++; },
    });
  } catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }

  const va = vramStats(mem);
  console.log(`--- ${label} ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  0x0846EA entries=${searchEntry}, search-loop 0x084711 iters=${searchLoop}`);
  console.log(`  VRAM black ${idleVram.black} -> ${va.black} (${va.black !== idleVram.black ? '*** TEXT/BLACK APPEARED ***' : 'no black'}) white ${idleVram.white} -> ${va.white}\n`);
}

driveRepaint('baseline (VAT as-booted)', { emptyVat: false });
driveRepaint('forced empty VAT (boundary = 0xD3FFFF)', { emptyVat: true });

console.log('=== READ: does fixing the VAT boundary stop the runaway search? ===');
