import fs from 'node:fs';
import path from 'node:path';

const romPath = path.join('TI-84_Plus_CE', 'ROM.rom');
const base = 0x07f16c;
const minBytes = 0x80;
const rom = fs.readFileSync(romPath);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return byte(addr) | (byte(addr + 1) << 8);
}

function u24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesText(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), b => hex(b)).join(' ');
}

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const reg16 = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decode(addr) {
  const op = byte(addr);

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${reg8[(op >> 3) & 7]},${reg8[op & 7]}` };
  }

  if (op >= 0x80 && op <= 0xbf) {
    return { len: 1, text: `${alu[(op >> 3) & 7]}${alu[(op >> 3) & 7].endsWith('A') ? ',' : ' '}${reg8[op & 7]}`.replace('A, ', 'A,') };
  }

  if (op >= 0xc0 && op <= 0xff) {
    const group = op & 0x07;
    const y = (op >> 3) & 0x07;
    if (group === 0 && y !== 0 && y !== 1 && y !== 5) return { len: 1, text: `RET ${cc[y]}`, term: true };
    if (group === 2) return { len: 3, text: `JP ${cc[y]},0x${hex(u16(addr + 1), 4)}`, target: u16(addr + 1), term: false };
    if (group === 4) return { len: 3, text: `CALL ${cc[y]},0x${hex(u16(addr + 1), 4)}`, target: u16(addr + 1) };
  }

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 3, text: `LD BC,0x${hex(u16(addr + 1), 4)}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,0x${hex(byte(addr + 1))}` };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x08: return { len: 1, text: 'EX AF,AF\'' };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x0b: return { len: 1, text: 'DEC BC' };
    case 0x0c: return { len: 1, text: 'INC C' };
    case 0x0d: return { len: 1, text: 'DEC C' };
    case 0x0e: return { len: 2, text: `LD C,0x${hex(byte(addr + 1))}` };
    case 0x0f: return { len: 1, text: 'RRCA' };
    case 0x10: {
      const target = addr + 2 + s8(byte(addr + 1));
      return { len: 2, text: `DJNZ 0x${hex(target, 6)}`, target };
    }
    case 0x11: return { len: 3, text: `LD DE,0x${hex(u16(addr + 1), 4)}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x14: return { len: 1, text: 'INC D' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x16: return { len: 2, text: `LD D,0x${hex(byte(addr + 1))}` };
    case 0x17: return { len: 1, text: 'RLA' };
    case 0x18: {
      const target = addr + 2 + s8(byte(addr + 1));
      return { len: 2, text: `JR 0x${hex(target, 6)}`, target, term: true };
    }
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x1b: return { len: 1, text: 'DEC DE' };
    case 0x1c: return { len: 1, text: 'INC E' };
    case 0x1d: return { len: 1, text: 'DEC E' };
    case 0x1e: return { len: 2, text: `LD E,0x${hex(byte(addr + 1))}` };
    case 0x1f: return { len: 1, text: 'RRA' };
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      const target = addr + 2 + s8(byte(addr + 1));
      return { len: 2, text: `JR ${cc[(op - 0x20) >> 3]},0x${hex(target, 6)}`, target };
    }
    case 0x21: return { len: 3, text: `LD HL,0x${hex(u16(addr + 1), 4)}` };
    case 0x22: return { len: 4, text: `LD (0x${hex(u24(addr + 1), 6)}),HL` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x26: return { len: 2, text: `LD H,0x${hex(byte(addr + 1))}` };
    case 0x27: return { len: 1, text: 'DAA' };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x2a: return { len: 4, text: `LD HL,(0x${hex(u24(addr + 1), 6)})` };
    case 0x2b: return { len: 1, text: 'DEC HL' };
    case 0x2c: return { len: 1, text: 'INC L' };
    case 0x2d: return { len: 1, text: 'DEC L' };
    case 0x2e: return { len: 2, text: `LD L,0x${hex(byte(addr + 1))}` };
    case 0x2f: return { len: 1, text: 'CPL' };
    case 0x31: return { len: 4, text: `LD SP,0x${hex(u24(addr + 1), 6)}` };
    case 0x32: return { len: 4, text: `LD (0x${hex(u24(addr + 1), 6)}),A` };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x34: return { len: 1, text: 'INC (HL)' };
    case 0x35: return { len: 1, text: 'DEC (HL)' };
    case 0x36: return { len: 2, text: `LD (HL),0x${hex(byte(addr + 1))}` };
    case 0x37: return { len: 1, text: 'SCF' };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x3a: return { len: 4, text: `LD A,(0x${hex(u24(addr + 1), 6)})` };
    case 0x3b: return { len: 1, text: 'DEC SP' };
    case 0x3c: return { len: 1, text: 'INC A' };
    case 0x3d: return { len: 1, text: 'DEC A' };
    case 0x3e: return { len: 2, text: `LD A,0x${hex(byte(addr + 1))}` };
    case 0x3f: return { len: 1, text: 'CCF' };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc3: return { len: 3, text: `JP 0x${hex(u16(addr + 1), 4)}`, target: u16(addr + 1), term: true };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc6: return { len: 2, text: `ADD A,0x${hex(byte(addr + 1))}` };
    case 0xc8: return { len: 1, text: 'RET Z', term: true };
    case 0xc9: return { len: 1, text: 'RET', term: true };
    case 0xcb: return { len: 2, text: `CB 0x${hex(byte(addr + 1))}` };
    case 0xcd: return { len: 3, text: `CALL 0x${hex(u16(addr + 1), 4)}`, target: u16(addr + 1) };
    case 0xce: return { len: 2, text: `ADC A,0x${hex(byte(addr + 1))}` };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd3: return { len: 2, text: `OUT (0x${hex(byte(addr + 1))}),A` };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xd6: return { len: 2, text: `SUB 0x${hex(byte(addr + 1))}` };
    case 0xd9: return { len: 1, text: 'EXX' };
    case 0xdb: return { len: 2, text: `IN A,(0x${hex(byte(addr + 1))})` };
    case 0xde: return { len: 2, text: `SBC A,0x${hex(byte(addr + 1))}` };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe3: return { len: 1, text: 'EX (SP),HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xe6: return { len: 2, text: `AND 0x${hex(byte(addr + 1))}` };
    case 0xe9: return { len: 1, text: 'JP (HL)', term: true };
    case 0xeb: return { len: 1, text: 'EX DE,HL' };
    case 0xed: return decodeEd(addr);
    case 0xee: return { len: 2, text: `XOR 0x${hex(byte(addr + 1))}` };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf3: return { len: 1, text: 'DI' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xf6: return { len: 2, text: `OR 0x${hex(byte(addr + 1))}` };
    case 0xf9: return { len: 1, text: 'LD SP,HL' };
    case 0xfb: return { len: 1, text: 'EI' };
    case 0xfe: return { len: 2, text: `CP 0x${hex(byte(addr + 1))}` };
    default: return { len: 1, text: `DB 0x${hex(op)}` };
  }
}

function decodeEd(addr) {
  const op = byte(addr + 1);
  const rr = reg16[(op >> 4) & 3];
  if ((op & 0xcf) === 0x43) return { len: 5, text: `LD (0x${hex(u24(addr + 2), 6)}),${rr}` };
  if ((op & 0xcf) === 0x4b) return { len: 5, text: `LD ${rr},(0x${hex(u24(addr + 2), 6)})` };
  switch (op) {
    case 0x44: return { len: 2, text: 'NEG' };
    case 0x45: return { len: 2, text: 'RETN', term: true };
    case 0x4d: return { len: 2, text: 'RETI', term: true };
    case 0x57: return { len: 2, text: 'LD A,I' };
    case 0x5f: return { len: 2, text: 'LD A,R' };
    case 0x67: return { len: 2, text: 'RRD' };
    case 0x6f: return { len: 2, text: 'RLD' };
    case 0xa0: return { len: 2, text: 'LDI' };
    case 0xa1: return { len: 2, text: 'CPI' };
    case 0xa8: return { len: 2, text: 'LDD' };
    case 0xa9: return { len: 2, text: 'CPD' };
    case 0xb0: return { len: 2, text: 'LDIR' };
    case 0xb1: return { len: 2, text: 'CPIR' };
    case 0xb8: return { len: 2, text: 'LDDR' };
    case 0xb9: return { len: 2, text: 'CPDR' };
    default: return { len: 2, text: `ED 0x${hex(op)}` };
  }
}

const targets = [];
let pc = base;
let consumed = 0;

console.log('Decode 0x07F16C - parameterized FP operation');
console.log(`ROM: ${romPath}`);
console.log('');

while (consumed < minBytes) {
  const ins = decode(pc);
  console.log(`0x${hex(pc, 6)}  ${bytesText(pc, ins.len).padEnd(14)}  ${ins.text}`);
  if (ins.target !== undefined) targets.push({ from: pc, target: ins.target, text: ins.text });
  pc += ins.len;
  consumed = pc - base;
  if (ins.term && consumed >= minBytes) break;
}

console.log('');
console.log('Control-flow targets:');
for (const target of targets) {
  console.log(`0x${hex(target.from, 6)}  ${target.text}  -> 0x${hex(target.target, target.target > 0xffff ? 6 : 4)}`);
}
