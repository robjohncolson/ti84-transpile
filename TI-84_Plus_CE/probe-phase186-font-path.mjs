#!/usr/bin/env node
/**
 * Phase 186 — Font Record Pointer / VRAM Writer Investigation
 *
 * Investigates WHY the VRAM writer produces degenerate output (identical blocks
 * for every character) even when the display buffer at D006C0 has real ASCII.
 *
 * Parts:
 *   A — Trace VRAM writes during stage 3, group by character position
 *   B — Trace reads from D00585-D00587 during rendering
 *   C — Trace glyph buffer writes at D005A1-D005BD
 *   D — Experiment with font pointer seeding at D00585
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase186-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

/* ── Constants ──────────────────────────────────────────────── */

const MEM_SIZE        = 0x1000000;
const VRAM_BASE       = 0xD40000;
const VRAM_WIDTH      = 320;
const VRAM_HEIGHT     = 240;
const VRAM_BYTE_SIZE  = VRAM_WIDTH * VRAM_HEIGHT * 2;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY   = 0x0802B2;
const STAGE_3_ENTRY     = 0x0A29EC;

const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_START    = 0xD020A6;
const MODE_BUF_LEN      = 26;
const MODE_BUF_TEXT     = 'Normal Float Radian       ';

const FONT_PTR_ADDR     = 0xD00585;  // 3-byte font record pointer
const GLYPH_BUF_START   = 0xD005A1;
const GLYPH_BUF_LEN     = 28;       // 28 bytes per glyph
const GLYPH_BUF_END     = GLYPH_BUF_START + GLYPH_BUF_LEN - 1;

const FONT_BASE_ROM     = 0x0040EE;  // real font table in ROM
const FONT_BASE_HARDCODED = 0x003D6E; // hardcoded base from Phase 167

const DISPLAY_TEXT      = 'ABCDE';   // 5 different chars to seed

/* ── Helpers ────────────────────────────────────────────────── */

const reportLines = [];

function log(line = '') {
  console.log(line);
  reportLines.push(line);
}

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hex2(value) { return hex(value, 2); }

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

/* ── Boot sequence (shared) ─────────────────────────────────── */

function buildFreshSystem() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  // Kernel init (943-step OS init)
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  // Post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return { mem, executor, cpu };
}

function snapshotCpu(cpu) {
  const fields = [
    'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
    'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
  ];
  return Object.fromEntries(fields.map(f => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedDisplayBuffer(mem, text) {
  // Zero the full display buffer line first (26 chars)
  mem.fill(0x00, DISPLAY_BUF_START, DISPLAY_BUF_START + MODE_BUF_LEN);
  for (let i = 0; i < text.length; i++) {
    mem[DISPLAY_BUF_START + i] = text.charCodeAt(i);
  }
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

function dumpBytes(mem, start, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(mem[start + i]);
  }
  return bytes;
}

function formatBytes(bytes) {
  return bytes.map(b => hex2(b)).join(' ');
}

/* ── PART A: Trace VRAM writes during stage 3 ──────────────── */

function partA(mem, executor, cpu, cpuSnap) {
  log('');
  log('========================================');
  log('PART A — Trace VRAM writes during stage 3');
  log('========================================');

  // Restore state
  mem.fill(0x00, 0x400000, 0xE00000); // clear RAM area
  mem.set(romBytes.slice(0, 0x400000), 0); // ensure ROM intact
  clearVram(mem);

  // Re-build from scratch for clean state
  // Actually, just restore from snapshot
  restoreCpu(cpu, cpuSnap, mem);
  clearVram(mem);
  seedDisplayBuffer(mem, DISPLAY_TEXT);
  seedModeBuffer(mem);

  log(`Display buffer seeded: "${DISPLAY_TEXT}"`);
  log(`Display buffer bytes: ${formatBytes(dumpBytes(mem, DISPLAY_BUF_START, 10))}`);
  log(`Mode buffer seeded: "${MODE_BUF_TEXT}"`);

  // Hook write8/write16/write24 to capture VRAM writes
  const vramWrites = [];
  let currentPc = 0;
  let stepCount = 0;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordVramByte(addr, value) {
    if (addr < VRAM_BASE || addr >= VRAM_BASE + VRAM_BYTE_SIZE) return;
    const byteOffset = addr - VRAM_BASE;
    const pixelIndex = Math.floor(byteOffset / 2);
    const row = Math.floor(pixelIndex / VRAM_WIDTH);
    const col = pixelIndex % VRAM_WIDTH;
    vramWrites.push({
      pc: currentPc,
      addr,
      byteOffset,
      row,
      col,
      value: value & 0xFF,
      step: stepCount,
      isHighByte: (byteOffset % 2) === 1,
    });
  }

  cpu.write8 = (addr, value) => {
    recordVramByte(addr, value);
    return origWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    recordVramByte(addr, value & 0xFF);
    recordVramByte(addr + 1, (value >> 8) & 0xFF);
    return origWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    recordVramByte(addr, value & 0xFF);
    recordVramByte(addr + 1, (value >> 8) & 0xFF);
    recordVramByte(addr + 2, (value >> 16) & 0xFF);
    return origWrite24(addr, value);
  };

  const result = executor.runFrom(STAGE_3_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      currentPc = pc;
      stepCount = steps;
    },
  });

  // Restore original methods
  cpu.write8 = origWrite8;
  cpu.write16 = origWrite16;
  cpu.write24 = origWrite24;

  log(`Stage 3 result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  log(`Total VRAM writes: ${vramWrites.length}`);

  // Filter to text strip region (rows 37-52 based on Phase 150)
  const textRowStart = 30;
  const textRowEnd = 55;
  const textWrites = vramWrites.filter(w => w.row >= textRowStart && w.row <= textRowEnd);
  log(`VRAM writes in text strip rows ${textRowStart}-${textRowEnd}: ${textWrites.length}`);

  // Group by character position (stride 12 pixels starting at col 2)
  const charStride = 12;
  const charStartCol = 0;
  const charPositions = new Map(); // charIndex -> writes[]

  for (const w of textWrites) {
    const charIndex = Math.floor((w.col - charStartCol) / charStride);
    if (!charPositions.has(charIndex)) charPositions.set(charIndex, []);
    charPositions.get(charIndex).push(w);
  }

  log(`\nVRAM writes grouped by character position (stride ${charStride}):`);
  for (const [charIdx, writes] of [...charPositions.entries()].sort((a, b) => a[0] - b[0]).slice(0, 10)) {
    const uniquePcs = [...new Set(writes.map(w => w.pc))];
    const uniqueValues = [...new Set(writes.map(w => w.value))];
    const rows = [...new Set(writes.map(w => w.row))].sort((a, b) => a - b);
    log(`  char[${charIdx}]: ${writes.length} writes, rows ${rows[0]}-${rows[rows.length - 1]}, ` +
        `uniqueValues=${uniqueValues.length} (${uniqueValues.slice(0, 8).map(v => hex2(v)).join(' ')}), ` +
        `PCs: ${uniquePcs.map(p => hex(p)).join(', ')}`);
  }

  // Build pixel pattern hashes per character to check if they differ
  log(`\nPixel patterns per character (first 5 chars):`);
  for (let ci = 0; ci < 5; ci++) {
    const writes = charPositions.get(ci) || [];
    // Reconstruct pixel data from writes
    const pixelMap = new Map(); // "row,col" -> [lowByte, highByte]
    for (const w of writes) {
      const key = `${w.row},${w.col}`;
      if (!pixelMap.has(key)) pixelMap.set(key, [0, 0]);
      const pair = pixelMap.get(key);
      if (w.isHighByte) {
        pair[1] = w.value;
      } else {
        pair[0] = w.value;
      }
    }

    // Count unique pixel values
    const pixelValues = [...pixelMap.values()].map(([lo, hi]) => (hi << 8) | lo);
    const uniquePixels = [...new Set(pixelValues)];
    const fgCount = pixelValues.filter(p => p !== 0xFFFF && p !== 0xAAAA).length;

    // Build a simple hash of all writes for comparison
    const sortedWrites = writes.slice().sort((a, b) => a.addr - b.addr);
    const hash = sortedWrites.map(w => `${w.row - textRowStart},${w.col - ci * charStride}:${hex2(w.value)}`).join('|');
    const hashShort = hash.length > 120 ? hash.slice(0, 120) + '...' : hash;

    log(`  char[${ci}] '${DISPLAY_TEXT[ci] || '?'}': ` +
        `pixels=${pixelMap.size} fg=${fgCount} uniquePixelVals=${uniquePixels.length} ` +
        `(${uniquePixels.slice(0, 5).map(v => hex(v, 4)).join(' ')})`);
  }

  // Compare first 5 chars pairwise
  log(`\nPairwise pattern comparison (first 5 chars):`);
  const charHashes = [];
  for (let ci = 0; ci < 5; ci++) {
    const writes = (charPositions.get(ci) || []).slice().sort((a, b) => a.addr - b.addr);
    // Normalize positions relative to character origin
    const normalized = writes.map(w => ({
      relRow: w.row - textRowStart,
      relCol: w.col - ci * charStride,
      value: w.value,
    }));
    charHashes.push(JSON.stringify(normalized));
  }
  for (let i = 0; i < charHashes.length; i++) {
    for (let j = i + 1; j < charHashes.length; j++) {
      const same = charHashes[i] === charHashes[j];
      log(`  char[${i}] vs char[${j}]: ${same ? 'IDENTICAL' : 'DIFFERENT'}`);
    }
  }

  // Also log first 20 VRAM writes with full detail
  log(`\nFirst 30 VRAM writes (raw):`);
  for (const w of vramWrites.slice(0, 30)) {
    log(`  step=${w.step} pc=${hex(w.pc)} row=${w.row} col=${w.col} val=${hex2(w.value)} hi=${w.isHighByte}`);
  }

  // Count total fg pixels in text region after stage 3
  let fgPixels = 0;
  for (let r = textRowStart; r <= textRowEnd; r++) {
    for (let c = 0; c < VRAM_WIDTH; c++) {
      const p = readPixel(mem, r, c);
      if (p !== 0xAAAA && p !== 0xFFFF) fgPixels++;
    }
  }
  log(`\nFg pixels in text strip after stage 3: ${fgPixels}`);

  return { vramWrites, result };
}

/* ── PART B: Trace D00585 reads ─────────────────────────────── */

function partB(mem, executor, cpu, cpuSnap, ramSnap) {
  log('');
  log('========================================');
  log('PART B — Trace D00585 reads during rendering');
  log('========================================');

  // Fresh restore
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);
  seedDisplayBuffer(mem, DISPLAY_TEXT);
  seedModeBuffer(mem);

  // Show current value at D00585
  const ptrBefore = dumpBytes(mem, FONT_PTR_ADDR, 6);
  log(`D00585-D0058A before stage 3: ${formatBytes(ptrBefore)}`);

  // Wrap read8 to trap reads from D00585-D00587
  const fontPtrReads = [];
  let currentPc = 0;
  let stepCount = 0;

  const origRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    if (addr >= FONT_PTR_ADDR && addr <= FONT_PTR_ADDR + 2) {
      fontPtrReads.push({
        pc: currentPc,
        addr,
        value,
        step: stepCount,
        offset: addr - FONT_PTR_ADDR,
      });
    }
    return value;
  };

  const result = executor.runFrom(STAGE_3_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      currentPc = pc;
      stepCount = steps;
    },
  });

  cpu.read8 = origRead8;

  log(`Stage 3 result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  log(`Reads from D00585-D00587: ${fontPtrReads.length}`);

  if (fontPtrReads.length > 0) {
    log('Font pointer reads detected!');
    // Show first 50 reads
    for (const r of fontPtrReads.slice(0, 50)) {
      log(`  step=${r.step} pc=${hex(r.pc)} addr=${hex(r.addr)} offset=${r.offset} value=${hex2(r.value)}`);
    }
    // Unique PCs
    const uniquePcs = [...new Set(fontPtrReads.map(r => r.pc))];
    log(`Unique PCs reading D00585: ${uniquePcs.map(p => hex(p)).join(', ')}`);
  } else {
    log('NO reads from D00585-D00587 during stage 3.');
    log('This confirms Phase 167: the font chain does NOT use D00585.');
  }

  // Also check D00588-D0058A (secondary pointer?)
  const fontPtrReads2 = [];
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);
  seedDisplayBuffer(mem, DISPLAY_TEXT);
  seedModeBuffer(mem);

  const origRead8b = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const value = origRead8b(addr);
    if (addr >= FONT_PTR_ADDR + 3 && addr <= FONT_PTR_ADDR + 5) {
      fontPtrReads2.push({ pc: currentPc, addr, value, step: stepCount });
    }
    return value;
  };

  executor.runFrom(STAGE_3_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) { currentPc = pc; stepCount = steps; },
  });

  cpu.read8 = origRead8b;

  log(`Reads from D00588-D0058A: ${fontPtrReads2.length}`);
  if (fontPtrReads2.length > 0) {
    for (const r of fontPtrReads2.slice(0, 20)) {
      log(`  step=${r.step} pc=${hex(r.pc)} addr=${hex(r.addr)} value=${hex2(r.value)}`);
    }
  }

  return { fontPtrReads };
}

/* ── PART C: Trace glyph buffer writes ──────────────────────── */

function partC(mem, executor, cpu, cpuSnap, ramSnap) {
  log('');
  log('========================================');
  log('PART C — Trace glyph buffer writes at D005A1');
  log('========================================');

  // Fresh restore
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);
  seedDisplayBuffer(mem, DISPLAY_TEXT);
  seedModeBuffer(mem);

  // Zero out glyph buffer before stage 3
  mem.fill(0x00, GLYPH_BUF_START, GLYPH_BUF_START + GLYPH_BUF_LEN);
  log(`Glyph buffer zeroed: ${hex(GLYPH_BUF_START)}-${hex(GLYPH_BUF_END)}`);
  log(`Display buffer: ${formatBytes(dumpBytes(mem, DISPLAY_BUF_START, 10))}`);

  // Hook writes to glyph buffer
  const glyphWrites = [];
  let currentPc = 0;
  let stepCount = 0;
  let glyphSnapshots = []; // snapshot glyph buffer at key moments

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordGlyphByte(addr, value) {
    if (addr < GLYPH_BUF_START || addr > GLYPH_BUF_END) return;
    glyphWrites.push({
      pc: currentPc,
      addr,
      offset: addr - GLYPH_BUF_START,
      value: value & 0xFF,
      step: stepCount,
    });
  }

  cpu.write8 = (addr, value) => {
    recordGlyphByte(addr, value);
    return origWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    recordGlyphByte(addr, value & 0xFF);
    recordGlyphByte(addr + 1, (value >> 8) & 0xFF);
    return origWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    recordGlyphByte(addr, value & 0xFF);
    recordGlyphByte(addr + 1, (value >> 8) & 0xFF);
    recordGlyphByte(addr + 2, (value >> 16) & 0xFF);
    return origWrite24(addr, value);
  };

  // Track how many times the glyph buffer has been fully written
  // and snapshot each time we see offset 0 being written
  let lastOffset0Step = -1;

  const result = executor.runFrom(STAGE_3_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      currentPc = pc;
      stepCount = steps;
    },
  });

  // Restore
  cpu.write8 = origWrite8;
  cpu.write16 = origWrite16;
  cpu.write24 = origWrite24;

  log(`Stage 3 result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  log(`Total glyph buffer writes: ${glyphWrites.length}`);

  // Group writes by "fill round" — each time offset 0 is written starts a new round
  const rounds = [];
  let currentRound = null;

  for (const w of glyphWrites) {
    if (w.offset === 0) {
      if (currentRound) rounds.push(currentRound);
      currentRound = { startStep: w.step, startPc: w.pc, writes: [] };
    }
    if (currentRound) currentRound.writes.push(w);
  }
  if (currentRound) rounds.push(currentRound);

  log(`Glyph buffer fill rounds: ${rounds.length}`);

  for (let ri = 0; ri < Math.min(rounds.length, 10); ri++) {
    const round = rounds[ri];
    const bytes = new Uint8Array(GLYPH_BUF_LEN);
    for (const w of round.writes) {
      if (w.offset >= 0 && w.offset < GLYPH_BUF_LEN) {
        bytes[w.offset] = w.value;
      }
    }
    const uniquePcs = [...new Set(round.writes.map(w => w.pc))];
    log(`  round[${ri}]: step=${round.startStep} pc=${hex(round.startPc)} writes=${round.writes.length} ` +
        `PCs: ${uniquePcs.map(p => hex(p)).join(', ')}`);
    log(`    bytes: ${formatBytes(Array.from(bytes))}`);
  }

  // Compare round data to check if different chars get different bitmaps
  log(`\nRound-by-round bitmap comparison:`);
  const roundHashes = rounds.map((round, i) => {
    const bytes = new Uint8Array(GLYPH_BUF_LEN);
    for (const w of round.writes) {
      if (w.offset >= 0 && w.offset < GLYPH_BUF_LEN) {
        bytes[w.offset] = w.value;
      }
    }
    return Array.from(bytes).join(',');
  });

  for (let i = 0; i < roundHashes.length; i++) {
    for (let j = i + 1; j < roundHashes.length; j++) {
      const same = roundHashes[i] === roundHashes[j];
      log(`  round[${i}] vs round[${j}]: ${same ? 'IDENTICAL' : 'DIFFERENT'}`);
    }
  }

  // Check what's at D00585 after stage 3
  const ptrAfter = dumpBytes(mem, FONT_PTR_ADDR, 6);
  log(`\nD00585-D0058A after stage 3: ${formatBytes(ptrAfter)}`);

  // Check glyph buffer final state
  const finalGlyph = dumpBytes(mem, GLYPH_BUF_START, GLYPH_BUF_LEN);
  log(`Glyph buffer final: ${formatBytes(finalGlyph)}`);

  return { glyphWrites, rounds };
}

/* ── PART D: Font pointer seeding experiments ───────────────── */

function partD(mem, executor, cpu, cpuSnap, ramSnap) {
  log('');
  log('========================================');
  log('PART D — Font pointer seeding experiments');
  log('========================================');

  // First: baseline (no seeding) — count fg pixels in text strip
  function runAndCountFg(label, seedFn) {
    mem.set(ramSnap, 0x400000);
    clearVram(mem);
    restoreCpu(cpu, cpuSnap, mem);
    seedDisplayBuffer(mem, DISPLAY_TEXT);
    seedModeBuffer(mem);

    if (seedFn) seedFn(mem);

    const ptrVal = dumpBytes(mem, FONT_PTR_ADDR, 6);
    log(`\n${label}:`);
    log(`  D00585-D0058A: ${formatBytes(ptrVal)}`);

    const result = executor.runFrom(STAGE_3_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });

    log(`  stage 3: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);

    // Count fg pixels in the text strip (rows 30-55)
    let fgCount = 0;
    let whiteCount = 0;
    let sentinelCount = 0;
    for (let r = 30; r <= 55; r++) {
      for (let c = 0; c < VRAM_WIDTH; c++) {
        const p = readPixel(mem, r, c);
        if (p === 0xAAAA) sentinelCount++;
        else if (p === 0xFFFF) whiteCount++;
        else fgCount++;
      }
    }

    log(`  text strip fg=${fgCount} white=${whiteCount} sentinel=${sentinelCount}`);

    // Also check overall VRAM fg
    let totalFg = 0;
    for (let r = 0; r < VRAM_HEIGHT; r++) {
      for (let c = 0; c < VRAM_WIDTH; c++) {
        const p = readPixel(mem, r, c);
        if (p !== 0xAAAA && p !== 0xFFFF) totalFg++;
      }
    }
    log(`  total VRAM fg=${totalFg}`);

    return { fgCount, whiteCount, totalFg, label };
  }

  const baseline = runAndCountFg('Baseline (no seed)', null);

  // Seed D00585 = 0x0040EE (real font table, 24-bit LE)
  const seed1 = runAndCountFg('Seed D00585=0x0040EE', (mem) => {
    mem[FONT_PTR_ADDR + 0] = 0xEE;
    mem[FONT_PTR_ADDR + 1] = 0x40;
    mem[FONT_PTR_ADDR + 2] = 0x00;
  });

  // Seed D00585 = 0x0040EE AND D00588 = 0x0040EE
  const seed2 = runAndCountFg('Seed D00585=0x0040EE + D00588=0x0040EE', (mem) => {
    mem[FONT_PTR_ADDR + 0] = 0xEE;
    mem[FONT_PTR_ADDR + 1] = 0x40;
    mem[FONT_PTR_ADDR + 2] = 0x00;
    mem[FONT_PTR_ADDR + 3] = 0xEE;
    mem[FONT_PTR_ADDR + 4] = 0x40;
    mem[FONT_PTR_ADDR + 5] = 0x00;
  });

  // Seed D00585 = 0x003D6E (the hardcoded base)
  const seed3 = runAndCountFg('Seed D00585=0x003D6E', (mem) => {
    mem[FONT_PTR_ADDR + 0] = 0x6E;
    mem[FONT_PTR_ADDR + 1] = 0x3D;
    mem[FONT_PTR_ADDR + 2] = 0x00;
  });

  // Compare results
  log('\n--- Comparison ---');
  const all = [baseline, seed1, seed2, seed3];
  for (const r of all) {
    log(`  ${r.label}: textFg=${r.fgCount} totalFg=${r.totalFg}`);
  }

  // Check if any seed changed the fg count
  for (const r of [seed1, seed2, seed3]) {
    const delta = r.fgCount - baseline.fgCount;
    log(`  Delta from baseline for "${r.label}": ${delta > 0 ? '+' : ''}${delta}`);
  }

  return { baseline, seed1, seed2, seed3 };
}

/* ── MAIN ───────────────────────────────────────────────────── */

async function main() {
  log('=== Phase 186 — Font Record Pointer / VRAM Writer Investigation ===');
  log(`Date: ${new Date().toISOString()}`);
  log('');

  const { mem, executor, cpu } = buildFreshSystem();
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  log(`System booted. D00585 after init: ${formatBytes(dumpBytes(mem, FONT_PTR_ADDR, 6))}`);

  // Run all parts
  partA(mem, executor, cpu, cpuSnap);
  partB(mem, executor, cpu, cpuSnap, ramSnap);
  partC(mem, executor, cpu, cpuSnap, ramSnap);
  partD(mem, executor, cpu, cpuSnap, ramSnap);

  // Summary
  log('');
  log('========================================');
  log('SUMMARY');
  log('========================================');
  log('See detailed output above for each part.');

  // Write report
  const reportMd = [
    '# Phase 186 Report — Font Record Pointer / VRAM Writer Investigation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Console Output',
    '',
    '```',
    ...reportLines,
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_PATH, reportMd);
  log(`\nReport written to: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error('FATAL ERROR:', error.stack || error);
  const errorReport = [
    '# Phase 186 Report — FAILURE',
    '',
    '```',
    error.stack || String(error),
    '```',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, errorReport);
  process.exitCode = 1;
}
