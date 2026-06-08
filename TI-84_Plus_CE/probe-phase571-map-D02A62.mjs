/**
 * probe-phase571-map-D02A62.mjs
 * Map the RAM range D02A62-D02A75 (20 bytes) — pixel renderer workspace.
 * Scans the entire ROM for 3-byte LE references to each address in the range,
 * decodes surrounding instructions, and classifies read/write/load-pointer.
 */

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function romByte(addr) {
  if (addr < 0 || addr >= rom.length) return 0;
  return rom[addr];
}

function u24(addr) {
  return romByte(addr) | (romByte(addr + 1) << 8) | (romByte(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

// ---------- Inline eZ80 ADL decoder ----------
const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCb(pc) {
  const op = romByte(pc + 1);
  const reg = regs8[op & 7];
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${reg}` :
    group === 1 ? `BIT ${bit},${reg}` :
    group === 2 ? `RES ${bit},${reg}` :
    `SET ${bit},${reg}`;
  return { size: 2, mnemonic };
}

function decodeIxIyCb(pc, prefix) {
  const d = s8(romByte(pc + 2));
  const op = romByte(pc + 3);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const sign = d < 0 ? '-' : '+';
  const mem = `(${prefix}${sign}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
  return { size: 4, mnemonic };
}

function decodeIxIy(pc, prefix) {
  const op = romByte(pc + 1);
  if (op === 0xCB) return decodeIxIyCb(pc, prefix);
  const d = s8(romByte(pc + 2));
  const sign = d < 0 ? '-' : '+';
  const mem = `(${prefix}${sign}${hex(Math.abs(d), 2)})`;

  if (op === 0x21) return { size: 4, mnemonic: `LD ${prefix},${hex(u24(pc + 2), 6)}` };
  if (op === 0x22) return { size: 4, mnemonic: `LD (${hex(u24(pc + 2), 6)}),${prefix}` };
  if (op === 0x2A) return { size: 4, mnemonic: `LD ${prefix},(${hex(u24(pc + 2), 6)})` };
  if (op === 0xE1) return { size: 2, mnemonic: `POP ${prefix}` };
  if (op === 0xE5) return { size: 2, mnemonic: `PUSH ${prefix}` };
  if (op === 0xE9) return { size: 2, mnemonic: `JP (${prefix})` };
  if (op === 0xF9) return { size: 2, mnemonic: `LD SP,${prefix}` };
  if (op === 0x23) return { size: 2, mnemonic: `INC ${prefix}` };
  if (op === 0x2B) return { size: 2, mnemonic: `DEC ${prefix}` };
  if (op === 0x34) return { size: 3, mnemonic: `INC ${mem}` };
  if (op === 0x35) return { size: 3, mnemonic: `DEC ${mem}` };
  if (op === 0x36) return { size: 4, mnemonic: `LD ${mem},${hex(romByte(pc + 3), 2)}` };
  if ((op & 0xCF) === 0x09) return { size: 2, mnemonic: `ADD ${prefix},${rp[(op >> 4) & 3]}` };

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return { size: 3, mnemonic: `LD ${regs8[(op >> 3) & 7]},${mem}` };
  if (loadTo.includes(op)) return { size: 3, mnemonic: `LD ${mem},${regs8[op & 7]}` };
  if (aluFrom.includes(op)) return { size: 3, mnemonic: `${alu[(op >> 3) & 7]} ${mem}` };

  return { size: 2, mnemonic: `${prefix === 'IX' ? 'DD' : 'FD'} ${hex(op, 2)}` };
}

function decode(pc) {
  const op = romByte(pc);

  if (op === 0xDD) return decodeIxIy(pc, 'IX');
  if (op === 0xFD) return decodeIxIy(pc, 'IY');
  if (op === 0xCB) return decodeCb(pc);
  if (op === 0x00) return { size: 1, mnemonic: 'NOP' };
  if (op === 0x76) return { size: 1, mnemonic: 'HALT' };
  if (op === 0xF3) return { size: 1, mnemonic: 'DI' };
  if (op === 0xFB) return { size: 1, mnemonic: 'EI' };
  if (op === 0xC9) return { size: 1, mnemonic: 'RET' };
  if (op === 0xD9) return { size: 1, mnemonic: 'EXX' };
  if (op === 0xE3) return { size: 1, mnemonic: 'EX (SP),HL' };
  if (op === 0xEB) return { size: 1, mnemonic: 'EX DE,HL' };
  if (op === 0xF9) return { size: 1, mnemonic: 'LD SP,HL' };
  if (op === 0xE9) return { size: 1, mnemonic: 'JP (HL)' };
  if (op === 0x07) return { size: 1, mnemonic: 'RLCA' };
  if (op === 0x0F) return { size: 1, mnemonic: 'RRCA' };
  if (op === 0x17) return { size: 1, mnemonic: 'RLA' };
  if (op === 0x1F) return { size: 1, mnemonic: 'RRA' };
  if (op === 0x27) return { size: 1, mnemonic: 'DAA' };
  if (op === 0x2F) return { size: 1, mnemonic: 'CPL' };
  if (op === 0x37) return { size: 1, mnemonic: 'SCF' };
  if (op === 0x3F) return { size: 1, mnemonic: 'CCF' };
  if (op === 0x08) return { size: 1, mnemonic: "EX AF,AF'" };

  if ((op & 0xC7) === 0xC0) return { size: 1, mnemonic: `RET ${ccNames[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC7) return { size: 1, mnemonic: `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xCF) === 0xC5) return { size: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { size: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };

  if (op === 0xC3) return { size: 4, mnemonic: `JP ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC2) return { size: 4, mnemonic: `JP ${ccNames[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0xCD) return { size: 4, mnemonic: `CALL ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC4) return { size: 4, mnemonic: `CALL ${ccNames[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0x18) return { size: 2, mnemonic: `JR ${hex((pc + 2 + s8(romByte(pc + 1))) & 0xFFFFFF, 6)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: 2, mnemonic: `JR ${ccNames[(op >> 3) & 3]},${hex((pc + 2 + s8(romByte(pc + 1))) & 0xFFFFFF, 6)}` };
  if (op === 0x10) return { size: 2, mnemonic: `DJNZ ${hex((pc + 2 + s8(romByte(pc + 1))) & 0xFFFFFF, 6)}` };

  if (op === 0x3A) return { size: 4, mnemonic: `LD A,(${hex(u24(pc + 1), 6)})` };
  if (op === 0x32) return { size: 4, mnemonic: `LD (${hex(u24(pc + 1), 6)}),A` };
  if (op === 0x2A) return { size: 4, mnemonic: `LD HL,(${hex(u24(pc + 1), 6)})` };
  if (op === 0x22) return { size: 4, mnemonic: `LD (${hex(u24(pc + 1), 6)}),HL` };

  if (op === 0x02) return { size: 1, mnemonic: 'LD (BC),A' };
  if (op === 0x0A) return { size: 1, mnemonic: 'LD A,(BC)' };
  if (op === 0x12) return { size: 1, mnemonic: 'LD (DE),A' };
  if (op === 0x1A) return { size: 1, mnemonic: 'LD A,(DE)' };

  if (op === 0xED) {
    const op2 = romByte(pc + 1);
    if (op2 === 0xB0) return { size: 2, mnemonic: 'LDIR' };
    if (op2 === 0xB8) return { size: 2, mnemonic: 'LDDR' };
    if (op2 === 0xB1) return { size: 2, mnemonic: 'CPIR' };
    if (op2 === 0xB9) return { size: 2, mnemonic: 'CPDR' };
    if (op2 === 0xA0) return { size: 2, mnemonic: 'LDI' };
    if (op2 === 0xA8) return { size: 2, mnemonic: 'LDD' };
    if (op2 === 0xA1) return { size: 2, mnemonic: 'CPI' };
    if (op2 === 0xA9) return { size: 2, mnemonic: 'CPD' };
    if (op2 === 0x44) return { size: 2, mnemonic: 'NEG' };
    if (op2 === 0x4D) return { size: 2, mnemonic: 'RETI' };
    if (op2 === 0x45) return { size: 2, mnemonic: 'RETN' };
    if (op2 === 0x46) return { size: 2, mnemonic: 'IM 0' };
    if (op2 === 0x56) return { size: 2, mnemonic: 'IM 1' };
    if (op2 === 0x5E) return { size: 2, mnemonic: 'IM 2' };
    if (op2 === 0x47) return { size: 2, mnemonic: 'LD I,A' };
    if (op2 === 0x4F) return { size: 2, mnemonic: 'LD R,A' };
    if (op2 === 0x57) return { size: 2, mnemonic: 'LD A,I' };
    if (op2 === 0x5F) return { size: 2, mnemonic: 'LD A,R' };
    if (op2 === 0x67) return { size: 2, mnemonic: 'RRD' };
    if (op2 === 0x6F) return { size: 2, mnemonic: 'RLD' };
    if ([0x4B, 0x5B, 0x6B, 0x7B].includes(op2)) return { size: 5, mnemonic: `LD ${rp[(op2 >> 4) & 3]},(${hex(u24(pc + 2), 6)})` };
    if ([0x43, 0x53, 0x63, 0x73].includes(op2)) return { size: 5, mnemonic: `LD (${hex(u24(pc + 2), 6)}),${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xCF) === 0x42) return { size: 2, mnemonic: `SBC HL,${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xCF) === 0x4A) return { size: 2, mnemonic: `ADC HL,${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xC7) === 0x40) return { size: 2, mnemonic: `IN ${regs8[(op2 >> 3) & 7]},(C)` };
    if ((op2 & 0xC7) === 0x41) return { size: 2, mnemonic: `OUT (C),${regs8[(op2 >> 3) & 7]}` };
    return { size: 2, mnemonic: `ED ${hex(op2, 2)}` };
  }

  if (op === 0xFE) return { size: 2, mnemonic: `CP ${hex(romByte(pc + 1), 2)}` };
  if ((op & 0xF8) === 0xB8) return { size: 1, mnemonic: `CP ${regs8[op & 7]}` };

  if ((op & 0xC0) === 0x40) return { size: 1, mnemonic: `LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}` };
  if ((op & 0xC0) === 0x80) return { size: 1, mnemonic: `${alu[(op >> 3) & 7]} ${regs8[op & 7]}` };
  if ((op & 0xC7) === 0x04) return { size: 1, mnemonic: `INC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { size: 1, mnemonic: `DEC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { size: 2, mnemonic: `LD ${regs8[(op >> 3) & 7]},${hex(romByte(pc + 1), 2)}` };
  if ((op & 0xCF) === 0x01) return { size: 4, mnemonic: `LD ${rp[(op >> 4) & 3]},${hex(u24(pc + 1), 6)}` };
  if ((op & 0xCF) === 0x03) return { size: 1, mnemonic: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { size: 1, mnemonic: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { size: 1, mnemonic: `ADD HL,${rp[(op >> 4) & 3]}` };

  if (op === 0xD3) return { size: 2, mnemonic: `OUT (${hex(romByte(pc + 1), 2)}),A` };
  if (op === 0xDB) return { size: 2, mnemonic: `IN A,(${hex(romByte(pc + 1), 2)})` };

  const immAlu = {
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR',
  };
  if (immAlu[op]) return { size: 2, mnemonic: `${immAlu[op]} ${hex(romByte(pc + 1), 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

// ---------- Known functions ----------
const KNOWN_FUNCTIONS = [
  { start: 0x0A1799, end: 0x0A1799 + 220, name: 'pixel_loop (sess.560)' },
  { start: 0x0A1F48, end: 0x0A1F48 + 234, name: 'y_advance_complex (sess.561)' },
  { start: 0x0A2400, end: 0x0A2400 + 399, name: 'render_setup_glyph_param (sess.564)' },
  { start: 0x0A2537, end: 0x0A2537 + 88, name: 'row_loop_top_first_col_blit (sess.566)' },
  { start: 0x0A258F, end: 0x0A258F + 262, name: 'complete_column_blit (sess.567)' },
  { start: 0x0A2802, end: 0x0A2802 + 250, name: 'scroll_setup_fill (sess.562)' },
];

function findContainingFunction(addr) {
  for (const fn of KNOWN_FUNCTIONS) {
    if (addr >= fn.start && addr < fn.end) {
      return fn.name;
    }
  }
  // Return region hint
  return `unknown (~${hex(addr & 0xFFFFF0, 6)})`;
}

// ---------- Classify access ----------
function classifyAccess(mnemonic, targetAddr) {
  const h = hex(targetAddr, 6);

  // Direct memory reads: LD reg,(addr)
  if (mnemonic.includes(`,(${h})`)) return 'READ';
  // Direct memory writes: LD (addr),reg
  if (mnemonic.startsWith(`LD (${h}),`)) return 'WRITE';
  // Pointer loads: LD rr,addr (no parens)
  if (mnemonic.match(new RegExp(`^LD (BC|DE|HL|SP|IX|IY),${h}$`))) return 'LOAD-PTR';

  return 'UNKNOWN';
}

// ---------- Main scan ----------
console.log('PHASE 571 P1: Map D02A62-D02A75 -- Pixel Renderer Workspace');
console.log('=============================================================');
console.log('ROM size: ' + rom.length + ' bytes');

const TARGET_START = 0xD02A62;
const TARGET_END = 0xD02A75;
const results = [];

for (let target = TARGET_START; target <= TARGET_END; target++) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;

  for (let a = 0; a < rom.length - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      // Found 3-byte LE match at offset a. Find containing instruction.
      let foundIns = null;
      let foundInsAddr = null;

      for (let tryStart = Math.max(0, a - 5); tryStart <= a; tryStart++) {
        const ins = decode(tryStart);
        if (tryStart + ins.size > a + 2) {
          const addrHex = hex(target, 6);
          if (ins.mnemonic.includes(addrHex)) {
            foundIns = ins;
            foundInsAddr = tryStart;
            break;
          }
        }
      }

      if (foundIns) {
        const access = classifyAccess(foundIns.mnemonic, target);
        const fn = findContainingFunction(foundInsAddr);
        results.push({
          ramAddr: target,
          romAddr: foundInsAddr,
          instruction: foundIns.mnemonic,
          access: access,
          containingFn: fn,
          instrSize: foundIns.size,
        });
      }
    }
  }
}

// ---------- Print results ----------
console.log('');
console.log('Found ' + results.length + ' references to D02A62-D02A75 in ROM:');
console.log('');

results.sort((a, b) => a.ramAddr - b.ramAddr || a.romAddr - b.romAddr);

console.log('RAM Addr  | ROM Addr  | Instruction                              | Access    | Containing Function');
console.log('----------+-----------+------------------------------------------+-----------+--------------------------------------------');
for (const r of results) {
  const ramStr = hex(r.ramAddr, 6).padEnd(9);
  const romStr = hex(r.romAddr, 6).padEnd(9);
  const insStr = r.instruction.padEnd(40);
  const accStr = r.access.padEnd(9);
  console.log(ramStr + ' | ' + romStr + ' | ' + insStr + ' | ' + accStr + ' | ' + r.containingFn);
}

// ---------- Per-byte summary ----------
console.log('');
console.log('');
console.log('=== PER-BYTE SUMMARY ===');
console.log('');

for (let target = TARGET_START; target <= TARGET_END; target++) {
  const offset = target - TARGET_START;
  const refs = results.filter(r => r.ramAddr === target);
  console.log(hex(target, 6) + ' (offset +' + offset + '):');
  if (refs.length === 0) {
    console.log('  No direct references found');
  } else {
    const reads = refs.filter(r => r.access === 'READ').length;
    const writes = refs.filter(r => r.access === 'WRITE').length;
    const ptrs = refs.filter(r => r.access === 'LOAD-PTR').length;
    const unknowns = refs.filter(r => r.access === 'UNKNOWN').length;
    console.log('  ' + refs.length + ' refs: ' + reads + ' READ, ' + writes + ' WRITE, ' + ptrs + ' LOAD-PTR, ' + unknowns + ' UNKNOWN');
    for (const r of refs) {
      console.log('    ' + hex(r.romAddr, 6) + ': ' + r.instruction + ' [' + r.access + '] in ' + r.containingFn);
    }
  }
}

// ---------- Per-function summary ----------
console.log('');
console.log('');
console.log('=== PER-FUNCTION SUMMARY ===');
console.log('');

const byFunction = {};
for (const r of results) {
  const key = r.containingFn;
  if (!byFunction[key]) byFunction[key] = [];
  byFunction[key].push(r);
}

for (const [fn, refs] of Object.entries(byFunction).sort()) {
  console.log(fn + ':');
  const addrs = [...new Set(refs.map(r => hex(r.ramAddr, 6)))].sort();
  console.log('  Addresses used: ' + addrs.join(', '));
  for (const r of refs) {
    console.log('    ' + hex(r.romAddr, 6) + ': ' + r.instruction + ' [' + r.access + ']  -> ' + hex(r.ramAddr, 6));
  }
  console.log('');
}

// ---------- Context disassembly around each reference ----------
console.log('');
console.log('=== CONTEXT DISASSEMBLY (around each reference) ===');
console.log('');

const uniqueRomAddrs = [...new Set(results.map(r => r.romAddr))].sort((a, b) => a - b);
for (const romAddr of uniqueRomAddrs) {
  const ref = results.find(r => r.romAddr === romAddr);
  console.log('--- ' + hex(romAddr, 6) + ': ' + ref.instruction + ' -> ' + hex(ref.ramAddr, 6) + ' [' + ref.access + '] ---');

  const contextStart = Math.max(0, romAddr - 12);
  let pc = contextStart;
  const contextInstructions = [];
  while (pc < romAddr + ref.instrSize + 12 && pc < rom.length) {
    const ins = decode(pc);
    contextInstructions.push({ addr: pc, size: ins.size, mnemonic: ins.mnemonic });
    pc += ins.size;
    if (contextInstructions.length > 14) break;
  }

  for (const ins of contextInstructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    const marker = ins.addr === romAddr ? ' <-- ***' : '';
    console.log('  ' + hex(ins.addr, 6) + '  ' + byteStr + ' ' + ins.mnemonic + marker);
  }
  console.log('');
}

// ---------- Workspace layout ----------
console.log('');
console.log('=== WORKSPACE LAYOUT ===');
console.log('');

console.log('Byte-by-byte access pattern:');
for (let target = TARGET_START; target <= TARGET_END; target++) {
  const offset = target - TARGET_START;
  const refs = results.filter(r => r.ramAddr === target);
  const reads = refs.filter(r => r.access === 'READ').length;
  const writes = refs.filter(r => r.access === 'WRITE').length;
  const ptrs = refs.filter(r => r.access === 'LOAD-PTR').length;

  let widthNote = '';
  for (const r of refs) {
    if (r.instruction.match(/^LD (HL|BC|DE|SP|IX|IY),\(/) ||
        r.instruction.match(/^LD \(.*\),(HL|BC|DE|SP|IX|IY)$/)) {
      widthNote = ' [24-bit field start]';
    }
    if (r.access === 'LOAD-PTR') {
      widthNote = ' [pointer target]';
    }
  }

  const total = reads + writes + ptrs;
  const bar = total > 0 ? '#'.repeat(Math.min(total, 20)) : '-';
  console.log('  +' + String(offset).padStart(2, '0') + ' ' + hex(target, 6) + ': R:' + reads + ' W:' + writes + ' P:' + ptrs + ' ' + bar + widthNote);
}

// ---------- Summary ----------
console.log('');
console.log('');
console.log('=== SUMMARY STATISTICS ===');
console.log('');
console.log('Total references found: ' + results.length);
console.log('Unique RAM addresses referenced: ' + new Set(results.map(r => r.ramAddr)).size + ' of 20');
console.log('Unique ROM locations: ' + uniqueRomAddrs.length);
console.log('Access breakdown: READ=' + results.filter(r => r.access === 'READ').length +
  ', WRITE=' + results.filter(r => r.access === 'WRITE').length +
  ', LOAD-PTR=' + results.filter(r => r.access === 'LOAD-PTR').length +
  ', UNKNOWN=' + results.filter(r => r.access === 'UNKNOWN').length);

const fns = [...new Set(results.map(r => r.containingFn))].sort();
console.log('');
console.log('Functions touching this workspace (' + fns.length + '):');
for (const fn of fns) {
  const count = results.filter(r => r.containingFn === fn).length;
  console.log('  ' + fn + ': ' + count + ' refs');
}

console.log('');
console.log('Done.');
process.exit(0);
