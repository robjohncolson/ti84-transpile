// probe-phase399-D141B5-consumers.mjs
// Decode 0xD141B5 consumers — who reads the final key output buffer?

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const romSize = rom.length;

console.log(`ROM size: ${romSize} bytes (0x${romSize.toString(16)})`);
console.log(`Searching for references to 0xD141B5...\n`);

// Target address bytes (little-endian): B5 41 D1
const TARGET = 0xD141B5;
const lo = 0xB5, mid = 0x41, hi = 0xD1;

// Known instruction patterns
const patterns = [
  { name: 'LD A,(0xD141B5)',   bytes: [0x3A, lo, mid, hi], type: 'READER' },
  { name: 'LD (0xD141B5),A',   bytes: [0x32, lo, mid, hi], type: 'WRITER' },
  { name: 'LD HL,0xD141B5',    bytes: [0x21, lo, mid, hi], type: 'POINTER' },
  { name: 'LD DE,0xD141B5',    bytes: [0x11, lo, mid, hi], type: 'POINTER' },
  { name: 'LD BC,0xD141B5',    bytes: [0x01, lo, mid, hi], type: 'POINTER' },
];

function hexDump(buf, start, len) {
  const s = Math.max(0, start);
  const e = Math.min(buf.length, s + len);
  const bytes = [];
  for (let i = s; i < e; i++) {
    bytes.push(buf[i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

// Search for specific instruction patterns
const results = [];

for (const pat of patterns) {
  for (let i = 0; i <= romSize - pat.bytes.length; i++) {
    let match = true;
    for (let j = 0; j < pat.bytes.length; j++) {
      if (rom[i + j] !== pat.bytes[j]) { match = false; break; }
    }
    if (match) {
      results.push({
        addr: i,
        instruction: pat.name,
        type: pat.type,
        matchLen: pat.bytes.length,
      });
    }
  }
}

// Sort by address
results.sort((a, b) => a.addr - b.addr);

console.log(`=== SPECIFIC INSTRUCTION MATCHES FOR 0xD141B5 ===`);
console.log(`Found ${results.length} matches:\n`);

for (const r of results) {
  console.log(`--- 0x${r.addr.toString(16).padStart(6, '0')} [${r.type}] ${r.instruction} ---`);
  const ctxBefore = 32;
  const ctxAfter = 16;
  const start = r.addr - ctxBefore;
  console.log(`  Context before (${ctxBefore} bytes from 0x${Math.max(0, start).toString(16).padStart(6, '0')}):`);
  console.log(`    ${hexDump(rom, start, ctxBefore)}`);
  console.log(`  Instruction bytes:`);
  console.log(`    ${hexDump(rom, r.addr, r.matchLen)}`);
  console.log(`  Context after (${ctxAfter} bytes from 0x${(r.addr + r.matchLen).toString(16).padStart(6, '0')}):`);
  console.log(`    ${hexDump(rom, r.addr + r.matchLen, ctxAfter)}`);
  console.log('');
}

// Raw 3-byte pattern search (catches other addressing modes)
console.log(`\n=== RAW 3-BYTE PATTERN SEARCH (B5 41 D1) ===`);
const rawMatches = [];
for (let i = 0; i <= romSize - 3; i++) {
  if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
    rawMatches.push(i);
  }
}

console.log(`Found ${rawMatches.length} occurrences of B5 41 D1:\n`);

// Filter out ones already found as specific instructions
const alreadyFound = new Set(results.map(r => r.addr));
for (const addr of rawMatches) {
  // The pattern starts at addr, but the instruction opcode is at addr-1 for 4-byte instructions
  const isKnown = alreadyFound.has(addr - 1);
  const tag = isKnown ? ' [already classified above]' : ' [OTHER/UNCLASSIFIED]';

  // Try to identify the opcode byte before
  const opcode = addr > 0 ? rom[addr - 1] : null;
  let guess = '';
  if (opcode === 0x3A) guess = 'LD A,(nn)';
  else if (opcode === 0x32) guess = 'LD (nn),A';
  else if (opcode === 0x21) guess = 'LD HL,nn';
  else if (opcode === 0x11) guess = 'LD DE,nn';
  else if (opcode === 0x01) guess = 'LD BC,nn';
  else if (opcode === 0xCD) guess = 'CALL nn (unlikely - address as code target)';
  else if (opcode === 0xC3) guess = 'JP nn (unlikely - address as code target)';
  else guess = `opcode before: 0x${opcode !== null ? opcode.toString(16).padStart(2, '0') : '??'}`;

  if (!isKnown) {
    console.log(`  0x${addr.toString(16).padStart(6, '0')}${tag} — ${guess}`);
    console.log(`    Before (16 bytes): ${hexDump(rom, addr - 16, 16)}`);
    console.log(`    Match + after:     ${hexDump(rom, addr, 19)}`);
    console.log('');
  }
}

// Adjacent addresses
console.log(`\n=== REFERENCES TO ADJACENT ADDRESSES ===`);

for (const [label, target] of [['0xD141B4', 0xD141B4], ['0xD141B6', 0xD141B6]]) {
  const tlo = target & 0xFF, tmid = (target >> 8) & 0xFF, thi = (target >> 16) & 0xFF;
  const adjMatches = [];
  for (let i = 0; i <= romSize - 3; i++) {
    if (rom[i] === tlo && rom[i + 1] === tmid && rom[i + 2] === thi) {
      adjMatches.push(i);
    }
  }
  console.log(`\n${label} (${tlo.toString(16)} ${tmid.toString(16)} ${thi.toString(16)}): ${adjMatches.length} occurrences`);
  for (const addr of adjMatches) {
    const opcode = addr > 0 ? rom[addr - 1] : null;
    let guess = '';
    if (opcode === 0x3A) guess = 'LD A,(nn) [READER]';
    else if (opcode === 0x32) guess = 'LD (nn),A [WRITER]';
    else if (opcode === 0x21) guess = 'LD HL,nn [POINTER]';
    else if (opcode === 0x11) guess = 'LD DE,nn [POINTER]';
    else if (opcode === 0x01) guess = 'LD BC,nn [POINTER]';
    else guess = `opcode before: 0x${opcode !== null ? opcode.toString(16).padStart(2, '0') : '??'}`;

    console.log(`  0x${addr.toString(16).padStart(6, '0')} — ${guess}`);
    console.log(`    Context: ${hexDump(rom, addr - 8, 24)}`);
  }
}

// Summary
console.log(`\n\n=== SUMMARY ===`);
const readers = results.filter(r => r.type === 'READER');
const writers = results.filter(r => r.type === 'WRITER');
const pointers = results.filter(r => r.type === 'POINTER');
console.log(`READERS  (LD A,(0xD141B5)): ${readers.length} — ${readers.map(r => '0x' + r.addr.toString(16).padStart(6, '0')).join(', ')}`);
console.log(`WRITERS  (LD (0xD141B5),A): ${writers.length} — ${writers.map(r => '0x' + r.addr.toString(16).padStart(6, '0')).join(', ')}`);
console.log(`POINTERS (LD reg,0xD141B5): ${pointers.length} — ${pointers.map(r => '0x' + r.addr.toString(16).padStart(6, '0')).join(', ')}`);
console.log(`\nTotal raw pattern occurrences: ${rawMatches.length}`);
console.log(`Unclassified (not matching known 4-byte patterns): ${rawMatches.length - results.length}`);
