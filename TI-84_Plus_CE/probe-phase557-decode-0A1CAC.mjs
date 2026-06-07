import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A1CAC;
const MAX_SCAN = 0x1000;

const rom = readFileSync(ROM_PATH);

const hex = (n, width = 6) => `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;
const hex2 = (n) => hex(n, 2);
const s8 = (n) => (n & 0x80 ? n - 0x100 : n);
const u24 = (addr) => rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
const inRom = (addr) => addr >= 0 && addr < rom.length;

const calls = new Map();
const ramRefs = new Map();
const iyRefs = new Map();
const branches = [];
const decoded = [];

function addMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function readBytes(addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i] ?? 0);
}

function fmtBytes(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function noteRam(addr, at, kind, mnemonic) {
  if (addr >= 0xD00000) addMapSet(ramRefs, addr, `${hex(at)} ${kind} ${mnemonic}`);
}

function noteIy(offset, at, kind, detail) {
  addMapSet(iyRefs, offset, `${hex(at)} ${kind} ${detail}`);
}

function decodeCbBitOp(op) {
  const bit = (op >> 3) & 7;
  if (op >= 0x40 && op <= 0x7F) return `BIT ${bit}`;
  if (op >= 0x80 && op <= 0xBF) return `RES ${bit}`;
  if (op >= 0xC0) return `SET ${bit}`;
  return `CB ${hex2(op)}`;
}

function decodeAt(pc) {
  const op = rom[pc];

  if (op === 0xCD) {
    const target = u24(pc + 1);
    addMapSet(calls, target, hex(pc));
    return { len: 4, mnemonic: `CALL ${hex(target)}` };
  }

  if (op === 0xC3) {
    const target = u24(pc + 1);
    branches.push({ at: pc, kind: 'JP', condition: 'always', target });
    return { len: 4, mnemonic: `JP ${hex(target)}`, terminal: true };
  }

  if (op === 0xC9) return { len: 1, mnemonic: 'RET', terminal: true };

  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)) {
    const conds = {
      0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
      0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M',
    };
    const target = u24(pc + 1);
    branches.push({ at: pc, kind: 'JP', condition: conds[op], target });
    return { len: 4, mnemonic: `JP ${conds[op]},${hex(target)}` };
  }

  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op)) {
    const conds = {
      0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C',
      0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M',
    };
    const target = u24(pc + 1);
    addMapSet(calls, target, `${hex(pc)} (${conds[op]})`);
    return { len: 4, mnemonic: `CALL ${conds[op]},${hex(target)}` };
  }

  if (op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
    const conds = { 0x18: 'always', 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
    const target = pc + 2 + s8(rom[pc + 1]);
    branches.push({ at: pc, kind: 'JR', condition: conds[op], target });
    return { len: 2, mnemonic: `JR ${conds[op] === 'always' ? '' : `${conds[op]},`}${hex(target)}` };
  }

  if (op === 0x10) {
    const target = pc + 2 + s8(rom[pc + 1]);
    branches.push({ at: pc, kind: 'DJNZ', condition: 'B-- != 0', target });
    return { len: 2, mnemonic: `DJNZ ${hex(target)}` };
  }

  if ([0x32, 0x3A, 0x22, 0x2A].includes(op)) {
    const names = {
      0x32: ['write', 'LD (addr),A'],
      0x3A: ['read', 'LD A,(addr)'],
      0x22: ['write', 'LD (addr),HL'],
      0x2A: ['read', 'LD HL,(addr)'],
    };
    const addr = u24(pc + 1);
    noteRam(addr, pc, names[op][0], names[op][1]);
    return { len: 4, mnemonic: `${names[op][1].replace('addr', hex(addr))}` };
  }

  if (op === 0xED) {
    const op2 = rom[pc + 1];
    const edStores = new Map([
      [0x43, ['write', 'LD (addr),BC']],
      [0x4B, ['read', 'LD BC,(addr)']],
      [0x53, ['write', 'LD (addr),DE']],
      [0x5B, ['read', 'LD DE,(addr)']],
      [0x63, ['write', 'LD (addr),SP']],
      [0x73, ['read', 'LD SP,(addr)']],
    ]);
    if (edStores.has(op2)) {
      const [kind, name] = edStores.get(op2);
      const addr = u24(pc + 2);
      noteRam(addr, pc, kind, name);
      return { len: 5, mnemonic: name.replace('addr', hex(addr)) };
    }
    return { len: 2, mnemonic: `ED ${hex2(op2)}` };
  }

  if (op === 0xFD) {
    const op2 = rom[pc + 1];
    if (op2 === 0xCB) {
      const offset = rom[pc + 2];
      const bitOp = decodeCbBitOp(rom[pc + 3]);
      noteIy(offset, pc, bitOp.split(' ')[0], `${bitOp},(IY+${hex2(offset)})`);
      return { len: 4, mnemonic: `${bitOp},(IY+${hex2(offset)})` };
    }

    const iyMemOps = new Map([
      [0x34, ['write', 'INC (IY+d)', 3]],
      [0x35, ['write', 'DEC (IY+d)', 3]],
      [0x36, ['write', 'LD (IY+d),n', 4]],
      [0x46, ['read', 'LD B,(IY+d)', 3]],
      [0x4E, ['read', 'LD C,(IY+d)', 3]],
      [0x56, ['read', 'LD D,(IY+d)', 3]],
      [0x5E, ['read', 'LD E,(IY+d)', 3]],
      [0x66, ['read', 'LD H,(IY+d)', 3]],
      [0x6E, ['read', 'LD L,(IY+d)', 3]],
      [0x70, ['write', 'LD (IY+d),B', 3]],
      [0x71, ['write', 'LD (IY+d),C', 3]],
      [0x72, ['write', 'LD (IY+d),D', 3]],
      [0x73, ['write', 'LD (IY+d),E', 3]],
      [0x74, ['write', 'LD (IY+d),H', 3]],
      [0x75, ['write', 'LD (IY+d),L', 3]],
      [0x77, ['write', 'LD (IY+d),A', 3]],
      [0x7E, ['read', 'LD A,(IY+d)', 3]],
      [0x86, ['read', 'ADD A,(IY+d)', 3]],
      [0x8E, ['read', 'ADC A,(IY+d)', 3]],
      [0x96, ['read', 'SUB (IY+d)', 3]],
      [0x9E, ['read', 'SBC A,(IY+d)', 3]],
      [0xA6, ['read', 'AND (IY+d)', 3]],
      [0xAE, ['read', 'XOR (IY+d)', 3]],
      [0xB6, ['read', 'OR (IY+d)', 3]],
      [0xBE, ['read', 'CP (IY+d)', 3]],
    ]);
    if (iyMemOps.has(op2)) {
      const [kind, name, len] = iyMemOps.get(op2);
      const offset = rom[pc + 2];
      let detail = name.replace('d', hex2(offset));
      if (op2 === 0x36) detail = `LD (IY+${hex2(offset)}),${hex2(rom[pc + 3])}`;
      noteIy(offset, pc, kind, detail);
      return { len, mnemonic: detail };
    }

    if (op2 === 0x21 || op2 === 0x22 || op2 === 0x2A) {
      const addr = u24(pc + 2);
      const name = op2 === 0x21 ? 'LD IY,addr' : op2 === 0x22 ? 'LD (addr),IY' : 'LD IY,(addr)';
      noteRam(addr, pc, op2 === 0x2A ? 'read' : 'write', name);
      return { len: 5, mnemonic: name.replace('addr', hex(addr)) };
    }

    return { len: 2, mnemonic: `FD ${hex2(op2)}` };
  }

  const oneByteNames = {
    0x00: 'NOP', 0x01: 'LD BC,nn', 0x02: 'LD (BC),A', 0x03: 'INC BC',
    0x04: 'INC B', 0x05: 'DEC B', 0x06: 'LD B,n', 0x07: 'RLCA',
    0x08: "EX AF,AF'", 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x0E: 'LD C,n', 0x0F: 'RRCA',
    0x11: 'LD DE,nn', 0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D',
    0x15: 'DEC D', 0x16: 'LD D,n', 0x17: 'RLA', 0x19: 'ADD HL,DE',
    0x1A: 'LD A,(DE)', 0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E',
    0x1E: 'LD E,n', 0x1F: 'RRA', 0x21: 'LD HL,nn', 0x23: 'INC HL',
    0x24: 'INC H', 0x25: 'DEC H', 0x26: 'LD H,n', 0x29: 'ADD HL,HL',
    0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L', 0x2E: 'LD L,n',
    0x31: 'LD SP,nn', 0x33: 'INC SP', 0x37: 'SCF', 0x3C: 'INC A',
    0x3D: 'DEC A', 0x3E: 'LD A,n', 0x76: 'HALT', 0xE9: 'JP (HL)',
  };
  const immLens = new Map([[0x01, 4], [0x06, 2], [0x0E, 2], [0x11, 4], [0x16, 2], [0x1E, 2], [0x21, 4], [0x26, 2], [0x2E, 2], [0x31, 4], [0x3E, 2]]);
  return { len: immLens.get(op) ?? 1, mnemonic: oneByteNames[op] ?? `DB ${hex2(op)}` };
}

let pc = START;
let end = START;
let terminalReason = 'scan limit reached';

while (pc < START + MAX_SCAN && inRom(pc)) {
  const insn = decodeAt(pc);
  const bytes = readBytes(pc, insn.len);
  decoded.push({ addr: pc, bytes, mnemonic: insn.mnemonic });
  pc += insn.len;
  end = pc;
  if (insn.terminal) {
    terminalReason = insn.mnemonic;
    break;
  }
}

function printMap(title, map, keyFmt = (x) => hex(x)) {
  console.log(`\n${title}:`);
  if (map.size === 0) {
    console.log('  (none found)');
    return;
  }
  for (const [key, values] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${keyFmt(key)}:`);
    for (const value of [...values].sort()) console.log(`    - ${value}`);
  }
}

console.log('Phase 557: Decode text output / string rendering function 0x0A1CAC');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Function start: ${hex(START)}`);
console.log(`Function end: ${hex(end)}`);
console.log(`Function size: ${end - START} bytes`);
console.log(`Terminator: ${terminalReason}`);

console.log('\nDisassembly / interpreted bytes:');
for (const row of decoded) {
  console.log(`  ${hex(row.addr)}  ${fmtBytes(row.bytes).padEnd(14)}  ${row.mnemonic}`);
}

printMap('CALL targets', calls);
printMap('RAM address references >= 0xD00000', ramRefs);
printMap('IY-relative references', iyRefs, (offset) => `IY+${hex2(offset)}`);

console.log('\nConditional / unconditional branches:');
if (branches.length === 0) {
  console.log('  (none found)');
} else {
  for (const branch of branches) {
    console.log(`  ${hex(branch.at)}: ${branch.kind} ${branch.condition} -> ${hex(branch.target)}`);
  }
}
