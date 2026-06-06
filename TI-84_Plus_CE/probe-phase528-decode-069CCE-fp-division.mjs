import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x069CCE;
const MAIN_LIMIT = 0x120;
const SUB_LIMIT = 0x80;
const MAX_DEPTH = 4;

const rom = fs.readFileSync(ROM_PATH);

const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD3FFFF;
const FP_NAMES = new Map([
  [0xD005F8, 'OP1.type'],
  [0xD005F9, 'OP1.sign'],
  [0xD005FA, 'OP1.exp'],
  [0xD00603, 'OP2.type'],
  [0xD00604, 'OP2.sign'],
  [0xD00605, 'OP2.exp'],
  [0xD0060E, 'OP3.type'],
  [0xD0060F, 'OP3.sign'],
  [0xD00610, 'OP3.exp'],
  [0xD00624, 'OP5.type'],
  [0xD0062F, 'OP6.type'],
  [0xD00842, 'default/error FP value'],
]);

const calls = new Set();
const jumps = new Set();
const ramReads = new Map();
const ramWrites = new Map();
const flagEvents = [];
const decodedBlocks = [];
const visited = new Set();

function hex2(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function hex4(n) {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

function hex6(n) {
  return n.toString(16).toUpperCase().padStart(6, '0');
}

function b(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex2(b(addr + i))).join(' ');
}

function rel(n) {
  return n & 0x80 ? n - 0x100 : n;
}

function addrName(addr) {
  if (FP_NAMES.has(addr)) return FP_NAMES.get(addr);
  for (const [base, name] of FP_NAMES) {
    if (addr > base && addr < base + 11) return `${name.split('.')[0]}+${hex2(addr - base)}`;
  }
  return '';
}

function addAccess(map, addr, at, op) {
  if (addr < RAM_MIN || addr > RAM_MAX) return;
  const key = hex6(addr);
  const item = map.get(key) ?? { addr, name: addrName(addr), refs: [] };
  item.refs.push({ at, op });
  map.set(key, item);
}

function reg8(code) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][code & 7];
}

function condName(op) {
  return {
    0x20: 'NZ',
    0x28: 'Z',
    0x30: 'NC',
    0x38: 'C',
    0xC2: 'NZ',
    0xCA: 'Z',
    0xD2: 'NC',
    0xDA: 'C',
    0xC4: 'NZ',
    0xCC: 'Z',
    0xD4: 'NC',
    0xDC: 'C',
  }[op];
}

function noteFlags(addr, text) {
  flagEvents.push({ addr, text });
}

function decodeCB(addr, prefix = '') {
  const op = b(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const r = reg8(z);
  if (x === 0) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return { len: 2, text: `${ops[y]} ${prefix}${r}` };
  }
  if (x === 1) return { len: 2, text: `BIT ${y},${prefix}${r}` };
  if (x === 2) return { len: 2, text: `RES ${y},${prefix}${r}` };
  return { len: 2, text: `SET ${y},${prefix}${r}` };
}

function decodeED(addr) {
  const op = b(addr + 1);
  const imm = u24(addr + 2);
  switch (op) {
    case 0x43:
      addAccess(ramWrites, imm, addr, 'LD (nn),BC');
      return { len: 5, text: `LD ($${hex6(imm)}),BC` };
    case 0x4B:
      addAccess(ramReads, imm, addr, 'LD BC,(nn)');
      return { len: 5, text: `LD BC,($${hex6(imm)})` };
    case 0x53:
      addAccess(ramWrites, imm, addr, 'LD (nn),DE');
      return { len: 5, text: `LD ($${hex6(imm)}),DE` };
    case 0x5B:
      addAccess(ramReads, imm, addr, 'LD DE,(nn)');
      return { len: 5, text: `LD DE,($${hex6(imm)})` };
    case 0x6B:
      addAccess(ramReads, imm, addr, 'LD HL,(nn)');
      return { len: 5, text: `LD HL,($${hex6(imm)})` };
    case 0x73:
      addAccess(ramWrites, imm, addr, 'LD (nn),SP');
      return { len: 5, text: `LD ($${hex6(imm)}),SP` };
    case 0x7B:
      addAccess(ramReads, imm, addr, 'LD SP,(nn)');
      return { len: 5, text: `LD SP,($${hex6(imm)})` };
    case 0xA0:
      return { len: 2, text: 'LDI ; copies (HL)->(DE), BC--, flags from count' };
    case 0xA8:
      return { len: 2, text: 'LDD ; copies (HL)->(DE), BC--, flags from count' };
    case 0xB0:
      return { len: 2, text: 'LDIR ; repeated copy (HL)->(DE)' };
    case 0xB8:
      return { len: 2, text: 'LDDR ; repeated reverse copy (HL)->(DE)' };
    default:
      return { len: 2, text: `ED ${hex2(op)}` };
  }
}

function decodeIndexed(addr, ix) {
  const op = b(addr + 1);
  const rr = ix === 0xDD ? 'IX' : 'IY';
  if (op === 0x21) return { len: 5, text: `LD ${rr},$${hex6(u24(addr + 2))}` };
  if (op === 0x22) {
    const imm = u24(addr + 2);
    addAccess(ramWrites, imm, addr, `LD (nn),${rr}`);
    return { len: 5, text: `LD ($${hex6(imm)}),${rr}` };
  }
  if (op === 0x2A) {
    const imm = u24(addr + 2);
    addAccess(ramReads, imm, addr, `LD ${rr},(nn)`);
    return { len: 5, text: `LD ${rr},($${hex6(imm)})` };
  }
  if (op === 0x36) return { len: 4, text: `LD (${rr}${rel(b(addr + 2)) >= 0 ? '+' : ''}${rel(b(addr + 2))}),$${hex2(b(addr + 3))}` };
  if (op === 0xCB) {
    const d = rel(b(addr + 2));
    const cb = b(addr + 3);
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const names = x === 1 ? 'BIT' : x === 2 ? 'RES' : x === 3 ? 'SET' : ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y];
    return { len: 4, text: `${names} ${x === 0 ? '' : `${y},`}(${rr}${d >= 0 ? '+' : ''}${d})` };
  }
  if ((op & 0xC7) === 0x46) return { len: 3, text: `LD ${reg8((op >> 3) & 7)},(${rr}${rel(b(addr + 2)) >= 0 ? '+' : ''}${rel(b(addr + 2))})` };
  if ((op & 0xF8) === 0x70) return { len: 3, text: `LD (${rr}${rel(b(addr + 2)) >= 0 ? '+' : ''}${rel(b(addr + 2))}),${reg8(op)}` };
  return { len: 2, text: `${rr} prefix ${hex2(op)}` };
}

function decode(addr) {
  const op = b(addr);
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    return { len: 1, text: `LD ${reg8(op >> 3)},${reg8(op)}` };
  }
  if (op >= 0x80 && op <= 0xBF) {
    const group = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    if (group === 'ADC A' || group === 'SBC A') noteFlags(addr, `${group} consumes carry during multi-byte arithmetic`);
    if (group === 'CP') noteFlags(addr, 'CP sets carry when A is less than operand');
    return { len: 1, text: `${group},${reg8(op)}`.replace('SUB,', 'SUB ') };
  }

  const imm24 = u24(addr + 1);
  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,$${hex6(imm24)}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,$${hex2(b(addr + 1))}` };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x08: return { len: 1, text: 'EX AF,AF\'' };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0A: return { len: 1, text: 'LD A,(BC)' };
    case 0x0B: return { len: 1, text: 'DEC BC' };
    case 0x0C: return { len: 1, text: 'INC C' };
    case 0x0D: return { len: 1, text: 'DEC C' };
    case 0x0E: return { len: 2, text: `LD C,$${hex2(b(addr + 1))}` };
    case 0x0F: return { len: 1, text: 'RRCA' };
    case 0x10: return { len: 2, text: `DJNZ $${hex6(addr + 2 + rel(b(addr + 1)))}` };
    case 0x11: return { len: 4, text: `LD DE,$${hex6(imm24)}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x14: return { len: 1, text: 'INC D' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x16: return { len: 2, text: `LD D,$${hex2(b(addr + 1))}` };
    case 0x17: noteFlags(addr, 'RLA rotates carry through A'); return { len: 1, text: 'RLA' };
    case 0x18: {
      const target = addr + 2 + rel(b(addr + 1));
      jumps.add(target);
      return { len: 2, text: `JR $${hex6(target)}`, branch: target };
    }
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1A: return { len: 1, text: 'LD A,(DE)' };
    case 0x1B: return { len: 1, text: 'DEC DE' };
    case 0x1C: return { len: 1, text: 'INC E' };
    case 0x1D: return { len: 1, text: 'DEC E' };
    case 0x1E: return { len: 2, text: `LD E,$${hex2(b(addr + 1))}` };
    case 0x1F: noteFlags(addr, 'RRA rotates carry through A'); return { len: 1, text: 'RRA' };
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      const target = addr + 2 + rel(b(addr + 1));
      jumps.add(target);
      noteFlags(addr, `JR ${condName(op)} branches on zero/carry state`);
      return { len: 2, text: `JR ${condName(op)},$${hex6(target)}`, branch: target, conditional: true };
    }
    case 0x21: return { len: 4, text: `LD HL,$${hex6(imm24)}` };
    case 0x22: addAccess(ramWrites, imm24, addr, 'LD (nn),HL'); return { len: 4, text: `LD ($${hex6(imm24)}),HL` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x26: return { len: 2, text: `LD H,$${hex2(b(addr + 1))}` };
    case 0x27: return { len: 1, text: 'DAA ; BCD adjust after arithmetic' };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x2A: addAccess(ramReads, imm24, addr, 'LD HL,(nn)'); return { len: 4, text: `LD HL,($${hex6(imm24)})` };
    case 0x2B: return { len: 1, text: 'DEC HL' };
    case 0x2C: return { len: 1, text: 'INC L' };
    case 0x2D: return { len: 1, text: 'DEC L' };
    case 0x2E: return { len: 2, text: `LD L,$${hex2(b(addr + 1))}` };
    case 0x2F: return { len: 1, text: 'CPL' };
    case 0x31: return { len: 4, text: `LD SP,$${hex6(imm24)}` };
    case 0x32: addAccess(ramWrites, imm24, addr, 'LD (nn),A'); return { len: 4, text: `LD ($${hex6(imm24)}),A` };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x34: return { len: 1, text: 'INC (HL)' };
    case 0x35: return { len: 1, text: 'DEC (HL)' };
    case 0x36: return { len: 2, text: `LD (HL),$${hex2(b(addr + 1))}` };
    case 0x37: noteFlags(addr, 'SCF sets carry; often signals error/overflow or prepares ADC/SBC'); return { len: 1, text: 'SCF' };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x3A: addAccess(ramReads, imm24, addr, 'LD A,(nn)'); return { len: 4, text: `LD A,($${hex6(imm24)})` };
    case 0x3B: return { len: 1, text: 'DEC SP' };
    case 0x3C: return { len: 1, text: 'INC A' };
    case 0x3D: return { len: 1, text: 'DEC A' };
    case 0x3E: return { len: 2, text: `LD A,$${hex2(b(addr + 1))}` };
    case 0x3F: noteFlags(addr, 'CCF complements carry'); return { len: 1, text: 'CCF' };
    case 0x76: return { len: 1, text: 'HALT', terminal: true };
    case 0xC0: return { len: 1, text: 'RET NZ', terminal: true };
    case 0xC1: return { len: 1, text: 'POP BC' };
    case 0xC2:
    case 0xCA:
    case 0xD2:
    case 0xDA:
      jumps.add(imm24);
      noteFlags(addr, `JP ${condName(op)} branches on zero/carry state`);
      return { len: 4, text: `JP ${condName(op)},$${hex6(imm24)}`, branch: imm24, conditional: true };
    case 0xC3:
      jumps.add(imm24);
      return { len: 4, text: `JP $${hex6(imm24)}`, branch: imm24, terminal: true };
    case 0xC4:
    case 0xCC:
    case 0xD4:
    case 0xDC:
      calls.add(imm24);
      noteFlags(addr, `CALL ${condName(op)} depends on zero/carry state`);
      return { len: 4, text: `CALL ${condName(op)},$${hex6(imm24)}`, call: imm24, conditional: true };
    case 0xC5: return { len: 1, text: 'PUSH BC' };
    case 0xC6: return { len: 2, text: `ADD A,$${hex2(b(addr + 1))}` };
    case 0xC8: return { len: 1, text: 'RET Z', terminal: true };
    case 0xC9: return { len: 1, text: 'RET', terminal: true };
    case 0xCB: return decodeCB(addr);
    case 0xCD:
      calls.add(imm24);
      return { len: 4, text: `CALL $${hex6(imm24)}`, call: imm24 };
    case 0xCE: noteFlags(addr, 'ADC A,n consumes carry'); return { len: 2, text: `ADC A,$${hex2(b(addr + 1))}` };
    case 0xD0: return { len: 1, text: 'RET NC', terminal: true };
    case 0xD1: return { len: 1, text: 'POP DE' };
    case 0xD5: return { len: 1, text: 'PUSH DE' };
    case 0xD6: return { len: 2, text: `SUB $${hex2(b(addr + 1))}` };
    case 0xD8: return { len: 1, text: 'RET C', terminal: true };
    case 0xDE: noteFlags(addr, 'SBC A,n consumes carry'); return { len: 2, text: `SBC A,$${hex2(b(addr + 1))}` };
    case 0xE1: return { len: 1, text: 'POP HL' };
    case 0xE3: return { len: 1, text: 'EX (SP),HL' };
    case 0xE5: return { len: 1, text: 'PUSH HL' };
    case 0xE6: return { len: 2, text: `AND $${hex2(b(addr + 1))}` };
    case 0xE9: return { len: 1, text: 'JP (HL)', terminal: true };
    case 0xEB: return { len: 1, text: 'EX DE,HL' };
    case 0xED: return decodeED(addr);
    case 0xEE: return { len: 2, text: `XOR $${hex2(b(addr + 1))}` };
    case 0xF1: return { len: 1, text: 'POP AF' };
    case 0xF3: return { len: 1, text: 'DI' };
    case 0xF5: return { len: 1, text: 'PUSH AF' };
    case 0xF6: return { len: 2, text: `OR $${hex2(b(addr + 1))}` };
    case 0xF9: return { len: 1, text: 'LD SP,HL' };
    case 0xFB: return { len: 1, text: 'EI' };
    case 0xFE: noteFlags(addr, 'CP n sets carry when A is less than immediate'); return { len: 2, text: `CP $${hex2(b(addr + 1))}` };
    case 0xDD:
    case 0xFD:
      return decodeIndexed(addr, op);
    default:
      return { len: 1, text: `DB $${hex2(op)}` };
  }
}

function walkBlock(start, limit, depth, reason) {
  if (visited.has(start) || depth > MAX_DEPTH) return;
  visited.add(start);
  const lines = [];
  let pc = start;
  const end = Math.min(rom.length, start + limit);

  while (pc < end) {
    const ins = decode(pc);
    lines.push({
      addr: pc,
      bytes: bytes(pc, ins.len),
      text: ins.text,
    });

    const next = pc + ins.len;
    if (ins.call && ins.call < rom.length) {
      walkBlock(ins.call, SUB_LIMIT, depth + 1, `CALL from $${hex6(pc)}`);
    }
    if (ins.branch && ins.branch < rom.length && ins.conditional) {
      walkBlock(ins.branch, SUB_LIMIT, depth + 1, `conditional branch from $${hex6(pc)}`);
    }

    pc = next;
    if (ins.terminal) break;
  }

  decodedBlocks.push({ start, reason, depth, lines });
}

walkBlock(START, MAIN_LIMIT, 0, 'entry');

function printAccess(title, map) {
  console.log(`\n${title}`);
  if (map.size === 0) {
    console.log('  (none discovered by absolute-address decoder)');
    return;
  }
  for (const item of [...map.values()].sort((a, b) => a.addr - b.addr)) {
    const name = item.name ? ` ${item.name}` : '';
    const refs = item.refs.map((ref) => `$${hex6(ref.at)} ${ref.op}`).join('; ');
    console.log(`  $${hex6(item.addr)}${name}: ${refs}`);
  }
}

console.log('='.repeat(78));
console.log('Phase 528 decode probe: 0x069CCE complex FP division/normalization');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Entry: $${hex6(START)}`);
console.log('='.repeat(78));

for (const block of decodedBlocks.sort((a, b) => a.start - b.start || a.depth - b.depth)) {
  console.log(`\n-- Block $${hex6(block.start)} depth=${block.depth} (${block.reason}) --`);
  for (const line of block.lines) {
    console.log(`${hex6(line.addr)}  ${line.bytes.padEnd(15)} ${line.text}`);
  }
}

console.log('\nCALL targets discovered');
if (calls.size === 0) console.log('  (none)');
for (const target of [...calls].sort((a, b) => a - b)) console.log(`  $${hex6(target)}`);

console.log('\nJP/JR targets discovered');
if (jumps.size === 0) console.log('  (none)');
for (const target of [...jumps].sort((a, b) => a - b)) console.log(`  $${hex6(target)}`);

printAccess('RAM reads discovered', ramReads);
printAccess('RAM writes discovered', ramWrites);

console.log('\nCarry/flag events');
if (flagEvents.length === 0) {
  console.log('  (none decoded)');
} else {
  for (const event of flagEvents.sort((a, b) => a.addr - b.addr)) {
    console.log(`  $${hex6(event.addr)}: ${event.text}`);
  }
}

console.log('\nWorking summary');
console.log([
  'This probe decodes the 0x069CCE entry block and recursively follows static CALL',
  'targets plus conditional branch targets. Absolute RAM operands are classified as',
  'reads or writes and annotated when they overlap known OP1/OP2/OP3/OP5/OP6/default',
  'floating-point storage. Carry-producing and carry-consuming instructions are',
  'highlighted because this routine is expected to use carry for BCD mantissa',
  'normalization, quotient/remainder propagation, and success/error exits. Review',
  'SCF/CCF/ADC/SBC/RET C/RET NC sites in the printed disassembly to determine the',
  'final success/failure polarity for callers such as the 0x069E88 extended FP path.',
].join(' '));

