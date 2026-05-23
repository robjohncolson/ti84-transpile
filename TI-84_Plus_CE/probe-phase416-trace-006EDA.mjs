#!/usr/bin/env node
// Phase 416: Trace 0x006EDA and 0x0019B5 — Channel 3 special-path functions
// Called from the 0x0150C2 generic completion dispatcher when arg==3 (Channel 3)
// under conditions D176FC==0 AND D1772D!=0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase416-trace-006EDA-report.md');

const rom = fs.readFileSync(ROM_PATH);

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// --- Simple eZ80 disassembler (enough for static analysis) ---

function disasmBlock(startAddr, maxBytes) {
  const lines = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end && pc < rom.length) {
    const lineStart = pc;
    const b0 = rom[pc];

    // Check for RET or unconditional JP as function terminators
    let mnemonic = '';
    let rawBytes = [];

    // Prefixes
    if (b0 === 0xC9) {
      rawBytes = [b0];
      mnemonic = 'RET';
      pc += 1;
    } else if (b0 === 0xC3) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `JP ${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xCD) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `CALL ${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0x3A) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD A,(${hex(addr)})`;
      pc += 4;
    } else if (b0 === 0x32) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD (${hex(addr)}),A`;
      pc += 4;
    } else if (b0 === 0x21) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD HL,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0x11) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD DE,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0x01) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD BC,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0x31) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `LD SP,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xAF) {
      rawBytes = [b0];
      mnemonic = 'XOR A';
      pc += 1;
    } else if (b0 === 0xFE) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `CP ${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x28) {
      const offset = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      const target = pc + 2 + offset;
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `JR Z,${hex(target)} (offset ${offset})`;
      pc += 2;
    } else if (b0 === 0x20) {
      const offset = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      const target = pc + 2 + offset;
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `JR NZ,${hex(target)} (offset ${offset})`;
      pc += 2;
    } else if (b0 === 0x30) {
      const offset = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      const target = pc + 2 + offset;
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `JR NC,${hex(target)} (offset ${offset})`;
      pc += 2;
    } else if (b0 === 0x38) {
      const offset = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      const target = pc + 2 + offset;
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `JR C,${hex(target)} (offset ${offset})`;
      pc += 2;
    } else if (b0 === 0x18) {
      const offset = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      const target = pc + 2 + offset;
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `JR ${hex(target)} (offset ${offset})`;
      pc += 2;
    } else if (b0 === 0xF5) {
      rawBytes = [b0]; mnemonic = 'PUSH AF'; pc += 1;
    } else if (b0 === 0xC5) {
      rawBytes = [b0]; mnemonic = 'PUSH BC'; pc += 1;
    } else if (b0 === 0xD5) {
      rawBytes = [b0]; mnemonic = 'PUSH DE'; pc += 1;
    } else if (b0 === 0xE5) {
      rawBytes = [b0]; mnemonic = 'PUSH HL'; pc += 1;
    } else if (b0 === 0xF1) {
      rawBytes = [b0]; mnemonic = 'POP AF'; pc += 1;
    } else if (b0 === 0xC1) {
      rawBytes = [b0]; mnemonic = 'POP BC'; pc += 1;
    } else if (b0 === 0xD1) {
      rawBytes = [b0]; mnemonic = 'POP DE'; pc += 1;
    } else if (b0 === 0xE1) {
      rawBytes = [b0]; mnemonic = 'POP HL'; pc += 1;
    } else if (b0 === 0xF3) {
      rawBytes = [b0]; mnemonic = 'DI'; pc += 1;
    } else if (b0 === 0xFB) {
      rawBytes = [b0]; mnemonic = 'EI'; pc += 1;
    } else if (b0 === 0x00) {
      rawBytes = [b0]; mnemonic = 'NOP'; pc += 1;
    } else if (b0 === 0x76) {
      rawBytes = [b0]; mnemonic = 'HALT'; pc += 1;
    } else if (b0 === 0x37) {
      rawBytes = [b0]; mnemonic = 'SCF'; pc += 1;
    } else if (b0 === 0x3F) {
      rawBytes = [b0]; mnemonic = 'CCF'; pc += 1;
    } else if (b0 === 0xA7) {
      rawBytes = [b0]; mnemonic = 'AND A'; pc += 1;
    } else if (b0 === 0xB7) {
      rawBytes = [b0]; mnemonic = 'OR A'; pc += 1;
    } else if (b0 === 0x2F) {
      rawBytes = [b0]; mnemonic = 'CPL'; pc += 1;
    } else if (b0 === 0x07) {
      rawBytes = [b0]; mnemonic = 'RLCA'; pc += 1;
    } else if (b0 === 0x0F) {
      rawBytes = [b0]; mnemonic = 'RRCA'; pc += 1;
    } else if (b0 === 0x17) {
      rawBytes = [b0]; mnemonic = 'RLA'; pc += 1;
    } else if (b0 === 0x1F) {
      rawBytes = [b0]; mnemonic = 'RRA'; pc += 1;
    } else if (b0 === 0x27) {
      rawBytes = [b0]; mnemonic = 'DAA'; pc += 1;
    } else if (b0 === 0xE9) {
      rawBytes = [b0]; mnemonic = 'JP (HL)'; pc += 1;
    } else if (b0 === 0xD9) {
      rawBytes = [b0]; mnemonic = 'EXX'; pc += 1;
    } else if (b0 === 0x08) {
      rawBytes = [b0]; mnemonic = "EX AF,AF'"; pc += 1;
    } else if (b0 === 0xEB) {
      rawBytes = [b0]; mnemonic = 'EX DE,HL'; pc += 1;
    } else if (b0 === 0xE3) {
      rawBytes = [b0]; mnemonic = 'EX (SP),HL'; pc += 1;
    } else if (b0 === 0x03) {
      rawBytes = [b0]; mnemonic = 'INC BC'; pc += 1;
    } else if (b0 === 0x13) {
      rawBytes = [b0]; mnemonic = 'INC DE'; pc += 1;
    } else if (b0 === 0x23) {
      rawBytes = [b0]; mnemonic = 'INC HL'; pc += 1;
    } else if (b0 === 0x33) {
      rawBytes = [b0]; mnemonic = 'INC SP'; pc += 1;
    } else if (b0 === 0x0B) {
      rawBytes = [b0]; mnemonic = 'DEC BC'; pc += 1;
    } else if (b0 === 0x1B) {
      rawBytes = [b0]; mnemonic = 'DEC DE'; pc += 1;
    } else if (b0 === 0x2B) {
      rawBytes = [b0]; mnemonic = 'DEC HL'; pc += 1;
    } else if (b0 === 0x3B) {
      rawBytes = [b0]; mnemonic = 'DEC SP'; pc += 1;
    } else if (b0 === 0x3C) {
      rawBytes = [b0]; mnemonic = 'INC A'; pc += 1;
    } else if (b0 === 0x04) {
      rawBytes = [b0]; mnemonic = 'INC B'; pc += 1;
    } else if (b0 === 0x0C) {
      rawBytes = [b0]; mnemonic = 'INC C'; pc += 1;
    } else if (b0 === 0x14) {
      rawBytes = [b0]; mnemonic = 'INC D'; pc += 1;
    } else if (b0 === 0x1C) {
      rawBytes = [b0]; mnemonic = 'INC E'; pc += 1;
    } else if (b0 === 0x24) {
      rawBytes = [b0]; mnemonic = 'INC H'; pc += 1;
    } else if (b0 === 0x2C) {
      rawBytes = [b0]; mnemonic = 'INC L'; pc += 1;
    } else if (b0 === 0x3D) {
      rawBytes = [b0]; mnemonic = 'DEC A'; pc += 1;
    } else if (b0 === 0x05) {
      rawBytes = [b0]; mnemonic = 'DEC B'; pc += 1;
    } else if (b0 === 0x0D) {
      rawBytes = [b0]; mnemonic = 'DEC C'; pc += 1;
    } else if (b0 === 0x15) {
      rawBytes = [b0]; mnemonic = 'DEC D'; pc += 1;
    } else if (b0 === 0x1D) {
      rawBytes = [b0]; mnemonic = 'DEC E'; pc += 1;
    } else if (b0 === 0x25) {
      rawBytes = [b0]; mnemonic = 'DEC H'; pc += 1;
    } else if (b0 === 0x2D) {
      rawBytes = [b0]; mnemonic = 'DEC L'; pc += 1;
    } else if (b0 === 0x34) {
      rawBytes = [b0]; mnemonic = 'INC (HL)'; pc += 1;
    } else if (b0 === 0x35) {
      rawBytes = [b0]; mnemonic = 'DEC (HL)'; pc += 1;
    } else if (b0 === 0x36) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD (HL),${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x3E) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD A,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x06) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD B,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x0E) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD C,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x16) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD D,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x1E) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD E,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x26) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD H,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0x2E) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `LD L,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xC6) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `ADD A,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xCE) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `ADC A,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xD6) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `SUB ${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xDE) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `SBC A,${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xE6) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `AND ${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xEE) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `XOR ${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xF6) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `OR ${hex(rom[pc+1], 2)}`;
      pc += 2;
    } else if (b0 === 0xDB) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `IN A,(${hex(rom[pc+1], 2)})`;
      pc += 2;
    } else if (b0 === 0xD3) {
      rawBytes = [b0, rom[pc+1]];
      mnemonic = `OUT (${hex(rom[pc+1], 2)}),A`;
      pc += 2;
    } else if (b0 === 0xC0) {
      rawBytes = [b0]; mnemonic = 'RET NZ'; pc += 1;
    } else if (b0 === 0xC8) {
      rawBytes = [b0]; mnemonic = 'RET Z'; pc += 1;
    } else if (b0 === 0xD0) {
      rawBytes = [b0]; mnemonic = 'RET NC'; pc += 1;
    } else if (b0 === 0xD8) {
      rawBytes = [b0]; mnemonic = 'RET C'; pc += 1;
    } else if (b0 === 0xE0) {
      rawBytes = [b0]; mnemonic = 'RET PO'; pc += 1;
    } else if (b0 === 0xE8) {
      rawBytes = [b0]; mnemonic = 'RET PE'; pc += 1;
    } else if (b0 === 0xF0) {
      rawBytes = [b0]; mnemonic = 'RET P'; pc += 1;
    } else if (b0 === 0xF8) {
      rawBytes = [b0]; mnemonic = 'RET M'; pc += 1;
    } else if (b0 === 0xC2) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `JP NZ,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xCA) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `JP Z,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xD2) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `JP NC,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xDA) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `JP C,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xC4) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `CALL NZ,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xCC) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `CALL Z,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xD4) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `CALL NC,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0xDC) {
      const addr = read24(pc + 1);
      rawBytes = [b0, rom[pc+1], rom[pc+2], rom[pc+3]];
      mnemonic = `CALL C,${hex(addr)}`;
      pc += 4;
    } else if (b0 === 0x09) {
      rawBytes = [b0]; mnemonic = 'ADD HL,BC'; pc += 1;
    } else if (b0 === 0x19) {
      rawBytes = [b0]; mnemonic = 'ADD HL,DE'; pc += 1;
    } else if (b0 === 0x29) {
      rawBytes = [b0]; mnemonic = 'ADD HL,HL'; pc += 1;
    } else if (b0 === 0x39) {
      rawBytes = [b0]; mnemonic = 'ADD HL,SP'; pc += 1;
    } else if (b0 === 0xC7) {
      rawBytes = [b0]; mnemonic = 'RST 0x00'; pc += 1;
    } else if (b0 === 0xCF) {
      rawBytes = [b0]; mnemonic = 'RST 0x08'; pc += 1;
    } else if (b0 === 0xD7) {
      rawBytes = [b0]; mnemonic = 'RST 0x10'; pc += 1;
    } else if (b0 === 0xDF) {
      rawBytes = [b0]; mnemonic = 'RST 0x18'; pc += 1;
    } else if (b0 === 0xE7) {
      rawBytes = [b0]; mnemonic = 'RST 0x20'; pc += 1;
    } else if (b0 === 0xEF) {
      rawBytes = [b0]; mnemonic = 'RST 0x28'; pc += 1;
    } else if (b0 === 0xF7) {
      rawBytes = [b0]; mnemonic = 'RST 0x30'; pc += 1;
    } else if (b0 === 0xFF) {
      rawBytes = [b0]; mnemonic = 'RST 0x38'; pc += 1;
    }
    // LD r,r' group (0x40-0x7F except 0x76=HALT)
    else if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const dst = (b0 >> 3) & 7;
      const src = b0 & 7;
      rawBytes = [b0];
      mnemonic = `LD ${regNames[dst]},${regNames[src]}`;
      pc += 1;
    }
    // ALU r group (0x80-0xBF)
    else if (b0 >= 0x80 && b0 <= 0xBF) {
      const aluNames = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const op = (b0 >> 3) & 7;
      const src = b0 & 7;
      rawBytes = [b0];
      mnemonic = `${aluNames[op]}${regNames[src]}`;
      pc += 1;
    }
    // ED prefix
    else if (b0 === 0xED) {
      const b1 = rom[pc + 1];
      if (b1 === 0x78) {
        rawBytes = [b0, b1]; mnemonic = 'IN A,(C)'; pc += 2;
      } else if (b1 === 0x79) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),A'; pc += 2;
      } else if (b1 === 0x40) {
        rawBytes = [b0, b1]; mnemonic = 'IN B,(C)'; pc += 2;
      } else if (b1 === 0x41) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),B'; pc += 2;
      } else if (b1 === 0x48) {
        rawBytes = [b0, b1]; mnemonic = 'IN C,(C)'; pc += 2;
      } else if (b1 === 0x49) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),C'; pc += 2;
      } else if (b1 === 0x50) {
        rawBytes = [b0, b1]; mnemonic = 'IN D,(C)'; pc += 2;
      } else if (b1 === 0x51) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),D'; pc += 2;
      } else if (b1 === 0x58) {
        rawBytes = [b0, b1]; mnemonic = 'IN E,(C)'; pc += 2;
      } else if (b1 === 0x59) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),E'; pc += 2;
      } else if (b1 === 0x60) {
        rawBytes = [b0, b1]; mnemonic = 'IN H,(C)'; pc += 2;
      } else if (b1 === 0x61) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),H'; pc += 2;
      } else if (b1 === 0x68) {
        rawBytes = [b0, b1]; mnemonic = 'IN L,(C)'; pc += 2;
      } else if (b1 === 0x69) {
        rawBytes = [b0, b1]; mnemonic = 'OUT (C),L'; pc += 2;
      } else if (b1 === 0xB0) {
        rawBytes = [b0, b1]; mnemonic = 'LDIR'; pc += 2;
      } else if (b1 === 0xB8) {
        rawBytes = [b0, b1]; mnemonic = 'LDDR'; pc += 2;
      } else if (b1 === 0xA0) {
        rawBytes = [b0, b1]; mnemonic = 'LDI'; pc += 2;
      } else if (b1 === 0xA8) {
        rawBytes = [b0, b1]; mnemonic = 'LDD'; pc += 2;
      } else if (b1 === 0xB1) {
        rawBytes = [b0, b1]; mnemonic = 'CPIR'; pc += 2;
      } else if (b1 === 0xB9) {
        rawBytes = [b0, b1]; mnemonic = 'CPDR'; pc += 2;
      } else if (b1 === 0x44) {
        rawBytes = [b0, b1]; mnemonic = 'NEG'; pc += 2;
      } else if (b1 === 0x4D) {
        rawBytes = [b0, b1]; mnemonic = 'RETI'; pc += 2;
      } else if (b1 === 0x45) {
        rawBytes = [b0, b1]; mnemonic = 'RETN'; pc += 2;
      } else if (b1 === 0x46) {
        rawBytes = [b0, b1]; mnemonic = 'IM 0'; pc += 2;
      } else if (b1 === 0x56) {
        rawBytes = [b0, b1]; mnemonic = 'IM 1'; pc += 2;
      } else if (b1 === 0x5E) {
        rawBytes = [b0, b1]; mnemonic = 'IM 2'; pc += 2;
      } else if (b1 === 0x47) {
        rawBytes = [b0, b1]; mnemonic = 'LD I,A'; pc += 2;
      } else if (b1 === 0x4F) {
        rawBytes = [b0, b1]; mnemonic = 'LD R,A'; pc += 2;
      } else if (b1 === 0x57) {
        rawBytes = [b0, b1]; mnemonic = 'LD A,I'; pc += 2;
      } else if (b1 === 0x5F) {
        rawBytes = [b0, b1]; mnemonic = 'LD A,R'; pc += 2;
      } else if (b1 === 0x67) {
        rawBytes = [b0, b1]; mnemonic = 'RRD'; pc += 2;
      } else if (b1 === 0x6F) {
        rawBytes = [b0, b1]; mnemonic = 'RLD'; pc += 2;
      } else if (b1 === 0x42) {
        rawBytes = [b0, b1]; mnemonic = 'SBC HL,BC'; pc += 2;
      } else if (b1 === 0x52) {
        rawBytes = [b0, b1]; mnemonic = 'SBC HL,DE'; pc += 2;
      } else if (b1 === 0x62) {
        rawBytes = [b0, b1]; mnemonic = 'SBC HL,HL'; pc += 2;
      } else if (b1 === 0x72) {
        rawBytes = [b0, b1]; mnemonic = 'SBC HL,SP'; pc += 2;
      } else if (b1 === 0x4A) {
        rawBytes = [b0, b1]; mnemonic = 'ADC HL,BC'; pc += 2;
      } else if (b1 === 0x5A) {
        rawBytes = [b0, b1]; mnemonic = 'ADC HL,DE'; pc += 2;
      } else if (b1 === 0x6A) {
        rawBytes = [b0, b1]; mnemonic = 'ADC HL,HL'; pc += 2;
      } else if (b1 === 0x7A) {
        rawBytes = [b0, b1]; mnemonic = 'ADC HL,SP'; pc += 2;
      } else if (b1 === 0x43) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD (${hex(addr)}),BC`;
        pc += 5;
      } else if (b1 === 0x53) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD (${hex(addr)}),DE`;
        pc += 5;
      } else if (b1 === 0x63) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD (${hex(addr)}),HL`;
        pc += 5;
      } else if (b1 === 0x73) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD (${hex(addr)}),SP`;
        pc += 5;
      } else if (b1 === 0x4B) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD BC,(${hex(addr)})`;
        pc += 5;
      } else if (b1 === 0x5B) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD DE,(${hex(addr)})`;
        pc += 5;
      } else if (b1 === 0x6B) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD HL,(${hex(addr)})`;
        pc += 5;
      } else if (b1 === 0x7B) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD SP,(${hex(addr)})`;
        pc += 5;
      } else {
        rawBytes = [b0, b1];
        mnemonic = `ED ${hexByte(b1)} (unknown)`;
        pc += 2;
      }
    }
    // DD prefix (IX)
    else if (b0 === 0xDD) {
      const b1 = rom[pc + 1];
      if (b1 === 0x21) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD IX,${hex(addr)}`;
        pc += 5;
      } else if (b1 === 0xE5) {
        rawBytes = [b0, b1]; mnemonic = 'PUSH IX'; pc += 2;
      } else if (b1 === 0xE1) {
        rawBytes = [b0, b1]; mnemonic = 'POP IX'; pc += 2;
      } else if (b1 === 0xE9) {
        rawBytes = [b0, b1]; mnemonic = 'JP (IX)'; pc += 2;
      } else if (b1 === 0x23) {
        rawBytes = [b0, b1]; mnemonic = 'INC IX'; pc += 2;
      } else if (b1 === 0x2B) {
        rawBytes = [b0, b1]; mnemonic = 'DEC IX'; pc += 2;
      } else if (b1 === 0x09) {
        rawBytes = [b0, b1]; mnemonic = 'ADD IX,BC'; pc += 2;
      } else if (b1 === 0x19) {
        rawBytes = [b0, b1]; mnemonic = 'ADD IX,DE'; pc += 2;
      } else if (b1 === 0x29) {
        rawBytes = [b0, b1]; mnemonic = 'ADD IX,IX'; pc += 2;
      } else if (b1 === 0x39) {
        rawBytes = [b0, b1]; mnemonic = 'ADD IX,SP'; pc += 2;
      } else {
        rawBytes = [b0, b1];
        mnemonic = `DD ${hexByte(b1)} (IX prefix, decode manually)`;
        pc += 2;
      }
    }
    // FD prefix (IY)
    else if (b0 === 0xFD) {
      const b1 = rom[pc + 1];
      if (b1 === 0x21) {
        const addr = read24(pc + 2);
        rawBytes = [b0, b1, rom[pc+2], rom[pc+3], rom[pc+4]];
        mnemonic = `LD IY,${hex(addr)}`;
        pc += 5;
      } else if (b1 === 0xE5) {
        rawBytes = [b0, b1]; mnemonic = 'PUSH IY'; pc += 2;
      } else if (b1 === 0xE1) {
        rawBytes = [b0, b1]; mnemonic = 'POP IY'; pc += 2;
      } else if (b1 === 0xE9) {
        rawBytes = [b0, b1]; mnemonic = 'JP (IY)'; pc += 2;
      } else if (b1 === 0x23) {
        rawBytes = [b0, b1]; mnemonic = 'INC IY'; pc += 2;
      } else if (b1 === 0x2B) {
        rawBytes = [b0, b1]; mnemonic = 'DEC IY'; pc += 2;
      } else if (b1 === 0xCB) {
        // FD CB dd xx — bit operations on (IY+d)
        const d = rom[pc + 2];
        const op = rom[pc + 3];
        rawBytes = [b0, b1, d, op];
        const dSigned = d > 127 ? d - 256 : d;
        if ((op & 0xC7) === 0x46) {
          const bit = (op >> 3) & 7;
          mnemonic = `BIT ${bit},(IY+${dSigned})`;
        } else if ((op & 0xC7) === 0xC6) {
          const bit = (op >> 3) & 7;
          mnemonic = `SET ${bit},(IY+${dSigned})`;
        } else if ((op & 0xC7) === 0x86) {
          const bit = (op >> 3) & 7;
          mnemonic = `RES ${bit},(IY+${dSigned})`;
        } else {
          mnemonic = `FD CB ${hexByte(d)} ${hexByte(op)} (IY+${dSigned} bit op)`;
        }
        pc += 4;
      } else {
        rawBytes = [b0, b1];
        mnemonic = `FD ${hexByte(b1)} (IY prefix, decode manually)`;
        pc += 2;
      }
    }
    // CB prefix (bit/shift/rotate)
    else if (b0 === 0xCB) {
      const b1 = rom[pc + 1];
      rawBytes = [b0, b1];
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const r = b1 & 7;
      if (b1 < 0x08) {
        mnemonic = `RLC ${regNames[r]}`;
      } else if (b1 < 0x10) {
        mnemonic = `RRC ${regNames[r]}`;
      } else if (b1 < 0x18) {
        mnemonic = `RL ${regNames[r]}`;
      } else if (b1 < 0x20) {
        mnemonic = `RR ${regNames[r]}`;
      } else if (b1 < 0x28) {
        mnemonic = `SLA ${regNames[r]}`;
      } else if (b1 < 0x30) {
        mnemonic = `SRA ${regNames[r]}`;
      } else if (b1 < 0x38) {
        mnemonic = `SLL ${regNames[r]}`;
      } else if (b1 < 0x40) {
        mnemonic = `SRL ${regNames[r]}`;
      } else if (b1 < 0x80) {
        const bit = (b1 >> 3) & 7;
        mnemonic = `BIT ${bit},${regNames[r]}`;
      } else if (b1 < 0xC0) {
        const bit = (b1 >> 3) & 7;
        mnemonic = `RES ${bit},${regNames[r]}`;
      } else {
        const bit = (b1 >> 3) & 7;
        mnemonic = `SET ${bit},${regNames[r]}`;
      }
      pc += 2;
    }
    // LD A,(BC)
    else if (b0 === 0x0A) {
      rawBytes = [b0]; mnemonic = 'LD A,(BC)'; pc += 1;
    }
    // LD A,(DE)
    else if (b0 === 0x1A) {
      rawBytes = [b0]; mnemonic = 'LD A,(DE)'; pc += 1;
    }
    // LD (BC),A
    else if (b0 === 0x02) {
      rawBytes = [b0]; mnemonic = 'LD (BC),A'; pc += 1;
    }
    // LD (DE),A
    else if (b0 === 0x12) {
      rawBytes = [b0]; mnemonic = 'LD (DE),A'; pc += 1;
    }
    // LD (HL),r
    else if (b0 === 0x77) {
      rawBytes = [b0]; mnemonic = 'LD (HL),A'; pc += 1;
    }
    // LD A,(HL)
    else if (b0 === 0x7E) {
      rawBytes = [b0]; mnemonic = 'LD A,(HL)'; pc += 1;
    }
    else {
      rawBytes = [b0];
      mnemonic = `DB ${hexByte(b0)}`;
      pc += 1;
    }

    const hexStr = rawBytes.map(hexByte).join(' ');
    lines.push({ addr: lineStart, hex: hexStr, mnemonic, rawBytes });

    // Stop after RET or unconditional JP (function boundary)
    if (b0 === 0xC9 || b0 === 0xC3) {
      break;
    }
  }

  return lines;
}

function formatDisasm(lines) {
  const out = [];
  for (const l of lines) {
    out.push(`  ${hex(l.addr)}: ${l.hex.padEnd(18)} ${l.mnemonic}`);
  }
  return out.join('\n');
}

// --- Search ROM for byte patterns ---

function searchPattern(pattern, startAddr, endAddr) {
  const results = [];
  for (let i = startAddr; i <= endAddr - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

// ======== MAIN ========

const output = [];
function log(s) { output.push(s); console.log(s); }

log('=== Phase 416: Trace 0x006EDA and 0x0019B5 (Channel 3 Special Path) ===');
log('');

// --- 1. Disassemble 0x006EDA ---
log('--- 1. Disassembly of 0x006EDA (up to 120 bytes) ---');
const disasm6EDA = disasmBlock(0x006EDA, 120);
log(formatDisasm(disasm6EDA));
log('');

// Analyze: what RAM, ports, calls?
const calls6EDA = disasm6EDA.filter(l => l.mnemonic.startsWith('CALL '));
const ramReads6EDA = disasm6EDA.filter(l => l.mnemonic.match(/LD [A-Z],\(0x[0-9a-f]+\)/i) || l.mnemonic.match(/LD [A-Z]+,\(0x[0-9a-f]+\)/i));
const ramWrites6EDA = disasm6EDA.filter(l => l.mnemonic.match(/LD \(0x[0-9a-f]+\),[A-Z]/i));
const ports6EDA = disasm6EDA.filter(l => l.mnemonic.match(/IN |OUT /));

log('  CALLs from 0x006EDA:');
for (const c of calls6EDA) log(`    ${hex(c.addr)}: ${c.mnemonic}`);
log('  RAM reads:');
for (const r of ramReads6EDA) log(`    ${hex(r.addr)}: ${r.mnemonic}`);
log('  RAM writes:');
for (const w of ramWrites6EDA) log(`    ${hex(w.addr)}: ${w.mnemonic}`);
log('  Port I/O:');
for (const p of ports6EDA) log(`    ${hex(p.addr)}: ${p.mnemonic}`);
log('');

// Continue disassembly if the first block ended with JP (might be a short stub)
const last6EDA = disasm6EDA[disasm6EDA.length - 1];
if (last6EDA && last6EDA.mnemonic.startsWith('JP ') && !last6EDA.mnemonic.includes('(')) {
  const jpTarget = parseInt(last6EDA.mnemonic.match(/0x([0-9a-f]+)/i)[1], 16);
  if (jpTarget > 0x006EDA && jpTarget < 0x006EDA + 200) {
    log(`  (JP target ${hex(jpTarget)} is nearby, continuing disassembly there)`);
    const disasm6EDA_cont = disasmBlock(jpTarget, 60);
    log(formatDisasm(disasm6EDA_cont));
    log('');
  }
}

// Also try to see if there are branch targets within the function
const branchTargets6EDA = [];
for (const l of disasm6EDA) {
  const m = l.mnemonic.match(/(?:JR|JP) (?:N?[ZC],)?0x([0-9a-f]+)/i);
  if (m) {
    const target = parseInt(m[1], 16);
    if (target > disasm6EDA[disasm6EDA.length - 1].addr) {
      branchTargets6EDA.push(target);
    }
  }
}
if (branchTargets6EDA.length > 0) {
  log('  Branch targets beyond initial disassembly:');
  for (const t of branchTargets6EDA) {
    log(`  Continuing at ${hex(t)}:`);
    const extra = disasmBlock(t, 40);
    log(formatDisasm(extra));
    log('');
  }
}

// --- 2. Disassemble 0x0019B5 ---
log('--- 2. Disassembly of 0x0019B5 (up to 100 bytes) ---');
const disasm19B5 = disasmBlock(0x0019B5, 100);
log(formatDisasm(disasm19B5));
log('');

const calls19B5 = disasm19B5.filter(l => l.mnemonic.startsWith('CALL '));
const ramReads19B5 = disasm19B5.filter(l => l.mnemonic.match(/LD [A-Z],\(0x[0-9a-f]+\)/i) || l.mnemonic.match(/LD [A-Z]+,\(0x[0-9a-f]+\)/i));
const ramWrites19B5 = disasm19B5.filter(l => l.mnemonic.match(/LD \(0x[0-9a-f]+\),[A-Z]/i));
const ports19B5 = disasm19B5.filter(l => l.mnemonic.match(/IN |OUT /));

log('  CALLs from 0x0019B5:');
for (const c of calls19B5) log(`    ${hex(c.addr)}: ${c.mnemonic}`);
log('  RAM reads:');
for (const r of ramReads19B5) log(`    ${hex(r.addr)}: ${r.mnemonic}`);
log('  RAM writes:');
for (const w of ramWrites19B5) log(`    ${hex(w.addr)}: ${w.mnemonic}`);
log('  Port I/O:');
for (const p of ports19B5) log(`    ${hex(p.addr)}: ${p.mnemonic}`);
log('');

// Continue if JP nearby
const last19B5 = disasm19B5[disasm19B5.length - 1];
if (last19B5 && last19B5.mnemonic.startsWith('JP ') && !last19B5.mnemonic.includes('(')) {
  const jpTarget = parseInt(last19B5.mnemonic.match(/0x([0-9a-f]+)/i)[1], 16);
  if (jpTarget > 0x0019B5 && jpTarget < 0x0019B5 + 200) {
    log(`  (JP target ${hex(jpTarget)} is nearby, continuing disassembly there)`);
    const extra = disasmBlock(jpTarget, 60);
    log(formatDisasm(extra));
    log('');
  }
}

// Branch targets beyond
const branchTargets19B5 = [];
for (const l of disasm19B5) {
  const m = l.mnemonic.match(/(?:JR|JP) (?:N?[ZC],)?0x([0-9a-f]+)/i);
  if (m) {
    const target = parseInt(m[1], 16);
    if (target > disasm19B5[disasm19B5.length - 1].addr) {
      branchTargets19B5.push(target);
    }
  }
}
if (branchTargets19B5.length > 0) {
  log('  Branch targets beyond initial disassembly:');
  for (const t of branchTargets19B5) {
    log(`  Continuing at ${hex(t)}:`);
    const extra = disasmBlock(t, 40);
    log(formatDisasm(extra));
    log('');
  }
}

// --- 3. Search for callers of 0x006EDA ---
log('--- 3. Callers of 0x006EDA ---');
const SEARCH_END = 0x0BFFFF;

const call6EDA = searchPattern([0xCD, 0xDA, 0x6E, 0x00], 0, SEARCH_END);
log(`  CALL 0x006EDA (CD DA 6E 00): ${call6EDA.length} hits`);
for (const a of call6EDA) log(`    ${hex(a)}`);

const jp6EDA = searchPattern([0xC3, 0xDA, 0x6E, 0x00], 0, SEARCH_END);
log(`  JP 0x006EDA (C3 DA 6E 00): ${jp6EDA.length} hits`);
for (const a of jp6EDA) log(`    ${hex(a)}`);

// Broader search for DA 6E 00
const broad6EDA = searchPattern([0xDA, 0x6E, 0x00], 0, SEARCH_END);
log(`  Broad DA 6E 00: ${broad6EDA.length} hits`);
for (const a of broad6EDA) {
  const prefix = a > 0 ? hexByte(rom[a - 1]) : '??';
  log(`    ${hex(a)} (preceding byte: ${prefix})`);
}
log('');

// --- 4. Search for callers of 0x0019B5 ---
log('--- 4. Callers of 0x0019B5 ---');

const call19B5 = searchPattern([0xCD, 0xB5, 0x19, 0x00], 0, SEARCH_END);
log(`  CALL 0x0019B5 (CD B5 19 00): ${call19B5.length} hits`);
for (const a of call19B5) log(`    ${hex(a)}`);

const jp19B5 = searchPattern([0xC3, 0xB5, 0x19, 0x00], 0, SEARCH_END);
log(`  JP 0x0019B5 (C3 B5 19 00): ${jp19B5.length} hits`);
for (const a of jp19B5) log(`    ${hex(a)}`);

// Broader search for B5 19 00
const broad19B5 = searchPattern([0xB5, 0x19, 0x00], 0, SEARCH_END);
log(`  Broad B5 19 00: ${broad19B5.length} hits`);
for (const a of broad19B5) {
  const prefix = a > 0 ? hexByte(rom[a - 1]) : '??';
  log(`    ${hex(a)} (preceding byte: ${prefix})`);
}
log('');

// --- 5. Cross-reference with 0x0150C2 completion dispatcher ---
log('--- 5. Cross-reference: 0x0150C2 completion dispatcher (0x0150C2-0x015128) ---');
log('');
log('Full disassembly of 0x0150C2-0x015128:');
const disasm0150C2 = disasmBlock(0x0150C2, 0x015128 - 0x0150C2 + 8);
log(formatDisasm(disasm0150C2));
log('');

// Hex dump of the region for manual verification
log('Hex dump of 0x0150C2-0x015128:');
for (let row = 0x0150C2; row < 0x015130; row += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && row + i < rom.length; i++) {
    bytes.push(hexByte(rom[row + i]));
  }
  log(`  ${hex(row)}: ${bytes.join(' ')}`);
}
log('');

// Look for where 0x006EDA and 0x0019B5 appear in this region
log('Searching for 0x006EDA reference in dispatcher region:');
for (let i = 0x0150C2; i < 0x015128; i++) {
  if (rom[i] === 0xDA && rom[i+1] === 0x6E && rom[i+2] === 0x00) {
    log(`  Found DA 6E 00 at ${hex(i)} (preceding byte: ${hexByte(rom[i-1])})`);
  }
}

log('Searching for 0x0019B5 reference in dispatcher region:');
for (let i = 0x0150C2; i < 0x015128; i++) {
  if (rom[i] === 0xB5 && rom[i+1] === 0x19 && rom[i+2] === 0x00) {
    log(`  Found B5 19 00 at ${hex(i)} (preceding byte: ${hexByte(rom[i-1])})`);
  }
}
log('');

// Also look for D176FC and D1772D references in the dispatcher
log('Searching for D176FC reference in dispatcher:');
for (let i = 0x0150C2; i < 0x015128; i++) {
  if (rom[i] === 0xFC && rom[i+1] === 0x76 && rom[i+2] === 0xD1) {
    log(`  Found FC 76 D1 at ${hex(i)} (preceding byte: ${hexByte(rom[i-1])})`);
  }
}

log('Searching for D1772D reference in dispatcher:');
for (let i = 0x0150C2; i < 0x015128; i++) {
  if (rom[i] === 0x2D && rom[i+1] === 0x77 && rom[i+2] === 0xD1) {
    log(`  Found 2D 77 D1 at ${hex(i)} (preceding byte: ${hexByte(rom[i-1])})`);
  }
}
log('');

// --- 6. Extended dispatcher region (in case the special path is slightly outside) ---
log('--- 6. Extended region scan around 0x015100-0x015160 ---');
const disasmExtended = disasmBlock(0x015100, 0x90);
log(formatDisasm(disasmExtended));
log('');

// --- 7. Summary ---
log('--- 7. Summary ---');
log(`  0x006EDA function length: ${disasm6EDA.length} instructions`);
log(`  0x006EDA ends at: ${hex(disasm6EDA[disasm6EDA.length - 1].addr)}`);
log(`  0x006EDA terminates with: ${disasm6EDA[disasm6EDA.length - 1].mnemonic}`);
log(`  0x006EDA CALL count: ${calls6EDA.length}`);
log(`  0x006EDA total callers (CALL): ${call6EDA.length}`);
log(`  0x006EDA total callers (JP): ${jp6EDA.length}`);
log('');
log(`  0x0019B5 function length: ${disasm19B5.length} instructions`);
log(`  0x0019B5 ends at: ${hex(disasm19B5[disasm19B5.length - 1].addr)}`);
log(`  0x0019B5 terminates with: ${disasm19B5[disasm19B5.length - 1].mnemonic}`);
log(`  0x0019B5 CALL count: ${calls19B5.length}`);
log(`  0x0019B5 total callers (CALL): ${call19B5.length}`);
log(`  0x0019B5 total callers (JP): ${jp19B5.length}`);
log('');

// Write report
const report = `# Phase 416: Trace 0x006EDA and 0x0019B5 — Channel 3 Special Path

## Context

Session 415 decoded 0x0150C2 (generic completion dispatcher, 103 bytes).
It has a **special case for Channel 3** (arg==3): if D176FC==0 AND D1772D!=0,
it calls 0x006EDA then optionally 0x0019B5. This probe traces both functions.

## Raw Output

\`\`\`
${output.join('\n')}
\`\`\`
`;

fs.writeFileSync(REPORT_PATH, report);
log(`\nReport written to ${REPORT_PATH}`);
