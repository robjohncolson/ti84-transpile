#!/usr/bin/env node
// Phase 90d: Correct combined render — no RAM/VRAM reset between sequential calls.
// Fix: restoreCpu() only; don't call mem.set(ramSnap) between stages.
// Goal: render the full home screen (status bar + row content) in one VRAM.
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

// ── Boot to snapshot ─────────────────────────────────────────────────────────
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
const vramOffset = VRAM_BASE - 0x400000;  // VRAM sits within ramSnap at this offset
console.log('Snapshot ready. VRAM in ramSnap at offset 0x' + vramOffset.toString(16));

function resetCpu(overrides = {}) {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;
}

// Clear VRAM ONLY (sentinel), without touching RAM
function clearVramOnly() {
  for (let i = 0; i < 320 * 240; i++) {
    mem[VRAM_BASE + i*2] = 0xAA;
    mem[VRAM_BASE + i*2+1] = 0xAA;
  }
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
  if (label) console.log(`  [vram] ${label}: drawn=${drawn} fg=${fg} bg=${bg} bbox=${bbox}`);
  return { drawn, fg, bg, rMin, rMax, cMin, cMax, bbox };
}

function runStep(addr, label, overrides = {}) {
  resetCpu(overrides);
  const chars = [];
  const colsByChar = [];
  const r = executor.runFrom(addr, 'adl', {
    maxSteps: 30000, maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) colsByChar.push({ col: cpu._de & 0xFFFF, code: cpu.a });
    }
  });
  const text = colsByChar.map(c => c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`).join('');
  console.log(`  → ${label}: steps=${r.steps} term=${r.termination} chars=${colsByChar.length} text="${text.slice(0,60)}"`);
  return { r, chars: colsByChar, text };
}

// ── Full fresh state helper ───────────────────────────────────────────────────
function freshState() {
  mem.set(ramSnap, 0x400000);  // Restore RAM (INCLUDES VRAM! fix below)
  clearVramOnly();             // Override VRAM back to sentinel
}

// ── Scenario 1: Single-call baselines ────────────────────────────────────────
console.log('\n=== SOLO BASELINES ===');

freshState();
runStep(0x0a2b72, '0a2b72 solo');
countVram('After 0x0a2b72');

freshState();
runStep(0x0a29ec, '0a29ec solo');
countVram('After 0x0a29ec');

// ── Scenario 2: Sequential — 0x0a2b72 THEN 0x0a29ec (no RAM/VRAM reset between) ──
console.log('\n=== SEQUENTIAL: 0x0a2b72 → 0x0a29ec (no reset between) ===');
freshState();
runStep(0x0a2b72, 'Stage 1: 0x0a2b72');
countVram('After stage 1');
// NO freshState() — keep RAM and VRAM from stage 1
runStep(0x0a29ec, 'Stage 2: 0x0a29ec');
const vSeq = countVram('After stage 2 (combined)');
saveVram('phase90d_seq_2b72_29ec.raw');

// ── Scenario 3: Sequential — 0x0a29ec THEN 0x0a2b72 (reversed order) ────────
console.log('\n=== SEQUENTIAL: 0x0a29ec → 0x0a2b72 (reversed) ===');
freshState();
runStep(0x0a29ec, 'Stage 1: 0x0a29ec');
countVram('After stage 1');
runStep(0x0a2b72, 'Stage 2: 0x0a2b72');
const vRev = countVram('After stage 2 (combined reversed)');
saveVram('phase90d_seq_29ec_2b72.raw');

// ── Scenario 4: Caller-level sequential — caller_5e7d2 (→0x0a2b72) then fn_6c861 ──
console.log('\n=== SEQUENTIAL: caller_5e7d2 → fn_6c861 ===');
freshState();
runStep(0x05e7d2, 'Stage 1: caller_5e7d2');
countVram('After stage 1');
runStep(0x06c861, 'Stage 2: fn_6c861');
const v4 = countVram('After stage 2');
saveVram('phase90d_seq_5e7d2_6c861.raw');

// ── Scenario 5: Probe what 0x0a2b72 actually renders (with column info) ──────
console.log('\n=== 0x0a2b72 char column analysis ===');
freshState();
resetCpu();
const chars2b72 = [];
executor.runFrom(0x0a2b72, 'adl', {
  maxSteps: 30000, maxLoopIterations: 500,
  onBlock: (pc) => { if (pc === 0x0a1799) chars2b72.push({ col: cpu._de & 0xFFFF, code: cpu.a }); }
});
console.log(`  Chars from 0x0a2b72: ${chars2b72.length}`);
for (const c of chars2b72) {
  const ch = c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`;
  console.log(`    col=${c.col.toString().padStart(3)} code=0x${c.code.toString(16).padStart(2,'0')} char=${ch}`);
}

// ── ASCII preview of VRAM ─────────────────────────────────────────────────────
function asciiPreview(rowStart, rowEnd) {
  const lines = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    let row = '';
    for (let c = 0; c < 320; c += 2) {
      const px = mem[VRAM_BASE + (r * 320 + c) * 2] | (mem[VRAM_BASE + (r * 320 + c) * 2 + 1] << 8);
      if (px === VRAM_SENTINEL) row += '.';
      else if (px === 0xFFFF) row += ' ';
      else if (px === 0x0000) row += '#';
      else row += '+';  // colored (non-black, non-white)
    }
    lines.push(`r${String(r).padStart(3,'0')}: ${row}`);
  }
  return lines.join('\n');
}

// Rebuild scenario 2 VRAM for ASCII preview
freshState();
resetCpu(); executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
resetCpu(); executor.runFrom(0x0a29ec, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
const previewSeq = asciiPreview(0, 40);
saveVram('phase90d_seq_preview.raw');

// ── Report ────────────────────────────────────────────────────────────────────
const lines = ['# Phase 90d — Correct Combined Render\n\n'];
lines.push('## Fix\n\nNo RAM/VRAM reset between sequential calls.\n');
lines.push('The `mem.set(ramSnap, 0x400000)` in Phase 90c was also resetting VRAM since VRAM_BASE=0xD40000 is within 0x400000-0xE00000.\n\n');
lines.push('## Sequential Render (0x0a2b72 → 0x0a29ec)\n');
lines.push(`Combined: drawn=${vSeq.drawn} fg=${vSeq.fg} bg=${vSeq.bg} bbox=${vSeq.bbox}\n\n`);
lines.push('## 0x0a2b72 Char Analysis\n');
lines.push('| col | code | char |\n|-----|------|------|');
for (const c of chars2b72) {
  const ch = c.code >= 0x20 && c.code < 0x7f ? `\`${String.fromCharCode(c.code)}\`` : `[${c.code.toString(16)}]`;
  lines.push(`| ${c.col} | 0x${c.code.toString(16)} | ${ch} |`);
}
lines.push('\n## ASCII Preview (Scenario 2: r0-40)\n```');
lines.push(previewSeq);
lines.push('```');

fs.writeFileSync(path.join(__dirname, 'phase90d-combined-report.md'), lines.join('\n'));
console.log('\nReport written. VRAM files saved.');

function saveVram(filename) {
  fs.writeFileSync(path.join(__dirname, filename), mem.slice(VRAM_BASE, VRAM_BASE + 320 * 240 * 2));
}
