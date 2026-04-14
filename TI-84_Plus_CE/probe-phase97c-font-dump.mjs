#!/usr/bin/env node
// Phase 97c: Dump font table at 0x003d6e, try layout interpretations, pick the right one.
// Goal: identify glyph dimensions empirically. 28 bytes/glyph.
// Candidates: 14 rows × 2 bytes (14×16), 7 rows × 4 bytes (7×32), 28 rows × 1 byte (28×8).
//             Also: 11 rows × 2 bytes + 6-byte header = 28 bytes (11×16).
//             Or CE-specific: variable-width 7×8 + metadata.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const FONT_BASE = 0x003d6e;
const GLYPH_STRIDE = 28;

// Dump first 16 glyphs as raw hex
console.log(`\n=== Raw hex dump (first 16 glyphs from 0x${FONT_BASE.toString(16)}) ===`);
for (let i = 0; i < 16; i++) {
  const off = FONT_BASE + i * GLYPH_STRIDE;
  const bytes = Array.from(romBytes.slice(off, off + GLYPH_STRIDE))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`g${i.toString(16).padStart(2,'0')} @0x${off.toString(16)}: ${bytes}`);
}

// Try layout A: 14 rows × 16 pixels (2 bytes/row, MSB-first)
function renderLayoutA(glyphIdx) {
  const off = FONT_BASE + glyphIdx * GLYPH_STRIDE;
  const rows = [];
  for (let r = 0; r < 14; r++) {
    const hi = romBytes[off + r * 2];
    const lo = romBytes[off + r * 2 + 1];
    const bits = (hi << 8) | lo;
    let s = '';
    for (let c = 15; c >= 0; c--) s += (bits >> c) & 1 ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

// Try layout B: 28 rows × 8 pixels (1 byte/row)
function renderLayoutB(glyphIdx) {
  const off = FONT_BASE + glyphIdx * GLYPH_STRIDE;
  const rows = [];
  for (let r = 0; r < 28; r++) {
    const b = romBytes[off + r];
    let s = '';
    for (let c = 7; c >= 0; c--) s += (b >> c) & 1 ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

// Try layout C: 11 rows × 16 pixels + 6 bytes header
function renderLayoutC(glyphIdx) {
  const off = FONT_BASE + glyphIdx * GLYPH_STRIDE;
  const header = Array.from(romBytes.slice(off, off + 6)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  const rows = [`hdr: ${header}`];
  for (let r = 0; r < 11; r++) {
    const hi = romBytes[off + 6 + r * 2];
    const lo = romBytes[off + 6 + r * 2 + 1];
    const bits = (hi << 8) | lo;
    let s = '';
    for (let c = 15; c >= 0; c--) s += (bits >> c) & 1 ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

// Try layout D: 14 rows × 8 pixels + 14 bytes metadata (14×8 + width info)
function renderLayoutD(glyphIdx) {
  const off = FONT_BASE + glyphIdx * GLYPH_STRIDE;
  const rows = [];
  for (let r = 0; r < 14; r++) {
    const b = romBytes[off + r];
    let s = '';
    for (let c = 7; c >= 0; c--) s += (b >> c) & 1 ? '#' : '.';
    rows.push(s);
  }
  rows.push(`meta: ${Array.from(romBytes.slice(off + 14, off + 28)).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);
  return rows;
}

// Render a candidate glyph for 'A' under each layout.
// Common ASCII start offsets: 0x20 (space), 0x21 (!). Try index = 0x41 - 0x20 = 0x21 or direct 0x41.
const testIndices = [0x20, 0x21, 0x41, 0x00];
const testLabels = ['idx=0x20 (space?)', 'idx=0x21 (!?)', 'idx=0x41 (A?)', 'idx=0x00'];

console.log('\n\n=== Layout A: 14 rows × 16 cols (2 bytes/row) ===');
for (let i = 0; i < testIndices.length; i++) {
  console.log(`\n-- ${testLabels[i]} --`);
  renderLayoutA(testIndices[i]).forEach(r => console.log(r));
}

console.log('\n\n=== Layout B: 28 rows × 8 cols (1 byte/row) ===');
for (let i = 0; i < testIndices.length; i++) {
  console.log(`\n-- ${testLabels[i]} --`);
  renderLayoutB(testIndices[i]).forEach(r => console.log(r));
}

console.log('\n\n=== Layout C: 6-byte header + 11 rows × 16 cols ===');
for (let i = 0; i < testIndices.length; i++) {
  console.log(`\n-- ${testLabels[i]} --`);
  renderLayoutC(testIndices[i]).forEach(r => console.log(r));
}

console.log('\n\n=== Layout D: 14 rows × 8 cols + 14-byte metadata ===');
for (let i = 0; i < testIndices.length; i++) {
  console.log(`\n-- ${testLabels[i]} --`);
  renderLayoutD(testIndices[i]).forEach(r => console.log(r));
}
