import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const IY_BASE = 0xD00080;
const targets = [
  { name: 'post-render helper A', addr: 0x09CE6B, bytes: 200 },
  { name: 'post-render helper B', addr: 0x0A1F52, bytes: 200 },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function u24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function iyExpr(disp) {
  const absolute = IY_BASE + disp;
  const sign = disp < 0 ? '-' : '+';
  return `(IY${sign}${hex(Math.abs(disp), 2)}) ; ${hex(absolute)}`;
}

function ramNote(addr) {
  return addr >= 0xD00000 && addr <= 0xD3FFFF ? ` ; RAM ${hex(addr)}` : '';
}

function decode(addr) {
  const op = rom[addr];
  const op2 = rom[addr + 1];

  if (op === 0xCD) return { len: 4, text: `CALL ${hex(u24(addr + 1))}`, call: u24(addr + 1) };
  if (op === 0xC9) return { len: 1, text: 'RET', ret: true };
  if (op === 0xC0) return { len: 1, text: 'RET NZ', ret: true };
  if (op === 0xC8) return { len: 1, text: 'RET Z', ret: true };
  if (op === 0xD0) return { len: 1, text: 'RET NC', ret: true };
  if (op === 0xD8) return { len: 1, text: 'RET C', ret: true };
  if (op === 0xE0) return { len: 1, text: 'RET PO', ret: true };
  if (op === 0xE8) return { len: 1, text: 'RET PE', ret: true };
  if (op === 0xF0) return { len: 1, text: 'RET P', ret: true };
  if (op === 0xF8) return { len: 1, text: 'RET M', ret: true };

  if (op === 0xC3) return { len: 4, text: `JP ${hex(u24(addr + 1))}` };
  if (op === 0xC2) return { len: 4, text: `JP NZ,${hex(u24(addr + 1))}` };
  if (op === 0xCA) return { len: 4, text: `JP Z,${hex(u24(addr + 1))}` };
  if (op === 0xD2) return { len: 4, text: `JP NC,${hex(u24(addr + 1))}` };
  if (op === 0xDA) return { len: 4, text: `JP C,${hex(u24(addr + 1))}` };
  if (op === 0x18) return { len: 2, text: `JR ${hex(addr + 2 + signed8(op2))}` };
  if (op === 0x20) return { len: 2, text: `JR NZ,${hex(addr + 2 + signed8(op2))}` };
  if (op === 0x28) return { len: 2, text: `JR Z,${hex(addr + 2 + signed8(op2))}` };
  if (op === 0x30) return { len: 2, text: `JR NC,${hex(addr + 2 + signed8(op2))}` };
  if (op === 0x38) return { len: 2, text: `JR C,${hex(addr + 2 + signed8(op2))}` };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(addr + 2 + signed8(op2))}` };

  if (op === 0x3A) return { len: 4, text: `LD A,(${hex(u24(addr + 1))})${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x32) return { len: 4, text: `LD (${hex(u24(addr + 1))}),A${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x2A) return { len: 4, text: `LD HL,(${hex(u24(addr + 1))})${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0x22) return { len: 4, text: `LD (${hex(u24(addr + 1))}),HL${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };
  if (op === 0xED && op2 === 0x4B) return { len: 5, text: `LD BC,(${hex(u24(addr + 2))})${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
  if (op === 0xED && op2 === 0x43) return { len: 5, text: `LD (${hex(u24(addr + 2))}),BC${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
  if (op === 0xED && op2 === 0x5B) return { len: 5, text: `LD DE,(${hex(u24(addr + 2))})${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };
  if (op === 0xED && op2 === 0x53) return { len: 5, text: `LD (${hex(u24(addr + 2))}),DE${ramNote(u24(addr + 2))}`, ram: u24(addr + 2) };

  if (op === 0xFD) {
    const disp = signed8(rom[addr + 2]);
    const iy = iyExpr(disp);
    if (op2 === 0x7E) return { len: 3, text: `LD A,${iy}`, iy: disp };
    if (op2 === 0x77) return { len: 3, text: `LD ${iy},A`, iy: disp };
    if (op2 === 0x46) return { len: 3, text: `LD B,${iy}`, iy: disp };
    if (op2 === 0x4E) return { len: 3, text: `LD C,${iy}`, iy: disp };
    if (op2 === 0x56) return { len: 3, text: `LD D,${iy}`, iy: disp };
    if (op2 === 0x5E) return { len: 3, text: `LD E,${iy}`, iy: disp };
    if (op2 === 0x66) return { len: 3, text: `LD H,${iy}`, iy: disp };
    if (op2 === 0x6E) return { len: 3, text: `LD L,${iy}`, iy: disp };
    if (op2 === 0x36) return { len: 4, text: `LD ${iy},${hex(rom[addr + 3], 2)}`, iy: disp };
    if (op2 === 0xCB) {
      const bitOp = rom[addr + 3];
      const group = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bitOp >> 3] ?? 'BITOP';
      if ((bitOp & 0xC0) === 0x40) return { len: 4, text: `BIT ${(bitOp >> 3) & 7},${iy}`, iy: disp };
      if ((bitOp & 0xC0) === 0x80) return { len: 4, text: `RES ${(bitOp >> 3) & 7},${iy}`, iy: disp };
      if ((bitOp & 0xC0) === 0xC0) return { len: 4, text: `SET ${(bitOp >> 3) & 7},${iy}`, iy: disp };
      return { len: 4, text: `${group} ${iy}`, iy: disp };
    }
  }

  const oneByte = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x0A: 'LD A,(BC)', 0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA',
    0x1A: 'LD A,(DE)', 0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L', 0x2F: 'CPL',
    0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A', 0x3F: 'CCF',
    0x76: 'HALT', 0x77: 'LD (HL),A', 0x7E: 'LD A,(HL)', 0xAF: 'XOR A', 0xB7: 'OR A', 0xC5: 'PUSH BC', 0xC1: 'POP BC',
    0xD5: 'PUSH DE', 0xD1: 'POP DE', 0xE5: 'PUSH HL', 0xE1: 'POP HL', 0xF5: 'PUSH AF', 0xF1: 'POP AF',
    0xEB: 'EX DE,HL', 0xF3: 'DI', 0xFB: 'EI',
  };
  if (oneByte[op]) return { len: 1, text: oneByte[op] };

  const ldImm8 = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x3E: 'A' };
  if (ldImm8[op]) return { len: 2, text: `LD ${ldImm8[op]},${hex(op2, 2)}` };
  if (op === 0x36) return { len: 2, text: `LD (HL),${hex(op2, 2)}` };

  const ldImm24 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (ldImm24[op]) return { len: 4, text: `LD ${ldImm24[op]},${hex(u24(addr + 1))}${ramNote(u24(addr + 1))}`, ram: u24(addr + 1) };

  const aluImm = { 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' };
  if (aluImm[op]) return { len: 2, text: `${aluImm[op]},${hex(op2, 2)}` };

  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function disassembleFunction(target) {
  const end = Math.min(rom.length, target.addr + target.bytes);
  const calls = new Set();
  const ram = new Set();
  const iy = new Set();
  const returns = [];
  const listing = [];

  for (let pc = target.addr; pc < end;) {
    const ins = decode(pc);
    listing.push({ pc, ins });
    if (ins.call !== undefined) calls.add(ins.call);
    if (ins.ram !== undefined && ins.ram >= 0xD00000 && ins.ram <= 0xD3FFFF) ram.add(ins.ram);
    if (ins.iy !== undefined) iy.add(ins.iy);
    if (ins.ret) returns.push(`${hex(pc)} ${ins.text}`);
    pc += ins.len;
  }

  console.log(`\n=== ${hex(target.addr)} ${target.name} (${target.bytes} bytes static window) ===`);
  for (const { pc, ins } of listing) {
    console.log(`${hex(pc)}  ${bytesAt(pc, ins.len).padEnd(14)}  ${ins.text}`);
  }

  console.log('\nCALL targets:');
  console.log(calls.size ? [...calls].sort((a, b) => a - b).map((addr) => `  - ${hex(addr)}`).join('\n') : '  - none in window');

  console.log('RAM D0xxxx accesses:');
  console.log(ram.size ? [...ram].sort((a, b) => a - b).map((addr) => `  - ${hex(addr)}`).join('\n') : '  - none decoded in window');

  console.log('IY-relative accesses:');
  console.log(iy.size ? [...iy].sort((a, b) => a - b).map((disp) => `  - ${iyExpr(disp)}`).join('\n') : '  - none decoded in window');

  console.log('Return conditions:');
  console.log(returns.length ? returns.map((line) => `  - ${line}`).join('\n') : '  - none decoded in window');

  console.log('Purpose hypothesis:');
  console.log(`  - Inspect CALL targets, D0 RAM state, IY flags, and terminal RET/JR/JP structure above. This helper is called after 0x097757 rendering/allocation work, so RAM writes and IY flag updates here are likely post-render display/editor state publication or cleanup.`);
}

console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${rom.length} bytes`);
console.log(`IY base assumed: ${hex(IY_BASE)}`);

for (const target of targets) {
  disassembleFunction(target);
}
