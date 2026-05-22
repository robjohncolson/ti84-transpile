#!/usr/bin/env node
// probe-phase401-decode-02D267.mjs
// Disassemble the function containing 0x02D267, find references to counter
// 0xD1770A, and decode the notification function at 0x049CCA.

import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(v, digits = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
}

function readLE16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function readLE24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// Return a hex dump string for `len` bytes starting at ROM offset `off`.
function hexDump(off, len) {
  const parts = [];
  for (let i = 0; i < len && off + i < rom.length; i++) {
    parts.push(rom[off + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Minimal eZ80 disassembler — enough to read OS code, not a full decoder.
// Returns { mnemonic, length }.
// ---------------------------------------------------------------------------

function disasm(addr) {
  const off = addr; // ROM offset = address for addr < 0x400000
  if (off >= rom.length) return { mnemonic: '???', length: 1 };

  const b0 = rom[off];

  // ---------- prefix bytes (SIS/LIS/SIL/LIL) ----------
  if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
    const modeNames = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    const inner = disasmCore(addr + 1);
    return { mnemonic: inner.mnemonic + modeNames[b0], length: 1 + inner.length };
  }

  return disasmCore(addr);
}

function disasmCore(addr) {
  const off = addr;
  if (off >= rom.length) return { mnemonic: '???', length: 1 };
  const b0 = rom[off];

  // --- DD prefix (IX) ---
  if (b0 === 0xDD) {
    return disasmIXIY(addr, 'IX');
  }
  // --- FD prefix (IY) ---
  if (b0 === 0xFD) {
    return disasmIXIY(addr, 'IY');
  }
  // --- ED prefix ---
  if (b0 === 0xED) {
    return disasmED(addr);
  }
  // --- CB prefix (bit ops) ---
  if (b0 === 0xCB) {
    const b1 = rom[off + 1];
    return { mnemonic: `CB ${hex(b1, 2)}`, length: 2 };
  }

  // --- unprefixed ---
  switch (b0) {
    case 0x00: return { mnemonic: 'NOP', length: 1 };
    case 0x01: return { mnemonic: `LD BC,${hex(readLE24(off + 1))}`, length: 4 };
    case 0x02: return { mnemonic: 'LD (BC),A', length: 1 };
    case 0x03: return { mnemonic: 'INC BC', length: 1 };
    case 0x04: return { mnemonic: 'INC B', length: 1 };
    case 0x05: return { mnemonic: 'DEC B', length: 1 };
    case 0x06: return { mnemonic: `LD B,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x07: return { mnemonic: 'RLCA', length: 1 };
    case 0x08: return { mnemonic: "EX AF,AF'", length: 1 };
    case 0x09: return { mnemonic: 'ADD HL,BC', length: 1 };
    case 0x0A: return { mnemonic: 'LD A,(BC)', length: 1 };
    case 0x0B: return { mnemonic: 'DEC BC', length: 1 };
    case 0x0C: return { mnemonic: 'INC C', length: 1 };
    case 0x0D: return { mnemonic: 'DEC C', length: 1 };
    case 0x0E: return { mnemonic: `LD C,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x0F: return { mnemonic: 'RRCA', length: 1 };
    case 0x10: return { mnemonic: `DJNZ ${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x11: return { mnemonic: `LD DE,${hex(readLE24(off + 1))}`, length: 4 };
    case 0x12: return { mnemonic: 'LD (DE),A', length: 1 };
    case 0x13: return { mnemonic: 'INC DE', length: 1 };
    case 0x14: return { mnemonic: 'INC D', length: 1 };
    case 0x15: return { mnemonic: 'DEC D', length: 1 };
    case 0x16: return { mnemonic: `LD D,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x17: return { mnemonic: 'RLA', length: 1 };
    case 0x18: return { mnemonic: `JR ${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x19: return { mnemonic: 'ADD HL,DE', length: 1 };
    case 0x1A: return { mnemonic: 'LD A,(DE)', length: 1 };
    case 0x1B: return { mnemonic: 'DEC DE', length: 1 };
    case 0x1C: return { mnemonic: 'INC E', length: 1 };
    case 0x1D: return { mnemonic: 'DEC E', length: 1 };
    case 0x1E: return { mnemonic: `LD E,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x1F: return { mnemonic: 'RRA', length: 1 };
    case 0x20: return { mnemonic: `JR NZ,${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x21: return { mnemonic: `LD HL,${hex(readLE24(off + 1))}`, length: 4 };
    case 0x22: return { mnemonic: `LD (${hex(readLE24(off + 1))}),HL`, length: 4 };
    case 0x23: return { mnemonic: 'INC HL', length: 1 };
    case 0x24: return { mnemonic: 'INC H', length: 1 };
    case 0x25: return { mnemonic: 'DEC H', length: 1 };
    case 0x26: return { mnemonic: `LD H,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x27: return { mnemonic: 'DAA', length: 1 };
    case 0x28: return { mnemonic: `JR Z,${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x29: return { mnemonic: 'ADD HL,HL', length: 1 };
    case 0x2A: return { mnemonic: `LD HL,(${hex(readLE24(off + 1))})`, length: 4 };
    case 0x2B: return { mnemonic: 'DEC HL', length: 1 };
    case 0x2C: return { mnemonic: 'INC L', length: 1 };
    case 0x2D: return { mnemonic: 'DEC L', length: 1 };
    case 0x2E: return { mnemonic: `LD L,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x2F: return { mnemonic: 'CPL', length: 1 };
    case 0x30: return { mnemonic: `JR NC,${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x31: return { mnemonic: `LD SP,${hex(readLE24(off + 1))}`, length: 4 };
    case 0x32: return { mnemonic: `LD (${hex(readLE24(off + 1))}),A`, length: 4 };
    case 0x33: return { mnemonic: 'INC SP', length: 1 };
    case 0x34: return { mnemonic: 'INC (HL)', length: 1 };
    case 0x35: return { mnemonic: 'DEC (HL)', length: 1 };
    case 0x36: return { mnemonic: `LD (HL),${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x37: return { mnemonic: 'SCF', length: 1 };
    case 0x38: return { mnemonic: `JR C,${hex(addr + 2 + signExtend8(rom[off + 1]))}`, length: 2 };
    case 0x39: return { mnemonic: 'ADD HL,SP', length: 1 };
    case 0x3A: return { mnemonic: `LD A,(${hex(readLE24(off + 1))})`, length: 4 };
    case 0x3B: return { mnemonic: 'DEC SP', length: 1 };
    case 0x3C: return { mnemonic: 'INC A', length: 1 };
    case 0x3D: return { mnemonic: 'DEC A', length: 1 };
    case 0x3E: return { mnemonic: `LD A,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0x3F: return { mnemonic: 'CCF', length: 1 };

    // LD r,r' block 0x40-0x7F (except 0x76 = HALT)
    case 0x76: return { mnemonic: 'HALT', length: 1 };

    case 0x77: return { mnemonic: 'LD (HL),A', length: 1 };
    case 0x78: return { mnemonic: 'LD A,B', length: 1 };
    case 0x79: return { mnemonic: 'LD A,C', length: 1 };
    case 0x7A: return { mnemonic: 'LD A,D', length: 1 };
    case 0x7B: return { mnemonic: 'LD A,E', length: 1 };
    case 0x7C: return { mnemonic: 'LD A,H', length: 1 };
    case 0x7D: return { mnemonic: 'LD A,L', length: 1 };
    case 0x7E: return { mnemonic: 'LD A,(HL)', length: 1 };
    case 0x7F: return { mnemonic: 'LD A,A', length: 1 };

    // More LD r,r' we care about
    case 0x41: return { mnemonic: 'LD B,C', length: 1 };
    case 0x42: return { mnemonic: 'LD B,D', length: 1 };
    case 0x43: return { mnemonic: 'LD B,E', length: 1 };
    case 0x44: return { mnemonic: 'LD B,H', length: 1 };
    case 0x45: return { mnemonic: 'LD B,L', length: 1 };
    case 0x46: return { mnemonic: 'LD B,(HL)', length: 1 };
    case 0x47: return { mnemonic: 'LD B,A', length: 1 };
    case 0x48: return { mnemonic: 'LD C,B', length: 1 };
    // 0x49 is also LIS prefix — handled above
    case 0x4A: return { mnemonic: 'LD C,D', length: 1 };
    case 0x4B: return { mnemonic: 'LD C,E', length: 1 };
    case 0x4C: return { mnemonic: 'LD C,H', length: 1 };
    case 0x4D: return { mnemonic: 'LD C,L', length: 1 };
    case 0x4E: return { mnemonic: 'LD C,(HL)', length: 1 };
    case 0x4F: return { mnemonic: 'LD C,A', length: 1 };
    case 0x50: return { mnemonic: 'LD D,B', length: 1 };
    case 0x51: return { mnemonic: 'LD D,C', length: 1 };
    // 0x52 is also SIL prefix — handled above
    case 0x53: return { mnemonic: 'LD D,E', length: 1 };
    case 0x54: return { mnemonic: 'LD D,H', length: 1 };
    case 0x55: return { mnemonic: 'LD D,L', length: 1 };
    case 0x56: return { mnemonic: 'LD D,(HL)', length: 1 };
    case 0x57: return { mnemonic: 'LD D,A', length: 1 };
    case 0x58: return { mnemonic: 'LD E,B', length: 1 };
    case 0x59: return { mnemonic: 'LD E,C', length: 1 };
    case 0x5A: return { mnemonic: 'LD E,D', length: 1 };
    // 0x5B is also LIL prefix — handled above
    case 0x5C: return { mnemonic: 'LD E,H', length: 1 };
    case 0x5D: return { mnemonic: 'LD E,L', length: 1 };
    case 0x5E: return { mnemonic: 'LD E,(HL)', length: 1 };
    case 0x5F: return { mnemonic: 'LD E,A', length: 1 };
    case 0x60: return { mnemonic: 'LD H,B', length: 1 };
    case 0x61: return { mnemonic: 'LD H,C', length: 1 };
    case 0x62: return { mnemonic: 'LD H,D', length: 1 };
    case 0x63: return { mnemonic: 'LD H,E', length: 1 };
    case 0x64: return { mnemonic: 'LD H,H', length: 1 };
    case 0x65: return { mnemonic: 'LD H,L', length: 1 };
    case 0x66: return { mnemonic: 'LD H,(HL)', length: 1 };
    case 0x67: return { mnemonic: 'LD H,A', length: 1 };
    case 0x68: return { mnemonic: 'LD L,B', length: 1 };
    case 0x69: return { mnemonic: 'LD L,C', length: 1 };
    case 0x6A: return { mnemonic: 'LD L,D', length: 1 };
    case 0x6B: return { mnemonic: 'LD L,E', length: 1 };
    case 0x6C: return { mnemonic: 'LD L,H', length: 1 };
    case 0x6D: return { mnemonic: 'LD L,L', length: 1 };
    case 0x6E: return { mnemonic: 'LD L,(HL)', length: 1 };
    case 0x6F: return { mnemonic: 'LD L,A', length: 1 };
    case 0x70: return { mnemonic: 'LD (HL),B', length: 1 };
    case 0x71: return { mnemonic: 'LD (HL),C', length: 1 };
    case 0x72: return { mnemonic: 'LD (HL),D', length: 1 };
    case 0x73: return { mnemonic: 'LD (HL),E', length: 1 };
    case 0x74: return { mnemonic: 'LD (HL),H', length: 1 };
    case 0x75: return { mnemonic: 'LD (HL),L', length: 1 };

    // ALU with immediate
    case 0x80: return { mnemonic: 'ADD A,B', length: 1 };
    case 0x81: return { mnemonic: 'ADD A,C', length: 1 };
    case 0x82: return { mnemonic: 'ADD A,D', length: 1 };
    case 0x83: return { mnemonic: 'ADD A,E', length: 1 };
    case 0x84: return { mnemonic: 'ADD A,H', length: 1 };
    case 0x85: return { mnemonic: 'ADD A,L', length: 1 };
    case 0x86: return { mnemonic: 'ADD A,(HL)', length: 1 };
    case 0x87: return { mnemonic: 'ADD A,A', length: 1 };
    case 0x88: return { mnemonic: 'ADC A,B', length: 1 };
    case 0x89: return { mnemonic: 'ADC A,C', length: 1 };
    case 0x8A: return { mnemonic: 'ADC A,D', length: 1 };
    case 0x8B: return { mnemonic: 'ADC A,E', length: 1 };
    case 0x8C: return { mnemonic: 'ADC A,H', length: 1 };
    case 0x8D: return { mnemonic: 'ADC A,L', length: 1 };
    case 0x8E: return { mnemonic: 'ADC A,(HL)', length: 1 };
    case 0x8F: return { mnemonic: 'ADC A,A', length: 1 };
    case 0x90: return { mnemonic: 'SUB B', length: 1 };
    case 0x91: return { mnemonic: 'SUB C', length: 1 };
    case 0x92: return { mnemonic: 'SUB D', length: 1 };
    case 0x93: return { mnemonic: 'SUB E', length: 1 };
    case 0x94: return { mnemonic: 'SUB H', length: 1 };
    case 0x95: return { mnemonic: 'SUB L', length: 1 };
    case 0x96: return { mnemonic: 'SUB (HL)', length: 1 };
    case 0x97: return { mnemonic: 'SUB A', length: 1 };
    case 0x98: return { mnemonic: 'SBC A,B', length: 1 };
    case 0x99: return { mnemonic: 'SBC A,C', length: 1 };
    case 0x9A: return { mnemonic: 'SBC A,D', length: 1 };
    case 0x9B: return { mnemonic: 'SBC A,E', length: 1 };
    case 0x9C: return { mnemonic: 'SBC A,H', length: 1 };
    case 0x9D: return { mnemonic: 'SBC A,L', length: 1 };
    case 0x9E: return { mnemonic: 'SBC A,(HL)', length: 1 };
    case 0x9F: return { mnemonic: 'SBC A,A', length: 1 };
    case 0xA0: return { mnemonic: 'AND B', length: 1 };
    case 0xA1: return { mnemonic: 'AND C', length: 1 };
    case 0xA2: return { mnemonic: 'AND D', length: 1 };
    case 0xA3: return { mnemonic: 'AND E', length: 1 };
    case 0xA4: return { mnemonic: 'AND H', length: 1 };
    case 0xA5: return { mnemonic: 'AND L', length: 1 };
    case 0xA6: return { mnemonic: 'AND (HL)', length: 1 };
    case 0xA7: return { mnemonic: 'AND A', length: 1 };
    case 0xA8: return { mnemonic: 'XOR B', length: 1 };
    case 0xA9: return { mnemonic: 'XOR C', length: 1 };
    case 0xAA: return { mnemonic: 'XOR D', length: 1 };
    case 0xAB: return { mnemonic: 'XOR E', length: 1 };
    case 0xAC: return { mnemonic: 'XOR H', length: 1 };
    case 0xAD: return { mnemonic: 'XOR L', length: 1 };
    case 0xAE: return { mnemonic: 'XOR (HL)', length: 1 };
    case 0xAF: return { mnemonic: 'XOR A', length: 1 };
    case 0xB0: return { mnemonic: 'OR B', length: 1 };
    case 0xB1: return { mnemonic: 'OR C', length: 1 };
    case 0xB2: return { mnemonic: 'OR D', length: 1 };
    case 0xB3: return { mnemonic: 'OR E', length: 1 };
    case 0xB4: return { mnemonic: 'OR H', length: 1 };
    case 0xB5: return { mnemonic: 'OR L', length: 1 };
    case 0xB6: return { mnemonic: 'OR (HL)', length: 1 };
    case 0xB7: return { mnemonic: 'OR A', length: 1 };
    case 0xB8: return { mnemonic: 'CP B', length: 1 };
    case 0xB9: return { mnemonic: 'CP C', length: 1 };
    case 0xBA: return { mnemonic: 'CP D', length: 1 };
    case 0xBB: return { mnemonic: 'CP E', length: 1 };
    case 0xBC: return { mnemonic: 'CP H', length: 1 };
    case 0xBD: return { mnemonic: 'CP L', length: 1 };
    case 0xBE: return { mnemonic: 'CP (HL)', length: 1 };
    case 0xBF: return { mnemonic: 'CP A', length: 1 };

    case 0xC0: return { mnemonic: 'RET NZ', length: 1 };
    case 0xC1: return { mnemonic: 'POP BC', length: 1 };
    case 0xC2: return { mnemonic: `JP NZ,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xC3: return { mnemonic: `JP ${hex(readLE24(off + 1))}`, length: 4 };
    case 0xC4: return { mnemonic: `CALL NZ,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xC5: return { mnemonic: 'PUSH BC', length: 1 };
    case 0xC6: return { mnemonic: `ADD A,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xC7: return { mnemonic: 'RST 00h', length: 1 };
    case 0xC8: return { mnemonic: 'RET Z', length: 1 };
    case 0xC9: return { mnemonic: 'RET', length: 1 };
    case 0xCA: return { mnemonic: `JP Z,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xCC: return { mnemonic: `CALL Z,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xCD: return { mnemonic: `CALL ${hex(readLE24(off + 1))}`, length: 4 };
    case 0xCE: return { mnemonic: `ADC A,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xCF: return { mnemonic: 'RST 08h', length: 1 };
    case 0xD0: return { mnemonic: 'RET NC', length: 1 };
    case 0xD1: return { mnemonic: 'POP DE', length: 1 };
    case 0xD2: return { mnemonic: `JP NC,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xD3: return { mnemonic: `OUT (${hex(rom[off + 1], 2)}),A`, length: 2 };
    case 0xD4: return { mnemonic: `CALL NC,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xD5: return { mnemonic: 'PUSH DE', length: 1 };
    case 0xD6: return { mnemonic: `SUB ${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xD7: return { mnemonic: 'RST 10h', length: 1 };
    case 0xD8: return { mnemonic: 'RET C', length: 1 };
    case 0xD9: return { mnemonic: 'EXX', length: 1 };
    case 0xDA: return { mnemonic: `JP C,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xDB: return { mnemonic: `IN A,(${hex(rom[off + 1], 2)})`, length: 2 };
    case 0xDC: return { mnemonic: `CALL C,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xDE: return { mnemonic: `SBC A,${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xDF: return { mnemonic: 'RST 18h', length: 1 };
    case 0xE0: return { mnemonic: 'RET PO', length: 1 };
    case 0xE1: return { mnemonic: 'POP HL', length: 1 };
    case 0xE2: return { mnemonic: `JP PO,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xE3: return { mnemonic: 'EX (SP),HL', length: 1 };
    case 0xE4: return { mnemonic: `CALL PO,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xE5: return { mnemonic: 'PUSH HL', length: 1 };
    case 0xE6: return { mnemonic: `AND ${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xE7: return { mnemonic: 'RST 20h', length: 1 };
    case 0xE8: return { mnemonic: 'RET PE', length: 1 };
    case 0xE9: return { mnemonic: 'JP (HL)', length: 1 };
    case 0xEA: return { mnemonic: `JP PE,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xEB: return { mnemonic: 'EX DE,HL', length: 1 };
    case 0xEC: return { mnemonic: `CALL PE,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xEE: return { mnemonic: `XOR ${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xEF: return { mnemonic: 'RST 28h', length: 1 };
    case 0xF0: return { mnemonic: 'RET P', length: 1 };
    case 0xF1: return { mnemonic: 'POP AF', length: 1 };
    case 0xF2: return { mnemonic: `JP P,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xF3: return { mnemonic: 'DI', length: 1 };
    case 0xF4: return { mnemonic: `CALL P,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xF5: return { mnemonic: 'PUSH AF', length: 1 };
    case 0xF6: return { mnemonic: `OR ${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xF7: return { mnemonic: 'RST 30h', length: 1 };
    case 0xF8: return { mnemonic: 'RET M', length: 1 };
    case 0xF9: return { mnemonic: 'LD SP,HL', length: 1 };
    case 0xFA: return { mnemonic: `JP M,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xFB: return { mnemonic: 'EI', length: 1 };
    case 0xFC: return { mnemonic: `CALL M,${hex(readLE24(off + 1))}`, length: 4 };
    case 0xFE: return { mnemonic: `CP ${hex(rom[off + 1], 2)}`, length: 2 };
    case 0xFF: return { mnemonic: 'RST 38h', length: 1 };

    default: {
      // Catch-all for LD r,r' we missed (0x40-0x7F range)
      if (b0 >= 0x40 && b0 <= 0x7F) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const dst = regs[(b0 >> 3) & 7];
        const src = regs[b0 & 7];
        return { mnemonic: `LD ${dst},${src}`, length: 1 };
      }
      return { mnemonic: `DB ${hex(b0, 2)}`, length: 1 };
    }
  }
}

function disasmED(addr) {
  const off = addr;
  const b1 = rom[off + 1];
  switch (b1) {
    case 0x43: return { mnemonic: `LD (${hex(readLE24(off + 2))}),BC`, length: 5 };
    case 0x44: return { mnemonic: 'NEG', length: 2 };
    case 0x45: return { mnemonic: 'RETN', length: 2 };
    case 0x46: return { mnemonic: 'IM 0', length: 2 };
    case 0x47: return { mnemonic: 'LD I,A', length: 2 };
    case 0x4B: return { mnemonic: `LD BC,(${hex(readLE24(off + 2))})`, length: 5 };
    case 0x4D: return { mnemonic: 'RETI', length: 2 };
    case 0x4F: return { mnemonic: 'LD R,A', length: 2 };
    case 0x53: return { mnemonic: `LD (${hex(readLE24(off + 2))}),DE`, length: 5 };
    case 0x56: return { mnemonic: 'IM 1', length: 2 };
    case 0x57: return { mnemonic: 'LD A,I', length: 2 };
    case 0x5B: return { mnemonic: `LD DE,(${hex(readLE24(off + 2))})`, length: 5 };
    case 0x5E: return { mnemonic: 'IM 2', length: 2 };
    case 0x5F: return { mnemonic: 'LD A,R', length: 2 };
    case 0x67: return { mnemonic: 'RRD', length: 2 };
    case 0x6F: return { mnemonic: 'RLD', length: 2 };
    case 0x73: return { mnemonic: `LD (${hex(readLE24(off + 2))}),SP`, length: 5 };
    case 0x7B: return { mnemonic: `LD SP,(${hex(readLE24(off + 2))})`, length: 5 };
    case 0xA0: return { mnemonic: 'LDI', length: 2 };
    case 0xA1: return { mnemonic: 'CPI', length: 2 };
    case 0xA2: return { mnemonic: 'INI', length: 2 };
    case 0xA3: return { mnemonic: 'OUTI', length: 2 };
    case 0xA8: return { mnemonic: 'LDD', length: 2 };
    case 0xA9: return { mnemonic: 'CPD', length: 2 };
    case 0xAA: return { mnemonic: 'IND', length: 2 };
    case 0xAB: return { mnemonic: 'OUTD', length: 2 };
    case 0xB0: return { mnemonic: 'LDIR', length: 2 };
    case 0xB1: return { mnemonic: 'CPIR', length: 2 };
    case 0xB2: return { mnemonic: 'INIR', length: 2 };
    case 0xB3: return { mnemonic: 'OTIR', length: 2 };
    case 0xB8: return { mnemonic: 'LDDR', length: 2 };
    case 0xB9: return { mnemonic: 'CPDR', length: 2 };
    // eZ80 extended: IN/OUT with 16-bit port
    case 0x00: return { mnemonic: `IN0 B,(${hex(rom[off + 2], 2)})`, length: 3 };
    case 0x01: return { mnemonic: `OUT0 (${hex(rom[off + 2], 2)}),B`, length: 3 };
    case 0x02: return { mnemonic: `LEA BC,IX+${signExtend8(rom[off + 2])}`, length: 3 };
    case 0x03: return { mnemonic: `LEA BC,IY+${signExtend8(rom[off + 2])}`, length: 3 };
    case 0x04: return { mnemonic: 'TST A,B', length: 2 };
    case 0x07: return { mnemonic: `LD BC,(HL)`, length: 2 };
    case 0x0C: return { mnemonic: 'TST A,C', length: 2 };
    case 0x0F: return { mnemonic: `LD (HL),BC`, length: 2 };
    case 0x14: return { mnemonic: 'TST A,D', length: 2 };
    case 0x17: return { mnemonic: `LD DE,(HL)`, length: 2 };
    case 0x1C: return { mnemonic: 'TST A,E', length: 2 };
    case 0x1F: return { mnemonic: `LD (HL),DE`, length: 2 };
    case 0x24: return { mnemonic: 'TST A,H', length: 2 };
    case 0x27: return { mnemonic: `LD HL,(HL)`, length: 2 };
    case 0x2C: return { mnemonic: 'TST A,L', length: 2 };
    case 0x2F: return { mnemonic: `LD (HL),HL`, length: 2 };
    case 0x31: return { mnemonic: `LD IY,(HL)`, length: 2 };
    case 0x34: return { mnemonic: 'TST A,(HL)', length: 2 };
    case 0x37: return { mnemonic: `LD (HL),IY`, length: 2 };
    case 0x3C: return { mnemonic: 'TST A,A', length: 2 };
    case 0x3F: return { mnemonic: `LD (HL),IX`, length: 2 };
    case 0x3E: return { mnemonic: `LD IX,(HL)`, length: 2 };
    case 0x64: return { mnemonic: `TST A,${hex(rom[off + 2], 2)}`, length: 3 };
    case 0x65: return { mnemonic: 'PEA IX+d', length: 3 };
    case 0x66: return { mnemonic: 'PEA IY+d', length: 3 };
    case 0x6D: return { mnemonic: `LD MB,A`, length: 2 };
    case 0x6E: return { mnemonic: `LD A,MB`, length: 2 };
    case 0x74: return { mnemonic: `TSTIO ${hex(rom[off + 2], 2)}`, length: 3 };
    case 0x82: return { mnemonic: 'INIM', length: 2 };
    case 0x83: return { mnemonic: 'OTIM', length: 2 };
    case 0x84: return { mnemonic: 'INI2', length: 2 };
    case 0x8A: return { mnemonic: 'INDM', length: 2 };
    case 0x8B: return { mnemonic: 'OTDM', length: 2 };
    case 0x8C: return { mnemonic: 'IND2', length: 2 };
    case 0x92: return { mnemonic: 'INIMR', length: 2 };
    case 0x93: return { mnemonic: 'OTIMR', length: 2 };
    case 0x94: return { mnemonic: 'INI2R', length: 2 };
    case 0x9A: return { mnemonic: 'INDMR', length: 2 };
    case 0x9B: return { mnemonic: 'OTDMR', length: 2 };
    case 0x9C: return { mnemonic: 'IND2R', length: 2 };
    default: return { mnemonic: `ED ${hex(b1, 2)}`, length: 2 };
  }
}

function disasmIXIY(addr, reg) {
  const off = addr;
  const b1 = rom[off + 1];
  switch (b1) {
    case 0x09: return { mnemonic: `ADD ${reg},BC`, length: 2 };
    case 0x19: return { mnemonic: `ADD ${reg},DE`, length: 2 };
    case 0x21: return { mnemonic: `LD ${reg},${hex(readLE24(off + 2))}`, length: 5 };
    case 0x22: return { mnemonic: `LD (${hex(readLE24(off + 2))}),${reg}`, length: 5 };
    case 0x23: return { mnemonic: `INC ${reg}`, length: 2 };
    case 0x29: return { mnemonic: `ADD ${reg},${reg}`, length: 2 };
    case 0x2A: return { mnemonic: `LD ${reg},(${hex(readLE24(off + 2))})`, length: 5 };
    case 0x2B: return { mnemonic: `DEC ${reg}`, length: 2 };
    case 0x34: return { mnemonic: `INC (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x35: return { mnemonic: `DEC (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x36: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),${hex(rom[off + 3], 2)}`, length: 4 };
    case 0x39: return { mnemonic: `ADD ${reg},SP`, length: 2 };
    case 0x46: return { mnemonic: `LD B,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x4E: return { mnemonic: `LD C,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x56: return { mnemonic: `LD D,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x5E: return { mnemonic: `LD E,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x66: return { mnemonic: `LD H,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x6E: return { mnemonic: `LD L,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x70: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),B`, length: 3 };
    case 0x71: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),C`, length: 3 };
    case 0x72: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),D`, length: 3 };
    case 0x73: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),E`, length: 3 };
    case 0x74: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),H`, length: 3 };
    case 0x75: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),L`, length: 3 };
    case 0x77: return { mnemonic: `LD (${reg}+${signExtend8(rom[off + 2])}),A`, length: 3 };
    case 0x7E: return { mnemonic: `LD A,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x86: return { mnemonic: `ADD A,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x8E: return { mnemonic: `ADC A,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x96: return { mnemonic: `SUB (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0x9E: return { mnemonic: `SBC A,(${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0xA6: return { mnemonic: `AND (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0xAE: return { mnemonic: `XOR (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0xB6: return { mnemonic: `OR (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0xBE: return { mnemonic: `CP (${reg}+${signExtend8(rom[off + 2])})`, length: 3 };
    case 0xCB: {
      const d = signExtend8(rom[off + 2]);
      const op = rom[off + 3];
      const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      if (op >= 0x40 && op <= 0x7F) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `BIT ${bit},(${reg}+${d})`, length: 4 };
      } else if (op >= 0x80 && op <= 0xBF) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `RES ${bit},(${reg}+${d})`, length: 4 };
      } else if (op >= 0xC0) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `SET ${bit},(${reg}+${d})`, length: 4 };
      } else {
        return { mnemonic: `${bitOps[op >> 3]} (${reg}+${d})`, length: 4 };
      }
    }
    case 0xE1: return { mnemonic: `POP ${reg}`, length: 2 };
    case 0xE3: return { mnemonic: `EX (SP),${reg}`, length: 2 };
    case 0xE5: return { mnemonic: `PUSH ${reg}`, length: 2 };
    case 0xE9: return { mnemonic: `JP (${reg})`, length: 2 };
    case 0xF9: return { mnemonic: `LD SP,${reg}`, length: 2 };
    default: return { mnemonic: `${reg === 'IX' ? 'DD' : 'FD'} ${hex(b1, 2)}`, length: 2 };
  }
}

function signExtend8(v) {
  return v >= 128 ? v - 256 : v;
}

// ---------------------------------------------------------------------------
// Disassemble a range, printing each instruction
// ---------------------------------------------------------------------------

function disasmRange(start, end, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Disassembly: ${label} (${hex(start)} - ${hex(end)})`);
  console.log('='.repeat(70));
  let addr = start;
  while (addr < end) {
    const { mnemonic, length } = disasm(addr);
    const bytes = hexDump(addr, length);
    console.log(`  ${hex(addr)}:  ${bytes.padEnd(20)}  ${mnemonic}`);
    addr += length;
  }
}

// ---------------------------------------------------------------------------
// Find function start: scan backwards from target for RET/JP/RETN/RETI
// ---------------------------------------------------------------------------

function findFunctionStart(target, maxScanBack = 256) {
  // Scan backwards byte-by-byte looking for RET (0xC9) or unconditional JP nn (C3 xx xx xx)
  // The function likely starts right after that instruction.
  const candidates = [];
  for (let off = target - 1; off >= Math.max(0, target - maxScanBack); off--) {
    const b = rom[off];
    if (b === 0xC9) {
      // RET — function likely starts at off+1
      candidates.push({ addr: off + 1, reason: 'after RET', distance: target - (off + 1) });
    }
    // Unconditional JP nn: C3 xx xx xx — check that off >= 3 bytes before
    if (b === 0xC3 && off + 4 <= rom.length) {
      candidates.push({ addr: off + 4, reason: 'after JP nn', distance: target - (off + 4) });
    }
    // ED 4D = RETI
    if (b === 0xED && off + 1 < rom.length && rom[off + 1] === 0x4D) {
      candidates.push({ addr: off + 2, reason: 'after RETI', distance: target - (off + 2) });
    }
    // ED 45 = RETN
    if (b === 0xED && off + 1 < rom.length && rom[off + 1] === 0x45) {
      candidates.push({ addr: off + 2, reason: 'after RETN', distance: target - (off + 2) });
    }
  }

  // Filter to candidates before target, pick the closest one
  const valid = candidates.filter(c => c.addr <= target && c.distance >= 0);
  valid.sort((a, b) => a.distance - b.distance);
  return valid.length > 0 ? valid[0] : null;
}

// ---------------------------------------------------------------------------
// Search ROM for 3-byte LE reference pattern
// ---------------------------------------------------------------------------

function searchROMForRef(lowByte, midByte, highByte, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Searching ROM for ${label}: byte pattern ${hex(lowByte,2)} ${hex(midByte,2)} ${hex(highByte,2)}`);
  console.log('='.repeat(70));
  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lowByte && rom[i + 1] === midByte && rom[i + 2] === highByte) {
      // Check context: what opcode precedes this 3-byte address?
      const preceding = i > 0 ? rom[i - 1] : 0;
      let context = '';
      if (preceding === 0xCD) context = 'CALL';
      else if (preceding === 0xC3) context = 'JP';
      else if (preceding === 0x3A) context = 'LD A,(nn)';
      else if (preceding === 0x32) context = 'LD (nn),A';
      else if (preceding === 0x21) context = 'LD HL,nn';
      else if (preceding === 0x11) context = 'LD DE,nn';
      else if (preceding === 0x01) context = 'LD BC,nn';
      else if (preceding === 0x22) context = 'LD (nn),HL';
      else if (preceding === 0x2A) context = 'LD HL,(nn)';
      else if (i > 1 && rom[i - 2] === 0xED && preceding === 0x5B) context = 'LD DE,(nn)';
      else if (i > 1 && rom[i - 2] === 0xED && preceding === 0x4B) context = 'LD BC,(nn)';
      else if (i > 1 && rom[i - 2] === 0xED && preceding === 0x53) context = 'LD (nn),DE';
      else if (i > 1 && rom[i - 2] === 0xED && preceding === 0x43) context = 'LD (nn),BC';
      else if (i > 1 && rom[i - 2] === 0xDD && preceding === 0x21) context = 'LD IX,nn';
      else if (i > 1 && rom[i - 2] === 0xFD && preceding === 0x21) context = 'LD IY,nn';
      else context = `prec=${hex(preceding, 2)}`;

      hits.push({ addr: i, context });
    }
  }
  console.log(`  Found ${hits.length} references:`);
  for (const h of hits) {
    // Show surrounding bytes for context
    const start = Math.max(0, h.addr - 4);
    const end = Math.min(rom.length, h.addr + 6);
    console.log(`  ${hex(h.addr)}  [${h.context}]  bytes: ${hexDump(start, end - start)}`);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Search for CALL/JP to a specific address
// ---------------------------------------------------------------------------

function searchCallsTo(target) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Searching for CALL/JP to ${hex(target)}`);
  console.log('='.repeat(70));
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const hits = [];
  for (let i = 0; i < rom.length - 3; i++) {
    const b = rom[i];
    if ((b === 0xCD || b === 0xC3 || b === 0xC4 || b === 0xCC || b === 0xD4 || b === 0xDC ||
         b === 0xE4 || b === 0xEC || b === 0xF4 || b === 0xFC || b === 0xC2 || b === 0xCA ||
         b === 0xD2 || b === 0xDA || b === 0xE2 || b === 0xEA || b === 0xF2 || b === 0xFA) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const opcNames = {
        0xCD: 'CALL', 0xC3: 'JP', 0xC4: 'CALL NZ', 0xCC: 'CALL Z',
        0xD4: 'CALL NC', 0xDC: 'CALL C', 0xE4: 'CALL PO', 0xEC: 'CALL PE',
        0xF4: 'CALL P', 0xFC: 'CALL M',
        0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
        0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M'
      };
      hits.push({ addr: i, opcode: opcNames[b] || hex(b, 2) });
    }
  }
  console.log(`  Found ${hits.length} callers:`);
  for (const h of hits) {
    console.log(`  ${hex(h.addr)}:  ${h.opcode} ${hex(target)}`);
  }
  return hits;
}

// ===========================================================================
// Main analysis
// ===========================================================================

console.log('probe-phase401-decode-02D267.mjs');
console.log('Analyzing function containing 0x02D267 and related addresses');

// 1. Find function boundaries around 0x02D267
const TARGET = 0x02D267;
console.log(`\nTarget address: ${hex(TARGET)}`);
console.log(`Raw bytes at target: ${hexDump(TARGET, 16)}`);

const funcStart = findFunctionStart(TARGET, 256);
if (funcStart) {
  console.log(`\nLikely function start: ${hex(funcStart.addr)} (${funcStart.reason}, ${funcStart.distance} bytes before target)`);
} else {
  console.log('\nCould not find function start within 256 bytes');
}

// 2. Disassemble the broader function area
const disasmStart = funcStart ? funcStart.addr : Math.max(0, TARGET - 128);
const disasmEnd = Math.min(rom.length, TARGET + 96);
disasmRange(disasmStart, disasmEnd, `Function around ${hex(TARGET)}`);

// Also show raw hex of the broader area for manual verification
console.log(`\n--- Raw hex dump around ${hex(TARGET)} ---`);
const rawStart = Math.max(0, TARGET - 32);
for (let row = rawStart; row < TARGET + 64; row += 16) {
  const end = Math.min(rom.length, row + 16);
  console.log(`  ${hex(row)}: ${hexDump(row, end - row)}`);
}

// 3. Search for references to counter 0xD1770A (LE: 0A 17 D1)
// Note: in eZ80 ADL mode, 24-bit addresses are 3 bytes LE
searchROMForRef(0x0A, 0x77, 0xD1, '0xD1770A (counter)');

// 4. Search for callers of the function containing 0x02D267
if (funcStart) {
  searchCallsTo(funcStart.addr);
}

// 5. Disassemble notification function at 0x049CCA
disasmRange(0x049CCA, 0x049CCA + 96, 'Notification function at 0x049CCA');

// Also search for callers of 0x049CCA
searchCallsTo(0x049CCA);

// 6. Show what the key injector 0x0562C2 looks like for cross-reference
disasmRange(0x0562C2, 0x0562C2 + 64, 'Key injector at 0x0562C2 (context)');

// 7. Summary
console.log(`\n${'='.repeat(70)}`);
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Target address: ${hex(TARGET)}`);
if (funcStart) {
  console.log(`Function start: ${hex(funcStart.addr)} (${funcStart.reason})`);
}
console.log('See disassembly above for instruction-level details.');
console.log('Key questions to answer from the output:');
console.log('  1. What function contains 0x02D267? (check disassembly for PUSH/POP frame)');
console.log('  2. What calls this function? (check CALL/JP search results)');
console.log('  3. What is 0xD1770A counting? (check reference sites)');
console.log('  4. What does 0x049CCA do? (check its disassembly)');
console.log('\nDone.');
