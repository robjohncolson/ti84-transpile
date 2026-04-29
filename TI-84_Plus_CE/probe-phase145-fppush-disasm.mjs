#!/usr/bin/env node

/**
 * Phase 145 — FpPush/FpPop disassembly + OP2 corruption trace + FpPop destination check
 *
 * Part A: Disassemble FpPush (0x082961) and FpPop (0x082957) from raw ROM bytes
 * Part B: Trace OP2 corruption step-by-step during gcd(12,8)
 * Part C: Call FpPop directly and check whether it writes to OP1 or OP2
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_DIRECT_ADDR = 0x068d3d;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;

const FPPUSH_ADDR = 0x082961;
const FPPOP_ADDR = 0x082957;

// BCD values (9 bytes each)
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every(d => d === 0)) return 0;
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return base;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

// ── Part A: Disassemble FpPush and FpPop from raw ROM bytes ───────────────

function partA_disassemble() {
  console.log('='.repeat(72));
  console.log('  PART A: Disassemble FpPush (0x082961) and FpPop (0x082957)');
  console.log('='.repeat(72));
  console.log('');

  // Dump raw bytes around FpPop and FpPush
  const startAddr = FPPOP_ADDR;
  const dumpLen = 80;
  console.log(`  Raw ROM bytes from ${hex(startAddr)} to ${hex(startAddr + dumpLen - 1)}:`);
  console.log('');

  // Print in rows of 16
  for (let off = 0; off < dumpLen; off += 16) {
    const addr = startAddr + off;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && (off + i) < dumpLen; i++) {
      const b = romBytes[addr + i] & 0xff;
      bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    console.log(`    ${hex(addr)}: ${bytes.join(' ')}  ${ascii.join('')}`);
  }
  console.log('');

  // Manual decode of FpPop at 0x082957
  console.log('  --- FpPop decode at 0x082957 ---');
  let pc = FPPOP_ADDR;
  const fpPopBytes = [];
  for (let i = 0; i < 20; i++) fpPopBytes.push(romBytes[pc + i] & 0xff);
  console.log(`  Bytes: [${fpPopBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);

  // Attempt basic eZ80 decode
  decodeInstructions(pc, 10);
  console.log('');

  // Manual decode of FpPush at 0x082961
  console.log('  --- FpPush decode at 0x082961 ---');
  pc = FPPUSH_ADDR;
  const fpPushBytes = [];
  for (let i = 0; i < 64; i++) fpPushBytes.push(romBytes[pc + i] & 0xff);
  console.log(`  Bytes: [${fpPushBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);

  decodeInstructions(pc, 30);
  console.log('');

  // Look for LDIR / LDI patterns
  console.log('  --- Searching for LDI/LDIR patterns ---');
  for (let off = 0; off < 80; off++) {
    const addr = startAddr + off;
    const b0 = romBytes[addr] & 0xff;
    const b1 = romBytes[addr + 1] & 0xff;
    if (b0 === 0xED && b1 === 0xB0) {
      console.log(`    LDIR found at ${hex(addr)}`);
    }
    if (b0 === 0xED && b1 === 0xA0) {
      console.log(`    LDI found at ${hex(addr)}`);
    }
  }
  console.log('');

  // Look for references to known addresses
  console.log('  --- Searching for OP1/OP2/FPS pointer references ---');
  for (let off = 0; off < 80; off++) {
    const addr = startAddr + off;
    // Check for 3-byte little-endian address loads
    if (off + 2 < 80) {
      const val = (romBytes[addr] & 0xff) |
                  ((romBytes[addr + 1] & 0xff) << 8) |
                  ((romBytes[addr + 2] & 0xff) << 16);
      if (val === OP1_ADDR) console.log(`    OP1 (0xD005F8) ref at ${hex(addr)}`);
      if (val === OP2_ADDR) console.log(`    OP2 (0xD00603) ref at ${hex(addr)}`);
      if (val === FPS_ADDR) console.log(`    FPS ptr (0xD0258D) ref at ${hex(addr)}`);
      if (val === FPSBASE_ADDR) console.log(`    FPSbase (0xD0258A) ref at ${hex(addr)}`);
    }
  }
  console.log('');

  // Also look for the byte count used in copy (LD BC, n)
  console.log('  --- Searching for LD BC,nn (byte count) patterns ---');
  for (let off = 0; off < 80; off++) {
    const addr = startAddr + off;
    const b0 = romBytes[addr] & 0xff;
    // LD BC, imm16: 01 nn nn (Z80) or LD BC, imm24: 01 nn nn nn (ADL)
    if (b0 === 0x01) {
      const imm16 = (romBytes[addr + 1] & 0xff) | ((romBytes[addr + 2] & 0xff) << 8);
      const imm24 = imm16 | ((romBytes[addr + 3] & 0xff) << 16);
      if (imm16 <= 20 || imm24 <= 20) {
        console.log(`    LD BC, ${imm16} (or ${imm24} in ADL) at ${hex(addr)}`);
      }
    }
  }
  console.log('');
}

/** Very basic eZ80 instruction decoder for common patterns */
function decodeInstructions(startPC, maxInstr) {
  let pc = startPC;
  for (let i = 0; i < maxInstr; i++) {
    const instrStart = pc;
    const b0 = romBytes[pc] & 0xff;
    let decoded = '';
    let len = 1;

    // SIS/LIS/SIL/LIL prefixes
    if (b0 === 0x40 && (romBytes[pc + 1] & 0xff) === 0x49) {
      // SIS prefix: 0x40 but only if next is specific
      // Actually 0x40 = LD B,B in normal decode, skip prefix logic for simplicity
    }

    // Common single-byte
    if (b0 === 0xC9) { decoded = 'RET'; len = 1; }
    else if (b0 === 0x00) { decoded = 'NOP'; len = 1; }
    else if (b0 === 0xC3) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `JP ${hex(target)}`; len = 4;
    }
    else if (b0 === 0xCD) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `CALL ${hex(target)}`; len = 4;
    }
    // LD r, (HL) / LD (HL), r patterns
    else if (b0 === 0x2A) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD HL,(${hex(target)})`; len = 4;
    }
    else if (b0 === 0x22) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD (${hex(target)}),HL`; len = 4;
    }
    else if (b0 === 0x3A) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD A,(${hex(target)})`; len = 4;
    }
    else if (b0 === 0x32) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD (${hex(target)}),A`; len = 4;
    }
    else if (b0 === 0x21) {
      const imm = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD HL,${hex(imm)}`; len = 4;
    }
    else if (b0 === 0x11) {
      const imm = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD DE,${hex(imm)}`; len = 4;
    }
    else if (b0 === 0x01) {
      const imm = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `LD BC,${hex(imm)}`; len = 4;
    }
    else if (b0 === 0xEB) { decoded = 'EX DE,HL'; len = 1; }
    else if (b0 === 0x23) { decoded = 'INC HL'; len = 1; }
    else if (b0 === 0x2B) { decoded = 'DEC HL'; len = 1; }
    else if (b0 === 0x13) { decoded = 'INC DE'; len = 1; }
    else if (b0 === 0x1B) { decoded = 'DEC DE'; len = 1; }
    else if (b0 === 0x03) { decoded = 'INC BC'; len = 1; }
    else if (b0 === 0x0B) { decoded = 'DEC BC'; len = 1; }
    else if (b0 === 0x09) { decoded = 'ADD HL,BC'; len = 1; }
    else if (b0 === 0x19) { decoded = 'ADD HL,DE'; len = 1; }
    else if (b0 === 0xB7) { decoded = 'OR A'; len = 1; }
    else if (b0 === 0xAF) { decoded = 'XOR A'; len = 1; }
    else if (b0 === 0xED) {
      const b1 = romBytes[pc+1] & 0xff;
      if (b1 === 0xB0) { decoded = 'LDIR'; len = 2; }
      else if (b1 === 0xA0) { decoded = 'LDI'; len = 2; }
      else if (b1 === 0xB8) { decoded = 'LDDR'; len = 2; }
      else if (b1 === 0xA8) { decoded = 'LDD'; len = 2; }
      else if (b1 === 0x52) { decoded = 'SBC HL,DE'; len = 2; }
      else if (b1 === 0x42) { decoded = 'SBC HL,BC'; len = 2; }
      else if (b1 === 0x5B) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD DE,(${hex(target)})`; len = 5;
      }
      else if (b1 === 0x4B) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD BC,(${hex(target)})`; len = 5;
      }
      else if (b1 === 0x43) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD (${hex(target)}),BC`; len = 5;
      }
      else if (b1 === 0x53) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD (${hex(target)}),DE`; len = 5;
      }
      else { decoded = `ED ${b1.toString(16).toUpperCase().padStart(2,'0')} (?)`; len = 2; }
    }
    // Conditional jumps
    else if (b0 === 0xCA || b0 === 0xC2 || b0 === 0xDA || b0 === 0xD2 ||
             b0 === 0xEA || b0 === 0xE2 || b0 === 0xFA || b0 === 0xF2) {
      const condNames = { 0xCA: 'JP Z', 0xC2: 'JP NZ', 0xDA: 'JP C', 0xD2: 'JP NC',
                          0xEA: 'JP PE', 0xE2: 'JP PO', 0xFA: 'JP M', 0xF2: 'JP P' };
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `${condNames[b0]},${hex(target)}`; len = 4;
    }
    // Conditional returns
    else if (b0 === 0xC8) { decoded = 'RET Z'; len = 1; }
    else if (b0 === 0xC0) { decoded = 'RET NZ'; len = 1; }
    else if (b0 === 0xD8) { decoded = 'RET C'; len = 1; }
    else if (b0 === 0xD0) { decoded = 'RET NC'; len = 1; }
    // PUSH/POP
    else if (b0 === 0xC5) { decoded = 'PUSH BC'; len = 1; }
    else if (b0 === 0xD5) { decoded = 'PUSH DE'; len = 1; }
    else if (b0 === 0xE5) { decoded = 'PUSH HL'; len = 1; }
    else if (b0 === 0xF5) { decoded = 'PUSH AF'; len = 1; }
    else if (b0 === 0xC1) { decoded = 'POP BC'; len = 1; }
    else if (b0 === 0xD1) { decoded = 'POP DE'; len = 1; }
    else if (b0 === 0xE1) { decoded = 'POP HL'; len = 1; }
    else if (b0 === 0xF1) { decoded = 'POP AF'; len = 1; }
    // LD A,imm8
    else if (b0 === 0x3E) {
      decoded = `LD A,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    // CP imm8
    else if (b0 === 0xFE) {
      decoded = `CP ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    // ADD A, imm8
    else if (b0 === 0xC6) {
      decoded = `ADD A,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    // SUB imm8
    else if (b0 === 0xD6) {
      decoded = `SUB ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    // JR
    else if (b0 === 0x18) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `JR ${hex(target)}`; len = 2;
    }
    else if (b0 === 0x20) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `JR NZ,${hex(target)}`; len = 2;
    }
    else if (b0 === 0x28) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `JR Z,${hex(target)}`; len = 2;
    }
    else if (b0 === 0x30) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `JR NC,${hex(target)}`; len = 2;
    }
    else if (b0 === 0x38) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `JR C,${hex(target)}`; len = 2;
    }
    // SIS prefix (0x40 in certain contexts - but 0x40 is LD B,B normally)
    // eZ80 suffix bytes
    else if (b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
      // These could be prefix bytes in eZ80 but also normal instructions
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      const src = b0 & 0x07;
      const dst = (b0 >> 3) & 0x07;
      decoded = `LD ${regNames8[dst]},${regNames8[src]}`; len = 1;
    }
    else {
      // Generic fallback: show opcode byte
      decoded = `DB ${hex(b0, 2)}`;
      len = 1;
    }

    const instrBytes = [];
    for (let j = 0; j < len; j++) instrBytes.push((romBytes[instrStart + j] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
    console.log(`    ${hex(instrStart)}: ${instrBytes.join(' ').padEnd(15)} ${decoded}`);

    pc += len;

    // Stop at RET
    if (b0 === 0xC9) break;
  }
}

// ── Part B: Trace OP2 corruption step-by-step ─────────────────────────────

function partB_traceOP2(executor, cpu, mem) {
  console.log('='.repeat(72));
  console.log('  PART B: Trace OP2 corruption during gcd(12,8)');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Seed FPS with 9-byte entries (as session 144 confirmed)
  const FPS_ENTRY_SIZE = 9;
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 30);

  // Entry 0: 12.0
  mem.set(BCD_12, FPS_CLEAN_AREA);
  // Entry 1: 8.0
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  // FPS points past both entries
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 2 * FPS_ENTRY_SIZE);

  // Seed OP2 with 8.0
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);

  // Seed OP1 with 12.0
  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);

  mem[FP_CATEGORY_ADDR] = 0x28;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log('  Initial state:');
  console.log(`    OP1: [${hexBytes(mem, OP1_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`    OP2: [${hexBytes(mem, OP2_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FPS entry size: ${FPS_ENTRY_SIZE} bytes`);
  console.log(`    FPS area: [${hexBytes(mem, FPS_CLEAN_AREA, 20)}]`);
  console.log('');

  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;
  let prevOP2 = hexBytes(mem, OP2_ADDR, 9);
  const snapshots = [];

  function snapshot(label, pc, step) {
    const op2Now = hexBytes(mem, OP2_ADDR, 9);
    const op2Changed = op2Now !== prevOP2;
    const fpsPtr = read24(mem, FPS_ADDR);
    snapshots.push({
      step,
      pc,
      label,
      op2: op2Now,
      op2Decoded: decodeBCDFloat(mem, OP2_ADDR),
      op1: hexBytes(mem, OP1_ADDR, 9),
      op1Decoded: decodeBCDFloat(mem, OP1_ADDR),
      fpsPtr,
      op2Changed,
    });
    if (op2Changed) {
      prevOP2 = op2Now;
    }
    return op2Changed;
  }

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        stepCount++;
        if (stepCount <= 30) {
          snapshot(`block #${stepCount}`, norm, stepCount);
        }
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        stepCount++;
        if (stepCount <= 30) {
          snapshot(`missing block #${stepCount}`, norm, stepCount);
        }
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') returnHit = true;
    else if (e?.message === '__ERR__') errCaught = true;
    else throw e;
  }

  console.log(`  Outcome: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'} after ${stepCount} steps`);
  console.log(`  Final errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log('');

  console.log('  STEP-BY-STEP OP2 TRACE (first 30 blocks):');
  for (const snap of snapshots) {
    const marker = snap.op2Changed ? ' *** OP2 CHANGED ***' : '';
    console.log(`    [Step ${snap.step}] PC=${hex(snap.pc)}${marker}`);
    console.log(`      OP1: [${snap.op1}]  ${snap.op1Decoded}`);
    console.log(`      OP2: [${snap.op2}]  ${snap.op2Decoded}`);
    console.log(`      FPS ptr: ${hex(snap.fpsPtr)}`);
  }
  console.log('');

  // Highlight OP2 change points
  const changePoints = snapshots.filter(s => s.op2Changed);
  if (changePoints.length > 0) {
    console.log('  OP2 CHANGE POINTS:');
    for (const snap of changePoints) {
      console.log(`    Step ${snap.step}: PC=${hex(snap.pc)} -> OP2=[${snap.op2}] (${snap.op2Decoded})`);
    }
  } else {
    console.log('  OP2 never changed in the first 30 steps.');
  }
  console.log('');
}

// ── Part C: Call FpPop directly, check OP1 vs OP2 ─────────────────────────

function partC_fpPopDest(executor, cpu, mem) {
  console.log('='.repeat(72));
  console.log('  PART C: Call FpPop directly — does it write to OP1 or OP2?');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Zero out OP1 and OP2 (11 bytes each)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

  // Seed FPS with one 9-byte entry: 8.0
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
  mem.set(BCD_8, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);  // 9-byte entry

  console.log('  Before FpPop:');
  console.log(`    OP1 (11 bytes): [${hexBytes(mem, OP1_ADDR, 11)}]`);
  console.log(`    OP2 (11 bytes): [${hexBytes(mem, OP2_ADDR, 11)}]`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FPS area: [${hexBytes(mem, FPS_CLEAN_AREA, 11)}]`);
  console.log('');

  // Push FAKE_RET onto stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  let returnHit = false;
  const pcTrace = [];

  try {
    executor.runFrom(FPPOP_ADDR, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        if (pcTrace.length < 100) pcTrace.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        if (pcTrace.length < 100) pcTrace.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') returnHit = true;
    else throw e;
  }

  console.log(`  FpPop outcome: ${returnHit ? 'RETURNED' : 'DID NOT RETURN'}`);
  console.log('');

  console.log('  After FpPop:');
  console.log(`    OP1 (11 bytes): [${hexBytes(mem, OP1_ADDR, 11)}]`);
  console.log(`    OP2 (11 bytes): [${hexBytes(mem, OP2_ADDR, 11)}]`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log('');

  // Check which one got 8.0
  const op1HasData = !mem.slice(OP1_ADDR, OP1_ADDR + 9).every(b => b === 0);
  const op2HasData = !mem.slice(OP2_ADDR, OP2_ADDR + 9).every(b => b === 0);

  console.log('  ANALYSIS:');
  console.log(`    OP1 has non-zero data: ${op1HasData ? 'YES' : 'NO'}`);
  console.log(`    OP2 has non-zero data: ${op2HasData ? 'YES' : 'NO'}`);
  if (op1HasData) console.log(`    OP1 decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
  if (op2HasData) console.log(`    OP2 decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);

  if (op1HasData && !op2HasData) console.log('    CONCLUSION: FpPop writes to OP1');
  else if (op2HasData && !op1HasData) console.log('    CONCLUSION: FpPop writes to OP2');
  else if (op1HasData && op2HasData) console.log('    CONCLUSION: FpPop writes to BOTH OP1 and OP2 (overlap or sequential copy)');
  else console.log('    CONCLUSION: FpPop wrote to NEITHER — something unexpected happened');
  console.log('');

  // Also try with 11-byte entry size
  console.log('  --- Retry with 11-byte FPS entry ---');
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
  mem.set(BCD_8, FPS_CLEAN_AREA);
  // 11-byte entry
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 11);

  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  let returnHit2 = false;
  try {
    executor.runFrom(FPPOP_ADDR, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') returnHit2 = true;
    else throw e;
  }

  console.log(`  FpPop (11-byte) outcome: ${returnHit2 ? 'RETURNED' : 'DID NOT RETURN'}`);
  console.log(`    OP1 (11 bytes): [${hexBytes(mem, OP1_ADDR, 11)}]`);
  console.log(`    OP2 (11 bytes): [${hexBytes(mem, OP2_ADDR, 11)}]`);
  const op1HasData2 = !mem.slice(OP1_ADDR, OP1_ADDR + 9).every(b => b === 0);
  const op2HasData2 = !mem.slice(OP2_ADDR, OP2_ADDR + 9).every(b => b === 0);
  if (op1HasData2) console.log(`    OP1 decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
  if (op2HasData2) console.log(`    OP2 decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);
  if (op1HasData2 && !op2HasData2) console.log('    CONCLUSION (11-byte): FpPop writes to OP1');
  else if (op2HasData2 && !op1HasData2) console.log('    CONCLUSION (11-byte): FpPop writes to OP2');
  else if (op1HasData2 && op2HasData2) console.log('    CONCLUSION (11-byte): FpPop writes to BOTH');
  else console.log('    CONCLUSION (11-byte): FpPop wrote to NEITHER');
  console.log('');

  // PC trace
  if (pcTrace.length > 0) {
    console.log('  PC trace (9-byte run):');
    for (const pc of pcTrace) {
      console.log(`    ${hex(pc)}`);
    }
    console.log('');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 145: FpPush/FpPop disassembly + OP2 corruption trace ===');
  console.log('');

  // Part A: Static disassembly (no runtime needed)
  partA_disassemble();

  // Create runtime for Parts B and C
  const { mem, executor, cpu } = createRuntime();

  console.log('  Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('  Cold boot complete.');
  console.log('');

  console.log('  Running MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // Part B: Trace OP2 corruption
  partB_traceOP2(executor, cpu, mem);

  // Part C: FpPop destination check
  partC_fpPopDest(executor, cpu, mem);

  console.log('=== Phase 145 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
