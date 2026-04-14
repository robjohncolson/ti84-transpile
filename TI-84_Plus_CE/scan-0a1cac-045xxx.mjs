#!/usr/bin/env node
// Phase 44.4: scan all CALL/JP references to the text loop 0x0a1cac inside
// the 0x040000-0x04ffff ROM region and print each call site with byte context.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TARGET_ADDR = 0x0A1CAC;
export const REGION_START = 0x040000;
export const REGION_END = 0x04FFFF;

const OPCODES = [
  { byte: 0xCD, name: 'call' },
  { byte: 0xC3, name: 'jp' },
  { byte: 0xCA, name: 'jp z,' },
  { byte: 0xC2, name: 'jp nz,' },
  { byte: 0xDA, name: 'jp c,' },
  { byte: 0xD2, name: 'jp nc,' },
  { byte: 0xFA, name: 'jp m,' },
  { byte: 0xF2, name: 'jp p,' },
  { byte: 0xEA, name: 'jp pe,' },
  { byte: 0xE2, name: 'jp po,' },
  { byte: 0xCC, name: 'call z,' },
  { byte: 0xC4, name: 'call nz,' },
  { byte: 0xDC, name: 'call c,' },
  { byte: 0xD4, name: 'call nc,' },
];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const hex2 = (value) => (value & 0xFF).toString(16).padStart(2, '0');

export function loadRom(romPath = path.join(__dirname, 'ROM.rom')) {
  return fs.readFileSync(romPath);
}

function readBytes(rom, start, end) {
  const bytes = [];

  for (let addr = start; addr <= end; addr++) {
    if (addr < 0 || addr >= rom.length) {
      bytes.push('..');
      continue;
    }

    bytes.push(hex2(rom[addr]));
  }

  return bytes.join(' ');
}

export function formatHitContext(rom, addr, beforeBytes = 8, afterBytes = 8) {
  const before = readBytes(rom, addr - beforeBytes, addr - 1);
  const insn = readBytes(rom, addr, addr + 3);
  const after = readBytes(rom, addr + 4, addr + 4 + afterBytes - 1);
  return `before=${before}  insn=${insn}  after=${after}`;
}

export function findTextLoopRegionCallers(
  rom,
  {
    target = TARGET_ADDR,
    regionStart = REGION_START,
    regionEnd = REGION_END,
  } = {},
) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const hits = [];

  for (const opcode of OPCODES) {
    for (let addr = regionStart; addr <= Math.min(regionEnd, rom.length - 4); addr++) {
      if (
        rom[addr] === opcode.byte &&
        rom[addr + 1] === lo &&
        rom[addr + 2] === mid &&
        rom[addr + 3] === hi
      ) {
        hits.push({
          addr,
          opcode: opcode.byte,
          kind: opcode.name,
          context: formatHitContext(rom, addr),
        });
      }
    }
  }

  hits.sort((a, b) => a.addr - b.addr);
  return hits;
}

export function printTextLoopRegionCallers(
  rom = loadRom(),
  options = {},
) {
  const target = options.target ?? TARGET_ADDR;
  const regionStart = options.regionStart ?? REGION_START;
  const regionEnd = options.regionEnd ?? REGION_END;
  const hits = findTextLoopRegionCallers(rom, { target, regionStart, regionEnd });

  console.log(`Text-loop callers for ${hex(target)} in ${hex(regionStart)}-${hex(regionEnd)}`);
  console.log(`total hits: ${hits.length}`);
  console.log('');

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${hit.kind.padEnd(8)}  ${hit.context}`);
  }

  return hits;
}

function main() {
  printTextLoopRegionCallers();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
