#!/usr/bin/env node
/**
 * Phase 384 — Find all ROM locations that reference 0x0300CB
 * Scans for CALL/JP/conditional variants targeting 0x0300CB and nearby addresses.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const romPath = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

console.log(`ROM loaded: ${rom.length} bytes (0x${rom.length.toString(16)})`);
console.log('');

// Condition code decode table
const condCodes = {
  0xC4: 'NZ', 0xC2: 'NZ',
  0xCC: 'Z',  0xCA: 'Z',
  0xD4: 'NC', 0xD2: 'NC',
  0xDC: 'C',  0xDA: 'C',
  0xE4: 'PO', 0xE2: 'PO',
  0xEC: 'PE', 0xEA: 'PE',
  0xF4: 'P',  0xF2: 'P',
  0xFC: 'M',  0xFA: 'M',
};

// CALL opcodes (unconditional + conditional)
const callOpcodes = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
// JP opcodes (unconditional + conditional)
const jpOpcodes = new Set([0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);

function decodeMnemonic(opcode, addr) {
  const addrStr = '0x' + addr.toString(16).toUpperCase().padStart(6, '0');
  if (opcode === 0xCD) return `CALL ${addrStr}`;
  if (opcode === 0xC3) return `JP ${addrStr}`;
  const cc = condCodes[opcode];
  if (callOpcodes.has(opcode)) return `CALL ${cc},${addrStr}`;
  if (jpOpcodes.has(opcode)) return `JP ${cc},${addrStr}`;
  return `??? ${addrStr}`;
}

function hexBytes(buf, offset, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(buf[offset + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

// Target addresses to scan for (the 0x030080-0x030100 region + specific targets)
const targetAddresses = new Set();
// Primary target
targetAddresses.add(0x0300CB);
// Specific nearby addresses
targetAddresses.add(0x0300A0);
targetAddresses.add(0x0300A1);
// Range 0x030080 - 0x030100
for (let a = 0x030080; a <= 0x030100; a++) {
  targetAddresses.add(a);
}

// ============================================================
// SECTION 1: CALL/JP instructions targeting specific addresses
// ============================================================
console.log('='.repeat(80));
console.log('SECTION 1: CALL/JP instructions targeting 0x0300CB');
console.log('='.repeat(80));

const primaryResults = [];

for (let i = 0; i < rom.length - 3; i++) {
  const opcode = rom[i];
  if (callOpcodes.has(opcode) || jpOpcodes.has(opcode)) {
    // Read 24-bit little-endian address
    const addr = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (addr === 0x0300CB) {
      const mnemonic = decodeMnemonic(opcode, addr);
      primaryResults.push({
        offset: i,
        bytes: hexBytes(rom, i, 4),
        mnemonic,
      });
    }
  }
}

if (primaryResults.length === 0) {
  console.log('  (no matches found)');
} else {
  for (const r of primaryResults) {
    console.log(`  0x${r.offset.toString(16).toUpperCase().padStart(6, '0')}:  ${r.bytes.padEnd(14)}  ${r.mnemonic}`);
  }
}
console.log(`  Total: ${primaryResults.length} references to 0x0300CB`);
console.log('');

// ============================================================
// SECTION 2: CALL/JP to nearby range 0x030080-0x030100
// ============================================================
console.log('='.repeat(80));
console.log('SECTION 2: CALL/JP instructions targeting 0x030080-0x030100 range');
console.log('='.repeat(80));

const rangeResults = [];

for (let i = 0; i < rom.length - 3; i++) {
  const opcode = rom[i];
  if (callOpcodes.has(opcode) || jpOpcodes.has(opcode)) {
    const addr = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (addr >= 0x030080 && addr <= 0x030100) {
      const mnemonic = decodeMnemonic(opcode, addr);
      rangeResults.push({
        offset: i,
        addr,
        bytes: hexBytes(rom, i, 4),
        mnemonic,
      });
    }
  }
}

if (rangeResults.length === 0) {
  console.log('  (no matches found)');
} else {
  // Group by target address
  const byTarget = new Map();
  for (const r of rangeResults) {
    if (!byTarget.has(r.addr)) byTarget.set(r.addr, []);
    byTarget.get(r.addr).push(r);
  }
  const sortedTargets = [...byTarget.keys()].sort((a, b) => a - b);
  for (const target of sortedTargets) {
    const refs = byTarget.get(target);
    console.log(`  Target 0x${target.toString(16).toUpperCase().padStart(6, '0')} (${refs.length} references):`);
    for (const r of refs) {
      console.log(`    0x${r.offset.toString(16).toUpperCase().padStart(6, '0')}:  ${r.bytes.padEnd(14)}  ${r.mnemonic}`);
    }
  }
}
console.log(`  Total: ${rangeResults.length} references to range 0x030080-0x030100`);
console.log('');

// ============================================================
// SECTION 3: Raw 3-byte pattern CB 00 03 (table entries)
// ============================================================
console.log('='.repeat(80));
console.log('SECTION 3: Raw byte pattern CB 00 03 anywhere in ROM (potential table entries)');
console.log('='.repeat(80));

const rawResults = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === 0xCB && rom[i + 1] === 0x00 && rom[i + 2] === 0x03) {
    // Check if this is already part of a CALL/JP we found (skip those)
    let isInstruction = false;
    if (i > 0) {
      const prev = rom[i - 1];
      if (callOpcodes.has(prev) || jpOpcodes.has(prev)) {
        isInstruction = true;
      }
    }
    // Show context: a few bytes before and after
    const ctxStart = Math.max(0, i - 4);
    const ctxEnd = Math.min(rom.length, i + 7);
    const context = hexBytes(rom, ctxStart, ctxEnd - ctxStart);
    rawResults.push({
      offset: i,
      isInstruction,
      context,
    });
  }
}

let tableEntryCount = 0;
for (const r of rawResults) {
  const tag = r.isInstruction ? '  [CALL/JP operand]' : '  [TABLE/DATA?]';
  if (!r.isInstruction) tableEntryCount++;
  console.log(`  0x${r.offset.toString(16).toUpperCase().padStart(6, '0')}:  ...${r.context}...${tag}`);
}
console.log(`  Total raw CB 00 03 occurrences: ${rawResults.length} (${tableEntryCount} non-instruction, ${rawResults.length - tableEntryCount} instruction operands)`);
console.log('');

// ============================================================
// SECTION 4: Summary
// ============================================================
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`  Direct CALL/JP to 0x0300CB: ${primaryResults.length}`);
console.log(`  CALL/JP to range 0x030080-0x030100: ${rangeResults.length}`);
console.log(`  Raw CB 00 03 byte patterns: ${rawResults.length} (${tableEntryCount} potential table entries)`);
console.log('');
console.log('Done.');
