#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function formatBytes(start, end) {
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(rom[i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

function searchROM(pattern, label) {
  const results = [];

  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) results.push(i);
  }

  console.log(`\n=== ${label} (${results.length} matches) ===`);
  for (const addr of results) {
    const start = Math.max(0, addr - 32);
    const end = Math.min(rom.length, addr + pattern.length + 4);
    console.log(`  Found at ${hex(addr, 6)}`);
    console.log(`    Context (${hex(start, 6)}-${hex(end - 1, 6)}): ${formatBytes(start, end)}`);
  }

  return results;
}

const searches = [
  {
    label: 'CALL 0x09E30C (CD 0C E3 09)',
    pattern: [0xCD, 0x0C, 0xE3, 0x09],
  },
  {
    label: 'JP 0x09E30C (C3 0C E3 09)',
    pattern: [0xC3, 0x0C, 0xE3, 0x09],
  },
  {
    label: 'CALL 0x09E309 (CD 09 E3 09)',
    pattern: [0xCD, 0x09, 0xE3, 0x09],
  },
  {
    label: 'JP 0x09E309 (C3 09 E3 09)',
    pattern: [0xC3, 0x09, 0xE3, 0x09],
  },
  {
    label: 'CALL 0x09E2EC common mode change (CD EC E2 09)',
    pattern: [0xCD, 0xEC, 0xE2, 0x09],
  },
];

console.log(`ROM size: ${hex(rom.length, 6)} bytes`);
console.log('Context dumps include up to 32 bytes before each CALL/JP plus 4 bytes after it.');

const allResults = [];
for (const search of searches) {
  const results = searchROM(search.pattern, search.label);
  for (const addr of results) {
    allResults.push({ label: search.label, addr });
  }
}

console.log('\n=== Summary ===');
for (const result of allResults) {
  console.log(`  ${hex(result.addr, 6)}  ${result.label}`);
}
console.log(`Total references found: ${allResults.length}`);
