#!/usr/bin/env node
// Phase 93: Batch-probe JT slots 455-495 in the 0x0Axxxx home-screen cluster.
// 0x0a29ec (slot 470) = home row renderer — known.
// 0x0a2b72 (slot 479) = status bar background — known.
// Probe all neighbors to find: r0-16 status bar text, cursor, other home screen components.
// Also: seed mode buffer (0xD020A6 = "Normal Float Radian       ") before each probe
//       to see if any slot renders mode text in r0-16.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const VRAM_BASE = 0xD40000;
const VRAM_SENTINEL = 0xAAAA;
const HOME_SCREEN_MODE_BUF = 0xD020A6;
const HOME_SCREEN_MODE_TEXT = 'Normal Float Radian       '; // 26 chars
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

// ── Boot snapshot ─────────────────────────────────────────────────────────────
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const cpuSnap = Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
console.log('Snapshot ready.');

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearVram() {
  for (let i = 0; i < 320 * 240 * 2; i += 2) {
    mem[VRAM_BASE + i] = 0xAA;
    mem[VRAM_BASE + i + 1] = 0xAA;
  }
}

function resetCpu() {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function seedModeBuffer() {
  for (let i = 0; i < HOME_SCREEN_MODE_TEXT.length && i < 26; i++) {
    mem[HOME_SCREEN_MODE_BUF + i] = HOME_SCREEN_MODE_TEXT.charCodeAt(i);
  }
}

function probeEntry(addr, label) {
  mem.set(ramSnap, 0x400000);
  clearVram();
  seedModeBuffer();
  resetCpu();
  const r = executor.runFrom(addr, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

  let drawn = 0, fg = 0, bg = 0;
  let rMin = 240, rMax = -1, cMin = 320, cMax = -1;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i * 2] | (mem[VRAM_BASE + i * 2 + 1] << 8);
    if (px !== VRAM_SENTINEL) {
      const row = Math.floor(i / 320), col = i % 320;
      drawn++;
      if (px === 0xFFFF) bg++; else fg++;
      if (row < rMin) rMin = row; if (row > rMax) rMax = row;
      if (col < cMin) cMin = col; if (col > cMax) cMax = col;
    }
  }
  const bbox = rMax < 0 ? 'none' : `r${rMin}-${rMax}`;
  const term = r.termination;
  console.log(`  ${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox} term=${term}`);
  return { drawn, fg, bg, bbox, rMin, rMax };
}

// Also probe: composite with 0x0a2b72 first (pre-render bg), then probe each slot
function probeWithBg(addr, label) {
  mem.set(ramSnap, 0x400000);
  clearVram();
  seedModeBuffer();

  // First: run 0x0a2b72 (status bar background)
  resetCpu();
  executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

  // Then: seed mode buffer again (0x0a2b72 might have consumed it)
  seedModeBuffer();

  // Then: run target function
  resetCpu();
  const r = executor.runFrom(addr, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

  let drawn = 0, fg = 0, bg = 0, rMinFg = 240, rMaxFg = -1;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i * 2] | (mem[VRAM_BASE + i * 2 + 1] << 8);
    if (px !== VRAM_SENTINEL) {
      const row = Math.floor(i / 320);
      drawn++;
      if (px === 0xFFFF) bg++;
      else {
        fg++;
        if (row < rMinFg) rMinFg = row;
        if (row > rMaxFg) rMaxFg = row;
      }
    }
  }
  const fgBbox = rMaxFg < 0 ? 'none' : `r${rMinFg}-${rMaxFg}`;
  console.log(`  +bg ${label}: drawn=${drawn} fg=${fg} fgBbox=${fgBbox}`);
  return { drawn, fg, bg, fgBbox, rMinFg, rMaxFg };
}

// ── JT targets for slots 455-495 ──────────────────────────────────────────────
const JT_BASE = 0x020104;
const STRIDE = 4;
const slots = [];
for (let slot = 455; slot <= 495; slot++) {
  const jtAddr = JT_BASE + slot * STRIDE;
  const lo = romBytes[jtAddr + 1];
  const mid = romBytes[jtAddr + 2];
  const hi = romBytes[jtAddr + 3];
  const target = lo | (mid << 8) | (hi << 16);
  slots.push({ slot, target });
}

// ── Batch probe — standalone ──────────────────────────────────────────────────
console.log('\n=== Batch probe: JT slots 455-495 (standalone, mode buf seeded) ===');
const results = [];
for (const { slot, target } of slots) {
  const note = slot === 470 ? '[home row]' : slot === 479 ? '[status bg]' : slot === 458 ? '[cursor]' : '';
  const label = `slot${slot}/0x${target.toString(16)} ${note}`;
  const r = probeEntry(target, label);
  results.push({ slot, target, ...r });
}

// ── Identify interesting slots ─────────────────────────────────────────────────
console.log('\n=== Interesting finds ===');
const interesting = results.filter(r =>
  r.drawn > 100 &&           // non-trivial output
  r.rMin < 17 &&             // draws in r0-16 (status bar top area)
  r.slot !== 470 && r.slot !== 479  // skip known slots
);
console.log(`  Slots drawing in r0-16: ${interesting.length}`);
for (const r of interesting) {
  console.log(`  slot ${r.slot} → 0x${r.target.toString(16)}: drawn=${r.drawn} fg=${r.fg} bbox=${r.bbox}`);
}

const interesting2 = results.filter(r =>
  r.fg > 200 &&
  r.slot !== 470 && r.slot !== 479 && r.slot !== 458
);
console.log(`  Slots with fg>200 (non-trivial fg pixels): ${interesting2.length}`);
for (const r of interesting2) {
  console.log(`  slot ${r.slot} → 0x${r.target.toString(16)}: drawn=${r.drawn} fg=${r.fg} bg=${r.bg} bbox=${r.bbox}`);
}

// ── Deeper probe: composite render including best candidates ──────────────────
const TOP_CANDIDATES = interesting.concat(interesting2).map(r => r.slot);
const uniqueCandidates = [...new Set(TOP_CANDIDATES)].filter(s => s !== 470 && s !== 479);

if (uniqueCandidates.length > 0) {
  console.log('\n=== Composite probe: 0x0a2b72 bg + candidate slot ===');
  for (const slot of uniqueCandidates.slice(0, 8)) {
    const { target } = slots.find(s => s.slot === slot);
    probeWithBg(target, `slot${slot}/0x${target.toString(16)}`);
  }
}

// ── ASCII preview of best r0-16 candidate ─────────────────────────────────────
const best = interesting[0];
if (best) {
  console.log(`\n=== ASCII preview: slot ${best.slot} → 0x${best.target.toString(16)} ===`);
  mem.set(ramSnap, 0x400000); clearVram(); seedModeBuffer(); resetCpu();
  executor.runFrom(best.target, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
  for (let r = 0; r <= Math.min(best.rMax + 5, 40); r++) {
    let row = `r${String(r).padStart(3,'0')}: `;
    for (let c = 0; c < 320; c++) {
      const px = mem[VRAM_BASE + (r * 320 + c) * 2] | (mem[VRAM_BASE + (r * 320 + c) * 2 + 1] << 8);
      row += px === VRAM_SENTINEL ? '.' : px === 0xFFFF ? ' ' : px === 0x0000 ? '#' : '+';
    }
    console.log(row);
  }
}

// ── Full results table ────────────────────────────────────────────────────────
const report = [
  '# Phase 93 — JT Cluster Probe (slots 455-495)\n\n',
  '| slot | target | drawn | fg | bg | rMin | rMax | bbox |\n',
  '|------|--------|-------|----|----|------|------|------|\n',
];
for (const r of results) {
  report.push(`| ${r.slot} | 0x${r.target.toString(16)} | ${r.drawn} | ${r.fg} | ${r.bg} | ${r.rMin === 240 ? '-' : r.rMin} | ${r.rMax === -1 ? '-' : r.rMax} | ${r.bbox} |\n`);
}
report.push('\n## Interesting (r0-16 + fg>0)\n');
for (const r of interesting) {
  report.push(`- slot ${r.slot} → 0x${r.target.toString(16)}: fg=${r.fg} bbox=${r.bbox}\n`);
}

fs.writeFileSync(path.join(__dirname, 'phase93-jt-cluster-report.md'), report.join(''));
console.log('\nReport written.');
