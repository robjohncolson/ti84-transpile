#!/usr/bin/env node
// Phase 25G-f: Unified decode of 228-byte scancode translation table at 0x09F79B.
// Merges phase25g-scancode-table-report.md (session 64) + phase25g-g-map.json (session 65)
// + inline dictionary. Pure Node, no CPU/probe. Reads ROM.rom directly.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');
const MAP_PATH = join(__dirname, 'phase25g-g-map.json');

const TABLE_BASE = 0x09F79B;
const PLANE_STRIDE = 57;
const PLANE_OFFSETS = [0, 57, 114, 171];
const MODIFIERS = ['NONE', '2nd', 'ALPHA', '2nd+ALPHA'];

// Inline dictionary — verbatim from task spec.
const DICT = {
  0x00: 'NONE',
  0x04: 'EQ',
  0x09: 'ENTER',
  0x0A: '[+]',
  0x0B: '[-]',
  0x0C: '[*]',
  0x0D: '[/]',
  0x0E: '[^]',
  0x0F: '[(]',
  0x10: '[)]',
  0x11: '[,]',
  0x80: 'tok:PI',
  0x81: 'tok:INV',
  0x82: 'tok:SIN',
  0x83: 'tok:COS',
  0x84: 'tok:TAN',
  0x85: 'tok:EXP',
  0x86: 'tok:LN',
  0x87: 'tok:LOG',
  0x88: 'tok:SQR',
  0x89: 'tok:NEG',
  0x8A: 'tok:STO',
  0x8B: 'tok:Ans',
  0x8C: 'tok:MATH',
  0x8D: 'tok:APPS',
  0x8E: 'tok:PRGM',
  0x8F: 'tok:VARS',
  0x90: 'tok:CLEAR',
  0x91: 'tok:X_VAR',
  0x92: 'tok:STAT',
  0x93: 'tok:ON',
};

function decodeByte(b) {
  if (Object.prototype.hasOwnProperty.call(DICT, b)) return DICT[b];
  if (b >= 0x20 && b <= 0x7E) return `'${String.fromCharCode(b)}'`;
  return `tok:0x${b.toString(16).padStart(2, '0').toUpperCase()}`;
}

function hex2(b) {
  return `0x${b.toString(16).padStart(2, '0').toUpperCase()}`;
}

// Load ROM and JSON.
const rom = readFileSync(ROM_PATH);
const mapRaw = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Build reverse index: rawScanMmioHex (lowercase) → physicalLabel.
// The JSON top-level keys ARE the rawScanMmioHex strings already.
const labelByRaw = new Map();
for (const [key, entry] of Object.entries(mapRaw)) {
  const raw = parseInt(key, 16);
  labelByRaw.set(raw, entry.physicalLabel || `key0x${raw.toString(16).padStart(2,'0').toUpperCase()}`);
}

// Rows.
const rows = [];
const outOfRange = [];

// Header "no key" row: table_idx=0x00, offset=0. Read all 4 planes at plane_base + 0.
{
  const bytes = PLANE_OFFSETS.map(po => rom[TABLE_BASE + po + 0]);
  rows.push({
    rawScan: 'N/A',
    offset: 0,
    physLabel: '(no key)',
    bytes,
  });
}

// Enumerate raw scans present in the JSON, sorted by raw value.
const rawKeys = [...labelByRaw.keys()].sort((a, b) => a - b);

for (const raw of rawKeys) {
  const offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1;
  if (offset >= PLANE_STRIDE) {
    outOfRange.push({ raw, offset, label: labelByRaw.get(raw) });
    continue;
  }
  const bytes = PLANE_OFFSETS.map(po => rom[TABLE_BASE + po + offset]);
  rows.push({
    rawScan: hex2(raw),
    offset,
    physLabel: labelByRaw.get(raw),
    bytes,
  });
}

// Emit merged markdown table.
const header = [
  'rawScan', 'offset', 'physLabel',
  'NONE hex', 'NONE dec',
  '2nd hex', '2nd dec',
  'ALPHA hex', 'ALPHA dec',
  '2ndALPHA hex', '2ndALPHA dec',
];
const align = [':---', '---:', ':---', ':---', ':---', ':---', ':---', ':---', ':---', ':---', ':---'];

process.stdout.write('| ' + header.join(' | ') + ' |\n');
process.stdout.write('|' + align.join('|') + '|\n');

for (const r of rows) {
  const cells = [
    String(r.rawScan),
    String(r.offset),
    r.physLabel,
  ];
  for (let p = 0; p < 4; p++) {
    cells.push(hex2(r.bytes[p]));
    cells.push(decodeByte(r.bytes[p]));
  }
  process.stdout.write('| ' + cells.join(' | ') + ' |\n');
}

// Log out-of-range to stderr.
process.stderr.write(`Out-of-range raw scancodes (offset >= ${PLANE_STRIDE}):\n`);
for (const oor of outOfRange) {
  process.stderr.write(`  raw=${hex2(oor.raw)} offset=${oor.offset} label=${oor.label}\n`);
}
process.stderr.write(`Total out-of-range: ${outOfRange.length}\n`);

// Summary counts to stderr.
let unknownTotal = 0;
const unknownByPlane = [0, 0, 0, 0];
for (const r of rows) {
  for (let p = 0; p < 4; p++) {
    const dec = decodeByte(r.bytes[p]);
    if (dec.startsWith('tok:0x')) {
      unknownTotal++;
      unknownByPlane[p]++;
    }
  }
}
process.stderr.write(`Undecoded (tok:0xNN) cells: total=${unknownTotal} by_plane=[NONE:${unknownByPlane[0]}, 2nd:${unknownByPlane[1]}, ALPHA:${unknownByPlane[2]}, 2ndALPHA:${unknownByPlane[3]}]\n`);
process.stderr.write(`Rows emitted: ${rows.length}\n`);
