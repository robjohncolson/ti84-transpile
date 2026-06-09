#!/usr/bin/env node

/**
 * Phase 580: Map ALL references to D0146D (pending key code buffer) across the ROM
 *
 * Session 579 discovered D0146D is a "pending key code" buffer, DISTINCT from
 * D0058E ("previous key"). The key pre-processor at 0x06CE7F reads D0146D to
 * get the current key.
 *
 * This probe scans the entire 4MB ROM for:
 *   - D0146D (pending key code)
 *   - D0146E, D0146F (adjacent bytes)
 *   - D0058E (previous key, for comparison)
 *
 * Classifies each ref as READ, WRITE, or ADDRESS.
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = rom.length;

const VARIABLES = [
  { name: 'D0146D', address: 0xD0146D, pattern: [0x6D, 0x14, 0xD0], desc: 'pending key code' },
  { name: 'D0146E', address: 0xD0146E, pattern: [0x6E, 0x14, 0xD0], desc: 'pending key +1' },
  { name: 'D0146F', address: 0xD0146F, pattern: [0x6F, 0x14, 0xD0], desc: 'pending key +2' },
  { name: 'D0058E', address: 0xD0058E, pattern: [0x8E, 0x05, 0xD0], desc: 'previous key' },
];

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

/** Format a decoded instruction into readable text. */
function fmtInst(inst) {
  if (!inst) return '(decode error)';
  const t = inst.tag;

  // Simple no-operand
  const simple = {
    'nop': 'NOP', 'halt': 'HALT', 'di': 'DI', 'ei': 'EI', 'exx': 'EXX',
    'ret': 'RET', 'reti': 'RETI', 'retn': 'RETN',
    'ex-af': "EX AF, AF'", 'ex-de-hl': 'EX DE, HL',
    'rlca': 'RLCA', 'rrca': 'RRCA', 'rla': 'RLA', 'rra': 'RRA',
    'daa': 'DAA', 'cpl': 'CPL', 'scf': 'SCF', 'ccf': 'CCF', 'neg': 'NEG',
    'ldi': 'LDI', 'ldir': 'LDIR', 'ldd': 'LDD', 'lddr': 'LDDR',
    'cpi': 'CPI', 'cpir': 'CPIR', 'cpd': 'CPD', 'cpdr': 'CPDR',
    'ld-sp-hl': 'LD SP, HL', 'ld-a-mb': 'LD A, MB', 'ld-mb-a': 'LD MB, A',
  };
  if (simple[t]) return simple[t];

  const up = (v) => String(v).toUpperCase();

  switch (t) {
    case 'ret-conditional': return `RET ${up(inst.condition)}`;
    case 'push': return `PUSH ${up(inst.pair)}`;
    case 'pop': return `POP ${up(inst.pair)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-indirect': return `JP (${up(inst.indirectRegister)})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;

    case 'ld-reg-reg': return `LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-imm': return `LD ${up(inst.dest)}, ${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`;
    case 'ld-reg-mem': return `LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${up(inst.src)}`;
    case 'ld-pair-imm': return `LD ${up(inst.pair)}, ${hex(inst.value, 6)}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${up(inst.pair)}`;
      return `LD ${up(inst.pair)}, (${hex(inst.addr)})`;
    }
    case 'ld-reg16-imm': return `LD ${up(inst.dest)}, ${hex(inst.value, 6)}`;
    case 'ld-reg16-mem': return `LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg16': return `LD (${hex(inst.addr)}), ${up(inst.src)}`;
    case 'ld-sp-index': return `LD SP, ${up(inst.indexRegister)}`;
    case 'ld-mem-imm': return `LD (${hex(inst.addr)}), ${hexByte(inst.value)}`;
    case 'ld-ind-reg': return `LD (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-reg-ind': return `LD ${up(inst.dest)}, (${up(inst.src || inst.pair || 'HL')})`;
    case 'ld-a-indirect': return `LD A, (${up(inst.reg)})`;
    case 'ld-indirect-a': return `LD (${up(inst.reg)}), A`;
    case 'ld-special': return `LD ${up(inst.dest)}, ${up(inst.src)}`;

    case 'ld-index-imm': return `LD ${up(inst.indexRegister)}, ${hex(inst.value, 6)}`;
    case 'ld-index-mem': return `LD ${up(inst.indexRegister)}, (${hex(inst.addr)})`;
    case 'ld-mem-index': return `LD (${hex(inst.addr)}), ${up(inst.indexRegister)}`;
    case 'ld-indexed-imm': return `LD (${up(inst.indexRegister)}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': return `LD (${up(inst.indexRegister)}+${inst.displacement}), ${up(inst.src)}`;
    case 'ld-reg-indexed': return `LD ${up(inst.dest)}, (${up(inst.indexRegister)}+${inst.displacement})`;

    case 'inc-reg': return `INC ${up(inst.reg)}`;
    case 'dec-reg': return `DEC ${up(inst.reg)}`;
    case 'inc-pair': return `INC ${up(inst.pair)}`;
    case 'dec-pair': return `DEC ${up(inst.pair)}`;
    case 'inc-index': return `INC ${up(inst.indexRegister)}`;
    case 'dec-index': return `DEC ${up(inst.indexRegister)}`;
    case 'inc-indexed': return `INC (${up(inst.indexRegister)}+${inst.displacement})`;
    case 'dec-indexed': return `DEC (${up(inst.indexRegister)}+${inst.displacement})`;

    case 'alu-reg': return `${up(inst.op)} ${up(inst.src)}`;
    case 'alu-imm': return `${up(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-indexed': return `${up(inst.op)} (${up(inst.indexRegister)}+${inst.displacement})`;

    case 'or-reg': return `OR ${up(inst.src)}`;
    case 'and-reg': return `AND ${up(inst.src)}`;
    case 'xor-reg': return `XOR ${up(inst.src)}`;
    case 'cp-reg': return `CP ${up(inst.src)}`;
    case 'or-imm': return `OR ${hexByte(inst.value)}`;
    case 'and-imm': return `AND ${hexByte(inst.value)}`;
    case 'xor-imm': return `XOR ${hexByte(inst.value)}`;
    case 'cp-imm': return `CP ${hexByte(inst.value)}`;

    case 'add-hl-reg16': return `ADD HL, ${up(inst.src)}`;
    case 'adc-hl-reg16': return `ADC HL, ${up(inst.src)}`;
    case 'sbc-hl-reg16': return `SBC HL, ${up(inst.src)}`;
    case 'add-index-reg16': return `ADD ${up(inst.indexRegister)}, ${up(inst.src)}`;

    case 'rotate-reg': return `${up(inst.op)} ${up(inst.reg)}`;
    case 'rotate-ind': return `${up(inst.op)} (${up(inst.indirectRegister)})`;

    case 'bit-test': return `BIT ${inst.bit}, ${up(inst.reg)}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${up(inst.indirectRegister)})`;
    case 'bit-set': return `SET ${inst.bit}, ${up(inst.reg)}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${up(inst.indirectRegister)})`;
    case 'bit-res': return `RES ${inst.bit}, ${up(inst.reg)}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${up(inst.indirectRegister)})`;

    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${up(inst.indexRegister)}+${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${up(inst.indexRegister)}+${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${up(inst.indexRegister)}+${inst.displacement})`;

    case 'in-reg-c': return `IN ${up(inst.dest)}, (C)`;
    case 'out-c-reg': return `OUT (C), ${up(inst.src)}`;
    case 'in-a-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm-a': return `OUT (${hexByte(inst.port)}), A`;
    case 'im': return `IM ${inst.mode}`;

    default: {
      let s = t;
      if (inst.target !== undefined) s += ` target=${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` val=${hex(inst.value, 2)}`;
      if (inst.addr !== undefined) s += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) s += ` dest=${up(inst.dest)}`;
      if (inst.src !== undefined) s += ` src=${up(inst.src)}`;
      return s;
    }
  }
}

/**
 * Try to find the instruction that contains the 3-byte address at position p.
 * Tries decoding from p-1, p-2, p-3, p-4.
 * Returns { offset, inst, text } or null.
 */
function findInstruction(p) {
  for (let back = 1; back <= 4; back++) {
    const start = p - back;
    if (start < 0) continue;

    try {
      const inst = decodeInstruction(rom, start, 'adl');
      if (!inst || !inst.length) continue;

      // Check the instruction spans past the pattern bytes
      const instEnd = start + inst.length;
      if (instEnd < p + 3) continue;   // instruction doesn't cover the full 3-byte address
      if (instEnd > start + 8) continue; // sanity: eZ80 instructions max ~6 bytes

      // Verify the instruction actually references the target address
      const addrFields = [inst.addr, inst.target, inst.value].filter(
        v => typeof v === 'number' && v >= 0xD00000
      );
      if (addrFields.length === 0) continue;

      return { offset: start, inst, text: fmtInst(inst) };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Classify a reference as READ, WRITE, or ADDRESS based on the decoded instruction.
 */
function classify(inst, targetAddr) {
  if (!inst) return 'UNKNOWN';
  const t = inst.tag;

  // Direct memory reads: LD reg, (addr)
  if (t === 'ld-reg-mem' && inst.addr === targetAddr) return 'READ';
  if (t === 'ld-reg16-mem' && inst.addr === targetAddr) return 'READ';
  if (t === 'ld-pair-mem' && inst.addr === targetAddr && inst.direction !== 'to-mem') return 'READ';
  if (t === 'ld-index-mem' && inst.addr === targetAddr) return 'READ';

  // Direct memory writes: LD (addr), reg
  if (t === 'ld-mem-reg' && inst.addr === targetAddr) return 'WRITE';
  if (t === 'ld-mem-reg16' && inst.addr === targetAddr) return 'WRITE';
  if (t === 'ld-pair-mem' && inst.addr === targetAddr && inst.direction === 'to-mem') return 'WRITE';
  if (t === 'ld-mem-index' && inst.addr === targetAddr) return 'WRITE';
  if (t === 'ld-mem-imm' && inst.addr === targetAddr) return 'WRITE';

  // Immediate load of the address value: LD HL, addr (loads the address itself)
  if (t === 'ld-pair-imm' && inst.value === targetAddr) return 'ADDRESS';
  if (t === 'ld-reg16-imm' && inst.value === targetAddr) return 'ADDRESS';
  if (t === 'ld-index-imm' && inst.value === targetAddr) return 'ADDRESS';
  if (t === 'ld-reg-imm' && inst.value === targetAddr) return 'ADDRESS';

  // CALL / JP to the address (unlikely for RAM but handle it)
  if ((t === 'call' || t === 'call-conditional') && inst.target === targetAddr) return 'ADDRESS';
  if ((t === 'jp' || t === 'jp-conditional') && inst.target === targetAddr) return 'ADDRESS';

  return 'UNKNOWN';
}

/** Scan for all occurrences of a 3-byte LE pattern in the ROM. */
function scanPattern(pattern) {
  const hits = [];
  const limit = ROM_SIZE - 2;
  for (let i = 0; i < limit; i++) {
    if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2]) {
      hits.push(i);
    }
  }
  return hits;
}

// --- Main ---

console.log('=== Phase 580: Map D0146D (pending key code) References ===\n');
console.log(`ROM size: ${hex(ROM_SIZE)} (${ROM_SIZE} bytes)\n`);

const allResults = [];

for (const variable of VARIABLES) {
  const hits = scanPattern(variable.pattern);
  const refs = [];

  for (const p of hits) {
    const found = findInstruction(p);
    if (!found) {
      // Could not decode — show raw bytes
      const rawBytes = [...rom.subarray(Math.max(0, p - 2), p + 5)]
        .map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      refs.push({
        patternAt: p,
        instrAt: p,
        category: 'UNKNOWN',
        text: `DB (raw: ${rawBytes})`,
      });
      continue;
    }

    const category = classify(found.inst, variable.address);
    refs.push({
      patternAt: p,
      instrAt: found.offset,
      category,
      text: found.text,
    });
  }

  // Sort by instruction address
  refs.sort((a, b) => a.instrAt - b.instrAt);

  // Count categories
  const counts = { READ: 0, WRITE: 0, ADDRESS: 0, UNKNOWN: 0 };
  for (const r of refs) {
    counts[r.category] = (counts[r.category] || 0) + 1;
  }

  allResults.push({ variable, refs, counts });
}

// --- Print results ---

for (const { variable, refs, counts } of allResults) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${variable.name} (${hex(variable.address)}) — ${variable.desc}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total refs: ${refs.length}`);
  console.log(`  READ: ${counts.READ}  WRITE: ${counts.WRITE}  ADDRESS: ${counts.ADDRESS}  UNKNOWN: ${counts.UNKNOWN}\n`);

  for (const r of refs) {
    const tag = r.category.padEnd(7);
    console.log(`  [${tag}] ${hex(r.instrAt)}  ${r.text}`);
  }
}

// --- Summary ---

console.log(`\n${'='.repeat(60)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(60)}\n`);

for (const { variable, refs, counts } of allResults) {
  console.log(`  ${variable.name} (${variable.desc}): ${refs.length} total — R:${counts.READ} W:${counts.WRITE} A:${counts.ADDRESS} U:${counts.UNKNOWN}`);
}

// --- Key pipeline analysis ---

console.log(`\n--- Key Delivery Pipeline (D0146D writers → readers) ---\n`);

const d0146d = allResults.find(r => r.variable.name === 'D0146D');
if (d0146d) {
  const writers = d0146d.refs.filter(r => r.category === 'WRITE');
  const readers = d0146d.refs.filter(r => r.category === 'READ');

  console.log(`  WRITERS (${writers.length}):`);
  for (const w of writers) {
    console.log(`    ${hex(w.instrAt)}  ${w.text}`);
  }

  console.log(`\n  READERS (${readers.length}):`);
  for (const r of readers) {
    console.log(`    ${hex(r.instrAt)}  ${r.text}`);
  }

  console.log(`\n  ADDRESS refs (${d0146d.counts.ADDRESS}):`);
  for (const a of d0146d.refs.filter(r => r.category === 'ADDRESS')) {
    console.log(`    ${hex(a.instrAt)}  ${a.text}`);
  }
}

console.log('\n=== Phase 580 complete ===');
