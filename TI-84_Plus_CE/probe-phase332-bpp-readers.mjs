#!/usr/bin/env node
// Phase 332: Map all BPP-flag reader blocks in the ROM
//
// The BPP flag lives at IY+70 (byte address D000C6) bit 2.
//   clear = 16bpp,  set = 8bpp
// Writers: SET 2,(IY+70) at 0x05527A, RES 2,(IY+70) at 0x05522C
//
// Three access patterns:
//   Pattern A: BIT 2,(IY+70)          -> FD CB 46 56
//   Pattern B: LD A,(D000C6) (.LIL)   -> 5B 3A C6 00 D0  (or without .LIL prefix)
//   Pattern C: LD A,(HL) via helper at 0x08C308 loading D000C6 into HL first

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase332-bpp-readers-report.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const ROM_SIZE = rom.length;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

/** Read `count` bytes starting at `addr` and return hex string. */
function hexDump(addr, count) {
  const bytes = [];
  for (let i = 0; i < count && addr + i < ROM_SIZE; i++) {
    bytes.push(rom[addr + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

/** Classify an address into a subsystem name. */
function classifySubsystem(addr) {
  if (addr >= 0x052000 && addr < 0x054000) return 'Text rendering';
  if (addr >= 0x054000 && addr < 0x055000) return 'Pixel writing';
  if (addr >= 0x055000 && addr < 0x056000) return 'LCD / VRAM / mode-switch';
  if (addr >= 0x056000 && addr < 0x058000) return 'Fill / rect';
  if (addr >= 0x09E000 && addr < 0x0A0000) return 'Graph engine';
  if (addr >= 0x08C000 && addr < 0x08E000) return 'Graph / helper';
  if (addr >= 0x050000 && addr < 0x052000) return 'Display setup';
  if (addr >= 0x058000 && addr < 0x060000) return 'Graphics misc';
  if (addr >= 0x080000 && addr < 0x090000) return 'Kernel / system';
  if (addr >= 0x090000 && addr < 0x0A0000) return 'Math / graph';
  if (addr >= 0x0A0000 && addr < 0x0B0000) return 'App / init';
  if (addr >= 0x040000 && addr < 0x050000) return 'Low ROM';
  return 'Other (0x' + (addr >>> 0).toString(16).padStart(6, '0').slice(0, 3) + 'xxx)';
}

/** Try to identify the containing function by scanning backward for a common prologue. */
function findPrologue(addr) {
  // Look for PUSH AF (F5), PUSH IX (DD E5), PUSH IY (FD E5) within 64 bytes back
  const searchBack = 64;
  const start = Math.max(0, addr - searchBack);
  for (let i = addr - 1; i >= start; i--) {
    // PUSH IX = DD E5, PUSH IY = FD E5, PUSH AF = F5
    if (rom[i] === 0xDD && rom[i + 1] === 0xE5) return i;
    if (rom[i] === 0xFD && rom[i + 1] === 0xE5) return i;
    if (rom[i] === 0xF5) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pattern scanners
// ---------------------------------------------------------------------------

const results = [];

// Pattern A: BIT 2,(IY+70) = FD CB 46 56
console.log('Scanning for Pattern A: BIT 2,(IY+70) = FD CB 46 56 ...');
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0xCB && rom[i + 2] === 0x46 && rom[i + 3] === 0x56) {
    const prologue = findPrologue(i);
    results.push({
      address: i,
      pattern: 'BIT 2,(IY+70)',
      encoding: 'FD CB 46 56',
      subsystem: classifySubsystem(i),
      prologueAddr: prologue,
      contextBefore: hexDump(Math.max(0, i - 8), 8),
      contextAfter: hexDump(i + 4, 12),
    });
  }
}

// Pattern B1: LD.LIL A,(D000C6) = 5B 3A C6 00 D0
console.log('Scanning for Pattern B1: LD.LIL A,(D000C6) = 5B 3A C6 00 D0 ...');
for (let i = 0; i < ROM_SIZE - 4; i++) {
  if (rom[i] === 0x5B && rom[i + 1] === 0x3A && rom[i + 2] === 0xC6 &&
      rom[i + 3] === 0x00 && rom[i + 4] === 0xD0) {
    const prologue = findPrologue(i);
    results.push({
      address: i,
      pattern: 'LD.LIL A,(D000C6)',
      encoding: '5B 3A C6 00 D0',
      subsystem: classifySubsystem(i),
      prologueAddr: prologue,
      contextBefore: hexDump(Math.max(0, i - 8), 8),
      contextAfter: hexDump(i + 5, 12),
    });
  }
}

// Pattern B2: LD A,(D000C6) without .LIL = 3A C6 00 D0  (but NOT preceded by 5B)
console.log('Scanning for Pattern B2: LD A,(D000C6) = 3A C6 00 D0 (no .LIL prefix) ...');
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0x3A && rom[i + 1] === 0xC6 && rom[i + 2] === 0x00 && rom[i + 3] === 0xD0) {
    // Skip if this is part of a 5B 3A sequence (already found as Pattern B1)
    if (i > 0 && rom[i - 1] === 0x5B) continue;
    const prologue = findPrologue(i);
    results.push({
      address: i,
      pattern: 'LD A,(D000C6)',
      encoding: '3A C6 00 D0',
      subsystem: classifySubsystem(i),
      prologueAddr: prologue,
      contextBefore: hexDump(Math.max(0, i - 8), 8),
      contextAfter: hexDump(i + 4, 12),
    });
  }
}

// Pattern C: Look for loads of D000C6 into HL then LD A,(HL) or BIT 2,(HL)
// LD HL,D000C6 (.LIL) = 5B 21 C6 00 D0   or  49 21 C6 00 D0
console.log('Scanning for Pattern C: LD HL,D000C6 = 5B 21 C6 00 D0 ...');
for (let i = 0; i < ROM_SIZE - 4; i++) {
  if ((rom[i] === 0x5B || rom[i] === 0x49) &&
      rom[i + 1] === 0x21 && rom[i + 2] === 0xC6 &&
      rom[i + 3] === 0x00 && rom[i + 4] === 0xD0) {
    const prologue = findPrologue(i);
    results.push({
      address: i,
      pattern: 'LD HL,D000C6 (indirect)',
      encoding: hexDump(i, 5),
      subsystem: classifySubsystem(i),
      prologueAddr: prologue,
      contextBefore: hexDump(Math.max(0, i - 8), 8),
      contextAfter: hexDump(i + 5, 16),
    });
  }
}

// Also search for LD.LIL HL, imm24 without prefix: 21 C6 00 D0
// (less common, but check anyway — skip if preceded by 5B or 49)
console.log('Scanning for Pattern C2: LD HL,D000C6 = 21 C6 00 D0 (no prefix) ...');
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0x21 && rom[i + 1] === 0xC6 && rom[i + 2] === 0x00 && rom[i + 3] === 0xD0) {
    if (i > 0 && (rom[i - 1] === 0x5B || rom[i - 1] === 0x49)) continue;
    const prologue = findPrologue(i);
    results.push({
      address: i,
      pattern: 'LD HL,D000C6 (indirect, no prefix)',
      encoding: '21 C6 00 D0',
      subsystem: classifySubsystem(i),
      prologueAddr: prologue,
      contextBefore: hexDump(Math.max(0, i - 8), 8),
      contextAfter: hexDump(i + 4, 16),
    });
  }
}

// Also check for the known BPP writers for completeness
const writers = [];
console.log('\nScanning for BPP writers (SET/RES 2,(IY+70)) ...');
// SET 2,(IY+70) = FD CB 46 D6
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0xCB && rom[i + 2] === 0x46 && rom[i + 3] === 0xD6) {
    writers.push({ address: i, pattern: 'SET 2,(IY+70)', encoding: 'FD CB 46 D6' });
  }
}
// RES 2,(IY+70) = FD CB 46 96
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0xCB && rom[i + 2] === 0x46 && rom[i + 3] === 0x96) {
    writers.push({ address: i, pattern: 'RES 2,(IY+70)', encoding: 'FD CB 46 96' });
  }
}

// ---------------------------------------------------------------------------
// Sort and display
// ---------------------------------------------------------------------------

results.sort((a, b) => a.address - b.address);

console.log('\n========================================');
console.log(' BPP Flag Reader Blocks');
console.log('========================================\n');
console.log(`Total readers found: ${results.length}`);
console.log(`Total writers found: ${writers.length}\n`);

// Group by subsystem
const groups = {};
for (const r of results) {
  if (!groups[r.subsystem]) groups[r.subsystem] = [];
  groups[r.subsystem].push(r);
}

const subsystemOrder = [
  'Text rendering',
  'Pixel writing',
  'LCD / VRAM / mode-switch',
  'Fill / rect',
  'Display setup',
  'Graphics misc',
  'Graph engine',
  'Graph / helper',
  'Kernel / system',
  'Math / graph',
  'App / init',
  'Low ROM',
];

// Print grouped table
for (const subsys of [...subsystemOrder, ...Object.keys(groups).filter(k => !subsystemOrder.includes(k))]) {
  const items = groups[subsys];
  if (!items || items.length === 0) continue;

  console.log(`\n--- ${subsys} (${items.length} readers) ---`);
  console.log('  Address    | Pattern                          | Prologue   | After bytes');
  console.log('  -----------|----------------------------------|------------|---------------------------');
  for (const r of items) {
    const pStr = r.prologueAddr !== null ? hex(r.prologueAddr) : '  n/a   ';
    console.log(`  ${hex(r.address)} | ${r.pattern.padEnd(32)} | ${pStr} | ${r.contextAfter}`);
  }
}

// Print writers
console.log('\n--- BPP Flag Writers ---');
for (const w of writers) {
  console.log(`  ${hex(w.address)} | ${w.pattern} | ${w.encoding}`);
}

// ---------------------------------------------------------------------------
// Critical path analysis
// ---------------------------------------------------------------------------

console.log('\n========================================');
console.log(' Critical Text Rendering Path Analysis');
console.log('========================================\n');

// Known PutC pipeline addresses from session 331:
// PutC entry ~0x0520F0, draw_inner ~0x052xxx, pixel writers ~0x054xxx-0x055xxx
const criticalRanges = [
  { name: 'PutC / text entry', lo: 0x051000, hi: 0x053000 },
  { name: 'Pixel writer / glyph blit', lo: 0x053000, hi: 0x056000 },
];

console.log('Readers on the critical text rendering path (PutC -> draw_inner -> pixel writer -> VRAM):');
for (const range of criticalRanges) {
  const critical = results.filter(r => r.address >= range.lo && r.address < range.hi);
  if (critical.length === 0) continue;
  console.log(`\n  ${range.name} (${hex(range.lo)}-${hex(range.hi)}):`);
  for (const r of critical) {
    console.log(`    ${hex(r.address)} ${r.pattern}`);
    // Look at what follows: JR Z / JR NZ indicates branch on bpp
    const after = [];
    for (let j = 0; j < 12; j++) after.push(rom[r.address + (r.encoding.split(' ').length) + j]);
    const afterHex = after.map(b => b.toString(16).padStart(2, '0')).join(' ');

    // Check for JR NZ (0x20) or JR Z (0x28) or JP NZ (0xC2) or JP Z (0xCA)
    for (let j = 0; j < after.length - 1; j++) {
      if (after[j] === 0x20) {
        const offset = after[j + 1] > 127 ? after[j + 1] - 256 : after[j + 1];
        const target = r.address + r.encoding.split(' ').length + j + 2 + offset;
        console.log(`      -> JR NZ,${hex(target)} (branch to ${offset >= 0 ? '8' : '16'}bpp path)`);
        break;
      }
      if (after[j] === 0x28) {
        const offset = after[j + 1] > 127 ? after[j + 1] - 256 : after[j + 1];
        const target = r.address + r.encoding.split(' ').length + j + 2 + offset;
        console.log(`      -> JR Z,${hex(target)} (branch to ${offset >= 0 ? '16' : '8'}bpp path)`);
        break;
      }
      if (after[j] === 0xC2) {
        const target = after[j + 1] | (after[j + 2] << 8) | (after[j + 3] << 16);
        console.log(`      -> JP NZ,${hex(target)} (branch to 8bpp path)`);
        break;
      }
      if (after[j] === 0xCA) {
        const target = after[j + 1] | (after[j + 2] << 8) | (after[j + 3] << 16);
        console.log(`      -> JP Z,${hex(target)} (branch to 16bpp path)`);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 16bpp vs 8bpp behavior summary
// ---------------------------------------------------------------------------

console.log('\n========================================');
console.log(' 16bpp vs 8bpp Behavior Differences');
console.log('========================================\n');
console.log('Per-group expected differences:');
console.log('');
console.log('  Text rendering:');
console.log('    16bpp: stride = 640 bytes/row (320 pixels * 2 bytes), RGB565 pixel format');
console.log('    8bpp:  stride = 320 bytes/row (320 pixels * 1 byte), palette-indexed format');
console.log('');
console.log('  Pixel writing:');
console.log('    16bpp: 2 bytes per pixel write (16-bit color)');
console.log('    8bpp:  1 byte per pixel write (palette index)');
console.log('');
console.log('  LCD / VRAM / mode-switch:');
console.log('    16bpp: VRAM base 0xD40000, size = 320*240*2 = 153600 bytes');
console.log('    8bpp:  VRAM base 0xD40000, size = 320*240*1 = 76800 bytes');
console.log('    Mode-switch copies 13-byte config block to LCD controller registers');
console.log('');
console.log('  Fill / rect:');
console.log('    16bpp: fills with 16-bit color values, stride*2 row advance');
console.log('    8bpp:  fills with 8-bit palette indices, stride*1 row advance');
console.log('');
console.log('  Graph engine:');
console.log('    16bpp: plot pixel = 2-byte write at (row*640 + col*2 + VRAM_BASE)');
console.log('    8bpp:  plot pixel = 1-byte write at (row*320 + col + VRAM_BASE)');

// ---------------------------------------------------------------------------
// Generate report
// ---------------------------------------------------------------------------

const lines = [];
lines.push('# Phase 332 — BPP Flag Reader Map');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`## Summary`);
lines.push('');
lines.push(`- **Total readers found**: ${results.length}`);
lines.push(`- **Total writers found**: ${writers.length}`);
lines.push(`- **Subsystems**: ${Object.keys(groups).length}`);
lines.push('');

// Pattern breakdown
const patternCounts = {};
for (const r of results) {
  patternCounts[r.pattern] = (patternCounts[r.pattern] || 0) + 1;
}
lines.push('### Access pattern breakdown');
lines.push('');
for (const [p, c] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
  lines.push(`- ${p}: ${c}`);
}
lines.push('');

lines.push('## Readers by Subsystem');
lines.push('');
for (const subsys of [...subsystemOrder, ...Object.keys(groups).filter(k => !subsystemOrder.includes(k))]) {
  const items = groups[subsys];
  if (!items || items.length === 0) continue;
  lines.push(`### ${subsys} (${items.length})`);
  lines.push('');
  lines.push('| Address | Pattern | Prologue | Context after |');
  lines.push('|---------|---------|----------|---------------|');
  for (const r of items) {
    const pStr = r.prologueAddr !== null ? hex(r.prologueAddr) : 'n/a';
    lines.push(`| ${hex(r.address)} | ${r.pattern} | ${pStr} | \`${r.contextAfter}\` |`);
  }
  lines.push('');
}

lines.push('## Writers');
lines.push('');
lines.push('| Address | Pattern |');
lines.push('|---------|---------|');
for (const w of writers) {
  lines.push(`| ${hex(w.address)} | ${w.pattern} |`);
}
lines.push('');

lines.push('## JSON Export');
lines.push('');
lines.push('```json');
lines.push(JSON.stringify({
  readers: results.map(r => ({
    address: hex(r.address),
    pattern: r.pattern,
    subsystem: r.subsystem,
    prologueAddr: r.prologueAddr !== null ? hex(r.prologueAddr) : null,
  })),
  writers: writers.map(w => ({
    address: hex(w.address),
    pattern: w.pattern,
  })),
}, null, 2));
lines.push('```');

fs.writeFileSync(REPORT_PATH, lines.join('\n'));
console.log(`\nReport written to ${REPORT_PATH}`);
console.log('\nDone.');
