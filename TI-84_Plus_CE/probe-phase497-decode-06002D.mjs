#!/usr/bin/env node
/**
 * Phase 497 — Decode 0x06002D (cursor row/col to VRAM address converter)
 *
 * Part 1: Static disassembly of 0x06002D
 * Part 2: Dynamic tests — call 0x06002D with 3 cursor positions and
 *         report all register values + writes to D008D2/D008D5
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

const TARGET_ADDR = 0x06002D;

// Addresses of interest for monitoring writes
const WATCH_ADDRS = {
  0xD008D2: 'LCD_WINDOW_LOW',
  0xD008D3: 'LCD_WINDOW_LOW+1',
  0xD008D4: 'LCD_WINDOW_LOW+2',
  0xD008D5: 'LCD_WINDOW_HIGH',
  0xD008D6: 'LCD_WINDOW_HIGH+1',
  0xD008D7: 'LCD_WINDOW_HIGH+2',
};

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

function purgeRamBlocks(executor) {
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) {
      delete blocks[key];
    }
  }
}

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
  if (instr.reg) parts.push(`reg=${instr.reg}`);
  if (instr.indirectRegister) parts.push(`ind=${instr.indirectRegister}`);

  return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════════
// Part 1: Static Disassembly
// ════════════════════════════════════════════════════════════════════

function staticDisassembly() {
  console.log('=== Part 1: Static Disassembly of 0x06002D ===\n');

  const instructions = [];
  const callTargets = [];
  const jpTargets = [];
  const memRefs = [];
  let pc = TARGET_ADDR;
  const maxPc = TARGET_ADDR + 200;

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

    // Scan for D00xxx / VRAM refs in raw bytes
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

    // Stop at unconditional RET
    if (tag === 'ret') {
      break;
    }

    pc = instr.nextPc;
  }

  // Print all instructions
  for (const { line } of instructions) {
    console.log(`  ${line}`);
  }

  // Summary: call targets
  console.log(`\n  CALL targets: ${callTargets.length}`);
  for (const c of callTargets) {
    console.log(`    ${hex(c.from)} -> ${hex(c.target)} ${c.cond ? `(${c.cond})` : ''}`);
  }

  // Summary: JP targets
  console.log(`\n  JP targets: ${jpTargets.length}`);
  for (const j of jpTargets) {
    console.log(`    ${hex(j.from)} -> ${j.indirect ? '(indirect)' : hex(j.target)} ${j.cond ? `(${j.cond})` : ''}`);
  }

  // Summary: memory refs
  console.log(`\n  Memory references: ${memRefs.length}`);
  for (const r of memRefs) {
    const label = r.addr === CURSOR_ROW_ADDR ? ' (CURSOR_ROW)'
      : r.addr === CURSOR_COL_ADDR ? ' (CURSOR_COL)'
      : r.addr >= 0xD008D0 && r.addr <= 0xD008D7 ? ` (LCD_WINDOW ${hex(r.addr)})`
      : r.type === 'VRAM' ? ' (VRAM)'
      : '';
    console.log(`    ${hex(r.pc)}: ref ${hex(r.addr)}${label}`);
  }

  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Part 2: Dynamic Tests
// ════════════════════════════════════════════════════════════════════

function dynamicTest(label, row, col) {
  console.log(`--- Test ${label}: row=${row}, col=${col} ---\n`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Set cursor position
  mem[CURSOR_ROW_ADDR] = row;
  mem[CURSOR_COL_ADDR] = col;

  // Record pre-test values at watched addresses
  const watchBefore = {};
  for (const addr of Object.keys(WATCH_ADDRS)) {
    const a = parseInt(addr);
    watchBefore[a] = mem[a];
  }

  // Set IY = 0xD00080 (TI-OS standard)
  cpu._iy = 0xD00080;

  // Prepare for execution
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  // Clear registers to make output easier to interpret
  cpu.a = 0;
  cpu.f = 0;
  cpu._bc = 0;
  cpu._de = 0;
  cpu._hl = 0;
  cpu._ix = 0;

  purgeRamBlocks(executor);

  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: 200,
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

  console.log(`  Steps:       ${stepsUsed}`);
  console.log(`  Termination: ${termination}`);
  console.log(`  Last PC:     ${hex(lastPc)}`);
  console.log('');

  // Register dump
  console.log('  Registers after return:');
  console.log(`    A  = ${hex(cpu.a, 2)}    F  = ${hex(cpu.f, 2)}`);
  console.log(`    BC = ${hex(cpu._bc)}     B  = ${hex((cpu._bc >> 8) & 0xFF, 2)}  C  = ${hex(cpu._bc & 0xFF, 2)}`);
  console.log(`    DE = ${hex(cpu._de)}     D  = ${hex((cpu._de >> 8) & 0xFF, 2)}  E  = ${hex(cpu._de & 0xFF, 2)}`);
  console.log(`    HL = ${hex(cpu._hl)}     H  = ${hex((cpu._hl >> 8) & 0xFF, 2)}  L  = ${hex(cpu._hl & 0xFF, 2)}`);
  console.log(`    IX = ${hex(cpu._ix)}`);
  console.log(`    IY = ${hex(cpu._iy)}`);
  console.log(`    SP = ${hex(cpu.sp)}`);
  console.log('');

  // Check for VRAM-range value in HL or DE
  if (cpu._hl >= 0xD40000 && cpu._hl < 0xD4C000) {
    const offset = cpu._hl - VRAM_BASE;
    const pixelIndex = Math.floor(offset / 2);
    const vramRow = Math.floor(pixelIndex / VRAM_WIDTH);
    const vramCol = pixelIndex % VRAM_WIDTH;
    console.log(`  HL is VRAM addr! offset=${hex(offset)}, pixel=(row=${vramRow}, col=${vramCol})`);
  }
  if (cpu._de >= 0xD40000 && cpu._de < 0xD4C000) {
    const offset = cpu._de - VRAM_BASE;
    const pixelIndex = Math.floor(offset / 2);
    const vramRow = Math.floor(pixelIndex / VRAM_WIDTH);
    const vramCol = pixelIndex % VRAM_WIDTH;
    console.log(`  DE is VRAM addr! offset=${hex(offset)}, pixel=(row=${vramRow}, col=${vramCol})`);
  }
  console.log('');

  // Read D008D2 and D008D5 as 24-bit values
  const d2val = mem[0xD008D2] | (mem[0xD008D3] << 8) | (mem[0xD008D4] << 16);
  const d5val = mem[0xD008D5] | (mem[0xD008D6] << 8) | (mem[0xD008D7] << 16);
  console.log(`  D008D2 (24-bit): ${hex(d2val)}`);
  console.log(`  D008D5 (24-bit): ${hex(d5val)}`);

  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

staticDisassembly();

console.log('=== Part 2: Dynamic Tests — 0x06002D with 3 cursor positions ===\n');
dynamicTest('A', 0, 0);
dynamicTest('B', 5, 10);
dynamicTest('C', 9, 25);

console.log('=== DONE ===');
