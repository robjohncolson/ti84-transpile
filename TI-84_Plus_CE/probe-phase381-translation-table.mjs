#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const SCANCODE_TRANSLATE_PATH = path.join(__dirname, 'scancode-translate.js');

const TABLE_BASE = 0x09F79B;
const DUMP_LENGTH = 0x40;
const OS_SCAN_MIN = 0x01;
const OS_SCAN_MAX = 0x38;

const ENTER_CANDIDATES = new Set([0x05, 0x09]);
const CLEAR_CANDIDATES = new Set([0x09, 0x0F]);

const KNOWN_KEYS = [
  { name: 'GRAPH', osScanCode: 0x01, group: 6, bit: 0 },
  { name: 'Y=', osScanCode: 0x05, group: 6, bit: 4 },
  { name: '2ND', osScanCode: 0x06, group: 6, bit: 5 },
  { name: 'DEL', osScanCode: 0x08, group: 6, bit: 7 },
  { name: 'ALPHA', osScanCode: 0x10, group: 5, bit: 7 },
  { name: '0', osScanCode: 0x11, group: 4, bit: 0 },
  { name: '1', osScanCode: 0x12, group: 4, bit: 1 },
  { name: 'ENTER', osScanCode: 0x29, group: 1, bit: 0 },
  { name: 'CLEAR', osScanCode: 0x2F, group: 1, bit: 6 },
];

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatPrintable(value) {
  if (value >= 0x20 && value <= 0x7E) {
    return `'${String.fromCharCode(value)}'`;
  }
  return null;
}

function describeKeyCode(value) {
  const notes = [];
  if (value === 0x00) {
    notes.push('none');
  }
  if (value === 0x05) {
    notes.push('kEnter?');
  }
  if (value === 0x09) {
    notes.push('kClear?');
  }
  if (value === 0x0A) {
    notes.push('kDel?');
  }
  const printable = formatPrintable(value);
  if (printable) {
    notes.push(printable);
  }
  return notes.join(', ');
}

function formatCode(value) {
  const note = describeKeyCode(value);
  return note ? `${hex(value)} ${note}` : hex(value);
}

function matrixSlot(group, bit) {
  return group * 8 + bit + 1;
}

function readOptionalText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function inspectScancodeTranslate(text) {
  if (!text) {
    return null;
  }

  const usageLine = text.match(/\/\/\s*Usage:\s*(.+)/)?.[1] ?? null;
  const scanCodeLine = text.match(/\/\/\s*scanCode:\s*(.+)/)?.[1] ?? null;
  const sectionComments = [...text.matchAll(/\/\/\s*Section\s+\d+:\s+(.+)/g)].map((match) => match[1]);

  return { usageLine, scanCodeLine, sectionComments };
}

function printTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const render = (row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ');

  console.log(render(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(render(row));
  }
}

function dumpHexWindow(bytes) {
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.subarray(offset, offset + 16);
    const hexBytes = Array.from(slice, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`${hex(offset)} (ROM ${hex(TABLE_BASE + offset, 6)}): ${hexBytes}`);
  }
}

const rom = readFileSync(ROM_PATH);
if (rom.length < TABLE_BASE + DUMP_LENGTH) {
  throw new Error(
    `ROM is too small: expected at least ${hex(TABLE_BASE + DUMP_LENGTH, 8)}, got ${hex(rom.length, 8)}`,
  );
}

const tableWindow = rom.subarray(TABLE_BASE, TABLE_BASE + DUMP_LENGTH);
const scancodeTranslateInfo = inspectScancodeTranslate(readOptionalText(SCANCODE_TRANSLATE_PATH));

console.log('=== Phase 381 Translation Table Probe ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(rom.length, 8)} (${rom.length.toLocaleString('en-US')} bytes)`);
console.log(`Table base: ${hex(TABLE_BASE, 6)}`);
console.log(`Direct probe window: table[0x00..0x3F] (${DUMP_LENGTH} bytes)`);

if (scancodeTranslateInfo) {
  console.log('\n=== scancode-translate.js Notes ===');
  if (scancodeTranslateInfo.usageLine) {
    console.log(`Usage: ${scancodeTranslateInfo.usageLine}`);
  }
  if (scancodeTranslateInfo.scanCodeLine) {
    console.log(`Commented scan-code range: ${scancodeTranslateInfo.scanCodeLine}`);
  }
  if (scancodeTranslateInfo.sectionComments.length > 0) {
    console.log('Sections:');
    for (const sectionComment of scancodeTranslateInfo.sectionComments) {
      console.log(`  - ${sectionComment}`);
    }
  }
  console.log(
    `Raw ROM byte at table[0x38]: ${formatCode(tableWindow[0x38])} (useful because the generated JS comments stop at 0x37).`,
  );
}

console.log('\n=== First 64 Bytes (table[0x00..0x3F]) ===');
dumpHexWindow(tableWindow);

const knownRows = KNOWN_KEYS.map((key) => {
  const directValue = tableWindow[key.osScanCode];
  const forwardMatrixSlot = matrixSlot(key.group, key.bit);
  const forwardValue = tableWindow[forwardMatrixSlot];

  return [
    key.name,
    hex(key.osScanCode),
    formatCode(directValue),
    hex(forwardMatrixSlot),
    formatCode(forwardValue),
  ];
});

console.log('\n=== Known Keys ===');
console.log('Direct lookup is table[osScanCode]. Forward slot is group*8+bit+1, shown to expose numbering mismatches.');
printTable(
  ['Key', 'OS scan', 'table[OS]', 'forward slot', 'table[forward]'],
  knownRows,
);

const enterValue = tableWindow[0x29];
const clearValue = tableWindow[0x2F];

console.log('\n=== Verdicts ===');
console.log(
  `Does table[0x29] map ENTER to a reasonable kEnter value? ${ENTER_CANDIDATES.has(enterValue) ? 'PASS' : 'FAIL'} (${formatCode(enterValue)}; candidates: 0x05, 0x09)`,
);
console.log(
  `Does table[0x2F] map CLEAR to a reasonable kClear value? ${CLEAR_CANDIDATES.has(clearValue) ? 'PASS' : 'FAIL'} (${formatCode(clearValue)}; candidates: 0x09, 0x0F)`,
);

const fullRows = [];
for (let scanCode = OS_SCAN_MIN; scanCode <= OS_SCAN_MAX; scanCode += 1) {
  fullRows.push([
    hex(scanCode),
    formatCode(tableWindow[scanCode]),
  ]);
}

console.log('\n=== Direct ROM Window Mapping ===');
printTable(['OS_scancode', 'TI_BASIC_keycode'], fullRows);
