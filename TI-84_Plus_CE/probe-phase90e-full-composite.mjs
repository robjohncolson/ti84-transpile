#!/usr/bin/env node
// Phase 90e: Full home screen composite render.
// Combine: 0x0a2b72 (r0-34 bg) + 0x0a29ec (r17-34 content) + caller_86132 (r37-114 history).
// Run caller_86132 with more steps (200k) to see if it covers r115-239 too.
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

function clearVramOnly() {
  for (let i = 0; i < 320 * 240; i++) {
    mem[VRAM_BASE + i*2] = 0xAA;
    mem[VRAM_BASE + i*2+1] = 0xAA;
  }
}

function resetCpu(overrides = {}) {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;
}

function countVram(label) {
  let drawn = 0, fg = 0, bg = 0;
  let rMin = 240, rMax = -1, cMin = 320, cMax = -1;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i*2] | (mem[VRAM_BASE + i*2+1] << 8);
    if (px !== VRAM_SENTINEL) {
      const row = Math.floor(i / 320), col = i % 320;
      drawn++; if (px === 0xFFFF) bg++; else fg++;
      if (row < rMin) rMin = row; if (row > rMax) rMax = row;
      if (col < cMin) cMin = col; if (col > cMax) cMax = col;
    }
  }
  const bbox = rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}`;
  if (label) console.log(`  ${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox}`);
  return { drawn, fg, bg, bbox };
}

function runStep(addr, label, maxSteps = 30000, overrides = {}) {
  resetCpu(overrides);
  const r = executor.runFrom(addr, 'adl', {
    maxSteps, maxLoopIterations: Math.max(500, maxSteps / 100),
  });
  console.log(`  ${label}: steps=${r.steps} term=${r.termination}`);
  return r;
}

function asciiPreview(rowStart, rowEnd, step = 2) {
  const lines = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    let row = `r${String(r).padStart(3,'0')}: `;
    for (let c = 0; c < 320; c += step) {
      const px = mem[VRAM_BASE + (r * 320 + c) * 2] | (mem[VRAM_BASE + (r * 320 + c) * 2 + 1] << 8);
      if (px === VRAM_SENTINEL) row += '.';
      else if (px === 0xFFFF) row += ' ';
      else if (px === 0x0000) row += '#';
      else row += '+';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

function saveVram(filename) {
  fs.writeFileSync(path.join(__dirname, filename),
    mem.slice(VRAM_BASE, VRAM_BASE + 320 * 240 * 2));
}

// ── Scenario 1: history caller alone with 200k steps ─────────────────────────
console.log('\n=== Scenario 1: caller_86132 alone (200k steps) ===');
mem.set(ramSnap, 0x400000); clearVramOnly();
runStep(0x086132, 'caller_86132 200k', 200000);
countVram('Result');
saveVram('phase90e_S1_86132_200k.raw');

// ── Scenario 2: composite — 0x0a2b72 + 0x0a29ec + caller_86132 ───────────────
console.log('\n=== Scenario 2: Full composite (no RAM/VRAM reset between) ===');
mem.set(ramSnap, 0x400000); clearVramOnly();

console.log('  Stage 1: 0x0a2b72 (status bar bg, r0-34)');
runStep(0x0a2b72, '0x0a2b72', 30000);
countVram('After 0x0a2b72');

console.log('  Stage 2: 0x0a29ec (home row content, r17-34)');
runStep(0x0a29ec, '0x0a29ec', 30000);
countVram('After 0x0a29ec');

console.log('  Stage 3: caller_86132 (history area, r37-114, 200k steps)');
runStep(0x086132, 'caller_86132', 200000);
const vComposite = countVram('After caller_86132 (COMPOSITE)');
saveVram('phase90e_S2_composite.raw');

// ── Scenario 3: composite with ALL 8 history callers, first one found ─────────
// (They all draw same content, just use first)
// Instead try different callers to see if any goes beyond r114
console.log('\n=== Scenario 3: Try each of the 8 callers for extended coverage ===');
for (const [addr, name] of [
  [0x07907a, '7907a'],
  [0x086132, '86132'],
  [0x086170, '86170'],
  [0x086198, '86198'],
  [0x0861d4, '861d4'],
  [0x086324, '86324'],
  [0x08633a, '8633a'],
  [0x0863fd, '863fd'],
]) {
  mem.set(ramSnap, 0x400000); clearVramOnly();
  runStep(addr, name, 200000);
  countVram(`  [${name}]`);
}

// ── ASCII preview of composite ─────────────────────────────────────────────────
// Rebuild composite for preview
console.log('\n=== Rebuilding composite for ASCII preview ===');
mem.set(ramSnap, 0x400000); clearVramOnly();
resetCpu(); executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
resetCpu(); executor.runFrom(0x0a29ec, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
resetCpu(); executor.runFrom(0x086132, 'adl', { maxSteps: 200000, maxLoopIterations: 2000 });
countVram('Composite (preview state)');

const previewFull = asciiPreview(0, 239, 2);
const previewTop = asciiPreview(0, 50, 1);  // Dense preview of top 50 rows

// ── Report ────────────────────────────────────────────────────────────────────
const lines = ['# Phase 90e — Full Home Screen Composite\n\n'];
lines.push('## Composite: 0x0a2b72 + 0x0a29ec + caller_86132 (200k steps)\n\n');
lines.push(`Combined drawn=${vComposite.drawn} fg=${vComposite.fg} bg=${vComposite.bg} bbox=${vComposite.bbox}\n\n`);
lines.push('## ASCII Preview — Full Screen (step=2px/char, 160 wide)\n```\n');
lines.push(previewFull);
lines.push('\n```\n');
lines.push('## ASCII Preview — Top 50 rows (step=1px/char, 320 wide)\n```\n');
lines.push(previewTop);
lines.push('\n```\n');

fs.writeFileSync(path.join(__dirname, 'phase90e-composite-report.md'), lines.join('\n'));
console.log('\nReport written. VRAM saved.');
