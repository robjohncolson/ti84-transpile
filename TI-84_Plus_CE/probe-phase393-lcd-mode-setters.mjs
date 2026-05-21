#!/usr/bin/env node

/**
 * Phase 393 - Trace the LCD mode setter functions
 *
 * 0xD000C6 bit 2 is the system-wide LCD color depth flag:
 *   bit 2 = 0 -> 16bpp
 *   bit 2 = 1 -> 8bpp
 *
 * Only two ROM sites modify bit 2:
 *   SET 2,(IY+0x46) at 0x05527B  -> switches to 8bpp
 *   RES 2,(IY+0x46) at 0x05522C  -> switches to 16bpp
 *
 * IY base = 0xD00080, so IY+0x46 = 0xD000C6.
 *
 * This probe:
 *   1. Verifies the actual bytes at those addresses.
 *   2. Finds containing function(s) by scanning for RET boundaries.
 *   3. Disassembles the full function(s).
 *   4. Checks whether 0x0551A4 (SET/RES 1 from session 392) is nearby.
 *   5. Scans ROM for CALL/JP callers of the entry point(s).
 *   6. Checks for LCD hardware port writes (0xE000-0xE0FF range).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, "ROM.rom");

const rom = fs.readFileSync(ROM_PATH);

// --- Target addresses ---
const SET2_ADDR = 0x05527B;
const RES2_ADDR = 0x05522C;
const SET_RES_1_ADDR = 0x0551A4;
const IY_BASE = 0xD00080;
const IY_OFFSET_C6 = 0x46; // IY+0x46 = 0xD000C6

// Wider scan window
const SCAN_START = 0x055100;
const SCAN_END = 0x0553FF;

// LCD hardware port range
const LCD_PORT_START = 0xE00000;
const LCD_PORT_END = 0xE000FF;

// --- Helpers ---

const R8 = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
const RR = ["BC", "DE", "HL", "SP"];

const CONTROL_OPS = new Map([
  [0xCD, "CALL"],
  [0xC4, "CALL NZ"],
  [0xCC, "CALL Z"],
  [0xD4, "CALL NC"],
  [0xDC, "CALL C"],
  [0xE4, "CALL PO"],
  [0xEC, "CALL PE"],
  [0xF4, "CALL P"],
  [0xFC, "CALL M"],
  [0xC3, "JP"],
  [0xC2, "JP NZ"],
  [0xCA, "JP Z"],
  [0xD2, "JP NC"],
  [0xDA, "JP C"],
  [0xE2, "JP PO"],
  [0xEA, "JP PE"],
  [0xF2, "JP P"],
  [0xFA, "JP M"],
]);

const RET_NAMES = new Map([
  [0xC0, "RET NZ"],
  [0xC8, "RET Z"],
  [0xD0, "RET NC"],
  [0xD8, "RET C"],
  [0xE0, "RET PO"],
  [0xE8, "RET PE"],
  [0xF0, "RET P"],
  [0xF8, "RET M"],
  [0xC9, "RET"],
]);

const JR_NAMES = new Map([
  [0x18, "JR"],
  [0x20, "JR NZ"],
  [0x28, "JR Z"],
  [0x30, "JR NC"],
  [0x38, "JR C"],
]);

const JP_CONDS = new Map([
  [0xC2, "NZ"],
  [0xCA, "Z"],
  [0xD2, "NC"],
  [0xDA, "C"],
  [0xE2, "PO"],
  [0xEA, "PE"],
  [0xF2, "P"],
  [0xFA, "M"],
]);

const CALL_CONDS = new Map([
  [0xC4, "NZ"],
  [0xCC, "Z"],
  [0xD4, "NC"],
  [0xDC, "C"],
  [0xE4, "PO"],
  [0xEC, "PE"],
  [0xF4, "P"],
  [0xFC, "M"],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, "0")}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, "0"),
  ).join(" ");
}

function read24(offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function read16(offset) {
  return ((rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8)) >>> 0;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatDisp(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${hexByte(Math.abs(value))}`;
}

function formatIndexed(indexReg, disp) {
  return `(${indexReg}${formatDisp(disp)})`;
}

function rawInstruction(pc, len, label = "RAW") {
  return {
    pc,
    len,
    nextPc: pc + len,
    text: `${label} ${bytesHex(pc, len)}`,
  };
}

function decodeCbOp(opcode, operandText = null) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 0x07;
  const reg = R8[opcode & 0x07];
  const operand = operandText ?? reg;

  if (group === 0) {
    const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
    return `${ops[bit]} ${operand}`;
  }
  if (group === 1) return `BIT ${bit}, ${operand}`;
  if (group === 2) return `RES ${bit}, ${operand}`;
  if (group === 3) return `SET ${bit}, ${operand}`;
  return null;
}

function decodeIndexed(pc, indexReg) {
  const opcode = rom[pc + 1];

  if (opcode === 0xCB) {
    const disp = signed8(rom[pc + 2]);
    const cb = rom[pc + 3];
    const text = decodeCbOp(cb, formatIndexed(indexReg, disp));
    return text ? { pc, len: 4, nextPc: pc + 4, text } : rawInstruction(pc, 4);
  }

  if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].includes(opcode)) {
    const disp = signed8(rom[pc + 2]);
    const reg = ["B", "C", "D", "E", "H", "L", "A"][
      [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].indexOf(opcode)
    ];
    return {
      pc,
      len: 3,
      nextPc: pc + 3,
      text: `LD ${reg}, ${formatIndexed(indexReg, disp)}`,
    };
  }

  if (opcode >= 0x70 && opcode <= 0x77) {
    const disp = signed8(rom[pc + 2]);
    const reg = R8[opcode & 0x07];
    return {
      pc,
      len: 3,
      nextPc: pc + 3,
      text: `LD ${formatIndexed(indexReg, disp)}, ${reg}`,
    };
  }

  if (opcode === 0x36) {
    const disp = signed8(rom[pc + 2]);
    const value = rom[pc + 3];
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      text: `LD ${formatIndexed(indexReg, disp)}, ${hexByte(value)}`,
    };
  }

  if (opcode === 0x21) {
    return {
      pc,
      len: 5,
      nextPc: pc + 5,
      text: `LD ${indexReg}, ${hex(read24(pc + 2))}`,
    };
  }

  if (opcode === 0x23) {
    return { pc, len: 2, nextPc: pc + 2, text: `INC ${indexReg}` };
  }

  if (opcode === 0x2B) {
    return { pc, len: 2, nextPc: pc + 2, text: `DEC ${indexReg}` };
  }

  if (opcode === 0xE1) {
    return { pc, len: 2, nextPc: pc + 2, text: `POP ${indexReg}` };
  }

  if (opcode === 0xE5) {
    return { pc, len: 2, nextPc: pc + 2, text: `PUSH ${indexReg}` };
  }

  if (opcode === 0xE9) {
    return { pc, len: 2, nextPc: pc + 2, text: `JP (${indexReg})` };
  }

  if (opcode === 0xF9) {
    return { pc, len: 2, nextPc: pc + 2, text: `LD SP, ${indexReg}` };
  }

  if (opcode === 0x09) return { pc, len: 2, nextPc: pc + 2, text: `ADD ${indexReg}, BC` };
  if (opcode === 0x19) return { pc, len: 2, nextPc: pc + 2, text: `ADD ${indexReg}, DE` };
  if (opcode === 0x29) return { pc, len: 2, nextPc: pc + 2, text: `ADD ${indexReg}, ${indexReg}` };
  if (opcode === 0x39) return { pc, len: 2, nextPc: pc + 2, text: `ADD ${indexReg}, SP` };

  return rawInstruction(pc, 2);
}

function decodeEdOp(pc) {
  const sub = rom[pc + 1];

  if (sub === 0x4D) return { pc, len: 2, nextPc: pc + 2, text: "RETI" };
  if (sub === 0x45) return { pc, len: 2, nextPc: pc + 2, text: "RETN" };

  // LD rr,(nn)
  if ((sub & 0xCF) === 0x4B) {
    const reg = RR[(sub >> 4) & 0x03];
    const addr = read24(pc + 2);
    return { pc, len: 5, nextPc: pc + 5, text: `LD ${reg}, (${hex(addr)})` };
  }

  // LD (nn),rr
  if ((sub & 0xCF) === 0x43) {
    const reg = RR[(sub >> 4) & 0x03];
    const addr = read24(pc + 2);
    return { pc, len: 5, nextPc: pc + 5, text: `LD (${hex(addr)}), ${reg}` };
  }

  // IN r,(C) / OUT (C),r
  if ((sub & 0xC7) === 0x40) {
    const reg = R8[(sub >> 3) & 0x07];
    return { pc, len: 2, nextPc: pc + 2, text: `IN ${reg}, (C)` };
  }
  if ((sub & 0xC7) === 0x41) {
    const reg = R8[(sub >> 3) & 0x07];
    return { pc, len: 2, nextPc: pc + 2, text: `OUT (C), ${reg}` };
  }

  // Block operations
  if (sub === 0xA0) return { pc, len: 2, nextPc: pc + 2, text: "LDI" };
  if (sub === 0xA8) return { pc, len: 2, nextPc: pc + 2, text: "LDD" };
  if (sub === 0xB0) return { pc, len: 2, nextPc: pc + 2, text: "LDIR" };
  if (sub === 0xB8) return { pc, len: 2, nextPc: pc + 2, text: "LDDR" };
  if (sub === 0xA1) return { pc, len: 2, nextPc: pc + 2, text: "CPI" };
  if (sub === 0xA9) return { pc, len: 2, nextPc: pc + 2, text: "CPD" };
  if (sub === 0xB1) return { pc, len: 2, nextPc: pc + 2, text: "CPIR" };
  if (sub === 0xB9) return { pc, len: 2, nextPc: pc + 2, text: "CPDR" };

  // IN0 / OUT0 (eZ80)
  if (sub === 0x38) {
    const port = rom[pc + 2];
    return { pc, len: 3, nextPc: pc + 3, text: `IN0 A, (${hexByte(port)})` };
  }
  if (sub === 0x39) {
    const port = rom[pc + 2];
    return { pc, len: 3, nextPc: pc + 3, text: `OUT0 (${hexByte(port)}), A` };
  }

  return rawInstruction(pc, 2, "ED");
}

function decodeInstruction(pc) {
  const opcode = rom[pc];

  if (opcode === 0xDD) return decodeIndexed(pc, "IX");
  if (opcode === 0xFD) return decodeIndexed(pc, "IY");

  if (opcode === 0xED) return decodeEdOp(pc);

  if (opcode === 0xCB) {
    const text = decodeCbOp(rom[pc + 1]);
    return text ? { pc, len: 2, nextPc: pc + 2, text } : rawInstruction(pc, 2);
  }

  if (RET_NAMES.has(opcode)) {
    return { pc, len: 1, nextPc: pc + 1, text: RET_NAMES.get(opcode) };
  }

  if (JR_NAMES.has(opcode)) {
    const target = (pc + 2 + signed8(rom[pc + 1])) & 0xFFFFFF;
    return {
      pc,
      len: 2,
      nextPc: pc + 2,
      target,
      text: `${JR_NAMES.get(opcode)} ${hex(target)}`,
    };
  }

  if (opcode === 0xC3) {
    const target = read24(pc + 1);
    return { pc, len: 4, nextPc: pc + 4, target, text: `JP ${hex(target)}` };
  }

  if (JP_CONDS.has(opcode)) {
    const target = read24(pc + 1);
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      target,
      text: `JP ${JP_CONDS.get(opcode)}, ${hex(target)}`,
    };
  }

  if (opcode === 0xCD) {
    const target = read24(pc + 1);
    return { pc, len: 4, nextPc: pc + 4, target, text: `CALL ${hex(target)}` };
  }

  if (CALL_CONDS.has(opcode)) {
    const target = read24(pc + 1);
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      target,
      text: `CALL ${CALL_CONDS.get(opcode)}, ${hex(target)}`,
    };
  }

  if ([0x01, 0x11, 0x21, 0x31].includes(opcode)) {
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      text: `LD ${RR[(opcode >> 4) & 0x03]}, ${hex(read24(pc + 1))}`,
    };
  }

  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x3E].includes(opcode)) {
    const reg = {
      0x06: "B", 0x0E: "C", 0x16: "D", 0x1E: "E",
      0x26: "H", 0x2E: "L", 0x3E: "A",
    }[opcode];
    return {
      pc,
      len: 2,
      nextPc: pc + 2,
      text: `LD ${reg}, ${hexByte(rom[pc + 1])}`,
    };
  }

  if (opcode === 0x32) {
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      text: `LD (${hex(read24(pc + 1))}), A`,
    };
  }

  if (opcode === 0x3A) {
    return {
      pc,
      len: 4,
      nextPc: pc + 4,
      text: `LD A, (${hex(read24(pc + 1))})`,
    };
  }

  if (opcode >= 0x40 && opcode <= 0x7F && opcode !== 0x76) {
    const dest = R8[(opcode >> 3) & 0x07];
    const src = R8[opcode & 0x07];
    return { pc, len: 1, nextPc: pc + 1, text: `LD ${dest}, ${src}` };
  }

  if (opcode === 0x76) {
    return { pc, len: 1, nextPc: pc + 1, text: "HALT" };
  }

  if (opcode === 0x02) return { pc, len: 1, nextPc: pc + 1, text: "LD (BC), A" };
  if (opcode === 0x0A) return { pc, len: 1, nextPc: pc + 1, text: "LD A, (BC)" };
  if (opcode === 0x12) return { pc, len: 1, nextPc: pc + 1, text: "LD (DE), A" };
  if (opcode === 0x1A) return { pc, len: 1, nextPc: pc + 1, text: "LD A, (DE)" };

  if ([0x03, 0x13, 0x23, 0x33].includes(opcode)) {
    return { pc, len: 1, nextPc: pc + 1, text: `INC ${RR[(opcode >> 4) & 0x03]}` };
  }

  if ([0x0B, 0x1B, 0x2B, 0x3B].includes(opcode)) {
    return { pc, len: 1, nextPc: pc + 1, text: `DEC ${RR[(opcode >> 4) & 0x03]}` };
  }

  if ([0x09, 0x19, 0x29, 0x39].includes(opcode)) {
    return { pc, len: 1, nextPc: pc + 1, text: `ADD HL, ${RR[(opcode >> 4) & 0x03]}` };
  }

  if ([0x04, 0x0C, 0x14, 0x1C, 0x24, 0x2C, 0x3C].includes(opcode)) {
    const reg = {
      0x04: "B", 0x0C: "C", 0x14: "D", 0x1C: "E",
      0x24: "H", 0x2C: "L", 0x3C: "A",
    }[opcode];
    return { pc, len: 1, nextPc: pc + 1, text: `INC ${reg}` };
  }

  if ([0x05, 0x0D, 0x15, 0x1D, 0x25, 0x2D, 0x3D].includes(opcode)) {
    const reg = {
      0x05: "B", 0x0D: "C", 0x15: "D", 0x1D: "E",
      0x25: "H", 0x2D: "L", 0x3D: "A",
    }[opcode];
    return { pc, len: 1, nextPc: pc + 1, text: `DEC ${reg}` };
  }

  if (opcode === 0xAF) return { pc, len: 1, nextPc: pc + 1, text: "XOR A" };
  if (opcode === 0xA7) return { pc, len: 1, nextPc: pc + 1, text: "AND A" };
  if (opcode === 0xB7) return { pc, len: 1, nextPc: pc + 1, text: "OR A" };

  if (opcode === 0xC6) {
    return { pc, len: 2, nextPc: pc + 2, text: `ADD A, ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xCE) {
    return { pc, len: 2, nextPc: pc + 2, text: `ADC A, ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xD6) {
    return { pc, len: 2, nextPc: pc + 2, text: `SUB ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xDE) {
    return { pc, len: 2, nextPc: pc + 2, text: `SBC A, ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xE6) {
    return { pc, len: 2, nextPc: pc + 2, text: `AND ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xEE) {
    return { pc, len: 2, nextPc: pc + 2, text: `XOR ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xF6) {
    return { pc, len: 2, nextPc: pc + 2, text: `OR ${hexByte(rom[pc + 1])}` };
  }
  if (opcode === 0xFE) {
    return { pc, len: 2, nextPc: pc + 2, text: `CP ${hexByte(rom[pc + 1])}` };
  }

  if (opcode >= 0x80 && opcode <= 0xBF) {
    const group = (opcode >> 3) & 0x07;
    const src = R8[opcode & 0x07];
    const names = ["ADD A,", "ADC A,", "SUB", "SBC A,", "AND", "XOR", "OR", "CP"];
    return { pc, len: 1, nextPc: pc + 1, text: `${names[group]} ${src}` };
  }

  // PUSH/POP
  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(opcode)) {
    const reg = ["BC", "DE", "HL", "AF"][(opcode >> 4) & 0x03];
    return { pc, len: 1, nextPc: pc + 1, text: `PUSH ${reg}` };
  }
  if ([0xC1, 0xD1, 0xE1, 0xF1].includes(opcode)) {
    const reg = ["BC", "DE", "HL", "AF"][(opcode >> 4) & 0x03];
    return { pc, len: 1, nextPc: pc + 1, text: `POP ${reg}` };
  }

  // RST
  if ((opcode & 0xC7) === 0xC7) {
    return { pc, len: 1, nextPc: pc + 1, text: `RST ${hexByte(opcode & 0x38)}` };
  }

  // EX, DI, EI, NOP, etc.
  if (opcode === 0x00) return { pc, len: 1, nextPc: pc + 1, text: "NOP" };
  if (opcode === 0xF3) return { pc, len: 1, nextPc: pc + 1, text: "DI" };
  if (opcode === 0xFB) return { pc, len: 1, nextPc: pc + 1, text: "EI" };
  if (opcode === 0xEB) return { pc, len: 1, nextPc: pc + 1, text: "EX DE, HL" };
  if (opcode === 0xE3) return { pc, len: 1, nextPc: pc + 1, text: "EX (SP), HL" };
  if (opcode === 0x08) return { pc, len: 1, nextPc: pc + 1, text: "EX AF, AF'" };
  if (opcode === 0xD9) return { pc, len: 1, nextPc: pc + 1, text: "EXX" };
  if (opcode === 0xE9) return { pc, len: 1, nextPc: pc + 1, text: "JP (HL)" };

  // RLA, RLCA, RRA, RRCA
  if (opcode === 0x07) return { pc, len: 1, nextPc: pc + 1, text: "RLCA" };
  if (opcode === 0x0F) return { pc, len: 1, nextPc: pc + 1, text: "RRCA" };
  if (opcode === 0x17) return { pc, len: 1, nextPc: pc + 1, text: "RLA" };
  if (opcode === 0x1F) return { pc, len: 1, nextPc: pc + 1, text: "RRA" };

  // SCF, CCF, CPL, DAA
  if (opcode === 0x37) return { pc, len: 1, nextPc: pc + 1, text: "SCF" };
  if (opcode === 0x3F) return { pc, len: 1, nextPc: pc + 1, text: "CCF" };
  if (opcode === 0x2F) return { pc, len: 1, nextPc: pc + 1, text: "CPL" };
  if (opcode === 0x27) return { pc, len: 1, nextPc: pc + 1, text: "DAA" };

  // DJNZ
  if (opcode === 0x10) {
    const target = (pc + 2 + signed8(rom[pc + 1])) & 0xFFFFFF;
    return { pc, len: 2, nextPc: pc + 2, target, text: `DJNZ ${hex(target)}` };
  }

  // OUT (n),A / IN A,(n)
  if (opcode === 0xD3) {
    return { pc, len: 2, nextPc: pc + 2, text: `OUT (${hexByte(rom[pc + 1])}), A` };
  }
  if (opcode === 0xDB) {
    return { pc, len: 2, nextPc: pc + 2, text: `IN A, (${hexByte(rom[pc + 1])})` };
  }

  return rawInstruction(pc, 1, "DB");
}

// --- Disassembly helpers ---

function disassemble(start, endExclusive) {
  const rows = [];
  for (let pc = start; pc < endExclusive && pc < rom.length;) {
    const row = decodeInstruction(pc);
    rows.push({ ...row, bytes: bytesHex(pc, row.len) });
    pc = row.nextPc;
  }
  return rows;
}

function findPrevRet(target, limit = 0x200) {
  const floor = Math.max(0, target - limit);
  for (let pc = target - 1; pc >= floor; pc--) {
    if (rom[pc] === 0xC9) return { addr: pc, kind: "RET", next: pc + 1 };
    if (rom[pc] === 0xED && rom[pc + 1] === 0x4D && pc + 1 < target) {
      return { addr: pc, kind: "RETI", next: pc + 2 };
    }
  }
  return null;
}

function findNextRet(target, limit = 0x200) {
  const ceiling = Math.min(rom.length, target + limit);
  for (let pc = target; pc < ceiling; pc++) {
    if (rom[pc] === 0xC9) return { addr: pc, kind: "RET", next: pc + 1 };
    if (rom[pc] === 0xED && rom[pc + 1] === 0x4D) {
      return { addr: pc, kind: "RETI", next: pc + 2 };
    }
  }
  return null;
}

function scanControlRefs(rangeStart, rangeEnd) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 3; pc++) {
    const mnemonic = CONTROL_OPS.get(rom[pc]);
    if (!mnemonic) continue;
    const target = read24(pc + 1);
    if (target >= rangeStart && target <= rangeEnd) {
      hits.push({ pc, target, mnemonic, bytes: bytesHex(pc, 4) });
    }
  }
  return hits;
}

function renderRows(rows, markers = new Map()) {
  for (const row of rows) {
    const marker = markers.get(row.pc);
    console.log(
      `  ${hex(row.pc)}  ${row.bytes.padEnd(14)}  ${row.text}${marker ? `  ${marker}` : ""}`,
    );
  }
}

// --- Scanning for LCD port references in a disassembly ---

function findPortReferences(rows) {
  const portRefs = [];
  for (const row of rows) {
    // Look for LD instructions referencing 0xE000xx addresses
    const match24 = row.text.match(/0x(E0[0-9A-F]{4})/i);
    if (match24) {
      const addr = parseInt(match24[1], 16);
      if (addr >= 0xE00000 && addr <= 0xE000FF) {
        portRefs.push({ pc: row.pc, text: row.text, port: addr });
      }
    }
    // Also check for OUT instructions
    if (row.text.includes("OUT")) {
      portRefs.push({ pc: row.pc, text: row.text, port: null });
    }
  }
  return portRefs;
}

// --- Main ---

console.log("Phase 393 - LCD mode setter functions (0x05527B SET 2 / 0x05522C RES 2)");
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(rom.length, 8)} (${rom.length.toLocaleString("en-US")} bytes)`);
console.log("");

// === 1. Verify bytes at target addresses ===

console.log("=== 1. Byte verification at target addresses ===");
console.log("");

console.log(`  At ${hex(SET2_ADDR)} (expected SET 2,(IY+0x46) = FD CB 46 D6):`);
console.log(`    Bytes: ${bytesHex(SET2_ADDR, 4)}`);
const set2Ok =
  rom[SET2_ADDR] === 0xFD &&
  rom[SET2_ADDR + 1] === 0xCB &&
  rom[SET2_ADDR + 2] === 0x46 &&
  rom[SET2_ADDR + 3] === 0xD6;
console.log(`    Match: ${set2Ok ? "YES" : "NO"}`);
console.log("");

console.log(`  At ${hex(RES2_ADDR)} (expected RES 2,(IY+0x46) = FD CB 46 96):`);
console.log(`    Bytes: ${bytesHex(RES2_ADDR, 4)}`);
const res2Ok =
  rom[RES2_ADDR] === 0xFD &&
  rom[RES2_ADDR + 1] === 0xCB &&
  rom[RES2_ADDR + 2] === 0x46 &&
  rom[RES2_ADDR + 3] === 0x96;
console.log(`    Match: ${res2Ok ? "YES" : "NO"}`);
console.log("");

console.log(`  At ${hex(SET_RES_1_ADDR)} (session 392 SET/RES 1 site):`);
console.log(`    Bytes: ${bytesHex(SET_RES_1_ADDR, 8)}`);
console.log("");

// === 2. Find function boundaries ===

console.log("=== 2. Function boundary discovery ===");
console.log("");

// Find boundaries around SET 2 (0x05527B)
const set2PrevRet = findPrevRet(SET2_ADDR);
const set2NextRet = findNextRet(SET2_ADDR);
const set2FuncStart = set2PrevRet?.next ?? (SET2_ADDR - 0x40);
const set2FuncEnd = set2NextRet?.addr ?? (SET2_ADDR + 0x40);

console.log(`  SET 2 site (${hex(SET2_ADDR)}):`);
console.log(`    Prev RET: ${set2PrevRet ? `${set2PrevRet.kind} at ${hex(set2PrevRet.addr)}` : "not found"}`);
console.log(`    Next RET: ${set2NextRet ? `${set2NextRet.kind} at ${hex(set2NextRet.addr)}` : "not found"}`);
console.log(`    Function range: ${hex(set2FuncStart)} .. ${hex(set2FuncEnd)}`);
console.log("");

// Find boundaries around RES 2 (0x05522C)
const res2PrevRet = findPrevRet(RES2_ADDR);
const res2NextRet = findNextRet(RES2_ADDR);
const res2FuncStart = res2PrevRet?.next ?? (RES2_ADDR - 0x40);
const res2FuncEnd = res2NextRet?.addr ?? (RES2_ADDR + 0x40);

console.log(`  RES 2 site (${hex(RES2_ADDR)}):`);
console.log(`    Prev RET: ${res2PrevRet ? `${res2PrevRet.kind} at ${hex(res2PrevRet.addr)}` : "not found"}`);
console.log(`    Next RET: ${res2NextRet ? `${res2NextRet.kind} at ${hex(res2NextRet.addr)}` : "not found"}`);
console.log(`    Function range: ${hex(res2FuncStart)} .. ${hex(res2FuncEnd)}`);
console.log("");

// Check if they are in the same function
const sameFunction =
  set2FuncStart === res2FuncStart && set2FuncEnd === res2FuncEnd;
const overlapping =
  !sameFunction &&
  set2FuncStart <= res2FuncEnd &&
  res2FuncStart <= set2FuncEnd;

console.log(`  Same function: ${sameFunction ? "YES" : "NO"}`);
if (overlapping) {
  console.log(`  Overlapping ranges: YES`);
}
console.log("");

// Check 0x0551A4 proximity
const addr0551A4InSet2Func =
  SET_RES_1_ADDR >= set2FuncStart && SET_RES_1_ADDR <= set2FuncEnd;
const addr0551A4InRes2Func =
  SET_RES_1_ADDR >= res2FuncStart && SET_RES_1_ADDR <= res2FuncEnd;
console.log(`  0x0551A4 in SET 2 function range: ${addr0551A4InSet2Func ? "YES" : "NO"}`);
console.log(`  0x0551A4 in RES 2 function range: ${addr0551A4InRes2Func ? "YES" : "NO"}`);

// Also find the function around 0x0551A4
const addr0551A4PrevRet = findPrevRet(SET_RES_1_ADDR);
const addr0551A4NextRet = findNextRet(SET_RES_1_ADDR);
const addr0551A4FuncStart = addr0551A4PrevRet?.next ?? (SET_RES_1_ADDR - 0x40);
const addr0551A4FuncEnd = addr0551A4NextRet?.addr ?? (SET_RES_1_ADDR + 0x40);
console.log(`  0x0551A4 function range: ${hex(addr0551A4FuncStart)} .. ${hex(addr0551A4FuncEnd)}`);
console.log("");

// === 3. Collect all unique function ranges ===

const functionRanges = new Map();
function addRange(label, start, end) {
  const key = `${start}-${end}`;
  if (!functionRanges.has(key)) {
    functionRanges.set(key, { start, end, labels: [] });
  }
  functionRanges.get(key).labels.push(label);
}

addRange("SET 2 (0x05527B)", set2FuncStart, set2FuncEnd);
addRange("RES 2 (0x05522C)", res2FuncStart, res2FuncEnd);
addRange("SET/RES 1 (0x0551A4)", addr0551A4FuncStart, addr0551A4FuncEnd);

// === 4. Disassemble each unique function ===

console.log("=== 3. Full disassembly of containing function(s) ===");
console.log("");

for (const [key, range] of functionRanges) {
  console.log(`--- Function ${hex(range.start)} .. ${hex(range.end)} ---`);
  console.log(`    Contains: ${range.labels.join(", ")}`);
  console.log(`    Size: ${range.end - range.start + 1} bytes`);
  console.log("");

  const rows = disassemble(range.start, range.end + 1);

  const markers = new Map();
  if (SET2_ADDR >= range.start && SET2_ADDR <= range.end) {
    markers.set(SET2_ADDR, "<-- SET 2,(IY+0x46) [switch to 8bpp]");
  }
  if (RES2_ADDR >= range.start && RES2_ADDR <= range.end) {
    markers.set(RES2_ADDR, "<-- RES 2,(IY+0x46) [switch to 16bpp]");
  }
  if (SET_RES_1_ADDR >= range.start && SET_RES_1_ADDR <= range.end) {
    markers.set(SET_RES_1_ADDR, "<-- SET/RES 1 site (session 392)");
  }

  renderRows(rows, markers);
  console.log("");

  // Check for LCD port references
  const portRefs = findPortReferences(rows);
  if (portRefs.length > 0) {
    console.log("  LCD hardware port references in this function:");
    for (const ref of portRefs) {
      console.log(`    ${hex(ref.pc)}: ${ref.text}${ref.port ? ` (port ${hex(ref.port)})` : ""}`);
    }
    console.log("");
  }

  // Also check raw bytes for E000xx patterns that the disassembler might miss
  const rawPortRefs = [];
  for (let addr = range.start; addr <= range.end - 2; addr++) {
    const lo = rom[addr];
    const mid = rom[addr + 1];
    const hi = rom[addr + 2];
    if (hi === 0xE0 && mid === 0x00) {
      rawPortRefs.push({ addr, port: (hi << 16) | (mid << 8) | lo });
    }
  }
  if (rawPortRefs.length > 0) {
    console.log("  Raw 3-byte patterns matching 0xE000xx:");
    for (const ref of rawPortRefs) {
      console.log(`    At ${hex(ref.addr)}: port ${hex(ref.port)} ; bytes ${bytesHex(ref.addr, 5)}`);
    }
    console.log("");
  }
}

// === 5. Wide-area disassembly from 0x055100 to 0x0553FF ===

console.log(`=== 4. Wide-area disassembly ${hex(SCAN_START)} .. ${hex(SCAN_END)} ===`);
console.log("    (to see the full context around all three sites)");
console.log("");

const wideRows = disassemble(SCAN_START, SCAN_END);
const wideMarkers = new Map([
  [SET2_ADDR, "<-- SET 2,(IY+0x46) [8bpp]"],
  [RES2_ADDR, "<-- RES 2,(IY+0x46) [16bpp]"],
  [SET_RES_1_ADDR, "<-- SET/RES 1 site (session 392)"],
]);

// Mark all RET instructions
for (const row of wideRows) {
  if (row.text === "RET" || row.text === "RETI") {
    if (!wideMarkers.has(row.pc)) {
      wideMarkers.set(row.pc, "<-- function boundary");
    }
  }
}

renderRows(wideRows, wideMarkers);
console.log("");

// === 6. Find callers ===

console.log("=== 5. Caller scan (CALL/JP into function ranges) ===");
console.log("");

// Collect all unique entry points to search for
const entryPoints = new Set();
for (const [, range] of functionRanges) {
  entryPoints.add(range.start);
}

// Also scan for calls to the RES 2 and SET 2 addresses directly
// (in case they are jumped to mid-function)
entryPoints.add(RES2_ADDR);
entryPoints.add(SET2_ADDR);
entryPoints.add(SET_RES_1_ADDR);

// Get the widest range encompassing all functions
const allStarts = [...functionRanges.values()].map((r) => r.start);
const allEnds = [...functionRanges.values()].map((r) => r.end);
const globalStart = Math.min(...allStarts);
const globalEnd = Math.max(...allEnds);

const callers = scanControlRefs(globalStart, globalEnd);

console.log(`  Scanning entire ROM for CALL/JP into ${hex(globalStart)} .. ${hex(globalEnd)}`);
console.log(`  Found ${callers.length} references:`);
console.log("");

for (const ref of callers) {
  let note = "";
  for (const [, range] of functionRanges) {
    if (ref.target === range.start) {
      note = ` (entry of ${range.labels.join(", ")})`;
    }
  }
  if (ref.target === SET2_ADDR) note = " (directly to SET 2)";
  if (ref.target === RES2_ADDR) note = " (directly to RES 2)";
  if (ref.target === SET_RES_1_ADDR) note = " (directly to SET/RES 1)";

  // Check if caller is inside the same region (internal branch)
  const internal = ref.pc >= globalStart && ref.pc <= globalEnd;
  if (internal) note += " [INTERNAL]";

  console.log(`  ${hex(ref.pc)}  ${ref.bytes.padEnd(11)}  ${ref.mnemonic} ${hex(ref.target)}${note}`);
}
console.log("");

// Also scan for callers specifically to each function entry
for (const entry of entryPoints) {
  const specificCallers = callers.filter(
    (r) => r.target === entry && !(r.pc >= globalStart && r.pc <= globalEnd),
  );
  if (specificCallers.length > 0) {
    console.log(`  External callers to ${hex(entry)}: ${specificCallers.length}`);
    for (const ref of specificCallers) {
      console.log(`    ${hex(ref.pc)}  ${ref.mnemonic} ${hex(ref.target)}`);
    }
  }
}
console.log("");

// === 7. Analysis ===

console.log("=== 6. Analysis ===");
console.log("");

console.log("  Key questions:");
console.log(`  - Are 0x05522C and 0x05527B in the same function? ${sameFunction ? "YES" : "NO"}`);
if (sameFunction) {
  console.log(`    Both the 16bpp setter (RES 2) and 8bpp setter (SET 2) live in one function`);
  console.log(`    at ${hex(set2FuncStart)} .. ${hex(set2FuncEnd)} (${set2FuncEnd - set2FuncStart + 1} bytes).`);
} else {
  console.log(`    RES 2 function: ${hex(res2FuncStart)} .. ${hex(res2FuncEnd)}`);
  console.log(`    SET 2 function: ${hex(set2FuncStart)} .. ${hex(set2FuncEnd)}`);
}
console.log("");

// Check what other IY+offset operations exist in the functions
console.log("  IY-indexed operations found in the function(s):");
for (const [, range] of functionRanges) {
  const rows = disassemble(range.start, range.end + 1);
  for (const row of rows) {
    if (row.text.includes("IY")) {
      const dispMatch = row.text.match(/IY([+-]0x[0-9A-F]+)/i);
      let ramAddr = "";
      if (dispMatch) {
        const disp = parseInt(dispMatch[1].replace("+", ""), 16);
        ramAddr = ` -> ${hex(IY_BASE + disp)}`;
      }
      console.log(`    ${hex(row.pc)}: ${row.text}${ramAddr}`);
    }
  }
}
console.log("");

// Summarize external callers
const externalCallers = callers.filter(
  (r) => !(r.pc >= globalStart && r.pc <= globalEnd),
);
console.log(`  Total external callers: ${externalCallers.length}`);
console.log(`  Total internal branches: ${callers.length - externalCallers.length}`);
console.log("");

// Look for patterns suggesting when mode switches happen
console.log("  Context of external callers (surrounding bytes for clues):");
for (const ref of externalCallers.slice(0, 20)) {
  // Show a few bytes before the caller for context
  const contextStart = Math.max(0, ref.pc - 8);
  console.log(`    ${hex(ref.pc)}: ${ref.mnemonic} ${hex(ref.target)}`);
  console.log(`      preceding bytes: ${bytesHex(contextStart, ref.pc - contextStart)}`);
  console.log(`      following bytes: ${bytesHex(ref.pc + 4, 8)}`);
}
console.log("");

console.log("Phase 393 complete.");
