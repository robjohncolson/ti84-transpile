#!/usr/bin/env node
/**
 * Phase 423 — Slab Pool Metadata Map
 *
 * Scans the ROM for all references to the slab pool RAM variables:
 *   D1401A  slab pool lower bound (selector 0)
 *   D1401D  slab pool upper bound (selector 0)
 *   D14020  slab pool base (selector 2)
 *   D1406C  free bitmap (selector 2)
 *   D14005  block list terminator
 *   D14008  block list head
 *   D1400B  current block pointer
 *   D1400E  successor value
 *
 * For each reference: ROM address, read vs write context, surrounding bytes.
 * Identifies the slab ALLOC function (counterpart to FREE at 0x00E1CC).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGETS = [
  { name: 'D1401A', label: 'slab pool lower bound (sel 0)', bytes: [0x1A, 0x40, 0xD1] },
  { name: 'D1401D', label: 'slab pool upper bound (sel 0)', bytes: [0x1D, 0x40, 0xD1] },
  { name: 'D14020', label: 'slab pool base (sel 2)',         bytes: [0x20, 0x40, 0xD1] },
  { name: 'D1406C', label: 'free bitmap (sel 2)',            bytes: [0x6C, 0x40, 0xD1] },
  { name: 'D14005', label: 'block list terminator',          bytes: [0x05, 0x40, 0xD1] },
  { name: 'D14008', label: 'block list head',                bytes: [0x08, 0x40, 0xD1] },
  { name: 'D1400B', label: 'current block pointer',          bytes: [0x0B, 0x40, 0xD1] },
  { name: 'D1400E', label: 'successor value',                bytes: [0x0E, 0x40, 0xD1] },
];

function hex(val, w = 6) {
  return '0x' + val.toString(16).padStart(w, '0');
}

function hexBytes(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(rom[start + i].toString(16).padStart(2, '0'));
  }
  return out.join(' ');
}

/**
 * Classify a reference as READ or WRITE based on the preceding instruction opcode.
 *
 * eZ80 patterns:
 *   ED 43 xx yy zz  = LD (xxyyzz), BC   → WRITE
 *   ED 4B xx yy zz  = LD BC, (xxyyzz)   → READ
 *   22 xx yy zz     = LD (xxyyzz), HL   → WRITE
 *   2A xx yy zz     = LD HL, (xxyyzz)   → READ
 *   3A xx yy zz     = LD A, (xxyyzz)    → READ
 *   32 xx yy zz     = LD (xxyyzz), A    → WRITE
 *   01 xx yy zz     = LD BC, xxyyzz     → ADDR_LOAD (address in BC for indirect)
 *   36 xx           = LD (HL), xx        → WRITE (bitmap store via HL+offset)
 *   FD 2A xx yy zz  = LD IY, (xxyyzz)  → READ
 */
function classifyAccess(matchAddr) {
  // Check 2 bytes before the match for ED 43 / ED 4B
  if (matchAddr >= 2) {
    const b0 = rom[matchAddr - 2];
    const b1 = rom[matchAddr - 1];
    if (b0 === 0xED && b1 === 0x43) return 'WRITE (LD (nn),BC)';
    if (b0 === 0xED && b1 === 0x4B) return 'READ  (LD BC,(nn))';
  }
  // Check 1 byte before for 22/2A/3A/32/01
  if (matchAddr >= 1) {
    const b = rom[matchAddr - 1];
    if (b === 0x22) return 'WRITE (LD (nn),HL)';
    if (b === 0x2A) return 'READ  (LD HL,(nn))';
    if (b === 0x3A) return 'READ  (LD A,(nn))';
    if (b === 0x32) return 'WRITE (LD (nn),A)';
    if (b === 0x01) return 'ADDR  (LD BC,nn → indirect)';
  }
  // Check for FD 2A (LD IY,(nn))
  if (matchAddr >= 2 && rom[matchAddr - 2] === 0xFD && rom[matchAddr - 1] === 0x2A) {
    return 'READ  (LD IY,(nn))';
  }
  return 'UNKNOWN';
}

let passed = 0;
let failed = 0;
const results = {};

for (const target of TARGETS) {
  const refs = [];
  for (let i = 0; i < 0x400000 - 2; i++) {
    if (rom[i] === target.bytes[0] &&
        rom[i + 1] === target.bytes[1] &&
        rom[i + 2] === target.bytes[2]) {
      const ctxStart = Math.max(0, i - 8);
      const ctxEnd = Math.min(rom.length, i + 11);
      refs.push({
        romAddr: i,
        access: classifyAccess(i),
        context: hexBytes(ctxStart, ctxEnd - ctxStart),
      });
    }
  }
  results[target.name] = { label: target.label, refs };
}

// --- Report ---
console.log('=== Phase 423: Slab Pool Metadata Reference Map ===\n');

for (const target of TARGETS) {
  const { label, refs } = results[target.name];
  console.log(`--- ${target.name} (${label}) --- ${refs.length} refs`);
  for (const ref of refs) {
    console.log(`  ${hex(ref.romAddr)}  ${ref.access.padEnd(30)}  ${ref.context}`);
  }
  console.log();
}

// --- Identify functional clusters ---
console.log('=== Functional Cluster Analysis ===\n');

// Group refs by ROM region (256-byte pages)
const allRefs = [];
for (const target of TARGETS) {
  for (const ref of results[target.name].refs) {
    allRefs.push({ ...ref, target: target.name });
  }
}
allRefs.sort((a, b) => a.romAddr - b.romAddr);

// Identify clusters (refs within 256 bytes of each other)
const clusters = [];
let currentCluster = null;
for (const ref of allRefs) {
  if (!currentCluster || ref.romAddr - currentCluster.end > 256) {
    currentCluster = {
      start: ref.romAddr,
      end: ref.romAddr,
      refs: [ref],
      targets: new Set([ref.target]),
    };
    clusters.push(currentCluster);
  } else {
    currentCluster.end = ref.romAddr;
    currentCluster.refs.push(ref);
    currentCluster.targets.add(ref.target);
  }
}

console.log(`Found ${clusters.length} reference clusters:\n`);
for (const cluster of clusters) {
  const writes = cluster.refs.filter(r => r.access.startsWith('WRITE')).length;
  const reads = cluster.refs.filter(r => r.access.startsWith('READ')).length;
  const addrs = cluster.refs.filter(r => r.access.startsWith('ADDR')).length;

  let funcType = 'unknown';
  const tgt = [...cluster.targets];
  if (tgt.includes('D1401A') && tgt.includes('D1401D') && tgt.includes('D14020') && writes > reads) {
    funcType = 'POOL INIT (writes bounds + base)';
  } else if (tgt.includes('D1406C') && tgt.includes('D14020') && reads >= writes) {
    funcType = 'SLAB ALLOC (reads bitmap + base)';
  } else if (tgt.includes('D1406C') && writes > 0 && tgt.includes('D1401A')) {
    funcType = 'SLAB FREE (writes bitmap, reads bounds)';
  } else if (tgt.includes('D14008') && tgt.includes('D14005')) {
    funcType = 'BLOCK LIST mgmt (head + terminator)';
  } else if (tgt.includes('D1400B') && tgt.includes('D1400E')) {
    funcType = 'BLOCK WALKER (iterates block list)';
  } else if (tgt.includes('D1400B') && tgt.includes('D14008')) {
    funcType = 'BLOCK ITERATOR (head → current)';
  }

  console.log(`  ${hex(cluster.start)}..${hex(cluster.end)}  refs=${cluster.refs.length} (R=${reads} W=${writes} A=${addrs})`);
  console.log(`    targets: ${tgt.join(', ')}`);
  console.log(`    likely: ${funcType}`);
  console.log();
}

// --- Identify the ALLOC function ---
console.log('=== Slab Alloc Candidate ===\n');

// The alloc function reads D1406C (free bitmap) to find a free slot,
// then reads D14020 (pool base) to compute the address, and writes D1406C to mark allocated.
// Look for clusters that have both D1406C and D14020 refs
for (const cluster of clusters) {
  const tgt = [...cluster.targets];
  if (tgt.includes('D1406C') && tgt.includes('D14020')) {
    const bitmapRefs = cluster.refs.filter(r => r.target === 'D1406C');
    const baseRefs = cluster.refs.filter(r => r.target === 'D14020');
    const bitmapReads = bitmapRefs.filter(r => r.access.startsWith('READ') || r.access.startsWith('ADDR'));
    const bitmapWrites = bitmapRefs.filter(r => r.access.startsWith('WRITE') || r.access.includes('indirect'));

    console.log(`  Candidate at ${hex(cluster.start)}..${hex(cluster.end)}`);
    console.log(`    D1406C refs: ${bitmapRefs.length} (reads/addr=${bitmapReads.length})`);
    console.log(`    D14020 refs: ${baseRefs.length}`);

    // Find the function entry: scan backward from cluster.start for C9 (RET) or prologue
    let entry = cluster.start;
    for (let scan = cluster.start; scan > cluster.start - 200 && scan > 0; scan--) {
      if (rom[scan] === 0xCD && rom[scan + 1] === 0x8A && rom[scan + 2] === 0x21 && rom[scan + 3] === 0x00) {
        entry = scan;
        break;
      }
      if (rom[scan] === 0xDD && rom[scan + 1] === 0xE5) {
        entry = scan;
        break;
      }
      if (rom[scan - 1] === 0xC9) {
        entry = scan;
        break;
      }
    }
    console.log(`    estimated function entry: ${hex(entry)}`);
    console.log(`    bytes at entry: ${hexBytes(entry, 16)}`);
    console.log();
  }
}

// --- Test assertions ---
// Verify we found the expected reference counts
const d1401aCount = results.D1401A.refs.length;
const d14008Count = results.D14008.refs.length;
const d1406cCount = results.D1406C.refs.length;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passed++;
  } else {
    console.log(`FAIL: ${label}`);
    failed++;
  }
}

check('D1401A has references in ROM', d1401aCount > 0);
check('D14008 has references in ROM', d14008Count > 0);
check('D1406C has references in ROM', d1406cCount > 0);
check('D1401A has refs in 0x00CB region (pool init)', results.D1401A.refs.some(r => r.romAddr >= 0x00CB00 && r.romAddr < 0x00CC00));
check('D1401A has refs in 0x00E1 region (free fn)', results.D1401A.refs.some(r => r.romAddr >= 0x00E1C0 && r.romAddr < 0x00E300));
check('D1406C has refs in 0x00E1 region (alloc/free)', results.D1406C.refs.some(r => r.romAddr >= 0x00E170 && r.romAddr < 0x00E400));
check('D14020 has refs in 0x00E2 region (alloc)', results.D14020.refs.some(r => r.romAddr >= 0x00E280 && r.romAddr < 0x00E300));
check('D14008 has WRITE ref at 0x00E5F8 region (block list init)', results.D14008.refs.some(r => r.romAddr >= 0x00E5F0 && r.romAddr < 0x00E610 && r.access.startsWith('WRITE')));
check('D1400B has refs in 0x00E840 region (block walker)', results.D1400B.refs.some(r => r.romAddr >= 0x00E840 && r.romAddr < 0x00E920));
check('Mirror functions exist in 0x03xxxx region', results.D1401A.refs.some(r => r.romAddr >= 0x030000));
check('Found at least 8 reference clusters', clusters.length >= 8);

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} checks`);
process.exit(failed > 0 ? 1 : 0);
