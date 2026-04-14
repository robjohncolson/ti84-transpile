#!/usr/bin/env node
// Font decoder — turns rendered VRAM pixels into readable ASCII text.
//
// Phase 98A finding: TI-84 CE large font is at ROM 0x0040ee, 28 bytes per glyph,
// 8 columns × 14 rows, 2 bits per pixel (anti-aliased). Index = char_code - 0x20.
//
// Usage: import { buildFontSignatures, decodeVram } from './font-decoder.mjs';
//
// This module builds signatures for all 96 printable ASCII chars then scans
// a VRAM region row-by-row, matching each 8×14 cell against the signatures.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_BASE = 0x0040ee;
export const GLYPH_STRIDE = 28;
export const GLYPH_WIDTH = 8;
export const GLYPH_HEIGHT = 14;
export const VRAM_BASE = 0xD40000;
export const VRAM_WIDTH = 320;
export const VRAM_HEIGHT = 240;
export const VRAM_SENTINEL = 0xAAAA;

/** Decode a 28-byte glyph entry into a 8×14 binary bitmap (1 = fg, 0 = bg).
 * Format: 14 rows × 2 bytes/row. Each byte has 4 pixels at 2 bits each, MSB first.
 * A pixel is fg if its 2-bit value > 0 (any antialiasing level counts).
 */
export function decodeGlyph(romBytes, charCode) {
  const idx = charCode - 0x20;
  if (idx < 0 || idx > 0x5F) return null;
  const off = FONT_BASE + idx * GLYPH_STRIDE;
  const bitmap = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const b0 = romBytes[off + row * 2];
    const b1 = romBytes[off + row * 2 + 1];
    const word = (b0 << 8) | b1;
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      const pix2bpp = (word >> (14 - col * 2)) & 0x3;
      bitmap[row * GLYPH_WIDTH + col] = pix2bpp > 0 ? 1 : 0;
    }
  }
  return bitmap;
}

/** Build signatures for all printable ASCII chars (0x20..0x7E). */
export function buildFontSignatures(romBytes) {
  const signatures = [];
  for (let code = 0x20; code <= 0x7E; code++) {
    const bitmap = decodeGlyph(romBytes, code);
    if (!bitmap) continue;
    signatures.push({ code, char: String.fromCharCode(code), bitmap });
  }
  return signatures;
}

/** Extract an 8×14 cell from VRAM at pixel (row, col). Returns binary bitmap. */
export function extractCell(mem, row, col) {
  const cell = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  for (let dy = 0; dy < GLYPH_HEIGHT; dy++) {
    for (let dx = 0; dx < GLYPH_WIDTH; dx++) {
      const r = row + dy;
      const c = col + dx;
      if (r >= VRAM_HEIGHT || c >= VRAM_WIDTH) continue;
      const off = VRAM_BASE + (r * VRAM_WIDTH + c) * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      // Treat any non-white, non-sentinel pixel as fg
      cell[dy * GLYPH_WIDTH + dx] = (px !== 0xFFFF && px !== VRAM_SENTINEL) ? 1 : 0;
    }
  }
  return cell;
}

/** Hamming distance between two equal-length bitmaps. */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Match a VRAM cell against all signatures, return best match. */
export function matchCell(cell, signatures) {
  // All-zero cell = space
  let allZero = true;
  for (let i = 0; i < cell.length; i++) { if (cell[i]) { allZero = false; break; } }
  if (allZero) return { code: 0x20, char: ' ', dist: 0 };

  let best = null;
  for (const sig of signatures) {
    const d = hamming(cell, sig.bitmap);
    if (!best || d < best.dist) best = { code: sig.code, char: sig.char, dist: d };
  }
  return best;
}

/** Decode a VRAM row strip into a string.
 * @param {Uint8Array} mem full memory buffer
 * @param {number} startRow top VRAM row of the text strip
 * @param {number} startCol left VRAM col of the first cell
 * @param {number} numCells how many 8-wide cells to decode
 * @param {Array} signatures from buildFontSignatures
 * @param {number} maxDist only accept matches with hamming distance ≤ this (default 20)
 */
export function decodeTextStrip(mem, startRow, startCol, numCells, signatures, maxDist = 20) {
  const chars = [];
  for (let c = 0; c < numCells; c++) {
    const cell = extractCell(mem, startRow, startCol + c * GLYPH_WIDTH);
    const match = matchCell(cell, signatures);
    chars.push(match.dist <= maxDist ? match.char : '?');
  }
  return chars.join('');
}

// ─── CLI mode: dump some glyphs to verify ────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('font-decoder.mjs')) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

  console.log('=== Font decoder self-test ===');
  console.log(`Base: 0x${FONT_BASE.toString(16)}, stride: ${GLYPH_STRIDE}, glyph: ${GLYPH_WIDTH}x${GLYPH_HEIGHT}`);

  for (const ch of 'ABCN0 ') {
    const bitmap = decodeGlyph(romBytes, ch.charCodeAt(0));
    console.log(`\nGlyph '${ch}' (0x${ch.charCodeAt(0).toString(16)}):`);
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      let line = '  ';
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        line += bitmap[row * GLYPH_WIDTH + col] ? '#' : '.';
      }
      console.log(line);
    }
  }

  // Signatures for all printable chars
  const sigs = buildFontSignatures(romBytes);
  console.log(`\n${sigs.length} signatures built for 0x20..0x7E`);
}
