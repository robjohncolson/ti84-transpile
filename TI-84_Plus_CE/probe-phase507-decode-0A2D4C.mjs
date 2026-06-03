import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join(import.meta.dirname, 'ROM.rom');
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

// --- Decoder ---

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

function decodeEd(offset, pc, ctx) {
  const opcode = byteAt(offset);
  switch (opcode) {
    case 0x4B: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD BC,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD BC,(${hex(addr, 6)})` };
    }
    case 0x43: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),BC', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),BC` };
    }
    case 0x5B: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD DE,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD DE,(${hex(addr, 6)})` };
    }
    case 0x53: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),DE', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),DE` };
    }
    case 0x6B: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD HL,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD HL,(${hex(addr, 6)})` };
    }
    case 0x63: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),HL', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),HL` };
    }
    case 0x7B: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD SP,(nn)', addr, pc);
      return { length: 5, mnemonic: `LD SP,(${hex(addr, 6)})` };
    }
    case 0x73: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),SP', addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),SP` };
    }
    case 0x44:
      return { length: 2, mnemonic: 'NEG' };
    case 0x4C:
      return { length: 2, mnemonic: 'MLT BC' };
    case 0x54:
      return { length: 2, mnemonic: 'MLT DE' };
    case 0x5C:
      return { length: 2, mnemonic: 'MLT HL' };
    case 0x6C:
      return { length: 2, mnemonic: 'MLT HL' };
    case 0x64:
      return { length: 2, mnemonic: 'TST A' };
    case 0x78:
      ctx.ioRefs.push({ kind: 'IN A,(C)', pc });
      return { length: 2, mnemonic: 'IN A,(C)' };
    case 0x79:
      ctx.ioRefs.push({ kind: 'OUT (C),A', pc });
      return { length: 2, mnemonic: 'OUT (C),A' };
    case 0xA0:
      return { length: 2, mnemonic: 'LDI' };
    case 0xA1:
      return { length: 2, mnemonic: 'CPI' };
    case 0xA2:
      return { length: 2, mnemonic: 'INI' };
    case 0xA3:
      return { length: 2, mnemonic: 'OUTI' };
    case 0xA8:
      return { length: 2, mnemonic: 'LDD' };
    case 0xB0:
      return { length: 2, mnemonic: 'LDIR' };
    case 0xB1:
      return { length: 2, mnemonic: 'CPIR' };
    case 0xB2:
      return { length: 2, mnemonic: 'INIR' };
    case 0xB3:
      return { length: 2, mnemonic: 'OTIR' };
    case 0x42:
      return { length: 2, mnemonic: 'SBC HL,BC' };
    case 0x4A:
      return { length: 2, mnemonic: 'ADC HL,BC' };
    case 0x52:
      return { length: 2, mnemonic: 'SBC HL,DE' };
    case 0x5A:
      return { length: 2, mnemonic: 'ADC HL,DE' };
    case 0x62:
      return { length: 2, mnemonic: 'SBC HL,HL' };
    case 0x6A:
      return { length: 2, mnemonic: 'ADC HL,HL' };
    case 0x72:
      return { length: 2, mnemonic: 'SBC HL,SP' };
    case 0x7A:
      return { length: 2, mnemonic: 'ADC HL,SP' };
    case 0x47:
      return { length: 2, mnemonic: 'LD I,A' };
    case 0x4F:
      return { length: 2, mnemonic: 'LD R,A' };
    case 0x57:
      return { length: 2, mnemonic: 'LD A,I' };
    case 0x5F:
      return { length: 2, mnemonic: 'LD A,R' };
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

function decodeIndex(prefix, offset, pc, ctx) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const opcode = byteAt(offset);
  switch (opcode) {
    case 0x21: {
      const value = u24(offset + 1);
      return { length: 5, mnemonic: `LD ${reg},${hex(value, 6)}` };
    }
    case 0x22: {
      const addr = u24(offset + 1);
      ctx.noteMemory(`LD (nn),${reg}`, addr, pc);
      return { length: 5, mnemonic: `LD (${hex(addr, 6)}),${reg}` };
    }
    case 0x23:
      return { length: 2, mnemonic: `INC ${reg}` };
    case 0x2A: {
      const addr = u24(offset + 1);
      ctx.noteMemory(`LD ${reg},(nn)`, addr, pc);
      return { length: 5, mnemonic: `LD ${reg},(${hex(addr, 6)})` };
    }
    case 0x2B:
      return { length: 2, mnemonic: `DEC ${reg}` };
    case 0x36:
      return { length: 4, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),${hex(byteAt(offset + 2), 2)}` };
    case 0x46:
      return { length: 3, mnemonic: `LD B,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x4E:
      return { length: 3, mnemonic: `LD C,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x56:
      return { length: 3, mnemonic: `LD D,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x5E:
      return { length: 3, mnemonic: `LD E,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x66:
      return { length: 3, mnemonic: `LD H,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x6E:
      return { length: 3, mnemonic: `LD L,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x70:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),B` };
    case 0x71:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),C` };
    case 0x72:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),D` };
    case 0x73:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),E` };
    case 0x77:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),A` };
    case 0x7E:
      return { length: 3, mnemonic: `LD A,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x86:
      return { length: 3, mnemonic: `ADD A,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x96:
      return { length: 3, mnemonic: `SUB (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0xA6:
      return { length: 3, mnemonic: `AND (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0xAE:
      return { length: 3, mnemonic: `XOR (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0xB6:
      return { length: 3, mnemonic: `OR (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0xBE:
      return { length: 3, mnemonic: `CP (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0xCB: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 4, mnemonic: decodeCb(offset + 2, `${reg}${disp >= 0 ? '+' : ''}${disp}: `) };
    }
    case 0xE5:
      return { length: 2, mnemonic: `PUSH ${reg}` };
    case 0xE1:
      return { length: 2, mnemonic: `POP ${reg}` };
    case 0xE9:
      return { length: 2, mnemonic: `JP (${reg})` };
    case 0x09:
      return { length: 2, mnemonic: `ADD ${reg},BC` };
    case 0x19:
      return { length: 2, mnemonic: `ADD ${reg},DE` };
    case 0x29:
      return { length: 2, mnemonic: `ADD ${reg},${reg}` };
    case 0x39:
      return { length: 2, mnemonic: `ADD ${reg},SP` };
    case 0xF9:
      return { length: 2, mnemonic: `LD SP,${reg}` };
    default:
      return { length: 2, mnemonic: `${reg} prefix opcode ${hex(opcode, 2)}` };
  }
}

function decodeBase(offset, pc, ctx) {
  const opcode = byteAt(offset);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  // eZ80 suffix prefixes must be checked before LD block
  if (opcode === 0x40) {
    const inner = decodeBase(offset + 1, pc + 1, ctx);
    return { length: inner.length + 1, mnemonic: `.SIS ${inner.mnemonic}` };
  }
  if (opcode === 0x49) {
    const inner = decodeBase(offset + 1, pc + 1, ctx);
    return { length: inner.length + 1, mnemonic: `.SIL ${inner.mnemonic}` };
  }
  if (opcode === 0x52) {
    const inner = decodeBase(offset + 1, pc + 1, ctx);
    return { length: inner.length + 1, mnemonic: `.LIS ${inner.mnemonic}` };
  }
  if (opcode === 0x5B) {
    const inner = decodeBase(offset + 1, pc + 1, ctx);
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
    case 0x18: return { length: 2, mnemonic: `JR ${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x19: return { length: 1, mnemonic: 'ADD HL,DE' };
    case 0x1A: return { length: 1, mnemonic: 'LD A,(DE)' };
    case 0x1F: return { length: 1, mnemonic: 'RRA' };
    case 0x20: case 0x28: case 0x30: case 0x38:
      return { length: 2, mnemonic: `JR ${cond[(opcode >> 3) & 3]},${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x22: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),HL', addr, pc);
      return { length: 4, mnemonic: `LD (${hex(addr, 6)}),HL` };
    }
    case 0x27: return { length: 1, mnemonic: 'DAA' };
    case 0x29: return { length: 1, mnemonic: 'ADD HL,HL' };
    case 0x2A: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD HL,(nn)', addr, pc);
      return { length: 4, mnemonic: `LD HL,(${hex(addr, 6)})` };
    }
    case 0x2F: return { length: 1, mnemonic: 'CPL' };
    case 0x32: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD (nn),A', addr, pc);
      return { length: 4, mnemonic: `LD (${hex(addr, 6)}),A` };
    }
    case 0x37: return { length: 1, mnemonic: 'SCF' };
    case 0x39: return { length: 1, mnemonic: 'ADD HL,SP' };
    case 0x3A: {
      const addr = u24(offset + 1);
      ctx.noteMemory('LD A,(nn)', addr, pc);
      return { length: 4, mnemonic: `LD A,(${hex(addr, 6)})` };
    }
    case 0x3F: return { length: 1, mnemonic: 'CCF' };
    case 0xC0: case 0xC8: case 0xD0: case 0xD8: case 0xE0: case 0xE8: case 0xF0: case 0xF8:
      return { length: 1, mnemonic: `RET ${cond[(opcode >> 3) & 7]}` };
    case 0xC1: return { length: 1, mnemonic: 'POP BC' };
    case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
      const target = u24(offset + 1);
      ctx.jumps.push({ kind: `JP ${cond[(opcode >> 3) & 7]}`, target, pc });
      return { length: 4, mnemonic: `JP ${cond[(opcode >> 3) & 7]},${hex(target, 6)}` };
    }
    case 0xC3: {
      const target = u24(offset + 1);
      ctx.jumps.push({ kind: 'JP', target, pc });
      return { length: 4, mnemonic: `JP ${hex(target, 6)}` };
    }
    case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
      const target = u24(offset + 1);
      ctx.calls.push({ target, pc, cond: cond[(opcode >> 3) & 7] });
      return { length: 4, mnemonic: `CALL ${cond[(opcode >> 3) & 7]},${hex(target, 6)}` };
    }
    case 0xC5: return { length: 1, mnemonic: 'PUSH BC' };
    case 0xC6: return { length: 2, mnemonic: `ADD A,${hex(byteAt(offset + 1), 2)}` };
    case 0xC7: return { length: 1, mnemonic: 'RST 00h' };
    case 0xC9:
      if (ctx.firstRet === null) ctx.firstRet = pc;
      return { length: 1, mnemonic: 'RET' };
    case 0xCD: {
      const target = u24(offset + 1);
      ctx.calls.push({ target, pc });
      return { length: 4, mnemonic: `CALL ${hex(target, 6)}` };
    }
    case 0xCE: return { length: 2, mnemonic: `ADC A,${hex(byteAt(offset + 1), 2)}` };
    case 0xCF: return { length: 1, mnemonic: 'RST 08h' };
    case 0xD1: return { length: 1, mnemonic: 'POP DE' };
    case 0xD3:
      ctx.ioRefs.push({ kind: `OUT (${hex(byteAt(offset + 1), 2)}),A`, pc });
      return { length: 2, mnemonic: `OUT (${hex(byteAt(offset + 1), 2)}),A` };
    case 0xD5: return { length: 1, mnemonic: 'PUSH DE' };
    case 0xD6: return { length: 2, mnemonic: `SUB ${hex(byteAt(offset + 1), 2)}` };
    case 0xD7: return { length: 1, mnemonic: 'RST 10h' };
    case 0xDB:
      ctx.ioRefs.push({ kind: `IN A,(${hex(byteAt(offset + 1), 2)})`, pc });
      return { length: 2, mnemonic: `IN A,(${hex(byteAt(offset + 1), 2)})` };
    case 0xDD: return decodeIndex(0xDD, offset + 1, pc, ctx);
    case 0xDF: return { length: 1, mnemonic: 'RST 18h' };
    case 0xE1: return { length: 1, mnemonic: 'POP HL' };
    case 0xE3: return { length: 1, mnemonic: 'EX (SP),HL' };
    case 0xE5: return { length: 1, mnemonic: 'PUSH HL' };
    case 0xE6: return { length: 2, mnemonic: `AND ${hex(byteAt(offset + 1), 2)}` };
    case 0xE7: {
      const index = u16(offset + 1);
      ctx.bCalls.push({ index, pc });
      return { length: 3, mnemonic: `RST 28h / BCALL ${hex(index, 4)}` };
    }
    case 0xE9: return { length: 1, mnemonic: 'JP (HL)' };
    case 0xEB: return { length: 1, mnemonic: 'EX DE,HL' };
    case 0xED: return decodeEd(offset + 1, pc, ctx);
    case 0xEE: return { length: 2, mnemonic: `XOR ${hex(byteAt(offset + 1), 2)}` };
    case 0xEF: return { length: 1, mnemonic: 'RST 28h' };
    case 0xF1: return { length: 1, mnemonic: 'POP AF' };
    case 0xF3: return { length: 1, mnemonic: 'DI' };
    case 0xF5: return { length: 1, mnemonic: 'PUSH AF' };
    case 0xF6: return { length: 2, mnemonic: `OR ${hex(byteAt(offset + 1), 2)}` };
    case 0xFB: return { length: 1, mnemonic: 'EI' };
    case 0xFD: return decodeIndex(0xFD, offset + 1, pc, ctx);
    case 0xFE: return { length: 2, mnemonic: `CP ${hex(byteAt(offset + 1), 2)}` };
    case 0xFF: return { length: 1, mnemonic: 'RST 38h' };
    case 0xCB:
      return { length: 2, mnemonic: decodeCb(offset + 1) };
    default:
      return { length: 1, mnemonic: `DB ${hex(opcode, 2)}` };
  }
}

// --- Disassemble one function ---

function disassembleFunction(name, start, limit) {
  const ctx = {
    calls: [],
    jumps: [],
    bCalls: [],
    memoryRefs: [],
    ramRefs: [],
    vramRefs: [],
    ioRefs: [],
    firstRet: null,
    noteMemory(kind, addr, pc) {
      const ref = { kind, addr, pc };
      ctx.memoryRefs.push(ref);
      if (addr >= 0xD00000 && addr <= 0xD3FFFF) ctx.ramRefs.push(ref);
      if (addr >= 0xD40000 && addr <= 0xD65800) ctx.vramRefs.push(ref);
    },
  };

  console.log('='.repeat(72));
  console.log(`FUNCTION: ${name} -- starting at ${hex(start, 6)}, limit ${limit} bytes`);
  console.log('='.repeat(72));

  let pc = start;
  const end = Math.min(start + limit, rom.length);
  let retCount = 0;

  while (pc < end) {
    const decoded = decodeBase(pc, pc, ctx);
    const length = Math.min(decoded.length, end - pc);
    console.log(`${hex(pc, 6)}  ${bytesText(pc, length).padEnd(20)}  ${decoded.mnemonic}`);
    pc += length;

    // Stop after unconditional RET (but allow a few extra bytes for alternate paths)
    if (decoded.mnemonic === 'RET') {
      retCount++;
      if (retCount >= 2) break; // Two RETs = definitely done
    }
  }

  console.log('');
  console.log(`Summary for ${name}:`);
  console.log(`  First RET at: ${ctx.firstRet !== null ? hex(ctx.firstRet, 6) : 'not seen'}`);
  console.log(`  Function size: ${ctx.firstRet !== null ? (ctx.firstRet - start + 1) + ' bytes to first RET' : 'unknown'}`);
  console.log(`  CALL targets: ${[...new Set(ctx.calls.map(c => hex(c.target, 6)))].join(', ') || 'none'}`);
  console.log(`  JP targets: ${[...new Set(ctx.jumps.map(j => `${j.kind} -> ${hex(j.target, 6)}`))] .join(', ') || 'none'}`);
  console.log(`  BCALL indexes: ${[...new Set(ctx.bCalls.map(b => hex(b.index, 4)))].join(', ') || 'none'}`);
  console.log(`  RAM refs (D00000-D3FFFF): ${ctx.ramRefs.map(r => `${r.kind} ${hex(r.addr, 6)} @ ${hex(r.pc, 6)}`).join('; ') || 'none'}`);
  console.log(`  VRAM refs (D40000-D65800): ${ctx.vramRefs.map(r => `${r.kind} ${hex(r.addr, 6)} @ ${hex(r.pc, 6)}`).join('; ') || 'none'}`);
  console.log(`  All memory refs: ${ctx.memoryRefs.map(r => `${r.kind} ${hex(r.addr, 6)} @ ${hex(r.pc, 6)}`).join('; ') || 'none'}`);
  console.log(`  I/O refs: ${ctx.ioRefs.map(r => `${r.kind} @ ${hex(r.pc, 6)}`).join('; ') || 'none'}`);
  console.log('');

  return ctx;
}

// --- Main ---

console.log(`ROM size: ${rom.length} bytes`);
console.log('');

// Function 1: 0x0A2D4C -- Row index to pixel Y coordinate
const fn1 = disassembleFunction('Row-to-Y (0x0A2D4C)', 0x0A2D4C, 150);

// Function 2: 0x00038C is actually a jump table entry -> JP 0x005A53
// Decode the REAL implementation at 0x005A53
console.log('NOTE: 0x00038C is an OS API jump table entry (JP 0x005A53).');
console.log('Decoding the actual implementation at 0x005A53 instead.');
console.log('');
const fn2 = disassembleFunction('Col-to-X (0x005A53, via 0x00038C)', 0x005A53, 150);

// Raw hex dumps for cross-reference
console.log('='.repeat(72));
console.log('RAW HEX DUMP -- first 48 bytes at each function start');
console.log('='.repeat(72));
for (const [label, addr] of [['0x0A2D4C', 0x0A2D4C], ['0x00038C', 0x00038C]]) {
  console.log(`${label}: ${bytesText(addr, 48)}`);
}
console.log('');

// Cross-reference analysis
console.log('='.repeat(72));
console.log('CROSS-REFERENCE ANALYSIS');
console.log('='.repeat(72));
console.log('');
console.log('Context: These functions are called from the glyph rasterizer at 0x0A1799.');
console.log('The rasterizer uses VRAM base 0xD3FD80 and row stride 0x0280 (640 bytes/scanline, 16bpp).');
console.log('curRow is at D00595, curCol is at D00596.');
console.log('LCD: 320x240 pixels, font glyphs are 7px wide x ~16-18px tall, 28 bytes each.');
console.log('Text: 26 columns, ~10 rows.');
console.log('');
console.log('Expected row->Y mapping:');
console.log('  If 10 rows fit 240px: each text row is ~24px (could be font_height + line_spacing)');
console.log('  With 16px font: Y = row * some_multiplier + optional_margin');
console.log('  Look for MLT or shift+add sequences');
console.log('');
console.log('Expected col->X mapping:');
console.log('  26 cols across 320px: each col ~12px (7px glyph + 5px gap?)');
console.log('  Or simpler: col * char_width_in_pixels');
console.log('  VRAM offset from X: X * 2 bytes (16bpp)');
console.log('');

console.log('DONE -- probe-phase507-decode-0A2D4C complete');
