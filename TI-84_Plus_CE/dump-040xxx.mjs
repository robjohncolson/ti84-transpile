#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

const start = parseInt(process.argv[2] || '0x040000', 16);
const len = parseInt(process.argv[3] || '256', 10);
console.log(`=== ROM dump ${hex(start)} - ${hex(start+len)} ===`);
for (let row = 0; row < len / 16; row++) {
  const base = start + row * 16;
  let line = `${hex(base)}: `;
  for (let i = 0; i < 16; i++) line += hex2(rom[base + i]) + ' ';
  line += '| ';
  for (let i = 0; i < 16; i++) {
    const c = rom[base + i];
    line += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '.';
  }
  console.log(line);
}
