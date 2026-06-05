import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const IY_BASE = 0xd00080;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function romByte(addr) {
  return rom[addr & 0x3fffff] ?? 0;
}

function u16(addr) {
  return romByte(addr) | (romByte(addr + 1) << 8);
}

function u24(addr) {
  return romByte(addr) | (romByte(addr + 1) << 8) | (romByte(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, disp, size = 2) {
  return (pc + size + s8(disp)) & 0xffffff;
}

function iyAddr(disp) {
  return IY_BASE + s8(disp);
}

function fmtDisp(disp) {
  const signed = s8(disp);
  if (signed === 0) return '+0';
  return signed > 0 ? `+${signed}` : `${signed}`;
}

function bytesAt(pc, size) {
  return Array.from({ length: size }, (_, i) => hex8(romByte(pc + i)).slice(2)).join(' ');
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCb(pc) {
  const op = romByte(pc + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return { size: 2, text: `${rot[y]} ${r[z]}` };
  if (x === 1) return { size: 2, text: `BIT ${y},${r[z]}` };
  if (x === 2) return { size: 2, text: `RES ${y},${r[z]}` };
  return { size: 2, text: `SET ${y},${r[z]}` };
}

function decodeIndexedCb(pc, index) {
  const disp = romByte(pc + 2);
  const op = romByte(pc + 3);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const mem = `(${index}${fmtDisp(disp)})`;
  let text;
  if (x === 0) text = `${rot[y]} ${mem}${z === 6 ? '' : `,${r[z]}`}`;
  else if (x === 1) text = `BIT ${y},${mem}`;
  else if (x === 2) text = `RES ${y},${mem}${z === 6 ? '' : `,${r[z]}`}`;
  else text = `SET ${y},${mem}${z === 6 ? '' : `,${r[z]}`}`;
  return {
    size: 4,
    text,
    refs: [{ kind: 'iy', addr: index === 'IY' ? iyAddr(disp) : null, disp: s8(disp), op: text }],
  };
}

function decodeEd(pc) {
  const op = romByte(pc + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0x6c) return { size: 2, text: 'MLT HL' };
  if (op === 0x7c) return { size: 2, text: 'MLT SP' };
  if (op === 0x4c) return { size: 2, text: 'MLT BC' };
  if (op === 0x5c) return { size: 2, text: 'MLT DE' };
  if (op === 0x4d) return { size: 2, text: 'RETI' };
  if (op === 0x45) return { size: 2, text: 'RETN' };
  if (op === 0xb0) return { size: 2, text: 'LDIR' };
  if (op === 0xb8) return { size: 2, text: 'LDDR' };
  if (op === 0xa0) return { size: 2, text: 'LDI' };
  if (op === 0xa8) return { size: 2, text: 'LDD' };

  if (x === 1 && z === 0) return { size: 2, text: `IN ${r[y]},(C)` };
  if (x === 1 && z === 1) return { size: 2, text: `OUT (C),${r[y]}` };
  if (x === 1 && z === 2) return { size: 2, text: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
  if (x === 1 && z === 3) {
    const nn = u24(pc + 2);
    return {
      size: 5,
      text: q ? `LD ${rp[p]},(${hex(nn)})` : `LD (${hex(nn)}),${rp[p]}`,
      refs: [{ kind: q ? 'read' : 'write', addr: nn }],
    };
  }
  if (x === 1 && z === 4) return { size: 2, text: 'NEG' };
  if (x === 1 && z === 5) return { size: 2, text: y === 1 ? 'RETI' : 'RETN' };
  if (x === 1 && z === 6) return { size: 2, text: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
  if (x === 1 && z === 7) {
    return { size: 2, text: ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R', 'RRD', 'RLD', 'NOP', 'NOP'][y] };
  }
  return { size: 2, text: `ED ${hex8(op)}` };
}

function decodeIndexed(pc, index) {
  const prefix = romByte(pc);
  const op = romByte(pc + 1);
  const h = index === 'IX' ? 'IXH' : 'IYH';
  const l = index === 'IX' ? 'IXL' : 'IYL';
  const pair = index;
  const mapReg = (reg) => (reg === 'H' ? h : reg === 'L' ? l : reg === '(HL)' ? null : reg);

  if (op === 0xcb) return decodeIndexedCb(pc, index);
  if (op === 0x21) return { size: 5, text: `LD ${pair},${hex(u24(pc + 2))}` };
  if (op === 0x22) {
    const nn = u24(pc + 2);
    return { size: 5, text: `LD (${hex(nn)}),${pair}`, refs: [{ kind: 'write', addr: nn }] };
  }
  if (op === 0x2a) {
    const nn = u24(pc + 2);
    return { size: 5, text: `LD ${pair},(${hex(nn)})`, refs: [{ kind: 'read', addr: nn }] };
  }
  if (op === 0x23) return { size: 2, text: `INC ${pair}` };
  if (op === 0x2b) return { size: 2, text: `DEC ${pair}` };
  if (op === 0x34 || op === 0x35) return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${pair}${fmtDisp(romByte(pc + 2))})`, refs: [{ kind: 'iy', addr: prefix === 0xfd ? iyAddr(romByte(pc + 2)) : null, disp: s8(romByte(pc + 2)) }] };
  if (op === 0x36) return { size: 4, text: `LD (${pair}${fmtDisp(romByte(pc + 2))}),${hex8(romByte(pc + 3))}`, refs: [{ kind: 'iy', addr: prefix === 0xfd ? iyAddr(romByte(pc + 2)) : null, disp: s8(romByte(pc + 2)), kind2: 'write' }] };
  if ((op & 0xc7) === 0x46) {
    const y = (op >> 3) & 7;
    return { size: 3, text: `LD ${r[y]},(${pair}${fmtDisp(romByte(pc + 2))})`, refs: [{ kind: 'iy', addr: prefix === 0xfd ? iyAddr(romByte(pc + 2)) : null, disp: s8(romByte(pc + 2)), kind2: 'read' }] };
  }
  if ((op & 0xf8) === 0x70) {
    const z = op & 7;
    return { size: 3, text: `LD (${pair}${fmtDisp(romByte(pc + 2))}),${r[z]}`, refs: [{ kind: 'iy', addr: prefix === 0xfd ? iyAddr(romByte(pc + 2)) : null, disp: s8(romByte(pc + 2)), kind2: 'write' }] };
  }
  if ((op & 0xc0) === 0x40) {
    const y = (op >> 3) & 7;
    const z = op & 7;
    const yy = mapReg(r[y]);
    const zz = mapReg(r[z]);
    if (yy && zz) return { size: 2, text: `LD ${yy},${zz}` };
  }
  if ((op & 0xc7) === 0x86) {
    const y = (op >> 3) & 7;
    return { size: 3, text: `${alu[y]} (${pair}${fmtDisp(romByte(pc + 2))})`, refs: [{ kind: 'iy', addr: prefix === 0xfd ? iyAddr(romByte(pc + 2)) : null, disp: s8(romByte(pc + 2)), kind2: 'read' }] };
  }
  return { size: 2, text: `${index} prefix ${hex8(op)}` };
}

function decodeMain(pc) {
  const op = romByte(pc);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xcb) return decodeCb(pc);
  if (op === 0xed) return decodeEd(pc);
  if (op === 0xdd) return decodeIndexed(pc, 'IX');
  if (op === 0xfd) return decodeIndexed(pc, 'IY');

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x10) return { size: 2, text: `DJNZ ${hex(relTarget(pc, romByte(pc + 1)))}`, refs: [{ kind: 'branch', addr: relTarget(pc, romByte(pc + 1)) }] };
  if (op === 0x18) return { size: 2, text: `JR ${hex(relTarget(pc, romByte(pc + 1)))}`, refs: [{ kind: 'branch', addr: relTarget(pc, romByte(pc + 1)) }] };
  if ((op & 0xe7) === 0x20) return { size: 2, text: `JR ${cc[y - 4]},${hex(relTarget(pc, romByte(pc + 1)))}`, refs: [{ kind: 'branch', addr: relTarget(pc, romByte(pc + 1)) }] };
  if (op === 0xc3) return { size: 4, text: `JP ${hex(u24(pc + 1))}`, refs: [{ kind: 'jump', addr: u24(pc + 1) }] };
  if (op === 0xcd) return { size: 4, text: `CALL ${hex(u24(pc + 1))}`, refs: [{ kind: 'call', addr: u24(pc + 1) }] };
  if (op === 0xc9) return { size: 1, text: 'RET', terminates: true };
  if (op === 0xd9) return { size: 1, text: 'EXX' };
  if (op === 0xe3) return { size: 1, text: 'EX (SP),HL' };
  if (op === 0xeb) return { size: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { size: 1, text: 'DI' };
  if (op === 0xfb) return { size: 1, text: 'EI' };
  if (op === 0x08) return { size: 1, text: "EX AF,AF'" };
  if (op === 0x76) return { size: 1, text: 'HALT' };

  if (x === 0 && z === 1) return { size: q ? 1 : 4, text: q ? `ADD HL,${rp[p]}` : `LD ${rp[p]},${hex(u24(pc + 1))}` };
  if (x === 0 && z === 2) {
    if (q === 0) {
      const text = p === 0 ? 'LD (BC),A' : p === 1 ? 'LD (DE),A' : `LD (${hex(u24(pc + 1))}),HL`;
      return { size: p < 2 ? 1 : 4, text, refs: p < 2 ? [] : [{ kind: 'write', addr: u24(pc + 1) }] };
    }
    const text = p === 0 ? 'LD A,(BC)' : p === 1 ? 'LD A,(DE)' : `LD HL,(${hex(u24(pc + 1))})`;
    return { size: p < 2 ? 1 : 4, text, refs: p < 2 ? [] : [{ kind: 'read', addr: u24(pc + 1) }] };
  }
  if (x === 0 && z === 3) return { size: 1, text: `${q ? 'DEC' : 'INC'} ${rp[p]}` };
  if (x === 0 && z === 4) return { size: 1, text: `INC ${r[y]}` };
  if (x === 0 && z === 5) return { size: 1, text: `DEC ${r[y]}` };
  if (x === 0 && z === 6) return { size: 2, text: `LD ${r[y]},${hex8(romByte(pc + 1))}` };
  if (x === 0 && z === 7) return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };

  if (x === 1) return { size: 1, text: `LD ${r[y]},${r[z]}` };
  if (x === 2) return { size: 1, text: `${alu[y]} ${r[z]}` };

  if (x === 3 && z === 0) return { size: 1, text: `RET ${cc[y]}`, terminates: false };
  if (x === 3 && z === 1) return { size: 1, text: q ? ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] : `POP ${rp2[p]}`, terminates: q && p === 0 };
  if (x === 3 && z === 2) return { size: 4, text: `JP ${cc[y]},${hex(u24(pc + 1))}`, refs: [{ kind: 'jump', addr: u24(pc + 1) }] };
  if (x === 3 && z === 3) {
    const table = ['JP nn', 'CB prefix', 'OUT (n),A', 'IN A,(n)', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'];
    if (y === 0) return { size: 4, text: `JP ${hex(u24(pc + 1))}`, refs: [{ kind: 'jump', addr: u24(pc + 1) }] };
    if (y === 2) return { size: 2, text: `OUT (${hex8(romByte(pc + 1))}),A` };
    if (y === 3) return { size: 2, text: `IN A,(${hex8(romByte(pc + 1))})` };
    return { size: 1, text: table[y] };
  }
  if (x === 3 && z === 4) return { size: 4, text: `CALL ${cc[y]},${hex(u24(pc + 1))}`, refs: [{ kind: 'call', addr: u24(pc + 1) }] };
  if (x === 3 && z === 5) return { size: q ? 4 : 1, text: q ? `CALL ${hex(u24(pc + 1))}` : `PUSH ${rp2[p]}`, refs: q ? [{ kind: 'call', addr: u24(pc + 1) }] : [] };
  if (x === 3 && z === 6) return { size: 2, text: `${alu[y]} ${hex8(romByte(pc + 1))}` };
  if (x === 3 && z === 7) return { size: 1, text: `RST ${hex8(y * 8)}` };

  return { size: 1, text: `DB ${hex8(op)}` };
}

function disassemble(start, length, label) {
  const end = start + length;
  let pc = start;
  const rows = [];
  const refs = [];
  while (pc < end) {
    const decoded = decodeMain(pc);
    rows.push({ pc, ...decoded, bytes: bytesAt(pc, decoded.size) });
    if (decoded.refs) refs.push(...decoded.refs.map((ref) => ({ pc, text: decoded.text, ...ref })));
    pc += decoded.size || 1;
  }

  console.log(`\n=== ${label} ${hex(start)}..${hex(end - 1)} ===`);
  for (const row of rows) {
    const bytePad = row.bytes.padEnd(14, ' ');
    console.log(`${hex(row.pc)}  ${bytePad}  ${row.text}`);
  }
  return { rows, refs };
}

function summarizeRefs(blockName, refs) {
  const calls = refs.filter((ref) => ref.kind === 'call').map((ref) => ref.addr);
  const jumps = refs.filter((ref) => ref.kind === 'jump' || ref.kind === 'branch').map((ref) => ref.addr);
  const ram = refs.filter((ref) => ref.addr != null && ref.addr >= 0xd00000 && ref.addr <= 0xd3ffff);
  const iy = refs.filter((ref) => ref.kind === 'iy' && ref.addr != null);

  console.log(`\n--- ${blockName} references ---`);
  console.log(`CALLs: ${calls.length ? [...new Set(calls)].map((addr) => hex(addr)).join(', ') : '(none decoded)'}`);
  console.log(`Jumps/branches: ${jumps.length ? [...new Set(jumps)].map((addr) => hex(addr)).join(', ') : '(none decoded)'}`);
  console.log(`RAM direct refs: ${ram.length ? [...new Set(ram.map((ref) => ref.addr))].map((addr) => hex(addr)).join(', ') : '(none decoded)'}`);
  console.log(`IY flag/state refs: ${iy.length ? [...new Set(iy.map((ref) => `${hex(ref.addr)} (IY${ref.disp >= 0 ? '+' : ''}${ref.disp})`))].join(', ') : '(none decoded)'}`);
}

function classifyRoutine(name, rows, refs) {
  const calls = refs.filter((ref) => ref.kind === 'call').map((ref) => ref.addr);
  const directRam = refs.filter((ref) => ref.addr != null && ref.addr >= 0xd00000 && ref.addr <= 0xd3ffff).map((ref) => ref.addr);
  const iyRefs = refs.filter((ref) => ref.kind === 'iy' && ref.addr != null).map((ref) => ref.addr);
  const hasMlt = rows.some((row) => row.text === 'MLT HL' || row.text.startsWith('MLT '));
  const hasRet = rows.some((row) => row.text === 'RET');
  const bitOps = rows.filter((row) => /\b(BIT|SET|RES)\b/.test(row.text));
  const writes = refs.filter((ref) => ref.kind === 'write' || ref.kind2 === 'write').map((ref) => ref.addr).filter((addr) => addr != null);
  const reads = refs.filter((ref) => ref.kind === 'read' || ref.kind2 === 'read').map((ref) => ref.addr).filter((addr) => addr != null);

  console.log(`\n--- ${name} decoded purpose ---`);
  console.log(`Shape: ${rows.length} decoded instructions${hasRet ? ', returns in this window' : ''}${hasMlt ? ', uses eZ80 MLT' : ''}.`);
  console.log(`Reads: ${reads.length ? [...new Set(reads)].map((addr) => hex(addr)).join(', ') : '(no direct absolute/IY reads decoded)'}`);
  console.log(`Writes: ${writes.length ? [...new Set(writes)].map((addr) => hex(addr)).join(', ') : '(no direct absolute/IY writes decoded)'}`);
  console.log(`State/flag touches: ${iyRefs.length ? [...new Set(iyRefs)].map((addr) => hex(addr)).join(', ') : '(none decoded)'}`);
  console.log(`Nested calls: ${calls.length ? [...new Set(calls)].map((addr) => hex(addr)).join(', ') : '(none decoded)'}`);
  if (bitOps.length) console.log(`Bit operations: ${bitOps.map((row) => `${hex(row.pc)} ${row.text}`).join('; ')}`);

  if (directRam.length || iyRefs.length || calls.length || bitOps.length || hasMlt) {
    console.log('Purpose inference: see the instruction listing above; this routine participates in the composite refresh by updating display/cursor-related state through the listed RAM/state references and helper calls.');
  } else {
    console.log('Purpose inference: this window did not expose direct RAM/state references; inspect branch targets above if control leaves the linear range early.');
  }
}

console.log('Probe phase 521: decode composite refresh');
console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log('Static-only probe: dynamic execution skipped because static disassembly is sufficient and this task forbids dynamic execution unless needed.');

const composite = disassemble(0x09ceaf, 300, '0x09CEAF composite refresh');
const routine097ac8 = disassemble(0x097ac8, 300, '0x097AC8 unknown helper');
const routine0a1f80 = disassemble(0x0a1f80, 300, '0x0A1F80 unknown helper');

summarizeRefs('0x09CEAF composite refresh', composite.refs);
summarizeRefs('0x097AC8 helper', routine097ac8.refs);
summarizeRefs('0x0A1F80 helper', routine0a1f80.refs);

classifyRoutine('0x097AC8 helper', routine097ac8.rows, routine097ac8.refs);
classifyRoutine('0x0A1F80 helper', routine0a1f80.rows, routine0a1f80.refs);

const compositeCalls = composite.refs.filter((ref) => ref.kind === 'call').map((ref) => ref.addr);
console.log('\n=== Composite Refresh Summary ===');
console.log(`Observed CALL chain in 0x09CEAF window: ${compositeCalls.length ? compositeCalls.map((addr) => hex(addr)).join(' -> ') : '(no calls decoded)'}`);
console.log('Expected anchor calls: 0x09CE6B post-render cursor/column updater; 0x0A1F52 cursor/column updater; 0x097AC8 helper decoded above; 0x0A1F80 helper decoded above; 0x0800B8 shared row/display helper.');
console.log('Use the per-routine RAM, IY-state, bit-operation, and nested-call summaries above to name the two formerly unknown helpers from the concrete effects in this ROM build.');
