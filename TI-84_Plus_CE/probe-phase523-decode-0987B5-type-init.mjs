import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0987B5;
const ALT_ENTRY = START + 2;
const WINDOW = 200;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len));
}

function byteText(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function relTarget(addr, size, disp) {
  return addr + size + signed8(disp);
}

function op8Name(code) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][code & 7];
}

function decodeCb(addr) {
  const op = rom[addr + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const groups = ['RLC', 'BIT', 'RES', 'SET'];
  if (x === 0) {
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y];
    return { size: 2, text: `${rot} ${op8Name(z)}` };
  }
  return { size: 2, text: `${groups[x]} ${y},${op8Name(z)}` };
}

function decode(addr) {
  const op = rom[addr];
  const op2 = rom[addr + 1];
  const nn = () => u24(addr + 1);
  const imm = () => rom[addr + 1];
  const d = () => signed8(rom[addr + 1]);

  const simple = {
    0x00: ['NOP', 1],
    0x02: ['LD (BC),A', 1],
    0x03: ['INC BC', 1],
    0x04: ['INC B', 1],
    0x05: ['DEC B', 1],
    0x07: ['RLCA', 1],
    0x08: ['EX AF,AF\'', 1],
    0x09: ['ADD HL,BC', 1],
    0x0A: ['LD A,(BC)', 1],
    0x0B: ['DEC BC', 1],
    0x0C: ['INC C', 1],
    0x0D: ['DEC C', 1],
    0x0F: ['RRCA', 1],
    0x12: ['LD (DE),A', 1],
    0x13: ['INC DE', 1],
    0x14: ['INC D', 1],
    0x15: ['DEC D', 1],
    0x17: ['RLA', 1],
    0x19: ['ADD HL,DE', 1],
    0x1A: ['LD A,(DE)', 1],
    0x1B: ['DEC DE', 1],
    0x1C: ['INC E', 1],
    0x1D: ['DEC E', 1],
    0x1F: ['RRA', 1],
    0x22: [`LD (${hex(nn(), 6)}),HL`, 4, { mem: nn(), write: true }],
    0x23: ['INC HL', 1],
    0x24: ['INC H', 1],
    0x25: ['DEC H', 1],
    0x27: ['DAA', 1],
    0x29: ['ADD HL,HL', 1],
    0x2A: [`LD HL,(${hex(nn(), 6)})`, 4, { mem: nn(), read: true }],
    0x2B: ['DEC HL', 1],
    0x2C: ['INC L', 1],
    0x2D: ['DEC L', 1],
    0x2F: ['CPL', 1],
    0x32: [`LD (${hex(nn(), 6)}),A`, 4, { mem: nn(), write: true }],
    0x33: ['INC SP', 1],
    0x34: ['INC (HL)', 1],
    0x35: ['DEC (HL)', 1],
    0x37: ['SCF', 1],
    0x39: ['ADD HL,SP', 1],
    0x3A: [`LD A,(${hex(nn(), 6)})`, 4, { mem: nn(), read: true }],
    0x3B: ['DEC SP', 1],
    0x3C: ['INC A', 1],
    0x3D: ['DEC A', 1],
    0x3F: ['CCF', 1],
    0x76: ['HALT', 1],
    0x77: ['LD (HL),A', 1, { mem: '(HL)', write: true }],
    0x7E: ['LD A,(HL)', 1, { mem: '(HL)', read: true }],
    0xA7: ['AND A', 1],
    0xAF: ['XOR A', 1],
    0xB7: ['OR A', 1],
    0xC0: ['RET NZ', 1, { ret: true }],
    0xC8: ['RET Z', 1, { ret: true }],
    0xC9: ['RET', 1, { ret: true }],
    0xD0: ['RET NC', 1, { ret: true }],
    0xD8: ['RET C', 1, { ret: true }],
    0xE9: ['JP (HL)', 1, { jump: '(HL)' }],
    0xEB: ['EX DE,HL', 1],
    0xEF: ['RST 0x28', 1, { rst: 0x28 }],
    0xF1: ['POP AF', 1],
    0xF3: ['DI', 1],
    0xF5: ['PUSH AF', 1],
    0xFB: ['EI', 1],
  };

  if (simple[op]) {
    const [text, size, meta = {}] = simple[op];
    return { addr, size, bytes: bytesAt(addr, size), text, ...meta };
  }

  if ((op & 0xC7) === 0x06) {
    return { addr, size: 2, bytes: bytesAt(addr, 2), text: `LD ${op8Name(op >> 3)},${hex(imm())}` };
  }

  if (op >= 0x40 && op <= 0x7F) {
    return { addr, size: 1, bytes: bytesAt(addr, 1), text: `LD ${op8Name(op >> 3)},${op8Name(op)}` };
  }

  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { addr, size: 1, bytes: bytesAt(addr, 1), text: `${alu},${op8Name(op)}`.replace('SUB,', 'SUB ') };
  }

  const rel = {
    0x10: 'DJNZ',
    0x18: 'JR',
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0x30: 'JR NC',
    0x38: 'JR C',
  };
  if (rel[op]) {
    const target = relTarget(addr, 2, op2);
    return { addr, size: 2, bytes: bytesAt(addr, 2), text: `${rel[op]} ${hex(target, 6)}`, jump: target };
  }

  const imm24 = {
    0x01: 'BC',
    0x11: 'DE',
    0x21: 'HL',
    0x31: 'SP',
  };
  if (imm24[op]) {
    return { addr, size: 4, bytes: bytesAt(addr, 4), text: `LD ${imm24[op]},${hex(nn(), 6)}` };
  }

  const calls = {
    0xC4: 'CALL NZ',
    0xCC: 'CALL Z',
    0xCD: 'CALL',
    0xD4: 'CALL NC',
    0xDC: 'CALL C',
  };
  if (calls[op]) {
    return { addr, size: 4, bytes: bytesAt(addr, 4), text: `${calls[op]} ${hex(nn(), 6)}`, call: nn() };
  }

  const jumps = {
    0xC2: 'JP NZ',
    0xC3: 'JP',
    0xCA: 'JP Z',
    0xD2: 'JP NC',
    0xDA: 'JP C',
  };
  if (jumps[op]) {
    return { addr, size: 4, bytes: bytesAt(addr, 4), text: `${jumps[op]} ${hex(nn(), 6)}`, jump: nn() };
  }

  const immAlu = {
    0xC6: 'ADD A',
    0xCE: 'ADC A',
    0xD6: 'SUB',
    0xDE: 'SBC A',
    0xE6: 'AND',
    0xEE: 'XOR',
    0xF6: 'OR',
    0xFE: 'CP',
  };
  if (immAlu[op]) {
    return { addr, size: 2, bytes: bytesAt(addr, 2), text: `${immAlu[op]} ${hex(imm())}` };
  }

  const stack = {
    0xC1: 'POP BC',
    0xC5: 'PUSH BC',
    0xD1: 'POP DE',
    0xD5: 'PUSH DE',
    0xE1: 'POP HL',
    0xE5: 'PUSH HL',
  };
  if (stack[op]) {
    return { addr, size: 1, bytes: bytesAt(addr, 1), text: stack[op] };
  }

  if (op === 0xCB) {
    const cb = decodeCb(addr);
    return { addr, bytes: bytesAt(addr, cb.size), ...cb };
  }

  if (op === 0xED) {
    const ed2 = rom[addr + 1];
    const ed24Loads = {
      0x43: ['LD', 'BC', 'write'],
      0x4B: ['LD', 'BC', 'read'],
      0x53: ['LD', 'DE', 'write'],
      0x5B: ['LD', 'DE', 'read'],
      0x73: ['LD', 'SP', 'write'],
      0x7B: ['LD', 'SP', 'read'],
    };
    if (ed24Loads[ed2]) {
      const [, reg, dir] = ed24Loads[ed2];
      const target = u24(addr + 2);
      const text = dir === 'read' ? `LD ${reg},(${hex(target, 6)})` : `LD (${hex(target, 6)}),${reg}`;
      return { addr, size: 5, bytes: bytesAt(addr, 5), text, mem: target, read: dir === 'read', write: dir === 'write' };
    }
    const edSimple = {
      0x44: 'NEG',
      0x45: 'RETN',
      0x47: 'LD I,A',
      0x4D: 'RETI',
      0x57: 'LD A,I',
      0xA0: 'LDI',
      0xA1: 'CPI',
      0xA8: 'LDD',
      0xA9: 'CPD',
      0xB0: 'LDIR',
      0xB1: 'CPIR',
      0xB8: 'LDDR',
      0xB9: 'CPDR',
    };
    if (edSimple[ed2]) {
      const ret = edSimple[ed2] === 'RETN' || edSimple[ed2] === 'RETI';
      return { addr, size: 2, bytes: bytesAt(addr, 2), text: edSimple[ed2], ret };
    }
    return { addr, size: 2, bytes: bytesAt(addr, 2), text: `DB EDh,${hex(ed2)}` };
  }

  return { addr, size: 1, bytes: bytesAt(addr, 1), text: `DB ${hex(op)}` };
}

const instructions = [];
let pc = START;
const end = Math.min(rom.length, START + WINDOW);
while (pc < end) {
  const ins = decode(pc);
  instructions.push(ins);
  pc += ins.size;
  if (ins.ret && pc > ALT_ENTRY) break;
}

const calls = instructions.filter((ins) => ins.call !== undefined);
const jumps = instructions.filter((ins) => ins.jump !== undefined);
const mem = instructions.filter((ins) => ins.mem !== undefined);
const d0Mem = mem.filter((ins) => typeof ins.mem === 'number' && (ins.mem & 0xFF0000) === 0xD00000);
const entryLoad = instructions[0]?.addr === START && rom[START] === 0x3E
  ? rom[START + 1]
  : undefined;

console.log('Probe phase 523: decode 0x0987B5 type-specific initializer');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${hex(START, 6)}..${hex(START + WINDOW - 1, 6)} (${WINDOW} bytes requested)`);
console.log('');

console.log('Entry point interpretation');
if (entryLoad !== undefined) {
  console.log(`- ${hex(START, 6)} starts with LD A,${hex(entryLoad)} and then falls through to ${hex(ALT_ENTRY, 6)}.`);
  console.log(`- ${hex(START, 6)} is the default initializer entry used by appvar/group dispatch paths; it forces A=${hex(entryLoad)} before shared setup.`);
  console.log(`- ${hex(ALT_ENTRY, 6)} is the alternate entry used after the caller preloads A, for example the protected-program path loads A=0x1A and skips the default LD A immediate.`);
} else {
  console.log(`- ${hex(START, 6)} does not decode as LD A,n in this ROM window; compare the first two bytes below before assigning entry semantics.`);
  console.log(`- ${hex(ALT_ENTRY, 6)} is still decoded as an alternate entry because dispatch calls START+2.`);
}
console.log('');

console.log('Disassembly');
for (const ins of instructions) {
  const marker = ins.addr === START ? '<entry 0x0987B5>' : ins.addr === ALT_ENTRY ? '<entry 0x0987B7>' : '';
  console.log(`${hex(ins.addr, 6)}  ${byteText(ins.bytes).padEnd(14)}  ${ins.text.padEnd(22)} ${marker}`.trimEnd());
}
console.log('');

console.log('Control flow targets');
if (calls.length === 0 && jumps.length === 0) {
  console.log('- No CALL or JP/JR targets decoded in the scanned range.');
} else {
  for (const ins of calls) {
    console.log(`- CALL at ${hex(ins.addr, 6)} -> ${hex(ins.call, 6)}`);
  }
  for (const ins of jumps) {
    const target = typeof ins.jump === 'number' ? hex(ins.jump, 6) : ins.jump;
    console.log(`- Jump at ${hex(ins.addr, 6)} -> ${target}`);
  }
}
console.log('');

console.log('Memory accesses');
if (mem.length === 0) {
  console.log('- No absolute or explicit (HL) memory reads/writes decoded in the scanned range.');
} else {
  for (const ins of mem) {
    const target = typeof ins.mem === 'number' ? hex(ins.mem, 6) : ins.mem;
    const mode = ins.read && ins.write ? 'read/write' : ins.read ? 'read' : ins.write ? 'write' : 'access';
    const ram = typeof ins.mem === 'number' && (ins.mem & 0xFF0000) === 0xD00000 ? ' D0xxxx RAM' : '';
    console.log(`- ${mode.padEnd(10)} ${target} at ${hex(ins.addr, 6)}: ${ins.text}${ram}`);
  }
}
console.log('');

console.log('D0xxxx RAM summary');
if (d0Mem.length === 0) {
  console.log('- No D0xxxx absolute RAM addresses were decoded in this instruction window.');
} else {
  const seen = new Map();
  for (const ins of d0Mem) {
    const key = hex(ins.mem, 6);
    const modes = seen.get(key) ?? new Set();
    if (ins.read) modes.add('read');
    if (ins.write) modes.add('write');
    seen.set(key, modes);
  }
  for (const [addr, modes] of seen) {
    console.log(`- ${addr}: ${Array.from(modes).join(', ')}`);
  }
}
console.log('');

console.log('Raw bytes');
console.log(byteText(bytesAt(START, WINDOW)));
