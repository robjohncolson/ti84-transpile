import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x061cfa;
const END = 0x061db1;
const COMMON_HANDLER = 0x061db2;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(address, length) {
  return Array.from(rom.subarray(address, address + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function signed8(byte) {
  return byte & 0x80 ? byte - 0x100 : byte;
}

function tokenMeaning(token) {
  const known = new Map([
    [0x0a, 'newline / ENTER-like token'],
    [0x20, 'space'],
    [0x2b, '+'],
    [0x2d, '-'],
    [0x2e, '.'],
    [0x2f, '/'],
    [0x3a, ':'],
    [0x3d, '='],
    [0x81, 'likely control token 0x81'],
    [0x82, 'likely control token 0x82'],
    [0x83, 'likely control token 0x83'],
    [0x84, 'likely control token 0x84'],
    [0x85, 'likely control token 0x85'],
    [0x86, 'likely control token 0x86'],
    [0x87, 'likely control token 0x87'],
    [0x88, 'CLEAR token'],
    [0x89, 'likely control token 0x89'],
  ]);

  if (known.has(token)) return known.get(token);
  if (token >= 0x30 && token <= 0x39) return `digit '${String.fromCharCode(token)}'`;
  if (token >= 0x41 && token <= 0x5a) return `alpha '${String.fromCharCode(token)}'`;
  if (token >= 0x61 && token <= 0x7a) return `lowercase alpha '${String.fromCharCode(token)}'`;
  if (token >= 0x80 && token <= 0x8f) return 'likely TI-OS control/editor token';
  if (token >= 0x20 && token <= 0x7e) return `ASCII '${String.fromCharCode(token)}'`;
  return 'unknown token';
}

function jrTarget(address, offsetByte) {
  return address + 4 + signed8(offsetByte);
}

function classifyInstruction(address) {
  const op = rom[address];
  const op1 = rom[address + 1];
  const op2 = rom[address + 2];
  const op3 = rom[address + 3];

  if (op === 0x3e && op2 === 0x18) {
    const target = jrTarget(address, op3);
    return {
      address,
      length: 4,
      kind: 'LD A,imm8; JR rel8',
      token: op1,
      target,
      bytes: bytesAt(address, 4),
      meaning: tokenMeaning(op1),
    };
  }

  if (op === 0xc3) {
    const target = op1 | (op2 << 8) | (op3 << 16);
    return {
      address,
      length: 4,
      kind: 'JP imm24',
      target,
      bytes: bytesAt(address, 4),
      meaning: 'absolute jump entry',
    };
  }

  if (op === 0x18) {
    return {
      address,
      length: 2,
      kind: 'JR rel8',
      target: address + 2 + signed8(op1),
      bytes: bytesAt(address, 2),
      meaning: 'relative jump',
    };
  }

  return {
    address,
    length: 1,
    kind: `other opcode ${hex(op)}`,
    bytes: bytesAt(address, 1),
    meaning: 'not an LD A,imm8; JR rel8 table entry',
  };
}

const dispatchTargets = [
  0x099f49,
  0x099f68,
  0x09af17,
  0x09b65c,
  0x099ef7,
  0x09aea6,
  0x099a7e,
  0x09af3c,
  0x099a7a,
  0x09aebc,
];

const entries = [];
const otherPatterns = [];

for (let address = START; address <= END;) {
  const decoded = classifyInstruction(address);
  const inRange = address + decoded.length - 1 <= END;

  if (!inRange) {
    otherPatterns.push({
      address,
      length: END - address + 1,
      kind: 'trailing partial instruction',
      bytes: bytesAt(address, END - address + 1),
      meaning: 'region ends before a complete decoded entry',
    });
    break;
  }

  if (decoded.kind === 'LD A,imm8; JR rel8') {
    entries.push(decoded);
  } else {
    otherPatterns.push(decoded);
  }

  address += decoded.length;
}

console.log('Phase 517: key-to-token table probe');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Region: ${hex(START, 6)}-${hex(END, 6)} (${END - START + 1} bytes)`);
console.log(`Common handler expected at ${hex(COMMON_HANDLER, 6)}`);
console.log('');

console.log('Address  | Token | Hex         | JR target  | Likely meaning');
console.log('---------|-------|-------------|------------|----------------');
for (const entry of entries) {
  const targetNote = Math.abs(entry.target - COMMON_HANDLER) <= 4
    ? hex(entry.target, 6)
    : `${hex(entry.target, 6)} *`;
  console.log(
    `${hex(entry.address, 6)} | ${hex(entry.token)}  | ${entry.bytes.padEnd(11)} | ${targetNote.padEnd(10)} | ${entry.meaning}`,
  );
}

console.log('');
console.log(`LD A,imm8; JR rel8 entries found: ${entries.length}`);
console.log(`Entries targeting ${hex(COMMON_HANDLER, 6)} or nearby (+/-4): ${
  entries.filter((entry) => Math.abs(entry.target - COMMON_HANDLER) <= 4).length
}`);

if (otherPatterns.length > 0) {
  console.log('');
  console.log('Other instruction patterns in region');
  console.log('Address  | Len | Hex         | Kind / note');
  console.log('---------|-----|-------------|------------');
  for (const item of otherPatterns) {
    const target = item.target === undefined ? '' : ` -> ${hex(item.target, 6)}`;
    console.log(
      `${hex(item.address, 6)} | ${String(item.length).padStart(3)} | ${item.bytes.padEnd(11)} | ${item.kind}${target}; ${item.meaning}`,
    );
  }
}

console.log('');
console.log('Session 514 event-loop dispatch targets to check manually for JP/CALL into this table:');
for (const target of dispatchTargets) {
  console.log(`- ${hex(target, 6)}`);
}
console.log('');
console.log('Note: this ROM-read-only probe does not disassemble the dispatch handlers; it lists the known handler addresses for cross-reference.');
