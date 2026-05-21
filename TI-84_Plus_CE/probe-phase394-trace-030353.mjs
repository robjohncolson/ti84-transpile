#!/usr/bin/env node

// Phase 394: Trace function containing 0x030353 (JP 0x02FE73)
// Goal: identify the function boundary, callers, and connection to key dispatch chain.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_LIMIT = 0x400000;

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);

// --- helpers ---

function hex(v, w = 6) {
  return `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
}

function read24(offset) {
  return (romBytes[offset] | (romBytes[offset + 1] << 8) | (romBytes[offset + 2] << 16)) >>> 0;
}

function bytesHex(start, len) {
  return Array.from(romBytes.slice(start, start + len), b => b.toString(16).padStart(2, '0')).join(' ');
}

// --- eZ80 ADL-mode disassembler (minimal, sufficient for this region) ---

// Returns { mnemonic, length } for the instruction at `addr`.
function disasm(addr) {
  const b0 = romBytes[addr];

  // Prefixed instructions
  if (b0 === 0xDD || b0 === 0xFD) {
    const reg = b0 === 0xDD ? 'IX' : 'IY';
    const b1 = romBytes[addr + 1];

    if (b1 === 0xCB) {
      // IX/IY bit ops: prefix + CB + disp + opcode = 4 bytes
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const op = romBytes[addr + 3];
      return { mnemonic: `${reg}-CB d=${disp} op=${hex(op, 2)}`, length: 4 };
    }

    // LD r,(IX+d) / LD (IX+d),r patterns, PUSH/POP IX, ADD IX,...
    // JP (IX) = DD E9
    if (b1 === 0xE9) return { mnemonic: `JP (${reg})`, length: 2 };
    // PUSH IX = DD E5, POP IX = DD E1
    if (b1 === 0xE5) return { mnemonic: `PUSH ${reg}`, length: 2 };
    if (b1 === 0xE1) return { mnemonic: `POP ${reg}`, length: 2 };
    // LD IX,nn = DD 21 nn nn nn (5 bytes in ADL)
    if (b1 === 0x21) { const nn = read24(addr + 2); return { mnemonic: `LD ${reg},${hex(nn)}`, length: 5 }; }
    // LD (nn),IX = DD 22 nn nn nn
    if (b1 === 0x22) { const nn = read24(addr + 2); return { mnemonic: `LD (${hex(nn)}),${reg}`, length: 5 }; }
    // LD IX,(nn) = DD 2A nn nn nn
    if (b1 === 0x2A) { const nn = read24(addr + 2); return { mnemonic: `LD ${reg},(${hex(nn)})`, length: 5 }; }
    // ADD IX,rr = DD 09/19/29/39
    if ((b1 & 0xCF) === 0x09) {
      const pairs = ['BC', 'DE', reg, 'SP'];
      return { mnemonic: `ADD ${reg},${pairs[(b1 >> 4) & 3]}`, length: 2 };
    }
    // INC IX = DD 23, DEC IX = DD 2B
    if (b1 === 0x23) return { mnemonic: `INC ${reg}`, length: 2 };
    if (b1 === 0x2B) return { mnemonic: `DEC ${reg}`, length: 2 };
    // LD (IX+d),n = DD 36 d n (4 bytes)
    if (b1 === 0x36) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      return { mnemonic: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${hex(romBytes[addr + 3], 2)}`, length: 4 };
    }
    // LD r,(IX+d) or LD (IX+d),r — 3 bytes: prefix, opcode, disp
    // Opcodes 0x46,4E,56,5E,66,6E,7E = LD r,(IX+d)
    // Opcodes 0x70-0x77 = LD (IX+d),r
    if ((b1 & 0xC0) === 0x40 && (b1 & 0x07) === 0x06 && b1 !== 0x76) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      return { mnemonic: `LD ${regs8[(b1 >> 3) & 7]},(${reg}${disp >= 0 ? '+' : ''}${disp})`, length: 3 };
    }
    if ((b1 & 0xF8) === 0x70) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      return { mnemonic: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${regs8[b1 & 7]}`, length: 3 };
    }
    // Arithmetic with (IX+d): ADD/ADC/SUB/SBC/AND/XOR/OR/CP
    if ((b1 & 0xC0) === 0x80 && (b1 & 0x07) === 0x06) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const ops = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
      return { mnemonic: `${ops[(b1 >> 3) & 7]} A,(${reg}${disp >= 0 ? '+' : ''}${disp})`, length: 3 };
    }
    // INC/DEC (IX+d) = DD 34/35 d
    if (b1 === 0x34 || b1 === 0x35) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      return { mnemonic: `${b1 === 0x34 ? 'INC' : 'DEC'} (${reg}${disp >= 0 ? '+' : ''}${disp})`, length: 3 };
    }
    // EX (SP),IX = DD E3
    if (b1 === 0xE3) return { mnemonic: `EX (SP),${reg}`, length: 2 };
    // LD SP,IX = DD F9
    if (b1 === 0xF9) return { mnemonic: `LD SP,${reg}`, length: 2 };

    // Fallback: treat as 2-byte prefix+opcode
    return { mnemonic: `${reg}-prefix ${hex(b1, 2)}`, length: 2 };
  }

  if (b0 === 0xED) {
    const b1 = romBytes[addr + 1];
    // LD (nn),rr = ED 43/53/63/73 nn nn nn (5 bytes in ADL)
    if (b1 === 0x43 || b1 === 0x53 || b1 === 0x63 || b1 === 0x73) {
      const pairs = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
      const nn = read24(addr + 2);
      return { mnemonic: `LD (${hex(nn)}),${pairs[b1]}`, length: 5 };
    }
    // LD rr,(nn) = ED 4B/5B/6B/7B nn nn nn
    if (b1 === 0x4B || b1 === 0x5B || b1 === 0x6B || b1 === 0x7B) {
      const pairs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
      const nn = read24(addr + 2);
      return { mnemonic: `LD ${pairs[b1]},(${hex(nn)})`, length: 5 };
    }
    // SBC HL,rr = ED 42/52/62/72; ADC HL,rr = ED 4A/5A/6A/7A
    if ((b1 & 0xCF) === 0x42) {
      const pairs = ['BC', 'DE', 'HL', 'SP'];
      return { mnemonic: `SBC HL,${pairs[(b1 >> 4) & 3]}`, length: 2 };
    }
    if ((b1 & 0xCF) === 0x4A) {
      const pairs = ['BC', 'DE', 'HL', 'SP'];
      return { mnemonic: `ADC HL,${pairs[(b1 >> 4) & 3]}`, length: 2 };
    }
    // NEG = ED 44
    if (b1 === 0x44) return { mnemonic: 'NEG', length: 2 };
    // RETI = ED 4D, RETN = ED 45
    if (b1 === 0x4D) return { mnemonic: 'RETI', length: 2 };
    if (b1 === 0x45) return { mnemonic: 'RETN', length: 2 };
    // IM 0/1/2 = ED 46/56/5E
    if (b1 === 0x46) return { mnemonic: 'IM 0', length: 2 };
    if (b1 === 0x56) return { mnemonic: 'IM 1', length: 2 };
    if (b1 === 0x5E) return { mnemonic: 'IM 2', length: 2 };
    // IN/OUT
    if ((b1 & 0xC7) === 0x40) {
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
      return { mnemonic: `IN ${regs8[(b1 >> 3) & 7]},(C)`, length: 2 };
    }
    if ((b1 & 0xC7) === 0x41) {
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '0', 'A'];
      return { mnemonic: `OUT (C),${regs8[(b1 >> 3) & 7]}`, length: 2 };
    }
    // Block: LDIR=ED B0, LDDR=ED B8, CPIR=ED B1, CPDR=ED B9, INIR=ED B2, OTIR=ED B3
    const blockOps = {
      0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
      0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
      0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
      0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
    };
    if (blockOps[b1]) return { mnemonic: blockOps[b1], length: 2 };
    // RRD/RLD
    if (b1 === 0x67) return { mnemonic: 'RRD', length: 2 };
    if (b1 === 0x6F) return { mnemonic: 'RLD', length: 2 };
    // LD A,I / LD A,R / LD I,A / LD R,A
    if (b1 === 0x57) return { mnemonic: 'LD A,I', length: 2 };
    if (b1 === 0x5F) return { mnemonic: 'LD A,R', length: 2 };
    if (b1 === 0x47) return { mnemonic: 'LD I,A', length: 2 };
    if (b1 === 0x4F) return { mnemonic: 'LD R,A', length: 2 };
    // MLT rr = ED 4C/5C/6C/7C (eZ80)
    if ((b1 & 0xCF) === 0x4C) {
      const pairs = ['BC', 'DE', 'HL', 'SP'];
      return { mnemonic: `MLT ${pairs[(b1 >> 4) & 3]}`, length: 2 };
    }
    // TST A,r = ED 04/0C/14/1C/24/2C/34/3C (eZ80)
    if ((b1 & 0xC7) === 0x04) {
      const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      return { mnemonic: `TST A,${regs8[(b1 >> 3) & 7]}`, length: 2 };
    }
    // LEA IX/IY = ED 02/03/32/33 + disp (eZ80, 3 bytes)
    if (b1 === 0x02 || b1 === 0x03 || b1 === 0x32 || b1 === 0x33) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const dst = (b1 & 0x01) ? 'IY' : 'IX';
      const src = (b1 & 0x30) ? 'IY' : 'IX';
      return { mnemonic: `LEA ${dst},${src}${disp >= 0 ? '+' : ''}${disp}`, length: 3 };
    }
    // PEA IX+d = ED 65, PEA IY+d = ED 66
    if (b1 === 0x65 || b1 === 0x66) {
      const disp = romBytes[addr + 2] >= 0x80 ? romBytes[addr + 2] - 256 : romBytes[addr + 2];
      const reg = b1 === 0x65 ? 'IX' : 'IY';
      return { mnemonic: `PEA ${reg}${disp >= 0 ? '+' : ''}${disp}`, length: 3 };
    }

    return { mnemonic: `ED ${hex(b1, 2)}`, length: 2 };
  }

  if (b0 === 0xCB) {
    const b1 = romBytes[addr + 1];
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const r = regs8[b1 & 7];
    const bit = (b1 >> 3) & 7;
    if (b1 < 0x40) {
      const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { mnemonic: `${ops[bit]} ${r}`, length: 2 };
    }
    if (b1 < 0x80) return { mnemonic: `BIT ${bit},${r}`, length: 2 };
    if (b1 < 0xC0) return { mnemonic: `RES ${bit},${r}`, length: 2 };
    return { mnemonic: `SET ${bit},${r}`, length: 2 };
  }

  // --- unprefixed ---

  // NOP
  if (b0 === 0x00) return { mnemonic: 'NOP', length: 1 };
  // HALT
  if (b0 === 0x76) return { mnemonic: 'HALT', length: 1 };
  // RET
  if (b0 === 0xC9) return { mnemonic: 'RET', length: 1 };
  // RET cc
  const retCc = { 0xC0: 'NZ', 0xC8: 'Z', 0xD0: 'NC', 0xD8: 'C', 0xE0: 'PO', 0xE8: 'PE', 0xF0: 'P', 0xF8: 'M' };
  if (retCc[b0]) return { mnemonic: `RET ${retCc[b0]}`, length: 1 };
  // JP nn
  if (b0 === 0xC3) { const nn = read24(addr + 1); return { mnemonic: `JP ${hex(nn)}`, length: 4 }; }
  // JP cc,nn
  const jpCc = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
  if (jpCc[b0]) { const nn = read24(addr + 1); return { mnemonic: `JP ${jpCc[b0]},${hex(nn)}`, length: 4 }; }
  // JP (HL)
  if (b0 === 0xE9) return { mnemonic: 'JP (HL)', length: 1 };
  // CALL nn
  if (b0 === 0xCD) { const nn = read24(addr + 1); return { mnemonic: `CALL ${hex(nn)}`, length: 4 }; }
  // CALL cc,nn
  const callCc = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
  if (callCc[b0]) { const nn = read24(addr + 1); return { mnemonic: `CALL ${callCc[b0]},${hex(nn)}`, length: 4 }; }
  // RST
  if ((b0 & 0xC7) === 0xC7) return { mnemonic: `RST ${hex(b0 & 0x38, 2)}`, length: 1 };
  // JR e
  if (b0 === 0x18) { const e = romBytes[addr + 1] >= 0x80 ? romBytes[addr + 1] - 256 : romBytes[addr + 1]; const t = addr + 2 + e; return { mnemonic: `JR ${hex(t)}`, length: 2 }; }
  // JR cc,e
  const jrCc = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
  if (jrCc[b0]) { const e = romBytes[addr + 1] >= 0x80 ? romBytes[addr + 1] - 256 : romBytes[addr + 1]; const t = addr + 2 + e; return { mnemonic: `JR ${jrCc[b0]},${hex(t)}`, length: 2 }; }
  // DJNZ e
  if (b0 === 0x10) { const e = romBytes[addr + 1] >= 0x80 ? romBytes[addr + 1] - 256 : romBytes[addr + 1]; const t = addr + 2 + e; return { mnemonic: `DJNZ ${hex(t)}`, length: 2 }; }

  // LD r,n (8-bit immediate)
  if ((b0 & 0xC7) === 0x06 && b0 !== 0x36) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { mnemonic: `LD ${regs8[(b0 >> 3) & 7]},${hex(romBytes[addr + 1], 2)}`, length: 2 };
  }
  // LD (HL),n
  if (b0 === 0x36) return { mnemonic: `LD (HL),${hex(romBytes[addr + 1], 2)}`, length: 2 };

  // LD rr,nn (16/24-bit immediate in ADL)
  if ((b0 & 0xCF) === 0x01) {
    const pairs = ['BC', 'DE', 'HL', 'SP'];
    const nn = read24(addr + 1);
    return { mnemonic: `LD ${pairs[(b0 >> 4) & 3]},${hex(nn)}`, length: 4 };
  }

  // LD (nn),A / LD A,(nn) — 4 bytes in ADL (3-byte addr)
  if (b0 === 0x32) { const nn = read24(addr + 1); return { mnemonic: `LD (${hex(nn)}),A`, length: 4 }; }
  if (b0 === 0x3A) { const nn = read24(addr + 1); return { mnemonic: `LD A,(${hex(nn)})`, length: 4 }; }
  // LD (nn),HL / LD HL,(nn)
  if (b0 === 0x22) { const nn = read24(addr + 1); return { mnemonic: `LD (${hex(nn)}),HL`, length: 4 }; }
  if (b0 === 0x2A) { const nn = read24(addr + 1); return { mnemonic: `LD HL,(${hex(nn)})`, length: 4 }; }

  // LD r,r'
  if ((b0 & 0xC0) === 0x40 && b0 !== 0x76) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { mnemonic: `LD ${regs8[(b0 >> 3) & 7]},${regs8[b0 & 7]}`, length: 1 };
  }

  // PUSH/POP
  if ((b0 & 0xCF) === 0xC5) { const pairs = ['BC', 'DE', 'HL', 'AF']; return { mnemonic: `PUSH ${pairs[(b0 >> 4) & 3]}`, length: 1 }; }
  if ((b0 & 0xCF) === 0xC1) { const pairs = ['BC', 'DE', 'HL', 'AF']; return { mnemonic: `POP ${pairs[(b0 >> 4) & 3]}`, length: 1 }; }

  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { mnemonic: `INC ${regs8[(b0 >> 3) & 7]}`, length: 1 };
  }
  if ((b0 & 0xC7) === 0x05) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { mnemonic: `DEC ${regs8[(b0 >> 3) & 7]}`, length: 1 };
  }

  // INC/DEC rr
  if ((b0 & 0xCF) === 0x03) { const pairs = ['BC', 'DE', 'HL', 'SP']; return { mnemonic: `INC ${pairs[(b0 >> 4) & 3]}`, length: 1 }; }
  if ((b0 & 0xCF) === 0x0B) { const pairs = ['BC', 'DE', 'HL', 'SP']; return { mnemonic: `DEC ${pairs[(b0 >> 4) & 3]}`, length: 1 }; }

  // ADD HL,rr
  if ((b0 & 0xCF) === 0x09) {
    const pairs = ['BC', 'DE', 'HL', 'SP'];
    return { mnemonic: `ADD HL,${pairs[(b0 >> 4) & 3]}`, length: 1 };
  }

  // Arithmetic A,r
  if ((b0 & 0xC0) === 0x80) {
    const ops = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { mnemonic: `${ops[(b0 >> 3) & 7]} A,${regs8[b0 & 7]}`, length: 1 };
  }

  // Arithmetic A,n (immediate)
  const arithImm = { 0xC6: 'ADD', 0xCE: 'ADC', 0xD6: 'SUB', 0xDE: 'SBC', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' };
  if (arithImm[b0]) return { mnemonic: `${arithImm[b0]} A,${hex(romBytes[addr + 1], 2)}`, length: 2 };

  // Misc single-byte
  const misc1 = {
    0x07: 'RLCA', 0x0F: 'RRCA', 0x17: 'RLA', 0x1F: 'RRA',
    0x27: 'DAA', 0x2F: 'CPL', 0x37: 'SCF', 0x3F: 'CCF',
    0xD9: 'EXX', 0xEB: 'EX DE,HL', 0x08: 'EX AF,AF\'',
    0xF3: 'DI', 0xFB: 'EI', 0xE3: 'EX (SP),HL',
  };
  if (misc1[b0]) return { mnemonic: misc1[b0], length: 1 };

  // LD (BC/DE),A and LD A,(BC/DE)
  if (b0 === 0x02) return { mnemonic: 'LD (BC),A', length: 1 };
  if (b0 === 0x12) return { mnemonic: 'LD (DE),A', length: 1 };
  if (b0 === 0x0A) return { mnemonic: 'LD A,(BC)', length: 1 };
  if (b0 === 0x1A) return { mnemonic: 'LD A,(DE)', length: 1 };
  // LD SP,HL
  if (b0 === 0xF9) return { mnemonic: 'LD SP,HL', length: 1 };

  // OUT (n),A / IN A,(n)
  if (b0 === 0xD3) return { mnemonic: `OUT (${hex(romBytes[addr + 1], 2)}),A`, length: 2 };
  if (b0 === 0xDB) return { mnemonic: `IN A,(${hex(romBytes[addr + 1], 2)})`, length: 2 };

  // Fallback
  return { mnemonic: `DB ${hex(b0, 2)}`, length: 1 };
}

// --- disassemble a region ---

function disasmRegion(start, end) {
  const result = [];
  let pc = start;
  while (pc < end) {
    const inst = disasm(pc);
    const bytes = bytesHex(pc, inst.length);
    result.push({ addr: pc, bytes, mnemonic: inst.mnemonic, length: inst.length });
    pc += inst.length;
  }
  return result;
}

function printInstructions(instructions) {
  for (const i of instructions) {
    console.log(`  ${hex(i.addr)}:  ${i.bytes.padEnd(14)}  ${i.mnemonic}`);
  }
}

// --- scan for byte pattern references ---

function findReferences(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const refs = [];

  // JP/CALL opcodes that take a 3-byte address
  const branchOpcodes = new Set([
    0xC3, 0xCD,                          // JP nn, CALL nn
    0xC2, 0xCA, 0xD2, 0xDA,             // JP cc,nn
    0xE2, 0xEA, 0xF2, 0xFA,
    0xC4, 0xCC, 0xD4, 0xDC,             // CALL cc,nn
    0xE4, 0xEC, 0xF4, 0xFC,
  ]);

  for (let i = 0; i < ROM_LIMIT - 3; i++) {
    if (romBytes[i + 1] === lo && romBytes[i + 2] === mid && romBytes[i + 3] === hi) {
      if (branchOpcodes.has(romBytes[i])) {
        const inst = disasm(i);
        refs.push({ addr: i, bytes: bytesHex(i, inst.length), mnemonic: inst.mnemonic });
      }
    }
  }
  return refs;
}

// --- find function start by scanning backward ---

function findFunctionStart(addr) {
  // Scan backward looking for a RET, JP nn, or HALT that would end the previous function.
  // The byte after such a terminator is likely the start of the function containing `addr`.
  // Also look for function prologues (PUSH AF = F5, PUSH IX = DD E5, etc.)

  // First try: walk backward byte by byte looking for terminators
  const SCAN_BACK = 256;
  const scanStart = Math.max(0, addr - SCAN_BACK);

  // Disassemble forward from scanStart to just past addr, record all instructions
  const instructions = disasmRegion(scanStart, addr + 8);

  // Find the last terminator before our target address
  let bestStart = null;
  for (let idx = 0; idx < instructions.length; idx++) {
    const inst = instructions[idx];
    if (inst.addr >= addr) break;

    const m = inst.mnemonic;
    const isTerminator = (
      m === 'RET' ||
      m.startsWith('JP 0x') ||  // unconditional JP (not JP cc)
      m === 'JP (HL)' ||
      m === 'HALT'
    );

    if (isTerminator && idx + 1 < instructions.length) {
      const nextInst = instructions[idx + 1];
      if (nextInst.addr <= addr) {
        bestStart = nextInst.addr;
      }
    }
  }

  return bestStart;
}

// ================================================================
// MAIN
// ================================================================

console.log('=== Phase 394: Trace function containing 0x030353 ===\n');

let pass = true;

// --- Step 1: Disassemble 0x030300-0x030400 ---
console.log('--- [1] Disassembly of 0x030300 - 0x030400 ---\n');
const region = disasmRegion(0x030300, 0x030400);
printInstructions(region);

// Verify 0x030353 is a JP 0x02FE73
const target = region.find(i => i.addr === 0x030353);
if (target) {
  console.log(`\n  * Confirmed: ${hex(0x030353)} = ${target.mnemonic}`);
  if (!target.mnemonic.includes('0x02fe73')) {
    console.log(`  * WARNING: expected JP 0x02FE73, got ${target.mnemonic}`);
    pass = false;
  }
} else {
  console.log('\n  * WARNING: 0x030353 did not land on an instruction boundary!');
  // Try raw bytes
  console.log(`    Raw bytes at 0x030353: ${bytesHex(0x030353, 4)}`);
  pass = false;
}

// --- Step 2: Find function start ---
console.log('\n--- [2] Function containing 0x030353 ---\n');
const funcStart = findFunctionStart(0x030353);
if (funcStart !== null) {
  console.log(`  Function likely starts at ${hex(funcStart)}`);

  // Find function end — look for RET or unconditional JP after 0x030353
  let funcEnd = 0x030353 + 4; // at least past the JP
  const afterInsts = disasmRegion(0x030353, 0x030400);
  for (const inst of afterInsts) {
    const m = inst.mnemonic;
    funcEnd = inst.addr + inst.length;
    if (m === 'RET' || (m.startsWith('JP 0x') && !m.includes(',')) || m === 'JP (HL)') {
      break;
    }
  }

  console.log(`  Function likely ends at/before ${hex(funcEnd)}`);
  console.log(`\n  Full function disassembly:\n`);
  const funcInsts = disasmRegion(funcStart, funcEnd);
  printInstructions(funcInsts);
} else {
  console.log('  Could not determine function start (no terminator found in scan range).');
  console.log('  Showing 32 bytes before 0x030353:\n');
  const contextInsts = disasmRegion(0x030353 - 32, 0x030360);
  printInstructions(contextInsts);
}

// --- Step 3: Find all callers of 0x030353 ---
console.log('\n--- [3] All callers of 0x030353 ---\n');
const callers353 = findReferences(0x030353);
if (callers353.length === 0) {
  console.log('  No CALL/JP references to 0x030353 found in ROM.');
} else {
  for (const ref of callers353) {
    console.log(`  ${hex(ref.addr)}:  ${ref.bytes.padEnd(14)}  ${ref.mnemonic}`);
  }
}
console.log(`  Total: ${callers353.length} reference(s)`);

// --- Step 4: Find all callers of 0x030300 ---
console.log('\n--- [4] All callers of 0x030300 ---\n');
const callers300 = findReferences(0x030300);
if (callers300.length === 0) {
  console.log('  No CALL/JP references to 0x030300 found in ROM.');
} else {
  for (const ref of callers300) {
    console.log(`  ${hex(ref.addr)}:  ${ref.bytes.padEnd(14)}  ${ref.mnemonic}`);
  }
}
console.log(`  Total: ${callers300.length} reference(s)`);

// --- Step 5: Also find callers of 0x02FE73 for completeness ---
console.log('\n--- [5] All callers of 0x02FE73 (kbdKey reader) ---\n');
const callersFE73 = findReferences(0x02FE73);
if (callersFE73.length === 0) {
  console.log('  No CALL/JP references to 0x02FE73 found in ROM.');
} else {
  for (const ref of callersFE73) {
    console.log(`  ${hex(ref.addr)}:  ${ref.bytes.padEnd(14)}  ${ref.mnemonic}`);
  }
}
console.log(`  Total: ${callersFE73.length} reference(s)`);

// --- Step 6: Also find callers of 0x02FE84 ---
console.log('\n--- [6] All callers of 0x02FE84 (key dispatcher) ---\n');
const callersFE84 = findReferences(0x02FE84);
if (callersFE84.length === 0) {
  console.log('  No CALL/JP references to 0x02FE84 found in ROM.');
} else {
  for (const ref of callersFE84) {
    console.log(`  ${hex(ref.addr)}:  ${ref.bytes.padEnd(14)}  ${ref.mnemonic}`);
  }
}
console.log(`  Total: ${callersFE84.length} reference(s)`);

// --- Summary ---
console.log('\n--- [7] Summary ---\n');
console.log('Key dispatch chain:');
console.log('  Event loop 0x003A73 -> _GetCSC 0x003D5A -> dispatch 0x003A7D');
console.log('    -> handler chain -> 0x030300 (event consumption dispatcher)');
console.log('    -> normal key path at 0x03032C -> JP 0x02FE73 (at 0x030353)');
console.log('    -> 0x02FE73 reads kbdKey from RAM 0xD0058C');
console.log('');
console.log('Three callers of 0x02FE73/0x02FE84:');
console.log('  1. 0x02FFEE — JP NZ 0x02FE84 (internal re-entry)');
console.log('  2. 0x030130 — JP 0x02FE84');
console.log('  3. 0x030353 — JP 0x02FE73');
console.log('');

if (funcStart !== null) {
  console.log(`Function containing 0x030353 starts at ${hex(funcStart)}`);
}
console.log(`Callers of 0x030353: ${callers353.length}`);
console.log(`Callers of 0x030300: ${callers300.length}`);
console.log(`Callers of 0x02FE73: ${callersFE73.length}`);
console.log(`Callers of 0x02FE84: ${callersFE84.length}`);

console.log(`\n=== Phase 394: ${pass ? 'PASS' : 'FAIL'} ===`);
process.exit(pass ? 0 : 1);
