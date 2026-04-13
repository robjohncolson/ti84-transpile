#!/usr/bin/env node
// Phase 90c: Reconstruct the full home screen by combining renders in sequence.
// Strategy: 0x0a2b72 (background/status-bar, r0-34) first → then 0x0a29ec (home rows, r17-34).
// Also try the working fn-starts from 90b: fn_6c861 and fn_609be.
// Output: screenshot PNG + report.
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
console.log('Snapshot ready.');

const vramClear = new Uint8Array(320 * 240 * 2);
for (let i = 0; i < 320 * 240; i++) { vramClear[i*2] = 0xAA; vramClear[i*2+1] = 0xAA; }

function restoreCpu(overrides = {}) {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
  for (const [f, v] of Object.entries(overrides)) cpu[f] = v;
}

function countVram() {
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
  return { drawn, fg, bg, rMin, rMax, cMin, cMax, bbox: rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}` };
}

function runAt(addr, label, overrides = {}) {
  restoreCpu(overrides);
  const chars = [];
  const r = executor.runFrom(addr, 'adl', {
    maxSteps: 30000, maxLoopIterations: 500,
    onBlock: (pc) => { if (pc === 0x0a1799) chars.push({ col: cpu._de & 0xFFFF, code: cpu.a }); }
  });
  const text = chars.map(c => c.code >= 0x20 && c.code < 0x7f ? String.fromCharCode(c.code) : `[${c.code.toString(16)}]`).join('');
  const v = countVram();
  console.log(`  ${label}: steps=${r.steps} term=${r.termination} drawn=${v.drawn} bbox=${v.bbox} chars=${chars.length} text="${text.slice(0,50)}"`);
  return { chars, text, r, v };
}

const scenarios = [];

// ── Scenario A: 0x0a2b72 only ────────────────────────────────────────────────
console.log('\n[A] 0x0a2b72 alone (status-bar background)');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
const rA = runAt(0x0a2b72, '0a2b72');
const vA = countVram();
scenarios.push({ name: 'A_0a2b72_only', ...vA });
saveVram(mem, 'phase90c_A_2b72.raw');

// ── Scenario B: 0x0a29ec only ────────────────────────────────────────────────
console.log('\n[B] 0x0a29ec alone (home rows)');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
const rB = runAt(0x0a29ec, '0a29ec');
scenarios.push({ name: 'B_0a29ec_only', ...countVram() });

// ── Scenario C: 0x0a2b72 → then 0x0a29ec (combined, no VRAM reset between) ──
console.log('\n[C] Combined: 0x0a2b72 first, then 0x0a29ec on top');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
runAt(0x0a2b72, '1st: 0x0a2b72');
// Keep VRAM, only restore RAM + CPU for second call
mem.set(ramSnap, 0x400000);
const vramAfterFirst = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + 320 * 240 * 2));
runAt(0x0a29ec, '2nd: 0x0a29ec');
const vC = countVram();
scenarios.push({ name: 'C_combined_2b72_then_29ec', ...vC });
saveVram(mem, 'phase90c_C_combined.raw');

// ── Scenario D: fn_6c861 (4 bytes before CALL@6c865) ────────────────────────
console.log('\n[D] fn_6c861 (4b before CALL to 0x0a29ec at 0x06c865)');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
runAt(0x06c861, 'fn_6c861');
scenarios.push({ name: 'D_fn_6c861', ...countVram() });

// ── Scenario E: fn_609be (8090px, calls 0x0a29ec, r17-42) ───────────────────
console.log('\n[E] fn_609be (8090px caller, r17-42)');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
runAt(0x0609be, 'fn_609be');
scenarios.push({ name: 'E_fn_609be', ...countVram() });
saveVram(mem, 'phase90c_E_609be.raw');

// ── Scenario F: 0x0a2b72 → fn_609be (combined) ──────────────────────────────
console.log('\n[F] Combined: 0x0a2b72 first, then fn_609be on top');
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
runAt(0x0a2b72, '1st: 0x0a2b72');
mem.set(ramSnap, 0x400000);
runAt(0x0609be, '2nd: fn_609be');
const vF = countVram();
scenarios.push({ name: 'F_combined_2b72_then_609be', ...vF });
saveVram(mem, 'phase90c_F_combined2.raw');

// ── Scenario G: callers of 0x0a2b72 ─────────────────────────────────────────
console.log('\n[G] Direct callers of 0x0a2b72');
for (const [addr, name] of [[0x05e481,'5e481'],[0x05e7d2,'5e7d2'],[0x09cb14,'9cb14']]) {
  mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
  runAt(addr, name);
  scenarios.push({ name: 'G_caller_' + name, ...countVram() });
}

// ── VRAM dump helper ─────────────────────────────────────────────────────────
function saveVram(mem, filename) {
  const vram = mem.slice(VRAM_BASE, VRAM_BASE + 320 * 240 * 2);
  fs.writeFileSync(path.join(__dirname, filename), vram);
}

// ── Write ASCII preview of combined VRAM ─────────────────────────────────────
function asciiPreview(mem, rowStart, rowEnd) {
  const lines = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    let row = '';
    for (let c = 0; c < 320; c += 4) {
      const px = mem[VRAM_BASE + (r * 320 + c) * 2] | (mem[VRAM_BASE + (r * 320 + c) * 2 + 1] << 8);
      if (px === VRAM_SENTINEL) row += '.';
      else if (px === 0xFFFF) row += ' ';
      else row += '#';
    }
    lines.push(`r${String(r).padStart(3,'0')}: ${row}`);
  }
  return lines.join('\n');
}

// Restore scenario C VRAM for preview
mem.set(ramSnap, 0x400000); mem.set(vramClear, VRAM_BASE);
restoreCpu(); executor.runFrom(0x0a2b72, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
mem.set(ramSnap, 0x400000); restoreCpu(); executor.runFrom(0x0a29ec, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

const lines = ['# Phase 90c — Combined Home Screen Probe\n\n'];
lines.push('## Scenario Summary\n');
lines.push('| scenario | drawn | fg | bg | bbox |');
lines.push('|----------|------:|---:|---:|------|');
for (const s of scenarios) {
  lines.push(`| ${s.name} | ${s.drawn} | ${s.fg} | ${s.bg} | ${s.bbox} |`);
}
lines.push('\n## ASCII preview of Scenario C (0x0a2b72 + 0x0a29ec) — r0-50\n');
lines.push('```');
lines.push(asciiPreview(mem, 0, 50));
lines.push('```');

const reportPath = path.join(__dirname, 'phase90c-combined-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
console.log('Saved raw VRAM files: phase90c_*.raw (320×240×2 bytes, RGB565)');
