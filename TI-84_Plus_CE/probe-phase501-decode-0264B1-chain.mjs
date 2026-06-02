import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

// Known RAM addresses of interest
const KNOWN_ADDRS = {
  0xD008D2: 'VRAM_base_lo',
  0xD008D5: 'VRAM_base_hi',
  0xD00595: 'cursor_row',
  0xD00596: 'cursor_col',
  0xD001A8: 'loop_counter',
  0xD001F1: 'loop_limit',
  0xD02440: 'D02440',
  0xD0243D: 'D0243D',
  0xD001A7: 'D001A7',
  0xD007E0: 'screen_mode',
};

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function word24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function rel8(addr) {
  const v = byte(addr);
  return v < 0x80 ? v : v - 0x100;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function addrAnnotation(target) {
  if (KNOWN_ADDRS[target]) return `  ; ${KNOWN_ADDRS[target]}`;
  return '';
}

function decode(addr) {
  const op = byte(addr);
  const next = byte(addr + 1);

  // CALL nn
  if (op === 0xcd) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `CALL ${hex(target)}`, kind: 'CALL', target };
  }

  // JP nn
  if (op === 0xc3) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `JP ${hex(target)}`, kind: 'JP', target };
  }

  // Conditional JP
  if (op === 0xca || op === 0xc2) {
    const target = word24(addr + 1);
    const cc = op === 0xca ? 'Z' : 'NZ';
    return { size: 4, mnemonic: `JP ${cc},${hex(target)}`, kind: 'JP', target };
  }
  if (op === 0xda || op === 0xd2) {
    const target = word24(addr + 1);
    const cc = op === 0xda ? 'C' : 'NC';
    return { size: 4, mnemonic: `JP ${cc},${hex(target)}`, kind: 'JP', target };
  }

  // Conditional CALL
  if (op === 0xcc || op === 0xc4) {
    const target = word24(addr + 1);
    const cc = op === 0xcc ? 'Z' : 'NZ';
    return { size: 4, mnemonic: `CALL ${cc},${hex(target)}`, kind: 'CALL', target };
  }
  if (op === 0xdc || op === 0xd4) {
    const target = word24(addr + 1);
    const cc = op === 0xdc ? 'C' : 'NC';
    return { size: 4, mnemonic: `CALL ${cc},${hex(target)}`, kind: 'CALL', target };
  }

  // JR variants
  if (op === 0x20 || op === 0x28 || op === 0x18 || op === 0x30 || op === 0x38) {
    const target = addr + 2 + rel8(addr + 1);
    const names = { 0x20: 'JR NZ', 0x28: 'JR Z', 0x18: 'JR', 0x30: 'JR NC', 0x38: 'JR C' };
    return { size: 2, mnemonic: `${names[op]} ${hex(target)}`, kind: 'JR', target };
  }

  // DJNZ
  if (op === 0x10) {
    const target = addr + 2 + rel8(addr + 1);
    return { size: 2, mnemonic: `DJNZ ${hex(target)}`, kind: 'JR', target };
  }

  // FD CB prefix: IY bit ops
  if (op === 0xfd && next === 0xcb) {
    const disp = byte(addr + 2);
    const bitop = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    const iyAddr = 0xD00080 + (disp < 0x80 ? disp : disp - 0x100);
    const group = bitop & 0xc0;
    const bit = (bitop >> 3) & 7;
    const action = group === 0x40 ? 'BIT' : group === 0x80 ? 'RES' : group === 0xc0 ? 'SET' : 'ROT';
    const annotation = KNOWN_ADDRS[iyAddr] ? `  ; ${hex(iyAddr)} = ${KNOWN_ADDRS[iyAddr]}` : `  ; ${hex(iyAddr)}`;
    if (action === 'ROT') {
      return { size: 4, mnemonic: `FD CB ${hex(disp, 2)} ${hex(bitop, 2)}${annotation}` };
    }
    return { size: 4, mnemonic: `${action} ${bit},(IY${signed})${annotation}` };
  }

  // DD prefix: IX ops
  if (op === 0xdd) {
    if (next === 0x7e) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD A,(IX+${hex(d, 2)})` }; }
    if (next === 0x46) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD B,(IX+${hex(d, 2)})` }; }
    if (next === 0x4e) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD C,(IX+${hex(d, 2)})` }; }
    if (next === 0x56) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD D,(IX+${hex(d, 2)})` }; }
    if (next === 0x5e) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD E,(IX+${hex(d, 2)})` }; }
    if (next === 0x66) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD H,(IX+${hex(d, 2)})` }; }
    if (next === 0x6e) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD L,(IX+${hex(d, 2)})` }; }
    if (next === 0x77) { const d = byte(addr + 2); return { size: 3, mnemonic: `LD (IX+${hex(d, 2)}),A` }; }
    if (next === 0x36) {
      const d = byte(addr + 2); const v = byte(addr + 3);
      return { size: 4, mnemonic: `LD (IX+${hex(d, 2)}),${hex(v, 2)}` };
    }
    if (next === 0xe5) return { size: 2, mnemonic: 'PUSH IX' };
    if (next === 0xe1) return { size: 2, mnemonic: 'POP IX' };
    if (next === 0x21) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD IX,${hex(target)}` }; }
    if (next === 0xe9) return { size: 2, mnemonic: 'JP (IX)' };
    if (next === 0x23) return { size: 2, mnemonic: 'INC IX' };
    if (next === 0x2b) return { size: 2, mnemonic: 'DEC IX' };
    if (next === 0x09) return { size: 2, mnemonic: 'ADD IX,BC' };
    if (next === 0x19) return { size: 2, mnemonic: 'ADD IX,DE' };
    if (next === 0x29) return { size: 2, mnemonic: 'ADD IX,IX' };
    if (next === 0x39) return { size: 2, mnemonic: 'ADD IX,SP' };
    return { size: 2, mnemonic: `DD ${hex(next, 2)}` };
  }

  // FD prefix (non-CB): IY ops
  if (op === 0xfd && next !== 0xcb) {
    if (next === 0x7e) {
      const d = byte(addr + 2);
      const iyAddr = 0xD00080 + d;
      const ann = KNOWN_ADDRS[iyAddr] ? `  ; ${hex(iyAddr)} = ${KNOWN_ADDRS[iyAddr]}` : `  ; ${hex(iyAddr)}`;
      return { size: 3, mnemonic: `LD A,(IY+${hex(d, 2)})${ann}` };
    }
    if (next === 0x77) {
      const d = byte(addr + 2);
      const iyAddr = 0xD00080 + d;
      const ann = KNOWN_ADDRS[iyAddr] ? `  ; ${hex(iyAddr)} = ${KNOWN_ADDRS[iyAddr]}` : `  ; ${hex(iyAddr)}`;
      return { size: 3, mnemonic: `LD (IY+${hex(d, 2)}),A${ann}` };
    }
    if (next === 0x36) {
      const d = byte(addr + 2); const v = byte(addr + 3);
      const iyAddr = 0xD00080 + d;
      const ann = KNOWN_ADDRS[iyAddr] ? `  ; ${hex(iyAddr)} = ${KNOWN_ADDRS[iyAddr]}` : `  ; ${hex(iyAddr)}`;
      return { size: 4, mnemonic: `LD (IY+${hex(d, 2)}),${hex(v, 2)}${ann}` };
    }
    if (next === 0xe5) return { size: 2, mnemonic: 'PUSH IY' };
    if (next === 0xe1) return { size: 2, mnemonic: 'POP IY' };
    if (next === 0x21) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD IY,${hex(target)}` }; }
    if (next === 0xe9) return { size: 2, mnemonic: 'JP (IY)' };
    if (next === 0x23) return { size: 2, mnemonic: 'INC IY' };
    if (next === 0x2b) return { size: 2, mnemonic: 'DEC IY' };
    return { size: 2, mnemonic: `FD ${hex(next, 2)}` };
  }

  // ED prefix: extended ops
  if (op === 0xed) {
    if (next === 0x5b) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD DE,(${hex(target)})${addrAnnotation(target)}`, target }; }
    if (next === 0x4b) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD BC,(${hex(target)})${addrAnnotation(target)}`, target }; }
    if (next === 0x7b) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD SP,(${hex(target)})${addrAnnotation(target)}`, target }; }
    if (next === 0x53) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD (${hex(target)}),DE${addrAnnotation(target)}`, target }; }
    if (next === 0x43) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD (${hex(target)}),BC${addrAnnotation(target)}`, target }; }
    if (next === 0x73) { const target = word24(addr + 2); return { size: 5, mnemonic: `LD (${hex(target)}),SP${addrAnnotation(target)}`, target }; }
    if (next === 0x42) return { size: 2, mnemonic: 'SBC HL,BC' };
    if (next === 0x52) return { size: 2, mnemonic: 'SBC HL,DE' };
    if (next === 0x62) return { size: 2, mnemonic: 'SBC HL,HL' };
    if (next === 0x72) return { size: 2, mnemonic: 'SBC HL,SP' };
    if (next === 0x4a) return { size: 2, mnemonic: 'ADC HL,BC' };
    if (next === 0x5a) return { size: 2, mnemonic: 'ADC HL,DE' };
    if (next === 0x6a) return { size: 2, mnemonic: 'ADC HL,HL' };
    if (next === 0x7a) return { size: 2, mnemonic: 'ADC HL,SP' };
    if (next === 0xb0) return { size: 2, mnemonic: 'LDIR' };
    if (next === 0xb8) return { size: 2, mnemonic: 'LDDR' };
    if (next === 0xa0) return { size: 2, mnemonic: 'LDI' };
    if (next === 0xa8) return { size: 2, mnemonic: 'LDD' };
    if (next === 0x44) return { size: 2, mnemonic: 'NEG' };
    if (next === 0x4d) return { size: 2, mnemonic: 'RETI' };
    if (next === 0x45) return { size: 2, mnemonic: 'RETN' };
    if (next === 0x46) return { size: 2, mnemonic: 'IM 0' };
    if (next === 0x56) return { size: 2, mnemonic: 'IM 1' };
    if (next === 0x5e) return { size: 2, mnemonic: 'IM 2' };
    if (next === 0x47) return { size: 2, mnemonic: 'LD I,A' };
    if (next === 0x57) return { size: 2, mnemonic: 'LD A,I' };
    if (next === 0x4f) return { size: 2, mnemonic: 'LD R,A' };
    if (next === 0x5f) return { size: 2, mnemonic: 'LD A,R' };
    return { size: 2, mnemonic: `ED ${hex(next, 2)}` };
  }

  // CB prefix: bit/rotate ops
  if (op === 0xcb) {
    const group = next & 0xc0;
    const bit = (next >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[next & 7];
    if (group === 0x00) {
      const rotNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { size: 2, mnemonic: `${rotNames[bit]} ${reg}` };
    }
    if (group === 0x40) return { size: 2, mnemonic: `BIT ${bit},${reg}` };
    if (group === 0x80) return { size: 2, mnemonic: `RES ${bit},${reg}` };
    if (group === 0xc0) return { size: 2, mnemonic: `SET ${bit},${reg}` };
  }

  // LD A,(addr)
  if (op === 0x3a) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD A,(${hex(target)})${addrAnnotation(target)}`, target };
  }

  // LD (addr),A
  if (op === 0x32) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD (${hex(target)}),A${addrAnnotation(target)}`, target };
  }

  // LD HL,(addr)
  if (op === 0x2a) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD HL,(${hex(target)})${addrAnnotation(target)}`, target };
  }

  // LD (addr),HL
  if (op === 0x22) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD (${hex(target)}),HL${addrAnnotation(target)}`, target };
  }

  // LD rr,imm24
  if (op === 0x21) {
    const imm = word24(addr + 1);
    return { size: 4, mnemonic: `LD HL,${hex(imm)}${addrAnnotation(imm)}` };
  }
  if (op === 0x11) {
    const imm = word24(addr + 1);
    return { size: 4, mnemonic: `LD DE,${hex(imm)}${addrAnnotation(imm)}` };
  }
  if (op === 0x01) {
    const imm = word24(addr + 1);
    return { size: 4, mnemonic: `LD BC,${hex(imm)}${addrAnnotation(imm)}` };
  }
  if (op === 0x31) {
    const imm = word24(addr + 1);
    return { size: 4, mnemonic: `LD SP,${hex(imm)}` };
  }

  // CP imm8
  if (op === 0xfe) return { size: 2, mnemonic: `CP A,${hex(next, 2)}` };
  // AND imm8
  if (op === 0xe6) return { size: 2, mnemonic: `AND ${hex(next, 2)}` };
  // OR imm8
  if (op === 0xf6) return { size: 2, mnemonic: `OR ${hex(next, 2)}` };
  // XOR imm8
  if (op === 0xee) return { size: 2, mnemonic: `XOR ${hex(next, 2)}` };
  // ADD A,imm8
  if (op === 0xc6) return { size: 2, mnemonic: `ADD A,${hex(next, 2)}` };
  // SUB imm8
  if (op === 0xd6) return { size: 2, mnemonic: `SUB ${hex(next, 2)}` };
  // ADC A,imm8
  if (op === 0xce) return { size: 2, mnemonic: `ADC A,${hex(next, 2)}` };
  // SBC A,imm8
  if (op === 0xde) return { size: 2, mnemonic: `SBC A,${hex(next, 2)}` };

  // RST
  if ((op & 0xc7) === 0xc7) {
    const vec = op & 0x38;
    return { size: 1, mnemonic: `RST ${hex(vec, 2)}` };
  }

  // One-byte instructions
  const oneByte = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B',
    0x07: 'RLCA', 0x08: "EX AF,AF'", 0x09: 'ADD HL,BC', 0x0a: 'LD A,(BC)',
    0x0b: 'DEC BC', 0x0c: 'INC C', 0x0d: 'DEC C', 0x0f: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D',
    0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1a: 'LD A,(DE)',
    0x1b: 'DEC DE', 0x1c: 'INC E', 0x1d: 'DEC E', 0x1f: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x29: 'ADD HL,HL', 0x2b: 'DEC HL', 0x2c: 'INC L', 0x2d: 'DEC L',
    0x2f: 'CPL', 0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)',
    0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3b: 'DEC SP', 0x3c: 'INC A', 0x3d: 'DEC A',
    0x3f: 'CCF',
    0x40: 'LD B,B', 0x41: 'LD B,C', 0x42: 'LD B,D', 0x43: 'LD B,E',
    0x44: 'LD B,H', 0x45: 'LD B,L', 0x46: 'LD B,(HL)', 0x47: 'LD B,A',
    0x48: 'LD C,B', 0x49: 'LD C,C', 0x4a: 'LD C,D', 0x4b: 'LD C,E',
    0x4c: 'LD C,H', 0x4d: 'LD C,L', 0x4e: 'LD C,(HL)', 0x4f: 'LD C,A',
    0x50: 'LD D,B', 0x51: 'LD D,C', 0x52: 'LD D,D', 0x53: 'LD D,E',
    0x54: 'LD D,H', 0x55: 'LD D,L', 0x56: 'LD D,(HL)', 0x57: 'LD D,A',
    0x58: 'LD E,B', 0x59: 'LD E,C', 0x5a: 'LD E,D', 0x5b: 'LD E,E',
    0x5c: 'LD E,H', 0x5d: 'LD E,L', 0x5e: 'LD E,(HL)', 0x5f: 'LD E,A',
    0x60: 'LD H,B', 0x61: 'LD H,C', 0x62: 'LD H,D', 0x63: 'LD H,E',
    0x64: 'LD H,H', 0x65: 'LD H,L', 0x66: 'LD H,(HL)', 0x67: 'LD H,A',
    0x68: 'LD L,B', 0x69: 'LD L,C', 0x6a: 'LD L,D', 0x6b: 'LD L,E',
    0x6c: 'LD L,H', 0x6d: 'LD L,L', 0x6e: 'LD L,(HL)', 0x6f: 'LD L,A',
    0x70: 'LD (HL),B', 0x71: 'LD (HL),C', 0x72: 'LD (HL),D', 0x73: 'LD (HL),E',
    0x74: 'LD (HL),H', 0x75: 'LD (HL),L', 0x76: 'HALT', 0x77: 'LD (HL),A',
    0x78: 'LD A,B', 0x79: 'LD A,C', 0x7a: 'LD A,D', 0x7b: 'LD A,E',
    0x7c: 'LD A,H', 0x7d: 'LD A,L', 0x7e: 'LD A,(HL)', 0x7f: 'LD A,A',
    0x80: 'ADD A,B', 0x81: 'ADD A,C', 0x82: 'ADD A,D', 0x83: 'ADD A,E',
    0x84: 'ADD A,H', 0x85: 'ADD A,L', 0x86: 'ADD A,(HL)', 0x87: 'ADD A,A',
    0x88: 'ADC A,B', 0x89: 'ADC A,C', 0x8a: 'ADC A,D', 0x8b: 'ADC A,E',
    0x8c: 'ADC A,H', 0x8d: 'ADC A,L', 0x8e: 'ADC A,(HL)', 0x8f: 'ADC A,A',
    0x90: 'SUB B', 0x91: 'SUB C', 0x92: 'SUB D', 0x93: 'SUB E',
    0x94: 'SUB H', 0x95: 'SUB L', 0x96: 'SUB (HL)', 0x97: 'SUB A',
    0x98: 'SBC A,B', 0x99: 'SBC A,C', 0x9a: 'SBC A,D', 0x9b: 'SBC A,E',
    0x9c: 'SBC A,H', 0x9d: 'SBC A,L', 0x9e: 'SBC A,(HL)', 0x9f: 'SBC A,A',
    0xa0: 'AND B', 0xa1: 'AND C', 0xa2: 'AND D', 0xa3: 'AND E',
    0xa4: 'AND H', 0xa5: 'AND L', 0xa6: 'AND (HL)', 0xa7: 'AND A',
    0xa8: 'XOR B', 0xa9: 'XOR C', 0xaa: 'XOR D', 0xab: 'XOR E',
    0xac: 'XOR H', 0xad: 'XOR L', 0xae: 'XOR (HL)', 0xaf: 'XOR A',
    0xb0: 'OR B', 0xb1: 'OR C', 0xb2: 'OR D', 0xb3: 'OR E',
    0xb4: 'OR H', 0xb5: 'OR L', 0xb6: 'OR (HL)', 0xb7: 'OR A',
    0xb8: 'CP B', 0xb9: 'CP C', 0xba: 'CP D', 0xbb: 'CP E',
    0xbc: 'CP H', 0xbd: 'CP L', 0xbe: 'CP (HL)', 0xbf: 'CP A',
    0xc0: 'RET NZ', 0xc1: 'POP BC', 0xc5: 'PUSH BC', 0xc8: 'RET Z', 0xc9: 'RET',
    0xd0: 'RET NC', 0xd1: 'POP DE', 0xd5: 'PUSH DE', 0xd8: 'RET C', 0xd9: 'EXX',
    0xe0: 'RET PO', 0xe1: 'POP HL', 0xe3: 'EX (SP),HL', 0xe5: 'PUSH HL',
    0xe8: 'RET PE', 0xe9: 'JP (HL)', 0xeb: 'EX DE,HL',
    0xf0: 'RET P', 0xf1: 'POP AF', 0xf3: 'DI', 0xf5: 'PUSH AF',
    0xf8: 'RET M', 0xf9: 'LD SP,HL', 0xfb: 'EI',
  };

  if (oneByte[op]) return { size: 1, mnemonic: oneByte[op] };

  // Two-byte loads
  const twoByteLoads = {
    0x06: 'LD B', 0x0e: 'LD C', 0x16: 'LD D', 0x1e: 'LD E',
    0x26: 'LD H', 0x2e: 'LD L', 0x36: 'LD (HL)', 0x3e: 'LD A',
    0xd3: 'OUT', 0xdb: 'IN A',
  };

  if (twoByteLoads[op]) return { size: 2, mnemonic: `${twoByteLoads[op]},${hex(next, 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

// Disassemble a function from start address, stop at RET or maxBytes
function disassembleFunction(name, startAddr, maxBytes = 200) {
  console.log('');
  console.log('='.repeat(70));
  console.log(`  FUNCTION: ${name} @ ${hex(startAddr)}`);
  console.log('='.repeat(70));

  const rows = [];
  const calls = [];
  const jumps = [];
  const ramRefs = [];
  const shiftOps = [];
  let addr = startAddr;
  const limit = startAddr + maxBytes;
  let hitRet = false;

  while (addr < limit) {
    const d = decode(addr);
    const raw = bytesAt(addr, d.size);
    rows.push({ addr, ...d, raw });

    // Track CALL/JP/JR
    if (d.kind === 'CALL') calls.push({ from: addr, target: d.target });
    if (d.kind === 'JP' || d.kind === 'JR') jumps.push({ from: addr, kind: d.kind, target: d.target });

    // Track RAM references in mnemonic
    for (const [addrVal, label] of Object.entries(KNOWN_ADDRS)) {
      if (d.mnemonic.includes(hex(parseInt(addrVal)))) {
        ramRefs.push({ addr, label, ramAddr: parseInt(addrVal), mnemonic: d.mnemonic });
      }
    }

    // Track shift/multiply patterns
    if (d.mnemonic.includes('SLA') || d.mnemonic.includes('SRL') || d.mnemonic.includes('SRA') ||
        d.mnemonic === 'ADD HL,HL' || d.mnemonic.includes('RLA') || d.mnemonic.includes('RLC') ||
        d.mnemonic.includes('RL ') || d.mnemonic === 'ADD A,A') {
      shiftOps.push({ addr, mnemonic: d.mnemonic });
    }

    // Stop after unconditional RET
    if (d.mnemonic === 'RET') {
      hitRet = true;
      // Decode a few more bytes to catch tail code / second entry point
      const extLimit = Math.min(addr + d.size + 16, limit);
      addr += d.size;
      while (addr < extLimit) {
        const d2 = decode(addr);
        const raw2 = bytesAt(addr, d2.size);
        rows.push({ addr, ...d2, raw: raw2 });
        if (d2.kind === 'CALL') calls.push({ from: addr, target: d2.target });
        if (d2.kind === 'JP' || d2.kind === 'JR') jumps.push({ from: addr, kind: d2.kind, target: d2.target });
        for (const [addrVal, label] of Object.entries(KNOWN_ADDRS)) {
          if (d2.mnemonic.includes(hex(parseInt(addrVal)))) {
            ramRefs.push({ addr, label, ramAddr: parseInt(addrVal), mnemonic: d2.mnemonic });
          }
        }
        if (d2.mnemonic.includes('SLA') || d2.mnemonic.includes('SRL') || d2.mnemonic.includes('SRA') ||
            d2.mnemonic === 'ADD HL,HL' || d2.mnemonic.includes('RLA') || d2.mnemonic.includes('RLC') ||
            d2.mnemonic.includes('RL ') || d2.mnemonic === 'ADD A,A') {
          shiftOps.push({ addr, mnemonic: d2.mnemonic });
        }
        addr += d2.size;
      }
      break;
    }

    addr += d.size;
  }

  // Print disassembly
  for (const row of rows) {
    console.log(`  ${hex(row.addr)}  ${row.raw.padEnd(18)}  ${row.mnemonic}`);
  }

  const totalBytes = rows.length > 0 ? rows[rows.length - 1].addr + rows[rows.length - 1].size - startAddr : 0;
  console.log(`  --- ${totalBytes} bytes total ---`);

  // Print CALL targets
  console.log('');
  console.log('  CALL targets:');
  if (calls.length === 0) {
    console.log('    (none)');
  } else {
    for (const c of calls) console.log(`    ${hex(c.from)} -> CALL ${hex(c.target)}`);
  }

  // Print JP/JR targets
  console.log('  JP/JR targets:');
  if (jumps.length === 0) {
    console.log('    (none)');
  } else {
    for (const j of jumps) console.log(`    ${hex(j.from)} ${j.kind} -> ${hex(j.target)}`);
  }

  // Print known RAM refs
  console.log('  Known RAM references:');
  if (ramRefs.length === 0) {
    console.log('    (none)');
  } else {
    for (const r of ramRefs) console.log(`    ${hex(r.addr)}: ${r.label} (${hex(r.ramAddr)})`);
  }

  // Print shift/multiply ops
  console.log('  Shift/multiply ops (pixel math?):');
  if (shiftOps.length === 0) {
    console.log('    (none)');
  } else {
    for (const s of shiftOps) console.log(`    ${hex(s.addr)}: ${s.mnemonic}`);
  }

  return { rows, calls, jumps, ramRefs, shiftOps };
}

// ===================================================================
//  MAIN
// ===================================================================

console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length.toLocaleString()} bytes`);
console.log('');
console.log('Decoding 4 functions in the 0x0264B1 VRAM address computation chain');

const fn1 = disassembleFunction('0x0264B1 -- cursor row iteration', 0x0264B1, 200);
const fn2 = disassembleFunction('0x05E386 -- per-row callback', 0x05E386, 200);
const fn3 = disassembleFunction('0x025C33 -- post-loop call', 0x025C33, 200);
const fn4 = disassembleFunction('0x0263D5 -- possible VRAM calc', 0x0263D5, 200);

// Reference: save/restore wrapper
const fn5 = disassembleFunction('0x05E4F2 -- save/restore wrapper (reference)', 0x05E4F2, 150);

// ===================================================================
//  FOLLOW CALL TARGETS — decode any subroutines called by the above
// ===================================================================
console.log('');
console.log('='.repeat(70));
console.log('  FOLLOWING NESTED CALL TARGETS');
console.log('='.repeat(70));

const mainFunctions = new Set([0x0264B1, 0x05E386, 0x025C33, 0x0263D5, 0x05E4F2]);
const allCallTargets = new Set();
for (const fn of [fn1, fn2, fn3, fn4, fn5]) {
  for (const c of fn.calls) {
    if (!mainFunctions.has(c.target)) allCallTargets.add(c.target);
  }
}

const nestedFns = [];
for (const target of [...allCallTargets].sort((a, b) => a - b)) {
  // Only decode targets that look like ROM code (< 0x400000)
  if (target < 0x400000) {
    const nfn = disassembleFunction(`nested target`, target, 100);
    nestedFns.push({ addr: target, ...nfn });
  }
}

// ===================================================================
//  SUMMARY
// ===================================================================
console.log('');
console.log('='.repeat(70));
console.log('  SUMMARY');
console.log('='.repeat(70));

// Collect all unique CALL targets
const allCalls = new Set();
for (const fn of [fn1, fn2, fn3, fn4, fn5]) {
  for (const c of fn.calls) allCalls.add(c.target);
}
console.log('');
console.log('All CALL targets across 5 main functions:');
for (const t of [...allCalls].sort((a, b) => a - b)) {
  console.log(`  ${hex(t)}`);
}

const fnEntries = [['0x0264B1', fn1], ['0x05E386', fn2], ['0x025C33', fn3], ['0x0263D5', fn4], ['0x05E4F2', fn5]];

// Which functions reference key RAM?
for (const [ramAddr, label] of Object.entries(KNOWN_ADDRS)) {
  const refs = fnEntries.filter(([, fn]) => fn.ramRefs.some(r => r.ramAddr === parseInt(ramAddr)));
  if (refs.length > 0) {
    console.log(`\nFunctions referencing ${label} (${hex(parseInt(ramAddr))}):`);
    for (const [name] of refs) console.log(`  ${name}`);
  }
}

// Shift/multiply summary
console.log('');
console.log('Functions with shift/multiply patterns:');
for (const [name, fn] of fnEntries) {
  if (fn.shiftOps.length > 0) {
    console.log(`  ${name}: ${fn.shiftOps.map(s => s.mnemonic).join(', ')}`);
  }
}

console.log('');
console.log('DONE');
