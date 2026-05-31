#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function contextLine(addr, length, before = 8, after = 8) {
  const start = Math.max(0, addr - before);
  const end = Math.min(rom.length, addr + length + after);
  const prefix = rom.subarray(start, addr);
  const match = rom.subarray(addr, addr + length);
  const suffix = rom.subarray(addr + length, end);

  return [
    `${hex(addr, 6)}:`,
    bytesToHex(prefix).padStart(before * 3 - 1, ' '),
    '|',
    bytesToHex(match),
    '|',
    bytesToHex(suffix),
  ].join(' ');
}

function findPattern(pattern) {
  const needle = Buffer.from(pattern);
  const matches = [];
  let offset = 0;

  while (offset < rom.length) {
    const found = rom.indexOf(needle, offset);
    if (found === -1) break;
    matches.push(found);
    offset = found + 1;
  }

  return matches;
}

function printMatches(title, matches, length) {
  console.log(`\n${title}`);
  console.log(`matches: ${matches.length}`);

  for (const addr of matches) {
    console.log(contextLine(addr, length));
  }
}

function printDirectWriteSearches() {
  const searches = [
    ['LD (D0058C),A cursor column write', [0x32, 0x8C, 0x05, 0xD0]],
    ['LD (D0058E),A cursor row write', [0x32, 0x8E, 0x05, 0xD0]],
    ['LD (D00590),A timer/state write', [0x32, 0x90, 0x05, 0xD0]],
    ['LD (D00595),A display cursor write', [0x32, 0x95, 0x05, 0xD0]],
  ];

  console.log('Part 1: ROM binary search for cursor-area writes');
  console.log('Searching all ROM bytes for absolute writes into D00580-D005A0.');
  console.log('IY-relative forms are skipped because D0058C+ are not reachable by 8-bit signed IY offsets from D00080.');

  for (const [title, pattern] of searches) {
    printMatches(title, findPattern(pattern), pattern.length);
  }
}

function printLdAddrHlSearch() {
  const matches = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    if (
      rom[addr] === 0x22 &&
      rom[addr + 1] >= 0x80 &&
      rom[addr + 1] <= 0xA0 &&
      rom[addr + 2] === 0x05 &&
      rom[addr + 3] === 0xD0
    ) {
      matches.push(addr);
    }
  }

  printMatches('LD (D00580-D005A0),HL writes: 22 xx 05 D0', matches, 4);
}

function dumpBytes(addr, length) {
  console.log(`\nDump ${hex(addr, 6)} length ${hex(length, 2)} (${length} bytes)`);

  for (let lineAddr = addr; lineAddr < addr + length; lineAddr += 16) {
    const lineLength = Math.min(16, addr + length - lineAddr, rom.length - lineAddr);
    if (lineLength <= 0) break;
    console.log(`${hex(lineAddr, 6)}: ${bytesToHex(rom.subarray(lineAddr, lineAddr + lineLength))}`);
  }
}

function printFunctionDumps() {
  console.log('\nPart 2: Decode 0x04E950 cursor position save/update');
  dumpBytes(0x04E950, 64);
  dumpBytes(0x04E960, 32);
  dumpBytes(0x04E970, 32);
  dumpBytes(0x04E980, 32);

  console.log('\nPart 3: Decode 0x0059C6 display output entry');
  dumpBytes(0x0059C6, 64);
}

function printVramBaseSearches() {
  const searches = [
    ['LD HL,0xD40000', [0x21, 0x00, 0x00, 0xD4]],
    ['LD DE,0xD40000', [0x11, 0x00, 0x00, 0xD4]],
    ['LD BC,0xD40000', [0x01, 0x00, 0x00, 0xD4]],
  ];

  console.log('\nPart 4: Search for VRAM base address references');

  for (const [title, pattern] of searches) {
    printMatches(title, findPattern(pattern), pattern.length);
  }
}

console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
console.log(`ROM size: ${hex(rom.length, 6)} (${rom.length} bytes)`);

printDirectWriteSearches();
printLdAddrHlSearch();
printFunctionDumps();
printVramBaseSearches();

