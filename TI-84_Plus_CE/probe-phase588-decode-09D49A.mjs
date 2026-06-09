#!/usr/bin/env node
import fs from 'node:fs';

const START = 0x09d49a;
const MAX_BYTES = 300;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd005fa, 'search key subfield'],
  [0xd007e0, 'mode byte'],
  [0xd02590, 'symbol table start'],
  [0xd0259a, 'symbol table shortcut pointer'],
  [0xd0259d, 'symbol table pointer'],
  [0xd3ffff, 'symbol table end'],
  [0xd02ad7, 'last-match buffer +0'],
  [0xd02ad8, 'last-match buffer +1'],
  [0xd02ad9, 'last-match buffer +2'],
  [0xd0243a, 'edit cursor'],
  [0xd008d6, 'phase586 caller RAM read'],
  [0xd008ee, 'event dispatch byte'],
  [0xd01d0c, 'phase586 adjacent fn RAM'],
]);

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const regs8ix = ['B', 'C', 'D', 'E', 'IXH', 'IXL', '(IX+d)', 'A'];
const regs8iy = ['B', 'C', 'D', 'E', 'IYH', 'IYL', '(IY+d)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rpIx = ['BC', 'DE', 'IX', 'SP'];
const rpIy = ['BC', 'DE', 'IY', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

const callTargets = new Set();
const jumpTargets = new Set();
const rstTargets = new Set();
const ramRefs = new Set();
const iyRefs = new Set();
const ports = new Set();

function hex(value, width) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(addr, len, disp) {
  return (addr + len + signed8(disp)) & 0xffffff;
}

function u16(off) {
  return rom[off] | (rom[off + 1] << 8);
}

function u24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function noteAbs(addr) {
  if (addr >= 0xd00000 && addr <= 0xd3ffff) ramRefs.add(addr);
}

function fmtAbs(addr) {
  noteAbs(addr);
  const name = ramNames.get(addr);
  return name ? `${hex(addr, 6)} ; ${name}` : hex(addr, 6);
}

function idxDisp(index, d) {
  const s = signed8(d);
  const text = s < 0 ? `${index}${s}` : `${index}+${s}`;
  if (index === 'IY') iyRefs.add(text);
  return `(${text})`;
}

function replaceIndexedOperand(op, index, d) {
  return op.replace(`(${index}+d)`, idxDisp(index, d)).replace('(IX+d)', idxDisp(index, d)).replace('(IY+d)', idxDisp(index, d));
}

function decodeCB(addr, off, prefix, d) {
  const op = rom[off];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const index = prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : null;
  const regs = index === 'IX' ? regs8ix : index === 'IY' ? regs8iy : regs8;
  let operand = regs[z];
  if (index && z === 6) operand = idxDisp(index, d);
  let text;
  if (x === 0) text = `${rot[y]} ${operand}`;
  else if (x === 1) text = `BIT ${y},${operand}`;
  else if (x === 2) text = `RES ${y},${operand}`;
  else text = `SET ${y},${operand}`;
  return { len: index ? 4 : 2, text };
}

function decodeED(addr, off) {
  const op = rom[off + 1];
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const block = {
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (block[op]) return { len: 2, text: block[op] };
  if ((op & 0xc7) === 0x40) {
    ports.add('(C)');
    return { len: 2, text: y === 6 ? 'IN (C)' : `IN ${regs8[y]},(C)` };
  }
  if ((op & 0xc7) === 0x41) {
    ports.add('(C)');
    return { len: 2, text: y === 6 ? 'OUT (C),0' : `OUT (C),${regs8[y]}` };
  }
  if ((op & 0xcf) === 0x42) return { len: 2, text: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
  if ((op & 0xcf) === 0x43) {
    const a = u24(off + 2);
    return { len: 5, text: `${q ? 'LD ' + rp[p] + ',(' + fmtAbs(a) + ')' : 'LD (' + fmtAbs(a) + '),' + rp[p]}` };
  }
  const misc = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4d: 'RETI',
    0x4f: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I', 0x5e: 'IM 2', 0x5f: 'LD A,R',
    0x67: 'RRD', 0x6f: 'RLD',
  };
  return { len: 2, text: misc[op] ?? `DB 0xED, ${hex(op, 2)}` };
}

function decodeAt(addr) {
  const off = addr;
  let op = rom[off];
  let prefix = 0;
  if (op === 0xdd || op === 0xfd) {
    prefix = op;
    op = rom[off + 1];
    if (op === 0xcb) return decodeCB(addr, off + 2, prefix, rom[off + 2]);
  }
  if (!prefix && op === 0xcb) return decodeCB(addr, off + 1, 0, 0);
  if (!prefix && op === 0xed) return decodeED(addr, off);

  const base = off + (prefix ? 1 : 0);
  const index = prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : null;
  const regs = index === 'IX' ? regs8ix : index === 'IY' ? regs8iy : regs8;
  const pairs = index === 'IX' ? rpIx : index === 'IY' ? rpIy : rp;
  const opLen = prefix ? 1 : 0;
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  let len = opLen + 1;
  let text = null;

  if (x === 0) {
    if (z === 0) {
      if (y === 0) text = 'NOP';
      else if (y === 1) text = "EX AF,AF'";
      else if (y === 2) { len++; const t = relTarget(addr, len, rom[base + 1]); jumpTargets.add(t); text = `DJNZ ${hex(t, 6)}`; }
      else if (y === 3) { len++; const t = relTarget(addr, len, rom[base + 1]); jumpTargets.add(t); text = `JR ${hex(t, 6)}`; }
      else { len++; const t = relTarget(addr, len, rom[base + 1]); jumpTargets.add(t); text = `JR ${cc[y - 4]},${hex(t, 6)}`; }
    } else if (z === 1) {
      if (!q) { len += 2; text = `LD ${pairs[p]},${hex(u16(base + 1), 4)}`; }
      else text = `ADD ${pairs[2]},${pairs[p]}`;
    } else if (z === 2) {
      if (!q && p === 0) text = 'LD (BC),A';
      else if (q && p === 0) text = 'LD A,(BC)';
      else if (!q && p === 1) text = 'LD (DE),A';
      else if (q && p === 1) text = 'LD A,(DE)';
      else {
        len += 3;
        const a = u24(base + 1);
        text = !q ? `LD (${fmtAbs(a)}),${pairs[2]}` : `LD ${pairs[2]},(${fmtAbs(a)})`;
      }
    } else if (z === 3) text = `${q ? 'DEC' : 'INC'} ${pairs[p]}`;
    else if (z === 4) text = `INC ${regs[y]}`;
    else if (z === 5) text = `DEC ${regs[y]}`;
    else if (z === 6) { len++; text = `LD ${regs[y]},${hex(rom[base + 1], 2)}`; }
    else text = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y];
  } else if (x === 1) {
    text = op === 0x76 ? 'HALT' : `LD ${regs[y]},${regs[z]}`;
  } else if (x === 2) {
    text = `${alu[y]} ${regs[z]}`;
  } else {
    if (z === 0) text = `RET ${cc[y]}`;
    else if (z === 1) text = q ? ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] : `POP ${rp2[p]}`;
    else if (z === 2) {
      len += 3;
      const a = u24(base + 1);
      jumpTargets.add(a);
      text = `JP ${cc[y]},${hex(a, 6)}`;
    } else if (z === 3) {
      if (y === 0) { len += 3; const a = u24(base + 1); jumpTargets.add(a); text = `JP ${hex(a, 6)}`; }
      else if (y === 2) { len++; ports.add(hex(rom[base + 1], 2)); text = `OUT (${hex(rom[base + 1], 2)}),A`; }
      else if (y === 3) { len++; ports.add(hex(rom[base + 1], 2)); text = `IN A,(${hex(rom[base + 1], 2)})`; }
      else text = ['-', '-', '-', '-', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'][y] ?? `DB ${hex(op, 2)}`;
    } else if (z === 4) {
      len += 3;
      const a = u24(base + 1);
      callTargets.add(a);
      text = `CALL ${cc[y]},${hex(a, 6)}`;
    } else if (z === 5) {
      if (!q) text = `PUSH ${rp2[p]}`;
      else if (p === 0) { len += 3; const a = u24(base + 1); callTargets.add(a); text = `CALL ${hex(a, 6)}`; }
      else text = `DB ${hex(op, 2)}`;
    } else if (z === 6) {
      len++;
      text = `${alu[y]} ${hex(rom[base + 1], 2)}`;
    } else {
      const t = y * 8;
      rstTargets.add(t);
      text = `RST ${hex(t, 2)}`;
    }
  }

  if (index && text) {
    if (text.includes('(IX+d)') || text.includes('(IY+d)')) {
      len++;
      text = replaceIndexedOperand(text, index, rom[base + 1]);
      if (op === 0x36) len++;
    }
    text = text.replaceAll('HL', index).replaceAll('(HL)', `(${index})`);
  }

  if (!text) text = `DB ${hex(op, 2)}`;
  return { len, text };
}

// --- Decode pass 1: linear from START until RET/JP or MAX_BYTES ---
const rows = [];
let pc = START;
let ended = false;

while (pc < START + MAX_BYTES && pc < rom.length && !ended) {
  const decoded = decodeAt(pc);
  const bytes = [...rom.subarray(pc, pc + decoded.len)];
  rows.push({ addr: pc, bytes, text: decoded.text });
  if (/^(RET|RETN|RETI)\b/.test(decoded.text) || /^JP 0x[0-9A-F]{6}$/.test(decoded.text)) ended = true;
  pc += decoded.len;
}

// --- Decode pass 2: follow local branch/jump targets past the first RET ---
const decodedAddrs = new Set(rows.map(r => r.addr));

const branchQueue = new Set();
for (const t of [...jumpTargets]) {
  if (!decodedAddrs.has(t) && t >= START && t < START + MAX_BYTES + 200) {
    branchQueue.add(t);
  }
}

const extraRows = [];
for (const target of [...branchQueue].sort((a, b) => a - b)) {
  let epc = target;
  let eEnded = false;
  while (epc < target + 150 && epc < rom.length && !eEnded && !decodedAddrs.has(epc)) {
    const decoded = decodeAt(epc);
    const bytes = [...rom.subarray(epc, epc + decoded.len)];
    extraRows.push({ addr: epc, bytes, text: decoded.text });
    decodedAddrs.add(epc);
    if (/^(RET|RETN|RETI)\b/.test(decoded.text) || /^JP 0x[0-9A-F]{6}$/.test(decoded.text)) eEnded = true;
    epc += decoded.len;
  }
}

// --- Output ---
console.log('=== Probe phase 588: decode ROM function 0x09D49A ===');
console.log('Context: NZ branch target from TYPE-0x5F SEARCH KEY VALIDATOR (0x09D454).');
console.log('When search key type at D005F9 != 0x5F, execution jumps here.');
console.log('Called from 0x0843B3 (type-0x72 lookup setup) via 0x09D454.');
console.log('ROM: TI-84_Plus_CE/ROM.rom');
console.log('');

console.log('--- Primary disassembly (linear from 0x09D49A) ---');
for (const row of rows) {
  const b = row.bytes.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
  const marker = jumpTargets.has(row.addr) ? ' <-- branch target' : '';
  console.log(`${hex(row.addr, 6)}  ${b}  ${row.text}${marker}`);
}

if (extraRows.length > 0) {
  console.log('');
  console.log('--- Branch/continuation targets (past first terminator) ---');
  for (const row of extraRows) {
    const b = row.bytes.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
    const marker = jumpTargets.has(row.addr) ? ' <-- branch target' : '';
    console.log(`${hex(row.addr, 6)}  ${b}  ${row.text}${marker}`);
  }
}

const size = pc - START;
const touchedRam = [...ramRefs].sort((a, b) => a - b);

console.log('');
console.log('=== Summary ===');
console.log(`Function start: ${hex(START, 6)}`);
console.log(`Primary end:    ${hex(pc, 6)}${ended ? '' : ' (300-byte probe limit reached)'}`);
console.log(`Primary size:   ${size} bytes`);
console.log(`CALL targets:   ${[...callTargets].sort((a, b) => a - b).map((v) => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`JP/JR targets:  ${[...jumpTargets].sort((a, b) => a - b).map((v) => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`RST vectors:    ${[...rstTargets].sort((a, b) => a - b).map((v) => hex(v, 2)).join(', ') || '(none)'}`);
console.log(`RAM touched:    ${touchedRam.map((v) => `${hex(v, 6)}${ramNames.has(v) ? ` (${ramNames.get(v)})` : ''}`).join(', ') || '(none)'}`);
console.log(`IY+d refs:      ${[...iyRefs].sort().join(', ') || '(none)'}`);
console.log(`Port I/O:       ${[...ports].sort().join(', ') || '(none)'}`);
console.log('');

// Cross-reference known addresses
const knownFns = new Map([
  [0x09d454, 'TYPE-0x5F SEARCH KEY VALIDATOR'],
  [0x0992c3, 'SYMBOL TABLE COMPUTATION DISPATCHER'],
  [0x092fc7, 'LIST RECORD COPIER'],
  [0x0820cd, 'DESCRIPTOR BUFFER VALIDATOR'],
  [0x0843b3, 'TYPE-0x72 LOOKUP SETUP'],
  [0x0229c5, 'EVENT HELPER'],
  [0x080d1d, 'KEY-VALUE WRITER'],
  [0x0846ea, 'SYMBOL TABLE SEARCHER'],
  [0x0855b1, 'TOKEN CLASSIFIER'],
  [0x04c885, 'MATCH RECORD STORE'],
  [0x082be2, 'RECORD REWIND'],
  [0x08011f, 'SYMBOL TABLE TYPE-CHECK GUARD'],
  [0x09d49a, 'THIS FUNCTION (NZ branch from 0x09D454)'],
  [0x09d50d, 'SUBFIELD/MODE MISMATCH HANDLER (from 0x09D454)'],
  [0x000138, 'OS SYSTEM JUMP TABLE'],
]);

console.log('=== Cross-reference: known functions ===');
for (const t of [...callTargets].sort((a, b) => a - b)) {
  const name = knownFns.get(t);
  console.log(`  CALL ${hex(t, 6)}${name ? ` = ${name}` : ' (UNKNOWN - new target for investigation)'}`);
}
for (const t of [...jumpTargets].sort((a, b) => a - b)) {
  const name = knownFns.get(t);
  if (t < START || t > START + MAX_BYTES + 200) {
    console.log(`  JP/JR ${hex(t, 6)}${name ? ` = ${name}` : ' (UNKNOWN - external target)'}`);
  }
}

console.log('');
console.log('=== Hypothesis ===');
console.log('0x09D49A is the type!=0x5F path from the search key validator.');
console.log('For type-0x72 lookups (from 0x0843B3), this is the ACTUAL execution path.');
console.log('Expected: either a generic/alternate symbol table lookup pathway,');
console.log('or a type-specific dispatch that handles non-0x5F search keys differently.');

process.exit(0);
