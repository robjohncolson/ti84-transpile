#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const ranges = [
  { name: 'immediate caller of bulk wipe', start: 0x001872, end: 0x001900 },
  { name: '0x0158xx chain to 0x001872', start: 0x0158d2, end: 0x015910 },
  { name: 'bulk wipe entry', start: 0x0018f8, end: 0x001970 },
];

const entryPoints = new Set([
  0x001872,
  0x001879,
  0x0018f8,
  0x0158d2,
  0x0158da,
  0x0158ec,
  0x0158ee,
  0x0158f8,
]);

const guardOpcodes = new Set([
  'JR NZ',
  'JR Z',
  'JR NC',
  'JR C',
  'JP NZ',
  'JP Z',
  'JP NC',
  'JP C',
  'CALL NZ',
  'CALL Z',
  'CALL NC',
  'CALL C',
  'RET NZ',
  'RET Z',
  'RET NC',
  'RET C',
  'CP',
  'BIT',
  'OR',
  'AND',
  'XOR',
]);

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function b(addr) {
  if (addr < 0 || addr >= rom.length) return 0;
  return rom[addr];
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, disp) {
  return (pc + 2 + s8(disp)) & 0xffffff;
}

function bytesAt(pc, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(b(pc + i).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function guardKind(mnemonic) {
  for (const op of guardOpcodes) {
    if (mnemonic === op || mnemonic.startsWith(`${op} `) || mnemonic.startsWith(`${op},`)) {
      return op;
    }
  }
  return null;
}

function decodeCb(pc) {
  const op = b(pc + 1);
  const bit = (op >> 3) & 7;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  if ((op & 0xc0) === 0x40) return { len: 2, text: `BIT ${bit},${reg}`, guard: true };
  if ((op & 0xc0) === 0x80) return { len: 2, text: `RES ${bit},${reg}` };
  if ((op & 0xc0) === 0xc0) return { len: 2, text: `SET ${bit},${reg}` };
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(op >> 3) & 7];
  return { len: 2, text: `${rot} ${reg}` };
}

function decodeEd(pc) {
  const op = b(pc + 1);
  const fixed = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x47: 'LD I,A',
    0x4d: 'RETI',
    0x57: 'LD A,I',
    0x5f: 'LD A,R',
    0x67: 'RRD',
    0x6f: 'RLD',
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
  };
  if (fixed[op]) return { len: 2, text: fixed[op], guard: op === 0xa1 || op === 0xb1 || op === 0xa9 || op === 0xb9 };
  if (op >= 0x40 && op <= 0x7f && (op & 7) === 0) {
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    return { len: 2, text: `IN ${reg},(C)` };
  }
  if (op >= 0x40 && op <= 0x7f && (op & 7) === 1) {
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '0', 'A'][(op >> 3) & 7];
    return { len: 2, text: `OUT (C),${reg}` };
  }
  return { len: 2, text: `ED ${op.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decodeIndexed(pc, prefix, name) {
  const op = b(pc + 1);
  const rp = name;
  if (op === 0xcb) {
    const disp = s8(b(pc + 2));
    const cb = b(pc + 3);
    const bit = (cb >> 3) & 7;
    if ((cb & 0xc0) === 0x40) return { len: 4, text: `BIT ${bit},(${rp}${disp < 0 ? '' : '+'}${disp})`, guard: true };
    if ((cb & 0xc0) === 0x80) return { len: 4, text: `RES ${bit},(${rp}${disp < 0 ? '' : '+'}${disp})` };
    if ((cb & 0xc0) === 0xc0) return { len: 4, text: `SET ${bit},(${rp}${disp < 0 ? '' : '+'}${disp})` };
    return { len: 4, text: `CB ${hex(cb, 2)} (${rp}${disp < 0 ? '' : '+'}${disp})` };
  }
  const map = {
    0x21: { len: 4, text: `LD ${rp},${hex(u24(pc + 2), 6)}` },
    0x22: { len: 4, text: `LD (${hex(u24(pc + 2), 6)}),${rp}` },
    0x2a: { len: 4, text: `LD ${rp},(${hex(u24(pc + 2), 6)})` },
    0x23: { len: 2, text: `INC ${rp}` },
    0x2b: { len: 2, text: `DEC ${rp}` },
    0x34: { len: 3, text: `INC (${rp}${s8(b(pc + 2)) < 0 ? '' : '+'}${s8(b(pc + 2))})` },
    0x35: { len: 3, text: `DEC (${rp}${s8(b(pc + 2)) < 0 ? '' : '+'}${s8(b(pc + 2))})` },
    0x36: { len: 4, text: `LD (${rp}${s8(b(pc + 2)) < 0 ? '' : '+'}${s8(b(pc + 2))}),${hex(b(pc + 3), 2)}` },
    0x7e: { len: 3, text: `LD A,(${rp}${s8(b(pc + 2)) < 0 ? '' : '+'}${s8(b(pc + 2))})` },
    0x77: { len: 3, text: `LD (${rp}${s8(b(pc + 2)) < 0 ? '' : '+'}${s8(b(pc + 2))}),A` },
    0xe5: { len: 2, text: `PUSH ${rp}` },
    0xe1: { len: 2, text: `POP ${rp}` },
  };
  if (map[op]) return map[op];
  return { len: 2, text: `${prefix.toString(16).toUpperCase()} ${op.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decode(pc) {
  const op = b(pc);
  const rel = (mnemonic) => ({ len: 2, text: `${mnemonic} ${hex(relTarget(pc, b(pc + 1)), 6)}`, guard: true });
  const abs3 = (mnemonic, guard = false) => ({ len: 4, text: `${mnemonic} ${hex(u24(pc + 1), 6)}`, guard });
  const imm8 = (mnemonic, guard = false) => ({ len: 2, text: `${mnemonic} ${hex(b(pc + 1), 2)}`, guard });
  const imm24 = (mnemonic) => ({ len: 4, text: `${mnemonic} ${hex(u24(pc + 1), 6)}` });
  const fixed = {
    0x00: { len: 1, text: 'NOP' },
    0x01: { len: 4, text: `LD BC,${hex(u24(pc + 1), 6)}` },
    0x02: { len: 1, text: 'LD (BC),A' },
    0x03: { len: 1, text: 'INC BC' },
    0x04: { len: 1, text: 'INC B' },
    0x05: { len: 1, text: 'DEC B' },
    0x06: imm8('LD B,'),
    0x07: { len: 1, text: 'RLCA' },
    0x08: { len: 1, text: 'EX AF,AF\'' },
    0x09: { len: 1, text: 'ADD HL,BC' },
    0x0a: { len: 1, text: 'LD A,(BC)' },
    0x0b: { len: 1, text: 'DEC BC' },
    0x0c: { len: 1, text: 'INC C' },
    0x0d: { len: 1, text: 'DEC C' },
    0x0e: imm8('LD C,'),
    0x0f: { len: 1, text: 'RRCA' },
    0x10: rel('DJNZ'),
    0x11: { len: 4, text: `LD DE,${hex(u24(pc + 1), 6)}` },
    0x12: { len: 1, text: 'LD (DE),A' },
    0x13: { len: 1, text: 'INC DE' },
    0x16: imm8('LD D,'),
    0x18: rel('JR'),
    0x19: { len: 1, text: 'ADD HL,DE' },
    0x1a: { len: 1, text: 'LD A,(DE)' },
    0x1b: { len: 1, text: 'DEC DE' },
    0x1e: imm8('LD E,'),
    0x20: rel('JR NZ'),
    0x21: { len: 4, text: `LD HL,${hex(u24(pc + 1), 6)}` },
    0x22: { len: 4, text: `LD (${hex(u24(pc + 1), 6)}),HL` },
    0x23: { len: 1, text: 'INC HL' },
    0x28: rel('JR Z'),
    0x2a: { len: 4, text: `LD HL,(${hex(u24(pc + 1), 6)})` },
    0x2b: { len: 1, text: 'DEC HL' },
    0x2e: imm8('LD L,'),
    0x30: rel('JR NC'),
    0x31: { len: 4, text: `LD SP,${hex(u24(pc + 1), 6)}` },
    0x32: { len: 4, text: `LD (${hex(u24(pc + 1), 6)}),A` },
    0x36: { len: 2, text: `LD (HL),${hex(b(pc + 1), 2)}` },
    0x38: rel('JR C'),
    0x3a: { len: 4, text: `LD A,(${hex(u24(pc + 1), 6)})` },
    0x3d: { len: 1, text: 'DEC A' },
    0x3e: imm8('LD A,'),
    0x76: { len: 1, text: 'HALT' },
    0xa0: { len: 1, text: 'AND B', guard: true },
    0xa1: { len: 1, text: 'AND C', guard: true },
    0xa6: { len: 1, text: 'AND (HL)', guard: true },
    0xa7: { len: 1, text: 'AND A', guard: true },
    0xa8: { len: 1, text: 'XOR B', guard: true },
    0xaf: { len: 1, text: 'XOR A', guard: true },
    0xb0: { len: 1, text: 'OR B', guard: true },
    0xb1: { len: 1, text: 'OR C', guard: true },
    0xb6: { len: 1, text: 'OR (HL)', guard: true },
    0xb7: { len: 1, text: 'OR A', guard: true },
    0xc0: { len: 1, text: 'RET NZ', guard: true },
    0xc2: abs3('JP NZ', true),
    0xc3: abs3('JP'),
    0xc4: abs3('CALL NZ', true),
    0xc5: { len: 1, text: 'PUSH BC' },
    0xc6: imm8('ADD A,'),
    0xc8: { len: 1, text: 'RET Z', guard: true },
    0xc9: { len: 1, text: 'RET' },
    0xca: abs3('JP Z', true),
    0xcc: abs3('CALL Z', true),
    0xcd: abs3('CALL'),
    0xd0: { len: 1, text: 'RET NC', guard: true },
    0xd2: abs3('JP NC', true),
    0xd4: abs3('CALL NC', true),
    0xd5: { len: 1, text: 'PUSH DE' },
    0xd8: { len: 1, text: 'RET C', guard: true },
    0xda: abs3('JP C', true),
    0xdc: abs3('CALL C', true),
    0xe1: { len: 1, text: 'POP HL' },
    0xe5: { len: 1, text: 'PUSH HL' },
    0xe6: imm8('AND', true),
    0xeb: { len: 1, text: 'EX DE,HL' },
    0xf1: { len: 1, text: 'POP AF' },
    0xf5: { len: 1, text: 'PUSH AF' },
    0xf6: imm8('OR', true),
    0xfa: abs3('JP M', true),
    0xfe: imm8('CP', true),
  };
  if (op === 0xcb) return decodeCb(pc);
  if (op === 0xdd) return decodeIndexed(pc, op, 'IX');
  if (op === 0xed) return decodeEd(pc);
  if (op === 0xfd) return decodeIndexed(pc, op, 'IY');
  if (fixed[op]) return fixed[op];
  if (op >= 0x40 && op <= 0x7f) {
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, text: `LD ${reg[(op >> 3) & 7]},${reg[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    return { len: 1, text: `${alu} ${reg}`, guard: alu === 'AND' || alu === 'XOR' || alu === 'OR' || alu === 'CP' };
  }
  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function printRange(range) {
  console.log(`\n=== ${range.name}: ${hex(range.start, 6)}..${hex(range.end, 6)} ===`);
  let pc = range.start;
  while (pc < range.end) {
    if (entryPoints.has(pc)) console.log(`\n${hex(pc, 6)}:`);
    const ins = decode(pc);
    const marker = ins.guard || guardKind(ins.text) ? '  ; GUARD-CANDIDATE' : '';
    console.log(`${hex(pc, 6)}  ${bytesAt(pc, ins.len).padEnd(14)}  ${ins.text}${marker}`);
    pc += Math.max(ins.len, 1);
  }
}

console.log(`Loaded ${romPath} (${rom.length} bytes)`);
console.log('ADL-mode static decode. Conditional branches, returns, calls, CP/BIT/logical tests are tagged as guard candidates.');
for (const range of ranges) printRange(range);
