/**
 * probe-phase569-decode-08DD45.mjs
 * Decode 0x08DD45 — Token-Type Classifier
 * Called by 0x08DB93 (token-type guard, 22B) to classify token types.
 * Session 568 found: guard does RES 1,(IY+0x2D), CALL 0x08DD45,
 * routes via Z/C/NZ/match, SET 1,(IY+0x2D) only for type 0x10.
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

// ---------- Disassemble 0x08DD45 with follow-through ----------
const START = 0x08DD45;
const MAX_BYTES = 600;

// Disassemble following all conditional paths until we find all RET/JP exits
function disassembleFunction(start) {
  const visited = new Set();
  const queue = [start];
  const instructions = new Map(); // addr -> {size, mnemonic}

  while (queue.length > 0) {
    let pc = queue.shift();
    while (pc >= start && pc < start + MAX_BYTES && !visited.has(pc)) {
      visited.add(pc);
      const ins = decode(pc);
      instructions.set(pc, ins);

      const mn = ins.mnemonic;

      // Unconditional RET — end of this path
      if (mn === 'RET') break;

      // Unconditional JP — end of path (tail call or internal jump)
      if (mn.startsWith('JP ') && !mn.startsWith('JP (') && !mn.match(/^JP (NZ|Z|NC|C|PO|PE|P|M),/)) {
        const target = parseInt(mn.match(/0x([0-9A-F]+)/)?.[1], 16);
        if (target >= start && target < start + MAX_BYTES) {
          queue.push(target);
        }
        break;
      }

      // Conditional RET — continue to fallthrough
      if (mn.match(/^RET (NZ|Z|NC|C|PO|PE|P|M)$/)) {
        pc += ins.size;
        continue;
      }

      // Conditional JP/JR — queue branch target, continue fallthrough
      const condMatch = mn.match(/^(JP|JR) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]+)$/);
      if (condMatch) {
        const target = parseInt(condMatch[3], 16);
        if (target >= start && target < start + MAX_BYTES) {
          queue.push(target);
        }
        pc += ins.size;
        continue;
      }

      // DJNZ
      if (mn.startsWith('DJNZ ')) {
        const target = parseInt(mn.match(/0x([0-9A-F]+)/)?.[1], 16);
        if (target >= start && target < start + MAX_BYTES) {
          queue.push(target);
        }
        pc += ins.size;
        continue;
      }

      // JP (HL) / JP (IX) / JP (IY) — indirect, end of path
      if (mn.startsWith('JP (')) break;

      pc += ins.size;
    }
  }

  // Sort by address
  return [...instructions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([addr, ins]) => ({ addr, ...ins }));
}

const instructions = disassembleFunction(START);
const lastIns = instructions[instructions.length - 1];
const endAddr = lastIns ? lastIns.addr + lastIns.size : START;
const totalBytes = endAddr - START;

console.log('PHASE 569: Decode 0x08DD45 — Token-Type Classifier');
console.log('====================================================');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Start: ${hex(START, 6)}`);
console.log(`End: ${hex(endAddr - 1, 6)}`);
console.log(`Length: ${totalBytes} bytes, ${instructions.length} instructions`);

console.log('\n=== FULL DISASSEMBLY ===\n');
for (const ins of instructions) {
  const bytes = [];
  for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
  const byteStr = bytes.join(' ').padEnd(16);
  console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
}

// ---------- Classification logic ----------
console.log('\n=== CLASSIFICATION LOGIC ===\n');

const cps = [];
const calls = [];
const jps = [];
const rets = [];
const ramAccesses = [];
const iyOps = [];

for (const ins of instructions) {
  const mn = ins.mnemonic;
  if (mn.startsWith('CP ')) cps.push(ins);
  if (mn.startsWith('CALL ')) calls.push(ins);
  if (mn.startsWith('JP ') && !mn.startsWith('JP (')) jps.push(ins);
  if (mn === 'RET' || mn.match(/^RET /)) rets.push(ins);

  // IY-relative
  const iyMatch = mn.match(/\(IY([+-]0x[0-9A-F]+)\)/);
  if (iyMatch) {
    const offset = parseInt(iyMatch[1].replace('+', ''), 16);
    const addr = (IY_BASE + offset) & 0xFFFFFF;
    iyOps.push({ ...ins, iyOffset: offset, iyAddr: addr });
  }

  // RAM references
  const memMatch = mn.match(/\(0x([0-9A-F]{6})\)/);
  if (memMatch) {
    const addr = parseInt(memMatch[1], 16);
    if (inRam(addr)) ramAccesses.push({ ...ins, ramAddr: addr });
  }
}

console.log('CP comparisons:');
for (const ins of cps) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
}

console.log('\nCALL targets:');
for (const ins of calls) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
}

console.log('\nJP targets:');
for (const ins of jps) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
}

console.log('\nRET instructions:');
for (const ins of rets) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
}

console.log('\nIY-relative operations:');
for (const ins of iyOps) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; => ${hex(ins.iyAddr, 6)}`);
}

console.log('\nRAM accesses:');
for (const ins of ramAccesses) {
  console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);
}

// ---------- Dispatch table extraction ----------
console.log('\n=== DISPATCH TABLE (CP -> conditional branch) ===\n');

for (let i = 0; i < instructions.length - 1; i++) {
  const ins = instructions[i];
  if (!ins.mnemonic.startsWith('CP ')) continue;

  // Look at next few instructions for conditional branches
  for (let j = i + 1; j < Math.min(i + 4, instructions.length); j++) {
    const next = instructions[j];
    const mn = next.mnemonic;
    const condMatch = mn.match(/^(JP|JR) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]+)$/);
    if (condMatch) {
      const cond = condMatch[2];
      const target = parseInt(condMatch[3], 16);
      let meaning = '';
      const cpVal = ins.mnemonic.replace('CP ', '');
      if (cond === 'Z') meaning = `A == ${cpVal}`;
      else if (cond === 'NZ') meaning = `A != ${cpVal}`;
      else if (cond === 'C') meaning = `A < ${cpVal}`;
      else if (cond === 'NC') meaning = `A >= ${cpVal}`;
      console.log(`  ${hex(ins.addr, 6)} ${ins.mnemonic} -> ${hex(next.addr, 6)} ${mn}  [${meaning}] -> ${hex(target, 6)}`);
      break;
    }
    // Stop if we hit another CP or non-trivial instruction
    if (mn.startsWith('CP ') || mn === 'RET' || mn.startsWith('JP ')) break;
  }
}

// ---------- ROM callers ----------
console.log('\n=== ROM CALLERS ===\n');

const callers = [];
for (let a = 0; a < rom.length - 3; a++) {
  // CALL 0x08DD45 = CD 45 DD 08
  if (rom[a] === 0xCD && rom[a + 1] === 0x45 && rom[a + 2] === 0xDD && rom[a + 3] === 0x08) {
    callers.push({ addr: a, type: 'CALL' });
  }
  // JP 0x08DD45 = C3 45 DD 08
  if (rom[a] === 0xC3 && rom[a + 1] === 0x45 && rom[a + 2] === 0xDD && rom[a + 3] === 0x08) {
    callers.push({ addr: a, type: 'JP' });
  }
}

for (const c of callers) {
  console.log(`  ${hex(c.addr, 6)}  ${c.type} 0x08DD45`);
}
console.log(`\nTotal: ${callers.length} callers (${callers.filter(c => c.type === 'CALL').length} CALL, ${callers.filter(c => c.type === 'JP').length} JP)`);

// ---------- Embedded lookup table check ----------
console.log('\n=== EMBEDDED DATA (lookup tables) ===\n');

// Check if there are data tables referenced within the function range
// Look at LD HL,<addr> where addr is within function range
for (const ins of instructions) {
  const ldMatch = ins.mnemonic.match(/^LD HL,0x([0-9A-F]+)$/);
  if (ldMatch) {
    const target = parseInt(ldMatch[1], 16);
    if (target >= START && target < START + MAX_BYTES) {
      console.log(`  ${hex(ins.addr, 6)} loads table at ${hex(target, 6)}`);
      // Dump a few bytes of the table
      const tableBytes = [];
      for (let i = 0; i < 48; i++) tableBytes.push(hex(romByte(target + i), 2).slice(2));
      console.log(`    Data: ${tableBytes.join(' ')}`);
    }
  }
}

// ---------- Decode callees ----------
console.log('\n=== CALLEE 0x04C973 ===\n');
{
  const calleeInstructions = disassembleFunction(0x04C973);
  for (const ins of calleeInstructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
  const last = calleeInstructions[calleeInstructions.length - 1];
  console.log(`  Length: ${last ? last.addr + last.size - 0x04C973 : 0} bytes`);
}

console.log('\n=== CALLEE 0x05E38B ===\n');
{
  const calleeInstructions = disassembleFunction(0x05E38B);
  for (const ins of calleeInstructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
  const last = calleeInstructions[calleeInstructions.length - 1];
  console.log(`  Length: ${last ? last.addr + last.size - 0x05E38B : 0} bytes`);
}

// ---------- Also decode the surrounding context: 0x08DD60 onward ----------
// There are clearly more sub-functions in this region (0x08DD60, 0x08DD8C, 0x08DDA5, etc.)
console.log('\n=== NEIGHBORING FUNCTIONS (linear scan 0x08DD60 - 0x08DE00) ===\n');
{
  let pc = 0x08DD60;
  const end = 0x08DE20;
  while (pc < end) {
    const ins = decode(pc);
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(pc + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(pc, 6)}  ${byteStr} ${ins.mnemonic}`);
    if (ins.mnemonic === 'RET' || (ins.mnemonic.startsWith('JP ') && !ins.mnemonic.match(/^JP (NZ|Z|NC|C|PO|PE|P|M),/))) {
      console.log('  ---');
    }
    pc += ins.size;
  }
}

console.log('\nDone.');
process.exit(0);
