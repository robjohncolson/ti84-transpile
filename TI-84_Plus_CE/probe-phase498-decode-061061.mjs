#!/usr/bin/env node
/**
 * Phase 498 - Decode 0x061061 (Cursor Draw Function)
 *
 * Part 1: Static disassembly of 0x061061
 *   - Loads cursor type from D02575, calls putchar (0x061980)
 *   - Track all CALL targets, memory refs (D02575, D00595, D00596, D008D2)
 *   - Note cursor glyph codes (0xE1, 0xE2, 0xE3)
 *
 * Part 2: Dynamic execution
 *   - Set cursor at row=5, col=10, cursor type=0xE1
 *   - Capture VRAM before/after, report pixel changes and bounding box
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

// -- constants --

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
const CURSOR_COL2_ADDR = 0xD02505;
const CURSOR_TYPE_ADDR = 0xD02575;

const TARGET_ADDR = 0x061061;

// Known addresses for labeling
const KNOWN_ADDRS = {
  0xD00595: 'CURSOR_ROW',
  0xD00596: 'CURSOR_COL',
  0xD02505: 'CURSOR_COL2',
  0xD02575: 'CURSOR_TYPE',
  0xD008D2: 'LCD_WINDOW_LOW',
  0xD008D3: 'LCD_WINDOW_LOW+1',
  0xD008D4: 'LCD_WINDOW_LOW+2',
  0xD008D5: 'LCD_WINDOW_HIGH',
  0xD008D6: 'LCD_WINDOW_HIGH+1',
  0xD008D7: 'LCD_WINDOW_HIGH+2',
  0xD0008D: 'IY+0x0D (cursor flags)',
  0xD00080: 'IY_BASE',
};

const KNOWN_CALLS = {
  0x061980: 'PUTCHAR',
  0x061434: 'MODE_GATE',
  0x06002D: 'ROW_COL_TO_VRAM',
  0x0A23E5: 'PIXEL_RENDERER',
};

// -- helpers --

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
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

  if (instr.condition) parts.push('cond=' + instr.condition);
  if (instr.target !== undefined) parts.push('target=' + hex(instr.target));
  if (instr.addr !== undefined) parts.push('addr=' + hex(instr.addr));
  if (instr.value !== undefined) parts.push('val=' + hex(instr.value, 2));
  if (instr.pair) parts.push('pair=' + instr.pair);
  if (instr.dest) parts.push('dest=' + instr.dest);
  if (instr.src) parts.push('src=' + instr.src);
  if (instr.op) parts.push('op=' + instr.op);
  if (instr.bit !== undefined) parts.push('bit=' + instr.bit);
  if (instr.indexRegister) parts.push('idx=' + instr.indexRegister);
  if (instr.displacement !== undefined) parts.push('disp=' + instr.displacement);
  if (instr.operation) parts.push('operation=' + instr.operation);
  if (instr.reg) parts.push('reg=' + instr.reg);
  if (instr.indirectRegister) parts.push('ind=' + instr.indirectRegister);

  return parts.join(' ');
}

function labelAddr(addr) {
  if (KNOWN_ADDRS[addr]) return ' (' + KNOWN_ADDRS[addr] + ')';
  if (addr >= 0xD40000 && addr < 0xD4C000) return ' (VRAM)';
  if (addr >= 0xD02500 && addr < 0xD02600) return ' (CURSOR_AREA)';
  if (addr >= 0xD00000 && addr < 0xD10000) return ' (OS RAM)';
  return '';
}

function labelCall(target) {
  if (KNOWN_CALLS[target]) return ' [' + KNOWN_CALLS[target] + ']';
  return '';
}

// ================================================================
// Part 1: Static Disassembly
// ================================================================

function staticDisassembly() {
  console.log('=== Part 1: Static Disassembly of 0x061061 (Cursor Draw) ===\n');

  const instructions = [];
  const callTargets = [];
  const jpTargets = [];
  const memRefs = [];
  const immediateValues = [];
  let pc = TARGET_ADDR;
  const maxPc = TARGET_ADDR + 200;

  while (pc < maxPc) {
    const instr = decodeInstruction(romBytes, pc, 'adl');
    if (!instr) {
      console.log('  Decode failed at ' + hex(pc));
      break;
    }

    // Format raw bytes
    const rawBytes = [];
    for (let i = 0; i < instr.length; i++) {
      rawBytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
    }

    const tag = instr.tag || '???';
    const desc = formatInstr(instr);
    const line = hex(pc) + ': ' + rawBytes.join(' ').padEnd(18) + ' ' + desc;
    instructions.push({ pc, line, instr });

    // Collect CALL targets
    if (tag === 'call' || tag === 'call-conditional') {
      callTargets.push({ from: pc, target: instr.target, cond: instr.condition || '' });
    }

    // Collect JP targets
    if (tag === 'jp' || tag === 'jp-conditional' || tag === 'jp-indirect') {
      jpTargets.push({ from: pc, target: instr.target, cond: instr.condition || '', indirect: tag === 'jp-indirect' });
    }

    // Scan for 24-bit address references in raw bytes
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
      if (addr24 >= 0xD02500 && addr24 < 0xD02600) {
        memRefs.push({ pc, addr: addr24, type: 'CURSOR_AREA' });
      }
    }

    // Check for cursor glyph immediate values
    if (instr.value !== undefined) {
      const v = instr.value;
      if (v === 0xE1 || v === 0xE2 || v === 0xE3) {
        immediateValues.push({ pc, value: v, note: 'cursor glyph 0x' + v.toString(16).toUpperCase() });
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
    console.log('  ' + line);
  }

  // Summary: call targets
  console.log('\n  CALL targets: ' + callTargets.length);
  for (const c of callTargets) {
    console.log('    ' + hex(c.from) + ' -> ' + hex(c.target) + labelCall(c.target) + (c.cond ? ' (' + c.cond + ')' : ''));
  }

  // Summary: JP targets
  console.log('\n  JP targets: ' + jpTargets.length);
  for (const j of jpTargets) {
    console.log('    ' + hex(j.from) + ' -> ' + (j.indirect ? '(indirect)' : hex(j.target)) + (j.cond ? ' (' + j.cond + ')' : ''));
  }

  // Summary: memory refs
  console.log('\n  Memory references: ' + memRefs.length);
  for (const r of memRefs) {
    console.log('    ' + hex(r.pc) + ': ref ' + hex(r.addr) + labelAddr(r.addr));
  }

  // Summary: cursor glyph immediates
  if (immediateValues.length > 0) {
    console.log('\n  Cursor glyph immediates: ' + immediateValues.length);
    for (const v of immediateValues) {
      console.log('    ' + hex(v.pc) + ': ' + hex(v.value, 2) + ' -- ' + v.note);
    }
  }

  console.log('');
}

// ================================================================
// Part 2: Dynamic Execution
// ================================================================

function dynamicExecution() {
  console.log('=== Part 2: Dynamic Execution of 0x061061 ===\n');
  console.log('Setup: row=5, col=10, cursor type=0xE1, IY=0xD00080\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  // Fill VRAM with 0xFF (white) so we can detect changed pixels
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot to initialize OS state
  coldBoot(executor, cpu, mem);

  // Capture VRAM before
  const vramBefore = new Uint8Array(VRAM_BYTE_SIZE);
  vramBefore.set(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));

  // Set cursor position
  mem[CURSOR_ROW_ADDR] = 5;
  mem[CURSOR_COL_ADDR] = 10;
  mem[CURSOR_COL2_ADDR] = 10;

  // Set cursor type
  mem[CURSOR_TYPE_ADDR] = 0xE1;

  // Set cursor visible flag: bit 2 of (IY+0x0D) = D0008D
  mem[0xD0008D] |= 0x04;

  // Record key memory values before
  console.log('  Pre-execution memory state:');
  console.log('    D00595 (row):         ' + hex(mem[CURSOR_ROW_ADDR], 2));
  console.log('    D00596 (col):         ' + hex(mem[CURSOR_COL_ADDR], 2));
  console.log('    D02505 (col2):        ' + hex(mem[CURSOR_COL2_ADDR], 2));
  console.log('    D02575 (cursor type): ' + hex(mem[CURSOR_TYPE_ADDR], 2));
  console.log('    D0008D (flags):       ' + hex(mem[0xD0008D], 2));
  const d2before = mem[0xD008D2] | (mem[0xD008D3] << 8) | (mem[0xD008D4] << 16);
  const d5before = mem[0xD008D5] | (mem[0xD008D6] << 8) | (mem[0xD008D7] << 16);
  console.log('    D008D2 (24-bit):      ' + hex(d2before));
  console.log('    D008D5 (24-bit):      ' + hex(d5before));
  console.log('');

  // Prepare CPU
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  // Clear registers
  cpu.a = 0;
  cpu.f = 0;
  cpu._bc = 0;
  cpu._de = 0;
  cpu._hl = 0;
  cpu._ix = 0;

  purgeRamBlocks(executor);

  // Execute
  let stepsUsed = 0;
  let termination = 'unknown';
  let lastPc = 0;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 5000,
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

  console.log('  Steps:       ' + stepsUsed);
  console.log('  Termination: ' + termination);
  console.log('  Last PC:     ' + hex(lastPc));
  console.log('');

  // Register dump
  console.log('  Registers after return:');
  console.log('    A  = ' + hex(cpu.a, 2) + '    F  = ' + hex(cpu.f, 2));
  console.log('    BC = ' + hex(cpu._bc) + '     B  = ' + hex((cpu._bc >> 8) & 0xFF, 2) + '  C  = ' + hex(cpu._bc & 0xFF, 2));
  console.log('    DE = ' + hex(cpu._de) + '     D  = ' + hex((cpu._de >> 8) & 0xFF, 2) + '  E  = ' + hex(cpu._de & 0xFF, 2));
  console.log('    HL = ' + hex(cpu._hl) + '     H  = ' + hex((cpu._hl >> 8) & 0xFF, 2) + '  L  = ' + hex(cpu._hl & 0xFF, 2));
  console.log('    IX = ' + hex(cpu._ix));
  console.log('    IY = ' + hex(cpu._iy));
  console.log('    SP = ' + hex(cpu.sp));
  console.log('');

  // Post-execution memory
  console.log('  Post-execution memory state:');
  console.log('    D00595 (row):         ' + hex(mem[CURSOR_ROW_ADDR], 2));
  console.log('    D00596 (col):         ' + hex(mem[CURSOR_COL_ADDR], 2));
  console.log('    D02505 (col2):        ' + hex(mem[CURSOR_COL2_ADDR], 2));
  console.log('    D02575 (cursor type): ' + hex(mem[CURSOR_TYPE_ADDR], 2));
  console.log('    D0008D (flags):       ' + hex(mem[0xD0008D], 2));
  const d2after = mem[0xD008D2] | (mem[0xD008D3] << 8) | (mem[0xD008D4] << 16);
  const d5after = mem[0xD008D5] | (mem[0xD008D6] << 8) | (mem[0xD008D7] << 16);
  console.log('    D008D2 (24-bit):      ' + hex(d2after));
  console.log('    D008D5 (24-bit):      ' + hex(d5after));
  console.log('');

  // VRAM diff analysis
  const vramAfter = mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
  let changedPixels = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let i = 0; i < VRAM_BYTE_SIZE; i += 2) {
    const before16 = vramBefore[i] | (vramBefore[i + 1] << 8);
    const after16 = vramAfter[i] | (vramAfter[i + 1] << 8);
    if (before16 !== after16) {
      changedPixels++;
      const pixelIndex = i / 2;
      const row = Math.floor(pixelIndex / VRAM_WIDTH);
      const col = pixelIndex % VRAM_WIDTH;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  console.log('  VRAM diff:');
  console.log('    Pixels changed: ' + changedPixels);
  if (changedPixels > 0) {
    console.log('    Bounding box:   rows ' + minRow + '-' + maxRow + ', cols ' + minCol + '-' + maxCol);
    console.log('    Box size:       ' + (maxRow - minRow + 1) + ' rows x ' + (maxCol - minCol + 1) + ' cols');

    // Show first 20 changed pixels
    let shown = 0;
    console.log('    First changed pixels (up to 20):');
    for (let i = 0; i < VRAM_BYTE_SIZE && shown < 20; i += 2) {
      const before16 = vramBefore[i] | (vramBefore[i + 1] << 8);
      const after16 = vramAfter[i] | (vramAfter[i + 1] << 8);
      if (before16 !== after16) {
        const pixelIndex = i / 2;
        const row = Math.floor(pixelIndex / VRAM_WIDTH);
        const col = pixelIndex % VRAM_WIDTH;
        console.log('      pixel(' + row + ',' + col + '): ' + hex(before16, 4) + ' -> ' + hex(after16, 4));
        shown++;
      }
    }
  } else {
    console.log('    (no VRAM changes detected)');
  }

  console.log('');
}

// ================================================================
// Main
// ================================================================

staticDisassembly();
dynamicExecution();

console.log('=== DONE ===');
