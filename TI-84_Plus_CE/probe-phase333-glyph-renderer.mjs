#!/usr/bin/env node
/**
 * Phase 333 — Glyph Bitmap-to-RGB565 No-Scale Renderer Trace
 *
 * Traces the no-scale path at 0x0536A0 to understand how 1bpp glyph bits
 * become RGB565 pixels in VRAM.
 *
 * 1. Boots to home screen (standard sequence)
 * 2. Dumps glyph bitmap for 'A' from ROM as ASCII art
 * 3. Dumps raw ROM bytes at 0x0536A0 (200 bytes)
 * 4. Traces 0x0536A0 with onBlock callback
 * 5. Traces from caller 0x052569 for full context
 * 6. Reports: fg/bg color source, VRAM write pattern, row iteration logic
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase333-report.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ─── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;

const FONT_BASE = 0x0040EE;
const GLYPH_STRIDE = 28;
const GLYPH_ROWS = 14;
const GLYPH_COLS = 16;

const NO_SCALE_ENTRY = 0x0536A0;
const CALLER_ENTRY = 0x052569;

// RAM addresses from phase 332
const RAM_SCALE_LEVEL = 0xD005EC;
const RAM_FONT_CONFIG = 0xD005ED;
const RAM_SCALE_PTR = 0xD005F0;

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function write24(buf, off, val) {
  buf[off] = val & 0xFF;
  buf[off + 1] = (val >> 8) & 0xFF;
  buf[off + 2] = (val >> 16) & 0xFF;
}

// ─── 1. Boot to home screen ─────────────────────────────────────────────────

console.log('=== Phase 333 — Glyph Bitmap-to-RGB565 No-Scale Renderer Trace ===\n');

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
mem.fill(0xAA, VRAM_BASE, VRAM_BASE + 320 * 240 * 2);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot
executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

for (const entry of STAGE_ENTRIES) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
}

console.log('Boot complete.\n');

// ─── 2. Dump glyph bitmap for 'A' ──────────────────────────────────────────

console.log('--- Glyph bitmap for \'A\' (ASCII 0x41) ---');
const glyphAddr = FONT_BASE + (0x41 - 0x20) * GLYPH_STRIDE;
console.log(`Address: ${hex(glyphAddr)} (FONT_BASE + ${0x41 - 0x20} * ${GLYPH_STRIDE})`);

const glyphBytes = romBytes.slice(glyphAddr, glyphAddr + GLYPH_STRIDE);
console.log(`Raw bytes: ${[...glyphBytes].map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

console.log('\nASCII art (# = set, . = clear):');
const reportLines = ['# Phase 333 — Glyph Bitmap-to-RGB565 No-Scale Renderer Trace\n'];
reportLines.push('## 1. Glyph Bitmap for \'A\'\n');
reportLines.push(`Address: ${hex(glyphAddr)}\n`);
reportLines.push('```');

for (let row = 0; row < GLYPH_ROWS; row++) {
  const b0 = glyphBytes[row * 2];
  const b1 = glyphBytes[row * 2 + 1];
  let line = '';
  for (let col = 0; col < 8; col++) line += ((b0 >> (7 - col)) & 1) ? '#' : '.';
  for (let col = 0; col < 8; col++) line += ((b1 >> (7 - col)) & 1) ? '#' : '.';
  console.log(`  row ${row.toString().padStart(2)}: ${line}  (${hex(b0, 2)} ${hex(b1, 2)})`);
  reportLines.push(`  row ${row.toString().padStart(2)}: ${line}  (${hex(b0, 2)} ${hex(b1, 2)})`);
}
reportLines.push('```\n');
console.log('');

// ─── 3. Dump raw ROM bytes at 0x0536A0 ─────────────────────────────────────

console.log('--- Raw ROM bytes at 0x0536A0 (200 bytes) ---');
reportLines.push('## 2. Raw ROM Bytes at 0x0536A0 (200 bytes)\n');
reportLines.push('```');

const romDump = romBytes.slice(NO_SCALE_ENTRY, NO_SCALE_ENTRY + 200);
for (let i = 0; i < 200; i += 16) {
  const chunk = [...romDump.slice(i, Math.min(i + 16, 200))];
  const hexStr = chunk.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const addr = NO_SCALE_ENTRY + i;
  const line = `${hex(addr)}: ${hexStr}`;
  console.log(`  ${line}`);
  reportLines.push(`  ${line}`);
}
reportLines.push('```\n');
console.log('');

// ─── 4. Dump RAM state before tracing ───────────────────────────────────────

console.log('--- RAM state (font/scale config) ---');
console.log(`  D005EC (scale_level):      ${hex(mem[RAM_SCALE_LEVEL], 2)}`);
console.log(`  D005ED (font_metric_cfg):  ${hex(read24(mem, RAM_FONT_CONFIG))}`);
console.log(`  D005F0 (scale_record_ptr): ${hex(read24(mem, RAM_SCALE_PTR))}`);
console.log(`  D000C6 (bpp_flag):         ${hex(mem[0xD000C6], 2)}`);
console.log('');

reportLines.push('## 3. RAM State After Boot\n');
reportLines.push(`- D005EC (scale_level): ${hex(mem[RAM_SCALE_LEVEL], 2)}`);
reportLines.push(`- D005ED (font_metric_cfg): ${hex(read24(mem, RAM_FONT_CONFIG))}`);
reportLines.push(`- D005F0 (scale_record_ptr): ${hex(read24(mem, RAM_SCALE_PTR))}`);
reportLines.push(`- D000C6 (bpp_flag): ${hex(mem[0xD000C6], 2)}`);
reportLines.push('');

// ─── 5. Trace 0x0536A0 with onBlock ────────────────────────────────────────

console.log('--- Trace: no-scale path at 0x0536A0 (onBlock) ---');
reportLines.push('## 4. Trace: No-Scale Path at 0x0536A0\n');

// First, trace from caller 0x052569 to see full context
console.log('\n--- Trace from caller 0x052569 ---');
reportLines.push('### 4a. Trace from caller 0x052569\n');

{
  // Save state
  const memSnap = new Uint8Array(mem.slice(0xD00000, 0xD50000));

  // Reset CPU for tracing caller
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  const blocksVisited = [];
  const regSnapshots = [];

  try {
    const result = executor.runFrom(CALLER_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 100,
      onBlock: (pc, mode, meta, steps) => {
        const addr = pc & 0xFFFFFF;
        blocksVisited.push(addr);
        regSnapshots.push({
          pc: addr,
          step: steps,
          a: cpu.a,
          f: cpu.f,
          bc: cpu._bc,
          de: cpu._de,
          hl: cpu._hl,
          ix: cpu._ix,
          iy: cpu._iy,
          sp: cpu.sp,
        });
      },
    });

    console.log(`  Caller trace: ${result.steps} steps, ${result.termination}, lastPc=${hex(result.lastPc)}`);
    console.log(`  Blocks visited: ${blocksVisited.length}`);
    reportLines.push(`Caller trace: ${result.steps} steps, ${result.termination}, lastPc=${hex(result.lastPc)}`);
    reportLines.push(`Blocks visited: ${blocksVisited.length}\n`);

    // Show first 50 unique blocks
    const uniqueBlocks = [...new Set(blocksVisited)];
    console.log(`  Unique blocks: ${uniqueBlocks.length}`);
    console.log('  Block addresses (first 50):');
    reportLines.push('Block addresses (first 50):');
    reportLines.push('```');
    for (let i = 0; i < Math.min(uniqueBlocks.length, 50); i++) {
      const line = `    ${hex(uniqueBlocks[i])}`;
      console.log(line);
      reportLines.push(line);
    }
    reportLines.push('```\n');

    // Show reg snapshots for key addresses near 0x0536A0
    console.log('\n  Register snapshots at key blocks:');
    reportLines.push('Register snapshots at key blocks:');
    reportLines.push('```');
    const keyAddrs = [
      0x052569, 0x053396, 0x0533BD, 0x053573, 0x0536A0,
      0x0536A3, 0x0536A6, 0x0536A9, 0x0536B0, 0x0536C0,
      0x0536D0, 0x0536E0, 0x0536F0, 0x053700, 0x053710,
      0x053720, 0x053730, 0x053740, 0x053750,
    ];
    for (const snap of regSnapshots) {
      if (keyAddrs.includes(snap.pc) || snap.pc >= 0x0536A0 && snap.pc <= 0x053800) {
        const line = `  pc=${hex(snap.pc)} step=${snap.step} A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} BC=${hex(snap.bc)} DE=${hex(snap.de)} HL=${hex(snap.hl)} IX=${hex(snap.ix)} IY=${hex(snap.iy)} SP=${hex(snap.sp)}`;
        console.log(`  ${line}`);
        reportLines.push(line);
      }
    }
    reportLines.push('```\n');

    // Check if 0x0536A0 was reached
    const reached0536A0 = blocksVisited.includes(0x0536A0);
    console.log(`\n  Reached 0x0536A0: ${reached0536A0}`);
    reportLines.push(`Reached 0x0536A0: ${reached0536A0}\n`);

  } catch (err) {
    console.log(`  Caller trace error: ${err.message}`);
    reportLines.push(`Caller trace error: ${err.message}\n`);
  }

  // Restore RAM
  mem.set(memSnap, 0xD00000);
}

// ─── 6. Disassemble around 0x0536A0 using ROM bytes ────────────────────────

console.log('\n--- Disassembly context: blocks near 0x0536A0 ---');
reportLines.push('### 4b. Available Blocks Near 0x0536A0\n');

// Check which blocks exist in the transpiled code near 0x0536A0
const nearBlocks = [];
for (let addr = 0x053600; addr <= 0x053800; addr++) {
  if (BLOCKS[addr]) {
    nearBlocks.push(addr);
  }
}
console.log(`  Transpiled blocks in 0x053600-0x053800: ${nearBlocks.length}`);
for (const addr of nearBlocks) {
  console.log(`    ${hex(addr)}`);
}
reportLines.push('Transpiled blocks in 0x053600-0x053800:');
reportLines.push('```');
for (const addr of nearBlocks) {
  reportLines.push(`  ${hex(addr)}`);
}
reportLines.push('```\n');

// ─── 7. Full block trace from 0x053573 ─────────────────────────────────────

console.log('\n--- Trace from 0x053573 (scale_kernel_dispatch) to catch 0x0536A0 path ---');
reportLines.push('### 4c. Trace from 0x053573 (Scale Kernel Dispatch)\n');

{
  // Set up as if we came through the scaler with scale_level=0 (no scaling)
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 100; // Give room for the 71-byte frame
  mem.fill(0xFF, cpu.sp, cpu.sp + 100);

  // Ensure scale level is 0 (identity / no-scale)
  mem[RAM_SCALE_LEVEL] = 0;
  write24(mem, RAM_FONT_CONFIG, 0x000FFF);
  write24(mem, RAM_SCALE_PTR, 0x05320F);

  // Set up IX to point to a fake frame as if 0x0533BD set it up
  const frameBase = 0xD1A700;
  cpu._ix = frameBase;

  // Fill in the IX-relative locals that 0x053573 and 0x0536A0 read:
  // (ix-70) = scale_factor = scale_level + 1 = 1 (triggers no-scale path)
  mem[frameBase - 70] = 1;
  // (ix-71) = half_scale = 0xFF (identity sentinel)
  mem[frameBase - 71] = 0xFF;
  // (ix-3) = glyph bitmap pointer (point to 'A' glyph)
  write24(mem, frameBase - 3, glyphAddr);
  // (ix-6) = adjusted width = 16
  write24(mem, frameBase - 6, 16);
  // (ix-9) = adjusted height = 14
  write24(mem, frameBase - 9, 14);
  // (ix-12) = h_stride = 2 (RGB565 bytes per pixel)
  write24(mem, frameBase - 12, 2);
  // (ix-15) = v_stride = 640 (320 * 2 = VRAM row pitch)
  write24(mem, frameBase - 15, 640);
  // (ix-18) = output base = VRAM_BASE + (100 * 320 + 50) * 2 (arbitrary position)
  const outputBase = VRAM_BASE + (100 * VRAM_WIDTH + 50) * 2;
  write24(mem, frameBase - 18, outputBase);
  // (ix-48) = output row accumulator = 0
  write24(mem, frameBase - 48, 0);
  // (ix-51) = output column / multiply result
  write24(mem, frameBase - 51, 0);
  // (ix-54) = working accumulator = 0
  write24(mem, frameBase - 54, 0);
  // (ix-57) = font_metric_config = 0xFFF
  write24(mem, frameBase - 57, 0x000FFF);

  // Scale kernel pointers for level 0 (all identity)
  write24(mem, frameBase - 60, 0x053182); // vRepeat
  write24(mem, frameBase - 63, 0x053182); // vHeight
  write24(mem, frameBase - 66, 0x053182); // hWidth
  write24(mem, frameBase - 69, 0x053182); // hRepeat

  // Sentinel fill VRAM area around output
  const testVramStart = VRAM_BASE + (95 * VRAM_WIDTH) * 2;
  const testVramEnd = VRAM_BASE + (120 * VRAM_WIDTH) * 2;
  mem.fill(0xAA, testVramStart, testVramEnd);

  // Set up fg/bg colors: check D005E5 (penColor) and D005E3 (bgColor)
  // These are the typical RAM locations for text fg/bg
  console.log('  Pre-trace color state:');
  console.log(`    D005E3 (bg?): ${hex(read24(mem, 0xD005E3))}`);
  console.log(`    D005E5 (fg?): ${hex(read24(mem, 0xD005E5))}`);
  console.log(`    D005E7 (fg2?): ${hex(read24(mem, 0xD005E7))}`);
  console.log(`    D005E9 (vtable?): ${hex(read24(mem, 0xD005E9))}`);

  const blocksVisited = [];
  const regSnaps = [];

  try {
    const result = executor.runFrom(0x053573, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: 200,
      onBlock: (pc, mode, meta, steps) => {
        const addr = pc & 0xFFFFFF;
        blocksVisited.push(addr);
        regSnaps.push({
          pc: addr, step: steps,
          a: cpu.a, f: cpu.f,
          bc: cpu._bc, de: cpu._de, hl: cpu._hl,
          ix: cpu._ix, iy: cpu._iy, sp: cpu.sp,
        });
      },
    });

    console.log(`  Result: ${result.steps} steps, ${result.termination}, lastPc=${hex(result.lastPc)}`);
    reportLines.push(`Result: ${result.steps} steps, ${result.termination}, lastPc=${hex(result.lastPc)}`);

    const uniqueBlocks2 = [...new Set(blocksVisited)];
    console.log(`  Unique blocks: ${uniqueBlocks2.length}`);
    console.log('  All blocks visited:');
    reportLines.push('\nAll blocks visited:');
    reportLines.push('```');
    for (const addr of uniqueBlocks2) {
      const line = `    ${hex(addr)}`;
      console.log(line);
      reportLines.push(line);
    }
    reportLines.push('```\n');

    // Register snapshots for blocks >= 0x0536A0
    console.log('\n  Register snapshots in 0x0536xx range:');
    reportLines.push('Register snapshots in no-scale path:');
    reportLines.push('```');
    for (const snap of regSnaps) {
      if (snap.pc >= 0x053600 && snap.pc <= 0x053900) {
        const line = `  pc=${hex(snap.pc)} step=${snap.step} A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} BC=${hex(snap.bc)} DE=${hex(snap.de)} HL=${hex(snap.hl)} IX=${hex(snap.ix)} SP=${hex(snap.sp)}`;
        console.log(`  ${line}`);
        reportLines.push(line);
      }
    }
    reportLines.push('```\n');

  } catch (err) {
    console.log(`  Trace error: ${err.message}`);
    reportLines.push(`Trace error: ${err.message}\n`);
  }

  // Check VRAM for written pixels
  console.log('\n--- VRAM analysis after trace ---');
  reportLines.push('## 5. VRAM Analysis After Trace\n');

  let writtenPixels = 0;
  let fgPixels = 0;
  let bgPixels = 0;
  const pixelMap = [];

  for (let row = 95; row < 120; row++) {
    const rowPixels = [];
    for (let col = 40; col < 70; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      rowPixels.push(pixel);
      if (pixel !== 0xAAAA) {
        writtenPixels++;
        if (pixel === 0xFFFF) {
          bgPixels++;
        } else {
          fgPixels++;
        }
      }
    }
    pixelMap.push(rowPixels);
  }

  console.log(`  Written pixels: ${writtenPixels} (fg=${fgPixels}, bg=${bgPixels})`);
  reportLines.push(`Written pixels: ${writtenPixels} (fg=${fgPixels}, bg=${bgPixels})\n`);

  // Show pixel map as ASCII art
  if (writtenPixels > 0) {
    console.log('\n  VRAM pixel map (rows 95-119, cols 40-69):');
    console.log('  (# = fg, . = bg, _ = sentinel/unwritten)');
    reportLines.push('VRAM pixel map:');
    reportLines.push('```');
    for (let i = 0; i < pixelMap.length; i++) {
      let line = `  r${(95 + i).toString().padStart(3)}: `;
      for (const pixel of pixelMap[i]) {
        if (pixel === 0xAAAA) line += '_';
        else if (pixel === 0xFFFF) line += '.';
        else if (pixel === 0x0000) line += '#';
        else line += 'X'; // non-black, non-white, non-sentinel
      }
      console.log(line);
      reportLines.push(line);
    }
    reportLines.push('```\n');

    // Show unique pixel values
    const uniquePixels = new Set();
    for (const row of pixelMap) {
      for (const p of row) {
        if (p !== 0xAAAA) uniquePixels.add(p);
      }
    }
    console.log(`\n  Unique written pixel values: ${[...uniquePixels].map(p => hex(p, 4)).join(', ')}`);
    reportLines.push(`Unique written pixel values: ${[...uniquePixels].map(p => hex(p, 4)).join(', ')}\n`);
  }
}

// ─── 8. Scan VRAM more broadly for any writes from the first trace ──────────

console.log('\n--- Broad VRAM scan for any non-sentinel pixels ---');
reportLines.push('## 6. Broad VRAM Scan\n');

{
  let totalNonSentinel = 0;
  let firstNonSentRow = -1;
  let lastNonSentRow = -1;
  const rowCounts = {};

  for (let row = 0; row < 240; row++) {
    let count = 0;
    for (let col = 0; col < 320; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== 0xAAAA) count++;
    }
    if (count > 0) {
      totalNonSentinel += count;
      if (firstNonSentRow === -1) firstNonSentRow = row;
      lastNonSentRow = row;
      rowCounts[row] = count;
    }
  }

  console.log(`  Total non-sentinel pixels: ${totalNonSentinel}`);
  console.log(`  Row range: ${firstNonSentRow} to ${lastNonSentRow}`);
  reportLines.push(`Total non-sentinel pixels: ${totalNonSentinel}`);
  reportLines.push(`Row range: ${firstNonSentRow} to ${lastNonSentRow}`);

  // Show rows with non-sentinel pixels
  const rowEntries = Object.entries(rowCounts).slice(0, 30);
  if (rowEntries.length > 0) {
    console.log('  Rows with drawn pixels (first 30):');
    reportLines.push('\nRows with drawn pixels (first 30):');
    reportLines.push('```');
    for (const [row, count] of rowEntries) {
      const line = `    row ${row}: ${count} pixels`;
      console.log(line);
      reportLines.push(line);
    }
    reportLines.push('```\n');
  }
}

// ─── 9. Dump key ROM bytes for disassembly context ──────────────────────────

console.log('\n--- Key address disassembly hints ---');
reportLines.push('## 7. Disassembly Hints for 0x0536A0\n');

// Dump 400 bytes from 0x0536A0 for more context
console.log('  Extended ROM dump at 0x0536A0 (400 bytes):');
reportLines.push('Extended ROM dump (400 bytes):');
reportLines.push('```');
for (let i = 0; i < 400; i += 16) {
  const base = NO_SCALE_ENTRY + i;
  const bytes = [];
  for (let j = 0; j < 16 && i + j < 400; j++) {
    bytes.push(romBytes[base + j].toString(16).padStart(2, '0'));
  }
  const line = `  ${hex(base)}: ${bytes.join(' ')}`;
  console.log(line);
  reportLines.push(line);
}
reportLines.push('```\n');

// Dump the caller 0x052569 context
console.log('\n  ROM dump at caller 0x052569 (128 bytes):');
reportLines.push('ROM dump at caller 0x052569 (128 bytes):');
reportLines.push('```');
for (let i = 0; i < 128; i += 16) {
  const base = CALLER_ENTRY + i;
  const bytes = [];
  for (let j = 0; j < 16; j++) {
    bytes.push(romBytes[base + j].toString(16).padStart(2, '0'));
  }
  const line = `  ${hex(base)}: ${bytes.join(' ')}`;
  console.log(line);
  reportLines.push(line);
}
reportLines.push('```\n');

// ─── 10. Check fg/bg color RAM locations ────────────────────────────────────

console.log('\n--- Color RAM state survey ---');
reportLines.push('## 8. Color RAM State Survey\n');

// Survey various known/suspected color RAM addresses
const colorAddrs = [
  [0xD005E0, 'D005E0 (penRow?)'],
  [0xD005E1, 'D005E1'],
  [0xD005E2, 'D005E2'],
  [0xD005E3, 'D005E3 (bgColor lo?)'],
  [0xD005E4, 'D005E4 (bgColor hi?)'],
  [0xD005E5, 'D005E5 (fgColor lo?)'],
  [0xD005E6, 'D005E6 (fgColor hi?)'],
  [0xD005E7, 'D005E7'],
  [0xD005E8, 'D005E8'],
  [0xD005E9, 'D005E9 (vtable lo)'],
  [0xD005EA, 'D005EA (vtable mid)'],
  [0xD005EB, 'D005EB (vtable hi)'],
  [0xD000C6, 'D000C6 (bpp_flag)'],
];

reportLines.push('```');
for (const [addr, label] of colorAddrs) {
  const val = mem[addr];
  const line = `  ${label}: ${hex(val, 2)}`;
  console.log(line);
  reportLines.push(line);
}

// Also dump D005E0-D005FF as a block
console.log('\n  Block dump D005E0-D005FF:');
reportLines.push('\nBlock dump D005E0-D005FF:');
const blockDump = [];
for (let i = 0; i < 32; i++) {
  blockDump.push(mem[0xD005E0 + i].toString(16).padStart(2, '0'));
}
const bdLine = `  ${blockDump.join(' ')}`;
console.log(bdLine);
reportLines.push(bdLine);
reportLines.push('```\n');

// Check the known TI-OS penCol/penRow/drawFg/drawBg addresses
// SDK docs: penCol = D008D2 (2 bytes), penRow = D008D5 (1 byte)
// drawFgColor = D02688 (2 bytes, RGB565), drawBgColor = D0268A (2 bytes, RGB565)
console.log('\n  SDK-documented color addresses:');
reportLines.push('SDK-documented color addresses:');
reportLines.push('```');
const sdkAddrs = [
  [0xD008D2, 2, 'penCol'],
  [0xD008D5, 1, 'penRow'],
  [0xD02688, 2, 'drawFgColor (RGB565)'],
  [0xD0268A, 2, 'drawBgColor (RGB565)'],
  [0xD02694, 2, 'textFGColor (RGB565)'],
  [0xD02696, 2, 'textBGColor (RGB565)'],
];

for (const [addr, size, label] of sdkAddrs) {
  let val;
  if (size === 1) val = mem[addr];
  else val = mem[addr] | (mem[addr + 1] << 8);
  const line = `  ${hex(addr)}: ${hex(val, size * 2)} (${label})`;
  console.log(line);
  reportLines.push(line);
}
reportLines.push('```\n');

// ─── Write report ───────────────────────────────────────────────────────────

const report = reportLines.join('\n') + '\n';
fs.writeFileSync(REPORT_PATH, report);
console.log(`\nReport written to ${REPORT_PATH}`);
console.log('\n=== Phase 333 complete ===');
