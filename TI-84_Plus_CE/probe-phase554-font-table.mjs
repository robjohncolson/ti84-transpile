#!/usr/bin/env node
// probe-phase554-font-table.mjs
// Read the TI-84 Plus CE OS font glyph table directly from ROM bytes.
// No CPU execution -- pure static analysis.
//
// Font layout (verified via session 553):
//   Base address : 0x003D6E  (returned by fn at 0x003D85: LD HL,0x003D6E; RET)
//   Glyph stride : 28 bytes  (14 rows x 2 bytes/row)
//   Table size   : 256 x 28B = 7168B, ends at 0x005B6E

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

// --- constants -----------------------------------------------------------

const FONT_TABLE_BASE  = 0x003D6E;
const GLYPH_STRIDE     = 28;          // bytes per glyph
const GLYPH_ROWS       = 14;
const GLYPH_ROW_BYTES  = 2;           // bytes per row
const GLYPH_PIXEL_COLS = 16;          // raw bit-width of each row word

const PRINTABLE_FIRST  = 0x20;
const PRINTABLE_LAST   = 0x7E;
const EXTENDED_FIRST   = 0x80;
const EXTENDED_LAST    = 0x9F;

const SEARCH_WINDOW_LO  = 0x000000;
const SEARCH_WINDOW_HI  = 0x040000;   // first 256 KB
const SECOND_TABLE_SIZE = 7168;       // 256 glyphs x 28B

// --- helpers -------------------------------------------------------------

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function readGlyph(rom, charCode) {
  const offset = FONT_TABLE_BASE + charCode * GLYPH_STRIDE;
  return rom.slice(offset, offset + GLYPH_STRIDE);
}

// eZ80 is little-endian: byte[0] is lo, byte[1] is hi.
// The hardware renders MSB of the high byte first, so the natural pixel word
// is (hi << 8 | lo) and we render bits 15..0 left-to-right.
function rowWordNatural(glyph, row) {
  const lo = glyph[row * GLYPH_ROW_BYTES];
  const hi = glyph[row * GLYPH_ROW_BYTES + 1];
  return (hi << 8) | lo;
}

// Alternative: treat the pair as big-endian bytes (lo<<8|hi).
function rowWordSwapped(glyph, row) {
  const lo = glyph[row * GLYPH_ROW_BYTES];
  const hi = glyph[row * GLYPH_ROW_BYTES + 1];
  return (lo << 8) | hi;
}

// Render one row of 16 bits as '#' / '.', MSB first.
function renderRowBits(word) {
  let out = '';
  for (let bit = GLYPH_PIXEL_COLS - 1; bit >= 0; bit--) {
    out += (word >> bit) & 1 ? '#' : '.';
  }
  return out;
}

// Render a full glyph using the given row-word function.
function renderGlyph(glyph, rowWordFn) {
  const rows = [];
  for (let row = 0; row < GLYPH_ROWS; row++) {
    rows.push(renderRowBits(rowWordFn(glyph, row)));
  }
  return rows;
}

// Count set bits across all rows.
function countInkBits(glyph) {
  let count = 0;
  for (let row = 0; row < GLYPH_ROWS; row++) {
    const lo = glyph[row * GLYPH_ROW_BYTES];
    const hi = glyph[row * GLYPH_ROW_BYTES + 1];
    const word = (hi << 8) | lo;
    for (let bit = 0; bit < 16; bit++) {
      if ((word >> bit) & 1) count++;
    }
  }
  return count;
}

// Measure how many pixel columns from the left side (MSB side) contain ink.
// With natural endianness: bit 15 = leftmost column.
// Returns count of columns from left edge to rightmost inked column + 1.
function measureUsedWidth(glyph) {
  let widestColFromLeft = -1;
  for (let row = 0; row < GLYPH_ROWS; row++) {
    const lo = glyph[row * GLYPH_ROW_BYTES];
    const hi = glyph[row * GLYPH_ROW_BYTES + 1];
    const word = (hi << 8) | lo;
    for (let bit = 0; bit < 16; bit++) {
      if ((word >> bit) & 1) {
        const colFromLeft = GLYPH_PIXEL_COLS - 1 - bit;
        if (colFromLeft > widestColFromLeft) widestColFromLeft = colFromLeft;
      }
    }
  }
  return widestColFromLeft + 1;  // 0 for blank glyph
}

// Decide which endianness makes 'A' look like an 'A'.
// Heuristic: the correct 'A' concentrates ink near the center on rows 0-4.
function pickEndianness(rom) {
  const glyph = readGlyph(rom, 0x41);
  const rowsNat = renderGlyph(glyph, rowWordNatural);
  const rowsSwp = renderGlyph(glyph, rowWordSwapped);

  function centerInkScore(rows) {
    let score = 0;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const row = rows[r];
      const mid = Math.floor(row.length / 2);
      for (let c = mid - 3; c <= mid + 3; c++) {
        if (row[c] === '#') score++;
      }
    }
    return score;
  }

  return centerInkScore(rowsNat) >= centerInkScore(rowsSwp) ? 'natural' : 'swapped';
}

// --- second-font-table search -------------------------------------------

// Find LD HL,imm24 + RET patterns (eZ80 ADL mode).
// LD HL,nn (ADL) = 0x21 lo mid hi  (4 bytes), RET = 0xC9 at offset +4.
function findLdHlRetPatterns(rom) {
  const results = [];
  for (let addr = SEARCH_WINDOW_LO; addr < SEARCH_WINDOW_HI - 5; addr++) {
    if (rom[addr] !== 0x21) continue;
    if (rom[addr + 4] !== 0xC9) continue;
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    if (target === 0 || target >= 0x400000) continue;
    results.push({ fnAddr: addr, target });
  }
  return results;
}

// Statistical scan: find 7168B blocks where >= 64 of the 256 potential
// 28-byte glyph slots are non-zero, excluding the known table.
function findCandidateFontTables(rom) {
  const candidates = [];
  const searchEnd = Math.min(rom.length - SECOND_TABLE_SIZE, 0x400000);

  for (let base = 0; base < searchEnd; base += 0x10) {
    if (base === FONT_TABLE_BASE) continue;

    let nonBlankCount = 0;
    for (let g = 0; g < 256; g++) {
      const start = base + g * GLYPH_STRIDE;
      if (start + GLYPH_STRIDE > rom.length) break;
      let ink = 0;
      for (let i = 0; i < GLYPH_STRIDE; i++) ink |= rom[start + i];
      if (ink !== 0) nonBlankCount++;
    }

    if (nonBlankCount >= 64) {
      candidates.push({ base, nonBlankCount });
    }
  }

  return candidates;
}

// --- printing ------------------------------------------------------------

function printGlyphArt(charCode, rom, rowWordFn, label) {
  const glyph = readGlyph(rom, charCode);
  const rows = renderGlyph(glyph, rowWordFn);
  const usedWidth = measureUsedWidth(glyph);
  const charStr = (charCode >= 0x20 && charCode <= 0x7E)
    ? String.fromCharCode(charCode)
    : '?';

  console.log('\n--- ' + hex(charCode, 2) + ' \'' + charStr + '\'' + ' usedWidth=' + usedWidth + ' [' + label + '] ---');
  for (const row of rows) {
    const trimmed = row.replace(/\.+$/, '') || '.';
    console.log('  ' + trimmed);
  }
}

// --- main ----------------------------------------------------------------

async function main() {
  console.log('=== Phase 554 -- Font Glyph Table ASCII Art ===');

  const rom = fs.readFileSync(ROM_PATH);
  console.log('ROM size        : ' + rom.length + ' bytes (' + hex(rom.length) + ')');
  console.log('Font table base : ' + hex(FONT_TABLE_BASE));
  console.log('Table end       : ' + hex(FONT_TABLE_BASE + SECOND_TABLE_SIZE));
  console.log('Glyph stride    : ' + GLYPH_STRIDE + 'B  (' + GLYPH_ROWS + ' rows x ' + GLYPH_ROW_BYTES + 'B/row)');

  // --- sanity checks -------------------------------------------------------

  const glyphSpace = readGlyph(rom, 0x20);
  const inkSpace = countInkBits(glyphSpace);
  const glyphA = readGlyph(rom, 0x41);
  const inkA = countInkBits(glyphA);

  console.log('\nSanity:');
  console.log('  0x20 (space) ink bits : ' + inkSpace + '  (expect 0)');
  console.log("  0x41 ('A')   ink bits : " + inkA + '  (expect >0)');

  // --- endianness ----------------------------------------------------------

  const endian = pickEndianness(rom);
  const rowWordFn = endian === 'natural' ? rowWordNatural : rowWordSwapped;
  const endianDesc = endian === 'natural'
    ? 'hi<<8|lo  (eZ80 LE bytes -> MSB-first pixel render)'
    : 'lo<<8|hi  (byte-swapped)';
  console.log('\nEndianness      : ' + endian + '  --  ' + endianDesc);

  console.log('\n=== Endianness check: 0x41 ("A") both interpretations ===');
  printGlyphArt(0x41, rom, rowWordNatural, 'natural: hi<<8|lo');
  printGlyphArt(0x41, rom, rowWordSwapped, 'swapped: lo<<8|hi');

  // --- font width survey ---------------------------------------------------

  console.log('\n=== Font width survey (0x20-0x7E) ===');
  const widths = [];
  for (let code = PRINTABLE_FIRST; code <= PRINTABLE_LAST; code++) {
    widths.push(measureUsedWidth(readGlyph(rom, code)));
  }
  const nonZeroWidths = widths.filter((w) => w > 0);
  const maxWidth = Math.max(...widths);
  const minNonZero = Math.min(...nonZeroWidths);
  const avgWidth = nonZeroWidths.reduce((a, b) => a + b, 0) / nonZeroWidths.length;

  console.log('  Min non-zero width      : ' + minNonZero + ' px');
  console.log('  Max width               : ' + maxWidth + ' px');
  console.log('  Avg width (non-blank)   : ' + avgWidth.toFixed(1) + ' px');
  console.log('  Effective font width    : ' + maxWidth + ' px');

  const dist = new Array(GLYPH_PIXEL_COLS + 1).fill(0);
  for (const w of widths) dist[w]++;
  console.log('\n  Width histogram (width: count):');
  for (let w = 0; w <= GLYPH_PIXEL_COLS; w++) {
    if (dist[w] > 0) {
      console.log('    ' + String(w).padStart(2) + ': ' + '#'.repeat(dist[w]) + ' (' + dist[w] + ')');
    }
  }

  // --- printable ASCII art -------------------------------------------------

  console.log('\n=== Glyph art: printable ASCII 0x20-0x7E ===');
  for (let code = PRINTABLE_FIRST; code <= PRINTABLE_LAST; code++) {
    printGlyphArt(code, rom, rowWordFn, endian);
  }

  // --- extended range 0x80-0x9F -------------------------------------------

  console.log('\n=== Glyph art: extended 0x80-0x9F (special symbols?) ===');
  for (let code = EXTENDED_FIRST; code <= EXTENDED_LAST; code++) {
    const glyph = readGlyph(rom, code);
    const ink = countInkBits(glyph);
    if (ink === 0) {
      console.log('  ' + hex(code, 2) + ': blank');
    } else {
      printGlyphArt(code, rom, rowWordFn, endian);
    }
  }

  // --- second font table search: LD HL,xx + RET ---------------------------

  console.log('\n=== Second font table search: LD HL,imm24 + RET patterns ===');
  const ldHlRetHits = findLdHlRetPatterns(rom);
  console.log('Found ' + ldHlRetHits.length + ' hit(s) in ' + hex(SEARCH_WINDOW_LO) + '-' + hex(SEARCH_WINDOW_HI) + ':');

  for (const hit of ldHlRetHits) {
    const isKnown = hit.target === FONT_TABLE_BASE;
    const tag = isKnown ? '  <-- KNOWN font base (0x003D6E)' : '';
    const tableEnd = hit.target + SECOND_TABLE_SIZE - 1;
    const inRom = hit.target + SECOND_TABLE_SIZE <= rom.length;
    console.log('  fn=' + hex(hit.fnAddr) + '  target=' + hex(hit.target) + '  (span ' + hex(hit.target) + '-' + hex(tableEnd) + ', inRom=' + inRom + ')' + tag);
  }

  // --- second font table search: statistical scan --------------------------

  console.log('\n=== Second font table search: statistical scan for 7168B glyph-like blocks ===');
  const candidates = findCandidateFontTables(rom);
  if (candidates.length === 0) {
    console.log('  No candidate blocks found (non-blank glyph count < 64 everywhere outside known table).');
  } else {
    console.log('  Found ' + candidates.length + ' candidate(s) with >= 64 non-blank glyph slots:');
    for (const c of candidates.slice(0, 20)) {
      console.log('    base=' + hex(c.base) + '  nonBlankGlyphs=' + c.nonBlankCount);
    }
    if (candidates.length > 20) {
      console.log('    ... and ' + (candidates.length - 20) + ' more (showing first 20)');
    }
  }

  // --- summary -------------------------------------------------------------

  console.log('\n=== Summary ===');
  console.log('  Font table base    : ' + hex(FONT_TABLE_BASE));
  console.log('  Table end          : ' + hex(FONT_TABLE_BASE + SECOND_TABLE_SIZE));
  console.log('  Glyph stride       : ' + GLYPH_STRIDE + 'B');
  console.log('  Rows per glyph     : ' + GLYPH_ROWS);
  console.log('  Raw pixel columns  : ' + GLYPH_PIXEL_COLS);
  console.log('  Effective width    : ' + maxWidth + ' px');
  console.log('  Endianness         : ' + endian + '  (' + endianDesc + ')');
  console.log('  Space blank        : ' + (inkSpace === 0));
  console.log("  'A' has ink        : " + (inkA > 0) + '  (' + inkA + ' bits)');
  console.log('  LD HL+RET hits     : ' + ldHlRetHits.length);
  console.log('  Statistical cands  : ' + candidates.length);
  console.log('Done.');
}

try {
  await main();
} catch (err) {
  console.error(err.stack || err);
  process.exitCode = 1;
}
