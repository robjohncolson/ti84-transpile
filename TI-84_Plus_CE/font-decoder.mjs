#!/usr/bin/env node
// Font decoder - turns rendered VRAM pixels into readable ASCII text.
//
// Phase 120 rewrite: TI-84 CE large font is at ROM 0x0040ee, 28 bytes per
// glyph, 1 bit per pixel, 2 bytes per row, 14 rows, 16 pixels wide.
//   byte0 bits 7..0 -> cols 0..7
//   byte1 bits 7..0 -> cols 8..15
// Effective glyph width is ~13 px (cols 13-15 are blank padding on most chars).
// 28 bytes/glyph = 14 rows x 2 bytes/row.
// Index = char_code - 0x20.
//
// Usage: import { buildFontSignatures, decodeTextStrip } from './font-decoder.mjs';
//
// This module builds signatures for all 96 printable ASCII chars then scans
// a VRAM region row-by-row, matching each 16x14 cell against the signatures.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FONT_BASE = 0x0040ee;
export const GLYPH_STRIDE = 28;
export const GLYPH_WIDTH = 16;
export const GLYPH_HEIGHT = 14;
export const VRAM_BASE = 0xD40000;
export const VRAM_WIDTH = 320;
export const VRAM_HEIGHT = 240;
export const VRAM_SENTINEL = 0xAAAA;

const DEFAULT_MAX_DIST = 30;

/** Decode a 28-byte glyph entry into a 16x14 binary bitmap (1 = fg, 0 = bg).
 * Format: 1 bit per pixel, 2 bytes per row, 14 rows, 16 pixels wide.
 */
export function decodeGlyph(romBytes, charCode) {
  const idx = charCode - 0x20;
  if (idx < 0 || idx > 0x5F) return null;

  const off = FONT_BASE + idx * GLYPH_STRIDE;
  const bitmap = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);

  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const b0 = romBytes[off + row * 2];
    const b1 = romBytes[off + row * 2 + 1];

    for (let col = 0; col < 8; col++) {
      bitmap[row * GLYPH_WIDTH + col] = (b0 >> (7 - col)) & 1;
    }

    for (let col = 0; col < 8; col++) {
      bitmap[row * GLYPH_WIDTH + 8 + col] = (b1 >> (7 - col)) & 1;
    }
  }

  return bitmap;
}

/** Decode a glyph as the ROM renderer draws it: 5 bits from each byte,
 * packed into the first 10 columns of a GLYPH_WIDTH-wide bitmap.
 * byte0 bits 7..3 -> cols 0..4, byte1 bits 7..3 -> cols 5..9.
 * This matches what appears on-screen (the renderer ignores the lower 3 bits
 * of each byte, which serve as inter-column spacing).
 */
function decodeGlyphRendered(romBytes, charCode) {
  const idx = charCode - 0x20;
  if (idx < 0 || idx > 0x5F) return null;

  const off = FONT_BASE + idx * GLYPH_STRIDE;
  const bitmap = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);

  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const b0 = romBytes[off + row * 2];
    const b1 = romBytes[off + row * 2 + 1];

    for (let col = 0; col < 5; col++) {
      bitmap[row * GLYPH_WIDTH + col] = (b0 >> (7 - col)) & 1;
    }
    for (let col = 0; col < 5; col++) {
      bitmap[row * GLYPH_WIDTH + 5 + col] = (b1 >> (7 - col)) & 1;
    }
  }

  return bitmap;
}

/** Build signatures for all printable ASCII chars (0x20..0x7E).
 * Uses the rendered glyph layout (5+5 bits in first 10 columns) so that
 * signatures match what the ROM renderer actually paints to VRAM.
 */
export function buildFontSignatures(romBytes) {
  const signatures = [];
  for (let code = 0x20; code <= 0x7E; code++) {
    const bitmap = decodeGlyphRendered(romBytes, code);
    if (!bitmap) continue;
    signatures.push({ code, char: String.fromCharCode(code), bitmap });
  }
  return signatures;
}

/** Extract a cell from VRAM at pixel (row, col). Returns binary bitmap
 * of size GLYPH_WIDTH x GLYPH_HEIGHT.
 * @param {boolean} inverse if true, treat white as foreground (for inverse-video text on black)
 * @param {number} extractWidth how many columns to read from VRAM (default GLYPH_WIDTH).
 *   When the on-screen stride is narrower than GLYPH_WIDTH, pass the stride here
 *   to avoid pulling pixels from adjacent characters. Columns beyond extractWidth
 *   remain 0 (background).
 */
export function extractCell(mem, row, col, inverse = false, extractWidth = GLYPH_WIDTH) {
  const cell = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  const w = Math.min(extractWidth, GLYPH_WIDTH);

  for (let dy = 0; dy < GLYPH_HEIGHT; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const r = row + dy;
      const c = col + dx;

      if (r >= VRAM_HEIGHT || c >= VRAM_WIDTH) continue;

      const off = VRAM_BASE + (r * VRAM_WIDTH + c) * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      if (px === VRAM_SENTINEL) continue;

      const isWhite = px === 0xFFFF;
      cell[dy * GLYPH_WIDTH + dx] = inverse ? (isWhite ? 1 : 0) : (isWhite ? 0 : 1);
    }
  }

  return cell;
}

/** Hamming distance between two equal-length bitmaps. */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/** Hamming distance restricted to the first `compareWidth` columns of each row.
 * Both bitmaps must be GLYPH_WIDTH wide and GLYPH_HEIGHT tall. This lets us
 * ignore neighbor-char contamination when the on-screen stride is narrower
 * than GLYPH_WIDTH.
 */
export function hammingCols(a, b, compareWidth) {
  let d = 0;
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const rowOff = row * GLYPH_WIDTH;
    for (let col = 0; col < compareWidth; col++) {
      if (a[rowOff + col] !== b[rowOff + col]) d++;
    }
  }
  return d;
}

/** Match a VRAM cell against all signatures, return best match.
 * If compareWidth is provided, only compare the first compareWidth cols
 * per row (ignores neighbor-char contamination).
 */
export function matchCell(cell, signatures, compareWidth = GLYPH_WIDTH) {
  let allZero = true;
  if (compareWidth === GLYPH_WIDTH) {
    for (let i = 0; i < cell.length; i++) {
      if (cell[i]) {
        allZero = false;
        break;
      }
    }
  } else {
    outer: for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < compareWidth; col++) {
        if (cell[row * GLYPH_WIDTH + col]) {
          allZero = false;
          break outer;
        }
      }
    }
  }
  if (allZero) return { code: 0x20, char: ' ', dist: 0 };

  let best = null;
  for (const sig of signatures) {
    const d = compareWidth === GLYPH_WIDTH
      ? hamming(cell, sig.bitmap)
      : hammingCols(cell, sig.bitmap, compareWidth);
    if (!best || d < best.dist) {
      best = { code: sig.code, char: sig.char, dist: d };
    }
  }
  return best;
}

/** Decode a VRAM row strip into a string.
 * Tries both normal and inverse-video modes per cell and keeps the best match.
 * @param {Uint8Array} mem full memory buffer
 * @param {number} startRow top VRAM row of the text strip
 * @param {number} startCol left VRAM col of the first cell
 * @param {number} numCells how many cells to decode
 * @param {Array} signatures from buildFontSignatures
 * @param {number} maxDist only accept matches with hamming distance <= this (default 30)
 * @param {string} mode 'normal' | 'inverse' | 'auto' (default 'auto')
 * @param {number} stride cols between cell origins (default GLYPH_WIDTH)
 * @param {number} compareWidth cols per row to include in hamming distance (default GLYPH_WIDTH)
 */
export function decodeTextStrip(
  mem,
  startRow,
  startCol,
  numCells,
  signatures,
  maxDist = DEFAULT_MAX_DIST,
  mode = 'auto',
  stride = GLYPH_WIDTH,
  compareWidth = GLYPH_WIDTH,
) {
  // When the on-screen stride is narrower than GLYPH_WIDTH, limit VRAM
  // extraction to `stride` columns so we don't pull pixels from the next
  // character.  Columns beyond extractWidth stay 0 in the cell bitmap.
  const extractWidth = stride < GLYPH_WIDTH ? stride : GLYPH_WIDTH;

  const chars = [];

  for (let c = 0; c < numCells; c++) {
    const col = startCol + c * stride;
    let best;

    if (mode === 'normal') {
      best = matchCell(extractCell(mem, startRow, col, false, extractWidth), signatures, compareWidth);
    } else if (mode === 'inverse') {
      best = matchCell(extractCell(mem, startRow, col, true, extractWidth), signatures, compareWidth);
    } else {
      const normalMatch = matchCell(extractCell(mem, startRow, col, false, extractWidth), signatures, compareWidth);
      const inverseMatch = matchCell(extractCell(mem, startRow, col, true, extractWidth), signatures, compareWidth);
      best = inverseMatch.dist < normalMatch.dist ? inverseMatch : normalMatch;
    }

    chars.push(best.dist <= maxDist ? best.char : '?');
  }

  return chars.join('');
}

// Self-test when run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rom = new Uint8Array(fs.readFileSync(
    new URL('./ROM.rom', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  ));
  const sigs = buildFontSignatures(rom);
  console.log(`Built ${sigs.length} signatures`);
  for (const ch of ['A', 'B', 'C', 'H', 'N', 'T', 'X', '0', ' ']) {
    const code = ch.charCodeAt(0);
    const bm = decodeGlyph(rom, code);
    const lines = [];
    for (let r = 0; r < GLYPH_HEIGHT; r++) {
      let row = '';
      for (let c = 0; c < GLYPH_WIDTH; c++) {
        row += bm[r * GLYPH_WIDTH + c] ? '#' : '.';
      }
      lines.push(row);
    }
    console.log(`\n'${ch}' (0x${code.toString(16)}):`);
    lines.forEach((line) => console.log(`  ${line}`));
  }
}
