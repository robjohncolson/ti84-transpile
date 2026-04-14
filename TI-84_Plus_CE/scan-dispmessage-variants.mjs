#!/usr/bin/env node
// Find all sites where LDIR (ed b0) is followed within 16 bytes by CALL 0x0a1cac (cd ac 1c 0a).
// Each match is a candidate DispMessage routine: takes string ptr in HL, copies to staging buffer, calls text loop.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

// Find all LDIR sites
const ldirSites = [];
for (let i = 0; i < rom.length - 1; i++) {
  if (rom[i] === 0xed && rom[i + 1] === 0xb0) {
    ldirSites.push(i);
  }
}
console.log(`LDIR sites: ${ldirSites.length}`);

// For each LDIR, check if CALL 0x0a1cac appears within 16 bytes
const candidates = [];
for (const ldir of ldirSites) {
  for (let i = ldir + 2; i <= ldir + 64; i++) {
    if (i + 3 < rom.length
        && rom[i] === 0xcd
        && rom[i + 1] === 0xac
        && rom[i + 2] === 0x1c
        && rom[i + 3] === 0x0a) {
      candidates.push({ ldir, call: i, distance: i - ldir });
      break;
    }
  }
}
console.log(`LDIR-then-CALL-0x0a1cac candidates: ${candidates.length}\n`);

// For each, walk back to find function start (RET = 0xc9 before, with 24 byte limit)
function findFunctionStart(addr) {
  for (let i = addr - 1; i > addr - 64; i--) {
    if (i < 0) return null;
    if (rom[i] === 0xc9) return i + 1; // function starts after RET
  }
  return null;
}

console.log('candidate (LDIR → CALL distance) | function start? | bytes around function start');
for (const c of candidates) {
  const start = findFunctionStart(c.ldir);
  let prologue = '';
  if (start) {
    for (let k = 0; k < 16; k++) prologue += hex2(rom[start + k]) + ' ';
  } else {
    prologue = '(no RET in window)';
  }
  console.log(`${hex(c.ldir)} → ${hex(c.call)} (d=${c.distance}) | start=${start ? hex(start) : '???'} | ${prologue}`);
}
