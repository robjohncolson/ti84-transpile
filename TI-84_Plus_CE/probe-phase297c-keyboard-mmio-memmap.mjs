#!/usr/bin/env node
// Phase 297c: Keyboard MMIO via MEMORY-MAPPED I/O (not port I/O)
//
// KEY FINDING from 297b: The TI-84 Plus CE uses memory-mapped I/O, not Z80 port I/O.
// The keyboard matrix is at memory address 0xE00900 (and surrounding addresses).
// Access is via LD A,(0xE009xx) and LD (0xE009xx),A — NOT via IN/OUT instructions.
//
// This probe scans the ROM for all direct memory reads/writes to 0xE009xx addresses.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rom = readFileSync(join(__dirname, 'ROM.rom'));
const romSize = rom.length;

function hex(v, w = 2) {
  return v.toString(16).toUpperCase().padStart(w, '0');
}

function hexDump(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    parts.push(idx >= 0 && idx < buf.length ? hex(buf[idx]) : '??');
  }
  return parts.join(' ');
}

console.log('=== Phase 297c: Keyboard MMIO via Memory-Mapped I/O ===');
console.log();

// ── Part 1: LD A,(imm24) = 3A lo mid hi where hi=E0, mid=09 ──
// This is the read path: LD A,(0xE009xx)
console.log('── Part 1: LD A,(0xE009xx) — keyboard matrix reads ──');
console.log();

const reads = [];
for (let i = 0; i < romSize - 3; i++) {
  if (rom[i] === 0x3A) {
    const lo = rom[i + 1];
    const mid = rom[i + 2];
    const hi = rom[i + 3];
    if (hi === 0xE0 && mid === 0x09) {
      const addr = (hi << 16) | (mid << 8) | lo;
      reads.push({ romAddr: i, memAddr: addr, lo });
    }
  }
}

// Group by target address
const readsByAddr = {};
for (const r of reads) {
  const key = r.memAddr;
  if (!readsByAddr[key]) readsByAddr[key] = [];
  readsByAddr[key].push(r.romAddr);
}

for (const [addr, sites] of Object.entries(readsByAddr).sort((a, b) => parseInt(a) - parseInt(b))) {
  const addrHex = '0x' + hex(parseInt(addr), 6);
  console.log(`  LD A,(${addrHex}): ${sites.length} site(s)`);
  for (const s of sites) {
    console.log(`    @ 0x${hex(s, 6)}  hex: ${hexDump(rom, Math.max(0, s - 4), 20)}`);
  }
  console.log();
}
console.log(`  Total keyboard reads: ${reads.length}`);
console.log();

// ── Part 2: LD (imm24),A = 32 lo mid hi where hi=E0, mid=09 ──
// This is the write path: LD (0xE009xx),A
console.log('── Part 2: LD (0xE009xx),A — keyboard matrix writes ──');
console.log();

const writes = [];
for (let i = 0; i < romSize - 3; i++) {
  if (rom[i] === 0x32) {
    const lo = rom[i + 1];
    const mid = rom[i + 2];
    const hi = rom[i + 3];
    if (hi === 0xE0 && mid === 0x09) {
      const addr = (hi << 16) | (mid << 8) | lo;
      writes.push({ romAddr: i, memAddr: addr, lo });
    }
  }
}

const writesByAddr = {};
for (const w of writes) {
  const key = w.memAddr;
  if (!writesByAddr[key]) writesByAddr[key] = [];
  writesByAddr[key].push(w.romAddr);
}

for (const [addr, sites] of Object.entries(writesByAddr).sort((a, b) => parseInt(a) - parseInt(b))) {
  const addrHex = '0x' + hex(parseInt(addr), 6);
  console.log(`  LD (${addrHex}),A: ${sites.length} site(s)`);
  for (const s of sites) {
    console.log(`    @ 0x${hex(s, 6)}  hex: ${hexDump(rom, Math.max(0, s - 4), 20)}`);
  }
  console.log();
}
console.log(`  Total keyboard writes: ${writes.length}`);
console.log();

// ── Part 3: LD HL,0xE009xx followed by LD A,(HL) or LD (HL),A ──
// Indirect access pattern: LD HL,addr; ... LD A,(HL)
console.log('── Part 3: LD HL,0xE009xx (indirect keyboard access setup) ──');
console.log();

const hlLoads = [];
for (let i = 0; i < romSize - 3; i++) {
  if (rom[i] === 0x21) {
    const lo = rom[i + 1];
    const mid = rom[i + 2];
    const hi = rom[i + 3];
    if (hi === 0xE0 && mid === 0x09) {
      const addr = (hi << 16) | (mid << 8) | lo;
      hlLoads.push({ romAddr: i, memAddr: addr });
    }
  }
}

for (const h of hlLoads) {
  console.log(`  LD HL,0x${hex(h.memAddr, 6)} @ 0x${hex(h.romAddr, 6)}  hex: ${hexDump(rom, h.romAddr, 20)}`);
}
console.log(`  Total LD HL,0xE009xx: ${hlLoads.length}`);
console.log();

// ── Part 4: LD BC/DE/IX/IY pointing to 0xE009xx ──
console.log('── Part 4: Other register loads pointing to 0xE009xx ──');
console.log();

// LD BC,imm24 = 01, LD DE,imm24 = 11, LD IX,imm24 = DD 21, LD IY,imm24 = FD 21
for (let i = 0; i < romSize - 3; i++) {
  // LD BC
  if (rom[i] === 0x01 && rom[i + 3] === 0xE0 && rom[i + 2] === 0x09) {
    const addr = (rom[i + 3] << 16) | (rom[i + 2] << 8) | rom[i + 1];
    console.log(`  LD BC,0x${hex(addr, 6)} @ 0x${hex(i, 6)}`);
  }
  // LD DE
  if (rom[i] === 0x11 && rom[i + 3] === 0xE0 && rom[i + 2] === 0x09) {
    const addr = (rom[i + 3] << 16) | (rom[i + 2] << 8) | rom[i + 1];
    console.log(`  LD DE,0x${hex(addr, 6)} @ 0x${hex(i, 6)}`);
  }
  // LD IX,imm24 = DD 21
  if (rom[i] === 0xDD && rom[i + 1] === 0x21 && i + 4 < romSize && rom[i + 4] === 0xE0 && rom[i + 3] === 0x09) {
    const addr = (rom[i + 4] << 16) | (rom[i + 3] << 8) | rom[i + 2];
    console.log(`  LD IX,0x${hex(addr, 6)} @ 0x${hex(i, 6)}`);
  }
  // LD IY,imm24 = FD 21
  if (rom[i] === 0xFD && rom[i + 1] === 0x21 && i + 4 < romSize && rom[i + 4] === 0xE0 && rom[i + 3] === 0x09) {
    const addr = (rom[i + 4] << 16) | (rom[i + 3] << 8) | rom[i + 2];
    console.log(`  LD IY,0x${hex(addr, 6)} @ 0x${hex(i, 6)}`);
  }
}
console.log();

// ── Part 5: Broader 0xE009xx reference scan (any 3-byte sequence 00 09 E0) ──
console.log('── Part 5: All occurrences of byte pattern 00 09 E0 through FF 09 E0 ──');
console.log();

const allRefs = [];
for (let i = 0; i < romSize - 2; i++) {
  if (rom[i + 2] === 0xE0 && rom[i + 1] === 0x09) {
    const lo = rom[i];
    const addr = 0xE00900 | lo;
    allRefs.push({ romAddr: i, memAddr: addr, lo });
  }
}

// Group by memory address
const refsByAddr = {};
for (const r of allRefs) {
  const key = r.memAddr;
  if (!refsByAddr[key]) refsByAddr[key] = [];
  refsByAddr[key].push(r.romAddr);
}

console.log('  Address         Count   ROM sites (first 8)');
for (const [addr, sites] of Object.entries(refsByAddr).sort((a, b) => parseInt(a) - parseInt(b))) {
  const addrHex = '0x' + hex(parseInt(addr), 6);
  const siteList = sites.slice(0, 8).map(s => '0x' + hex(s, 6)).join(', ');
  const more = sites.length > 8 ? ` +${sites.length - 8} more` : '';
  console.log(`  ${addrHex}      ${String(sites.length).padStart(4)}   ${siteList}${more}`);
}
console.log(`  Total references to 0xE009xx: ${allRefs.length}`);
console.log();

// ── Part 6: Cluster the read/write sites to identify scanner routines ──
console.log('── Part 6: Keyboard scanner routine identification ──');
console.log();

const allKbSites = [
  ...reads.map(r => ({ addr: r.romAddr, type: 'READ', target: r.memAddr })),
  ...writes.map(w => ({ addr: w.romAddr, type: 'WRITE', target: w.memAddr })),
];
allKbSites.sort((a, b) => a.addr - b.addr);

if (allKbSites.length === 0) {
  console.log('  No direct keyboard MMIO sites found.');
} else {
  const clusters = [];
  let current = [allKbSites[0]];
  for (let i = 1; i < allKbSites.length; i++) {
    if (allKbSites[i].addr - current[current.length - 1].addr < 128) {
      current.push(allKbSites[i]);
    } else {
      clusters.push(current);
      current = [allKbSites[i]];
    }
  }
  clusters.push(current);

  for (let ci = 0; ci < clusters.length; ci++) {
    const c = clusters[ci];
    const lo = c[0].addr;
    const hi = c[c.length - 1].addr;
    console.log(`  Cluster ${ci + 1}: 0x${hex(lo, 6)} – 0x${hex(hi, 6)} (${c.length} access(es))`);
    for (const s of c) {
      console.log(`    ${s.type} 0x${hex(s.target, 6)} @ 0x${hex(s.addr, 6)}`);
    }
    console.log();
  }
}

// ── Part 7: Extended disassembly of 0x0159C0 scanner ──
console.log('── Part 7: Disassembly of keyboard scanner at 0x0159C0 ──');
console.log();
// Let's dump raw bytes and manually identify the keyboard access pattern
const scanStart = 0x0159C0;
const scanLen = 256;
console.log(`  Raw hex dump 0x${hex(scanStart, 6)} - 0x${hex(scanStart + scanLen, 6)}:`);
for (let row = 0; row < scanLen; row += 16) {
  const addr = scanStart + row;
  let line = `  ${hex(addr, 6)}:  `;
  const bytes = [];
  const ascii = [];
  for (let col = 0; col < 16; col++) {
    const idx = addr + col;
    if (idx < romSize) {
      bytes.push(hex(rom[idx]));
      const ch = rom[idx];
      ascii.push(ch >= 0x20 && ch < 0x7F ? String.fromCharCode(ch) : '.');
    }
  }
  console.log(`  ${hex(addr, 6)}: ${bytes.join(' ')}  ${ascii.join('')}`);
}

console.log();
console.log('=== Phase 297c complete ===');
