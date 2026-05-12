/**
 * Phase 308 — 2ND-modified scan-code-to-token table entries
 *
 * The 112-byte scan-code-to-token table at ROM 0x09F79B contains:
 *   - Indices 0x00..0x38: primary (unmodified) scan codes
 *   - Indices 0x39..0x6F: 2ND-modified scan codes
 *
 * The 2ND range mirrors the primary range with an offset of 0x39.
 * For each 2ND entry at index N, the corresponding primary key is at
 * index (N - 0x39), using the same SDK scan code ordering.
 *
 * Usage: node TI-84_Plus_CE/probe-phase308-2nd-token-table.mjs
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────

const TABLE_BASE = 0x09F79B;
const TABLE_SIZE = 112; // 0x70 entries (0x00..0x6F)
const SECOND_START = 0x39;
const SECOND_END = 0x6F;

// SDK scan code names for primary keys (indices 0x00..0x38)
// Used to correlate each 2ND entry back to the primary key it modifies.
const PRIMARY_SDK = {
  0x00: { name: 'skNone',     key: '(none/DOWN*)' },
  0x01: { name: 'skDown',     key: 'DOWN' },
  0x02: { name: 'skLeft',     key: 'LEFT' },
  0x03: { name: 'skRight',    key: 'RIGHT' },
  0x04: { name: 'skUp',       key: 'UP' },
  0x09: { name: 'skEnter',    key: 'ENTER' },
  0x0A: { name: 'skAdd',      key: '+' },
  0x0B: { name: 'skSub',      key: '-' },
  0x0C: { name: 'skMul',      key: '*' },
  0x0D: { name: 'skDiv',      key: '/' },
  0x0E: { name: 'skPower',    key: '^' },
  0x0F: { name: 'skClear',    key: 'CLEAR' },
  0x11: { name: 'skChs',      key: '(-)' },
  0x12: { name: 'sk3',        key: '3' },
  0x13: { name: 'sk6',        key: '6' },
  0x14: { name: 'sk9',        key: '9' },
  0x15: { name: 'skRParen',   key: ')' },
  0x16: { name: 'skTan',      key: 'TAN' },
  0x17: { name: 'skVars',     key: 'VARS' },
  0x19: { name: 'skDecPnt',   key: '.' },
  0x1A: { name: 'sk2',        key: '2' },
  0x1B: { name: 'sk5',        key: '5' },
  0x1C: { name: 'sk8',        key: '8' },
  0x1D: { name: 'skLParen',   key: '(' },
  0x1E: { name: 'skCos',      key: 'COS' },
  0x1F: { name: 'skPrgm',     key: 'PRGM' },
  0x20: { name: 'skStat',     key: 'STAT' },
  0x21: { name: 'sk0',        key: '0' },
  0x22: { name: 'sk1',        key: '1' },
  0x23: { name: 'sk4',        key: '4' },
  0x24: { name: 'sk7',        key: '7' },
  0x25: { name: 'skComma',    key: ',' },
  0x26: { name: 'skSin',      key: 'SIN' },
  0x27: { name: 'skApps',     key: 'APPS' },
  0x28: { name: 'skGraphVar', key: 'X,T,0,n' },
  0x2A: { name: 'skSto',      key: 'STO>' },
  0x2B: { name: 'skLn',       key: 'LN' },
  0x2C: { name: 'skLog',      key: 'LOG' },
  0x2D: { name: 'skSquare',   key: 'x^2' },
  0x2E: { name: 'skRecip',    key: 'x^-1' },
  0x2F: { name: 'skMath',     key: 'MATH' },
  0x30: { name: 'skAlpha',    key: 'ALPHA' },
  0x31: { name: 'skGraph',    key: 'GRAPH' },
  0x32: { name: 'skTrace',    key: 'TRACE' },
  0x33: { name: 'skZoom',     key: 'ZOOM' },
  0x34: { name: 'skWindow',   key: 'WINDOW' },
  0x35: { name: 'skYequ',     key: 'Y=' },
  0x36: { name: 'sk2nd',      key: '2ND' },
  0x37: { name: 'skMode',     key: 'MODE' },
  0x38: { name: 'skDel',      key: 'DEL' },
};

// Known 2ND-function key labels from TI-84 CE keyboard silk-screen
// Maps primary key name -> 2ND function label
const SECOND_LABELS = {
  'DOWN':    '(none)',
  'LEFT':    '(none)',
  'RIGHT':   '(none)',
  'UP':      '(none)',
  'ENTER':   'ENTRY (recall)',
  '+':       'MEM',
  '-':       ']',
  '*':       '[',
  '/':       'e (EE)',
  '^':       'pi',
  'CLEAR':   '(none)',
  '(-)':     'ANS',
  '3':       'theta',
  '6':       '(none)',
  '9':       '(none)',
  ')':       '}',
  'TAN':     'tan^-1',
  'VARS':    'DISTR',
  '.':       'i (imaginary)',
  '2':       'EE/u',
  '5':       '(none)',
  '8':       '(none)',
  '(':       '{',
  'COS':     'cos^-1',
  'PRGM':    'DRAW',
  'STAT':    'LIST',
  '0':       'CATALOG',
  '1':       'L1/FRAC',
  '4':       'L4',
  '7':       'un/vn',
  ',':       'EE',
  'SIN':     'sin^-1',
  'APPS':    'ANGLE',
  'X,T,0,n': 'LINK/SOLVE',
  'STO>':    'RCL',
  'LN':      'e^x',
  'LOG':     '10^x',
  'x^2':     'sqrt',
  'x^-1':    'MATRIX',
  'MATH':    'TEST',
  'ALPHA':   'A-LOCK',
  'GRAPH':   'TABLE',
  'TRACE':   'CALC',
  'ZOOM':    'FORMAT',
  'WINDOW':  'TblSet',
  'Y=':      'STAT PLOT',
  '2ND':     '(2ND toggle)',
  'MODE':    'QUIT',
  'DEL':     'INS',
};

// Known OS token classifications
const TOKEN_CLASSES = {
  0x00: 'NULL (no token)',
  0x30: 'digit 0',
  0x31: 'digit 1',
  0x32: 'digit 2',
  0x33: 'digit 3',
  0x34: 'digit 4',
  0x35: 'digit 5',
  0x36: 'digit 6',
  0x37: 'digit 7',
  0x38: 'digit 8',
  0x39: 'digit 9',
  0x2E: 'decimal point',
  0x70: 'addition (+)',
  0x71: 'subtraction (-)',
  0x82: 'multiplication (*)',
  0x83: 'division (/)',
  0x0D: 'newline / enter',
  0xB0: 'negate (-)',
  0xF0: 'power (^)',
  0x06: 'comma',
  0x10: 'open paren',
  0x11: 'close paren',
};

// ── Helpers ────────────────────────────────────────────────────────────

function hex(value, width = 2) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function pad(str, width) {
  return str.padEnd(width);
}

// ── Main ───────────────────────────────────────────────────────────────

console.log('='.repeat(100));
console.log('Phase 308: 2ND-Modified Scan-Code-to-Token Table (ROM 0x09F79B, indices 0x39..0x6F)');
console.log('='.repeat(100));
console.log();

// Extract the full 112-byte table
const tableBytes = rom.subarray(TABLE_BASE, TABLE_BASE + TABLE_SIZE);

// ── Section 1: 2ND-modified entries ────────────────────────────────────

console.log('--- 2ND-Modified Entries (indices 0x39..0x6F) ---');
console.log();
console.log(
  pad('Index', 8) +
  pad('Token', 8) +
  pad('Status', 10) +
  pad('PrimIdx', 9) +
  pad('PrimSDK', 16) +
  pad('PrimKey', 12) +
  pad('2ND Label', 20) +
  'Token Class'
);
console.log('-'.repeat(100));

let nonZeroCount = 0;
let zeroCount = 0;
const activeEntries = [];

for (let i = SECOND_START; i <= SECOND_END; i++) {
  const tokenByte = tableBytes[i];
  const primaryIdx = i - SECOND_START;
  const primary = PRIMARY_SDK[primaryIdx];
  const primaryName = primary ? primary.name : `(gap ${hex(primaryIdx)})`;
  const primaryKey = primary ? primary.key : '---';
  const secondLabel = primary ? (SECOND_LABELS[primary.key] || '(unknown 2ND)') : '---';
  const status = tokenByte !== 0 ? 'ACTIVE' : 'unused';
  const tokenClass = TOKEN_CLASSES[tokenByte] || (tokenByte === 0 ? 'unused' : `unknown (${hex(tokenByte)})`);

  if (tokenByte !== 0) {
    nonZeroCount++;
    activeEntries.push({ index: i, token: tokenByte, primaryKey, secondLabel, primaryName });
  } else {
    zeroCount++;
  }

  console.log(
    pad(hex(i), 8) +
    pad(hex(tokenByte), 8) +
    pad(status, 10) +
    pad(hex(primaryIdx), 9) +
    pad(primaryName, 16) +
    pad(primaryKey, 12) +
    pad(secondLabel, 20) +
    tokenClass
  );
}

console.log('-'.repeat(100));
console.log();

// ── Section 2: Hex dump of 2ND range ──────────────────────────────────

console.log('--- Raw Hex Dump: 2ND Range (0x39..0x6F) ---');
console.log();

const secondBytes = tableBytes.subarray(SECOND_START, SECOND_END + 1);
const bytesPerRow = 16;

console.log('       ' + Array.from({ length: bytesPerRow }, (_, i) => hex(i).slice(2)).join(' '));
console.log('       ' + Array.from({ length: bytesPerRow }, () => '--').join(' '));

for (let row = 0; row < secondBytes.length; row += bytesPerRow) {
  const rowBytes = [];
  for (let col = 0; col < bytesPerRow && row + col < secondBytes.length; col++) {
    rowBytes.push(secondBytes[row + col].toString(16).toUpperCase().padStart(2, '0'));
  }
  const absAddr = SECOND_START + row;
  console.log(`  ${hex(absAddr, 2)}:  ${rowBytes.join(' ')}`);
}
console.log();

// ── Section 3: Primary vs 2ND side-by-side comparison ─────────────────

console.log('--- Primary vs 2ND Side-by-Side Comparison ---');
console.log();
console.log(
  pad('PrimIdx', 9) +
  pad('PrimKey', 12) +
  pad('PrimToken', 11) +
  pad('2ndIdx', 9) +
  pad('2ND Label', 20) +
  pad('2ndToken', 10) +
  'Notes'
);
console.log('-'.repeat(100));

for (let primaryIdx = 0; primaryIdx <= 0x38; primaryIdx++) {
  const secondIdx = primaryIdx + SECOND_START;
  if (secondIdx > SECOND_END) break;

  const primary = PRIMARY_SDK[primaryIdx];
  if (!primary) continue; // skip gap entries for cleaner output

  const primaryToken = tableBytes[primaryIdx];
  const secondToken = tableBytes[secondIdx];
  const primaryKey = primary.key;
  const secondLabel = SECOND_LABELS[primaryKey] || '(unknown 2ND)';

  let notes = '';
  if (primaryToken === 0 && secondToken === 0) {
    notes = 'both unused';
  } else if (primaryToken !== 0 && secondToken === 0) {
    notes = 'no 2ND function';
  } else if (primaryToken === 0 && secondToken !== 0) {
    notes = '2ND-only (no primary)';
  } else {
    notes = `primary=${hex(primaryToken)} -> 2nd=${hex(secondToken)}`;
  }

  console.log(
    pad(hex(primaryIdx), 9) +
    pad(primaryKey, 12) +
    pad(hex(primaryToken), 11) +
    pad(hex(secondIdx), 9) +
    pad(secondLabel, 20) +
    pad(hex(secondToken), 10) +
    notes
  );
}

console.log('-'.repeat(100));
console.log();

// ── Section 4: Summary ───────────────────────────────────────────────

console.log('--- Summary ---');
console.log();
console.log(`2ND range:        0x39..0x6F (${SECOND_END - SECOND_START + 1} entries)`);
console.log(`Non-zero (active): ${nonZeroCount}`);
console.log(`Zero (unused):     ${zeroCount}`);
console.log();

if (activeEntries.length > 0) {
  console.log('Active 2ND token mappings:');
  for (const e of activeEntries) {
    const tokenClass = TOKEN_CLASSES[e.token] || `unknown (${hex(e.token)})`;
    console.log(`  ${hex(e.index)}: 2ND+${pad(e.primaryKey, 10)} (${e.secondLabel}) -> token ${hex(e.token)}  (${tokenClass})`);
  }
  console.log();
}

console.log('='.repeat(100));
console.log('Phase 308 complete.');
