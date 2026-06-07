import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TABLE_BASE = 0x03ECAD;
const ENTRY_COUNT = 27;
const ENTRY_SIZE = 3;
const DISASM_INSTRUCTION_COUNT = 15;

const ERROR_TYPES = [
  { code: 0x1C, name: 'OVERFLOW' },
  { code: 0x1D, name: 'SYNTAX' },
  { code: 0x1E, name: 'DOMAIN' },
  { code: 0x1F, name: 'INCREMENT' },
  { code: 0x20, name: 'BREAK' },
  { code: 0x21, name: 'NON REAL' },
  { code: 0x22, name: 'SYNTAX (dup?)' },
  { code: 0x23, name: 'DATA TYPE' },
  { code: 0x24, name: 'ARGUMENT' },
  { code: 0x25, name: 'DIM MISMATCH' },
  { code: 0x26, name: 'DIMENSION' },
  { code: 0x27, name: 'UNDEFINED' },
  { code: 0x28, name: 'MEMORY' },
  { code: 0x29, name: 'INVALID' },
  { code: 0x2A, name: '(reserved)' },
  { code: 0x2B, name: 'SINGULAR MAT' },
  { code: 0x2C, name: 'SIGN CHANGE' },
  { code: 0x2D, name: 'ITERATIONS' },
  { code: 0x2E, name: 'BAD GUESS' },
  { code: 0x2F, name: 'STAT PLOT' },
  { code: 0x30, name: 'TOL NOT MET' },
  { code: 0x31, name: 'STAT' },
  { code: 0x32, name: '(reserved)' },
  { code: 0x33, name: 'LINK ERROR' },
];

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(offset, size) {
  return [...rom.subarray(offset, offset + size)].map(byteHex).join(' ');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function errorTypeForIndex(index) {
  const entry = ERROR_TYPES[index];
  if (!entry) {
    const code = 0x1C + index;
    return { code, name: '(unknown beyond known string table)' };
  }
  return entry;
}

function operandName(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return hex(value, value <= 0xFF ? 2 : value <= 0xFFFF ? 4 : 6);
  if (typeof value === 'string') return value;
  return String(value);
}

function formatInstruction(insn) {
  const parts = [insn.tag];
  const fields = [
    'condition',
    'reg',
    'pair',
    'dest',
    'src',
    'value',
    'addr',
    'target',
    'offset',
  ];

  for (const field of fields) {
    if (Object.hasOwn(insn, field)) {
      parts.push(`${field}=${operandName(insn[field])}`);
    }
  }

  return parts.join(' ');
}

function classifyFormattingPattern(instructions) {
  const tags = instructions.map(({ insn }) => insn.tag).join(' ');
  const text = instructions.map(({ insn }) => formatInstruction(insn)).join(' | ');

  const calls = instructions
    .filter(({ insn }) => insn.target !== undefined && /call/i.test(insn.tag))
    .map(({ insn }) => hex(insn.target));
  const jumps = instructions
    .filter(({ insn }) => insn.target !== undefined && /j[pr]|djnz/i.test(insn.tag))
    .map(({ insn }) => hex(insn.target));

  const traits = [];
  if (/ix|iy/i.test(text)) traits.push('indexed context access');
  if (/ld/i.test(tags) && /call/i.test(tags)) traits.push('loads values then calls helper(s)');
  if (/ret/i.test(tags)) traits.push('returns locally');
  if (/jp|jr/i.test(tags)) traits.push('tail jump/branch present');
  if (calls.length > 0) traits.push(`calls ${[...new Set(calls)].join(', ')}`);
  if (jumps.length > 0) traits.push(`jumps ${[...new Set(jumps)].join(', ')}`);

  return traits.length > 0 ? traits.join('; ') : 'short formatter stub or decoder-specific pattern';
}

function disassembleAt(offset, count = DISASM_INSTRUCTION_COUNT) {
  const instructions = [];
  let pc = offset;

  for (let i = 0; i < count && pc >= 0 && pc < rom.length; i += 1) {
    const insn = decodeInstruction(rom, pc);
    const size = Number.isInteger(insn.size) && insn.size > 0 ? insn.size : 1;
    instructions.push({
      pc,
      bytes: rawBytes(pc, size),
      insn,
      text: formatInstruction(insn),
    });
    pc += size;

    if (/^(ret|reti|retn)$/i.test(insn.tag)) break;
  }

  return instructions;
}

const entries = [];
const grouped = new Map();

for (let index = 0; index < ENTRY_COUNT; index += 1) {
  const offset = TABLE_BASE + index * ENTRY_SIZE;
  const address = readU24LE(offset);
  const error = errorTypeForIndex(index);
  const entry = {
    index,
    offset,
    raw: rawBytes(offset, ENTRY_SIZE),
    address,
    error,
  };

  entries.push(entry);

  if (!grouped.has(address)) grouped.set(address, []);
  grouped.get(address).push(entry);
}

console.log('Phase 545: 0x03ECAD formatter jump table dump');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(
  `Table: ${hex(TABLE_BASE)}-${hex(TABLE_BASE + ENTRY_COUNT * ENTRY_SIZE - 1)} ` +
    `(${ENTRY_COUNT} entries x ${ENTRY_SIZE} bytes)`,
);
console.log('');

console.log('Entries:');
for (const entry of entries) {
  console.log(
    [
      `  idx=${hex(entry.index, 2)}`,
      `error=${hex(entry.error.code, 2)} ${entry.error.name}`,
      `table_off=${hex(entry.offset)}`,
      `raw=${entry.raw}`,
      `target=${hex(entry.address)}`,
    ].join('  '),
  );
}
console.log('');

console.log('Groups by formatter target:');
for (const [address, group] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
  const mappedErrors = group
    .map((entry) => `${hex(entry.index, 2)}=>${hex(entry.error.code, 2)} ${entry.error.name}`)
    .join(', ');
  console.log(`  ${hex(address)}: ${group.length} entr${group.length === 1 ? 'y' : 'ies'}: ${mappedErrors}`);
}
console.log('');

console.log(`Unique target disassembly (${DISASM_INSTRUCTION_COUNT} instructions max each):`);
for (const [address, group] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
  const mappedIndexes = group.map((entry) => hex(entry.index, 2)).join(', ');
  const mappedErrors = group.map((entry) => `${hex(entry.error.code, 2)} ${entry.error.name}`).join('; ');
  const instructions = disassembleAt(address);

  console.log('');
  console.log(`${hex(address)}  indexes=[${mappedIndexes}]  errors=[${mappedErrors}]`);
  console.log(`  pattern: ${classifyFormattingPattern(instructions)}`);

  for (const instruction of instructions) {
    console.log(`  ${hex(instruction.pc)}  ${instruction.bytes.padEnd(14)}  ${instruction.text}`);
  }
}

