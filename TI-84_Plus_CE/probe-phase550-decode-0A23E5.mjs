#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const romPath = join(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

const TARGET = 0x0A23E5;
const HEX_LEN = 0x100;
const MAX_INSTRUCTIONS = 80;
const ROM_LIMIT = rom.length;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function b(addr) {
  return addr >= 0 && addr < ROM_LIMIT ? rom[addr] : 0;
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

function bytes(addr, len) {
  return Array.from(rom.subarray(addr, Math.min(addr + len, ROM_LIMIT)));
}

function bytesHex(addr, len) {
  return bytes(addr, len).map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function dumpHex(addr, len) {
  for (let off = 0; off < len; off += 16) {
    const here = addr + off;
    const chunk = bytes(here, Math.min(16, len - off));
    const raw = chunk.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(47);
    const ascii = chunk.map((v) => (v >= 0x20 && v <= 0x7E ? String.fromCharCode(v) : '.')).join('');
    console.log(`${hex(here)}  ${raw}  ${ascii}`);
  }
}

function relTarget(addr, len) {
  return addr + len + s8(b(addr + len - 1));
}

function cbMnemonic(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) {
    return `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${regs[z]}`;
  }
  return `${['BIT', 'RES', 'SET'][x - 1]} ${y},${regs[z]}`;
}

function edMnemonic(op, addr) {
  const imm24Ops = new Map([
    [0x22, 'LD (imm24),HL'],
    [0x2A, 'LD HL,(imm24)'],
    [0x32, 'LD (imm24),A'],
    [0x3A, 'LD A,(imm24)'],
  ]);
  if (imm24Ops.has(op)) {
    const name = imm24Ops.get(op);
    const imm = u24(addr + 2);
    if (name === 'LD (imm24),HL') return { len: 5, text: `LD (${hex(imm)}),HL`, reads: [], writes: [imm], calls: [] };
    if (name === 'LD HL,(imm24)') return { len: 5, text: `LD HL,(${hex(imm)})`, reads: [imm], writes: [], calls: [] };
    if (name === 'LD (imm24),A') return { len: 5, text: `LD (${hex(imm)}),A`, reads: [], writes: [imm], calls: [] };
    return { len: 5, text: `LD A,(${hex(imm)})`, reads: [imm], writes: [], calls: [] };
  }
  return { len: 2, text: `ED ${op.toString(16).toUpperCase().padStart(2, '0')}`, reads: [], writes: [], calls: [] };
}

function indexedMnemonic(prefix, op, addr) {
  const r = prefix === 0xDD ? 'IX' : 'IY';
  if (op === 0x21) return { len: 5, text: `LD ${r},${hex(u24(addr + 2))}`, reads: [], writes: [], calls: [] };
  if (op === 0x22) return { len: 5, text: `LD (${hex(u24(addr + 2))}),${r}`, reads: [], writes: [u24(addr + 2)], calls: [] };
  if (op === 0x2A) return { len: 5, text: `LD ${r},(${hex(u24(addr + 2))})`, reads: [u24(addr + 2)], writes: [], calls: [] };
  if (op === 0xE5) return { len: 2, text: `PUSH ${r}`, reads: [], writes: [], calls: [] };
  if (op === 0xE1) return { len: 2, text: `POP ${r}`, reads: [], writes: [], calls: [] };
  if (op === 0xCB) {
    const disp = s8(b(addr + 2));
    return { len: 4, text: `${cbMnemonic(b(addr + 3)).replace('(HL)', `(${r}${disp < 0 ? '' : '+'}${disp})`)}`, reads: [], writes: [], calls: [] };
  }
  return { len: 2, text: `${r} prefix ${op.toString(16).toUpperCase().padStart(2, '0')}`, reads: [], writes: [], calls: [] };
}

function disassembleOne(addr) {
  const op = b(addr);
  const base = { len: 1, text: `DB ${op.toString(16).toUpperCase().padStart(2, '0')}h`, reads: [], writes: [], calls: [] };
  const imm8 = () => b(addr + 1).toString(16).toUpperCase().padStart(2, '0');
  const imm24 = () => hex(u24(addr + 1));
  const directRead = (text) => ({ len: 4, text: text(hex(u24(addr + 1))), reads: [u24(addr + 1)], writes: [], calls: [] });
  const directWrite = (text) => ({ len: 4, text: text(hex(u24(addr + 1))), reads: [], writes: [u24(addr + 1)], calls: [] });

  if (op === 0xDD || op === 0xFD) return indexedMnemonic(op, b(addr + 1), addr);
  if (op === 0xED) return edMnemonic(b(addr + 1), addr);
  if (op === 0xCB) return { len: 2, text: cbMnemonic(b(addr + 1)), reads: [], writes: [], calls: [] };

  const fixed = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA', 0x19: 'ADD HL,DE',
    0x1A: 'LD A,(DE)', 0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA', 0x23: 'INC HL',
    0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA', 0x29: 'ADD HL,HL', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L',
    0x2F: 'CPL', 0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x39: 'ADD HL,SP',
    0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A', 0x3F: 'CCF', 0x76: 'HALT', 0xC0: 'RET NZ', 0xC8: 'RET Z',
    0xC9: 'RET', 0xD0: 'RET NC', 0xD8: 'RET C', 0xE0: 'RET PO', 0xE3: 'EX (SP),HL', 0xE8: 'RET PE',
    0xE9: 'JP (HL)', 0xEB: 'EX DE,HL', 0xF0: 'RET P', 0xF3: 'DI', 0xF8: 'RET M', 0xF9: 'LD SP,HL', 0xFB: 'EI',
  };
  if (fixed[op]) return { ...base, text: fixed[op] };

  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (op >= 0x40 && op <= 0x7F) return { ...base, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if (op >= 0x80 && op <= 0xBF) return { ...base, text: `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} ${r[op & 7]}` };

  if ([0x01, 0x11, 0x21, 0x31].includes(op)) return { len: 4, text: `LD ${['BC', 'DE', 'HL', 'SP'][op >> 4]},${imm24()}`, reads: [], writes: [], calls: [] };
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(op)) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${imm8()}h`, reads: [], writes: [], calls: [] };
  if (op === 0x22) return directWrite((a) => `LD (${a}),HL`);
  if (op === 0x2A) return directRead((a) => `LD HL,(${a})`);
  if (op === 0x32) return directWrite((a) => `LD (${a}),A`);
  if (op === 0x3A) return directRead((a) => `LD A,(${a})`);
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(relTarget(addr, 2))}`, reads: [], writes: [], calls: [], branch: relTarget(addr, 2) };
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) return { len: 2, text: `${{ 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' }[op]} ${hex(relTarget(addr, 2))}`, reads: [], writes: [], calls: [], branch: relTarget(addr, 2), stop: op === 0x18 };
  if (op === 0xC3) return { len: 4, text: `JP ${hex(u24(addr + 1))}`, reads: [], writes: [], calls: [], jump: u24(addr + 1), stop: true };
  if (op === 0xCD) return { len: 4, text: `CALL ${hex(u24(addr + 1))}`, reads: [], writes: [], calls: [u24(addr + 1)] };
  if ([0xC2, 0xCA, 0xD2, 0xDA].includes(op)) return { len: 4, text: `${{ 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C' }[op]} ${hex(u24(addr + 1))}`, reads: [], writes: [], calls: [], branch: u24(addr + 1) };
  if ([0xC4, 0xCC, 0xD4, 0xDC].includes(op)) return { len: 4, text: `${{ 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C' }[op]} ${hex(u24(addr + 1))}`, reads: [], writes: [], calls: [u24(addr + 1)] };
  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) return { len: 2, text: `${{ 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' }[op]} ${imm8()}h`, reads: [], writes: [], calls: [] };
  if ([0xC1, 0xD1, 0xE1, 0xF1].includes(op)) return { ...base, text: `POP ${['BC', 'DE', 'HL', 'AF'][(op - 0xC1) >> 4]}` };
  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(op)) return { ...base, text: `PUSH ${['BC', 'DE', 'HL', 'AF'][(op - 0xC5) >> 4]}` };

  return base;
}

function disassemble(start, maxInstructions = MAX_INSTRUCTIONS) {
  const rows = [];
  const stats = { calls: new Set(), reads: new Set(), writes: new Set(), branches: new Set(), loops: [] };
  let pc = start;
  for (let i = 0; i < maxInstructions && pc < ROM_LIMIT; i++) {
    const ins = disassembleOne(pc);
    rows.push({ addr: pc, ...ins, raw: bytesHex(pc, ins.len) });
    for (const call of ins.calls) stats.calls.add(call);
    for (const read of ins.reads) stats.reads.add(read);
    for (const write of ins.writes) stats.writes.add(write);
    if (ins.branch !== undefined) {
      stats.branches.add(ins.branch);
      if (ins.branch < pc) stats.loops.push({ from: pc, to: ins.branch });
    }
    pc += ins.len;
    if (ins.text === 'RET' || ins.stop) break;
  }
  return { rows, stats, bytes: pc - start };
}

function scanReferences(target) {
  const callPattern = [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const jpPattern = [0xC3, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const refs = [];
  for (let i = 0; i <= ROM_LIMIT - 4; i++) {
    const isCall = callPattern.every((v, j) => b(i + j) === v);
    const isJp = jpPattern.every((v, j) => b(i + j) === v);
    if (isCall) refs.push({ type: 'CALL', addr: i });
    if (isJp) refs.push({ type: 'JP', addr: i });
  }
  return refs;
}

function printDisassembly(title, decoded) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const row of decoded.rows) {
    console.log(`${hex(row.addr)}  ${row.raw.padEnd(14)}  ${row.text}`);
  }
}

function printSet(label, set) {
  const values = [...set].sort((a, z) => a - z);
  console.log(`${label}: ${values.length ? values.map((v) => hex(v)).join(', ') : 'none'}`);
}

function inferSummary(decoded) {
  const texts = decoded.rows.map((r) => r.text);
  const regs = new Set();
  for (const text of texts) {
    for (const reg of ['AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP', 'A', 'B', 'C', 'D', 'E', 'H', 'L']) {
      if (new RegExp(`(^|[^A-Z])${reg}([^A-Z]|$)`).test(text)) regs.add(reg);
    }
  }
  const hasRet = texts.includes('RET');
  const final = decoded.rows.at(-1);
  console.log('\nStructured summary');
  console.log('------------------');
  console.log(`Entry: ${hex(TARGET)}`);
  console.log(`Decoded length: ${decoded.bytes} bytes, ${decoded.rows.length} instructions`);
  console.log(`Termination: ${hasRet ? 'RET' : final?.stop ? final.text : 'instruction limit'}`);
  console.log(`Registers referenced: ${[...regs].join(', ') || 'none decoded'}`);
  printSet('RAM/absolute reads', decoded.stats.reads);
  printSet('RAM/absolute writes', decoded.stats.writes);
  printSet('Subroutine calls', decoded.stats.calls);
  printSet('Branch targets', decoded.stats.branches);
  console.log(`Loops: ${decoded.stats.loops.length ? decoded.stats.loops.map((l) => `${hex(l.from)} -> ${hex(l.to)}`).join(', ') : 'none detected'}`);
}

console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${hex(ROM_LIMIT)} bytes`);
console.log(`Target: ${hex(TARGET)}`);

console.log('\nRaw bytes');
console.log('---------');
dumpHex(TARGET, HEX_LEN);

const decoded = disassemble(TARGET);
printDisassembly(`Disassembly from ${hex(TARGET)}`, decoded);
inferSummary(decoded);

const refs = scanReferences(TARGET);
console.log('\nCaller scan');
console.log('-----------');
console.log(`CALL/JP references to ${hex(TARGET)}: ${refs.length}`);
for (const ref of refs) {
  console.log(`${ref.type.padEnd(4)} at ${hex(ref.addr)}`);
}

if (decoded.bytes < 30 && decoded.stats.calls.size) {
  console.log('\nOne-level callee decode');
  console.log('-----------------------');
  for (const call of [...decoded.stats.calls].sort((a, z) => a - z)) {
    const callee = disassemble(call, 40);
    printDisassembly(`Callee ${hex(call)}`, callee);
  }
}
