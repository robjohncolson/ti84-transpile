#!/usr/bin/env node
// probe-phase514-decode-07D233.mjs
// Static disassembly of 0x07D233 - per-descriptor sub-renderer called by 0x07D1B4
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const KNOWN = {
  0x06868A: 'descriptor_type_dispatcher',
  0x07CFA7: 'standard_text_renderer (types 0x20/0x21)',
  0x07CF1A: 'special_renderer (type 0x1C)',
  0x07C8B7: 'BCD_position_calculator',
  0x0A1799: 'glyph_to_VRAM_rasterizer',
  0x07F9FB: 'copy_descriptor_to_D005F8',
  0x07FA0D: 'copy_D005F8_to_destination',
  0x07F7BD: 'read_D005F8_type_byte',
  0x07D1B4: 'descriptor_list_walker',
  0x07D233: 'per_descriptor_sub_renderer (THIS FUNCTION)',
};

function annotate(addr) {
  return KNOWN[addr] ? '  ; -> ' + KNOWN[addr] : '';
}

const R8 = ['B','C','D','E','H','L','(HL)','A'];
const CC_NAMES = ['NZ','Z','NC','C','PO','PE','P','M'];
const R16 = ['BC','DE','HL','SP'];
const R16AF = ['BC','DE','HL','AF'];

const START = 0x07D233;
const MAX_BYTES = 400;
let pc = START;
const endAddr = START + MAX_BYTES;

console.log('=== Disassembly of 0x' + START.toString(16).toUpperCase() + ' ===\n');

function rd(offset) { return rom[offset]; }
function rd24(offset) { return rom[offset] | (rom[offset+1] << 8) | (rom[offset+2] << 16); }
function signed8(v) { return v >= 128 ? v - 256 : v; }
function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 2, '0'); }
function hexBytes(start, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += rom[start+i].toString(16).toUpperCase().padStart(2,'0') + ' ';
  return s.trimEnd();
}

function emit(addr, len, mnemonic) {
  const hx = hexBytes(addr, len).padEnd(20);
  console.log(hex(addr,6) + ': ' + hx + ' ' + mnemonic);
}

let instrCount = 0;
const allTargets = [];

while (pc < endAddr && instrCount < 200) {
  const addr = pc;
  const b0 = rd(pc);

  // DD prefix (IX)
  if (b0 === 0xDD) {
    const b1 = rd(pc+1);
    if (b1 === 0xCB) {
      const d = rd(pc+2); const op = rd(pc+3); const bit = (op >> 3) & 7;
      if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      emit(addr, 4, 'DD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
    }
    if (b1 === 0x21) { const nn = rd24(pc+2); emit(addr, 5, 'LD IX,' + hex(nn,6)); pc += 5; instrCount++; continue; }
    if (b1 === 0xE5) { emit(addr, 2, 'PUSH IX'); pc += 2; instrCount++; continue; }
    if (b1 === 0xE1) { emit(addr, 2, 'POP IX'); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc+2); emit(addr, 3, 'LD ' + R8[r] + ',(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc+2); emit(addr, 3, 'LD (IX+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
    if (b1 === 0x36) { const d = rd(pc+2); const n = rd(pc+3); emit(addr, 4, 'LD (IX+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
    if (b1 === 0x23) { emit(addr, 2, 'INC IX'); pc += 2; instrCount++; continue; }
    if (b1 === 0x2B) { emit(addr, 2, 'DEC IX'); pc += 2; instrCount++; continue; }
    if (b1 === 0x09) { emit(addr, 2, 'ADD IX,BC'); pc += 2; instrCount++; continue; }
    if (b1 === 0x19) { emit(addr, 2, 'ADD IX,DE'); pc += 2; instrCount++; continue; }
    if (b1 === 0x29) { emit(addr, 2, 'ADD IX,IX'); pc += 2; instrCount++; continue; }
    if (b1 === 0x39) { emit(addr, 2, 'ADD IX,SP'); pc += 2; instrCount++; continue; }
    if (b1 === 0xE9) { emit(addr, 2, 'JP (IX)'); pc += 2; instrCount++; continue; }
    if (b1 === 0xBE) { const d = rd(pc+2); emit(addr, 3, 'CP (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xB6) { const d = rd(pc+2); emit(addr, 3, 'OR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xA6) { const d = rd(pc+2); emit(addr, 3, 'AND (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xAE) { const d = rd(pc+2); emit(addr, 3, 'XOR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x86) { const d = rd(pc+2); emit(addr, 3, 'ADD A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x8E) { const d = rd(pc+2); emit(addr, 3, 'ADC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x96) { const d = rd(pc+2); emit(addr, 3, 'SUB (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x9E) { const d = rd(pc+2); emit(addr, 3, 'SBC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x34) { const d = rd(pc+2); emit(addr, 3, 'INC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x35) { const d = rd(pc+2); emit(addr, 3, 'DEC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IX'); pc += 2; instrCount++; continue; }
    if (b1 === 0x22) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),IX'); pc += 5; instrCount++; continue; }
    if (b1 === 0x2A) { const nn = rd24(pc+2); emit(addr, 5, 'LD IX,(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
    emit(addr, 2, 'DD ' + hex(b1) + ' ; unhandled IX prefix'); pc += 2; instrCount++; continue;
  }

  // FD prefix (IY)
  if (b0 === 0xFD) {
    const b1 = rd(pc+1);
    if (b1 === 0xCB) {
      const d = rd(pc+2); const op = rd(pc+3); const bit = (op >> 3) & 7;
      if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
      emit(addr, 4, 'FD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
    }
    if (b1 === 0x21) { const nn = rd24(pc+2); emit(addr, 5, 'LD IY,' + hex(nn,6)); pc += 5; instrCount++; continue; }
    if (b1 === 0xE5) { emit(addr, 2, 'PUSH IY'); pc += 2; instrCount++; continue; }
    if (b1 === 0xE1) { emit(addr, 2, 'POP IY'); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc+2); emit(addr, 3, 'LD ' + R8[r] + ',(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc+2); emit(addr, 3, 'LD (IY+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
    if (b1 === 0x36) { const d = rd(pc+2); const n = rd(pc+3); emit(addr, 4, 'LD (IY+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
    if (b1 === 0x23) { emit(addr, 2, 'INC IY'); pc += 2; instrCount++; continue; }
    if (b1 === 0x2B) { emit(addr, 2, 'DEC IY'); pc += 2; instrCount++; continue; }
    if (b1 === 0x09) { emit(addr, 2, 'ADD IY,BC'); pc += 2; instrCount++; continue; }
    if (b1 === 0x19) { emit(addr, 2, 'ADD IY,DE'); pc += 2; instrCount++; continue; }
    if (b1 === 0x29) { emit(addr, 2, 'ADD IY,IY'); pc += 2; instrCount++; continue; }
    if (b1 === 0x39) { emit(addr, 2, 'ADD IY,SP'); pc += 2; instrCount++; continue; }
    if (b1 === 0xE9) { emit(addr, 2, 'JP (IY)'); pc += 2; instrCount++; continue; }
    if (b1 === 0xBE) { const d = rd(pc+2); emit(addr, 3, 'CP (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xB6) { const d = rd(pc+2); emit(addr, 3, 'OR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xA6) { const d = rd(pc+2); emit(addr, 3, 'AND (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xAE) { const d = rd(pc+2); emit(addr, 3, 'XOR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x86) { const d = rd(pc+2); emit(addr, 3, 'ADD A,(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x96) { const d = rd(pc+2); emit(addr, 3, 'SUB (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x34) { const d = rd(pc+2); emit(addr, 3, 'INC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0x35) { const d = rd(pc+2); emit(addr, 3, 'DEC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
    if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IY'); pc += 2; instrCount++; continue; }
    if (b1 === 0x22) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),IY'); pc += 5; instrCount++; continue; }
    if (b1 === 0x2A) { const nn = rd24(pc+2); emit(addr, 5, 'LD IY,(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
    emit(addr, 2, 'FD ' + hex(b1) + ' ; unhandled IY prefix'); pc += 2; instrCount++; continue;
  }

  // CB prefix - bit/shift ops
  if (b0 === 0xCB) {
    const b1 = rd(pc+1);
    if ((b1 & 0xC0) === 0x00) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      emit(addr, 2, ops[(b1>>3)&7] + ' ' + R8[b1&7]); pc += 2; instrCount++; continue;
    }
    if ((b1 & 0xC0) === 0x40) { emit(addr, 2, 'BIT ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC0) === 0x80) { emit(addr, 2, 'RES ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC0) === 0xC0) { emit(addr, 2, 'SET ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
  }

  // ED prefix
  if (b0 === 0xED) {
    const b1 = rd(pc+1);
    if (b1 === 0xB0) { emit(addr, 2, 'LDIR'); pc += 2; instrCount++; continue; }
    if (b1 === 0xB8) { emit(addr, 2, 'LDDR'); pc += 2; instrCount++; continue; }
    if (b1 === 0xB1) { emit(addr, 2, 'CPIR'); pc += 2; instrCount++; continue; }
    if (b1 === 0xA0) { emit(addr, 2, 'LDI'); pc += 2; instrCount++; continue; }
    if (b1 === 0xA1) { emit(addr, 2, 'CPI'); pc += 2; instrCount++; continue; }
    if (b1 === 0x46) { emit(addr, 2, 'IM 0'); pc += 2; instrCount++; continue; }
    if (b1 === 0x56) { emit(addr, 2, 'IM 1'); pc += 2; instrCount++; continue; }
    if (b1 === 0x5E) { emit(addr, 2, 'IM 2'); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC7) === 0x40) { emit(addr, 2, 'IN ' + R8[(b1>>3)&7] + ',(C)'); pc += 2; instrCount++; continue; }
    if ((b1 & 0xC7) === 0x41) { emit(addr, 2, 'OUT (C),' + R8[(b1>>3)&7]); pc += 2; instrCount++; continue; }
    if ((b1 & 0xCF) === 0x42) { emit(addr, 2, 'SBC HL,' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
    if ((b1 & 0xCF) === 0x4A) { emit(addr, 2, 'ADC HL,' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
    if ((b1 & 0xCF) === 0x43) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),' + R16[(b1>>4)&3]); pc += 5; instrCount++; continue; }
    if ((b1 & 0xCF) === 0x4B) { const nn = rd24(pc+2); emit(addr, 5, 'LD ' + R16[(b1>>4)&3] + ',(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
    if (b1 === 0x44) { emit(addr, 2, 'NEG'); pc += 2; instrCount++; continue; }
    if (b1 === 0x4D) { emit(addr, 2, 'RETI'); pc += 2; instrCount++; continue; }
    if (b1 === 0x45) { emit(addr, 2, 'RETN'); pc += 2; instrCount++; continue; }
    if (b1 === 0x67) { emit(addr, 2, 'RRD'); pc += 2; instrCount++; continue; }
    if (b1 === 0x6F) { emit(addr, 2, 'RLD'); pc += 2; instrCount++; continue; }
    if ((b1 & 0xCF) === 0x4C) { emit(addr, 2, 'MLT ' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
    if (b1 === 0x32) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA IX,IX+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x33) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA IY,IY+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x02) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA BC,IX+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x12) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA DE,IX+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x22) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA HL,IX+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x03) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA BC,IY+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x13) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA DE,IY+' + d); pc += 3; instrCount++; continue; }
    if (b1 === 0x23) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA HL,IY+' + d); pc += 3; instrCount++; continue; }
    if ((b1 & 0xC7) === 0x04 && b1 !== 0x44) { emit(addr, 2, 'TST A,' + R8[(b1>>3)&7]); pc += 2; instrCount++; continue; }
    emit(addr, 2, 'ED ' + hex(b1) + ' ; unhandled ED prefix'); pc += 2; instrCount++; continue;
  }

  // Single-byte
  if (b0 === 0x00) { emit(addr, 1, 'NOP'); pc += 1; instrCount++; continue; }
  if (b0 === 0x76) { emit(addr, 1, 'HALT'); pc += 1; instrCount++; continue; }
  if (b0 === 0xC9) {
    emit(addr, 1, 'RET');
    pc += 1; instrCount++;
    console.log('\n--- RET at ' + hex(addr,6) + ' (end of function) ---');
    break;
  }
  if (b0 === 0xF3) { emit(addr, 1, 'DI'); pc += 1; instrCount++; continue; }
  if (b0 === 0xFB) { emit(addr, 1, 'EI'); pc += 1; instrCount++; continue; }
  if (b0 === 0x37) { emit(addr, 1, 'SCF'); pc += 1; instrCount++; continue; }
  if (b0 === 0x3F) { emit(addr, 1, 'CCF'); pc += 1; instrCount++; continue; }
  if (b0 === 0x2F) { emit(addr, 1, 'CPL'); pc += 1; instrCount++; continue; }
  if (b0 === 0x27) { emit(addr, 1, 'DAA'); pc += 1; instrCount++; continue; }
  if (b0 === 0x07) { emit(addr, 1, 'RLCA'); pc += 1; instrCount++; continue; }
  if (b0 === 0x0F) { emit(addr, 1, 'RRCA'); pc += 1; instrCount++; continue; }
  if (b0 === 0x17) { emit(addr, 1, 'RLA'); pc += 1; instrCount++; continue; }
  if (b0 === 0x1F) { emit(addr, 1, 'RRA'); pc += 1; instrCount++; continue; }
  if (b0 === 0xD9) { emit(addr, 1, 'EXX'); pc += 1; instrCount++; continue; }
  if (b0 === 0x08) { emit(addr, 1, 'EX AF,AF'); pc += 1; instrCount++; continue; }
  if (b0 === 0xEB) { emit(addr, 1, 'EX DE,HL'); pc += 1; instrCount++; continue; }
  if (b0 === 0xE3) { emit(addr, 1, 'EX (SP),HL'); pc += 1; instrCount++; continue; }
  if (b0 === 0xE9) { emit(addr, 1, 'JP (HL)'); pc += 1; instrCount++; continue; }
  if (b0 === 0xF9) { emit(addr, 1, 'LD SP,HL'); pc += 1; instrCount++; continue; }

  // RET cc: 11ccc000 (C0,C8,D0,D8,E0,E8,F0,F8)
  if ((b0 & 0xC7) === 0xC0) {
    const cc = (b0 >> 3) & 7;
    emit(addr, 1, 'RET ' + CC_NAMES[cc]);
    pc += 1; instrCount++; continue;
  }

  // CALL nn (CD xx xx xx)
  if (b0 === 0xCD) {
    const nn = rd24(pc+1);
    allTargets.push({addr, type: 'CALL', target: nn});
    emit(addr, 4, 'CALL ' + hex(nn,6) + annotate(nn));
    pc += 4; instrCount++; continue;
  }

  // CALL cc,nn (11ccc100)
  if ((b0 & 0xC7) === 0xC4) {
    const cc = (b0 >> 3) & 7;
    const nn = rd24(pc+1);
    allTargets.push({addr, type: 'CALL ' + CC_NAMES[cc], target: nn});
    emit(addr, 4, 'CALL ' + CC_NAMES[cc] + ',' + hex(nn,6) + annotate(nn));
    pc += 4; instrCount++; continue;
  }

  // JP nn (C3 xx xx xx)
  if (b0 === 0xC3) {
    const nn = rd24(pc+1);
    allTargets.push({addr, type: 'JP', target: nn});
    emit(addr, 4, 'JP ' + hex(nn,6) + annotate(nn));
    pc += 4; instrCount++; continue;
  }

  // JP cc,nn (11ccc010)
  if ((b0 & 0xC7) === 0xC2) {
    const cc = (b0 >> 3) & 7;
    const nn = rd24(pc+1);
    allTargets.push({addr, type: 'JP ' + CC_NAMES[cc], target: nn});
    emit(addr, 4, 'JP ' + CC_NAMES[cc] + ',' + hex(nn,6) + annotate(nn));
    pc += 4; instrCount++; continue;
  }

  // JR e
  if (b0 === 0x18) {
    const e = signed8(rd(pc+1));
    const target = pc + 2 + e;
    emit(addr, 2, 'JR ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
    pc += 2; instrCount++; continue;
  }

  // JR cc,e
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const ccIdx = (b0 >> 3) & 3;
    const ccN = ['NZ','Z','NC','C'];
    const e = signed8(rd(pc+1));
    const target = pc + 2 + e;
    emit(addr, 2, 'JR ' + ccN[ccIdx] + ',' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
    pc += 2; instrCount++; continue;
  }

  // DJNZ e
  if (b0 === 0x10) {
    const e = signed8(rd(pc+1));
    const target = pc + 2 + e;
    emit(addr, 2, 'DJNZ ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
    pc += 2; instrCount++; continue;
  }

  // RST n (11ttt111)
  if ((b0 & 0xC7) === 0xC7) {
    const n = b0 & 0x38;
    emit(addr, 1, 'RST ' + hex(n));
    pc += 1; instrCount++; continue;
  }

  // LD r,r (01dddsss) - 0x76=HALT already handled
  if ((b0 & 0xC0) === 0x40) {
    const dst = (b0 >> 3) & 7;
    const src = b0 & 7;
    emit(addr, 1, 'LD ' + R8[dst] + ',' + R8[src]);
    pc += 1; instrCount++; continue;
  }

  // ALU A,r (10ooorr)
  if ((b0 & 0xC0) === 0x80) {
    const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
    emit(addr, 1, ops[(b0>>3)&7] + R8[b0&7]);
    pc += 1; instrCount++; continue;
  }

  // LD r,n (00rrr110 nn)
  if ((b0 & 0xC7) === 0x06) {
    const r = (b0 >> 3) & 7;
    const n = rd(pc+1);
    emit(addr, 2, 'LD ' + R8[r] + ',' + hex(n));
    pc += 2; instrCount++; continue;
  }

  // ALU A,n (11ooo110 nn)
  if ((b0 & 0xC7) === 0xC6) {
    const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
    const n = rd(pc+1);
    emit(addr, 2, ops[(b0>>3)&7] + hex(n));
    pc += 2; instrCount++; continue;
  }

  // LD rr,nn (00rr0001 nn nn nn)
  if ((b0 & 0xCF) === 0x01) {
    const rr = (b0 >> 4) & 3;
    const nn = rd24(pc+1);
    emit(addr, 4, 'LD ' + R16[rr] + ',' + hex(nn,6));
    pc += 4; instrCount++; continue;
  }

  // INC/DEC rr
  if ((b0 & 0xCF) === 0x03) { emit(addr, 1, 'INC ' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }
  if ((b0 & 0xCF) === 0x0B) { emit(addr, 1, 'DEC ' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }
  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) { emit(addr, 1, 'INC ' + R8[(b0>>3)&7]); pc += 1; instrCount++; continue; }
  if ((b0 & 0xC7) === 0x05) { emit(addr, 1, 'DEC ' + R8[(b0>>3)&7]); pc += 1; instrCount++; continue; }
  // PUSH/POP rr
  if ((b0 & 0xCF) === 0xC5) { emit(addr, 1, 'PUSH ' + R16AF[(b0>>4)&3]); pc += 1; instrCount++; continue; }
  if ((b0 & 0xCF) === 0xC1) { emit(addr, 1, 'POP ' + R16AF[(b0>>4)&3]); pc += 1; instrCount++; continue; }
  // ADD HL,rr
  if ((b0 & 0xCF) === 0x09) { emit(addr, 1, 'ADD HL,' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }

  if (b0 === 0x0A) { emit(addr, 1, 'LD A,(BC)'); pc += 1; instrCount++; continue; }
  if (b0 === 0x1A) { emit(addr, 1, 'LD A,(DE)'); pc += 1; instrCount++; continue; }
  if (b0 === 0x02) { emit(addr, 1, 'LD (BC),A'); pc += 1; instrCount++; continue; }
  if (b0 === 0x12) { emit(addr, 1, 'LD (DE),A'); pc += 1; instrCount++; continue; }

  if (b0 === 0x3A) { const nn = rd24(pc+1); emit(addr, 4, 'LD A,(' + hex(nn,6) + ')'); pc += 4; instrCount++; continue; }
  if (b0 === 0x32) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),A'); pc += 4; instrCount++; continue; }
  if (b0 === 0x2A) { const nn = rd24(pc+1); emit(addr, 4, 'LD HL,(' + hex(nn,6) + ')'); pc += 4; instrCount++; continue; }
  if (b0 === 0x22) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),HL'); pc += 4; instrCount++; continue; }

  if (b0 === 0xD3) { const n = rd(pc+1); emit(addr, 2, 'OUT (' + hex(n) + '),A'); pc += 2; instrCount++; continue; }
  if (b0 === 0xDB) { const n = rd(pc+1); emit(addr, 2, 'IN A,(' + hex(n) + ')'); pc += 2; instrCount++; continue; }

  // Fallthrough
  emit(addr, 1, 'DB ' + hex(b0) + ' ; unknown opcode');
  pc += 1; instrCount++;
}

if (pc >= endAddr) {
  console.log('\n--- Reached ' + MAX_BYTES + '-byte limit without RET ---');
}

console.log('\n=== ' + instrCount + ' instructions decoded, ' + (pc - START) + ' bytes ===');

// Summary
console.log('\n=== CALL/JP targets summary ===');
const seen = new Map();
for (const t of allTargets) {
  const key = t.type + ' ' + hex(t.target,6);
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(hex(t.addr,6));
}
for (const [key, addrs] of [...seen.entries()].sort()) {
  const target = parseInt(key.split(' ').pop().substring(2), 16);
  console.log('  ' + key + ' from [' + addrs.join(', ') + ']' + annotate(target));
}
