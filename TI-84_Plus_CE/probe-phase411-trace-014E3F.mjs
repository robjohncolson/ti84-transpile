#!/usr/bin/env node
// Phase 411: Static trace of 0x014E3F (notification state installer)
// Disassembles the function, finds all callers, and maps notification RAM references.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase411-trace-014E3F-report.md');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

// ── Helpers ──

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function dumpBytes(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    bytes.push(hexByte(buf[start + i]));
  }
  return bytes.join(' ');
}

// ── Section 1: Disassemble 0x014E3F ──

const FUNC_START = 0x014E3F;
const MAX_SCAN = 300;

// Simple eZ80 disassembler for the instructions we care about
function disassembleRange(start, maxBytes) {
  const lines = [];
  let pc = start;
  const end = Math.min(start + maxBytes, ROM_SIZE);
  let foundRet = false;

  while (pc < end) {
    const lineStart = pc;
    const b0 = rom[pc];
    let mnemonic = '';
    let annotation = '';
    let instrLen = 1;

    // Prefix handling
    if (b0 === 0xDD || b0 === 0xFD) {
      // IX/IY prefix - simplified handling
      const reg = b0 === 0xDD ? 'IX' : 'IY';
      const b1 = rom[pc + 1];

      if (b1 === 0x21 && pc + 5 < end) {
        // LD IX/IY,nn (4 bytes: prefix + 21 + 3-byte imm)
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD ${reg},${hex(nn)}`;
        instrLen = 5;
      } else if (b1 === 0xE5) {
        mnemonic = `PUSH ${reg}`;
        instrLen = 2;
      } else if (b1 === 0xE1) {
        mnemonic = `POP ${reg}`;
        instrLen = 2;
      } else if (b1 === 0x7E) {
        // LD A,(IX+d) / LD A,(IY+d)
        const d = rom[pc + 2];
        mnemonic = `LD A,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
        if (reg === 'IY') annotation = `; IY+${hex(d, 2)} flag read`;
      } else if (b1 === 0x77) {
        const d = rom[pc + 2];
        mnemonic = `LD (${reg}+${hex(d, 2)}),A`;
        instrLen = 3;
        if (reg === 'IY') annotation = `; IY+${hex(d, 2)} flag write`;
      } else if (b1 === 0x46) {
        const d = rom[pc + 2];
        mnemonic = `LD B,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x4E) {
        const d = rom[pc + 2];
        mnemonic = `LD C,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x56) {
        const d = rom[pc + 2];
        mnemonic = `LD D,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x5E) {
        const d = rom[pc + 2];
        mnemonic = `LD E,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x66) {
        const d = rom[pc + 2];
        mnemonic = `LD H,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x6E) {
        const d = rom[pc + 2];
        mnemonic = `LD L,(${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x70) {
        const d = rom[pc + 2];
        mnemonic = `LD (${reg}+${hex(d, 2)}),B`;
        instrLen = 3;
      } else if (b1 === 0x71) {
        const d = rom[pc + 2];
        mnemonic = `LD (${reg}+${hex(d, 2)}),C`;
        instrLen = 3;
      } else if (b1 === 0x72) {
        const d = rom[pc + 2];
        mnemonic = `LD (${reg}+${hex(d, 2)}),D`;
        instrLen = 3;
      } else if (b1 === 0x73) {
        const d = rom[pc + 2];
        mnemonic = `LD (${reg}+${hex(d, 2)}),E`;
        instrLen = 3;
      } else if (b1 === 0x36) {
        const d = rom[pc + 2];
        const n = rom[pc + 3];
        mnemonic = `LD (${reg}+${hex(d, 2)}),${hex(n, 2)}`;
        instrLen = 4;
      } else if (b1 === 0x2A && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD ${reg},(${hex(nn)})`;
        instrLen = 5;
        annotation = `; RAM read ${hex(nn)}`;
      } else if (b1 === 0x22 && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD (${hex(nn)}),${reg}`;
        instrLen = 5;
        annotation = `; RAM write ${hex(nn)}`;
      } else if (b1 === 0xCB) {
        // IX/IY CB prefix - BIT/SET/RES
        const d = rom[pc + 2];
        const op = rom[pc + 3];
        if (op >= 0x40 && op < 0x80) {
          const bit = (op >> 3) & 7;
          mnemonic = `BIT ${bit},(${reg}+${hex(d, 2)})`;
        } else if (op >= 0x80 && op < 0xC0) {
          const bit = (op >> 3) & 7;
          mnemonic = `RES ${bit},(${reg}+${hex(d, 2)})`;
        } else if (op >= 0xC0) {
          const bit = (op >> 3) & 7;
          mnemonic = `SET ${bit},(${reg}+${hex(d, 2)})`;
        } else {
          mnemonic = `${reg} CB ${hexByte(d)} ${hexByte(op)}`;
        }
        instrLen = 4;
      } else if (b1 === 0x23) {
        mnemonic = `INC ${reg}`;
        instrLen = 2;
      } else if (b1 === 0x2B) {
        mnemonic = `DEC ${reg}`;
        instrLen = 2;
      } else if (b1 === 0x09) {
        mnemonic = `ADD ${reg},BC`;
        instrLen = 2;
      } else if (b1 === 0x19) {
        mnemonic = `ADD ${reg},DE`;
        instrLen = 2;
      } else if (b1 === 0x29) {
        mnemonic = `ADD ${reg},${reg}`;
        instrLen = 2;
      } else if (b1 === 0x39) {
        mnemonic = `ADD ${reg},SP`;
        instrLen = 2;
      } else if (b1 === 0xBE) {
        const d = rom[pc + 2];
        mnemonic = `CP (${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0xB6) {
        const d = rom[pc + 2];
        mnemonic = `OR (${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0xA6) {
        const d = rom[pc + 2];
        mnemonic = `AND (${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else if (b1 === 0xAE) {
        const d = rom[pc + 2];
        mnemonic = `XOR (${reg}+${hex(d, 2)})`;
        instrLen = 3;
      } else {
        mnemonic = `${reg}-prefix ${hexByte(b1)}`;
        instrLen = 2;
      }
    } else if (b0 === 0xED) {
      const b1 = rom[pc + 1];
      if (b1 === 0x38) {
        // IN0 A,(n)
        const port = rom[pc + 2];
        mnemonic = `IN0 A,(${hex(port, 2)})`;
        instrLen = 3;
        annotation = `; port ${hex(port, 2)} read`;
      } else if (b1 === 0x39) {
        // OUT0 (n),A
        const port = rom[pc + 2];
        mnemonic = `OUT0 (${hex(port, 2)}),A`;
        instrLen = 3;
        annotation = `; port ${hex(port, 2)} write`;
      } else if (b1 === 0x00) {
        // IN0 B,(n)
        const port = rom[pc + 2];
        mnemonic = `IN0 B,(${hex(port, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x08) {
        // IN0 C,(n)
        const port = rom[pc + 2];
        mnemonic = `IN0 C,(${hex(port, 2)})`;
        instrLen = 3;
      } else if (b1 === 0x4B && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD BC,(${hex(nn)})`;
        instrLen = 5;
        annotation = `; RAM read ${hex(nn)}`;
      } else if (b1 === 0x43 && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD (${hex(nn)}),BC`;
        instrLen = 5;
        annotation = `; RAM write ${hex(nn)}`;
      } else if (b1 === 0x5B && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD DE,(${hex(nn)})`;
        instrLen = 5;
        annotation = `; RAM read ${hex(nn)}`;
      } else if (b1 === 0x53 && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD (${hex(nn)}),DE`;
        instrLen = 5;
        annotation = `; RAM write ${hex(nn)}`;
      } else if (b1 === 0x6B && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD HL,(${hex(nn)})`;
        instrLen = 5;
        annotation = `; RAM read ${hex(nn)}`;
      } else if (b1 === 0x63 && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD (${hex(nn)}),HL`;
        instrLen = 5;
        annotation = `; RAM write ${hex(nn)}`;
      } else if (b1 === 0x7B && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD SP,(${hex(nn)})`;
        instrLen = 5;
        annotation = `; RAM read ${hex(nn)}`;
      } else if (b1 === 0x73 && pc + 5 < end) {
        const nn = read24LE(rom, pc + 2);
        mnemonic = `LD (${hex(nn)}),SP`;
        instrLen = 5;
        annotation = `; RAM write ${hex(nn)}`;
      } else if (b1 === 0xB0) {
        mnemonic = 'LDIR';
        instrLen = 2;
      } else if (b1 === 0xB8) {
        mnemonic = 'LDDR';
        instrLen = 2;
      } else if (b1 === 0xA0) {
        mnemonic = 'LDI';
        instrLen = 2;
      } else if (b1 === 0xA8) {
        mnemonic = 'LDD';
        instrLen = 2;
      } else if (b1 === 0xB1) {
        mnemonic = 'CPIR';
        instrLen = 2;
      } else if (b1 === 0xB9) {
        mnemonic = 'CPDR';
        instrLen = 2;
      } else if (b1 === 0x44) {
        mnemonic = 'NEG';
        instrLen = 2;
      } else if (b1 === 0x4D) {
        mnemonic = 'RETI';
        instrLen = 2;
        foundRet = true;
      } else if (b1 === 0x45) {
        mnemonic = 'RETN';
        instrLen = 2;
        foundRet = true;
      } else if (b1 === 0x46) {
        mnemonic = 'IM 0';
        instrLen = 2;
      } else if (b1 === 0x56) {
        mnemonic = 'IM 1';
        instrLen = 2;
      } else if (b1 === 0x5E) {
        mnemonic = 'IM 2';
        instrLen = 2;
      } else {
        mnemonic = `ED ${hexByte(b1)}`;
        instrLen = 2;
      }
    } else if (b0 === 0xCB) {
      const b1 = rom[pc + 1];
      if (b1 >= 0x40 && b1 < 0x80) {
        const bit = (b1 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `BIT ${bit},${regNames[b1 & 7]}`;
      } else if (b1 >= 0x80 && b1 < 0xC0) {
        const bit = (b1 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `RES ${bit},${regNames[b1 & 7]}`;
      } else if (b1 >= 0xC0) {
        const bit = (b1 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `SET ${bit},${regNames[b1 & 7]}`;
      } else {
        mnemonic = `CB ${hexByte(b1)}`;
      }
      instrLen = 2;
    } else {
      // Main unprefixed opcodes
      switch (b0) {
        case 0x00: mnemonic = 'NOP'; break;
        case 0x01: { const nn = read24LE(rom, pc + 1); mnemonic = `LD BC,${hex(nn)}`; instrLen = 4; break; }
        case 0x02: mnemonic = 'LD (BC),A'; break;
        case 0x03: mnemonic = 'INC BC'; break;
        case 0x04: mnemonic = 'INC B'; break;
        case 0x05: mnemonic = 'DEC B'; break;
        case 0x06: mnemonic = `LD B,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x07: mnemonic = 'RLCA'; break;
        case 0x08: mnemonic = "EX AF,AF'"; break;
        case 0x09: mnemonic = 'ADD HL,BC'; break;
        case 0x0A: mnemonic = 'LD A,(BC)'; break;
        case 0x0B: mnemonic = 'DEC BC'; break;
        case 0x0C: mnemonic = 'INC C'; break;
        case 0x0D: mnemonic = 'DEC C'; break;
        case 0x0E: mnemonic = `LD C,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x0F: mnemonic = 'RRCA'; break;
        case 0x10: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `DJNZ ${hex(t)}`; instrLen = 2; annotation = '; loop'; break; }
        case 0x11: { const nn = read24LE(rom, pc + 1); mnemonic = `LD DE,${hex(nn)}`; instrLen = 4; break; }
        case 0x12: mnemonic = 'LD (DE),A'; break;
        case 0x13: mnemonic = 'INC DE'; break;
        case 0x14: mnemonic = 'INC D'; break;
        case 0x15: mnemonic = 'DEC D'; break;
        case 0x16: mnemonic = `LD D,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x17: mnemonic = 'RLA'; break;
        case 0x18: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `JR ${hex(t)}`; instrLen = 2; annotation = '; unconditional jump'; break; }
        case 0x19: mnemonic = 'ADD HL,DE'; break;
        case 0x1A: mnemonic = 'LD A,(DE)'; break;
        case 0x1B: mnemonic = 'DEC DE'; break;
        case 0x1C: mnemonic = 'INC E'; break;
        case 0x1D: mnemonic = 'DEC E'; break;
        case 0x1E: mnemonic = `LD E,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x1F: mnemonic = 'RRA'; break;
        case 0x20: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `JR NZ,${hex(t)}`; instrLen = 2; annotation = '; branch if not zero'; break; }
        case 0x21: { const nn = read24LE(rom, pc + 1); mnemonic = `LD HL,${hex(nn)}`; instrLen = 4; break; }
        case 0x22: { const nn = read24LE(rom, pc + 1); mnemonic = `LD (${hex(nn)}),HL`; instrLen = 4; annotation = `; RAM write ${hex(nn)}`; break; }
        case 0x23: mnemonic = 'INC HL'; break;
        case 0x24: mnemonic = 'INC H'; break;
        case 0x25: mnemonic = 'DEC H'; break;
        case 0x26: mnemonic = `LD H,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x27: mnemonic = 'DAA'; break;
        case 0x28: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `JR Z,${hex(t)}`; instrLen = 2; annotation = '; branch if zero'; break; }
        case 0x29: mnemonic = 'ADD HL,HL'; break;
        case 0x2A: { const nn = read24LE(rom, pc + 1); mnemonic = `LD HL,(${hex(nn)})`; instrLen = 4; annotation = `; RAM read ${hex(nn)}`; break; }
        case 0x2B: mnemonic = 'DEC HL'; break;
        case 0x2C: mnemonic = 'INC L'; break;
        case 0x2D: mnemonic = 'DEC L'; break;
        case 0x2E: mnemonic = `LD L,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x2F: mnemonic = 'CPL'; break;
        case 0x30: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `JR NC,${hex(t)}`; instrLen = 2; annotation = '; branch if no carry'; break; }
        case 0x31: { const nn = read24LE(rom, pc + 1); mnemonic = `LD SP,${hex(nn)}`; instrLen = 4; break; }
        case 0x32: { const nn = read24LE(rom, pc + 1); mnemonic = `LD (${hex(nn)}),A`; instrLen = 4; annotation = `; RAM write ${hex(nn)}`; break; }
        case 0x33: mnemonic = 'INC SP'; break;
        case 0x34: mnemonic = 'INC (HL)'; break;
        case 0x35: mnemonic = 'DEC (HL)'; break;
        case 0x36: mnemonic = `LD (HL),${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x37: mnemonic = 'SCF'; break;
        case 0x38: { const d = rom[pc + 1]; const t = pc + 2 + ((d & 0x80) ? d - 256 : d); mnemonic = `JR C,${hex(t)}`; instrLen = 2; annotation = '; branch if carry'; break; }
        case 0x39: mnemonic = 'ADD HL,SP'; break;
        case 0x3A: { const nn = read24LE(rom, pc + 1); mnemonic = `LD A,(${hex(nn)})`; instrLen = 4; annotation = `; RAM read ${hex(nn)}`; break; }
        case 0x3B: mnemonic = 'DEC SP'; break;
        case 0x3C: mnemonic = 'INC A'; break;
        case 0x3D: mnemonic = 'DEC A'; break;
        case 0x3E: mnemonic = `LD A,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0x3F: mnemonic = 'CCF'; break;
        // LD r,r block (0x40-0x7F)
        case 0x76: mnemonic = 'HALT'; break;
        case 0x77: mnemonic = 'LD (HL),A'; break;
        case 0x78: mnemonic = 'LD A,B'; break;
        case 0x79: mnemonic = 'LD A,C'; break;
        case 0x7A: mnemonic = 'LD A,D'; break;
        case 0x7B: mnemonic = 'LD A,E'; break;
        case 0x7C: mnemonic = 'LD A,H'; break;
        case 0x7D: mnemonic = 'LD A,L'; break;
        case 0x7E: mnemonic = 'LD A,(HL)'; break;
        case 0x7F: mnemonic = 'LD A,A'; break;
        case 0x40: mnemonic = 'LD B,B'; break;
        case 0x41: mnemonic = 'LD B,C'; break;
        case 0x42: mnemonic = 'LD B,D'; break;
        case 0x43: mnemonic = 'LD B,E'; break;
        case 0x44: mnemonic = 'LD B,H'; break;
        case 0x45: mnemonic = 'LD B,L'; break;
        case 0x46: mnemonic = 'LD B,(HL)'; break;
        case 0x47: mnemonic = 'LD B,A'; break;
        case 0x48: mnemonic = 'LD C,B'; break;
        case 0x49: mnemonic = 'LD C,C'; break;
        case 0x4A: mnemonic = 'LD C,D'; break;
        case 0x4B: mnemonic = 'LD C,E'; break;
        case 0x4C: mnemonic = 'LD C,H'; break;
        case 0x4D: mnemonic = 'LD C,L'; break;
        case 0x4E: mnemonic = 'LD C,(HL)'; break;
        case 0x4F: mnemonic = 'LD C,A'; break;
        case 0x50: mnemonic = 'LD D,B'; break;
        case 0x51: mnemonic = 'LD D,C'; break;
        case 0x52: mnemonic = 'LD D,D'; break;
        case 0x53: mnemonic = 'LD D,E'; break;
        case 0x54: mnemonic = 'LD D,H'; break;
        case 0x55: mnemonic = 'LD D,L'; break;
        case 0x56: mnemonic = 'LD D,(HL)'; break;
        case 0x57: mnemonic = 'LD D,A'; break;
        case 0x58: mnemonic = 'LD E,B'; break;
        case 0x59: mnemonic = 'LD E,C'; break;
        case 0x5A: mnemonic = 'LD E,D'; break;
        case 0x5B: mnemonic = 'LD E,E'; break;
        case 0x5C: mnemonic = 'LD E,H'; break;
        case 0x5D: mnemonic = 'LD E,L'; break;
        case 0x5E: mnemonic = 'LD E,(HL)'; break;
        case 0x5F: mnemonic = 'LD E,A'; break;
        case 0x60: mnemonic = 'LD H,B'; break;
        case 0x61: mnemonic = 'LD H,C'; break;
        case 0x62: mnemonic = 'LD H,D'; break;
        case 0x63: mnemonic = 'LD H,E'; break;
        case 0x64: mnemonic = 'LD H,H'; break;
        case 0x65: mnemonic = 'LD H,L'; break;
        case 0x66: mnemonic = 'LD H,(HL)'; break;
        case 0x67: mnemonic = 'LD H,A'; break;
        case 0x68: mnemonic = 'LD L,B'; break;
        case 0x69: mnemonic = 'LD L,C'; break;
        case 0x6A: mnemonic = 'LD L,D'; break;
        case 0x6B: mnemonic = 'LD L,E'; break;
        case 0x6C: mnemonic = 'LD L,H'; break;
        case 0x6D: mnemonic = 'LD L,L'; break;
        case 0x6E: mnemonic = 'LD L,(HL)'; break;
        case 0x6F: mnemonic = 'LD L,A'; break;
        case 0x70: mnemonic = 'LD (HL),B'; break;
        case 0x71: mnemonic = 'LD (HL),C'; break;
        case 0x72: mnemonic = 'LD (HL),D'; break;
        case 0x73: mnemonic = 'LD (HL),E'; break;
        case 0x74: mnemonic = 'LD (HL),H'; break;
        case 0x75: mnemonic = 'LD (HL),L'; break;
        // ALU ops
        case 0x80: mnemonic = 'ADD A,B'; break;
        case 0x81: mnemonic = 'ADD A,C'; break;
        case 0x82: mnemonic = 'ADD A,D'; break;
        case 0x83: mnemonic = 'ADD A,E'; break;
        case 0x84: mnemonic = 'ADD A,H'; break;
        case 0x85: mnemonic = 'ADD A,L'; break;
        case 0x86: mnemonic = 'ADD A,(HL)'; break;
        case 0x87: mnemonic = 'ADD A,A'; break;
        case 0x88: mnemonic = 'ADC A,B'; break;
        case 0x89: mnemonic = 'ADC A,C'; break;
        case 0x8A: mnemonic = 'ADC A,D'; break;
        case 0x8B: mnemonic = 'ADC A,E'; break;
        case 0x8C: mnemonic = 'ADC A,H'; break;
        case 0x8D: mnemonic = 'ADC A,L'; break;
        case 0x8E: mnemonic = 'ADC A,(HL)'; break;
        case 0x8F: mnemonic = 'ADC A,A'; break;
        case 0x90: mnemonic = 'SUB B'; break;
        case 0x91: mnemonic = 'SUB C'; break;
        case 0x92: mnemonic = 'SUB D'; break;
        case 0x93: mnemonic = 'SUB E'; break;
        case 0x94: mnemonic = 'SUB H'; break;
        case 0x95: mnemonic = 'SUB L'; break;
        case 0x96: mnemonic = 'SUB (HL)'; break;
        case 0x97: mnemonic = 'SUB A'; break;
        case 0x98: mnemonic = 'SBC A,B'; break;
        case 0x99: mnemonic = 'SBC A,C'; break;
        case 0x9A: mnemonic = 'SBC A,D'; break;
        case 0x9B: mnemonic = 'SBC A,E'; break;
        case 0x9C: mnemonic = 'SBC A,H'; break;
        case 0x9D: mnemonic = 'SBC A,L'; break;
        case 0x9E: mnemonic = 'SBC A,(HL)'; break;
        case 0x9F: mnemonic = 'SBC A,A'; break;
        case 0xA0: mnemonic = 'AND B'; break;
        case 0xA1: mnemonic = 'AND C'; break;
        case 0xA2: mnemonic = 'AND D'; break;
        case 0xA3: mnemonic = 'AND E'; break;
        case 0xA4: mnemonic = 'AND H'; break;
        case 0xA5: mnemonic = 'AND L'; break;
        case 0xA6: mnemonic = 'AND (HL)'; break;
        case 0xA7: mnemonic = 'AND A'; break;
        case 0xA8: mnemonic = 'XOR B'; break;
        case 0xA9: mnemonic = 'XOR C'; break;
        case 0xAA: mnemonic = 'XOR D'; break;
        case 0xAB: mnemonic = 'XOR E'; break;
        case 0xAC: mnemonic = 'XOR H'; break;
        case 0xAD: mnemonic = 'XOR L'; break;
        case 0xAE: mnemonic = 'XOR (HL)'; break;
        case 0xAF: mnemonic = 'XOR A'; break;
        case 0xB0: mnemonic = 'OR B'; break;
        case 0xB1: mnemonic = 'OR C'; break;
        case 0xB2: mnemonic = 'OR D'; break;
        case 0xB3: mnemonic = 'OR E'; break;
        case 0xB4: mnemonic = 'OR H'; break;
        case 0xB5: mnemonic = 'OR L'; break;
        case 0xB6: mnemonic = 'OR (HL)'; break;
        case 0xB7: mnemonic = 'OR A'; break;
        case 0xB8: mnemonic = 'CP B'; break;
        case 0xB9: mnemonic = 'CP C'; break;
        case 0xBA: mnemonic = 'CP D'; break;
        case 0xBB: mnemonic = 'CP E'; break;
        case 0xBC: mnemonic = 'CP H'; break;
        case 0xBD: mnemonic = 'CP L'; break;
        case 0xBE: mnemonic = 'CP (HL)'; break;
        case 0xBF: mnemonic = 'CP A'; break;
        // Control flow
        case 0xC0: mnemonic = 'RET NZ'; annotation = '; conditional return'; break;
        case 0xC1: mnemonic = 'POP BC'; break;
        case 0xC2: { const nn = read24LE(rom, pc + 1); mnemonic = `JP NZ,${hex(nn)}`; instrLen = 4; annotation = '; branch if not zero'; break; }
        case 0xC3: { const nn = read24LE(rom, pc + 1); mnemonic = `JP ${hex(nn)}`; instrLen = 4; annotation = '; unconditional jump'; break; }
        case 0xC4: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL NZ,${hex(nn)}`; instrLen = 4; annotation = `; conditional call ${hex(nn)}`; break; }
        case 0xC5: mnemonic = 'PUSH BC'; break;
        case 0xC6: mnemonic = `ADD A,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xC7: mnemonic = 'RST 00h'; break;
        case 0xC8: mnemonic = 'RET Z'; annotation = '; conditional return'; break;
        case 0xC9: mnemonic = 'RET'; foundRet = true; break;
        case 0xCA: { const nn = read24LE(rom, pc + 1); mnemonic = `JP Z,${hex(nn)}`; instrLen = 4; annotation = '; branch if zero'; break; }
        case 0xCC: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL Z,${hex(nn)}`; instrLen = 4; annotation = `; conditional call ${hex(nn)}`; break; }
        case 0xCD: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL ${hex(nn)}`; instrLen = 4; annotation = `; call ${hex(nn)}`; break; }
        case 0xCE: mnemonic = `ADC A,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xCF: mnemonic = 'RST 08h'; break;
        case 0xD0: mnemonic = 'RET NC'; annotation = '; conditional return'; break;
        case 0xD1: mnemonic = 'POP DE'; break;
        case 0xD2: { const nn = read24LE(rom, pc + 1); mnemonic = `JP NC,${hex(nn)}`; instrLen = 4; annotation = '; branch if no carry'; break; }
        case 0xD3: mnemonic = `OUT (${hex(rom[pc + 1], 2)}),A`; instrLen = 2; break;
        case 0xD4: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL NC,${hex(nn)}`; instrLen = 4; break; }
        case 0xD5: mnemonic = 'PUSH DE'; break;
        case 0xD6: mnemonic = `SUB ${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xD7: mnemonic = 'RST 10h'; break;
        case 0xD8: mnemonic = 'RET C'; annotation = '; conditional return'; break;
        case 0xD9: mnemonic = 'EXX'; break;
        case 0xDA: { const nn = read24LE(rom, pc + 1); mnemonic = `JP C,${hex(nn)}`; instrLen = 4; annotation = '; branch if carry'; break; }
        case 0xDB: mnemonic = `IN A,(${hex(rom[pc + 1], 2)})`; instrLen = 2; break;
        case 0xDC: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL C,${hex(nn)}`; instrLen = 4; break; }
        case 0xDE: mnemonic = `SBC A,${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xDF: mnemonic = 'RST 18h'; break;
        case 0xE0: mnemonic = 'RET PO'; annotation = '; conditional return'; break;
        case 0xE1: mnemonic = 'POP HL'; break;
        case 0xE2: { const nn = read24LE(rom, pc + 1); mnemonic = `JP PO,${hex(nn)}`; instrLen = 4; break; }
        case 0xE3: mnemonic = 'EX (SP),HL'; break;
        case 0xE4: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL PO,${hex(nn)}`; instrLen = 4; break; }
        case 0xE5: mnemonic = 'PUSH HL'; break;
        case 0xE6: mnemonic = `AND ${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xE7: mnemonic = 'RST 20h'; break;
        case 0xE8: mnemonic = 'RET PE'; annotation = '; conditional return'; break;
        case 0xE9: mnemonic = 'JP (HL)'; annotation = '; indirect jump'; break;
        case 0xEA: { const nn = read24LE(rom, pc + 1); mnemonic = `JP PE,${hex(nn)}`; instrLen = 4; break; }
        case 0xEB: mnemonic = 'EX DE,HL'; break;
        case 0xEC: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL PE,${hex(nn)}`; instrLen = 4; break; }
        case 0xEE: mnemonic = `XOR ${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xEF: mnemonic = 'RST 28h'; break;
        case 0xF0: mnemonic = 'RET P'; annotation = '; conditional return'; break;
        case 0xF1: mnemonic = 'POP AF'; break;
        case 0xF2: { const nn = read24LE(rom, pc + 1); mnemonic = `JP P,${hex(nn)}`; instrLen = 4; break; }
        case 0xF3: mnemonic = 'DI'; break;
        case 0xF4: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL P,${hex(nn)}`; instrLen = 4; break; }
        case 0xF5: mnemonic = 'PUSH AF'; break;
        case 0xF6: mnemonic = `OR ${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xF7: mnemonic = 'RST 30h'; break;
        case 0xF8: mnemonic = 'RET M'; annotation = '; conditional return'; break;
        case 0xF9: mnemonic = 'LD SP,HL'; break;
        case 0xFA: { const nn = read24LE(rom, pc + 1); mnemonic = `JP M,${hex(nn)}`; instrLen = 4; break; }
        case 0xFB: mnemonic = 'EI'; break;
        case 0xFC: { const nn = read24LE(rom, pc + 1); mnemonic = `CALL M,${hex(nn)}`; instrLen = 4; break; }
        case 0xFE: mnemonic = `CP ${hex(rom[pc + 1], 2)}`; instrLen = 2; break;
        case 0xFF: mnemonic = 'RST 38h'; break;
        default: mnemonic = `DB ${hexByte(b0)}`; break;
      }
    }

    const rawBytes = dumpBytes(rom, lineStart, instrLen);
    lines.push({
      addr: lineStart,
      rawBytes,
      mnemonic,
      annotation,
      len: instrLen,
    });

    pc += instrLen;
    if (foundRet) break;
  }

  return { lines, foundRet, endAddr: pc };
}

// ── Section 2: Find callers of 0x014E3F ──

function findCallers(targetAddr) {
  // Search for CALL nn (CD xx xx xx) and JP nn (C3 xx xx xx)
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const results = [];
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const contextStart = Math.max(0, i - 5);
      const contextEnd = Math.min(ROM_SIZE, i + 10);
      results.push({
        addr: i,
        type: opcode === 0xCD ? 'CALL' : 'JP',
        context: dumpBytes(rom, contextStart, contextEnd - contextStart),
        contextStart,
      });
    }
    // Also check conditional calls/jumps
    if ((opcode === 0xC4 || opcode === 0xCC || opcode === 0xD4 || opcode === 0xDC ||
         opcode === 0xE4 || opcode === 0xEC || opcode === 0xF4 || opcode === 0xFC ||
         opcode === 0xC2 || opcode === 0xCA || opcode === 0xD2 || opcode === 0xDA ||
         opcode === 0xE2 || opcode === 0xEA || opcode === 0xF2 || opcode === 0xFA) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const condNames = {
        0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C',
        0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M',
        0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
        0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M',
      };
      const contextStart = Math.max(0, i - 5);
      const contextEnd = Math.min(ROM_SIZE, i + 10);
      results.push({
        addr: i,
        type: condNames[opcode] || `?${hexByte(opcode)}`,
        context: dumpBytes(rom, contextStart, contextEnd - contextStart),
        contextStart,
      });
    }
  }
  return results;
}

// ── Section 3: RAM address reference scanner ──

function scanRAMReferences(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  // Opcodes that read from (nn): 3A=LD A,(nn), 2A=LD HL,(nn)
  // ED prefix reads: ED 4B=LD BC,(nn), ED 5B=LD DE,(nn), ED 6B=LD HL,(nn), ED 7B=LD SP,(nn)
  // Opcodes that write to (nn): 32=LD (nn),A, 22=LD (nn),HL
  // ED prefix writes: ED 43=LD (nn),BC, ED 53=LD (nn),DE, ED 63=LD (nn),HL, ED 73=LD (nn),SP

  const readers = [];
  const writers = [];

  for (let i = 0; i < ROM_SIZE - 3; i++) {
    const b = rom[i];

    // Unprefixed 4-byte instructions: opcode + 3-byte addr
    if ((b === 0x3A || b === 0x2A) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const label = b === 0x3A ? 'LD A,(nn)' : 'LD HL,(nn)';
      readers.push({ addr: i, label });
    }
    if ((b === 0x32 || b === 0x22) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const label = b === 0x32 ? 'LD (nn),A' : 'LD (nn),HL';
      writers.push({ addr: i, label });
    }

    // ED-prefixed 5-byte: ED + subop + 3-byte addr
    if (b === 0xED && i + 4 < ROM_SIZE) {
      const sub = rom[i + 1];
      if (rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        if (sub === 0x4B || sub === 0x5B || sub === 0x6B || sub === 0x7B) {
          const regNames = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
          readers.push({ addr: i, label: `LD ${regNames[sub]},(nn)` });
        }
        if (sub === 0x43 || sub === 0x53 || sub === 0x63 || sub === 0x73) {
          const regNames = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
          writers.push({ addr: i, label: `LD (nn),${regNames[sub]}` });
        }
      }
    }

    // IX/IY prefixed: DD/FD 2A = LD IX/IY,(nn), DD/FD 22 = LD (nn),IX/IY
    if ((b === 0xDD || b === 0xFD) && i + 4 < ROM_SIZE) {
      const sub = rom[i + 1];
      const reg = b === 0xDD ? 'IX' : 'IY';
      if (sub === 0x2A && rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        readers.push({ addr: i, label: `LD ${reg},(nn)` });
      }
      if (sub === 0x22 && rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        writers.push({ addr: i, label: `LD (nn),${reg}` });
      }
    }
  }

  return { readers, writers };
}

// ── Main ──

console.log('Phase 411: Tracing 0x014E3F (notification state installer)');
console.log('='.repeat(60));

// 1. Disassemble the function
console.log('\n## Section 1: Disassembly of 0x014E3F\n');
const disasm = disassembleRange(FUNC_START, MAX_SCAN);

const disasmLines = [];
for (const line of disasm.lines) {
  const s = `${hex(line.addr)}:  ${line.rawBytes.padEnd(20)}  ${line.mnemonic.padEnd(30)} ${line.annotation}`;
  console.log(s);
  disasmLines.push(s);
}
console.log(`\nFunction ends at ${hex(disasm.endAddr)}, RET found: ${disasm.foundRet}`);
console.log(`Function size: ${disasm.endAddr - FUNC_START} bytes`);

// Collect interesting things from disassembly
const ramAccesses = [];
const callTargets = [];
const portIO = [];
const branches = [];

for (const line of disasm.lines) {
  if (line.annotation.includes('RAM read') || line.annotation.includes('RAM write')) {
    ramAccesses.push({ addr: line.addr, mnemonic: line.mnemonic, annotation: line.annotation });
  }
  if (line.mnemonic.startsWith('CALL ') || line.mnemonic.startsWith('CALL N') ||
      line.mnemonic.startsWith('CALL Z') || line.mnemonic.startsWith('CALL C') ||
      line.mnemonic.startsWith('CALL P')) {
    callTargets.push({ addr: line.addr, mnemonic: line.mnemonic });
  }
  if (line.annotation.includes('port')) {
    portIO.push({ addr: line.addr, mnemonic: line.mnemonic, annotation: line.annotation });
  }
  if (line.annotation.includes('branch') || line.annotation.includes('conditional') ||
      line.annotation.includes('jump') || line.annotation.includes('loop')) {
    branches.push({ addr: line.addr, mnemonic: line.mnemonic, annotation: line.annotation });
  }
}

console.log('\n### RAM accesses within function:');
for (const r of ramAccesses) console.log(`  ${hex(r.addr)}: ${r.mnemonic} ${r.annotation}`);
if (ramAccesses.length === 0) console.log('  (none - all via register-indirect)');

console.log('\n### CALL targets:');
for (const c of callTargets) console.log(`  ${hex(c.addr)}: ${c.mnemonic}`);
if (callTargets.length === 0) console.log('  (none)');

console.log('\n### Port I/O:');
for (const p of portIO) console.log(`  ${hex(p.addr)}: ${p.mnemonic} ${p.annotation}`);
if (portIO.length === 0) console.log('  (none)');

console.log('\n### Branches:');
for (const b of branches) console.log(`  ${hex(b.addr)}: ${b.mnemonic} ${b.annotation}`);
if (branches.length === 0) console.log('  (none)');

// 2. Find all callers
console.log('\n' + '='.repeat(60));
console.log('\n## Section 2: Callers of 0x014E3F\n');
const callers = findCallers(0x014E3F);
console.log(`Found ${callers.length} call/jump sites:\n`);
for (const c of callers) {
  console.log(`  ${hex(c.addr)}: ${c.type} 0x014E3F`);
  console.log(`    context (${hex(c.contextStart)}): ${c.context}`);
}

// 3. Scan notification RAM addresses
console.log('\n' + '='.repeat(60));
console.log('\n## Section 3: Notification RAM Reference Map\n');

const RAM_TARGETS = [
  { label: 'D14073 (enabled flag)', addr: 0xD14073 },
  { label: 'D14084 (busy flag)', addr: 0xD14084 },
  { label: 'D1440E (lock)', addr: 0xD1440E },
  { label: 'D1440F (delivery status)', addr: 0xD1440F },
  { label: 'D14408 (block pointer)', addr: 0xD14408 },
  { label: 'D1440B', addr: 0xD1440B },
  { label: 'D14410 (callback param)', addr: 0xD14410 },
  { label: 'D177B7 (sentinel 0x55)', addr: 0xD177B7 },
];

const ramResults = [];

for (const target of RAM_TARGETS) {
  console.log(`\n### ${target.label} (${hex(target.addr)})`);
  const refs = scanRAMReferences(target.addr);

  console.log(`  Readers: ${refs.readers.length}, Writers: ${refs.writers.length}`);

  const allRefs = [
    ...refs.readers.map(r => ({ ...r, type: 'R' })),
    ...refs.writers.map(w => ({ ...w, type: 'W' })),
  ].sort((a, b) => a.addr - b.addr);

  // Show top 5
  const top5 = allRefs.slice(0, 5);
  for (const r of top5) {
    const contextStart = Math.max(0, r.addr - 3);
    const contextEnd = Math.min(ROM_SIZE, r.addr + 8);
    const context = dumpBytes(rom, contextStart, contextEnd - contextStart);
    console.log(`  [${r.type}] ${hex(r.addr)}: ${r.label}  context: ${context}`);
  }
  if (allRefs.length > 5) {
    console.log(`  ... and ${allRefs.length - 5} more`);
  }

  ramResults.push({
    ...target,
    readers: refs.readers.length,
    writers: refs.writers.length,
    topRefs: allRefs.slice(0, 5).map(r => ({
      addr: r.addr,
      type: r.type,
      label: r.label,
      context: dumpBytes(rom, Math.max(0, r.addr - 3), Math.min(ROM_SIZE, r.addr + 8) - Math.max(0, r.addr - 3)),
    })),
    allRefs,
  });
}

// ── Generate Report ──

let report = `# Phase 411: Trace of 0x014E3F (Notification State Installer)

**Date**: ${new Date().toISOString().slice(0, 10)}
**Target**: 0x014E3F — notification state installation routine
**Known from session 410**: Called by 0x00F636 during notification delivery. Saves state to D14408/D1440B, sets lock D1440E=1.

---

## 1. Disassembly of 0x014E3F

Function spans ${hex(FUNC_START)} to ${hex(disasm.endAddr)} (${disasm.endAddr - FUNC_START} bytes). RET found: ${disasm.foundRet}.

\`\`\`
`;

for (const line of disasm.lines) {
  report += `${hex(line.addr)}:  ${line.rawBytes.padEnd(20)}  ${line.mnemonic.padEnd(30)} ${line.annotation}\n`;
}

report += `\`\`\`

### RAM Accesses (direct absolute addressing)

| Address | Instruction | Access |
|---------|-------------|--------|
`;
for (const r of ramAccesses) {
  const rw = r.annotation.includes('write') ? 'WRITE' : 'READ';
  report += `| ${hex(r.addr)} | \`${r.mnemonic}\` | ${rw} |\n`;
}
if (ramAccesses.length === 0) report += '| (none) | All via register-indirect | - |\n';

report += `
### CALL Targets

| Site | Target |
|------|--------|
`;
for (const c of callTargets) {
  report += `| ${hex(c.addr)} | \`${c.mnemonic}\` |\n`;
}
if (callTargets.length === 0) report += '| (none) | - |\n';

report += `
### Port I/O

| Site | Instruction |
|------|-------------|
`;
for (const p of portIO) {
  report += `| ${hex(p.addr)} | \`${p.mnemonic}\` |\n`;
}
if (portIO.length === 0) report += '| (none) | - |\n';

report += `
### Branch Structure

| Site | Instruction | Note |
|------|-------------|------|
`;
for (const b of branches) {
  report += `| ${hex(b.addr)} | \`${b.mnemonic}\` | ${b.annotation.replace(';', '').trim()} |\n`;
}
if (branches.length === 0) report += '| (none) | - | - |\n';

report += `
---

## 2. Callers of 0x014E3F

Found **${callers.length}** reference(s) in the ROM.

| Address | Type | Surrounding Bytes |
|---------|------|-------------------|
`;
for (const c of callers) {
  report += `| ${hex(c.addr)} | ${c.type} | \`${c.context}\` |\n`;
}

report += `
---

## 3. Notification RAM Reference Map

| RAM Address | Label | Readers | Writers | Total |
|-------------|-------|---------|---------|-------|
`;
for (const r of ramResults) {
  report += `| ${hex(r.addr)} | ${r.label} | ${r.readers} | ${r.writers} | ${r.readers + r.writers} |\n`;
}

report += `\n### Top References per Address\n`;

for (const r of ramResults) {
  report += `\n#### ${r.label} (${hex(r.addr)}) — ${r.readers}R / ${r.writers}W\n\n`;
  report += `| Type | Site | Opcode | Context |\n`;
  report += `|------|------|--------|---------|\n`;
  for (const ref of r.topRefs) {
    report += `| ${ref.type} | ${hex(ref.addr)} | ${ref.label} | \`${ref.context}\` |\n`;
  }
  if (r.allRefs.length > 5) {
    report += `\n*${r.allRefs.length - 5} additional references omitted.*\n`;
  }
}

// Cross-reference summary
report += `
---

## 4. Cross-Reference Summary

### Known Function Calls From 0x014E3F
`;
for (const c of callTargets) {
  const target = c.mnemonic.match(/0x[0-9a-f]+/i);
  if (target) {
    const tAddr = parseInt(target[0], 16);
    const knownFuncs = {
      0x002197: 'stack frame allocator',
      0x0021C2: 'null-pointer guard',
      0x006EAF: 'hardware readiness check',
      0x001713: 'system check',
    };
    const name = knownFuncs[tAddr] || 'unknown';
    report += `- ${hex(tAddr)}: ${name}\n`;
  }
}

report += `
### Notification Subsystem Access Hotspots

The most-referenced RAM addresses (by total read+write count):
`;

const sorted = [...ramResults].sort((a, b) => (b.readers + b.writers) - (a.readers + a.writers));
for (const r of sorted) {
  report += `1. **${hex(r.addr)}** (${r.label}): ${r.readers}R + ${r.writers}W = ${r.readers + r.writers} total\n`;
}

report += `
---

*Generated by probe-phase411-trace-014E3F.mjs*
`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`\n\nReport written to ${REPORT_PATH}`);
