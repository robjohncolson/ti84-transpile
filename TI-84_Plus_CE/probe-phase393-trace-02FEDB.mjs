#!/usr/bin/env node

/**
 * Phase 393 -- Trace 0x02FEDB caller context
 *
 * Goal:
 *   0x02FEDB is the sole caller of the 2ND-mode table reader at 0x0300CB
 *   (via JP NZ). We need to find what function 0x02FEDB belongs to -- this
 *   is the top-level key dispatch that decides normal vs 2ND-mode translation.
 *
 *   1. Decode the instruction at 0x02FEDB and its surrounding bytes.
 *   2. Recover the function that contains 0x02FEDB by scanning backward for
 *      hard terminators (RET, unconditional JP) or known entry points.
 *   3. Disassemble the full function from entry to terminator.
 *   4. Search the entire 4 MiB ROM for CALL/JP instructions targeting the
 *      function entry point.
 *   5. Print structured findings.
 *
 * Known landmarks:
 *   - 0x02FE73: LD A,(D0058C) / OR A / JP Z,0x02FD99 / RES 2,(IY+0x43) / ...
 *   - 0x02FE84, 0x02FEAB: known addresses in this key-processing area
 *   - 0x02FF8A-0x030078: large key-processing dispatcher
 *   - 0x0300CB: 2ND-mode table reader (called from 0x02FEDB)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, "ROM.rom");

const EXPECTED_ROM_SIZE = 0x400000;
const TARGET_ADDR = 0x02FEDB;

// Wide disassembly window to capture context
const DISASM_START = 0x02FE00;
const DISASM_END   = 0x030100;

// Search back limit for function entry discovery
const SEARCH_BACK_BYTES = 0x100;
const MAX_FUNCTION_BYTES = 0x300;

// -----------------------------------------------------------------------
// eZ80 decoder (ADL mode, 3-byte addresses)
// -----------------------------------------------------------------------

const CONTROL_OPS = new Map([
  [0xCD, { mnemonic: "CALL", kind: "call", conditional: false }],
  [0xC4, { mnemonic: "CALL NZ", kind: "call", conditional: true }],
  [0xCC, { mnemonic: "CALL Z", kind: "call", conditional: true }],
  [0xD4, { mnemonic: "CALL NC", kind: "call", conditional: true }],
  [0xDC, { mnemonic: "CALL C", kind: "call", conditional: true }],
  [0xE4, { mnemonic: "CALL PO", kind: "call", conditional: true }],
  [0xEC, { mnemonic: "CALL PE", kind: "call", conditional: true }],
  [0xF4, { mnemonic: "CALL P", kind: "call", conditional: true }],
  [0xFC, { mnemonic: "CALL M", kind: "call", conditional: true }],
  [0xC3, { mnemonic: "JP", kind: "jp", conditional: false }],
  [0xC2, { mnemonic: "JP NZ", kind: "jp", conditional: true }],
  [0xCA, { mnemonic: "JP Z", kind: "jp", conditional: true }],
  [0xD2, { mnemonic: "JP NC", kind: "jp", conditional: true }],
  [0xDA, { mnemonic: "JP C", kind: "jp", conditional: true }],
  [0xE2, { mnemonic: "JP PO", kind: "jp", conditional: true }],
  [0xEA, { mnemonic: "JP PE", kind: "jp", conditional: true }],
  [0xF2, { mnemonic: "JP P", kind: "jp", conditional: true }],
  [0xFA, { mnemonic: "JP M", kind: "jp", conditional: true }],
]);

const CONDITIONAL_RETS = new Map([
  [0xC0, "RET NZ"],
  [0xC8, "RET Z"],
  [0xD0, "RET NC"],
  [0xD8, "RET C"],
  [0xE0, "RET PO"],
  [0xE8, "RET PE"],
  [0xF0, "RET P"],
  [0xF8, "RET M"],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return "n/a";
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, "0")}`;
}

function hexByte(value) {
  return `0x${((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, "0")}`;
}

function bytesHex(bytes) {
  return Array.from(bytes, (byte) =>
    ((byte || 0) & 0xFF).toString(16).toUpperCase().padStart(2, "0")
  ).join(" ");
}

function read24(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function signed8(value) {
  const byte = (value ?? 0) & 0xFF;
  return byte >= 0x80 ? byte - 0x100 : byte;
}

function formatDisplacement(displacement) {
  const sign = displacement >= 0 ? "+" : "-";
  const magnitude = Math.abs(displacement);
  return `${sign}${hexByte(magnitude)}`;
}

function decodeIndexedPrefix(buffer, pc, prefix) {
  const regName = prefix === 0xDD ? "IX" : "IY";
  const b1 = buffer[pc + 1] ?? 0;

  if (b1 === 0xCB) {
    const displacement = signed8(buffer[pc + 2] ?? 0);
    const op = buffer[pc + 3] ?? 0;
    const bit = (op >> 3) & 0x07;
    const family = op & 0xC7;
    let mnemonic = `CB ${hexByte(op)}`;
    if (family === 0x46) mnemonic = `BIT ${bit},(${regName}${formatDisplacement(displacement)})`;
    else if (family === 0x86) mnemonic = `RES ${bit},(${regName}${formatDisplacement(displacement)})`;
    else if (family === 0xC6) mnemonic = `SET ${bit},(${regName}${formatDisplacement(displacement)})`;
    return { length: 4, mnemonic, kind: "indexed" };
  }

  if (b1 === 0x21) {
    return { length: 5, mnemonic: `LD ${regName},${hex(read24(buffer, pc + 2))}`, kind: "indexed" };
  }
  if (b1 === 0x22) {
    return { length: 5, mnemonic: `LD (${hex(read24(buffer, pc + 2))}),${regName}`, kind: "indexed" };
  }
  if (b1 === 0x2A) {
    return { length: 5, mnemonic: `LD ${regName},(${hex(read24(buffer, pc + 2))})`, kind: "indexed" };
  }
  if (b1 === 0x36) {
    const displacement = signed8(buffer[pc + 2] ?? 0);
    const imm = buffer[pc + 3] ?? 0;
    return {
      length: 4,
      mnemonic: `LD (${regName}${formatDisplacement(displacement)}),${hexByte(imm)}`,
      kind: "indexed",
    };
  }
  if (b1 === 0xE1) {
    return { length: 2, mnemonic: `POP ${regName}`, kind: "indexed" };
  }
  if (b1 === 0xE5) {
    return { length: 2, mnemonic: `PUSH ${regName}`, kind: "indexed" };
  }
  if (b1 === 0xE9) {
    return { length: 2, mnemonic: `JP (${regName})`, kind: "jpind" };
  }
  if (b1 === 0x23) {
    return { length: 2, mnemonic: `INC ${regName}`, kind: "indexed" };
  }
  if (b1 === 0x2B) {
    return { length: 2, mnemonic: `DEC ${regName}`, kind: "indexed" };
  }

  // LD r,(IX+d) / LD (IX+d),r patterns
  if ((b1 & 0xC7) === 0x46) {
    // LD r,(IX+d)
    const displacement = signed8(buffer[pc + 2] ?? 0);
    const regIdx = (b1 >> 3) & 0x07;
    const regNames = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
    return {
      length: 3,
      mnemonic: `LD ${regNames[regIdx]},(${regName}${formatDisplacement(displacement)})`,
      kind: "indexed",
    };
  }
  if ((b1 & 0xF8) === 0x70) {
    // LD (IX+d),r
    const displacement = signed8(buffer[pc + 2] ?? 0);
    const regIdx = b1 & 0x07;
    const regNames = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
    return {
      length: 3,
      mnemonic: `LD (${regName}${formatDisplacement(displacement)}),${regNames[regIdx]}`,
      kind: "indexed",
    };
  }

  // ADD IX,rr
  if ((b1 & 0xCF) === 0x09) {
    const rrIdx = (b1 >> 4) & 0x03;
    const rrNames = ["BC", "DE", regName, "SP"];
    return { length: 2, mnemonic: `ADD ${regName},${rrNames[rrIdx]}`, kind: "indexed" };
  }

  return { length: 2, mnemonic: `${hexByte(prefix)} ${hexByte(b1)}`, kind: "indexed" };
}

function decodeInstruction(buffer, pc) {
  const b0 = buffer[pc];
  if (b0 === undefined) {
    return { length: 1, mnemonic: "DB ??", kind: "db" };
  }

  const control = CONTROL_OPS.get(b0);
  if (control) {
    const target = read24(buffer, pc + 1);
    return {
      length: 4,
      mnemonic: `${control.mnemonic} ${hex(target)}`,
      kind: control.kind,
      conditional: control.conditional,
      target,
    };
  }

  if (CONDITIONAL_RETS.has(b0)) {
    return { length: 1, mnemonic: CONDITIONAL_RETS.get(b0), kind: "ret", conditional: true };
  }

  switch (b0) {
    case 0xC9:
      return { length: 1, mnemonic: "RET", kind: "ret", conditional: false };
    case 0xED: {
      const b1 = buffer[pc + 1] ?? 0;
      if (b1 === 0x4D) return { length: 2, mnemonic: "RETI", kind: "reti" };
      if (b1 === 0x45) return { length: 2, mnemonic: "RETN", kind: "retn" };
      if (b1 === 0xB0) return { length: 2, mnemonic: "LDIR", kind: "ed" };
      if (b1 === 0xB8) return { length: 2, mnemonic: "LDDR", kind: "ed" };
      if (b1 === 0xA0) return { length: 2, mnemonic: "LDI", kind: "ed" };
      if (b1 === 0xA8) return { length: 2, mnemonic: "LDD", kind: "ed" };
      return { length: 2, mnemonic: `ED ${hexByte(b1)}`, kind: "ed" };
    }
    case 0xCB: {
      const b1 = buffer[pc + 1] ?? 0;
      const bit = (b1 >> 3) & 0x07;
      const regIdx = b1 & 0x07;
      const regNames = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
      const family = b1 & 0xC0;
      if (family === 0x00) {
        const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
        return { length: 2, mnemonic: `${ops[(b1 >> 3) & 7]} ${regNames[regIdx]}`, kind: "cb" };
      }
      if (family === 0x40) return { length: 2, mnemonic: `BIT ${bit},${regNames[regIdx]}`, kind: "cb" };
      if (family === 0x80) return { length: 2, mnemonic: `RES ${bit},${regNames[regIdx]}`, kind: "cb" };
      if (family === 0xC0) return { length: 2, mnemonic: `SET ${bit},${regNames[regIdx]}`, kind: "cb" };
      return { length: 2, mnemonic: `CB ${hexByte(b1)}`, kind: "cb" };
    }
    case 0xDD:
    case 0xFD:
      return decodeIndexedPrefix(buffer, pc, b0);
    case 0x18: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `JR ${hex(target)}`, kind: "jr", conditional: false, target };
    }
    case 0x20: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `JR NZ,${hex(target)}`, kind: "jr", conditional: true, target };
    }
    case 0x28: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `JR Z,${hex(target)}`, kind: "jr", conditional: true, target };
    }
    case 0x30: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `JR NC,${hex(target)}`, kind: "jr", conditional: true, target };
    }
    case 0x38: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `JR C,${hex(target)}`, kind: "jr", conditional: true, target };
    }
    case 0x10: {
      const target = (pc + 2 + signed8(buffer[pc + 1] ?? 0)) >>> 0;
      return { length: 2, mnemonic: `DJNZ ${hex(target)}`, kind: "jr", conditional: true, target };
    }
    case 0xC6:
      return { length: 2, mnemonic: `ADD A,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xCE:
      return { length: 2, mnemonic: `ADC A,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xD6:
      return { length: 2, mnemonic: `SUB ${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xDE:
      return { length: 2, mnemonic: `SBC A,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xE6:
      return { length: 2, mnemonic: `AND ${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xEE:
      return { length: 2, mnemonic: `XOR ${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xF6:
      return { length: 2, mnemonic: `OR ${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0xFE:
      return { length: 2, mnemonic: `CP ${hexByte(buffer[pc + 1] ?? 0)}`, kind: "alu" };
    case 0x3E:
      return { length: 2, mnemonic: `LD A,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x06:
      return { length: 2, mnemonic: `LD B,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x0E:
      return { length: 2, mnemonic: `LD C,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x16:
      return { length: 2, mnemonic: `LD D,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x1E:
      return { length: 2, mnemonic: `LD E,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x26:
      return { length: 2, mnemonic: `LD H,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x2E:
      return { length: 2, mnemonic: `LD L,${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x36:
      return { length: 2, mnemonic: `LD (HL),${hexByte(buffer[pc + 1] ?? 0)}`, kind: "ld" };
    case 0x01:
      return { length: 4, mnemonic: `LD BC,${hex(read24(buffer, pc + 1))}`, kind: "ld" };
    case 0x11:
      return { length: 4, mnemonic: `LD DE,${hex(read24(buffer, pc + 1))}`, kind: "ld" };
    case 0x21:
      return { length: 4, mnemonic: `LD HL,${hex(read24(buffer, pc + 1))}`, kind: "ld" };
    case 0x31:
      return { length: 4, mnemonic: `LD SP,${hex(read24(buffer, pc + 1))}`, kind: "ld" };
    case 0x32:
      return { length: 4, mnemonic: `LD (${hex(read24(buffer, pc + 1))}),A`, kind: "ld" };
    case 0x3A:
      return { length: 4, mnemonic: `LD A,(${hex(read24(buffer, pc + 1))})`, kind: "ld" };
    case 0x22:
      return { length: 4, mnemonic: `LD (${hex(read24(buffer, pc + 1))}),HL`, kind: "ld" };
    case 0x2A:
      return { length: 4, mnemonic: `LD HL,(${hex(read24(buffer, pc + 1))})`, kind: "ld" };

    // 8-bit register-to-register moves
    case 0x40: return { length: 1, mnemonic: "LD B,B", kind: "ld" };
    case 0x41: return { length: 1, mnemonic: "LD B,C", kind: "ld" };
    case 0x42: return { length: 1, mnemonic: "LD B,D", kind: "ld" };
    case 0x43: return { length: 1, mnemonic: "LD B,E", kind: "ld" };
    case 0x44: return { length: 1, mnemonic: "LD B,H", kind: "ld" };
    case 0x45: return { length: 1, mnemonic: "LD B,L", kind: "ld" };
    case 0x46: return { length: 1, mnemonic: "LD B,(HL)", kind: "ld" };
    case 0x47: return { length: 1, mnemonic: "LD B,A", kind: "ld" };
    case 0x48: return { length: 1, mnemonic: "LD C,B", kind: "ld" };
    case 0x49: return { length: 1, mnemonic: "LD C,C", kind: "ld" };
    case 0x4A: return { length: 1, mnemonic: "LD C,D", kind: "ld" };
    case 0x4B: return { length: 1, mnemonic: "LD C,E", kind: "ld" };
    case 0x4C: return { length: 1, mnemonic: "LD C,H", kind: "ld" };
    case 0x4D: return { length: 1, mnemonic: "LD C,L", kind: "ld" };
    case 0x4E: return { length: 1, mnemonic: "LD C,(HL)", kind: "ld" };
    case 0x4F: return { length: 1, mnemonic: "LD C,A", kind: "ld" };
    case 0x50: return { length: 1, mnemonic: "LD D,B", kind: "ld" };
    case 0x51: return { length: 1, mnemonic: "LD D,C", kind: "ld" };
    case 0x52: return { length: 1, mnemonic: "LD D,D", kind: "ld" };
    case 0x53: return { length: 1, mnemonic: "LD D,E", kind: "ld" };
    case 0x54: return { length: 1, mnemonic: "LD D,H", kind: "ld" };
    case 0x55: return { length: 1, mnemonic: "LD D,L", kind: "ld" };
    case 0x56: return { length: 1, mnemonic: "LD D,(HL)", kind: "ld" };
    case 0x57: return { length: 1, mnemonic: "LD D,A", kind: "ld" };
    case 0x58: return { length: 1, mnemonic: "LD E,B", kind: "ld" };
    case 0x59: return { length: 1, mnemonic: "LD E,C", kind: "ld" };
    case 0x5A: return { length: 1, mnemonic: "LD E,D", kind: "ld" };
    case 0x5B: return { length: 1, mnemonic: "LD E,E", kind: "ld" };
    case 0x5C: return { length: 1, mnemonic: "LD E,H", kind: "ld" };
    case 0x5D: return { length: 1, mnemonic: "LD E,L", kind: "ld" };
    case 0x5E: return { length: 1, mnemonic: "LD E,(HL)", kind: "ld" };
    case 0x5F: return { length: 1, mnemonic: "LD E,A", kind: "ld" };
    case 0x60: return { length: 1, mnemonic: "LD H,B", kind: "ld" };
    case 0x61: return { length: 1, mnemonic: "LD H,C", kind: "ld" };
    case 0x62: return { length: 1, mnemonic: "LD H,D", kind: "ld" };
    case 0x63: return { length: 1, mnemonic: "LD H,E", kind: "ld" };
    case 0x64: return { length: 1, mnemonic: "LD H,H", kind: "ld" };
    case 0x65: return { length: 1, mnemonic: "LD H,L", kind: "ld" };
    case 0x66: return { length: 1, mnemonic: "LD H,(HL)", kind: "ld" };
    case 0x67: return { length: 1, mnemonic: "LD H,A", kind: "ld" };
    case 0x68: return { length: 1, mnemonic: "LD L,B", kind: "ld" };
    case 0x69: return { length: 1, mnemonic: "LD L,C", kind: "ld" };
    case 0x6A: return { length: 1, mnemonic: "LD L,D", kind: "ld" };
    case 0x6B: return { length: 1, mnemonic: "LD L,E", kind: "ld" };
    case 0x6C: return { length: 1, mnemonic: "LD L,H", kind: "ld" };
    case 0x6D: return { length: 1, mnemonic: "LD L,L", kind: "ld" };
    case 0x6E: return { length: 1, mnemonic: "LD L,(HL)", kind: "ld" };
    case 0x6F: return { length: 1, mnemonic: "LD L,A", kind: "ld" };
    case 0x70: return { length: 1, mnemonic: "LD (HL),B", kind: "ld" };
    case 0x71: return { length: 1, mnemonic: "LD (HL),C", kind: "ld" };
    case 0x72: return { length: 1, mnemonic: "LD (HL),D", kind: "ld" };
    case 0x73: return { length: 1, mnemonic: "LD (HL),E", kind: "ld" };
    case 0x74: return { length: 1, mnemonic: "LD (HL),H", kind: "ld" };
    case 0x75: return { length: 1, mnemonic: "LD (HL),L", kind: "ld" };
    case 0x77: return { length: 1, mnemonic: "LD (HL),A", kind: "ld" };
    case 0x78: return { length: 1, mnemonic: "LD A,B", kind: "ld" };
    case 0x79: return { length: 1, mnemonic: "LD A,C", kind: "ld" };
    case 0x7A: return { length: 1, mnemonic: "LD A,D", kind: "ld" };
    case 0x7B: return { length: 1, mnemonic: "LD A,E", kind: "ld" };
    case 0x7C: return { length: 1, mnemonic: "LD A,H", kind: "ld" };
    case 0x7D: return { length: 1, mnemonic: "LD A,L", kind: "ld" };
    case 0x7E: return { length: 1, mnemonic: "LD A,(HL)", kind: "ld" };
    case 0x7F: return { length: 1, mnemonic: "LD A,A", kind: "ld" };

    // ALU register ops
    case 0x80: return { length: 1, mnemonic: "ADD A,B", kind: "alu" };
    case 0x81: return { length: 1, mnemonic: "ADD A,C", kind: "alu" };
    case 0x82: return { length: 1, mnemonic: "ADD A,D", kind: "alu" };
    case 0x83: return { length: 1, mnemonic: "ADD A,E", kind: "alu" };
    case 0x84: return { length: 1, mnemonic: "ADD A,H", kind: "alu" };
    case 0x85: return { length: 1, mnemonic: "ADD A,L", kind: "alu" };
    case 0x86: return { length: 1, mnemonic: "ADD A,(HL)", kind: "alu" };
    case 0x87: return { length: 1, mnemonic: "ADD A,A", kind: "alu" };
    case 0x90: return { length: 1, mnemonic: "SUB B", kind: "alu" };
    case 0x91: return { length: 1, mnemonic: "SUB C", kind: "alu" };
    case 0x92: return { length: 1, mnemonic: "SUB D", kind: "alu" };
    case 0x93: return { length: 1, mnemonic: "SUB E", kind: "alu" };
    case 0x94: return { length: 1, mnemonic: "SUB H", kind: "alu" };
    case 0x95: return { length: 1, mnemonic: "SUB L", kind: "alu" };
    case 0x96: return { length: 1, mnemonic: "SUB (HL)", kind: "alu" };
    case 0x97: return { length: 1, mnemonic: "SUB A", kind: "alu" };
    case 0xA0: return { length: 1, mnemonic: "AND B", kind: "alu" };
    case 0xA1: return { length: 1, mnemonic: "AND C", kind: "alu" };
    case 0xA2: return { length: 1, mnemonic: "AND D", kind: "alu" };
    case 0xA3: return { length: 1, mnemonic: "AND E", kind: "alu" };
    case 0xA4: return { length: 1, mnemonic: "AND H", kind: "alu" };
    case 0xA5: return { length: 1, mnemonic: "AND L", kind: "alu" };
    case 0xA6: return { length: 1, mnemonic: "AND (HL)", kind: "alu" };
    case 0xA7: return { length: 1, mnemonic: "AND A", kind: "alu" };
    case 0xA8: return { length: 1, mnemonic: "XOR B", kind: "alu" };
    case 0xA9: return { length: 1, mnemonic: "XOR C", kind: "alu" };
    case 0xAA: return { length: 1, mnemonic: "XOR D", kind: "alu" };
    case 0xAB: return { length: 1, mnemonic: "XOR E", kind: "alu" };
    case 0xAC: return { length: 1, mnemonic: "XOR H", kind: "alu" };
    case 0xAD: return { length: 1, mnemonic: "XOR L", kind: "alu" };
    case 0xAE: return { length: 1, mnemonic: "XOR (HL)", kind: "alu" };
    case 0xAF: return { length: 1, mnemonic: "XOR A", kind: "alu" };
    case 0xB0: return { length: 1, mnemonic: "OR B", kind: "alu" };
    case 0xB1: return { length: 1, mnemonic: "OR C", kind: "alu" };
    case 0xB2: return { length: 1, mnemonic: "OR D", kind: "alu" };
    case 0xB3: return { length: 1, mnemonic: "OR E", kind: "alu" };
    case 0xB4: return { length: 1, mnemonic: "OR H", kind: "alu" };
    case 0xB5: return { length: 1, mnemonic: "OR L", kind: "alu" };
    case 0xB6: return { length: 1, mnemonic: "OR (HL)", kind: "alu" };
    case 0xB7: return { length: 1, mnemonic: "OR A", kind: "alu" };
    case 0xB8: return { length: 1, mnemonic: "CP B", kind: "alu" };
    case 0xB9: return { length: 1, mnemonic: "CP C", kind: "alu" };
    case 0xBA: return { length: 1, mnemonic: "CP D", kind: "alu" };
    case 0xBB: return { length: 1, mnemonic: "CP E", kind: "alu" };
    case 0xBC: return { length: 1, mnemonic: "CP H", kind: "alu" };
    case 0xBD: return { length: 1, mnemonic: "CP L", kind: "alu" };
    case 0xBE: return { length: 1, mnemonic: "CP (HL)", kind: "alu" };
    case 0xBF: return { length: 1, mnemonic: "CP A", kind: "alu" };

    // 16-bit arithmetic
    case 0x09: return { length: 1, mnemonic: "ADD HL,BC", kind: "alu" };
    case 0x19: return { length: 1, mnemonic: "ADD HL,DE", kind: "alu" };
    case 0x29: return { length: 1, mnemonic: "ADD HL,HL", kind: "alu" };
    case 0x39: return { length: 1, mnemonic: "ADD HL,SP", kind: "alu" };

    // INC/DEC 8-bit
    case 0x04: return { length: 1, mnemonic: "INC B", kind: "inc" };
    case 0x0C: return { length: 1, mnemonic: "INC C", kind: "inc" };
    case 0x14: return { length: 1, mnemonic: "INC D", kind: "inc" };
    case 0x1C: return { length: 1, mnemonic: "INC E", kind: "inc" };
    case 0x24: return { length: 1, mnemonic: "INC H", kind: "inc" };
    case 0x2C: return { length: 1, mnemonic: "INC L", kind: "inc" };
    case 0x34: return { length: 1, mnemonic: "INC (HL)", kind: "inc" };
    case 0x3C: return { length: 1, mnemonic: "INC A", kind: "inc" };
    case 0x05: return { length: 1, mnemonic: "DEC B", kind: "dec" };
    case 0x0D: return { length: 1, mnemonic: "DEC C", kind: "dec" };
    case 0x15: return { length: 1, mnemonic: "DEC D", kind: "dec" };
    case 0x1D: return { length: 1, mnemonic: "DEC E", kind: "dec" };
    case 0x25: return { length: 1, mnemonic: "DEC H", kind: "dec" };
    case 0x2D: return { length: 1, mnemonic: "DEC L", kind: "dec" };
    case 0x35: return { length: 1, mnemonic: "DEC (HL)", kind: "dec" };
    case 0x3D: return { length: 1, mnemonic: "DEC A", kind: "dec" };

    // INC/DEC 16-bit
    case 0x03: return { length: 1, mnemonic: "INC BC", kind: "inc" };
    case 0x13: return { length: 1, mnemonic: "INC DE", kind: "inc" };
    case 0x23: return { length: 1, mnemonic: "INC HL", kind: "inc" };
    case 0x33: return { length: 1, mnemonic: "INC SP", kind: "inc" };
    case 0x0B: return { length: 1, mnemonic: "DEC BC", kind: "dec" };
    case 0x1B: return { length: 1, mnemonic: "DEC DE", kind: "dec" };
    case 0x2B: return { length: 1, mnemonic: "DEC HL", kind: "dec" };
    case 0x3B: return { length: 1, mnemonic: "DEC SP", kind: "dec" };

    // PUSH/POP
    case 0xC5: return { length: 1, mnemonic: "PUSH BC", kind: "stack" };
    case 0xD5: return { length: 1, mnemonic: "PUSH DE", kind: "stack" };
    case 0xE5: return { length: 1, mnemonic: "PUSH HL", kind: "stack" };
    case 0xF5: return { length: 1, mnemonic: "PUSH AF", kind: "stack" };
    case 0xC1: return { length: 1, mnemonic: "POP BC", kind: "stack" };
    case 0xD1: return { length: 1, mnemonic: "POP DE", kind: "stack" };
    case 0xE1: return { length: 1, mnemonic: "POP HL", kind: "stack" };
    case 0xF1: return { length: 1, mnemonic: "POP AF", kind: "stack" };

    // Misc
    case 0x00: return { length: 1, mnemonic: "NOP", kind: "nop" };
    case 0x37: return { length: 1, mnemonic: "SCF", kind: "flag" };
    case 0x3F: return { length: 1, mnemonic: "CCF", kind: "flag" };
    case 0x2F: return { length: 1, mnemonic: "CPL", kind: "alu" };
    case 0x76: return { length: 1, mnemonic: "HALT", kind: "halt" };
    case 0xF3: return { length: 1, mnemonic: "DI", kind: "misc" };
    case 0xFB: return { length: 1, mnemonic: "EI", kind: "misc" };
    case 0xD9: return { length: 1, mnemonic: "EXX", kind: "ex" };
    case 0x08: return { length: 1, mnemonic: "EX AF,AF'", kind: "ex" };
    case 0xEB: return { length: 1, mnemonic: "EX DE,HL", kind: "ex" };
    case 0xE3: return { length: 1, mnemonic: "EX (SP),HL", kind: "ex" };
    case 0x02: return { length: 1, mnemonic: "LD (BC),A", kind: "ld" };
    case 0x0A: return { length: 1, mnemonic: "LD A,(BC)", kind: "ld" };
    case 0x12: return { length: 1, mnemonic: "LD (DE),A", kind: "ld" };
    case 0x1A: return { length: 1, mnemonic: "LD A,(DE)", kind: "ld" };
    case 0x07: return { length: 1, mnemonic: "RLCA", kind: "alu" };
    case 0x0F: return { length: 1, mnemonic: "RRCA", kind: "alu" };
    case 0x17: return { length: 1, mnemonic: "RLA", kind: "alu" };
    case 0x1F: return { length: 1, mnemonic: "RRA", kind: "alu" };
    case 0x27: return { length: 1, mnemonic: "DAA", kind: "alu" };

    // RST
    case 0xC7: return { length: 1, mnemonic: "RST 0x00", kind: "rst" };
    case 0xCF: return { length: 1, mnemonic: "RST 0x08", kind: "rst" };
    case 0xD7: return { length: 1, mnemonic: "RST 0x10", kind: "rst" };
    case 0xDF: return { length: 1, mnemonic: "RST 0x18", kind: "rst" };
    case 0xE7: return { length: 1, mnemonic: "RST 0x20", kind: "rst" };
    case 0xEF: return { length: 1, mnemonic: "RST 0x28", kind: "rst" };
    case 0xF7: return { length: 1, mnemonic: "RST 0x30", kind: "rst" };
    case 0xFF: return { length: 1, mnemonic: "RST 0x38", kind: "rst" };

    default:
      return { length: 1, mnemonic: `DB ${hexByte(b0)}`, kind: "db" };
  }
}

function isHardTerminator(inst) {
  if (!inst) return false;
  if (inst.kind === "ret" && !inst.conditional) return true;
  if (inst.kind === "reti" || inst.kind === "retn") return true;
  if ((inst.kind === "jp" || inst.kind === "jr") && !inst.conditional) return true;
  return false;
}

// -----------------------------------------------------------------------
// Linear disassembly of a range (not function-aware)
// -----------------------------------------------------------------------

function disasmRange(buffer, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(buffer, pc);
    const length = Math.max(1, inst.length || 1);
    const nextPc = pc + length;
    rows.push({
      pc,
      nextPc,
      bytes: buffer.subarray(pc, nextPc),
      length,
      mnemonic: inst.mnemonic,
      kind: inst.kind,
      conditional: inst.conditional ?? false,
      target: inst.target,
    });
    pc = nextPc;
  }
  return rows;
}

// -----------------------------------------------------------------------
// Function boundary recovery
// -----------------------------------------------------------------------

function findFunctionEntry(buffer, targetAddr) {
  // Strategy: scan backward from targetAddr looking for a hard terminator
  // whose next byte would be the function entry. Also check known entries.
  const knownEntries = [0x02FE73, 0x02FE84, 0x02FEAB, 0x02FF8A];

  // First: find the highest known entry <= targetAddr
  let bestKnown = null;
  for (const entry of knownEntries) {
    if (entry <= targetAddr) {
      if (!bestKnown || entry > bestKnown) {
        bestKnown = entry;
      }
    }
  }

  // Second: scan backward from targetAddr for hard terminators
  const searchStart = Math.max(0, targetAddr - SEARCH_BACK_BYTES);
  const candidates = [];

  let pc = searchStart;
  while (pc < targetAddr) {
    const inst = decodeInstruction(buffer, pc);
    const length = Math.max(1, inst.length || 1);
    const nextPc = pc + length;

    if (isHardTerminator(inst) && nextPc <= targetAddr) {
      candidates.push(nextPc);
    }

    pc = nextPc;
  }

  // The function entry is the address right after the closest hard terminator
  // that is still before targetAddr, OR a known entry if that's higher.
  let entry = searchStart;
  if (candidates.length > 0) {
    // Find the closest terminator-end that is <= targetAddr
    const validCandidates = candidates.filter((c) => c <= targetAddr);
    if (validCandidates.length > 0) {
      entry = validCandidates[validCandidates.length - 1];
    }
  }

  // If a known entry is between entry and targetAddr, prefer it if higher
  if (bestKnown !== null && bestKnown >= entry && bestKnown <= targetAddr) {
    // Known entry is within the function range; use it if it's closer
    // But a known entry could be IN a different function that ends before target
    // We need to verify the known entry's function reaches the target
  }

  return { entry, bestKnown };
}

function findFunctionEnd(buffer, start) {
  let pc = start;
  const limit = Math.min(buffer.length, start + MAX_FUNCTION_BYTES);

  while (pc < limit) {
    const inst = decodeInstruction(buffer, pc);
    const length = Math.max(1, inst.length || 1);
    pc += length;

    if (isHardTerminator(inst)) {
      return pc;
    }
  }

  return pc;
}

// -----------------------------------------------------------------------
// ROM-wide caller search
// -----------------------------------------------------------------------

function scanCallersOf(buffer, targetAddrs) {
  const targets = new Set(targetAddrs.map((a) => a >>> 0));
  const matches = [];

  for (let pc = 0; pc <= buffer.length - 4; pc++) {
    const op = buffer[pc];
    const control = CONTROL_OPS.get(op);
    if (!control) continue;

    const target = read24(buffer, pc + 1);
    if (targets.has(target)) {
      matches.push({
        caller: pc,
        target,
        mnemonic: control.mnemonic,
        bytes: buffer.subarray(pc, pc + 4),
      });
    }
  }

  matches.sort((a, b) => a.caller - b.caller);
  return matches;
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

const rom = fs.readFileSync(ROM_PATH);

if (rom.length !== EXPECTED_ROM_SIZE) {
  throw new Error(
    `Expected ROM size ${hex(EXPECTED_ROM_SIZE, 8)} (${EXPECTED_ROM_SIZE}) bytes, ` +
    `got ${hex(rom.length, 8)} (${rom.length}) bytes.`
  );
}

console.log(`ROM path: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
console.log(`Target address: ${hex(TARGET_ADDR)}`);
console.log();

// -----------------------------------------------------------------------
// 1. Bytes at 0x02FEDB
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("1. Instruction at 0x02FEDB");
console.log("=".repeat(88));

const instAt = decodeInstruction(rom, TARGET_ADDR);
const instBytes = rom.subarray(TARGET_ADDR, TARGET_ADDR + instAt.length);
console.log(`Address:  ${hex(TARGET_ADDR)}`);
console.log(`Bytes:    ${bytesHex(instBytes)}`);
console.log(`Decoded:  ${instAt.mnemonic}`);
console.log(`Kind:     ${instAt.kind}`);
if (instAt.target !== undefined) {
  console.log(`Target:   ${hex(instAt.target)}`);
}
console.log();

// -----------------------------------------------------------------------
// 2. Wide disassembly 0x02FE00..0x030100
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log(`2. Full Disassembly ${hex(DISASM_START)}..${hex(DISASM_END)}`);
console.log("=".repeat(88));

const wideRows = disasmRange(rom, DISASM_START, DISASM_END);

// Identify hard terminators to mark function boundaries
let funcId = 0;
const funcBoundaries = []; // addresses right after hard terminators

for (const row of wideRows) {
  const marker =
    row.pc === TARGET_ADDR
      ? "  <<<< TARGET 0x02FEDB"
      : row.pc === 0x02FE73
        ? "  << known: key_translate_entry"
        : row.pc === 0x02FE84
          ? "  << known: 0x02FE84"
          : row.pc === 0x02FEAB
            ? "  << known: 0x02FEAB"
            : row.pc === 0x02FF8A
              ? "  << known: large_key_dispatcher entry"
              : row.pc === 0x0300CB
                ? "  << known: 2ND-mode table reader"
                : "";

  const termMarker = isHardTerminator(decodeInstruction(rom, row.pc)) ? " ---" : "";

  console.log(
    `  ${hex(row.pc)}  ${bytesHex(row.bytes).padEnd(16, " ")}  ${row.mnemonic}${marker}${termMarker}`
  );

  if (isHardTerminator(decodeInstruction(rom, row.pc))) {
    funcBoundaries.push(row.nextPc);
  }
}

console.log();
console.log("Function boundaries (addresses after hard terminators):");
for (const addr of funcBoundaries) {
  console.log(`  ${hex(addr)}`);
}
console.log();

// -----------------------------------------------------------------------
// 3. Containing function analysis
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("3. Containing Function for 0x02FEDB");
console.log("=".repeat(88));

// Find the closest hard-terminator boundary before 0x02FEDB
let containingEntry = DISASM_START;
for (const row of wideRows) {
  if (row.pc >= TARGET_ADDR) break;
  if (isHardTerminator(decodeInstruction(rom, row.pc))) {
    containingEntry = row.nextPc;
  }
}

// Find the next hard terminator after 0x02FEDB
let containingEnd = TARGET_ADDR;
let foundEnd = false;
for (const row of wideRows) {
  if (row.pc < containingEntry) continue;
  if (isHardTerminator(decodeInstruction(rom, row.pc))) {
    containingEnd = row.nextPc;
    foundEnd = true;
    break;
  }
}

// But the function could be a multi-block function with internal jumps.
// Let's also find ALL terminators from entry to a reasonable limit.
console.log(`Closest preceding terminator ends at: ${hex(containingEntry)}`);
console.log(`Function containing 0x02FEDB starts at: ${hex(containingEntry)}`);
console.log(`First terminator after target at: ${hex(containingEnd)}`);
console.log();

// Print just the containing block
console.log("Containing block disassembly:");
for (const row of wideRows) {
  if (row.pc < containingEntry) continue;
  if (foundEnd && row.pc >= containingEnd) break;

  const marker = row.pc === TARGET_ADDR ? "  <<<< TARGET" : "";
  console.log(
    `  ${hex(row.pc)}  ${bytesHex(row.bytes).padEnd(16, " ")}  ${row.mnemonic}${marker}`
  );
}
console.log();

// -----------------------------------------------------------------------
// 4. Extended function analysis -- trace all blocks reachable from entry
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("4. Multi-block Function Analysis");
console.log("=".repeat(88));

// Build a map of all instructions in the wide disassembly
const instrMap = new Map();
for (const row of wideRows) {
  instrMap.set(row.pc, row);
}

// BFS from the containing entry to find all reachable blocks
const visited = new Set();
const queue = [containingEntry];
const reachableBlocks = []; // [startAddr, endAddr]

while (queue.length > 0) {
  const blockStart = queue.shift();
  if (visited.has(blockStart)) continue;
  if (blockStart < DISASM_START || blockStart >= DISASM_END) continue;
  visited.add(blockStart);

  let pc = blockStart;
  const blockInstrs = [];

  while (pc < DISASM_END) {
    const row = instrMap.get(pc);
    if (!row) break;
    blockInstrs.push(row);

    // Follow conditional branches/jumps within the range
    if (row.target !== undefined && row.conditional) {
      if (row.target >= DISASM_START && row.target < DISASM_END) {
        queue.push(row.target);
      }
    }

    if (isHardTerminator(decodeInstruction(rom, pc))) {
      // For unconditional JP within range, follow it
      if (
        (row.kind === "jp" || row.kind === "jr") &&
        !row.conditional &&
        row.target >= DISASM_START &&
        row.target < DISASM_END
      ) {
        queue.push(row.target);
      }
      break;
    }

    pc = row.nextPc;
  }

  if (blockInstrs.length > 0) {
    reachableBlocks.push({
      start: blockInstrs[0].pc,
      end: blockInstrs[blockInstrs.length - 1].nextPc,
      instrs: blockInstrs,
    });
  }
}

reachableBlocks.sort((a, b) => a.start - b.start);

console.log(`Reachable blocks from ${hex(containingEntry)}:`);
for (const block of reachableBlocks) {
  const hasTarget = block.instrs.some((r) => r.pc === TARGET_ADDR);
  console.log(
    `  ${hex(block.start)}..${hex(block.end - 1)} (${block.instrs.length} instrs)${hasTarget ? "  << contains target" : ""}`
  );
}
console.log();

// Overall function range
const funcStart = reachableBlocks.length > 0 ? reachableBlocks[0].start : containingEntry;
const funcEnd =
  reachableBlocks.length > 0
    ? reachableBlocks[reachableBlocks.length - 1].end
    : containingEnd;

console.log(`Overall function range: ${hex(funcStart)}..${hex(funcEnd - 1)}`);
console.log(`Function size: ${funcEnd - funcStart} bytes`);
console.log();

// -----------------------------------------------------------------------
// 5. Search ROM for callers of the function entry
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("5. ROM-wide Callers of Function Entry");
console.log("=".repeat(88));

// Search for calls to the entry point AND to 0x02FEDB itself
const searchTargets = [funcStart, containingEntry];
if (!searchTargets.includes(TARGET_ADDR)) {
  searchTargets.push(TARGET_ADDR);
}
// Also search for known entries in the area
const additionalTargets = [0x02FE73, 0x02FE84, 0x02FEAB, 0x02FF8A];
const allSearchTargets = [...new Set([...searchTargets, ...additionalTargets])];

console.log(`Searching for CALL/JP to: ${allSearchTargets.map((a) => hex(a)).join(", ")}`);
console.log();

const callers = scanCallersOf(rom, allSearchTargets);

if (callers.length === 0) {
  console.log("(no callers found)");
} else {
  console.log("caller     bytes           mnemonic      target");
  for (const match of callers) {
    // Decode what's around the caller for context
    console.log(
      `${hex(match.caller)}  ${bytesHex(match.bytes).padEnd(14, " ")}  ` +
      `${match.mnemonic.padEnd(12, " ")}  ${hex(match.target)}`
    );
  }
}
console.log();

// -----------------------------------------------------------------------
// 6. Decision tree leading to 0x02FEDB
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("6. Decision Tree Leading to 0x02FEDB");
console.log("=".repeat(88));

// Walk backward from 0x02FEDB within the containing block to find the
// condition checks that gate the JP NZ at 0x02FEDB.
const blockRows = [];
for (const row of wideRows) {
  if (row.pc < containingEntry) continue;
  if (row.pc >= containingEnd) break;
  blockRows.push(row);
}

const targetIdx = blockRows.findIndex((r) => r.pc === TARGET_ADDR);
if (targetIdx >= 0) {
  const contextStart = Math.max(0, targetIdx - 15);
  const contextEnd = Math.min(blockRows.length, targetIdx + 5);

  console.log("Instructions leading to and following 0x02FEDB:");
  for (let i = contextStart; i < contextEnd; i++) {
    const row = blockRows[i];
    const marker = row.pc === TARGET_ADDR ? "  <<<< TARGET" : "";
    console.log(
      `  ${hex(row.pc)}  ${bytesHex(row.bytes).padEnd(16, " ")}  ${row.mnemonic}${marker}`
    );
  }
} else {
  console.log("Target not found in the containing block (may be in a different block).");

  // Try finding it in reachable blocks
  for (const block of reachableBlocks) {
    const idx = block.instrs.findIndex((r) => r.pc === TARGET_ADDR);
    if (idx >= 0) {
      const contextStart = Math.max(0, idx - 15);
      const contextEnd = Math.min(block.instrs.length, idx + 5);
      console.log(`Found in block ${hex(block.start)}..${hex(block.end - 1)}:`);
      for (let i = contextStart; i < contextEnd; i++) {
        const row = block.instrs[i];
        const marker = row.pc === TARGET_ADDR ? "  <<<< TARGET" : "";
        console.log(
          `  ${hex(row.pc)}  ${bytesHex(row.bytes).padEnd(16, " ")}  ${row.mnemonic}${marker}`
        );
      }
      break;
    }
  }
}

console.log();

// -----------------------------------------------------------------------
// 7. Summary
// -----------------------------------------------------------------------

console.log("=".repeat(88));
console.log("7. Summary");
console.log("=".repeat(88));
console.log(`- Target instruction at ${hex(TARGET_ADDR)}: ${instAt.mnemonic}`);
console.log(`- Containing function entry: ${hex(containingEntry)}`);
console.log(`- Containing function range: ${hex(funcStart)}..${hex(funcEnd - 1)}`);
console.log(`- Function size: ${funcEnd - funcStart} bytes`);
console.log(`- Reachable blocks: ${reachableBlocks.length}`);
console.log(`- Total callers found for entry + related targets: ${callers.length}`);

// Classify the callers
const callersOfEntry = callers.filter((c) => c.target === containingEntry);
const callersOfTarget = callers.filter((c) => c.target === TARGET_ADDR);
console.log(`- Direct callers of entry ${hex(containingEntry)}: ${callersOfEntry.length}`);
console.log(`- Direct callers of ${hex(TARGET_ADDR)} itself: ${callersOfTarget.length}`);

// Note which known entries are in range
for (const known of [0x02FE73, 0x02FE84, 0x02FEAB, 0x02FF8A]) {
  const inFunc =
    known >= funcStart && known < funcEnd ? "YES - inside function" : "no - outside";
  console.log(`- Known entry ${hex(known)}: ${inFunc}`);
}
