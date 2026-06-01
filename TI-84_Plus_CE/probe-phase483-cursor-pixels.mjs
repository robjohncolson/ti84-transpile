#!/usr/bin/env node
/**
 * probe-phase483-cursor-pixels.mjs
 *
 * Run the idle loop and capture the exact cursor pixel pattern from
 * the ~72 VRAM bytes the cursor blink path produces.
 *
 * Idle loop at 0x02FDBE dispatches to cursor rendering when:
 *   D00000=0x00, D00092 bits 1,2,4 set, D000C6 bit 0, D00089 bit 4
 *
 * When cpu.pc reaches 0x02FE21 (XOR A; RET), that's one loop iteration end.
 * We intercept via onBlock, reset state, re-enter at 0x02FDBE.
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
const TRACK_PCS = [0x030173, 0x030202, 0x0A23C0, 0x0A239E, 0x0A2400];

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

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

// ========== BOOT ==========
console.log('Phase 483: Cursor pixel pattern probe');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');

// ========== Set up idle loop state ==========
console.log('');
console.log('Setting idle-loop cursor state...');
mem[0xD00000] = 0x00;       // idle path
mem[0xD00092] = 0x16;       // bits 1,2,4 set — cursor active
mem[0xD000C6] |= 0x01;      // display flag
mem[0xD00089] |= 0x10;      // bit 4 — display path
mem[0xD00080] = 0x18;       // bits 3+4
mem[0xD00095] = 0x00;       // clear cursor state
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.iff1 = 0;
cpu.iff2 = 0;

// ========== Snapshot VRAM before ==========
console.log('Snapshotting VRAM before idle loop');
const vramBefore = snapshotVram();

// ========== Run idle loop ==========
const hits = new Map(TRACK_PCS.map((pc) => [pc, 0]));
let loopCount = 0;
let totalSteps = 0;

console.log(`Running idle loop at ${hex(IDLE_ENTRY)} for up to ${MAX_IDLE_STEPS} steps or ${MAX_IDLE_LOOPS} iterations`);

cpu.pc = IDLE_ENTRY;
cpu.sp = STACK_RESET_TOP;

// Push sentinel onto stack
const sentinelSp = STACK_RESET_TOP - 3;
write24(sentinelSp, IDLE_ENTRY); // return to idle entry
cpu.sp = sentinelSp;

const result = executor.runFrom(IDLE_ENTRY, 'adl', {
  maxSteps: MAX_IDLE_STEPS,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;

    // Track hit counts
    if (hits.has(masked)) {
      hits.set(masked, hits.get(masked) + 1);
    }

    // End of one loop iteration (XOR A; RET)
    if (RET_POINTS.has(masked)) {
      loopCount++;

      if (loopCount >= MAX_IDLE_LOOPS) {
        return 'stop';
      }

      // Reset for next iteration
      cpu.sp = sentinelSp;
      write24(sentinelSp, IDLE_ENTRY);

      // Refresh flags (OS clears them each iteration)
      mem[0xD000C6] |= 0x01;
      mem[0xD00092] = 0x16;
    }

    // Re-entering idle loop head
    if (masked === IDLE_ENTRY) {
      // Refresh flags each time we re-enter
      mem[0xD000C6] |= 0x01;
      mem[0xD00092] = 0x16;
    }
  },
});

totalSteps = result.steps ?? 0;

// ========== Snapshot VRAM after ==========
const vramAfter = snapshotVram();

// ========== Analyze VRAM diff ==========
console.log('');
console.log('=== VRAM DIFF ANALYSIS ===');

const changes = [];
for (let offset = 0; offset < VRAM_SIZE; offset++) {
  if (vramBefore[offset] !== vramAfter[offset]) {
    changes.push({
      addr: VRAM_START + offset,
      offset,
      row: Math.floor(offset / ROW_STRIDE),
      byteInRow: offset % ROW_STRIDE,
      col: Math.floor((offset % ROW_STRIDE) / 2),
      lane: offset % 2, // 0=lo, 1=hi of 16bpp pixel
      oldVal: vramBefore[offset],
      newVal: vramAfter[offset],
    });
  }
}

console.log(`Total changed VRAM bytes: ${changes.length}`);
console.log(`Idle loop iterations completed: ${loopCount}`);
console.log(`Total steps: ${totalSteps}`);
console.log(`Final PC: ${hex(result.pc ?? cpu.pc)}`);
console.log(`Final SP: ${hex(cpu.sp)}`);

// ========== Hit counts ==========
console.log('');
console.log('Tracked PC hits:');
for (const pc of TRACK_PCS) {
  console.log(`  ${hex(pc)}: ${hits.get(pc) ?? 0}`);
}

// ========== Changed bytes detail ==========
if (changes.length > 0) {
  console.log('');
  console.log('Changed VRAM bytes:');
  for (const c of changes) {
    const laneName = c.lane === 0 ? 'lo' : 'hi';
    console.log(`  ${hex(c.addr)} row=${c.row} col=${c.col} ${laneName} ${hex2(c.oldVal)} -> ${hex2(c.newVal)}`);
  }

  // ========== Group by row ==========
  const rows = new Map();
  for (const c of changes) {
    if (!rows.has(c.row)) rows.set(c.row, []);
    rows.get(c.row).push(c);
  }

  console.log('');
  console.log('Grouped by 0x280-byte VRAM rows:');
  for (const [row, rowChanges] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const cols = [...new Set(rowChanges.map((c) => c.col))].sort((a, b) => a - b);
    const colRange = cols.length > 1 ? `${cols[0]}-${cols[cols.length - 1]}` : `${cols[0]}`;
    console.log(`  row ${row} (base ${hex(VRAM_START + row * ROW_STRIDE)}): ${rowChanges.length} bytes, cols ${colRange}`);
    for (const c of rowChanges) {
      const laneName = c.lane === 0 ? 'lo' : 'hi';
      console.log(`    ${hex(c.addr)} col=${c.col} ${laneName} ${hex2(c.oldVal)} -> ${hex2(c.newVal)}`);
    }
  }

  // ========== Pixel shape grid ==========
  const allRows = [...new Set(changes.map((c) => c.row))].sort((a, b) => a - b);
  const allCols = [...new Set(changes.map((c) => c.col))].sort((a, b) => a - b);
  const minRow = allRows[0];
  const maxRow = allRows[allRows.length - 1];
  const minCol = allCols[0];
  const maxCol = allCols[allCols.length - 1];
  const height = maxRow - minRow + 1;
  const width = maxCol - minCol + 1;

  console.log('');
  console.log('=== CURSOR SHAPE ===');
  console.log(`Bounding box: rows ${minRow}-${maxRow} (${height} rows), cols ${minCol}-${maxCol} (${width} cols)`);
  console.log(`Changed pixels: ${new Set(changes.map((c) => `${c.row}:${c.col}`)).size}`);
  console.log(`Solid bounding box: ${new Set(changes.map((c) => `${c.row}:${c.col}`)).size === width * height ? 'yes' : 'no'}`);

  if (width <= 96 && height <= 64) {
    const pixelSet = new Set(changes.map((c) => `${c.row}:${c.col}`));
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

  // ========== XOR analysis ==========
  // Build pixel map: each pixel is 16-bit (lo + hi byte)
  const pixelMap = new Map();
  for (const c of changes) {
    const key = `${c.row}:${c.col}`;
    if (!pixelMap.has(key)) {
      const pixelOffset = c.offset - c.lane;
      pixelMap.set(key, {
        row: c.row,
        col: c.col,
        old16: vramBefore[pixelOffset] | (vramBefore[pixelOffset + 1] << 8),
        new16: vramAfter[pixelOffset] | (vramAfter[pixelOffset + 1] << 8),
      });
    }
  }

  const uniqueNew = [...new Set([...pixelMap.values()].map((p) => p.new16))].sort((a, b) => a - b);
  const uniqueXor = [...new Set([...pixelMap.values()].map((p) => p.old16 ^ p.new16))].sort((a, b) => a - b);

  console.log('');
  console.log('=== INTERPRETATION ===');
  console.log(`Unique new 16bpp values: ${uniqueNew.map((v) => hex(v, 4)).join(', ')}`);
  console.log(`Unique old^new XOR deltas: ${uniqueXor.map((v) => hex(v, 4)).join(', ')}`);

  if (uniqueXor.length === 1) {
    console.log('Uniform XOR delta => cursor uses XOR toggle blink.');
  } else if (uniqueNew.length === 1) {
    console.log('Single new color => cursor draws a solid block in one color.');
  } else {
    console.log('Multiple new values => cursor draws a glyph/character pattern.');
  }

  if (width <= 24) {
    console.log('');
    console.log('16bpp pixel values (new):');
    for (let row = minRow; row <= maxRow; row++) {
      const cells = [];
      for (let col = minCol; col <= maxCol; col++) {
        const p = pixelMap.get(`${row}:${col}`);
        cells.push(p ? hex(p.new16, 4) : '    ');
      }
      console.log(`  r${String(row).padStart(3, ' ')} ${cells.join(' ')}`);
    }
  }
} else {
  console.log('');
  console.log('No VRAM bytes changed. Cursor rendering did not reach the expected write path.');
  console.log('Check: D00092 final = ' + hex2(mem[0xD00092]));
  console.log('Check: D000C6 final = ' + hex2(mem[0xD000C6]));
  console.log('Check: D00089 final = ' + hex2(mem[0xD00089]));
  console.log('Check: D00080 final = ' + hex2(mem[0xD00080]));
}

// ========== Final state ==========
console.log('');
console.log('=== FINAL STATE ===');
console.log(`D00092: ${hex2(mem[0xD00092])}`);
console.log(`D000C6: ${hex2(mem[0xD000C6])}`);
console.log(`D00089: ${hex2(mem[0xD00089])}`);
console.log(`D00080: ${hex2(mem[0xD00080])}`);
console.log(`D00095: ${hex2(mem[0xD00095])}`);
console.log(`D00595: ${hex2(mem[0xD00595])}`);
console.log(`D00596: ${hex2(mem[0xD00596])}`);

console.log('');
console.log('Phase 483 probe complete.');
