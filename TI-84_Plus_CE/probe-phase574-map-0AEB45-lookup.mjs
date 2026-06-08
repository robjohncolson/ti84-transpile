import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');

const TABLE_0AEB45_START = 0x0aeb45;
const TABLE_0AEB45_END = 0x0aecfc;
const FIRST_TABLE_START = 0x0ab3be;

const rom = fs.readFileSync(romPath);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value === undefined ? '--' : value.toString(16).toUpperCase().padStart(2, '0');
}

function read24LE(offset) {
  if (offset < 0 || offset + 2 >= rom.length) {
    return null;
  }

  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function instructionAtImmediate(offset) {
  const opcodeOffset = offset - 1;
  const opcode = opcodeOffset >= 0 ? rom[opcodeOffset] : undefined;

  switch (opcode) {
    case 0x21:
      return { type: 'LD HL,nn', opcodeOffset, opcode };
    case 0x11:
      return { type: 'LD DE,nn', opcodeOffset, opcode };
    case 0x01:
      return { type: 'LD BC,nn', opcodeOffset, opcode };
    case 0xcd:
      return { type: 'CALL nn', opcodeOffset, opcode };
    case 0xc3:
      return { type: 'JP nn', opcodeOffset, opcode };
    default:
      break;
  }

  const opcodeTwoBackOffset = offset - 2;
  const opcodeTwoBack = opcodeTwoBackOffset >= 0 ? rom[opcodeTwoBackOffset] : undefined;
  if (opcodeTwoBack === 0x3e) {
    return {
      type: 'LD A,n near reference',
      opcodeOffset: opcodeTwoBackOffset,
      opcode: opcodeTwoBack,
      note: '0x3E appears two bytes before the 24-bit sequence',
    };
  }

  return {
    type: 'unknown/embedded data',
    opcodeOffset,
    opcode,
  };
}

function contextBytes(offset, before = 8, after = 8) {
  const start = Math.max(0, offset - before);
  const end = Math.min(rom.length, offset + 3 + after);
  const bytes = [];

  for (let i = start; i < end; i += 1) {
    const markerStart = i === offset ? '[' : '';
    const markerEnd = i === offset + 2 ? ']' : '';
    bytes.push(`${markerStart}${byteHex(rom[i])}${markerEnd}`);
  }

  return bytes.join(' ');
}

function findExact24(address) {
  const b0 = address & 0xff;
  const b1 = (address >> 8) & 0xff;
  const b2 = (address >> 16) & 0xff;
  const hits = [];

  for (let offset = 0; offset <= rom.length - 3; offset += 1) {
    if (rom[offset] === b0 && rom[offset + 1] === b1 && rom[offset + 2] === b2) {
      hits.push(makeHit(offset, address));
    }
  }

  return hits;
}

function findRange24(startAddress, endAddress) {
  const grouped = new Map();

  for (let offset = 0; offset <= rom.length - 3; offset += 1) {
    if (rom[offset + 2] !== 0x0a) {
      continue;
    }

    const middle = rom[offset + 1];
    if (middle !== 0xeb && middle !== 0xec) {
      continue;
    }

    const address = read24LE(offset);
    if (address < startAddress || address > endAddress) {
      continue;
    }

    if (!grouped.has(address)) {
      grouped.set(address, []);
    }
    grouped.get(address).push(makeHit(offset, address));
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([address, hits]) => ({ address, hits }));
}

function makeHit(offset, address) {
  const instruction = instructionAtImmediate(offset);

  return {
    offset,
    address,
    instruction,
    context: contextBytes(offset),
  };
}

function printHit(hit) {
  const opcodeText = hit.instruction.opcode === undefined
    ? 'opcode --'
    : `opcode ${hex(hit.instruction.opcode, 2)} @ ${hex(hit.instruction.opcodeOffset)}`;
  const note = hit.instruction.note ? ` (${hit.instruction.note})` : '';

  console.log(`  ROM ${hex(hit.offset)} -> ${hex(hit.address)} | ${hit.instruction.type} | ${opcodeText}${note}`);
  console.log(`    ${hit.context}`);
}

function printExactSection(title, hits) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));

  if (hits.length === 0) {
    console.log('  No references found.');
    return;
  }

  for (const hit of hits) {
    printHit(hit);
  }
}

function printRangeSection(title, groups) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));

  if (groups.length === 0) {
    console.log('  No intra-table references found.');
    return;
  }

  for (const group of groups) {
    console.log(`\n  ${hex(group.address)} (${group.hits.length} reference${group.hits.length === 1 ? '' : 's'})`);
    for (const hit of group.hits) {
      printHit(hit);
    }
  }
}

console.log('Phase 574: ROM references to stats/parameter string tables');
console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${rom.length.toLocaleString()} bytes`);
console.log(`Primary table: ${hex(TABLE_0AEB45_START)}-${hex(TABLE_0AEB45_END)}`);
console.log(`First table base: ${hex(FIRST_TABLE_START)}`);

const directPrimaryHits = findExact24(TABLE_0AEB45_START);
const intraPrimaryGroups = findRange24(TABLE_0AEB45_START, TABLE_0AEB45_END);
const firstTableHits = findExact24(FIRST_TABLE_START);

printExactSection(
  `(a) Direct primary table base references: ${hex(TABLE_0AEB45_START)} bytes 45 EB 0A`,
  directPrimaryHits,
);
printRangeSection(
  `(b) Intra-primary-table references: ${hex(TABLE_0AEB45_START)}-${hex(TABLE_0AEB45_END)}`,
  intraPrimaryGroups,
);
printExactSection(
  `(c) First string table references: ${hex(FIRST_TABLE_START)} bytes BE B3 0A`,
  firstTableHits,
);

console.log('\nSummary');
console.log('=======');
console.log(`Direct ${hex(TABLE_0AEB45_START)} hits: ${directPrimaryHits.length}`);
console.log(`Distinct intra-table addresses referenced: ${intraPrimaryGroups.length}`);
console.log(`Total intra-table hits: ${intraPrimaryGroups.reduce((sum, group) => sum + group.hits.length, 0)}`);
console.log(`First table ${hex(FIRST_TABLE_START)} hits: ${firstTableHits.length}`);
