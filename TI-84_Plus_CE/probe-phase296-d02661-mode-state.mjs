#!/usr/bin/env node
// Phase 296 — static ROM scan for all read/write sites to D02661 and D02662.
//
// 0x0AF877 is a 2-state predicate: checks (D02661)==0x83 AND (D02662)==0x03.
// D02661 writers were mapped in session 245; D02662 writers are unknown.
// This probe finds every instruction that reads or writes either address
// to understand when the 0x83/0x03 combination gets set.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);

// --- Patterns to search ---
// eZ80 ADL-mode encodings (opcode + 24-bit LE address)
const PATTERNS = [
  // Writes
  { bytes: [0x32, 0x61, 0x26, 0xD0], mnemonic: 'LD (0xD02661),A', target: 0xD02661, type: 'WRITE' },
  { bytes: [0x32, 0x62, 0x26, 0xD0], mnemonic: 'LD (0xD02662),A', target: 0xD02662, type: 'WRITE' },
  { bytes: [0x22, 0x61, 0x26, 0xD0], mnemonic: 'LD (0xD02661),HL', target: 0xD02661, type: 'WRITE' },
  { bytes: [0x22, 0x62, 0x26, 0xD0], mnemonic: 'LD (0xD02662),HL', target: 0xD02662, type: 'WRITE' },
  // Reads
  { bytes: [0x3A, 0x61, 0x26, 0xD0], mnemonic: 'LD A,(0xD02661)', target: 0xD02661, type: 'READ' },
  { bytes: [0x3A, 0x62, 0x26, 0xD0], mnemonic: 'LD A,(0xD02662)', target: 0xD02662, type: 'READ' },
  { bytes: [0x2A, 0x61, 0x26, 0xD0], mnemonic: 'LD HL,(0xD02661)', target: 0xD02661, type: 'READ' },
  { bytes: [0x2A, 0x62, 0x26, 0xD0], mnemonic: 'LD HL,(0xD02662)', target: 0xD02662, type: 'READ' },
];

// Also search for address references via register-indirect patterns.
// LD rr,imm24 where imm24 = D02661 or D02662 (used for indirect access)
const REG_LOAD_PATTERNS = [
  // LD BC,D02661
  { bytes: [0x01, 0x61, 0x26, 0xD0], mnemonic: 'LD BC,0xD02661', target: 0xD02661, type: 'REF' },
  { bytes: [0x01, 0x62, 0x26, 0xD0], mnemonic: 'LD BC,0xD02662', target: 0xD02662, type: 'REF' },
  // LD DE,D02661
  { bytes: [0x11, 0x61, 0x26, 0xD0], mnemonic: 'LD DE,0xD02661', target: 0xD02661, type: 'REF' },
  { bytes: [0x11, 0x62, 0x26, 0xD0], mnemonic: 'LD DE,0xD02662', target: 0xD02662, type: 'REF' },
  // LD HL,D02661
  { bytes: [0x21, 0x61, 0x26, 0xD0], mnemonic: 'LD HL,0xD02661', target: 0xD02661, type: 'REF' },
  { bytes: [0x21, 0x62, 0x26, 0xD0], mnemonic: 'LD HL,0xD02662', target: 0xD02662, type: 'REF' },
];

const ALL_PATTERNS = [...PATTERNS, ...REG_LOAD_PATTERNS];

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0');
}

// Simple eZ80 instruction decoder for context display
const SIMPLE_OPCODES = {
  0x00: 'NOP', 0x76: 'HALT', 0xC9: 'RET', 0xF3: 'DI', 0xFB: 'EI',
  0xAF: 'XOR A', 0xA7: 'AND A', 0xB7: 'OR A',
  0x3C: 'INC A', 0x3D: 'DEC A',
  0x47: 'LD B,A', 0x4F: 'LD C,A', 0x57: 'LD D,A', 0x5F: 'LD E,A',
  0x67: 'LD H,A', 0x6F: 'LD L,A', 0x77: 'LD (HL),A',
  0x78: 'LD A,B', 0x79: 'LD A,C', 0x7A: 'LD A,D', 0x7B: 'LD A,E',
  0x7C: 'LD A,H', 0x7D: 'LD A,L', 0x7E: 'LD A,(HL)',
  0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
  0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF',
  0xFE: 'CP n', 0x3E: 'LD A,n', 0xE6: 'AND n', 0xF6: 'OR n', 0xEE: 'XOR n',
  0xC6: 'ADD A,n', 0xD6: 'SUB n', 0xCE: 'ADC A,n', 0xDE: 'SBC A,n',
};

function decodeContext(addr, rom) {
  if (addr < 0 || addr >= rom.length) return '(out of bounds)';
  const b = rom[addr];

  // 4-byte instructions (opcode + 24-bit immediate)
  if ([0x01, 0x11, 0x21, 0x31, 0x22, 0x2A, 0x32, 0x3A, 0xCD, 0xC3, 0xC2, 0xCA, 0xD2, 0xDA].includes(b)) {
    if (addr + 3 < rom.length) {
      const imm = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
      const names = {
        0x01: 'LD BC', 0x11: 'LD DE', 0x21: 'LD HL', 0x31: 'LD SP',
        0x22: 'LD (nn),HL', 0x2A: 'LD HL,(nn)', 0x32: 'LD (nn),A', 0x3A: 'LD A,(nn)',
        0xCD: 'CALL', 0xC3: 'JP', 0xC2: 'JP NZ', 0xCA: 'JP Z',
        0xD2: 'JP NC', 0xDA: 'JP C',
      };
      return `${names[b]},${hex(imm)} [${hexByte(b)} ${hexByte(rom[addr+1])} ${hexByte(rom[addr+2])} ${hexByte(rom[addr+3])}]`;
    }
  }

  // 2-byte instructions (opcode + immediate byte)
  if ([0x3E, 0xFE, 0xE6, 0xF6, 0xEE, 0xC6, 0xD6, 0xCE, 0xDE, 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36].includes(b)) {
    if (addr + 1 < rom.length) {
      const names = {
        0x3E: 'LD A', 0xFE: 'CP', 0xE6: 'AND', 0xF6: 'OR', 0xEE: 'XOR',
        0xC6: 'ADD A', 0xD6: 'SUB', 0xCE: 'ADC A', 0xDE: 'SBC A',
        0x06: 'LD B', 0x0E: 'LD C', 0x16: 'LD D', 0x1E: 'LD E',
        0x26: 'LD H', 0x2E: 'LD L', 0x36: 'LD (HL)',
      };
      return `${names[b]},0x${hexByte(rom[addr+1])} [${hexByte(b)} ${hexByte(rom[addr+1])}]`;
    }
  }

  // 1-byte instructions
  if (SIMPLE_OPCODES[b]) {
    return `${SIMPLE_OPCODES[b]} [${hexByte(b)}]`;
  }

  return `?? [${hexByte(b)}]`;
}

// --- Scan ---
const hits = [];

for (const pat of ALL_PATTERNS) {
  const len = pat.bytes.length;
  for (let addr = 0; addr <= rom.length - len; addr++) {
    let match = true;
    for (let i = 0; i < len; i++) {
      if (rom[addr + i] !== pat.bytes[i]) { match = false; break; }
    }
    if (!match) continue;

    // Grab context bytes
    const ctxBefore = Math.max(0, addr - 10);
    const ctxAfter = Math.min(rom.length, addr + len + 10);
    const before = Array.from(rom.slice(ctxBefore, addr));
    const after = Array.from(rom.slice(addr + len, ctxAfter));
    const instrBytes = Array.from(rom.slice(addr, addr + len));

    hits.push({
      addr,
      pat,
      before,
      after,
      instrBytes,
    });
  }
}

// Sort by target address, then type, then ROM address
hits.sort((a, b) => {
  if (a.pat.target !== b.pat.target) return a.pat.target - b.pat.target;
  const typeOrder = { WRITE: 0, READ: 1, REF: 2 };
  if (typeOrder[a.pat.type] !== typeOrder[b.pat.type]) return typeOrder[a.pat.type] - typeOrder[b.pat.type];
  return a.addr - b.addr;
});

// --- Report ---
console.log('=== Phase 296: D02661/D02662 Read/Write Site Scan ===');
console.log(`ROM size: ${rom.length} bytes (${hex(rom.length)})`);
console.log(`Total hits: ${hits.length}`);
console.log();

// Summary counts
const d1Writes = hits.filter(h => h.pat.target === 0xD02661 && h.pat.type === 'WRITE');
const d1Reads  = hits.filter(h => h.pat.target === 0xD02661 && h.pat.type === 'READ');
const d1Refs   = hits.filter(h => h.pat.target === 0xD02661 && h.pat.type === 'REF');
const d2Writes = hits.filter(h => h.pat.target === 0xD02662 && h.pat.type === 'WRITE');
const d2Reads  = hits.filter(h => h.pat.target === 0xD02662 && h.pat.type === 'READ');
const d2Refs   = hits.filter(h => h.pat.target === 0xD02662 && h.pat.type === 'REF');

console.log('--- Summary ---');
console.log(`D02661: ${d1Writes.length} writes, ${d1Reads.length} reads, ${d1Refs.length} refs`);
console.log(`D02662: ${d2Writes.length} writes, ${d2Reads.length} reads, ${d2Refs.length} refs`);
console.log();

// Detailed output grouped by target + type
function printHits(label, hitList) {
  if (hitList.length === 0) return;
  console.log(`--- ${label} (${hitList.length} hits) ---`);
  for (const h of hitList) {
    const instrAddr = hex(h.addr);
    console.log(`  ${instrAddr}: ${h.pat.mnemonic}`);
    console.log(`    bytes: [${h.before.map(hexByte).join(' ')}] ${h.instrBytes.map(hexByte).join(' ')} [${h.after.map(hexByte).join(' ')}]`);

    // Decode a few instructions before the match for context
    // Walk backwards looking for recognizable instructions
    const contextLines = [];

    // Try to decode 3 instructions before
    let scanAddr = h.addr - 1;
    const preInstrs = [];
    for (let attempt = 0; attempt < 6 && scanAddr >= 0 && preInstrs.length < 3; attempt++) {
      // Try 4-byte instruction
      if (scanAddr >= 3 && [0x01, 0x11, 0x21, 0x31, 0x22, 0x2A, 0x32, 0x3A, 0xCD, 0xC3, 0xC2, 0xCA, 0xD2, 0xDA].includes(rom[scanAddr - 3])) {
        preInstrs.unshift({ addr: scanAddr - 3, text: decodeContext(scanAddr - 3, rom) });
        scanAddr -= 4;
        continue;
      }
      // Try 2-byte instruction
      if (scanAddr >= 1 && [0x3E, 0xFE, 0xE6, 0xF6, 0xEE, 0xC6, 0xD6, 0xCE, 0xDE, 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36].includes(rom[scanAddr - 1])) {
        preInstrs.unshift({ addr: scanAddr - 1, text: decodeContext(scanAddr - 1, rom) });
        scanAddr -= 2;
        continue;
      }
      // Try 1-byte instruction
      if (SIMPLE_OPCODES[rom[scanAddr]]) {
        preInstrs.unshift({ addr: scanAddr, text: decodeContext(scanAddr, rom) });
        scanAddr -= 1;
        continue;
      }
      scanAddr--;
    }

    for (const pi of preInstrs) {
      console.log(`    ${hex(pi.addr)}:   ${pi.text}`);
    }
    console.log(`    ${instrAddr}: > ${h.pat.mnemonic}`);

    // Decode 2 instructions after
    let postAddr = h.addr + h.pat.bytes.length;
    for (let i = 0; i < 2 && postAddr < rom.length; i++) {
      const text = decodeContext(postAddr, rom);
      console.log(`    ${hex(postAddr)}:   ${text}`);
      // Advance past instruction
      const b = rom[postAddr];
      if ([0x01, 0x11, 0x21, 0x31, 0x22, 0x2A, 0x32, 0x3A, 0xCD, 0xC3, 0xC2, 0xCA, 0xD2, 0xDA].includes(b)) {
        postAddr += 4;
      } else if ([0x3E, 0xFE, 0xE6, 0xF6, 0xEE, 0xC6, 0xD6, 0xCE, 0xDE, 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36].includes(b)) {
        postAddr += 2;
      } else {
        postAddr += 1;
      }
    }
    console.log();
  }
}

printHits('D02661 WRITES', d1Writes);
printHits('D02661 READS', d1Reads);
printHits('D02661 REFS (register loads)', d1Refs);
printHits('D02662 WRITES', d2Writes);
printHits('D02662 READS', d2Reads);
printHits('D02662 REFS (register loads)', d2Refs);

// --- Key question: what sets D02662 to 0x03? ---
console.log('=== Analysis: What sets D02662 to 0x03? ===');
for (const h of d2Writes) {
  // For LD (D02662),A — check if preceding instruction is LD A,0x03
  if (h.pat.bytes[0] === 0x32) {
    // Check for LD A,0x03 immediately before (bytes: 3E 03)
    if (h.addr >= 2 && rom[h.addr - 2] === 0x3E && rom[h.addr - 1] === 0x03) {
      console.log(`  ** ${hex(h.addr - 2)}: LD A,0x03 then LD (0xD02662),A — SETS D02662=0x03`);
    } else if (h.addr >= 2 && rom[h.addr - 2] === 0x3E) {
      console.log(`  .. ${hex(h.addr - 2)}: LD A,0x${hexByte(rom[h.addr - 1])} then LD (0xD02662),A — sets D02662=0x${hexByte(rom[h.addr - 1])}`);
    } else {
      console.log(`  ?? ${hex(h.addr)}: LD (0xD02662),A — value in A unknown from static scan`);
    }
  }
  if (h.pat.bytes[0] === 0x22) {
    console.log(`  ?? ${hex(h.addr)}: LD (0xD02662),HL — multi-byte write, value in HL unknown`);
  }
}

// Also check: what sets D02661 to 0x83?
console.log();
console.log('=== Analysis: What sets D02661 to 0x83? ===');
for (const h of d1Writes) {
  if (h.pat.bytes[0] === 0x32) {
    if (h.addr >= 2 && rom[h.addr - 2] === 0x3E && rom[h.addr - 1] === 0x83) {
      console.log(`  ** ${hex(h.addr - 2)}: LD A,0x83 then LD (0xD02661),A — SETS D02661=0x83`);
    } else if (h.addr >= 2 && rom[h.addr - 2] === 0x3E) {
      console.log(`  .. ${hex(h.addr - 2)}: LD A,0x${hexByte(rom[h.addr - 1])} then LD (0xD02661),A — sets D02661=0x${hexByte(rom[h.addr - 1])}`);
    } else {
      console.log(`  ?? ${hex(h.addr)}: LD (0xD02661),A — value in A unknown from static scan`);
    }
  }
  if (h.pat.bytes[0] === 0x22) {
    console.log(`  ?? ${hex(h.addr)}: LD (0xD02661),HL — multi-byte write, value in HL unknown`);
  }
}

console.log();
console.log('=== Done ===');
