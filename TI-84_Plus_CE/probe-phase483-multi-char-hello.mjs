#!/usr/bin/env node
/**
 * probe-phase483-multi-char-hello.mjs
 *
 * Render "HELLO" (5 characters) via the ROM's character output function
 * at 0x0059C6. Verifies each character produces VRAM changes and that
 * the column counter D00596 increments 1..5.
 *
 * Boot uses executor.runFrom() with maxSteps/maxLoopIterations to avoid
 * hanging on lifted blocks that infinite-loop inside a single cpu.step().
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function read24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  let count = 0;
  for (let offset = 0; offset < before.length; offset++) {
    if (before[offset] !== mem[VRAM_START + offset]) {
      count++;
    }
  }
  return count;
}

// ========== CREATE EXECUTOR ==========

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ========== 3-STAGE BOOT (same as probe-phase478-char-output-test) ==========

console.log('[phase483] Boot stage 1: z80 reset from 0x000000');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log('[phase483] Boot stage 1 complete');

console.log('[phase483] Boot stage 2: kernel init from 0x08C331');
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase483] Boot stage 2 complete');

console.log('[phase483] Boot stage 3: post-init from 0x0802B2');
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('[phase483] Boot stage 3 complete');

// ========== SET UP DISPLAY STATE ==========

// Row 0, col 0
mem[0xD00595] = 0x00;
mem[0xD00596] = 0x00;

// VRAM pointer at 0xD40000 (same as probe-phase478)
mem[0xD0059C] = 0x00;
mem[0xD0059D] = 0x00;
mem[0xD0059E] = 0xD4;

mem[0xD0058B] = 0x70;
mem[0xD0058C] = 0x00;
mem[0xD0058E] = 0x00;

// Ensure CPU state is sane
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;

console.log('[phase483] Display state initialized:');
console.log(`  D00595 (row): ${hex(mem[0xD00595])}`);
console.log(`  D00596 (col): ${hex(mem[0xD00596])}`);
console.log(`  D0059C (VRAM ptr): ${hex(read24(0xD0059C), 6)}`);
console.log(`  D0058B: ${hex(mem[0xD0058B])}`);

// ========== SNAPSHOT VRAM BEFORE CHARACTERS ==========

const vramBefore = snapshotVram();

// ========== RENDER EACH CHARACTER ==========

const HELLO = [
  { char: 'H', code: 0x48 },
  { char: 'E', code: 0x45 },
  { char: 'L', code: 0x4C },
  { char: 'L', code: 0x4C },
  { char: 'O', code: 0x4F },
];

let totalVramChanged = 0;
let allPassed = true;
const charResults = [];

// Character cell advance in VRAM bytes (12 bytes per char cell at 16bpp, 6px wide)
const CHAR_ADVANCE = 12;
const VRAM_BASE = 0xD40000;

for (let i = 0; i < HELLO.length; i++) {
  const { char, code } = HELLO[i];
  const charVramBefore = snapshotVram();

  // Re-seed display state before each character to avoid corruption
  // from runFrom continuing past ret
  mem[0xD00595] = 0x00;             // row 0
  mem[0xD00596] = i;                // col = character index
  // VRAM pointer advances by CHAR_ADVANCE per character
  const vramCursor = VRAM_BASE + (i * CHAR_ADVANCE);
  mem[0xD0059C] = vramCursor & 0xFF;
  mem[0xD0059D] = (vramCursor >>> 8) & 0xFF;
  mem[0xD0059E] = (vramCursor >>> 16) & 0xFF;
  mem[0xD0058B] = 0x70;
  mem[0xD0058C] = 0x00;
  mem[0xD0058E] = 0x00;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;

  // Set up the call
  // Use sentinel 0x500000 (past ROM, before RAM -- no block exists there,
  // not in RAM trampoline range >= 0xD00000, so runFrom hits missing_block and stops)
  cpu._a = (code & 0xFF) << 24;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0x00;
  mem[cpu.sp + 1] = 0x00;
  mem[cpu.sp + 2] = 0x50;  // sentinel = 0x500000
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Run character output
  const result = executor.runFrom(0x0059C6, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 100,
  });

  const steps = result.steps ?? result.stepCount ?? 'unknown';
  const col = mem[0xD00596];
  const row = mem[0xD00595];
  const vramPtr = read24(0xD0059C);
  const vramChanged = diffVram(charVramBefore);
  totalVramChanged += vramChanged;

  const expectedCol = i + 1;
  const colOk = col === expectedCol;
  const vramOk = vramChanged > 0;
  const charPassed = colOk && vramOk;

  if (!charPassed) allPassed = false;

  const status = charPassed ? 'OK' : 'FAIL';
  console.log(
    `[phase483] ${i + 1}. '${char}' (${hex(code)}): ` +
    `steps=${steps} col=${col}/${expectedCol} row=${row} ` +
    `D0059C=${hex(vramPtr, 6)} vramChanged=${vramChanged} [${status}]`
  );

  charResults.push({
    char,
    code,
    steps,
    col,
    expectedCol,
    row,
    vramPtr,
    vramChanged,
    passed: charPassed,
  });
}

// ========== FINAL REPORT ==========

const finalVramChanged = diffVram(vramBefore);

console.log('');
console.log('[phase483] ========== RESULTS ==========');
console.log(`[phase483] Total VRAM bytes changed: ${finalVramChanged}`);
console.log(`[phase483] Final D00596 (col): ${mem[0xD00596]}`);
console.log(`[phase483] Final D00595 (row): ${mem[0xD00595]}`);
console.log(`[phase483] Final D0059C: ${hex(read24(0xD0059C), 6)}`);

const colsOk = mem[0xD00596] === 5;
const totalVramOk = finalVramChanged > 200;

console.log('');
if (allPassed && colsOk && totalVramOk) {
  console.log('[phase483] PASS: HELLO rendered successfully');
  console.log(`  - All 5 characters produced VRAM changes`);
  console.log(`  - D00596 incremented correctly to 5`);
  console.log(`  - Total VRAM changed: ${finalVramChanged} (> 200 threshold)`);
} else {
  console.log('[phase483] FAIL:');
  if (!colsOk) {
    console.log(`  - D00596 = ${mem[0xD00596]}, expected 5`);
  }
  if (!totalVramOk) {
    console.log(`  - Total VRAM changed = ${finalVramChanged}, expected > 200`);
  }
  for (const r of charResults) {
    if (!r.passed) {
      console.log(`  - '${r.char}': col=${r.col}/${r.expectedCol} row=${r.row} vram=${r.vramChanged}`);
    }
  }
  process.exitCode = 1;
}

console.log('');
console.log('[phase483] Summary JSON:');
console.log(JSON.stringify({
  characters: charResults,
  finalCol: mem[0xD00596],
  finalRow: mem[0xD00595],
  finalVramPtr: read24(0xD0059C),
  totalVramChanged: finalVramChanged,
  passed: allPassed && colsOk && totalVramOk,
}, null, 2));
