#!/usr/bin/env node
/**
 * Phase 496 — Decode 0x061980 (OS putchar function)
 *
 * Part 1: Static disassembly of 0x061980
 * Part 2: Dynamic VRAM test — character 'A' (0x41) at cursor row=5, col=10
 * Part 3: Cursor glyph test — 0xE1 at same position
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── constants ──────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const CURSOR_ROW_ADDR = 0xD00595;
const CURSOR_COL_ADDR = 0xD00596;

const TARGET_ADDR = 0x061980;

// ── helpers ────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function snapshotVram(mem) {
  return new Uint8Array(mem.buffer, VRAM_BASE, VRAM_BYTE_SIZE).slice();
}

function compareVram(mem, snapshot) {
  let changes = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let i = 0; i < VRAM_BYTE_SIZE; i += 2) {
    const oldLo = snapshot[i];
    const oldHi = snapshot[i + 1];
    const newLo = mem[VRAM_BASE + i];
    const newHi = mem[VRAM_BASE + i + 1];

    if (oldLo !== newLo || oldHi !== newHi) {
      changes++;
      const pixelIndex = i / 2;
      const row = Math.floor(pixelIndex / VRAM_WIDTH);
      const col = pixelIndex % VRAM_WIDTH;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  const boundingBox = changes > 0
    ? { minRow, maxRow, minCol, maxCol, width: maxCol - minCol + 1, height: maxRow - minRow + 1 }
    : null;

  return { changes, boundingBox };
}

function purgeRamBlocks(executor) {
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) {
      delete blocks[key];
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Part 1: Static Disassembly
// ════════════════════════════════════════════════════════════════════

function formatInstr(instr) {
  const tag = instr.tag || '???';
  const parts = [tag];

  if (instr.condition) parts.push(`cond=${instr.condition}`);
  if (instr.target !== undefined) parts.push(`target=${hex(instr.target)}`);
  if (instr.addr !== undefined) parts.push(`addr=${hex(instr.addr)}`);
  if (instr.value !== undefined) parts.push(`val=${hex(instr.value, 2)}`);
  if (instr.pair) parts.push(`pair=${instr.pair}`);
  if (instr.dest) parts.push(`dest=${instr.dest}`);
  if (instr.src) parts.push(`src=${instr.src}`);
  if (instr.op) parts.push(`op=${instr.op}`);
  if (instr.bit !== undefined) parts.push(`bit=${instr.bit}`);
  if (instr.indexRegister) parts.push(`idx=${instr.indexRegister}`);
  if (instr.displacement !== undefined) parts.push(`disp=${instr.displacement}`);
  if (instr.operation) parts.push(`operation=${instr.operation}`);

  return parts.join(' ');
}

function staticDisassembly() {
  console.log('=== Part 1: Static Disassembly of 0x061980 ===\n');

  const instructions = [];
  const callTargets = [];
  const jpTargets = [];
  const memRefs = [];
  const cursorGlyphRefs = [];
  let pc = TARGET_ADDR;
  const maxPc = TARGET_ADDR + 300;

  while (pc < maxPc) {
    const instr = decodeInstruction(romBytes, pc, 'adl');
    if (!instr) {
      console.log(`  Decode failed at ${hex(pc)}`);
      break;
    }

    // Format raw bytes
    const rawBytes = [];
    for (let i = 0; i < instr.length; i++) {
      rawBytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
    }

    const tag = instr.tag || '???';
    const desc = formatInstr(instr);
    const line = `${hex(pc)}: ${rawBytes.join(' ').padEnd(18)} ${desc}`;
    instructions.push({ pc, line, instr });

    // Collect CALL targets
    if (tag === 'call' || tag === 'call-conditional') {
      callTargets.push({ from: pc, target: instr.target, cond: instr.condition || '' });
    }

    // Collect JP targets
    if (tag === 'jp' || tag === 'jp-conditional' || tag === 'jp-indirect') {
      jpTargets.push({ from: pc, target: instr.target, cond: instr.condition || '', indirect: tag === 'jp-indirect' });
    }

    // Scan for D00xxx references and VRAM refs in raw bytes
    for (let i = 0; i < instr.length - 2; i++) {
      const lo = romBytes[pc + i];
      const mid = romBytes[pc + i + 1];
      const hi = romBytes[pc + i + 2];
      const addr24 = lo | (mid << 8) | (hi << 16);

      if (addr24 >= 0xD00000 && addr24 < 0xD10000) {
        memRefs.push({ pc, addr: addr24 });
      }
      if (addr24 >= 0xD40000 && addr24 < 0xD4C000) {
        memRefs.push({ pc, addr: addr24, type: 'VRAM' });
      }
    }

    // Look for cursor glyph codes in immediate values
    if (instr.value === 0xE1 || instr.value === 0xE2 || instr.value === 0xE3) {
      cursorGlyphRefs.push({ pc, code: instr.value, tag });
    }

    // Stop at unconditional RET (not conditional)
    if (tag === 'ret') {
      break;
    }

    pc = instr.nextPc;
  }

  // Print disassembly
  for (const { line } of instructions) {
    console.log(`  ${line}`);
  }

  console.log(`\n  Instruction count: ${instructions.length}`);
  console.log(`  Byte range: ${hex(TARGET_ADDR)} - ${hex(pc)}`);

  // Print CALL targets
  console.log(`\n  CALL targets (${callTargets.length}):`);
  for (const c of callTargets) {
    console.log(`    ${hex(c.from)} -> CALL ${c.cond ? c.cond + ', ' : ''}${hex(c.target)}`);
  }

  // Print JP targets
  console.log(`\n  JP targets (${jpTargets.length}):`);
  for (const j of jpTargets) {
    const label = j.indirect ? '(indirect)' : hex(j.target);
    console.log(`    ${hex(j.from)} -> JP ${j.cond ? j.cond + ', ' : ''}${label}`);
  }

  // Print memory references
  console.log(`\n  Memory references (D00xxx / VRAM):`);
  const uniqueRefs = [...new Map(memRefs.map(r => [`${r.addr}`, r])).values()];
  for (const r of uniqueRefs) {
    const label = r.addr === CURSOR_ROW_ADDR ? ' (cursor row)'
      : r.addr === CURSOR_COL_ADDR ? ' (cursor col)'
      : r.type === 'VRAM' ? ' (VRAM)'
      : '';
    console.log(`    ${hex(r.addr)}${label}`);
  }

  // Cursor glyph codes
  console.log(`\n  Cursor glyph codes (0xE1/0xE2/0xE3): ${cursorGlyphRefs.length}`);
  for (const g of cursorGlyphRefs) {
    console.log(`    ${hex(g.pc)}: ${g.tag} ${hex(g.code, 2)}`);
  }

  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Part 2: Dynamic Character Test ('A' = 0x41)
// ════════════════════════════════════════════════════════════════════

function dynamicCharTest() {
  console.log('=== Part 2: Dynamic Character Test — A (0x41) at row=5, col=10 ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Set cursor position
  mem[CURSOR_ROW_ADDR] = 5;
  mem[CURSOR_COL_ADDR] = 10;

  // Set A = 0x41 ('A')
  cpu.a = 0x41;

  // Snapshot VRAM before
  const vramBefore = snapshotVram(mem);

  // Prepare for execution
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  purgeRamBlocks(executor);

  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000 || pc >= 0xF00000) {
          throw new Error(`ram_halt at ${hex(pc)} after ${steps} steps`);
        }
      },
    });
    stepsUsed = result.steps;
    termination = result.termination;
    lastPc = result.lastPc;
  } catch (e) {
    const match = e.message.match(/after (\d+) steps/);
    stepsUsed = match ? parseInt(match[1]) : -1;
    termination = e.message;
    lastPc = cpu.pc;
  }

  const { changes, boundingBox } = compareVram(mem, vramBefore);

  console.log(`  Steps used:   ${stepsUsed}`);
  console.log(`  Termination:  ${termination}`);
  console.log(`  Last PC:      ${hex(lastPc)}`);
  console.log(`  VRAM changes: ${changes} pixels`);
  if (boundingBox) {
    console.log(`  Bounding box: row ${boundingBox.minRow}-${boundingBox.maxRow}, col ${boundingBox.minCol}-${boundingBox.maxCol}`);
    console.log(`                ${boundingBox.width}w x ${boundingBox.height}h pixels`);
  } else {
    console.log('  Bounding box: (no changes)');
  }

  // Check cursor position after — did it advance?
  const newRow = mem[CURSOR_ROW_ADDR];
  const newCol = mem[CURSOR_COL_ADDR];
  console.log(`  Cursor after: row=${newRow}, col=${newCol} (was row=5, col=10)`);
  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Part 3: Cursor Glyph Test (0xE1)
// ════════════════════════════════════════════════════════════════════

function cursorGlyphTest() {
  console.log('=== Part 3: Cursor Glyph Test — 0xE1 at row=5, col=10 ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Set cursor position
  mem[CURSOR_ROW_ADDR] = 5;
  mem[CURSOR_COL_ADDR] = 10;

  // Set A = 0xE1 (cursor glyph)
  cpu.a = 0xE1;

  // Snapshot VRAM before
  const vramBefore = snapshotVram(mem);

  // Prepare for execution
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  purgeRamBlocks(executor);

  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000 || pc >= 0xF00000) {
          throw new Error(`ram_halt at ${hex(pc)} after ${steps} steps`);
        }
      },
    });
    stepsUsed = result.steps;
    termination = result.termination;
    lastPc = result.lastPc;
  } catch (e) {
    const match = e.message.match(/after (\d+) steps/);
    stepsUsed = match ? parseInt(match[1]) : -1;
    termination = e.message;
    lastPc = cpu.pc;
  }

  const { changes, boundingBox } = compareVram(mem, vramBefore);

  console.log(`  Steps used:   ${stepsUsed}`);
  console.log(`  Termination:  ${termination}`);
  console.log(`  Last PC:      ${hex(lastPc)}`);
  console.log(`  VRAM changes: ${changes} pixels`);
  if (boundingBox) {
    console.log(`  Bounding box: row ${boundingBox.minRow}-${boundingBox.maxRow}, col ${boundingBox.minCol}-${boundingBox.maxCol}`);
    console.log(`                ${boundingBox.width}w x ${boundingBox.height}h pixels`);

    // Check if it's cursor-shaped (~10x14 pixels)
    const isCursorShaped = boundingBox.width >= 6 && boundingBox.width <= 16
      && boundingBox.height >= 10 && boundingBox.height <= 20;
    console.log(`  Cursor-shaped (6-16w x 10-20h): ${isCursorShaped ? 'YES — putchar IS cursor draw' : 'NO'}`);
  } else {
    console.log('  Bounding box: (no changes)');
  }

  // Compare with Part 2 — same bounding box dimensions would confirm same code path
  console.log(`  Cursor after: row=${mem[CURSOR_ROW_ADDR]}, col=${mem[CURSOR_COL_ADDR]} (was row=5, col=10)`);
  console.log('');
}

// ── main ───────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Phase 496 — Decode 0x061980 (OS Putchar Function)     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  staticDisassembly();
  dynamicCharTest();
  cursorGlyphTest();

  console.log('=== Phase 496 Complete ===');
}

main();
