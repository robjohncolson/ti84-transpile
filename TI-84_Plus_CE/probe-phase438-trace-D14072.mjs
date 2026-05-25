#!/usr/bin/env node
/**
 * Phase 438 — Static ROM scan for all references to D14072 (USB speed/mode flag).
 *
 * Scans the 4 MB ROM for:
 *   - LD (D14072),A  (opcode 0x32 + LE addr 72 40 D1)
 *   - LD A,(D14072)  (opcode 0x3A + LE addr 72 40 D1)
 *   - Any raw 3-byte sequence 72 40 D1 (catches other instruction forms)
 *   - IX-based references where IX is loaded near D14070 (offset +2)
 *
 * Also checks whether D141E6 write sites cross-reference D14072,
 * and whether functions access both D14072 and D14073/D14074.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);

const rom = fs.readFileSync(romPath);
const ROM_SIZE = rom.length; // 4,194,304

// Target address in little-endian
const TARGET_LE = [0x72, 0x40, 0xD1];

// Related addresses (little-endian)
const D14073_LE = [0x73, 0x40, 0xD1];
const D14074_LE = [0x74, 0x40, 0xD1];
const D14070_LE = [0x70, 0x40, 0xD1];
const D141E6_LE = [0xE6, 0x41, 0xD1];

// D141E6 write sites from session 429
const D141E6_SITES = [0x00DD61, 0x00DDF9, 0x03AB82, 0x03AC1A];

// Helpers
function hexDump(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    if (addr >= 0 && addr < buf.length) {
      bytes.push(buf[addr].toString(16).padStart(2, '0'));
    } else {
      bytes.push('??');
    }
  }
  return bytes.join(' ');
}

function matchesLE(buf, offset, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (buf[offset + i] !== pattern[i]) return false;
  }
  return true;
}

// eZ80 opcode classification for the byte before the 3-byte address
function classifyOpcode(opByte, prevByte) {
  // Direct loads
  if (opByte === 0x32) return { type: 'WRITE', mnemonic: 'LD (D14072),A' };
  if (opByte === 0x3A) return { type: 'READ', mnemonic: 'LD A,(D14072)' };

  // 16-bit register loads: LD rr,(nn)  — ED-prefixed
  if (prevByte === 0xED) {
    const regMap = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
    if (regMap[opByte]) return { type: 'READ', mnemonic: `LD ${regMap[opByte]},(D14072)` };
    const regMapW = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
    if (regMapW[opByte]) return { type: 'WRITE', mnemonic: `LD (D14072),${regMapW[opByte]}` };
  }

  // LD HL,(nn) — non-prefixed
  if (opByte === 0x2A) return { type: 'READ', mnemonic: 'LD HL,(D14072)' };
  // LD (nn),HL — non-prefixed
  if (opByte === 0x22) return { type: 'WRITE', mnemonic: 'LD (D14072),HL' };

  // CALL nn / JP nn / JP cc,nn
  if (opByte === 0xCD) return { type: 'CALL', mnemonic: 'CALL D14072' };
  if (opByte === 0xC3) return { type: 'JUMP', mnemonic: 'JP D14072' };
  const jpConds = {
    0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
    0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M'
  };
  if (jpConds[opByte]) return { type: 'JUMP', mnemonic: `JP ${jpConds[opByte]},D14072` };

  // LD (nn),A via other forms unlikely but catch
  return { type: 'UNKNOWN', mnemonic: `?? (opcode 0x${opByte.toString(16).padStart(2, '0')})` };
}

// ---- SCAN 1: Raw 3-byte pattern scan ----
console.log('=== Phase 438: D14072 Reference Scan ===\n');

const rawRefs = [];
for (let i = 0; i <= ROM_SIZE - 3; i++) {
  if (matchesLE(rom, i, TARGET_LE)) {
    rawRefs.push(i);
  }
}

console.log(`Raw 3-byte pattern (72 40 D1) found at ${rawRefs.length} positions.\n`);

// Classify each reference
const classified = [];
for (const pos of rawRefs) {
  const opcodePos = pos - 1;
  const opByte = opcodePos >= 0 ? rom[opcodePos] : 0x00;
  const prevByte = opcodePos >= 1 ? rom[opcodePos - 1] : 0x00;
  const info = classifyOpcode(opByte, prevByte);

  // For ED-prefixed instructions, the actual instruction starts 2 bytes before the address
  let instrAddr = opcodePos;
  if (prevByte === 0xED && (info.type === 'READ' || info.type === 'WRITE') && info.mnemonic.includes('(D14072)')) {
    instrAddr = opcodePos - 1;
  }

  const contextStart = Math.max(0, instrAddr - 4);
  const contextLen = Math.min(24, ROM_SIZE - contextStart);

  classified.push({
    addrOfPattern: pos,
    instrAddr,
    opByte,
    prevByte,
    ...info,
    context: hexDump(rom, contextStart, contextLen),
    contextStart,
  });
}

// Print classified references
console.log('--- Classified References ---\n');
const writes = [];
const reads = [];
const others = [];

for (const ref of classified) {
  const label = `0x${ref.instrAddr.toString(16).padStart(6, '0')}`;
  const line = `  ${label}: ${ref.mnemonic.padEnd(28)} [${ref.type}]  context @ 0x${ref.contextStart.toString(16).padStart(6, '0')}: ${ref.context}`;
  console.log(line);

  if (ref.type === 'WRITE') writes.push(ref);
  else if (ref.type === 'READ') reads.push(ref);
  else others.push(ref);
}

console.log(`\nWrites: ${writes.length}  Reads: ${reads.length}  Other: ${others.length}\n`);

// ---- SCAN 2: IX-based references (IX loaded near D14070, offset +2) ----
console.log('--- IX-Based References (IX near D14070, offset +2) ---\n');

// Look for LD IX,D14070 (DD 21 70 40 D1) then nearby (IX+2) references
// DD 21 xx xx xx = LD IX,nnnn
const ixLoadSites = [];
for (let i = 0; i <= ROM_SIZE - 5; i++) {
  if (rom[i] === 0xDD && rom[i + 1] === 0x21 && matchesLE(rom, i + 2, D14070_LE)) {
    ixLoadSites.push(i);
  }
}

console.log(`LD IX,D14070 found at ${ixLoadSites.length} sites.`);
for (const site of ixLoadSites) {
  console.log(`  0x${site.toString(16).padStart(6, '0')}: ${hexDump(rom, site, 10)}`);
  // Search nearby for (IX+2) references: DD 76+op 02
  // (IX+d) forms: DD opcode displacement
  const searchStart = site;
  const searchEnd = Math.min(site + 256, ROM_SIZE - 3);
  for (let j = searchStart; j < searchEnd; j++) {
    if (rom[j] === 0xDD && rom[j + 2] === 0x02) {
      const op = rom[j + 1];
      // Common IX+d opcodes: LD r,(IX+d), LD (IX+d),r, etc.
      const ixOps = {
        0x46: 'LD B,(IX+2)', 0x4E: 'LD C,(IX+2)', 0x56: 'LD D,(IX+2)',
        0x5E: 'LD E,(IX+2)', 0x66: 'LD H,(IX+2)', 0x6E: 'LD L,(IX+2)',
        0x7E: 'LD A,(IX+2)',
        0x70: 'LD (IX+2),B', 0x71: 'LD (IX+2),C', 0x72: 'LD (IX+2),D',
        0x73: 'LD (IX+2),E', 0x74: 'LD (IX+2),H', 0x75: 'LD (IX+2),L',
        0x77: 'LD (IX+2),A',
        0x36: 'LD (IX+2),n',
        0xBE: 'CP (IX+2)', 0x86: 'ADD A,(IX+2)', 0x96: 'SUB (IX+2)',
        0xA6: 'AND (IX+2)', 0xB6: 'OR (IX+2)', 0xAE: 'XOR (IX+2)',
        0xCB: 'BIT/SET/RES (IX+2)',
      };
      if (ixOps[op]) {
        console.log(`    IX+2 ref at 0x${j.toString(16).padStart(6, '0')}: ${ixOps[op]}  context: ${hexDump(rom, j, 8)}`);
      }
    }
  }
}

// Also check LD IX,D14072 directly
const ixD14072Sites = [];
for (let i = 0; i <= ROM_SIZE - 5; i++) {
  if (rom[i] === 0xDD && rom[i + 1] === 0x21 && matchesLE(rom, i + 2, TARGET_LE)) {
    ixD14072Sites.push(i);
  }
}
if (ixD14072Sites.length > 0) {
  console.log(`\nLD IX,D14072 found at ${ixD14072Sites.length} sites.`);
  for (const site of ixD14072Sites) {
    console.log(`  0x${site.toString(16).padStart(6, '0')}: ${hexDump(rom, site, 10)}`);
  }
}

// ---- SCAN 3: D141E6 write sites cross-referencing D14072 ----
console.log('\n--- D141E6 Write Sites Cross-Reference Check ---\n');

for (const site of D141E6_SITES) {
  // Search a window around each D141E6 write site for D14072 references
  const windowStart = Math.max(0, site - 64);
  const windowEnd = Math.min(ROM_SIZE - 3, site + 256);
  let found = false;
  for (let i = windowStart; i <= windowEnd; i++) {
    if (matchesLE(rom, i, TARGET_LE)) {
      const opcodePos = i - 1;
      const opByte = opcodePos >= 0 ? rom[opcodePos] : 0x00;
      const prevByte = opcodePos >= 1 ? rom[opcodePos - 1] : 0x00;
      const info = classifyOpcode(opByte, prevByte);
      console.log(`  D141E6 site 0x${site.toString(16).padStart(6, '0')}: D14072 ref at 0x${i.toString(16).padStart(6, '0')} — ${info.mnemonic} [${info.type}]`);
      console.log(`    context: ${hexDump(rom, Math.max(0, i - 4), 20)}`);
      found = true;
    }
  }
  if (!found) {
    console.log(`  D141E6 site 0x${site.toString(16).padStart(6, '0')}: no D14072 reference within +/-64..+256 bytes`);
  }
}

// ---- SCAN 4: Functions that access both D14072 and D14073 or D14074 ----
console.log('\n--- Co-Access Analysis: D14072 + D14073/D14074 ---\n');

// For each D14072 reference, search nearby for D14073/D14074 references
for (const ref of classified) {
  const windowStart = Math.max(0, ref.instrAddr - 128);
  const windowEnd = Math.min(ROM_SIZE - 3, ref.instrAddr + 256);
  const coRefs = [];

  for (let i = windowStart; i <= windowEnd; i++) {
    if (matchesLE(rom, i, D14073_LE)) {
      const op = i >= 1 ? rom[i - 1] : 0x00;
      coRefs.push({ addr: i, target: 'D14073', opByte: op });
    }
    if (matchesLE(rom, i, D14074_LE)) {
      const op = i >= 1 ? rom[i - 1] : 0x00;
      coRefs.push({ addr: i, target: 'D14074', opByte: op });
    }
  }

  if (coRefs.length > 0) {
    console.log(`  Near D14072 ref at 0x${ref.instrAddr.toString(16).padStart(6, '0')} (${ref.mnemonic}):`);
    for (const cr of coRefs) {
      const info = classifyOpcode(cr.opByte, cr.addr >= 2 ? rom[cr.addr - 2] : 0x00);
      console.log(`    ${cr.target} at 0x${cr.addr.toString(16).padStart(6, '0')}: ${info.mnemonic.replace('D14072', cr.target)} [${info.type}]`);
    }
  }
}

// ---- SCAN 5: Value analysis for writes ----
console.log('\n--- Write Value Analysis ---\n');

for (const w of writes) {
  // For LD (D14072),A — what was loaded into A before?
  // Look back a few bytes for LD A,n (3E nn) or XOR A (AF) or OR A (B7)
  const lookback = 16;
  const start = Math.max(0, w.instrAddr - lookback);
  let valueInfo = 'unknown';

  for (let i = w.instrAddr - 1; i >= start; i--) {
    if (rom[i] === 0x3E && i + 1 < ROM_SIZE) {
      valueInfo = `A loaded with 0x${rom[i + 1].toString(16).padStart(2, '0')} (LD A,${rom[i + 1].toString(16).padStart(2, '0')}h)`;
      break;
    }
    if (rom[i] === 0xAF) {
      valueInfo = 'A = 0 (XOR A)';
      break;
    }
    if (rom[i] === 0x97) {
      valueInfo = 'A = 0 (SUB A)';
      break;
    }
    // LD A,(HL) = 0x7E, LD A,r, etc. — harder to determine statically
    if (rom[i] === 0x7E) {
      valueInfo = 'A = (HL) — value from memory';
      break;
    }
    if (rom[i] === 0x3A) {
      // LD A,(nn) — value from another address
      if (i + 3 < ROM_SIZE) {
        const srcAddr = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
        valueInfo = `A = (0x${srcAddr.toString(16).padStart(6, '0')}) — value from memory`;
      }
      break;
    }
    // Check for INC A / DEC A
    if (rom[i] === 0x3C) { valueInfo = 'A incremented (INC A)'; break; }
    if (rom[i] === 0x3D) { valueInfo = 'A decremented (DEC A)'; break; }
    // AND n
    if (rom[i] === 0xE6 && i + 1 < ROM_SIZE) {
      valueInfo = `A &= 0x${rom[i + 1].toString(16).padStart(2, '0')} (AND ${rom[i + 1].toString(16).padStart(2, '0')}h)`;
      break;
    }
    // OR n
    if (rom[i] === 0xF6 && i + 1 < ROM_SIZE) {
      valueInfo = `A |= 0x${rom[i + 1].toString(16).padStart(2, '0')} (OR ${rom[i + 1].toString(16).padStart(2, '0')}h)`;
      break;
    }
  }

  console.log(`  0x${w.instrAddr.toString(16).padStart(6, '0')}: ${w.mnemonic} — value: ${valueInfo}`);
  console.log(`    preceding bytes: ${hexDump(rom, Math.max(0, w.instrAddr - lookback), lookback)}`);
}

// ---- SCAN 6: Read comparison analysis ----
console.log('\n--- Read Comparison Analysis ---\n');

for (const r of reads) {
  // After LD A,(D14072), look for CP, AND, OR, BIT, etc.
  const instrLen = r.mnemonic.startsWith('LD A,') ? 4 : 4;
  const lookAhead = 16;
  const afterAddr = r.instrAddr + instrLen;
  let compInfo = 'no immediate comparison found';

  for (let i = afterAddr; i < Math.min(afterAddr + lookAhead, ROM_SIZE); i++) {
    // CP n
    if (rom[i] === 0xFE && i + 1 < ROM_SIZE) {
      compInfo = `CP 0x${rom[i + 1].toString(16).padStart(2, '0')} — compared against ${rom[i + 1]}`;
      break;
    }
    // CP r
    if (rom[i] >= 0xB8 && rom[i] <= 0xBF && rom[i] !== 0xBE) {
      const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      compInfo = `CP ${regs[rom[i] - 0xB8]}`;
      break;
    }
    // AND n
    if (rom[i] === 0xE6 && i + 1 < ROM_SIZE) {
      compInfo = `AND 0x${rom[i + 1].toString(16).padStart(2, '0')} — mask test`;
      break;
    }
    // OR A (test zero)
    if (rom[i] === 0xB7) {
      compInfo = 'OR A — zero test';
      break;
    }
    // BIT n,A (CB 47/4F/57/5F/67/6F/77/7F)
    if (rom[i] === 0xCB && i + 1 < ROM_SIZE) {
      const bitOp = rom[i + 1];
      if ((bitOp & 0xC7) === 0x47) {
        const bitNum = (bitOp >> 3) & 7;
        compInfo = `BIT ${bitNum},A — testing bit ${bitNum}`;
        break;
      }
    }
    // Conditional jump right after load (no comparison = implicit flag test)
    if ((rom[i] & 0xE7) === 0x20 || (rom[i] & 0xE7) === 0xC2) {
      // JR cc or JP cc — implicit test
      break;
    }
  }

  console.log(`  0x${r.instrAddr.toString(16).padStart(6, '0')}: ${r.mnemonic} — ${compInfo}`);
  console.log(`    following bytes: ${hexDump(rom, afterAddr, lookAhead)}`);
}

// ---- SCAN 7: D141E6 references for context ----
console.log('\n--- D141E6 Reference Count ---\n');

let d141e6Count = 0;
for (let i = 0; i <= ROM_SIZE - 3; i++) {
  if (matchesLE(rom, i, D141E6_LE)) d141e6Count++;
}
console.log(`D141E6 raw pattern count: ${d141e6Count}`);

// ---- Summary ----
console.log('\n=== SUMMARY ===');
console.log(`Total raw pattern matches: ${rawRefs.length}`);
console.log(`  Writes (LD (D14072),A etc): ${writes.length}`);
console.log(`  Reads  (LD A,(D14072) etc): ${reads.length}`);
console.log(`  Other/CALL/JP: ${others.length}`);
console.log(`IX-based D14070 load sites: ${ixLoadSites.length}`);
console.log(`LD IX,D14072 sites: ${ixD14072Sites.length}`);

console.log('\nDone.');
