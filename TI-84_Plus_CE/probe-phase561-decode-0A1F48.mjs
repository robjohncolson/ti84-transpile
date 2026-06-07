#!/usr/bin/env node
// probe-phase561-decode-0A1F48.mjs
// Decode function 0x0A1F48 — the actual Y-advance helper called by 0x0A2013.
// Read-only: reads ROM.rom only.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

const BASE = 0x0A1F48;
const LEN = 200;

// --- Hex dump ---
console.log(`\n=== HEX DUMP: 0x${BASE.toString(16).toUpperCase()} - ${LEN} bytes ===\n`);
for (let i = 0; i < LEN; i += 16) {
  const addr = BASE + i;
  const hex = [];
  for (let j = 0; j < 16 && i + j < LEN; j++) {
    hex.push(rom[addr + j].toString(16).padStart(2, '0'));
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${hex.join(' ')}`);
}

// --- Known addresses ---
const knownRAM = {
  0xD00080: 'IY base (OS flags)',
  0xD00595: 'column limit / scroll param',
  0xD00596: 'column counter',
  0xD0231A: 'cursor column',
  0xD0231D: 'cursor row',
  0xD014FE: 'cursor Y conversion base',
  0xD008D5: 'render Y output',
  0xD0059C: 'blit target / render pointer',
  0xD00824: 'busy-wait flag',
  0xD000C6: 'BPP gate flag',
  0xD02505: 'column limit (alt)',
  0xD02685: 'unknown RAM',
  0xD02687: 'unknown RAM',
  0xD0059A: 'unknown RAM',
  0xD031F6: 'unknown RAM',
  0xD07396: 'unknown RAM',
};

const knownCalls = {
  0x06CBE5: 'CURSOR Y CONVERSION',
  0x0A1799: 'GLYPH RENDERER',
  0x0A1CAC: 'STRING PRINT LOOP',
  0x0A1B5B: 'PER-CHAR DISPATCH',
  0x0A2013: 'Y-ADVANCE WRAPPER',
  0x0A1F48: 'Y-ADVANCE HELPER (this fn)',
  0x0A2032: 'LINE WRAP',
  0x0A22B1: 'SPECIAL CHAR HANDLER',
  0x0A23E5: 'BLIT CALL',
  0x025C33: 'QUICK NEWLINE',
  0x0800B8: 'OS helper (busy-wait)',
  0x04C979: 'width-clip',
  0x0A2D4C: 'ROW OFFSET calc',
  0x0A2802: 'unknown OS fn',
  0x0A1FAB: 'scroll copy subroutine (internal)',
  0x0A1FC5: 'block copy (internal)',
};

// --- eZ80 ADL-mode disassembler ---
const ramRefs = new Set();
const callTargets = new Set();
const jpTargets = new Set();
const jrTargets = new Set();

function trackAddr(a) {
  if (a >= 0xD00000 && a < 0xE00000) ramRefs.add(a);
}

function s8(v) { return v >= 128 ? v - 256 : v; }
function hex6(v) { return '0x' + (v & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'); }
function hex2(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }

function r8(n) { return ['B','C','D','E','H','L','(HL)','A'][n & 7]; }
function r16(n) { return ['BC','DE','HL','SP'][n & 3]; }
function r16af(n) { return ['BC','DE','HL','AF'][n & 3]; }
function cc(n) { return ['NZ','Z','NC','C','PO','PE','P','M'][n & 7]; }
function alu(n) { return ['ADD A,','ADC A,','SUB','SBC A,','AND','XOR','OR','CP'][n & 7]; }

function read24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function dispStr(d) {
  const sd = s8(d);
  return sd >= 0 ? `+0x${sd.toString(16).toUpperCase()}` : `-0x${(-sd).toString(16).toUpperCase()}`;
}

function romSlice(from, to) {
  const arr = [];
  for (let i = from; i < to; i++) arr.push(rom[i]);
  return arr;
}

function disassemble() {
  let pc = BASE;
  const end = BASE + LEN;
  const insts = [];
  let condNest = 0;

  while (pc < end) {
    const startPC = pc;
    let prefix = 0; // 0xDD or 0xFD
    let sis = false;
    let b = rom[pc];

    // .SIS prefix (0x40) — check if next byte is a control-flow opcode
    if (b === 0x40) {
      const next = rom[pc + 1];
      if ([0xC3,0xCD,0xC9,0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,
           0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA,
           0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC,
           0x18,0x20,0x28,0x30,0x38,
           0x2A,0x22].includes(next)) {
        sis = true;
        pc++;
        b = rom[pc];
      }
    }

    // IX/IY prefix
    if (b === 0xDD || b === 0xFD) {
      prefix = b;
      pc++;
      b = rom[pc];
    }

    const hl = prefix === 0xDD ? 'IX' : prefix === 0xFD ? 'IY' : 'HL';
    let mnem = '';

    // --- FD/DD CB dd op: bit operations on (IX/IY+d) ---
    if (b === 0xCB && prefix) {
      const d = rom[pc + 1];
      const op = rom[pc + 2];
      const ds = dispStr(d);
      const bit = (op >> 3) & 7;
      const x = (op >> 6) & 3;
      if (x === 1) mnem = `BIT ${bit},(${hl}${ds})`;
      else if (x === 2) mnem = `RES ${bit},(${hl}${ds})`;
      else if (x === 3) mnem = `SET ${bit},(${hl}${ds})`;
      else {
        const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        mnem = `${shifts[bit]} (${hl}${ds})`;
      }
      pc += 3;
      insts.push({ addr: startPC, len: pc - startPC, bytes: romSlice(startPC, pc), mnem });
      continue;
    }

    // --- CB prefix (no IX/IY) ---
    if (b === 0xCB && !prefix) {
      pc++;
      const op = rom[pc];
      const bit = (op >> 3) & 7;
      const z = op & 7;
      const x = (op >> 6) & 3;
      if (x === 1) mnem = `BIT ${bit},${r8(z)}`;
      else if (x === 2) mnem = `RES ${bit},${r8(z)}`;
      else if (x === 3) mnem = `SET ${bit},${r8(z)}`;
      else {
        const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        mnem = `${shifts[bit]} ${r8(z)}`;
      }
      pc++;
      insts.push({ addr: startPC, len: pc - startPC, bytes: romSlice(startPC, pc), mnem });
      continue;
    }

    // --- ED prefix ---
    if (b === 0xED && !prefix) {
      pc++;
      const op = rom[pc];
      pc++;

      if (op === 0xB0) { mnem = 'LDIR'; }
      else if (op === 0xB8) { mnem = 'LDDR'; }
      else if (op === 0xA0) { mnem = 'LDI'; }
      else if (op === 0xA8) { mnem = 'LDD'; }
      else if (op === 0xB1) { mnem = 'CPIR'; }
      else if (op === 0x44) { mnem = 'NEG'; }
      else if (op === 0x4D) { mnem = 'RETI'; }
      else if (op === 0x45) { mnem = 'RETN'; }
      else if (op === 0x57) { mnem = 'LD A,I'; }
      else if (op === 0x5F) { mnem = 'LD A,R'; }
      else if (op === 0x47) { mnem = 'LD I,A'; }
      else if (op === 0x4F) { mnem = 'LD R,A'; }
      else if (op === 0x46) { mnem = 'IM 0'; }
      else if (op === 0x56) { mnem = 'IM 1'; }
      else if (op === 0x5E) { mnem = 'IM 2'; }
      else if ((op & 0xCF) === 0x42) {
        mnem = `SBC HL,${r16((op >> 4) & 3)}`;
      }
      else if ((op & 0xCF) === 0x4A) {
        mnem = `ADC HL,${r16((op >> 4) & 3)}`;
      }
      else if ((op & 0xCF) === 0x43) {
        // LD (nn),rr
        const addr = read24(pc); pc += 3;
        trackAddr(addr);
        mnem = `LD (${hex6(addr)}),${r16((op >> 4) & 3)}`;
      }
      else if ((op & 0xCF) === 0x4B) {
        // LD rr,(nn)
        const addr = read24(pc); pc += 3;
        trackAddr(addr);
        mnem = `LD ${r16((op >> 4) & 3)},(${hex6(addr)})`;
      }
      else {
        mnem = `ED ${hex2(op)}`;
      }

      insts.push({ addr: startPC, len: pc - startPC, bytes: romSlice(startPC, pc), mnem });
      continue;
    }

    // --- Main opcode table ---
    pc++; // consume the opcode byte

    switch (b) {
      case 0x00: mnem = 'NOP'; break;

      // LD r,n
      case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x3E: {
        const reg = (b >> 3) & 7;
        let rn = r8(reg);
        if (prefix && reg === 4) rn = hl + 'H';
        if (prefix && reg === 5) rn = hl + 'L';
        mnem = `LD ${rn},${hex2(rom[pc])}`;
        pc++;
        break;
      }

      // LD (HL/IX+d/IY+d),n
      case 0x36: {
        if (prefix) {
          const d = rom[pc]; pc++;
          const n = rom[pc]; pc++;
          mnem = `LD (${hl}${dispStr(d)}),${hex2(n)}`;
        } else {
          mnem = `LD (HL),${hex2(rom[pc])}`;
          pc++;
        }
        break;
      }

      // LD rr,nn (24-bit in ADL, 16-bit in .SIS)
      case 0x01: case 0x11: case 0x21: case 0x31: {
        const rr = (b >> 4) & 3;
        const rrn = rr === 2 ? hl : r16(rr);
        if (sis) {
          const nn = rom[pc] | (rom[pc + 1] << 8);
          mnem = `.SIS LD ${rrn},${hex2(nn)}`;
          pc += 2;
        } else {
          const nn = read24(pc);
          trackAddr(nn);
          mnem = `LD ${rrn},${hex6(nn)}`;
          pc += 3;
        }
        break;
      }

      // LD A,(nn) / LD (nn),A
      case 0x3A: {
        const addr = read24(pc); pc += 3;
        trackAddr(addr);
        mnem = `LD A,(${hex6(addr)})`;
        break;
      }
      case 0x32: {
        const addr = read24(pc); pc += 3;
        trackAddr(addr);
        mnem = `LD (${hex6(addr)}),A`;
        break;
      }

      // LD HL/IX/IY,(nn) and LD (nn),HL/IX/IY
      case 0x2A: {
        if (sis) {
          const addr = rom[pc] | (rom[pc + 1] << 8);
          mnem = `.SIS LD ${hl},(${hex2(addr)})`;
          pc += 2;
        } else {
          const addr = read24(pc); pc += 3;
          trackAddr(addr);
          mnem = `LD ${hl},(${hex6(addr)})`;
        }
        break;
      }
      case 0x22: {
        if (sis) {
          const addr = rom[pc] | (rom[pc + 1] << 8);
          mnem = `.SIS LD (${hex2(addr)}),${hl}`;
          pc += 2;
        } else {
          const addr = read24(pc); pc += 3;
          trackAddr(addr);
          mnem = `LD (${hex6(addr)}),${hl}`;
        }
        break;
      }

      // LD (BC/DE),A / LD A,(BC/DE)
      case 0x02: mnem = 'LD (BC),A'; break;
      case 0x12: mnem = 'LD (DE),A'; break;
      case 0x0A: mnem = 'LD A,(BC)'; break;
      case 0x1A: mnem = 'LD A,(DE)'; break;

      // 8-bit reg-reg loads (excluding 0x76=HALT and indexed cases)
      case 0x40: case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x47:
      case 0x48: case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4F:
      case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x57:
      case 0x58: case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5F:
      case 0x60: case 0x61: case 0x62: case 0x63: case 0x64: case 0x65: case 0x67:
      case 0x68: case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6F:
      case 0x78: case 0x79: case 0x7A: case 0x7B: case 0x7C: case 0x7D: case 0x7F: {
        const dst = (b >> 3) & 7;
        const src = b & 7;
        let dn = r8(dst), sn = r8(src);
        if (prefix) {
          if (dst === 4) dn = hl + 'H';
          if (dst === 5) dn = hl + 'L';
          if (src === 4) sn = hl + 'H';
          if (src === 5) sn = hl + 'L';
        }
        mnem = `LD ${dn},${sn}`;
        break;
      }

      // LD r,(IX/IY+d)
      case 0x46: case 0x4E: case 0x56: case 0x5E: case 0x66: case 0x6E: case 0x7E: {
        if (prefix) {
          const d = rom[pc]; pc++;
          mnem = `LD ${r8((b >> 3) & 7)},(${hl}${dispStr(d)})`;
        } else {
          mnem = `LD ${r8((b >> 3) & 7)},${r8(b & 7)}`;
        }
        break;
      }

      // LD (IX/IY+d),r
      case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77: {
        if (prefix) {
          const d = rom[pc]; pc++;
          mnem = `LD (${hl}${dispStr(d)}),${r8(b & 7)}`;
        } else {
          mnem = `LD ${r8((b >> 3) & 7)},${r8(b & 7)}`;
        }
        break;
      }

      case 0x76: mnem = 'HALT'; break;

      // PUSH/POP
      case 0xC5: case 0xD5: case 0xE5: case 0xF5: {
        const rr = (b >> 4) & 3;
        mnem = `PUSH ${rr === 2 ? hl : r16af(rr)}`;
        break;
      }
      case 0xC1: case 0xD1: case 0xE1: case 0xF1: {
        const rr = (b >> 4) & 3;
        mnem = `POP ${rr === 2 ? hl : r16af(rr)}`;
        break;
      }

      // INC/DEC r
      case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x3C: {
        const reg = (b >> 3) & 7;
        let rn = r8(reg);
        if (prefix && reg === 4) rn = hl + 'H';
        if (prefix && reg === 5) rn = hl + 'L';
        mnem = `INC ${rn}`;
        break;
      }
      case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x3D: {
        const reg = (b >> 3) & 7;
        let rn = r8(reg);
        if (prefix && reg === 4) rn = hl + 'H';
        if (prefix && reg === 5) rn = hl + 'L';
        mnem = `DEC ${rn}`;
        break;
      }

      // INC/DEC (IX/IY+d)
      case 0x34: {
        if (prefix) {
          const d = rom[pc]; pc++;
          mnem = `INC (${hl}${dispStr(d)})`;
        } else {
          mnem = 'INC (HL)';
        }
        break;
      }
      case 0x35: {
        if (prefix) {
          const d = rom[pc]; pc++;
          mnem = `DEC (${hl}${dispStr(d)})`;
        } else {
          mnem = 'DEC (HL)';
        }
        break;
      }

      // INC/DEC rr
      case 0x03: case 0x13: case 0x23: case 0x33: {
        const rr = (b >> 4) & 3;
        mnem = `INC ${rr === 2 ? hl : r16(rr)}`;
        break;
      }
      case 0x0B: case 0x1B: case 0x2B: case 0x3B: {
        const rr = (b >> 4) & 3;
        mnem = `DEC ${rr === 2 ? hl : r16(rr)}`;
        break;
      }

      // ADD HL/IX/IY,rr
      case 0x09: case 0x19: case 0x29: case 0x39: {
        const rr = (b >> 4) & 3;
        const rrn = rr === 2 ? hl : r16(rr);
        mnem = `ADD ${hl},${rrn}`;
        break;
      }

      // ALU A,r
      case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x87:
      case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8F:
      case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x97:
      case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9F:
      case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA7:
      case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAF:
      case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB7:
      case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBF: {
        const op = (b >> 3) & 7;
        const src = b & 7;
        let sn = r8(src);
        if (prefix && src === 4) sn = hl + 'H';
        if (prefix && src === 5) sn = hl + 'L';
        mnem = `${alu(op)} ${sn}`;
        break;
      }

      // ALU A,(IX/IY+d)
      case 0x86: case 0x8E: case 0x96: case 0x9E: case 0xA6: case 0xAE: case 0xB6: case 0xBE: {
        const op = (b >> 3) & 7;
        if (prefix) {
          const d = rom[pc]; pc++;
          mnem = `${alu(op)} (${hl}${dispStr(d)})`;
        } else {
          mnem = `${alu(op)} (HL)`;
        }
        break;
      }

      // ALU A,n
      case 0xC6: mnem = `ADD A,${hex2(rom[pc])}`; pc++; break;
      case 0xCE: mnem = `ADC A,${hex2(rom[pc])}`; pc++; break;
      case 0xD6: mnem = `SUB ${hex2(rom[pc])}`; pc++; break;
      case 0xDE: mnem = `SBC A,${hex2(rom[pc])}`; pc++; break;
      case 0xE6: mnem = `AND ${hex2(rom[pc])}`; pc++; break;
      case 0xEE: mnem = `XOR ${hex2(rom[pc])}`; pc++; break;
      case 0xF6: mnem = `OR ${hex2(rom[pc])}`; pc++; break;
      case 0xFE: mnem = `CP ${hex2(rom[pc])}`; pc++; break;

      // CALL nn
      case 0xCD: {
        const addr = read24(pc); pc += 3;
        callTargets.add(addr);
        mnem = `${sis ? '.SIS ' : ''}CALL ${hex6(addr)}`;
        break;
      }

      // CALL cc,nn
      case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
        const addr = read24(pc); pc += 3;
        callTargets.add(addr);
        mnem = `${sis ? '.SIS ' : ''}CALL ${cc((b >> 3) & 7)},${hex6(addr)}`;
        break;
      }

      // JP nn
      case 0xC3: {
        const addr = read24(pc); pc += 3;
        jpTargets.add(addr);
        mnem = `${sis ? '.SIS ' : ''}JP ${hex6(addr)}`;
        break;
      }

      // JP cc,nn
      case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
        const addr = read24(pc); pc += 3;
        jpTargets.add(addr);
        mnem = `JP ${cc((b >> 3) & 7)},${hex6(addr)}`;
        break;
      }

      // JP (HL/IX/IY)
      case 0xE9: mnem = `JP (${hl})`; break;

      // JR e
      case 0x18: {
        const e = rom[pc]; pc++;
        const target = pc + s8(e);
        jrTargets.add(target);
        mnem = `JR ${hex6(target)} (${s8(e) >= 0 ? '+' : ''}${s8(e)})`;
        break;
      }

      // JR cc,e
      case 0x20: case 0x28: case 0x30: case 0x38: {
        const ccIdx = (b >> 3) & 3;
        const ccNames = ['NZ','Z','NC','C'];
        const e = rom[pc]; pc++;
        const target = pc + s8(e);
        jrTargets.add(target);
        mnem = `JR ${ccNames[ccIdx]},${hex6(target)} (${s8(e) >= 0 ? '+' : ''}${s8(e)})`;
        condNest++;
        break;
      }

      // DJNZ e
      case 0x10: {
        const e = rom[pc]; pc++;
        const target = pc + s8(e);
        jrTargets.add(target);
        mnem = `DJNZ ${hex6(target)} (${s8(e) >= 0 ? '+' : ''}${s8(e)})`;
        break;
      }

      // RET
      case 0xC9: {
        mnem = 'RET';
        insts.push({ addr: startPC, len: pc - startPC, bytes: romSlice(startPC, pc), mnem });
        // Stop at unconditional RET only if we're not inside conditional branches
        if (condNest <= 0) {
          return insts;
        }
        condNest = 0;
        continue;
      }

      // RET cc
      case 0xC0: case 0xC8: case 0xD0: case 0xD8: case 0xE0: case 0xE8: case 0xF0: case 0xF8: {
        mnem = `RET ${cc((b >> 3) & 7)}`;
        condNest++;
        break;
      }

      // RST
      case 0xC7: case 0xCF: case 0xD7: case 0xDF: case 0xE7: case 0xEF: case 0xF7: case 0xFF: {
        mnem = `RST ${hex2(b & 0x38)}`;
        break;
      }

      // EX
      case 0x08: mnem = "EX AF,AF'"; break;
      case 0xEB: mnem = 'EX DE,HL'; break;
      case 0xE3: mnem = `EX (SP),${hl}`; break;
      case 0xD9: mnem = 'EXX'; break;

      // Misc
      case 0xF3: mnem = 'DI'; break;
      case 0xFB: mnem = 'EI'; break;
      case 0x27: mnem = 'DAA'; break;
      case 0x2F: mnem = 'CPL'; break;
      case 0x37: mnem = 'SCF'; break;
      case 0x3F: mnem = 'CCF'; break;
      case 0x07: mnem = 'RLCA'; break;
      case 0x0F: mnem = 'RRCA'; break;
      case 0x17: mnem = 'RLA'; break;
      case 0x1F: mnem = 'RRA'; break;
      case 0xF9: mnem = `LD SP,${hl}`; break;
      case 0xD3: mnem = `OUT (${hex2(rom[pc])}),A`; pc++; break;
      case 0xDB: mnem = `IN A,(${hex2(rom[pc])})`; pc++; break;

      // SUB A,n -- handle 0x97 = SUB A,A explicitly
      case 0x97: mnem = 'SUB A'; break;

      default:
        mnem = `??? ${hex2(b)}`;
        break;
    }

    if (sis && !mnem.startsWith('.SIS')) {
      mnem = '.SIS ' + mnem;
    }

    insts.push({ addr: startPC, len: pc - startPC, bytes: romSlice(startPC, pc), mnem });
  }

  return insts;
}

const insts = disassemble();

console.log(`\n=== DISASSEMBLY: ${hex6(BASE)} ===\n`);
for (const inst of insts) {
  const addrStr = inst.addr.toString(16).padStart(6, '0').toUpperCase();
  const hexStr = inst.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${addrStr}  ${hexStr.padEnd(22)}  ${inst.mnem}`);
}

const totalBytes = insts.length > 0 ? insts[insts.length - 1].addr + insts[insts.length - 1].len - BASE : 0;

console.log(`\n=== SUMMARY ===\n`);
console.log(`  Total bytes: ${totalBytes}`);
console.log(`  Instructions: ${insts.length}`);
console.log(`  Function range: ${hex6(BASE)} - ${hex6(BASE + totalBytes - 1)}`);

console.log(`\n  RAM addresses referenced:`);
for (const addr of [...ramRefs].sort((a, b) => a - b)) {
  const label = knownRAM[addr] || '';
  console.log(`    ${hex6(addr)}${label ? ' -- ' + label : ''}`);
}

console.log(`\n  CALL targets:`);
for (const addr of [...callTargets].sort((a, b) => a - b)) {
  const label = knownCalls[addr] || '';
  console.log(`    ${hex6(addr)}${label ? ' -- ' + label : ''}`);
}

if (jpTargets.size > 0) {
  console.log(`\n  JP targets:`);
  for (const addr of [...jpTargets].sort((a, b) => a - b)) {
    const label = knownCalls[addr] || '';
    console.log(`    ${hex6(addr)}${label ? ' -- ' + label : ''}`);
  }
}

if (jrTargets.size > 0) {
  console.log(`\n  JR/DJNZ targets (internal branches):`);
  for (const addr of [...jrTargets].sort((a, b) => a - b)) {
    console.log(`    ${hex6(addr)}`);
  }
}

// IY-relative accesses
console.log(`\n  IY-relative accesses:`);
for (const inst of insts) {
  if (inst.mnem.includes('IY')) {
    console.log(`    ${inst.addr.toString(16).padStart(6, '0').toUpperCase()}: ${inst.mnem}`);
  }
}

console.log(`\n=== ARCHITECTURAL INTERPRETATION ===\n`);
console.log(`  Function: ${hex6(BASE)} -- Y-ADVANCE HELPER`);
console.log(`  Called by: 0x0A2013 (Y-advance wrapper)`);
console.log(`  Expected role: cursor row increment + scroll trigger`);
console.log(`  Key questions answered by disassembly:`);
console.log(`    - Does it write D0231D (cursor row)?`);
console.log(`    - Does it call 0x05ADxx (scroll module)?`);
console.log(`    - Does it call 0x06CBE5 (cursor Y conversion)?`);
console.log(`    - What conditions trigger scroll vs simple advance?`);
console.log(`\n=== DONE ===`);
