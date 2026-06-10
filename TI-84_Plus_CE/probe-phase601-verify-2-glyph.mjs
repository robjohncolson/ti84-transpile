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

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 601: Verify 2-glyph in VRAM');

// ── Phase 0: Cold boot (verbatim from probe-599) ──
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

// ── Phase 4: Outer loop with key processing ──
// Capture VRAM at its peak by snapshotting when non-white pixel count is highest
let peakVram = 0;
let peakStep = 0;
let peakSnapshot = null;
let stepCounter = 0;
let sampleInterval = 1000; // check every 1000 blocks

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
        // Snapshot the VRAM region (320*240*2 = 153600 bytes)
        peakSnapshot = new Uint8Array(320 * 240 * 2);
        peakSnapshot.set(mem.subarray(0xD40000, 0xD40000 + 320 * 240 * 2));
      }
    }
  },
});

const vramAfter = countVramNonWhite(mem);
console.log(`Post-key VRAM: ${vramAfter} non-white pixels`);
console.log(`Peak VRAM: ${peakVram} non-white pixels at step ${peakStep}`);
console.log(`Execution: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`);

// ── Read cursor/display state ──
const d0231a = read24(mem, 0xD0231A);
const d0243a = read24(mem, 0xD0243A);
const d007e0 = mem[0xD007E0];
console.log(`Cursor: D0231A=${hex(d0231a)} D0243A=${hex(d0243a)} D007E0=${hex(d007e0, 2)}`);

// If we have a peak snapshot, use it for analysis instead of current (wiped) VRAM
const analysisMem = peakSnapshot ? peakSnapshot : null;
if (!analysisMem) {
  console.log('No peak VRAM snapshot captured — VRAM was never non-white during key processing.');
  console.log('Phase 601 complete.');
  process.exit(0);
}

console.log(`\nAnalyzing peak VRAM snapshot (${peakVram} non-white pixels at step ${peakStep})...`);

// ── Phase 5: VRAM glyph analysis (using peak snapshot) ──
const WIDTH = 320;
const HEIGHT = 240;

// Read from the peak snapshot (offset relative to VRAM base, not absolute)
function getPixel(row, col) {
  const offset = (row * WIDTH + col) * 2;
  return analysisMem[offset] | (analysisMem[offset + 1] << 8);
}

function isNonWhite(row, col) {
  return getPixel(row, col) !== 0xFFFF;
}

// 5a: Per-row non-white pixel counts for body area
console.log('\n=== Per-row non-white pixel counts (rows 30-239) ===');
const rowCounts = [];
for (let r = 30; r < HEIGHT; r++) {
  let count = 0;
  for (let c = 0; c < WIDTH; c++) {
    if (isNonWhite(r, c)) count++;
  }
  if (count > 0) {
    rowCounts.push({ row: r, count });
  }
}
for (const { row, count } of rowCounts) {
  console.log(`  row ${row}: ${count} px`);
}

// 5b: Find character-sized clusters using connected-component labeling
// Build a binary grid for the body area (rows 30-239)
const START_ROW = 30;
const END_ROW = 240;
const bodyRows = END_ROW - START_ROW;

// Simple flood-fill to find connected components of non-white pixels
const visited = new Uint8Array(bodyRows * WIDTH);

function idx(r, c) {
  return (r - START_ROW) * WIDTH + c;
}

function floodFill(startR, startC) {
  const stack = [[startR, startC]];
  const pixels = [];
  let minR = startR, maxR = startR, minC = startC, maxC = startC;

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    if (r < START_ROW || r >= END_ROW || c < 0 || c >= WIDTH) continue;
    if (visited[idx(r, c)]) continue;
    if (!isNonWhite(r, c)) continue;

    visited[idx(r, c)] = 1;
    pixels.push([r, c]);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);

    // 8-connected neighbors
    stack.push([r - 1, c - 1], [r - 1, c], [r - 1, c + 1]);
    stack.push([r, c - 1], [r, c + 1]);
    stack.push([r + 1, c - 1], [r + 1, c], [r + 1, c + 1]);
  }

  return { pixels, minR, maxR, minC, maxC };
}

const clusters = [];
for (let r = START_ROW; r < END_ROW; r++) {
  for (let c = 0; c < WIDTH; c++) {
    if (!visited[idx(r, c)] && isNonWhite(r, c)) {
      const cluster = floodFill(r, c);
      const w = cluster.maxC - cluster.minC + 1;
      const h = cluster.maxR - cluster.minR + 1;
      clusters.push({
        minR: cluster.minR,
        maxR: cluster.maxR,
        minC: cluster.minC,
        maxC: cluster.maxC,
        width: w,
        height: h,
        pixelCount: cluster.pixels.length,
      });
    }
  }
}

console.log(`\n=== Found ${clusters.length} total clusters ===`);

// Sort clusters by row then column
clusters.sort((a, b) => a.minR - b.minR || a.minC - b.minC);

// Show all clusters with character-like dimensions (width 3-20, height 3-20)
const charClusters = clusters.filter(c => c.width >= 3 && c.width <= 20 && c.height >= 3 && c.height <= 20);
console.log(`\n=== Character-sized clusters (3-20px wide, 3-20px tall): ${charClusters.length} ===`);
for (const c of charClusters) {
  console.log(`  rows ${c.minR}-${c.maxR} cols ${c.minC}-${c.maxC} (${c.width}x${c.height}, ${c.pixelCount}px)`);
}

// Also show larger clusters for context
const largeClusters = clusters.filter(c => c.width > 20 || c.height > 20);
console.log(`\n=== Larger clusters (>20px in either dimension): ${largeClusters.length} ===`);
for (const c of largeClusters) {
  console.log(`  rows ${c.minR}-${c.maxR} cols ${c.minC}-${c.maxC} (${c.width}x${c.height}, ${c.pixelCount}px)`);
}

// 5c: Dump ASCII art for a cluster
function dumpClusterAscii(cluster, label) {
  console.log(`\n=== ASCII art: ${label} (rows ${cluster.minR}-${cluster.maxR}, cols ${cluster.minC}-${cluster.maxC}, ${cluster.width}x${cluster.height}) ===`);
  for (let r = cluster.minR; r <= cluster.maxR; r++) {
    let line = '';
    for (let c = cluster.minC; c <= cluster.maxC; c++) {
      line += isNonWhite(r, c) ? '#' : '.';
    }
    console.log(`  r${String(r).padStart(3, '0')}: ${line}`);
  }
}

// Dump clusters in rows 39-55 (first text line from session 600)
const firstLineClusters = charClusters.filter(c => c.minR >= 39 && c.maxR <= 60);
console.log(`\n=== Clusters in rows 39-60: ${firstLineClusters.length} ===`);
for (let i = 0; i < firstLineClusters.length && i < 10; i++) {
  dumpClusterAscii(firstLineClusters[i], `first-line cluster ${i}`);
}

// Dump clusters in bottom third (rows 160-239, entry line area)
const bottomClusters = charClusters.filter(c => c.minR >= 160 && c.maxR <= 239);
console.log(`\n=== Clusters in bottom third (rows 160-239): ${bottomClusters.length} ===`);
for (let i = 0; i < bottomClusters.length && i < 10; i++) {
  dumpClusterAscii(bottomClusters[i], `bottom cluster ${i}`);
}

// If no bottom clusters, look for any clusters in rows 100-239
if (bottomClusters.length === 0) {
  const midBottomClusters = charClusters.filter(c => c.minR >= 100);
  console.log(`\n=== Clusters in rows 100-239 (fallback): ${midBottomClusters.length} ===`);
  for (let i = 0; i < midBottomClusters.length && i < 10; i++) {
    dumpClusterAscii(midBottomClusters[i], `mid-bottom cluster ${i}`);
  }
}

// 5d: Also dump ALL character clusters in rows 39-132 (where session 600 saw glyphs)
const glyphAreaClusters = charClusters.filter(c => c.minR >= 39 && c.maxR <= 135);
console.log(`\n=== All character clusters in glyph area (rows 39-135): ${glyphAreaClusters.length} ===`);
for (let i = 0; i < glyphAreaClusters.length && i < 20; i++) {
  dumpClusterAscii(glyphAreaClusters[i], `glyph-area cluster ${i}`);
}

// 5e: Shape analysis — check if any cluster matches '2' shape
// A '2' has: curved top (pixels concentrated top-right), diagonal middle, flat bottom
console.log('\n=== Shape analysis for potential "2" glyphs ===');
for (const c of charClusters) {
  if (c.height < 8 || c.width < 5) continue; // too small to be a '2'

  const midRow = Math.floor((c.minR + c.maxR) / 2);
  const topThird = { start: c.minR, end: c.minR + Math.floor(c.height / 3) };
  const midThird = { start: topThird.end, end: topThird.end + Math.floor(c.height / 3) };
  const botThird = { start: midThird.end, end: c.maxR };

  // Count pixels in each third, left and right halves
  let topLeft = 0, topRight = 0;
  let midLeft = 0, midRight = 0;
  let botLeft = 0, botRight = 0;
  const midCol = Math.floor((c.minC + c.maxC) / 2);

  for (let r = topThird.start; r <= topThird.end; r++) {
    for (let col = c.minC; col <= c.maxC; col++) {
      if (isNonWhite(r, col)) {
        if (col <= midCol) topLeft++; else topRight++;
      }
    }
  }
  for (let r = midThird.start; r <= midThird.end; r++) {
    for (let col = c.minC; col <= c.maxC; col++) {
      if (isNonWhite(r, col)) {
        if (col <= midCol) midLeft++; else midRight++;
      }
    }
  }
  for (let r = botThird.start; r <= botThird.end; r++) {
    for (let col = c.minC; col <= c.maxC; col++) {
      if (isNonWhite(r, col)) {
        if (col <= midCol) botLeft++; else botRight++;
      }
    }
  }

  // Bottom row pixel density (flat base of '2')
  let bottomRowPx = 0;
  for (let col = c.minC; col <= c.maxC; col++) {
    if (isNonWhite(c.maxR, col)) bottomRowPx++;
  }
  const bottomRowDensity = bottomRowPx / c.width;

  // '2' signature: top-right heavy, bottom full-width, bottom row dense
  const topRightHeavy = topRight > topLeft * 1.2;
  const bottomFull = bottomRowDensity > 0.6;
  const bottomHeavy = (botLeft + botRight) > (topLeft + topRight);

  if (bottomFull || (topRightHeavy && bottomHeavy)) {
    console.log(`  Potential '2' at rows ${c.minR}-${c.maxR} cols ${c.minC}-${c.maxC} (${c.width}x${c.height})`);
    console.log(`    top: L=${topLeft} R=${topRight} | mid: L=${midLeft} R=${midRight} | bot: L=${botLeft} R=${botRight}`);
    console.log(`    bottom row density: ${(bottomRowDensity * 100).toFixed(0)}% (${bottomRowPx}/${c.width})`);
    console.log(`    topRightHeavy=${topRightHeavy} bottomFull=${bottomFull} bottomHeavy=${bottomHeavy}`);
    dumpClusterAscii(c, 'potential-2');
  }
}

console.log('\nPhase 601 complete.');
