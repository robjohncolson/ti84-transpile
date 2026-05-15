#!/usr/bin/env node
/**
 * probe-phase330-font-descriptor.mjs
 *
 * Decodes the Font Descriptor Table at ROM 0x05320F.
 *
 * Session 329 found:
 *   - D005F0 is initialized to 0x05320F  (font descriptor table pointer)
 *   - D005ED is set to 0x000FFF           (font table limit, read from ROM 0x05323F)
 *
 * Structure discovered:
 *   The table at 0x05320F is 48 bytes of 3-byte little-endian pointers (16 entries),
 *   organized as 4 RECORDS of 4 FIELDS each (12 bytes per record).
 *   Each pointer targets a variable-length scaling/filter kernel in ROM 0x053182..0x05320E.
 *   Immediately after the 48 pointer bytes is a 3-byte limit word at 0x05323F = 0x000FFF.
 *
 * Two font lookup functions reference this table:
 *   0x07BF3E  — fixed-width font lookup  (28 bytes/glyph at base 0x003D6E, HL = A * 0x1C)
 *   0x0A5424  — variable-width font lookup (25 bytes/glyph at base 0x0A3AFA, HL = A * 0x19)
 *
 * Font bitmap formats:
 *   Fixed-width (0x003D6E): 28 bytes = 14 rows x 2 bytes (left-half + right-half of 12px glyph)
 *   Variable-width (0x0A3AFA): 25 bytes = 1 width byte + up to 12 rows x 1-2 bytes of bitmap
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ─── Constants ───────────────────────────────────────────────────────────────

const DESCRIPTOR_TABLE = 0x05320F;
const DESCRIPTOR_LIMIT_ADDR = 0x05323F;
const GLYPH_DATA_START = 0x053182;        // first descriptor target
const GLYPH_DATA_END = 0x05320F;          // table itself marks the end

const FIXED_FONT_BASE = 0x003D6E;         // 28 bytes/char, indexed by char * 0x1C
const FIXED_ENTRY_SIZE = 0x1C;            // 28 bytes
const FIXED_ROWS = 14;

const VAR_FONT_BASE = 0x0A3AFA;           // 25 bytes/char, indexed by char * 0x19
const VAR_ENTRY_SIZE = 0x19;              // 25 bytes

const FONT_LOOKUP_FIXED = 0x07BF3E;       // fixed-width font lookup
const FONT_LOOKUP_VAR = 0x0A5424;         // variable-width font lookup

const RECORDS = 4;
const FIELDS_PER_RECORD = 4;
const POINTER_SIZE = 3;

// IY_BASE = 0xD00080 (used by OS for system flags)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function renderBitmapRow8(byte) {
  let s = '';
  for (let bit = 7; bit >= 0; bit--) {
    s += (byte >> bit) & 1 ? '#' : '.';
  }
  return s;
}

// ─── Section 1: Decode the pointer table ─────────────────────────────────────

console.log('=== SECTION 1: Font Descriptor Table at 0x%s ===\n', DESCRIPTOR_TABLE.toString(16));

const limit = read24(DESCRIPTOR_LIMIT_ADDR);
console.log('Table limit (from ROM 0x%s): 0x%s',
  DESCRIPTOR_LIMIT_ADDR.toString(16), limit.toString(16).padStart(6, '0'));
console.log('Pointer region: 16 entries x 3 bytes = 48 bytes (0x05320F..0x05323E)');
console.log('Organized as %d records x %d fields (12 bytes/record)\n', RECORDS, FIELDS_PER_RECORD);

const pointers = [];
for (let i = 0; i < 16; i++) {
  pointers.push(read24(DESCRIPTOR_TABLE + i * POINTER_SIZE));
}

for (let rec = 0; rec < RECORDS; rec++) {
  console.log('Record %d (table offset +%d, for table base + 0x%s):',
    rec, rec * 12, (rec * 12).toString(16));
  for (let f = 0; f < FIELDS_PER_RECORD; f++) {
    const idx = rec * FIELDS_PER_RECORD + f;
    const ptr = pointers[idx];
    const nextPtr = idx < 15 ? pointers[idx + 1] : DESCRIPTOR_TABLE;
    const size = nextPtr - ptr;

    const dataLen = Math.max(size, 0);
    const data = Array.from(rom.slice(ptr, ptr + dataLen));
    const n = rom[ptr]; // always read N from ROM even if size=0 (shared pointer)
    const hex = data.map(b => b.toString(16).padStart(2, '0')).join(' ');

    console.log('  field[%d] ptr=0x%s  N=%s  size=%s  data=[%s]',
      f, ptr.toString(16).padStart(6, '0'),
      n.toString().padStart(2), size.toString().padStart(2), hex);
  }
  console.log('');
}

// ─── Section 2: Analyze descriptor entry format ──────────────────────────────

console.log('=== SECTION 2: Descriptor Entry Format ===\n');
console.log('Each descriptor: byte[0] = N (kernel dimension)');
console.log('  Remaining bytes = N-1 pairs of 2 bytes each');
console.log('  Total entry size = N*2 - 1 = 2N - 1 bytes');
console.log('');

// Verify the size formula
let formulaOk = true;
for (let i = 0; i < 15; i++) {
  const ptr = pointers[i];
  const nextPtr = pointers[i + 1];
  const size = nextPtr - ptr;
  if (size <= 0) continue; // entries pointing to same address
  const n = rom[ptr];
  const expected = n * 2 - 1;
  if (size !== expected) {
    console.log('  MISMATCH at entry %d: N=%d, expected size=%d, actual=%d', i, n, expected, size);
    formulaOk = false;
  }
}
// Check last entry
{
  const ptr = pointers[15];
  const size = DESCRIPTOR_TABLE - ptr;
  const n = rom[ptr];
  const expected = n * 2 - 1;
  if (size !== expected) {
    console.log('  MISMATCH at entry 15: N=%d, expected size=%d, actual=%d', n, expected, size);
    formulaOk = false;
  }
}
if (formulaOk) {
  console.log('  Formula verified: all entries satisfy size = 2*N - 1');
}

console.log('\nN values across records:');
console.log('  Record 0: N = [%s]  (identity/passthrough)',
  [0, 1, 2, 3].map(f => rom[pointers[f]]).join(', '));
console.log('  Record 1: N = [%s]  (small scale)',
  [4, 5, 6, 7].map(f => rom[pointers[f]]).join(', '));
console.log('  Record 2: N = [%s]  (medium scale)',
  [8, 9, 10, 11].map(f => rom[pointers[f]]).join(', '));
console.log('  Record 3: N = [%s]  (large scale)',
  [12, 13, 14, 15].map(f => rom[pointers[f]]).join(', '));

// ─── Section 3: Fixed-width font (0x003D6E) ─────────────────────────────────

console.log('\n=== SECTION 3: Fixed-Width Font at 0x003D6E ===\n');
console.log('Entry size: %d bytes = %d rows x 2 bytes (left-half + right-half)', FIXED_ENTRY_SIZE, FIXED_ROWS);
console.log('Indexing: HL = char_code * 0x1C + 0x003D6E');
console.log('Function: 0x07BF3E copies 28 bytes to RAM D005A5, returns HL = D005A1\n');

const fixedChars = [
  { name: 'space', code: 0x20 },
  { name: '0',     code: 0x30 },
  { name: 'A',     code: 0x41 },
  { name: 'a',     code: 0x61 },
];

for (const ch of fixedChars) {
  const offset = FIXED_FONT_BASE + ch.code * FIXED_ENTRY_SIZE;
  const data = rom.slice(offset, offset + FIXED_ENTRY_SIZE);
  console.log("'%s' (0x%s) @ ROM 0x%s:", ch.name, ch.code.toString(16).padStart(2, '0'), offset.toString(16));
  console.log('  Left-half   Right-half   Combined (12px)');
  for (let row = 0; row < FIXED_ROWS; row++) {
    const left = data[row * 2];
    const right = data[row * 2 + 1];
    const leftBits = renderBitmapRow8(left).slice(0, 6);
    const rightBits = renderBitmapRow8(right).slice(0, 6);
    console.log('  %s      %s       %s%s',
      renderBitmapRow8(left), renderBitmapRow8(right), leftBits, rightBits);
  }
  console.log('');
}

// ─── Section 4: Variable-width font (0x0A3AFA) ──────────────────────────────

console.log('=== SECTION 4: Variable-Width Font at 0x0A3AFA ===\n');
console.log('Entry size: %d bytes = 1 width byte + bitmap rows', VAR_ENTRY_SIZE);
console.log('Indexing: HL = char_code * 0x19 + 0x0A3AFA');
console.log('Function: 0x0A5424 copies 25 bytes to RAM D005C5, returns HL = D005C5\n');

const varChars = [
  { name: 'space', code: 0x20 },
  { name: '0',     code: 0x30 },
  { name: 'A',     code: 0x41 },
  { name: 'a',     code: 0x61 },
  { name: 'W',     code: 0x57 },
  { name: 'i',     code: 0x69 },
];

for (const ch of varChars) {
  const offset = VAR_FONT_BASE + ch.code * VAR_ENTRY_SIZE;
  const data = rom.slice(offset, offset + VAR_ENTRY_SIZE);
  const width = data[0];
  console.log("'%s' (0x%s) @ ROM 0x%s  width=%d:",
    ch.name, ch.code.toString(16).padStart(2, '0'), offset.toString(16), width);

  if (width <= 8) {
    // 1 byte per row, up to 12 rows
    for (let row = 0; row < 12; row++) {
      const b = data[1 + row];
      console.log('  %s', renderBitmapRow8(b).slice(0, width));
    }
  } else {
    // 2 bytes per row for wider glyphs
    for (let row = 0; row < 12; row++) {
      const b0 = data[1 + row * 2];
      const b1 = data[2 + row * 2];
      let line = '';
      for (let bit = 7; bit >= 0; bit--) {
        line += (b0 >> bit) & 1 ? '#' : '.';
      }
      for (let bit = 7; bit >= 0; bit--) {
        line += (b1 >> bit) & 1 ? '#' : '.';
      }
      console.log('  %s', line.slice(0, width));
    }
  }
  console.log('');
}

// ─── Section 5: Verify font lookup address computation ───────────────────────

console.log('=== SECTION 5: Font Lookup Address Verification ===\n');

// Simulate what 0x07BF3E does (fixed-width font lookup):
//   Caller: LD L, A; LD H, 0x1C; MLT HL  =>  HL = char * 0x1C
//   0x07BF5C: EX DE, HL  =>  DE = char * 0x1C
//   0x07BF5D: CALL 0x000380  =>  JP 0x003D85  =>  LD HL, 0x003D6E; RET
//   0x07BF61: ADD HL, DE  =>  HL = 0x003D6E + char * 0x1C
//   Then copies 0x1C (28) bytes from (HL) to D005A5, returns HL = D005A1

const testChars = [0x20, 0x30, 0x41, 0x61];
console.log('Fixed-width font lookup (0x07BF3E):');
for (const code of testChars) {
  const hl = code * 0x1C;
  const addr = 0x003D6E + hl;
  const glyph = Array.from(rom.slice(addr, addr + 28));
  const isBlank = glyph.every(b => b === 0);
  console.log('  char 0x%s => HL=0x%s, glyph@0x%s %s',
    code.toString(16).padStart(2, '0'),
    hl.toString(16).padStart(6, '0'),
    addr.toString(16),
    isBlank ? '(blank)' : '(has bitmap data)');
}

// Simulate what 0x0A5424 does (variable-width font lookup):
//   HL = char * 0x19 (set up by caller, not using MLT — direct multiplication)
//   0x0A5439: LD DE, 0x0A3AFA; ADD HL, DE  =>  HL = 0x0A3AFA + char * 0x19
//   Then copies 0x19 (25) bytes from (HL) to D005C5, returns HL = D005C5

console.log('\nVariable-width font lookup (0x0A5424):');
for (const code of testChars) {
  const hl = code * 0x19;
  const addr = 0x0A3AFA + hl;
  const width = rom[addr];
  console.log('  char 0x%s => HL=0x%s, glyph@0x%s, width=%d',
    code.toString(16).padStart(2, '0'),
    hl.toString(16).padStart(6, '0'),
    addr.toString(16),
    width);
}

// Cross-validate: count how many chars have font data (non-zero entries)
console.log('\nFont coverage scan:');
let fixedNonBlank = 0;
let varNonBlank = 0;
for (let code = 0; code < 256; code++) {
  const fAddr = FIXED_FONT_BASE + code * FIXED_ENTRY_SIZE;
  const fData = rom.slice(fAddr, fAddr + FIXED_ENTRY_SIZE);
  if (fData.some(b => b !== 0)) fixedNonBlank++;

  const vAddr = VAR_FONT_BASE + code * VAR_ENTRY_SIZE;
  const vData = rom.slice(vAddr, vAddr + VAR_ENTRY_SIZE);
  if (vData.some(b => b !== 0)) varNonBlank++;
}
console.log('  Fixed-width font: %d/256 chars have bitmap data', fixedNonBlank);
console.log('  Variable-width font: %d/256 chars have bitmap data', varNonBlank);

// Verify the font base address returned by vector 0x000380 -> 0x003D85
const vec380Target = read24(0x000381); // JP target at 0x000380 is a 4-byte instruction: C3 xx xx xx
const vec3D85Payload = read24(0x003D86); // LD HL, xxxx at 0x003D85: 21 xx xx xx
console.log('\nVector chain: 0x000380 -> JP 0x%s -> LD HL, 0x%s',
  vec380Target.toString(16).padStart(6, '0'),
  vec3D85Payload.toString(16).padStart(6, '0'));
console.log('  Font base address: 0x%s (matches FIXED_FONT_BASE: %s)',
  vec3D85Payload.toString(16).padStart(6, '0'),
  vec3D85Payload === FIXED_FONT_BASE ? 'YES' : 'NO');

// ─── Section 6: Summary ─────────────────────────────────────────────────────

console.log('\n=== SECTION 6: Summary ===\n');
console.log('Font Descriptor Table (0x05320F):');
console.log('  16 x 3-byte pointers = 4 records x 4 fields');
console.log('  Each pointer -> variable-length scaling kernel (N*2-1 bytes)');
console.log('  Record 0: identity (N=1,1,1,1) — no scaling');
console.log('  Record 1: small (N=3,5,3,5)');
console.log('  Record 2: medium (N=5,7,5,7)');
console.log('  Record 3: large (N=7,11,7,11)');
console.log('  Limit at 0x05323F = 0x000FFF');
console.log('');
console.log('Fixed-width font (0x003D6E):');
console.log('  28 bytes/char, 14 rows x 2 bytes (split left/right halves)');
console.log('  Accessed via 0x07BF3E: HL = char * 0x1C, copies to D005A5');
console.log('');
console.log('Variable-width font (0x0A3AFA):');
console.log('  25 bytes/char: [width, row0, row1, ..., padding]');
console.log('  Width <= 8: 1 byte/row; width > 8: 2 bytes/row');
console.log('  Accessed via 0x0A5424: HL = char * 0x19, copies to D005C5');
console.log('');
console.log('RAM layout:');
console.log('  D005A1..D005C0 — fixed-width glyph buffer (28 bytes at D005A5, header at D005A1)');
console.log('  D005C5..D005E1 — variable-width glyph buffer (25 bytes, +4 trailing zeros at D005DE)');
console.log('  D005ED         — font table limit (3 bytes, value 0x000FFF)');
console.log('  D005F0         — font descriptor table pointer (3 bytes, value 0x05320F)');
console.log('  D005F4         — width/alpha mode byte');
