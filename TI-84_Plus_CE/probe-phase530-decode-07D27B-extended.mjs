import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const CONT_ADDR = 0x07D2DE;
const CONT_LEN = 440;
const FULL_FUNC_START = 0x07D27B;

const rom = readFileSync(ROM_PATH);

function readROM(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hex(b) {
  return b.toString(16).padStart(2, '0');
}

function hex6(a) {
  return '0x' + a.toString(16).padStart(6, '0');
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

const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function decodeInstruction(bytes, pc, base) {
  const op = bytes[pc];
  const addr = base + pc;
  if (op === undefined) return null;

  const op1 = bytes[pc + 1];
  const op2 = bytes[pc + 2];
  const op3 = bytes[pc + 3];

  const rel = () => addr + 2 + signed8(op1);
  const imm24 = () => op1 | (op2 << 8) | (op3 << 16);

  // CALL nn (4 bytes: opcode + 24-bit address on eZ80)
  const calls = { 0xCD: 'CALL', 0xCC: 'CALL Z', 0xC4: 'CALL NZ', 0xDC: 'CALL C', 0xD4: 'CALL NC' };
  if (calls[op] !== undefined && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: `${calls[op]} ${hex6(target)}`, flow: { from: addr, target, type: calls[op], kind: 'call' } };
  }

  // JP nn (4 bytes: opcode + 24-bit address on eZ80)
  const jumps = { 0xC3: 'JP', 0xCA: 'JP Z', 0xC2: 'JP NZ', 0xDA: 'JP C', 0xD2: 'JP NC' };
  if (jumps[op] !== undefined && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: `${jumps[op]} ${hex6(target)}`, flow: { from: addr, target, type: jumps[op], kind: 'jump' } };
  }

  // JR (2 bytes)
  const jrs = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
  if (jrs[op] !== undefined && pc + 1 < bytes.length) {
    const target = rel();
    return { addr, size: 2, text: `${jrs[op]} ${hex6(target)} ; ${signed8(op1) >= 0 ? '+' : ''}${signed8(op1)}`, flow: { from: addr, target, type: jrs[op], kind: 'jr' } };
  }

  // DJNZ
  if (op === 0x10 && pc + 1 < bytes.length) {
    const target = rel();
    return { addr, size: 2, text: `DJNZ ${hex6(target)} ; ${signed8(op1) >= 0 ? '+' : ''}${signed8(op1)}`, flow: { from: addr, target, type: 'DJNZ', kind: 'jr' } };
  }

  // RET variants
  const rets = { 0xC9: 'RET', 0xC8: 'RET Z', 0xC0: 'RET NZ', 0xD8: 'RET C', 0xD0: 'RET NC' };
  if (rets[op] !== undefined) {
    return { addr, size: 1, text: rets[op], flow: { addr, type: rets[op], kind: 'ret' } };
  }

  // Single-byte instructions
  const oneByte = {
    0x00: 'NOP', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x08: "EX AF,AF'", 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D',
    0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
    0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x29: 'ADD HL,HL', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L',
    0x2F: 'CPL', 0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)',
    0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A',
    0x3F: 'CCF', 0x76: 'HALT',
    0x87: 'ADD A,A', 0xA7: 'AND A', 0xAF: 'XOR A', 0xB7: 'OR A',
    0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xD1: 'POP DE', 0xD5: 'PUSH DE',
    0xD9: 'EXX', 0xE1: 'POP HL', 0xE3: 'EX (SP),HL', 0xE5: 'PUSH HL',
    0xE9: 'JP (HL)', 0xEB: 'EX DE,HL',
    0xF1: 'POP AF', 0xF3: 'DI', 0xF5: 'PUSH AF', 0xF9: 'LD SP,HL', 0xFB: 'EI',
  };
  if (oneByte[op] !== undefined) {
    return { addr, size: 1, text: oneByte[op], flow: null };
  }

  // LD reg,reg (0x40-0x7F excluding 0x76)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    return { addr, size: 1, text: `LD ${regNames[(op >> 3) & 7]},${regNames[op & 7]}`, flow: null };
  }

  // ALU reg (0x80-0xBF)
  if (op >= 0x80 && op <= 0xBF) {
    const aluOps = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    return { addr, size: 1, text: `${aluOps[(op >> 3) & 7]}${regNames[op & 7]}`, flow: null };
  }

  // Immediate 8-bit
  const imm8 = {
    0x06: 'LD B,', 0x0E: 'LD C,', 0x16: 'LD D,', 0x1E: 'LD E,',
    0x26: 'LD H,', 0x2E: 'LD L,', 0x36: 'LD (HL),', 0x3E: 'LD A,',
    0xC6: 'ADD A,', 0xCE: 'ADC A,', 0xD6: 'SUB ', 0xDE: 'SBC A,',
    0xE6: 'AND ', 0xEE: 'XOR ', 0xF6: 'OR ', 0xFE: 'CP ',
  };
  if (imm8[op] !== undefined && pc + 1 < bytes.length) {
    return { addr, size: 2, text: `${imm8[op]}0x${hex(op1)}`, flow: null };
  }

  // LD r16,imm24 (4 bytes on eZ80)
  const ldImm24 = { 0x01: 'LD BC,', 0x11: 'LD DE,', 0x21: 'LD HL,', 0x31: 'LD SP,' };
  if (ldImm24[op] !== undefined && pc + 3 < bytes.length) {
    return { addr, size: 4, text: `${ldImm24[op]}${hex6(imm24())}`, flow: null };
  }

  // LD A,(nn) / LD (nn),A (4 bytes on eZ80)
  if ((op === 0x3A || op === 0x32) && pc + 3 < bytes.length) {
    const target = imm24();
    return { addr, size: 4, text: op === 0x3A ? `LD A,(${hex6(target)})` : `LD (${hex6(target)}),A`, flow: null };
  }

  // LD HL,(nn) / LD (nn),HL (4 bytes on eZ80)
  if (op === 0x2A && pc + 3 < bytes.length) {
    return { addr, size: 4, text: `LD HL,(${hex6(imm24())})`, flow: null };
  }
  if (op === 0x22 && pc + 3 < bytes.length) {
    return { addr, size: 4, text: `LD (${hex6(imm24())}),HL`, flow: null };
  }

  // RST
  const rstTargets = { 0xC7: 0x00, 0xCF: 0x08, 0xD7: 0x10, 0xDF: 0x18, 0xE7: 0x20, 0xEF: 0x28, 0xF7: 0x30, 0xFF: 0x38 };
  if (rstTargets[op] !== undefined) {
    return { addr, size: 1, text: `RST 0x${hex(rstTargets[op])}`, flow: { from: addr, target: rstTargets[op], type: 'RST', kind: 'call' } };
  }

  // CB prefix
  if (op === 0xCB && pc + 1 < bytes.length) {
    const group = op1 >> 6;
    const y = (op1 >> 3) & 7;
    const z = op1 & 7;
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (group === 0) return { addr, size: 2, text: `${rot[y]} ${regNames[z]}`, flow: null };
    if (group === 1) return { addr, size: 2, text: `BIT ${y},${regNames[z]}`, flow: null };
    if (group === 2) return { addr, size: 2, text: `RES ${y},${regNames[z]}`, flow: null };
    return { addr, size: 2, text: `SET ${y},${regNames[z]}`, flow: null };
  }

  // ED prefix
  if (op === 0xED && pc + 1 < bytes.length) {
    const edOps = {
      0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
      0x4D: 'RETI', 0x4F: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I',
      0x5E: 'IM 2', 0x5F: 'LD A,R', 0x67: 'RRD', 0x6F: 'RLD',
      0xA0: 'LDI', 0xA1: 'CPI', 0xA8: 'LDD', 0xA9: 'CPD',
      0xB0: 'LDIR', 0xB1: 'CPIR', 0xB8: 'LDDR', 0xB9: 'CPDR',
      0x42: 'SBC HL,BC', 0x52: 'SBC HL,DE', 0x62: 'SBC HL,HL', 0x72: 'SBC HL,SP',
      0x4A: 'ADC HL,BC', 0x5A: 'ADC HL,DE', 0x6A: 'ADC HL,HL', 0x7A: 'ADC HL,SP',
    };
    if (edOps[op1] !== undefined) {
      return { addr, size: 2, text: edOps[op1], flow: null };
    }
    // ED 4-byte: LD (nn),rr / LD rr,(nn) — 5 bytes on eZ80 (ED + op + 3-byte addr)
    const ed5byte = {
      0x43: 'LD (nn),BC', 0x4B: 'LD BC,(nn)', 0x53: 'LD (nn),DE', 0x5B: 'LD DE,(nn)',
      0x63: 'LD (nn),HL', 0x6B: 'LD HL,(nn)', 0x73: 'LD (nn),SP', 0x7B: 'LD SP,(nn)',
    };
    if (ed5byte[op1] !== undefined && pc + 4 < bytes.length) {
      const target = bytes[pc + 2] | (bytes[pc + 3] << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: ed5byte[op1].replace('nn', hex6(target)), flow: null };
    }
    return { addr, size: 2, text: `ED 0x${hex(op1)}`, flow: null };
  }

  // DD/FD prefix (IX/IY)
  if ((op === 0xDD || op === 0xFD) && pc + 1 < bytes.length) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const next = op1;

    // IX/IY CB prefix (4 bytes)
    if (next === 0xCB && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const bitOp = op3;
      const bit = (bitOp >> 3) & 7;
      const group = bitOp >> 6;
      const dispStr = `${reg}${disp < 0 ? '' : '+'}${disp}`;
      if (group === 1) return { addr, size: 4, text: `BIT ${bit},(${dispStr})`, flow: null };
      if (group === 2) return { addr, size: 4, text: `RES ${bit},(${dispStr})`, flow: null };
      if (group === 3) return { addr, size: 4, text: `SET ${bit},(${dispStr})`, flow: null };
      const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      return { addr, size: 4, text: `${rot[(bitOp >> 3) & 7]} (${dispStr})`, flow: null };
    }

    // LD r,(IX+d) — 3 bytes
    if ((next & 0xC7) === 0x46 && next !== 0x76 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `LD ${regNames[(next >> 3) & 7]},(${reg}${disp < 0 ? '' : '+'}${disp})`, flow: null };
    }
    // LD (IX+d),r — 3 bytes
    if ((next & 0xF8) === 0x70 && next !== 0x76 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `LD (${reg}${disp < 0 ? '' : '+'}${disp}),${regNames[next & 7]}`, flow: null };
    }
    // LD (IX+d),n — 4 bytes
    if (next === 0x36 && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 4, text: `LD (${reg}${disp < 0 ? '' : '+'}${disp}),0x${hex(op3)}`, flow: null };
    }
    // ALU (IX+d) — 3 bytes
    const ixAlu = { 0x86: 'ADD A,', 0x8E: 'ADC A,', 0x96: 'SUB ', 0x9E: 'SBC A,', 0xA6: 'AND ', 0xAE: 'XOR ', 0xB6: 'OR ', 0xBE: 'CP ' };
    if (ixAlu[next] !== undefined && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `${ixAlu[next]}(${reg}${disp < 0 ? '' : '+'}${disp})`, flow: null };
    }
    // INC/DEC (IX+d) — 3 bytes
    if (next === 0x34 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `INC (${reg}${disp < 0 ? '' : '+'}${disp})`, flow: null };
    }
    if (next === 0x35 && pc + 2 < bytes.length) {
      const disp = signed8(op2);
      return { addr, size: 3, text: `DEC (${reg}${disp < 0 ? '' : '+'}${disp})`, flow: null };
    }
    // PUSH/POP IX/IY
    if (next === 0xE5) return { addr, size: 2, text: `PUSH ${reg}`, flow: null };
    if (next === 0xE1) return { addr, size: 2, text: `POP ${reg}`, flow: null };
    // LD IX/IY,nn (5 bytes on eZ80)
    if (next === 0x21 && pc + 4 < bytes.length) {
      const val = op2 | (op3 << 8) | (bytes[pc + 4] << 16);
      return { addr, size: 5, text: `LD ${reg},${hex6(val)}`, flow: null };
    }
    // LD SP,IX/IY
    if (next === 0xF9) return { addr, size: 2, text: `LD SP,${reg}`, flow: null };
    // JP (IX)/(IY)
    if (next === 0xE9) return { addr, size: 2, text: `JP (${reg})`, flow: null };
    // ADD IX,rr
    const addIxRr = { 0x09: 'BC', 0x19: 'DE', 0x29: reg, 0x39: 'SP' };
    if (addIxRr[next] !== undefined) return { addr, size: 2, text: `ADD ${reg},${addIxRr[next]}`, flow: null };
    // INC/DEC IX/IY
    if (next === 0x23) return { addr, size: 2, text: `INC ${reg}`, flow: null };
    if (next === 0x2B) return { addr, size: 2, text: `DEC ${reg}`, flow: null };
    // EX (SP),IX/IY
    if (next === 0xE3) return { addr, size: 2, text: `EX (SP),${reg}`, flow: null };

    return { addr, size: 2, text: `${reg} prefix 0x${hex(next)}`, flow: null };
  }

  // OUT/IN
  if (op === 0xD3 && pc + 1 < bytes.length) return { addr, size: 2, text: `OUT (0x${hex(op1)}),A`, flow: null };
  if (op === 0xDB && pc + 1 < bytes.length) return { addr, size: 2, text: `IN A,(0x${hex(op1)})`, flow: null };

  return { addr, size: 1, text: `DB 0x${hex(op)}`, flow: null };
}

function disassemble(label, base, len, stopAtUnconditionalRet = false) {
  const bytes = readROM(base, len);
  const flows = [];
  const rets = [];

  console.log(`\n=== ${label} ===`);
  for (let pc = 0; pc < bytes.length;) {
    const decoded = decodeInstruction(bytes, pc, base);
    if (!decoded) break;
    const raw = bytes.slice(pc, pc + decoded.size).map(hex).join(' ').padEnd(14, ' ');
    console.log(`${hex6(decoded.addr)}: ${raw} ${decoded.text}`);

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

// =========================================================================
console.log('Probe phase 530: decode 0x07D27B extended (matrix/list FP handler continuation)');
console.log(`Continuation range: ${hex6(CONT_ADDR)} + ${CONT_LEN} bytes`);

// Dump raw bytes
dumpBytes(`Continuation bytes from ${hex6(CONT_ADDR)}`, CONT_ADDR, CONT_LEN);

// Also dump already-decoded first 99 bytes for context
dumpBytes(`First part (already decoded) ${hex6(FULL_FUNC_START)}`, FULL_FUNC_START, CONT_ADDR - FULL_FUNC_START);

// Disassemble first part for context
disassemble(`${hex6(FULL_FUNC_START)} first part (context)`, FULL_FUNC_START, CONT_ADDR - FULL_FUNC_START, false);

// Disassemble continuation — stop at unconditional RET
const main = disassemble(`${hex6(CONT_ADDR)} CONTINUATION`, CONT_ADDR, CONT_LEN, true);

console.log('\n=== CALL/JP/JR targets in continuation ===');
for (const t of main.flows) {
  const inFunc = t.target >= FULL_FUNC_START && t.target < CONT_ADDR + CONT_LEN;
  console.log(`${hex6(t.from)}: ${t.type} -> ${hex6(t.target)} ${inFunc ? '(INTERNAL)' : '(EXTERNAL)'}`);
}

console.log('\n=== RET instructions in continuation ===');
for (const r of main.rets) {
  console.log(`${hex6(r.addr)}: ${r.type}`);
}

// Investigate external targets
const externalTargets = [...new Set(main.flows.filter(t => {
  const inFunc = t.target >= FULL_FUNC_START && t.target < CONT_ADDR + CONT_LEN;
  return !inFunc;
}).map(t => t.target))].sort((a, b) => a - b);

if (externalTargets.length > 0) {
  console.log(`\n=== External sub-function previews (${externalTargets.length}) ===`);
  for (const target of externalTargets) {
    if (target >= 0 && target < rom.length) {
      disassemble(`${hex6(target)} sub-function preview`, target, 48, true);
    }
  }
}

// Final summary
console.log('\n=== SUMMARY ===');
console.log(`Function start: ${hex6(FULL_FUNC_START)}`);
console.log(`Already decoded: ${hex6(FULL_FUNC_START)} to ${hex6(CONT_ADDR - 1)} (${CONT_ADDR - FULL_FUNC_START} bytes)`);
const lastRet = main.rets.find(r => r.type === 'RET');
if (lastRet) {
  console.log(`Unconditional RET found at: ${hex6(lastRet.addr)}`);
  console.log(`Total function size: ${lastRet.addr - FULL_FUNC_START + 1} bytes`);
} else {
  console.log('No unconditional RET found in continuation window — function may extend further or tail-calls');
}
console.log(`Conditional RETs: ${main.rets.filter(r => r.type !== 'RET').map(r => `${hex6(r.addr)} ${r.type}`).join(', ') || 'none'}`);
console.log(`External CALL targets: ${externalTargets.filter(t => main.flows.some(f => f.target === t && f.kind === 'call')).map(t => hex6(t)).join(', ') || 'none'}`);
console.log(`External JP targets: ${externalTargets.filter(t => main.flows.some(f => f.target === t && f.kind === 'jump')).map(t => hex6(t)).join(', ') || 'none'}`);
