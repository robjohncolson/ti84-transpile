#!/usr/bin/env node
// Phase 82 — Probe 0x09cxxx candidates to find the top-level Y= editor entry point.
//
// Phase 80-3 found 19 external callers of 0x05e4xx in the 0x09c000-0x09cfff page.
// Phase 78/81 confirmed 0x09cb14 renders a Y= equation attribute status bar.
// Now we probe ALL 19 candidates to find which one renders the FULL Y= editor
// screen (Y1=, Y2=, etc. equation list) — that's the top-level entry we want.
//
// Method:
//   1. Boot ROM → OS init → SetTextFgColor(black) — done once, snapshots taken.
//   2. For each candidate: reset state, run with maxSteps=30000, record VRAM.
//   3. For probes with >5000 VRAM pixels, also capture 0x0a1799 char intercepts.
//   4. Write report with results table, decoded text, and ASCII art for top 3.

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
const SINGLE_CHAR      = 0x0A1799;
const SCREEN_STACK_TOP = 0xD1A87E;
const PROBE_IY         = 0xD00080;
const RAM_START        = 0x400000;
const RAM_END          = 0xE00000;

// All 19 candidate addresses from Phase 80-3 (external callers of 0x05e4xx in 0x09c000-0x09cfff)
const PROBES = [
  { addr: 0x09c7c0, name: '09c7c0' },
  { addr: 0x09c986, name: '09c986' },
  { addr: 0x09c98c, name: '09c98c' },
  { addr: 0x09c9e8, name: '09c9e8' },
  { addr: 0x09ca7e, name: '09ca7e' },
  { addr: 0x09cb08, name: '09cb08' },
  { addr: 0x09cb14, name: '09cb14' },  // known: Y= attribute status bar
  { addr: 0x09cb1a, name: '09cb1a' },
  { addr: 0x09cb6f, name: '09cb6f' },
  { addr: 0x09cb87, name: '09cb87' },
  { addr: 0x09cba6, name: '09cba6' },
  { addr: 0x09cbab, name: '09cbab' },
  { addr: 0x09cbb7, name: '09cbb7' },
  { addr: 0x09cbbc, name: '09cbbc' },
  { addr: 0x09cceb, name: '09cceb' },
  { addr: 0x09ccf4, name: '09ccf4' },
  { addr: 0x09cd0f, name: '09cd0f' },
  { addr: 0x09cd2a, name: '09cd2a' },
  { addr: 0x09cd56, name: '09cd56' },
  { addr: 0x09cd5a, name: '09cd5a' },
];

const MAX_STEPS       = 30000;
const CHAR_THRESHOLD  = 5000;   // run char intercept pass if total px > this

// ── helpers ──────────────────────────────────────────────────────────────────

const hex   = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');
const hexB  = (v)        => '0x' + (v >>> 0).toString(16).padStart(2, '0');

function charName(code) {
  if (code >= 0x20 && code <= 0x7E) return String.fromCharCode(code);
  return `[${hexB(code)}]`;
}

function readPixel(mem, r, c) {
  const off = VRAM_BASE + r * VRAM_W * 2 + c * 2;
  return mem[off] | (mem[off + 1] << 8);
}

function vramStats(mem) {
  let fg = 0, bg = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  for (let r = 0; r < VRAM_H; r++) {
    for (let c = 0; c < VRAM_W; c++) {
      const px = readPixel(mem, r, c);
      if (px === VRAM_SENTINEL) continue;
      if (px < 0x1000) fg++; else bg++;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }
  const total = fg + bg;
  const bbox = maxR >= 0 ? { minR, maxR, minC, maxC } : null;
  return { fg, bg, total, bbox };
}

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
      else if (px < 0x1000)    line += '#';
      else                      line += '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function clearVramSentinel(mem) {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off]     = VRAM_SENTINEL & 0xFF;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }
}

const CPU_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];
function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map(k => [k, cpu[k]]));
}
function restoreCpu(cpu, snap) {
  for (const [k, v] of Object.entries(snap)) cpu[k] = v;
}

// ── load runtime ─────────────────────────────────────────────────────────────

console.log('Loading ROM...');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

console.log('Loading transpiled blocks...');
const romMod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS  = romMod.PRELIFTED_BLOCKS;
const blockCount = Array.isArray(BLOCKS) ? BLOCKS.length : Object.keys(BLOCKS).length;
console.log(`  ${blockCount} blocks`);

const { createExecutor }    = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);

// ── shared setup ─────────────────────────────────────────────────────────────

const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);   // 16 MB — critical
mem.set(romBytes);
const ex  = createExecutor(BLOCKS, mem, { peripherals });
const cpu = ex.cpu;

console.log('Cold boot...');
ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

console.log('OS init...');
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = SCREEN_STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

console.log('SetTextFgColor (black)...');
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = PROBE_IY;
cpu.hl  = 0x000000;
cpu.sp  = SCREEN_STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
ex.runFrom(SET_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

// Snapshot for reset
const ramSnap = new Uint8Array(mem.slice(RAM_START, RAM_END));
const cpuSnap = snapshotCpu(cpu);
console.log('Snapshot taken.\n');

function resetState() {
  mem.set(ramSnap, RAM_START);
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f   = 0x40;
  cpu.sp  = SCREEN_STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  clearVramSentinel(mem);
}

// ── pass 1: quick pixel count ─────────────────────────────────────────────────

console.log(`=== Pass 1: pixel count for all ${PROBES.length} candidates ===\n`);

const pass1 = [];

for (const probe of PROBES) {
  process.stdout.write(`  ${probe.name}... `);
  resetState();

  const r = ex.runFrom(probe.addr, 'adl', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: 500,
  });

  const s = vramStats(mem);
  const bboxStr = s.bbox
    ? `r${s.bbox.minR}-${s.bbox.maxR} c${s.bbox.minC}-${s.bbox.maxC}`
    : 'none';

  console.log(`total=${s.total} fg=${s.fg} bg=${s.bg}  bbox=${bboxStr}  steps=${r.steps} term=${r.termination}`);

  // Save VRAM snapshot for later ASCII art
  const vramSnap = s.total > 0 ? new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE)) : null;

  pass1.push({ probe, result: r, stats: s, vramSnap });
}

// ── pass 2: char intercept for high-pixel probes ──────────────────────────────

const richProbes = pass1.filter(p => p.stats.total > CHAR_THRESHOLD);
console.log(`\n=== Pass 2: char intercept for ${richProbes.length} rich probes (>${CHAR_THRESHOLD}px) ===\n`);

for (const entry of richProbes) {
  const { probe } = entry;
  process.stdout.write(`  ${probe.name} (char intercept)... `);
  resetState();

  const invocations = [];

  const r2 = ex.runFrom(probe.addr, 'adl', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === SINGLE_CHAR) {
        invocations.push({ charCode: cpu.a, col: cpu._de & 0xFFFF });
      }
    },
  });

  // Sort by column position and build text string
  const decoded = invocations
    .sort((a, b) => a.col - b.col)
    .map(inv => charName(inv.charCode))
    .join('');

  console.log(`${invocations.length} chars → "${decoded.slice(0, 80)}${decoded.length > 80 ? '...' : ''}"`);

  entry.invocations = invocations;
  entry.decodedText = decoded;
}

// Fill in empty decoded text for non-rich probes
for (const entry of pass1) {
  if (!entry.decodedText) {
    entry.invocations = [];
    entry.decodedText = '';
  }
}

// ── build report ──────────────────────────────────────────────────────────────

console.log('\n=== Writing report ===');

// Sort pass1 by pixel total descending for top-3 ASCII art
const byPixels = [...pass1].sort((a, b) => b.stats.total - a.stats.total);
const top3 = byPixels.slice(0, 3).filter(e => e.stats.total > 0);

const out = [];
const log = s => out.push(s);

log('# Phase 82 — 0x09cxxx Y= Editor Entry Point Probe');
log('');
log('Probed all 19 external callers of the 0x05e4xx text-rendering family that');
log('reside in the 0x09c000-0x09cfff ROM page, looking for the top-level Y= editor');
log('screen render function (should render the full Y1=, Y2=, … equation list).');
log('');
log('## Setup');
log('');
log('- ROM booted, OS init, SetTextFgColor(black) — shared state snapshot');
log('- Each probe: reset RAM + CPU + VRAM (sentinel 0xAAAA), then `runFrom(entry, adl, {maxSteps: 30000})`');
log('- Pass 2: for probes with >5000 pixels, re-run with `onBlock` hook at 0x0A1799 to capture char codes');
log('');
log('## Results Table');
log('');
log('| addr | total px | fg px | bg px | bbox | chars decoded | steps | termination |');
log('|------|----------|-------|-------|------|---------------|-------|-------------|');

for (const entry of pass1) {
  const { probe, result, stats: s, decodedText } = entry;
  const bboxStr = s.bbox
    ? `r${s.bbox.minR}-${s.bbox.maxR} c${s.bbox.minC}-${s.bbox.maxC}`
    : 'none';
  const textPreview = decodedText.length > 0
    ? `\`${decodedText.slice(0, 40)}${decodedText.length > 40 ? '...' : ''}\``
    : '—';
  const marker = probe.addr === 0x09cb14 ? ' *' : '';
  log(`| \`${probe.name}\`${marker} | ${s.total} | ${s.fg} | ${s.bg} | ${bboxStr} | ${textPreview} | ${result.steps} | ${result.termination} |`);
}
log('');
log('\\* `09cb14` = known Y= attribute status bar (Phase 78/81)');
log('');

// ── identification ────────────────────────────────────────────────────────────

log('## Identification');
log('');
const maxEntry = byPixels[0];
if (maxEntry && maxEntry.stats.total > 10000) {
  log(`The highest-pixel probe is **\`${maxEntry.probe.name}\`** (${hex(maxEntry.probe.addr)}) with **${maxEntry.stats.total} pixels**.`);
  log('');
  if (maxEntry.stats.bbox) {
    const b = maxEntry.stats.bbox;
    const heightRows = b.maxR - b.minR + 1;
    const widthCols  = b.maxC - b.minC + 1;
    log(`BBox spans ${heightRows} rows × ${widthCols} cols — ${heightRows > 150 ? 'large (likely full screen)' : 'partial screen area'}.`);
    log('');
  }
  if (maxEntry.decodedText && maxEntry.decodedText.length > 0) {
    log(`Decoded chars: \`${maxEntry.decodedText}\``);
    log('');
  }
} else if (maxEntry) {
  log(`Highest-pixel probe is **\`${maxEntry.probe.name}\`** with only ${maxEntry.stats.total} pixels.`);
  log('No probe rendered a full-screen Y= editor — the entry point may be in a different region,');
  log('or may require additional RAM initialization (e.g., equation data, mode flags) to produce output.');
  log('');
} else {
  log('No probe rendered any visible pixels. All probes halted or failed immediately.');
  log('');
}

// List probes that look like full-screen renders (>10000px)
const fullScreen = byPixels.filter(e => e.stats.total > 10000);
if (fullScreen.length > 0) {
  log('### Full-screen candidate(s) (>10000 px)');
  log('');
  for (const entry of fullScreen) {
    const { probe, stats: s } = entry;
    log(`- **\`${probe.name}\`** (${hex(probe.addr)}): ${s.total} px`);
    if (entry.decodedText) log(`  - Decoded: \`${entry.decodedText.slice(0, 120)}\``);
  }
  log('');
}

// List probes that look like partial renders (1000-10000px)
const partial = byPixels.filter(e => e.stats.total >= 1000 && e.stats.total <= 10000);
if (partial.length > 0) {
  log('### Partial-screen renders (1000–10000 px)');
  log('');
  for (const entry of partial) {
    const { probe, stats: s } = entry;
    log(`- **\`${probe.name}\`** (${hex(probe.addr)}): ${s.total} px`);
    if (entry.decodedText) log(`  - Decoded: \`${entry.decodedText.slice(0, 120)}\``);
  }
  log('');
}

// List near-zero probes
const empty = byPixels.filter(e => e.stats.total < 100);
if (empty.length > 0) {
  log('### Near-zero probes (<100 px — likely subroutines, not top-level renders)');
  log('');
  log(empty.map(e => `\`${e.probe.name}\``).join(', '));
  log('');
}

// ── decoded text detail ───────────────────────────────────────────────────────

if (richProbes.length > 0) {
  log('## Decoded Text Detail (probes with >5000 px)');
  log('');
  for (const entry of richProbes) {
    const { probe, stats: s, invocations, decodedText } = entry;
    log(`### ${probe.name} (${hex(probe.addr)}) — ${s.total} total px`);
    log('');
    if (!decodedText || decodedText.length === 0) {
      log('No chars captured via 0x0A1799.');
      log('');
      continue;
    }
    log(`Full decoded text (${invocations.length} invocations):`);
    log('');
    log('```');
    log(decodedText);
    log('```');
    log('');
    // Character table
    log('| col (DE) | code | char |');
    log('|----------|------|------|');
    for (const inv of invocations.sort((a, b) => a.col - b.col)) {
      log(`| ${inv.col} | ${hexB(inv.charCode)} | \`${charName(inv.charCode)}\` |`);
    }
    log('');
  }
}

// ── ASCII art for top 3 ────────────────────────────────────────────────────────

log('## ASCII Art — Top 3 by Pixel Count');
log('');
log('(# = dark/fg pixel, . = white/bg pixel, space = unwritten sentinel)');
log('Clipped to 80 chars wide, 50 rows tall from top-left of bounding box.');
log('');

for (const entry of top3) {
  const { probe, stats: s } = entry;
  const b = s.bbox;
  const bboxStr = b ? `r${b.minR}-${b.maxR} c${b.minC}-${b.maxC}` : 'none';

  log(`### ${probe.name} (${hex(probe.addr)}) — ${s.total} px, bbox ${bboxStr}`);
  log('');
  log('```');
  if (entry.vramSnap) {
    // Render from saved snapshot
    const snapMem = new Uint8Array(0x1000000);
    snapMem.set(entry.vramSnap, VRAM_BASE);
    log(renderAscii(snapMem, b));
  } else {
    log('(no snapshot)');
  }
  log('```');
  log('');
}

// ── methodology notes ─────────────────────────────────────────────────────────

log('## Methodology Notes');
log('');
log('- `0x0A1799` intercept captures `cpu.a` (A register) at block entry as char code,');
log('  and `cpu._de & 0xFFFF` as approximate column position.');
log('- Some chars may be captured out of order if the renderer draws non-sequentially;');
log('  results are sorted by DE value.');
log('- VRAM sentinel `0xAAAA` distinguishes unwritten pixels from written zeros.');
log('- Probes that halt immediately (0 steps) have no block at that address in PRELIFTED_BLOCKS.');
log('- maxSteps=30000 may be too low for a full-screen render; if the top candidate');
log('  terminates at exactly 30000, re-run with higher maxSteps.');
log('');
log('## Next Steps');
log('');
log('If no probe rendered a full Y= screen (>50000 px / full 320×240 fill):');
log('');
log('1. Check whether the highest-pixel probe needs equation data in RAM');
log('   (Y1 string buffer at a known OS address) before rendering equations.');
log('2. Try calling from a higher-level address (the function that CALLS this page\'s renderers).');
log('3. Increase maxSteps to 100000 or 300000 for the top candidate.');
log('4. Look for a jump table in 0x09cxxx that dispatches to sub-renderers.');

const reportPath = path.join(__dirname, 'phase82-09cxxx-report.md');
fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote report to ${reportPath}`);
console.log('\nDone. Top 5 by pixel count:');
for (const entry of byPixels.slice(0, 5)) {
  const { probe, stats: s, decodedText } = entry;
  const preview = decodedText ? ` | "${decodedText.slice(0,60)}"` : '';
  console.log(`  ${probe.name}: ${s.total} px${preview}`);
}
