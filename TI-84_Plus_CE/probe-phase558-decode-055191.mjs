import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, "ROM.rom"));

const START = 0x055191;
const MAX_SCAN = 0x100;
const END = Math.min(rom.length, START + MAX_SCAN);

const calls = new Set();
const ramRefs = new Set();
const mmioRefs = new Set();
const iyOps = [];
const branches = [];

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function b(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function fmtBytes(addr, len) {
  return Array.from({ length: len }, (_, i) => b(addr + i).toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function addAbsRef(value) {
  if (value >= 0xE00000) mmioRefs.add(value);
  else if (value >= 0xD00000) ramRefs.add(value);
}

function relTarget(addr, len, disp) {
  return (addr + len + s8(disp)) & 0xFFFFFF;
}

function reg8(index) {
  return ["B", "C", "D", "E", "H", "L", "(HL)", "A"][index];
}

function reg16(index) {
  return ["BC", "DE", "HL", "SP"][index];
}

function cc(index) {
  return ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"][index];
}

function alu(index) {
  return ["ADD A,", "ADC A,", "SUB", "SBC A,", "AND", "XOR", "OR", "CP"][index];
}

function decodeEd(addr) {
  const op = b(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  const block = {
    0xA0: "LDI", 0xA1: "CPI", 0xA2: "INI", 0xA3: "OUTI",
    0xA8: "LDD", 0xA9: "CPD", 0xAA: "IND", 0xAB: "OUTD",
    0xB0: "LDIR", 0xB1: "CPIR", 0xB2: "INIR", 0xB3: "OTIR",
    0xB8: "LDDR", 0xB9: "CPDR", 0xBA: "INDR", 0xBB: "OTDR",
  };
  if (block[op]) return { len: 2, text: block[op] };

  if (x === 1 && z === 0) return { len: 2, text: y === 6 ? "IN (C)" : `IN ${reg8(y)},(C)` };
  if (x === 1 && z === 1) return { len: 2, text: y === 6 ? "OUT (C),0" : `OUT (C),${reg8(y)}` };
  if (x === 1 && z === 2) return { len: 2, text: `${q ? "ADC" : "SBC"} HL,${reg16(p)}` };
  if (x === 1 && z === 3) {
    const imm = u24(addr + 2);
    addAbsRef(imm);
    return { len: 5, text: q ? `LD ${reg16(p)},(${hex(imm, 6)})` : `LD (${hex(imm, 6)}),${reg16(p)}` };
  }
  if (x === 1 && z === 4) return { len: 2, text: "NEG" };
  if (x === 1 && z === 5) return { len: 2, text: op === 0x45 ? "RETN" : "RETI" };
  if (x === 1 && z === 6) return { len: 2, text: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
  if (x === 1 && z === 7) return { len: 2, text: ["LD I,A", "LD R,A", "LD A,I", "LD A,R", "RRD", "RLD", "NOP?", "NOP?"][y] };

  return { len: 2, text: `DB EDh, ${hex(op, 2).slice(2)}h` };
}

function decodeIndex(addr, prefix, name) {
  const op = b(addr + 1);
  if (op === 0xCB) {
    const disp = s8(b(addr + 2));
    const cb = b(addr + 3);
    const bitOp = cb >> 6;
    const bit = (cb >> 3) & 7;
    const target = `${name}${disp < 0 ? "" : "+"}${disp}`;
    const text = bitOp === 1 ? `BIT ${bit},(${target})` : bitOp === 2 ? `RES ${bit},(${target})` : bitOp === 3 ? `SET ${bit},(${target})` : `ROT/SHIFT ${hex(cb, 2)},(${target})`;
    const rec = { addr, text };
    if (prefix === 0xFD) iyOps.push(rec);
    return { len: 4, text };
  }

  const pair = name;
  const high = `${name}H`;
  const low = `${name}L`;
  const r = (idx) => idx === 4 ? high : idx === 5 ? low : idx === 6 ? `(${name}${s8(b(addr + 2)) < 0 ? "" : "+"}${s8(b(addr + 2))})` : reg8(idx);
  let len = 2;
  let text = null;

  if (op === 0x21) { len = 5; text = `LD ${pair},${hex(u24(addr + 2), 6)}`; }
  else if (op === 0x22) { len = 5; const imm = u24(addr + 2); addAbsRef(imm); text = `LD (${hex(imm, 6)}),${pair}`; }
  else if (op === 0x2A) { len = 5; const imm = u24(addr + 2); addAbsRef(imm); text = `LD ${pair},(${hex(imm, 6)})`; }
  else if (op === 0x23) text = `INC ${pair}`;
  else if (op === 0x2B) text = `DEC ${pair}`;
  else if (op === 0x29) text = `ADD ${pair},${pair}`;
  else if (op === 0x39) text = `ADD ${pair},SP`;
  else if (op === 0xE1) text = `POP ${pair}`;
  else if (op === 0xE3) text = `EX (SP),${pair}`;
  else if (op === 0xE5) text = `PUSH ${pair}`;
  else if (op === 0xE9) text = `JP (${pair})`;
  else if (op === 0xF9) text = `LD SP,${pair}`;
  else if ((op & 0xC7) === 0x04) text = `INC ${r((op >> 3) & 7)}`;
  else if ((op & 0xC7) === 0x05) text = `DEC ${r((op >> 3) & 7)}`;
  else if ((op & 0xC7) === 0x06) { len = ((op >> 3) & 7) === 6 ? 4 : 3; text = `LD ${r((op >> 3) & 7)},${hex(b(addr + len - 1), 2)}`; }
  else if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    len = dst === 6 || src === 6 ? 3 : 2;
    text = `LD ${r(dst)},${r(src)}`;
  } else if (op >= 0x80 && op <= 0xBF) {
    const src = op & 7;
    len = src === 6 ? 3 : 2;
    text = `${alu((op >> 3) & 7)} ${r(src)}`;
  }

  if (!text) text = `DB ${hex(prefix, 2).slice(2)}h, ${hex(op, 2).slice(2)}h`;
  if (prefix === 0xFD) iyOps.push({ addr, text });
  return { len, text };
}

function decode(addr) {
  const op = b(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xDD) return decodeIndex(addr, op, "IX");
  if (op === 0xFD) return decodeIndex(addr, op, "IY");
  if (op === 0xED) return decodeEd(addr);
  if (op === 0xCB) return { len: 2, text: `CB ${hex(b(addr + 1), 2)}` };

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, text: "NOP" };
      if (y === 1) return { len: 5, text: `EX AF,AF'` };
      if (y === 2) { const t = relTarget(addr, 2, b(addr + 1)); branches.push({ addr, target: t, text: "DJNZ" }); return { len: 2, text: `DJNZ ${hex(t, 6)}` }; }
      if (y === 3) { const t = relTarget(addr, 2, b(addr + 1)); branches.push({ addr, target: t, text: "JR" }); return { len: 2, text: `JR ${hex(t, 6)}` }; }
      const t = relTarget(addr, 2, b(addr + 1)); branches.push({ addr, target: t, text: `JR ${cc(y - 4)}` }); return { len: 2, text: `JR ${cc(y - 4)},${hex(t, 6)}` };
    }
    if (z === 1) return q ? { len: 1, text: `ADD HL,${reg16(p)}` } : { len: 4, text: `LD ${reg16(p)},${hex(u24(addr + 1), 6)}` };
    if (z === 2) {
      if (p === 0) return q ? { len: 1, text: "LD A,(BC)" } : { len: 1, text: "LD (BC),A" };
      if (p === 1) return q ? { len: 1, text: "LD A,(DE)" } : { len: 1, text: "LD (DE),A" };
      const imm = u24(addr + 1);
      addAbsRef(imm);
      return { len: 4, text: q ? `LD HL,(${hex(imm, 6)})` : `LD (${hex(imm, 6)}),HL` };
    }
    if (z === 3) return { len: 1, text: `${q ? "DEC" : "INC"} ${reg16(p)}` };
    if (z === 4) return { len: 1, text: `INC ${reg8(y)}` };
    if (z === 5) return { len: 1, text: `DEC ${reg8(y)}` };
    if (z === 6) return { len: 2, text: `LD ${reg8(y)},${hex(b(addr + 1), 2)}` };
    return { len: 1, text: ["RLCA", "RRCA", "RLA", "RRA", "DAA", "CPL", "SCF", "CCF"][y] };
  }

  if (x === 1) return { len: 1, text: op === 0x76 ? "HALT" : `LD ${reg8(y)},${reg8(z)}` };

  if (x === 2) return { len: 1, text: `${alu(y)} ${reg8(z)}` };

  if (z === 0) return { len: 1, text: `RET ${cc(y)}` };
  if (z === 1) return q ? { len: 1, text: ["RET", "EXX", "JP HL", "LD SP,HL"][p] } : { len: 1, text: `POP ${["BC", "DE", "HL", "AF"][p]}` };
  if (z === 2) { const t = u24(addr + 1); branches.push({ addr, target: t, text: `JP ${cc(y)}` }); return { len: 4, text: `JP ${cc(y)},${hex(t, 6)}` }; }
  if (z === 3) {
    if (y === 0) { const t = u24(addr + 1); branches.push({ addr, target: t, text: "JP" }); return { len: 4, text: `JP ${hex(t, 6)}` }; }
    if (y === 2) { const t = u24(addr + 1); branches.push({ addr, target: t, text: "OUT" }); addAbsRef(t); return { len: 4, text: `OUT (${hex(t, 6)}),A` }; }
    if (y === 3) { const t = u24(addr + 1); branches.push({ addr, target: t, text: "IN" }); addAbsRef(t); return { len: 4, text: `IN A,(${hex(t, 6)})` }; }
    return { len: 1, text: ["", "", "", "", "EX (SP),HL", "EX DE,HL", "DI", "EI"][y] };
  }
  if (z === 4) { const t = u24(addr + 1); calls.add(t); branches.push({ addr, target: t, text: `CALL ${cc(y)}` }); return { len: 4, text: `CALL ${cc(y)},${hex(t, 6)}` }; }
  if (z === 5) {
    if (q) { const t = u24(addr + 1); calls.add(t); branches.push({ addr, target: t, text: "CALL" }); return { len: 4, text: `CALL ${hex(t, 6)}` }; }
    return { len: 1, text: `PUSH ${["BC", "DE", "HL", "AF"][p]}` };
  }
  if (z === 6) return { len: 2, text: `${alu(y)} ${hex(b(addr + 1), 2)}` };
  return { len: 1, text: `RST ${hex(y * 8, 2)}` };
}

console.log(`DECODE ${hex(START, 6)} shared BPP init helper`);
console.log(`ROM size: ${rom.length} bytes`);
console.log("");

let pc = START;
let count = 0;
while (pc < END) {
  const ins = decode(pc);
  console.log(`${hex(pc, 6)}  ${fmtBytes(pc, ins.len).padEnd(15)}  ${ins.text}`);
  pc += ins.len;
  count += 1;
  if (ins.text === "RET") break;
}

console.log("");
console.log("Summary");
console.log(`  Instructions: ${count}`);
console.log(`  Bytes scanned: ${hex(pc - START, 3)} (${pc - START})`);
console.log(`  End address: ${hex(pc, 6)}`);
console.log(`  CALL targets: ${[...calls].sort((a, b) => a - b).map((x) => hex(x, 6)).join(", ") || "(none)"}`);
console.log(`  RAM refs >= D00000: ${[...ramRefs].sort((a, b) => a - b).map((x) => hex(x, 6)).join(", ") || "(none)"}`);
console.log(`  MMIO refs >= E00000: ${[...mmioRefs].sort((a, b) => a - b).map((x) => hex(x, 6)).join(", ") || "(none)"}`);
console.log(`  IY-relative/index ops: ${iyOps.length ? "" : "(none)"}`);
for (const op of iyOps) console.log(`    ${hex(op.addr, 6)} ${op.text}`);
console.log(`  JP/JR branches: ${branches.length ? "" : "(none)"}`);
for (const branch of branches) console.log(`    ${hex(branch.addr, 6)} ${branch.text} -> ${hex(branch.target, 6)}`);
