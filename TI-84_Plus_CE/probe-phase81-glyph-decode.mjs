#!/usr/bin/env node
// Phase 81 — Glyph decode for Phase 78 parent renders.
//
// Re-runs the 3 Phase 78 probes and intercepts every call to 0x0a1799 (the
// single-char printer). Each invocation records:
//   - The character code in register A
//   - The VRAM column where the glyph is placed
// This gives the exact character sequence with 100% accuracy (no image-matching
// needed) and also provides pixel data for visual verification.
//
// Additionally builds a font atlas from 0x0a1799 to produce reference glyph
// bitmaps for the report's visual verification section.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── constants ────────────────────────────────────────────────────────────────

const VRAM_BASE        = 0xD40000;
const VRAM_W           = 320;
const VRAM_H           = 240;
const VRAM_SIZE        = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL    = 0xAAAA;

const BOOT_ENTRY       = 0x000000;
const OS_INIT_ENTRY    = 0x08C331;
const SET_FG_ENTRY     = 0x0802B2;
const SINGLE_CHAR      = 0x0A1799;  // prints one char, A = char code
const SCREEN_STACK_TOP = 0xD1A87E;
const PROBE_IY         = 0xD00080;
const RAM_START        = 0x400000;
const RAM_END          = 0xE00000;

const CELL_H = 18;
const CELL_W = 14;

// Phase 78 status bar row range
const STATUS_ROW_START = 17;
const STATUS_ROW_END   = 34;

// Phase 78 probes
const PROBES = [
  { name: 'p0a2b72_05e7d2', entry: 0x05e7d2, note: 'parent 1 of 0a2b72' },
  { name: 'p0a2b72_05e481', entry: 0x05e481, note: 'parent 2 of 0a2b72' },
  { name: 'p0a2b72_09cb14', entry: 0x09cb14, note: 'parent 3 of 0a2b72' },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

function readPixel(mem, r, c) {
  const off = VRAM_BASE + r * VRAM_W * 2 + c * 2;
  return mem[off] | (mem[off + 1] << 8);
}

// Extract 14×18 bit matrix. normalMode: 1 = dark (atlas). invertedMode: 1 = white (phase78).
function extractCell(mem, rowStart, colStart, normalMode) {
  const bits = [];
  for (let r = 0; r < CELL_H; r++) {
    const row = [];
    for (let c = 0; c < CELL_W; c++) {
      const rr = rowStart + r;
      const cc = colStart + c;
      if (rr < 0 || rr >= VRAM_H || cc < 0 || cc >= VRAM_W) { row.push(0); continue; }
      const px = readPixel(mem, rr, cc);
      row.push(normalMode
        ? ((px !== VRAM_SENTINEL && px < 0x1000) ? 1 : 0)
        : (px === 0xFFFF ? 1 : 0));
    }
    bits.push(row);
  }
  return bits;
}

function cellFgCount(cell) {
  let n = 0;
  for (const row of cell) for (const b of row) n += b;
  return n;
}

function cellToAscii(cell, on = '#', off = '.') {
  return cell.map(row => row.map(b => b ? on : off).join('')).join('\n');
}

// Render-style ASCII art of VRAM region (# = dark fg, . = white bg, space = sentinel).
function renderAscii(mem, bbox, maxRows = 50, maxCols = 80) {
  if (!bbox) return '(no pixels drawn)';
  const rows = Math.min(maxRows, bbox.maxR - bbox.minR + 1);
  const cols = Math.min(maxCols, bbox.maxC - bbox.minC + 1);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const px = readPixel(mem, bbox.minR + r, bbox.minC + c);
      if (px === VRAM_SENTINEL) line += ' ';
      else if (px < 0x1000) line += '#';
      else line += '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function vramStats(mem) {
  let drawn = 0, fg = 0, bg = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  for (let r = 0; r < VRAM_H; r++) {
    for (let c = 0; c < VRAM_W; c++) {
      const px = readPixel(mem, r, c);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px < 0x1000) fg++;
      else bg++;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }
  return { drawn, fg, bg, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}

function snapshotCpu(cpu) {
  const f = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
              'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];
  return Object.fromEntries(f.map(k => [k, cpu[k]]));
}
function restoreCpu(cpu, snap) {
  for (const [k, v] of Object.entries(snap)) cpu[k] = v;
}

// Pretty-print a char code
function charName(code) {
  if (code >= 0x20 && code <= 0x7E) return String.fromCharCode(code);
  return `[0x${code.toString(16).padStart(2, '0')}]`;
}

// ── load runtime ─────────────────────────────────────────────────────────────

console.log('Loading ROM and runtime...');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);
const romMod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romMod.PRELIFTED_BLOCKS;
console.log(`Loaded ${typeof BLOCKS === 'object' ? Object.keys(BLOCKS).length : BLOCKS.length} blocks`);

// ── shared CPU/mem ────────────────────────────────────────────────────────────

const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(BLOCKS, mem, { peripherals });
const cpu = ex.cpu;

console.log('Cold boot...');
ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

console.log('OS init...');
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = SCREEN_STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

console.log('SetTextFgColor (fg=black)...');
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = PROBE_IY;
cpu.hl = 0x000000;
cpu.sp = SCREEN_STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
ex.runFrom(SET_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const ramSnap = new Uint8Array(mem.slice(RAM_START, RAM_END));
const cpuSnap = snapshotCpu(cpu);
console.log('Snapshot taken.\n');

// ── helpers: state reset ──────────────────────────────────────────────────────

function clearVramSentinel() {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off]     = VRAM_SENTINEL & 0xFF;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }
}

function resetState() {
  mem.set(ramSnap, RAM_START);
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  clearVramSentinel();
}

// ── PHASE A: build font atlas ─────────────────────────────────────────────────
// Render each printable char with 0x0a1799 at cursor (col=0, row=0).
// Glyph lands at VRAM rows 37-54, cols 0-13.

console.log('=== Building font atlas ===');

const fontAtlas = new Map(); // charCode → 14×18 bit matrix

// Discover actual glyph landing row by probing 'R'
resetState();
mem[0xD00595] = 0; mem[0xD00596] = 0; cpu.a = 0x52;
cpu.sp = SCREEN_STACK_TOP - 9; mem.fill(0xFF, cpu.sp, cpu.sp + 9);
ex.runFrom(SINGLE_CHAR, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
let atlasRow = -1, atlasCol = -1;
for (let r = 0; r < VRAM_H && atlasRow < 0; r++) {
  for (let c = 0; c < VRAM_W && atlasRow < 0; c++) {
    if (readPixel(mem, r, c) !== VRAM_SENTINEL) { atlasRow = r; atlasCol = c; }
  }
}
console.log(`Atlas glyph origin: row=${atlasRow}, col=${atlasCol}`);

// Build atlas for all printable ASCII + extended TI chars
const ATLAS_CHARS = [];
for (let c = 0x20; c <= 0xFA; c++) ATLAS_CHARS.push(c);

for (const code of ATLAS_CHARS) {
  resetState();
  mem[0xD00595] = 0; mem[0xD00596] = 0; cpu.a = code;
  cpu.sp = SCREEN_STACK_TOP - 9; mem.fill(0xFF, cpu.sp, cpu.sp + 9);
  ex.runFrom(SINGLE_CHAR, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  const cell = extractCell(mem, atlasRow, atlasCol, true /* normal: dark=stroke */);
  fontAtlas.set(code, cell);
}
console.log(`Atlas: ${fontAtlas.size} chars`);

// Verify 'R'
const rCell = fontAtlas.get(0x52);
console.log("\n'R' glyph:");
console.log(cellToAscii(rCell));

// ── PHASE B: run Phase 78 probes, intercept 0x0a1799 calls ───────────────────
// For each probe:
//   1. Install write8 interceptor to track VRAM pixel positions.
//   2. Install onBlock hook to detect 0x0a1799 entry and capture A register.
//   3. Pair each invocation with its VRAM write range → get (char, col) pairs.

console.log('\n=== Running Phase 78 probes ===');

const probeResults = [];

for (const probe of PROBES) {
  console.log(`\nProbing ${probe.name} (${hex(probe.entry)})...`);
  resetState();
  cpu.sp = SCREEN_STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  // Intercept 0x0a1799 invocations
  const invocations = [];
  let currentInvoc = null;

  const origWrite = cpu.write8.bind(cpu);
  cpu.write8 = function(a, v) {
    if (a >= VRAM_BASE && a < VRAM_BASE + VRAM_SIZE && currentInvoc) {
      currentInvoc.writes.push({ addr: a, val: v });
    }
    return origWrite(a, v);
  };

  const r = ex.runFrom(probe.entry, 'adl', {
    maxSteps: 25000,
    maxLoopIterations: 500,
    onBlock: pc => {
      if (pc === SINGLE_CHAR) {
        currentInvoc = { charCode: cpu.a, writes: [] };
        invocations.push(currentInvoc);
      }
    },
  });

  // Restore write8 (not strictly needed since we overwrite per-probe)
  // Compute VRAM stats
  const stats = vramStats(mem);
  const asciiArt = renderAscii(mem, stats.bbox);

  console.log(`  steps=${r.steps} term=${r.termination}`);
  if (stats.bbox) {
    const { minR, maxR, minC, maxC } = stats.bbox;
    console.log(`  drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} bbox=r${minR}-${maxR} c${minC}-${maxC}`);
  }
  console.log(`  0x0a1799 invocations: ${invocations.length}`);

  // Sort invocations by leftmost column
  const decoded = invocations
    .filter(inv => inv.writes.length > 0)
    .map(inv => {
      const pixOffsets = [...new Set(inv.writes.map(w => Math.floor((w.addr - VRAM_BASE) / 2)))];
      const minPxOff = Math.min(...pixOffsets);
      const minR2 = Math.floor(minPxOff / VRAM_W);
      const minC2 = minPxOff % VRAM_W;
      return { charCode: inv.charCode, col: minC2, row: minR2 };
    })
    .sort((a, b) => a.col - b.col);

  // Build text string
  const text = decoded.map(d => charName(d.charCode)).join('');
  console.log(`  decoded: "${text}"`);

  // Take VRAM snapshot for the report
  const vramSnap = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE));

  probeResults.push({ probe, r, stats, asciiArt, decoded, text, vramSnap });
}

// ── PHASE C: write report ─────────────────────────────────────────────────────

console.log('\n=== Writing report ===');

const out = [];
const log = s => out.push(s);

log('# Phase 81 — Glyph Decode Report');
log('');
log('Re-ran the 3 Phase 78 parent probes and decoded the rendered status-bar text by');
log('intercepting every call to `0x0a1799` (the single-char printer) and recording');
log('the character code in register A at each invocation.');
log('');
log('This approach gives **exact** character codes — no image matching needed.');
log('');
log('## Method');
log('');
log('1. Booted ROM → OS init → SetTextFgColor(black).');
log('2. Installed a `write8` interceptor and `onBlock` hook for `0x0a1799`.');
log('3. Ran each Phase 78 probe with sentinel-cleared VRAM.');
log('4. Collected (charCode, VRAM col) pairs from all `0x0a1799` invocations.');
log('5. Sorted by column → left-to-right character sequence.');
log('');
log('## Summary');
log('');
log('| probe | entry | decoded text | chars | steps |');
log('|-------|-------|-------------|------:|------:|');
for (const pr of probeResults) {
  const { probe, r, decoded, text } = pr;
  log(`| \`${probe.name}\` | ${hex(probe.entry)} | \`${text}\` | ${decoded.length} | ${r.steps} |`);
}
log('');
log('### Interpretation');
log('');
log('The text `eqnname,color#,[0x00] li` appears in all three probes.');
log('This is a **Y= equation attribute line** — the status bar is rendering the');
log('settings for a function in the Y= editor:');
log('');
log('- `eqnname` = equation name');
log('- `color#` = color number');
log('- `[0x00]` = null/separator');
log('- `li` = line style (start of "line" or "linestyle")');
log('');
log('The probe `09cb14` adds a leading `:` — likely a field separator or second entry.');
log('');
log('The three non-ASCII chars at the start (`[0xef] [0x02] [0xc1]`) are TI special');
log('tokens, possibly indicating a menu header or selection marker.');
log('');

log('## Detailed Results');
log('');

for (const pr of probeResults) {
  const { probe, r, stats, asciiArt, decoded, text } = pr;
  log(`### ${probe.name} (${hex(probe.entry)})`);
  log('');
  log(`- Note: ${probe.note}`);
  log(`- Steps: ${r.steps}, termination: ${r.termination}`);
  log(`- Drawn: ${stats.drawn} (fg=${stats.fg} bg=${stats.bg})`);
  if (stats.bbox) {
    const { minR, maxR, minC, maxC } = stats.bbox;
    log(`- BBox: r${minR}-${maxR} c${minC}-${maxC}`);
  }
  log(`- **Decoded text: \`${text}\`**`);
  log('');
  log('Character table (by VRAM column):');
  log('');
  log('| col | char | code | printable |');
  log('|-----|------|------|-----------|');
  for (const d of decoded) {
    const code = d.charCode;
    const isPrintable = code >= 0x20 && code <= 0x7E;
    const display = isPrintable ? `'${String.fromCharCode(code)}'` : '—';
    log(`| ${d.col} | ${charName(code)} | 0x${code.toString(16).padStart(2,'0')} | ${display} |`);
  }
  log('');
  log('VRAM ASCII preview (# = dark/fg, . = white/bg, clipped to first 80 cols of bbox):');
  log('```');
  log(asciiArt);
  log('```');
  log('');
}

log('## Font Atlas Verification');
log('');
log('Reference glyphs built by calling `0x0a1799` directly for key chars:');
log('');
for (const [label, code] of [['R', 0x52], ['O', 0x4F], ['e', 0x65], ['n', 0x6E], ['a', 0x61]]) {
  const cell = fontAtlas.get(code);
  if (!cell) continue;
  log(`**'${label}' (0x${code.toString(16)})** fg=${cellFgCount(cell)}`);
  log('```');
  log(cellToAscii(cell));
  log('```');
  log('');
}

const reportPath = path.join(__dirname, 'phase81-glyph-decode-report.md');
fs.writeFileSync(reportPath, out.join('\n'));
console.log(`\nWrote report to ${reportPath}`);
console.log('\nFinal decoded texts:');
for (const pr of probeResults) {
  console.log(`  ${pr.probe.name}: "${pr.text}"`);
}
