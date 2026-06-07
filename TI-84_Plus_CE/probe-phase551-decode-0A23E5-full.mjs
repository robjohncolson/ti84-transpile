import fs from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A23E5;
const END = 0x0A2500;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function u8(addr) {
  return rom[addr] ?? 0;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(addr) {
  return u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
}

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex(u8(addr + i))).join(' ');
}

function inRange(addr) {
  return addr >= START && addr <= END;
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const r16 = ['BC', 'DE', 'HL', 'SP'];
const r16Push = ['BC', 'DE', 'HL', 'AF'];
const conditions = {
  0x20: 'NZ',
  0x28: 'Z',
  0x30: 'NC',
  0x38: 'C',
  0xC0: 'NZ',
  0xC8: 'Z',
  0xD0: 'NC',
  0xD8: 'C',
  0xE0: 'PO',
  0xE8: 'PE',
  0xF0: 'P',
  0xF8: 'M',
};

const calls = [];
const jumps = [];
const rets = [];

function annotateTarget(kind, at, target) {
  const marker = inRange(target) ? ' ; in dump range' : '';
  if (kind === 'CALL') calls.push({ at, target });
  if (kind === 'JP') jumps.push({ at, target });
  return marker;
}

function decodeIndexed(addr, prefix) {
  const ix = prefix === 0xDD;
  const reg = ix ? 'IX' : 'IY';
  const op = u8(addr + 1);

  if (op === 0xCB) {
    const d = s8(u8(addr + 2));
    const cb = u8(addr + 3);
    const group = cb >> 6;
    const bit = (cb >> 3) & 7;
    const operand = `(${reg}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
    const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (group === 1) return { len: 4, text: `BIT ${bit},${operand}` };
    if (group === 2) return { len: 4, text: `RES ${bit},${operand}` };
    if (group === 3) return { len: 4, text: `SET ${bit},${operand}` };
    return { len: 4, text: `${names[bit]},${operand}` };
  }

  const d = s8(u8(addr + 2));
  const disp = `(${reg}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
  const lowReg = ix ? 'IXL' : 'IYL';
  const highReg = ix ? 'IXH' : 'IYH';

  if (op === 0x21) return { len: 5, text: `LD ${reg},$${hex(u24(addr + 2), 6)}` };
  if (op === 0x22) return { len: 5, text: `LD ($${hex(u24(addr + 2), 6)}),${reg}` };
  if (op === 0x2A) return { len: 5, text: `LD ${reg},($${hex(u24(addr + 2), 6)})` };
  if (op === 0x23) return { len: 2, text: `INC ${reg}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${reg}` };
  if (op === 0x36) return { len: 4, text: `LD ${disp},$${hex(u8(addr + 3))}` };
  if (op === 0x34) return { len: 3, text: `INC ${disp}` };
  if (op === 0x35) return { len: 3, text: `DEC ${disp}` };
  if (op === 0xE5) return { len: 2, text: `PUSH ${reg}` };
  if (op === 0xE1) return { len: 2, text: `POP ${reg}` };
  if (op === 0xE9) return { len: 2, text: `JP (${reg})` };
  if (op === 0xF9) return { len: 2, text: `LD SP,${reg}` };

  if ((op & 0xC7) === 0x46) {
    return { len: 3, text: `LD ${r8[(op >> 3) & 7]},${disp}` };
  }
  if ((op & 0xF8) === 0x70) {
    return { len: 3, text: `LD ${disp},${r8[op & 7]}` };
  }
  if ((op & 0xC0) === 0x40) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    const dstName = dst === 4 ? highReg : dst === 5 ? lowReg : r8[dst];
    const srcName = src === 4 ? highReg : src === 5 ? lowReg : r8[src];
    return { len: 2, text: `LD ${dstName},${srcName}` };
  }

  return { len: 2, text: `${reg} prefix opcode $${hex(op)}` };
}

function decodeEd(addr) {
  const op = u8(addr + 1);
  const block = {
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
  if (block[op]) return { len: 2, text: block[op] };
  if ((op & 0xC7) === 0x40) return { len: 2, text: `IN ${r8[(op >> 3) & 7]},(C)` };
  if ((op & 0xC7) === 0x41) return { len: 2, text: `OUT (C),${r8[(op >> 3) & 7]}` };
  if ((op & 0xCF) === 0x42) return { len: 2, text: `SBC HL,${r16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x4A) return { len: 2, text: `ADC HL,${r16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x43) return { len: 5, text: `LD ($${hex(u24(addr + 2), 6)}),${r16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x4B) return { len: 5, text: `LD ${r16[(op >> 4) & 3]},($${hex(u24(addr + 2), 6)})` };
  return { len: 2, text: `ED $${hex(op)}` };
}

function decodeCb(addr) {
  const op = u8(addr + 1);
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const operand = r8[op & 7];
  const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (group === 1) return { len: 2, text: `BIT ${bit},${operand}` };
  if (group === 2) return { len: 2, text: `RES ${bit},${operand}` };
  if (group === 3) return { len: 2, text: `SET ${bit},${operand}` };
  return { len: 2, text: `${names[bit]} ${operand}` };
}

function decodeBase(addr, sis = false) {
  const op = u8(addr);
  const prefix = sis ? 'SIS ' : '';

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (op === 0x03) return { len: 1, text: 'INC BC' };
  if (op === 0x07) return { len: 1, text: 'RLCA' };
  if (op === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (op === 0x0A) return { len: 1, text: 'LD A,(BC)' };
  if (op === 0x0B) return { len: 1, text: 'DEC BC' };
  if (op === 0x0F) return { len: 1, text: 'RRCA' };
  if (op === 0x10) {
    const target = addr + 2 + s8(u8(addr + 1));
    return { len: 2, text: `DJNZ $${hex(target, 6)}${inRange(target) ? ' ; in dump range' : ''}` };
  }
  if (op === 0x12) return { len: 1, text: 'LD (DE),A' };
  if (op === 0x13) return { len: 1, text: 'INC DE' };
  if (op === 0x17) return { len: 1, text: 'RLA' };
  if (op === 0x1A) return { len: 1, text: 'LD A,(DE)' };
  if (op === 0x1B) return { len: 1, text: 'DEC DE' };
  if (op === 0x1F) return { len: 1, text: 'RRA' };
  if (op === 0x18 || conditions[op]) {
    const target = addr + 2 + s8(u8(addr + 1));
    const name = op === 0x18 ? 'JR' : `JR ${conditions[op]},`;
    return { len: 2, text: `${name} $${hex(target, 6)}${inRange(target) ? ' ; in dump range' : ''}` };
  }
  if (op === 0x22) return { len: 4, text: `${prefix}LD ($${hex(u24(addr + 1), 6)}),HL` };
  if (op === 0x27) return { len: 1, text: 'DAA' };
  if (op === 0x2A) return { len: 4, text: `${prefix}LD HL,($${hex(u24(addr + 1), 6)})` };
  if (op === 0x2F) return { len: 1, text: 'CPL' };
  if (op === 0x32) return { len: 4, text: `LD ($${hex(u24(addr + 1), 6)}),A` };
  if (op === 0x37) return { len: 1, text: 'SCF' };
  if (op === 0x3A) return { len: 4, text: `LD A,($${hex(u24(addr + 1), 6)})` };
  if (op === 0x3F) return { len: 1, text: 'CCF' };
  if (op >= 0x40 && op <= 0x7F) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${r8[(op >> 3) & 7]},${r8[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 1, text: `${alu},${r8[op & 7]}`.replace('SUB,', 'SUB ') };
  }
  if (op === 0xC3) {
    const target = u24(addr + 1);
    return { len: 4, text: `JP $${hex(target, 6)}${annotateTarget('JP', addr, target)}` };
  }
  if (op === 0xC9) {
    rets.push(addr);
    return { len: 1, text: 'RET' };
  }
  if (conditions[op] && (op & 0xC7) === 0xC0) {
    rets.push(addr);
    return { len: 1, text: `RET ${conditions[op]}` };
  }
  if (op === 0xCD) {
    const target = u24(addr + 1);
    return { len: 4, text: `CALL $${hex(target, 6)}${annotateTarget('CALL', addr, target)}` };
  }
  if ((op & 0xCF) === 0x01) return { len: 4, text: `LD ${r16[(op >> 4) & 3]},$${hex(u24(addr + 1), 6)}` };
  if ((op & 0xCF) === 0x09) return { len: 1, text: `ADD HL,${r16[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${r8[(op >> 3) & 7]},$${hex(u8(addr + 1))}` };
  if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${r16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${r16[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { len: 1, text: `POP ${r16Push[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC5) return { len: 1, text: `PUSH ${r16Push[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0xC2) {
    const target = u24(addr + 1);
    return { len: 4, text: `JP ${conditions[op - 2]},$${hex(target, 6)}${annotateTarget('JP', addr, target)}` };
  }
  if ((op & 0xC7) === 0xC4) {
    const target = u24(addr + 1);
    return { len: 4, text: `CALL ${conditions[op - 4]},$${hex(target, 6)}${annotateTarget('CALL', addr, target)}` };
  }
  if ((op & 0xC7) === 0xC6) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 2, text: `${alu},$${hex(u8(addr + 1))}`.replace('SUB,', 'SUB ') };
  }

  return { len: 1, text: `DB $${hex(op)}` };
}

function decode(addr) {
  const op = u8(addr);
  if (op === 0x40) {
    const inner = decodeBase(addr + 1, true);
    return { len: inner.len + 1, text: `SIS ${inner.text.replace(/^SIS /, '')}` };
  }
  if (op === 0xCB) return decodeCb(addr);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(addr, op);
  if (op === 0xED) return decodeEd(addr);
  return decodeBase(addr);
}

console.log(`ROM: ${ROM_PATH}`);
console.log(`Dump range: $${hex(START, 6)}-$${hex(END, 6)} (${END - START + 1} bytes)`);
console.log('');
console.log('Raw bytes:');
for (let addr = START; addr <= END; addr += 16) {
  const len = Math.min(16, END - addr + 1);
  console.log(`${hex(addr, 6)}: ${bytes(addr, len)}`);
}

console.log('');
console.log('Disassembly:');
for (let pc = START; pc <= END;) {
  const decoded = decode(pc);
  const safeLen = Math.max(1, Math.min(decoded.len, END - pc + 1));
  console.log(`${hex(pc, 6)}  ${bytes(pc, safeLen).padEnd(14)}  ${decoded.text}`);
  pc += safeLen;
}

function printTargets(label, rows) {
  console.log('');
  console.log(label);
  if (!rows.length) {
    console.log('  none found');
    return;
  }
  for (const row of rows) {
    console.log(`  $${hex(row.at, 6)} -> $${hex(row.target, 6)}${inRange(row.target) ? ' (in dump range)' : ''}`);
  }
}

printTargets('CALL targets:', calls);
printTargets('JP targets:', jumps);

console.log('');
console.log('RET instructions:');
if (!rets.length) {
  console.log('  none found');
} else {
  for (const addr of rets) console.log(`  $${hex(addr, 6)}`);
  console.log(`  last RET in dump range: $${hex(rets[rets.length - 1], 6)}`);
}

console.log('');
console.log('Notes:');
console.log('  Start $0A23E5 is the known character renderer entry.');
console.log('  $0A2439 is START+84, the expected continuation after the first decoded segment.');
console.log('  $0A244D is included to inspect the path noted as past the JR target.');
console.log('  CALL/JP targets and RET locations above are decoded from the same linear dump.');
