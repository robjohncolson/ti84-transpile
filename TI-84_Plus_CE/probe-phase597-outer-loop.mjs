#!/usr/bin/env node
// probe-phase597-outer-loop.mjs
// Tests whether running the OUTER event loop at 0x08C331 with D0058C=0x90
// and D0009F bit 5 set reaches the 38-entry command dispatcher at 0x099921.

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
const REPAINT_IDLE_LOOP = 0x0019b5;
const LAUNCH_INIT = 0x09DD62;
const REPAINT = 0x058241;
const OUTER_LOOP = 0x08C331;

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }

// ─── Traced address ranges ───
const TRACE_RANGES = [
  { lo: 0x08C330, hi: 0x08C3FF, label: 'event-loop-top' },
  { lo: 0x08C720, hi: 0x08C750, label: 'cxMain-indirect-call' },
  { lo: 0x0585E0, hi: 0x058700, label: 'cxMain-handler' },
  { lo: 0x099870, hi: 0x099930, label: 'tryWrapper+dispatcher' },
  { lo: 0x099900, hi: 0x099AFF, label: 'dispatcher-entries' },
  { lo: 0x061D10, hi: 0x061D30, label: 'key-to-token-table' },
  { lo: 0x03E1B0, hi: 0x03E200, label: 'token-processor' },
  { lo: 0x06CE70, hi: 0x06CE90, label: 'key-pre-processor' },
];

// Key addresses to track individually
const KEY_ADDRS = {
  outerLoopEntry:   0x08C331,
  bit5Check:        0x08C349,
  keyCascadeStart:  0x08C3C3,
  cxMainJpHL:       0x08C745,
  cxMainHandler:    0x0585E9,
  dispatcher:       0x099921,
  keyToToken:       0x061D1A,
  tokenProcessor:   0x03E1B4,
  keyPreProcessor:  0x06CE73,
  generalKeyHandler: 0x05877A,
  call080259:       0x080259,
  call055B8F:       0x055B8F,
  call058DCD:       0x058DCD,
  call058EDA:       0x058EDA,
  call0587E9:       0x0587E9,
  call098342:       0x098342,
  call098383:       0x098383,
  call0800EC:       0x0800EC,
};

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-phase597-outer-loop ===\n');

// ─── Phase 0: Cold boot to idle (same as golden-path) ───
console.log('Phase 0: Cold boot to idle...');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
const idleResult = executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
console.log(`  Cold boot: steps=${idleResult.steps} term=${idleResult.termination} lastPc=${hex(idleResult.lastPc)}`);

// ─── Phase 1: Launch-init (0x09DD62) ───
console.log('\nPhase 1: Launch-init (0x09DD62)...');
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = STACK_RESET_TOP - 24;
cpu.sp = launchSp;
write24(mem, launchSp, INIT_IDLE_LOOP);
write24(mem, 0xD008E0, launchSp);

let result;
try {
  result = executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
} catch (e) {
  result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
}
console.log(`  Launch-init: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
if (result.error) console.log(`  error: ${result.error}`);

const postInitCx = read24(mem, 0xD007CA);
console.log(`  post-init D007CA=${hex(postInitCx)} (expect 0x0585E9)`);
if (postInitCx !== 0x0585E9) {
  console.error(`ABORT: D007CA=${hex(postInitCx)}, expected 0x0585E9`);
  process.exit(2);
}

// ─── Phase 2: Paint home screen ───
console.log('\nPhase 2: Paint home screen (0x058241)...');
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, REPAINT_IDLE_LOOP);

try {
  result = executor.runFrom(REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
} catch (e) {
  result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
}
console.log(`  Paint: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
if (result.error) console.log(`  error: ${result.error}`);

// ─── Phase 3: Seed key for OUTER loop ───
console.log('\nPhase 3: Seed key state...');
mem[0xD0058C] = 0x90;  // translated internal code for '2'
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20; // SET bit 5 of D0009F (IY+0x1F) — tells outer loop "key pending"

console.log(`  D0058C = ${hex(mem[0xD0058C], 2)}`);
console.log(`  D0058E = ${hex(mem[0xD0058E], 2)}`);
console.log(`  D0009F = ${hex(mem[0xD0009F], 2)} (bit5=${(mem[0xD0009F] & 0x20) ? 'SET' : 'clear'})`);
console.log(`  D007CA = ${hex(read24(mem, 0xD007CA))}`);

// ─── Phase 4: Re-arm longjmp anchor and run outer loop ───
console.log('\nPhase 4: Run outer event loop at 0x08C331...');
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;

// Re-arm longjmp
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, REPAINT_IDLE_LOOP);
write24(mem, 0xD008E0, cpu.sp);

// Track hits
const addrHits = Object.fromEntries(Object.entries(KEY_ADDRS).map(([k, v]) => [k, 0]));
const rangeHits = Object.fromEntries(TRACE_RANGES.map(r => [r.label, []]));
const missingBlocks = [];
const allBlocks = new Set();
let totalSteps = 0;

try {
  result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      const p = pc & 0xFFFFFF;
      // Track all unique block addresses (cap at 5000)
      if (allBlocks.size < 5000) allBlocks.add(p);
      // Track individual key addresses
      for (const [name, addr] of Object.entries(KEY_ADDRS)) {
        if (p === addr) addrHits[name]++;
      }
      // Track range hits (first 5 unique per range)
      for (const range of TRACE_RANGES) {
        if (p >= range.lo && p <= range.hi) {
          if (rangeHits[range.label].length < 20) {
            rangeHits[range.label].push(hex(p));
          }
        }
      }
    },
    onMissingBlock(pc) {
      missingBlocks.push(pc & 0xFFFFFF);
    },
  });
} catch (e) {
  result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
}

// ─── Results ───
console.log('\n========== RESULTS ==========\n');
console.log(`Run: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
if (result.error) console.log(`  error: ${result.error}`);

console.log('\n--- Key address hits ---');
for (const [name, count] of Object.entries(addrHits)) {
  const mark = count > 0 ? ' <<<' : '';
  console.log(`  ${name} (${hex(KEY_ADDRS[name])}): ${count}${mark}`);
}

console.log('\n--- Range trace ---');
for (const [label, pcs] of Object.entries(rangeHits)) {
  if (pcs.length > 0) {
    console.log(`  ${label}: ${pcs.join(', ')}`);
  } else {
    console.log(`  ${label}: (none)`);
  }
}

if (missingBlocks.length > 0) {
  console.log(`\n--- Missing blocks ---`);
  console.log(`  ${missingBlocks.map(a => hex(a)).join(', ')}`);
}

console.log('\n--- Post-run state ---');
console.log(`  D0058C = ${hex(mem[0xD0058C], 2)}`);
console.log(`  D0058E = ${hex(mem[0xD0058E], 2)}`);
console.log(`  D0009F = ${hex(mem[0xD0009F], 2)} (bit5=${(mem[0xD0009F] & 0x20) ? 'SET' : 'clear'})`);
console.log(`  D007CA = ${hex(read24(mem, 0xD007CA))}`);

// ─── All unique blocks ───
const sortedBlocks = [...allBlocks].sort((a, b) => a - b);
console.log(`\n========== ALL UNIQUE BLOCKS (${sortedBlocks.length} total) ==========\n`);
for (let i = 0; i < sortedBlocks.length; i += 10) {
  const row = sortedBlocks.slice(i, i + 10).map(a => hex(a)).join('  ');
  console.log(`  ${row}`);
}

// ─── Verdict ───
const reached0x099921 = addrHits.dispatcher > 0;
const reachedCxMain = addrHits.cxMainJpHL > 0 || addrHits.cxMainHandler > 0;
const reachedKeyToToken = addrHits.keyToToken > 0;
const reachedTokenProc = addrHits.tokenProcessor > 0;

console.log('\n========== VERDICT ==========');
console.log(`  0x099921 dispatcher reached: ${reached0x099921 ? 'YES' : 'NO'}`);
console.log(`  cxMain call/handler reached: ${reachedCxMain ? 'YES' : 'NO'}`);
console.log(`  0x061D1A key-to-token reached: ${reachedKeyToToken ? 'YES' : 'NO'}`);
console.log(`  0x03E1B4 token processor reached: ${reachedTokenProc ? 'YES' : 'NO'}`);

if (reached0x099921) {
  console.log('\n  *** SUCCESS: Outer loop dispatched key through to 0x099921 ***');
} else if (reachedCxMain) {
  console.log('\n  PARTIAL: cxMain reached but dispatcher was not hit');
} else {
  console.log('\n  FAIL: Key dispatch cascade did not reach cxMain or dispatcher');
}

process.exit(0);
