#!/usr/bin/env node
// Dump 0x0a0909 (target of 0x09fb7d pointer table) to see if it's strings or code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function dumpRegion(addr, len) {
  console.log(`\n## 0x${addr.toString(16)} (${len} bytes)`);
  for (let i = 0; i < len; i += 16) {
    const row = Array.from(romBytes.slice(addr + i, addr + i + 16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(romBytes.slice(addr + i, addr + i + 16))
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    console.log(`${'0x' + (addr + i).toString(16).padStart(6, '0')}  ${row}  |${ascii}|`);
  }
}

dumpRegion(0x0a0909, 128);

// Also dump the first 30 entries of 0x09fb7d as 3-byte-stride 24-bit addresses
console.log('\n## 0x09fb7d as 3-byte-stride 24-bit address table (first 30 entries)');
for (let i = 0; i < 30; i += 1) {
  const off = 0x09fb7d + i * 3;
  const target = romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
  console.log(`  [${i}]  ${'0x' + off.toString(16)}  →  ${'0x' + target.toString(16)}`);
}

// Also try as 5-byte-stride entries (code + 3-byte addr + len?)
console.log('\n## 0x09fb7d as 5-byte-stride entries');
for (let i = 0; i < 20; i += 1) {
  const off = 0x09fb7d + i * 5;
  const bytes = Array.from(romBytes.slice(off, off + 5))
    .map((b) => '0x' + b.toString(16).padStart(2, '0'))
    .join(' ');
  console.log(`  [${i}]  ${'0x' + off.toString(16)}  ${bytes}`);
}
