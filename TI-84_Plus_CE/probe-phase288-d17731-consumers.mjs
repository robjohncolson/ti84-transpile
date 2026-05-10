#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

// Dynamically import decoder
import { pathToFileURL } from 'node:url';
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const rom = fs.readFileSync(ROM_PATH);

const SCAN_LIMIT = 0x0C0000; // search 0x000000-0x0BFFFF

// Target addresses
const D17731_BASE = 0xD17731;
const D17731_END = 0xD1773A;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function toLE3(addr) {
  return [(addr & 0xFF), ((addr >> 8) & 0xFF), ((addr >> 16) & 0xFF)];
}

// Search for 3-byte LE pattern in ROM
function findPattern(bytes, limit) {
  const results = [];
  for (let i = 0; i < limit - 2; i++) {
    if (rom[i] === bytes[0] && rom[i + 1] === bytes[1] && rom[i + 2] === bytes[2]) {
      results.push(i);
    }
  }
  return results;
}

// Try to decode instruction at or near offset that contains the reference
function findInstructionAt(offset) {
  // The 3-byte address could be at various positions within an instruction
  // Try decoding from up to 4 bytes before to find the instruction start
  for (let back = 4; back >= 0; back--) {
    const start = offset - back;
    if (start < 0) continue;
    try {
      const decoded = decodeInstruction(rom, start);
      if (decoded && decoded.length > 0) {
        // Check if this instruction spans the reference offset
        if (start + decoded.length > offset + 2) {
          return { pc: start, ...decoded };
        }
      }
    } catch (e) {
      // skip
    }
  }
  return null;
}

// Classify instruction as READ, WRITE, or POINTER_LOAD
function classifyAccess(instr) {
  if (!instr || !instr.mnemonic) return 'UNKNOWN';
  const mn = instr.mnemonic.toLowerCase();
  const ops = (instr.operands || []).map(o => String(o).toLowerCase());
  const full = `${mn} ${ops.join(',')}`;

  // LD HL,addr or LD reg_pair,addr (pointer load)
  if (mn === 'ld' && ops.length === 2) {
    // If destination is a register pair and source is immediate (not indirect)
    if (/^(hl|de|bc|ix|iy|sp)$/.test(ops[0]) && !ops[1].includes('(')) {
      return 'PTR_LOAD';
    }
    // LD r,(addr) — READ
    if (ops[1] && ops[1].includes('(') && !ops[0].includes('(')) {
      return 'READ';
    }
    // LD (addr),r — WRITE
    if (ops[0] && ops[0].includes('(') && !ops[1].includes('(')) {
      return 'WRITE';
    }
  }

  // CP (addr), BIT n,(addr), etc — READ
  if (['cp', 'bit', 'or', 'and', 'xor', 'add', 'adc', 'sbc', 'sub'].includes(mn)) {
    return 'READ';
  }

  // SET/RES (addr) — READ+WRITE
  if (['set', 'res'].includes(mn)) {
    return 'READ_WRITE';
  }

  // INC/DEC (addr) — READ+WRITE
  if (['inc', 'dec'].includes(mn)) {
    if (ops[0] && ops[0].includes('(')) return 'READ_WRITE';
  }

  return 'UNKNOWN';
}

// Decode a few instructions around a PC for context
function decodeContext(pc, count = 5) {
  const lines = [];
  let cur = pc;
  for (let i = 0; i < count && cur < rom.length; i++) {
    try {
      const d = decodeInstruction(rom, cur);
      if (!d || d.length === 0) break;
      const bytes = Array.from(rom.slice(cur, cur + d.length)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      lines.push(`  ${hex(cur)}: ${bytes.padEnd(20)} ${d.mnemonic} ${(d.operands || []).join(',')}`);
      cur += d.length;
    } catch (e) {
      break;
    }
  }
  return lines.join('\n');
}

console.log('=== Phase 288: D17731-D1773A Consumer Analysis ===\n');
console.log(`Searching ROM 0x000000-${hex(SCAN_LIMIT - 1)} for references to D17731-D1773A, D0058C, D0058E\n`);

// --- Search for D17731-D1773A references ---
const scanBufferRefs = [];
for (let addr = D17731_BASE; addr <= D17731_END; addr++) {
  const pattern = toLE3(addr);
  const hits = findPattern(pattern, SCAN_LIMIT);
  for (const offset of hits) {
    const instr = findInstructionAt(offset);
    const access = classifyAccess(instr);
    scanBufferRefs.push({ addr, offset, instr, access });
  }
}

// --- Search for D0058C and D0058E references ---
const getCSCRefs = [];
for (const addr of [D0058C, D0058E]) {
  const pattern = toLE3(addr);
  const hits = findPattern(pattern, SCAN_LIMIT);
  for (const offset of hits) {
    const instr = findInstructionAt(offset);
    const access = classifyAccess(instr);
    getCSCRefs.push({ addr, offset, instr, access });
  }
}

// --- Print D17731-D1773A results ---
console.log(`\n${'='.repeat(60)}`);
console.log(`D17731-D1773A REFERENCES (scan buffer)`);
console.log(`${'='.repeat(60)}`);

const reads = scanBufferRefs.filter(r => r.access === 'READ' || r.access === 'READ_WRITE');
const writes = scanBufferRefs.filter(r => r.access === 'WRITE');
const ptrLoads = scanBufferRefs.filter(r => r.access === 'PTR_LOAD');
const unknowns = scanBufferRefs.filter(r => r.access === 'UNKNOWN');

console.log(`\nTotal references: ${scanBufferRefs.length}`);
console.log(`  READs: ${reads.length}`);
console.log(`  WRITEs: ${writes.length}`);
console.log(`  PTR_LOADs: ${ptrLoads.length}`);
console.log(`  UNKNOWN: ${unknowns.length}`);

console.log(`\n--- READ sites (consumers of scan buffer) ---`);
for (const r of reads) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
  console.log(decodeContext(r.instr ? r.instr.pc : r.offset, 6));
}

console.log(`\n--- PTR_LOAD sites (pointer to scan buffer) ---`);
for (const r of ptrLoads) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
  console.log(decodeContext(r.instr ? r.instr.pc : r.offset, 6));
}

console.log(`\n--- WRITE sites (writers to scan buffer, expect 0x046500 cluster) ---`);
for (const r of writes) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
}

if (unknowns.length > 0) {
  console.log(`\n--- UNKNOWN classification ---`);
  for (const r of unknowns) {
    const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
    const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
    console.log(`  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}, offset in ROM: ${hex(r.offset)}]`);
    console.log(decodeContext(r.instr ? r.instr.pc : r.offset, 4));
  }
}

// --- Print D0058C/D0058E results ---
console.log(`\n${'='.repeat(60)}`);
console.log(`D0058C/D0058E REFERENCES (GetCSC result bytes)`);
console.log(`${'='.repeat(60)}`);

const cscWrites = getCSCRefs.filter(r => r.access === 'WRITE');
const cscReads = getCSCRefs.filter(r => r.access === 'READ' || r.access === 'READ_WRITE');
const cscPtrs = getCSCRefs.filter(r => r.access === 'PTR_LOAD');
const cscUnknowns = getCSCRefs.filter(r => r.access === 'UNKNOWN');

console.log(`\nTotal references: ${getCSCRefs.length}`);
console.log(`  READs: ${cscReads.length}`);
console.log(`  WRITEs: ${cscWrites.length}`);
console.log(`  PTR_LOADs: ${cscPtrs.length}`);
console.log(`  UNKNOWN: ${cscUnknowns.length}`);

console.log(`\n--- WRITE sites to D0058C/D0058E (who sets GetCSC result) ---`);
for (const r of cscWrites) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
  console.log(decodeContext(r.instr ? r.instr.pc : r.offset, 8));
}

console.log(`\n--- READ sites from D0058C/D0058E ---`);
for (const r of cscReads) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
}

console.log(`\n--- PTR_LOAD sites for D0058C/D0058E ---`);
for (const r of cscPtrs) {
  const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
  const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
  console.log(`\n  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}]`);
}

if (cscUnknowns.length > 0) {
  console.log(`\n--- UNKNOWN classification for D0058C/D0058E ---`);
  for (const r of cscUnknowns) {
    const instrPC = r.instr ? hex(r.instr.pc) : hex(r.offset);
    const instrStr = r.instr ? `${r.instr.mnemonic} ${(r.instr.operands || []).join(',')}` : '(decode failed)';
    console.log(`  ${instrPC}: ${instrStr}  [target: ${hex(r.addr)}, offset: ${hex(r.offset)}]`);
    console.log(decodeContext(r.instr ? r.instr.pc : r.offset, 4));
  }
}

// --- Proximity analysis ---
console.log(`\n${'='.repeat(60)}`);
console.log(`PROXIMITY ANALYSIS: Functions that both READ D17731 and WRITE D0058C`);
console.log(`${'='.repeat(60)}`);

const PROXIMITY_WINDOW = 0x200; // 512 bytes

const readPCs = reads.map(r => r.instr ? r.instr.pc : r.offset);
const ptrPCs = ptrLoads.map(r => r.instr ? r.instr.pc : r.offset);
const allConsumerPCs = [...readPCs, ...ptrPCs];

const writeCscPCs = cscWrites.map(r => r.instr ? r.instr.pc : r.offset);

let foundBridge = false;
for (const consumer of allConsumerPCs) {
  for (const writer of writeCscPCs) {
    const dist = Math.abs(consumer - writer);
    if (dist < PROXIMITY_WINDOW) {
      foundBridge = true;
      console.log(`\n  MATCH: D17731 consumer at ${hex(consumer)} <-> D0058C writer at ${hex(writer)}  (distance: ${dist} bytes)`);
      // Show context around the earlier address
      const earlier = Math.min(consumer, writer);
      console.log(`  Context starting at ${hex(earlier)}:`);
      console.log(decodeContext(earlier, 12));
    }
  }
}

if (!foundBridge) {
  console.log(`\n  No direct proximity matches found within ${PROXIMITY_WINDOW} bytes.`);
  console.log(`  D17731 consumer PCs: ${allConsumerPCs.map(hex).join(', ')}`);
  console.log(`  D0058C writer PCs:   ${writeCscPCs.map(hex).join(', ')}`);

  // Check for shared function ranges (larger window)
  const LARGE_WINDOW = 0x800;
  console.log(`\n  Checking with larger window (${hex(LARGE_WINDOW)} bytes)...`);
  for (const consumer of allConsumerPCs) {
    for (const writer of writeCscPCs) {
      const dist = Math.abs(consumer - writer);
      if (dist < LARGE_WINDOW) {
        console.log(`  POSSIBLE: consumer ${hex(consumer)} <-> writer ${hex(writer)}  (distance: ${dist} bytes)`);
      }
    }
  }
}

console.log(`\n=== Phase 288 complete ===`);
