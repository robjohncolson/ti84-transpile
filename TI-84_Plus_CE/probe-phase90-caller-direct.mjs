#!/usr/bin/env node
// Phase 90: Probe the 5 direct callers of 0x0a29ec (home row strip renderer) directly.
// Goal: find which caller produces 5652px VRAM output (the home screen event handler).
// Also probe 3 callers of 0x0a2b72 (status bar).
// Uses correct boot-snapshot harness (single shared executor+peripherals).
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
console.log(`Loaded ${Object.keys(BLOCKS).length} blocks`);

const VRAM_BASE = 0xD40000;
const VRAM_SENTINEL = 0xAAAA;
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

// ── Single shared executor boot ──────────────────────────────────────────────
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Booting z80...');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);

console.log('Running OS init (0x08C331)...');
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);

console.log('Running SetTextFgColor (0x0802b2)...');
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

// Save snapshot
const cpuSnap = Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
console.log(`Snapshot ready. SP=0x${cpu.sp.toString(16)}`);

// ── VRAM sentinel clear ───────────────────────────────────────────────────────
const vramClear = new Uint8Array(320 * 240 * 2);
for (let i = 0; i < 320 * 240; i++) { vramClear[i*2] = 0xAA; vramClear[i*2+1] = 0xAA; }

// ── Probe function ────────────────────────────────────────────────────────────
function probe(entryAddr, label, overrides = {}) {
  // Restore RAM, VRAM, CPU — reuse executor (peripheral LCD state preserved)
  mem.set(ramSnap, 0x400000);
  mem.set(vramClear, VRAM_BASE);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;

  const chars = [];
  const watchedBlocks = [];

  const r = executor.runFrom(entryAddr, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 1000,
    onBlock: (pc) => {
      watchedBlocks.push(pc);
      if (pc === 0x0a1799) {
        chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
      }
    }
  });

  // Count VRAM pixels
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
  const text = chars.map(c =>
    c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`
  ).join('');

  // Count distinct visited block addresses
  const distinctBlocks = new Set(watchedBlocks).size;

  console.log(`${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox} chars=${chars.length} text="${text.slice(0,50)}" steps=${r.steps} term=${r.termination} blocks=${distinctBlocks}`);

  return { label, drawn, fg, bg, bbox, chars, text, steps: r.steps, termination: r.termination, distinctBlocks };
}

// ── 5 direct callers of 0x0a29ec (home row strip renderer, 5652px r17-34) ───
const results = [];
console.log('\n=== Probing 5 callers of 0x0a29ec ===');
for (const [addr, name] of [
  [0x025b37, 'caller_25b37'],
  [0x060a39, 'caller_60a39'],
  [0x06c865, 'caller_6c865'],
  [0x078f6d, 'caller_78f6d'],
  [0x08847f, 'caller_8847f'],
]) {
  results.push(probe(addr, name));
}

// ── 3 direct callers of 0x0a2b72 (status bar, 5692px r0-34) ─────────────────
console.log('\n=== Probing 3 callers of 0x0a2b72 ===');
for (const [addr, name] of [
  [0x05e481, 'caller_5e481'],
  [0x05e7d2, 'caller_5e7d2'],
  [0x09cb14, 'caller_9cb14'],
]) {
  results.push(probe(addr, name));
}

// ── Also probe 0x0a29ec itself (baseline sanity) ─────────────────────────────
console.log('\n=== Baseline: 0x0a29ec direct ===');
results.push(probe(0x0a29ec, '0a29ec_direct'));
results.push(probe(0x0a2b72, '0a2b72_direct'));

// ── Write report ─────────────────────────────────────────────────────────────
const lines = ['# Phase 90 — Direct Caller Probe\n'];
lines.push('Goal: find which of the 5 callers of 0x0a29ec is the home screen event handler.\n\n');
lines.push('## Summary\n');
lines.push('| probe | drawn | fg | bg | bbox | chars | text | steps | term |');
lines.push('|-------|------:|---:|---:|------|------:|------|------:|------|');
for (const r of results) {
  lines.push(`| ${r.label} | ${r.drawn} | ${r.fg} | ${r.bg} | ${r.bbox} | ${r.chars.length} | \`${r.text.slice(0,40)}\` | ${r.steps} | ${r.termination} |`);
}

for (const r of results) {
  if (r.chars.length === 0) continue;
  lines.push(`\n## ${r.label} — ${r.drawn}px\n`);
  lines.push(`Decoded text: \`${r.text}\`\n`);
  lines.push('| col | code | char |');
  lines.push('|-----|------|------|');
  for (const c of r.chars) {
    const ch = c.code >= 0x20 && c.code < 0x7f ? `\`${String.fromCharCode(c.code)}\`` : `[${c.code.toString(16)}]`;
    lines.push(`| ${c.col} | 0x${c.code.toString(16)} | ${ch} |`);
  }
}

const reportPath = path.join(__dirname, 'phase90-caller-direct-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
