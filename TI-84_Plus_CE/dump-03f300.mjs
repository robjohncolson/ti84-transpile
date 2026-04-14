#!/usr/bin/env node
// Dump ROM bytes around 0x03f300 to find function structure
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

function dumpRange(start, end) {
  for (let i = start; i < end; i += 16) {
    let line = `${hex(i)}:`;
    for (let j = 0; j < 16 && i + j < end; j++) {
      line += ' ' + hex2(rom[i + j]);
    }
    console.log(line);
  }
}

console.log('=== bytes around 0x03f300 (probable function start) ===');
dumpRange(0x03f2e0, 0x03f380);
console.log('\n=== bytes around 0x03f316 (LD HL/CALL site) ===');
dumpRange(0x03f300, 0x03f360);

console.log('\n=== look for RET (c9) before 0x03f300 ===');
for (let i = 0x03f300 - 1; i > 0x03f200; i--) {
  if (rom[i] === 0xc9) {
    console.log(`  RET at ${hex(i)} — function probably starts at ${hex(i + 1)}`);
    break;
  }
}
