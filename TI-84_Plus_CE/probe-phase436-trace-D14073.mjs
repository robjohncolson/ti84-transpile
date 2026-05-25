/**
 * probe-phase436-trace-D14073.mjs
 *
 * Trace ALL references to RAM address 0xD14073 in the TI-84 Plus CE ROM.
 * Little-endian encoding: 73 40 D1
 *
 * Searches for direct byte accesses (LD A,(addr), LD (addr),A, etc.),
 * address loads (LD HL,addr, LD IX,addr, LD IY,addr), and
 * CB-prefixed bit operations via address-loaded registers.
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const TARGET = 0xD14073;
const LO = TARGET & 0xFF;        // 0x73
const MID = (TARGET >> 8) & 0xFF; // 0x40
const HI = (TARGET >> 16) & 0xFF; // 0xD1

console.log(`Tracing 0x${TARGET.toString(16).toUpperCase()} (LE bytes: ${hex(LO)} ${hex(MID)} ${hex(HI)})`);
console.log(`ROM size: ${rom.length} bytes (0x${rom.length.toString(16)})\n`);

function hex(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function hex6(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }

// Find all occurrences of the 3-byte LE pattern
const hits = [];
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === LO && rom[i + 1] === MID && rom[i + 2] === HI) {
    hits.push(i);
  }
}

console.log(`Total literal ${hex(LO)} ${hex(MID)} ${hex(HI)} hits: ${hits.length}\n`);

// Classify each hit by looking at the preceding byte(s)
const results = [];

for (const addrPos of hits) {
  const instrBefore1 = addrPos >= 1 ? rom[addrPos - 1] : null;
  const instrBefore2 = addrPos >= 2 ? rom[addrPos - 2] : null;
  const instrBefore3 = addrPos >= 3 ? rom[addrPos - 3] : null;

  let instrAddr = null;
  let instrName = null;
  let rw = null;  // 'read', 'write', 'addr-load', 'unknown'
  let instrLen = 0;

  // Single-byte opcodes before the 3-byte address
  const singleByteOps = {
    0x3A: { name: 'LD A,(0xD14073)',     rw: 'read',  len: 4 },
    0x32: { name: 'LD (0xD14073),A',     rw: 'write', len: 4 },
    0x21: { name: 'LD HL,0xD14073',      rw: 'addr-load', len: 4 },
    0x2A: { name: 'LD HL,(0xD14073)',    rw: 'read',  len: 4 },
    0x22: { name: 'LD (0xD14073),HL',    rw: 'write', len: 4 },
    0x01: { name: 'LD BC,0xD14073',      rw: 'addr-load', len: 4 },
    0x11: { name: 'LD DE,0xD14073',      rw: 'addr-load', len: 4 },
    0x31: { name: 'LD SP,0xD14073',      rw: 'addr-load', len: 4 },
    0x0A: null, // LD A,(BC) - no imm addr
    0xCD: { name: 'CALL 0xD14073',       rw: 'call',  len: 4 },
    0xC3: { name: 'JP 0xD14073',         rw: 'jump',  len: 4 },
    0xC2: { name: 'JP NZ,0xD14073',      rw: 'jump',  len: 4 },
    0xCA: { name: 'JP Z,0xD14073',       rw: 'jump',  len: 4 },
    0xD2: { name: 'JP NC,0xD14073',      rw: 'jump',  len: 4 },
    0xDA: { name: 'JP C,0xD14073',       rw: 'jump',  len: 4 },
    0xE2: { name: 'JP PO,0xD14073',      rw: 'jump',  len: 4 },
    0xEA: { name: 'JP PE,0xD14073',      rw: 'jump',  len: 4 },
    0xF2: { name: 'JP P,0xD14073',       rw: 'jump',  len: 4 },
    0xFA: { name: 'JP M,0xD14073',       rw: 'jump',  len: 4 },
    0xC4: { name: 'CALL NZ,0xD14073',    rw: 'call',  len: 4 },
    0xCC: { name: 'CALL Z,0xD14073',     rw: 'call',  len: 4 },
    0xD4: { name: 'CALL NC,0xD14073',    rw: 'call',  len: 4 },
    0xDC: { name: 'CALL C,0xD14073',     rw: 'call',  len: 4 },
  };

  // Two-byte prefix opcodes (DD = IX, FD = IY, ED = extended)
  const twoBytePrefixes = {
    0xDD: {
      0x21: { name: 'LD IX,0xD14073',    rw: 'addr-load', len: 5 },
      0x2A: { name: 'LD IX,(0xD14073)',   rw: 'read',  len: 5 },
      0x22: { name: 'LD (0xD14073),IX',   rw: 'write', len: 5 },
    },
    0xFD: {
      0x21: { name: 'LD IY,0xD14073',    rw: 'addr-load', len: 5 },
      0x2A: { name: 'LD IY,(0xD14073)',   rw: 'read',  len: 5 },
      0x22: { name: 'LD (0xD14073),IY',   rw: 'write', len: 5 },
    },
    0xED: {
      0x4B: { name: 'LD BC,(0xD14073)',   rw: 'read',  len: 5 },
      0x5B: { name: 'LD DE,(0xD14073)',   rw: 'read',  len: 5 },
      0x7B: { name: 'LD SP,(0xD14073)',   rw: 'read',  len: 5 },
      0x43: { name: 'LD (0xD14073),BC',   rw: 'write', len: 5 },
      0x53: { name: 'LD (0xD14073),DE',   rw: 'write', len: 5 },
      0x73: { name: 'LD (0xD14073),SP',   rw: 'write', len: 5 },
    },
  };

  let matched = false;

  // Check single-byte opcodes
  if (instrBefore1 !== null && singleByteOps[instrBefore1]) {
    const op = singleByteOps[instrBefore1];
    instrAddr = addrPos - 1;
    instrName = op.name;
    rw = op.rw;
    instrLen = op.len;
    matched = true;
  }

  // Check two-byte prefix opcodes
  if (!matched && instrBefore2 !== null && instrBefore1 !== null) {
    const prefix = twoBytePrefixes[instrBefore2];
    if (prefix && prefix[instrBefore1]) {
      const op = prefix[instrBefore1];
      instrAddr = addrPos - 2;
      instrName = op.name;
      rw = op.rw;
      instrLen = op.len;
      matched = true;
    }
  }

  if (!matched) {
    instrAddr = addrPos;
    instrName = `UNKNOWN (prev bytes: ${instrBefore3 !== null ? hex(instrBefore3) : '??'} ${instrBefore2 !== null ? hex(instrBefore2) : '??'} ${instrBefore1 !== null ? hex(instrBefore1) : '??'})`;
    rw = 'unknown';
    instrLen = 3;
  }

  // Context: dump a few bytes before and after for manual inspection
  const ctxStart = Math.max(0, instrAddr - 16);
  const ctxEnd = Math.min(rom.length, instrAddr + instrLen + 16);
  const ctxBytes = [];
  for (let j = ctxStart; j < ctxEnd; j++) {
    ctxBytes.push(hex(rom[j]));
  }

  // Check if D14074 (74 40 D1) appears nearby (within 64 bytes)
  const nearbyStart = Math.max(0, instrAddr - 64);
  const nearbyEnd = Math.min(rom.length - 2, instrAddr + 64);
  let nearD14074 = false;
  for (let j = nearbyStart; j < nearbyEnd; j++) {
    if (rom[j] === 0x74 && rom[j + 1] === 0x40 && rom[j + 2] === 0xD1 && j !== addrPos) {
      nearD14074 = true;
      break;
    }
  }

  results.push({
    addrPos,
    instrAddr,
    instrName,
    rw,
    instrLen,
    nearD14074,
    ctxHex: ctxBytes.join(' '),
    ctxStart,
  });
}

// Summary counts
const reads = results.filter(r => r.rw === 'read');
const writes = results.filter(r => r.rw === 'write');
const addrLoads = results.filter(r => r.rw === 'addr-load');
const calls = results.filter(r => r.rw === 'call');
const jumps = results.filter(r => r.rw === 'jump');
const unknowns = results.filter(r => r.rw === 'unknown');
const withD14074 = results.filter(r => r.nearD14074);

console.log('=== SUMMARY ===');
console.log(`Total hits:     ${results.length}`);
console.log(`  Reads:        ${reads.length}`);
console.log(`  Writes:       ${writes.length}`);
console.log(`  Addr loads:   ${addrLoads.length}`);
console.log(`  Calls:        ${calls.length}`);
console.log(`  Jumps:        ${jumps.length}`);
console.log(`  Unknown:      ${unknowns.length}`);
console.log(`  Near D14074:  ${withD14074.length} (within ±64 bytes)`);
console.log();

// Detailed listing grouped by R/W type
function printGroup(label, items) {
  if (items.length === 0) return;
  console.log(`=== ${label} (${items.length}) ===`);
  for (const r of items) {
    console.log(`  ${hex6(r.instrAddr)}: ${r.instrName}${r.nearD14074 ? '  [near D14074]' : ''}`);
    // Show what value A holds before a write (look for preceding LD A,n or XOR A)
    if (r.rw === 'write') {
      const valueInfo = analyzeWriteValue(r.instrAddr);
      if (valueInfo) {
        console.log(`           -> writes: ${valueInfo}`);
      }
    }
    // Show what follows a read (OR A / CP / BIT patterns)
    if (r.rw === 'read') {
      const readInfo = analyzeReadUsage(r.instrAddr, r.instrLen);
      if (readInfo) {
        console.log(`           -> usage: ${readInfo}`);
      }
    }
  }
  console.log();
}

function analyzeWriteValue(instrAddr) {
  // Look backward for value-setting instructions
  for (let scan = instrAddr - 1; scan >= Math.max(0, instrAddr - 16); scan--) {
    const b = rom[scan];
    // XOR A (AF) -> writes 0
    if (b === 0xAF) return 'A=0 (XOR A)';
    // LD A,n (3E nn)
    if (scan >= 1 && rom[scan - 1] === 0x3E) return `A=${hex(b)} (LD A,0x${hex(b)})`;
    // LD A,(D14074) = 3A 74 40 D1
    if (scan >= 3 && rom[scan - 3] === 0x3A && rom[scan - 2] === 0x74 && rom[scan - 1] === 0x40 && rom[scan] === 0xD1) {
      return 'A=D14074 (copies D14074 value)';
    }
    // INC A (3C)
    if (b === 0x3C) return 'A incremented (INC A)';
    // DEC A (3D)
    if (b === 0x3D) return 'A decremented (DEC A)';
    // Stop at anything that loads A differently or branches
    if (b === 0xC9 || b === 0xC3 || b === 0xCD || b === 0x18 || b === 0x28 || b === 0x20 || b === 0x30 || b === 0x38) break;
  }
  return null;
}

function analyzeReadUsage(instrAddr, instrLen) {
  const afterAddr = instrAddr + instrLen;
  if (afterAddr >= rom.length) return null;
  const b = rom[afterAddr];
  // OR A
  if (b === 0xB7) {
    const b2 = afterAddr + 1 < rom.length ? rom[afterAddr + 1] : null;
    if (b2 === 0x28) return `OR A; JR Z,+${rom[afterAddr + 2]} (test zero)`;
    if (b2 === 0x20) return `OR A; JR NZ,+${rom[afterAddr + 2]} (test nonzero)`;
    if (b2 === 0xCA) return `OR A; JP Z,${hex6(rom[afterAddr+2] | (rom[afterAddr+3]<<8) | (rom[afterAddr+4]<<16))} (test zero)`;
    if (b2 === 0xC2) return `OR A; JP NZ,${hex6(rom[afterAddr+2] | (rom[afterAddr+3]<<8) | (rom[afterAddr+4]<<16))} (test nonzero)`;
    return 'OR A (flag test)';
  }
  // CP n
  if (b === 0xFE) {
    const n = rom[afterAddr + 1];
    return `CP 0x${hex(n)} (compare with ${n})`;
  }
  // AND n
  if (b === 0xE6) {
    const n = rom[afterAddr + 1];
    return `AND 0x${hex(n)} (mask bits)`;
  }
  // BIT n,A (CB xx)
  if (b === 0xCB) {
    const b2 = rom[afterAddr + 1];
    if ((b2 & 0xC7) === 0x47) {
      const bit = (b2 >> 3) & 7;
      return `BIT ${bit},A (test bit ${bit})`;
    }
  }
  // DEC A
  if (b === 0x3D) return 'DEC A (decrement then test)';
  // SUB n
  if (b === 0xD6) return `SUB 0x${hex(rom[afterAddr + 1])}`;
  return `next byte: ${hex(b)}`;
}

printGroup('READS (LD A,(D14073))', reads);
printGroup('WRITES (LD (D14073),A)', writes);
printGroup('ADDRESS LOADS (LD rr,D14073)', addrLoads);
printGroup('CALLS to D14073', calls);
printGroup('JUMPS to D14073', jumps);
printGroup('UNKNOWN', unknowns);

// Full table for report
console.log('=== FULL TABLE ===');
console.log('| Instr addr | R/W | Instruction | Near D14074 |');
console.log('|------------|-----|-------------|-------------|');
for (const r of results) {
  console.log(`| \`${hex6(r.instrAddr)}\` | ${r.rw} | \`${r.instrName}\` | ${r.nearD14074 ? 'YES' : 'no'} |`);
}
console.log();

// Check for value patterns in writes
console.log('=== WRITE VALUE ANALYSIS ===');
for (const r of writes) {
  const val = analyzeWriteValue(r.instrAddr);
  console.log(`  ${hex6(r.instrAddr)}: ${r.instrName} -> ${val || '(could not determine)'}`);
}
console.log();

// Check for comparison patterns in reads
console.log('=== READ USAGE ANALYSIS ===');
for (const r of reads) {
  const usage = analyzeReadUsage(r.instrAddr, r.instrLen);
  console.log(`  ${hex6(r.instrAddr)}: ${r.instrName} -> ${usage || '(no obvious pattern)'}`);
}
