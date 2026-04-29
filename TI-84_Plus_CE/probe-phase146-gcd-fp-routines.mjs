#!/usr/bin/env node

/**
 * Phase 146 — Disassemble 0x07FA74 routine + trace gcd register state + FpPop pre-seeding
 *
 * Part A: Disassemble ROM bytes at 0x07FA74-0x07FAC0 to understand what overwrites OP2
 * Part B: Trace register state during gcd(12,8) at key PCs (0x07FA74 entry, 0x07FA86 overwrite)
 * Part C: Test FpPop with register pre-seeding from the gcd trace vs vanilla (zero registers)
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

const ROUTINE_0x07FA74 = 0x07fa74;
const OVERWRITE_PC = 0x07fa86;
const LDI_COPY_CHAIN = 0x07f978;
const TYPE_VALIDATOR = 0x07f831;
const HELPER_ADDR = 0x082bb5;

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

// ── eZ80 instruction decoder ──────────────────────────────────────────────

function decodeInstructions(startPC, maxInstr) {
  let pc = startPC;
  const results = [];
  for (let i = 0; i < maxInstr; i++) {
    const instrStart = pc;
    const b0 = romBytes[pc] & 0xff;
    let decoded = '';
    let len = 1;

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
    else if (b0 === 0x36) {
      decoded = `LD (HL),${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x3E) {
      decoded = `LD A,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x06) {
      decoded = `LD B,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x0E) {
      decoded = `LD C,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x16) {
      decoded = `LD D,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x1E) {
      decoded = `LD E,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x26) {
      decoded = `LD H,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x2E) {
      decoded = `LD L,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xFE) {
      decoded = `CP ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xC6) {
      decoded = `ADD A,${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xD6) {
      decoded = `SUB ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xE6) {
      decoded = `AND ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xF6) {
      decoded = `OR ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0xEE) {
      decoded = `XOR ${hex(romBytes[pc+1]&0xff,2)}`; len = 2;
    }
    else if (b0 === 0x77) { decoded = 'LD (HL),A'; len = 1; }
    else if (b0 === 0x7E) { decoded = 'LD A,(HL)'; len = 1; }
    else if (b0 === 0x46) { decoded = 'LD B,(HL)'; len = 1; }
    else if (b0 === 0x4E) { decoded = 'LD C,(HL)'; len = 1; }
    else if (b0 === 0x56) { decoded = 'LD D,(HL)'; len = 1; }
    else if (b0 === 0x5E) { decoded = 'LD E,(HL)'; len = 1; }
    else if (b0 === 0x66) { decoded = 'LD H,(HL)'; len = 1; }
    else if (b0 === 0x6E) { decoded = 'LD L,(HL)'; len = 1; }
    else if (b0 === 0x70) { decoded = 'LD (HL),B'; len = 1; }
    else if (b0 === 0x71) { decoded = 'LD (HL),C'; len = 1; }
    else if (b0 === 0x72) { decoded = 'LD (HL),D'; len = 1; }
    else if (b0 === 0x73) { decoded = 'LD (HL),E'; len = 1; }
    else if (b0 === 0x74) { decoded = 'LD (HL),H'; len = 1; }
    else if (b0 === 0x75) { decoded = 'LD (HL),L'; len = 1; }
    // LD r,r patterns (0x40-0x7F minus (HL) variants already handled)
    else if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      const src = b0 & 0x07;
      const dst = (b0 >> 3) & 0x07;
      decoded = `LD ${regNames8[dst]},${regNames8[src]}`; len = 1;
    }
    else if (b0 === 0xED) {
      const b1 = romBytes[pc+1] & 0xff;
      if (b1 === 0xB0) { decoded = 'LDIR'; len = 2; }
      else if (b1 === 0xA0) { decoded = 'LDI'; len = 2; }
      else if (b1 === 0xB8) { decoded = 'LDDR'; len = 2; }
      else if (b1 === 0xA8) { decoded = 'LDD'; len = 2; }
      else if (b1 === 0x52) { decoded = 'SBC HL,DE'; len = 2; }
      else if (b1 === 0x42) { decoded = 'SBC HL,BC'; len = 2; }
      else if (b1 === 0x4A) { decoded = 'ADC HL,BC'; len = 2; }
      else if (b1 === 0x5A) { decoded = 'ADC HL,DE'; len = 2; }
      else if (b1 === 0x6A) { decoded = 'ADC HL,HL'; len = 2; }
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
      else if (b1 === 0x6B) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD HL,(${hex(target)})`; len = 5;
      }
      else if (b1 === 0x63) {
        const target = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD (${hex(target)}),HL`; len = 5;
      }
      else { decoded = `ED ${b1.toString(16).toUpperCase().padStart(2,'0')} (?)`; len = 2; }
    }
    else if (b0 === 0xCB) {
      const b1 = romBytes[pc+1] & 0xff;
      const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      if (b1 >= 0x40 && b1 <= 0x7F) {
        const bit = (b1 >> 3) & 7;
        const reg = b1 & 7;
        decoded = `BIT ${bit},${regNames8[reg]}`; len = 2;
      } else if (b1 >= 0x80 && b1 <= 0xBF) {
        const bit = (b1 >> 3) & 7;
        const reg = b1 & 7;
        decoded = `RES ${bit},${regNames8[reg]}`; len = 2;
      } else if (b1 >= 0xC0) {
        const bit = (b1 >> 3) & 7;
        const reg = b1 & 7;
        decoded = `SET ${bit},${regNames8[reg]}`; len = 2;
      } else {
        const op = (b1 >> 3) & 7;
        const reg = b1 & 7;
        decoded = `${bitOps[op]} ${regNames8[reg]}`; len = 2;
      }
    }
    else if (b0 === 0xDD || b0 === 0xFD) {
      const prefix = b0 === 0xDD ? 'IX' : 'IY';
      const b1 = romBytes[pc+1] & 0xff;
      if (b1 === 0xCB) {
        const disp = romBytes[pc+2] & 0xff;
        const dispSigned = (disp & 0x80) ? disp - 256 : disp;
        const b3 = romBytes[pc+3] & 0xff;
        if (b3 >= 0x40 && b3 <= 0x7F) {
          const bit = (b3 >> 3) & 7;
          decoded = `BIT ${bit},(${prefix}+${dispSigned})`; len = 4;
        } else if (b3 >= 0x80 && b3 <= 0xBF) {
          const bit = (b3 >> 3) & 7;
          decoded = `RES ${bit},(${prefix}+${dispSigned})`; len = 4;
        } else if (b3 >= 0xC0) {
          const bit = (b3 >> 3) & 7;
          decoded = `SET ${bit},(${prefix}+${dispSigned})`; len = 4;
        } else {
          decoded = `${prefix} CB ${hex(disp,2)} ${hex(b3,2)} (?)`; len = 4;
        }
      }
      else if (b1 === 0x21) {
        const imm = (romBytes[pc+2]&0xff) | ((romBytes[pc+3]&0xff)<<8) | ((romBytes[pc+4]&0xff)<<16);
        decoded = `LD ${prefix},${hex(imm)}`; len = 5;
      }
      else if (b1 === 0x36) {
        const disp = romBytes[pc+2] & 0xff;
        const dispSigned = (disp & 0x80) ? disp - 256 : disp;
        const val = romBytes[pc+3] & 0xff;
        decoded = `LD (${prefix}+${dispSigned}),${hex(val,2)}`; len = 4;
      }
      else if (b1 === 0x77) {
        const disp = romBytes[pc+2] & 0xff;
        const dispSigned = (disp & 0x80) ? disp - 256 : disp;
        decoded = `LD (${prefix}+${dispSigned}),A`; len = 3;
      }
      else if (b1 === 0x7E) {
        const disp = romBytes[pc+2] & 0xff;
        const dispSigned = (disp & 0x80) ? disp - 256 : disp;
        decoded = `LD A,(${prefix}+${dispSigned})`; len = 3;
      }
      else if (b1 === 0x46) {
        const disp = romBytes[pc+2] & 0xff;
        const dispSigned = (disp & 0x80) ? disp - 256 : disp;
        decoded = `LD B,(${prefix}+${dispSigned})`; len = 3;
      }
      else if (b1 === 0xE5) { decoded = `PUSH ${prefix}`; len = 2; }
      else if (b1 === 0xE1) { decoded = `POP ${prefix}`; len = 2; }
      else if (b1 === 0xE9) { decoded = `JP (${prefix})`; len = 2; }
      else if (b1 === 0x23) { decoded = `INC ${prefix}`; len = 2; }
      else if (b1 === 0x2B) { decoded = `DEC ${prefix}`; len = 2; }
      else if (b1 === 0x09) { decoded = `ADD ${prefix},BC`; len = 2; }
      else if (b1 === 0x19) { decoded = `ADD ${prefix},DE`; len = 2; }
      else if (b1 === 0x29) { decoded = `ADD ${prefix},${prefix}`; len = 2; }
      else if (b1 === 0x39) { decoded = `ADD ${prefix},SP`; len = 2; }
      else {
        decoded = `${prefix} prefix ${hex(b1,2)} (?)`; len = 2;
      }
    }
    // Conditional jumps
    else if (b0 === 0xCA || b0 === 0xC2 || b0 === 0xDA || b0 === 0xD2 ||
             b0 === 0xEA || b0 === 0xE2 || b0 === 0xFA || b0 === 0xF2) {
      const condNames = { 0xCA: 'JP Z', 0xC2: 'JP NZ', 0xDA: 'JP C', 0xD2: 'JP NC',
                          0xEA: 'JP PE', 0xE2: 'JP PO', 0xFA: 'JP M', 0xF2: 'JP P' };
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `${condNames[b0]},${hex(target)}`; len = 4;
    }
    // Conditional calls
    else if (b0 === 0xCC) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `CALL Z,${hex(target)}`; len = 4;
    }
    else if (b0 === 0xC4) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `CALL NZ,${hex(target)}`; len = 4;
    }
    else if (b0 === 0xDC) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `CALL C,${hex(target)}`; len = 4;
    }
    else if (b0 === 0xD4) {
      const target = (romBytes[pc+1]&0xff) | ((romBytes[pc+2]&0xff)<<8) | ((romBytes[pc+3]&0xff)<<16);
      decoded = `CALL NC,${hex(target)}`; len = 4;
    }
    // Conditional returns
    else if (b0 === 0xC8) { decoded = 'RET Z'; len = 1; }
    else if (b0 === 0xC0) { decoded = 'RET NZ'; len = 1; }
    else if (b0 === 0xD8) { decoded = 'RET C'; len = 1; }
    else if (b0 === 0xD0) { decoded = 'RET NC'; len = 1; }
    else if (b0 === 0xE8) { decoded = 'RET PE'; len = 1; }
    else if (b0 === 0xE0) { decoded = 'RET PO'; len = 1; }
    else if (b0 === 0xF8) { decoded = 'RET M'; len = 1; }
    else if (b0 === 0xF0) { decoded = 'RET P'; len = 1; }
    // PUSH/POP
    else if (b0 === 0xC5) { decoded = 'PUSH BC'; len = 1; }
    else if (b0 === 0xD5) { decoded = 'PUSH DE'; len = 1; }
    else if (b0 === 0xE5) { decoded = 'PUSH HL'; len = 1; }
    else if (b0 === 0xF5) { decoded = 'PUSH AF'; len = 1; }
    else if (b0 === 0xC1) { decoded = 'POP BC'; len = 1; }
    else if (b0 === 0xD1) { decoded = 'POP DE'; len = 1; }
    else if (b0 === 0xE1) { decoded = 'POP HL'; len = 1; }
    else if (b0 === 0xF1) { decoded = 'POP AF'; len = 1; }
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
    // RST
    else if ((b0 & 0xC7) === 0xC7) {
      decoded = `RST ${hex(b0 & 0x38, 2)}`; len = 1;
    }
    // INC/DEC r
    else if (b0 === 0x04) { decoded = 'INC B'; len = 1; }
    else if (b0 === 0x05) { decoded = 'DEC B'; len = 1; }
    else if (b0 === 0x0C) { decoded = 'INC C'; len = 1; }
    else if (b0 === 0x0D) { decoded = 'DEC C'; len = 1; }
    else if (b0 === 0x14) { decoded = 'INC D'; len = 1; }
    else if (b0 === 0x15) { decoded = 'DEC D'; len = 1; }
    else if (b0 === 0x1C) { decoded = 'INC E'; len = 1; }
    else if (b0 === 0x1D) { decoded = 'DEC E'; len = 1; }
    else if (b0 === 0x24) { decoded = 'INC H'; len = 1; }
    else if (b0 === 0x25) { decoded = 'DEC H'; len = 1; }
    else if (b0 === 0x2C) { decoded = 'INC L'; len = 1; }
    else if (b0 === 0x2D) { decoded = 'DEC L'; len = 1; }
    else if (b0 === 0x34) { decoded = 'INC (HL)'; len = 1; }
    else if (b0 === 0x35) { decoded = 'DEC (HL)'; len = 1; }
    else if (b0 === 0x3C) { decoded = 'INC A'; len = 1; }
    else if (b0 === 0x3D) { decoded = 'DEC A'; len = 1; }
    // ALU A,r
    else if (b0 >= 0x80 && b0 <= 0x87) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `ADD A,${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0x88 && b0 <= 0x8F) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `ADC A,${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0x90 && b0 <= 0x97) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `SUB ${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0x98 && b0 <= 0x9F) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `SBC A,${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0xA0 && b0 <= 0xA7) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `AND ${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0xA8 && b0 <= 0xAF) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `XOR ${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0xB0 && b0 <= 0xB7) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `OR ${regNames8[b0&7]}`; len = 1;
    }
    else if (b0 >= 0xB8 && b0 <= 0xBF) {
      const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
      decoded = `CP ${regNames8[b0&7]}`; len = 1;
    }
    // Misc
    else if (b0 === 0x76) { decoded = 'HALT'; len = 1; }
    else if (b0 === 0xF3) { decoded = 'DI'; len = 1; }
    else if (b0 === 0xFB) { decoded = 'EI'; len = 1; }
    else if (b0 === 0xD9) { decoded = 'EXX'; len = 1; }
    else if (b0 === 0x08) { decoded = 'EX AF,AF\''; len = 1; }
    else if (b0 === 0x10) {
      const rel = romBytes[pc+1] & 0xff;
      const target = pc + 2 + ((rel & 0x80) ? rel - 256 : rel);
      decoded = `DJNZ ${hex(target)}`; len = 2;
    }
    else if (b0 === 0x37) { decoded = 'SCF'; len = 1; }
    else if (b0 === 0x3F) { decoded = 'CCF'; len = 1; }
    else if (b0 === 0x2F) { decoded = 'CPL'; len = 1; }
    else if (b0 === 0x07) { decoded = 'RLCA'; len = 1; }
    else if (b0 === 0x0F) { decoded = 'RRCA'; len = 1; }
    else if (b0 === 0x17) { decoded = 'RLA'; len = 1; }
    else if (b0 === 0x1F) { decoded = 'RRA'; len = 1; }
    else if (b0 === 0xE3) { decoded = 'EX (SP),HL'; len = 1; }
    else if (b0 === 0xF9) { decoded = 'LD SP,HL'; len = 1; }
    else if (b0 === 0xE9) { decoded = 'JP (HL)'; len = 1; }
    else if (b0 === 0xD3) {
      decoded = `OUT (${hex(romBytes[pc+1]&0xff,2)}),A`; len = 2;
    }
    else if (b0 === 0xDB) {
      decoded = `IN A,(${hex(romBytes[pc+1]&0xff,2)})`; len = 2;
    }
    else {
      decoded = `DB ${hex(b0, 2)}`;
      len = 1;
    }

    const instrBytes = [];
    for (let j = 0; j < len; j++) instrBytes.push((romBytes[instrStart + j] & 0xff).toString(16).toUpperCase().padStart(2, '0'));

    const entry = {
      addr: instrStart,
      bytes: instrBytes.join(' '),
      decoded,
    };
    results.push(entry);
    console.log(`    ${hex(instrStart)}: ${entry.bytes.padEnd(15)} ${decoded}`);

    pc += len;

    // Stop at RET
    if (b0 === 0xC9) break;
  }
  return results;
}

// ── Part A: Disassemble 0x07FA74-0x07FAC0 ────────────────────────────────

function partA_disassemble() {
  console.log('='.repeat(72));
  console.log('  PART A: Disassemble 0x07FA74-0x07FAC0 (OP2 overwrite routine)');
  console.log('='.repeat(72));
  console.log('');

  // Dump raw bytes
  const startAddr = ROUTINE_0x07FA74;
  const endAddr = 0x07fac0;
  const dumpLen = endAddr - startAddr;
  console.log(`  Raw ROM bytes from ${hex(startAddr)} to ${hex(endAddr - 1)} (${dumpLen} bytes):`);
  console.log('');

  for (let off = 0; off < dumpLen; off += 16) {
    const addr = startAddr + off;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && (off + i) < dumpLen; i++) {
      const b = romBytes[addr + i] & 0xff;
      bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
  console.log('');

  // Disassemble
  console.log('  --- Instruction decode at 0x07FA74 ---');
  const instrs = decodeInstructions(startAddr, 40);
  console.log('');

  // Annotate known addresses
  console.log('  --- Annotations ---');
  for (const instr of instrs) {
    if (instr.decoded.includes(hex(OP2_ADDR))) {
      console.log(`    ${hex(instr.addr)}: References OP2 (0xD00603)`);
    }
    if (instr.decoded.includes(hex(OP1_ADDR))) {
      console.log(`    ${hex(instr.addr)}: References OP1 (0xD005F8)`);
    }
    if (instr.decoded.includes(hex(FPS_ADDR))) {
      console.log(`    ${hex(instr.addr)}: References FPS pointer (0xD0258D)`);
    }
    if (instr.decoded.includes(hex(FPSBASE_ADDR))) {
      console.log(`    ${hex(instr.addr)}: References FPSbase (0xD0258A)`);
    }
    if (instr.decoded.includes(hex(FPPOP_ADDR))) {
      console.log(`    ${hex(instr.addr)}: Calls FpPop (0x082957)`);
    }
    if (instr.decoded.includes(hex(FPPUSH_ADDR))) {
      console.log(`    ${hex(instr.addr)}: Calls FpPush (0x082961)`);
    }
    if (instr.decoded.includes(hex(HELPER_ADDR))) {
      console.log(`    ${hex(instr.addr)}: Calls Helper (0x082BB5)`);
    }
    if (instr.decoded.includes(hex(LDI_COPY_CHAIN))) {
      console.log(`    ${hex(instr.addr)}: References LDI copy chain (0x07F978)`);
    }
    if (instr.decoded.includes(hex(TYPE_VALIDATOR))) {
      console.log(`    ${hex(instr.addr)}: References type validator (0x07F831)`);
    }
    // Check for 1.0 BCD pattern: type=0x00, exp=0x80, mantissa=0x10...
    if (instr.decoded.includes('0x80') || instr.decoded.includes('0x10')) {
      console.log(`    ${hex(instr.addr)}: Potential 1.0 BCD component (${instr.decoded})`);
    }
  }
  console.log('');

  // Also search for OP2 address as a 3-byte LE value in the range
  console.log('  --- Searching for known address references in byte stream ---');
  const knownAddrs = [
    [OP1_ADDR, 'OP1'], [OP2_ADDR, 'OP2'], [FPS_ADDR, 'FPS'], [FPSBASE_ADDR, 'FPSbase'],
    [FPPOP_ADDR, 'FpPop'], [FPPUSH_ADDR, 'FpPush'], [HELPER_ADDR, 'Helper'],
    [LDI_COPY_CHAIN, 'LDI copy'], [TYPE_VALIDATOR, 'TypeValidator'],
  ];
  for (let off = 0; off < dumpLen - 2; off++) {
    const addr = startAddr + off;
    const val = (romBytes[addr] & 0xff) |
                ((romBytes[addr + 1] & 0xff) << 8) |
                ((romBytes[addr + 2] & 0xff) << 16);
    for (const [known, label] of knownAddrs) {
      if (val === known) {
        console.log(`    ${hex(addr)}: 3-byte LE value = ${hex(known)} (${label})`);
      }
    }
  }
  console.log('');
}

// ── Part B: Trace register state during gcd(12,8) ───────────────────────

function partB_traceRegisters(executor, cpu, mem) {
  console.log('='.repeat(72));
  console.log('  PART B: Trace register state during gcd(12,8) at key PCs');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Seed FPS with 9-byte entries
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
  console.log(`    FPS area: [${hexBytes(mem, FPS_CLEAN_AREA, 20)}]`);
  console.log('');

  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;

  // Collect register snapshots at key PCs
  const regSnapshots = [];
  const watchPCs = new Set([
    ROUTINE_0x07FA74,   // 0x07FA74 - entry to the OP2-overwriting routine
    OVERWRITE_PC,       // 0x07FA86 - the OP2 overwrite point
    FPPOP_ADDR,         // 0x082957 - FpPop
    FPPUSH_ADDR,        // 0x082961 - FpPush
    HELPER_ADDR,        // 0x082BB5 - helper
    LDI_COPY_CHAIN,     // 0x07F978 - LDI copy chain
    TYPE_VALIDATOR,     // 0x07F831 - type validator
  ]);

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        if (watchPCs.has(norm)) {
          regSnapshots.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            hl: cpu._hl & 0xffffff,
            de: cpu._de & 0xffffff,
            bc: cpu._bc & 0xffffff,
            sp: cpu.sp & 0xffffff,
            ix: cpu._ix & 0xffffff,
            iy: cpu._iy & 0xffffff,
            op1: hexBytes(mem, OP1_ADDR, 9),
            op2: hexBytes(mem, OP2_ADDR, 9),
            fpsPtr: read24(mem, FPS_ADDR),
            op1Decoded: decodeBCDFloat(mem, OP1_ADDR),
            op2Decoded: decodeBCDFloat(mem, OP2_ADDR),
          });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        if (watchPCs.has(norm)) {
          regSnapshots.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            hl: cpu._hl & 0xffffff,
            de: cpu._de & 0xffffff,
            bc: cpu._bc & 0xffffff,
            sp: cpu.sp & 0xffffff,
            ix: cpu._ix & 0xffffff,
            iy: cpu._iy & 0xffffff,
            op1: hexBytes(mem, OP1_ADDR, 9),
            op2: hexBytes(mem, OP2_ADDR, 9),
            fpsPtr: read24(mem, FPS_ADDR),
            op1Decoded: decodeBCDFloat(mem, OP1_ADDR),
            op2Decoded: decodeBCDFloat(mem, OP2_ADDR),
          });
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

  console.log(`  REGISTER SNAPSHOTS at watched PCs (${regSnapshots.length} hits):`);
  console.log('');
  for (const snap of regSnapshots) {
    const pcLabel =
      snap.pc === ROUTINE_0x07FA74 ? ' (routine entry)' :
      snap.pc === OVERWRITE_PC ? ' (OP2 overwrite)' :
      snap.pc === FPPOP_ADDR ? ' (FpPop)' :
      snap.pc === FPPUSH_ADDR ? ' (FpPush)' :
      snap.pc === HELPER_ADDR ? ' (Helper)' :
      snap.pc === LDI_COPY_CHAIN ? ' (LDI copy)' :
      snap.pc === TYPE_VALIDATOR ? ' (TypeValidator)' :
      '';
    console.log(`    [Step ${snap.step}] PC=${hex(snap.pc)}${pcLabel}`);
    console.log(`      A=${hex(snap.a,2)}  F=${hex(snap.f,2)}  HL=${hex(snap.hl)}  DE=${hex(snap.de)}  BC=${hex(snap.bc)}`);
    console.log(`      SP=${hex(snap.sp)}  IX=${hex(snap.ix)}  IY=${hex(snap.iy)}`);
    console.log(`      OP1=[${snap.op1}] ${snap.op1Decoded}`);
    console.log(`      OP2=[${snap.op2}] ${snap.op2Decoded}`);
    console.log(`      FPS ptr=${hex(snap.fpsPtr)}`);
    console.log('');
  }

  // Return the snapshots for Part C to use
  return regSnapshots;
}

// ── Part C: FpPop with register pre-seeding ──────────────────────────────

function partC_fpPopPreSeed(executor, cpu, mem, regSnapshots) {
  console.log('='.repeat(72));
  console.log('  PART C: FpPop with register pre-seeding vs vanilla');
  console.log('='.repeat(72));
  console.log('');

  // Find the FpPop snapshot from the gcd trace
  const fpPopSnaps = regSnapshots.filter(s => s.pc === FPPOP_ADDR);
  console.log(`  Found ${fpPopSnaps.length} FpPop call(s) in gcd trace.`);

  // Also find the snapshot at 0x07FA74 entry for context
  const entrySnaps = regSnapshots.filter(s => s.pc === ROUTINE_0x07FA74);
  if (entrySnaps.length > 0) {
    console.log(`  Found ${entrySnaps.length} entry to 0x07FA74 in gcd trace.`);
  }
  console.log('');

  // --- Test 1: Vanilla FpPop (zero registers) ---
  console.log('  --- Test 1: Vanilla FpPop (zero/default registers) ---');
  {
    prepareCallState(cpu, mem);
    seedAllocator(mem);

    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
    mem.set(BCD_8, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);

    const fpsBefore = read24(mem, FPS_ADDR);
    console.log(`    Before: FPS ptr=${hex(fpsBefore)}, OP1=[${hexBytes(mem, OP1_ADDR, 9)}], OP2=[${hexBytes(mem, OP2_ADDR, 9)}]`);
    console.log(`    Registers: A=${hex(cpu.a&0xff,2)} HL=${hex(cpu._hl&0xffffff)} DE=${hex(cpu._de&0xffffff)} BC=${hex(cpu._bc&0xffffff)}`);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    let returned = false;
    const pcTrace = [];
    try {
      executor.runFrom(FPPOP_ADDR, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const fpsAfter = read24(mem, FPS_ADDR);
    const fpsDelta = fpsAfter - fpsBefore;
    console.log(`    After:  FPS ptr=${hex(fpsAfter)}, delta=${fpsDelta > 0 ? '+' : ''}${fpsDelta}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}]  ${decodeBCDFloat(mem, OP1_ADDR)}`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]  ${decodeBCDFloat(mem, OP2_ADDR)}`);
    console.log(`    Returned: ${returned}`);
    console.log(`    PC trace: [${pcTrace.map(p => hex(p)).join(', ')}]`);
    console.log('');
  }

  // --- Test 2: Pre-seeded FpPop (using gcd trace registers) ---
  if (fpPopSnaps.length > 0) {
    console.log('  --- Test 2: Pre-seeded FpPop (gcd trace registers) ---');
    const snap = fpPopSnaps[0];
    console.log(`    Using register state from step ${snap.step}:`);
    console.log(`      A=${hex(snap.a,2)} F=${hex(snap.f,2)} HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)}`);
    console.log(`      SP=${hex(snap.sp)} IX=${hex(snap.ix)} IY=${hex(snap.iy)}`);
    console.log('');

    prepareCallState(cpu, mem);
    seedAllocator(mem);

    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
    mem.set(BCD_8, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);

    // Pre-seed registers from gcd trace
    cpu.a = snap.a;
    cpu.f = snap.f;
    cpu._hl = snap.hl;
    cpu._de = snap.de;
    cpu._bc = snap.bc;
    cpu._ix = snap.ix;
    cpu._iy = snap.iy;
    // Don't override SP — we need our own stack with FAKE_RET

    const fpsBefore = read24(mem, FPS_ADDR);
    console.log(`    Before: FPS ptr=${hex(fpsBefore)}, OP1=[${hexBytes(mem, OP1_ADDR, 9)}], OP2=[${hexBytes(mem, OP2_ADDR, 9)}]`);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    let returned = false;
    const pcTrace = [];
    try {
      executor.runFrom(FPPOP_ADDR, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const fpsAfter = read24(mem, FPS_ADDR);
    const fpsDelta = fpsAfter - fpsBefore;
    console.log(`    After:  FPS ptr=${hex(fpsAfter)}, delta=${fpsDelta > 0 ? '+' : ''}${fpsDelta}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}]  ${decodeBCDFloat(mem, OP1_ADDR)}`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]  ${decodeBCDFloat(mem, OP2_ADDR)}`);
    console.log(`    Returned: ${returned}`);
    console.log(`    PC trace: [${pcTrace.map(p => hex(p)).join(', ')}]`);
    console.log('');

    // Analysis
    console.log('  --- COMPARISON ---');
    console.log('    Vanilla:    FPS delta shown above');
    console.log('    Pre-seeded: FPS delta shown above');
    const op1Has = !mem.slice(OP1_ADDR, OP1_ADDR + 9).every(b => b === 0);
    const op2Has = !mem.slice(OP2_ADDR, OP2_ADDR + 9).every(b => b === 0);
    console.log(`    Pre-seeded result: OP1 has data=${op1Has}, OP2 has data=${op2Has}`);
    if (op1Has) console.log(`      OP1 decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
    if (op2Has) console.log(`      OP2 decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);
    console.log('');
  } else {
    console.log('  No FpPop calls found in gcd trace — trying with entry registers instead.');
    console.log('');

    if (entrySnaps.length > 0) {
      console.log('  --- Test 2b: Pre-seeded FpPop (0x07FA74 entry registers) ---');
      const snap = entrySnaps[0];
      console.log(`    Using register state from step ${snap.step} (0x07FA74 entry):`);
      console.log(`      A=${hex(snap.a,2)} F=${hex(snap.f,2)} HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)}`);
      console.log(`      IX=${hex(snap.ix)} IY=${hex(snap.iy)}`);
      console.log('');

      prepareCallState(cpu, mem);
      seedAllocator(mem);

      mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
      mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

      write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
      mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
      mem.set(BCD_8, FPS_CLEAN_AREA);
      write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);

      cpu.a = snap.a;
      cpu.f = snap.f;
      cpu._hl = snap.hl;
      cpu._de = snap.de;
      cpu._bc = snap.bc;
      cpu._ix = snap.ix;
      cpu._iy = snap.iy;

      const fpsBefore = read24(mem, FPS_ADDR);
      console.log(`    Before: FPS ptr=${hex(fpsBefore)}`);

      cpu.sp -= 3;
      write24(mem, cpu.sp, FAKE_RET);

      let returned = false;
      const pcTrace = [];
      try {
        executor.runFrom(FPPOP_ADDR, 'adl', {
          maxSteps: 500,
          maxLoopIterations: 256,
          onBlock(pc) {
            const norm = pc & 0xffffff;
            if (pcTrace.length < 50) pcTrace.push(norm);
            if (norm === FAKE_RET) throw new Error('__RET__');
          },
          onMissingBlock(pc) {
            const norm = pc & 0xffffff;
            if (pcTrace.length < 50) pcTrace.push(norm);
            if (norm === FAKE_RET) throw new Error('__RET__');
          },
        });
      } catch (e) {
        if (e?.message === '__RET__') returned = true;
        else throw e;
      }

      const fpsAfter = read24(mem, FPS_ADDR);
      const fpsDelta = fpsAfter - fpsBefore;
      console.log(`    After:  FPS ptr=${hex(fpsAfter)}, delta=${fpsDelta > 0 ? '+' : ''}${fpsDelta}`);
      console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}]  ${decodeBCDFloat(mem, OP1_ADDR)}`);
      console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]  ${decodeBCDFloat(mem, OP2_ADDR)}`);
      console.log(`    Returned: ${returned}`);
      console.log(`    PC trace: [${pcTrace.map(p => hex(p)).join(', ')}]`);
      console.log('');
    }
  }

  // --- Test 3: FpPop with HL pre-set to OP2 address ---
  console.log('  --- Test 3: FpPop with HL=OP2 (0xD00603) ---');
  {
    prepareCallState(cpu, mem);
    seedAllocator(mem);

    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
    mem.set(BCD_8, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);

    // Key hypothesis: FpPop uses HL as destination
    cpu._hl = OP2_ADDR;

    const fpsBefore = read24(mem, FPS_ADDR);
    console.log(`    Before: FPS ptr=${hex(fpsBefore)}, HL=${hex(cpu._hl&0xffffff)}`);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    let returned = false;
    const pcTrace = [];
    try {
      executor.runFrom(FPPOP_ADDR, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          const norm = pc & 0xffffff;
          if (pcTrace.length < 50) pcTrace.push(norm);
          if (norm === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const fpsAfter = read24(mem, FPS_ADDR);
    const fpsDelta = fpsAfter - fpsBefore;
    console.log(`    After:  FPS ptr=${hex(fpsAfter)}, delta=${fpsDelta > 0 ? '+' : ''}${fpsDelta}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}]  ${decodeBCDFloat(mem, OP1_ADDR)}`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]  ${decodeBCDFloat(mem, OP2_ADDR)}`);
    console.log(`    Returned: ${returned}`);
    console.log(`    PC trace: [${pcTrace.map(p => hex(p)).join(', ')}]`);
    const op2Has = !mem.slice(OP2_ADDR, OP2_ADDR + 9).every(b => b === 0);
    if (op2Has) console.log(`    OP2 decoded: ${decodeBCDFloat(mem, OP2_ADDR)} -- HL=OP2 hypothesis ${fpsDelta < 0 ? 'CONFIRMED' : 'partial'}`);
    console.log('');
  }

  // --- Test 4: FpPop with HL=OP1 ---
  console.log('  --- Test 4: FpPop with HL=OP1 (0xD005F8) ---');
  {
    prepareCallState(cpu, mem);
    seedAllocator(mem);

    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);

    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
    mem.set(BCD_8, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9);

    cpu._hl = OP1_ADDR;

    const fpsBefore = read24(mem, FPS_ADDR);
    console.log(`    Before: FPS ptr=${hex(fpsBefore)}, HL=${hex(cpu._hl&0xffffff)}`);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    let returned = false;
    try {
      executor.runFrom(FPPOP_ADDR, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
        onMissingBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const fpsAfter = read24(mem, FPS_ADDR);
    const fpsDelta = fpsAfter - fpsBefore;
    console.log(`    After:  FPS ptr=${hex(fpsAfter)}, delta=${fpsDelta > 0 ? '+' : ''}${fpsDelta}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}]  ${decodeBCDFloat(mem, OP1_ADDR)}`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]  ${decodeBCDFloat(mem, OP2_ADDR)}`);
    console.log(`    Returned: ${returned}`);
    const op1Has = !mem.slice(OP1_ADDR, OP1_ADDR + 9).every(b => b === 0);
    if (op1Has) console.log(`    OP1 decoded: ${decodeBCDFloat(mem, OP1_ADDR)} -- HL=OP1 hypothesis ${fpsDelta < 0 ? 'CONFIRMED' : 'partial'}`);
    console.log('');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 146: gcd FP routines — disasm + register trace + FpPop pre-seeding ===');
  console.log('');

  // Part A: Static disassembly
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

  // Part B: Trace registers during gcd
  const regSnapshots = partB_traceRegisters(executor, cpu, mem);

  // Part C: FpPop pre-seeding
  partC_fpPopPreSeed(executor, cpu, mem, regSnapshots);

  console.log('=== Phase 146 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
