#!/usr/bin/env node
/**
 * Phase 25V — Static ROM scan for allocator-pointer initializers
 *
 * Searches the raw ROM binary for every reference to the six allocator
 * pointers (OPBase, OPS, FPSbase, FPS, pTemp, progPtr) plus userMem,
 * classifies each as READ or WRITE based on the preceding opcode byte,
 * and writes a report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25v-vat-init-search-report.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// Targets: name, 24-bit address, little-endian byte pattern
const TARGETS = [
  { name: 'OPBase',  addr: 0xD02590, bytes: [0x90, 0x25, 0xD0] },
  { name: 'OPS',     addr: 0xD02593, bytes: [0x93, 0x25, 0xD0] },
  { name: 'FPSbase', addr: 0xD0258A, bytes: [0x8A, 0x25, 0xD0] },
  { name: 'FPS',     addr: 0xD0258D, bytes: [0x8D, 0x25, 0xD0] },
  { name: 'pTemp',   addr: 0xD0259A, bytes: [0x9A, 0x25, 0xD0] },
  { name: 'progPtr', addr: 0xD0259D, bytes: [0x9D, 0x25, 0xD0] },
  { name: 'userMem', addr: 0xD1A881, bytes: [0x81, 0xA8, 0xD1] },
];

// eZ80 opcode classification (byte immediately before the 3-byte address)
// These are the single-byte opcodes that take a 24-bit immediate address.
const WRITE_OPCODES = {
  0x22: 'LD (nn), HL',
  0x32: 'LD (nn), A',
};
const READ_OPCODES = {
  0x2A: 'LD HL, (nn)',
  0x3A: 'LD A, (nn)',
};

// Extended opcodes (ED prefix): byte before address is the second byte,
// and the byte before that is 0xED.
const ED_WRITE_OPCODES = {
  0x43: 'LD (nn), BC',
  0x53: 'LD (nn), DE',
  0x63: 'LD (nn), HL',  // ED 63 variant
  0x73: 'LD (nn), SP',
};
const ED_READ_OPCODES = {
  0x4B: 'LD BC, (nn)',
  0x5B: 'LD DE, (nn)',
  0x6B: 'LD HL, (nn)',  // ED 6B variant
  0x7B: 'LD SP, (nn)',
};

// DD/FD prefix opcodes (IX/IY variants)
const DD_FD_WRITE_OPCODES = {
  0x22: 'LD (nn), IX/IY',
};
const DD_FD_READ_OPCODES = {
  0x2A: 'LD IX/IY, (nn)',
};

function classifyHit(rom, offset) {
  // offset points to the first byte of the 3-byte address pattern
  // The opcode byte(s) come before it
  const prevByte = offset > 0 ? rom[offset - 1] : null;
  const prev2Byte = offset > 1 ? rom[offset - 2] : null;

  // Check for ED-prefixed opcodes
  if (prev2Byte === 0xED && prevByte !== null) {
    if (ED_WRITE_OPCODES[prevByte]) return { type: 'WRITE', mnemonic: ED_WRITE_OPCODES[prevByte], prefix: 'ED' };
    if (ED_READ_OPCODES[prevByte]) return { type: 'READ', mnemonic: ED_READ_OPCODES[prevByte], prefix: 'ED' };
  }

  // Check for DD/FD-prefixed opcodes
  if ((prev2Byte === 0xDD || prev2Byte === 0xFD) && prevByte !== null) {
    const regName = prev2Byte === 0xDD ? 'IX' : 'IY';
    if (DD_FD_WRITE_OPCODES[prevByte]) return { type: 'WRITE', mnemonic: DD_FD_WRITE_OPCODES[prevByte].replace('IX/IY', regName), prefix: prev2Byte.toString(16).toUpperCase() };
    if (DD_FD_READ_OPCODES[prevByte]) return { type: 'READ', mnemonic: DD_FD_READ_OPCODES[prevByte].replace('IX/IY', regName), prefix: prev2Byte.toString(16).toUpperCase() };
  }

  // Check single-byte opcodes
  if (prevByte !== null) {
    if (WRITE_OPCODES[prevByte]) return { type: 'WRITE', mnemonic: WRITE_OPCODES[prevByte], prefix: null };
    if (READ_OPCODES[prevByte]) return { type: 'READ', mnemonic: READ_OPCODES[prevByte], prefix: null };
  }

  return { type: 'UNKNOWN', mnemonic: null, prefix: null };
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function scanForPattern(rom, pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - 3; i++) {
    if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2]) {
      // Only consider ROM region (< 0x400000 = 4MB)
      const contextBefore = 4;
      const contextAfter = 6;
      const startCtx = Math.max(0, i - contextBefore);
      const endCtx = Math.min(rom.length, i + 3 + contextAfter);
      const surrounding = [];
      for (let j = startCtx; j < endCtx; j++) {
        surrounding.push(hexByte(rom[j]));
      }

      const classification = classifyHit(rom, i);
      hits.push({
        offset: i,
        offsetHex: '0x' + i.toString(16).toUpperCase().padStart(6, '0'),
        surrounding: surrounding.join(' '),
        classification,
        contextStartOffset: startCtx,
      });
    }
  }
  return hits;
}

// Run the scan
const results = {};
let totalHits = 0;
let totalWrites = 0;

for (const target of TARGETS) {
  const hits = scanForPattern(rom, target.bytes);
  results[target.name] = { target, hits };
  totalHits += hits.length;
  const writes = hits.filter(h => h.classification.type === 'WRITE');
  totalWrites += writes.length;
}

// Build report
const lines = [];
lines.push('# Phase 25V -- VAT/Heap Initializer Search Report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`Total references found: ${totalHits}`);
lines.push(`Total WRITE references: ${totalWrites}`);
lines.push('');
lines.push('| Symbol | Address | Total Refs | WRITEs | READs | UNKNOWN |');
lines.push('|--------|---------|-----------|--------|-------|---------|');

for (const target of TARGETS) {
  const { hits } = results[target.name];
  const writes = hits.filter(h => h.classification.type === 'WRITE').length;
  const reads = hits.filter(h => h.classification.type === 'READ').length;
  const unknown = hits.filter(h => h.classification.type === 'UNKNOWN').length;
  lines.push(`| ${target.name} | 0x${target.addr.toString(16).toUpperCase()} | ${hits.length} | ${writes} | ${reads} | ${unknown} |`);
}

lines.push('');
lines.push('---');
lines.push('');

// Detail sections -- WRITE hits first (most interesting for finding initializers)
lines.push('## WRITE References (Potential Initializers)');
lines.push('');

for (const target of TARGETS) {
  const { hits } = results[target.name];
  const writes = hits.filter(h => h.classification.type === 'WRITE');
  if (writes.length === 0) continue;

  lines.push(`### ${target.name} (0x${target.addr.toString(16).toUpperCase()}) -- ${writes.length} WRITE(s)`);
  lines.push('');

  for (const hit of writes) {
    const prefix = hit.classification.prefix ? `${hit.classification.prefix} ` : '';
    lines.push(`- **${hit.offsetHex}**: \`${prefix}${hit.classification.mnemonic}\` -- bytes: \`${hit.surrounding}\``);
    // Calculate the instruction start address
    const instrLen = hit.classification.prefix ? 2 : 1;
    const instrAddr = hit.offset - instrLen;
    lines.push(`  - Instruction at ROM offset 0x${instrAddr.toString(16).toUpperCase().padStart(6, '0')}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');

// All references by symbol
lines.push('## All References by Symbol');
lines.push('');

for (const target of TARGETS) {
  const { hits } = results[target.name];
  lines.push(`### ${target.name} (0x${target.addr.toString(16).toUpperCase()}) -- ${hits.length} ref(s)`);
  lines.push('');

  if (hits.length === 0) {
    lines.push('_(no references found)_');
    lines.push('');
    continue;
  }

  for (const hit of hits) {
    const typeTag = hit.classification.type;
    const mnemonic = hit.classification.mnemonic || '???';
    const prefix = hit.classification.prefix ? `${hit.classification.prefix} ` : '';
    lines.push(`- \`${hit.offsetHex}\` [${typeTag}] ${prefix}${mnemonic} -- \`${hit.surrounding}\``);
  }
  lines.push('');
}

// Look for clusters -- addresses that appear together (within 32 bytes)
// which might indicate an initialization routine
lines.push('---');
lines.push('');
lines.push('## Potential Initialization Clusters');
lines.push('');
lines.push('Locations where multiple allocator pointers are written within 64 bytes of each other:');
lines.push('');

// Collect all WRITE hits across all targets (excluding userMem)
const allWrites = [];
for (const target of TARGETS) {
  if (target.name === 'userMem') continue;
  const { hits } = results[target.name];
  for (const hit of hits) {
    if (hit.classification.type === 'WRITE') {
      allWrites.push({ name: target.name, offset: hit.offset, hit });
    }
  }
}

// Sort by offset
allWrites.sort((a, b) => a.offset - b.offset);

// Find clusters (groups within 64 bytes)
const CLUSTER_WINDOW = 64;
const clusters = [];
let currentCluster = [];

for (let i = 0; i < allWrites.length; i++) {
  if (currentCluster.length === 0) {
    currentCluster.push(allWrites[i]);
  } else {
    const lastInCluster = currentCluster[currentCluster.length - 1];
    if (allWrites[i].offset - lastInCluster.offset <= CLUSTER_WINDOW) {
      currentCluster.push(allWrites[i]);
    } else {
      if (currentCluster.length >= 2) {
        clusters.push([...currentCluster]);
      }
      currentCluster = [allWrites[i]];
    }
  }
}
if (currentCluster.length >= 2) {
  clusters.push([...currentCluster]);
}

if (clusters.length === 0) {
  lines.push('_(no clusters found)_');
} else {
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const symbols = [...new Set(cluster.map(w => w.name))];
    const startOff = cluster[0].offset;
    const endOff = cluster[cluster.length - 1].offset;
    lines.push(`### Cluster ${ci + 1}: ROM 0x${startOff.toString(16).toUpperCase().padStart(6, '0')}..0x${endOff.toString(16).toUpperCase().padStart(6, '0')} (${symbols.length} symbols: ${symbols.join(', ')})`);
    lines.push('');
    for (const w of cluster) {
      const prefix = w.hit.classification.prefix ? `${w.hit.classification.prefix} ` : '';
      lines.push(`- ${w.name} at 0x${w.offset.toString(16).toUpperCase().padStart(6, '0')}: ${prefix}${w.hit.classification.mnemonic}`);
    }
    lines.push('');
  }
}

const report = lines.join('\n');
fs.writeFileSync(REPORT_PATH, report);

// Console summary
console.log('=== Phase 25V: VAT/Heap Initializer Search ===');
console.log(`Total references: ${totalHits}`);
console.log(`Total WRITEs: ${totalWrites}`);
console.log(`Clusters found: ${clusters.length}`);
console.log('');

for (const target of TARGETS) {
  const { hits } = results[target.name];
  const writes = hits.filter(h => h.classification.type === 'WRITE');
  console.log(`${target.name}: ${hits.length} refs (${writes.length} writes)`);
}

console.log('');
console.log(`Report written to: ${REPORT_PATH}`);
console.log('');

if (clusters.length > 0) {
  console.log('*** CLUSTERS (likely initializers): ***');
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const symbols = [...new Set(cluster.map(w => w.name))];
    console.log(`  Cluster ${ci + 1} at 0x${cluster[0].offset.toString(16).toUpperCase().padStart(6, '0')}: ${symbols.join(', ')}`);
  }
}
