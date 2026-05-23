#!/usr/bin/env node
/**
 * Phase 416: Map D177BD 5-entry function pointer table
 *
 * D177BD-D177CB is a 5-entry table of 3-byte (24-bit) function pointers,
 * used for per-channel notification dispatch via JP (IY) at 0x002288.
 *
 * Slots:
 *   D177BD  (slot 0)
 *   D177C0  (slot 1)
 *   D177C3  (slot 2)
 *   D177C6  (slot 3)
 *   D177C9  (slot 4)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase416-D177BD-table-report.md');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;
const SEARCH_END = Math.min(ROM_SIZE, 0x0C0000); // OS region

// ── Helpers ──────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0').toUpperCase();
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function dumpHex(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    parts.push(hexByte(buf[start + i]));
  }
  return parts.join(' ');
}

// ── Minimal eZ80 disassembler (enough for context around call sites) ──

function disasmOne(buf, pc) {
  if (pc >= buf.length) return { mnemonic: '???', len: 1 };
  const b0 = buf[pc];

  const incDecRegs = ['B','C','D','E','H','L','(HL)','A'];

  // DD/FD prefix (IX/IY)
  if (b0 === 0xDD || b0 === 0xFD) {
    const reg = b0 === 0xDD ? 'IX' : 'IY';
    if (pc + 1 >= buf.length) return { mnemonic: `${b0 === 0xDD ? 'DD' : 'FD'} prefix (truncated)`, len: 1 };
    const b1 = buf[pc + 1];

    // LD reg, (nn) — DD/FD 2A nn nn nn
    if (b1 === 0x2A && pc + 4 < buf.length) {
      const addr = read24(buf, pc + 2);
      return { mnemonic: `LD ${reg},(${ hex(addr) })`, len: 5 };
    }
    // LD (nn), reg — DD/FD 22 nn nn nn
    if (b1 === 0x22 && pc + 4 < buf.length) {
      const addr = read24(buf, pc + 2);
      return { mnemonic: `LD (${ hex(addr) }),${reg}`, len: 5 };
    }
    // JP (IX)/(IY) — DD/FD E9
    if (b1 === 0xE9) {
      return { mnemonic: `JP (${reg})`, len: 2 };
    }
    // LD reg, nn — DD/FD 21 nn nn nn
    if (b1 === 0x21 && pc + 4 < buf.length) {
      const val = read24(buf, pc + 2);
      return { mnemonic: `LD ${reg},${hex(val)}`, len: 5 };
    }
    // PUSH reg — DD/FD E5
    if (b1 === 0xE5) {
      return { mnemonic: `PUSH ${reg}`, len: 2 };
    }
    // POP reg — DD/FD E1
    if (b1 === 0xE1) {
      return { mnemonic: `POP ${reg}`, len: 2 };
    }
    // ADD IX/IY, rr
    if (b1 === 0x09) return { mnemonic: `ADD ${reg},BC`, len: 2 };
    if (b1 === 0x19) return { mnemonic: `ADD ${reg},DE`, len: 2 };
    if (b1 === 0x29) return { mnemonic: `ADD ${reg},${reg}`, len: 2 };
    if (b1 === 0x39) return { mnemonic: `ADD ${reg},SP`, len: 2 };

    // LD r, (IX/IY+d) — 0x46,0x4E,0x56,0x5E,0x66,0x6E,0x7E
    if ((b1 & 0xC7) === 0x46 && b1 !== 0x76 && pc + 2 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const r2 = incDecRegs[(b1 >> 3) & 7];
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `LD ${r2},(${reg}${sign}${d})`, len: 3 };
    }
    // LD (IX/IY+d), r — 0x70-0x77 (except 0x76)
    if (b1 >= 0x70 && b1 <= 0x77 && b1 !== 0x76 && pc + 2 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const r2 = incDecRegs[b1 & 7];
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `LD (${reg}${sign}${d}),${r2}`, len: 3 };
    }
    // LD (IX/IY+d), n — DD/FD 36 d n
    if (b1 === 0x36 && pc + 3 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const n = buf[pc + 3];
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `LD (${reg}${sign}${d}),${hex(n, 2)}`, len: 4 };
    }
    // INC/DEC (IX/IY+d)
    if (b1 === 0x34 && pc + 2 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `INC (${reg}${sign}${d})`, len: 3 };
    }
    if (b1 === 0x35 && pc + 2 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `DEC (${reg}${sign}${d})`, len: 3 };
    }
    // BIT/RES/SET (IX/IY+d) — DD/FD CB d op
    if (b1 === 0xCB && pc + 3 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const op = buf[pc + 3];
      const bit = (op >> 3) & 7;
      const sign = d >= 0 ? '+' : '';
      if (op >= 0x40 && op < 0x80) return { mnemonic: `BIT ${bit},(${reg}${sign}${d})`, len: 4 };
      if (op >= 0x80 && op < 0xC0) return { mnemonic: `RES ${bit},(${reg}${sign}${d})`, len: 4 };
      if (op >= 0xC0) return { mnemonic: `SET ${bit},(${reg}${sign}${d})`, len: 4 };
    }
    // LD SP, IX/IY — DD/FD F9
    if (b1 === 0xF9) return { mnemonic: `LD SP,${reg}`, len: 2 };

    // ALU A, (IX/IY+d)
    const aluMap = { 0x86: 'ADD', 0x8E: 'ADC', 0x96: 'SUB', 0x9E: 'SBC',
                     0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR',  0xBE: 'CP' };
    if (aluMap[b1] && pc + 2 < buf.length) {
      const d = (buf[pc + 2] << 24) >> 24;
      const sign = d >= 0 ? '+' : '';
      return { mnemonic: `${aluMap[b1]} A,(${reg}${sign}${d})`, len: 3 };
    }

    return { mnemonic: `${b0 === 0xDD ? 'DD' : 'FD'} ${hexByte(b1)} ...`, len: 2 };
  }

  // ED prefix
  if (b0 === 0xED) {
    if (pc + 1 >= buf.length) return { mnemonic: 'ED prefix (truncated)', len: 1 };
    const b1 = buf[pc + 1];

    // LD (nn), BC/DE/HL/SP
    if (b1 === 0x43 && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD (${hex(a)}),BC`, len: 5 }; }
    if (b1 === 0x53 && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD (${hex(a)}),DE`, len: 5 }; }
    if (b1 === 0x63 && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD (${hex(a)}),HL`, len: 5 }; }
    if (b1 === 0x73 && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD (${hex(a)}),SP`, len: 5 }; }

    // LD BC/DE/HL/SP, (nn)
    if (b1 === 0x4B && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD BC,(${hex(a)})`, len: 5 }; }
    if (b1 === 0x5B && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD DE,(${hex(a)})`, len: 5 }; }
    if (b1 === 0x6B && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD HL,(${hex(a)})`, len: 5 }; }
    if (b1 === 0x7B && pc + 4 < buf.length) { const a = read24(buf, pc+2); return { mnemonic: `LD SP,(${hex(a)})`, len: 5 }; }

    // LDIR, LDDR, CPIR, CPDR
    if (b1 === 0xB0) return { mnemonic: 'LDIR', len: 2 };
    if (b1 === 0xB8) return { mnemonic: 'LDDR', len: 2 };
    if (b1 === 0xB1) return { mnemonic: 'CPIR', len: 2 };
    if (b1 === 0xB9) return { mnemonic: 'CPDR', len: 2 };

    return { mnemonic: `ED ${hexByte(b1)}`, len: 2 };
  }

  // CB prefix (bit ops)
  if (b0 === 0xCB) {
    if (pc + 1 >= buf.length) return { mnemonic: 'CB prefix (truncated)', len: 1 };
    const b1 = buf[pc + 1];
    const regNames = ['B','C','D','E','H','L','(HL)','A'];
    const r = regNames[b1 & 7];
    const bit = (b1 >> 3) & 7;
    if (b1 < 0x40) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      return { mnemonic: `${ops[bit]} ${r}`, len: 2 };
    }
    if (b1 < 0x80) return { mnemonic: `BIT ${bit},${r}`, len: 2 };
    if (b1 < 0xC0) return { mnemonic: `RES ${bit},${r}`, len: 2 };
    return { mnemonic: `SET ${bit},${r}`, len: 2 };
  }

  // Single-byte instructions
  if (b0 === 0x00) return { mnemonic: 'NOP', len: 1 };
  if (b0 === 0x76) return { mnemonic: 'HALT', len: 1 };
  if (b0 === 0xC9) return { mnemonic: 'RET', len: 1 };
  if (b0 === 0xF3) return { mnemonic: 'DI', len: 1 };
  if (b0 === 0xFB) return { mnemonic: 'EI', len: 1 };
  if (b0 === 0xD9) return { mnemonic: 'EXX', len: 1 };
  if (b0 === 0x08) return { mnemonic: "EX AF,AF'", len: 1 };
  if (b0 === 0xEB) return { mnemonic: 'EX DE,HL', len: 1 };
  if (b0 === 0xE3) return { mnemonic: 'EX (SP),HL', len: 1 };
  if (b0 === 0xE9) return { mnemonic: 'JP (HL)', len: 1 };
  if (b0 === 0x37) return { mnemonic: 'SCF', len: 1 };
  if (b0 === 0x3F) return { mnemonic: 'CCF', len: 1 };
  if (b0 === 0x2F) return { mnemonic: 'CPL', len: 1 };
  if (b0 === 0x27) return { mnemonic: 'DAA', len: 1 };

  // PUSH/POP
  if (b0 === 0xC5) return { mnemonic: 'PUSH BC', len: 1 };
  if (b0 === 0xD5) return { mnemonic: 'PUSH DE', len: 1 };
  if (b0 === 0xE5) return { mnemonic: 'PUSH HL', len: 1 };
  if (b0 === 0xF5) return { mnemonic: 'PUSH AF', len: 1 };
  if (b0 === 0xC1) return { mnemonic: 'POP BC', len: 1 };
  if (b0 === 0xD1) return { mnemonic: 'POP DE', len: 1 };
  if (b0 === 0xE1) return { mnemonic: 'POP HL', len: 1 };
  if (b0 === 0xF1) return { mnemonic: 'POP AF', len: 1 };

  // INC/DEC 16-bit
  if (b0 === 0x03) return { mnemonic: 'INC BC', len: 1 };
  if (b0 === 0x13) return { mnemonic: 'INC DE', len: 1 };
  if (b0 === 0x23) return { mnemonic: 'INC HL', len: 1 };
  if (b0 === 0x33) return { mnemonic: 'INC SP', len: 1 };
  if (b0 === 0x0B) return { mnemonic: 'DEC BC', len: 1 };
  if (b0 === 0x1B) return { mnemonic: 'DEC DE', len: 1 };
  if (b0 === 0x2B) return { mnemonic: 'DEC HL', len: 1 };
  if (b0 === 0x3B) return { mnemonic: 'DEC SP', len: 1 };

  // INC/DEC 8-bit
  if ((b0 & 0xC7) === 0x04) return { mnemonic: `INC ${incDecRegs[(b0 >> 3) & 7]}`, len: 1 };
  if ((b0 & 0xC7) === 0x05) return { mnemonic: `DEC ${incDecRegs[(b0 >> 3) & 7]}`, len: 1 };

  // LD r, r' (0x40-0x7F except HALT at 0x76)
  if (b0 >= 0x40 && b0 <= 0x7F) {
    const dst = incDecRegs[(b0 >> 3) & 7];
    const src = incDecRegs[b0 & 7];
    return { mnemonic: `LD ${dst},${src}`, len: 1 };
  }

  // ALU A, r (0x80-0xBF)
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD','ADC','SUB','SBC','AND','XOR','OR','CP'];
    const r = incDecRegs[b0 & 7];
    return { mnemonic: `${ops[(b0 >> 3) & 7]} A,${r}`, len: 1 };
  }

  // LD r, n (8-bit immediate)
  if ((b0 & 0xC7) === 0x06 && pc + 1 < buf.length) {
    const r = incDecRegs[(b0 >> 3) & 7];
    return { mnemonic: `LD ${r},${hex(buf[pc + 1], 2)}`, len: 2 };
  }

  // LD rr, nn (16/24-bit immediate)
  if (b0 === 0x01 && pc + 3 < buf.length) { const v = read24(buf, pc+1); return { mnemonic: `LD BC,${hex(v)}`, len: 4 }; }
  if (b0 === 0x11 && pc + 3 < buf.length) { const v = read24(buf, pc+1); return { mnemonic: `LD DE,${hex(v)}`, len: 4 }; }
  if (b0 === 0x21 && pc + 3 < buf.length) { const v = read24(buf, pc+1); return { mnemonic: `LD HL,${hex(v)}`, len: 4 }; }
  if (b0 === 0x31 && pc + 3 < buf.length) { const v = read24(buf, pc+1); return { mnemonic: `LD SP,${hex(v)}`, len: 4 }; }

  // LD A, (nn) / LD (nn), A
  if (b0 === 0x3A && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `LD A,(${hex(a)})`, len: 4 }; }
  if (b0 === 0x32 && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `LD (${hex(a)}),A`, len: 4 }; }

  // LD HL, (nn) / LD (nn), HL
  if (b0 === 0x2A && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `LD HL,(${hex(a)})`, len: 4 }; }
  if (b0 === 0x22 && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `LD (${hex(a)}),HL`, len: 4 }; }

  // JP nn
  if (b0 === 0xC3 && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `JP ${hex(a)}`, len: 4 }; }
  // JP cc, nn
  const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
  if ((b0 & 0xC7) === 0xC2 && pc + 3 < buf.length) {
    const cc = ccNames[(b0 >> 3) & 7];
    const a = read24(buf, pc+1);
    return { mnemonic: `JP ${cc},${hex(a)}`, len: 4 };
  }

  // CALL nn
  if (b0 === 0xCD && pc + 3 < buf.length) { const a = read24(buf, pc+1); return { mnemonic: `CALL ${hex(a)}`, len: 4 }; }
  // CALL cc, nn
  if ((b0 & 0xC7) === 0xC4 && pc + 3 < buf.length) {
    const cc = ccNames[(b0 >> 3) & 7];
    const a = read24(buf, pc+1);
    return { mnemonic: `CALL ${cc},${hex(a)}`, len: 4 };
  }

  // RET cc
  if ((b0 & 0xC7) === 0xC0) {
    const cc = ccNames[(b0 >> 3) & 7];
    return { mnemonic: `RET ${cc}`, len: 1 };
  }

  // JR e
  if (b0 === 0x18 && pc + 1 < buf.length) {
    const off = (buf[pc + 1] << 24) >> 24; // sign-extend
    const target = pc + 2 + off;
    return { mnemonic: `JR ${hex(target)}`, len: 2 };
  }
  // JR cc, e
  if ((b0 & 0xE7) === 0x20 && pc + 1 < buf.length) {
    const cc = ['NZ','Z','NC','C'][(b0 >> 3) & 3];
    const off = (buf[pc + 1] << 24) >> 24;
    const target = pc + 2 + off;
    return { mnemonic: `JR ${cc},${hex(target)}`, len: 2 };
  }

  // DJNZ e
  if (b0 === 0x10 && pc + 1 < buf.length) {
    const off = (buf[pc + 1] << 24) >> 24;
    const target = pc + 2 + off;
    return { mnemonic: `DJNZ ${hex(target)}`, len: 2 };
  }

  // RST
  if ((b0 & 0xC7) === 0xC7) {
    return { mnemonic: `RST ${hex(b0 & 0x38, 2)}`, len: 1 };
  }

  // ALU A, n
  const aluOps = ['ADD','ADC','SUB','SBC','AND','XOR','OR','CP'];
  if ((b0 & 0xC7) === 0xC6 && pc + 1 < buf.length) {
    const op = aluOps[(b0 >> 3) & 7];
    return { mnemonic: `${op} A,${hex(buf[pc + 1], 2)}`, len: 2 };
  }

  // OUT (n), A / IN A, (n)
  if (b0 === 0xD3 && pc + 1 < buf.length) return { mnemonic: `OUT (${hex(buf[pc+1],2)}),A`, len: 2 };
  if (b0 === 0xDB && pc + 1 < buf.length) return { mnemonic: `IN A,(${hex(buf[pc+1],2)})`, len: 2 };

  // LD A, (BC)/(DE) and LD (BC)/(DE), A
  if (b0 === 0x0A) return { mnemonic: 'LD A,(BC)', len: 1 };
  if (b0 === 0x1A) return { mnemonic: 'LD A,(DE)', len: 1 };
  if (b0 === 0x02) return { mnemonic: 'LD (BC),A', len: 1 };
  if (b0 === 0x12) return { mnemonic: 'LD (DE),A', len: 1 };

  // ADD HL, rr
  if (b0 === 0x09) return { mnemonic: 'ADD HL,BC', len: 1 };
  if (b0 === 0x19) return { mnemonic: 'ADD HL,DE', len: 1 };
  if (b0 === 0x29) return { mnemonic: 'ADD HL,HL', len: 1 };
  if (b0 === 0x39) return { mnemonic: 'ADD HL,SP', len: 1 };

  // Rotate A
  if (b0 === 0x07) return { mnemonic: 'RLCA', len: 1 };
  if (b0 === 0x0F) return { mnemonic: 'RRCA', len: 1 };
  if (b0 === 0x17) return { mnemonic: 'RLA', len: 1 };
  if (b0 === 0x1F) return { mnemonic: 'RRA', len: 1 };

  return { mnemonic: `DB ${hexByte(b0)}`, len: 1 };
}

function disasmRange(buf, start, end) {
  const lines = [];
  let pc = start;
  while (pc < end && pc < buf.length) {
    const { mnemonic, len } = disasmOne(buf, pc);
    const bytes = dumpHex(buf, pc, len);
    lines.push(`  ${hex(pc)}:  ${bytes.padEnd(20)} ${mnemonic}`);
    pc += len;
  }
  return lines;
}

// ── Main analysis ────────────────────────────────────────────────────

const out = [];
function log(s = '') { out.push(s); console.log(s); }

log('# Phase 416: D177BD 5-Entry Function Pointer Table Analysis');
log();

// ── 1. Caller site disassembly ──

const CALLERS = [
  { addr: 0x010269, slot: 'D177BD', slotIdx: 0 },
  { addr: 0x0102A4, slot: 'D177C0', slotIdx: 1 },
  { addr: 0x0102C9, slot: 'D177C3', slotIdx: 2 },
  { addr: 0x0102F2, slot: 'D177C6', slotIdx: 3 },
  { addr: 0x010389, slot: 'D177C9', slotIdx: 4 },
];

log('## 1. Caller Site Disassembly');
log();
log('Each caller loads IY from a table slot, then calls 0x002288 (JP (IY)).');
log();

for (const { addr, slot, slotIdx } of CALLERS) {
  const contextBefore = 30;
  const contextAfter = 15;
  const start = Math.max(0, addr - contextBefore);
  const end = Math.min(rom.length, addr + contextAfter);

  log(`### Caller ${slotIdx}: ${hex(addr)} → slot ${slot}`);
  log('```');
  const lines = disasmRange(rom, start, end);
  for (const line of lines) {
    // Mark the key instruction
    if (line.includes(hex(addr))) {
      log(line + '  ◄◄◄ IY load');
    } else {
      log(line);
    }
  }
  log('```');
  log();
}

// ── 2. ROM reference search ──

const SLOTS = [
  { name: 'D177BD', addr: 0xD177BD, le: [0xBD, 0x77, 0xD1] },
  { name: 'D177C0', addr: 0xD177C0, le: [0xC0, 0x77, 0xD1] },
  { name: 'D177C3', addr: 0xD177C3, le: [0xC3, 0x77, 0xD1] },
  { name: 'D177C6', addr: 0xD177C6, le: [0xC6, 0x77, 0xD1] },
  { name: 'D177C9', addr: 0xD177C9, le: [0xC9, 0x77, 0xD1] },
];

log('## 2. ROM References to Each Slot');
log();

const allRefs = {};

for (const slot of SLOTS) {
  const refs = [];
  for (let i = 0; i < SEARCH_END - 2; i++) {
    if (rom[i] === slot.le[0] && rom[i+1] === slot.le[1] && rom[i+2] === slot.le[2]) {
      // Determine access type by looking at preceding bytes
      let accessType = 'unknown';
      let instrStart = i;

      // Check for DD/FD 2A (LD IX/IY, (nn))
      if (i >= 2 && (rom[i-2] === 0xDD || rom[i-2] === 0xFD) && rom[i-1] === 0x2A) {
        const reg = rom[i-2] === 0xDD ? 'IX' : 'IY';
        accessType = `READ: LD ${reg},(${slot.name})`;
        instrStart = i - 2;
      }
      // Check for DD/FD 22 (LD (nn), IX/IY)
      else if (i >= 2 && (rom[i-2] === 0xDD || rom[i-2] === 0xFD) && rom[i-1] === 0x22) {
        const reg = rom[i-2] === 0xDD ? 'IX' : 'IY';
        accessType = `WRITE: LD (${slot.name}),${reg}`;
        instrStart = i - 2;
      }
      // Check for ED 4B/5B/6B/7B (LD rr, (nn))
      else if (i >= 2 && rom[i-2] === 0xED) {
        const b1 = rom[i-1];
        const regMap = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
        if (regMap[b1]) {
          accessType = `READ: LD ${regMap[b1]},(${slot.name})`;
          instrStart = i - 2;
        }
        const writeMap = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
        if (writeMap[b1]) {
          accessType = `WRITE: LD (${slot.name}),${writeMap[b1]}`;
          instrStart = i - 2;
        }
      }
      // Check for 2A (LD HL, (nn))
      else if (i >= 1 && rom[i-1] === 0x2A) {
        accessType = `READ: LD HL,(${slot.name})`;
        instrStart = i - 1;
      }
      // Check for 22 (LD (nn), HL)
      else if (i >= 1 && rom[i-1] === 0x22) {
        accessType = `WRITE: LD (${slot.name}),HL`;
        instrStart = i - 1;
      }
      // Check for 3A (LD A, (nn))
      else if (i >= 1 && rom[i-1] === 0x3A) {
        accessType = `READ: LD A,(${slot.name})`;
        instrStart = i - 1;
      }
      // Check for 32 (LD (nn), A)
      else if (i >= 1 && rom[i-1] === 0x32) {
        accessType = `WRITE: LD (${slot.name}),A`;
        instrStart = i - 1;
      }

      refs.push({ offset: i, instrStart, accessType });
    }
  }

  allRefs[slot.name] = refs;

  const reads = refs.filter(r => r.accessType.startsWith('READ'));
  const writes = refs.filter(r => r.accessType.startsWith('WRITE'));
  const unknown = refs.filter(r => r.accessType === 'unknown');

  log(`### Slot ${slot.name} (LE bytes: ${slot.le.map(hexByte).join(' ')})`);
  log(`Total refs: ${refs.length} | Reads: ${reads.length} | Writes: ${writes.length} | Unknown: ${unknown.length}`);
  log();

  for (const ref of refs) {
    let extra = '';
    if (ref.accessType === 'unknown') {
      // Show surrounding bytes for unknown refs
      const ctx = Math.max(0, ref.offset - 5);
      extra = ` | context: ${dumpHex(rom, ctx, 12)}`;
    }
    log(`  ${hex(ref.offset)} (instr @ ${hex(ref.instrStart)}): ${ref.accessType}${extra}`);
  }
  log();
}

// ── 3. Write site context disassembly ──

log('## 3. Write Site Context Disassembly');
log();

for (const slot of SLOTS) {
  const refs = allRefs[slot.name];
  const writes = refs.filter(r => r.accessType.startsWith('WRITE'));

  if (writes.length === 0) {
    log(`### ${slot.name}: No write sites found`);
    log();
    continue;
  }

  log(`### ${slot.name}: ${writes.length} write site(s)`);
  log();

  for (const w of writes) {
    const contextBefore = 30;
    const contextAfter = 15;
    const start = Math.max(0, w.instrStart - contextBefore);
    const end = Math.min(rom.length, w.instrStart + contextAfter);

    log(`#### Write at ${hex(w.instrStart)}: ${w.accessType}`);
    log('```');
    const lines = disasmRange(rom, start, end);
    for (const line of lines) {
      if (line.includes(hex(w.instrStart))) {
        log(line + '  ◄◄◄ WRITE');
      } else {
        log(line);
      }
    }
    log('```');
    log();
  }
}

// ── 4. Cross-reference with dispatch table at 0x0120AA and notification channels ──

log('## 4. Cross-Reference');
log();

log('### 4a. Dispatch table at 0x0120AA (disassembly of region)');
log();
log('Disassembly of 0x012090-0x0120D0:');
log('```');
for (const line of disasmRange(rom, 0x012090, 0x0120D0)) log(line);
log('```');
log();
log('Raw bytes at 0x0120AA (18 bytes): ' + dumpHex(rom, 0x0120AA, 18));
log();

log('### 4b. Notification channels');
log();
const channels = [
  { name: 'Ch1', addrs: [0xD1440E, 0xD1440F] },
  { name: 'Ch2', addrs: [0xD17779, 0xD1777A] },
  { name: 'Ch3', addrs: [0xD176C9, 0xD176CA] },
];

for (const ch of channels) {
  log(`  ${ch.name}: ${ch.addrs.map(a => hex(a)).join(', ')}`);

  // Search for references to each channel address
  for (const addr of ch.addrs) {
    const le = [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF];
    let count = 0;
    for (let i = 0; i < SEARCH_END - 2; i++) {
      if (rom[i] === le[0] && rom[i+1] === le[1] && rom[i+2] === le[2]) {
        count++;
      }
    }
    log(`    ${hex(addr)} (${le.map(hexByte).join(' ')}): ${count} ROM refs`);
  }
}
log();

log('### 4c. Subroutine 0x0021C2 — the null-check gate');
log();
log('Every caller does: LD HL,(slot) → CALL 0x0021C2 → JR Z,skip → LD IY,(slot) → CALL 0x002288');
log('0x0021C2 likely checks if HL == 0 (null pointer guard). Disassembly:');
log('```');
for (const line of disasmRange(rom, 0x0021C2, 0x0021D5)) log(line);
log('```');
log();

log('### 4d. Trampoline 0x002288 — JP (IY)');
log('```');
for (const line of disasmRange(rom, 0x002288, 0x00228C)) log(line);
log('```');
log();

log('### 4e. Registrar function at 0x0106A3 area');
log('The region 0x0106A3-0x0106F3 writes to individual slots — appears to be a registration function.');
log('```');
for (const line of disasmRange(rom, 0x0106A0, 0x0106F5)) log(line);
log('```');
log();

log('### 4f. Teardown/clear function at 0x010F00 area');
log('At 0x010F0F, LD BC,0x000000 then writes 0 to all 5 slots — clearing all callbacks.');
log('```');
for (const line of disasmRange(rom, 0x010EF0, 0x010F40)) log(line);
log('```');
log();

// ── 5. Table structure summary ──

log('## 5. Table Structure Summary');
log();
log('```');
log('Address    Slot   LE bytes      Caller PC    Reads  Writes');
log('─────────  ─────  ────────────  ───────────  ─────  ──────');
for (let i = 0; i < SLOTS.length; i++) {
  const s = SLOTS[i];
  const c = CALLERS[i];
  const refs = allRefs[s.name];
  const reads = refs.filter(r => r.accessType.startsWith('READ')).length;
  const writes = refs.filter(r => r.accessType.startsWith('WRITE')).length;
  log(`${s.name}    ${i}      ${s.le.map(hexByte).join(' ')}       ${hex(c.addr)}     ${String(reads).padStart(5)}  ${String(writes).padStart(6)}`);
}
log('```');
log();

// ── Write report ──

fs.writeFileSync(REPORT_PATH, out.join('\n'), 'utf8');
log();
log(`Report written to ${REPORT_PATH}`);
