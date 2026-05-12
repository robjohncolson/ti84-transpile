/**
 * Phase 307 — Full scan-code-to-token table dump + browser KEY_MAP cross-reference
 *
 * Reads the 112-byte lookup table at ROM 0x09F79B (indices 0x00..0x6F).
 * Each byte maps an SDK scan code to an OS token value.
 * Cross-references with ti84-keyboard.js KEY_MAP to show browser-key coverage.
 *
 * Usage: node TI-84_Plus_CE/probe-phase307-scancode-token-table.mjs
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────

const TABLE_BASE = 0x09F79B;
const TABLE_SIZE = 112; // 0x70 entries (indices 0x00 through 0x6F)

// SDK scan code names and physical key labels (from CE C SDK keypadc.h)
const SDK_SCAN_CODES = {
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

// Browser KEY_MAP from ti84-keyboard.js (deduplicated by group/bit)
// Format: { browserKey, group (keyMatrix index), bit, label }
const BROWSER_KEY_MAP = [
  { browserKey: 'ArrowDown',      group: 0, bit: 0, label: 'DOWN' },
  { browserKey: 'ArrowLeft',      group: 0, bit: 1, label: 'LEFT' },
  { browserKey: 'ArrowRight',     group: 0, bit: 2, label: 'RIGHT' },
  { browserKey: 'ArrowUp',        group: 0, bit: 3, label: 'UP' },
  { browserKey: 'Enter',          group: 1, bit: 0, label: 'ENTER' },
  { browserKey: 'Equal/Numpad+',  group: 1, bit: 1, label: '+' },
  { browserKey: 'Minus/Numpad-',  group: 1, bit: 2, label: '-' },
  { browserKey: 'Numpad*',        group: 1, bit: 3, label: '*' },
  { browserKey: 'Slash/Numpad/',  group: 1, bit: 4, label: '/' },
  { browserKey: 'KeyE',           group: 1, bit: 5, label: '^' },
  { browserKey: 'Escape',         group: 1, bit: 6, label: 'CLEAR' },
  { browserKey: 'KeyN',           group: 2, bit: 0, label: '(-)' },
  { browserKey: 'Digit3/Numpad3', group: 2, bit: 1, label: '3' },
  { browserKey: 'Digit6/Numpad6', group: 2, bit: 2, label: '6' },
  { browserKey: 'Digit9/Numpad9', group: 2, bit: 3, label: '9' },
  { browserKey: 'BracketRight',   group: 2, bit: 4, label: ')' },
  { browserKey: 'KeyT',           group: 2, bit: 5, label: 'TAN' },
  { browserKey: 'KeyV',           group: 2, bit: 6, label: 'VARS' },
  { browserKey: 'Period/Numpad.', group: 3, bit: 0, label: '.' },
  { browserKey: 'Digit2/Numpad2', group: 3, bit: 1, label: '2' },
  { browserKey: 'Digit5/Numpad5', group: 3, bit: 2, label: '5' },
  { browserKey: 'Digit8/Numpad8', group: 3, bit: 3, label: '8' },
  { browserKey: 'BracketLeft',    group: 3, bit: 4, label: '(' },
  { browserKey: 'KeyC',           group: 3, bit: 5, label: 'COS' },
  { browserKey: 'KeyP',           group: 3, bit: 6, label: 'PRGM' },
  // STAT (group 3, bit 7) — no browser key mapped
  { browserKey: 'Digit0/Numpad0', group: 4, bit: 0, label: '0' },
  { browserKey: 'Digit1/Numpad1', group: 4, bit: 1, label: '1' },
  { browserKey: 'Digit4/Numpad4', group: 4, bit: 2, label: '4' },
  { browserKey: 'Digit7/Numpad7', group: 4, bit: 3, label: '7' },
  { browserKey: 'Comma',          group: 4, bit: 4, label: ',' },
  { browserKey: 'KeyS',           group: 4, bit: 5, label: 'SIN' },
  { browserKey: 'KeyA',           group: 4, bit: 6, label: 'APPS' },
  { browserKey: 'KeyX',           group: 4, bit: 7, label: 'XTOn' },
  // keyMatrix[5] bit 0 is empty in SDK
  { browserKey: 'KeyO',           group: 5, bit: 1, label: 'STO>' },
  { browserKey: 'KeyL',           group: 5, bit: 2, label: 'LN' },
  { browserKey: 'KeyG',           group: 5, bit: 3, label: 'LOG' },
  { browserKey: 'KeyQ',           group: 5, bit: 4, label: 'x^2' },
  { browserKey: 'KeyI',           group: 5, bit: 5, label: 'x^-1' },
  { browserKey: 'KeyM',           group: 5, bit: 6, label: 'MATH' },
  { browserKey: 'CapsLock',       group: 5, bit: 7, label: 'ALPHA' },
  { browserKey: 'F5',             group: 6, bit: 0, label: 'GRAPH' },
  { browserKey: 'F4',             group: 6, bit: 1, label: 'TRACE' },
  { browserKey: 'F3',             group: 6, bit: 2, label: 'ZOOM' },
  { browserKey: 'F2',             group: 6, bit: 3, label: 'WINDOW' },
  { browserKey: 'F1',             group: 6, bit: 4, label: 'Y=' },
  { browserKey: 'Tab',            group: 6, bit: 5, label: '2ND' },
  { browserKey: 'Home',           group: 6, bit: 6, label: 'MODE' },
  { browserKey: 'Backspace',      group: 6, bit: 7, label: 'DEL' },
];

// Known OS token classifications (common byte values)
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

/**
 * Compute SDK scan code from keyMatrix index and bit.
 *
 * The SDK scan code space allocates 8 slots per group, starting from
 * keyMatrix[0] (SDK Group 7). Slot 0 in each group is unused (gap),
 * so the actual keys start at offset +1 within each 8-slot block.
 *
 * Formula: scanCode = keyMatrixIndex * 8 + bit + 1
 *
 * Verified:
 *   idx=0, bit=0 (DOWN)  -> 0*8+0+1 = 1  = 0x01 = skDown   checkmark
 *   idx=1, bit=0 (ENTER) -> 1*8+0+1 = 9  = 0x09 = skEnter  checkmark
 *   idx=6, bit=0 (GRAPH) -> 6*8+0+1 = 49 = 0x31 = skGraph  checkmark
 *   idx=5, bit=7 (ALPHA) -> 5*8+7+1 = 48 = 0x30 = skAlpha  checkmark
 */
function keyMatrixToScanCode(keyMatrixIndex, bit) {
  return keyMatrixIndex * 8 + bit + 1;
}

// ── Main ───────────────────────────────────────────────────────────────

console.log('='.repeat(90));
console.log('Phase 307: Scan-Code-to-Token Table Dump (ROM 0x09F79B, 112 entries)');
console.log('='.repeat(90));
console.log();

// Extract the full 112-byte table
const tableBytes = rom.subarray(TABLE_BASE, TABLE_BASE + TABLE_SIZE);

// ── Section 1: Full table dump ─────────────────────────────────────────

console.log('--- Full Table: SDK Scan Code -> OS Token ---');
console.log();
console.log(
  pad('Index', 8) +
  pad('SDK Name', 16) +
  pad('Key', 14) +
  pad('Token', 8) +
  'Classification'
);
console.log('-'.repeat(80));

let nonZeroCount = 0;
let zeroCount = 0;

for (let i = 0; i < TABLE_SIZE; i++) {
  const tokenByte = tableBytes[i];
  const sdk = SDK_SCAN_CODES[i];
  const sdkName = sdk ? sdk.name : `(gap ${hex(i)})`;
  const keyLabel = sdk ? sdk.key : '---';
  const classification = TOKEN_CLASSES[tokenByte] || (tokenByte === 0 ? 'unused' : `unknown (${hex(tokenByte)})`);

  if (tokenByte !== 0) {
    nonZeroCount++;
  } else {
    zeroCount++;
  }

  // Only print entries that have a known SDK key OR a non-zero token
  const isInteresting = sdk || tokenByte !== 0;
  if (isInteresting) {
    console.log(
      pad(hex(i), 8) +
      pad(sdkName, 16) +
      pad(keyLabel, 14) +
      pad(hex(tokenByte), 8) +
      classification
    );
  }
}

console.log('-'.repeat(80));
console.log(`Total entries: ${TABLE_SIZE}  |  Non-zero tokens: ${nonZeroCount}  |  Zero/unused: ${zeroCount}`);
console.log();

// ── Section 2: Full raw dump (hex grid) ────────────────────────────────

console.log('--- Raw Hex Dump (16 bytes per row) ---');
console.log();
console.log('       ' + Array.from({ length: 16 }, (_, i) => hex(i).slice(2)).join(' '));
console.log('       ' + Array.from({ length: 16 }, () => '--').join(' '));

for (let row = 0; row < TABLE_SIZE; row += 16) {
  const rowBytes = [];
  for (let col = 0; col < 16 && row + col < TABLE_SIZE; col++) {
    rowBytes.push(tableBytes[row + col].toString(16).toUpperCase().padStart(2, '0'));
  }
  console.log(`  ${hex(row, 2)}:  ${rowBytes.join(' ')}`);
}
console.log();

// ── Section 3: Browser KEY_MAP cross-reference ─────────────────────────

console.log('--- Browser KEY_MAP Cross-Reference ---');
console.log();
console.log(
  pad('Browser Key', 22) +
  pad('TI Key', 10) +
  pad('Group', 7) +
  pad('Bit', 5) +
  pad('ScanCode', 10) +
  pad('Token', 8) +
  'Classification'
);
console.log('-'.repeat(90));

let reachable = 0;
let unreachable = 0;
const reachableScanCodes = new Set();

for (const entry of BROWSER_KEY_MAP) {
  const scanCode = keyMatrixToScanCode(entry.group, entry.bit);
  reachableScanCodes.add(scanCode);

  if (scanCode < TABLE_SIZE) {
    const tokenByte = tableBytes[scanCode];
    const classification = TOKEN_CLASSES[tokenByte] || (tokenByte === 0 ? 'unused/no-token' : `unknown (${hex(tokenByte)})`);
    reachable++;
    console.log(
      pad(entry.browserKey, 22) +
      pad(entry.label, 10) +
      pad(String(entry.group), 7) +
      pad(String(entry.bit), 5) +
      pad(hex(scanCode), 10) +
      pad(hex(tokenByte), 8) +
      classification
    );
  } else {
    unreachable++;
    console.log(
      pad(entry.browserKey, 22) +
      pad(entry.label, 10) +
      pad(String(entry.group), 7) +
      pad(String(entry.bit), 5) +
      pad(hex(scanCode), 10) +
      pad('---', 8) +
      'OUT OF TABLE RANGE'
    );
  }
}

console.log('-'.repeat(90));
console.log();

// ── Section 4: Coverage summary ────────────────────────────────────────

console.log('--- Coverage Summary ---');
console.log();

// All known SDK scan codes
const knownSdkCodes = Object.keys(SDK_SCAN_CODES).map(Number);
const knownSdkSet = new Set(knownSdkCodes);

// Which known SDK scan codes have browser mappings?
const coveredSdk = knownSdkCodes.filter((sc) => reachableScanCodes.has(sc));
const uncoveredSdk = knownSdkCodes.filter((sc) => !reachableScanCodes.has(sc));

console.log(`Browser KEY_MAP entries (deduplicated): ${BROWSER_KEY_MAP.length}`);
console.log(`Scan codes reachable from browser:      ${reachableScanCodes.size}`);
console.log(`  - Within table range (0x00..0x6F):    ${reachable}`);
console.log(`  - Out of table range:                 ${unreachable}`);
console.log();
console.log(`Known SDK scan codes:                   ${knownSdkCodes.length}`);
console.log(`  - Covered by browser KEY_MAP:         ${coveredSdk.length}`);
console.log(`  - NOT covered by browser KEY_MAP:     ${uncoveredSdk.length}`);
console.log();

if (uncoveredSdk.length > 0) {
  console.log('SDK scan codes with NO browser key mapping:');
  for (const sc of uncoveredSdk) {
    const sdk = SDK_SCAN_CODES[sc];
    const tokenByte = sc < TABLE_SIZE ? tableBytes[sc] : null;
    const tokenStr = tokenByte !== null ? hex(tokenByte) : 'N/A';
    console.log(`  ${hex(sc)} ${pad(sdk.name, 16)} ${pad(sdk.key, 14)} -> token ${tokenStr}`);
  }
  console.log();
}

// Which table entries have non-zero tokens but no known SDK name?
const unknownActive = [];
for (let i = 0; i < TABLE_SIZE; i++) {
  if (tableBytes[i] !== 0 && !SDK_SCAN_CODES[i]) {
    unknownActive.push({ index: i, token: tableBytes[i] });
  }
}

if (unknownActive.length > 0) {
  console.log('Table entries with non-zero tokens but NO known SDK scan code name:');
  for (const entry of unknownActive) {
    const classification = TOKEN_CLASSES[entry.token] || `unknown (${hex(entry.token)})`;
    console.log(`  ${hex(entry.index)} -> token ${hex(entry.token)}  (${classification})`);
  }
  console.log();
}

// Non-zero token entries that are NOT reachable from browser
const unreachableActive = [];
for (let i = 0; i < TABLE_SIZE; i++) {
  if (tableBytes[i] !== 0 && !reachableScanCodes.has(i)) {
    const sdk = SDK_SCAN_CODES[i];
    unreachableActive.push({
      index: i,
      token: tableBytes[i],
      sdkName: sdk ? sdk.name : '(unknown)',
      key: sdk ? sdk.key : '---',
    });
  }
}

if (unreachableActive.length > 0) {
  console.log('Active token mappings NOT reachable from browser KEY_MAP:');
  for (const entry of unreachableActive) {
    const classification = TOKEN_CLASSES[entry.token] || `unknown (${hex(entry.token)})`;
    console.log(
      `  ${hex(entry.index)} ${pad(entry.sdkName, 16)} ${pad(entry.key, 14)} -> token ${hex(entry.token)}  (${classification})`
    );
  }
  console.log();
}

console.log('='.repeat(90));
console.log('Phase 307 complete.');
