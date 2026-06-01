import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const FUNCTION_START = 0x030202;
const FUNCTION_END = 0x03030f;
const IY_BASE = 0xd00080;
const TRACK_START = 0xd00080;
const TRACK_END = 0xd000ff;
const SENTINEL_RETURN = 0x500000;
const STACK_ADDR = 0xd3ff00;

const BOOT_STAGES = [
  { name: 'stage 1', addr: 0x000000, mode: 'z80', maxSteps: 20_000 },
  { name: 'stage 2', addr: 0x08c331, mode: 'adl', maxSteps: 200_000 },
  { name: 'stage 3', addr: 0x0802b2, mode: 'adl', maxSteps: 200_000 },
];

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const ALU = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
const CONDITIONS = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr24(value) {
  return hex(value & 0xffffff, 6);
}

function byteList(bytes) {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function dispText(value) {
  const signed = signed8(value);
  return signed < 0 ? `-${hex(-signed)}` : `+${hex(signed)}`;
}

function relTarget(pc, length, offset) {
  return (pc + length + signed8(offset)) & 0xffffff;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function makeInstruction(mem, addr, length, mnemonic, extra = {}) {
  return {
    addr,
    length,
    bytes: Array.from(mem.slice(addr, addr + length)),
    mnemonic,
    reads: [],
    writes: [],
    ...extra,
  };
}

function absRead(address, reason) {
  return { kind: 'absolute', address: address & 0xffffff, text: addr24(address), reason };
}

function absWrite(address, reason) {
  return { kind: 'absolute', address: address & 0xffffff, text: addr24(address), reason };
}

function indexedRead(indexReg, displacement, reason) {
  const signed = signed8(displacement);
  const address = indexReg === 'IY' ? (IY_BASE + signed) & 0xffffff : null;
  return {
    kind: 'indexed',
    indexReg,
    displacement: signed,
    address,
    text: `${indexReg}${dispText(displacement)}`,
    reason,
  };
}

function indexedWrite(indexReg, displacement, reason) {
  const signed = signed8(displacement);
  const address = indexReg === 'IY' ? (IY_BASE + signed) & 0xffffff : null;
  return {
    kind: 'indexed',
    indexReg,
    displacement: signed,
    address,
    text: `${indexReg}${dispText(displacement)}`,
    reason,
  };
}

function decodeUnprefixed(mem, pc) {
  const op = mem[pc];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0x00) return makeInstruction(mem, pc, 1, 'NOP');
  if (op === 0x07) return makeInstruction(mem, pc, 1, 'RLCA', { flagSetter: true });
  if (op === 0x0f) return makeInstruction(mem, pc, 1, 'RRCA', { flagSetter: true });
  if (op === 0x17) return makeInstruction(mem, pc, 1, 'RLA', { flagSetter: true });
  if (op === 0x1f) return makeInstruction(mem, pc, 1, 'RRA', { flagSetter: true });
  if (op === 0x27) return makeInstruction(mem, pc, 1, 'DAA', { flagSetter: true });
  if (op === 0x2f) return makeInstruction(mem, pc, 1, 'CPL');
  if (op === 0x37) return makeInstruction(mem, pc, 1, 'SCF', { flagSetter: true });
  if (op === 0x3f) return makeInstruction(mem, pc, 1, 'CCF', { flagSetter: true });
  if (op === 0x76) return makeInstruction(mem, pc, 1, 'HALT');

  if (op === 0x08) return makeInstruction(mem, pc, 1, "EX AF,AF'");
  if (op === 0x10) {
    const target = relTarget(pc, 2, mem[pc + 1]);
    return makeInstruction(mem, pc, 2, `DJNZ ${addr24(target)}`, { branchTarget: target, condition: 'B!=0' });
  }
  if (op === 0x18) {
    const target = relTarget(pc, 2, mem[pc + 1]);
    return makeInstruction(mem, pc, 2, `JR ${addr24(target)}`, { branchTarget: target });
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const condition = ['NZ', 'Z', 'NC', 'C'][(op - 0x20) >> 3];
    const target = relTarget(pc, 2, mem[pc + 1]);
    return makeInstruction(mem, pc, 2, `JR ${condition},${addr24(target)}`, { branchTarget: target, condition });
  }

  if (op === 0x02) {
    const instr = makeInstruction(mem, pc, 1, 'LD (BC),A');
    instr.writes.push({ kind: 'register-indirect', text: 'BC', reason: 'LD (BC),A' });
    return instr;
  }
  if (op === 0x0a) {
    const instr = makeInstruction(mem, pc, 1, 'LD A,(BC)');
    instr.reads.push({ kind: 'register-indirect', text: 'BC', reason: 'LD A,(BC)' });
    return instr;
  }
  if (op === 0x12) {
    const instr = makeInstruction(mem, pc, 1, 'LD (DE),A');
    instr.writes.push({ kind: 'register-indirect', text: 'DE', reason: 'LD (DE),A' });
    return instr;
  }
  if (op === 0x1a) {
    const instr = makeInstruction(mem, pc, 1, 'LD A,(DE)');
    instr.reads.push({ kind: 'register-indirect', text: 'DE', reason: 'LD A,(DE)' });
    return instr;
  }
  if (op === 0x22) {
    const address = read24(mem, pc + 1);
    const instr = makeInstruction(mem, pc, 4, `LD (${addr24(address)}),HL`);
    instr.writes.push(absWrite(address, 'LD (nn),HL'));
    return instr;
  }
  if (op === 0x2a) {
    const address = read24(mem, pc + 1);
    const instr = makeInstruction(mem, pc, 4, `LD HL,(${addr24(address)})`);
    instr.reads.push(absRead(address, 'LD HL,(nn)'));
    return instr;
  }
  if (op === 0x32) {
    const address = read24(mem, pc + 1);
    const instr = makeInstruction(mem, pc, 4, `LD (${addr24(address)}),A`);
    instr.writes.push(absWrite(address, 'LD (nn),A'));
    return instr;
  }
  if (op === 0x3a) {
    const address = read24(mem, pc + 1);
    const instr = makeInstruction(mem, pc, 4, `LD A,(${addr24(address)})`);
    instr.reads.push(absRead(address, 'LD A,(nn)'));
    return instr;
  }

  if (x === 0 && z === 1) {
    if (q === 0) {
      const value = read24(mem, pc + 1);
      return makeInstruction(mem, pc, 4, `LD ${RP[p]},${addr24(value)}`);
    }
    return makeInstruction(mem, pc, 1, `ADD HL,${RP[p]}`, { flagSetter: true });
  }
  if (x === 0 && z === 3) return makeInstruction(mem, pc, 1, `${q === 0 ? 'INC' : 'DEC'} ${RP[p]}`);
  if (x === 0 && z === 4) {
    const instr = makeInstruction(mem, pc, 1, `INC ${REG8[y]}`, { flagSetter: true });
    if (y === 6) {
      instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: 'INC (HL)' });
      instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: 'INC (HL)' });
    }
    return instr;
  }
  if (x === 0 && z === 5) {
    const instr = makeInstruction(mem, pc, 1, `DEC ${REG8[y]}`, { flagSetter: true });
    if (y === 6) {
      instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: 'DEC (HL)' });
      instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: 'DEC (HL)' });
    }
    return instr;
  }
  if (x === 0 && z === 6) {
    const value = mem[pc + 1];
    const instr = makeInstruction(mem, pc, 2, `LD ${REG8[y]},${hex(value)}`);
    if (y === 6) instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: 'LD (HL),n' });
    if (y === 7 && [0xe1, 0xe2, 0xe3].includes(value)) instr.glyphLoad = value;
    return instr;
  }

  if (x === 1) {
    const dest = REG8[y];
    const src = REG8[z];
    const instr = makeInstruction(mem, pc, 1, `LD ${dest},${src}`);
    if (src === '(HL)') instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: `LD ${dest},(HL)` });
    if (dest === '(HL)') instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: `LD (HL),${src}` });
    return instr;
  }

  if (x === 2) {
    const operand = REG8[z];
    const mnemonic = y === 0 || y === 1 ? `${ALU[y]} A,${operand}` : `${ALU[y]} ${operand}`;
    const instr = makeInstruction(mem, pc, 1, mnemonic, {
      flagSetter: true,
      cpRegister: y === 7 ? operand : null,
    });
    if (operand === '(HL)') instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: `${ALU[y]} (HL)` });
    return instr;
  }

  if (x === 3 && z === 0) {
    const condition = CONDITIONS[y];
    return makeInstruction(mem, pc, 1, `RET ${condition}`, { ret: true, condition });
  }
  if (x === 3 && z === 1) {
    if (q === 0) return makeInstruction(mem, pc, 1, `POP ${RP2[p]}`);
    if (p === 0) return makeInstruction(mem, pc, 1, 'RET', { ret: true });
    if (p === 1) return makeInstruction(mem, pc, 1, 'EXX');
    if (p === 2) return makeInstruction(mem, pc, 1, 'JP (HL)', { branchTarget: 'HL' });
    if (p === 3) return makeInstruction(mem, pc, 1, 'LD SP,HL');
  }
  if (x === 3 && z === 2) {
    const condition = CONDITIONS[y];
    const target = read24(mem, pc + 1);
    return makeInstruction(mem, pc, 4, `JP ${condition},${addr24(target)}`, { branchTarget: target, condition });
  }
  if (x === 3 && z === 3) {
    if (op === 0xc3) {
      const target = read24(mem, pc + 1);
      return makeInstruction(mem, pc, 4, `JP ${addr24(target)}`, { branchTarget: target });
    }
    if (op === 0xcb) return decodeCb(mem, pc);
    if (op === 0xcd) {
      const target = read24(mem, pc + 1);
      return makeInstruction(mem, pc, 4, `CALL ${addr24(target)}`, { callTarget: target });
    }
    if (op === 0xed) return decodeEd(mem, pc);
    if (op === 0xdd) return decodeIndex(mem, pc, 'IX');
    if (op === 0xfd) return decodeIndex(mem, pc, 'IY');
    if (op === 0xe3) return makeInstruction(mem, pc, 1, 'EX (SP),HL');
    if (op === 0xe9) return makeInstruction(mem, pc, 1, 'JP (HL)', { branchTarget: 'HL' });
    if (op === 0xf3) return makeInstruction(mem, pc, 1, 'DI');
    if (op === 0xfb) return makeInstruction(mem, pc, 1, 'EI');
  }
  if (x === 3 && z === 4) {
    const condition = CONDITIONS[y];
    const target = read24(mem, pc + 1);
    return makeInstruction(mem, pc, 4, `CALL ${condition},${addr24(target)}`, { callTarget: target, condition });
  }
  if (x === 3 && z === 5) {
    if (q === 0) return makeInstruction(mem, pc, 1, `PUSH ${RP2[p]}`);
    const value = mem[pc + 1];
    const instr = makeInstruction(mem, pc, 2, `${ALU[y]} ${y <= 1 ? `A,${hex(value)}` : hex(value)}`, {
      flagSetter: true,
      cpImmediate: y === 7 ? value : null,
    });
    return instr;
  }
  if (x === 3 && z === 6) {
    const value = mem[pc + 1];
    const instr = makeInstruction(mem, pc, 2, `${ALU[y]} ${y <= 1 ? `A,${hex(value)}` : hex(value)}`, {
      flagSetter: true,
      cpImmediate: y === 7 ? value : null,
    });
    return instr;
  }
  if (x === 3 && z === 7) return makeInstruction(mem, pc, 1, `RST ${hex(y * 8)}`, { callTarget: y * 8 });

  return makeInstruction(mem, pc, 1, `DB ${hex(op)}`);
}

function decodeCb(mem, pc) {
  const op = mem[pc + 1];
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = REG8[z];
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (op < 0x40) {
    const instr = makeInstruction(mem, pc, 2, `${rot[y]} ${target}`, { flagSetter: true });
    if (target === '(HL)') {
      instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: `${rot[y]} (HL)` });
      instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: `${rot[y]} (HL)` });
    }
    return instr;
  }
  const group = op < 0x80 ? 'BIT' : op < 0xc0 ? 'RES' : 'SET';
  const bit = y;
  const instr = makeInstruction(mem, pc, 2, `${group} ${bit},${target}`, { flagSetter: group === 'BIT' });
  if (target === '(HL)') {
    instr.reads.push({ kind: 'register-indirect', text: 'HL', reason: `${group} ${bit},(HL)` });
    if (group !== 'BIT') instr.writes.push({ kind: 'register-indirect', text: 'HL', reason: `${group} ${bit},(HL)` });
  }
  return instr;
}

function indexRegNames(indexReg) {
  return ['B', 'C', 'D', 'E', `${indexReg}H`, `${indexReg}L`, `(${indexReg}+d)`, 'A'];
}

function decodeIndex(mem, pc, indexReg) {
  const op = mem[pc + 1];
  const regs = indexRegNames(indexReg);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xcb) return decodeIndexCb(mem, pc, indexReg);
  if (op === 0x21) return makeInstruction(mem, pc, 5, `LD ${indexReg},${addr24(read24(mem, pc + 2))}`);
  if (op === 0x22) {
    const address = read24(mem, pc + 2);
    const instr = makeInstruction(mem, pc, 5, `LD (${addr24(address)}),${indexReg}`);
    instr.writes.push(absWrite(address, `LD (nn),${indexReg}`));
    return instr;
  }
  if (op === 0x2a) {
    const address = read24(mem, pc + 2);
    const instr = makeInstruction(mem, pc, 5, `LD ${indexReg},(${addr24(address)})`);
    instr.reads.push(absRead(address, `LD ${indexReg},(nn)`));
    return instr;
  }
  if (op === 0x23) return makeInstruction(mem, pc, 2, `INC ${indexReg}`);
  if (op === 0x2b) return makeInstruction(mem, pc, 2, `DEC ${indexReg}`);
  if ([0x09, 0x19, 0x29, 0x39].includes(op)) return makeInstruction(mem, pc, 2, `ADD ${indexReg},${RP[p]}`, { flagSetter: true });
  if (op === 0xe1) return makeInstruction(mem, pc, 2, `POP ${indexReg}`);
  if (op === 0xe3) return makeInstruction(mem, pc, 2, `EX (SP),${indexReg}`);
  if (op === 0xe5) return makeInstruction(mem, pc, 2, `PUSH ${indexReg}`);
  if (op === 0xe9) return makeInstruction(mem, pc, 2, `JP (${indexReg})`, { branchTarget: indexReg });
  if (op === 0xf9) return makeInstruction(mem, pc, 2, `LD SP,${indexReg}`);

  if (x === 0 && z === 4) {
    if (y === 6) {
      const displacement = mem[pc + 2];
      const instr = makeInstruction(mem, pc, 3, `INC (${indexReg}${dispText(displacement)})`, { flagSetter: true });
      instr.reads.push(indexedRead(indexReg, displacement, 'INC indexed'));
      instr.writes.push(indexedWrite(indexReg, displacement, 'INC indexed'));
      return instr;
    }
    return makeInstruction(mem, pc, 2, `INC ${regs[y]}`, { flagSetter: true });
  }
  if (x === 0 && z === 5) {
    if (y === 6) {
      const displacement = mem[pc + 2];
      const instr = makeInstruction(mem, pc, 3, `DEC (${indexReg}${dispText(displacement)})`, { flagSetter: true });
      instr.reads.push(indexedRead(indexReg, displacement, 'DEC indexed'));
      instr.writes.push(indexedWrite(indexReg, displacement, 'DEC indexed'));
      return instr;
    }
    return makeInstruction(mem, pc, 2, `DEC ${regs[y]}`, { flagSetter: true });
  }
  if (x === 0 && z === 6) {
    const value = mem[pc + 2];
    if (y === 6) {
      const displacement = mem[pc + 2];
      const immediate = mem[pc + 3];
      const instr = makeInstruction(mem, pc, 4, `LD (${indexReg}${dispText(displacement)}),${hex(immediate)}`);
      instr.writes.push(indexedWrite(indexReg, displacement, 'LD indexed,n'));
      return instr;
    }
    const instr = makeInstruction(mem, pc, 3, `LD ${regs[y]},${hex(value)}`);
    if (y === 7 && [0xe1, 0xe2, 0xe3].includes(value)) instr.glyphLoad = value;
    return instr;
  }

  if (x === 1) {
    if (op === 0x76) return makeInstruction(mem, pc, 2, 'HALT');
    const dest = regs[y];
    const src = regs[z];
    if (y === 6 || z === 6) {
      const displacement = mem[pc + 2];
      const target = `(${indexReg}${dispText(displacement)})`;
      if (y === 6) {
        const instr = makeInstruction(mem, pc, 3, `LD ${target},${src}`);
        instr.writes.push(indexedWrite(indexReg, displacement, `LD indexed,${src}`));
        return instr;
      }
      const instr = makeInstruction(mem, pc, 3, `LD ${dest},${target}`);
      instr.reads.push(indexedRead(indexReg, displacement, `LD ${dest},indexed`));
      return instr;
    }
    return makeInstruction(mem, pc, 2, `LD ${dest},${src}`);
  }

  if (x === 2) {
    if (z === 6) {
      const displacement = mem[pc + 2];
      const target = `(${indexReg}${dispText(displacement)})`;
      const mnemonic = y === 0 || y === 1 ? `${ALU[y]} A,${target}` : `${ALU[y]} ${target}`;
      const instr = makeInstruction(mem, pc, 3, mnemonic, {
        flagSetter: true,
        cpIndexed: y === 7 ? { indexReg, displacement: signed8(displacement) } : null,
      });
      instr.reads.push(indexedRead(indexReg, displacement, `${ALU[y]} indexed`));
      return instr;
    }
    const operand = regs[z];
    const mnemonic = y === 0 || y === 1 ? `${ALU[y]} A,${operand}` : `${ALU[y]} ${operand}`;
    return makeInstruction(mem, pc, 2, mnemonic, { flagSetter: true, cpRegister: y === 7 ? operand : null });
  }

  const child = decodeUnprefixed(mem, pc + 1);
  return {
    ...child,
    addr: pc,
    length: child.length + 1,
    bytes: Array.from(mem.slice(pc, pc + child.length + 1)),
    mnemonic: `${indexReg} prefix ${child.mnemonic}`,
  };
}

function decodeIndexCb(mem, pc, indexReg) {
  const displacement = mem[pc + 2];
  const op = mem[pc + 3];
  const y = (op >> 3) & 7;
  const z = op & 7;
  const regs = indexRegNames(indexReg);
  const target = `(${indexReg}${dispText(displacement)})`;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

  if (op < 0x40) {
    const regSuffix = z === 6 ? '' : `,${regs[z]}`;
    const instr = makeInstruction(mem, pc, 4, `${rot[y]} ${target}${regSuffix}`, { flagSetter: true });
    instr.reads.push(indexedRead(indexReg, displacement, `${rot[y]} indexed`));
    instr.writes.push(indexedWrite(indexReg, displacement, `${rot[y]} indexed`));
    return instr;
  }

  const group = op < 0x80 ? 'BIT' : op < 0xc0 ? 'RES' : 'SET';
  const regSuffix = group === 'BIT' || z === 6 ? '' : `,${regs[z]}`;
  const instr = makeInstruction(mem, pc, 4, `${group} ${y},${target}${regSuffix}`, { flagSetter: group === 'BIT' });
  instr.reads.push(indexedRead(indexReg, displacement, `${group} indexed`));
  if (group !== 'BIT') instr.writes.push(indexedWrite(indexReg, displacement, `${group} indexed`));
  return instr;
}

function decodeEd(mem, pc) {
  const op = mem[pc + 1];
  const loadPairs = new Map([
    [0x43, ['LD', 'write', 'BC']],
    [0x4b, ['LD', 'read', 'BC']],
    [0x53, ['LD', 'write', 'DE']],
    [0x5b, ['LD', 'read', 'DE']],
    [0x63, ['LD', 'write', 'HL']],
    [0x6b, ['LD', 'read', 'HL']],
    [0x73, ['LD', 'write', 'SP']],
    [0x7b, ['LD', 'read', 'SP']],
  ]);
  if (loadPairs.has(op)) {
    const [, direction, reg] = loadPairs.get(op);
    const address = read24(mem, pc + 2);
    const mnemonic = direction === 'read' ? `LD ${reg},(${addr24(address)})` : `LD (${addr24(address)}),${reg}`;
    const instr = makeInstruction(mem, pc, 5, `ED ${mnemonic}`);
    if (direction === 'read') instr.reads.push(absRead(address, mnemonic));
    else instr.writes.push(absWrite(address, mnemonic));
    return instr;
  }

  const simple = new Map([
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x46, 'IM 0'],
    [0x47, 'LD I,A'],
    [0x4d, 'RETI'],
    [0x4f, 'LD R,A'],
    [0x56, 'IM 1'],
    [0x57, 'LD A,I'],
    [0x5e, 'IM 2'],
    [0x5f, 'LD A,R'],
    [0x67, 'RRD'],
    [0x6f, 'RLD'],
    [0xa0, 'LDI'],
    [0xa1, 'CPI'],
    [0xa2, 'INI'],
    [0xa3, 'OUTI'],
    [0xa8, 'LDD'],
    [0xa9, 'CPD'],
    [0xaa, 'IND'],
    [0xab, 'OUTD'],
    [0xb0, 'LDIR'],
    [0xb1, 'CPIR'],
    [0xb2, 'INIR'],
    [0xb3, 'OTIR'],
    [0xb8, 'LDDR'],
    [0xb9, 'CPDR'],
    [0xba, 'INDR'],
    [0xbb, 'OTDR'],
  ]);
  if (simple.has(op)) {
    const mnemonic = simple.get(op);
    return makeInstruction(mem, pc, 2, `ED ${mnemonic}`, {
      ret: mnemonic === 'RETN' || mnemonic === 'RETI',
      flagSetter: /^(NEG|LD A,|RRD|RLD|CPI|CPD|CPIR|CPDR)/.test(mnemonic),
    });
  }

  if ((op & 0xc7) === 0x40) {
    const reg = REG8[(op >> 3) & 7];
    return makeInstruction(mem, pc, 2, `ED IN ${reg},(C)`, { flagSetter: true });
  }
  if ((op & 0xc7) === 0x41) {
    const reg = REG8[(op >> 3) & 7];
    return makeInstruction(mem, pc, 2, `ED OUT (C),${reg}`);
  }
  if ((op & 0xcf) === 0x42) {
    const operation = op & 0x08 ? 'ADC' : 'SBC';
    const reg = RP[(op >> 4) & 3];
    return makeInstruction(mem, pc, 2, `ED ${operation} HL,${reg}`, { flagSetter: true });
  }

  return makeInstruction(mem, pc, 2, `ED DB ${hex(op)}`);
}

function decodeRange(mem, start, end) {
  const decoded = [];
  for (let pc = start; pc < end;) {
    const instr = decodeUnprefixed(mem, pc);
    decoded.push(instr);
    pc += Math.max(instr.length, 1);
  }
  return decoded;
}

function printDecode(decoded) {
  console.log(`\n=== Static decode ${addr24(FUNCTION_START)}..${addr24(FUNCTION_END - 1)} ===`);
  for (const instr of decoded) {
    console.log(`${addr24(instr.addr)}  ${byteList(instr.bytes).padEnd(17)}  ${instr.mnemonic}`);
  }
}

function collectMemoryReads(decoded) {
  const byKey = new Map();
  for (const instr of decoded) {
    for (const read of instr.reads) {
      const key = read.address == null ? `${read.kind}:${read.text}` : `addr:${read.address}`;
      if (!byKey.has(key)) byKey.set(key, { ...read, instrs: [] });
      byKey.get(key).instrs.push(instr);
    }
  }
  return [...byKey.values()];
}

function nearestFlagSetter(decoded, index) {
  for (let i = index - 1; i >= 0 && i >= index - 6; i--) {
    if (decoded[i].flagSetter) return decoded[i];
    if (decoded[i].ret || decoded[i].branchTarget != null) break;
  }
  return null;
}

function printStaticFindings(decoded) {
  console.log('\n=== Static findings ===');

  const reads = collectMemoryReads(decoded);
  console.log('Memory reads detected by decode:');
  if (reads.length === 0) {
    console.log('  none decoded in this range');
  } else {
    for (const read of reads) {
      const resolved = read.address == null ? read.text : addr24(read.address);
      const sites = read.instrs.map((instr) => addr24(instr.addr)).join(', ');
      console.log(`  ${resolved.padEnd(10)}  ${read.reason} at ${sites}`);
    }
  }

  const cps = decoded.filter((instr) => instr.cpImmediate != null || instr.cpIndexed != null || instr.cpRegister);
  console.log('\nCompare instructions:');
  if (cps.length === 0) {
    console.log('  none decoded in this range');
  } else {
    for (const instr of cps) {
      const detail = instr.cpImmediate != null ? ` immediate ${hex(instr.cpImmediate)}` : '';
      console.log(`  ${addr24(instr.addr)}  ${instr.mnemonic}${detail}`);
    }
  }

  const glyphLoads = decoded.filter((instr) => instr.glyphLoad != null);
  console.log('\nGlyph return value loads:');
  if (glyphLoads.length === 0) {
    console.log('  no LD A,0xE1/0xE2/0xE3 decoded in this range');
  } else {
    for (const instr of glyphLoads) {
      console.log(`  ${addr24(instr.addr)}  ${instr.mnemonic}`);
    }
  }

  console.log('\nPotential no-cursor Z returns:');
  const retSites = decoded.filter((instr) => instr.ret);
  let printed = 0;
  for (const instr of retSites) {
    if (instr.condition === 'Z') {
      const index = decoded.indexOf(instr);
      const setter = nearestFlagSetter(decoded, index);
      const via = setter ? ` after ${addr24(setter.addr)} ${setter.mnemonic}` : '';
      console.log(`  ${addr24(instr.addr)}  ${instr.mnemonic}${via}`);
      printed++;
    } else if (!instr.condition) {
      const index = decoded.indexOf(instr);
      const setter = nearestFlagSetter(decoded, index);
      if (setter && /^(XOR|OR|AND|CP|SUB|SBC|ADD|ADC|BIT|INC|DEC)/.test(setter.mnemonic)) {
        console.log(`  ${addr24(instr.addr)}  RET with Z inherited from ${addr24(setter.addr)} ${setter.mnemonic}`);
        printed++;
      }
    }
  }
  if (printed === 0) console.log('  no explicit RET Z or obvious Z-inheriting RET decoded in this range');
}

function ensureTranspiledModule() {
  const jsUrl = new URL('./ROM.transpiled.js', import.meta.url);
  const gzUrl = new URL('./ROM.transpiled.js.gz', import.meta.url);
  const jsPath = fileURLToPath(jsUrl);
  const gzPath = fileURLToPath(gzUrl);
  if (!existsSync(jsPath)) {
    if (!existsSync(gzPath)) {
      throw new Error('ROM.transpiled.js is missing and ROM.transpiled.js.gz was not found');
    }
    writeFileSync(jsPath, gunzipSync(readFileSync(gzPath)));
    console.log(`[setup] Inflated ${gzPath} to ${jsPath}. Do not commit the generated file.`);
  }
  return jsUrl;
}

function selectBlocks(module) {
  const candidates = [
    module.BLOCKS,
    module.blocks,
    module.default?.BLOCKS,
    module.default?.blocks,
    module.default,
  ];
  const blocks = candidates.find((candidate) => candidate && (candidate instanceof Map || typeof candidate === 'object'));
  if (!blocks) throw new Error('Unable to find BLOCKS export in ROM.transpiled.js');
  return blocks;
}

function createMemory() {
  const romPath = fileURLToPath(new URL('./ROM.rom', import.meta.url));
  const rom = readFileSync(romPath);
  const mem = new Uint8Array(0x1000000);
  mem.set(rom, 0);
  return mem;
}

function runBoot(executor) {
  const cpu = executor.cpu;
  cpu.halted = false;
  cpu.iff1 = false;
  cpu.iff2 = false;
  for (const stage of BOOT_STAGES) {
    console.log(`[boot] ${stage.name}: runFrom(${addr24(stage.addr)}, ${stage.mode}, maxSteps=${stage.maxSteps})`);
    executor.runFrom(stage.addr, stage.mode, {
      maxSteps: stage.maxSteps,
      maxLoopIterations: 10_000_000,
    });
  }
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const key of Reflect.ownKeys(cpu)) {
    const value = cpu[key];
    if (typeof value !== 'function') snapshot[key] = value;
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    try {
      cpu[key] = value;
    } catch {
      // Accessor-only fields are ignored; direct-call setup below sets required registers.
    }
  }
}

function getA(cpu) {
  if (typeof cpu.a === 'number') return cpu.a & 0xff;
  if (typeof cpu._a === 'number') return (cpu._a >>> 24) & 0xff;
  return null;
}

function getZ(cpu) {
  if (typeof cpu.f === 'number') return (cpu.f & 0x40) !== 0;
  if (typeof cpu._f === 'number') return (((cpu._f >>> 24) & 0x40) !== 0);
  if (typeof cpu.zf === 'boolean') return cpu.zf;
  if (typeof cpu.flagZ === 'boolean') return cpu.flagZ;
  return null;
}

function numericIndex(prop) {
  if (typeof prop !== 'string') return null;
  if (!/^(0|[1-9]\d*)$/.test(prop)) return null;
  const value = Number(prop);
  return Number.isSafeInteger(value) ? value : null;
}

function trackedMemory(mem) {
  const reads = new Map();
  const writes = new Map();
  const note = (map, addr, value) => {
    if (addr < TRACK_START || addr > TRACK_END) return;
    if (!map.has(addr)) map.set(addr, { address: addr, count: 0, values: new Set() });
    const entry = map.get(addr);
    entry.count++;
    entry.values.add(value & 0xff);
  };

  const proxy = new Proxy(mem, {
    get(target, prop, receiver) {
      const addr = numericIndex(prop);
      if (addr != null) note(reads, addr, target[addr]);
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value, receiver) {
      const addr = numericIndex(prop);
      if (addr != null) note(writes, addr, value);
      return Reflect.set(target, prop, value, target);
    },
  });

  return { proxy, reads, writes };
}

function mapLogToArray(map) {
  return [...map.values()]
    .sort((a, b) => a.address - b.address)
    .map((entry) => ({
      address: entry.address,
      count: entry.count,
      values: uniqueSorted([...entry.values]),
    }));
}

function runDirect030202(blocks, bootMem, bootCpuSnapshot, patches = new Map()) {
  const mem = new Uint8Array(bootMem);
  for (const [address, value] of patches) mem[address & 0xffffff] = value & 0xff;
  write24(mem, STACK_ADDR, SENTINEL_RETURN);

  const { proxy, reads, writes } = trackedMemory(mem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, proxy, { peripherals });
  const cpu = executor.cpu;
  restoreCpu(cpu, bootCpuSnapshot);

  cpu.pc = FUNCTION_START;
  cpu.sp = STACK_ADDR;
  cpu.mbase = 0xd0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = false;
  cpu.iff2 = false;

  let runResult = null;
  let stopError = null;
  try {
    runResult = executor.runFrom(FUNCTION_START, 'adl', {
      maxSteps: 5_000,
      maxLoopIterations: 1_000_000,
    });
  } catch (error) {
    stopError = error;
    if ((cpu.pc & 0xffffff) !== SENTINEL_RETURN) throw error;
  }

  return {
    a: getA(cpu),
    z: getZ(cpu),
    pc: cpu.pc == null ? null : cpu.pc & 0xffffff,
    sp: cpu.sp == null ? null : cpu.sp & 0xffffff,
    runResult,
    stopError: stopError?.message ?? null,
    reads: mapLogToArray(reads),
    writes: mapLogToArray(writes),
    mem,
  };
}

function printReadLog(entries) {
  if (entries.length === 0) {
    console.log('  no reads recorded in D00080-D000FF');
    return;
  }
  for (const entry of entries) {
    const values = entry.values.map((value) => hex(value)).join(', ');
    console.log(`  ${addr24(entry.address)}  count=${entry.count.toString().padStart(3)}  values=[${values}]`);
  }
}

function candidateAddresses(decoded, defaultResult) {
  const staticAddresses = collectMemoryReads(decoded)
    .map((read) => read.address)
    .filter((address) => address != null);
  const dynamicAddresses = defaultResult.reads.map((entry) => entry.address);
  return uniqueSorted([...staticAddresses, ...dynamicAddresses])
    .filter((address) => address >= 0 && address < 0x1000000);
}

function mutationValues(defaultValue) {
  return uniqueSorted([
    defaultValue,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x10,
    0x20,
    0x40,
    0x80,
    0xe1,
    0xe2,
    0xe3,
    0xff,
  ]);
}

function runMutationSweep(blocks, bootMem, bootCpuSnapshot, decoded, defaultResult) {
  console.log('\n=== Candidate mutation sweep ===');
  const candidates = candidateAddresses(decoded, defaultResult);
  if (candidates.length === 0) {
    console.log('No static or dynamic read candidates were found.');
    return null;
  }

  let best = null;
  for (const address of candidates) {
    const defaultValue = bootMem[address];
    const rows = [];
    for (const value of mutationValues(defaultValue)) {
      const result = runDirect030202(blocks, bootMem, bootCpuSnapshot, new Map([[address, value]]));
      rows.push({ value, a: result.a, z: result.z, pc: result.pc });
    }

    const uniqueGlyphs = uniqueSorted(rows.map((row) => row.a).filter((value) => [0xe1, 0xe2, 0xe3].includes(value)));
    const uniqueA = uniqueSorted(rows.map((row) => row.a).filter((value) => value != null));
    const zStates = uniqueSorted(rows.map((row) => (row.z ? 1 : 0)));
    const compact = rows
      .filter((row) => row.value === defaultValue || [0x00, 0x01, 0x02, 0x03, 0xe1, 0xe2, 0xe3, 0xff].includes(row.value))
      .map((row) => `${hex(row.value)}->A=${row.a == null ? 'unknown' : hex(row.a)} Z=${row.z}`)
      .join('  ');

    console.log(`${addr24(address)} default=${hex(defaultValue)}  uniqueA=[${uniqueA.map((value) => hex(value)).join(', ')}]  zStates=[${zStates.join(', ')}]`);
    console.log(`  ${compact}`);

    const score = uniqueGlyphs.length * 10 + (address === 0xd00092 ? -5 : 0) + (uniqueA.length > 1 ? 1 : 0);
    if (!best || score > best.score) best = { address, defaultValue, rows, uniqueGlyphs, score };
  }

  if (best && best.uniqueGlyphs.length > 1) {
    console.log(`\nLikely cursor style selector: ${addr24(best.address)} default=${hex(best.defaultValue)}`);
    for (const row of best.rows.filter((row) => [0xe1, 0xe2, 0xe3].includes(row.a))) {
      console.log(`  ${addr24(best.address)}=${hex(row.value)} returns A=${hex(row.a)} Z=${row.z}`);
    }
  } else {
    console.log('\nNo candidate produced multiple cursor glyph return values in the sweep.');
  }
  return best;
}

async function main() {
  const mem = createMemory();
  const decoded = decodeRange(mem, FUNCTION_START, FUNCTION_END);
  printDecode(decoded);
  printStaticFindings(decoded);

  const moduleUrl = ensureTranspiledModule();
  const transpiled = await import(moduleUrl.href);
  const blocks = selectBlocks(transpiled);

  console.log('\n=== Boot ===');
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  runBoot(executor);
  const bootCpuSnapshot = snapshotCpu(executor.cpu);
  const bootMem = new Uint8Array(mem);

  console.log('\n=== Dynamic direct call to 0x030202 ===');
  const defaultResult = runDirect030202(blocks, bootMem, bootCpuSnapshot);
  console.log(`Return A=${defaultResult.a == null ? 'unknown' : hex(defaultResult.a)}  Z=${defaultResult.z}  PC=${defaultResult.pc == null ? 'unknown' : addr24(defaultResult.pc)}`);
  if (defaultResult.stopError) console.log(`Stop condition: ${defaultResult.stopError}`);
  console.log('Reads in D00080-D000FF:');
  printReadLog(defaultResult.reads);
  if (defaultResult.writes.length) {
    console.log('Writes in D00080-D000FF during direct call:');
    printReadLog(defaultResult.writes);
  }

  runMutationSweep(blocks, bootMem, bootCpuSnapshot, decoded, defaultResult);
}

await main();
