import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START_IMMEDIATE = 0x09EF20;
const START_DEFERRED = 0x09EF44;
const CALLER = 0x0A22DA;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function rel(addr, offsetAddr) {
  return (offsetAddr + 1 + s8(rom[offsetAddr])) & 0xFFFFFF;
}

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex8(rom[addr + i])).join(' ');
}

function cbName(op, target) {
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (op < 0x40) return `${groups[op >> 3]} ${target}`;
  if (op < 0x80) return `BIT ${(op >> 3) & 7},${target}`;
  if (op < 0xC0) return `RES ${(op >> 3) & 7},${target}`;
  return `SET ${(op >> 3) & 7},${target}`;
}

function decode(addr) {
  const op = rom[addr];

  if (op === 0xDD || op === 0xFD) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const op2 = rom[addr + 1];
    if (op2 === 0xCB) {
      const disp = s8(rom[addr + 2]);
      const dispText = disp < 0 ? `-${hex(-disp, 2)}` : `+${hex(disp, 2)}`;
      return { len: 4, text: `${cbName(rom[addr + 3], `(${reg}${dispText})`)}` };
    }
    const map = {
      0x21: [`LD ${reg},${hex(u24(addr + 2))}`, 5],
      0x22: [`LD (${hex(u24(addr + 2))}),${reg}`, 5],
      0x2A: [`LD ${reg},(${hex(u24(addr + 2))})`, 5],
      0x23: [`INC ${reg}`, 2],
      0x2B: [`DEC ${reg}`, 2],
      0xE1: [`POP ${reg}`, 2],
      0xE3: [`EX (SP),${reg}`, 2],
      0xE5: [`PUSH ${reg}`, 2],
      0xE9: [`JP (${reg})`, 2],
      0xF9: [`LD SP,${reg}`, 2],
    };
    if (map[op2]) return { len: map[op2][1], text: map[op2][0] };
    return { len: 2, text: `${reg} prefix ${hex8(op2)}` };
  }

  if (op === 0xED) {
    const op2 = rom[addr + 1];
    const map = {
      0x44: ['NEG', 2],
      0x45: ['RETN', 2],
      0x47: ['LD I,A', 2],
      0x4D: ['RETI', 2],
      0x4F: ['LD R,A', 2],
      0x57: ['LD A,I', 2],
      0x5F: ['LD A,R', 2],
      0x67: ['RRD', 2],
      0x6F: ['RLD', 2],
      0xA0: ['LDI', 2],
      0xA1: ['CPI', 2],
      0xA8: ['LDD', 2],
      0xA9: ['CPD', 2],
      0xB0: ['LDIR', 2],
      0xB1: ['CPIR', 2],
      0xB8: ['LDDR', 2],
      0xB9: ['CPDR', 2],
    };
    if (map[op2]) return { len: map[op2][1], text: map[op2][0] };
    return { len: 2, text: `ED ${hex8(op2)}` };
  }

  if (op === 0xCB) return { len: 2, text: cbName(rom[addr + 1], 'A/B/C/D/E/H/L/(HL)') };

  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  }

  const one = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B',
    0x07: 'RLCA', 0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)',
    0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA', 0x12: 'LD (DE),A',
    0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA', 0x19: 'ADD HL,DE',
    0x1A: 'LD A,(DE)', 0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA', 0x29: 'ADD HL,HL',
    0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L', 0x2F: 'CPL', 0x33: 'INC SP',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3C: 'INC A',
    0x3D: 'DEC A', 0x3F: 'CCF', 0x76: 'HALT', 0x80: 'ADD A,B', 0x81: 'ADD A,C',
    0x82: 'ADD A,D', 0x83: 'ADD A,E', 0x84: 'ADD A,H', 0x85: 'ADD A,L',
    0x86: 'ADD A,(HL)', 0x87: 'ADD A,A', 0x88: 'ADC A,B', 0x89: 'ADC A,C',
    0x90: 'SUB B', 0x91: 'SUB C', 0x92: 'SUB D', 0x93: 'SUB E', 0xA0: 'AND B',
    0xA1: 'AND C', 0xA8: 'XOR B', 0xA9: 'XOR C', 0xAF: 'XOR A', 0xB0: 'OR B',
    0xB1: 'OR C', 0xB7: 'OR A', 0xB8: 'CP B', 0xB9: 'CP C', 0xC0: 'RET NZ',
    0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xC8: 'RET Z', 0xC9: 'RET', 0xD0: 'RET NC',
    0xD1: 'POP DE', 0xD5: 'PUSH DE', 0xD8: 'RET C', 0xE1: 'POP HL', 0xE5: 'PUSH HL',
    0xE9: 'JP (HL)', 0xEB: 'EX DE,HL', 0xF1: 'POP AF', 0xF3: 'DI', 0xF5: 'PUSH AF',
    0xF9: 'LD SP,HL', 0xFB: 'EI',
  };
  if (one[op]) return { len: 1, text: one[op] };

  const imm8 = {
    0x06: 'LD B', 0x0E: 'LD C', 0x16: 'LD D', 0x1E: 'LD E',
    0x26: 'LD H', 0x2E: 'LD L', 0x36: 'LD (HL)', 0x3E: 'LD A',
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP',
  };
  if (imm8[op]) return { len: 2, text: `${imm8[op]},${hex(rom[addr + 1], 2)}` };

  const imm24 = {
    0x01: 'LD BC', 0x11: 'LD DE', 0x21: 'LD HL', 0x22: 'LD', 0x2A: 'LD HL,',
    0x31: 'LD SP', 0x32: 'LD', 0x3A: 'LD A,', 0xC2: 'JP NZ', 0xC3: 'JP',
    0xC4: 'CALL NZ', 0xCA: 'JP Z', 0xCC: 'CALL Z', 0xCD: 'CALL', 0xD2: 'JP NC',
    0xD4: 'CALL NC', 0xDA: 'JP C', 0xDC: 'CALL C',
  };
  if (imm24[op]) {
    const value = hex(u24(addr + 1));
    if (op === 0x22) return { len: 4, text: `LD (${value}),HL` };
    if (op === 0x32) return { len: 4, text: `LD (${value}),A` };
    if (op === 0x3A) return { len: 4, text: `LD A,(${value})` };
    if (op === 0x2A) return { len: 4, text: `LD HL,(${value})` };
    return { len: 4, text: `${imm24[op]},${value}` };
  }

  const jr = { 0x10: 'DJNZ', 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
  if (jr[op]) return { len: 2, text: `${jr[op]},${hex(rel(addr, addr + 1))}` };

  const rst = op & 0xC7;
  if (rst === 0xC7) return { len: 1, text: `RST ${hex(op & 0x38, 2)}` };

  return { len: 1, text: `DB ${hex8(op)}` };
}

function analyze(start, stopAtRet = true, maxBytes = 0x200) {
  const instructions = [];
  const calls = new Set();
  const jumps = new Set();
  const reads = new Set();
  const writes = new Set();
  let addr = start;

  while (addr < start + maxBytes && addr < rom.length) {
    const ins = decode(addr);
    const raw = bytes(addr, ins.len);
    const line = { addr, raw, text: ins.text, len: ins.len };
    instructions.push(line);

    const call = ins.text.match(/^CALL(?: [A-Z]+)?,(0x[0-9A-F]{6})$/);
    const jp = ins.text.match(/^JP(?: [A-Z]+)?,(0x[0-9A-F]{6})$/);
    const loadRead = ins.text.match(/^LD [A-Z]+,\((0x[0-9A-F]{6})\)$/);
    const loadWrite = ins.text.match(/^LD \((0x[0-9A-F]{6})\),/);
    if (call) calls.add(call[1]);
    if (jp) jumps.add(jp[1]);
    if (loadRead) reads.add(loadRead[1]);
    if (loadWrite) writes.add(loadWrite[1]);

    addr += ins.len;
    if (stopAtRet && /^RET/.test(ins.text)) break;
  }

  return { start, end: addr, size: addr - start, instructions, calls, jumps, reads, writes };
}

function printBlock(title, analysis) {
  console.log(`\n=== ${title} ===`);
  console.log(`range: ${hex(analysis.start)}..${hex(analysis.end - 1)} (${analysis.size} bytes)`);
  for (const ins of analysis.instructions) {
    console.log(`${hex(ins.addr)}  ${ins.raw.padEnd(14)}  ${ins.text}`);
  }
  console.log(`calls: ${[...analysis.calls].join(', ') || '(none)'}`);
  console.log(`jumps: ${[...analysis.jumps].join(', ') || '(none)'}`);
  console.log(`RAM reads: ${[...analysis.reads].join(', ') || '(none)'}`);
  console.log(`RAM writes: ${[...analysis.writes].join(', ') || '(none)'}`);
}

function printContext() {
  const start = CALLER - 20;
  const end = CALLER + 50;
  console.log('\n=== Calling context around 0x0A22DA ===');
  for (let addr = start; addr < end;) {
    const marker = addr === CALLER ? '>>' : '  ';
    const ins = decode(addr);
    console.log(`${marker} ${hex(addr)}  ${bytes(addr, ins.len).padEnd(14)}  ${ins.text}`);
    addr += ins.len;
  }
}

function setIntersection(a, b) {
  return [...a].filter((value) => b.has(value));
}

function setDifference(a, b) {
  return [...a].filter((value) => !b.has(value));
}

function printComparison(a, b) {
  console.log('\n=== Comparison: 0x09EF20 immediate vs 0x09EF44 deferred ===');
  console.log(`immediate size: ${a.size} bytes`);
  console.log(`deferred size:  ${b.size} bytes`);
  console.log(`shared calls: ${setIntersection(a.calls, b.calls).join(', ') || '(none)'}`);
  console.log(`immediate-only calls: ${setDifference(a.calls, b.calls).join(', ') || '(none)'}`);
  console.log(`deferred-only calls: ${setDifference(b.calls, a.calls).join(', ') || '(none)'}`);
  console.log(`shared RAM reads: ${setIntersection(a.reads, b.reads).join(', ') || '(none)'}`);
  console.log(`immediate-only RAM reads: ${setDifference(a.reads, b.reads).join(', ') || '(none)'}`);
  console.log(`deferred-only RAM reads: ${setDifference(b.reads, a.reads).join(', ') || '(none)'}`);
  console.log(`shared RAM writes: ${setIntersection(a.writes, b.writes).join(', ') || '(none)'}`);
  console.log(`immediate-only RAM writes: ${setDifference(a.writes, b.writes).join(', ') || '(none)'}`);
  console.log(`deferred-only RAM writes: ${setDifference(b.writes, a.writes).join(', ') || '(none)'}`);

  const min = Math.min(a.instructions.length, b.instructions.length);
  let commonPrefix = 0;
  while (
    commonPrefix < min &&
    a.instructions[commonPrefix].raw === b.instructions[commonPrefix].raw &&
    a.instructions[commonPrefix].text === b.instructions[commonPrefix].text
  ) {
    commonPrefix++;
  }
  console.log(`identical instruction prefix: ${commonPrefix} instruction(s)`);
}

console.log(`ROM loaded: ${rom.length} bytes`);

const immediate = analyze(START_IMMEDIATE);
const deferred = analyze(START_DEFERRED);

printBlock('0x09EF20 immediate rendering path', immediate);
printBlock('0x09EF44 deferred rendering path', deferred);
printContext();
printComparison(immediate, deferred);
