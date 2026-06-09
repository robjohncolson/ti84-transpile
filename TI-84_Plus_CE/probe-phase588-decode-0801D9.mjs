#!/usr/bin/env node
import fs from 'node:fs';

const START = 0x0801d9;
const MAX_BYTES = 200;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd005fa, 'search key byte 2'],
  [0xd005fb, 'search key byte 3'],
  [0xd007e0, 'mode/context byte'],
  [0xd008d6, 'saved D0243A value'],
  [0xd0008a, 'OS byte 0x0A'],
  [0xd0008b, 'OS byte 0x0B'],
  [0xd00687, 'saved HL'],
  [0xd01d0c, 'graph/display state'],
  [0xd02590, 'symbol table start'],
  [0xd0259a, 'symbol table shortcut pointer'],
  [0xd0259d, 'symbol table pointer'],
  [0xd0243a, 'edit cursor'],
  [0xd02ad7, 'last-match buffer +0'],
  [0xd02ad8, 'last-match buffer +1'],
  [0xd02ad9, 'last-match buffer +2'],
  [0xd3ffff, 'symbol table end'],
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

// === Helper: disassemble a region, stop on unconditional RET/JP ===
function disasmRegion(start, maxBytes) {
  const result = [];
  let p = start;
  let done = false;
  while (p < start + maxBytes && p < rom.length && !done) {
    const decoded = decodeAt(p);
    const bytes = [...rom.subarray(p, p + decoded.len)];
    result.push({ addr: p, bytes, text: decoded.text });
    // Only stop on UNCONDITIONAL RET, JP, or RETN/RETI
    if (/^RET$/.test(decoded.text) || /^(RETN|RETI)$/.test(decoded.text) || /^JP 0x[0-9A-F]{6}$/.test(decoded.text)) done = true;
    p += decoded.len;
  }
  return { rows: result, endAddr: p, ended: done };
}

// === Pass 1: linear disassembly from START ===
const mainResult = disasmRegion(START, MAX_BYTES);
const rows = mainResult.rows;
const ended = mainResult.ended;
const pc = mainResult.endAddr;

const funcEnd = pc;
const funcSize = funcEnd - START;

// === Collect internal vs external targets ===
const internalJumps = [...jumpTargets].filter(t => t >= START && t < funcEnd);
const externalCalls = [...callTargets].sort((a, b) => a - b);
const externalJumps = [...jumpTargets].filter(t => t < START || t >= funcEnd).sort((a, b) => a - b);

// === Pass 2: decode branch targets OUTSIDE the function (up to 60 bytes each) ===
const branchDisasm = new Map();
const allExtTargets = [...new Set([...callTargets, ...externalJumps])].sort((a, b) => a - b);
for (const target of allExtTargets) {
  if (target >= START && target < funcEnd) continue;
  const result = disasmRegion(target, 100);
  branchDisasm.set(target, result.rows);
}

// === Pass 3: decode 2nd-level call targets found in pass 2 ===
const level2Targets = new Set();
for (const [, tRows] of branchDisasm) {
  for (const row of tRows) {
    const m = row.text.match(/^CALL (0x[0-9A-F]{6})$/);
    if (m) level2Targets.add(parseInt(m[1], 16));
    const m2 = row.text.match(/^CALL [A-Z]+,(0x[0-9A-F]{6})$/);
    if (m2) level2Targets.add(parseInt(m2[1], 16));
  }
}
const level2Disasm = new Map();
for (const target of [...level2Targets].sort((a, b) => a - b)) {
  if (branchDisasm.has(target)) continue;
  const result = disasmRegion(target, 100);
  level2Disasm.set(target, result.rows);
}

// === Known function names ===
const knownFunctions = new Map([
  [0x08011f, 'TYPE-CHECK GUARD (7B, checks D005F9 == 0x5D)'],
  [0x080064, 'MULTI-BYTE PREFIX CHECK (17B)'],
  [0x0800a0, 'MULTI-STUB CLUSTER (29B)'],
  [0x080151, 'GATE FUNCTION'],
  [0x080259, 'SPLIT-FLAG TEST (5B)'],
  [0x0820cd, 'DESCRIPTOR BUFFER VALIDATOR (32B CPIR)'],
  [0x0843b3, 'TYPE-0x72 LOOKUP SETUP'],
  [0x0846ea, 'SYMBOL TABLE SEARCHER (110B, 235 callers)'],
  [0x0992c3, 'SYMBOL TABLE COMPUTATION DISPATCHER'],
  [0x09d454, 'SEARCH KEY VALIDATOR'],
  [0x082be2, 'RECORD REWIND (7B, 6xDEC HL)'],
  [0x04c885, 'MATCH RECORD STORE (16B)'],
  [0x080d1d, 'KEY-VALUE WRITER (16B)'],
  [0x0236f9, 'EVENT POSTING CENTRAL DISPATCH'],
  [0x000138, 'OS SYSTEM JUMP TABLE'],
  [0x083833, 'early-exit target for type-0x5D'],
]);

// === Output ===
console.log('=== Probe phase 588: decode ROM function 0x0801D9 ===');
console.log('=== First call from Symbol Table Computation Dispatcher (0x0992C3) ===');
console.log('ROM: TI-84_Plus_CE/ROM.rom');
console.log('');

console.log('--- Main function disassembly ---');
for (const row of rows) {
  const b = row.bytes.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
  const marker = internalJumps.includes(row.addr) ? ' <--' : '';
  console.log(`${hex(row.addr, 6)}  ${b}  ${row.text}${marker}`);
}

console.log('');
console.log('--- Branch/call target disassembly (first 60 bytes each) ---');
for (const [target, tRows] of branchDisasm) {
  const name = knownFunctions.get(target);
  console.log('');
  console.log(`  >> ${hex(target, 6)}${name ? ' [' + name + ']' : ''}:`);
  for (const row of tRows) {
    const b = row.bytes.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
    console.log(`  ${hex(row.addr, 6)}  ${b}  ${row.text}`);
  }
}

if (level2Disasm.size > 0) {
  console.log('');
  console.log('--- 2nd-level call targets (called by branch targets above) ---');
  for (const [target, tRows] of level2Disasm) {
    const name = knownFunctions.get(target);
    console.log('');
    console.log(`  >> ${hex(target, 6)}${name ? ' [' + name + ']' : ''}:`);
    for (const row of tRows) {
      const b = row.bytes.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
      console.log(`  ${hex(row.addr, 6)}  ${b}  ${row.text}`);
    }
  }
}

console.log('');
console.log('=== Summary ===');
console.log('Function start: ' + hex(START, 6));
console.log('Function end:   ' + hex(funcEnd, 6) + (ended ? '' : ' (200-byte probe limit reached)'));
console.log('Function size:  ' + funcSize + ' bytes');
console.log('CALL targets:   ' + (externalCalls.map(v => { const n = knownFunctions.get(v); return hex(v, 6) + (n ? ' [' + n + ']' : ''); }).join(', ') || '(none)'));
console.log('JP targets (external): ' + (externalJumps.map(v => { const n = knownFunctions.get(v); return hex(v, 6) + (n ? ' [' + n + ']' : ''); }).join(', ') || '(none)'));
console.log('JP/JR targets (internal): ' + (internalJumps.map(v => hex(v, 6)).join(', ') || '(none)'));
console.log('RST vectors:    ' + ([...rstTargets].sort((a, b) => a - b).map(v => hex(v, 2)).join(', ') || '(none)'));
console.log('RAM touched:    ' + ([...ramRefs].sort((a, b) => a - b).map(v => hex(v, 6) + (ramNames.has(v) ? ' (' + ramNames.get(v) + ')' : '')).join(', ') || '(none)'));
console.log('IY+d refs:      ' + ([...iyRefs].sort().join(', ') || '(none)'));
console.log('Port I/O:       ' + ([...ports].sort().join(', ') || '(none)'));

// === Cross-reference: count CALL 0x0801D9 (CD D9 01 08) in ROM ===
const callPattern = [0xcd, 0xd9, 0x01, 0x08];
const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === callPattern[0] && rom[i+1] === callPattern[1] && rom[i+2] === callPattern[2] && rom[i+3] === callPattern[3]) {
    callers.push(i);
  }
}
console.log('');
console.log('=== Cross-references (CALL 0x0801D9) ===');
console.log('Caller count: ' + callers.length);
for (const c of callers) {
  console.log('  ' + hex(c, 6));
}

// === Also decode 0x080228 (JR NC target from 0x08021F) ===
console.log('');
console.log('--- 0x080228 (JR NC target from 0x08021F sub-check) ---');
const sub080228 = disasmRegion(0x080228, 40);
for (const row of sub080228.rows) {
  const b = row.bytes.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
  console.log('  ' + hex(row.addr, 6) + '  ' + b + '  ' + row.text);
}

// Hypothesis — now informed by actual disassembly
console.log('');
console.log('=== Analysis ===');
console.log('');
console.log('0x0801D9 is a 16-byte SYMBOL TYPE CLASSIFIER (27 callers) on A register.');
console.log('');
console.log('Sub-call chain:');
console.log('  0x08021F: AND 0x3F, if < 0x1A: CP 0x18 (C=0 iff A>=0x18, so 0x18/0x19 pass)');
console.log('            if >= 0x1A: CP 0x19 then SCF (always C=1 = fail)');
console.log('            => returns C=0 ONLY for masked types 0x18 and 0x19');
console.log('  0x07F7C4: AND 0x3F, RET Z if 0. CALL 0x08021F, RET C if fail.');
console.log('            On success: CP A (forces Z=1), RET.');
console.log('            => returns Z=1 for masked types 0x00, 0x18, 0x19');
console.log('');
console.log('0x0801D9 flow:');
console.log('  1. CALL 0x07F7C4 => Z=1 if type & 0x3F in {0x00, 0x18, 0x19}');
console.log('  2. RET Z (accept those)');
console.log('  3. CP 0x1C => RET Z if type == 0x1C');
console.log('  4. AND 0x3F, CP 0x20 => RET Z if masked type == 0x20');
console.log('  5. CP 0x21 => RET (Z=1 if masked type == 0x21)');
console.log('');
console.log('ACCEPTED types (Z=1): 0x00, 0x18, 0x19, 0x1C, 0x20, 0x21');
console.log('REJECTED types (Z=0): everything else');
console.log('');
console.log('TI-OS type IDs: 0x00=RealObj, 0x18=AppObj, 0x19=AppVarObj,');
console.log('  0x1C=TempProgObj, 0x20=ListObj(?), 0x21=MatObj(?)');
console.log('');
console.log('CONCLUSION: 0x0801D9 is a COMPUTABLE-TYPE FILTER — returns Z=1 if the');
console.log('symbol type in A is one that supports the size/value computation the');
console.log('dispatcher (0x0992C3) is about to perform. 27 callers across the OS.');
console.log('Known caller: 0x0992C3 (Symbol Table Computation Dispatcher).');

process.exit(0);
