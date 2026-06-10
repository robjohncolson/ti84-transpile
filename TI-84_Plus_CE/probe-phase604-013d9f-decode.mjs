#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, "ROM.rom");
const rom = fs.readFileSync(romPath);

const ranges = [
  { name: "Hit #2 divergence: 0x013D9F", addr: 0x013d9f, len: 0x40 },
  { name: "0x0059E9 context helper", addr: 0x0059e9, len: 0x20 },
  { name: "0x0059F3 context helper", addr: 0x0059f3, len: 0x20 },
  { name: "0x001C55 context-loop entry", addr: 0x001c55, len: 0x20 },
  { name: "Hit #1 divergence: 0x048BFB", addr: 0x048bfb, len: 0x20 },
];

const r8 = (addr) => rom[addr] ?? 0;
const u8 = (addr) => r8(addr).toString(16).padStart(2, "0").toUpperCase();
const s8 = (value) => (value & 0x80 ? value - 0x100 : value);
const hex16 = (value) => `0x${(value & 0xffff).toString(16).padStart(4, "0").toUpperCase()}`;
const hex24 = (value) => `0x${(value & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
const addr24 = (addr) => r8(addr) | (r8(addr + 1) << 8) | (r8(addr + 2) << 16);
const rel = (pc, disp) => (pc + 2 + s8(disp)) & 0xffffff;

function bytes(addr, size) {
  return Array.from({ length: size }, (_, i) => u8(addr + i)).join(" ");
}

function ixiy(op) {
  return op === 0xdd ? "IX" : "IY";
}

function decodeCb(addr) {
  const op = r8(addr + 1);
  const bit = (op >> 3) & 7;
  const reg = op & 7;
  if ((op & 0xc0) === 0x40) {
    return { size: 2, text: `BIT ${bit},${["B", "C", "D", "E", "H", "L", "(HL)", "A"][reg]}`, flags: ["flag-check"] };
  }
  return { size: 2, text: `CB ${u8(addr + 1)}`, flags: [] };
}

function decodeIndexedCb(addr, prefix) {
  const disp = r8(addr + 2);
  const op = r8(addr + 3);
  const bit = (op >> 3) & 7;
  const index = ixiy(prefix);
  if ((op & 0xc7) === 0x46) {
    return { size: 4, text: `BIT ${bit},(${index}${s8(disp) < 0 ? "" : "+"}${s8(disp)})`, flags: ["flag-check"] };
  }
  return { size: 4, text: `${index} CB ${u8(addr + 2)} ${u8(addr + 3)}`, flags: [] };
}

function decode(addr) {
  const op = r8(addr);
  switch (op) {
    case 0x00: return { size: 1, text: "NOP", flags: [] };
    case 0x01: return { size: 3, text: `LD BC,${hex16(r8(addr + 1) | (r8(addr + 2) << 8))}`, flags: [] };
    case 0x06: return { size: 2, text: `LD B,0x${u8(addr + 1)}`, flags: [] };
    case 0x0e: return { size: 2, text: `LD C,0x${u8(addr + 1)}`, flags: [] };
    case 0x11: return { size: 4, text: `LD DE,${hex24(addr24(addr + 1))}`, flags: [] };
    case 0x18: return { size: 2, text: `JR ${hex24(rel(addr, r8(addr + 1)))}`, flags: ["branch"] };
    case 0x20: return { size: 2, text: `JR NZ,${hex24(rel(addr, r8(addr + 1)))}`, flags: ["branch", "flag-check"] };
    case 0x21: return { size: 4, text: `LD HL,${hex24(addr24(addr + 1))}`, flags: [] };
    case 0x28: return { size: 2, text: `JR Z,${hex24(rel(addr, r8(addr + 1)))}`, flags: ["branch", "flag-check"] };
    case 0x30: return { size: 2, text: `JR NC,${hex24(rel(addr, r8(addr + 1)))}`, flags: ["branch", "flag-check"] };
    case 0x38: return { size: 2, text: `JR C,${hex24(rel(addr, r8(addr + 1)))}`, flags: ["branch", "flag-check"] };
    case 0x3a: return { size: 4, text: `LD A,(${hex24(addr24(addr + 1))})`, flags: [] };
    case 0x3e: return { size: 2, text: `LD A,0x${u8(addr + 1)}`, flags: [] };
    case 0xc0: return { size: 1, text: "RET NZ", flags: ["return", "flag-check"] };
    case 0xc1: return { size: 1, text: "POP BC", flags: [] };
    case 0xc3: return { size: 4, text: `JP ${hex24(addr24(addr + 1))}`, flags: ["jump"] };
    case 0xc5: return { size: 1, text: "PUSH BC", flags: [] };
    case 0xc8: return { size: 1, text: "RET Z", flags: ["return", "flag-check"] };
    case 0xc9: return { size: 1, text: "RET", flags: ["return"] };
    case 0xcb: return decodeCb(addr);
    case 0xcd: return { size: 4, text: `CALL ${hex24(addr24(addr + 1))}`, flags: ["call"] };
    case 0xd1: return { size: 1, text: "POP DE", flags: [] };
    case 0xd5: return { size: 1, text: "PUSH DE", flags: [] };
    case 0xdd:
    case 0xfd:
      if (r8(addr + 1) === 0xcb) return decodeIndexedCb(addr, op);
      return { size: 2, text: `${ixiy(op)} prefix ${u8(addr + 1)}`, flags: [] };
    case 0xe1: return { size: 1, text: "POP HL", flags: [] };
    case 0xe5: return { size: 1, text: "PUSH HL", flags: [] };
    case 0xf1: return { size: 1, text: "POP AF", flags: [] };
    case 0xf5: return { size: 1, text: "PUSH AF", flags: [] };
    case 0xfe: return { size: 2, text: `CP A,0x${u8(addr + 1)}`, flags: ["flag-check"] };
    default: return { size: 1, text: `DB 0x${u8(addr)}`, flags: [] };
  }
}

console.log(`ROM: ${romPath}`);
console.log(`Size: ${rom.length} bytes`);

for (const range of ranges) {
  const end = range.addr + range.len;
  const refs = [];
  console.log(`\n=== ${range.name} (${hex24(range.addr)}..${hex24(end - 1)}) ===`);
  for (let pc = range.addr; pc < end;) {
    const ins = decode(pc);
    const raw = bytes(pc, Math.min(ins.size, end - pc)).padEnd(12);
    const tags = ins.flags.length ? ` ; ${ins.flags.join(", ")}` : "";
    console.log(`${hex24(pc)}  ${raw}  ${ins.text}${tags}`);
    const target = ins.text.match(/\b(?:CALL|JP|JR(?: NZ| Z| NC| C)?)\s+(0x[0-9A-F]+)/);
    if (target) refs.push(`${hex24(pc)} ${ins.text}`);
    pc += Math.max(1, ins.size);
  }
  if (refs.length) {
    console.log("Targets:");
    for (const ref of refs) console.log(`  - ${ref}`);
  }
}
