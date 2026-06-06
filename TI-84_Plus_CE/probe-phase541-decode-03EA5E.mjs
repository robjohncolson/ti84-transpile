import fs from 'fs';

const rom = fs.readFileSync('./TI-84_Plus_CE/ROM.rom');

const start = 0x03EA5E;
const end = 0x03EB8F;

const hex2 = (n) => n.toString(16).padStart(2, '0');
const hex4 = (n) => n.toString(16).padStart(4, '0');
const hex6 = (n) => n.toString(16).padStart(6, '0');
const byte = (addr) => rom[addr] ?? 0;
const imm16 = (addr) => byte(addr) | (byte(addr + 1) << 8);
const imm24 = (addr) => byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
const signed8 = (n) => (n & 0x80 ? n - 0x100 : n);

const calls = [];
const jumps = [];
const ptrRefs = [];

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => hex2(byte(addr + i))).join(' ');
}

function fmtTarget(addr) {
  return `0x${hex6(addr)}`;
}

function printInsn(addr, len, mnemonic, operands = '', note = '') {
  const opText = operands ? `${mnemonic} ${operands}` : mnemonic;
  const suffix = note ? ` ; ${note}` : '';
  console.log(`${hex6(addr)}: ${bytesAt(addr, len).padEnd(17)} ${opText}${suffix}`);
}

function decodeIndex(pc, prefix) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const b1 = byte(pc + 1);

  if (b1 === 0xCB) {
    const disp = signed8(byte(pc + 2));
    const op = byte(pc + 3);
    const bit = (op >> 3) & 7;
    const low = op & 7;
    const target = `(${reg}${disp < 0 ? '-' : '+'}0x${hex2(Math.abs(disp))})`;
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', target, 'A'];

    if ((op & 0xC0) === 0x40) return [4, 'BIT', `${bit},${regs[low]}`];
    if ((op & 0xC0) === 0x80) return [4, 'RES', `${bit},${regs[low]}`];
    if ((op & 0xC0) === 0xC0) return [4, 'SET', `${bit},${regs[low]}`];
    return [4, 'INDEX-CB', `0x${hex2(op)} ${target}`];
  }

  const disp = () => {
    const d = signed8(byte(pc + 2));
    return `(${reg}${d < 0 ? '-' : '+'}0x${hex2(Math.abs(d))})`;
  };

  switch (b1) {
    case 0x21: return [5, 'LD', `${reg},0x${hex6(imm24(pc + 2))}`];
    case 0x22: return [5, 'LD', `(0x${hex6(imm24(pc + 2))}),${reg}`];
    case 0x2A: return [5, 'LD', `${reg},(0x${hex6(imm24(pc + 2))})`];
    case 0x23: return [2, 'INC', reg];
    case 0x2B: return [2, 'DEC', reg];
    case 0x34: return [3, 'INC', disp()];
    case 0x35: return [3, 'DEC', disp()];
    case 0x36: return [4, 'LD', `${disp()},0x${hex2(byte(pc + 3))}`];
    case 0x46: return [3, 'LD', `B,${disp()}`];
    case 0x4E: return [3, 'LD', `C,${disp()}`];
    case 0x56: return [3, 'LD', `D,${disp()}`];
    case 0x5E: return [3, 'LD', `E,${disp()}`];
    case 0x66: return [3, 'LD', `H,${disp()}`];
    case 0x6E: return [3, 'LD', `L,${disp()}`];
    case 0x70: return [3, 'LD', `${disp()},B`];
    case 0x71: return [3, 'LD', `${disp()},C`];
    case 0x72: return [3, 'LD', `${disp()},D`];
    case 0x73: return [3, 'LD', `${disp()},E`];
    case 0x74: return [3, 'LD', `${disp()},H`];
    case 0x75: return [3, 'LD', `${disp()},L`];
    case 0x77: return [3, 'LD', `${disp()},A`];
    case 0x7E: return [3, 'LD', `A,${disp()}`];
    case 0x86: return [3, 'ADD', `A,${disp()}`];
    case 0x96: return [3, 'SUB', disp()];
    case 0xA6: return [3, 'AND', disp()];
    case 0xAE: return [3, 'XOR', disp()];
    case 0xB6: return [3, 'OR', disp()];
    case 0xBE: return [3, 'CP', disp()];
    case 0xE1: return [2, 'POP', reg];
    case 0xE3: return [2, 'EX', `(SP),${reg}`];
    case 0xE5: return [2, 'PUSH', reg];
    case 0xE9: return [2, 'JP', `(${reg})`];
    case 0xF9: return [2, 'LD', `SP,${reg}`];
    default: return [2, `${reg}-PREFIX`, `0x${hex2(b1)}`];
  }
}

function decodeEd(pc) {
  const b1 = byte(pc + 1);
  switch (b1) {
    case 0x4B: return [5, 'LD', `BC,(0x${hex6(imm24(pc + 2))})`];
    case 0x5B: return [5, 'LD', `DE,(0x${hex6(imm24(pc + 2))})`];
    case 0x6B: return [5, 'LD', `HL,(0x${hex6(imm24(pc + 2))})`];
    case 0x7B: return [5, 'LD', `SP,(0x${hex6(imm24(pc + 2))})`];
    case 0x43: return [5, 'LD', `(0x${hex6(imm24(pc + 2))}),BC`];
    case 0x53: return [5, 'LD', `(0x${hex6(imm24(pc + 2))}),DE`];
    case 0x63: return [5, 'LD', `(0x${hex6(imm24(pc + 2))}),HL`];
    case 0x73: return [5, 'LD', `(0x${hex6(imm24(pc + 2))}),SP`];
    case 0x44: return [2, 'NEG'];
    case 0x45: return [2, 'RETN'];
    case 0x47: return [2, 'LD', 'I,A'];
    case 0x4D: return [2, 'RETI'];
    case 0x57: return [2, 'LD', 'A,I'];
    case 0x5F: return [2, 'LD', 'A,R'];
    case 0xA0: return [2, 'LDI'];
    case 0xA1: return [2, 'CPI'];
    case 0xA8: return [2, 'LDD'];
    case 0xA9: return [2, 'CPD'];
    case 0xB0: return [2, 'LDIR'];
    case 0xB1: return [2, 'CPIR'];
    case 0xB8: return [2, 'LDDR'];
    case 0xB9: return [2, 'CPDR'];
    default: return [2, 'ED', `0x${hex2(b1)}`];
  }
}

function decode(pc) {
  const op = byte(pc);
  const rel = () => {
    const d = signed8(byte(pc + 1));
    return `0x${hex6((pc + 2 + d) & 0xFFFFFF)}`;
  };

  if (op === 0xDD || op === 0xFD) return decodeIndex(pc, op);
  if (op === 0xED) return decodeEd(pc);

  switch (op) {
    case 0x00: return [1, 'NOP'];
    case 0x01: return [4, 'LD', `BC,0x${hex6(imm24(pc + 1))}`];
    case 0x02: return [1, 'LD', '(BC),A'];
    case 0x03: return [1, 'INC', 'BC'];
    case 0x04: return [1, 'INC', 'B'];
    case 0x05: return [1, 'DEC', 'B'];
    case 0x06: return [2, 'LD', `B,0x${hex2(byte(pc + 1))}`];
    case 0x08: return [1, 'EX', 'AF,AF\''];
    case 0x09: return [1, 'ADD', 'HL,BC'];
    case 0x0A: return [1, 'LD', 'A,(BC)'];
    case 0x0B: return [1, 'DEC', 'BC'];
    case 0x0C: return [1, 'INC', 'C'];
    case 0x0D: return [1, 'DEC', 'C'];
    case 0x0E: return [2, 'LD', `C,0x${hex2(byte(pc + 1))}`];
    case 0x11: return [4, 'LD', `DE,0x${hex6(imm24(pc + 1))}`];
    case 0x12: return [1, 'LD', '(DE),A'];
    case 0x13: return [1, 'INC', 'DE'];
    case 0x14: return [1, 'INC', 'D'];
    case 0x15: return [1, 'DEC', 'D'];
    case 0x16: return [2, 'LD', `D,0x${hex2(byte(pc + 1))}`];
    case 0x18: return [2, 'JR', rel()];
    case 0x19: return [1, 'ADD', 'HL,DE'];
    case 0x1A: return [1, 'LD', 'A,(DE)'];
    case 0x1B: return [1, 'DEC', 'DE'];
    case 0x1C: return [1, 'INC', 'E'];
    case 0x1D: return [1, 'DEC', 'E'];
    case 0x1E: return [2, 'LD', `E,0x${hex2(byte(pc + 1))}`];
    case 0x20: return [2, 'JR', `NZ,${rel()}`];
    case 0x21: return [4, 'LD', `HL,0x${hex6(imm24(pc + 1))}`];
    case 0x22: return [4, 'LD', `(0x${hex6(imm24(pc + 1))}),HL`];
    case 0x23: return [1, 'INC', 'HL'];
    case 0x24: return [1, 'INC', 'H'];
    case 0x25: return [1, 'DEC', 'H'];
    case 0x26: return [2, 'LD', `H,0x${hex2(byte(pc + 1))}`];
    case 0x28: return [2, 'JR', `Z,${rel()}`];
    case 0x29: return [1, 'ADD', 'HL,HL'];
    case 0x2A: return [4, 'LD', `HL,(0x${hex6(imm24(pc + 1))})`];
    case 0x2B: return [1, 'DEC', 'HL'];
    case 0x2C: return [1, 'INC', 'L'];
    case 0x2D: return [1, 'DEC', 'L'];
    case 0x2E: return [2, 'LD', `L,0x${hex2(byte(pc + 1))}`];
    case 0x30: return [2, 'JR', `NC,${rel()}`];
    case 0x31: return [4, 'LD', `SP,0x${hex6(imm24(pc + 1))}`];
    case 0x32: return [4, 'LD', `(0x${hex6(imm24(pc + 1))}),A`];
    case 0x33: return [1, 'INC', 'SP'];
    case 0x34: return [1, 'INC', '(HL)'];
    case 0x35: return [1, 'DEC', '(HL)'];
    case 0x36: return [2, 'LD', `(HL),0x${hex2(byte(pc + 1))}`];
    case 0x38: return [2, 'JR', `C,${rel()}`];
    case 0x39: return [1, 'ADD', 'HL,SP'];
    case 0x3A: return [4, 'LD', `A,(0x${hex6(imm24(pc + 1))})`];
    case 0x3B: return [1, 'DEC', 'SP'];
    case 0x3C: return [1, 'INC', 'A'];
    case 0x3D: return [1, 'DEC', 'A'];
    case 0x3E: return [2, 'LD', `A,0x${hex2(byte(pc + 1))}`];
    case 0x40: return [1, 'LD', 'B,B'];
    case 0x41: return [1, 'LD', 'B,C'];
    case 0x42: return [1, 'LD', 'B,D'];
    case 0x43: return [1, 'LD', 'B,E'];
    case 0x44: return [1, 'LD', 'B,H'];
    case 0x45: return [1, 'LD', 'B,L'];
    case 0x46: return [1, 'LD', 'B,(HL)'];
    case 0x47: return [1, 'LD', 'B,A'];
    case 0x48: return [1, 'LD', 'C,B'];
    case 0x49: return [1, 'LD', 'C,C'];
    case 0x4A: return [1, 'LD', 'C,D'];
    case 0x4B: return [1, 'LD', 'C,E'];
    case 0x4C: return [1, 'LD', 'C,H'];
    case 0x4D: return [1, 'LD', 'C,L'];
    case 0x4E: return [1, 'LD', 'C,(HL)'];
    case 0x4F: return [1, 'LD', 'C,A'];
    case 0x50: return [1, 'LD', 'D,B'];
    case 0x51: return [1, 'LD', 'D,C'];
    case 0x52: return [1, 'LD', 'D,D'];
    case 0x53: return [1, 'LD', 'D,E'];
    case 0x54: return [1, 'LD', 'D,H'];
    case 0x55: return [1, 'LD', 'D,L'];
    case 0x56: return [1, 'LD', 'D,(HL)'];
    case 0x57: return [1, 'LD', 'D,A'];
    case 0x58: return [1, 'LD', 'E,B'];
    case 0x59: return [1, 'LD', 'E,C'];
    case 0x5A: return [1, 'LD', 'E,D'];
    case 0x5B: return [1, 'LD', 'E,E'];
    case 0x5C: return [1, 'LD', 'E,H'];
    case 0x5D: return [1, 'LD', 'E,L'];
    case 0x5E: return [1, 'LD', 'E,(HL)'];
    case 0x5F: return [1, 'LD', 'E,A'];
    case 0x60: return [1, 'LD', 'H,B'];
    case 0x61: return [1, 'LD', 'H,C'];
    case 0x62: return [1, 'LD', 'H,D'];
    case 0x63: return [1, 'LD', 'H,E'];
    case 0x64: return [1, 'LD', 'H,H'];
    case 0x65: return [1, 'LD', 'H,L'];
    case 0x66: return [1, 'LD', 'H,(HL)'];
    case 0x67: return [1, 'LD', 'H,A'];
    case 0x68: return [1, 'LD', 'L,B'];
    case 0x69: return [1, 'LD', 'L,C'];
    case 0x6A: return [1, 'LD', 'L,D'];
    case 0x6B: return [1, 'LD', 'L,E'];
    case 0x6C: return [1, 'LD', 'L,H'];
    case 0x6D: return [1, 'LD', 'L,L'];
    case 0x6E: return [1, 'LD', 'L,(HL)'];
    case 0x6F: return [1, 'LD', 'L,A'];
    case 0x70: return [1, 'LD', '(HL),B'];
    case 0x71: return [1, 'LD', '(HL),C'];
    case 0x72: return [1, 'LD', '(HL),D'];
    case 0x73: return [1, 'LD', '(HL),E'];
    case 0x74: return [1, 'LD', '(HL),H'];
    case 0x75: return [1, 'LD', '(HL),L'];
    case 0x76: return [1, 'HALT'];
    case 0x77: return [1, 'LD', '(HL),A'];
    case 0x78: return [1, 'LD', 'A,B'];
    case 0x79: return [1, 'LD', 'A,C'];
    case 0x7A: return [1, 'LD', 'A,D'];
    case 0x7B: return [1, 'LD', 'A,E'];
    case 0x7C: return [1, 'LD', 'A,H'];
    case 0x7D: return [1, 'LD', 'A,L'];
    case 0x7E: return [1, 'LD', 'A,(HL)'];
    case 0x7F: return [1, 'LD', 'A,A'];
    case 0x80: return [1, 'ADD', 'A,B'];
    case 0x81: return [1, 'ADD', 'A,C'];
    case 0x82: return [1, 'ADD', 'A,D'];
    case 0x83: return [1, 'ADD', 'A,E'];
    case 0x84: return [1, 'ADD', 'A,H'];
    case 0x85: return [1, 'ADD', 'A,L'];
    case 0x86: return [1, 'ADD', 'A,(HL)'];
    case 0x87: return [1, 'ADD', 'A,A'];
    case 0x90: return [1, 'SUB', 'B'];
    case 0x91: return [1, 'SUB', 'C'];
    case 0x92: return [1, 'SUB', 'D'];
    case 0x93: return [1, 'SUB', 'E'];
    case 0x94: return [1, 'SUB', 'H'];
    case 0x95: return [1, 'SUB', 'L'];
    case 0x96: return [1, 'SUB', '(HL)'];
    case 0x97: return [1, 'SUB', 'A'];
    case 0xA0: return [1, 'AND', 'B'];
    case 0xA1: return [1, 'AND', 'C'];
    case 0xA2: return [1, 'AND', 'D'];
    case 0xA3: return [1, 'AND', 'E'];
    case 0xA4: return [1, 'AND', 'H'];
    case 0xA5: return [1, 'AND', 'L'];
    case 0xA6: return [1, 'AND', '(HL)'];
    case 0xA7: return [1, 'AND', 'A'];
    case 0xA8: return [1, 'XOR', 'B'];
    case 0xA9: return [1, 'XOR', 'C'];
    case 0xAA: return [1, 'XOR', 'D'];
    case 0xAB: return [1, 'XOR', 'E'];
    case 0xAC: return [1, 'XOR', 'H'];
    case 0xAD: return [1, 'XOR', 'L'];
    case 0xAE: return [1, 'XOR', '(HL)'];
    case 0xAF: return [1, 'XOR', 'A'];
    case 0xB0: return [1, 'OR', 'B'];
    case 0xB1: return [1, 'OR', 'C'];
    case 0xB2: return [1, 'OR', 'D'];
    case 0xB3: return [1, 'OR', 'E'];
    case 0xB4: return [1, 'OR', 'H'];
    case 0xB5: return [1, 'OR', 'L'];
    case 0xB6: return [1, 'OR', '(HL)'];
    case 0xB7: return [1, 'OR', 'A'];
    case 0xB8: return [1, 'CP', 'B'];
    case 0xB9: return [1, 'CP', 'C'];
    case 0xBA: return [1, 'CP', 'D'];
    case 0xBB: return [1, 'CP', 'E'];
    case 0xBC: return [1, 'CP', 'H'];
    case 0xBD: return [1, 'CP', 'L'];
    case 0xBE: return [1, 'CP', '(HL)'];
    case 0xBF: return [1, 'CP', 'A'];
    case 0xC0: return [1, 'RET', 'NZ'];
    case 0xC1: return [1, 'POP', 'BC'];
    case 0xC2: return [4, 'JP', `NZ,0x${hex6(imm24(pc + 1))}`];
    case 0xC3: return [4, 'JP', `0x${hex6(imm24(pc + 1))}`];
    case 0xC4: return [4, 'CALL', `NZ,0x${hex6(imm24(pc + 1))}`];
    case 0xC5: return [1, 'PUSH', 'BC'];
    case 0xC6: return [2, 'ADD', `A,0x${hex2(byte(pc + 1))}`];
    case 0xC8: return [1, 'RET', 'Z'];
    case 0xC9: return [1, 'RET'];
    case 0xCA: return [4, 'JP', `Z,0x${hex6(imm24(pc + 1))}`];
    case 0xCC: return [4, 'CALL', `Z,0x${hex6(imm24(pc + 1))}`];
    case 0xCD: return [4, 'CALL', `0x${hex6(imm24(pc + 1))}`];
    case 0xCE: return [2, 'ADC', `A,0x${hex2(byte(pc + 1))}`];
    case 0xD0: return [1, 'RET', 'NC'];
    case 0xD1: return [1, 'POP', 'DE'];
    case 0xD2: return [4, 'JP', `NC,0x${hex6(imm24(pc + 1))}`];
    case 0xD3: return [2, 'OUT', `(0x${hex2(byte(pc + 1))}),A`];
    case 0xD4: return [4, 'CALL', `NC,0x${hex6(imm24(pc + 1))}`];
    case 0xD5: return [1, 'PUSH', 'DE'];
    case 0xD6: return [2, 'SUB', `0x${hex2(byte(pc + 1))}`];
    case 0xD8: return [1, 'RET', 'C'];
    case 0xD9: return [1, 'EXX'];
    case 0xDA: return [4, 'JP', `C,0x${hex6(imm24(pc + 1))}`];
    case 0xDB: return [2, 'IN', `A,(0x${hex2(byte(pc + 1))})`];
    case 0xDC: return [4, 'CALL', `C,0x${hex6(imm24(pc + 1))}`];
    case 0xDE: return [2, 'SBC', `A,0x${hex2(byte(pc + 1))}`];
    case 0xE0: return [1, 'RET', 'PO'];
    case 0xE1: return [1, 'POP', 'HL'];
    case 0xE2: return [4, 'JP', `PO,0x${hex6(imm24(pc + 1))}`];
    case 0xE3: return [1, 'EX', '(SP),HL'];
    case 0xE4: return [4, 'CALL', `PO,0x${hex6(imm24(pc + 1))}`];
    case 0xE5: return [1, 'PUSH', 'HL'];
    case 0xE6: return [2, 'AND', `0x${hex2(byte(pc + 1))}`];
    case 0xE8: return [1, 'RET', 'PE'];
    case 0xE9: return [1, 'JP', '(HL)'];
    case 0xEA: return [4, 'JP', `PE,0x${hex6(imm24(pc + 1))}`];
    case 0xEB: return [1, 'EX', 'DE,HL'];
    case 0xEC: return [4, 'CALL', `PE,0x${hex6(imm24(pc + 1))}`];
    case 0xEE: return [2, 'XOR', `0x${hex2(byte(pc + 1))}`];
    case 0xF0: return [1, 'RET', 'P'];
    case 0xF1: return [1, 'POP', 'AF'];
    case 0xF2: return [4, 'JP', `P,0x${hex6(imm24(pc + 1))}`];
    case 0xF3: return [1, 'DI'];
    case 0xF4: return [4, 'CALL', `P,0x${hex6(imm24(pc + 1))}`];
    case 0xF5: return [1, 'PUSH', 'AF'];
    case 0xF6: return [2, 'OR', `0x${hex2(byte(pc + 1))}`];
    case 0xF8: return [1, 'RET', 'M'];
    case 0xF9: return [1, 'LD', 'SP,HL'];
    case 0xFA: return [4, 'JP', `M,0x${hex6(imm24(pc + 1))}`];
    case 0xFB: return [1, 'EI'];
    case 0xFC: return [4, 'CALL', `M,0x${hex6(imm24(pc + 1))}`];
    case 0xFE: return [2, 'CP', `0x${hex2(byte(pc + 1))}`];
    default: return [1, `DB`, `0x${hex2(op)}`];
  }
}

console.log('=== HEX DUMP 0x03EA5E-0x03EB8E ===');
for (let addr = start; addr < end; addr += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && addr + i < end; i++) {
    bytes.push(hex2(byte(addr + i)));
  }
  console.log(`${hex6(addr)}: ${bytes.join(' ')}`);
}

console.log('\n=== DISASSEMBLY ===');
let pc = start;
let boundary = null;
while (pc < end) {
  const [len, mnemonic, operands = ''] = decode(pc);
  const targetMatch = operands.match(/0x([0-9a-f]{6})/i);
  let note = '';

  if (mnemonic === 'CALL' && targetMatch) {
    const target = Number.parseInt(targetMatch[1], 16);
    calls.push({ at: pc, target, conditional: operands.includes(',') });
    note = 'call target';
  } else if (mnemonic === 'JP' && targetMatch) {
    const target = Number.parseInt(targetMatch[1], 16);
    jumps.push({ at: pc, target, conditional: operands.includes(',') });
    if (!operands.includes(',')) note = 'possible tail-call / hard boundary';
  } else if (mnemonic === 'LD' && /^(HL|DE|BC),0x/i.test(operands)) {
    const target = Number.parseInt(targetMatch[1], 16);
    ptrRefs.push({ at: pc, reg: operands.split(',')[0], target });
    note = 'possible pointer/string/table reference';
  }

  printInsn(pc, len, mnemonic, operands, note);

  if (!boundary && (mnemonic === 'RET' || (mnemonic === 'JP' && !operands.includes(',')))) {
    boundary = { at: pc, mnemonic, operands };
  }

  pc += len;
}

console.log('\n=== FUNCTION BOUNDARY CANDIDATE ===');
if (boundary) {
  const opText = boundary.operands ? `${boundary.mnemonic} ${boundary.operands}` : boundary.mnemonic;
  console.log(`  first terminating instruction: ${hex6(boundary.at)} ${opText}`);
} else {
  console.log(`  no RET or unconditional JP found before 0x${hex6(end - 1)}`);
}

console.log('\n=== CALL TARGETS ===');
if (calls.length === 0) {
  console.log('  none decoded in scanned range');
} else {
  for (const call of calls) {
    const kind = call.conditional ? 'conditional' : 'direct';
    console.log(`  ${hex6(call.at)} -> ${fmtTarget(call.target)} (${kind})`);
  }
}

console.log('\n=== POINTER / STRING TABLE CANDIDATES ===');
if (ptrRefs.length === 0) {
  console.log('  no immediate HL/DE/BC pointer loads decoded in scanned range');
} else {
  for (const ref of ptrRefs) {
    console.log(`  ${hex6(ref.at)}: ${ref.reg} = ${fmtTarget(ref.target)}`);
  }
}

console.log('\n=== JUMP TARGETS ===');
if (jumps.length === 0) {
  console.log('  none decoded in scanned range');
} else {
  for (const jump of jumps) {
    const kind = jump.conditional ? 'conditional' : 'unconditional';
    console.log(`  ${hex6(jump.at)} -> ${fmtTarget(jump.target)} (${kind})`);
  }
}

console.log('\n=== STRING SCAN near 0x03EA00-0x03F000 ===');
for (let addr = 0x03EA00; addr < 0x03F000; addr++) {
  if (byte(addr) >= 0x20 && byte(addr) < 0x7F) {
    let str = '';
    let a = addr;
    while (a < 0x03F000 && byte(a) >= 0x20 && byte(a) < 0x7F) {
      str += String.fromCharCode(byte(a));
      a++;
    }
    if (str.length >= 4) {
      console.log(`  ${hex6(addr)}: "${str}"`);
      addr = a;
    }
  }
}

console.log('\n=== ERROR MESSAGE STRING SCAN ROM-wide ===');
const errorNeedles = ['ERR:', 'DOMAIN', 'SYNTAX', 'WINDOW', 'ZOOM', 'MEMORY', 'UNDEFINED', 'INVALID'];
const seenStrings = new Set();
for (let addr = 0; addr < rom.length; addr++) {
  if (byte(addr) >= 0x20 && byte(addr) < 0x7F) {
    let str = '';
    let a = addr;
    while (a < rom.length && byte(a) >= 0x20 && byte(a) < 0x7F) {
      str += String.fromCharCode(byte(a));
      a++;
    }
    if (str.length >= 4 && errorNeedles.some((needle) => str.includes(needle))) {
      const key = `${addr}:${str}`;
      if (!seenStrings.has(key)) {
        console.log(`  ${hex6(addr)}: "${str}"`);
        seenStrings.add(key);
      }
    }
    addr = a;
  }
}

console.log('\n=== XREF SCAN for 0x03EA5E ===');
let xrefs = 0;
for (let i = 0; i < rom.length - 2; i++) {
  if (byte(i) === 0x5E && byte(i + 1) === 0xEA && byte(i + 2) === 0x03) {
    if (i > 0 && (byte(i - 1) === 0xCD || byte(i - 1) === 0xC3)) {
      const op = byte(i - 1) === 0xCD ? 'CALL' : 'JP';
      console.log(`  ${op} ref at ${hex6(i - 1)}`);
      xrefs++;
    } else {
      console.log(`  raw pointer at ${hex6(i)}`);
    }
  }
}
console.log(`Total CALL/JP xrefs: ${xrefs}`);
