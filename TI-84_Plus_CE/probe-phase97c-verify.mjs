#!/usr/bin/env node
// Phase 97c verify: test paired-glyph hypothesis + scan ROM for 0x003d6e references.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const FONT_BASE = 0x003d6e;

// Hypothesis: 14 rows × 8 cols, 2 glyphs per 28-byte entry.
// Entry(N) at FONT_BASE + N*28. Glyph for ASCII code C = entry(C/2), half = C%2.
// Each glyph is 14 bytes (14 rows × 1 byte).
function renderPaired(asciiCode) {
  const entryIdx = Math.floor(asciiCode / 2);
  const half = asciiCode % 2;
  const base = FONT_BASE + entryIdx * 28 + half * 14;
  const rows = [];
  for (let r = 0; r < 14; r++) {
    const b = romBytes[base + r];
    let s = '';
    for (let c = 7; c >= 0; c--) s += (b >> c) & 1 ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

// Alt hypothesis: 14 rows × 16 cols, one glyph per 28-byte entry, but 5-wide glyph is stored doubled in both halves.
// (Already confirmed by layout A, so renderA unchanged.)

// Test ASCII chars 'A' 'B' 'N' 'O' 'F' 'R' 'a' 'b' ' ' '!'
const testChars = 'ABNOFRab !';
console.log('\n=== Paired 14×8 hypothesis ===');
for (const ch of testChars) {
  const code = ch.charCodeAt(0);
  console.log(`\n'${ch}' (0x${code.toString(16)}):`);
  renderPaired(code).forEach(r => console.log('  ' + r));
}

// Scan ROM for LD HL,0x3d6e and related
// LD HL,nn (ADL): 21 6e 3d 00
// LD HL,nn (Z80): 21 6e 3d (but 6e 3d might appear as data)
console.log('\n\n=== ROM scan for references to 0x003d6e ===');
const patterns = [
  { name: 'LD HL,0x003d6e (ADL 4-byte)', bytes: [0x21, 0x6e, 0x3d, 0x00] },
  { name: 'LD DE,0x003d6e (ADL 4-byte)', bytes: [0x11, 0x6e, 0x3d, 0x00] },
  { name: 'LD BC,0x003d6e (ADL 4-byte)', bytes: [0x01, 0x6e, 0x3d, 0x00] },
  { name: 'LD HL,0x3d6e (Z80 3-byte)', bytes: [0x21, 0x6e, 0x3d] },
  { name: 'CALL 0x003d6e', bytes: [0xcd, 0x6e, 0x3d, 0x00] },
  { name: 'JP 0x003d6e', bytes: [0xc3, 0x6e, 0x3d, 0x00] },
];
for (const { name, bytes } of patterns) {
  const hits = [];
  for (let i = 0; i < romBytes.length - bytes.length; i++) {
    let ok = true;
    for (let j = 0; j < bytes.length; j++) {
      if (romBytes[i + j] !== bytes[j]) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  console.log(`  ${name}: ${hits.length} hits${hits.length ? ' at ' + hits.slice(0, 8).map(h => '0x' + h.toString(16)).join(', ') + (hits.length > 8 ? ' ...' : '') : ''}`);
}

// Also scan for the raw 3 bytes 6e 3d 00 (could be anywhere as an address)
console.log('\n  Raw bytes 6e 3d 00 (ADL address as data):');
const rawHits = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x6e && romBytes[i + 1] === 0x3d && romBytes[i + 2] === 0x00) {
    // Log the byte before to identify opcode context
    const prev = i > 0 ? romBytes[i - 1] : 0;
    rawHits.push({ at: i - 1, prev: prev.toString(16).padStart(2, '0') });
  }
}
console.log(`    ${rawHits.length} hits (first 12):`);
for (const h of rawHits.slice(0, 12)) {
  console.log(`    at 0x${h.at.toString(16)}: prev byte = 0x${h.prev}`);
}
