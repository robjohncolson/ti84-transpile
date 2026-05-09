#!/usr/bin/env node

// Phase 280: Scan ROM for all references to D02AD7, D02AD8, D02AD9
// These addresses hold the 24-bit data pointer written by FindSym (0x0846EA)
// via 0x04C885. Goal: find who READS vs WRITES these bytes after FindSym stores them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

// Target addresses
const TARGETS = [
  { name: 'D02AD7', addr: 0xD02AD7, lo: 0xD7, mid: 0x2A, hi: 0xD0 },
  { name: 'D02AD8', addr: 0xD02AD8, lo: 0xD8, mid: 0x2A, hi: 0xD0 },
  { name: 'D02AD9', addr: 0xD02AD9, lo: 0xD9, mid: 0x2A, hi: 0xD0 },
];

// Also scan D005F8 (variable type byte) for context
const EXTRA_TARGETS = [
  { name: 'D005F8', addr: 0xD005F8, lo: 0xF8, mid: 0x05, hi: 0xD0 },
];

// eZ80 ADL-mode instruction patterns that reference a 24-bit absolute address
// Each pattern: opcode byte(s) before the 3-byte address, direction, decoded name
const PATTERNS = [
  // Readers (load FROM memory)
  { opcodes: [0x3A],       dir: 'read',  fmt: (a) => `LD A,(${a})` },
  { opcodes: [0x2A],       dir: 'read',  fmt: (a) => `LD HL,(${a})` },
  { opcodes: [0xED, 0x4B], dir: 'read',  fmt: (a) => `LD BC,(${a})` },
  { opcodes: [0xED, 0x5B], dir: 'read',  fmt: (a) => `LD DE,(${a})` },
  { opcodes: [0xED, 0x6B], dir: 'read',  fmt: (a) => `LD HL,(${a})` },  // alternate encoding
  { opcodes: [0xED, 0x7B], dir: 'read',  fmt: (a) => `LD SP,(${a})` },
  { opcodes: [0xDD, 0x2A], dir: 'read',  fmt: (a) => `LD IX,(${a})` },
  { opcodes: [0xFD, 0x2A], dir: 'read',  fmt: (a) => `LD IY,(${a})` },

  // Writers (store TO memory)
  { opcodes: [0x32],       dir: 'write', fmt: (a) => `LD (${a}),A` },
  { opcodes: [0x22],       dir: 'write', fmt: (a) => `LD (${a}),HL` },
  { opcodes: [0xED, 0x43], dir: 'write', fmt: (a) => `LD (${a}),BC` },
  { opcodes: [0xED, 0x53], dir: 'write', fmt: (a) => `LD (${a}),DE` },
  { opcodes: [0xED, 0x63], dir: 'write', fmt: (a) => `LD (${a}),HL` },  // alternate encoding
  { opcodes: [0xED, 0x73], dir: 'write', fmt: (a) => `LD (${a}),SP` },
  { opcodes: [0xDD, 0x22], dir: 'write', fmt: (a) => `LD (${a}),IX` },
  { opcodes: [0xFD, 0x22], dir: 'write', fmt: (a) => `LD (${a}),IY` },
];

// eZ80 mode prefixes
const MODE_PREFIXES = [
  { byte: 0x40, name: '.SIS' },
  { byte: 0x49, name: '.LIS' },
  { byte: 0x52, name: '.SIL' },
  { byte: 0x5B, name: '.LIL' },
];

// Also scan for LD reg,nn (immediate load of address into register — pointer reference)
const POINTER_LOAD_PATTERNS = [
  { opcodes: [0x01],       dir: 'ptr-load', fmt: (a) => `LD BC,${a}` },
  { opcodes: [0x11],       dir: 'ptr-load', fmt: (a) => `LD DE,${a}` },
  { opcodes: [0x21],       dir: 'ptr-load', fmt: (a) => `LD HL,${a}` },
  { opcodes: [0xDD, 0x21], dir: 'ptr-load', fmt: (a) => `LD IX,${a}` },
  { opcodes: [0xFD, 0x21], dir: 'ptr-load', fmt: (a) => `LD IY,${a}` },
];

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(b) {
  return (b & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

function formatBytes(buf, off, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push(hexByte(buf[off + i]));
  }
  return parts.join(' ');
}

function contextLine(buf, off, instrLen) {
  const before = Math.max(0, off - 8);
  const after = Math.min(buf.length, off + instrLen + 8);
  let s = '';
  for (let i = before; i < off; i++) s += hexByte(buf[i]) + ' ';
  s += '[';
  for (let i = off; i < off + instrLen; i++) s += hexByte(buf[i]) + ' ';
  s = s.trimEnd() + '] ';
  for (let i = off + instrLen; i < after; i++) s += hexByte(buf[i]) + ' ';
  return s.trimEnd();
}

function scanForTarget(rom, target, allPatterns) {
  const results = [];

  for (const pat of allPatterns) {
    const opcLen = pat.opcodes.length;
    const instrLen = opcLen + 3; // opcodes + 3-byte address

    // Scan without mode prefix
    for (let i = 0; i <= rom.length - instrLen; i++) {
      let match = true;
      for (let j = 0; j < opcLen; j++) {
        if (rom[i + j] !== pat.opcodes[j]) { match = false; break; }
      }
      if (!match) continue;
      const addr = read24(rom, i + opcLen);
      if (addr !== target.addr) continue;

      results.push({
        offset: i,
        instrLen,
        dir: pat.dir,
        instruction: pat.fmt(target.name),
        prefix: null,
        bytes: formatBytes(rom, i, instrLen),
        context: contextLine(rom, i, instrLen),
      });
    }

    // Scan with each mode prefix
    for (const pfx of MODE_PREFIXES) {
      const fullLen = 1 + instrLen;
      for (let i = 0; i <= rom.length - fullLen; i++) {
        if (rom[i] !== pfx.byte) continue;
        let match = true;
        for (let j = 0; j < opcLen; j++) {
          if (rom[i + 1 + j] !== pat.opcodes[j]) { match = false; break; }
        }
        if (!match) continue;
        const addr = read24(rom, i + 1 + opcLen);
        if (addr !== target.addr) continue;

        results.push({
          offset: i,
          instrLen: fullLen,
          dir: pat.dir,
          instruction: pfx.name + ' ' + pat.fmt(target.name),
          prefix: pfx.name,
          bytes: formatBytes(rom, i, fullLen),
          context: contextLine(rom, i, fullLen),
        });
      }
    }
  }

  // Deduplicate: longer match at same offset shadows shorter
  results.sort((a, b) => a.offset - b.offset || b.instrLen - a.instrLen);
  const deduped = [];
  for (const r of results) {
    const dominated = deduped.some(
      d => d.offset <= r.offset && d.offset + d.instrLen >= r.offset + r.instrLen
    );
    if (!dominated) deduped.push(r);
  }
  return deduped.sort((a, b) => a.offset - b.offset);
}

function main() {
  console.log('Phase 280: D02AD7-D02AD9 consumer scan');
  console.log('Finding all ROM references to the FindSym output pointer bytes');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM: ${rom.length} bytes (${hex(rom.length)})`);
  console.log('');

  const allPatterns = [...PATTERNS, ...POINTER_LOAD_PATTERNS];
  const allTargets = [...TARGETS, ...EXTRA_TARGETS];

  const grandTotals = { read: 0, write: 0, 'ptr-load': 0 };

  for (const target of allTargets) {
    const results = scanForTarget(rom, target, allPatterns);

    const reads = results.filter(r => r.dir === 'read');
    const writes = results.filter(r => r.dir === 'write');
    const ptrLoads = results.filter(r => r.dir === 'ptr-load');

    console.log(`========================================`);
    console.log(`  ${target.name} (${hex(target.addr)})`);
    console.log(`  Total refs: ${results.length}  (read: ${reads.length}, write: ${writes.length}, ptr-load: ${ptrLoads.length})`);
    console.log(`========================================`);

    if (reads.length > 0) {
      console.log('');
      console.log(`  --- READERS (${reads.length}) ---`);
      for (const r of reads) {
        console.log(`  ${hex(r.offset)}  ${r.instruction}`);
        console.log(`    bytes: ${r.bytes}`);
        console.log(`    ctx:   ${r.context}`);
      }
    }

    if (writes.length > 0) {
      console.log('');
      console.log(`  --- WRITERS (${writes.length}) ---`);
      for (const r of writes) {
        console.log(`  ${hex(r.offset)}  ${r.instruction}`);
        console.log(`    bytes: ${r.bytes}`);
        console.log(`    ctx:   ${r.context}`);
      }
    }

    if (ptrLoads.length > 0) {
      console.log('');
      console.log(`  --- POINTER LOADS (address as immediate) (${ptrLoads.length}) ---`);
      for (const r of ptrLoads) {
        console.log(`  ${hex(r.offset)}  ${r.instruction}`);
        console.log(`    bytes: ${r.bytes}`);
        console.log(`    ctx:   ${r.context}`);
      }
    }

    console.log('');

    grandTotals.read += reads.length;
    grandTotals.write += writes.length;
    grandTotals['ptr-load'] += ptrLoads.length;
  }

  console.log('========================================');
  console.log('  GRAND TOTALS');
  console.log('========================================');
  console.log(`  Readers:      ${grandTotals.read}`);
  console.log(`  Writers:      ${grandTotals.write}`);
  console.log(`  Ptr-loads:    ${grandTotals['ptr-load']}`);
  console.log(`  Total:        ${grandTotals.read + grandTotals.write + grandTotals['ptr-load']}`);
  console.log('');

  // Cross-reference: for D02AD7 readers, check if the same ROM neighborhood
  // also references D005F8 (type byte) — indicates full FindSym result consumption
  console.log('========================================');
  console.log('  CROSS-REFERENCE: D02AD7 readers near D005F8 refs');
  console.log('========================================');

  const d02ad7Results = scanForTarget(rom, TARGETS[0], allPatterns);
  const d005f8Results = scanForTarget(rom, EXTRA_TARGETS[0], allPatterns);

  const PROXIMITY = 64; // bytes
  for (const r of d02ad7Results.filter(x => x.dir === 'read')) {
    const nearby = d005f8Results.filter(
      x => Math.abs(x.offset - r.offset) <= PROXIMITY
    );
    if (nearby.length > 0) {
      console.log(`  ${hex(r.offset)} ${r.instruction}`);
      for (const n of nearby) {
        const delta = n.offset - r.offset;
        console.log(`    ${delta >= 0 ? '+' : ''}${delta}  ${hex(n.offset)} ${n.instruction} [${n.dir}]`);
      }
    }
  }

  console.log('');
  console.log('Done.');
}

main();
