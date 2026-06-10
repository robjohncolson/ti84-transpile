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

function readPixel(mem, x, y) {
  const base = 0xD40000;
  const addr = base + (y * 320 + x) * 2;
  return mem[addr] | (mem[addr + 1] << 8);
}

function detectGlyphs(mem, startRow, endRow) {
  const width = 320;
  const height = endRow - startRow + 1;
  const bitmap = new Uint8Array(width * height);
  for (let y = startRow; y <= endRow; y++) {
    for (let x = 0; x < width; x++) {
      if (readPixel(mem, x, y) !== 0xFFFF) {
        bitmap[(y - startRow) * width + x] = 1;
      }
    }
  }

  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const parent = [0];

  function find(l) {
    while (parent[l] !== l) {
      parent[l] = parent[parent[l]];
      l = parent[l];
    }
    return l;
  }

  function union(a, b) {
    a = find(a);
    b = find(b);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!bitmap[idx]) continue;
      const above = y > 0 ? labels[(y - 1) * width + x] : 0;
      const left = x > 0 ? labels[y * width + (x - 1)] : 0;
      if (above === 0 && left === 0) {
        parent.push(nextLabel);
        labels[idx] = nextLabel++;
      } else if (above !== 0 && left === 0) {
        labels[idx] = above;
      } else if (above === 0 && left !== 0) {
        labels[idx] = left;
      } else {
        labels[idx] = Math.min(above, left);
        if (above !== left) union(above, left);
      }
    }
  }

  const components = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!labels[idx]) continue;
      const root = find(labels[idx]);
      labels[idx] = root;
      const absY = y + startRow;
      if (!components.has(root)) {
        components.set(root, { minX: x, maxX: x, minY: absY, maxY: absY, count: 0 });
      }
      const c = components.get(root);
      c.minX = Math.min(c.minX, x);
      c.maxX = Math.max(c.maxX, x);
      c.minY = Math.min(c.minY, absY);
      c.maxY = Math.max(c.maxY, absY);
      c.count++;
    }
  }

  const glyphs = [];
  for (const [, c] of components) {
    if (c.count >= 3) {
      const w = c.maxX - c.minX + 1;
      const h = c.maxY - c.minY + 1;
      glyphs.push({
        minX: c.minX, maxX: c.maxX,
        minY: c.minY, maxY: c.maxY,
        width: w, height: h,
        pixelCount: c.count,
        density: +(c.count / (w * h)).toFixed(3),
      });
    }
  }

  glyphs.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  return glyphs;
}

// Capture a full body snapshot (rows 30-160) into a buffer for later analysis
function captureBodySnapshot(mem) {
  const snapshot = {};
  for (let y = 0; y <= 239; y++) {
    const row = [];
    for (let x = 0; x < 320; x++) {
      const px = readPixel(mem, x, y);
      if (px !== 0xFFFF) row.push({ x, px });
    }
    if (row.length > 0) snapshot[y] = row;
  }
  return snapshot;
}

// Render ASCII art from a snapshot for rows startY-endY, cols minX-maxX
function renderAscii(snapshot, startY, endY, minX, maxX) {
  const lines = [];
  for (let y = startY; y <= endY; y++) {
    const rowData = snapshot[y] || [];
    if (rowData.length === 0) continue;
    // Check if any pixel falls in our column range
    const inRange = rowData.filter(p => p.x >= minX && p.x <= maxX);
    if (inRange.length === 0) continue;

    const pxMap = new Map();
    for (const p of inRange) pxMap.set(p.x, p.px);

    let line = `  ${String(y).padStart(3)}: `;
    for (let x = minX; x <= maxX; x++) {
      const px = pxMap.get(x);
      if (px === undefined) line += '.';
      else if (px === 0x0000) line += '#';
      else line += 'o';
    }
    lines.push(line);
  }
  return lines;
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 600: VRAM glyph check after "2" keypress');
console.log('============================================================');

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

const preKeyTotal = countVramNonWhite(mem);
console.log(`Pre-key VRAM: ${preKeyTotal} non-white pixels (all in status bar)`);

// ── Phase 3: Seed key ──
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

// ── Phase 4: Outer loop with FINE-GRAINED VRAM tracking ──
console.log('\n=== EXECUTING OUTER LOOP WITH KEY 0x90 ("2") ===');

let stepCounter = 0;
const vramTimeline = [];
let prevVram = preKeyTotal;

// Key VRAM snapshots we want to capture
let snapshot3031 = null;  // When VRAM first hits ~3031
let snapshotPeak = null;  // Overall peak
let peakVram = 0;
let peakStep = 0;

// Sample every 2K steps for finer granularity
let nextSample = 2000;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    stepCounter++;

    if (stepCounter >= nextSample) {
      const nw = countVramNonWhite(mem);
      vramTimeline.push({ step: stepCounter, nw, pc: hex(pc & 0xFFFFFF) });

      // Capture snapshot when VRAM first reaches ~3031 (the known target)
      if (!snapshot3031 && nw >= 3000 && nw <= 3100) {
        snapshot3031 = { step: stepCounter, nw, data: captureBodySnapshot(mem) };
      }

      if (nw > peakVram) {
        peakVram = nw;
        peakStep = stepCounter;
        snapshotPeak = { step: stepCounter, nw, data: captureBodySnapshot(mem) };
      }

      // Also capture if VRAM just jumped significantly
      if (nw > prevVram + 500 && !snapshot3031) {
        // Big jump detected
      }

      prevVram = nw;
      nextSample += 2000;
    }
  },
});

console.log(`Termination: ${result.termination}, steps: ${result.steps}, lastPc: ${hex(result.lastPc)}`);
console.log(`Post-key VRAM: ${countVramNonWhite(mem)} (after halt/wipe)`);

// ── VRAM TIMELINE ──
console.log('\n=== VRAM TIMELINE (every 2K steps) ===');
for (const s of vramTimeline) {
  const bar = '#'.repeat(Math.min(40, Math.round(s.nw / 100)));
  console.log(`  ${String(s.step).padStart(6)}: ${String(s.nw).padStart(5)} px  ${bar}  ${s.pc}`);
}

// ── SNAPSHOT AT 3031 ──
if (snapshot3031) {
  console.log(`\n=== VRAM SNAPSHOT AT ~3031 (step ${snapshot3031.step}, ${snapshot3031.nw} px) ===`);
  analyzeSnapshot(snapshot3031);
} else {
  console.log('\nNo snapshot captured at ~3031 pixels. Checking peak instead.');
}

// ── PEAK SNAPSHOT ──
if (snapshotPeak && snapshotPeak.step !== (snapshot3031 && snapshot3031.step)) {
  console.log(`\n=== PEAK VRAM SNAPSHOT (step ${snapshotPeak.step}, ${snapshotPeak.nw} px) ===`);
  analyzeSnapshot(snapshotPeak);
}

function analyzeSnapshot(snap) {
  const data = snap.data;

  // Status bar summary
  let statusPx = 0;
  for (let y = 0; y < 30; y++) {
    if (data[y]) statusPx += data[y].length;
  }
  console.log(`  Status bar (rows 0-29): ${statusPx} px`);

  // Body area (rows 30-239)
  let bodyPx = 0;
  for (let y = 30; y <= 239; y++) {
    if (data[y]) bodyPx += data[y].length;
  }
  console.log(`  Body area (rows 30-239): ${bodyPx} px`);

  // Detailed body rows
  console.log('  Body rows with content:');
  for (let y = 30; y <= 160; y++) {
    if (data[y] && data[y].length > 0) {
      const xs = data[y].map(p => p.x);
      console.log(`    Row ${y}: ${data[y].length} px at x=[${xs.join(',')}]`);
    }
  }

  // ASCII art of body area (find bounds first)
  let bodyMinX = 320, bodyMaxX = 0, bodyMinY = 240, bodyMaxY = 0;
  for (let y = 30; y <= 160; y++) {
    if (!data[y]) continue;
    for (const p of data[y]) {
      bodyMinX = Math.min(bodyMinX, p.x);
      bodyMaxX = Math.max(bodyMaxX, p.x);
      bodyMinY = Math.min(bodyMinY, y);
      bodyMaxY = Math.max(bodyMaxY, y);
    }
  }

  if (bodyMinX <= bodyMaxX && bodyMaxX - bodyMinX < 200) {
    console.log(`\n  ASCII render of body (rows ${bodyMinY}-${bodyMaxY}, cols ${bodyMinX}-${bodyMaxX}):`);
    const lines = renderAscii(data, bodyMinY, bodyMaxY, bodyMinX, bodyMaxX);
    for (const l of lines) console.log(l);
  }

  // Glyph detection on body area using snapshot data
  // Re-detect from current mem isn't valid since mem may have changed,
  // but we stored the snapshot data, so build a virtual bitmap
  console.log('\n  Glyph clusters:');
  const glyphRows = {};
  for (let y = 30; y <= 160; y++) {
    if (data[y]) {
      for (const p of data[y]) {
        const key = `${p.x},${y}`;
        glyphRows[key] = true;
      }
    }
  }

  // Simple connected-component on the snapshot
  const width = 320;
  const visited = new Set();
  const clusters = [];

  function bfs(startX, startY) {
    const queue = [[startX, startY]];
    visited.add(`${startX},${startY}`);
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let count = 0;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      count++;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);

      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const nk = `${nx},${ny}`;
        if (!visited.has(nk) && glyphRows[nk]) {
          visited.add(nk);
          queue.push([nx, ny]);
        }
      }
    }
    return { minX, maxX, minY, maxY, count, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  for (let y = 30; y <= 160; y++) {
    if (!data[y]) continue;
    for (const p of data[y]) {
      const key = `${p.x},${y}`;
      if (!visited.has(key)) {
        const cluster = bfs(p.x, y);
        if (cluster.count >= 3) {
          clusters.push(cluster);
        }
      }
    }
  }

  clusters.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  for (const c of clusters) {
    const density = (c.count / (c.w * c.h)).toFixed(3);
    console.log(`    bbox(${c.minX},${c.minY})-(${c.maxX},${c.maxY}) ${c.w}x${c.h} ${c.count}px density=${density}`);
  }
}

console.log('\nPhase 600 complete.');
