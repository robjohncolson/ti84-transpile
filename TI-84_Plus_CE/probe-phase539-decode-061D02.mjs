#!/usr/bin/env node
// Phase 539: Decode 0x061D02 — Error Longjmp Target Region
// Static ROM analysis: hex dump + manual disassembly of error handler entry points
// Known entry points: 0x061D02, 0x061D0E, 0x061D22, 0x061D46

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

// Read ROM
const rom = fs.readFileSync(romPath);

// --- Hex Dump ---
console.log('=== HEX DUMP: 0x061D00 - 0x061D5F (96 bytes) ===\n');

const START = 0x061D00;
const END = 0x061D60;

for (let addr = START; addr < END; addr += 16) {
  const bytes = [];
  const ascii = [];
  for (let i = 0; i < 16; i++) {
    const b = rom[addr + i];
    bytes.push(hexByte(b));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  console.log(`${hex(addr)}: ${bytes.join(' ')}  ${ascii.join('')}`);
}

// --- Extended dump to catch more of the region ---
console.log('\n=== EXTENDED HEX DUMP: 0x061D60 - 0x061DBF (96 bytes) ===\n');

for (let addr = 0x061D60; addr < 0x061DC0; addr += 16) {
  const bytes = [];
  const ascii = [];
  for (let i = 0; i < 16; i++) {
    const b = rom[addr + i];
    bytes.push(hexByte(b));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  console.log(`${hex(addr)}: ${bytes.join(' ')}  ${ascii.join('')}`);
}

// --- eZ80 ADL-mode disassembler (minimal, focused on what we expect) ---

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function disassemble(startAddr, maxBytes) {
  const lines = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;

  while (pc < endAddr) {
    const opcode = rom[pc];
    let mnemonic = '';
    let size = 1;

    switch (opcode) {
      case 0x00: mnemonic = 'NOP'; break;
      case 0x01: mnemonic = `LD BC,${hex(read24(pc + 1))}`; size = 4; break;
      case 0x03: mnemonic = 'INC BC'; break;
      case 0x04: mnemonic = 'INC B'; break;
      case 0x05: mnemonic = 'DEC B'; break;
      case 0x06: mnemonic = `LD B,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x07: mnemonic = 'RLCA'; break;
      case 0x08: mnemonic = "EX AF,AF'"; break;
      case 0x09: mnemonic = 'ADD HL,BC'; break;
      case 0x0A: mnemonic = 'LD A,(BC)'; break;
      case 0x0B: mnemonic = 'DEC BC'; break;
      case 0x0C: mnemonic = 'INC C'; break;
      case 0x0D: mnemonic = 'DEC C'; break;
      case 0x0E: mnemonic = `LD C,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x0F: mnemonic = 'RRCA'; break;
      case 0x10: mnemonic = `DJNZ ${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x11: mnemonic = `LD DE,${hex(read24(pc + 1))}`; size = 4; break;
      case 0x12: mnemonic = 'LD (DE),A'; break;
      case 0x13: mnemonic = 'INC DE'; break;
      case 0x14: mnemonic = 'INC D'; break;
      case 0x15: mnemonic = 'DEC D'; break;
      case 0x16: mnemonic = `LD D,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x17: mnemonic = 'RLA'; break;
      case 0x18: mnemonic = `JR ${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x19: mnemonic = 'ADD HL,DE'; break;
      case 0x1A: mnemonic = 'LD A,(DE)'; break;
      case 0x1B: mnemonic = 'DEC DE'; break;
      case 0x1C: mnemonic = 'INC E'; break;
      case 0x1D: mnemonic = 'DEC E'; break;
      case 0x1E: mnemonic = `LD E,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x1F: mnemonic = 'RRA'; break;
      case 0x20: mnemonic = `JR NZ,${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x21: mnemonic = `LD HL,${hex(read24(pc + 1))}`; size = 4; break;
      case 0x22: mnemonic = `LD (${hex(read24(pc + 1))}),HL`; size = 4; break;
      case 0x23: mnemonic = 'INC HL'; break;
      case 0x24: mnemonic = 'INC H'; break;
      case 0x25: mnemonic = 'DEC H'; break;
      case 0x26: mnemonic = `LD H,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x27: mnemonic = 'DAA'; break;
      case 0x28: mnemonic = `JR Z,${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x29: mnemonic = 'ADD HL,HL'; break;
      case 0x2A: mnemonic = `LD HL,(${hex(read24(pc + 1))})`; size = 4; break;
      case 0x2B: mnemonic = 'DEC HL'; break;
      case 0x2C: mnemonic = 'INC L'; break;
      case 0x2D: mnemonic = 'DEC L'; break;
      case 0x2E: mnemonic = `LD L,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x2F: mnemonic = 'CPL'; break;
      case 0x30: mnemonic = `JR NC,${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x31: mnemonic = `LD SP,${hex(read24(pc + 1))}`; size = 4; break;
      case 0x32: mnemonic = `LD (${hex(read24(pc + 1))}),A`; size = 4; break;
      case 0x33: mnemonic = 'INC SP'; break;
      case 0x34: mnemonic = 'INC (HL)'; break;
      case 0x35: mnemonic = 'DEC (HL)'; break;
      case 0x36: mnemonic = `LD (HL),${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x37: mnemonic = 'SCF'; break;
      case 0x38: mnemonic = `JR C,${hex(pc + 2 + ((rom[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x39: mnemonic = 'ADD HL,SP'; break;
      case 0x3A: mnemonic = `LD A,(${hex(read24(pc + 1))})`; size = 4; break;
      case 0x3B: mnemonic = 'DEC SP'; break;
      case 0x3C: mnemonic = 'INC A'; break;
      case 0x3D: mnemonic = 'DEC A'; break;
      case 0x3E: mnemonic = `LD A,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0x3F: mnemonic = 'CCF'; break;
      // 0x40-0x7F: LD r,r and LD r,(HL) and HALT
      case 0x76: mnemonic = 'HALT'; break;
      case 0x40: mnemonic = 'LD B,B'; break;
      case 0x41: mnemonic = 'LD B,C'; break;
      case 0x42: mnemonic = 'LD B,D'; break;
      case 0x43: mnemonic = 'LD B,E'; break;
      case 0x44: mnemonic = 'LD B,H'; break;
      case 0x45: mnemonic = 'LD B,L'; break;
      case 0x46: mnemonic = 'LD B,(HL)'; break;
      case 0x47: mnemonic = 'LD B,A'; break;
      case 0x48: mnemonic = 'LD C,B'; break;
      case 0x49: mnemonic = 'LD C,C'; break;
      case 0x4A: mnemonic = 'LD C,D'; break;
      case 0x4B: mnemonic = 'LD C,E'; break;
      case 0x4C: mnemonic = 'LD C,H'; break;
      case 0x4D: mnemonic = 'LD C,L'; break;
      case 0x4E: mnemonic = 'LD C,(HL)'; break;
      case 0x4F: mnemonic = 'LD C,A'; break;
      case 0x50: mnemonic = 'LD D,B'; break;
      case 0x51: mnemonic = 'LD D,C'; break;
      case 0x52: mnemonic = 'LD D,D'; break;
      case 0x53: mnemonic = 'LD D,E'; break;
      case 0x54: mnemonic = 'LD D,H'; break;
      case 0x55: mnemonic = 'LD D,L'; break;
      case 0x56: mnemonic = 'LD D,(HL)'; break;
      case 0x57: mnemonic = 'LD D,A'; break;
      case 0x58: mnemonic = 'LD E,B'; break;
      case 0x59: mnemonic = 'LD E,C'; break;
      case 0x5A: mnemonic = 'LD E,D'; break;
      case 0x5B: mnemonic = 'LD E,E'; break;
      case 0x5C: mnemonic = 'LD E,H'; break;
      case 0x5D: mnemonic = 'LD E,L'; break;
      case 0x5E: mnemonic = 'LD E,(HL)'; break;
      case 0x5F: mnemonic = 'LD E,A'; break;
      case 0x60: mnemonic = 'LD H,B'; break;
      case 0x61: mnemonic = 'LD H,C'; break;
      case 0x62: mnemonic = 'LD H,D'; break;
      case 0x63: mnemonic = 'LD H,E'; break;
      case 0x64: mnemonic = 'LD H,H'; break;
      case 0x65: mnemonic = 'LD H,L'; break;
      case 0x66: mnemonic = 'LD H,(HL)'; break;
      case 0x67: mnemonic = 'LD H,A'; break;
      case 0x68: mnemonic = 'LD L,B'; break;
      case 0x69: mnemonic = 'LD L,C'; break;
      case 0x6A: mnemonic = 'LD L,D'; break;
      case 0x6B: mnemonic = 'LD L,E'; break;
      case 0x6C: mnemonic = 'LD L,H'; break;
      case 0x6D: mnemonic = 'LD L,L'; break;
      case 0x6E: mnemonic = 'LD L,(HL)'; break;
      case 0x6F: mnemonic = 'LD L,A'; break;
      case 0x70: mnemonic = 'LD (HL),B'; break;
      case 0x71: mnemonic = 'LD (HL),C'; break;
      case 0x72: mnemonic = 'LD (HL),D'; break;
      case 0x73: mnemonic = 'LD (HL),E'; break;
      case 0x74: mnemonic = 'LD (HL),H'; break;
      case 0x75: mnemonic = 'LD (HL),L'; break;
      case 0x77: mnemonic = 'LD (HL),A'; break;
      case 0x78: mnemonic = 'LD A,B'; break;
      case 0x79: mnemonic = 'LD A,C'; break;
      case 0x7A: mnemonic = 'LD A,D'; break;
      case 0x7B: mnemonic = 'LD A,E'; break;
      case 0x7C: mnemonic = 'LD A,H'; break;
      case 0x7D: mnemonic = 'LD A,L'; break;
      case 0x7E: mnemonic = 'LD A,(HL)'; break;
      case 0x7F: mnemonic = 'LD A,A'; break;
      // ALU group
      case 0x80: mnemonic = 'ADD A,B'; break;
      case 0x81: mnemonic = 'ADD A,C'; break;
      case 0x82: mnemonic = 'ADD A,D'; break;
      case 0x83: mnemonic = 'ADD A,E'; break;
      case 0x84: mnemonic = 'ADD A,H'; break;
      case 0x85: mnemonic = 'ADD A,L'; break;
      case 0x86: mnemonic = 'ADD A,(HL)'; break;
      case 0x87: mnemonic = 'ADD A,A'; break;
      case 0x88: mnemonic = 'ADC A,B'; break;
      case 0x89: mnemonic = 'ADC A,C'; break;
      case 0x8A: mnemonic = 'ADC A,D'; break;
      case 0x8B: mnemonic = 'ADC A,E'; break;
      case 0x8C: mnemonic = 'ADC A,H'; break;
      case 0x8D: mnemonic = 'ADC A,L'; break;
      case 0x8E: mnemonic = 'ADC A,(HL)'; break;
      case 0x8F: mnemonic = 'ADC A,A'; break;
      case 0x90: mnemonic = 'SUB B'; break;
      case 0x91: mnemonic = 'SUB C'; break;
      case 0x92: mnemonic = 'SUB D'; break;
      case 0x93: mnemonic = 'SUB E'; break;
      case 0x94: mnemonic = 'SUB H'; break;
      case 0x95: mnemonic = 'SUB L'; break;
      case 0x96: mnemonic = 'SUB (HL)'; break;
      case 0x97: mnemonic = 'SUB A'; break;
      case 0x98: mnemonic = 'SBC A,B'; break;
      case 0x99: mnemonic = 'SBC A,C'; break;
      case 0x9A: mnemonic = 'SBC A,D'; break;
      case 0x9B: mnemonic = 'SBC A,E'; break;
      case 0x9C: mnemonic = 'SBC A,H'; break;
      case 0x9D: mnemonic = 'SBC A,L'; break;
      case 0x9E: mnemonic = 'SBC A,(HL)'; break;
      case 0x9F: mnemonic = 'SBC A,A'; break;
      case 0xA0: mnemonic = 'AND B'; break;
      case 0xA1: mnemonic = 'AND C'; break;
      case 0xA2: mnemonic = 'AND D'; break;
      case 0xA3: mnemonic = 'AND E'; break;
      case 0xA4: mnemonic = 'AND H'; break;
      case 0xA5: mnemonic = 'AND L'; break;
      case 0xA6: mnemonic = 'AND (HL)'; break;
      case 0xA7: mnemonic = 'AND A'; break;
      case 0xA8: mnemonic = 'XOR B'; break;
      case 0xA9: mnemonic = 'XOR C'; break;
      case 0xAA: mnemonic = 'XOR D'; break;
      case 0xAB: mnemonic = 'XOR E'; break;
      case 0xAC: mnemonic = 'XOR H'; break;
      case 0xAD: mnemonic = 'XOR L'; break;
      case 0xAE: mnemonic = 'XOR (HL)'; break;
      case 0xAF: mnemonic = 'XOR A'; break;
      case 0xB0: mnemonic = 'OR B'; break;
      case 0xB1: mnemonic = 'OR C'; break;
      case 0xB2: mnemonic = 'OR D'; break;
      case 0xB3: mnemonic = 'OR E'; break;
      case 0xB4: mnemonic = 'OR H'; break;
      case 0xB5: mnemonic = 'OR L'; break;
      case 0xB6: mnemonic = 'OR (HL)'; break;
      case 0xB7: mnemonic = 'OR A'; break;
      case 0xB8: mnemonic = 'CP B'; break;
      case 0xB9: mnemonic = 'CP C'; break;
      case 0xBA: mnemonic = 'CP D'; break;
      case 0xBB: mnemonic = 'CP E'; break;
      case 0xBC: mnemonic = 'CP H'; break;
      case 0xBD: mnemonic = 'CP L'; break;
      case 0xBE: mnemonic = 'CP (HL)'; break;
      case 0xBF: mnemonic = 'CP A'; break;
      // Control
      case 0xC0: mnemonic = 'RET NZ'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xC2: mnemonic = `JP NZ,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xC3: mnemonic = `JP ${hex(read24(pc + 1))}`; size = 4; break;
      case 0xC4: mnemonic = `CALL NZ,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xC6: mnemonic = `ADD A,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xC7: mnemonic = 'RST 00h'; break;
      case 0xC8: mnemonic = 'RET Z'; break;
      case 0xC9: mnemonic = 'RET'; break;
      case 0xCA: mnemonic = `JP Z,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xCC: mnemonic = `CALL Z,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xCD: mnemonic = `CALL ${hex(read24(pc + 1))}`; size = 4; break;
      case 0xCE: mnemonic = `ADC A,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xCF: mnemonic = 'RST 08h'; break;
      case 0xD0: mnemonic = 'RET NC'; break;
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xD2: mnemonic = `JP NC,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xD3: mnemonic = `OUT (${hexByte(rom[pc + 1])}),A`; size = 2; break;
      case 0xD4: mnemonic = `CALL NC,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xD6: mnemonic = `SUB ${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xD7: mnemonic = 'RST 10h'; break;
      case 0xD8: mnemonic = 'RET C'; break;
      case 0xD9: mnemonic = 'EXX'; break;
      case 0xDA: mnemonic = `JP C,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xDB: mnemonic = `IN A,(${hexByte(rom[pc + 1])})`; size = 2; break;
      case 0xDC: mnemonic = `CALL C,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xDE: mnemonic = `SBC A,${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xDF: mnemonic = 'RST 18h'; break;
      case 0xE0: mnemonic = 'RET PO'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xE2: mnemonic = `JP PO,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xE3: mnemonic = 'EX (SP),HL'; break;
      case 0xE4: mnemonic = `CALL PO,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xE6: mnemonic = `AND ${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xE7: mnemonic = 'RST 20h'; break;
      case 0xE8: mnemonic = 'RET PE'; break;
      case 0xE9: mnemonic = 'JP (HL)'; break;
      case 0xEA: mnemonic = `JP PE,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xEB: mnemonic = 'EX DE,HL'; break;
      case 0xEC: mnemonic = `CALL PE,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xEE: mnemonic = `XOR ${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xEF: mnemonic = 'RST 28h'; break;
      case 0xF0: mnemonic = 'RET P'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      case 0xF2: mnemonic = `JP P,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xF3: mnemonic = 'DI'; break;
      case 0xF4: mnemonic = `CALL P,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xF6: mnemonic = `OR ${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xF7: mnemonic = 'RST 30h'; break;
      case 0xF8: mnemonic = 'RET M'; break;
      case 0xF9: mnemonic = 'LD SP,HL'; break;
      case 0xFA: mnemonic = `JP M,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xFB: mnemonic = 'EI'; break;
      case 0xFC: mnemonic = `CALL M,${hex(read24(pc + 1))}`; size = 4; break;
      case 0xFE: mnemonic = `CP ${hexByte(rom[pc + 1])}`; size = 2; break;
      case 0xFF: mnemonic = 'RST 38h'; break;

      // DD prefix (IX)
      case 0xDD: {
        const op2 = rom[pc + 1];
        if (op2 === 0x21) { mnemonic = `LD IX,${hex(read24(pc + 2))}`; size = 5; }
        else if (op2 === 0x22) { mnemonic = `LD (${hex(read24(pc + 2))}),IX`; size = 5; }
        else if (op2 === 0x2A) { mnemonic = `LD IX,(${hex(read24(pc + 2))})`; size = 5; }
        else if (op2 === 0xE1) { mnemonic = 'POP IX'; size = 2; }
        else if (op2 === 0xE5) { mnemonic = 'PUSH IX'; size = 2; }
        else if (op2 === 0xE9) { mnemonic = 'JP (IX)'; size = 2; }
        else if (op2 === 0x36) { mnemonic = `LD (IX+${hexByte(rom[pc + 2])}),${hexByte(rom[pc + 3])}`; size = 4; }
        else if (op2 === 0x7E) { mnemonic = `LD A,(IX+${hexByte(rom[pc + 2])})`; size = 3; }
        else if (op2 === 0x77) { mnemonic = `LD (IX+${hexByte(rom[pc + 2])}),A`; size = 3; }
        else { mnemonic = `DD ${hexByte(op2)}`; size = 2; }
        break;
      }

      // FD prefix (IY)
      case 0xFD: {
        const op2 = rom[pc + 1];
        if (op2 === 0x21) { mnemonic = `LD IY,${hex(read24(pc + 2))}`; size = 5; }
        else if (op2 === 0x22) { mnemonic = `LD (${hex(read24(pc + 2))}),IY`; size = 5; }
        else if (op2 === 0x2A) { mnemonic = `LD IY,(${hex(read24(pc + 2))})`; size = 5; }
        else if (op2 === 0xE1) { mnemonic = 'POP IY'; size = 2; }
        else if (op2 === 0xE5) { mnemonic = 'PUSH IY'; size = 2; }
        else if (op2 === 0xE9) { mnemonic = 'JP (IY)'; size = 2; }
        else if (op2 === 0x36) { mnemonic = `LD (IY+${hexByte(rom[pc + 2])}),${hexByte(rom[pc + 3])}`; size = 4; }
        else if (op2 === 0x7E) { mnemonic = `LD A,(IY+${hexByte(rom[pc + 2])})`; size = 3; }
        else if (op2 === 0x77) { mnemonic = `LD (IY+${hexByte(rom[pc + 2])}),A`; size = 3; }
        else if (op2 === 0xCB) {
          const d = rom[pc + 2];
          const op3 = rom[pc + 3];
          const bitNum = (op3 >> 3) & 7;
          if ((op3 & 0xC7) === 0x46) { mnemonic = `BIT ${bitNum},(IY+${hexByte(d)})`; size = 4; }
          else if ((op3 & 0xC7) === 0xC6) { mnemonic = `SET ${bitNum},(IY+${hexByte(d)})`; size = 4; }
          else if ((op3 & 0xC7) === 0x86) { mnemonic = `RES ${bitNum},(IY+${hexByte(d)})`; size = 4; }
          else { mnemonic = `FD CB ${hexByte(d)} ${hexByte(op3)}`; size = 4; }
        }
        else { mnemonic = `FD ${hexByte(op2)}`; size = 2; }
        break;
      }

      // ED prefix
      case 0xED: {
        const op2 = rom[pc + 1];
        if (op2 === 0x43) { mnemonic = `LD (${hex(read24(pc + 2))}),BC`; size = 5; }
        else if (op2 === 0x4B) { mnemonic = `LD BC,(${hex(read24(pc + 2))})`; size = 5; }
        else if (op2 === 0x53) { mnemonic = `LD (${hex(read24(pc + 2))}),DE`; size = 5; }
        else if (op2 === 0x5B) { mnemonic = `LD DE,(${hex(read24(pc + 2))})`; size = 5; }
        else if (op2 === 0x63) { mnemonic = `LD (${hex(read24(pc + 2))}),HL`; size = 5; }  // ED 63 variant
        else if (op2 === 0x6B) { mnemonic = `LD HL,(${hex(read24(pc + 2))})`; size = 5; }  // ED 6B variant
        else if (op2 === 0x73) { mnemonic = `LD (${hex(read24(pc + 2))}),SP`; size = 5; }
        else if (op2 === 0x7B) { mnemonic = `LD SP,(${hex(read24(pc + 2))})`; size = 5; }
        else if (op2 === 0xB0) { mnemonic = 'LDIR'; size = 2; }
        else if (op2 === 0xB8) { mnemonic = 'LDDR'; size = 2; }
        else if (op2 === 0xB1) { mnemonic = 'CPIR'; size = 2; }
        else if (op2 === 0xB9) { mnemonic = 'CPDR'; size = 2; }
        else if (op2 === 0x44) { mnemonic = 'NEG'; size = 2; }
        else if (op2 === 0x4D) { mnemonic = 'RETI'; size = 2; }
        else if (op2 === 0x45) { mnemonic = 'RETN'; size = 2; }
        else if (op2 === 0x46) { mnemonic = 'IM 0'; size = 2; }
        else if (op2 === 0x56) { mnemonic = 'IM 1'; size = 2; }
        else if (op2 === 0x5E) { mnemonic = 'IM 2'; size = 2; }
        else if (op2 === 0x47) { mnemonic = 'LD I,A'; size = 2; }
        else if (op2 === 0x57) { mnemonic = 'LD A,I'; size = 2; }
        else if (op2 === 0x6F) { mnemonic = 'RLD'; size = 2; }
        else if (op2 === 0x67) { mnemonic = 'RRD'; size = 2; }
        else if (op2 === 0x42) { mnemonic = 'SBC HL,BC'; size = 2; }
        else if (op2 === 0x52) { mnemonic = 'SBC HL,DE'; size = 2; }
        else if (op2 === 0x62) { mnemonic = 'SBC HL,HL'; size = 2; }
        else if (op2 === 0x72) { mnemonic = 'SBC HL,SP'; size = 2; }
        else if (op2 === 0x4A) { mnemonic = 'ADC HL,BC'; size = 2; }
        else if (op2 === 0x5A) { mnemonic = 'ADC HL,DE'; size = 2; }
        else if (op2 === 0x6A) { mnemonic = 'ADC HL,HL'; size = 2; }
        else if (op2 === 0x7A) { mnemonic = 'ADC HL,SP'; size = 2; }
        else { mnemonic = `ED ${hexByte(op2)}`; size = 2; }
        break;
      }

      // CB prefix (bit ops)
      case 0xCB: {
        const op2 = rom[pc + 1];
        const bitNum = (op2 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const reg = regNames[op2 & 7];
        if ((op2 & 0xC0) === 0x40) { mnemonic = `BIT ${bitNum},${reg}`; size = 2; }
        else if ((op2 & 0xC0) === 0xC0) { mnemonic = `SET ${bitNum},${reg}`; size = 2; }
        else if ((op2 & 0xC0) === 0x80) { mnemonic = `RES ${bitNum},${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x00) { mnemonic = `RLC ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x08) { mnemonic = `RRC ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x10) { mnemonic = `RL ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x18) { mnemonic = `RR ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x20) { mnemonic = `SLA ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x28) { mnemonic = `SRA ${reg}`; size = 2; }
        else if ((op2 & 0xF8) === 0x38) { mnemonic = `SRL ${reg}`; size = 2; }
        else { mnemonic = `CB ${hexByte(op2)}`; size = 2; }
        break;
      }

      default:
        mnemonic = `DB ${hexByte(opcode)}`;
        break;
    }

    const rawBytes = [];
    for (let i = 0; i < size; i++) {
      rawBytes.push(hexByte(rom[pc + i]));
    }

    lines.push({
      addr: pc,
      text: `${hex(pc)}: ${rawBytes.join(' ').padEnd(15)} ${mnemonic}`
    });

    // Stop at unconditional JP, RET, or after 30 instructions
    if (lines.length >= 30) break;
    if (opcode === 0xC9 || opcode === 0xC3 || opcode === 0xE9) break;
    // Also stop at RST
    if ([0xC7, 0xCF, 0xD7, 0xDF, 0xE7, 0xEF, 0xF7, 0xFF].includes(opcode)) break;

    pc += size;
  }

  return lines;
}

// --- Disassemble each known entry point ---
const entryPoints = [
  { addr: 0x061D02, label: '0x061D02 — Overflow longjmp (from 0x07FE20, 0x07CA73)' },
  { addr: 0x061D0E, label: '0x061D0E — Validation guard target (from 0x080173)' },
  { addr: 0x061D22, label: '0x061D22 — From 0x07FF59' },
  { addr: 0x061D46, label: '0x061D46 — From session 519' },
];

for (const ep of entryPoints) {
  console.log(`\n=== DISASSEMBLY: ${ep.label} ===\n`);
  const lines = disassemble(ep.addr, 64);
  for (const l of lines) {
    console.log(l.text);
  }
}

// --- Scan the wider region for LD A,imm patterns (error code loading) ---
console.log('\n=== ERROR CODE PATTERN SCAN (0x061D00 - 0x061DBF) ===\n');
console.log('Scanning for LD A,imm8 (3E xx) followed by JP/CALL...\n');

for (let addr = 0x061D00; addr < 0x061DC0 - 1; addr++) {
  if (rom[addr] === 0x3E) {
    const errorCode = rom[addr + 1];
    const nextOp = rom[addr + 2];
    let nextInstr = '';
    if (nextOp === 0xC3) {
      nextInstr = `JP ${hex(read24(addr + 3))}`;
    } else if (nextOp === 0xCD) {
      nextInstr = `CALL ${hex(read24(addr + 3))}`;
    } else if (nextOp === 0x18) {
      nextInstr = `JR ${hex(addr + 4 + ((rom[addr + 3] << 24) >> 24))}`;
    } else {
      nextInstr = `next: ${hexByte(nextOp)}`;
    }
    console.log(`  ${hex(addr)}: LD A,${hexByte(errorCode)}  -> ${nextInstr}`);
  }
}

// --- Scan for JP targets in the region ---
console.log('\n=== JP/CALL TARGETS FROM THIS REGION ===\n');

for (let addr = 0x061D00; addr < 0x061DC0 - 3; addr++) {
  const op = rom[addr];
  if (op === 0xC3 || op === 0xCD || op === 0xC2 || op === 0xCA ||
      op === 0xD2 || op === 0xDA || op === 0xC4 || op === 0xCC ||
      op === 0xD4 || op === 0xDC) {
    const target = read24(addr + 1);
    if (target >= 0x000000 && target <= 0x3FFFFF) {
      const type = op === 0xC3 ? 'JP' : op === 0xCD ? 'CALL' :
                   op === 0xC2 ? 'JP NZ' : op === 0xCA ? 'JP Z' :
                   op === 0xD2 ? 'JP NC' : op === 0xDA ? 'JP C' :
                   op === 0xC4 ? 'CALL NZ' : op === 0xCC ? 'CALL Z' :
                   op === 0xD4 ? 'CALL NC' : 'CALL C';
      console.log(`  ${hex(addr)}: ${type} ${hex(target)}`);
    }
  }
}

// --- Look for xrefs INTO this region from the wider ROM ---
console.log('\n=== XREFS INTO 0x061D00-0x061DBF (scanning 0x060000-0x090000) ===\n');

const xrefs = [];
for (let addr = 0x060000; addr < 0x090000 - 3; addr++) {
  const op = rom[addr];
  if (op === 0xC3 || op === 0xCD || op === 0xC2 || op === 0xCA ||
      op === 0xD2 || op === 0xDA || op === 0xC4 || op === 0xCC ||
      op === 0xD4 || op === 0xDC) {
    const target = read24(addr + 1);
    if (target >= 0x061D00 && target < 0x061DC0) {
      const type = op === 0xC3 ? 'JP' : op === 0xCD ? 'CALL' :
                   op === 0xC2 ? 'JP NZ' : op === 0xCA ? 'JP Z' :
                   op === 0xD2 ? 'JP NC' : op === 0xDA ? 'JP C' :
                   op === 0xC4 ? 'CALL NZ' : op === 0xCC ? 'CALL Z' :
                   op === 0xD4 ? 'CALL NC' : 'CALL C';
      xrefs.push({ from: addr, type, target });
    }
  }
}

// Sort by target address
xrefs.sort((a, b) => a.target - b.target || a.from - b.from);
for (const x of xrefs) {
  console.log(`  ${hex(x.from)}: ${x.type} ${hex(x.target)}`);
}
console.log(`\nTotal xrefs: ${xrefs.length}`);

// --- Summary ---
console.log('\n=== ENTRY POINT SUMMARY ===\n');

const entryTargets = new Map();
for (const x of xrefs) {
  const key = x.target;
  if (!entryTargets.has(key)) {
    entryTargets.set(key, []);
  }
  entryTargets.get(key).push(x);
}

for (const [target, refs] of [...entryTargets.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${hex(target)}: ${refs.length} xref(s) from ${refs.map(r => hex(r.from)).join(', ')}`);
}

console.log('\nDone.');
