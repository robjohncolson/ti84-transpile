import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const MAIN_ADDR = 0x07C8B7;
const MAIN_LEN = 256; // extended to capture both BCD addition loops + continuation at 0x07C988

const rom = readFileSync(ROM_PATH);

function readROM(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hex(b) {
  return b.toString(16).padStart(2, '0');
}

function hex4(a) {
  return '0x' + a.toString(16).padStart(4, '0');
}

function hex6(a) {
  return '0x' + a.toString(16).padStart(6, '0');
}

function addr24(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function signed8(b) {
  return b > 127 ? b - 256 : b;
}

function dumpBytes(label, base, len) {
  const bytes = readROM(base, len);
  console.log(`\n=== ${label} ===`);
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(`${hex6(base + i)}: ${chunk.map(hex).join(' ')}`);
  }
  return bytes;
}

function decodeInstruction(bytes, pc, base) {
  const op = bytes[pc];
  const addr = base + pc;
  const op1 = bytes[pc + 1];
  const op2 = bytes[pc + 2];
  const op3 = bytes[pc + 3];

  const rel = () => addr + 2 + signed8(op1);
  const imm24 = () => op1 | (op2 << 8) | (op3 << 16);
  const unknown = (text = `DB ${hex4(op)}`) => ({ addr, size: 1, text, flow: null });

  if (op === undefined) {
    return null;
  }

  const calls = {
    0xCD: 'CALL',
    0xCC: 'CALL Z',
    0xC4: 'CALL NZ',
    0xDC: 'CALL C',
    0xD4: 'CALL NC',
  };
  if (Object.hasOwn(calls, op) && pc + 3 < bytes.length) {
    const target = imm24();
    return {
      addr,
      size: 4,
      text: `${calls[op]} ${hex6(target)}`,
      flow: { from: addr, target, type: calls[op], kind: 'call' },
    };
  }

  const jumps = {
    0xC3: 'JP',
    0xCA: 'JP Z',
    0xC2: 'JP NZ',
    0xDA: 'JP C',
    0xD2: 'JP NC',
  };
  if (Object.hasOwn(jumps, op) && pc + 3 < bytes.length) {
    const target = imm24();
    return {
      addr,
      size: 4,
      text: `${jumps[op]} ${hex6(target)}`,
      flow: { from: addr, target, type: jumps[op], kind: 'jump' },
    };
  }

  const jrs = {
    0x18: 'JR',
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0x30: 'JR NC',
    0x38: 'JR C',
  };
  if (Object.hasOwn(jrs, op) && pc + 1 < bytes.length) {
    const target = rel();
    return {
      addr,
      size: 2,
      text: `${jrs[op]} ${hex6(target)} ; ${signed8(op1) >= 0 ? '+' : ''}${signed8(op1)}`,
      flow: { from: addr, target, type: jrs[op], kind: 'jr' },
    };
  }

  const rets = {
    0xC9: 'RET',
    0xC8: 'RET Z',
    0xC0: 'RET NZ',
    0xD8: 'RET C',
    0xD0: 'RET NC',
  };
  if (Object.hasOwn(rets, op)) {
    return {
      addr,
      size: 1,
      text: rets[op],
      flow: { addr, type: rets[op], kind: 'ret' },
    };
  }

  // LD register-to-register block (0x40-0x7F minus HALT)
  const ldRegs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = ldRegs[(op >> 3) & 7];
    const src = ldRegs[op & 7];
    return { addr, size: 1, text: `LD ${dst},${src}`, flow: null };
  }

  // ALU register ops (0x80-0xBF)
  const aluOps = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
  if (op >= 0x80 && op <= 0xBF) {
    const aluName = aluOps[(op >> 3) & 7];
    const src = ldRegs[op & 7];
    return { addr, size: 1, text: `${aluName}${src}`, flow: null };
  }

  const oneByte = {
    0x00: 'NOP',
    0x02: 'LD (BC),A',
    0x03: 'INC BC',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x08: "EX AF,AF'",
    0x09: 'ADD HL,BC',
    0x0A: 'LD A,(BC)',
    0x0B: 'DEC BC',
    0x0C: 'INC C',
    0x0D: 'DEC C',
    0x0F: 'RRCA',
    0x11: 'LD DE (see imm)',
    0x12: 'LD (DE),A',
    0x13: 'INC DE',
    0x17: 'RLA',
    0x19: 'ADD HL,DE',
    0x1A: 'LD A,(DE)',
    0x1B: 'DEC DE',
    0x1F: 'RRA',
    0x23: 'INC HL',
    0x27: 'DAA',
    0x2B: 'DEC HL',
    0x2F: 'CPL',
    0x33: 'INC SP',
    0x34: 'INC (HL)',
    0x35: 'DEC (HL)',
    0x37: 'SCF',
    0x3B: 'DEC SP',
    0x3C: 'INC A',
    0x3D: 'DEC A',
    0x3F: 'CCF',
    0x76: 'HALT',
    0xC1: 'POP BC',
    0xC5: 'PUSH BC',
    0xD1: 'POP DE',
    0xD5: 'PUSH DE',
    0xD9: 'EXX',
    0xE1: 'POP HL',
    0xE3: 'EX (SP),HL',
    0xE5: 'PUSH HL',
    0xEB: 'EX DE,HL',
    0xF1: 'POP AF',
    0xF3: 'DI',
    0xF5: 'PUSH AF',
    0xFB: 'EI',
  };
  if (Object.hasOwn(oneByte, op)) {
    return { addr, size: 1, text: oneByte[op], flow: null };
  }

  const imm8 = {
    0x06: 'LD B',
    0x0E: 'LD C',
    0x16: 'LD D',
    0x1E: 'LD E',
    0x26: 'LD H',
    0x2E: 'LD L',
    0x36: 'LD (HL)',
    0x3E: 'LD A',
    0xC6: 'ADD A',
    0xCE: 'ADC A',
    0xD6: 'SUB',
    0xDE: 'SBC A',
    0xE6: 'AND',
    0xEE: 'XOR',
    0xF6: 'OR',
    0xFE: 'CP',
  };
  if (Object.hasOwn(imm8, op) && pc + 1 < bytes.length) {
    return { addr, size: 2, text: `${imm8[op]},${hex4(op1)}`, flow: null };
  }

  // LD r16,imm24
  const ldImm24 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (Object.hasOwn(ldImm24, op) && pc + 3 < bytes.length) {
    const val = imm24();
    return { addr, size: 4, text: `LD ${ldImm24[op]},${hex6(val)}`, flow: null };
  }

  if (op === 0x10 && pc + 1 < bytes.length) {
    const target = rel();
    return {
      addr,
      size: 2,
      text: `DJNZ ${hex6(target)} ; ${signed8(op1) >= 0 ? '+' : ''}${signed8(op1)}`,
      flow: { from: addr, target, type: 'DJNZ', kind: 'jr' },
    };
  }

  if ((op === 0x3A || op === 0x32) && pc + 3 < bytes.length) {
    const target = imm24();
    return {
      addr,
      size: 4,
      text: op === 0x3A ? `LD A,(${hex6(target)})` : `LD (${hex6(target)}),A`,
      flow: null,
    };
  }

  // LD (imm24),HL and LD HL,(imm24)
  if (op === 0x22 && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: `LD (${hex6(target)}),HL`, flow: null };
  }
  if (op === 0x2A && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: `LD HL,(${hex6(target)})`, flow: null };
  }

  // RST
  const rstVecs = [0xC7, 0xCF, 0xD7, 0xDF, 0xE7, 0xEF, 0xF7, 0xFF];
  if (rstVecs.includes(op)) {
    const vec = op & 0x38;
    return { addr, size: 1, text: `RST ${hex4(vec)}`, flow: { from: addr, target: vec, type: 'RST', kind: 'call' } };
  }

  if (op === 0xCB && pc + 1 < bytes.length) {
    const bitOp = op1;
    const bit = (bitOp >> 3) & 7;
    const reg = ldRegs[bitOp & 7];
    const group = bitOp & 0xC0;
    if (group === 0x00) {
      const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { addr, size: 2, text: `${rotOps[(bitOp >> 3) & 7]} ${reg}`, flow: null };
    }
    if (group === 0x40) {
      return { addr, size: 2, text: `BIT ${bit},${reg}`, flow: null };
    }
    if (group === 0x80) {
      return { addr, size: 2, text: `RES ${bit},${reg}`, flow: null };
    }
    if (group === 0xC0) {
      return { addr, size: 2, text: `SET ${bit},${reg}`, flow: null };
    }
    return { addr, size: 2, text: `CB ${hex(op1)}`, flow: null };
  }

  if (op === 0xED && pc + 1 < bytes.length) {
    const edOps = {
      0x42: 'SBC HL,BC',
      0x43: null, // LD (nn),BC - 4 bytes
      0x44: 'NEG',
      0x4A: 'ADC HL,BC',
      0x4B: null, // LD BC,(nn)
      0x52: 'SBC HL,DE',
      0x53: null, // LD (nn),DE
      0x5A: 'ADC HL,DE',
      0x5B: null, // LD DE,(nn)
      0x67: 'RRD',
      0x6F: 'RLD',
      0x72: 'SBC HL,SP',
      0x73: null, // LD (nn),SP
      0x7A: 'ADC HL,SP',
      0x7B: null, // LD SP,(nn)
      0xA0: 'LDI',
      0xA1: 'CPI',
      0xA2: 'INI',
      0xA8: 'LDD',
      0xA9: 'CPD',
      0xB0: 'LDIR',
      0xB1: 'CPIR',
      0xB8: 'LDDR',
      0xB9: 'CPDR',
    };
    if (op1 in edOps) {
      if (edOps[op1] === null) {
        // 4-byte ED instructions: LD (nn),rr or LD rr,(nn)
        if (pc + 3 < bytes.length) {
          const nn = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
          // Actually in eZ80 these are ED xx ll hh uu (4 bytes after ED)
          // Simplified: treat as 2-byte for unknown
        }
        return { addr, size: 2, text: `ED ${hex(op1)}`, flow: null };
      }
      return { addr, size: 2, text: edOps[op1], flow: null };
    }
    return { addr, size: 2, text: `ED ${hex(op1)}`, flow: null };
  }

  if ((op === 0xDD || op === 0xFD) && pc + 1 < bytes.length) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const next = op1;

    // IX/IY CB prefix (bit operations on indexed)
    if (next === 0xCB && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const bitOp = op3;
      const bit = (bitOp >> 3) & 0x07;
      const group = bitOp & 0xC0;
      const target = `(${reg}${disp >= 0 ? '+' : ''}${disp})`;
      if (group === 0x40) {
        return { addr, size: 4, text: `BIT ${bit},${target}`, flow: null };
      }
      if (group === 0x80) {
        return { addr, size: 4, text: `RES ${bit},${target}`, flow: null };
      }
      if (group === 0xC0) {
        return { addr, size: 4, text: `SET ${bit},${target}`, flow: null };
      }
      return { addr, size: 4, text: `${reg} CB ${hex(op2)} ${hex(op3)}`, flow: null };
    }

    // LD IX/IY,imm24
    if (next === 0x21 && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: `LD ${reg},${hex6(val)}`, flow: null };
    }

    // LD (IX/IY+d),r and LD r,(IX/IY+d)
    if (next >= 0x70 && next <= 0x77 && next !== 0x76) {
      const disp = signed8(op2);
      const src = ldRegs[next & 7];
      return { addr, size: 3, text: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${src}`, flow: null };
    }
    if ((next & 0xC7) === 0x46 && next !== 0x76) {
      const disp = signed8(op2);
      const dst = ldRegs[(next >> 3) & 7];
      return { addr, size: 3, text: `LD ${dst},(${reg}${disp >= 0 ? '+' : ''}${disp})`, flow: null };
    }

    // LD (IX/IY+d),imm8
    if (next === 0x36 && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 4, text: `LD (${reg}${disp >= 0 ? '+' : ''}${disp}),${hex4(op3)}`, flow: null };
    }

    // PUSH/POP IX/IY
    if (next === 0xE5) return { addr, size: 2, text: `PUSH ${reg}`, flow: null };
    if (next === 0xE1) return { addr, size: 2, text: `POP ${reg}`, flow: null };

    // ADD IX/IY,rr
    const addPairs = { 0x09: 'BC', 0x19: 'DE', 0x29: reg, 0x39: 'SP' };
    if (next in addPairs) {
      return { addr, size: 2, text: `ADD ${reg},${addPairs[next]}`, flow: null };
    }

    // INC/DEC IX/IY
    if (next === 0x23) return { addr, size: 2, text: `INC ${reg}`, flow: null };
    if (next === 0x2B) return { addr, size: 2, text: `DEC ${reg}`, flow: null };

    // LD SP,IX/IY
    if (next === 0xF9) return { addr, size: 2, text: `LD SP,${reg}`, flow: null };

    // EX (SP),IX/IY
    if (next === 0xE3) return { addr, size: 2, text: `EX (SP),${reg}`, flow: null };

    // JP (IX/IY)
    if (next === 0xE9) return { addr, size: 2, text: `JP (${reg})`, flow: null };

    // INC/DEC (IX/IY+d)
    if (next === 0x34) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `INC (${reg}${disp >= 0 ? '+' : ''}${disp})`, flow: null };
    }
    if (next === 0x35) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `DEC (${reg}${disp >= 0 ? '+' : ''}${disp})`, flow: null };
    }

    // ALU A,(IX/IY+d): ADD, ADC, SUB, SBC, AND, XOR, OR, CP
    const ixAluBase = { 0x86: 'ADD A', 0x8E: 'ADC A', 0x96: 'SUB', 0x9E: 'SBC A', 0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR', 0xBE: 'CP' };
    if (next in ixAluBase) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `${ixAluBase[next]},(${reg}${disp >= 0 ? '+' : ''}${disp})`, flow: null };
    }

    return { addr, size: 2, text: `${reg} prefix ${hex(next)}`, flow: null };
  }

  return unknown();
}

function disassemble(label, base, len, stopAtUnconditionalRet = false) {
  const bytes = readROM(base, len);
  const flows = [];
  const rets = [];

  console.log(`\n=== ${label} disassembly ===`);
  for (let pc = 0; pc < bytes.length;) {
    const decoded = decodeInstruction(bytes, pc, base);
    if (!decoded) {
      break;
    }
    const raw = bytes.slice(pc, pc + decoded.size).map(hex).join(' ').padEnd(14, ' ');
    console.log(`${hex6(decoded.addr)}: ${raw} ${decoded.text}`);

    if (decoded.flow?.kind === 'ret') {
      rets.push(decoded.flow);
      if (stopAtUnconditionalRet && decoded.flow.type === 'RET') {
        break;
      }
    } else if (decoded.flow) {
      flows.push(decoded.flow);
    }

    pc += decoded.size;
  }

  return { flows, rets };
}

console.log('Probe phase 530: decode FP normalize phase 3 at 0x07C8B7');
console.log('Context: third stage of multi-phase normalization pipeline in matrix/list FP handler');
console.log('Known: RES 6,(IY+14); reversed OP order check');
console.log('IY base = D00080, so IY+14 = D0008E (flags byte)');
console.log('OP1 = D005F8, OP2 = D00603, OP3 = D0060E');

const mainBytes = dumpBytes(`0x07C8B7 ROM bytes (${MAIN_LEN})`, MAIN_ADDR, MAIN_LEN);

// Also dump related pipeline stages for cross-reference
dumpBytes('0x07CAB9 phase 1 bytes (32)', 0x07CAB9, 32);
dumpBytes('0x07CA48 phase 2 bytes (32)', 0x07CA48, 32);
dumpBytes('0x07F9D9 copy OP2->OP3 bytes (24)', 0x07F9D9, 24);

const main = disassemble('0x07C8B7 FP normalize phase 3', MAIN_ADDR, MAIN_LEN, false);

console.log('\n=== CALL/JP/JR targets from 0x07C8B7 ===');
for (const t of main.flows) {
  console.log(`${hex6(t.from)}: ${t.type} -> ${hex6(t.target)}`);
}

console.log('\n=== RET instructions in 0x07C8B7 ===');
for (const r of main.rets) {
  console.log(`${hex6(r.addr)}: ${r.type}`);
}

// Disassemble all unique external targets
const uniqueTargets = [...new Set(main.flows.map(t => t.target))].sort((a, b) => a - b);
for (const target of uniqueTargets) {
  if (target >= 0 && target < rom.length && target !== MAIN_ADDR) {
    const inMain = target >= MAIN_ADDR && target < MAIN_ADDR + MAIN_LEN;
    if (!inMain) {
      dumpBytes(`${hex6(target)} external target bytes (32)`, target, 32);
      disassemble(`${hex6(target)} external target`, target, 32, true);
    }
  }
}

// Look for known patterns in the main window
console.log('\n=== Pattern scan in 0x07C8B7 window ===');
for (let pc = 0; pc < mainBytes.length - 3; pc++) {
  const addr = MAIN_ADDR + pc;
  // RES 6,(IY+14) = FD CB 0E B6
  if (mainBytes[pc] === 0xFD && mainBytes[pc + 1] === 0xCB && mainBytes[pc + 2] === 0x0E && mainBytes[pc + 3] === 0xB6) {
    console.log(`${hex6(addr)}: RES 6,(IY+14) — clear bit 6 of D0008E`);
  }
  // SET 6,(IY+14) = FD CB 0E F6
  if (mainBytes[pc] === 0xFD && mainBytes[pc + 1] === 0xCB && mainBytes[pc + 2] === 0x0E && mainBytes[pc + 3] === 0xF6) {
    console.log(`${hex6(addr)}: SET 6,(IY+14) — set bit 6 of D0008E`);
  }
  // BIT 6,(IY+14) = FD CB 0E 76
  if (mainBytes[pc] === 0xFD && mainBytes[pc + 1] === 0xCB && mainBytes[pc + 2] === 0x0E && mainBytes[pc + 3] === 0x76) {
    console.log(`${hex6(addr)}: BIT 6,(IY+14) — test bit 6 of D0008E`);
  }
  // References to OP1 (D005F8) via LD HL,imm24
  if (mainBytes[pc] === 0x21 && pc + 3 < mainBytes.length) {
    const val = mainBytes[pc + 1] | (mainBytes[pc + 2] << 8) | (mainBytes[pc + 3] << 16);
    if (val === 0xD005F8) console.log(`${hex6(addr)}: LD HL,D005F8 — HL = OP1`);
    if (val === 0xD00603) console.log(`${hex6(addr)}: LD HL,D00603 — HL = OP2`);
    if (val === 0xD0060E) console.log(`${hex6(addr)}: LD HL,D0060E — HL = OP3`);
    if (val === 0xD005F9) console.log(`${hex6(addr)}: LD HL,D005F9 — HL = OP1+1 (exponent)`);
  }
  // LD DE,OPx
  if (mainBytes[pc] === 0x11 && pc + 3 < mainBytes.length) {
    const val = mainBytes[pc + 1] | (mainBytes[pc + 2] << 8) | (mainBytes[pc + 3] << 16);
    if (val === 0xD005F8) console.log(`${hex6(addr)}: LD DE,D005F8 — DE = OP1`);
    if (val === 0xD00603) console.log(`${hex6(addr)}: LD DE,D00603 — DE = OP2`);
    if (val === 0xD0060E) console.log(`${hex6(addr)}: LD DE,D0060E — DE = OP3`);
  }
  // CP 0x80 (exponent check)
  if (mainBytes[pc] === 0xFE && mainBytes[pc + 1] === 0x80) {
    console.log(`${hex6(addr)}: CP 0x80 — exponent zero check`);
  }
}

console.log('\n=== Control flow summary ===');
console.log(`Main window: ${hex6(MAIN_ADDR)}..${hex6(MAIN_ADDR + MAIN_LEN - 1)}`);
for (const t of main.flows) {
  const location =
    t.target >= MAIN_ADDR && t.target < MAIN_ADDR + MAIN_LEN
      ? 'internal'
      : 'external';
  console.log(`${hex6(t.from)} ${t.type} ${hex6(t.target)} (${location})`);
}
