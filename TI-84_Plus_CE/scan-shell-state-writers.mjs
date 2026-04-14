#!/usr/bin/env node
// Phase 42 — scan ROM for writers to 0xd007e0 (menu mode) and 0xd02ad7 (callback)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => `${(v & 0xff).toString(16).padStart(2, '0')}`;

function scanFor(targetBytes, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Searching for byte pattern: ${targetBytes.map(hex2).join(' ')}`);
  let count = 0;
  const hits = [];
  for (let i = 0; i < rom.length - targetBytes.length; i++) {
    let match = true;
    for (let j = 0; j < targetBytes.length; j++) {
      if (rom[i + j] !== targetBytes[j]) { match = false; break; }
    }
    if (match) {
      count++;
      hits.push(i);
    }
  }
  console.log(`Hits: ${count}`);
  for (const addr of hits.slice(0, 60)) {
    let context = '';
    for (let k = -2; k <= targetBytes.length + 4; k++) {
      const a = addr + k;
      if (a >= 0 && a < rom.length) context += hex2(rom[a]) + ' ';
    }
    console.log(`  ${hex(addr)}: ${context}`);
  }
  if (count > 60) console.log(`  ... (${count - 60} more)`);
  return hits;
}

// LD (nnnnnn), A — opcode 0x32
scanFor([0x32, 0xe0, 0x07, 0xd0], 'LD (0xd007e0), A');
// LD (nnnnnn), HL — opcode 0x22
scanFor([0x22, 0xe0, 0x07, 0xd0], 'LD (0xd007e0), HL');
// LD (nnnnnn), HL targeting 0xd02ad7
scanFor([0x22, 0xd7, 0x2a, 0xd0], 'LD (0xd02ad7), HL');
// LD (nnnnnn), DE — opcode ED 53
scanFor([0xed, 0x53, 0xd7, 0x2a, 0xd0], 'LD (0xd02ad7), DE');
// LD (nnnnnn), BC — opcode ED 43
scanFor([0xed, 0x43, 0xd7, 0x2a, 0xd0], 'LD (0xd02ad7), BC');
// LD (nnnnnn), A targeting 0xd02ad7
scanFor([0x32, 0xd7, 0x2a, 0xd0], 'LD (0xd02ad7), A');
