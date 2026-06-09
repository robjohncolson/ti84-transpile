#!/usr/bin/env node
// Iteration 8: does correct VAT init also unblock the home-screen BODY populator?
//
// Iteration 2 found 0x044D3F bails cold in ~86 steps: CALL 0x07F81D (FP/descriptor
// validation) returns carry -> JR C,0x044D3B -> 0x061D52 longjmp. That validation
// reads OP/FP state, which lives in the VAT region we now know was uninitialized.
// Hypothesis: with a correct VAT, 0x07F81D no longer returns carry, and the
// populator runs into its body (0x07D583) and renders the entry line + cursor.

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

const WATCH = {
  fpValidate: 0x07F81D,   // the iteration-2 bail call
  bail:       0x044D3B,   // error trampoline (carry path)
  popCore:    0x07D583,   // populator core
  postPop:    0x044FC2,   // post-populator
  walker:     0x07D1B4,   // descriptor walker (render)
  rasterizer: 0x0A1799,   // glyph -> VRAM
  rStrCurRow: 0x0A29EC,   // render-string current row
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }
function vramStats(mem) {
  let nonWhite = 0, black = 0;
  for (let i = 0; i < W * H; i++) { const a = VRAM_BASE + i * 2; const v = mem[a] | (mem[a + 1] << 8); if (v !== 0xFFFF) nonWhite++; if (v === 0) black++; }
  return { nonWhite, black };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== Iteration 8: does correct VAT unblock the home BODY populator? ===\n');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
function restoreIdle() { mem.set(ramSnap, 0x400000); for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v; peripherals.setTimerEnabled(false); }
function seedVat() {
  write24(mem, 0xD02587, 0xD1A881); write24(mem, 0xD0258A, 0xD1A881);
  write24(mem, 0xD0258D, 0xD1A881); write24(mem, 0xD025A0, 0xD1A881);
  write24(mem, 0xD0259A, 0xD3FFFF); write24(mem, 0xD02590, 0xD3FFFF);
  write24(mem, 0xD02593, 0xD3FFFF); write24(mem, 0xD0259D, 0xD3FFFF);
  write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
}

function drivePopulator(label, entry, { vat, mathprint, paintFirst }) {
  restoreIdle();
  if (vat) seedVat();
  mem[0xD007E0] = 0x40;
  if (mathprint) mem[0xD00082] |= 0x80;
  if (paintFirst) {
    // First run the repaint so the status bar / display state is live, then the body populator.
    peripherals.setTimerEnabled(true);
    cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
    cpu.sp = STACK_RESET_TOP - 24; cpu.push(0x08C33D & 0xFFFFFF); write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
    executor.runFrom(0x058241, 'adl', { maxSteps: 600000, maxLoopIterations: 60000 });
  }
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(0x044708 & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);

  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  const before = vramStats(mem);
  let r;
  try {
    r = executor.runFrom(entry, 'adl', {
      maxSteps: 1_000_000, maxLoopIterations: 60000,
      onBlock: (pc) => { for (const [n, a] of Object.entries(WATCH)) if (pc === a) hits[n]++; },
    });
  } catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
  const after = vramStats(mem);
  const reached = Object.keys(WATCH).filter((k) => hits[k] > 0);
  console.log(`--- ${label} (entry ${hex(entry)}, vat=${vat ? 'Y' : 'N'}, mathprint=${mathprint ? 'Y' : 'N'}, paintFirst=${paintFirst ? 'Y' : 'N'}) ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  past-bail: ${r.steps > 200 && hits.bail === 0 ? 'YES (no bail, ' + r.steps + ' steps)' : hits.bail ? 'NO (bailed @0x044D3B x' + hits.bail + ')' : '? steps=' + r.steps}`);
  console.log(`  chain: ${reached.length ? reached.map((k) => `${k}x${hits[k]}`).join(' ') : '(none)'}`);
  console.log(`  editCursor D0231A=${hex(read24(mem, 0xD0231A))} D0243A=${hex(read24(mem, 0xD0243A))}`);
  console.log(`  VRAM nonWhite ${before.nonWhite}->${after.nonWhite} black ${before.black}->${after.black}\n`);
}

// Replicate iteration-2 (no VAT) as control, then with VAT, then VAT+paintFirst, then +MathPrint.
drivePopulator('control: no VAT', 0x044D3F, { vat: false, mathprint: false, paintFirst: false });
drivePopulator('with correct VAT', 0x044D3F, { vat: true, mathprint: false, paintFirst: false });
drivePopulator('VAT + paint-first', 0x044D3F, { vat: true, mathprint: false, paintFirst: true });
drivePopulator('VAT + paint + MathPrint', 0x044D3F, { vat: true, mathprint: true, paintFirst: true });

console.log('=== READ: does the populator now run its body + set an edit cursor? ===');
