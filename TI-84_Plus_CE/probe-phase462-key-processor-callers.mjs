#!/usr/bin/env node
// Phase 462: locate direct callers and raw byte references to 0x03FA09.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TARGET = 0x03FA09;
const TARGET_BYTES = [0x09, 0xFA, 0x03];
const DIRECT_LENGTH = 4;
const PATTERN_LENGTH = 3;
const CONTEXT_BYTES = 8;

const DIRECT_OPCODES = [
  { opcode: 0xCD, mnemonic: 'CALL' },
  { opcode: 0xC3, mnemonic: 'JP' },
  { opcode: 0xC4, mnemonic: 'CALL NZ' },
  { opcode: 0xCC, mnemonic: 'CALL Z' },
  { opcode: 0xD4, mnemonic: 'CALL NC' },
  { opcode: 0xDC, mnemonic: 'CALL C' },
  { opcode: 0xE4, mnemonic: 'CALL PO' },
  { opcode: 0xEC, mnemonic: 'CALL PE' },
  { opcode: 0xF4, mnemonic: 'CALL P' },
  { opcode: 0xFC, mnemonic: 'CALL M' },
  { opcode: 0xC2, mnemonic: 'JP NZ' },
  { opcode: 0xCA, mnemonic: 'JP Z' },
  { opcode: 0xD2, mnemonic: 'JP NC' },
  { opcode: 0xDA, mnemonic: 'JP C' },
  { opcode: 0xE2, mnemonic: 'JP PO' },
  { opcode: 0xEA, mnemonic: 'JP PE' },
  { opcode: 0xF2, mnemonic: 'JP P' },
  { opcode: 0xFA, mnemonic: 'JP M' },
];

const DIRECT_OPCODE_MAP = new Map(
  DIRECT_OPCODES.map(({ opcode, mnemonic }) => [opcode, mnemonic]),
);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatByteArray(bytes) {
  return Array.from(bytes, hexByte).join(' ') || '(none)';
}

function matchesTarget(bytes, offset) {
  return (
    offset >= 0 &&
    offset + TARGET_BYTES.length <= bytes.length &&
    bytes[offset] === TARGET_BYTES[0] &&
    bytes[offset + 1] === TARGET_BYTES[1] &&
    bytes[offset + 2] === TARGET_BYTES[2]
  );
}

function formatCallTarget(mnemonic) {
  return mnemonic === 'CALL' || mnemonic === 'JP'
    ? `${mnemonic} ${hex(TARGET)}`
    : `${mnemonic}, ${hex(TARGET)}`;
}

function formatContext(bytes, offset, length) {
  const beforeStart = Math.max(0, offset - CONTEXT_BYTES);
  const before = bytes.subarray(beforeStart, offset);
  const bodyEnd = Math.min(bytes.length, offset + length);
  const body = bytes.subarray(offset, bodyEnd);
  const afterEnd = Math.min(bytes.length, bodyEnd + CONTEXT_BYTES);
  const after = bytes.subarray(bodyEnd, afterEnd);

  return `${formatByteArray(before)} | ${formatByteArray(body)} | ${formatByteArray(after)}`;
}

function findDirectReferences(bytes) {
  const matches = [];

  for (let offset = 0; offset <= bytes.length - DIRECT_LENGTH; offset += 1) {
    const mnemonic = DIRECT_OPCODE_MAP.get(bytes[offset]);
    if (!mnemonic) {
      continue;
    }

    if (!matchesTarget(bytes, offset + 1)) {
      continue;
    }

    matches.push({ offset, mnemonic });
  }

  return matches;
}

function findPatternReferences(bytes) {
  const matches = [];

  for (let offset = 0; offset <= bytes.length - PATTERN_LENGTH; offset += 1) {
    if (matchesTarget(bytes, offset)) {
      matches.push(offset);
    }
  }

  return matches;
}

function printReport(bytes) {
  const directReferences = findDirectReferences(bytes);
  const patternReferences = findPatternReferences(bytes);

  console.log(`=== Key Processor (${hex(TARGET)}) Caller Analysis ===`);
  console.log('');
  console.log('Direct CALL/JP references:');

  if (directReferences.length === 0) {
    console.log('  (none)');
  } else {
    for (const ref of directReferences) {
      const instructionBytes = bytes.subarray(ref.offset, ref.offset + DIRECT_LENGTH);
      console.log(
        `  ${hex(ref.offset)}: ${formatByteArray(instructionBytes)}  (${formatCallTarget(ref.mnemonic)})  context: ${formatContext(bytes, ref.offset, DIRECT_LENGTH)}`,
      );
    }
  }

  console.log('');
  console.log('All ROM locations containing bytes 09 FA 03:');

  if (patternReferences.length === 0) {
    console.log('  (none)');
  } else {
    for (const offset of patternReferences) {
      const patternBytes = bytes.subarray(offset, offset + PATTERN_LENGTH);
      console.log(
        `  ${hex(offset)}: ${formatByteArray(patternBytes)}  context: ${formatContext(bytes, offset, PATTERN_LENGTH)}`,
      );
    }
  }

  console.log('');

  // SDK vector table entry at 0x02014C (_GetCSC)
  const vectorAddr = 0x02014C;
  console.log(`SDK vector table entry at ${hex(vectorAddr)}:`);
  if (vectorAddr + 4 <= bytes.length) {
    const vectorBytes = bytes.subarray(vectorAddr, vectorAddr + 4);
    console.log(`  ${formatByteArray(vectorBytes)}`);
  } else {
    console.log('  (out of range)');
  }

  console.log('');
  console.log(`Total direct callers: ${directReferences.length}`);
  console.log(`Total byte-pattern matches: ${patternReferences.length}`);
}

function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  printReport(romBytes);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`Probe failed: ${message}`);
}

process.exitCode = 0;
