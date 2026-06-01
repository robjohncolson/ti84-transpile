#!/usr/bin/env node
/**
 * probe-phase486-cursor-glyph-shapes.mjs
 *
 * Capture pixel grids for all 3 cursor glyph styles on the TI-84 Plus CE.
 *
 * The cursor glyph selector at 0x030202 returns one of three codes based
 * on D00092 bits 3/4/5:
 *   D00092=0x08 (bit 3) → 0xE1 thin cursor
 *   D00092=0x10 (bit 4) → 0xE2 underline cursor
 *   D00092=0x30 (bits 4+5) → 0xE3 block cursor
 *
 * For each style we reset VRAM to white, set D00092, run the idle loop,
 * and capture the VRAM diff as a pixel grid.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const VRAM_SIZE = VRAM_END - VRAM_START;
const ROW_STRIDE = 0x280; // 640 bytes per row (320 pixels * 2 bytes)
const IDLE_ENTRY = 0x02FDBE;
const STACK_RESET_TOP = 0xD1A87E;
const MAX_IDLE_STEPS = 200000;
const MAX_IDLE_LOOPS = 5;
const RET_POINTS = new Set([0x02FE21]);

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
const hex2 = (v) => hex(v & 0xFF, 2);

// ========== Load ROM and transpiled blocks ==========
const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function write24(addr, val) {
  mem[addr & 0xFFFFFF] = val & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (val >>> 16) & 0xFF;
}

// ========== BOOT ==========
console.log('Phase 486: Cursor glyph shapes probe (all 3 styles)');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');
console.log('');

// ========== Experiments ==========
const experiments = [
  { d00092: 0x08, name: 'thin cursor', expectedGlyph: '0xE1' },
  { d00092: 0x10, name: 'underline cursor', expectedGlyph: '0xE2' },
  { d00092: 0x30, name: 'block cursor', expectedGlyph: '0xE3' },
];

const results = [];

for (const exp of experiments) {
  console.log('='.repeat(60));
  console.log(`EXPERIMENT: D00092=${hex2(exp.d00092)} — ${exp.name} (expected ${exp.expectedGlyph})`);
  console.log('='.repeat(60));

  // Reset VRAM to white (0xFF)
  mem.fill(0xFF, VRAM_START, VRAM_END);

  // Set up idle loop state
  mem[0xD00000] = 0x00;       // idle path
  mem[0xD00092] = exp.d00092; // cursor style bits
  mem[0xD000C6] |= 0x01;     // display flag
  mem[0xD00089] |= 0x10;     // bit 4 — display path
  mem[0xD00080] = 0x18;      // bits 3+4
  mem[0xD00095] = 0x00;      // clear cursor state
  mem[0xD00595] = 0x00;      // cursor position row
  mem[0xD00596] = 0x00;      // cursor position col
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Set up stack with sentinel
  const sentinelSp = STACK_RESET_TOP - 3;
  cpu.sp = sentinelSp;
  write24(sentinelSp, IDLE_ENTRY);

  // Run idle loop
  let loopCount = 0;
  const result = executor.runFrom(IDLE_ENTRY, 'adl', {
    maxSteps: MAX_IDLE_STEPS,
    maxLoopIterations: 200000,
    onBlock: (pc) => {
      const masked = pc & 0xFFFFFF;

      // End of one loop iteration
      if (RET_POINTS.has(masked)) {
        loopCount++;
        if (loopCount >= MAX_IDLE_LOOPS) {
          return 'stop';
        }

        // Reset for next iteration
        cpu.sp = sentinelSp;
        write24(sentinelSp, IDLE_ENTRY);

        // Refresh flags
        mem[0xD000C6] |= 0x01;
        mem[0xD00089] |= 0x10;
        mem[0xD00000] = 0x00;
      }

      // Re-entering idle loop head — refresh flags
      if (masked === IDLE_ENTRY) {
        mem[0xD000C6] |= 0x01;
        mem[0xD00089] |= 0x10;
        mem[0xD00000] = 0x00;
      }
    },
  });

  const totalSteps = result.steps ?? 0;
  console.log(`Idle loop iterations: ${loopCount}, steps: ${totalSteps}`);

  // Analyze VRAM diff (compare against 0xFF background)
  const changes = [];
  for (let offset = 0; offset < VRAM_SIZE; offset++) {
    if (mem[VRAM_START + offset] !== 0xFF) {
      const row = Math.floor(offset / ROW_STRIDE);
      const byteInRow = offset % ROW_STRIDE;
      changes.push({
        addr: VRAM_START + offset,
        offset,
        row,
        byteInRow,
        col: Math.floor(byteInRow / 2),
        lane: offset % 2,
        newVal: mem[VRAM_START + offset],
      });
    }
  }

  console.log(`Total VRAM bytes changed: ${changes.length}`);

  if (changes.length > 0) {
    const firstAddr = changes[0].addr;
    const lastAddr = changes[changes.length - 1].addr;
    console.log(`VRAM range: ${hex(firstAddr)} - ${hex(lastAddr)}`);

    // Pixel grid
    const allRows = [...new Set(changes.map((c) => c.row))].sort((a, b) => a - b);
    const allCols = [...new Set(changes.map((c) => c.col))].sort((a, b) => a - b);
    const minRow = allRows[0];
    const maxRow = allRows[allRows.length - 1];
    const minCol = allCols[0];
    const maxCol = allCols[allCols.length - 1];
    const height = maxRow - minRow + 1;
    const width = maxCol - minCol + 1;
    const pixelSet = new Set(changes.map((c) => `${c.row}:${c.col}`));
    const pixelCount = pixelSet.size;

    console.log(`Bounding box: rows ${minRow}-${maxRow} (${height} rows), cols ${minCol}-${maxCol} (${width} cols)`);
    console.log(`Unique pixels changed: ${pixelCount}`);

    if (width <= 96 && height <= 64) {
      console.log('');
      console.log('Pixel grid (# = changed pixel):');
      for (let row = minRow; row <= maxRow; row++) {
        let line = '';
        for (let col = minCol; col <= maxCol; col++) {
          line += pixelSet.has(`${row}:${col}`) ? '#' : '.';
        }
        console.log(`  r${String(row).padStart(3, ' ')} ${line}`);
      }
    }

    // 16bpp pixel values
    if (width <= 24) {
      const pixelMap = new Map();
      for (const c of changes) {
        const key = `${c.row}:${c.col}`;
        if (!pixelMap.has(key)) {
          const pixelBase = VRAM_START + c.row * ROW_STRIDE + c.col * 2;
          pixelMap.set(key, {
            row: c.row,
            col: c.col,
            val16: mem[pixelBase] | (mem[pixelBase + 1] << 8),
          });
        }
      }

      const uniqueVals = [...new Set([...pixelMap.values()].map((p) => p.val16))].sort((a, b) => a - b);
      console.log('');
      console.log(`Unique 16bpp pixel values: ${uniqueVals.map((v) => hex(v, 4)).join(', ')}`);
    }

    results.push({ name: exp.name, glyph: exp.expectedGlyph, d00092: exp.d00092, width, height, pixelCount, pixelSet, minRow, maxRow, minCol, maxCol });
  } else {
    console.log('No VRAM bytes changed — cursor rendering did not fire.');
    console.log(`D00092 final: ${hex2(mem[0xD00092])}`);
    console.log(`D000C6 final: ${hex2(mem[0xD000C6])}`);
    console.log(`D00089 final: ${hex2(mem[0xD00089])}`);
    results.push({ name: exp.name, glyph: exp.expectedGlyph, d00092: exp.d00092, width: 0, height: 0, pixelCount: 0 });
  }

  console.log('');
}

// ========== Summary ==========
console.log('='.repeat(60));
console.log('SUMMARY: All 3 cursor glyph shapes');
console.log('='.repeat(60));
console.log('');
console.log('Style            | Glyph | D00092 | Size     | Pixels');
console.log('-'.repeat(60));
for (const r of results) {
  const size = r.width > 0 ? `${r.width}x${r.height}` : 'N/A';
  console.log(`${r.name.padEnd(17)}| ${r.glyph}  | ${hex2(r.d00092)}   | ${size.padEnd(9)}| ${r.pixelCount}`);
}

console.log('');
console.log('Phase 486 probe complete.');
