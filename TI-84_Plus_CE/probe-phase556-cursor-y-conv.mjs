import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const TARGET = 0x06CC02;
const REL_START = 0x06CBF0;
const REL_END = 0x06CC20;

const knownRam = new Map([
  [0xD008D5, 'renderer Y coordinate'],
  [0xD014FE, 'cursor Y / row count'],
]);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr(value) {
  return `0x${hex(value, 6)}`;
}

function ram(value) {
  return hex(value, 6);
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(offset, length) {
  return Array.from(rom.slice(offset, offset + length), b => hex(b)).join(' ');
}

function findFunctionStart(target) {
  const min = Math.max(0, target - 128);
  for (let i = target - 1; i >= min; i--) {
    if (rom[i] === 0xC9) return i + 1;
    if (rom[i] === 0xC3 && i + 3 < target) return i + 4;
  }
  return min;
}

function findFunctionEnd(target) {
  for (let i = target; i < rom.length; i++) {
    if (rom[i] === 0xC9) return i;
  }
  return rom.length - 1;
}

function decodeAt(pc) {
  const b = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];
  const b4 = rom[pc + 4];

  const imm24 = () => read24(pc + 1);
  const imm24ed = () => read24(pc + 2);
  const rel = () => {
    const d = b1 < 0x80 ? b1 : b1 - 0x100;
    return pc + 2 + d;
  };

  const one = text => ({ pc, size: 1, text });
  const two = text => ({ pc, size: 2, text });
  const three = text => ({ pc, size: 3, text });
  const four = (text, ref) => ({ pc, size: 4, text, ref });
  const five = (text, ref) => ({ pc, size: 5, text, ref });

  switch (b) {
    case 0x00: return one('NOP');
    case 0x01: return four(`LD BC,0x${hex(read24(pc + 1), 6)}`);
    case 0x02: return one('LD (BC),A');
    case 0x03: return one('INC BC');
    case 0x04: return one('INC B');
    case 0x05: return one('DEC B');
    case 0x06: return two(`LD B,0x${hex(b1)}`);
    case 0x07: return one('RLCA');
    case 0x08: return one('EX AF,AF\'');
    case 0x09: return one('ADD HL,BC');
    case 0x0A: return one('LD A,(BC)');
    case 0x0B: return one('DEC BC');
    case 0x0C: return one('INC C');
    case 0x0D: return one('DEC C');
    case 0x0E: return two(`LD C,0x${hex(b1)}`);
    case 0x0F: return one('RRCA');
    case 0x10: return two(`DJNZ ${addr(rel())}`);
    case 0x11: return four(`LD DE,0x${hex(read24(pc + 1), 6)}`);
    case 0x12: return one('LD (DE),A');
    case 0x13: return one('INC DE');
    case 0x14: return one('INC D');
    case 0x15: return one('DEC D');
    case 0x16: return two(`LD D,0x${hex(b1)}`);
    case 0x17: return one('RLA');
    case 0x18: return two(`JR ${addr(rel())}`);
    case 0x19: return one('ADD HL,DE');
    case 0x1A: return one('LD A,(DE)');
    case 0x1B: return one('DEC DE');
    case 0x1C: return one('INC E');
    case 0x1D: return one('DEC E');
    case 0x1E: return two(`LD E,0x${hex(b1)}`);
    case 0x1F: return one('RRA');
    case 0x20: return two(`JR NZ,${addr(rel())}`);
    case 0x21: return four(`LD HL,0x${hex(read24(pc + 1), 6)}`);
    case 0x22: return four(`LD (${ram(imm24())}),HL`, { type: 'write', width: 'HL', target: imm24() });
    case 0x23: return one('INC HL');
    case 0x24: return one('INC H');
    case 0x25: return one('DEC H');
    case 0x26: return two(`LD H,0x${hex(b1)}`);
    case 0x27: return one('DAA');
    case 0x28: return two(`JR Z,${addr(rel())}`);
    case 0x29: return one('ADD HL,HL');
    case 0x2A: return four(`LD HL,(${ram(imm24())})`, { type: 'read', width: 'HL', target: imm24() });
    case 0x2B: return one('DEC HL');
    case 0x2C: return one('INC L');
    case 0x2D: return one('DEC L');
    case 0x2E: return two(`LD L,0x${hex(b1)}`);
    case 0x2F: return one('CPL');
    case 0x30: return two(`JR NC,${addr(rel())}`);
    case 0x31: return four(`LD SP,0x${hex(read24(pc + 1), 6)}`);
    case 0x32: return four(`LD (${ram(imm24())}),A`, { type: 'write', width: 'A', target: imm24() });
    case 0x33: return one('INC SP');
    case 0x34: return one('INC (HL)');
    case 0x35: return one('DEC (HL)');
    case 0x36: return two(`LD (HL),0x${hex(b1)}`);
    case 0x37: return one('SCF');
    case 0x38: return two(`JR C,${addr(rel())}`);
    case 0x39: return one('ADD HL,SP');
    case 0x3A: return four(`LD A,(${ram(imm24())})`, { type: 'read', width: 'A', target: imm24() });
    case 0x3B: return one('DEC SP');
    case 0x3C: return one('INC A');
    case 0x3D: return one('DEC A');
    case 0x3E: return two(`LD A,0x${hex(b1)}`);
    case 0x3F: return one('CCF');
    case 0x76: return one('HALT');
    case 0x80: return one('ADD A,B');
    case 0x81: return one('ADD A,C');
    case 0x82: return one('ADD A,D');
    case 0x83: return one('ADD A,E');
    case 0x84: return one('ADD A,H');
    case 0x85: return one('ADD A,L');
    case 0x86: return one('ADD A,(HL)');
    case 0x87: return one('ADD A,A');
    case 0x88: return one('ADC A,B');
    case 0x89: return one('ADC A,C');
    case 0x8A: return one('ADC A,D');
    case 0x8B: return one('ADC A,E');
    case 0x8C: return one('ADC A,H');
    case 0x8D: return one('ADC A,L');
    case 0x8E: return one('ADC A,(HL)');
    case 0x8F: return one('ADC A,A');
    case 0x90: return one('SUB B');
    case 0x91: return one('SUB C');
    case 0x92: return one('SUB D');
    case 0x93: return one('SUB E');
    case 0x94: return one('SUB H');
    case 0x95: return one('SUB L');
    case 0x96: return one('SUB (HL)');
    case 0x97: return one('SUB A');
    case 0x98: return one('SBC A,B');
    case 0x99: return one('SBC A,C');
    case 0x9A: return one('SBC A,D');
    case 0x9B: return one('SBC A,E');
    case 0x9C: return one('SBC A,H');
    case 0x9D: return one('SBC A,L');
    case 0x9E: return one('SBC A,(HL)');
    case 0x9F: return one('SBC A,A');
    case 0xA0: return one('AND B');
    case 0xA1: return one('AND C');
    case 0xA2: return one('AND D');
    case 0xA3: return one('AND E');
    case 0xA4: return one('AND H');
    case 0xA5: return one('AND L');
    case 0xA6: return one('AND (HL)');
    case 0xA7: return one('AND A');
    case 0xA8: return one('XOR B');
    case 0xA9: return one('XOR C');
    case 0xAA: return one('XOR D');
    case 0xAB: return one('XOR E');
    case 0xAC: return one('XOR H');
    case 0xAD: return one('XOR L');
    case 0xAE: return one('XOR (HL)');
    case 0xAF: return one('XOR A');
    case 0xB0: return one('OR B');
    case 0xB1: return one('OR C');
    case 0xB2: return one('OR D');
    case 0xB3: return one('OR E');
    case 0xB4: return one('OR H');
    case 0xB5: return one('OR L');
    case 0xB6: return one('OR (HL)');
    case 0xB7: return one('OR A');
    case 0xB8: return one('CP B');
    case 0xB9: return one('CP C');
    case 0xBA: return one('CP D');
    case 0xBB: return one('CP E');
    case 0xBC: return one('CP H');
    case 0xBD: return one('CP L');
    case 0xBE: return one('CP (HL)');
    case 0xBF: return one('CP A');
    case 0xC0: return one('RET NZ');
    case 0xC1: return one('POP BC');
    case 0xC2: return four(`JP NZ,${addr(imm24())}`);
    case 0xC3: return four(`JP ${addr(imm24())}`, { type: 'jump', target: imm24() });
    case 0xC4: return four(`CALL NZ,${addr(imm24())}`);
    case 0xC5: return one('PUSH BC');
    case 0xC6: return two(`ADD A,0x${hex(b1)}`);
    case 0xC7: return one('RST 00h');
    case 0xC8: return one('RET Z');
    case 0xC9: return one('RET');
    case 0xCA: return four(`JP Z,${addr(imm24())}`);
    case 0xCC: return four(`CALL Z,${addr(imm24())}`);
    case 0xCD: return four(`CALL ${addr(imm24())}`, { type: 'call', target: imm24() });
    case 0xCE: return two(`ADC A,0x${hex(b1)}`);
    case 0xD0: return one('RET NC');
    case 0xD1: return one('POP DE');
    case 0xD2: return four(`JP NC,${addr(imm24())}`);
    case 0xD4: return four(`CALL NC,${addr(imm24())}`);
    case 0xD5: return one('PUSH DE');
    case 0xD6: return two(`SUB 0x${hex(b1)}`);
    case 0xD8: return one('RET C');
    case 0xD9: return one('EXX');
    case 0xDA: return four(`JP C,${addr(imm24())}`);
    case 0xDC: return four(`CALL C,${addr(imm24())}`);
    case 0xDE: return two(`SBC A,0x${hex(b1)}`);
    case 0xE1: return one('POP HL');
    case 0xE3: return one('EX (SP),HL');
    case 0xE5: return one('PUSH HL');
    case 0xE6: return two(`AND 0x${hex(b1)}`);
    case 0xE9: return one('JP (HL)');
    case 0xEB: return one('EX DE,HL');
    case 0xED:
      if (b1 === 0x4B) return five(`LD BC,(${ram(imm24ed())})`, { type: 'read', width: 'BC', target: imm24ed() });
      if (b1 === 0x5B) return five(`LD DE,(${ram(imm24ed())})`, { type: 'read', width: 'DE', target: imm24ed() });
      if (b1 === 0x6B) return five(`LD HL,(${ram(imm24ed())})`, { type: 'read', width: 'HL', target: imm24ed() });
      return two(`ED ${hex(b1)}`);
    case 0xEE: return two(`XOR 0x${hex(b1)}`);
    case 0xF1: return one('POP AF');
    case 0xF3: return one('DI');
    case 0xF5: return one('PUSH AF');
    case 0xF6: return two(`OR 0x${hex(b1)}`);
    case 0xF9: return one('LD SP,HL');
    case 0xFB: return one('EI');
    case 0xFD:
      if (b1 === 0xCB) {
        const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(IY+d)', 'A'];
        const op = b3;
        const bit = (op >> 3) & 7;
        const reg = regs[op & 7].replace('d', signedHex(b2));
        if (op < 0x40) return four(`${ops[op >> 3]} ${reg}`);
        if (op < 0x80) return four(`BIT ${bit},${reg}`);
        if (op < 0xC0) return four(`RES ${bit},${reg}`);
        return four(`SET ${bit},${reg}`);
      }
      return two(`FD ${hex(b1)}`);
    case 0xFE: return two(`CP 0x${hex(b1)}`);
    default:
      if (b >= 0x40 && b <= 0x7F) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        return one(`LD ${regs[(b >> 3) & 7]},${regs[b & 7]}`);
      }
      return one(`DB 0x${hex(b)}`);
  }
}

function signedHex(value) {
  return value < 0x80 ? `+0x${hex(value)}` : `-0x${hex(0x100 - value)}`;
}

function disassemble(start, endInclusive) {
  const out = [];
  let pc = start;
  while (pc <= endInclusive && pc < rom.length) {
    const ins = decodeAt(pc);
    out.push(ins);
    pc += ins.size;
  }
  return out;
}

function hexdump(start, endInclusive) {
  const lines = [];
  for (let pc = start; pc <= endInclusive; pc += 16) {
    const end = Math.min(endInclusive + 1, pc + 16);
    lines.push(`  ${addr(pc)}: ${bytesAt(pc, end - pc)}`);
  }
  return lines.join('\n');
}

function findCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const callers = [];
  for (let pc = 0; pc + 3 < rom.length; pc++) {
    if ((rom[pc] === 0xCD || rom[pc] === 0xC3) && rom[pc + 1] === lo && rom[pc + 2] === mid && rom[pc + 3] === hi) {
      callers.push({ pc, type: rom[pc] === 0xCD ? 'CALL' : 'JP' });
    }
  }
  return callers;
}

function collectRamRefs(instructions) {
  const refs = new Map();
  for (const ins of instructions) {
    if (!ins.ref || typeof ins.ref.target !== 'number') continue;
    if ((ins.ref.target & 0xFF0000) !== 0xD00000) continue;
    const key = ins.ref.target;
    if (!refs.has(key)) refs.set(key, []);
    refs.get(key).push(ins);
  }
  return refs;
}

function describeRam(addressValue) {
  return knownRam.get(addressValue) ?? 'new / unknown';
}

const functionStart = findFunctionStart(TARGET);
const functionEnd = findFunctionEnd(TARGET);
const instructions = disassemble(functionStart, functionEnd);
const callers = findCallers(functionStart);
const ramRefs = collectRamRefs(instructions);
const relationshipInstructions = disassemble(REL_START, REL_END);
const sameFunction = 0x06CBFA >= functionStart && 0x06CBFA <= functionEnd && TARGET >= functionStart && TARGET <= functionEnd;

console.log('=== CURSOR Y CONVERSION (0x06CBxx-0x06CCxx) ===');
console.log('');
console.log(`Function boundaries: ${addr(functionStart)} - ${addr(functionEnd)} (${functionEnd - functionStart + 1} bytes)`);
console.log('');
console.log('Hex dump:');
console.log(hexdump(functionStart, functionEnd));
console.log('');
console.log('Disassembly:');
for (const ins of instructions) {
  console.log(`  ${addr(ins.pc)}: ${ins.text}`);
}
console.log('');
console.log('RAM addresses referenced:');
if (ramRefs.size === 0) {
  console.log('  none');
} else {
  for (const [addressValue, refs] of [...ramRefs.entries()].sort((a, b) => a[0] - b[0])) {
    const points = refs.map(ins => `${ins.ref.type} ${ins.ref.width} at ${addr(ins.pc)}`).join(', ');
    console.log(`  ${ram(addressValue)}: ${points} (${describeRam(addressValue)})`);
  }
}
console.log('');
console.log(`Callers (${callers.length} total):`);
if (callers.length === 0) {
  console.log('  none found');
} else {
  for (const caller of callers) {
    console.log(`  ${addr(caller.pc)}: ${caller.type}`);
  }
}
console.log('');
console.log('0x06CBF0-0x06CC20 dump:');
console.log(hexdump(REL_START, REL_END));
console.log('');
console.log('0x06CBF0-0x06CC20 disassembly:');
for (const ins of relationshipInstructions) {
  console.log(`  ${addr(ins.pc)}: ${ins.text}`);
}
console.log('');
console.log(`Relationship: 0x06CBFA and 0x06CC02 are in ${sameFunction ? 'same' : 'different'} function(s)`);
