#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const START = 0x030078;
const MAX_BYTES = 64;
const ROM_URL = new URL('./ROM.rom', import.meta.url);

const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const cond = {
  0x20: 'NZ',
  0x28: 'Z',
  0x30: 'NC',
  0x38: 'C',
  0xc2: 'NZ',
  0xc4: 'NZ',
  0xca: 'Z',
  0xcc: 'Z',
  0xd2: 'NC',
  0xd4: 'NC',
  0xda: 'C',
  0xdc: 'C',
  0xe2: 'PO',
  0xe4: 'PO',
  0xea: 'PE',
  0xec: 'PE',
  0xf2: 'P',
  0xf4: 'P',
  0xfa: 'M',
  0xfc: 'M',
};

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr(value) {
  return hex(value & 0xffffff, 6);
}

function byte(rom, offset) {
  return offset >= 0 && offset < rom.length ? rom[offset] : undefined;
}

function have(rom, offset, length) {
  return offset >= 0 && offset + length <= rom.length;
}

function u24(rom, offset) {
  return byte(rom, offset) | (byte(rom, offset + 1) << 8) | (byte(rom, offset + 2) << 16);
}

function s8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function relTarget(pc, length, displacement) {
  return (pc + length + s8(displacement)) & 0xffffff;
}

function rawBytes(rom, pc, length) {
  return Array.from(rom.subarray(pc, Math.min(pc + length, rom.length)))
    .map((value) => value.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function dispText(displacement) {
  const value = s8(displacement);
  if (value < 0) {
    return `-${hex(Math.abs(value), 2)}`;
  }
  return `+${hex(value, 2)}`;
}

function indexedMem(index, displacement) {
  return `(${index}${dispText(displacement)})`;
}

function decodeCb(opcode, operand = '(HL)', indexed = false) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 7;
  const reg = regs[opcode & 7];

  if (group === 0) {
    if (indexed && reg !== '(HL)') {
      return `${rot[bit]} ${operand},${reg}`;
    }
    return `${rot[bit]} ${indexed ? operand : reg}`;
  }

  if (group === 1) {
    return `BIT ${bit},${indexed ? operand : reg}`;
  }

  if (indexed && reg !== '(HL)') {
    return `${group === 2 ? 'RES' : 'SET'} ${bit},${operand},${reg}`;
  }
  return `${group === 2 ? 'RES' : 'SET'} ${bit},${indexed ? operand : reg}`;
}

function decodeIndexed(rom, pc, index) {
  if (!have(rom, pc, 2)) {
    return { length: 1, mnemonic: `DB ${hex(byte(rom, pc) ?? 0)}` };
  }

  const op = byte(rom, pc + 1);
  if (op === 0xcb) {
    if (!have(rom, pc, 4)) {
      return { length: 1, mnemonic: `DB ${hex(byte(rom, pc) ?? 0)}` };
    }
    const displacement = byte(rom, pc + 2);
    const cbOpcode = byte(rom, pc + 3);
    return {
      length: 4,
      mnemonic: decodeCb(cbOpcode, indexedMem(index, displacement), true),
    };
  }

  const absoluteLoads = {
    0x21: `LD ${index},`,
    0x22: `LD (`,
    0x2a: `LD ${index},(`,
  };
  if (op in absoluteLoads && have(rom, pc, 5)) {
    const target = u24(rom, pc + 2);
    if (op === 0x22) {
      return { length: 5, mnemonic: `LD (${addr(target)}),${index}` };
    }
    if (op === 0x2a) {
      return { length: 5, mnemonic: `LD ${index},(${addr(target)})` };
    }
    return { length: 5, mnemonic: `LD ${index},${addr(target)}` };
  }

  const oneByte = {
    0x09: `ADD ${index},BC`,
    0x19: `ADD ${index},DE`,
    0x23: `INC ${index}`,
    0x29: `ADD ${index},${index}`,
    0x2b: `DEC ${index}`,
    0x39: `ADD ${index},SP`,
    0xe1: `POP ${index}`,
    0xe3: `EX (SP),${index}`,
    0xe5: `PUSH ${index}`,
    0xe9: `JP (${index})`,
    0xf9: `LD SP,${index}`,
  };
  if (op in oneByte) {
    return { length: 2, mnemonic: oneByte[op], terminal: op === 0xe9 };
  }

  const displacementOps = {
    0x34: 'INC',
    0x35: 'DEC',
    0x46: 'LD B,',
    0x4e: 'LD C,',
    0x56: 'LD D,',
    0x5e: 'LD E,',
    0x66: 'LD H,',
    0x6e: 'LD L,',
    0x70: 'LD',
    0x71: 'LD',
    0x72: 'LD',
    0x73: 'LD',
    0x74: 'LD',
    0x75: 'LD',
    0x77: 'LD',
    0x7e: 'LD A,',
    0x86: 'ADD A,',
    0x8e: 'ADC A,',
    0x96: 'SUB',
    0x9e: 'SBC A,',
    0xa6: 'AND',
    0xae: 'XOR',
    0xb6: 'OR',
    0xbe: 'CP',
  };
  if (op === 0x36 && have(rom, pc, 4)) {
    return {
      length: 4,
      mnemonic: `LD ${indexedMem(index, byte(rom, pc + 2))},${hex(byte(rom, pc + 3))}`,
    };
  }
  if (op in displacementOps && have(rom, pc, 3)) {
    const memory = indexedMem(index, byte(rom, pc + 2));
    if (op >= 0x70 && op <= 0x77) {
      return { length: 3, mnemonic: `LD ${memory},${regs[op & 7]}` };
    }
    const prefix = displacementOps[op];
    return { length: 3, mnemonic: `${prefix}${prefix.endsWith(',') ? '' : ' '}${memory}` };
  }

  return { length: 2, mnemonic: `${index} prefix opcode ${hex(op)}` };
}

function decodeEd(rom, pc) {
  if (!have(rom, pc, 2)) {
    return { length: 1, mnemonic: `DB ${hex(byte(rom, pc) ?? 0)}` };
  }
  const op = byte(rom, pc + 1);
  const simple = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4d: 'RETI',
    0x4f: 'LD R,A',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5e: 'IM 2',
    0x5f: 'LD A,R',
    0x67: 'RRD',
    0x6f: 'RLD',
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa2: 'INI',
    0xa3: 'OUTI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xaa: 'IND',
    0xab: 'OUTD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb2: 'INIR',
    0xb3: 'OTIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
    0xba: 'INDR',
    0xbb: 'OTDR',
  };
  if (op in simple) {
    return { length: 2, mnemonic: simple[op], terminal: op === 0x45 || op === 0x4d };
  }

  const rr = {
    0x43: 'BC',
    0x4b: 'BC',
    0x53: 'DE',
    0x5b: 'DE',
    0x63: 'HL',
    0x6b: 'HL',
    0x73: 'SP',
    0x7b: 'SP',
  };
  if (op in rr && have(rom, pc, 5)) {
    const target = u24(rom, pc + 2);
    const reg = rr[op];
    if ((op & 0x08) === 0) {
      return { length: 5, mnemonic: `LD (${addr(target)}),${reg}` };
    }
    return { length: 5, mnemonic: `LD ${reg},(${addr(target)})` };
  }

  return { length: 2, mnemonic: `ED ${hex(op)}` };
}

function decode(rom, pc) {
  const op = byte(rom, pc);
  if (op === undefined) {
    return { length: 1, mnemonic: '<outside ROM>' };
  }

  if (op === 0xdd || op === 0xfd) {
    return decodeIndexed(rom, pc, op === 0xdd ? 'IX' : 'IY');
  }
  if (op === 0xcb && have(rom, pc, 2)) {
    return { length: 2, mnemonic: decodeCb(byte(rom, pc + 1)) };
  }
  if (op === 0xed) {
    return decodeEd(rom, pc);
  }

  if (op === 0xcd && have(rom, pc, 4)) {
    const target = u24(rom, pc + 1);
    return { length: 4, mnemonic: `CALL ${addr(target)}`, callTarget: target };
  }
  if (op === 0xc3 && have(rom, pc, 4)) {
    const target = u24(rom, pc + 1);
    return { length: 4, mnemonic: `JP ${addr(target)}`, branchTarget: target, terminal: true };
  }
  if (op in cond && (op & 0x07) === 0x02 && have(rom, pc, 4)) {
    const target = u24(rom, pc + 1);
    return { length: 4, mnemonic: `JP ${cond[op]},${addr(target)}`, branchTarget: target };
  }
  if (op in cond && (op & 0x07) === 0x04 && have(rom, pc, 4)) {
    const target = u24(rom, pc + 1);
    return { length: 4, mnemonic: `CALL ${cond[op]},${addr(target)}`, callTarget: target };
  }
  if (op === 0xc9) {
    return { length: 1, mnemonic: 'RET', terminal: true };
  }

  if ((op === 0x18 || op === 0x10 || op in cond) && have(rom, pc, 2)) {
    const target = relTarget(pc, 2, byte(rom, pc + 1));
    if (op === 0x18) {
      return { length: 2, mnemonic: `JR ${addr(target)}`, branchTarget: target };
    }
    if (op === 0x10) {
      return { length: 2, mnemonic: `DJNZ ${addr(target)}`, branchTarget: target };
    }
    return { length: 2, mnemonic: `JR ${cond[op]},${addr(target)}`, branchTarget: target };
  }

  if ((op === 0x3a || op === 0x32 || op === 0x2a || op === 0x22) && have(rom, pc, 4)) {
    const target = u24(rom, pc + 1);
    if (op === 0x3a) return { length: 4, mnemonic: `LD A,(${addr(target)})` };
    if (op === 0x32) return { length: 4, mnemonic: `LD (${addr(target)}),A` };
    if (op === 0x2a) return { length: 4, mnemonic: `LD HL,(${addr(target)})` };
    return { length: 4, mnemonic: `LD (${addr(target)}),HL` };
  }

  const ldRr = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (op in ldRr && have(rom, pc, 4)) {
    return { length: 4, mnemonic: `LD ${ldRr[op]},${addr(u24(rom, pc + 1))}` };
  }

  if ((op & 0xc7) === 0x06 && have(rom, pc, 2)) {
    return { length: 2, mnemonic: `LD ${regs[(op >> 3) & 7]},${hex(byte(rom, pc + 1))}` };
  }
  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { length: 1, mnemonic: 'HALT' };
    return { length: 1, mnemonic: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) {
    const group = (op >> 3) & 7;
    const reg = regs[op & 7];
    return { length: 1, mnemonic: `${alu[group]}${group === 2 || group === 4 || group === 5 || group === 6 || group === 7 ? ' ' : ','}${reg}` };
  }
  if ((op & 0xc7) === 0xc6 && have(rom, pc, 2)) {
    const group = (op >> 3) & 7;
    return { length: 2, mnemonic: `${alu[group]}${group === 2 || group === 4 || group === 5 || group === 6 || group === 7 ? ' ' : ','}${hex(byte(rom, pc + 1))}` };
  }

  const oneByte = {
    0x00: 'NOP',
    0x02: 'LD (BC),A',
    0x03: 'INC BC',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x08: "EX AF,AF'",
    0x09: 'ADD HL,BC',
    0x0a: 'LD A,(BC)',
    0x0b: 'DEC BC',
    0x0c: 'INC C',
    0x0d: 'DEC C',
    0x0f: 'RRCA',
    0x12: 'LD (DE),A',
    0x13: 'INC DE',
    0x14: 'INC D',
    0x15: 'DEC D',
    0x17: 'RLA',
    0x19: 'ADD HL,DE',
    0x1a: 'LD A,(DE)',
    0x1b: 'DEC DE',
    0x1c: 'INC E',
    0x1d: 'DEC E',
    0x1f: 'RRA',
    0x23: 'INC HL',
    0x24: 'INC H',
    0x25: 'DEC H',
    0x27: 'DAA',
    0x29: 'ADD HL,HL',
    0x2b: 'DEC HL',
    0x2c: 'INC L',
    0x2d: 'DEC L',
    0x2f: 'CPL',
    0x33: 'INC SP',
    0x34: 'INC (HL)',
    0x35: 'DEC (HL)',
    0x37: 'SCF',
    0x39: 'ADD HL,SP',
    0x3b: 'DEC SP',
    0x3c: 'INC A',
    0x3d: 'DEC A',
    0x3f: 'CCF',
    0xc0: 'RET NZ',
    0xc1: 'POP BC',
    0xc5: 'PUSH BC',
    0xc7: 'RST 0x00',
    0xc8: 'RET Z',
    0xd0: 'RET NC',
    0xd1: 'POP DE',
    0xd5: 'PUSH DE',
    0xd7: 'RST 0x10',
    0xd8: 'RET C',
    0xe1: 'POP HL',
    0xe3: 'EX (SP),HL',
    0xe5: 'PUSH HL',
    0xe7: 'RST 0x20',
    0xe9: 'JP (HL)',
    0xeb: 'EX DE,HL',
    0xef: 'RST 0x28',
    0xf1: 'POP AF',
    0xf3: 'DI',
    0xf5: 'PUSH AF',
    0xf7: 'RST 0x30',
    0xf9: 'LD SP,HL',
    0xfb: 'EI',
    0xff: 'RST 0x38',
  };
  if (op in oneByte) {
    return { length: 1, mnemonic: oneByte[op], terminal: op === 0xe9 };
  }

  if ((op === 0xd3 || op === 0xdb || op === 0x3e) && have(rom, pc, 2)) {
    if (op === 0xd3) return { length: 2, mnemonic: `OUT (${hex(byte(rom, pc + 1))}),A` };
    if (op === 0xdb) return { length: 2, mnemonic: `IN A,(${hex(byte(rom, pc + 1))})` };
    return { length: 2, mnemonic: `LD A,${hex(byte(rom, pc + 1))}` };
  }

  return { length: 1, mnemonic: `DB ${hex(op)}` };
}

const rom = await readFile(ROM_URL);
const callTargets = new Set();
const branchTargets = new Set();

console.log(`Decode probe for ${addr(START)} (${MAX_BYTES} byte limit)`);
console.log('');
console.log('Address   Bytes              Instruction');
console.log('--------  -----------------  ------------------------------');

let pc = START;
const limit = START + MAX_BYTES;
while (pc < limit) {
  const decoded = decode(rom, pc);
  const length = Math.max(decoded.length, 1);
  if (decoded.callTarget !== undefined) callTargets.add(decoded.callTarget & 0xffffff);
  if (decoded.branchTarget !== undefined) branchTargets.add(decoded.branchTarget & 0xffffff);

  console.log(`${addr(pc)}  ${rawBytes(rom, pc, length).padEnd(17)}  ${decoded.mnemonic}`);
  pc += length;

  if (decoded.terminal) {
    break;
  }
}

function printTargets(label, targets) {
  const sorted = Array.from(targets).sort((a, b) => a - b);
  console.log('');
  console.log(`${label}: ${sorted.length ? sorted.map(addr).join(', ') : '(none)'}`);
}

printTargets('CALL targets', callTargets);
printTargets('Branch targets', branchTargets);
