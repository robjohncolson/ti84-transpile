import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TARGETS = new Set([0x07d577, 0x07d583, 0x07d83b]);
const RAM_WATCH_START = 0xd01eb1;
const RAM_WATCH_END = 0xd01ef9;
const RAM_GATE = 0xd02032;

const ramAccesses = [];
const branchTargets = [];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function imm16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function rel8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function bytesAt(pc, size) {
  return Array.from(rom.subarray(pc, pc + size));
}

function byteText(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function isWatchedRam(addr) {
  return addr === RAM_GATE || (addr >= RAM_WATCH_START && addr <= RAM_WATCH_END);
}

function noteRam(pc, access, addr, detail = '') {
  ramAccesses.push({ pc, access, addr, detail });
}

function noteTarget(pc, kind, target) {
  branchTargets.push({ pc, kind, target });
}

function reg8(code) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][code & 7];
}

function reg8Index(code, index, disp) {
  if ((code & 7) !== 6) return reg8(code);
  return `(${index}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`;
}

function aluName(group) {
  return ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'][group];
}

function ccName(code) {
  return ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][code & 7];
}

function decodeCb(pc, prefix = null, disp = null) {
  const op = rom[pc + (prefix ? 3 : 1)];
  const size = prefix ? 4 : 2;
  const target = prefix ? reg8Index(op, prefix, disp) : reg8(op);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const y = (op >> 3) & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y];
  if (group === 0) return { size, text: `${rot} ${target}` };
  if (group === 1) return { size, text: `BIT ${bit},${target}` };
  if (group === 2) return { size, text: `RES ${bit},${target}` };
  return { size, text: `SET ${bit},${target}` };
}

function decodeEd(pc) {
  const op = rom[pc + 1];
  const simple = {
    0x27: 'LD HL,(HL) ; eZ80 indirect 24-bit load',
    0x4c: 'MLT BC',
    0x5c: 'MLT DE',
    0x6c: 'MLT HL',
    0x44: 'NEG',
    0x45: 'RETN',
    0x47: 'LD I,A',
    0x4d: 'RETI',
    0x4f: 'LD R,A',
    0x57: 'LD A,I',
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
  if (simple[op]) return { size: 2, text: simple[op] };

  if ((op & 0xc7) === 0x43) {
    const rr = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    const addr = addr24(pc + 2);
    if (isWatchedRam(addr)) noteRam(pc, 'write', addr, `LD (${hex(addr, 6)}),${rr}`);
    return { size: 5, text: `LD (${hex(addr, 6)}),${rr}` };
  }
  if ((op & 0xc7) === 0x4b) {
    const rr = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    const addr = addr24(pc + 2);
    if (isWatchedRam(addr)) noteRam(pc, 'read', addr, `LD ${rr},(${hex(addr, 6)})`);
    return { size: 5, text: `LD ${rr},(${hex(addr, 6)})` };
  }
  return { size: 2, text: `ED ${hex(op)} ; unimplemented/unknown ED opcode` };
}

function decodeIndex(pc, index) {
  const op = rom[pc + 1];
  const rr = index;
  if (op === 0xcb) return decodeCb(pc, index, rel8(rom[pc + 2]));
  if (op === 0x21) return { size: 5, text: `LD ${rr},${hex(addr24(pc + 2), 6)}` };
  if (op === 0x22) {
    const addr = addr24(pc + 2);
    if (isWatchedRam(addr)) noteRam(pc, 'write', addr, `LD (${hex(addr, 6)}),${rr}`);
    return { size: 5, text: `LD (${hex(addr, 6)}),${rr}` };
  }
  if (op === 0x2a) {
    const addr = addr24(pc + 2);
    if (isWatchedRam(addr)) noteRam(pc, 'read', addr, `LD ${rr},(${hex(addr, 6)})`);
    return { size: 5, text: `LD ${rr},(${hex(addr, 6)})` };
  }
  if (op === 0x36) return { size: 4, text: `LD (${rr}${rel8(rom[pc + 2]) < 0 ? '-' : '+'}${hex(Math.abs(rel8(rom[pc + 2])), 2)}),${hex(rom[pc + 3])}` };
  if (op === 0x34 || op === 0x35) {
    const d = rel8(rom[pc + 2]);
    return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${rr}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})` };
  }
  if ((op & 0xc7) === 0x46 || (op & 0xf8) === 0x70) {
    const d = rel8(rom[pc + 2]);
    if ((op & 0xc7) === 0x46) return { size: 3, text: `LD ${reg8(op >> 3)},(${rr}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})` };
    return { size: 3, text: `LD (${rr}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)}),${reg8(op)}` };
  }

  const fallthrough = decodeBase(pc + 1);
  return { size: fallthrough.size + 1, text: `${index} prefix: ${fallthrough.text}` };
}

function decodeBase(pc) {
  const op = rom[pc];
  if (op === 0x40) {
    const next = decodeBase(pc + 1);
    return { size: next.size + 1, text: `.SIS ${next.text}` };
  }
  if (op === 0xed) return decodeEd(pc);
  if (op === 0xcb) return decodeCb(pc);
  if (op === 0xdd) return decodeIndex(pc, 'IX');
  if (op === 0xfd) return decodeIndex(pc, 'IY');

  const simple = {
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
    0x76: 'HALT',
    0xc9: 'RET',
    0xd9: 'EXX',
    0xe3: 'EX (SP),HL',
    0xe9: 'JP (HL)',
    0xeb: 'EX DE,HL',
    0xf3: 'DI',
    0xf9: 'LD SP,HL',
    0xfb: 'EI',
  };
  if (simple[op]) return { size: 1, text: simple[op] };

  if ([0x01, 0x11, 0x21, 0x31].includes(op)) {
    const rr = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    return { size: 4, text: `LD ${rr},${hex(addr24(pc + 1), 6)}` };
  }
  if ([0x06, 0x0e, 0x16, 0x1e, 0x26, 0x2e, 0x36, 0x3e].includes(op)) {
    return { size: 2, text: `LD ${reg8(op >> 3)},${hex(rom[pc + 1])}` };
  }
  if (op === 0x22 || op === 0x32) {
    const addr = addr24(pc + 1);
    const src = op === 0x22 ? 'HL' : 'A';
    if (isWatchedRam(addr)) noteRam(pc, 'write', addr, `LD (${hex(addr, 6)}),${src}`);
    return { size: 4, text: `LD (${hex(addr, 6)}),${src}` };
  }
  if (op === 0x2a || op === 0x3a) {
    const addr = addr24(pc + 1);
    const dst = op === 0x2a ? 'HL' : 'A';
    if (isWatchedRam(addr)) noteRam(pc, 'read', addr, `LD ${dst},(${hex(addr, 6)})`);
    return { size: 4, text: `LD ${dst},(${hex(addr, 6)})` };
  }
  if ((op & 0xc0) === 0x40) return { size: 1, text: `LD ${reg8(op >> 3)},${reg8(op)}` };
  if ((op & 0xc0) === 0x80) {
    const group = (op >> 3) & 7;
    const rhs = reg8(op);
    return { size: 1, text: group === 2 || group === 4 || group === 5 || group === 6 || group === 7 ? `${aluName(group)} ${rhs}` : `${aluName(group)}${rhs}` };
  }
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${ccName(op >> 3)}` };
  if ((op & 0xc7) === 0xc2) {
    const target = addr24(pc + 1);
    noteTarget(pc, `JP ${ccName(op >> 3)}`, target);
    return { size: 4, text: `JP ${ccName(op >> 3)},${hex(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = addr24(pc + 1);
    noteTarget(pc, `CALL ${ccName(op >> 3)}`, target);
    return { size: 4, text: `CALL ${ccName(op >> 3)},${hex(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc7) {
    const target = op & 0x38;
    noteTarget(pc, 'RST', target);
    return { size: 1, text: `RST ${hex(target, 2)}` };
  }
  if ([0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe].includes(op)) {
    const group = (op >> 3) & 7;
    return { size: 2, text: `${aluName(group)} ${hex(rom[pc + 1])}` };
  }
  if ([0xc1, 0xd1, 0xe1, 0xf1].includes(op)) return { size: 1, text: `POP ${['BC', 'DE', 'HL', 'AF'][(op >> 4) - 12]}` };
  if ([0xc5, 0xd5, 0xe5, 0xf5].includes(op)) return { size: 1, text: `PUSH ${['BC', 'DE', 'HL', 'AF'][(op >> 4) - 12]}` };
  if (op === 0xc3) {
    const target = addr24(pc + 1);
    noteTarget(pc, 'JP', target);
    return { size: 4, text: `JP ${hex(target, 6)}` };
  }
  if (op === 0xcd) {
    const target = addr24(pc + 1);
    noteTarget(pc, 'CALL', target);
    return { size: 4, text: `CALL ${hex(target, 6)}` };
  }
  if (op === 0x10 || op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
    const d = rel8(rom[pc + 1]);
    const target = pc + 2 + d;
    const kind = op === 0x10 ? 'DJNZ' : op === 0x18 ? 'JR' : `JR ${ccName((op >> 3) - 4)}`;
    noteTarget(pc, kind, target);
    return { size: 2, text: `${kind},${hex(target, 6)} ; rel ${d >= 0 ? '+' : ''}${d}` };
  }
  if (op === 0xd3) return { size: 2, text: `OUT (${hex(rom[pc + 1])}),A` };
  if (op === 0xdb) return { size: 2, text: `IN A,(${hex(rom[pc + 1])})` };

  return { size: 1, text: `DB ${hex(op)} ; unknown` };
}

function decodeRange(label, start, minBytes, hardStop = null) {
  console.log(`\n=== ${label}: ${hex(start, 6)} ===`);
  let pc = start;
  const end = start + minBytes;
  while (pc < end || (hardStop !== null && pc < hardStop)) {
    if (pc < 0 || pc >= rom.length) break;
    const decoded = decodeBase(pc);
    const bytes = bytesAt(pc, decoded.size);
    const targetMark = TARGETS.has(pc) ? ' <target>' : '';
    console.log(`${hex(pc, 6)}${targetMark}  ${byteText(bytes).padEnd(15)}  ${decoded.text}`);
    pc += Math.max(decoded.size, 1);
    if (hardStop === null && pc >= end && decoded.text === 'RET') break;
  }
}

decodeRange('0x07D577 per-type writer prelude', 0x07d577, 0x07d583 - 0x07d577, 0x07d583);
decodeRange('0x07D583 primary descriptor populator', 0x07d583, 0x80);
decodeRange('0x07D83B descriptor pointer writer', 0x07d83b, 0x65);

console.log('\n=== RAM access summary ===');
if (ramAccesses.length === 0) {
  console.log('No direct absolute watched RAM accesses decoded. Descriptor writes may occur through HL/DE/IX/IY pointers.');
} else {
  for (const access of ramAccesses) {
    console.log(`${hex(access.pc, 6)}  ${access.access.toUpperCase().padEnd(5)} ${hex(access.addr, 6)}  ${access.detail}`);
  }
}

console.log('\n=== CALL/JP/JR targets ===');
for (const target of branchTargets) {
  console.log(`${hex(target.pc, 6)}  ${target.kind.padEnd(10)} ${hex(target.target, 6)}`);
}

console.log('\n=== Findings checklist for manual review ===');
console.log('- D02032 is the expected master gate; look for LD A,(D02032) followed by BIT/AND tests for bits 0, 1, and 2.');
console.log('- D01EB1/D01ECC, D01EBA/D01ED5, and D01EDE/D01EF9 are the expected descriptor block pointer pairs.');
console.log('- 0x07D583 should select each cursor descriptor pair, test the corresponding D02032 bit, and conditionally call 0x07D577.');
console.log('- 0x07D577 is expected to prepare per-type state and call or fall through to 0x07D83B.');
console.log('- 0x07D83B is expected to perform the final descriptor writes through HL or another pointer register; inspect LD (HL),r / LD (DE),A / indexed stores in the listing.');
console.log('- In ADL mode, immediate addresses in LD/CALL/JP are decoded as 24-bit little-endian values.');
