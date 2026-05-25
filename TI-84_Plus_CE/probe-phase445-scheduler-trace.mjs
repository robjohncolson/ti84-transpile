/**
 * Phase 445 — Scheduler Trace
 * Disassembles ROM bytes at the OS scheduler (0x001600-0x001700)
 * and its primary call target (0x001794-0x001850) in eZ80 ADL mode.
 *
 * Usage: node TI-84_Plus_CE/probe-phase445-scheduler-trace.mjs
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// ---------------------------------------------------------------------------
// Minimal eZ80 ADL-mode disassembler (24-bit addresses)
// ---------------------------------------------------------------------------

function hex2(v) { return v.toString(16).padStart(2, '0'); }
function hex6(v) { return '0x' + v.toString(16).padStart(6, '0'); }
function signed8(v) { return v >= 128 ? v - 256 : v; }

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

const r8  = ['B','C','D','E','H','L','(HL)','A'];
const r16 = ['BC','DE','HL','SP'];
const cc  = ['NZ','Z','NC','C','PO','PE','P','M'];
const alu = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];

function disasmOne(buf, pc) {
  const b0 = buf[pc];
  let len = 1;
  let mnemonic = `DB 0x${hex2(b0)}`;

  // Single-byte instructions
  if (b0 === 0x00) { mnemonic = 'NOP'; }
  else if (b0 === 0x76) { mnemonic = 'HALT'; }
  else if (b0 === 0xC9) { mnemonic = 'RET'; }
  else if (b0 === 0xF3) { mnemonic = 'DI'; }
  else if (b0 === 0xFB) { mnemonic = 'EI'; }
  else if (b0 === 0xAF) { mnemonic = 'XOR A'; }
  else if (b0 === 0xB7) { mnemonic = 'OR A'; }
  else if (b0 === 0x97) { mnemonic = 'SUB A'; }
  else if (b0 === 0x3F) { mnemonic = 'CCF'; }
  else if (b0 === 0x37) { mnemonic = 'SCF'; }
  else if (b0 === 0x2F) { mnemonic = 'CPL'; }
  else if (b0 === 0xD9) { mnemonic = 'EXX'; }
  else if (b0 === 0x08) { mnemonic = "EX AF,AF'"; }
  else if (b0 === 0xEB) { mnemonic = 'EX DE,HL'; }
  else if (b0 === 0xE3) { mnemonic = 'EX (SP),HL'; }
  else if (b0 === 0x3B) { mnemonic = 'DEC SP'; }
  else if (b0 === 0x33) { mnemonic = 'INC SP'; }
  // LD r,r and ALU r patterns (0x40-0xBF except 0x76)
  else if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
    const dst = (b0 >> 3) & 7;
    const src = b0 & 7;
    mnemonic = `LD ${r8[dst]},${r8[src]}`;
  }
  else if (b0 >= 0x80 && b0 <= 0xBF) {
    const op = (b0 >> 3) & 7;
    const src = b0 & 7;
    mnemonic = `${alu[op]}${r8[src]}`;
  }
  // INC/DEC r8
  else if ((b0 & 0xC7) === 0x04) { mnemonic = `INC ${r8[(b0 >> 3) & 7]}`; }
  else if ((b0 & 0xC7) === 0x05) { mnemonic = `DEC ${r8[(b0 >> 3) & 7]}`; }
  // LD r,n
  else if ((b0 & 0xC7) === 0x06) {
    const dst = (b0 >> 3) & 7;
    len = 2;
    mnemonic = `LD ${r8[dst]},0x${hex2(buf[pc + 1])}`;
  }
  // LD rr,nn (16/24-bit immediate in ADL)
  else if ((b0 & 0xCF) === 0x01) {
    const rr = (b0 >> 4) & 3;
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `LD ${r16[rr]},${hex6(nn)}`;
  }
  // INC rr / DEC rr
  else if ((b0 & 0xCF) === 0x03) { mnemonic = `INC ${r16[(b0 >> 4) & 3]}`; }
  else if ((b0 & 0xCF) === 0x0B) { mnemonic = `DEC ${r16[(b0 >> 4) & 3]}`; }
  // ADD HL,rr
  else if ((b0 & 0xCF) === 0x09) { mnemonic = `ADD HL,${r16[(b0 >> 4) & 3]}`; }
  // PUSH/POP
  else if ((b0 & 0xCF) === 0xC5) { mnemonic = `PUSH ${['BC','DE','HL','AF'][(b0 >> 4) & 3]}`; }
  else if ((b0 & 0xCF) === 0xC1) { mnemonic = `POP ${['BC','DE','HL','AF'][(b0 >> 4) & 3]}`; }
  // JP nn
  else if (b0 === 0xC3) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `JP ${hex6(nn)}`;
  }
  // JP cc,nn
  else if ((b0 & 0xC7) === 0xC2) {
    const c = (b0 >> 3) & 7;
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `JP ${cc[c]},${hex6(nn)}`;
  }
  // CALL nn
  else if (b0 === 0xCD) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `CALL ${hex6(nn)}`;
  }
  // CALL cc,nn
  else if ((b0 & 0xC7) === 0xC4) {
    const c = (b0 >> 3) & 7;
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `CALL ${cc[c]},${hex6(nn)}`;
  }
  // RET cc
  else if ((b0 & 0xC7) === 0xC0) {
    const c = (b0 >> 3) & 7;
    mnemonic = `RET ${cc[c]}`;
  }
  // JR e
  else if (b0 === 0x18) {
    const e = signed8(buf[pc + 1]);
    const target = pc + 2 + e;
    len = 2;
    mnemonic = `JR ${hex6(target)}  ; offset ${e >= 0 ? '+' : ''}${e}`;
  }
  // JR cc,e
  else if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const c = ['NZ','Z','NC','C'][(b0 >> 3) & 3];
    const e = signed8(buf[pc + 1]);
    const target = pc + 2 + e;
    len = 2;
    mnemonic = `JR ${c},${hex6(target)}  ; offset ${e >= 0 ? '+' : ''}${e}`;
  }
  // DJNZ
  else if (b0 === 0x10) {
    const e = signed8(buf[pc + 1]);
    const target = pc + 2 + e;
    len = 2;
    mnemonic = `DJNZ ${hex6(target)}  ; offset ${e >= 0 ? '+' : ''}${e}`;
  }
  // RST n
  else if ((b0 & 0xC7) === 0xC7) {
    mnemonic = `RST 0x${hex2(b0 & 0x38)}`;
  }
  // LD A,(nn)
  else if (b0 === 0x3A) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `LD A,(${hex6(nn)})`;
  }
  // LD (nn),A
  else if (b0 === 0x32) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `LD (${hex6(nn)}),A`;
  }
  // LD (nn),HL
  else if (b0 === 0x22) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `LD (${hex6(nn)}),HL`;
  }
  // LD HL,(nn)
  else if (b0 === 0x2A) {
    const nn = read24(buf, pc + 1);
    len = 4;
    mnemonic = `LD HL,(${hex6(nn)})`;
  }
  // LD (HL),n
  else if (b0 === 0x36) {
    len = 2;
    mnemonic = `LD (HL),0x${hex2(buf[pc + 1])}`;
  }
  // LD A,(BC)
  else if (b0 === 0x0A) { mnemonic = 'LD A,(BC)'; }
  // LD A,(DE)
  else if (b0 === 0x1A) { mnemonic = 'LD A,(DE)'; }
  // LD (BC),A
  else if (b0 === 0x02) { mnemonic = 'LD (BC),A'; }
  // LD (DE),A
  else if (b0 === 0x12) { mnemonic = 'LD (DE),A'; }
  // ALU imm
  else if (b0 === 0xC6) { len = 2; mnemonic = `ADD A,0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xCE) { len = 2; mnemonic = `ADC A,0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xD6) { len = 2; mnemonic = `SUB 0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xDE) { len = 2; mnemonic = `SBC A,0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xE6) { len = 2; mnemonic = `AND 0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xEE) { len = 2; mnemonic = `XOR 0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xF6) { len = 2; mnemonic = `OR 0x${hex2(buf[pc + 1])}`; }
  else if (b0 === 0xFE) { len = 2; mnemonic = `CP 0x${hex2(buf[pc + 1])}`; }
  // DD prefix (IX)
  else if (b0 === 0xDD) {
    return disasmIndexed(buf, pc, 'IX');
  }
  // FD prefix (IY)
  else if (b0 === 0xFD) {
    return disasmIndexed(buf, pc, 'IY');
  }
  // ED prefix
  else if (b0 === 0xED) {
    return disasmED(buf, pc);
  }
  // CB prefix (bit ops)
  else if (b0 === 0xCB) {
    return disasmCB(buf, pc);
  }

  return { len, mnemonic, pc };
}

function disasmCB(buf, pc) {
  const b1 = buf[pc + 1];
  const bit = (b1 >> 3) & 7;
  const reg = b1 & 7;
  let mnemonic;

  if ((b1 & 0xC0) === 0x00) {
    const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
    mnemonic = `${ops[bit]} ${r8[reg]}`;
  } else if ((b1 & 0xC0) === 0x40) {
    mnemonic = `BIT ${bit},${r8[reg]}`;
  } else if ((b1 & 0xC0) === 0x80) {
    mnemonic = `RES ${bit},${r8[reg]}`;
  } else {
    mnemonic = `SET ${bit},${r8[reg]}`;
  }

  return { len: 2, mnemonic, pc };
}

function disasmED(buf, pc) {
  const b1 = buf[pc + 1];
  let len = 2;
  let mnemonic = `DB 0xED,0x${hex2(b1)}`;

  // IN0 r,(n)  —  ED 00+r*8  (eZ80)  but actually: ED 38+offset for IN0 A,(n) is ED 38
  // eZ80 IN0/OUT0:
  // IN0 A,(n) = ED 38 n
  // IN0 B,(n) = ED 00 n  ... but standard pattern:
  // IN0 r,(n) = ED (r*8) n  for r=0..7 — but only specific ones exist
  // OUT0 (n),r = ED (r*8+1) n

  // Common ED instructions
  if (b1 === 0x38) {
    // IN0 A,(port)
    len = 3;
    mnemonic = `IN0 A,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x00) {
    // IN0 B,(port)
    len = 3;
    mnemonic = `IN0 B,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x08) {
    // IN0 C,(port)
    len = 3;
    mnemonic = `IN0 C,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x10) {
    // IN0 D,(port)
    len = 3;
    mnemonic = `IN0 D,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x18) {
    // IN0 E,(port)
    len = 3;
    mnemonic = `IN0 E,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x20) {
    // IN0 H,(port)
    len = 3;
    mnemonic = `IN0 H,(0x${hex2(buf[pc + 2])})`;
  }
  else if (b1 === 0x28) {
    // IN0 L,(port)
    len = 3;
    mnemonic = `IN0 L,(0x${hex2(buf[pc + 2])})`;
  }
  // OUT0 (port),r
  else if (b1 === 0x39) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),A`;
  }
  else if (b1 === 0x01) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),B`;
  }
  else if (b1 === 0x09) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),C`;
  }
  else if (b1 === 0x11) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),D`;
  }
  else if (b1 === 0x19) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),E`;
  }
  else if (b1 === 0x21) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),H`;
  }
  else if (b1 === 0x29) {
    len = 3;
    mnemonic = `OUT0 (0x${hex2(buf[pc + 2])}),L`;
  }
  // SBC HL,rr
  else if (b1 === 0x42) { mnemonic = 'SBC HL,BC'; }
  else if (b1 === 0x52) { mnemonic = 'SBC HL,DE'; }
  else if (b1 === 0x62) { mnemonic = 'SBC HL,HL'; }
  else if (b1 === 0x72) { mnemonic = 'SBC HL,SP'; }
  // ADC HL,rr
  else if (b1 === 0x4A) { mnemonic = 'ADC HL,BC'; }
  else if (b1 === 0x5A) { mnemonic = 'ADC HL,DE'; }
  else if (b1 === 0x6A) { mnemonic = 'ADC HL,HL'; }
  else if (b1 === 0x7A) { mnemonic = 'ADC HL,SP'; }
  // LD (nn),rr
  else if (b1 === 0x43) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD (${hex6(nn)}),BC`;
  }
  else if (b1 === 0x53) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD (${hex6(nn)}),DE`;
  }
  else if (b1 === 0x63) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD (${hex6(nn)}),HL`;
  }
  else if (b1 === 0x73) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD (${hex6(nn)}),SP`;
  }
  // LD rr,(nn)
  else if (b1 === 0x4B) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD BC,(${hex6(nn)})`;
  }
  else if (b1 === 0x5B) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD DE,(${hex6(nn)})`;
  }
  else if (b1 === 0x6B) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD HL,(${hex6(nn)})`;
  }
  else if (b1 === 0x7B) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD SP,(${hex6(nn)})`;
  }
  // IN r,(C) — standard Z80 (ED 40+r*8)
  else if (b1 === 0x78) { mnemonic = 'IN A,(C)'; }
  else if (b1 === 0x40) { mnemonic = 'IN B,(C)'; }
  else if (b1 === 0x48) { mnemonic = 'IN C,(C)'; }
  else if (b1 === 0x50) { mnemonic = 'IN D,(C)'; }
  else if (b1 === 0x58) { mnemonic = 'IN E,(C)'; }
  else if (b1 === 0x60) { mnemonic = 'IN H,(C)'; }
  else if (b1 === 0x68) { mnemonic = 'IN L,(C)'; }
  // OUT (C),r
  else if (b1 === 0x79) { mnemonic = 'OUT (C),A'; }
  else if (b1 === 0x41) { mnemonic = 'OUT (C),B'; }
  else if (b1 === 0x49) { mnemonic = 'OUT (C),C'; }
  else if (b1 === 0x51) { mnemonic = 'OUT (C),D'; }
  else if (b1 === 0x59) { mnemonic = 'OUT (C),E'; }
  else if (b1 === 0x61) { mnemonic = 'OUT (C),H'; }
  else if (b1 === 0x69) { mnemonic = 'OUT (C),L'; }
  // IM modes
  else if (b1 === 0x46) { mnemonic = 'IM 0'; }
  else if (b1 === 0x56) { mnemonic = 'IM 1'; }
  else if (b1 === 0x5E) { mnemonic = 'IM 2'; }
  // RETI / RETN
  else if (b1 === 0x4D) { mnemonic = 'RETI'; }
  else if (b1 === 0x45) { mnemonic = 'RETN'; }
  // LD I,A / LD A,I / LD R,A / LD A,R
  else if (b1 === 0x47) { mnemonic = 'LD I,A'; }
  else if (b1 === 0x57) { mnemonic = 'LD A,I'; }
  else if (b1 === 0x4F) { mnemonic = 'LD R,A'; }
  else if (b1 === 0x5F) { mnemonic = 'LD A,R'; }
  // NEG
  else if (b1 === 0x44) { mnemonic = 'NEG'; }
  // RRD / RLD
  else if (b1 === 0x67) { mnemonic = 'RRD'; }
  else if (b1 === 0x6F) { mnemonic = 'RLD'; }
  // Block instructions
  else if (b1 === 0xA0) { mnemonic = 'LDI'; }
  else if (b1 === 0xB0) { mnemonic = 'LDIR'; }
  else if (b1 === 0xA8) { mnemonic = 'LDD'; }
  else if (b1 === 0xB8) { mnemonic = 'LDDR'; }
  else if (b1 === 0xA1) { mnemonic = 'CPI'; }
  else if (b1 === 0xB1) { mnemonic = 'CPIR'; }
  else if (b1 === 0xA9) { mnemonic = 'CPD'; }
  else if (b1 === 0xB9) { mnemonic = 'CPDR'; }
  else if (b1 === 0xA2) { mnemonic = 'INI'; }
  else if (b1 === 0xB2) { mnemonic = 'INIR'; }
  else if (b1 === 0xAA) { mnemonic = 'IND'; }
  else if (b1 === 0xBA) { mnemonic = 'INDR'; }
  else if (b1 === 0xA3) { mnemonic = 'OUTI'; }
  else if (b1 === 0xB3) { mnemonic = 'OTIR'; }
  else if (b1 === 0xAB) { mnemonic = 'OUTD'; }
  else if (b1 === 0xBB) { mnemonic = 'OTDR'; }
  // eZ80: IM (for reading IM state) / IEF stuff
  else if (b1 === 0x7E) { mnemonic = 'LD A,MB'; }  // eZ80: read MBASE
  // eZ80: SLP
  else if (b1 === 0x76) { mnemonic = 'SLP'; }
  // eZ80: TST A,n
  else if (b1 === 0x64) {
    len = 3;
    mnemonic = `TST A,0x${hex2(buf[pc + 2])}`;
  }
  // eZ80: LEA rr,IX+d / LEA rr,IY+d — ED 02/03/32/33 etc
  else if (b1 === 0x02) {
    len = 3;
    mnemonic = `LEA BC,IX+${signed8(buf[pc + 2])}`;
  }
  else if (b1 === 0x03) {
    len = 3;
    mnemonic = `LEA BC,IY+${signed8(buf[pc + 2])}`;
  }
  // eZ80: PEA IX+d = ED 65 d, PEA IY+d = ED 66 d
  // eZ80: TSTIO n = ED 74 n
  // eZ80: MLT rr = ED 4C (BC), ED 5C (DE), ED 6C (HL), ED 7C (SP)
  else if (b1 === 0x4C) { mnemonic = 'MLT BC'; }
  else if (b1 === 0x5C) { mnemonic = 'MLT DE'; }
  else if (b1 === 0x6C) { mnemonic = 'MLT HL'; }
  else if (b1 === 0x7C) { mnemonic = 'MLT SP'; }
  // eZ80: STMIX/RSMIX
  else if (b1 === 0x7D) { mnemonic = 'STMIX'; }
  else if (b1 === 0x7F) { mnemonic = 'RSMIX'; }  // not standard — used by some docs
  // eZ80: LEA IX/IY
  else if (b1 === 0x07) {
    len = 4;
    const nn = read24(buf, pc + 2);
    mnemonic = `LD BC,${hex6(nn)} (ED 07)`;  // actually LD BC,(HL+d) or similar eZ80
  }
  // eZ80: OUT0/IN0 already handled above
  // ED 93 = ? (seen at 0x0012FA) — eZ80 specific
  else if (b1 === 0x93) {
    mnemonic = 'OTIM';  // eZ80 block output, increment
  }

  return { len, mnemonic, pc };
}

function disasmIndexed(buf, pc, reg) {
  const b1 = buf[pc + 1];
  let len = 2;
  let mnemonic = `DB ${reg === 'IX' ? '0xDD' : '0xFD'},0x${hex2(b1)}`;

  // PUSH/POP IX/IY
  if (b1 === 0xE5) { mnemonic = `PUSH ${reg}`; }
  else if (b1 === 0xE1) { mnemonic = `POP ${reg}`; }
  // LD IX/IY,nn
  else if (b1 === 0x21) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD ${reg},${hex6(nn)}`;
  }
  // LD (nn),IX/IY
  else if (b1 === 0x22) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD (${hex6(nn)}),${reg}`;
  }
  // LD IX/IY,(nn)
  else if (b1 === 0x2A) {
    const nn = read24(buf, pc + 2);
    len = 5;
    mnemonic = `LD ${reg},(${hex6(nn)})`;
  }
  // EX (SP),IX/IY
  else if (b1 === 0xE3) { mnemonic = `EX (SP),${reg}`; }
  // JP (IX)/(IY)
  else if (b1 === 0xE9) { mnemonic = `JP (${reg})`; }
  // LD SP,IX/IY
  else if (b1 === 0xF9) { mnemonic = `LD SP,${reg}`; }
  // ADD IX/IY,rr
  else if (b1 === 0x09) { mnemonic = `ADD ${reg},BC`; }
  else if (b1 === 0x19) { mnemonic = `ADD ${reg},DE`; }
  else if (b1 === 0x29) { mnemonic = `ADD ${reg},${reg}`; }
  else if (b1 === 0x39) { mnemonic = `ADD ${reg},SP`; }
  // INC/DEC IX/IY
  else if (b1 === 0x23) { mnemonic = `INC ${reg}`; }
  else if (b1 === 0x2B) { mnemonic = `DEC ${reg}`; }
  // LD r,(IX/IY+d) and LD (IX/IY+d),r
  else if (b1 >= 0x46 && b1 <= 0x7E && (b1 & 7) === 6 && b1 !== 0x76) {
    const dst = (b1 >> 3) & 7;
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `LD ${r8[dst]},(${reg}${d >= 0 ? '+' : ''}${d})`;
  }
  else if (b1 >= 0x70 && b1 <= 0x77 && b1 !== 0x76) {
    const src = b1 & 7;
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `LD (${reg}${d >= 0 ? '+' : ''}${d}),${r8[src]}`;
  }
  // LD (IX/IY+d),n
  else if (b1 === 0x36) {
    const d = signed8(buf[pc + 2]);
    len = 4;
    mnemonic = `LD (${reg}${d >= 0 ? '+' : ''}${d}),0x${hex2(buf[pc + 3])}`;
  }
  // CB prefix (bit ops on (IX/IY+d))
  else if (b1 === 0xCB) {
    const d = signed8(buf[pc + 2]);
    const b3 = buf[pc + 3];
    len = 4;
    const bit = (b3 >> 3) & 7;
    if ((b3 & 0xC0) === 0x40) {
      mnemonic = `BIT ${bit},(${reg}${d >= 0 ? '+' : ''}${d})`;
    } else if ((b3 & 0xC0) === 0x80) {
      mnemonic = `RES ${bit},(${reg}${d >= 0 ? '+' : ''}${d})`;
    } else if ((b3 & 0xC0) === 0xC0) {
      mnemonic = `SET ${bit},(${reg}${d >= 0 ? '+' : ''}${d})`;
    } else {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnemonic = `${ops[bit]} (${reg}${d >= 0 ? '+' : ''}${d})`;
    }
  }
  // ALU (IX/IY+d) — ADD A,(IX+d) etc
  else if (b1 >= 0x86 && b1 <= 0xBE && (b1 & 7) === 6) {
    const op = (b1 >> 3) & 7;
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `${alu[op]}(${reg}${d >= 0 ? '+' : ''}${d})`;
  }
  // INC/DEC (IX/IY+d)
  else if (b1 === 0x34) {
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `INC (${reg}${d >= 0 ? '+' : ''}${d})`;
  }
  else if (b1 === 0x35) {
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `DEC (${reg}${d >= 0 ? '+' : ''}${d})`;
  }
  // CP (IX/IY+d)
  else if (b1 === 0xBE) {
    // already handled above in ALU block
  }
  // LD IXH/IXL etc — undocumented but used by TI OS
  else if (b1 === 0x7E) {
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `LD A,(${reg}${d >= 0 ? '+' : ''}${d})`;
  }
  else if (b1 === 0x75) {
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `LD (${reg}${d >= 0 ? '+' : ''}${d}),L`;
  }
  else if (b1 === 0x74) {
    const d = signed8(buf[pc + 2]);
    len = 3;
    mnemonic = `LD (${reg}${d >= 0 ? '+' : ''}${d}),H`;
  }

  return { len, mnemonic, pc };
}

// ---------------------------------------------------------------------------
// Disassemble a range
// ---------------------------------------------------------------------------

function disasmRange(buf, start, end, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`  ${hex6(start)} - ${hex6(end)}`);
  console.log('='.repeat(70));

  const calls = [];
  const jumps = [];
  let pc = start;
  while (pc < end) {
    const { len, mnemonic } = disasmOne(buf, pc);
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(hex2(buf[pc + i]));
    const byteStr = bytes.join(' ').padEnd(15);
    console.log(`  ${hex6(pc)}:  ${byteStr}  ${mnemonic}`);

    // Collect CALL/JP targets
    if (mnemonic.startsWith('CALL ')) {
      const m = mnemonic.match(/0x[0-9a-f]{6}/);
      if (m) calls.push({ from: pc, target: m[0] });
    }
    if (mnemonic.startsWith('JP ') && !mnemonic.includes('(')) {
      const m = mnemonic.match(/0x[0-9a-f]{6}/);
      if (m) jumps.push({ from: pc, target: m[0] });
    }

    pc += len;
  }

  if (calls.length > 0 || jumps.length > 0) {
    console.log(`\n  --- Branch targets ---`);
    for (const c of calls) {
      console.log(`  CALL ${c.target}  (from ${hex6(c.from)})`);
    }
    for (const j of jumps) {
      console.log(`  JP   ${j.target}  (from ${hex6(j.from)})`);
    }
  }

  return { calls, jumps };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Phase 445: Scheduler Trace — eZ80 ADL Disassembly');
console.log('ROM: TI-84 Plus CE OS 5.8.2.0029');
console.log(`ROM size: ${rom.length} bytes`);

// Region 1: Scheduler at 0x001600-0x001700
const r1 = disasmRange(rom, 0x001600, 0x001700, 'SCHEDULER REGION (0x001600-0x001700)');

// Region 2: Function at 0x001794-0x001850
const r2 = disasmRange(rom, 0x001794, 0x001850, 'SCHEDULER CALL TARGET (0x001794-0x001850)');

// Additional regions for context
disasmRange(rom, 0x001778, 0x001794, 'HELPER: wait-for-event (0x001778-0x001794)');
disasmRange(rom, 0x001713, 0x001778, 'HELPER: pre-scheduler (0x001713-0x001778)');
disasmRange(rom, 0x001580, 0x001600, 'HELPER: display init? (0x001580-0x001600)');
disasmRange(rom, 0x001933, 0x001950, 'HALT wrapper (0x001933-0x001950)');

// Summary
console.log('\n' + '='.repeat(70));
console.log('  ANALYSIS SUMMARY');
console.log('='.repeat(70));

console.log(`
Scheduler loop at 0x001612:
  The scheduler region at 0x001600 contains the main OS event loop.
  Key structure:

  Loop top at 0x0015F7 (re-entry point):
  0x0015F7: CALL 0x001652        ; read keyboard/port status
  0x0015FB: IN0 A,(0x0F)         ; check interrupt status
  0x0015FE: BIT 7,A              ; test bit 7
  0x001600: LD BC,0x000000       ; init counter
  0x001604: JR NZ,0x001644       ; bit 7 set → app handler path
  0x001606: BIT 6,A              ; test bit 6
  0x00160C: JR Z,0x00162C        ; bit 6 clear → slow path
  0x00160E: CALL 0x001794        ; main event handler (fast path)
  0x001612: IN0 A,(0x0F)         ; re-read interrupt status
  0x001615: BIT 6,A              ; still set?
  0x001617: JR Z,0x0015F7        ; no → loop back
  0x001619: BIT 7,A              ; bit 7 set?
  0x00161B: JR Z,0x0015F7        ; no → loop back
  0x00161D: XOR A                ; A = 0
  0x00161E: LD (0xD177B7),A      ; clear display-dirty flag
  0x001622: PUSH IY              ; save IY
  0x001624: CALL 0x00B69E        ; ** DISPLAY REFRESH **
  0x001628: POP IY               ; restore IY
  0x00162A: JR 0x0015F7          ; loop back

  The key finding: between iterations, the scheduler:
  1. Reads port 0x0F to check interrupt/status flags
  2. Bit 6 = event pending, Bit 7 = display ready / high-priority
  3. When BOTH bits 6+7 are set after event processing, calls 0x00B69E for display refresh
  4. Clears display-dirty flag D177B7 before the refresh call
  5. Two sleep paths: light (EI+HALT at 0x001783) and deep (DI+HALT at 0x001933)

CALL targets from scheduler region:`);

const allCalls = [...r1.calls, ...r2.calls];
const uniqueTargets = [...new Set(allCalls.map(c => c.target))].sort();
for (const t of uniqueTargets) {
  const sources = allCalls.filter(c => c.target === t).map(c => hex6(c.from));
  console.log(`  ${t}  <- called from ${sources.join(', ')}`);
}

console.log(`
JP targets:`);
const allJumps = [...r1.jumps, ...r2.jumps];
const uniqueJumps = [...new Set(allJumps.map(j => j.target))].sort();
for (const t of uniqueJumps) {
  const sources = allJumps.filter(j => j.target === t).map(j => hex6(j.from));
  console.log(`  ${t}  <- JP from ${sources.join(', ')}`);
}

console.log(`
Call graph:
  0x001612 (scheduler loop)
    ├── CALL 0x001794 (main event handler)
    │     ├── CALL 0x001778 (wait-for-event: EI+HALT+check flag)
    │     ├── CALL 0x001296 (status check)
    │     ├── CALL 0x001652 (port read / interrupt processing)
    │     ├── CALL 0x001783 (EI+HALT sleep, check D02658)
    │     ├── CALL 0x0017CE (some handler)
    │     └── JP   0x003A0F (error display + key poll)
    ├── CALL 0x00B69E (display/status refresh)
    ├── CALL 0x001296 (status check, from 0x00162F)
    ├── CALL 0x00846E (another handler)
    └── JP   0x001584 (display init / re-entry)

Display refresh: YES — 0x00B69E is called from the scheduler when
port 0x0F bits 6+7 indicate display needs refresh. This is the
mechanism that drives LCD updates between event loop iterations.
`);
