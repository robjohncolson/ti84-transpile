/**
 * probe-phase571-map-scroll-buffers.mjs
 * Map RAM addresses D031F6 and D07396 — scroll-related buffers.
 * Carried from session 561. Used by scroll module (0x05AD area),
 * scroll setup/fill (0x0A2802, 250B), large scroll handler (0x0A2947, ~150B).
 *
 * Scans full ROM for all references to these addresses and nearby bytes,
 * decodes surrounding eZ80 instructions, classifies R/W/pointer access.
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
const cc_names = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
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

function decodeDdCb(pc) {
  const d = s8(romByte(pc + 2));
  const op = romByte(pc + 3);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mem = `(IX${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
  return { size: 4, mnemonic };
}

function decodeFdCb(pc) {
  const d = s8(romByte(pc + 2));
  const op = romByte(pc + 3);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mem = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
  return { size: 4, mnemonic };
}

function decodeDd(pc) {
  const op = romByte(pc + 1);
  if (op === 0xCB) return decodeDdCb(pc);
  const d = s8(romByte(pc + 2));
  const ixMem = `(IX${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;

  if (op === 0x21) return { size: 4, mnemonic: `LD IX,${hex(u24(pc + 2), 6)}` };
  if (op === 0x22) return { size: 4, mnemonic: `LD (${hex(u24(pc + 2), 6)}),IX` };
  if (op === 0x2A) return { size: 4, mnemonic: `LD IX,(${hex(u24(pc + 2), 6)})` };
  if (op === 0xE1) return { size: 2, mnemonic: 'POP IX' };
  if (op === 0xE5) return { size: 2, mnemonic: 'PUSH IX' };
  if (op === 0xE9) return { size: 2, mnemonic: 'JP (IX)' };
  if (op === 0xF9) return { size: 2, mnemonic: 'LD SP,IX' };
  if (op === 0x23) return { size: 2, mnemonic: 'INC IX' };
  if (op === 0x2B) return { size: 2, mnemonic: 'DEC IX' };
  if (op === 0x34) return { size: 3, mnemonic: `INC ${ixMem}` };
  if (op === 0x35) return { size: 3, mnemonic: `DEC ${ixMem}` };
  if (op === 0x36) return { size: 4, mnemonic: `LD ${ixMem},${hex(romByte(pc + 3), 2)}` };
  if ((op & 0xCF) === 0x09) return { size: 2, mnemonic: `ADD IX,${rp[(op >> 4) & 3]}` };

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return { size: 3, mnemonic: `LD ${regs8[(op >> 3) & 7]},${ixMem}` };
  if (loadTo.includes(op)) return { size: 3, mnemonic: `LD ${ixMem},${regs8[op & 7]}` };
  if (aluFrom.includes(op)) return { size: 3, mnemonic: `${alu[(op >> 3) & 7]} ${ixMem}` };

  return { size: 2, mnemonic: `DD ${hex(op, 2)}` };
}

function decodeFd(pc) {
  const op = romByte(pc + 1);
  if (op === 0xCB) return decodeFdCb(pc);
  const d = s8(romByte(pc + 2));
  const iyMem = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;

  if (op === 0x21) return { size: 4, mnemonic: `LD IY,${hex(u24(pc + 2), 6)}` };
  if (op === 0x22) return { size: 4, mnemonic: `LD (${hex(u24(pc + 2), 6)}),IY` };
  if (op === 0x2A) return { size: 4, mnemonic: `LD IY,(${hex(u24(pc + 2), 6)})` };
  if (op === 0xE1) return { size: 2, mnemonic: 'POP IY' };
  if (op === 0xE5) return { size: 2, mnemonic: 'PUSH IY' };
  if (op === 0xE9) return { size: 2, mnemonic: 'JP (IY)' };
  if (op === 0xF9) return { size: 2, mnemonic: 'LD SP,IY' };
  if (op === 0x23) return { size: 2, mnemonic: 'INC IY' };
  if (op === 0x2B) return { size: 2, mnemonic: 'DEC IY' };
  if (op === 0x34) return { size: 3, mnemonic: `INC ${iyMem}` };
  if (op === 0x35) return { size: 3, mnemonic: `DEC ${iyMem}` };
  if (op === 0x36) return { size: 4, mnemonic: `LD ${iyMem},${hex(romByte(pc + 3), 2)}` };
  if ((op & 0xCF) === 0x09) return { size: 2, mnemonic: `ADD IY,${rp[(op >> 4) & 3]}` };

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return { size: 3, mnemonic: `LD ${regs8[(op >> 3) & 7]},${iyMem}` };
  if (loadTo.includes(op)) return { size: 3, mnemonic: `LD ${iyMem},${regs8[op & 7]}` };
  if (aluFrom.includes(op)) return { size: 3, mnemonic: `${alu[(op >> 3) & 7]} ${iyMem}` };

  return { size: 2, mnemonic: `FD ${hex(op, 2)}` };
}

function decode(pc) {
  const op = romByte(pc);

  if (op === 0xDD) return decodeDd(pc);
  if (op === 0xFD) return decodeFd(pc);
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
  if (op === 0x08) return { size: 1, mnemonic: 'EX AF,AF\'' };

  if ((op & 0xC7) === 0xC0) return { size: 1, mnemonic: `RET ${cc_names[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC7) return { size: 1, mnemonic: `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xCF) === 0xC5) return { size: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { size: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };

  if (op === 0xC3) return { size: 4, mnemonic: `JP ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC2) return { size: 4, mnemonic: `JP ${cc_names[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0xCD) return { size: 4, mnemonic: `CALL ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC4) return { size: 4, mnemonic: `CALL ${cc_names[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0x18) return { size: 2, mnemonic: `JR ${hex((pc + 2 + s8(romByte(pc + 1))) & 0xFFFFFF, 6)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: 2, mnemonic: `JR ${cc_names[(op >> 3) & 3]},${hex((pc + 2 + s8(romByte(pc + 1))) & 0xFFFFFF, 6)}` };
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
  if (op in immAlu) return { size: 2, mnemonic: `${immAlu[op]} ${hex(romByte(pc + 1), 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

// ---------- Linear disassembly ----------
function disassembleLinear(start, end) {
  const instructions = [];
  let pc = start;
  while (pc < end) {
    const ins = decode(pc);
    instructions.push({ addr: pc, ...ins });
    pc += ins.size;
  }
  return instructions;
}

// ---------- Search for 3-byte LE address pattern in ROM ----------
function findAddrRefs(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const refs = [];
  // Only scan code area (ROM < 0x400000)
  const limit = Math.min(rom.length, 0x400000);
  for (let a = 0; a < limit - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      refs.push(a);
    }
  }
  return refs;
}

// ---------- Classify how an address is used ----------
function classifyRef(byteOffset, targetAddr) {
  // Try decoding from several positions before the match
  for (let back = 6; back >= 0; back--) {
    const tryPC = byteOffset - back;
    if (tryPC < 0) continue;
    const ins = decode(tryPC);
    // Check if the instruction spans the byte offset
    if (tryPC + ins.size > byteOffset && ins.mnemonic.includes(hex(targetAddr, 6))) {
      const mn = ins.mnemonic;
      let rw = 'PTR';
      if (mn.match(/^LD [A-Z]+,\(0x/)) rw = 'READ';
      else if (mn.match(/^LD \(0x[0-9A-F]+\),[A-Z]/)) rw = 'WRITE';
      else if (mn.match(/^LD (BC|DE|HL|SP|IX|IY),0x/)) rw = 'PTR_LOAD';
      else if (mn.startsWith('CALL ') || mn.startsWith('JP ')) rw = 'BRANCH';
      return { pc: tryPC, ins, rw };
    }
  }
  return null;
}

// ---------- Main ----------
console.log('PHASE 571 P2: Map D031F6 / D07396 Scroll Buffers');
console.log('====================================================');
console.log(`ROM size: ${rom.length} bytes\n`);

const targets = [
  { addr: 0xD031F6, name: 'D031F6 (scroll buffer 1)' },
  { addr: 0xD07396, name: 'D07396 (scroll buffer 2)' },
];

const allResults = [];

for (const target of targets) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SCANNING: ${target.name}`);
  console.log(`Byte pattern: ${hex(target.addr & 0xFF)}, ${hex((target.addr >> 8) & 0xFF)}, ${hex((target.addr >> 16) & 0xFF)}`);
  console.log(`${'='.repeat(70)}\n`);

  const refs = findAddrRefs(target.addr);
  console.log(`Found ${refs.length} byte-pattern matches in code area\n`);

  const classified = [];
  for (const byteOff of refs) {
    const result = classifyRef(byteOff, target.addr);
    if (result) {
      classified.push({ byteOff, ...result });
    } else {
      classified.push({
        byteOff,
        pc: byteOff,
        ins: { mnemonic: `(undecodable at ${hex(byteOff, 6)})`, size: 3 },
        rw: '???'
      });
    }
  }

  // Print table
  console.log('Address    | RAM Target  | Instruction                              | R/W');
  console.log('-'.repeat(90));
  for (const r of classified) {
    const line = `${hex(r.pc, 6).padEnd(10)} | ${hex(target.addr, 6).padEnd(11)} | ${r.ins.mnemonic.padEnd(40)} | ${r.rw}`;
    console.log(line);
    allResults.push({ pc: r.pc, target: target.addr, targetName: target.name, mnemonic: r.ins.mnemonic, rw: r.rw });
  }
  console.log(`\nTotal code references: ${classified.length}`);

  // Disassembly context around each reference
  console.log(`\n--- Disassembly context for each reference ---\n`);
  for (const r of classified) {
    if (r.rw === '???') continue;
    console.log(`  Context around ${hex(r.pc, 6)} (${r.rw}: ${r.ins.mnemonic}):`);
    const contextStart = Math.max(0, r.pc - 20);
    const contextEnd = Math.min(rom.length, r.pc + 30);
    const contextIns = disassembleLinear(contextStart, contextEnd);
    for (const ci of contextIns) {
      const bytes = [];
      for (let i = 0; i < ci.size; i++) bytes.push(romByte(ci.addr + i).toString(16).toUpperCase().padStart(2, '0'));
      const byteStr = bytes.join(' ').padEnd(16);
      const marker = ci.addr === r.pc ? ' <--' : '';
      console.log(`    ${hex(ci.addr, 6)}  ${byteStr} ${ci.mnemonic}${marker}`);
    }
    console.log('');
  }
}

// ---------- Nearby address scan for buffer extent ----------
console.log('\n' + '='.repeat(70));
console.log('NEARBY ADDRESS SCAN (buffer size detection)');
console.log('='.repeat(70) + '\n');

for (const base of [0xD031F6, 0xD07396]) {
  console.log(`Buffer starting at ${hex(base, 6)}:`);
  console.log('Offset | Address  | Code refs');
  console.log('-'.repeat(60));
  let lastHit = 0;
  for (let off = -4; off <= 48; off++) {
    const addr = base + off;
    const refs = findAddrRefs(addr);
    if (refs.length > 0) {
      console.log(`${(off >= 0 ? '+' : '') + off.toString().padStart(3)}   | ${hex(addr, 6)} | ${refs.length} refs at: ${refs.map(r => hex(r, 6)).join(', ')}`);
      if (off >= 0) lastHit = off;
    }
  }
  console.log(`  => Last referenced offset: +${lastHit} => minimum buffer size: ${lastHit + 1} bytes`);
  console.log('');
}

// ---------- Scroll function disassembly ----------
console.log('\n' + '='.repeat(70));
console.log('SCROLL FUNCTION DISASSEMBLY');
console.log('='.repeat(70));

const scrollFunctions = [
  { start: 0x0A2802, name: 'Scroll Setup+Fill', maxBytes: 260 },
  { start: 0x0A2947, name: 'Large Scroll Handler', maxBytes: 200 },
];

for (const func of scrollFunctions) {
  console.log(`\n--- ${func.name} (${hex(func.start, 6)}, up to ${func.maxBytes}B) ---\n`);
  const end = func.start + func.maxBytes;
  const instructions = disassembleLinear(func.start, end);
  let retCount = 0;
  for (const ins of instructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);

    // Mark references to our target addresses and nearby
    let marker = '';
    for (const t of [0xD031F6, 0xD07396]) {
      for (let off = 0; off <= 16; off++) {
        const tAddr = t + off;
        if (ins.mnemonic.includes(hex(tAddr, 6))) {
          marker = ` <-- ${hex(t, 6)}${off > 0 ? '+' + off : ''}`;
        }
      }
    }

    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}${marker}`);

    if (ins.mnemonic === 'RET') {
      retCount++;
      if (retCount >= 2) break;
    }
  }
}

// ---------- Summary ----------
console.log('\n\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70) + '\n');

for (const target of targets) {
  const refs = allResults.filter(r => r.target === target.addr);
  console.log(`${target.name}:`);
  console.log(`  Total references: ${refs.length}`);
  const byType = {};
  for (const r of refs) {
    byType[r.rw] = (byType[r.rw] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`    ${type}: ${count}`);
  }
  const funcs = [...new Set(refs.map(r => hex(r.pc, 6)))].sort();
  console.log(`  At ROM addresses: ${funcs.join(', ')}`);
  console.log('');
}

console.log('\nDone.');
process.exit(0);
