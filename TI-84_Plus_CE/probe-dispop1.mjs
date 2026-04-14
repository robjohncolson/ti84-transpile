#!/usr/bin/env node
// Phase 44 — probe _DispOP1 candidate functions (text-loop callers near OP1 ref)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const VRAM_BASE = 0xD40000;
const VRAM_W = 320, VRAM_H = 240, VRAM_SIZE = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL = 0xAAAA;

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex16 = (v) => `0x${(v & 0xffff).toString(16).padStart(4, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], { cwd: repoRoot, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) { mem.fill(0xff, start, start + bytes); }
function clearVram(mem) {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off] = VRAM_SENTINEL & 0xff;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }
}
function readPixel(mem, row, col) {
  const off = VRAM_BASE + row * VRAM_W * 2 + col * 2;
  return mem[off] | (mem[off + 1] << 8);
}
function vramStats(mem) {
  let drawn = 0, fg = 0, bg = 0, other = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  const hist = new Map();
  for (let row = 0; row < VRAM_H; row++) {
    for (let col = 0; col < VRAM_W; col++) {
      const px = readPixel(mem, row, col);
      hist.set(px, (hist.get(px) || 0) + 1);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px === 0x0000) fg++;
      else if (px === 0xffff) bg++;
      else other++;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }
  }
  return { drawn, fg, bg, other, hist, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}
function asciiSlice(mem, rowStart, rowEnd, colStart, colEnd, stride = 2) {
  const lines = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    let line = `${row.toString().padStart(3, '0')} `;
    for (let col = colStart; col <= colEnd; col += stride) {
      const px = readPixel(mem, row, col);
      let ch;
      if (px === VRAM_SENTINEL) ch = ' ';
      else if (px === 0xffff) ch = '.';
      else if (px === 0x0000) ch = '#';
      else ch = '+';
      line += ch;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// Set OP1 to the TI-FP representation of 3.14 so we have something non-trivial to display
function setOP1ToPi(mem) {
  // TI FP: 9 bytes. sign_exp, 7 mantissa BCD bytes
  // exponent for 3.14 = 0x80 (integer part has 1 digit)
  // mantissa = 31 40 00 00 00 00 00
  const OP1 = 0xD005F8;
  mem[OP1] = 0x00;       // sign byte (+)
  mem[OP1 + 1] = 0x80;   // exponent
  mem[OP1 + 2] = 0x31;
  mem[OP1 + 3] = 0x40;
  mem[OP1 + 4] = 0x00;
  mem[OP1 + 5] = 0x00;
  mem[OP1 + 6] = 0x00;
  mem[OP1 + 7] = 0x00;
  mem[OP1 + 8] = 0x00;
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  console.log('=== Phase 44 — _DispOP1 candidate probe ===\n');

  // Boot
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log('boot done');

  // OS init
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  console.log('os init done');

  // SetTextFgColor fg=black, bg=white
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log('set text color done');

  // Snapshot RAM so we can restore between probes
  const snap = new Uint8Array(mem.subarray(0x400000, 0xE00000));

  // Candidate list: (addr, description)
  const candidates = [
    // Direct "LD HL, OP1; CALL 0x0a1cac" sites
    { addr: 0x03f312, desc: 'LD HL, OP1; CALL 0x0a1cac (A)' },
    { addr: 0x04266a, desc: 'LD HL, OP1; CALL 0x0a1cac (B)' },
    { addr: 0x09edb3, desc: 'LD HL, OP1; CALL 0x0a1cac (C)' },
    { addr: 0x0ae357, desc: 'LD HL, OP1; CALL 0x0a1cac (D)' },
    // Function starts (try 4 bytes earlier)
    { addr: 0x03f30e, desc: '0x03f312 - 4 (function prologue?)' },
    { addr: 0x042666, desc: '0x04266a - 4' },
    { addr: 0x09edaf, desc: '0x09edb3 - 4' },
    { addr: 0x0ae353, desc: '0x0ae357 - 4' },
    // Earlier sites with DE refs (more complex setup)
    { addr: 0x03f300, desc: 'LD DE, OP1 earlier (setup + DispOP1)' },
  ];

  const results = [];
  for (const cand of candidates) {
    // Restore RAM snapshot
    mem.set(snap, 0x400000);
    // Put something interesting in OP1
    setOP1ToPi(mem);

    clearVram(mem);
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

    const t0 = Date.now();
    const result = ex.runFrom(cand.addr, 'adl', { maxSteps: 300000, maxLoopIterations: 5000 });
    const ms = Date.now() - t0;
    const stats = vramStats(mem);

    const bboxStr = stats.bbox
      ? `r${stats.bbox.minR}-${stats.bbox.maxR}c${stats.bbox.minC}-${stats.bbox.maxC}`
      : 'none';
    console.log(`${hex(cand.addr)}  ${result.steps.toString().padStart(7)} steps ${ms.toString().padStart(5)}ms  drawn=${stats.drawn.toString().padStart(6)}  fg=${stats.fg.toString().padStart(5)}  bg=${stats.bg.toString().padStart(5)}  bbox=${bboxStr}  term=${result.termination}@${hex(result.lastPc)}  ${cand.desc}`);

    results.push({ ...cand, ...stats, result, ms });
  }

  // Find hits: drawn > 100 AND fg > 20 (some text drawn)
  const hits = results.filter(r => r.drawn > 100 && r.fg > 20);
  console.log(`\n=== Hits (drawn>100 && fg>20): ${hits.length} ===`);
  hits.sort((a, b) => b.fg - a.fg);

  for (const h of hits.slice(0, 5)) {
    console.log(`\n--- ${hex(h.addr)} (${h.desc}) ---`);
    console.log(`drawn=${h.drawn} fg=${h.fg} bg=${h.bg} other=${h.other}`);
    console.log(`bbox: rows ${h.bbox.minR}-${h.bbox.maxR} cols ${h.bbox.minC}-${h.bbox.maxC}`);

    // Re-run the hit with clean snapshot for the ASCII art
    mem.set(snap, 0x400000);
    setOP1ToPi(mem);
    clearVram(mem);
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);
    ex.runFrom(h.addr, 'adl', { maxSteps: 300000, maxLoopIterations: 5000 });

    const r0 = Math.max(0, h.bbox.minR - 2);
    const r1 = Math.min(239, h.bbox.maxR + 2);
    const c0 = Math.max(0, h.bbox.minC - 2);
    const c1 = Math.min(319, h.bbox.maxC + 2);
    console.log(`\nASCII art rows ${r0}-${r1}, cols ${c0}-${c1} stride 2:`);
    console.log(asciiSlice(mem, r0, r1, c0, c1, 2));
  }
}

await main();
