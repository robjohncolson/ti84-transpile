import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x08021b;
const MAIN_LIMIT = 0x400;
const SUB_LIMIT = 0x80;
const rom = fs.readFileSync(ROM_PATH);

const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const hex6 = n => `0x${n.toString(16).toUpperCase().padStart(6, '0')}`;
const rel = n => (n << 24) >> 24;
const b = addr => rom[addr] ?? 0;
const u16 = addr => b(addr) | (b(addr + 1) << 8);
const u24 = addr => b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
const bytes = (addr, len) => Array.from(rom.slice(addr, addr + len), hex2).join(' ');

const calls = new Set();
const jumps = new Set();
const ramReads = new Set();
const ramWrites = new Set();
const carryEvents = [];

function isLikelyRam(addr) {
  return addr >= 0xD00000 || (addr >= 0xD000 && addr <= 0xFFFF);
}

function noteAddr(kind, addr) {
  if (isLikelyRam(addr)) {
    (kind === 'read' ? ramReads : ramWrites).add(addr);
  }
}

function decode(addr) {
  const op = b(addr);
  const op1 = b(addr + 1);

  if (op === 0x40) {
    const sub = decodeSis(addr);
    return { ...sub, text: `${sub.text}`, sis: true };
  }

  if (op === 0xdd || op === 0xfd) {
    return decodeIndex(addr, op === 0xdd ? 'IX' : 'IY');
  }

  if (op === 0xed) {
    const ed = {
      0x42: 'SBC HL,BC',
      0x52: 'SBC HL,DE',
      0x62: 'SBC HL,HL',
      0x72: 'SBC HL,SP',
      0x4a: 'ADC HL,BC',
      0x5a: 'ADC HL,DE',
      0x6a: 'ADC HL,HL',
      0x7a: 'ADC HL,SP',
    }[op1];
    return { len: 2, text: ed ?? `ED ${hex2(op1)}` };
  }

  const imm24 = u24(addr + 1);
  const imm16 = u16(addr + 1);
  const d8 = b(addr + 1);
  const jrTarget = (addr + 2 + rel(d8)) & 0xffffff;

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,${hex6(imm24)}` };
    case 0x06: return { len: 2, text: `LD B,0x${hex2(d8)}` };
    case 0x0e: return { len: 2, text: `LD C,0x${hex2(d8)}` };
    case 0x11: return { len: 4, text: `LD DE,${hex6(imm24)}` };
    case 0x16: return { len: 2, text: `LD D,0x${hex2(d8)}` };
    case 0x1e: return { len: 2, text: `LD E,0x${hex2(d8)}` };
    case 0x21: return { len: 4, text: `LD HL,${hex6(imm24)}` };
    case 0x26: return { len: 2, text: `LD H,0x${hex2(d8)}` };
    case 0x2e: return { len: 2, text: `LD L,0x${hex2(d8)}` };
    case 0x31: return { len: 4, text: `LD SP,${hex6(imm24)}` };
    case 0x3e: return { len: 2, text: `LD A,0x${hex2(d8)}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x22: noteAddr('write', imm24); return { len: 4, text: `LD (${hex6(imm24)}),HL` };
    case 0x2a: noteAddr('read', imm24); return { len: 4, text: `LD HL,(${hex6(imm24)})` };
    case 0x32: noteAddr('write', imm24); return { len: 4, text: `LD (${hex6(imm24)}),A` };
    case 0x3a: noteAddr('read', imm24); return { len: 4, text: `LD A,(${hex6(imm24)})` };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x0c: return { len: 1, text: 'INC C' };
    case 0x0d: return { len: 1, text: 'DEC C' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x1b: return { len: 1, text: 'DEC DE' };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x2b: return { len: 1, text: 'DEC HL' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x0b: return { len: 1, text: 'DEC BC' };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x76: return { len: 1, text: 'HALT' };
    case 0x7e: return { len: 1, text: 'LD A,(HL)' };
    case 0x77: return { len: 1, text: 'LD (HL),A' };
    case 0xaf: return { len: 1, text: 'XOR A ; clears carry', carry: 'clear' };
    case 0xb7: return { len: 1, text: 'OR A ; clears carry', carry: 'clear' };
    case 0xbf: return { len: 1, text: 'CP A' };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc9: return { len: 1, text: 'RET', stop: true };
    case 0xcd: calls.add(imm24); return { len: 4, text: `CALL ${hex6(imm24)}` };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xc3: jumps.add(imm24); return { len: 4, text: `JP ${hex6(imm24)} ; tail/exit`, stop: true };
    case 0xc2: jumps.add(imm24); return { len: 4, text: `JP NZ,${hex6(imm24)}` };
    case 0xca: jumps.add(imm24); return { len: 4, text: `JP Z,${hex6(imm24)}` };
    case 0xd2: jumps.add(imm24); return { len: 4, text: `JP NC,${hex6(imm24)}` };
    case 0xda: jumps.add(imm24); return { len: 4, text: `JP C,${hex6(imm24)}` };
    case 0x18: jumps.add(jrTarget); return { len: 2, text: `JR ${hex6(jrTarget)}` };
    case 0x20: jumps.add(jrTarget); return { len: 2, text: `JR NZ,${hex6(jrTarget)}` };
    case 0x28: jumps.add(jrTarget); return { len: 2, text: `JR Z,${hex6(jrTarget)}` };
    case 0x30: jumps.add(jrTarget); return { len: 2, text: `JR NC,${hex6(jrTarget)}` };
    case 0x38: jumps.add(jrTarget); return { len: 2, text: `JR C,${hex6(jrTarget)}` };
    case 0xc0: return { len: 1, text: 'RET NZ', stop: true };
    case 0xc8: return { len: 1, text: 'RET Z', stop: true };
    case 0xd0: return { len: 1, text: 'RET NC', stop: true };
    case 0xd8: return { len: 1, text: 'RET C', stop: true };
    case 0x37: return { len: 1, text: 'SCF ; sets carry failure', carry: 'set' };
    case 0x3f: return { len: 1, text: 'CCF ; toggles carry', carry: 'toggle' };
    case 0xfe: return { len: 2, text: `CP 0x${hex2(d8)}` };
    default:
      if (op >= 0x40 && op <= 0x7f) return { len: 1, text: ldRegText(op) };
      if (op >= 0x80 && op <= 0xbf) return { len: 1, text: aluText(op) };
      return { len: 1, text: `DB 0x${hex2(op)} ; unknown` };
  }
}

function decodeSis(addr) {
  const op = b(addr + 1);
  const imm = u16(addr + 2);
  if (op === 0x21) return { len: 4, text: `.SIS LD HL,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x11) return { len: 4, text: `.SIS LD DE,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x01) return { len: 4, text: `.SIS LD BC,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x2a) return { len: 4, text: `.SIS LD HL,(0x${imm.toString(16).toUpperCase().padStart(4, '0')})` };
  if (op === 0x22) return { len: 4, text: `.SIS LD (0x${imm.toString(16).toUpperCase().padStart(4, '0')}),HL` };
  return { len: 2, text: `.SIS ${hex2(op)}` };
}

function decodeIndex(addr, reg) {
  const op = b(addr + 1);
  if (op === 0xe5) return { len: 2, text: `PUSH ${reg}` };
  if (op === 0xe1) return { len: 2, text: `POP ${reg}` };
  if (op === 0x21) return { len: 5, text: `LD ${reg},${hex6(u24(addr + 2))}` };
  if (op === 0x22) {
    const a = u24(addr + 2);
    noteAddr('write', a);
    return { len: 5, text: `LD (${hex6(a)}),${reg}` };
  }
  if (op === 0x2a) {
    const a = u24(addr + 2);
    noteAddr('read', a);
    return { len: 5, text: `LD ${reg},(${hex6(a)})` };
  }
  if (op === 0xcb) {
    const disp = rel(b(addr + 2));
    const cb = b(addr + 3);
    const bit = (cb - 0x46) >> 3;
    if ((cb & 0xc7) === 0x46) return { len: 4, text: `BIT ${bit},(${reg}${dispText(disp)})` };
    if ((cb & 0xc7) === 0x86) return { len: 4, text: `RES ${bit},(${reg}${dispText(disp)})` };
    if ((cb & 0xc7) === 0xc6) return { len: 4, text: `SET ${bit},(${reg}${dispText(disp)})` };
  }
  if (op === 0x7e) return { len: 3, text: `LD A,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x77) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))},A` };
  return { len: 2, text: `${reg} prefix ${hex2(op)}` };
}

function dispText(disp) {
  return disp < 0 ? `${disp}` : `+${disp}`;
}

function ldRegText(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  return `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`;
}

function aluText(op) {
  const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const text = `${ops[(op >> 3) & 7]} ${regs[op & 7]}`;
  if ((op & 0xf8) === 0xb0) return `${text} ; OR clears carry`;
  if ((op & 0xf8) === 0xa8) return `${text} ; XOR clears carry`;
  if ((op & 0xf8) === 0xa0) return `${text} ; AND clears carry`;
  return text;
}

function disassemble(start, limit) {
  const lines = [];
  let pc = start;
  const end = Math.min(rom.length, start + limit);
  while (pc < end) {
    const ins = decode(pc);
    if (ins.carry) carryEvents.push({ addr: pc, effect: ins.carry, text: ins.text });
    lines.push({ addr: pc, len: ins.len, text: ins.text, raw: bytes(pc, ins.len) });
    pc += ins.len;
    if (ins.stop) break;
  }
  return lines;
}

function printBlock(title, lines) {
  console.log(`\n## ${title}`);
  for (const line of lines) {
    console.log(`${hex6(line.addr)}  ${line.raw.padEnd(15)}  ${line.text}`);
  }
}

const main = disassemble(START, MAIN_LIMIT);
printBlock(`Main operation at ${hex6(START)}`, main);

for (const target of [...calls].sort((a, b) => a - b)) {
  printBlock(`CALL target preview ${hex6(target)}`, disassemble(target, SUB_LIMIT));
}

console.log('\n## Summary');
console.log(`Start: ${hex6(START)}`);
console.log(`Decoded main bytes: ${main.reduce((sum, line) => sum + line.len, 0)}`);
console.log(`CALL targets: ${[...calls].sort((a, b) => a - b).map(hex6).join(', ') || '(none)'}`);
console.log(`JP/JR targets: ${[...jumps].sort((a, b) => a - b).map(hex6).join(', ') || '(none)'}`);
console.log(`RAM reads: ${[...ramReads].sort((a, b) => a - b).map(hex6).join(', ') || '(none detected by absolute addressing)'}`);
console.log(`RAM writes: ${[...ramWrites].sort((a, b) => a - b).map(hex6).join(', ') || '(none detected by absolute addressing)'}`);
console.log('Carry flag events:');
if (carryEvents.length === 0) {
  console.log('  (none decoded directly; inspect called helpers and arithmetic/compare paths)');
} else {
  for (const event of carryEvents) console.log(`  ${hex6(event.addr)} ${event.effect}: ${event.text}`);
}
console.log('Purpose summary: Type-initializer main operation; inspect carry-setting exits above because caller treats C=1 as initialization failure and C=0 as success.');
