import fs from 'fs';

const TARGET = 0x06002D;
const WINDOW = 192;
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const CC = {
  0x20: 'NZ',
  0x28: 'Z',
  0x30: 'NC',
  0x38: 'C',
  0xC2: 'NZ',
  0xCA: 'Z',
  0xD2: 'NC',
  0xDA: 'C',
  0xE2: 'PO',
  0xEA: 'PE',
  0xF2: 'P',
  0xFA: 'M',
};

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function hexAddr(value) {
  return `0x${hex(value, 6)}`;
}

function s8(value) {
  return value > 0x7F ? value - 0x100 : value;
}

function u16(pos) {
  return rom[pos] | (rom[pos + 1] << 8);
}

function u24(pos) {
  return rom[pos] | (rom[pos + 1] << 8) | (rom[pos + 2] << 16);
}

function bytesAt(pos, len) {
  return Array.from(rom.slice(pos, pos + len), b => hex(b)).join(' ');
}

function relTarget(pos, len) {
  return pos + len + s8(rom[pos + len - 1]);
}

function idxDisp(prefix, displacement) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const signed = s8(displacement);
  const sign = signed < 0 ? '-' : '+';
  return `(${reg}${sign}${hex(Math.abs(signed))})`;
}

function decodeCB(pos, prefix = null) {
  const opPos = prefix === null ? pos + 1 : pos + 3;
  const op = rom[opPos];
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const reg = op & 7;
  const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const len = prefix === null ? 2 : 4;
  const operand = prefix === null ? R[reg] : (reg === 6 ? idxDisp(prefix, rom[pos + 2]) : `${idxDisp(prefix, rom[pos + 2])},${R[reg]}`);

  if (group === 0) return { len, text: `${names[bit]} ${operand}` };
  if (group === 1) return { len, text: `BIT ${bit},${operand}` };
  if (group === 2) return { len, text: `RES ${bit},${operand}` };
  return { len, text: `SET ${bit},${operand}` };
}

function decodeED(pos) {
  const op = rom[pos + 1];
  const known = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4A: 'ADC HL,BC',
    0x4D: 'RETI',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5A: 'ADC HL,DE',
    0x5E: 'IM 2',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6A: 'ADC HL,HL',
    0x6F: 'RLD',
    0x78: 'IN A,(C)',
    0x79: 'OUT (C),A',
    0x7A: 'ADC HL,SP',
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

  if ((op & 0xC7) === 0x43) {
    return { len: 5, text: `LD (${hexAddr(u24(pos + 2))}),${RP[(op >> 4) & 3]}` };
  }
  if ((op & 0xC7) === 0x4B) {
    return { len: 5, text: `LD ${RP[(op >> 4) & 3]},(${hexAddr(u24(pos + 2))})` };
  }
  return { len: 2, text: known[op] || `ED ${hex(op)}` };
}

function decodeIndex(pos, prefix) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const op = rom[pos + 1];
  const d = rom[pos + 2];
  const operand = idxDisp(prefix, d);

  if (op === 0xCB) return decodeCB(pos, prefix);
  if (op === 0x21) return { len: 5, text: `LD ${reg},${hexAddr(u24(pos + 2))}` };
  if (op === 0x22) return { len: 5, text: `LD (${hexAddr(u24(pos + 2))}),${reg}` };
  if (op === 0x2A) return { len: 5, text: `LD ${reg},(${hexAddr(u24(pos + 2))})` };
  if (op === 0x23) return { len: 2, text: `INC ${reg}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${reg}` };
  if (op === 0x36) return { len: 4, text: `LD ${operand},${hex(rom[pos + 3])}` };
  if (op === 0x34) return { len: 3, text: `INC ${operand}` };
  if (op === 0x35) return { len: 3, text: `DEC ${operand}` };
  if (op === 0x46 || op === 0x4E || op === 0x56 || op === 0x5E || op === 0x66 || op === 0x6E || op === 0x7E) {
    return { len: 3, text: `LD ${R[(op >> 3) & 7]},${operand}` };
  }
  if (op === 0x70 || op === 0x71 || op === 0x72 || op === 0x73 || op === 0x74 || op === 0x75 || op === 0x77) {
    return { len: 3, text: `LD ${operand},${R[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xBF && (op & 7) === 6) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 3, text: `${alu},${operand}` };
  }
  return { len: 2, text: `${reg} prefix opcode ${hex(op)}` };
}

function decodeAt(pos) {
  const op = rom[pos];

  if (op === 0xDD || op === 0xFD) return decodeIndex(pos, op);
  if (op === 0xCB) return decodeCB(pos);
  if (op === 0xED) return decodeED(pos);
  if (op === 0x40) return { len: 1, text: 'SIS prefix / short-mode marker' };

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op === 0xC9) return { len: 1, text: 'RET', terminal: true };
  if (op === 0xD9) return { len: 1, text: 'EXX' };
  if (op === 0xE3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xE9) return { len: 1, text: 'JP (HL)', terminal: true };
  if (op === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xF3) return { len: 1, text: 'DI' };
  if (op === 0xFB) return { len: 1, text: 'EI' };

  if ((op & 0xC7) === 0x01) return { len: 4, text: `LD ${RP[(op >> 4) & 3]},${hexAddr(u24(pos + 1))}` };
  if ((op & 0xC7) === 0x03) return { len: 1, text: `INC ${RP[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0x0B) return { len: 1, text: `DEC ${RP[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0x09) return { len: 1, text: `ADD HL,${RP[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0xC5) return { len: 1, text: `PUSH ${RP2[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0xC1) return { len: 1, text: `POP ${RP2[(op >> 4) & 3]}` };

  if ((op & 0xCF) === 0x04) return { len: 1, text: `INC ${R[(op >> 3) & 7]}` };
  if ((op & 0xCF) === 0x05) return { len: 1, text: `DEC ${R[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${R[(op >> 3) & 7]},${hex(rom[pos + 1])}` };
  if (op >= 0x40 && op <= 0x7F) return { len: 1, text: `LD ${R[(op >> 3) & 7]},${R[op & 7]}` };
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 1, text: `${alu},${R[op & 7]}` };
  }

  if (op === 0x10) return { len: 2, text: `DJNZ ${hexAddr(relTarget(pos, 2))}` };
  if (op === 0x18) return { len: 2, text: `JR ${hexAddr(relTarget(pos, 2))}`, terminal: true };
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) return { len: 2, text: `JR ${CC[op]},${hexAddr(relTarget(pos, 2))}` };
  if (op === 0xC3) return { len: 4, text: `JP ${hexAddr(u24(pos + 1))}`, terminal: true };
  if (CC[op]) return { len: 4, text: `JP ${CC[op]},${hexAddr(u24(pos + 1))}` };
  if (op === 0xCD) return { len: 4, text: `CALL ${hexAddr(u24(pos + 1))}` };
  if (op === 0xC4 || op === 0xCC || op === 0xD4 || op === 0xDC || op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC) {
    return { len: 4, text: `CALL ${CC[op - 2]},${hexAddr(u24(pos + 1))}` };
  }
  if (op === 0xC6) return { len: 2, text: `ADD A,${hex(rom[pos + 1])}` };
  if (op === 0xCE) return { len: 2, text: `ADC A,${hex(rom[pos + 1])}` };
  if (op === 0xD6) return { len: 2, text: `SUB ${hex(rom[pos + 1])}` };
  if (op === 0xDE) return { len: 2, text: `SBC A,${hex(rom[pos + 1])}` };
  if (op === 0xE6) return { len: 2, text: `AND ${hex(rom[pos + 1])}` };
  if (op === 0xEE) return { len: 2, text: `XOR ${hex(rom[pos + 1])}` };
  if (op === 0xF6) return { len: 2, text: `OR ${hex(rom[pos + 1])}` };
  if (op === 0xFE) return { len: 2, text: `CP ${hex(rom[pos + 1])}` };

  if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (op === 0x0A) return { len: 1, text: 'LD A,(BC)' };
  if (op === 0x12) return { len: 1, text: 'LD (DE),A' };
  if (op === 0x1A) return { len: 1, text: 'LD A,(DE)' };
  if (op === 0x22) return { len: 4, text: `LD (${hexAddr(u24(pos + 1))}),HL` };
  if (op === 0x2A) return { len: 4, text: `LD HL,(${hexAddr(u24(pos + 1))})` };
  if (op === 0x32) return { len: 4, text: `LD (${hexAddr(u24(pos + 1))}),A` };
  if (op === 0x3A) return { len: 4, text: `LD A,(${hexAddr(u24(pos + 1))})` };

  return { len: 1, text: `DB ${hex(op)}` };
}

function disassemble(start, maxBytes) {
  const rows = [];
  let pos = start;
  const end = Math.min(rom.length, start + maxBytes);
  while (pos < end) {
    const decoded = decodeAt(pos);
    rows.push({ address: pos, bytes: bytesAt(pos, decoded.len), ...decoded });
    pos += decoded.len;
    if (decoded.terminal) break;
  }
  return rows;
}

function findReferences(opcode, target) {
  const refs = [];
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;

  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i] === opcode && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      refs.push(i);
    }
  }
  return refs;
}

function printRows(rows) {
  for (const row of rows) {
    console.log(`${hexAddr(row.address)}  ${row.bytes.padEnd(14)}  ${row.text}`);
  }
}

function printRefs(label, refs) {
  console.log(`${label}: ${refs.length}`);
  for (const ref of refs) {
    console.log(`  ${hexAddr(ref)}  ${bytesAt(ref, 4)}`);
  }
}

const rows = disassemble(TARGET, WINDOW);
const calls = findReferences(0xCD, TARGET);
const jumps = findReferences(0xC3, TARGET);

console.log('Probe: Decode 0x06002D - Cursor/Position Management');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Target: ${hexAddr(TARGET)}`);
console.log('');
console.log(`Raw bytes at ${hexAddr(TARGET)} (${WINDOW} byte window):`);
console.log(bytesAt(TARGET, WINDOW));
console.log('');
console.log('Disassembly:');
printRows(rows);
console.log('');
console.log('Reference search:');
printRefs('CALL 0x06002D (CD 2D 00 06)', calls);
printRefs('JP 0x06002D (C3 2D 00 06)', jumps);
console.log(`Total direct CALL/JP references: ${calls.length + jumps.length}`);
console.log('');
console.log('Static notes:');
console.log('- The disassembler stops at the first terminal RET/JP/JR, which is the likely single-entry function boundary.');
console.log('- IY-indexed reads/writes in this output indicate OS state flags or cursor/output globals touched by the routine.');
console.log('- CALL rows above identify helper routines used before control returns to the caller/renderer path.');
console.log('- Run this probe against the ROM to fill in the concrete entry conditions, RAM/register effects, callees, and likely purpose from the printed instruction stream.');
