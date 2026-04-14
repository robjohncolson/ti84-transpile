#!/usr/bin/env node
// Phase 48: scan the full ROM for direct CALL/JP sites that target the
// 0x0a1cac text loop, then keep only callers from the still-uncovered regions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TARGET_ADDR = 0x0A1CAC;
export const ROM_PATH = path.join(__dirname, 'ROM.rom');
export const ENTRY_SCAN_BACK_BYTES = 0x100;

export const UNCOVERED_REGIONS = [
  { label: '025xxx-027xxx', start: 0x025000, end: 0x027FFF },
  { label: '02axxx-03cxxx', start: 0x02A000, end: 0x03CFFF },
  { label: '041xxx', start: 0x041000, end: 0x041FFF },
  { label: '043xxx-044xxx', start: 0x043000, end: 0x044FFF },
  { label: '047xxx-088xxx', start: 0x047000, end: 0x088FFF },
  { label: '08axxx-09dxxx', start: 0x08A000, end: 0x09DFFF },
  { label: '09fxxx-0b1xxx', start: 0x09F000, end: 0x0B1FFF },
  { label: '0b3xxx-0b5xxx', start: 0x0B3000, end: 0x0B5FFF },
  { label: '0b7xxx-0b8xxx', start: 0x0B7000, end: 0x0B8FFF },
  { label: '0baxxx-0bfxxx', start: 0x0BA000, end: 0x0BFFFF },
];

const TARGET_LO = TARGET_ADDR & 0xFF;
const TARGET_MID = (TARGET_ADDR >> 8) & 0xFF;
const TARGET_HI = (TARGET_ADDR >> 16) & 0xFF;

const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7E;

export function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

export function loadRom(romPath = ROM_PATH) {
  return fs.readFileSync(romPath);
}

function isPrintable(byte) {
  return byte >= PRINTABLE_MIN && byte <= PRINTABLE_MAX;
}

export function getUncoveredRegion(addr) {
  return UNCOVERED_REGIONS.find((region) => addr >= region.start && addr <= region.end) ?? null;
}

function findFunctionEntry(rom, caller, scanBackBytes = ENTRY_SCAN_BACK_BYTES) {
  const floor = Math.max(0, caller - scanBackBytes);

  for (let addr = caller - 1; addr >= floor; addr--) {
    if (rom[addr] === 0xC9) {
      return {
        entry: addr + 1,
        heuristic: 'after_ret',
        terminator: hex(addr),
      };
    }

    if (addr > 0 && rom[addr - 1] === 0xED && (rom[addr] === 0x4D || rom[addr] === 0x5D)) {
      return {
        entry: addr + 1,
        heuristic: rom[addr] === 0x4D ? 'after_reti' : 'after_retn',
        terminator: hex(addr - 1),
      };
    }
  }

  return {
    entry: caller,
    heuristic: 'caller',
    terminator: null,
  };
}

export function findNearbyAsciiStrings(rom, center, radius = 0x100, minLen = 4) {
  const start = Math.max(0, center - radius);
  const end = Math.min(rom.length - 1, center + radius);
  const hits = [];
  let runStart = -1;

  for (let addr = start; addr <= end + 1; addr++) {
    const byte = addr <= end ? rom[addr] : 0x00;

    if (addr <= end && isPrintable(byte)) {
      if (runStart === -1) {
        runStart = addr;
      }
      continue;
    }

    if (runStart === -1) {
      continue;
    }

    const len = addr - runStart;
    if (len >= minLen) {
      const text = Buffer.from(rom.subarray(runStart, addr)).toString('ascii');
      hits.push({
        addr: runStart,
        len,
        text,
      });
    }

    runStart = -1;
  }

  return hits;
}

export function scanAllA1cacCallers(rom = loadRom()) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr++) {
    const opcode = rom[addr];
    if (opcode !== 0xCD && opcode !== 0xC3) {
      continue;
    }

    if (
      rom[addr + 1] !== TARGET_LO ||
      rom[addr + 2] !== TARGET_MID ||
      rom[addr + 3] !== TARGET_HI
    ) {
      continue;
    }

    const entryInfo = findFunctionEntry(rom, addr);
    const region = getUncoveredRegion(addr);

    hits.push({
      caller: addr,
      kind: opcode === 0xCD ? 'call' : 'jp',
      entry: entryInfo.entry,
      entryHeuristic: entryInfo.heuristic,
      terminator: entryInfo.terminator,
      region,
    });
  }

  hits.sort((a, b) => a.caller - b.caller);
  return hits;
}

export function listPhase48Callers(rom = loadRom()) {
  return scanAllA1cacCallers(rom).filter((hit) => hit.region !== null);
}

function printHits(title, hits) {
  console.log(title);
  console.log(`count=${hits.length}`);

  for (const hit of hits) {
    const regionLabel = hit.region ? hit.region.label : 'covered/other';
    const terminator = hit.terminator ?? '-';
    console.log(
      `${hex(hit.caller)}  ${hit.kind.padEnd(4, ' ')}  entry=${hex(hit.entry)}  heuristic=${hit.entryHeuristic.padEnd(10, ' ')}  term=${terminator}  region=${regionLabel}`,
    );
  }

  console.log('');
}

function main() {
  const rom = loadRom();
  const allHits = scanAllA1cacCallers(rom);
  const uncoveredHits = allHits.filter((hit) => hit.region !== null);

  printHits(`All direct CALL/JP sites for ${hex(TARGET_ADDR)}`, allHits);
  printHits('Phase 48 uncovered-region callers', uncoveredHits);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
