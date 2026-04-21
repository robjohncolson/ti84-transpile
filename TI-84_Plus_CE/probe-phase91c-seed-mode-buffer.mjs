#!/usr/bin/env node
// Phase 91c: Seed mode token buffer and verify rendering.
// Finding: Phase 91b identified 0xD020A6-0xD020BF (26 bytes) as the
//          mode display buffer — HL steps through it calling 0x0a1799
//          once per byte. All 0xFF in boot snapshot → 26 glyph blocks.
// Goal: Seed with real mode content and see recognizable text render.
//
// Experiments:
//   A. All-0x4F (Normal token code from Phase 74 token table)
//   B. All-0x20 (ASCII space — should render blank)
//   C. All-ASCII 0x41-0x5A (A-Z) to check if 0x0a1799 is ASCII-aware
//   D. ASCII "Normal Float Radian    " (26 chars)
//   E. Token-code sequence: 0x4F 0x20 0x52 0x20 0x4D 0x20 ... (mode tokens + spaces)
//   F. Combined: valid mode setting bytes + seeded buffer
//
// Also: find and call the function that populates 0xD020A6 from mode bytes.
//       It must be called from somewhere in the OS boot sequence.
//       Hint: look for callers that write TO 0xD020A6-0xD020BF.
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
const MODE_BUF = 0xD020A6;
const MODE_BUF_LEN = 26;

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

function runCapture(label, bufOverride = null, modeByteOverrides = {}) {
  mem.set(ramSnap, 0x400000); clearVram(); resetCpu();
  if (bufOverride) {
    for (let i = 0; i < MODE_BUF_LEN; i++) {
      mem[MODE_BUF + i] = bufOverride[i] ?? 0x20;
    }
  }
  for (const [addr, val] of Object.entries(modeByteOverrides)) {
    mem[parseInt(addr, 16)] = val;
  }

  const chars = [];
  executor.runFrom(0x0a29ec, 'adl', {
    maxSteps: 50000, maxLoopIterations: 500,
    onBlock: (pc) => { if (pc === 0x0a1799) chars.push(cpu.a); }
  });

  let drawn = 0, fg = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const px = mem[VRAM_BASE + i * 2] | (mem[VRAM_BASE + i * 2 + 1] << 8);
    if (px !== VRAM_SENTINEL) { drawn++; if (px !== 0xFFFF) fg++; }
  }

  const text = chars.map(c =>
    c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `[${c.toString(16).padStart(2,'0')}]`
  ).join('');
  const allFF = chars.every(c => c === 0xFF);
  console.log(`  [${label}] chars=${chars.length} allFF=${allFF} text="${text}" drawn=${drawn} fg=${fg}`);
  return { chars, text, drawn, fg, allFF };
}

function asciiRow(row) {
  let s = `r${String(row).padStart(3,'0')}: `;
  for (let c = 0; c < 320; c++) {
    const px = mem[VRAM_BASE + (row * 320 + c) * 2] | (mem[VRAM_BASE + (row * 320 + c) * 2 + 1] << 8);
    s += px === VRAM_SENTINEL ? '.' : px === 0xFFFF ? ' ' : px === 0x0000 ? '#' : '+';
  }
  return s;
}

// ── Baseline ──────────────────────────────────────────────────────────────────
console.log('\n=== Baseline (all 0xFF in buffer) ===');
const baseline = runCapture('baseline');

// ── Experiment A: All 0x4F (Normal token) ───────────────────────────────────
console.log('\n=== Experiment A: Buffer all 0x4F (Normal mode token) ===');
const expA = runCapture('A-all-0x4F', new Uint8Array(MODE_BUF_LEN).fill(0x4F));

// ── Experiment B: All 0x20 (ASCII space) ─────────────────────────────────────
console.log('\n=== Experiment B: Buffer all 0x20 (ASCII space) ===');
const expB = runCapture('B-all-space', new Uint8Array(MODE_BUF_LEN).fill(0x20));

// ── Experiment C: A-Z sweep (0x41-0x5A) ──────────────────────────────────────
console.log('\n=== Experiment C: Buffer 0x41-0x5A (A through Z) ===');
const bufC = new Uint8Array(MODE_BUF_LEN);
for (let i = 0; i < MODE_BUF_LEN; i++) bufC[i] = 0x41 + i; // 'A' through 'Z'
const expC = runCapture('C-AtoZ', bufC);

// ── Experiment D: ASCII "Normal Float Radian      " ──────────────────────────
console.log('\n=== Experiment D: ASCII "Normal Float Radian      " ===');
const modeStr = 'Normal Float Radian       '; // 26 chars
const bufD = new Uint8Array(MODE_BUF_LEN);
for (let i = 0; i < MODE_BUF_LEN; i++) bufD[i] = modeStr.charCodeAt(i) || 0x20;
const expD = runCapture('D-ASCII-Normal-Float', bufD);

// ── Experiment E: Token codes from Phase 74 token table ───────────────────────
// Token codes: 0x4F=Normal, 0x20=space, 0x52=Float, 0x20=space, 0x4D=Radian
// Known codes from Phase 74:
//   0x4C=prgm, 0x4D=Radian, 0x4E=Degree, 0x4F=Normal, 0x50=Sci, 0x51=Eng, 0x52=Float, 0x53=Fix
console.log('\n=== Experiment E: Token-code sequence (Phase 74 codes) ===');
const bufE = new Uint8Array([
  0x4F, 0x20, 0x52, 0x20, 0x4D, 0x20, // Normal Float Radian
  0x20, 0x20, 0x20, 0x20,              // spaces
  0x46, 0x75, 0x6C, 0x6C, 0x20,       // "Full " (0x46=F,0x75=u...)
  0x46, 0x75, 0x6E, 0x63, 0x20,       // "Func "
  0x44, 0x65, 0x63, 0x20,             // "Dec "
  0x52, 0x65,                         // "Re"
]);
while (bufE.length < MODE_BUF_LEN) {
  const tmp = new Uint8Array(MODE_BUF_LEN);
  tmp.set(bufE);
  bufE.set(tmp);
  break;
}
const bufEfull = new Uint8Array(MODE_BUF_LEN);
bufEfull.set(bufE.slice(0, MODE_BUF_LEN));
const expE = runCapture('E-token-codes', bufEfull);

// ── Experiment F: Mode setting bytes + ASCII buffer ───────────────────────────
// Phase 75 hot bytes: 0xD0008A, 0xD00085, 0xD0008E, 0xD00092
// Try setting mode bytes to 0x00 (=mode option 0) + ASCII buffer
console.log('\n=== Experiment F: Mode bytes=0x00 + ASCII "Normal Float Radian" ===');
const expF = runCapture('F-mode-bytes-zero+ascii', bufD, {
  '0xD00085': 0x00,
  '0xD0008A': 0x00,
  '0xD0008E': 0x00,
  '0xD00092': 0x00,
});

// ── Capture ASCII art for best experiment ────────────────────────────────────
// Re-run experiment D (most likely to show readable text) and save ASCII art
console.log('\n=== ASCII preview of Experiment D (after 0x0a2b72 + 0x0a29ec) ===');
mem.set(ramSnap, 0x400000); clearVram(); resetCpu();
executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
// Seed mode buffer, then run content pass
for (let i = 0; i < MODE_BUF_LEN; i++) mem[MODE_BUF + i] = bufD[i];
resetCpu();
executor.runFrom(0x0a29ec, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

const previewLines = [];
for (let r = 0; r <= 40; r++) previewLines.push(asciiRow(r));
console.log(previewLines.join('\n'));

// ── Also try: find the mode-buffer populate function ─────────────────────────
// Scan for code that WRITES to 0xD020A6 range.
// On eZ80, writes can use LD (HL),A or LD (IX+d),A or LD (IY+d),A patterns.
// The address 0xD020A6 = 0xD020A6. If IY=0xD00080, offset = 0xD020A6 - 0xD00080 = 0x2026 (too large for IY+d).
// More likely: a PRECOMPUTED buffer address loaded into HL, then incremented.
// Look for LD HL,0xD020A6 in ROM = bytes 21 A6 20 D0 (LD HL,nn in ADL mode).
console.log('\n=== Scanning ROM for writes to 0xD020A6 (LD HL,0xD020A6 pattern) ===');
// Pattern: 21 A6 20 D0 (LD HL,0xD020A6 in ADL mode, 3-byte addr)
const writePattern = [0x21, 0xA6, 0x20, 0xD0];
const found = [];
for (let i = 0; i < romBytes.length - writePattern.length; i++) {
  let match = true;
  for (let j = 0; j < writePattern.length; j++) {
    if (romBytes[i + j] !== writePattern[j]) { match = false; break; }
  }
  if (match) found.push(i);
}
console.log(`  LD HL,0xD020A6 (ADL) found at: ${found.length > 0 ? found.map(a => '0x'+a.toString(16)).join(', ') : 'none'}`);

// Also try 26-byte LD HL,0xD020A6 in Z80 mode (16-bit): 21 A6 20 (only 3 bytes)
const found16 = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x21 && romBytes[i+1] === 0xA6 && romBytes[i+2] === 0x20) {
    found16.push(i);
  }
}
console.log(`  LD HL,0x20A6 (Z80 16-bit) found at: ${found16.length > 0 ? found16.map(a => '0x'+a.toString(16)).join(', ') : 'none'}`);

// Also search for the address as an immediate in different orderings
// In ADL mode, address can be stored as 3 bytes lo-mid-hi
// 0xD020A6 as lo=A6, mid=20, hi=D0 → bytes: A6 20 D0 appearing after some load opcode
const found24lo = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xA6 && romBytes[i+1] === 0x20 && romBytes[i+2] === 0xD0) {
    // check if preceded by a load opcode
    const prev = i > 0 ? romBytes[i-1] : 0;
    found24lo.push({ at: i-1, opcode: `0x${prev.toString(16)}`, addr: `0x${(romBytes[i] | romBytes[i+1]<<8 | romBytes[i+2]<<16).toString(16)}` });
  }
}
console.log(`  3-byte 0xD020A6 as data (A6 20 D0) found ${found24lo.length} times:`);
for (const f of found24lo.slice(0, 20)) {
  console.log(`    at 0x${(parseInt(f.at)).toString(16)} opcode=${f.opcode}`);
}

// ── Write report ─────────────────────────────────────────────────────────────
const report = [
  '# Phase 91c — Mode Buffer Seed Verification\n\n',
  '## Mode buffer location: 0xD020A6-0xD020BF (26 bytes)\n\n',
  '## Experiment results\n\n',
  '| Experiment | text | drawn | fg | allFF |\n',
  '|------------|------|-------|----|-------|\n',
  `| Baseline (all 0xFF) | \`${baseline.text}\` | ${baseline.drawn} | ${baseline.fg} | true |\n`,
  `| A: all 0x4F | \`${expA.text}\` | ${expA.drawn} | ${expA.fg} | ${expA.allFF} |\n`,
  `| B: all 0x20 (space) | \`${expB.text}\` | ${expB.drawn} | ${expB.fg} | ${expB.allFF} |\n`,
  `| C: A-Z | \`${expC.text}\` | ${expC.drawn} | ${expC.fg} | ${expC.allFF} |\n`,
  `| D: ASCII Normal Float | \`${expD.text}\` | ${expD.drawn} | ${expD.fg} | ${expD.allFF} |\n`,
  `| E: token codes | \`${expE.text}\` | ${expE.drawn} | ${expE.fg} | ${expE.allFF} |\n`,
  `| F: mode bytes 0 + ASCII | \`${expF.text}\` | ${expF.drawn} | ${expF.fg} | ${expF.allFF} |\n`,
  '\n## ASCII preview (composite: 0x0a2b72 + 0x0a29ec with ASCII "Normal Float Radian")\n\n```\n',
  previewLines.join('\n'),
  '\n```\n',
  '\n## ROM scan for writes to 0xD020A6\n\n',
  `LD HL,0xD020A6 (ADL): ${found.map(a => '0x'+a.toString(16)).join(', ') || 'none'}\n`,
  `LD HL,0x20A6 (16-bit): ${found16.map(a => '0x'+a.toString(16)).join(', ') || 'none'}\n`,
  `3-byte data A6 20 D0: found at ${found24lo.map(f => '0x'+parseInt(f.at).toString(16)).join(', ') || 'none'}\n`,
];

fs.writeFileSync(path.join(__dirname, 'phase91c-seed-report.md'), report.join(''));
console.log('\nReport written.');
