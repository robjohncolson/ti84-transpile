#!/usr/bin/env node
// Generic ROM caller scanner — finds CALL/JP refs to a target address.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const target = parseInt(process.argv[2] || '0x0a2d80', 16);
const lo = target & 0xff;
const mid = (target >> 8) & 0xff;
const hi = (target >> 16) & 0xff;

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

console.log(`Searching for callers of ${hex(target)}\n`);

const opcodes = [
  { byte: 0xcd, name: 'call' },
  { byte: 0xc3, name: 'jp' },
  { byte: 0xca, name: 'jp z,' },
  { byte: 0xc2, name: 'jp nz,' },
  { byte: 0xda, name: 'jp c,' },
  { byte: 0xd2, name: 'jp nc,' },
  { byte: 0xfa, name: 'jp m,' },
  { byte: 0xf2, name: 'jp p,' },
  { byte: 0xea, name: 'jp pe,' },
  { byte: 0xe2, name: 'jp po,' },
  { byte: 0xcc, name: 'call z,' },
  { byte: 0xc4, name: 'call nz,' },
  { byte: 0xdc, name: 'call c,' },
  { byte: 0xd4, name: 'call nc,' },
];

let total = 0;
for (const { byte, name } of opcodes) {
  const hits = [];
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i] === byte && rom[i+1] === lo && rom[i+2] === mid && rom[i+3] === hi) {
      hits.push(i);
    }
  }
  if (hits.length === 0) continue;
  console.log(`=== ${name} ${hex(target)} (${hits.length}) ===`);
  for (const addr of hits.slice(0, 30)) {
    let context = '';
    for (let k = -2; k <= 6; k++) {
      const a = addr + k;
      if (a >= 0 && a < rom.length) context += hex2(rom[a]) + ' ';
    }
    console.log(`  ${hex(addr)}: ${context}`);
  }
  if (hits.length > 30) console.log(`  ... (${hits.length - 30} more)`);
  total += hits.length;
}
console.log(`\ntotal callers: ${total}`);
