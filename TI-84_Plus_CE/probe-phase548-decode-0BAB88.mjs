/**
 * probe-phase548-decode-0BAB88.mjs
 *
 * Decode the function at 0x0BAB88 — a graph/app caller of the type string
 * dispatcher 0x03EC5A. Also decode sibling 0x0BABF2, search for xrefs,
 * and map the character parsing loop.
 *
 * SIS (0x40) prefix handling: In ADL mode, 0x40 before CALL/JP/LD rr,nn
 * means "short immediate" (16-bit instead of 24-bit). We detect this
 * contextually: if 0x40 is followed by CD/C3/21/22/2A, treat as SIS.
 */
import { readFileSync } from 'fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const rom = readFileSync(ROM_PATH);

function hex2(value) {
  return value.toString(16).padStart(2, '0');
}

function hex4(value) {
  return '0x' + value.toString(16).padStart(4, '0');
}

function hex6(value) {
  return '0x' + value.toString(16).padStart(6, '0');
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signed8(value) {
  return value > 127 ? value - 256 : value;
}

function hexDump(start, len) {
  console.log(`\nHex dump ${hex6(start)} - ${hex6(start + len - 1)} (${len} bytes):`);
  for (let i = 0; i < len; i += 16) {
    const addr = start + i;
    const bytes = [];
    const ascii = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      const b = rom[addr + j];
      bytes.push(hex2(b));
      ascii.push(b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.');
    }
    console.log(`  ${hex6(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

// SIS-prefix-aware targets
const SIS_TARGETS = new Set([0xCD, 0xC3, 0x21, 0x22, 0x2A, 0xC2, 0xCA, 0xD2, 0xDA, 0xC4, 0xCC, 0xD4, 0xDC]);

function isSISPrefix(addr) {
  return rom[addr] === 0x40 && SIS_TARGETS.has(rom[addr + 1]);
}

function decodeOne(pc) {
  const op = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];
  const rawBytes = (len) => Array.from(rom.slice(pc, pc + len), b => hex2(b)).join(' ');

  // SIS prefix (0x40) — must check before LD B,B
  if (op === 0x40 && SIS_TARGETS.has(b1)) {
    const imm16 = read16(pc + 2);
    if (b1 === 0xCD) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS CALL ${hex4(imm16)}` };
    if (b1 === 0xC3) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS JP ${hex4(imm16)}` };
    if (b1 === 0x21) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS LD HL,${hex4(imm16)}` };
    if (b1 === 0x22) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS LD (${hex4(imm16)}),HL` };
    if (b1 === 0x2A) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS LD HL,(${hex4(imm16)})` };
    if (b1 === 0xC2) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS JP NZ,${hex4(imm16)}` };
    if (b1 === 0xCA) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS JP Z,${hex4(imm16)}` };
    if (b1 === 0xC4) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS CALL NZ,${hex4(imm16)}` };
    if (b1 === 0xCC) return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS CALL Z,${hex4(imm16)}` };
    return { len: 4, text: `${rawBytes(4).padEnd(16)} SIS ?? ${hex2(b1)} ${hex4(imm16)}` };
  }

  // ED prefix
  if (op === 0xED) {
    if (b1 === 0x27) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD HL,(HL)  ; eZ80 24-bit indirect` };
    if (b1 === 0xB0) return { len: 2, text: `${rawBytes(2).padEnd(16)} LDIR` };
    if (b1 === 0xB8) return { len: 2, text: `${rawBytes(2).padEnd(16)} LDDR` };
    if (b1 === 0xA0) return { len: 2, text: `${rawBytes(2).padEnd(16)} LDI` };
    if (b1 === 0xA8) return { len: 2, text: `${rawBytes(2).padEnd(16)} LDD` };
    if (b1 === 0x44) return { len: 2, text: `${rawBytes(2).padEnd(16)} NEG` };
    if (b1 === 0x45) return { len: 2, text: `${rawBytes(2).padEnd(16)} RETN` };
    if (b1 === 0x4D) return { len: 2, text: `${rawBytes(2).padEnd(16)} RETI` };
    if (b1 === 0x4F) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD R,A` };
    if (b1 === 0x5F) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD A,R` };
    if (b1 === 0x47) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD I,A` };
    if (b1 === 0x57) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD A,I` };
    if (b1 === 0x42) return { len: 2, text: `${rawBytes(2).padEnd(16)} SBC HL,BC` };
    if (b1 === 0x52) return { len: 2, text: `${rawBytes(2).padEnd(16)} SBC HL,DE` };
    if (b1 === 0x62) return { len: 2, text: `${rawBytes(2).padEnd(16)} SBC HL,HL` };
    if (b1 === 0x72) return { len: 2, text: `${rawBytes(2).padEnd(16)} SBC HL,SP` };
    if (b1 === 0x4A) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADC HL,BC` };
    if (b1 === 0x5A) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADC HL,DE` };
    if (b1 === 0x43) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD (${hex6(read24(pc + 2))}),BC` };
    if (b1 === 0x53) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD (${hex6(read24(pc + 2))}),DE` };
    if (b1 === 0x63) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD (${hex6(read24(pc + 2))}),HL` };
    if (b1 === 0x73) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD (${hex6(read24(pc + 2))}),SP` };
    if (b1 === 0x4B) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD BC,(${hex6(read24(pc + 2))})` };
    if (b1 === 0x5B) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD DE,(${hex6(read24(pc + 2))})` };
    if (b1 === 0x6B) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD HL,(${hex6(read24(pc + 2))})` };
    if (b1 === 0x7B) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD SP,(${hex6(read24(pc + 2))})` };
    return { len: 2, text: `${rawBytes(2).padEnd(16)} ED ${hex2(b1)}` };
  }

  // DD prefix (IX)
  if (op === 0xDD) {
    if (b1 === 0xE5) return { len: 2, text: `${rawBytes(2).padEnd(16)} PUSH IX` };
    if (b1 === 0xE1) return { len: 2, text: `${rawBytes(2).padEnd(16)} POP IX` };
    if (b1 === 0x21) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD IX,${hex6(read24(pc + 2))}` };
    if (b1 === 0xE9) return { len: 2, text: `${rawBytes(2).padEnd(16)} JP (IX)` };
    if (b1 === 0x22) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD (${hex6(read24(pc + 2))}),IX` };
    if (b1 === 0x2A) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD IX,(${hex6(read24(pc + 2))})` };
    // IX+d loads/stores
    const ixdRegs = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
    if (ixdRegs[b1]) return { len: 3, text: `${rawBytes(3).padEnd(16)} LD ${ixdRegs[b1]},(IX+${signed8(b2)})` };
    if (b1 >= 0x70 && b1 <= 0x77) {
      const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      return { len: 3, text: `${rawBytes(3).padEnd(16)} LD (IX+${signed8(b2)}),${r}` };
    }
    if (b1 === 0x36) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD (IX+${signed8(b2)}),${hex2(b3)}` };
    if (b1 === 0x23) return { len: 2, text: `${rawBytes(2).padEnd(16)} INC IX` };
    if (b1 === 0x2B) return { len: 2, text: `${rawBytes(2).padEnd(16)} DEC IX` };
    if (b1 === 0xBE) return { len: 3, text: `${rawBytes(3).padEnd(16)} CP (IX+${signed8(b2)})` };
    if (b1 === 0x86) return { len: 3, text: `${rawBytes(3).padEnd(16)} ADD A,(IX+${signed8(b2)})` };
    if (b1 === 0x96) return { len: 3, text: `${rawBytes(3).padEnd(16)} SUB (IX+${signed8(b2)})` };
    if (b1 === 0xA6) return { len: 3, text: `${rawBytes(3).padEnd(16)} AND (IX+${signed8(b2)})` };
    if (b1 === 0xB6) return { len: 3, text: `${rawBytes(3).padEnd(16)} OR (IX+${signed8(b2)})` };
    if (b1 === 0x34) return { len: 3, text: `${rawBytes(3).padEnd(16)} INC (IX+${signed8(b2)})` };
    if (b1 === 0x35) return { len: 3, text: `${rawBytes(3).padEnd(16)} DEC (IX+${signed8(b2)})` };
    if (b1 === 0x09) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADD IX,BC` };
    if (b1 === 0x19) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADD IX,DE` };
    if (b1 === 0x29) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADD IX,IX` };
    if (b1 === 0x39) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADD IX,SP` };
    return { len: 2, text: `${rawBytes(2).padEnd(16)} DD ${hex2(b1)}` };
  }

  // FD prefix (IY)
  if (op === 0xFD) {
    if (b1 === 0xE5) return { len: 2, text: `${rawBytes(2).padEnd(16)} PUSH IY` };
    if (b1 === 0xE1) return { len: 2, text: `${rawBytes(2).padEnd(16)} POP IY` };
    if (b1 === 0x21) return { len: 5, text: `${rawBytes(5).padEnd(16)} LD IY,${hex6(read24(pc + 2))}` };
    const iydRegs = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
    if (iydRegs[b1]) return { len: 3, text: `${rawBytes(3).padEnd(16)} LD ${iydRegs[b1]},(IY+${signed8(b2)})` };
    if (b1 === 0x77) return { len: 3, text: `${rawBytes(3).padEnd(16)} LD (IY+${signed8(b2)}),A` };
    if (b1 === 0xBE) return { len: 3, text: `${rawBytes(3).padEnd(16)} CP (IY+${signed8(b2)})` };
    if (b1 === 0xB6) return { len: 3, text: `${rawBytes(3).padEnd(16)} OR (IY+${signed8(b2)})` };
    if (b1 === 0xA6) return { len: 3, text: `${rawBytes(3).padEnd(16)} AND (IY+${signed8(b2)})` };
    if (b1 === 0xCB) {
      const b4 = rom[pc + 3];
      if ((b4 & 0xC0) === 0x40) return { len: 4, text: `${rawBytes(4).padEnd(16)} BIT ${(b4 >> 3) & 7},(IY+${signed8(b2)})` };
      if ((b4 & 0xC0) === 0xC0) return { len: 4, text: `${rawBytes(4).padEnd(16)} SET ${(b4 >> 3) & 7},(IY+${signed8(b2)})` };
      if ((b4 & 0xC0) === 0x80) return { len: 4, text: `${rawBytes(4).padEnd(16)} RES ${(b4 >> 3) & 7},(IY+${signed8(b2)})` };
      return { len: 4, text: `${rawBytes(4).padEnd(16)} FD CB ${hex2(b2)} ${hex2(b4)}` };
    }
    return { len: 2, text: `${rawBytes(2).padEnd(16)} FD ${hex2(b1)}` };
  }

  // CB prefix (bit ops)
  if (op === 0xCB) {
    const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
    const bit = (b1 >> 3) & 7;
    if ((b1 & 0xC0) === 0x40) return { len: 2, text: `${rawBytes(2).padEnd(16)} BIT ${bit},${r}` };
    if ((b1 & 0xC0) === 0xC0) return { len: 2, text: `${rawBytes(2).padEnd(16)} SET ${bit},${r}` };
    if ((b1 & 0xC0) === 0x80) return { len: 2, text: `${rawBytes(2).padEnd(16)} RES ${bit},${r}` };
    const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
    return { len: 2, text: `${rawBytes(2).padEnd(16)} ${ops[bit]} ${r}` };
  }

  // Single-byte
  const singles = {
    0x00: 'NOP', 0xC9: 'RET', 0xF5: 'PUSH AF', 0xE5: 'PUSH HL',
    0xD5: 'PUSH DE', 0xC5: 'PUSH BC', 0xF1: 'POP AF', 0xE1: 'POP HL',
    0xD1: 'POP DE', 0xC1: 'POP BC', 0x23: 'INC HL', 0x2B: 'DEC HL',
    0x03: 'INC BC', 0x13: 'INC DE', 0x0B: 'DEC BC', 0x1B: 'DEC DE',
    0x3C: 'INC A', 0x3D: 'DEC A', 0x04: 'INC B', 0x05: 'DEC B',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x14: 'INC D', 0x15: 'DEC D',
    0x1C: 'INC E', 0x1D: 'DEC E', 0x24: 'INC H', 0x25: 'DEC H',
    0x2C: 'INC L', 0x2D: 'DEC L', 0x34: 'INC (HL)', 0x35: 'DEC (HL)',
    0x46: 'LD B,(HL)', 0x4E: 'LD C,(HL)', 0x56: 'LD D,(HL)',
    0x5E: 'LD E,(HL)', 0x66: 'LD H,(HL)', 0x6E: 'LD L,(HL)',
    0x7E: 'LD A,(HL)', 0x70: 'LD (HL),B', 0x71: 'LD (HL),C',
    0x72: 'LD (HL),D', 0x73: 'LD (HL),E', 0x74: 'LD (HL),H',
    0x75: 'LD (HL),L', 0x77: 'LD (HL),A',
    0x78: 'LD A,B', 0x79: 'LD A,C', 0x7A: 'LD A,D', 0x7B: 'LD A,E',
    0x7C: 'LD A,H', 0x7D: 'LD A,L', 0x7F: 'LD A,A',
    0x40: 'LD B,B', 0x41: 'LD B,C', 0x42: 'LD B,D', 0x43: 'LD B,E',
    0x44: 'LD B,H', 0x45: 'LD B,L', 0x47: 'LD B,A',
    0x48: 'LD C,B', 0x49: 'LD C,C', 0x4A: 'LD C,D', 0x4B: 'LD C,E',
    0x4C: 'LD C,H', 0x4D: 'LD C,L', 0x4F: 'LD C,A',
    0x50: 'LD D,B', 0x51: 'LD D,C', 0x52: 'LD D,D', 0x53: 'LD D,E',
    0x54: 'LD D,H', 0x55: 'LD D,L', 0x57: 'LD D,A',
    0x58: 'LD E,B', 0x59: 'LD E,C', 0x5A: 'LD E,D', 0x5B: 'LD E,E',
    0x5C: 'LD E,H', 0x5D: 'LD E,L', 0x5F: 'LD E,A',
    0x60: 'LD H,B', 0x61: 'LD H,C', 0x62: 'LD H,D', 0x63: 'LD H,E',
    0x64: 'LD H,H', 0x65: 'LD H,L', 0x67: 'LD H,A',
    0x68: 'LD L,B', 0x69: 'LD L,C', 0x6A: 'LD L,D', 0x6B: 'LD L,E',
    0x6C: 'LD L,H', 0x6D: 'LD L,L', 0x6F: 'LD L,A',
    0xA7: 'AND A', 0xAF: 'XOR A', 0xB7: 'OR A',
    0xA0: 'AND B', 0xA1: 'AND C', 0xA2: 'AND D', 0xA3: 'AND E',
    0xB0: 'OR B', 0xB1: 'OR C', 0xB2: 'OR D', 0xB3: 'OR E',
    0xB4: 'OR H', 0xB5: 'OR L',
    0xA8: 'XOR B', 0xA9: 'XOR C', 0xAA: 'XOR D', 0xAB: 'XOR E',
    0xB8: 'CP B', 0xB9: 'CP C', 0xBA: 'CP D', 0xBB: 'CP E',
    0xBC: 'CP H', 0xBD: 'CP L', 0xBF: 'CP A',
    0xD9: 'EXX', 0x08: "EX AF,AF'", 0xEB: 'EX DE,HL',
    0x37: 'SCF', 0x3F: 'CCF', 0x76: 'HALT',
    0x80: 'ADD A,B', 0x81: 'ADD A,C', 0x82: 'ADD A,D', 0x83: 'ADD A,E',
    0x84: 'ADD A,H', 0x85: 'ADD A,L', 0x86: 'ADD A,(HL)', 0x87: 'ADD A,A',
    0x88: 'ADC A,B', 0x89: 'ADC A,C', 0x8A: 'ADC A,D', 0x8B: 'ADC A,E',
    0x8C: 'ADC A,H', 0x8D: 'ADC A,L', 0x8E: 'ADC A,(HL)', 0x8F: 'ADC A,A',
    0x90: 'SUB B', 0x91: 'SUB C', 0x92: 'SUB D', 0x93: 'SUB E',
    0x94: 'SUB H', 0x95: 'SUB L', 0x96: 'SUB (HL)', 0x97: 'SUB A',
    0x98: 'SBC A,B', 0x99: 'SBC A,C',
    0x17: 'RLA', 0x1F: 'RRA', 0x07: 'RLCA', 0x0F: 'RRCA',
    0x27: 'DAA', 0x2F: 'CPL',
    0xE3: 'EX (SP),HL', 0xE9: 'JP (HL)', 0xF9: 'LD SP,HL',
    0xF3: 'DI', 0xFB: 'EI',
    0x02: 'LD (BC),A', 0x12: 'LD (DE),A',
    0x0A: 'LD A,(BC)', 0x1A: 'LD A,(DE)',
    0x09: 'ADD HL,BC', 0x19: 'ADD HL,DE', 0x29: 'ADD HL,HL', 0x39: 'ADD HL,SP',
    0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C',
    0xE0: 'RET PO', 0xE8: 'RET PE', 0xF0: 'RET P', 0xF8: 'RET M',
  };
  if (singles[op]) return { len: 1, text: `${rawBytes(1).padEnd(16)} ${singles[op]}` };

  // 2-byte imm8
  if (op === 0x3E) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD A,${hex2(b1)}` };
  if (op === 0x06) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD B,${hex2(b1)}` };
  if (op === 0x0E) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD C,${hex2(b1)}` };
  if (op === 0x16) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD D,${hex2(b1)}` };
  if (op === 0x1E) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD E,${hex2(b1)}` };
  if (op === 0x26) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD H,${hex2(b1)}` };
  if (op === 0x2E) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD L,${hex2(b1)}` };
  if (op === 0x36) return { len: 2, text: `${rawBytes(2).padEnd(16)} LD (HL),${hex2(b1)}` };
  if (op === 0xFE) return { len: 2, text: `${rawBytes(2).padEnd(16)} CP ${hex2(b1)}` };
  if (op === 0xC6) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADD A,${hex2(b1)}` };
  if (op === 0xD6) return { len: 2, text: `${rawBytes(2).padEnd(16)} SUB ${hex2(b1)}` };
  if (op === 0xE6) return { len: 2, text: `${rawBytes(2).padEnd(16)} AND ${hex2(b1)}` };
  if (op === 0xF6) return { len: 2, text: `${rawBytes(2).padEnd(16)} OR ${hex2(b1)}` };
  if (op === 0xEE) return { len: 2, text: `${rawBytes(2).padEnd(16)} XOR ${hex2(b1)}` };
  if (op === 0xCE) return { len: 2, text: `${rawBytes(2).padEnd(16)} ADC A,${hex2(b1)}` };
  if (op === 0xDE) return { len: 2, text: `${rawBytes(2).padEnd(16)} SBC A,${hex2(b1)}` };
  if (op === 0xD3) return { len: 2, text: `${rawBytes(2).padEnd(16)} OUT (${hex2(b1)}),A` };
  if (op === 0xDB) return { len: 2, text: `${rawBytes(2).padEnd(16)} IN A,(${hex2(b1)})` };

  // JR / DJNZ
  if (op === 0x18) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} JR ${hex6(t)}` }; }
  if (op === 0x20) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} JR NZ,${hex6(t)}` }; }
  if (op === 0x28) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} JR Z,${hex6(t)}` }; }
  if (op === 0x30) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} JR NC,${hex6(t)}` }; }
  if (op === 0x38) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} JR C,${hex6(t)}` }; }
  if (op === 0x10) { const t = pc + 2 + signed8(b1); return { len: 2, text: `${rawBytes(2).padEnd(16)} DJNZ ${hex6(t)}` }; }

  // RST
  if ((op & 0xC7) === 0xC7) return { len: 1, text: `${rawBytes(1).padEnd(16)} RST ${hex2(op & 0x38)}` };

  // 4-byte ADL: LD rr,imm24
  if (op === 0x01) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD BC,${hex6(read24(pc + 1))}` };
  if (op === 0x11) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD DE,${hex6(read24(pc + 1))}` };
  if (op === 0x21) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD HL,${hex6(read24(pc + 1))}` };
  if (op === 0x31) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD SP,${hex6(read24(pc + 1))}` };

  // CALL / JP
  if (op === 0xCD) return { len: 4, text: `${rawBytes(4).padEnd(16)} CALL ${hex6(read24(pc + 1))}` };
  if (op === 0xC3) return { len: 4, text: `${rawBytes(4).padEnd(16)} JP ${hex6(read24(pc + 1))}` };
  if (op === 0xC4) return { len: 4, text: `${rawBytes(4).padEnd(16)} CALL NZ,${hex6(read24(pc + 1))}` };
  if (op === 0xCC) return { len: 4, text: `${rawBytes(4).padEnd(16)} CALL Z,${hex6(read24(pc + 1))}` };
  if (op === 0xD4) return { len: 4, text: `${rawBytes(4).padEnd(16)} CALL NC,${hex6(read24(pc + 1))}` };
  if (op === 0xDC) return { len: 4, text: `${rawBytes(4).padEnd(16)} CALL C,${hex6(read24(pc + 1))}` };
  if (op === 0xC2) return { len: 4, text: `${rawBytes(4).padEnd(16)} JP NZ,${hex6(read24(pc + 1))}` };
  if (op === 0xCA) return { len: 4, text: `${rawBytes(4).padEnd(16)} JP Z,${hex6(read24(pc + 1))}` };
  if (op === 0xD2) return { len: 4, text: `${rawBytes(4).padEnd(16)} JP NC,${hex6(read24(pc + 1))}` };
  if (op === 0xDA) return { len: 4, text: `${rawBytes(4).padEnd(16)} JP C,${hex6(read24(pc + 1))}` };

  // LD A,(addr) / LD (addr),A / LD HL,(addr) / LD (addr),HL
  if (op === 0x3A) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD A,(${hex6(read24(pc + 1))})` };
  if (op === 0x32) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD (${hex6(read24(pc + 1))}),A` };
  if (op === 0x2A) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD HL,(${hex6(read24(pc + 1))})` };
  if (op === 0x22) return { len: 4, text: `${rawBytes(4).padEnd(16)} LD (${hex6(read24(pc + 1))}),HL` };

  return { len: 1, text: `${rawBytes(1).padEnd(16)} DB ${hex2(op)}` };
}

function disasmRange(start, end, label) {
  console.log(`\n--- ${label} (${hex6(start)} - ${hex6(end)}) ---`);
  let pc = start;
  const insns = [];
  while (pc <= end) {
    const d = decodeOne(pc);
    console.log(`  ${hex6(pc)}: ${d.text}`);
    insns.push({ addr: pc, len: d.len, text: d.text });
    pc += d.len;
  }
  return insns;
}

// ============================================================
console.log('='.repeat(72));
console.log('PROBE: Decode 0x0BAB88 — Graph/App Caller of Type String Dispatcher');
console.log('='.repeat(72));

// Section 1: Hex dump
hexDump(0x0BAB70, 0x0BAC40 - 0x0BAB70);

// Section 2: Find function entry
console.log('\n' + '='.repeat(72));
console.log('SECTION 2: Scan backward for function entry');
console.log('='.repeat(72));
// Disassemble context before 0x0BAB88
disasmRange(0x0BAB60, 0x0BAB8B, 'Context before 0x0BAB88');

// Section 3: Main function decode
console.log('\n' + '='.repeat(72));
console.log('SECTION 3: Function at 0x0BAB84 (LD HL,0x0BACB3 + CALL 0x03EC5A + loop)');
console.log('='.repeat(72));
const mainInsns = disasmRange(0x0BAB7F, 0x0BABC5, 'Main function');

// Section 4: The function after RET (0x0BABC6)
console.log('\n' + '='.repeat(72));
console.log('SECTION 4: Next function at 0x0BABC6');
console.log('='.repeat(72));
disasmRange(0x0BABC6, 0x0BABE1, 'Function 0x0BABC6');

// Section 5: Sibling caller at 0x0BABED
console.log('\n' + '='.repeat(72));
console.log('SECTION 5: Sibling caller region 0x0BABED - 0x0BAC40');
console.log('='.repeat(72));
disasmRange(0x0BABED, 0x0BAC40, 'Sibling region including 0x0BABF2');

// Section 6: Loop analysis
console.log('\n' + '='.repeat(72));
console.log('SECTION 6: Loop / branch analysis for main function');
console.log('='.repeat(72));
for (const insn of mainInsns) {
  const t = insn.text;
  if (t.includes('JR') || t.includes('DJNZ')) console.log(`  BRANCH: ${hex6(insn.addr)}: ${t.trim()}`);
  if (t.includes('CP ')) console.log(`  COMPARE: ${hex6(insn.addr)}: ${t.trim()}`);
  if (t.includes('CALL')) console.log(`  CALL:    ${hex6(insn.addr)}: ${t.trim()}`);
  if (t.includes('LD B,') || t.includes('LD C,')) console.log(`  COUNTER: ${hex6(insn.addr)}: ${t.trim()}`);
  if (t.includes('LD A,')) console.log(`  FETCH:   ${hex6(insn.addr)}: ${t.trim()}`);
}

// Section 7: CALL xrefs
console.log('\n' + '='.repeat(72));
console.log('SECTION 7: CALL xrefs');
console.log('='.repeat(72));

// Search for callers of various entry points in this region
const targets = [
  { addr: 0x0BAB84, name: 'function with LD HL setup' },
  { addr: 0x0BAB88, name: 'CALL 0x03EC5A inside function' },
  { addr: 0x0BABC6, name: 'next function' },
  { addr: 0x0BABF2, name: 'sibling CALL 0x03EC5A' },
  { addr: 0x0BAB7F, name: 'LD A,(D02A7B) entry' },
];

for (const tgt of targets) {
  const b0 = tgt.addr & 0xFF;
  const b1 = (tgt.addr >> 8) & 0xFF;
  const b2 = (tgt.addr >> 16) & 0xFF;
  let count = 0;
  const locs = [];
  // CALL
  for (let a = 0; a < 0x400000 - 3; a++) {
    if (rom[a] === 0xCD && rom[a+1] === b0 && rom[a+2] === b1 && rom[a+3] === b2) {
      locs.push(hex6(a));
      count++;
    }
  }
  // JP
  for (let a = 0; a < 0x400000 - 3; a++) {
    if (rom[a] === 0xC3 && rom[a+1] === b0 && rom[a+2] === b1 && rom[a+3] === b2) {
      locs.push('JP@' + hex6(a));
      count++;
    }
  }
  if (count > 0) {
    console.log(`  ${hex6(tgt.addr)} (${tgt.name}): ${count} refs: ${locs.join(', ')}`);
  } else {
    console.log(`  ${hex6(tgt.addr)} (${tgt.name}): 0 refs`);
  }
}

// Also scan for callers of the broader entry points around 0x0BAB70-0x0BABE0
console.log('\n  Scanning all even-aligned entries 0x0BAB70-0x0BABE0:');
for (let entry = 0x0BAB70; entry <= 0x0BABE0; entry += 1) {
  const b0 = entry & 0xFF;
  const b1_ = (entry >> 8) & 0xFF;
  const b2_ = (entry >> 16) & 0xFF;
  let count = 0;
  for (let a = 0; a < 0x400000 - 3; a++) {
    if (rom[a] === 0xCD && rom[a+1] === b0 && rom[a+2] === b1_ && rom[a+3] === b2_) count++;
    if (rom[a] === 0xC3 && rom[a+1] === b0 && rom[a+2] === b1_ && rom[a+3] === b2_) count++;
  }
  if (count > 0) {
    console.log(`    ${hex6(entry)}: ${count} callers`);
  }
}

// Section 8: Token template table
console.log('\n' + '='.repeat(72));
console.log('SECTION 8: Token template table at 0x0BACB3');
console.log('='.repeat(72));
for (let i = 0; i < 12; i++) {
  const ptrAddr = 0x0BACB3 + i * 3;
  const ptr = read24(ptrAddr);
  const bytes = [];
  for (let j = 0; j < 24; j++) {
    const b = rom[ptr + j];
    bytes.push(b);
    if (b === 0) break;
  }
  const rawHex = bytes.map(b => hex2(b)).join(' ');
  // Try to interpret: first byte = length, then token bytes
  const len = bytes[0];
  const tokens = bytes.slice(1, 1 + len);
  const tokenHex = tokens.map(b => hex2(b)).join(' ');
  console.log(`  Entry ${i.toString().padStart(2)}: [${hex6(ptrAddr)}] -> ${hex6(ptr)}`);
  console.log(`           raw: ${rawHex}`);
  console.log(`           len=${len}, tokens: [${tokenHex}]`);
}

// Section 9: Summary
console.log('\n' + '='.repeat(72));
console.log('SECTION 9: Structural summary');
console.log('='.repeat(72));
console.log(`
Function structure (manually traced from corrected SIS-aware decode):

0x0BAB7F: LD A,(0xD02A7B)         ; load index from RAM
0x0BAB83: DEC A                    ; adjust index (1-based -> 0-based)
0x0BAB84: LD HL,0x0BACB3           ; table base = token template table
0x0BAB88: CALL 0x03EC5A            ; dispatcher: HL = table[A*3] -> pointer
0x0BAB8C: LD B,(HL)                ; B = template byte count
0x0BAB8D: INC HL                   ; advance past count byte
0x0BAB8E: PUSH BC                  ; save counter  <-- LOOP TOP
0x0BAB8F: LD DE,0x000000           ; clear DE
0x0BAB93: LD A,(HL)                ; fetch next template byte
0x0BAB94: LD E,A                   ; E = token byte
0x0BAB95: INC HL                   ; advance template pointer
0x0BAB96: PUSH HL                  ; save template position
0x0BAB97: CP 0x4F                  ; check if byte == 0x4F
0x0BAB99: JR NZ,0x0BABA1           ; if not, check next range
0x0BAB9B: LD DE,0x00BBBF           ; special: DE = 0x00BBBF for token 0x4F
0x0BAB9F: JR 0x0BABB1              ; skip to output call
0x0BABA1: CP 0x41                  ; check if byte < 0x41
0x0BABA3: JR C,0x0BABB1            ; if < 0x41, skip to output
0x0BABA5: CP 0x45                  ; check if byte >= 0x45
0x0BABA7: JR NC,0x0BABB1           ; if >= 0x45, skip to output
                                    ; --- byte is 0x41-0x44 (A-D) ---
0x0BABA9: LD HL,0x00001F           ; HL = 0x1F (subscript char?)
0x0BABAD: SIS LD (0x26AC),HL       ; store HL to 0x26AC (short mode)
0x0BABB1: CALL 0x0A2A68            ; output/display token with DE
...
0x0BABB5: CALL 0x088F6B            ; secondary display call
...
0x0BABB9: LD HL,0x000000           ; clear HL
0x0BABBD: SIS LD (0x26AC),HL       ; reset 0x26AC
0x0BABC1: POP HL                   ; restore template pointer
0x0BABC2: POP BC                   ; restore counter
0x0BABC3: DJNZ 0x0BAB8E            ; loop back for next byte
0x0BABC5: RET                      ; done

PURPOSE: TOKEN TEMPLATE RENDERER
- Reads an index from D02A7B, looks up a token template via the
  0x0BACB3 table, then iterates through template bytes one at a time.
- Special handling: 0x4F -> uses DE=0xBBBF (likely a special token/offset)
- Range 0x41-0x44 (A-D): sets subscript marker at 0x26AC = 0x1F before output
- Each byte is output via CALL 0x0A2A68 (token display) and CALL 0x088F6B
- After each byte, clears the subscript marker
- This renders formatted equation display text (like "Y1=" with subscripts)
`);

console.log('='.repeat(72));
console.log('PROBE COMPLETE');
console.log('='.repeat(72));
