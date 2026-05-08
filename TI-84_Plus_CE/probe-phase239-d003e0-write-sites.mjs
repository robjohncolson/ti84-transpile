#!/usr/bin/env node

/**
 * probe-phase239-d003e0-write-sites.mjs
 *
 * Comprehensive static binary scan of ROM.rom for ALL instructions that
 * could read, write, or reference address 0xD003E0.
 *
 * D003E0 is a critical mode/context byte in TI-OS RAM. On the home screen
 * D003E0=0x00. Specific bits (especially BIT 3 and BIT 4) activate
 * alternate code paths from 0x04EDD0 (the shared post-classification handler).
 *
 * Search strategy:
 *   1. Find every occurrence of the 3-byte pattern E0 03 D0 in the ROM
 *   2. Classify each hit by examining the opcode context
 *   3. Special attention to indirect access via LD HL,D003E0 followed by
 *      store/SET/RES instructions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

const TARGET_ADDR = 0xD003E0;
const TARGET_LO  = TARGET_ADDR & 0xFF;          // 0xE0
const TARGET_MID = (TARGET_ADDR >>> 8) & 0xFF;  // 0x03
const TARGET_HI  = (TARGET_ADDR >>> 16) & 0xFF; // 0xD0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page <= 0x03) return 'OS-low (00-03xxxx)';
  if (page === 0x04) return 'OS-core (04xxxx)';
  if (page === 0x05) return 'OS-mid (05xxxx)';
  if (page === 0x06) return 'Editor (06xxxx)';
  if (page === 0x07) return 'OS-07 (07xxxx)';
  if (page === 0x08) return 'UI/menu (08xxxx)';
  if (page === 0x09) return 'STAT (09xxxx)';
  if (page >= 0x0A) return `Apps (${hex(page, 2)}xxxx)`;
  return `Unknown (${hex(page, 2)}xxxx)`;
}

function formatBytes(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    if (addr >= 0 && addr < ROM_SIZE) {
      parts.push(rom[addr].toString(16).padStart(2, '0'));
    } else {
      parts.push('??');
    }
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Opcode classification tables
// ---------------------------------------------------------------------------

// SET n,(HL) = CB C6/CE/D6/DE/E6/EE/F6/FE  (bit = (opcode - 0xC6) / 8)
// RES n,(HL) = CB 86/8E/96/9E/A6/AE/B6/BE  (bit = (opcode - 0x86) / 8)
// BIT n,(HL) = CB 46/4E/56/5E/66/6E/76/7E  (bit = (opcode - 0x46) / 8)

const SET_HL_OPCODES = [0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE];
const RES_HL_OPCODES = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
const BIT_HL_OPCODES = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x76, 0x7E];

function bitNumber(opcode, base) {
  return (opcode - base) >>> 3;
}

// ---------------------------------------------------------------------------
// Step 1: Scan for all occurrences of E0 03 D0 in the ROM
// ---------------------------------------------------------------------------

console.log('=== Phase 239: D003E0 Reference Sites (Comprehensive Scan) ===\n');
console.log(`Scanning ${(ROM_SIZE / 1024 / 1024).toFixed(1)} MB ROM for byte pattern E0 03 D0 ...\n`);

const allHits = [];

for (let i = 0; i < ROM_SIZE - 2; i++) {
  if (rom[i] === TARGET_LO && rom[i + 1] === TARGET_MID && rom[i + 2] === TARGET_HI) {
    allHits.push(i);
  }
}

console.log(`Found ${allHits.length} raw occurrences of E0 03 D0.\n`);

// ---------------------------------------------------------------------------
// Step 2: Classify each hit
// ---------------------------------------------------------------------------

const classified = [];

for (const matchOffset of allHits) {
  // The 3-byte address pattern starts at matchOffset.
  // The opcode that uses this address is typically 1-2 bytes before.
  // We check several patterns:

  let type = 'UNKNOWN';
  let detail = '';
  let instrStart = matchOffset; // will be adjusted

  // --- Pattern: LD (nn),A  =>  32 E0 03 D0  (Z80 short) ---
  if (matchOffset >= 1 && rom[matchOffset - 1] === 0x32) {
    type = 'WRITE';
    detail = 'LD (D003E0),A  [z80 short]';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: ED 32 E0 03 D0 00  (ADL LD (nn),A with 4-byte addr) ---
  // Actually in ADL: LD (nn),A = 32 E0 03 D0 (4 bytes, addr is 3 bytes)
  // With ED prefix: ED could mean extended. Check ED xx patterns.
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x32) {
    // ED 32 nn nn nn — some eZ80 extended LD (nn),A
    type = 'WRITE';
    detail = 'ED LD (D003E0),A  [extended]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD A,(nn)  =>  3A E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x3A) {
    type = 'READ';
    detail = 'LD A,(D003E0)';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: ED 3A (extended LD A,(nn)) ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x3A) {
    type = 'READ';
    detail = 'ED LD A,(D003E0)  [extended]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD HL,nn  =>  21 E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x21) {
    type = 'LD-HL';
    detail = 'LD HL,D003E0';
    instrStart = matchOffset - 1;

    // Look ahead up to 20 bytes for store/SET/RES/BIT instructions
    const lookAhead = Math.min(20, ROM_SIZE - (matchOffset + 3));
    const followOps = [];

    for (let j = 0; j < lookAhead; j++) {
      const off = matchOffset + 3 + j;
      const b = rom[off];

      if (b === 0x77) {
        followOps.push({ offset: off, op: 'LD (HL),A', type: 'WRITE-INDIRECT' });
      }
      if (b === 0x36 && off + 1 < ROM_SIZE) {
        followOps.push({ offset: off, op: `LD (HL),${hexByte(rom[off + 1])}`, type: 'WRITE-INDIRECT' });
      }
      if (b === 0xCB && off + 1 < ROM_SIZE) {
        const cb2 = rom[off + 1];
        if (SET_HL_OPCODES.includes(cb2)) {
          followOps.push({ offset: off, op: `SET ${bitNumber(cb2, 0xC6)},(HL)`, type: 'SET' });
        }
        if (RES_HL_OPCODES.includes(cb2)) {
          followOps.push({ offset: off, op: `RES ${bitNumber(cb2, 0x86)},(HL)`, type: 'RES' });
        }
        if (BIT_HL_OPCODES.includes(cb2)) {
          followOps.push({ offset: off, op: `BIT ${bitNumber(cb2, 0x46)},(HL)`, type: 'BIT-TEST' });
        }
      }
      // LD (HL),r for r != A: 70-76 (but 76 is HALT)
      if (b >= 0x70 && b <= 0x75) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L'];
        followOps.push({ offset: off, op: `LD (HL),${regs[b - 0x70]}`, type: 'WRITE-INDIRECT' });
      }
      // INC (HL) = 0x34, DEC (HL) = 0x35
      if (b === 0x34) {
        followOps.push({ offset: off, op: 'INC (HL)', type: 'WRITE-INDIRECT' });
      }
      if (b === 0x35) {
        followOps.push({ offset: off, op: 'DEC (HL)', type: 'WRITE-INDIRECT' });
      }
      // Stop if we hit a jump/call/ret that would change HL semantics
      if (b === 0xC3 || b === 0xCD || b === 0xC9 || b === 0xC0 || b === 0xC8 ||
          b === 0xD0 || b === 0xD8 || b === 0xE0 || b === 0xE8 || b === 0xF0 || b === 0xF8 ||
          b === 0x18 || b === 0x20 || b === 0x28 || b === 0x30 || b === 0x38) {
        break;
      }
      // Also stop if HL is reloaded
      if (b === 0x21) break;
    }

    if (followOps.length > 0) {
      const writeOps = followOps.filter(o => o.type !== 'BIT-TEST');
      if (writeOps.length > 0) {
        type = 'WRITE-VIA-HL';
      } else {
        type = 'READ-VIA-HL';
      }
      detail += ' -> ' + followOps.map(o => `${o.op} @${hex(o.offset)}`).join(', ');
    }
  }
  // --- Pattern: LD DE,nn  =>  11 E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x11) {
    type = 'LD-DE';
    detail = 'LD DE,D003E0  (pointer load)';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: LD BC,nn  =>  01 E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x01) {
    type = 'LD-BC';
    detail = 'LD BC,D003E0  (pointer load)';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: LD (nn),HL  =>  22 E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x22) {
    type = 'WRITE';
    detail = 'LD (D003E0),HL  [16/24-bit write]';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: LD HL,(nn)  =>  2A E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x2A) {
    type = 'READ';
    detail = 'LD HL,(D003E0)  [16/24-bit read]';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: LD (nn),DE => ED 53 E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x53) {
    type = 'WRITE';
    detail = 'LD (D003E0),DE  [extended]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD (nn),BC => ED 43 E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x43) {
    type = 'WRITE';
    detail = 'LD (D003E0),BC  [extended]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD (nn),SP => ED 73 E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x73) {
    type = 'WRITE';
    detail = 'LD (D003E0),SP  [extended]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD DE,(nn) => ED 5B E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x5B) {
    type = 'READ';
    detail = 'LD DE,(D003E0)  [extended read]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD BC,(nn) => ED 4B E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x4B) {
    type = 'READ';
    detail = 'LD BC,(D003E0)  [extended read]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: LD SP,(nn) => ED 7B E0 03 D0 ---
  else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED && rom[matchOffset - 1] === 0x7B) {
    type = 'READ';
    detail = 'LD SP,(D003E0)  [extended read]';
    instrStart = matchOffset - 2;
  }
  // --- Pattern: CALL nn  =>  CD E0 03 D0  (calling address D003E0 — unlikely but check) ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0xCD) {
    type = 'CALL';
    detail = 'CALL D003E0  (call to RAM address — unusual)';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: JP nn  =>  C3 E0 03 D0 ---
  else if (matchOffset >= 1 && rom[matchOffset - 1] === 0xC3) {
    type = 'JUMP';
    detail = 'JP D003E0  (jump to RAM address — unusual)';
    instrStart = matchOffset - 1;
  }
  // --- Pattern: JP cc,nn  =>  C2/CA/D2/DA/E2/EA/F2/FA E0 03 D0 ---
  else if (matchOffset >= 1) {
    const prev = rom[matchOffset - 1];
    if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(prev)) {
      const conditions = {
        0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
        0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M',
      };
      type = 'JUMP';
      detail = `JP ${conditions[prev]},D003E0  (conditional jump to RAM)`;
      instrStart = matchOffset - 1;
    }
    // CALL cc,nn => C4/CC/D4/DC/E4/EC/F4/FC
    else if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(prev)) {
      const conditions = {
        0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C',
        0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M',
      };
      type = 'CALL';
      detail = `CALL ${conditions[prev]},D003E0  (conditional call to RAM)`;
      instrStart = matchOffset - 1;
    }
  }

  // If still UNKNOWN, check if it might be a data pointer or part of another instruction
  if (type === 'UNKNOWN') {
    // Check if preceding byte is an IX/IY prefix (DD/FD) followed by something
    if (matchOffset >= 2 && (rom[matchOffset - 2] === 0xDD || rom[matchOffset - 2] === 0xFD)) {
      const prefix = rom[matchOffset - 2] === 0xDD ? 'IX' : 'IY';
      const op = rom[matchOffset - 1];
      if (op === 0x21) {
        type = `LD-${prefix}`;
        detail = `LD ${prefix},D003E0`;
        instrStart = matchOffset - 2;
      } else if (op === 0x22) {
        type = 'WRITE';
        detail = `LD (D003E0),${prefix}`;
        instrStart = matchOffset - 2;
      } else if (op === 0x2A) {
        type = 'READ';
        detail = `LD ${prefix},(D003E0)`;
        instrStart = matchOffset - 2;
      }
    }
    // Might be data — leave as UNKNOWN/POINTER
    if (type === 'UNKNOWN') {
      type = 'POINTER/DATA';
      detail = 'Unclassified — possibly data table or unrecognized instruction';
      instrStart = matchOffset;
    }
  }

  // Surrounding bytes for context
  const ctxBefore = Math.max(0, matchOffset - 8);
  const ctxAfter = Math.min(ROM_SIZE, matchOffset + 3 + 8);

  classified.push({
    patternOffset: matchOffset,
    instrStart,
    type,
    detail,
    region: regionLabel(instrStart),
    beforeBytes: formatBytes(rom, ctxBefore, matchOffset - ctxBefore),
    matchBytes: formatBytes(rom, matchOffset, 3),
    afterBytes: formatBytes(rom, matchOffset + 3, ctxAfter - (matchOffset + 3)),
  });
}

// ---------------------------------------------------------------------------
// Step 3: Output results
// ---------------------------------------------------------------------------

// Group by type
const typeGroups = {};
for (const hit of classified) {
  if (!typeGroups[hit.type]) typeGroups[hit.type] = [];
  typeGroups[hit.type].push(hit);
}

// Summary table
console.log('--- Summary by Type ---\n');
for (const [type, hits] of Object.entries(typeGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${type.padEnd(20)} ${String(hits.length).padStart(3)} hit(s)`);
}
console.log(`  ${'TOTAL'.padEnd(20)} ${String(classified.length).padStart(3)} hit(s)`);

// Detailed table
console.log('\n--- All D003E0 References ---\n');
console.log(
  'PatternOff'.padEnd(12) +
  'InstrAddr'.padEnd(12) +
  'Type'.padEnd(22) +
  'Region'.padEnd(25) +
  'Detail'
);
console.log('-'.repeat(120));

for (const hit of classified) {
  console.log(
    hex(hit.patternOffset).padEnd(12) +
    hex(hit.instrStart).padEnd(12) +
    hit.type.padEnd(22) +
    hit.region.padEnd(25) +
    hit.detail
  );
}

// Group by region
console.log('\n--- Region Groups ---\n');
const regionGroups = {};
for (const hit of classified) {
  if (!regionGroups[hit.region]) regionGroups[hit.region] = [];
  regionGroups[hit.region].push(hit);
}
for (const [region, hits] of Object.entries(regionGroups)) {
  console.log(`${region}: ${hits.length} hit(s)`);
  for (const h of hits) {
    console.log(`  ${hex(h.instrStart)}  ${h.type.padEnd(18)}  ${h.detail}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Step 4: WRITE-focused summary
// ---------------------------------------------------------------------------

const writeHits = classified.filter(h =>
  h.type === 'WRITE' ||
  h.type === 'WRITE-VIA-HL' ||
  h.type === 'SET' ||
  h.type === 'RES'
);

console.log('--- WRITE Sites Only (direct + indirect) ---\n');
if (writeHits.length === 0) {
  console.log('  No direct WRITE sites found beyond LD-HL indirect patterns.');
} else {
  for (const hit of writeHits) {
    console.log(`  ${hex(hit.instrStart)}  ${hit.type.padEnd(18)}  ${hit.detail}`);
  }
}
console.log('');

// Also show LD-HL sites that have SET/RES/WRITE in their follow-ups
const indirectWriteHits = classified.filter(h =>
  h.type === 'WRITE-VIA-HL' || (h.type === 'LD-HL' && h.detail.includes('SET'))
);
if (indirectWriteHits.length > 0) {
  console.log('--- Indirect Write via HL Sites (LD HL,D003E0 + store/SET/RES) ---\n');
  for (const hit of indirectWriteHits) {
    console.log(`  ${hex(hit.instrStart)}  ${hit.detail}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Step 5: Hex dump context for each hit
// ---------------------------------------------------------------------------

console.log('--- Hex Dump Context (8 bytes before | match | 8 bytes after) ---\n');
for (const hit of classified) {
  const marker = (hit.type.includes('WRITE') || hit.type === 'SET' || hit.type === 'RES') ? '>>>' : '   ';
  console.log(
    `${marker} ${hex(hit.patternOffset)}  [${hit.beforeBytes}] {${hit.matchBytes}} [${hit.afterBytes}]  ${hit.type}  ${hit.detail}`
  );
}

console.log('\n=== Probe complete ===');
