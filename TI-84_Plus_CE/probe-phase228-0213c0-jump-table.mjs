#!/usr/bin/env node
// Phase 228: Trace the jump table dispatcher at 0x0213C0.
//
// Goals:
//   1. Dump all entries in the jump table at 0x0213C0 (3-byte LE addresses).
//   2. Find callers that reference the table or its individual entries.
//   3. For entry [12] (expected 0x023B67): find how HL is loaded before the call.
//   4. Cross-reference D02611 (the RAM address that entry [12] writes HL to).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function hex(v, digits = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
}

function hexBytes(buf, off, len) {
  const parts = [];
  for (let i = 0; i < len && off + i < buf.length; i++) {
    parts.push(buf[off + i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function isPlausibleCode(addr) {
  // ROM: 0x000000-0x3FFFFF, RAM: 0xD00000-0xD65800
  return (addr >= 0x000100 && addr < 0x400000);
}

// ---------------------------------------------------------------------------
// 1. Dump the jump table at 0x0213C0
// ---------------------------------------------------------------------------
console.log('='.repeat(72));
console.log('1. JUMP TABLE AT 0x0213C0');
console.log('='.repeat(72));

const TABLE_BASE = 0x0213C0;
const MAX_ENTRIES = 40;
const entries = [];

// The table is JP instructions: C3 xx xx xx (4 bytes each)
// Scan until we don't see C3 at the expected offset
for (let i = 0; i < MAX_ENTRIES; i++) {
  const off = TABLE_BASE + i * 4;
  if (rom[off] !== 0xC3) {
    console.log(`  Entry [${i}] at ${hex(off)}: opcode ${hex(rom[off], 2)} != C3 (JP), stopping`);
    break;
  }
  const target = read24LE(rom, off + 1);
  if (!isPlausibleCode(target)) {
    console.log(`  Entry [${i}] at ${hex(off)}: ${hex(target)} -- NOT CODE, stopping`);
    break;
  }
  entries.push({ index: i, tableAddr: off, target });
}

console.log(`\nFound ${entries.length} entries:\n`);
console.log('  Index | Table Addr | Target     | First bytes at target');
console.log('  ------+------------+------------+----------------------');
for (const e of entries) {
  const firstBytes = hexBytes(rom, e.target, 12);
  const marker = e.index === 12 ? ' <-- entry [12]' : '';
  console.log(`  [${String(e.index).padStart(2)}]  | ${hex(e.tableAddr)}   | ${hex(e.target)} | ${firstBytes}${marker}`);
}

// Verify entry [12]
const entry12 = entries.find(e => e.index === 12);
if (entry12) {
  console.log(`\n  Entry [12] target: ${hex(entry12.target)} (expected 0x023B67: ${entry12.target === 0x023B67 ? 'MATCH' : 'MISMATCH'})`);
}

// ---------------------------------------------------------------------------
// 2. Find callers referencing the table base and entry addresses
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log('2. CALLERS REFERENCING JUMP TABLE');
console.log('='.repeat(72));

// Collect all addresses to search for
const searchTargets = new Map();
searchTargets.set(TABLE_BASE, 'table base 0x0213C0');
for (const e of entries) {
  searchTargets.set(e.tableAddr, `JP slot [${e.index}] at ${hex(e.tableAddr)}`);
  searchTargets.set(e.target, `target of entry [${e.index}]`);
}

// Also search for the dispatch address 0x0213F0 mentioned in the task
// With 4-byte JP entries, entry [12] would be at TABLE_BASE + 12*4 = 0x0213C0 + 0x30 = 0x0213F0
searchTargets.set(0x0213F0, 'dispatch addr 0x0213F0 (= entry [12] JP slot)');

// Scan entire ROM for 3-byte LE references to any of these
const allRefs = [];

for (let off = 0; off < rom.length - 2; off++) {
  const val = read24LE(rom, off);
  if (searchTargets.has(val)) {
    // Skip if this offset is INSIDE the table itself
    if (off >= TABLE_BASE && off < TABLE_BASE + entries.length * 4) continue;
    allRefs.push({ offset: off, target: val, desc: searchTargets.get(val) });
  }
}

// Group by description
const refsByDesc = new Map();
for (const ref of allRefs) {
  const key = ref.desc;
  if (!refsByDesc.has(key)) refsByDesc.set(key, []);
  refsByDesc.get(key).push(ref);
}

console.log(`\nTotal references found: ${allRefs.length}\n`);

// Show references to the table base first
for (const [desc, refs] of refsByDesc) {
  if (refs.length > 20) {
    console.log(`  ${desc}: ${refs.length} refs (showing first 20)`);
    for (const ref of refs.slice(0, 20)) {
      console.log(`    at ${hex(ref.offset)}: bytes ${hexBytes(rom, ref.offset - 4, 12)}`);
    }
  } else {
    console.log(`  ${desc}: ${refs.length} refs`);
    for (const ref of refs) {
      // Show context: 4 bytes before and 8 bytes after
      const ctxStart = Math.max(0, ref.offset - 6);
      const ctxLen = Math.min(18, rom.length - ctxStart);
      console.log(`    at ${hex(ref.offset)}: context ${hexBytes(rom, ctxStart, ctxLen)}`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 3. Detailed caller analysis for entry [12] and table base
// ---------------------------------------------------------------------------
console.log('='.repeat(72));
console.log('3. DETAILED CALLER ANALYSIS (entry [12] and table base)');
console.log('='.repeat(72));

// Find references to 0x023B67 (target of entry 12) -- likely direct CALL sites
const entry12Refs = allRefs.filter(r => r.target === 0x023B67);
// Find references to table base
const tableBaseRefs = allRefs.filter(r => r.target === TABLE_BASE);
// Find references to dispatch addr
const dispatchRefs = allRefs.filter(r => r.target === 0x0213F0);

function analyzeCallerContext(refOffset, label) {
  // Show ~30 bytes before the reference to see how HL is loaded
  const contextBefore = Math.max(0, refOffset - 30);
  const contextLen = Math.min(40, rom.length - contextBefore);

  console.log(`\n  ${label} at ${hex(refOffset)}:`);
  console.log(`    Bytes [${hex(contextBefore)} .. ${hex(contextBefore + contextLen - 1)}]:`);

  // Print in rows of 16
  for (let i = 0; i < contextLen; i += 16) {
    const lineOff = contextBefore + i;
    const lineLen = Math.min(16, contextLen - i);
    const prefix = refOffset >= lineOff && refOffset < lineOff + lineLen ? '>>>' : '   ';
    console.log(`    ${prefix} ${hex(lineOff)}: ${hexBytes(rom, lineOff, lineLen)}`);
  }

  // Try to identify LD HL,nnnn patterns before the call
  // LD HL,nn24 = 0x21 nn nn nn (ADL mode, 4 bytes)
  // CALL nn24  = 0xCD nn nn nn (ADL mode, 4 bytes)
  for (let scan = refOffset - 20; scan < refOffset; scan++) {
    if (scan < 0) continue;
    const b = rom[scan];
    // LD HL,imm24 = 0x21
    if (b === 0x21 && scan + 3 < rom.length) {
      const imm = read24LE(rom, scan + 1);
      console.log(`    ** LD HL,${hex(imm)} found at ${hex(scan)}`);
    }
    // LD HL,(addr24) = 0x2A
    if (b === 0x2A && scan + 3 < rom.length) {
      const addr = read24LE(rom, scan + 1);
      console.log(`    ** LD HL,(${hex(addr)}) found at ${hex(scan)}`);
    }
  }
}

console.log('\n--- References to 0x023B67 (entry [12] target) ---');
if (entry12Refs.length === 0) {
  console.log('  No direct references found.');
} else {
  for (const ref of entry12Refs) {
    analyzeCallerContext(ref.offset, 'ref to 0x023B67');
  }
}

console.log('\n--- References to table base 0x0213C0 ---');
for (const ref of tableBaseRefs) {
  analyzeCallerContext(ref.offset, 'ref to table base');
}

console.log('\n--- References to dispatch addr 0x0213F0 ---');
for (const ref of dispatchRefs) {
  analyzeCallerContext(ref.offset, 'ref to dispatch 0x0213F0');
}

// ---------------------------------------------------------------------------
// 3b. Search for CALL instructions to each table entry target
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log('3b. CALL/JP INSTRUCTIONS TO TABLE ENTRY TARGETS AND JP SLOTS');
console.log('='.repeat(72));

// Search for CALL/JP to both the target addresses AND the JP slot addresses
// In eZ80 ADL mode, CALL nn24 = CD xx xx xx, JP nn24 = C3 xx xx xx
for (const e of entries) {
  // Search for calls to the TARGET (the actual handler)
  const callToTarget = [];
  // Search for calls to the JP SLOT (the table entry address)
  const callToSlot = [];

  for (let off = 0; off < rom.length - 3; off++) {
    const opcode = rom[off];
    if (opcode === 0xCD || opcode === 0xC3) {
      const target = read24LE(rom, off + 1);
      // Skip entries inside the table itself
      if (off >= TABLE_BASE && off < TABLE_BASE + entries.length * 4) continue;
      if (target === e.target) callToTarget.push({ off, opcode });
      if (target === e.tableAddr) callToSlot.push({ off, opcode });
    }
  }

  if (callToTarget.length > 0 || callToSlot.length > 0) {
    console.log(`\n  Entry [${e.index}] target ${hex(e.target)}, slot ${hex(e.tableAddr)}:`);
  }

  if (callToTarget.length > 0) {
    console.log(`    Direct calls/jumps to target: ${callToTarget.length}`);
    for (const { off: coff, opcode } of callToTarget.slice(0, 10)) {
      const op = opcode === 0xCD ? 'CALL' : 'JP';
      let hlNote = '';
      for (let scan = coff - 16; scan < coff; scan++) {
        if (scan < 0) continue;
        if (rom[scan] === 0x21 && scan + 4 <= coff) {
          const imm = read24LE(rom, scan + 1);
          hlNote += ` | LD HL,${hex(imm)} at ${hex(scan)}`;
        }
        if (rom[scan] === 0x2A && scan + 4 <= coff) {
          const addr = read24LE(rom, scan + 1);
          hlNote += ` | LD HL,(${hex(addr)}) at ${hex(scan)}`;
        }
      }
      console.log(`      ${op} at ${hex(coff)}: ${hexBytes(rom, coff, 4)}${hlNote}`);
    }
    if (callToTarget.length > 10) console.log(`      ... and ${callToTarget.length - 10} more`);
  }

  if (callToSlot.length > 0) {
    console.log(`    Calls/jumps via JP slot: ${callToSlot.length}`);
    for (const { off: coff, opcode } of callToSlot.slice(0, 10)) {
      const op = opcode === 0xCD ? 'CALL' : 'JP';
      let hlNote = '';
      for (let scan = coff - 16; scan < coff; scan++) {
        if (scan < 0) continue;
        if (rom[scan] === 0x21 && scan + 4 <= coff) {
          const imm = read24LE(rom, scan + 1);
          hlNote += ` | LD HL,${hex(imm)} at ${hex(scan)}`;
        }
        if (rom[scan] === 0x2A && scan + 4 <= coff) {
          const addr = read24LE(rom, scan + 1);
          hlNote += ` | LD HL,(${hex(addr)}) at ${hex(scan)}`;
        }
      }
      console.log(`      ${op} at ${hex(coff)}: ${hexBytes(rom, coff, 4)}${hlNote}`);
    }
    if (callToSlot.length > 10) console.log(`      ... and ${callToSlot.length - 10} more`);
  }
}

// ---------------------------------------------------------------------------
// 4. Cross-reference D02611
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log('4. CROSS-REFERENCE D02611');
console.log('='.repeat(72));

const D02611_BYTES = [0x11, 0x26, 0xD0]; // little-endian bytes
const d02611Refs = [];

for (let off = 0; off < rom.length - 2; off++) {
  if (rom[off] === D02611_BYTES[0] && rom[off + 1] === D02611_BYTES[1] && rom[off + 2] === D02611_BYTES[2]) {
    d02611Refs.push(off);
  }
}

console.log(`\nFound ${d02611Refs.length} references to D02611:\n`);

for (const off of d02611Refs) {
  // Look at the byte(s) before to determine instruction type
  const ctxStart = Math.max(0, off - 4);
  const ctxLen = Math.min(12, rom.length - ctxStart);
  const prevByte = off > 0 ? rom[off - 1] : -1;

  let classify = 'UNKNOWN';
  // LD (nn24),HL = 0x22 nn nn nn
  if (prevByte === 0x22) classify = 'WRITE (LD (D02611),HL)';
  // LD HL,(nn24) = 0x2A nn nn nn
  else if (prevByte === 0x2A) classify = 'READ (LD HL,(D02611))';
  // LD (nn24),A = 0x32 nn nn nn
  else if (prevByte === 0x32) classify = 'WRITE (LD (D02611),A)';
  // LD A,(nn24) = 0x3A nn nn nn
  else if (prevByte === 0x3A) classify = 'READ (LD A,(D02611))';
  // LD (nn24),DE = ED 53 nn nn nn
  else if (off >= 2 && rom[off - 2] === 0xED && rom[off - 1] === 0x53) classify = 'WRITE (LD (D02611),DE)';
  // LD DE,(nn24) = ED 5B nn nn nn
  else if (off >= 2 && rom[off - 2] === 0xED && rom[off - 1] === 0x5B) classify = 'READ (LD DE,(D02611))';
  // LD (nn24),BC = ED 43 nn nn nn
  else if (off >= 2 && rom[off - 2] === 0xED && rom[off - 1] === 0x43) classify = 'WRITE (LD (D02611),BC)';
  // LD BC,(nn24) = ED 4B nn nn nn
  else if (off >= 2 && rom[off - 2] === 0xED && rom[off - 1] === 0x4B) classify = 'READ (LD BC,(D02611))';
  // Could also be part of a JP/CALL address (false positive)
  else if (prevByte === 0xCD) classify = 'CALL target (not a ref to D02611)';
  else if (prevByte === 0xC3) classify = 'JP target (not a ref to D02611)';

  console.log(`  ${hex(off)}: ${classify} | bytes: ${hexBytes(rom, ctxStart, ctxLen)}`);
}

// ---------------------------------------------------------------------------
// 5. Examine the stubs at 0x023B31-0x023BCE
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log('5. MODE REGISTRATION STUBS (0x023B31 - 0x023BCE)');
console.log('='.repeat(72));

console.log('\nDecoding stubs to find the RAM address each one writes HL to:\n');

const STUB_START = 0x023B31;
const STUB_END = 0x023BD0;

let stubOff = STUB_START;
let stubCount = 0;
while (stubOff < STUB_END && stubOff + 6 <= rom.length) {
  // Expected pattern: LD (nn24),HL = 0x22 nn nn nn / ... / RET = 0xC9
  const b = rom[stubOff];
  if (b === 0x22) {
    const ramAddr = read24LE(rom, stubOff + 1);
    // Find RET
    let retOff = stubOff + 4;
    let extraOps = '';
    // Scan up to 12 bytes for RET
    for (let s = stubOff + 4; s < stubOff + 16 && s < rom.length; s++) {
      if (rom[s] === 0xC9) {
        retOff = s;
        break;
      }
    }
    const stubLen = retOff - stubOff + 1;
    const isEntry12Target = (stubOff === 0x023B67);
    console.log(`  Stub at ${hex(stubOff)}: LD (${hex(ramAddr)}),HL ... RET (${stubLen} bytes) | ${hexBytes(rom, stubOff, stubLen)}${isEntry12Target ? ' <-- entry [12]' : ''}`);
    stubOff = retOff + 1;
    stubCount++;
  } else if (b === 0xC9) {
    // Stray RET, skip
    stubOff++;
  } else {
    // Unknown byte, show and advance
    console.log(`  Unknown at ${hex(stubOff)}: ${hexBytes(rom, stubOff, 8)}`);
    stubOff++;
  }
}

console.log(`\nTotal stubs decoded: ${stubCount}`);

// ---------------------------------------------------------------------------
// 6. Search for the dispatch mechanism
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log('6. DISPATCH MECHANISM SEARCH');
console.log('='.repeat(72));

// The dispatch likely loads from the table: LD HL,(IX+off) or uses a computed
// address. Search for patterns near 0x0213F0 if it differs from 0x0213C0.
// Also look for JP (HL) = 0xE9 near table references.

console.log('\nSearching for JP (HL) [0xE9] near table base references...');

for (const ref of tableBaseRefs) {
  // Search +-30 bytes for JP (HL)
  for (let s = ref.offset - 10; s < ref.offset + 30 && s < rom.length; s++) {
    if (s < 0) continue;
    if (rom[s] === 0xE9) {
      console.log(`  JP (HL) at ${hex(s)}, near table ref at ${hex(ref.offset)}`);
      console.log(`    Context: ${hexBytes(rom, Math.max(0, s - 8), 20)}`);
    }
  }
}

// Also search for CALL (HL) patterns -- in eZ80: CALL (HL) doesn't exist as
// a single opcode; the typical pattern is PUSH HL / RET or JP (HL).
// Search for the code that actually dispatches through the table.

console.log('\nHex dump around the jump table (including before and after):');
const dumpStart = 0x021380;
const dumpEnd = 0x021420;
for (let i = dumpStart; i < dumpEnd; i += 16) {
  const len = Math.min(16, dumpEnd - i);
  console.log(`  ${hex(i)}: ${hexBytes(rom, i, len)}`);
}

console.log('\n=== DONE ===');
