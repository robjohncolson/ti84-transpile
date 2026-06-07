#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, "ROM.rom");

const BASE = 0x0a1799;
const START = BASE + 128;
const LENGTH = 220;

const rom = fs.readFileSync(romPath);
const end = Math.min(START + LENGTH, rom.length);
const bytes = rom.subarray(START, end);

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, "0");
const s8 = (n) => (n & 0x80 ? n - 0x100 : n);
const u16 = (off) => rom[off] | (rom[off + 1] << 8);
const u24 = (off) => rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
const relTarget = (pc, size, disp) => (pc + size + s8(disp)) & 0xffffff;
const b = (pc, i = 0) => rom[pc + i] ?? 0;
const byteList = (pc, len) =>
  Array.from(rom.subarray(pc, Math.min(pc + len, rom.length)), hex2).join(" ");

const calls = [];
const jumps = [];
const ramRefs = [];
const loopBranches = [];
const iyRefs = [];

function recordRam(addr, pc, text) {
  if (addr >= 0xd00000) ramRefs.push({ pc, addr, text });
}

function reg8(code) {
  return ["B", "C", "D", "E", "H", "L", "(HL)", "A"][code];
}

function reg16(code) {
  return ["BC", "DE", "HL", "SP"][code];
}

function cc(code) {
  return ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"][code];
}

function decodeCb(pc) {
  const op = b(pc + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
  if (x === 0) return { size: 2, text: `${ops[y]} ${reg8(z)}` };
  if (x === 1) return { size: 2, text: `BIT ${y},${reg8(z)}` };
  if (x === 2) return { size: 2, text: `RES ${y},${reg8(z)}` };
  return { size: 2, text: `SET ${y},${reg8(z)}` };
}

function decodeEd(pc) {
  const op = b(pc + 1);
  const nn = u16(pc + 2);
  const nnn = u24(pc + 2);
  const y = (op >> 3) & 7;
  const z = op & 7;

  if ((op & 0xcf) === 0x4b) {
    const text = `LD ${reg16((op >> 4) & 3)},($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if ((op & 0xcf) === 0x43) {
    const text = `LD ($${hex6(nnn)}),${reg16((op >> 4) & 3)}`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x5b) {
    const text = `LD DE,($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x53) {
    const text = `LD ($${hex6(nnn)}),DE`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x6b) {
    const text = `LD HL,($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x63) {
    const text = `LD ($${hex6(nnn)}),HL`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x73) {
    const text = `LD ($${hex6(nnn)}),SP`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }
  if (op === 0x7b) {
    const text = `LD SP,($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 5, text };
  }

  const single = {
    0x44: "NEG",
    0x45: "RETN",
    0x46: "IM 0",
    0x47: "LD I,A",
    0x4d: "RETI",
    0x4f: "LD R,A",
    0x56: "IM 1",
    0x57: "LD A,I",
    0x5e: "IM 2",
    0x5f: "LD A,R",
    0x67: "RRD",
    0x6f: "RLD",
    0xa0: "LDI",
    0xa1: "CPI",
    0xa2: "INI",
    0xa3: "OUTI",
    0xa8: "LDD",
    0xa9: "CPD",
    0xaa: "IND",
    0xab: "OUTD",
    0xb0: "LDIR",
    0xb1: "CPIR",
    0xb2: "INIR",
    0xb3: "OTIR",
    0xb8: "LDDR",
    0xb9: "CPDR",
    0xba: "INDR",
    0xbb: "OTDR",
  };
  if (single[op]) return { size: 2, text: single[op] };
  if ((op & 0xc7) === 0x40) return { size: 2, text: `IN ${reg8(y)},(C)` };
  if ((op & 0xc7) === 0x41) return { size: 2, text: `OUT (C),${reg8(y)}` };
  if ((op & 0xcf) === 0x42) return { size: 2, text: `SBC HL,${reg16((op >> 4) & 3)}` };
  if ((op & 0xcf) === 0x4a) return { size: 2, text: `ADC HL,${reg16((op >> 4) & 3)}` };
  if ((op & 0xc7) === 0x48) return { size: 2, text: `IN0 ${reg8(y)},($${hex2(b(pc + 2))})` };
  if ((op & 0xc7) === 0x49) return { size: 3, text: `OUT0 ($${hex2(b(pc + 2))}),${reg8(y)}` };
  return { size: 2, text: `ED $${hex2(op)}` };
}

function decodeIndex(pc, prefix, name) {
  const op = b(pc + 1);
  const nn = u16(pc + 2);
  const nnn = u24(pc + 2);
  const disp = s8(b(pc + 2));
  const dispText = disp < 0 ? `-${hex2(-disp)}` : `+${hex2(disp)}`;
  const mem = `(${name}${dispText})`;

  const direct = {
    0x09: `ADD ${name},BC`,
    0x19: `ADD ${name},DE`,
    0x21: `LD ${name},$${hex6(nnn)}`,
    0x22: `LD ($${hex6(nnn)}),${name}`,
    0x23: `INC ${name}`,
    0x29: `ADD ${name},${name}`,
    0x2a: `LD ${name},($${hex6(nnn)})`,
    0x2b: `DEC ${name}`,
    0x34: `INC ${mem}`,
    0x35: `DEC ${mem}`,
    0x36: `LD ${mem},$${hex2(b(pc + 3))}`,
    0x39: `ADD ${name},SP`,
    0xe1: `POP ${name}`,
    0xe3: `EX (SP),${name}`,
    0xe5: `PUSH ${name}`,
    0xe9: `JP (${name})`,
    0xf9: `LD SP,${name}`,
  };

  const sizes = {
    0x09: 2,
    0x19: 2,
    0x21: 5,
    0x22: 5,
    0x23: 2,
    0x29: 2,
    0x2a: 5,
    0x2b: 2,
    0x34: 3,
    0x35: 3,
    0x36: 4,
    0x39: 2,
    0xe1: 2,
    0xe3: 2,
    0xe5: 2,
    0xe9: 2,
    0xf9: 2,
  };

  if (op === 0xcb) {
    const cbop = b(pc + 3);
    const x = cbop >> 6;
    const y = (cbop >> 3) & 7;
    const z = cbop & 7;
    const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
    const target = z === 6 ? mem : `${mem}->${reg8(z)}`;
    if (name === "IY") iyRefs.push({ pc, disp, text: `indexed bit op ${target}` });
    if (x === 0) return { size: 4, text: `${ops[y]} ${target}` };
    if (x === 1) return { size: 4, text: `BIT ${y},${mem}` };
    if (x === 2) return { size: 4, text: `RES ${y},${target}` };
    return { size: 4, text: `SET ${y},${target}` };
  }

  if (direct[op]) {
    const text = direct[op];
    if (text.includes("(IY")) iyRefs.push({ pc, disp, text });
    if (op === 0x22 || op === 0x2a) recordRam(nnn, pc, text);
    return { size: sizes[op], text };
  }

  if ((op & 0xc7) === 0x46) {
    const text = `LD ${reg8((op >> 3) & 7)},${mem}`;
    if (name === "IY") iyRefs.push({ pc, disp, text });
    return { size: 3, text };
  }
  if ((op & 0xf8) === 0x70) {
    const text = `LD ${mem},${reg8(op & 7)}`;
    if (name === "IY") iyRefs.push({ pc, disp, text });
    return { size: 3, text };
  }

  return { size: 2, text: `$${hex2(prefix)} $${hex2(op)} ; ${name} prefix undecoded` };
}

function decode(pc) {
  const op = b(pc);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const nn = u16(pc + 1);
  const nnn = u24(pc + 1);

  if (op === 0xcb) return decodeCb(pc);
  if (op === 0xed) return decodeEd(pc);
  if (op === 0xdd) return decodeIndex(pc, op, "IX");
  if (op === 0xfd) return decodeIndex(pc, op, "IY");

  const one = {
    0x00: "NOP",
    0x02: "LD (BC),A",
    0x07: "RLCA",
    0x08: "EX AF,AF'",
    0x0a: "LD A,(BC)",
    0x0f: "RRCA",
    0x12: "LD (DE),A",
    0x17: "RLA",
    0x1a: "LD A,(DE)",
    0x1f: "RRA",
    0x27: "DAA",
    0x2f: "CPL",
    0x37: "SCF",
    0x3f: "CCF",
    0x76: "HALT",
    0xc9: "RET",
    0xd9: "EXX",
    0xe3: "EX (SP),HL",
    0xe9: "JP (HL)",
    0xeb: "EX DE,HL",
    0xf3: "DI",
    0xf9: "LD SP,HL",
    0xfb: "EI",
  };
  if (one[op]) return { size: 1, text: one[op] };

  if (op === 0x10) {
    const target = relTarget(pc, 2, b(pc + 1));
    loopBranches.push({ pc, target, text: `DJNZ $${hex6(target)}` });
    return { size: 2, text: `DJNZ $${hex6(target)}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(pc, 2, b(pc + 1));
    const mnemonic = op === 0x18 ? "JR" : `JR ${cc(y - 4)}`;
    const text = `${mnemonic},$${hex6(target)}`;
    jumps.push({ pc, target, text });
    if (target < pc) loopBranches.push({ pc, target, text });
    return { size: 2, text };
  }
  if (op === 0xc3) {
    const text = `JP $${hex6(nnn)}`;
    jumps.push({ pc, target: nnn, text });
    return { size: 4, text };
  }
  if ((op & 0xc7) === 0xc2) {
    const text = `JP ${cc(y)},$${hex6(nnn)}`;
    jumps.push({ pc, target: nnn, text });
    return { size: 4, text };
  }
  if (op === 0xcd) {
    const text = `CALL $${hex6(nnn)}`;
    calls.push({ pc, target: nnn, text });
    return { size: 4, text };
  }
  if ((op & 0xc7) === 0xc4) {
    const text = `CALL ${cc(y)},$${hex6(nnn)}`;
    calls.push({ pc, target: nnn, text });
    return { size: 4, text };
  }
  if (op === 0x32) {
    const text = `LD ($${hex6(nnn)}),A`;
    recordRam(nnn, pc, text);
    return { size: 4, text };
  }
  if (op === 0x3a) {
    const text = `LD A,($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 4, text };
  }
  if (op === 0x22) {
    const text = `LD ($${hex6(nnn)}),HL`;
    recordRam(nnn, pc, text);
    return { size: 4, text };
  }
  if (op === 0x2a) {
    const text = `LD HL,($${hex6(nnn)})`;
    recordRam(nnn, pc, text);
    return { size: 4, text };
  }

  if (x === 0) {
    if (z === 1) return { size: q ? 1 : 3, text: q ? `ADD HL,${reg16(p)}` : `LD ${reg16(p)},$${hex4(nn)}` };
    if (z === 3) return { size: 1, text: `${q ? "DEC" : "INC"} ${reg16(p)}` };
    if (z === 4) return { size: 1, text: `INC ${reg8(y)}` };
    if (z === 5) return { size: 1, text: `DEC ${reg8(y)}` };
    if (z === 6) return { size: 2, text: `LD ${reg8(y)},$${hex2(b(pc + 1))}` };
  }
  if (x === 1) return { size: 1, text: `LD ${reg8(y)},${reg8(z)}` };
  if (x === 2) return { size: 1, text: `${["ADD A", "ADC A", "SUB", "SBC A", "AND", "XOR", "OR", "CP"][y]} ${reg8(z)}` };
  if (x === 3) {
    if (z === 0) return { size: 1, text: `RET ${cc(y)}` };
    if (z === 1) return { size: 1, text: q ? ["RET", "EXX", "JP (HL)", "LD SP,HL"][p] : `POP ${["BC", "DE", "HL", "AF"][p]}` };
    if (z === 3) return { size: 1, text: ["JP $nn", "CB prefix", "OUT ($n),A", "IN A,($n)", "EX (SP),HL", "EX DE,HL", "DI", "EI"][y] };
    if (z === 5) return { size: q ? 1 : 1, text: q ? ["CALL $nn", "DD prefix", "ED prefix", "FD prefix"][p] : `PUSH ${["BC", "DE", "HL", "AF"][p]}` };
    if (z === 6) return { size: 2, text: `${["ADD A", "ADC A", "SUB", "SBC A", "AND", "XOR", "OR", "CP"][y]} $${hex2(b(pc + 1))}` };
  }

  return { size: 1, text: `DB $${hex2(op)}` };
}

console.log("phase560 decode 0x0A1799 glyph renderer loop");
console.log(`ROM: ${romPath}`);
console.log(`Range: $${hex6(START)}..$${hex6(end - 1)} (${end - START} bytes)`);
console.log("");
console.log("Raw hex:");
for (let off = START; off < end; off += 16) {
  console.log(`${hex6(off)}: ${byteList(off, Math.min(16, end - off))}`);
}

console.log("");
console.log("Disassembly:");
let pc = START;
while (pc < end) {
  const ins = decode(pc);
  const size = Math.max(1, Math.min(ins.size, end - pc));
  console.log(`${hex6(pc)}  ${byteList(pc, size).padEnd(17)}  ${ins.text}`);
  pc += size;
}

function printRefs(title, refs, format) {
  console.log("");
  console.log(`${title}:`);
  if (!refs.length) {
    console.log("  none found in decoded window");
    return;
  }
  for (const ref of refs) console.log(`  ${format(ref)}`);
}

printRefs("CALL targets", calls, (r) => `$${hex6(r.pc)} -> $${hex6(r.target)} (${r.text})`);
printRefs("JP/JR targets", jumps, (r) => `$${hex6(r.pc)} -> $${hex6(r.target)} (${r.text})`);
printRefs("RAM references >= D00000", ramRefs, (r) => `$${hex6(r.pc)} references $${hex6(r.addr)} (${r.text})`);
printRefs("IY indexed references", iyRefs, (r) => `$${hex6(r.pc)} IY${r.disp < 0 ? "-" + hex2(-r.disp) : "+" + hex2(r.disp)} (${r.text})`);
printRefs("Likely loop branches", loopBranches, (r) => `$${hex6(r.pc)} -> $${hex6(r.target)} (${r.text})`);

console.log("");
console.log("Loop interpretation hints:");
console.log("- IY+05 is the expected BPP mode flag; indexed references above show where the branch samples it.");
console.log("- Backward JR/DJNZ entries are the row/pixel loop candidates; inspect their target blocks for framebuffer writes.");
console.log("- D0059C references identify the stored framebuffer pointer used by the renderer.");
console.log("- ADD/ADC/SBC/INC/DEC around HL/DE near loop branches indicate glyph-byte and framebuffer stride advancement.");
