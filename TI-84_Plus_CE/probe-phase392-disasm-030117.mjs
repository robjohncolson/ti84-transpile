/**
 * probe-phase392-disasm-030117.mjs
 *
 * Statically disassemble the function around 0x03011D (the second
 * reference to the translation-table base 0x09F79B).
 * Identify function boundaries, callers, and the CP 0xE2 branch logic.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// ── helpers ──────────────────────────────────────────────────────────────

function r8(off)  { return rom[off]; }
function r16(off) { return rom[off] | (rom[off+1] << 8); }
function r24(off) { return rom[off] | (rom[off+1] << 8) | (rom[off+2] << 16); }
function hex(v, w = 2) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function hexBytes(off, n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(rom[off + i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

// Condition-code table for JR cc and RET cc
const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];

// ── disassembler (eZ80 ADL mode, enough for static analysis) ─────────

function disasmOne(pc) {
  const b = r8(pc);

  // --- RET variants ---
  if (b === 0xC9) return { len: 1, text: 'RET' };
  if ([0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8].includes(b)) {
    const cc = ccNames[(b - 0xC0) >> 3];
    return { len: 1, text: `RET ${cc}` };
  }

  // --- JP / CALL imm24 ---
  if (b === 0xC3) return { len: 4, text: `JP ${hex(r24(pc+1),6)}` };
  if (b === 0xCD) return { len: 4, text: `CALL ${hex(r24(pc+1),6)}` };

  // --- JP cc,imm24 ---
  if ([0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA].includes(b)) {
    const cc = ccNames[(b - 0xC2) >> 3];
    return { len: 4, text: `JP ${cc},${hex(r24(pc+1),6)}` };
  }
  // --- CALL cc,imm24 ---
  if ([0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC].includes(b)) {
    const cc = ccNames[(b - 0xC4) >> 3];
    return { len: 4, text: `CALL ${cc},${hex(r24(pc+1),6)}` };
  }

  // --- JR / JR cc ---
  if (b === 0x18) {
    const off = rom[pc+1]; const rel = off < 128 ? off : off - 256;
    const tgt = pc + 2 + rel;
    return { len: 2, text: `JR ${hex(tgt,6)}  ; rel ${rel >= 0 ? '+' : ''}${rel}` };
  }
  if ([0x20,0x28,0x30,0x38].includes(b)) {
    const cc = ccNames[(b - 0x20) >> 3];
    const off = rom[pc+1]; const rel = off < 128 ? off : off - 256;
    const tgt = pc + 2 + rel;
    return { len: 2, text: `JR ${cc},${hex(tgt,6)}  ; rel ${rel >= 0 ? '+' : ''}${rel}` };
  }

  // --- DJNZ ---
  if (b === 0x10) {
    const off = rom[pc+1]; const rel = off < 128 ? off : off - 256;
    const tgt = pc + 2 + rel;
    return { len: 2, text: `DJNZ ${hex(tgt,6)}  ; rel ${rel >= 0 ? '+' : ''}${rel}` };
  }

  // --- LD r,imm8 ---
  if (b === 0x3E) return { len: 2, text: `LD A,${hex(r8(pc+1))}` };
  if (b === 0x06) return { len: 2, text: `LD B,${hex(r8(pc+1))}` };
  if (b === 0x0E) return { len: 2, text: `LD C,${hex(r8(pc+1))}` };
  if (b === 0x16) return { len: 2, text: `LD D,${hex(r8(pc+1))}` };
  if (b === 0x1E) return { len: 2, text: `LD E,${hex(r8(pc+1))}` };
  if (b === 0x26) return { len: 2, text: `LD H,${hex(r8(pc+1))}` };
  if (b === 0x2E) return { len: 2, text: `LD L,${hex(r8(pc+1))}` };

  // --- LD rr,imm24 ---
  if (b === 0x01) return { len: 4, text: `LD BC,${hex(r24(pc+1),6)}` };
  if (b === 0x11) return { len: 4, text: `LD DE,${hex(r24(pc+1),6)}` };
  if (b === 0x21) return { len: 4, text: `LD HL,${hex(r24(pc+1),6)}` };
  if (b === 0x31) return { len: 4, text: `LD SP,${hex(r24(pc+1),6)}` };

  // --- ADD A,imm8 / ADC A,imm8 / SUB imm8 / SBC A,imm8 ---
  if (b === 0xC6) return { len: 2, text: `ADD A,${hex(r8(pc+1))}` };
  if (b === 0xCE) return { len: 2, text: `ADC A,${hex(r8(pc+1))}` };
  if (b === 0xD6) return { len: 2, text: `SUB ${hex(r8(pc+1))}` };
  if (b === 0xDE) return { len: 2, text: `SBC A,${hex(r8(pc+1))}` };

  // --- CP imm8 ---
  if (b === 0xFE) return { len: 2, text: `CP ${hex(r8(pc+1))}` };

  // --- AND/OR/XOR imm8 ---
  if (b === 0xE6) return { len: 2, text: `AND ${hex(r8(pc+1))}` };
  if (b === 0xF6) return { len: 2, text: `OR ${hex(r8(pc+1))}` };
  if (b === 0xEE) return { len: 2, text: `XOR ${hex(r8(pc+1))}` };

  // --- PUSH/POP ---
  if (b === 0xC5) return { len: 1, text: 'PUSH BC' };
  if (b === 0xD5) return { len: 1, text: 'PUSH DE' };
  if (b === 0xE5) return { len: 1, text: 'PUSH HL' };
  if (b === 0xF5) return { len: 1, text: 'PUSH AF' };
  if (b === 0xC1) return { len: 1, text: 'POP BC' };
  if (b === 0xD1) return { len: 1, text: 'POP DE' };
  if (b === 0xE1) return { len: 1, text: 'POP HL' };
  if (b === 0xF1) return { len: 1, text: 'POP AF' };

  // --- INC/DEC r ---
  const incDecRegs = ['B','C','D','E','H','L','(HL)','A'];
  if ((b & 0xC7) === 0x04) return { len: 1, text: `INC ${incDecRegs[(b >> 3) & 7]}` };
  if ((b & 0xC7) === 0x05) return { len: 1, text: `DEC ${incDecRegs[(b >> 3) & 7]}` };

  // --- INC/DEC rr ---
  if (b === 0x03) return { len: 1, text: 'INC BC' };
  if (b === 0x13) return { len: 1, text: 'INC DE' };
  if (b === 0x23) return { len: 1, text: 'INC HL' };
  if (b === 0x33) return { len: 1, text: 'INC SP' };
  if (b === 0x0B) return { len: 1, text: 'DEC BC' };
  if (b === 0x1B) return { len: 1, text: 'DEC DE' };
  if (b === 0x2B) return { len: 1, text: 'DEC HL' };
  if (b === 0x3B) return { len: 1, text: 'DEC SP' };

  // --- LD (HL),r and LD r,(HL) and LD r,r ---
  if ((b & 0xC0) === 0x40 && b !== 0x76) {
    const dst = incDecRegs[(b >> 3) & 7];
    const src = incDecRegs[b & 7];
    return { len: 1, text: `LD ${dst},${src}` };
  }
  if (b === 0x76) return { len: 1, text: 'HALT' };

  // --- ADD/ADC/SUB/SBC/AND/XOR/OR/CP r ---
  const aluOps = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
  if ((b & 0xC0) === 0x80) {
    const op = aluOps[(b >> 3) & 7];
    const src = incDecRegs[b & 7];
    return { len: 1, text: `${op}${src}` };
  }

  // --- NOP, DI, EI, SCF, CCF, CPL, NEG, RLCA, RRCA, RLA, RRA ---
  if (b === 0x00) return { len: 1, text: 'NOP' };
  if (b === 0xF3) return { len: 1, text: 'DI' };
  if (b === 0xFB) return { len: 1, text: 'EI' };
  if (b === 0x37) return { len: 1, text: 'SCF' };
  if (b === 0x3F) return { len: 1, text: 'CCF' };
  if (b === 0x2F) return { len: 1, text: 'CPL' };
  if (b === 0x07) return { len: 1, text: 'RLCA' };
  if (b === 0x0F) return { len: 1, text: 'RRCA' };
  if (b === 0x17) return { len: 1, text: 'RLA' };
  if (b === 0x1F) return { len: 1, text: 'RRA' };

  // --- LD A,(BC)/(DE) and LD (BC)/(DE),A ---
  if (b === 0x0A) return { len: 1, text: 'LD A,(BC)' };
  if (b === 0x1A) return { len: 1, text: 'LD A,(DE)' };
  if (b === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (b === 0x12) return { len: 1, text: 'LD (DE),A' };

  // --- LD A,(imm24) / LD (imm24),A ---
  if (b === 0x3A) return { len: 4, text: `LD A,(${hex(r24(pc+1),6)})` };
  if (b === 0x32) return { len: 4, text: `LD (${hex(r24(pc+1),6)}),A` };

  // --- LD (imm24),HL / LD HL,(imm24) ---
  if (b === 0x22) return { len: 4, text: `LD (${hex(r24(pc+1),6)}),HL` };
  if (b === 0x2A) return { len: 4, text: `LD HL,(${hex(r24(pc+1),6)})` };

  // --- ADD HL,rr ---
  if (b === 0x09) return { len: 1, text: 'ADD HL,BC' };
  if (b === 0x19) return { len: 1, text: 'ADD HL,DE' };
  if (b === 0x29) return { len: 1, text: 'ADD HL,HL' };
  if (b === 0x39) return { len: 1, text: 'ADD HL,SP' };

  // --- EX DE,HL / EX AF,AF' / EXX ---
  if (b === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (b === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (b === 0xD9) return { len: 1, text: 'EXX' };

  // --- RST ---
  if ((b & 0xC7) === 0xC7) {
    return { len: 1, text: `RST ${hex(b & 0x38)}` };
  }

  // --- OUT (imm8),A / IN A,(imm8) ---
  if (b === 0xD3) return { len: 2, text: `OUT (${hex(r8(pc+1))}),A` };
  if (b === 0xDB) return { len: 2, text: `IN A,(${hex(r8(pc+1))})` };

  // --- LD (imm24),rr / LD rr,(imm24) via ED prefix ---
  // --- CB prefix (bit ops) ---
  if (b === 0xCB) {
    const cb = r8(pc+1);
    const reg = incDecRegs[cb & 7];
    const bit = (cb >> 3) & 7;
    if ((cb & 0xC0) === 0x00) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      return { len: 2, text: `${ops[bit]} ${reg}` };
    }
    if ((cb & 0xC0) === 0x40) return { len: 2, text: `BIT ${bit},${reg}` };
    if ((cb & 0xC0) === 0x80) return { len: 2, text: `RES ${bit},${reg}` };
    if ((cb & 0xC0) === 0xC0) return { len: 2, text: `SET ${bit},${reg}` };
  }

  // --- ED prefix ---
  if (b === 0xED) {
    const ed = r8(pc+1);
    if (ed === 0x44) return { len: 2, text: 'NEG' };
    if (ed === 0x4D) return { len: 2, text: 'RETI' };
    if (ed === 0x45) return { len: 2, text: 'RETN' };
    if (ed === 0xB0) return { len: 2, text: 'LDIR' };
    if (ed === 0xB8) return { len: 2, text: 'LDDR' };
    if (ed === 0xA0) return { len: 2, text: 'LDI' };
    if (ed === 0xA8) return { len: 2, text: 'LDD' };
    if (ed === 0xB1) return { len: 2, text: 'CPIR' };
    if (ed === 0xB9) return { len: 2, text: 'CPDR' };
    if (ed === 0xA1) return { len: 2, text: 'CPI' };
    if (ed === 0xA9) return { len: 2, text: 'CPD' };
    // IN r,(C) / OUT (C),r
    if ((ed & 0xC7) === 0x40) {
      const reg = incDecRegs[(ed >> 3) & 7];
      return { len: 2, text: `IN ${reg},(C)` };
    }
    if ((ed & 0xC7) === 0x41) {
      const reg = incDecRegs[(ed >> 3) & 7];
      return { len: 2, text: `OUT (C),${reg}` };
    }
    // SBC HL,rr / ADC HL,rr
    const rr16 = ['BC','DE','HL','SP'];
    if ((ed & 0xCF) === 0x42) return { len: 2, text: `SBC HL,${rr16[(ed >> 4) & 3]}` };
    if ((ed & 0xCF) === 0x4A) return { len: 2, text: `ADC HL,${rr16[(ed >> 4) & 3]}` };
    // LD (imm24),rr / LD rr,(imm24) — 5 bytes total
    if ((ed & 0xCF) === 0x43) {
      return { len: 5, text: `LD (${hex(r24(pc+2),6)}),${rr16[(ed >> 4) & 3]}` };
    }
    if ((ed & 0xCF) === 0x4B) {
      return { len: 5, text: `LD ${rr16[(ed >> 4) & 3]},(${hex(r24(pc+2),6)})` };
    }
    // IM 0/1/2
    if (ed === 0x46) return { len: 2, text: 'IM 0' };
    if (ed === 0x56) return { len: 2, text: 'IM 1' };
    if (ed === 0x5E) return { len: 2, text: 'IM 2' };
    // LD I,A / LD A,I / LD R,A / LD A,R
    if (ed === 0x47) return { len: 2, text: 'LD I,A' };
    if (ed === 0x57) return { len: 2, text: 'LD A,I' };
    if (ed === 0x4F) return { len: 2, text: 'LD R,A' };
    if (ed === 0x5F) return { len: 2, text: 'LD A,R' };
    // RRD / RLD
    if (ed === 0x67) return { len: 2, text: 'RRD' };
    if (ed === 0x6F) return { len: 2, text: 'RLD' };

    return { len: 2, text: `ED ${hex(ed)}` };
  }

  // --- DD/FD prefix (IX/IY) ---
  if (b === 0xDD || b === 0xFD) {
    const rname = b === 0xDD ? 'IX' : 'IY';
    const b2 = r8(pc+1);
    if (b2 === 0x21) return { len: 5, text: `LD ${rname},${hex(r24(pc+2),6)}` };
    if (b2 === 0xE5) return { len: 2, text: `PUSH ${rname}` };
    if (b2 === 0xE1) return { len: 2, text: `POP ${rname}` };
    if (b2 === 0xE9) return { len: 2, text: `JP (${rname})` };
    if (b2 === 0xF9) return { len: 2, text: `LD SP,${rname}` };
    if (b2 === 0x23) return { len: 2, text: `INC ${rname}` };
    if (b2 === 0x2B) return { len: 2, text: `DEC ${rname}` };
    if (b2 === 0x09) return { len: 2, text: `ADD ${rname},BC` };
    if (b2 === 0x19) return { len: 2, text: `ADD ${rname},DE` };
    if (b2 === 0x29) return { len: 2, text: `ADD ${rname},${rname}` };
    if (b2 === 0x39) return { len: 2, text: `ADD ${rname},SP` };
    // LD r,(IX+d) / LD (IX+d),r
    if (b2 === 0x46) { const d = rom[pc+2]; return { len: 3, text: `LD B,(${rname}+${hex(d)})` }; }
    if (b2 === 0x4E) { const d = rom[pc+2]; return { len: 3, text: `LD C,(${rname}+${hex(d)})` }; }
    if (b2 === 0x56) { const d = rom[pc+2]; return { len: 3, text: `LD D,(${rname}+${hex(d)})` }; }
    if (b2 === 0x5E) { const d = rom[pc+2]; return { len: 3, text: `LD E,(${rname}+${hex(d)})` }; }
    if (b2 === 0x66) { const d = rom[pc+2]; return { len: 3, text: `LD H,(${rname}+${hex(d)})` }; }
    if (b2 === 0x6E) { const d = rom[pc+2]; return { len: 3, text: `LD L,(${rname}+${hex(d)})` }; }
    if (b2 === 0x7E) { const d = rom[pc+2]; return { len: 3, text: `LD A,(${rname}+${hex(d)})` }; }
    if (b2 === 0x70) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),B` }; }
    if (b2 === 0x71) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),C` }; }
    if (b2 === 0x72) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),D` }; }
    if (b2 === 0x73) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),E` }; }
    if (b2 === 0x74) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),H` }; }
    if (b2 === 0x75) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),L` }; }
    if (b2 === 0x77) { const d = rom[pc+2]; return { len: 3, text: `LD (${rname}+${hex(d)}),A` }; }
    if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; return { len: 4, text: `LD (${rname}+${hex(d)}),${hex(v)}` }; }
    // ADD/ADC/SUB/SBC/AND/XOR/OR/CP (IX+d)
    if (b2 === 0x86) { const d = rom[pc+2]; return { len: 3, text: `ADD A,(${rname}+${hex(d)})` }; }
    if (b2 === 0x8E) { const d = rom[pc+2]; return { len: 3, text: `ADC A,(${rname}+${hex(d)})` }; }
    if (b2 === 0x96) { const d = rom[pc+2]; return { len: 3, text: `SUB (${rname}+${hex(d)})` }; }
    if (b2 === 0x9E) { const d = rom[pc+2]; return { len: 3, text: `SBC A,(${rname}+${hex(d)})` }; }
    if (b2 === 0xA6) { const d = rom[pc+2]; return { len: 3, text: `AND (${rname}+${hex(d)})` }; }
    if (b2 === 0xAE) { const d = rom[pc+2]; return { len: 3, text: `XOR (${rname}+${hex(d)})` }; }
    if (b2 === 0xB6) { const d = rom[pc+2]; return { len: 3, text: `OR (${rname}+${hex(d)})` }; }
    if (b2 === 0xBE) { const d = rom[pc+2]; return { len: 3, text: `CP (${rname}+${hex(d)})` }; }
    // INC/DEC (IX+d)
    if (b2 === 0x34) { const d = rom[pc+2]; return { len: 3, text: `INC (${rname}+${hex(d)})` }; }
    if (b2 === 0x35) { const d = rom[pc+2]; return { len: 3, text: `DEC (${rname}+${hex(d)})` }; }
    // LD (imm24),IX / LD IX,(imm24)
    if (b2 === 0x22) return { len: 5, text: `LD (${hex(r24(pc+2),6)}),${rname}` };
    if (b2 === 0x2A) return { len: 5, text: `LD ${rname},(${hex(r24(pc+2),6)})` };
    // DD CB d xx — bit ops on (IX+d)
    if (b2 === 0xCB) {
      const d = rom[pc+2]; const cb = rom[pc+3];
      const bit = (cb >> 3) & 7;
      if ((cb & 0xC0) === 0x40) return { len: 4, text: `BIT ${bit},(${rname}+${hex(d)})` };
      if ((cb & 0xC0) === 0x80) return { len: 4, text: `RES ${bit},(${rname}+${hex(d)})` };
      if ((cb & 0xC0) === 0xC0) return { len: 4, text: `SET ${bit},(${rname}+${hex(d)})` };
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      return { len: 4, text: `${ops[bit]} (${rname}+${hex(d)})` };
    }

    return { len: 2, text: `${b === 0xDD ? 'DD' : 'FD'} ${hex(b2)}` };
  }

  // --- LD (HL),imm8 ---
  if (b === 0x36) return { len: 2, text: `LD (HL),${hex(r8(pc+1))}` };

  // Fallback
  return { len: 1, text: `.db ${hex(b)}` };
}

// ── main ─────────────────────────────────────────────────────────────────

console.log('=== Phase 392: Disassemble 0x030117 Table Reader ===\n');

// 1. Broad disassembly: 0x0300F0 .. 0x030180
console.log('--- Full disassembly 0x0300F0 - 0x030180 ---\n');
const lines = [];
let pc = 0x0300F0;
while (pc < 0x030180) {
  const { len, text } = disasmOne(pc);
  const raw = hexBytes(pc, len);
  const line = `${hex(pc,6)}: ${raw.padEnd(14)} ${text}`;
  lines.push({ pc, text, line });
  console.log(line);
  pc += len;
}

// 2. Find function boundaries around 0x03011D
//    Scan backward for RET/RETI, forward for RET
console.log('\n--- Function boundary search ---\n');

// Backward: find RET-like instruction before 0x03011D
let funcStart = null;
for (let addr = 0x03011C; addr >= 0x030080; addr--) {
  const b = r8(addr);
  if (b === 0xC9 || (b === 0xED && r8(addr+1) === 0x4D)) {
    funcStart = addr + (b === 0xED ? 2 : 1);
    console.log(`Function likely starts at ${hex(funcStart,6)} (RET found at ${hex(addr,6)})`);
    break;
  }
}

// Forward: find RET after 0x03011D
let funcEnd = null;
for (let addr = 0x03011D; addr < 0x030200; addr++) {
  const b = r8(addr);
  if (b === 0xC9) {
    funcEnd = addr;
    console.log(`Function likely ends at ${hex(funcEnd,6)} (RET)`);
    break;
  }
}

// 3. Re-disassemble just the function
if (funcStart !== null && funcEnd !== null) {
  console.log(`\n--- Function ${hex(funcStart,6)} - ${hex(funcEnd,6)} (inclusive) ---\n`);
  pc = funcStart;
  while (pc <= funcEnd) {
    const { len, text } = disasmOne(pc);
    const raw = hexBytes(pc, len);
    console.log(`${hex(pc,6)}: ${raw.padEnd(14)} ${text}`);
    pc += len;
  }
}

// 4. Find what follows CP 0xE2
console.log('\n--- CP 0xE2 analysis ---\n');
for (let addr = 0x0300F0; addr < 0x030180; addr++) {
  if (r8(addr) === 0xFE && r8(addr+1) === 0xE2) {
    console.log(`CP 0xE2 found at ${hex(addr,6)}`);
    // Disassemble next few instructions after CP
    let a = addr + 2;
    for (let i = 0; i < 6 && a < 0x030180; i++) {
      const { len, text } = disasmOne(a);
      const raw = hexBytes(a, len);
      console.log(`  ${hex(a,6)}: ${raw.padEnd(14)} ${text}`);
      a += len;
    }
  }
}

// 5. Search the ENTIRE ROM for CALL/JP to any address in function range
console.log('\n--- Searching entire ROM for callers ---\n');

const searchStart = funcStart || 0x0300F0;
const searchEnd   = funcEnd   || 0x030180;

// Collect all entry candidates (function start + any addresses jumped to from outside)
const entryPoints = new Set();
if (funcStart) entryPoints.add(funcStart);
// Also add the broader range
for (let a = searchStart; a <= searchEnd; a++) entryPoints.add(a);

const callers = [];
for (let addr = 0; addr < rom.length - 4; addr++) {
  const b = rom[addr];
  // CALL imm24 or JP imm24
  if (b === 0xCD || b === 0xC3) {
    const target = r24(addr + 1);
    if (target >= searchStart && target <= searchEnd) {
      callers.push({ from: addr, target, type: b === 0xCD ? 'CALL' : 'JP' });
    }
  }
  // Conditional CALL/JP
  if ([0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA].includes(b)) {
    const target = r24(addr + 1);
    if (target >= searchStart && target <= searchEnd) {
      const cc = ccNames[(b - 0xC2) >> 3];
      callers.push({ from: addr, target, type: `JP ${cc}` });
    }
  }
  if ([0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC].includes(b)) {
    const target = r24(addr + 1);
    if (target >= searchStart && target <= searchEnd) {
      const cc = ccNames[(b - 0xC4) >> 3];
      callers.push({ from: addr, target, type: `CALL ${cc}` });
    }
  }
}

// Group by target
const byTarget = {};
for (const c of callers) {
  const key = hex(c.target, 6);
  if (!byTarget[key]) byTarget[key] = [];
  byTarget[key].push(c);
}

for (const [tgt, refs] of Object.entries(byTarget).sort()) {
  console.log(`Target ${tgt}: ${refs.length} reference(s)`);
  for (const r of refs) {
    // Show context: disassemble a few instructions at the caller
    console.log(`  ${r.type} from ${hex(r.from,6)}`);
    // Show a few instructions before and after for context
    let a = r.from;
    for (let i = 0; i < 3 && a < rom.length - 4; i++) {
      const { len, text } = disasmOne(a);
      const raw = hexBytes(a, len);
      console.log(`    ${hex(a,6)}: ${raw.padEnd(14)} ${text}`);
      a += len;
    }
  }
}

// 6. Annotate what's at 0x09F79B
console.log('\n--- Translation table reference analysis ---\n');
console.log(`Table base at 0x09F79B. Checking ROM bytes:`);
for (let i = 0; i < 16; i++) {
  const addr = 0x09F79B + i;
  if (addr < rom.length) {
    process.stdout.write(hex(rom[addr]) + ' ');
  }
}
console.log('\n');

// Show what ADD A,0x38 does: if scan code comes in A, adding 0x38 shifts it
console.log('ADD A,0x38 analysis:');
console.log('  If A=0x00 (no key), result = 0x38');
console.log('  If A=0x01, result = 0x39');
console.log('  If A=0xAA (=0xE2-0x38), result = 0xE2 → CP 0xE2 sets Z');
console.log(`  0xAA = 170 decimal. Scan code 0xAA = row ${0xA >> 0}, bit pattern check...`);
console.log(`  0xE2 = 226 decimal. This is likely a table size boundary check.`);

// Check what 0xE2 means as a table index
if (0x09F79B + 0xE2 < rom.length) {
  console.log(`  Table[0xE2] at ${hex(0x09F79B + 0xE2, 6)} = ${hex(rom[0x09F79B + 0xE2])}`);
}

console.log('\n--- Raw hex dump around 0x030100-0x030140 for verification ---\n');
for (let row = 0x030100; row < 0x030140; row += 16) {
  let h = hex(row, 6) + ': ';
  for (let i = 0; i < 16 && row + i < rom.length; i++) {
    h += rom[row + i].toString(16).padStart(2, '0') + ' ';
  }
  console.log(h);
}

console.log('\n=== Done ===');
