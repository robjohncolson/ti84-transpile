#!/usr/bin/env node

/**
 * Phase 366: Trace linked-list init for 0xD14095-0xD14097.
 *
 * At 0x00BC47 the OS reads (IX-30) as a 24-bit pointer for linked-list
 * traversal.  When 0xD14095-0xD14097 are interpreted as a pointer the
 * value is 0x010000 (because 0x00B71B sets them as independent flags:
 * 0xD14095=0x00, 0xD14096=0x00, 0xD14097=0x01).  This corrupts SP at
 * 0x00BC72.
 *
 * This probe:
 *   1. Scans ROM for all references to 0xD14095, 0xD14096, 0xD14097.
 *   2. Disassembles 20 instructions at 0x05D4BB (the sole 0xD14096 ref).
 *   3. Checks whether 0x05D4BB appears in any seed file.
 *   4. Computes the IX value that would make (IX-30) = 0xD14095.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase366-linked-list-init.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(buffer, start, length) {
  const safeStart = start & 0xFFFFFF;
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.subarray(safeStart, safeEnd), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const mp = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${mp}NOP`;
    case 'di': return `${mp}DI`;
    case 'ei': return `${mp}EI`;
    case 'ret': return `${mp}RET`;
    case 'reti': return `${mp}RETI`;
    case 'retn': return `${mp}RETN`;
    case 'ret-conditional': return `${mp}RET ${String(inst.condition).toUpperCase()}`;
    case 'call': return `${mp}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${mp}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${mp}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${mp}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${mp}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${mp}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${mp}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `${mp}RST ${hex(inst.target ?? 0, 2)}`;
    case 'push': return `${mp}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${mp}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${mp}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-sp-hl': return `${mp}LD SP, HL`;
    case 'ld-sp-pair': return `${mp}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-reg':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-ind':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${mp}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-reg':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-imm':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'ld-indexed-pair':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${mp}LD ${String(inst.pair).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-ixiy':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'lea':
      return `${mp}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${signedDisp(inst.displacement)}`;
    case 'add-pair':
      return `${mp}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${mp}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${mp}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'ex-sp-hl': return `${mp}EX (SP), HL`;
    case 'ex-sp-pair': return `${mp}EX (SP), ${String(inst.pair).toUpperCase()}`;
    case 'ex-de-hl': return `${mp}EX DE, HL`;
    case 'ex-af': return `${mp}EX AF, AF'`;
    case 'ld-mem-a': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD (${hex(addr)}), A`;
    }
    case 'ld-a-mem': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD A, (${hex(addr)})`;
    }
    case 'ld-mem-pair': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD (${hex(addr)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-pair-mem': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD ${String(inst.pair).toUpperCase()}, (${hex(addr)})`;
    }
    default: {
      const extras = Object.entries(inst)
        .filter(([key]) => !['tag', 'pc', 'nextPc', 'length', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key))
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value, value > 0xFF ? 6 : 2) : String(value)}`)
        .join(' ');
      return `${mp}${extras ? `${inst.tag} ${extras}` : inst.tag}`;
    }
  }
}

function disassembleWindow(romBytes, startPc, maxInstructions, mode = 'adl') {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < maxInstructions && pc < romBytes.length; i++) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: inst ? formatInstruction(inst) : `DB ${hb(romBytes[pc])}`,
      inst,
    });
    pc += length;
  }

  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// ROM byte pattern search
// ---------------------------------------------------------------------------

function searchPattern(romBytes, pattern, maxAddr = 0x400000) {
  const results = [];
  const limit = Math.min(romBytes.length, maxAddr) - pattern.length;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (romBytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      results.push(i);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const rom = fs.readFileSync(ROM_PATH);

console.log('='.repeat(72));
console.log('Phase 366: Trace linked-list init for 0xD14095-0xD14097');
console.log('='.repeat(72));
console.log('');

// ---- Part 1: Scan ROM for references to 0xD14095, 0xD14096, 0xD14097 ----

console.log('PART 1: ROM references to 0xD14095, 0xD14096, 0xD14097');
console.log('='.repeat(56));
console.log('');

const targets = [
  { addr: 0xD14095, pattern: [0x95, 0x40, 0xD1] },
  { addr: 0xD14096, pattern: [0x96, 0x40, 0xD1] },
  { addr: 0xD14097, pattern: [0x97, 0x40, 0xD1] },
];

for (const { addr, pattern } of targets) {
  const hits = searchPattern(rom, pattern);
  console.log(`References to ${hex(addr)} (pattern ${pattern.map(b => hb(b)).join(' ')}):`);
  if (hits.length === 0) {
    console.log('  (none found)');
  } else {
    console.log(`  ${hits.length} hit(s):`);
    for (const hitAddr of hits) {
      // Show context: 4 bytes before, the match, 6 bytes after
      const contextBefore = Math.max(0, hitAddr - 4);
      const contextAfter = Math.min(rom.length, hitAddr + pattern.length + 6);
      const contextLen = contextAfter - contextBefore;
      console.log(`  ${hex(hitAddr)}  context: ${bytesAt(rom, contextBefore, contextLen)}`);

      // Try to disassemble a few instructions around the hit
      // Walk back to find a plausible instruction boundary
      const disasmStart = Math.max(0, hitAddr - 6);
      const disRows = disassembleWindow(rom, disasmStart, 6);
      for (const row of disRows) {
        const marker = (row.pc <= hitAddr && hitAddr < row.pc + (row.inst?.length ?? 1)) ? ' <<<' : '';
        console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${marker}`);
      }
      console.log('');
    }
  }
  console.log('');
}

// ---- Part 2: Disassemble 20 instructions at 0x05D4BB ----

console.log('PART 2: Disassembly at 0x05D4BB (sole 0xD14096 reference)');
console.log('='.repeat(58));
console.log('');

const d4bbRows = disassembleWindow(rom, 0x05D4BB, 20);
printDisassembly('0x05D4BB — 20 instructions:', d4bbRows);

// Also show a few instructions before 0x05D4BB to get function entry context
const preRows = disassembleWindow(rom, Math.max(0, 0x05D4BB - 20), 10);
printDisassembly('Context before 0x05D4BB (approx):', preRows);

// ---- Part 3: Check if 0x05D4BB is in seed files ----

console.log('PART 3: Is 0x05D4BB in any seed file?');
console.log('='.repeat(38));
console.log('');

const seedFiles = fs.readdirSync(__dirname)
  .filter(f => f.includes('seed') && f.endsWith('.txt'));

let foundInSeed = false;
for (const seedFile of seedFiles) {
  const content = fs.readFileSync(path.join(__dirname, seedFile), 'utf-8');
  // Check for the address in various formats
  const patterns = ['0x05D4BB', '0x5D4BB', '05D4BB', '5D4BB'];
  for (const pat of patterns) {
    if (content.toUpperCase().includes(pat.toUpperCase())) {
      console.log(`  FOUND in ${seedFile} (matched "${pat}")`);
      foundInSeed = true;
    }
  }
}

if (!foundInSeed) {
  console.log('  NOT found in any seed file.');
  console.log('  Seed files checked:');
  for (const f of seedFiles) {
    console.log(`    ${f}`);
  }
}
console.log('');

// Also check the main transpile seeds in phase200-seeds.txt specifically
const phase200Path = path.join(__dirname, 'phase200-seeds.txt');
if (fs.existsSync(phase200Path)) {
  const p200 = fs.readFileSync(phase200Path, 'utf-8');
  const has05D4BB = p200.toUpperCase().includes('05D4BB');
  console.log(`  phase200-seeds.txt specifically: ${has05D4BB ? 'CONTAINS' : 'does NOT contain'} 0x05D4BB`);
}
console.log('');

// ---- Part 4: IX value analysis ----

console.log('PART 4: IX value analysis for (IX-30) = 0xD14095');
console.log('='.repeat(50));
console.log('');

const targetAddr = 0xD14095;
const displacement = -30; // (IX-30) used at 0x00BC47
const requiredIX = targetAddr - displacement; // IX = target + 30

console.log(`At 0x00BC47, the OS reads (IX${displacement}) as a 24-bit pointer.`);
console.log(`For (IX${displacement}) to point at 0xD14095:`);
console.log(`  IX = 0xD14095 - (${displacement}) = 0xD14095 + 30 = ${hex(requiredIX)}`);
console.log('');

// Also compute for the known home-screen IX value
const homeScreenIX = 0xD1A860;
const homeScreenDeref = homeScreenIX + displacement;
console.log(`For comparison, home-screen IX = ${hex(homeScreenIX)}:`);
console.log(`  (IX${displacement}) = ${hex(homeScreenIX)} + (${displacement}) = ${hex(homeScreenDeref)}`);
console.log(`  This reads from ${hex(homeScreenDeref)}, NOT from 0xD14095.`);
console.log('');

// Check what bytes are at the derived IX offset region
console.log(`Bytes at ${hex(requiredIX)} (the IX value itself):  -- this is in RAM, not ROM`);
console.log(`  (RAM region, not visible in ROM dump)`);
console.log('');

// Scan ROM for references to the computed IX value (0xD140B3)
const ixPattern = [requiredIX & 0xFF, (requiredIX >> 8) & 0xFF, (requiredIX >> 16) & 0xFF];
const ixHits = searchPattern(rom, ixPattern);
console.log(`ROM references to ${hex(requiredIX)} (pattern ${ixPattern.map(b => hb(b)).join(' ')}):`);
if (ixHits.length === 0) {
  console.log('  (none found in ROM)');
} else {
  console.log(`  ${ixHits.length} hit(s):`);
  for (const hitAddr of ixHits) {
    const contextBefore = Math.max(0, hitAddr - 4);
    const contextAfter = Math.min(rom.length, hitAddr + 3 + 6);
    console.log(`  ${hex(hitAddr)}  context: ${bytesAt(rom, contextBefore, contextAfter - contextBefore)}`);

    // Disassemble around the hit
    const disasmStart = Math.max(0, hitAddr - 6);
    const disRows = disassembleWindow(rom, disasmStart, 6);
    for (const row of disRows) {
      const marker = (row.pc <= hitAddr && hitAddr < row.pc + (row.inst?.length ?? 1)) ? ' <<<' : '';
      console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${marker}`);
    }
    console.log('');
  }
}
console.log('');

// ---- Part 5: Summary ----

console.log('PART 5: Summary & analysis');
console.log('='.repeat(26));
console.log('');
console.log('The linked-list traversal at 0x00BC47 uses (IX-30) as a pointer.');
console.log('If IX = 0xD140B3, then (IX-30) = 0xD14095.');
console.log('At 0x00B71B, the init code writes:');
console.log('  0xD14095 = 0x00  (independent flag)');
console.log('  0xD14096 = 0x00  (independent flag)');
console.log('  0xD14097 = 0x01  (independent flag)');
console.log('Read as a 24-bit LE pointer: 0x00 | (0x00 << 8) | (0x01 << 16) = 0x010000');
console.log('This is a ROM address, and loading it into SP at 0x00BC72 corrupts the stack.');
console.log('');
console.log('Key question: what sets IX to 0xD140B3?');
console.log('The answer determines whether this is a real linked-list node or');
console.log('an accidental overlap between flag storage and pointer interpretation.');
console.log('');
console.log('Done.');
