#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TABLE_BASE = 0x0A0806;
const HEADER_WINDOW_START = 0x0A0800;
const HEADER_WINDOW_LENGTH = 0x20;

const SAMPLE_ENTRY_COUNT = 50;
const FULL_ENTRY_LIMIT = 4096;
const MAX_NULL_SCAN = 0x40;
const MAX_ENTRY_LEN = 0x40;
const FIXED_WIDTH = 16;

const KNOWN_HINTS = [
  '1-Var Stats',
  '2-Var Stats',
  'Med-Med',
  'LinReg(a+bx)',
  'LinReg(ax+b)',
  'QuadReg',
  'CubicReg',
  'QuartReg',
  'LnReg',
  'ExpReg',
  'PwrReg',
  'Logistic',
  'SinReg',
];

const DISPLAY_OVERRIDES = new Map([
  [0x80, '0'],
  [0x81, '1'],
  [0x82, '2'],
  [0x83, '3'],
  [0x84, '4'],
  [0x85, '5'],
  [0x86, '6'],
  [0x87, '7'],
  [0x88, '8'],
  [0x89, '9'],
  [0xC1, '['],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex2(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hex2(byte)).join(' ');
}

function asciiPreviewByte(byte) {
  return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.';
}

function renderDisplayByte(byte) {
  if (byte >= 0x20 && byte <= 0x7E) return String.fromCharCode(byte);
  if (DISPLAY_OVERRIDES.has(byte)) return DISPLAY_OVERRIDES.get(byte);
  return `\\x${hex2(byte)}`;
}

function renderDisplayBytes(bytes) {
  return Array.from(bytes, (byte) => renderDisplayByte(byte)).join('');
}

function quoteDisplay(text) {
  return `"${String(text).replace(/"/g, '\\"')}"`;
}

function isReadableDisplayByte(byte) {
  return (byte >= 0x20 && byte <= 0x7E) || DISPLAY_OVERRIDES.has(byte);
}

function countReadableBytes(bytes) {
  let count = 0;
  for (const byte of bytes) {
    if (isReadableDisplayByte(byte)) count += 1;
  }
  return count;
}

function hasFillRun(rom, addr, fillByte = 0xFF, length = 8) {
  if (addr + length > rom.length) return false;
  for (let index = 0; index < length; index += 1) {
    if (rom[addr + index] !== fillByte) return false;
  }
  return true;
}

function describeInvalidLength(rom, addr, token, length) {
  const lookahead = bytesToHex(rom.subarray(addr, Math.min(rom.length, addr + 8)));
  return `invalid length ${hexByte(length)} at ${hex(addr)} after token ${hexByte(token)} (lookahead: ${lookahead})`;
}

function buildEntry(index, addr, token, bytes, lengthOverride = null) {
  return {
    index,
    addr,
    token,
    length: lengthOverride ?? bytes.length,
    rawHex: bytesToHex(bytes),
    displayText: renderDisplayBytes(bytes),
    readableRatio: bytes.length > 0 ? countReadableBytes(bytes) / bytes.length : 0,
  };
}

function finalizeStrategy(id, name, description, entries, stopReason, nextAddr, extra = {}) {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.length, 0);
  const readableBytes = entries.reduce((sum, entry) => sum + Math.round(entry.readableRatio * entry.length), 0);
  const avgReadableRatio = totalBytes > 0 ? readableBytes / totalBytes : 0;
  const hintEntryCount = entries.filter((entry) => KNOWN_HINTS.some((hint) => entry.displayText.includes(hint))).length;
  const saneLenCount = entries.filter((entry) => entry.length >= 1 && entry.length <= 24).length;
  const entryCountRatio = Math.min(entries.length, SAMPLE_ENTRY_COUNT) / SAMPLE_ENTRY_COUNT;
  const saneLenRatio = entries.length > 0 ? saneLenCount / entries.length : 0;
  const score = Number(
    (
      avgReadableRatio * 40 +
      entryCountRatio * 30 +
      saneLenRatio * 10 +
      hintEntryCount * 3
    ).toFixed(2)
  );

  return {
    id,
    name,
    description,
    entries,
    stopReason,
    nextAddr,
    avgReadableRatio,
    hintEntryCount,
    saneLenRatio,
    score,
    ...extra,
  };
}

function parseSequentialNullStrings(rom, start, maxEntries = SAMPLE_ENTRY_COUNT) {
  const entries = [];
  let addr = start;

  while (entries.length < maxEntries && addr < rom.length) {
    if (hasFillRun(rom, addr)) {
      return finalizeStrategy(
        'A',
        'Strategy A',
        'Sequential null-terminated strings',
        entries,
        `0xFF fill at ${hex(addr)}`,
        addr,
      );
    }

    let end = addr;
    while (end < rom.length && end - addr <= MAX_NULL_SCAN && rom[end] !== 0x00) {
      end += 1;
    }

    if (end >= rom.length) {
      return finalizeStrategy(
        'A',
        'Strategy A',
        'Sequential null-terminated strings',
        entries,
        `ran off end of ROM while scanning for NUL from ${hex(addr)}`,
        end,
      );
    }

    if (rom[end] !== 0x00) {
      return finalizeStrategy(
        'A',
        'Strategy A',
        'Sequential null-terminated strings',
        entries,
        `entry ${entries.length} has no NUL within ${MAX_NULL_SCAN} bytes at ${hex(addr)}`,
        addr,
      );
    }

    const bytes = rom.subarray(addr, end);
    entries.push(buildEntry(entries.length, addr, null, bytes));
    addr = end + 1;
  }

  return finalizeStrategy(
    'A',
    'Strategy A',
    'Sequential null-terminated strings',
    entries,
    entries.length >= maxEntries ? `sample limit ${maxEntries} reached` : 'ROM exhausted',
    addr,
  );
}

function parseLengthPrefixedStrings(rom, start, maxEntries = SAMPLE_ENTRY_COUNT) {
  const entries = [];
  let addr = start;

  while (entries.length < maxEntries && addr < rom.length) {
    if (hasFillRun(rom, addr)) {
      return finalizeStrategy(
        'B',
        'Strategy B',
        'Length-prefixed strings: (len, bytes)',
        entries,
        `0xFF fill at ${hex(addr)}`,
        addr,
      );
    }

    const length = rom[addr];
    if (length === 0 || length > MAX_ENTRY_LEN || addr + 1 + length > rom.length) {
      return finalizeStrategy(
        'B',
        'Strategy B',
        'Length-prefixed strings: (len, bytes)',
        entries,
        describeInvalidLength(rom, addr, 0x00, length),
        addr,
      );
    }

    const bytes = rom.subarray(addr + 1, addr + 1 + length);
    entries.push(buildEntry(entries.length, addr, null, bytes, length));
    addr += 1 + length;
  }

  return finalizeStrategy(
    'B',
    'Strategy B',
    'Length-prefixed strings: (len, bytes)',
    entries,
    entries.length >= maxEntries ? `sample limit ${maxEntries} reached` : 'ROM exhausted',
    addr,
  );
}

function parseTokenNullStrings(rom, start, maxEntries = SAMPLE_ENTRY_COUNT) {
  const entries = [];
  let addr = start;

  while (entries.length < maxEntries && addr + 1 < rom.length) {
    if (hasFillRun(rom, addr)) {
      return finalizeStrategy(
        'C',
        'Strategy C',
        'Explicit token byte followed by a null-terminated string',
        entries,
        `0xFF fill at ${hex(addr)}`,
        addr,
      );
    }

    const token = rom[addr];
    let end = addr + 1;

    while (end < rom.length && end - (addr + 1) <= MAX_NULL_SCAN && rom[end] !== 0x00) {
      end += 1;
    }

    if (end >= rom.length) {
      return finalizeStrategy(
        'C',
        'Strategy C',
        'Explicit token byte followed by a null-terminated string',
        entries,
        `ran off end of ROM while scanning for NUL from ${hex(addr + 1)}`,
        end,
      );
    }

    if (rom[end] !== 0x00) {
      return finalizeStrategy(
        'C',
        'Strategy C',
        'Explicit token byte followed by a null-terminated string',
        entries,
        `entry ${entries.length} token ${hexByte(token)} has no NUL within ${MAX_NULL_SCAN} bytes at ${hex(addr)}`,
        addr,
      );
    }

    const bytes = rom.subarray(addr + 1, end);
    entries.push(buildEntry(entries.length, addr, token, bytes));
    addr = end + 1;
  }

  return finalizeStrategy(
    'C',
    'Strategy C',
    'Explicit token byte followed by a null-terminated string',
    entries,
    entries.length >= maxEntries ? `sample limit ${maxEntries} reached` : 'ROM exhausted',
    addr,
  );
}

function parseFixedWidthEntries(rom, start, maxEntries = SAMPLE_ENTRY_COUNT, width = FIXED_WIDTH) {
  const entries = [];
  let addr = start;

  while (entries.length < maxEntries && addr + width <= rom.length) {
    const bytes = rom.subarray(addr, addr + width);
    if (bytes.every((byte) => byte === 0xFF)) {
      return finalizeStrategy(
        'D',
        'Strategy D',
        `Fixed-width entries (${width} bytes per entry)`,
        entries,
        `0xFF fill at ${hex(addr)}`,
        addr,
        { width },
      );
    }

    entries.push(buildEntry(entries.length, addr, null, bytes, width));
    addr += width;
  }

  return finalizeStrategy(
    'D',
    'Strategy D',
    `Fixed-width entries (${width} bytes per entry)`,
    entries,
    entries.length >= maxEntries ? `sample limit ${maxEntries} reached` : 'ROM exhausted',
    addr,
    { width },
  );
}

function parseTokenLengthStrings(rom, start, maxEntries = SAMPLE_ENTRY_COUNT, id = 'E', name = 'Strategy E') {
  const entries = [];
  let addr = start;

  while (entries.length < maxEntries && addr + 1 < rom.length) {
    if (hasFillRun(rom, addr)) {
      return finalizeStrategy(
        id,
        name,
        'Observed hybrid format: (token byte, length byte, display bytes)',
        entries,
        `0xFF fill at ${hex(addr)}`,
        addr,
      );
    }

    const token = rom[addr];
    const length = rom[addr + 1];
    if (length === 0 || length > MAX_ENTRY_LEN || addr + 2 + length > rom.length) {
      return finalizeStrategy(
        id,
        name,
        'Observed hybrid format: (token byte, length byte, display bytes)',
        entries,
        describeInvalidLength(rom, addr, token, length),
        addr,
      );
    }

    const bytes = rom.subarray(addr + 2, addr + 2 + length);
    entries.push(buildEntry(entries.length, addr, token, bytes, length));
    addr += 2 + length;
  }

  return finalizeStrategy(
    id,
    name,
    'Observed hybrid format: (token byte, length byte, display bytes)',
    entries,
    entries.length >= maxEntries ? `entry limit ${maxEntries} reached` : 'ROM exhausted',
    addr,
  );
}

function printHexWindow(rom, start, length) {
  console.log('--- Nearby Bytes (0x0A0800-0x0A081F) ---');
  for (let addr = start; addr < start + length; addr += 16) {
    const bytes = rom.subarray(addr, Math.min(rom.length, addr + 16));
    const ascii = Array.from(bytes, (byte) => asciiPreviewByte(byte)).join('');
    console.log(`  ${hex(addr)}: ${bytesToHex(bytes).padEnd(47)}  ${ascii}`);
  }
  console.log('');
  console.log(`  Byte immediately before ${hex(TABLE_BASE)}: ${hex(TABLE_BASE - 1)} = ${hexByte(rom[TABLE_BASE - 1])}`);
  console.log('  No obvious little-endian or big-endian length word appears immediately before the first clean entry.');
  console.log('  The first clean token record begins at 0x0A0806, with token 0x41, length 0x0C, text "1-Var Stats ".');
}

function printStrategySample(result) {
  console.log(`\n=== ${result.name}: ${result.description} ===`);
  console.log(`  Score: ${result.score}`);
  console.log(`  Entries parsed: ${result.entries.length}`);
  console.log(`  Avg readable bytes: ${(result.avgReadableRatio * 100).toFixed(1)}%`);
  console.log(`  Hint-bearing sample entries: ${result.hintEntryCount}`);
  console.log(`  Stop reason: ${result.stopReason}`);

  if (result.entries.length === 0) {
    console.log('  No sample entries could be parsed with this strategy.');
    return;
  }

  console.log('');
  console.log('  Idx | ROM Addr | Token | Len | Display');
  console.log('  ----|----------|-------|-----|--------');

  for (const entry of result.entries.slice(0, SAMPLE_ENTRY_COUNT)) {
    const tokenText = entry.token === null ? '--' : hexByte(entry.token);
    const lenText = hexByte(entry.length);
    console.log(
      `  ${String(entry.index).padStart(3)} | ${hex(entry.addr)} | ${tokenText.padEnd(5)} | ${lenText} | ${quoteDisplay(entry.displayText)}`
    );
  }
}

function selectBestStrategy(results) {
  const hybrid = results.find((result) => result.id === 'E');
  if (
    hybrid &&
    hybrid.entries.length >= 12 &&
    hybrid.hintEntryCount >= 4 &&
    hybrid.avgReadableRatio >= 0.8
  ) {
    return hybrid;
  }

  return [...results].sort((left, right) => right.score - left.score)[0];
}

function printFullTable(result) {
  const lastEntry = result.entries[result.entries.length - 1];
  const tableEnd = lastEntry ? lastEntry.addr + 2 + lastEntry.length - 1 : TABLE_BASE;

  console.log('\n=== Full Table Dump ===');
  console.log(`  Format: ${result.description}`);
  console.log(`  Total entries: ${result.entries.length}`);
  console.log(`  Address range: ${hex(TABLE_BASE)}-${hex(tableEnd)}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  console.log('');
  console.log('  Idx | ROM Addr | Token | Len | Display');
  console.log('  ----|----------|-------|-----|--------');

  for (const entry of result.entries) {
    console.log(
      `  ${String(entry.index).padStart(3)} | ${hex(entry.addr)} | ${hexByte(entry.token).padEnd(5)} | ${hexByte(entry.length)} | ${quoteDisplay(entry.displayText)}`
    );
  }

  console.log('\n=== Summary ===');
  console.log(`  Table start: ${hex(TABLE_BASE)}`);
  console.log(`  Table end:   ${hex(tableEnd)}`);
  console.log(`  Total entries found: ${result.entries.length}`);
  console.log(`  Table byte span: ${hex(tableEnd - TABLE_BASE + 1)}`);
  console.log(`  Parsing stop: ${result.stopReason}`);
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);

  console.log('Phase 287: 0x0A0806 Token Table Probe');
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)\n`);

  printHexWindow(rom, HEADER_WINDOW_START, HEADER_WINDOW_LENGTH);

  const strategyResults = [
    parseSequentialNullStrings(rom, TABLE_BASE, SAMPLE_ENTRY_COUNT),
    parseLengthPrefixedStrings(rom, TABLE_BASE, SAMPLE_ENTRY_COUNT),
    parseTokenNullStrings(rom, TABLE_BASE, SAMPLE_ENTRY_COUNT),
    parseFixedWidthEntries(rom, TABLE_BASE, SAMPLE_ENTRY_COUNT, FIXED_WIDTH),
    parseTokenLengthStrings(rom, TABLE_BASE, SAMPLE_ENTRY_COUNT, 'E', 'Strategy E'),
  ];

  for (const result of strategyResults) {
    printStrategySample(result);
  }

  const best = selectBestStrategy(strategyResults);
  const fullTable = parseTokenLengthStrings(rom, TABLE_BASE, FULL_ENTRY_LIMIT, 'E', 'Strategy E');

  console.log('\n=== Strategy Verdict ===');
  console.log(`  Best match: ${best.name}`);
  console.log(`  Reason: ${best.hintEntryCount} sample entries match expected STAT CALC names, and ${(best.avgReadableRatio * 100).toFixed(1)}% of sample bytes render as readable display text.`);
  if (best.id === 'E') {
    console.log('  The actual table format is a hybrid token table: (token byte, length byte, display bytes).');
  } else {
    console.log('  None of the requested A-D strategies fit cleanly; the hybrid token+length parser is used for the full dump below.');
  }

  printFullTable(fullTable);
}

main();
