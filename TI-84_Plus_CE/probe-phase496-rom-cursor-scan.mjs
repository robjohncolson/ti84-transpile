#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const bcallPath = path.join(__dirname, 'bcall-table.json');

const romBytes = fs.readFileSync(romPath);
const bcallTable = JSON.parse(fs.readFileSync(bcallPath, 'utf8'));

const ROM_SIZE = 0x400000;
const GROUP_DISTANCE = 0x100;
const PROLOGUE_SEARCH = 0x80;
const CONTEXT_RADIUS = 0x40;

if (romBytes.length !== ROM_SIZE) {
  console.warn(
    `WARNING: expected 4MB ROM (${hex(ROM_SIZE)} bytes), found ${hex(romBytes.length)} bytes`
  );
}

const bcallTargets = new Set(
  bcallTable
    .map((entry) => normalizeAddr(entry.targetAddr ?? entry.target_hex))
    .filter((addr) => addr !== null)
);

const rowMatches = [];
const colMatches = [];

for (let addr = 0; addr < romBytes.length - 2; addr++) {
  if (romBytes[addr] === 0x95 && romBytes[addr + 1] === 0x05 && romBytes[addr + 2] === 0xd0) {
    rowMatches.push(addr);
  }
  if (romBytes[addr] === 0x96 && romBytes[addr + 1] === 0x05 && romBytes[addr + 2] === 0xd0) {
    colMatches.push(addr);
  }
}

const allMatches = [
  ...rowMatches.map((addr) => ({ addr, kind: 'row' })),
  ...colMatches.map((addr) => ({ addr, kind: 'col' })),
].sort((a, b) => a.addr - b.addr);

const regions = [];
for (const match of allMatches) {
  const previous = regions[regions.length - 1];
  if (!previous || match.addr - previous.lastMatch > GROUP_DISTANCE) {
    regions.push({
      firstMatch: match.addr,
      lastMatch: match.addr,
      matches: [match],
    });
  } else {
    previous.lastMatch = match.addr;
    previous.matches.push(match);
  }
}

const candidates = regions
  .map(enrichRegion)
  .filter((region) => region.rowRefs.length > 0 && region.colRefs.length > 0)
  .sort((a, b) => a.start - b.start);

const primary = candidates.filter((region) => !region.hasBcallTarget);
const secondary = candidates.filter((region) => region.hasBcallTarget);

console.log('# Phase 496 Full ROM Cursor Row/Column Static Scan');
console.log(`ROM bytes: ${hex(romBytes.length)}`);
console.log(`BCALL targets loaded: ${bcallTargets.size}`);
console.log(`D00595 row references: ${rowMatches.length}`);
console.log(`D00596 col references: ${colMatches.length}`);
console.log(`Regions with both row+col: ${candidates.length}`);
console.log('');

printRegionList('Primary: NON-BCALL INTERNAL candidates', primary);
printRegionList('Secondary: BCALL regions for cross-reference', secondary);

function enrichRegion(region) {
  const start = Math.max(0, region.firstMatch - CONTEXT_RADIUS);
  const end = Math.min(romBytes.length - 1, region.lastMatch + 2 + CONTEXT_RADIUS);
  const rowRefs = region.matches.filter((match) => match.kind === 'row').map((match) => match.addr);
  const colRefs = region.matches.filter((match) => match.kind === 'col').map((match) => match.addr);
  const entryPoint = findEntryPoint(region.firstMatch);
  const bcallHits = [];

  for (const target of bcallTargets) {
    if (target >= start && target <= end) {
      bcallHits.push(target);
    }
  }

  return {
    start,
    end,
    entryPoint,
    firstMatch: region.firstMatch,
    lastMatch: region.lastMatch,
    rowRefs,
    colRefs,
    bcallHits: bcallHits.sort((a, b) => a - b),
    hasBcallTarget: bcallHits.length > 0,
    charRendererRefs: findPattern(start, end, [0xc6, 0x59, 0x00]),
    vramRefs: findVramRefs(start, end),
    glyphRefs: findGlyphRefs(start, end),
  };
}

function findEntryPoint(matchAddr) {
  const searchStart = Math.max(0, matchAddr - PROLOGUE_SEARCH);

  for (let addr = matchAddr; addr >= searchStart + 1; addr--) {
    if (romBytes[addr - 1] === 0xdd && romBytes[addr] === 0xe5) {
      return { addr: addr - 1, prologue: 'PUSH IX' };
    }
    if (romBytes[addr - 1] === 0xfd && romBytes[addr] === 0xe5) {
      return { addr: addr - 1, prologue: 'PUSH IY' };
    }
  }

  return { addr: matchAddr, prologue: 'match context only' };
}

function findPattern(start, end, bytes) {
  const hits = [];
  const last = Math.min(end - bytes.length + 1, romBytes.length - bytes.length);

  for (let addr = start; addr <= last; addr++) {
    let matched = true;
    for (let i = 0; i < bytes.length; i++) {
      if (romBytes[addr + i] !== bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(addr);
    }
  }

  return hits;
}

function findVramRefs(start, end) {
  const hits = [];
  const last = Math.min(end - 2, romBytes.length - 3);

  for (let addr = start; addr <= last; addr++) {
    if (romBytes[addr + 2] === 0xd4) {
      const target = romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
      if (target >= 0xd40000) {
        hits.push({ addr, target });
      }
    }
  }

  return hits;
}

function findGlyphRefs(start, end) {
  const glyphs = new Set([0xe1, 0xe2, 0xe3]);
  const hits = [];

  for (let addr = start; addr <= end && addr < romBytes.length; addr++) {
    if (glyphs.has(romBytes[addr])) {
      hits.push({ addr, value: romBytes[addr] });
    }
  }

  return hits;
}

function printRegionList(title, list) {
  console.log(`## ${title} (${list.length})`);
  if (list.length === 0) {
    console.log('(none)');
    console.log('');
    return;
  }

  for (const [index, region] of list.entries()) {
    const tags = [];
    if (!region.hasBcallTarget) tags.push('NON-BCALL INTERNAL');
    if (region.charRendererRefs.length > 0) tags.push('charRenderer');
    if (region.vramRefs.length > 0) tags.push('VRAM');
    if (region.glyphRefs.length > 0) tags.push('glyph');

    console.log(
      `${index + 1}. ${hex(region.start)}-${hex(region.end)} entry=${hex(region.entryPoint.addr)} ` +
        `(${region.entryPoint.prologue}) ${tags.length ? `[${tags.join(', ')}]` : ''}`
    );
    console.log(`   row refs: ${formatAddrs(region.rowRefs)}`);
    console.log(`   col refs: ${formatAddrs(region.colRefs)}`);
    console.log(
      `   BCALL targets: ${region.bcallHits.length ? formatAddrs(region.bcallHits) : 'none'}`
    );
    console.log(
      `   charRenderer refs: ${
        region.charRendererRefs.length ? formatAddrs(region.charRendererRefs) : 'none'
      }`
    );
    console.log(
      `   VRAM refs: ${
        region.vramRefs.length
          ? region.vramRefs.map((hit) => `${hex(hit.addr)}->${hex(hit.target)}`).join(', ')
          : 'none'
      }`
    );
    console.log(
      `   glyph bytes: ${
        region.glyphRefs.length
          ? region.glyphRefs.map((hit) => `${hex(hit.addr)}=${hex(hit.value, 2)}`).join(', ')
          : 'none'
      }`
    );
  }

  console.log('');
}

function normalizeAddr(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace(/^0x/i, ''), 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatAddrs(addrs) {
  return addrs.map((addr) => hex(addr)).join(', ');
}

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}
