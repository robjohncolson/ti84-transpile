import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07bf3e;
const LENGTH = 112;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function word16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function fmtAddr(value) {
  return `0x${hex(value & 0xffffff, 6)}`;
}

function fmtByte(value) {
  return `0x${hex(value & 0xff, 2)}`;
}

function fmtRel(pc, size, displacement) {
  return fmtAddr((pc + size + signed8(displacement)) & 0xffffff);
}

function bytesAt(pc, size) {
  return Array.from(rom.slice(pc, pc + size), (b) => hex(b)).join(' ');
}

function annotate(mnemonic, pc, size) {
  const notes = [];
  if (/\bADD HL,/.test(mnemonic)) {
    notes.push('offset/base arithmetic candidate');
  }
  if (/\bHL\b/.test(mnemonic) && /\(0x[0-9A-F]{6}\)/.test(mnemonic)) {
    notes.push('absolute memory access involving HL');
  }
  if (/\bIX\b/.test(mnemonic)) {
    notes.push('IX touched; possible renderer glyph pointer register');
  }
  if (/\bIY\b/.test(mnemonic)) {
    notes.push('IY touched');
  }
  if (/\bCALL\b|\bJP\b|\bJR\b|\bRET\b/.test(mnemonic)) {
    notes.push('control flow');
  }
  if (/\bLD \([^)]*\),HL\b/.test(mnemonic) || /\bLD \([^)]*\),IX\b/.test(mnemonic)) {
    notes.push('stores computed pointer');
  }
  const absolute = mnemonic.match(/0x[0-9A-F]{6}/g) ?? [];
  for (const value of absolute) {
    const n = Number.parseInt(value.slice(2), 16);
    if (n >= 0x000000 && n < rom.length && !notes.some((note) => note.includes(value))) {
      notes.push(`ROM/file address reference ${value}`);
    }
  }
  return notes.length ? ` ; ${notes.join('; ')}` : '';
}

function decodeIndexed(pc, prefix) {
  const reg = prefix === 0xdd ? 'IX' : 'IY';
  const op = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];
  const ixh = reg === 'IX' ? 'IXH' : 'IYH';
  const ixl = reg === 'IX' ? 'IXL' : 'IYL';
  const disp = () => signed8(b2) >= 0 ? `+${hex(signed8(b2), 2)}` : `-${hex(-signed8(b2), 2)}`;

  const simple = {
    0x21: [5, `LD ${reg},${fmtAddr(addr24(pc + 2))}`],
    0x22: [5, `LD (${fmtAddr(addr24(pc + 2))}),${reg}`],
    0x2a: [5, `LD ${reg},(${fmtAddr(addr24(pc + 2))})`],
    0x23: [2, `INC ${reg}`],
    0x2b: [2, `DEC ${reg}`],
    0x29: [2, `ADD ${reg},${reg}`],
    0x39: [2, `ADD ${reg},SP`],
    0xe1: [2, `POP ${reg}`],
    0xe3: [2, `EX (SP),${reg}`],
    0xe5: [2, `PUSH ${reg}`],
    0xe9: [2, `JP (${reg})`],
    0xf9: [2, `LD SP,${reg}`],
    0x24: [2, `INC ${ixh}`],
    0x25: [2, `DEC ${ixh}`],
    0x26: [3, `LD ${ixh},${fmtByte(b2)}`],
    0x2c: [2, `INC ${ixl}`],
    0x2d: [2, `DEC ${ixl}`],
    0x2e: [3, `LD ${ixl},${fmtByte(b2)}`],
  };
  if (simple[op]) return simple[op];

  if (op === 0x09) return [2, `ADD ${reg},BC`];
  if (op === 0x19) return [2, `ADD ${reg},DE`];
  if (op === 0x34) return [3, `INC (${reg}${disp()})`];
  if (op === 0x35) return [3, `DEC (${reg}${disp()})`];
  if (op === 0x36) return [4, `LD (${reg}${disp()}),${fmtByte(b3)}`];
  if (op === 0xcb) return [4, `${reg} CB ${hex(b2)} ${hex(b3)} ; indexed bit operation`];

  const loads = {
    0x46: `LD B,(${reg}${disp()})`,
    0x4e: `LD C,(${reg}${disp()})`,
    0x56: `LD D,(${reg}${disp()})`,
    0x5e: `LD E,(${reg}${disp()})`,
    0x66: `LD H,(${reg}${disp()})`,
    0x6e: `LD L,(${reg}${disp()})`,
    0x70: `LD (${reg}${disp()}),B`,
    0x71: `LD (${reg}${disp()}),C`,
    0x72: `LD (${reg}${disp()}),D`,
    0x73: `LD (${reg}${disp()}),E`,
    0x74: `LD (${reg}${disp()}),H`,
    0x75: `LD (${reg}${disp()}),L`,
    0x77: `LD (${reg}${disp()}),A`,
    0x7e: `LD A,(${reg}${disp()})`,
  };
  if (loads[op]) return [3, loads[op]];

  return [2, `${reg} prefix opcode ${hex(op)}`];
}

function decodeED(pc) {
  const op = rom[pc + 1];
  const table = {
    0x42: 'SBC HL,BC',
    0x43: `LD (${fmtAddr(addr24(pc + 2))}),BC`,
    0x4a: 'ADC HL,BC',
    0x4b: `LD BC,(${fmtAddr(addr24(pc + 2))})`,
    0x52: 'SBC HL,DE',
    0x53: `LD (${fmtAddr(addr24(pc + 2))}),DE`,
    0x5a: 'ADC HL,DE',
    0x5b: `LD DE,(${fmtAddr(addr24(pc + 2))})`,
    0x62: 'SBC HL,HL',
    0x63: `LD (${fmtAddr(addr24(pc + 2))}),HL`,
    0x6a: 'ADC HL,HL',
    0x6b: `LD HL,(${fmtAddr(addr24(pc + 2))})`,
    0x6c: 'MLT HL',
    0x72: 'SBC HL,SP',
    0x73: `LD (${fmtAddr(addr24(pc + 2))}),SP`,
    0x7a: 'ADC HL,SP',
    0x7b: `LD SP,(${fmtAddr(addr24(pc + 2))})`,
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
  };
  if (table[op]) {
    const size = /\(0x[0-9A-F]{6}\)/.test(table[op]) ? 5 : 2;
    return [size, table[op]];
  }
  return [2, `ED ${hex(op)}`];
}

function decode(pc) {
  const op = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

  if (op === 0xdd || op === 0xfd) return decodeIndexed(pc, op);
  if (op === 0xed) return decodeED(pc);
  if (op === 0xcb) return [2, `CB ${hex(b1)} ; bit operation`];

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return [1, 'HALT'];
    return [1, `LD ${r[(op >> 3) & 7]},${r[op & 7]}`];
  }
  if (op >= 0x80 && op <= 0xbf) {
    return [1, `${alu[(op >> 3) & 7]},${r[op & 7]}`];
  }

  const direct = {
    0x00: [1, 'NOP'],
    0x01: [4, `LD BC,${fmtAddr(addr24(pc + 1))}`],
    0x02: [1, 'LD (BC),A'],
    0x03: [1, 'INC BC'],
    0x04: [1, 'INC B'],
    0x05: [1, 'DEC B'],
    0x06: [2, `LD B,${fmtByte(b1)}`],
    0x07: [1, 'RLCA'],
    0x08: [1, "EX AF,AF'"],
    0x09: [1, 'ADD HL,BC'],
    0x0a: [1, 'LD A,(BC)'],
    0x0b: [1, 'DEC BC'],
    0x0c: [1, 'INC C'],
    0x0d: [1, 'DEC C'],
    0x0e: [2, `LD C,${fmtByte(b1)}`],
    0x0f: [1, 'RRCA'],
    0x10: [2, `DJNZ ${fmtRel(pc, 2, b1)}`],
    0x11: [4, `LD DE,${fmtAddr(addr24(pc + 1))}`],
    0x12: [1, 'LD (DE),A'],
    0x13: [1, 'INC DE'],
    0x14: [1, 'INC D'],
    0x15: [1, 'DEC D'],
    0x16: [2, `LD D,${fmtByte(b1)}`],
    0x17: [1, 'RLA'],
    0x18: [2, `JR ${fmtRel(pc, 2, b1)}`],
    0x19: [1, 'ADD HL,DE'],
    0x1a: [1, 'LD A,(DE)'],
    0x1b: [1, 'DEC DE'],
    0x1c: [1, 'INC E'],
    0x1d: [1, 'DEC E'],
    0x1e: [2, `LD E,${fmtByte(b1)}`],
    0x1f: [1, 'RRA'],
    0x20: [2, `JR NZ,${fmtRel(pc, 2, b1)}`],
    0x21: [4, `LD HL,${fmtAddr(addr24(pc + 1))}`],
    0x22: [4, `LD (${fmtAddr(addr24(pc + 1))}),HL`],
    0x23: [1, 'INC HL'],
    0x24: [1, 'INC H'],
    0x25: [1, 'DEC H'],
    0x26: [2, `LD H,${fmtByte(b1)}`],
    0x27: [1, 'DAA'],
    0x28: [2, `JR Z,${fmtRel(pc, 2, b1)}`],
    0x29: [1, 'ADD HL,HL'],
    0x2a: [4, `LD HL,(${fmtAddr(addr24(pc + 1))})`],
    0x2b: [1, 'DEC HL'],
    0x2c: [1, 'INC L'],
    0x2d: [1, 'DEC L'],
    0x2e: [2, `LD L,${fmtByte(b1)}`],
    0x2f: [1, 'CPL'],
    0x30: [2, `JR NC,${fmtRel(pc, 2, b1)}`],
    0x31: [4, `LD SP,${fmtAddr(addr24(pc + 1))}`],
    0x32: [4, `LD (${fmtAddr(addr24(pc + 1))}),A`],
    0x33: [1, 'INC SP'],
    0x34: [1, 'INC (HL)'],
    0x35: [1, 'DEC (HL)'],
    0x36: [2, `LD (HL),${fmtByte(b1)}`],
    0x37: [1, 'SCF'],
    0x38: [2, `JR C,${fmtRel(pc, 2, b1)}`],
    0x39: [1, 'ADD HL,SP'],
    0x3a: [4, `LD A,(${fmtAddr(addr24(pc + 1))})`],
    0x3b: [1, 'DEC SP'],
    0x3c: [1, 'INC A'],
    0x3d: [1, 'DEC A'],
    0x3e: [2, `LD A,${fmtByte(b1)}`],
    0x3f: [1, 'CCF'],
    0xc1: [1, 'POP BC'],
    0xc2: [4, `JP NZ,${fmtAddr(addr24(pc + 1))}`],
    0xc3: [4, `JP ${fmtAddr(addr24(pc + 1))}`],
    0xc4: [4, `CALL NZ,${fmtAddr(addr24(pc + 1))}`],
    0xc5: [1, 'PUSH BC'],
    0xc6: [2, `ADD A,${fmtByte(b1)}`],
    0xc8: [1, 'RET Z'],
    0xc9: [1, 'RET'],
    0xca: [4, `JP Z,${fmtAddr(addr24(pc + 1))}`],
    0xcc: [4, `CALL Z,${fmtAddr(addr24(pc + 1))}`],
    0xcd: [4, `CALL ${fmtAddr(addr24(pc + 1))}`],
    0xd1: [1, 'POP DE'],
    0xd2: [4, `JP NC,${fmtAddr(addr24(pc + 1))}`],
    0xd3: [3, `OUT (${fmtByte(word16(pc + 1))}),A`],
    0xd4: [4, `CALL NC,${fmtAddr(addr24(pc + 1))}`],
    0xd5: [1, 'PUSH DE'],
    0xd6: [2, `SUB ${fmtByte(b1)}`],
    0xd8: [1, 'RET C'],
    0xda: [4, `JP C,${fmtAddr(addr24(pc + 1))}`],
    0xdc: [4, `CALL C,${fmtAddr(addr24(pc + 1))}`],
    0xe1: [1, 'POP HL'],
    0xe3: [1, 'EX (SP),HL'],
    0xe5: [1, 'PUSH HL'],
    0xe6: [2, `AND ${fmtByte(b1)}`],
    0xe9: [1, 'JP (HL)'],
    0xeb: [1, 'EX DE,HL'],
    0xf1: [1, 'POP AF'],
    0xf3: [1, 'DI'],
    0xf5: [1, 'PUSH AF'],
    0xf6: [2, `OR ${fmtByte(b1)}`],
    0xf9: [1, 'LD SP,HL'],
    0xfb: [1, 'EI'],
    0xfe: [2, `CP ${fmtByte(b1)}`],
  };
  if (direct[op]) return direct[op];

  if ((op & 0xc7) === 0x04) return [1, `INC ${r[(op >> 3) & 7]}`];
  if ((op & 0xc7) === 0x05) return [1, `DEC ${r[(op >> 3) & 7]}`];
  if ((op & 0xc7) === 0x06) return [2, `LD ${r[(op >> 3) & 7]},${fmtByte(b1)}`];
  if ((op & 0xcf) === 0x01) return [4, `LD ${rp[(op >> 4) & 3]},${fmtAddr(addr24(pc + 1))}`];
  if ((op & 0xcf) === 0x03) return [1, `INC ${rp[(op >> 4) & 3]}`];
  if ((op & 0xcf) === 0x09) return [1, `ADD HL,${rp[(op >> 4) & 3]}`];
  if ((op & 0xcf) === 0x0b) return [1, `DEC ${rp[(op >> 4) & 3]}`];

  return [1, `DB ${fmtByte(op)}`];
}

console.log('Probe phase 552: decode 0x07BF3E glyph table lookup candidate');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${fmtAddr(START)}..${fmtAddr(START + LENGTH - 1)} (${LENGTH} bytes)`);
console.log('Assumption: eZ80 ADL mode, 24-bit immediates for JP/CALL/LD rr,nn/absolute memory operands.');
console.log('');
console.log('Caller context: 0x0A23C0 passes HL = 28 * character_code before CALL 0x07BF3E.');
console.log('');
console.log('Address   Bytes              Instruction                         Annotation');
console.log('--------  -----------------  ----------------------------------  ------------------------------');

for (let pc = START; pc < START + LENGTH;) {
  const [size, mnemonic] = decode(pc);
  const shown = bytesAt(pc, size).padEnd(17, ' ');
  console.log(`${hex(pc, 6)}  ${shown}  ${mnemonic.padEnd(34, ' ')}${annotate(mnemonic, pc, size)}`);
  pc += size;
}

console.log('');
console.log('Review cues:');
console.log('- Look for LD rr,0xNNNNNN followed by ADD HL,rr or EX DE,HL / ADD HL,DE to identify the glyph table base.');
console.log('- Look for LD IX,..., LD (addr),HL, or LD (addr),IX to identify where the computed glyph pointer is stored.');
console.log('- Absolute ROM references printed in annotations are likely table or helper routine addresses worth following.');
