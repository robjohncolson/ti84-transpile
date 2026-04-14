#!/usr/bin/env node
// Phase 43 — decode OS jump table + scan for "Done\0" + ClrLCD callers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

const JT_BASE = 0x020104;
const JT_COUNT = 980;

console.log('=== OS jump table slots 0-50 ===');
for (let i = 0; i < 50; i++) {
  const off = JT_BASE + i * 4;
  const op = rom[off];
  const target = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
  console.log(`slot ${i.toString().padStart(3)} @ ${hex(off)}: opcode ${op.toString(16).padStart(2, '0')} -> ${hex(target)}`);
}

console.log('\n=== Slots with target in 0x002000-0x010000 (low OS, common bcalls) ===');
for (let i = 0; i < JT_COUNT; i++) {
  const off = JT_BASE + i * 4;
  const target = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
  if (target >= 0x002000 && target < 0x010000) {
    console.log(`slot ${i.toString().padStart(3)}: ${hex(target)}`);
  }
}

console.log('\n=== "Done\\0" string occurrences ===');
const doneBytes = [0x44, 0x6f, 0x6e, 0x65, 0x00];
const doneHits = [];
for (let i = 0; i < rom.length - 5; i++) {
  let m = true;
  for (let j = 0; j < 5; j++) if (rom[i + j] !== doneBytes[j]) { m = false; break; }
  if (m) doneHits.push(i);
}
console.log(`Hits: ${doneHits.length}`);
for (const addr of doneHits.slice(0, 30)) console.log(`  ${hex(addr)}`);

console.log('\n=== Cross-references (LD HL, <Done_addr>) ===');
for (const doneAddr of doneHits) {
  const lo = doneAddr & 0xff;
  const mid = (doneAddr >> 8) & 0xff;
  const hi = (doneAddr >> 16) & 0xff;
  // 21 lo mid hi = LD HL, <doneAddr>
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i] === 0x21 && rom[i+1] === lo && rom[i+2] === mid && rom[i+3] === hi) {
      console.log(`  LD HL, ${hex(doneAddr)} at ${hex(i)}`);
    }
  }
}

console.log('\n=== "M" + cursor sequences (home screen prompt) ===');
// On TI-84 home screen, the prompt is just "<cursor>" — there's no title.
// But the home screen might check if (0xd00580) cursor x is at column 0.

console.log('\n=== "MAIN MENU" string occurrences ===');
const mainBytes = [0x4D, 0x41, 0x49, 0x4E, 0x20, 0x4D, 0x45, 0x4E, 0x55];
let mainHits = 0;
for (let i = 0; i < rom.length - 9; i++) {
  let m = true;
  for (let j = 0; j < 9; j++) if (rom[i + j] !== mainBytes[j]) { m = false; break; }
  if (m) {
    console.log(`  ${hex(i)}`);
    mainHits++;
  }
}
console.log(`Hits: ${mainHits}`);

console.log('\n=== "ERR:" string occurrences (error screen anchor) ===');
const errBytes = [0x45, 0x52, 0x52, 0x3a];
let errHits = 0;
for (let i = 0; i < rom.length - 4; i++) {
  let m = true;
  for (let j = 0; j < 4; j++) if (rom[i + j] !== errBytes[j]) { m = false; break; }
  if (m) {
    if (errHits < 10) console.log(`  ${hex(i)}`);
    errHits++;
  }
}
console.log(`Total ERR: hits: ${errHits}`);
