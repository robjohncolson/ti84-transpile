import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const FUNCTION_START = 0x0b3518;  // real entry (0x0B3514 is JP tail of prior fn)
const CURSOR_SUB = 0x0b5394;

const setResPatterns = [
  { name: 'SET 7,(IY+2) / D00082 bit 7 set', bytes: [0xfd, 0xcb, 0x02, 0xfe] },
  { name: 'RES 7,(IY+2) / D00082 bit 7 clear', bytes: [0xfd, 0xcb, 0x02, 0xbe] },
  { name: 'SET 0,(IY+15) / D0008F bit 0 set', bytes: [0xfd, 0xcb, 0x0f, 0xc6] },
  { name: 'RES 0,(IY+15) / D0008F bit 0 clear', bytes: [0xfd, 0xcb, 0x0f, 0x86] },
];

const bitTestPatterns = [
  { name: 'BIT 7,(IY+2) / D00082 bit 7 test', bytes: [0xfd, 0xcb, 0x02, 0x7e] },
  { name: 'BIT 0,(IY+15) / D0008F bit 0 test', bytes: [0xfd, 0xcb, 0x0f, 0x46] },
];

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function sx8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(pc) {
  return rom[pc] | (rom[pc + 1] << 8);
}

function u24(pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
}

function bytesAt(pc, len) {
  return Array.from(rom.slice(pc, pc + len), b => hex(b)).join(' ');
}

function signedDispText(d) {
  const s = sx8(d);
  return s < 0 ? `-${hex(-s)}` : `+${hex(s)}`;
}

function ixiyReg(prefix) {
  return prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : 'HL';
}

function indexedR(reg, prefix, disp) {
  if (!prefix || reg !== '(HL)') return reg;
  return `(${ixiyReg(prefix)}${signedDispText(disp)})`;
}

function readDispIfNeeded(pc, op, prefix) {
  if (!prefix) return { disp: null, extra: 0 };
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const usesHLMemory =
    (x === 1 && (y === 6 || z === 6)) ||
    (x === 2 && z === 6) ||
    (x === 0 && z === 6 && [4, 5, 6].includes(y)) ||
    (x === 0 && z === 4 && y === 3) ||
    (x === 0 && z === 5 && y === 3);
  if (!usesHLMemory) return { disp: null, extra: 0 };
  return { disp: rom[pc], extra: 1 };
}

function decodeCB(pc, prefix = null, disp = null) {
  const op = rom[pc];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix ? `(${ixiyReg(prefix)}${signedDispText(disp)})` : r8[z];
  if (x === 0) return { len: 1, text: `${rot[y]} ${target}` };
  if (x === 1) return { len: 1, text: `BIT ${y},${target}` };
  if (x === 2) return { len: 1, text: `RES ${y},${target}` };
  return { len: 1, text: `SET ${y},${target}` };
}

function decodeED(pc) {
  const op = rom[pc];
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if ((op & 0xc7) === 0x43) return { len: 4, text: `LD ($${hex(u24(pc + 1), 6)}),${rp[p]}` };
  if ((op & 0xc7) === 0x4b) return { len: 4, text: `LD ${rp[p]},($${hex(u24(pc + 1), 6)})` };
  if (z === 0 && y >= 4) return { len: 1, text: `IN ${r8[y]},(C)` };
  if (z === 1 && y >= 4) return { len: 1, text: `OUT (C),${r8[y]}` };
  if (z === 2) return { len: 1, text: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
  if (z === 3) return { len: 4, text: q ? `LD ${rp[p]},($${hex(u24(pc + 1), 6)})` : `LD ($${hex(u24(pc + 1), 6)}),${rp[p]}` };
  if (z === 4) return { len: 1, text: 'NEG' };
  if (z === 5) return { len: 1, text: y === 1 ? 'RETI' : 'RETN' };
  if (z === 6) return { len: 1, text: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
  if (z === 7) {
    const names = ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R', 'RRD', 'RLD', 'NOP', 'NOP'];
    return { len: 1, text: names[y] };
  }

  const block = {
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (block[op]) return { len: 1, text: block[op] };
  return { len: 1, text: `ED $${hex(op)}` };
}

function decodeAt(pc) {
  let prefix = null;
  let start = pc;
  let op = rom[pc++];

  if (op === 0xdd || op === 0xfd) {
    prefix = op;
    op = rom[pc++];
    if (op === 0xcb) {
      const disp = rom[pc++];
      const cb = decodeCB(pc, prefix, disp);
      return { addr: start, len: pc - start + cb.len, text: cb.text };
    }
  }

  if (op === 0xcb) {
    const cb = decodeCB(pc);
    return { addr: start, len: pc - start + cb.len, text: cb.text };
  }

  if (op === 0xed) {
    const ed = decodeED(pc);
    return { addr: start, len: pc - start + ed.len, text: ed.text };
  }

  const regHL = ixiyReg(prefix);
  const { disp, extra } = readDispIfNeeded(pc, op, prefix);
  const operandPc = pc + extra;
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const regY = indexedR(r8[y], prefix, disp);
  const regZ = indexedR(r8[z], prefix, disp);

  if (x === 1) {
    if (op === 0x76) return { addr: start, len: pc - start, text: 'HALT' };
    return { addr: start, len: pc - start + extra, text: `LD ${regY},${regZ}` };
  }
  if (x === 2) return { addr: start, len: pc - start + extra, text: `${alu[y]} ${regZ}` };
  if (x === 3) {
    if (z === 0) return { addr: start, len: pc - start, text: `RET ${cc[y]}` };
    if (z === 1) return { addr: start, len: pc - start, text: q ? (p === 0 ? 'RET' : ['EXX', 'JP (HL)', `LD SP,${regHL}`][p - 1]) : `POP ${p === 2 && prefix ? regHL : rp2[p]}` };
    if (z === 2) return { addr: start, len: pc - start + 3, text: `JP ${cc[y]},$${hex(u24(pc), 6)}` };
    if (z === 3) {
      if (y === 0) return { addr: start, len: pc - start + 3, text: `JP $${hex(u24(pc), 6)}` };
      if (y === 2) return { addr: start, len: pc - start + 1, text: `OUT ($${hex(rom[pc])}),A` };
      if (y === 3) return { addr: start, len: pc - start + 1, text: `IN A,($${hex(rom[pc])})` };
      if (y === 4) return { addr: start, len: pc - start, text: 'EX (SP),HL' };
      if (y === 5) return { addr: start, len: pc - start, text: 'EX DE,HL' };
      if (y === 6) return { addr: start, len: pc - start, text: 'DI' };
      return { addr: start, len: pc - start, text: 'EI' };
    }
    if (z === 4) return { addr: start, len: pc - start + 3, text: `CALL ${cc[y]},$${hex(u24(pc), 6)}` };
    if (z === 5) return { addr: start, len: pc - start + (q ? 3 : 0), text: q ? `CALL $${hex(u24(pc), 6)}` : `PUSH ${p === 2 && prefix ? regHL : rp2[p]}` };
    if (z === 6) return { addr: start, len: pc - start + 1, text: `${alu[y]} $${hex(rom[pc])}` };
    if (z === 7) return { addr: start, len: pc - start, text: `RST $${hex(y * 8)}` };
  }

  if (z === 0) {
    const jrTarget = () => hex((operandPc + 1 + sx8(rom[operandPc])) & 0xffffff, 6);
    if (y === 0) return { addr: start, len: pc - start, text: 'NOP' };
    if (y === 1) return { addr: start, len: pc - start, text: "EX AF,AF'" };
    if (y === 2) return { addr: start, len: pc - start + 1, text: `DJNZ $${jrTarget()}` };
    if (y === 3) return { addr: start, len: pc - start + 1, text: `JR $${jrTarget()}` };
    return { addr: start, len: pc - start + 1, text: `JR ${cc[y - 4]},$${jrTarget()}` };
  }
  if (z === 1) {
    if (q === 0) return { addr: start, len: pc - start + 3, text: `LD ${p === 2 && prefix ? regHL : rp[p]},$${hex(u24(pc), 6)}` };
    return { addr: start, len: pc - start, text: `ADD ${regHL},${p === 2 && prefix ? regHL : rp[p]}` };
  }
  if (z === 2) {
    const mem = ['(BC)', '(DE)', `($${hex(u24(pc), 6)})`, `($${hex(u24(pc), 6)})`][p];
    if (p < 2) return { addr: start, len: pc - start, text: q ? `LD A,${mem}` : `LD ${mem},A` };
    return { addr: start, len: pc - start + 3, text: q ? `LD ${regHL},${mem}` : `LD ${mem},${regHL}` };
  }
  if (z === 3) return { addr: start, len: pc - start, text: `${q ? 'DEC' : 'INC'} ${p === 2 && prefix ? regHL : rp[p]}` };
  if (z === 4) return { addr: start, len: pc - start + extra, text: `INC ${regY}` };
  if (z === 5) return { addr: start, len: pc - start + extra, text: `DEC ${regY}` };
  if (z === 6) return { addr: start, len: pc - start + extra + 1, text: `LD ${regY},$${hex(rom[operandPc])}` };
  if (z === 7) {
    const names = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
    return { addr: start, len: pc - start, text: names[y] };
  }

  return { addr: start, len: 1, text: `DB $${hex(rom[start])}` };
}

function disassemble(start, options = {}) {
  const maxBytes = options.maxBytes ?? 0x240;
  const stopAtRet = options.stopAtRet ?? false;
  let pc = start;
  const end = Math.min(rom.length, start + maxBytes);
  const lines = [];

  while (pc < end) {
    const ins = decodeAt(pc);
    lines.push(`${hex(pc, 6)}  ${bytesAt(pc, ins.len).padEnd(16)} ${ins.text}`);
    pc += Math.max(ins.len, 1);
    if (stopAtRet && ins.text === 'RET') break;
  }

  return lines;
}

function findPattern(bytes) {
  const hits = [];
  outer:
  for (let i = 0; i <= rom.length - bytes.length; i++) {
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

function contextBytes(addr, radius = 12) {
  const start = Math.max(0, addr - radius);
  const end = Math.min(rom.length, addr + 4 + radius);
  return `${hex(start, 6)}: ${bytesAt(start, end - start)}`;
}

console.log('=== Phase 514: decode 0x0B3540 guard conditions ===');
console.log(`ROM bytes: ${rom.length}`);

// ── PART 1: Full disassembly of containing function ──

console.log('\n' + '='.repeat(72));
console.log('PART 1: Disassembly of 0x0B3540 containing function');
console.log('='.repeat(72));

console.log('\n--- Context: 0x0B3510 (before entry) ---');
console.log(disassemble(0x0B3510, { maxBytes: 8, stopAtRet: false }).join('\n'));

console.log('\n--- Main function: 0x0B3518 through first RET ---');
console.log(disassemble(FUNCTION_START, { maxBytes: 0x120, stopAtRet: true }).join('\n'));

console.log('\n--- Extended past RET to 0x0B3620 (catch handlers, subfunctions) ---');
console.log(disassemble(0x0B35BA, { maxBytes: 0x0B3620 - 0x0B35BA, stopAtRet: false }).join('\n'));

console.log('\n--- Catch handler at 0x0B35DA ---');
console.log(disassemble(0x0B35DA, { maxBytes: 40, stopAtRet: true }).join('\n'));

console.log('\n--- Sub at 0x0B35F5 ---');
console.log(disassemble(0x0B35F5, { maxBytes: 30, stopAtRet: true }).join('\n'));

// ── PART 2: ROM-wide search for SET/RES of guard flags ──

console.log('\n' + '='.repeat(72));
console.log('PART 2: ROM-wide search for guard flag SET/RES patterns');
console.log('='.repeat(72));

for (const pattern of [...setResPatterns, ...bitTestPatterns]) {
  const hits = findPattern(pattern.bytes);
  console.log(`\n--- ${pattern.name} --- ${hits.length} hit(s) ---`);
  console.log(`  pattern: ${pattern.bytes.map(b => hex(b)).join(' ')}`);
  for (const hit of hits) {
    console.log(`  ${hex(hit, 6)}  ${contextBytes(hit)}`);
    const around = Math.max(0, hit - 16);
    console.log(disassemble(around, { maxBytes: 48, stopAtRet: false }).map(line => `    ${line}`).join('\n'));
  }
}

// ── PART 3: Decode 0x0B5394 ──

console.log('\n' + '='.repeat(72));
console.log('PART 3: Decode 0x0B5394 (cursor sub-function area)');
console.log('='.repeat(72));

console.log('\n--- 0x0B5394: 80 bytes ---');
console.log(disassemble(CURSOR_SUB, { maxBytes: 80, stopAtRet: false }).join('\n'));

// Continue to decode additional small stubs in the area
console.log('\n--- Extended: 0x0B53B4 to 0x0B5404 ---');
console.log(disassemble(0x0B53B4, { maxBytes: 80, stopAtRet: false }).join('\n'));

// ── SUMMARY ──

console.log('\n' + '='.repeat(72));
console.log('SUMMARY');
console.log('='.repeat(72));

console.log('\nGuard flag mutation sites (SET/RES):');
for (const pat of setResPatterns) {
  const hits = findPattern(pat.bytes);
  console.log(`  ${pat.name}: ${hits.length} sites at ${hits.map(h => hex(h, 6)).join(', ') || 'none'}`);
}

console.log('\nGuard flag test sites (BIT):');
for (const pat of bitTestPatterns) {
  const hits = findPattern(pat.bytes);
  console.log(`  ${pat.name}: ${hits.length} sites at ${hits.map(h => hex(h, 6)).join(', ') || 'none'}`);
}

console.log('\nDone.');
