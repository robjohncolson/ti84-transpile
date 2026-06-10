import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HALT_IDLE = 0x0019b5;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;
const OUTER_LOOP = 0x08c331;
const WIPE = 0x0018f8;
const CX_MAIN = 0x0585e9;

// Milestones to track for key2
const MILESTONES = {
  0x08C331: 'CoorMon',
  0x08C72F: 'cxMain_dispatch',
  0x0019B5: 'halt_idle',
  0x0018F8: 'wipe',
  0x03D058: 'key2_entry',
  0x03F9B0: 'key1_entry',
  0x090927: 'key2_stuck',
  0x08F3DC: 'key3_stuck',
  0x08DD60: 'key2_clusterA',
  0x08DD9F: 'key2_clusterB',
};

const STATE_RANGES = [
  { name: 'ctx', addr: 0xd007ca, len: 21 },
  { name: 'mode', addr: 0xd0008d, len: 1 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'descriptor', addr: 0xd02434, len: 32 },
  { name: 'eventFlags', addr: 0xd0009f, len: 1 },
  { name: 'iyFlags', addr: 0xd00080, len: 128 },
];

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function countVRAM(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

function readBytes(mem, addr, len) {
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = mem[addr + i];
  return bytes;
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

function snapshotState(mem) {
  return STATE_RANGES.map((range) => ({
    ...range,
    bytes: readBytes(mem, range.addr, range.len),
  }));
}

function restoreState(mem, snapshot) {
  for (const range of snapshot) writeBytes(mem, range.addr, range.bytes);
}

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// ── Load ROM + transpiled blocks ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase607: key2-runaway probe — boot + key1 baseline + key2 detailed trace');

// ── Phase 0: Cold boot (exact copy from probe-606) ──
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// ── Phase 1: Launch-init ──
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase607: init done');

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log(`phase607: paint done vram=${vramAfterPaint}px`);

// ── Snapshot state after paint ──
const cleanState = snapshotState(mem);
const snapD0058C = mem[0xD0058C];
const snapD0058E = mem[0xD0058E];

console.log(`phase607: snapshot D007CA=${hex(read24(mem, 0xd007ca))} D0231A=${hex(read24(mem, 0xd0231a))} D0243A=${hex(read24(mem, 0xd0243a))}`);

// ── Key 1: '2' (scan 0x9A) — baseline step count ──
console.log('\nphase607: === Key 1: \'2\' (scan=0x9a) — baseline ===');

restoreState(mem, cleanState);
mem[0xD0058C] = snapD0058C;
mem[0xD0058E] = snapD0058E;
pressKey(mem, 0x9A);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1Steps = 0;
const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    key1Steps++;
    const addr = pc & 0xFFFFFF;
    if (addr === HALT_IDLE) {
      restoreState(mem, cleanState);
      mem[0xD0058C] = snapD0058C;
      mem[0xD0058E] = snapD0058E;
    }
  },
});

console.log(`phase607: key1 done — steps=${key1Result.steps ?? 'unknown'} onBlockCount=${key1Steps} lastPC=${hex(key1Result.lastPc)}`);

// ── Key 2: '3' (scan 0x91) — detailed trace ──
console.log('\nphase607: === Key 2: \'3\' (scan=0x91) — detailed trace ===');

restoreState(mem, cleanState);
mem[0xD0058C] = snapD0058C;
mem[0xD0058E] = snapD0058E;
pressKey(mem, 0x91);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

const allBlocks = new Set();
const milestoneLog = [];
const checkpoints = [];
const RING_SIZE = 2000;
const tailRing = new Array(RING_SIZE);  // ring buffer for last 2000 blocks
let ringIdx = 0;
let blockCounter = 0;
let lastPC = 0;
const MAX_STEPS = 500_000;

const key2Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: MAX_STEPS,
  maxLoopIterations: MAX_STEPS,
  onBlock(pc) {
    blockCounter++;
    const addr = pc & 0xFFFFFF;
    lastPC = addr;
    allBlocks.add(addr);

    // Log milestones
    if (MILESTONES[addr]) {
      milestoneLog.push({ step: blockCounter, milestone: MILESTONES[addr], addr: hex(addr) });
    }

    // 50K checkpoints
    if (blockCounter % 50_000 === 0) {
      checkpoints.push({
        step: blockCounter,
        pc: hex(addr),
        vram: countVRAM(mem),
        sp: hex(cpu.sp),
      });
    }

    // Ring buffer — always keeps last 2000 blocks
    tailRing[ringIdx % RING_SIZE] = addr;
    ringIdx++;

    // Auto-restore at HALT idle
    if (addr === HALT_IDLE) {
      restoreState(mem, cleanState);
      mem[0xD0058C] = snapD0058C;
      mem[0xD0058E] = snapD0058E;
    }
  },
});

// ── Report ──
console.log('\nphase607: ═══ REPORT ═══');
console.log(`Key1 steps: ${key1Result.steps ?? 'unknown'}`);
console.log(`Key2 total onBlock calls: ${blockCounter}`);
console.log(`Key2 unique blocks visited: ${allBlocks.size}`);
console.log(`Key2 lastPC: ${hex(key2Result.lastPc)}`);

console.log('\nphase607: milestone hits:');
// Deduplicate milestones for summary — show first and last hit
const milestoneSummary = {};
for (const m of milestoneLog) {
  if (!milestoneSummary[m.milestone]) {
    milestoneSummary[m.milestone] = { first: m.step, last: m.step, count: 1 };
  } else {
    milestoneSummary[m.milestone].last = m.step;
    milestoneSummary[m.milestone].count++;
  }
}
for (const [name, info] of Object.entries(milestoneSummary)) {
  console.log(`  ${name}: count=${info.count} first@step=${info.first} last@step=${info.last}`);
}

// Log first 20 milestone events for timing context
console.log('\nphase607: first 20 milestone events:');
for (let i = 0; i < Math.min(20, milestoneLog.length); i++) {
  const m = milestoneLog[i];
  console.log(`  step=${m.step} ${m.milestone} (${m.addr})`);
}

console.log('\nphase607: 50K checkpoints:');
for (const cp of checkpoints) {
  console.log(`  step=${cp.step} pc=${cp.pc} vram=${cp.vram}px sp=${cp.sp}`);
}

// Extract tail from ring buffer in order
const tailCount = Math.min(ringIdx, RING_SIZE);
const tailBlocks = [];
for (let i = 0; i < tailCount; i++) {
  tailBlocks.push(tailRing[(ringIdx - tailCount + i) % RING_SIZE]);
}

// Tail analysis — find the repeating loop
console.log(`\nphase607: tail blocks (last ${tailBlocks.length} blocks):`);
const last50 = tailBlocks.slice(-50);
console.log('  last 50 blocks:');
for (const addr of last50) {
  console.log(`    ${hex(addr)}`);
}

// Detect loop pattern in the tail
const tailFreq = {};
for (const addr of tailBlocks) {
  const key = hex(addr);
  tailFreq[key] = (tailFreq[key] || 0) + 1;
}
const sortedFreq = Object.entries(tailFreq).sort((a, b) => b[1] - a[1]);
console.log('\nphase607: tail block frequency (top 10):');
for (let i = 0; i < Math.min(10, sortedFreq.length); i++) {
  console.log(`  ${sortedFreq[i][0]}: ${sortedFreq[i][1]} hits`);
}

console.log(`\nphase607: done — finalVRAM=${countVRAM(mem)}px`);
