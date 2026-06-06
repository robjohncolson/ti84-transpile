// Phase 537: Decode 0x07F8B6 - tail-jump target from 0x07DD82
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const startAddr = 0x07F8B6;
const bytes = rom.slice(startAddr, startAddr + 80);

console.log('=== Raw bytes at 0x07F8B6 ===');
for (let i = 0; i < bytes.length; i += 16) {
  const addr = startAddr + i;
  const hex = Array.from(bytes.slice(i, i + 16), b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hex}`);
}

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rst = ['00h', '08h', '10h', '18h', '20h', '28h', '30h', '38h'];

function hex8(n) {
  return `0x${n.toString(16).padStart(2, '0').toUpperCase()}`;
}

function hex24(n) {
  return `0x${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

function s8(n) {
  return n < 0x80 ? n : n - 0x100;
}

function u16(buf, i) {
  return buf[i] | (buf[i + 1] << 8);
}

function u24(buf, i) {
  return buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
}

function fmtBytes(buf, pc, len) {
  return Array.from(buf.slice(pc, pc + len), b => b.toString(16).padStart(2, '0')).join(' ');
}

function relTarget(addr, len, displacement) {
  return (addr + len + s8(displacement)) & 0xFFFFFF;
}

function decodeCb(buf, pc) {
  const op = buf[pc + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const group = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { len: 2, text: `${group[y]} ${reg8[z]}` };
  if (x === 1) return { len: 2, text: `BIT ${y},${reg8[z]}` };
  if (x === 2) return { len: 2, text: `RES ${y},${reg8[z]}` };
  return { len: 2, text: `SET ${y},${reg8[z]}` };
}

function decodeEd(buf, pc) {
  const op = buf[pc + 1];
  const known = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4D: 'RETI',
    0x4F: 'LD R,A',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5E: 'IM 2',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA2: 'INI',
    0xA3: 'OUTI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xAA: 'IND',
    0xAB: 'OUTD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB2: 'INIR',
    0xB3: 'OTIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
    0xBA: 'INDR',
    0xBB: 'OTDR',
  };
  if ((op & 0xC7) === 0x40) return { len: 2, text: `IN ${reg8[(op >> 3) & 7]},(C)` };
  if ((op & 0xC7) === 0x41) return { len: 2, text: `OUT (C),${reg8[(op >> 3) & 7]}` };
  if ((op & 0xCF) === 0x42) return { len: 2, text: `SBC HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x4A) return { len: 2, text: `ADC HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x43) return { len: 5, text: `LD (${hex24(u24(buf, pc + 2))}),${rp[(op >> 4) & 3]}`, refs: [u24(buf, pc + 2)] };
  if ((op & 0xCF) === 0x4B) return { len: 5, text: `LD ${rp[(op >> 4) & 3]},(${hex24(u24(buf, pc + 2))})`, refs: [u24(buf, pc + 2)] };
  return { len: 2, text: known[op] ?? `DB 0xED, ${hex8(op)}` };
}

function decode(buf, pc, addr) {
  const op = buf[pc];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xCB) return decodeCb(buf, pc);
  if (op === 0xED) return decodeEd(buf, pc);
  if (op === 0xDD || op === 0xFD) return { len: 1, text: `PREFIX ${hex8(op)} - decode manually if index registers are used` };

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, text: 'NOP' };
      if (y === 1) return { len: 5, text: `LD (${hex24(u24(buf, pc + 1))}),HL`, refs: [u24(buf, pc + 1)] };
      if (y === 2) return { len: 5, text: `LD HL,(${hex24(u24(buf, pc + 1))})`, refs: [u24(buf, pc + 1)] };
      if (y === 3) return { len: 2, text: `LD (${hex8(buf[pc + 1])}),A` };
      if (y === 4) return { len: 2, text: `JR ${hex24(relTarget(addr, 2, buf[pc + 1]))}`, target: relTarget(addr, 2, buf[pc + 1]), boundary: true };
      return { len: 2, text: `JR ${cond[y - 4]},${hex24(relTarget(addr, 2, buf[pc + 1]))}`, target: relTarget(addr, 2, buf[pc + 1]) };
    }
    if (z === 1) {
      if (q === 0) return { len: 3, text: `LD ${rp[p]},${hex24(u16(buf, pc + 1))}` };
      return { len: 1, text: `ADD HL,${rp[p]}` };
    }
    if (z === 2) {
      if (q === 0) return { len: 1, text: ['LD (BC),A', 'LD (DE),A', 'LD (HL+),A', 'LD (HL-),A'][p] };
      return { len: 1, text: ['LD A,(BC)', 'LD A,(DE)', 'LD A,(HL+)', 'LD A,(HL-)'][p] };
    }
    if (z === 3) return { len: 1, text: `${q ? 'DEC' : 'INC'} ${rp[p]}` };
    if (z === 4) return { len: 1, text: `INC ${reg8[y]}` };
    if (z === 5) return { len: 1, text: `DEC ${reg8[y]}` };
    if (z === 6) return { len: 2, text: `LD ${reg8[y]},${hex8(buf[pc + 1])}` };
    return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${reg8[y]},${reg8[z]}` };
  }

  if (x === 2) return { len: 1, text: `${alu[y]} ${reg8[z]}` };

  if (z === 0) return { len: 1, text: `RET ${cond[y]}`, boundary: false };
  if (z === 1) {
    if (q === 0) return { len: 1, text: `POP ${rp2[p]}` };
    if (p === 0) return { len: 1, text: 'RET', boundary: true };
    if (p === 1) return { len: 1, text: 'EXX' };
    if (p === 2) return { len: 4, text: `JP HL` };
    return { len: 1, text: 'LD SP,HL' };
  }
  if (z === 2) return { len: 4, text: `JP ${cond[y]},${hex24(u24(buf, pc + 1))}`, target: u24(buf, pc + 1) };
  if (z === 3) {
    if (y === 0) return { len: 4, text: `JP ${hex24(u24(buf, pc + 1))}`, target: u24(buf, pc + 1), boundary: true };
    if (y === 2) return { len: 2, text: `OUT (${hex8(buf[pc + 1])}),A` };
    if (y === 3) return { len: 2, text: `IN A,(${hex8(buf[pc + 1])})` };
    if (y === 4) return { len: 1, text: 'EX (SP),HL' };
    if (y === 5) return { len: 1, text: 'EX DE,HL' };
    if (y === 6) return { len: 1, text: 'DI' };
    if (y === 7) return { len: 1, text: 'EI' };
  }
  if (z === 4) return { len: 4, text: `CALL ${cond[y]},${hex24(u24(buf, pc + 1))}`, target: u24(buf, pc + 1), call: u24(buf, pc + 1) };
  if (z === 5) {
    if (q === 0) return { len: 1, text: `PUSH ${rp2[p]}` };
    if (p === 0) return { len: 4, text: `CALL ${hex24(u24(buf, pc + 1))}`, target: u24(buf, pc + 1), call: u24(buf, pc + 1) };
  }
  if (z === 6) return { len: 2, text: `${alu[y]} ${hex8(buf[pc + 1])}` };
  if (z === 7) return { len: 1, text: `RST ${rst[y]}`, call: y * 8 };

  return { len: 1, text: `DB ${hex8(op)}` };
}

console.log('\n=== Decoded instructions ===');
const instructions = [];
let pc = 0;
while (pc < bytes.length) {
  const addr = startAddr + pc;
  const ins = decode(bytes, pc, addr);
  const len = Math.min(ins.len, bytes.length - pc);
  instructions.push({ addr, len, ...ins });
  console.log(`  ${hex24(addr)}: ${fmtBytes(bytes, pc, len).padEnd(14)} ${ins.text}`);
  pc += len;
  if (ins.boundary) break;
}

console.log('\n=== Analysis ===');
const boundary = instructions.find(ins => ins.boundary);
const calls = instructions.filter(ins => ins.call !== undefined).map(ins => ins.call);
const refs = [...new Set(instructions.flatMap(ins => ins.refs ?? []))];
const dataRefs = refs.filter(ref => ref >= 0xD00000 || (ref >= 0xD005F8 && ref <= 0xD00639));
const opRefs = dataRefs.filter(ref => ref >= 0xD005F8 && ref <= 0xD00639);
const flagLike = instructions.filter(ins => /\b(CP|OR|AND|XOR|SCF|CCF|DAA)\b/.test(ins.text));
const memoryOps = instructions.filter(ins => /\(|\)/.test(ins.text));
const size = boundary ? boundary.addr + boundary.len - startAddr : instructions.reduce((sum, ins) => sum + ins.len, 0);

console.log(`Function starts at ${hex24(startAddr)} and decoded ${size} byte(s)${boundary ? ` through boundary instruction ${boundary.text} at ${hex24(boundary.addr)}` : ' without reaching a hard boundary in the 80-byte window'}.`);
console.log(`CALL targets: ${calls.length ? [...new Set(calls)].map(hex24).join(', ') : 'none in decoded function body'}.`);
console.log(`Absolute memory references: ${refs.length ? refs.map(hex24).join(', ') : 'none decoded'}.`);
console.log(`OP register references: ${opRefs.length ? opRefs.map(hex24).join(', ') : 'none decoded directly'}.`);
console.log(`Flag-affecting operations observed: ${flagLike.length ? flagLike.map(ins => `${hex24(ins.addr)} ${ins.text}`).join('; ') : 'none obvious'}.`);
console.log(`Memory/register-transfer operations observed: ${memoryOps.length ? memoryOps.map(ins => `${hex24(ins.addr)} ${ins.text}`).join('; ') : 'none obvious'}.`);

if (opRefs.length) {
  console.log('Purpose hypothesis: this routine directly manipulates OP-register memory and likely commits or normalizes the OP result after the 0x07F920 copy dispatch.');
} else if (memoryOps.length || calls.length) {
  console.log('Purpose hypothesis: this routine performs post-dispatch finalization through memory/register transfers and/or helper calls; inspect the listed references and call targets for type/descriptor commit behavior.');
} else {
  console.log('Purpose hypothesis: no direct OP memory reference was decoded in this window; the routine may be register-only finalization, a short flag/type adjustment, or a tail jump into another helper.');
}
