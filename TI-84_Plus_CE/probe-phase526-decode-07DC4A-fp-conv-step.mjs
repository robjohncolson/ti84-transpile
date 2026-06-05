#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x07dc4a;
const MAX_SCAN = 0x100;
const RAM_MIN = 0xd00000;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function u24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function inRom(addr) {
  return addr >= 0 && addr < rom.length;
}

function isRam(addr) {
  return addr >= RAM_MIN;
}

function decodeAt(pc) {
  const start = pc;
  let op = rom[pc];
  let prefix = '';

  // FD CB / DD CB — index register bit operations (4-byte encoding)
  if ((op === 0xFD || op === 0xDD) && rom[pc + 1] === 0xCB) {
    if (op === 0xFD) return decodeFdCb(start);
    // DD CB — same encoding but with IX
    const disp = signed8(rom[pc + 2]);
    const cbOp = rom[pc + 3];
    const dispStr = disp >= 0 ? `+${disp}` : `${disp}`;
    const bytes = [...rom.slice(start, start + 4)].map(hexByte).join(' ');
    const bit = (cbOp >> 3) & 7;
    let text;
    if (cbOp < 0x40) {
      const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      text = `${rotOps[(cbOp >> 3) & 7]} (IX${dispStr})`;
    } else if (cbOp < 0x80) {
      text = `BIT ${bit},(IX${dispStr})`;
    } else if (cbOp < 0xc0) {
      text = `RES ${bit},(IX${dispStr})`;
    } else {
      text = `SET ${bit},(IX${dispStr})`;
    }
    return { addr: start, len: 4, bytes, text };
  }

  if (op === 0x40) {
    prefix = 'SIS ';
    pc += 1;
    op = rom[pc];
  }

  const imm24 = () => u24(pc + 1);
  const imm16 = () => u16(pc + 1);
  const relTarget = () => pc + 2 + signed8(rom[pc + 1]);
  const lenWithPrefix = (len) => len + (pc - start);
  const bytesFor = (len) => [...rom.slice(start, start + lenWithPrefix(len))].map(hexByte).join(' ');
  const out = (len, text, extra = {}) => ({
    addr: start,
    len: lenWithPrefix(len),
    bytes: bytesFor(len),
    text: `${prefix}${text}`,
    ...extra,
  });

  // CB prefix — bit/rotate/shift ops
  if (op === 0xCB) {
    const cbOp = rom[pc + 1];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const r = regs[cbOp & 7];
    const bit = (cbOp >> 3) & 7;
    let text;
    if (cbOp < 0x08) text = `RLC ${r}`;
    else if (cbOp < 0x10) text = `RRC ${r}`;
    else if (cbOp < 0x18) text = `RL ${r}`;
    else if (cbOp < 0x20) text = `RR ${r}`;
    else if (cbOp < 0x28) text = `SLA ${r}`;
    else if (cbOp < 0x30) text = `SRA ${r}`;
    else if (cbOp < 0x38) text = `SLL ${r}`;
    else if (cbOp < 0x40) text = `SRL ${r}`;
    else if (cbOp < 0x80) text = `BIT ${bit},${r}`;
    else if (cbOp < 0xC0) text = `RES ${bit},${r}`;
    else text = `SET ${bit},${r}`;
    const totalLen = 2 + (pc - start);
    const cbBytes = [...rom.slice(start, start + totalLen)].map(hexByte).join(' ');
    return { addr: start, len: totalLen, bytes: cbBytes, text: `${prefix}${text}` };
  }

  switch (op) {
    case 0x00: return out(1, 'NOP');
    case 0x01: return out(4, `LD BC,${hex(imm24())}`);
    case 0x11: return out(4, `LD DE,${hex(imm24())}`);
    case 0x21: return out(4, `LD HL,${hex(imm24())}`);
    case 0x31: return out(4, `LD SP,${hex(imm24())}`);
    case 0x02: return out(1, 'LD (BC),A', { ramWrite: 'BC' });
    case 0x0a: return out(1, 'LD A,(BC)', { ramRead: 'BC' });
    case 0x12: return out(1, 'LD (DE),A', { ramWrite: 'DE' });
    case 0x1a: return out(1, 'LD A,(DE)', { ramRead: 'DE' });
    case 0x22: {
      const target = imm24();
      return out(4, `LD (${hex(target)}),HL`, isRam(target) ? { ramWrite: target } : {});
    }
    case 0x2a: {
      const target = imm24();
      return out(4, `LD HL,(${hex(target)})`, isRam(target) ? { ramRead: target } : {});
    }
    case 0x32: {
      const target = imm24();
      return out(4, `LD (${hex(target)}),A`, isRam(target) ? { ramWrite: target } : {});
    }
    case 0x3a: {
      const target = imm24();
      return out(4, `LD A,(${hex(target)})`, isRam(target) ? { ramRead: target } : {});
    }
    case 0x06: return out(2, `LD B,${hexByte(rom[pc + 1])}`);
    case 0x0e: return out(2, `LD C,${hexByte(rom[pc + 1])}`);
    case 0x16: return out(2, `LD D,${hexByte(rom[pc + 1])}`);
    case 0x1e: return out(2, `LD E,${hexByte(rom[pc + 1])}`);
    case 0x26: return out(2, `LD H,${hexByte(rom[pc + 1])}`);
    case 0x2e: return out(2, `LD L,${hexByte(rom[pc + 1])}`);
    case 0x36: return out(2, `LD (HL),${hexByte(rom[pc + 1])}`, { ramWrite: 'HL' });
    case 0x3e: return out(2, `LD A,${hexByte(rom[pc + 1])}`);
    case 0x18: return out(2, `JR ${hex(relTarget())}`, { jump: relTarget() });
    case 0x20: return out(2, `JR NZ,${hex(relTarget())}`, { jump: relTarget() });
    case 0x28: return out(2, `JR Z,${hex(relTarget())}`, { jump: relTarget() });
    case 0x30: return out(2, `JR NC,${hex(relTarget())}`, { jump: relTarget() });
    case 0x38: return out(2, `JR C,${hex(relTarget())}`, { jump: relTarget() });
    case 0x10: return out(2, `DJNZ ${hex(relTarget())}`, { jump: relTarget() });
    case 0xc2: return out(4, `JP NZ,${hex(imm24())}`, { jump: imm24() });
    case 0xc3: return out(4, `JP ${hex(imm24())}`, { jump: imm24(), ret: true });
    case 0xca: return out(4, `JP Z,${hex(imm24())}`, { jump: imm24() });
    case 0xd2: return out(4, `JP NC,${hex(imm24())}`, { jump: imm24() });
    case 0xda: return out(4, `JP C,${hex(imm24())}`, { jump: imm24() });
    case 0xc4: return out(4, `CALL NZ,${hex(imm24())}`, { call: imm24() });
    case 0xcc: return out(4, `CALL Z,${hex(imm24())}`, { call: imm24() });
    case 0xcd: return out(4, `CALL ${hex(imm24())}`, { call: imm24() });
    case 0xd4: return out(4, `CALL NC,${hex(imm24())}`, { call: imm24() });
    case 0xdc: return out(4, `CALL C,${hex(imm24())}`, { call: imm24() });
    case 0xc9: return out(1, 'RET', { ret: true });
    case 0xc0: return out(1, 'RET NZ');
    case 0xc8: return out(1, 'RET Z');
    case 0xd0: return out(1, 'RET NC');
    case 0xd8: return out(1, 'RET C');
    case 0xc6: return out(2, `ADD A,${hexByte(rom[pc + 1])}`);
    case 0xce: return out(2, `ADC A,${hexByte(rom[pc + 1])}`);
    case 0xd6: return out(2, `SUB ${hexByte(rom[pc + 1])}`);
    case 0xde: return out(2, `SBC A,${hexByte(rom[pc + 1])}`);
    case 0xe6: return out(2, `AND ${hexByte(rom[pc + 1])}`);
    case 0xee: return out(2, `XOR ${hexByte(rom[pc + 1])}`);
    case 0xf6: return out(2, `OR ${hexByte(rom[pc + 1])}`);
    case 0xfe: return out(2, `CP ${hexByte(rom[pc + 1])}`);
    case 0x07: return out(1, 'RLCA');
    case 0x0f: return out(1, 'RRCA');
    case 0x17: return out(1, 'RLA');
    case 0x1f: return out(1, 'RRA');
    case 0x08: return out(1, "EX AF,AF'");
    case 0xd9: return out(1, 'EXX');
    case 0xf3: return out(1, 'DI');
    case 0xfb: return out(1, 'EI');
    case 0xed: return decodeEd(start, pc);
    default: return decodeCommon(start, pc, prefix);
  }
}

function decodeEd(start, pc) {
  const op = rom[pc + 1];
  const prefixLen = pc - start;
  const bytesFor = (len) => [...rom.slice(start, start + len + prefixLen)].map(hexByte).join(' ');
  const out = (len, text, extra = {}) => ({
    addr: start,
    len: len + prefixLen,
    bytes: bytesFor(len),
    text,
    ...extra,
  });

  switch (op) {
    case 0x44: return out(2, 'NEG');
    case 0x45: return out(2, 'RETN', { ret: true });
    case 0x4d: return out(2, 'RETI', { ret: true });
    case 0x47: return out(2, 'LD I,A');
    case 0x4f: return out(2, 'LD R,A');
    case 0x57: return out(2, 'LD A,I');
    case 0x5f: return out(2, 'LD A,R');
    case 0xa0: return out(2, 'LDI', { ramRead: 'HL', ramWrite: 'DE' });
    case 0xa1: return out(2, 'CPI', { ramRead: 'HL' });
    case 0xa8: return out(2, 'LDD', { ramRead: 'HL', ramWrite: 'DE' });
    case 0xa9: return out(2, 'CPD', { ramRead: 'HL' });
    case 0xb0: return out(2, 'LDIR', { ramRead: 'HL', ramWrite: 'DE' });
    case 0xb1: return out(2, 'CPIR', { ramRead: 'HL' });
    case 0xb8: return out(2, 'LDDR', { ramRead: 'HL', ramWrite: 'DE' });
    case 0xb9: return out(2, 'CPDR', { ramRead: 'HL' });
    default: return out(2, `ED ${hexByte(op)}`);
  }
}

function decodeFdCb(start) {
  // FD CB dd op — IY bit/rotate with displacement
  const disp = signed8(rom[start + 2]);
  const op = rom[start + 3];
  const dispStr = disp >= 0 ? `+${disp}` : `${disp}`;
  const totalLen = 4;
  const bytes = [...rom.slice(start, start + totalLen)].map(hexByte).join(' ');
  const bit = (op >> 3) & 7;

  let text;
  if (op < 0x40) {
    const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    text = `${rotOps[(op >> 3) & 7]} (IY${dispStr})`;
  } else if (op < 0x80) {
    text = `BIT ${bit},(IY${dispStr})`;
  } else if (op < 0xc0) {
    text = `RES ${bit},(IY${dispStr})`;
  } else {
    text = `SET ${bit},(IY${dispStr})`;
  }

  return { addr: start, len: totalLen, bytes, text };
}

function decodeCommon(start, pc, prefix) {
  const op = rom[pc];
  const len = 1 + (pc - start);
  const bytes = [...rom.slice(start, start + len)].map(hexByte).join(' ');
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    const dst = r[(op >> 3) & 7];
    const src = r[op & 7];
    return {
      addr: start,
      len,
      bytes,
      text: `${prefix}LD ${dst},${src}`,
      ...(src === '(HL)' ? { ramRead: 'HL' } : {}),
      ...(dst === '(HL)' ? { ramWrite: 'HL' } : {}),
    };
  }

  const single = {
    0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x09: 'ADD HL,BC',
    0x0b: 'DEC BC', 0x0c: 'INC C', 0x0d: 'DEC C', 0x13: 'INC DE',
    0x14: 'INC D', 0x15: 'DEC D', 0x19: 'ADD HL,DE', 0x1b: 'DEC DE',
    0x1c: 'INC E', 0x1d: 'DEC E', 0x23: 'INC HL', 0x24: 'INC H',
    0x25: 'DEC H', 0x27: 'DAA', 0x29: 'ADD HL,HL', 0x2b: 'DEC HL',
    0x2c: 'INC L', 0x2d: 'DEC L', 0x2f: 'CPL', 0x33: 'INC SP',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x39: 'ADD HL,SP',
    0x3b: 'DEC SP', 0x3c: 'INC A', 0x3d: 'DEC A', 0x3f: 'CCF',
    0x76: 'HALT', 0x87: 'ADD A,A', 0x80: 'ADD A,B', 0x81: 'ADD A,C',
    0x82: 'ADD A,D', 0x83: 'ADD A,E', 0x84: 'ADD A,H', 0x85: 'ADD A,L',
    0x86: 'ADD A,(HL)', 0x8f: 'ADC A,A', 0x90: 'SUB B', 0x91: 'SUB C',
    0x92: 'SUB D', 0x93: 'SUB E', 0x94: 'SUB H', 0x95: 'SUB L',
    0x96: 'SUB (HL)', 0x97: 'SUB A', 0xa0: 'AND B', 0xa1: 'AND C',
    0xa2: 'AND D', 0xa3: 'AND E', 0xa4: 'AND H', 0xa5: 'AND L',
    0xa6: 'AND (HL)', 0xa7: 'AND A', 0xa8: 'XOR B', 0xa9: 'XOR C',
    0xaa: 'XOR D', 0xab: 'XOR E', 0xac: 'XOR H', 0xad: 'XOR L',
    0xae: 'XOR (HL)', 0xaf: 'XOR A', 0xb0: 'OR B', 0xb1: 'OR C',
    0xb2: 'OR D', 0xb3: 'OR E', 0xb4: 'OR H', 0xb5: 'OR L',
    0xb6: 'OR (HL)', 0xb7: 'OR A', 0xb8: 'CP B', 0xb9: 'CP C',
    0xba: 'CP D', 0xbb: 'CP E', 0xbc: 'CP H', 0xbd: 'CP L',
    0xbe: 'CP (HL)', 0xbf: 'CP A', 0xc1: 'POP BC', 0xc5: 'PUSH BC',
    0xd1: 'POP DE', 0xd5: 'PUSH DE', 0xe1: 'POP HL', 0xe5: 'PUSH HL',
    0xe3: 'EX (SP),HL', 0xe9: 'JP (HL)', 0xeb: 'EX DE,HL', 0xf1: 'POP AF',
    0xf5: 'PUSH AF', 0xf9: 'LD SP,HL',
  };

  return {
    addr: start,
    len,
    bytes,
    text: prefix + (single[op] ?? `DB ${hexByte(op)}`),
    ...([0x34, 0x35, 0x86, 0x96, 0xa6, 0xae, 0xb6, 0xbe].includes(op) ? { ramRead: 'HL' } : {}),
    ...([0x34, 0x35].includes(op) ? { ramWrite: 'HL' } : {}),
  };
}

function disassemble(start, maxBytes = MAX_SCAN) {
  const instructions = [];
  let pc = start;
  const end = Math.min(start + maxBytes, rom.length);

  while (pc < end && inRom(pc)) {
    const ins = decodeAt(pc);
    instructions.push(ins);
    pc += Math.max(ins.len, 1);
    if (ins.ret) break;
  }

  return instructions;
}

function collect(instructions) {
  const calls = new Set();
  const jumps = new Set();
  const ramReads = new Set();
  const ramWrites = new Set();

  for (const ins of instructions) {
    if (typeof ins.call === 'number') calls.add(ins.call);
    if (typeof ins.jump === 'number') jumps.add(ins.jump);
    if (ins.ramRead !== undefined) ramReads.add(ins.ramRead);
    if (ins.ramWrite !== undefined) ramWrites.add(ins.ramWrite);
  }

  return { calls, jumps, ramReads, ramWrites };
}

function printListing(title, start, instructions) {
  console.log(`\n## ${title} ${hex(start)}`);
  for (const ins of instructions) {
    console.log(`${hex(ins.addr)}  ${ins.bytes.padEnd(15)}  ${ins.text}`);
  }
}

function printSet(title, values) {
  const rendered = [...values].map((value) => typeof value === 'number' ? hex(value) : value);
  console.log(`${title}: ${rendered.length ? rendered.join(', ') : '(none)'}`);
}

const main = disassemble(ENTRY);
const all = [...main];
const mainSummary = collect(main);

console.log('# Phase 526: decode 0x07DC4A FP conversion chain first step');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Entry: ${hex(ENTRY)}`);
printListing('Primary listing', ENTRY, main);

console.log('\n## One-level CALL targets');
for (const target of mainSummary.calls) {
  if (!inRom(target)) {
    console.log(`\n## CALL target ${hex(target)} is outside ROM image`);
    continue;
  }
  const sub = disassemble(target);
  all.push(...sub);
  printListing('CALL target listing', target, sub);
}

const total = collect(all);
console.log('\n## Summary');
printSet('CALL targets', total.calls);
printSet('JP/JR targets', total.jumps);
printSet('RAM reads', total.ramReads);
printSet('RAM writes', total.ramWrites);

const fpAddresses = [0xd005f8, 0xd00603, 0xd0060e];
const touchedFp = [...total.ramReads, ...total.ramWrites]
  .filter((value) => typeof value === 'number' && fpAddresses.some((base) => value >= base && value < base + 11));

console.log('\n## Purpose hypothesis');
if (touchedFp.length > 0) {
  console.log(`Touches FP accumulator RAM near ${[...new Set(touchedFp)].map((value) => hex(value)).join(', ')}.`);
  console.log('Likely prepares or normalizes an FP accumulator as the first step of the 0x07DBEF conversion chain.');
} else if (mainSummary.calls.size > 0) {
  console.log('Does not expose direct FP accumulator absolute accesses in the shallow decode; behavior is likely delegated to the listed CALL target(s).');
  console.log('Interpret the target listings above for the concrete FP accumulator movement or normalization step.');
} else {
  console.log('No direct FP accumulator absolute accesses or CALL delegation were detected in this shallow decode.');
  console.log('Inspect register-indirect RAM operations and branch targets above to refine the FP conversion role.');
}
