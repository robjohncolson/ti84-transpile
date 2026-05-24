#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const WINDOW_START = 0x000000;
const WINDOW_END = 0x000300;

const KNOWN_NAMES = new Map([
  [0x00211B, 'sparse case dispatcher'],
  [0x002197, '__frameset variant'],
  [0x00218A, '__frameset'],
  [0x0021C2, 'zero/null check'],
  [0x0022F9, 'shift-left variant'],
  [0x00230B, 'left-shift'],
  [0x002330, 'right-shift'],
  [0x0025E8, 'post-walk predicate/helper'],
  [0x002623, '_seqcase'],
  [0x00276B, '_stoiu'],
  [0x0027E8, 'memcpy'],
  [0x00285F, '_bzero'],
]);

const FOCUSED_WRAPPERS = [
  { addr: 0x0000A4, target: 0x0027E8 },
  { addr: 0x000124, target: 0x00211B },
  { addr: 0x00012C, target: 0x002197 },
  { addr: 0x000138, target: 0x0021C2 },
  { addr: 0x000204, target: 0x0025E8 },
  { addr: 0x000210, target: 0x002623 },
  { addr: 0x000264, target: 0x00276B },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function formatBytes(offset, length = 4) {
  return Array.from(rom.slice(offset, offset + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function describeTarget(target) {
  return KNOWN_NAMES.get(target) || 'unknown';
}

function scanRawJps(start, endExclusive) {
  const hits = [];
  for (let addr = start; addr <= endExclusive - 4; addr += 1) {
    if (rom[addr] === 0xC3) {
      hits.push({ addr, target: readU24(addr + 1) });
    }
  }
  return hits;
}

function scanNormalizedJps(start, endExclusive) {
  const hits = [];
  for (let addr = start; addr <= endExclusive - 4;) {
    if (rom[addr] === 0xC3) {
      hits.push({ addr, target: readU24(addr + 1) });
      addr += 4;
      continue;
    }
    addr += 1;
  }
  return hits;
}

function countCalls(target, start = 0, endExclusive = rom.length) {
  let count = 0;
  for (let addr = start; addr <= endExclusive - 4; addr += 1) {
    if (
      rom[addr] === 0xCD &&
      rom[addr + 1] === (target & 0xFF) &&
      rom[addr + 2] === ((target >> 8) & 0xFF) &&
      rom[addr + 3] === ((target >> 16) & 0xFF)
    ) {
      count += 1;
    }
  }
  return count;
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

const rawJps = scanRawJps(WINDOW_START, WINDOW_END);
const normalizedJps = scanNormalizedJps(WINDOW_START, WINDOW_END);
const normalizedStarts = new Set(normalizedJps.map((entry) => entry.addr));
const overlapHits = rawJps.filter((entry) => !normalizedStarts.has(entry.addr));

const earlyStubs = normalizedJps.filter((entry) => entry.addr < 0x000080);
const denseTable = normalizedJps.filter((entry) => entry.addr >= 0x000080);

const pairStats = FOCUSED_WRAPPERS.map(({ addr, target }) => ({
  wrapper: addr,
  target,
  name: describeTarget(target),
  wrapperCallsAll: countCalls(addr),
  directCallsAll: countCalls(target),
  wrapperCalls03: countCalls(addr, 0x030000, 0x040000),
  directCalls03: countCalls(target, 0x030000, 0x040000),
  wrapperCalls00: countCalls(addr, 0x000000, 0x010000),
  directCalls00: countCalls(target, 0x000000, 0x010000),
}));

console.log('# Phase 433 low-ROM wrapper scan');
console.log(`window: ${hex(WINDOW_START)}..${hex(WINDOW_END - 1)}`);
console.log(`raw bytewise 0xC3 hits: ${rawJps.length}`);
console.log(`normalized non-overlapping JP entries: ${normalizedJps.length}`);
console.log(`early reset/interrupt stub JPs (<0x000080): ${earlyStubs.length}`);
console.log(
  `dense wrapper table: ${hex(denseTable[0].addr)}..${hex(denseTable[denseTable.length - 1].addr)} (${denseTable.length} entries, one 4-byte JP per slot)`,
);

if (overlapHits.length > 0) {
  console.log('\n## Overlap false positives from raw byte scan');
  for (const hit of overlapHits) {
    console.log(
      `${hex(hit.addr)} -> ${hex(hit.target)}  raw-only hit inside another wrapper (bytes: ${formatBytes(hit.addr, 4)})`,
    );
  }
}

console.log('\n## Focused wrappers');
for (const { addr, target } of FOCUSED_WRAPPERS) {
  console.log(
    `${hex(addr)}: ${formatBytes(addr, 4)}  JP ${hex(target)}  ${describeTarget(target)}`,
  );
}

console.log('\n## All normalized JP entries in 0x000000..0x0002FF');
for (const entry of normalizedJps) {
  const label = describeTarget(entry.target);
  const suffix = label === 'unknown' ? '' : `  ${label}`;
  console.log(`${hex(entry.addr)} -> ${hex(entry.target)}${suffix}`);
}

console.log('\n## Wrapper-vs-direct call evidence');
for (const stat of pairStats) {
  console.log(
    `${hex(stat.wrapper)} -> ${hex(stat.target)} ${stat.name}: wrapperCalls(all)=${stat.wrapperCallsAll}, directCalls(all)=${stat.directCallsAll}, wrapperCalls(0x03xxxx)=${stat.wrapperCalls03}, directCalls(0x03xxxx)=${stat.directCalls03}, wrapperCalls(0x00xxxx)=${stat.wrapperCalls00}, directCalls(0x00xxxx)=${stat.directCalls00}`,
  );
}

console.log('\n## Pattern clues');
console.log(
  `- The first ${earlyStubs.length} JP instructions live inside reset/interrupt/service stubs; the actual veneer table starts at ${hex(denseTable[0].addr)}.`,
);
console.log(
  `- ${hex(denseTable[0].addr)}..${hex(denseTable[denseTable.length - 1].addr)} is a contiguous 4-byte JP import table with ${denseTable.length} entries.`,
);
console.log(
  '- All seven 0x0391DC helper calls land inside that low-address veneer table, not on the real helper bodies.',
);
console.log(
  `- Across the seven wrappers, bank 0x03xxxx makes ${sum(pairStats, 'wrapperCalls03')} wrapper calls and ${sum(pairStats, 'directCalls03')} direct calls to the underlying helpers.`,
);
console.log(
  `- Across the same seven helpers, bank 0x00xxxx makes ${sum(pairStats, 'wrapperCalls00')} wrapper calls and ${sum(pairStats, 'directCalls00')} direct calls to the real helper bodies.`,
);
console.log(
  '- eZ80 ADL CALL uses a full 24-bit absolute target, so this is not a call-range workaround. The pattern fits a stable low-ROM import veneer table used by mirrored higher-ROM code.',
);
