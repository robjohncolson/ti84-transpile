#!/usr/bin/env node
/**
 * Phase 497 — Decode 0x061434 (putchar preprocessor)
 *
 * Part 1: Static disassembly of 0x061434 (until RET or 200 bytes)
 * Part 2: Dynamic tests — call 0x061434 with various char codes in A,
 *         capture Z flag, A on return, step count, D005xx writes
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

const TARGET_ADDR = 0x061434;
const FLAG_Z_BIT = 0x40;

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
  if (instr.indirectRegister) parts.push(`ind=${instr.indirectRegister}`);

  return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════════
// Part 1: Static Disassembly
// ════════════════════════════════════════════════════════════════════

function staticDisassembly() {
  console.log('=== Part 1: Static Disassembly of 0x061434 ===\n');

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

    const rawBytes = [];
    for (let i = 0; i < instr.length; i++) {
      rawBytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
    }

    const desc = formatInstr(instr);
    console.log(`  ${hex(pc)}: ${rawBytes.join(' ').padEnd(18)} ${desc}`);

    const tag = instr.tag || '???';

    if (tag === 'call' || tag === 'call-conditional') {
      callTargets.push({ from: pc, target: instr.target, cond: instr.condition || '' });
    }

    if (tag === 'jp' || tag === 'jp-conditional' || tag === 'jp-indirect') {
      jpTargets.push({ from: pc, target: instr.target, cond: instr.condition || '', indirect: tag === 'jp-indirect' });
    }

    // Scan for D00xxx references
    for (let i = 0; i < instr.length - 2; i++) {
      const lo = romBytes[pc + i];
      const mid = romBytes[pc + i + 1];
      const hi = romBytes[pc + i + 2];
      const addr24 = lo | (mid << 8) | (hi << 16);

      if (addr24 >= 0xD00000 && addr24 < 0xD10000) {
        memRefs.push({ pc, addr: addr24 });
      }
    }

    // Stop at unconditional RET
    if (tag === 'ret') {
      break;
    }

    pc = instr.nextPc;
  }

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
  const uniqueRefs = [...new Map(memRefs.map(r => [`${r.addr}`, r])).values()];
  if (uniqueRefs.length > 0) {
    console.log(`\n  Memory references (D00xxx):`);
    for (const r of uniqueRefs) {
      const label = r.addr === CURSOR_ROW_ADDR ? ' (cursor row)'
        : r.addr === CURSOR_COL_ADDR ? ' (cursor col)'
        : '';
      console.log(`    ${hex(r.addr)}${label}`);
    }
  }

  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Part 2: Dynamic Tests — character code → Z/NZ classification
// ════════════════════════════════════════════════════════════════════

function dynamicTests() {
  console.log('=== Part 2: Dynamic Tests — 0x061434 with various char codes ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const testChars = [
    { code: 0x41, name: "'A'" },
    { code: 0x0D, name: 'CR' },
    { code: 0x0A, name: 'LF' },
    { code: 0x08, name: 'BS' },
    { code: 0x00, name: 'NULL' },
    { code: 0xE1, name: 'cur-ins' },
    { code: 0xE2, name: 'cur-ovr' },
    { code: 0x20, name: 'SPACE' },
    { code: 0x7F, name: 'DEL' },
  ];

  // Table header
  console.log('  ' + 'Char'.padEnd(10) + 'Code'.padEnd(8) + 'Z flag'.padEnd(8)
    + 'A ret'.padEnd(8) + 'Steps'.padEnd(8) + 'D005xx writes');
  console.log('  ' + '-'.repeat(72));

  for (const tc of testChars) {
    // Save initial D005xx snapshot (0xD00500 - 0xD005FF)
    const d005Before = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      d005Before[i] = mem[0xD00500 + i];
    }

    // Reset CPU state for this test
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_RESET_TOP - 3;
    mem[cpu.sp] = 0xFF;
    mem[cpu.sp + 1] = 0xFF;
    mem[cpu.sp + 2] = 0xFF;
    cpu._iy = 0xD00080;
    cpu.a = tc.code;
    cpu.f = 0x00;  // Clear all flags

    // Set cursor position
    mem[CURSOR_ROW_ADDR] = 3;
    mem[CURSOR_COL_ADDR] = 10;

    purgeRamBlocks(executor);

    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 1000,
      maxLoopIterations: 50,
    });

    const zFlag = (cpu.f & FLAG_Z_BIT) !== 0;
    const aRet = cpu.a;
    const steps = result.steps ?? result.stepCount ?? '?';

    // Check D005xx changes
    const d005Changes = [];
    for (let i = 0; i < 256; i++) {
      if (mem[0xD00500 + i] !== d005Before[i]) {
        d005Changes.push(
          `+${i.toString(16).padStart(2, '0')}:${d005Before[i].toString(16).padStart(2, '0')}->${mem[0xD00500 + i].toString(16).padStart(2, '0')}`
        );
      }
    }

    const changesStr = d005Changes.length > 0
      ? d005Changes.slice(0, 6).join(' ') + (d005Changes.length > 6 ? ` (+${d005Changes.length - 6} more)` : '')
      : 'none';

    console.log('  '
      + tc.name.padEnd(10)
      + hex(tc.code, 2).padEnd(8)
      + (zFlag ? 'Z' : 'NZ').padEnd(8)
      + hex(aRet, 2).padEnd(8)
      + String(steps).padEnd(8)
      + changesStr
    );
  }

  console.log('');

  // Summary
  console.log('  Z = normal render path in putchar (0x061980)');
  console.log('  NZ = alternate path at 0x0619B3');
  console.log('');
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

staticDisassembly();
dynamicTests();

console.log('Phase 497 probe complete.');
