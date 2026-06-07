#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x061986;
const DUMP_LEN = 0x100;
const MAX_INSNS = 80;
const ROM_SIZE = 0x400000;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function imm16(addr) {
  return byte(addr) | (byte(addr + 1) << 8);
}

function imm24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function s8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return [...rom.subarray(addr, addr + len)]
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function dumpHex(addr, len) {
  for (let off = 0; off < len; off += 16) {
    const lineAddr = addr + off;
    const chunk = rom.subarray(lineAddr, Math.min(lineAddr + 16, addr + len));
    const hexBytes = [...chunk].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.')).join('');
    console.log(`${hex(lineAddr)}  ${hexBytes.padEnd(47)}  ${ascii}`);
  }
}

function relTarget(addr) {
  return addr + 2 + s8(byte(addr + 1));
}

function decodeCb(addr, prefix = '') {
  const op = byte(addr + 1);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const target = regs[z] === '(HL)' && prefix ? `(${prefix})` : regs[z];
  if (x === 0) return { len: 2, text: `${groups[y]} ${target}`, kind: 'op' };
  if (x === 1) return { len: 2, text: `BIT ${y},${target}`, kind: 'read' };
  if (x === 2) return { len: 2, text: `RES ${y},${target}`, kind: 'write' };
  return { len: 2, text: `SET ${y},${target}`, kind: 'write' };
}

function decodeEd(addr) {
  const op = byte(addr + 1);
  const fixed = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4D: 'RETI',
    0x4F: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I', 0x5E: 'IM 2',
    0x5F: 'LD A,R', 0x67: 'RRD', 0x6F: 'RLD', 0xA0: 'LDI', 0xA1: 'CPI',
    0xA2: 'INI', 0xA3: 'OUTI', 0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND',
    0xAB: 'OUTD', 0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  if (fixed[op]) return { len: 2, text: fixed[op], kind: op === 0x45 || op === 0x4D ? 'ret' : 'op' };
  if ((op & 0xC7) === 0x43) {
    const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return { len: 5, text: `LD (${hex(imm24(addr + 2))}),${rp}`, kind: 'write', mem: imm24(addr + 2) };
  }
  if ((op & 0xC7) === 0x4B) {
    const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return { len: 5, text: `LD ${rp},(${hex(imm24(addr + 2))})`, kind: 'read', mem: imm24(addr + 2) };
  }
  return { len: 2, text: `ED ${op.toString(16).toUpperCase().padStart(2, '0')}`, kind: 'op' };
}

function decodeIndexed(addr, reg) {
  const op = byte(addr + 1);
  if (op === 0xCB) {
    const disp = s8(byte(addr + 2));
    const cb = decodeCb(addr + 2, `${reg}${disp < 0 ? '' : '+'}${disp}`);
    return { len: 4, text: cb.text, kind: cb.kind };
  }
  const names = { 0x21: `LD ${reg},${hex(imm24(addr + 2))}`, 0x22: `LD (${hex(imm24(addr + 2))}),${reg}`, 0x2A: `LD ${reg},(${hex(imm24(addr + 2))})`, 0xE5: `PUSH ${reg}`, 0xE1: `POP ${reg}`, 0xE9: `JP (${reg})`, 0xF9: `LD SP,${reg}`, 0x23: `INC ${reg}`, 0x2B: `DEC ${reg}` };
  if (names[op]) return { len: [0x21, 0x22, 0x2A].includes(op) ? 5 : 2, text: names[op], kind: op === 0xE9 ? 'jp' : 'op', mem: [0x21, 0x22, 0x2A].includes(op) ? imm24(addr + 2) : undefined };
  if ([0x34, 0x35].includes(op)) return { len: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${reg}${s8(byte(addr + 2)) < 0 ? '' : '+'}${s8(byte(addr + 2))})`, kind: 'write' };
  if (op === 0x36) return { len: 4, text: `LD (${reg}${s8(byte(addr + 2)) < 0 ? '' : '+'}${s8(byte(addr + 2))}),${hex(byte(addr + 3), 2)}`, kind: 'write' };
  return { len: 2, text: `${reg} prefix ${hex(op, 2)}`, kind: 'op' };
}

function decode(addr) {
  const op = byte(addr);
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  if (op === 0xCB) return decodeCb(addr);
  if (op === 0xDD) return decodeIndexed(addr, 'IX');
  if (op === 0xED) return decodeEd(addr);
  if (op === 0xFD) return decodeIndexed(addr, 'IY');
  if (op === 0x00) return { len: 1, text: 'NOP', kind: 'op' };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(relTarget(addr))}`, kind: 'branch', target: relTarget(addr) };
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const name = op === 0x18 ? 'JR' : `JR ${cc[(op - 0x20) >> 3]}`;
    return { len: 2, text: `${name},${hex(relTarget(addr))}`, kind: op === 0x18 ? 'jp' : 'branch', target: relTarget(addr) };
  }
  if ((op & 0xCF) === 0x01) return { len: 4, text: `LD ${rp[op >> 4]},${hex(imm24(addr + 1))}`, kind: 'op' };
  if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${rp[op >> 4]}`, kind: 'op' };
  if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${rp[op >> 4]}`, kind: 'op' };
  if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}`, kind: r[(op >> 3) & 7] === '(HL)' ? 'write' : 'op' };
  if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}`, kind: r[(op >> 3) & 7] === '(HL)' ? 'write' : 'op' };
  if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hex(byte(addr + 1), 2)}`, kind: r[(op >> 3) & 7] === '(HL)' ? 'write' : 'op' };
  if (op >= 0x40 && op <= 0x7F) return { len: 1, text: op === 0x76 ? 'HALT' : `LD ${r[(op >> 3) & 7]},${r[op & 7]}`, kind: r[(op >> 3) & 7] === '(HL)' ? 'write' : r[op & 7] === '(HL)' ? 'read' : 'op' };
  if (op >= 0x80 && op <= 0xBF) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}`, kind: r[op & 7] === '(HL)' ? 'read' : 'op' };
  const one = { 0x02: 'LD (BC),A', 0x07: 'RLCA', 0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0F: 'RRCA', 0x12: 'LD (DE),A', 0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1F: 'RRA', 0x27: 'DAA', 0x29: 'ADD HL,HL', 0x2F: 'CPL', 0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3F: 'CCF', 0xC0: 'RET NZ', 0xC8: 'RET Z', 0xC9: 'RET', 0xD0: 'RET NC', 0xD8: 'RET C', 0xE0: 'RET PO', 0xE8: 'RET PE', 0xF0: 'RET P', 0xF8: 'RET M', 0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF', 0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF', 0xE3: 'EX (SP),HL', 0xE9: 'JP (HL)', 0xEB: 'EX DE,HL', 0xF3: 'DI', 0xFB: 'EI' };
  if (one[op]) return { len: 1, text: one[op], kind: one[op].startsWith('RET') ? 'ret' : one[op].startsWith('JP') ? 'jp' : 'op' };
  if (op === 0x21) return { len: 4, text: `LD HL,${hex(imm24(addr + 1))}`, kind: 'op' };
  if (op === 0x22) return { len: 4, text: `LD (${hex(imm24(addr + 1))}),HL`, kind: 'write', mem: imm24(addr + 1) };
  if (op === 0x2A) return { len: 4, text: `LD HL,(${hex(imm24(addr + 1))})`, kind: 'read', mem: imm24(addr + 1) };
  if (op === 0x31) return { len: 4, text: `LD SP,${hex(imm24(addr + 1))}`, kind: 'op' };
  if (op === 0x32) return { len: 4, text: `LD (${hex(imm24(addr + 1))}),A`, kind: 'write', mem: imm24(addr + 1) };
  if (op === 0x3A) return { len: 4, text: `LD A,(${hex(imm24(addr + 1))})`, kind: 'read', mem: imm24(addr + 1) };
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)) return { len: 4, text: `JP ${cc[(op - 0xC2) >> 3]},${hex(imm24(addr + 1))}`, kind: 'branch', target: imm24(addr + 1) };
  if (op === 0xC3) return { len: 4, text: `JP ${hex(imm24(addr + 1))}`, kind: 'jp', target: imm24(addr + 1) };
  if (op === 0xCD) return { len: 4, text: `CALL ${hex(imm24(addr + 1))}`, kind: 'call', target: imm24(addr + 1) };
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op)) return { len: 4, text: `CALL ${cc[(op - 0xC4) >> 3]},${hex(imm24(addr + 1))}`, kind: 'call', target: imm24(addr + 1) };
  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) return { len: 2, text: `${alu[(op - 0xC6) >> 3]} ${hex(byte(addr + 1), 2)}`, kind: 'op' };
  return { len: 1, text: `DB ${hex(op, 2)}`, kind: 'data' };
}

function disassemble(start, maxInsns = MAX_INSNS) {
  const insns = [];
  const calls = [];
  const reads = [];
  const writes = [];
  const branches = [];
  let pc = start;
  for (let i = 0; i < maxInsns && pc < rom.length; i += 1) {
    const d = decode(pc);
    const raw = bytesAt(pc, d.len);
    insns.push({ addr: pc, raw, ...d });
    if (d.kind === 'call') calls.push(d.target);
    if (d.kind === 'read') reads.push(d.mem ?? d.text);
    if (d.kind === 'write') writes.push(d.mem ?? d.text);
    if (d.kind === 'branch' || d.kind === 'jp') branches.push(d.target ?? d.text);
    pc += d.len;
    if (d.kind === 'ret' || d.kind === 'jp') break;
  }
  return { insns, calls, reads, writes, branches, bytes: pc - start };
}

function scanRefs(target) {
  const want = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const refs = [];
  for (let addr = 0; addr <= Math.min(rom.length, ROM_SIZE) - 4; addr += 1) {
    const op = byte(addr);
    if ((op === 0xCD || op === 0xC3) && byte(addr + 1) === want[0] && byte(addr + 2) === want[1] && byte(addr + 3) === want[2]) {
      refs.push({ kind: op === 0xCD ? 'CALL' : 'JP', addr, bytes: bytesAt(addr, 4) });
    }
  }
  return refs;
}

function uniq(values) {
  return [...new Set(values.filter((v) => v !== undefined))];
}

function printDisassembly(title, result) {
  console.log(`\n=== ${title} ===`);
  for (const insn of result.insns) {
    console.log(`${hex(insn.addr)}  ${insn.raw.padEnd(14)} ${insn.text}`);
  }
}

console.log('=== Phase 550: decode 0x061986 primary counted-string output path ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM bytes loaded: ${rom.length}`);

console.log(`\n=== Raw bytes at ${hex(START)} (${hex(DUMP_LEN, 3)} bytes) ===`);
dumpHex(START, DUMP_LEN);

const main = disassemble(START);
printDisassembly(`Disassembly from ${hex(START)}`, main);

const refs = scanRefs(START);
console.log(`\n=== CALL/JP references to ${hex(START)} ===`);
console.log(`Total references: ${refs.length}`);
for (const ref of refs) {
  console.log(`${ref.kind.padEnd(4)} at ${hex(ref.addr)}  ${ref.bytes}`);
}

const uniqueCalls = uniq(main.calls).filter((addr) => addr >= 0 && addr < rom.length);
if (main.bytes < 30 && uniqueCalls.length > 0) {
  console.log('\n=== One-level subroutine decode (function is < 30 bytes) ===');
  for (const call of uniqueCalls) {
    printDisassembly(`Subroutine ${hex(call)}`, disassemble(call, 40));
  }
}

console.log('\n=== Structured summary ===');
console.log(JSON.stringify({
  target: hex(START),
  decodedBytes: main.bytes,
  instructionCount: main.insns.length,
  terminator: main.insns.at(-1)?.text ?? null,
  calls: uniqueCalls.map((addr) => hex(addr)),
  branches: uniq(main.branches).map((v) => typeof v === 'number' ? hex(v) : v),
  ramReadsOrMemoryReads: uniq(main.reads).map((v) => typeof v === 'number' ? hex(v) : v),
  ramWritesOrMemoryWrites: uniq(main.writes).map((v) => typeof v === 'number' ? hex(v) : v),
  callerReferences: refs.map((ref) => ({ kind: ref.kind, address: hex(ref.addr) })),
  notes: [
    'Disassembly stops at RET, unconditional JP/JR, or the instruction limit.',
    'Memory accesses are decoded syntactically; classify RAM versus ROM by address using the CE memory map.',
    'Register usage can be read directly from the listed instructions and call boundaries.',
  ],
}, null, 2));
