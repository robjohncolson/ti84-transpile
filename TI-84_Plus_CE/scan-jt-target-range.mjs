#!/usr/bin/env node
// Find jump-table slots whose target falls in a given range.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const lo = parseInt(process.argv[2] || '0x089000', 16);
const hi = parseInt(process.argv[3] || '0x089300', 16);
const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

const JT_BASE = 0x020104;
const JT_COUNT = 980;
console.log(`Slots with target in ${hex(lo)}-${hex(hi)}:`);
let n = 0;
for (let i = 0; i < JT_COUNT; i++) {
  const off = JT_BASE + i * 4;
  const target = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
  if (target >= lo && target < hi) {
    console.log(`  slot ${i}: ${hex(target)}`);
    n++;
  }
}
console.log(`total: ${n}`);
