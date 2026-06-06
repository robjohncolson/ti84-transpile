// Phase 534 probe: decode 0x068640 type -> dimension fallback.
//
// Findings to confirm from the printed disassembly:
// - Entry: 0x068640, with surrounding context from 0x068620 through the bytes
//   after the routine.
// - Watch for OP1 type reads from 0xD005F8 via `LD A,(D005F8)`.
// - Watch for `AND 3F` masking of type sign bits before comparisons.
// - Type comparisons of interest:
//   00 = real, 0C = complex, 18 = real variant, 1C = matrix, 1D = list,
//   20 = equation, 21 = string.
// - CALL and JP targets are annotated inline by the disassembler. Session 531
//   identified nearby dispatcher targets 0x07CFA7 and 0x07CF1A; this probe is
//   intended to identify whether 0x068640 falls back to list/real dimension
//   handlers or delegates to those same dimension helpers.
//
// This is a raw ROM disassembly probe only; it does not execute CPU state.

import fs from "node:fs";
import path from "node:path";

const ROM_PATH = path.join("TI-84_Plus_CE", "ROM.rom");
const CONTEXT_START = 0x068620;
const ENTRY = 0x068640;
const MIN_READ = 0x100;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function addr24(value) {
  return `0x${hex(value & 0xffffff, 6)}`;
}

function byteAt(addr) {
  if (addr < 0 || addr >= rom.length) {
    throw new RangeError(`ROM address out of range: ${addr24(addr)}`);
  }
  return rom[addr];
}

function read24(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function rawBytes(addr, len) {
  const out = [];
  for (let i = 0; i < len; i += 1) out.push(hex(byteAt(addr + i)));
  return out.join(" ");
}

function typeName(value) {
  const names = new Map([
    [0x00, "Real"],
    [0x0c, "Complex"],
    [0x18, "Real variant"],
    [0x1c, "Matrix"],
    [0x1d, "List"],
    [0x20, "Equation"],
    [0x21, "String"],
  ]);
  return names.get(value) ?? null;
}

function annotate(mnemonic, operands) {
  const text = `${mnemonic} ${operands}`.trim();
  const cpMatch = text.match(/^CP 0x([0-9A-F]{2})$/);
  if (cpMatch) {
    const value = Number.parseInt(cpMatch[1], 16);
    const name = typeName(value);
    return name ? `; type ${name}` : "";
  }
  if (text.includes("0xD005F8")) return "; OP1 type byte";
  if (text === "AND 0x3F") return "; mask type flags";
  if (/^(CALL|JP|JR)/.test(text)) return "; control transfer";
  return "";
}

function decode(addr) {
  const op = byteAt(addr);

  if (op === 0x00) return { len: 1, mnemonic: "NOP", operands: "" };
  if (op === 0x01) return { len: 4, mnemonic: "LD", operands: `BC,${addr24(read24(addr + 1))}` };
  if (op === 0x06) return { len: 2, mnemonic: "LD", operands: `B,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x0e) return { len: 2, mnemonic: "LD", operands: `C,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x11) return { len: 4, mnemonic: "LD", operands: `DE,${addr24(read24(addr + 1))}` };
  if (op === 0x16) return { len: 2, mnemonic: "LD", operands: `D,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x18) return { len: 2, mnemonic: "JR", operands: rel8(addr, byteAt(addr + 1)) };
  if (op === 0x1e) return { len: 2, mnemonic: "LD", operands: `E,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x20) return { len: 2, mnemonic: "JR NZ", operands: rel8(addr, byteAt(addr + 1)) };
  if (op === 0x21) return { len: 4, mnemonic: "LD", operands: `HL,${addr24(read24(addr + 1))}` };
  if (op === 0x26) return { len: 2, mnemonic: "LD", operands: `H,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x28) return { len: 2, mnemonic: "JR Z", operands: rel8(addr, byteAt(addr + 1)) };
  if (op === 0x2e) return { len: 2, mnemonic: "LD", operands: `L,0x${hex(byteAt(addr + 1))}` };
  if (op === 0x30) return { len: 2, mnemonic: "JR NC", operands: rel8(addr, byteAt(addr + 1)) };
  if (op === 0x32) return { len: 4, mnemonic: "LD", operands: `(${addr24(read24(addr + 1))}),A` };
  if (op === 0x38) return { len: 2, mnemonic: "JR C", operands: rel8(addr, byteAt(addr + 1)) };
  if (op === 0x3a) return { len: 4, mnemonic: "LD", operands: `A,(${addr24(read24(addr + 1))})` };
  if (op === 0x3e) return { len: 2, mnemonic: "LD", operands: `A,0x${hex(byteAt(addr + 1))}` };

  if (op >= 0x40 && op <= 0x7f) {
    const regs = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
    if (op === 0x76) return { len: 1, mnemonic: "HALT", operands: "" };
    return {
      len: 1,
      mnemonic: "LD",
      operands: `${regs[(op >> 3) & 7]},${regs[op & 7]}`,
    };
  }

  const single = new Map([
    [0x02, ["LD", "(BC),A"]],
    [0x03, ["INC", "BC"]],
    [0x04, ["INC", "B"]],
    [0x05, ["DEC", "B"]],
    [0x07, ["RLCA", ""]],
    [0x08, ["EX", "AF,AF'"]],
    [0x09, ["ADD", "HL,BC"]],
    [0x0a, ["LD", "A,(BC)"]],
    [0x0b, ["DEC", "BC"]],
    [0x0c, ["INC", "C"]],
    [0x0d, ["DEC", "C"]],
    [0x0f, ["RRCA", ""]],
    [0x12, ["LD", "(DE),A"]],
    [0x13, ["INC", "DE"]],
    [0x14, ["INC", "D"]],
    [0x15, ["DEC", "D"]],
    [0x17, ["RLA", ""]],
    [0x19, ["ADD", "HL,DE"]],
    [0x1a, ["LD", "A,(DE)"]],
    [0x1b, ["DEC", "DE"]],
    [0x1c, ["INC", "E"]],
    [0x1d, ["DEC", "E"]],
    [0x1f, ["RRA", ""]],
    [0x22, ["LD", `(${addr24(read24(addr + 1))}),HL`, 4]],
    [0x23, ["INC", "HL"]],
    [0x24, ["INC", "H"]],
    [0x25, ["DEC", "H"]],
    [0x27, ["DAA", ""]],
    [0x29, ["ADD", "HL,HL"]],
    [0x2a, ["LD", `HL,(${addr24(read24(addr + 1))})`, 4]],
    [0x2b, ["DEC", "HL"]],
    [0x2c, ["INC", "L"]],
    [0x2d, ["DEC", "L"]],
    [0x2f, ["CPL", ""]],
    [0x31, ["LD", `SP,${addr24(read24(addr + 1))}`, 4]],
    [0x33, ["INC", "SP"]],
    [0x34, ["INC", "(HL)"]],
    [0x35, ["DEC", "(HL)"]],
    [0x37, ["SCF", ""]],
    [0x39, ["ADD", "HL,SP"]],
    [0x3b, ["DEC", "SP"]],
    [0x3c, ["INC", "A"]],
    [0x3d, ["DEC", "A"]],
    [0x3f, ["CCF", ""]],
    [0xc0, ["RET NZ", ""]],
    [0xc8, ["RET Z", ""]],
    [0xc9, ["RET", ""]],
    [0xd0, ["RET NC", ""]],
    [0xd8, ["RET C", ""]],
    [0xe9, ["JP", "(HL)"]],
    [0xf9, ["LD", "SP,HL"]],
  ]);
  if (single.has(op)) {
    const [mnemonic, operands, len = 1] = single.get(op);
    return { len, mnemonic, operands };
  }

  if (op >= 0x80 && op <= 0xbf) {
    const groups = ["ADD A", "ADC A", "SUB", "SBC A", "AND", "XOR", "OR", "CP"];
    const regs = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
    return { len: 1, mnemonic: groups[(op >> 3) & 7], operands: regs[op & 7] };
  }

  const imm8 = new Map([
    [0xc6, ["ADD A"]],
    [0xce, ["ADC A"]],
    [0xd3, ["OUT"]],
    [0xd6, ["SUB"]],
    [0xdb, ["IN A"]],
    [0xde, ["SBC A"]],
    [0xe6, ["AND"]],
    [0xee, ["XOR"]],
    [0xf6, ["OR"]],
    [0xfe, ["CP"]],
  ]);
  if (imm8.has(op)) {
    return {
      len: 2,
      mnemonic: imm8.get(op)[0],
      operands: `0x${hex(byteAt(addr + 1))}`,
    };
  }

  const jumps = new Map([
    [0xc2, "JP NZ"],
    [0xc3, "JP"],
    [0xca, "JP Z"],
    [0xcd, "CALL"],
    [0xd2, "JP NC"],
    [0xd4, "CALL NC"],
    [0xda, "JP C"],
    [0xdc, "CALL C"],
    [0xe2, "JP PO"],
    [0xe4, "CALL PO"],
    [0xea, "JP PE"],
    [0xec, "CALL PE"],
    [0xf2, "JP P"],
    [0xf4, "CALL P"],
    [0xfa, "JP M"],
    [0xfc, "CALL M"],
  ]);
  if (jumps.has(op)) {
    return { len: 4, mnemonic: jumps.get(op), operands: addr24(read24(addr + 1)) };
  }

  return { len: 1, mnemonic: `DB 0x${hex(op)}`, operands: "" };
}

function rel8(addr, value) {
  const signed = value & 0x80 ? value - 0x100 : value;
  return addr24(addr + 2 + signed);
}

function disassemble(start, minBytes) {
  let addr = start;
  const end = start + minBytes;
  const rows = [];
  while (addr < end || (start <= ENTRY && addr <= ENTRY + 4)) {
    const ins = decode(addr);
    rows.push({ addr, ...ins });
    addr += ins.len;
  }
  return rows;
}

const rows = disassemble(CONTEXT_START, MIN_READ);
const entryIndex = rows.findIndex((row) => row.addr >= ENTRY);

console.log("Phase 534: decode 0x068640 type -> dimension fallback");
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Context: ${addr24(CONTEXT_START)}..${addr24(CONTEXT_START + MIN_READ - 1)}`);
console.log("");

for (const row of rows) {
  const marker = row.addr === ENTRY ? "=>" : "  ";
  const raw = rawBytes(row.addr, row.len).padEnd(12, " ");
  const asm = `${row.mnemonic}${row.operands ? ` ${row.operands}` : ""}`.padEnd(24, " ");
  console.log(`${marker} ${addr24(row.addr)}  ${raw}  ${asm} ${annotate(row.mnemonic, row.operands)}`);
}

console.log("");
console.log("Summary checklist:");
console.log("- Inspect lines marked `OP1 type byte` for direct reads from 0xD005F8.");
console.log("- Inspect `CP` annotations for handled type codes.");
console.log("- Inspect `CALL`/`JP` annotations for fallback helper targets.");
console.log(`- Entry row index in this context: ${entryIndex}`);
