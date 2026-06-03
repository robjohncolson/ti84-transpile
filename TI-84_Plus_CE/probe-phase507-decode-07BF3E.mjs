import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join(import.meta.dirname, 'ROM.rom');
const START = 0x07BF3E;
const LIMIT = 300;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteAt(offset) {
  if (offset >= rom.length) {
    throw new Error(`Read past ROM end at ${hex(offset, 6)}`);
  }
  return rom[offset];
}

function u24(offset) {
  return byteAt(offset) | (byteAt(offset + 1) << 8) | (byteAt(offset + 2) << 16);
}

function u16(offset) {
  return byteAt(offset) | (byteAt(offset + 1) << 8);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, length, displacement) {
  return (pc + length + signed8(displacement)) & 0xFFFFFF;
}

function bytesText(offset, length) {
  return Array.from(rom.subarray(offset, offset + length), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

const calls = [];
const jumps = [];
const bCalls = [];
const memoryRefs = [];
const ramRefs = [];
const romTableRefs = [];
const vramRefs = [];
const ioRefs = [];
let firstUnconditionalRet = null;

function noteMemory(kind, addr, pc) {
  const ref = { kind, addr, pc };
  memoryRefs.push(ref);
  if (addr >= 0xD00000 && addr <= 0xD3FFFF) {
    ramRefs.push(ref);
  }
  if (addr >= 0xD40000 && addr <= 0xD65800) {
    vramRefs.push(ref);
  }
  if (addr >= 0x000000 && addr < 0x400000) {
    romTableRefs.push(ref);
  }
}

function decodeCb(offset, prefixText = '') {
  const opcode = byteAt(offset);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const bit = (opcode >> 3) & 7;
  const reg = regs[opcode & 7];
  if (opcode < 0x40) return `${prefixText}${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][opcode >> 3]} ${reg}`;
  if (opcode < 0x80) return `${prefixText}BIT ${bit},${reg}`;
  if (opcode < 0xC0) return `${prefixText}RES ${bit},${reg}`;
  return `${prefixText}SET ${bit},${reg}`;
}

function decodeEd(offset, pc) {
  const opcode = byteAt(offset);
  switch (opcode) {
    case 0x4B: {
      const addr = u24(offset + 1);
      noteMemory('LD BC,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD BC,(${hex(addr, 6)})` };
    }
    case 0x43: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),BC', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),BC` };
    }
    case 0x5B: {
      const addr = u24(offset + 1);
      noteMemory('LD DE,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD DE,(${hex(addr, 6)})` };
    }
    case 0x53: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),DE', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),DE` };
    }
    case 0x6B: {
      const addr = u24(offset + 1);
      noteMemory('LD HL,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD HL,(${hex(addr, 6)})` };
    }
    case 0x63: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),HL', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),HL` };
    }
    case 0x7B: {
      const addr = u24(offset + 1);
      noteMemory('LD SP,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD SP,(${hex(addr, 6)})` };
    }
    case 0x73: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),SP', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),SP` };
    }
    case 0x44:
      return { length: 2, mnemonic: 'NEG' };
    case 0x4C:
      return { length: 2, mnemonic: 'MLT BC' };
    case 0x54:
      return { length: 2, mnemonic: 'MLT DE' };
    case 0x5C:
      return { length: 2, mnemonic: 'MLT DE' };
    case 0x6C:
      return { length: 2, mnemonic: 'MLT HL' };
    case 0x78:
      ioRefs.push({ kind: 'IN A,(C)', pc });
      return { length: 2, mnemonic: 'IN A,(C)' };
    case 0x79:
      ioRefs.push({ kind: 'OUT (C),A', pc });
      return { length: 2, mnemonic: 'OUT (C),A' };
    case 0xA0:
      return { length: 2, mnemonic: 'LDI' };
    case 0xA1:
      return { length: 2, mnemonic: 'CPI' };
    case 0xA8:
      return { length: 2, mnemonic: 'LDD' };
    case 0xB0:
      return { length: 2, mnemonic: 'LDIR' };
    case 0xB1:
      return { length: 2, mnemonic: 'CPIR' };
    case 0xB8:
      return { length: 2, mnemonic: 'LDDR' };
    case 0x46:
      return { length: 2, mnemonic: 'IM 0' };
    case 0x56:
      return { length: 2, mnemonic: 'IM 1' };
    case 0x5E:
      return { length: 2, mnemonic: 'IM 2' };
    case 0x47:
      return { length: 2, mnemonic: 'LD I,A' };
    case 0x4F:
      return { length: 2, mnemonic: 'LD R,A' };
    case 0x57:
      return { length: 2, mnemonic: 'LD A,I' };
    case 0x5F:
      return { length: 2, mnemonic: 'LD A,R' };
    case 0x42:
      return { length: 2, mnemonic: 'SBC HL,BC' };
    case 0x52:
      return { length: 2, mnemonic: 'SBC HL,DE' };
    case 0x62:
      return { length: 2, mnemonic: 'SBC HL,HL' };
    case 0x72:
      return { length: 2, mnemonic: 'SBC HL,SP' };
    case 0x4A:
      return { length: 2, mnemonic: 'ADC HL,BC' };
    case 0x5A:
      return { length: 2, mnemonic: 'ADC HL,DE' };
    case 0x6A:
      return { length: 2, mnemonic: 'ADC HL,HL' };
    case 0x7A:
      return { length: 2, mnemonic: 'ADC HL,SP' };
    case 0x67:
      return { length: 2, mnemonic: 'RRD' };
    case 0x6F:
      return { length: 2, mnemonic: 'RLD' };
    case 0x45:
      return { length: 2, mnemonic: 'RETN' };
    case 0x4D:
      return { length: 2, mnemonic: 'RETI' };
    default:
      return { length: 2, mnemonic: `ED ${opcode.toString(16).toUpperCase().padStart(2, '0')}` };
  }
}

function decodeIndex(prefix, offset, pc) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const opcode = byteAt(offset);
  switch (opcode) {
    case 0x21: {
      const value = u24(offset + 1);
      return { length: 5, mnemonic: `LD ${reg},${hex(value, 6)}` };
    }
    case 0x22: {
      const addr = u24(offset + 1);
      noteMemory(`LD (nn),${reg}`, addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),${reg}` };
    }
    case 0x23:
      return { length: 2, mnemonic: `INC ${reg}` };
    case 0x2A: {
      const addr = u24(offset + 1);
      noteMemory(`LD ${reg},(nn)`, addr, pc);
      return { length: 5, mnemonic: `LD ${reg},(${hex(addr, 6)})` };
    }
    case 0x2B:
      return { length: 2, mnemonic: `DEC ${reg}` };
    case 0x36: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 4, mnemonic: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${hex(byteAt(offset + 2), 2)}` };
    }
    case 0x46: case 0x4E: case 0x56: case 0x5E: case 0x66: case 0x6E: case 0x7E: {
      const disp = signed8(byteAt(offset + 1));
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const dst = regs8[(opcode >> 3) & 7];
      return { length: 3, mnemonic: `LD ${dst},(${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77: {
      const disp = signed8(byteAt(offset + 1));
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const src = regs8[opcode & 7];
      return { length: 3, mnemonic: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${src}` };
    }
    case 0x86: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `ADD A,(${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0x8E: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `ADC A,(${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0x96: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `SUB (${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0x9E: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `SBC A,(${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0xA6: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `AND (${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0xAE: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `XOR (${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0xB6: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `OR (${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0xBE: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 3, mnemonic: `CP (${reg}${disp >= 0 ? '+' : ''}${disp})` };
    }
    case 0xCB: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 4, mnemonic: decodeCb(offset + 2, `(${reg}${disp >= 0 ? '+' : ''}${disp}): `) };
    }
    case 0xE1:
      return { length: 2, mnemonic: `POP ${reg}` };
    case 0xE3:
      return { length: 2, mnemonic: `EX (SP),${reg}` };
    case 0xE5:
      return { length: 2, mnemonic: `PUSH ${reg}` };
    case 0xE9:
      return { length: 2, mnemonic: `JP (${reg})` };
    case 0xF9:
      return { length: 2, mnemonic: `LD SP,${reg}` };
    case 0x09:
      return { length: 2, mnemonic: `ADD ${reg},BC` };
    case 0x19:
      return { length: 2, mnemonic: `ADD ${reg},DE` };
    case 0x29:
      return { length: 2, mnemonic: `ADD ${reg},${reg}` };
    case 0x39:
      return { length: 2, mnemonic: `ADD ${reg},SP` };
    default:
      return { length: 2, mnemonic: `${reg} prefix opcode ${hex(opcode, 2)}` };
  }
}

function decodeBase(offset, pc) {
  const opcode = byteAt(offset);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  // .SIS/.SIL/.LIS/.LIL prefixes
  if (opcode === 0x40) {
    const inner = decodeBasePlain(offset + 1, pc + 1);
    return { length: inner.length + 1, mnemonic: `.SIS ${inner.mnemonic}` };
  }
  if (opcode === 0x49) {
    const inner = decodeBasePlain(offset + 1, pc + 1);
    return { length: inner.length + 1, mnemonic: `.SIL ${inner.mnemonic}` };
  }
  if (opcode === 0x52) {
    const inner = decodeBasePlain(offset + 1, pc + 1);
    return { length: inner.length + 1, mnemonic: `.LIS ${inner.mnemonic}` };
  }
  if (opcode === 0x5B) {
    const inner = decodeBasePlain(offset + 1, pc + 1);
    return { length: inner.length + 1, mnemonic: `.LIL ${inner.mnemonic}` };
  }

  if (opcode >= 0x40 && opcode <= 0x7F) {
    if (opcode === 0x76) return { length: 1, mnemonic: 'HALT' };
    return { length: 1, mnemonic: `LD ${regs[(opcode >> 3) & 7]},${regs[opcode & 7]}` };
  }
  if (opcode >= 0x80 && opcode <= 0xBF) {
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    return { length: 1, mnemonic: `${ops[(opcode >> 3) & 7]} ${regs[opcode & 7]}` };
  }
  if ((opcode & 0xC7) === 0x06) {
    return { length: 2, mnemonic: `LD ${regs[(opcode >> 3) & 7]},${hex(byteAt(offset + 1), 2)}` };
  }
  if ((opcode & 0xCF) === 0x01) {
    return { length: 4, mnemonic: `LD ${rp[(opcode >> 4) & 3]},${hex(u24(offset + 1), 6)}` };
  }
  if ((opcode & 0xCF) === 0x03) return { length: 1, mnemonic: `INC ${rp[(opcode >> 4) & 3]}` };
  if ((opcode & 0xCF) === 0x0B) return { length: 1, mnemonic: `DEC ${rp[(opcode >> 4) & 3]}` };
  if ((opcode & 0xC7) === 0x04) return { length: 1, mnemonic: `INC ${regs[(opcode >> 3) & 7]}` };
  if ((opcode & 0xC7) === 0x05) return { length: 1, mnemonic: `DEC ${regs[(opcode >> 3) & 7]}` };

  switch (opcode) {
    case 0x00: return { length: 1, mnemonic: 'NOP' };
    case 0x02: return { length: 1, mnemonic: 'LD (BC),A' };
    case 0x07: return { length: 1, mnemonic: 'RLCA' };
    case 0x08: return { length: 1, mnemonic: "EX AF,AF'" };
    case 0x09: return { length: 1, mnemonic: 'ADD HL,BC' };
    case 0x0A: return { length: 1, mnemonic: 'LD A,(BC)' };
    case 0x0F: return { length: 1, mnemonic: 'RRCA' };
    case 0x10: return { length: 2, mnemonic: `DJNZ ${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x12: return { length: 1, mnemonic: 'LD (DE),A' };
    case 0x17: return { length: 1, mnemonic: 'RLA' };
    case 0x18: {
      const target = relTarget(pc, 2, byteAt(offset + 1));
      jumps.push({ kind: 'JR', target, pc });
      return { length: 2, mnemonic: `JR ${hex(target, 6)}` };
    }
    case 0x19: return { length: 1, mnemonic: 'ADD HL,DE' };
    case 0x1A: return { length: 1, mnemonic: 'LD A,(DE)' };
    case 0x1F: return { length: 1, mnemonic: 'RRA' };
    case 0x20: case 0x28: case 0x30: case 0x38: {
      const target = relTarget(pc, 2, byteAt(offset + 1));
      jumps.push({ kind: `JR ${cond[(opcode >> 3) & 3]}`, target, pc });
      return { length: 2, mnemonic: `JR ${cond[(opcode >> 3) & 3]},${hex(target, 6)}` };
    }
    case 0x22: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),HL', addr, pc);
      return { length: 4, mnemonic: `LD (${hex(addr, 6)}),HL` };
    }
    case 0x27: return { length: 1, mnemonic: 'DAA' };
    case 0x29: return { length: 1, mnemonic: 'ADD HL,HL' };
    case 0x2A: {
      const addr = u24(offset + 1);
      noteMemory('LD HL,(nn)', addr, pc);
      return { length: 4, mnemonic: `LD HL,(${hex(addr, 6)})` };
    }
    case 0x2F: return { length: 1, mnemonic: 'CPL' };
    case 0x32: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),A', addr, pc);
      return { length: 4, mnemonic: `LD (${hex(addr, 6)}),A` };
    }
    case 0x37: return { length: 1, mnemonic: 'SCF' };
    case 0x39: return { length: 1, mnemonic: 'ADD HL,SP' };
    case 0x3A: {
      const addr = u24(offset + 1);
      noteMemory('LD A,(nn)', addr, pc);
      return { length: 4, mnemonic: `LD A,(${hex(addr, 6)})` };
    }
    case 0x3F: return { length: 1, mnemonic: 'CCF' };
    case 0xC0: case 0xC8: case 0xD0: case 0xD8: case 0xE0: case 0xE8: case 0xF0: case 0xF8:
      return { length: 1, mnemonic: `RET ${cond[(opcode >> 3) & 7]}` };
    case 0xC1: return { length: 1, mnemonic: 'POP BC' };
    case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
      const target = u24(offset + 1);
      jumps.push({ kind: `JP ${cond[(opcode >> 3) & 7]}`, target, pc });
      return { length: 4, mnemonic: `JP ${cond[(opcode >> 3) & 7]},${hex(target, 6)}` };
    }
    case 0xC3: {
      const target = u24(offset + 1);
      jumps.push({ kind: 'JP', target, pc });
      return { length: 4, mnemonic: `JP ${hex(target, 6)}` };
    }
    case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
      const target = u24(offset + 1);
      calls.push({ target, pc, condition: cond[(opcode >> 3) & 7] });
      return { length: 4, mnemonic: `CALL ${cond[(opcode >> 3) & 7]},${hex(target, 6)}` };
    }
    case 0xC5: return { length: 1, mnemonic: 'PUSH BC' };
    case 0xC6: return { length: 2, mnemonic: `ADD A,${hex(byteAt(offset + 1), 2)}` };
    case 0xC7: return { length: 1, mnemonic: 'RST 00h' };
    case 0xC9:
      if (firstUnconditionalRet === null) firstUnconditionalRet = pc;
      return { length: 1, mnemonic: 'RET' };
    case 0xCD: {
      const target = u24(offset + 1);
      calls.push({ target, pc });
      return { length: 4, mnemonic: `CALL ${hex(target, 6)}` };
    }
    case 0xCE: return { length: 2, mnemonic: `ADC A,${hex(byteAt(offset + 1), 2)}` };
    case 0xCF: return { length: 1, mnemonic: 'RST 08h' };
    case 0xD1: return { length: 1, mnemonic: 'POP DE' };
    case 0xD3:
      ioRefs.push({ kind: `OUT (${hex(byteAt(offset + 1), 2)}),A`, pc });
      return { length: 2, mnemonic: `OUT (${hex(byteAt(offset + 1), 2)}),A` };
    case 0xD5: return { length: 1, mnemonic: 'PUSH DE' };
    case 0xD6: return { length: 2, mnemonic: `SUB ${hex(byteAt(offset + 1), 2)}` };
    case 0xD7: return { length: 1, mnemonic: 'RST 10h' };
    case 0xDB:
      ioRefs.push({ kind: `IN A,(${hex(byteAt(offset + 1), 2)})`, pc });
      return { length: 2, mnemonic: `IN A,(${hex(byteAt(offset + 1), 2)})` };
    case 0xDD: return decodeIndex(0xDD, offset + 1, pc);
    case 0xDF: return { length: 1, mnemonic: 'RST 18h' };
    case 0xE1: return { length: 1, mnemonic: 'POP HL' };
    case 0xE3: return { length: 1, mnemonic: 'EX (SP),HL' };
    case 0xE5: return { length: 1, mnemonic: 'PUSH HL' };
    case 0xE6: return { length: 2, mnemonic: `AND ${hex(byteAt(offset + 1), 2)}` };
    case 0xE7: {
      const index = u16(offset + 1);
      bCalls.push({ index, pc });
      return { length: 3, mnemonic: `RST 28h / BCALL ${hex(index, 4)}` };
    }
    case 0xE9: return { length: 1, mnemonic: 'JP (HL)' };
    case 0xEB: return { length: 1, mnemonic: 'EX DE,HL' };
    case 0xED: return decodeEd(offset + 1, pc);
    case 0xEE: return { length: 2, mnemonic: `XOR ${hex(byteAt(offset + 1), 2)}` };
    case 0xEF: return { length: 1, mnemonic: 'RST 28h' };
    case 0xF1: return { length: 1, mnemonic: 'POP AF' };
    case 0xF3: return { length: 1, mnemonic: 'DI' };
    case 0xF5: return { length: 1, mnemonic: 'PUSH AF' };
    case 0xF6: return { length: 2, mnemonic: `OR ${hex(byteAt(offset + 1), 2)}` };
    case 0xFB: return { length: 1, mnemonic: 'EI' };
    case 0xFD: return decodeIndex(0xFD, offset + 1, pc);
    case 0xFE: return { length: 2, mnemonic: `CP ${hex(byteAt(offset + 1), 2)}` };
    case 0xFF: return { length: 1, mnemonic: 'RST 38h' };
    case 0xCB:
      return { length: 2, mnemonic: decodeCb(offset + 1) };
    default:
      return { length: 1, mnemonic: `DB ${hex(opcode, 2)}` };
  }
}

// Plain decoder for .SIS/.SIL/.LIS/.LIL prefixed instructions (16-bit immediates)
function decodeBasePlain(offset, pc) {
  const opcode = byteAt(offset);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  if (opcode >= 0x40 && opcode <= 0x7F) {
    if (opcode === 0x76) return { length: 1, mnemonic: 'HALT' };
    return { length: 1, mnemonic: `LD ${regs[(opcode >> 3) & 7]},${regs[opcode & 7]}` };
  }
  if (opcode >= 0x80 && opcode <= 0xBF) {
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    return { length: 1, mnemonic: `${ops[(opcode >> 3) & 7]} ${regs[opcode & 7]}` };
  }
  // .SIS-prefixed: LD rp,nn uses 2-byte immediate
  if ((opcode & 0xCF) === 0x01) {
    const val = u16(offset + 1);
    return { length: 3, mnemonic: `LD ${rp[(opcode >> 4) & 3]},${hex(val, 4)}` };
  }
  if ((opcode & 0xC7) === 0x06) {
    return { length: 2, mnemonic: `LD ${regs[(opcode >> 3) & 7]},${hex(byteAt(offset + 1), 2)}` };
  }
  if ((opcode & 0xCF) === 0x03) return { length: 1, mnemonic: `INC ${rp[(opcode >> 4) & 3]}` };
  if ((opcode & 0xCF) === 0x0B) return { length: 1, mnemonic: `DEC ${rp[(opcode >> 4) & 3]}` };
  if ((opcode & 0xC7) === 0x04) return { length: 1, mnemonic: `INC ${regs[(opcode >> 3) & 7]}` };
  if ((opcode & 0xC7) === 0x05) return { length: 1, mnemonic: `DEC ${regs[(opcode >> 3) & 7]}` };

  switch (opcode) {
    case 0x00: return { length: 1, mnemonic: 'NOP' };
    case 0xC9: return { length: 1, mnemonic: 'RET' };
    case 0xCD: {
      const target = u16(offset + 1);
      return { length: 3, mnemonic: `CALL ${hex(target, 4)}` };
    }
    case 0xC3: {
      const target = u16(offset + 1);
      return { length: 3, mnemonic: `JP ${hex(target, 4)}` };
    }
    case 0x2A: {
      const addr = u16(offset + 1);
      return { length: 3, mnemonic: `LD HL,(${hex(addr, 4)})` };
    }
    case 0x22: {
      const addr = u16(offset + 1);
      return { length: 3, mnemonic: `LD (${hex(addr, 4)}),HL` };
    }
    case 0x3A: {
      const addr = u16(offset + 1);
      return { length: 3, mnemonic: `LD A,(${hex(addr, 4)})` };
    }
    case 0x32: {
      const addr = u16(offset + 1);
      return { length: 3, mnemonic: `LD (${hex(addr, 4)}),A` };
    }
    case 0xE5: return { length: 1, mnemonic: 'PUSH HL' };
    case 0xE1: return { length: 1, mnemonic: 'POP HL' };
    case 0xC5: return { length: 1, mnemonic: 'PUSH BC' };
    case 0xC1: return { length: 1, mnemonic: 'POP BC' };
    case 0xD5: return { length: 1, mnemonic: 'PUSH DE' };
    case 0xD1: return { length: 1, mnemonic: 'POP DE' };
    case 0xF5: return { length: 1, mnemonic: 'PUSH AF' };
    case 0xF1: return { length: 1, mnemonic: 'POP AF' };
    case 0xEB: return { length: 1, mnemonic: 'EX DE,HL' };
    case 0xE9: return { length: 1, mnemonic: 'JP (HL)' };
    case 0x09: return { length: 1, mnemonic: 'ADD HL,BC' };
    case 0x19: return { length: 1, mnemonic: 'ADD HL,DE' };
    case 0x29: return { length: 1, mnemonic: 'ADD HL,HL' };
    case 0x39: return { length: 1, mnemonic: 'ADD HL,SP' };
    case 0xC0: case 0xC8: case 0xD0: case 0xD8: case 0xE0: case 0xE8: case 0xF0: case 0xF8:
      return { length: 1, mnemonic: `RET ${cond[(opcode >> 3) & 7]}` };
    case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
      const target = u16(offset + 1);
      return { length: 3, mnemonic: `JP ${cond[(opcode >> 3) & 7]},${hex(target, 4)}` };
    }
    case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
      const target = u16(offset + 1);
      return { length: 3, mnemonic: `CALL ${cond[(opcode >> 3) & 7]},${hex(target, 4)}` };
    }
    case 0xDD: return decodeIndex(0xDD, offset + 1, pc);
    case 0xFD: return decodeIndex(0xFD, offset + 1, pc);
    case 0xED: return decodeEd(offset + 1, pc);
    case 0xCB:
      return { length: 2, mnemonic: decodeCb(offset + 1) };
    default:
      return { length: 1, mnemonic: `DB ${hex(opcode, 2)}` };
  }
}

// ===== MAIN =====

console.log(`=== PROBE: Static disassembly of font table resolver at ${hex(START, 6)} ===`);
console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Decoding up to ${LIMIT} bytes from ${hex(START, 6)}`);
console.log('Context: called from glyph-to-VRAM rasterizer (0x0A1799) with HL = char_code * 0x1C');
console.log('Expected: returns glyph bitmap pointer in IX');
console.log('');
console.log('--- DISASSEMBLY ---');

let pc = START;
const end = Math.min(START + LIMIT, rom.length);
let unconditionalRetCount = 0;
let stopAddr = null;

while (pc < end) {
  const decoded = decodeBase(pc, pc);
  const length = decoded.length;
  console.log(`${hex(pc, 6)}  ${bytesText(pc, length).padEnd(20)}  ${decoded.mnemonic}`);

  if (decoded.mnemonic === 'RET') {
    unconditionalRetCount++;
    if (unconditionalRetCount === 1 && stopAddr === null) {
      stopAddr = pc + length + 40; // peek 40 more bytes past first RET
    }
  }

  if (stopAddr !== null && pc >= stopAddr) {
    console.log(`... (stopped: peeked past first unconditional RET)`);
    break;
  }

  pc += length;
}

function uniqueTargets(items, key) {
  return [...new Set(items.map((item) => item[key]))].sort((a, b) => a - b);
}

console.log('');
console.log('=== SUMMARY ===');
console.log(`Function span: ${hex(START, 6)} to ${firstUnconditionalRet !== null ? hex(firstUnconditionalRet, 6) : '???'} (${firstUnconditionalRet !== null ? firstUnconditionalRet - START + 1 : '???'} bytes)`);

console.log('');
console.log('CALL targets:');
if (calls.length === 0) {
  console.log('  (none)');
} else {
  for (const c of calls) {
    const condStr = c.condition ? ` [conditional: ${c.condition}]` : '';
    console.log(`  ${hex(c.target, 6)} called from ${hex(c.pc, 6)}${condStr}`);
  }
}

console.log('');
console.log('JP/JR targets:');
if (jumps.length === 0) {
  console.log('  (none)');
} else {
  for (const j of jumps) {
    const inFunc = (firstUnconditionalRet !== null)
      ? (j.target >= START && j.target <= firstUnconditionalRet ? ' (within function)' : ' (OUTSIDE function)')
      : '';
    console.log(`  ${j.kind} -> ${hex(j.target, 6)} from ${hex(j.pc, 6)}${inFunc}`);
  }
}

console.log('');
console.log('BCALL indexes:');
if (bCalls.length === 0) {
  console.log('  (none)');
} else {
  for (const b of bCalls) {
    console.log(`  BCALL ${hex(b.index, 4)} at ${hex(b.pc, 6)}`);
  }
}

console.log('');
console.log('RAM references (D00000-D3FFFF):');
if (ramRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const r of ramRefs) {
    console.log(`  ${r.kind} @ ${hex(r.pc, 6)} -> ${hex(r.addr, 6)}`);
  }
}

console.log('');
console.log('ROM table references (000000-3FFFFF):');
if (romTableRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const r of romTableRefs) {
    console.log(`  ${r.kind} @ ${hex(r.pc, 6)} -> ${hex(r.addr, 6)}`);
    // Dump data preview at the ROM table address
    if (r.addr < rom.length) {
      const preview = bytesText(r.addr, Math.min(32, rom.length - r.addr));
      console.log(`    data preview: ${preview}`);
    }
  }
}

console.log('');
console.log('VRAM references (D40000-D65800):');
if (vramRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const r of vramRefs) {
    console.log(`  ${r.kind} @ ${hex(r.pc, 6)} -> ${hex(r.addr, 6)}`);
  }
}

console.log('');
console.log('I/O port references:');
if (ioRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const r of ioRefs) {
    console.log(`  ${r.kind} @ ${hex(r.pc, 6)}`);
  }
}

// ===== FONT-SPECIFIC ANALYSIS =====
console.log('');
console.log('=== FONT TABLE ANALYSIS ===');

// For each ROM table ref, check if it looks like font bitmap data
for (const r of romTableRefs) {
  if (r.addr >= rom.length) continue;

  console.log(`\nExamining ROM table at ${hex(r.addr, 6)} (${r.kind} @ ${hex(r.pc, 6)}):`);

  // Check if the value at this address is itself a pointer (pointer table vs direct data)
  const firstWord = u24(r.addr);
  const isPtr = firstWord >= 0x000000 && firstWord < 0x400000 && firstWord > 0x1000;
  console.log(`  First 3 bytes as pointer: ${hex(firstWord, 6)} ${isPtr ? '-> looks like a ROM pointer (POINTER TABLE?)' : '-> probably direct data'}`);

  // Dump first 84 bytes (3 glyph entries at 28 bytes each)
  const dumpLen = Math.min(84, rom.length - r.addr);
  console.log(`  Hex dump (first ${dumpLen} bytes, 28 bytes/glyph):`);
  for (let i = 0; i < dumpLen; i += 28) {
    const rowLen = Math.min(28, dumpLen - i);
    console.log(`    [glyph ${i / 28}] +${hex(i, 4)}: ${bytesText(r.addr + i, rowLen)}`);
  }

  // Show specific character entries if this is a glyph table base
  // HL = char_code * 0x1C, so table[char] = base + char * 28
  const chars = [
    { code: 0x20, name: 'SPACE' },
    { code: 0x30, name: "'0'" },
    { code: 0x41, name: "'A'" },
    { code: 0x61, name: "'a'" },
  ];
  for (const ch of chars) {
    const offset = ch.code * 0x1C;
    if (r.addr + offset + 28 <= rom.length) {
      console.log(`  Entry for ${ch.name} (char ${hex(ch.code, 2)}, offset +${hex(offset, 4)}) at ${hex(r.addr + offset, 6)}:`);
      console.log(`    ${bytesText(r.addr + offset, 28)}`);
    }
  }
}

// Check for RAM flags that might select between font tables
if (ramRefs.length > 0) {
  console.log('\nRAM flags that may control font selection:');
  for (const r of ramRefs) {
    // Read the current value in the ROM at that reference point for context
    console.log(`  ${hex(r.addr, 6)} (${r.kind} @ ${hex(r.pc, 6)})`);
  }
}

console.log('');
console.log('=== DONE ===');
