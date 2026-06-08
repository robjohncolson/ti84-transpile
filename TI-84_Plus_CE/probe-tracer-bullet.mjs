#!/usr/bin/env node
// Tracer-bullet v3: drive the dispatcher 0x099921 directly and see how a '2'
// routes. The home loop 0x044FC2 only handles key 0x09; character dispatch is
// 0x099921 (re-fetches its own key) followed by render via 0x07D1B4.
//
// We seed '2' in every plausible buffer (OS scan 0xD00587, internal code
// 0xD0058E from the 0x09F79B translation table, key matrix), drive 0x099921
// with the key code in A, watch which handler fires, then drive the render
// chain and check VRAM + the edit buffer.

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
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_INTERNAL_ADDR = 0xD0058E;
const KEY_ALT_ADDR = 0xD0058D;
const KEY_AVAIL_ADDR = 0xD00080;
const EDIT_BUF = 0xD0231A;        // cursor/edit buffer pointer area
const XLATE_TABLE = 0x09F79B;     // OS scan -> internal code
const OS_SCAN_2 = 0x1A;           // '2'

const WATCH = {
  tryWrapper:  0x099874,   // setjmp -> dispatch -> render -> endtry
  dispatch:    0x099921,
  tokenAlpha:  0x09AF4E,   // token/alpha range handler (digits route here)
  rangeDisp:   0x099BB0,   // 2nd-function range dispatcher
  keyToToken:  0x061D1A,   // longjmp / key-to-token table (also unhandled path)
  tokenProc:   0x03E1B4,   // token insertion into edit buffer
  walker:      0x07D1B4,   // descriptor walker (render)
  rasterizer:  0x0A1799,   // glyph -> VRAM
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
  let nonZero = 0, hash = 0;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_BYTES; i += 2) {
    const v = mem[i] | (mem[i + 1] << 8);
    if (v !== 0) nonZero++;
    hash = (hash + v * (i & 0xFFFF)) >>> 0;
  }
  return { nonZero, hash };
}

function makeTracker() {
  const blocks = new Set(), ramAddrs = new Set(), watchHits = {};
  for (const k of Object.keys(WATCH)) watchHits[k] = 0;
  return {
    blocks, ramAddrs, watchHits,
    onBlock(pc) { blocks.add(pc >>> 0); for (const [n, a] of Object.entries(WATCH)) if (pc === a) watchHits[n]++; },
    onMissingBlock(pc) { if (pc >= 0xD00000) ramAddrs.add(pc >>> 0); },
  };
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const internalCode = romBytes[XLATE_TABLE + OS_SCAN_2];
console.log('=== Tracer-Bullet v3: dispatcher routing for "2" ===');
console.log(`translate: OS scan ${hex(OS_SCAN_2,2)} -> internal ${hex(internalCode,2)} (from table @${hex(XLATE_TABLE)})\n`);

coldBoot(executor, cpu, mem);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
const vramBefore = vramFingerprint(mem);
const editBefore = [...mem.slice(EDIT_BUF, EDIT_BUF + 8)].map((b) => hex(b, 2)).join(' ');
console.log(`idle: VRAM nonZero=${vramBefore.nonZero} hash=${hex(vramBefore.hash,8)}  editBuf[${hex(EDIT_BUF)}]=${editBefore}\n`);

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 24; mem.fill(0xFF, cpu.sp, cpu.sp + 24);
}

function seedKey() {
  peripherals.setMatrixKey(3, 1, true);
  mem[KEY_SCAN_CODE_ADDR] = OS_SCAN_2;
  mem[KEY_INTERNAL_ADDR] = internalCode;
  mem[KEY_ALT_ADDR] = internalCode;
  mem[KEY_AVAIL_ADDR] = mem[KEY_AVAIL_ADDR] | 0x08;
  cpu.a = internalCode;   // dispatcher cascade keys on A
}

restoreIdle();
seedKey();
const t = makeTracker();
cpu.push(0x044708 & 0xFFFFFF);
// Seed D008E0 (OS saved main-loop SP, used by the 0x061D1A longjmp unwind) with
// our valid stack so the longjmp-back-to-loop lands cleanly instead of SP=garbage.
const SAVED_SP = 0xD008E0;
mem[SAVED_SP]     = cpu.sp & 0xFF;
mem[SAVED_SP + 1] = (cpu.sp >> 8) & 0xFF;
mem[SAVED_SP + 2] = (cpu.sp >> 16) & 0xFF;
let r;
try {
  r = executor.runFrom(0x099874, 'adl', {
    maxSteps: 1_500_000, maxLoopIterations: 100000,
    onBlock: (pc) => t.onBlock(pc), onMissingBlock: (pc) => t.onMissingBlock(pc),
  });
} catch (e) { r = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }

console.log(`[dispatch] steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
const editAfterDispatch = [...mem.slice(EDIT_BUF, EDIT_BUF + 8)].map((b) => hex(b, 2)).join(' ');
console.log(`  editBuf after dispatch = ${editAfterDispatch} (was ${editBefore})`);

// Now drive the render path explicitly.
let rr;
try {
  rr = executor.runFrom(0x07D1B4, 'adl', {
    maxSteps: 800_000, maxLoopIterations: 100000,
    onBlock: (pc) => t.onBlock(pc), onMissingBlock: (pc) => t.onMissingBlock(pc),
  });
} catch (e) { rr = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) }; }
const vramAfter = vramFingerprint(mem);
console.log(`[render]   steps=${rr.steps} term=${rr.termination} lastPc=${hex(rr.lastPc)}${rr.error ? ' err=' + rr.error : ''}`);

console.log('\n=== ROUTING / EVIDENCE ===');
for (const k of Object.keys(WATCH)) {
  console.log(`  ${k.padEnd(11)} @${hex(WATCH[k])}: ${t.watchHits[k] > 0 ? 'HIT x' + t.watchHits[k] : 'not reached'}`);
}
const vramChanged = vramAfter.hash !== vramBefore.hash || vramAfter.nonZero !== vramBefore.nonZero;
const editChanged = editAfterDispatch !== editBefore;
console.log('');
console.log(`  edit buffer changed: ${editChanged ? 'YES' : 'no'}`);
console.log(`  VRAM changed: ${vramChanged ? 'YES nonZero ' + vramBefore.nonZero + '->' + vramAfter.nonZero : 'no'}`);
console.log(`  interpreter (RAM) gap: ${t.ramAddrs.size}`);
console.log('');
console.log('=== VERDICT ===');
if (vramChanged) console.log('  RENDER REACHED VRAM after a dispatched key — round-trip is turning.');
else if (t.watchHits.tokenProc > 0 || editChanged) console.log('  PROCESSED: key dispatched + token/edit-buffer touched; render did not reach VRAM (needs edit-context/cursor).');
else if (t.watchHits.tokenAlpha > 0 || t.watchHits.rangeDisp > 0) console.log('  DISPATCHED: routed to a token/range handler but no token inserted (key form not fully recognized).');
else if (t.watchHits.keyToToken > 0) console.log('  UNHANDLED: dispatcher sent the key to the default/longjmp path (0x061D1A) — key code not recognized as a digit.');
else console.log('  DISPATCHER DID NOT ROUTE: 0x099921 ran but no handler matched (preamble/context issue).');
