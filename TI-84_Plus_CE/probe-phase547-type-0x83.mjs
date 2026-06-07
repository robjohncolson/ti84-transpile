import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TYPE_NAMES = new Map([
  [0x00, 'Real'],
  [0x01, 'List'],
  [0x02, 'Matrix'],
  [0x03, 'Equation'],
  [0x04, 'String'],
  [0x05, 'Program'],
  [0x06, 'Protected Program'],
  [0x07, 'Picture'],
  [0x08, 'GDB'],
  [0x0c, 'Complex'],
  [0x0d, 'Complex List'],
  [0x15, 'AppVar'],
  [0x17, 'Group'],
  [0x23, 'App'],
]);

const TYPE_STRING_TABLE = 0x03ecad;
const ERROR_CONTEXT_FORMATTER = 0x03ec8f;
const TYPE_TABLE_ENTRY_COUNT = 0x1b;
const TOKEN_DISPLAY_CHECK = 0x025758;
const NEAR_START = 0x023000;
const NEAR_END = 0x026000;

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).padStart(2, '0');
}

function bytesAt(addr, before = 4, after = 6) {
  const start = Math.max(0, addr - before);
  const end = Math.min(rom.length, addr + after);
  return [...rom.slice(start, end)].map(byteHex).join(' ');
}

function findSequence(sequence, start = 0, end = rom.length) {
  const matches = [];
  const limit = Math.min(end, rom.length) - sequence.length + 1;
  for (let i = Math.max(0, start); i < limit; i += 1) {
    let ok = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (rom[i + j] !== sequence[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      matches.push(i);
    }
  }
  return matches;
}

function findCpImmediates(start, end) {
  const matches = [];
  const limit = Math.min(end, rom.length - 1);
  for (let i = Math.max(0, start); i < limit; i += 1) {
    if (rom[i] === 0xfe) {
      matches.push({ addr: i, value: rom[i + 1] });
    }
  }
  return matches;
}

function describeType(value) {
  const unarchived = value & 0x7f;
  const baseName = TYPE_NAMES.get(unarchived) ?? 'unknown/reserved';
  const rawName = TYPE_NAMES.get(value) ?? null;
  const archived = (value & 0x80) !== 0;
  const raw = rawName ? `${rawName}` : `${baseName}${archived ? ' with bit 7 set' : ''}`;
  return `${hex(value, 2)} (${raw}; base ${hex(unarchived, 2)} = ${baseName})`;
}

function printMatches(title, matches, render) {
  console.log(`\n${title}`);
  if (matches.length === 0) {
    console.log('  none found');
    return;
  }
  for (const match of matches) {
    console.log(render(match));
  }
}

console.log('Phase 547: 0x83 type tag investigation');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);

const cp83 = findSequence([0xfe, 0x83]);
printMatches(`CP 0x83 instructions: found ${cp83.length}`, cp83, addr => {
  return `  ${hex(addr)}: ${bytesAt(addr)}  ; ${describeType(0x83)}`;
});

const nearbyCp = findCpImmediates(NEAR_START, NEAR_END);
const interestingTypes = new Set([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x0c, 0x0d, 0x15, 0x17, 0x1b, 0x23, 0x80, 0x83,
]);
const nearbyInteresting = nearbyCp.filter(match => interestingTypes.has(match.value));
printMatches(
  `Type-like CP imm8 instructions in ${hex(NEAR_START)}-${hex(NEAR_END)}: found ${nearbyInteresting.length}`,
  nearbyInteresting,
  ({ addr, value }) => `  ${hex(addr)}: CP ${hex(value, 2)}  ${bytesAt(addr)}  ; ${describeType(value)}`,
);

const nearbyAllCounts = new Map();
for (const { value } of nearbyCp) {
  nearbyAllCounts.set(value, (nearbyAllCounts.get(value) ?? 0) + 1);
}
const nearbyHistogram = [...nearbyAllCounts.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([value, count]) => `${hex(value, 2)}:${count}`)
  .join(' ');
console.log(`\nAll CP imm8 values in ${hex(NEAR_START)}-${hex(NEAR_END)} (${nearbyCp.length} total):`);
console.log(`  ${nearbyHistogram || 'none'}`);

const bit7Patterns = [
  { name: 'AND 0x7F', sequence: [0xe6, 0x7f] },
  { name: 'BIT 7,A', sequence: [0xcb, 0x7f] },
  { name: 'OR 0x80', sequence: [0xf6, 0x80] },
  { name: 'AND 0x80', sequence: [0xe6, 0x80] },
  { name: 'CP 0x80', sequence: [0xfe, 0x80] },
];

for (const pattern of bit7Patterns) {
  const global = findSequence(pattern.sequence);
  const nearby = global.filter(addr => addr >= NEAR_START && addr < NEAR_END);
  printMatches(`${pattern.name}: ${global.length} global, ${nearby.length} near type-checking window`, nearby, addr => {
    return `  ${hex(addr)}: ${bytesAt(addr)}`;
  });
}

const formatterWindowStart = Math.max(0, ERROR_CONTEXT_FORMATTER - 0x40);
const formatterWindowEnd = Math.min(rom.length, ERROR_CONTEXT_FORMATTER + 0x80);
const formatterCp1b = findSequence([0xfe, 0x1b], formatterWindowStart, formatterWindowEnd);
const tableCp1b = findSequence([0xfe, 0x1b], TYPE_STRING_TABLE - 0x80, TYPE_STRING_TABLE + 0x80);
printMatches(
  `CP 0x1B bounds checks near formatter ${hex(ERROR_CONTEXT_FORMATTER)} and table ${hex(TYPE_STRING_TABLE)}`,
  [...new Set([...formatterCp1b, ...tableCp1b])].sort((a, b) => a - b),
  addr => `  ${hex(addr)}: ${bytesAt(addr)}  ; rejects type indexes >= ${hex(TYPE_TABLE_ENTRY_COUNT, 2)}`,
);

console.log('\nType table relationship:');
console.log(`  Table starts at ${hex(TYPE_STRING_TABLE)} and has ${TYPE_TABLE_ENTRY_COUNT} entries for indexes 0x00-0x1A.`);
console.log(`  Raw 0x83 is outside that table range.`);
console.log(`  Masking bit 7 gives 0x83 & 0x7F = ${hex(0x83 & 0x7f, 2)}, which is ${TYPE_NAMES.get(0x03)}.`);
console.log(`  Therefore 0x83 is best interpreted as Equation type 0x03 with archive/status bit 7 set.`);

console.log('\nConclusion:');
if (cp83.some(addr => Math.abs(addr - TOKEN_DISPLAY_CHECK) < 0x40)) {
  console.log(`  The CP 0x83 at/near ${hex(TOKEN_DISPLAY_CHECK)} is a special-case check for archived Equation variables.`);
} else {
  console.log(`  CP 0x83 occurrences should be inspected as special-case checks for archived Equation variables.`);
}
console.log('  It is not a valid direct index into the 0x03ECAD type string table; code that formats names must mask or reject bit-7 tagged types before table lookup.');
