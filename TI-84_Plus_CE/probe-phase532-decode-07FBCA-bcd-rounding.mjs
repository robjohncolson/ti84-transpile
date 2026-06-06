import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function readByte(addr) { return rom[addr]; }
function readWord(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function read24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w = 2) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function signed8(v) { return v & 0x80 ? v - 0x100 : v; }
function relTarget(pc, disp, size = 2) { return (pc + size + signed8(disp)) & 0xFFFFFF; }

const START = 0x07FBCA;
const END = START + 120;

const notes = new Map([
  [0x07FBCA, 'entry from sign normalization when guard byte overflowed'],
  [0x07FBE4, 'nearby normalization-core BCD rounding helper'],
  [0x07FC0E, 'nearby 8-byte packed-BCD ADD chain'],
  [0x07FC94, 'nearby 8-byte packed-BCD SUB chain'],
]);

const rstNames = new Map([
  [0x00, 'RST 0x00'],
  [0x08, 'RST 0x08'],
  [0x10, 'RST 0x10'],
  [0x18, 'RST 0x18'],
  [0x20, 'RST 0x20'],
  [0x28, 'RST 0x28'],
  [0x30, 'RST 0x30'],
  [0x38, 'RST 0x38'],
]);

function fmtBytes(addr, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(hex(readByte(addr + i)).slice(2));
  return bytes.join(' ').padEnd(14, ' ');
}

function targetNote(target) {
  return notes.has(target) ? ` ; ${notes.get(target)}` : '';
}

function decodeCB(pc) {
  const op = readByte(pc + 1);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { len: 2, text: `${rot[y]} ${regs[z]}` };
  if (x === 1) return { len: 2, text: `BIT ${y},${regs[z]}` };
  if (x === 2) return { len: 2, text: `RES ${y},${regs[z]}` };
  return { len: 2, text: `SET ${y},${regs[z]}` };
}

function decodeED(pc) {
  const op = readByte(pc + 1);
  const m = {
    0x44: 'NEG',
    0x4D: 'RETI',
    0x45: 'RETN',
    0x57: 'LD A,I',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
  };
  if (m[op]) return { len: 2, text: m[op] };
  return { len: 2, text: `ED ${hex(op)} ; unknown/undecoded` };
}

function decodeIndexBit(pc, prefixName) {
  const disp = readByte(pc + 2);
  const op = readByte(pc + 3);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '', 'A'];
  const addr = `(${prefixName}${signed8(disp) < 0 ? '-' : '+'}${hex(Math.abs(signed8(disp)))})`;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const tail = z === 6 ? '' : `,${regs[z]}`;
  if (x === 0) return { len: 4, text: `${rot[y]} ${addr}${tail}` };
  if (x === 1) return { len: 4, text: `BIT ${y},${addr}` };
  if (x === 2) return { len: 4, text: `RES ${y},${addr}${tail}` };
  return { len: 4, text: `SET ${y},${addr}${tail}` };
}

function decodeIndex(pc, prefix, prefixName) {
  const op = readByte(pc + 1);
  if (op === 0xCB) return decodeIndexBit(pc, prefixName);
  const rp = prefixName;
  if (op === 0x21) return { len: 5, text: `LD ${rp},${hex(read24(pc + 2), 6)}` };
  if (op === 0x22) return { len: 5, text: `LD (${hex(read24(pc + 2), 6)}),${rp}` };
  if (op === 0x2A) return { len: 5, text: `LD ${rp},(${hex(read24(pc + 2), 6)})` };
  if (op === 0x23) return { len: 2, text: `INC ${rp}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${rp}` };
  if (op === 0x34) return { len: 3, text: `INC (${rp}${signed8(readByte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(readByte(pc + 2))))})` };
  if (op === 0x35) return { len: 3, text: `DEC (${rp}${signed8(readByte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(readByte(pc + 2))))})` };
  if (op === 0x36) return { len: 4, text: `LD (${rp}${signed8(readByte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(readByte(pc + 2))))}),${hex(readByte(pc + 3))}` };
  if ((op & 0xC7) === 0x46) return { len: 3, text: `LD ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7]},(${rp}${signed8(readByte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(readByte(pc + 2))))})` };
  if ((op & 0xF8) === 0x70) return { len: 3, text: `LD (${rp}${signed8(readByte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(readByte(pc + 2))))}),${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7]}` };
  return { len: 2, text: `${hex(prefix)} ${hex(op)} ; indexed opcode not decoded` };
}

function decode(pc) {
  const op = readByte(pc);
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const rp2 = ['BC', 'DE', 'HL', 'AF'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

  if (op === 0xCB) return decodeCB(pc);
  if (op === 0xED) return decodeED(pc);
  if (op === 0xDD) return decodeIndex(pc, 0xDD, 'IX');
  if (op === 0xFD) return decodeIndex(pc, 0xFD, 'IY');

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (op === 0x10) {
    const t = relTarget(pc, readByte(pc + 1));
    return { len: 2, text: `DJNZ ${hex(t, 6)}${targetNote(t)}` };
  }
  if (op === 0x18 || (op >= 0x20 && op <= 0x38 && (op & 7) === 0)) {
    const cond = op === 0x18 ? '' : `${cc[(op >> 3) - 4]},`;
    const t = relTarget(pc, readByte(pc + 1));
    return { len: 2, text: `JR ${cond}${hex(t, 6)}${targetNote(t)}` };
  }
  if (op === 0x27) return { len: 1, text: 'DAA ; decimal adjust after packed-BCD add/subtract' };
  if (op === 0x2F) return { len: 1, text: 'CPL' };
  if (op === 0x37) return { len: 1, text: 'SCF' };
  if (op === 0x3F) return { len: 1, text: 'CCF' };
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op === 0xC9) return { len: 1, text: 'RET ; function exit', exit: true };
  if (op === 0xD9) return { len: 1, text: 'EXX' };
  if (op === 0xE3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xE9) return { len: 1, text: 'JP (HL)' };
  if (op === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xF3) return { len: 1, text: 'DI' };
  if (op === 0xF9) return { len: 1, text: 'LD SP,HL' };
  if (op === 0xFB) return { len: 1, text: 'EI' };

  if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hex(readByte(pc + 1))}` };
  if ((op & 0xCF) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(read24(pc + 1), 6)}` };
  if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0x02) return { len: 1, text: [`LD (BC),A`, `LD (DE),A`, `LD (${hex(read24(pc + 1), 6)}),HL`, `LD (${hex(read24(pc + 1), 6)}),A`][(op >> 4) & 3] };
  if ((op & 0xC7) === 0x0A) return { len: 1, text: [`LD A,(BC)`, `LD A,(DE)`, `LD HL,(${hex(read24(pc + 1), 6)})`, `LD A,(${hex(read24(pc + 1), 6)})`][(op >> 4) & 3] };
  if ((op & 0xC0) === 0x40) return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if ((op & 0xC0) === 0x80) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}` };
  if ((op & 0xC7) === 0xC0) return { len: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC2) {
    const t = read24(pc + 1);
    return { len: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(t, 6)}${targetNote(t)}` };
  }
  if ((op & 0xC7) === 0xC4) {
    const t = read24(pc + 1);
    return { len: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(t, 6)}${targetNote(t)}` };
  }
  if ((op & 0xC7) === 0xC6) return { len: 2, text: `${alu[(op >> 3) & 7]} ${hex(readByte(pc + 1))}` };
  if ((op & 0xCF) === 0xC1) return { len: 1, text: `POP ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC5) return { len: 1, text: `PUSH ${rp2[(op >> 4) & 3]}` };
  if (op === 0xC3) {
    const t = read24(pc + 1);
    return { len: 4, text: `JP ${hex(t, 6)}${targetNote(t)}`, exit: true };
  }
  if (op === 0xCD) {
    const t = read24(pc + 1);
    return { len: 4, text: `CALL ${hex(t, 6)}${targetNote(t)}` };
  }
  if (rstNames.has(op & 0x38) && (op & 0xC7) === 0xC7) return { len: 1, text: rstNames.get(op & 0x38) };

  return { len: 1, text: `DB ${hex(op)} ; unknown/undecoded` };
}

console.log(`\n=== DISASSEMBLY: ${hex(START, 6)} - BCD Rounding/Carry Propagation ===\n`);
console.log('Purpose: propagate a packed-BCD carry/round increment from the guard digit into OP1 mantissa bytes.');
console.log('Caller contract: 0x07C9E1 handles the all-digits carry case by resetting the mantissa and incrementing exponent.\n');

let pc = START;
while (pc < END) {
  if (notes.has(pc)) console.log(`; ${notes.get(pc)}`);
  const d = decode(pc);
  console.log(`${hex(pc, 6)}  ${fmtBytes(pc, d.len)}  ${d.text}`);
  pc += d.len;
  if (d.exit) break;
}

console.log('\n=== ANNOTATION ===');
console.log('- Watch for DAA instructions: they mark packed-BCD correction after adding the round/carry nibble.');
console.log('- JR/JP/CALL operands above are printed as absolute targets; nearby known BCD helpers are annotated inline.');
console.log('- Function boundary is the first unconditional RET/JP exit reached by linear decoding from 0x07FBCA.');
