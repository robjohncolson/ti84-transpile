#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function read24LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

console.log('=== Phase 367 — IX Caller Investigation ===\n');

// 1. Find all CALL/JP to 0x00BC31 and 0x00BC47 in ROM
const targets = [0x00BC31, 0x00BC47];
const callers = [];

for (let i = 0; i < rom.length - 3; i++) {
  const opcode = rom[i];
  // CALL nn (0xCD), JP nn (0xC3)
  if (opcode === 0xCD || opcode === 0xC3) {
    const addr = read24LE(rom, i + 1);
    if (targets.includes(addr)) {
      callers.push({ offset: i, opcode: opcode === 0xCD ? 'CALL' : 'JP', target: addr });
    }
  }
  // Conditional CALL cc,nn: C4(NZ), CC(Z), D4(NC), DC(C), E4(PO), EC(PE), F4(P), FC(M)
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(opcode)) {
    const addr = read24LE(rom, i + 1);
    if (targets.includes(addr)) {
      callers.push({ offset: i, opcode: `CALL cc(${hex(opcode,2)})`, target: addr });
    }
  }
  // Conditional JP cc,nn: C2(NZ), CA(Z), D2(NC), DA(C), E2(PO), EA(PE), F2(P), FA(M)
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode)) {
    const addr = read24LE(rom, i + 1);
    if (targets.includes(addr)) {
      callers.push({ offset: i, opcode: `JP cc(${hex(opcode,2)})`, target: addr });
    }
  }
}

console.log(`Found ${callers.length} callers of 0x00BC31/0x00BC47:\n`);

for (const c of callers) {
  console.log(`  ${hex(c.offset)}: ${c.opcode} ${hex(c.target)}`);

  // Look for LD IX,nn in the 40 bytes before
  const searchStart = Math.max(0, c.offset - 40);
  for (let j = searchStart; j < c.offset; j++) {
    // DD 21 = LD IX,nn (followed by 2 or 3 byte immediate)
    if (rom[j] === 0xDD && rom[j+1] === 0x21) {
      const ixVal = read24LE(rom, j + 2);
      console.log(`    -> LD IX,${hex(ixVal)} at ${hex(j)}`);
    }
  }

  // Hex dump 20 bytes before the call
  const dumpStart = Math.max(0, c.offset - 20);
  const dumpBytes = [];
  for (let j = dumpStart; j < c.offset + 4; j++) {
    dumpBytes.push(rom[j].toString(16).padStart(2, '0'));
  }
  console.log(`    hex[${hex(dumpStart)}..${hex(c.offset+3)}]: ${dumpBytes.join(' ')}`);
  console.log();
}

// 2. Find all occurrences of literal 0xD140B3 in ROM (LE: B3 40 D1)
console.log('\nSearching for literal 0xD140B3 (LE: B3 40 D1) in ROM:\n');
const literalHits = [];
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === 0xB3 && rom[i+1] === 0x40 && rom[i+2] === 0xD1) {
    literalHits.push(i);
    // Show surrounding context
    const ctxStart = Math.max(0, i - 5);
    const ctxEnd = Math.min(rom.length, i + 8);
    const ctx = [];
    for (let j = ctxStart; j < ctxEnd; j++) {
      ctx.push(rom[j].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(i)}: ...${ctx.join(' ')}...`);
    // Check if preceded by LD IX,nn (DD 21)
    if (i >= 2 && rom[i-2] === 0xDD && rom[i-1] === 0x21) {
      console.log(`    ^ This is LD IX,0xD140B3`);
    }
    // Check if preceded by LD HL,nn (21)
    if (i >= 1 && rom[i-1] === 0x21) {
      console.log(`    ^ This is LD HL,0xD140B3`);
    }
    // Check if preceded by LD BC,nn (01)
    if (i >= 1 && rom[i-1] === 0x01) {
      console.log(`    ^ This is LD BC,0xD140B3`);
    }
  }
}
console.log(`\nTotal literal hits: ${literalHits.length}`);

// 3. Also check for 0xD14095 (IX-30 when IX=0xD140B3) — LE: 95 40 D1
console.log('\nSearching for literal 0xD14095 (LE: 95 40 D1) in ROM:\n');
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === 0x95 && rom[i+1] === 0x40 && rom[i+2] === 0xD1) {
    const ctxStart = Math.max(0, i - 5);
    const ctxEnd = Math.min(rom.length, i + 8);
    const ctx = [];
    for (let j = ctxStart; j < ctxEnd; j++) {
      ctx.push(rom[j].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(i)}: ...${ctx.join(' ')}...`);
  }
}

console.log('\nDone.');
