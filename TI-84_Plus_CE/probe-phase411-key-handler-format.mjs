#!/usr/bin/env node

/**
 * Phase 411 — Key Handler Table Format Analysis
 *
 * 1. Disassembles 0x05D58F–0x05D5E0 (dispatch + installer)
 * 2. Finds ALL callers of installer 0x05D5C2 (direct) and 0x021E78 (JP table)
 * 3. For each caller that loads a ROM table base into BC, dumps the table
 * 4. Interprets table entries as 3-byte LE pointers + 1-byte flags, and as JP instructions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase411-key-handler-format-report.md');

const rom = fs.readFileSync(ROM_PATH);
const lines = [];

function log(s = '') { lines.push(s); console.log(s); }
function hex(v, w = 2) { return v.toString(16).toUpperCase().padStart(w, '0'); }
function hexAddr(v) { return '0x' + hex(v, 6); }

function readLE3(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readLE2(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

// ── Section 1: Disassemble 0x05D58F–0x05D5E0 ────────────────────────

log('# Phase 411 — Key Handler Table Format Analysis');
log();
log('## 1. Disassembly of 0x05D58F–0x05D5E0');
log();
log('Raw bytes with manual annotations of the dispatch and installer routines.');
log();
log('```');

const DISASM_START = 0x05D58F;
const DISASM_END = 0x05D5E0;

// Dump raw bytes in groups of 16
for (let addr = DISASM_START; addr < DISASM_END; addr += 16) {
  const end = Math.min(addr + 16, DISASM_END);
  const bytes = [];
  for (let i = addr; i < end; i++) bytes.push(hex(rom[i]));
  log(`${hexAddr(addr)}: ${bytes.join(' ')}`);
}

log('```');
log();

// Now do a simple eZ80 disassembly pass
log('### Annotated disassembly');
log();
log('```');

function disasmAt(addr) {
  const b = rom[addr];
  // Common eZ80 instructions
  switch (b) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,${hexAddr(readLE3(addr+1))}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,0x${hex(rom[addr+1])}` };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0A: return { len: 1, text: 'LD A,(BC)' };
    case 0x0B: return { len: 1, text: 'DEC BC' };
    case 0x0E: return { len: 2, text: `LD C,0x${hex(rom[addr+1])}` };
    case 0x11: return { len: 4, text: `LD DE,${hexAddr(readLE3(addr+1))}` };
    case 0x18: { const off = rom[addr+1]; const rel = off > 127 ? off - 256 : off; return { len: 2, text: `JR ${hexAddr(addr + 2 + rel)}` }; }
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1A: return { len: 1, text: 'LD A,(DE)' };
    case 0x20: { const off = rom[addr+1]; const rel = off > 127 ? off - 256 : off; return { len: 2, text: `JR NZ,${hexAddr(addr + 2 + rel)}` }; }
    case 0x21: return { len: 4, text: `LD HL,${hexAddr(readLE3(addr+1))}` };
    case 0x22: return { len: 4, text: `LD (${hexAddr(readLE3(addr+1))}),HL` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x26: return { len: 2, text: `LD H,0x${hex(rom[addr+1])}` };
    case 0x28: { const off = rom[addr+1]; const rel = off > 127 ? off - 256 : off; return { len: 2, text: `JR Z,${hexAddr(addr + 2 + rel)}` }; }
    case 0x2A: return { len: 4, text: `LD HL,(${hexAddr(readLE3(addr+1))})` };
    case 0x2E: return { len: 2, text: `LD L,0x${hex(rom[addr+1])}` };
    case 0x30: { const off = rom[addr+1]; const rel = off > 127 ? off - 256 : off; return { len: 2, text: `JR NC,${hexAddr(addr + 2 + rel)}` }; }
    case 0x31: return { len: 4, text: `LD SP,${hexAddr(readLE3(addr+1))}` };
    case 0x32: return { len: 4, text: `LD (${hexAddr(readLE3(addr+1))}),A` };
    case 0x36: return { len: 2, text: `LD (HL),0x${hex(rom[addr+1])}` };
    case 0x38: { const off = rom[addr+1]; const rel = off > 127 ? off - 256 : off; return { len: 2, text: `JR C,${hexAddr(addr + 2 + rel)}` }; }
    case 0x3A: return { len: 4, text: `LD A,(${hexAddr(readLE3(addr+1))})` };
    case 0x3E: return { len: 2, text: `LD A,0x${hex(rom[addr+1])}` };
    case 0x46: return { len: 1, text: 'LD B,(HL)' };
    case 0x4E: return { len: 1, text: 'LD C,(HL)' };
    case 0x56: return { len: 1, text: 'LD D,(HL)' };
    case 0x5E: return { len: 1, text: 'LD E,(HL)' };
    case 0x66: return { len: 1, text: 'LD H,(HL)' };
    case 0x6E: return { len: 1, text: 'LD L,(HL)' };
    case 0x6F: return { len: 1, text: 'LD L,A' };
    case 0x77: return { len: 1, text: 'LD (HL),A' };
    case 0x78: return { len: 1, text: 'LD A,B' };
    case 0x79: return { len: 1, text: 'LD A,C' };
    case 0x7E: return { len: 1, text: 'LD A,(HL)' };
    case 0x87: return { len: 1, text: 'ADD A,A' };
    case 0xA7: return { len: 1, text: 'AND A' };
    case 0xAF: return { len: 1, text: 'XOR A' };
    case 0xB7: return { len: 1, text: 'OR A' };
    case 0xBE: return { len: 1, text: 'CP (HL)' };
    case 0xC0: return { len: 1, text: 'RET NZ' };
    case 0xC1: return { len: 1, text: 'POP BC' };
    case 0xC3: return { len: 4, text: `JP ${hexAddr(readLE3(addr+1))}` };
    case 0xC5: return { len: 1, text: 'PUSH BC' };
    case 0xC8: return { len: 1, text: 'RET Z' };
    case 0xC9: return { len: 1, text: 'RET' };
    case 0xCA: return { len: 4, text: `JP Z,${hexAddr(readLE3(addr+1))}` };
    case 0xCD: return { len: 4, text: `CALL ${hexAddr(readLE3(addr+1))}` };
    case 0xD1: return { len: 1, text: 'POP DE' };
    case 0xD5: return { len: 1, text: 'PUSH DE' };
    case 0xD9: return { len: 1, text: 'EXX' };
    case 0xE1: return { len: 1, text: 'POP HL' };
    case 0xE5: return { len: 1, text: 'PUSH HL' };
    case 0xE9: return { len: 1, text: 'JP (HL)' };
    case 0xEB: return { len: 1, text: 'EX DE,HL' };
    case 0xF1: return { len: 1, text: 'POP AF' };
    case 0xF5: return { len: 1, text: 'PUSH AF' };
    case 0xFE: return { len: 2, text: `CP 0x${hex(rom[addr+1])}` };

    case 0xCB: {
      // CB prefix
      const cb = rom[addr+1];
      const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SWAP?','SRL'];
      const regs = ['B','C','D','E','H','L','(HL)','A'];
      if (cb >= 0x40 && cb <= 0x7F) {
        const bit = (cb >> 3) & 7;
        const reg = regs[cb & 7];
        return { len: 2, text: `BIT ${bit},${reg}` };
      }
      if (cb >= 0x80 && cb <= 0xBF) {
        const bit = (cb >> 3) & 7;
        const reg = regs[cb & 7];
        return { len: 2, text: `RES ${bit},${reg}` };
      }
      if (cb >= 0xC0) {
        const bit = (cb >> 3) & 7;
        const reg = regs[cb & 7];
        return { len: 2, text: `SET ${bit},${reg}` };
      }
      const op = bitOps[(cb >> 3) & 7];
      const reg = regs[cb & 7];
      return { len: 2, text: `${op} ${reg}` };
    }

    case 0xDD: {
      // IX prefix
      const ix = rom[addr+1];
      if (ix === 0x46) { const d = rom[addr+2]; return { len: 3, text: `LD B,(IX+${d})` }; }
      if (ix === 0x4E) { const d = rom[addr+2]; return { len: 3, text: `LD C,(IX+${d})` }; }
      if (ix === 0x56) { const d = rom[addr+2]; return { len: 3, text: `LD D,(IX+${d})` }; }
      if (ix === 0x5E) { const d = rom[addr+2]; return { len: 3, text: `LD E,(IX+${d})` }; }
      if (ix === 0x66) { const d = rom[addr+2]; return { len: 3, text: `LD H,(IX+${d})` }; }
      if (ix === 0x6E) { const d = rom[addr+2]; return { len: 3, text: `LD L,(IX+${d})` }; }
      if (ix === 0x7E) { const d = rom[addr+2]; return { len: 3, text: `LD A,(IX+${d})` }; }
      if (ix === 0x01) { return { len: 5, text: `LD.LIL BC,${hexAddr(readLE3(addr+2))}` }; }
      if (ix === 0x21) { return { len: 5, text: `LD.LIL HL,${hexAddr(readLE3(addr+2))}` }; }
      if (ix === 0x11) { return { len: 5, text: `LD.LIL DE,${hexAddr(readLE3(addr+2))}` }; }
      if (ix === 0xE5) { return { len: 2, text: 'PUSH IX' }; }
      if (ix === 0xE1) { return { len: 2, text: 'POP IX' }; }
      if (ix === 0xE9) { return { len: 2, text: 'JP (IX)' }; }
      if (ix === 0x36) { const d = rom[addr+2]; const v = rom[addr+3]; return { len: 4, text: `LD (IX+${d}),0x${hex(v)}` }; }
      if (ix === 0x77) { const d = rom[addr+2]; return { len: 3, text: `LD (IX+${d}),A` }; }
      if (ix === 0x75) { const d = rom[addr+2]; return { len: 3, text: `LD (IX+${d}),L` }; }
      if (ix === 0x74) { const d = rom[addr+2]; return { len: 3, text: `LD (IX+${d}),H` }; }
      if (ix === 0x71) { const d = rom[addr+2]; return { len: 3, text: `LD (IX+${d}),C` }; }
      if (ix === 0x70) { const d = rom[addr+2]; return { len: 3, text: `LD (IX+${d}),B` }; }
      if (ix === 0xBE) { const d = rom[addr+2]; return { len: 3, text: `CP (IX+${d})` }; }
      // DD 01 in eZ80 ADL mode = LD.LIL BC,nn (4-byte imm? depends on mode)
      // Fallback: try as LD BC,(IX+d) pattern
      if (ix === 0x09) { return { len: 2, text: 'ADD IX,BC' }; }
      if (ix === 0x19) { return { len: 2, text: 'ADD IX,DE' }; }
      if (ix === 0x2A) { return { len: 5, text: `LD.LIL HL,(${hexAddr(readLE3(addr+2))})` }; }
      if (ix === 0x22) { return { len: 5, text: `LD.LIL (${hexAddr(readLE3(addr+2))}),HL` }; }
      if (ix === 0xCD) { return { len: 5, text: `CALL.LIL ${hexAddr(readLE3(addr+2))}` }; }
      if (ix === 0xC3) { return { len: 5, text: `JP.LIL ${hexAddr(readLE3(addr+2))}` }; }
      return { len: 2, text: `DB 0xDD,0x${hex(ix)} ; (IX prefix, unhandled)` };
    }

    case 0xFD: {
      // IY prefix
      const iy = rom[addr+1];
      if (iy === 0x46) { const d = rom[addr+2]; return { len: 3, text: `LD B,(IY+${d})` }; }
      if (iy === 0x4E) { const d = rom[addr+2]; return { len: 3, text: `LD C,(IY+${d})` }; }
      if (iy === 0x56) { const d = rom[addr+2]; return { len: 3, text: `LD D,(IY+${d})` }; }
      if (iy === 0x5E) { const d = rom[addr+2]; return { len: 3, text: `LD E,(IY+${d})` }; }
      if (iy === 0x66) { const d = rom[addr+2]; return { len: 3, text: `LD H,(IY+${d})` }; }
      if (iy === 0x6E) { const d = rom[addr+2]; return { len: 3, text: `LD L,(IY+${d})` }; }
      if (iy === 0x7E) { const d = rom[addr+2]; return { len: 3, text: `LD A,(IY+${d})` }; }
      if (iy === 0xE5) { return { len: 2, text: 'PUSH IY' }; }
      if (iy === 0xE1) { return { len: 2, text: 'POP IY' }; }
      if (iy === 0xE9) { return { len: 2, text: 'JP (IY)' }; }
      return { len: 2, text: `DB 0xFD,0x${hex(iy)} ; (IY prefix, unhandled)` };
    }

    case 0xED: {
      const ed = rom[addr+1];
      if (ed === 0x43) { return { len: 5, text: `LD (${hexAddr(readLE3(addr+2))}),BC` }; }
      if (ed === 0x4B) { return { len: 5, text: `LD BC,(${hexAddr(readLE3(addr+2))})` }; }
      if (ed === 0x53) { return { len: 5, text: `LD (${hexAddr(readLE3(addr+2))}),DE` }; }
      if (ed === 0x5B) { return { len: 5, text: `LD DE,(${hexAddr(readLE3(addr+2))})` }; }
      if (ed === 0x73) { return { len: 5, text: `LD (${hexAddr(readLE3(addr+2))}),SP` }; }
      if (ed === 0x7B) { return { len: 5, text: `LD SP,(${hexAddr(readLE3(addr+2))})` }; }
      if (ed === 0xB0) { return { len: 2, text: 'LDIR' }; }
      if (ed === 0xB1) { return { len: 2, text: 'CPIR' }; }
      if (ed === 0xB8) { return { len: 2, text: 'LDDR' }; }
      return { len: 2, text: `DB 0xED,0x${hex(ed)} ; (ED prefix, unhandled)` };
    }

    default:
      return { len: 1, text: `DB 0x${hex(b)}` };
  }
}

let pc = DISASM_START;
while (pc < DISASM_END) {
  const { len, text } = disasmAt(pc);
  const rawBytes = [];
  for (let i = 0; i < len; i++) rawBytes.push(hex(rom[pc + i]));
  log(`  ${hexAddr(pc)}: ${rawBytes.join(' ').padEnd(20)} ${text}`);
  pc += len;
}

log('```');
log();

// ── Section 2: Find all callers of 0x05D5C2 ────────────────────────

log('## 2. Callers of installer 0x05D5C2 (direct)');
log();

function searchPattern(pattern, label) {
  const results = [];
  for (let i = 0; i < rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  log(`Found ${results.length} occurrence(s) of ${label}:`);
  return results;
}

// CALL 0x05D5C2 = CD C2 D5 05
const callDirect = searchPattern([0xCD, 0xC2, 0xD5, 0x05], 'CALL 0x05D5C2');
for (const addr of callDirect) {
  log();
  log(`### Caller at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 20);
  const end = Math.min(rom.length, addr + 24);
  log('```');
  for (let a = start; a < end; a += 16) {
    const e = Math.min(a + 16, end);
    const bytes = [];
    for (let i = a; i < e; i++) bytes.push(hex(rom[i]));
    log(`  ${hexAddr(a)}: ${bytes.join(' ')}`);
  }
  log('```');
  // Try to disassemble the 20 bytes before
  log('Disassembly of context before call:');
  log('```');
  let dpc = start;
  while (dpc < addr + 4) {
    const { len, text } = disasmAt(dpc);
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push(hex(rom[dpc + i]));
    log(`  ${hexAddr(dpc)}: ${rawBytes.join(' ').padEnd(20)} ${text}`);
    dpc += len;
    if (dpc > addr + 4) break;
  }
  log('```');
}
log();

// JP 0x05D5C2 = C3 C2 D5 05
const jpDirect = searchPattern([0xC3, 0xC2, 0xD5, 0x05], 'JP 0x05D5C2');
for (const addr of jpDirect) {
  log();
  log(`### JP caller at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 20);
  const end = Math.min(rom.length, addr + 24);
  log('```');
  for (let a = start; a < end; a += 16) {
    const e = Math.min(a + 16, end);
    const bytes = [];
    for (let i = a; i < e; i++) bytes.push(hex(rom[i]));
    log(`  ${hexAddr(a)}: ${bytes.join(' ')}`);
  }
  log('```');
}
log();

// ── Section 3: Find all callers of JP table entry 0x021E78 ─────────

log('## 3. Callers via JP table entry 0x021E78');
log();

// CALL 0x021E78 = CD 78 1E 02
const callJP = searchPattern([0xCD, 0x78, 0x1E, 0x02], 'CALL 0x021E78');
for (const addr of callJP) {
  log();
  log(`### Caller at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 20);
  const end = Math.min(rom.length, addr + 24);
  log('```');
  for (let a = start; a < end; a += 16) {
    const e = Math.min(a + 16, end);
    const bytes = [];
    for (let i = a; i < e; i++) bytes.push(hex(rom[i]));
    log(`  ${hexAddr(a)}: ${bytes.join(' ')}`);
  }
  log('```');
  log('Disassembly of context:');
  log('```');
  let dpc = start;
  while (dpc < addr + 4) {
    const { len, text } = disasmAt(dpc);
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push(hex(rom[dpc + i]));
    log(`  ${hexAddr(dpc)}: ${rawBytes.join(' ').padEnd(20)} ${text}`);
    dpc += len;
    if (dpc > addr + 4) break;
  }
  log('```');
}
log();

// JP 0x021E78 = C3 78 1E 02
const jpJPentry = searchPattern([0xC3, 0x78, 0x1E, 0x02], 'JP 0x021E78');
for (const addr of jpJPentry) {
  log();
  log(`### JP caller at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 20);
  const end = Math.min(rom.length, addr + 24);
  log('```');
  for (let a = start; a < end; a += 16) {
    const e = Math.min(a + 16, end);
    const bytes = [];
    for (let i = a; i < e; i++) bytes.push(hex(rom[i]));
    log(`  ${hexAddr(a)}: ${bytes.join(' ')}`);
  }
  log('```');
}
log();

// ── Section 4: Extract table bases from callers ─────────────────────

log('## 4. Table base extraction from callers');
log();

// Collect all caller sites (both direct and via JP table)
const allCallerSites = [
  ...callDirect.map(a => ({ addr: a, via: 'CALL 0x05D5C2' })),
  ...jpDirect.map(a => ({ addr: a, via: 'JP 0x05D5C2' })),
  ...callJP.map(a => ({ addr: a, via: 'CALL 0x021E78' })),
  ...jpJPentry.map(a => ({ addr: a, via: 'JP 0x021E78' })),
];

const tableBases = [];

for (const site of allCallerSites) {
  // Scan backward from the call site looking for LD BC,nn (01 xx xx xx)
  const searchStart = Math.max(0, site.addr - 30);
  let foundBC = null;
  for (let i = site.addr - 1; i >= searchStart; i--) {
    if (rom[i] === 0x01) {
      const bcVal = readLE3(i + 1);
      // Sanity check: is this a plausible LD BC instruction?
      // Make sure the instruction before the CALL makes sense
      foundBC = { ldAddr: i, bcVal };
      break;
    }
  }

  if (foundBC) {
    log(`Caller at ${hexAddr(site.addr)} (${site.via}): LD BC,${hexAddr(foundBC.bcVal)} at ${hexAddr(foundBC.ldAddr)}`);

    if (foundBC.bcVal < 0x400000) {
      tableBases.push({ callerAddr: site.addr, tableAddr: foundBC.bcVal, via: site.via });
    } else {
      log(`  -> RAM address (${hexAddr(foundBC.bcVal)}), cannot dump from ROM`);
    }
  } else {
    log(`Caller at ${hexAddr(site.addr)} (${site.via}): no LD BC,nn found in preceding 30 bytes`);
    // Show the preceding bytes for manual analysis
    log('  Preceding bytes:');
    const pStart = Math.max(0, site.addr - 20);
    const bytes = [];
    for (let i = pStart; i < site.addr; i++) bytes.push(hex(rom[i]));
    log(`  ${bytes.join(' ')}`);
  }
  log();
}

// ── Section 5: Dump and interpret tables ────────────────────────────

log('## 5. Table dumps and interpretation');
log();

// Deduplicate table bases
const uniqueTables = [...new Map(tableBases.map(t => [t.tableAddr, t])).values()];

for (const tbl of uniqueTables) {
  log(`### Table at ${hexAddr(tbl.tableAddr)} (referenced from ${hexAddr(tbl.callerAddr)} via ${tbl.via})`);
  log();

  const TABLE_BYTES = 64;
  const tableEnd = Math.min(tbl.tableAddr + TABLE_BYTES, rom.length);

  // Raw dump
  log('Raw bytes:');
  log('```');
  for (let a = tbl.tableAddr; a < tableEnd; a += 16) {
    const e = Math.min(a + 16, tableEnd);
    const bytes = [];
    for (let i = a; i < e; i++) bytes.push(hex(rom[i]));
    log(`  ${hexAddr(a)}: ${bytes.join(' ')}`);
  }
  log('```');
  log();

  // Interpretation A: 3-byte LE address + 1-byte flags
  log('#### Interpretation A: 4-byte entries (3-byte LE addr + 1-byte flags)');
  log();
  log('| Entry | Offset | Addr (LE3) | Flags | Valid ROM? |');
  log('|-------|--------|------------|-------|-----------|');
  for (let i = 0; i < TABLE_BYTES / 4; i++) {
    const off = tbl.tableAddr + i * 4;
    if (off + 3 >= rom.length) break;
    const addr3 = readLE3(off);
    const flags = rom[off + 3];
    const valid = addr3 > 0 && addr3 < 0x400000 ? 'YES' : 'no';
    log(`| ${i.toString().padStart(2)} | +${hex(i*4, 2)} | ${hexAddr(addr3)} | 0x${hex(flags)} | ${valid} |`);
  }
  log();

  // Interpretation B: JP instructions (C3 + 3-byte addr)
  log('#### Interpretation B: JP instruction table (C3 + 3-byte LE addr per entry)');
  log();
  let jpCount = 0;
  let nonJpCount = 0;
  log('| Entry | Offset | Opcode | Target | Valid ROM? |');
  log('|-------|--------|--------|--------|-----------|');
  for (let i = 0; i < TABLE_BYTES / 4; i++) {
    const off = tbl.tableAddr + i * 4;
    if (off + 3 >= rom.length) break;
    const opcode = rom[off];
    const target = readLE3(off + 1);
    const isJP = opcode === 0xC3;
    const valid = target > 0 && target < 0x400000 ? 'YES' : 'no';
    if (isJP) jpCount++; else nonJpCount++;
    log(`| ${i.toString().padStart(2)} | +${hex(i*4, 2)} | 0x${hex(opcode)} ${isJP ? '(JP)' : '    '} | ${hexAddr(target)} | ${valid} |`);
  }
  log();
  log(`JP instructions: ${jpCount}/${jpCount + nonJpCount} entries start with 0xC3`);
  log();

  // Interpretation C: 3-byte LE addresses only (no flags byte)
  log('#### Interpretation C: 3-byte entries (packed LE addresses, no flags)');
  log();
  log('| Entry | Offset | Addr (LE3) | Valid ROM? |');
  log('|-------|--------|------------|-----------|');
  for (let i = 0; i < Math.floor(TABLE_BYTES / 3); i++) {
    const off = tbl.tableAddr + i * 3;
    if (off + 2 >= rom.length) break;
    const addr3 = readLE3(off);
    const valid = addr3 > 0 && addr3 < 0x400000 ? 'YES' : 'no';
    log(`| ${i.toString().padStart(2)} | +${hex(i*3, 2)} | ${hexAddr(addr3)} | ${valid} |`);
  }
  log();
}

// ── Section 6: Also check 0x021E78 JP table entry ───────────────────

log('## 6. JP table entry at 0x021E78');
log();
log('Verifying what 0x021E78 actually is:');
log('```');
{
  const addr = 0x021E78;
  const bytes = [];
  for (let i = 0; i < 8; i++) bytes.push(hex(rom[addr + i]));
  log(`  ${hexAddr(addr)}: ${bytes.join(' ')}`);
  const { len, text } = disasmAt(addr);
  const rawBytes = [];
  for (let i = 0; i < len; i++) rawBytes.push(hex(rom[addr + i]));
  log(`  -> ${text}`);
}
log('```');
log();

// ── Section 7: JP table context — find the base and index ───────────

log('## 7. JP vector table context');
log();

// The entry at 0x021E78 is JP 0x05D5C2. Let's find the table base.
// The JP table is a series of C3 xx xx xx entries (4 bytes each).
// Walk backward from 0x021E78 to find the start of the table.
{
  let tableStart = 0x021E78;
  while (tableStart >= 4 && rom[tableStart - 4] === 0xC3) {
    tableStart -= 4;
  }
  let tableEnd = 0x021E78;
  while (tableEnd + 4 < rom.length && rom[tableEnd] === 0xC3) {
    tableEnd += 4;
  }

  const entryIndex = (0x021E78 - tableStart) / 4;
  const totalEntries = (tableEnd - tableStart) / 4;

  log(`JP table starts at ${hexAddr(tableStart)}, ends at ${hexAddr(tableEnd)}`);
  log(`Total entries: ${totalEntries}`);
  log(`Entry for 0x05D5C2 is at index ${entryIndex} (0x${hex(entryIndex, 2)})`);
  log();

  // Show entries around our target
  log('Entries near index of interest:');
  log('```');
  const showStart = Math.max(0, entryIndex - 5);
  const showEnd = Math.min(totalEntries, entryIndex + 6);
  for (let i = showStart; i < showEnd; i++) {
    const addr = tableStart + i * 4;
    const target = readLE3(addr + 1);
    const marker = i === entryIndex ? ' <-- installer 0x05D5C2' : '';
    log(`  [${i.toString().padStart(3)}] ${hexAddr(addr)}: JP ${hexAddr(target)}${marker}`);
  }
  log('```');
  log();

  // The OS syscall dispatch mechanism uses CALL (table_base + index*4).
  // For eZ80 TI-OS, the syscall pattern is typically:
  //   RST 28h or CALL addr where addr = table_base + syscall_number * 4
  // But the JP table at 0x020000+ is the standard OS entry point table.
  // Callers do: CALL 0x021E78 or use an indirect dispatch.
  // Let's check what index this maps to from common bases.

  // Common TI-OS JP table bases
  const knownBases = [0x020000, 0x021000, 0x020100, 0x020000];
  for (const base of [...new Set(knownBases)]) {
    if (0x021E78 >= base) {
      const idx = (0x021E78 - base) / 4;
      if (Number.isInteger(idx)) {
        log(`From base ${hexAddr(base)}: index = ${idx} (0x${hex(idx, 4)})`);
      }
    }
  }
  log();
}

// ── Section 8: Find all stores to D1441D (who populates the table ptr) ──

log('## 8. Stores to RAM D1441D (key handler table base pointer)');
log();

// LD (0xD1441D),BC = ED 43 1D 44 D1
const storesBC = searchPattern([0xED, 0x43, 0x1D, 0x44, 0xD1], 'LD (0xD1441D),BC');
for (const addr of storesBC) {
  log(`### Store at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 30);
  const end = Math.min(rom.length, addr + 10);
  log('```');
  let dpc = start;
  while (dpc < end) {
    const { len, text } = disasmAt(dpc);
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push(hex(rom[dpc + i]));
    log(`  ${hexAddr(dpc)}: ${rawBytes.join(' ').padEnd(20)} ${text}`);
    dpc += len;
    if (dpc >= end) break;
  }
  log('```');
  log();
}

// LD (0xD1441D),HL = 22 1D 44 D1
const storesHL = searchPattern([0x22, 0x1D, 0x44, 0xD1], 'LD (0xD1441D),HL');
for (const addr of storesHL) {
  log(`### Store at ${hexAddr(addr)}`);
  const start = Math.max(0, addr - 30);
  const end = Math.min(rom.length, addr + 10);
  log('```');
  let dpc = start;
  while (dpc < end) {
    const { len, text } = disasmAt(dpc);
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push(hex(rom[dpc + i]));
    log(`  ${hexAddr(dpc)}: ${rawBytes.join(' ').padEnd(20)} ${text}`);
    dpc += len;
    if (dpc >= end) break;
  }
  log('```');
  log();
}

// ── Section 9: Find callers that load BC then call the JP table entry ──

log('## 9. Broader search: LD BC,<rom_addr> followed by CALL to any OS entry');
log();
log('Searching for LD BC,nn (01 xx xx xx) where nn < 0x400000 and nn > 0x020000,');
log('followed within 20 bytes by CALL to an address in the 0x0200xx-0x022xxx range.');
log();

{
  const results = [];
  for (let i = 0; i < rom.length - 10; i++) {
    if (rom[i] !== 0x01) continue;
    const bcVal = readLE3(i + 1);
    // Only ROM addresses that could be key handler tables
    if (bcVal < 0x020000 || bcVal >= 0x400000) continue;
    // Look ahead for a CALL within 20 bytes
    for (let j = i + 4; j < Math.min(i + 24, rom.length - 4); j++) {
      if (rom[j] === 0xCD) {
        const callTarget = readLE3(j + 1);
        // Is it calling the OS JP table area or 0x05D5C2?
        if ((callTarget >= 0x020000 && callTarget < 0x023000) || callTarget === 0x05D5C2) {
          results.push({ ldAddr: i, bcVal, callAddr: j, callTarget });
          break;
        }
      }
    }
  }

  log(`Found ${results.length} candidate(s):`);
  for (const r of results) {
    log();
    log(`  LD BC,${hexAddr(r.bcVal)} at ${hexAddr(r.ldAddr)} -> CALL ${hexAddr(r.callTarget)} at ${hexAddr(r.callAddr)}`);

    // Check if call target is in the JP table and if so, which entry
    if (rom[r.callTarget] === 0xC3) {
      const jpTarget = readLE3(r.callTarget + 1);
      log(`    JP table entry -> JP ${hexAddr(jpTarget)}`);
      if (jpTarget === 0x05D5C2) {
        log(`    *** THIS CALLS THE KEY HANDLER TABLE INSTALLER ***`);
      }
    }

    // Dump table if in ROM
    if (r.bcVal < 0x400000 && r.bcVal >= 0x000100) {
      log(`    First 64 bytes at table ${hexAddr(r.bcVal)}:`);
      const tEnd = Math.min(r.bcVal + 64, rom.length);
      for (let a = r.bcVal; a < tEnd; a += 16) {
        const e = Math.min(a + 16, tEnd);
        const bytes = [];
        for (let ii = a; ii < e; ii++) bytes.push(hex(rom[ii]));
        log(`      ${hexAddr(a)}: ${bytes.join(' ')}`);
      }

      // Quick check: how many 4-byte entries have byte[0]=C3 (JP)?
      let jpCount = 0;
      let validPtrCount = 0;
      for (let e = 0; e < 16; e++) {
        const off = r.bcVal + e * 4;
        if (off + 3 >= rom.length) break;
        if (rom[off] === 0xC3) jpCount++;
        const ptr = readLE3(off);
        if (ptr > 0x100 && ptr < 0x400000) validPtrCount++;
      }
      log(`    JP entries (of 16): ${jpCount}; Valid ROM ptrs (3-byte LE): ${validPtrCount}`);
    }
  }
}
log();

// ── Section 10: The installer disassembly, corrected ────────────────

log('## 10. Corrected installer disassembly (0x05D5C2)');
log();
log('The installer at 0x05D5C2 has DD prefix bytes that our simple disassembler');
log('does not fully handle. Here is a byte-level manual annotation:');
log();
log('```');
{
  // 0x05D5C2: CD 30 01 00 = CALL 0x000130  (frame setup)
  // 0x05D5C6: DD 07       = DD prefix + 07 (RLCA? or part of IX instruction)
  //   Actually in eZ80: DD 07 is a suffix mode byte
  //   DD prefix in eZ80 can mean .SIL suffix on next instruction
  //   So DD 06 ED 43 1D 44 D1 could be:
  //     DD prefix = .SIL mode
  //     06 = LD B,n -> but then ED 43... doesn't make sense
  //   Alternative: the DD is a standalone suffix prefix
  //     07 = RLCA (rotate A left through carry)
  //     06 ED = LD B,0xED ... no
  //   Or looking at session 410: "LD BC,(IX+6)"
  //   DD 4B 06 would be LD C,(IX+6) but that's only one byte
  //   Actually session 410 says the installer does LD BC,(IX+6)
  //   In eZ80: there's no native LD BC,(IX+d). It might be two loads:
  //     DD 46 06 = LD B,(IX+6) and DD 4E 07 = LD C,(IX+7)
  //   But the bytes are: DD 07 06 ED 43 1D 44 D1
  //   Let me just show the raw bytes with session 410's interpretation

  const start = 0x05D5C2;
  const end = 0x05D5D8;
  for (let a = start; a < end; a += 1) {
    // just show byte
  }

  // Manual annotation based on session 410 findings
  log('  0x05D5C2: CD 30 01 00    CALL 0x000130       ; frame setup (PUSH IX, LD IX,SP)');
  log('  0x05D5C6: DD             .SIL prefix');
  log('  0x05D5C7: 07             RLCA                ; (or part of frame setup)');
  log('  0x05D5C8: 06 ED          --- ambiguous ---');
  log('  Note: session 410 decoded this as LD BC,(IX+6) which reads the');
  log('  table base parameter from the stack frame.');
  log('  0x05D5C8: ED 43 1D 44 D1 LD (0xD1441D),BC    ; store table base to RAM');
  log('  0x05D5CD: (adjusted)');
  log('  ...bytes: AF             XOR A');
  log('  ...bytes: 32 84 40 D1    LD (0xD14084),A      ; clear notification flag');
  log('  ...bytes: DD F9          LD SP,IX             ; frame teardown');
  log('  ...bytes: DD E1          POP IX');
  log('  ...bytes: C9             RET');

  log();
  log('  Raw bytes 0x05D5C2-0x05D5D7:');
  const bytes = [];
  for (let i = 0x05D5C2; i < 0x05D5D8; i++) bytes.push(hex(rom[i]));
  log('  ' + bytes.join(' '));
}
log('```');
log();

// ── Section 11: Summary ─────────────────────────────────────────────

log('## 11. Summary');
log();
log(`Total direct CALL 0x05D5C2: ${callDirect.length}`);
log(`Total JP 0x05D5C2: ${jpDirect.length}`);
log(`Total CALL 0x021E78: ${callJP.length}`);
log(`Total JP 0x021E78: ${jpJPentry.length}`);
log(`Total unique table bases found in ROM: ${uniqueTables.length}`);
log();

if (uniqueTables.length > 0) {
  log('Table base addresses found:');
  for (const t of uniqueTables) {
    log(`  - ${hexAddr(t.tableAddr)} (from caller ${hexAddr(t.callerAddr)})`);
  }
}

// ── Write report ────────────────────────────────────────────────────

fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
console.log(`\nReport written to ${REPORT_PATH}`);
