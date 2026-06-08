// Phase 573 findings probe: maps the token-name string-table extent in
// ROM range 0x0AB3BE-0x0AED00.
//
// Known anchors from session 572:
// - 0x0AB3BE: stats command-name table, beginning with names such as
//   "1-Var Stats" and "2-Var Stats".
// - 0x0AEC4A: stats/dialog parameter-name table, containing names such as
//   "RegEQ", "df", "Iterations", "Period", "Store EQ", "lower", and "upper".
//
// This probe does not boot the OS. It reads TI-84_Plus_CE/ROM.rom directly,
// extracts printable null-terminated ASCII strings in 0x0AB3BE-0x0AED00,
// groups nearby strings into table-like clusters, reports gaps between
// clusters, and scans the full ROM for immediate loads/references to mapped
// string addresses in 0x0AB3xx-0x0AEDxx.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const RANGE_START = 0x0ab3be;
const RANGE_END = 0x0aed00;
const REF_START = 0x0ab300;
const REF_END = 0x0aedff;
const MIN_STRING_LEN = 1;
const MAX_CLUSTER_GAP = 16;
const KNOWN_ANCHORS = [0x0ab3be, 0x0aec4a];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function readCString(rom, start, limit) {
  let end = start;
  while (end < limit && isPrintableAscii(rom[end])) end += 1;
  if (end >= limit || rom[end] !== 0x00) return null;
  const length = end - start;
  if (length < MIN_STRING_LEN) return null;
  return {
    address: start,
    end,
    next: end + 1,
    length,
    text: rom.subarray(start, end).toString('ascii'),
  };
}

function extractStrings(rom, start, endExclusive) {
  const strings = [];
  let cursor = start;

  while (cursor < endExclusive) {
    const found = readCString(rom, cursor, endExclusive);
    if (found) {
      strings.push(found);
      cursor = found.next;
      continue;
    }
    cursor += 1;
  }

  return strings;
}

function groupTables(strings) {
  if (strings.length === 0) return [];

  const tables = [];
  let current = {
    start: strings[0].address,
    end: strings[0].next,
    strings: [strings[0]],
  };

  for (const item of strings.slice(1)) {
    const gap = item.address - current.end;
    if (gap <= MAX_CLUSTER_GAP) {
      current.strings.push(item);
      current.end = item.next;
    } else {
      tables.push(current);
      current = {
        start: item.address,
        end: item.next,
        strings: [item],
      };
    }
  }

  tables.push(current);
  return tables;
}

function findTableForAddress(tables, address) {
  return tables.find((table) => address >= table.start && address < table.end);
}

function byteAt(rom, address) {
  return address >= 0 && address < rom.length ? rom[address] : null;
}

function instructionKind(rom, address) {
  const b0 = byteAt(rom, address);
  const b1 = byteAt(rom, address + 1);

  if (b0 === 0x21) return 'LD HL,imm24';
  if (b0 === 0x11) return 'LD DE,imm24';
  if (b0 === 0x01) return 'LD BC,imm24';
  if (b0 === 0x31) return 'LD SP,imm24';
  if (b0 === 0xdd && b1 === 0x21) return 'LD IX,imm24';
  if (b0 === 0xfd && b1 === 0x21) return 'LD IY,imm24';
  if (b0 === 0x3e) return 'LD A,imm8 near address literal';
  return 'imm24/reference';
}

function findReferences(rom, start, end) {
  const refs = [];

  for (let i = 0; i <= rom.length - 3; i += 1) {
    const value = rom[i] | (rom[i + 1] << 8) | (rom[i + 2] << 16);
    if (value < start || value > end) continue;

    const op1 = i - 1;
    const op2 = i - 2;
    let instructionAddress = i;
    let kind = 'imm24/reference';

    if ([0x21, 0x11, 0x01, 0x31].includes(byteAt(rom, op1))) {
      instructionAddress = op1;
      kind = instructionKind(rom, op1);
    } else if (
      (byteAt(rom, op2) === 0xdd || byteAt(rom, op2) === 0xfd) &&
      byteAt(rom, op1) === 0x21
    ) {
      instructionAddress = op2;
      kind = instructionKind(rom, op2);
    }

    refs.push({
      address: instructionAddress,
      literalAt: i,
      target: value,
      kind,
    });
  }

  return refs;
}

function printStringList(title, list) {
  console.log(`\n${title} (${list.length} strings)`);
  for (const item of list) {
    console.log(`${hex(item.address)}-${hex(item.end)} len=${item.length}: ${JSON.stringify(item.text)}`);
  }
}

const rom = fs.readFileSync(ROM_PATH);
const strings = extractStrings(rom, RANGE_START, RANGE_END);
const tables = groupTables(strings);
const refs = findReferences(rom, REF_START, REF_END);

const first = strings[0] ?? null;
const last = strings[strings.length - 1] ?? null;
const extentStart = first?.address ?? RANGE_START;
const extentEnd = last?.next ?? RANGE_START;

console.log('Phase 573 string table map');
console.log(`ROM: ${ROM_PATH}`);
console.log(`scanRange=${hex(RANGE_START)}-${hex(RANGE_END)} bytes=${RANGE_END - RANGE_START}`);
console.log(`totalStringCount=${strings.length}`);
console.log(`firstString=${first ? `${hex(first.address)} ${JSON.stringify(first.text)}` : 'none'}`);
console.log(`lastString=${last ? `${hex(last.address)} ${JSON.stringify(last.text)}` : 'none'}`);
console.log(`totalStringExtent=${hex(extentStart)}-${hex(extentEnd)} bytes=${extentEnd - extentStart}`);

console.log('\nTables / clusters');
for (let i = 0; i < tables.length; i += 1) {
  const table = tables[i];
  const anchorTags = KNOWN_ANCHORS
    .filter((anchor) => anchor >= table.start && anchor < table.end)
    .map((anchor) => hex(anchor))
    .join(', ');
  const firstText = table.strings[0]?.text ?? '';
  const lastText = table.strings[table.strings.length - 1]?.text ?? '';
  console.log(
    [
      `table[${i}]`,
      `${hex(table.start)}-${hex(table.end)}`,
      `bytes=${table.end - table.start}`,
      `strings=${table.strings.length}`,
      anchorTags ? `anchors=${anchorTags}` : null,
      `first=${JSON.stringify(firstText)}`,
      `last=${JSON.stringify(lastText)}`,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

console.log('\nGaps between clusters');
if (tables.length <= 1) {
  console.log('none');
} else {
  for (let i = 1; i < tables.length; i += 1) {
    const prev = tables[i - 1];
    const next = tables[i];
    console.log(`${hex(prev.end)}-${hex(next.start)} bytes=${next.start - prev.end}`);
  }
}

for (const anchor of KNOWN_ANCHORS) {
  const table = findTableForAddress(tables, anchor);
  const anchorStrings = table
    ? table.strings.filter((item) => item.address >= anchor)
    : strings.filter((item) => item.address >= anchor);
  const stop = table ? table.end : RANGE_END;
  printStringList(`Strings from known anchor ${hex(anchor)} to ${hex(stop)}`, anchorStrings);
}

printStringList('All strings in scan range', strings);

console.log(`\nImmediate references in ${hex(REF_START)}-${hex(REF_END)} (${refs.length} found)`);
for (const ref of refs) {
  console.log(
    `${hex(ref.address)} ${ref.kind} literal@${hex(ref.literalAt)} -> ${hex(ref.target)}`,
  );
}
