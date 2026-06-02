#!/usr/bin/env node
/**
 * Phase 495 — Static disassembly of 0x06118A (BCALL entry 833)
 *
 * Reads ROM.rom bytes starting at 0x06118A and decodes eZ80 ADL-mode
 * instructions one by one until RET (0xC9) or 200 instructions.
 *
 * Prints address, hex bytes, and mnemonic for each instruction.
 * Summary: byte span, CALL targets, cursor RAM refs, glyph codes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x06118A;
const MAX_INSTRUCTIONS = 200;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read8(addr) { return rom[addr]; }
function read24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function signed8(v) { return v >= 128 ? v - 256 : v; }

// Register names
const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const R16 = ['BC', 'DE', 'HL', 'SP'];
const R16_PUSH = ['BC', 'DE', 'HL', 'AF'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

// ALU mnemonics
const ALU = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];

// CB-prefix bit operations
const CB_OP = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCB(addr) {
  const op = read8(addr);
  const hi2 = (op >> 6) & 3;
  const mid3 = (op >> 3) & 7;
  const lo3 = op & 7;

  if (hi2 === 0) return { len: 1, mne: `${CB_OP[mid3]} ${R8[lo3]}` };
  if (hi2 === 1) return { len: 1, mne: `BIT ${mid3},${R8[lo3]}` };
  if (hi2 === 2) return { len: 1, mne: `RES ${mid3},${R8[lo3]}` };
  return { len: 1, mne: `SET ${mid3},${R8[lo3]}` };
}

function decodeED(addr) {
  const op = read8(addr);

  const hasAddr = [0x43, 0x4B, 0x53, 0x5B, 0x63, 0x6B, 0x73, 0x7B];

  const edMap = {
    0x40: 'IN B,(C)', 0x41: 'OUT (C),B',
    0x42: 'SBC HL,BC', 0x43: () => `LD (${hex(read24(addr + 1))}),BC`,
    0x44: 'NEG', 0x45: 'RETN',
    0x46: 'IM 0', 0x47: 'LD I,A',
    0x48: 'IN C,(C)', 0x49: 'OUT (C),C',
    0x4A: 'ADC HL,BC', 0x4B: () => `LD BC,(${hex(read24(addr + 1))})`,
    0x4D: 'RETI',
    0x4F: 'LD R,A',
    0x50: 'IN D,(C)', 0x51: 'OUT (C),D',
    0x52: 'SBC HL,DE', 0x53: () => `LD (${hex(read24(addr + 1))}),DE`,
    0x56: 'IM 1', 0x57: 'LD A,I',
    0x58: 'IN E,(C)', 0x59: 'OUT (C),E',
    0x5A: 'ADC HL,DE', 0x5B: () => `LD DE,(${hex(read24(addr + 1))})`,
    0x5E: 'IM 2', 0x5F: 'LD A,R',
    0x60: 'IN H,(C)', 0x61: 'OUT (C),H',
    0x62: 'SBC HL,HL', 0x63: () => `LD (${hex(read24(addr + 1))}),HL`,
    0x67: 'RRD',
    0x68: 'IN L,(C)', 0x69: 'OUT (C),L',
    0x6A: 'ADC HL,HL', 0x6B: () => `LD HL,(${hex(read24(addr + 1))})`,
    0x6F: 'RLD',
    0x72: 'SBC HL,SP', 0x73: () => `LD (${hex(read24(addr + 1))}),SP`,
    0x78: 'IN A,(C)', 0x79: 'OUT (C),A',
    0x7A: 'ADC HL,SP', 0x7B: () => `LD SP,(${hex(read24(addr + 1))})`,
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };

  if (edMap[op]) {
    const entry = edMap[op];
    const mne = typeof entry === 'function' ? entry() : entry;
    const len = hasAddr.includes(op) ? 4 : 1;
    return { len, mne };
  }

  return { len: 1, mne: `ED ${hexByte(op)}` };
}

function decodeIXIY(prefix, regName, addr) {
  const op = read8(addr);

  // DD/FD CB d op — bit operations on (IX/IY+d)
  if (op === 0xCB) {
    const d = signed8(read8(addr + 1));
    const op2 = read8(addr + 2);
    const hi2 = (op2 >> 6) & 3;
    const mid3 = (op2 >> 3) & 7;
    const sign = d >= 0 ? '+' : '';
    const target = `(${regName}${sign}${d})`;

    if (hi2 === 0) return { len: 3, mne: `${CB_OP[mid3]} ${target}` };
    if (hi2 === 1) return { len: 3, mne: `BIT ${mid3},${target}` };
    if (hi2 === 2) return { len: 3, mne: `RES ${mid3},${target}` };
    return { len: 3, mne: `SET ${mid3},${target}` };
  }

  // LD r,(IX/IY+d) or LD (IX/IY+d),r
  if ((op & 0xC0) === 0x40) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    const d = signed8(read8(addr + 1));
    const sign = d >= 0 ? '+' : '';
    const target = `(${regName}${sign}${d})`;

    if (src === 6 && dst !== 6) {
      return { len: 2, mne: `LD ${R8[dst]},${target}` };
    }
    if (dst === 6 && src !== 6) {
      return { len: 2, mne: `LD ${target},${R8[src]}` };
    }
  }

  // LD (IX/IY+d),imm8
  if (op === 0x36) {
    const d = signed8(read8(addr + 1));
    const n = read8(addr + 2);
    const sign = d >= 0 ? '+' : '';
    return { len: 3, mne: `LD (${regName}${sign}${d}),${hex(n, 2)}` };
  }

  // LD IX/IY,imm24
  if (op === 0x21) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD ${regName},${hex(imm)}` };
  }

  // LD (imm24),IX/IY
  if (op === 0x22) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD (${hex(imm)}),${regName}` };
  }

  // LD IX/IY,(imm24)
  if (op === 0x2A) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD ${regName},(${hex(imm)})` };
  }

  // PUSH/POP IX/IY
  if (op === 0xE5) return { len: 1, mne: `PUSH ${regName}` };
  if (op === 0xE1) return { len: 1, mne: `POP ${regName}` };

  // INC/DEC IX/IY
  if (op === 0x23) return { len: 1, mne: `INC ${regName}` };
  if (op === 0x2B) return { len: 1, mne: `DEC ${regName}` };

  // ADD IX/IY,rr
  if ((op & 0xCF) === 0x09) {
    const rr = (op >> 4) & 3;
    const src = rr === 2 ? regName : R16[rr];
    return { len: 1, mne: `ADD ${regName},${src}` };
  }

  // EX (SP),IX/IY
  if (op === 0xE3) return { len: 1, mne: `EX (SP),${regName}` };

  // JP (IX/IY)
  if (op === 0xE9) return { len: 1, mne: `JP (${regName})` };

  // LD SP,IX/IY
  if (op === 0xF9) return { len: 1, mne: `LD SP,${regName}` };

  // INC/DEC (IX/IY+d)
  if (op === 0x34) {
    const d = signed8(read8(addr + 1));
    const sign = d >= 0 ? '+' : '';
    return { len: 2, mne: `INC (${regName}${sign}${d})` };
  }
  if (op === 0x35) {
    const d = signed8(read8(addr + 1));
    const sign = d >= 0 ? '+' : '';
    return { len: 2, mne: `DEC (${regName}${sign}${d})` };
  }

  // ALU A,(IX/IY+d)
  if ((op & 0xC7) === 0x86) {
    const aluIdx = (op >> 3) & 7;
    const d = signed8(read8(addr + 1));
    const sign = d >= 0 ? '+' : '';
    return { len: 2, mne: `${ALU[aluIdx]}(${regName}${sign}${d})` };
  }

  // Fallback
  return { len: 1, mne: `${prefix === 0xDD ? 'DD' : 'FD'} ${hexByte(op)}` };
}

function decode(addr) {
  const op = read8(addr);

  // NOP
  if (op === 0x00) return { len: 1, mne: 'NOP' };

  // HALT
  if (op === 0x76) return { len: 1, mne: 'HALT' };

  // RET
  if (op === 0xC9) return { len: 1, mne: 'RET', isRet: true };

  // RET cc
  if ((op & 0xC7) === 0xC0) {
    const cc = (op >> 3) & 7;
    return { len: 1, mne: `RET ${CC[cc]}` };
  }

  // RST
  if ((op & 0xC7) === 0xC7) {
    const t = op & 0x38;
    return { len: 1, mne: `RST ${hex(t, 2)}` };
  }

  // LD r,r' and LD r,(HL) and LD (HL),r
  if ((op & 0xC0) === 0x40 && op !== 0x76) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    return { len: 1, mne: `LD ${R8[dst]},${R8[src]}` };
  }

  // LD r,imm8
  if ((op & 0xC7) === 0x06) {
    const r = (op >> 3) & 7;
    const n = read8(addr + 1);
    return { len: 2, mne: `LD ${R8[r]},${hex(n, 2)}` };
  }

  // LD rr,imm24 (ADL mode)
  if ((op & 0xCF) === 0x01) {
    const rr = (op >> 4) & 3;
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD ${R16[rr]},${hex(imm)}` };
  }

  // LD (imm24),A
  if (op === 0x32) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD (${hex(imm)}),A` };
  }

  // LD A,(imm24)
  if (op === 0x3A) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD A,(${hex(imm)})` };
  }

  // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
  if (op === 0x02) return { len: 1, mne: 'LD (BC),A' };
  if (op === 0x12) return { len: 1, mne: 'LD (DE),A' };
  if (op === 0x0A) return { len: 1, mne: 'LD A,(BC)' };
  if (op === 0x1A) return { len: 1, mne: 'LD A,(DE)' };

  // LD (imm24),HL
  if (op === 0x22) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD (${hex(imm)}),HL` };
  }

  // LD HL,(imm24)
  if (op === 0x2A) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `LD HL,(${hex(imm)})` };
  }

  // INC/DEC rr
  if ((op & 0xCF) === 0x03) {
    const rr = (op >> 4) & 3;
    return { len: 1, mne: `INC ${R16[rr]}` };
  }
  if ((op & 0xCF) === 0x0B) {
    const rr = (op >> 4) & 3;
    return { len: 1, mne: `DEC ${R16[rr]}` };
  }

  // INC/DEC r
  if ((op & 0xC7) === 0x04) {
    const r = (op >> 3) & 7;
    return { len: 1, mne: `INC ${R8[r]}` };
  }
  if ((op & 0xC7) === 0x05) {
    const r = (op >> 3) & 7;
    return { len: 1, mne: `DEC ${R8[r]}` };
  }

  // ADD HL,rr
  if ((op & 0xCF) === 0x09) {
    const rr = (op >> 4) & 3;
    return { len: 1, mne: `ADD HL,${R16[rr]}` };
  }

  // ALU A,r
  if ((op & 0xC0) === 0x80) {
    const aluIdx = (op >> 3) & 7;
    const src = op & 7;
    return { len: 1, mne: `${ALU[aluIdx]}${R8[src]}` };
  }

  // ALU A,imm8
  if ((op & 0xC7) === 0xC6) {
    const aluIdx = (op >> 3) & 7;
    const n = read8(addr + 1);
    return { len: 2, mne: `${ALU[aluIdx]}${hex(n, 2)}` };
  }

  // CALL imm24
  if (op === 0xCD) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `CALL ${hex(imm)}` };
  }

  // CALL cc,imm24
  if ((op & 0xC7) === 0xC4) {
    const cc = (op >> 3) & 7;
    const imm = read24(addr + 1);
    return { len: 4, mne: `CALL ${CC[cc]},${hex(imm)}` };
  }

  // JP imm24
  if (op === 0xC3) {
    const imm = read24(addr + 1);
    return { len: 4, mne: `JP ${hex(imm)}` };
  }

  // JP cc,imm24
  if ((op & 0xC7) === 0xC2) {
    const cc = (op >> 3) & 7;
    const imm = read24(addr + 1);
    return { len: 4, mne: `JP ${CC[cc]},${hex(imm)}` };
  }

  // JP (HL)
  if (op === 0xE9) return { len: 1, mne: 'JP (HL)' };

  // JR e
  if (op === 0x18) {
    const e = signed8(read8(addr + 1));
    const target = addr + 2 + e;
    return { len: 2, mne: `JR ${hex(target)}` };
  }

  // JR cc,e
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const ccIdx = op === 0x20 ? 0 : op === 0x28 ? 1 : op === 0x30 ? 2 : 3;
    const e = signed8(read8(addr + 1));
    const target = addr + 2 + e;
    return { len: 2, mne: `JR ${CC[ccIdx]},${hex(target)}` };
  }

  // DJNZ e
  if (op === 0x10) {
    const e = signed8(read8(addr + 1));
    const target = addr + 2 + e;
    return { len: 2, mne: `DJNZ ${hex(target)}` };
  }

  // PUSH/POP rr
  if ((op & 0xCF) === 0xC5) {
    const rr = (op >> 4) & 3;
    return { len: 1, mne: `PUSH ${R16_PUSH[rr]}` };
  }
  if ((op & 0xCF) === 0xC1) {
    const rr = (op >> 4) & 3;
    return { len: 1, mne: `POP ${R16_PUSH[rr]}` };
  }

  // EX DE,HL
  if (op === 0xEB) return { len: 1, mne: 'EX DE,HL' };

  // EX (SP),HL
  if (op === 0xE3) return { len: 1, mne: 'EX (SP),HL' };

  // EX AF,AF'
  if (op === 0x08) return { len: 1, mne: "EX AF,AF'" };

  // EXX
  if (op === 0xD9) return { len: 1, mne: 'EXX' };

  // DI / EI
  if (op === 0xF3) return { len: 1, mne: 'DI' };
  if (op === 0xFB) return { len: 1, mne: 'EI' };

  // RLCA/RRCA/RLA/RRA
  if (op === 0x07) return { len: 1, mne: 'RLCA' };
  if (op === 0x0F) return { len: 1, mne: 'RRCA' };
  if (op === 0x17) return { len: 1, mne: 'RLA' };
  if (op === 0x1F) return { len: 1, mne: 'RRA' };

  // DAA
  if (op === 0x27) return { len: 1, mne: 'DAA' };

  // CPL
  if (op === 0x2F) return { len: 1, mne: 'CPL' };

  // SCF / CCF
  if (op === 0x37) return { len: 1, mne: 'SCF' };
  if (op === 0x3F) return { len: 1, mne: 'CCF' };

  // OUT (imm8),A / IN A,(imm8)
  if (op === 0xD3) {
    const n = read8(addr + 1);
    return { len: 2, mne: `OUT (${hex(n, 2)}),A` };
  }
  if (op === 0xDB) {
    const n = read8(addr + 1);
    return { len: 2, mne: `IN A,(${hex(n, 2)})` };
  }

  // LD (HL),imm8
  if (op === 0x36) {
    const n = read8(addr + 1);
    return { len: 2, mne: `LD (HL),${hex(n, 2)}` };
  }

  // LD SP,HL
  if (op === 0xF9) return { len: 1, mne: 'LD SP,HL' };

  // CB prefix
  if (op === 0xCB) {
    const inner = decodeCB(addr + 1);
    return { len: 1 + inner.len, mne: inner.mne };
  }

  // ED prefix
  if (op === 0xED) {
    const inner = decodeED(addr + 1);
    return { len: 1 + inner.len, mne: inner.mne };
  }

  // DD prefix (IX)
  if (op === 0xDD) {
    const inner = decodeIXIY(0xDD, 'IX', addr + 1);
    return { len: 1 + inner.len, mne: inner.mne };
  }

  // FD prefix (IY)
  if (op === 0xFD) {
    const inner = decodeIXIY(0xFD, 'IY', addr + 1);
    return { len: 1 + inner.len, mne: inner.mne };
  }

  // Fallback
  return { len: 1, mne: `DB ${hexByte(op)}` };
}

function main() {
  console.log('=== Phase 495 — Static Disassembly of 0x06118A (BCALL Entry 833) ===');
  console.log('');

  let pc = START;
  let instrCount = 0;
  const callTargets = [];
  const jpTargets = [];
  let foundCursorRow = false;
  let foundCursorCol = false;
  const foundGlyphs = [];

  while (instrCount < MAX_INSTRUCTIONS) {
    const instr = decode(pc);
    const bytes = [];
    for (let i = 0; i < instr.len; i++) {
      bytes.push(hexByte(read8(pc + i)));
    }
    const bytesStr = bytes.join(' ').padEnd(15);

    console.log(`  ${hex(pc)}  ${bytesStr}  ${instr.mne}`);

    // Track CALL targets
    const callMatch = instr.mne.match(/^CALL (?:\w+,)?0x([0-9A-F]+)$/);
    if (callMatch) {
      callTargets.push(parseInt(callMatch[1], 16));
    }

    // Track JP targets
    const jpMatch = instr.mne.match(/^JP (?:\w+,)?0x([0-9A-F]+)$/);
    if (jpMatch) {
      jpTargets.push(parseInt(jpMatch[1], 16));
    }

    // Check for cursor row/col address references in the mnemonic
    if (instr.mne.includes('D00595') || instr.mne.includes('0D0595')) foundCursorRow = true;
    if (instr.mne.includes('D00596') || instr.mne.includes('0D0596')) foundCursorCol = true;

    // Check for cursor glyph codes in immediate values
    if (/\b0xE1\b/.test(instr.mne)) foundGlyphs.push({ addr: hex(pc), glyph: '0xE1' });
    if (/\b0xE2\b/.test(instr.mne)) foundGlyphs.push({ addr: hex(pc), glyph: '0xE2' });
    if (/\b0xE3\b/.test(instr.mne)) foundGlyphs.push({ addr: hex(pc), glyph: '0xE3' });

    // Also scan raw bytes for 3-byte address references to cursor RAM
    for (let i = 0; i < instr.len - 2; i++) {
      const addr3 = read24(pc + i);
      if (addr3 === 0xD00595) foundCursorRow = true;
      if (addr3 === 0xD00596) foundCursorCol = true;
    }

    pc += instr.len;
    instrCount++;

    if (instr.isRet) {
      console.log('  --- RET reached ---');
      break;
    }
  }

  if (instrCount >= MAX_INSTRUCTIONS) {
    console.log(`  --- ${MAX_INSTRUCTIONS} instruction limit reached ---`);
  }

  const totalSpan = pc - START;

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Start address:    ${hex(START)}`);
  console.log(`  End address:      ${hex(pc)}`);
  console.log(`  Total byte span:  ${totalSpan} bytes (${hex(totalSpan, 4)})`);
  console.log(`  Instructions:     ${instrCount}`);
  console.log('');
  console.log(`  CALL targets (${callTargets.length}):`);
  for (const t of callTargets) {
    console.log(`    ${hex(t)}`);
  }
  console.log('');
  console.log(`  JP targets (${jpTargets.length}):`);
  for (const t of jpTargets) {
    console.log(`    ${hex(t)}`);
  }
  console.log('');
  console.log(`  Cursor row (D00595) referenced: ${foundCursorRow}`);
  console.log(`  Cursor col (D00596) referenced: ${foundCursorCol}`);
  console.log(`  Cursor glyph codes found:       ${foundGlyphs.length > 0 ? foundGlyphs.map(g => `${g.glyph} at ${g.addr}`).join(', ') : 'none'}`);
  console.log('');
  console.log('Done.');
}

main();
