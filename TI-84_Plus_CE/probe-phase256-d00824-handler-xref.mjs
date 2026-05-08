#!/usr/bin/env node
/**
 * probe-phase256-d00824-handler-xref.mjs
 *
 * Cross-references D00824 mode constants with handler table entries.
 * Pure static analysis — reads ROM.rom directly, no runtime needed.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

// --- Constants ---

const HANDLER_TABLE_ADDR = 0x08C958;
const HANDLER_COUNT = 20;

const HANDLER_ADDRS = [];
for (let i = 0; i < HANDLER_COUNT; i++) {
  const off = HANDLER_TABLE_ADDR + i * 3;
  HANDLER_ADDRS.push(rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16));
}

const EXPECTED_HANDLERS = [
  0x058241, 0x03D755, 0x080CA7, 0x0AB667, 0x06C748,
  0x08A653, 0x09C883, 0x09C742, 0x09E30C, 0x05FE17,
  0x0B290B, 0x09E3B4, 0x09DC3C, 0x05CBDC, 0x0454A4,
  0x045647, 0x09CC2A, 0x09E370, 0x061ECE, 0x09E2BF,
];

const D00824_WRITERS = [
  { addr: 0x04EF17, value: 0x00, label: 'home' },
  { addr: 0x084A26, value: 0x46, label: '' },
  { addr: 0x08773A, value: 0x48, label: '' },
  { addr: 0x0877A9, value: 0x48, label: '' },
  { addr: 0x088588, value: 0x49, label: '' },
  { addr: 0x06FF2E, value: 0x4A, label: '' },
  { addr: 0x088B7F, value: 0x4A, label: '' },
  { addr: 0x09E05E, value: 0x01, label: '' },
];

// --- Helpers ---

function hex(n, width = 6) {
  return '0x' + n.toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function hexDump(startAddr, length) {
  const lines = [];
  for (let off = 0; off < length; off += 16) {
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && off + i < length; i++) {
      const b = rom[startAddr + off + i];
      bytes.push(hexByte(b));
      ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
    }
    lines.push(`  ${hex(startAddr + off)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
  return lines.join('\n');
}

function read24LE(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function handlerName(addr) {
  const idx = HANDLER_ADDRS.indexOf(addr);
  if (idx >= 0) return `handler[${idx}]`;
  return null;
}

// --- Section 1: Disassemble first 48 bytes of each handler ---

console.log('='.repeat(80));
console.log('SECTION 1: First 48 bytes of each handler entry');
console.log('='.repeat(80));
console.log();

// Verify handler table matches expectations
for (let i = 0; i < HANDLER_COUNT; i++) {
  if (HANDLER_ADDRS[i] !== EXPECTED_HANDLERS[i]) {
    console.log(`  WARNING: handler[${i}] mismatch: ROM=${hex(HANDLER_ADDRS[i])} expected=${hex(EXPECTED_HANDLERS[i])}`);
  }
}

for (let i = 0; i < HANDLER_COUNT; i++) {
  const addr = HANDLER_ADDRS[i];
  console.log(`--- handler[${i}] = ${hex(addr)} ---`);
  console.log(hexDump(addr, 48));

  // Scan for D00824 references (24 08 D0 little-endian)
  const refs = [];
  for (let off = 0; off < 48 - 2; off++) {
    if (rom[addr + off] === 0x24 && rom[addr + off + 1] === 0x08 && rom[addr + off + 2] === 0xD0) {
      refs.push({ offset: off, type: 'D00824' });
    }
    if (rom[addr + off] === 0xE0 && rom[addr + off + 1] === 0x07 && rom[addr + off + 2] === 0xD0) {
      refs.push({ offset: off, type: 'D007E0' });
    }
  }

  if (refs.length > 0) {
    for (const r of refs) {
      const absAddr = addr + r.offset;
      const opcode = rom[absAddr - 1];
      const opcodeStr = hexByte(opcode);
      console.log(`  ** Found ${r.type} ref at +${r.offset} (${hex(absAddr)}), preceding opcode: ${opcodeStr}`);
    }
  } else {
    console.log('  (no D00824/D007E0 references in first 48 bytes)');
  }
  console.log();
}

// --- Section 2: Scan entire ROM for LD (D007E0),A sites ---

console.log('='.repeat(80));
console.log('SECTION 2: All LD (D007E0),A sites (pattern 32 E0 07 D0)');
console.log('='.repeat(80));
console.log();

// In eZ80 ADL mode: LD (imm24),A = 0x32 followed by 3-byte address (little-endian)
// D007E0 LE = E0 07 D0
// So pattern: 32 E0 07 D0

const d007e0Sites = [];
for (let off = 0; off < rom.length - 3; off++) {
  if (rom[off] === 0x32 && rom[off + 1] === 0xE0 && rom[off + 2] === 0x07 && rom[off + 3] === 0xD0) {
    d007e0Sites.push(off);
  }
}

console.log(`Found ${d007e0Sites.length} LD (D007E0),A sites:\n`);

for (const site of d007e0Sites) {
  // Read preceding 16 bytes to figure out what A was
  const preStart = Math.max(0, site - 16);
  const preLen = site - preStart;
  const preBytes = [];
  for (let i = preStart; i < site; i++) {
    preBytes.push(hexByte(rom[i]));
  }

  // Look for LD A,imm8 (0x3E xx) in the preceding bytes
  let aValue = null;
  let aSource = '';
  for (let scan = site - 2; scan >= site - 16 && scan >= 0; scan--) {
    if (rom[scan] === 0x3E) {
      aValue = rom[scan + 1];
      aSource = `LD A,${hex(aValue, 2)} at ${hex(scan)}`;
      break;
    }
    // Also check for XOR A (A=0): 0xAF
    if (rom[scan] === 0xAF) {
      aValue = 0x00;
      aSource = `XOR A at ${hex(scan)}`;
      break;
    }
    // SUB A (A=0): 0x97
    if (rom[scan] === 0x97) {
      aValue = 0x00;
      aSource = `SUB A at ${hex(scan)}`;
      break;
    }
    // LD A,(D00824) = 3A 24 08 D0 — loaded from memory, value unknown
    if (scan + 3 < rom.length && rom[scan] === 0x3A && rom[scan + 1] === 0x24 && rom[scan + 2] === 0x08 && rom[scan + 3] === 0xD0) {
      aValue = null;
      aSource = `LD A,(D00824) at ${hex(scan)} — value from RAM`;
      break;
    }
  }

  const valueStr = aValue !== null ? hex(aValue, 2) : '??';
  const hName = handlerName(site);
  const hTag = hName ? ` [inside ${hName}]` : '';

  console.log(`  ${hex(site)}: LD (D007E0),A    A=${valueStr}  (${aSource || 'source not found in prev 16 bytes'})${hTag}`);
  console.log(`    preceding: ${preBytes.join(' ')}`);
  console.log();
}

// --- Section 3: Cross-reference D00824 writers with handler addresses ---

console.log('='.repeat(80));
console.log('SECTION 3: D00824 write sites cross-referenced with handler CALL/JP targets');
console.log('='.repeat(80));
console.log();

for (const writer of D00824_WRITERS) {
  const scanStart = Math.max(0, writer.addr - 256);
  const scanEnd = Math.min(rom.length - 4, writer.addr + 256);

  console.log(`--- D00824 write at ${hex(writer.addr)}, value=${hex(writer.value, 2)} ${writer.label ? '(' + writer.label + ')' : ''} ---`);

  const matches = [];

  for (let off = scanStart; off <= scanEnd; off++) {
    const opcode = rom[off];
    // CALL imm24 = CD xx xx xx
    // JP imm24   = C3 xx xx xx
    // CALL cc,imm24: C4(NZ), CC(Z), D4(NC), DC(C), E4(PO), EC(PE), F4(P), FC(M)
    // JP cc,imm24:   C2(NZ), CA(Z), D2(NC), DA(C), E2(PO), EA(PE), F2(P), FA(M)
    const isCall = opcode === 0xCD;
    const isJP = opcode === 0xC3;
    const isCondCall = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(opcode);
    const isCondJP = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode);

    if (isCall || isJP || isCondCall || isCondJP) {
      if (off + 3 < rom.length) {
        const target = read24LE(off + 1);
        const hIdx = HANDLER_ADDRS.indexOf(target);
        if (hIdx >= 0) {
          const kind = isCall ? 'CALL' : isJP ? 'JP' : isCondCall ? 'CALL cc' : 'JP cc';
          const relOff = off - writer.addr;
          matches.push({ off, kind, target, hIdx, relOff });
        }
      }
    }
  }

  if (matches.length > 0) {
    for (const m of matches) {
      console.log(`  ${hex(m.off)}: ${m.kind} ${hex(m.target)} = handler[${m.hIdx}]  (offset ${m.relOff >= 0 ? '+' : ''}${m.relOff} from write)`);
    }
  } else {
    console.log('  (no handler CALL/JP found within +/-256 bytes)');
  }
  console.log();
}

// --- Section 4: Also scan D00824 LD (addr),A sites ---

console.log('='.repeat(80));
console.log('SECTION 4: All LD (D00824),A sites (pattern 32 24 08 D0)');
console.log('='.repeat(80));
console.log();

const d00824Sites = [];
for (let off = 0; off < rom.length - 3; off++) {
  if (rom[off] === 0x32 && rom[off + 1] === 0x24 && rom[off + 2] === 0x08 && rom[off + 3] === 0xD0) {
    d00824Sites.push(off);
  }
}

console.log(`Found ${d00824Sites.length} LD (D00824),A sites:\n`);

for (const site of d00824Sites) {
  let aValue = null;
  let aSource = '';
  for (let scan = site - 2; scan >= site - 16 && scan >= 0; scan--) {
    if (rom[scan] === 0x3E) {
      aValue = rom[scan + 1];
      aSource = `LD A,${hex(aValue, 2)} at ${hex(scan)}`;
      break;
    }
    if (rom[scan] === 0xAF) {
      aValue = 0x00;
      aSource = `XOR A at ${hex(scan)}`;
      break;
    }
    if (rom[scan] === 0x97) {
      aValue = 0x00;
      aSource = `SUB A at ${hex(scan)}`;
      break;
    }
  }

  const valueStr = aValue !== null ? hex(aValue, 2) : '??';
  console.log(`  ${hex(site)}: LD (D00824),A    A=${valueStr}  (${aSource || 'source not found in prev 16 bytes'})`);
}
console.log();

// --- Section 5: Summary table ---

console.log('='.repeat(80));
console.log('SECTION 5: Summary — Handler table with known associations');
console.log('='.repeat(80));
console.log();

console.log('Handler Table (0x08C958, 20 entries):');
console.log('-'.repeat(60));
console.log('  Idx  Address    D00824 refs  D007E0 refs  Notes');
console.log('-'.repeat(60));

for (let i = 0; i < HANDLER_COUNT; i++) {
  const addr = HANDLER_ADDRS[i];

  // Check if any D00824 writer is near a CALL/JP to this handler
  const d00824Refs = [];
  for (const writer of D00824_WRITERS) {
    const scanStart = Math.max(0, writer.addr - 256);
    const scanEnd = Math.min(rom.length - 4, writer.addr + 256);
    for (let off = scanStart; off <= scanEnd; off++) {
      const opcode = rom[off];
      if ([0xCD, 0xC3, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
           0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode)) {
        if (off + 3 < rom.length) {
          const target = read24LE(off + 1);
          if (target === addr) {
            d00824Refs.push(`D00824=${hex(writer.value, 2)}`);
          }
        }
      }
    }
  }

  // Check if handler itself references D007E0 in first 48 bytes
  let d007e0InHandler = false;
  for (let off = 0; off < 48 - 2; off++) {
    if (rom[addr + off] === 0xE0 && rom[addr + off + 1] === 0x07 && rom[addr + off + 2] === 0xD0) {
      d007e0InHandler = true;
      break;
    }
  }

  // Check if handler references D00824 in first 48 bytes
  let d00824InHandler = false;
  for (let off = 0; off < 48 - 2; off++) {
    if (rom[addr + off] === 0x24 && rom[addr + off + 1] === 0x08 && rom[addr + off + 2] === 0xD0) {
      d00824InHandler = true;
      break;
    }
  }

  const refStrs = [...new Set(d00824Refs)];
  const d007e0Str = d007e0InHandler ? 'yes' : '';
  const d00824Str = d00824InHandler ? 'reads' : '';
  const notes = refStrs.length > 0 ? refStrs.join(', ') : '';

  console.log(`  [${String(i).padStart(2)}]  ${hex(addr)}  ${(notes || '-').padEnd(13)} ${(d007e0Str || '-').padEnd(13)} ${d00824Str}`);
}

console.log('-'.repeat(60));
console.log();
console.log('Done.');
