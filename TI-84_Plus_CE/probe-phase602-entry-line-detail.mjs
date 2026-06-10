import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function countVramNonWhite(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

function formatBytes(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const hexBytes = chunk.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const ascii = chunk
      .map((b) => (b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).toUpperCase().padStart(4, '0')}: ${hexBytes.padEnd(47, ' ')}  ${ascii}`);
  }
  return lines;
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 602: Entry line detail probe');

// ── Phase 0: Cold boot (verbatim from probe-601) ──
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
executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramBefore = countVramNonWhite(mem);
console.log(`Pre-key VRAM: ${vramBefore} non-white pixels`);

// ── Phase 3: Seed key (D0058C=0x90, D0058E=0x90, D0009F|=0x20) ──
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

// Re-arm longjmp anchor
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

// ── Phase 4: Outer loop with VRAM peak tracking ──
let peakVram = 0;
let peakStep = 0;
let peakSnapshot = null;
let stepCounter = 0;
const sampleInterval = 1000;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    stepCounter++;
    if (stepCounter % sampleInterval === 0) {
      const count = countVramNonWhite(mem);
      if (count > peakVram) {
        peakVram = count;
        peakStep = stepCounter;
        peakSnapshot = new Uint8Array(320 * 240 * 2);
        peakSnapshot.set(mem.subarray(0xD40000, 0xD40000 + 320 * 240 * 2));
      }
    }
  },
});

const vramAfter = countVramNonWhite(mem);
console.log(`Post-key VRAM: ${vramAfter} non-white pixels`);
console.log(`Peak VRAM: ${peakVram} non-white pixels at block-step ${peakStep}`);
console.log(`Execution: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`);

// ── Read cursor/display state from live mem ──
const d0231a = read24(mem, 0xD0231A);
const d0243a = read24(mem, 0xD0243A);
const d0058e = mem[0xD0058E];
console.log(`D0231A (edit cursor ptr): ${hex(d0231a)}`);
console.log(`D0243A: ${hex(d0243a)}`);
console.log(`D0058E (translated key): ${hex(d0058e, 2)}`);

if (!peakSnapshot) {
  console.log('No peak VRAM snapshot captured — VRAM was never non-white during key processing.');
  console.log('Phase 602 complete.');
  process.exit(0);
}

console.log(`\nAnalyzing peak VRAM snapshot (${peakVram} non-white pixels at block-step ${peakStep})...`);

// ── Analysis helpers using peak snapshot ──
const WIDTH = 320;

function getPixel(row, col) {
  const offset = (row * WIDTH + col) * 2;
  return peakSnapshot[offset] | (peakSnapshot[offset + 1] << 8);
}

function isNonWhite(row, col) {
  return getPixel(row, col) !== 0xFFFF;
}

// ── 5a: Entry line rows 219-240 — non-white column ranges ──
console.log('\n=== Entry line non-white columns (rows 219-240) ===');
for (let row = 219; row <= 240; row++) {
  const cols = [];
  for (let c = 0; c < WIDTH; c++) {
    if (isNonWhite(row, c)) cols.push(c);
  }
  if (cols.length === 0) {
    console.log(`  row ${row}: none`);
    continue;
  }
  // Build ranges
  const ranges = [];
  let start = cols[0], prev = cols[0];
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] === prev + 1) {
      prev = cols[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = cols[i];
      prev = cols[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  console.log(`  row ${row}: count=${String(cols.length).padStart(3)} ranges=${ranges.join(', ')}`);
}

// ── 5b: Pixel map for entry line rows 219-240, cols 0-60 ──
console.log('\n=== Entry line pixel map (rows 219-240, cols 0-60) ===');
for (let row = 219; row <= 240; row++) {
  let line = '';
  for (let col = 0; col <= 60; col++) {
    line += isNonWhite(row, col) ? '#' : '.';
  }
  console.log(`  r${String(row).padStart(3, '0')}: ${line}`);
}

// ── 5c: Edit buffer from D0231A pointer ──
console.log('\n=== Edit buffer from D0231A ===');
const editPtr = read24(mem, 0xD0231A);
console.log(`D0231A points to: ${hex(editPtr)}`);
if (editPtr > 0 && editPtr < MEM_SIZE - 64) {
  const bytes231a = [];
  for (let i = 0; i < 64; i++) bytes231a.push(mem[editPtr + i]);
  for (const line of formatBytes(bytes231a)) {
    console.log(`  ${line}`);
  }
} else {
  console.log('  (pointer out of range)');
}

// ── 5d: Buffer from D0243A pointer ──
console.log('\n=== Buffer from D0243A ===');
const ptr243a = read24(mem, 0xD0243A);
console.log(`D0243A points to: ${hex(ptr243a)}`);
if (ptr243a > 0 && ptr243a < MEM_SIZE - 64) {
  const bytes243a = [];
  for (let i = 0; i < 64; i++) bytes243a.push(mem[ptr243a + i]);
  for (const line of formatBytes(bytes243a)) {
    console.log(`  ${line}`);
  }
} else {
  console.log('  (pointer out of range)');
}

// ── 5e: Full pixel map for entry line rows 219-240, all 320 cols ──
console.log('\n=== Full-width pixel map (rows 219-240, all 320 cols) ===');
for (let row = 219; row <= 240; row++) {
  let count = 0;
  for (let col = 0; col < WIDTH; col++) {
    if (isNonWhite(row, col)) count++;
  }
  if (count > 0) {
    let line = '';
    for (let col = 0; col < WIDTH; col++) {
      line += isNonWhite(row, col) ? '#' : '.';
    }
    console.log(`  r${String(row).padStart(3, '0')}: ${line}`);
  } else {
    console.log(`  r${String(row).padStart(3, '0')}: (all white)`);
  }
}

console.log('\nPhase 602 complete.');
