import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rom = readFileSync(join(__dirname, 'ROM.rom'));

const TARGET_START = 0x05C780;
const TARGET_END = 0x05C8D1;
const STATUS_START = 0x030173;
const STATUS_SCAN_END = 0x0302A0;

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 0x12C00;
const LCD_WIDTH = 320;

const WATCHED = new Map([
  [0xD00080, 'IY system flags base'],
  [0xD00092, 'cursor rendering flags'],
  [0xD00595, 'cursor row'],
  [0xD00596, 'cursor column'],
  [0xD0059C, 'scratch column pixel value'],
  [0xD008D2, 'LCD window register'],
  [0xD008D5, 'LCD window register'],
  [0x0A239E, 'pixel writer'],
  [0x0A23C0, 'glyph renderer'],
]);

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteAt(addr) {
  return rom[addr] ?? 0;
}

function bytesAt(addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(byteAt(addr + i));
  return out;
}

function bytesText(addr, len) {
  return bytesAt(addr, len).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function u16At(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8);
}

function u24At(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, len, disp) {
  return (pc + len + signed8(disp)) & 0xFFFFFF;
}

function isRamAddress(value) {
  return value >= 0xD00000 && value <= 0xD7FFFF;
}

function isRomAddress(value) {
  return value >= 0 && value < rom.length;
}

function addressName(value) {
  return WATCHED.get(value) ?? '';
}

function fmtAddr(value) {
  const name = addressName(value);
  return name ? `${hex(value, 6)} <${name}>` : hex(value, 6);
}

function interestingLiteral(value) {
  return isRamAddress(value) || WATCHED.has(value);
}

function literalRef(value) {
  return interestingLiteral(value) ? [{ value, access: 'literal', via: 'imm24' }] : [];
}

function directRef(value, access) {
  return interestingLiteral(value) ? [{ value, access, via: 'direct' }] : [];
}

function imm8(value, role = 'imm8') {
  return { value, width: 8, role };
}

function imm16(value, role = 'imm16') {
  return { value, width: 16, role };
}

function imm24(value, role = 'imm24') {
  return { value, width: 24, role };
}

function instruction(pc, len, mnemonic, extra = {}) {
  return {
    addr: pc,
    len,
    bytes: bytesAt(pc, len),
    mnemonic,
    refs: extra.refs ?? [],
    calls: extra.calls ?? [],
    jumps: extra.jumps ?? [],
    immediates: extra.immediates ?? [],
  };
}

function aluMnemonic(opName, operand) {
  if (opName === 'SUB' || opName === 'AND' || opName === 'XOR' || opName === 'OR' || opName === 'CP') {
    return `${opName} ${operand}`;
  }
  return `${opName},${operand}`;
}

function dText(disp) {
  return disp < 0 ? `-${hex(-disp, 2)}` : `+${hex(disp, 2)}`;
}

function indexedOperand(indexReg, disp) {
  return `(${indexReg}${dText(disp)})`;
}

function decodeCBMnemonic(op, operand, indexedResultReg = null) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;

  if (x === 0) {
    return indexedResultReg && z !== 6 ? `${ROT[y]} ${operand},${indexedResultReg}` : `${ROT[y]} ${operand}`;
  }
  if (x === 1) return `BIT ${y},${operand}`;
  if (x === 2) {
    return indexedResultReg && z !== 6 ? `RES ${y},${operand},${indexedResultReg}` : `RES ${y},${operand}`;
  }
  return indexedResultReg && z !== 6 ? `SET ${y},${operand},${indexedResultReg}` : `SET ${y},${operand}`;
}

function decodeCB(pc) {
  const op = byteAt(pc + 1);
  const operand = R8[op & 7];
  return instruction(pc, 2, decodeCBMnemonic(op, operand));
}

function decodeED(pc) {
  const op = byteAt(pc + 1);

  if ((op & 0xCF) === 0x43) {
    const p = (op >> 4) & 3;
    const addr = u24At(pc + 2);
    return instruction(pc, 5, `LD (${fmtAddr(addr)}),${RP[p]}`, {
      refs: directRef(addr, 'write'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if ((op & 0xCF) === 0x4B) {
    const p = (op >> 4) & 3;
    const addr = u24At(pc + 2);
    return instruction(pc, 5, `LD ${RP[p]},(${fmtAddr(addr)})`, {
      refs: directRef(addr, 'read'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if ((op & 0xC7) === 0x40) {
    const r = (op >> 3) & 7;
    return instruction(pc, 2, `IN ${R8[r]},(C)`);
  }

  if ((op & 0xC7) === 0x41) {
    const r = (op >> 3) & 7;
    return instruction(pc, 2, `OUT (C),${r === 6 ? '0' : R8[r]}`);
  }

  if ((op & 0xCF) === 0x42) {
    const p = (op >> 4) & 3;
    return instruction(pc, 2, `SBC HL,${RP[p]}`);
  }

  if ((op & 0xCF) === 0x4A) {
    const p = (op >> 4) & 3;
    return instruction(pc, 2, `ADC HL,${RP[p]}`);
  }

  const fixed = new Map([
    [0x44, 'NEG'], [0x4C, 'NEG'], [0x54, 'NEG'], [0x5C, 'NEG'],
    [0x64, 'NEG'], [0x6C, 'NEG'], [0x74, 'NEG'], [0x7C, 'NEG'],
    [0x45, 'RETN'], [0x55, 'RETN'], [0x65, 'RETN'], [0x75, 'RETN'],
    [0x4D, 'RETI'], [0x5D, 'RETN'], [0x6D, 'RETN'], [0x7D, 'RETN'],
    [0x46, 'IM 0'], [0x4E, 'IM 0'], [0x56, 'IM 1'], [0x5E, 'IM 2'],
    [0x66, 'IM 0'], [0x6E, 'IM 0'], [0x76, 'IM 1'], [0x7E, 'IM 2'],
    [0x47, 'LD I,A'], [0x4F, 'LD R,A'], [0x57, 'LD A,I'], [0x5F, 'LD A,R'],
    [0x67, 'RRD'], [0x6F, 'RLD'],
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);

  if (fixed.has(op)) return instruction(pc, 2, fixed.get(op));

  if ([0x02, 0x12, 0x22, 0x32, 0x03, 0x13, 0x23, 0x33].includes(op)) {
    const disp = signed8(byteAt(pc + 2));
    const dst = RP[(op >> 4) & 3];
    const src = (op & 1) === 0 ? 'IX' : 'IY';
    return instruction(pc, 3, `LEA ${dst},(${src}${dText(disp)})`, {
      immediates: [imm8(byteAt(pc + 2), 'disp')],
    });
  }

  return instruction(pc, 2, `DB ED ${hex(op, 2)}`);
}

function decodeIndex(pc, indexReg) {
  const prefix = byteAt(pc);
  const op = byteAt(pc + 1);
  const indexR = ['B', 'C', 'D', 'E', `${indexReg}H`, `${indexReg}L`, `(${indexReg}+d)`, 'A'];

  if (op === 0xCB) {
    const disp = signed8(byteAt(pc + 2));
    const cb = byteAt(pc + 3);
    const resultReg = R8[cb & 7];
    const operand = indexedOperand(indexReg, disp);
    return instruction(pc, 4, decodeCBMnemonic(cb, operand, resultReg), {
      immediates: [imm8(byteAt(pc + 2), 'disp')],
    });
  }

  if (op === 0x21) {
    const value = u24At(pc + 2);
    return instruction(pc, 5, `LD ${indexReg},${fmtAddr(value)}`, {
      refs: literalRef(value),
      immediates: [imm24(value)],
    });
  }

  if (op === 0x22) {
    const addr = u24At(pc + 2);
    return instruction(pc, 5, `LD (${fmtAddr(addr)}),${indexReg}`, {
      refs: directRef(addr, 'write'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if (op === 0x2A) {
    const addr = u24At(pc + 2);
    return instruction(pc, 5, `LD ${indexReg},(${fmtAddr(addr)})`, {
      refs: directRef(addr, 'read'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if ([0x09, 0x19, 0x29, 0x39].includes(op)) {
    const p = (op >> 4) & 3;
    const src = p === 2 ? indexReg : RP[p];
    return instruction(pc, 2, `ADD ${indexReg},${src}`);
  }

  if (op === 0x23) return instruction(pc, 2, `INC ${indexReg}`);
  if (op === 0x2B) return instruction(pc, 2, `DEC ${indexReg}`);
  if (op === 0xE1) return instruction(pc, 2, `POP ${indexReg}`);
  if (op === 0xE3) return instruction(pc, 2, `EX (SP),${indexReg}`);
  if (op === 0xE5) return instruction(pc, 2, `PUSH ${indexReg}`);
  if (op === 0xE9) return instruction(pc, 2, `JP (${indexReg})`, { jumps: [{ target: null, kind: 'indirect' }] });
  if (op === 0xF9) return instruction(pc, 2, `LD SP,${indexReg}`);

  if ((op & 0xC7) === 0x04) {
    const r = (op >> 3) & 7;
    if (r === 6) {
      const disp = signed8(byteAt(pc + 2));
      return instruction(pc, 3, `INC ${indexedOperand(indexReg, disp)}`, {
        immediates: [imm8(byteAt(pc + 2), 'disp')],
      });
    }
    return instruction(pc, 2, `INC ${indexR[r]}`);
  }

  if ((op & 0xC7) === 0x05) {
    const r = (op >> 3) & 7;
    if (r === 6) {
      const disp = signed8(byteAt(pc + 2));
      return instruction(pc, 3, `DEC ${indexedOperand(indexReg, disp)}`, {
        immediates: [imm8(byteAt(pc + 2), 'disp')],
      });
    }
    return instruction(pc, 2, `DEC ${indexR[r]}`);
  }

  if ((op & 0xC7) === 0x06) {
    const r = (op >> 3) & 7;
    if (r === 6) {
      const disp = signed8(byteAt(pc + 2));
      const value = byteAt(pc + 3);
      return instruction(pc, 4, `LD ${indexedOperand(indexReg, disp)},${hex(value, 2)}`, {
        immediates: [imm8(byteAt(pc + 2), 'disp'), imm8(value)],
      });
    }
    const value = byteAt(pc + 2);
    return instruction(pc, 3, `LD ${indexR[r]},${hex(value, 2)}`, {
      immediates: [imm8(value)],
    });
  }

  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    if (dst === 6) {
      const disp = signed8(byteAt(pc + 2));
      return instruction(pc, 3, `LD ${indexedOperand(indexReg, disp)},${indexR[src]}`, {
        immediates: [imm8(byteAt(pc + 2), 'disp')],
      });
    }
    if (src === 6) {
      const disp = signed8(byteAt(pc + 2));
      return instruction(pc, 3, `LD ${indexR[dst]},${indexedOperand(indexReg, disp)}`, {
        immediates: [imm8(byteAt(pc + 2), 'disp')],
      });
    }
    return instruction(pc, 2, `LD ${indexR[dst]},${indexR[src]}`);
  }

  if (op >= 0x80 && op <= 0xBF) {
    const group = (op >> 3) & 7;
    const src = op & 7;
    if (src === 6) {
      const disp = signed8(byteAt(pc + 2));
      return instruction(pc, 3, aluMnemonic(ALU[group], indexedOperand(indexReg, disp)), {
        immediates: [imm8(byteAt(pc + 2), 'disp')],
      });
    }
    return instruction(pc, 2, aluMnemonic(ALU[group], indexR[src]));
  }

  const base = decodeBase(pc + 1);
  return instruction(pc, 1 + base.len, `${hex(prefix, 2)}: ${base.mnemonic}`, {
    refs: base.refs,
    calls: base.calls,
    jumps: base.jumps,
    immediates: base.immediates,
  });
}

function decodeBase(pc) {
  const op = byteAt(pc);

  if (op === 0xDD) return decodeIndex(pc, 'IX');
  if (op === 0xFD) return decodeIndex(pc, 'IY');
  if (op === 0xCB) return decodeCB(pc);
  if (op === 0xED) return decodeED(pc);

  if (op === 0x00) return instruction(pc, 1, 'NOP');
  if (op === 0x08) return instruction(pc, 1, "EX AF,AF'");
  if (op === 0x10) {
    const disp = byteAt(pc + 1);
    const target = relTarget(pc, 2, disp);
    return instruction(pc, 2, `DJNZ ${fmtAddr(target)}`, {
      jumps: [{ target, kind: 'relative' }],
      immediates: [imm8(disp, 'rel')],
    });
  }
  if (op === 0x18) {
    const disp = byteAt(pc + 1);
    const target = relTarget(pc, 2, disp);
    return instruction(pc, 2, `JR ${fmtAddr(target)}`, {
      jumps: [{ target, kind: 'relative' }],
      immediates: [imm8(disp, 'rel')],
    });
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const disp = byteAt(pc + 1);
    const target = relTarget(pc, 2, disp);
    const cond = ['NZ', 'Z', 'NC', 'C'][(op >> 3) & 3];
    return instruction(pc, 2, `JR ${cond},${fmtAddr(target)}`, {
      jumps: [{ target, kind: 'relative', cond }],
      immediates: [imm8(disp, 'rel')],
    });
  }

  if ((op & 0xCF) === 0x01) {
    const p = (op >> 4) & 3;
    const value = u24At(pc + 1);
    return instruction(pc, 4, `LD ${RP[p]},${fmtAddr(value)}`, {
      refs: literalRef(value),
      immediates: [imm24(value)],
    });
  }

  if (op === 0x02) return instruction(pc, 1, 'LD (BC),A');
  if (op === 0x12) return instruction(pc, 1, 'LD (DE),A');
  if (op === 0x0A) return instruction(pc, 1, 'LD A,(BC)');
  if (op === 0x1A) return instruction(pc, 1, 'LD A,(DE)');

  if (op === 0x22) {
    const addr = u24At(pc + 1);
    return instruction(pc, 4, `LD (${fmtAddr(addr)}),HL`, {
      refs: directRef(addr, 'write'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if (op === 0x2A) {
    const addr = u24At(pc + 1);
    return instruction(pc, 4, `LD HL,(${fmtAddr(addr)})`, {
      refs: directRef(addr, 'read'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if (op === 0x32) {
    const addr = u24At(pc + 1);
    return instruction(pc, 4, `LD (${fmtAddr(addr)}),A`, {
      refs: directRef(addr, 'write'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if (op === 0x3A) {
    const addr = u24At(pc + 1);
    return instruction(pc, 4, `LD A,(${fmtAddr(addr)})`, {
      refs: directRef(addr, 'read'),
      immediates: [imm24(addr, 'addr')],
    });
  }

  if ([0x03, 0x13, 0x23, 0x33].includes(op)) return instruction(pc, 1, `INC ${RP[(op >> 4) & 3]}`);
  if ([0x0B, 0x1B, 0x2B, 0x3B].includes(op)) return instruction(pc, 1, `DEC ${RP[(op >> 4) & 3]}`);
  if ([0x09, 0x19, 0x29, 0x39].includes(op)) return instruction(pc, 1, `ADD HL,${RP[(op >> 4) & 3]}`);

  if ((op & 0xC7) === 0x04) return instruction(pc, 1, `INC ${R8[(op >> 3) & 7]}`);
  if ((op & 0xC7) === 0x05) return instruction(pc, 1, `DEC ${R8[(op >> 3) & 7]}`);
  if ((op & 0xC7) === 0x06) {
    const r = (op >> 3) & 7;
    const value = byteAt(pc + 1);
    return instruction(pc, 2, `LD ${R8[r]},${hex(value, 2)}`, {
      immediates: [imm8(value)],
    });
  }

  const simple = new Map([
    [0x07, 'RLCA'], [0x0F, 'RRCA'], [0x17, 'RLA'], [0x1F, 'RRA'],
    [0x27, 'DAA'], [0x2F, 'CPL'], [0x37, 'SCF'], [0x3F, 'CCF'],
    [0x76, 'HALT'],
    [0xC9, 'RET'], [0xD9, 'EXX'], [0xE3, 'EX (SP),HL'], [0xE9, 'JP (HL)'],
    [0xEB, 'EX DE,HL'], [0xF3, 'DI'], [0xF9, 'LD SP,HL'], [0xFB, 'EI'],
  ]);
  if (simple.has(op)) return instruction(pc, 1, simple.get(op));

  if (op >= 0x40 && op <= 0x7F) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    return instruction(pc, 1, `LD ${R8[dst]},${R8[src]}`);
  }

  if (op >= 0x80 && op <= 0xBF) {
    const group = (op >> 3) & 7;
    const src = op & 7;
    return instruction(pc, 1, aluMnemonic(ALU[group], R8[src]));
  }

  if ((op & 0xC7) === 0xC0) {
    const cond = CC[(op >> 3) & 7];
    return instruction(pc, 1, `RET ${cond}`);
  }

  if ((op & 0xCF) === 0xC1) return instruction(pc, 1, `POP ${RP2[(op >> 4) & 3]}`);
  if ((op & 0xCF) === 0xC5) return instruction(pc, 1, `PUSH ${RP2[(op >> 4) & 3]}`);

  if ((op & 0xC7) === 0xC2) {
    const cond = CC[(op >> 3) & 7];
    const target = u24At(pc + 1);
    return instruction(pc, 4, `JP ${cond},${fmtAddr(target)}`, {
      jumps: [{ target, kind: 'absolute', cond }],
      immediates: [imm24(target, 'target')],
    });
  }

  if (op === 0xC3) {
    const target = u24At(pc + 1);
    return instruction(pc, 4, `JP ${fmtAddr(target)}`, {
      jumps: [{ target, kind: 'absolute' }],
      immediates: [imm24(target, 'target')],
    });
  }

  if ((op & 0xC7) === 0xC4) {
    const cond = CC[(op >> 3) & 7];
    const target = u24At(pc + 1);
    return instruction(pc, 4, `CALL ${cond},${fmtAddr(target)}`, {
      calls: [{ target, cond }],
      immediates: [imm24(target, 'target')],
    });
  }

  if (op === 0xCD) {
    const target = u24At(pc + 1);
    return instruction(pc, 4, `CALL ${fmtAddr(target)}`, {
      calls: [{ target, cond: null }],
      immediates: [imm24(target, 'target')],
    });
  }

  if ((op & 0xC7) === 0xC6) {
    const group = (op >> 3) & 7;
    const value = byteAt(pc + 1);
    return instruction(pc, 2, aluMnemonic(ALU[group], hex(value, 2)), {
      immediates: [imm8(value)],
    });
  }

  if ((op & 0xC7) === 0xC7) return instruction(pc, 1, `RST ${hex(op & 0x38, 2)}`);

  if (op === 0xD3) {
    const port = byteAt(pc + 1);
    return instruction(pc, 2, `OUT (${hex(port, 2)}),A`, { immediates: [imm8(port, 'port')] });
  }

  if (op === 0xDB) {
    const port = byteAt(pc + 1);
    return instruction(pc, 2, `IN A,(${hex(port, 2)})`, { immediates: [imm8(port, 'port')] });
  }

  return instruction(pc, 1, `DB ${hex(op, 2)}`);
}

function decodeAt(pc) {
  return decodeBase(pc);
}

function disassembleRange(start, end) {
  const out = [];
  let pc = start;
  while (pc <= end) {
    const ins = decodeAt(pc);
    out.push(ins);
    pc += Math.max(ins.len, 1);
  }
  return out;
}

function collectRefs(instructions) {
  const refs = [];
  for (const ins of instructions) {
    for (const ref of ins.refs) refs.push({ ...ref, ins });
  }
  return refs;
}

function collectCalls(instructions) {
  const calls = [];
  for (const ins of instructions) {
    for (const call of ins.calls) calls.push({ ...call, ins });
  }
  return calls;
}

function printDisassembly(instructions, title) {
  console.log(`\n=== ${title} ===`);
  for (const ins of instructions) {
    const bytes = bytesText(ins.addr, ins.len).padEnd(17, ' ');
    console.log(`${hex(ins.addr, 6)}  ${bytes} ${ins.mnemonic}`);
  }
}

function printAddressRefs(instructions) {
  const refs = collectRefs(instructions);
  console.log('\n=== Memory Address References in 0x05C780 Slice ===');
  if (refs.length === 0) {
    console.log('No direct or literal RAM address references decoded.');
    return;
  }

  const grouped = new Map();
  for (const ref of refs) {
    const key = ref.value;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(ref);
  }

  for (const [addr, hits] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const name = addressName(addr);
    const suffix = name ? ` (${name})` : '';
    console.log(`${fmtAddr(addr)}${suffix}: ${hits.length} hit(s)`);
    for (const hit of hits) {
      console.log(`  ${hex(hit.ins.addr, 6)} ${hit.access.padEnd(7, ' ')} ${hit.ins.mnemonic}`);
    }
  }
}

function refsForAddress(instructions, addr) {
  return collectRefs(instructions).filter((ref) => ref.value === addr);
}

function callsTo(instructions, addr) {
  return collectCalls(instructions).filter((call) => call.target === addr);
}

function immediateHits(instructions, values) {
  const wanted = new Set(values);
  const hits = [];
  for (const ins of instructions) {
    for (const imm of ins.immediates) {
      if (wanted.has(imm.value)) hits.push({ ins, imm });
    }
  }
  return hits;
}

function printBehaviorChecks(targetInstructions, statusInstructions) {
  const rowRefs = refsForAddress(targetInstructions, 0xD00595);
  const colRefs = refsForAddress(targetInstructions, 0xD00596);
  const callsPixelWriter = callsTo(targetInstructions, 0x0A239E);
  const callsGlyphRenderer = callsTo(targetInstructions, 0x0A23C0);
  const glyphHits = immediateHits(targetInstructions, [0xE1, 0xE2, 0xE3]);
  const targetWindowRefs = [
    ...refsForAddress(targetInstructions, 0xD008D2),
    ...refsForAddress(targetInstructions, 0xD008D5),
  ];
  const statusWindowRefs = [
    ...refsForAddress(statusInstructions, 0xD008D2),
    ...refsForAddress(statusInstructions, 0xD008D5),
  ];

  console.log('\n=== Key Behavior Checks ===');
  console.log(`Reads/loads D00595 cursor row: ${rowRefs.length ? 'YES' : 'NO'} (${rowRefs.length} decoded reference(s))`);
  console.log(`Reads/loads D00596 cursor column: ${colRefs.length ? 'YES' : 'NO'} (${colRefs.length} decoded reference(s))`);
  console.log(`Calls 0x0A239E pixel writer: ${callsPixelWriter.length ? 'YES' : 'NO'} (${callsPixelWriter.map((c) => hex(c.ins.addr, 6)).join(', ') || 'none'})`);
  console.log(`Calls 0x0A23C0 glyph renderer: ${callsGlyphRenderer.length ? 'YES' : 'NO'} (${callsGlyphRenderer.map((c) => hex(c.ins.addr, 6)).join(', ') || 'none'})`);
  console.log(`Contains cursor glyph immediates 0xE1/0xE2/0xE3: ${glyphHits.length ? 'YES' : 'NO'}`);
  for (const hit of glyphHits) {
    console.log(`  ${hex(hit.ins.addr, 6)} immediate ${hex(hit.imm.value, 2)} in ${hit.ins.mnemonic}`);
  }

  console.log('\nD008D2/D008D5 comparison against linear scan from 0x030173:');
  console.log(`  0x05C780 slice refs: ${targetWindowRefs.length || 0}`);
  for (const ref of targetWindowRefs) console.log(`    ${hex(ref.ins.addr, 6)} ${ref.access} ${ref.ins.mnemonic}`);
  console.log(`  0x030173 status scan refs: ${statusWindowRefs.length || 0}`);
  for (const ref of statusWindowRefs) console.log(`    ${hex(ref.ins.addr, 6)} ${ref.access} ${ref.ins.mnemonic}`);
  if (targetWindowRefs.length && statusWindowRefs.length) {
    const targetForms = new Set(targetWindowRefs.map((ref) => `${ref.value}:${ref.access}:${ref.ins.mnemonic}`));
    const statusForms = new Set(statusWindowRefs.map((ref) => `${ref.value}:${ref.access}:${ref.ins.mnemonic}`));
    const sameForms = [...targetForms].every((form) => statusForms.has(form)) && [...statusForms].every((form) => targetForms.has(form));
    console.log(`  Same decoded access forms as 0x030173 scan: ${sameForms ? 'YES' : 'NO'}`);
  }
}

function summarizeChanges(before, after) {
  const changes = [];
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;

  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    const row = Math.floor(i / LCD_WIDTH);
    const col = i % LCD_WIDTH;
    minRow = Math.min(minRow, row);
    minCol = Math.min(minCol, col);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    changes.push({
      addr: VRAM_BASE + i,
      row,
      col,
      before: before[i],
      after: after[i],
    });
  }

  return {
    count: changes.length,
    minRow: changes.length ? minRow : null,
    minCol: changes.length ? minCol : null,
    maxRow: changes.length ? maxRow : null,
    maxCol: changes.length ? maxCol : null,
    changes,
  };
}

function printChangeSummary(label, row, col, summary, runResult, error) {
  console.log(`\n--- ${label}: cursor row=${row} col=${col} ---`);
  if (error) {
    console.log(`Function run error: ${error.message}`);
  } else {
    console.log(`Function run result: ${runResult === undefined ? '(no return value)' : JSON.stringify(runResult)}`);
  }

  console.log(`VRAM bytes changed: ${summary.count}`);
  if (!summary.count) return;

  console.log(`VRAM bounding box: rows ${summary.minRow}-${summary.maxRow}, cols ${summary.minCol}-${summary.maxCol}`);
  const sampleLimit = 96;
  const sample = summary.changes.slice(0, sampleLimit);
  for (const change of sample) {
    console.log(
      `  ${hex(change.addr, 6)} row=${change.row.toString().padStart(3, ' ')} col=${change.col.toString().padStart(3, ' ')} ` +
      `${hex(change.before, 2)} -> ${hex(change.after, 2)}`,
    );
  }
  if (summary.changes.length > sampleLimit) {
    console.log(`  ... ${summary.changes.length - sampleLimit} more changed byte(s)`);
  }
}

async function runDynamicTests() {
  console.log('\n=== Dynamic VRAM Cursor Position Tests ===');

  const MEM_SIZE = 0x1000000;
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)), 0);

  console.log('Loading transpiled blocks...');
  const { pathToFileURL } = await import('node:url');
  const romModule = await import(pathToFileURL(join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;
  console.log(`Loaded ${Object.keys(BLOCKS).length} blocks.`);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  function write24(addr, val) {
    mem[addr & 0xFFFFFF] = val & 0xFF;
    mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
    mem[(addr + 2) & 0xFFFFFF] = (val >>> 16) & 0xFF;
  }

  // Boot
  console.log('Boot stage 1: PC=0x000000, 50000 steps');
  executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });
  console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
  executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });
  console.log('Boot complete.');

  // Post-boot state
  console.log(`Post-boot: D00092=${hex(mem[0xD00092], 2)} D00595=${hex(mem[0xD00595], 2)} D00596=${hex(mem[0xD00596], 2)} IY=${hex(cpu._iy, 6)}`);

  const tests = [
    { label: 'case A', row: 0, col: 0 },
    { label: 'case B', row: 5, col: 13 },
    { label: 'case C', row: 9, col: 25 },
  ];

  const IDLE_ENTRY = 0x02FDBE;
  const RET_POINTS = new Set([0x02FE21]);
  const STACK_TOP = 0xD1A87E;

  const results = [];
  for (const test of tests) {
    // Clear VRAM to white
    mem.fill(0xFF, VRAM_BASE, VRAM_BASE + VRAM_SIZE);

    // Set cursor position and flags
    mem[0xD00595] = test.row;
    mem[0xD00596] = test.col;
    mem[0xD00092] = 0x1A; // bits 1+3+4: gate rendering + thin cursor
    mem[0xD000C6] |= 0x01;
    mem[0xD00089] |= 0x10;
    mem[0xD00080] = 0x18;
    mem[0xD00000] = 0x00;
    cpu._iy = 0xD00080;
    cpu.mbase = 0xD0;
    cpu.iff1 = 0;
    cpu.iff2 = 0;

    // Stack with sentinel
    const sentinelSp = STACK_TOP - 3;
    cpu.sp = sentinelSp;
    write24(sentinelSp, IDLE_ENTRY);

    // Track blocks in target range
    const targetHits = new Map();
    let idleLoops = 0;

    const before = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE));

    executor.runFrom(IDLE_ENTRY, 'adl', {
      maxSteps: 300000,
      maxLoopIterations: 200000,
      onBlock: (blockPc) => {
        const masked = blockPc & 0xFFFFFF;
        if (masked >= TARGET_START && masked <= TARGET_END) {
          targetHits.set(masked, (targetHits.get(masked) || 0) + 1);
        }
        if (RET_POINTS.has(masked)) {
          idleLoops++;
          if (idleLoops >= 5) return 'stop';
          cpu.sp = sentinelSp;
          write24(sentinelSp, IDLE_ENTRY);
          mem[0xD000C6] |= 0x01;
          mem[0xD00089] |= 0x10;
          mem[0xD00000] = 0x00;
        }
        if (masked === IDLE_ENTRY) {
          mem[0xD000C6] |= 0x01;
          mem[0xD00089] |= 0x10;
          mem[0xD00000] = 0x00;
        }
      },
    });

    const after = new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE));
    const summary = summarizeChanges(before, after);
    printChangeSummary(test.label, test.row, test.col, summary, { idleLoops, targetHits: targetHits.size }, null);

    if (targetHits.size > 0) {
      console.log(`  Target-range blocks hit: ${targetHits.size}`);
      for (const [addr, count] of [...targetHits.entries()].sort((a, b) => a[0] - b[0]).slice(0, 20)) {
        console.log(`    ${hex(addr, 6)} x${count}`);
      }
    } else {
      console.log('  Target-range blocks hit: 0 (0x05C780-0x05C8D1 NOT reached from idle loop)');
    }

    results.push({ ...test, summary });
  }

  const boxes = results
    .filter((result) => result.summary.count > 0)
    .map((result) => `${result.summary.minRow},${result.summary.minCol},${result.summary.maxRow},${result.summary.maxCol}`);
  const moved = new Set(boxes).size > 1;
  console.log('\n=== Dynamic Conclusion ===');
  console.log(`VRAM write position changes with D00595/D00596: ${moved ? 'YES' : 'NO/INCONCLUSIVE'}`);
  console.log(`Observed boxes: ${boxes.length ? boxes.join(' | ') : 'none'}`);
  console.log('Fixed status-bar indicator reference from session 487: row=2 col=289.');

  // Additional: search for who calls 0x05C780 region from the ROM
  console.log('\n=== ROM callers of 0x05C760-0x05C795 ===');
  let callerCount = 0;
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD) {
      const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
      if (target >= 0x05C760 && target <= 0x05C795) {
        console.log(`  ${hex(i, 6)}: CALL ${hex(target, 6)}`);
        callerCount++;
      }
    }
  }
  if (callerCount === 0) {
    console.log('  No CALL sites found. Checking JP:');
    for (let i = 0; i < rom.length - 3; i++) {
      if (rom[i] === 0xC3) {
        const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
        if (target >= 0x05C760 && target <= 0x05C795) {
          console.log(`  ${hex(i, 6)}: JP ${hex(target, 6)}`);
          callerCount++;
        }
      }
    }
    if (callerCount === 0) {
      console.log('  No direct CALL or JP sites — function reached via fall-through.');
      // Check for callers of the broader function 0x05C740+
      console.log('  Callers of 0x05C740-0x05C772:');
      for (let i = 0; i < rom.length - 3; i++) {
        if (rom[i] === 0xCD) {
          const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
          if (target >= 0x05C740 && target <= 0x05C772) {
            console.log(`    ${hex(i, 6)}: CALL ${hex(target, 6)}`);
          }
        }
      }
    }
  }

  // eZ80 SIS prefix analysis
  console.log('\n=== eZ80 SIS Prefix Analysis (0x40 = SIS mode prefix) ===');
  console.log('Bytes decoded as LD B,B (0x40) are actually SIS mode prefixes in eZ80.');
  console.log('Key reinterpretations:');
  console.log('  0x05C801: 40 ED 5B D2 08 = LD.SIS DE,(D008D2) [with MBASE=D0 -> reads 0xD008D2]');
  console.log('  0x05C80E: 40 ED 53 D2 08 = LD.SIS (D008D2),DE [writes DE back to 0xD008D2]');
  console.log('  0x05C867: 40 22 D2 08 = LD.SIS (D008D2),HL [writes HL to 0xD008D2]');
  console.log('  0x05C776: 40 2A AC 26 = LD.SIS HL,(26AC) [with MBASE=D0 -> reads 0xD026AC]');
  console.log('  0x05C77F: 40 22 AC 26 = LD.SIS (26AC),HL [with MBASE=D0 -> writes 0xD026AC]');
  console.log('');
  console.log('REVISED D008D2/D008D5 references in 0x05C780-0x05C8D1:');
  console.log('  D008D2: READ at 0x05C801, WRITE at 0x05C80E, WRITE at 0x05C867');
  console.log('  D008D5: WRITE at 0x05C85F (LD (D008D5),A after 0x0A2D4C row conversion)');
}

const targetInstructions = disassembleRange(TARGET_START, TARGET_END);
const statusInstructions = disassembleRange(STATUS_START, STATUS_SCAN_END);

console.log('Phase 488 probe: decode and dynamically test ROM region 0x05C780-0x05C8D1');
printDisassembly(targetInstructions, 'Full Disassembly 0x05C780-0x05C8D1');
printAddressRefs(targetInstructions);
printBehaviorChecks(targetInstructions, statusInstructions);

try {
  await runDynamicTests();
} catch (err) {
  console.error('Dynamic tests failed:', err?.stack ?? err);
  process.exitCode = 1;
}
