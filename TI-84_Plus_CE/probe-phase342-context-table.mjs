#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

const TABLE_BASE = 0x08C958;
const TABLE_STRIDE = 3;
const MIN_ENTRIES = 20;
const MAX_SCAN_ENTRIES = 40;
const ROM_MAX = Math.min(rom.length - 1, 0x3FFFFF);

const SESSION_341_REGISTRY = new Set([
  0x058241,
  0x05CD71,
  0x05FFEF,
  0x06B4E8,
  0x080FB7,
  0x0810E8,
  0x08149F,
  0x09D32D,
  0x09D22C,
  0x0AB83D,
  0x0ABA44,
  0x0AC035,
  0x0ACCDD,
  0x0B1D3B,
  0x0B4DAE,
  0x0B62D8,
]);

const NAMED_HANDLERS = new Map([
  [0x058241, 'HOME_HANDLER'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(offset, length) {
  return Array.from(
    rom.subarray(offset, Math.min(rom.length, offset + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function printHexDump(offset, length, bytesPerLine = 16) {
  for (let cursor = 0; cursor < length; cursor += bytesPerLine) {
    const lineOffset = offset + cursor;
    const lineLength = Math.min(bytesPerLine, length - cursor);
    console.log(`  ${hex(lineOffset)}: ${bytesAt(lineOffset, lineLength)}`);
  }
}

function describeHandler(value) {
  if (NAMED_HANDLERS.has(value)) {
    return NAMED_HANDLERS.get(value);
  }
  if (SESSION_341_REGISTRY.has(value)) {
    return 'session-341 cxMain registry match';
  }
  return 'unknown';
}

function registryStatus(value) {
  return SESSION_341_REGISTRY.has(value) ? 'known registry match' : 'new/unknown';
}

function formatInstruction(inst) {
  if (!inst) {
    return '??';
  }

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'ldir':
      return 'ldir';
    default:
      return inst.tag;
  }
}

function decodePreview(offset, maxInstructions = 4) {
  const lines = [];
  let pc = offset;

  for (let index = 0; index < maxInstructions && pc < rom.length; index += 1) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      break;
    }

    const length = Math.max(inst?.length ?? 0, 0);
    if (length <= 0) {
      break;
    }

    lines.push({
      pc,
      bytes: bytesAt(pc, length),
      inst,
      text: formatInstruction(inst),
    });

    pc += length;
  }

  return lines;
}

function looksLikeCodeBoundary(offset) {
  const preview = decodePreview(offset, 4);
  if (preview.length < 4) {
    return { matches: false, preview };
  }

  const matches =
    preview[0].inst?.tag === 'ld-pair-imm' &&
    preview[0].inst?.pair === 'bc' &&
    preview[1].inst?.tag === 'ld-pair-imm' &&
    preview[1].inst?.pair === 'hl' &&
    preview[2].inst?.tag === 'ld-pair-imm' &&
    preview[2].inst?.pair === 'de' &&
    preview[3].inst?.tag === 'ldir';

  return { matches, preview };
}

function scanTable() {
  const entries = [];
  let endInfo = null;

  for (let index = 0; index < MAX_SCAN_ENTRIES; index += 1) {
    const offset = TABLE_BASE + index * TABLE_STRIDE;
    if (offset + 2 >= rom.length) {
      endInfo = {
        kind: 'rom-end',
        tableEntries: entries.length,
        stopOffset: offset,
      };
      break;
    }

    const value = read24LE(rom, offset);
    entries.push({
      index,
      offset,
      value,
      label: describeHandler(value),
      status: registryStatus(value),
      isKnown: SESSION_341_REGISTRY.has(value),
    });

    if (entries.length < MIN_ENTRIES) {
      continue;
    }

    const nextOffset = offset + TABLE_STRIDE;
    if (nextOffset + 2 >= rom.length) {
      endInfo = {
        kind: 'rom-end',
        tableEntries: entries.length,
        stopOffset: nextOffset,
      };
      break;
    }

    const nextValue = read24LE(rom, nextOffset);
    if (nextValue === 0x000000 || nextValue === 0xFFFFFF) {
      endInfo = {
        kind: 'sentinel',
        tableEntries: entries.length,
        stopOffset: nextOffset,
        nextValue,
      };
      break;
    }

    if (nextValue > ROM_MAX) {
      endInfo = {
        kind: 'out-of-range',
        tableEntries: entries.length,
        stopOffset: nextOffset,
        nextValue,
      };
      break;
    }

    const codeBoundary = looksLikeCodeBoundary(nextOffset);
    if (codeBoundary.matches) {
      endInfo = {
        kind: 'code',
        tableEntries: entries.length,
        stopOffset: nextOffset,
        nextValue,
        preview: codeBoundary.preview,
      };
      break;
    }
  }

  if (!endInfo) {
    endInfo = {
      kind: 'not-found',
      tableEntries: entries.length,
      stopOffset: TABLE_BASE + entries.length * TABLE_STRIDE,
    };
  }

  return { entries, endInfo };
}

function printEntries(entries) {
  console.log('=== Table Entries ===');
  console.log('');

  for (const entry of entries) {
    console.log(
      `index ${entry.index}: handler = ${hex(entry.value)}  ${entry.label} [${entry.status}]`,
    );
  }

  console.log('');
}

function printCrossReference(entries) {
  const matches = entries.filter((entry) => entry.isKnown);
  const unknowns = entries.filter((entry) => !entry.isKnown);

  console.log('=== Cross-Reference ===');
  console.log('');
  console.log(`Exact session-341 registry matches: ${matches.length}/${entries.length}`);

  if (matches.length > 0) {
    for (const entry of matches) {
      console.log(`  index ${entry.index}: ${hex(entry.value)} -> ${entry.label}`);
    }
  }

  if (unknowns.length > 0) {
    console.log('');
    console.log(`New/unknown table entries: ${unknowns.length}`);
    for (const entry of unknowns) {
      console.log(`  index ${entry.index}: ${hex(entry.value)}`);
    }
  }

  console.log('');
}

function printEndAnalysis(endInfo) {
  console.log('=== Table End Analysis ===');
  console.log('');

  switch (endInfo.kind) {
    case 'sentinel':
      console.log(
        `Found sentinel ${hex(endInfo.nextValue)} at ${hex(endInfo.stopOffset)}; table likely ends after ${endInfo.tableEntries} entries.`,
      );
      break;
    case 'out-of-range':
      console.log(
        `Found out-of-range candidate ${hex(endInfo.nextValue)} at ${hex(endInfo.stopOffset)}; table likely ends after ${endInfo.tableEntries} entries.`,
      );
      break;
    case 'rom-end':
      console.log(
        `Scan hit the ROM boundary at ${hex(endInfo.stopOffset)} after ${endInfo.tableEntries} entries.`,
      );
      break;
    case 'code':
      console.log('No 0x000000/0xFFFFFF sentinel was found.');
      console.log(
        `Likely table end: ${hex(endInfo.stopOffset)} (after ${endInfo.tableEntries} entries; last valid index ${endInfo.tableEntries - 1}).`,
      );
      console.log(
        `Reason: the next 3-byte candidate would be ${hex(endInfo.nextValue)}, but the bytes at ${hex(endInfo.stopOffset)} decode as a code prologue:`,
      );
      for (const line of endInfo.preview) {
        console.log(`  ${hex(line.pc)}: ${line.bytes.padEnd(14)} ${line.text}`);
      }
      break;
    default:
      console.log(
        `No sentinel or boundary heuristic fired within ${endInfo.tableEntries} scanned entries.`,
      );
      break;
  }

  console.log('');
}

function printSummary(entries, endInfo) {
  console.log('=== Summary Map ===');
  console.log('');

  for (const entry of entries) {
    console.log(`Index ${entry.index} -> ${hex(entry.value)} -> ${entry.label}`);
  }

  console.log('');
  console.log(
    `Span: ${hex(TABLE_BASE)} .. ${hex(endInfo.stopOffset - 1)} (${endInfo.tableEntries} entries, stride ${TABLE_STRIDE} bytes)`,
  );
  console.log('');
}

function main() {
  const { entries, endInfo } = scanTable();
  const bytesToShow = Math.max(MIN_ENTRIES * TABLE_STRIDE, Math.min(entries.length * TABLE_STRIDE, 0x60));

  console.log('Phase 342: context handler table decode');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Table base: ${hex(TABLE_BASE)}`);
  console.log(`Read stride: ${TABLE_STRIDE} bytes per entry`);
  console.log('');

  console.log(`Raw bytes at ${hex(TABLE_BASE)} (first ${bytesToShow} bytes):`);
  printHexDump(TABLE_BASE, bytesToShow);
  console.log('');

  printEntries(entries);
  printCrossReference(entries);
  printEndAnalysis(endInfo);
  printSummary(entries, endInfo);
}

main();
