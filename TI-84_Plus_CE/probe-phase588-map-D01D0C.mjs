/**
 * probe-phase588-map-D01D0C.mjs
 *
 * Scans the entire ROM (0x000000-0x3FFFFF) for all references to RAM address
 * D01D0C, categorizes them as READ/WRITE/ADDRESS, and scans nearby D01D0x
 * addresses for structure context.
 */
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = rom.length; // 4MB = 0x400000

// Target address and nearby addresses to scan
const TARGET = 0xD01D0C;
const NEARBY = [0xD01D0A, 0xD01D0B, 0xD01D0C, 0xD01D0D, 0xD01D0E, 0xD01D0F];

/**
 * Scan ROM for 3-byte little-endian encoding of a 24-bit address.
 * For each match, look at preceding bytes to classify the instruction.
 */
function scanAddress(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;

  const refs = [];

  for (let i = 0; i < ROM_SIZE - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const ref = classifyRef(i, addr);
      refs.push(ref);
    }
  }
  return refs;
}

function hex(n, w = 6) {
  return '0x' + n.toString(16).toUpperCase().padStart(w, '0');
}

function classifyRef(dataOffset, addr) {
  const b1 = dataOffset >= 1 ? rom[dataOffset - 1] : -1;
  const b2 = dataOffset >= 2 ? rom[dataOffset - 2] : -1;
  const b3 = dataOffset >= 3 ? rom[dataOffset - 3] : -1;

  let type = 'UNKNOWN';
  let instr = '???';
  let instrAddr = dataOffset;

  // Check for DD ED / FD ED prefixed (IX/IY via ED opcodes)
  if (b3 === 0xDD && b2 === 0xED) {
    instrAddr = dataOffset - 3;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD.LIL BC,(${hex(addr)})`; break;
      case 0x5B: type = 'READ';  instr = `LD.LIL DE,(${hex(addr)})`; break;
      case 0x6B: type = 'READ';  instr = `LD.LIL IX,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD.LIL SP,(${hex(addr)})`; break;
      case 0x43: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),BC`; break;
      case 0x53: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),DE`; break;
      case 0x63: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),IX`; break;
      case 0x73: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),SP`; break;
    }
  }
  if (type === 'UNKNOWN' && b3 === 0xFD && b2 === 0xED) {
    instrAddr = dataOffset - 3;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD.LIL BC,(${hex(addr)}) [FD]`; break;
      case 0x5B: type = 'READ';  instr = `LD.LIL DE,(${hex(addr)}) [FD]`; break;
      case 0x6B: type = 'READ';  instr = `LD.LIL IY,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD.LIL SP,(${hex(addr)}) [FD]`; break;
      case 0x43: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),BC [FD]`; break;
      case 0x53: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),DE [FD]`; break;
      case 0x63: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),IY`; break;
      case 0x73: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),SP [FD]`; break;
    }
  }

  // Check for ED-prefixed instructions (2-byte opcode + 3-byte address)
  if (type === 'UNKNOWN' && b2 === 0xED) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD BC,(${hex(addr)})`; break;
      case 0x5B: type = 'READ';  instr = `LD DE,(${hex(addr)})`; break;
      case 0x6B: type = 'READ';  instr = `LD HL,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD SP,(${hex(addr)})`; break;
      case 0x43: type = 'WRITE'; instr = `LD (${hex(addr)}),BC`; break;
      case 0x53: type = 'WRITE'; instr = `LD (${hex(addr)}),DE`; break;
      case 0x63: type = 'WRITE'; instr = `LD (${hex(addr)}),HL`; break;
      case 0x73: type = 'WRITE'; instr = `LD (${hex(addr)}),SP`; break;
    }
  }

  // Check for DD/FD prefixed single-byte opcodes
  if (type === 'UNKNOWN' && b2 === 0xDD) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x21: type = 'ADDR';  instr = `LD IX,${hex(addr)}`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),IX`; break;
      case 0x2A: type = 'READ';  instr = `LD IX,(${hex(addr)})`; break;
    }
  }
  if (type === 'UNKNOWN' && b2 === 0xFD) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x21: type = 'ADDR';  instr = `LD IY,${hex(addr)}`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),IY`; break;
      case 0x2A: type = 'READ';  instr = `LD IY,(${hex(addr)})`; break;
    }
  }

  // Check unprefixed single-byte opcodes
  if (type === 'UNKNOWN') {
    instrAddr = dataOffset - 1;
    switch (b1) {
      case 0x3A: type = 'READ';  instr = `LD A,(${hex(addr)})`; break;
      case 0x2A: type = 'READ';  instr = `LD HL,(${hex(addr)})`; break;
      case 0x32: type = 'WRITE'; instr = `LD (${hex(addr)}),A`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),HL`; break;
      case 0x21: type = 'ADDR';  instr = `LD HL,${hex(addr)}`; break;
      case 0x01: type = 'ADDR';  instr = `LD BC,${hex(addr)}`; break;
      case 0x11: type = 'ADDR';  instr = `LD DE,${hex(addr)}`; break;
      case 0x31: type = 'ADDR';  instr = `LD SP,${hex(addr)}`; break;
      case 0xC3: type = 'JUMP';  instr = `JP ${hex(addr)}`; break;
      case 0xCD: type = 'CALL';  instr = `CALL ${hex(addr)}`; break;
      case 0xC2: type = 'JUMP';  instr = `JP NZ,${hex(addr)}`; break;
      case 0xCA: type = 'JUMP';  instr = `JP Z,${hex(addr)}`; break;
      case 0xD2: type = 'JUMP';  instr = `JP NC,${hex(addr)}`; break;
      case 0xDA: type = 'JUMP';  instr = `JP C,${hex(addr)}`; break;
      case 0xC4: type = 'CALL';  instr = `CALL NZ,${hex(addr)}`; break;
      case 0xCC: type = 'CALL';  instr = `CALL Z,${hex(addr)}`; break;
      case 0xD4: type = 'CALL';  instr = `CALL NC,${hex(addr)}`; break;
      case 0xDC: type = 'CALL';  instr = `CALL C,${hex(addr)}`; break;
      case 0xE2: type = 'JUMP';  instr = `JP PO,${hex(addr)}`; break;
      case 0xEA: type = 'JUMP';  instr = `JP PE,${hex(addr)}`; break;
      case 0xF2: type = 'JUMP';  instr = `JP P,${hex(addr)}`; break;
      case 0xFA: type = 'JUMP';  instr = `JP M,${hex(addr)}`; break;
      case 0xE4: type = 'CALL';  instr = `CALL PO,${hex(addr)}`; break;
      case 0xEC: type = 'CALL';  instr = `CALL PE,${hex(addr)}`; break;
      case 0xF4: type = 'CALL';  instr = `CALL P,${hex(addr)}`; break;
      case 0xFC: type = 'CALL';  instr = `CALL M,${hex(addr)}`; break;
      default:
        type = 'DATA/UNK';
        instr = `[byte before: ${hex(b1, 2)}] addr bytes at ${hex(dataOffset)}`;
        instrAddr = dataOffset;
        break;
    }
  }

  return { instrAddr, dataOffset, type, instr, addr };
}

// ── Main scan ──

console.log('=== D01D0C Reference Scanner ===');
console.log(`ROM size: ${hex(ROM_SIZE)} (${ROM_SIZE} bytes)`);
console.log('');

// Scan target address
console.log(`== References to ${hex(TARGET)} ==`);
const targetRefs = scanAddress(TARGET);
console.log(`Found ${targetRefs.length} references:\n`);

const typeCounts = {};
const regionMap = new Map();

for (const ref of targetRefs) {
  const regionBase = ref.instrAddr & 0xFFF000;
  const regionKey = hex(regionBase);
  regionMap.set(regionKey, (regionMap.get(regionKey) || 0) + 1);
  typeCounts[ref.type] = (typeCounts[ref.type] || 0) + 1;

  console.log(`  ${hex(ref.instrAddr)}  ${ref.type.padEnd(8)}  ${ref.instr}`);
}

console.log('');
console.log('== Type summary ==');
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(10)} ${c}`);
}

console.log('');
console.log('== ROM region distribution ==');
for (const [region, count] of [...regionMap.entries()].sort()) {
  console.log(`  ${region}  ${count} ref(s)`);
}

// Scan nearby addresses for structure context
console.log('');
console.log('== Nearby D01D0x addresses ==');
for (const nearby of NEARBY) {
  if (nearby === TARGET) continue; // already scanned
  const refs = scanAddress(nearby);
  const reads = refs.filter(r => r.type === 'READ').length;
  const writes = refs.filter(r => r.type === 'WRITE').length;
  const addrs = refs.filter(r => r.type === 'ADDR').length;
  const other = refs.length - reads - writes - addrs;
  if (refs.length > 0) {
    console.log(`  ${hex(nearby)}: ${refs.length} refs (${reads}R/${writes}W/${addrs}A${other ? '/' + other + 'other' : ''})`);
    for (const ref of refs) {
      console.log(`    ${hex(ref.instrAddr)}  ${ref.type.padEnd(8)}  ${ref.instr}`);
    }
  } else {
    console.log(`  ${hex(nearby)}: 0 refs`);
  }
}

// Hypothesis
console.log('');
console.log('== Hypothesis ==');
const reads = typeCounts['READ'] || 0;
const writes = typeCounts['WRITE'] || 0;
const addrs = typeCounts['ADDR'] || 0;
if (reads > 0 && writes > 0) {
  console.log(`D01D0C has ${reads} reads and ${writes} writes -- actively maintained RAM variable.`);
} else if (reads > 0 && writes === 0) {
  console.log(`D01D0C has ${reads} reads but 0 direct writes -- may be written indirectly (LDIR/block copy) or via pointer.`);
} else if (writes > 0 && reads === 0) {
  console.log(`D01D0C has 0 reads but ${writes} writes -- write-only (flag/signal?).`);
}
if (addrs > 0) {
  console.log(`${addrs} address loads suggest it may be used as a pointer target or in block operations.`);
}

const totalRefs = targetRefs.length;
const regions = [...regionMap.keys()].sort();
if (regions.length <= 3) {
  console.log(`References concentrated in ${regions.length} region(s): ${regions.join(', ')} -- likely single-subsystem variable.`);
} else {
  console.log(`References spread across ${regions.length} regions -- widely-used OS variable.`);
}

console.log('');
console.log(`Both 0x092F87 and 0x092F95 read D01D0C. If nearby D01D0D-D01D0F are also referenced,`);
console.log(`D01D0C may be part of a multi-byte structure (e.g., counter, pointer, or record).`);

console.log('');
console.log('PASS: scan complete');
process.exit(0);
