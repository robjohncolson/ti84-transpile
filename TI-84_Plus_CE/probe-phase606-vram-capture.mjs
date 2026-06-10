import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LCD_BASE = 0xD40000;
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const WHITE = 0xFFFF;
const BLACK = 0x0000;
const OUTER_LOOP_PC = 0x08C331;
const SAMPLE_INTERVAL = 5000;
const OUTER_MAX_STEPS = 500000;

function write24(m, a, v) {
  m[a] = v & 0xFF;
  m[a + 1] = (v >> 8) & 0xFF;
  m[a + 2] = (v >> 16) & 0xFF;
}

function read24(m, a) {
  return m[a] | (m[a + 1] << 8) | (m[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function countVramNonWhite(m) {
  let count = 0;
  for (let i = 0; i < LCD_WIDTH * LCD_HEIGHT; i++) {
    const a = LCD_BASE + i * 2;
    const word = m[a] | (m[a + 1] << 8);
    if (word !== WHITE) count++;
  }
  return count;
}

function captureVram(m) {
  const pixels = new Uint16Array(LCD_WIDTH * LCD_HEIGHT);
  for (let y = 0; y < LCD_HEIGHT; y++) {
    for (let x = 0; x < LCD_WIDTH; x++) {
      const a = LCD_BASE + ((y * LCD_WIDTH + x) * 2);
      pixels[y * LCD_WIDTH + x] = m[a] | (m[a + 1] << 8);
    }
  }
  return pixels;
}

function colorToChar(color) {
  if (color === WHITE) return ' ';
  if (color === BLACK) return '#';
  return '.';
}

function colorHex(color) {
  return color.toString(16).toUpperCase().padStart(4, '0');
}

function rowText(pixels, y) {
  let line = '';
  for (let x = 0; x < LCD_WIDTH; x++) line += colorToChar(pixels[y * LCD_WIDTH + x]);
  return line;
}

function rowHex(pixels, y) {
  const parts = [];
  for (let x = 0; x < LCD_WIDTH; x++) parts.push(colorHex(pixels[y * LCD_WIDTH + x]));
  return parts.join(' ');
}

function rowHasContent(pixels, y) {
  for (let x = 0; x < LCD_WIDTH; x++) {
    if (pixels[y * LCD_WIDTH + x] !== WHITE) return true;
  }
  return false;
}

function summarizeColors(pixels) {
  const counts = new Map();
  for (const color of pixels) counts.set(color, (counts.get(color) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function boundingBoxesByRows(pixels) {
  const boxes = [];
  let active = null;
  for (let y = 0; y < LCD_HEIGHT; y++) {
    let minX = LCD_WIDTH;
    let maxX = -1;
    for (let x = 0; x < LCD_WIDTH; x++) {
      if (pixels[y * LCD_WIDTH + x] !== WHITE) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    if (maxX >= 0) {
      if (!active) active = { minY: y, maxY: y, minX, maxX };
      else {
        active.maxY = y;
        active.minX = Math.min(active.minX, minX);
        active.maxX = Math.max(active.maxX, maxX);
      }
    } else if (active) {
      boxes.push(active);
      active = null;
    }
  }
  if (active) boxes.push(active);
  return boxes;
}

// ── Load ROM + transpiled blocks ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;

function createBootedSystem() {
  const m = new Uint8Array(MEM_SIZE);
  m.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, m, { peripherals });
  const cpu = executor.cpu;

  // ── Cold boot (exact copy from probe-605) ──
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; m.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; m.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = 0xD1A87E - 12; m.fill(0xFF, cpu.sp, cpu.sp + 12);
  executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

  // ── Launch-init ──
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = 0xD1A87E - 24;
  cpu.sp = launchSp;
  write24(m, launchSp, 0x0019be);
  write24(m, 0xD008E0, launchSp);
  executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  // ── Paint ──
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(m, cpu.sp, 0x0019b5);
  executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  return { executor, cpu, mem: m, peripherals };
}

function capturePreKeySnapshot(m) {
  const snapshot = {
    d007ca: new Uint8Array(21),
    d0008d: m[0xD0008D],
    d0231a: read24(m, 0xD0231A),
    d0243a: read24(m, 0xD0243A),
    d0058c: m[0xD0058C],
    d0058e: m[0xD0058E],
    d00587: m[0xD00587],
    d0009f: m[0xD0009F],
    iyFlags: new Uint8Array(128),
  };
  for (let i = 0; i < 21; i++) snapshot.d007ca[i] = m[0xD007CA + i];
  for (let i = 0; i < 128; i++) snapshot.iyFlags[i] = m[0xD00080 + i];
  return snapshot;
}

function restorePreKeySnapshot(m, snapshot) {
  for (let i = 0; i < 21; i++) m[0xD007CA + i] = snapshot.d007ca[i];
  m[0xD0008D] = snapshot.d0008d;
  write24(m, 0xD0231A, snapshot.d0231a);
  write24(m, 0xD0243A, snapshot.d0243a);
  m[0xD0058C] = snapshot.d0058c;
  m[0xD0058E] = snapshot.d0058e;
  m[0xD00587] = snapshot.d00587;
  m[0xD0009F] = snapshot.d0009f;
  for (let i = 0; i < 128; i++) m[0xD00080 + i] = snapshot.iyFlags[i];
}

function seedKey2(m) {
  m[0xD0058C] = 0x90;
  m[0xD0058E] = 0x90;
  m[0xD00587] = 0x90;
  m[0xD0009F] = m[0xD0009F] | 0x20;
  m[0xD00080] = m[0xD00080] | 0x08;
}

function runOuterWithTracking(executor, cpu, m) {
  let totalSteps = 0;
  let peak = {
    step: 0,
    nonWhite: countVramNonWhite(m),
  };
  console.log(`sample step=${peak.step} nonWhite=${peak.nonWhite}`);

  // Set up SP and longjmp anchor
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(m, cpu.sp, 0x0019b5);
  write24(m, 0xD008E0, cpu.sp);

  while (totalSteps < OUTER_MAX_STEPS) {
    const chunk = Math.min(SAMPLE_INTERVAL, OUTER_MAX_STEPS - totalSteps);
    const startPc = totalSteps === 0 ? OUTER_LOOP_PC : undefined;

    if (totalSteps === 0) {
      executor.runFrom(OUTER_LOOP_PC, 'adl', { maxSteps: chunk, maxLoopIterations: 50000 });
    } else {
      // Continue from where we left off — re-enter outer loop
      executor.runFrom(OUTER_LOOP_PC, 'adl', { maxSteps: chunk, maxLoopIterations: 50000 });
    }
    totalSteps += chunk;

    const nonWhite = countVramNonWhite(m);
    console.log(`sample step=${totalSteps} nonWhite=${nonWhite}`);
    if (nonWhite > peak.nonWhite) {
      peak = { step: totalSteps, nonWhite };
      console.log(`new peak step=${peak.step} nonWhite=${peak.nonWhite}`);
    }
  }

  return peak;
}

function runOuterToStep(executor, cpu, m, targetSteps) {
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(m, cpu.sp, 0x0019b5);
  write24(m, 0xD008E0, cpu.sp);

  let totalSteps = 0;
  while (totalSteps < targetSteps) {
    const chunk = Math.min(SAMPLE_INTERVAL, targetSteps - totalSteps);
    executor.runFrom(OUTER_LOOP_PC, 'adl', { maxSteps: chunk, maxLoopIterations: 50000 });
    totalSteps += chunk;
  }
}

function printFullRendering(pixels) {
  console.log('\n=== FULL DISPLAY TEXT RENDERING: NON-WHITE ROWS ONLY ===');
  for (let y = 0; y < LCD_HEIGHT; y++) {
    if (rowHasContent(pixels, y)) console.log(`${String(y).padStart(3, '0')}:|${rowText(pixels, y)}|`);
  }
}

function printDetailedRegion(pixels, title, startY, endY) {
  console.log(`\n=== ${title} COLOR CODES rows ${startY}-${endY} ===`);
  for (let y = startY; y <= endY; y++) {
    console.log(`${String(y).padStart(3, '0')}: ${rowHex(pixels, y)}`);
  }
}

function printAnalysis(pixels) {
  console.log('\n=== UNIQUE COLORS ===');
  for (const [color, count] of summarizeColors(pixels)) {
    console.log(`0x${colorHex(color)} ${String(count).padStart(6, ' ')} pixels`);
  }

  console.log('\n=== CONTENT ROW GROUPS ===');
  for (const box of boundingBoxesByRows(pixels)) {
    console.log(`rows ${box.minY}-${box.maxY}, cols ${box.minX}-${box.maxX}`);
  }

  console.log('\n=== RECOGNIZABLE SHAPES ===');
  const entryRows = [];
  for (let y = 210; y <= 239; y++) {
    if (rowHasContent(pixels, y)) entryRows.push(y);
  }
  if (entryRows.length) {
    console.log(`entry line has rendered content on rows ${entryRows[0]}-${entryRows[entryRows.length - 1]}; inspect the text rendering for the typed glyph shape.`);
  } else {
    console.log('entry line rows 210-239 are all white.');
  }

  const statusRows = [];
  for (let y = 0; y <= 30; y++) {
    if (rowHasContent(pixels, y)) statusRows.push(y);
  }
  if (statusRows.length) {
    console.log(`status bar has rendered content on rows ${statusRows[0]}-${statusRows[statusRows.length - 1]}.`);
  } else {
    console.log('status bar rows 0-30 are all white.');
  }
}

// ── Main ──
console.log('phase606 VRAM capture probe');

// First pass: boot, snapshot, seed key, find peak VRAM step
const first = createBootedSystem();
const vramAfterPaint = countVramNonWhite(first.mem);
console.log(`Post-paint VRAM: ${vramAfterPaint}px`);

const preKeySnapshot = capturePreKeySnapshot(first.mem);
seedKey2(first.mem);
const peak = runOuterWithTracking(first.executor, first.cpu, first.mem);

console.log(`\n=== PEAK SUMMARY ===`);
console.log(`peak_step=${peak.step}`);
console.log(`peak_non_white_pixels=${peak.nonWhite}`);

// Replay pass: boot fresh, restore snapshot, seed key, run to peak step, capture bitmap
const replay = createBootedSystem();
const replayVram = countVramNonWhite(replay.mem);
console.log(`\nReplay post-paint VRAM: ${replayVram}px`);

restorePreKeySnapshot(replay.mem, preKeySnapshot);
seedKey2(replay.mem);
const replaySteps = peak.step + 100;
console.log(`replay: running outer loop to peak+100 steps (${replaySteps})`);
runOuterToStep(replay.executor, replay.cpu, replay.mem, replaySteps);
const peakPixels = captureVram(replay.mem);
const replayNonWhite = peakPixels.reduce((count, color) => count + (color === WHITE ? 0 : 1), 0);

console.log(`replay_capture_step=${replaySteps}`);
console.log(`replay_non_white_pixels=${replayNonWhite}`);

printAnalysis(peakPixels);
printFullRendering(peakPixels);
printDetailedRegion(peakPixels, 'STATUS BAR', 0, 30);
printDetailedRegion(peakPixels, 'ENTRY LINE', 210, 239);
