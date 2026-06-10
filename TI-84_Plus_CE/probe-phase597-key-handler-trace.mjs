#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

// ── Setup ──────────────────────────────────────────────────────────────────────

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
const WARM_KEY_EVENT = 0x02FD8F;

const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

// ── Helpers ────────────────────────────────────────────────────────────────────

const hex = (v, w = 6) => v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0');
function hex8(v) { return '0x' + (v & 0xFF).toString(16).padStart(2, '0'); }
function read24(m, a) { return m[a] | (m[a + 1] << 8) | (m[a + 2] << 16); }
function write24(m, a, v) { m[a] = v & 0xFF; m[a + 1] = (v >> 8) & 0xFF; m[a + 2] = (v >> 16) & 0xFF; }

function dumpRegs(label, pc) {
  const names = ['a', 'f', '_bc', '_de', '_hl', '_ix', '_iy', 'sp'];
  const parts = names.map((n) => n + '=' + hex(cpu[n], n.length <= 2 ? 2 : 6));
  console.log('  ' + label + ' pc=' + hex(pc) + ' ' + parts.join(' '));
}

function hexdump(m, addr, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(m[(addr + i) & 0xFFFFFF].toString(16).padStart(2, '0'));
  return bytes.join(' ');
}

// ── Trace ranges of interest ───────────────────────────────────────────────────

const TRACE_RANGES = [
  { name: '0x030300 housekeeping', lo: 0x030300, hi: 0x0303FF },
  { name: '0x040D00 handler',     lo: 0x040D00, hi: 0x041000 },
  { name: '0x099900 dispatch',    lo: 0x099900, hi: 0x099AFF },
  { name: '0x03E180 tokenProc',   lo: 0x03E180, hi: 0x03E1FF },
  { name: '0x04049B sub-handler', lo: 0x04049B, hi: 0x0404FF },
];

function inTraceRange(pc) {
  for (const r of TRACE_RANGES) {
    if (pc >= r.lo && pc <= r.hi) return r.name;
  }
  return null;
}

// ── Named watch addresses ──────────────────────────────────────────────────────

const WATCH = {
  warmEntry:     0x02FD8F,
  getcsc:        0x03FA09,
  relay02FE89:   0x02FE89,
  housekeep:     0x030300,
  handler040D11: 0x040D11,
  dispatch:      0x099921,
  tokenProc:     0x03E1B4,
  cxMain:        0x0585E9,
  keypre:        0x06CE73,
  keyToToken:    0x061D1A,
};

const WATCH_BY_PC = new Map(Object.entries(WATCH).map(([name, pc]) => [pc, name]));

// ── Boot helpers ───────────────────────────────────────────────────────────────

function bootToIdle() {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  return executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
}

function launchInit() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_RESET_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, INIT_IDLE_LOOP);
  write24(mem, 0xD008E0, launchSp);
  return executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
}

function pushRepaintReturn() {
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, REPAINT_IDLE_LOOP);
}

function installControlledLongjmpAnchor() {
  const sp = STACK_RESET_TOP - 24;
  cpu.sp = sp;
  write24(mem, sp, REPAINT_IDLE_LOOP);
  write24(mem, 0xD008E0, sp);
}

function pressKey() {
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058C] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function runSafe(entry, opts = {}) {
  let result;
  try {
    result = executor.runFrom(entry, 'adl', opts);
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  return result;
}

// ── Machine init ───────────────────────────────────────────────────────────────

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('=== probe-phase597-key-handler-trace ===');
console.log("'2' key: OS scan " + hex8(OS_SCAN_2) + ' -> internal ' + hex8(INTERNAL_2) + '\n');

// Phase 1: Boot
console.log('--- Phase 1: Boot ---');
bootToIdle();
const initResult = launchInit();
const initCx = read24(mem, 0xD007CA);
console.log('post-init: D007CA=' + hex(initCx) + ' D008E0=' + hex(read24(mem, 0xD008E0)) + ' steps=' + initResult.steps);
if (initCx !== 0x0585E9) {
  console.error('ABORT: expected post-init D007CA=0x0585E9, got ' + hex(initCx));
  process.exit(2);
}

// Phase 2: Paint
console.log('\n--- Phase 2: Repaint ---');
pushRepaintReturn();
const repaintResult = runSafe(REPAINT, { maxSteps: 1500000, maxLoopIterations: 60000 });
console.log('repaint: steps=' + repaintResult.steps + ' term=' + (repaintResult.termination ?? 'unknown') + ' lastPc=' + hex(repaintResult.lastPc));

// Phase 3: Inject key
console.log('\n--- Phase 3: Inject key ---');
pressKey();
console.log('D00587=' + hex8(mem[0xD00587]) + ' D0058C=' + hex8(mem[0xD0058C]) + ' D0058D=' + hex8(mem[0xD0058D]) + ' D0058E=' + hex8(mem[0xD0058E]) + ' D00080=' + hex8(mem[0xD00080]));

// Phase 4: Arm anchor + run warm loop with detailed tracing
console.log('\n--- Phase 4: Traced warm loop ---');
installControlledLongjmpAnchor();

// Log dispatch flags BEFORE running
console.log('\n=== DISPATCH FLAGS (pre-run) ===');
console.log('D000A8 (IY+0x28): ' + hex8(mem[0xD000A8]));
console.log('D0009D (IY+0x1D): ' + hex8(mem[0xD0009D]));
console.log('D0058C: ' + hex8(mem[0xD0058C]));
console.log('D0058E: ' + hex8(mem[0xD0058E]));
console.log('D0058D: ' + hex8(mem[0xD0058D]));
console.log('D00587: ' + hex8(mem[0xD00587]));
console.log('D007CA: ' + hex(read24(mem, 0xD007CA)));
console.log('D007E0: ' + hex8(mem[0xD007E0]));
console.log('D00080: ' + hex8(mem[0xD00080]));
console.log('D008E0 (longjmp): ' + hex(read24(mem, 0xD008E0)));

// Tracing state
const watchHits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
const rangeHits = new Map();
const rolling = [];
const events = [];
const blockCountByPC = new Map();
let totalBlocks = 0;
let lastD0058C = mem[0xD0058C];
let lastD0058E = mem[0xD0058E];
let lastD000A8 = mem[0xD000A8];
let lastD0009D = mem[0xD0009D];
let lastD007CA = read24(mem, 0xD007CA);

const tracedResult = runSafe(WARM_KEY_EVENT, {
  maxSteps: 800000,
  maxLoopIterations: 100000,
  onBlock(pc) {
    totalBlocks++;
    rolling.push(pc);
    if (rolling.length > 300) rolling.shift();

    blockCountByPC.set(pc, (blockCountByPC.get(pc) || 0) + 1);

    // Watch hits
    const watchName = WATCH_BY_PC.get(pc);
    if (watchName) {
      watchHits[watchName]++;
      if (watchHits[watchName] <= 3) {
        events.push('[block ' + totalBlocks + '] WATCH HIT: ' + watchName + ' (' + hex(pc) + ') A=' + hex8(cpu.a) + ' F=' + hex8(cpu.f) + ' SP=' + hex(cpu.sp));
        dumpRegs(watchName, pc);
      }
    }

    // Trace range hits
    const rangeName = inTraceRange(pc);
    if (rangeName) {
      if (!rangeHits.has(rangeName)) rangeHits.set(rangeName, []);
      const arr = rangeHits.get(rangeName);
      if (arr.length < 50) arr.push(pc);
      if (arr.length <= 5) {
        events.push('[block ' + totalBlocks + '] RANGE: ' + rangeName + ' pc=' + hex(pc) + ' A=' + hex8(cpu.a) + ' F=' + hex8(cpu.f));
        dumpRegs('  regs', pc);
      }
    }

    // Track state changes
    const d0058c = mem[0xD0058C];
    if (d0058c !== lastD0058C) {
      events.push('[block ' + totalBlocks + '] D0058C changed: ' + hex8(lastD0058C) + ' -> ' + hex8(d0058c) + ' near pc=' + hex(pc));
      lastD0058C = d0058c;
    }
    const d0058e = mem[0xD0058E];
    if (d0058e !== lastD0058E) {
      events.push('[block ' + totalBlocks + '] D0058E changed: ' + hex8(lastD0058E) + ' -> ' + hex8(d0058e) + ' near pc=' + hex(pc));
      lastD0058E = d0058e;
    }
    const d000a8 = mem[0xD000A8];
    if (d000a8 !== lastD000A8) {
      events.push('[block ' + totalBlocks + '] D000A8 changed: ' + hex8(lastD000A8) + ' -> ' + hex8(d000a8) + ' near pc=' + hex(pc));
      lastD000A8 = d000a8;
    }
    const d0009d = mem[0xD0009D];
    if (d0009d !== lastD0009D) {
      events.push('[block ' + totalBlocks + '] D0009D changed: ' + hex8(lastD0009D) + ' -> ' + hex8(d0009d) + ' near pc=' + hex(pc));
      lastD0009D = d0009d;
    }
    const d007ca = read24(mem, 0xD007CA);
    if (d007ca !== lastD007CA) {
      events.push('[block ' + totalBlocks + '] D007CA changed: ' + hex(lastD007CA) + ' -> ' + hex(d007ca) + ' near pc=' + hex(pc));
      lastD007CA = d007ca;
    }

    // Dump context at key decision points
    if (pc === 0x030300 && (blockCountByPC.get(pc) || 0) <= 2) {
      console.log('\n  [DECISION] 0x030300 entry: A=' + hex8(cpu.a) + ' D0058C=' + hex8(mem[0xD0058C]) + ' D0058E=' + hex8(mem[0xD0058E]));
      console.log('    D000A8=' + hex8(mem[0xD000A8]) + ' D0009D=' + hex8(mem[0xD0009D]) + ' D007CA=' + hex(read24(mem, 0xD007CA)));
      console.log('    stack[0..8]: ' + hexdump(mem, cpu.sp, 9));
    }
    if (pc === 0x040D11 && (blockCountByPC.get(pc) || 0) <= 2) {
      console.log('\n  [DECISION] 0x040D11 entry: A=' + hex8(cpu.a) + ' D0058C=' + hex8(mem[0xD0058C]) + ' D0058E=' + hex8(mem[0xD0058E]));
      console.log('    D000A8=' + hex8(mem[0xD000A8]) + ' D0009D=' + hex8(mem[0xD0009D]) + ' D007CA=' + hex(read24(mem, 0xD007CA)));
      console.log('    _bc=' + hex(cpu._bc) + ' _de=' + hex(cpu._de) + ' _hl=' + hex(cpu._hl));
      console.log('    stack[0..11]: ' + hexdump(mem, cpu.sp, 12));
    }
  },
  onMissingBlock(pc) {
    events.push('[block ' + totalBlocks + '] MISSING BLOCK: ' + hex(pc));
  },
});

// ── Post-run report ────────────────────────────────────────────────────────────

console.log('\n\n=== POST-LOOP STATE ===');
console.log('run: steps=' + tracedResult.steps + ' term=' + (tracedResult.termination ?? 'unknown') + ' lastPc=' + hex(tracedResult.lastPc));
if (tracedResult.error) console.log('  error: ' + tracedResult.error);
console.log('total blocks traced: ' + totalBlocks);

console.log('\n=== DISPATCH FLAGS (post-run) ===');
console.log('D0058C: ' + hex8(mem[0xD0058C]));
console.log('D0058E: ' + hex8(mem[0xD0058E]));
console.log('D0058D: ' + hex8(mem[0xD0058D]));
console.log('D000A8 (IY+0x28): ' + hex8(mem[0xD000A8]));
console.log('D0009D (IY+0x1D): ' + hex8(mem[0xD0009D]));
console.log('D007CA: ' + hex(read24(mem, 0xD007CA)));
console.log('D007E0: ' + hex8(mem[0xD007E0]));
console.log('D00080: ' + hex8(mem[0xD00080]));

console.log('\n=== WATCH HITS ===');
for (const [name, pc] of Object.entries(WATCH)) {
  const count = watchHits[name];
  const marker = count > 0 ? 'HIT ' : 'MISS';
  console.log('  ' + marker + ' ' + name + ' (' + hex(pc) + '): ' + count);
}

console.log('\n=== TARGET RANGE HITS ===');
for (const r of TRACE_RANGES) {
  const pcs = rangeHits.get(r.name) || [];
  if (pcs.length === 0) {
    console.log('  MISS ' + r.name);
  } else {
    const unique = [...new Set(pcs)].sort((a, b) => a - b);
    console.log('  HIT  ' + r.name + ': ' + pcs.length + ' visits, unique PCs: ' + unique.map((p) => hex(p)).join(', '));
  }
}

console.log('\n=== STATE CHANGE EVENTS ===');
if (events.length === 0) {
  console.log('  (none)');
} else {
  for (const ev of events) console.log('  ' + ev);
}

console.log('\n=== ROLLING BUFFER (last 50 blocks) ===');
const tail = rolling.slice(-50);
for (let i = 0; i < tail.length; i++) {
  const idx = rolling.length - 50 + i;
  console.log('  ' + String(idx < 0 ? i : idx).padStart(4) + ' ' + hex(tail[i]));
}

// Top-20 most-visited blocks
console.log('\n=== TOP 20 MOST-VISITED BLOCKS ===');
const sorted = [...blockCountByPC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pc, count] of sorted) {
  console.log('  ' + hex(pc) + ': ' + count + ' visits');
}

// Key question: did the flow reach 0x099921?
const reached099921 = watchHits.dispatch > 0;
const reached040D11 = watchHits.handler040D11 > 0;
console.log('\n=== DIAGNOSIS ===');
console.log('0x040D11 reached: ' + (reached040D11 ? 'YES' : 'NO'));
console.log('0x099921 reached: ' + (reached099921 ? 'YES' : 'NO'));
if (reached040D11 && !reached099921) {
  console.log('CONCLUSION: 0x040D11 is reached but does NOT lead to 0x099921.');
  console.log('Check the blocks visited in the 0x040D00-0x041000 range above for the actual flow.');
  console.log('The dispatch flags D000A8 and D0009D may be gating the path to 0x099921.');
} else if (!reached040D11) {
  console.log('CONCLUSION: 0x040D11 is NOT reached. The flow stops earlier.');
  console.log('Check the rolling buffer above for where execution actually goes.');
} else {
  console.log('CONCLUSION: Both 0x040D11 and 0x099921 are reached. The dispatch path is working.');
}
