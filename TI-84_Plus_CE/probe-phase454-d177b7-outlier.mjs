#!/usr/bin/env node
/**
 * probe-phase454-d177b7-outlier.mjs
 *
 * Investigate the D177B7=0x01 outlier writer at ROM address 0x040852.
 * D177B7 uses a three-state protocol (0x00/0x55/0xAA) but 0x040852
 * writes 0x01 — this probe figures out why.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET_ADDR = 0x040852;
const D177B7 = 0xD177B7;
const D177B7_LE = [0xB7, 0x77, 0xD1]; // little-endian

// --- Helpers ---

function hexDump(startAddr, length) {
  const lines = [];
  for (let off = 0; off < length; off += 16) {
    const addr = startAddr + off;
    if (addr >= romBytes.length) break;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16; i++) {
      if (addr + i < romBytes.length) {
        const b = romBytes[addr + i];
        bytes.push(b.toString(16).padStart(2, '0'));
        ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
      }
    }
    lines.push(`  ${addr.toString(16).padStart(6, '0')}: ${bytes.join(' ')}  ${ascii.join('')}`);
  }
  return lines.join('\n');
}

function read24LE(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
}

function matchBytes(addr, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (romBytes[addr + i] !== pattern[i]) return false;
  }
  return true;
}

// --- 1. Hex dump around 0x040852 ---

console.log('=== D177B7=0x01 Outlier at 0x040852 ===\n');
console.log('Hex dump (0x040800-0x040900):');
console.log(hexDump(0x040800, 0x100));
console.log();

// --- 2. Identify instruction at 0x040852 ---

console.log('--- Instruction analysis near 0x040852 ---');

// Search a window around TARGET_ADDR for the D177B7 write pattern
const SEARCH_START = TARGET_ADDR - 32;
const SEARCH_END = TARGET_ADDR + 32;

for (let a = SEARCH_START; a < SEARCH_END; a++) {
  // LD (D177B7),A = 32 B7 77 D1
  if (romBytes[a] === 0x32 && matchBytes(a + 1, D177B7_LE)) {
    console.log(`  0x${a.toString(16).padStart(6, '0')}: LD (D177B7),A  [32 B7 77 D1]`);
    // Look for what sets A before this
    for (let b = a - 1; b >= a - 8; b--) {
      if (romBytes[b] === 0x3E) {
        // LD A, imm8
        console.log(`  0x${b.toString(16).padStart(6, '0')}: LD A,0x${romBytes[b + 1].toString(16).padStart(2, '0')}  [3E ${romBytes[b + 1].toString(16).padStart(2, '0')}]`);
      }
      if (romBytes[b] === 0xAF) {
        console.log(`  0x${b.toString(16).padStart(6, '0')}: XOR A  (A=0x00)  [AF]`);
      }
    }
  }
}
console.log();

// --- 3. Find function boundaries ---

// Scan backward for RET (C9), JP (C3), or a series of 0xFF (padding)
let funcStart = TARGET_ADDR;
for (let a = TARGET_ADDR - 1; a >= TARGET_ADDR - 0x1000; a--) {
  const b = romBytes[a];
  if (b === 0xC9) {
    // RET found — function likely starts at a+1
    funcStart = a + 1;
    break;
  }
  // JP imm24 = C3 ll mm hh — the next byte after the 4-byte JP is the new function
  if (a >= 3 && romBytes[a - 3] === 0xC3) {
    funcStart = a + 1;
    break;
  }
}

// Scan forward for RET
let funcEnd = TARGET_ADDR;
for (let a = TARGET_ADDR; a < TARGET_ADDR + 0x1000; a++) {
  if (romBytes[a] === 0xC9) {
    funcEnd = a;
    break;
  }
}

console.log(`--- Function boundaries ---`);
console.log(`  Function start: 0x${funcStart.toString(16).padStart(6, '0')}`);
console.log(`  Function end:   0x${funcEnd.toString(16).padStart(6, '0')} (RET)`);
console.log(`  Function size:  ${funcEnd - funcStart + 1} bytes`);
console.log();

// Full hex dump of the function
console.log('Full function hex dump:');
console.log(hexDump(funcStart, funcEnd - funcStart + 1));
console.log();

// --- 4. List all CALL instructions in the function ---

console.log('--- CALL instructions in function ---');
for (let a = funcStart; a <= funcEnd; a++) {
  if (romBytes[a] === 0xCD) {
    const target = read24LE(a + 1);
    console.log(`  0x${a.toString(16).padStart(6, '0')}: CALL 0x${target.toString(16).padStart(6, '0')}`);
  }
}
console.log();

// --- 5. Search ROM for callers of this function ---

console.log(`--- Callers of function at 0x${funcStart.toString(16).padStart(6, '0')} ---`);
const funcStartLE = [funcStart & 0xFF, (funcStart >> 8) & 0xFF, (funcStart >> 16) & 0xFF];
let callerCount = 0;
for (let a = 0; a < romBytes.length - 4; a++) {
  if (romBytes[a] === 0xCD && matchBytes(a + 1, funcStartLE)) {
    console.log(`  0x${a.toString(16).padStart(6, '0')}: CALL 0x${funcStart.toString(16).padStart(6, '0')}`);
    callerCount++;
  }
}
if (callerCount === 0) console.log('  (none found — may be entered via JP or fall-through)');

// Also check for JP to funcStart
console.log(`\n  JP references to 0x${funcStart.toString(16).padStart(6, '0')}:`);
let jpCount = 0;
for (let a = 0; a < romBytes.length - 4; a++) {
  if (romBytes[a] === 0xC3 && matchBytes(a + 1, funcStartLE)) {
    console.log(`  0x${a.toString(16).padStart(6, '0')}: JP 0x${funcStart.toString(16).padStart(6, '0')}`);
    jpCount++;
  }
}
if (jpCount === 0) console.log('  (none)');
console.log();

// --- 6. Check if the function also accesses D177B7 with other values ---

console.log('--- All D177B7 accesses in function ---');
for (let a = funcStart; a <= funcEnd; a++) {
  // LD (D177B7),A
  if (romBytes[a] === 0x32 && matchBytes(a + 1, D177B7_LE)) {
    // What value? Look back for LD A,imm8 or XOR A
    let valueInfo = '(unknown A)';
    for (let b = a - 1; b >= Math.max(funcStart, a - 10); b--) {
      if (romBytes[b] === 0x3E) {
        valueInfo = `A=0x${romBytes[b + 1].toString(16).padStart(2, '0')}`;
        break;
      }
      if (romBytes[b] === 0xAF) {
        valueInfo = 'A=0x00 (XOR A)';
        break;
      }
      // Stop at CALL/RET/JP that would change control flow
      if (romBytes[b] === 0xCD || romBytes[b] === 0xC9 || romBytes[b] === 0xC3) break;
    }
    console.log(`  0x${a.toString(16).padStart(6, '0')}: LD (D177B7),A  — ${valueInfo}`);
  }
  // LD A,(D177B7)
  if (romBytes[a] === 0x3A && matchBytes(a + 1, D177B7_LE)) {
    console.log(`  0x${a.toString(16).padStart(6, '0')}: LD A,(D177B7)  — read`);
  }
}
console.log();

// --- 7. Check what other RAM addresses the function accesses ---

console.log('--- Other RAM/IO accesses in function (LD (addr),A or LD A,(addr)) ---');
const ramAccesses = new Map();
for (let a = funcStart; a <= funcEnd; a++) {
  // LD (addr24),A = 32 ll mm hh
  if (romBytes[a] === 0x32 && a + 3 <= funcEnd) {
    const addr = read24LE(a + 1);
    if (addr >= 0xD00000) {
      const key = `0x${addr.toString(16).padStart(6, '0')}`;
      if (!ramAccesses.has(key)) ramAccesses.set(key, []);
      ramAccesses.get(key).push(`  0x${a.toString(16).padStart(6, '0')}: LD (${key}),A — write`);
    }
  }
  // LD A,(addr24) = 3A ll mm hh
  if (romBytes[a] === 0x3A && a + 3 <= funcEnd) {
    const addr = read24LE(a + 1);
    if (addr >= 0xD00000) {
      const key = `0x${addr.toString(16).padStart(6, '0')}`;
      if (!ramAccesses.has(key)) ramAccesses.set(key, []);
      ramAccesses.get(key).push(`  0x${a.toString(16).padStart(6, '0')}: LD A,(${key}) — read`);
    }
  }
}

for (const [addr, accesses] of [...ramAccesses].sort()) {
  for (const line of accesses) console.log(line);
}
console.log();

// --- 8. Broader context: what's near 0x040852 in the ROM? ---

console.log('--- Wider context: 0x040750-0x040950 hex dump ---');
console.log(hexDump(0x040750, 0x200));
console.log();

// --- 9. Look at how D177B7=0x01 is consumed elsewhere in ROM ---

console.log('--- ROM-wide: who reads D177B7 and compares with 0x01? ---');
// Find all LD A,(D177B7) = 3A B7 77 D1, then check if followed by CP 0x01 or similar
for (let a = 0; a < romBytes.length - 8; a++) {
  if (romBytes[a] === 0x3A && matchBytes(a + 1, D177B7_LE)) {
    // Check next few bytes for CP 0x01 (FE 01) or AND 0x01 (E6 01) or comparison
    for (let c = a + 4; c < Math.min(a + 12, romBytes.length - 1); c++) {
      if (romBytes[c] === 0xFE && romBytes[c + 1] === 0x01) {
        console.log(`  0x${a.toString(16).padStart(6, '0')}: LD A,(D177B7); ... CP 0x01 at 0x${c.toString(16).padStart(6, '0')}`);
        break;
      }
      if (romBytes[c] === 0xE6 && romBytes[c + 1] === 0x01) {
        console.log(`  0x${a.toString(16).padStart(6, '0')}: LD A,(D177B7); ... AND 0x01 at 0x${c.toString(16).padStart(6, '0')}`);
        break;
      }
    }
  }
}
console.log();

// --- 10. Check if 0x01 is actually used as a boolean flag ---

console.log('--- ROM-wide: who checks D177B7 with OR A / AND A / BIT patterns? ---');
for (let a = 0; a < romBytes.length - 8; a++) {
  if (romBytes[a] === 0x3A && matchBytes(a + 1, D177B7_LE)) {
    // Check for OR A (B7), AND A (A7), or DEC A (3D) after the load
    for (let c = a + 4; c < Math.min(a + 8, romBytes.length); c++) {
      if (romBytes[c] === 0xB7) {
        console.log(`  0x${a.toString(16).padStart(6, '0')}: LD A,(D177B7); OR A at 0x${c.toString(16).padStart(6, '0')} — zero-test`);
        break;
      }
      if (romBytes[c] === 0xA7) {
        console.log(`  0x${a.toString(16).padStart(6, '0')}: LD A,(D177B7); AND A at 0x${c.toString(16).padStart(6, '0')} — zero-test`);
        break;
      }
    }
  }
}
console.log();

// --- Assessment ---

console.log('=== Assessment ===');
console.log(`Target address 0x${TARGET_ADDR.toString(16)} is in ROM page 0x04xxxx.`);
console.log('The three-state protocol for D177B7 is: 0x00=clean, 0x55=dirty, 0xAA=consumed.');
console.log('Writing 0x01 may indicate:');
console.log('  (a) A boolean "active/enabled" flag (separate from the dirty protocol)');
console.log('  (b) A fourth state meaning "pending" or "inhibited"');
console.log('  (c) A simple truthy value used only as nonzero vs zero');
console.log('See function analysis above for context clues.');
console.log();
console.log('DONE');
