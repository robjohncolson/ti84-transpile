#!/usr/bin/env node
import fs from 'node:fs';

const START = 0x07FEB6;
const MAX_BYTES = 256;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd005fa, 'search key byte 1'],
  [0xd005fb, 'search key byte 2'],
  [0xd007e0, 'mode/context byte'],
  [0xd008d6, 'phase586 caller RAM read'],
  [0xd008d8, 'phase586 related'],
  [0xd008e0, 'setjmp SP save'],
  [0xd008ee, 'event dispatch selector'],
  [0xd0117f, 'generic resolver RAM'],
  [0xd01464, 'type-0x5C fast path RAM'],
  [0xd01d0b, 'count/limit byte'],
  [0xd01d0c, 'function separator RAM'],
  [0xd02510, 'editing state buffer (65B)'],
  [0xd02590, 'symbol table start'],
  [0xd0259a, 'symbol table shortcut pointer'],
  [0xd0259d, 'symbol table pointer'],
  [0xd02ad7, 'last-match buffer +0'],
  [0xd0243a, 'edit cursor'],
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


console.log('=== Probe phase 590: decode ROM function 0x07FEB6 (helper in path D of symbol address resolver) ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
console.log('');

// ---- Primary disassembly of 0x0821AE ----
console.log('--- Primary disassembly: 0x07FEB6 ---');
const main = disassembleBlock(START, MAX_BYTES);
printBlock(main.rows, false);
const mainSize = main.endAddr - START;
console.log(`\n--- Primary block: ${mainSize} bytes, ended=${main.ended} ---`);

// ---- Follow call targets ----
const allCalls = [...callTargets].sort((a, b) => a - b);
if (allCalls.length > 0) {
  console.log('\n--- CALL targets (first 64 bytes each) ---');
  for (const target of allCalls) {
    if (target >= rom.length) continue;
    console.log(`\n  >> CALL target ${hex(target, 6)}:`);
    const sub = disassembleBlock(target, 64);
    printBlock(sub.rows, true);
    console.log(`  --- ${sub.endAddr - target} bytes, ended=${sub.ended} ---`);
  }
}

// ---- Follow jump targets outside main block ----
const externalJumps = [...jumpTargets].filter(t => t < START || t >= main.endAddr).sort((a, b) => a - b);
if (externalJumps.length > 0) {
  console.log('\n--- External JP/JR targets (first 64 bytes each) ---');
  for (const target of externalJumps) {
    if (target >= rom.length) continue;
    if (callTargets.has(target)) continue; // already decoded
    console.log(`\n  >> JP/JR target ${hex(target, 6)}:`);
    const sub = disassembleBlock(target, 64);
    printBlock(sub.rows, true);
    console.log(`  --- ${sub.endAddr - target} bytes, ended=${sub.ended} ---`);
  }
}

// ---- Summary ----
const touchedRam = [...ramRefs].sort((a, b) => a - b);
console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`Function start:   ${hex(START, 6)}`);
console.log(`Function end:     ${hex(main.endAddr, 6)}`);
console.log(`Function size:    ${mainSize} bytes`);
console.log(`Ended naturally:  ${main.ended}`);
console.log(`CALL targets:     ${[...callTargets].sort((a, b) => a - b).map((v) => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`JP/JR targets:    ${[...jumpTargets].sort((a, b) => a - b).map((v) => hex(v, 6)).join(', ') || '(none)'}`);
console.log(`RST vectors:      ${[...rstTargets].sort((a, b) => a - b).map((v) => hex(v, 2)).join(', ') || '(none)'}`);
console.log(`RAM touched:      ${touchedRam.map((v) => `${hex(v, 6)}${ramNames.has(v) ? ` (${ramNames.get(v)})` : ''}`).join(', ') || '(none)'}`);
console.log(`IY+d refs:        ${[...iyRefs].sort().join(', ') || '(none)'}`);
console.log(`Port I/O:         ${[...ports].sort().join(', ') || '(none)'}`);

process.exit(0);