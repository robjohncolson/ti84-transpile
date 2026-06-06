import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const MAIN_ADDR = 0x07CAB9;
const MAIN_LEN = 135;
const HELPER_07CC36 = 0x07CC36;

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

function signed8(b) {
  return b > 127 ? b - 256 : b;
}

function dumpBytes(label, base, len) {
  const bytes = readROM(base, len);
  console.log('\n=== ' + label + ' ===');
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(hex6(base + i) + ': ' + chunk.map(hex).join(' '));
  }
  return bytes;
}

const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function decodeInstruction(bytes, pc, base) {
  const op = bytes[pc];
  const addr = base + pc;
  const op1 = bytes[pc + 1];
  const op2 = bytes[pc + 2];
  const op3 = bytes[pc + 3];

  const rel = () => addr + 2 + signed8(op1);
  const imm24 = () => op1 | (op2 << 8) | (op3 << 16);

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
    const disp = signed8(op1);
    return { addr, size: 2,
      text: jrs[op] + ' ' + hex6(target) + ' ; ' + (disp >= 0 ? '+' : '') + disp,
      flow: { from: addr, target, type: jrs[op], kind: 'jr' } };
  }

  const rets = {
    0xC9: 'RET', 0xC8: 'RET Z', 0xC0: 'RET NZ',
    0xD8: 'RET C', 0xD0: 'RET NC',
  };
  if (Object.hasOwn(rets, op)) {
    return { addr, size: 1, text: rets[op], flow: { addr, type: rets[op], kind: 'ret' } };
  }

  const oneByte = {
    0x00: 'NOP', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B',
    0x07: 'RLCA', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D',
    0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
    0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L', 0x2F: 'CPL',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF',
    0x3C: 'INC A', 0x3D: 'DEC A', 0x3F: 'CCF',
    0x76: 'HALT', 0x77: 'LD (HL),A', 0x7E: 'LD A,(HL)',
    0x87: 'ADD A,A',
    0xA7: 'AND A', 0xAF: 'XOR A',
    0xB7: 'OR A',
    0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xD1: 'POP DE', 0xD5: 'PUSH DE',
    0xE1: 'POP HL', 0xE3: 'EX (SP),HL', 0xE5: 'PUSH HL',
    0xE9: 'JP (HL)', 0xEB: 'EX DE,HL',
    0xF1: 'POP AF', 0xF3: 'DI', 0xF5: 'PUSH AF', 0xFB: 'EI',
  };
  if (Object.hasOwn(oneByte, op)) {
    return { addr, size: 1, text: oneByte[op], flow: null };
  }

  // LD r,r range 0x40-0x7F (excluding HALT=0x76)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = regNames[(op >> 3) & 7];
    const src = regNames[op & 7];
    return { addr, size: 1, text: 'LD ' + dst + ',' + src, flow: null };
  }

  // ALU r range 0x80-0xBF
  if (op >= 0x80 && op <= 0xBF) {
    const aluOps = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const aluIdx = (op >> 3) & 7;
    const src = regNames[op & 7];
    return { addr, size: 1, text: aluOps[aluIdx] + src, flow: null };
  }

  const imm8 = {
    0x06: 'LD B,', 0x0E: 'LD C,', 0x16: 'LD D,', 0x1E: 'LD E,',
    0x26: 'LD H,', 0x2E: 'LD L,', 0x36: 'LD (HL),',
    0x3E: 'LD A,', 0xC6: 'ADD A,', 0xCE: 'ADC A,',
    0xD6: 'SUB ', 0xDE: 'SBC A,', 0xE6: 'AND ', 0xEE: 'XOR ',
    0xF6: 'OR ', 0xFE: 'CP ',
  };
  if (Object.hasOwn(imm8, op) && pc + 1 < bytes.length) {
    return { addr, size: 2, text: imm8[op] + hex4(op1), flow: null };
  }

  const ld16 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (Object.hasOwn(ld16, op) && pc + 3 < bytes.length) {
    const val = imm24();
    return { addr, size: 4, text: 'LD ' + ld16[op] + ',' + hex6(val), flow: null };
  }

  if (op === 0x10 && pc + 1 < bytes.length) {
    const target = rel();
    const disp = signed8(op1);
    return { addr, size: 2,
      text: 'DJNZ ' + hex6(target) + ' ; ' + (disp >= 0 ? '+' : '') + disp,
      flow: { from: addr, target, type: 'DJNZ', kind: 'jr' } };
  }

  if ((op === 0x3A || op === 0x32) && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4,
      text: op === 0x3A ? 'LD A,(' + hex6(target) + ')' : 'LD (' + hex6(target) + '),A',
      flow: null };
  }

  if (op === 0x22 && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: 'LD (' + hex6(target) + '),HL', flow: null };
  }
  if (op === 0x2A && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: 'LD HL,(' + hex6(target) + ')', flow: null };
  }

  if (op === 0xCB && pc + 1 < bytes.length) {
    const cbOp = op1;
    const bit = (cbOp >> 3) & 7;
    const reg = regNames[cbOp & 7];
    const group = cbOp & 0xC0;
    if (group === 0x00) {
      const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { addr, size: 2, text: shifts[bit] + ' ' + reg, flow: null };
    }
    if (group === 0x40) return { addr, size: 2, text: 'BIT ' + bit + ',' + reg, flow: null };
    if (group === 0x80) return { addr, size: 2, text: 'RES ' + bit + ',' + reg, flow: null };
    if (group === 0xC0) return { addr, size: 2, text: 'SET ' + bit + ',' + reg, flow: null };
    return { addr, size: 2, text: 'CB ' + hex(op1), flow: null };
  }

  if (op === 0xED && pc + 1 < bytes.length) {
    const edOps = {
      0x44: 'NEG', 0x46: 'IM 0', 0x4D: 'RETI',
      0x56: 'IM 1', 0x5E: 'IM 2', 0x67: 'RRD', 0x6F: 'RLD',
      0xA0: 'LDI', 0xA1: 'CPI', 0xA8: 'LDD', 0xA9: 'CPD',
      0xB0: 'LDIR', 0xB1: 'CPIR', 0xB8: 'LDDR', 0xB9: 'CPDR',
    };
    if (Object.hasOwn(edOps, op1)) {
      return { addr, size: 2, text: edOps[op1], flow: null };
    }
    const edLD = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
    const edLDr = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
    if (Object.hasOwn(edLD, op1) && pc + 4 < bytes.length) {
      const target = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD (' + hex6(target) + '),' + edLD[op1], flow: null };
    }
    if (Object.hasOwn(edLDr, op1) && pc + 4 < bytes.length) {
      const target = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD ' + edLDr[op1] + ',(' + hex6(target) + ')', flow: null };
    }
    return { addr, size: 2, text: 'ED ' + hex(op1), flow: null };
  }

  if ((op === 0xDD || op === 0xFD) && pc + 1 < bytes.length) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const next = op1;

    if (next === 0xCB && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const bitOp = op3;
      const bit = (bitOp >> 3) & 0x07;
      const group = bitOp & 0xC0;
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      const target = '(' + reg + dispStr + ')';
      if (group === 0x40) return { addr, size: 4, text: 'BIT ' + bit + ',' + target, flow: null };
      if (group === 0x80) return { addr, size: 4, text: 'RES ' + bit + ',' + target, flow: null };
      if (group === 0xC0) return { addr, size: 4, text: 'SET ' + bit + ',' + target, flow: null };
      return { addr, size: 4, text: reg + ' CB ' + hex(op2) + ' ' + hex(op3), flow: null };
    }

    if (next === 0x21 && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: 'LD ' + reg + ',' + hex6(val), flow: null };
    }
    if (next === 0xE5) return { addr, size: 2, text: 'PUSH ' + reg, flow: null };
    if (next === 0xE1) return { addr, size: 2, text: 'POP ' + reg, flow: null };
    if (next === 0x36 && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 4, text: 'LD (' + reg + dispStr + '),' + hex4(op3), flow: null };
    }
    const ixLdR = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
    if (Object.hasOwn(ixLdR, next) && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'LD ' + ixLdR[next] + ',(' + reg + dispStr + ')', flow: null };
    }
    if (next >= 0x70 && next <= 0x77 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      const src = regNames[next & 7];
      return { addr, size: 3, text: 'LD (' + reg + dispStr + '),' + src, flow: null };
    }
    if (next === 0xBE && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'CP (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0xB6 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'OR (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0xA6 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'AND (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0x86 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'ADD A,(' + reg + dispStr + ')', flow: null };
    }
    if (next === 0x96 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'SUB (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0xAE && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'XOR (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0x23) return { addr, size: 2, text: 'INC ' + reg, flow: null };
    if (next === 0x2B) return { addr, size: 2, text: 'DEC ' + reg, flow: null };
    if (next === 0x34 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'INC (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0x35 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      const dispStr = disp >= 0 ? '+' + disp : '' + disp;
      return { addr, size: 3, text: 'DEC (' + reg + dispStr + ')', flow: null };
    }
    if (next === 0xE9) {
      return { addr, size: 2, text: 'JP (' + reg + ')', flow: { addr, type: 'JP (' + reg + ')', kind: 'ret' } };
    }
    if (next === 0xF9) return { addr, size: 2, text: 'LD SP,' + reg, flow: null };
    if (next === 0x09) return { addr, size: 2, text: 'ADD ' + reg + ',BC', flow: null };
    if (next === 0x19) return { addr, size: 2, text: 'ADD ' + reg + ',DE', flow: null };
    if (next === 0x29) return { addr, size: 2, text: 'ADD ' + reg + ',' + reg, flow: null };
    if (next === 0x39) return { addr, size: 2, text: 'ADD ' + reg + ',SP', flow: null };

    return { addr, size: 2, text: reg + ' prefix ' + hex(next), flow: null };
  }

  // RST instructions
  if ((op & 0xC7) === 0xC7) {
    const target = op & 0x38;
    return { addr, size: 1, text: 'RST ' + hex4(target),
      flow: { from: addr, target, type: 'RST', kind: 'call' } };
  }

  return { addr, size: 1, text: 'DB ' + hex4(op), flow: null };
}

function disassemble(label, base, len, stopAtUnconditionalRet = false) {
  const bytes = readROM(base, len);
  const flows = [];
  const rets = [];

  console.log('\n=== ' + label + ' disassembly ===');
  for (let pc = 0; pc < bytes.length;) {
    const decoded = decodeInstruction(bytes, pc, base);
    if (!decoded) break;
    const raw = bytes.slice(pc, pc + decoded.size).map(hex).join(' ').padEnd(14, ' ');
    console.log(hex6(decoded.addr) + ': ' + raw + ' ' + decoded.text);

    if (decoded.flow?.kind === 'ret') {
      rets.push(decoded.flow);
      if (stopAtUnconditionalRet && decoded.flow.type === 'RET') break;
    } else if (decoded.flow) {
      flows.push(decoded.flow);
    }

    pc += decoded.size;
  }

  return { flows, rets };
}

console.log('Probe phase 530: decode FP normalize phase 1 at 0x07CAB9');
console.log('Context: first stage of multi-phase normalization pipeline in matrix/list FP handler');
console.log('Known: RES 6,(IY+14); CALL 0x07CC36; OP2/OP1 checks');
console.log('Known related: 0x07CA48 (phase 2), 0x07C8B7 (phase 3), 0x07CC36 (called from here)');
console.log('');

const mainBytes = dumpBytes('0x07CAB9 ROM bytes (' + MAIN_LEN + ')', MAIN_ADDR, MAIN_LEN);
dumpBytes('0x07CC36 helper bytes (80)', HELPER_07CC36, 80);

const main = disassemble('0x07CAB9 FP normalize phase 1', MAIN_ADDR, MAIN_LEN, false);
const helper = disassemble('0x07CC36 helper', HELPER_07CC36, 80, true);

console.log('\n=== CALL/JP/JR targets in 0x07CAB9 ===');
for (const t of main.flows) {
  console.log(hex6(t.from) + ': ' + t.type + ' -> ' + hex6(t.target));
}

console.log('\n=== RET instructions in 0x07CAB9 ===');
for (const r of main.rets) {
  console.log(hex6(r.addr) + ': ' + r.type);
}

console.log('\n=== CALL/JP/JR targets in 0x07CC36 ===');
for (const t of helper.flows) {
  console.log(hex6(t.from) + ': ' + t.type + ' -> ' + hex6(t.target));
}

console.log('\n=== RET instructions in 0x07CC36 ===');
for (const r of helper.rets) {
  console.log(hex6(r.addr) + ': ' + r.type);
}

const uniqueTargets = [...new Set(main.flows.map(t => t.target))];
for (const target of uniqueTargets) {
  if (target >= 0 && target < rom.length && target !== HELPER_07CC36) {
    dumpBytes(hex6(target) + ' branch/call target bytes (32)', target, 32);
    disassemble(hex6(target) + ' branch/call target preview', target, 32, true);
  }
}

const helperTargets = [...new Set(helper.flows.map(t => t.target))];
for (const target of helperTargets) {
  if (target >= 0 && target < rom.length && !uniqueTargets.includes(target)) {
    dumpBytes(hex6(target) + ' helper call target bytes (32)', target, 32);
    disassemble(hex6(target) + ' helper call target preview', target, 32, true);
  }
}

console.log('\n=== Key RAM/ROM addresses ===');
console.log('OP1 = D005F8 (9 bytes: type, exponent, 7 mantissa BCD)');
console.log('OP2 = D00603 (9 bytes)');
console.log('OP3 = D0060E (9 bytes)');
console.log('IY+14 = D0008E (flags byte, bit 6 is significant)');

console.log('\n=== Control flow summary ===');
console.log('Main window: ' + hex6(MAIN_ADDR) + '..' + hex6(MAIN_ADDR + MAIN_LEN - 1));
for (const t of main.flows) {
  let location;
  if (t.target >= MAIN_ADDR && t.target < MAIN_ADDR + MAIN_LEN) {
    location = 'internal';
  } else if (t.target >= 0 && t.target < rom.length) {
    location = 'external ROM';
  } else {
    location = 'RAM/out of ROM';
  }
  console.log(hex6(t.from) + ' ' + t.type + ' ' + hex6(t.target) + ' (' + location + ')');
}
