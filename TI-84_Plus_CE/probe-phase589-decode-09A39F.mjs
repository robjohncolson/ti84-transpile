#!/usr/bin/env node
/**
 * probe-phase589-decode-09A39F.mjs
 * Decode ROM functions 0x09A39F and 0x09A3D0
 * Both in the type>=0x62 extended symbol lookup path (after 0x061DEF).
 * 0x09A39F: subfield==0 path
 * 0x09A3D0: subfield!=0 variant (49 bytes away)
 *
 * Uses hand-rolled eZ80 disassembler copied from probe-phase588-decode-0021C2.mjs.
 */
import fs from 'node:fs';

const FUNC_A = 0x09a39f;
const FUNC_B = 0x09a3d0;
const MAX_BYTES = 128;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd005fa, 'search key byte 1'],
  [0xd005fb, 'search key byte 2'],
  [0xd007e0, 'mode/context byte'],
  [0xd008d6, 'phase586 caller RAM read'],
  [0xd008ee, 'event dispatch selector'],
  [0xd01d0b, 'counter pair high'],
  [0xd01d0c, 'function separator RAM'],
  [0xd02510, 'editing state buffer (65B)'],
  [0xd02590, 'symbol table start'],
  [0xd0259a, 'symbol table shortcut pointer'],
  [0xd0259d, 'symbol table pointer'],
  [0xd02ad7, 'last-match buffer +0'],
  [0xd0243a, 'edit cursor'],
  [0xd3ffff, 'symbol table end'],
]);

// ---- eZ80 disassembler (from probe-phase588) ----
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

let callTargets = new Set();
let jumpTargets = new Set();
let rstTargets = new Set();
let ramRefs = new Set();
let iyRefs = new Set();
let ports = new Set();

function resetTracking() {
  callTargets = new Set();
  jumpTargets = new Set();
  rstTargets = new Set();
  ramRefs = new Set();
  iyRefs = new Set();
  ports = new Set();
}

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
  return { len: 2, text: misc[op] || `DB 0xED, ${hex(op, 2)}` };
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
      if (!q) {
        len += 3;
        const a = u24(base + 1);
        text = `LD ${pairs[p]},${hex(a, 6)}`;
        noteAbs(a);
      } else {
        text = `ADD ${pairs[2]},${pairs[p]}`;
      }
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
      else text = ['-', '-', '-', '-', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'][y] || `DB ${hex(op, 2)}`;
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

function disassembleBlock(startAddr, maxBytes) {
  const rows = [];
  let pc = startAddr;
  let ended = false;
  while (pc < startAddr + maxBytes && pc < rom.length && !ended) {
    const decoded = decodeAt(pc);
    const bytes = [...rom.subarray(pc, pc + decoded.len)];
    rows.push({ addr: pc, bytes, text: decoded.text });
    if (/^(RET|RETN|RETI)\b/.test(decoded.text) && !/^RET (NZ|Z|NC|C|PO|PE|P|M)/.test(decoded.text)) ended = true;
    if (/^JP 0x[0-9A-F]{6}$/.test(decoded.text)) ended = true;
    pc += decoded.len;
  }
  return { rows, endAddr: pc, ended };
}

function printBlock(rows, indent) {
  const pfx = indent ? '  ' : '';
  for (const row of rows) {
    const b = row.bytes.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17);
    console.log(`${pfx}${hex(row.addr, 6)}  ${b}  ${row.text}`);
  }
}

function collectSummary(label) {
  return {
    label,
    calls: [...callTargets].sort((a, b) => a - b),
    jumps: [...jumpTargets].sort((a, b) => a - b),
    rsts: [...rstTargets].sort((a, b) => a - b),
    ram: [...ramRefs].sort((a, b) => a - b),
    iy: [...iyRefs].sort(),
    io: [...ports].sort(),
  };
}

function printSummary(s) {
  console.log(`  CALL targets:  ${s.calls.map(v => hex(v, 6)).join(', ') || '(none)'}`);
  console.log(`  JP/JR targets: ${s.jumps.map(v => hex(v, 6)).join(', ') || '(none)'}`);
  console.log(`  RST vectors:   ${s.rsts.map(v => hex(v, 2)).join(', ') || '(none)'}`);
  console.log(`  RAM touched:   ${s.ram.map(v => `${hex(v, 6)}${ramNames.has(v) ? ` (${ramNames.get(v)})` : ''}`).join(', ') || '(none)'}`);
  console.log(`  IY+d refs:     ${s.iy.join(', ') || '(none)'}`);
  console.log(`  Port I/O:      ${s.io.join(', ') || '(none)'}`);
}

// ====================================================================
// MAIN
// ====================================================================
console.log('=== Probe phase 589: decode 0x09A39F and 0x09A3D0 ===');
console.log('=== (type>=0x62 extended symbol lookup, subfield==0 and subfield!=0 paths) ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
console.log('');

// ---- Context: raw bytes around both functions ----
console.log('--- Raw hex context: 0x09A390 - 0x09A430 (160 bytes) ---');
for (let a = 0x09a390; a < 0x09a430; a += 16) {
  const chunk = [...rom.subarray(a, Math.min(a + 16, 0x09a430))];
  const hexStr = chunk.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  console.log(`  ${hex(a, 6)}  ${hexStr}`);
}
console.log('');

// ---- Function A: 0x09A39F ----
console.log('========================================');
console.log(`FUNCTION A: ${hex(FUNC_A, 6)} (type>=0x62 extended lookup, subfield==0 path)`);
console.log('========================================');
resetTracking();
const blockA = disassembleBlock(FUNC_A, MAX_BYTES);
printBlock(blockA.rows, false);
const sizeA = blockA.endAddr - FUNC_A;
console.log(`\n--- Block A: ${sizeA} bytes, ended=${blockA.ended} ---`);
const summaryA = collectSummary('Function A');
printSummary(summaryA);
const callsA = [...summaryA.calls];
console.log('');

// ---- Function B: 0x09A3D0 ----
console.log('========================================');
console.log(`FUNCTION B: ${hex(FUNC_B, 6)} (type>=0x62 extended lookup, subfield!=0 path)`);
console.log('========================================');
resetTracking();
const blockB = disassembleBlock(FUNC_B, MAX_BYTES);
printBlock(blockB.rows, false);
const sizeB = blockB.endAddr - FUNC_B;
console.log(`\n--- Block B: ${sizeB} bytes, ended=${blockB.ended} ---`);
const summaryB = collectSummary('Function B');
printSummary(summaryB);
const callsB = [...summaryB.calls];
console.log('');

// ---- Overlap / relationship analysis ----
console.log('========================================');
console.log('OVERLAP / RELATIONSHIP ANALYSIS');
console.log('========================================');
const gap = FUNC_B - FUNC_A;
console.log(`Distance A start -> B start: ${gap} bytes (${hex(gap, 4)})`);
console.log(`Function A span: ${hex(FUNC_A, 6)} - ${hex(blockA.endAddr, 6)} (${sizeA} bytes)`);
console.log(`Function B span: ${hex(FUNC_B, 6)} - ${hex(blockB.endAddr, 6)} (${sizeB} bytes)`);

if (blockA.endAddr > FUNC_B) {
  console.log(`OVERLAP: Function A extends ${blockA.endAddr - FUNC_B} bytes past Function B start!`);
  console.log('  These may be the same function with B as a mid-entry point.');
} else if (blockA.endAddr === FUNC_B) {
  console.log('ADJACENT: Function A ends exactly where Function B starts.');
} else {
  const gapBytes = FUNC_B - blockA.endAddr;
  console.log(`GAP: ${gapBytes} bytes between Function A end and Function B start.`);
  if (gapBytes > 0 && gapBytes <= 16) {
    console.log('  Small gap — decoding:');
    resetTracking();
    const gapBlock = disassembleBlock(blockA.endAddr, gapBytes + 4);
    printBlock(gapBlock.rows, true);
  }
}

// ---- Shared call targets ----
const sharedCalls = callsA.filter(c => callsB.includes(c));
const onlyA = callsA.filter(c => !callsB.includes(c));
const onlyB = callsB.filter(c => !callsA.includes(c));
console.log(`\nShared CALL targets: ${sharedCalls.map(v => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`Only in A:          ${onlyA.map(v => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`Only in B:          ${onlyB.map(v => hex(v, 6)).join(', ') || '(none)'}`);

// ---- Follow unique call targets ----
const allUniqueCalls = [...new Set([...callsA, ...callsB])].sort((a, b) => a - b);
if (allUniqueCalls.length > 0) {
  console.log('\n========================================');
  console.log('CALL TARGET DISASSEMBLY (up to 60 bytes each)');
  console.log('========================================');
  for (const target of allUniqueCalls) {
    if (target >= rom.length) continue;
    if (target >= FUNC_A && target < blockA.endAddr) { console.log(`\n  >> ${hex(target, 6)}: inside Function A, skipping`); continue; }
    if (target >= FUNC_B && target < blockB.endAddr) { console.log(`\n  >> ${hex(target, 6)}: inside Function B, skipping`); continue; }
    console.log(`\n  >> CALL target ${hex(target, 6)}:`);
    resetTracking();
    const sub = disassembleBlock(target, 60);
    printBlock(sub.rows, true);
    const subSum = collectSummary(`sub-${hex(target, 6)}`);
    console.log(`  --- ${sub.endAddr - target} bytes, ended=${sub.ended} ---`);
    if (subSum.ram.length) console.log(`  RAM: ${subSum.ram.map(v => `${hex(v, 6)}${ramNames.has(v) ? ` (${ramNames.get(v)})` : ''}`).join(', ')}`);
    if (subSum.calls.length) console.log(`  Sub-calls: ${subSum.calls.map(v => hex(v, 6)).join(', ')}`);
  }
}

// ---- Caller scan ----
console.log('\n========================================');
console.log('CALLER SCAN (searching ROM for CALL/JP to these addresses)');
console.log('========================================');
for (const target of [FUNC_A, FUNC_B]) {
  const b0 = target & 0xff;
  const b1 = (target >> 8) & 0xff;
  const b2 = (target >> 16) & 0xff;
  const callers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if ((rom[i] === 0xcd || rom[i] === 0xc3) && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      callers.push({ addr: i, op: rom[i] === 0xcd ? 'CALL' : 'JP' });
    }
  }
  console.log(`${hex(target, 6)}: ${callers.length} caller(s)`);
  for (const c of callers) {
    console.log(`  ${hex(c.addr, 6)}  ${c.op} ${hex(target, 6)}`);
  }
}

// ---- Context: 0x061DEF area ----
console.log('\n========================================');
console.log('CONTEXT: 0x061DEF area (upstream caller)');
console.log('========================================');
resetTracking();
const ctxBlock = disassembleBlock(0x061def, 64);
printBlock(ctxBlock.rows, false);
const ctxSum = collectSummary('0x061DEF context');
console.log(`--- ${ctxBlock.endAddr - 0x061def} bytes, ended=${ctxBlock.ended} ---`);
printSummary(ctxSum);

// ---- Final summary ----
console.log('\n========================================');
console.log('FINAL SUMMARY');
console.log('========================================');
console.log(`Function A (${hex(FUNC_A, 6)}): ${sizeA} bytes, ended=${blockA.ended}`);
console.log(`Function B (${hex(FUNC_B, 6)}): ${sizeB} bytes, ended=${blockB.ended}`);
console.log(`Distance between starts: ${gap} bytes`);
console.log(`Shared calls: ${sharedCalls.length}, Only-A: ${onlyA.length}, Only-B: ${onlyB.length}`);

process.exit(0);
