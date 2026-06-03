import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x0A1799;
const LIMIT = 1000;

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
const vramRefs = [];
const ioRefs = [];
let firstRet = null;

function noteMemory(kind, addr, pc) {
  const ref = { kind, addr, pc };
  memoryRefs.push(ref);
  if (addr >= 0xD00000 && addr <= 0xD3FFFF) {
    ramRefs.push(ref);
  }
  if (addr >= 0xD40000 && addr <= 0xD65800) {
    vramRefs.push(ref);
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
    case 0xA2:
      return { length: 2, mnemonic: 'INI' };
    case 0xA3:
      return { length: 2, mnemonic: 'OUTI' };
    case 0xB0:
      return { length: 2, mnemonic: 'LDIR' };
    case 0xB1:
      return { length: 2, mnemonic: 'CPIR' };
    case 0xB2:
      return { length: 2, mnemonic: 'INIR' };
    case 0xB3:
      return { length: 2, mnemonic: 'OTIR' };
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
    case 0x2A: {
      const addr = u24(offset + 1);
      noteMemory(`LD ${reg},(nn)`, addr, pc);
      return { length: 5, mnemonic: `LD ${reg},(${hex(addr, 6)})` };
    }
    case 0x36:
      return { length: 4, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),${hex(byteAt(offset + 2), 2)}` };
    case 0x7E:
      return { length: 3, mnemonic: `LD A,(${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))})` };
    case 0x77:
      return { length: 3, mnemonic: `LD (${reg}${signed8(byteAt(offset + 1)) >= 0 ? '+' : ''}${signed8(byteAt(offset + 1))}),A` };
    case 0xCB: {
      const disp = signed8(byteAt(offset + 1));
      return { length: 4, mnemonic: decodeCb(offset + 2, `${reg}${disp >= 0 ? '+' : ''}${disp}: `) };
    }
    case 0xE5:
      return { length: 2, mnemonic: `PUSH ${reg}` };
    case 0xE1:
      return { length: 2, mnemonic: `POP ${reg}` };
    default:
      return { length: 2, mnemonic: `${reg} prefix opcode ${hex(opcode, 2)}` };
  }
}

function decodeBase(offset, pc) {
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
    case 0x07: return { length: 1, mnemonic: 'RLCA' };
    case 0x08: return { length: 1, mnemonic: "EX AF,AF'" };
    case 0x0A: return { length: 1, mnemonic: 'LD A,(BC)' };
    case 0x0F: return { length: 1, mnemonic: 'RRCA' };
    case 0x10: return { length: 2, mnemonic: `DJNZ ${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x12: return { length: 1, mnemonic: 'LD (DE),A' };
    case 0x17: return { length: 1, mnemonic: 'RLA' };
    case 0x18: return { length: 2, mnemonic: `JR ${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x1A: return { length: 1, mnemonic: 'LD A,(DE)' };
    case 0x1F: return { length: 1, mnemonic: 'RRA' };
    case 0x20: case 0x28: case 0x30: case 0x38:
      return { length: 2, mnemonic: `JR ${cond[(opcode >> 3) & 3]},${hex(relTarget(pc, 2, byteAt(offset + 1)), 6)}` };
    case 0x22: {
      const addr = u24(offset + 1);
      noteMemory('LD (nn),HL', addr, pc);
      return { length: 4, mnemonic: `LD (${hex(addr, 6)}),HL` };
    }
    case 0x27: return { length: 1, mnemonic: 'DAA' };
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
    case 0xC5: return { length: 1, mnemonic: 'PUSH BC' };
    case 0xC6: return { length: 2, mnemonic: `ADD A,${hex(byteAt(offset + 1), 2)}` };
    case 0xC9:
      if (firstRet === null) firstRet = pc;
      return { length: 1, mnemonic: 'RET' };
    case 0xCD: {
      const target = u24(offset + 1);
      calls.push({ target, pc });
      return { length: 4, mnemonic: `CALL ${hex(target, 6)}` };
    }
    case 0xD1: return { length: 1, mnemonic: 'POP DE' };
    case 0xD3:
      ioRefs.push({ kind: `OUT (${hex(byteAt(offset + 1), 2)}),A`, pc });
      return { length: 2, mnemonic: `OUT (${hex(byteAt(offset + 1), 2)}),A` };
    case 0xD5: return { length: 1, mnemonic: 'PUSH DE' };
    case 0xD6: return { length: 2, mnemonic: `SUB ${hex(byteAt(offset + 1), 2)}` };
    case 0xDB:
      ioRefs.push({ kind: `IN A,(${hex(byteAt(offset + 1), 2)})`, pc });
      return { length: 2, mnemonic: `IN A,(${hex(byteAt(offset + 1), 2)})` };
    case 0xDD: return decodeIndex(0xDD, offset + 1, pc);
    case 0xE1: return { length: 1, mnemonic: 'POP HL' };
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
    case 0xF1: return { length: 1, mnemonic: 'POP AF' };
    case 0xF3: return { length: 1, mnemonic: 'DI' };
    case 0xF5: return { length: 1, mnemonic: 'PUSH AF' };
    case 0xF6: return { length: 2, mnemonic: `OR ${hex(byteAt(offset + 1), 2)}` };
    case 0xFB: return { length: 1, mnemonic: 'EI' };
    case 0xFD: return decodeIndex(0xFD, offset + 1, pc);
    case 0xFE: return { length: 2, mnemonic: `CP ${hex(byteAt(offset + 1), 2)}` };
    case 0x40: {
      const inner = decodeBase(offset + 1, pc + 1);
      return { length: inner.length + 1, mnemonic: `.SIS ${inner.mnemonic}` };
    }
    case 0x49: {
      const inner = decodeBase(offset + 1, pc + 1);
      return { length: inner.length + 1, mnemonic: `.SIL ${inner.mnemonic}` };
    }
    case 0x52: {
      const inner = decodeBase(offset + 1, pc + 1);
      return { length: inner.length + 1, mnemonic: `.LIS ${inner.mnemonic}` };
    }
    case 0xCB:
      return { length: 2, mnemonic: decodeCb(offset + 1) };
    default:
      return { length: 1, mnemonic: `DB ${hex(opcode, 2)}` };
  }
}

console.log(`ROM size: ${rom.length} bytes`);
console.log(`Static disassembly from ${hex(START, 6)} for ${LIMIT} bytes`);
console.log('');

let pc = START;
const end = Math.min(START + LIMIT, rom.length);
while (pc < end) {
  const decoded = decodeBase(pc, pc);
  const length = Math.min(decoded.length, end - pc);
  console.log(`${hex(pc, 6)}  ${bytesText(pc, length).padEnd(17)}  ${decoded.mnemonic}`);
  pc += length;
}

function uniqueTargets(items, key) {
  return [...new Set(items.map((item) => item[key]))].sort((a, b) => a - b);
}

console.log('');
console.log('Summary');
console.log(`- First RET: ${firstRet === null ? 'not seen in window' : hex(firstRet, 6)}${firstRet === null ? '' : ` (${firstRet - START + 1} bytes from start)`}`);
console.log(`- CALL targets: ${uniqueTargets(calls, 'target').map((addr) => hex(addr, 6)).join(', ') || 'none'}`);
console.log(`- JP targets: ${uniqueTargets(jumps, 'target').map((addr) => hex(addr, 6)).join(', ') || 'none'}`);
console.log(`- BCALL indexes: ${uniqueTargets(bCalls, 'index').map((idx) => hex(idx, 4)).join(', ') || 'none'}`);
console.log(`- RAM refs D00000-D3FFFF: ${ramRefs.map((ref) => `${ref.kind} ${hex(ref.addr, 6)} @ ${hex(ref.pc, 6)}`).join('; ') || 'none'}`);
console.log(`- VRAM refs D40000-D65800: ${vramRefs.map((ref) => `${ref.kind} ${hex(ref.addr, 6)} @ ${hex(ref.pc, 6)}`).join('; ') || 'none'}`);
console.log(`- Port I/O refs: ${ioRefs.map((ref) => `${ref.kind} @ ${hex(ref.pc, 6)}`).join('; ') || 'none'}`);
console.log(`- Direct putchar 0x061980 call: ${calls.some((call) => call.target === 0x061980) ? 'yes' : 'no'}`);
console.log(`- Static purpose hint: ${vramRefs.length ? 'contains direct VRAM absolute references' : 'no direct absolute VRAM references in decoded window'}; ${calls.length || bCalls.length ? 'delegates through calls/BCALLs that may perform rendering or font lookup' : 'no call delegation seen in decoded window'}.`);
