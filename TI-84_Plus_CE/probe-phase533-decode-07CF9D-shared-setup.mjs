import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const start = 0x07CF9D;
const minBytes = 60;
const maxBytes = 128;

function readRomByte(addr) {
  return rom[addr];
}

function readRomWord(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function readRom24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) =>
    readRomByte(addr + i).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

const conditions = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const aluOps = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];

function decodeCb(addr) {
  const op = readRomByte(addr + 1);
  const group = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (group === 0) return { len: 2, text: `${rot[y]} ${regs8[z]}` };
  if (group === 1) return { len: 2, text: `BIT ${y},${regs8[z]}` };
  if (group === 2) return { len: 2, text: `RES ${y},${regs8[z]}` };
  return { len: 2, text: `SET ${y},${regs8[z]}` };
}

function decodeEd(addr) {
  const op = readRomByte(addr + 1);
  const known = new Map([
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x4D, 'RETI'],
    [0x47, 'LD I,A'],
    [0x4F, 'LD R,A'],
    [0x57, 'LD A,I'],
    [0x5F, 'LD A,R'],
    [0x67, 'RRD'],
    [0x6F, 'RLD'],
    [0xA0, 'LDI'],
    [0xA1, 'CPI'],
    [0xA2, 'INI'],
    [0xA3, 'OUTI'],
    [0xA8, 'LDD'],
    [0xA9, 'CPD'],
    [0xAA, 'IND'],
    [0xAB, 'OUTD'],
    [0xB0, 'LDIR'],
    [0xB1, 'CPIR'],
    [0xB2, 'INIR'],
    [0xB3, 'OTIR'],
    [0xB8, 'LDDR'],
    [0xB9, 'CPDR'],
    [0xBA, 'INDR'],
    [0xBB, 'OTDR'],
  ]);
  if (known.has(op)) return { len: 2, text: known.get(op), terminates: op === 0x45 || op === 0x4D };

  if ((op & 0xC7) === 0x40) return { len: 2, text: `IN ${regs8[(op >> 3) & 7]},(C)` };
  if ((op & 0xC7) === 0x41) return { len: 2, text: `OUT (C),${regs8[(op >> 3) & 7]}` };
  if ((op & 0xCF) === 0x42) return { len: 2, text: `SBC HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x4A) return { len: 2, text: `ADC HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x43) {
    const target = readRomWord(addr + 2);
    return { len: 4, text: `LD (${hex(target, 4)}),${rp[(op >> 4) & 3]}` };
  }
  if ((op & 0xCF) === 0x4B) {
    const target = readRomWord(addr + 2);
    return { len: 4, text: `LD ${rp[(op >> 4) & 3]},(${hex(target, 4)})` };
  }
  return { len: 2, text: `DB ED ${op.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decodeIxIy(addr, prefix, regName) {
  const op = readRomByte(addr + 1);
  const disp = signed8(readRomByte(addr + 2));
  const known2 = new Map([
    [0x09, `ADD ${regName},BC`],
    [0x19, `ADD ${regName},DE`],
    [0x21, `LD ${regName},${hex(readRomWord(addr + 2), 4)}`],
    [0x22, `LD (${hex(readRomWord(addr + 2), 4)}),${regName}`],
    [0x23, `INC ${regName}`],
    [0x29, `ADD ${regName},${regName}`],
    [0x2A, `LD ${regName},(${hex(readRomWord(addr + 2), 4)})`],
    [0x2B, `DEC ${regName}`],
    [0x34, `INC (${regName}${disp < 0 ? '' : '+'}${disp})`],
    [0x35, `DEC (${regName}${disp < 0 ? '' : '+'}${disp})`],
    [0x36, `LD (${regName}${disp < 0 ? '' : '+'}${disp}),${hex(readRomByte(addr + 3), 2)}`],
    [0x39, `ADD ${regName},SP`],
    [0xE1, `POP ${regName}`],
    [0xE3, `EX (SP),${regName}`],
    [0xE5, `PUSH ${regName}`],
    [0xE9, `JP (${regName})`],
    [0xF9, `LD SP,${regName}`],
  ]);
  if (op === 0x21 || op === 0x22 || op === 0x2A) return { len: 4, text: known2.get(op) };
  if (op === 0x34 || op === 0x35) return { len: 3, text: known2.get(op) };
  if (op === 0x36) return { len: 4, text: known2.get(op) };
  if (known2.has(op)) return { len: 2, text: known2.get(op), terminates: op === 0xE9 };
  if (op === 0xCB) {
    const cb = readRomByte(addr + 3);
    const bit = (cb >> 3) & 7;
    const group = cb >> 6;
    const z = cb & 7;
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const mem = `(${regName}${disp < 0 ? '' : '+'}${disp})`;
    const suffix = z === 6 ? mem : `${mem},${regs8[z]}`;
    if (group === 0) return { len: 4, text: `${rot[bit]} ${suffix}` };
    if (group === 1) return { len: 4, text: `BIT ${bit},${mem}` };
    if (group === 2) return { len: 4, text: `RES ${bit},${suffix}` };
    return { len: 4, text: `SET ${bit},${suffix}` };
  }
  return { len: 1, text: `DB ${prefix.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decode(addr) {
  const op = readRomByte(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xCB) return decodeCb(addr);
  if (op === 0xED) return decodeEd(addr);
  if (op === 0xDD) return decodeIxIy(addr, op, 'IX');
  if (op === 0xFD) return decodeIxIy(addr, op, 'IY');

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, text: 'NOP' };
      if (y === 1) return { len: 3, text: `EX AF,AF'` };
      if (y === 2) {
        const target = (addr + 2 + signed8(readRomByte(addr + 1))) & 0xFFFFFF;
        return { len: 2, text: `DJNZ ${hex(target, 6)}`, branchTarget: target };
      }
      if (y === 3) {
        const target = (addr + 2 + signed8(readRomByte(addr + 1))) & 0xFFFFFF;
        return { len: 2, text: `JR ${hex(target, 6)}`, branchTarget: target };
      }
      const target = (addr + 2 + signed8(readRomByte(addr + 1))) & 0xFFFFFF;
      return { len: 2, text: `JR ${conditions[y - 4]},${hex(target, 6)}`, branchTarget: target };
    }
    if (z === 1) {
      if (q === 0) return { len: 3, text: `LD ${rp[p]},${hex(readRomWord(addr + 1), 4)}` };
      return { len: 1, text: `ADD HL,${rp[p]}` };
    }
    if (z === 2) {
      const forms = [
        `LD (BC),A`,
        `LD A,(BC)`,
        `LD (DE),A`,
        `LD A,(DE)`,
        `LD (${hex(readRomWord(addr + 1), 4)}),HL`,
        `LD HL,(${hex(readRomWord(addr + 1), 4)})`,
        `LD (${hex(readRomWord(addr + 1), 4)}),A`,
        `LD A,(${hex(readRomWord(addr + 1), 4)})`,
      ];
      return { len: y >= 4 ? 3 : 1, text: forms[y] };
    }
    if (z === 3) return { len: 1, text: `${q === 0 ? 'INC' : 'DEC'} ${rp[p]}` };
    if (z === 4) return { len: 1, text: `INC ${regs8[y]}` };
    if (z === 5) return { len: 1, text: `DEC ${regs8[y]}` };
    if (z === 6) return { len: 2, text: `LD ${regs8[y]},${hex(readRomByte(addr + 1), 2)}` };
    return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, text: 'HALT', terminates: true };
    return { len: 1, text: `LD ${regs8[y]},${regs8[z]}` };
  }

  if (x === 2) return { len: 1, text: `${aluOps[y]} ${regs8[z]}` };

  if (z === 0) return { len: 1, text: `RET ${conditions[y]}`, terminates: false };
  if (z === 1) {
    if (q === 0) return { len: 1, text: `POP ${rp2[p]}` };
    return { len: 1, text: ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p], terminates: p === 0 || p === 2 };
  }
  if (z === 2) {
    const target = readRom24(addr + 1);
    return { len: 4, text: `JP ${conditions[y]},${hex(target, 6)}`, branchTarget: target, terminates: false };
  }
  if (z === 3) {
    if (y === 0) {
      const target = readRom24(addr + 1);
      return { len: 4, text: `JP ${hex(target, 6)}`, branchTarget: target, terminates: true };
    }
    if (y === 2) {
      const port = readRomByte(addr + 1);
      return { len: 2, text: `OUT (${hex(port, 2)}),A` };
    }
    if (y === 3) {
      const port = readRomByte(addr + 1);
      return { len: 2, text: `IN A,(${hex(port, 2)})` };
    }
    return { len: 1, text: ['DB C3', 'DB CB', 'OUT', 'IN', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'][y] };
  }
  if (z === 4) {
    const target = readRom24(addr + 1);
    return { len: 4, text: `CALL ${conditions[y]},${hex(target, 6)}`, callTarget: target };
  }
  if (z === 5) {
    if (q === 0) return { len: 1, text: `PUSH ${rp2[p]}` };
    if (p === 0) {
      const target = readRom24(addr + 1);
      return { len: 4, text: `CALL ${hex(target, 6)}`, callTarget: target };
    }
    return { len: 1, text: ['DB C5', 'CALL', 'DB ED', 'DB FD'][p] };
  }
  if (z === 6) return { len: 2, text: `${aluOps[y]} ${hex(readRomByte(addr + 1), 2)}` };
  return { len: 1, text: `RST ${hex(y * 8, 2)}`, branchTarget: y * 8 };
}

console.log(`Disassembly of shared setup routine at ${hex(start, 6)}`);
console.log(`Reading ${maxBytes} bytes from ROM; stop after terminator once at least ${minBytes} bytes are covered.`);

const targets = [];
let pc = start;
while (pc < start + maxBytes) {
  const ins = decode(pc);
  const raw = bytesAt(pc, ins.len).padEnd(12, ' ');
  console.log(`${hex(pc, 6)}  ${raw}  ${ins.text}`);
  if (ins.callTarget !== undefined) targets.push({ kind: 'CALL', from: pc, to: ins.callTarget });
  if (ins.branchTarget !== undefined) {
    const kind = ins.text.startsWith('JP') ? 'JP' : ins.text.startsWith('JR') ? 'JR' : 'BRANCH';
    targets.push({ kind, from: pc, to: ins.branchTarget });
  }
  pc += ins.len;
  if (ins.terminates && pc - start >= minBytes) break;
}

console.log('');
console.log('Control-flow targets:');
if (targets.length === 0) {
  console.log('  (none)');
} else {
  for (const target of targets) {
    console.log(`  ${target.kind} from ${hex(target.from, 6)} -> ${hex(target.to, 6)}`);
  }
}
