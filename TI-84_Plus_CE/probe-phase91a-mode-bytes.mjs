#!/usr/bin/env node
// Phase 91a: Find mode RAM bytes and seed them for correct home screen render.
// Goal: make 0x0a29ec render actual mode names (Normal/Float/Radian/etc.)
//       instead of 26 × 0xFF glyph blocks.
// Approach:
//   1. Read hot mode bytes at 0xD0008A/0xD00085/0xD0008E/0xD00092 from boot snapshot
//   2. Try setting each to 0x00/0x01/0x02 and observe char output changes
//   3. Find which byte(s) control what 0x0a29ec renders
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
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const cpuSnap = Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
console.log('Snapshot ready.');

// ── Read mode bytes from snapshot ─────────────────────────────────────────────
console.log('\n=== Mode RAM bytes in boot snapshot ===');
const MODE_ADDRS = [
  0xD00080, 0xD00081, 0xD00082, 0xD00083, 0xD00084,
  0xD00085, 0xD00086, 0xD00087, 0xD00088, 0xD00089,
  0xD0008A, 0xD0008B, 0xD0008C, 0xD0008D, 0xD0008E,
  0xD0008F, 0xD00090, 0xD00091, 0xD00092, 0xD00093,
  0xD00094, 0xD00095, 0xD00096, 0xD00097, 0xD00098,
  0xD00099, 0xD0009A, 0xD0009B, 0xD0009C, 0xD0009D,
  0xD0009E, 0xD0009F,
];
for (const addr of MODE_ADDRS) {
  const val = mem[addr];
  const note = val === 0xFF ? '(uninit)' : val === 0x00 ? '(zero)' : `0x${val.toString(16)}`;
  console.log(`  0x${addr.toString(16)}: ${note}`);
}

// Also check what IY+nn range looks like (IY=0xD00080)
const IY = 0xD00080;
console.log('\nIY+0x00 through IY+0x1F:');
for (let i = 0; i < 0x20; i++) {
  const val = mem[IY + i];
  if (val !== 0xFF) console.log(`  IY+0x${i.toString(16).padStart(2,'0')} (0x${(IY+i).toString(16)}): 0x${val.toString(16)}`);
}

// ── Helper: clear VRAM ────────────────────────────────────────────────────────
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
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;
}

function runAndCapture(addr, label) {
  clearVramOnly();
  resetCpu();
  const chars = [];
  const r = executor.runFrom(addr, 'adl', {
    maxSteps: 30000, maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
    }
  });
  let drawn = 0, fg = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i*2] | (mem[VRAM_BASE + i*2+1] << 8);
    if (px !== VRAM_SENTINEL) { drawn++; if (px !== 0xFFFF) fg++; }
  }
  const text = chars.map(c => c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`).join('');
  const allFf = chars.every(c => c.code === 0xFF);
  console.log(`  ${label}: drawn=${drawn} fg=${fg} chars=${chars.length} allFF=${allFf} text="${text.slice(0,60)}"`);
  return { chars, text, drawn, fg };
}

// ── Baseline: 0x0a29ec with snapshot state ───────────────────────────────────
console.log('\n=== BASELINE: 0x0a29ec default (snapshot state) ===');
mem.set(ramSnap, 0x400000);
runAndCapture(0x0a29ec, 'baseline');

// ── Try setting hot mode bytes to 0x00 ───────────────────────────────────────
// Phase 75 found hot bytes at 0xD0008A, 0xD00085, 0xD0008E, 0xD00092
const HOT_BYTES = [0xD00085, 0xD0008A, 0xD0008E, 0xD00092];
console.log('\n=== Sweeping hot mode bytes (0x0a29ec) ===');
for (const addr of HOT_BYTES) {
  for (const val of [0x00, 0x01, 0x02, 0x03, 0x10]) {
    mem.set(ramSnap, 0x400000);
    mem[addr] = val;
    const result = runAndCapture(0x0a29ec, `  0x${addr.toString(16)}=${val.toString(16)}`);
    if (!result.chars.every(c => c.code === 0xFF)) {
      console.log(`    *** NON-FF CHARS! addr=0x${addr.toString(16)} val=0x${val.toString(16)} ***`);
    }
  }
}

// ── Scan ALL 0xD00080-0xD000FF bytes for effect on 0x0a29ec ──────────────────
console.log('\n=== Scanning 0xD00080-0xD000FF (0x0a29ec) — looking for any non-FF change ===');
const findings = [];
for (let addr = 0xD00080; addr <= 0xD000FF; addr++) {
  const origVal = ramSnap[addr - 0x400000];
  // Try setting to 0x00 (if not already) or 0xFF (if not already 0xFF)
  const testVals = origVal !== 0x00 ? [0x00] : [0x01, 0x04, 0x4F];
  for (const val of testVals) {
    mem.set(ramSnap, 0x400000);
    mem[addr] = val;
    clearVramOnly(); resetCpu();
    const chars = [];
    executor.runFrom(0x0a29ec, 'adl', {
      maxSteps: 30000, maxLoopIterations: 500,
      onBlock: (pc) => { if (pc === 0x0a1799) chars.push(cpu.a); }
    });
    if (chars.some(c => c !== 0xFF)) {
      const text = chars.map(c => c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `[${c.toString(16)}]`).join('');
      console.log(`  FOUND: 0x${addr.toString(16)}=${val.toString(16)} (was ${origVal.toString(16)}) → chars: "${text.slice(0,60)}"`);
      findings.push({ addr, origVal, val, text });
    }
  }
}
if (findings.length === 0) {
  console.log('  (no byte in range 0xD00080-0xD000FF causes non-FF char output)');
}

// ── Also try 0xD00100-0xD001FF range ─────────────────────────────────────────
console.log('\n=== Scanning 0xD00100-0xD001FF (0x0a29ec) ===');
for (let addr = 0xD00100; addr <= 0xD001FF; addr++) {
  const origVal = ramSnap[addr - 0x400000];
  const testVals = origVal !== 0x00 ? [0x00] : [0x01, 0x4F];
  for (const val of testVals) {
    mem.set(ramSnap, 0x400000);
    mem[addr] = val;
    clearVramOnly(); resetCpu();
    const chars = [];
    executor.runFrom(0x0a29ec, 'adl', {
      maxSteps: 30000, maxLoopIterations: 500,
      onBlock: (pc) => { if (pc === 0x0a1799) chars.push(cpu.a); }
    });
    if (chars.some(c => c !== 0xFF)) {
      const text = chars.map(c => c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `[${c.toString(16)}]`).join('');
      console.log(`  FOUND: 0x${addr.toString(16)}=${val.toString(16)} → chars: "${text.slice(0,60)}"`);
      findings.push({ addr, origVal, val, text });
    }
  }
}

// ── Write report ─────────────────────────────────────────────────────────────
const lines = ['# Phase 91a — Mode RAM Byte Discovery\n\n'];
lines.push('## Mode bytes in boot snapshot\n');
lines.push('| addr | value | note |\n|------|-------|------|');
for (const addr of MODE_ADDRS) {
  const val = mem[addr];
  const note = val === 0xFF ? 'uninit' : val === 0x00 ? 'zero' : `0x${val.toString(16)}`;
  lines.push(`| 0x${addr.toString(16)} | 0x${val.toString(16)} | ${note} |`);
}
lines.push('\n## Scan findings\n');
if (findings.length > 0) {
  lines.push('| addr | was | set to | char output |');
  lines.push('|------|-----|--------|-------------|');
  for (const f of findings) {
    lines.push(`| 0x${f.addr.toString(16)} | 0x${f.origVal.toString(16)} | 0x${f.val.toString(16)} | \`${f.text.slice(0,60)}\` |`);
  }
} else {
  lines.push('No scan findings — 0x0a29ec char output did not change from any single byte modification.\n');
}

fs.writeFileSync(path.join(__dirname, 'phase91a-mode-bytes-report.md'), lines.join('\n'));
console.log('\nReport written.');
