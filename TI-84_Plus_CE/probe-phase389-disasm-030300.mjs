#!/usr/bin/env node

/**
 * Phase 389 — Disassemble 0x030300 (key-processing swap function)
 *
 * Session 388 traced the key event consumption path:
 *   1. 0x0236F9 builds a 3-byte key event on the caller's stack
 *   2. 0x02FE73 reads kbdKey from RAM D0058C, tests OR A
 *   3. 0x02FE84 calls 0x030300 (the "translated-key output" function)
 *   4. 0x08C39C dispatches OS actions by reading D0058C
 *
 * Session 385 identified 0x030300 as a "key-processing swap function" but
 * the detailed disassembly was never completed.
 *
 * This probe statically disassembles 0x030300 for ~300 bytes and the
 * caller context at 0x02FE73-0x02FE90, then documents the control flow,
 * RAM writes, and call targets.
 *
 * Pure static ROM analysis — no transpiled code needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);

// ── Helpers ──────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hex2(v) {
  return '0x' + (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function read16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function rawHex(buf, off, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(buf[off + i].toString(16).toUpperCase().padStart(2, '0'));
  return parts.join(' ');
}

// ── Known RAM addresses for annotation ──────────────────────────────

const RAM_LABELS = {
  0xD0058C: 'kbdKey',
  0xD0058D: 'kbdKey+1',
  0xD0058E: 'kbdToken',
  0xD0058F: 'kbdToken+1',
  0xD007E0: 'contextFlags',
  0xD00080: 'IY_base (flags)',
};

const ADDR_LABELS = {
  0x030300: 'keyProcessSwap',
  0x030357: 'DE=0xFFFF_zeroInit',
  0x030388: 'DE=0xFFFD_handler',
  0x0303BF: 'DE=0xFFFE_menuApp',
  0x02FE73: 'caller_readKbdKey',
  0x08C39C: 'osActionDispatch',
  0x0236F9: 'buildKeyEvent',
};

function labelFor(addr) {
  if (ADDR_LABELS[addr]) return `  ; ${ADDR_LABELS[addr]}`;
  if (RAM_LABELS[addr]) return `  ; ${RAM_LABELS[addr]}`;
  return '';
}

// ── eZ80 ADL-mode disassembler ──────────────────────────────────────
// Covers the common opcodes needed for OS code analysis.

function disasmOne(buf, pc) {
  const b0 = buf[pc];

  // ── eZ80 mode suffix prefixes ────────────────────────────────────
  // In ADL mode: 0x40=.SIS (16-bit ops), 0x49=.LIS, 0x52=.SIL, 0x5B=.LIL
  // These modify the NEXT instruction's operand/address size.
  const MODE_PREFIXES = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
  if (MODE_PREFIXES[b0]) {
    const prefix = MODE_PREFIXES[b0];
    const is16bit = (b0 === 0x40 || b0 === 0x49); // .SIS/.LIS use 16-bit immediates
    const b1 = buf[pc + 1];

    // LD rr,nn (16-bit immediate in .SIS mode = 3 bytes total)
    if (b1 === 0x01) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} LD BC,${hex(nn, 4)}`, ref: nn }; }
    if (b1 === 0x11) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} LD DE,${hex(nn, 4)}`, ref: nn }; }
    if (b1 === 0x21) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} LD HL,${hex(nn, 4)}`, ref: nn }; }
    if (b1 === 0x31) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} LD SP,${hex(nn, 4)}`, ref: nn }; }

    // LD (nn),HL / LD HL,(nn) etc with 16-bit address
    // .SIS addresses get MBASE (0xD0) prepended
    if (b1 === 0x22) { const nn = read16(buf, pc + 2); const full = 0xD00000 | nn; return { len: 4, asm: `${prefix} LD (${hex(nn, 4)}),HL  [MBASE -> ${hex(full)}]`, ref: full, write: full }; }
    if (b1 === 0x2A) { const nn = read16(buf, pc + 2); const full = 0xD00000 | nn; return { len: 4, asm: `${prefix} LD HL,(${hex(nn, 4)})  [MBASE -> ${hex(full)}]`, ref: full, read: full }; }
    if (b1 === 0x32) { const nn = read16(buf, pc + 2); const full = 0xD00000 | nn; return { len: 4, asm: `${prefix} LD (${hex(nn, 4)}),A  [MBASE -> ${hex(full)}]`, ref: full, write: full }; }
    if (b1 === 0x3A) { const nn = read16(buf, pc + 2); const full = 0xD00000 | nn; return { len: 4, asm: `${prefix} LD A,(${hex(nn, 4)})  [MBASE -> ${hex(full)}]`, ref: full, read: full }; }

    // JP/CALL with 16-bit address
    if (b1 === 0xC3) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} JP ${hex(nn, 4)}`, ref: nn, flow: 'jump' }; }
    if (b1 === 0xCD) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} CALL ${hex(nn, 4)}`, ref: nn, flow: 'call' }; }
    // Conditional JP/CALL
    const jpConds = { 0xC2:'NZ', 0xCA:'Z', 0xD2:'NC', 0xDA:'C', 0xE2:'PO', 0xEA:'PE', 0xF2:'P', 0xFA:'M' };
    if (jpConds[b1]) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} JP ${jpConds[b1]},${hex(nn, 4)}`, ref: nn, flow: 'branch' }; }
    const callConds = { 0xC4:'NZ', 0xCC:'Z', 0xD4:'NC', 0xDC:'C', 0xE4:'PO', 0xEC:'PE', 0xF4:'P', 0xFC:'M' };
    if (callConds[b1]) { const nn = read16(buf, pc + 2); return { len: 4, asm: `${prefix} CALL ${callConds[b1]},${hex(nn, 4)}`, ref: nn, flow: 'call' }; }

    // ED-prefixed after .SIS: LD (nn),rr / LD rr,(nn) with 16-bit addresses
    // Note: .SIS 16-bit addresses get MBASE (0xD0) prepended -> 0xD0xxxx
    if (b1 === 0xED) {
      const b2 = buf[pc + 2];
      if ((b2 & 0xCF) === 0x43) {
        const rr = ['BC','DE','HL','SP'][(b2 >> 4) & 3];
        const nn = read16(buf, pc + 3);
        const full = 0xD00000 | nn;  // MBASE=0xD0
        return { len: 5, asm: `${prefix} LD (${hex(nn, 4)}),${rr}  [MBASE -> ${hex(full)}]`, ref: full, write: full };
      }
      if ((b2 & 0xCF) === 0x4B) {
        const rr = ['BC','DE','HL','SP'][(b2 >> 4) & 3];
        const nn = read16(buf, pc + 3);
        const full = 0xD00000 | nn;
        return { len: 5, asm: `${prefix} LD ${rr},(${hex(nn, 4)})  [MBASE -> ${hex(full)}]`, ref: full, read: full };
      }
      return { len: 3, asm: `${prefix} ED ${hex2(b2)}` };
    }

    // Single-byte instructions after prefix (no operand size change)
    // RET variants, PUSH/POP, single-byte ALU, etc.
    const inner = disasmOne(buf, pc + 1);
    return { len: 1 + inner.len, asm: `${prefix} ${inner.asm}`, ref: inner.ref, flow: inner.flow, read: inner.read, write: inner.write };
  }

  // ── Prefix handlers ────────────────────────────────────────────

  // FD CB dd xx  =  IY bit ops
  if (b0 === 0xFD && buf[pc + 1] === 0xCB) {
    const d = buf[pc + 2];  // displacement (signed)
    const op = buf[pc + 3];
    const ds = d > 127 ? d - 256 : d;
    const dispStr = ds >= 0 ? `+${hex2(ds)}` : `-${hex2(-ds)}`;
    const bitN = (op >> 3) & 7;

    if ((op & 0xC7) === 0x46) {
      return { len: 4, asm: `BIT ${bitN},(IY${dispStr})` };
    } else if ((op & 0xC7) === 0x86) {
      return { len: 4, asm: `RES ${bitN},(IY${dispStr})` };
    } else if ((op & 0xC7) === 0xC6) {
      return { len: 4, asm: `SET ${bitN},(IY${dispStr})` };
    }
    return { len: 4, asm: `IY-CB op ${hex2(op)} (IY${dispStr})` };
  }

  // DD CB dd xx  =  IX bit ops
  if (b0 === 0xDD && buf[pc + 1] === 0xCB) {
    const d = buf[pc + 2];
    const op = buf[pc + 3];
    const ds = d > 127 ? d - 256 : d;
    const dispStr = ds >= 0 ? `+${hex2(ds)}` : `-${hex2(-ds)}`;
    const bitN = (op >> 3) & 7;

    if ((op & 0xC7) === 0x46) {
      return { len: 4, asm: `BIT ${bitN},(IX${dispStr})` };
    } else if ((op & 0xC7) === 0x86) {
      return { len: 4, asm: `RES ${bitN},(IX${dispStr})` };
    } else if ((op & 0xC7) === 0xC6) {
      return { len: 4, asm: `SET ${bitN},(IX${dispStr})` };
    }
    return { len: 4, asm: `IX-CB op ${hex2(op)} (IX${dispStr})` };
  }

  // FD prefix = IY ops
  if (b0 === 0xFD) {
    const b1 = buf[pc + 1];
    // LD IY,nn
    if (b1 === 0x21) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD IY,${hex(nn)}`, ref: nn }; }
    // LD (nn),IY
    if (b1 === 0x22) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD (${hex(nn)}),IY`, ref: nn, write: nn }; }
    // LD IY,(nn)
    if (b1 === 0x2A) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD IY,(${hex(nn)})`, ref: nn, read: nn }; }
    // INC IY
    if (b1 === 0x23) return { len: 2, asm: 'INC IY' };
    // DEC IY
    if (b1 === 0x2B) return { len: 2, asm: 'DEC IY' };
    // PUSH IY
    if (b1 === 0xE5) return { len: 2, asm: 'PUSH IY' };
    // POP IY
    if (b1 === 0xE1) return { len: 2, asm: 'POP IY' };
    // ADD IY,rr
    if (b1 === 0x09) return { len: 2, asm: 'ADD IY,BC' };
    if (b1 === 0x19) return { len: 2, asm: 'ADD IY,DE' };
    if (b1 === 0x29) return { len: 2, asm: 'ADD IY,IY' };
    if (b1 === 0x39) return { len: 2, asm: 'ADD IY,SP' };
    // JP (IY)
    if (b1 === 0xE9) return { len: 2, asm: 'JP (IY)' };
    // LD r,(IY+d) / LD (IY+d),r
    if ((b1 & 0xC7) === 0x46) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const r = ['B','C','D','E','H','L','(HL)','A'][(b1 >> 3) & 7];
      return { len: 3, asm: `LD ${r},(IY${ds >= 0 ? '+' : ''}${ds})` };
    }
    if ((b1 & 0xF8) === 0x70) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      return { len: 3, asm: `LD (IY${ds >= 0 ? '+' : ''}${ds}),${r}` };
    }
    // LD (IY+d),n
    if (b1 === 0x36) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const n = buf[pc + 3];
      return { len: 4, asm: `LD (IY${ds >= 0 ? '+' : ''}${ds}),${hex2(n)}` };
    }
    return { len: 2, asm: `FD ${hex2(b1)} (IY prefix)` };
  }

  // DD prefix = IX ops
  if (b0 === 0xDD) {
    const b1 = buf[pc + 1];
    if (b1 === 0x21) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD IX,${hex(nn)}`, ref: nn }; }
    if (b1 === 0x22) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD (${hex(nn)}),IX`, ref: nn, write: nn }; }
    if (b1 === 0x2A) { const nn = read24(buf, pc + 2); return { len: 5, asm: `LD IX,(${hex(nn)})`, ref: nn, read: nn }; }
    if (b1 === 0x23) return { len: 2, asm: 'INC IX' };
    if (b1 === 0x2B) return { len: 2, asm: 'DEC IX' };
    if (b1 === 0xE5) return { len: 2, asm: 'PUSH IX' };
    if (b1 === 0xE1) return { len: 2, asm: 'POP IX' };
    if (b1 === 0x09) return { len: 2, asm: 'ADD IX,BC' };
    if (b1 === 0x19) return { len: 2, asm: 'ADD IX,DE' };
    if (b1 === 0x29) return { len: 2, asm: 'ADD IX,IX' };
    if (b1 === 0x39) return { len: 2, asm: 'ADD IX,SP' };
    if (b1 === 0xE9) return { len: 2, asm: 'JP (IX)' };
    if ((b1 & 0xC7) === 0x46) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const r = ['B','C','D','E','H','L','(HL)','A'][(b1 >> 3) & 7];
      return { len: 3, asm: `LD ${r},(IX${ds >= 0 ? '+' : ''}${ds})` };
    }
    if ((b1 & 0xF8) === 0x70) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      return { len: 3, asm: `LD (IX${ds >= 0 ? '+' : ''}${ds}),${r}` };
    }
    if (b1 === 0x36) {
      const d = buf[pc + 2]; const ds = d > 127 ? d - 256 : d;
      const n = buf[pc + 3];
      return { len: 4, asm: `LD (IX${ds >= 0 ? '+' : ''}${ds}),${hex2(n)}` };
    }
    return { len: 2, asm: `DD ${hex2(b1)} (IX prefix)` };
  }

  // ED prefix = extended ops
  if (b0 === 0xED) {
    const b1 = buf[pc + 1];
    if (b1 === 0xB0) return { len: 2, asm: 'LDIR' };
    if (b1 === 0xB8) return { len: 2, asm: 'LDDR' };
    if (b1 === 0xA0) return { len: 2, asm: 'LDI' };
    if (b1 === 0xA8) return { len: 2, asm: 'LDD' };
    if (b1 === 0xB1) return { len: 2, asm: 'CPIR' };
    if (b1 === 0xB9) return { len: 2, asm: 'CPDR' };
    if (b1 === 0xA1) return { len: 2, asm: 'CPI' };
    if (b1 === 0xA9) return { len: 2, asm: 'CPD' };
    if (b1 === 0x44) return { len: 2, asm: 'NEG' };
    if (b1 === 0x4D) return { len: 2, asm: 'RETI' };
    if (b1 === 0x45) return { len: 2, asm: 'RETN' };
    if (b1 === 0x46) return { len: 2, asm: 'IM 0' };
    if (b1 === 0x56) return { len: 2, asm: 'IM 1' };
    if (b1 === 0x5E) return { len: 2, asm: 'IM 2' };
    if (b1 === 0x47) return { len: 2, asm: 'LD I,A' };
    if (b1 === 0x57) return { len: 2, asm: 'LD A,I' };
    if (b1 === 0x4F) return { len: 2, asm: 'LD R,A' };
    if (b1 === 0x5F) return { len: 2, asm: 'LD A,R' };
    if (b1 === 0x67) return { len: 2, asm: 'RRD' };
    if (b1 === 0x6F) return { len: 2, asm: 'RLD' };
    // IN r,(C)
    if ((b1 & 0xC7) === 0x40) {
      const r = ['B','C','D','E','H','L','F','A'][(b1 >> 3) & 7];
      return { len: 2, asm: `IN ${r},(C)` };
    }
    // OUT (C),r
    if ((b1 & 0xC7) === 0x41) {
      const r = ['B','C','D','E','H','L','0','A'][(b1 >> 3) & 7];
      return { len: 2, asm: `OUT (C),${r}` };
    }
    // SBC HL,rr
    if ((b1 & 0xCF) === 0x42) {
      const rr = ['BC','DE','HL','SP'][(b1 >> 4) & 3];
      return { len: 2, asm: `SBC HL,${rr}` };
    }
    // ADC HL,rr
    if ((b1 & 0xCF) === 0x4A) {
      const rr = ['BC','DE','HL','SP'][(b1 >> 4) & 3];
      return { len: 2, asm: `ADC HL,${rr}` };
    }
    // LD (nn),rr (ED 43/53/63/73)
    if ((b1 & 0xCF) === 0x43) {
      const rr = ['BC','DE','HL','SP'][(b1 >> 4) & 3];
      const nn = read24(buf, pc + 2);
      return { len: 5, asm: `LD (${hex(nn)}),${rr}`, ref: nn, write: nn };
    }
    // LD rr,(nn) (ED 4B/5B/6B/7B)
    if ((b1 & 0xCF) === 0x4B) {
      const rr = ['BC','DE','HL','SP'][(b1 >> 4) & 3];
      const nn = read24(buf, pc + 2);
      return { len: 5, asm: `LD ${rr},(${hex(nn)})`, ref: nn, read: nn };
    }
    // eZ80: TST A,n (ED 64 nn) — used by TI OS
    if (b1 === 0x64) {
      const n = buf[pc + 2];
      return { len: 3, asm: `TST A,${hex2(n)}` };
    }
    return { len: 2, asm: `ED ${hex2(b1)}` };
  }

  // CB prefix = bit/shift ops
  if (b0 === 0xCB) {
    const b1 = buf[pc + 1];
    const r = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
    const bitN = (b1 >> 3) & 7;
    if (b1 < 0x08) return { len: 2, asm: `RLC ${r}` };
    if (b1 < 0x10) return { len: 2, asm: `RRC ${r}` };
    if (b1 < 0x18) return { len: 2, asm: `RL ${r}` };
    if (b1 < 0x20) return { len: 2, asm: `RR ${r}` };
    if (b1 < 0x28) return { len: 2, asm: `SLA ${r}` };
    if (b1 < 0x30) return { len: 2, asm: `SRA ${r}` };
    if (b1 < 0x38) return { len: 2, asm: `SLL ${r}` };
    if (b1 < 0x40) return { len: 2, asm: `SRL ${r}` };
    if (b1 < 0x80) return { len: 2, asm: `BIT ${bitN},${r}` };
    if (b1 < 0xC0) return { len: 2, asm: `RES ${bitN},${r}` };
    return { len: 2, asm: `SET ${bitN},${r}` };
  }

  // ── Single-byte ops ────────────────────────────────────────────

  // NOP
  if (b0 === 0x00) return { len: 1, asm: 'NOP' };
  // HALT
  if (b0 === 0x76) return { len: 1, asm: 'HALT' };
  // DI / EI
  if (b0 === 0xF3) return { len: 1, asm: 'DI' };
  if (b0 === 0xFB) return { len: 1, asm: 'EI' };
  // EX DE,HL
  if (b0 === 0xEB) return { len: 1, asm: 'EX DE,HL' };
  // EX AF,AF'
  if (b0 === 0x08) return { len: 1, asm: "EX AF,AF'" };
  // EXX
  if (b0 === 0xD9) return { len: 1, asm: 'EXX' };
  // EX (SP),HL
  if (b0 === 0xE3) return { len: 1, asm: 'EX (SP),HL' };
  // RLCA/RRCA/RLA/RRA
  if (b0 === 0x07) return { len: 1, asm: 'RLCA' };
  if (b0 === 0x0F) return { len: 1, asm: 'RRCA' };
  if (b0 === 0x17) return { len: 1, asm: 'RLA' };
  if (b0 === 0x1F) return { len: 1, asm: 'RRA' };
  // DAA / CPL / SCF / CCF
  if (b0 === 0x27) return { len: 1, asm: 'DAA' };
  if (b0 === 0x2F) return { len: 1, asm: 'CPL' };
  if (b0 === 0x37) return { len: 1, asm: 'SCF' };
  if (b0 === 0x3F) return { len: 1, asm: 'CCF' };

  // JP (HL)
  if (b0 === 0xE9) return { len: 1, asm: 'JP (HL)', flow: 'indirect_jump' };
  // LD SP,HL
  if (b0 === 0xF9) return { len: 1, asm: 'LD SP,HL' };

  // LD r,r'  0x40-0x7F (except 0x76=HALT)
  if (b0 >= 0x40 && b0 <= 0x7F) {
    const dst = ['B','C','D','E','H','L','(HL)','A'][(b0 >> 3) & 7];
    const src = ['B','C','D','E','H','L','(HL)','A'][b0 & 7];
    return { len: 1, asm: `LD ${dst},${src}` };
  }

  // ALU r:  ADD/ADC/SUB/SBC/AND/XOR/OR/CP  0x80-0xBF
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
    const r = ['B','C','D','E','H','L','(HL)','A'][b0 & 7];
    return { len: 1, asm: `${ops[(b0 >> 3) & 7]}${r}` };
  }

  // INC/DEC r (single byte)
  // INC r = 0x04,0x0C,0x14,0x1C,0x24,0x2C,0x34,0x3C
  if ((b0 & 0xC7) === 0x04) {
    const r = ['B','C','D','E','H','L','(HL)','A'][(b0 >> 3) & 7];
    return { len: 1, asm: `INC ${r}` };
  }
  // DEC r = 0x05,0x0D,0x15,0x1D,0x25,0x2D,0x35,0x3D
  if ((b0 & 0xC7) === 0x05) {
    const r = ['B','C','D','E','H','L','(HL)','A'][(b0 >> 3) & 7];
    return { len: 1, asm: `DEC ${r}` };
  }

  // INC rr = 0x03,0x13,0x23,0x33
  if ((b0 & 0xCF) === 0x03) {
    const rr = ['BC','DE','HL','SP'][(b0 >> 4) & 3];
    return { len: 1, asm: `INC ${rr}` };
  }
  // DEC rr = 0x0B,0x1B,0x2B,0x3B
  if ((b0 & 0xCF) === 0x0B) {
    const rr = ['BC','DE','HL','SP'][(b0 >> 4) & 3];
    return { len: 1, asm: `DEC ${rr}` };
  }

  // ADD HL,rr = 0x09,0x19,0x29,0x39
  if ((b0 & 0xCF) === 0x09) {
    const rr = ['BC','DE','HL','SP'][(b0 >> 4) & 3];
    return { len: 1, asm: `ADD HL,${rr}` };
  }

  // PUSH/POP
  if (b0 === 0xC5) return { len: 1, asm: 'PUSH BC' };
  if (b0 === 0xD5) return { len: 1, asm: 'PUSH DE' };
  if (b0 === 0xE5) return { len: 1, asm: 'PUSH HL' };
  if (b0 === 0xF5) return { len: 1, asm: 'PUSH AF' };
  if (b0 === 0xC1) return { len: 1, asm: 'POP BC' };
  if (b0 === 0xD1) return { len: 1, asm: 'POP DE' };
  if (b0 === 0xE1) return { len: 1, asm: 'POP HL' };
  if (b0 === 0xF1) return { len: 1, asm: 'POP AF' };

  // RET variants
  if (b0 === 0xC9) return { len: 1, asm: 'RET', flow: 'ret' };
  if (b0 === 0xC0) return { len: 1, asm: 'RET NZ', flow: 'cond_ret' };
  if (b0 === 0xC8) return { len: 1, asm: 'RET Z', flow: 'cond_ret' };
  if (b0 === 0xD0) return { len: 1, asm: 'RET NC', flow: 'cond_ret' };
  if (b0 === 0xD8) return { len: 1, asm: 'RET C', flow: 'cond_ret' };
  if (b0 === 0xE0) return { len: 1, asm: 'RET PO', flow: 'cond_ret' };
  if (b0 === 0xE8) return { len: 1, asm: 'RET PE', flow: 'cond_ret' };
  if (b0 === 0xF0) return { len: 1, asm: 'RET P', flow: 'cond_ret' };
  if (b0 === 0xF8) return { len: 1, asm: 'RET M', flow: 'cond_ret' };

  // ── Two-byte ops ───────────────────────────────────────────────

  // LD r,n
  if ((b0 & 0xC7) === 0x06) {
    const r = ['B','C','D','E','H','L','(HL)','A'][(b0 >> 3) & 7];
    const n = buf[pc + 1];
    return { len: 2, asm: `LD ${r},${hex2(n)}` };
  }

  // ALU n:  ADD A,n / ADC A,n / SUB n / SBC A,n / AND n / XOR n / OR n / CP n
  const aluImm = { 0xC6: 'ADD A,', 0xCE: 'ADC A,', 0xD6: 'SUB ', 0xDE: 'SBC A,',
                   0xE6: 'AND ', 0xEE: 'XOR ', 0xF6: 'OR ', 0xFE: 'CP ' };
  if (aluImm[b0]) {
    const n = buf[pc + 1];
    return { len: 2, asm: `${aluImm[b0]}${hex2(n)}` };
  }

  // JR / DJNZ
  if (b0 === 0x18 || b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38 || b0 === 0x10) {
    const names = { 0x18: 'JR', 0x20: 'JR NZ,', 0x28: 'JR Z,', 0x30: 'JR NC,', 0x38: 'JR C,', 0x10: 'DJNZ' };
    const e = buf[pc + 1];
    const signed = e > 127 ? e - 256 : e;
    const target = pc + 2 + signed;
    return { len: 2, asm: `${names[b0]}${hex(target)}`, ref: target, flow: 'branch' };
  }

  // OUT (n),A / IN A,(n)
  if (b0 === 0xD3) return { len: 2, asm: `OUT (${hex2(buf[pc + 1])}),A` };
  if (b0 === 0xDB) return { len: 2, asm: `IN A,(${hex2(buf[pc + 1])})` };

  // RST
  if ((b0 & 0xC7) === 0xC7) {
    const vec = b0 & 0x38;
    return { len: 1, asm: `RST ${hex2(vec)}`, flow: 'call' };
  }

  // ── Three/four-byte ops (24-bit addresses in ADL) ──────────────

  // LD rr,nn (4 bytes in ADL: opcode + 3-byte immediate)
  if (b0 === 0x01) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD BC,${hex(nn)}`, ref: nn }; }
  if (b0 === 0x11) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD DE,${hex(nn)}`, ref: nn }; }
  if (b0 === 0x21) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD HL,${hex(nn)}`, ref: nn }; }
  if (b0 === 0x31) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD SP,${hex(nn)}`, ref: nn }; }

  // LD (BC/DE),A  /  LD A,(BC/DE)
  if (b0 === 0x02) return { len: 1, asm: 'LD (BC),A' };
  if (b0 === 0x12) return { len: 1, asm: 'LD (DE),A' };
  if (b0 === 0x0A) return { len: 1, asm: 'LD A,(BC)' };
  if (b0 === 0x1A) return { len: 1, asm: 'LD A,(DE)' };

  // LD (nn),HL / LD HL,(nn) / LD (nn),A / LD A,(nn)
  if (b0 === 0x22) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD (${hex(nn)}),HL`, ref: nn, write: nn }; }
  if (b0 === 0x2A) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD HL,(${hex(nn)})`, ref: nn, read: nn }; }
  if (b0 === 0x32) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD (${hex(nn)}),A`, ref: nn, write: nn }; }
  if (b0 === 0x3A) { const nn = read24(buf, pc + 1); return { len: 4, asm: `LD A,(${hex(nn)})`, ref: nn, read: nn }; }

  // JP nn / JP cc,nn
  if (b0 === 0xC3) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP ${hex(nn)}`, ref: nn, flow: 'jump' }; }
  if (b0 === 0xC2) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP NZ,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xCA) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP Z,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xD2) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP NC,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xDA) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP C,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xE2) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP PO,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xEA) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP PE,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xF2) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP P,${hex(nn)}`, ref: nn, flow: 'branch' }; }
  if (b0 === 0xFA) { const nn = read24(buf, pc + 1); return { len: 4, asm: `JP M,${hex(nn)}`, ref: nn, flow: 'branch' }; }

  // CALL nn / CALL cc,nn
  if (b0 === 0xCD) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL ${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xC4) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL NZ,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xCC) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL Z,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xD4) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL NC,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xDC) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL C,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xE4) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL PO,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xEC) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL PE,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xF4) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL P,${hex(nn)}`, ref: nn, flow: 'call' }; }
  if (b0 === 0xFC) { const nn = read24(buf, pc + 1); return { len: 4, asm: `CALL M,${hex(nn)}`, ref: nn, flow: 'call' }; }

  // Fallback
  return { len: 1, asm: `DB ${hex2(b0)}` };
}

// ── Disassemble a range ─────────────────────────────────────────────

function disasmRange(startAddr, maxBytes) {
  const lines = [];
  const calls = [];
  const jumps = [];
  const branches = [];
  const ramReads = [];
  const ramWrites = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;

  while (pc < endAddr) {
    const inst = disasmOne(rom, pc);
    const bytes = rawHex(rom, pc, inst.len);
    const label = labelFor(inst.ref || 0);
    const addrLabel = ADDR_LABELS[pc] ? ` <${ADDR_LABELS[pc]}>` : '';

    lines.push(`  ${hex(pc)}:  ${bytes.padEnd(20)} ${inst.asm}${label}${addrLabel}`);

    // Track references
    if (inst.flow === 'call' && inst.ref) calls.push({ from: pc, to: inst.ref });
    if (inst.flow === 'jump' && inst.ref) jumps.push({ from: pc, to: inst.ref });
    if (inst.flow === 'branch' && inst.ref) branches.push({ from: pc, to: inst.ref });
    if (inst.read && inst.read >= 0xD00000) ramReads.push({ addr: inst.read, at: pc, label: RAM_LABELS[inst.read] || '' });
    if (inst.write && inst.write >= 0xD00000) ramWrites.push({ addr: inst.write, at: pc, label: RAM_LABELS[inst.write] || '' });

    pc += inst.len;

    // Stop on unconditional RET or JP (but not conditional)
    if (inst.flow === 'ret' || inst.flow === 'jump' || inst.flow === 'indirect_jump') {
      // Add a blank line but continue disassembly (there may be alternate entry points)
      lines.push('');
    }
  }

  return { lines, calls, jumps, branches, ramReads, ramWrites };
}


// ── Main ────────────────────────────────────────────────────────────

function main() {
  console.log('='.repeat(80));
  console.log('Phase 389 — Disassembly of 0x030300 (key-processing swap function)');
  console.log('='.repeat(80));

  // ── 1. Caller context: 0x02FE73 through 0x02FE90 ─────────────────

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 1: Caller context  0x02FE73 - 0x02FE90');
  console.log('─'.repeat(70));
  console.log('(0x02FE73 reads kbdKey from RAM D0058C, tests OR A, calls 0x030300)\n');

  const caller = disasmRange(0x02FE73, 0x02FE90 - 0x02FE73 + 4);
  caller.lines.forEach(l => console.log(l));

  if (caller.calls.length) {
    console.log('\n  Call targets from caller:');
    caller.calls.forEach(c => console.log(`    ${hex(c.from)} -> ${hex(c.to)}${labelFor(c.to)}`));
  }
  if (caller.ramReads.length) {
    console.log('\n  RAM reads in caller:');
    caller.ramReads.forEach(r => console.log(`    ${hex(r.at)}: reads ${hex(r.addr)} ${r.label}`));
  }

  // ── 2. Main target: 0x030300 for ~320 bytes ───────────────────────

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 2: 0x030300 — key-processing swap function (320 bytes)');
  console.log('─'.repeat(70));
  console.log('Known sub-entry points:');
  console.log('  0x030357 = DE=0xFFFF path (zero-init handler)');
  console.log('  0x030388 = DE=0xFFFD path handler');
  console.log('  0x0303BF = DE=0xFFFE path (menu/app handler)\n');

  const target = disasmRange(0x030300, 320);
  target.lines.forEach(l => console.log(l));

  // ── 3. Summary tables ─────────────────────────────────────────────

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 3: Call targets from 0x030300');
  console.log('─'.repeat(70));
  if (target.calls.length === 0) {
    console.log('  (none found in disassembled range)');
  } else {
    target.calls.forEach(c => {
      console.log(`  ${hex(c.from)} -> CALL ${hex(c.to)}${labelFor(c.to)}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 4: Jump targets from 0x030300');
  console.log('─'.repeat(70));
  if (target.jumps.length === 0) {
    console.log('  (none found)');
  } else {
    target.jumps.forEach(j => {
      console.log(`  ${hex(j.from)} -> JP ${hex(j.to)}${labelFor(j.to)}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 5: Branch targets from 0x030300');
  console.log('─'.repeat(70));
  if (target.branches.length === 0) {
    console.log('  (none found)');
  } else {
    target.branches.forEach(b => {
      console.log(`  ${hex(b.from)} -> ${hex(b.to)}${labelFor(b.to)}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 6: RAM reads from 0x030300');
  console.log('─'.repeat(70));
  if (target.ramReads.length === 0) {
    console.log('  (none found in disassembled range)');
  } else {
    target.ramReads.forEach(r => {
      console.log(`  ${hex(r.at)}: reads ${hex(r.addr)}  ${r.label}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log('SECTION 7: RAM writes from 0x030300');
  console.log('─'.repeat(70));
  if (target.ramWrites.length === 0) {
    console.log('  (none found in disassembled range)');
  } else {
    target.ramWrites.forEach(w => {
      console.log(`  ${hex(w.at)}: writes ${hex(w.addr)}  ${w.label}`);
    });
  }

  // ── 4. Extended disassembly of sub-handlers if they fall outside ───

  // Check if 0x030357, 0x030388, 0x0303BF are within the 320-byte window
  const mainEnd = 0x030300 + 320;  // 0x030440
  const subHandlers = [
    { addr: 0x030357, name: 'DE=0xFFFF zero-init handler' },
    { addr: 0x030388, name: 'DE=0xFFFD handler' },
    { addr: 0x0303BF, name: 'DE=0xFFFE menu/app handler' },
  ];

  for (const sh of subHandlers) {
    if (sh.addr >= mainEnd) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`EXTRA: ${sh.name} at ${hex(sh.addr)} (outside main window)`);
      console.log('─'.repeat(70));
      const extra = disasmRange(sh.addr, 64);
      extra.lines.forEach(l => console.log(l));
    }
  }

  // ── 5. Analysis ───────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80));

  // Collect all unique call targets
  const allCalls = new Set(target.calls.map(c => c.to));
  const allJumps = new Set(target.jumps.map(j => j.to));
  const allRamReads = new Set(target.ramReads.map(r => r.addr));
  const allRamWrites = new Set(target.ramWrites.map(w => w.addr));

  console.log('\nQ1: What does 0x030300 do with the translated key event?');
  console.log('    See disassembly above. The function is a multi-way dispatcher');
  console.log('    that routes based on DE value (0xFFFF, 0xFFFE, 0xFFFD, or normal key).');
  console.log('    It reads/writes key-related RAM to pass the translated key downstream.');

  console.log('\nQ2: Does it write to RAM?');
  console.log(`    kbdKey (D0058C): ${allRamWrites.has(0xD0058C) ? 'YES' : 'not directly in main body'}`);
  console.log(`    kbdToken (D0058E): ${allRamWrites.has(0xD0058E) ? 'YES' : 'not directly in main body'}`);
  console.log(`    contextFlags (D007E0): ${allRamWrites.has(0xD007E0) ? 'YES' : 'not directly in main body'}`);
  if (allRamWrites.size > 0) {
    console.log('    Other RAM writes:');
    for (const addr of allRamWrites) {
      if (addr !== 0xD0058C && addr !== 0xD0058E && addr !== 0xD007E0) {
        console.log(`      ${hex(addr)}  ${RAM_LABELS[addr] || '(unlabeled)'}`);
      }
    }
  }

  console.log('\nQ3: What functions does it call?');
  if (allCalls.size === 0) {
    console.log('    No CALL instructions found in the disassembled range.');
  } else {
    for (const addr of allCalls) {
      console.log(`    CALL ${hex(addr)}${labelFor(addr)}`);
    }
  }

  console.log('\nQ4: Branch conditions?');
  console.log(`    ${target.branches.length} conditional branches found (see Section 5 above).`);

  console.log('\nQ5: How does the key event reach 0x08C39C (OS action dispatcher)?');
  if (allCalls.has(0x08C39C) || allJumps.has(0x08C39C)) {
    console.log('    DIRECT: 0x030300 calls/jumps to 0x08C39C.');
  } else {
    console.log('    INDIRECT: 0x030300 does not directly call 0x08C39C.');
    console.log('    The key event likely reaches the dispatcher through RAM:');
    console.log('    0x030300 writes to kbdKey/kbdToken, then returns to the');
    console.log('    event loop caller which eventually invokes 0x08C39C.');
    console.log('    Check if any CALL targets are intermediaries to 0x08C39C.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF PHASE 389 PROBE');
  console.log('='.repeat(80));
}

main();
