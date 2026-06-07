import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TARGET = 0x04e5fe;
const DUMP_LEN = 0x100;
const MAX_INSTRUCTIONS = 80;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16le(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function u24le(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), hexByte).join(' ');
}

function dumpHex(addr, len) {
  console.log(`\nRaw bytes at ${hex(addr)} (${hex(len, 3)} bytes):`);
  for (let off = 0; off < len; off += 16) {
    const chunk = rom.subarray(addr + off, addr + off + 16);
    const text = Array.from(chunk, hexByte).join(' ');
    console.log(`${hex(addr + off)}  ${text}`);
  }
}

function memLabel(addr) {
  const labels = {
    0xd026b8: 'D026B8',
  };
  return labels[addr] ? `${hex(addr)} (${labels[addr]})` : hex(addr);
}

function decode(addr) {
  const op = rom[addr];

  const simple = {
    0x00: ['NOP', 1],
    0x02: ['LD (BC),A', 1],
    0x03: ['INC BC', 1],
    0x04: ['INC B', 1],
    0x05: ['DEC B', 1],
    0x07: ['RLCA', 1],
    0x08: ['EX AF,AF\'', 1],
    0x09: ['ADD HL,BC', 1],
    0x0a: ['LD A,(BC)', 1],
    0x0b: ['DEC BC', 1],
    0x0c: ['INC C', 1],
    0x0d: ['DEC C', 1],
    0x0f: ['RRCA', 1],
    0x12: ['LD (DE),A', 1],
    0x13: ['INC DE', 1],
    0x14: ['INC D', 1],
    0x15: ['DEC D', 1],
    0x17: ['RLA', 1],
    0x19: ['ADD HL,DE', 1],
    0x1a: ['LD A,(DE)', 1],
    0x1b: ['DEC DE', 1],
    0x1c: ['INC E', 1],
    0x1d: ['DEC E', 1],
    0x1f: ['RRA', 1],
    0x23: ['INC HL', 1],
    0x27: ['DAA', 1],
    0x29: ['ADD HL,HL', 1],
    0x2a: [`LD HL,(${memLabel(u24le(addr + 1))})`, 4, { read: u24le(addr + 1) }],
    0x2b: ['DEC HL', 1],
    0x2f: ['CPL', 1],
    0x32: [`LD (${memLabel(u24le(addr + 1))}),A`, 4, { write: u24le(addr + 1) }],
    0x33: ['INC SP', 1],
    0x34: ['INC (HL)', 1, { write: 'HL' }],
    0x35: ['DEC (HL)', 1, { write: 'HL' }],
    0x36: [`LD (HL),${hex(rom[addr + 1], 2)}`, 2, { write: 'HL' }],
    0x37: ['SCF', 1],
    0x39: ['ADD HL,SP', 1],
    0x3a: [`LD A,(${memLabel(u24le(addr + 1))})`, 4, { read: u24le(addr + 1) }],
    0x3b: ['DEC SP', 1],
    0x3c: ['INC A', 1],
    0x3d: ['DEC A', 1],
    0x3f: ['CCF', 1],
    0x76: ['HALT', 1],
    0xc0: ['RET NZ', 1],
    0xc1: ['POP BC', 1],
    0xc5: ['PUSH BC', 1],
    0xc8: ['RET Z', 1],
    0xc9: ['RET', 1, { stop: true }],
    0xd0: ['RET NC', 1],
    0xd1: ['POP DE', 1],
    0xd5: ['PUSH DE', 1],
    0xd8: ['RET C', 1],
    0xe1: ['POP HL', 1],
    0xe5: ['PUSH HL', 1],
    0xe9: ['JP (HL)', 1, { stop: true, jump: 'HL' }],
    0xeb: ['EX DE,HL', 1],
    0xf1: ['POP AF', 1],
    0xf3: ['DI', 1],
    0xf5: ['PUSH AF', 1],
    0xfb: ['EI', 1],
  };
  if (simple[op]) return formatSimple(addr, simple[op]);

  if ((op & 0xc0) === 0x40 && op !== 0x76) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { addr, len: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`, bytes: bytesAt(addr, 1) };
  }

  if ((op & 0xc0) === 0x80) {
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { addr, len: 1, text: `${ops[(op >> 3) & 7]} ${regs[op & 7]}`, bytes: bytesAt(addr, 1) };
  }

  const ldImm8 = {
    0x06: 'B',
    0x0e: 'C',
    0x16: 'D',
    0x1e: 'E',
    0x26: 'H',
    0x2e: 'L',
    0x3e: 'A',
  };
  if (ldImm8[op]) {
    return { addr, len: 2, text: `LD ${ldImm8[op]},${hex(rom[addr + 1], 2)}`, bytes: bytesAt(addr, 2) };
  }

  const ldImm24 = {
    0x01: 'BC',
    0x11: 'DE',
    0x21: 'HL',
    0x31: 'SP',
  };
  if (ldImm24[op]) {
    return { addr, len: 4, text: `LD ${ldImm24[op]},${hex(u24le(addr + 1))}`, bytes: bytesAt(addr, 4) };
  }

  const aluImm = {
    0xc6: 'ADD A',
    0xce: 'ADC A',
    0xd6: 'SUB',
    0xde: 'SBC A',
    0xe6: 'AND',
    0xee: 'XOR',
    0xf6: 'OR',
    0xfe: 'CP',
  };
  if (aluImm[op]) {
    return { addr, len: 2, text: `${aluImm[op]} ${hex(rom[addr + 1], 2)}`, bytes: bytesAt(addr, 2) };
  }

  const jrOps = {
    0x10: 'DJNZ',
    0x18: 'JR',
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0x30: 'JR NC',
    0x38: 'JR C',
  };
  if (jrOps[op]) {
    const target = addr + 2 + signed8(rom[addr + 1]);
    return { addr, len: 2, text: `${jrOps[op]} ${hex(target)}`, bytes: bytesAt(addr, 2), branch: target };
  }

  const callOps = {
    0xc4: 'CALL NZ',
    0xcc: 'CALL Z',
    0xcd: 'CALL',
    0xd4: 'CALL NC',
    0xdc: 'CALL C',
    0xe4: 'CALL PO',
    0xec: 'CALL PE',
    0xf4: 'CALL P',
    0xfc: 'CALL M',
  };
  if (callOps[op]) {
    const target = u24le(addr + 1);
    return { addr, len: 4, text: `${callOps[op]} ${hex(target)}`, bytes: bytesAt(addr, 4), call: target };
  }

  const jpOps = {
    0xc2: 'JP NZ',
    0xc3: 'JP',
    0xca: 'JP Z',
    0xd2: 'JP NC',
    0xda: 'JP C',
    0xe2: 'JP PO',
    0xea: 'JP PE',
    0xf2: 'JP P',
    0xfa: 'JP M',
  };
  if (jpOps[op]) {
    const target = u24le(addr + 1);
    return {
      addr,
      len: 4,
      text: `${jpOps[op]} ${hex(target)}`,
      bytes: bytesAt(addr, 4),
      jump: target,
      stop: op === 0xc3,
    };
  }

  if (op === 0xcb) {
    const cb = rom[addr + 1];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    let text;
    if (cb < 0x40) text = `${groups[(cb >> 3) & 7]} ${regs[cb & 7]}`;
    else if (cb < 0x80) text = `BIT ${(cb >> 3) & 7},${regs[cb & 7]}`;
    else if (cb < 0xc0) text = `RES ${(cb >> 3) & 7},${regs[cb & 7]}`;
    else text = `SET ${(cb >> 3) & 7},${regs[cb & 7]}`;
    return { addr, len: 2, text, bytes: bytesAt(addr, 2) };
  }

  if (op === 0xed) {
    const ed = rom[addr + 1];
    if (ed === 0x27) return { addr, len: 2, text: 'LD HL,(HL)', bytes: bytesAt(addr, 2), read: 'HL' };
    return { addr, len: 2, text: `ED ${hex(ed, 2)}`, bytes: bytesAt(addr, 2) };
  }

  if (op === 0xdd || op === 0xfd) {
    return decodeIndex(addr, op === 0xdd ? 'IX' : 'IY');
  }

  return { addr, len: 1, text: `DB ${hex(op, 2)}`, bytes: bytesAt(addr, 1), unknown: true };
}

function formatSimple(addr, entry) {
  const [text, len, extra = {}] = entry;
  return { addr, len, text, bytes: bytesAt(addr, len), ...extra };
}

function decodeIndex(addr, reg) {
  const op = rom[addr + 1];
  if (op === 0x21) return { addr, len: 5, text: `LD ${reg},${hex(u24le(addr + 2))}`, bytes: bytesAt(addr, 5) };
  if (op === 0x22) return { addr, len: 5, text: `LD (${memLabel(u24le(addr + 2))}),${reg}`, bytes: bytesAt(addr, 5), write: u24le(addr + 2) };
  if (op === 0x2a) return { addr, len: 5, text: `LD ${reg},(${memLabel(u24le(addr + 2))})`, bytes: bytesAt(addr, 5), read: u24le(addr + 2) };
  if (op === 0x23) return { addr, len: 2, text: `INC ${reg}`, bytes: bytesAt(addr, 2) };
  if (op === 0x2b) return { addr, len: 2, text: `DEC ${reg}`, bytes: bytesAt(addr, 2) };
  if (op === 0x36) {
    const disp = signed8(rom[addr + 2]);
    return { addr, len: 4, text: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${hex(rom[addr + 3], 2)}`, bytes: bytesAt(addr, 4), write: reg };
  }
  return { addr, len: 2, text: `${reg} prefix ${hex(op, 2)}`, bytes: bytesAt(addr, 2), unknown: true };
}

function disassemble(start) {
  const instructions = [];
  let pc = start;
  for (let i = 0; i < MAX_INSTRUCTIONS && pc < rom.length; i++) {
    const ins = decode(pc);
    instructions.push(ins);
    pc += ins.len;
    if (ins.stop) break;
  }
  return instructions;
}

function scanReferences(target) {
  const callNeedle = [0xcd, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const jpNeedle = [0xc3, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const refs = [];

  for (let i = 0; i <= rom.length - 4; i++) {
    if (callNeedle.every((b, j) => rom[i + j] === b)) refs.push({ type: 'CALL', address: i });
    if (jpNeedle.every((b, j) => rom[i + j] === b)) refs.push({ type: 'JP', address: i });
  }
  return refs;
}

function summarize(instructions, refs) {
  const calls = instructions.filter((ins) => ins.call !== undefined);
  const reads = instructions.filter((ins) => ins.read !== undefined).map((ins) => ins.read);
  const writes = instructions.filter((ins) => ins.write !== undefined).map((ins) => ins.write);
  const branches = instructions.filter((ins) => ins.branch !== undefined || ins.jump !== undefined);
  const loops = branches.filter((ins) => (ins.branch ?? ins.jump) < ins.addr);
  const compares = instructions.filter((ins) => ins.text.startsWith('CP '));
  const unknowns = instructions.filter((ins) => ins.unknown);
  const terminator = instructions.at(-1);

  console.log('\nStructured summary:');
  console.log(`target: ${hex(TARGET)}`);
  console.log(`decoded_instructions: ${instructions.length}`);
  console.log(`terminator: ${terminator ? `${terminator.text} at ${hex(terminator.addr)}` : 'none'}`);
  console.log(`caller_scan: ${refs.length} direct CALL/JP reference(s) to ${hex(TARGET)}`);
  for (const ref of refs) console.log(`  - ${ref.type} at ${hex(ref.address)}`);

  console.log('\nFunction behavior notes:');
  console.log(`  - register_activity: ${describeRegisterActivity(instructions)}`);
  console.log(`  - ram_reads: ${reads.length ? reads.map((v) => typeof v === 'number' ? memLabel(v) : v).join(', ') : 'none decoded'}`);
  console.log(`  - ram_writes: ${writes.length ? writes.map((v) => typeof v === 'number' ? memLabel(v) : v).join(', ') : 'none decoded'}`);
  console.log(`  - subroutine_calls: ${calls.length ? calls.map((ins) => `${hex(ins.call)} from ${hex(ins.addr)}`).join(', ') : 'none decoded before terminator'}`);
  console.log(`  - branches: ${branches.length ? branches.map((ins) => `${ins.text} from ${hex(ins.addr)}`).join('; ') : 'none decoded'}`);
  console.log(`  - loops: ${loops.length ? loops.map((ins) => `${ins.text} from ${hex(ins.addr)}`).join('; ') : 'none decoded in linear pass'}`);
  console.log(`  - comparisons: ${compares.length ? compares.map((ins) => `${ins.text} at ${hex(ins.addr)}`).join(', ') : 'none decoded'}`);
  console.log(`  - undecoded_bytes: ${unknowns.length ? unknowns.map((ins) => `${hex(ins.addr)}=${ins.bytes}`).join(', ') : 'none in linear pass'}`);

  console.log('\nInterpretation:');
  console.log('  This probe performs a conservative linear decode from the helper entry. Use the instruction listing plus');
  console.log('  decoded reads/writes/calls/branches above to classify the token-rendering helper behavior in ROM context.');
}

function describeRegisterActivity(instructions) {
  const touched = new Set();
  for (const ins of instructions) {
    for (const reg of ['AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP', 'A', 'B', 'C', 'D', 'E', 'H', 'L']) {
      if (new RegExp(`\\b${reg}\\b`).test(ins.text)) touched.add(reg);
    }
  }
  return touched.size ? Array.from(touched).join(', ') : 'none decoded';
}

console.log('Phase 550 probe: decode token rendering helper called by 0x0A2A68');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(rom.length)}`);
console.log(`Entry: ${hex(TARGET)}`);

dumpHex(TARGET, DUMP_LEN);

const instructions = disassemble(TARGET);
console.log(`\nLinear disassembly from ${hex(TARGET)}:`);
for (const ins of instructions) {
  console.log(`${hex(ins.addr)}  ${ins.bytes.padEnd(14)}  ${ins.text}`);
}

const refs = scanReferences(TARGET);
summarize(instructions, refs);
