/**
 * probe-phase572-map-0A1FAB.mjs
 * Decode 0x0A1FAB — Scroll Buffer Swap Function
 * Session 571 identified this as the function that swaps between:
 *   D031F6 (8400B primary scroll shadow buffer, 40B/row x 210 rows)
 *   D07396 (8400B secondary scroll shadow buffer)
 * Uses DI/EI with eZ80 errata workaround (double LD A,I).
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
    // eZ80 LEA instructions
    if (op2 === 0x02) return { size: 3, mnemonic: `LEA BC,IX${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x03) return { size: 3, mnemonic: `LEA BC,IY${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x12) return { size: 3, mnemonic: `LEA DE,IX${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x13) return { size: 3, mnemonic: `LEA DE,IY${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x22) return { size: 3, mnemonic: `LEA HL,IX${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x23) return { size: 3, mnemonic: `LEA HL,IY${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x32) return { size: 3, mnemonic: `LEA IX,IX${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
    if (op2 === 0x33) return { size: 3, mnemonic: `LEA IY,IY${(() => { const d = s8(romByte(pc+2)); return d < 0 ? '-' + hex(-d,2) : '+' + hex(d,2); })()}` };
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

// ---------- Disassemble until unconditional RET ----------
function disassembleUntilRet(start, maxBytes) {
  const instructions = [];
  let pc = start;
  const limit = start + maxBytes;
  while (pc < limit) {
    const ins = decode(pc);
    instructions.push({ addr: pc, ...ins });
    pc += ins.size;
    // Stop after unconditional RET
    if (ins.mnemonic === 'RET') break;
    // Also stop at unconditional JP (tail call / end of function)
    if (ins.mnemonic.match(/^JP 0x/) && !ins.mnemonic.includes(',')) break;
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

// ==========================================================
// MAIN
// ==========================================================

const START = 0x0A1FAB;
const MAX_BYTES = 128; // generous limit; expect ~38 bytes

console.log('PHASE 572: Decode 0x0A1FAB — Scroll Buffer Swap Function');
console.log('==========================================================');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Start: ${hex(START, 6)}`);

// ---------- 1. Raw bytes (first 64 bytes for context) ----------
console.log('\n=== RAW BYTES (first 64 bytes) ===\n');
{
  const bytes = [];
  for (let i = START; i < START + 64; i++) bytes.push(romByte(i).toString(16).toUpperCase().padStart(2, '0'));
  // Print in rows of 16
  for (let row = 0; row < 4; row++) {
    const addr = START + row * 16;
    console.log(`  ${hex(addr, 6)}  ${bytes.slice(row * 16, (row + 1) * 16).join(' ')}`);
  }
}

// ---------- 2. Disassemble until RET ----------
console.log('\n=== DISASSEMBLY (until RET/JP, max 128 bytes) ===\n');
const instructions = disassembleUntilRet(START, MAX_BYTES);
for (const ins of instructions) {
  const bytes = [];
  for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
  const byteStr = bytes.join(' ').padEnd(20);
  // Annotate interesting instructions
  let annotation = '';
  if (ins.mnemonic === 'DI') annotation = '  ; disable interrupts';
  if (ins.mnemonic === 'EI') annotation = '  ; enable interrupts';
  if (ins.mnemonic === 'LD A,I') annotation = '  ; eZ80 errata workaround (double LD A,I)';
  if (ins.mnemonic === 'LDIR') annotation = '  ; block copy';
  if (ins.mnemonic.includes('0xD031F6')) annotation = '  ; PRIMARY scroll buffer (8400B)';
  if (ins.mnemonic.includes('0xD07396')) annotation = '  ; SECONDARY scroll buffer (8400B)';
  if (ins.mnemonic.includes('0xD052C6')) annotation = '  ; THIRD buffer?';
  if (ins.mnemonic === 'EX DE,HL') annotation = '  ; swap src/dst';
  if (ins.mnemonic === 'RET') annotation = '  ; END OF FUNCTION';
  console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}${annotation}`);
}

const funcEnd = instructions[instructions.length - 1];
const funcSize = funcEnd.addr + funcEnd.size - START;
console.log(`\n  Total: ${instructions.length} instructions, ${funcSize} bytes`);

// ---------- 3. Classification ----------
console.log('\n=== CLASSIFICATION ===\n');

const diEiPairs = [];
let lastDI = null;
const ldAI_addrs = [];
const bufferRefs = [];
const blockCopies = [];
const ramAccesses = [];

for (const ins of instructions) {
  const mn = ins.mnemonic;

  if (mn === 'DI') lastDI = ins.addr;
  if (mn === 'EI' && lastDI !== null) {
    diEiPairs.push({ di: lastDI, ei: ins.addr });
    lastDI = null;
  }
  if (mn === 'LD A,I') ldAI_addrs.push(ins.addr);
  if (mn === 'LDIR' || mn === 'LDDR') blockCopies.push(ins);

  // Check for buffer address references
  if (mn.includes('0xD031F6')) bufferRefs.push({ ...ins, buffer: 'PRIMARY D031F6' });
  if (mn.includes('0xD07396')) bufferRefs.push({ ...ins, buffer: 'SECONDARY D07396' });
  if (mn.includes('0xD052C6')) bufferRefs.push({ ...ins, buffer: 'THIRD D052C6' });

  // RAM accesses
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

console.log('DI/EI pairs:');
for (const pair of diEiPairs) console.log(`  DI at ${hex(pair.di, 6)}, EI at ${hex(pair.ei, 6)}`);
if (diEiPairs.length === 0) console.log('  (none)');

console.log('\nLD A,I instructions (eZ80 errata workaround needs 2):');
for (const addr of ldAI_addrs) console.log(`  ${hex(addr, 6)}`);
console.log(`  Count: ${ldAI_addrs.length} ${ldAI_addrs.length === 2 ? '(double LD A,I errata pattern CONFIRMED)' : ''}`);

console.log('\nBuffer address references:');
for (const ref of bufferRefs) console.log(`  ${hex(ref.addr, 6)}  ${ref.mnemonic}  => ${ref.buffer}`);
if (bufferRefs.length === 0) console.log('  (none found directly — check RAM accesses for indirect refs)');

console.log('\nBlock copy instructions:');
for (const ins of blockCopies) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (blockCopies.length === 0) console.log('  (none — may use pointer swap instead of memcpy)');

console.log('\nAll RAM accesses:');
for (const ins of ramAccesses) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);
if (ramAccesses.length === 0) console.log('  (none)');

// ---------- 4. Callers ----------
console.log('\n=== CALLERS OF 0x0A1FAB ===\n');
const callers = scanCallers(0x0A1FAB);
for (const c of callers) {
  console.log(`  ${hex(c.addr, 6)}  ${c.type} 0x0A1FAB`);
}
console.log(`\n  Total: ${callers.length} callers`);

// ---------- 5. Fall-through check ----------
console.log('\n=== FALL-THROUGH CHECK (what precedes 0x0A1FAB?) ===\n');
{
  const preceding = disassembleLinear(START - 16, START);
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
    console.log(`\n  Last instruction before 0x0A1FAB: ${mn}`);
    console.log(`  Falls through: ${fallsThrough ? 'YES' : 'NO — 0x0A1FAB is a clean entry point'}`);
  }
}

// ---------- 6. What follows the function? ----------
console.log('\n=== WHAT FOLLOWS THE FUNCTION? ===\n');
{
  const afterStart = START + funcSize;
  const afterInstructions = disassembleLinear(afterStart, afterStart + 32);
  for (const ins of afterInstructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
}

// ---------- 7. Structured summary ----------
console.log('\n=== STRUCTURED SUMMARY ===\n');
console.log(`Function: 0x0A1FAB — Scroll Buffer Swap`);
console.log(`Size: ${funcSize} bytes (${hex(START, 6)} - ${hex(START + funcSize - 1, 6)} inclusive)`);
console.log(`Instructions: ${instructions.length}`);
console.log(`DI/EI pairs: ${diEiPairs.length}`);
console.log(`LD A,I count: ${ldAI_addrs.length} (errata workaround: ${ldAI_addrs.length >= 2 ? 'YES' : 'NO'})`);
console.log(`Block copies (LDIR/LDDR): ${blockCopies.length}`);
console.log(`Buffer references: ${bufferRefs.length}`);
console.log(`Callers: ${callers.length}`);
for (const c of callers) console.log(`  ${hex(c.addr, 6)}  ${c.type}`);

// Determine swap mechanism
if (blockCopies.length > 0) {
  console.log(`\nSwap mechanism: BLOCK COPY (LDIR/LDDR)`);
} else if (bufferRefs.length === 0 && ramAccesses.length > 0) {
  console.log(`\nSwap mechanism: POINTER SWAP (exchanges RAM pointers, no block copy)`);
} else {
  console.log(`\nSwap mechanism: NEEDS ANALYSIS (see disassembly above)`);
}

console.log('\nDone.');
process.exit(0);
