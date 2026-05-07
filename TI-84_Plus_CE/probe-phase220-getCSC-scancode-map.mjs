#!/usr/bin/env node

/**
 * Phase 220: _GetCSC Scan Code → Key Name Complete Mapping
 *
 * Pure ROM analysis — no CPU execution.
 *
 * Part A: Complete scan code → key name map from SDK keyboard groups
 * Part B: Cross-reference with ROM ConvKeyToTok primary table at 0x05BF84
 * Part C: Resolve _GetCSC jump table entry at 0x020118
 * Part D: Formatted reference table
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)\n`);

// ─── Helpers ────────────────────────────────────────────────────────────────

function hex(val, width = 2) {
  return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(val) {
  return (val & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// ─── Part A: Complete scan code → key name map ──────────────────────────────

// SDK keyboard group definitions (keyMatrix[N] = SDK Group(7-N))
// scanCode = (row << 4) | bitPosition
// row = keyMatrix index

const KEYBOARD_GROUPS = [
  // keyMatrix[0] = SDK Group 7 (arrows)
  { row: 0, sdkGroup: 7, keys: {
    0: 'DOWN', 1: 'LEFT', 2: 'RIGHT', 3: 'UP',
    // bits 4-7 reserved
  }},
  // keyMatrix[1] = SDK Group 6 (operators)
  { row: 1, sdkGroup: 6, keys: {
    0: 'ENTER', 1: '+', 2: '-', 3: '×', 4: '÷', 5: '^', 6: 'CLEAR',
    // bit 7 reserved
  }},
  // keyMatrix[2] = SDK Group 5
  { row: 2, sdkGroup: 5, keys: {
    0: '(-)', 1: '3', 2: '6', 3: '9', 4: ')', 5: 'TAN', 6: 'VARS',
    // bit 7 reserved
  }},
  // keyMatrix[3] = SDK Group 4
  { row: 3, sdkGroup: 4, keys: {
    0: '.', 1: '2', 2: '5', 3: '8', 4: '(', 5: 'COS', 6: 'PRGM', 7: 'STAT',
  }},
  // keyMatrix[4] = SDK Group 3
  { row: 4, sdkGroup: 3, keys: {
    0: '0', 1: '1', 2: '4', 3: '7', 4: ',', 5: 'SIN', 6: 'APPS', 7: 'X,T,θ,n',
  }},
  // keyMatrix[5] = SDK Group 2
  { row: 5, sdkGroup: 2, keys: {
    // bit 0 reserved
    1: 'STO→', 2: 'LN', 3: 'LOG', 4: 'x²', 5: 'x⁻¹', 6: 'MATH', 7: 'ALPHA',
  }},
  // keyMatrix[6] = SDK Group 1 (function keys)
  { row: 6, sdkGroup: 1, keys: {
    0: 'GRAPH', 1: 'TRACE', 2: 'ZOOM', 3: 'WINDOW', 4: 'Y=', 5: '2ND', 6: 'MODE', 7: 'DEL',
  }},
];

// Build the complete scan code map
const scanCodeMap = new Map();

for (const group of KEYBOARD_GROUPS) {
  for (const [bitStr, keyName] of Object.entries(group.keys)) {
    const bit = parseInt(bitStr);
    const scanCode = (group.row << 4) | bit;
    scanCodeMap.set(scanCode, {
      scanCode,
      row: group.row,
      bit,
      sdkGroup: group.sdkGroup,
      keyName,
    });
  }
}

console.log('=' .repeat(76));
console.log('  PART A: Complete Scan Code -> Key Name Map');
console.log('=' .repeat(76));
console.log(`  Total active scan codes: ${scanCodeMap.size}`);
console.log('');
console.log('  Scan Code | Row | Bit | SDK Grp | Key Name');
console.log('  ----------|-----|-----|---------|----------');

const sortedCodes = [...scanCodeMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [sc, info] of sortedCodes) {
  const scHex = hex(sc, 2).padEnd(6);
  const note = sc === 0x00 ? '  (collides with no-key)' : '';
  console.log(`  ${scHex}      |  ${info.row}  |  ${info.bit}  |    ${info.sdkGroup}    | ${info.keyName}${note}`);
}

// ─── Known token names (reused from phase 186) ─────────────────────────────

const TOKEN_NAMES = {
  0x00: '(none)',
  0x04: '->', 0x06: '[', 0x07: ']', 0x08: '{', 0x09: '}',
  0x0C: 'x^-1', 0x0D: 'x^2',
  0x10: 'negate', 0x11: 'Ans',
  0x2A: '"', 0x2B: ',', 0x2C: 'i', 0x2D: '!', 0x2E: 'CubicReg', 0x2F: 'QuartReg',
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0x3A: '.', 0x3B: 'EE', 0x3C: ' or ', 0x3D: ' xor ',
  0x3E: ':', 0x3F: 'ENTER/newline',
  0x40: ' and ', 0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D',
  0x45: 'E', 0x46: 'F', 0x47: 'G', 0x48: 'H', 0x49: 'I',
  0x4A: 'J', 0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N',
  0x4F: 'O', 0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S',
  0x54: 'T', 0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X',
  0x59: 'Y', 0x5A: 'Z', 0x5B: 'theta',
  0x5C: 'S(', 0x5D: 'phat', 0x5E: 'chi2',
  0x62: 'L1', 0x63: 'L2', 0x64: 'L3', 0x65: 'L4', 0x66: 'L5', 0x67: 'L6',
  0x6A: 'Pic1',
  0x70: '+', 0x71: '-', 0x82: '*', 0x83: '/',
  0xAB: 'sin(', 0xAC: 'cos(', 0xAD: 'tan(',
  0xB0: '(', 0xB1: ')',
  0xB2: 'e^(', 0xB3: '10^(',
  0xBC: 'log(', 0xBD: 'ln(',
  0xF0: '^', 0xF1: 'sqrt(',
};

function tokenName(byte) {
  return TOKEN_NAMES[byte] || '';
}

// ─── Part B: Cross-reference with ROM ConvKeyToTok table ────────────────────

console.log('\n' + '=' .repeat(76));
console.log('  PART B: ConvKeyToTok Primary Table Cross-Reference');
console.log('  Table at 0x05BF84, 166 entries, key codes 0x5A-0xFF');
console.log('  token = ROM[0x05BF84 + (keyCode - 0x5A)]');
console.log('=' .repeat(76));
console.log('');

// Read the primary ConvKeyToTok table
const CONV_TABLE_BASE = 0x05BF84;
const CONV_TABLE_COUNT = 166;

const convEntries = [];
for (let i = 0; i < CONV_TABLE_COUNT; i++) {
  const keyCode = 0x5A + i;
  const tokenByte = rom[CONV_TABLE_BASE + i];
  convEntries.push({ keyCode, tokenByte });
}

// Show non-zero entries with token names
console.log('  KeyCode | Token | Token Name');
console.log('  --------|-------|----------');

let nonZeroCount = 0;
for (const e of convEntries) {
  if (e.tokenByte !== 0x00) {
    const name = tokenName(e.tokenByte);
    console.log(`  ${hex(e.keyCode)}     | ${hex(e.tokenByte)}    | ${name || '(unknown)'}`);
    nonZeroCount++;
  }
}
console.log(`\n  Non-zero token entries: ${nonZeroCount} / ${CONV_TABLE_COUNT}`);

// Note: scan codes (0x00-0x67) are NOT key codes (0x5A-0xFF).
// _GetCSC returns scan codes; GetKey converts scan codes to key codes.
// ConvKeyToTok operates on key codes, not scan codes directly.
console.log('\n  NOTE: Scan codes (0x00-0x67) differ from key codes (0x5A-0xFF).');
console.log('  _GetCSC returns scan codes. GetKey converts scan->keycode.');
console.log('  ConvKeyToTok operates on key codes, not scan codes.');
console.log('  The scan code -> key code mapping is internal to GetKey.');

// ─── Part C: Resolve _GetCSC jump table ─────────────────────────────────────

console.log('\n' + '=' .repeat(76));
console.log('  PART C: _GetCSC Jump Table Resolution');
console.log('=' .repeat(76));
console.log('');

// _GetCSC is system call entry at 0x020118
// The OS jump table contains JP instructions (opcode 0xC3) followed by
// a 3-byte little-endian target address (eZ80 ADL mode, 4 bytes total).
const GETCSC_ENTRY = 0x020118;

const opcode = rom[GETCSC_ENTRY];
const addrByte0 = rom[GETCSC_ENTRY + 1];
const addrByte1 = rom[GETCSC_ENTRY + 2];
const addrByte2 = rom[GETCSC_ENTRY + 3];
const getCSCTarget = addrByte0 | (addrByte1 << 8) | (addrByte2 << 16);

console.log(`  _GetCSC jump table entry at: ${hex(GETCSC_ENTRY, 6)}`);
console.log(`  Raw bytes: ${hexByte(opcode)} ${hexByte(addrByte0)} ${hexByte(addrByte1)} ${hexByte(addrByte2)}`);
console.log(`  Opcode: ${hex(opcode)} (${opcode === 0xC3 ? 'JP — confirmed' : 'UNEXPECTED'})`);
console.log(`  Resolved target address: ${hex(getCSCTarget, 6)}`);

// Read first 32 bytes at target
console.log(`\n  Hex dump of first 32 bytes at ${hex(getCSCTarget, 6)}:`);
console.log('');

for (let row = 0; row < 32; row += 16) {
  const bytes = [];
  const ascii = [];
  for (let col = 0; col < 16 && row + col < 32; col++) {
    const b = rom[getCSCTarget + row + col];
    bytes.push(hexByte(b));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${hex(getCSCTarget + row, 6)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
}

// Also check nearby jump table entries for context
console.log('\n  Nearby jump table entries for context:');
console.log('  (Each entry is a JP instruction: C3 aa bb cc -> JP 0xccbbaa)');
const JT_ENTRIES = [
  { addr: 0x020110, name: '_GetKey' },
  { addr: 0x020114, name: '(+4)' },
  { addr: 0x020118, name: '_GetCSC' },
  { addr: 0x02011C, name: '(+12)' },
  { addr: 0x020120, name: '(+16)' },
];

for (const entry of JT_ENTRIES) {
  const op = rom[entry.addr];
  const b0 = rom[entry.addr + 1];
  const b1 = rom[entry.addr + 2];
  const b2 = rom[entry.addr + 3];
  const target = b0 | (b1 << 8) | (b2 << 16);
  console.log(`  ${hex(entry.addr, 6)} [${entry.name}]: ${hexByte(op)} ${hexByte(b0)} ${hexByte(b1)} ${hexByte(b2)} -> JP ${hex(target, 6)}`);
}

// ─── Part D: Formatted Reference Table ──────────────────────────────────────

console.log('\n' + '=' .repeat(76));
console.log('  PART D: Complete Scan Code Reference Table');
console.log('  NOTE: Token column shows ConvKeyToTok result IF the scan code');
console.log('  happens to fall in the key code range (>=0x5A). Most scan codes');
console.log('  are <0x5A and go through GetKey\'s scan-to-keycode conversion first.');
console.log('=' .repeat(76));
console.log('');
console.log('  Scan Code | Key Name       | In KeyCode Range | Token (hex) | Token Name');
console.log('  ----------|----------------|------------------|-------------|----------');

for (const [sc, info] of sortedCodes) {
  const scHex = hex(sc, 2).padEnd(6);
  const keyName = info.keyName.padEnd(14);

  // Check if this scan code is also a valid key code (>=0x5A)
  const inRange = sc >= 0x5A && sc <= 0xFF;
  let tokenHex = '---        ';
  let tokName = '';
  let rangeStr = 'No              ';

  if (inRange) {
    const idx = sc - 0x5A;
    const tokenByte = rom[CONV_TABLE_BASE + idx];
    tokenHex = hex(tokenByte).padEnd(11);
    tokName = tokenName(tokenByte);
    rangeStr = 'Yes             ';
  }

  console.log(`  ${scHex}      | ${keyName} | ${rangeStr} | ${tokenHex} | ${tokName}`);
}

// ─── Additional: GetKey key code mapping table ──────────────────────────────

// Try to find the scan-to-keycode conversion table in ROM.
// GetKey typically uses a lookup table to convert _GetCSC scan codes
// to the key codes that ConvKeyToTok expects.

console.log('\n' + '=' .repeat(76));
console.log('  BONUS: Scan Code -> Key Code Mapping Attempt');
console.log('  Looking for the GetKey scan-to-keycode table in ROM...');
console.log('=' .repeat(76));
console.log('');

// The _GetKey entry (JP instruction at 0x020110)
const GETKEY_ENTRY = 0x020110;
const gkOp = rom[GETKEY_ENTRY];
const gk0 = rom[GETKEY_ENTRY + 1];
const gk1 = rom[GETKEY_ENTRY + 2];
const gk2 = rom[GETKEY_ENTRY + 3];
const getKeyTarget = gk0 | (gk1 << 8) | (gk2 << 16);

console.log(`  _GetKey: ${hexByte(gkOp)} ${hexByte(gk0)} ${hexByte(gk1)} ${hexByte(gk2)} -> JP ${hex(getKeyTarget, 6)}`);
console.log(`  Hex dump of first 64 bytes at GetKey target:`);
console.log('');

for (let row = 0; row < 64; row += 16) {
  const bytes = [];
  const ascii = [];
  for (let col = 0; col < 16 && row + col < 64; col++) {
    const b = rom[getKeyTarget + row + col];
    bytes.push(hexByte(b));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${hex(getKeyTarget + row, 6)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '=' .repeat(76));
console.log('  SUMMARY');
console.log('=' .repeat(76));
console.log(`  Active scan codes: ${scanCodeMap.size}`);
console.log(`  - Arrow keys (row 0): 4 codes (0x00-0x03)`);
console.log(`  - Operators (row 1): 7 codes (0x10-0x16)`);
console.log(`  - Row 2: 7 codes (0x20-0x26)`);
console.log(`  - Row 3: 8 codes (0x30-0x37)`);
console.log(`  - Row 4: 8 codes (0x40-0x47)`);
console.log(`  - Row 5: 7 codes (0x51-0x57, bit 0 reserved)`);
console.log(`  - Function keys (row 6): 8 codes (0x60-0x67)`);
console.log(`  Reserved/inactive: bit 7 in rows 0,1,2; bit 0 in row 5`);
console.log(`  Special: DOWN (0x00) collides with no-key sentinel`);
console.log(`  _GetCSC target: ${hex(getCSCTarget, 6)}`);
console.log(`  _GetKey target: ${hex(getKeyTarget, 6)}`);
console.log(`  ConvKeyToTok table: ${hex(CONV_TABLE_BASE, 6)} (${nonZeroCount} non-zero of ${CONV_TABLE_COUNT})`);
console.log('');
console.log('  Key insight: scan codes (from _GetCSC) are NOT the same as');
console.log('  key codes (used by ConvKeyToTok). GetKey bridges the gap.');
console.log('  Scan codes range 0x00-0x67; key codes range 0x5A-0xFF.');

console.log('\nDone.');
