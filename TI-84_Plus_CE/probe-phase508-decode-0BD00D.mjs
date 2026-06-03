#!/usr/bin/env node
// Phase 508 probe: disassemble 0x0BD00D (bulk descriptor initializer)
// and 0x07FA0D (per-descriptor subroutine called 6 times).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------- helpers ----------

function r8(addr) { return rom[addr]; }
function r24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex2(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function hex6(v) { return v.toString(16).toUpperCase().padStart(6, '0'); }
function hexBytes(addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(hex2(rom[addr + i]));
  return parts.join(' ');
}
function signed8(v) { return v > 127 ? v - 256 : v; }

// ---------- eZ80 disassembler (subset) ----------

const REG8 = ['B','C','D','E','H','L','(HL)','A'];
const REG16 = ['BC','DE','HL','SP'];

function disasmOne(pc) {
  let addr = pc;
  let prefix = '';
  let prefixLen = 0;

  const b0 = r8(addr);
  if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
    const suffMap = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    prefix = suffMap[b0];
    prefixLen = 1;
    addr++;
  }

  const op = r8(addr);
  const suf = prefix ? ' ' + prefix : '';

  // --- DD/FD prefix (IX/IY) ---
  if (op === 0xDD || op === 0xFD) {
    const idxReg = op === 0xDD ? 'IX' : 'IY';
    const op2 = r8(addr + 1);

    if (op2 === 0x21) { return { len: 5 + prefixLen, mnem: 'LD ' + idxReg + ',' + hex6(r24(addr+2)) + 'h' + suf }; }
    if (op2 === 0x36) { const d = signed8(r8(addr+2)); const n = r8(addr+3); return { len: 4 + prefixLen, mnem: 'LD (' + idxReg + (d>=0?'+':'') + d + '),' + hex2(n) + 'h' + suf }; }
    if (op2 === 0xE5) return { len: 2 + prefixLen, mnem: 'PUSH ' + idxReg + suf };
    if (op2 === 0xE1) return { len: 2 + prefixLen, mnem: 'POP ' + idxReg + suf };
    if (op2 === 0x23) return { len: 2 + prefixLen, mnem: 'INC ' + idxReg + suf };
    if (op2 === 0x2B) return { len: 2 + prefixLen, mnem: 'DEC ' + idxReg + suf };
    if ((op2 & 0xCF) === 0x09) { const rr = REG16[(op2 >> 4) & 3]; return { len: 2 + prefixLen, mnem: 'ADD ' + idxReg + ',' + (rr === 'HL' ? idxReg : rr) + suf }; }
    if (op2 === 0xE9) return { len: 2 + prefixLen, mnem: 'JP (' + idxReg + ')' + suf };
    if ((op2 & 0xC7) === 0x46) { const d = signed8(r8(addr+2)); return { len: 3 + prefixLen, mnem: 'LD ' + REG8[(op2>>3)&7] + ',(' + idxReg + (d>=0?'+':'') + d + ')' + suf }; }
    if ((op2 & 0xF8) === 0x70 && op2 !== 0x76) { const d = signed8(r8(addr+2)); return { len: 3 + prefixLen, mnem: 'LD (' + idxReg + (d>=0?'+':'') + d + '),' + REG8[op2&7] + suf }; }
    if (op2 === 0xCB) {
      const d = signed8(r8(addr+2)); const op3 = r8(addr+3);
      const sign = d >= 0 ? '+' : '';
      const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      if (op3 < 0x40) return { len: 4 + prefixLen, mnem: bitOps[op3>>3] + ' (' + idxReg + sign + d + ')' + suf };
      if (op3 < 0x80) return { len: 4 + prefixLen, mnem: 'BIT ' + ((op3>>3)&7) + ',(' + idxReg + sign + d + ')' + suf };
      if (op3 < 0xC0) return { len: 4 + prefixLen, mnem: 'RES ' + ((op3>>3)&7) + ',(' + idxReg + sign + d + ')' + suf };
      return { len: 4 + prefixLen, mnem: 'SET ' + ((op3>>3)&7) + ',(' + idxReg + sign + d + ')' + suf };
    }
    return { len: 2 + prefixLen, mnem: 'DB ' + hex2(op) + ',' + hex2(op2) + ' ; unknown ' + idxReg + ' op' };
  }

  // --- ED prefix ---
  if (op === 0xED) {
    const op2 = r8(addr + 1);
    if (op2 === 0xB0) return { len: 2 + prefixLen, mnem: 'LDIR' + suf };
    if (op2 === 0xB8) return { len: 2 + prefixLen, mnem: 'LDDR' + suf };
    if (op2 === 0x27) return { len: 2 + prefixLen, mnem: 'LD HL,(HL)' + suf };
    if (op2 === 0xA0) return { len: 2 + prefixLen, mnem: 'LDI' + suf };
    if (op2 === 0xA8) return { len: 2 + prefixLen, mnem: 'LDD' + suf };
    if (op2 === 0x44) return { len: 2 + prefixLen, mnem: 'NEG' + suf };
    if (op2 === 0x4D) return { len: 2 + prefixLen, mnem: 'RETI' + suf };
    if (op2 === 0x45) return { len: 2 + prefixLen, mnem: 'RETN' + suf };
    if ((op2 & 0xCF) === 0x4B) { const rr = REG16[(op2>>4)&3]; return { len: 5 + prefixLen, mnem: 'LD ' + rr + ',(' + hex6(r24(addr+2)) + 'h)' + suf }; }
    if ((op2 & 0xCF) === 0x43) { const rr = REG16[(op2>>4)&3]; return { len: 5 + prefixLen, mnem: 'LD (' + hex6(r24(addr+2)) + 'h),' + rr + suf }; }
    return { len: 2 + prefixLen, mnem: 'DB ED,' + hex2(op2) + ' ; unknown ED' + suf };
  }

  // --- CB prefix ---
  if (op === 0xCB) {
    const op2 = r8(addr + 1);
    const reg = REG8[op2 & 7];
    const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
    if (op2 < 0x40) return { len: 2 + prefixLen, mnem: bitOps[op2>>3] + ' ' + reg + suf };
    if (op2 < 0x80) return { len: 2 + prefixLen, mnem: 'BIT ' + ((op2>>3)&7) + ',' + reg + suf };
    if (op2 < 0xC0) return { len: 2 + prefixLen, mnem: 'RES ' + ((op2>>3)&7) + ',' + reg + suf };
    return { len: 2 + prefixLen, mnem: 'SET ' + ((op2>>3)&7) + ',' + reg + suf };
  }

  // LD r,r (0x40-0x7F except 0x76=HALT)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    return { len: 1 + prefixLen, mnem: 'LD ' + REG8[(op>>3)&7] + ',' + REG8[op&7] + suf };
  }
  if (op === 0x76) return { len: 1 + prefixLen, mnem: 'HALT' + suf };

  // ALU A,r (0x80-0xBF)
  if (op >= 0x80 && op <= 0xBF) {
    const aluOps = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
    return { len: 1 + prefixLen, mnem: aluOps[(op>>3)&7] + REG8[op&7] + suf };
  }

  switch (op) {
    case 0x00: return { len: 1 + prefixLen, mnem: 'NOP' + suf };
    case 0x01: return { len: 4 + prefixLen, mnem: 'LD BC,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0x02: return { len: 1 + prefixLen, mnem: 'LD (BC),A' + suf };
    case 0x03: return { len: 1 + prefixLen, mnem: 'INC BC' + suf };
    case 0x04: return { len: 1 + prefixLen, mnem: 'INC B' + suf };
    case 0x05: return { len: 1 + prefixLen, mnem: 'DEC B' + suf };
    case 0x06: return { len: 2 + prefixLen, mnem: 'LD B,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x07: return { len: 1 + prefixLen, mnem: 'RLCA' + suf };
    case 0x08: return { len: 1 + prefixLen, mnem: "EX AF,AF'" + suf };
    case 0x09: return { len: 1 + prefixLen, mnem: 'ADD HL,BC' + suf };
    case 0x0A: return { len: 1 + prefixLen, mnem: 'LD A,(BC)' + suf };
    case 0x0B: return { len: 1 + prefixLen, mnem: 'DEC BC' + suf };
    case 0x0C: return { len: 1 + prefixLen, mnem: 'INC C' + suf };
    case 0x0D: return { len: 1 + prefixLen, mnem: 'DEC C' + suf };
    case 0x0E: return { len: 2 + prefixLen, mnem: 'LD C,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x0F: return { len: 1 + prefixLen, mnem: 'RRCA' + suf };

    case 0x10: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'DJNZ ' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x11: return { len: 4 + prefixLen, mnem: 'LD DE,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0x12: return { len: 1 + prefixLen, mnem: 'LD (DE),A' + suf };
    case 0x13: return { len: 1 + prefixLen, mnem: 'INC DE' + suf };
    case 0x14: return { len: 1 + prefixLen, mnem: 'INC D' + suf };
    case 0x15: return { len: 1 + prefixLen, mnem: 'DEC D' + suf };
    case 0x16: return { len: 2 + prefixLen, mnem: 'LD D,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x17: return { len: 1 + prefixLen, mnem: 'RLA' + suf };
    case 0x18: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'JR ' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x19: return { len: 1 + prefixLen, mnem: 'ADD HL,DE' + suf };
    case 0x1A: return { len: 1 + prefixLen, mnem: 'LD A,(DE)' + suf };
    case 0x1B: return { len: 1 + prefixLen, mnem: 'DEC DE' + suf };
    case 0x1C: return { len: 1 + prefixLen, mnem: 'INC E' + suf };
    case 0x1D: return { len: 1 + prefixLen, mnem: 'DEC E' + suf };
    case 0x1E: return { len: 2 + prefixLen, mnem: 'LD E,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x1F: return { len: 1 + prefixLen, mnem: 'RRA' + suf };

    case 0x20: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'JR NZ,' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x21: return { len: 4 + prefixLen, mnem: 'LD HL,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0x22: return { len: 4 + prefixLen, mnem: 'LD (' + hex6(r24(addr+1)) + 'h),HL' + suf };
    case 0x23: return { len: 1 + prefixLen, mnem: 'INC HL' + suf };
    case 0x24: return { len: 1 + prefixLen, mnem: 'INC H' + suf };
    case 0x25: return { len: 1 + prefixLen, mnem: 'DEC H' + suf };
    case 0x26: return { len: 2 + prefixLen, mnem: 'LD H,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x27: return { len: 1 + prefixLen, mnem: 'DAA' + suf };
    case 0x28: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'JR Z,' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x29: return { len: 1 + prefixLen, mnem: 'ADD HL,HL' + suf };
    case 0x2A: return { len: 4 + prefixLen, mnem: 'LD HL,(' + hex6(r24(addr+1)) + 'h)' + suf };
    case 0x2B: return { len: 1 + prefixLen, mnem: 'DEC HL' + suf };
    case 0x2C: return { len: 1 + prefixLen, mnem: 'INC L' + suf };
    case 0x2D: return { len: 1 + prefixLen, mnem: 'DEC L' + suf };
    case 0x2E: return { len: 2 + prefixLen, mnem: 'LD L,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x2F: return { len: 1 + prefixLen, mnem: 'CPL' + suf };

    case 0x30: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'JR NC,' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x31: return { len: 4 + prefixLen, mnem: 'LD SP,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0x32: return { len: 4 + prefixLen, mnem: 'LD (' + hex6(r24(addr+1)) + 'h),A' + suf };
    case 0x33: return { len: 1 + prefixLen, mnem: 'INC SP' + suf };
    case 0x34: return { len: 1 + prefixLen, mnem: 'INC (HL)' + suf };
    case 0x35: return { len: 1 + prefixLen, mnem: 'DEC (HL)' + suf };
    case 0x36: return { len: 2 + prefixLen, mnem: 'LD (HL),' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x37: return { len: 1 + prefixLen, mnem: 'SCF' + suf };
    case 0x38: { const off = signed8(r8(addr+1)); return { len: 2 + prefixLen, mnem: 'JR C,' + hex6(pc + 2 + prefixLen + off) + 'h' + suf }; }
    case 0x39: return { len: 1 + prefixLen, mnem: 'ADD HL,SP' + suf };
    case 0x3A: return { len: 4 + prefixLen, mnem: 'LD A,(' + hex6(r24(addr+1)) + 'h)' + suf };
    case 0x3B: return { len: 1 + prefixLen, mnem: 'DEC SP' + suf };
    case 0x3C: return { len: 1 + prefixLen, mnem: 'INC A' + suf };
    case 0x3D: return { len: 1 + prefixLen, mnem: 'DEC A' + suf };
    case 0x3E: return { len: 2 + prefixLen, mnem: 'LD A,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0x3F: return { len: 1 + prefixLen, mnem: 'CCF' + suf };

    case 0xC0: return { len: 1 + prefixLen, mnem: 'RET NZ' + suf };
    case 0xC1: return { len: 1 + prefixLen, mnem: 'POP BC' + suf };
    case 0xC2: return { len: 4 + prefixLen, mnem: 'JP NZ,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xC3: return { len: 4 + prefixLen, mnem: 'JP ' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xC4: return { len: 4 + prefixLen, mnem: 'CALL NZ,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xC5: return { len: 1 + prefixLen, mnem: 'PUSH BC' + suf };
    case 0xC6: return { len: 2 + prefixLen, mnem: 'ADD A,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xC7: return { len: 1 + prefixLen, mnem: 'RST 00h' + suf };
    case 0xC8: return { len: 1 + prefixLen, mnem: 'RET Z' + suf };
    case 0xC9: return { len: 1 + prefixLen, mnem: 'RET' + suf };
    case 0xCA: return { len: 4 + prefixLen, mnem: 'JP Z,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xCC: return { len: 4 + prefixLen, mnem: 'CALL Z,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xCD: return { len: 4 + prefixLen, mnem: 'CALL ' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xCE: return { len: 2 + prefixLen, mnem: 'ADC A,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xCF: return { len: 1 + prefixLen, mnem: 'RST 08h' + suf };
    case 0xD0: return { len: 1 + prefixLen, mnem: 'RET NC' + suf };
    case 0xD1: return { len: 1 + prefixLen, mnem: 'POP DE' + suf };
    case 0xD2: return { len: 4 + prefixLen, mnem: 'JP NC,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xD3: return { len: 2 + prefixLen, mnem: 'OUT (' + hex2(r8(addr+1)) + 'h),A' + suf };
    case 0xD4: return { len: 4 + prefixLen, mnem: 'CALL NC,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xD5: return { len: 1 + prefixLen, mnem: 'PUSH DE' + suf };
    case 0xD6: return { len: 2 + prefixLen, mnem: 'SUB ' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xD7: return { len: 1 + prefixLen, mnem: 'RST 10h' + suf };
    case 0xD8: return { len: 1 + prefixLen, mnem: 'RET C' + suf };
    case 0xD9: return { len: 1 + prefixLen, mnem: 'EXX' + suf };
    case 0xDA: return { len: 4 + prefixLen, mnem: 'JP C,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xDB: return { len: 2 + prefixLen, mnem: 'IN A,(' + hex2(r8(addr+1)) + 'h)' + suf };
    case 0xDC: return { len: 4 + prefixLen, mnem: 'CALL C,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xDE: return { len: 2 + prefixLen, mnem: 'SBC A,' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xDF: return { len: 1 + prefixLen, mnem: 'RST 18h' + suf };
    case 0xE0: return { len: 1 + prefixLen, mnem: 'RET PO' + suf };
    case 0xE1: return { len: 1 + prefixLen, mnem: 'POP HL' + suf };
    case 0xE2: return { len: 4 + prefixLen, mnem: 'JP PO,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xE3: return { len: 1 + prefixLen, mnem: 'EX (SP),HL' + suf };
    case 0xE4: return { len: 4 + prefixLen, mnem: 'CALL PO,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xE5: return { len: 1 + prefixLen, mnem: 'PUSH HL' + suf };
    case 0xE6: return { len: 2 + prefixLen, mnem: 'AND ' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xE7: return { len: 1 + prefixLen, mnem: 'RST 20h' + suf };
    case 0xE8: return { len: 1 + prefixLen, mnem: 'RET PE' + suf };
    case 0xE9: return { len: 1 + prefixLen, mnem: 'JP (HL)' + suf };
    case 0xEA: return { len: 4 + prefixLen, mnem: 'JP PE,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xEB: return { len: 1 + prefixLen, mnem: 'EX DE,HL' + suf };
    case 0xEC: return { len: 4 + prefixLen, mnem: 'CALL PE,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xEE: return { len: 2 + prefixLen, mnem: 'XOR ' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xEF: return { len: 1 + prefixLen, mnem: 'RST 28h' + suf };
    case 0xF0: return { len: 1 + prefixLen, mnem: 'RET P' + suf };
    case 0xF1: return { len: 1 + prefixLen, mnem: 'POP AF' + suf };
    case 0xF2: return { len: 4 + prefixLen, mnem: 'JP P,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xF3: return { len: 1 + prefixLen, mnem: 'DI' + suf };
    case 0xF4: return { len: 4 + prefixLen, mnem: 'CALL P,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xF5: return { len: 1 + prefixLen, mnem: 'PUSH AF' + suf };
    case 0xF6: return { len: 2 + prefixLen, mnem: 'OR ' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xF7: return { len: 1 + prefixLen, mnem: 'RST 30h' + suf };
    case 0xF8: return { len: 1 + prefixLen, mnem: 'RET M' + suf };
    case 0xF9: return { len: 1 + prefixLen, mnem: 'LD SP,HL' + suf };
    case 0xFA: return { len: 4 + prefixLen, mnem: 'JP M,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xFB: return { len: 1 + prefixLen, mnem: 'EI' + suf };
    case 0xFC: return { len: 4 + prefixLen, mnem: 'CALL M,' + hex6(r24(addr+1)) + 'h' + suf };
    case 0xFE: return { len: 2 + prefixLen, mnem: 'CP ' + hex2(r8(addr+1)) + 'h' + suf };
    case 0xFF: return { len: 1 + prefixLen, mnem: 'RST 38h' + suf };

    default:
      return { len: 1 + prefixLen, mnem: 'DB ' + hex2(op) + ' ; unknown' + suf };
  }
}

// ---------- disassemble a range ----------

function disasmRange(label, startAddr, endAddr) {
  console.log('');
  console.log('='.repeat(72));
  console.log('  ' + label + ': ' + hex6(startAddr) + 'h - ' + hex6(endAddr) + 'h');
  console.log('='.repeat(72));

  const instrs = [];
  let pc = startAddr;
  while (pc <= endAddr) {
    const { len, mnem } = disasmOne(pc);
    const bytes = hexBytes(pc, len);
    console.log('  ' + hex6(pc) + ':  ' + bytes.padEnd(20) + ' ' + mnem);
    instrs.push({ addr: pc, len, mnem });
    pc += len;
  }
  console.log('');
  return instrs;
}

// ---------- main ----------

console.log('Phase 508 - Disassembly of 0x0BD00D (bulk descriptor init) and 0x07FA0D (per-descriptor routine)');
console.log('ROM size: ' + rom.length + ' bytes (' + (rom.length / 1024 / 1024).toFixed(1) + ' MB)');

const instrs1 = disasmRange('0x0BD00D - Bulk Descriptor Initializer', 0x0BD00D, 0x0BD080);
const instrs2 = disasmRange('0x07FA0D - Per-Descriptor Subroutine (extended to 07FA90)', 0x07FA0D, 0x07FA90);

// Also disassemble reference routines
disasmRange('0x07F978 - 9xLDI Copy Routine (reference)', 0x07F978, 0x07F990);
disasmRange('0x07F9FB - Copy Descriptor to D005F8 (reference)', 0x07F9FB, 0x07FA0C);

// Disassemble 0x07FA6C and 0x07FAC2 (called from 0x0BD045)
disasmRange('0x07FA6C - Jump target from 07FA60', 0x07FA6C, 0x07FA90);
disasmRange('0x07FA90 - Continuation past descriptor write', 0x07FA90, 0x07FAC5);
disasmRange('0x07FAC2 - Called from 0x0BD045', 0x07FAC2, 0x07FAF0);
disasmRange('0x0BD0DD - Called from 0x0BD023', 0x0BD0DD, 0x0BD110);

// ---------- analysis ----------
console.log('');
console.log('='.repeat(72));
console.log('  ANALYSIS');
console.log('='.repeat(72));

// Find DJNZ in 0x0BD00D to identify loop
const djnzInstr = instrs1.find(function(i) { return i.mnem.startsWith('DJNZ'); });
if (djnzInstr) {
  const match = djnzInstr.mnem.match(/([0-9A-F]+)h/);
  if (match) {
    const target = parseInt(match[1], 16);
    console.log('');
    console.log('DJNZ at ' + hex6(djnzInstr.addr) + 'h loops back to ' + hex6(target) + 'h');

    const loopBody = instrs1.filter(function(i) { return i.addr >= target && i.addr <= djnzInstr.addr; });
    console.log('Loop body (' + loopBody.length + ' instructions):');
    for (const i of loopBody) {
      console.log('  ' + hex6(i.addr) + ': ' + i.mnem);
    }

    const loopCalls = loopBody.filter(function(i) { return i.mnem.startsWith('CALL'); });
    console.log('');
    console.log('CALLs per iteration: ' + loopCalls.length);
    for (const c of loopCalls) console.log('  ' + hex6(c.addr) + ': ' + c.mnem);
  }
}

// Analyze 0x07FA0D
console.log('');
console.log('--- 0x07FA0D Memory Operations ---');
const memOps = instrs2.filter(function(i) {
  return i.mnem.includes('LD (') || i.mnem.includes('LDIR') || i.mnem.includes('LDI') ||
    i.mnem.includes('LDDR') || i.mnem.includes('LDD');
});
for (const w of memOps) console.log('  ' + hex6(w.addr) + ': ' + w.mnem);

const subCalls = instrs2.filter(function(i) { return i.mnem.startsWith('CALL'); });
console.log('');
console.log('CALLs from 0x07FA0D:');
for (const c of subCalls) console.log('  ' + hex6(c.addr) + ': ' + c.mnem);

const rets2 = instrs2.filter(function(i) { return i.mnem === 'RET' || /^RET [A-Z]/.test(i.mnem); });
console.log('');
console.log('RET instructions in 0x07FA0D:');
for (const r of rets2) console.log('  ' + hex6(r.addr) + ': ' + r.mnem);

// Descriptor block spacing analysis
console.log('');
console.log('--- Descriptor Block Spacing ---');
console.log('Known blocks: D01EB1 (block 0), D01EBA (block 1, +9), D01EDE (block 2, +45)');
console.log('If B=6, possible strides:');
for (const stride of [9, 12, 15, 18, 21, 24, 45]) {
  const blocks = [];
  for (let i = 0; i < 6; i++) blocks.push(hex6(0xD01EB1 + i * stride) + 'h');
  console.log('  stride=' + stride + ': ' + blocks.join(', '));
}

console.log('');
console.log('Done.');
process.exit(0);
