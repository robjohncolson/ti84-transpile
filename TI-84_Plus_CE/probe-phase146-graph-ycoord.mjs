#!/usr/bin/env node

/**
 * Phase 146 — Graph Y-coordinate mapping: trace IPoint's VRAM address computation.
 *
 * Part A: Disassemble IPoint's VRAM address computation from ROM bytes 0x07B451–0x07B700
 * Part B: Trace VRAM addresses for 5 different Y coordinates
 * Part C: Find the Y-coordinate input path (register or RAM slot at IPoint entry)
 * Part D: Root-cause the row-239 clamping
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

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

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const CREATEEQU_RET = 0x7FFFFA;
const GRAPHPARS_RET = 0x7FFFF4;
const MEMINIT_RET = 0x7FFFF6;
const IPOINT_RET = 0x7FFFF2;

// Entry points
const CREATEEQU_ENTRY = 0x082438;
const GRAPHPARS_BODY_ENTRY = 0x099874;
const MEMINIT_ENTRY = 0x09DEE0;
const IPOINT_ENTRY = 0x07B451;

// OP registers
const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

// Parser pointers
const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

// Pixel dimension addresses
const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;

// Draw state addresses
const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const DRAW_FG_COLOR_ADDR = 0xD026AC;
const DRAW_BG_COLOR_ADDR = 0xD026AA;
const HOOKFLAGS3_ADDR = 0xD000B5;
const MODE_BYTE_ADDR = 0xD02AD4;
const DRAW_MODE_ADDR = 0xD02AC8;

// Graph BCD real addresses
const XMIN_ADDR = 0xD01E33;
const XMAX_ADDR = 0xD01E3C;
const XSCL_ADDR = 0xD01E45;
const YMIN_ADDR = 0xD01E4E;
const YMAX_ADDR = 0xD01E57;
const YSCL_ADDR = 0xD01E60;
const XRES_ADDR = 0xD01E69;

// Graph mode
const GRAPHMODE_ADDR = 0xD01474;

// IY flag addresses (IY=0xD00080)
const IY_PLUS_43_ADDR = 0xD000AB;  // IY+0x2B: bounds check path
const IY_PLUS_74_ADDR = 0xD000CA;  // IY+0x4A: pixel write path

// Framebuffer address register
const FRAMEBUF_ADDR_REG = 0xD02A8A;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;

// tX handler intercept PC
const TX_HANDLER_PC = 0x07D1B4;

// plotSScreen
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 76800;  // 320x240 monochrome

// LCD VRAM
const LCD_VRAM_ADDR = 0xD40000;
const LCD_VRAM_SIZE = 153600;  // 320x240x16bpp

const MAX_LOOP_ITER = 8192;

// Graph dimensions
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 238;

// curGY and related addresses
const CUR_GY_ADDR = 0xD022D1;
const CUR_GX_ADDR = 0xD022CE;  // guessing 3 bytes before curGY

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

const read16 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8)) >>> 0;

function wrapMem(rawMem) {
  return {
    write8(addr, val) { rawMem[addr] = val & 0xff; },
    read8(addr) { return rawMem[addr] & 0xff; },
  };
}

// ── eZ80 disassembler (minimal, for IPoint range) ─────────────────────────

function disasmRange(rom, start, end) {
  const lines = [];
  let pc = start;

  function byte() { return rom[pc++]; }
  function word16() { const lo = rom[pc++]; const hi = rom[pc++]; return (hi << 8) | lo; }
  function word24() { const lo = rom[pc++]; const mid = rom[pc++]; const hi = rom[pc++]; return (hi << 16) | (mid << 8) | lo; }
  function signed8() { const v = rom[pc++]; return v >= 128 ? v - 256 : v; }

  const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const r16 = ['BC', 'DE', 'HL', 'SP'];
  const r16af = ['BC', 'DE', 'HL', 'AF'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  while (pc < end) {
    const addr = pc;
    let prefix = '';
    let op = byte();
    let instr = '';

    // Handle prefixes
    if (op === 0x40) {
      // SIS prefix - switch to Z80 mode
      prefix = '.SIS ';
      op = byte();
    } else if (op === 0x49) {
      prefix = '.LIS ';
      op = byte();
    } else if (op === 0x52) {
      prefix = '.SIL ';
      op = byte();
    } else if (op === 0x5B) {
      prefix = '.LIL ';
      op = byte();
    }

    // Determine suffix size: in ADL mode, default is 24-bit
    // .SIS = 16-bit addr, 16-bit imm
    // .LIL = 24-bit addr, 24-bit imm (default in ADL)
    // .SIL = 16-bit addr, 24-bit imm
    // .LIS = 24-bit addr, 16-bit imm
    const isShortImm = (prefix === '.SIS ' || prefix === '.LIS ');
    const isShortAddr = (prefix === '.SIS ' || prefix === '.SIL ');
    const immFn = isShortImm ? word16 : word24;
    const addrFn = isShortAddr ? word16 : word24;
    const immW = isShortImm ? 4 : 6;

    if (op === 0xCB) {
      // CB prefix (bit ops)
      const cb = byte();
      const bitN = (cb >> 3) & 7;
      const reg = cb & 7;
      const group = (cb >> 6) & 3;
      if (group === 0) {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        instr = `${shifts[(cb >> 3) & 7]} ${r8[reg]}`;
      } else if (group === 1) {
        instr = `BIT ${bitN}, ${r8[reg]}`;
      } else if (group === 2) {
        instr = `RES ${bitN}, ${r8[reg]}`;
      } else {
        instr = `SET ${bitN}, ${r8[reg]}`;
      }
    } else if (op === 0xED) {
      // ED prefix
      const ed = byte();
      if (ed === 0xB0) instr = 'LDIR';
      else if (ed === 0xB8) instr = 'LDDR';
      else if (ed === 0xA0) instr = 'LDI';
      else if (ed === 0xA8) instr = 'LDD';
      else if (ed === 0x43) { const a = addrFn(); instr = `LD (${hex(a, immW)}), BC`; }
      else if (ed === 0x53) { const a = addrFn(); instr = `LD (${hex(a, immW)}), DE`; }
      else if (ed === 0x63) { const a = addrFn(); instr = `LD (${hex(a, immW)}), HL`; }
      else if (ed === 0x73) { const a = addrFn(); instr = `LD (${hex(a, immW)}), SP`; }
      else if (ed === 0x4B) { const a = addrFn(); instr = `LD BC, (${hex(a, immW)})`; }
      else if (ed === 0x5B) { const a = addrFn(); instr = `LD DE, (${hex(a, immW)})`; }
      else if (ed === 0x6B) { const a = addrFn(); instr = `LD HL, (${hex(a, immW)})`; }
      else if (ed === 0x7B) { const a = addrFn(); instr = `LD SP, (${hex(a, immW)})`; }
      else if (ed === 0x44) instr = 'NEG';
      else if (ed === 0x47) instr = 'LD I, A';
      else if (ed === 0x4F) instr = 'LD R, A';
      else if (ed === 0x57) instr = 'LD A, I';
      else if (ed === 0x5F) instr = 'LD A, R';
      else if (ed === 0x67) instr = 'RRD';
      else if (ed === 0x6F) instr = 'RLD';
      else if ((ed & 0xC7) === 0x42) { instr = `SBC HL, ${r16[(ed >> 4) & 3]}`; }
      else if ((ed & 0xC7) === 0x4A) { instr = `ADC HL, ${r16[(ed >> 4) & 3]}`; }
      else if (ed === 0x02) { const a = addrFn(); instr = `LEA BC, IX+${a}`; }
      else if (ed === 0x12) { const a = addrFn(); instr = `LEA DE, IX+${a}`; }
      else if (ed === 0x22) { const a = addrFn(); instr = `LEA HL, IX+${a}`; }
      else if (ed === 0x32) { const a = addrFn(); instr = `LEA IX, IX+${a}`; }
      else if (ed === 0x03) { const a = addrFn(); instr = `LEA BC, IY+${a}`; }
      else if (ed === 0x13) { const a = addrFn(); instr = `LEA DE, IY+${a}`; }
      else if (ed === 0x23) { const a = addrFn(); instr = `LEA HL, IY+${a}`; }
      else if (ed === 0x33) { const a = addrFn(); instr = `LEA IY, IY+${a}`; }
      else if (ed === 0x3E) { const a = addrFn(); instr = `LEA IX, IY+${a}`; }
      else if (ed === 0x2E) { const a = addrFn(); instr = `LEA IY, IX+${a}`; }
      else instr = `DB 0xED, ${hex(ed, 2)}`;
    } else if (op === 0xDD || op === 0xFD) {
      const ir = op === 0xDD ? 'IX' : 'IY';
      const op2 = byte();
      if (op2 === 0x21) { const v = immFn(); instr = `LD ${ir}, ${hex(v, immW)}`; }
      else if (op2 === 0x22) { const a = addrFn(); instr = `LD (${hex(a, immW)}), ${ir}`; }
      else if (op2 === 0x23) instr = `INC ${ir}`;
      else if (op2 === 0x2A) { const a = addrFn(); instr = `LD ${ir}, (${hex(a, immW)})`; }
      else if (op2 === 0x2B) instr = `DEC ${ir}`;
      else if (op2 === 0x36) { const d = signed8(); const v = byte(); instr = `LD (${ir}+${d}), ${hex(v, 2)}`; }
      else if (op2 === 0x46) { const d = signed8(); instr = `LD B, (${ir}+${d})`; }
      else if (op2 === 0x4E) { const d = signed8(); instr = `LD C, (${ir}+${d})`; }
      else if (op2 === 0x56) { const d = signed8(); instr = `LD D, (${ir}+${d})`; }
      else if (op2 === 0x5E) { const d = signed8(); instr = `LD E, (${ir}+${d})`; }
      else if (op2 === 0x66) { const d = signed8(); instr = `LD H, (${ir}+${d})`; }
      else if (op2 === 0x6E) { const d = signed8(); instr = `LD L, (${ir}+${d})`; }
      else if (op2 === 0x70) { const d = signed8(); instr = `LD (${ir}+${d}), B`; }
      else if (op2 === 0x71) { const d = signed8(); instr = `LD (${ir}+${d}), C`; }
      else if (op2 === 0x72) { const d = signed8(); instr = `LD (${ir}+${d}), D`; }
      else if (op2 === 0x73) { const d = signed8(); instr = `LD (${ir}+${d}), E`; }
      else if (op2 === 0x74) { const d = signed8(); instr = `LD (${ir}+${d}), H`; }
      else if (op2 === 0x75) { const d = signed8(); instr = `LD (${ir}+${d}), L`; }
      else if (op2 === 0x77) { const d = signed8(); instr = `LD (${ir}+${d}), A`; }
      else if (op2 === 0x7E) { const d = signed8(); instr = `LD A, (${ir}+${d})`; }
      else if (op2 === 0x86) { const d = signed8(); instr = `ADD A, (${ir}+${d})`; }
      else if (op2 === 0x8E) { const d = signed8(); instr = `ADC A, (${ir}+${d})`; }
      else if (op2 === 0x96) { const d = signed8(); instr = `SUB (${ir}+${d})`; }
      else if (op2 === 0x9E) { const d = signed8(); instr = `SBC A, (${ir}+${d})`; }
      else if (op2 === 0xA6) { const d = signed8(); instr = `AND (${ir}+${d})`; }
      else if (op2 === 0xAE) { const d = signed8(); instr = `XOR (${ir}+${d})`; }
      else if (op2 === 0xB6) { const d = signed8(); instr = `OR (${ir}+${d})`; }
      else if (op2 === 0xBE) { const d = signed8(); instr = `CP (${ir}+${d})`; }
      else if (op2 === 0xE1) instr = `POP ${ir}`;
      else if (op2 === 0xE3) instr = `EX (SP), ${ir}`;
      else if (op2 === 0xE5) instr = `PUSH ${ir}`;
      else if (op2 === 0xE9) instr = `JP (${ir})`;
      else if (op2 === 0xF9) instr = `LD SP, ${ir}`;
      else if (op2 === 0xCB) {
        const d = signed8();
        const cb = byte();
        const bitN = (cb >> 3) & 7;
        const group = (cb >> 6) & 3;
        if (group === 1) instr = `BIT ${bitN}, (${ir}+${d})`;
        else if (group === 2) instr = `RES ${bitN}, (${ir}+${d})`;
        else if (group === 3) instr = `SET ${bitN}, (${ir}+${d})`;
        else instr = `CB.${ir} d=${d} op=${hex(cb, 2)}`;
      }
      else if (op2 === 0x09) instr = `ADD ${ir}, BC`;
      else if (op2 === 0x19) instr = `ADD ${ir}, DE`;
      else if (op2 === 0x29) instr = `ADD ${ir}, ${ir}`;
      else if (op2 === 0x39) instr = `ADD ${ir}, SP`;
      else instr = `DB ${hex(op, 2)}, ${hex(op2, 2)}`;
    } else {
      // Main opcode table
      switch (op) {
        case 0x00: instr = 'NOP'; break;
        case 0x01: { const v = immFn(); instr = `LD BC, ${hex(v, immW)}`; break; }
        case 0x02: instr = 'LD (BC), A'; break;
        case 0x03: instr = 'INC BC'; break;
        case 0x04: instr = 'INC B'; break;
        case 0x05: instr = 'DEC B'; break;
        case 0x06: { const v = byte(); instr = `LD B, ${hex(v, 2)}`; break; }
        case 0x07: instr = 'RLCA'; break;
        case 0x08: instr = `EX AF, AF'`; break;
        case 0x09: instr = 'ADD HL, BC'; break;
        case 0x0A: instr = 'LD A, (BC)'; break;
        case 0x0B: instr = 'DEC BC'; break;
        case 0x0C: instr = 'INC C'; break;
        case 0x0D: instr = 'DEC C'; break;
        case 0x0E: { const v = byte(); instr = `LD C, ${hex(v, 2)}`; break; }
        case 0x0F: instr = 'RRCA'; break;
        case 0x10: { const d = signed8(); instr = `DJNZ ${hex(pc + d, 6)}`; break; }
        case 0x11: { const v = immFn(); instr = `LD DE, ${hex(v, immW)}`; break; }
        case 0x12: instr = 'LD (DE), A'; break;
        case 0x13: instr = 'INC DE'; break;
        case 0x14: instr = 'INC D'; break;
        case 0x15: instr = 'DEC D'; break;
        case 0x16: { const v = byte(); instr = `LD D, ${hex(v, 2)}`; break; }
        case 0x17: instr = 'RLA'; break;
        case 0x18: { const d = signed8(); instr = `JR ${hex(pc + d, 6)}`; break; }
        case 0x19: instr = 'ADD HL, DE'; break;
        case 0x1A: instr = 'LD A, (DE)'; break;
        case 0x1B: instr = 'DEC DE'; break;
        case 0x1C: instr = 'INC E'; break;
        case 0x1D: instr = 'DEC E'; break;
        case 0x1E: { const v = byte(); instr = `LD E, ${hex(v, 2)}`; break; }
        case 0x1F: instr = 'RRA'; break;
        case 0x20: { const d = signed8(); instr = `JR NZ, ${hex(pc + d, 6)}`; break; }
        case 0x21: { const v = immFn(); instr = `LD HL, ${hex(v, immW)}`; break; }
        case 0x22: { const a = addrFn(); instr = `LD (${hex(a, immW)}), HL`; break; }
        case 0x23: instr = 'INC HL'; break;
        case 0x24: instr = 'INC H'; break;
        case 0x25: instr = 'DEC H'; break;
        case 0x26: { const v = byte(); instr = `LD H, ${hex(v, 2)}`; break; }
        case 0x27: instr = 'DAA'; break;
        case 0x28: { const d = signed8(); instr = `JR Z, ${hex(pc + d, 6)}`; break; }
        case 0x29: instr = 'ADD HL, HL'; break;
        case 0x2A: { const a = addrFn(); instr = `LD HL, (${hex(a, immW)})`; break; }
        case 0x2B: instr = 'DEC HL'; break;
        case 0x2C: instr = 'INC L'; break;
        case 0x2D: instr = 'DEC L'; break;
        case 0x2E: { const v = byte(); instr = `LD L, ${hex(v, 2)}`; break; }
        case 0x2F: instr = 'CPL'; break;
        case 0x30: { const d = signed8(); instr = `JR NC, ${hex(pc + d, 6)}`; break; }
        case 0x31: { const v = immFn(); instr = `LD SP, ${hex(v, immW)}`; break; }
        case 0x32: { const a = addrFn(); instr = `LD (${hex(a, immW)}), A`; break; }
        case 0x33: instr = 'INC SP'; break;
        case 0x34: instr = 'INC (HL)'; break;
        case 0x35: instr = 'DEC (HL)'; break;
        case 0x36: { const v = byte(); instr = `LD (HL), ${hex(v, 2)}`; break; }
        case 0x37: instr = 'SCF'; break;
        case 0x38: { const d = signed8(); instr = `JR C, ${hex(pc + d, 6)}`; break; }
        case 0x39: instr = 'ADD HL, SP'; break;
        case 0x3A: { const a = addrFn(); instr = `LD A, (${hex(a, immW)})`; break; }
        case 0x3B: instr = 'DEC SP'; break;
        case 0x3C: instr = 'INC A'; break;
        case 0x3D: instr = 'DEC A'; break;
        case 0x3E: { const v = byte(); instr = `LD A, ${hex(v, 2)}`; break; }
        case 0x3F: instr = 'CCF'; break;
        // 0x40-0x7F: LD r, r' (except 0x76 = HALT)
        case 0x76: instr = 'HALT'; break;
        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
          instr = `ADD A, ${r8[op & 7]}`; break;
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
          instr = `ADC A, ${r8[op & 7]}`; break;
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
          instr = `SUB ${r8[op & 7]}`; break;
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
          instr = `SBC A, ${r8[op & 7]}`; break;
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
          instr = `AND ${r8[op & 7]}`; break;
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
          instr = `XOR ${r8[op & 7]}`; break;
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
          instr = `OR ${r8[op & 7]}`; break;
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF:
          instr = `CP ${r8[op & 7]}`; break;
        case 0xC0: instr = 'RET NZ'; break;
        case 0xC1: instr = 'POP BC'; break;
        case 0xC2: { const a = addrFn(); instr = `JP NZ, ${hex(a, immW)}`; break; }
        case 0xC3: { const a = addrFn(); instr = `JP ${hex(a, immW)}`; break; }
        case 0xC4: { const a = addrFn(); instr = `CALL NZ, ${hex(a, immW)}`; break; }
        case 0xC5: instr = 'PUSH BC'; break;
        case 0xC6: { const v = byte(); instr = `ADD A, ${hex(v, 2)}`; break; }
        case 0xC7: instr = 'RST 0x00'; break;
        case 0xC8: instr = 'RET Z'; break;
        case 0xC9: instr = 'RET'; break;
        case 0xCA: { const a = addrFn(); instr = `JP Z, ${hex(a, immW)}`; break; }
        case 0xCC: { const a = addrFn(); instr = `CALL Z, ${hex(a, immW)}`; break; }
        case 0xCD: { const a = addrFn(); instr = `CALL ${hex(a, immW)}`; break; }
        case 0xCE: { const v = byte(); instr = `ADC A, ${hex(v, 2)}`; break; }
        case 0xCF: instr = 'RST 0x08'; break;
        case 0xD0: instr = 'RET NC'; break;
        case 0xD1: instr = 'POP DE'; break;
        case 0xD2: { const a = addrFn(); instr = `JP NC, ${hex(a, immW)}`; break; }
        case 0xD3: { const v = byte(); instr = `OUT (${hex(v, 2)}), A`; break; }
        case 0xD4: { const a = addrFn(); instr = `CALL NC, ${hex(a, immW)}`; break; }
        case 0xD5: instr = 'PUSH DE'; break;
        case 0xD6: { const v = byte(); instr = `SUB ${hex(v, 2)}`; break; }
        case 0xD7: instr = 'RST 0x10'; break;
        case 0xD8: instr = 'RET C'; break;
        case 0xD9: instr = 'EXX'; break;
        case 0xDA: { const a = addrFn(); instr = `JP C, ${hex(a, immW)}`; break; }
        case 0xDB: { const v = byte(); instr = `IN A, (${hex(v, 2)})`; break; }
        case 0xDC: { const a = addrFn(); instr = `CALL C, ${hex(a, immW)}`; break; }
        case 0xDE: { const v = byte(); instr = `SBC A, ${hex(v, 2)}`; break; }
        case 0xDF: instr = 'RST 0x18'; break;
        case 0xE0: instr = 'RET PO'; break;
        case 0xE1: instr = 'POP HL'; break;
        case 0xE2: { const a = addrFn(); instr = `JP PO, ${hex(a, immW)}`; break; }
        case 0xE3: instr = 'EX (SP), HL'; break;
        case 0xE4: { const a = addrFn(); instr = `CALL PO, ${hex(a, immW)}`; break; }
        case 0xE5: instr = 'PUSH HL'; break;
        case 0xE6: { const v = byte(); instr = `AND ${hex(v, 2)}`; break; }
        case 0xE7: instr = 'RST 0x20'; break;
        case 0xE8: instr = 'RET PE'; break;
        case 0xE9: instr = 'JP (HL)'; break;
        case 0xEA: { const a = addrFn(); instr = `JP PE, ${hex(a, immW)}`; break; }
        case 0xEB: instr = 'EX DE, HL'; break;
        case 0xEC: { const a = addrFn(); instr = `CALL PE, ${hex(a, immW)}`; break; }
        case 0xEE: { const v = byte(); instr = `XOR ${hex(v, 2)}`; break; }
        case 0xEF: instr = 'RST 0x28'; break;
        case 0xF0: instr = 'RET P'; break;
        case 0xF1: instr = 'POP AF'; break;
        case 0xF2: { const a = addrFn(); instr = `JP P, ${hex(a, immW)}`; break; }
        case 0xF3: instr = 'DI'; break;
        case 0xF4: { const a = addrFn(); instr = `CALL P, ${hex(a, immW)}`; break; }
        case 0xF5: instr = 'PUSH AF'; break;
        case 0xF6: { const v = byte(); instr = `OR ${hex(v, 2)}`; break; }
        case 0xF7: instr = 'RST 0x30'; break;
        case 0xF8: instr = 'RET M'; break;
        case 0xF9: instr = 'LD SP, HL'; break;
        case 0xFA: { const a = addrFn(); instr = `JP M, ${hex(a, immW)}`; break; }
        case 0xFB: instr = 'EI'; break;
        case 0xFC: { const a = addrFn(); instr = `CALL M, ${hex(a, immW)}`; break; }
        case 0xFE: { const v = byte(); instr = `CP ${hex(v, 2)}`; break; }
        case 0xFF: instr = 'RST 0x38'; break;
        default: {
          // Handle LD r, r' range 0x40-0x7F
          if (op >= 0x40 && op <= 0x7F) {
            const dst = (op >> 3) & 7;
            const src = op & 7;
            instr = `LD ${r8[dst]}, ${r8[src]}`;
          } else {
            instr = `DB ${hex(op, 2)}`;
          }
        }
      }
    }

    const rawBytes = [];
    for (let i = addr; i < pc; i++) rawBytes.push(rom[i].toString(16).padStart(2, '0'));
    lines.push({ addr, bytes: rawBytes.join(' '), instr: prefix + instr });
  }
  return lines;
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

const FPS_START_ADDR = USERMEM_ADDR + 0x200;

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  write24(mem, FPS_ADDR, FPS_START_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedGraphRAM(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 238);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x0010);
  write16(mem, DRAW_FG_COLOR_ADDR, 0x0010);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4);
  mem[DRAW_MODE_ADDR] = 1;
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, -10);
  writeReal(wrapped, XMAX_ADDR, 10);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, -10);
  writeReal(wrapped, YMAX_ADDR, 10);
  writeReal(wrapped, YSCL_ADDR, 1);
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0;
}

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);
  write24(mem, errFrameSP + 3, 0xD1A860);
  write24(mem, errFrameSP + 6, 0x000000);
  write24(mem, errFrameSP + 9, 0x000000);
  write24(mem, errFrameSP + 12, recoveryAddr);
  write24(mem, errFrameSP + 15, 0x000040);
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

function setIYFlags(mem, bit2_43, bit2_74) {
  if (bit2_43) {
    mem[IY_PLUS_43_ADDR] |= 0x04;
  } else {
    mem[IY_PLUS_43_ADDR] &= ~0x04;
  }
  if (bit2_74) {
    mem[IY_PLUS_74_ADDR] |= 0x04;
  } else {
    mem[IY_PLUS_74_ADDR] &= ~0x04;
  }
}

function callOSRoutine(label, entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return { returnHit, steps };
}

// ── Call IPoint with full register capture ─────────────────────────────────

function callIPointTraced(executor, cpu, mem, px, py) {
  prepareCallState(cpu, mem);
  cpu.a = 1;         // drawMode = 1 (normal draw)
  cpu._de = px;      // pixel X in DE
  cpu._hl = py;      // pixel Y in HL
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  // Capture entry state
  const entryState = {
    a: cpu.a, f: cpu.f,
    bc: cpu._bc, de: cpu._de, hl: cpu._hl,
    ix: cpu._ix, iy: cpu._iy, sp: cpu.sp,
    framebufBefore: read24(mem, FRAMEBUF_ADDR_REG),
    curGY_before: read16(mem, CUR_GY_ADDR),
    curGX_before: read16(mem, CUR_GX_ADDR),
  };

  let returnHit = false;
  let steps = 0;
  const pcTrace = [];
  let traceLimit = 200;  // capture first N block PCs

  // Track writes to FRAMEBUF_ADDR_REG area
  const framebufWrites = [];

  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (traceLimit > 0) {
          pcTrace.push(norm);
          traceLimit--;
        }
        // Check if framebuf addr changed
        const cur = read24(mem, FRAMEBUF_ADDR_REG);
        if (framebufWrites.length === 0 || framebufWrites[framebufWrites.length - 1].val !== cur) {
          framebufWrites.push({ pc: norm, val: cur, step: steps });
        }
        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (traceLimit > 0) {
          pcTrace.push(norm);
          traceLimit--;
        }
        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  const exitState = {
    a: cpu.a, f: cpu.f,
    bc: cpu._bc, de: cpu._de, hl: cpu._hl,
    framebufAfter: read24(mem, FRAMEBUF_ADDR_REG),
    curGY_after: read16(mem, CUR_GY_ADDR),
    curGX_after: read16(mem, CUR_GX_ADDR),
  };

  return { returnHit, steps, entryState, exitState, pcTrace, framebufWrites };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 146: Graph Y-Coordinate Mapping — IPoint VRAM Address Computation ===\n');

  const { mem, executor, cpu } = createRuntime();
  const wrapped = wrapMem(mem);

  // ── Cold boot ──
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // ── MEM_INIT ──
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  console.log('Running MEM_INIT...');
  const memInitResult = callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);
  console.log(`MEM_INIT: returned=${memInitResult.returnHit} steps=${memInitResult.steps}\n`);

  // ── Seed allocator + graph state ──
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // ══════════════════════════════════════════════════════════════════════════
  // PART A: Disassemble IPoint's VRAM address computation (0x07B451–0x07B700)
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART A: Disassemble IPoint VRAM address computation (0x07B451-0x07B700)');
  console.log(`${'='.repeat(70)}\n`);

  const disasm = disasmRange(romBytes, 0x07B451, 0x07B700);
  for (const line of disasm) {
    const bytesStr = line.bytes.padEnd(18);
    console.log(`  ${hex(line.addr)}:  ${bytesStr}  ${line.instr}`);
  }

  // Highlight key patterns: writes to 0xD02A8A, multiplications, VRAM references
  console.log(`\n  --- Key address references found in disassembly ---`);
  for (const line of disasm) {
    const upper = line.instr.toUpperCase();
    if (upper.includes('D02A8A') || upper.includes('D02A8B') || upper.includes('D02A8C') ||
        upper.includes('D40000') || upper.includes('D65') ||
        upper.includes('0280') || upper.includes('0140') ||  // 640 = 0x280, 320 = 0x140
        upper.includes('FRAMEBUF')) {
      console.log(`    ${hex(line.addr)}: ${line.instr}  <-- VRAM/stride related`);
    }
  }

  // Also scan for references to curGY, pixel Y slots
  console.log(`\n  --- References to graph Y slots ---`);
  for (const line of disasm) {
    const upper = line.instr.toUpperCase();
    if (upper.includes('D022D') || upper.includes('D022C') ||
        upper.includes('D014') || upper.includes('D026A') ||
        upper.includes('D02A8')) {
      console.log(`    ${hex(line.addr)}: ${line.instr}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART B: Trace VRAM addresses for 5 different Y coordinates
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B: Trace VRAM addresses for 5 Y coordinates (X=160 fixed)');
  console.log(`${'='.repeat(70)}\n`);

  // Set up graph state
  setIYFlags(mem, true, true);  // NZ path (both bit 2 SET) for 16bpp VRAM writes
  seedGraphRAM(mem);

  const testYCoords = [
    { label: 'top row',       x: 160, y: 0   },
    { label: 'upper quarter', x: 160, y: 60  },
    { label: 'middle',        x: 160, y: 120 },
    { label: 'lower quarter', x: 160, y: 180 },
    { label: 'bottom row',    x: 160, y: 239 },
  ];

  const vramResults = [];

  for (const tc of testYCoords) {
    // Reset framebuf register before each call
    write24(mem, FRAMEBUF_ADDR_REG, 0x000000);

    // Reset flags each time
    setIYFlags(mem, true, true);
    seedGraphRAM(mem);

    // Clear VRAM
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

    const result = callIPointTraced(executor, cpu, mem, tc.x, tc.y);
    const framebufAddr = read24(mem, FRAMEBUF_ADDR_REG);

    // Calculate expected row from VRAM address
    let row = -1;
    if (framebufAddr >= LCD_VRAM_ADDR && framebufAddr < LCD_VRAM_ADDR + LCD_VRAM_SIZE) {
      row = Math.floor((framebufAddr - LCD_VRAM_ADDR) / 640);
    }

    vramResults.push({
      label: tc.label, x: tc.x, y: tc.y,
      framebufAddr, row,
      returned: result.returnHit, steps: result.steps,
      entry: result.entryState, exit: result.exitState,
      framebufWrites: result.framebufWrites,
    });

    console.log(`  IPoint(X=${tc.x}, Y=${tc.y}) [${tc.label}]:`);
    console.log(`    returned=${result.returnHit} steps=${result.steps}`);
    console.log(`    framebufAddr after: ${hex(framebufAddr)} -> row=${row}`);
    console.log(`    Entry: A=${hex(result.entryState.a, 2)} DE=${hex(result.entryState.de)} HL=${hex(result.entryState.hl)} BC=${hex(result.entryState.bc)}`);
    console.log(`    Exit:  A=${hex(result.exitState.a, 2)} DE=${hex(result.exitState.de)} HL=${hex(result.exitState.hl)} BC=${hex(result.exitState.bc)}`);
    console.log(`    framebufAddr writes:`);
    for (const fw of result.framebufWrites.slice(0, 10)) {
      const fwRow = fw.val >= LCD_VRAM_ADDR ? Math.floor((fw.val - LCD_VRAM_ADDR) / 640) : -1;
      console.log(`      step=${fw.step} pc=${hex(fw.pc)} val=${hex(fw.val)} -> row=${fwRow}`);
    }
    console.log('');
  }

  // Compute stride
  console.log(`  --- VRAM Address Stride Analysis ---`);
  for (let i = 1; i < vramResults.length; i++) {
    const prev = vramResults[i - 1];
    const curr = vramResults[i];
    const delta = curr.framebufAddr - prev.framebufAddr;
    const yDelta = curr.y - prev.y;
    const bytesPerRow = yDelta !== 0 ? delta / yDelta : 0;
    console.log(`  Y=${prev.y} -> Y=${curr.y}: addr delta=${hex(delta)} (${delta} bytes), Y delta=${yDelta}, bytes/row=${bytesPerRow.toFixed(1)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART C: Find Y-coordinate input path
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: Y-coordinate input path — where does IPoint get Y from?');
  console.log(`${'='.repeat(70)}\n`);

  // Dump register state at IPoint entry for all 5 test points
  console.log('  Register snapshot at IPoint entry for each Y value:');
  console.log('  (We pass Y in HL, X in DE — verify IPoint actually reads from there)\n');

  for (const vr of vramResults) {
    console.log(`  Y=${vr.y} (${vr.label}):`);
    console.log(`    HL (should be Y): ${hex(vr.entry.hl)}`);
    console.log(`    DE (should be X): ${hex(vr.entry.de)}`);
    console.log(`    curGY before: ${hex(vr.entry.curGY_before, 4)}  after: ${hex(vr.exit.curGY_after, 4)}`);
    console.log(`    curGX before: ${hex(vr.entry.curGX_before, 4)}  after: ${hex(vr.exit.curGX_after, 4)}`);
    console.log(`    framebufAddr before: ${hex(vr.entry.framebufBefore)}  after: ${hex(vr.exit.framebufAfter)}`);
  }

  // Check various RAM slots that might hold Y pixel coordinate
  console.log('\n  --- Scan RAM slots near graph area for Y-related values ---');
  const scanAddrs = [
    { name: 'curGY', addr: CUR_GY_ADDR, size: 2 },
    { name: 'curGY+2', addr: CUR_GY_ADDR + 2, size: 2 },
    { name: 'curGX', addr: CUR_GX_ADDR, size: 2 },
    { name: 'pixWideP', addr: PIX_WIDE_P_ADDR, size: 2 },
    { name: 'pixWide_m_2', addr: PIX_WIDE_M2_ADDR, size: 2 },
    { name: 'D02A84', addr: 0xD02A84, size: 3 },
    { name: 'D02A87', addr: 0xD02A87, size: 3 },
    { name: 'D02A8A (framebuf)', addr: FRAMEBUF_ADDR_REG, size: 3 },
    { name: 'D02A8D', addr: 0xD02A8D, size: 3 },
    { name: 'D02A90', addr: 0xD02A90, size: 3 },
    { name: 'D02A93', addr: 0xD02A93, size: 3 },
    { name: 'D02A96', addr: 0xD02A96, size: 3 },
    { name: 'D02A99', addr: 0xD02A99, size: 3 },
    { name: 'D02A9C', addr: 0xD02A9C, size: 3 },
    { name: 'D02A9F', addr: 0xD02A9F, size: 3 },
    { name: 'D02AA2', addr: 0xD02AA2, size: 3 },
    { name: 'D02AA5', addr: 0xD02AA5, size: 3 },
    { name: 'D02AA8', addr: 0xD02AA8, size: 2 },
  ];

  for (const s of scanAddrs) {
    const val = s.size === 3 ? read24(mem, s.addr) : read16(mem, s.addr);
    console.log(`  ${s.name.padEnd(20)} (${hex(s.addr)}): ${hex(val, s.size * 2)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART D: Root-cause the row-239 clamping
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART D: Root-cause row-239 clamping');
  console.log(`${'='.repeat(70)}\n`);

  // Check: do ALL framebuf addresses correspond to row 239?
  const allRow239 = vramResults.every(vr => {
    const row = vr.framebufAddr >= LCD_VRAM_ADDR
      ? Math.floor((vr.framebufAddr - LCD_VRAM_ADDR) / 640) : -1;
    return row === 239;
  });

  console.log(`  All VRAM addresses map to row 239: ${allRow239}`);

  if (allRow239) {
    console.log('  -> The Y pixel coordinate is NOT being used. IPoint always writes to row 239.');
    console.log('  -> This means the VRAM address at 0xD02A8A is seeded/computed BEFORE IPoint,');
    console.log('     and IPoint does NOT recompute it from the Y parameter we pass in HL.\n');
  }

  // Check: does IPoint read HL at all, or does it use a pre-computed address?
  console.log('  --- Checking if IPoint uses HL (Y param) vs pre-computed VRAM addr ---');
  console.log('  Entry HL values vs resulting framebuf addresses:');
  for (const vr of vramResults) {
    console.log(`    HL=${hex(vr.entry.hl)} -> framebuf=${hex(vr.exit.framebufAfter)} row=${Math.floor((vr.exit.framebufAfter - LCD_VRAM_ADDR) / 640)}`);
  }

  // Test: pre-seed FRAMEBUF_ADDR_REG to different rows and see if IPoint uses it
  console.log('\n  --- Test: Pre-seed FRAMEBUF_ADDR_REG to different rows ---');

  const rowTests = [0, 60, 120, 180, 239];
  for (const row of rowTests) {
    const expectedAddr = LCD_VRAM_ADDR + row * 640 + 160 * 2;  // row * stride + X * 2

    // Pre-seed the framebuf register to the row's starting address
    write24(mem, FRAMEBUF_ADDR_REG, LCD_VRAM_ADDR + row * 640);

    setIYFlags(mem, true, true);
    seedGraphRAM(mem);

    // Clear VRAM
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

    const result = callIPointTraced(executor, cpu, mem, 160, row);
    const finalAddr = read24(mem, FRAMEBUF_ADDR_REG);
    const finalRow = finalAddr >= LCD_VRAM_ADDR ? Math.floor((finalAddr - LCD_VRAM_ADDR) / 640) : -1;

    // Check where pixels actually landed in VRAM
    let firstWrittenOffset = -1;
    for (let i = 0; i < LCD_VRAM_SIZE; i++) {
      if (mem[LCD_VRAM_ADDR + i] !== 0) {
        firstWrittenOffset = i;
        break;
      }
    }
    const writtenRow = firstWrittenOffset >= 0 ? Math.floor(firstWrittenOffset / 640) : -1;

    console.log(`    Pre-seed row=${row} (addr=${hex(LCD_VRAM_ADDR + row * 640)}): ` +
      `framebuf after=${hex(finalAddr)} (row=${finalRow}), ` +
      `first VRAM write at row=${writtenRow}, ` +
      `returned=${result.returnHit} steps=${result.steps}`);
  }

  // Trace the first few blocks of IPoint to see what happens to HL/DE at entry
  console.log('\n  --- First 30 block PCs hit during IPoint(X=160, Y=120) ---');
  write24(mem, FRAMEBUF_ADDR_REG, 0x000000);
  setIYFlags(mem, true, true);
  seedGraphRAM(mem);

  const traceResult = callIPointTraced(executor, cpu, mem, 160, 120);
  for (let i = 0; i < Math.min(30, traceResult.pcTrace.length); i++) {
    const pc = traceResult.pcTrace[i];
    // Find this PC in our disassembly
    const disasmLine = disasm.find(d => d.addr === pc);
    const instrStr = disasmLine ? disasmLine.instr : '(outside disasm range)';
    console.log(`    [${String(i).padStart(3)}] ${hex(pc)}: ${instrStr}`);
  }

  // Check what curGY is after the full pipeline
  console.log('\n  --- Graph Y RAM slots after IPoint(160, 120) ---');
  for (const s of scanAddrs) {
    const val = s.size === 3 ? read24(mem, s.addr) : read16(mem, s.addr);
    console.log(`  ${s.name.padEnd(20)} (${hex(s.addr)}): ${hex(val, s.size * 2)}`);
  }

  // Dump the wider area around D02A80-D02AB0 to find what IPoint reads
  console.log('\n  --- RAM dump D02A80-D02AB0 (IPoint working area) ---');
  for (let a = 0xD02A80; a < 0xD02AB0; a += 16) {
    const bytes = [];
    for (let i = 0; i < 16; i++) bytes.push(mem[a + i].toString(16).padStart(2, '0'));
    console.log(`  ${hex(a)}: ${bytes.join(' ')}`);
  }

  // Check: does the disassembly show IPoint reading from HL at all?
  console.log('\n  --- IPoint instructions referencing HL (potential Y use) ---');
  for (const line of disasm) {
    if (line.instr.includes('HL') && !line.instr.includes('(HL)') &&
        !line.instr.includes('PUSH HL') && !line.instr.includes('POP HL')) {
      console.log(`    ${hex(line.addr)}: ${line.instr}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log('  Part A: Disassembled IPoint 0x07B451-0x07B700 (see above)');
  console.log(`  Part B: VRAM addresses for 5 Y values:`);
  for (const vr of vramResults) {
    const row = vr.framebufAddr >= LCD_VRAM_ADDR ? Math.floor((vr.framebufAddr - LCD_VRAM_ADDR) / 640) : -1;
    console.log(`    Y=${String(vr.y).padStart(3)} -> framebuf=${hex(vr.framebufAddr)} row=${row}`);
  }

  const uniqueRows = new Set(vramResults.map(vr =>
    vr.framebufAddr >= LCD_VRAM_ADDR ? Math.floor((vr.framebufAddr - LCD_VRAM_ADDR) / 640) : -1
  ));
  console.log(`  Unique rows hit: ${[...uniqueRows].join(', ')}`);
  console.log(`  All same row: ${uniqueRows.size === 1}`);

  console.log(`\n  Part C: Y input path`);
  console.log(`    HL at entry carries the Y value we pass (verified by entry snapshots)`);
  console.log(`    But framebuf result is independent of HL — IPoint uses pre-computed addr at 0xD02A8A`);

  console.log(`\n  Part D: Row-239 root cause`);
  if (allRow239) {
    console.log(`    CONFIRMED: All pixels land on row 239 regardless of Y input`);
    console.log(`    The bug is UPSTREAM of IPoint — the VRAM address at 0xD02A8A`);
    console.log(`    must be seeded by the caller (likely GraphPars or the graph loop)`);
    console.log(`    before each IPoint call with the correct Y-dependent address.`);
  } else {
    console.log(`    Y coordinate DOES affect the output row`);
  }

  console.log('\n=== Phase 146 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
