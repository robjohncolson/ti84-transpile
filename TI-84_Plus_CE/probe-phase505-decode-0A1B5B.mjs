/**
 * probe-phase505-decode-0A1B5B.mjs
 *
 * Static disassembly of 0x0A1B5B -- the function called by 0x0979E4
 * (conditional character output) when the cursor IS visible.
 * Suspected: display-list / overlay buffer writer for the status bar.
 *
 * Neighboring short helpers (0x0A1xxx-0x0A2xxx, <=40 bytes) are also decoded.
 *
 * Usage:
 *   node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase505-decode-0A1B5B.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// ---------------------------------------------------------------------------
// Known addresses for annotation
// ---------------------------------------------------------------------------
const KNOWN_CODE = {
  0x026789: 'LCD refresh controller',
  0x0264B1: 'VRAM row advance (D008D5+=0x0C)',
  0x060BA2: 'missing link routine',
  0x061986: 'putchar (mid-entry)',
  0x096B65: 'status bar formatter (137B)',
  0x096CC8: 'tail-call stub (7B)',
  0x096F56: 'visibility check',
  0x096F67: 'returns Z when cursor visible',
  0x097955: 'LCD refresh trigger',
  0x0979C6: 'cursor position check',
  0x0979E4: 'conditional char output (calls 0A1B5B if visible)',
  0x0994DC: 'mode setup (37B)',
  0x09A3D0: 'editor context lookup',
  0x0A1B5B: 'display-list / overlay buffer writer [THIS FILE]',
  0x0A1CEC: 'neighbor in 0x0A1xxx',
  0x0A1F12: 'neighbor in 0x0A1xxx',
  0x0A22B1: 'neighbor in 0x0A2xxx',
  0x0A23E5: 'pixel renderer',
  0x0A2A68: 'neighbor in 0x0A2xxx',
  0x0A2D4C: 'neighbor in 0x0A2xxx',
};

const KNOWN_RAM = {
  0xD00595: 'cursorRow',
  0xD00596: 'cursorCol',
  0xD02575: 'cursorType',
  0xD008D2: 'VRAM_ptr',
  0xD008D5: 'VRAM_row_high',
  0xD007E0: 'screenMode',
  0xD0060E: 'displayContext',
};

function annotate(addr) {
  const parts = [];
  if (KNOWN_CODE[addr]) parts.push(KNOWN_CODE[addr]);
  if (KNOWN_RAM[addr]) parts.push(KNOWN_RAM[addr]);
  // Check +/-1 for adjacent RAM fields
  if (KNOWN_RAM[addr - 1]) parts.push(`${KNOWN_RAM[addr - 1]}+1`);
  if (KNOWN_RAM[addr + 1]) parts.push(`${KNOWN_RAM[addr + 1]}-1`);
  return parts.length ? `  ; ${parts.join(', ')}` : '';
}

function charAnnotation(n) {
  if (n >= 0x20 && n < 0x7F) return `  ; '${String.fromCharCode(n)}'`;
  return '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const REG16 = ['BC', 'DE', 'HL', 'SP'];
const REG16AF = ['BC', 'DE', 'HL', 'AF'];
const ALU_OP = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
const CC_TABLE = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ROT_OP = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function hex8(v) { return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
function hex16(v) { return '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); }
function hex24(v) { return '0x' + (v & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'); }
function signed8(v) { return v > 127 ? v - 256 : v; }

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i])
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

// ---------------------------------------------------------------------------
// eZ80 ADL-mode disassembler
// ---------------------------------------------------------------------------
function decode(addr) {
  const op = rom[addr];

  // .SIS prefix (0x40 before another opcode)
  if (op === 0x40) {
    const inner = decodeInner(addr + 1, true);
    return {
      ...inner,
      len: inner.len + 1,
      mnemonic: `.SIS ${inner.mnemonic}`,
    };
  }

  // IX/IY prefix
  if (op === 0xDD || op === 0xFD) {
    const ixiy = op === 0xDD ? 'IX' : 'IY';
    const next = rom[addr + 1];

    // DD CB / FD CB = indexed bit ops
    if (next === 0xCB) {
      const d = signed8(rom[addr + 2]);
      const op2 = rom[addr + 3];
      return { len: 4, ...decodeIndexedCB(ixiy, d, op2) };
    }

    // DD ED / FD ED = just ED with prefix
    if (next === 0xED) {
      const inner = decodeED(addr + 1);
      return { ...inner, len: inner.len + 1 };
    }

    return decodeIXIY(addr, ixiy);
  }

  // CB prefix
  if (op === 0xCB) {
    const op2 = rom[addr + 1];
    return { len: 2, ...decodeCB(op2) };
  }

  // ED prefix
  if (op === 0xED) {
    return decodeED(addr);
  }

  return decodeInner(addr, false);
}

function decodeCB(op) {
  const r = REG8[op & 7];
  const y = (op >> 3) & 7;
  const group = op >> 6;
  if (group === 0) return { mnemonic: `${ROT_OP[y]} ${r}` };
  if (group === 1) return { mnemonic: `BIT ${y},${r}` };
  if (group === 2) return { mnemonic: `RES ${y},${r}` };
  return { mnemonic: `SET ${y},${r}` };
}

function decodeIndexedCB(pfx, d, op) {
  const sign = d >= 0 ? '+' : '';
  const y = (op >> 3) & 7;
  const group = op >> 6;
  const mem = `(${pfx}${sign}${d})`;
  if (group === 0) return { mnemonic: `${ROT_OP[y]} ${mem}` };
  if (group === 1) return { mnemonic: `BIT ${y},${mem}` };
  if (group === 2) return { mnemonic: `RES ${y},${mem}` };
  return { mnemonic: `SET ${y},${mem}` };
}

function decodeED(addr) {
  const op = rom[addr + 1];

  // Simple table
  const simple = {
    0x44: 'NEG', 0x45: 'RETN', 0x4D: 'RETI',
    0x46: 'IM 0', 0x56: 'IM 1', 0x5E: 'IM 2',
    0x47: 'LD I,A', 0x57: 'LD A,I', 0x4F: 'LD R,A', 0x5F: 'LD A,R',
    0x67: 'RRD', 0x6F: 'RLD',
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  if (simple[op]) return { len: 2, mnemonic: simple[op] };

  // LD (nn),rr  ED 43/53/63/73
  if ((op & 0xCF) === 0x43) {
    const rr = REG16[(op >> 4) & 3];
    const nn = rom[addr + 2] | (rom[addr + 3] << 8) | (rom[addr + 4] << 16);
    return { len: 5, mnemonic: `LD (${hex24(nn)}),${rr}${annotate(nn)}` };
  }
  // LD rr,(nn)  ED 4B/5B/6B/7B
  if ((op & 0xCF) === 0x4B) {
    const rr = REG16[(op >> 4) & 3];
    const nn = rom[addr + 2] | (rom[addr + 3] << 8) | (rom[addr + 4] << 16);
    return { len: 5, mnemonic: `LD ${rr},(${hex24(nn)})${annotate(nn)}` };
  }
  // SBC HL,rr
  if ((op & 0xCF) === 0x42) return { len: 2, mnemonic: `SBC HL,${REG16[(op >> 4) & 3]}` };
  // ADC HL,rr
  if ((op & 0xCF) === 0x4A) return { len: 2, mnemonic: `ADC HL,${REG16[(op >> 4) & 3]}` };
  // IN r,(C)
  if ((op & 0xC7) === 0x40) return { len: 2, mnemonic: `IN ${REG8[(op >> 3) & 7]},(C)` };
  // OUT (C),r
  if ((op & 0xC7) === 0x41) return { len: 2, mnemonic: `OUT (C),${REG8[(op >> 3) & 7]}` };
  // MLT rr (eZ80)
  if ((op & 0xCF) === 0x4C) return { len: 2, mnemonic: `MLT ${REG16[(op >> 4) & 3]}` };
  // TST A,r (eZ80)
  if ((op & 0xC7) === 0x04) return { len: 2, mnemonic: `TST A,${REG8[(op >> 3) & 7]}` };

  return { len: 2, mnemonic: `DB 0xED,${hex8(op)}` };
}

function decodeIXIY(addr, pfx) {
  const op = rom[addr + 1];

  // LD IX/IY,nn
  if (op === 0x21) {
    const nn = rom[addr + 2] | (rom[addr + 3] << 8) | (rom[addr + 4] << 16);
    return { len: 5, mnemonic: `LD ${pfx},${hex24(nn)}${annotate(nn)}` };
  }
  // LD (nn),IX/IY
  if (op === 0x22) {
    const nn = rom[addr + 2] | (rom[addr + 3] << 8) | (rom[addr + 4] << 16);
    return { len: 5, mnemonic: `LD (${hex24(nn)}),${pfx}${annotate(nn)}` };
  }
  // LD IX/IY,(nn)
  if (op === 0x2A) {
    const nn = rom[addr + 2] | (rom[addr + 3] << 8) | (rom[addr + 4] << 16);
    return { len: 5, mnemonic: `LD ${pfx},(${hex24(nn)})${annotate(nn)}` };
  }
  // INC/DEC IX/IY
  if (op === 0x23) return { len: 2, mnemonic: `INC ${pfx}` };
  if (op === 0x2B) return { len: 2, mnemonic: `DEC ${pfx}` };
  // ADD IX/IY,rr
  if ((op & 0xCF) === 0x09) {
    const rr = REG16[(op >> 4) & 3];
    return { len: 2, mnemonic: `ADD ${pfx},${rr === 'HL' ? pfx : rr}` };
  }
  // PUSH/POP IX/IY
  if (op === 0xE5) return { len: 2, mnemonic: `PUSH ${pfx}` };
  if (op === 0xE1) return { len: 2, mnemonic: `POP ${pfx}` };
  // JP (IX)/(IY)
  if (op === 0xE9) return { len: 2, mnemonic: `JP (${pfx})`, flowStop: true };
  // LD SP,IX/IY
  if (op === 0xF9) return { len: 2, mnemonic: `LD SP,${pfx}` };
  // EX (SP),IX/IY
  if (op === 0xE3) return { len: 2, mnemonic: `EX (SP),${pfx}` };

  // LD (IX+d),n
  if (op === 0x36) {
    const d = signed8(rom[addr + 2]);
    const n = rom[addr + 3];
    const sign = d >= 0 ? '+' : '';
    return { len: 4, mnemonic: `LD (${pfx}${sign}${d}),${hex8(n)}` };
  }
  // INC/DEC (IX+d)
  if (op === 0x34) {
    const d = signed8(rom[addr + 2]);
    const sign = d >= 0 ? '+' : '';
    return { len: 3, mnemonic: `INC (${pfx}${sign}${d})` };
  }
  if (op === 0x35) {
    const d = signed8(rom[addr + 2]);
    const sign = d >= 0 ? '+' : '';
    return { len: 3, mnemonic: `DEC (${pfx}${sign}${d})` };
  }

  // LD r,(IX+d) and LD (IX+d),r
  if ((op & 0xC0) === 0x40 && op !== 0x76) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    if (src === 6) {
      const d = signed8(rom[addr + 2]);
      const sign = d >= 0 ? '+' : '';
      return { len: 3, mnemonic: `LD ${REG8[dst]},(${pfx}${sign}${d})` };
    }
    if (dst === 6) {
      const d = signed8(rom[addr + 2]);
      const sign = d >= 0 ? '+' : '';
      return { len: 3, mnemonic: `LD (${pfx}${sign}${d}),${REG8[src]}` };
    }
    // IXH/IXL register ops
    return { len: 2, mnemonic: `LD ${REG8[dst]},${REG8[src]}  ; ${pfx} prefix` };
  }

  // ALU (IX+d)
  if ((op & 0xC0) === 0x80 && (op & 7) === 6) {
    const d = signed8(rom[addr + 2]);
    const sign = d >= 0 ? '+' : '';
    return { len: 3, mnemonic: `${ALU_OP[(op >> 3) & 7]}(${pfx}${sign}${d})` };
  }

  // LD r,n with IX prefix (IXH/IXL)
  if ((op & 0xC7) === 0x06) {
    const n = rom[addr + 2];
    const r = (op >> 3) & 7;
    if (r === 4) return { len: 3, mnemonic: `LD ${pfx}H,${hex8(n)}` };
    if (r === 5) return { len: 3, mnemonic: `LD ${pfx}L,${hex8(n)}` };
    if (r === 6) {
      // LD (IX+d),n handled above at 0x36
      const d = signed8(rom[addr + 2]);
      const nn = rom[addr + 3];
      const sign = d >= 0 ? '+' : '';
      return { len: 4, mnemonic: `LD (${pfx}${sign}${d}),${hex8(nn)}` };
    }
    return { len: 3, mnemonic: `LD ${REG8[r]},${hex8(n)}  ; ${pfx} prefix` };
  }

  // Fallback: treat as HL->IX/IY substitution of base opcode
  const inner = decodeInner(addr + 1, false);
  return {
    ...inner,
    len: inner.len + 1,
    mnemonic: inner.mnemonic.replace(/\bHL\b/g, pfx),
  };
}

function decodeInner(addr, isSIS) {
  const op = rom[addr];
  const addrSize = isSIS ? 2 : 3;

  function readAddr() {
    if (isSIS) return rom[addr + 1] | (rom[addr + 2] << 8);
    return rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
  }
  function fmtAddr(v) { return isSIS ? hex16(v) : hex24(v); }

  // NOP
  if (op === 0x00) return { len: 1, mnemonic: 'NOP' };
  // HALT
  if (op === 0x76) return { len: 1, mnemonic: 'HALT', flowStop: true };
  // RET
  if (op === 0xC9) return { len: 1, mnemonic: 'RET', flowStop: true };
  // RET cc
  if ((op & 0xC7) === 0xC0) return { len: 1, mnemonic: `RET ${CC_TABLE[(op >> 3) & 7]}` };

  // JP nn (unconditional)
  if (op === 0xC3) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `JP ${fmtAddr(nn)}${annotate(nn)}`, target: nn, kind: 'JP', flowStop: !isSIS };
  }
  // JP cc,nn
  if ((op & 0xC7) === 0xC2) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `JP ${CC_TABLE[(op >> 3) & 7]},${fmtAddr(nn)}${annotate(nn)}`, target: nn, kind: 'JP' };
  }
  // JR e
  if (op === 0x18) {
    const e = signed8(rom[addr + 1]);
    const target = addr + 2 + e;
    return { len: 2, mnemonic: `JR ${hex24(target)}${annotate(target)}`, target, kind: 'JR', flowStop: true };
  }
  // JR cc,e
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const cond = ['NZ', 'Z', 'NC', 'C'][(op - 0x20) >> 3];
    const e = signed8(rom[addr + 1]);
    const target = addr + 2 + e;
    return { len: 2, mnemonic: `JR ${cond},${hex24(target)}${annotate(target)}`, target, kind: 'JR' };
  }
  // DJNZ e
  if (op === 0x10) {
    const e = signed8(rom[addr + 1]);
    const target = addr + 2 + e;
    return { len: 2, mnemonic: `DJNZ ${hex24(target)}`, target, kind: 'DJNZ' };
  }
  // CALL nn
  if (op === 0xCD) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `CALL ${fmtAddr(nn)}${annotate(nn)}`, target: nn, kind: 'CALL' };
  }
  // CALL cc,nn
  if ((op & 0xC7) === 0xC4) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `CALL ${CC_TABLE[(op >> 3) & 7]},${fmtAddr(nn)}${annotate(nn)}`, target: nn, kind: 'CALL' };
  }
  // RST
  if ((op & 0xC7) === 0xC7) {
    const vec = op & 0x38;
    if (vec === 0x28) {
      const idx = rom[addr + 1] | (rom[addr + 2] << 8);
      return { len: 3, mnemonic: `RST 28h  ; BCALL ${hex16(idx)}` };
    }
    return { len: 1, mnemonic: `RST ${hex8(vec)}` };
  }

  // LD rr,nn
  if ((op & 0xCF) === 0x01) {
    const rr = REG16[(op >> 4) & 3];
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD ${rr},${fmtAddr(nn)}${annotate(nn)}` };
  }
  // LD (nn),A
  if (op === 0x32) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD (${fmtAddr(nn)}),A${annotate(nn)}` };
  }
  // LD A,(nn)
  if (op === 0x3A) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD A,(${fmtAddr(nn)})${annotate(nn)}` };
  }
  // LD (nn),HL
  if (op === 0x22) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD (${fmtAddr(nn)}),HL${annotate(nn)}` };
  }
  // LD HL,(nn)
  if (op === 0x2A) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD HL,(${fmtAddr(nn)})${annotate(nn)}` };
  }
  // LD HL,nn
  if (op === 0x21) {
    const nn = readAddr();
    return { len: 1 + addrSize, mnemonic: `LD HL,${fmtAddr(nn)}${annotate(nn)}` };
  }

  // LD A,n
  if (op === 0x3E) {
    const n = rom[addr + 1];
    return { len: 2, mnemonic: `LD A,${hex8(n)}${charAnnotation(n)}` };
  }
  // LD r,n
  if ((op & 0xC7) === 0x06 && op !== 0x36) {
    const r = REG8[(op >> 3) & 7];
    const n = rom[addr + 1];
    return { len: 2, mnemonic: `LD ${r},${hex8(n)}` };
  }
  // LD (HL),n
  if (op === 0x36) {
    const n = rom[addr + 1];
    return { len: 2, mnemonic: `LD (HL),${hex8(n)}` };
  }
  // LD r,r (40-7F except 76=HALT)
  if ((op & 0xC0) === 0x40) {
    return { len: 1, mnemonic: `LD ${REG8[(op >> 3) & 7]},${REG8[op & 7]}` };
  }

  // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
  if (op === 0x02) return { len: 1, mnemonic: 'LD (BC),A' };
  if (op === 0x12) return { len: 1, mnemonic: 'LD (DE),A' };
  if (op === 0x0A) return { len: 1, mnemonic: 'LD A,(BC)' };
  if (op === 0x1A) return { len: 1, mnemonic: 'LD A,(DE)' };

  // INC/DEC rr
  if ((op & 0xCF) === 0x03) return { len: 1, mnemonic: `INC ${REG16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { len: 1, mnemonic: `DEC ${REG16[(op >> 4) & 3]}` };
  // INC/DEC r
  if ((op & 0xC7) === 0x04) return { len: 1, mnemonic: `INC ${REG8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { len: 1, mnemonic: `DEC ${REG8[(op >> 3) & 7]}` };

  // PUSH/POP
  if ((op & 0xCF) === 0xC5) return { len: 1, mnemonic: `PUSH ${REG16AF[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { len: 1, mnemonic: `POP ${REG16AF[(op >> 4) & 3]}` };

  // ALU A,r (80-BF)
  if ((op & 0xC0) === 0x80) {
    return { len: 1, mnemonic: `${ALU_OP[(op >> 3) & 7]}${REG8[op & 7]}` };
  }
  // ALU A,n (C6/CE/D6/DE/E6/EE/F6/FE)
  if ((op & 0xC7) === 0xC6) {
    const n = rom[addr + 1];
    const extra = (op === 0xFE) ? charAnnotation(n) : '';
    return { len: 2, mnemonic: `${ALU_OP[(op >> 3) & 7]}${hex8(n)}${extra}` };
  }

  // ADD HL,rr
  if ((op & 0xCF) === 0x09) return { len: 1, mnemonic: `ADD HL,${REG16[(op >> 4) & 3]}` };

  // Misc single-byte
  if (op === 0xEB) return { len: 1, mnemonic: 'EX DE,HL' };
  if (op === 0x08) return { len: 1, mnemonic: "EX AF,AF'" };
  if (op === 0xD9) return { len: 1, mnemonic: 'EXX' };
  if (op === 0xE3) return { len: 1, mnemonic: 'EX (SP),HL' };
  if (op === 0xE9) return { len: 1, mnemonic: 'JP (HL)', flowStop: true };
  if (op === 0xF9) return { len: 1, mnemonic: 'LD SP,HL' };
  if (op === 0xF3) return { len: 1, mnemonic: 'DI' };
  if (op === 0xFB) return { len: 1, mnemonic: 'EI' };
  if (op === 0x37) return { len: 1, mnemonic: 'SCF' };
  if (op === 0x3F) return { len: 1, mnemonic: 'CCF' };
  if (op === 0x2F) return { len: 1, mnemonic: 'CPL' };
  if (op === 0x27) return { len: 1, mnemonic: 'DAA' };
  if (op === 0x07) return { len: 1, mnemonic: 'RLCA' };
  if (op === 0x0F) return { len: 1, mnemonic: 'RRCA' };
  if (op === 0x17) return { len: 1, mnemonic: 'RLA' };
  if (op === 0x1F) return { len: 1, mnemonic: 'RRA' };

  // OUT (n),A / IN A,(n)
  if (op === 0xD3) return { len: 2, mnemonic: `OUT (${hex8(rom[addr + 1])}),A` };
  if (op === 0xDB) return { len: 2, mnemonic: `IN A,(${hex8(rom[addr + 1])})` };

  return { len: 1, mnemonic: `DB ${hex8(op)}` };
}

// ---------------------------------------------------------------------------
// Disassemble a function
// ---------------------------------------------------------------------------
function disassembleFunction(startAddr, name, maxBytes) {
  const instructions = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const insn = decode(pc);
    instructions.push({ ...insn, addr: pc });
    pc += Math.max(insn.len, 1);
    if (insn.flowStop) break;
  }

  console.log('');
  console.log('-'.repeat(78));
  console.log(`FUNCTION: ${hex24(startAddr)} - ${name}`);
  console.log('-'.repeat(78));

  for (const insn of instructions) {
    const addrStr = hex24(insn.addr);
    const bytes = bytesAt(insn.addr, insn.len).padEnd(20);
    console.log(`  ${addrStr}: ${bytes} ${insn.mnemonic}`);
  }

  // Summary
  const lastInsn = instructions[instructions.length - 1];
  const size = (lastInsn.addr - startAddr) + lastInsn.len;

  const calls = instructions.filter(i => i.kind === 'CALL');
  const jumps = instructions.filter(i => i.kind === 'JP');
  const jrs = instructions.filter(i => i.kind === 'JR' || i.kind === 'DJNZ');
  const bcalls = instructions.filter(i => i.mnemonic.includes('BCALL'));
  const memReads = instructions.filter(i => /LD [A-Z]+,\(0x[0-9A-F]{6}\)/.test(i.mnemonic));
  const memWrites = instructions.filter(i => /LD \(0x[0-9A-F]{6}\)/.test(i.mnemonic));

  console.log('');
  console.log(`  SIZE: ${size} bytes (${instructions.length} instructions)`);
  if (calls.length) console.log(`  CALLs: ${calls.map(c => `${hex24(c.target)}`).join(', ')}`);
  if (jumps.length) console.log(`  JPs: ${jumps.map(j => `${j.mnemonic}`).join('; ')}`);
  if (jrs.length) console.log(`  JRs: ${jrs.map(j => `${hex24(j.addr)}: ${j.mnemonic}`).join('; ')}`);
  if (bcalls.length) console.log(`  BCALLs: ${bcalls.map(b => b.mnemonic).join('; ')}`);
  if (memReads.length) console.log(`  MEM reads: ${memReads.map(m => m.mnemonic).join('; ')}`);
  if (memWrites.length) console.log(`  MEM writes: ${memWrites.map(m => m.mnemonic).join('; ')}`);

  const terminatorOk = lastInsn.flowStop;
  console.log(`  TERMINATOR: ${lastInsn.mnemonic}${terminatorOk ? '' : ' (max-bytes reached, no RET/JP found)'}`);

  return { instructions, size, calls, jumps, jrs, memReads, memWrites };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('='.repeat(78));
console.log('probe-phase505: Static disassembly of 0x0A1B5B and short helpers');
console.log(`ROM: ${romPath}  (${rom.length} bytes)`);
console.log('='.repeat(78));

// Primary target -- 180 bytes max
const primary = disassembleFunction(0x0A1B5B,
  'putchar overlay / display-list writer (called by 0x0979E4 when cursor visible)',
  180);

// Decode short helpers called from primary that live in 0x0A1000-0x0A2FFF
const helperRange = { lo: 0x0A1000, hi: 0x0A2FFF };
const seen = new Set([0x0A1B5B]);

for (const callInsn of primary.calls) {
  const t = callInsn.target;
  if (t == null) continue;
  if (t < helperRange.lo || t > helperRange.hi) continue;
  if (seen.has(t)) continue;
  seen.add(t);

  const peek = [];
  let pc = t;
  while (pc < t + 50) {
    const insn = decode(pc);
    peek.push({ ...insn, addr: pc });
    pc += Math.max(insn.len, 1);
    if (insn.flowStop) break;
  }
  const last = peek[peek.length - 1];
  const sz   = (last.addr - t) + last.len;
  if (sz <= 40) {
    disassembleFunction(t, `helper called from 0x0A1B5B  (measured ${sz}B)`, 50);
  }
}

// Hex context dumps
console.log('');
console.log('-'.repeat(78));
console.log('HEX DUMP: context around 0x0A1B5B  (192 bytes)');
console.log('-'.repeat(78));
for (let row = 0x0A1B40; row < 0x0A1C00; row += 16) {
  const bytes = []; const ascii = [];
  for (let i = 0; i < 16; i++) {
    const b = rom[row + i];
    bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${hex24(row)}: ${bytes.join(' ').padEnd(48)}  ${ascii.join('')}`);
}

console.log('');
console.log('='.repeat(78));
console.log('probe-phase505 complete');
console.log('='.repeat(78));
