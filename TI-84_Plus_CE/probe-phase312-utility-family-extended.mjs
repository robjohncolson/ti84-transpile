#!/usr/bin/env node
// Phase 312 - Extended utility family probe: 0x04C800-0x04C960
// Reads ROM bytes at each entry point, counts callers from ROM-wide scan, prints summary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const REGION_START = 0x04C800;
const REGION_END   = 0x04C962; // inclusive of divHLbyA tail (POP BC; RET)

// ── Catalog: all 26 externally-referenced entries ──

const catalog = [
  { entry: 0x04C824, size: 22, name: 'checkD000C3Bit6Loop', category: 'misc' },
  { entry: 0x04C83A, size: 24, name: 'bit42GuardAndSet',    category: 'guard' },
  { entry: 0x04C852, size: 18, name: 'portReadBit4Loop',    category: 'io' },
  { entry: 0x04C864, size: 10, name: 'getBCUpperByte',      category: 'extract' },
  { entry: 0x04C86E, size:  7, name: 'testBCNonZero',       category: 'test' },
  { entry: 0x04C875, size:  1, name: 'packB_BC_to_BC',      category: 'pack-alias' },
  { entry: 0x04C876, size: 15, name: 'packA_BC_to_BC',      category: 'pack' },
  { entry: 0x04C885, size:  1, name: 'packB_DE_to_DE',      category: 'pack-alias' },
  { entry: 0x04C886, size: 15, name: 'packA_DE_to_DE',      category: 'pack' },
  { entry: 0x04C895, size:  1, name: 'packB_HL_to_HL',      category: 'pack-alias' },
  { entry: 0x04C896, size: 13, name: 'packA_HL_to_HL',      category: 'pack' },
  { entry: 0x04C8A3, size: 10, name: 'getDEUpperByte',      category: 'extract' },
  { entry: 0x04C8AD, size:  7, name: 'testDENonZero',       category: 'test' },
  { entry: 0x04C8B4, size:  9, name: 'getHLUpperByte',      category: 'extract' },
  { entry: 0x04C8BD, size:  7, name: 'testHLNonZero',       category: 'test' },
  { entry: 0x04C8C4, size: 23, name: 'signExtendBC',        category: 'sign-ext' },
  { entry: 0x04C8DB, size: 23, name: 'signExtendDE',        category: 'sign-ext' },
  { entry: 0x04C8F2, size: 21, name: 'signExtendHL',        category: 'sign-ext' },
  { entry: 0x04C907, size:  6, name: 'loadDEInd24',         category: 'loader' },
  { entry: 0x04C90D, size:  9, name: 'loadDEInd_s',         category: 'loader' },
  { entry: 0x04C916, size:  6, name: 'loadHLInd_s',         category: 'loader' },
  { entry: 0x04C91C, size: 18, name: 'zeroExtendBC24',      category: 'zero-ext' },
  { entry: 0x04C92E, size: 18, name: 'zeroExtendDE24',      category: 'zero-ext' },
  { entry: 0x04C940, size: 16, name: 'zeroExtendHL24',      category: 'zero-ext' },
  { entry: 0x04C950, size:  2, name: 'divHLby10',           category: 'div-alias' },
  { entry: 0x04C952, size: 17, name: 'divHLbyA',            category: 'div' },
];

// ── Count callers from ROM-wide CALL/JP scan ──

function countCallers(targetAddr) {
  let count = 0;
  for (let pc = 0; pc < rom.length - 3; pc++) {
    const op = rom[pc];
    let target = -1;

    // CALL nn (CD), JP nn (C3)
    if (op === 0xCD || op === 0xC3) {
      target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    }
    // Conditional CALL (C4,CC,D4,DC,E4,EC,F4,FC)
    else if ((op & 0xC7) === 0xC4) {
      target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    }
    // Conditional JP (C2,CA,D2,DA,E2,EA,F2,FA)
    else if ((op & 0xC7) === 0xC2) {
      target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    }

    if (target === targetAddr) count++;
  }
  return count;
}

// ── Verify ROM bytes at each entry ──

function hexBytes(addr, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(rom[addr + i].toString(16).padStart(2, '0').toUpperCase());
  }
  return bytes.join(' ');
}

// ── Main ──

console.log('=== Phase 312: Extended Utility Family Probe ===');
console.log(`ROM: ${romPath} (${rom.length} bytes)`);
console.log(`Region: 0x${REGION_START.toString(16).toUpperCase()}-0x${REGION_END.toString(16).toUpperCase()}\n`);

let passed = 0;
let failed = 0;
let totalCallers = 0;
let totalBytes = 0;

const results = [];

for (const fn of catalog) {
  const callers = countCallers(fn.entry);
  const firstBytes = hexBytes(fn.entry, Math.min(fn.size, 6));

  results.push({ ...fn, callers, firstBytes });
  totalCallers += callers;
  totalBytes += fn.size;
}

// Sort by callers descending
results.sort((a, b) => b.callers - a.callers);

// Print table
const hdr = 'Rank  Entry       Callers  Size  FirstBytes           Name';
console.log(hdr);
console.log('-'.repeat(hdr.length + 20));

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const entryHex = `0x${r.entry.toString(16).padStart(6, '0').toUpperCase()}`;
  const rank = String(i + 1).padStart(4);
  const callers = String(r.callers).padStart(7);
  const size = String(r.size).padStart(4);
  const bytes = r.firstBytes.padEnd(20);
  console.log(`${rank}  ${entryHex}  ${callers}  ${size}  ${bytes} ${r.name}`);
}

console.log('-'.repeat(hdr.length + 20));
console.log(`\nTotal: ${results.length} entries, ${totalCallers} callers, ${totalBytes} bytes`);

// ── Validation checks ──

console.log('\n=== Validation ===');

// Check known high-traffic entries match expected counts
const expectedCallers = {
  0x04C90D: 63,
  0x04C916: 58,
  0x04C8BD: 37,
};

for (const [addr, expected] of Object.entries(expectedCallers)) {
  const addrNum = parseInt(addr);
  const r = results.find(r => r.entry === addrNum);
  if (!r) {
    console.log(`FAIL: entry 0x${addrNum.toString(16).toUpperCase()} not found`);
    failed++;
    continue;
  }
  if (r.callers === expected) {
    console.log(`PASS: 0x${addrNum.toString(16).toUpperCase()} has ${r.callers} callers (expected ${expected})`);
    passed++;
  } else {
    console.log(`FAIL: 0x${addrNum.toString(16).toUpperCase()} has ${r.callers} callers (expected ${expected})`);
    failed++;
  }
}

// Check scrapMem pattern at known addresses
const scrapMemUsers = [0x04C864, 0x04C8A3, 0x04C8B4, 0x04C876, 0x04C886, 0x04C896];
for (const addr of scrapMemUsers) {
  // These all store to 0xD02AD7 -- check for byte pattern D7 2A D0
  const fnData = [];
  const fn = catalog.find(f => f.entry === addr);
  if (!fn) continue;
  for (let i = 0; i < fn.size; i++) {
    fnData.push(rom[addr + i]);
  }
  const hasScrapRef = fnData.some((b, i) =>
    i + 2 < fnData.length && b === 0xD7 && fnData[i + 1] === 0x2A && fnData[i + 2] === 0xD0
  );
  if (hasScrapRef) {
    console.log(`PASS: 0x${addr.toString(16).toUpperCase()} references scrapMem (0xD02AD7)`);
    passed++;
  } else {
    console.log(`FAIL: 0x${addr.toString(16).toUpperCase()} does not reference scrapMem`);
    failed++;
  }
}

// Check loadDEInd_s starts with LD DE,0x000000 (11 00 00 00)
const ldDEcheck = rom[0x04C90D] === 0x11 && rom[0x04C90E] === 0x00 && rom[0x04C90F] === 0x00 && rom[0x04C910] === 0x00;
if (ldDEcheck) {
  console.log('PASS: loadDEInd_s starts with LD DE,0x000000');
  passed++;
} else {
  console.log('FAIL: loadDEInd_s does not start with LD DE,0x000000');
  failed++;
}

// Check loadHLInd_s starts with LD A,(HL) (7E)
if (rom[0x04C916] === 0x7E) {
  console.log('PASS: loadHLInd_s starts with LD A,(HL)');
  passed++;
} else {
  console.log('FAIL: loadHLInd_s does not start with LD A,(HL)');
  failed++;
}

// Check divHLbyA starts with PUSH BC (C5)
if (rom[0x04C952] === 0xC5) {
  console.log('PASS: divHLbyA starts with PUSH BC');
  passed++;
} else {
  console.log('FAIL: divHLbyA does not start with PUSH BC');
  failed++;
}

// Check divHLby10 has LD A,0x0A (3E 0A)
if (rom[0x04C950] === 0x3E && rom[0x04C951] === 0x0A) {
  console.log('PASS: divHLby10 has LD A,0x0A');
  passed++;
} else {
  console.log('FAIL: divHLby10 does not have LD A,0x0A');
  failed++;
}

// Summary by category
console.log('\n=== Category Summary ===');
const categories = {};
for (const r of results) {
  if (!categories[r.category]) categories[r.category] = { count: 0, callers: 0 };
  categories[r.category].count++;
  categories[r.category].callers += r.callers;
}
for (const [cat, stats] of Object.entries(categories).sort((a, b) => b[1].callers - a[1].callers)) {
  console.log(`  ${cat.padEnd(15)} ${String(stats.count).padStart(3)} entries  ${String(stats.callers).padStart(4)} callers`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
