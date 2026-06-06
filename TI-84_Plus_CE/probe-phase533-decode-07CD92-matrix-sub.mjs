import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const entries = [
  { name: 'nearby matrix helper 0x07CD57', addr: 0x07cd57, minBytes: 80 },
  { name: 'nearby matrix helper 0x07CD7F', addr: 0x07cd7f, minBytes: 80 },
  { name: 'matrix computation sub-function 0x07CD92', addr: 0x07cd92, minBytes: 96 },
];

const targets = new Map();

function hx(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function word(off) {
  return rom[off] | (rom[off + 1] << 8);
}

function signed8(v) {
  return v & 0x80 ? v - 0x100 : v;
}

function relTarget(addr, size, disp) {
  return (addr + size + signed8(disp)) & 0xffffff;
}

function noteTarget(kind, from, target) {
  if (!targets.has(target)) targets.set(target, []);
  targets.get(target).push(`${kind} from ${hx(from, 6)}`);
}

function fmtBytes(addr, size) {
  return [...rom.subarray(addr, addr + size)].map((b) => hx(b)).join(' ');
}

function unknown(addr) {
  return { size: 1, text: `DB ${hx(rom[addr])}` };
}

function decodeCB(addr, prefixSize = 1, ixiy = '') {
  const op = rom[addr + prefixSize];
  const bit = (op >> 3) & 7;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const regName = ixiy && reg === '(HL)' ? `(${ixiy})` : reg;
  if (op < 0x40) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return { size: prefixSize + 1, text: `${ops[op >> 3]} ${regName}` };
  }
  if (op < 0x80) return { size: prefixSize + 1, text: `BIT ${bit},${regName}` };
  if (op < 0xc0) return { size: prefixSize + 1, text: `RES ${bit},${regName}` };
  return { size: prefixSize + 1, text: `SET ${bit},${regName}` };
}

function decodeED(addr) {
  const op = rom[addr + 1];
  const table = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'],
    [0x4d, 'RETI'], [0x4f, 'LD R,A'], [0x56, 'IM 1'], [0x5e, 'IM 2'],
    [0x57, 'LD A,I'], [0x5f, 'LD A,R'], [0x67, 'RRD'], [0x6f, 'RLD'],
    [0xa0, 'LDI'], [0xa1, 'CPI'], [0xa2, 'INI'], [0xa3, 'OUTI'],
    [0xa8, 'LDD'], [0xa9, 'CPD'], [0xaa, 'IND'], [0xab, 'OUTD'],
    [0xb0, 'LDIR'], [0xb1, 'CPIR'], [0xb2, 'INIR'], [0xb3, 'OTIR'],
    [0xb8, 'LDDR'], [0xb9, 'CPDR'], [0xba, 'INDR'], [0xbb, 'OTDR'],
  ]);
  if (table.has(op)) return { size: 2, text: table.get(op) };
  const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
  if ((op & 0xc7) === 0x40) return { size: 2, text: `IN ${r},(C)` };
  if ((op & 0xc7) === 0x41) return { size: 2, text: `OUT (C),${r}` };
  if ((op & 0xcf) === 0x42) return { size: 2, text: `SBC HL,${rp}` };
  if ((op & 0xcf) === 0x4a) return { size: 2, text: `ADC HL,${rp}` };
  if ((op & 0xcf) === 0x43) return { size: 4, text: `LD (${hx(word(addr + 2), 4)}),${rp}` };
  if ((op & 0xcf) === 0x4b) return { size: 4, text: `LD ${rp},(${hx(word(addr + 2), 4)})` };
  return { size: 2, text: `ED ${hx(op)}` };
}

function decode(addr) {
  const op = rom[addr];
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const rp2 = ['BC', 'DE', 'HL', 'AF'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const alu = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];

  if (op === 0xcb) return decodeCB(addr);
  if (op === 0xed) return decodeED(addr);
  if (op === 0xdd || op === 0xfd) return decodeIndex(addr, op === 0xdd ? 'IX' : 'IY');

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x08) return { size: 1, text: "EX AF,AF'" };
  if (op === 0x10) {
    const target = relTarget(addr, 2, rom[addr + 1]);
    noteTarget('DJNZ', addr, target);
    return { size: 2, text: `DJNZ ${hx(target, 6)}`, terminates: false };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(addr, 2, rom[addr + 1]);
    const cond = op === 0x18 ? '' : `${cc[(op - 0x20) >> 3]},`;
    noteTarget('JR', addr, target);
    return { size: 2, text: `JR ${cond}${hx(target, 6)}`, terminates: op === 0x18 };
  }
  if (op === 0x22) return { size: 4, text: `LD (${hx(addr24(addr + 1), 6)}),HL` };
  if (op === 0x2a) return { size: 4, text: `LD HL,(${hx(addr24(addr + 1), 6)})` };
  if (op === 0x32) return { size: 4, text: `LD (${hx(addr24(addr + 1), 6)}),A` };
  if (op === 0x3a) return { size: 4, text: `LD A,(${hx(addr24(addr + 1), 6)})` };
  if ((op & 0xcf) === 0x01) return { size: 4, text: `LD ${rp[op >> 4]},${hx(addr24(addr + 1), 6)}` };
  if ((op & 0xcf) === 0x03) return { size: 1, text: `INC ${rp[op >> 4]}` };
  if ((op & 0xcf) === 0x0b) return { size: 1, text: `DEC ${rp[op >> 4]}` };
  if ((op & 0xcf) === 0x09) return { size: 1, text: `ADD HL,${rp[op >> 4]}` };
  if ((op & 0xc7) === 0x04) return { size: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { size: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { size: 2, text: `LD ${r[(op >> 3) & 7]},${hx(rom[addr + 1])}` };
  if ((op & 0xc7) === 0x07) return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][op >> 3] };
  if (op >= 0x40 && op <= 0x7f) return { size: 1, text: op === 0x76 ? 'HALT' : `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if (op >= 0x80 && op <= 0xbf) return { size: 1, text: `${alu[(op >> 3) & 7]}${r[op & 7]}` };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0xc2) {
    const target = addr24(addr + 1);
    noteTarget('JP', addr, target);
    return { size: 4, text: `JP ${cc[(op >> 3) & 7]},${hx(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = addr24(addr + 1);
    noteTarget('CALL', addr, target);
    return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},${hx(target, 6)}` };
  }
  if ((op & 0xc7) === 0xc7) return { size: 1, text: `RST ${hx(op & 0x38)}` };
  if ((op & 0xcf) === 0xc1) return { size: 1, text: `POP ${rp2[op >> 4]}` };
  if ((op & 0xcf) === 0xc5) return { size: 1, text: `PUSH ${rp2[op >> 4]}` };
  if ([0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe].includes(op)) return { size: 2, text: `${alu[(op - 0xc6) >> 3]}${hx(rom[addr + 1])}` };
  if (op === 0xc3) {
    const target = addr24(addr + 1);
    noteTarget('JP', addr, target);
    return { size: 4, text: `JP ${hx(target, 6)}`, terminates: true };
  }
  if (op === 0xc9) return { size: 1, text: 'RET', terminates: true };
  if (op === 0xcd) {
    const target = addr24(addr + 1);
    noteTarget('CALL', addr, target);
    return { size: 4, text: `CALL ${hx(target, 6)}` };
  }
  if (op === 0xd3) return { size: 2, text: `OUT (${hx(rom[addr + 1])}),A` };
  if (op === 0xdb) return { size: 2, text: `IN A,(${hx(rom[addr + 1])})` };
  if (op === 0xe3) return { size: 1, text: 'EX (SP),HL' };
  if (op === 0xe9) return { size: 1, text: 'JP (HL)', terminates: true };
  if (op === 0xeb) return { size: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { size: 1, text: 'DI' };
  if (op === 0xf9) return { size: 1, text: 'LD SP,HL' };
  if (op === 0xfb) return { size: 1, text: 'EI' };
  return unknown(addr);
}

function decodeIndex(addr, idx) {
  const op = rom[addr + 1];
  const rp = ['BC', 'DE', idx, 'SP'];
  if (op === 0xcb) {
    const disp = rom[addr + 2];
    const cbop = rom[addr + 3];
    const bit = (cbop >> 3) & 7;
    const mem = `(${idx}${signed8(disp) < 0 ? '-' : '+'}${hx(Math.abs(signed8(disp)))})`;
    if (cbop < 0x40) return { size: 4, text: `DD/FD CB ${hx(disp)} ${hx(cbop)} ; indexed rotate/shift ${mem}` };
    if (cbop < 0x80) return { size: 4, text: `BIT ${bit},${mem}` };
    if (cbop < 0xc0) return { size: 4, text: `RES ${bit},${mem}` };
    return { size: 4, text: `SET ${bit},${mem}` };
  }
  if (op === 0x21) return { size: 4, text: `LD ${idx},${hx(addr24(addr + 2), 6)}` };
  if (op === 0x22) return { size: 4, text: `LD (${hx(addr24(addr + 2), 6)}),${idx}` };
  if (op === 0x2a) return { size: 4, text: `LD ${idx},(${hx(addr24(addr + 2), 6)})` };
  if (op === 0x23) return { size: 2, text: `INC ${idx}` };
  if (op === 0x2b) return { size: 2, text: `DEC ${idx}` };
  if ((op & 0xcf) === 0x09) return { size: 2, text: `ADD ${idx},${rp[op >> 4]}` };
  if (op === 0x34 || op === 0x35) return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${idx}${signed8(rom[addr + 2]) < 0 ? '-' : '+'}${hx(Math.abs(signed8(rom[addr + 2])))})` };
  if (op === 0x36) return { size: 4, text: `LD (${idx}${signed8(rom[addr + 2]) < 0 ? '-' : '+'}${hx(Math.abs(signed8(rom[addr + 2])))}),${hx(rom[addr + 3])}` };
  if (op === 0xe1) return { size: 2, text: `POP ${idx}` };
  if (op === 0xe3) return { size: 2, text: `EX (SP),${idx}` };
  if (op === 0xe5) return { size: 2, text: `PUSH ${idx}` };
  if (op === 0xe9) return { size: 2, text: `JP (${idx})`, terminates: true };
  if (op === 0xf9) return { size: 2, text: `LD SP,${idx}` };
  const base = decode(addr + 1);
  return { ...base, size: base.size + 1, text: base.text.replaceAll('HL', idx).replaceAll('(HL)', `(${idx})`) };
}

function disassemble(start, minBytes) {
  let pc = start;
  let consumed = 0;
  const lines = [];
  while (consumed < minBytes || lines.length === 0) {
    const inst = decode(pc);
    lines.push(`${hx(pc, 6)}  ${fmtBytes(pc, inst.size).padEnd(14)} ${inst.text}`);
    pc += inst.size;
    consumed += inst.size;
    if (inst.terminates && consumed >= minBytes) break;
    if (consumed > 256) break;
  }
  return lines;
}

console.log('Phase 533 decode: 0x07CD92 matrix computation sub-function cluster');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);

for (const entry of entries) {
  console.log('');
  console.log(`=== ${entry.name} ===`);
  for (const line of disassemble(entry.addr, entry.minBytes)) console.log(line);
}

console.log('');
console.log('=== CALL/JP/JR targets ===');
for (const [target, refs] of [...targets.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${hx(target, 6)}  ${refs.join('; ')}`);
}

