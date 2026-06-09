import fs from 'node:fs';
import path from 'node:path';

const romPath = 'TI-84_Plus_CE/ROM.rom';
const start = 0x092fb1;
const maxBytes = 200;

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer'],
  [0xd005f9, 'search key type byte'],
  [0xd008ee, 'dispatch selector for event helper'],
  [0xd01d0c, 'shared state variable'],
  [0xd008f0, 'pointer returned by 0x092F87'],
  [0xd02590, 'symbol table start'],
  [0xd0259d, 'symbol table pointer'],
]);

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const reg16 = ['BC', 'DE', 'HL', 'SP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

const calls = new Set();
const jumps = new Set();
const rsts = new Set();
const ramRefs = new Set();
const iyRefs = [];
const ports = new Set();
const boundaries = new Set([0x092fb1, 0x092fc1, 0x092fc7]);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function fmtAddr(value) {
  const label = ramNames.get(value);
  return `0x${hex(value, 6)}${label ? ` ; ${label}` : ''}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function fmtDisp(value) {
  const s = signed8(value);
  return s < 0 ? `-${hex(-s, 2)}` : `+${hex(s, 2)}`;
}

function read16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function read24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function relTarget(pc, len, disp) {
  return (pc + len + signed8(disp)) & 0xffffff;
}

function noteRam(value) {
  if ((value & 0xff0000) === 0xd00000) ramRefs.add(value);
}

function bytesText(bytes) {
  return bytes.map((b) => hex(b)).join(' ').padEnd(14, ' ');
}

function decodeCB(bytes, pc, ixy = null, disp = null) {
  const op = bytes[0];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const mem = ixy ? `(${ixy}${fmtDisp(disp)})` : reg8[z];
  const target = ixy && z !== 6 ? `${mem},${reg8[z]}` : mem;
  if (x === 0) return { len: 1, text: `${rot[y]} ${target}` };
  if (x === 1) return { len: 1, text: `BIT ${y},${mem}` };
  if (x === 2) return { len: 1, text: `RES ${y},${target}` };
  return { len: 1, text: `SET ${y},${target}` };
}

function decodeED(bytes, pc) {
  const op = bytes[1];
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (op >> 4) & 3;
  if (op === 0x44) return { len: 2, text: 'NEG' };
  if (op === 0x45) return { len: 2, text: 'RETN' };
  if (op === 0x4d) return { len: 2, text: 'RETI' };
  if (op === 0x47) return { len: 2, text: 'LD I,A' };
  if (op === 0x4f) return { len: 2, text: 'LD R,A' };
  if (op === 0x57) return { len: 2, text: 'LD A,I' };
  if (op === 0x5f) return { len: 2, text: 'LD A,R' };
  if (op >= 0x40 && op <= 0x7f) {
    if (z === 0) {
      const port = '(C)';
      ports.add(port);
      return { len: 2, text: y === 6 ? `IN ${port}` : `IN ${reg8[y]},${port}` };
    }
    if (z === 1) {
      const port = '(C)';
      ports.add(port);
      return { len: 2, text: y === 6 ? `OUT ${port},0` : `OUT ${port},${reg8[y]}` };
    }
    if (z === 2) return { len: 2, text: `${y & 1 ? 'ADC' : 'SBC'} HL,${reg16[p]}` };
    if (z === 3) {
      const addr = read24(bytes, 2);
      noteRam(addr);
      return { len: 5, text: y & 1 ? `LD ${reg16[p]},(${fmtAddr(addr)})` : `LD (${fmtAddr(addr)}),${reg16[p]}` };
    }
  }
  const block = new Map([
    [0xa0, 'LDI'], [0xa1, 'CPI'], [0xa2, 'INI'], [0xa3, 'OUTI'],
    [0xa8, 'LDD'], [0xa9, 'CPD'], [0xaa, 'IND'], [0xab, 'OUTD'],
    [0xb0, 'LDIR'], [0xb1, 'CPIR'], [0xb2, 'INIR'], [0xb3, 'OTIR'],
    [0xb8, 'LDDR'], [0xb9, 'CPDR'], [0xba, 'INDR'], [0xbb, 'OTDR'],
  ]);
  if (block.has(op)) return { len: 2, text: block.get(op) };
  return { len: 2, text: `DB ED,${hex(op)}` };
}

function decodeIndexed(bytes, pc, prefix) {
  const ix = prefix === 0xdd ? 'IX' : 'IY';
  const op = bytes[1];
  const hl = (s) => s.replaceAll('HL', ix).replaceAll('(HL)', `(${ix})`).replaceAll('H', `${ix}H`).replaceAll('L', `${ix}L`);
  if (op === 0xcb) {
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    const d = decodeCB(bytes.slice(3), pc, ix, disp);
    return { len: 4, text: d.text };
  }
  if (op === 0x21) return { len: 5, text: `LD ${ix},0x${hex(read24(bytes, 2), 6)}` };
  if (op === 0x22) {
    const addr = read24(bytes, 2);
    noteRam(addr);
    return { len: 5, text: `LD (${fmtAddr(addr)}),${ix}` };
  }
  if (op === 0x2a) {
    const addr = read24(bytes, 2);
    noteRam(addr);
    return { len: 5, text: `LD ${ix},(${fmtAddr(addr)})` };
  }
  if (op === 0x36) {
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    return { len: 4, text: `LD (${ix}${fmtDisp(disp)}),0x${hex(bytes[3])}` };
  }
  if ((op & 0xc7) === 0x46) {
    const r = (op >> 3) & 7;
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    return { len: 3, text: `LD ${reg8[r]},(${ix}${fmtDisp(disp)})` };
  }
  if ((op & 0xf8) === 0x70) {
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    return { len: 3, text: `LD (${ix}${fmtDisp(disp)}),${reg8[op & 7]}` };
  }
  if ([0x34, 0x35].includes(op)) {
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    return { len: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${ix}${fmtDisp(disp)})` };
  }
  if ((op & 0xc7) === 0x86) {
    const disp = bytes[2];
    iyRefs.push(`${ix}${fmtDisp(disp)} @ 0x${hex(pc, 6)}`);
    return { len: 3, text: `${alu[(op >> 3) & 7]} (${ix}${fmtDisp(disp)})` };
  }
  const d = decode(bytes.slice(1), pc + 1);
  return { len: d.len + 1, text: hl(d.text) };
}

function decode(bytes, pc) {
  const op = bytes[0];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xcb) {
    const d = decodeCB(bytes.slice(1), pc);
    return { len: d.len + 1, text: d.text };
  }
  if (op === 0xed) return decodeED(bytes, pc);
  if (op === 0xdd || op === 0xfd) return decodeIndexed(bytes, pc, op);
  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x10) {
    const target = relTarget(pc, 2, bytes[1]);
    jumps.add(target);
    return { len: 2, text: `DJNZ 0x${hex(target, 6)}` };
  }
  if (op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(pc, 2, bytes[1]);
    jumps.add(target);
    return { len: 2, text: op === 0x18 ? `JR 0x${hex(target, 6)}` : `JR ${cc[y - 4]},0x${hex(target, 6)}` };
  }
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op === 0xc3) {
    const target = read24(bytes, 1);
    jumps.add(target);
    return { len: 4, text: `JP 0x${hex(target, 6)}` };
  }
  if (op === 0xcd) {
    const target = read24(bytes, 1);
    calls.add(target);
    return { len: 4, text: `CALL 0x${hex(target, 6)}` };
  }
  if (op === 0xc9) return { len: 1, text: 'RET' };
  if (op === 0xd9) return { len: 1, text: 'EXX' };
  if (op === 0xe9) return { len: 1, text: 'JP (HL)' };
  if (op === 0xf3) return { len: 1, text: 'DI' };
  if (op === 0xfb) return { len: 1, text: 'EI' };
  if (op === 0xfe) return { len: 2, text: `CP 0x${hex(bytes[1])}` };
  if (op === 0xdb) {
    const port = `0x${hex(bytes[1])}`;
    ports.add(port);
    return { len: 2, text: `IN A,(${port})` };
  }
  if (op === 0xd3) {
    const port = `0x${hex(bytes[1])}`;
    ports.add(port);
    return { len: 2, text: `OUT (${port}),A` };
  }
  if ((op & 0xc7) === 0xc7) {
    const vector = op & 0x38;
    rsts.add(vector);
    return { len: 1, text: `RST 0x${hex(vector)}` };
  }
  if (x === 0) {
    if (z === 1) {
      if (q === 0) return { len: 4, text: `LD ${reg16[p]},0x${hex(read24(bytes, 1), 6)}` };
      return { len: 1, text: `ADD HL,${reg16[p]}` };
    }
    if (z === 2) {
      if (p === 0) return { len: 1, text: q ? 'LD A,(BC)' : 'LD (BC),A' };
      if (p === 1) return { len: 1, text: q ? 'LD A,(DE)' : 'LD (DE),A' };
      const addr = read24(bytes, 1);
      noteRam(addr);
      return { len: 4, text: q ? `LD HL,(${fmtAddr(addr)})` : `LD (${fmtAddr(addr)}),HL` };
    }
    if (z === 3) return { len: 1, text: `${q ? 'DEC' : 'INC'} ${reg16[p]}` };
    if (z === 4) return { len: 1, text: `INC ${reg8[y]}` };
    if (z === 5) return { len: 1, text: `DEC ${reg8[y]}` };
    if (z === 6) return { len: 2, text: `LD ${reg8[y]},0x${hex(bytes[1])}` };
    return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }
  if (x === 1) return { len: 1, text: `LD ${reg8[y]},${reg8[z]}` };
  if (x === 2) return { len: 1, text: `${alu[y]} ${reg8[z]}` };
  if (x === 3) {
    if (z === 0) return { len: 1, text: `RET ${cc[y]}` };
    if (z === 1) return { len: 1, text: q ? ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] : `POP ${['BC', 'DE', 'HL', 'AF'][p]}` };
    if (z === 2) {
      const target = read24(bytes, 1);
      jumps.add(target);
      return { len: 4, text: `JP ${cc[y]},0x${hex(target, 6)}` };
    }
    if (z === 3 && y === 4) return { len: 1, text: 'EX (SP),HL' };
    if (z === 4) {
      const target = read24(bytes, 1);
      calls.add(target);
      return { len: 4, text: `CALL ${cc[y]},0x${hex(target, 6)}` };
    }
    if (z === 5) return { len: q ? 4 : 1, text: q ? `CALL 0x${hex(read24(bytes, 1), 6)}` : `PUSH ${['BC', 'DE', 'HL', 'AF'][p]}` };
    if (z === 6) return { len: 2, text: `${alu[y]} 0x${hex(bytes[1])}` };
  }
  return { len: 1, text: `DB ${hex(op)}` };
}

const rom = fs.readFileSync(romPath);
const chunk = [...rom.subarray(start, start + maxBytes)];
const rows = [];
let offset = 0;

while (offset < chunk.length) {
  const pc = start + offset;
  const d = decode(chunk.slice(offset), pc);
  const len = Math.max(1, Math.min(d.len, chunk.length - offset));
  rows.push({ pc, bytes: chunk.slice(offset, offset + len), text: d.text });
  if (d.text === 'RET' || d.text.startsWith('JP ')) {
    const next = pc + len;
    if (next >= start && next < start + maxBytes) boundaries.add(next);
  }
  offset += len;
}

console.log('Phase 587 decode probe: 0x092FB1 through 0x092FC7 and beyond');
console.log(`ROM: ${romPath}`);
console.log(`Range: 0x${hex(start, 6)}..0x${hex(start + maxBytes - 1, 6)} (${maxBytes} bytes)`);
console.log('');
console.log('Disassembly');
for (const row of rows) {
  const marker = boundaries.has(row.pc) ? '*' : ' ';
  console.log(`${marker} 0x${hex(row.pc, 6)}  ${bytesText(row.bytes)} ${row.text}`);
}

console.log('');
console.log('Summary');
console.log('Function boundary candidates:');
for (const addr of [...boundaries].sort((a, b) => a - b)) {
  if (addr === 0x092fb1) console.log(`- 0x${hex(addr, 6)}: non-zero branch target from 0x092F95`);
  else if (addr === 0x092fc1) console.log(`- 0x${hex(addr, 6)}: zero branch target from 0x092F95`);
  else if (addr === 0x092fc7) console.log(`- 0x${hex(addr, 6)}: helper called by 0x092F87 with A=(D01D0C)+1`);
  else console.log(`- 0x${hex(addr, 6)}: inferred boundary after terminal control flow`);
}
console.log('');
console.log('Purpose hypothesis:');
console.log('- This region appears to normalize or dispatch event-helper state around D01D0C/D008EE, with 0x092FC7 acting as the helper entered with an incremented state byte from 0x092F87.');
console.log('- 0x092FB1 and 0x092FC1 are listed separately because 0x092F95 branches into this same local cluster for non-zero and zero state paths.');
console.log('');
console.log(`CALL targets: ${calls.size ? [...calls].sort((a, b) => a - b).map((v) => `0x${hex(v, 6)}`).join(', ') : '(none found)'}`);
console.log(`JP/JR targets: ${jumps.size ? [...jumps].sort((a, b) => a - b).map((v) => `0x${hex(v, 6)}`).join(', ') : '(none found)'}`);
console.log(`RST vectors: ${rsts.size ? [...rsts].sort((a, b) => a - b).map((v) => `0x${hex(v)}`).join(', ') : '(none found)'}`);
console.log(`RAM refs: ${ramRefs.size ? [...ramRefs].sort((a, b) => a - b).map((v) => fmtAddr(v)).join(', ') : '(none found)'}`);
console.log(`IY/IX refs: ${iyRefs.length ? iyRefs.join(', ') : '(none found)'}`);
console.log(`Port I/O: ${ports.size ? [...ports].sort().join(', ') : '(none found)'}`);

process.exit(0);
