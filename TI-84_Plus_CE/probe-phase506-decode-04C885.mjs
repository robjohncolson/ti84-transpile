#!/usr/bin/env node
/**
 * Phase 506 — Static disassembly of 0x04C885 (record dispatch function)
 * and 0x04C979 (bounds checker called from 0x097955).
 *
 * 0x0846EA (record table scanner) calls 0x04C885 with B, D, E loaded
 * from a matching record after finding key [0x5E, cursor_type, 0x00].
 * This probe statically disassembles both functions to understand the
 * dispatch logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0').toUpperCase();
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

function read24(offset) {
  return romBytes[offset] | (romBytes[offset + 1] << 8) | (romBytes[offset + 2] << 16);
}

function read16(offset) {
  return romBytes[offset] | (romBytes[offset + 1] << 8);
}

/**
 * Simple eZ80 ADL-mode disassembler for static ROM analysis.
 */
function disassemble(startAddr, length) {
  const end = startAddr + length;
  let pc = startAddr;
  const lines = [];

  while (pc < end) {
    const instrStart = pc;
    const op = romBytes[pc];
    let mnemonic = '';
    let rawBytes = [op];

    switch (op) {
      case 0x00: pc++; mnemonic = 'NOP'; break;
      case 0x01: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD BC,${hex(nn)}`; break; }
      case 0x02: pc++; mnemonic = 'LD (BC),A'; break;
      case 0x03: pc++; mnemonic = 'INC BC'; break;
      case 0x04: pc++; mnemonic = 'INC B'; break;
      case 0x05: pc++; mnemonic = 'DEC B'; break;
      case 0x06: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD B,${hex(romBytes[pc-1], 2)}`; break;
      case 0x07: pc++; mnemonic = 'RLCA'; break;
      case 0x08: pc++; mnemonic = "EX AF,AF'"; break;
      case 0x09: pc++; mnemonic = 'ADD HL,BC'; break;
      case 0x0A: pc++; mnemonic = 'LD A,(BC)'; break;
      case 0x0B: pc++; mnemonic = 'DEC BC'; break;
      case 0x0C: pc++; mnemonic = 'INC C'; break;
      case 0x0D: pc++; mnemonic = 'DEC C'; break;
      case 0x0E: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD C,${hex(romBytes[pc-1], 2)}`; break;
      case 0x0F: pc++; mnemonic = 'RRCA'; break;
      case 0x10: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `DJNZ ${hex(pc + off)}`; break; }
      case 0x11: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD DE,${hex(nn)}`; break; }
      case 0x12: pc++; mnemonic = 'LD (DE),A'; break;
      case 0x13: pc++; mnemonic = 'INC DE'; break;
      case 0x14: pc++; mnemonic = 'INC D'; break;
      case 0x15: pc++; mnemonic = 'DEC D'; break;
      case 0x16: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD D,${hex(romBytes[pc-1], 2)}`; break;
      case 0x17: pc++; mnemonic = 'RLA'; break;
      case 0x18: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `JR ${hex(pc + off)}`; break; }
      case 0x19: pc++; mnemonic = 'ADD HL,DE'; break;
      case 0x1A: pc++; mnemonic = 'LD A,(DE)'; break;
      case 0x1B: pc++; mnemonic = 'DEC DE'; break;
      case 0x1C: pc++; mnemonic = 'INC E'; break;
      case 0x1D: pc++; mnemonic = 'DEC E'; break;
      case 0x1E: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD E,${hex(romBytes[pc-1], 2)}`; break;
      case 0x1F: pc++; mnemonic = 'RRA'; break;
      case 0x20: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `JR NZ,${hex(pc + off)}`; break; }
      case 0x21: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD HL,${hex(nn)}`; break; }
      case 0x22: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD (${hex(nn)}),HL`; break; }
      case 0x23: pc++; mnemonic = 'INC HL'; break;
      case 0x24: pc++; mnemonic = 'INC H'; break;
      case 0x25: pc++; mnemonic = 'DEC H'; break;
      case 0x26: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD H,${hex(romBytes[pc-1], 2)}`; break;
      case 0x27: pc++; mnemonic = 'DAA'; break;
      case 0x28: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `JR Z,${hex(pc + off)}`; break; }
      case 0x29: pc++; mnemonic = 'ADD HL,HL'; break;
      case 0x2A: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD HL,(${hex(nn)})`; break; }
      case 0x2B: pc++; mnemonic = 'DEC HL'; break;
      case 0x2C: pc++; mnemonic = 'INC L'; break;
      case 0x2D: pc++; mnemonic = 'DEC L'; break;
      case 0x2E: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD L,${hex(romBytes[pc-1], 2)}`; break;
      case 0x2F: pc++; mnemonic = 'CPL'; break;
      case 0x30: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `JR NC,${hex(pc + off)}`; break; }
      case 0x31: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD SP,${hex(nn)}`; break; }
      case 0x32: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD (${hex(nn)}),A`; break; }
      case 0x33: pc++; mnemonic = 'INC SP'; break;
      case 0x34: pc++; mnemonic = 'INC (HL)'; break;
      case 0x35: pc++; mnemonic = 'DEC (HL)'; break;
      case 0x36: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD (HL),${hex(romBytes[pc-1], 2)}`; break;
      case 0x37: pc++; mnemonic = 'SCF'; break;
      case 0x38: { rawBytes.push(romBytes[pc+1]); const e = romBytes[pc+1]; const off = e < 128 ? e : e - 256; pc += 2; mnemonic = `JR C,${hex(pc + off)}`; break; }
      case 0x39: pc++; mnemonic = 'ADD HL,SP'; break;
      case 0x3A: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD A,(${hex(nn)})`; break; }
      case 0x3B: pc++; mnemonic = 'DEC SP'; break;
      case 0x3C: pc++; mnemonic = 'INC A'; break;
      case 0x3D: pc++; mnemonic = 'DEC A'; break;
      case 0x3E: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `LD A,${hex(romBytes[pc-1], 2)}`; break;
      case 0x3F: pc++; mnemonic = 'CCF'; break;

      // .SIS prefix (0x40 in eZ80 ADL mode)
      case 0x40: {
        const next = romBytes[pc + 1];
        rawBytes.push(next);
        if (next === 0xCD) {
          const nn = read16(pc + 2); rawBytes.push(romBytes[pc+2], romBytes[pc+3]);
          pc += 4; mnemonic = `.SIS CALL ${hex(nn, 4)}`;
        } else if (next === 0xC3) {
          const nn = read16(pc + 2); rawBytes.push(romBytes[pc+2], romBytes[pc+3]);
          pc += 4; mnemonic = `.SIS JP ${hex(nn, 4)}`;
        } else if (next === 0xC9) {
          pc += 2; mnemonic = '.SIS RET';
        } else if (next === 0xE9) {
          pc += 2; mnemonic = '.SIS JP (HL)';
        } else {
          pc += 2; mnemonic = `.SIS [${hexByte(next)}]`;
        }
        break;
      }

      case 0x41: pc++; mnemonic = 'LD B,C'; break;
      case 0x42: pc++; mnemonic = 'LD B,D'; break;
      case 0x43: pc++; mnemonic = 'LD B,E'; break;
      case 0x44: pc++; mnemonic = 'LD B,H'; break;
      case 0x45: pc++; mnemonic = 'LD B,L'; break;
      case 0x46: pc++; mnemonic = 'LD B,(HL)'; break;
      case 0x47: pc++; mnemonic = 'LD B,A'; break;
      case 0x48: pc++; mnemonic = 'LD C,B'; break;
      case 0x49: pc++; mnemonic = 'LD C,C'; break;
      case 0x4A: pc++; mnemonic = 'LD C,D'; break;
      case 0x4B: pc++; mnemonic = 'LD C,E'; break;
      case 0x4C: pc++; mnemonic = 'LD C,H'; break;
      case 0x4D: pc++; mnemonic = 'LD C,L'; break;
      case 0x4E: pc++; mnemonic = 'LD C,(HL)'; break;
      case 0x4F: pc++; mnemonic = 'LD C,A'; break;
      case 0x50: pc++; mnemonic = 'LD D,B'; break;
      case 0x51: pc++; mnemonic = 'LD D,C'; break;
      case 0x52: pc++; mnemonic = 'LD D,D'; break;
      case 0x53: pc++; mnemonic = 'LD D,E'; break;
      case 0x54: pc++; mnemonic = 'LD D,H'; break;
      case 0x55: pc++; mnemonic = 'LD D,L'; break;
      case 0x56: pc++; mnemonic = 'LD D,(HL)'; break;
      case 0x57: pc++; mnemonic = 'LD D,A'; break;
      case 0x58: pc++; mnemonic = 'LD E,B'; break;
      case 0x59: pc++; mnemonic = 'LD E,C'; break;
      case 0x5A: pc++; mnemonic = 'LD E,D'; break;
      case 0x5B: pc++; mnemonic = 'LD E,E'; break;
      case 0x5C: pc++; mnemonic = 'LD E,H'; break;
      case 0x5D: pc++; mnemonic = 'LD E,L'; break;
      case 0x5E: pc++; mnemonic = 'LD E,(HL)'; break;
      case 0x5F: pc++; mnemonic = 'LD E,A'; break;
      case 0x60: pc++; mnemonic = 'LD H,B'; break;
      case 0x61: pc++; mnemonic = 'LD H,C'; break;
      case 0x62: pc++; mnemonic = 'LD H,D'; break;
      case 0x63: pc++; mnemonic = 'LD H,E'; break;
      case 0x64: pc++; mnemonic = 'LD H,H'; break;
      case 0x65: pc++; mnemonic = 'LD H,L'; break;
      case 0x66: pc++; mnemonic = 'LD H,(HL)'; break;
      case 0x67: pc++; mnemonic = 'LD H,A'; break;
      case 0x68: pc++; mnemonic = 'LD L,B'; break;
      case 0x69: pc++; mnemonic = 'LD L,C'; break;
      case 0x6A: pc++; mnemonic = 'LD L,D'; break;
      case 0x6B: pc++; mnemonic = 'LD L,E'; break;
      case 0x6C: pc++; mnemonic = 'LD L,H'; break;
      case 0x6D: pc++; mnemonic = 'LD L,L'; break;
      case 0x6E: pc++; mnemonic = 'LD L,(HL)'; break;
      case 0x6F: pc++; mnemonic = 'LD L,A'; break;
      case 0x70: pc++; mnemonic = 'LD (HL),B'; break;
      case 0x71: pc++; mnemonic = 'LD (HL),C'; break;
      case 0x72: pc++; mnemonic = 'LD (HL),D'; break;
      case 0x73: pc++; mnemonic = 'LD (HL),E'; break;
      case 0x74: pc++; mnemonic = 'LD (HL),H'; break;
      case 0x75: pc++; mnemonic = 'LD (HL),L'; break;
      case 0x76: pc++; mnemonic = 'HALT'; break;
      case 0x77: pc++; mnemonic = 'LD (HL),A'; break;
      case 0x78: pc++; mnemonic = 'LD A,B'; break;
      case 0x79: pc++; mnemonic = 'LD A,C'; break;
      case 0x7A: pc++; mnemonic = 'LD A,D'; break;
      case 0x7B: pc++; mnemonic = 'LD A,E'; break;
      case 0x7C: pc++; mnemonic = 'LD A,H'; break;
      case 0x7D: pc++; mnemonic = 'LD A,L'; break;
      case 0x7E: pc++; mnemonic = 'LD A,(HL)'; break;
      case 0x7F: pc++; mnemonic = 'LD A,A'; break;

      case 0x80: pc++; mnemonic = 'ADD A,B'; break;
      case 0x81: pc++; mnemonic = 'ADD A,C'; break;
      case 0x82: pc++; mnemonic = 'ADD A,D'; break;
      case 0x83: pc++; mnemonic = 'ADD A,E'; break;
      case 0x84: pc++; mnemonic = 'ADD A,H'; break;
      case 0x85: pc++; mnemonic = 'ADD A,L'; break;
      case 0x86: pc++; mnemonic = 'ADD A,(HL)'; break;
      case 0x87: pc++; mnemonic = 'ADD A,A'; break;
      case 0x88: pc++; mnemonic = 'ADC A,B'; break;
      case 0x89: pc++; mnemonic = 'ADC A,C'; break;
      case 0x8A: pc++; mnemonic = 'ADC A,D'; break;
      case 0x8B: pc++; mnemonic = 'ADC A,E'; break;
      case 0x8C: pc++; mnemonic = 'ADC A,H'; break;
      case 0x8D: pc++; mnemonic = 'ADC A,L'; break;
      case 0x8E: pc++; mnemonic = 'ADC A,(HL)'; break;
      case 0x8F: pc++; mnemonic = 'ADC A,A'; break;
      case 0x90: pc++; mnemonic = 'SUB B'; break;
      case 0x91: pc++; mnemonic = 'SUB C'; break;
      case 0x92: pc++; mnemonic = 'SUB D'; break;
      case 0x93: pc++; mnemonic = 'SUB E'; break;
      case 0x94: pc++; mnemonic = 'SUB H'; break;
      case 0x95: pc++; mnemonic = 'SUB L'; break;
      case 0x96: pc++; mnemonic = 'SUB (HL)'; break;
      case 0x97: pc++; mnemonic = 'SUB A'; break;
      case 0x98: pc++; mnemonic = 'SBC A,B'; break;
      case 0x99: pc++; mnemonic = 'SBC A,C'; break;
      case 0x9A: pc++; mnemonic = 'SBC A,D'; break;
      case 0x9B: pc++; mnemonic = 'SBC A,E'; break;
      case 0x9C: pc++; mnemonic = 'SBC A,H'; break;
      case 0x9D: pc++; mnemonic = 'SBC A,L'; break;
      case 0x9E: pc++; mnemonic = 'SBC A,(HL)'; break;
      case 0x9F: pc++; mnemonic = 'SBC A,A'; break;
      case 0xA0: pc++; mnemonic = 'AND B'; break;
      case 0xA1: pc++; mnemonic = 'AND C'; break;
      case 0xA2: pc++; mnemonic = 'AND D'; break;
      case 0xA3: pc++; mnemonic = 'AND E'; break;
      case 0xA4: pc++; mnemonic = 'AND H'; break;
      case 0xA5: pc++; mnemonic = 'AND L'; break;
      case 0xA6: pc++; mnemonic = 'AND (HL)'; break;
      case 0xA7: pc++; mnemonic = 'AND A'; break;
      case 0xA8: pc++; mnemonic = 'XOR B'; break;
      case 0xA9: pc++; mnemonic = 'XOR C'; break;
      case 0xAA: pc++; mnemonic = 'XOR D'; break;
      case 0xAB: pc++; mnemonic = 'XOR E'; break;
      case 0xAC: pc++; mnemonic = 'XOR H'; break;
      case 0xAD: pc++; mnemonic = 'XOR L'; break;
      case 0xAE: pc++; mnemonic = 'XOR (HL)'; break;
      case 0xAF: pc++; mnemonic = 'XOR A'; break;
      case 0xB0: pc++; mnemonic = 'OR B'; break;
      case 0xB1: pc++; mnemonic = 'OR C'; break;
      case 0xB2: pc++; mnemonic = 'OR D'; break;
      case 0xB3: pc++; mnemonic = 'OR E'; break;
      case 0xB4: pc++; mnemonic = 'OR H'; break;
      case 0xB5: pc++; mnemonic = 'OR L'; break;
      case 0xB6: pc++; mnemonic = 'OR (HL)'; break;
      case 0xB7: pc++; mnemonic = 'OR A'; break;
      case 0xB8: pc++; mnemonic = 'CP B'; break;
      case 0xB9: pc++; mnemonic = 'CP C'; break;
      case 0xBA: pc++; mnemonic = 'CP D'; break;
      case 0xBB: pc++; mnemonic = 'CP E'; break;
      case 0xBC: pc++; mnemonic = 'CP H'; break;
      case 0xBD: pc++; mnemonic = 'CP L'; break;
      case 0xBE: pc++; mnemonic = 'CP (HL)'; break;
      case 0xBF: pc++; mnemonic = 'CP A'; break;

      case 0xC0: pc++; mnemonic = 'RET NZ'; break;
      case 0xC1: pc++; mnemonic = 'POP BC'; break;
      case 0xC2: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP NZ,${hex(nn)}`; break; }
      case 0xC3: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP ${hex(nn)}`; break; }
      case 0xC4: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL NZ,${hex(nn)}`; break; }
      case 0xC5: pc++; mnemonic = 'PUSH BC'; break;
      case 0xC6: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `ADD A,${hex(romBytes[pc-1], 2)}`; break;
      case 0xC7: pc++; mnemonic = 'RST 00h'; break;
      case 0xC8: pc++; mnemonic = 'RET Z'; break;
      case 0xC9: pc++; mnemonic = 'RET'; break;
      case 0xCA: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP Z,${hex(nn)}`; break; }
      case 0xCB: {
        rawBytes.push(romBytes[pc+1]);
        const cb = romBytes[pc + 1]; pc += 2;
        const bit = (cb >> 3) & 7;
        const reg = ['B','C','D','E','H','L','(HL)','A'][cb & 7];
        if (cb < 0x08) mnemonic = `RLC ${reg}`;
        else if (cb < 0x10) mnemonic = `RRC ${reg}`;
        else if (cb < 0x18) mnemonic = `RL ${reg}`;
        else if (cb < 0x20) mnemonic = `RR ${reg}`;
        else if (cb < 0x28) mnemonic = `SLA ${reg}`;
        else if (cb < 0x30) mnemonic = `SRA ${reg}`;
        else if (cb < 0x38) mnemonic = `SLL ${reg}`;
        else if (cb < 0x40) mnemonic = `SRL ${reg}`;
        else if (cb < 0x80) mnemonic = `BIT ${bit},${reg}`;
        else if (cb < 0xC0) mnemonic = `RES ${bit},${reg}`;
        else mnemonic = `SET ${bit},${reg}`;
        break;
      }
      case 0xCC: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL Z,${hex(nn)}`; break; }
      case 0xCD: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL ${hex(nn)}`; break; }
      case 0xCE: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `ADC A,${hex(romBytes[pc-1], 2)}`; break;
      case 0xCF: pc++; mnemonic = 'RST 08h'; break;
      case 0xD0: pc++; mnemonic = 'RET NC'; break;
      case 0xD1: pc++; mnemonic = 'POP DE'; break;
      case 0xD2: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP NC,${hex(nn)}`; break; }
      case 0xD3: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `OUT (${hex(romBytes[pc-1], 2)}),A`; break;
      case 0xD4: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL NC,${hex(nn)}`; break; }
      case 0xD5: pc++; mnemonic = 'PUSH DE'; break;
      case 0xD6: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `SUB ${hex(romBytes[pc-1], 2)}`; break;
      case 0xD7: pc++; mnemonic = 'RST 10h'; break;
      case 0xD8: pc++; mnemonic = 'RET C'; break;
      case 0xD9: pc++; mnemonic = 'EXX'; break;
      case 0xDA: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP C,${hex(nn)}`; break; }
      case 0xDB: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `IN A,(${hex(romBytes[pc-1], 2)})`; break;
      case 0xDC: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL C,${hex(nn)}`; break; }

      case 0xDD: {
        const next = romBytes[pc + 1]; rawBytes.push(next);
        if (next === 0x21) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD IX,${hex(nn)}`; }
        else if (next === 0x22) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD (${hex(nn)}),IX`; }
        else if (next === 0x2A) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD IX,(${hex(nn)})`; }
        else if (next === 0xE1) { pc += 2; mnemonic = 'POP IX'; }
        else if (next === 0xE5) { pc += 2; mnemonic = 'PUSH IX'; }
        else if (next === 0xE9) { pc += 2; mnemonic = 'JP (IX)'; }
        else if (next === 0x23) { pc += 2; mnemonic = 'INC IX'; }
        else if (next === 0x2B) { pc += 2; mnemonic = 'DEC IX'; }
        else if (next === 0x09) { pc += 2; mnemonic = 'ADD IX,BC'; }
        else if (next === 0x19) { pc += 2; mnemonic = 'ADD IX,DE'; }
        else if (next === 0x29) { pc += 2; mnemonic = 'ADD IX,IX'; }
        else if (next === 0x39) { pc += 2; mnemonic = 'ADD IX,SP'; }
        else if (next === 0x36) { rawBytes.push(romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD (IX+${hex(romBytes[pc-2],2)}),${hex(romBytes[pc-1],2)}`; }
        else if (next >= 0x70 && next <= 0x77) { rawBytes.push(romBytes[pc+2]); const d = romBytes[pc+2]; const reg = ['B','C','D','E','H','L','(HL)','A'][next & 7]; pc += 3; mnemonic = `LD (IX+${hex(d,2)}),${reg}`; }
        else if (next >= 0x46 && next <= 0x7E && (next & 7) === 6) { rawBytes.push(romBytes[pc+2]); const d = romBytes[pc+2]; const reg = ['B','C','D','E','H','L','?','A'][(next >> 3) & 7]; pc += 3; mnemonic = `LD ${reg},(IX+${hex(d,2)})`; }
        else if (next === 0xBE) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `CP (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x34) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `INC (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x35) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `DEC (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x86) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `ADD A,(IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x96) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `SUB (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xA6) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `AND (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xB6) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `OR (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xAE) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `XOR (IX+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xCB) { rawBytes.push(romBytes[pc+2], romBytes[pc+3]); const d = romBytes[pc+2]; const cb = romBytes[pc+3]; pc += 4; const bit = (cb >> 3) & 7; if (cb >= 0x40 && cb < 0x80) mnemonic = `BIT ${bit},(IX+${hex(d,2)})`; else if (cb >= 0x80 && cb < 0xC0) mnemonic = `RES ${bit},(IX+${hex(d,2)})`; else if (cb >= 0xC0) mnemonic = `SET ${bit},(IX+${hex(d,2)})`; else mnemonic = `IX CB [${hexByte(d)} ${hexByte(cb)}]`; }
        else { pc += 2; mnemonic = `IX [${hexByte(next)}]`; }
        break;
      }

      case 0xDE: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `SBC A,${hex(romBytes[pc-1], 2)}`; break;
      case 0xDF: pc++; mnemonic = 'RST 18h'; break;
      case 0xE0: pc++; mnemonic = 'RET PO'; break;
      case 0xE1: pc++; mnemonic = 'POP HL'; break;
      case 0xE2: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP PO,${hex(nn)}`; break; }
      case 0xE3: pc++; mnemonic = 'EX (SP),HL'; break;
      case 0xE4: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL PO,${hex(nn)}`; break; }
      case 0xE5: pc++; mnemonic = 'PUSH HL'; break;
      case 0xE6: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `AND ${hex(romBytes[pc-1], 2)}`; break;
      case 0xE7: { const idx = read16(pc + 1); rawBytes.push(romBytes[pc+1], romBytes[pc+2]); pc += 3; mnemonic = `BCALL ${hex(idx, 4)}`; break; }
      case 0xE8: pc++; mnemonic = 'RET PE'; break;
      case 0xE9: pc++; mnemonic = 'JP (HL)'; break;
      case 0xEA: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP PE,${hex(nn)}`; break; }
      case 0xEB: pc++; mnemonic = 'EX DE,HL'; break;
      case 0xEC: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL PE,${hex(nn)}`; break; }

      case 0xED: {
        const next = romBytes[pc + 1]; rawBytes.push(next);
        if (next === 0xB0) { pc += 2; mnemonic = 'LDIR'; }
        else if (next === 0xB8) { pc += 2; mnemonic = 'LDDR'; }
        else if (next === 0xA0) { pc += 2; mnemonic = 'LDI'; }
        else if (next === 0xA8) { pc += 2; mnemonic = 'LDD'; }
        else if (next === 0xB1) { pc += 2; mnemonic = 'CPIR'; }
        else if (next === 0xB9) { pc += 2; mnemonic = 'CPDR'; }
        else if (next === 0xA1) { pc += 2; mnemonic = 'CPI'; }
        else if (next === 0xA9) { pc += 2; mnemonic = 'CPD'; }
        else if (next === 0x43) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD (${hex(nn)}),BC`; }
        else if (next === 0x4B) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD BC,(${hex(nn)})`; }
        else if (next === 0x53) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD (${hex(nn)}),DE`; }
        else if (next === 0x5B) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD DE,(${hex(nn)})`; }
        else if (next === 0x73) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD (${hex(nn)}),SP`; }
        else if (next === 0x7B) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD SP,(${hex(nn)})`; }
        else if (next === 0x44) { pc += 2; mnemonic = 'NEG'; }
        else if (next === 0x45) { pc += 2; mnemonic = 'RETN'; }
        else if (next === 0x4D) { pc += 2; mnemonic = 'RETI'; }
        else if (next === 0x46) { pc += 2; mnemonic = 'IM 0'; }
        else if (next === 0x56) { pc += 2; mnemonic = 'IM 1'; }
        else if (next === 0x5E) { pc += 2; mnemonic = 'IM 2'; }
        else if (next === 0x47) { pc += 2; mnemonic = 'LD I,A'; }
        else if (next === 0x4F) { pc += 2; mnemonic = 'LD R,A'; }
        else if (next === 0x57) { pc += 2; mnemonic = 'LD A,I'; }
        else if (next === 0x5F) { pc += 2; mnemonic = 'LD A,R'; }
        else if (next === 0x67) { pc += 2; mnemonic = 'RRD'; }
        else if (next === 0x6F) { pc += 2; mnemonic = 'RLD'; }
        else if (next === 0x42) { pc += 2; mnemonic = 'SBC HL,BC'; }
        else if (next === 0x52) { pc += 2; mnemonic = 'SBC HL,DE'; }
        else if (next === 0x62) { pc += 2; mnemonic = 'SBC HL,HL'; }
        else if (next === 0x72) { pc += 2; mnemonic = 'SBC HL,SP'; }
        else if (next === 0x4A) { pc += 2; mnemonic = 'ADC HL,BC'; }
        else if (next === 0x5A) { pc += 2; mnemonic = 'ADC HL,DE'; }
        else if (next === 0x6A) { pc += 2; mnemonic = 'ADC HL,HL'; }
        else if (next === 0x7A) { pc += 2; mnemonic = 'ADC HL,SP'; }
        else if (next === 0x6C) { pc += 2; mnemonic = 'MLT HL'; }
        else if (next === 0x4C) { pc += 2; mnemonic = 'MLT BC'; }
        else if (next === 0x5C) { pc += 2; mnemonic = 'MLT DE'; }
        else if (next === 0x7C) { pc += 2; mnemonic = 'MLT SP'; }
        else { pc += 2; mnemonic = `ED [${hexByte(next)}]`; }
        break;
      }

      case 0xEE: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `XOR ${hex(romBytes[pc-1], 2)}`; break;
      case 0xEF: pc++; mnemonic = 'RST 28h'; break;
      case 0xF0: pc++; mnemonic = 'RET P'; break;
      case 0xF1: pc++; mnemonic = 'POP AF'; break;
      case 0xF2: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP P,${hex(nn)}`; break; }
      case 0xF3: pc++; mnemonic = 'DI'; break;
      case 0xF4: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL P,${hex(nn)}`; break; }
      case 0xF5: pc++; mnemonic = 'PUSH AF'; break;
      case 0xF6: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `OR ${hex(romBytes[pc-1], 2)}`; break;
      case 0xF7: pc++; mnemonic = 'RST 30h'; break;
      case 0xF8: pc++; mnemonic = 'RET M'; break;
      case 0xF9: pc++; mnemonic = 'LD SP,HL'; break;
      case 0xFA: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `JP M,${hex(nn)}`; break; }
      case 0xFB: pc++; mnemonic = 'EI'; break;
      case 0xFC: { const nn = read24(pc+1); rawBytes.push(romBytes[pc+1], romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `CALL M,${hex(nn)}`; break; }

      case 0xFD: {
        const next = romBytes[pc + 1]; rawBytes.push(next);
        if (next === 0x21) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD IY,${hex(nn)}`; }
        else if (next === 0x22) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD (${hex(nn)}),IY`; }
        else if (next === 0x2A) { const nn = read24(pc+2); rawBytes.push(romBytes[pc+2], romBytes[pc+3], romBytes[pc+4]); pc += 5; mnemonic = `LD IY,(${hex(nn)})`; }
        else if (next === 0xE1) { pc += 2; mnemonic = 'POP IY'; }
        else if (next === 0xE5) { pc += 2; mnemonic = 'PUSH IY'; }
        else if (next === 0xE9) { pc += 2; mnemonic = 'JP (IY)'; }
        else if (next === 0x23) { pc += 2; mnemonic = 'INC IY'; }
        else if (next === 0x2B) { pc += 2; mnemonic = 'DEC IY'; }
        else if (next === 0x09) { pc += 2; mnemonic = 'ADD IY,BC'; }
        else if (next === 0x19) { pc += 2; mnemonic = 'ADD IY,DE'; }
        else if (next === 0x29) { pc += 2; mnemonic = 'ADD IY,IY'; }
        else if (next === 0x39) { pc += 2; mnemonic = 'ADD IY,SP'; }
        else if (next === 0x36) { rawBytes.push(romBytes[pc+2], romBytes[pc+3]); pc += 4; mnemonic = `LD (IY+${hex(romBytes[pc-2],2)}),${hex(romBytes[pc-1],2)}`; }
        else if (next >= 0x70 && next <= 0x77) { rawBytes.push(romBytes[pc+2]); const d = romBytes[pc+2]; const reg = ['B','C','D','E','H','L','(HL)','A'][next & 7]; pc += 3; mnemonic = `LD (IY+${hex(d,2)}),${reg}`; }
        else if (next >= 0x46 && next <= 0x7E && (next & 7) === 6) { rawBytes.push(romBytes[pc+2]); const d = romBytes[pc+2]; const reg = ['B','C','D','E','H','L','?','A'][(next >> 3) & 7]; pc += 3; mnemonic = `LD ${reg},(IY+${hex(d,2)})`; }
        else if (next === 0xBE) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `CP (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x34) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `INC (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x35) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `DEC (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x86) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `ADD A,(IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0x96) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `SUB (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xA6) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `AND (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xB6) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `OR (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xAE) { rawBytes.push(romBytes[pc+2]); pc += 3; mnemonic = `XOR (IY+${hex(romBytes[pc-1],2)})`; }
        else if (next === 0xCB) { rawBytes.push(romBytes[pc+2], romBytes[pc+3]); const d = romBytes[pc+2]; const cb = romBytes[pc+3]; pc += 4; const bit = (cb >> 3) & 7; if (cb >= 0x40 && cb < 0x80) mnemonic = `BIT ${bit},(IY+${hex(d,2)})`; else if (cb >= 0x80 && cb < 0xC0) mnemonic = `RES ${bit},(IY+${hex(d,2)})`; else if (cb >= 0xC0) mnemonic = `SET ${bit},(IY+${hex(d,2)})`; else mnemonic = `IY CB [${hexByte(d)} ${hexByte(cb)}]`; }
        else { pc += 2; mnemonic = `IY [${hexByte(next)}]`; }
        break;
      }

      case 0xFE: rawBytes.push(romBytes[pc+1]); pc += 2; mnemonic = `CP ${hex(romBytes[pc-1], 2)}`; break;
      case 0xFF: pc++; mnemonic = 'RST 38h'; break;

      default:
        pc++;
        mnemonic = `DB ${hexByte(op)}`;
        break;
    }

    const addr = hex(instrStart);
    const bytes = rawBytes.map(hexByte).join(' ');
    lines.push(`${addr} | ${bytes.padEnd(18)} | ${mnemonic}`);
  }

  return lines;
}

// ============================================================
// Main
// ============================================================
console.log('=== Phase 506: Decode 0x04C885 (Record Dispatch) ===\n');

console.log('--- 0x04C885 disassembly (~150 bytes) ---');
console.log('Address    | Raw bytes          | Mnemonic');
console.log('-'.repeat(65));
const lines1 = disassemble(0x04C885, 150);
for (const line of lines1) console.log(line);

console.log('\n--- 0x04C979 disassembly (~30 bytes) ---');
console.log('Address    | Raw bytes          | Mnemonic');
console.log('-'.repeat(65));
const lines2 = disassemble(0x04C979, 30);
for (const line of lines2) console.log(line);

// Raw hex dumps for cross-reference
console.log('\n--- Raw bytes at 0x04C885 (first 32 bytes) ---');
const raw1 = [];
for (let i = 0; i < 32; i++) raw1.push(hexByte(romBytes[0x04C885 + i]));
console.log(raw1.join(' '));

console.log('\n--- Raw bytes at 0x04C979 (first 16 bytes) ---');
const raw2 = [];
for (let i = 0; i < 16; i++) raw2.push(hexByte(romBytes[0x04C979 + i]));
console.log(raw2.join(' '));

console.log('\nPhase 506 complete.');
