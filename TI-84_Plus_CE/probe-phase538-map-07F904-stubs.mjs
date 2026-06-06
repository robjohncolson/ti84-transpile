import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x07f904;
const END = 0x07f91f;
const COPY12 = 0x07f974;
const COPY7 = 0x07f97a;

const opByAddress = new Map([
  [0xd005f8, 'OP1'],
  [0xd00603, 'OP2'],
  [0xd0060e, 'OP3'],
  [0xd00619, 'OP4'],
  [0xd00624, 'OP5'],
  [0xd0062f, 'OP6'],
  [0xd0063a, 'OP7'],
]);

const knownStubs = [
  // Session 537: 0x07F8B6-0x07F903
  { address: 0x07f8b6, source: 'OP2', dest: 'OP1', target: COPY12 },
  { address: 0x07f8c4, source: 'OP1', dest: 'OP3', target: COPY12 },
  { address: 0x07f8d2, source: 'OP3', dest: 'OP1', target: COPY12 },
  { address: 0x07f8e0, source: 'OP1', dest: 'OP4', target: COPY12 },
  { address: 0x07f8ee, source: 'OP4', dest: 'OP1', target: COPY12 },
  { address: 0x07f8fc, source: 'OP1', dest: 'OP5', target: COPY12 },

  // Session 536: 0x07F920-0x07F98A
  { address: 0x07f920, source: 'OP5', dest: 'OP1', target: COPY12 },
  { address: 0x07f92e, source: 'OP1', dest: 'OP6', target: COPY12 },
  { address: 0x07f93c, source: 'OP6', dest: 'OP1', target: COPY12 },
  { address: 0x07f94a, source: 'OP2', dest: 'OP3', target: COPY12 },
  { address: 0x07f958, source: 'OP3', dest: 'OP2', target: COPY12 },
  { address: 0x07f966, source: 'OP1', dest: 'OP7', target: COPY12 },
];

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function targetLabel(target) {
  if (target === COPY12) return '0x07F974 (12-byte copy)';
  if (target === COPY7) return '0x07F97A (7-byte copy)';
  return `${hex(target, 6)} (other)`;
}

function copyBytes(target) {
  if (target === COPY12) return 12;
  if (target === COPY7) return 7;
  return '?';
}

function opName(address) {
  return opByAddress.get(address) ?? hex(address, 6);
}

function dumpBytes(start, end) {
  for (let base = start; base <= end; base += 16) {
    const bytes = [];
    for (let address = base; address <= Math.min(base + 15, end); address++) {
      bytes.push(rom[address].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`${hex(base, 6)}: ${bytes.join(' ')}`);
  }
}

function decodeRange(start, end) {
  const decoded = [];
  let pc = start;

  while (pc <= end) {
    const opcode = rom[pc];
    const address = pc;

    if (opcode === 0x21 && pc + 3 <= end) {
      const value = read24(pc + 1);
      decoded.push({ address, length: 4, mnemonic: `LD HL,${hex(value, 6)}`, register: 'HL', value });
      pc += 4;
    } else if (opcode === 0x11 && pc + 3 <= end) {
      const value = read24(pc + 1);
      decoded.push({ address, length: 4, mnemonic: `LD DE,${hex(value, 6)}`, register: 'DE', value });
      pc += 4;
    } else if (opcode === 0xc3 && pc + 3 <= end) {
      const value = read24(pc + 1);
      decoded.push({ address, length: 4, mnemonic: `JP ${hex(value, 6)}`, jumpTarget: value });
      pc += 4;
    } else if (opcode === 0x18 && pc + 1 <= end) {
      const offset = signed8(rom[pc + 1]);
      const value = pc + 2 + offset;
      decoded.push({ address, length: 2, mnemonic: `JR ${offset >= 0 ? '+' : ''}${offset} ; ${hex(value, 6)}`, jumpTarget: value });
      pc += 2;
    } else if ([0x38, 0x30, 0x28, 0x20].includes(opcode) && pc + 1 <= end) {
      const cc = new Map([[0x38, 'C'], [0x30, 'NC'], [0x28, 'Z'], [0x20, 'NZ']]).get(opcode);
      const offset = signed8(rom[pc + 1]);
      const value = pc + 2 + offset;
      decoded.push({ address, length: 2, mnemonic: `JR ${cc},${offset >= 0 ? '+' : ''}${offset} ; ${hex(value, 6)}`, jumpTarget: value });
      pc += 2;
    } else if (opcode === 0xc9) {
      decoded.push({ address, length: 1, mnemonic: 'RET' });
      pc += 1;
    } else if (opcode === 0x00) {
      decoded.push({ address, length: 1, mnemonic: 'NOP' });
      pc += 1;
    } else {
      decoded.push({ address, length: 1, mnemonic: `DB ${rom[pc].toString(16).toUpperCase().padStart(2, '0')}` });
      pc += 1;
    }
  }

  return decoded;
}

function findStubs(decoded) {
  const stubs = [];

  for (let i = 0; i < decoded.length; i++) {
    const hl = decoded[i];
    const de = decoded[i + 1];
    const jump = decoded[i + 2];

    if (hl?.register === 'HL' && de?.register === 'DE' && jump?.jumpTarget !== undefined) {
      stubs.push({
        address: hl.address,
        source: opName(hl.value),
        dest: opName(de.value),
        target: jump.jumpTarget,
      });
      i += 2;
    }
  }

  return stubs;
}

console.log('Phase 538 OP copy stub map: 0x07F904-0x07F91F');
console.log('');

console.log('Surrounding context before gap: 0x07F900-0x07F903');
dumpBytes(0x07f900, 0x07f903);
console.log('');

console.log('Gap raw bytes: 0x07F904-0x07F91F');
dumpBytes(START, END);
console.log('');

console.log('Surrounding context after gap: 0x07F920-0x07F925');
dumpBytes(0x07f920, 0x07f925);
console.log('');

const decoded = decodeRange(START, END);
const stubs = findStubs(decoded);

console.log('Decoded instructions:');
for (const instruction of decoded) {
  console.log(`${hex(instruction.address, 6)}: ${instruction.mnemonic}`);
}
console.log('');

console.log('Phase 538 summary:');
if (stubs.length === 0) {
  console.log('(no complete OP copy stubs found in gap)');
} else {
  for (const stub of stubs) {
    console.log(`${hex(stub.address, 6)}: ${stub.source} -> ${stub.dest} (${copyBytes(stub.target)} bytes) via ${targetLabel(stub.target)}`);
  }
}
console.log('');

console.log('Complete combined OP copy stub table:');
for (const stub of [...knownStubs, ...stubs].sort((a, b) => a.address - b.address)) {
  console.log(`${hex(stub.address, 6)}: ${stub.source} -> ${stub.dest} (${copyBytes(stub.target)} bytes) via ${targetLabel(stub.target)}`);
}
