#!/usr/bin/env node
/**
 * Phase 316: Trace scrapMem (0xD02AD7) usage in the soft-float library
 *
 * The soft-float wrapper library at 0x04A3F0–0x04BA50 contains 57 references
 * to scrapMem (0xD02AD7/D8/D9). This probe classifies every reference by
 * opcode, access pattern, and containing function — then evaluates whether
 * a dedicated register could replace all scrapMem usage.
 *
 * scrapMem = 0xD02AD7 (3 bytes: D7=low, D8=mid, D9=high)
 * Soft-float wrapper range: 0x04A3F0–0x04BA50
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────
const SCRAPMEM      = 0xD02AD7;
const SCRAPMEM_D8   = 0xD02AD8;
const SCRAPMEM_D9   = 0xD02AD9;
const SCAN_START    = 0x04A3F0;
const SCAN_END      = 0x04BA50;

// Known function boundaries (PUSH IX prologues / RET epilogues observed)
// These are the major functions in this region. We assign refs to the
// nearest preceding PUSH IX prologue.
const FUNCTIONS = [
  // Identified from PUSH IX (DD E5) entries and RET (C9) boundaries
  { name: '_fpwrap_A',     start: 0x04A41F, end: 0x04A46E },
  { name: '_fpwrap_B',     start: 0x04A46F, end: 0x04A490 },
  { name: '_fpwrap_C',     start: 0x04A491, end: 0x04A4EF },
  { name: '_fpwrap_D',     start: 0x04A52C, end: 0x04A56F },
  { name: '_fpwrap_E',     start: 0x04A59A, end: 0x04A5D2 },
  { name: '_fpwrap_F',     start: 0x04A5D3, end: 0x04A5F9 },
  { name: '_fpwrap_G',     start: 0x04A5FA, end: 0x04A666 },
  { name: '_fpwrap_H',     start: 0x04A6B6, end: 0x04A6C8 },
  { name: '_fpwrap_I',     start: 0x04A6C9, end: 0x04A70D },
  { name: '_fpwrap_J',     start: 0x04A736, end: 0x04A772 },
  { name: '_fpwrap_K',     start: 0x04A7B6, end: 0x04A80B },
  { name: '_fpwrap_L',     start: 0x04A86F, end: 0x04A88A },
  { name: '_fpwrap_M',     start: 0x04A88B, end: 0x04A8BB },
  { name: '_fpwrap_N',     start: 0x04A8BC, end: 0x04A8D7 },
  { name: '_fpwrap_O',     start: 0x04A8D8, end: 0x04A8FF },
  { name: '_fpwrap_P',     start: 0x04A900, end: 0x04A946 },
  { name: '_fpwrap_Q',     start: 0x04A94B, end: 0x04A983 },
  { name: '_fpwrap_R',     start: 0x04A984, end: 0x04A9D4 },
  { name: '_fpwrap_S',     start: 0x04A9F7, end: 0x04AAE3 },
  { name: '_fpwrap_T',     start: 0x04AAE4, end: 0x04AB3E },
  { name: '_fpwrap_U',     start: 0x04AB75, end: 0x04ABB2 },
  { name: '_fpwrap_V',     start: 0x04ABB3, end: 0x04ABEA },
  { name: '_fpIO_W',       start: 0x04B904, end: 0x04B935 },
  { name: '_fpIO_X',       start: 0x04B936, end: 0x04B95D },
  { name: '_fpIO_Y',       start: 0x04B95E, end: 0x04B989 },
  { name: '_fpIO_Z',       start: 0x04B98A, end: 0x04B9A9 },
  { name: '_fpIO_AA',      start: 0x04B9AA, end: 0x04B9C9 },
  { name: '_fpIO_AB',      start: 0x04B9CA, end: 0x04BA04 },
  { name: '_fpIO_AC',      start: 0x04BA24, end: 0x04BA4E },
];

// ── Opcode decoder ─────────────────────────────────────────────────────
function decodeOpcodeAtRef(rom, addrRefStart) {
  // addrRefStart is where the 3-byte address (D7 2A D0 etc.) begins.
  // The opcode is 1 byte before, but may have ED prefix 2 bytes before.
  const b1 = rom[addrRefStart - 1];  // immediate opcode byte
  const b2 = rom[addrRefStart - 2];  // possible ED prefix

  if (b2 === 0xED) {
    // ED-prefixed instructions
    switch (b1) {
      case 0x43: return { mnemonic: 'LD (nn),BC', type: 'write24', reg: 'BC', len: 2 };
      case 0x53: return { mnemonic: 'LD (nn),DE', type: 'write24', reg: 'DE', len: 2 };
      case 0x4B: return { mnemonic: 'LD BC,(nn)', type: 'read24',  reg: 'BC', len: 2 };
      case 0x5B: return { mnemonic: 'LD DE,(nn)', type: 'read24',  reg: 'DE', len: 2 };
      case 0x38: {
        // ED 38 xx = eZ80 "LD (nn),A" with register index
        // Actually ED 38 is IN A,(C) in Z80. In eZ80 ADL context this
        // might be different. Let's check what follows.
        return { mnemonic: 'ED_38h (eZ80)', type: 'special', reg: '?', len: 2 };
      }
      default:
        return { mnemonic: `ED ${b1.toString(16)}h`, type: 'unknown_ED', reg: '?', len: 2 };
    }
  }

  switch (b1) {
    case 0x22: return { mnemonic: 'LD (nn),HL', type: 'write24', reg: 'HL', len: 1 };
    case 0x2A: return { mnemonic: 'LD HL,(nn)', type: 'read24',  reg: 'HL', len: 1 };
    case 0x32: return { mnemonic: 'LD (nn),A',  type: 'write8',  reg: 'A',  len: 1 };
    case 0x3A: return { mnemonic: 'LD A,(nn)',   type: 'read8',   reg: 'A',  len: 1 };
    default:
      return { mnemonic: `${b1.toString(16)}h`, type: 'unknown', reg: '?', len: 1 };
  }
}

function findFunction(addr) {
  for (const fn of FUNCTIONS) {
    if (addr >= fn.start && addr <= fn.end) return fn.name;
  }
  return `unknown_0x${addr.toString(16).padStart(6, '0')}`;
}

function hexByte(b) { return b.toString(16).padStart(2, '0'); }

// ── Scan ───────────────────────────────────────────────────────────────
const targets = [
  { addr: SCRAPMEM,    label: 'D02AD7', lo: 0xD7, mid: 0x2A, hi: 0xD0 },
  { addr: SCRAPMEM_D8, label: 'D02AD8', lo: 0xD8, mid: 0x2A, hi: 0xD0 },
  { addr: SCRAPMEM_D9, label: 'D02AD9', lo: 0xD9, mid: 0x2A, hi: 0xD0 },
];

const refs = [];
for (const tgt of targets) {
  for (let i = SCAN_START; i <= SCAN_END - 2; i++) {
    if (rom[i] === tgt.lo && rom[i + 1] === tgt.mid && rom[i + 2] === tgt.hi) {
      const decoded = decodeOpcodeAtRef(rom, i);
      const ctxBefore = [];
      const ctxAfter  = [];
      for (let j = Math.max(0, i - 8); j < i; j++) ctxBefore.push(hexByte(rom[j]));
      for (let j = i; j < Math.min(rom.length, i + 11); j++) ctxAfter.push(hexByte(rom[j]));

      refs.push({
        offset: i,
        target: tgt.label,
        decoded,
        func: findFunction(i),
        ctxBefore: ctxBefore.join(' '),
        ctxAfter: ctxAfter.join(' '),
      });
    }
  }
}

refs.sort((a, b) => a.offset - b.offset);

// ── Pattern classification ─────────────────────────────────────────────
// Group consecutive refs into access patterns
function classifyPatterns(refs) {
  const patterns = [];
  let i = 0;

  while (i < refs.length) {
    const cluster = [refs[i]];
    // Gather refs within 20 bytes of each other
    while (i + 1 < refs.length && refs[i + 1].offset - refs[i].offset < 20) {
      i++;
      cluster.push(refs[i]);
    }

    const types = cluster.map(r => `${r.decoded.type}:${r.target}`).join(' -> ');

    let pattern;
    if (types.includes('write8:D02AD7') && types.includes('write8:D02AD8') &&
        types.includes('write8:D02AD9') && types.includes('read24:D02AD7')) {
      pattern = 'RECOMPOSE (3 write8 -> read24)';
    } else if (types.includes('write24:D02AD7') && types.includes('read8:D02AD7') &&
               types.includes('read8:D02AD8') && types.includes('read8:D02AD9')) {
      pattern = 'DECOMPOSE (write24 -> 3 read8)';
    } else if (types.includes('write24:D02AD7') && types.includes('read8:D02AD9') &&
               !types.includes('read8:D02AD7') && !types.includes('read8:D02AD8')) {
      pattern = 'HIGH-BYTE EXTRACT (write24 -> read8 D9)';
    } else if (types.includes('write8:D02AD9') && types.includes('write8:D02AD8') &&
               types.includes('read24:D02AD7')) {
      pattern = 'PARTIAL RECOMPOSE (write D9+D8 -> read24)';
    } else if (types.includes('write8:D02AD7') && types.includes('read24:D02AD7') &&
               cluster.length === 2) {
      pattern = 'MASKED STORE (write8 D7 -> read24)';
    } else if (types.includes('write24:D02AD7') && types.includes('read24:D02AD7') &&
               cluster.length === 2) {
      pattern = 'STORE-RELOAD (write24 -> read24)';
    } else if (types.includes('write24:D02AD7') && types.includes('write8:D02AD9') &&
               types.includes('read24:D02AD7')) {
      pattern = 'MODIFY-HIGH (write24 -> write8 D9 -> read24)';
    } else if (cluster.every(r => r.decoded.type === 'read8')) {
      pattern = 'READ-ONLY (decompose consumer)';
    } else if (cluster.every(r => r.decoded.type === 'write8')) {
      pattern = 'WRITE-ONLY (byte setup)';
    } else if (types.includes('write24:D02AD7') && types.includes('read24:D02AD7')) {
      pattern = 'MIXED STORE-RELOAD';
    } else {
      pattern = 'OTHER: ' + types;
    }

    patterns.push({ refs: cluster, pattern, types });
    i++;
  }

  return patterns;
}

const patterns = classifyPatterns(refs);

// ── Output ─────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('Phase 316: scrapMem (0xD02AD7) in Soft-Float Library');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`\nScan range: 0x${SCAN_START.toString(16)}–0x${SCAN_END.toString(16)}`);
console.log(`Total references found: ${refs.length}`);
console.log();

// ── Per-reference detail ───────────────────────────────────────────────
console.log('── All References ────────────────────────────────────────────');
console.log();
for (const r of refs) {
  const addr = '0x' + r.offset.toString(16).padStart(6, '0');
  const instrAddr = '0x' + (r.offset - r.decoded.len).toString(16).padStart(6, '0');
  console.log(`  ${instrAddr}  ${r.decoded.mnemonic.padEnd(16)} ${r.target}  [${r.func}]`);
  console.log(`           ctx: ${r.ctxBefore} | ${r.ctxAfter}`);
}
console.log();

// ── Statistics ─────────────────────────────────────────────────────────
console.log('── Statistics ────────────────────────────────────────────────');
console.log();

// Reads vs writes
const reads  = refs.filter(r => r.decoded.type.startsWith('read'));
const writes = refs.filter(r => r.decoded.type.startsWith('write'));
const other  = refs.filter(r => !r.decoded.type.startsWith('read') && !r.decoded.type.startsWith('write'));
console.log(`  Reads:  ${reads.length}  (read8: ${reads.filter(r=>r.decoded.type==='read8').length}, read24: ${reads.filter(r=>r.decoded.type==='read24').length})`);
console.log(`  Writes: ${writes.length}  (write8: ${writes.filter(r=>r.decoded.type==='write8').length}, write24: ${writes.filter(r=>r.decoded.type==='write24').length})`);
if (other.length) console.log(`  Other:  ${other.length}`);
console.log();

// By target byte
console.log('  By target:');
for (const tgt of targets) {
  const count = refs.filter(r => r.target === tgt.label).length;
  console.log(`    ${tgt.label}: ${count}`);
}
console.log();

// By function
console.log('  By function:');
const funcCounts = {};
for (const r of refs) {
  funcCounts[r.func] = (funcCounts[r.func] || 0) + 1;
}
const sortedFuncs = Object.entries(funcCounts).sort((a, b) => b[1] - a[1]);
for (const [fn, count] of sortedFuncs) {
  console.log(`    ${fn}: ${count}`);
}
console.log();

// By opcode
console.log('  By opcode:');
const opcCounts = {};
for (const r of refs) {
  opcCounts[r.decoded.mnemonic] = (opcCounts[r.decoded.mnemonic] || 0) + 1;
}
for (const [opc, count] of Object.entries(opcCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${opc}: ${count}`);
}
console.log();

// ── Access patterns ────────────────────────────────────────────────────
console.log('── Access Patterns (clustered) ──────────────────────────────');
console.log();

const patternCounts = {};
for (const p of patterns) {
  patternCounts[p.pattern] = (patternCounts[p.pattern] || 0) + 1;
}

for (const [pat, count] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pat}: ${count} instances`);
}
console.log();

for (const p of patterns) {
  const addrs = p.refs.map(r => '0x' + r.offset.toString(16)).join(', ');
  const func = p.refs[0].func;
  console.log(`  [${func}] ${p.pattern}`);
  console.log(`    refs: ${addrs}`);
  console.log(`    types: ${p.types}`);
  console.log();
}

// ── Register replacement analysis ──────────────────────────────────────
console.log('══════════════════════════════════════════════════════════════');
console.log('── Register Replacement Feasibility Analysis ────────────────');
console.log('══════════════════════════════════════════════════════════════');
console.log();

const recomposeCount = patterns.filter(p => p.pattern.includes('RECOMPOSE')).length;
const decomposeCount = patterns.filter(p => p.pattern.includes('DECOMPOSE')).length;
const highByteCount  = patterns.filter(p => p.pattern.includes('HIGH-BYTE')).length;
const maskedCount    = patterns.filter(p => p.pattern.includes('MASKED')).length;
const otherPats      = patterns.filter(p =>
  !p.pattern.includes('RECOMPOSE') &&
  !p.pattern.includes('DECOMPOSE') &&
  !p.pattern.includes('HIGH-BYTE') &&
  !p.pattern.includes('MASKED')
);

console.log(`  RECOMPOSE patterns (3 byte write -> 24-bit read): ${recomposeCount}`);
console.log(`    Purpose: Assemble 3 separate bytes into a 24-bit register.`);
console.log(`    Register replacement: NEEDS 3-byte scratch. No single eZ80`);
console.log(`    register can replace this — you need to store 3 arbitrary bytes`);
console.log(`    then read back as a 24-bit word. IYL/IYH only give 2 bytes.`);
console.log();

console.log(`  DECOMPOSE patterns (24-bit write -> 3 byte reads): ${decomposeCount}`);
console.log(`    Purpose: Extract individual bytes from a 24-bit register.`);
console.log(`    Register replacement: Same problem — need to split 24 bits`);
console.log(`    into 3 addressable bytes. eZ80 has no byte-extract instruction.`);
console.log();

console.log(`  HIGH-BYTE EXTRACT (write24 -> read D9 only): ${highByteCount}`);
console.log(`    Purpose: Get bits 16-23 of a 24-bit register.`);
console.log(`    Register replacement: COULD use a rotate chain (SRL/RR x24)`);
console.log(`    but that is 6+ instructions vs 2 for scrapMem. Not practical.`);
console.log();

console.log(`  MASKED STORE / OTHER: ${maskedCount + otherPats.length}`);
console.log();

console.log('  VERDICT:');
console.log('    A dedicated register (IYL or unused reg) CANNOT replace ALL');
console.log('    scrapMem usage in this library. The dominant patterns require');
console.log('    a 3-byte addressable scratch cell:');
console.log('    - RECOMPOSE needs write-byte-0, write-byte-1, write-byte-2,');
console.log('      read-all-3-as-word. No register provides this.');
console.log('    - DECOMPOSE needs write-24-bit, read-byte-0, read-byte-1,');
console.log('      read-byte-2. Same constraint.');
console.log('    - HIGH-BYTE EXTRACT is the only pattern where a register');
console.log('      trick might work (rotate chain), but it would be slower');
console.log('      and destroy flags.');
console.log('    The eZ80 ISA lacks byte-extract/insert instructions for');
console.log('    24-bit registers. scrapMem is the canonical workaround.');
