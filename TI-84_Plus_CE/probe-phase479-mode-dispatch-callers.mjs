#!/usr/bin/env node
/**
 * Phase 479 — Trace 0x08B0CC and 0x096E64 mode dispatch chain callers.
 *
 * Pure ROM binary search — no boot/execution needed.
 * Finds all CALL/JP/JP Z/JP NZ references to the mode dispatch addresses
 * and their surrounding function entry points.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);
const ROM_SIZE = Math.min(rom.length, 0x400000);

// ── helpers ──────────────────────────────────────────────────────────

function hex(n, w = 6) { return '0x' + n.toString(16).toUpperCase().padStart(w, '0'); }

function hexDump(start, end) {
  const rows = [];
  for (let addr = start; addr < end; addr += 16) {
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && addr + i < end; i++) {
      const b = rom[addr + i];
      bytes.push(b.toString(16).padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
    }
    rows.push(`  ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
  return rows.join('\n');
}

/**
 * Search ROM for a 4-byte pattern (little-endian eZ80 24-bit address instructions).
 * eZ80 ADL mode:
 *   CALL nn  = CD ll mm hh  (4 bytes)
 *   JP nn    = C3 ll mm hh  (4 bytes)
 *   JP Z,nn  = CA ll mm hh  (4 bytes)
 *   JP NZ,nn = C2 ll mm hh  (4 bytes)
 *   JP C,nn  = DA ll mm hh  (4 bytes)
 *   JP NC,nn = D2 ll mm hh  (4 bytes)
 */
function searchRefs(targetAddr, label) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const opcodes = [
    { op: 0xCD, name: 'CALL' },
    { op: 0xC3, name: 'JP' },
    { op: 0xCA, name: 'JP Z,' },
    { op: 0xC2, name: 'JP NZ,' },
    { op: 0xDA, name: 'JP C,' },
    { op: 0xD2, name: 'JP NC,' },
  ];

  const results = [];
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const entry = opcodes.find(o => o.op === rom[i]);
      if (entry) {
        results.push({ addr: i, instr: `${entry.name} ${hex(targetAddr)}` });
      }
    }
  }

  if (results.length === 0) {
    console.log(`  (no direct references found to ${hex(targetAddr)})`);
  } else {
    for (const r of results) {
      console.log(`  ${hex(r.addr)}: ${r.instr}`);
    }
  }
  return results;
}

/**
 * Scan backward from `addr` looking for a RET (C9), JP (C3), or JR (18)
 * that likely ends the previous function, making the byte after it the
 * entry point of the function containing `addr`.
 */
function findFunctionEntry(addr) {
  const terminators = [0xC9]; // RET
  for (let i = addr - 1; i >= Math.max(0, addr - 128); i--) {
    if (terminators.includes(rom[i])) {
      return i + 1; // function starts right after the RET
    }
    // JP nn (unconditional) can also terminate a block
    if (rom[i] === 0xC3 && i + 3 < addr) {
      return i + 4; // function starts after the 4-byte JP
    }
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────

console.log('=== Phase 479: Mode Dispatch Caller Trace ===\n');

// ── 1. Hex dumps for context ─────────────────────────────────────────

console.log('--- Hex dump 0x08B0A0 - 0x08B0E0 (around 0x08B0CC) ---');
console.log(hexDump(0x08B0A0, 0x08B0E0));

console.log('\n--- Hex dump 0x096E40 - 0x096E80 (around 0x096E64) ---');
console.log(hexDump(0x096E40, 0x096E80));

// ── 2. Search for references to 0x08B0CC and nearby ──────────────────

console.log('\n--- References to 0x08B0CC (mode dispatch site 1) ---');
const refs1 = searchRefs(0x08B0CC, 'mode dispatch 1');

console.log('\n--- References to nearby addresses 0x08B0C0-0x08B0D0 ---');
const allRefs1 = [];
for (let t = 0x08B0C0; t <= 0x08B0D0; t++) {
  const r = searchRefs(t, `0x08B0xx`);
  allRefs1.push(...r);
}

// ── 3. Search for references to 0x096E64 and nearby ──────────────────

console.log('\n--- References to 0x096E64 (mode dispatch site 2) ---');
const refs2 = searchRefs(0x096E64, 'mode dispatch 2');

console.log('\n--- References to nearby addresses 0x096E60-0x096E70 ---');
const allRefs2 = [];
for (let t = 0x096E60; t <= 0x096E70; t++) {
  const r = searchRefs(t, `0x096Exx`);
  allRefs2.push(...r);
}

// ── 4. Backward decode — find function entries ───────────────────────

console.log('\n--- Backward decode: function entry for 0x08B0CC ---');
console.log('  Hex dump 0x08B0A0 - 0x08B0CC:');
console.log(hexDump(0x08B0A0, 0x08B0CC));
const entry1 = findFunctionEntry(0x08B0CC);
if (entry1) {
  console.log(`  Likely function entry: ${hex(entry1)}`);
} else {
  console.log('  Could not find function entry within 128 bytes');
}

console.log('\n--- Backward decode: function entry for 0x096E64 ---');
console.log('  Hex dump 0x096E40 - 0x096E64:');
console.log(hexDump(0x096E40, 0x096E64));
const entry2 = findFunctionEntry(0x096E64);
if (entry2) {
  console.log(`  Likely function entry: ${hex(entry2)}`);
} else {
  console.log('  Could not find function entry within 128 bytes');
}

// ── 5. Search for callers of the function entries ────────────────────

const functionEntries = new Set();
if (entry1) functionEntries.add(entry1);
if (entry2) functionEntries.add(entry2);

for (const entry of functionEntries) {
  console.log(`\n--- References to function entry ${hex(entry)} ---`);
  searchRefs(entry, `func entry ${hex(entry)}`);

  // Also try a few bytes before/after in case our entry detection is off
  for (let delta = -4; delta <= 4; delta += 2) {
    if (delta === 0) continue;
    const nearby = entry + delta;
    const r = searchRefs(nearby, `near entry`);
    if (r.length > 0) {
      console.log(`  (found refs to nearby ${hex(nearby)} — entry might be there)`);
    }
  }
}

// ── 6. Extended search: look for any references within wider ranges ──

console.log('\n--- Extended search: refs to 0x08B080-0x08B0F0 ---');
const extRefs1 = [];
for (let t = 0x08B080; t <= 0x08B0F0; t++) {
  const lo = t & 0xFF;
  const mid = (t >> 8) & 0xFF;
  const hi = (t >> 16) & 0xFF;
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const b = rom[i];
      if (b === 0xCD || b === 0xC3 || b === 0xCA || b === 0xC2 || b === 0xDA || b === 0xD2) {
        const names = { 0xCD: 'CALL', 0xC3: 'JP', 0xCA: 'JP Z,', 0xC2: 'JP NZ,', 0xDA: 'JP C,', 0xD2: 'JP NC,' };
        extRefs1.push({ from: i, to: t, instr: names[b] });
      }
    }
  }
}
if (extRefs1.length === 0) {
  console.log('  (no references found in extended range)');
} else {
  const seen = new Set();
  for (const r of extRefs1.sort((a, b) => a.from - b.from)) {
    const key = `${r.from}:${r.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${hex(r.from)}: ${r.instr} ${hex(r.to)}`);
  }
}

console.log('\n--- Extended search: refs to 0x096E40-0x096E80 ---');
const extRefs2 = [];
for (let t = 0x096E40; t <= 0x096E80; t++) {
  const lo = t & 0xFF;
  const mid = (t >> 8) & 0xFF;
  const hi = (t >> 16) & 0xFF;
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const b = rom[i];
      if (b === 0xCD || b === 0xC3 || b === 0xCA || b === 0xC2 || b === 0xDA || b === 0xD2) {
        const names = { 0xCD: 'CALL', 0xC3: 'JP', 0xCA: 'JP Z,', 0xC2: 'JP NZ,', 0xDA: 'JP C,', 0xD2: 'JP NC,' };
        extRefs2.push({ from: i, to: t, instr: names[b] });
      }
    }
  }
}
if (extRefs2.length === 0) {
  console.log('  (no references found in extended range)');
} else {
  const seen = new Set();
  for (const r of extRefs2.sort((a, b) => a.from - b.from)) {
    const key = `${r.from}:${r.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${hex(r.from)}: ${r.instr} ${hex(r.to)}`);
  }
}

// ── 7. Deeper caller analysis ────────────────────────────────────────

console.log('\n--- Wider hex dump 0x08B060-0x08B100 (full mode dispatch function) ---');
console.log(hexDump(0x08B060, 0x08B100));

console.log('\n--- Wider hex dump 0x096E00-0x096E90 (full mode dispatch function 2) ---');
console.log(hexDump(0x096E00, 0x096E90));

// Trace callers of the callers
const callerAddresses = [0x08A748, 0x08A809, 0x08AD46, 0x08B008, 0x08B06A, 0x08C260,
                         0x04EAAC, 0x04EB97, 0x060017];

for (const caller of callerAddresses) {
  const callerEntry = findFunctionEntry(caller);
  if (callerEntry) {
    console.log(`\n--- Caller ${hex(caller)} is in function starting at ${hex(callerEntry)} ---`);
    const r = searchRefs(callerEntry, `caller func`);
    if (r.length === 0) {
      for (let d = -2; d <= 2; d++) {
        if (d === 0) continue;
        searchRefs(callerEntry + d, 'nearby');
      }
    }
    const dumpStart = Math.max(0, caller - 8);
    const dumpEnd = Math.min(ROM_SIZE, caller + 16);
    console.log(`  Context around ${hex(caller)}:`);
    console.log(hexDump(dumpStart, dumpEnd));
  } else {
    console.log(`\n--- Caller ${hex(caller)}: could not find function entry ---`);
  }
}

// ── 8. Function entry analysis for 0x08B0A2/A6 ──────────────────────

console.log('\n--- Hex dump 0x08B040-0x08B0C0 (deep backward scan for 0x08B0A2) ---');
console.log(hexDump(0x08B040, 0x08B0C0));

const realEntry1 = findFunctionEntry(0x08B0A2);
console.log(`\nReal function entry for block containing 0x08B0A2: ${realEntry1 ? hex(realEntry1) : 'NOT FOUND'}`);

// 0x08B089 was found as entry — check for refs to it
if (realEntry1) {
  console.log(`\n--- References to real entry ${hex(realEntry1)} ---`);
  searchRefs(realEntry1, 'real entry');
  // Also check 0x08B088 and 0x08B08A
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue;
    const r = searchRefs(realEntry1 + d, 'near real entry');
  }
}

// ── 9. Mode byte dispatch table decode ───────────────────────────────

console.log('\n--- Mode byte dispatch table at 0x08B0CB-0x08B0E7 ---');
// Parse the FE xx CA/C2/C3 pattern (CP imm8; JP cc,addr)
let pos = 0x08B0CB;
const endPos = 0x08B0E8;
const modeEntries = [];
while (pos < endPos) {
  if (rom[pos] === 0xFE && pos + 5 < endPos) {
    const modeId = rom[pos + 1];
    const jpOp = rom[pos + 2];
    if (jpOp === 0xCA || jpOp === 0xC2 || jpOp === 0xC3) {
      const target = rom[pos + 3] | (rom[pos + 4] << 8) | (rom[pos + 5] << 16);
      const names = { 0xCA: 'JP Z,', 0xC2: 'JP NZ,', 0xC3: 'JP' };
      modeEntries.push({ modeId, target, instr: `CP 0x${modeId.toString(16).toUpperCase()}; ${names[jpOp]}${hex(target)}` });
      console.log(`  Mode 0x${modeId.toString(16).toUpperCase().padStart(2, '0')}: ${names[jpOp]}${hex(target)}`);
      pos += 6;
      continue;
    }
  }
  pos++;
}

// Same for dispatch site 2 at 0x096E60
console.log('\n--- Mode byte dispatch table at 0x096E61-0x096E80 ---');
pos = 0x096E61;
const endPos2 = 0x096E80;
while (pos < endPos2) {
  if (rom[pos] === 0xFE && pos + 5 < endPos2) {
    const modeId = rom[pos + 1];
    const jpOp = rom[pos + 2];
    if (jpOp === 0xCA || jpOp === 0xC2 || jpOp === 0xC3) {
      const target = rom[pos + 3] | (rom[pos + 4] << 8) | (rom[pos + 5] << 16);
      const names = { 0xCA: 'JP Z,', 0xC2: 'JP NZ,', 0xC3: 'JP' };
      console.log(`  Mode 0x${modeId.toString(16).toUpperCase().padStart(2, '0')}: ${names[jpOp]}${hex(target)}`);
      pos += 6;
      continue;
    }
  }
  pos++;
}

// ── 10. Summary ──────────────────────────────────────────────────────

console.log('\n=== SUMMARY ===');
console.log('');
console.log('MODE DISPATCH SITE 1 (0x08B0CC):');
console.log('  Function entries: 0x08B0A2 (4 callers), 0x08B0A6 (2 callers)');
console.log('  Callers via CALL 0x08B0A2: 0x08A809, 0x08AD46(JP), 0x08B008, 0x08B06A');
console.log('  Callers via CALL 0x08B0A6: 0x08A748, 0x08C260');
console.log('  NO direct CALL/JP to 0x08B0CC itself — reached only by fall-through');
console.log('');
console.log('MODE DISPATCH SITE 2 (0x096E64):');
console.log('  Function entry: 0x096E29');
console.log('  Callers via CALL 0x096E29: 0x04EAAC, 0x04EB97, 0x060017');
console.log('');
console.log('CALLER CHAIN (second level):');
console.log('  0x08A809 -> in func 0x08A7BE -> called from 0x08A6F0, 0x08B2AE');
console.log('  0x08C260 -> in func 0x08C255 -> called from 0x08AE1D');
console.log('');
console.log('=== Phase 479 complete ===');
