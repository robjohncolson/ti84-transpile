#!/usr/bin/env node
// Phase 87b: Decode 0x0a29ec text using CORRECT harness (same executor/peripherals reused)
// Phase 87 failed because fresh peripherals don't have post-boot LCD state
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

// Build shared executor (boot → OS init → SetTextFgColor)
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const cpuSnap = Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const vramClear = new Uint8Array(320 * 240 * 2);
for (let i = 0; i < 320 * 240; i++) { vramClear[i*2] = 0xAA; vramClear[i*2+1] = 0xAA; }
console.log('Ready. DE at snapshot:', cpu._de.toString(16));

function probe(entryAddr, label, overrides = {}) {
  mem.set(ramSnap, 0x400000);
  mem.set(vramClear, VRAM_BASE);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;

  const chars = [];
  const r = executor.runFrom(entryAddr, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
    }
  });

  let drawn = 0, fg = 0, bg = 0, rMin = 240, rMax = -1, cMin = 320, cMax = -1;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i*2] | (mem[VRAM_BASE + i*2 + 1] << 8);
    if (px !== VRAM_SENTINEL) {
      const row = Math.floor(i / 320), col = i % 320;
      drawn++; if (px === 0xFFFF) bg++; else fg++;
      if (row < rMin) rMin = row; if (row > rMax) rMax = row;
      if (col < cMin) cMin = col; if (col > cMax) cMax = col;
    }
  }
  const bbox = rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}`;
  const text = chars.map(c => c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`).join('');
  console.log(`${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox} chars=${chars.length} text="${text.slice(0,60)}" steps=${r.steps} term=${r.termination}`);
  return { label, drawn, fg, bg, bbox, chars, text, rMin, rMax, cMin, cMax, steps: r.steps, termination: r.termination };
}

const results = [];

// Probe 0x0a29ec — slot 627 (home row strip renderer, 5652px in r17-34)
results.push(probe(0x0a29ec, '0a29ec_noseed'));

// Probe 0x0a2b72 — slot 639 (home status bar fill, 5692px r0-34)
results.push(probe(0x0a2b72, '0a2b72_noseed'));

// Probe 0x0a2b72 with DE values (mode tokens)
for (const [name, de] of [['normal',0x4f],['float',0x52],['radian',0x4d],['degree',0x4e],['sci',0x50]]) {
  results.push(probe(0x0a2b72, `0a2b72_${name}`, { _de: de }));
}

// Write report
const lines = ['# Phase 87b — 0x0a29ec + 0x0a2b72 Text Decode (fixed harness)\n'];
lines.push('## Summary\n');
lines.push('| probe | drawn | fg | bg | bbox | text |');
lines.push('|-------|------:|---:|---:|------|------|');
for (const r of results) {
  lines.push(`| ${r.label} | ${r.drawn} | ${r.fg} | ${r.bg} | ${r.bbox} | \`${r.text.slice(0,50)}\` |`);
}

for (const r of results) {
  if (r.chars.length === 0) continue;
  lines.push(`\n## ${r.label} — ${r.drawn}px\n`);
  lines.push(`Decoded text: \`${r.text}\`\n`);
  lines.push('| col | code | char |');
  lines.push('|-----|------|------|');
  for (const c of r.chars) {
    const ch = c.code >= 0x20 && c.code < 0x7f ? `\`${String.fromCharCode(c.code)}\`` : `[${c.code.toString(16)}]`;
    lines.push(`| ${c.col} | ${c.code.toString(16)} | ${ch} |`);
  }
}

const reportPath = path.join(__dirname, 'phase87b-0a29ec-fixed-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
