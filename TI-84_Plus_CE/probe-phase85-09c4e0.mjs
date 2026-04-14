#!/usr/bin/env node
// Phase 85: Probe 0x09c4e0 as Y= editor entry, decode rendered text via 0x0a1799 intercept
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const cpuRuntimePath = path.join(__dirname, 'cpu-runtime.js');
const peripheralsPath = path.join(__dirname, 'peripherals.js');
const reportPath = path.join(__dirname, 'phase85-09c4e0-report.md');

console.log('Loading ROM...');
const romMod = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = romMod.PRELIFTED_BLOCKS;
console.log(`Loaded ${Object.keys(BLOCKS).length} blocks`);

// Get ROM bytes
let romBytes = romMod.ROM_BYTES || romMod.ROM || (romMod.decodeEmbeddedRom && romMod.decodeEmbeddedRom());
if (!romBytes) {
  const keys = Object.keys(romMod).filter(k => k !== 'PRELIFTED_BLOCKS' && k !== 'TRANSPILATION_META');
  console.log('Available exports:', keys.slice(0, 10));
  throw new Error('Cannot find ROM bytes');
}

const { createExecutor } = await import(pathToFileURL(cpuRuntimePath).href);
const { createPeripheralBus } = await import(pathToFileURL(peripheralsPath).href);

function vramStats(mem) {
  const vStart = 0xD40000;
  let fg = 0, bg = 0;
  let rMin = 240, rMax = -1, cMin = 320, cMax = -1;
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
  const bbox = rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}`;
  return { total: fg + bg, fg, bg, bbox };
}

function asciiPreview(mem, rMin, rMax, cMin, cMax) {
  const vStart = 0xD40000;
  const lines = [];
  const cr = Math.min(rMax + 1, rMin + 40);
  const cc = Math.min(cMax + 1, cMin + 80);
  for (let r = rMin; r < cr; r++) {
    let row = '';
    for (let c = cMin; c < cc; c++) {
      const i = r * 320 + c;
      const lo = mem[vStart + i * 2], hi = mem[vStart + i * 2 + 1];
      const px = lo | (hi << 8);
      row += px === 0x0000 ? '#' : px === 0xAAAA ? '?' : '.';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

// Boot snapshot
console.log('Booting ROM for snapshot...');
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
console.log('Snapshot ready.');

function runProbe(entryAddr, label, maxSteps = 50000) {
  console.log(`\nProbing ${label} (${entryAddr.toString(16).padStart(6, '0')})...`);
  const mem = new Uint8Array(snapMemCopy);
  const p = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const ex = createExecutor(BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;
  Object.assign(cpu, snapCpuState);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.sp = 0xD1A87E - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.f = 0x40;

  // Sentinel VRAM
  const vStart = 0xD40000;
  for (let i = 0; i < 320 * 240; i++) {
    mem[vStart + i * 2] = 0xAA;
    mem[vStart + i * 2 + 1] = 0xAA;
  }

  const chars = [];
  const r = ex.runFrom(entryAddr, 'adl', {
    maxSteps,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) {
        chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
      }
    }
  });

  const stats = vramStats(mem);
  console.log(`  steps=${r.steps} term=${r.termination} total=${stats.total}px bbox=${stats.bbox} chars=${chars.length}`);

  let preview = '';
  if (stats.rMax >= 0) {
    preview = asciiPreview(mem, stats.rMin, stats.rMax, stats.cMin, stats.cMax);
  }

  return { ...r, ...stats, chars, preview };
}

const PROBES = [
  { addr: 0x09c4e0, label: '09c4e0_primary' },
  { addr: 0x09c000, label: '09c000_pagestart' },
];

const results = [];
for (const { addr, label } of PROBES) {
  results.push({ addr, label, ...runProbe(addr, label, 50000) });
}

// Write report
const lines = ['# Phase 85 — 0x09c4e0 Top-Level Y= Editor Probe\n'];
lines.push('## Summary\n');
lines.push('| probe | entry | steps | term | total px | fg | bg | bbox | chars |');
lines.push('|-------|-------|------:|------|-------:|---:|---:|------|------:|');
for (const r of results) {
  lines.push(`| ${r.label} | ${r.addr.toString(16)} | ${r.steps} | ${r.termination} | ${r.total} | ${r.fg} | ${r.bg} | ${r.bbox} | ${r.chars.length} |`);
}

for (const r of results) {
  lines.push(`\n## ${r.label} (0x${r.addr.toString(16)})\n`);
  lines.push(`- steps: ${r.steps}, term: ${r.termination}`);
  lines.push(`- VRAM: ${r.total}px (fg=${r.fg} bg=${r.bg}) bbox=${r.bbox}`);

  if (r.chars.length > 0) {
    const text = r.chars.map(c =>
      (c.code >= 0x20 && c.code < 0x7f)
        ? String.fromCharCode(c.code)
        : `[0x${c.code.toString(16).padStart(2, '0')}]`
    ).join('');
    lines.push(`\n**Decoded text**: \`${text}\`\n`);
    lines.push('| col | code | char |');
    lines.push('|-----|------|------|');
    for (const c of r.chars) {
      const ch = (c.code >= 0x20 && c.code < 0x7f)
        ? `\`${String.fromCharCode(c.code)}\``
        : `[0x${c.code.toString(16)}]`;
      lines.push(`| ${c.col} | 0x${c.code.toString(16).padStart(2, '0')} | ${ch} |`);
    }
  } else {
    lines.push('\nNo chars decoded.\n');
  }

  if (r.preview) {
    lines.push('\n```');
    lines.push(r.preview);
    lines.push('```');
  }
}

fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport written to', reportPath);
