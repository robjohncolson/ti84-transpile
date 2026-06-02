#!/usr/bin/env node
/**
 * Phase 498 — Decode 0x096CCF (Cursor Show/Erase Subroutine)
 *
 * 0x096CCF is called from both paths of the cursor blink toggle at 0x096BEE:
 *   - When cursor NOT drawn (bit 2 of (IY+0x0D) = 0): JP 0x096CCF to draw
 *   - When cursor IS drawn (bit 2 = 1): RES 2, CALL 0x096CCF to erase, SET 2
 *
 * Part 1: Static disassembly from 0x096CCF until RET or 300 bytes
 * Part 2: Dynamic test — DRAW path (bit 2 clear)
 * Part 3: Dynamic test — ERASE path (bit 2 set)
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

const TARGET_ADDR = 0x096CCF;

const CURSOR_ROW_ADDR = 0xD00595;
const CURSOR_COL_ADDR = 0xD00596;
const CURSOR_COL_DUP = 0xD02505;
const CURSOR_TYPE_ADDR = 0xD02575;
const IY_BASE = 0xD00080;
const CURSOR_FLAGS_ADDR = IY_BASE + 0x0D;  // 0xD0008D

// Known subroutine addresses
const KNOWN_ADDRS = {
  0x061980: 'putchar',
  0x061003: 'cursor_erase',
  0x061061: 'cursor_draw',
  0x060EF5: 'cursor_blink_orchestrator',
  0x096BEE: 'cursor_blink_toggle',
  0x096CCF: 'cursor_show_sub (self)',
  0x096BC3: 'cursor_blink_wrapper',
  0x096BE5: 'cursor_blink_entry',
  0x07F9FB: 'pre_blink_setup',
  0x096F67: 'unknown_096F67',
  0x096C26: 'unknown_096C26',
};

// ── helpers ────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatInstruction(inst) {
  const tag = inst.tag || '???';

  // Simple single-word instructions
  const simpleMap = {
    'nop': 'NOP', 'ret': 'RET', 'exx': 'EXX', 'cpl': 'CPL', 'scf': 'SCF',
    'ccf': 'CCF', 'daa': 'DAA', 'halt': 'HALT', 'di': 'DI', 'ei': 'EI',
    'rlca': 'RLCA', 'rrca': 'RRCA', 'rla': 'RLA', 'rra': 'RRA',
    'ex-af': "EX AF,AF'", 'neg': 'NEG', 'reti': 'RETI', 'retn': 'RETN',
    'rld': 'RLD', 'rrd': 'RRD',
    'ldi': 'LDI', 'ldd': 'LDD', 'ldir': 'LDIR', 'lddr': 'LDDR',
    'cpi': 'CPI', 'cpd': 'CPD', 'cpir': 'CPIR', 'cpdr': 'CPDR',
    'ini': 'INI', 'ind': 'IND', 'inir': 'INIR', 'indr': 'INDR',
    'outi': 'OUTI', 'outd': 'OUTD', 'otir': 'OTIR', 'otdr': 'OTDR',
  };
  if (simpleMap[tag]) return simpleMap[tag];

  switch (tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;

    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${(inst.dest || inst.reg || '?').toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-mem': return `LD ${(inst.dest || inst.reg || 'A').toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-sp-hl': return 'LD SP,HL';

    case 'ld-idx-disp-reg': return `LD (${inst.indexReg.toUpperCase()}+${inst.displacement}),${inst.src.toUpperCase()}`;
    case 'ld-reg-idx-disp': return `LD ${inst.dest.toUpperCase()},(${inst.indexReg.toUpperCase()}+${inst.displacement})`;
    case 'ld-idx-disp-imm': return `LD (${inst.indexReg.toUpperCase()}+${inst.displacement}),${hex(inst.value, 2)}`;

    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'ex-de-hl': return 'EX DE,HL';

    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.reg ? inst.reg.toUpperCase() : 'A'}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-idx-disp': return `${inst.op.toUpperCase()} (${inst.indexReg.toUpperCase()}+${inst.displacement})`;

    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-ind': return `INC (${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'dec-ind': return `DEC (${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'inc-idx-disp': return `INC (${inst.indexReg.toUpperCase()}+${inst.displacement})`;
    case 'dec-idx-disp': return `DEC (${inst.indexReg.toUpperCase()}+${inst.displacement})`;

    case 'add-pair': return `ADD ${(inst.dest || 'HL').toUpperCase()},${(inst.src || inst.pair || '?').toUpperCase()}`;

    case 'bit-test': return `BIT ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'bit-reset': return `RES ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-reset-ind': return `RES ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;

    case 'bit-test-idx': return `BIT ${inst.bit},(${inst.indexReg.toUpperCase()}+${inst.displacement})`;
    case 'bit-set-idx': return `SET ${inst.bit},(${inst.indexReg.toUpperCase()}+${inst.displacement})`;
    case 'bit-reset-idx': return `RES ${inst.bit},(${inst.indexReg.toUpperCase()}+${inst.displacement})`;

    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (${(inst.indirectRegister || 'HL').toUpperCase()})`;

    case 'out-imm': return `OUT (${hex(inst.port, 2)}),A`;
    case 'in-imm': return `IN A,(${hex(inst.port, 2)})`;
    case 'out-c': return `OUT (C),${inst.reg.toUpperCase()}`;
    case 'in-c': return `IN ${inst.reg.toUpperCase()},(C)`;

    case 'im': return `IM ${inst.mode}`;
    case 'ld-i-a': return 'LD I,A';
    case 'ld-a-i': return 'LD A,I';
    case 'ld-r-a': return 'LD R,A';
    case 'ld-a-r': return 'LD A,R';
    case 'sbc-pair': return `SBC HL,${inst.pair.toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem-ed':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;

    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;

    // DD/FD prefix index register variants
    case 'ld-reg-ixd': return `LD ${(inst.dest || '?').toUpperCase()},(${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'ld-ixd-reg': return `LD (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement}),${(inst.src || '?').toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement}),${hex(inst.value, 2)}`;
    case 'inc-ixd': return `INC (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'dec-ixd': return `DEC (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'alu-ixd': return `${inst.op.toUpperCase()} (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;

    // DDCB/FDCB prefix bit operations on (IX/IY+d)
    case 'bit-test-ixd': return `BIT ${inst.bit},(${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'bit-set-ixd': return `SET ${inst.bit},(${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'bit-reset-ixd': return `RES ${inst.bit},(${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;
    case 'rotate-ixd': return `${inst.op.toUpperCase()} (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement})`;

    default: return `[${tag}]${inst.target !== undefined ? ' ' + hex(inst.target) : ''}${inst.addr !== undefined ? ' (' + hex(inst.addr) + ')' : ''}`;
  }
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
  cpu._iy = IY_BASE;
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

function snapshotVRAM(mem) {
  return new Uint8Array(mem.buffer, VRAM_BASE, VRAM_BYTE_SIZE).slice();
}

function compareVRAM(before, after) {
  let changedPixels = 0;
  let minX = VRAM_WIDTH, maxX = -1;
  let minY = VRAM_HEIGHT, maxY = -1;

  for (let i = 0; i < VRAM_BYTE_SIZE; i += 2) {
    const pixelBefore = before[i] | (before[i + 1] << 8);
    const pixelAfter = after[i] | (after[i + 1] << 8);
    if (pixelBefore !== pixelAfter) {
      changedPixels++;
      const pixelIndex = i / 2;
      const x = pixelIndex % VRAM_WIDTH;
      const y = Math.floor(pixelIndex / VRAM_WIDTH);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return {
    changedPixels,
    boundingBox: changedPixels > 0
      ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
      : null,
  };
}

// ════════════════════════════════════════════════════════════════════
// Part 1: Static disassembly of 0x096CCF
// ════════════════════════════════════════════════════════════════════

console.log('=== Part 1: Static Disassembly of 0x096CCF ===\n');

let pc = TARGET_ADDR;
const endLimit = TARGET_ADDR + 300;
let foundRet = false;

while (pc < endLimit && pc < romBytes.length) {
  let inst;
  try {
    inst = decodeInstruction(romBytes, pc, 'adl');
  } catch (e) {
    console.log(`  ${hex(pc)}: ${romBytes[pc].toString(16).padStart(2, '0')}              (decode error)`);
    pc++;
    continue;
  }

  if (!inst || inst.length === 0) {
    console.log(`  ${hex(pc)}: ${romBytes[pc].toString(16).padStart(2, '0')}              ???`);
    pc++;
    continue;
  }

  const bytes = [];
  for (let i = 0; i < inst.length; i++) {
    bytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
  }

  const formatted = formatInstruction(inst);
  let annotation = '';

  // Annotate CALL/JP targets
  if (inst.target !== undefined && KNOWN_ADDRS[inst.target]) {
    annotation = `  ; ${KNOWN_ADDRS[inst.target]}`;
  }

  // Annotate known memory addresses
  const addrPatterns = [
    { addr: 0xD02575, name: 'cursor_type' },
    { addr: 0xD00595, name: 'cursor_row' },
    { addr: 0xD00596, name: 'cursor_col' },
    { addr: 0xD02505, name: 'cursor_col_dup' },
    { addr: 0xD0008D, name: '(IY+0x0D)' },
  ];
  for (const ap of addrPatterns) {
    if (inst.addr === ap.addr) {
      annotation += `  ; ${ap.name}`;
    }
  }

  console.log(`  ${hex(pc)}: ${bytes.join(' ').padEnd(18)} ${formatted}${annotation}`);

  // Stop at unconditional RET
  if (inst.tag === 'ret') {
    foundRet = true;
    pc = inst.nextPc;
    break;
  }

  pc = inst.nextPc;
}

if (!foundRet) {
  console.log(`  (no RET found within 300 bytes)`);
}

// Continue disassembly past first RET for context
console.log('\n  --- continuation past first RET (20 more bytes) ---');
const contEnd = Math.min(pc + 20, romBytes.length);
let contPc = pc;
while (contPc < contEnd) {
  try {
    const inst = decodeInstruction(romBytes, contPc, 'adl');
    if (!inst || inst.length === 0) {
      console.log(`  ${hex(contPc)}: ${romBytes[contPc].toString(16).padStart(2, '0')}              ???`);
      contPc++;
      continue;
    }
    const bytes = [];
    for (let i = 0; i < inst.length; i++) {
      bytes.push(romBytes[contPc + i].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(contPc)}: ${bytes.join(' ').padEnd(18)} ${formatInstruction(inst)}`);
    contPc = inst.nextPc;
  } catch (e) {
    console.log(`  ${hex(contPc)}: ${romBytes[contPc].toString(16).padStart(2, '0')}              (decode error)`);
    contPc++;
  }
}

// ════════════════════════════════════════════════════════════════════
// Identify key references (CALL/JP targets in the subroutine)
// ════════════════════════════════════════════════════════════════════

console.log('\n=== Key CALL/JP Targets Found ===\n');

let scanPc = TARGET_ADDR;
const scanEnd = pc;
const callTargets = [];

while (scanPc < scanEnd && scanPc < romBytes.length) {
  try {
    const inst = decodeInstruction(romBytes, scanPc, 'adl');
    if (!inst || inst.length === 0) { scanPc++; continue; }

    const tag = inst.tag || '';
    const isCallOrJp = tag === 'call' || tag === 'call-conditional'
      || tag === 'jp' || tag === 'jp-conditional';

    if (isCallOrJp && inst.target !== undefined) {
      const name = KNOWN_ADDRS[inst.target] || 'unknown';
      callTargets.push({ from: scanPc, tag, target: inst.target, name });
    }

    scanPc = inst.nextPc;
  } catch (e) {
    scanPc++;
  }
}

for (const ct of callTargets) {
  console.log(`  ${hex(ct.from)}: ${ct.tag} ${hex(ct.target)} -- ${ct.name}`);
}

if (callTargets.length === 0) {
  console.log('  (no CALL/JP targets found)');
}

const callsDraw = callTargets.some(t => t.target === 0x061061);
const callsErase = callTargets.some(t => t.target === 0x061003);
console.log(`\n  Directly calls 0x061061 (cursor_draw): ${callsDraw ? 'YES' : 'no'}`);
console.log(`  Directly calls 0x061003 (cursor_erase): ${callsErase ? 'YES' : 'no'}`);

// ════════════════════════════════════════════════════════════════════
// Part 2: Dynamic Test — DRAW path (bit 2 clear)
// ════════════════════════════════════════════════════════════════════

console.log('\n=== Part 2: Dynamic Test — DRAW Path (bit 2 of D0008D = 0) ===\n');

{
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Setup cursor state
  mem[CURSOR_ROW_ADDR] = 5;
  mem[CURSOR_COL_ADDR] = 10;
  mem[CURSOR_COL_DUP] = 10;
  mem[CURSOR_TYPE_ADDR] = 0xE1;  // insert cursor

  // CLEAR bit 2 of D0008D — cursor NOT drawn, subroutine should DRAW
  mem[CURSOR_FLAGS_ADDR] = mem[CURSOR_FLAGS_ADDR] & ~0x04;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;
  cpu._iy = IY_BASE;

  purgeRamBlocks(executor);

  const vramBefore = snapshotVRAM(mem);
  const flagsBefore = mem[CURSOR_FLAGS_ADDR];

  console.log(`  Before: D0008D = ${hex(flagsBefore, 2)}, bit 2 = ${(flagsBefore >> 2) & 1}`);
  console.log(`  Cursor: row=${mem[CURSOR_ROW_ADDR]}, col=${mem[CURSOR_COL_ADDR]}, type=${hex(mem[CURSOR_TYPE_ADDR], 2)}`);

  const result = executor.runFrom(TARGET_ADDR, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 5000,
  });

  const vramAfter = snapshotVRAM(mem);
  const flagsAfter = mem[CURSOR_FLAGS_ADDR];
  const vramDiff = compareVRAM(vramBefore, vramAfter);

  const steps = result.steps ?? result.stepCount ?? '?';
  const stopReason = result.reason ?? result.stopReason ?? 'unknown';

  console.log(`  After:  D0008D = ${hex(flagsAfter, 2)}, bit 2 = ${(flagsAfter >> 2) & 1}`);
  console.log(`  Steps: ${steps}, stop reason: ${stopReason}`);
  console.log(`  VRAM pixels changed: ${vramDiff.changedPixels}`);
  if (vramDiff.boundingBox) {
    const bb = vramDiff.boundingBox;
    console.log(`  Bounding box: x=${bb.x}, y=${bb.y}, w=${bb.w}, h=${bb.h}`);
  } else {
    console.log('  Bounding box: (no change)');
  }

  console.log(`  Final cursor row: ${mem[CURSOR_ROW_ADDR]}, col: ${mem[CURSOR_COL_ADDR]}`);
  console.log(`  Final cursor type: ${hex(mem[CURSOR_TYPE_ADDR], 2)}`);
  console.log(`  Final PC: ${hex(cpu.pc)}`);
}

// ════════════════════════════════════════════════════════════════════
// Part 3: Dynamic Test — ERASE path (bit 2 set)
// ════════════════════════════════════════════════════════════════════

console.log('\n=== Part 3: Dynamic Test — ERASE Path (bit 2 of D0008D = 1) ===\n');

{
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Setup cursor state
  mem[CURSOR_ROW_ADDR] = 5;
  mem[CURSOR_COL_ADDR] = 10;
  mem[CURSOR_COL_DUP] = 10;
  mem[CURSOR_TYPE_ADDR] = 0xE1;

  // SET bit 2 of D0008D — cursor IS drawn, subroutine should ERASE
  mem[CURSOR_FLAGS_ADDR] = mem[CURSOR_FLAGS_ADDR] | 0x04;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;
  cpu._iy = IY_BASE;

  purgeRamBlocks(executor);

  const vramBefore = snapshotVRAM(mem);
  const flagsBefore = mem[CURSOR_FLAGS_ADDR];

  console.log(`  Before: D0008D = ${hex(flagsBefore, 2)}, bit 2 = ${(flagsBefore >> 2) & 1}`);
  console.log(`  Cursor: row=${mem[CURSOR_ROW_ADDR]}, col=${mem[CURSOR_COL_ADDR]}, type=${hex(mem[CURSOR_TYPE_ADDR], 2)}`);

  const result = executor.runFrom(TARGET_ADDR, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 5000,
  });

  const vramAfter = snapshotVRAM(mem);
  const flagsAfter = mem[CURSOR_FLAGS_ADDR];
  const vramDiff = compareVRAM(vramBefore, vramAfter);

  const steps = result.steps ?? result.stepCount ?? '?';
  const stopReason = result.reason ?? result.stopReason ?? 'unknown';

  console.log(`  After:  D0008D = ${hex(flagsAfter, 2)}, bit 2 = ${(flagsAfter >> 2) & 1}`);
  console.log(`  Steps: ${steps}, stop reason: ${stopReason}`);
  console.log(`  VRAM pixels changed: ${vramDiff.changedPixels}`);
  if (vramDiff.boundingBox) {
    const bb = vramDiff.boundingBox;
    console.log(`  Bounding box: x=${bb.x}, y=${bb.y}, w=${bb.w}, h=${bb.h}`);
  } else {
    console.log('  Bounding box: (no change)');
  }

  console.log(`  Final cursor row: ${mem[CURSOR_ROW_ADDR]}, col: ${mem[CURSOR_COL_ADDR]}`);
  console.log(`  Final cursor type: ${hex(mem[CURSOR_TYPE_ADDR], 2)}`);
  console.log(`  Final PC: ${hex(cpu.pc)}`);
}

// ════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║ 0x096CCF CURSOR SHOW/ERASE SUBROUTINE — ANALYSIS COMPLETE  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\nDone.');
