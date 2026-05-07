#!/usr/bin/env node

/**
 * Phase 221 Probe: 2-Byte Token Insertion with 2nd-Mode and ALPHA Flags
 *
 * Session 220 found that 2-byte token scan codes return 0x00 from the primary
 * ConvKeyToTok table because secondary tables need mode/context flags armed.
 *
 * This probe:
 *  Part A: Disassemble ConvKeyToTok at 0x05E630 to find BIT/SET/RES on IY flags
 *  Part B: Dynamic trace with default flags — watch IY reads
 *  Part C: Test with 2nd-mode flag armed
 *  Part D: Test with ALPHA flag armed
 *  Part E: Cross-reference — print tokens and edit buffer contents
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(ROM_PATH);

// --- Constants ---
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const TRACE_RET = 0x7FFFFE;
const MEM_INIT_RET = 0x7FFFF6;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY5_ADDR = 0xD00085;    // IY+5
const IY12_ADDR = 0xD0008C;   // IY+12

const CONV_KEY_TO_TOK = 0x05E630;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;

const PRI_TABLE_BASE = 0x05BF84;
const SEC_TABLE_FUNC = 0x05C01D;     // function tokens (400 entries)
const SEC_TABLE_2ND = 0x05C1B0;      // 2nd-mode tokens (400 entries)
const SEC_TABLE_ALPHA = 0x05C3AA;    // Alpha-mode tokens (264 entries)
const SEC_TABLE_ALPHALOCK = 0x05C4A0; // Alpha-Lock tokens (18 entries)

const TRACE_MAX_STEPS = 2000;
const TRACE_MAX_LOOP_ITERATIONS = 512;

// Test scan codes that return 0x00 from primary table
const TEST_SCAN_CODES = [
  { scanCode: 0x76, label: 'log/sin-1', desc: 'should give log( from func, sin-1( from 2nd' },
  { scanCode: 0x5B, label: 'abs/transpose', desc: 'should give abs( from func, transpose from 2nd' },
  { scanCode: 0x69, label: 'cos-1/tan-1', desc: 'should give cos-1( from func, tan-1( from 2nd' },
  { scanCode: 0x7B, label: 'Y1/Y2', desc: 'should give Y1 from func, Y2 from 2nd' },
];

// --- Token name lookup ---
const TOKEN_NAMES = {
  0x04: 'STO->', 0x06: '[', 0x07: ']', 0x08: '{', 0x09: '}',
  0x0A: 'r', 0x0B: 'deg', 0x0C: 'x-inv', 0x0D: 'x-sq', 0x0E: 'T',
  0x0F: 'e^x',
  0x10: 'negate', 0x11: 'Ans', 0x12: 'getKey', 0x13: 'EE',
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0x3A: '.', 0x3B: 'EE',
  0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D',
  0x45: 'E', 0x46: 'F', 0x47: 'G', 0x48: 'H', 0x49: 'I',
  0x4A: 'J', 0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N',
  0x4F: 'O', 0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S',
  0x54: 'T', 0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X',
  0x59: 'Y', 0x5A: 'Z', 0x5B: 'theta',
  0x70: '+', 0x71: '-', 0x82: '*', 0x83: '/',
  0xA1: 'abs(', 0xA2: 'transpose',
  0xAB: 'sin(', 0xAC: 'cos(', 0xAD: 'tan(', 0xAE: 'asin(',
  0xB0: '(', 0xB1: ')',
  0xB2: 'e^(', 0xB3: '10^(', 0xB4: 'sqrt(', 0xB5: 'ln(',
  0xB6: 'log(', 0xB7: 'sin-1(',
  0xB9: 'cos-1(', 0xBA: 'tan-1(',
  0xF0: '^', 0xF1: 'sqrt(',
  0xF3: 'Y1', 0xF4: 'Y2', 0xF5: 'Y3', 0xF6: 'Y4',
};

function tokenName(byte) {
  return TOKEN_NAMES[byte & 0xFF] ?? '';
}

// --- Helpers ---
function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE221_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

// --- Boot/runtime setup ---
function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedKeyboard(mem, scanCode) {
  const value = scanCode & 0xFF;
  mem[KBD_RAW_SCAN] = value;
  mem[KBD_KEY] = value;
  mem[KBD_GETKY] = value;
  mem[KBD_GETCSC_SCAN] = value;
}

// --- Boot baseline ---
function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return');
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE221_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log('Boot baseline');
  console.log(`  memInit returned: ${memInitReturned}`);

  return { memory: new Uint8Array(mem) };
}

// ========== PART A: Disassemble ConvKeyToTok ==========
function partA() {
  console.log('\n========== PART A: Disassemble ConvKeyToTok at 0x05E630 (128 bytes) ==========');

  const startAddr = CONV_KEY_TO_TOK;
  const endAddr = startAddr + 128;
  let pc = startAddr;
  const instructions = [];

  while (pc < endAddr) {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr || instr.length === 0) {
      console.log(`  ${hex(pc)}: ?? (decode failed)`);
      pc += 1;
      continue;
    }

    const rawBytes = bytesToHex(rom, pc, instr.length);
    let disasm = instr.tag || '??';

    // Build a human-readable disassembly
    if (instr.tag === 'bit-test' || instr.tag === 'bit-test-ind') {
      disasm = `BIT ${instr.bit}, ${instr.reg ?? `(${instr.indirectRegister})`}`;
    } else if (instr.tag === 'bit-set' || instr.tag === 'bit-set-ind') {
      disasm = `SET ${instr.bit}, ${instr.reg ?? `(${instr.indirectRegister})`}`;
    } else if (instr.tag === 'bit-res' || instr.tag === 'bit-res-ind') {
      disasm = `RES ${instr.bit}, ${instr.reg ?? `(${instr.indirectRegister})`}`;
    } else if (instr.tag === 'ld-reg-imm8') {
      disasm = `LD ${instr.dest}, ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'ld-reg16-imm') {
      disasm = `LD ${instr.dest}, ${hex(instr.imm, 6)}`;
    } else if (instr.tag === 'ld-reg-reg') {
      disasm = `LD ${instr.dest}, ${instr.src}`;
    } else if (instr.tag === 'ld-reg-ind') {
      disasm = `LD ${instr.dest}, (${instr.indirectRegister})`;
    } else if (instr.tag === 'ld-ind-reg') {
      disasm = `LD (${instr.indirectRegister}), ${instr.src}`;
    } else if (instr.tag === 'jp-abs') {
      disasm = `JP ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'jp-cc') {
      disasm = `JP ${instr.cc}, ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'jr-rel') {
      disasm = `JR ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'jr-cc') {
      disasm = `JR ${instr.cc}, ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'call-abs') {
      disasm = `CALL ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'call-cc') {
      disasm = `CALL ${instr.cc}, ${hex(instr.target, 6)}`;
    } else if (instr.tag === 'ret') {
      disasm = 'RET';
    } else if (instr.tag === 'ret-cc') {
      disasm = `RET ${instr.cc}`;
    } else if (instr.tag === 'push') {
      disasm = `PUSH ${instr.reg}`;
    } else if (instr.tag === 'pop') {
      disasm = `POP ${instr.reg}`;
    } else if (instr.tag === 'cp-imm8') {
      disasm = `CP ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'cp-reg') {
      disasm = `CP ${instr.src}`;
    } else if (instr.tag === 'add-hl-reg16') {
      disasm = `ADD HL, ${instr.src}`;
    } else if (instr.tag === 'sub-imm8') {
      disasm = `SUB ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'and-imm8') {
      disasm = `AND ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'or-imm8') {
      disasm = `OR ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'xor-imm8') {
      disasm = `XOR ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'inc-reg') {
      disasm = `INC ${instr.reg}`;
    } else if (instr.tag === 'dec-reg') {
      disasm = `DEC ${instr.reg}`;
    } else if (instr.tag === 'inc-reg16') {
      disasm = `INC ${instr.reg}`;
    } else if (instr.tag === 'dec-reg16') {
      disasm = `DEC ${instr.reg}`;
    } else if (instr.tag === 'ld-ix-offset-imm8') {
      disasm = `LD (IX+${hex(instr.offset, 2)}), ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'ld-iy-offset-imm8') {
      disasm = `LD (IY+${hex(instr.offset, 2)}), ${hex(instr.imm8, 2)}`;
    } else if (instr.tag === 'ld-reg-ix-offset') {
      disasm = `LD ${instr.dest}, (IX+${hex(instr.offset, 2)})`;
    } else if (instr.tag === 'ld-reg-iy-offset') {
      disasm = `LD ${instr.dest}, (IY+${hex(instr.offset, 2)})`;
    } else if (instr.tag === 'ld-ix-offset-reg') {
      disasm = `LD (IX+${hex(instr.offset, 2)}), ${instr.src}`;
    } else if (instr.tag === 'ld-iy-offset-reg') {
      disasm = `LD (IY+${hex(instr.offset, 2)}), ${instr.src}`;
    } else if (instr.tag === 'bit-test-iy-offset') {
      disasm = `BIT ${instr.bit}, (IY+${hex(instr.offset, 2)})  ; IY+${instr.offset} = ${hex(IY_ADDR + instr.offset, 6)}`;
    } else if (instr.tag === 'bit-set-iy-offset') {
      disasm = `SET ${instr.bit}, (IY+${hex(instr.offset, 2)})  ; IY+${instr.offset} = ${hex(IY_ADDR + instr.offset, 6)}`;
    } else if (instr.tag === 'bit-res-iy-offset') {
      disasm = `RES ${instr.bit}, (IY+${hex(instr.offset, 2)})  ; IY+${instr.offset} = ${hex(IY_ADDR + instr.offset, 6)}`;
    } else if (instr.tag === 'bit-test-ix-offset') {
      disasm = `BIT ${instr.bit}, (IX+${hex(instr.offset, 2)})`;
    } else if (instr.tag === 'bit-set-ix-offset') {
      disasm = `SET ${instr.bit}, (IX+${hex(instr.offset, 2)})`;
    } else if (instr.tag === 'bit-res-ix-offset') {
      disasm = `RES ${instr.bit}, (IX+${hex(instr.offset, 2)})`;
    } else if (instr.tag === 'alu-reg') {
      disasm = `${instr.op?.toUpperCase() ?? 'ALU'} ${instr.src}`;
    } else if (instr.tag === 'ld-a-mem') {
      disasm = `LD A, (${hex(instr.addr, 6)})`;
    } else if (instr.tag === 'ld-mem-a') {
      disasm = `LD (${hex(instr.addr, 6)}), A`;
    } else if (instr.tag === 'ld-hl-mem') {
      disasm = `LD HL, (${hex(instr.addr, 6)})`;
    } else if (instr.tag === 'ld-mem-hl') {
      disasm = `LD (${hex(instr.addr, 6)}), HL`;
    } else if (instr.tag === 'nop') {
      disasm = 'NOP';
    } else if (instr.tag === 'di') {
      disasm = 'DI';
    } else if (instr.tag === 'ei') {
      disasm = 'EI';
    } else if (instr.tag === 'jp-hl') {
      disasm = 'JP (HL)';
    } else if (instr.tag === 'jp-ix') {
      disasm = 'JP (IX)';
    } else if (instr.tag === 'jp-iy') {
      disasm = 'JP (IY)';
    } else if (instr.tag === 'indexed-cb-bit') {
      const reg = (instr.indexRegister ?? 'iy').toUpperCase();
      const d = instr.displacement ?? 0;
      const base = reg === 'IY' ? IY_ADDR : IX_ADDR;
      disasm = `BIT ${instr.bit}, (${reg}+${hex(d, 2)})  ; ${reg}+${d} = ${hex(base + d, 6)}`;
    } else if (instr.tag === 'indexed-cb-set') {
      const reg = (instr.indexRegister ?? 'iy').toUpperCase();
      const d = instr.displacement ?? 0;
      const base = reg === 'IY' ? IY_ADDR : IX_ADDR;
      disasm = `SET ${instr.bit}, (${reg}+${hex(d, 2)})  ; ${reg}+${d} = ${hex(base + d, 6)}`;
    } else if (instr.tag === 'indexed-cb-res') {
      const reg = (instr.indexRegister ?? 'iy').toUpperCase();
      const d = instr.displacement ?? 0;
      const base = reg === 'IY' ? IY_ADDR : IX_ADDR;
      disasm = `RES ${instr.bit}, (${reg}+${hex(d, 2)})  ; ${reg}+${d} = ${hex(base + d, 6)}`;
    } else if (instr.tag === 'indexed-cb-rotate') {
      const reg = (instr.indexRegister ?? 'iy').toUpperCase();
      const d = instr.displacement ?? 0;
      disasm = `${(instr.operation ?? 'ROT').toUpperCase()} (${reg}+${hex(d, 2)})`;
    } else if (instr.tag === 'push') {
      disasm = `PUSH ${instr.reg ?? '??'}`;
    } else if (instr.tag === 'pop') {
      disasm = `POP ${instr.reg ?? '??'}`;
    } else if (instr.tag === 'alu-imm') {
      disasm = `${(instr.op ?? 'alu').toUpperCase()} ${hex(instr.imm8 ?? 0, 2)}`;
    } else if (instr.tag === 'jr-conditional') {
      disasm = `JR ${instr.cc ?? '??'}, ${hex(instr.target ?? 0, 6)}`;
    } else if (instr.tag === 'ret-conditional') {
      disasm = `RET ${instr.cc ?? '??'}`;
    } else if (instr.tag === 'call') {
      disasm = `CALL ${hex(instr.target ?? 0, 6)}`;
    } else if (instr.tag === 'jp') {
      disasm = `JP ${hex(instr.target ?? 0, 6)}`;
    } else if (instr.tag === 'jr') {
      disasm = `JR ${hex(instr.target ?? 0, 6)}`;
    } else if (instr.tag === 'ld-reg-mem') {
      disasm = `LD ${instr.dest ?? 'A'}, (${hex(instr.addr ?? 0, 6)})`;
    } else if (instr.tag === 'ld-pair-mem') {
      disasm = `LD ${instr.dest ?? '??'}, (${hex(instr.addr ?? 0, 6)})`;
    } else if (instr.tag === 'ld-reg-imm') {
      disasm = `LD ${instr.dest ?? '??'}, ${hex(instr.imm8 ?? instr.imm ?? 0, 2)}`;
    } else if (instr.tag === 'add-pair') {
      disasm = `ADD HL, ${instr.src ?? '??'}`;
    }

    const modeStr = instr.modePrefix ? `[${instr.modePrefix}] ` : '';
    console.log(`  ${hex(pc)}: ${rawBytes.padEnd(18)} ${modeStr}${disasm}`);

    // Track IY-related and BIT instructions for summary
    if (instr.tag && (instr.tag.includes('iy') || instr.tag.includes('indexed-cb') || instr.tag.includes('bit-'))) {
      instructions.push({ pc, instr, disasm });
    }

    pc = instr.nextPc;
  }

  console.log('\n  --- IY and BIT instructions found in ConvKeyToTok ---');
  for (const { pc: addr, disasm } of instructions) {
    console.log(`  ${hex(addr)}: ${disasm}`);
  }

  // Disassemble the key subroutines called by ConvKeyToTok
  const subroutines = [
    { addr: 0x05C52C, name: 'CALL target from 0x05E630', bytes: 32 },
    { addr: 0x05E35A, name: 'keyCode lookup helper (0x05E35A)', bytes: 48 },
    { addr: 0x05E37D, name: 'secondary table selector (0x05E37D)', bytes: 48 },
  ];

  for (const sub of subroutines) {
    console.log(`\n  --- Disassembly of ${sub.name} ---`);
    let subPc = sub.addr;
    const subEnd = sub.addr + sub.bytes;
    while (subPc < subEnd) {
      const instr2 = decodeInstruction(rom, subPc, 'adl');
      if (!instr2 || instr2.length === 0) {
        console.log(`  ${hex(subPc)}: ?? (decode failed)`);
        subPc += 1;
        continue;
      }
      const rawBytes2 = bytesToHex(rom, subPc, instr2.length);
      let d2 = instr2.tag || '??';
      // Quick disasm for the subroutine
      if (instr2.tag === 'indexed-cb-bit') {
        const reg = (instr2.indexRegister ?? 'iy').toUpperCase();
        const dd = instr2.displacement ?? 0;
        const base = reg === 'IY' ? IY_ADDR : IX_ADDR;
        d2 = `BIT ${instr2.bit}, (${reg}+${hex(dd, 2)})  ; = ${hex(base + dd, 6)}`;
      } else if (instr2.tag === 'indexed-cb-set') {
        const reg = (instr2.indexRegister ?? 'iy').toUpperCase();
        const dd = instr2.displacement ?? 0;
        d2 = `SET ${instr2.bit}, (${reg}+${hex(dd, 2)})`;
      } else if (instr2.tag === 'indexed-cb-res') {
        const reg = (instr2.indexRegister ?? 'iy').toUpperCase();
        const dd = instr2.displacement ?? 0;
        d2 = `RES ${instr2.bit}, (${reg}+${hex(dd, 2)})`;
      } else if (instr2.tag?.startsWith('ld-')) {
        d2 = `${instr2.tag} ${instr2.dest ?? ''} ${instr2.src ?? ''} ${instr2.addr ? hex(instr2.addr, 6) : ''} ${instr2.imm8 !== undefined ? hex(instr2.imm8, 2) : ''}`.trim();
      } else if (instr2.tag?.startsWith('call') || instr2.tag?.startsWith('jp') || instr2.tag?.startsWith('jr')) {
        d2 = `${instr2.tag} ${instr2.cc ? instr2.cc + ', ' : ''}${instr2.target !== undefined ? hex(instr2.target, 6) : ''}`;
      } else if (instr2.tag === 'ret' || instr2.tag?.startsWith('ret-')) {
        d2 = `RET ${instr2.cc ?? ''}`;
      } else if (instr2.tag === 'alu-imm') {
        d2 = `${(instr2.op ?? 'alu').toUpperCase()} ${hex(instr2.imm8 ?? 0, 2)}`;
      } else if (instr2.tag?.startsWith('push') || instr2.tag?.startsWith('pop')) {
        d2 = `${instr2.tag.toUpperCase()} ${instr2.reg ?? '??'}`;
      }
      const mp2 = instr2.modePrefix ? `[${instr2.modePrefix}] ` : '';
      console.log(`  ${hex(subPc)}: ${rawBytes2.padEnd(18)} ${mp2}${d2}`);
      subPc = instr2.nextPc;
    }
  }

  return instructions;
}

// ========== PART B: Dynamic trace with default flags ==========
function partB(baselineMem) {
  console.log('\n========== PART B: Dynamic Trace with Default Flags (scanCode=0x76) ==========');
  console.log('Tracing IY-region reads in first 100 steps of ConvKeyToTok...\n');

  const scanCode = 0x76;
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboard(mem, scanCode);

  // Clear all IY flags to see what gets tested
  for (let i = 0; i < 64; i++) {
    mem[IY_ADDR + i] = 0x00;
  }

  cpu.a = scanCode & 0xFF;
  push24(cpu, mem, TRACE_RET);

  // Instrument reads in IY region
  const iyReads = [];
  const visited = [];
  let stepCount = 0;

  const originalRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const normalized = addr & 0xFFFFFF;
    const result = originalRead8(addr);
    if (normalized >= IY_ADDR && normalized < IY_ADDR + 64 && stepCount < 100) {
      iyReads.push({
        step: stepCount,
        addr: hex(normalized),
        offset: normalized - IY_ADDR,
        value: hexByte(result),
        block: hex(cpu._currentBlockPc ?? 0),
      });
    }
    return result;
  };

  try {
    executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        stepCount = step;
        visited.push({ step, pc: hex(pc) });
        if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('trace_return', step);
      },
      onMissingBlock(pc, _mode, step) {
        stepCount = step;
        visited.push({ step, pc: `MISSING:${hex(pc)}` });
        if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('trace_return', step);
      },
    });
  } catch (error) {
    if (!(error?.message === '__PHASE221_STOP__' && error.stopName === 'trace_return')) {
      throw error;
    }
  }

  cpu.read8 = originalRead8;

  console.log(`  IY reads in first 100 steps: ${iyReads.length}`);
  for (const r of iyReads) {
    console.log(`    step ${String(r.step).padStart(3)}: read ${r.addr} (IY+${r.offset}) = ${r.value}  at block ${r.block}`);
  }

  console.log(`\n  First 30 blocks visited:`);
  for (const v of visited.slice(0, 30)) {
    console.log(`    step ${String(v.step).padStart(3)}: ${v.pc}`);
  }

  // Also check register A at end
  console.log(`\n  Final A register: ${hexByte(cpu.a)}`);
  console.log(`  Edit buffer[0..7]: ${bytesToHex(mem, EDIT_BUF, 8)}`);
  console.log(`  Edit cursor: ${hex(read24(mem, EDIT_CURSOR))}`);

  return { iyReads, visited };
}

// ========== Shared: run ConvKeyToTok with specific flags ==========
function runConvKeyToTok(baselineMem, scanCode, label, flagSetup) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboard(mem, scanCode);

  // Apply flag setup
  flagSetup(mem, cpu);

  const cursorBefore = read24(mem, EDIT_CURSOR);

  cpu.a = scanCode & 0xFF;
  push24(cpu, mem, TRACE_RET);

  const visited = [];
  const editWrites = [];

  // Instrument edit buffer writes
  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    originalWrite8(addr, value);
    if (normalized >= EDIT_BUF && normalized < EDIT_END) {
      editWrites.push({
        addr: hex(normalized),
        value: hexByte(value),
      });
    }
  };

  let termination = 'unknown';
  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        visited.push(hex(pc));
        if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('trace_return');
      },
      onMissingBlock(pc) {
        visited.push(`MISSING:${hex(pc)}`);
        if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('trace_return');
      },
    });
    termination = result.termination ?? 'unknown';
  } catch (error) {
    if (error?.message === '__PHASE221_STOP__' && error.stopName === 'trace_return') {
      termination = 'sentinel';
    } else {
      cpu.write8 = originalWrite8;
      throw error;
    }
  }

  cpu.write8 = originalWrite8;

  const cursorAfter = read24(mem, EDIT_CURSOR);
  const bufferAfter = bytesToHex(mem, EDIT_BUF, 16);

  return {
    label,
    scanCode,
    termination,
    cursorBefore,
    cursorAfter,
    cursorDelta: cursorAfter - cursorBefore,
    bufferAfter,
    editWrites,
    aRegister: cpu.a & 0xFF,
    visited,
    iy5: mem[IY5_ADDR] & 0xFF,
    iy12: mem[IY12_ADDR] & 0xFF,
  };
}

function printResult(prefix, result) {
  console.log(`\n  ${prefix}`);
  console.log(`    scanCode:        ${hexByte(result.scanCode)} (${result.label})`);
  console.log(`    termination:     ${result.termination}`);
  console.log(`    A register:      ${hexByte(result.aRegister)} ${tokenName(result.aRegister) ? `(${tokenName(result.aRegister)})` : ''}`);
  console.log(`    cursor delta:    ${result.cursorDelta}`);
  console.log(`    buffer[0..15]:   ${result.bufferAfter}`);
  console.log(`    edit writes:     ${result.editWrites.length > 0 ? result.editWrites.map(w => `${w.addr}=${w.value}`).join(', ') : '(none)'}`);
  console.log(`    IY+5 after:      ${hexByte(result.iy5)}`);
  console.log(`    IY+12 after:     ${hexByte(result.iy12)}`);
  console.log(`    visited (first 20): ${result.visited.slice(0, 20).join(', ')}${result.visited.length > 20 ? '...' : ''}`);
}

// ========== PART C: Test with 2nd-mode flag ==========
function partC(baselineMem) {
  console.log('\n========== PART C: Test with 2nd-Mode Flag Armed ==========');
  console.log('Testing multiple IY flag bits to find which triggers secondary table lookup.\n');

  // Try various flag bits that might indicate 2nd-mode
  // Common candidates: IY+0 bit 3 (2nd key), IY+5 various bits, IY+12 various bits
  const flagCandidates = [
    { name: 'IY+0 bit 3', setup: (mem) => { mem[IY_ADDR + 0] |= 0x08; } },
    { name: 'IY+0 bit 2', setup: (mem) => { mem[IY_ADDR + 0] |= 0x04; } },
    { name: 'IY+5 bit 0', setup: (mem) => { mem[IY5_ADDR] |= 0x01; } },
    { name: 'IY+5 bit 1', setup: (mem) => { mem[IY5_ADDR] |= 0x02; } },
    { name: 'IY+5 bit 2', setup: (mem) => { mem[IY5_ADDR] |= 0x04; } },
    { name: 'IY+5 bit 3', setup: (mem) => { mem[IY5_ADDR] |= 0x08; } },
    { name: 'IY+5 bit 4', setup: (mem) => { mem[IY5_ADDR] |= 0x10; } },
    { name: 'IY+5 bit 5', setup: (mem) => { mem[IY5_ADDR] |= 0x20; } },
    { name: 'IY+5 bit 6', setup: (mem) => { mem[IY5_ADDR] |= 0x40; } },
    { name: 'IY+5 bit 7', setup: (mem) => { mem[IY5_ADDR] |= 0x80; } },
    { name: 'IY+12 bit 0', setup: (mem) => { mem[IY12_ADDR] |= 0x01; } },
    { name: 'IY+12 bit 1', setup: (mem) => { mem[IY12_ADDR] |= 0x02; } },
    { name: 'IY+12 bit 2', setup: (mem) => { mem[IY12_ADDR] |= 0x04; } },
    { name: 'IY+12 bit 3', setup: (mem) => { mem[IY12_ADDR] |= 0x08; } },
    { name: 'IY+12 bit 4', setup: (mem) => { mem[IY12_ADDR] |= 0x10; } },
    { name: 'IY+12 bit 5', setup: (mem) => { mem[IY12_ADDR] |= 0x20; } },
    { name: 'IY+12 bit 6', setup: (mem) => { mem[IY12_ADDR] |= 0x40; } },
    { name: 'IY+12 bit 7', setup: (mem) => { mem[IY12_ADDR] |= 0x80; } },
  ];

  // First, do a baseline with NO flags for scan code 0x76
  const baseline = runConvKeyToTok(baselineMem, 0x76, 'log (no flags)', (mem) => {
    // Clear all IY flags
    for (let i = 0; i < 64; i++) mem[IY_ADDR + i] = 0x00;
  });
  printResult('Baseline (no flags)', baseline);

  // Test each flag candidate
  const flagResults = [];
  for (const candidate of flagCandidates) {
    const result = runConvKeyToTok(baselineMem, 0x76, `log (${candidate.name})`, (mem) => {
      // Clear all IY flags first
      for (let i = 0; i < 64; i++) mem[IY_ADDR + i] = 0x00;
      // Then set the candidate flag
      candidate.setup(mem);
    });

    const changed = result.aRegister !== baseline.aRegister ||
                    result.cursorDelta !== baseline.cursorDelta ||
                    result.bufferAfter !== baseline.bufferAfter;

    flagResults.push({
      name: candidate.name,
      aRegister: result.aRegister,
      cursorDelta: result.cursorDelta,
      editWrites: result.editWrites,
      bufferAfter: result.bufferAfter,
      changed,
      termination: result.termination,
      visited: result.visited,
    });

    if (changed) {
      printResult(`CHANGED: ${candidate.name}`, result);
    }
  }

  console.log('\n  --- Flag scan summary (scanCode=0x76) ---');
  console.log('  Flag              | A reg  | Cursor delta | Changed? | Buffer[0..3]');
  console.log('  ------------------|--------|--------------|----------|-------------');
  for (const fr of flagResults) {
    const bufShort = fr.bufferAfter.substring(0, 11);
    console.log(`  ${fr.name.padEnd(18)}| ${hexByte(fr.aRegister).padEnd(7)}| ${String(fr.cursorDelta).padEnd(13)}| ${(fr.changed ? 'YES' : 'no').padEnd(9)}| ${bufShort}`);
  }

  return { baseline, flagResults };
}

// ========== PART D: Test with mode flags — compare against baseline ==========
function partD(baselineMem, baselineResult) {
  console.log('\n========== PART D: Targeted Flag Tests ==========');
  console.log('Comparing against baseline A=0x' + (baselineResult.aRegister).toString(16).toUpperCase());
  console.log('Looking for flags that change A register, visited blocks, or buffer contents.\n');

  const baselineA = baselineResult.aRegister;
  const baselineVisitedKey = baselineResult.visited.slice(0, 15).join(',');

  // Test IY flag bits systematically — only report differences
  const results = [];
  for (let offset = 0; offset < 64; offset++) {
    for (let bit = 0; bit < 8; bit++) {
      const result = runConvKeyToTok(baselineMem, 0x76, `log (IY+${offset} bit ${bit})`, (mem) => {
        for (let i = 0; i < 64; i++) mem[IY_ADDR + i] = 0x00;
        mem[IY_ADDR + offset] |= (1 << bit);
      });

      const visitedKey = result.visited.slice(0, 15).join(',');
      const aChanged = result.aRegister !== baselineA;
      const pathChanged = visitedKey !== baselineVisitedKey;
      const bufferChanged = result.bufferAfter !== baselineResult.bufferAfter;

      if (aChanged || pathChanged || bufferChanged) {
        results.push({
          offset, bit,
          name: `IY+${offset} bit ${bit}`,
          addr: hex(IY_ADDR + offset),
          aRegister: result.aRegister,
          aChanged,
          pathChanged,
          bufferChanged,
          cursorDelta: result.cursorDelta,
          bufferAfter: result.bufferAfter,
          editWrites: result.editWrites,
          visited: result.visited,
          termination: result.termination,
        });
        printResult(`DIFFERENT: IY+${offset} bit ${bit} (${hex(IY_ADDR + offset)})`, result);
      }
    }
  }

  console.log(`\n  Total flags that changed behavior: ${results.length}`);
  if (results.length > 0) {
    console.log('  Flag              | Addr       | A reg  | A changed | Path changed | Buffer changed');
    console.log('  ------------------|------------|--------|-----------|--------------|---------------');
    for (const r of results) {
      console.log(`  ${r.name.padEnd(18)}| ${r.addr.padEnd(11)}| ${hexByte(r.aRegister).padEnd(7)}| ${(r.aChanged ? 'YES' : 'no').padEnd(10)}| ${(r.pathChanged ? 'YES' : 'no').padEnd(13)}| ${r.bufferChanged ? 'YES' : 'no'}`);
    }
  }

  // Now test any flags that changed A across all 4 scan codes
  const aChangedFlags = results.filter(r => r.aChanged);
  const pathChangedFlags = results.filter(r => r.pathChanged && !r.aChanged);

  if (aChangedFlags.length > 0) {
    console.log(`\n  --- Testing ${aChangedFlags.length} A-changing flag(s) across all scan codes ---`);
    for (const flag of aChangedFlags) {
      for (const tc of TEST_SCAN_CODES) {
        const result = runConvKeyToTok(baselineMem, tc.scanCode, `${tc.label} (${flag.name})`, (mem) => {
          for (let i = 0; i < 64; i++) mem[IY_ADDR + i] = 0x00;
          mem[IY_ADDR + flag.offset] |= (1 << flag.bit);
        });
        printResult(`${tc.label} with ${flag.name}`, result);
      }
    }
  }

  if (pathChangedFlags.length > 0 && aChangedFlags.length === 0) {
    console.log(`\n  --- Testing ${pathChangedFlags.length} path-changing flag(s) across all scan codes ---`);
    for (const flag of pathChangedFlags.slice(0, 5)) { // limit to 5 to avoid explosion
      for (const tc of TEST_SCAN_CODES) {
        const result = runConvKeyToTok(baselineMem, tc.scanCode, `${tc.label} (${flag.name})`, (mem) => {
          for (let i = 0; i < 64; i++) mem[IY_ADDR + i] = 0x00;
          mem[IY_ADDR + flag.offset] |= (1 << flag.bit);
        });
        printResult(`${tc.label} with ${flag.name}`, result);
      }
    }
  }

  return results;
}

// ========== PART E: Cross-reference and summary ==========
function partE(baselineMem) {
  console.log('\n========== PART E: Cross-Reference Secondary Tables ==========');

  // Read secondary table entries for our test scan codes
  for (const tc of TEST_SCAN_CODES) {
    const idx = tc.scanCode - 0x5A;
    const priToken = rom[PRI_TABLE_BASE + idx];

    console.log(`\n  ${hexByte(tc.scanCode)} (${tc.label}):`);
    console.log(`    Primary table[${idx}]: ${hexByte(priToken)}`);

    if (priToken === 0x00) {
      // Read from each secondary table
      const funcEntry = rom[SEC_TABLE_FUNC + idx * 2] | (rom[SEC_TABLE_FUNC + idx * 2 + 1] << 8);
      const secEntry = rom[SEC_TABLE_2ND + idx * 2] | (rom[SEC_TABLE_2ND + idx * 2 + 1] << 8);
      const alphaIdx = idx * 2;
      let alphaEntry = 0;
      if (alphaIdx + 1 < 264) {
        alphaEntry = rom[SEC_TABLE_ALPHA + alphaIdx] | (rom[SEC_TABLE_ALPHA + alphaIdx + 1] << 8);
      }

      console.log(`    Func table   [${idx}*2]: ${hex(funcEntry, 4)} bytes=[${hexByte(rom[SEC_TABLE_FUNC + idx * 2])}, ${hexByte(rom[SEC_TABLE_FUNC + idx * 2 + 1])}]`);
      console.log(`    2nd table    [${idx}*2]: ${hex(secEntry, 4)} bytes=[${hexByte(rom[SEC_TABLE_2ND + idx * 2])}, ${hexByte(rom[SEC_TABLE_2ND + idx * 2 + 1])}]`);
      console.log(`    Alpha table  [${idx}*2]: ${hex(alphaEntry, 4)} bytes=[${hexByte(rom[SEC_TABLE_ALPHA + alphaIdx])}, ${hexByte(rom[SEC_TABLE_ALPHA + alphaIdx + 1])}]`);

      // Single-byte secondary lookup (just the first byte)
      const funcByte = rom[SEC_TABLE_FUNC + idx];
      const secByte = rom[SEC_TABLE_2ND + idx];
      const alphaByte = rom[SEC_TABLE_ALPHA + idx];
      console.log(`    Func table   [${idx}]: ${hexByte(funcByte)} ${tokenName(funcByte) ? `(${tokenName(funcByte)})` : ''}`);
      console.log(`    2nd table    [${idx}]: ${hexByte(secByte)} ${tokenName(secByte) ? `(${tokenName(secByte)})` : ''}`);
      console.log(`    Alpha table  [${idx}]: ${hexByte(alphaByte)} ${tokenName(alphaByte) ? `(${tokenName(alphaByte)})` : ''}`);
    }
  }

  // Also dump the raw bytes around the secondary tables for the indices we care about
  console.log('\n  --- Raw ROM around secondary tables (first 20 bytes each) ---');
  console.log(`  Func table @ ${hex(SEC_TABLE_FUNC)}: ${bytesToHex(rom, SEC_TABLE_FUNC, 60)}`);
  console.log(`  2nd  table @ ${hex(SEC_TABLE_2ND)}:  ${bytesToHex(rom, SEC_TABLE_2ND, 60)}`);
  console.log(`  Alpha table@ ${hex(SEC_TABLE_ALPHA)}: ${bytesToHex(rom, SEC_TABLE_ALPHA, 60)}`);
}

// ========== Main ==========
function main() {
  console.log('Phase 221: 2-Byte Token Insertion with 2nd-Mode and ALPHA Flags');
  console.log('='.repeat(78));

  const baseline = bootBaseline();

  partA();
  const partBData = partB(baseline.memory);
  const { baseline: partCBaseline, flagResults } = partC(baseline.memory);
  partD(baseline.memory, partCBaseline);
  partE(baseline.memory);

  console.log('\n========== DONE ==========');
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase221-2byte-token-mode-flags.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
