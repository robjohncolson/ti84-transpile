#!/usr/bin/env node

/**
 * Phase 186: ConvKeyToTok ROM Table Dump
 *
 * Pure ROM read — no CPU execution. Reads the lookup tables that
 * ConvKeyToTok (0x05C52C) uses to convert key codes to token bytes.
 *
 * Primary table: 0x05BF84, 166 entries (key codes 0x5A–0xFF)
 * Secondary tables: 0x05C01D, 0x05C1B0, 0x05C3AA, 0x05C4A0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)\n`);

// ─── Known token names ──────────────────────────────────────────────────────

const TOKEN_NAMES = {
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
  0x70: '+', 0x71: '-', 0x82: '*', 0x83: '/',
  0xAB: 'sin(', 0xAC: 'cos(', 0xAD: 'tan(',
  0xB0: '(', 0xB1: ')',
  0xBC: 'log(', 0xBD: 'ln(',
  0xF0: '^', 0xF1: 'sqrt(',
  0x2A: '"', 0x2B: ',', 0x2C: 'i', 0x2D: '!', 0x2E: 'CubicReg',
  0x2F: 'QuartReg',
  0x10: 'negate', 0x11: 'Ans',
  0x04: '->',  // STO arrow
  0x06: '[',  0x07: ']',
  0x08: '{',  0x09: '}',
  0x0C: 'x-inv', 0x0D: 'x-sq',
  0x5C: 'S(', 0x5D: 'phat', 0x5E: 'chi2',
  0x62: 'L1', 0x63: 'L2', 0x64: 'L3', 0x65: 'L4', 0x66: 'L5', 0x67: 'L6',
  0x6A: 'Pic1',
  0xB2: 'e^(', 0xB3: '10^(',
};

// ─── Keyboard scan code → key name mapping ──────────────────────────────────

const SCAN_CODE_NAMES = {
  0x00: 'DOWN',    0x01: 'LEFT',   0x02: 'RIGHT',  0x03: 'UP',
  0x10: 'ENTER',   0x11: '+',      0x12: '-',      0x13: 'x',
  0x14: '/',       0x15: '^',      0x16: 'CLEAR',
  0x20: '(-)',     0x21: '3',      0x22: '6',      0x23: '9',
  0x24: ')',       0x25: 'TAN',    0x26: 'VARS',
  0x30: '.',       0x31: '2',      0x32: '5',      0x33: '8',
  0x34: '(',       0x35: 'COS',    0x36: 'PRGM',   0x37: 'STAT',
  0x40: '0',       0x41: '1',      0x42: '4',      0x43: '7',
  0x44: ',',       0x45: 'SIN',    0x46: 'APPS',   0x47: 'X,T,O,n',
  0x51: 'STO->',   0x52: 'LN',     0x53: 'LOG',
  0x54: 'x^2',    0x55: 'x^-1',   0x56: 'MATH',   0x57: 'ALPHA',
  0x60: 'GRAPH',   0x61: 'TRACE',  0x62: 'ZOOM',   0x63: 'WINDOW',
  0x64: 'Y=',      0x65: '2ND',    0x66: 'MODE',   0x67: 'DEL',
};

// ─── Key code → scan code reverse map ──────────────────────────────────────
// The OS converts scan codes to "key codes" before ConvKeyToTok.
// Key codes 0x5A–0xFF are the domain of the primary table.
// We don't have the scan-to-keycode conversion table yet, so we note
// scan codes separately for cross-reference.

// ─── Helpers ────────────────────────────────────────────────────────────────

function hex(val, width = 2) {
  return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(val) {
  return (val & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function tokenName(byte) {
  return TOKEN_NAMES[byte] || '';
}

// ─── Dump a table region from ROM ───────────────────────────────────────────

function dumpTable(baseAddr, maxLen, label) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ${label}`);
  console.log(`  Base: ${hex(baseAddr, 6)}  Max read: ${maxLen} bytes`);
  console.log('='.repeat(72));

  const entries = [];
  let trailingZeros = 0;

  for (let i = 0; i < maxLen; i++) {
    const byte = rom[baseAddr + i];

    // Detect natural boundary: 8+ consecutive 0x00 or 0xFF
    if (byte === 0x00 || byte === 0xFF) {
      trailingZeros++;
      if (trailingZeros >= 8) {
        // Trim the trailing zeros from entries
        while (entries.length > 0 && (entries[entries.length - 1].byte === 0x00 || entries[entries.length - 1].byte === 0xFF)) {
          entries.pop();
        }
        break;
      }
    } else {
      trailingZeros = 0;
    }

    entries.push({ offset: i, addr: baseAddr + i, byte });
  }

  console.log(`  Entries found: ${entries.length}`);
  console.log('');
  console.log('  Offset | ROM Addr | Byte | Token Name');
  console.log('  -------|----------|------|----------');

  for (const e of entries) {
    const name = tokenName(e.byte);
    const namePart = name ? `  ${name}` : '';
    console.log(`  ${hex(e.offset, 4)}   | ${hex(e.addr, 6)} | ${hex(e.byte)}   |${namePart}`);
  }

  return entries;
}

// ─── Primary table: 0x05BF84, 166 entries (key codes 0x5A–0xFF) ────────────

function dumpPrimaryTable() {
  const BASE = 0x05BF84;
  const COUNT = 166; // key codes 0x5A through 0xFF

  console.log('\n' + '='.repeat(72));
  console.log('  PRIMARY ConvKeyToTok Table');
  console.log(`  Base: ${hex(BASE, 6)}  Entries: ${COUNT} (key codes 0x5A-0xFF)`);
  console.log('  Key code = 0x5A + table_index');
  console.log('='.repeat(72));
  console.log('');
  console.log('  KeyCode | Index | Token | Token Name');
  console.log('  --------|-------|-------|----------');

  const entries = [];

  for (let i = 0; i < COUNT; i++) {
    const keyCode = 0x5A + i;
    const tokenByte = rom[BASE + i];
    const name = tokenName(tokenByte);
    const namePart = name ? `  ${name}` : '';

    console.log(`  ${hex(keyCode)}    | ${hex(i, 4)}  | ${hex(tokenByte)}    |${namePart}`);

    entries.push({
      keyCode,
      keyCodeHex: hex(keyCode),
      tableIndex: i,
      tokenByte,
      tokenByteHex: hex(tokenByte),
      tokenName: name || null,
    });
  }

  return entries;
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log('Phase 186: ConvKeyToTok ROM Table Dump');
console.log('Pure ROM read — no CPU execution');

// Primary table
const primaryEntries = dumpPrimaryTable();

// Secondary tables
const SECONDARY_TABLES = [
  { addr: 0x05C01D, label: 'Secondary Table A (0x05C01D) — possibly normal/default' },
  { addr: 0x05C1B0, label: 'Secondary Table B (0x05C1B0) — possibly 2nd mode' },
  { addr: 0x05C3AA, label: 'Secondary Table C (0x05C3AA) — possibly Alpha mode' },
  { addr: 0x05C4A0, label: 'Secondary Table D (0x05C4A0) — possibly Alpha-Lock mode' },
];

const secondaryResults = {};

for (const t of SECONDARY_TABLES) {
  const entries = dumpTable(t.addr, 400, t.label);
  secondaryResults[hex(t.addr, 6)] = {
    label: t.label,
    baseAddress: t.addr,
    baseAddressHex: hex(t.addr, 6),
    entryCount: entries.length,
    entries: entries.map(e => ({
      offset: e.offset,
      romAddress: e.addr,
      romAddressHex: hex(e.addr, 6),
      byte: e.byte,
      byteHex: hex(e.byte),
      tokenName: tokenName(e.byte) || null,
    })),
  };
}

// ─── Cross-reference with keyboard scan codes ───────────────────────────────

console.log('\n' + '='.repeat(72));
console.log('  CROSS-REFERENCE: Scan Codes → Key Codes → Tokens');
console.log('  Note: Scan-to-keycode conversion is done by GetCSC/GetKey,');
console.log('  not by ConvKeyToTok. The keycode domain starts at 0x5A.');
console.log('='.repeat(72));
console.log('');
console.log('  Scan Code | Key Name    | In ConvKeyToTok range?');
console.log('  ----------|-------------|----------------------');

const scanCodeXref = [];

for (const [scStr, name] of Object.entries(SCAN_CODE_NAMES)) {
  const sc = parseInt(scStr);
  const inRange = sc >= 0x5A && sc <= 0xFF;
  let tokenInfo = null;

  if (inRange) {
    const idx = sc - 0x5A;
    const tokenByte = rom[0x05BF84 + idx];
    tokenInfo = { tokenByte, tokenByteHex: hex(tokenByte), tokenName: tokenName(tokenByte) || null };
    console.log(`  ${hex(sc, 4)}      | ${name.padEnd(11)} | YES → token ${hex(tokenByte)} ${tokenName(tokenByte) || ''}`);
  } else {
    console.log(`  ${hex(sc, 4)}      | ${name.padEnd(11)} | NO (code < 0x5A, handled differently)`);
  }

  scanCodeXref.push({
    scanCode: sc,
    scanCodeHex: hex(sc, 4),
    keyName: name,
    inConvKeyToTokRange: inRange,
    tokenInfo,
  });
}

// ─── Verification against known values ──────────────────────────────────────

console.log('\n' + '='.repeat(72));
console.log('  VERIFICATION: Known token values');
console.log('='.repeat(72));

const KNOWN = [
  // These are token values we expect to find in the primary table.
  // We check if any key code maps to these tokens.
  { token: 0x30, expected: '0' },
  { token: 0x31, expected: '1' },
  { token: 0x32, expected: '2' },
  { token: 0x33, expected: '3' },
  { token: 0x34, expected: '4' },
  { token: 0x35, expected: '5' },
  { token: 0x36, expected: '6' },
  { token: 0x37, expected: '7' },
  { token: 0x38, expected: '8' },
  { token: 0x39, expected: '9' },
  { token: 0x70, expected: '+' },
  { token: 0x71, expected: '-' },
  { token: 0x82, expected: '*' },
  { token: 0x83, expected: '/' },
  { token: 0x3F, expected: 'ENTER/newline' },
];

let passCount = 0;
let failCount = 0;

for (const k of KNOWN) {
  // Find which key code(s) map to this token
  const matches = primaryEntries.filter(e => e.tokenByte === k.token);
  if (matches.length > 0) {
    const keyCodes = matches.map(m => m.keyCodeHex).join(', ');
    console.log(`  PASS: token ${hex(k.token)} (${k.expected}) found at keyCode(s): ${keyCodes}`);
    passCount++;
  } else {
    console.log(`  INFO: token ${hex(k.token)} (${k.expected}) not in primary table (may be in secondary or direct-mapped)`);
    // Not a failure — the token might be handled by a different code path
  }
}

console.log(`\n  Verification: ${passCount} found in primary table`);

// ─── Hex dump of raw bytes around table boundaries ──────────────────────────

function hexDumpRegion(addr, len, label) {
  console.log(`\n  --- ${label} (${hex(addr, 6)}, ${len} bytes) ---`);
  for (let row = 0; row < len; row += 16) {
    const bytes = [];
    const ascii = [];
    for (let col = 0; col < 16 && row + col < len; col++) {
      const b = rom[addr + row + col];
      bytes.push(hexByte(b));
      ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
    }
    console.log(`  ${hex(addr + row, 6)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

console.log('\n' + '='.repeat(72));
console.log('  RAW HEX DUMPS (boundary regions)');
console.log('='.repeat(72));

hexDumpRegion(0x05BF84, 176, 'Primary table (166 entries + padding)');
hexDumpRegion(0x05C01D, 64, 'Secondary A start');
hexDumpRegion(0x05C1B0, 64, 'Secondary B start');
hexDumpRegion(0x05C3AA, 64, 'Secondary C start');
hexDumpRegion(0x05C4A0, 64, 'Secondary D start');

// ─── Generate JSON output ───────────────────────────────────────────────────

const output = {
  _meta: {
    probe: 'probe-phase186-keytok-table-dump.mjs',
    phase: 186,
    description: 'ConvKeyToTok ROM lookup table dump — pure ROM read',
    romFile: 'ROM.rom',
    romSize: rom.length,
    generatedAt: new Date().toISOString(),
  },
  primaryTable: {
    baseAddress: 0x05BF84,
    baseAddressHex: '0x05BF84',
    entryCount: primaryEntries.length,
    keyCodeRange: '0x5A-0xFF',
    algorithm: 'token = ROM[0x05BF84 + (keyCode - 0x5A)]',
    entries: primaryEntries,
  },
  secondaryTables: secondaryResults,
  scanCodeCrossReference: scanCodeXref,
};

const jsonPath = path.join(__dirname, 'phase186-keytok-tables.json');
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
console.log(`\nJSON output written to: ${jsonPath}`);

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(72));
console.log('  SUMMARY');
console.log('='.repeat(72));
console.log(`  Primary table: ${primaryEntries.length} entries at ${hex(0x05BF84, 6)}`);
for (const [addr, data] of Object.entries(secondaryResults)) {
  console.log(`  ${data.label}: ${data.entryCount} entries`);
}
console.log(`  Scan code cross-refs: ${scanCodeXref.length} scan codes`);
console.log(`  Scan codes in keycode range (>=0x5A): ${scanCodeXref.filter(s => s.inConvKeyToTokRange).length}`);
console.log(`  Scan codes below keycode range (<0x5A): ${scanCodeXref.filter(s => !s.inConvKeyToTokRange).length}`);

// Count unique non-zero tokens in primary table
const uniqueTokens = new Set(primaryEntries.map(e => e.tokenByte).filter(t => t !== 0x00));
console.log(`  Unique non-zero tokens in primary table: ${uniqueTokens.size}`);

console.log('\nDone.');
