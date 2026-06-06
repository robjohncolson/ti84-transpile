import fs from 'fs';

const rom = fs.readFileSync('./TI-84_Plus_CE/ROM.rom');

const START = 0x03e187;
const END = 0x03e250;

const callTargets = new Map();
const ports = new Map();

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function rel8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function bytesAt(addr, size) {
  const bytes = [];
  for (let i = 0; i < size; i++) {
    bytes.push(hex(rom[addr + i]));
  }
  return bytes;
}

function recordCall(target, at) {
  const key = `0x${hex(target, 6)}`;
  if (!callTargets.has(key)) {
    callTargets.set(key, []);
  }
  callTargets.get(key).push(at);
}

function recordPort(port, op, at) {
  const key = `0x${hex(port)}`;
  if (!ports.has(key)) {
    ports.set(key, []);
  }
  ports.get(key).push({ op, at });
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function disassembleOne(pc) {
  const op = rom[pc];

  if (op === 0xed) {
    const op2 = rom[pc + 1];
    if (op2 === 0x38) {
      const port = rom[pc + 2];
      recordPort(port, 'IN0 A', pc);
      return { size: 3, mnemonic: 'IN0', operands: `A,(0x${hex(port)})` };
    }
    if (op2 === 0x39) {
      const port = rom[pc + 2];
      recordPort(port, 'OUT0 A', pc);
      return { size: 3, mnemonic: 'OUT0', operands: `(0x${hex(port)}),A` };
    }

    const edMap = {
      0x44: ['NEG', ''],
      0x45: ['RETN', ''],
      0x47: ['LD', 'I,A'],
      0x4d: ['RETI', ''],
      0x4f: ['LD', 'R,A'],
      0x57: ['LD', 'A,I'],
      0x5f: ['LD', 'A,R'],
      0x67: ['RRD', ''],
      0x6f: ['RLD', ''],
      0xa0: ['LDI', ''],
      0xa1: ['CPI', ''],
      0xa2: ['INI', ''],
      0xa3: ['OUTI', ''],
      0xa8: ['LDD', ''],
      0xa9: ['CPD', ''],
      0xaa: ['IND', ''],
      0xab: ['OUTD', ''],
      0xb0: ['LDIR', ''],
      0xb1: ['CPIR', ''],
      0xb2: ['INIR', ''],
      0xb3: ['OTIR', ''],
      0xb8: ['LDDR', ''],
      0xb9: ['CPDR', ''],
      0xba: ['INDR', ''],
      0xbb: ['OTDR', ''],
    };
    if (edMap[op2]) {
      return { size: 2, mnemonic: edMap[op2][0], operands: edMap[op2][1] };
    }
    return { size: 2, mnemonic: 'DB', operands: `0xED,0x${hex(op2)} ; unknown ED-prefixed opcode` };
  }

  if (op === 0xdd || op === 0xfd) {
    const ix = op === 0xdd ? 'IX' : 'IY';
    const op2 = rom[pc + 1];
    const disp = rom[pc + 2];
    const signed = rel8(disp);
    const mem = `(${ix}${signed < 0 ? '-' : '+'}0x${hex(Math.abs(signed))})`;

    if (op2 === 0x21) return { size: 5, mnemonic: 'LD', operands: `${ix},0x${hex(addr24(pc + 2), 6)}` };
    if (op2 === 0x22) return { size: 5, mnemonic: 'LD', operands: `(0x${hex(addr24(pc + 2), 6)}),${ix}` };
    if (op2 === 0x2a) return { size: 5, mnemonic: 'LD', operands: `${ix},(0x${hex(addr24(pc + 2), 6)})` };
    if (op2 === 0xe1) return { size: 2, mnemonic: 'POP', operands: ix };
    if (op2 === 0xe5) return { size: 2, mnemonic: 'PUSH', operands: ix };
    if (op2 === 0xe9) return { size: 2, mnemonic: 'JP', operands: `(${ix})` };
    if (op2 === 0xf9) return { size: 2, mnemonic: 'LD', operands: `SP,${ix}` };
    if (op2 === 0x36) return { size: 4, mnemonic: 'LD', operands: `${mem},0x${hex(rom[pc + 3])}` };
    if (op2 === 0x7e) return { size: 3, mnemonic: 'LD', operands: `A,${mem}` };
    if (op2 === 0x77) return { size: 3, mnemonic: 'LD', operands: `${mem},A` };
    if (op2 === 0xcb) {
      const cb = rom[pc + 3];
      const group = cb >> 6;
      const bit = (cb >> 3) & 7;
      if (group === 1) return { size: 4, mnemonic: 'BIT', operands: `${bit},${mem}` };
      if (group === 2) return { size: 4, mnemonic: 'RES', operands: `${bit},${mem}` };
      if (group === 3) return { size: 4, mnemonic: 'SET', operands: `${bit},${mem}` };
      return { size: 4, mnemonic: 'CB', operands: `${mem},0x${hex(cb)}` };
    }
    return { size: 2, mnemonic: 'DB', operands: `0x${hex(op)},0x${hex(op2)} ; unhandled ${ix} prefix` };
  }

  if ((op & 0xc0) === 0x40) {
    if (op === 0x76) return { size: 1, mnemonic: 'HALT', operands: '' };
    return { size: 1, mnemonic: 'LD', operands: `${r[(op >> 3) & 7]},${r[op & 7]}` };
  }

  if ((op & 0xc0) === 0x80) {
    const a = alu[(op >> 3) & 7];
    const operand = r[op & 7];
    return { size: 1, mnemonic: a, operands: a.endsWith(',') ? operand : operand };
  }

  if ((op & 0xc7) === 0x04) return { size: 1, mnemonic: 'INC', operands: r[(op >> 3) & 7] };
  if ((op & 0xc7) === 0x05) return { size: 1, mnemonic: 'DEC', operands: r[(op >> 3) & 7] };
  if ((op & 0xc7) === 0x06) return { size: 2, mnemonic: 'LD', operands: `${r[(op >> 3) & 7]},0x${hex(rom[pc + 1])}` };
  if ((op & 0xcf) === 0x01) return { size: 4, mnemonic: 'LD', operands: `${rp[(op >> 4) & 3]},0x${hex(addr24(pc + 1), 6)}` };
  if ((op & 0xcf) === 0x03) return { size: 1, mnemonic: 'INC', operands: rp[(op >> 4) & 3] };
  if ((op & 0xcf) === 0x09) return { size: 1, mnemonic: 'ADD', operands: `HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { size: 1, mnemonic: 'DEC', operands: rp[(op >> 4) & 3] };
  if ((op & 0xcf) === 0xc5) return { size: 1, mnemonic: 'PUSH', operands: rp2[(op >> 4) & 3] };
  if ((op & 0xcf) === 0xc1) return { size: 1, mnemonic: 'POP', operands: rp2[(op >> 4) & 3] };
  if ((op & 0xc7) === 0xc0) return { size: 1, mnemonic: 'RET', operands: cc[(op >> 3) & 7] };
  if ((op & 0xc7) === 0xc2) {
    const target = addr24(pc + 1);
    return { size: 4, mnemonic: 'JP', operands: `${cc[(op >> 3) & 7]},0x${hex(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = addr24(pc + 1);
    recordCall(target, pc);
    return { size: 4, mnemonic: 'CALL', operands: `${cc[(op >> 3) & 7]},0x${hex(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc6) {
    const a = alu[(op >> 3) & 7];
    const imm = `0x${hex(rom[pc + 1])}`;
    return { size: 2, mnemonic: a, operands: a.endsWith(',') ? imm : imm };
  }

  const oneByte = {
    0x00: ['NOP', ''],
    0x02: ['LD', '(BC),A'],
    0x07: ['RLCA', ''],
    0x08: ['EX', 'AF,AF'],
    0x0a: ['LD', 'A,(BC)'],
    0x0f: ['RRCA', ''],
    0x12: ['LD', '(DE),A'],
    0x17: ['RLA', ''],
    0x1a: ['LD', 'A,(DE)'],
    0x1f: ['RRA', ''],
    0x27: ['DAA', ''],
    0x2f: ['CPL', ''],
    0x37: ['SCF', ''],
    0x3f: ['CCF', ''],
    0xc9: ['RET', ''],
    0xd9: ['EXX', ''],
    0xe3: ['EX', '(SP),HL'],
    0xe9: ['JP', '(HL)'],
    0xeb: ['EX', 'DE,HL'],
    0xf3: ['DI', ''],
    0xf9: ['LD', 'SP,HL'],
    0xfb: ['EI', ''],
  };
  if (oneByte[op]) return { size: 1, mnemonic: oneByte[op][0], operands: oneByte[op][1] };

  if (op === 0x10) return { size: 2, mnemonic: 'DJNZ', operands: `0x${hex(pc + 2 + rel8(rom[pc + 1]), 6)}` };
  if (op === 0x18) return { size: 2, mnemonic: 'JR', operands: `0x${hex(pc + 2 + rel8(rom[pc + 1]), 6)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: 2, mnemonic: 'JR', operands: `${cc[(op >> 3) & 3]},0x${hex(pc + 2 + rel8(rom[pc + 1]), 6)}` };
  if (op === 0x22) return { size: 4, mnemonic: 'LD', operands: `(0x${hex(addr24(pc + 1), 6)}),HL` };
  if (op === 0x2a) return { size: 4, mnemonic: 'LD', operands: `HL,(0x${hex(addr24(pc + 1), 6)})` };
  if (op === 0x32) return { size: 4, mnemonic: 'LD', operands: `(0x${hex(addr24(pc + 1), 6)}),A` };
  if (op === 0x3a) return { size: 4, mnemonic: 'LD', operands: `A,(0x${hex(addr24(pc + 1), 6)})` };
  if (op === 0xc3) return { size: 4, mnemonic: 'JP', operands: `0x${hex(addr24(pc + 1), 6)}` };
  if (op === 0xcd) {
    const target = addr24(pc + 1);
    recordCall(target, pc);
    return { size: 4, mnemonic: 'CALL', operands: `0x${hex(target, 6)}` };
  }

  return { size: 1, mnemonic: 'DB', operands: `0x${hex(op)} ; unhandled opcode` };
}

console.log('=== HEX DUMP 0x03E187-0x03E24F ===');
for (let addr = START; addr < END; addr += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && addr + i < END; i++) {
    bytes.push(hex(rom[addr + i]));
  }
  console.log(`${hex(addr, 6)}: ${bytes.join(' ')}`);
}

console.log('\n=== DISASSEMBLY ===');
let pc = START;
let boundary = null;
while (pc < END) {
  const inst = disassembleOne(pc);
  const raw = bytesAt(pc, inst.size).join(' ').padEnd(14, ' ');
  const operands = inst.operands ? ` ${inst.operands}` : '';
  console.log(`${hex(pc, 6)}: ${raw} ${inst.mnemonic}${operands}`);

  if (!boundary && (inst.mnemonic === 'RET' || inst.mnemonic === 'JP')) {
    boundary = {
      address: pc,
      next: pc + inst.size,
      terminator: `${inst.mnemonic}${operands}`,
    };
  }

  pc += inst.size;
}

console.log('\n=== FUNCTION BOUNDARY CANDIDATE ===');
if (boundary) {
  console.log(`First terminator at 0x${hex(boundary.address, 6)}: ${boundary.terminator}`);
  console.log(`Candidate end: 0x${hex(boundary.next - 1, 6)} inclusive, next byte 0x${hex(boundary.next, 6)}`);
} else {
  console.log('No RET/JP terminator found in scanned range.');
}

console.log('\n=== CALL TARGETS ===');
if (callTargets.size === 0) {
  console.log('No CALL instructions found in scanned range.');
} else {
  for (const [target, refs] of callTargets) {
    console.log(`${target}: called at ${refs.map((addr) => `0x${hex(addr, 6)}`).join(', ')}`);
  }
}

console.log('\n=== PORTS ACCESSED ===');
if (ports.size === 0) {
  console.log('No OUT0/IN0 port accesses found in scanned range.');
} else {
  for (const [port, refs] of ports) {
    const rendered = refs.map((ref) => `${ref.op} at 0x${hex(ref.at, 6)}`).join(', ');
    console.log(`${port}: ${rendered}`);
  }
}

console.log('\n=== XREF SCAN for 0x03E187 ===');
let xrefs = 0;
let rawRefs = 0;
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === 0x87 && rom[i + 1] === 0xe1 && rom[i + 2] === 0x03) {
    rawRefs++;
    if (i > 0 && (rom[i - 1] === 0xcd || rom[i - 1] === 0xc3)) {
      const kind = rom[i - 1] === 0xcd ? 'CALL' : 'JP';
      console.log(`  ${kind} 0x03E187 at 0x${hex(i - 1, 6)}`);
      xrefs++;
    } else {
      console.log(`  raw 0x03E187 address bytes at 0x${hex(i, 6)} (not preceded by CALL/JP)`);
    }
  }
}
console.log(`Total CALL/JP xrefs: ${xrefs}`);
console.log(`Total raw little-endian address matches: ${rawRefs}`);
