/**
 * probe-phase563-map-D007C4.mjs
 * Map all ROM references to RAM addresses D007C4-D007C9 (cursor-save bytes)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const targets = [
  { addr: 0xD007C4, bytes: [0xC4, 0x07, 0xD0] },
  { addr: 0xD007C5, bytes: [0xC5, 0x07, 0xD0] },
  { addr: 0xD007C6, bytes: [0xC6, 0x07, 0xD0] },
  { addr: 0xD007C7, bytes: [0xC7, 0x07, 0xD0] },
  { addr: 0xD007C8, bytes: [0xC8, 0x07, 0xD0] },
  { addr: 0xD007C9, bytes: [0xC9, 0x07, 0xD0] },
];

// eZ80 ADL opcode classification
function classifyHit(rom, offset) {
  const prev1 = offset >= 1 ? rom[offset - 1] : null;
  const prev2 = offset >= 2 ? rom[offset - 2] : null;
  const prev3 = offset >= 3 ? rom[offset - 3] : null;

  // Check for ED-prefix instructions (2 bytes before address)
  if (prev2 === 0xED) {
    const op = prev1;
    const prefix = prev3;

    if (op === 0x6B) {
      if (prefix === 0xDD) return { type: 'READ', instr: 'LD IX,(nn)' };
      if (prefix === 0xFD) return { type: 'READ', instr: 'LD IY,(nn)' };
      return { type: 'READ', instr: 'LD HL,(nn) [ED 6B]' };
    }
    if (op === 0x63) {
      if (prefix === 0xDD) return { type: 'WRITE', instr: 'LD (nn),IX' };
      if (prefix === 0xFD) return { type: 'WRITE', instr: 'LD (nn),IY' };
      return { type: 'WRITE', instr: 'LD (nn),HL [ED 63]' };
    }
    if (op === 0x4B) return { type: 'READ', instr: 'LD BC,(nn) [ED 4B]' };
    if (op === 0x43) return { type: 'WRITE', instr: 'LD (nn),BC [ED 43]' };
    if (op === 0x5B) return { type: 'READ', instr: 'LD DE,(nn) [ED 5B]' };
    if (op === 0x53) return { type: 'WRITE', instr: 'LD (nn),DE [ED 53]' };
    if (op === 0x7B) return { type: 'READ', instr: 'LD SP,(nn) [ED 7B]' };
    if (op === 0x73) return { type: 'WRITE', instr: 'LD (nn),SP [ED 73]' };
  }

  // Check for DD/FD prefix before single-byte opcode
  if (prev2 === 0xDD || prev2 === 0xFD) {
    const regName = prev2 === 0xDD ? 'IX' : 'IY';
    if (prev1 === 0x21) return { type: 'LITERAL', instr: 'LD ' + regName + ',nn' };
    if (prev1 === 0x2A) return { type: 'READ', instr: 'LD ' + regName + ',(nn)' };
    if (prev1 === 0x22) return { type: 'WRITE', instr: 'LD (nn),' + regName };
  }

  // Single-byte opcodes
  if (prev1 === 0x3A) return { type: 'READ', instr: 'LD A,(nn)' };
  if (prev1 === 0x32) return { type: 'WRITE', instr: 'LD (nn),A' };
  if (prev1 === 0x21) return { type: 'LITERAL', instr: 'LD HL,nn' };
  if (prev1 === 0x11) return { type: 'LITERAL', instr: 'LD DE,nn' };
  if (prev1 === 0x01) return { type: 'LITERAL', instr: 'LD BC,nn' };
  if (prev1 === 0x31) return { type: 'LITERAL', instr: 'LD SP,nn' };
  if (prev1 === 0x2A) return { type: 'READ', instr: 'LD HL,(nn)' };
  if (prev1 === 0x22) return { type: 'WRITE', instr: 'LD (nn),HL' };

  // False positives / jumps
  if (prev1 === 0xCD) return { type: 'FALSE_POS', instr: 'CALL nn (to RAM)' };
  if (prev1 === 0xC3) return { type: 'FALSE_POS', instr: 'JP nn (to RAM)' };
  // Conditional JP: C2,CA,D2,DA,E2,EA,F2,FA
  if (prev1 !== null && (prev1 & 0xC7) === 0xC2) return { type: 'FALSE_POS', instr: 'JP cc,nn [' + prev1.toString(16) + ']' };
  // Conditional CALL: C4,CC,D4,DC,E4,EC,F4,FC
  if (prev1 !== null && (prev1 & 0xC7) === 0xC4) return { type: 'FALSE_POS', instr: 'CALL cc,nn [' + prev1.toString(16) + ']' };

  return { type: 'UNKNOWN', instr: 'prev: ' + (prev1 !== null ? prev1.toString(16).padStart(2,'0') : '??') };
}

function hexContext(rom, offset, radius) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(rom.length, offset + 3 + radius);
  const bytes = [];
  for (let i = start; i < end; i++) {
    if (i === offset) bytes.push('[');
    bytes.push(rom[i].toString(16).padStart(2, '0'));
    if (i === offset + 2) bytes.push(']');
  }
  return bytes.join(' ');
}

function subsystem(offset) {
  if (offset < 0x020000) return 'BOOT/VECTOR';
  if (offset < 0x040000) return 'OS_CORE_LOW';
  if (offset < 0x060000) return 'OS_CORE_MID';
  if (offset < 0x080000) return 'OS_UTIL';
  if (offset < 0x090000) return 'OS_MATH/FPU';
  if (offset < 0x0A0000) return 'OS_DISPLAY_LOW';
  if (offset < 0x0B0000) return 'OS_DISPLAY';
  if (offset < 0x0C0000) return 'OS_DISPLAY_HIGH';
  if (offset < 0x100000) return 'OS_MISC';
  return 'UPPER_ROM';
}

// Scan
const results = new Map();
for (const t of targets) {
  results.set(t.addr, []);
}

for (let i = 0; i < rom.length - 2; i++) {
  for (const t of targets) {
    if (rom[i] === t.bytes[0] && rom[i+1] === t.bytes[1] && rom[i+2] === t.bytes[2]) {
      const classification = classifyHit(rom, i);
      results.get(t.addr).push({
        offset: i,
        context: hexContext(rom, i, 8),
        ...classification,
      });
    }
  }
}

// Report
console.log('=== ROM References to D007C4-D007C9 (Cursor-Save Bytes) ===\n');

let totalHits = 0;
let totalFalsePos = 0;

for (const [addr, hits] of results) {
  const addrHex = addr.toString(16).toUpperCase();
  const real = hits.filter(h => h.type !== 'FALSE_POS');
  const fp = hits.filter(h => h.type === 'FALSE_POS');

  console.log('--- ' + addrHex + ' (' + hits.length + ' raw hits, ' + real.length + ' real, ' + fp.length + ' false positives) ---');

  const reads = real.filter(h => h.type === 'READ');
  const writes = real.filter(h => h.type === 'WRITE');
  const literals = real.filter(h => h.type === 'LITERAL');
  const unknowns = real.filter(h => h.type === 'UNKNOWN');

  if (reads.length) {
    console.log('  READS (' + reads.length + '):');
    for (const h of reads) {
      console.log('    0x' + h.offset.toString(16).padStart(6,'0') + ' [' + subsystem(h.offset) + '] ' + h.instr + '  ctx: ' + h.context);
    }
  }
  if (writes.length) {
    console.log('  WRITES (' + writes.length + '):');
    for (const h of writes) {
      console.log('    0x' + h.offset.toString(16).padStart(6,'0') + ' [' + subsystem(h.offset) + '] ' + h.instr + '  ctx: ' + h.context);
    }
  }
  if (literals.length) {
    console.log('  LITERALS (' + literals.length + '):');
    for (const h of literals) {
      console.log('    0x' + h.offset.toString(16).padStart(6,'0') + ' [' + subsystem(h.offset) + '] ' + h.instr + '  ctx: ' + h.context);
    }
  }
  if (unknowns.length) {
    console.log('  UNKNOWN (' + unknowns.length + '):');
    for (const h of unknowns) {
      console.log('    0x' + h.offset.toString(16).padStart(6,'0') + ' [' + subsystem(h.offset) + '] ' + h.instr + '  ctx: ' + h.context);
    }
  }
  if (fp.length) {
    console.log('  FALSE POSITIVES (' + fp.length + '):');
    for (const h of fp) {
      console.log('    0x' + h.offset.toString(16).padStart(6,'0') + ' [' + subsystem(h.offset) + '] ' + h.instr + '  ctx: ' + h.context);
    }
  }
  console.log('');
  totalHits += real.length;
  totalFalsePos += fp.length;
}

console.log('\n=== SUMMARY ===');
console.log('Total real references: ' + totalHits);
console.log('Total false positives filtered: ' + totalFalsePos);
console.log('');

// Summary table
console.log('Address   | Reads | Writes | Literals | Unknown');
console.log('----------|-------|--------|----------|--------');
for (const [addr, hits] of results) {
  const real = hits.filter(h => h.type !== 'FALSE_POS');
  const reads = real.filter(h => h.type === 'READ').length;
  const writes = real.filter(h => h.type === 'WRITE').length;
  const literals = real.filter(h => h.type === 'LITERAL').length;
  const unknowns = real.filter(h => h.type === 'UNKNOWN').length;
  console.log(addr.toString(16).toUpperCase() + '  |   ' + reads + '   |    ' + writes + '   |     ' + literals + '    |    ' + unknowns);
}

console.log('\n=== SUBSYSTEM BREAKDOWN ===');
const bySub = {};
for (const [addr, hits] of results) {
  for (const h of hits.filter(x => x.type !== 'FALSE_POS')) {
    const sub = subsystem(h.offset);
    if (!bySub[sub]) bySub[sub] = [];
    bySub[sub].push({ addr, ...h });
  }
}
for (const [sub, hits] of Object.entries(bySub).sort()) {
  console.log('  ' + sub + ': ' + hits.length + ' refs');
}

console.log('\nDone.');