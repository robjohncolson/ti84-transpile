#!/usr/bin/env node

/**
 * Phase 396 — Mode Flag Decision Tree at 0x02FECF
 *
 * Disassembles the two alternate dispatch paths:
 *   0x02FFF6  key dispatch mode path  (BIT 3,(IY+0x12) set)
 *   0x0300CB  graph mode path         (BIT 4,(IY+0x12) set)
 *
 * Reports RAM addresses, subroutines, IY+offset flags, and termination
 * for each path. Cross-references kbdKey, kbdToken, translation table.
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// Known addresses for cross-referencing
const KNOWN = {
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0x09F79B: 'translationTable',
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

// ------------------------------------------------------------------
// Bit operation names for CB-prefixed opcodes
// ------------------------------------------------------------------
function cbOpName(byte) {
  const hi = (byte >> 6) & 3;   // 0=rot/shift, 1=BIT, 2=RES, 3=SET
  const bit = (byte >> 3) & 7;
  const reg = byte & 7;
  const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
  const opNames = ['rot/shift', 'bit', 'res', 'set'];
  if (hi === 0) {
    // Rotation/shift group
    const subOps = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
    return `${subOps[bit]} ${regNames[reg]}`;
  }
  return `${opNames[hi]} ${bit}, ${regNames[reg]}`;
}

// ------------------------------------------------------------------
// Comprehensive eZ80 decoder
// ------------------------------------------------------------------
function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  // --- FD prefix (IY instructions) ---
  if (b0 === 0xFD) {
    // FD CB dd xx — IY+d bit operations
    if (b1 === 0xCB) {
      const disp = signed8(b2);
      const op = b3;
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      const hi = (op >> 6) & 3;
      const bit = (op >> 3) & 7;
      const opNames = ['rot/shift', 'bit', 'res', 'set'];
      let text;
      if (hi === 0) {
        const subOps = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
        text = `${subOps[bit]} (iy${dispStr})`;
      } else {
        text = `${opNames[hi]} ${bit}, (iy${dispStr})`;
      }
      return {
        addr, length: 4, bytes: bytesAt(addr, 4), text,
        kind: hi === 1 ? 'bit-test' : hi === 2 ? 'bit-res' : hi === 3 ? 'bit-set' : 'bit-rot',
        iyOffset: b2, iyBit: bit, iyDisp: disp,
      };
    }

    // FD 21 xx xx xx — LD IY, imm24
    if (b1 === 0x21) {
      const val = read24(addr + 2);
      return { addr, length: 5, bytes: bytesAt(addr, 5), text: `ld iy, ${hex(val)}`, kind: 'load' };
    }

    // FD 36 dd nn — LD (IY+d), n
    if (b1 === 0x36) {
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      return {
        addr, length: 4, bytes: bytesAt(addr, 4),
        text: `ld (iy${dispStr}), ${hex(b3, 2)}`, kind: 'load-iy',
        iyOffset: b2, iyDisp: disp,
      };
    }

    // FD 46+8*r dd — LD r, (IY+d)   and   FD 70+r dd — LD (IY+d), r
    if ((b1 & 0xC0) === 0x40 && b1 !== 0x76) {
      const dst = (b1 >> 3) & 7;
      const src = b1 & 7;
      const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(iy+d)', 'a'];
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      if (src === 6) {
        // LD r, (IY+d)
        return {
          addr, length: 3, bytes: bytesAt(addr, 3),
          text: `ld ${regNames[dst]}, (iy${dispStr})`, kind: 'load-iy',
          iyOffset: b2, iyDisp: disp,
        };
      }
      if (dst === 6) {
        // LD (IY+d), r
        return {
          addr, length: 3, bytes: bytesAt(addr, 3),
          text: `ld (iy${dispStr}), ${regNames[src]}`, kind: 'store-iy',
          iyOffset: b2, iyDisp: disp,
        };
      }
    }

    // FD E5 = PUSH IY, FD E1 = POP IY
    if (b1 === 0xE5) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'push iy', kind: 'push' };
    if (b1 === 0xE1) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'pop iy', kind: 'pop' };
    // FD E9 = JP (IY)
    if (b1 === 0xE9) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'jp (iy)', kind: 'jp-indirect' };

    // FD BE dd = CP (IY+d)
    if (b1 === 0xBE) {
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      return {
        addr, length: 3, bytes: bytesAt(addr, 3),
        text: `cp (iy${dispStr})`, kind: 'cp-iy',
        iyOffset: b2, iyDisp: disp,
      };
    }

    // FD prefix arithmetic/logic with (IY+d): ADD/ADC/SUB/SBC/AND/XOR/OR
    const aluOps = { 0x86: 'add', 0x8E: 'adc', 0x96: 'sub', 0x9E: 'sbc', 0xA6: 'and', 0xAE: 'xor', 0xB6: 'or' };
    if (aluOps[b1]) {
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      return {
        addr, length: 3, bytes: bytesAt(addr, 3),
        text: `${aluOps[b1]} a, (iy${dispStr})`, kind: 'alu-iy',
        iyOffset: b2, iyDisp: disp,
      };
    }

    // FD 23 = INC IY, FD 2B = DEC IY
    if (b1 === 0x23) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'inc iy', kind: 'inc' };
    if (b1 === 0x2B) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'dec iy', kind: 'dec' };

    // FD 34 dd = INC (IY+d), FD 35 dd = DEC (IY+d)
    if (b1 === 0x34 || b1 === 0x35) {
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      const op = b1 === 0x34 ? 'inc' : 'dec';
      return {
        addr, length: 3, bytes: bytesAt(addr, 3),
        text: `${op} (iy${dispStr})`, kind: `${op}-iy`,
        iyOffset: b2, iyDisp: disp,
      };
    }

    // Generic unrecognized FD
    return { addr, length: 2, bytes: bytesAt(addr, 2), text: `db 0xFD, ${hex(b1, 2)}`, kind: 'db' };
  }

  // --- DD prefix (IX instructions) ---
  if (b0 === 0xDD) {
    if (b1 === 0xCB) {
      const disp = signed8(b2);
      const op = b3;
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      const hi = (op >> 6) & 3;
      const bit = (op >> 3) & 7;
      const opNames = ['rot/shift', 'bit', 'res', 'set'];
      let text;
      if (hi === 0) {
        const subOps = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
        text = `${subOps[bit]} (ix${dispStr})`;
      } else {
        text = `${opNames[hi]} ${bit}, (ix${dispStr})`;
      }
      return { addr, length: 4, bytes: bytesAt(addr, 4), text, kind: 'bit-ix' };
    }
    if (b1 === 0x21) {
      const val = read24(addr + 2);
      return { addr, length: 5, bytes: bytesAt(addr, 5), text: `ld ix, ${hex(val)}`, kind: 'load' };
    }
    if (b1 === 0xE5) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'push ix', kind: 'push' };
    if (b1 === 0xE1) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'pop ix', kind: 'pop' };
    if (b1 === 0xE9) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'jp (ix)', kind: 'jp-indirect' };

    // DD 46+8*r dd — LD r, (IX+d)  and  DD 70+r dd — LD (IX+d), r
    if ((b1 & 0xC0) === 0x40 && b1 !== 0x76) {
      const dst = (b1 >> 3) & 7;
      const src = b1 & 7;
      const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(ix+d)', 'a'];
      const disp = signed8(b2);
      const dispStr = disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`;
      if (src === 6) {
        return { addr, length: 3, bytes: bytesAt(addr, 3), text: `ld ${regNames[dst]}, (ix${dispStr})`, kind: 'load-ix' };
      }
      if (dst === 6) {
        return { addr, length: 3, bytes: bytesAt(addr, 3), text: `ld (ix${dispStr}), ${regNames[src]}`, kind: 'store-ix' };
      }
    }

    return { addr, length: 2, bytes: bytesAt(addr, 2), text: `db 0xDD, ${hex(b1, 2)}`, kind: 'db' };
  }

  // --- ED prefix (extended) ---
  if (b0 === 0xED) {
    if (b1 === 0x52) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'sbc hl, de', kind: 'sbc' };
    if (b1 === 0x42) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'sbc hl, bc', kind: 'sbc' };
    if (b1 === 0x4A) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'adc hl, bc', kind: 'adc' };
    if (b1 === 0x5A) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'adc hl, de', kind: 'adc' };
    if (b1 === 0xB0) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ldir', kind: 'block' };
    if (b1 === 0xB8) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'lddr', kind: 'block' };
    if (b1 === 0xA0) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ldi', kind: 'block' };
    if (b1 === 0xA8) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ldd', kind: 'block' };
    if (b1 === 0xB1) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'cpir', kind: 'block' };
    if (b1 === 0x44) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'neg', kind: 'neg' };
    if (b1 === 0x4D) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'reti', kind: 'ret' };
    if (b1 === 0x45) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'retn', kind: 'ret' };
    if (b1 === 0x46) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'im 0', kind: 'im' };
    if (b1 === 0x56) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'im 1', kind: 'im' };
    if (b1 === 0x5E) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'im 2', kind: 'im' };
    // ED 4B xx xx xx = LD BC, (addr)   ED 5B = LD DE, (addr)   ED 6B = LD HL, (addr)
    if (b1 === 0x4B) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld bc, (${hex(a)})`, kind: 'load', target: a }; }
    if (b1 === 0x5B) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld de, (${hex(a)})`, kind: 'load', target: a }; }
    if (b1 === 0x6B) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld hl, (${hex(a)})`, kind: 'load', target: a }; }
    // ED 43 = LD (addr), BC   ED 53 = LD (addr), DE   ED 63 = LD (addr), HL
    if (b1 === 0x43) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld (${hex(a)}), bc`, kind: 'store', target: a }; }
    if (b1 === 0x53) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld (${hex(a)}), de`, kind: 'store', target: a }; }
    if (b1 === 0x63) { const a = read24(addr+2); return { addr, length: 5, bytes: bytesAt(addr,5), text: `ld (${hex(a)}), hl`, kind: 'store', target: a }; }
    // ED 47 = LD I,A   ED 4F = LD R,A   ED 57 = LD A,I   ED 5F = LD A,R
    if (b1 === 0x47) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ld i, a', kind: 'load' };
    if (b1 === 0x4F) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ld r, a', kind: 'load' };
    if (b1 === 0x57) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ld a, i', kind: 'load' };
    if (b1 === 0x5F) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'ld a, r', kind: 'load' };
    // IN/OUT
    if (b1 === 0x78) return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'in a, (c)', kind: 'in' };
    return { addr, length: 2, bytes: bytesAt(addr, 2), text: `db 0xED, ${hex(b1, 2)}`, kind: 'db' };
  }

  // --- CB prefix (bit operations on registers) ---
  if (b0 === 0xCB) {
    return { addr, length: 2, bytes: bytesAt(addr, 2), text: cbOpName(b1), kind: 'cb' };
  }

  // --- SIS/SIL/LIS/LIL prefixes (0x40, 0x52, 0x49, 0x5B in eZ80) ---
  // Only handle the common case: 0x52 ED 52 = SIL SBC HL,DE
  if (b0 === 0x52 && b1 === 0xED && b2 === 0x52) {
    return { addr, length: 3, bytes: bytesAt(addr, 3), text: 'sil sbc hl, de', kind: 'sbc', prefix: 'sil' };
  }

  // --- Standard single-byte and multi-byte opcodes ---

  // NOP
  if (b0 === 0x00) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'nop', kind: 'nop' };

  // HALT
  if (b0 === 0x76) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'halt', kind: 'halt' };

  // DI / EI
  if (b0 === 0xF3) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'di', kind: 'di' };
  if (b0 === 0xFB) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ei', kind: 'ei' };

  // LD r,r and LD r,imm8
  if (b0 === 0x3E) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld a, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x06) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld b, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x0E) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld c, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x16) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld d, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x1E) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld e, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x26) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld h, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x2E) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld l, ${hex(b1, 2)}`, kind: 'load', value: b1 };
  if (b0 === 0x36) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `ld (hl), ${hex(b1, 2)}`, kind: 'store', value: b1 };

  // LD r,r group (0x40-0x7F minus 0x76=HALT)
  if ((b0 & 0xC0) === 0x40 && b0 !== 0x76) {
    const dst = (b0 >> 3) & 7;
    const src = b0 & 7;
    const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
    return { addr, length: 1, bytes: bytesAt(addr, 1), text: `ld ${regNames[dst]}, ${regNames[src]}`, kind: 'load' };
  }

  // 16-bit loads
  if (b0 === 0x01) { const v = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld bc, ${hex(v)}`, kind: 'load', value: v }; }
  if (b0 === 0x11) { const v = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld de, ${hex(v)}`, kind: 'load', value: v }; }
  if (b0 === 0x21) { const v = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld hl, ${hex(v)}`, kind: 'load', value: v }; }
  if (b0 === 0x31) { const v = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld sp, ${hex(v)}`, kind: 'load', value: v }; }

  // LD A,(addr) / LD (addr),A
  if (b0 === 0x3A) { const a = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld a, (${hex(a)})`, kind: 'load', target: a }; }
  if (b0 === 0x32) { const a = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld (${hex(a)}), a`, kind: 'store', target: a }; }

  // LD HL,(addr) / LD (addr),HL
  if (b0 === 0x2A) { const a = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld hl, (${hex(a)})`, kind: 'load', target: a }; }
  if (b0 === 0x22) { const a = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `ld (${hex(a)}), hl`, kind: 'store', target: a }; }

  // LD A,(BC) / LD A,(DE) / LD (BC),A / LD (DE),A
  if (b0 === 0x0A) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld a, (bc)', kind: 'load' };
  if (b0 === 0x1A) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld a, (de)', kind: 'load' };
  if (b0 === 0x02) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld (bc), a', kind: 'store' };
  if (b0 === 0x12) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld (de), a', kind: 'store' };

  // PUSH / POP
  if (b0 === 0xC5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push bc', kind: 'push' };
  if (b0 === 0xD5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push de', kind: 'push' };
  if (b0 === 0xE5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push hl', kind: 'push' };
  if (b0 === 0xF5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push af', kind: 'push' };
  if (b0 === 0xC1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop bc', kind: 'pop' };
  if (b0 === 0xD1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop de', kind: 'pop' };
  if (b0 === 0xE1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop hl', kind: 'pop' };
  if (b0 === 0xF1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop af', kind: 'pop' };

  // JP / CALL unconditional
  if (b0 === 0xC3) { const t = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `jp ${hex(t)}`, kind: 'jp', target: t }; }
  if (b0 === 0xCD) { const t = read24(addr+1); return { addr, length: 4, bytes: bytesAt(addr, 4), text: `call ${hex(t)}`, kind: 'call', target: t }; }
  if (b0 === 0xE9) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'jp (hl)', kind: 'jp-indirect' };

  // JP conditional
  const jpConds = { 0xC2: 'nz', 0xCA: 'z', 0xD2: 'nc', 0xDA: 'c', 0xE2: 'po', 0xEA: 'pe', 0xF2: 'p', 0xFA: 'm' };
  if (jpConds[b0]) {
    const t = read24(addr+1);
    return { addr, length: 4, bytes: bytesAt(addr, 4), text: `jp ${jpConds[b0]}, ${hex(t)}`, kind: 'jp-conditional', condition: jpConds[b0], target: t };
  }

  // CALL conditional
  const callConds = { 0xC4: 'nz', 0xCC: 'z', 0xD4: 'nc', 0xDC: 'c', 0xE4: 'po', 0xEC: 'pe', 0xF4: 'p', 0xFC: 'm' };
  if (callConds[b0]) {
    const t = read24(addr+1);
    return { addr, length: 4, bytes: bytesAt(addr, 4), text: `call ${callConds[b0]}, ${hex(t)}`, kind: 'call-conditional', condition: callConds[b0], target: t };
  }

  // JR
  if (b0 === 0x18) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `jr ${hex(t)}`, kind: 'jr', target: t }; }
  if (b0 === 0x20) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `jr nz, ${hex(t)}`, kind: 'jr-conditional', condition: 'nz', target: t }; }
  if (b0 === 0x28) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `jr z, ${hex(t)}`, kind: 'jr-conditional', condition: 'z', target: t }; }
  if (b0 === 0x30) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `jr nc, ${hex(t)}`, kind: 'jr-conditional', condition: 'nc', target: t }; }
  if (b0 === 0x38) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `jr c, ${hex(t)}`, kind: 'jr-conditional', condition: 'c', target: t }; }
  // DJNZ
  if (b0 === 0x10) { const t = (addr + 2 + signed8(b1)) & 0xFFFFFF; return { addr, length: 2, bytes: bytesAt(addr, 2), text: `djnz ${hex(t)}`, kind: 'djnz', target: t }; }

  // RET
  if (b0 === 0xC9) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret', kind: 'ret' };
  if (b0 === 0xC0) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret nz', kind: 'ret-conditional', condition: 'nz' };
  if (b0 === 0xC8) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret z', kind: 'ret-conditional', condition: 'z' };
  if (b0 === 0xD0) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret nc', kind: 'ret-conditional', condition: 'nc' };
  if (b0 === 0xD8) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret c', kind: 'ret-conditional', condition: 'c' };
  if (b0 === 0xE0) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret po', kind: 'ret-conditional', condition: 'po' };
  if (b0 === 0xE8) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret pe', kind: 'ret-conditional', condition: 'pe' };
  if (b0 === 0xF0) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret p', kind: 'ret-conditional', condition: 'p' };
  if (b0 === 0xF8) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret m', kind: 'ret-conditional', condition: 'm' };

  // RST
  const rstTargets = { 0xC7: 0x00, 0xCF: 0x08, 0xD7: 0x10, 0xDF: 0x18, 0xE7: 0x20, 0xEF: 0x28, 0xF7: 0x30, 0xFF: 0x38 };
  if (rstTargets[b0] !== undefined) {
    return { addr, length: 1, bytes: bytesAt(addr, 1), text: `rst ${hex(rstTargets[b0], 2)}`, kind: 'rst', target: rstTargets[b0] };
  }

  // CP imm8
  if (b0 === 0xFE) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `cp ${hex(b1, 2)}`, kind: 'cp', value: b1 };

  // ALU A,r (80-BF) except (hl) variants handled generically
  if ((b0 & 0xF8) === 0xB8 && b0 !== 0xFE) {
    const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
    return { addr, length: 1, bytes: bytesAt(addr, 1), text: `cp ${regNames[b0 & 7]}`, kind: 'cp' };
  }

  // ADD/ADC/SUB/SBC/AND/XOR/OR A,imm8
  if (b0 === 0xC6) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `add a, ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xCE) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `adc a, ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xD6) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `sub ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xDE) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `sbc a, ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xE6) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `and ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xEE) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `xor ${hex(b1, 2)}`, kind: 'alu', value: b1 };
  if (b0 === 0xF6) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `or ${hex(b1, 2)}`, kind: 'alu', value: b1 };

  // ALU A,r group (0x80-0xBF)
  if ((b0 & 0xC0) === 0x80) {
    const ops = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
    const op = ops[(b0 >> 3) & 7];
    const regNames = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
    return { addr, length: 1, bytes: bytesAt(addr, 1), text: `${op} ${regNames[b0 & 7]}`, kind: 'alu' };
  }

  // INC/DEC r8
  const incR = { 0x04: 'b', 0x0C: 'c', 0x14: 'd', 0x1C: 'e', 0x24: 'h', 0x2C: 'l', 0x34: '(hl)', 0x3C: 'a' };
  const decR = { 0x05: 'b', 0x0D: 'c', 0x15: 'd', 0x1D: 'e', 0x25: 'h', 0x2D: 'l', 0x35: '(hl)', 0x3D: 'a' };
  if (incR[b0]) return { addr, length: 1, bytes: bytesAt(addr, 1), text: `inc ${incR[b0]}`, kind: 'inc' };
  if (decR[b0]) return { addr, length: 1, bytes: bytesAt(addr, 1), text: `dec ${decR[b0]}`, kind: 'dec' };

  // INC/DEC r16
  if (b0 === 0x03) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'inc bc', kind: 'inc' };
  if (b0 === 0x13) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'inc de', kind: 'inc' };
  if (b0 === 0x23) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'inc hl', kind: 'inc' };
  if (b0 === 0x33) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'inc sp', kind: 'inc' };
  if (b0 === 0x0B) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'dec bc', kind: 'dec' };
  if (b0 === 0x1B) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'dec de', kind: 'dec' };
  if (b0 === 0x2B) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'dec hl', kind: 'dec' };
  if (b0 === 0x3B) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'dec sp', kind: 'dec' };

  // ADD HL, r16
  if (b0 === 0x09) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'add hl, bc', kind: 'add16' };
  if (b0 === 0x19) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'add hl, de', kind: 'add16' };
  if (b0 === 0x29) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'add hl, hl', kind: 'add16' };
  if (b0 === 0x39) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'add hl, sp', kind: 'add16' };

  // Misc single byte
  if (b0 === 0xB7) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'or a', kind: 'or-a' };
  if (b0 === 0xAF) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'xor a', kind: 'xor-a' };
  if (b0 === 0xEB) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ex de, hl', kind: 'exchange' };
  if (b0 === 0xE3) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ex (sp), hl', kind: 'exchange' };
  if (b0 === 0x08) return { addr, length: 1, bytes: bytesAt(addr, 1), text: "ex af, af'", kind: 'exchange' };
  if (b0 === 0xD9) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'exx', kind: 'exchange' };
  if (b0 === 0x37) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'scf', kind: 'flag' };
  if (b0 === 0x3F) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ccf', kind: 'flag' };
  if (b0 === 0x2F) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'cpl', kind: 'cpl' };
  if (b0 === 0x27) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'daa', kind: 'daa' };
  if (b0 === 0x07) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'rlca', kind: 'rotate' };
  if (b0 === 0x0F) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'rrca', kind: 'rotate' };
  if (b0 === 0x17) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'rla', kind: 'rotate' };
  if (b0 === 0x1F) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'rra', kind: 'rotate' };

  // OUT (n),A / IN A,(n)
  if (b0 === 0xD3) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `out (${hex(b1, 2)}), a`, kind: 'out' };
  if (b0 === 0xDB) return { addr, length: 2, bytes: bytesAt(addr, 2), text: `in a, (${hex(b1, 2)})`, kind: 'in' };

  // EX (SP), HL already handled; LD SP, HL
  if (b0 === 0xF9) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld sp, hl', kind: 'load' };

  // Fallback
  return { addr, length: 1, bytes: bytesAt(addr, 1), text: `db ${hex(b0, 2)}`, kind: 'db' };
}

// ------------------------------------------------------------------
// Disassembly helpers
// ------------------------------------------------------------------

function disassembleRange(start, length) {
  const lines = [];
  let pc = start;
  const end = start + length;
  while (pc < end) {
    const line = decodeAt(pc);
    lines.push(line);
    pc += line.length;
  }
  return lines;
}

function disassembleUntilTerminator(start, maxBytes) {
  const lines = [];
  let pc = start;
  const end = start + maxBytes;
  while (pc < end) {
    const line = decodeAt(pc);
    lines.push(line);
    pc += line.length;
    // Stop at unconditional terminator
    if (line.kind === 'ret' || line.kind === 'jp' || line.kind === 'jr' || line.kind === 'jp-indirect') break;
  }
  return lines;
}

// ------------------------------------------------------------------
// Analysis helpers
// ------------------------------------------------------------------

function printSection(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function printLines(lines) {
  for (const line of lines) {
    const label = line.target && KNOWN[line.target] ? `  ; ${KNOWN[line.target]}` : '';
    console.log(`${hex(line.addr)}  ${line.bytes.padEnd(16)}  ${line.text}${label}`);
  }
}

function analyzePath(name, lines) {
  const ramReads = [];
  const ramWrites = [];
  const calls = [];
  const iyOps = [];
  const branches = [];
  let termination = 'unknown (exceeded max bytes)';

  for (const line of lines) {
    // RAM reads
    if (line.target && line.target >= 0xD00000 && (line.kind === 'load' || line.kind === 'load-iy' || line.kind === 'cp-iy' || line.kind === 'alu-iy')) {
      ramReads.push({ addr: line.addr, target: line.target, text: line.text });
    }
    if (line.target && line.target >= 0xD00000 && line.kind === 'load' && line.text.includes('ld a, (') || line.text.includes('ld hl, (') || line.text.includes('ld bc, (') || line.text.includes('ld de, (')) {
      if (line.target >= 0xD00000 && !ramReads.find(r => r.addr === line.addr)) {
        ramReads.push({ addr: line.addr, target: line.target, text: line.text });
      }
    }

    // RAM writes
    if (line.target && line.target >= 0xD00000 && (line.kind === 'store' || line.kind === 'store-iy')) {
      ramWrites.push({ addr: line.addr, target: line.target, text: line.text });
    }

    // Calls
    if (line.kind === 'call' || line.kind === 'call-conditional') {
      calls.push({ addr: line.addr, target: line.target, text: line.text });
    }

    // IY operations
    if (line.iyOffset !== undefined) {
      iyOps.push({ addr: line.addr, offset: line.iyOffset, disp: line.iyDisp, bit: line.iyBit, text: line.text, kind: line.kind });
    }

    // Branches
    if (line.kind && (line.kind.startsWith('jp') || line.kind.startsWith('jr') || line.kind === 'djnz')) {
      branches.push({ addr: line.addr, target: line.target, text: line.text });
    }

    // Termination
    if (line.kind === 'ret') termination = `RET at ${hex(line.addr)}`;
    if (line.kind === 'ret-conditional') termination = `${line.text.toUpperCase()} at ${hex(line.addr)} (conditional — path may continue)`;
    if (line.kind === 'jp' && line === lines[lines.length - 1]) termination = `JP ${hex(line.target)} at ${hex(line.addr)}`;
    if (line.kind === 'jr' && line === lines[lines.length - 1]) termination = `JR ${hex(line.target)} at ${hex(line.addr)}`;
    if (line.kind === 'jp-indirect' && line === lines[lines.length - 1]) termination = `JP (${line.text.includes('iy') ? 'IY' : line.text.includes('ix') ? 'IX' : 'HL'}) at ${hex(line.addr)}`;
  }

  console.log('');
  console.log(`--- ${name}: Analysis ---`);

  console.log(`\nRAM addresses READ (>= 0xD00000):`);
  if (ramReads.length === 0) console.log('  (none in this segment)');
  for (const r of ramReads) {
    const label = KNOWN[r.target] ? ` = ${KNOWN[r.target]}` : '';
    console.log(`  ${hex(r.addr)}: ${r.text}  -> ${hex(r.target)}${label}`);
  }

  console.log(`\nRAM addresses WRITTEN (>= 0xD00000):`);
  if (ramWrites.length === 0) console.log('  (none in this segment)');
  for (const w of ramWrites) {
    const label = KNOWN[w.target] ? ` = ${KNOWN[w.target]}` : '';
    console.log(`  ${hex(w.addr)}: ${w.text}  -> ${hex(w.target)}${label}`);
  }

  console.log(`\nSubroutines CALLed:`);
  if (calls.length === 0) console.log('  (none)');
  for (const c of calls) console.log(`  ${hex(c.addr)}: ${c.text}`);

  console.log(`\nIY+offset flag operations:`);
  if (iyOps.length === 0) console.log('  (none)');
  for (const op of iyOps) {
    console.log(`  ${hex(op.addr)}: ${op.text}  (IY+${hex(op.offset, 2)}, bit ${op.bit !== undefined ? op.bit : 'N/A'})`);
  }

  console.log(`\nBranch targets:`);
  if (branches.length === 0) console.log('  (none)');
  for (const b of branches) console.log(`  ${hex(b.addr)}: ${b.text}`);

  console.log(`\nTermination: ${termination}`);

  // Cross-reference check
  const xrefs = [];
  for (const line of lines) {
    if (line.target && KNOWN[line.target]) {
      xrefs.push({ addr: line.addr, target: line.target, name: KNOWN[line.target], text: line.text });
    }
    if (line.value && KNOWN[line.value]) {
      xrefs.push({ addr: line.addr, target: line.value, name: KNOWN[line.value], text: line.text });
    }
  }

  console.log(`\nCross-references to kbdKey/kbdToken/translationTable:`);
  if (xrefs.length === 0) console.log('  (none found in this segment)');
  for (const x of xrefs) console.log(`  ${hex(x.addr)}: ${x.text}  -> ${x.name} (${hex(x.target)})`);
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main() {
  console.log('Phase 396 — Mode Flag Decision Tree Disassembly');
  console.log('================================================');

  // First, show the decision tree itself at 0x02FECF
  printSection('Decision tree at 0x02FECF (context)');
  const contextLines = disassembleRange(0x02FECF, 0x40);
  printLines(contextLines);

  // Path 1: Key dispatch mode at 0x02FFF6
  const PATH1_START = 0x02FFF6;
  const PATH1_LEN = 0x100; // generous window
  printSection(`Path 1: Key Dispatch Mode — ${hex(PATH1_START)}`);
  const path1Lines = disassembleRange(PATH1_START, PATH1_LEN);
  printLines(path1Lines);
  analyzePath('Key Dispatch Mode (0x02FFF6)', path1Lines);

  // Path 2: Graph mode at 0x0300CB
  const PATH2_START = 0x0300CB;
  const PATH2_LEN = 0x100;
  printSection(`Path 2: Graph Mode — ${hex(PATH2_START)}`);
  const path2Lines = disassembleRange(PATH2_START, PATH2_LEN);
  printLines(path2Lines);
  analyzePath('Graph Mode (0x0300CB)', path2Lines);

  // Also disassemble the entry point at 0x02FECF more broadly to see the full decision tree
  printSection('Extended decision tree from 0x02FECF (0x120 bytes to cover all three paths)');
  const extLines = disassembleRange(0x02FECF, 0x200);
  // Find all branch targets to map the full flow
  const allBranches = [];
  const allCalls = [];
  const allIyOps = [];
  for (const line of extLines) {
    if (line.kind && (line.kind.startsWith('jp') || line.kind.startsWith('jr') || line.kind === 'djnz')) {
      allBranches.push(`  ${hex(line.addr)}: ${line.text}`);
    }
    if (line.kind === 'call' || line.kind === 'call-conditional') {
      allCalls.push(`  ${hex(line.addr)}: ${line.text}`);
    }
    if (line.iyOffset !== undefined) {
      allIyOps.push(`  ${hex(line.addr)}: ${line.text}  (IY+${hex(line.iyOffset, 2)})`);
    }
  }

  printSection('Summary: All branches in 0x02FECF..0x0300CF region');
  for (const b of allBranches) console.log(b);

  printSection('Summary: All CALLs in 0x02FECF..0x0300CF region');
  for (const c of allCalls) console.log(c);

  printSection('Summary: All IY+offset ops in 0x02FECF..0x0300CF region');
  for (const op of allIyOps) console.log(op);

  // Cross-reference: scan both paths for the three key addresses
  printSection('Cross-reference: kbdKey/kbdToken/translationTable in both paths');
  const allLines = [...path1Lines, ...path2Lines];
  let found = false;
  for (const line of allLines) {
    for (const [addrVal, name] of Object.entries(KNOWN)) {
      const numAddr = Number(addrVal);
      if (line.target === numAddr || line.value === numAddr) {
        console.log(`  ${hex(line.addr)}: ${line.text}  -> ${name} (${hex(numAddr)})`);
        found = true;
      }
    }
  }
  if (!found) {
    console.log('  Neither path directly references kbdKey, kbdToken, or translationTable.');
    console.log('  These may be accessed indirectly via subroutines CALLed from these paths.');
  }
}

main();
