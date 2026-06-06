import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const MAIN_ADDR = 0x07CA48;
const MAIN_LEN = 113; // 0x07CA48..0x07CAB8 inclusive
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
  console.log('');
  console.log('=== ' + label + ' ===');
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(hex6(base + i) + ': ' + chunk.map(hex).join(' '));
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
  const unknown = (text) => ({ addr, size: 1, text: text || ('DB ' + hex4(op)), flow: null });

  if (op === undefined) return null;

  const calls = {
    0xCD: 'CALL', 0xCC: 'CALL Z', 0xC4: 'CALL NZ',
    0xDC: 'CALL C', 0xD4: 'CALL NC',
  };
  if (Object.hasOwn(calls, op) && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: calls[op] + ' ' + hex6(target),
      flow: { from: addr, target, type: calls[op], kind: 'call' } };
  }

  const jumps = {
    0xC3: 'JP', 0xCA: 'JP Z', 0xC2: 'JP NZ',
    0xDA: 'JP C', 0xD2: 'JP NC',
  };
  if (Object.hasOwn(jumps, op) && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: jumps[op] + ' ' + hex6(target),
      flow: { from: addr, target, type: jumps[op], kind: 'jump' } };
  }

  const jrs = {
    0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z',
    0x30: 'JR NC', 0x38: 'JR C',
  };
  if (Object.hasOwn(jrs, op) && pc + 1 < bytes.length) {
    const target = rel();
    const s = signed8(op1);
    return { addr, size: 2,
      text: jrs[op] + ' ' + hex6(target) + ' ; ' + (s >= 0 ? '+' : '') + s,
      flow: { from: addr, target, type: jrs[op], kind: 'jr' } };
  }

  const rets = {
    0xC9: 'RET', 0xC8: 'RET Z', 0xC0: 'RET NZ',
    0xD8: 'RET C', 0xD0: 'RET NC',
  };
  if (Object.hasOwn(rets, op)) {
    return { addr, size: 1, text: rets[op], flow: { addr, type: rets[op], kind: 'ret' } };
  }

  const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

  // LD r,r
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = (op >> 3) & 0x07;
    const src = op & 0x07;
    return { addr, size: 1, text: 'LD ' + regNames[dst] + ',' + regNames[src], flow: null };
  }

  // ALU r
  if (op >= 0x80 && op <= 0xBF) {
    const aluOps = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const alu = (op >> 3) & 0x07;
    const src = op & 0x07;
    return { addr, size: 1, text: aluOps[alu] + regNames[src], flow: null };
  }

  const oneByte = {
    0x00: 'NOP', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B',
    0x07: 'RLCA', 0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC',
    0x0A: 'LD A,(BC)', 0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C',
    0x0F: 'RRCA', 0x12: 'LD (DE),A', 0x13: 'INC DE',
    0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
    0x1F: 'RRA', 0x23: 'INC HL', 0x27: 'DAA', 0x2B: 'DEC HL',
    0x2F: 'CPL', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF',
    0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A', 0x3F: 'CCF',
    0x76: 'HALT', 0xD9: 'EXX', 0xE3: 'EX (SP),HL', 0xEB: 'EX DE,HL',
    0xF3: 'DI', 0xFB: 'EI',
    0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xD1: 'POP DE', 0xD5: 'PUSH DE',
    0xE1: 'POP HL', 0xE5: 'PUSH HL', 0xF1: 'POP AF', 0xF5: 'PUSH AF',
  };
  if (Object.hasOwn(oneByte, op)) {
    return { addr, size: 1, text: oneByte[op], flow: null };
  }

  const imm8 = {
    0x06: 'LD B,', 0x0E: 'LD C,', 0x16: 'LD D,', 0x1E: 'LD E,',
    0x26: 'LD H,', 0x2E: 'LD L,', 0x36: 'LD (HL),', 0x3E: 'LD A,',
    0xC6: 'ADD A,', 0xCE: 'ADC A,', 0xD6: 'SUB ', 0xDE: 'SBC A,',
    0xE6: 'AND ', 0xEE: 'XOR ', 0xF6: 'OR ', 0xFE: 'CP ',
  };
  if (Object.hasOwn(imm8, op) && pc + 1 < bytes.length) {
    return { addr, size: 2, text: imm8[op] + hex4(op1), flow: null };
  }

  // 24-bit immediate loads
  if ((op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) && pc + 3 < bytes.length) {
    const regPair = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
    const target = imm24();
    return { addr, size: 4, text: 'LD ' + regPair[op] + ',' + hex6(target), flow: null };
  }

  if ((op === 0x3A || op === 0x32) && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4,
      text: op === 0x3A ? 'LD A,(' + hex6(target) + ')' : 'LD (' + hex6(target) + '),A', flow: null };
  }

  if (op === 0x22 && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: 'LD (' + hex6(target) + '),HL', flow: null };
  }
  if (op === 0x2A && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: 'LD HL,(' + hex6(target) + ')', flow: null };
  }

  if (op === 0x10 && pc + 1 < bytes.length) {
    const target = rel();
    const s = signed8(op1);
    return { addr, size: 2,
      text: 'DJNZ ' + hex6(target) + ' ; ' + (s >= 0 ? '+' : '') + s,
      flow: { from: addr, target, type: 'DJNZ', kind: 'jr' } };
  }

  if (op === 0xCB && pc + 1 < bytes.length) {
    const bitOp = op1;
    const bit = (bitOp >> 3) & 0x07;
    const src = bitOp & 0x07;
    const group = bitOp & 0xC0;
    const reg = regNames[src];
    if (group === 0x00) {
      const rotOps = ['RLC', 'RRC', 'RL', 'RA', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { addr, size: 2, text: rotOps[bit] + ' ' + reg, flow: null };
    }
    if (group === 0x40) return { addr, size: 2, text: 'BIT ' + bit + ',' + reg, flow: null };
    if (group === 0x80) return { addr, size: 2, text: 'RES ' + bit + ',' + reg, flow: null };
    if (group === 0xC0) return { addr, size: 2, text: 'SET ' + bit + ',' + reg, flow: null };
    return { addr, size: 2, text: 'CB ' + hex(op1), flow: null };
  }

  if (op === 0xED && pc + 1 < bytes.length) {
    const ed = {
      0x44: 'NEG', 0x46: 'IM 0', 0x4D: 'RETI', 0x56: 'IM 1',
      0x5E: 'IM 2', 0x67: 'RRD', 0x6F: 'RLD',
      0xA0: 'LDI', 0xA1: 'CPI', 0xA8: 'LDD', 0xA9: 'CPD',
      0xB0: 'LDIR', 0xB1: 'CPIR', 0xB8: 'LDDR', 0xB9: 'CPDR',
    };
    const edLd = { 0x43: ['BC',true], 0x4B: ['BC',false], 0x53: ['DE',true], 0x5B: ['DE',false],
                   0x73: ['SP',true], 0x7B: ['SP',false] };
    if (Object.hasOwn(edLd, op1) && pc + 4 < bytes.length) {
      const info = edLd[op1];
      const target = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5,
        text: info[1] ? 'LD (' + hex6(target) + '),' + info[0] : 'LD ' + info[0] + ',(' + hex6(target) + ')',
        flow: null };
    }
    if (op1 === 0x42) return { addr, size: 2, text: 'SBC HL,BC', flow: null };
    if (op1 === 0x52) return { addr, size: 2, text: 'SBC HL,DE', flow: null };
    if (op1 === 0x62) return { addr, size: 2, text: 'SBC HL,HL', flow: null };
    if (op1 === 0x72) return { addr, size: 2, text: 'SBC HL,SP', flow: null };
    if (op1 === 0x4A) return { addr, size: 2, text: 'ADC HL,BC', flow: null };
    if (op1 === 0x5A) return { addr, size: 2, text: 'ADC HL,DE', flow: null };
    if (op1 === 0x6A) return { addr, size: 2, text: 'ADC HL,HL', flow: null };
    if (op1 === 0x7A) return { addr, size: 2, text: 'ADC HL,SP', flow: null };
    if (Object.hasOwn(ed, op1)) {
      return { addr, size: 2, text: ed[op1], flow: null };
    }
    return { addr, size: 2, text: 'ED ' + hex(op1), flow: null };
  }

  // IX/IY prefix
  if ((op === 0xDD || op === 0xFD) && pc + 1 < bytes.length) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const next = op1;
    if (next === 0xCB && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const bitOp = op3;
      const bit = (bitOp >> 3) & 0x07;
      const group = bitOp & 0xC0;
      const ds = disp < 0 ? '' + disp : '+' + disp;
      if (group === 0x40) return { addr, size: 4, text: 'BIT ' + bit + ',(' + reg + ds + ')', flow: null };
      if (group === 0x80) return { addr, size: 4, text: 'RES ' + bit + ',(' + reg + ds + ')', flow: null };
      if (group === 0xC0) return { addr, size: 4, text: 'SET ' + bit + ',(' + reg + ds + ')', flow: null };
      return { addr, size: 4, text: reg + ' CB ' + hex(op2) + ' ' + hex(op3), flow: null };
    }
    // LD r,(IX+d)
    if ((next & 0xC7) === 0x46 && next !== 0x76) {
      const disp = signed8(op2);
      const dstIdx = (next >> 3) & 0x07;
      const ds = disp < 0 ? '' + disp : '+' + disp;
      return { addr, size: 3, text: 'LD ' + regNames[dstIdx] + ',(' + reg + ds + ')', flow: null };
    }
    // LD (IX+d),r
    if ((next & 0xF8) === 0x70 && next !== 0x76) {
      const disp = signed8(op2);
      const srcIdx = next & 0x07;
      const ds = disp < 0 ? '' + disp : '+' + disp;
      return { addr, size: 3, text: 'LD (' + reg + ds + '),' + regNames[srcIdx], flow: null };
    }
    if (next === 0x36 && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const ds = disp < 0 ? '' + disp : '+' + disp;
      return { addr, size: 4, text: 'LD (' + reg + ds + '),' + hex4(op3), flow: null };
    }
    if (next === 0x34) { const disp = signed8(op2); const ds = disp < 0 ? '' + disp : '+' + disp; return { addr, size: 3, text: 'INC (' + reg + ds + ')', flow: null }; }
    if (next === 0x35) { const disp = signed8(op2); const ds = disp < 0 ? '' + disp : '+' + disp; return { addr, size: 3, text: 'DEC (' + reg + ds + ')', flow: null }; }
    const ixAlu = { 0x86: 'ADD A,', 0x8E: 'ADC A,', 0x96: 'SUB ', 0x9E: 'SBC A,',
                    0xA6: 'AND ', 0xAE: 'XOR ', 0xB6: 'OR ', 0xBE: 'CP ' };
    if (Object.hasOwn(ixAlu, next)) {
      const disp = signed8(op2);
      const ds = disp < 0 ? '' + disp : '+' + disp;
      return { addr, size: 3, text: ixAlu[next] + '(' + reg + ds + ')', flow: null };
    }
    if (next === 0x21 && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD ' + reg + ',' + hex6(val), flow: null };
    }
    if (next === 0x22 && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD (' + hex6(val) + '),' + reg, flow: null };
    }
    if (next === 0x2A && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD ' + reg + ',(' + hex6(val) + ')', flow: null };
    }
    if (next === 0xE5) return { addr, size: 2, text: 'PUSH ' + reg, flow: null };
    if (next === 0xE1) return { addr, size: 2, text: 'POP ' + reg, flow: null };
    if (next === 0x09) return { addr, size: 2, text: 'ADD ' + reg + ',BC', flow: null };
    if (next === 0x19) return { addr, size: 2, text: 'ADD ' + reg + ',DE', flow: null };
    if (next === 0x29) return { addr, size: 2, text: 'ADD ' + reg + ',' + reg, flow: null };
    if (next === 0x39) return { addr, size: 2, text: 'ADD ' + reg + ',SP', flow: null };
    if (next === 0x23) return { addr, size: 2, text: 'INC ' + reg, flow: null };
    if (next === 0x2B) return { addr, size: 2, text: 'DEC ' + reg, flow: null };
    if (next === 0xF9) return { addr, size: 2, text: 'LD SP,' + reg, flow: null };
    if (next === 0xE3) return { addr, size: 2, text: 'EX (SP),' + reg, flow: null };
    if (next === 0xE9) return { addr, size: 2, text: 'JP (' + reg + ')', flow: null };
    return { addr, size: 2, text: reg + ' prefix ' + hex(next), flow: null };
  }

  // RST
  if ((op & 0xC7) === 0xC7) {
    const rstAddr = op & 0x38;
    return { addr, size: 1, text: 'RST ' + hex4(rstAddr),
      flow: { from: addr, target: rstAddr, type: 'RST', kind: 'call' } };
  }

  return unknown();
}

function disassemble(label, base, len, stopAtUnconditionalRet) {
  const bytes = readROM(base, len);
  const flows = [];
  const rets = [];

  console.log('');
  console.log('=== ' + label + ' disassembly ===');
  for (let pc = 0; pc < bytes.length;) {
    const decoded = decodeInstruction(bytes, pc, base);
    if (!decoded) break;
    const raw = bytes.slice(pc, pc + decoded.size).map(hex).join(' ').padEnd(14, ' ');
    console.log(hex6(decoded.addr) + ': ' + raw + ' ' + decoded.text);

    if (decoded.flow && decoded.flow.kind === 'ret') {
      rets.push(decoded.flow);
      if (stopAtUnconditionalRet && decoded.flow.type === 'RET') break;
    } else if (decoded.flow) {
      flows.push(decoded.flow);
    }
    pc += decoded.size;
  }
  return { flows, rets };
}

// ==== Main ====

console.log('Probe phase 530: decode FP normalize phase 2 at 0x07CA48');
console.log('Window: ' + hex6(MAIN_ADDR) + '..' + hex6(MAIN_ADDR + MAIN_LEN - 1) + ' (' + MAIN_LEN + ' bytes)');
console.log('');

console.log('Known RAM:');
console.log('  D005F8 = OP1 type byte');
console.log('  D005F9 = OP1 exponent');
console.log('  D005FA..D00601 = OP1 mantissa (7 bytes)');
console.log('  D00601 = OP2 guard byte / last OP1 mantissa byte');
console.log('  D00603 = OP2 start');

const mainBytes = dumpBytes('0x07CA48 ROM bytes (' + MAIN_LEN + ')', MAIN_ADDR, MAIN_LEN);

const main = disassemble('0x07CA48 FP normalize phase 2', MAIN_ADDR, MAIN_LEN, false);

console.log('');
console.log('=== CALL/JP/JR targets in 0x07CA48 ===');
for (const t of main.flows) {
  console.log(hex6(t.from) + ': ' + t.type + ' -> ' + hex6(t.target));
}

console.log('');
console.log('=== RET instructions in 0x07CA48 ===');
for (const r of main.rets) {
  console.log(hex6(r.addr) + ': ' + r.type);
}

const uniqueTargets = [...new Set(main.flows.map(t => t.target))];
for (const target of uniqueTargets) {
  if (target >= MAIN_ADDR && target < MAIN_ADDR + MAIN_LEN) continue;
  if (target >= 0 && target < rom.length) {
    dumpBytes(hex6(target) + ' branch/call target bytes (32)', target, 32);
    disassemble(hex6(target) + ' branch/call target preview', target, 32, true);
  }
}

console.log('');
console.log('=== Known markers in 0x07CA48 window ===');
for (let pc = 0; pc < mainBytes.length; pc++) {
  const addr = MAIN_ADDR + pc;
  if (mainBytes[pc] === 0x3A && pc + 3 < mainBytes.length) {
    const target = addr24(mainBytes, pc + 1);
    if (target === 0xD00601) console.log(hex6(addr) + ': LD A,(D00601) -- OP2 guard byte read');
    if (target === 0xD005F9) console.log(hex6(addr) + ': LD A,(D005F9) -- OP1 exponent read');
    if (target === 0xD005F8) console.log(hex6(addr) + ': LD A,(D005F8) -- OP1 type byte read');
  }
  if (mainBytes[pc] === 0x32 && pc + 3 < mainBytes.length) {
    const target = addr24(mainBytes, pc + 1);
    if (target === 0xD00601) console.log(hex6(addr) + ': LD (D00601),A -- OP2 guard byte write');
    if (target === 0xD005F9) console.log(hex6(addr) + ': LD (D005F9),A -- OP1 exponent write');
  }
  if (mainBytes[pc] === 0xFE && pc + 1 < mainBytes.length && mainBytes[pc + 1] === 0x0F) {
    console.log(hex6(addr) + ': CP 0x0F -- range check');
  }
  if (mainBytes[pc] === 0xFE && pc + 1 < mainBytes.length && mainBytes[pc + 1] === 0x80) {
    console.log(hex6(addr) + ': CP 0x80 -- exponent zero check');
  }
  if (mainBytes[pc] === 0xAF) console.log(hex6(addr) + ': XOR A -- clear accumulator');
  if (mainBytes[pc] === 0x37) console.log(hex6(addr) + ': SCF -- set carry flag');
}

console.log('');
console.log('=== Control flow summary ===');
console.log('Main window: ' + hex6(MAIN_ADDR) + '..' + hex6(MAIN_ADDR + MAIN_LEN - 1));
for (const t of main.flows) {
  let location;
  if (t.target >= MAIN_ADDR && t.target < MAIN_ADDR + MAIN_LEN) {
    location = 'internal';
  } else if (t.target >= 0 && t.target < rom.length) {
    location = 'external ROM';
  } else {
    location = 'out of ROM range';
  }
  console.log(hex6(t.from) + ' ' + t.type + ' ' + hex6(t.target) + ' (' + location + ')');
}

console.log('');
console.log('Done.');
