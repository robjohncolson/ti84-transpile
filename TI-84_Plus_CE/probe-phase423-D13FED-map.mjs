#!/usr/bin/env node

// Phase 423 — Map all ROM references to D13FED connection table (D13FED..D13FFB)
// Scans the full 4MB ROM for 3-byte little-endian address patterns pointing into
// the 5-slot descriptor pointer table, extracts surrounding context bytes, and
// classifies instruction types from raw eZ80 opcodes.

import { readFileSync } from 'fs';

process.emitWarning = () => {};

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// --- Configuration ---

const TABLE_BASE = 0xD13FED;
const TABLE_ENTRIES = 5;
const ENTRY_SIZE = 3;
const TABLE_END = TABLE_BASE + TABLE_ENTRIES * ENTRY_SIZE; // D13FFC exclusive
const CONTEXT_BEFORE = 16;
const CONTEXT_AFTER = 16;

// --- Helpers ---

function hex(v, w = 6) {
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function dumpBytes(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= 0 && idx < buf.length) {
      parts.push(hexByte(buf[idx]));
    }
  }
  return parts.join(' ');
}

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// Find all occurrences of a 3-byte LE pattern in the ROM
function findLE24(buf, addr) {
  const b0 = addr & 0xFF;
  const b1 = (addr >> 8) & 0xFF;
  const b2 = (addr >> 16) & 0xFF;
  const results = [];
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === b0 && buf[i + 1] === b1 && buf[i + 2] === b2) {
      results.push(i);
    }
  }
  return results;
}

// Classify the instruction that embeds the 3-byte immediate at `immOff`.
// In eZ80 ADL mode, many instructions have a 3-byte immediate as their last 3 bytes.
// We look at the bytes BEFORE the immediate to identify the opcode.
function classifyInstruction(buf, immOff) {
  // Check bytes before the immediate for known eZ80 opcodes
  // Common patterns in ADL mode with 3-byte immediates:
  //   01 xx xx xx  = LD BC,nn24
  //   11 xx xx xx  = LD DE,nn24
  //   21 xx xx xx  = LD HL,nn24
  //   31 xx xx xx  = LD SP,nn24
  //   CD xx xx xx  = CALL nn24
  //   C3 xx xx xx  = JP nn24
  //   C2/CA/D2/DA/E2/EA/F2/FA = JP cc,nn24
  //   C4/CC/D4/DC/E4/EC/F4/FC = CALL cc,nn24
  //   3A xx xx xx  = LD A,(nn24)
  //   32 xx xx xx  = LD (nn24),A
  //   ED 43 xx xx xx = LD (nn24),BC
  //   ED 53 xx xx xx = LD (nn24),DE
  //   ED 63 xx xx xx = LD (nn24),HL  (actually: SIL prefix then context)
  //   ED 4B xx xx xx = LD BC,(nn24)
  //   ED 5B xx xx xx = LD DE,(nn24)
  //   ED 6B xx xx xx = LD HL,(nn24)  (note: actually uses ED prefix)
  //   ED 07 xx xx xx = LD BC,(nn24)  (eZ80 long: LD.LIL BC,(nn24))
  //   ED 0F xx xx xx = LD (nn24),BC  (eZ80 long store)
  //   ED 17 xx xx xx = LD DE,(nn24)
  //   ED 1F xx xx xx = LD (nn24),DE
  //   ED 27 xx xx xx = LD HL,(nn24)
  //   ED 2F xx xx xx = LD (nn24),HL
  //   ED 31 xx xx xx = LD IY,(nn24) or LD IX,... depending
  //   ED 37 xx xx xx = LD (nn24),IY or IX

  if (immOff < 1) return { op: 'UNKNOWN', access: 'UNKNOWN' };

  const b1 = buf[immOff - 1]; // byte just before immediate

  // Single-byte prefix opcodes
  const singleByteOps = {
    0x01: { op: 'LD BC,nn', access: 'IMM' },
    0x11: { op: 'LD DE,nn', access: 'IMM' },
    0x21: { op: 'LD HL,nn', access: 'IMM' },
    0x31: { op: 'LD SP,nn', access: 'IMM' },
    0xCD: { op: 'CALL nn', access: 'CALL' },
    0xC3: { op: 'JP nn', access: 'JP' },
    0x3A: { op: 'LD A,(nn)', access: 'READ' },
    0x32: { op: 'LD (nn),A', access: 'WRITE' },
    0xC2: { op: 'JP NZ,nn', access: 'JP' },
    0xCA: { op: 'JP Z,nn', access: 'JP' },
    0xD2: { op: 'JP NC,nn', access: 'JP' },
    0xDA: { op: 'JP C,nn', access: 'JP' },
    0xE2: { op: 'JP PO,nn', access: 'JP' },
    0xEA: { op: 'JP PE,nn', access: 'JP' },
    0xF2: { op: 'JP P,nn', access: 'JP' },
    0xFA: { op: 'JP M,nn', access: 'JP' },
    0xC4: { op: 'CALL NZ,nn', access: 'CALL' },
    0xCC: { op: 'CALL Z,nn', access: 'CALL' },
    0xD4: { op: 'CALL NC,nn', access: 'CALL' },
    0xDC: { op: 'CALL C,nn', access: 'CALL' },
    0xE4: { op: 'CALL PO,nn', access: 'CALL' },
    0xEC: { op: 'CALL PE,nn', access: 'CALL' },
    0xF4: { op: 'CALL P,nn', access: 'CALL' },
    0xFC: { op: 'CALL M,nn', access: 'CALL' },
  };

  if (singleByteOps[b1]) return singleByteOps[b1];

  // ED-prefixed (2 bytes before immediate)
  if (immOff >= 2 && buf[immOff - 2] === 0xED) {
    const edOps = {
      0x07: { op: 'LD BC,(nn)', access: 'READ' },
      0x0F: { op: 'LD (nn),BC', access: 'WRITE' },
      0x17: { op: 'LD DE,(nn)', access: 'READ' },
      0x1F: { op: 'LD (nn),DE', access: 'WRITE' },
      0x27: { op: 'LD HL,(nn)', access: 'READ' },
      0x2F: { op: 'LD (nn),HL', access: 'WRITE' },
      0x31: { op: 'LD IX/IY,(nn)', access: 'READ' },
      0x37: { op: 'LD (nn),IX/IY', access: 'WRITE' },
      0x43: { op: 'LD (nn),BC', access: 'WRITE' },
      0x4B: { op: 'LD BC,(nn)', access: 'READ' },
      0x53: { op: 'LD (nn),DE', access: 'WRITE' },
      0x5B: { op: 'LD DE,(nn)', access: 'READ' },
      0x63: { op: 'LD (nn),HL', access: 'WRITE' },
      0x6B: { op: 'LD HL,(nn)', access: 'READ' },
      0x73: { op: 'LD (nn),SP', access: 'WRITE' },
      0x7B: { op: 'LD SP,(nn)', access: 'READ' },
    };
    if (edOps[b1]) return edOps[b1];
  }

  // DD/FD-prefixed (IX/IY + immediate)
  if (immOff >= 2) {
    const prefix = buf[immOff - 2];
    if (prefix === 0xDD || prefix === 0xFD) {
      const regName = prefix === 0xDD ? 'IX' : 'IY';
      const ixOps = {
        0x21: { op: `LD ${regName},nn`, access: 'IMM' },
        0x2A: { op: `LD ${regName},(nn)`, access: 'READ' },
        0x22: { op: `LD (nn),${regName}`, access: 'WRITE' },
      };
      if (ixOps[b1]) return ixOps[b1];
    }
  }

  // eZ80 suffix-mode prefix bytes: 0x40=SIS, 0x49=LIS, 0x52=SIL, 0x5B=LIL
  // These prefix the next instruction. Check if immOff-2 is a mode suffix
  // and immOff-1 is the real opcode.
  if (immOff >= 2) {
    const maybeSuffix = buf[immOff - 2];
    if (maybeSuffix === 0x40 || maybeSuffix === 0x49 || maybeSuffix === 0x52 || maybeSuffix === 0x5B) {
      if (singleByteOps[b1]) {
        const suffixName = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' }[maybeSuffix];
        return { op: singleByteOps[b1].op + suffixName, access: singleByteOps[b1].access };
      }
    }
  }

  // C5 = PUSH BC — if the address is pushed as an argument
  if (b1 === 0xC5 || b1 === 0xD5 || b1 === 0xE5 || b1 === 0xF5) {
    // The PUSH is AFTER the LD, so the immediate is actually for the LD before
    // This case is ambiguous — skip
  }

  return { op: `UNKNOWN (prev byte: ${hexByte(b1)})`, access: 'UNKNOWN' };
}

// --- Main scan ---

console.log('=== Phase 423: D13FED Connection Table Reference Map ===\n');
console.log(`Table range: ${hex(TABLE_BASE)} .. ${hex(TABLE_END - 1)} (${TABLE_ENTRIES} entries x ${ENTRY_SIZE} bytes)\n`);

// Scan every byte address in the table range, plus the base address itself
const allRefs = new Map(); // addr -> [{romOffset, op, access}]

for (let addr = TABLE_BASE; addr < TABLE_END; addr++) {
  const entryIndex = Math.floor((addr - TABLE_BASE) / ENTRY_SIZE);
  const byteOffset = (addr - TABLE_BASE) % ENTRY_SIZE;
  const refs = findLE24(rom, addr);

  if (refs.length === 0) continue;

  const label = `entry[${entryIndex}]+${byteOffset}`;
  const details = [];

  for (const romOff of refs) {
    const cls = classifyInstruction(rom, romOff);
    details.push({
      romOffset: romOff,
      ...cls,
    });
  }

  allRefs.set(addr, { label, entryIndex, byteOffset, details });
}

// --- Report per-address ---

let totalRefs = 0;
const refsByEntry = new Map(); // entryIndex -> count
const refsByAccess = new Map(); // access -> count
const allSites = []; // for dedup summary

for (const [addr, info] of allRefs) {
  console.log(`\n--- ${hex(addr)} (${info.label}) — ${info.details.length} reference(s) ---`);

  const existing = refsByEntry.get(info.entryIndex) || 0;
  refsByEntry.set(info.entryIndex, existing + info.details.length);

  for (const detail of info.details) {
    totalRefs++;
    const off = detail.romOffset;
    const contextStart = Math.max(0, off - CONTEXT_BEFORE);
    const contextEnd = Math.min(rom.length, off + 3 + CONTEXT_AFTER);

    const accessCount = refsByAccess.get(detail.access) || 0;
    refsByAccess.set(detail.access, accessCount + 1);

    allSites.push({ addr, romOffset: off, op: detail.op, access: detail.access });

    console.log(`  ${hex(off)}: ${detail.op}  [${detail.access}]`);
    console.log(`    context: ...${dumpBytes(rom, off - 4, 4)} [${dumpBytes(rom, off, 3)}] ${dumpBytes(rom, off + 3, 4)}...`);
  }
}

// --- Summary table ---

console.log('\n\n=== ENTRY SUMMARY ===\n');
console.log('Entry | Address  | Refs | Details');
console.log('------|----------|------|--------');

for (let i = 0; i < TABLE_ENTRIES; i++) {
  const addr = TABLE_BASE + i * ENTRY_SIZE;
  const count = refsByEntry.get(i) || 0;

  // Gather access types for this entry
  const accessCounts = {};
  for (let byteOff = 0; byteOff < ENTRY_SIZE; byteOff++) {
    const a = addr + byteOff;
    const info = allRefs.get(a);
    if (info) {
      for (const d of info.details) {
        accessCounts[d.access] = (accessCounts[d.access] || 0) + 1;
      }
    }
  }

  const accessStr = Object.entries(accessCounts).map(([k, v]) => `${k}:${v}`).join(', ');
  console.log(`  ${i}   | ${hex(addr)} | ${String(count).padStart(4)} | ${accessStr || '(none)'}`);
}

// --- Access type breakdown ---

console.log('\n\n=== ACCESS TYPE BREAKDOWN ===\n');
for (const [access, count] of [...refsByAccess.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${access}: ${count}`);
}

// --- Grouped by ROM region ---

console.log('\n\n=== REFERENCES GROUPED BY ROM REGION ===\n');

const regionGroups = new Map(); // region prefix -> sites
for (const site of allSites) {
  const regionKey = hex(site.romOffset & 0xFFFF00, 6);
  if (!regionGroups.has(regionKey)) regionGroups.set(regionKey, []);
  regionGroups.get(regionKey).push(site);
}

for (const [region, sites] of [...regionGroups.entries()].sort()) {
  console.log(`Region ${region}xx (${sites.length} refs):`);
  for (const s of sites) {
    console.log(`  ${hex(s.romOffset)}: ${s.op}  -> ${hex(s.addr)} [${s.access}]`);
  }
}

// --- Struct field dereference analysis ---
// After LD HL/BC,D13FED + ADD HL,BC, the code typically does ED 27 (LD HL,(HL))
// to dereference the pointer, then accesses struct fields via HL+offset.
// Look for ED 27 or ED 07 or ED 31 within a few bytes after each IMM reference.

console.log('\n\n=== DEREFERENCE PATTERNS (post-load instructions) ===\n');
console.log('For each IMM load of D13FED, show the next ~30 bytes to identify');
console.log('pointer dereferences and struct field accesses.\n');

const immSites = allSites.filter(s => s.access === 'IMM' && s.addr === TABLE_BASE);

for (const site of immSites) {
  const off = site.romOffset;
  // The LD BC,nn instruction starts at off-1 (01 prefix), so next instr at off+3
  const nextStart = off + 3;
  console.log(`--- Site ${hex(off)} (instr at ${hex(off - 1)}): ${site.op} ---`);
  console.log(`  Following 40 bytes: ${dumpBytes(rom, nextStart, 40)}`);

  // Look for key eZ80 patterns in the next 20 bytes
  for (let i = 0; i < 20; i++) {
    const pos = nextStart + i;
    if (pos + 1 >= rom.length) break;
    const b0 = rom[pos];
    const b1 = rom[pos + 1];

    // ED 07 = LD BC,(HL)  — deref through HL
    // ED 27 = LD HL,(HL)  — deref through HL (most common)
    // ED 31 = LD IX/IY,(HL) — deref through HL
    // ED 37 = LD (HL),IX/IY — store through HL
    // ED 0F = LD (HL),BC  — store through HL
    // ED 1F = LD (HL),DE  — store through HL
    if (b0 === 0xED) {
      const edTag = {
        0x07: 'LD BC,(HL) — ptr deref',
        0x0F: 'LD (HL),BC — ptr store',
        0x17: 'LD DE,(HL) — ptr deref',
        0x1F: 'LD (HL),DE — ptr store',
        0x27: 'LD HL,(HL) — ptr deref',
        0x2F: 'LD (HL),HL — ptr store',
        0x31: 'LD IY/IX,(HL) — ptr deref',
        0x37: 'LD (HL),IY/IX — ptr store',
      }[b1];
      if (edTag) {
        console.log(`  +${i}: ED ${hexByte(b1)} = ${edTag}`);
      }
    }

    // FD 7E dd = LD A,(IY+d) — struct field read
    // FD 27 = prefix for struct access
    // DD 7E dd = LD A,(IX+d) — struct field read (frame)
    // DD 0F = eZ80 LD (IX+d) family
    if (b0 === 0xFD && pos + 2 < rom.length) {
      if (b1 === 0x7E) {
        const disp = rom[pos + 2];
        console.log(`  +${i}: FD 7E ${hexByte(disp)} = LD A,(IY+${disp}) — struct field +${disp} read`);
      }
      if (b1 === 0x27) {
        console.log(`  +${i}: FD 27 = eZ80 suffix (LD HL,(IY+d) family)`);
      }
      if (b1 === 0x0F) {
        console.log(`  +${i}: FD 0F = eZ80 suffix (store through IY family)`);
      }
      if (b1 === 0x37) {
        console.log(`  +${i}: FD 37 = eZ80 suffix (LD (IY+d) family)`);
      }
    }

    if (b0 === 0xDD && pos + 2 < rom.length) {
      if (b1 === 0x7E) {
        const disp = rom[pos + 2];
        console.log(`  +${i}: DD 7E ${hexByte(disp)} = LD A,(IX+${disp}) — frame var +${disp}`);
      }
      if (b1 === 0x07) {
        console.log(`  +${i}: DD 07 = eZ80 suffix (load through IX family)`);
      }
      if (b1 === 0x0F) {
        console.log(`  +${i}: DD 0F = eZ80 suffix (store/load IX family)`);
      }
      if (b1 === 0x27) {
        console.log(`  +${i}: DD 27 = eZ80 suffix (LD HL,(IX+d) family)`);
      }
      if (b1 === 0x31) {
        console.log(`  +${i}: DD 31 = eZ80 suffix (LD IY,(IX+d) family)`);
      }
    }
  }
  console.log();
}

// --- D13FF0, D13FF3, D13FF6, D13FF9 direct-load analysis ---

console.log('\n=== DIRECT ENTRY ACCESSES (entries 1-4) ===\n');

for (let entry = 1; entry < TABLE_ENTRIES; entry++) {
  const addr = TABLE_BASE + entry * ENTRY_SIZE;
  const info = allRefs.get(addr);
  if (!info) {
    console.log(`Entry ${entry} (${hex(addr)}): no references found`);
    continue;
  }

  console.log(`Entry ${entry} (${hex(addr)}): ${info.details.length} reference(s)`);
  for (const d of info.details) {
    const off = d.romOffset;
    console.log(`  ${hex(off)}: ${d.op}  [${d.access}]`);
    console.log(`    Following 30 bytes: ${dumpBytes(rom, off + 3, 30)}`);

    // Show struct field accesses after dereference
    for (let i = 0; i < 30; i++) {
      const pos = off + 3 + i;
      if (pos + 2 >= rom.length) break;
      if (rom[pos] === 0xFD && rom[pos + 1] === 0x7E) {
        console.log(`    +${i + 3}: FD 7E ${hexByte(rom[pos + 2])} = LD A,(IY+${rom[pos + 2]}) — struct field +${rom[pos + 2]}`);
      }
      if (rom[pos] === 0xFD && rom[pos + 1] === 0x27) {
        console.log(`    +${i + 3}: FD 27 = dereference through IY`);
      }
      if (rom[pos] === 0xED && rom[pos + 1] === 0x27) {
        console.log(`    +${i + 3}: ED 27 = LD HL,(HL) — dereference`);
      }
      if (rom[pos] === 0xED && rom[pos + 1] === 0x07) {
        console.log(`    +${i + 3}: ED 07 = LD BC,(HL) — dereference`);
      }
      if (rom[pos] === 0xED && rom[pos + 1] === 0x0F) {
        console.log(`    +${i + 3}: ED 0F = LD (HL),BC — store through HL`);
      }
      if (rom[pos] === 0xED && rom[pos + 1] === 0x31) {
        console.log(`    +${i + 3}: ED 31 = LD IY,(HL) — dereference into IY`);
      }
    }
  }
  console.log();
}

// --- Related RAM: D14014 and D141E2 reference counts ---

console.log('\n=== RELATED RAM REFERENCE COUNTS ===\n');

for (const [name, addr] of [['D13FE7', 0xD13FE7], ['D14014', 0xD14014], ['D141E2', 0xD141E2], ['D141BB', 0xD141BB]]) {
  const refs = findLE24(rom, addr);
  const readCount = refs.filter(off => {
    const cls = classifyInstruction(rom, off);
    return cls.access === 'READ';
  }).length;
  const writeCount = refs.filter(off => {
    const cls = classifyInstruction(rom, off);
    return cls.access === 'WRITE';
  }).length;
  const immCount = refs.filter(off => {
    const cls = classifyInstruction(rom, off);
    return cls.access === 'IMM';
  }).length;

  console.log(`${name} (${hex(addr)}): ${refs.length} total refs (READ:${readCount}, WRITE:${writeCount}, IMM:${immCount})`);

  // Show first 8
  for (const off of refs.slice(0, 8)) {
    const cls = classifyInstruction(rom, off);
    console.log(`  ${hex(off)}: ${cls.op} [${cls.access}]`);
  }
  if (refs.length > 8) console.log(`  ... and ${refs.length - 8} more`);
  console.log();
}

// --- Known struct field map ---

console.log('\n=== KNOWN DESCRIPTOR STRUCT FIELD MAP (from phase 421) ===\n');
console.log('Offset | Size | Purpose');
console.log('-------|------|--------');
console.log('+0     | 3    | Callback pointer (loaded into IY, dispatched via CALL 0x002288)');
console.log('+8     | 1    | Flag byte: bit 7 = busy/active');
console.log('+9     | 3    | Primary context/session pointer (matched against D14014)');
console.log('+12    | 3    | Secondary working pointer');
console.log('+18    | 3    | Size/start field');
console.log('+21    | 3    | Size/limit field');
console.log('+27    | 1    | Staged disposition/state (values: 0, 3, 5, 7)');

console.log('\n=== DONE ===');
