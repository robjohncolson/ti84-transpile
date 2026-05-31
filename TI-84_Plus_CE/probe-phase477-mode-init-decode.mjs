#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 2) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

function hexDump(start, end) {
  for (let addr = start; addr < end; addr += 16) {
    const bytes = [];
    for (let i = 0; i < 16 && addr + i < end; i++) {
      bytes.push(rom[addr + i].toString(16).padStart(2, '0'));
    }
    console.log(hex(addr, 6) + ': ' + bytes.join(' '));
  }
}

function findRefs(targetAddr, label) {
  console.log(`\n=== References to ${hex(targetAddr, 6)} (${label}) ===`);
  let count = 0;
  for (let addr = 0; addr < rom.length - 3; addr++) {
    const b = rom[addr];
    let target = null;
    let type = '';
    if (b === 0xCD) { target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16); type = 'CALL'; }
    else if (b === 0xC3) { target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16); type = 'JP'; }
    else if ((b & 0xC7) === 0xC2) { target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16); const cc = ['NZ','Z','NC','C','PO','PE','P','M'][(b>>3)&7]; type = `JP ${cc}`; }
    else if ((b & 0xC7) === 0xC4) { target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16); const cc = ['NZ','Z','NC','C','PO','PE','P','M'][(b>>3)&7]; type = `CALL ${cc}`; }
    if (target === targetAddr) {
      console.log(`  ${type} at ${hex(addr, 6)}`);
      // Show 16 bytes of context around the caller
      const ctxStart = Math.max(0, addr - 8);
      const ctxEnd = Math.min(rom.length, addr + 12);
      const ctxBytes = [];
      for (let i = ctxStart; i < ctxEnd; i++) ctxBytes.push(rom[i].toString(16).padStart(2, '0'));
      console.log(`    context: ${hex(ctxStart, 6)}: ${ctxBytes.join(' ')}`);
      count++;
    }
  }
  console.log(`  Total: ${count} references`);
}

// ── 1. Decode 0x09E307 region (D007E0='H' setter) ──
console.log('=== ROM region around 0x09E307 (D007E0 setter) ===');
hexDump(0x09E280, 0x09E380);

// ── 2. Decode 0x04EA44 region (first D00824 write) ──
console.log('\n=== ROM region around 0x04EA44 (D00824 writer) ===');
hexDump(0x04EA00, 0x04EAC0);

// ── 3. Search for LD (D00824),A = 32 24 08 D0 pattern ──
console.log('\n=== LD (D00824),A pattern search (32 24 08 D0) ===');
for (let addr = 0; addr < rom.length - 3; addr++) {
  if (rom[addr] === 0x32 && rom[addr+1] === 0x24 && rom[addr+2] === 0x08 && rom[addr+3] === 0xD0) {
    console.log(`  LD (D00824),A at ${hex(addr, 6)}`);
  }
}

// ── 4. Search for LD (D007E0),A = 32 E0 07 D0 pattern ──
console.log('\n=== LD (D007E0),A pattern search (32 E0 07 D0) ===');
for (let addr = 0; addr < rom.length - 3; addr++) {
  if (rom[addr] === 0x32 && rom[addr+1] === 0xE0 && rom[addr+2] === 0x07 && rom[addr+3] === 0xD0) {
    console.log(`  LD (D007E0),A at ${hex(addr, 6)}`);
  }
}

// ── 5. Find function entry points and their callers ──
// Look backward from 0x09E307 for a RET/JP that ends the previous function
console.log('\n=== Searching backward from 0x09E307 for function boundary ===');
for (let addr = 0x09E306; addr >= 0x09E280; addr--) {
  const b = rom[addr];
  if (b === 0xC9) { // RET
    console.log(`  RET at ${hex(addr, 6)} → function likely starts at ${hex(addr + 1, 6)}`);
    findRefs(addr + 1, 'D007E0 setter function entry');
    break;
  }
}

// Look backward from 0x04EA44 for function boundary
console.log('\n=== Searching backward from 0x04EA44 for function boundary ===');
for (let addr = 0x04EA43; addr >= 0x04E9C0; addr--) {
  const b = rom[addr];
  if (b === 0xC9) { // RET
    console.log(`  RET at ${hex(addr, 6)} → function likely starts at ${hex(addr + 1, 6)}`);
    findRefs(addr + 1, 'D00824 writer function entry');
    break;
  }
}

console.log('\nDone.');
