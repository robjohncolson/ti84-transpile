#!/usr/bin/env node
/**
 * probe-phase486-d0059c-cursor-usage.mjs
 *
 * Determine whether the cursor blink path at 0x030173 reads D0059C
 * as cursor VRAM position, or independently computes it from D00595/D00596.
 *
 * Runs 4 experiments with different D00595/D00596 vs D0059C combinations
 * and compares where VRAM writes land.
 *
 * Run via: node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase486-d0059c-cursor-usage.mjs
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
const ROW_STRIDE = 640; // 320 pixels * 2 bytes per pixel
const IDLE_ENTRY = 0x02FDBE;
const STACK_RESET_TOP = 0xD1A87E;
const MAX_IDLE_STEPS = 200000;
const MAX_IDLE_LOOPS = 5;
const RET_POINTS = new Set([0x02FE21]);

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
const hex2 = (v) => hex(v & 0xFF, 2);

/**
 * Compute expected VRAM address for cursor at (row, col).
 * Formula: 0xD40000 + (row*20+37)*640 + (col*12+2)*2
 */
function expectedVramAddr(row, col) {
  const pixelRow = row * 20 + 37;
  const pixelCol = col * 12 + 2;
  return VRAM_START + pixelRow * ROW_STRIDE + pixelCol * 2;
}

function write24(addr, val) {
  mem[addr & 0xFFFFFF] = val & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (val >>> 16) & 0xFF;
}

function read16(addr) {
  return mem[addr & 0xFFFFFF] | (mem[(addr + 1) & 0xFFFFFF] << 8);
}

function write16(addr, val) {
  mem[addr & 0xFFFFFF] = val & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
}

// ========== Load ROM and transpiled blocks ==========
const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ========== BOOT ==========
console.log('Phase 486: D0059C cursor usage probe');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');

// Save post-boot memory state for resetting between experiments
const postBootMem = mem.slice();

// ========== Experiment runner ==========
function runExperiment(name, cursorRow, cursorCol, d0059cRow, d0059cCol) {
  console.log('');
  console.log(`=== ${name} ===`);
  console.log(`  D00595 (row) = ${cursorRow}, D00596 (col) = ${cursorCol}`);

  const d0059cAddr = expectedVramAddr(d0059cRow, d0059cCol);
  console.log(`  D0059C target = VRAM for (${d0059cRow},${d0059cCol}) = ${hex(d0059cAddr)}`);

  // Reset VRAM to 0xFF
  mem.fill(0xFF, VRAM_START, VRAM_END);

  // Snapshot VRAM before
  const vramBefore = mem.slice(VRAM_START, VRAM_END);

  // Set cursor position variables
  mem[0xD00595] = cursorRow;
  mem[0xD00596] = cursorCol;

  // Set D0059C (16-bit, low 16 bits of VRAM address)
  // D0059C stores column pixel value (16-bit)
  write16(0xD0059C, d0059cAddr & 0xFFFF);

  // Set idle loop flags
  mem[0xD00000] = 0x00;
  mem[0xD00092] = 0x16;
  mem[0xD000C6] |= 0x01;
  mem[0xD00089] |= 0x10;
  mem[0xD00080] = 0x18;
  mem[0xD00095] = 0x00;

  // CPU state
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.pc = IDLE_ENTRY;
  cpu.sp = STACK_RESET_TOP;

  const sentinelSp = STACK_RESET_TOP - 3;
  write24(sentinelSp, IDLE_ENTRY);
  cpu.sp = sentinelSp;

  console.log(`  D0059C before: ${hex(read16(0xD0059C), 4)}`);
  console.log(`  D00595 before: ${hex2(mem[0xD00595])}, D00596 before: ${hex2(mem[0xD00596])}`);

  let loopCount = 0;

  const result = executor.runFrom(IDLE_ENTRY, 'adl', {
    maxSteps: MAX_IDLE_STEPS,
    maxLoopIterations: 200000,
    onBlock: (pc) => {
      const masked = pc & 0xFFFFFF;

      if (RET_POINTS.has(masked)) {
        loopCount++;
        if (loopCount >= MAX_IDLE_LOOPS) return 'stop';

        cpu.sp = sentinelSp;
        write24(sentinelSp, IDLE_ENTRY);
        mem[0xD000C6] |= 0x01;
        mem[0xD00092] = 0x16;
      }

      if (masked === IDLE_ENTRY) {
        mem[0xD000C6] |= 0x01;
        mem[0xD00092] = 0x16;
      }
    },
  });

  const totalSteps = result.steps ?? 0;

  // Snapshot VRAM after
  const vramAfter = mem.slice(VRAM_START, VRAM_END);

  // Find changes
  const changes = [];
  for (let offset = 0; offset < VRAM_SIZE; offset++) {
    if (vramBefore[offset] !== vramAfter[offset]) {
      changes.push({
        addr: VRAM_START + offset,
        offset,
        row: Math.floor(offset / ROW_STRIDE),
        byteInRow: offset % ROW_STRIDE,
        col: Math.floor((offset % ROW_STRIDE) / 2),
        lane: offset % 2,
        oldVal: vramBefore[offset],
        newVal: vramAfter[offset],
      });
    }
  }

  console.log(`  Idle iterations: ${loopCount}, steps: ${totalSteps}`);
  console.log(`  D0059C after: ${hex(read16(0xD0059C), 4)}`);
  console.log(`  D00595 after: ${hex2(mem[0xD00595])}, D00596 after: ${hex2(mem[0xD00596])}`);
  console.log(`  VRAM bytes changed: ${changes.length}`);

  if (changes.length > 0) {
    const firstAddr = changes[0].addr;
    const lastAddr = changes[changes.length - 1].addr;
    const firstPixelRow = Math.floor((firstAddr - VRAM_START) / ROW_STRIDE);
    const firstPixelCol = Math.floor(((firstAddr - VRAM_START) % ROW_STRIDE) / 2);
    const lastPixelRow = Math.floor((lastAddr - VRAM_START) / ROW_STRIDE);
    const lastPixelCol = Math.floor(((lastAddr - VRAM_START) % ROW_STRIDE) / 2);

    console.log(`  First changed: ${hex(firstAddr)} -> pixel row=${firstPixelRow}, col=${firstPixelCol}`);
    console.log(`  Last changed:  ${hex(lastAddr)} -> pixel row=${lastPixelRow}, col=${lastPixelCol}`);

    // Compute expected pixel positions for both hypotheses
    const expRow0Col0 = expectedVramAddr(0, 0);
    const expRow5Col13 = expectedVramAddr(5, 13);
    const expPixelRow00 = Math.floor((expRow0Col0 - VRAM_START) / ROW_STRIDE);
    const expPixelCol00 = Math.floor(((expRow0Col0 - VRAM_START) % ROW_STRIDE) / 2);
    const expPixelRow513 = Math.floor((expRow5Col13 - VRAM_START) / ROW_STRIDE);
    const expPixelCol513 = Math.floor(((expRow5Col13 - VRAM_START) % ROW_STRIDE) / 2);

    console.log(`  Expected (0,0) start: pixel row=${expPixelRow00}, col=${expPixelCol00} (${hex(expRow0Col0)})`);
    console.log(`  Expected (5,13) start: pixel row=${expPixelRow513}, col=${expPixelCol513} (${hex(expRow5Col13)})`);

    // Determine which position was hit
    const nearRow00 = Math.abs(firstPixelRow - expPixelRow00) <= 2 && Math.abs(firstPixelCol - expPixelCol00) <= 2;
    const nearRow513 = Math.abs(firstPixelRow - expPixelRow513) <= 2 && Math.abs(firstPixelCol - expPixelCol513) <= 2;

    if (nearRow00) {
      console.log(`  => Cursor rendered near (0,0) position`);
    } else if (nearRow513) {
      console.log(`  => Cursor rendered near (5,13) position`);
    } else {
      console.log(`  => Cursor rendered at UNEXPECTED position`);
    }

    // Show first 20 changed bytes
    const showCount = Math.min(changes.length, 20);
    console.log(`  First ${showCount} changed bytes:`);
    for (let i = 0; i < showCount; i++) {
      const c = changes[i];
      const laneName = c.lane === 0 ? 'lo' : 'hi';
      console.log(`    ${hex(c.addr)} row=${c.row} col=${c.col} ${laneName} ${hex2(c.oldVal)} -> ${hex2(c.newVal)}`);
    }
  } else {
    console.log('  No VRAM changes detected.');
    console.log(`  D00092: ${hex2(mem[0xD00092])}, D000C6: ${hex2(mem[0xD000C6])}, D00089: ${hex2(mem[0xD00089])}`);
  }

  return { changes, loopCount, totalSteps };
}

// ========== Run 4 experiments ==========

// Exp 1: Baseline — D00595=0, D00596=0, D0059C = VRAM(0,0)
const exp1 = runExperiment('Experiment 1: Baseline (row=0, col=0, D0059C=VRAM(0,0))', 0, 0, 0, 0);

// Restore post-boot state (except VRAM which experiment resets)
mem.set(postBootMem);

// Exp 2: D00595=5, D00596=13, D0059C = VRAM(0,0) — tests if cursor follows D00595/D00596
const exp2 = runExperiment('Experiment 2: D00595/D00596=(5,13), D0059C=VRAM(0,0)', 5, 13, 0, 0);

// Restore post-boot state
mem.set(postBootMem);

// Exp 3: D00595=0, D00596=0, D0059C = VRAM(5,13) — tests if cursor follows D0059C
const exp3 = runExperiment('Experiment 3: D00595/D00596=(0,0), D0059C=VRAM(5,13)', 0, 0, 5, 13);

// Restore post-boot state
mem.set(postBootMem);

// Exp 4: Both D00595=5, D00596=13, D0059C = VRAM(5,13) — control
const exp4 = runExperiment('Experiment 4: Both (5,13) — D00595/D00596=(5,13), D0059C=VRAM(5,13)', 5, 13, 5, 13);

// ========== Cross-experiment analysis ==========
console.log('');
console.log('=== CROSS-EXPERIMENT ANALYSIS ===');

function firstVramRow(expResult) {
  if (expResult.changes.length === 0) return null;
  return expResult.changes[0].row;
}
function firstVramCol(expResult) {
  if (expResult.changes.length === 0) return null;
  return expResult.changes[0].col;
}

const positions = [
  { name: 'Exp1 (baseline)', row: firstVramRow(exp1), col: firstVramCol(exp1), changes: exp1.changes.length },
  { name: 'Exp2 (D00595/6 moved)', row: firstVramRow(exp2), col: firstVramCol(exp2), changes: exp2.changes.length },
  { name: 'Exp3 (D0059C moved)', row: firstVramRow(exp3), col: firstVramCol(exp3), changes: exp3.changes.length },
  { name: 'Exp4 (both moved)', row: firstVramRow(exp4), col: firstVramCol(exp4), changes: exp4.changes.length },
];

for (const p of positions) {
  console.log(`  ${p.name}: first pixel row=${p.row}, col=${p.col}, total changes=${p.changes}`);
}

const expRow00 = Math.floor((expectedVramAddr(0, 0) - VRAM_START) / ROW_STRIDE);
const expCol00 = Math.floor(((expectedVramAddr(0, 0) - VRAM_START) % ROW_STRIDE) / 2);
const expRow513 = Math.floor((expectedVramAddr(5, 13) - VRAM_START) / ROW_STRIDE);
const expCol513 = Math.floor(((expectedVramAddr(5, 13) - VRAM_START) % ROW_STRIDE) / 2);

console.log(`  Expected (0,0): pixel row=${expRow00}, col=${expCol00}`);
console.log(`  Expected (5,13): pixel row=${expRow513}, col=${expCol513}`);

console.log('');
console.log('=== CONCLUSION ===');

// Compare exp2 vs exp3 to determine which variable is authoritative
const exp2Near00 = positions[1].row !== null && Math.abs(positions[1].row - expRow00) <= 2;
const exp2Near513 = positions[1].row !== null && Math.abs(positions[1].row - expRow513) <= 2;
const exp3Near00 = positions[2].row !== null && Math.abs(positions[2].row - expRow00) <= 2;
const exp3Near513 = positions[2].row !== null && Math.abs(positions[2].row - expRow513) <= 2;

if (exp2Near513 && exp3Near00) {
  console.log('HYPOTHESIS 2 CONFIRMED: Cursor blink path computes VRAM position from D00595/D00596.');
  console.log('D0059C is NOT used as cursor position input by 0x030173.');
  console.log('Evidence: Moving D00595/D00596 moved the cursor (Exp2), moving D0059C alone did not (Exp3).');
} else if (exp2Near00 && exp3Near513) {
  console.log('HYPOTHESIS 1 CONFIRMED: Cursor blink path reads D0059C as cursor VRAM position.');
  console.log('D00595/D00596 are NOT used by 0x030173 for cursor positioning.');
  console.log('Evidence: Moving D0059C moved the cursor (Exp3), moving D00595/D00596 alone did not (Exp2).');
} else if (exp2Near513 && exp3Near513) {
  console.log('BOTH variables affect cursor position — the path may use both.');
} else if (exp2Near00 && exp3Near00) {
  console.log('NEITHER variable alone moves the cursor — position may be hardcoded or from another source.');
} else {
  console.log('INCONCLUSIVE: Cursor positions do not clearly match either hypothesis.');
  console.log('Exp2 near (0,0):', exp2Near00, 'near (5,13):', exp2Near513);
  console.log('Exp3 near (0,0):', exp3Near00, 'near (5,13):', exp3Near513);
  if (positions[1].row === null) console.log('Exp2 had no VRAM changes.');
  if (positions[2].row === null) console.log('Exp3 had no VRAM changes.');
}

console.log('');
console.log('Phase 486 probe complete.');
