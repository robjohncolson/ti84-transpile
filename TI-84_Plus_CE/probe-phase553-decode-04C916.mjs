import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x04c916;
const END = 0x04c979;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function u8(offset) {
  return rom[offset] ?? 0;
}

function u16(offset) {
  return u8(offset) | (u8(offset + 1) << 8);
}

function u24(offset) {
  return u8(offset) | (u8(offset + 1) << 8) | (u8(offset + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytes(offset, length) {
  return Array.from(rom.subarray(offset, offset + length), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function relTarget(offset, length) {
  return offset + length + s8(u8(offset + length - 1));
}

function decodeAt(offset) {
  const op = u8(offset);
  const op2 = u8(offset + 1);

  if (op === 0x40) {
    const inner = decodeAt(offset + 1);
    return {
      length: inner.length + 1,
      text: `SIS ${inner.text}`,
      kind: inner.kind,
      target: inner.target,
      ramRef: inner.ramRef,
      arithmetic: inner.arithmetic,
    };
  }

  if (op === 0xed) {
    const nn = u24(offset + 2);
    const edMap = new Map([
      [0x4c, ['MLT BC', 'multiply']],
      [0x5c, ['MLT DE', 'multiply']],
      [0x6c, ['MLT HL', 'multiply']],
      [0x7c, ['MLT SP', 'multiply']],
      [0x27, [`LD HL,(${hex(nn, 6)})`, 'load24']],
      [0x37, [`LD (${hex(nn, 6)}),HL`, 'store24']],
    ]);
    if (edMap.has(op2)) {
      const [text, kind] = edMap.get(op2);
      const length = op2 === 0x27 || op2 === 0x37 ? 5 : 2;
      return {
        length,
        text,
        kind,
        ramRef: nn >= 0xd00000 ? nn : null,
        arithmetic: kind === 'multiply',
      };
    }
    return { length: 2, text: `ED ${hex(op2)}`, kind: 'unknown-ed' };
  }

  const imm24 = u24(offset + 1);
  const imm16 = u16(offset + 1);
  const imm8 = u8(offset + 1);
  const ixDisp = u8(offset + 2);
  const iyDisp = u8(offset + 2);

  const table = {
    0x00: [1, 'NOP'],
    0x01: [4, `LD BC,${hex(imm24, 6)}`],
    0x06: [2, `LD B,${hex(imm8)}`],
    0x09: [1, 'ADD HL,BC', 'arithmetic'],
    0x0a: [1, 'LD A,(BC)'],
    0x0b: [1, 'DEC BC', 'arithmetic'],
    0x0c: [1, 'INC C', 'arithmetic'],
    0x0d: [1, 'DEC C', 'arithmetic'],
    0x0e: [2, `LD C,${hex(imm8)}`],
    0x11: [4, `LD DE,${hex(imm24, 6)}`],
    0x13: [1, 'INC DE', 'arithmetic'],
    0x16: [2, `LD D,${hex(imm8)}`],
    0x19: [1, 'ADD HL,DE', 'arithmetic'],
    0x1a: [1, 'LD A,(DE)'],
    0x1b: [1, 'DEC DE', 'arithmetic'],
    0x1c: [1, 'INC E', 'arithmetic'],
    0x1d: [1, 'DEC E', 'arithmetic'],
    0x1e: [2, `LD E,${hex(imm8)}`],
    0x21: [4, `LD HL,${hex(imm24, 6)}`],
    0x22: [4, `LD (${hex(imm24, 6)}),HL`, 'store'],
    0x23: [1, 'INC HL', 'arithmetic'],
    0x26: [2, `LD H,${hex(imm8)}`],
    0x29: [1, 'ADD HL,HL', 'arithmetic'],
    0x2a: [4, `LD HL,(${hex(imm24, 6)})`, 'load'],
    0x2b: [1, 'DEC HL', 'arithmetic'],
    0x2c: [1, 'INC L', 'arithmetic'],
    0x2d: [1, 'DEC L', 'arithmetic'],
    0x2e: [2, `LD L,${hex(imm8)}`],
    0x31: [4, `LD SP,${hex(imm24, 6)}`],
    0x32: [4, `LD (${hex(imm24, 6)}),A`, 'store'],
    0x34: [1, 'INC (HL)', 'arithmetic'],
    0x35: [1, 'DEC (HL)', 'arithmetic'],
    0x36: [2, `LD (HL),${hex(imm8)}`],
    0x39: [1, 'ADD HL,SP', 'arithmetic'],
    0x3a: [4, `LD A,(${hex(imm24, 6)})`, 'load'],
    0x3c: [1, 'INC A', 'arithmetic'],
    0x3d: [1, 'DEC A', 'arithmetic'],
    0x3e: [2, `LD A,${hex(imm8)}`],
    0x44: [1, 'LD B,H'],
    0x45: [1, 'LD B,L'],
    0x47: [1, 'LD B,A'],
    0x4f: [1, 'LD C,A'],
    0x50: [1, 'LD D,B'],
    0x51: [1, 'LD D,C'],
    0x53: [4, `LD (${hex(imm24, 6)}),DE`, 'store'],
    0x54: [1, 'LD D,H'],
    0x55: [1, 'LD D,L'],
    0x56: [1, 'LD D,(HL)'],
    0x57: [1, 'LD D,A'],
    0x58: [1, 'LD E,B'],
    0x59: [1, 'LD E,C'],
    0x5a: [1, 'LD E,D'],
    0x5b: [4, `LD DE,(${hex(imm24, 6)})`, 'load'],
    0x5e: [1, 'LD E,(HL)'],
    0x5f: [1, 'LD E,A'],
    0x62: [1, 'LD H,D'],
    0x63: [1, 'LD H,E'],
    0x65: [1, 'LD H,L'],
    0x66: [1, 'LD H,(HL)'],
    0x67: [1, 'LD H,A'],
    0x68: [1, 'LD L,B'],
    0x69: [1, 'LD L,C'],
    0x6a: [1, 'LD L,D'],
    0x6b: [1, 'LD L,E'],
    0x6c: [1, 'LD L,H'],
    0x6e: [1, 'LD L,(HL)'],
    0x6f: [1, 'LD L,A'],
    0x70: [1, 'LD (HL),B'],
    0x71: [1, 'LD (HL),C'],
    0x72: [1, 'LD (HL),D'],
    0x73: [1, 'LD (HL),E'],
    0x74: [1, 'LD (HL),H'],
    0x75: [1, 'LD (HL),L'],
    0x77: [1, 'LD (HL),A'],
    0x78: [1, 'LD A,B'],
    0x79: [1, 'LD A,C'],
    0x7a: [1, 'LD A,D'],
    0x7b: [1, 'LD A,E'],
    0x7c: [1, 'LD A,H'],
    0x7d: [1, 'LD A,L'],
    0x7e: [1, 'LD A,(HL)'],
    0x80: [1, 'ADD A,B', 'arithmetic'],
    0x81: [1, 'ADD A,C', 'arithmetic'],
    0x82: [1, 'ADD A,D', 'arithmetic'],
    0x83: [1, 'ADD A,E', 'arithmetic'],
    0x84: [1, 'ADD A,H', 'arithmetic'],
    0x85: [1, 'ADD A,L', 'arithmetic'],
    0x86: [1, 'ADD A,(HL)', 'arithmetic'],
    0x87: [1, 'ADD A,A', 'arithmetic'],
    0x90: [1, 'SUB B', 'arithmetic'],
    0x91: [1, 'SUB C', 'arithmetic'],
    0x92: [1, 'SUB D', 'arithmetic'],
    0x93: [1, 'SUB E', 'arithmetic'],
    0x94: [1, 'SUB H', 'arithmetic'],
    0x95: [1, 'SUB L', 'arithmetic'],
    0x96: [1, 'SUB (HL)', 'arithmetic'],
    0x97: [1, 'SUB A', 'arithmetic'],
    0xa7: [1, 'AND A'],
    0xaf: [1, 'XOR A'],
    0xb7: [1, 'OR A'],
    0xc0: [1, 'RET NZ', 'ret'],
    0xc1: [1, 'POP BC'],
    0xc3: [4, `JP ${hex(imm24, 6)}`, 'jump'],
    0xc5: [1, 'PUSH BC'],
    0xc8: [1, 'RET Z', 'ret'],
    0xc9: [1, 'RET', 'ret'],
    0xcd: [4, `CALL ${hex(imm24, 6)}`, 'call'],
    0xd0: [1, 'RET NC', 'ret'],
    0xd1: [1, 'POP DE'],
    0xd5: [1, 'PUSH DE'],
    0xd8: [1, 'RET C', 'ret'],
    0xe1: [1, 'POP HL'],
    0xe5: [1, 'PUSH HL'],
    0xe9: [1, 'JP (HL)', 'jump'],
    0xeb: [1, 'EX DE,HL'],
    0xf1: [1, 'POP AF'],
    0xf5: [1, 'PUSH AF'],
    0xf9: [1, 'LD SP,HL'],
  };

  if (op === 0x18) {
    return { length: 2, text: `JR ${hex(relTarget(offset, 2), 6)}`, kind: 'jump', target: relTarget(offset, 2) };
  }
  if (op === 0x20) {
    return { length: 2, text: `JR NZ,${hex(relTarget(offset, 2), 6)}`, kind: 'branch', target: relTarget(offset, 2) };
  }
  if (op === 0x28) {
    return { length: 2, text: `JR Z,${hex(relTarget(offset, 2), 6)}`, kind: 'branch', target: relTarget(offset, 2) };
  }
  if (op === 0x30) {
    return { length: 2, text: `JR NC,${hex(relTarget(offset, 2), 6)}`, kind: 'branch', target: relTarget(offset, 2) };
  }
  if (op === 0x38) {
    return { length: 2, text: `JR C,${hex(relTarget(offset, 2), 6)}`, kind: 'branch', target: relTarget(offset, 2) };
  }
  if (op === 0xcb) {
    return { length: 2, text: `CB ${hex(op2)}`, kind: 'bit' };
  }
  if (op === 0xdd || op === 0xfd) {
    const reg = op === 0xdd ? 'IX' : 'IY';
    const sub = op2;
    if (sub === 0x21) return { length: 5, text: `LD ${reg},${hex(u24(offset + 2), 6)}` };
    if (sub === 0x22) return { length: 5, text: `LD (${hex(u24(offset + 2), 6)}),${reg}`, kind: 'store', ramRef: u24(offset + 2) >= 0xd00000 ? u24(offset + 2) : null };
    if (sub === 0x2a) return { length: 5, text: `LD ${reg},(${hex(u24(offset + 2), 6)})`, kind: 'load', ramRef: u24(offset + 2) >= 0xd00000 ? u24(offset + 2) : null };
    if (sub === 0x36) return { length: 4, text: `LD (${reg}+${hex(ixDisp)}),${hex(u8(offset + 3))}` };
    if (sub === 0x46) return { length: 3, text: `LD B,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x4e) return { length: 3, text: `LD C,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x56) return { length: 3, text: `LD D,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x5e) return { length: 3, text: `LD E,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x66) return { length: 3, text: `LD H,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x6e) return { length: 3, text: `LD L,(${reg}+${hex(ixDisp)})` };
    if (sub === 0x70) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),B` };
    if (sub === 0x71) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),C` };
    if (sub === 0x72) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),D` };
    if (sub === 0x73) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),E` };
    if (sub === 0x74) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),H` };
    if (sub === 0x75) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),L` };
    if (sub === 0x77) return { length: 3, text: `LD (${reg}+${hex(iyDisp)}),A` };
    if (sub === 0x7e) return { length: 3, text: `LD A,(${reg}+${hex(ixDisp)})` };
    if (sub === 0xcb) return { length: 4, text: `${reg} CB ${hex(u8(offset + 2))} ${hex(u8(offset + 3))}`, kind: 'bit' };
    if (sub === 0xe5) return { length: 2, text: `PUSH ${reg}` };
    if (sub === 0xe1) return { length: 2, text: `POP ${reg}` };
    return { length: 2, text: `${reg} prefix ${hex(sub)}`, kind: 'unknown-index' };
  }

  if (table[op]) {
    const [length, text, kind = 'op'] = table[op];
    const ramRef = imm24 >= 0xd00000 && /(LD \(|LD .*,\()/.test(text) ? imm24 : null;
    return { length, text, kind, ramRef, arithmetic: kind === 'arithmetic' };
  }

  return { length: 1, text: `DB ${hex(op)}`, kind: 'data-or-unknown' };
}

const instructions = [];
const retOffsets = [];
const branchTargets = new Set([START]);
const ramRefs = new Set();
const arithmetic = [];
const calls = [];

for (let pc = START; pc < END;) {
  const insn = decodeAt(pc);
  instructions.push({ pc, ...insn, bytes: bytes(pc, insn.length) });

  if (insn.kind === 'ret') retOffsets.push(pc);
  if (insn.target != null && insn.target >= START && insn.target < END) branchTargets.add(insn.target);
  if (insn.ramRef != null) ramRefs.add(insn.ramRef);
  if (insn.arithmetic) arithmetic.push(pc);
  if (insn.kind === 'call') calls.push({ pc, target: u24(pc + 1) });

  pc += insn.length;
}

const probableEntries = [...branchTargets].sort((a, b) => a - b);
const functions = [];
for (const entry of probableEntries) {
  const firstRet = retOffsets.find((ret) => ret >= entry);
  functions.push({
    entry: hex(entry, 6),
    endsAt: firstRet == null ? hex(END - 1, 6) : hex(firstRet, 6),
    terminator: firstRet == null ? 'falls into 0x04C979 boundary' : 'RET-family instruction',
  });
}

console.log(JSON.stringify({
  probe: 'phase553-decode-04C916',
  range: `${hex(START, 6)}-${hex(END - 1, 6)}`,
  byteCount: END - START,
  suspectedPurpose: 'Decode helper called by cursor positioning path at 0x0A2706; inspect for x/pixel coordinate computation, row/column scaling, and display RAM state setup.',
  functionBoundaries: functions,
  retOffsets: retOffsets.map((v) => hex(v, 6)),
  internalEntryPoints: probableEntries.map((v) => hex(v, 6)),
  calls: calls.map(({ pc, target }) => ({ at: hex(pc, 6), target: hex(target, 6) })),
  ramReferences: [...ramRefs].sort((a, b) => a - b).map((v) => hex(v, 6)),
  arithmeticAndMultiplySites: arithmetic.map((v) => {
    const insn = instructions.find((i) => i.pc === v);
    return { at: hex(v, 6), instruction: insn?.text };
  }),
  notes: [
    'MLT opcodes are highlighted as multiplication candidates.',
    'ADD/SUB/INC/DEC and ADD HL,rr opcodes are highlighted as arithmetic/address-computation candidates.',
    'Direct 24-bit loads/stores to 0xD00000+ are reported as RAM references; indexed RAM through IY/IX is printed in the disassembly.',
    'Function boundaries are inferred from 0x04C916, internal branch targets, and RET-family opcodes before 0x04C979.',
  ],
}, null, 2));

console.log('\nDISASSEMBLY');
for (const insn of instructions) {
  const markers = [];
  if (probableEntries.includes(insn.pc)) markers.push('entry');
  if (insn.kind === 'ret') markers.push('ret');
  if (insn.ramRef != null) markers.push(`ram:${hex(insn.ramRef, 6)}`);
  if (insn.arithmetic) markers.push('arith');
  const marker = markers.length ? ` ; ${markers.join(', ')}` : '';
  console.log(`${hex(insn.pc, 6)}  ${insn.bytes.padEnd(14)}  ${insn.text}${marker}`);
}
