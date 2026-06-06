#!/usr/bin/env node
// Phase 539 — Cross-reference internal FPU types 0x1B, 0x1D, 0x1E, 0x1F
//
// These are intermediate types used by the type transform pipeline at
// 0x07FEB6. They appear in the forward/reverse tables at 0x07FE8A-0x07FE96
// but are not documented in standard TI-OS references.
//
// This probe scans known FPU regions of the ROM for instructions that
// reference these type values, looking for CP, LD, AND, OR, XOR, SUB, ADD
// patterns.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);

const INTERNAL_TYPES = [0x1B, 0x1D, 0x1E, 0x1F];
const TYPE_NAMES = {
  0x1B: 'FPU_INTERMEDIATE_A (from 0x21/0x1C)',
  0x1D: 'FPU_INTERMEDIATE_B (from 0x18)',
  0x1E: 'FPU_INTERMEDIATE_C (from 0x00/Real)',
  0x1F: 'FPU_INTERMEDIATE_D (from 0x19)',
};

// Regions to scan
const REGIONS = [
  { name: 'Main FPU',        start: 0x07C700, end: 0x080300 },
  { name: 'Secondary FPU',   start: 0x068600, end: 0x069F00 },
  { name: 'FP Validation',   start: 0x099000, end: 0x099600 },
];

// Instructions that take an immediate byte operand
const IMM8_OPCODES = {
  0xFE: 'CP',
  0xC6: 'ADD A,',
  0xCE: 'ADC A,',
  0xD6: 'SUB',
  0xDE: 'SBC A,',
  0xE6: 'AND',
  0xEE: 'XOR',
  0xF6: 'OR',
  0x06: 'LD B,',
  0x0E: 'LD C,',
  0x16: 'LD D,',
  0x1E: 'LD E,',
  0x26: 'LD H,',
  0x2E: 'LD L,',
  0x3E: 'LD A,',
  0x36: 'LD (HL),',
};

const hits = [];

for (const region of REGIONS) {
  for (let addr = region.start; addr < region.end && addr < rom.length; addr++) {
    const byte = rom[addr];

    // Check if this byte is one of our target types
    if (!INTERNAL_TYPES.includes(byte)) continue;

    const prevByte = addr > 0 ? rom[addr - 1] : 0;
    const prev2Byte = addr > 1 ? rom[addr - 2] : 0;
    const prev3Byte = addr > 2 ? rom[addr - 3] : 0;

    let instruction = null;
    let instrAddr = null;
    let confidence = 'LOW';

    // Case 1: Standard immediate-byte instruction
    if (IMM8_OPCODES[prevByte]) {
      instruction = `${IMM8_OPCODES[prevByte]} 0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      instrAddr = addr - 1;
      confidence = 'HIGH';
    }
    // Case 2: DD/FD prefix: DD 36 dd nn = LD (IX+d),n or FD 36 dd nn = LD (IY+d),n
    else if (prev3Byte === 0xDD || prev3Byte === 0xFD) {
      const reg = prev3Byte === 0xDD ? 'IX' : 'IY';
      if (prev2Byte === 0x36) {
        const disp = rom[addr - 1];
        const dispSigned = disp > 127 ? disp - 256 : disp;
        instruction = `LD (${reg}+${dispSigned}), 0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
        instrAddr = addr - 3;
        confidence = 'HIGH';
      }
    }
    // Case 3: DD/FD prefix with standard imm8 opcode
    else if ((prev2Byte === 0xDD || prev2Byte === 0xFD) && IMM8_OPCODES[prevByte]) {
      instruction = `[${prev2Byte === 0xDD ? 'IX' : 'IY'} prefix] ${IMM8_OPCODES[prevByte]} 0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      instrAddr = addr - 2;
      confidence = 'MEDIUM';
    }

    // Not matched as instruction operand
    if (!instruction) {
      if (addr >= 0x07FE8A && addr <= 0x07FE96) {
        instruction = '[TABLE DATA at transform table]';
        instrAddr = addr;
        confidence = 'TABLE';
      } else {
        instruction = `[DATA/UNKNOWN preceding opcode 0x${prevByte.toString(16).toUpperCase().padStart(2, '0')}]`;
        instrAddr = addr;
        confidence = 'LOW';
      }
    }

    // Surrounding bytes for context
    const ctxStart = Math.max(0, addr - 5);
    const ctxEnd = Math.min(rom.length, addr + 6);
    const context = [];
    for (let i = ctxStart; i < ctxEnd; i++) {
      const marker = i === addr
        ? `[${rom[i].toString(16).toUpperCase().padStart(2, '0')}]`
        : rom[i].toString(16).toUpperCase().padStart(2, '0');
      context.push(marker);
    }

    hits.push({
      addr,
      instrAddr,
      typeValue: byte,
      typeName: TYPE_NAMES[byte],
      instruction,
      confidence,
      context: context.join(' '),
      region: region.name,
    });
  }
}

// Print results
console.log('=== Phase 539: Internal FPU Type Cross-Reference ===');
console.log(`Scanned ${REGIONS.length} regions for types: ${INTERNAL_TYPES.map(t => '0x' + t.toString(16).toUpperCase()).join(', ')}`);
console.log(`Total hits: ${hits.length}`);
console.log();

const significantHits = hits.filter(h => h.confidence !== 'LOW');
const lowHits = hits.filter(h => h.confidence === 'LOW');

console.log(`=== SIGNIFICANT HITS (HIGH/MEDIUM/TABLE confidence): ${significantHits.length} ===`);
console.log();

for (const h of significantHits) {
  console.log(`  0x${h.addr.toString(16).toUpperCase().padStart(6, '0')} | ${h.region.padEnd(16)} | ${h.confidence.padEnd(6)} | ${h.instruction}`);
  console.log(`    Type: 0x${h.typeValue.toString(16).toUpperCase().padStart(2, '0')} = ${h.typeName}`);
  console.log(`    Context: ${h.context}`);
  console.log();
}

console.log(`=== LOW CONFIDENCE HITS (likely data bytes): ${lowHits.length} ===`);
console.log();

for (const typeVal of INTERNAL_TYPES) {
  const typeHits = lowHits.filter(h => h.typeValue === typeVal);
  if (typeHits.length > 0) {
    console.log(`  Type 0x${typeVal.toString(16).toUpperCase()} (${TYPE_NAMES[typeVal]}): ${typeHits.length} hits`);
    for (const h of typeHits) {
      console.log(`    0x${h.addr.toString(16).toUpperCase().padStart(6, '0')} | ${h.region.padEnd(16)} | ${h.instruction}`);
      console.log(`      Context: ${h.context}`);
    }
    console.log();
  }
}

// Summary table
console.log('=== SUMMARY TABLE ===');
console.log();
console.log('Address    | Instruction                          | Type | Confidence | Meaning');
console.log('-----------|--------------------------------------|------|------------|--------');
for (const h of significantHits) {
  const addrStr = '0x' + h.addr.toString(16).toUpperCase().padStart(6, '0');
  const instrStr = h.instruction.padEnd(38);
  const typeStr = '0x' + h.typeValue.toString(16).toUpperCase().padStart(2, '0');
  console.log(`${addrStr} | ${instrStr} | ${typeStr} | ${h.confidence.padEnd(10)} | ${h.typeName}`);
}

// Per-type summary
console.log();
console.log('=== PER-TYPE SUMMARY ===');
for (const typeVal of INTERNAL_TYPES) {
  const allOfType = hits.filter(h => h.typeValue === typeVal);
  const sigOfType = significantHits.filter(h => h.typeValue === typeVal);
  console.log(`  0x${typeVal.toString(16).toUpperCase()}: ${allOfType.length} total, ${sigOfType.length} significant (HIGH/MEDIUM/TABLE)`);
}

console.log();
console.log('Phase 539 complete.');
