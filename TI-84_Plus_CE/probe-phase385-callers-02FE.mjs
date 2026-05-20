#!/usr/bin/env node

/**
 * Phase 385 - find raw CALL/JP references into 0x02FE00..0x02FF00.
 *
 * This probe:
 *   1. Reads ROM.rom (expected size: 0x400000 bytes).
 *   2. Scans the full ROM for CALL/JP encodings whose 24-bit target lands in
 *      0x02FE00..0x02FF00.
 *   3. Includes both plain ADL encodings and ED-prefixed mixed-mode variants.
 *   4. Scans the full ROM for any raw 24-bit little-endian value in the same
 *      range as a potential indirect/table reference.
 *   5. Prints all hits and ends with a structured JSON summary.
 *
 * Usage:
 *   node TI-84_Plus_CE/probe-phase385-callers-02FE.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const TARGET_START = 0x02FE00;
const TARGET_END = 0x02FF00;

const CONTROL_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL' },
  { opcode: 0xC4, mnemonic: 'CALL NZ' },
  { opcode: 0xCC, mnemonic: 'CALL Z' },
  { opcode: 0xD4, mnemonic: 'CALL NC' },
  { opcode: 0xDC, mnemonic: 'CALL C' },
  { opcode: 0xE4, mnemonic: 'CALL PO' },
  { opcode: 0xEC, mnemonic: 'CALL PE' },
  { opcode: 0xF4, mnemonic: 'CALL P' },
  { opcode: 0xFC, mnemonic: 'CALL M' },
  { opcode: 0xC3, mnemonic: 'JP' },
  { opcode: 0xC2, mnemonic: 'JP NZ' },
  { opcode: 0xCA, mnemonic: 'JP Z' },
  { opcode: 0xD2, mnemonic: 'JP NC' },
  { opcode: 0xDA, mnemonic: 'JP C' },
  { opcode: 0xE2, mnemonic: 'JP PO' },
  { opcode: 0xEA, mnemonic: 'JP PE' },
  { opcode: 0xF2, mnemonic: 'JP P' },
  { opcode: 0xFA, mnemonic: 'JP M' },
];

const CONTROL_BY_OPCODE = new Map(CONTROL_PATTERNS.map((entry) => [entry.opcode, entry]));

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function inTargetRange(value) {
  return value >= TARGET_START && value <= TARGET_END;
}

function scanDirectTransfers(rom) {
  const matches = [];

  for (let offset = 0; offset <= rom.length - 4; offset++) {
    const plain = CONTROL_BY_OPCODE.get(rom[offset]);
    if (plain) {
      const target = read24LE(rom, offset + 1);
      if (inTargetRange(target)) {
        matches.push({
          caller: offset,
          target,
          mnemonic: plain.mnemonic,
          bytes: rom.subarray(offset, offset + 4),
          encoding: 'plain',
          operandOffset: offset + 1,
        });
      }
    }

    if (rom[offset] === 0xED && offset <= rom.length - 5) {
      const prefixed = CONTROL_BY_OPCODE.get(rom[offset + 1]);
      if (prefixed) {
        const target = read24LE(rom, offset + 2);
        if (inTargetRange(target)) {
          matches.push({
            caller: offset,
            target,
            mnemonic: `ED ${prefixed.mnemonic}`,
            bytes: rom.subarray(offset, offset + 5),
            encoding: 'ed-prefixed',
            operandOffset: offset + 2,
          });
        }
      }
    }
  }

  matches.sort((left, right) => {
    if (left.caller !== right.caller) return left.caller - right.caller;
    if (left.target !== right.target) return left.target - right.target;
    return left.mnemonic.localeCompare(right.mnemonic);
  });

  return matches;
}

function buildOperandOwners(matches) {
  const owners = new Map();

  for (const match of matches) {
    const key = match.operandOffset;
    const bucket = owners.get(key) ?? [];
    bucket.push(match);
    owners.set(key, bucket);
  }

  return owners;
}

function scanRawReferences(rom, operandOwners) {
  const refs = [];

  for (let offset = 0; offset <= rom.length - 3; offset++) {
    const target = read24LE(rom, offset);
    if (!inTargetRange(target)) {
      continue;
    }

    refs.push({
      offset,
      target,
      bytes: rom.subarray(offset, offset + 3),
      owners: operandOwners.get(offset) ?? [],
    });
  }

  refs.sort((left, right) => {
    if (left.offset !== right.offset) return left.offset - right.offset;
    return left.target - right.target;
  });

  return refs;
}

function formatDirectRow(match) {
  const caller = hex(match.caller);
  const instructionHex = bytesHex(match.bytes).padEnd(14, ' ');
  const mnemonic = match.mnemonic.padEnd(10, ' ');
  const target = hex(match.target);
  return `${caller}  ${instructionHex}  ${mnemonic}  ${target}`;
}

function formatRawNote(ref) {
  if (ref.owners.length === 0) {
    return 'possible table/data reference';
  }

  return ref.owners
    .map((owner) => `operand-of ${owner.mnemonic} @ ${hex(owner.caller)}`)
    .join('; ');
}

function formatRawRow(ref) {
  const offset = hex(ref.offset);
  const raw = bytesHex(ref.bytes).padEnd(8, ' ');
  const target = hex(ref.target);
  return `${offset}  ${raw}  ${target}  ${formatRawNote(ref)}`;
}

function groupDirectByTarget(matches) {
  const grouped = new Map();

  for (const match of matches) {
    const key = hex(match.target);
    const bucket = grouped.get(key) ?? [];
    bucket.push({
      caller_address: hex(match.caller),
      instruction_hex: bytesHex(match.bytes),
      mnemonic: match.mnemonic,
    });
    grouped.set(key, bucket);
  }

  return Object.fromEntries(
    Array.from(grouped.entries())
      .sort(([left], [right]) => Number.parseInt(left, 16) - Number.parseInt(right, 16)),
  );
}

function groupRawByTarget(refs) {
  const grouped = new Map();

  for (const ref of refs) {
    const key = hex(ref.target);
    const bucket = grouped.get(key) ?? [];
    bucket.push({
      offset: hex(ref.offset),
      bytes: bytesHex(ref.bytes),
      note: formatRawNote(ref),
    });
    grouped.set(key, bucket);
  }

  return Object.fromEntries(
    Array.from(grouped.entries())
      .sort(([left], [right]) => Number.parseInt(left, 16) - Number.parseInt(right, 16)),
  );
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);

  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(
      `Expected ROM size ${hex(EXPECTED_ROM_SIZE, 8)} (${EXPECTED_ROM_SIZE}) bytes, ` +
      `got ${hex(rom.length, 8)} (${rom.length}) bytes.`,
    );
  }

  const directMatches = scanDirectTransfers(rom);
  const rawRefs = scanRawReferences(rom, buildOperandOwners(directMatches));

  console.log('='.repeat(88));
  console.log('Phase 385 - 0x02FE__ caller scan');
  console.log('='.repeat(88));
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Target range: ${hex(TARGET_START)}..${hex(TARGET_END)}`);
  console.log('Scan mode: raw whole-ROM byte-pattern scan (not instruction-boundary aware)');

  console.log('\n' + '-'.repeat(88));
  console.log('Direct CALL/JP matches into 0x02FE00..0x02FF00');
  console.log('-'.repeat(88));
  console.log('caller_address  instruction_hex  mnemonic    target_address');

  if (directMatches.length === 0) {
    console.log('(none)');
  } else {
    for (const match of directMatches) {
      console.log(formatDirectRow(match));
    }
  }

  console.log('\n' + '-'.repeat(88));
  console.log('Raw 24-bit little-endian references into 0x02FE00..0x02FF00');
  console.log('-'.repeat(88));
  console.log('offset          raw_bytes  target_address  note');

  if (rawRefs.length === 0) {
    console.log('(none)');
  } else {
    for (const ref of rawRefs) {
      console.log(formatRawRow(ref));
    }
  }

  const summary = {
    target_range: {
      start: hex(TARGET_START),
      end: hex(TARGET_END),
    },
    rom: {
      path: ROM_PATH,
      size_bytes: rom.length,
    },
    scan_mode: 'raw whole-ROM byte-pattern scan',
    direct_callers: {
      total_matches: directMatches.length,
      unique_caller_addresses: Array.from(new Set(directMatches.map((match) => hex(match.caller)))),
      matches: directMatches.map((match) => ({
        caller_address: hex(match.caller),
        instruction_hex: bytesHex(match.bytes),
        mnemonic: match.mnemonic,
        target_address: hex(match.target),
        encoding: match.encoding,
      })),
      by_target: groupDirectByTarget(directMatches),
    },
    raw_references: {
      total_matches: rawRefs.length,
      standalone_matches: rawRefs.filter((ref) => ref.owners.length === 0).length,
      matches: rawRefs.map((ref) => ({
        offset: hex(ref.offset),
        raw_bytes: bytesHex(ref.bytes),
        target_address: hex(ref.target),
        note: formatRawNote(ref),
      })),
      by_target: groupRawByTarget(rawRefs),
    },
  };

  console.log('\n' + '='.repeat(88));
  console.log('Structured summary');
  console.log('='.repeat(88));
  console.log(JSON.stringify(summary, null, 2));
}

main();
