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

// Phase 25G-h: authoritative k* keypress equates from ti84pceg.inc.
// Table emits _GetKey codes (written to kbdKey), NOT sk* scancode codes.
// Source: https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc
// Supersedes session-67 DICT labels 0x00-0x93 (which were guesses that did not match any authoritative table).
const DICT = {
  0x00: 'NONE',
  // Low range (0x01-0x1F): editing / linking / cursor emits.
  0x01: 'tok:kRight',
  0x02: 'tok:kLeft',
  0x03: 'tok:kUp',
  0x04: 'tok:kDown',
  0x05: 'tok:kEnter',
  0x06: 'tok:kAlphaEnter',
  0x07: 'tok:kAlphaUp',
  0x08: 'tok:kAlphaDown',
  0x09: 'tok:kClear',
  0x0A: 'tok:kDel',
  0x0B: 'tok:kIns',
  0x0C: 'tok:kRecall',
  0x0D: 'tok:kLastEnt',
  0x0E: 'tok:kBOL',
  0x0F: 'tok:kEOL',
  0x10: 'tok:kSelAll',
  0x11: 'tok:kUnselAll',
  0x12: 'tok:kLtoTI82',
  0x13: 'tok:kBackup',
  // High range (0x80-0x8D): home-screen operator/bracket/store emits.
  0x80: 'tok:kAdd',
  0x81: 'tok:kSub',
  0x82: 'tok:kMul',
  0x83: 'tok:kDiv',
  0x84: 'tok:kExpon',
  0x85: 'tok:kLParen',
  0x86: 'tok:kRParen',
  0x87: 'tok:kLBrack',
  0x88: 'tok:kRBrack',
  0x89: 'tok:kShade',
  0x8A: 'tok:kStore',
  0x8B: 'tok:kComma',
  0x8C: 'tok:kChs',
  0x8D: 'tok:kDecPnt',
  // 0x8E-0x97: undefined gap in k* namespace — fall through to hex.
  // 0x98-0xFB: ALPHA / 2nd+ALPHA plane emissions.
  0x98: 'tok:kEE',
  0x99: 'tok:kSpace',
  0x9A: 'tok:kCapA',
  0x9B: 'tok:kCapB',
  0x9C: 'tok:kCapC',
  0x9D: 'tok:kCapD',
  0x9E: 'tok:kCapE',
  0x9F: 'tok:kCapF',
  0xA0: 'tok:kCapG',
  0xA1: 'tok:kCapH',
  0xA2: 'tok:kCapI',
  0xA3: 'tok:kCapJ',
  0xA4: 'tok:kCapK',
  0xA5: 'tok:kCapL',
  0xA6: 'tok:kCapM',
  0xA7: 'tok:kCapN',
  0xA8: 'tok:kCapO',
  0xA9: 'tok:kCapP',
  0xAA: 'tok:kCapQ',
  0xAB: 'tok:kCapR',
  0xAC: 'tok:kCapS',
  0xAD: 'tok:kCapT',
  0xAE: 'tok:kCapU',
  0xAF: 'tok:kCapV',
  0xB0: 'tok:kCapW',
  0xB1: 'tok:kCapX',
  0xB2: 'tok:kCapY',
  0xB3: 'tok:kCapZ',
  0xB4: 'tok:kVarx',
  0xB5: 'tok:kPi',
  0xB6: 'tok:kInv',
  0xB7: 'tok:kSin',
  0xB8: 'tok:kASin',
  0xB9: 'tok:kCos',
  0xBA: 'tok:kACos',
  0xBB: 'tok:kTan',
  0xBC: 'tok:kATan',
  0xBD: 'tok:kSquare',
  0xBE: 'tok:kSqrt',
  0xBF: 'tok:kLn',
  0xC0: 'tok:kExp',
  0xC1: 'tok:kLog',
  0xC2: 'tok:kALog',
  0xC5: 'tok:kAns',
  0xC6: 'tok:kColon',
  0xC9: 'tok:kRoot',
  0xCA: 'tok:kQuest',
  0xCB: 'tok:kQuote',
  0xCC: 'tok:kTheta',
  0xE2: 'tok:kOutput',
  0xE3: 'tok:kGetKey',
  0xE4: 'tok:kClrHome',
  0xE5: 'tok:kPrtScr',
  0xE6: 'tok:kSinH',
  0xE7: 'tok:kCosH',
  0xE8: 'tok:kTanH',
  0xE9: 'tok:kASinH',
  0xEA: 'tok:kACosH',
  0xEB: 'tok:kATanH',
  0xEC: 'tok:kLBrace',
  0xED: 'tok:kRBrace',
  0xEE: 'tok:kI',
  0xEF: 'tok:kCONSTeA',
  0xF0: 'tok:kPlot3',
  0xF1: 'tok:kFMin',
  0xF2: 'tok:kFMax',
  0xF3: 'tok:kL1A',
  0xF4: 'tok:kL2A',
  0xF5: 'tok:kL3A',
  0xF6: 'tok:kL4A',
  0xF7: 'tok:kL5A',
  0xF8: 'tok:kL6A',
  0xF9: 'tok:kunA',
  0xFA: 'tok:kvnA',
  0xFB: 'tok:kwnA',
  // 0x94, 0x95, 0x96, 0x97: undefined in k* namespace — fall through to hex.
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
