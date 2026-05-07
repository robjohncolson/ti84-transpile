#!/usr/bin/env node
// Phase 205 — Scan ROM for all SET/RES/BIT 7,(IY+0x0C) and direct writes to 0xD0008C

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Helpers ---

function hexAddr(addr) {
  return '0x' + addr.toString(16).padStart(6, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0');
}

function contextBytes(addr, before, after) {
  const start = Math.max(0, addr - before);
  const end = Math.min(rom.length, addr + after);
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(hexByte(rom[i]));
  }
  return bytes.join(' ');
}

function areaLabel(addr) {
  if (addr < 0x010000) return 'boot/ISR';
  if (addr < 0x020000) return 'low-OS';
  if (addr < 0x030000) return 'graphics/LCD';
  if (addr < 0x040000) return 'font/draw';
  if (addr < 0x050000) return 'menus/apps';
  if (addr < 0x060000) return 'key dispatch';
  if (addr < 0x070000) return 'editor';
  if (addr < 0x080000) return 'FP/math';
  if (addr < 0x090000) return 'core OS';
  if (addr < 0x0A0000) return 'STAT/parser';
  if (addr < 0x100000) return 'upper OS';
  if (addr < 0x200000) return 'apps region 1';
  if (addr < 0x300000) return 'apps region 2';
  if (addr < 0x3C0000) return 'apps region 3';
  return 'certificate/end';
}

// --- Pattern definitions ---
// eZ80 prefixed bit ops: FD CB dd op
//   SET 7,(IY+d) = FD CB dd FE
//   RES 7,(IY+d) = FD CB dd BE
//   BIT 7,(IY+d) = FD CB dd 7E
// With d = 0x0C (IY+12)

const patterns = [
  { name: 'SET 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0xFE] },
  { name: 'RES 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0xBE] },
  { name: 'BIT 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0x7E] },
];

// Direct address patterns for 0xD0008C (little-endian: 8C 00 D0)
// LD (0xD0008C),A = 32 8C 00 D0 (eZ80 long)
// LD A,(0xD0008C) = 3A 8C 00 D0
// Also check for eZ80 suffixed variants with .LIL prefix (5B for LD)
const directPatterns = [
  { name: 'LD (0xD0008C),A', bytes: [0x32, 0x8C, 0x00, 0xD0] },
  { name: 'LD A,(0xD0008C)', bytes: [0x3A, 0x8C, 0x00, 0xD0] },
];

// Also look for the 3-byte address embedded in other contexts
// OR/AND with memory at 0xD0008C would be unusual but let's look for the address
const addressBytes = [0x8C, 0x00, 0xD0];

// --- Scan ---

function scanPattern(patternObj) {
  const results = [];
  const { bytes } = patternObj;
  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let match = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) { match = false; break; }
    }
    if (match) {
      results.push({
        addr: i,
        area: areaLabel(i),
        context: contextBytes(i, 10, bytes.length + 10),
      });
    }
  }
  return results;
}

function scanAddressRefs() {
  // Look for any occurrence of 8C 00 D0 (the 3-byte LE address of 0xD0008C)
  const results = [];
  for (let i = 0; i <= rom.length - 3; i++) {
    if (rom[i] === 0x8C && rom[i + 1] === 0x00 && rom[i + 2] === 0xD0) {
      // Check the byte before for common opcodes
      const prevByte = i > 0 ? rom[i - 1] : null;
      let instrGuess = 'unknown';
      if (prevByte === 0x32) instrGuess = 'LD (nn),A';
      else if (prevByte === 0x3A) instrGuess = 'LD A,(nn)';
      else if (prevByte === 0x21) instrGuess = 'LD HL,nn';
      else if (prevByte === 0x01) instrGuess = 'LD BC,nn';
      else if (prevByte === 0x11) instrGuess = 'LD DE,nn';
      else if (prevByte === 0x22) instrGuess = 'LD (nn),HL';
      else if (prevByte === 0x2A) instrGuess = 'LD HL,(nn)';
      else if (prevByte === 0xCD) instrGuess = 'CALL nn';
      else if (prevByte === 0xC3) instrGuess = 'JP nn';
      else instrGuess = `prev=0x${hexByte(prevByte)}`;

      results.push({
        addr: i,
        area: areaLabel(i),
        instrGuess,
        context: contextBytes(i - 4, 0, 10),
      });
    }
  }
  return results;
}

// --- Run ---

console.log('=== Phase 205: BIT 7,(IY+12) setter/resetter scan ===');
console.log(`IY base = 0xD00080, IY+12 = IY+0x0C = physical 0xD0008C\n`);

const allResults = {};

for (const pat of patterns) {
  const hits = scanPattern(pat);
  allResults[pat.name] = hits;
  console.log(`--- ${pat.name} (${hits.length} hits) ---`);
  for (const h of hits) {
    console.log(`  ${hexAddr(h.addr)}  [${h.area}]  ${h.context}`);
  }
  console.log();
}

for (const pat of directPatterns) {
  const hits = scanPattern(pat);
  allResults[pat.name] = hits;
  console.log(`--- ${pat.name} (${hits.length} hits) ---`);
  for (const h of hits) {
    console.log(`  ${hexAddr(h.addr)}  [${h.area}]  ${h.context}`);
  }
  console.log();
}

console.log('--- Direct address refs to 0xD0008C (8C 00 D0 in ROM) ---');
const addrRefs = scanAddressRefs();
console.log(`  ${addrRefs.length} total occurrences of bytes 8C 00 D0:\n`);
for (const r of addrRefs) {
  console.log(`  ${hexAddr(r.addr)}  [${r.area}]  ${r.instrGuess}  ${r.context}`);
}
console.log();

// --- Summary ---
console.log('=== SUMMARY ===');
for (const pat of patterns) {
  console.log(`  ${pat.name}: ${allResults[pat.name].length} sites`);
}
for (const pat of directPatterns) {
  console.log(`  ${pat.name}: ${allResults[pat.name].length} sites`);
}
console.log(`  Direct 0xD0008C refs: ${addrRefs.length} sites`);

// Group by area
const areaMap = {};
for (const pat of [...patterns, ...directPatterns]) {
  for (const h of allResults[pat.name]) {
    if (!areaMap[h.area]) areaMap[h.area] = [];
    areaMap[h.area].push({ type: pat.name, addr: hexAddr(h.addr) });
  }
}
for (const r of addrRefs) {
  if (!areaMap[r.area]) areaMap[r.area] = [];
  areaMap[r.area].push({ type: `addr-ref (${r.instrGuess})`, addr: hexAddr(r.addr) });
}

console.log('\n=== BY AREA ===');
for (const [area, entries] of Object.entries(areaMap).sort()) {
  console.log(`  ${area} (${entries.length}):`);
  for (const e of entries) {
    console.log(`    ${e.addr}  ${e.type}`);
  }
}

console.log('\n=== KEY FINDING ===');
const setCount = allResults['SET 7,(IY+0x0C)'].length;
const resCount = allResults['RES 7,(IY+0x0C)'].length;
const bitCount = allResults['BIT 7,(IY+0x0C)'].length;
console.log(`SET sites: ${setCount}, RES sites: ${resCount}, BIT test sites: ${bitCount}`);
console.log(`Direct addr refs: ${addrRefs.length}`);
if (setCount > 0) {
  console.log('\nSET 7 sites are where Level 1 dispatch gets armed:');
  for (const h of allResults['SET 7,(IY+0x0C)']) {
    console.log(`  ${hexAddr(h.addr)} [${h.area}]`);
  }
}
if (resCount > 0) {
  console.log('\nRES 7 sites are where Level 2 (cxMain) dispatch gets enabled:');
  for (const h of allResults['RES 7,(IY+0x0C)']) {
    console.log(`  ${hexAddr(h.addr)} [${h.area}]`);
  }
}
