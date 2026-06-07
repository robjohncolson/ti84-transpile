import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x04c979;
const LENGTH = 120;

const rom = readFileSync(ROM_PATH);
const end = Math.min(START + LENGTH, rom.length);

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(pos) {
  return rom[pos] | (rom[pos + 1] << 8);
}

function u24(pos) {
  return rom[pos] | (rom[pos + 1] << 8) | (rom[pos + 2] << 16);
}

function rel8Target(pos) {
  return (pos + 2 + s8(rom[pos + 1])) & 0xffffff;
}

function bytesAt(pos, len) {
  const bytes = [];
  for (let i = 0; i < len && pos + i < rom.length; i++) {
    bytes.push(hex(rom[pos + i], 2));
  }
  return bytes.join(' ');
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decodeCb(pos, indexReg = null) {
  const op = rom[pos + 1];
  if (op === undefined) return { len: 1, text: 'CB <truncated>' };
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const bitOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const reg = indexReg && z === 6 ? `(${indexReg})` : r8[z];
  if (x === 0) return { len: 2, text: `${bitOps[y]} ${reg}` };
  if (x === 1) return { len: 2, text: `BIT ${y},${reg}` };
  if (x === 2) return { len: 2, text: `RES ${y},${reg}` };
  return { len: 2, text: `SET ${y},${reg}` };
}

function decodeEd(pos) {
  const op = rom[pos + 1];
  if (op === undefined) return { len: 1, text: 'ED <truncated>' };
  const table = new Map([
    [0x42, 'SBC HL,BC'], [0x4A, 'ADC HL,BC'], [0x52, 'SBC HL,DE'],
    [0x5A, 'ADC HL,DE'], [0x62, 'SBC HL,HL'], [0x6A, 'ADC HL,HL'],
    [0x72, 'SBC HL,SP'], [0x7A, 'ADC HL,SP'], [0x44, 'NEG'],
    [0x45, 'RETN'], [0x4D, 'RETI'], [0x46, 'IM 0'], [0x56, 'IM 1'],
    [0x5E, 'IM 2'], [0x47, 'LD I,A'], [0x4F, 'LD R,A'],
    [0x57, 'LD A,I'], [0x5F, 'LD A,R'], [0xA0, 'LDI'],
    [0xA1, 'CPI'], [0xA8, 'LDD'], [0xA9, 'CPD'], [0xB0, 'LDIR'],
    [0xB1, 'CPIR'], [0xB8, 'LDDR'], [0xB9, 'CPDR'],
  ]);
  if (table.has(op)) return { len: 2, text: table.get(op) };
  if ((op & 0xc7) === 0x40) return { len: 2, text: `IN ${r8[(op >> 3) & 7]},(C)` };
  if ((op & 0xc7) === 0x41) return { len: 2, text: `OUT (C),${r8[(op >> 3) & 7]}` };
  if ((op & 0xcf) === 0x43) {
    const pair = rp[(op >> 4) & 3];
    return { len: 5, text: `LD ($${hex(u24(pos + 2), 6)}),${pair}` };
  }
  if ((op & 0xcf) === 0x4b) {
    const pair = rp[(op >> 4) & 3];
    return { len: 5, text: `LD ${pair},($${hex(u24(pos + 2), 6)})` };
  }
  return { len: 2, text: `ED $${hex(op, 2)}` };
}

function decodeIndexed(pos, indexReg) {
  const op = rom[pos + 1];
  if (op === undefined) return { len: 1, text: `${indexReg} <truncated>` };
  if (op === 0xcb) return decodeCb(pos + 1, indexReg);
  const dd = () => s8(rom[pos + 2]);
  const mem = () => `(${indexReg}${dd() < 0 ? '-' : '+'}$${hex(Math.abs(dd()), 2)})`;
  if (op === 0x21) return { len: 5, text: `LD ${indexReg},$${hex(u24(pos + 2), 6)}` };
  if (op === 0x22) return { len: 5, text: `LD ($${hex(u24(pos + 2), 6)}),${indexReg}` };
  if (op === 0x2A) return { len: 5, text: `LD ${indexReg},($${hex(u24(pos + 2), 6)})` };
  if (op === 0x23) return { len: 2, text: `INC ${indexReg}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${indexReg}` };
  if (op === 0xE1) return { len: 2, text: `POP ${indexReg}` };
  if (op === 0xE3) return { len: 2, text: `EX (SP),${indexReg}` };
  if (op === 0xE5) return { len: 2, text: `PUSH ${indexReg}` };
  if (op === 0xE9) return { len: 2, text: `JP (${indexReg})` };
  if (op === 0xF9) return { len: 2, text: `LD SP,${indexReg}` };
  if ([0x34, 0x35].includes(op)) return { len: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} ${mem()}` };
  if (op === 0x36) return { len: 4, text: `LD ${mem()},$${hex(rom[pos + 3], 2)}` };
  if ((op & 0xc7) === 0x46) return { len: 3, text: `LD ${r8[(op >> 3) & 7]},${mem()}` };
  if ((op & 0xf8) === 0x70) return { len: 3, text: `LD ${mem()},${r8[op & 7]}` };
  if ((op & 0xc7) === 0x86) return { len: 3, text: `${alu[(op >> 3) & 7]} ${mem()}` };
  return { len: 1, text: `${indexReg} prefix before ${decode(pos + 1).text}` };
}

function decodeSis(pos) {
  const op = rom[pos + 2];
  if (rom[pos + 1] !== 0x52 || op === undefined) {
    return { len: 1, text: `DB $${hex(rom[pos], 2)}` };
  }
  if (op === 0x21) return { len: 5, text: `SIS LD HL,$${hex(u16(pos + 3), 4)}` };
  if (op === 0x01) return { len: 5, text: `SIS LD BC,$${hex(u16(pos + 3), 4)}` };
  if (op === 0x11) return { len: 5, text: `SIS LD DE,$${hex(u16(pos + 3), 4)}` };
  if (op === 0x31) return { len: 5, text: `SIS LD SP,$${hex(u16(pos + 3), 4)}` };
  return { len: 2, text: 'SIS prefix' };
}

function decode(pos) {
  const op = rom[pos];
  if (op === undefined) return { len: 1, text: '<eof>' };
  if (op === 0xcb) return decodeCb(pos);
  if (op === 0xed) return decodeEd(pos);
  if (op === 0xdd) return decodeIndexed(pos, 'IX');
  if (op === 0xfd) return decodeIndexed(pos, 'IY');
  if (op === 0x40 && rom[pos + 1] === 0x52) return decodeSis(pos);

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x07) return { len: 1, text: 'RLCA' };
  if (op === 0x0F) return { len: 1, text: 'RRCA' };
  if (op === 0x17) return { len: 1, text: 'RLA' };
  if (op === 0x1F) return { len: 1, text: 'RRA' };
  if (op === 0x27) return { len: 1, text: 'DAA' };
  if (op === 0x2F) return { len: 1, text: 'CPL' };
  if (op === 0x37) return { len: 1, text: 'SCF' };
  if (op === 0x3F) return { len: 1, text: 'CCF' };
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op === 0xC9) return { len: 1, text: 'RET' };
  if (op === 0xD9) return { len: 1, text: 'EXX' };
  if (op === 0xE3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xE9) return { len: 1, text: 'JP (HL)' };
  if (op === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xF3) return { len: 1, text: 'DI' };
  if (op === 0xF9) return { len: 1, text: 'LD SP,HL' };
  if (op === 0xFB) return { len: 1, text: 'EI' };

  if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},$${hex(u24(pos + 1), 6)}` };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${r8[(op >> 3) & 7]},$${hex(rom[pos + 1], 2)}` };
  if ((op & 0xc0) === 0x40) return { len: 1, text: `LD ${r8[(op >> 3) & 7]},${r8[op & 7]}` };
  if ((op & 0xc0) === 0x80) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r8[op & 7]}` };
  if ((op & 0xc7) === 0xc0) return { len: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0xc2) return { len: 4, text: `JP ${cc[(op >> 3) & 7]},$${hex(u24(pos + 1), 6)}` };
  if ((op & 0xc7) === 0xc4) return { len: 4, text: `CALL ${cc[(op >> 3) & 7]},$${hex(u24(pos + 1), 6)}` };
  if ((op & 0xcf) === 0xc5) return { len: 1, text: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc1) return { len: 1, text: `POP ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0xc6) return { len: 2, text: `${alu[(op >> 3) & 7]} $${hex(rom[pos + 1], 2)}` };
  if ((op & 0xc7) === 0xc7) return { len: 1, text: `RST $${hex(op & 0x38, 2)}` };

  switch (op) {
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x08: return { len: 1, text: "EX AF,AF'" };
    case 0x0A: return { len: 1, text: 'LD A,(BC)' };
    case 0x10: return { len: 2, text: `DJNZ $${hex(rel8Target(pos), 6)}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x18: return { len: 2, text: `JR $${hex(rel8Target(pos), 6)}` };
    case 0x1A: return { len: 1, text: 'LD A,(DE)' };
    case 0x20: return { len: 2, text: `JR NZ,$${hex(rel8Target(pos), 6)}` };
    case 0x22: return { len: 4, text: `LD ($${hex(u24(pos + 1), 6)}),HL` };
    case 0x28: return { len: 2, text: `JR Z,$${hex(rel8Target(pos), 6)}` };
    case 0x2A: return { len: 4, text: `LD HL,($${hex(u24(pos + 1), 6)})` };
    case 0x30: return { len: 2, text: `JR NC,$${hex(rel8Target(pos), 6)}` };
    case 0x32: return { len: 4, text: `LD ($${hex(u24(pos + 1), 6)}),A` };
    case 0x38: return { len: 2, text: `JR C,$${hex(rel8Target(pos), 6)}` };
    case 0x3A: return { len: 4, text: `LD A,($${hex(u24(pos + 1), 6)})` };
    case 0xC3: return { len: 4, text: `JP $${hex(u24(pos + 1), 6)}` };
    case 0xC6: return { len: 2, text: `ADD A,$${hex(rom[pos + 1], 2)}` };
    case 0xCD: return { len: 4, text: `CALL $${hex(u24(pos + 1), 6)}` };
    case 0xD3: return { len: 2, text: `OUT ($${hex(rom[pos + 1], 2)}),A` };
    case 0xDB: return { len: 2, text: `IN A,($${hex(rom[pos + 1], 2)})` };
    case 0xFE: return { len: 2, text: `CP $${hex(rom[pos + 1], 2)}` };
    default: return { len: 1, text: `DB $${hex(op, 2)}` };
  }
}

function annotate(addr, text) {
  const notes = [];
  if (/\bDE\b/.test(text)) notes.push('touches DE width-limit register');
  if (/\bA\b/.test(text)) notes.push('touches A, likely character/state byte');
  if (/\bB\b/.test(text)) notes.push('touches B');
  if (/\(\$D[0-9A-F]{5}\)/.test(text) || /\(\$E[0-9A-F]{5}\)/.test(text)) notes.push('RAM access');
  if (/^CALL/.test(text)) notes.push('sub-call');
  if (/^(CP|SBC|ADC|ADD|SUB|OR|AND|XOR|BIT|SCF|CCF)/.test(text) || /^RET\b/.test(text)) notes.push('may define/test flags for carry return');
  if (/^JR|^JP|^RET/.test(text)) notes.push('control flow');
  return notes.length ? ` ; ${notes.join('; ')}` : '';
}

console.log('Probe phase 552: decode 0x04C979 character width computation / clipping');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: $${hex(START, 6)}..$${hex(end - 1, 6)} (${end - START} bytes)`);
console.log('');
console.log('Entry context from caller: DE holds pixel width limit; carry on return is consumed by caller after CCF.');
console.log('');
console.log('Address  Bytes             Instruction                         Annotation');
console.log('-------  ----------------  ----------------------------------  ----------');

const calls = [];
const ram = [];
let pos = START;
while (pos < end) {
  const ins = decode(pos);
  const len = Math.max(1, Math.min(ins.len, end - pos));
  const byteText = bytesAt(pos, len).padEnd(16, ' ');
  const text = ins.text.padEnd(34, ' ');
  console.log(`${hex(pos, 6)}  ${byteText}  ${text}${annotate(pos, ins.text)}`);
  const call = ins.text.match(/^CALL(?: [A-Z]+,)?\$(?<addr>[0-9A-F]{6})/);
  if (call) calls.push(Number.parseInt(call.groups.addr, 16));
  const absolute = [...ins.text.matchAll(/\(\$(?<addr>[0-9A-F]{6})\)/g)];
  for (const match of absolute) {
    const addr = Number.parseInt(match.groups.addr, 16);
    if (addr >= 0xd00000) ram.push(addr);
  }
  pos += len;
}

console.log('');
console.log('Summary hints:');
console.log('- Inspect instructions touching DE for width-limit arithmetic or comparisons.');
console.log('- Inspect CP/SBC/ADC/SCF/CCF/RET paths to infer carry polarity.');
console.log(`- Sub-calls found: ${calls.length ? calls.map((addr) => `$${hex(addr, 6)}`).join(', ') : 'none in decoded window'}`);
console.log(`- Absolute RAM accesses found: ${ram.length ? [...new Set(ram)].map((addr) => `$${hex(addr, 6)}`).join(', ') : 'none in decoded window'}`);
