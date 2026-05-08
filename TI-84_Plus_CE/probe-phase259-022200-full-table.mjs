#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const ROM_EXPECTED_SIZE = 0x400000;

const WINDOW_BASE = 0x022200;
const WINDOW_END = 0x022300;
const ENTRY_SIZE = 4;
const KNOWN_SUBTABLE_BASE = 0x022264;

const ROM_TARGET_MAX = 0x400000;
const RAM_TARGET_START = 0xD00000;
const RAM_TARGET_END = 0xD70000;

const HANDLER_TARGETS = [
  0x058241,
  0x03D755,
  0x080CA7,
  0x0AB667,
  0x06C748,
  0x08A653,
  0x09C883,
  0x09C742,
  0x09E30C,
  0x05FE17,
  0x0B290B,
  0x09E3B4,
  0x09DC3C,
  0x05CBDC,
  0x0454A4,
  0x045647,
  0x09CC2A,
  0x09E370,
  0x061ECE,
  0x09E2BF,
];

const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatIndex(value) {
  const abs = Math.abs(value).toString().padStart(2, '0');
  return `${value < 0 ? '-' : '+'}${abs}`;
}

function formatOffset(value, width = 3) {
  return `${value < 0 ? '-' : '+'}0x${Math.abs(value).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(
    rom.subarray(addr, Math.min(addr + length, rom.length)),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read24(addr) {
  return (
    ((rom[addr] ?? 0) & 0xFF) |
    (((rom[addr + 1] ?? 0) & 0xFF) << 8) |
    (((rom[addr + 2] ?? 0) & 0xFF) << 16)
  ) >>> 0;
}

function classifyTarget(target) {
  if (target < ROM_TARGET_MAX) {
    return { valid: true, region: 'ROM' };
  }

  if (target >= RAM_TARGET_START && target < RAM_TARGET_END) {
    return { valid: true, region: 'RAM' };
  }

  return { valid: false, region: 'INVALID' };
}

function parseEntry(addr) {
  const opcode = rom[addr] ?? 0;
  const target = read24(addr + 1);
  const targetInfo = classifyTarget(target);
  const isJp = opcode === 0xC3;
  const validEntry = isJp && targetInfo.valid;

  let boundaryReason = 'dense JP entry';
  if (!isJp) {
    boundaryReason = `opcode ${hex(opcode, 2)} != 0xC3`;
  } else if (!targetInfo.valid) {
    boundaryReason = `target ${hex(target)} is outside ROM/RAM validity ranges`;
  }

  return {
    addr,
    opcode,
    bytes: bytesAt(addr, ENTRY_SIZE),
    target,
    isJp,
    validEntry,
    targetInfo,
    slotIndex: (addr - WINDOW_BASE) / ENTRY_SIZE,
    byteOffset: addr - WINDOW_BASE,
    boundaryReason,
  };
}

function collectEntries(start, endExclusive) {
  const entries = [];
  for (let addr = start; addr < endExclusive; addr += ENTRY_SIZE) {
    entries.push(parseEntry(addr));
  }
  return entries;
}

function findBackwardBoundary(baseAddr) {
  let addr = baseAddr - ENTRY_SIZE;
  while (addr >= 0) {
    const entry = parseEntry(addr);
    if (!entry.validEntry) {
      return { tableStart: addr + ENTRY_SIZE, stopper: entry };
    }
    addr -= ENTRY_SIZE;
  }

  return { tableStart: 0, stopper: null };
}

function findForwardBoundary(startAddr) {
  let addr = startAddr;
  const lastStart = rom.length - ENTRY_SIZE;

  while (addr <= lastStart) {
    const entry = parseEntry(addr);
    if (!entry.validEntry) {
      return { tableEndExclusive: addr, stopper: entry };
    }
    addr += ENTRY_SIZE;
  }

  return { tableEndExclusive: rom.length, stopper: null };
}

function countValid(entries) {
  return entries.filter((entry) => entry.validEntry).length;
}

function countJp(entries) {
  return entries.filter((entry) => entry.isJp).length;
}

function noteForEntry(entry, tableStart, tableEndExclusive) {
  const notes = [];

  if (entry.addr === tableStart) {
    notes.push('table start');
  }
  if (entry.addr === WINDOW_BASE) {
    notes.push('requested base 0x022200');
  }
  if (entry.addr === KNOWN_SUBTABLE_BASE) {
    notes.push('known 0x022264 subtable');
  }
  if (entry.addr + ENTRY_SIZE === tableEndExclusive) {
    notes.push('last valid entry');
  }

  return notes.join('; ');
}

function printEntryTable(title, entries, tableStart, tableEndExclusive) {
  console.log(title);
  console.log('Idx   ByteOff  JP Addr    Bytes        Target    Valid  Region   Notes');
  console.log('----  -------  ---------  -----------  --------  -----  -------  -----');

  for (const entry of entries) {
    const targetText = entry.isJp ? hex(entry.target) : 'n/a';
    const validText = entry.validEntry ? 'yes' : 'no';
    const note = noteForEntry(entry, tableStart, tableEndExclusive) || entry.boundaryReason;

    console.log(
      `${formatIndex(entry.slotIndex).padStart(4)}  ` +
      `${formatOffset(entry.byteOffset).padStart(7)}  ` +
      `${hex(entry.addr)}  ` +
      `${entry.bytes.padEnd(11)}  ` +
      `${targetText.padEnd(8)}  ` +
      `${validText.padEnd(5)}  ` +
      `${entry.targetInfo.region.padEnd(7)}  ` +
      `${note}`,
    );
  }

  console.log('');
}

function printBoundary(label, boundaryAddr, stopper) {
  if (stopper === null) {
    console.log(`${label}: no stopper found before ROM boundary`);
    console.log(`  boundary = ${hex(boundaryAddr)}`);
    return;
  }

  console.log(`${label}:`);
  console.log(`  boundary = ${hex(boundaryAddr)}`);
  console.log(
    `  stopper  = ${hex(stopper.addr)} slot=${formatIndex(stopper.slotIndex)} ` +
    `bytes=${stopper.bytes} reason=${stopper.boundaryReason}`,
  );
}

function buildHandlerTargetMap() {
  const map = new Map();

  for (const [index, target] of HANDLER_TARGETS.entries()) {
    const list = map.get(target) ?? [];
    list.push(index);
    map.set(target, list);
  }

  return map;
}

function findOverlaps(entries) {
  const handlerTargetMap = buildHandlerTargetMap();
  const overlaps = [];

  for (const entry of entries) {
    if (!entry.validEntry) {
      continue;
    }

    const handlerIndexes = handlerTargetMap.get(entry.target);
    if (!handlerIndexes) {
      continue;
    }

    overlaps.push({
      entry,
      handlerIndexes,
    });
  }

  return overlaps;
}

function printOverlaps(overlaps) {
  console.log('=== 4. Session 255 Handler-Target Overlaps ===');
  console.log(`handler targets checked = ${HANDLER_TARGETS.length}`);
  console.log(`overlaps found = ${overlaps.length}`);

  if (overlaps.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const overlap of overlaps) {
    console.log(
      `${hex(overlap.entry.addr)} slot=${formatIndex(overlap.entry.slotIndex)} ` +
      `target=${hex(overlap.entry.target)} matches handler[${overlap.handlerIndexes.join(', ')}]`,
    );
  }

  console.log('');
}

function main() {
  const backward = findBackwardBoundary(WINDOW_BASE);
  const forward = findForwardBoundary(WINDOW_END);
  const tableStart = backward.tableStart;
  const tableEndExclusive = forward.tableEndExclusive;

  const windowEntries = collectEntries(WINDOW_BASE, WINDOW_END);
  const fullEntries = collectEntries(tableStart, tableEndExclusive);
  const overlaps = findOverlaps(fullEntries);

  console.log('Phase 259 probe: dump the full 0x022200 extended vector table');
  console.log(`ROM path = ${fileURLToPath(ROM_PATH)}`);
  console.log(`ROM bytes = ${rom.length} expected = ${ROM_EXPECTED_SIZE}`);
  if (rom.length !== ROM_EXPECTED_SIZE) {
    console.log('warning = ROM size does not match the expected 4,194,304 bytes');
  }
  console.log('');

  console.log('=== 1. Requested 0x022200..0x022300 Window ===');
  console.log(`window base = ${hex(WINDOW_BASE)}`);
  console.log(`window end  = ${hex(WINDOW_END)} (end-exclusive)`);
  console.log(`window slots = ${(WINDOW_END - WINDOW_BASE) / ENTRY_SIZE}`);
  console.log(`known phase-256 subtable base 0x022264 = slot ${formatIndex((KNOWN_SUBTABLE_BASE - WINDOW_BASE) / ENTRY_SIZE)}`);
  console.log(`window JP opcodes = ${countJp(windowEntries)} / ${windowEntries.length}`);
  console.log(`window valid JP entries = ${countValid(windowEntries)} / ${windowEntries.length}`);
  console.log('');
  printEntryTable('Window dump:', windowEntries, tableStart, tableEndExclusive);

  console.log('=== 2. Boundary Scan ===');
  printBoundary('Backward scan from 0x022200', tableStart, backward.stopper);
  printBoundary('Forward scan from 0x022300', tableEndExclusive, forward.stopper);
  console.log(`full table start = ${hex(tableStart)} slot=${formatIndex((tableStart - WINDOW_BASE) / ENTRY_SIZE)}`);
  console.log(`full table end   = ${hex(tableEndExclusive)} (end-exclusive)`);
  console.log(`full table entries = ${fullEntries.length}`);
  console.log(`extends earlier than 0x022200 by ${(WINDOW_BASE - tableStart) / ENTRY_SIZE} entries`);
  console.log(`extends later than 0x022300 by ${(tableEndExclusive - WINDOW_END) / ENTRY_SIZE} entries`);
  console.log('');

  printEntryTable('=== 3. Full Boundary-Derived Table Dump ===', fullEntries, tableStart, tableEndExclusive);
  printOverlaps(overlaps);

  console.log('=== 5. Summary ===');
  console.log(`table range = ${hex(tableStart)} .. ${hex(tableEndExclusive)} (end-exclusive)`);
  console.log(`table size  = ${fullEntries.length} entries / ${fullEntries.length * ENTRY_SIZE} bytes`);
  console.log(`valid JP entries in boundary-derived table = ${countValid(fullEntries)} / ${fullEntries.length}`);
  console.log(`known 0x022264 subtable slot = ${formatIndex((KNOWN_SUBTABLE_BASE - WINDOW_BASE) / ENTRY_SIZE)}`);
  console.log(`handler overlaps = ${overlaps.length}`);
}

main();
