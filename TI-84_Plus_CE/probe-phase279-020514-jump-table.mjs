/**
 * probe-phase279-020514-jump-table.mjs
 *
 * Trace the jump table at 0x020514:
 *   1. Dump all entries (JP 0xC3 interpretation and raw-pointer interpretation)
 *   2. Find what dispatches into this table
 *   3. Identify the index register
 *   4. Map all targets
 */

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

// ─── 1. Dump jump table at 0x020514 ────────────────────────────────

const TABLE_START = 0x020514;

console.log('═══════════════════════════════════════════════════════');
console.log('  Jump Table at 0x020514 — JP instruction interpretation');
console.log('═══════════════════════════════════════════════════════\n');

// Interpretation A: JP instructions (0xC3 + 3-byte addr = 4 bytes each)
let jpEntries = [];
let off = TABLE_START;
while (off < rom.length && rom[off] === 0xC3) {
  const target = read24(off + 1);
  jpEntries.push({ addr: off, target });
  off += 4;
}

console.log(`Found ${jpEntries.length} consecutive JP entries starting at ${hex(TABLE_START)}:`);
console.log(`Table ends at ${hex(off)} (byte there: ${hex(rom[off], 2)})\n`);

for (let i = 0; i < jpEntries.length; i++) {
  const e = jpEntries[i];
  console.log(`  [${String(i).padStart(3)}] ${hex(e.addr)} : JP ${hex(e.target)}`);
}

// ─── 1b. Also look backwards from TABLE_START ──────────────────────

console.log('\n─── Checking bytes before 0x020514 ───');
let preOff = TABLE_START - 4;
let preCount = 0;
while (preOff >= 0x020000 && rom[preOff] === 0xC3) {
  preCount++;
  preOff -= 4;
}
if (preCount > 0) {
  console.log(`Found ${preCount} more JP entries before the table start.`);
  const realStart = TABLE_START - preCount * 4;
  console.log(`Real table may start at ${hex(realStart)}`);
  // Show them
  for (let a = realStart; a < TABLE_START; a += 4) {
    const t = read24(a + 1);
    console.log(`  ${hex(a)} : JP ${hex(t)}`);
  }
} else {
  console.log(`No JP entries found before ${hex(TABLE_START)}`);
  console.log(`Bytes at ${hex(TABLE_START - 4)}: ${Array.from(rom.slice(TABLE_START - 4, TABLE_START)).map(b => hex(b, 2)).join(' ')}`);
}

// ─── 2. Raw pointer interpretation ─────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Raw 3-byte pointer interpretation');
console.log('═══════════════════════════════════════════════════════\n');

let ptrEntries = [];
for (let i = 0; i < 40; i++) {
  const a = TABLE_START + i * 3;
  const target = read24(a);
  ptrEntries.push({ addr: a, target });
}

// Check which interpretation makes more sense by looking at target ranges
let jpValid = 0, ptrValid = 0;
for (const e of jpEntries) {
  if (e.target >= 0x000100 && e.target < 0x400000) jpValid++;
}
for (const e of ptrEntries) {
  if (e.target >= 0x000100 && e.target < 0x400000) ptrValid++;
}

console.log(`JP interpretation: ${jpValid}/${jpEntries.length} targets in ROM range`);
console.log(`Ptr interpretation: ${ptrValid}/${ptrEntries.length} targets in ROM range`);
console.log(`\nJP interpretation is ${jpValid >= ptrValid ? 'BETTER' : 'WORSE'} — using JP entries.\n`);

// ─── 3. Broader context: what is the table at 0x020000? ────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  Broader jump table context around 0x020000');
console.log('═══════════════════════════════════════════════════════\n');

// Scan from 0x020000 for consecutive JP instructions
let scanStart = 0x020000;
let bigTableEntries = 0;
let bigOff = scanStart;
while (bigOff < 0x030000 && rom[bigOff] === 0xC3) {
  bigTableEntries++;
  bigOff += 4;
}
console.log(`Consecutive JP entries from ${hex(scanStart)}: ${bigTableEntries}`);
console.log(`Table spans ${hex(scanStart)} – ${hex(bigOff - 1)} (${bigOff - scanStart} bytes)`);
console.log(`Entry at index ${(TABLE_START - scanStart) / 4} = offset ${TABLE_START - scanStart} = ${hex(TABLE_START)}`);
const tableIndex = (TABLE_START - scanStart) / 4;
console.log(`\n0x020514 is entry #${tableIndex} in the big table (0-indexed)\n`);

// ─── 4. Find dispatchers — who jumps INTO this table? ──────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  Searching for dispatchers to 0x020514 region');
console.log('═══════════════════════════════════════════════════════\n');

// Search for references to 0x020514 in ROM (LE bytes: 0x14, 0x05, 0x02)
const target14 = 0x14, target05 = 0x05, target02 = 0x02;
let refs020514 = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === target14 && rom[i + 1] === target05 && rom[i + 2] === target02) {
    if (i === TABLE_START + 1) continue; // skip self-reference if any
    refs020514.push(i);
  }
}

console.log(`References to 0x020514 (raw bytes 14 05 02) found at ${refs020514.length} locations:`);
for (const r of refs020514) {
  const ctx = rom.slice(Math.max(0, r - 4), r + 6);
  const prevByte = r > 0 ? rom[r - 1] : 0;
  const prevByte3 = r > 2 ? rom[r - 3] : 0;
  let annotation = '';
  if (prevByte === 0x21) annotation = ' ← LD HL, 0x020514';
  else if (prevByte === 0xC3) annotation = ' ← JP 0x020514';
  else if (prevByte === 0xCD) annotation = ' ← CALL 0x020514';
  else if (prevByte3 === 0x21) annotation = ' (LD HL,xxx 3 bytes before)';
  console.log(`  ${hex(r)} (instr at ~${hex(r - 1)}): [...${Array.from(ctx).map(b => hex(b, 2)).join(' ')}...]${annotation}`);
}

// Also search for the big table base 0x020000
console.log('\nReferences to 0x020000 (base of big jump table):');
let refs020000 = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0x00 && rom[i + 1] === 0x00 && rom[i + 2] === 0x02 && i !== 0x020000) {
    // Check if preceded by LD HL (0x21)
    if (i > 0 && rom[i - 1] === 0x21) {
      refs020000.push(i);
    }
  }
}
for (const r of refs020000) {
  const ctx = rom.slice(Math.max(0, r - 4), r + 8);
  console.log(`  ${hex(r - 1)}: LD HL, 0x020000  ctx=[${Array.from(ctx).map(b => hex(b, 2)).join(' ')}]`);
}

// Search more broadly for any reference to addresses 0x0204xx-0x0206xx
// that could be computed jump into the table
console.log('\n─── Searching for JP (HL) / JP (IX) / JP (IY) near table refs ───');

// Find all JP (HL) = 0xE9 in ROM
let jpHL_locations = [];
for (let i = 0; i < rom.length; i++) {
  if (rom[i] === 0xE9) {
    // Check if preceded (within 20 bytes) by LD HL,0x0200xx or LD HL,0x0205xx
    for (let j = Math.max(0, i - 30); j < i; j++) {
      if (rom[j] === 0x21) { // LD HL, imm24
        const imm = read24(j + 1);
        if (imm >= 0x020000 && imm < 0x020000 + bigTableEntries * 4) {
          jpHL_locations.push({ jpAddr: i, ldAddr: j, base: imm });
        }
      }
    }
  }
}

console.log(`Found ${jpHL_locations.length} JP (HL) dispatchers with table base load:`);
for (const loc of jpHL_locations) {
  // Dump context around the LD HL
  const start = Math.max(0, loc.ldAddr - 4);
  const end = Math.min(rom.length, loc.jpAddr + 4);
  const ctx = rom.slice(start, end);
  console.log(`  LD HL,${hex(loc.base)} at ${hex(loc.ldAddr)}, JP (HL) at ${hex(loc.jpAddr)}`);
  console.log(`    bytes: ${Array.from(ctx).map(b => hex(b, 2)).join(' ')}`);

  // Try to decode the instructions between LD HL and JP (HL)
  console.log('    --- disassembly sketch ---');
  let pc = loc.ldAddr;
  const endPc = loc.jpAddr + 1;
  while (pc < endPc && pc < rom.length) {
    const byte0 = rom[pc];
    if (byte0 === 0x21) {
      const imm = read24(pc + 1);
      console.log(`    ${hex(pc)}: LD HL, ${hex(imm)}`);
      pc += 4;
    } else if (byte0 === 0xE9) {
      console.log(`    ${hex(pc)}: JP (HL)`);
      pc += 1;
    } else if (byte0 === 0x29) {
      console.log(`    ${hex(pc)}: ADD HL, HL`);
      pc += 1;
    } else if (byte0 === 0x09) {
      console.log(`    ${hex(pc)}: ADD HL, BC`);
      pc += 1;
    } else if (byte0 === 0x19) {
      console.log(`    ${hex(pc)}: ADD HL, DE`);
      pc += 1;
    } else if (byte0 === 0x5F) {
      console.log(`    ${hex(pc)}: LD E, A`);
      pc += 1;
    } else if (byte0 === 0x57) {
      console.log(`    ${hex(pc)}: LD D, A`);
      pc += 1;
    } else if (byte0 === 0x16) {
      console.log(`    ${hex(pc)}: LD D, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x1E) {
      console.log(`    ${hex(pc)}: LD E, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x87) {
      console.log(`    ${hex(pc)}: ADD A, A`);
      pc += 1;
    } else if (byte0 === 0xCB) {
      const cb = rom[pc + 1];
      if (cb === 0x27) { console.log(`    ${hex(pc)}: SLA A`); pc += 2; }
      else if (cb === 0x37) { console.log(`    ${hex(pc)}: SLL A (swap)`); pc += 2; }
      else { console.log(`    ${hex(pc)}: CB ${hex(cb, 2)}`); pc += 2; }
    } else if (byte0 === 0x6F) {
      console.log(`    ${hex(pc)}: LD L, A`);
      pc += 1;
    } else if (byte0 === 0x26) {
      console.log(`    ${hex(pc)}: LD H, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x7E) {
      console.log(`    ${hex(pc)}: LD A, (HL)`);
      pc += 1;
    } else if (byte0 === 0x46) {
      console.log(`    ${hex(pc)}: LD B, (HL)`);
      pc += 1;
    } else if (byte0 === 0x4E) {
      console.log(`    ${hex(pc)}: LD C, (HL)`);
      pc += 1;
    } else if (byte0 === 0x56) {
      console.log(`    ${hex(pc)}: LD D, (HL)`);
      pc += 1;
    } else if (byte0 === 0x5E) {
      console.log(`    ${hex(pc)}: LD E, (HL)`);
      pc += 1;
    } else if (byte0 === 0x66) {
      console.log(`    ${hex(pc)}: LD H, (HL)`);
      pc += 1;
    } else if (byte0 === 0x2E) {
      console.log(`    ${hex(pc)}: LD L, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0xED) {
      // eZ80 prefix — skip smartly
      console.log(`    ${hex(pc)}: ED ${hex(rom[pc + 1], 2)} ...`);
      pc += 2;
    } else if (byte0 === 0x3E) {
      console.log(`    ${hex(pc)}: LD A, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0xC6) {
      console.log(`    ${hex(pc)}: ADD A, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0xFE) {
      console.log(`    ${hex(pc)}: CP ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x38) {
      console.log(`    ${hex(pc)}: JR C, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x30) {
      console.log(`    ${hex(pc)}: JR NC, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x28) {
      console.log(`    ${hex(pc)}: JR Z, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x20) {
      console.log(`    ${hex(pc)}: JR NZ, ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0x18) {
      console.log(`    ${hex(pc)}: JR ${hex(rom[pc + 1], 2)}`);
      pc += 2;
    } else if (byte0 === 0xC9) {
      console.log(`    ${hex(pc)}: RET`);
      pc += 1;
    } else {
      console.log(`    ${hex(pc)}: ?? ${hex(byte0, 2)}`);
      pc += 1;
    }
  }
}

// ─── 5. Specific entries around the known targets ──────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Known targets from session 278');
console.log('═══════════════════════════════════════════════════════\n');

const knownTargets = [
  { addr: 0x020524, expected: 0x0822C6 },
  { addr: 0x020530, expected: 0x082380 },
  { addr: 0x020534, expected: 0x08238A },
];

for (const k of knownTargets) {
  const opcode = rom[k.addr];
  const target = read24(k.addr + 1);
  const entryIdx = (k.addr - scanStart) / 4;
  console.log(`  ${hex(k.addr)} (entry #${entryIdx}): opcode=${hex(opcode, 2)} target=${hex(target)} expected=${hex(k.expected)} ${target === k.expected ? '✓ MATCH' : '✗ MISMATCH'}`);
}

// ─── 6. Target clustering ──────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Target clustering (all JP entries from big table)');
console.log('═══════════════════════════════════════════════════════\n');

// Collect all targets from the big table
let allTargets = [];
for (let i = 0; i < bigTableEntries; i++) {
  const a = scanStart + i * 4;
  const t = read24(a + 1);
  allTargets.push(t);
}

// Group by high 16 bits
let groups = {};
for (const t of allTargets) {
  const hi = (t >> 8) & 0xFFFF;
  const key = hex(hi << 8, 6);
  if (!groups[key]) groups[key] = 0;
  groups[key]++;
}

const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
console.log('Top target address ranges:');
for (const [range, count] of sorted.slice(0, 20)) {
  console.log(`  ${range}xx : ${count} entries`);
}

// ─── 7. Show neighborhood of 0x020514 specifically ─────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Entries around 0x020514 (±10 entries)');
console.log('═══════════════════════════════════════════════════════\n');

const centerIdx = (TABLE_START - scanStart) / 4;
for (let i = Math.max(0, centerIdx - 10); i < Math.min(bigTableEntries, centerIdx + 20); i++) {
  const a = scanStart + i * 4;
  const t = read24(a + 1);
  const marker = a === TABLE_START ? ' ◄── 0x020514' : '';
  console.log(`  [${String(i).padStart(4)}] ${hex(a)} : JP ${hex(t)}${marker}`);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Done.');
console.log('═══════════════════════════════════════════════════════');
