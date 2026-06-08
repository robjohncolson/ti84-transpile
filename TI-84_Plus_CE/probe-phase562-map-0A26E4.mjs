#!/usr/bin/env node
/**
 * probe-phase562-map-0A26E4.mjs
 * Map the ROM glyph property table at 0x0A26E4.
 * Read-only ROM analysis — no CPU execution needed.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const romPath = resolve(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

function hexDump(buf, baseAddr, length) {
  const lines = [];
  for (let i = 0; i < length; i += 16) {
    const addr = (baseAddr + i).toString(16).toUpperCase().padStart(6, '0');
    const hexBytes = [];
    const ascii = [];
    for (let j = 0; j < 16 && (i + j) < length; j++) {
      const b = buf[baseAddr + i + j];
      hexBytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
    }
    lines.push(`  ${addr}: ${hexBytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
  return lines.join('\n');
}

console.log('=== PROBE: Map ROM Table at 0x0A26E4 (Glyph Property Table) ===\n');

// 1. Context dump: 64 bytes from 0x0A26D0
console.log('--- Context neighborhood: 64 bytes from 0x0A26D0 ---');
console.log(hexDump(rom, 0x0A26D0, 64));
console.log();

// 2. Extended dump: 256 bytes from 0x0A26E4
console.log('--- Extended table dump: 256 bytes from 0x0A26E4 ---');
console.log(hexDump(rom, 0x0A26E4, 256));
console.log();

// 3. Per-byte index listing from 0x0A26E4
console.log('--- Per-byte values at 0x0A26E4 + index ---');
const tableStart = 0x0A26E4;
const extendedBytes = [];
for (let i = 0; i < 256; i++) {
  extendedBytes.push(rom[tableStart + i]);
}

// Print in rows of 16
for (let row = 0; row < 16; row++) {
  const parts = [];
  for (let col = 0; col < 16; col++) {
    const idx = row * 16 + col;
    parts.push(`[${idx.toString(16).padStart(2, '0')}]=${extendedBytes[idx].toString(16).padStart(2, '0')}`);
  }
  console.log('  ' + parts.join(' '));
}
console.log();

// 4. Value distribution analysis
console.log('--- Value distribution (first 256 entries) ---');
const freq = {};
for (const b of extendedBytes) {
  freq[b] = (freq[b] || 0) + 1;
}
const uniqueValues = Object.keys(freq).map(Number).sort((a, b) => a - b);
console.log(`  Unique values: ${uniqueValues.length}`);
console.log(`  Range: 0x${Math.min(...uniqueValues).toString(16).padStart(2, '0')} - 0x${Math.max(...uniqueValues).toString(16).padStart(2, '0')}`);
console.log('  Frequency:');
for (const v of uniqueValues) {
  console.log(`    0x${v.toString(16).padStart(2, '0')} (${v.toString().padStart(3)}): ${freq[v]} times`);
}
console.log();

// 5. Check for code patterns after the table
console.log('--- Scanning for code start after 0x0A26E4 ---');
const codeSignals = { 0xC9: 'RET', 0xCD: 'CALL', 0x3E: 'LD A,n', 0xCB: 'CB prefix',
  0xDD: 'DD prefix(IX)', 0xFD: 'FD prefix(IY)', 0xC3: 'JP', 0x21: 'LD HL,nn',
  0x11: 'LD DE,nn', 0x01: 'LD BC,nn', 0xE5: 'PUSH HL', 0xD5: 'PUSH DE',
  0xC5: 'PUSH BC', 0xF5: 'PUSH AF', 0xAF: 'XOR A', 0xB7: 'OR A' };

for (let i = 0; i < 48; i++) {
  const addr = tableStart + i;
  const b = rom[addr];
  const sig = codeSignals[b] || '';
  const marker = sig ? ` <-- ${sig}` : '';
  if (b === 0xCD && i < 45) {
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    console.log(`  0x${addr.toString(16).toUpperCase()}: ${b.toString(16).padStart(2, '0')} [idx=${i}] <-- CALL 0x${target.toString(16).padStart(6, '0')}`);
  } else {
    console.log(`  0x${addr.toString(16).toUpperCase()}: ${b.toString(16).padStart(2, '0')} [idx=${i}]${marker}`);
  }
}
console.log();

// 6. Cross-reference: pixel bitmask table at 0x0A1B14
console.log('--- Pixel bitmask table at 0x0A1B14 (16 bytes) ---');
console.log(hexDump(rom, 0x0A1B14, 16));
console.log();

// 7. Interpretation analysis
console.log('--- Interpretation Analysis ---');

const first17 = extendedBytes.slice(0, 17);
console.log(`  First 17 bytes (potential table before code at 0x0A26F5):`);
console.log(`    ${first17.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`    decimal: ${first17.join(', ')}`);

const widthRange = first17.every(b => b <= 20);
console.log(`  All <= 20 (plausible widths)? ${widthRange}`);

// Check ASCII printable range mapping
console.log('\n  Values for ASCII printable range (0x20-0x7E if table indexed by char):');
const asciiStart = 0x20;
const asciiEnd = 0x7E;
const asciiVals = [];
for (let c = asciiStart; c <= asciiEnd; c++) {
  asciiVals.push({ char: String.fromCharCode(c), code: c, val: extendedBytes[c] });
}
console.log('    First 32 printable chars:');
for (let i = 0; i < 32 && i < asciiVals.length; i++) {
  const e = asciiVals[i];
  console.log(`      '${e.char}' (0x${e.code.toString(16)}): 0x${e.val.toString(16).padStart(2, '0')} (${e.val})`);
}

// 8. Check where code ACTUALLY starts
console.log('\n--- Bytes at known code address 0x0A26F5 ---');
console.log(hexDump(rom, 0x0A26F5, 32));

console.log('\n--- Bytes at 0x0A26D6 (renderer early exit) ---');
console.log(hexDump(rom, 0x0A26D6, 20));

console.log('\n=== PROBE COMPLETE ===');
