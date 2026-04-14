#!/usr/bin/env node
// Phase 42 — find all dispatchers that test (0xd007e0) == specific value.
// Pattern: LD A, (0xd007e0) ; CP value ; JP/JR Z, target
// Bytes: 3a e0 07 d0  fe XX  ca/c2/28/20 yy yy yy

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => (v & 0xff).toString(16).padStart(2, '0');

const LD_A_D007E0 = [0x3a, 0xe0, 0x07, 0xd0];
const sites = [];

for (let i = 0; i < rom.length - 16; i++) {
  let match = true;
  for (let j = 0; j < 4; j++) {
    if (rom[i + j] !== LD_A_D007E0[j]) { match = false; break; }
  }
  if (!match) continue;
  sites.push(i);
}

console.log(`Found ${sites.length} 'LD A, (0xd007e0)' sites\n`);

// For each site, decode the next ~30 bytes as a switch
// Look for: CP imm; JP/JR Z, target ; ... repeated
let dispatchTables = 0;
for (const site of sites) {
  // Skip 4 bytes (the LD A,(nnnnnn))
  let pc = site + 4;
  const cases = [];
  let safety = 0;
  while (safety++ < 20) {
    const b = rom[pc];
    if (b === 0xfe) {
      // CP n
      const val = rom[pc + 1];
      // Next instruction should be JP Z, JR Z, JP NZ, JR NZ
      const op = rom[pc + 2];
      let target = null, branchType = null, branchLen = 0;
      if (op === 0xca) { // JP Z, nnnnnn
        target = rom[pc+3] | (rom[pc+4]<<8) | (rom[pc+5]<<16);
        branchType = 'jpz';
        branchLen = 6;
      } else if (op === 0x28) { // JR Z, e
        const off = rom[pc+3];
        const signed = off > 127 ? off - 256 : off;
        target = pc + 4 + signed;
        branchType = 'jrz';
        branchLen = 4;
      } else if (op === 0xc2) { // JP NZ
        target = rom[pc+3] | (rom[pc+4]<<8) | (rom[pc+5]<<16);
        branchType = 'jpnz';
        branchLen = 6;
      } else if (op === 0x20) { // JR NZ
        const off = rom[pc+3];
        const signed = off > 127 ? off - 256 : off;
        target = pc + 4 + signed;
        branchType = 'jrnz';
        branchLen = 4;
      } else {
        break;
      }
      cases.push({ value: val, target, branchType });
      pc += branchLen;
    } else {
      break;
    }
  }
  if (cases.length >= 1) {
    dispatchTables++;
    console.log(`${hex(site)}: ${cases.length} case(s):`);
    for (const c of cases) {
      console.log(`  cp 0x${hex2(c.value)} ${c.branchType} ${hex(c.target)}`);
    }
  }
}
console.log(`\n${dispatchTables} sites have dispatch tables`);

// Specifically look for value 0x40 dispatches
console.log('\n=== sites that branch on (0xd007e0) == 0x40 ===');
for (const site of sites) {
  for (let pc = site + 4; pc < site + 60; pc++) {
    if (rom[pc] === 0xfe && rom[pc + 1] === 0x40) {
      const op = rom[pc + 2];
      let target = null, branchType = null;
      if (op === 0xca) {
        target = rom[pc+3] | (rom[pc+4]<<8) | (rom[pc+5]<<16);
        branchType = 'jp z,';
      } else if (op === 0x28) {
        const off = rom[pc+3];
        const signed = off > 127 ? off - 256 : off;
        target = pc + 4 + signed;
        branchType = 'jr z,';
      } else if (op === 0xc2) {
        target = rom[pc+3] | (rom[pc+4]<<8) | (rom[pc+5]<<16);
        branchType = 'jp nz,';
      } else if (op === 0x20) {
        const off = rom[pc+3];
        const signed = off > 127 ? off - 256 : off;
        target = pc + 4 + signed;
        branchType = 'jr nz,';
      }
      if (target !== null) {
        console.log(`${hex(site)} -> dispatch at ${hex(pc)} ${branchType} ${hex(target)}`);
      }
      break;
    }
  }
}
