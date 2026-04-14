#!/usr/bin/env node
// Find raw 24-bit pointer references to a target address (anywhere in ROM, regardless of opcode).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const targets = process.argv.slice(2).map(s => parseInt(s, 16));
if (targets.length === 0) {
  console.error('Usage: scan-ptr-refs.mjs 0x09ec0e [0x09ec4b ...]');
  process.exit(1);
}

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

for (const target of targets) {
  const lo = target & 0xff;
  const mid = (target >> 8) & 0xff;
  const hi = (target >> 16) & 0xff;

  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      hits.push(i);
    }
  }

  console.log(`${hex(target)}: ${hits.length} pointer references`);
  for (const h of hits.slice(0, 20)) {
    let ctx = '';
    for (let k = -4; k <= 6; k++) {
      const a = h + k;
      if (a >= 0 && a < rom.length) ctx += hex2(rom[a]) + ' ';
    }
    console.log(`  ${hex(h)}: ${ctx}`);
  }
}
