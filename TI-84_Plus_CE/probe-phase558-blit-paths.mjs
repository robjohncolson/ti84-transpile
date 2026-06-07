#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

const PATHS = [
  { name: '16bpp branch', start: 0x09efb7 },
  { name: 'overflow/error path', start: 0x09f001 },
];

const MAX_BYTES = 0x100;
const MAIN_FLOW_MIN = 0x09ef44;
const MAIN_FLOW_MAX = 0x09f080;

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const R16 = ['BC', 'DE', 'HL', 'SP'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU8(addr) {
  return rom[addr] ?? 0;
}

function readU16(addr) {
  return readU8(addr) | (readU8(addr + 1) << 8);
}

function readU24(addr) {
  return readU8(addr) | (readU8(addr + 1) << 8) | (readU8(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, size, disp) {
  return (pc + size + signed8(disp)) & 0xffffff;
}

function bytesAt(pc, size) {
  return Array.from({ length: size }, (_, i) => readU8(pc + i));
}

function fmtBytes(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(15);
}

function isRam(addr) {
  return addr >= 0xd00000 && addr < 0xe00000;
}

function isMmio(addr) {
  return addr >= 0xe00000;
}

function noteAbs24(meta, addr) {
  if (isRam(addr)) meta.ramRefs.add(addr);
  if (isMmio(addr)) meta.mmioRefs.add(addr);
}

function decodeIndexed(pc, prefix, meta) {
  const ix = prefix === 0xdd ? 'IX' : 'IY';
  const op = readU8(pc + 1);
  if (ix === 'IY') meta.iyOps.push(pc);

  const indexedReg = (code, disp) => (code === 6 ? `(${ix}${signed8(disp) < 0 ? '' : '+'}${signed8(disp)})` : R8[code]);

  if (op === 0xcb) {
    const disp = readU8(pc + 2);
    const cb = readU8(pc + 3);
    const group = cb >> 6;
    const bit = (cb >> 3) & 7;
    const reg = cb & 7;
    const target = indexedReg(reg, disp);
    if (group === 0) return { size: 4, text: `CB ${hex(disp)} ${hex(cb)} ; indexed rotate/shift ${target}` };
    if (group === 1) return { size: 4, text: `BIT ${bit},${target}` };
    if (group === 2) return { size: 4, text: `RES ${bit},${target}` };
    return { size: 4, text: `SET ${bit},${target}` };
  }

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const disp = readU8(pc + 2);
  const dispText = `${signed8(disp) < 0 ? '' : '+'}${signed8(disp)}`;

  if (op === 0x21) return { size: 4, text: `LD ${ix},${hex(readU24(pc + 2), 6)}` };
  if (op === 0x22) {
    const addr = readU24(pc + 2);
    noteAbs24(meta, addr);
    return { size: 4, text: `LD (${hex(addr, 6)}),${ix}` };
  }
  if (op === 0x2a) {
    const addr = readU24(pc + 2);
    noteAbs24(meta, addr);
    return { size: 4, text: `LD ${ix},(${hex(addr, 6)})` };
  }
  if (op === 0x23) return { size: 2, text: `INC ${ix}` };
  if (op === 0x2b) return { size: 2, text: `DEC ${ix}` };
  if (op === 0x34) return { size: 3, text: `INC (${ix}${dispText})` };
  if (op === 0x35) return { size: 3, text: `DEC (${ix}${dispText})` };
  if (op === 0x36) return { size: 4, text: `LD (${ix}${dispText}),${hex(readU8(pc + 3))}` };
  if (op === 0xe1) return { size: 2, text: `POP ${ix}` };
  if (op === 0xe3) return { size: 2, text: `EX (SP),${ix}` };
  if (op === 0xe5) return { size: 2, text: `PUSH ${ix}` };
  if (op === 0xe9) return { size: 2, text: `JP (${ix})`, terminal: true };
  if (op === 0xf9) return { size: 2, text: `LD SP,${ix}` };

  if (x === 1 && (z === 6 || y === 6)) {
    return { size: 3, text: `LD ${indexedReg(y, disp)},${indexedReg(z, disp)}` };
  }
  if (x === 2 && z === 6) return { size: 3, text: `${ALU[y]} (${ix}${dispText})` };
  if (x === 0 && z === 4 && y === 4) return { size: 2, text: `INC ${ix}H` };
  if (x === 0 && z === 5 && y === 4) return { size: 2, text: `DEC ${ix}H` };
  if (x === 0 && z === 6 && y === 4) return { size: 3, text: `LD ${ix}H,${hex(disp)}` };
  if (x === 0 && z === 4 && y === 5) return { size: 2, text: `INC ${ix}L` };
  if (x === 0 && z === 5 && y === 5) return { size: 2, text: `DEC ${ix}L` };
  if (x === 0 && z === 6 && y === 5) return { size: 3, text: `LD ${ix}L,${hex(disp)}` };
  if (x === 0 && z === 1) return { size: q ? 2 : 4, text: q ? `ADD ${ix},${R16[p]}` : `LD ${p === 2 ? ix : R16[p]},${hex(readU24(pc + 2), 6)}` };

  return { size: 2, text: `${hex(prefix)} ${hex(op)} ; unhandled ${ix} prefix` };
}

function decodeEd(pc, meta) {
  const op = readU8(pc + 1);
  const addr = readU24(pc + 2);
  if (op === 0x4b) {
    noteAbs24(meta, addr);
    return { size: 5, text: `LD BC,(${hex(addr, 6)})` };
  }
  if (op === 0x5b) {
    noteAbs24(meta, addr);
    return { size: 5, text: `LD DE,(${hex(addr, 6)})` };
  }
  if (op === 0x6b) {
    noteAbs24(meta, addr);
    return { size: 5, text: `LD HL,(${hex(addr, 6)})` };
  }
  if (op === 0x7b) {
    noteAbs24(meta, addr);
    return { size: 5, text: `LD SP,(${hex(addr, 6)})` };
  }
  if (op === 0x43 || op === 0x53 || op === 0x63 || op === 0x73) {
    noteAbs24(meta, addr);
    return { size: 5, text: `LD (${hex(addr, 6)}),${['BC', 'DE', 'HL', 'SP'][(op >> 4) - 4]}` };
  }
  const block = {
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  }[op];
  if (block) return { size: 2, text: block };
  return { size: 2, text: `ED ${hex(op)} ; unhandled ED prefix` };
}

function decode(pc, meta) {
  const op = readU8(pc);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xdd || op === 0xfd) return decodeIndexed(pc, op, meta);
  if (op === 0xed) return decodeEd(pc, meta);

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x08) return { size: 1, text: 'EX AF,AF\'' };
  if (op === 0x10) return { size: 2, text: `DJNZ ${hex(relTarget(pc, 2, readU8(pc + 1)), 6)}` };
  if (op === 0x18) return { size: 2, text: `JR ${hex(relTarget(pc, 2, readU8(pc + 1)), 6)}` };
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) return { size: 2, text: `JR ${CC[y]},${hex(relTarget(pc, 2, readU8(pc + 1)), 6)}` };
  if (op === 0x22 || op === 0x2a || op === 0x32 || op === 0x3a) {
    const addr = readU24(pc + 1);
    noteAbs24(meta, addr);
    const text = {
      0x22: `LD (${hex(addr, 6)}),HL`,
      0x2a: `LD HL,(${hex(addr, 6)})`,
      0x32: `LD (${hex(addr, 6)}),A`,
      0x3a: `LD A,(${hex(addr, 6)})`,
    }[op];
    return { size: 4, text };
  }
  if (op === 0xc3) {
    const target = readU24(pc + 1);
    return { size: 4, text: `JP ${hex(target, 6)}`, terminal: target >= MAIN_FLOW_MIN && target <= MAIN_FLOW_MAX };
  }
  if ((op & 0xc7) === 0xc2) {
    const target = readU24(pc + 1);
    return { size: 4, text: `JP ${CC[y]},${hex(target, 6)}`, terminal: target >= MAIN_FLOW_MIN && target <= MAIN_FLOW_MAX };
  }
  if (op === 0xcd) {
    const target = readU24(pc + 1);
    meta.callTargets.add(target);
    return { size: 4, text: `CALL ${hex(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = readU24(pc + 1);
    meta.callTargets.add(target);
    return { size: 4, text: `CALL ${CC[y]},${hex(target, 6)}` };
  }
  if (op === 0xc9) return { size: 1, text: 'RET', terminal: true };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${CC[y]}` };
  if (op === 0xd9) return { size: 1, text: 'EXX' };
  if (op === 0xe9) return { size: 1, text: 'JP (HL)', terminal: true };
  if (op === 0xf3) return { size: 1, text: 'DI' };
  if (op === 0xfb) return { size: 1, text: 'EI' };

  if (x === 0) {
    if (z === 1) return { size: q ? 1 : 4, text: q ? `ADD HL,${R16[p]}` : `LD ${R16[p]},${hex(readU24(pc + 1), 6)}` };
    if (z === 2) return { size: 1, text: ['LD (BC),A', 'LD A,(BC)', 'LD (DE),A', 'LD A,(DE)'][y - 0] ?? `op ${hex(op)}` };
    if (z === 3) return { size: 1, text: `${q ? 'DEC' : 'INC'} ${R16[p]}` };
    if (z === 4) return { size: 1, text: `INC ${R8[y]}` };
    if (z === 5) return { size: 1, text: `DEC ${R8[y]}` };
    if (z === 6) return { size: 2, text: `LD ${R8[y]},${hex(readU8(pc + 1))}` };
    if (z === 7) return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }
  if (x === 1) return { size: 1, text: op === 0x76 ? 'HALT' : `LD ${R8[y]},${R8[z]}` };
  if (x === 2) return { size: 1, text: `${ALU[y]} ${R8[z]}` };
  if (x === 3) {
    if (z === 1) return { size: 1, text: q ? ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] : `POP ${['BC', 'DE', 'HL', 'AF'][p]}`, terminal: q && p === 0 };
    if (z === 3) return { size: 1, text: ['JP (HL)', 'EX (SP),HL', 'DI', 'EI'][p] ?? `op ${hex(op)}`, terminal: p === 0 };
    if (z === 5) return { size: q ? 1 : 1, text: q ? ['CALL nn', 'DD prefix', 'ED prefix', 'FD prefix'][p] : `PUSH ${['BC', 'DE', 'HL', 'AF'][p]}` };
    if (z === 6) return { size: 2, text: `${ALU[y]} ${hex(readU8(pc + 1))}` };
    if (z === 7) return { size: 1, text: `RST ${hex(y * 8)}` };
  }

  return { size: 1, text: `DB ${hex(op)}` };
}

function disassemblePath(path) {
  const meta = {
    callTargets: new Set(),
    ramRefs: new Set(),
    mmioRefs: new Set(),
    iyOps: [],
  };
  const lines = [];
  let pc = path.start;
  const end = path.start + MAX_BYTES;
  while (pc < end && pc < rom.length) {
    const ins = decode(pc, meta);
    const raw = bytesAt(pc, ins.size);
    lines.push(`${hex(pc, 6)}  ${fmtBytes(raw)}  ${ins.text}`);
    pc += ins.size;
    if (ins.terminal) break;
  }
  return { ...path, meta, lines, bytesDecoded: pc - path.start };
}

function printSet(label, values) {
  const list = [...values].sort((a, b) => a - b).map((v) => hex(v, 6));
  console.log(`${label}: ${list.length ? list.join(', ') : '(none)'}`);
}

for (const path of PATHS.map(disassemblePath)) {
  console.log('');
  console.log('='.repeat(78));
  console.log(`${path.name.toUpperCase()} @ ${hex(path.start, 6)} (${hex(path.bytesDecoded, 3)} bytes decoded)`);
  console.log('='.repeat(78));
  for (const line of path.lines) console.log(line);
  console.log('-'.repeat(78));
  printSet('CALL targets', path.meta.callTargets);
  printSet('RAM refs >= 0xD00000', path.meta.ramRefs);
  printSet('MMIO refs >= 0xE00000', path.meta.mmioRefs);
  console.log(`IY-relative/prefixed ops: ${path.meta.iyOps.length ? path.meta.iyOps.map((v) => hex(v, 6)).join(', ') : '(none)'}`);
}
