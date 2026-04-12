#!/usr/bin/env node
// Improved OS function survey (Phase 29 rewrite).
//
// Improvements over v1:
//   1. Build executor ONCE + snapshot post-OS-init state; restore per call
//      via mem.set() instead of rebuilding the executor (10x+ faster)
//   2. maxSteps = 1000 (most useful functions complete in <200 steps)
//   3. Variant matrix per target (10 variants for each function, not 1-per-pass)
//   4. cpu.mbase = 0xD0 pre-set in the snapshot (Phase 29 fix) so .SIS/.LIS
//      short-addressed reads resolve to RAM, not ROM
//   5. Expanded target list: 980 jump table + 32 VRAM-loading sites from
//      static grep of "LD {HL,DE,BC,IX,IY}, 0xd40000"
//
// Output: TI-84_Plus_CE/os-survey-v2.json — a single summary JSON with
// per-target stats (best variant by VRAM writes, per-variant spread, etc).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const outputPath = path.join(__dirname, 'os-survey-v2.json');

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ============================================================================
// Stage 1: Build executor + run boot + run OS init + snapshot state
// ============================================================================
log('building executor');
const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

log('boot');
ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

log('OS init 0x08C331');
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

// Phase 29: set MBASE so .SIS/.LIS addresses resolve to RAM not ROM
cpu.mbase = 0xD0;

log(`post-init state: mbase=${hex(cpu.mbase, 2)}, initFlag=${hex(mem[0xD177BA], 2)}`);

// Snapshot state — we'll restore from here for each call.
// Performance: only snapshot + restore the RAM region (0xD00000-0xE00000 = 1MB)
// because ROM is write-protected and MMIO goes through ioWrite/LCD intercepts.
// This is 16x faster than a full 16MB memcpy per restore.
const RAM_BASE = 0xD00000;
const RAM_END = 0xE00000;
const RAM_SIZE = RAM_END - RAM_BASE;
const snapRam = new Uint8Array(mem.slice(RAM_BASE, RAM_END));
const snapRegs = {
  a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
  sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2,
  im: cpu.im, madl: cpu.madl, mbase: cpu.mbase,
};

function restoreSnapshot() {
  mem.set(snapRam, RAM_BASE);
  cpu.a = snapRegs.a;
  cpu.f = snapRegs.f;
  cpu.bc = snapRegs.bc;
  cpu.de = snapRegs.de;
  cpu.hl = snapRegs.hl;
  cpu.sp = snapRegs.sp;
  cpu._ix = snapRegs.ix;
  cpu._iy = snapRegs.iy;
  cpu.i = snapRegs.i;
  cpu.r = snapRegs.r;
  cpu.iff1 = snapRegs.iff1;
  cpu.iff2 = snapRegs.iff2;
  cpu.im = snapRegs.im;
  cpu.madl = snapRegs.madl;
  cpu.mbase = snapRegs.mbase;
  cpu.halted = false;
}

// ============================================================================
// Stage 2: Build target list
// ============================================================================

// Jump table entries
const JUMP_TABLE_BASE = 0x020104;
const JUMP_TABLE_ENTRIES = 980;
const targets = [];
for (let i = 0; i < JUMP_TABLE_ENTRIES; i++) {
  const slotAddr = JUMP_TABLE_BASE + i * 4;
  if (romBytes[slotAddr] !== 0xC3) continue;
  const target = romBytes[slotAddr + 1] | (romBytes[slotAddr + 2] << 8) | (romBytes[slotAddr + 3] << 16);
  targets.push({ label: `jump-table[${i}]`, addr: target, source: 'jump-table' });
}

// Static VRAM-loading sites (from grep for LD {HL,DE,BC,IX,IY}, 0xd40000)
const vramLoadSites = [
  0x005acc, 0x005b96, 0x00b14f, 0x00b224, 0x04355f, 0x045d26, 0x045d4e, 0x045d5c,
  0x04cb94, 0x04cb95, 0x04d0f2, 0x055202, 0x055203, 0x055241, 0x05528a, 0x0552a7,
  0x07b59e, 0x091575, 0x09173e, 0x09efb8, 0x09f031, 0x09f09d, 0x09f139, 0x09f228,
  0x09f3af, 0x09f48a, 0x09f77c, 0x0a1ab4, 0x0a2e4e, 0x0a3166, 0x0a31ad, 0x0a35b0,
];
for (const addr of vramLoadSites) {
  targets.push({ label: `vram-load@${hex(addr)}`, addr, source: 'vram-load-site' });
}

// Known good internals from earlier phases
const knownInternals = [
  { addr: 0x0159C0, label: 'keyboard-scan' },
  { addr: 0x03CF7D, label: '_GetCSC' },
  { addr: 0x0059c6, label: '_PutC-ish' },
  { addr: 0x005a75, label: 'print-inner' },
];
for (const { addr, label } of knownInternals) {
  targets.push({ label, addr, source: 'known-internal' });
}

log(`targets: ${targets.length} (${targets.filter(t => t.source === 'jump-table').length} jump-table + ${targets.filter(t => t.source === 'vram-load-site').length} vram-load + ${targets.filter(t => t.source === 'known-internal').length} known)`);

// ============================================================================
// Stage 3: Variant matrix — 10 register combinations per target
// ============================================================================
const variants = [
  { name: 'zero',     a: 0x00, bc: 0x000000, de: 0x000000, hl: 0x000000 },
  { name: 'H',        a: 0x48, bc: 0x000000, de: 0x000000, hl: 0x000000 },
  { name: 'space',    a: 0x20, bc: 0x000000, de: 0x000000, hl: 0x000000 },
  { name: 'digit0',   a: 0x30, bc: 0x000000, de: 0x000000, hl: 0x000000 },
  { name: 'pointer',  a: 0x00, bc: 0xd00100, de: 0xd00200, hl: 0xd00300 },
  { name: 'vram',     a: 0x00, bc: 0xd40000, de: 0x000000, hl: 0xd40000 },
  { name: 'high',     a: 0xff, bc: 0xffffff, de: 0xffffff, hl: 0xffffff },
  { name: 'small',    a: 0x01, bc: 0x000001, de: 0x000001, hl: 0x000001 },
  { name: 'text',     a: 0x41, bc: 0x000000, de: 0x000000, hl: 0xd00590 },
  { name: 'row1col1', a: 0x00, bc: 0x000001, de: 0x000001, hl: 0x000000 },
];

// Pre-allocate to avoid per-call allocations during the hot loop
const regionScratch = new Uint8Array(256);

function runOne(target, variant) {
  restoreSnapshot();
  cpu.a = variant.a;
  cpu.bc = variant.bc;
  cpu.de = variant.de;
  cpu.hl = variant.hl;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  // Count VRAM writes by diffing snapshot RAM after run instead of wrapping
  // cpu.write8 — wrapping per-call was triggering GC pressure / closure leaks.
  let blocks = 0;
  regionScratch.fill(0);
  let r;
  try {
    r = ex.runFrom(target, 'adl', {
      maxSteps: 300,
      maxLoopIterations: 100,
      onBlock: (pc) => { blocks++; regionScratch[(pc >> 16) & 0xFF] = 1; },
    });
  } catch (err) {
    return { error: String(err).slice(0, 100) };
  }

  // VRAM-write count: compare current VRAM to snapshot
  let vramWrites = 0;
  const vramOffsetInRam = 0xD40000 - RAM_BASE;
  const vramSize = 320 * 240 * 2;
  for (let i = 0; i < vramSize; i++) {
    if (mem[0xD40000 + i] !== snapRam[vramOffsetInRam + i]) vramWrites++;
  }

  let regionCount = 0;
  for (let i = 0; i < 256; i++) if (regionScratch[i]) regionCount++;

  return {
    steps: r.steps,
    termination: r.termination,
    blocks,
    regionCount,
    vramWrites,
  };
}

// ============================================================================
// Stage 4: Run the survey
// ============================================================================
log('running survey');
const start = Date.now();
const results = [];
let processed = 0;

const SLOW_THRESHOLD_MS = 150;
let slowTargets = 0;

for (const target of targets) {
  const perVariant = {};
  let maxVramWrites = 0;
  let maxBlocks = 0;
  let cleanReturns = 0;
  let anyError = false;
  let isSlow = false;
  const terminations = new Set();

  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi];
    const callStart = Date.now();
    const r = runOne(target.addr, variant);
    const callMs = Date.now() - callStart;

    perVariant[variant.name] = r;
    if (r.error) { anyError = true; continue; }
    if (r.vramWrites > maxVramWrites) maxVramWrites = r.vramWrites;
    if (r.blocks > maxBlocks) maxBlocks = r.blocks;
    terminations.add(r.termination);
    if (r.termination === 'missing_block') cleanReturns++;

    // Skip remaining variants if first call was slow — saves overall time
    // when a function gets stuck in long block I/O loops or similar.
    if (vi === 0 && callMs >= SLOW_THRESHOLD_MS) {
      isSlow = true;
      slowTargets++;
      break;
    }
  }

  results.push({
    addr: hex(target.addr),
    label: target.label,
    source: target.source,
    maxVramWrites,
    maxBlocks,
    cleanReturns,
    terminationVariety: [...terminations],
    anyError,
    isSlow,
  });

  processed++;
  if (processed % 25 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const pct = ((processed / targets.length) * 100).toFixed(1);
    process.stderr.write(`[${new Date().toISOString()}] ${processed}/${targets.length} (${pct}%) in ${elapsed}s @ ${target.label}\n`);
  }
}

const total = ((Date.now() - start) / 1000).toFixed(1);
log(`survey done: ${targets.length} targets in ${total}s, ${slowTargets} slow targets skipped`);

// ============================================================================
// Stage 5: Analyze + write output
// ============================================================================
const vramWriters = results.filter(r => r.maxVramWrites > 0).sort((a, b) => b.maxVramWrites - a.maxVramWrites);
const deepExecutors = results.filter(r => r.maxBlocks >= 50).sort((a, b) => b.maxBlocks - a.maxBlocks);
const byJumpTable = results.filter(r => r.source === 'jump-table');
const byVramLoad = results.filter(r => r.source === 'vram-load-site');

const output = {
  generatedAt: new Date().toISOString(),
  elapsedSec: Number(total),
  summary: {
    totalTargets: results.length,
    vramWriters: vramWriters.length,
    deepExecutors: deepExecutors.length,
    jumpTableVramWriters: byJumpTable.filter(r => r.maxVramWrites > 0).length,
    vramLoadSiteVramWriters: byVramLoad.filter(r => r.maxVramWrites > 0).length,
  },
  topVramWriters: vramWriters.slice(0, 50),
  topDeepExecutors: deepExecutors.slice(0, 50),
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
log(`wrote ${outputPath}`);

console.log(`\nSummary:`);
console.log(`  Total targets: ${results.length}`);
console.log(`  VRAM writers: ${vramWriters.length} (${((vramWriters.length / results.length) * 100).toFixed(1)}%)`);
console.log(`  Deep executors (>50 blocks): ${deepExecutors.length}`);
console.log(`\nTop 20 VRAM writers:`);
for (const w of vramWriters.slice(0, 20)) {
  console.log(`  ${w.addr.padEnd(10)} ${w.source.padEnd(18)} maxWr=${String(w.maxVramWrites).padStart(7)} maxBk=${String(w.maxBlocks).padStart(4)}  ${w.label}`);
}
console.log(`\nTop 10 deep executors:`);
for (const d of deepExecutors.slice(0, 10)) {
  console.log(`  ${d.addr.padEnd(10)} ${d.source.padEnd(18)} maxBk=${String(d.maxBlocks).padStart(4)} maxWr=${String(d.maxVramWrites).padStart(7)}  ${d.label}`);
}
