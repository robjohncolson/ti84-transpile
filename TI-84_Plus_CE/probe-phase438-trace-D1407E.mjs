#!/usr/bin/env node
/**
 * Phase 438 — Static ROM scan for all references to D1407E
 * (USB pipe/buffer state byte in the D14070-D1407F block)
 *
 * Scans the 4 MB ROM for:
 *   - LD (D1407E),A   → 0x32 0x7E 0x40 0xD1
 *   - LD A,(D1407E)   → 0x3A 0x7E 0x40 0xD1
 *   - Raw 3-byte addr → 0x7E 0x40 0xD1 (catches other instruction forms)
 *   - IX-relative via LD IX,D14070 then (IX+0x0E)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);
const rom = fs.readFileSync(romPath);

const ROM_SIZE = rom.length; // 4,194,304

// --- helpers ---

function hex(n, w = 6) { return '0x' + n.toString(16).toUpperCase().padStart(w, '0'); }

function hexDump(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    if (addr < 0 || addr >= buf.length) { parts.push('??'); continue; }
    parts.push(buf[addr].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

// eZ80 opcode mnemonics for common opcodes that precede a 24-bit address
const OPCODE_NAMES = {
  0x01: 'LD BC,',
  0x02: 'LD (BC),A',
  0x0A: 'LD A,(BC)',
  0x11: 'LD DE,',
  0x21: 'LD HL,',
  0x22: 'LD (nn),HL',
  0x2A: 'LD HL,(nn)',
  0x31: 'LD SP,',
  0x32: 'LD (nn),A',
  0x3A: 'LD A,(nn)',
  0xC3: 'JP nn',
  0xCA: 'JP Z,nn',
  0xC2: 'JP NZ,nn',
  0xCD: 'CALL nn',
  0xCC: 'CALL Z,nn',
  0xC4: 'CALL NZ,nn',
  0xD2: 'JP NC,nn',
  0xDA: 'JP C,nn',
  0xD4: 'CALL NC,nn',
  0xDC: 'CALL C,nn',
  0xE2: 'JP PO,nn',
  0xEA: 'JP PE,nn',
  0xE4: 'CALL PO,nn',
  0xEC: 'CALL PE,nn',
  0xF2: 'JP P,nn',
  0xFA: 'JP M,nn',
  0xF4: 'CALL P,nn',
  0xFC: 'CALL M,nn',
};

// Target address bytes (little-endian): D1407E → 7E 40 D1
const ADDR_LO = 0x7E;
const ADDR_MID = 0x40;
const ADDR_HI = 0xD1;

// --- Scan 1: LD (D1407E),A  — opcode 0x32 + addr ---
const writes_32 = [];
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0x32 && rom[i+1] === ADDR_LO && rom[i+2] === ADDR_MID && rom[i+3] === ADDR_HI) {
    writes_32.push(i);
  }
}

// --- Scan 2: LD A,(D1407E)  — opcode 0x3A + addr ---
const reads_3A = [];
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0x3A && rom[i+1] === ADDR_LO && rom[i+2] === ADDR_MID && rom[i+3] === ADDR_HI) {
    reads_3A.push(i);
  }
}

// --- Scan 3: Raw 3-byte sequence 7E 40 D1 (all occurrences) ---
const rawHits = [];
for (let i = 0; i < ROM_SIZE - 2; i++) {
  if (rom[i] === ADDR_LO && rom[i+1] === ADDR_MID && rom[i+2] === ADDR_HI) {
    rawHits.push(i);
  }
}

// --- Scan 4: IX-relative — LD IX,D14070 then nearby (IX+0x0E) ---
// LD IX,nn = DD 21 lo mid hi  → DD 21 70 40 D1
const ixLoadSites = [];
for (let i = 0; i < ROM_SIZE - 4; i++) {
  if (rom[i] === 0xDD && rom[i+1] === 0x21 &&
      rom[i+2] === 0x70 && rom[i+3] === 0x40 && rom[i+4] === 0xD1) {
    ixLoadSites.push(i);
  }
}

// For each IX load site, scan forward up to 128 bytes for (IX+0x0E) patterns
// DD 46 0E = LD B,(IX+0x0E),  DD 4E 0E = LD C,(IX+0x0E),  DD 56 0E = LD D,(IX+0x0E)
// DD 5E 0E = LD E,(IX+0x0E),  DD 66 0E = LD H,(IX+0x0E),  DD 6E 0E = LD L,(IX+0x0E)
// DD 7E 0E = LD A,(IX+0x0E)   — reads
// DD 70 0E = LD (IX+0x0E),B,  DD 71 0E = LD (IX+0x0E),C, etc.
// DD 77 0E = LD (IX+0x0E),A   — writes
// DD 36 0E nn = LD (IX+0x0E),n — immediate write
// DD CB 0E xx = bit/set/res operations
const ixRelHits = [];
for (const ixLoad of ixLoadSites) {
  for (let j = ixLoad + 5; j < Math.min(ixLoad + 200, ROM_SIZE - 2); j++) {
    if (rom[j] === 0xDD) {
      const op2 = rom[j+1];
      const disp = rom[j+2];
      if (disp !== 0x0E) continue;

      let type = 'unknown';
      let detail = '';

      // LD r,(IX+d) — reads: 46,4E,56,5E,66,6E,7E
      if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].includes(op2)) {
        const regNames = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
        type = 'READ';
        detail = `LD ${regNames[op2]},(IX+0x0E)`;
      }
      // LD (IX+d),r — writes: 70-77
      else if (op2 >= 0x70 && op2 <= 0x77) {
        const regNames = { 0x70: 'B', 0x71: 'C', 0x72: 'D', 0x73: 'E', 0x74: 'H', 0x75: 'L', 0x76: '(HL)', 0x77: 'A' };
        type = 'WRITE';
        detail = `LD (IX+0x0E),${regNames[op2]}`;
      }
      // LD (IX+d),n — immediate write
      else if (op2 === 0x36) {
        type = 'WRITE';
        detail = `LD (IX+0x0E),0x${rom[j+3].toString(16).padStart(2, '0')}`;
      }
      // CB prefix — bit operations
      else if (op2 === 0xCB) {
        // DD CB disp op — the displacement is at j+2, bit-op at j+3
        // Actually for DD CB prefix: DD CB disp op
        // disp is already at j+2=0x0E
        const bitOp = rom[j+3];
        if (bitOp >= 0x40 && bitOp <= 0x7F) {
          const bit = (bitOp >> 3) & 7;
          type = 'READ';
          detail = `BIT ${bit},(IX+0x0E)`;
        } else if (bitOp >= 0x80 && bitOp <= 0xBF) {
          const bit = (bitOp >> 3) & 7;
          type = 'WRITE';
          detail = `RES ${bit},(IX+0x0E)`;
        } else if (bitOp >= 0xC0 && bitOp <= 0xFF) {
          const bit = (bitOp >> 3) & 7;
          type = 'WRITE';
          detail = `SET ${bit},(IX+0x0E)`;
        }
      }
      // ADD/ADC/SUB/SBC/AND/XOR/OR/CP (IX+d)
      else if ([0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(op2)) {
        const opNames = { 0x86: 'ADD', 0x8E: 'ADC', 0x96: 'SUB', 0x9E: 'SBC', 0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR', 0xBE: 'CP' };
        type = 'READ';
        detail = `${opNames[op2]} A,(IX+0x0E)`;
      }
      // INC/DEC (IX+d)
      else if (op2 === 0x34) {
        type = 'READ+WRITE';
        detail = 'INC (IX+0x0E)';
      } else if (op2 === 0x35) {
        type = 'READ+WRITE';
        detail = 'DEC (IX+0x0E)';
      }

      if (type !== 'unknown') {
        ixRelHits.push({ addr: j, ixLoadAddr: ixLoad, type, detail });
      }
    }
  }
}

// --- Classify raw hits ---

// Build a set of known hit addresses from scans 1 & 2
// rawHits are at the address byte position (i.e., the byte AFTER the opcode for LD instructions)
const classifiedRaw = rawHits.map(addrPos => {
  const opcBefore = addrPos > 0 ? rom[addrPos - 1] : null;
  let type = 'UNKNOWN';
  let detail = '';

  if (opcBefore === 0x32) {
    type = 'WRITE';
    detail = 'LD (D1407E),A';
  } else if (opcBefore === 0x3A) {
    type = 'READ';
    detail = 'LD A,(D1407E)';
  } else if (opcBefore === 0x22) {
    type = 'WRITE';
    detail = 'LD (D1407E),HL';
  } else if (opcBefore === 0x2A) {
    type = 'READ';
    detail = 'LD HL,(D1407E)';
  } else if (opcBefore !== null) {
    const name = OPCODE_NAMES[opcBefore];
    if (name) {
      // Determine if it's a call/jump (neither read nor write to the address)
      if (name.startsWith('JP') || name.startsWith('CALL')) {
        type = 'JUMP/CALL';
        detail = `${name} D1407E`;
      } else if (name.startsWith('LD')) {
        // LD rr,nn — loading the address as an immediate value
        type = 'LOAD_ADDR';
        detail = `${name}D1407E`;
      } else {
        type = 'OTHER';
        detail = `opcode ${hex(opcBefore, 2)} before addr bytes`;
      }
    }

    // Check for 2-byte prefix opcodes (DD/FD prefix for IX/IY instructions)
    if (addrPos >= 2) {
      const prefix = rom[addrPos - 2];
      if (prefix === 0xDD || prefix === 0xFD) {
        const regName = prefix === 0xDD ? 'IX' : 'IY';
        if (opcBefore === 0x21) {
          type = 'LOAD_ADDR';
          detail = `LD ${regName},D1407E`;
        } else if (opcBefore === 0x22) {
          type = 'WRITE';
          detail = `LD (D1407E),${regName}`;
        } else if (opcBefore === 0x2A) {
          type = 'READ';
          detail = `LD ${regName},(D1407E)`;
        }
      }
    }

    // Check for ED-prefixed instructions
    if (addrPos >= 2 && rom[addrPos - 2] === 0xED) {
      const edOp = opcBefore;
      // LD (nn),rr and LD rr,(nn) — ED 43/53/63/73 nn = store, ED 4B/5B/6B/7B nn = load
      if (edOp === 0x43) { type = 'WRITE'; detail = 'LD (D1407E),BC'; }
      else if (edOp === 0x53) { type = 'WRITE'; detail = 'LD (D1407E),DE'; }
      else if (edOp === 0x63) { type = 'WRITE'; detail = 'LD (D1407E),HL [ED]'; }
      else if (edOp === 0x73) { type = 'WRITE'; detail = 'LD (D1407E),SP'; }
      else if (edOp === 0x4B) { type = 'READ'; detail = 'LD BC,(D1407E)'; }
      else if (edOp === 0x5B) { type = 'READ'; detail = 'LD DE,(D1407E)'; }
      else if (edOp === 0x6B) { type = 'READ'; detail = 'LD HL,(D1407E) [ED]'; }
      else if (edOp === 0x7B) { type = 'READ'; detail = 'LD SP,(D1407E)'; }
    }
  }

  // Determine the instruction start address
  let instrAddr = addrPos - 1; // default: opcode is 1 byte before addr
  if (addrPos >= 2) {
    const prefix = rom[addrPos - 2];
    if (prefix === 0xDD || prefix === 0xFD || prefix === 0xED) {
      instrAddr = addrPos - 2;
    }
  }

  return {
    addrPos,
    instrAddr,
    type,
    detail,
    opcBefore,
    context: hexDump(rom, instrAddr - 4, 20),
  };
});

// --- Attempt to identify written values ---
// For LD (D1407E),A writes, look back further to see what A was loaded with
function inferWrittenValue(writeAddr) {
  // writeAddr is the address of the 0x32 opcode
  // Look backwards up to 20 bytes for LD A,n (3E nn) or XOR A (AF = 0) or OR A (B7)
  for (let back = 1; back <= 30; back++) {
    const pos = writeAddr - back;
    if (pos < 0) break;
    const b = rom[pos];

    // LD A,n — 0x3E nn
    if (b === 0x3E && pos + 1 < ROM_SIZE) {
      return `A = 0x${rom[pos + 1].toString(16).padStart(2, '0')}`;
    }
    // XOR A — A = 0
    if (b === 0xAF) return 'A = 0x00 (XOR A)';
    // SUB A — A = 0
    if (b === 0x97) return 'A = 0x00 (SUB A)';

    // Stop at control flow
    if ([0xC9, 0xC3, 0xCD, 0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(b)) break;
    // Stop at another LD (nn),A
    if (b === 0x32) break;
  }
  return 'A = ? (complex)';
}

// --- Output ---

console.log('=== Phase 438: D1407E USB Pipe/Buffer State Trace ===\n');

console.log(`ROM size: ${ROM_SIZE} bytes (${hex(ROM_SIZE)})`);
console.log(`Target address: D1407E (LE bytes: 7E 40 D1)\n`);

console.log('--- LD (D1407E),A writes (opcode 0x32) ---');
console.log(`Found: ${writes_32.length}`);
for (const addr of writes_32) {
  const val = inferWrittenValue(addr);
  console.log(`  ${hex(addr)}: ${val}  context: ${hexDump(rom, addr - 4, 16)}`);
}

console.log('\n--- LD A,(D1407E) reads (opcode 0x3A) ---');
console.log(`Found: ${reads_3A.length}`);
for (const addr of reads_3A) {
  // Look ahead to see what the read gates
  let gateInfo = '';
  for (let fwd = 4; fwd <= 15; fwd++) {
    const pos = addr + fwd;
    if (pos >= ROM_SIZE) break;
    const b = rom[pos];
    // CP n
    if (b === 0xFE && pos + 1 < ROM_SIZE) {
      gateInfo += `CP 0x${rom[pos + 1].toString(16).padStart(2, '0')} `;
    }
    // OR A / AND A (zero check)
    if (b === 0xB7) gateInfo += 'OR A (flag test) ';
    if (b === 0xA7) gateInfo += 'AND A (flag test) ';
    // BIT n,A
    if (b === 0xCB && pos + 1 < ROM_SIZE) {
      const cbOp = rom[pos + 1];
      if (cbOp >= 0x47 && cbOp <= 0x7F && (cbOp & 0x07) === 0x07) {
        const bit = (cbOp >> 3) & 7;
        gateInfo += `BIT ${bit},A `;
      }
    }
    // Conditional jump
    if ([0xC2, 0xCA, 0xD2, 0xDA, 0x20, 0x28, 0x30, 0x38].includes(b)) {
      const jmpNames = { 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
      gateInfo += `→ ${jmpNames[b]} `;
      break;
    }
    // RET cc
    if ([0xC0, 0xC8, 0xD0, 0xD8].includes(b)) {
      const retNames = { 0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C' };
      gateInfo += `→ ${retNames[b]} `;
      break;
    }
  }
  console.log(`  ${hex(addr)}: gates: ${gateInfo || '(not obvious)'}  context: ${hexDump(rom, addr - 4, 16)}`);
}

console.log('\n--- All raw 7E 40 D1 occurrences ---');
console.log(`Found: ${rawHits.length}`);
for (const hit of classifiedRaw) {
  console.log(`  addr-bytes at ${hex(hit.addrPos)}: instr@${hex(hit.instrAddr)} [${hit.type}] ${hit.detail}  context: ${hit.context}`);
}

console.log('\n--- LD IX,D14070 sites ---');
console.log(`Found: ${ixLoadSites.length}`);
for (const addr of ixLoadSites) {
  console.log(`  ${hex(addr)}: context: ${hexDump(rom, addr - 2, 14)}`);
}

console.log('\n--- IX+0x0E relative accesses (within 200 bytes of LD IX,D14070) ---');
console.log(`Found: ${ixRelHits.length}`);
for (const hit of ixRelHits) {
  console.log(`  ${hex(hit.addr)}: [${hit.type}] ${hit.detail}  (IX loaded at ${hex(hit.ixLoadAddr)})  context: ${hexDump(rom, hit.addr - 2, 12)}`);
}

// --- Summary ---
console.log('\n=== SUMMARY ===');

const totalWrites = writes_32.length;
const totalReads = reads_3A.length;
const totalIxReads = ixRelHits.filter(h => h.type === 'READ').length;
const totalIxWrites = ixRelHits.filter(h => h.type === 'WRITE').length;
const totalIxRW = ixRelHits.filter(h => h.type === 'READ+WRITE').length;

console.log(`Direct writes (LD (D1407E),A): ${totalWrites}`);
console.log(`Direct reads  (LD A,(D1407E)): ${totalReads}`);
console.log(`IX-relative reads:  ${totalIxReads}`);
console.log(`IX-relative writes: ${totalIxWrites}`);
console.log(`IX-relative R+W:    ${totalIxRW}`);
console.log(`Raw 3-byte hits:    ${rawHits.length}`);

// Deduplicate and classify all references
const allRefs = new Map();
for (const addr of writes_32) {
  allRefs.set(addr, { type: 'WRITE', detail: 'LD (D1407E),A', value: inferWrittenValue(addr) });
}
for (const addr of reads_3A) {
  allRefs.set(addr, { type: 'READ', detail: 'LD A,(D1407E)' });
}
for (const hit of ixRelHits) {
  allRefs.set(hit.addr, { type: hit.type, detail: hit.detail });
}

// Also add non-direct raw hits that are actual memory accesses (not jumps/calls/load-addr)
for (const hit of classifiedRaw) {
  if (!allRefs.has(hit.instrAddr) && (hit.type === 'WRITE' || hit.type === 'READ')) {
    allRefs.set(hit.instrAddr, { type: hit.type, detail: hit.detail });
  }
}

console.log(`\nTotal unique memory-access references: ${allRefs.size}`);
console.log(`  Writes: ${[...allRefs.values()].filter(r => r.type === 'WRITE').length}`);
console.log(`  Reads:  ${[...allRefs.values()].filter(r => r.type === 'READ').length}`);
console.log(`  R+W:    ${[...allRefs.values()].filter(r => r.type === 'READ+WRITE').length}`);

// Print values written
console.log('\nValues written:');
for (const [addr, ref] of allRefs) {
  if (ref.type === 'WRITE' && ref.value) {
    console.log(`  ${hex(addr)}: ${ref.value}`);
  }
}
