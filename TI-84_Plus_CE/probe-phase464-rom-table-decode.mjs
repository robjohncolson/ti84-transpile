#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

const TABLE_HEADER = 0x3B0000;
const TABLE_START = 0x3B0001;
const TABLE_SCAN_END = 0x3B1000;
const TABLE_END = 0x3C0000;
const SEARCH_SELECTORS = [0x0300, 0x0700, 0x0710, 0x0730];
const KNOWN_TYPES = new Map([
  [0x0330, 'product/calc string'],
  [0x0340, 'hardware revision?'],
  [0x0350, 'boot version?'],
  [0x0370, 'OS version?'],
  [0x0B00, 'ASCII label/locale?'],
  [0x0C00, 'device descriptor?'],
]);

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU8(offset) { return rom[offset] ?? 0; }
function readU16LE(offset) { return readU8(offset) | (readU8(offset + 1) << 8); }
function readU24LE(offset) { return readU8(offset) | (readU8(offset + 1) << 8) | (readU8(offset + 2) << 16); }
function ascii(offset, length) {
  return Array.from(rom.subarray(offset, Math.min(offset + length, rom.length)))
    .map((b) => (b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.'))
    .join('');
}
function bytesHex(offset, length) {
  return Array.from(rom.subarray(offset, Math.min(offset + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}
function hexdump(offset, length, rowSize = 16) {
  const lines = [];
  for (let row = 0; row < length; row += rowSize) {
    const addr = offset + row;
    const bytes = rom.subarray(addr, Math.min(addr + rowSize, offset + length));
    const hexPart = Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const asciiPart = Array.from(bytes, (b) => (b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${hex(addr, 6)}: ${hexPart.padEnd(47, ' ')} ${asciiPart}`);
  }
  return lines.join('\n');
}

function parseTable(start, end, limit = 32) {
  const fields = [];
  let cursor = start;
  while (cursor < end && fields.length < limit) {
    const byte0 = readU8(cursor);
    if (byte0 === 0xFF) {
      return { fields, sentinel: cursor };
    }
    const byte1 = readU8(cursor + 1);
    const sizeCode = byte1 & 0x0F;
    const type = (byte0 << 8) | (byte1 & 0xF0);
    let payload = cursor + 2;
    let size = sizeCode;
    let sizeBytes = 0;
    if (sizeCode === 0x0D) {
      size = readU8(payload);
      payload += 1;
      sizeBytes = 1;
    } else if (sizeCode === 0x0E) {
      size = (readU8(payload) << 8) | readU8(payload + 1);
      payload += 2;
      sizeBytes = 2;
    } else if (sizeCode === 0x0F) {
      size = (readU8(payload) << 16) | (readU8(payload + 1) << 8) | readU8(payload + 2);
      payload += 3;
      sizeBytes = 3;
    }
    const next = payload + size;
    if (next <= cursor || next > end) {
      return { fields, sentinel: null, invalidAt: cursor };
    }
    fields.push({ addr: cursor, type, sizeCode, sizeBytes, size, payload, next });
    cursor = next;
  }
  return { fields, sentinel: null };
}

function findBytes(start, end, needle) {
  const hits = [];
  for (let offset = start; offset <= end - needle.length; offset += 1) {
    let match = true;
    for (let i = 0; i < needle.length; i += 1) {
      if (readU8(offset + i) !== needle[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(offset);
  }
  return hits;
}

function summarizeHits(hits, width = 6) {
  return hits.length ? hits.map((addr) => hex(addr, width)).join(', ') : '(none)';
}

function typeLabel(type) {
  return KNOWN_TYPES.get(type) ?? 'unknown';
}

function mmioClues(fields) {
  const clues = [];
  for (const field of fields) {
    for (let i = 0; i + 1 < field.size; i += 1) {
      const value16 = readU16LE(field.payload + i);
      if (value16 >= 0xD000 && value16 <= 0xD3FF) clues.push(`${hex(field.addr, 6)}+${i}:16=${hex(value16, 4)}`);
    }
    for (let i = 0; i + 2 < field.size; i += 1) {
      const value24 = readU24LE(field.payload + i);
      if (value24 >= 0xD00000 && value24 <= 0xD3FFFF) clues.push(`${hex(field.addr, 6)}+${i}:24=${hex(value24, 6)}`);
    }
  }
  return clues;
}

const parsed = parseTable(TABLE_START, TABLE_END);
const le0F13 = findBytes(TABLE_START, TABLE_SCAN_END, [0x13, 0x0F]);
const be0F13 = findBytes(TABLE_START, TABLE_SCAN_END, [0x0F, 0x13]);
const le000F13 = findBytes(TABLE_START, TABLE_SCAN_END, [0x13, 0x0F, 0x00]);
const clues = mmioClues(parsed.fields);

console.log('=== Phase 464 ROM Table Decode ===\n');
console.log(`ROM size: ${hex(rom.length, 6)} bytes`);
console.log(`Byte at ${hex(TABLE_HEADER, 6)} (before table start): ${hex(readU8(TABLE_HEADER))}`);
console.log(`U16LE at ${hex(TABLE_HEADER, 6)}: ${hex(readU16LE(TABLE_HEADER), 4)}`);
console.log(`U24LE at ${hex(TABLE_HEADER, 6)}: ${hex(readU24LE(TABLE_HEADER), 6)}`);
console.log('\n=== First 256 Bytes at 0x3B0001 ===');
console.log(hexdump(TABLE_START, 0x100));

console.log('\n=== Best-Guess Format ===');
if (parsed.fields.length && parsed.sentinel !== null) {
  console.log('TLV-like certificate table: [type_hi][type_lo_nibble|size_code][optional size bytes][payload], terminated by 0xFF.');
  console.log('Type is 12 bits: first byte = high 8 bits, high nibble of second byte = low 4 bits; low nibble of second byte encodes payload length format.');
} else {
  console.log('No clean TLV parse reached a 0xFF terminator; inspect raw bytes manually.');
}

console.log('\n=== Parsed Entries ===');
for (const field of parsed.fields) {
  const preview = bytesHex(field.payload, Math.min(field.size, 16));
  const text = ascii(field.payload, Math.min(field.size, 24));
  console.log(
    `${hex(field.addr, 6)} type=${hex(field.type, 4)} ${typeLabel(field.type)} size=${field.size} ` +
    `sizeCode=${hex(field.sizeCode)} payload=${hex(field.payload, 6)} next=${hex(field.next, 6)}`,
  );
  console.log(`  bytes: ${preview || '(empty)'}`);
  console.log(`  ascii: ${text || '(empty)'}`);
}
console.log(`Sentinel: ${parsed.sentinel !== null ? hex(parsed.sentinel, 6) : parsed.invalidAt !== undefined ? `invalid at ${hex(parsed.invalidAt, 6)}` : '(not found)'}`);

console.log('\n=== DE Search Stage Checks ===');
for (const selector of SEARCH_SELECTORS) {
  const exact = parsed.fields.filter((field) => field.type === selector);
  const sameHighByte = parsed.fields.filter((field) => (field.type & 0xFF00) === (selector & 0xFF00)).map((field) => hex(field.type, 4));
  console.log(`${hex(selector, 4)} exact matches: ${exact.length ? exact.map((field) => hex(field.addr, 6)).join(', ') : '(none)'}`);
  console.log(`  same high-byte family: ${sameHighByte.length ? sameHighByte.join(', ') : '(none)'}`);
}

console.log('\n=== 0x0F13 Search in 0x3B0001-0x3B1000 ===');
console.log(`16-bit little-endian 13 0F: ${summarizeHits(le0F13)}`);
console.log(`16-bit big-endian 0F 13: ${summarizeHits(be0F13)}`);
console.log(`24-bit little-endian 13 0F 00 (BC=0x000F13): ${summarizeHits(le000F13)}`);

console.log('\n=== Device / Port Clues ===');
console.log(`Field IDs present: ${parsed.fields.map((field) => hex(field.type, 4)).join(', ')}`);
console.log(`Possible MMIO-like values in payloads: ${clues.length ? clues.join(', ') : '(none)'}`);
console.log('Notable payloads:');
for (const field of parsed.fields) {
  if (field.type === 0x0330 || field.type === 0x0B00 || field.type === 0x0C00 || field.type === 0x0370) {
    console.log(`  ${hex(field.type, 4)} @ ${hex(field.addr, 6)} -> ${bytesHex(field.payload, field.size)} | ${ascii(field.payload, field.size)}`);
  }
}
