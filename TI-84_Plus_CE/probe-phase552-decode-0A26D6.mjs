import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A26D6;
const LENGTH = 160;

const rom = readFileSync(ROM_PATH);

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
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

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(addr, disp) {
  return (addr + 2 + s8(disp)) & 0xFFFFFF;
}

function bytesAt(addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(hex(b(addr + i), 2));
  return out.join(' ');
}

function annotate(text) {
  const notes = [];
  if (/\$?D008D5/i.test(text)) notes.push('y-position RAM');
  if (/\$?D005A0/i.test(text)) notes.push('saved y RAM');
  if (/\$?D1059C/i.test(text)) notes.push('saved x RAM');
  if (/\$?D025CE/i.test(text)) notes.push('base row height RAM');
  if (/\$?4008D2/i.test(text)) notes.push('SIS x-position RAM');
  if (/\b(240|0F0h|\$F0)\b/i.test(text)) notes.push('240px screen height constant');
  if (/\b(320|140h|\$140)\b/i.test(text)) notes.push('320px screen width constant');
  if (/CALL/i.test(text) && /\$0A/i.test(text)) notes.push('near ROM routine call');
  if (/JP|JR/i.test(text)) notes.push('control-flow');
  if (/CP\b|SBC\b|SUB\b/i.test(text)) notes.push('comparison/arithmetic');
  if (/LD \(\$D008D5\)|LD \(\$D005A0\)|LD \(\$D1059C\)|LD \(\$4008D2\)/i.test(text)) {
    notes.push('position write candidate');
  }
  return notes.length ? ` ; ${notes.join(', ')}` : '';
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

function ixDisp(prefix, addr) {
  const d = s8(b(addr));
  const sign = d < 0 ? '-' : '+';
  return `(${prefix}${sign}$${hex(Math.abs(d), 2)})`;
}

function decodeCB(addr, prefix = null) {
  const start = addr;
  let disp = null;
  if (prefix) {
    disp = b(addr);
    addr++;
  }
  const op = b(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix && z === 6 ? ixDisp(prefix, start) : r8[z];
  const baseLen = prefix ? 3 : 2;
  if (x === 0) return { len: baseLen, text: `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${target}` };
  if (x === 1) return { len: baseLen, text: `BIT ${y},${target}` };
  if (x === 2) return { len: baseLen, text: `RES ${y},${target}` };
  return { len: baseLen, text: `SET ${y},${target}` };
}

function decodeED(addr) {
  const op = b(addr + 1);
  const n16 = u16(addr + 2);
  const n24 = u24(addr + 2);
  const z = op & 7;
  const y = (op >> 3) & 7;
  const p = (op >> 4) & 3;

  if ((op & 0xC7) === 0x43) return { len: 5, text: `LD ($${hex(n24, 6)}),${rp[p]}` };
  if ((op & 0xC7) === 0x4B) return { len: 5, text: `LD ${rp[p]},($${hex(n24, 6)})` };
  if ((op & 0xC7) === 0x42) return { len: 2, text: `SBC HL,${rp[p]}` };
  if ((op & 0xC7) === 0x4A) return { len: 2, text: `ADC HL,${rp[p]}` };
  if ((op & 0xC7) === 0x44) return { len: 2, text: 'NEG' };
  if ((op & 0xC7) === 0x45) return { len: 2, text: op === 0x4D ? 'RETI' : 'RETN' };
  if ((op & 0xC7) === 0x46) return { len: 2, text: `IM ${[0, 0, 1, 2][y & 3]}` };
  if ((op & 0xC7) === 0x47) return { len: 2, text: ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R'][p] ?? `ED $${hex(op, 2)}` };

  const block = {
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  }[op];
  if (block) return { len: 2, text: block };

  if (op >= 0x40 && op <= 0x7F) {
    if (z === 0) return { len: 2, text: `IN ${r8[y]},(C)` };
    if (z === 1) return { len: 2, text: `OUT (C),${r8[y]}` };
  }

  if (op === 0x7B) return { len: 5, text: `LD SP,($${hex(n24, 6)})` };
  if (op === 0x73) return { len: 5, text: `LD ($${hex(n24, 6)}),SP` };
  return { len: 2, text: `ED $${hex(op, 2)} ; unhandled extended` };
}

function decodeIndexed(addr, prefix) {
  const ix = prefix === 0xDD ? 'IX' : 'IY';
  const op = b(addr + 1);

  if (op === 0xCB) return decodeCB(addr + 2, ix);
  if (op === 0x21) return { len: 5, text: `LD ${ix},$${hex(u24(addr + 2), 6)}` };
  if (op === 0x22) return { len: 5, text: `LD ($${hex(u24(addr + 2), 6)}),${ix}` };
  if (op === 0x2A) return { len: 5, text: `LD ${ix},($${hex(u24(addr + 2), 6)})` };
  if (op === 0x23) return { len: 2, text: `INC ${ix}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${ix}` };
  if (op === 0xE1) return { len: 2, text: `POP ${ix}` };
  if (op === 0xE3) return { len: 2, text: `EX (SP),${ix}` };
  if (op === 0xE5) return { len: 2, text: `PUSH ${ix}` };
  if (op === 0xE9) return { len: 2, text: `JP (${ix})` };
  if (op === 0xF9) return { len: 2, text: `LD SP,${ix}` };

  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (op >> 4) & 3;
  const q = (op >> 3) & 1;

  if ((op & 0xCF) === 0x09) return { len: 2, text: `ADD ${ix},${['BC', 'DE', ix, 'SP'][p]}` };
  if ((op & 0xC7) === 0x04 && y >= 4 && y <= 5) return { len: 2, text: `INC ${y === 4 ? `${ix}H` : `${ix}L`}` };
  if ((op & 0xC7) === 0x05 && y >= 4 && y <= 5) return { len: 2, text: `DEC ${y === 4 ? `${ix}H` : `${ix}L`}` };
  if ((op & 0xC7) === 0x06 && y >= 4 && y <= 5) return { len: 3, text: `LD ${y === 4 ? `${ix}H` : `${ix}L`},$${hex(b(addr + 2), 2)}` };

  if ((op & 0xC7) === 0x46) return { len: 3, text: `LD ${r8[y]},${ixDisp(ix, addr + 2)}` };
  if ((op & 0xF8) === 0x70) return { len: 3, text: `LD ${ixDisp(ix, addr + 2)},${r8[z]}` };
  if (op === 0x36) return { len: 4, text: `LD ${ixDisp(ix, addr + 2)},$${hex(b(addr + 3), 2)}` };
  if ((op & 0xC7) === 0x86) return { len: 3, text: `${alu[y]} ${ixDisp(ix, addr + 2)}` };
  if ((op & 0xC0) === 0x40) return { len: 2, text: `LD ${r8[y].replace('H', `${ix}H`).replace('L', `${ix}L`)},${r8[z].replace('H', `${ix}H`).replace('L', `${ix}L`)}` };

  if ((op & 0xCF) === 0x01) return { len: q ? 2 : 5, text: q ? `ADD ${ix},${['BC', 'DE', ix, 'SP'][p]}` : `LD ${['BC', 'DE', ix, 'SP'][p]},$${hex(u24(addr + 2), 6)}` };
  return { len: 2, text: `${ix} prefix $${hex(op, 2)} ; unhandled indexed` };
}

function decodeSIS(addr) {
  const next = b(addr + 1);
  const inner = decode(addr + 2);
  if (next === 0x52) {
    return {
      len: inner.len + 2,
      text: `SIS ${inner.text.replace(/\$([0-9A-F]{6})/g, (_, v) => `$${v.slice(2)}`)}`,
    };
  }
  return { len: 1, text: `LD B,B ; possible SIS prefix start, next=$${hex(next, 2)}` };
}

function decode(addr) {
  const op = b(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (op >> 4) & 3;
  const q = (op >> 3) & 1;

  if (op === 0x40 && b(addr + 1) === 0x52) return decodeSIS(addr);
  if (op === 0xCB) return decodeCB(addr + 1);
  if (op === 0xED) return decodeED(addr);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(addr, op);

  if (x === 0) {
    if (z === 0) {
      const table = [
        'NOP',
        `EX AF,AF'`,
        `DJNZ $${hex(relTarget(addr, b(addr + 1)), 6)}`,
        `JR $${hex(relTarget(addr, b(addr + 1)), 6)}`,
        `JR NZ,$${hex(relTarget(addr, b(addr + 1)), 6)}`,
        `JR Z,$${hex(relTarget(addr, b(addr + 1)), 6)}`,
        `JR NC,$${hex(relTarget(addr, b(addr + 1)), 6)}`,
        `JR C,$${hex(relTarget(addr, b(addr + 1)), 6)}`,
      ];
      return { len: y >= 2 ? 2 : 1, text: table[y] };
    }
    if (z === 1) return q ? { len: 1, text: `ADD HL,${rp[p]}` } : { len: 4, text: `LD ${rp[p]},$${hex(u24(addr + 1), 6)}` };
    if (z === 2) {
      const table = [
        `LD (BC),A`,
        `LD A,(BC)`,
        `LD ($${hex(u24(addr + 1), 6)}),HL`,
        `LD HL,($${hex(u24(addr + 1), 6)})`,
        `LD ($${hex(u24(addr + 1), 6)}),A`,
        `LD A,($${hex(u24(addr + 1), 6)})`,
      ];
      return { len: y >= 2 ? 4 : 1, text: table[y] ?? `LD/addr group $${hex(op, 2)}` };
    }
    if (z === 3) return { len: 1, text: `${q ? 'DEC' : 'INC'} ${rp[p]}` };
    if (z === 4) return { len: 1, text: `INC ${r8[y]}` };
    if (z === 5) return { len: 1, text: `DEC ${r8[y]}` };
    if (z === 6) return { len: 2, text: `LD ${r8[y]},$${hex(b(addr + 1), 2)}` };
    const misc = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
    return { len: 1, text: misc[y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${r8[y]},${r8[z]}` };
  }

  if (x === 2) return { len: 1, text: `${alu[y]} ${r8[z]}` };

  if (z === 0) return { len: 1, text: `RET ${cc[y]}` };
  if (z === 1) return q ? { len: 1, text: ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] } : { len: 1, text: `POP ${rp2[p]}` };
  if (z === 2) return { len: 4, text: `JP ${cc[y]},$${hex(u24(addr + 1), 6)}` };
  if (z === 3) {
    const table = {
      0: { len: 4, text: `JP $${hex(u24(addr + 1), 6)}` },
      2: { len: 2, text: `OUT ($${hex(b(addr + 1), 2)}),A` },
      3: { len: 2, text: `IN A,($${hex(b(addr + 1), 2)})` },
      4: { len: 1, text: 'EX (SP),HL' },
      5: { len: 1, text: 'EX DE,HL' },
      6: { len: 1, text: 'DI' },
      7: { len: 1, text: 'EI' },
    };
    return table[y] ?? { len: 1, text: `misc $${hex(op, 2)}` };
  }
  if (z === 4) return { len: 4, text: `CALL ${cc[y]},$${hex(u24(addr + 1), 6)}` };
  if (z === 5) return q ? { len: 4, text: `CALL $${hex(u24(addr + 1), 6)}` } : { len: 1, text: `PUSH ${rp2[p]}` };
  if (z === 6) return { len: 2, text: `${alu[y]} $${hex(b(addr + 1), 2)}` };
  return { len: 1, text: `RST $${hex(y * 8, 2)}` };
}

console.log(`Decode probe: line overflow / scroll handler at $${hex(START, 6)}`);
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: $${hex(START, 6)}-$${hex(START + LENGTH - 1, 6)} (${LENGTH} bytes)`);
console.log('');
console.log('Known RAM/address hints:');
console.log('  $D008D5 y-position, $D005A0 saved y, $D1059C saved x, $D025CE base row height');
console.log('  SIS $4008D2 x-position, screen height candidates: 240px / $F0');
console.log('');
console.log('Address   Bytes             Instruction / annotation');
console.log('--------  ----------------  ------------------------');

let pc = START;
const end = START + LENGTH;
while (pc < end) {
  const ins = decode(pc);
  const len = Math.max(1, Math.min(ins.len, end - pc));
  const text = ins.text;
  console.log(`${hex(pc, 6)}  ${bytesAt(pc, len).padEnd(16)}  ${text}${annotate(text)}`);
  pc += len;
}

console.log('');
console.log('Scan notes:');
for (let a = START; a < end - 2; a++) {
  const v = u24(a);
  if ([0xD008D5, 0xD005A0, 0xD1059C, 0xD025CE, 0x4008D2].includes(v)) {
    console.log(`  direct 24-bit reference $${hex(v, 6)} appears in raw bytes at $${hex(a, 6)}`);
  }
}
for (let a = START; a < end; a++) {
  const value = b(a);
  if (value === 0xF0) console.log(`  byte constant $F0 / 240 appears at $${hex(a, 6)}`);
  if (value === 0x14) console.log(`  byte constant $14 / 20 appears at $${hex(a, 6)} (possible row height)`);
  if (value === 0x0C) console.log(`  byte constant $0C / 12 appears at $${hex(a, 6)} (possible text row count/height)`);
}
