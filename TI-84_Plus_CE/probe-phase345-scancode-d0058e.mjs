#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TARGETS = [
  { addr: 0xD0058C, label: 'D0058C (_GetCSC primary / kbdKey)' },
  { addr: 0xD0058D, label: 'D0058D (kbdGetKy / GetKey result)' },
  { addr: 0xD0058E, label: 'D0058E (handler/event byte)' },
];

const WRITER_KINDS = new Set(['WRITE', 'WRITE_PAIR', 'ADDR_LOAD_WRITE', 'ADDR_LOAD_RMW']);
const READER_KINDS = new Set(['READ', 'READ_PAIR', 'ADDR_LOAD_READ']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(bytes, offset) {
  return (
    (bytes[offset] & 0xFF) |
    ((bytes[offset + 1] & 0xFF) << 8) |
    ((bytes[offset + 2] & 0xFF) << 16)
  ) >>> 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function contextHex(offset, before = 5, after = 10) {
  const start = Math.max(0, offset - before);
  const end = Math.min(rom.length, offset + 3 + after);
  return bytesToHex(rom.subarray(start, end));
}

function classifyHLFollowup(start) {
  const next = rom[start + 4];
  const next2 = rom[start + 5];

  if (next === 0x36) {
    return {
      kind: 'ADDR_LOAD_WRITE',
      instruction: `LD HL,nn ; LD (HL),${hex(next2 ?? 0, 2)}`,
    };
  }

  if ((next >= 0x70 && next <= 0x75) || next === 0x77) {
    const registerMap = {
      0x70: 'B',
      0x71: 'C',
      0x72: 'D',
      0x73: 'E',
      0x74: 'H',
      0x75: 'L',
      0x77: 'A',
    };
    return {
      kind: 'ADDR_LOAD_WRITE',
      instruction: `LD HL,nn ; LD (HL),${registerMap[next]}`,
    };
  }

  if (next === 0x34 || next === 0x35) {
    return {
      kind: 'ADDR_LOAD_RMW',
      instruction: `LD HL,nn ; ${next === 0x34 ? 'INC' : 'DEC'} (HL)`,
    };
  }

  if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].includes(next)) {
    return {
      kind: 'ADDR_LOAD_READ',
      instruction: 'LD HL,nn ; LD r,(HL)',
    };
  }

  return null;
}

function classifyReference(offset) {
  const prev1 = offset >= 1 ? rom[offset - 1] : null;
  const prev2 = offset >= 2 ? rom[offset - 2] : null;
  const prev3 = offset >= 3 ? rom[offset - 3] : null;

  if ((prev2 === 0xDD || prev2 === 0xFD) && prev1 === 0x21) {
    return {
      start: offset - 2,
      kind: 'ADDR_LOAD',
      instruction: `LD ${prev2 === 0xDD ? 'IX' : 'IY'},nn`,
    };
  }

  if ((prev3 === 0xDD || prev3 === 0xFD) && (prev2 === 0x22 || prev2 === 0x2A)) {
    return {
      start: offset - 3,
      kind: prev2 === 0x22 ? 'WRITE_PAIR' : 'READ_PAIR',
      instruction: prev2 === 0x22
        ? `LD (nn),${prev3 === 0xDD ? 'IX' : 'IY'}`
        : `LD ${prev3 === 0xDD ? 'IX' : 'IY'},(nn)`,
    };
  }

  if (prev2 === 0xED) {
    const edMap = {
      0x43: ['WRITE_PAIR', 'LD (nn),BC'],
      0x53: ['WRITE_PAIR', 'LD (nn),DE'],
      0x63: ['WRITE_PAIR', 'LD (nn),HL'],
      0x73: ['WRITE_PAIR', 'LD (nn),SP'],
      0x4B: ['READ_PAIR', 'LD BC,(nn)'],
      0x5B: ['READ_PAIR', 'LD DE,(nn)'],
      0x6B: ['READ_PAIR', 'LD HL,(nn)'],
      0x7B: ['READ_PAIR', 'LD SP,(nn)'],
    };

    if (edMap[prev1]) {
      return {
        start: offset - 2,
        kind: edMap[prev1][0],
        instruction: edMap[prev1][1],
      };
    }
  }

  if (prev1 === 0x32) {
    return { start: offset - 1, kind: 'WRITE', instruction: 'LD (nn),A' };
  }

  if (prev1 === 0x3A) {
    return { start: offset - 1, kind: 'READ', instruction: 'LD A,(nn)' };
  }

  if (prev1 === 0x22) {
    return { start: offset - 1, kind: 'WRITE_PAIR', instruction: 'LD (nn),HL' };
  }

  if (prev1 === 0x2A) {
    return { start: offset - 1, kind: 'READ_PAIR', instruction: 'LD HL,(nn)' };
  }

  if (prev1 === 0x21) {
    const followup = classifyHLFollowup(offset - 1);
    if (followup) {
      return {
        start: offset - 1,
        kind: followup.kind,
        instruction: followup.instruction,
      };
    }
    return { start: offset - 1, kind: 'ADDR_LOAD', instruction: 'LD HL,nn' };
  }

  if (prev1 === 0x01) {
    return { start: offset - 1, kind: 'ADDR_LOAD', instruction: 'LD BC,nn' };
  }

  if (prev1 === 0x11) {
    return { start: offset - 1, kind: 'ADDR_LOAD', instruction: 'LD DE,nn' };
  }

  if (prev1 === 0x31) {
    return { start: offset - 1, kind: 'ADDR_LOAD', instruction: 'LD SP,nn' };
  }

  return { start: offset, kind: 'UNKNOWN', instruction: 'raw pattern only' };
}

function buildSummary(matches) {
  const byKind = new Map();
  let readLike = 0;
  let writeLike = 0;
  let pointerLike = 0;
  let unknown = 0;

  for (const match of matches) {
    byKind.set(match.kind, (byKind.get(match.kind) || 0) + 1);

    if (READER_KINDS.has(match.kind)) {
      readLike += 1;
    } else if (WRITER_KINDS.has(match.kind)) {
      writeLike += 1;
    } else if (match.kind === 'ADDR_LOAD') {
      pointerLike += 1;
    } else if (match.kind === 'UNKNOWN') {
      unknown += 1;
    }
  }

  return { total: matches.length, readLike, writeLike, pointerLike, unknown, byKind };
}

function scanForAddress(target) {
  const lo = target.addr & 0xFF;
  const mid = (target.addr >> 8) & 0xFF;
  const hi = (target.addr >> 16) & 0xFF;
  const matches = [];

  for (let offset = 0; offset < rom.length - 2; offset += 1) {
    if (rom[offset] !== lo || rom[offset + 1] !== mid || rom[offset + 2] !== hi) {
      continue;
    }

    const classified = classifyReference(offset);
    matches.push({
      offset,
      start: classified.start,
      kind: classified.kind,
      instruction: classified.instruction,
      context: contextHex(offset),
    });
  }

  return { ...target, matches, summary: buildSummary(matches) };
}

function printScan(scan) {
  console.log(`\n=== ${scan.label} (${hex(scan.addr)}) ===`);
  console.log(`Total raw hits: ${scan.summary.total}`);
  console.log(`Read-like refs: ${scan.summary.readLike}`);
  console.log(`Write-like refs: ${scan.summary.writeLike}`);
  console.log(`Pointer loads: ${scan.summary.pointerLike}`);
  console.log(`Unknown hits: ${scan.summary.unknown}`);
  console.log('Breakdown by kind:');

  for (const [kind, count] of [...scan.summary.byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${kind.padEnd(16)} ${count}`);
  }

  console.log('Matches:');
  for (const match of scan.matches) {
    console.log(
      `  inst@${hex(match.start)}  match@${hex(match.offset)}  ${match.kind.padEnd(16)} ` +
      `${match.instruction.padEnd(24)} [${match.context}]`,
    );
  }
}

function scanExactCopy(fromAddr, toAddr) {
  const matches = [];

  for (let pc = 0; pc < rom.length - 8; pc += 1) {
    if (rom[pc] !== 0x3A || read24(rom, pc + 1) !== fromAddr) {
      continue;
    }
    if (rom[pc + 4] !== 0x32 || read24(rom, pc + 5) !== toAddr) {
      continue;
    }

    matches.push({
      readAt: pc,
      writeAt: pc + 4,
      context: bytesToHex(rom.subarray(Math.max(0, pc - 3), Math.min(rom.length, pc + 12))),
    });
  }

  return matches;
}

function printCopyScan(fromAddr, toAddr, matches) {
  console.log(`\n=== Exact A-Copy Scan ${hex(fromAddr)} -> ${hex(toAddr)} ===`);
  console.log('Pattern: `LD A,(from)` immediately followed by `LD (to),A`.');
  console.log(`Matches: ${matches.length}`);

  for (const match of matches) {
    console.log(
      `  ${hex(match.readAt)} -> ${hex(match.writeAt)}  ` +
      `LD A,(${hex(fromAddr)}) ; LD (${hex(toAddr)}),A  [${match.context}]`,
    );
  }
}

function main() {
  console.log('Phase 345: 0xD0058C / 0xD0058D / 0xD0058E ROM-wide reference scan');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes`);

  const scans = TARGETS.map(scanForAddress);
  for (const scan of scans) {
    printScan(scan);
  }

  const directPrimaryToSecondary = scanExactCopy(0xD0058C, 0xD0058E);
  const directSecondaryToPrimary = scanExactCopy(0xD0058E, 0xD0058C);

  printCopyScan(0xD0058C, 0xD0058E, directPrimaryToSecondary);
  printCopyScan(0xD0058E, 0xD0058C, directSecondaryToPrimary);

  console.log('\nSummary table:');
  console.log('  Address   Total  ReadLike  WriteLike  PtrLoads  Unknown');
  for (const scan of scans) {
    console.log(
      `  ${hex(scan.addr)}  ${String(scan.summary.total).padStart(5)}  ` +
      `${String(scan.summary.readLike).padStart(8)}  ${String(scan.summary.writeLike).padStart(9)}  ` +
      `${String(scan.summary.pointerLike).padStart(8)}  ${String(scan.summary.unknown).padStart(7)}`,
    );
  }

  console.log('\nDone.');
}

main();
