#!/usr/bin/env node

/**
 * Phase 397 — Trace the OS wait loop at 0x040D40 and result fetch at 0x03FA09
 *
 * Context: the key dispatch mode path at 0x02FFF6 calls 0x040D40 in a loop,
 * checking BIT 3,(IY+0x00) each iteration. When bit 3 is set, it calls
 * 0x03FA09 to get the result. This probe disassembles both functions and
 * searches for all callers.
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// ── helpers ──────────────────────────────────────────────────────────────────

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
  return Array.from(rom.subarray(addr, addr + length), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

// ── eZ80 ADL-mode disassembler ───────────────────────────────────────────────

const REG8 = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const REG16 = ['bc', 'de', 'hl', 'sp'];
const CC = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];

function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  // ── CB prefix: bit ops on registers ──
  if (b0 === 0xCB) {
    const reg = REG8[b1 & 7];
    const bit = (b1 >> 3) & 7;
    const group = (b1 >> 6) & 3;
    const ops = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
    let text;
    if (group === 0) text = `${ops[bit]} ${reg}`;
    else if (group === 1) text = `bit ${bit}, ${reg}`;
    else if (group === 2) text = `res ${bit}, ${reg}`;
    else text = `set ${bit}, ${reg}`;
    return { addr, length: 2, bytes: bytesAt(addr, 2), text, kind: 'cb-op' };
  }

  // ── DD prefix: IX ops ──
  if (b0 === 0xDD) {
    return decodeIndexPrefix(addr, 'ix', 0xDD);
  }

  // ── FD prefix: IY ops ──
  if (b0 === 0xFD) {
    return decodeIndexPrefix(addr, 'iy', 0xFD);
  }

  // ── ED prefix ──
  if (b0 === 0xED) {
    return decodeED(addr);
  }

  // ── NOP ──
  if (b0 === 0x00) return mk(addr, 1, 'nop', 'nop');

  // ── HALT ──
  if (b0 === 0x76) return mk(addr, 1, 'halt', 'halt');

  // ── DI / EI ──
  if (b0 === 0xF3) return mk(addr, 1, 'di', 'di');
  if (b0 === 0xFB) return mk(addr, 1, 'ei', 'ei');

  // ── EX DE,HL ──
  if (b0 === 0xEB) return mk(addr, 1, 'ex de, hl', 'exchange');

  // ── EXX ──
  if (b0 === 0xD9) return mk(addr, 1, 'exx', 'exchange');

  // ── EX AF,AF' ──
  if (b0 === 0x08) return mk(addr, 1, "ex af, af'", 'exchange');

  // ── EX (SP),HL ──
  if (b0 === 0xE3) return mk(addr, 1, 'ex (sp), hl', 'exchange');

  // ── RET ──
  if (b0 === 0xC9) return mk(addr, 1, 'ret', 'ret');

  // ── RETI ──
  // handled in ED prefix

  // ── Conditional RET ──
  if ((b0 & 0xC7) === 0xC0) {
    const cc = CC[(b0 >> 3) & 7];
    return mk(addr, 1, `ret ${cc}`, 'ret-conditional', { condition: cc });
  }

  // ── RST ──
  if ((b0 & 0xC7) === 0xC7) {
    const target = b0 & 0x38;
    return mk(addr, 1, `rst ${hex(target, 2)}`, 'rst', { target });
  }

  // ── PUSH/POP rr ──
  if ((b0 & 0xCF) === 0xC5) {
    const rr = ['bc', 'de', 'hl', 'af'][(b0 >> 4) & 3];
    return mk(addr, 1, `push ${rr}`, 'push');
  }
  if ((b0 & 0xCF) === 0xC1) {
    const rr = ['bc', 'de', 'hl', 'af'][(b0 >> 4) & 3];
    return mk(addr, 1, `pop ${rr}`, 'pop');
  }

  // ── INC/DEC r8 ──
  if ((b0 & 0xC7) === 0x04) {
    const r = REG8[(b0 >> 3) & 7];
    return mk(addr, 1, `inc ${r}`, 'inc');
  }
  if ((b0 & 0xC7) === 0x05) {
    const r = REG8[(b0 >> 3) & 7];
    return mk(addr, 1, `dec ${r}`, 'dec');
  }

  // ── INC/DEC rr ──
  if ((b0 & 0xCF) === 0x03) {
    const rr = REG16[(b0 >> 4) & 3];
    return mk(addr, 1, `inc ${rr}`, 'inc');
  }
  if ((b0 & 0xCF) === 0x0B) {
    const rr = REG16[(b0 >> 4) & 3];
    return mk(addr, 1, `dec ${rr}`, 'dec');
  }

  // ── LD r, r' (excluding HALT at 0x76) ──
  if ((b0 & 0xC0) === 0x40 && b0 !== 0x76) {
    const dst = REG8[(b0 >> 3) & 7];
    const src = REG8[b0 & 7];
    return mk(addr, 1, `ld ${dst}, ${src}`, 'load');
  }

  // ── ALU A, r ──
  if ((b0 & 0xC0) === 0x80) {
    const ops = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
    const op = ops[(b0 >> 3) & 7];
    const r = REG8[b0 & 7];
    return mk(addr, 1, `${op} ${r}`, 'alu');
  }

  // ── LD r, imm8 ──
  if ((b0 & 0xC7) === 0x06) {
    const r = REG8[(b0 >> 3) & 7];
    return mk(addr, 2, `ld ${r}, ${hex(b1, 2)}`, 'load');
  }

  // ── LD rr, imm24 ──
  if ((b0 & 0xCF) === 0x01) {
    const rr = REG16[(b0 >> 4) & 3];
    const val = read24(addr + 1);
    return mk(addr, 4, `ld ${rr}, ${hex(val)}`, 'load', { value: val });
  }

  // ── LD A, (addr) ──
  if (b0 === 0x3A) {
    const target = read24(addr + 1);
    return mk(addr, 4, `ld a, (${hex(target)})`, 'load-mem', { target });
  }

  // ── LD (addr), A ──
  if (b0 === 0x32) {
    const target = read24(addr + 1);
    return mk(addr, 4, `ld (${hex(target)}), a`, 'store-mem', { target });
  }

  // ── LD HL, (addr) ──
  if (b0 === 0x2A) {
    const target = read24(addr + 1);
    return mk(addr, 4, `ld hl, (${hex(target)})`, 'load-mem', { target });
  }

  // ── LD (addr), HL ──
  if (b0 === 0x22) {
    const target = read24(addr + 1);
    return mk(addr, 4, `ld (${hex(target)}), hl`, 'store-mem', { target });
  }

  // ── LD (BC), A / LD (DE), A ──
  if (b0 === 0x02) return mk(addr, 1, 'ld (bc), a', 'store');
  if (b0 === 0x12) return mk(addr, 1, 'ld (de), a', 'store');

  // ── LD A, (BC) / LD A, (DE) ──
  if (b0 === 0x0A) return mk(addr, 1, 'ld a, (bc)', 'load');
  if (b0 === 0x1A) return mk(addr, 1, 'ld a, (de)', 'load');

  // ── ADD HL, rr ──
  if ((b0 & 0xCF) === 0x09) {
    const rr = REG16[(b0 >> 4) & 3];
    return mk(addr, 1, `add hl, ${rr}`, 'add16');
  }

  // ── CALL addr ──
  if (b0 === 0xCD) {
    const target = read24(addr + 1);
    return mk(addr, 4, `call ${hex(target)}`, 'call', { target });
  }

  // ── Conditional CALL ──
  if ((b0 & 0xC7) === 0xC4) {
    const cc = CC[(b0 >> 3) & 7];
    const target = read24(addr + 1);
    return mk(addr, 4, `call ${cc}, ${hex(target)}`, 'call-conditional', { target, condition: cc });
  }

  // ── JP addr ──
  if (b0 === 0xC3) {
    const target = read24(addr + 1);
    return mk(addr, 4, `jp ${hex(target)}`, 'jp', { target });
  }

  // ── Conditional JP ──
  if ((b0 & 0xC7) === 0xC2) {
    const cc = CC[(b0 >> 3) & 7];
    const target = read24(addr + 1);
    return mk(addr, 4, `jp ${cc}, ${hex(target)}`, 'jp-conditional', { target, condition: cc });
  }

  // ── JP (HL) ──
  if (b0 === 0xE9) return mk(addr, 1, 'jp (hl)', 'jp-indirect');

  // ── JR ──
  if (b0 === 0x18) {
    const target = (addr + 2 + signed8(b1)) & 0xFFFFFF;
    return mk(addr, 2, `jr ${hex(target)}`, 'jr', { target });
  }

  // ── Conditional JR ──
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const ccMap = { 0x20: 'nz', 0x28: 'z', 0x30: 'nc', 0x38: 'c' };
    const cc = ccMap[b0];
    const target = (addr + 2 + signed8(b1)) & 0xFFFFFF;
    return mk(addr, 2, `jr ${cc}, ${hex(target)}`, 'jr-conditional', { target, condition: cc });
  }

  // ── DJNZ ──
  if (b0 === 0x10) {
    const target = (addr + 2 + signed8(b1)) & 0xFFFFFF;
    return mk(addr, 2, `djnz ${hex(target)}`, 'djnz', { target });
  }

  // ── ALU A, imm8 ──
  if ((b0 & 0xC7) === 0xC6) {
    const ops = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
    const op = ops[(b0 >> 3) & 7];
    return mk(addr, 2, `${op} ${hex(b1, 2)}`, 'alu-imm', { value: b1 });
  }

  // ── Rotate A ──
  if (b0 === 0x07) return mk(addr, 1, 'rlca', 'rotate');
  if (b0 === 0x0F) return mk(addr, 1, 'rrca', 'rotate');
  if (b0 === 0x17) return mk(addr, 1, 'rla', 'rotate');
  if (b0 === 0x1F) return mk(addr, 1, 'rra', 'rotate');

  // ── DAA / CPL / SCF / CCF ──
  if (b0 === 0x27) return mk(addr, 1, 'daa', 'flag');
  if (b0 === 0x2F) return mk(addr, 1, 'cpl', 'flag');
  if (b0 === 0x37) return mk(addr, 1, 'scf', 'flag');
  if (b0 === 0x3F) return mk(addr, 1, 'ccf', 'flag');

  // ── suffix prefix (SIS/SIL/LIS/LIL) ──
  if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
    const suffixes = { 0x40: '.sis', 0x49: '.lis', 0x52: '.sil', 0x5B: '.lil' };
    const suffix = suffixes[b0];
    // decode next instruction and prepend suffix
    const inner = decodeAt(addr + 1);
    return {
      addr,
      length: 1 + inner.length,
      bytes: bytesAt(addr, 1 + inner.length),
      text: `${suffix} ${inner.text}`,
      kind: inner.kind,
      target: inner.target,
      value: inner.value,
      condition: inner.condition,
    };
  }

  // fallback
  return mk(addr, 1, `db ${hex(b0, 2)}`, 'db');
}

function decodeIndexPrefix(addr, name, prefix) {
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  // LD IX/IY, imm24
  if (b1 === 0x21) {
    const val = read24(addr + 2);
    return mk(addr, 5, `ld ${name}, ${hex(val)}`, 'load', { value: val });
  }

  // LD (IX/IY+d), imm8
  if (b1 === 0x36) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 4, `ld (${name}${dStr}), ${hex(b3, 2)}`, 'store-indexed');
  }

  // LD r, (IX/IY+d)
  if ((b1 & 0xC7) === 0x46 && b1 !== 0x76) {
    const r = REG8[(b1 >> 3) & 7];
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `ld ${r}, (${name}${dStr})`, 'load-indexed');
  }

  // LD (IX/IY+d), r
  if ((b1 & 0xF8) === 0x70 && b1 !== 0x76) {
    const r = REG8[b1 & 7];
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `ld (${name}${dStr}), ${r}`, 'store-indexed');
  }

  // ALU A, (IX/IY+d)
  if ((b1 & 0xC7) === 0x86) {
    const ops = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
    const op = ops[(b1 >> 3) & 7];
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `${op} (${name}${dStr})`, 'alu-indexed');
  }

  // INC/DEC (IX/IY+d)
  if (b1 === 0x34) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `inc (${name}${dStr})`, 'inc-indexed');
  }
  if (b1 === 0x35) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `dec (${name}${dStr})`, 'dec-indexed');
  }

  // PUSH/POP IX/IY
  if (b1 === 0xE5) return mk(addr, 2, `push ${name}`, 'push');
  if (b1 === 0xE1) return mk(addr, 2, `pop ${name}`, 'pop');

  // ADD IX/IY, rr
  if ((b1 & 0xCF) === 0x09) {
    const rr = REG16[(b1 >> 4) & 3].replace('hl', name);
    return mk(addr, 2, `add ${name}, ${rr}`, 'add16');
  }

  // INC/DEC IX/IY
  if (b1 === 0x23) return mk(addr, 2, `inc ${name}`, 'inc');
  if (b1 === 0x2B) return mk(addr, 2, `dec ${name}`, 'dec');

  // LD IX/IY, (addr)
  if (b1 === 0x2A) {
    const target = read24(addr + 2);
    return mk(addr, 5, `ld ${name}, (${hex(target)})`, 'load-mem', { target });
  }

  // LD (addr), IX/IY
  if (b1 === 0x22) {
    const target = read24(addr + 2);
    return mk(addr, 5, `ld (${hex(target)}), ${name}`, 'store-mem', { target });
  }

  // JP (IX/IY)
  if (b1 === 0xE9) return mk(addr, 2, `jp (${name})`, 'jp-indirect');

  // LD SP, IX/IY
  if (b1 === 0xF9) return mk(addr, 2, `ld sp, ${name}`, 'load');

  // EX (SP), IX/IY
  if (b1 === 0xE3) return mk(addr, 2, `ex (sp), ${name}`, 'exchange');

  // CB sub-prefix: BIT/SET/RES on (IX/IY+d)
  if (b1 === 0xCB) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    const op = b3;
    const bit = (op >> 3) & 7;
    const group = (op >> 6) & 3;
    let text;
    if (group === 1) text = `bit ${bit}, (${name}${dStr})`;
    else if (group === 2) text = `res ${bit}, (${name}${dStr})`;
    else if (group === 3) text = `set ${bit}, (${name}${dStr})`;
    else {
      const ops = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
      text = `${ops[bit]} (${name}${dStr})`;
    }
    return mk(addr, 4, text, 'cb-indexed');
  }

  // fallback: unknown IX/IY op
  return mk(addr, 2, `db ${hex(prefix, 2)} ${hex(b1, 2)}`, 'db');
}

function decodeED(addr) {
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];

  // IN r, (C)
  if ((b1 & 0xC7) === 0x40 && b1 !== 0x70) {
    const r = REG8[(b1 >> 3) & 7];
    return mk(addr, 2, `in ${r}, (c)`, 'in-port');
  }

  // OUT (C), r
  if ((b1 & 0xC7) === 0x41 && b1 !== 0x71) {
    const r = REG8[(b1 >> 3) & 7];
    return mk(addr, 2, `out (c), ${r}`, 'out-port');
  }

  // IN0 r, (port)
  if ((b1 & 0xC7) === 0x00 && b1 <= 0x38) {
    const r = REG8[(b1 >> 3) & 7];
    return mk(addr, 3, `in0 ${r}, (${hex(b2, 2)})`, 'in0', { port: b2 });
  }

  // OUT0 (port), r
  if ((b1 & 0xC7) === 0x01 && b1 <= 0x39) {
    const r = REG8[(b1 >> 3) & 7];
    return mk(addr, 3, `out0 (${hex(b2, 2)}), ${r}`, 'out0', { port: b2 });
  }

  // SBC HL, rr
  if ((b1 & 0xCF) === 0x42) {
    const rr = REG16[(b1 >> 4) & 3];
    return mk(addr, 2, `sbc hl, ${rr}`, 'sbc16');
  }

  // ADC HL, rr
  if ((b1 & 0xCF) === 0x4A) {
    const rr = REG16[(b1 >> 4) & 3];
    return mk(addr, 2, `adc hl, ${rr}`, 'adc16');
  }

  // LD (addr), rr
  if ((b1 & 0xCF) === 0x43) {
    const rr = REG16[(b1 >> 4) & 3];
    const target = read24(addr + 2);
    return mk(addr, 5, `ld (${hex(target)}), ${rr}`, 'store-mem', { target });
  }

  // LD rr, (addr)
  if ((b1 & 0xCF) === 0x4B) {
    const rr = REG16[(b1 >> 4) & 3];
    const target = read24(addr + 2);
    return mk(addr, 5, `ld ${rr}, (${hex(target)})`, 'load-mem', { target });
  }

  // NEG
  if (b1 === 0x44) return mk(addr, 2, 'neg', 'neg');

  // RETI
  if (b1 === 0x4D) return mk(addr, 2, 'reti', 'reti');

  // RETN
  if (b1 === 0x45) return mk(addr, 2, 'retn', 'retn');

  // IM 0/1/2
  if (b1 === 0x46) return mk(addr, 2, 'im 0', 'im');
  if (b1 === 0x56) return mk(addr, 2, 'im 1', 'im');
  if (b1 === 0x5E) return mk(addr, 2, 'im 2', 'im');

  // LD I,A / LD A,I / LD R,A / LD A,R
  if (b1 === 0x47) return mk(addr, 2, 'ld i, a', 'load');
  if (b1 === 0x57) return mk(addr, 2, 'ld a, i', 'load');
  if (b1 === 0x4F) return mk(addr, 2, 'ld r, a', 'load');
  if (b1 === 0x5F) return mk(addr, 2, 'ld a, r', 'load');

  // Block ops
  if (b1 === 0xA0) return mk(addr, 2, 'ldi', 'block');
  if (b1 === 0xA1) return mk(addr, 2, 'cpi', 'block');
  if (b1 === 0xA2) return mk(addr, 2, 'ini', 'block');
  if (b1 === 0xA3) return mk(addr, 2, 'outi', 'block');
  if (b1 === 0xA8) return mk(addr, 2, 'ldd', 'block');
  if (b1 === 0xA9) return mk(addr, 2, 'cpd', 'block');
  if (b1 === 0xAA) return mk(addr, 2, 'ind', 'block');
  if (b1 === 0xAB) return mk(addr, 2, 'outd', 'block');
  if (b1 === 0xB0) return mk(addr, 2, 'ldir', 'block');
  if (b1 === 0xB1) return mk(addr, 2, 'cpir', 'block');
  if (b1 === 0xB2) return mk(addr, 2, 'inir', 'block');
  if (b1 === 0xB3) return mk(addr, 2, 'otir', 'block');
  if (b1 === 0xB8) return mk(addr, 2, 'lddr', 'block');
  if (b1 === 0xB9) return mk(addr, 2, 'cpdr', 'block');
  if (b1 === 0xBA) return mk(addr, 2, 'indr', 'block');
  if (b1 === 0xBB) return mk(addr, 2, 'otdr', 'block');

  // RRD / RLD
  if (b1 === 0x67) return mk(addr, 2, 'rrd', 'rotate');
  if (b1 === 0x6F) return mk(addr, 2, 'rld', 'rotate');

  // eZ80: MLT rr
  if ((b1 & 0xCF) === 0x4C) {
    const rr = REG16[(b1 >> 4) & 3];
    return mk(addr, 2, `mlt ${rr}`, 'mlt');
  }

  // eZ80: TST A, imm8
  if (b1 === 0x64) {
    return mk(addr, 3, `tst a, ${hex(b2, 2)}`, 'tst');
  }

  // eZ80: TSTIO imm8
  if (b1 === 0x74) {
    return mk(addr, 3, `tstio ${hex(b2, 2)}`, 'tstio');
  }

  // eZ80: SLP
  if (b1 === 0x76) return mk(addr, 2, 'slp', 'slp');

  // eZ80: LEA IX/IY
  if (b1 === 0x02) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `lea bc, ix${dStr}`, 'lea');
  }
  if (b1 === 0x03) {
    const d = signed8(b2);
    const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
    return mk(addr, 3, `lea bc, iy${dStr}`, 'lea');
  }

  // fallback
  return mk(addr, 2, `db 0xED ${hex(b1, 2)}`, 'db');
}

function mk(addr, length, text, kind, extra = {}) {
  return { addr, length, bytes: bytesAt(addr, length), text, kind, ...extra };
}

// ── disassembly runners ──────────────────────────────────────────────────────

function disassemble(start, maxBytes) {
  const lines = [];
  let pc = start;
  const end = start + maxBytes;
  while (pc < end) {
    const inst = decodeAt(pc);
    lines.push(inst);
    pc += inst.length;
  }
  return lines;
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function printLines(lines) {
  for (const line of lines) {
    const annotation = annotateAddr(line);
    const suffix = annotation ? `  ; ${annotation}` : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${suffix}`);
  }
}

// ── annotations for known addresses ──────────────────────────────────────────

const KNOWN_ADDRS = {
  0x003A73: 'event loop (APD/cursor)',
  0x003D5A: '_GetCSC (scan keyboard)',
  0xD00080: 'IY base',
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdScanCode',
  0xD00587: 'kbdGetKy result',
  0xD00590: 'keyExtend',
};

function annotateAddr(inst) {
  if (inst.target !== undefined && KNOWN_ADDRS[inst.target]) {
    return KNOWN_ADDRS[inst.target];
  }
  // check for IY+offset references in the text
  const iyMatch = inst.text.match(/\(iy\+0x([0-9A-F]+)\)/i);
  if (iyMatch) {
    const offset = parseInt(iyMatch[1], 16);
    const effective = 0xD00080 + offset;
    if (KNOWN_ADDRS[effective]) {
      return `${hex(effective)} = ${KNOWN_ADDRS[effective]}`;
    }
    return `-> ${hex(effective)}`;
  }
  return null;
}

// ── analysis helpers ─────────────────────────────────────────────────────────

function analyzeFunction(name, lines) {
  const ramReads = [];
  const ramWrites = [];
  const calls = [];
  const jumps = [];
  const ports = [];
  const loops = [];

  for (const line of lines) {
    // RAM reads
    if (line.kind === 'load-mem' && line.target >= 0xD00000) {
      ramReads.push({ addr: line.addr, target: line.target, text: line.text });
    }
    if (line.kind === 'load-indexed') {
      ramReads.push({ addr: line.addr, text: line.text });
    }

    // RAM writes
    if (line.kind === 'store-mem' && line.target >= 0xD00000) {
      ramWrites.push({ addr: line.addr, target: line.target, text: line.text });
    }
    if (line.kind === 'store-indexed') {
      ramWrites.push({ addr: line.addr, text: line.text });
    }

    // Calls
    if (line.kind === 'call' || line.kind === 'call-conditional') {
      calls.push({ addr: line.addr, target: line.target, text: line.text });
    }

    // Jumps
    if (line.kind === 'jp' || line.kind === 'jp-conditional' ||
        line.kind === 'jr' || line.kind === 'jr-conditional' ||
        line.kind === 'jp-indirect' || line.kind === 'djnz') {
      jumps.push({ addr: line.addr, target: line.target, text: line.text });
    }

    // Port I/O
    if (line.kind === 'in-port' || line.kind === 'out-port' ||
        line.kind === 'in0' || line.kind === 'out0') {
      ports.push({ addr: line.addr, text: line.text });
    }

    // IY-indexed ops (BIT/SET/RES)
    if (line.kind === 'cb-indexed') {
      const m = line.text.match(/\(iy\+0x([0-9A-F]+)\)/i);
      if (m) {
        const offset = parseInt(m[1], 16);
        const effective = 0xD00080 + offset;
        ramReads.push({ addr: line.addr, target: effective, text: line.text });
      }
    }

    // Loops (JR/DJNZ backward)
    if ((line.kind === 'jr' || line.kind === 'jr-conditional' || line.kind === 'djnz') &&
        line.target < line.addr) {
      loops.push({ addr: line.addr, target: line.target, text: line.text });
    }
  }

  console.log(`\n  RAM reads:`);
  if (ramReads.length === 0) console.log('    (none)');
  for (const r of ramReads) {
    const note = r.target && KNOWN_ADDRS[r.target] ? ` = ${KNOWN_ADDRS[r.target]}` : '';
    console.log(`    ${hex(r.addr)}: ${r.text}${note}`);
  }

  console.log(`\n  RAM writes:`);
  if (ramWrites.length === 0) console.log('    (none)');
  for (const w of ramWrites) {
    const note = w.target && KNOWN_ADDRS[w.target] ? ` = ${KNOWN_ADDRS[w.target]}` : '';
    console.log(`    ${hex(w.addr)}: ${w.text}${note}`);
  }

  console.log(`\n  Subroutine calls:`);
  if (calls.length === 0) console.log('    (none)');
  for (const c of calls) {
    const note = KNOWN_ADDRS[c.target] ? ` = ${KNOWN_ADDRS[c.target]}` : '';
    console.log(`    ${hex(c.addr)}: ${c.text}${note}`);
  }

  console.log(`\n  Jump targets:`);
  if (jumps.length === 0) console.log('    (none)');
  for (const j of jumps) {
    const note = j.target && KNOWN_ADDRS[j.target] ? ` = ${KNOWN_ADDRS[j.target]}` : '';
    console.log(`    ${hex(j.addr)}: ${j.text}${note}`);
  }

  console.log(`\n  Port I/O:`);
  if (ports.length === 0) console.log('    (none)');
  for (const p of ports) {
    console.log(`    ${hex(p.addr)}: ${p.text}`);
  }

  console.log(`\n  Loop structures (backward branches):`);
  if (loops.length === 0) console.log('    (none)');
  for (const l of loops) {
    console.log(`    ${hex(l.addr)}: ${l.text}  (loops back ${l.addr - l.target} bytes)`);
  }
}

// ── ROM search ───────────────────────────────────────────────────────────────

function searchROM(pattern, label) {
  const results = [];
  for (let i = 0; i < rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  console.log(`  ${label}: ${results.length} hit(s)`);
  for (const addr of results) {
    // show context: a few bytes before
    const contextStart = Math.max(0, addr - 4);
    const contextBytes = bytesAt(contextStart, pattern.length + 8);
    console.log(`    ${hex(addr)} [context: ${hex(contextStart)} ${contextBytes}]`);
  }
  return results;
}

// ── known-address reference check ────────────────────────────────────────────

function checkReferences(lines, targets) {
  console.log('');
  for (const [addr, label] of targets) {
    const refs = lines.filter(l =>
      l.target === addr ||
      (l.value === addr) ||
      l.text.includes(hex(addr))
    );
    if (refs.length > 0) {
      console.log(`  References to ${hex(addr)} (${label}):`);
      for (const r of refs) {
        console.log(`    ${hex(r.addr)}: ${r.text}`);
      }
    } else {
      console.log(`  No direct reference to ${hex(addr)} (${label})`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 397 — Wait Loop 0x040D40 + Result Fetch 0x03FA09');
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length)})`);

  // ── Disassemble 0x040D40 (wait loop / event pump) ──
  printSection('0x040D40 — Wait loop / event pump (200 bytes)');
  const waitLines = disassemble(0x040D40, 200);
  printLines(waitLines);
  analyzeFunction('0x040D40', waitLines);

  checkReferences(waitLines, [
    [0x003A73, 'event loop (APD/cursor)'],
    [0x003D5A, '_GetCSC'],
    [0xD00080, 'IY base'],
    [0xD0058C, 'kbdKey'],
  ]);

  // ── Disassemble 0x03FA09 (result fetch) ──
  printSection('0x03FA09 — Result fetch (100 bytes)');
  const fetchLines = disassemble(0x03FA09, 100);
  printLines(fetchLines);
  analyzeFunction('0x03FA09', fetchLines);

  checkReferences(fetchLines, [
    [0x003A73, 'event loop'],
    [0x003D5A, '_GetCSC'],
    [0xD00080, 'IY base'],
    [0xD0058C, 'kbdKey'],
  ]);

  // ── Search for callers ──
  printSection('Callers of 0x040D40');
  // CALL 0x040D40 = CD 40 0D 04
  searchROM([0xCD, 0x40, 0x0D, 0x04], 'CALL 0x040D40');
  // JP 0x040D40 = C3 40 0D 04
  searchROM([0xC3, 0x40, 0x0D, 0x04], 'JP 0x040D40');

  printSection('Callers of 0x03FA09');
  // CALL 0x03FA09 = CD 09 FA 03
  searchROM([0xCD, 0x09, 0xFA, 0x03], 'CALL 0x03FA09');
  // JP 0x03FA09 = C3 09 FA 03
  searchROM([0xC3, 0x09, 0xFA, 0x03], 'JP 0x03FA09');

  // ── Also disassemble the caller context at 0x02FFF6 ──
  printSection('Caller context: 0x02FFF6 (mode dispatch wait loop, 80 bytes)');
  const callerLines = disassemble(0x02FFF6, 80);
  printLines(callerLines);

  // ── Summary ──
  printSection('Summary');
  console.log('0x040D40 is called in a loop from the mode dispatch path (0x02FFF6).');
  console.log('After each call, BIT 3,(IY+0x00) is tested. When set, 0x03FA09 fetches the result.');
  console.log('If the result is 0x01 or 0x04, the loop continues; otherwise JP 0x02FDD8 (exit).');
  console.log('');
  console.log('See disassembly above for detailed instruction listings and analysis.');
}

main();
