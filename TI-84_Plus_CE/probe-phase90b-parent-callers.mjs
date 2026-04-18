#!/usr/bin/env node
// Phase 90b: Probe the 8 callers of 0x088471 (fn containing CALL 0x0a29ec).
// Goal: find which produces the most VRAM pixels — the home screen orchestrator.
// Also probe the 5 estimated fn-starts to get broader context.
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

// ── Boot to snapshot ─────────────────────────────────────────────────────────
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

const vramClear = new Uint8Array(320 * 240 * 2);
for (let i = 0; i < 320 * 240; i++) { vramClear[i*2] = 0xAA; vramClear[i*2+1] = 0xAA; }

// ── Probe ────────────────────────────────────────────────────────────────────
function probe(entryAddr, label, overrides = {}) {
  mem.set(ramSnap, 0x400000);
  mem.set(vramClear, VRAM_BASE);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;

  const hits29ec = [], hits2b72 = [];
  const r = executor.runFrom(entryAddr, 'adl', {
    maxSteps: 80000,
    maxLoopIterations: 1000,
    onBlock: (pc) => {
      if (pc === 0x0a29ec) hits29ec.push(1);
      if (pc === 0x0a2b72) hits2b72.push(1);
    }
  });

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
  const called = (hits29ec.length > 0 ? '✓29ec' : '') + (hits2b72.length > 0 ? '✓2b72' : '');
  console.log(`${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox} steps=${r.steps} term=${r.termination} called=[${called}]`);
  return { label, drawn, fg, bg, bbox, steps: r.steps, termination: r.termination, hit29ec: hits29ec.length, hit2b72: hits2b72.length };
}

const results = [];

// ── Callers of 0x088471 (fn containing CALL 0x0a29ec) ───────────────────────
console.log('\n=== 8 callers of 0x088471 ===');
for (const [addr, name] of [
  [0x07907a, 'caller_7907a'],
  [0x086132, 'caller_86132'],
  [0x086170, 'caller_86170'],
  [0x086198, 'caller_86198'],
  [0x0861d4, 'caller_861d4'],
  [0x086324, 'caller_86324'],
  [0x08633a, 'caller_8633a'],
  [0x0863fd, 'caller_863fd'],
]) {
  results.push(probe(addr, name));
}

// ── Approx fn-starts of the 5 CALL sites (to catch pre-call setup) ──────────
console.log('\n=== Approx fn-starts of 5 CALL sites ===');
for (const [addr, name] of [
  [0x025afe, 'fn_25afe'],
  [0x0609be, 'fn_609be'],
  [0x06c861, 'fn_6c861'],
  [0x078f42, 'fn_78f42'],
  [0x088471, 'fn_88471'],
]) {
  results.push(probe(addr, name));
}

// ── Write report ─────────────────────────────────────────────────────────────
const lines = ['# Phase 90b — Parent Caller Probe\n'];
lines.push('Goal: find which caller of fn-containing-CALL-0x0a29ec draws the full home screen.\n\n');
lines.push('## Summary\n');
lines.push('| probe | drawn | fg | bg | bbox | called | steps | term |');
lines.push('|-------|------:|---:|---:|------|--------|------:|------|');
for (const r of results) {
  lines.push(`| ${r.label} | ${r.drawn} | ${r.fg} | ${r.bg} | ${r.bbox} | ${r.hit29ec?'✓29ec':''} ${r.hit2b72?'✓2b72':''} | ${r.steps} | ${r.termination} |`);
}

const reportPath = path.join(__dirname, 'phase90b-parent-callers-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
