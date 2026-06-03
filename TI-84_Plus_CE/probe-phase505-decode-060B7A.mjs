#!/usr/bin/env node
// Phase 505 -- Static disassembly of 0x060B7A and 0x0846EA
// Purpose: decode the shared helper called by BOTH functions in BCALL 826:
//   - 0x060B8D: CALL 0x060B7A, CALL 0x0846EA, LD (D0244E),HL, ...
//   - 0x060BA2: CALL 0x060B7A, CALL 0x0846EA, LD A,0x3D, DEC HL, CALL 0x06C732...
// 0x060B7A is between ~0x060B50 and 0x060B8C (short helper, likely <=20 bytes).
// 0x0846EA is called immediately after and processes whatever 0x060B7A set up.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x060B8D;
const END   = 0x060C24; // exclusive â decode through 0x060C23

// --- helpers ---
function rd8(addr) { return rom[addr]; }
function rd16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function rd24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function rdS8(addr) { const v = rom[addr]; return v >= 128 ? v - 256 : v; }

function hex2(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }
function hex6(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }
function hex4(v) { return '0x' + v.toString(16).toUpperCase().padStart(4, '0'); }

function rawBytes(addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(rom[addr + i].toString(16).toUpperCase().padStart(2, '0'));
  return parts.join(' ');
}

// --- register names ---
const R8  = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const R16 = ['BC', 'DE', 'HL', 'SP'];
const R16AF = ['BC', 'DE', 'HL', 'AF'];
const CC  = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

// --- tracking ---
const callTargets = [];
const jpTargets   = [];
const ramRefs     = [];

function trackRam(addr) { if (addr >= 0xD00000) ramRefs.push(addr); }


// --- main decoder ---
function decodeOne(pc) {
  const b0 = rd8(pc);

  // .SIS / .LIS / .SIL / .LIL prefixes
  if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
    const pfxName = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' }[b0];
    const inner = decodeAfterPrefix(pc + 1, pfxName);
    return { mnemonic: pfxName + ' ' + inner.mnemonic, length: 1 + inner.length };
  }

  // IX/IY prefix
  if (b0 === 0xDD || b0 === 0xFD) {
    return decodeIXIY(pc, b0 === 0xDD ? 'IX' : 'IY');
  }

  // CB prefix
  if (b0 === 0xCB) return decodeCB(pc);

  // ED prefix
  if (b0 === 0xED) return decodeED(pc);

  return decodeMain(pc);
}

function decodeMain(pc) {
  const b0 = rd8(pc);

  if (b0 === 0x00) return { mnemonic: 'NOP', length: 1 };
  if (b0 === 0x76) return { mnemonic: 'HALT', length: 1 };
  if (b0 === 0xF3) return { mnemonic: 'DI', length: 1 };
  if (b0 === 0xFB) return { mnemonic: 'EI', length: 1 };
  if (b0 === 0xEB) return { mnemonic: 'EX DE,HL', length: 1 };
  if (b0 === 0xD9) return { mnemonic: 'EXX', length: 1 };
  if (b0 === 0x08) return { mnemonic: "EX AF,AF'", length: 1 };
  if (b0 === 0xE3) return { mnemonic: 'EX (SP),HL', length: 1 };
  if (b0 === 0xC9) return { mnemonic: 'RET', length: 1 };
  if (b0 === 0xE9) return { mnemonic: 'JP (HL)', length: 1 };
  if (b0 === 0xF9) return { mnemonic: 'LD SP,HL', length: 1 };

  // RET cc
  if ((b0 & 0xC7) === 0xC0) {
    return { mnemonic: 'RET ' + CC[(b0 >> 3) & 7], length: 1 };
  }

  // RST 28h = BCALL (0xEF)
  if (b0 === 0xEF) {
    const idx = rd16(pc + 1);
    return { mnemonic: 'RST 28h  ; BCALL ' + idx + ' (0x' + idx.toString(16).toUpperCase() + ')', length: 3 };
  }

  // Other RST
  if ((b0 & 0xC7) === 0xC7) {
    return { mnemonic: 'RST ' + hex2(b0 & 0x38), length: 1 };
  }

  // CALL nn
  if (b0 === 0xCD) {
    const addr = rd24(pc + 1);
    callTargets.push(addr);
    return { mnemonic: 'CALL ' + hex6(addr), length: 4 };
  }

  // CALL cc,nn
  if ((b0 & 0xC7) === 0xC4) {
    const addr = rd24(pc + 1);
    callTargets.push(addr);
    return { mnemonic: 'CALL ' + CC[(b0 >> 3) & 7] + ',' + hex6(addr), length: 4 };
  }

  // JP nn
  if (b0 === 0xC3) {
    const addr = rd24(pc + 1);
    jpTargets.push(addr);
    return { mnemonic: 'JP ' + hex6(addr), length: 4 };
  }

  // JP cc,nn
  if ((b0 & 0xC7) === 0xC2) {
    const addr = rd24(pc + 1);
    jpTargets.push(addr);
    return { mnemonic: 'JP ' + CC[(b0 >> 3) & 7] + ',' + hex6(addr), length: 4 };
  }

  // JR e
  if (b0 === 0x18) {
    const off = rdS8(pc + 1);
    const target = pc + 2 + off;
    jpTargets.push(target);
    return { mnemonic: 'JR ' + hex6(target) + '  ; offset ' + (off >= 0 ? '+' : '') + off, length: 2 };
  }

  // JR cc,e
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const ccName = ['NZ', 'Z', 'NC', 'C'][(b0 >> 3) & 3];
    const off = rdS8(pc + 1);
    const target = pc + 2 + off;
    jpTargets.push(target);
    return { mnemonic: 'JR ' + ccName + ',' + hex6(target) + '  ; offset ' + (off >= 0 ? '+' : '') + off, length: 2 };
  }

  // DJNZ e
  if (b0 === 0x10) {
    const off = rdS8(pc + 1);
    const target = pc + 2 + off;
    jpTargets.push(target);
    return { mnemonic: 'DJNZ ' + hex6(target) + '  ; offset ' + (off >= 0 ? '+' : '') + off, length: 2 };
  }

  // LD r,r (40-7F except 76=HALT, handled above)
  if (b0 >= 0x40 && b0 <= 0x7F) {
    return { mnemonic: 'LD ' + R8[(b0 >> 3) & 7] + ',' + R8[b0 & 7], length: 1 };
  }

  // LD r,n
  if ((b0 & 0xC7) === 0x06) {
    return { mnemonic: 'LD ' + R8[(b0 >> 3) & 7] + ',' + hex2(rd8(pc + 1)), length: 2 };
  }

  // LD rr,nn (24-bit in ADL)
  if ((b0 & 0xCF) === 0x01) {
    return { mnemonic: 'LD ' + R16[(b0 >> 4) & 3] + ',' + hex6(rd24(pc + 1)), length: 4 };
  }

  // LD A,(nn) / LD (nn),A / LD HL,(nn) / LD (nn),HL
  if (b0 === 0x3A) { const a = rd24(pc + 1); trackRam(a); return { mnemonic: 'LD A,(' + hex6(a) + ')', length: 4 }; }
  if (b0 === 0x32) { const a = rd24(pc + 1); trackRam(a); return { mnemonic: 'LD (' + hex6(a) + '),A', length: 4 }; }
  if (b0 === 0x2A) { const a = rd24(pc + 1); trackRam(a); return { mnemonic: 'LD HL,(' + hex6(a) + ')', length: 4 }; }
  if (b0 === 0x22) { const a = rd24(pc + 1); trackRam(a); return { mnemonic: 'LD (' + hex6(a) + '),HL', length: 4 }; }

  // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
  if (b0 === 0x02) return { mnemonic: 'LD (BC),A', length: 1 };
  if (b0 === 0x12) return { mnemonic: 'LD (DE),A', length: 1 };
  if (b0 === 0x0A) return { mnemonic: 'LD A,(BC)', length: 1 };
  if (b0 === 0x1A) return { mnemonic: 'LD A,(DE)', length: 1 };

  // PUSH/POP
  if ((b0 & 0xCF) === 0xC5) return { mnemonic: 'PUSH ' + R16AF[(b0 >> 4) & 3], length: 1 };
  if ((b0 & 0xCF) === 0xC1) return { mnemonic: 'POP ' + R16AF[(b0 >> 4) & 3], length: 1 };

  // ADD HL,rr / INC rr / DEC rr
  if ((b0 & 0xCF) === 0x09) return { mnemonic: 'ADD HL,' + R16[(b0 >> 4) & 3], length: 1 };
  if ((b0 & 0xCF) === 0x03) return { mnemonic: 'INC ' + R16[(b0 >> 4) & 3], length: 1 };
  if ((b0 & 0xCF) === 0x0B) return { mnemonic: 'DEC ' + R16[(b0 >> 4) & 3], length: 1 };

  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) return { mnemonic: 'INC ' + R8[(b0 >> 3) & 7], length: 1 };
  if ((b0 & 0xC7) === 0x05) return { mnemonic: 'DEC ' + R8[(b0 >> 3) & 7], length: 1 };

  // ALU A,r (80-BF)
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    return { mnemonic: ops[(b0 >> 3) & 7] + R8[b0 & 7], length: 1 };
  }

  // ALU A,n (C6/CE/D6/DE/E6/EE/F6/FE)
  if ((b0 & 0xC7) === 0xC6) {
    const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    return { mnemonic: ops[(b0 >> 3) & 7] + hex2(rd8(pc + 1)), length: 2 };
  }

  // Rotate/shift A
  if (b0 === 0x07) return { mnemonic: 'RLCA', length: 1 };
  if (b0 === 0x0F) return { mnemonic: 'RRCA', length: 1 };
  if (b0 === 0x17) return { mnemonic: 'RLA', length: 1 };
  if (b0 === 0x1F) return { mnemonic: 'RRA', length: 1 };
  if (b0 === 0x27) return { mnemonic: 'DAA', length: 1 };
  if (b0 === 0x2F) return { mnemonic: 'CPL', length: 1 };
  if (b0 === 0x37) return { mnemonic: 'SCF', length: 1 };
  if (b0 === 0x3F) return { mnemonic: 'CCF', length: 1 };

  // OUT/IN
  if (b0 === 0xD3) return { mnemonic: 'OUT (' + hex2(rd8(pc + 1)) + '),A', length: 2 };
  if (b0 === 0xDB) return { mnemonic: 'IN A,(' + hex2(rd8(pc + 1)) + ')', length: 2 };

  return { mnemonic: 'DB ' + hex2(b0), length: 1 };
}

function decodeCB(pc) {
  const b1 = rd8(pc + 1);
  const opHi = (b1 >> 6) & 3;
  const bit = (b1 >> 3) & 7;
  const r = b1 & 7;
  const shiftNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

  if (opHi === 0) return { mnemonic: shiftNames[bit] + ' ' + R8[r], length: 2 };
  if (opHi === 1) return { mnemonic: 'BIT ' + bit + ',' + R8[r], length: 2 };
  if (opHi === 2) return { mnemonic: 'RES ' + bit + ',' + R8[r], length: 2 };
  return { mnemonic: 'SET ' + bit + ',' + R8[r], length: 2 };
}

function decodeED(pc) {
  const b1 = rd8(pc + 1);

  // Block ops
  const blockOps = {
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  if (blockOps[b1]) return { mnemonic: blockOps[b1], length: 2 };

  // Misc 2-byte ED ops
  const misc2 = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
    0x4D: 'RETI', 0x4F: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I',
    0x5E: 'IM 2', 0x5F: 'LD A,R', 0x67: 'RRD', 0x6F: 'RLD',
    0x76: 'SLP', 0x7D: 'STMIX', 0x7E: 'RSMIX',
  };
  if (misc2[b1]) return { mnemonic: misc2[b1], length: 2 };

  // IN r,(C)
  if ((b1 & 0xC7) === 0x40) return { mnemonic: 'IN ' + R8[(b1 >> 3) & 7] + ',(C)', length: 2 };
  // OUT (C),r
  if ((b1 & 0xC7) === 0x41) return { mnemonic: 'OUT (C),' + R8[(b1 >> 3) & 7], length: 2 };

  // SBC HL,rr
  if ((b1 & 0xCF) === 0x42) return { mnemonic: 'SBC HL,' + R16[(b1 >> 4) & 3], length: 2 };
  // ADC HL,rr
  if ((b1 & 0xCF) === 0x4A) return { mnemonic: 'ADC HL,' + R16[(b1 >> 4) & 3], length: 2 };

  // LD (nn),rr  /  LD rr,(nn) â 5 bytes in ADL
  if ((b1 & 0xCF) === 0x43) { const a = rd24(pc + 2); trackRam(a); return { mnemonic: 'LD (' + hex6(a) + '),' + R16[(b1 >> 4) & 3], length: 5 }; }
  if ((b1 & 0xCF) === 0x4B) { const a = rd24(pc + 2); trackRam(a); return { mnemonic: 'LD ' + R16[(b1 >> 4) & 3] + ',(' + hex6(a) + ')', length: 5 }; }

  // MLT rr (eZ80)
  if ((b1 & 0xCF) === 0x4C) return { mnemonic: 'MLT ' + R16[(b1 >> 4) & 3], length: 2 };

  // TST A,r (eZ80)
  if ((b1 & 0xC7) === 0x04) return { mnemonic: 'TST A,' + R8[(b1 >> 3) & 7], length: 2 };
  // TST A,n (eZ80) = ED 64
  if (b1 === 0x64) return { mnemonic: 'TST A,' + hex2(rd8(pc + 2)), length: 3 };

  // LEA variants (eZ80)
  const leaOps = {
    0x02: 'BC,IX', 0x03: 'BC,IY', 0x12: 'DE,IX', 0x13: 'DE,IY',
    0x22: 'HL,IX', 0x23: 'HL,IY', 0x32: 'IX,IX', 0x33: 'IY,IY',
    0x54: 'IX,IY', 0x55: 'IY,IX',
  };
  if (leaOps[b1]) {
    const d = rdS8(pc + 2);
    return { mnemonic: 'LEA ' + leaOps[b1] + (d >= 0 ? '+' : '') + d, length: 3 };
  }

  // PEA (eZ80)
  if (b1 === 0x65) { const d = rdS8(pc + 2); return { mnemonic: 'PEA IX' + (d >= 0 ? '+' : '') + d, length: 3 }; }
  if (b1 === 0x66) { const d = rdS8(pc + 2); return { mnemonic: 'PEA IY' + (d >= 0 ? '+' : '') + d, length: 3 }; }

  // TSTIO n (eZ80)
  if (b1 === 0x74) return { mnemonic: 'TSTIO ' + hex2(rd8(pc + 2)), length: 3 };

  return { mnemonic: 'DB 0xED, ' + hex2(b1), length: 2 };
}

function decodeIXIY(pc, ireg) {
  const b0 = rd8(pc);
  const b1 = rd8(pc + 1);

  // IX/IY CB prefix
  if (b1 === 0xCB) {
    const d = rdS8(pc + 2);
    const op = rd8(pc + 3);
    const opHi = (op >> 6) & 3;
    const bit = (op >> 3) & 7;
    const shiftNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const mem = '(' + ireg + (d >= 0 ? '+' : '') + d + ')';
    if (opHi === 0) return { mnemonic: shiftNames[bit] + ' ' + mem, length: 4 };
    if (opHi === 1) return { mnemonic: 'BIT ' + bit + ',' + mem, length: 4 };
    if (opHi === 2) return { mnemonic: 'RES ' + bit + ',' + mem, length: 4 };
    return { mnemonic: 'SET ' + bit + ',' + mem, length: 4 };
  }

  // LD IX/IY,nn
  if (b1 === 0x21) return { mnemonic: 'LD ' + ireg + ',' + hex6(rd24(pc + 2)), length: 5 };
  // LD (nn),IX/IY
  if (b1 === 0x22) return { mnemonic: 'LD (' + hex6(rd24(pc + 2)) + '),' + ireg, length: 5 };
  // LD IX/IY,(nn)
  if (b1 === 0x2A) return { mnemonic: 'LD ' + ireg + ',(' + hex6(rd24(pc + 2)) + ')', length: 5 };

  if (b1 === 0xF9) return { mnemonic: 'LD SP,' + ireg, length: 2 };
  if (b1 === 0xE5) return { mnemonic: 'PUSH ' + ireg, length: 2 };
  if (b1 === 0xE1) return { mnemonic: 'POP ' + ireg, length: 2 };
  if (b1 === 0xE3) return { mnemonic: 'EX (SP),' + ireg, length: 2 };
  if (b1 === 0xE9) return { mnemonic: 'JP (' + ireg + ')', length: 2 };
  if (b1 === 0x23) return { mnemonic: 'INC ' + ireg, length: 2 };
  if (b1 === 0x2B) return { mnemonic: 'DEC ' + ireg, length: 2 };

  // ADD IX/IY,rr
  if ((b1 & 0xCF) === 0x09) {
    const rr = (b1 >> 4) & 3;
    return { mnemonic: 'ADD ' + ireg + ',' + (rr === 2 ? ireg : R16[rr]), length: 2 };
  }

  // LD r,(IX/IY+d)
  if ((b1 & 0xC7) === 0x46 && b1 !== 0x76) {
    const d = rdS8(pc + 2);
    return { mnemonic: 'LD ' + R8[(b1 >> 3) & 7] + ',(' + ireg + (d >= 0 ? '+' : '') + d + ')', length: 3 };
  }

  // LD (IX/IY+d),r
  if (b1 >= 0x70 && b1 <= 0x77 && b1 !== 0x76) {
    const d = rdS8(pc + 2);
    return { mnemonic: 'LD (' + ireg + (d >= 0 ? '+' : '') + d + '),' + R8[b1 & 7], length: 3 };
  }

  // LD (IX/IY+d),n
  if (b1 === 0x36) {
    const d = rdS8(pc + 2);
    return { mnemonic: 'LD (' + ireg + (d >= 0 ? '+' : '') + d + '),' + hex2(rd8(pc + 3)), length: 4 };
  }

  // INC/DEC (IX/IY+d)
  if (b1 === 0x34) { const d = rdS8(pc + 2); return { mnemonic: 'INC (' + ireg + (d >= 0 ? '+' : '') + d + ')', length: 3 }; }
  if (b1 === 0x35) { const d = rdS8(pc + 2); return { mnemonic: 'DEC (' + ireg + (d >= 0 ? '+' : '') + d + ')', length: 3 }; }

  // ALU A,(IX/IY+d)
  if ((b1 & 0xC7) === 0x86) {
    const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const d = rdS8(pc + 2);
    return { mnemonic: ops[(b1 >> 3) & 7] + '(' + ireg + (d >= 0 ? '+' : '') + d + ')', length: 3 };
  }

  // IXH/IXL undocumented
  const ixh = ireg + 'H', ixl = ireg + 'L';
  if (b1 === 0x26) return { mnemonic: 'LD ' + ixh + ',' + hex2(rd8(pc + 2)), length: 3 };
  if (b1 === 0x2E) return { mnemonic: 'LD ' + ixl + ',' + hex2(rd8(pc + 2)), length: 3 };
  if (b1 === 0x24) return { mnemonic: 'INC ' + ixh, length: 2 };
  if (b1 === 0x25) return { mnemonic: 'DEC ' + ixh, length: 2 };
  if (b1 === 0x2C) return { mnemonic: 'INC ' + ixl, length: 2 };
  if (b1 === 0x2D) return { mnemonic: 'DEC ' + ixl, length: 2 };

  return { mnemonic: 'DB ' + hex2(b0) + ', ' + hex2(b1), length: 2 };
}

function decodeAfterPrefix(pc, pfxName) {
  const is16bit = pfxName === '.SIS' || pfxName === '.SIL';
  const b0 = rd8(pc);

  // CALL nn
  if (b0 === 0xCD) {
    if (is16bit) {
      const addr = rd16(pc + 1); callTargets.push(addr);
      return { mnemonic: 'CALL ' + hex4(addr), length: 3 };
    }
    const addr = rd24(pc + 1); callTargets.push(addr);
    return { mnemonic: 'CALL ' + hex6(addr), length: 4 };
  }

  // CALL cc,nn
  if ((b0 & 0xC7) === 0xC4) {
    if (is16bit) {
      const addr = rd16(pc + 1); callTargets.push(addr);
      return { mnemonic: 'CALL ' + CC[(b0 >> 3) & 7] + ',' + hex4(addr), length: 3 };
    }
    const addr = rd24(pc + 1); callTargets.push(addr);
    return { mnemonic: 'CALL ' + CC[(b0 >> 3) & 7] + ',' + hex6(addr), length: 4 };
  }

  // JP nn
  if (b0 === 0xC3) {
    if (is16bit) {
      const addr = rd16(pc + 1); jpTargets.push(addr);
      return { mnemonic: 'JP ' + hex4(addr), length: 3 };
    }
    const addr = rd24(pc + 1); jpTargets.push(addr);
    return { mnemonic: 'JP ' + hex6(addr), length: 4 };
  }

  // JP cc,nn
  if ((b0 & 0xC7) === 0xC2) {
    if (is16bit) {
      const addr = rd16(pc + 1); jpTargets.push(addr);
      return { mnemonic: 'JP ' + CC[(b0 >> 3) & 7] + ',' + hex4(addr), length: 3 };
    }
    const addr = rd24(pc + 1); jpTargets.push(addr);
    return { mnemonic: 'JP ' + CC[(b0 >> 3) & 7] + ',' + hex6(addr), length: 4 };
  }

  // LD rr,nn
  if ((b0 & 0xCF) === 0x01) {
    if (is16bit) return { mnemonic: 'LD ' + R16[(b0 >> 4) & 3] + ',' + hex4(rd16(pc + 1)), length: 3 };
    return { mnemonic: 'LD ' + R16[(b0 >> 4) & 3] + ',' + hex6(rd24(pc + 1)), length: 4 };
  }

  // RET / RET cc
  if (b0 === 0xC9) return { mnemonic: 'RET', length: 1 };
  if ((b0 & 0xC7) === 0xC0) return { mnemonic: 'RET ' + CC[(b0 >> 3) & 7], length: 1 };

  return decodeMain(pc);
}

// ================================================================
// Main
// ================================================================
console.log('========================================================================');
console.log('Phase 505 -- Static disassembly: 0x060B7A and 0x0846EA');
console.log('========================================================================');
console.log('');

// --- Context: bytes leading up to 0x060B7A ---
console.log('--- Context: 0x060B50..0x060B79 (bytes leading up to 0x060B7A) ---');
{
  let pc = 0x060B50;
  while (pc < 0x060B7A) {
    const { mnemonic, length } = decodeOne(pc);
    console.log(hex6(pc) + ":  " + rawBytes(pc, length).padEnd(20, ' ') + " " + mnemonic);
    pc += length;
  }
}

console.log('');
console.log('--- 0x060B7A: shared helper (CALL before 0x0846EA in BCALL 826) ---');
console.log('    Range: 0x060B7A..0x060B8C (stop at RET or end of range)');
console.log('');
{
  let pc = 0x060B7A;
  while (pc <= 0x060B8C) {
    const { mnemonic, length } = decodeOne(pc);
    console.log(hex6(pc) + ":  " + rawBytes(pc, length).padEnd(20, ' ') + " " + mnemonic);
    pc += length;
    if (mnemonic === 'RET') break;
  }
}

// --- 0x0846EA: up to 160 bytes ---
console.log('');
console.log('--- 0x0846EA: callee (processes what 0x060B7A set up) ---');
console.log('    Range: 0x0846EA, up to 160 bytes (stop at RET or unconditional JP)');
console.log('');
{
  let pc = 0x0846EA;
  const limit = 0x0846EA + 160;
  let done = false;
  while (pc < limit && !done) {
    const { mnemonic, length } = decodeOne(pc);
    console.log(hex6(pc) + ":  " + rawBytes(pc, length).padEnd(20, ' ') + " " + mnemonic);
    pc += length;
    if (mnemonic === 'RET' || mnemonic === 'JP (HL)' || mnemonic === 'JP (IX)' || mnemonic === 'JP (IY)') done = true;
    // stop on unconditional JP nn (no comma before address)
    if (mnemonic.startsWith('JP 0x')) done = true;
  }
}

// ================================================================
// Summary
// ================================================================
console.log('');
console.log('========================================================================');
console.log('SUMMARY -- CALL targets:');
const uniqueCalls = [...new Set(callTargets)].sort((a, b) => a - b);
for (const t of uniqueCalls) {
  let note = '';
  if (t >= 0x060000 && t < 0x062000) note = ' <<<< 0x060xxx-0x061xxx range';
  if (t >= 0x080000 && t < 0x090000) note = ' <<<< 0x08xxxx range';
  console.log('  CALL ' + hex6(t) + note);
}
console.log('');
console.log('SUMMARY -- JP/JR targets:');
const uniqueJps = [...new Set(jpTargets)].sort((a, b) => a - b);
for (const t of uniqueJps) {
  let note = '';
  if (t >= 0x060000 && t < 0x062000) note = ' <<<< 0x060xxx-0x061xxx range';
  if (t >= 0x080000 && t < 0x090000) note = ' <<<< 0x08xxxx range';
  console.log('  JP   ' + hex6(t) + note);
}
console.log('');
console.log('SUMMARY -- RAM references (0xD0xxxx and above):');
const uniqueRam = [...new Set(ramRefs)].sort((a, b) => a - b);
for (const a of uniqueRam) {
  console.log('  RAM  ' + hex6(a));
}
console.log('');
console.log('========================================================================');
console.log('Phase 505 decode complete.');
process.exit(0);
