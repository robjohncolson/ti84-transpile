import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const MAIN_ADDR = 0x07CBB5;
const MAIN_LEN = 120;
const KNOWN_HELPER = 0x07FF38;

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

  const oneByte = {
    0x00: 'NOP',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x0C: 'INC C',
    0x0D: 'DEC C',
    0x0F: 'RRCA',
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
    0x34: 'INC (HL)',
    0x35: 'DEC (HL)',
    0x37: 'SCF',
    0x3C: 'INC A',
    0x3D: 'DEC A',
    0x76: 'HALT',
    0x7E: 'LD A,(HL)',
    0x77: 'LD (HL),A',
    0x87: 'ADD A,A',
    0xA7: 'AND A',
    0xAF: 'XOR A',
    0xB7: 'OR A',
    0xC1: 'POP BC',
    0xC5: 'PUSH BC',
    0xD1: 'POP DE',
    0xD5: 'PUSH DE',
    0xE1: 'POP HL',
    0xE5: 'PUSH HL',
    0xF1: 'POP AF',
    0xF5: 'PUSH AF',
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
    0x3E: 'LD A',
    0xC6: 'ADD A',
    0xD6: 'SUB',
    0xE6: 'AND',
    0xF6: 'OR',
    0xFE: 'CP',
  };
  if (Object.hasOwn(imm8, op) && pc + 1 < bytes.length) {
    return { addr, size: 2, text: `${imm8[op]} ${hex4(op1)}`, flow: null };
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

  if (op === 0xCB && pc + 1 < bytes.length) {
    const cb = {
      0x2F: 'SRA A',
      0x3F: 'SRL A',
    };
    return { addr, size: 2, text: cb[op1] ?? `CB ${hex(op1)}`, flow: null };
  }

  if (op === 0xED && pc + 1 < bytes.length) {
    const ed = {
      0x44: 'NEG',
      0x67: 'RRD',
      0x6F: 'RLD',
    };
    return { addr, size: 2, text: ed[op1] ?? `ED ${hex(op1)}`, flow: null };
  }

  if ((op === 0xDD || op === 0xFD) && pc + 1 < bytes.length) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const next = op1;
    if (next === 0xCB && pc + 3 < bytes.length) {
      const disp = signed8(op2);
      const bitOp = op3;
      const bit = (bitOp >> 3) & 0x07;
      const group = bitOp & 0xC0;
      const target = `${reg}${disp < 0 ? '' : '+'}${disp}`;
      if (group === 0x40) {
        return { addr, size: 4, text: `BIT ${bit},(${target})`, flow: null };
      }
      return { addr, size: 4, text: `${reg} CB ${hex(op2)} ${hex(op3)}`, flow: null };
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
    const raw = bytes.slice(pc, pc + decoded.size).map(hex).join(' ').padEnd(11, ' ');
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

console.log('Probe phase 529: decode FP normalization core at 0x07CBB5');
const mainBytes = dumpBytes(`0x07CBB5 ROM bytes (${MAIN_LEN})`, MAIN_ADDR, MAIN_LEN);
dumpBytes('0x07FF38 known FP validation/check bytes (40)', KNOWN_HELPER, 40);

const main = disassemble('0x07CBB5 FP normalization core', MAIN_ADDR, MAIN_LEN, true);
const ff38 = disassemble('0x07FF38 known FP validation/check', KNOWN_HELPER, 40, true);

console.log('\n=== CALL/JP/JR targets in 0x07CBB5 ===');
for (const t of main.flows) {
  console.log(`${hex6(t.from)}: ${t.type} -> ${hex6(t.target)}`);
}

console.log('\n=== RET instructions in 0x07CBB5 ===');
for (const r of main.rets) {
  console.log(`${hex6(r.addr)}: ${r.type}`);
}

console.log('\n=== Known instruction markers in 0x07CBB5 window ===');
for (let pc = 0; pc < mainBytes.length; pc++) {
  const addr = MAIN_ADDR + pc;
  if (mainBytes[pc] === 0xCD && pc + 3 < mainBytes.length) {
    const target = addr24(mainBytes, pc + 1);
    if (target === KNOWN_HELPER) {
      console.log(`${hex6(addr)}: CALL ${hex6(KNOWN_HELPER)} found`);
    }
  }
  if (mainBytes[pc] === 0xFE && mainBytes[pc + 1] === 0x70) {
    console.log(`${hex6(addr)}: CP 0x70 found`);
  }
  if (mainBytes[pc] === 0x2F && mainBytes[pc + 1] === 0xE6 && mainBytes[pc + 2] === 0x0F) {
    console.log(`${hex6(addr)}: CPL; AND 0x0F found`);
  }
}

console.log('\n=== CALL/JP/JR targets in 0x07FF38 ===');
for (const t of ff38.flows) {
  console.log(`${hex6(t.from)}: ${t.type} -> ${hex6(t.target)}`);
}

console.log('\n=== RET instructions in 0x07FF38 ===');
for (const r of ff38.rets) {
  console.log(`${hex6(r.addr)}: ${r.type}`);
}

const uniqueTargets = [...new Set(main.flows.map(t => t.target))];
for (const target of uniqueTargets) {
  if (target >= 0 && target < rom.length && target !== KNOWN_HELPER) {
    dumpBytes(`${hex6(target)} branch/call target bytes (24)`, target, 24);
    disassemble(`${hex6(target)} branch/call target preview`, target, 24, true);
  }
}

console.log('\n=== Control flow summary ===');
console.log(`Main window: ${hex6(MAIN_ADDR)}..${hex6(MAIN_ADDR + MAIN_LEN - 1)}`);
console.log(`Known helper: ${hex6(KNOWN_HELPER)} is dumped and disassembled separately`);
for (const t of main.flows) {
  const location =
    t.target >= MAIN_ADDR && t.target < MAIN_ADDR + MAIN_LEN
      ? 'internal'
      : t.target >= 0 && t.target < rom.length
        ? 'external ROM'
        : 'out of ROM range';
  console.log(`${hex6(t.from)} ${t.type} ${hex6(t.target)} (${location})`);
}
