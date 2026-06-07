import fs from 'fs';
import path from 'path';

const BASE = 0x0A2D4C;
const LENGTH = 0x80;
const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(BASE, BASE + LENGTH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(buf, i) {
  return buf[i] | (buf[i + 1] << 8);
}

function u24(buf, i) {
  return buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
}

function iyDisp(buf, i) {
  const d = s8(buf[i]);
  return `(${'IY'}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
}

function decodeCB(buf, pc, i, prefix) {
  if (i + 1 >= buf.length) return { size: 1, text: 'DB 0xCB ; truncated' };
  const op = buf[i + 1];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (prefix) {
    if (i + 2 >= buf.length) return { size: 2, text: `DB ${hex(buf[i])}, ${hex(op)} ; truncated` };
    const disp = s8(op);
    const cb = buf[i + 2];
    const target = `(${prefix}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`;
    if (cb < 0x40) return { size: 3, text: `${rot[cb >> 3]} ${target}` };
    if (cb < 0x80) return { size: 3, text: `BIT ${(cb >> 3) & 7}, ${target}` };
    if (cb < 0xC0) return { size: 3, text: `RES ${(cb >> 3) & 7}, ${target}` };
    return { size: 3, text: `SET ${(cb >> 3) & 7}, ${target}` };
  }
  if (op < 0x40) return { size: 2, text: `${rot[op >> 3]} ${regs[op & 7]}` };
  if (op < 0x80) return { size: 2, text: `BIT ${(op >> 3) & 7}, ${regs[op & 7]}` };
  if (op < 0xC0) return { size: 2, text: `RES ${(op >> 3) & 7}, ${regs[op & 7]}` };
  return { size: 2, text: `SET ${(op >> 3) & 7}, ${regs[op & 7]}` };
}

function decodeED(buf, pc, i) {
  if (i + 1 >= buf.length) return { size: 1, text: 'DB 0xED ; truncated' };
  const op = buf[i + 1];
  const mlt = {
    0x4C: 'MLT BC',
    0x5C: 'MLT DE',
    0x6C: 'MLT HL',
    0x7C: 'MLT SP',
  };
  const fixed = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4D: 'RETI',
    0x4F: 'LD R,A',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5E: 'IM 2',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA2: 'INI',
    0xA3: 'OUTI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xAA: 'IND',
    0xAB: 'OUTD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB2: 'INIR',
    0xB3: 'OTIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
    0xBA: 'INDR',
    0xBB: 'OTDR',
  };
  if (mlt[op]) return { size: 2, text: mlt[op], mlt: true };
  if (fixed[op]) return { size: 2, text: fixed[op] };
  if ([0x43, 0x53, 0x63, 0x73].includes(op) && i + 3 < buf.length) {
    const rr = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' }[op];
    return { size: 4, text: `LD (${hex(u16(buf, i + 2), 4)}),${rr}` };
  }
  if ([0x4B, 0x5B, 0x6B, 0x7B].includes(op) && i + 3 < buf.length) {
    const rr = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' }[op];
    return { size: 4, text: `LD ${rr},(${hex(u16(buf, i + 2), 4)})` };
  }
  return { size: 2, text: `DB 0xED, ${hex(op)}` };
}

function decodeIndexed(buf, pc, i, prefix) {
  if (i + 1 >= buf.length) return { size: 1, text: `DB ${hex(buf[i])} ; truncated` };
  const op = buf[i + 1];
  const rr = prefix;
  const rhi = prefix === 'IX' ? 'IXH' : 'IYH';
  const rlo = prefix === 'IX' ? 'IXL' : 'IYL';
  const map = {
    0x09: `ADD ${rr},BC`,
    0x19: `ADD ${rr},DE`,
    0x21: null,
    0x22: null,
    0x23: `INC ${rr}`,
    0x24: `INC ${rhi}`,
    0x25: `DEC ${rhi}`,
    0x26: null,
    0x29: `ADD ${rr},${rr}`,
    0x2A: null,
    0x2B: `DEC ${rr}`,
    0x2C: `INC ${rlo}`,
    0x2D: `DEC ${rlo}`,
    0x2E: null,
    0x34: null,
    0x35: null,
    0x36: null,
    0x39: `ADD ${rr},SP`,
    0x44: `LD B,${rhi}`,
    0x45: `LD B,${rlo}`,
    0x4C: `LD C,${rhi}`,
    0x4D: `LD C,${rlo}`,
    0x54: `LD D,${rhi}`,
    0x55: `LD D,${rlo}`,
    0x5C: `LD E,${rhi}`,
    0x5D: `LD E,${rlo}`,
    0x60: `LD ${rhi},B`,
    0x61: `LD ${rhi},C`,
    0x62: `LD ${rhi},D`,
    0x63: `LD ${rhi},E`,
    0x64: `LD ${rhi},${rhi}`,
    0x65: `LD ${rhi},${rlo}`,
    0x67: `LD ${rhi},A`,
    0x68: `LD ${rlo},B`,
    0x69: `LD ${rlo},C`,
    0x6A: `LD ${rlo},D`,
    0x6B: `LD ${rlo},E`,
    0x6C: `LD ${rlo},${rhi}`,
    0x6D: `LD ${rlo},${rlo}`,
    0x6F: `LD ${rlo},A`,
    0x7C: `LD A,${rhi}`,
    0x7D: `LD A,${rlo}`,
    0x84: `ADD A,${rhi}`,
    0x85: `ADD A,${rlo}`,
    0x8C: `ADC A,${rhi}`,
    0x8D: `ADC A,${rlo}`,
    0x94: `SUB ${rhi}`,
    0x95: `SUB ${rlo}`,
    0x9C: `SBC A,${rhi}`,
    0x9D: `SBC A,${rlo}`,
    0xA4: `AND ${rhi}`,
    0xA5: `AND ${rlo}`,
    0xAC: `XOR ${rhi}`,
    0xAD: `XOR ${rlo}`,
    0xB4: `OR ${rhi}`,
    0xB5: `OR ${rlo}`,
    0xBC: `CP ${rhi}`,
    0xBD: `CP ${rlo}`,
    0xE1: `POP ${rr}`,
    0xE3: `EX (SP),${rr}`,
    0xE5: `PUSH ${rr}`,
    0xE9: `JP (${rr})`,
    0xF9: `LD SP,${rr}`,
  };
  if (op === 0xCB) return decodeCB(buf, pc, i + 1, rr);
  if (op === 0x21 && i + 3 < buf.length) return { size: 4, text: `LD ${rr},${hex(u16(buf, i + 2), 4)}` };
  if (op === 0x22 && i + 3 < buf.length) return { size: 4, text: `LD (${hex(u16(buf, i + 2), 4)}),${rr}` };
  if (op === 0x2A && i + 3 < buf.length) return { size: 4, text: `LD ${rr},(${hex(u16(buf, i + 2), 4)})` };
  if ([0x26, 0x2E].includes(op) && i + 2 < buf.length) return { size: 3, text: `LD ${op === 0x26 ? rhi : rlo},${hex(buf[i + 2])}` };
  if ([0x34, 0x35].includes(op) && i + 2 < buf.length) return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${rr}${s8(buf[i + 2]) < 0 ? '-' : '+'}${hex(Math.abs(s8(buf[i + 2])), 2)})` };
  if (op === 0x36 && i + 3 < buf.length) return { size: 4, text: `LD (${rr}${s8(buf[i + 2]) < 0 ? '-' : '+'}${hex(Math.abs(s8(buf[i + 2])), 2)}),${hex(buf[i + 3])}` };
  if ((op >= 0x46 && op <= 0x7E) && [0x46,0x4E,0x56,0x5E,0x66,0x6E,0x70,0x71,0x72,0x73,0x74,0x75,0x77,0x7E].includes(op) && i + 2 < buf.length) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const d = s8(buf[i + 2]);
    const mem = `(${rr}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
    if ((op & 7) === 6) return { size: 3, text: `LD ${regs[op >> 3]},${mem}`, ram: prefix === 'IY' ? 0xD00080 + d : undefined };
    return { size: 3, text: `LD ${mem},${regs[op & 7]}`, ram: prefix === 'IY' ? 0xD00080 + d : undefined };
  }
  if (map[op]) return { size: 2, text: map[op] };
  return { size: 2, text: `DB ${hex(buf[i])}, ${hex(op)}` };
}

function decode(buf, pc, i) {
  const op = buf[i];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const rp2 = ['BC', 'DE', 'HL', 'AF'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const fixed = {
    0x00: 'NOP',
    0x02: 'LD (BC),A',
    0x03: 'INC BC',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x08: 'EX AF,AF\'',
    0x0A: 'LD A,(BC)',
    0x0B: 'DEC BC',
    0x0C: 'INC C',
    0x0D: 'DEC C',
    0x0F: 'RRCA',
    0x12: 'LD (DE),A',
    0x13: 'INC DE',
    0x14: 'INC D',
    0x15: 'DEC D',
    0x17: 'RLA',
    0x1A: 'LD A,(DE)',
    0x1B: 'DEC DE',
    0x1C: 'INC E',
    0x1D: 'DEC E',
    0x1F: 'RRA',
    0x23: 'INC HL',
    0x24: 'INC H',
    0x25: 'DEC H',
    0x27: 'DAA',
    0x29: 'ADD HL,HL',
    0x2B: 'DEC HL',
    0x2C: 'INC L',
    0x2D: 'DEC L',
    0x2F: 'CPL',
    0x33: 'INC SP',
    0x34: 'INC (HL)',
    0x35: 'DEC (HL)',
    0x37: 'SCF',
    0x39: 'ADD HL,SP',
    0x3B: 'DEC SP',
    0x3C: 'INC A',
    0x3D: 'DEC A',
    0x3F: 'CCF',
    0x76: 'HALT',
    0xC9: 'RET',
    0xD9: 'EXX',
    0xE3: 'EX (SP),HL',
    0xE9: 'JP (HL)',
    0xEB: 'EX DE,HL',
    0xF3: 'DI',
    0xF9: 'LD SP,HL',
    0xFB: 'EI',
  };
  if (op === 0xDD) return decodeIndexed(buf, pc, i, 'IX');
  if (op === 0xFD) return decodeIndexed(buf, pc, i, 'IY');
  if (op === 0xCB) return decodeCB(buf, pc, i);
  if (op === 0xED) return decodeED(buf, pc, i);
  if (fixed[op]) return { size: 1, text: fixed[op], ret: op === 0xC9 };
  if (op < 0x40) {
    if ((op & 0x0F) === 0x01 && i + 2 < buf.length) return { size: 3, text: `LD ${rp[op >> 4]},${hex(u16(buf, i + 1), 4)}` };
    if ((op & 0x0F) === 0x06 && i + 1 < buf.length) return { size: 2, text: `LD ${regs[op >> 3]},${hex(buf[i + 1])}` };
    if ((op & 0x0F) === 0x09) return { size: 1, text: `ADD HL,${rp[op >> 4]}` };
    if ((op & 0x0F) === 0x0E && i + 1 < buf.length) return { size: 2, text: `LD ${regs[op >> 3]},${hex(buf[i + 1])}` };
    if (op === 0x10 && i + 1 < buf.length) return { size: 2, text: `DJNZ ${hex(pc + 2 + s8(buf[i + 1]), 6)}`, target: pc + 2 + s8(buf[i + 1]) };
    if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op) && i + 1 < buf.length) {
      const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[op];
      const target = pc + 2 + s8(buf[i + 1]);
      return { size: 2, text: `JR ${cond}${hex(target, 6)}`, target };
    }
    if (op === 0x22 && i + 2 < buf.length) return { size: 3, text: `LD (${hex(u16(buf, i + 1), 4)}),HL` };
    if (op === 0x2A && i + 2 < buf.length) return { size: 3, text: `LD HL,(${hex(u16(buf, i + 1), 4)})` };
    if (op === 0x32 && i + 2 < buf.length) return { size: 3, text: `LD (${hex(u16(buf, i + 1), 4)}),A` };
    if (op === 0x3A && i + 2 < buf.length) return { size: 3, text: `LD A,(${hex(u16(buf, i + 1), 4)})` };
  }
  if (op >= 0x40 && op < 0x80) return { size: 1, text: `LD ${regs[op >> 3]},${regs[op & 7]}` };
  if (op >= 0x80 && op < 0xC0) return { size: 1, text: `${alu[(op >> 3) & 7]} ${regs[op & 7]}` };
  if ([0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8].includes(op)) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}`, ret: true };
  if ([0xC1,0xD1,0xE1,0xF1].includes(op)) return { size: 1, text: `POP ${rp2[(op >> 4) - 12]}` };
  if ([0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA].includes(op) && i + 3 < buf.length) {
    const target = u24(buf, i + 1);
    return { size: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(target, 6)}`, target };
  }
  if (op === 0xC3 && i + 3 < buf.length) {
    const target = u24(buf, i + 1);
    return { size: 4, text: `JP ${hex(target, 6)}`, target };
  }
  if ([0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC].includes(op) && i + 3 < buf.length) {
    const target = u24(buf, i + 1);
    return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}`, target, call: true };
  }
  if ([0xC5,0xD5,0xE5,0xF5].includes(op)) return { size: 1, text: `PUSH ${rp2[(op >> 4) - 12]}` };
  if ([0xC6,0xCE,0xD6,0xDE,0xE6,0xEE,0xF6,0xFE].includes(op) && i + 1 < buf.length) return { size: 2, text: `${alu[(op >> 3) & 7]} ${hex(buf[i + 1])}` };
  if (op === 0xCD && i + 3 < buf.length) {
    const target = u24(buf, i + 1);
    return { size: 4, text: `CALL ${hex(target, 6)}`, target, call: true };
  }
  if ([0xC7,0xCF,0xD7,0xDF,0xE7,0xEF,0xF7,0xFF].includes(op)) return { size: 1, text: `RST ${hex(op & 0x38, 2)}` };
  return { size: 1, text: `DB ${hex(op)}` };
}

console.log(`Probe phase 560: decode row pixel offset routine at ${hex(BASE, 6)}`);
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${hex(BASE, 6)}..${hex(BASE + bytes.length - 1, 6)} (${bytes.length} bytes)`);
console.log('');
console.log('Raw hex:');
for (let i = 0; i < bytes.length; i += 16) {
  const chunk = [...bytes.subarray(i, i + 16)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  console.log(`${hex(BASE + i, 6)}: ${chunk}`);
}

console.log('');
console.log('Disassembly:');
const targets = [];
const ramRefs = new Set();
const mltAt = [];
let boundary = null;
for (let i = 0; i < bytes.length;) {
  const pc = BASE + i;
  const ins = decode(bytes, pc, i);
  const raw = [...bytes.subarray(i, i + ins.size)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(12);
  console.log(`${hex(pc, 6)}  ${raw}  ${ins.text}`);
  if (ins.target !== undefined) targets.push({ pc, kind: ins.call ? 'CALL' : 'JP/JR', target: ins.target });
  if (ins.ram !== undefined) ramRefs.add(ins.ram);
  if (ins.mlt) mltAt.push(pc);
  i += Math.max(ins.size, 1);
  if (ins.ret) {
    boundary = i;
    break;
  }
}

console.log('');
console.log('CALL/JP/JR targets:');
if (targets.length === 0) console.log('  none found before first RET');
for (const t of targets) console.log(`  ${hex(t.pc, 6)} ${t.kind} -> ${hex(t.target, 6)}`);

console.log('');
console.log('RAM / flag references inferred:');
if (ramRefs.size === 0) console.log('  none inferred from indexed IY references before first RET');
for (const addr of [...ramRefs].sort((a, b) => a - b)) {
  const note = addr === 0xD000AD ? ' ; IY+0x2D font size flag' : '';
  console.log(`  ${hex(addr, 6)}${note}`);
}

console.log('');
console.log('Multiplication markers:');
if (mltAt.length === 0) console.log('  no MLT instruction found before first RET');
for (const pc of mltAt) console.log(`  MLT at ${hex(pc, 6)}`);

console.log('');
if (boundary === null) {
  console.log(`Function boundary: no RET found in ${bytes.length} byte window`);
} else {
  console.log(`Function boundary: first RET ends at ${hex(BASE + boundary - 1, 6)}; byte count ${boundary}`);
}
