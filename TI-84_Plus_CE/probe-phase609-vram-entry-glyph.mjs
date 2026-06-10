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

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_STRIDE = VRAM_WIDTH * 2;
const WHITE = 0xFFFF;

const SNAPSHOT_TARGETS = [265000, 270000, 275000];
const SNAPSHOT_TOLERANCE = 2500;

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function countNonWhite(mem) {
  let count = 0;
  for (let row = 0; row < VRAM_HEIGHT; row++) {
    const rowBase = VRAM_BASE + row * VRAM_STRIDE;
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const addr = rowBase + col * 2;
      const word = mem[addr] | (mem[addr + 1] << 8);
      if (word !== WHITE) count++;
    }
  }
  return count;
}

function captureAsciiArt(mem, rowStart, rowEnd, colStart, colEnd) {
  const rows = [];
  for (let row = rowStart; row < rowEnd; row++) {
    let line = '';
    for (let col = colStart; col < colEnd; col++) {
      const addr = VRAM_BASE + row * VRAM_STRIDE + col * 2;
      const word = mem[addr] | (mem[addr + 1] << 8);
      line += word === WHITE ? '.' : '#';
    }
    rows.push(line);
  }
  return rows;
}

function dumpEntryRows(mem, rowStart, rowEnd) {
  const rows = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    let nonWhite = 0;
    const first = [];
    const last = [];
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const addr = VRAM_BASE + row * VRAM_STRIDE + col * 2;
      const word = mem[addr] | (mem[addr + 1] << 8);
      if (word !== WHITE) {
        nonWhite++;
        if (first.length < 12) first.push(col);
        if (last.length === 12) last.shift();
        last.push(col);
      }
    }
    rows.push({ row, nonWhite, first, last });
  }
  return rows;
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

console.log('[phase609] vram-entry-glyph probe -- boot + init + paint + key2 with VRAM snapshots');

// ── Phase 0: Cold boot (exact copy from probe-608) ──

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

console.log('[phase609] cold boot done');

// ── Phase 1: Launch-init (0x09DD62) ──

peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('[phase609] init done');

// ── Phase 2: Paint (0x058241) ──

peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countNonWhite(mem);
console.log('[phase609] paint done vram=' + vramAfterPaint + 'px');

// ── Phase 3: Seed key '2' (scan 0x90) ──

pressKey(mem, 0x90);
console.log('[phase609] key 2 seeded (scan=0x90)');

// ── Phase 4: Run outer loop with VRAM snapshots ──

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

const captures = [];
const seenTargets = new Set();
let stepCount = 0;

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 400_000,
  maxLoopIterations: 400_000,
  onBlock(pc) {
    stepCount++;
    for (const target of SNAPSHOT_TARGETS) {
      if (!seenTargets.has(target) && stepCount >= target - SNAPSHOT_TOLERANCE) {
        seenTargets.add(target);
        const nonWhite = countNonWhite(mem);
        const art = captureAsciiArt(mem, 210, 240, 0, 80);
        const entryRows = dumpEntryRows(mem, 210, 239);
        captures.push({ label: '~' + target, step: stepCount, nonWhite, art, entryRows });
        console.log('[phase609] snapshot ~' + target + ' at step=' + stepCount + ' nonWhite=' + nonWhite + 'px');
      }
    }
  },
});

// Fallback: if we didn't hit some targets, capture final state for them
for (const target of SNAPSHOT_TARGETS) {
  if (!seenTargets.has(target)) {
    const nonWhite = countNonWhite(mem);
    const art = captureAsciiArt(mem, 210, 240, 0, 80);
    const entryRows = dumpEntryRows(mem, 210, 239);
    captures.push({ label: '~' + target + ' (fallback)', step: stepCount, nonWhite, art, entryRows });
    console.log('[phase609] fallback snapshot ~' + target + ' at final step=' + stepCount + ' nonWhite=' + nonWhite + 'px');
  }
}

const totalSteps = result.steps ?? stepCount;
const haltPC = result.lastPc & 0xFFFFFF;
console.log('[phase609] key loop done: steps=' + totalSteps + ' haltPC=' + hex(haltPC));

// ── Print snapshots ──

for (const cap of captures) {
  console.log('\n[phase609] === snapshot ' + cap.label + ' at step ' + cap.step + ' ===');
  console.log('[phase609] VRAM non-white pixels: ' + cap.nonWhite);
  console.log('[phase609] entry rows 210-239:');
  for (const row of cap.entryRows) {
    if (row.nonWhite > 0) {
      const first = row.first.join(',');
      const last = row.last.join(',');
      console.log('  row ' + row.row + ': count=' + row.nonWhite + ' first=[' + first + '] last=[' + last + ']');
    }
  }
}

// ── Peak snapshot ASCII art ──

if (captures.length > 0) {
  const peak = captures.reduce((best, item) => (item.nonWhite > best.nonWhite ? item : best), captures[0]);
  console.log('\n[phase609] === PEAK snapshot ' + peak.label + ' step=' + peak.step + ' nonWhite=' + peak.nonWhite + 'px ===');
  console.log('[phase609] rows 210-239, cols 0-79 (# = non-white, . = white):');
  for (let i = 0; i < peak.art.length; i++) {
    console.log(String(210 + i).padStart(3, ' ') + ' ' + peak.art[i]);
  }
} else {
  console.log('[phase609] no snapshots captured');
}

// ── Final state ──

console.log('\n[phase609] final state:');
console.log('[phase609] VRAM non-white pixels: ' + countNonWhite(mem));
console.log('[phase609] D007CA=' + hex(read24(mem, 0xd007ca)));
console.log('[phase609] D0231A=' + hex(read24(mem, 0xd0231a)));
console.log('[phase609] D0243A=' + hex(read24(mem, 0xd0243a)));
console.log('[phase609] done');
