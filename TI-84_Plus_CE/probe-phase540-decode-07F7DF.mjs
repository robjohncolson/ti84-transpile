#!/usr/bin/env node
// Phase 540: Decode 0x07F7DF — function following the ckOP1type cluster
// (0x07F7BD-0x07F7DE). Starts with LD HL,D005F8.
//
// Manual eZ80 ADL-mode disassembly from raw ROM bytes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const START = 0x07F7DF;
const LENGTH = 128; // read enough to find RET/JP

const hex = (v, w = 6) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');
const hexB = (v) => v.toString(16).toUpperCase().padStart(2, '0');

// Read helpers
function u8(addr) { return rom[addr]; }
function u16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function u24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function s8(addr) { const v = rom[addr]; return v >= 128 ? v - 256 : v; }

// Dump raw bytes first
console.log('=== Raw bytes from ' + hex(START) + ' (' + LENGTH + ' bytes) ===');
for (let i = 0; i < LENGTH; i += 16) {
  const addr = START + i;
  const bytes = [];
  for (let j = 0; j < 16 && i + j < LENGTH; j++) {
    bytes.push(hexB(u8(addr + j)));
  }
  console.log(hex(addr) + '  ' + bytes.join(' '));
}

console.log('\n=== Manual disassembly (eZ80 ADL mode) ===\n');

// Simple eZ80 ADL-mode disassembler for common instructions
function disasm(pc) {
  const b0 = u8(pc);
  let len = 1;
  let mnem = '???';

  // Helpers for register names
  const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  if (b0 === 0x00) { mnem = 'NOP'; }
  else if (b0 === 0x76) { mnem = 'HALT'; }
  else if (b0 === 0xC9) { mnem = 'RET'; }
  else if (b0 === 0xF3) { mnem = 'DI'; }
  else if (b0 === 0xFB) { mnem = 'EI'; }
  else if (b0 === 0xD9) { mnem = 'EXX'; }
  else if (b0 === 0x08) { mnem = 'EX AF,AF\''; }
  else if (b0 === 0xEB) { mnem = 'EX DE,HL'; }
  else if (b0 === 0xE3) { mnem = 'EX (SP),HL'; }
  else if (b0 === 0xE9) { mnem = 'JP (HL)'; }
  else if (b0 === 0xF9) { mnem = 'LD SP,HL'; }
  else if (b0 === 0x37) { mnem = 'SCF'; }
  else if (b0 === 0x3F) { mnem = 'CCF'; }
  else if (b0 === 0x2F) { mnem = 'CPL'; }
  else if (b0 === 0x27) { mnem = 'DAA'; }

  // LD r,r' and ALU A,r
  else if ((b0 & 0xC0) === 0x40 && b0 !== 0x76) {
    const dst = (b0 >> 3) & 7;
    const src = b0 & 7;
    mnem = 'LD ' + r8[dst] + ',' + r8[src];
  }
  else if ((b0 & 0xC0) === 0x80) {
    const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const op = (b0 >> 3) & 7;
    const src = b0 & 7;
    mnem = ops[op] + r8[src];
  }

  // INC/DEC r8
  else if ((b0 & 0xC7) === 0x04) { mnem = 'INC ' + r8[(b0 >> 3) & 7]; }
  else if ((b0 & 0xC7) === 0x05) { mnem = 'DEC ' + r8[(b0 >> 3) & 7]; }

  // INC/DEC rp
  else if ((b0 & 0xCF) === 0x03) { mnem = 'INC ' + rp[(b0 >> 4) & 3]; }
  else if ((b0 & 0xCF) === 0x0B) { mnem = 'DEC ' + rp[(b0 >> 4) & 3]; }

  // PUSH/POP
  else if ((b0 & 0xCF) === 0xC5) { const rpAF = ['BC', 'DE', 'HL', 'AF']; mnem = 'PUSH ' + rpAF[(b0 >> 4) & 3]; }
  else if ((b0 & 0xCF) === 0xC1) { const rpAF = ['BC', 'DE', 'HL', 'AF']; mnem = 'POP ' + rpAF[(b0 >> 4) & 3]; }

  // ADD HL,rp
  else if ((b0 & 0xCF) === 0x09) { mnem = 'ADD HL,' + rp[(b0 >> 4) & 3]; }

  // LD r,imm8
  else if ((b0 & 0xC7) === 0x06) {
    const dst = (b0 >> 3) & 7;
    mnem = 'LD ' + r8[dst] + ',' + hex(u8(pc + 1), 2);
    len = 2;
  }

  // LD rp,imm24 (ADL)
  else if ((b0 & 0xCF) === 0x01) {
    const rpi = (b0 >> 4) & 3;
    const imm = u24(pc + 1);
    mnem = 'LD ' + rp[rpi] + ',' + hex(imm);
    len = 4;
  }

  // LD (imm24),A
  else if (b0 === 0x32) { mnem = 'LD (' + hex(u24(pc + 1)) + '),A'; len = 4; }
  // LD A,(imm24)
  else if (b0 === 0x3A) { mnem = 'LD A,(' + hex(u24(pc + 1)) + ')'; len = 4; }
  // LD (imm24),HL
  else if (b0 === 0x22) { mnem = 'LD (' + hex(u24(pc + 1)) + '),HL'; len = 4; }
  // LD HL,(imm24)
  else if (b0 === 0x2A) { mnem = 'LD HL,(' + hex(u24(pc + 1)) + ')'; len = 4; }

  // JP imm24
  else if (b0 === 0xC3) { mnem = 'JP ' + hex(u24(pc + 1)); len = 4; }
  // JP cc,imm24
  else if ((b0 & 0xC7) === 0xC2) { mnem = 'JP ' + cc[(b0 >> 3) & 7] + ',' + hex(u24(pc + 1)); len = 4; }

  // JR e
  else if (b0 === 0x18) { const off = s8(pc + 1); mnem = 'JR ' + hex(pc + 2 + off) + ' (offset ' + off + ')'; len = 2; }
  // JR cc,e
  else if ((b0 & 0xE7) === 0x20) {
    const cci = (b0 >> 3) & 3;
    const ccn = ['NZ', 'Z', 'NC', 'C'][cci];
    const off = s8(pc + 1);
    mnem = 'JR ' + ccn + ',' + hex(pc + 2 + off) + ' (offset ' + off + ')';
    len = 2;
  }
  // DJNZ
  else if (b0 === 0x10) { const off = s8(pc + 1); mnem = 'DJNZ ' + hex(pc + 2 + off); len = 2; }

  // CALL imm24
  else if (b0 === 0xCD) { mnem = 'CALL ' + hex(u24(pc + 1)); len = 4; }
  // CALL cc,imm24
  else if ((b0 & 0xC7) === 0xC4) { mnem = 'CALL ' + cc[(b0 >> 3) & 7] + ',' + hex(u24(pc + 1)); len = 4; }

  // RET cc
  else if ((b0 & 0xC7) === 0xC0) { mnem = 'RET ' + cc[(b0 >> 3) & 7]; }

  // RST
  else if ((b0 & 0xC7) === 0xC7) { mnem = 'RST ' + hex((b0 >> 3) & 7, 2) + 'h'; }

  // ALU A,imm8
  else if (b0 === 0xC6) { mnem = 'ADD A,' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xCE) { mnem = 'ADC A,' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xD6) { mnem = 'SUB ' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xDE) { mnem = 'SBC A,' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xE6) { mnem = 'AND ' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xEE) { mnem = 'XOR ' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xF6) { mnem = 'OR ' + hex(u8(pc + 1), 2); len = 2; }
  else if (b0 === 0xFE) { mnem = 'CP ' + hex(u8(pc + 1), 2); len = 2; }

  // RLCA, RRCA, RLA, RRA
  else if (b0 === 0x07) { mnem = 'RLCA'; }
  else if (b0 === 0x0F) { mnem = 'RRCA'; }
  else if (b0 === 0x17) { mnem = 'RLA'; }
  else if (b0 === 0x1F) { mnem = 'RRA'; }

  // LD A,(rp) / LD (rp),A
  else if (b0 === 0x0A) { mnem = 'LD A,(BC)'; }
  else if (b0 === 0x1A) { mnem = 'LD A,(DE)'; }
  else if (b0 === 0x02) { mnem = 'LD (BC),A'; }
  else if (b0 === 0x12) { mnem = 'LD (DE),A'; }

  // OUT (n),A / IN A,(n)
  else if (b0 === 0xD3) { mnem = 'OUT (' + hex(u8(pc + 1), 2) + '),A'; len = 2; }
  else if (b0 === 0xDB) { mnem = 'IN A,(' + hex(u8(pc + 1), 2) + ')'; len = 2; }

  // CB prefix (bit/shift ops)
  else if (b0 === 0xCB) {
    const b1 = u8(pc + 1);
    len = 2;
    const r = r8[b1 & 7];
    if ((b1 & 0xC0) === 0x00) {
      const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      mnem = shifts[(b1 >> 3) & 7] + ' ' + r;
    } else if ((b1 & 0xC0) === 0x40) {
      mnem = 'BIT ' + ((b1 >> 3) & 7) + ',' + r;
    } else if ((b1 & 0xC0) === 0x80) {
      mnem = 'RES ' + ((b1 >> 3) & 7) + ',' + r;
    } else {
      mnem = 'SET ' + ((b1 >> 3) & 7) + ',' + r;
    }
  }

  // ED prefix
  else if (b0 === 0xED) {
    const b1 = u8(pc + 1);
    len = 2;
    if (b1 === 0xB0) { mnem = 'LDIR'; }
    else if (b1 === 0xB8) { mnem = 'LDDR'; }
    else if (b1 === 0xB1) { mnem = 'CPIR'; }
    else if (b1 === 0xB9) { mnem = 'CPDR'; }
    else if (b1 === 0xA0) { mnem = 'LDI'; }
    else if (b1 === 0xA8) { mnem = 'LDD'; }
    else if (b1 === 0xA1) { mnem = 'CPI'; }
    else if (b1 === 0xA9) { mnem = 'CPD'; }
    else if (b1 === 0x44) { mnem = 'NEG'; }
    else if (b1 === 0x4D) { mnem = 'RETI'; }
    else if (b1 === 0x45) { mnem = 'RETN'; }
    else if (b1 === 0x46) { mnem = 'IM 0'; }
    else if (b1 === 0x56) { mnem = 'IM 1'; }
    else if (b1 === 0x5E) { mnem = 'IM 2'; }
    else if (b1 === 0x47) { mnem = 'LD I,A'; }
    else if (b1 === 0x57) { mnem = 'LD A,I'; }
    else if (b1 === 0x4F) { mnem = 'LD R,A'; }
    else if (b1 === 0x5F) { mnem = 'LD A,R'; }
    else if (b1 === 0x67) { mnem = 'RRD'; }
    else if (b1 === 0x6F) { mnem = 'RLD'; }
    // SBC HL,rp
    else if ((b1 & 0xCF) === 0x42) { mnem = 'SBC HL,' + rp[(b1 >> 4) & 3]; }
    // ADC HL,rp
    else if ((b1 & 0xCF) === 0x4A) { mnem = 'ADC HL,' + rp[(b1 >> 4) & 3]; }
    // LD (imm24),rp (ED 43/53/63/73)
    else if ((b1 & 0xCF) === 0x43) { mnem = 'LD (' + hex(u24(pc + 2)) + '),' + rp[(b1 >> 4) & 3]; len = 5; }
    // LD rp,(imm24) (ED 4B/5B/6B/7B)
    else if ((b1 & 0xCF) === 0x4B) { mnem = 'LD ' + rp[(b1 >> 4) & 3] + ',(' + hex(u24(pc + 2)) + ')'; len = 5; }
    // IN r,(C)
    else if ((b1 & 0xC7) === 0x40 && ((b1 >> 3) & 7) !== 6) { mnem = 'IN ' + r8[(b1 >> 3) & 7] + ',(C)'; }
    // OUT (C),r
    else if ((b1 & 0xC7) === 0x41 && ((b1 >> 3) & 7) !== 6) { mnem = 'OUT (C),' + r8[(b1 >> 3) & 7]; }
    // TST A,imm8 (eZ80: ED 64 nn)
    else if (b1 === 0x64) { mnem = 'TST A,' + hex(u8(pc + 2), 2); len = 3; }
    // LEA IX,IX+d (ED 32)
    else if (b1 === 0x32) { mnem = 'LEA IX,IX+' + s8(pc + 2); len = 3; }
    // LEA IY,IY+d (ED 33)
    else if (b1 === 0x33) { mnem = 'LEA IY,IY+' + s8(pc + 2); len = 3; }
    // LEA rr,IX+d (ED 02/12/22)
    else if ((b1 & 0xCF) === 0x02 && b1 !== 0x32) { mnem = 'LEA ' + rp[(b1 >> 4) & 3] + ',IX+' + s8(pc + 2); len = 3; }
    // LEA rr,IY+d (ED 03/13/23)
    else if ((b1 & 0xCF) === 0x03 && b1 !== 0x33) { mnem = 'LEA ' + rp[(b1 >> 4) & 3] + ',IY+' + s8(pc + 2); len = 3; }
    else { mnem = 'ED ' + hexB(b1) + ' (unknown)'; }
  }

  // DD prefix (IX)
  else if (b0 === 0xDD) {
    const b1 = u8(pc + 1);
    len = 2;
    if (b1 === 0x21) { mnem = 'LD IX,' + hex(u24(pc + 2)); len = 5; }
    else if (b1 === 0x22) { mnem = 'LD (' + hex(u24(pc + 2)) + '),IX'; len = 5; }
    else if (b1 === 0x2A) { mnem = 'LD IX,(' + hex(u24(pc + 2)) + ')'; len = 5; }
    else if (b1 === 0xE5) { mnem = 'PUSH IX'; }
    else if (b1 === 0xE1) { mnem = 'POP IX'; }
    else if (b1 === 0xE9) { mnem = 'JP (IX)'; }
    else if (b1 === 0xF9) { mnem = 'LD SP,IX'; }
    else if (b1 === 0x23) { mnem = 'INC IX'; }
    else if (b1 === 0x2B) { mnem = 'DEC IX'; }
    else if (b1 === 0x09) { mnem = 'ADD IX,BC'; }
    else if (b1 === 0x19) { mnem = 'ADD IX,DE'; }
    else if (b1 === 0x29) { mnem = 'ADD IX,IX'; }
    else if (b1 === 0x39) { mnem = 'ADD IX,SP'; }
    else if (b1 === 0x7E) { mnem = 'LD A,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x46) { mnem = 'LD B,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x4E) { mnem = 'LD C,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x56) { mnem = 'LD D,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x5E) { mnem = 'LD E,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x66) { mnem = 'LD H,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x6E) { mnem = 'LD L,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x77) { mnem = 'LD (IX+' + s8(pc + 2) + '),A'; len = 3; }
    else if (b1 === 0x70) { mnem = 'LD (IX+' + s8(pc + 2) + '),B'; len = 3; }
    else if (b1 === 0x71) { mnem = 'LD (IX+' + s8(pc + 2) + '),C'; len = 3; }
    else if (b1 === 0x72) { mnem = 'LD (IX+' + s8(pc + 2) + '),D'; len = 3; }
    else if (b1 === 0x73) { mnem = 'LD (IX+' + s8(pc + 2) + '),E'; len = 3; }
    else if (b1 === 0x74) { mnem = 'LD (IX+' + s8(pc + 2) + '),H'; len = 3; }
    else if (b1 === 0x75) { mnem = 'LD (IX+' + s8(pc + 2) + '),L'; len = 3; }
    else if (b1 === 0x36) { mnem = 'LD (IX+' + s8(pc + 2) + '),' + hex(u8(pc + 3), 2); len = 4; }
    else if (b1 === 0x34) { mnem = 'INC (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x35) { mnem = 'DEC (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xBE) { mnem = 'CP (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xB6) { mnem = 'OR (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xA6) { mnem = 'AND (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xAE) { mnem = 'XOR (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x86) { mnem = 'ADD A,(IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x96) { mnem = 'SUB (IX+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xCB) {
      const d = s8(pc + 2);
      const b3 = u8(pc + 3);
      len = 4;
      if ((b3 & 0xC0) === 0x40) { mnem = 'BIT ' + ((b3 >> 3) & 7) + ',(IX+' + d + ')'; }
      else if ((b3 & 0xC0) === 0x80) { mnem = 'RES ' + ((b3 >> 3) & 7) + ',(IX+' + d + ')'; }
      else if ((b3 & 0xC0) === 0xC0) { mnem = 'SET ' + ((b3 >> 3) & 7) + ',(IX+' + d + ')'; }
      else { mnem = 'DD CB ' + hexB(pc + 2) + ' ' + hexB(b3); }
    }
    else { mnem = 'DD ' + hexB(b1) + ' (unknown)'; }
  }

  // FD prefix (IY)
  else if (b0 === 0xFD) {
    const b1 = u8(pc + 1);
    len = 2;
    if (b1 === 0x21) { mnem = 'LD IY,' + hex(u24(pc + 2)); len = 5; }
    else if (b1 === 0x22) { mnem = 'LD (' + hex(u24(pc + 2)) + '),IY'; len = 5; }
    else if (b1 === 0x2A) { mnem = 'LD IY,(' + hex(u24(pc + 2)) + ')'; len = 5; }
    else if (b1 === 0xE5) { mnem = 'PUSH IY'; }
    else if (b1 === 0xE1) { mnem = 'POP IY'; }
    else if (b1 === 0xE9) { mnem = 'JP (IY)'; }
    else if (b1 === 0xF9) { mnem = 'LD SP,IY'; }
    else if (b1 === 0x23) { mnem = 'INC IY'; }
    else if (b1 === 0x2B) { mnem = 'DEC IY'; }
    else if (b1 === 0x09) { mnem = 'ADD IY,BC'; }
    else if (b1 === 0x19) { mnem = 'ADD IY,DE'; }
    else if (b1 === 0x29) { mnem = 'ADD IY,IY'; }
    else if (b1 === 0x39) { mnem = 'ADD IY,SP'; }
    else if (b1 === 0x7E) { mnem = 'LD A,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x46) { mnem = 'LD B,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x4E) { mnem = 'LD C,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x56) { mnem = 'LD D,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x5E) { mnem = 'LD E,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x66) { mnem = 'LD H,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x6E) { mnem = 'LD L,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x77) { mnem = 'LD (IY+' + s8(pc + 2) + '),A'; len = 3; }
    else if (b1 === 0x70) { mnem = 'LD (IY+' + s8(pc + 2) + '),B'; len = 3; }
    else if (b1 === 0x71) { mnem = 'LD (IY+' + s8(pc + 2) + '),C'; len = 3; }
    else if (b1 === 0x72) { mnem = 'LD (IY+' + s8(pc + 2) + '),D'; len = 3; }
    else if (b1 === 0x73) { mnem = 'LD (IY+' + s8(pc + 2) + '),E'; len = 3; }
    else if (b1 === 0x74) { mnem = 'LD (IY+' + s8(pc + 2) + '),H'; len = 3; }
    else if (b1 === 0x75) { mnem = 'LD (IY+' + s8(pc + 2) + '),L'; len = 3; }
    else if (b1 === 0x36) { mnem = 'LD (IY+' + s8(pc + 2) + '),' + hex(u8(pc + 3), 2); len = 4; }
    else if (b1 === 0x34) { mnem = 'INC (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x35) { mnem = 'DEC (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xBE) { mnem = 'CP (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xB6) { mnem = 'OR (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xA6) { mnem = 'AND (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xAE) { mnem = 'XOR (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x86) { mnem = 'ADD A,(IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0x96) { mnem = 'SUB (IY+' + s8(pc + 2) + ')'; len = 3; }
    else if (b1 === 0xCB) {
      const d = s8(pc + 2);
      const b3 = u8(pc + 3);
      len = 4;
      if ((b3 & 0xC0) === 0x40) { mnem = 'BIT ' + ((b3 >> 3) & 7) + ',(IY+' + d + ')'; }
      else if ((b3 & 0xC0) === 0x80) { mnem = 'RES ' + ((b3 >> 3) & 7) + ',(IY+' + d + ')'; }
      else if ((b3 & 0xC0) === 0xC0) { mnem = 'SET ' + ((b3 >> 3) & 7) + ',(IY+' + d + ')'; }
      else { mnem = 'FD CB ' + hexB(pc + 2) + ' ' + hexB(b3); }
    }
    else { mnem = 'FD ' + hexB(b1) + ' (unknown)'; }
  }

  else { mnem = 'DB ' + hexB(b0); }

  // Build hex bytes string
  const rawBytes = [];
  for (let i = 0; i < len; i++) rawBytes.push(hexB(u8(pc + i)));

  return { pc, len, mnem, rawBytes: rawBytes.join(' '), isRet: (b0 === 0xC9 || (b0 === 0xED && u8(pc+1) === 0x4D) || (b0 === 0xED && u8(pc+1) === 0x45)), isJP: (b0 === 0xC3) };
}

// Disassemble from START until we hit RET or JP (unconditional) or exhaust bytes
let pc = START;
const end = START + LENGTH;
const instructions = [];
let funcEnd = null;

while (pc < end) {
  const inst = disasm(pc);
  instructions.push(inst);
  console.log(hex(inst.pc) + '  ' + inst.rawBytes.padEnd(18) + inst.mnem);

  if (inst.isRet || inst.isJP) {
    if (!funcEnd) funcEnd = pc + inst.len;
    // Continue decoding a bit past the first terminator to see what follows
    if (pc + inst.len >= funcEnd + 32) break;
  }

  pc += inst.len;
}

// Cross-reference scan: who calls/jumps to 0x07F7DF?
console.log('\n=== Cross-reference scan: who calls/jumps to ' + hex(START) + '? ===');
const target_le = [START & 0xFF, (START >> 8) & 0xFF, (START >> 16) & 0xFF];

// Scan full ROM for CALL/JP references
let wideXrefs = 0;
const xrefList = [];
for (let addr = 0; addr < rom.length - 3; addr++) {
  if (rom[addr] === target_le[0] &&
      rom[addr + 1] === target_le[1] &&
      rom[addr + 2] === target_le[2]) {
    const prev = addr > 0 ? rom[addr - 1] : 0;
    let type = null;
    if (prev === 0xCD) type = 'CALL';
    else if (prev === 0xC3) type = 'JP';
    else if ((prev & 0xC7) === 0xC4) type = 'CALL cc';
    else if ((prev & 0xC7) === 0xC2) type = 'JP cc';
    if (type) {
      xrefList.push(hex(addr - 1) + ': ' + type + ' ' + hex(START));
      wideXrefs++;
    }
  }
}
for (const x of xrefList) console.log('  ' + x);
console.log('Total code xrefs: ' + wideXrefs);

// Also scan for xrefs to any sub-entry points found
const subEntries = new Set();
for (const inst of instructions) {
  if (inst.mnem.startsWith('CALL ') || inst.mnem.startsWith('JP ')) {
    const m = inst.mnem.match(/0x([0-9A-F]+)/);
    if (m) subEntries.add(parseInt(m[1], 16));
  }
}

// Context: decode preceding functions for reference
console.log('\n=== Context: preceding functions ===');
console.log('\n--- 0x07F7BD (ckOP1type: get type stripped of sign) ---');
pc = 0x07F7BD;
while (pc < 0x07F7C4) {
  const inst = disasm(pc);
  console.log(hex(inst.pc) + '  ' + inst.rawBytes.padEnd(18) + inst.mnem);
  pc += inst.len;
}

console.log('\n--- 0x07F7C4 (type-validated dispatch) ---');
pc = 0x07F7C4;
while (pc < 0x07F7CE) {
  const inst = disasm(pc);
  console.log(hex(inst.pc) + '  ' + inst.rawBytes.padEnd(18) + inst.mnem);
  pc += inst.len;
}

console.log('\n--- 0x07F7CE (OP copy + type transform) ---');
pc = 0x07F7CE;
while (pc < 0x07F7D6) {
  const inst = disasm(pc);
  console.log(hex(inst.pc) + '  ' + inst.rawBytes.padEnd(18) + inst.mnem);
  pc += inst.len;
}

console.log('\n--- 0x07F7D6 (sign-strip AND 0xC0) ---');
pc = 0x07F7D6;
while (pc < 0x07F7DF) {
  const inst = disasm(pc);
  console.log(hex(inst.pc) + '  ' + inst.rawBytes.padEnd(18) + inst.mnem);
  pc += inst.len;
}

console.log('\n=== Analysis summary ===');
console.log('Function at ' + hex(START) + ':');
console.log('- Starts with: ' + instructions[0]?.mnem);
console.log('- Total instructions decoded: ' + instructions.length);
if (funcEnd) console.log('- Function ends at: ' + hex(funcEnd));
console.log('- Code xrefs found: ' + wideXrefs);

// List all CALL/JP targets
console.log('\n=== CALL/JP targets from this function ===');
for (const inst of instructions) {
  if (inst.mnem.startsWith('CALL ') || inst.mnem.startsWith('JP ')) {
    console.log('  ' + hex(inst.pc) + ': ' + inst.mnem);
  }
}

// List all RAM accesses
console.log('\n=== RAM/IO accesses ===');
for (const inst of instructions) {
  const m = inst.mnem.match(/\(0x([0-9A-F]{6})\)/);
  if (m) {
    const addr = parseInt(m[1], 16);
    let label = '';
    if (addr === 0xD005F8) label = ' [OP1 type byte]';
    else if (addr >= 0xD005F8 && addr < 0xD00603) label = ' [OP1 + ' + (addr - 0xD005F8) + ']';
    else if (addr >= 0xD00603 && addr < 0xD0060E) label = ' [OP2 + ' + (addr - 0xD00603) + ']';
    else if (addr >= 0xD0060E && addr < 0xD00619) label = ' [OP3 + ' + (addr - 0xD0060E) + ']';
    else if (addr >= 0xD00619 && addr < 0xD00624) label = ' [OP4 + ' + (addr - 0xD00619) + ']';
    else if (addr >= 0xD00624 && addr < 0xD0062F) label = ' [OP5 + ' + (addr - 0xD00624) + ']';
    else if (addr >= 0xD0062F && addr < 0xD0063A) label = ' [OP6 + ' + (addr - 0xD0062F) + ']';
    else if (addr >= 0xD00000 && addr < 0xD10000) label = ' [RAM D0xxxx]';
    console.log('  ' + hex(inst.pc) + ': ' + inst.mnem + label);
  }
}
