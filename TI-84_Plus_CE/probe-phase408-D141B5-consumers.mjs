/**
 * probe-phase408-D141B5-consumers.mjs
 *
 * Scans the TI-84 Plus CE ROM for ALL references to RAM address 0xD141B5
 * (the final key output buffer). Groups consumers by type: readers (LD A),
 * loaders (LD HL), writers (LD (nn),A), and others. Disassembles context
 * around each hit to identify dispatchers, clearers, and passers.
 *
 * Also checks whether 0x08C5D7 (cxSwitch) references 0xD141B5.
 *
 * Usage: node TI-84_Plus_CE/probe-phase408-D141B5-consumers.mjs
 */

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = rom.length;

// ─── Pattern definitions ───────────────────────────────────────────────────
// Target: 0xD141B5 = little-endian bytes B5 41 D1
//
// LD A,(0xD141B5)   = 3A B5 41 D1   (reader)
// LD HL,0xD141B5    = 21 B5 41 D1   (loader — sets up pointer)
// LD (0xD141B5),A   = 32 B5 41 D1   (writer)
// LD DE,0xD141B5    = 11 B5 41 D1   (loader — sets up pointer in DE)
// LD BC,0xD141B5    = 01 B5 41 D1   (loader — sets up pointer in BC)
// LD IX,0xD141B5    = DD 21 B5 41 D1 (5-byte IX loader)
// LD IY,0xD141B5    = FD 21 B5 41 D1 (5-byte IY loader)
// LD (0xD141B5),HL  = 22 B5 41 D1   (word writer)

const PATTERNS = [
  { name: 'LD A,(0xD141B5)',  bytes: [0x3A, 0xB5, 0x41, 0xD1], type: 'reader',  len: 4 },
  { name: 'LD HL,0xD141B5',   bytes: [0x21, 0xB5, 0x41, 0xD1], type: 'loader',  len: 4 },
  { name: 'LD (0xD141B5),A',  bytes: [0x32, 0xB5, 0x41, 0xD1], type: 'writer',  len: 4 },
  { name: 'LD DE,0xD141B5',   bytes: [0x11, 0xB5, 0x41, 0xD1], type: 'loader',  len: 4 },
  { name: 'LD BC,0xD141B5',   bytes: [0x01, 0xB5, 0x41, 0xD1], type: 'loader',  len: 4 },
  { name: 'LD (0xD141B5),HL', bytes: [0x22, 0xB5, 0x41, 0xD1], type: 'writer',  len: 4 },
];

// 5-byte IX/IY patterns
const PATTERNS_5 = [
  { name: 'LD IX,0xD141B5', bytes: [0xDD, 0x21, 0xB5, 0x41, 0xD1], type: 'loader', len: 5 },
  { name: 'LD IY,0xD141B5', bytes: [0xFD, 0x21, 0xB5, 0x41, 0xD1], type: 'loader', len: 5 },
];

// ─── Scan ──────────────────────────────────────────────────────────────────

const hits = [];

for (let i = 0; i < ROM_SIZE - 4; i++) {
  // Check 4-byte patterns
  if (rom[i + 1] === 0xB5 && rom[i + 2] === 0x41 && rom[i + 3] === 0xD1) {
    for (const pat of PATTERNS) {
      if (rom[i] === pat.bytes[0]) {
        hits.push({ addr: i, pattern: pat.name, type: pat.type, len: pat.len });
      }
    }
  }

  // Check 5-byte patterns (DD 21 / FD 21 prefix)
  if (i < ROM_SIZE - 5 &&
      rom[i + 2] === 0xB5 && rom[i + 3] === 0x41 && rom[i + 4] === 0xD1) {
    for (const pat of PATTERNS_5) {
      if (rom[i] === pat.bytes[0] && rom[i + 1] === pat.bytes[1]) {
        hits.push({ addr: i, pattern: pat.name, type: pat.type, len: pat.len });
      }
    }
  }
}

// Also do a brute-force scan for the 3-byte address sequence B5 41 D1
// to catch any unusual instructions we might have missed
const rawHits = [];
for (let i = 0; i < ROM_SIZE - 2; i++) {
  if (rom[i] === 0xB5 && rom[i + 1] === 0x41 && rom[i + 2] === 0xD1) {
    // Check if this is already captured
    const alreadyHit = hits.some(h => {
      const addrByteStart = h.addr + (h.len - 3); // where B5 41 D1 starts
      return addrByteStart === i;
    });
    if (!alreadyHit) {
      rawHits.push(i);
    }
  }
}

// Sort hits by address
hits.sort((a, b) => a.addr - b.addr);

// ─── Helpers ───────────────────────────────────────────────────────────────

function hex(n, pad = 6) {
  return '0x' + n.toString(16).toUpperCase().padStart(pad, '0');
}

function hexDump(addr, len) {
  const start = Math.max(0, addr);
  const end = Math.min(ROM_SIZE, addr + len);
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(rom[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function addr24(offset) {
  if (offset < 0 || offset + 2 >= ROM_SIZE) return 0;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// ─── Disassembler (context around each hit) ────────────────────────────────

function disasmAfter(addr, instrLen) {
  const lines = [];
  const scanStart = addr + instrLen;
  const scanEnd = Math.min(scanStart + 60, ROM_SIZE - 4);

  const cpValues = [];
  const branches = [];
  const calls = [];
  let hasOrA = false;
  let hasXorA = false;
  let storeBack = false;

  for (let i = scanStart; i < scanEnd; i++) {
    const b = rom[i];

    // CP n = 0xFE + imm8
    if (b === 0xFE && i + 1 < ROM_SIZE) {
      const val = rom[i + 1];
      cpValues.push({ offset: i, value: val });
      lines.push(`  ${hex(i)}: CP ${hex(val, 2)}`);
      i += 1;
      continue;
    }

    // OR A = 0xB7 (zero test)
    if (b === 0xB7) {
      hasOrA = true;
      lines.push(`  ${hex(i)}: OR A`);
      continue;
    }

    // XOR A = 0xAF (A := 0)
    if (b === 0xAF) {
      hasXorA = true;
      lines.push(`  ${hex(i)}: XOR A`);
      continue;
    }

    // LD (0xD141B5),A = 32 B5 41 D1 (store back = clear)
    if (b === 0x32 && i + 3 < ROM_SIZE &&
        rom[i + 1] === 0xB5 && rom[i + 2] === 0x41 && rom[i + 3] === 0xD1) {
      storeBack = true;
      lines.push(`  ${hex(i)}: LD (0xD141B5),A  ; store/clear`);
      i += 3;
      continue;
    }

    // LD (nn),A  — generic store
    if (b === 0x32 && i + 3 < ROM_SIZE) {
      const target = addr24(i + 1);
      lines.push(`  ${hex(i)}: LD (${hex(target)}),A`);
      i += 3;
      continue;
    }

    // LD A,(nn)  — another read
    if (b === 0x3A && i + 3 < ROM_SIZE) {
      const target = addr24(i + 1);
      lines.push(`  ${hex(i)}: LD A,(${hex(target)})`);
      i += 3;
      continue;
    }

    // JR Z,e = 0x28
    if (b === 0x28 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR Z', target });
      lines.push(`  ${hex(i)}: JR Z, ${hex(target)}`);
      i += 1;
      continue;
    }

    // JR NZ,e = 0x20
    if (b === 0x20 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR NZ', target });
      lines.push(`  ${hex(i)}: JR NZ, ${hex(target)}`);
      i += 1;
      continue;
    }

    // JR C,e = 0x38
    if (b === 0x38 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR C', target });
      lines.push(`  ${hex(i)}: JR C, ${hex(target)}`);
      i += 1;
      continue;
    }

    // JR NC,e = 0x30
    if (b === 0x30 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR NC', target });
      lines.push(`  ${hex(i)}: JR NC, ${hex(target)}`);
      i += 1;
      continue;
    }

    // JP Z,nn = 0xCA
    if (b === 0xCA && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP Z', target });
      lines.push(`  ${hex(i)}: JP Z, ${hex(target)}`);
      i += 3;
      continue;
    }

    // JP NZ,nn = 0xC2
    if (b === 0xC2 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP NZ', target });
      lines.push(`  ${hex(i)}: JP NZ, ${hex(target)}`);
      i += 3;
      continue;
    }

    // JP C,nn = 0xDA
    if (b === 0xDA && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP C', target });
      lines.push(`  ${hex(i)}: JP C, ${hex(target)}`);
      i += 3;
      continue;
    }

    // JP NC,nn = 0xD2
    if (b === 0xD2 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP NC', target });
      lines.push(`  ${hex(i)}: JP NC, ${hex(target)}`);
      i += 3;
      continue;
    }

    // JP nn (unconditional) = 0xC3
    if (b === 0xC3 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP', target });
      lines.push(`  ${hex(i)}: JP ${hex(target)}`);
      i += 3;
      continue;
    }

    // CALL nn = 0xCD
    if (b === 0xCD && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      calls.push({ offset: i, target });
      lines.push(`  ${hex(i)}: CALL ${hex(target)}`);
      i += 3;
      continue;
    }

    // CALL Z,nn = 0xCC
    if (b === 0xCC && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      calls.push({ offset: i, target, cond: 'Z' });
      lines.push(`  ${hex(i)}: CALL Z, ${hex(target)}`);
      i += 3;
      continue;
    }

    // CALL NZ,nn = 0xC4
    if (b === 0xC4 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      calls.push({ offset: i, target, cond: 'NZ' });
      lines.push(`  ${hex(i)}: CALL NZ, ${hex(target)}`);
      i += 3;
      continue;
    }

    // RET = 0xC9
    if (b === 0xC9) {
      lines.push(`  ${hex(i)}: RET`);
      break;
    }

    // RET Z = 0xC8
    if (b === 0xC8) {
      lines.push(`  ${hex(i)}: RET Z`);
      continue;
    }

    // RET NZ = 0xC0
    if (b === 0xC0) {
      lines.push(`  ${hex(i)}: RET NZ`);
      continue;
    }

    // PUSH AF = 0xF5
    if (b === 0xF5) {
      lines.push(`  ${hex(i)}: PUSH AF`);
      continue;
    }

    // POP AF = 0xF1
    if (b === 0xF1) {
      lines.push(`  ${hex(i)}: POP AF`);
      continue;
    }

    // LD B,A = 0x47
    if (b === 0x47) {
      lines.push(`  ${hex(i)}: LD B,A`);
      continue;
    }

    // LD C,A = 0x4F
    if (b === 0x4F) {
      lines.push(`  ${hex(i)}: LD C,A`);
      continue;
    }

    // LD D,A = 0x57
    if (b === 0x57) {
      lines.push(`  ${hex(i)}: LD D,A`);
      continue;
    }

    // LD E,A = 0x5F
    if (b === 0x5F) {
      lines.push(`  ${hex(i)}: LD E,A`);
      continue;
    }

    // LD L,A = 0x6F
    if (b === 0x6F) {
      lines.push(`  ${hex(i)}: LD L,A`);
      continue;
    }

    // LD H,A = 0x67
    if (b === 0x67) {
      lines.push(`  ${hex(i)}: LD H,A`);
      continue;
    }

    // LD (HL),A = 0x77
    if (b === 0x77) {
      lines.push(`  ${hex(i)}: LD (HL),A`);
      continue;
    }

    // LD A,n = 0x3E
    if (b === 0x3E && i + 1 < ROM_SIZE) {
      lines.push(`  ${hex(i)}: LD A,${hex(rom[i + 1], 2)}`);
      i += 1;
      continue;
    }

    // LD HL,nn = 0x21
    if (b === 0x21 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      lines.push(`  ${hex(i)}: LD HL,${hex(target)}`);
      i += 3;
      continue;
    }

    // DI = 0xF3
    if (b === 0xF3) {
      lines.push(`  ${hex(i)}: DI`);
      continue;
    }

    // EI = 0xFB
    if (b === 0xFB) {
      lines.push(`  ${hex(i)}: EI`);
      continue;
    }
  }

  return { lines, cpValues, branches, calls, hasOrA, hasXorA, storeBack };
}

function disasmBefore(addr) {
  // Scan backward 40 bytes for recognizable instructions
  const lines = [];
  const scanStart = Math.max(0, addr - 40);

  // Just do a hex dump for context and look for key patterns
  const scanEnd = addr;
  const callSites = [];
  const loads = [];

  for (let i = scanStart; i < scanEnd; i++) {
    // CALL nn
    if (rom[i] === 0xCD && i + 3 < scanEnd) {
      const target = addr24(i + 1);
      callSites.push({ offset: i, target });
      lines.push(`  ${hex(i)}: CALL ${hex(target)}`);
    }
    // LD A,(nn)
    if (rom[i] === 0x3A && i + 3 < scanEnd) {
      const target = addr24(i + 1);
      loads.push({ offset: i, target });
      lines.push(`  ${hex(i)}: LD A,(${hex(target)})`);
    }
    // LD HL,nn
    if (rom[i] === 0x21 && i + 3 < scanEnd) {
      const target = addr24(i + 1);
      lines.push(`  ${hex(i)}: LD HL,${hex(target)}`);
    }
    // XOR A
    if (rom[i] === 0xAF) {
      lines.push(`  ${hex(i)}: XOR A`);
    }
    // LD (nn),A
    if (rom[i] === 0x32 && i + 3 < scanEnd) {
      const target = addr24(i + 1);
      lines.push(`  ${hex(i)}: LD (${hex(target)}),A`);
    }
  }

  return { lines, callSites, loads };
}

// ─── Classify each hit ─────────────────────────────────────────────────────

function classify(hit) {
  const after = disasmAfter(hit.addr, hit.len);
  const before = disasmBefore(hit.addr);

  let category = 'unknown';

  if (hit.type === 'writer') {
    // Check if XOR A appears before the write (= clearing)
    const xorBefore = before.lines.some(l => l.includes('XOR A'));
    const ldA0Before = before.lines.some(l => l.includes('LD A,0x00'));
    if (xorBefore || ldA0Before) {
      category = 'clearer';
    } else {
      category = 'writer';
    }
  } else if (hit.type === 'reader') {
    if (after.cpValues.length > 0 && after.branches.length > 0) {
      category = 'dispatcher';
    } else if (after.hasOrA && after.branches.length > 0) {
      category = 'zero-test gate';
    } else if (after.storeBack) {
      category = 'read-modify-write';
    } else if (after.calls.length > 0) {
      category = 'read-and-call';
    } else if (after.branches.length > 0) {
      category = 'conditional reader';
    } else {
      category = 'simple reader';
    }
  } else if (hit.type === 'loader') {
    // HL/DE/BC/IX/IY loaded with the address — pointer setup
    category = 'pointer setup';
  }

  return { ...hit, after, before, category };
}

// ─── Report ────────────────────────────────────────────────────────────────

console.log('=== Phase 408: D141B5 (Final Key Output Buffer) Consumer Scan ===\n');
console.log(`ROM size: ${ROM_SIZE} bytes (${hex(ROM_SIZE)})`);
console.log(`Target address: 0xD141B5\n`);

// Count by pattern
const patternCounts = {};
for (const h of hits) {
  patternCounts[h.pattern] = (patternCounts[h.pattern] || 0) + 1;
}
console.log('Pattern matches:');
for (const [pat, count] of Object.entries(patternCounts)) {
  console.log(`  ${pat}: ${count}`);
}
console.log(`  Total matched: ${hits.length}`);
console.log(`  Raw B5 41 D1 (unmatched): ${rawHits.length}`);

if (rawHits.length > 0) {
  console.log('\n  Unmatched raw B5 41 D1 locations:');
  for (const addr of rawHits) {
    const prefix = addr > 0 ? rom[addr - 1] : 0;
    const prefix2 = addr > 1 ? rom[addr - 2] : 0;
    console.log(`    ${hex(addr)}: preceding bytes: ${hex(prefix2, 2)} ${hex(prefix, 2)}  context: ${hexDump(Math.max(0, addr - 4), 10)}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('=== Detailed Analysis of Each Consumer ===\n');

const classified = hits.map(classify);

// Group by category
const categories = {};
for (const c of classified) {
  if (!categories[c.category]) categories[c.category] = [];
  categories[c.category].push(c);
}

// Print by category
const categoryOrder = ['dispatcher', 'zero-test gate', 'conditional reader', 'read-and-call',
                       'read-modify-write', 'simple reader', 'pointer setup', 'clearer', 'writer', 'unknown'];

for (const cat of categoryOrder) {
  if (!categories[cat]) continue;
  const items = categories[cat];
  console.log(`\n--- Category: ${cat.toUpperCase()} (${items.length} hits) ---\n`);

  for (const item of items) {
    console.log(`  ${hex(item.addr)}: ${item.pattern}  [${item.category}]`);
    console.log(`    Hex before (40B): ${hexDump(Math.max(0, item.addr - 40), 40)}`);
    console.log(`    Instruction:      ${hexDump(item.addr, item.len)}`);
    console.log(`    Hex after (60B):  ${hexDump(item.addr + item.len, 60)}`);

    if (item.before.lines.length > 0) {
      console.log('    Context before:');
      for (const l of item.before.lines) console.log('    ' + l);
    }

    console.log('    Disassembly after:');
    if (item.after.lines.length > 0) {
      for (const l of item.after.lines) console.log('    ' + l);
    } else {
      console.log('      (no recognized instructions in next 60 bytes)');
    }

    if (item.after.cpValues.length > 0) {
      console.log(`    CP values: ${item.after.cpValues.map(c => hex(c.value, 2)).join(', ')}`);
    }
    if (item.after.calls.length > 0) {
      console.log(`    Call targets: ${item.after.calls.map(c => hex(c.target)).join(', ')}`);
    }
    if (item.after.branches.length > 0) {
      console.log(`    Branch targets: ${item.after.branches.map(b => `${b.type} -> ${hex(b.target)}`).join(', ')}`);
    }
    console.log('');
  }
}

// ─── Check cxSwitch (0x08C5D7) region ─────────────────────────────────────

console.log('='.repeat(70));
console.log('=== cxSwitch (0x08C5D7) Check ===\n');

const CX_SWITCH = 0x08C5D7;
const CX_SCAN_START = Math.max(0, CX_SWITCH - 32);
const CX_SCAN_END = Math.min(ROM_SIZE, CX_SWITCH + 256);

let cxHit = false;
for (let i = CX_SCAN_START; i < CX_SCAN_END - 3; i++) {
  if (rom[i + 0] === 0xB5 && rom[i + 1] === 0x41 && rom[i + 2] === 0xD1) {
    const prefix = i > 0 ? rom[i - 1] : 0;
    console.log(`  FOUND D141B5 ref at ${hex(i)}, prefix byte: ${hex(prefix, 2)}`);
    console.log(`  Context: ${hexDump(Math.max(0, i - 6), 16)}`);
    cxHit = true;
  }
}
if (!cxHit) {
  console.log('  No direct D141B5 reference found in cxSwitch region');
  console.log(`  (scanned ${hex(CX_SCAN_START)} .. ${hex(CX_SCAN_END)})`);

  // Check if cxSwitch references D141B5 indirectly via a nearby address range
  console.log('\n  Checking for nearby D141xx references in cxSwitch region...');
  for (let i = CX_SCAN_START; i < CX_SCAN_END - 2; i++) {
    if (rom[i + 1] === 0x41 && rom[i + 2] === 0xD1) {
      const lowByte = rom[i];
      const prefix = i > 0 ? rom[i - 1] : 0;
      console.log(`  D141${lowByte.toString(16).toUpperCase().padStart(2, '0')} ref at ${hex(i)}, prefix: ${hex(prefix, 2)}`);
    }
  }
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('=== SUMMARY ===\n');

console.log('Consumer counts by category:');
for (const cat of categoryOrder) {
  if (!categories[cat]) continue;
  const items = categories[cat];
  console.log(`  ${cat.padEnd(20)} ${items.length}`);
  for (const item of items) {
    console.log(`    ${hex(item.addr)}: ${item.pattern}`);
  }
}

console.log(`\nTotal references: ${hits.length}`);
console.log(`Unmatched raw sequences: ${rawHits.length}`);

// Identify the most likely key dispatcher
const dispatchers = categories['dispatcher'] || [];
if (dispatchers.length > 0) {
  console.log('\n=== KEY DISPATCHERS (most likely key->action path) ===\n');
  for (const d of dispatchers) {
    console.log(`  ${hex(d.addr)}: ${d.pattern}`);
    if (d.after.cpValues.length > 0) {
      console.log(`    Compares against: ${d.after.cpValues.map(c =>
        `${hex(c.value, 2)} (${c.value})`
      ).join(', ')}`);
    }
    if (d.after.calls.length > 0) {
      console.log(`    Calls: ${d.after.calls.map(c => hex(c.target)).join(', ')}`);
    }
    if (d.after.branches.length > 0) {
      console.log(`    Branches: ${d.after.branches.map(b => `${b.type} -> ${hex(b.target)}`).join(', ')}`);
    }
  }
}

const zeroGates = categories['zero-test gate'] || [];
if (zeroGates.length > 0) {
  console.log('\n=== ZERO-TEST GATES (poll-and-skip pattern) ===\n');
  for (const g of zeroGates) {
    console.log(`  ${hex(g.addr)}: ${g.pattern}`);
    if (g.after.branches.length > 0) {
      console.log(`    Branches: ${g.after.branches.map(b => `${b.type} -> ${hex(b.target)}`).join(', ')}`);
    }
  }
}

console.log('\nDone.');
