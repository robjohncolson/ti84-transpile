import { readFileSync } from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07fe9c;
const MIN_CAPTURE = 40;

const rom = readFileSync(ROM_PATH);

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteAt(addr) {
  if (addr < 0 || addr >= rom.length) {
    throw new RangeError(`Address ${hex(addr, 6)} is outside ROM length ${hex(rom.length, 6)}`);
  }
  return rom[addr];
}

function imm16(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8);
}

function imm24(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function bytesText(addr, len) {
  return Array.from({ length: len }, (_, i) => byteAt(addr + i).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function relTarget(addr, len, displacement) {
  return (addr + len + signed8(displacement)) & 0xffffff;
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decode(addr) {
  const op = byteAt(addr);

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  }

  if (op >= 0x80 && op <= 0xbf) {
    const opName = alu[(op >> 3) & 7];
    const operand = r[op & 7];
    return { len: 1, text: `${opName}${opName.endsWith(',') ? '' : ' '}${operand}` };
  }

  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hex(byteAt(addr + 1), 2)}` };
  if ((op & 0xcf) === 0x01) return { len: 3, text: `LD ${rp[(op >> 4) & 3]},${hex(imm16(addr + 1), 4)}` };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x08: return { len: 1, text: 'EX AF,AF\'' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x0f: return { len: 1, text: 'RRCA' };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x17: return { len: 1, text: 'RLA' };
    case 0x18: return { len: 2, text: `JR ${hex(relTarget(addr, 2, byteAt(addr + 1)), 6)}`, target: relTarget(addr, 2, byteAt(addr + 1)), terminal: true };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x1f: return { len: 1, text: 'RRA' };
    case 0x22: return { len: 4, text: `LD (${hex(imm24(addr + 1), 6)}),HL` };
    case 0x27: return { len: 1, text: 'DAA' };
    case 0x2a: return { len: 4, text: `LD HL,(${hex(imm24(addr + 1), 6)})` };
    case 0x2f: return { len: 1, text: 'CPL' };
    case 0x32: return { len: 4, text: `LD (${hex(imm24(addr + 1), 6)}),A` };
    case 0x37: return { len: 1, text: 'SCF' };
    case 0x3a: return { len: 4, text: `LD A,(${hex(imm24(addr + 1), 6)})` };
    case 0x3f: return { len: 1, text: 'CCF' };
    case 0xc0: return { len: 1, text: 'RET NZ', terminal: true };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc3: return { len: 4, text: `JP ${hex(imm24(addr + 1), 6)}`, target: imm24(addr + 1), terminal: true };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc6: return { len: 2, text: `ADD A,${hex(byteAt(addr + 1), 2)}` };
    case 0xc8: return { len: 1, text: 'RET Z', terminal: true };
    case 0xc9: return { len: 1, text: 'RET', terminal: true };
    case 0xcd: return { len: 4, text: `CALL ${hex(imm24(addr + 1), 6)}`, target: imm24(addr + 1) };
    case 0xd0: return { len: 1, text: 'RET NC', terminal: true };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd3: return { len: 2, text: `OUT (${hex(byteAt(addr + 1), 2)}),A` };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xd6: return { len: 2, text: `SUB ${hex(byteAt(addr + 1), 2)}` };
    case 0xd8: return { len: 1, text: 'RET C', terminal: true };
    case 0xdb: return { len: 2, text: `IN A,(${hex(byteAt(addr + 1), 2)})` };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xe6: return { len: 2, text: `AND ${hex(byteAt(addr + 1), 2)}` };
    case 0xe9: return { len: 1, text: 'JP (HL)', terminal: true };
    case 0xeb: return { len: 1, text: 'EX DE,HL' };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf3: return { len: 1, text: 'DI' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xf6: return { len: 2, text: `OR ${hex(byteAt(addr + 1), 2)}` };
    case 0xf9: return { len: 1, text: 'LD SP,HL' };
    case 0xfb: return { len: 1, text: 'EI' };
    case 0xfe: return { len: 2, text: `CP ${hex(byteAt(addr + 1), 2)}` };
  }

  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const names = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
    const target = relTarget(addr, 2, byteAt(addr + 1));
    return { len: 2, text: `JR ${names[op]},${hex(target, 6)}`, target };
  }

  if ((op & 0xc7) === 0xc2) {
    const target = imm24(addr + 1);
    return { len: 4, text: `JP ${cond[(op >> 3) & 7]},${hex(target, 6)}`, target };
  }

  if ((op & 0xc7) === 0xc4) {
    const target = imm24(addr + 1);
    return { len: 4, text: `CALL ${cond[(op >> 3) & 7]},${hex(target, 6)}`, target };
  }

  if ((op & 0xc7) === 0xc7) {
    return { len: 1, text: `RST ${hex(op & 0x38, 2)}` };
  }

  return { len: 1, text: `DB ${hex(op, 2)}` };
}

console.log(`Decode utility at ${hex(START, 6)}`);
console.log(`ROM: ${ROM_PATH}`);
console.log(`Captured bytes: ${bytesText(START, MIN_CAPTURE)}`);
console.log('');

let addr = START;
const targets = [];
let sawTerminal = false;

while (addr < START + MIN_CAPTURE || !sawTerminal) {
  const insn = decode(addr);
  console.log(`${hex(addr, 6)}  ${bytesText(addr, insn.len).padEnd(11)}  ${insn.text}`);
  if (insn.target !== undefined) {
    targets.push({ from: addr, target: insn.target, text: insn.text });
  }
  addr += insn.len;
  if (insn.terminal) {
    sawTerminal = true;
  }
  if (addr >= START + 128) {
    console.log(`Stopped after 128 bytes without an unconditional terminator beyond required capture.`);
    break;
  }
}

console.log('');
console.log('CALL/JP/JR targets:');
if (targets.length === 0) {
  console.log('  (none)');
} else {
  for (const target of targets) {
    console.log(`  ${hex(target.from, 6)} -> ${hex(target.target, 6)}  ${target.text}`);
  }
}
