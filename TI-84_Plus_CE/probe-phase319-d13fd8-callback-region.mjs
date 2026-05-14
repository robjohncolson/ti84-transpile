/**
 * Phase 319 Probe: D13FD8-D14040 Callback Region Mapping
 *
 * Maps the contiguous RAM region D13FD8-D14040 by scanning the entire ROM
 * for little-endian 24-bit address references to every byte in the range.
 * Classifies each reference site and determines the struct layout.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
let passed = 0;
let failed = 0;

function r24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function hex(v) {
  return '0x' + v.toString(16).padStart(6, '0').toUpperCase();
}

function hex2(v) {
  return '0x' + v.toString(16).padStart(2, '0').toUpperCase();
}

function assert(condition, label) {
  if (condition) {
    console.log('PASS: ' + label);
    passed++;
  } else {
    console.log('FAIL: ' + label);
    failed++;
  }
}

// ─── Step 1: Scan entire ROM for references to D13FD8-D14040 ───

const REGION_START = 0xD13FD8;
const REGION_END   = 0xD14040;

// Map: target address -> array of { romOffset, context bytes }
const refMap = new Map();

for (let i = 0; i < rom.length - 2; i++) {
  const lo = rom[i];
  const mid = rom[i + 1];
  const hi = rom[i + 2];
  const addr = lo | (mid << 8) | (hi << 16);
  if (addr >= REGION_START && addr <= REGION_END) {
    if (!refMap.has(addr)) refMap.set(addr, []);
    // Grab context: 6 bytes before, the 3-byte ref, 6 bytes after
    const ctxStart = Math.max(0, i - 6);
    const ctxEnd = Math.min(rom.length, i + 3 + 6);
    const ctx = Buffer.from(rom.slice(ctxStart, ctxEnd));
    refMap.set(addr, [...refMap.get(addr), { romOffset: i, ctxStart, ctx }]);
  }
}

// Sort by target address
const sortedAddrs = [...refMap.keys()].sort((a, b) => a - b);

console.log('=== D13FD8-D14040 Region Reference Scan ===');
console.log(`Distinct addresses referenced: ${sortedAddrs.length}`);
console.log(`Total reference sites: ${[...refMap.values()].reduce((s, a) => s + a.length, 0)}`);
console.log('');

// ─── Step 2: Classify each reference site ───

// eZ80 instruction patterns that reference 24-bit immediate addresses:
// LD r,(addr) / LD (addr),r: various opcodes followed by 3-byte address
// Some common patterns:
//   LD A,(nn)  = 3A nn nn nn
//   LD (nn),A  = 32 nn nn nn
//   LD HL,(nn) = ED 6B nn nn nn  (or 2A nn nn nn for HL specifically)
//   LD (nn),HL = ED 63 nn nn nn  (or 22 nn nn nn for HL specifically)
//   LD BC,(nn) = ED 4B nn nn nn
//   LD (nn),BC = ED 43 nn nn nn
//   LD DE,(nn) = ED 5B nn nn nn
//   LD (nn),DE = ED 53 nn nn nn
//   LD IX,(nn) = DD 2A nn nn nn
//   LD (nn),IX = DD 22 nn nn nn
//   LD IY,(nn) = FD 2A nn nn nn
//   LD (nn),IY = FD 22 nn nn nn
//   LD HL,nn   = 21 nn nn nn (immediate, not memory)
//   LD BC,nn   = 01 nn nn nn
//   LD DE,nn   = 11 nn nn nn
//   LD IX,nn   = DD 21 nn nn nn
//   LD IY,nn   = FD 21 nn nn nn
//   CALL nn    = CD nn nn nn
//   JP nn      = C3 nn nn nn
//   JP cc,nn   = C2/CA/D2/DA/E2/EA/F2/FA nn nn nn

function classifyRef(romOffset) {
  // Check bytes before the 3-byte address to determine the instruction
  const b1 = romOffset >= 1 ? rom[romOffset - 1] : -1;
  const b2 = romOffset >= 2 ? rom[romOffset - 2] : -1;

  // Single-byte opcode + 3-byte addr (opcode is at romOffset-1)
  if (b1 === 0x3A) return { type: 'READ', instr: 'LD A,(nn)' };
  if (b1 === 0x32) return { type: 'WRITE', instr: 'LD (nn),A' };
  if (b1 === 0x22) return { type: 'WRITE', instr: 'LD (nn),HL' };
  if (b1 === 0x2A) return { type: 'READ', instr: 'LD HL,(nn)' };
  if (b1 === 0x21) return { type: 'IMM', instr: 'LD HL,nn' };
  if (b1 === 0x01) return { type: 'IMM', instr: 'LD BC,nn' };
  if (b1 === 0x11) return { type: 'IMM', instr: 'LD DE,nn' };
  if (b1 === 0xCD) return { type: 'CALL', instr: 'CALL nn' };
  if (b1 === 0xC3) return { type: 'JP', instr: 'JP nn' };
  // Conditional jumps
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(b1)) {
    return { type: 'JP_CC', instr: 'JP cc,nn' };
  }

  // Two-byte prefix + opcode + 3-byte addr (prefix at romOffset-2, opcode at romOffset-1)
  if (b2 === 0xED) {
    if (b1 === 0x4B) return { type: 'READ', instr: 'LD BC,(nn)' };
    if (b1 === 0x43) return { type: 'WRITE', instr: 'LD (nn),BC' };
    if (b1 === 0x5B) return { type: 'READ', instr: 'LD DE,(nn)' };
    if (b1 === 0x53) return { type: 'WRITE', instr: 'LD (nn),DE' };
    if (b1 === 0x6B) return { type: 'READ', instr: 'LD HL,(nn)' };
    if (b1 === 0x63) return { type: 'WRITE', instr: 'LD (nn),HL' };
    if (b1 === 0x7B) return { type: 'READ', instr: 'LD SP,(nn)' };
    if (b1 === 0x73) return { type: 'WRITE', instr: 'LD (nn),SP' };
  }
  if (b2 === 0xDD) {
    if (b1 === 0x2A) return { type: 'READ', instr: 'LD IX,(nn)' };
    if (b1 === 0x22) return { type: 'WRITE', instr: 'LD (nn),IX' };
    if (b1 === 0x21) return { type: 'IMM', instr: 'LD IX,nn' };
  }
  if (b2 === 0xFD) {
    if (b1 === 0x2A) return { type: 'READ', instr: 'LD IY,(nn)' };
    if (b1 === 0x22) return { type: 'WRITE', instr: 'LD (nn),IY' };
    if (b1 === 0x21) return { type: 'IMM', instr: 'LD IY,nn' };
  }

  // BIT/SET/RES on (nn) — unlikely but check
  // Could also be data embedded in code

  return { type: 'UNKNOWN', instr: `?? (prev bytes: ${hex2(b2 & 0xFF)} ${hex2(b1 & 0xFF)})` };
}

// Build detailed report
const detailedRefs = [];
for (const addr of sortedAddrs) {
  const refs = refMap.get(addr);
  const detail = {
    addr,
    refs: refs.map(r => {
      const cls = classifyRef(r.romOffset);
      // Determine instruction start address
      let instrStart = r.romOffset - 1;
      if (['READ', 'WRITE', 'IMM'].includes(cls.type) &&
          [0xED, 0xDD, 0xFD].includes(rom[r.romOffset - 2] || -1) &&
          cls.instr.includes('(nn)') || cls.instr.includes('IX') || cls.instr.includes('IY') || cls.instr.includes('SP')) {
        instrStart = r.romOffset - 2;
      }
      return {
        romOffset: r.romOffset,
        instrStart,
        ...cls,
        ctxHex: [...r.ctx].map(b => b.toString(16).padStart(2, '0')).join(' '),
        ctxStart: r.ctxStart,
      };
    }),
    readCount: 0,
    writeCount: 0,
    immCount: 0,
    otherCount: 0,
  };
  for (const r of detail.refs) {
    if (r.type === 'READ') detail.readCount++;
    else if (r.type === 'WRITE') detail.writeCount++;
    else if (r.type === 'IMM') detail.immCount++;
    else detail.otherCount++;
  }
  detailedRefs.push(detail);
}

// ─── Print reference table ───
console.log('=== Reference Table (sorted by address) ===');
console.log('');
for (const d of detailedRefs) {
  console.log(`${hex(d.addr)}: ${d.refs.length} refs (R=${d.readCount} W=${d.writeCount} IMM=${d.immCount} Other=${d.otherCount})`);
  for (const r of d.refs) {
    console.log(`  ROM ${hex(r.romOffset)}: ${r.type.padEnd(7)} ${r.instr.padEnd(20)} ctx=[${r.ctxHex}]`);
  }
}
console.log('');

// ─── Step 3: Identify gaps to determine struct layout ───

console.log('=== Address Distribution (stride analysis) ===');
const addrList = sortedAddrs.filter(a => a >= REGION_START && a < REGION_END);
if (addrList.length >= 2) {
  const diffs = [];
  for (let i = 1; i < addrList.length; i++) {
    diffs.push(addrList[i] - addrList[i - 1]);
  }
  console.log('Referenced addresses:');
  for (const a of addrList) {
    console.log(`  ${hex(a)} (offset +${(a - REGION_START).toString()})`);
  }
  console.log('');
  console.log('Inter-address gaps:');
  for (let i = 0; i < diffs.length; i++) {
    console.log(`  ${hex(addrList[i])} -> ${hex(addrList[i + 1])}: +${diffs[i]}`);
  }

  // Find most common stride
  const strideCounts = {};
  for (const d of diffs) {
    strideCounts[d] = (strideCounts[d] || 0) + 1;
  }
  console.log('');
  console.log('Stride frequency:');
  for (const [stride, count] of Object.entries(strideCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  stride ${stride}: ${count} times`);
  }
}
console.log('');

// ─── Step 4: Find registration sites (writes of non-zero values) ───

console.log('=== Write Sites (potential registration points) ===');
for (const d of detailedRefs) {
  const writes = d.refs.filter(r => r.type === 'WRITE');
  if (writes.length > 0) {
    console.log(`${hex(d.addr)} writes:`);
    for (const w of writes) {
      // Show surrounding function context
      console.log(`  ROM ${hex(w.romOffset)}: ${w.instr}  ctx=[${w.ctxHex}]`);
    }
  }
}
console.log('');

// ─── Step 5: Group references by ROM function region ───

console.log('=== References grouped by ROM region ===');
const regionMap = new Map();
for (const d of detailedRefs) {
  for (const r of d.refs) {
    const region = r.romOffset >> 12; // 4K page
    const key = `0x${(region << 12).toString(16).padStart(6, '0')}`;
    if (!regionMap.has(key)) regionMap.set(key, []);
    regionMap.get(key).push({ target: d.addr, ...r });
  }
}
for (const [region, refs] of [...regionMap.entries()].sort()) {
  console.log(`Region ${region} (${refs.length} refs):`);
  for (const r of refs) {
    console.log(`  ROM ${hex(r.romOffset)} -> ${hex(r.target)}: ${r.type} ${r.instr}`);
  }
}
console.log('');

// ─── Step 6: Identify the 0x00F000 cluster references specifically ───

const f000Refs = detailedRefs.flatMap(d =>
  d.refs.filter(r => r.romOffset >= 0x00F000 && r.romOffset < 0x010100)
    .map(r => ({ target: d.addr, ...r }))
);

console.log('=== 0x00F000 Cluster References ===');
for (const r of f000Refs) {
  console.log(`  ROM ${hex(r.romOffset)} -> ${hex(r.target)}: ${r.type} ${r.instr}`);
}
console.log('');

// ─── Assertions ───

console.log('=== Assertions ===');

// A1: D13FED should have references (established in previous sessions)
const d13fedRefs = refMap.get(0xD13FED) || [];
assert(d13fedRefs.length >= 2, `D13FED has >= 2 refs (found ${d13fedRefs.length})`);

// A2: Region should have multiple distinct referenced addresses
assert(sortedAddrs.length >= 3, `Region has >= 3 distinct referenced addresses (found ${sortedAddrs.length})`);

// A3: There should be both reads and writes in the region
const totalReads = detailedRefs.reduce((s, d) => s + d.readCount, 0);
const totalWrites = detailedRefs.reduce((s, d) => s + d.writeCount, 0);
assert(totalReads >= 1, `Region has >= 1 read references (found ${totalReads})`);
assert(totalWrites >= 1, `Region has >= 1 write references (found ${totalWrites})`);

// A4: References should exist in the 0x00F000 cluster
assert(f000Refs.length >= 1, `0x00F000 cluster has >= 1 ref to this region (found ${f000Refs.length})`);

// A5: D13FD8 (the region start) should have at least one reference
const d13fd8Refs = refMap.get(0xD13FD8) || [];
assert(d13fd8Refs.length >= 1, `D13FD8 has >= 1 refs (found ${d13fd8Refs.length})`);

// A6: The total reference count should be reasonable (not false positives from data)
const totalRefs = [...refMap.values()].reduce((s, a) => s + a.length, 0);
assert(totalRefs >= 5, `Total refs >= 5 (found ${totalRefs})`);
assert(totalRefs < 2000, `Total refs < 2000 — not dominated by false positives (found ${totalRefs})`);

// A7: D13FDE should have references (mentioned in session 317 as parallel base)
const d13fdeRefs = refMap.get(0xD13FDE) || [];
assert(d13fdeRefs.length >= 1, `D13FDE has >= 1 refs (found ${d13fdeRefs.length})`);

// A8: Check for write sites — boot init should write zeros somewhere in the region
assert(totalWrites >= 2, `Region has >= 2 write sites (found ${totalWrites})`);

// ─── Summary statistics ───

console.log('');
console.log('=== Summary ===');
console.log(`Region: ${hex(REGION_START)}-${hex(REGION_END)} (${REGION_END - REGION_START} bytes)`);
console.log(`Distinct addresses with ROM references: ${sortedAddrs.length}`);
console.log(`Total reference sites: ${totalRefs}`);
console.log(`  Reads: ${totalReads}`);
console.log(`  Writes: ${totalWrites}`);
console.log(`  Immediates (LD reg,addr): ${detailedRefs.reduce((s, d) => s + d.immCount, 0)}`);
console.log(`  Other/Unknown: ${detailedRefs.reduce((s, d) => s + d.otherCount, 0)}`);
console.log(`ROM regions with references: ${regionMap.size}`);
console.log(`0x00F000 cluster refs: ${f000Refs.length}`);
console.log('');
console.log(`Passed: ${passed}/${passed + failed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
