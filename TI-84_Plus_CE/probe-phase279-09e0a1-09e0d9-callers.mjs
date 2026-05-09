#!/usr/bin/env node

/**
 * Phase 279: Trace 0x09E0A1 and 0x09E0D9 — the ONLY 2 callers of 0x09DD14 (STAT init)
 *
 * Goals:
 *   1. Disassemble 30+ bytes before/after each CALL 0x09DD14 site
 *   2. Find parent function boundaries for each call site
 *   3. Search ROM for callers of those parent functions
 *   4. Determine what STAT menu paths trigger 0x09DD14 → 0x09DEE0 dispatch table reset
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);

// --- Helpers ---

function hex(v, w = 6) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }

function read24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

/** Disassemble a region using the decoder */
function disasmRegion(start, end) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    try {
      const instr = decodeInstruction(rom, pc);
      if (!instr || !instr.length || instr.length < 1) {
        lines.push(`  ${hex(pc)}: DB ${hex(rom[pc], 2)}  (decode fail)`);
        pc++;
        continue;
      }
      const bytes = [];
      for (let i = 0; i < instr.length; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
      const byteStr = bytes.join(' ').padEnd(20);
      lines.push(`  ${hex(pc)}: ${byteStr} ${instr.mnemonic || instr.toString()}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: DB ${hex(rom[pc], 2)}  (error: ${e.message})`);
      pc++;
    }
  }
  return lines;
}

/** Simple manual disassembly for when decoder may not handle everything */
function manualDisasm(start, length) {
  const lines = [];
  let pc = start;
  const end = start + length;
  while (pc < end) {
    const b = rom[pc];
    let line = '';
    let advance = 1;

    // Common eZ80 ADL instructions
    if (b === 0xCD) { // CALL nn
      const addr = read24LE(pc + 1);
      line = `CALL ${hex(addr)}`;
      advance = 4;
    } else if (b === 0xC3) { // JP nn
      const addr = read24LE(pc + 1);
      line = `JP ${hex(addr)}`;
      advance = 4;
    } else if (b === 0xC9) {
      line = 'RET';
    } else if (b === 0xC0) { line = 'RET NZ'; }
    else if (b === 0xC8) { line = 'RET Z'; }
    else if (b === 0xD0) { line = 'RET NC'; }
    else if (b === 0xD8) { line = 'RET C'; }
    else if (b === 0xE0) { line = 'RET PO'; }
    else if (b === 0xE8) { line = 'RET PE'; }
    else if (b === 0xF0) { line = 'RET P'; }
    else if (b === 0xF8) { line = 'RET M'; }
    else if (b === 0xC4) { const a = read24LE(pc+1); line = `CALL NZ,${hex(a)}`; advance = 4; }
    else if (b === 0xCC) { const a = read24LE(pc+1); line = `CALL Z,${hex(a)}`; advance = 4; }
    else if (b === 0xD4) { const a = read24LE(pc+1); line = `CALL NC,${hex(a)}`; advance = 4; }
    else if (b === 0xDC) { const a = read24LE(pc+1); line = `CALL C,${hex(a)}`; advance = 4; }
    else if (b === 0xC2) { const a = read24LE(pc+1); line = `JP NZ,${hex(a)}`; advance = 4; }
    else if (b === 0xCA) { const a = read24LE(pc+1); line = `JP Z,${hex(a)}`; advance = 4; }
    else if (b === 0xD2) { const a = read24LE(pc+1); line = `JP NC,${hex(a)}`; advance = 4; }
    else if (b === 0xDA) { const a = read24LE(pc+1); line = `JP C,${hex(a)}`; advance = 4; }
    else if (b === 0x18) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x20) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NZ,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x28) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR Z,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x30) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NC,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x38) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR C,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    // LD r,imm8
    else if (b === 0x3E) { line = `LD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x06) { line = `LD B,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x0E) { line = `LD C,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x16) { line = `LD D,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x1E) { line = `LD E,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x26) { line = `LD H,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x2E) { line = `LD L,${hex(rom[pc+1], 2)}`; advance = 2; }
    // LD rr,imm24
    else if (b === 0x01) { line = `LD BC,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x11) { line = `LD DE,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x21) { line = `LD HL,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x31) { line = `LD SP,${hex(read24LE(pc+1))}`; advance = 4; }
    // LD (HL),A and LD A,(HL)
    else if (b === 0x77) { line = 'LD (HL),A'; }
    else if (b === 0x7E) { line = 'LD A,(HL)'; }
    // LD (nn),A  and LD A,(nn)
    else if (b === 0x32) { line = `LD (${hex(read24LE(pc+1))}),A`; advance = 4; }
    else if (b === 0x3A) { line = `LD A,(${hex(read24LE(pc+1))})`; advance = 4; }
    // PUSH/POP
    else if (b === 0xC5) { line = 'PUSH BC'; }
    else if (b === 0xD5) { line = 'PUSH DE'; }
    else if (b === 0xE5) { line = 'PUSH HL'; }
    else if (b === 0xF5) { line = 'PUSH AF'; }
    else if (b === 0xC1) { line = 'POP BC'; }
    else if (b === 0xD1) { line = 'POP DE'; }
    else if (b === 0xE1) { line = 'POP HL'; }
    else if (b === 0xF1) { line = 'POP AF'; }
    // INC/DEC r
    else if (b === 0x3C) { line = 'INC A'; }
    else if (b === 0x3D) { line = 'DEC A'; }
    else if (b === 0x04) { line = 'INC B'; }
    else if (b === 0x05) { line = 'DEC B'; }
    else if (b === 0x0C) { line = 'INC C'; }
    else if (b === 0x0D) { line = 'DEC C'; }
    else if (b === 0x23) { line = 'INC HL'; }
    else if (b === 0x2B) { line = 'DEC HL'; }
    else if (b === 0x03) { line = 'INC BC'; }
    else if (b === 0x0B) { line = 'DEC BC'; }
    else if (b === 0x13) { line = 'INC DE'; }
    else if (b === 0x1B) { line = 'DEC DE'; }
    // CP
    else if (b === 0xFE) { line = `CP ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xBF) { line = 'CP A'; }
    else if (b === 0xB8) { line = 'CP B'; }
    else if (b === 0xB9) { line = 'CP C'; }
    // OR/AND/XOR
    else if (b === 0xB7) { line = 'OR A'; }
    else if (b === 0xA7) { line = 'AND A'; }
    else if (b === 0xAF) { line = 'XOR A'; }
    else if (b === 0xF6) { line = `OR ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xE6) { line = `AND ${hex(rom[pc+1], 2)}`; advance = 2; }
    // NOP
    else if (b === 0x00) { line = 'NOP'; }
    // EX DE,HL
    else if (b === 0xEB) { line = 'EX DE,HL'; }
    // LD r,r
    else if (b === 0x7F) { line = 'LD A,A'; }
    else if (b === 0x78) { line = 'LD A,B'; }
    else if (b === 0x79) { line = 'LD A,C'; }
    else if (b === 0x7A) { line = 'LD A,D'; }
    else if (b === 0x7B) { line = 'LD A,E'; }
    else if (b === 0x7C) { line = 'LD A,H'; }
    else if (b === 0x7D) { line = 'LD A,L'; }
    else if (b === 0x47) { line = 'LD B,A'; }
    else if (b === 0x4F) { line = 'LD C,A'; }
    else if (b === 0x57) { line = 'LD D,A'; }
    else if (b === 0x5F) { line = 'LD E,A'; }
    else if (b === 0x67) { line = 'LD H,A'; }
    else if (b === 0x6F) { line = 'LD L,A'; }
    // ADD/SUB
    else if (b === 0x87) { line = 'ADD A,A'; }
    else if (b === 0x80) { line = 'ADD A,B'; }
    else if (b === 0xC6) { line = `ADD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x09) { line = 'ADD HL,BC'; }
    else if (b === 0x19) { line = 'ADD HL,DE'; }
    else if (b === 0x29) { line = 'ADD HL,HL'; }
    // DD prefix (IX)
    else if (b === 0xDD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IX,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IX'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IX'; advance = 2; }
      else if (b2 === 0xE9) { line = 'JP (IX)'; advance = 2; }
      else if (b2 === 0x7E) { const d = rom[pc+2]; line = `LD A,(IX+${d})`; advance = 3; }
      else if (b2 === 0x77) { const d = rom[pc+2]; line = `LD (IX+${d}),A`; advance = 3; }
      else if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; line = `LD (IX+${d}),${hex(v,2)}`; advance = 4; }
      else if (b2 === 0xBE) { const d = rom[pc+2]; line = `CP (IX+${d})`; advance = 3; }
      else if (b2 === 0x46) { const d = rom[pc+2]; line = `LD B,(IX+${d})`; advance = 3; }
      else if (b2 === 0x4E) { const d = rom[pc+2]; line = `LD C,(IX+${d})`; advance = 3; }
      else if (b2 === 0x56) { const d = rom[pc+2]; line = `LD D,(IX+${d})`; advance = 3; }
      else if (b2 === 0x5E) { const d = rom[pc+2]; line = `LD E,(IX+${d})`; advance = 3; }
      else if (b2 === 0x66) { const d = rom[pc+2]; line = `LD H,(IX+${d})`; advance = 3; }
      else if (b2 === 0x6E) { const d = rom[pc+2]; line = `LD L,(IX+${d})`; advance = 3; }
      else { line = `DB DD ${hex(b2,2)}`; advance = 2; }
    }
    // FD prefix (IY)
    else if (b === 0xFD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IY,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IY'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IY'; advance = 2; }
      else if (b2 === 0xE9) { line = 'JP (IY)'; advance = 2; }
      else if (b2 === 0x7E) { const d = rom[pc+2]; line = `LD A,(IY+${d})`; advance = 3; }
      else if (b2 === 0x77) { const d = rom[pc+2]; line = `LD (IY+${d}),A`; advance = 3; }
      else if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; line = `LD (IY+${d}),${hex(v,2)}`; advance = 4; }
      else if (b2 === 0xBE) { const d = rom[pc+2]; line = `CP (IY+${d})`; advance = 3; }
      else if (b2 === 0x46) { const d = rom[pc+2]; line = `LD B,(IY+${d})`; advance = 3; }
      else if (b2 === 0x4E) { const d = rom[pc+2]; line = `LD C,(IY+${d})`; advance = 3; }
      else if (b2 === 0x56) { const d = rom[pc+2]; line = `LD D,(IY+${d})`; advance = 3; }
      else if (b2 === 0x5E) { const d = rom[pc+2]; line = `LD E,(IY+${d})`; advance = 3; }
      else if (b2 === 0x66) { const d = rom[pc+2]; line = `LD H,(IY+${d})`; advance = 3; }
      else if (b2 === 0x6E) { const d = rom[pc+2]; line = `LD L,(IY+${d})`; advance = 3; }
      else if (b2 === 0xCB) {
        const d = rom[pc+2]; const op = rom[pc+3];
        const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { line = `BIT ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0xC6) { line = `SET ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0x86) { line = `RES ${bit},(IY+${d})`; advance = 4; }
        else { line = `DB FD CB ${hex(d,2)} ${hex(op,2)}`; advance = 4; }
      }
      else { line = `DB FD ${hex(b2,2)}`; advance = 2; }
    }
    // CB prefix (bit ops)
    else if (b === 0xCB) {
      const b2 = rom[pc+1];
      const bit = (b2 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b2 & 7];
      if ((b2 & 0xC0) === 0x40) { line = `BIT ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0xC0) { line = `SET ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0x80) { line = `RES ${bit},${reg}`; advance = 2; }
      else { line = `CB ${hex(b2,2)}`; advance = 2; }
    }
    // ED prefix
    else if (b === 0xED) {
      const b2 = rom[pc+1];
      if (b2 === 0xB0) { line = 'LDIR'; advance = 2; }
      else if (b2 === 0xB8) { line = 'LDDR'; advance = 2; }
      else if (b2 === 0xA0) { line = 'LDI'; advance = 2; }
      else if (b2 === 0xA8) { line = 'LDD'; advance = 2; }
      else if (b2 === 0x43) { line = `LD (${hex(read24LE(pc+2))}),BC`; advance = 5; }
      else if (b2 === 0x53) { line = `LD (${hex(read24LE(pc+2))}),DE`; advance = 5; }
      else if (b2 === 0x63) { line = `LD (${hex(read24LE(pc+2))}),HL`; advance = 5; }
      else if (b2 === 0x73) { line = `LD (${hex(read24LE(pc+2))}),SP`; advance = 5; }
      else if (b2 === 0x4B) { line = `LD BC,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x5B) { line = `LD DE,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x6B) { line = `LD HL,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x7B) { line = `LD SP,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x44) { line = 'NEG'; advance = 2; }
      else if (b2 === 0x4D) { line = 'RETI'; advance = 2; }
      else if (b2 === 0x45) { line = 'RETN'; advance = 2; }
      else if (b2 === 0x46) { line = 'IM 0'; advance = 2; }
      else if (b2 === 0x56) { line = 'IM 1'; advance = 2; }
      else if (b2 === 0x5E) { line = 'IM 2'; advance = 2; }
      else { line = `ED ${hex(b2,2)}`; advance = 2; }
    }
    // RST
    else if ((b & 0xC7) === 0xC7) { line = `RST ${hex(b & 0x38, 2)}`; }
    // DI/EI
    else if (b === 0xF3) { line = 'DI'; }
    else if (b === 0xFB) { line = 'EI'; }
    // SCF/CCF
    else if (b === 0x37) { line = 'SCF'; }
    else if (b === 0x3F) { line = 'CCF'; }
    // DJNZ
    else if (b === 0x10) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `DJNZ ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    // Catch-all
    else {
      line = `DB ${hex(b, 2)}`;
    }

    const bytes = [];
    for (let i = 0; i < advance; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);

    const marker = (b === 0xC9) ? ' <--- RET' :
                   (b === 0xCD && read24LE(pc+1) === 0x09DD14) ? ' <--- CALL 0x09DD14 ***' : '';
    lines.push(`  ${hex(pc)}: ${byteStr} ${line}${marker}`);
    pc += advance;
  }
  return lines;
}

/** Search entire ROM for CALL/JP to a given address */
function findCallersOf(targetAddr) {
  const callers = [];
  const t0 = targetAddr & 0xFF;
  const t1 = (targetAddr >> 8) & 0xFF;
  const t2 = (targetAddr >> 16) & 0xFF;

  const callOpcodes = [0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]; // CALL variants
  const jpOpcodes = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]; // JP variants

  const opcodeNames = {
    0xCD: 'CALL', 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C',
    0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M',
    0xC3: 'JP', 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
    0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M',
  };

  const allOpcodes = [...callOpcodes, ...jpOpcodes];

  // Only search non-erased ROM (up to ~0x200000 for active code, but scan full 4MB to be safe)
  const searchEnd = Math.min(rom.length - 3, 0x400000);
  for (let i = 0; i < searchEnd; i++) {
    if (allOpcodes.includes(rom[i]) && rom[i+1] === t0 && rom[i+2] === t1 && rom[i+3] === t2) {
      callers.push({ addr: i, type: opcodeNames[rom[i]] || 'UNKNOWN' });
    }
  }
  return callers;
}

/** Find the start of a function by scanning backward for RET (0xC9) */
function findFunctionStart(addr, maxScanBack = 512) {
  // Scan backward for a RET instruction — the byte after it is likely the function entry
  for (let i = addr - 1; i >= Math.max(0, addr - maxScanBack); i--) {
    if (rom[i] === 0xC9) {
      return i + 1; // Function likely starts right after the RET
    }
  }
  return addr - maxScanBack; // fallback
}

/** Find the end of a function by scanning forward for RET (0xC9) */
function findFunctionEnd(addr, maxScanFwd = 512) {
  for (let i = addr; i < Math.min(rom.length, addr + maxScanFwd); i++) {
    if (rom[i] === 0xC9) {
      return i; // The RET instruction
    }
  }
  return addr + maxScanFwd; // fallback
}

// ============================================================
// MAIN
// ============================================================

console.log('='.repeat(80));
console.log('Phase 279: Trace 0x09E0A1 and 0x09E0D9 — callers of 0x09DD14');
console.log('='.repeat(80));

// First, verify these are indeed CALL 0x09DD14
const callSites = [0x09E0A1, 0x09E0D9];
for (const site of callSites) {
  const opcode = rom[site];
  const target = read24LE(site + 1);
  console.log(`\n  ${hex(site)}: opcode=${hex(opcode,2)} target=${hex(target)} — ${opcode === 0xCD && target === 0x09DD14 ? 'CONFIRMED CALL 0x09DD14' : 'NOT a CALL 0x09DD14!'}`);
}

// ============================================================
// PART 1: Disassemble around each call site
// ============================================================

for (const site of callSites) {
  console.log('\n' + '='.repeat(80));
  console.log(`CALL SITE ${hex(site)} — disassembly (${hex(site - 40)} to ${hex(site + 40)})`);
  console.log('='.repeat(80));

  const lines = manualDisasm(site - 40, 80);
  for (const l of lines) console.log(l);
}

// ============================================================
// PART 2: Find parent function boundaries
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 2: Parent function boundaries');
console.log('='.repeat(80));

const parentFunctions = {};

for (const site of callSites) {
  const funcStart = findFunctionStart(site);
  const funcEnd = findFunctionEnd(site + 4); // scan from after the CALL
  const funcSize = funcEnd - funcStart + 1;

  console.log(`\n  Call site ${hex(site)} belongs to function:`);
  console.log(`    Entry: ${hex(funcStart)}`);
  console.log(`    RET at: ${hex(funcEnd)}`);
  console.log(`    Size: ${funcSize} bytes (${hex(funcStart)} - ${hex(funcEnd)})`);

  parentFunctions[site] = { start: funcStart, end: funcEnd };

  // Disassemble the full parent function
  console.log(`\n  Full disassembly of parent function ${hex(funcStart)}:`);
  const lines = manualDisasm(funcStart, funcEnd - funcStart + 1);
  for (const l of lines) console.log(l);
}

// ============================================================
// PART 3: Find callers of each parent function
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 3: Callers of parent functions');
console.log('='.repeat(80));

const parentStarts = new Set();
for (const site of callSites) {
  parentStarts.add(parentFunctions[site].start);
}

for (const parentAddr of parentStarts) {
  console.log(`\n  Callers of ${hex(parentAddr)}:`);
  const callers = findCallersOf(parentAddr);
  if (callers.length === 0) {
    console.log('    (none found — may be called via jump table or indirect)');
  } else {
    for (const c of callers) {
      console.log(`    ${hex(c.addr)}: ${c.type} ${hex(parentAddr)}`);
    }
  }

  // For each caller, find ITS parent function too
  if (callers.length > 0 && callers.length <= 20) {
    for (const c of callers) {
      const grandStart = findFunctionStart(c.addr);
      const grandEnd = findFunctionEnd(c.addr + 4);
      console.log(`      -> caller ${hex(c.addr)} is in function ${hex(grandStart)}..${hex(grandEnd)}`);
    }
  }
}

// ============================================================
// PART 4: STAT menu context analysis
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 4: STAT menu context — what paths lead to 0x09DD14?');
console.log('='.repeat(80));

// Direct callers of 0x09DD14
console.log('\n  Direct callers of 0x09DD14 (STAT init):');
const directCallers = findCallersOf(0x09DD14);
for (const c of directCallers) {
  console.log(`    ${hex(c.addr)}: ${c.type} 0x09DD14`);
}

// Check if parent functions are themselves in a jump table region
// by looking at surrounding addresses
for (const parentAddr of parentStarts) {
  console.log(`\n  Checking ${hex(parentAddr)} region for jump table patterns:`);
  // Look for consecutive JP or CALL instructions nearby
  const checkStart = Math.max(0, parentAddr - 100);
  const checkEnd = Math.min(rom.length, parentAddr + 20);

  // Check if address appears in any 3-byte pointer table in ROM
  const pLo = parentAddr & 0xFF;
  const pMi = (parentAddr >> 8) & 0xFF;
  const pHi = (parentAddr >> 16) & 0xFF;

  console.log(`    Searching for ${hex(parentAddr)} as pointer in ROM tables...`);
  let ptrRefs = 0;
  for (let i = 0; i < Math.min(rom.length - 2, 0x400000); i++) {
    if (rom[i] === pLo && rom[i+1] === pMi && rom[i+2] === pHi) {
      // Verify it's not a CALL/JP (those have opcode before)
      if (i > 0 && [0xCD, 0xC3, 0xC4, 0xCC, 0xD4, 0xDC, 0xC2, 0xCA, 0xD2, 0xDA].includes(rom[i-1])) {
        continue; // It's just a CALL/JP instruction
      }
      console.log(`      Found pointer at ${hex(i)} (context: ${hex(rom[i-2],2)} ${hex(rom[i-1],2)} [${hex(pLo,2)} ${hex(pMi,2)} ${hex(pHi,2)}] ${hex(rom[i+3],2)} ${hex(rom[i+4],2)})`);
      ptrRefs++;
      if (ptrRefs >= 10) {
        console.log('      (truncated at 10)');
        break;
      }
    }
  }
  if (ptrRefs === 0) {
    console.log('      No raw pointer references found (only CALL/JP references)');
  }
}

// Also trace the call chain: who calls what?
console.log('\n  === CALL CHAIN SUMMARY ===');
console.log('  0x09DD14 (STAT init, 163 bytes)');
console.log('    -> calls 0x09DEE0 (dispatch table reset)');
console.log('    -> called by:');
for (const c of directCallers) {
  const parent = findFunctionStart(c.addr);
  const end = findFunctionEnd(c.addr + 4);
  console.log(`       ${c.type} at ${hex(c.addr)} in function ${hex(parent)}..${hex(end)}`);

  // Who calls this parent?
  const grandCallers = findCallersOf(parent);
  if (grandCallers.length > 0) {
    console.log(`         -> ${hex(parent)} called by:`);
    for (const gc of grandCallers) {
      const ggParent = findFunctionStart(gc.addr);
      console.log(`            ${gc.type} at ${hex(gc.addr)} in function ${hex(ggParent)}`);
    }
  } else {
    console.log(`         -> ${hex(parent)} has no direct CALL/JP callers (jump table / indirect?)`);
  }
}

// ============================================================
// PART 5: Additional context — what other STAT functions are nearby?
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 5: Nearby STAT functions (0x09DD00 - 0x09E200)');
console.log('='.repeat(80));

// Find all CALL targets referenced from this region
const statCallTargets = new Map();
for (let i = 0x09DD00; i < 0x09E200; i++) {
  if (rom[i] === 0xCD) {
    const target = read24LE(i + 1);
    if (target < 0x400000) {
      if (!statCallTargets.has(target)) statCallTargets.set(target, []);
      statCallTargets.get(target).push(i);
    }
  }
}

console.log('\n  CALL targets from the STAT region 0x09DD00-0x09E200:');
const sorted = [...statCallTargets.entries()].sort((a, b) => a[0] - b[0]);
for (const [target, sites] of sorted) {
  const siteStr = sites.map(s => hex(s)).join(', ');
  console.log(`    ${hex(target)} called from: ${siteStr}`);
}

// ============================================================
// PART 6: Check if parent functions match known STAT handler patterns
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 6: Known STAT-related addresses cross-reference');
console.log('='.repeat(80));

const knownStatAddrs = {
  0x09DD14: 'STAT init (calls 0x09DEE0 dispatch table reset)',
  0x09DEE0: 'dispatch table reset (zeros D3FFxx region)',
  0x09E0A1: 'CALL 0x09DD14 site #1',
  0x09E0D9: 'CALL 0x09DD14 site #2',
};

for (const [addr, desc] of Object.entries(knownStatAddrs)) {
  const a = parseInt(addr);
  console.log(`\n  ${hex(a)}: ${desc}`);
  const callers = findCallersOf(a);
  console.log(`    Callers: ${callers.length}`);
  for (const c of callers) {
    console.log(`      ${hex(c.addr)}: ${c.type}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('Phase 279 probe complete.');
console.log('='.repeat(80));
