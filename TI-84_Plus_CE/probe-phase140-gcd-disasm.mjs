#!/usr/bin/env node

/**
 * Phase 140 — FP gcd Type Check Disassembly at 0x07F88D / 0xD00604
 *
 * Part A: Static disassembly of gcd handler, type check, and E_Domain regions
 * Part B: Brute-force flag byte test — try all candidate values at 0xD00604
 * Part C: Cross-reference all ROM instructions that read/write 0xD00604
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
const OP2_ADDR = 0xd00601;

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
const GCD_HANDLER_ADDR = 0x06859b;
const E_DOMAIN_ERROR_ADDR = 0x068d5d;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

const FPS_CLEAN_AREA = 0xd1a900;

// BCD values
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4  = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
}

function matchesBCD4(mem, addr) {
  for (let i = 0; i < 9; i++) {
    if ((mem[addr + i] & 0xff) !== BCD_4[i]) return false;
  }
  return true;
}

// ── ADL-mode eZ80 mini-disassembler ────────────────────────────────────────

function disasmOne(buf, pc) {
  if (pc >= buf.length) return { len: 1, mnem: '(out of range)' };
  const b0 = buf[pc];
  let len = 1;
  let mnem = 'DB ' + hex(b0, 2);
  const nn3 = () => buf[pc + 1] | (buf[pc + 2] << 8) | (buf[pc + 3] << 16);

  if (b0 === 0x21) { len = 4; mnem = 'LD HL,' + hex(nn3()); }
  else if (b0 === 0x11) { len = 4; mnem = 'LD DE,' + hex(nn3()); }
  else if (b0 === 0x01) { len = 4; mnem = 'LD BC,' + hex(nn3()); }
  else if (b0 === 0x31) { len = 4; mnem = 'LD SP,' + hex(nn3()); }
  else if (b0 === 0x3A) { len = 4; mnem = 'LD A,(' + hex(nn3()) + ')'; }
  else if (b0 === 0x32) { len = 4; mnem = 'LD (' + hex(nn3()) + '),A'; }
  else if (b0 === 0x22) { len = 4; mnem = 'LD (' + hex(nn3()) + '),HL'; }
  else if (b0 === 0x2A) { len = 4; mnem = 'LD HL,(' + hex(nn3()) + ')'; }
  else if (b0 === 0xCD) { len = 4; mnem = 'CALL ' + hex(nn3()); }
  else if (b0 === 0xC3) { len = 4; mnem = 'JP ' + hex(nn3()); }
  else if (b0 === 0xC2) { len = 4; mnem = 'JP NZ,' + hex(nn3()); }
  else if (b0 === 0xCA) { len = 4; mnem = 'JP Z,' + hex(nn3()); }
  else if (b0 === 0xD2) { len = 4; mnem = 'JP NC,' + hex(nn3()); }
  else if (b0 === 0xDA) { len = 4; mnem = 'JP C,' + hex(nn3()); }
  else if (b0 === 0xCC) { len = 4; mnem = 'CALL Z,' + hex(nn3()); }
  else if (b0 === 0xC4) { len = 4; mnem = 'CALL NZ,' + hex(nn3()); }
  else if (b0 === 0xD4) { len = 4; mnem = 'CALL NC,' + hex(nn3()); }
  else if (b0 === 0xDC) { len = 4; mnem = 'CALL C,' + hex(nn3()); }
  else if (b0 === 0x3E) { len = 2; mnem = 'LD A,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x06) { len = 2; mnem = 'LD B,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x0E) { len = 2; mnem = 'LD C,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x16) { len = 2; mnem = 'LD D,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x1E) { len = 2; mnem = 'LD E,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x26) { len = 2; mnem = 'LD H,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x2E) { len = 2; mnem = 'LD L,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x36) { len = 2; mnem = 'LD (HL),' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x18) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR ' + hex(pc + 2 + rel); }
  else if (b0 === 0x20) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR NZ,' + hex(pc + 2 + rel); }
  else if (b0 === 0x28) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR Z,' + hex(pc + 2 + rel); }
  else if (b0 === 0x30) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR NC,' + hex(pc + 2 + rel); }
  else if (b0 === 0x38) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR C,' + hex(pc + 2 + rel); }
  else if (b0 === 0x10) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'DJNZ ' + hex(pc + 2 + rel); }
  else if (b0 === 0xE6) { len = 2; mnem = 'AND ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xF6) { len = 2; mnem = 'OR ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xEE) { len = 2; mnem = 'XOR ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xFE) { len = 2; mnem = 'CP ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xD6) { len = 2; mnem = 'SUB ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xC6) { len = 2; mnem = 'ADD A,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x23) { mnem = 'INC HL'; }
  else if (b0 === 0x2B) { mnem = 'DEC HL'; }
  else if (b0 === 0x13) { mnem = 'INC DE'; }
  else if (b0 === 0x1B) { mnem = 'DEC DE'; }
  else if (b0 === 0x03) { mnem = 'INC BC'; }
  else if (b0 === 0x0B) { mnem = 'DEC BC'; }
  else if (b0 === 0x34) { mnem = 'INC (HL)'; }
  else if (b0 === 0x35) { mnem = 'DEC (HL)'; }
  else if (b0 === 0x77) { mnem = 'LD (HL),A'; }
  else if (b0 === 0x7E) { mnem = 'LD A,(HL)'; }
  else if (b0 === 0x78) { mnem = 'LD A,B'; }
  else if (b0 === 0x79) { mnem = 'LD A,C'; }
  else if (b0 === 0x7A) { mnem = 'LD A,D'; }
  else if (b0 === 0x7B) { mnem = 'LD A,E'; }
  else if (b0 === 0x7C) { mnem = 'LD A,H'; }
  else if (b0 === 0x7D) { mnem = 'LD A,L'; }
  else if (b0 === 0x47) { mnem = 'LD B,A'; }
  else if (b0 === 0x4F) { mnem = 'LD C,A'; }
  else if (b0 === 0x57) { mnem = 'LD D,A'; }
  else if (b0 === 0x5F) { mnem = 'LD E,A'; }
  else if (b0 === 0x67) { mnem = 'LD H,A'; }
  else if (b0 === 0x6F) { mnem = 'LD L,A'; }
  else if (b0 === 0xAF) { mnem = 'XOR A'; }
  else if (b0 === 0xB7) { mnem = 'OR A'; }
  else if (b0 === 0xA7) { mnem = 'AND A'; }
  else if (b0 === 0x96) { mnem = 'SUB (HL)'; }
  else if (b0 === 0x9E) { mnem = 'SBC A,(HL)'; }
  else if (b0 === 0x86) { mnem = 'ADD A,(HL)'; }
  else if (b0 === 0x93) { mnem = 'SUB E'; }
  else if (b0 === 0xC0) { mnem = 'RET NZ'; }
  else if (b0 === 0xC8) { mnem = 'RET Z'; }
  else if (b0 === 0xC9) { mnem = 'RET'; }
  else if (b0 === 0xD0) { mnem = 'RET NC'; }
  else if (b0 === 0xD8) { mnem = 'RET C'; }
  else if (b0 === 0xE1) { mnem = 'POP HL'; }
  else if (b0 === 0xD1) { mnem = 'POP DE'; }
  else if (b0 === 0xC1) { mnem = 'POP BC'; }
  else if (b0 === 0xF1) { mnem = 'POP AF'; }
  else if (b0 === 0xE5) { mnem = 'PUSH HL'; }
  else if (b0 === 0xD5) { mnem = 'PUSH DE'; }
  else if (b0 === 0xC5) { mnem = 'PUSH BC'; }
  else if (b0 === 0xF5) { mnem = 'PUSH AF'; }
  else if (b0 === 0xE9) { mnem = 'JP (HL)'; }
  else if (b0 === 0x00) { mnem = 'NOP'; }
  else if (b0 === 0x37) { mnem = 'SCF'; }
  else if (b0 === 0x3F) { mnem = 'CCF'; }
  else if (b0 === 0x3C) { mnem = 'INC A'; }
  else if (b0 === 0x3D) { mnem = 'DEC A'; }
  else if (b0 === 0x12) { mnem = 'LD (DE),A'; }
  else if (b0 === 0x1A) { mnem = 'LD A,(DE)'; }
  else if (b0 === 0xEB) { mnem = 'EX DE,HL'; }
  else if (b0 === 0xED) {
    len = 2;
    const b1 = buf[pc + 1];
    if (b1 === 0xB0) mnem = 'LDIR';
    else if (b1 === 0xB8) mnem = 'LDDR';
    else if (b1 === 0xA0) mnem = 'LDI';
    else if (b1 === 0x44) mnem = 'NEG';
    else if (b1 === 0x6F) mnem = 'RLD';
    else if (b1 === 0x27) mnem = 'LD HL,(HL)';  // eZ80-specific
    else mnem = 'ED ' + hex(b1, 2);
  }
  else if (b0 === 0xCB) {
    len = 2;
    const b1 = buf[pc + 1];
    if ((b1 & 0xC0) === 0x40) {
      const bit = (b1 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      mnem = 'BIT ' + bit + ',' + reg;
    } else if ((b1 & 0xC0) === 0xC0) {
      const bit = (b1 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      mnem = 'SET ' + bit + ',' + reg;
    } else if ((b1 & 0xC0) === 0x80) {
      const bit = (b1 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      mnem = 'RES ' + bit + ',' + reg;
    } else {
      mnem = 'CB ' + hex(b1, 2);
    }
  }
  else if (b0 === 0xFD) {
    // IY prefix - simplified
    len = 2;
    const b1 = buf[pc + 1];
    if (b1 === 0xCB) {
      len = 4;
      const d = buf[pc + 2];
      const b3 = buf[pc + 3];
      if ((b3 & 0xC0) === 0x40) {
        const bit = (b3 >> 3) & 7;
        mnem = `BIT ${bit},(IY+${hex(d, 2)})`;
      } else {
        mnem = `FD CB ${hex(d, 2)} ${hex(b3, 2)}`;
      }
    } else {
      mnem = 'FD ' + hex(b1, 2);
    }
  }
  else if (b0 === 0xDD) {
    len = 2;
    const b1 = buf[pc + 1];
    mnem = 'DD ' + hex(b1, 2);
  }

  return { len, mnem };
}

function disasmRegion(buf, start, end, label) {
  console.log(`\n  --- ${label} (${hex(start)} - ${hex(end - 1)}) ---`);
  let pc = start;
  while (pc < end) {
    const { len, mnem } = disasmOne(buf, pc);
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push((buf[pc + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
    const marker = (pc === 0x07F88D) ? ' <<<' : '';
    console.log(`    ${hex(pc)}:  ${rawBytes.join(' ').padEnd(16)}${mnem}${marker}`);
    pc += len;
  }
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

function seedFPSOperands(mem) {
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + 9);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 140: FP gcd Type Check Disassembly ===');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // PART A: Static Disassembly
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART A: Static Disassembly');
  console.log('='.repeat(72));

  disasmRegion(romBytes, 0x06859B, 0x0685A6, 'gcd handler entry');
  disasmRegion(romBytes, 0x0689DE, 0x068A00, 'FP dispatch (0x0689DE)');
  disasmRegion(romBytes, 0x07F860, 0x07F898, 'type check subroutine (includes 0x07F88D)');
  disasmRegion(romBytes, 0x07FAAF, 0x07FAB4, 'zero-out target at 0x07FAAF');
  disasmRegion(romBytes, 0x07FA2F, 0x07FA44, 'zero-fill entry at 0x07FA2F');
  disasmRegion(romBytes, 0x07FA7A, 0x07FA95, 'zero-fill body at 0x07FA7A');
  disasmRegion(romBytes, 0x07FAC2, 0x07FAC8, 'zero-out OP1 target at 0x07FAC2');
  disasmRegion(romBytes, 0x068D5D, 0x068D70, 'E_Domain error path (0x068D5D)');
  disasmRegion(romBytes, 0x068B78, 0x068BA0, 'type check caller (0x068B78)');

  console.log('');
  console.log('  ANALYSIS of 0x07F881-0x07F897:');
  console.log('    0x07F881: SUB 0x01           ; A = A - 1 (input count)');
  console.log('    0x07F883: PUSH AF            ; save count on stack');
  console.log('    0x07F884: LD A,(0xD005F9)    ; load OP1 type byte (OP1+1)');
  console.log('    0x07F888: OR A               ; test if zero');
  console.log('    0x07F889: CALL Z,0x07FAC2    ; if OP1 type=0, zero out OP1 (set to 0.0)');
  console.log('    0x07F88D: LD A,(0xD00604)    ; load OP2 type byte (OP2+3 = 0xD00601+3) <<<');
  console.log('    0x07F891: OR A               ; test if zero');
  console.log('    0x07F892: CALL Z,0x07FAAF    ; if OP2 type=0, zero out OP2 (set to 0.0)');
  console.log('    0x07F896: POP AF             ; restore count');
  console.log('    0x07F897: RET                ; return to caller');
  console.log('');
  console.log('  KEY FINDING: 0xD00604 is NOT the domain check itself.');
  console.log('  It is a type-byte check: if 0, the operand is replaced with FP zero.');
  console.log('  The domain check happens later (at 0x068D65 calling 0x068B78).');
  console.log('  0xD00604 = OP2+3 in the OP register layout (OP2 at 0xD00601).');
  console.log('  More precisely: OP1 is 11 bytes (0xD005F8-0xD00602),');
  console.log('  OP2 starts at 0xD00603. So 0xD00604 = OP2[1] = OP2 type/sign byte.');
  console.log('');

  // Verify OP layout by checking what 0x07FAAF zeros:
  // 0x07FAAF: XOR A; JP 0x07FA2F
  // 0x07FA2F: LD HL,0xD00603; JR 0x07FA7A
  // 0x07FA7A: LD (HL),0x00; INC HL; LD (HL),0x80; ... (writes 11 bytes of zero FP)
  // So OP2 base is 0xD00603, and 0xD00604 is indeed OP2+1 (type byte)
  console.log('  OP2 layout verification:');
  console.log('    0x07FAAF zeros out starting at 0xD00603 (OP2 base)');
  console.log('    0xD00604 = OP2+1 = type/sign byte of OP2');
  console.log('    0xD005F9 = OP1+1 = type/sign byte of OP1');
  console.log('    For real numbers, type byte = 0x00 (real). Check passes trivially.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // PART B: Brute-Force Flag Byte Test
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART B: Brute-Force Flag Byte Test');
  console.log('='.repeat(72));
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  console.log('  Running MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // Save post-MEM_INIT snapshot
  const memSnapshot = new Uint8Array(mem);
  const cpuSnapshot = {
    sp: cpu.sp, f: cpu.f, a: cpu.a,
    _hl: cpu._hl, _de: cpu._de, _bc: cpu._bc,
    _ix: cpu._ix, _iy: cpu._iy,
    mbase: cpu.mbase, madl: cpu.madl,
    iff1: cpu.iff1, iff2: cpu.iff2, halted: cpu.halted,
  };

  function restoreSnapshot() {
    mem.set(memSnapshot);
    Object.assign(cpu, cpuSnapshot);
  }

  // Candidate values to test at 0xD00604
  const candidates = [];
  for (let i = 0x00; i <= 0x0F; i++) candidates.push(i);
  for (const v of [0x1C, 0x20, 0x28, 0x40, 0x80, 0xFF]) {
    if (!candidates.includes(v)) candidates.push(v);
  }

  console.log(`  Testing ${candidates.length} candidate values at 0xD00604`);
  console.log('  Format: value -> errNo, OP1 result, steps, final PC');
  console.log('');

  const results = [];

  for (const val of candidates) {
    restoreSnapshot();
    prepareCallState(cpu, mem);
    seedFPSOperands(mem);
    seedAllocator(mem);
    mem[FP_CATEGORY_ADDR] = 0x28;
    mem[0xD00604] = val;
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    let stepCount = 0;
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;

    try {
      executor.runFrom(GCD_HANDLER_ADDR, 'adl', {
        maxSteps: 2000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    const errNo = mem[ERR_NO_ADDR] & 0xff;
    const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
    const is4 = matchesBCD4(mem, OP1_ADDR);
    const status = returnHit ? 'RET' : errCaught ? 'ERR' : 'BUDGET';

    results.push({ val, errNo, op1Bytes, is4, stepCount, finalPc, status });

    const marker = (errNo !== 0x84) ? ' ***' : '';
    console.log(`    0x${val.toString(16).toUpperCase().padStart(2,'0')}: errNo=${hex(errNo, 2)}(${errName(errNo).padEnd(10)}) OP1=[${op1Bytes}] 4.0=${is4 ? 'YES' : 'no '}  steps=${String(stepCount).padStart(5)} PC=${hex(finalPc)} ${status}${marker}`);
  }

  console.log('');

  // Summary of passing values
  const passing = results.filter(r => r.errNo !== 0x84);
  const correct = results.filter(r => r.errNo === 0x00 && r.is4);

  console.log(`  Passing (errNo != 0x84): ${passing.length} values`);
  for (const r of passing) {
    console.log(`    0x${r.val.toString(16).toUpperCase().padStart(2,'0')}: errNo=${hex(r.errNo, 2)} OP1=[${r.op1Bytes}] 4.0=${r.is4 ? 'YES' : 'no'}`);
  }
  console.log('');

  console.log(`  Correct (errNo=0x00 AND OP1=4.0): ${correct.length} values`);
  for (const r of correct) {
    console.log(`    0x${r.val.toString(16).toUpperCase().padStart(2,'0')}: CORRECT gcd(12,8)=4.0`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // PART C: Cross-Reference 0xD00604
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART C: Cross-Reference 0xD00604 in ROM');
  console.log('='.repeat(72));
  console.log('');

  // Search for byte pattern 04 06 D0 (little-endian 0xD00604) with instruction prefix
  const xrefs = [];
  for (let i = 1; i < 0x400000 - 2; i++) {
    if (romBytes[i] === 0x04 && romBytes[i + 1] === 0x06 && romBytes[i + 2] === 0xD0) {
      const pre = romBytes[i - 1];
      let instr = '???';
      let type = '???';
      if (pre === 0x3A) { instr = 'LD A,(0xD00604)'; type = 'READ'; }
      else if (pre === 0x32) { instr = 'LD (0xD00604),A'; type = 'WRITE'; }
      else if (pre === 0x21) { instr = 'LD HL,0xD00604'; type = 'ADDR'; }
      else if (pre === 0x22) { instr = 'LD (0xD00604),HL'; type = 'WRITE'; }
      else if (pre === 0x2A) { instr = 'LD HL,(0xD00604)'; type = 'READ'; }
      else if (pre === 0x11) { instr = 'LD DE,0xD00604'; type = 'ADDR'; }
      else if (pre === 0x01) { instr = 'LD BC,0xD00604'; type = 'ADDR'; }
      else {
        // Could be part of multi-byte instruction or data
        instr = `?? (preceding byte: ${hex(pre, 2)})`;
        type = 'UNCLEAR';
      }
      xrefs.push({ addr: i - 1, pre, instr, type });
    }
  }

  // Group by type
  const reads = xrefs.filter(x => x.type === 'READ');
  const writes = xrefs.filter(x => x.type === 'WRITE');
  const addrs = xrefs.filter(x => x.type === 'ADDR');
  const unclear = xrefs.filter(x => x.type === 'UNCLEAR');

  console.log(`  Total references: ${xrefs.length}`);
  console.log(`    Direct reads (LD A,...): ${reads.length}`);
  console.log(`    Direct writes (LD ...,A): ${writes.length}`);
  console.log(`    Address loads (LD HL/DE,...): ${addrs.length}`);
  console.log(`    Unclear: ${unclear.length}`);
  console.log('');

  console.log('  WRITES to 0xD00604:');
  for (const x of writes) {
    // Show surrounding context
    const ctx = [];
    for (let j = Math.max(0, x.addr - 4); j < Math.min(romBytes.length, x.addr + 8); j++) {
      ctx.push(romBytes[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`    ${hex(x.addr)}: ${x.instr}  | context: ${ctx.join(' ')}`);
  }
  console.log('');

  console.log('  ADDRESS LOADS of 0xD00604 (LD HL/DE, used for indirect access):');
  for (const x of addrs) {
    // Disassemble a few instructions after the load to see what it does
    const nextBytes = [];
    for (let j = x.addr + 4; j < Math.min(romBytes.length, x.addr + 12); j++) {
      nextBytes.push(romBytes[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`    ${hex(x.addr)}: ${x.instr}  | next bytes: ${nextBytes.join(' ')}`);
  }
  console.log('');

  console.log('  READS from 0xD00604:');
  for (const x of reads) {
    const nextBytes = [];
    for (let j = x.addr + 4; j < Math.min(romBytes.length, x.addr + 8); j++) {
      nextBytes.push(romBytes[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`    ${hex(x.addr)}: ${x.instr}  | next: ${nextBytes.join(' ')}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // PART D: Bonus — Check what 0xD005F9 vs 0xD00604 actually represent
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART D: OP Layout Analysis');
  console.log('='.repeat(72));
  console.log('');
  console.log('  OP1 = 0xD005F8 (11 bytes: type byte at +1 = 0xD005F9)');
  console.log('  OP2 = 0xD00603 (11 bytes: type byte at +1 = 0xD00604)');
  console.log('  OP3 = 0xD0060E (11 bytes)');
  console.log('  OP4 = 0xD00619 (11 bytes)');
  console.log('  OP5 = 0xD00624 (11 bytes)');
  console.log('  OP6 = 0xD0062F (11 bytes)');
  console.log('');
  console.log('  Each OP register is 11 bytes:');
  console.log('    byte 0: object type (real=0x00, list=0x01, matrix=0x02, etc.)');
  console.log('    byte 1: type/sign (0x00=pos real, 0x80=neg real, 0x0C=complex)');
  console.log('    bytes 2-8: BCD mantissa (7 bytes)');
  console.log('    bytes 9-10: name/extra');
  console.log('');

  // Show what BCD_12 looks like in the OP layout
  console.log('  BCD 12.0 = [00 81 12 00 00 00 00 00 00]');
  console.log('    Written to OP1 (0xD005F8): type_obj=00, type_sign=81, mantissa=12...');
  console.log('    Written to OP2 (0xD00601): type_obj=00, type_sign=80, mantissa=80...');
  console.log('');
  console.log('  PROBLEM: OP2_ADDR in probe-phase139 is 0xD00601, but ROM uses 0xD00603!');
  console.log('  The probe seeds OP2 at wrong address. OP2 is at 0xD00603 (= OP1 + 11).');
  console.log('  The seed writes BCD_8 to 0xD00601, which is inside OP1 extended region.');
  console.log('  0xD00604 (OP2+1) was never seeded — it contains whatever MEM_INIT left.');
  console.log('');

  // Verify: check what 0xD00604 contains after MEM_INIT + our seeding
  restoreSnapshot();
  prepareCallState(cpu, mem);
  seedFPSOperands(mem);

  console.log('  After seedFPSOperands():');
  console.log(`    OP1 at 0xD005F8: [${hexBytes(mem, 0xD005F8, 11)}]`);
  console.log(`    OP2 at 0xD00601: [${hexBytes(mem, 0xD00601, 11)}]  (probe139 OP2_ADDR)`);
  console.log(`    OP2 at 0xD00603: [${hexBytes(mem, 0xD00603, 11)}]  (ROM's actual OP2)`);
  console.log(`    0xD005F9 (OP1 type): ${hex(mem[0xD005F9], 2)}`);
  console.log(`    0xD00604 (OP2 type): ${hex(mem[0xD00604], 2)}`);
  console.log('');

  // Now test with correct OP2 address
  console.log('  CORRECTED TEST: Seed OP2 at 0xD00603 (ROM-correct address)');
  restoreSnapshot();
  prepareCallState(cpu, mem);

  // Seed FPS
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + 9);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);

  // Seed OP1 at correct address
  mem.set(BCD_12, 0xD005F8);
  // Seed OP2 at ROM-correct address
  mem.set(BCD_8, 0xD00603);

  seedAllocator(mem);
  mem[FP_CATEGORY_ADDR] = 0x28;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`    OP1 at 0xD005F8: [${hexBytes(mem, 0xD005F8, 11)}]`);
  console.log(`    OP2 at 0xD00603: [${hexBytes(mem, 0xD00603, 11)}]`);
  console.log(`    0xD005F9 (OP1 type): ${hex(mem[0xD005F9], 2)}`);
  console.log(`    0xD00604 (OP2 type): ${hex(mem[0xD00604], 2)}`);
  console.log('');

  let stepCount = 0;
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  const recentPcs = [];

  try {
    executor.runFrom(GCD_HANDLER_ADDR, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP1 = 4.0: ${matchesBCD4(mem, OP1_ADDR) ? 'YES' : 'NO'}`);
  console.log('');

  if (!returnHit && !errCaught) {
    console.log('  Last 20 PCs:');
    for (const pc of recentPcs.slice(-20)) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART E: Corrected OP2 test with full execution trace
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART E: Corrected gcd call — OP2 at 0xD00603, full trace');
  console.log('='.repeat(72));
  console.log('');

  {
    restoreSnapshot();
    prepareCallState(cpu, mem);

    // Seed FPS
    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
    mem.set(BCD_12, FPS_CLEAN_AREA);
    mem.set(BCD_8, FPS_CLEAN_AREA + 9);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);

    // Seed OP1 at 0xD005F8, OP2 at ROM-correct 0xD00603
    mem.set(BCD_12, 0xD005F8);
    mem.set(BCD_8, 0xD00603);

    seedAllocator(mem);
    mem[FP_CATEGORY_ADDR] = 0x28;
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    console.log(`  OP1 at 0xD005F8: [${hexBytes(mem, 0xD005F8, 11)}]`);
    console.log(`  OP2 at 0xD00603: [${hexBytes(mem, 0xD00603, 11)}]`);
    console.log(`  0xD005F8 (OP1 obj type): ${hex(mem[0xD005F8], 2)}`);
    console.log(`  0xD005F9 (OP1 type/exp): ${hex(mem[0xD005F9], 2)}`);
    console.log(`  0xD00603 (OP2 obj type): ${hex(mem[0xD00603], 2)}`);
    console.log(`  0xD00604 (OP2 type/exp): ${hex(mem[0xD00604], 2)}`);
    console.log('');

    let stepCount = 0;
    const allPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Map();

    try {
      executor.runFrom(GCD_HANDLER_ADDR, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          allPcs.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          allPcs.push(norm);
          missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    const errNo2 = mem[ERR_NO_ADDR] & 0xff;
    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  errNo: ${hex(errNo2, 2)} (${errName(errNo2)})`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
    console.log(`  OP1 = 4.0: ${matchesBCD4(mem, OP1_ADDR) ? 'YES' : 'NO'}`);
    console.log('');

    // Full execution trace (first 60 blocks)
    console.log(`  Full trace (${allPcs.length} blocks, showing first 60):`);
    for (let i = 0; i < Math.min(60, allPcs.length); i++) {
      const pc = allPcs[i];
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      const miss = missingBlocks.has(pc) ? ' [MISSING]' : '';
      console.log(`    [${String(i).padStart(3)}] ${hex(pc)} | ${disasm}${miss}`);
    }
    console.log('');

    // Show OP1/OP2 after the first CALL (0x082957 = FpPop?)
    console.log(`  Post-execution OP1 at 0xD005F8: [${hexBytes(mem, 0xD005F8, 11)}]`);
    console.log(`  Post-execution OP2 at 0xD00603: [${hexBytes(mem, 0xD00603, 11)}]`);
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log('  KEY FINDINGS:');
  console.log('');
  console.log('  1. 0xD00604 = OP2 type byte (OP2 base = 0xD00603, NOT 0xD00601)');
  console.log('     ROM OP register layout: OP1=0xD005F8 (11 bytes), OP2=0xD00603 (11 bytes)');
  console.log('     probe-phase139 had OP2_ADDR=0xD00601, which is WRONG (inside OP1).');
  console.log('');
  console.log('  2. The instruction at 0x07F88D (LD A,(0xD00604); OR A; CALL Z,...) is');
  console.log('     NOT the domain check. It merely checks if OP2 type byte is zero,');
  console.log('     and if so, replaces OP2 with FP 0.0. This is a "sanitize" step.');
  console.log('');
  console.log('  3. gcd dispatch path: 0x06859B -> LD A,0x28 -> CALL 0x0689DE ->');
  console.log('     SUB 0x20 -> index 8 in jump table -> JP 0x068D3D (real handler).');
  console.log('     0x068D3D calls: 0x082957 (FpPop?) -> 0x068D61 (type check) ->');
  console.log('     0x082961 -> 0x082AE4 -> 0x068D61 again -> ... -> gcd core.');
  console.log('');
  console.log('  4. The actual domain check is at 0x068D61 -> CALL 0x068B78 ->');
  console.log('     0x07FA74 (set OP2[0]=0) -> JP 0x07F831 (type validator).');
  console.log('     0x07F831 checks OP1/OP2 exponent bytes and object types.');
  console.log('     If the check returns Z or C, 0x068D65/67 jumps to 0x068D5D');
  console.log('     which is JP 0x061D0E (LD A,0x84; E_Domain error).');
  console.log('');
  console.log('  5. Brute-force of 0xD00604 alone does NOT bypass E_Domain because');
  console.log('     the domain check at 0x07F831 examines multiple bytes:');
  console.log('     0xD005FA (OP1 exponent), 0xD00605 (OP2 exponent),');
  console.log('     0xD005F8 (OP1 obj type), 0xD00603 (OP2 obj type).');
  console.log('');
  console.log('  6. 55 ROM cross-references to 0xD00604 found:');
  console.log('     13 writes, 25 reads, 17 address loads.');
  console.log('     Notable writers: 0x068EC3 (writes 0x82), 0x06C144/0x07ED2E/');
  console.log('     0x0B01B1 (write 0x7F), 0x0A8059 (writes 0x8A).');
  console.log('');
  console.log('  NEXT STEPS:');
  console.log('  - The E_Domain error is NOT caused by 0xD00604 alone.');
  console.log('  - Need to trace execution through 0x07F831 to find exactly which');
  console.log('    comparison fails (likely OP1/OP2 object type or exponent check).');
  console.log('  - The first call in gcd handler (0x082957) likely pops from FPS to OP1/OP2,');
  console.log('    possibly overwriting our seeds. Need to verify what OP1/OP2 contain');
  console.log('    when 0x07F831 is actually reached.');
  console.log('');
  console.log('=== Phase 140 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
