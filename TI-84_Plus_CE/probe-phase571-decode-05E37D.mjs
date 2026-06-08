/**
 * probe-phase571-decode-05E37D.mjs
 * Decode 0x05E37D — Preceding Function to Token Byte Fetcher (14 bytes max)
 * Loads D0243D and D02440, compares them, falls through into 0x05E38B on NZ.
 * 0x05E38B = token byte fetcher (19B, decoded session 570).
 */

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const IY_BASE = 0xD00080;

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

function relTarget(pc, size, disp) {
  return (pc + size + s8(disp)) & 0xFFFFFF;
}

function inRam(addr) {
  return addr >= 0xD00000 && addr <= 0xD3FFFF;
}

// ---------- Inline eZ80 ADL decoder ----------
const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
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

  if ((op & 0xC7) === 0xC0) return { size: 1, mnemonic: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC7) return { size: 1, mnemonic: `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xCF) === 0xC5) return { size: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { size: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };

  if (op === 0xC3) return { size: 4, mnemonic: `JP ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC2) return { size: 4, mnemonic: `JP ${cc[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0xCD) return { size: 4, mnemonic: `CALL ${hex(u24(pc + 1), 6)}` };
  if ((op & 0xC7) === 0xC4) return { size: 4, mnemonic: `CALL ${cc[(op >> 3) & 7]},${hex(u24(pc + 1), 6)}` };
  if (op === 0x18) return { size: 2, mnemonic: `JR ${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: 2, mnemonic: `JR ${cc[(op >> 3) & 3]},${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };
  if (op === 0x10) return { size: 2, mnemonic: `DJNZ ${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };

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

// ---------- Linear disassembly for exact byte range ----------
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

// ---------- Scan helpers ----------
function scanCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const results = [];

  for (let a = 0; a < rom.length - 3; a++) {
    if (rom[a + 1] === lo && rom[a + 2] === mid && rom[a + 3] === hi) {
      const op = rom[a];
      if (op === 0xCD) results.push({ addr: a, type: 'CALL' });
      else if (op === 0xC3) results.push({ addr: a, type: 'JP' });
      else if ((op & 0xC7) === 0xC4 && op !== 0xCD) results.push({ addr: a, type: `CALL ${cc[(op >> 3) & 7]}` });
      else if ((op & 0xC7) === 0xC2 && op !== 0xC3) results.push({ addr: a, type: `JP ${cc[(op >> 3) & 7]}` });
    }
  }
  return results;
}

function scanRamRefs(ramAddr) {
  const lo = ramAddr & 0xFF;
  const mid = (ramAddr >> 8) & 0xFF;
  const hi = (ramAddr >> 16) & 0xFF;
  const results = [];

  for (let a = 0; a < rom.length - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      for (let back = 1; back <= 4; back++) {
        const candidatePC = a - back;
        if (candidatePC < 0) continue;
        const ins = decode(candidatePC);
        if (ins.mnemonic.includes(hex(ramAddr, 6))) {
          results.push({ instrAddr: candidatePC, operandAddr: a, mnemonic: ins.mnemonic });
          break;
        }
      }
    }
  }
  return results;
}

// ==========================================================
// MAIN
// ==========================================================

const START = 0x05E37D;
const END = 0x05E38B; // exclusive

console.log('PHASE 571 P4: Decode 0x05E37D — Preceding Function to Token Byte Fetcher');
console.log('=========================================================================');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Target range: ${hex(START, 6)} - ${hex(END - 1, 6)} (${END - START} bytes)`);

// ---------- 1. Raw bytes ----------
console.log('\n=== RAW BYTES ===\n');
{
  const bytes = [];
  for (let i = START; i < END; i++) bytes.push(romByte(i).toString(16).toUpperCase().padStart(2, '0'));
  console.log(`  ${bytes.join(' ')}`);
}

// ---------- 2. Linear disassembly ----------
console.log('\n=== LINEAR DISASSEMBLY (0x05E37D - 0x05E38A, 14 bytes) ===\n');
const linearInstructions = disassembleLinear(START, END);
for (const ins of linearInstructions) {
  const bytes = [];
  for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
  const byteStr = bytes.join(' ').padEnd(20);
  console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
}
console.log(`\n  Total instructions: ${linearInstructions.length}, total bytes: ${END - START}`);

// ---------- 3. Extended context ----------
console.log('\n=== EXTENDED CONTEXT (0x05E370 - 0x05E3A0) ===\n');
{
  let pc = 0x05E370;
  const contextEnd = 0x05E3A0;
  while (pc < contextEnd) {
    const ins = decode(pc);
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(pc + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);
    let marker = '';
    if (pc === START) marker = ' <-- START 0x05E37D';
    if (pc === END) marker = ' <-- START 0x05E38B (token byte fetcher)';
    console.log(`  ${hex(pc, 6)}  ${byteStr} ${ins.mnemonic}${marker}`);
    pc += ins.size;
  }
}

// ---------- 4. Classification ----------
console.log('\n=== CLASSIFICATION ===\n');
const ramAccesses = [];
const iyOps = [];
const calls = [];
const jps = [];
const rets = [];
const cps = [];

for (const ins of linearInstructions) {
  const mn = ins.mnemonic;
  if (mn.startsWith('CP ')) cps.push(ins);
  if (mn.startsWith('CALL ')) calls.push(ins);
  if (mn.startsWith('JP ') && !mn.startsWith('JP (')) jps.push(ins);
  if (mn === 'RET' || mn.match(/^RET /)) rets.push(ins);

  const iyMatch = mn.match(/\(IY([+-]0x[0-9A-F]+)\)/);
  if (iyMatch) {
    const offset = parseInt(iyMatch[1].replace('+', ''), 16);
    const addr = (IY_BASE + offset) & 0xFFFFFF;
    iyOps.push({ ...ins, iyOffset: offset, iyAddr: addr });
  }

  const memMatch = mn.match(/\(0x([0-9A-F]{6})\)/);
  if (memMatch) {
    const addr = parseInt(memMatch[1], 16);
    if (inRam(addr)) ramAccesses.push({ ...ins, ramAddr: addr });
  }

  const ldImmMatch = mn.match(/^LD (BC|DE|HL|SP|IX|IY),0x([0-9A-F]{6})$/);
  if (ldImmMatch) {
    const addr = parseInt(ldImmMatch[2], 16);
    if (inRam(addr)) ramAccesses.push({ ...ins, ramAddr: addr });
  }
}

console.log('CP comparisons:');
for (const ins of cps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (cps.length === 0) console.log('  (none)');

console.log('\nCALL targets:');
for (const ins of calls) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (calls.length === 0) console.log('  (none)');

console.log('\nJP targets:');
for (const ins of jps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (jps.length === 0) console.log('  (none)');

console.log('\nRET instructions:');
for (const ins of rets) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (rets.length === 0) console.log('  (none — falls through into 0x05E38B)');

console.log('\nIY-relative operations:');
for (const ins of iyOps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; => ${hex(ins.iyAddr, 6)}`);
if (iyOps.length === 0) console.log('  (none)');

console.log('\nRAM accesses:');
for (const ins of ramAccesses) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);
if (ramAccesses.length === 0) console.log('  (none)');

// ---------- 5. Callers of 0x05E37D ----------
console.log('\n=== CALLERS OF 0x05E37D ===\n');
const callers = scanCallers(0x05E37D);
for (const c of callers) {
  console.log(`  ${hex(c.addr, 6)}  ${c.type} 0x05E37D`);
}
console.log(`\n  Total: ${callers.length} callers`);

// Also check for fall-through callers
console.log('\n=== FALL-THROUGH CHECK (what precedes 0x05E37D?) ===\n');
{
  const preceding = disassembleLinear(0x05E370, START);
  for (const ins of preceding) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
  const lastPre = preceding[preceding.length - 1];
  if (lastPre) {
    const mn = lastPre.mnemonic;
    const fallsThrough = !(mn === 'RET' || mn.startsWith('JP ') || mn.startsWith('JR '));
    console.log(`\n  Last instruction before 0x05E37D: ${mn}`);
    console.log(`  Falls through: ${fallsThrough ? 'YES' : 'NO — 0x05E37D is a clean entry point'}`);
  }
}

// ---------- 6. Cross-reference D0243D ----------
console.log('\n=== CROSS-REFERENCE: D0243D ===\n');
const refsD0243D = scanRamRefs(0xD0243D);
console.log(`  Total references found: ${refsD0243D.length}`);
for (const ref of refsD0243D) {
  console.log(`  ${hex(ref.instrAddr, 6)}  ${ref.mnemonic}`);
}

// ---------- 7. Cross-reference D02440 ----------
console.log('\n=== CROSS-REFERENCE: D02440 ===\n');
const refsD02440 = scanRamRefs(0xD02440);
console.log(`  Total references found: ${refsD02440.length}`);
for (const ref of refsD02440) {
  console.log(`  ${hex(ref.instrAddr, 6)}  ${ref.mnemonic}`);
}

// ---------- 8. Neighbor RAM cross-refs ----------
console.log('\n=== CROSS-REFERENCE: D0243A (edit cursor, session 570) ===\n');
const refsD0243A = scanRamRefs(0xD0243A);
console.log(`  Total references found: ${refsD0243A.length}`);
for (const ref of refsD0243A) {
  console.log(`  ${hex(ref.instrAddr, 6)}  ${ref.mnemonic}`);
}

console.log('\n=== CROSS-REFERENCE: D02437 (boundary, session 570) ===\n');
const refsD02437 = scanRamRefs(0xD02437);
console.log(`  Total references found: ${refsD02437.length}`);
for (const ref of refsD02437) {
  console.log(`  ${hex(ref.instrAddr, 6)}  ${ref.mnemonic}`);
}

// ---------- 9. Data references ----------
console.log('\n=== DATA REFERENCES TO 0x05E37D (non-CALL/JP) ===\n');
{
  const lo = 0x7D, mid = 0xE3, hi = 0x05;
  let count = 0;
  for (let a = 0; a < rom.length - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      const isCaller = callers.some(c => c.addr + 1 === a);
      if (!isCaller) {
        console.log(`  ${hex(a, 6)}  (bytes: ${hex(rom[a > 0 ? a-1 : 0], 2)} ${hex(lo)} ${hex(mid)} ${hex(hi)} ${hex(rom[a+3], 2)})`);
        count++;
      }
    }
  }
  console.log(`  Total non-CALL/JP data references: ${count}`);
}

// ---------- 10. Z-PATH ANALYSIS ----------
console.log('\n=== Z-PATH ANALYSIS ===\n');
for (const ins of linearInstructions) {
  const mn = ins.mnemonic;
  if (mn.match(/^RET Z/)) console.log(`  RET Z at ${hex(ins.addr, 6)} — Z path returns early`);
  if (mn.match(/^JP Z/)) console.log(`  JP Z at ${hex(ins.addr, 6)} — Z path jumps elsewhere`);
  if (mn.match(/^JR Z/)) console.log(`  JR Z at ${hex(ins.addr, 6)} — Z path branches`);
  if (mn.match(/^RET NZ/)) console.log(`  RET NZ at ${hex(ins.addr, 6)} — NZ path returns early`);
}

// Check for SBC/OR patterns
console.log('\n=== COMPARISON PATTERN ANALYSIS ===\n');
for (const ins of linearInstructions) {
  const mn = ins.mnemonic;
  if (mn.includes('SBC')) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  (comparison via subtraction)`);
  if (mn === 'OR A' || mn === 'OR A,A' || mn.match(/^OR 0x/)) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  (clear carry for SBC)`);
  if (mn === 'XOR A') console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  (clear A + flags)`);
}

// ---------- 11. Structured summary ----------
console.log('\n=== STRUCTURED SUMMARY ===\n');
console.log(`Function: 0x05E37D`);
console.log(`Size: ${END - START} bytes (0x05E37D - 0x05E38A inclusive)`);
console.log(`Falls through into: 0x05E38B (token byte fetcher)`);
console.log(`Instructions:`);
for (const ins of linearInstructions) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
}
console.log(`Callers of 0x05E37D: ${callers.length}`);
for (const c of callers) console.log(`  ${hex(c.addr, 6)}  ${c.type}`);
console.log(`D0243D refs in ROM: ${refsD0243D.length}`);
console.log(`D02440 refs in ROM: ${refsD02440.length}`);
console.log(`D0243A refs in ROM (edit cursor): ${refsD0243A.length}`);
console.log(`D02437 refs in ROM (boundary): ${refsD02437.length}`);

console.log('\nDone.');
process.exit(0);
