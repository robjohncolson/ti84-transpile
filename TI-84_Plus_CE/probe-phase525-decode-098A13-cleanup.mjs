import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_BASE = 0x000000;
const START = 0x098a13;
const MAIN_LIMIT = 0x400;
const SUB_LIMIT = 0x80;
const RAM_BASE = 0xd00000;
const KNOWN = new Map([
  [0x07f978, 'fpCopy11'],
  [0x098a3d, 'frameOffsetCalculator'],
  [0x0989e9, 'saveOp1Op2ToFrame'],
  [0x09953f, 'conditionalTest'],
  [0x099574, 'successCleanupPrelude'],
]);

const rom = fs.readFileSync(ROM_PATH);

const state = {
  calls: new Map(),
  jumps: new Map(),
  ramReads: [],
  ramWrites: [],
  flagOps: [],
  ixOps: [],
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function signed24(value) {
  return value & 0x800000 ? value - 0x1000000 : value;
}

function byteAt(addr) {
  const off = addr - ROM_BASE;
  return off >= 0 && off < rom.length ? rom[off] : 0;
}

function wordAt(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8);
}

function longAt(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function bytesAt(addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(byteAt(addr + i).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function record(map, target, at) {
  if (!map.has(target)) map.set(target, []);
  map.get(target).push(at);
}

function recordRam(kind, addr, at, text) {
  if (addr < RAM_BASE) return;
  const row = { at, addr, text };
  if (kind === 'read') state.ramReads.push(row);
  else state.ramWrites.push(row);
}

function dispText(d) {
  return d < 0 ? `-${hex(-d, 2)}` : `+${hex(d, 2)}`;
}

function imm24Text(addr) {
  const name = KNOWN.get(addr);
  return name ? `${hex(addr)} <${name}>` : hex(addr);
}

function decodeCb(addr, prefix, ixiy) {
  let p = prefix;
  let len = 2;
  let disp = null;
  if (ixiy) {
    disp = signed8(byteAt(addr + 2));
    p = byteAt(addr + 3);
    len = 4;
  }
  const regs = ixiy
    ? ['B', 'C', 'D', 'E', 'H', 'L', `(${ixiy}${dispText(disp)})`, 'A']
    : ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const r = p & 7;
  const y = (p >> 3) & 7;
  const x = p >> 6;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { len, text: `${rot[y]} ${regs[r]}` };
  if (x === 1) return { len, text: `BIT ${y},${regs[r]}`, flag: 'Z affected by BIT' };
  if (x === 2) return { len, text: `RES ${y},${regs[r]}` };
  return { len, text: `SET ${y},${regs[r]}` };
}

function decodeEd(addr) {
  const op = byteAt(addr + 1);
  const imm24 = longAt(addr + 2);
  const imm16 = wordAt(addr + 2);
  const table = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'], [0x4D, 'RETI'],
    [0x56, 'IM 1'], [0x5E, 'IM 2'], [0x57, 'LD A,I'], [0x5F, 'LD A,R'],
    [0x67, 'RRD'], [0x6F, 'RLD'], [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'], [0xB0, 'LDIR'], [0xB1, 'CPIR'],
    [0xB2, 'INIR'], [0xB3, 'OTIR'], [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (table.has(op)) {
    const text = table.get(op);
    return { len: 2, text, flag: /CP|NEG|RRD|RLD/.test(text) ? 'carry/zero affected' : null };
  }
  if ((op & 0xc7) === 0x43) {
    const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    const text = `LD (${hex(imm24)}),${rp}`;
    return { len: 5, text, ramWrite: imm24 };
  }
  if ((op & 0xc7) === 0x4b) {
    const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    const text = `LD ${rp},(${hex(imm24)})`;
    return { len: 5, text, ramRead: imm24 };
  }
  if ((op & 0xc7) === 0x42) return { len: 2, text: `SBC HL,${['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3]}`, flag: 'carry/zero affected' };
  if ((op & 0xc7) === 0x4a) return { len: 2, text: `ADC HL,${['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3]}`, flag: 'carry/zero affected' };
  if ((op & 0xc7) === 0x40) return { len: 2, text: `IN ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7]},(C)`, flag: 'zero affected' };
  if ((op & 0xc7) === 0x41) return { len: 2, text: `OUT (C),${['B', 'C', 'D', 'E', 'H', 'L', '0', 'A'][(op >> 3) & 7]}` };
  if (op === 0x7b) return { len: 5, text: `LD SP,(${hex(imm24)})`, ramRead: imm24 };
  if (op === 0x73) return { len: 5, text: `LD (${hex(imm24)}),SP`, ramWrite: imm24 };
  if (op === 0x32) return { len: 5, text: `LEA HL,IX${dispText(signed8(byteAt(addr + 2)))}` };
  return { len: 2, text: `ED ${op.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decodeIndexed(addr, ixiy) {
  const op = byteAt(addr + 1);
  const reg = ixiy;
  const hi = ixiy === 'IX' ? 'IXH' : 'IYH';
  const lo = ixiy === 'IX' ? 'IXL' : 'IYL';
  const regs = ['B', 'C', 'D', 'E', hi, lo, null, 'A'];
  const rr = ['BC', 'DE', reg, 'SP'];
  if (op === 0xcb) return decodeCb(addr, op, reg);
  if (op === 0xe5) return { len: 2, text: `PUSH ${reg}`, ixop: true };
  if (op === 0xe1) return { len: 2, text: `POP ${reg}`, ixop: true };
  if (op === 0xe9) return { len: 2, text: `JP (${reg})`, ixop: true };
  if (op === 0xf9) return { len: 2, text: `LD SP,${reg}`, ixop: true };
  if (op === 0x21) return { len: 5, text: `LD ${reg},${hex(longAt(addr + 2))}`, ixop: true };
  if (op === 0x22) return { len: 5, text: `LD (${hex(longAt(addr + 2))}),${reg}`, ramWrite: longAt(addr + 2), ixop: true };
  if (op === 0x2a) return { len: 5, text: `LD ${reg},(${hex(longAt(addr + 2))})`, ramRead: longAt(addr + 2), ixop: true };
  if (op === 0x23) return { len: 2, text: `INC ${reg}`, ixop: true };
  if (op === 0x2b) return { len: 2, text: `DEC ${reg}`, ixop: true };
  if (op === 0x34 || op === 0x35) return { len: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${reg}${dispText(signed8(byteAt(addr + 2)))})`, flag: 'zero affected', ixop: true };
  if (op === 0x36) return { len: 4, text: `LD (${reg}${dispText(signed8(byteAt(addr + 2)))}),${hex(byteAt(addr + 3), 2)}`, ixop: true };
  if ((op & 0xc7) === 0x04 && regs[(op >> 3) & 7]) return { len: 2, text: `INC ${regs[(op >> 3) & 7]}`, flag: 'zero affected', ixop: true };
  if ((op & 0xc7) === 0x05 && regs[(op >> 3) & 7]) return { len: 2, text: `DEC ${regs[(op >> 3) & 7]}`, flag: 'zero affected', ixop: true };
  if ((op & 0xcf) === 0x09) return { len: 2, text: `ADD ${reg},${rr[(op >> 4) & 3]}`, ixop: true };
  if ((op & 0xc0) === 0x40) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    if (dst === 6) return { len: 3, text: `LD (${reg}${dispText(signed8(byteAt(addr + 2)))}),${regs[src]}`, ixop: true };
    if (src === 6) return { len: 3, text: `LD ${regs[dst]},(${reg}${dispText(signed8(byteAt(addr + 2)))})`, ixop: true };
    if (regs[dst] && regs[src]) return { len: 2, text: `LD ${regs[dst]},${regs[src]}`, ixop: true };
  }
  if ((op & 0xf8) === 0x70) return { len: 3, text: `LD (${reg}${dispText(signed8(byteAt(addr + 2)))}),${regs[op & 7]}`, ixop: true };
  if ((op & 0xc7) === 0x46) return { len: 3, text: `LD ${regs[(op >> 3) & 7]},(${reg}${dispText(signed8(byteAt(addr + 2)))})`, ixop: true };
  if ((op & 0xc7) === 0x86) return { len: 3, text: `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} (${reg}${dispText(signed8(byteAt(addr + 2)))})`, flag: 'carry/zero affected', ixop: true };
  if ((op & 0xc7) === 0x06 && regs[(op >> 3) & 7]) return { len: 3, text: `LD ${regs[(op >> 3) & 7]},${hex(byteAt(addr + 2), 2)}`, ixop: true };
  return { len: 2, text: `${reg} prefix ${hex(op, 2)}`, ixop: true };
}

function decode(addr) {
  const op = byteAt(addr);
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  if (op === 0xdd) return decodeIndexed(addr, 'IX');
  if (op === 0xfd) return decodeIndexed(addr, 'IY');
  if (op === 0xcb) return decodeCb(addr, op, null);
  if (op === 0xed) return decodeEd(addr);
  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op === 0xc9) return { len: 1, text: 'RET' };
  if (op === 0xd9) return { len: 1, text: 'EXX' };
  if (op === 0x08) return { len: 1, text: 'EX AF,AF\'' };
  if (op === 0x27) return { len: 1, text: 'DAA', flag: 'carry/zero affected' };
  if (op === 0x2f) return { len: 1, text: 'CPL' };
  if (op === 0x37) return { len: 1, text: 'SCF', flag: 'carry set' };
  if (op === 0x3f) return { len: 1, text: 'CCF', flag: 'carry complemented' };
  if (op === 0xf3) return { len: 1, text: 'DI' };
  if (op === 0xfb) return { len: 1, text: 'EI' };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}`, flag: 'zero affected' };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}`, flag: 'zero affected' };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hex(byteAt(addr + 1), 2)}` };
  if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(longAt(addr + 1))}` };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc5) return { len: 1, text: `PUSH ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc1) return { len: 1, text: `POP ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}` };
  if ((op & 0xc0) === 0x40) return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if ((op & 0xc0) === 0x80) return { len: 1, text: `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} ${r[op & 7]}`, flag: 'carry/zero affected' };
  if ((op & 0xc7) === 0xc0) return { len: 1, text: `RET ${cc[(op >> 3) & 7]}`, flag: `${cc[(op >> 3) & 7]} tested` };
  if ((op & 0xc7) === 0xc2) return { len: 4, text: `JP ${cc[(op >> 3) & 7]},${imm24Text(longAt(addr + 1))}`, jump: longAt(addr + 1), flag: `${cc[(op >> 3) & 7]} tested` };
  if ((op & 0xc7) === 0xc4) return { len: 4, text: `CALL ${cc[(op >> 3) & 7]},${imm24Text(longAt(addr + 1))}`, call: longAt(addr + 1), flag: `${cc[(op >> 3) & 7]} tested` };
  if ((op & 0xc7) === 0xc6) return { len: 2, text: `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} ${hex(byteAt(addr + 1), 2)}`, flag: 'carry/zero affected' };
  if ((op & 0xc7) === 0xc7) return { len: 1, text: `RST ${hex(op & 0x38, 2)}`, call: op & 0x38 };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, jump: addr + 2 + signed8(byteAt(addr + 1)), flag: 'zero affected' };
  if ((op & 0xe7) === 0x20) return { len: 2, text: `JR ${cc[(op >> 3) & 3]},${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, jump: addr + 2 + signed8(byteAt(addr + 1)), flag: `${cc[(op >> 3) & 3]} tested` };
  if (op === 0x18) return { len: 2, text: `JR ${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, jump: addr + 2 + signed8(byteAt(addr + 1)) };
  if (op === 0xc3) return { len: 4, text: `JP ${imm24Text(longAt(addr + 1))}`, jump: longAt(addr + 1) };
  if (op === 0xcd) return { len: 4, text: `CALL ${imm24Text(longAt(addr + 1))}`, call: longAt(addr + 1) };
  if (op === 0xc2 || op === 0xca || op === 0xd2 || op === 0xda) return { len: 4, text: `JP ${cc[(op >> 3) & 7]},${imm24Text(longAt(addr + 1))}`, jump: longAt(addr + 1), flag: `${cc[(op >> 3) & 7]} tested` };
  if (op === 0x22) return { len: 4, text: `LD (${hex(longAt(addr + 1))}),HL`, ramWrite: longAt(addr + 1) };
  if (op === 0x2a) return { len: 4, text: `LD HL,(${hex(longAt(addr + 1))})`, ramRead: longAt(addr + 1) };
  if (op === 0x32) return { len: 4, text: `LD (${hex(longAt(addr + 1))}),A`, ramWrite: longAt(addr + 1) };
  if (op === 0x3a) return { len: 4, text: `LD A,(${hex(longAt(addr + 1))})`, ramRead: longAt(addr + 1) };
  if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (op === 0x0a) return { len: 1, text: 'LD A,(BC)' };
  if (op === 0x12) return { len: 1, text: 'LD (DE),A' };
  if (op === 0x1a) return { len: 1, text: 'LD A,(DE)' };
  if (op === 0xe3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xeb) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xe9) return { len: 1, text: 'JP (HL)' };
  if (op === 0xf9) return { len: 1, text: 'LD SP,HL' };
  if (op === 0xe6 || op === 0xee || op === 0xf6 || op === 0xfe) return { len: 2, text: `${{ 0xe6: 'AND', 0xee: 'XOR', 0xf6: 'OR', 0xfe: 'CP' }[op]} ${hex(byteAt(addr + 1), 2)}`, flag: 'carry/zero affected' };
  if (op === 0x07 || op === 0x0f || op === 0x17 || op === 0x1f) return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA'][(op >> 3) & 3], flag: 'carry affected' };
  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function disassemble(start, limit, label) {
  console.log(`\n=== ${label}: ${hex(start)} .. ${hex(start + limit)} ===`);
  const end = Math.min(start + limit, rom.length);
  for (let pc = start; pc < end;) {
    const ins = decode(pc);
    const bytes = bytesAt(pc, ins.len).padEnd(15, ' ');
    console.log(`${hex(pc)}  ${bytes}  ${ins.text}`);
    if (ins.call != null) record(state.calls, ins.call, pc);
    if (ins.jump != null) record(state.jumps, ins.jump, pc);
    if (ins.ramRead != null) recordRam('read', ins.ramRead, pc, ins.text);
    if (ins.ramWrite != null) recordRam('write', ins.ramWrite, pc, ins.text);
    if (ins.flag) state.flagOps.push({ at: pc, op: ins.text, note: ins.flag });
    if (ins.ixop || /\bI[XY]\b|I[XY][HL]|\(I[XY][+-]/.test(ins.text)) state.ixOps.push({ at: pc, op: ins.text });
    pc += Math.max(ins.len, 1);
  }
}

function dumpMap(title, map) {
  console.log(`\n${title}:`);
  if (!map.size) {
    console.log('  none');
    return;
  }
  for (const [target, sites] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    const name = KNOWN.get(target) ? ` <${KNOWN.get(target)}>` : '';
    console.log(`  ${hex(target)}${name} from ${sites.map((x) => hex(x)).join(', ')}`);
  }
}

function dumpRows(title, rows) {
  console.log(`\n${title}:`);
  if (!rows.length) {
    console.log('  none');
    return;
  }
  for (const row of rows) console.log(`  ${hex(row.at)} ${row.addr != null ? `${hex(row.addr)} ` : ''}${row.op ?? row.text}${row.note ? ` (${row.note})` : ''}`);
}

console.log('Phase 525: decode 0x098A13 cleanup/teardown candidate');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Size: ${rom.length} bytes`);

disassemble(START, MAIN_LIMIT, 'main cleanup function');

const subTargets = [...state.calls.keys()]
  .filter((target) => target >= 0 && target < rom.length && target !== START)
  .sort((a, b) => a - b);
for (const target of subTargets) disassemble(target, SUB_LIMIT, `sub-call ${imm24Text(target)}`);

dumpMap('CALL targets', state.calls);
dumpMap('JP/JR targets', state.jumps);
dumpRows('RAM reads >= 0xD00000', state.ramReads);
dumpRows('RAM writes >= 0xD00000', state.ramWrites);
dumpRows('Carry/zero operations', state.flagOps);
dumpRows('IX/IY-relative and frame operations', state.ixOps);

console.log('\nCleanup hints:');
console.log(`  FP copy calls: ${[...state.calls.keys()].filter((x) => x === 0x07f978).length}`);
console.log(`  frame offset calculator calls: ${[...state.calls.keys()].filter((x) => x === 0x098a3d).length}`);
console.log(`  stack/frame ops mentioning IX/IY/SP: ${state.ixOps.filter((x) => /\bSP\b|\bI[XY]\b|I[XY][HL]|\(I[XY][+-]/.test(x.op)).length}`);
