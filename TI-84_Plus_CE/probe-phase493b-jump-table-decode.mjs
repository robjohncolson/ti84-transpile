#!/usr/bin/env node
/**
 * Phase 493b — Decode the JP table at ~0x020Dxx containing 0x061003
 *
 * The context bytes around 0x020E05 show consecutive C3 xx xx xx (JP addr) entries.
 * This is a classic indirect dispatch table. Decode all entries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// Scan backwards from 0x020E04 to find the start of the JP table
// Each entry is C3 xx xx xx (4 bytes)
let tableStart = 0x020E04;
while (tableStart >= 4 && rom[tableStart - 4] === 0xC3) {
  const addr = read24(tableStart - 3);
  if (addr < 0x400000) {
    tableStart -= 4;
  } else {
    break;
  }
}

// Scan forward to find the end
let tableEnd = 0x020E04;
while (tableEnd + 4 < rom.length && rom[tableEnd] === 0xC3) {
  const addr = read24(tableEnd + 1);
  if (addr < 0x400000) {
    tableEnd += 4;
  } else {
    break;
  }
}

console.log(`=== JP Table at ${hex(tableStart)} - ${hex(tableEnd - 1)} ===`);
console.log(`Entries: ${(tableEnd - tableStart) / 4}\n`);

const knownAddrs = {
  0x061000: 'cursor_erase_entry',
  0x061003: 'cursor_erase_body',
  0x06029D: 'screen_init',
};

for (let i = tableStart; i < tableEnd; i += 4) {
  const idx = (i - tableStart) / 4;
  const addr = read24(i + 1);
  const known = knownAddrs[addr] || '';
  const inCursorRange = addr >= 0x060000 && addr <= 0x062000;
  const marker = inCursorRange ? ' *** CURSOR/DISPLAY RANGE ***' : '';
  const knownMarker = known ? ` <<< ${known}` : '';
  console.log(`  [${idx.toString().padStart(3)}] ${hex(i)} -> JP ${hex(addr)}${marker}${knownMarker}`);
}

// Now look for what references this table
// Typical pattern: compute index, then JP (HL) or JP (IX+d) after loading from table
console.log('\n=== Cross-referencing table base address ===');
console.log(`Table starts at ${hex(tableStart)}`);

// Search for LD instructions pointing to tableStart
const b0 = tableStart & 0xFF;
const b1 = (tableStart >> 8) & 0xFF;
const b2 = (tableStart >> 16) & 0xFF;

console.log(`Searching for references to ${hex(tableStart)} [${[b0,b1,b2].map(b => b.toString(16).padStart(2,'0')).join(' ')}]...`);

for (let i = 0; i < rom.length - 4; i++) {
  const val = read24(i);
  if (val === tableStart) {
    // Check if preceded by a LD opcode
    const prevByte = i > 0 ? rom[i - 1] : 0;
    const context = [];
    const start = Math.max(0, i - 8);
    const end = Math.min(rom.length, i + 8);
    for (let j = start; j < end; j++) {
      context.push(rom[j].toString(16).padStart(2, '0'));
    }
    console.log(`  Found at ${hex(i)}, prev byte: ${hex(prevByte, 2)}, context: ${context.join(' ')}`);
  }
}

// Also check what's immediately before the table
console.log(`\n=== Bytes before table (${hex(tableStart - 32)} to ${hex(tableStart - 1)}) ===`);
const preBytes = [];
for (let i = Math.max(0, tableStart - 32); i < tableStart; i++) {
  preBytes.push(rom[i].toString(16).padStart(2, '0'));
}
console.log(preBytes.join(' '));

// Also check what CALL references the cursor-range addresses in this table
console.log('\n=== All 0x06xxxx targets in this JP table ===');
const cursorTargets = [];
for (let i = tableStart; i < tableEnd; i += 4) {
  const addr = read24(i + 1);
  if (addr >= 0x060000 && addr <= 0x06FFFF) {
    cursorTargets.push({ tableOffset: i, addr, idx: (i - tableStart) / 4 });
  }
}

for (const t of cursorTargets) {
  console.log(`\n  Table[${t.idx}] -> ${hex(t.addr)}`);
  // Search for CALL/JP to this address
  const tb0 = t.addr & 0xFF;
  const tb1 = (t.addr >> 8) & 0xFF;
  const tb2 = (t.addr >> 16) & 0xFF;
  let refs = 0;
  for (let i = 0; i < rom.length - 4; i++) {
    if ((rom[i] === 0xCD || rom[i] === 0xC3) && rom[i+1] === tb0 && rom[i+2] === tb1 && rom[i+3] === tb2) {
      const instr = rom[i] === 0xCD ? 'CALL' : 'JP';
      if (refs < 5) console.log(`    ${instr} ${hex(t.addr)} at ${hex(i)}`);
      refs++;
    }
  }
  if (refs > 5) console.log(`    ... +${refs - 5} more`);
  if (refs === 0) console.log(`    NO direct CALL/JP references — likely only via table dispatch`);
}

console.log('\n=== Phase 493b complete ===');
