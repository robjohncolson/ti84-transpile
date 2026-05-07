#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const ROM = fs.readFileSync(ROM_PATH);
const INC_TEXT = fs.readFileSync(INC_PATH, 'utf8');

const TABLE_03FC41_HEAD = 0x03FC41;
const TABLE_03FC41_BASE = 0x03FC42;
const TABLE_03FC41_LEN = 56;

const TABLE_09F79B_BASE = 0x09F79B;
const TABLE_09F79B_LEN = 228;
const PLANE_SIZE = 57;
const PLANE_NAMES = ['none_mod', '2nd', 'alpha', '2nd_alpha'];

const REF_PATTERN = [0x9B, 0xF7, 0x09];

const KEY_MATRIX = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', '(unused)', '(unused)', '(unused)', '(unused)'],
  ['ENTER', '+', '-', 'x', '/', '^', 'CLEAR', '(unused)'],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', '(unused)'],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  ['(empty)', 'STO->', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function asciiName(value) {
  return value >= 0x20 && value <= 0x7E ? `'${String.fromCharCode(value)}'` : null;
}

function parseEquates(prefix) {
  const map = new Map();
  const regex = new RegExp(`^\\?(${prefix}[A-Za-z0-9_]+)\\s*:=\\s*0([0-9A-Fa-f]+)h`, 'gm');
  let match = regex.exec(INC_TEXT);
  while (match) {
    const name = match[1];
    const value = parseInt(match[2], 16);
    const names = map.get(value) ?? [];
    if (!names.includes(name)) {
      names.push(name);
    }
    map.set(value, names);
    match = regex.exec(INC_TEXT);
  }
  return map;
}

const K_NAMES = parseEquates('k');
const SK_NAMES = parseEquates('sk');

function byteNames(value) {
  const names = [];
  const k = K_NAMES.get(value) ?? [];
  const sk = SK_NAMES.get(value) ?? [];
  names.push(...k);
  if (names.length === 0) {
    names.push(...sk);
  } else if (sk.length > 0 && !names.includes(sk[0])) {
    names.push(sk[0]);
  }
  const ascii = asciiName(value);
  if (ascii && !names.includes(ascii)) {
    names.push(ascii);
  }
  return names;
}

function formatByte(value, options = {}) {
  if (value === null || value === undefined) {
    return '--';
  }
  if (options.slot0) {
    return hexByte(value);
  }
  const names = byteNames(value);
  return names.length > 0 ? `${hexByte(value)} [${names.join(' / ')}]` : hexByte(value);
}

function rowInfo(index) {
  if (index === 0) {
    return {
      index,
      rawScan: null,
      group: null,
      bit: null,
      key: '(no key slot)',
    };
  }
  const flat = index - 1;
  const group = flat >> 3;
  const bit = flat & 0x07;
  return {
    index,
    rawScan: (group << 4) | bit,
    group,
    bit,
    key: KEY_MATRIX[group][bit],
  };
}

function isUnusedKey(key) {
  return key.startsWith('(unused)') || key.startsWith('(empty)');
}

function planeValue(planeIndex, index) {
  return ROM[TABLE_09F79B_BASE + (planeIndex * PLANE_SIZE) + index] & 0xFF;
}

function printTable(headers, rows) {
  const widths = headers.map((header, index) => {
    let width = String(header).length;
    for (const row of rows) {
      width = Math.max(width, String(row[index]).length);
    }
    return width;
  });

  console.log(headers.map((header, index) => String(header).padEnd(widths[index])).join(' | '));
  console.log(widths.map((width) => '-'.repeat(width)).join('-|-'));
  for (const row of rows) {
    console.log(row.map((cell, index) => String(cell).padEnd(widths[index])).join(' | '));
  }
}

function printHexDump(start, length, planeMarkers = []) {
  const markers = new Map(planeMarkers.map((marker) => [marker.offset, marker.label]));
  for (let offset = 0; offset < length; offset += 16) {
    if (markers.has(offset)) {
      console.log(`  [${markers.get(offset)} starts at ${hex(start + offset)}]`);
    }
    const rowStart = start + offset;
    const rowEnd = Math.min(rowStart + 16, start + length);
    const bytes = bytesToHex(ROM.subarray(rowStart, rowEnd));
    console.log(`  ${hex(rowStart)}: ${bytes}`);
  }
}

function searchPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= ROM.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (ROM[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      hits.push(i);
    }
  }
  return hits;
}

function referenceDescription(hit) {
  if (
    ROM[hit - 7] === 0xD5 &&
    ROM[hit - 6] === 0x21 &&
    ROM[hit - 2] === 0x6F &&
    ROM[hit - 1] === 0x11 &&
    ROM[hit + 3] === 0x19
  ) {
    return {
      instructionPc: hit - 1,
      lines: [
        [hex(hit - 7), 'D5', 'PUSH DE'],
        [hex(hit - 6), '21 00 00 00', 'LD HL,0x000000'],
        [hex(hit - 2), '6F', 'LD L,A'],
        [hex(hit - 1), '11 9B F7 09', 'LD DE,0x09F79B'],
        [hex(hit + 3), '19', 'ADD HL,DE'],
        [hex(hit + 4), 'CD 46 23 02', 'CALL 0x022346'],
        [hex(hit + 8), 'D1', 'POP DE'],
        [hex(hit + 9), 'CD EB 02 03', 'CALL 0x0302EB'],
      ],
      pattern:
        'Pointer-build helper: A becomes the compact index in L, DE loads 0x09F79B, HL += DE, then the entry pointer is passed to helper 0x022346.',
    };
  }

  if (
    ROM[hit - 4] === 0x6F &&
    ROM[hit - 3] === 0x26 &&
    ROM[hit - 1] === 0x11 &&
    ROM[hit + 3] === 0x19 &&
    ROM[hit + 4] === 0x7E
  ) {
    return {
      instructionPc: hit - 1,
      lines: [
        [hex(hit - 22), 'CC F6 01 03', 'CALL Z,0x0301F6'],
        [hex(hit - 18), '16 01', 'LD D,0x01'],
        [hex(hit - 16), 'C6 70', 'ADD A,0x70'],
        [hex(hit - 14), 'FD CB 12 6E', 'BIT 5,(IY+0x12)'],
        [hex(hit - 10), 'CA 74 00 03', 'JP Z,0x030074'],
        [hex(hit - 6), 'C6 38', 'ADD A,0x38'],
        [hex(hit - 4), '6F', 'LD L,A'],
        [hex(hit - 3), '26 00', 'LD H,0x00'],
        [hex(hit - 1), '11 9B F7 09', 'LD DE,0x09F79B'],
        [hex(hit + 3), '19', 'ADD HL,DE'],
        [hex(hit + 4), '7E', 'LD A,(HL)'],
      ],
      pattern:
        'Direct indexed load: modifier math adjusts A first, then HL is formed as 0x09F79B + adjusted_index and the byte is read with LD A,(HL).',
    };
  }

  return {
    instructionPc: hit - 1,
    lines: [[hex(hit - 1), '11 9B F7 09', 'LD DE,0x09F79B']],
    pattern: 'Immediate load of 0x09F79B present; surrounding instruction pattern did not match the two known lookup shapes.',
  };
}

console.log('Phase 228: 09F79B none-mod scan table probe');
console.log('='.repeat(78));
console.log(`ROM bytes loaded: ${ROM.length}`);
console.log('');
console.log('Part 1: Raw dump of 0x09F79B');
console.log('-'.repeat(78));
printHexDump(TABLE_09F79B_BASE, TABLE_09F79B_LEN, [
  { offset: 0x00, label: 'none_mod plane' },
  { offset: 0x39, label: '2nd plane' },
  { offset: 0x72, label: 'alpha plane' },
  { offset: 0xAB, label: '2nd_alpha plane' },
]);

console.log('');
console.log('Part 1a: Layout summary');
console.log('-'.repeat(78));
console.log(`Entry size: 1 byte`);
console.log(`Total bytes: ${TABLE_09F79B_LEN} = 4 planes x ${PLANE_SIZE} entries`);
console.log(`Plane starts: ${PLANE_NAMES.map((name, index) => `${name}@${hex(TABLE_09F79B_BASE + (index * PLANE_SIZE))}`).join(', ')}`);
console.log(`Logical index 0 is a no-key slot; logical indices 1..56 map to compact key slots.`);
console.log(`Compact slot formula: raw_scan = ((index - 1) >> 3 << 4) | ((index - 1) & 0x07)`);
console.log(`Spot checks from session 227: idx 10 -> ${hexByte(planeValue(0, 10))}, idx 33 -> ${hexByte(planeValue(0, 33))}, idx 34 -> ${hexByte(planeValue(0, 34))}`);
console.log(`Observed zero bytes are data values for unused cells, not row separators. The table is fully contiguous.`);
console.log('');
console.log('Part 1b: Full 0x09F79B mapping (all four planes)');
console.log('-'.repeat(78));

const fullRows = [];
for (let index = 0; index < PLANE_SIZE; index += 1) {
  const info = rowInfo(index);
  fullRows.push([
    hexByte(index),
    info.rawScan === null ? '--' : hexByte(info.rawScan),
    info.key,
    formatByte(planeValue(0, index), { slot0: index === 0 }),
    formatByte(planeValue(1, index), { slot0: index === 0 }),
    formatByte(planeValue(2, index), { slot0: index === 0 }),
    formatByte(planeValue(3, index), { slot0: index === 0 }),
  ]);
}
printTable(['idx', 'raw', 'physical key', 'none_mod', '2nd', 'alpha', '2nd_alpha'], fullRows);

console.log('');
console.log('Part 2: 0x03FC41 comparison');
console.log('-'.repeat(78));

const headByte03FC41 = ROM[TABLE_03FC41_HEAD] & 0xFF;
const comparisonRows = [];
const sameIndices = [];
let sameCount = 0;
let activeSameCount = 0;
let activeCount = 0;

for (let index = 1; index <= TABLE_03FC41_LEN; index += 1) {
  const info = rowInfo(index);
  const oldByte = ROM[TABLE_03FC41_BASE + index - 1] & 0xFF;
  const noneModByte = planeValue(0, index);
  const match = oldByte === noneModByte;
  const active = !isUnusedKey(info.key);

  if (active) {
    activeCount += 1;
  }
  if (match) {
    sameCount += 1;
    sameIndices.push(index);
    if (active) {
      activeSameCount += 1;
    }
  }

  comparisonRows.push([
    index,
    hexByte(info.rawScan),
    info.key,
    formatByte(oldByte),
    formatByte(noneModByte),
    match ? 'yes' : 'no',
  ]);
}

console.log(`0x03FC41 itself is ${hexByte(headByte03FC41)}; phase 227 already established this is a RET byte before the real table.`);
console.log(`Actual compact table bytes are ${hex(TABLE_03FC41_BASE)}..${hex(TABLE_03FC41_BASE + TABLE_03FC41_LEN - 1)} (${TABLE_03FC41_LEN} entries).`);
console.log(`0x09F79B none_mod bytes are ${hex(TABLE_09F79B_BASE)}..${hex(TABLE_09F79B_BASE + PLANE_SIZE - 1)} (${PLANE_SIZE} entries).`);
console.log(`Alignment rule: 0x03FC42 index n <-> 0x09F79B none_mod slot n, for n=1..56.`);
console.log(`Matching bytes on aligned indices: ${sameCount}/56.`);
console.log(`Matching bytes on active keys only: ${activeSameCount}/${activeCount}.`);
console.log(`Identical indices: ${sameIndices.join(', ') || '(none)'}.`);
console.log('');
printTable(['idx', 'raw', 'physical key', '0x03FC41 table byte', '0x09F79B none_mod byte', 'match'], comparisonRows);

console.log('');
console.log('Part 3: ROM references to 0x09F79B');
console.log('-'.repeat(78));

const hits = searchPattern(REF_PATTERN);
console.log(`Found ${hits.length} immediate hits for 9B F7 09: ${hits.map((hit) => hex(hit)).join(', ')}`);

for (const hit of hits) {
  const start = Math.max(0, hit - 8);
  const end = Math.min(ROM.length, hit + 12);
  const description = referenceDescription(hit);

  console.log('');
  console.log(`Hit at ${hex(hit)} (instruction starts at ${hex(description.instructionPc)}):`);
  console.log(`  Raw window ${hex(start)}..${hex(end - 1)}: ${bytesToHex(ROM.subarray(start, end))}`);
  for (const [pc, bytes, asm] of description.lines) {
    console.log(`  ${pc}: ${bytes.padEnd(12)} ${asm}`);
  }
  console.log(`  Access pattern: ${description.pattern}`);
}

console.log('');
console.log('Bottom line');
console.log('-'.repeat(78));
console.log(`- 0x09F79B is a contiguous 228-byte table: 4 modifier planes x 57 one-byte entries.`);
console.log(`- The none_mod plane aligns structurally with the 56 compact slots used by 0x03FC1C, but the byte values are almost entirely different.`);
console.log(`- Only ${sameCount} aligned bytes match at all, and ${activeSameCount} of those matches are active keys.`);
console.log(`- The only ROM references to 0x09F79B are a pointer-build helper near 0x02FF0B and a direct indexed load near 0x03010D.`);
