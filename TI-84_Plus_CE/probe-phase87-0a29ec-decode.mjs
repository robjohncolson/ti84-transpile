#!/usr/bin/env node
// Phase 87: Decode text rendered by 0x0a29ec (JT slot 627) using 0x0a1799 intercept
// This function renders 5652px in r17-34, containing visible glyph patterns
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romMod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romMod.PRELIFTED_BLOCKS;
const romBytes = romMod.decodeEmbeddedRom();
const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);

function vramStats(mem) {
  const vStart = 0xD40000;
  let fg = 0, bg = 0, rMin = 240, rMax = -1, cMin = 320, cMax = -1;
  for (let i = 0; i < 320 * 240; i++) {
    const lo = mem[vStart + i * 2], hi = mem[vStart + i * 2 + 1];
    const px = lo | (hi << 8);
    if (px !== 0xAAAA) {
      const r = Math.floor(i / 320), c = i % 320;
      if (px === 0x0000) fg++; else bg++;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (c < cMin) cMin = c; if (c > cMax) cMax = c;
    }
  }
  return { total: fg + bg, fg, bg, rMin, rMax, cMin, cMax, bbox: rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}` };
}

// Standard boot snapshot
console.log('Booting...');
const snapMem = new Uint8Array(0x1000000);
snapMem.set(romBytes);
const snapP = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const snapEx = createExecutor(BLOCKS, snapMem, { peripherals: snapP });
const snapCpu = snapEx.cpu;
snapEx.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
snapCpu.halted = false; snapCpu.iff1 = 0; snapCpu.iff2 = 0;
snapCpu.sp = 0xD1A87E - 3;
snapMem.fill(0xFF, snapCpu.sp, snapCpu.sp + 3);
snapEx.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
snapCpu.halted = false; snapCpu.iff1 = 0; snapCpu.iff2 = 0;
snapCpu._iy = 0xD00080; snapCpu.hl = 0x000000;
snapEx.runFrom(0x0802b2, 'adl', { maxSteps: 100 });
const snapCpuState = JSON.parse(JSON.stringify(snapCpu));
const snapMemCopy = new Uint8Array(snapMem);
console.log('Ready.');

// Probe variants for 0x0a29ec
// From Phase 77: this renders 5652px in r17-34, goes through 0x0a1799
// The Phase 77 probe used DE=0x4f or 0x52 (mode codes)
const PROBES = [
  { label: 'de_normal', de: 0x4f },  // Normal
  { label: 'de_sci',    de: 0x50 },  // Sci
  { label: 'de_eng',    de: 0x51 },  // Eng
  { label: 'de_float',  de: 0x52 },  // Float
  { label: 'de_radian', de: 0x4d },  // Radian
  { label: 'de_degree', de: 0x4e },  // Degree
  { label: 'de_default', de: 0x00 }, // default
];

const results = [];
const vStart = 0xD40000;

for (const { label, de } of PROBES) {
  const mem = new Uint8Array(snapMemCopy);
  const p = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const ex = createExecutor(BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;
  Object.assign(cpu, snapCpuState);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.sp = 0xD1A87E - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.f = 0x40;
  cpu._de = de;  // Set DE to mode code

  // Sentinel VRAM
  for (let i = 0; i < 320 * 240; i++) {
    mem[vStart + i * 2] = 0xAA;
    mem[vStart + i * 2 + 1] = 0xAA;
  }

  const chars = [];
  const r = ex.runFrom(0x0a29ec, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
    }
  });

  const stats = vramStats(mem);
  const text = chars.map(c =>
    c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`
  ).join('');

  console.log(`${label} (DE=${de.toString(16)}): steps=${r.steps} term=${r.termination} ${stats.total}px bbox=${stats.bbox} chars=${chars.length} text="${text.slice(0,60)}"`);
  results.push({ label, de, ...r, ...stats, chars, text });
}

// Write report
const lines = ['# Phase 87 — 0x0a29ec Text Decode (slot 627)\n'];
lines.push('## Summary\n');
lines.push('| probe | DE | steps | total px | bbox | decoded text |');
lines.push('|-------|----|------:|-------:|------|--------------|');
for (const r of results) {
  lines.push(`| ${r.label} | ${r.de.toString(16)} | ${r.steps} | ${r.total} | ${r.bbox} | \`${r.text.slice(0,60)}\` |`);
}

for (const r of results) {
  if (r.chars.length === 0) continue;
  lines.push(`\n## ${r.label} — ${r.total}px\n`);
  lines.push(`Decoded text: \`${r.text}\`\n`);
  lines.push('| col | code | char |');
  lines.push('|-----|------|------|');
  for (const c of r.chars) {
    const ch = c.code >= 0x20 && c.code < 0x7f ? `\`${String.fromCharCode(c.code)}\`` : `[${c.code.toString(16)}]`;
    lines.push(`| ${c.col} | ${c.code.toString(16)} | ${ch} |`);
  }
}

const reportPath = path.join(__dirname, 'phase87-0a29ec-decode-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
