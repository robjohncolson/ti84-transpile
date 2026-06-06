import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x07fe24;
const READ_LEN = 0x80;
const BASE_BANK = START & 0xff0000;

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);

const knownSymbols = new Map([
  [0x07fd30, 'OP copy/swap'],
  [0x07fe24, 'target: second transform step'],
  [0x07fe5a, 'forward type transform'],
  [0x07fe9c, 'equation/string -> real type transform'],
  [0x07feb6, 'dual-pass type transform pipeline'],
  [0x07fee1, 'first sub-transform'],
  [0xd005f8, 'OP1 type / OP1 base'],
  [0xd00603, 'OP2 type / OP2 base'],
  [0xd0060e, 'OP3 base'],
  [0xd00619, 'OP4 base'],
  [0xd00624, 'OP5 base'],
  [0xd0062f, 'OP6 base'],
]);

const opRanges = [
  [0xd005f8, 0xd00602, 'OP1'],
  [0xd00603, 0xd0060d, 'OP2'],
  [0xd0060e, 0xd00618, 'OP3'],
  [0xd00619, 0xd00623, 'OP4'],
  [0xd00624, 0xd0062e, 'OP5'],
  [0xd0062f, 0xd00639, 'OP6'],
];

const calls = [];
const jumps = [];
const ramRefs = [];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function sx8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function b(offset) {
  return bytes[offset] ?? 0;
}

function w16(offset) {
  return b(offset) | (b(offset + 1) << 8);
}

function u24(offset) {
  return b(offset) | (b(offset + 1) << 8) | (b(offset + 2) << 16);
}

function immAddr(offset) {
  const value = u24(offset);
  if ((value & 0xff0000) === 0 && BASE_BANK !== 0) {
    return BASE_BANK | value;
  }
  return value;
}

function annotateAddress(addr) {
  const exact = knownSymbols.get(addr);
  if (exact) return exact;

  for (const [start, end, name] of opRanges) {
    if (addr >= start && addr <= end) {
      const off = addr - start;
      return `${name}+${hex(off)}`;
    }
  }

  if (addr >= 0xd00000 && addr <= 0xd3ffff) return 'RAM';
  if (addr >= 0x070000 && addr <= 0x07ffff) return 'ROM 0x07xxxx routine';
  return '';
}

function recordRam(addr) {
  if (addr >= 0xd00000 && addr <= 0xd3ffff) {
    ramRefs.push(addr);
  }
}

function byteText(offset, len) {
  return Array.from(bytes.subarray(offset, offset + len), x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function fmtTarget(addr) {
  const note = annotateAddress(addr);
  return note ? `${hex(addr, 6)} ; ${note}` : hex(addr, 6);
}

function regPair(op) {
  return ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
}

function decodeCB(offset, pc) {
  const op = b(offset + 1);
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  if (group === 1) return { len: 2, text: `BIT ${bit},${r}` };
  if (group === 2) return { len: 2, text: `RES ${bit},${r}` };
  if (group === 3) return { len: 2, text: `SET ${bit},${r}` };
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit];
  return { len: 2, text: `${rot} ${r}` };
}

function decodeED(offset, pc) {
  const op = b(offset + 1);
  const nn = immAddr(offset + 2);
  switch (op) {
    case 0x43: recordRam(nn); return { len: 5, text: `LD (${fmtTarget(nn)}),BC` };
    case 0x53: recordRam(nn); return { len: 5, text: `LD (${fmtTarget(nn)}),DE` };
    case 0x63: recordRam(nn); return { len: 5, text: `LD (${fmtTarget(nn)}),HL` };
    case 0x73: recordRam(nn); return { len: 5, text: `LD (${fmtTarget(nn)}),SP` };
    case 0x4b: recordRam(nn); return { len: 5, text: `LD BC,(${fmtTarget(nn)})` };
    case 0x5b: recordRam(nn); return { len: 5, text: `LD DE,(${fmtTarget(nn)})` };
    case 0x6b: recordRam(nn); return { len: 5, text: `LD HL,(${fmtTarget(nn)})` };
    case 0x7b: recordRam(nn); return { len: 5, text: `LD SP,(${fmtTarget(nn)})` };
    case 0xb0: return { len: 2, text: 'LDIR' };
    case 0xb8: return { len: 2, text: 'LDDR' };
    default: return { len: 2, text: `ED ${hex(op)}` };
  }
}

function decodeIndex(offset, pc, prefix) {
  const op = b(offset + 1);
  const ix = prefix === 0xdd ? 'IX' : 'IY';
  if (op === 0xcb) {
    const disp = sx8(b(offset + 2));
    const cbop = b(offset + 3);
    const bit = (cbop >> 3) & 7;
    const group = cbop >> 6;
    const action = group === 1 ? 'BIT' : group === 2 ? 'RES' : group === 3 ? 'SET' : ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit];
    const suffix = group === 0 ? '' : ` ${bit},`;
    return { len: 4, text: `${action}${suffix}(${ix}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})` };
  }
  if (op === 0x21) return { len: 5, text: `LD ${ix},${hex(u24(offset + 2), 6)}` };
  if (op === 0x36) return { len: 4, text: `LD (${ix}${sx8(b(offset + 2))}),${hex(b(offset + 3))}` };
  if (op === 0x7e) return { len: 3, text: `LD A,(${ix}${sx8(b(offset + 2))})` };
  if (op === 0x77) return { len: 3, text: `LD (${ix}${sx8(b(offset + 2))}),A` };
  return { len: 2, text: `${ix} prefix ${hex(op)}` };
}

function decode(offset) {
  const pc = START + offset;
  const op = b(offset);
  const nn = immAddr(offset + 1);
  const n16 = w16(offset + 1);
  const jr = START + offset + 2 + sx8(b(offset + 1));

  if (op === 0xcb) return decodeCB(offset, pc);
  if (op === 0xed) return decodeED(offset, pc);
  if (op === 0xdd || op === 0xfd) return decodeIndex(offset, pc, op);

  if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${regPair(op)},${hex(u24(offset + 1), 6)}` };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7]},${hex(b(offset + 1))}` };

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x08: return { len: 1, text: 'EX AF,AF\'' };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x0b: return { len: 1, text: 'DEC BC' };
    case 0x0f: return { len: 1, text: 'RRCA' };
    case 0x10: jumps.push(jr); return { len: 2, text: `DJNZ ${fmtTarget(jr)}` };
    case 0x11: return { len: 4, text: `LD DE,${hex(u24(offset + 1), 6)}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x17: return { len: 1, text: 'RLA' };
    case 0x18: jumps.push(jr); return { len: 2, text: `JR ${fmtTarget(jr)}` };
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x1b: return { len: 1, text: 'DEC DE' };
    case 0x1f: return { len: 1, text: 'RRA' };
    case 0x20: jumps.push(jr); return { len: 2, text: `JR NZ,${fmtTarget(jr)}` };
    case 0x21: return { len: 4, text: `LD HL,${hex(u24(offset + 1), 6)}` };
    case 0x22: recordRam(nn); return { len: 4, text: `LD (${fmtTarget(nn)}),HL` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x27: return { len: 1, text: 'DAA' };
    case 0x28: jumps.push(jr); return { len: 2, text: `JR Z,${fmtTarget(jr)}` };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x2a: recordRam(nn); return { len: 4, text: `LD HL,(${fmtTarget(nn)})` };
    case 0x2b: return { len: 1, text: 'DEC HL' };
    case 0x2f: return { len: 1, text: 'CPL' };
    case 0x30: jumps.push(jr); return { len: 2, text: `JR NC,${fmtTarget(jr)}` };
    case 0x31: return { len: 4, text: `LD SP,${hex(u24(offset + 1), 6)}` };
    case 0x32: recordRam(nn); return { len: 4, text: `LD (${fmtTarget(nn)}),A` };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x37: return { len: 1, text: 'SCF' };
    case 0x38: jumps.push(jr); return { len: 2, text: `JR C,${fmtTarget(jr)}` };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x3a: recordRam(nn); return { len: 4, text: `LD A,(${fmtTarget(nn)})` };
    case 0x3b: return { len: 1, text: 'DEC SP' };
    case 0x3f: return { len: 1, text: 'CCF' };
    case 0x76: return { len: 1, text: 'HALT' };
    case 0xc0: return { len: 1, text: 'RET NZ', boundary: true };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc2: jumps.push(nn); return { len: 4, text: `JP NZ,${fmtTarget(nn)}` };
    case 0xc3: jumps.push(nn); return { len: 4, text: `JP ${fmtTarget(nn)}`, boundary: true };
    case 0xc4: calls.push(nn); return { len: 4, text: `CALL NZ,${fmtTarget(nn)}` };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc6: return { len: 2, text: `ADD A,${hex(b(offset + 1))}` };
    case 0xc8: return { len: 1, text: 'RET Z', boundary: true };
    case 0xc9: return { len: 1, text: 'RET', boundary: true };
    case 0xca: jumps.push(nn); return { len: 4, text: `JP Z,${fmtTarget(nn)}` };
    case 0xcc: calls.push(nn); return { len: 4, text: `CALL Z,${fmtTarget(nn)}` };
    case 0xcd: calls.push(nn); return { len: 4, text: `CALL ${fmtTarget(nn)}` };
    case 0xd0: return { len: 1, text: 'RET NC', boundary: true };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd2: jumps.push(nn); return { len: 4, text: `JP NC,${fmtTarget(nn)}` };
    case 0xd4: calls.push(nn); return { len: 4, text: `CALL NC,${fmtTarget(nn)}` };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xd6: return { len: 2, text: `SUB ${hex(b(offset + 1))}` };
    case 0xd8: return { len: 1, text: 'RET C', boundary: true };
    case 0xda: jumps.push(nn); return { len: 4, text: `JP C,${fmtTarget(nn)}` };
    case 0xdc: calls.push(nn); return { len: 4, text: `CALL C,${fmtTarget(nn)}` };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xe6: return { len: 2, text: `AND ${hex(b(offset + 1))}` };
    case 0xeb: return { len: 1, text: 'EX DE,HL' };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf3: return { len: 1, text: 'DI' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xf6: return { len: 2, text: `OR ${hex(b(offset + 1))}` };
    case 0xf9: return { len: 1, text: 'LD SP,HL' };
    case 0xfb: return { len: 1, text: 'EI' };
    case 0xfe: return { len: 2, text: `CP ${hex(b(offset + 1))}` };
  }

  if (op >= 0x40 && op <= 0x7f) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 1, text: `${alu},${regs[op & 7]}`.replace('SUB,', 'SUB ') };
  }

  return { len: 1, text: `DB ${hex(op)}` };
}

const lines = [];
let boundary = null;
for (let offset = 0; offset < bytes.length;) {
  const pc = START + offset;
  const ins = decode(offset);
  lines.push({ pc, offset, ...ins });
  offset += Math.max(ins.len, 1);
  if (ins.boundary && boundary === null) {
    boundary = pc + ins.len;
    break;
  }
}

console.log('Phase 536 probe: decode 0x07FE24 transform step');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Read: ${hex(START, 6)}..${hex(START + READ_LEN - 1, 6)} (${READ_LEN} bytes)`);
console.log('');
console.log('Disassembly:');
for (const line of lines) {
  const raw = byteText(line.offset, line.len).padEnd(14, ' ');
  console.log(`${hex(line.pc, 6)}  ${raw}  ${line.text}`);
}

console.log('');
console.log('Summary:');
console.log(`Function boundary: ${boundary === null ? 'not found in read window' : `${hex(START, 6)}..${hex(boundary - 1, 6)} (${boundary - START} bytes, ends before ${hex(boundary, 6)})`}`);
console.log(`CALL targets: ${[...new Set(calls)].map(fmtTarget).join(', ') || 'none'}`);
console.log(`JP/JR targets: ${[...new Set(jumps)].map(fmtTarget).join(', ') || 'none'}`);
console.log(`RAM references: ${[...new Set(ramRefs)].map(fmtTarget).join(', ') || 'none'}`);
console.log('');
console.log('Purpose note: this routine is reached after 0x07FE5A and 0x07FEE1 in the 0x07FEB6 dual-pass type transform pipeline, then control returns to the pipeline for 0x07FD30 OP copy/swap.');
