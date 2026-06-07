/**
 * probe-phase548-map-D005F9.mjs
 *
 * Scans the entire ROM for all references to RAM address D005F9
 * (the "current variable type byte"). Classifies each as READ, WRITE,
 * or POINTER, groups by subsystem, and shows context for WRITEs.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const romLen = rom.length;

const TARGET_LO = 0xF9;
const TARGET_MID = 0x05;
const TARGET_HI = 0xD0;

const results = [];

for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] !== TARGET_LO || rom[i + 1] !== TARGET_MID || rom[i + 2] !== TARGET_HI) {
    continue;
  }

  // Check for ED/DD/FD prefixed instructions (2-byte opcode before address)
  let matched = false;

  if (i >= 2 && rom[i - 2] === 0xED) {
    const sub = rom[i - 1];
    const addr = i - 2;
    let type = 'OTHER';
    let note = `ED ${sub.toString(16).padStart(2,'0')} prefix`;
    switch (sub) {
      case 0x4B: type = 'READ';  note = 'LD BC,(D005F9)'; break;
      case 0x5B: type = 'READ';  note = 'LD DE,(D005F9)'; break;
      case 0x7B: type = 'READ';  note = 'LD SP,(D005F9)'; break;
      case 0x43: type = 'WRITE'; note = 'LD (D005F9),BC'; break;
      case 0x53: type = 'WRITE'; note = 'LD (D005F9),DE'; break;
      case 0x73: type = 'WRITE'; note = 'LD (D005F9),SP'; break;
    }
    if (type !== 'OTHER') {
      addResult(addr, 5, type, note);
      matched = true;
    }
  }

  if (i >= 2 && (rom[i - 2] === 0xDD || rom[i - 2] === 0xFD)) {
    const prefix = rom[i - 2];
    const opcode = rom[i - 1];
    const reg = prefix === 0xDD ? 'IX' : 'IY';
    const addr = i - 2;
    let type = 'OTHER';
    let note = `${reg}-prefix opcode ${opcode.toString(16).padStart(2,'0')}`;
    switch (opcode) {
      case 0x21: type = 'POINTER'; note = `LD ${reg},D005F9`; break;
      case 0x2A: type = 'READ';    note = `LD ${reg},(D005F9)`; break;
      case 0x22: type = 'WRITE';   note = `LD (D005F9),${reg}`; break;
    }
    if (type !== 'OTHER') {
      addResult(addr, 5, type, note);
      matched = true;
    }
  }

  // Check for single-byte opcode before address
  if (i >= 1) {
    const opcode = rom[i - 1];
    const addr = i - 1;
    let type = null;
    let note = '';
    switch (opcode) {
      case 0x3A: type = 'READ';    note = 'LD A,(D005F9)'; break;
      case 0x32: type = 'WRITE';   note = 'LD (D005F9),A'; break;
      case 0x21: type = 'POINTER'; note = 'LD HL,D005F9'; break;
      case 0x11: type = 'POINTER'; note = 'LD DE,D005F9'; break;
      case 0x01: type = 'POINTER'; note = 'LD BC,D005F9'; break;
      case 0x2A: type = 'READ';    note = 'LD HL,(D005F9)'; break;
      case 0x22: type = 'WRITE';   note = 'LD (D005F9),HL'; break;
    }
    if (type !== null) {
      // Skip if this was already captured as part of an ED/DD/FD prefix
      if (!matched) {
        addResult(addr, 4, type, note);
      }
      matched = true;
    }
  }

  // If nothing matched, record as OTHER with the preceding byte
  if (!matched) {
    const opcode = i >= 1 ? rom[i - 1] : 0;
    addResult(i, 3, 'OTHER', `raw F9 05 D0, preceding byte: ${opcode.toString(16).padStart(2,'0')}`);
  }
}

function addResult(addr, instrLen, type, note) {
  const ctxStart = Math.max(0, addr - 8);
  const ctxEnd = Math.min(romLen, addr + instrLen + 8);
  const context = [];
  for (let j = ctxStart; j < ctxEnd; j++) {
    context.push(rom[j].toString(16).padStart(2, '0'));
  }
  results.push({
    addr,
    addrHex: '0x' + addr.toString(16).padStart(6, '0'),
    type,
    note,
    instrLen,
    context: context.join(' '),
    ctxStart: '0x' + ctxStart.toString(16).padStart(6, '0'),
  });
}

// Deduplicate by address (keep first = longest match for prefixed)
const seen = new Set();
const filtered = [];
for (const r of results) {
  if (!seen.has(r.addr)) {
    seen.add(r.addr);
    filtered.push(r);
  }
}

// Subsystem classification
function subsystem(addr) {
  const region = addr >> 16;
  if (region <= 0x01) return '00-01: Boot/vectors';
  if (region === 0x02) return '02: Core OS/tokenizer';
  if (region === 0x03) return '03: Error/system';
  if (region === 0x04) return '04: Memory mgmt';
  if (region <= 0x06) return '05-06: Variable/equation';
  if (region <= 0x08) return '07-08: Math/FPU/display';
  if (region <= 0x0B) return '09-0B: Graph/app';
  return `${region.toString(16).padStart(2,'0')}: Other`;
}

// Summary
const counts = { READ: 0, WRITE: 0, POINTER: 0, OTHER: 0 };
const subsystems = {};

for (const r of filtered) {
  counts[r.type] = (counts[r.type] || 0) + 1;
  const sub = subsystem(r.addr);
  if (!subsystems[sub]) subsystems[sub] = [];
  subsystems[sub].push(r);
}

console.log('=== D005F9 ("Current Variable Type Byte") Usage Map ===\n');
console.log(`Total references: ${filtered.length}`);
console.log(`  READ:    ${counts.READ}`);
console.log(`  WRITE:   ${counts.WRITE}`);
console.log(`  POINTER: ${counts.POINTER}`);
console.log(`  OTHER:   ${counts.OTHER}`);
console.log('');

// Print by subsystem
const sortedSubs = Object.keys(subsystems).sort();
for (const sub of sortedSubs) {
  const refs = subsystems[sub];
  console.log(`--- ${sub} (${refs.length} refs) ---`);
  for (const r of refs) {
    const line = `  ${r.addrHex}  ${r.type.padEnd(7)}  ${r.note}`;
    console.log(line);
    if (r.type === 'WRITE' || r.type === 'OTHER') {
      console.log(`    context @${r.ctxStart}: ${r.context}`);
    }
  }
  console.log('');
}

// All writes with full context
const writes = filtered.filter(r => r.type === 'WRITE');
if (writes.length > 0) {
  console.log('=== ALL WRITE REFERENCES (detailed context) ===\n');
  for (const r of writes) {
    console.log(`${r.addrHex}  ${r.note}`);
    console.log(`  context @${r.ctxStart}: ${r.context}`);
    console.log('');
  }
}

console.log('probe-phase548-map-D005F9 PASSED');
