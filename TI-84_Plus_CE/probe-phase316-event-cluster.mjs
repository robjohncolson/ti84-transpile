#!/usr/bin/env node
/**
 * probe-phase316-event-cluster.mjs
 *
 * Deep analysis of the 0x00F000-0x00FFFF event dispatch cluster.
 * Session 315 identified 8 frame-based _indcall sites in 6 functions
 * in this region. This probe:
 *
 *   1. Scans 0x00F000-0x00FFFF for _indcall dispatch patterns
 *   2. For each site: disassembles context (20 bytes before, 10 after)
 *   3. Finds containing functions (backward scan for PUSH IX / RET)
 *   4. Finds all callers of each containing function in the full ROM
 *   5. Shows the first 30 bytes of each containing function
 *
 * Usage:  node TI-84_Plus_CE/probe-phase316-event-cluster.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(v, w = 6) { return '0x' + v.toString(16).padStart(w, '0'); }

function hexBytes(start, len) {
  const bytes = [];
  const s = Math.max(0, start);
  const e = Math.min(rom.length, start + len);
  for (let i = s; i < e; i++) bytes.push(rom[i].toString(16).padStart(2, '0'));
  return bytes.join(' ');
}

function signed8(v) { return v >= 128 ? v - 256 : v; }

// Simple eZ80 ADL-mode disassembler — enough for context around dispatch sites
function disasm(pc) {
  if (pc < 0 || pc >= rom.length) return { text: '???', len: 1 };
  const b0 = rom[pc];

  // Prefixes
  if (b0 === 0xDD || b0 === 0xFD) {
    const prefix = b0 === 0xDD ? 'IX' : 'IY';
    if (pc + 1 >= rom.length) return { text: `db ${hex(b0, 2)}`, len: 1 };
    const b1 = rom[pc + 1];

    // PUSH IX/IY
    if (b1 === 0xE5) return { text: `PUSH ${prefix}`, len: 2 };
    // POP IX/IY
    if (b1 === 0xE1) return { text: `POP ${prefix}`, len: 2 };
    // LD IX/IY,imm24
    if (b1 === 0x21 && pc + 4 < rom.length) {
      const imm = rom[pc + 2] | (rom[pc + 3] << 8) | (rom[pc + 4] << 16);
      return { text: `LD ${prefix},${hex(imm)}`, len: 5 };
    }
    // LD IY,(IX+d) = FD 37 dd (ZDS II eZ80 extension)
    if (b0 === 0xFD && b1 === 0x37 && pc + 2 < rom.length) {
      const d = rom[pc + 2];
      const s = signed8(d);
      return { text: `LD IY,(IX${s >= 0 ? '+' : ''}${s})  [FD 37 ${d.toString(16).padStart(2, '0')}]`, len: 3 };
    }
    // JP (IY) = FD E9
    if (b0 === 0xFD && b1 === 0xE9) return { text: 'JP (IY)', len: 2 };
    // JP (IX) = DD E9
    if (b0 === 0xDD && b1 === 0xE9) return { text: 'JP (IX)', len: 2 };

    // LD IY,(addr) = FD 2A lo mi hi
    if (b0 === 0xFD && b1 === 0x2A && pc + 4 < rom.length) {
      const addr = rom[pc + 2] | (rom[pc + 3] << 8) | (rom[pc + 4] << 16);
      return { text: `LD IY,(${hex(addr)})`, len: 5 };
    }
    // LD IX,(addr) = DD 2A lo mi hi
    if (b0 === 0xDD && b1 === 0x2A && pc + 4 < rom.length) {
      const addr = rom[pc + 2] | (rom[pc + 3] << 8) | (rom[pc + 4] << 16);
      return { text: `LD IX,(${hex(addr)})`, len: 5 };
    }

    // LD r,(IX+d) — DD 46/4E/56/5E/66/6E/7E dd
    const regNames8 = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
    if (regNames8[b1] && pc + 2 < rom.length) {
      const d = rom[pc + 2];
      const s = signed8(d);
      return { text: `LD ${regNames8[b1]},(${prefix}${s >= 0 ? '+' : ''}${s})`, len: 3 };
    }
    // LD (IX+d),r — DD 70-77 dd
    if (b1 >= 0x70 && b1 <= 0x77 && b1 !== 0x76 && pc + 2 < rom.length) {
      const regTab = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const d = rom[pc + 2];
      const s = signed8(d);
      return { text: `LD (${prefix}${s >= 0 ? '+' : ''}${s}),${regTab[b1 & 7]}`, len: 3 };
    }
    // LD (IX+d),imm = DD 36 dd nn
    if (b1 === 0x36 && pc + 3 < rom.length) {
      const d = rom[pc + 2];
      const n = rom[pc + 3];
      const s = signed8(d);
      return { text: `LD (${prefix}${s >= 0 ? '+' : ''}${s}),${hex(n, 2)}`, len: 4 };
    }
    // ADD IX,rr — DD 09/19/29/39
    if (b1 === 0x09) return { text: `ADD ${prefix},BC`, len: 2 };
    if (b1 === 0x19) return { text: `ADD ${prefix},DE`, len: 2 };
    if (b1 === 0x29) return { text: `ADD ${prefix},${prefix}`, len: 2 };
    if (b1 === 0x39) return { text: `ADD ${prefix},SP`, len: 2 };

    // Fallthrough
    return { text: `db ${hex(b0, 2)} ${hex(b1, 2)}`, len: 2 };
  }

  // CALL addr24
  if (b0 === 0xCD && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `CALL ${hex(addr)}`, len: 4 };
  }
  // JP addr24
  if (b0 === 0xC3 && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `JP ${hex(addr)}`, len: 4 };
  }
  // JP cc,addr24
  const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  if ((b0 & 0xC7) === 0xC2 && pc + 3 < rom.length) {
    const cc = (b0 >> 3) & 7;
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `JP ${ccNames[cc]},${hex(addr)}`, len: 4 };
  }
  // CALL cc,addr24
  if ((b0 & 0xC7) === 0xC4 && pc + 3 < rom.length) {
    const cc = (b0 >> 3) & 7;
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `CALL ${ccNames[cc]},${hex(addr)}`, len: 4 };
  }
  // JR d
  if (b0 === 0x18 && pc + 1 < rom.length) {
    const d = signed8(rom[pc + 1]);
    const target = pc + 2 + d;
    return { text: `JR ${hex(target)}`, len: 2 };
  }
  // JR cc,d
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    if (pc + 1 < rom.length) {
      const cc = b0 === 0x20 ? 'NZ' : b0 === 0x28 ? 'Z' : b0 === 0x30 ? 'NC' : 'C';
      const d = signed8(rom[pc + 1]);
      const target = pc + 2 + d;
      return { text: `JR ${cc},${hex(target)}`, len: 2 };
    }
  }
  // RET
  if (b0 === 0xC9) return { text: 'RET', len: 1 };
  // RET cc
  if ((b0 & 0xC7) === 0xC0 && b0 !== 0xC1 && b0 !== 0xC9) {
    const cc = (b0 >> 3) & 7;
    return { text: `RET ${ccNames[cc]}`, len: 1 };
  }
  // LD r,r' / LD r,imm8
  const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
    return { text: `LD ${r8[(b0 >> 3) & 7]},${r8[b0 & 7]}`, len: 1 };
  }
  // LD r,imm8
  if ((b0 & 0xC7) === 0x06) {
    if (pc + 1 < rom.length) {
      const r = (b0 >> 3) & 7;
      return { text: `LD ${r8[r]},${hex(rom[pc + 1], 2)}`, len: 2 };
    }
  }
  // LD rr,imm24
  if (b0 === 0x01 && pc + 3 < rom.length) {
    const v = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD BC,${hex(v)}`, len: 4 };
  }
  if (b0 === 0x11 && pc + 3 < rom.length) {
    const v = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD DE,${hex(v)}`, len: 4 };
  }
  if (b0 === 0x21 && pc + 3 < rom.length) {
    const v = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD HL,${hex(v)}`, len: 4 };
  }
  if (b0 === 0x31 && pc + 3 < rom.length) {
    const v = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD SP,${hex(v)}`, len: 4 };
  }
  // PUSH/POP
  if (b0 === 0xC5) return { text: 'PUSH BC', len: 1 };
  if (b0 === 0xD5) return { text: 'PUSH DE', len: 1 };
  if (b0 === 0xE5) return { text: 'PUSH HL', len: 1 };
  if (b0 === 0xF5) return { text: 'PUSH AF', len: 1 };
  if (b0 === 0xC1) return { text: 'POP BC', len: 1 };
  if (b0 === 0xD1) return { text: 'POP DE', len: 1 };
  if (b0 === 0xE1) return { text: 'POP HL', len: 1 };
  if (b0 === 0xF1) return { text: 'POP AF', len: 1 };
  // NOP
  if (b0 === 0x00) return { text: 'NOP', len: 1 };
  // HALT
  if (b0 === 0x76) return { text: 'HALT', len: 1 };
  // DI/EI
  if (b0 === 0xF3) return { text: 'DI', len: 1 };
  if (b0 === 0xFB) return { text: 'EI', len: 1 };
  // CP imm
  if (b0 === 0xFE && pc + 1 < rom.length) return { text: `CP ${hex(rom[pc + 1], 2)}`, len: 2 };
  // OR/AND/XOR A,r
  if (b0 >= 0xB0 && b0 <= 0xB7) return { text: `OR ${r8[b0 & 7]}`, len: 1 };
  if (b0 >= 0xA0 && b0 <= 0xA7) return { text: `AND ${r8[b0 & 7]}`, len: 1 };
  if (b0 >= 0xA8 && b0 <= 0xAF) return { text: `XOR ${r8[b0 & 7]}`, len: 1 };
  // ADD/ADC/SUB/SBC A,r
  if (b0 >= 0x80 && b0 <= 0x87) return { text: `ADD A,${r8[b0 & 7]}`, len: 1 };
  if (b0 >= 0x88 && b0 <= 0x8F) return { text: `ADC A,${r8[b0 & 7]}`, len: 1 };
  if (b0 >= 0x90 && b0 <= 0x97) return { text: `SUB ${r8[b0 & 7]}`, len: 1 };
  if (b0 >= 0x98 && b0 <= 0x9F) return { text: `SBC A,${r8[b0 & 7]}`, len: 1 };
  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) return { text: `INC ${r8[(b0 >> 3) & 7]}`, len: 1 };
  if ((b0 & 0xC7) === 0x05) return { text: `DEC ${r8[(b0 >> 3) & 7]}`, len: 1 };
  // INC/DEC rr
  if (b0 === 0x03) return { text: 'INC BC', len: 1 };
  if (b0 === 0x13) return { text: 'INC DE', len: 1 };
  if (b0 === 0x23) return { text: 'INC HL', len: 1 };
  if (b0 === 0x33) return { text: 'INC SP', len: 1 };
  if (b0 === 0x0B) return { text: 'DEC BC', len: 1 };
  if (b0 === 0x1B) return { text: 'DEC DE', len: 1 };
  if (b0 === 0x2B) return { text: 'DEC HL', len: 1 };
  if (b0 === 0x3B) return { text: 'DEC SP', len: 1 };
  // LD A,(HL) / LD (HL),A etc already caught above
  // LD A,(addr)
  if (b0 === 0x3A && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD A,(${hex(addr)})`, len: 4 };
  }
  // LD (addr),A
  if (b0 === 0x32 && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD (${hex(addr)}),A`, len: 4 };
  }
  // LD HL,(addr)
  if (b0 === 0x2A && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD HL,(${hex(addr)})`, len: 4 };
  }
  // LD (addr),HL
  if (b0 === 0x22 && pc + 3 < rom.length) {
    const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    return { text: `LD (${hex(addr)}),HL`, len: 4 };
  }
  // DJNZ
  if (b0 === 0x10 && pc + 1 < rom.length) {
    const d = signed8(rom[pc + 1]);
    return { text: `DJNZ ${hex(pc + 2 + d)}`, len: 2 };
  }
  // RST
  if ((b0 & 0xC7) === 0xC7) {
    return { text: `RST ${hex(b0 & 0x38, 2)}`, len: 1 };
  }
  // ED prefix
  if (b0 === 0xED && pc + 1 < rom.length) {
    const b1 = rom[pc + 1];
    if (b1 === 0x45) return { text: 'RETN', len: 2 };
    if (b1 === 0x4D) return { text: 'RETI', len: 2 };
    if (b1 === 0xB0) return { text: 'LDIR', len: 2 };
    if (b1 === 0xB8) return { text: 'LDDR', len: 2 };
    if (b1 === 0xB1) return { text: 'CPIR', len: 2 };
    if (b1 === 0xB9) return { text: 'CPDR', len: 2 };
    // IN A,(C) / OUT (C),A
    if (b1 === 0x78) return { text: 'IN A,(C)', len: 2 };
    if (b1 === 0x79) return { text: 'OUT (C),A', len: 2 };
    return { text: `db ED ${hex(b1, 2)}`, len: 2 };
  }
  // CB prefix (bit ops)
  if (b0 === 0xCB && pc + 1 < rom.length) {
    const b1 = rom[pc + 1];
    const bit = (b1 >> 3) & 7;
    const r = b1 & 7;
    if ((b1 & 0xC0) === 0x40) return { text: `BIT ${bit},${r8[r]}`, len: 2 };
    if ((b1 & 0xC0) === 0xC0) return { text: `SET ${bit},${r8[r]}`, len: 2 };
    if ((b1 & 0xC0) === 0x80) return { text: `RES ${bit},${r8[r]}`, len: 2 };
    return { text: `db CB ${hex(b1, 2)}`, len: 2 };
  }
  // EX DE,HL
  if (b0 === 0xEB) return { text: 'EX DE,HL', len: 1 };
  // EX (SP),HL
  if (b0 === 0xE3) return { text: 'EX (SP),HL', len: 1 };
  // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
  if (b0 === 0x02) return { text: 'LD (BC),A', len: 1 };
  if (b0 === 0x12) return { text: 'LD (DE),A', len: 1 };
  if (b0 === 0x0A) return { text: 'LD A,(BC)', len: 1 };
  if (b0 === 0x1A) return { text: 'LD A,(DE)', len: 1 };
  // AND/OR/XOR/ADD/ADC/SUB/SBC imm
  if (b0 === 0xE6 && pc + 1 < rom.length) return { text: `AND ${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xF6 && pc + 1 < rom.length) return { text: `OR ${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xEE && pc + 1 < rom.length) return { text: `XOR ${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xC6 && pc + 1 < rom.length) return { text: `ADD A,${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xCE && pc + 1 < rom.length) return { text: `ADC A,${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xD6 && pc + 1 < rom.length) return { text: `SUB ${hex(rom[pc + 1], 2)}`, len: 2 };
  if (b0 === 0xDE && pc + 1 < rom.length) return { text: `SBC A,${hex(rom[pc + 1], 2)}`, len: 2 };
  // SCF/CCF
  if (b0 === 0x37) return { text: 'SCF', len: 1 };
  if (b0 === 0x3F) return { text: 'CCF', len: 1 };
  // CPL
  if (b0 === 0x2F) return { text: 'CPL', len: 1 };
  // SIS/LIS/SIL/LIL mode prefixes
  if (b0 === 0x40) return { text: '.SIS', len: 1 };
  if (b0 === 0x49) return { text: '.LIS', len: 1 };
  if (b0 === 0x52) return { text: '.SIL', len: 1 };
  if (b0 === 0x5B) return { text: '.LIL', len: 1 };

  return { text: `db ${hex(b0, 2)}`, len: 1 };
}

function disasmRange(start, endAddr) {
  const lines = [];
  let pc = start;
  while (pc < endAddr && pc < rom.length) {
    const { text, len } = disasm(pc);
    lines.push({ pc, text, len, bytes: hexBytes(pc, len) });
    pc += len;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 1. Scan 0x00F000-0x00FFFF for dispatch patterns
// ---------------------------------------------------------------------------

const REGION_START = 0x00F000;
const REGION_END = 0x010000;

console.log('================================================================');
console.log('  Phase 316: 0x00F000-0x00FFFF Event Dispatch Cluster Analysis');
console.log('================================================================');
console.log('');

// Pattern 1: FD 37 dd (LD IY,(IX+d)) near CALL 0x002288 (CD 88 22 00)
// Pattern 2: FD 37 dd near JP 0x002288 (C3 88 22 00)
// Pattern 3: FD E9 (JP (IY)) as alternative dispatch

const dispatchSites = [];

for (let i = REGION_START; i < REGION_END; i++) {
  // Check for CALL 0x002288
  if (rom[i] === 0xCD && rom[i + 1] === 0x88 && rom[i + 2] === 0x22 && rom[i + 3] === 0x00) {
    // Look backward up to 20 bytes for FD 37 dd
    let iyLoad = null;
    for (let j = i - 1; j >= Math.max(REGION_START, i - 20); j--) {
      if (rom[j] === 0xFD && rom[j + 1] === 0x37) {
        iyLoad = { pc: j, offset: rom[j + 2], signed: signed8(rom[j + 2]) };
        break;
      }
    }
    dispatchSites.push({
      dispatchPC: i,
      type: 'CALL 0x002288',
      iyLoad,
    });
  }
  // Check for JP 0x002288
  if (rom[i] === 0xC3 && rom[i + 1] === 0x88 && rom[i + 2] === 0x22 && rom[i + 3] === 0x00) {
    let iyLoad = null;
    for (let j = i - 1; j >= Math.max(REGION_START, i - 20); j--) {
      if (rom[j] === 0xFD && rom[j + 1] === 0x37) {
        iyLoad = { pc: j, offset: rom[j + 2], signed: signed8(rom[j + 2]) };
        break;
      }
    }
    dispatchSites.push({
      dispatchPC: i,
      type: 'JP 0x002288',
      iyLoad,
    });
  }
  // Check for JP (IY) = FD E9
  if (rom[i] === 0xFD && rom[i + 1] === 0xE9) {
    // Look backward for FD 37
    let iyLoad = null;
    for (let j = i - 1; j >= Math.max(REGION_START, i - 20); j--) {
      if (rom[j] === 0xFD && rom[j + 1] === 0x37) {
        iyLoad = { pc: j, offset: rom[j + 2], signed: signed8(rom[j + 2]) };
        break;
      }
    }
    dispatchSites.push({
      dispatchPC: i,
      type: 'JP (IY)',
      iyLoad,
    });
  }
}

// Also scan for CALL 0x00015C (_indcall direct) in this region
for (let i = REGION_START; i < REGION_END; i++) {
  if (rom[i] === 0xCD && rom[i + 1] === 0x5C && rom[i + 2] === 0x01 && rom[i + 3] === 0x00) {
    let iyLoad = null;
    for (let j = i - 1; j >= Math.max(REGION_START, i - 20); j--) {
      if (rom[j] === 0xFD && rom[j + 1] === 0x37) {
        iyLoad = { pc: j, offset: rom[j + 2], signed: signed8(rom[j + 2]) };
        break;
      }
    }
    dispatchSites.push({
      dispatchPC: i,
      type: 'CALL 0x00015C',
      iyLoad,
    });
  }
}

// Also scan for slot-based dispatches (FD 2A xx xx xx then CALL/JP)
for (let i = REGION_START; i < REGION_END; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0x2A) {
    const addr = rom[i + 2] | (rom[i + 3] << 8) | (rom[i + 4] << 16);
    // Check if followed within 10 bytes by dispatch
    for (let j = i + 5; j < Math.min(REGION_END, i + 15); j++) {
      if ((rom[j] === 0xCD || rom[j] === 0xC3) &&
          rom[j + 1] === 0x88 && rom[j + 2] === 0x22 && rom[j + 3] === 0x00) {
        dispatchSites.push({
          dispatchPC: j,
          type: `${rom[j] === 0xCD ? 'CALL' : 'JP'} 0x002288 (slot)`,
          iyLoad: null,
          slotAddr: addr,
        });
        break;
      }
      if (rom[j] === 0xFD && rom[j + 1] === 0xE9) {
        dispatchSites.push({
          dispatchPC: j,
          type: 'JP (IY) (slot)',
          iyLoad: null,
          slotAddr: addr,
        });
        break;
      }
    }
  }
}

// Deduplicate by dispatchPC
const seen = new Set();
const uniqueSites = [];
for (const site of dispatchSites) {
  if (!seen.has(site.dispatchPC)) {
    seen.add(site.dispatchPC);
    uniqueSites.push(site);
  }
}
uniqueSites.sort((a, b) => a.dispatchPC - b.dispatchPC);

console.log(`Found ${uniqueSites.length} dispatch sites in 0x00F000-0x00FFFF:`);
console.log('');

// ---------------------------------------------------------------------------
// 2. For each site: disassemble context
// ---------------------------------------------------------------------------

for (const site of uniqueSites) {
  const dp = site.dispatchPC;
  console.log(`--- Dispatch Site at ${hex(dp)} [${site.type}] ---`);
  if (site.iyLoad) {
    console.log(`  IY loaded at ${hex(site.iyLoad.pc)}: LD IY,(IX${site.iyLoad.signed >= 0 ? '+' : ''}${site.iyLoad.signed})`);
  } else if (site.slotAddr !== undefined) {
    console.log(`  IY loaded from RAM slot ${hex(site.slotAddr)}`);
  } else {
    console.log(`  No IY load found within 20 bytes`);
  }
  console.log('');

  // Disassemble 20 bytes before
  const contextStart = Math.max(0, dp - 20);
  const contextEnd = dp + 10;
  console.log(`  Context (${hex(contextStart)} to ${hex(contextEnd)}):`);
  console.log(`  Raw: ${hexBytes(contextStart, contextEnd - contextStart)}`);
  console.log('');

  const disLines = disasmRange(contextStart, contextEnd);
  for (const line of disLines) {
    const marker = line.pc === dp ? ' >>>' : (site.iyLoad && line.pc === site.iyLoad.pc ? ' <<<' : '    ');
    console.log(`  ${marker} ${hex(line.pc)}: ${line.bytes.padEnd(18)} ${line.text}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 3. Find containing functions
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Containing Function Analysis');
console.log('================================================================');
console.log('');

function findContainingFunction(pc) {
  // Search backward for PUSH IX (DD E5) or RET (C9) / RETN / RETI
  for (let j = pc - 1; j >= Math.max(0, pc - 500); j--) {
    // PUSH IX = DD E5 — function prologue
    if (rom[j] === 0xDD && rom[j + 1] === 0xE5) {
      return { addr: j, pattern: 'PUSH IX' };
    }
    // RET = C9 — function boundary (start is next byte)
    if (rom[j] === 0xC9) {
      return { addr: j + 1, pattern: `after RET@${hex(j)}` };
    }
    // RETN = ED 45
    if (rom[j] === 0xED && rom[j + 1] === 0x45) {
      return { addr: j + 2, pattern: `after RETN@${hex(j)}` };
    }
    // RETI = ED 4D
    if (rom[j] === 0xED && rom[j + 1] === 0x4D) {
      return { addr: j + 2, pattern: `after RETI@${hex(j)}` };
    }
  }
  return null;
}

// Group sites by containing function
const funcMap = new Map();

for (const site of uniqueSites) {
  const func = findContainingFunction(site.dispatchPC);
  site.func = func;
  const key = func ? func.addr : -1;
  if (!funcMap.has(key)) funcMap.set(key, { func, sites: [] });
  funcMap.get(key).sites.push(site);
}

const sortedFuncs = [...funcMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [funcAddr, { func, sites }] of sortedFuncs) {
  const funcStr = func ? `${hex(func.addr)} [${func.pattern}]` : 'unknown';
  console.log(`Function at ${funcStr} — ${sites.length} dispatch site(s):`);

  for (const s of sites) {
    const iyInfo = s.iyLoad
      ? `IX${s.iyLoad.signed >= 0 ? '+' : ''}${s.iyLoad.signed}`
      : s.slotAddr !== undefined ? `slot ${hex(s.slotAddr)}` : 'no IY load';
    console.log(`  ${hex(s.dispatchPC)} ${s.type}  [${iyInfo}]`);
  }

  // Show first 30 bytes of function
  if (func) {
    console.log(`  First 30 bytes: ${hexBytes(func.addr, 30)}`);
    console.log('  Disassembly:');
    const funcDisasm = disasmRange(func.addr, func.addr + 30);
    for (const line of funcDisasm) {
      console.log(`    ${hex(line.pc)}: ${line.bytes.padEnd(18)} ${line.text}`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 4. Find all callers of each containing function in the full ROM
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Caller Analysis (full ROM scan)');
console.log('================================================================');
console.log('');

function findCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mi = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const callers = [];

  for (let i = 0; i < rom.length - 3; i++) {
    // CALL addr
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      callers.push({ pc: i, type: 'CALL' });
    }
    // JP addr
    if (rom[i] === 0xC3 && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      callers.push({ pc: i, type: 'JP' });
    }
    // Conditional CALL/JP
    if ((rom[i] & 0xC7) === 0xC4 && rom[i] !== 0xCD) {
      if (rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
        const cc = (rom[i] >> 3) & 7;
        const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
        callers.push({ pc: i, type: `CALL ${ccNames[cc]}` });
      }
    }
    if ((rom[i] & 0xC7) === 0xC2 && rom[i] !== 0xC3) {
      if (rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
        const cc = (rom[i] >> 3) & 7;
        const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
        callers.push({ pc: i, type: `JP ${ccNames[cc]}` });
      }
    }
  }
  return callers;
}

// Get unique function addresses
const uniqueFuncAddrs = new Set();
for (const [funcAddr] of sortedFuncs) {
  if (funcAddr >= 0) uniqueFuncAddrs.add(funcAddr);
}

const callerResults = new Map();
for (const addr of uniqueFuncAddrs) {
  const callers = findCallers(addr);
  callerResults.set(addr, callers);
}

for (const [funcAddr, callers] of [...callerResults.entries()].sort((a, b) => a - b)) {
  console.log(`Function ${hex(funcAddr)} — ${callers.length} caller(s):`);
  if (callers.length === 0) {
    console.log('  (no direct CALL/JP references — may be vector-dispatched or inlined)');
  } else {
    // Show first 20 callers with context
    const showCount = Math.min(callers.length, 20);
    for (let i = 0; i < showCount; i++) {
      const c = callers[i];
      // Find what function the caller is in
      const callerFunc = findContainingFunction(c.pc);
      const callerFuncStr = callerFunc ? `in func@${hex(callerFunc.addr)}` : '';
      console.log(`  ${hex(c.pc)} ${c.type}  ${callerFuncStr}`);
    }
    if (callers.length > 20) {
      console.log(`  ... and ${callers.length - 20} more`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 5. Cross-reference with known OS entry points and event loop
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Cross-Reference with Known OS Structures');
console.log('================================================================');
console.log('');

// Check if any of these functions appear in the 128-entry OS jump table at 0x000200
console.log('--- OS Jump Table (0x000200) References ---');
for (let entry = 0; entry < 128; entry++) {
  const base = 0x000200 + entry * 4;
  // JP addr (C3 lo mi hi)
  if (rom[base] === 0xC3) {
    const target = rom[base + 1] | (rom[base + 2] << 8) | (rom[base + 3] << 16);
    if (target >= REGION_START && target < REGION_END) {
      console.log(`  Vector entry ${entry} (${hex(base)}): JP ${hex(target)}`);
    }
    // Also check if target matches any containing function
    if (uniqueFuncAddrs.has(target)) {
      console.log(`  Vector entry ${entry} (${hex(base)}): JP ${hex(target)} *** MATCH ***`);
    }
  }
}
console.log('');

// Check if any functions in this range call known OS services
console.log('--- Known OS Service Calls from 0x00F000-0x00FFFF ---');
const knownServices = [
  { addr: 0x00015C, name: '_indcall' },
  { addr: 0x002288, name: '_indcall trampoline' },
  { addr: 0x000578, name: 'CheckIfEmulated' },
  { addr: 0x03FA09, name: '_GetCSC (SDK)' },
  { addr: 0x080259, name: '_GetCSC (ISR)' },
  { addr: 0x001401, name: 'ISR handler' },
  { addr: 0x068D5D, name: 'main event loop body' },
  { addr: 0x058AC9, name: 'BufInsert gate' },
  { addr: 0x05877A, name: 'CoorMon CP chain' },
];

for (const svc of knownServices) {
  const lo = svc.addr & 0xFF;
  const mi = (svc.addr >> 8) & 0xFF;
  const hi = (svc.addr >> 16) & 0xFF;
  const refs = [];
  for (let i = REGION_START; i < REGION_END - 3; i++) {
    if ((rom[i] === 0xCD || rom[i] === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      refs.push(i);
    }
  }
  if (refs.length > 0) {
    console.log(`  ${svc.name} (${hex(svc.addr)}): ${refs.length} ref(s) at ${refs.map(r => hex(r)).join(', ')}`);
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 6. Scan for all CALL/JP targets FROM this region (outgoing calls)
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Outgoing Calls from 0x00F000-0x00FFFF');
console.log('================================================================');
console.log('');

const outgoing = new Map(); // target -> [{pc, type}]
for (let i = REGION_START; i < REGION_END - 3; i++) {
  if (rom[i] === 0xCD) {
    const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (!outgoing.has(target)) outgoing.set(target, []);
    outgoing.get(target).push({ pc: i, type: 'CALL' });
  }
  if (rom[i] === 0xC3) {
    const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (target !== 0x002288 && target < 0x400000) { // skip _indcall trampoline and non-ROM
      if (!outgoing.has(target)) outgoing.set(target, []);
      outgoing.get(target).push({ pc: i, type: 'JP' });
    }
  }
}

// Sort by frequency
const outSorted = [...outgoing.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`Unique outgoing targets: ${outSorted.length}`);
console.log('');
console.log('Top 30 most-called targets:');
for (let i = 0; i < Math.min(30, outSorted.length); i++) {
  const [target, refs] = outSorted[i];
  const types = refs.map(r => `${r.type}@${hex(r.pc)}`);
  console.log(`  ${hex(target)}: ${refs.length} ref(s)  [${types.slice(0, 5).join(', ')}${types.length > 5 ? '...' : ''}]`);
}
console.log('');

// ---------------------------------------------------------------------------
// 7. IX offset analysis
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  IX Offset Pattern Analysis');
console.log('================================================================');
console.log('');

const offsetMap = new Map(); // offset -> [site]
for (const site of uniqueSites) {
  if (site.iyLoad) {
    const off = site.iyLoad.signed;
    if (!offsetMap.has(off)) offsetMap.set(off, []);
    offsetMap.get(off).push(site);
  }
}

for (const [off, sites] of [...offsetMap.entries()].sort((a, b) => a - b)) {
  console.log(`  IX offset ${off >= 0 ? '+' : ''}${off} (0x${(off & 0xFF).toString(16).padStart(2, '0')}): ${sites.length} site(s)`);
  for (const s of sites) {
    console.log(`    ${hex(s.dispatchPC)} ${s.type}`);
  }
}
if (offsetMap.size === 0) {
  console.log('  (no frame-based IY loads found — all may be slot-based)');
}
console.log('');

// ---------------------------------------------------------------------------
// 8. Incoming calls TO this region (who calls functions here?)
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Incoming Calls TO 0x00F000-0x00FFFF (full ROM scan)');
console.log('================================================================');
console.log('');

const incomingMap = new Map(); // target in region -> [{pc, type}]
for (let i = 0; i < rom.length - 3; i++) {
  if (i >= REGION_START && i < REGION_END) continue; // skip self-refs
  let target = null;
  let type = null;
  if (rom[i] === 0xCD) {
    target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    type = 'CALL';
  } else if (rom[i] === 0xC3) {
    target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    type = 'JP';
  }
  if (target !== null && target >= REGION_START && target < REGION_END) {
    if (!incomingMap.has(target)) incomingMap.set(target, []);
    incomingMap.get(target).push({ pc: i, type });
  }
}

const inSorted = [...incomingMap.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`Unique incoming targets in 0x00F000-0x00FFFF: ${inSorted.length}`);
console.log('');
console.log('All incoming targets (sorted by frequency):');
for (const [target, refs] of inSorted) {
  const callerLocs = refs.slice(0, 8).map(r => `${r.type}@${hex(r.pc)}`).join(', ');
  const extra = refs.length > 8 ? ` +${refs.length - 8} more` : '';
  console.log(`  ${hex(target)}: ${refs.length} ref(s)  [${callerLocs}${extra}]`);
}
console.log('');

// ---------------------------------------------------------------------------
// 9. Structure determination: one system or multiple?
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  Structure Determination');
console.log('================================================================');
console.log('');

// Check if functions in this range call each other (interconnected?)
console.log('--- Intra-region cross-calls ---');
const intraRegionCalls = [];
for (let i = REGION_START; i < REGION_END - 3; i++) {
  if (rom[i] === 0xCD) {
    const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (target >= REGION_START && target < REGION_END && target !== i) {
      intraRegionCalls.push({ from: i, to: target });
    }
  }
  if (rom[i] === 0xC3) {
    const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (target >= REGION_START && target < REGION_END && target !== i) {
      intraRegionCalls.push({ from: i, to: target });
    }
  }
}

if (intraRegionCalls.length === 0) {
  console.log('  No intra-region CALL/JP found — functions are INDEPENDENT');
} else {
  console.log(`  ${intraRegionCalls.length} intra-region cross-references found:`);
  for (const ref of intraRegionCalls) {
    const fromFunc = findContainingFunction(ref.from);
    const fromStr = fromFunc ? hex(fromFunc.addr) : '?';
    console.log(`    ${hex(ref.from)} (func ${fromStr}) -> ${hex(ref.to)}`);
  }
}
console.log('');

// Check if dispatch sites share IX offsets (same struct type?)
console.log('--- Shared struct patterns ---');
if (offsetMap.size > 0) {
  const sharedOffsets = [...offsetMap.entries()].filter(([, sites]) => sites.length > 1);
  if (sharedOffsets.length > 0) {
    console.log(`  ${sharedOffsets.length} IX offset(s) used by multiple sites — likely same struct type:`);
    for (const [off, sites] of sharedOffsets) {
      console.log(`    IX${off >= 0 ? '+' : ''}${off}: ${sites.length} sites in functions: ${[...new Set(sites.map(s => s.func ? hex(s.func.addr) : '?'))].join(', ')}`);
    }
  } else {
    console.log('  All IX offsets are unique — may be different struct types');
  }
} else {
  console.log('  No frame-based offsets to compare');
}
console.log('');

// ---------------------------------------------------------------------------
// 10. Summary
// ---------------------------------------------------------------------------

console.log('================================================================');
console.log('  SUMMARY');
console.log('================================================================');
console.log('');
console.log(`Total dispatch sites in 0x00F000-0x00FFFF: ${uniqueSites.length}`);
console.log(`  Frame-based (FD 37): ${uniqueSites.filter(s => s.iyLoad).length}`);
console.log(`  Slot-based (FD 2A): ${uniqueSites.filter(s => s.slotAddr !== undefined).length}`);
console.log(`  Other/unknown IY source: ${uniqueSites.filter(s => !s.iyLoad && s.slotAddr === undefined).length}`);
console.log('');

const funcCount = [...funcMap.keys()].filter(k => k >= 0).length;
console.log(`Containing functions: ${funcCount}`);
for (const [funcAddr, { sites }] of sortedFuncs) {
  if (funcAddr >= 0) {
    const callers = callerResults.get(funcAddr) || [];
    console.log(`  ${hex(funcAddr)}: ${sites.length} dispatch site(s), ${callers.length} caller(s)`);
  }
}
console.log('');
console.log(`Intra-region cross-calls: ${intraRegionCalls.length}`);
console.log(`Unique IX offsets: ${[...offsetMap.keys()].map(o => `${o >= 0 ? '+' : ''}${o}`).join(', ') || 'none'}`);
console.log('');
console.log('Done.');
