#!/usr/bin/env node
/**
 * Phase 496 — Full BCALL table scan for cursor position references
 *
 * Scans ALL 2,178 BCALL entries for references to D00595 (cursor row),
 * D00596 (cursor col), and 0x0059C6 (charRenderer) within the first
 * 200 bytes of each entry's target address. Pure static — no CPU needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const bcallTable = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'bcall-table.json'), 'utf8')
);

// Patterns (little-endian 24-bit addresses)
const PATTERN_CURSOR_ROW = [0x95, 0x05, 0xD0];    // D00595
const PATTERN_CURSOR_COL = [0x96, 0x05, 0xD0];     // D00596
const PATTERN_CHAR_RENDERER = [0xC6, 0x59, 0x00];  // 0059C6

const SCAN_WINDOW = 200;
const EXCLUDED_ENTRIES = new Set([826, 827, 828, 829, 830, 831, 832, 833]);

// ── helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesMatch(buf, offset, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (buf[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function scanForPatterns(rom, startAddr, length) {
  const matches = {
    cursorRow: [],
    cursorCol: [],
    charRenderer: [],
  };
  const end = Math.min(startAddr + length, rom.length - 3);
  for (let a = startAddr; a < end; a++) {
    if (bytesMatch(rom, a, PATTERN_CURSOR_ROW)) {
      matches.cursorRow.push(a - startAddr);
    }
    if (bytesMatch(rom, a, PATTERN_CURSOR_COL)) {
      matches.cursorCol.push(a - startAddr);
    }
    if (bytesMatch(rom, a, PATTERN_CHAR_RENDERER)) {
      matches.charRenderer.push(a - startAddr);
    }
  }
  return matches;
}

// ── main ────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 496 — Full BCALL Table Scan for Cursor Position References ===\n');
  console.log(`Scanning ${bcallTable.length} BCALL entries (excluding ${EXCLUDED_ENTRIES.size} eliminated entries)`);
  console.log(`Patterns: D00595 (cursorRow), D00596 (cursorCol), 0059C6 (charRenderer)`);
  console.log(`Scan window: first ${SCAN_WINDOW} bytes of each entry\n`);

  const hits = [];

  for (const entry of bcallTable) {
    if (EXCLUDED_ENTRIES.has(entry.index)) continue;

    const addr = parseInt(entry.target_hex, 16);
    if (addr >= romBytes.length) continue;

    const matches = scanForPatterns(romBytes, addr, SCAN_WINDOW);
    const totalHits =
      matches.cursorRow.length +
      matches.cursorCol.length +
      matches.charRenderer.length;

    if (totalHits > 0) {
      hits.push({
        entry: entry.index,
        addr,
        matches,
        totalHits,
      });
    }
  }

  // Sort by total match count descending
  hits.sort((a, b) => b.totalHits - a.totalHits);

  console.log(`--- Found ${hits.length} entries with pattern matches ---\n`);

  for (const h of hits) {
    const tags = [];
    if (h.matches.cursorRow.length > 0) {
      tags.push(`cursorRow(D00595) at offsets [${h.matches.cursorRow.join(', ')}]`);
    }
    if (h.matches.cursorCol.length > 0) {
      tags.push(`cursorCol(D00596) at offsets [${h.matches.cursorCol.join(', ')}]`);
    }
    if (h.matches.charRenderer.length > 0) {
      tags.push(`charRenderer(0059C6) at offsets [${h.matches.charRenderer.join(', ')}]`);
    }

    const hasBoth = h.matches.cursorRow.length > 0 && h.matches.cursorCol.length > 0;
    const marker = hasBoth ? ' *** BOTH ROW+COL ***' : '';

    console.log(`  Entry ${h.entry} @ ${hex(h.addr)} (${h.totalHits} hits)${marker}`);
    for (const t of tags) {
      console.log(`    ${t}`);
    }
  }

  // Summary: entries with both row and col
  const bothRowCol = hits.filter(
    h => h.matches.cursorRow.length > 0 && h.matches.cursorCol.length > 0
  );
  console.log(`\n--- Entries referencing BOTH cursorRow AND cursorCol: ${bothRowCol.length} ---\n`);
  for (const h of bothRowCol) {
    const hasChar = h.matches.charRenderer.length > 0 ? ' + charRenderer' : '';
    console.log(`  Entry ${h.entry} @ ${hex(h.addr)} (${h.totalHits} hits)${hasChar}`);
  }

  // Summary: entries with charRenderer
  const withChar = hits.filter(h => h.matches.charRenderer.length > 0);
  console.log(`\n--- Entries referencing charRenderer (0059C6): ${withChar.length} ---\n`);
  for (const h of withChar) {
    const hasRow = h.matches.cursorRow.length > 0 ? ' + cursorRow' : '';
    const hasCol = h.matches.cursorCol.length > 0 ? ' + cursorCol' : '';
    console.log(`  Entry ${h.entry} @ ${hex(h.addr)} (${h.totalHits} hits)${hasRow}${hasCol}`);
  }

  console.log('\nDone.');
}

main();
