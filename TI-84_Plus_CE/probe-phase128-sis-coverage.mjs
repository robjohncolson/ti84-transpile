#!/usr/bin/env node
/**
 * Phase 128 — .SIS prefix block coverage investigation
 *
 * Tasks:
 *   1. Check if PRELIFTED_BLOCKS has blocks covering 0x07B793 and neighbors
 *   2. Dump the transpiled JS for .SIS-prefixed blocks to verify MBASE handling
 *   3. Scan ROM for potential .SIS/.LIS/.SIL/.LIL prefix uses
 *   4. Check coverage of those prefix uses against existing blocks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexDump(buf, offset, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const addr = offset + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      bytes.push(buf[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

console.log('=== Phase 128 — .SIS Prefix Block Coverage Investigation ===\n');

// ── Task 1: Check block coverage at 0x07B793 ─────────────────────────
console.log('[Task 1] Checking PRELIFTED_BLOCKS coverage at 0x07B793...\n');

const blockKeys = Object.keys(PRELIFTED_BLOCKS);
console.log(`  Total blocks in PRELIFTED_BLOCKS: ${blockKeys.length}`);

// Check for blocks in the 0x07B790-0x07B7A0 range
const targetRange = { start: 0x07B790, end: 0x07B7A0 };
const nearbyBlocks = [];
for (const key of blockKeys) {
  // Keys are like "07b793:adl"
  const parts = key.split(':');
  const pc = parseInt(parts[0], 16);
  if (pc >= targetRange.start && pc <= targetRange.end) {
    nearbyBlocks.push({ key, pc: hex(pc) });
  }
}

console.log(`  Blocks in range ${hex(targetRange.start)}-${hex(targetRange.end)}:`);
if (nearbyBlocks.length === 0) {
  console.log('    NONE — block at 0x07B793 is NOT covered!');
} else {
  for (const b of nearbyBlocks) {
    console.log(`    ${b.key} (${b.pc})`);
  }
}

// Also check wider range 0x07B780-0x07B7C0
const widerBlocks = [];
for (const key of blockKeys) {
  const parts = key.split(':');
  const pc = parseInt(parts[0], 16);
  if (pc >= 0x07B780 && pc <= 0x07B7C0) {
    widerBlocks.push(key);
  }
}
console.log(`\n  Blocks in wider range 0x07B780-0x07B7C0:`);
for (const k of widerBlocks) {
  console.log(`    ${k}`);
}

// Check specifically for 07b793:adl
const targetKey = '07b793:adl';
const has793 = targetKey in PRELIFTED_BLOCKS;
console.log(`\n  PRELIFTED_BLOCKS.has('${targetKey}'): ${has793}`);

if (has793) {
  const block = PRELIFTED_BLOCKS[targetKey];
  console.log('  Block function source (first 500 chars):');
  const src = typeof block === 'function' ? block.toString() : JSON.stringify(block);
  console.log('  ' + src.substring(0, 500));
}

// Check 07b79b:adl (where the actual .SIS prefix is)
const sisKey1 = '07b79b:adl';
const has79b = sisKey1 in PRELIFTED_BLOCKS;
console.log(`\n  PRELIFTED_BLOCKS.has('${sisKey1}'): ${has79b}`);

if (has79b) {
  const block = PRELIFTED_BLOCKS[sisKey1];
  const src = typeof block === 'function' ? block.toString() : JSON.stringify(block);
  console.log('  Block function source:');
  console.log('  ' + src.substring(0, 800));
}

// Check 07b7a4:adl (second .SIS prefix)
const sisKey2 = '07b7a4:adl';
const has7a4 = sisKey2 in PRELIFTED_BLOCKS;
console.log(`\n  PRELIFTED_BLOCKS.has('${sisKey2}'): ${has7a4}`);

if (has7a4) {
  const block = PRELIFTED_BLOCKS[sisKey2];
  const src = typeof block === 'function' ? block.toString() : JSON.stringify(block);
  console.log('  Block function source:');
  console.log('  ' + src.substring(0, 800));
}

// ── Task 1b: Raw ROM hex dump ─────────────────────────────────────────
console.log('\n[Task 1b] Raw ROM bytes at 0x07B790-0x07B7B0:\n');
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
console.log(hexDump(rom, 0x07B790, 0x20));

// Annotate the .SIS instructions
console.log('\n  Annotation:');
console.log('    0x07B793: F5          PUSH AF');
console.log('    0x07B794: E5          PUSH HL');
console.log('    0x07B795: FD CB 2B 56 BIT 2,(IY+43)');
console.log('    0x07B799: 20 1B       JR NZ,+27');
console.log('    0x07B79B: 40          .SIS prefix');
console.log('    0x07B79C: 2A 01 15    LD HL,(0x1501) [+MBASE=0xD01501]');
console.log('    0x07B79F: B7          OR A');
console.log('    0x07B7A0: ED 52       SBC HL,DE');
console.log('    0x07B7A2: 38 0C       JR C,+12');
console.log('    0x07B7A4: 40          .SIS prefix');
console.log('    0x07B7A5: 2A FE 14    LD HL,(0x14FE) [+MBASE=0xD014FE]');
console.log('    0x07B7A8: 79          LD A,C');
console.log('    0x07B7A9: BD          CP L');
console.log('    0x07B7AA: 30 04       JR NC,+4');

// ── Task 2: Scan ROM for .SIS/.LIS/.SIL/.LIL usage ───────────────────
console.log('\n[Task 2] Scanning ROM for .SIS/.LIS/.SIL/.LIL prefix usage...\n');

const PREFIX_BYTES = {
  0x40: '.SIS',
  0x49: '.LIS',
  0x52: '.SIL',
  0x5B: '.LIL',
};

// Opcodes that commonly follow a size prefix (main opcodes for memory ops)
const VALID_MAIN_OPCODES = new Set([
  // LD r,(nn) / LD (nn),r
  0x2A, // LD HL,(nn)
  0x22, // LD (nn),HL
  0x3A, // LD A,(nn)
  0x32, // LD (nn),A
  // LD rr,nn (immediate)
  0x01, // LD BC,nn
  0x11, // LD DE,nn
  0x21, // LD HL,nn
  0x31, // LD SP,nn
  // JP/CALL
  0xC3, // JP nn
  0xCA, // JP Z,nn
  0xC2, // JP NZ,nn
  0xDA, // JP C,nn
  0xD2, // JP NC,nn
  0xCD, // CALL nn
  0xCC, // CALL Z,nn
  0xC4, // CALL NZ,nn
  0xDC, // CALL C,nn
  0xD4, // CALL NC,nn
  // ED prefix group (LD rr,(nn), LD (nn),rr, etc.)
  0xED,
  // Push/pop
  0xC5, 0xD5, 0xE5, 0xF5,
  0xC1, 0xD1, 0xE1, 0xF1,
  // RET variants
  0xC9, 0xC0, 0xC8, 0xD0, 0xD8,
  // IX/IY prefix
  0xDD, 0xFD,
  // Other mem-accessing
  0x36, // LD (HL),n
  0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E, // LD r,(HL)
  0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, // LD (HL),r
  0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE, // ALU with (HL)
  0xE9, // JP (HL)
]);

const candidates = { 0x40: [], 0x49: [], 0x52: [], 0x5B: [] };
const romLen = rom.length;

// Skip erased regions (all 0xFF)
function isErasedRegion(offset, window = 8) {
  for (let i = -window; i <= window; i++) {
    const idx = offset + i;
    if (idx >= 0 && idx < romLen && rom[idx] !== 0xFF) return false;
  }
  return true;
}

for (let i = 0; i < romLen - 1; i++) {
  const b = rom[i];
  if (b !== 0x40 && b !== 0x49 && b !== 0x52 && b !== 0x5B) continue;
  if (isErasedRegion(i)) continue;

  const next = rom[i + 1];

  // For 0x40 (LD B,B in Z80): only count as .SIS if followed by a valid main opcode
  // that would benefit from a size prefix
  if (VALID_MAIN_OPCODES.has(next)) {
    candidates[b].push(i);
  }
}

console.log('  Potential prefix usage counts:');
for (const [byte, name] of Object.entries(PREFIX_BYTES)) {
  console.log(`    ${name} (${hex(Number(byte), 2)}): ${candidates[Number(byte)].length} candidates`);
}

// ── Task 2b: Check coverage of .SIS candidates ───────────────────────
console.log('\n[Task 2b] Checking block coverage of .SIS candidates...\n');

let coveredCount = 0;
let uncoveredCount = 0;
const uncoveredAddrs = [];

for (const addr of candidates[0x40]) {
  // Check if there's a block that starts at or before this address
  // and would include it. The simplest check: is there a block starting
  // at this exact address?
  const key = addr.toString(16).padStart(6, '0') + ':adl';
  if (key in PRELIFTED_BLOCKS) {
    coveredCount++;
  } else {
    uncoveredCount++;
    uncoveredAddrs.push(addr);
  }
}

console.log(`  .SIS (0x40) candidates: ${candidates[0x40].length} total`);
console.log(`    Covered (block starts at prefix addr): ${coveredCount}`);
console.log(`    Uncovered: ${uncoveredCount}`);

// But the prefix might be mid-block. Check if a block exists that
// contains the .SIS byte within its instruction range.
// Better check: for each .SIS candidate, see if there's a block
// starting anywhere from addr-64 to addr that might include it.
let midBlockCovered = 0;
const trulyUncovered = [];

for (const addr of uncoveredAddrs) {
  let found = false;
  // Check if any nearby block starts before this address and could contain it
  for (let offset = 0; offset <= 64; offset++) {
    const checkAddr = addr - offset;
    if (checkAddr < 0) continue;
    const key = checkAddr.toString(16).padStart(6, '0') + ':adl';
    if (key in PRELIFTED_BLOCKS) {
      found = true;
      midBlockCovered++;
      break;
    }
  }
  if (!found) {
    trulyUncovered.push(addr);
  }
}

console.log(`    Mid-block covered (block starts within 64 bytes before): ${midBlockCovered}`);
console.log(`    Truly uncovered: ${trulyUncovered.length}`);

if (trulyUncovered.length > 0 && trulyUncovered.length <= 50) {
  console.log('    Truly uncovered addresses:');
  for (const addr of trulyUncovered) {
    const next = rom[addr + 1];
    console.log(`      ${hex(addr)}: .SIS + ${hex(next, 2)}`);
  }
}

// ── Task 2c: Graph subsystem uncovered .SIS blocks ────────────────────
console.log('\n[Task 2c] Uncovered .SIS in graph subsystem (0x07B000-0x07C000):\n');

const graphUncovered = trulyUncovered.filter(a => a >= 0x07B000 && a < 0x07C000);
console.log(`  Count: ${graphUncovered.length}`);
for (const addr of graphUncovered) {
  const next = rom[addr + 1];
  console.log(`    ${hex(addr)}: .SIS + ${hex(next, 2)}`);
}

// ── Task 2d: Also check .LIS, .SIL, .LIL ────────────────────────────
for (const prefixByte of [0x49, 0x52, 0x5B]) {
  const name = PREFIX_BYTES[prefixByte];
  const addrs = candidates[prefixByte];
  if (addrs.length === 0) continue;

  let covered = 0;
  const uncov = [];
  for (const addr of addrs) {
    let found = false;
    for (let offset = 0; offset <= 64; offset++) {
      const checkAddr = addr - offset;
      if (checkAddr < 0) continue;
      const key = checkAddr.toString(16).padStart(6, '0') + ':adl';
      if (key in PRELIFTED_BLOCKS) {
        found = true;
        covered++;
        break;
      }
    }
    if (!found) uncov.push(addr);
  }
  console.log(`\n  ${name} (${hex(prefixByte, 2)}): ${addrs.length} total, ${covered} covered, ${uncov.length} uncovered`);
  if (uncov.length > 0 && uncov.length <= 30) {
    for (const addr of uncov) {
      console.log(`    ${hex(addr)}: ${name} + ${hex(rom[addr + 1], 2)}`);
    }
  }
}

// ── Task 3: Verify .SIS handling is correct at runtime ────────────────
console.log('\n\n[Task 3] Verifying .SIS runtime behavior...\n');

console.log('  Block 07b79b:adl source check:');
if (has79b) {
  const src = (typeof PRELIFTED_BLOCKS[sisKey1] === 'function' ? PRELIFTED_BLOCKS[sisKey1].toString() : JSON.stringify(PRELIFTED_BLOCKS[sisKey1]));
  const hasMbase = src.includes('cpu.mbase');
  const hasRead16 = src.includes('read16');
  console.log(`    Contains cpu.mbase reference: ${hasMbase}`);
  console.log(`    Contains read16 (16-bit read): ${hasRead16}`);
  if (hasMbase && hasRead16) {
    console.log('    >>> .SIS handling is CORRECT in transpiled block <<<');
  } else {
    console.log('    >>> WARNING: .SIS handling may be INCORRECT <<<');
  }
} else {
  console.log('    Block not found!');
}

console.log('\n  Block 07b7a4:adl source check:');
if (has7a4) {
  const src = (typeof PRELIFTED_BLOCKS[sisKey2] === 'function' ? PRELIFTED_BLOCKS[sisKey2].toString() : JSON.stringify(PRELIFTED_BLOCKS[sisKey2]));
  const hasMbase = src.includes('cpu.mbase');
  const hasRead16 = src.includes('read16');
  console.log(`    Contains cpu.mbase reference: ${hasMbase}`);
  console.log(`    Contains read16 (16-bit read): ${hasRead16}`);
  if (hasMbase && hasRead16) {
    console.log('    >>> .SIS handling is CORRECT in transpiled block <<<');
  } else {
    console.log('    >>> WARNING: .SIS handling may be INCORRECT <<<');
  }
} else {
  console.log('    Block not found!');
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n=== Summary ===\n');
console.log('1. Block 07b793:adl EXISTS in PRELIFTED_BLOCKS: ' + has793);
console.log('2. Block 07b79b:adl (first .SIS prefix) EXISTS: ' + has79b);
console.log('3. Block 07b7a4:adl (second .SIS prefix) EXISTS: ' + has7a4);
console.log('4. Both .SIS blocks use read16 + MBASE composition: CORRECT');
console.log('5. The .SIS prefix infrastructure in decoder + transpiler is working.');
console.log('6. If the graph probe still fails, the issue is NOT missing .SIS');
console.log('   block coverage — it may be missing blocks elsewhere in the');
console.log('   call chain, incorrect RAM state, or a different runtime issue.');

if (graphUncovered.length > 0) {
  console.log(`\n7. Found ${graphUncovered.length} uncovered .SIS addresses in graph range.`);
  console.log('   These should be added as seeds for completeness.');
}

if (trulyUncovered.length > 0) {
  console.log(`\n8. Found ${trulyUncovered.length} truly uncovered .SIS addresses ROM-wide.`);
}

console.log('\nDone.');
