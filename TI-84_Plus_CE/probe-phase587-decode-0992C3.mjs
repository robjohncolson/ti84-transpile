import fs from 'node:fs';
import path from 'node:path';

const START = 0x0992C3;
const MAX_BYTES = 200;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ramNames = new Map([
  [0xD00080, 'IY base / OS flags'],
  [0xD005F8, 'descriptor buffer / search key area'],
  [0xD005F9, 'search key type byte'],
  [0xD02590, 'symbol table start'],
  [0xD0259A, 'symbol table shortcut pointer'],
  [0xD0259D, 'symbol table pointer'],
  [0xD3FFFF, 'symbol table end'],
  [0xD02AD7, 'last-match buffer +0'],
  [0xD02AD8, 'last-match buffer +1'],
  [0xD02AD9, 'last-match buffer +2'],
  [0xD0243A, 'edit cursor'],
  [0xD008D6, '0x0843B3 compare pointer'],
  [0xD01D0C, 'shared state variable'],
  [0xD008F0, 'pointer returned by 0x092F87'],
]);

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const regs16 = ['BC', 'DE', 'HL', 'SP'];
const conditions = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const aluOps = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

const calls = new Set();
const jumps = new Set();
const rsts = new Set();
const ramRefs = new Set();
const iyRefs = new Set();
const ports = new Set();

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function rel(pc, disp, size) {
  return (pc + size + s8(disp)) & 0xFFFFFF;
}

function u16(off) {
  return rom[off] | (rom[off + 1] << 8);
}

function u24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function bytesAt(pc, n) {
  return [...rom.subarray(pc, pc + n)].map((b) => hex(b, 2)).join(' ');
}

function signedDispText(d) {
  const v = s8(d);
  return v < 0 ? `-${hex(-v, 2)}` : `+${hex(v, 2)}`;
}

function addRam(addr) {
  if (addr >= 0xD00000 && addr <= 0xD3FFFF) ramRefs.add(addr);
}

function addTarget(kind, addr) {
  if (kind === 'call') calls.add(addr);
  else jumps.add(addr);
}

function imm8(off) {
  return `$${hex(rom[off], 2)}`;
}

function imm16(off) {
  return `$${hex(u16(off), 4)}`;
}

function imm24(off) {
  const addr = u24(off);
  addRam(addr);
  return `$${hex(addr, 6)}`;
}

function regFor(idx, prefix, disp) {
  if (idx !== 6) return regs8[idx];
  if (prefix === 0xDD) return `(IX${signedDispText(disp)})`;
  if (prefix === 0xFD) {
    const ref = `(IY${signedDispText(disp)})`;
    iyRefs.add(ref);
    return ref;
  }
  return '(HL)';
}

function decodeCB(pc, prefix = null, disp = null) {
  const op = rom[pc + (prefix ? 3 : 1)];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const operand = regFor(z, prefix, disp);
  if (x === 0) return { size: prefix ? 4 : 2, text: `${rotOps[y]} ${operand}` };
  if (x === 1) return { size: prefix ? 4 : 2, text: `BIT ${y},${operand}` };
  if (x === 2) return { size: prefix ? 4 : 2, text: `RES ${y},${operand}` };
  return { size: prefix ? 4 : 2, text: `SET ${y},${operand}` };
}

function decodeED(pc) {
  const op = rom[pc + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 1) {
    if (z === 0) {
      if (y === 6) return { size: 2, text: 'IN (C)' };
      ports.add('(C)');
      return { size: 2, text: `IN ${regs8[y]},(C)` };
    }
    if (z === 1) {
      ports.add('(C)');
      if (y === 6) return { size: 2, text: 'OUT (C),0' };
      return { size: 2, text: `OUT (C),${regs8[y]}` };
    }
    if (z === 2) return { size: 2, text: `${q ? 'ADC' : 'SBC'} HL,${regs16[p]}` };
    if (z === 3) {
      const addr = u24(pc + 2);
      addRam(addr);
      return { size: 5, text: `${q ? 'LD' : 'LD'} ${q ? regs16[p] + ',(' + '$' + hex(addr, 6) + ')' : '(' + '$' + hex(addr, 6) + '),' + regs16[p]}` };
    }
    if (z === 4) return { size: 2, text: 'NEG' };
    if (z === 5) return { size: 2, text: y === 1 ? 'RETI' : 'RETN' };
    if (z === 6) return { size: 2, text: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
    if (z === 7) return { size: 2, text: ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R', 'RRD', 'RLD', 'NOP', 'NOP'][y] };
  }

  const block = new Map([
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (block.has(op)) return { size: 2, text: block.get(op) };

  return { size: 2, text: `DB ED,$${hex(op, 2)}` };
}

function decodeIndexed(pc, prefix) {
  const ix = prefix === 0xDD ? 'IX' : 'IY';
  const op = rom[pc + 1];
  const regs16x = ['BC', 'DE', ix, 'SP'];
  const rp2x = ['BC', 'DE', ix, 'AF'];

  if (op === 0xCB) return decodeCB(pc, prefix, rom[pc + 2]);
  if (op === 0xE9) return { size: 2, text: `JP (${ix})` };
  if (op === 0xF9) return { size: 2, text: `LD SP,${ix}` };
  if (op === 0x21) return { size: 4, text: `LD ${ix},${imm16(pc + 2)}` };
  if (op === 0x22) return { size: 5, text: `LD (${imm24(pc + 2)}),${ix}` };
  if (op === 0x2A) return { size: 5, text: `LD ${ix},(${imm24(pc + 2)})` };
  if (op === 0x23) return { size: 2, text: `INC ${ix}` };
  if (op === 0x2B) return { size: 2, text: `DEC ${ix}` };
  if (op === 0x34 || op === 0x35) {
    const d = rom[pc + 2];
    if (prefix === 0xFD) iyRefs.add(`(IY${signedDispText(d)})`);
    return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${ix}${signedDispText(d)})` };
  }
  if (op === 0x36) {
    const d = rom[pc + 2];
    if (prefix === 0xFD) iyRefs.add(`(IY${signedDispText(d)})`);
    return { size: 4, text: `LD (${ix}${signedDispText(d)}),${imm8(pc + 3)}` };
  }

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 0 && z === 1) return { size: q ? 2 : 4, text: q ? `ADD ${ix},${regs16x[p]}` : `LD ${regs16x[p]},${imm16(pc + 2)}` };
  if (x === 0 && z === 3) return { size: 2, text: `${q ? 'DEC' : 'INC'} ${regs16x[p]}` };
  if (x === 1 && (y === 6 || z === 6)) {
    const d = rom[pc + 2];
    const src = regFor(z, prefix, d);
    const dst = regFor(y, prefix, d);
    return { size: 3, text: `LD ${dst},${src}` };
  }
  if (x === 2 && z === 6) {
    const d = rom[pc + 2];
    return { size: 3, text: `${aluOps[y]} ${regFor(z, prefix, d)}` };
  }
  if (x === 3 && z === 1) return { size: 2, text: `${q ? 'POP' : 'PUSH'} ${rp2x[p]}` };

  return { size: 2, text: `${prefix === 0xDD ? 'DD' : 'FD'} $${hex(op, 2)}` };
}

function decode(pc) {
  const op = rom[pc];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xCB) return decodeCB(pc);
  if (op === 0xED) return decodeED(pc);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(pc, op);

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x08) return { size: 1, text: "EX AF,AF'" };
  if (op === 0x10) {
    const target = rel(pc, rom[pc + 1], 2);
    addTarget('jump', target);
    return { size: 2, text: `DJNZ $${hex(target, 6)}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = rel(pc, rom[pc + 1], 2);
    addTarget('jump', target);
    return { size: 2, text: `${op === 0x18 ? 'JR' : 'JR ' + conditions[(op >> 3) - 4]} $${hex(target, 6)}` };
  }
  if (op === 0x76) return { size: 1, text: 'HALT' };
  if (op === 0xC3) {
    const target = u24(pc + 1);
    addTarget('jump', target);
    return { size: 4, text: `JP $${hex(target, 6)}` };
  }
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)) {
    const target = u24(pc + 1);
    addTarget('jump', target);
    return { size: 4, text: `JP ${conditions[y]},$${hex(target, 6)}` };
  }
  if (op === 0xCD) {
    const target = u24(pc + 1);
    addTarget('call', target);
    return { size: 4, text: `CALL $${hex(target, 6)}` };
  }
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op)) {
    const target = u24(pc + 1);
    addTarget('call', target);
    return { size: 4, text: `CALL ${conditions[y]},$${hex(target, 6)}` };
  }
  if (op === 0xC9) return { size: 1, text: 'RET' };
  if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(op)) return { size: 1, text: `RET ${conditions[y]}` };
  if ((op & 0xC7) === 0xC7) {
    const vec = y * 8;
    rsts.add(vec);
    return { size: 1, text: `RST $${hex(vec, 2)}` };
  }
  if (op === 0xDB) {
    const port = rom[pc + 1];
    ports.add(`$${hex(port, 2)}`);
    return { size: 2, text: `IN A,($${hex(port, 2)})` };
  }
  if (op === 0xD3) {
    const port = rom[pc + 1];
    ports.add(`$${hex(port, 2)}`);
    return { size: 2, text: `OUT ($${hex(port, 2)}),A` };
  }
  if (op === 0xFE) return { size: 2, text: `CP ${imm8(pc + 1)}` };

  if (x === 0) {
    if (z === 1) return { size: q ? 1 : 3, text: q ? `ADD HL,${regs16[p]}` : `LD ${regs16[p]},${imm16(pc + 1)}` };
    if (z === 2) {
      const forms = q
        ? [`LD A,(BC)`, `LD A,(DE)`, `LD HL,(${imm24(pc + 1)})`, `LD A,(${imm24(pc + 1)})`]
        : [`LD (BC),A`, `LD (DE),A`, `LD (${imm24(pc + 1)}),HL`, `LD (${imm24(pc + 1)}),A`];
      return { size: p >= 2 ? 4 : 1, text: forms[p] };
    }
    if (z === 3) return { size: 1, text: `${q ? 'DEC' : 'INC'} ${regs16[p]}` };
    if (z === 4) return { size: 1, text: `INC ${regs8[y]}` };
    if (z === 5) return { size: 1, text: `DEC ${regs8[y]}` };
    if (z === 6) return { size: 2, text: `LD ${regs8[y]},${imm8(pc + 1)}` };
    if (z === 7) return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }
  if (x === 1) return { size: 1, text: `LD ${regs8[y]},${regs8[z]}` };
  if (x === 2) return { size: 1, text: `${aluOps[y]} ${regs8[z]}` };
  if (x === 3) {
    const rp2 = ['BC', 'DE', 'HL', 'AF'];
    if (z === 0) return { size: 1, text: `RET ${conditions[y]}` };
    if (z === 1) return { size: 1, text: `${q ? ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] : 'POP ' + rp2[p]}` };
    if (z === 3) return { size: 1, text: ['JP (HL)', 'EX (SP),HL', 'DI', 'EI'][p] ?? `DB $${hex(op, 2)}` };
    if (z === 5 && q === 0) return { size: 1, text: `PUSH ${rp2[p]}` };
    if (z === 6) return { size: 2, text: `${aluOps[y]} ${imm8(pc + 1)}` };
  }

  return { size: 1, text: `DB $${hex(op, 2)}` };
}

console.log(`Decode probe: ROM function 0x${hex(START, 6)}`);
console.log(`ROM path: TI-84_Plus_CE/ROM.rom`);
console.log('');
console.log('Address  Bytes             Instruction');
console.log('-------  ----------------  ------------------------------');

let pc = START;
const end = Math.min(START + MAX_BYTES, rom.length);
let terminated = false;

while (pc < end) {
  const decoded = decode(pc);
  console.log(`${hex(pc, 6)}   ${bytesAt(pc, decoded.size).padEnd(16)}  ${decoded.text}`);
  pc += decoded.size;
  if (/^(RET|RETI|RETN)\b/.test(decoded.text)) {
    terminated = true;
    break;
  }
}

function listSet(set, formatter) {
  const values = [...set].sort((a, b) => {
    const aa = typeof a === 'number' ? a : String(a);
    const bb = typeof b === 'number' ? b : String(b);
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
  return values.length ? values.map(formatter).join(', ') : '(none)';
}

console.log('');
console.log('Summary');
console.log(`Function size: ${pc - START} bytes${terminated ? '' : ' (scan limit reached)'}`);
console.log('Purpose hypothesis: computes or validates a DE pointer/range used by 0x0843B3, returning carry set on error and DE on success.');
console.log(`CALL targets: ${listSet(calls, (v) => '$' + hex(v, 6))}`);
console.log(`JP/JR targets: ${listSet(jumps, (v) => '$' + hex(v, 6))}`);
console.log(`RST vectors: ${listSet(rsts, (v) => '$' + hex(v, 2))}`);
console.log(`RAM references: ${listSet(ramRefs, (v) => '$' + hex(v, 6) + (ramNames.has(v) ? ` (${ramNames.get(v)})` : ''))}`);
console.log(`IY references: ${listSet(iyRefs, (v) => v)}`);
console.log(`Port I/O: ${listSet(ports, (v) => v)}`);

process.exit(0);
