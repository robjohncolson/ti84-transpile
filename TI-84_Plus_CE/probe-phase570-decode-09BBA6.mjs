/**
 * probe-phase570-decode-09BBA6.mjs
 * Decode 0x09BBA6 — Token Advance+Classify Subroutine
 * Part of the 15-function token parser cluster at 0x09BAAB-0x09BC60.
 * Nearby decoded: 0x09BAFF main classifier, 0x09BAC9 cursor advance,
 * 0x09B9C8+0x09BBAA pre-classifier, 0x059FFF accept handler.
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

// ---------- Disassemble function following all conditional paths ----------
const MAX_BYTES = 600;

function disassembleFunction(start, maxBytes = MAX_BYTES) {
  const visited = new Set();
  const queue = [start];
  const instructions = new Map();

  while (queue.length > 0) {
    let pc = queue.shift();
    while (pc >= start && pc < start + maxBytes && !visited.has(pc)) {
      visited.add(pc);
      const ins = decode(pc);
      instructions.set(pc, ins);

      const mn = ins.mnemonic;

      if (mn === 'RET') break;

      if (mn.startsWith('JP ') && !mn.startsWith('JP (') && !mn.match(/^JP (NZ|Z|NC|C|PO|PE|P|M),/)) {
        const target = parseInt(mn.match(/0x([0-9A-F]+)/)?.[1], 16);
        if (target >= start && target < start + maxBytes) {
          queue.push(target);
        }
        break;
      }

      if (mn.match(/^RET (NZ|Z|NC|C|PO|PE|P|M)$/)) {
        pc += ins.size;
        continue;
      }

      const condMatch = mn.match(/^(JP|JR) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]+)$/);
      if (condMatch) {
        const target = parseInt(condMatch[3], 16);
        if (target >= start && target < start + maxBytes) {
          queue.push(target);
        }
        pc += ins.size;
        continue;
      }

      if (mn.startsWith('DJNZ ')) {
        const target = parseInt(mn.match(/0x([0-9A-F]+)/)?.[1], 16);
        if (target >= start && target < start + maxBytes) {
          queue.push(target);
        }
        pc += ins.size;
        continue;
      }

      if (mn.startsWith('JP (')) break;

      pc += ins.size;
    }
  }

  return [...instructions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([addr, ins]) => ({ addr, ...ins }));
}

function printDisassembly(instructions) {
  for (const ins of instructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
}

// ========== PRIMARY TARGET: 0x09BBA6 ==========
const START = 0x09BBA6;

console.log('PHASE 570: Decode 0x09BBA6 — Token Advance+Classify Subroutine');
console.log('================================================================');
console.log(`ROM size: ${rom.length} bytes`);

const instructions = disassembleFunction(START);
const lastIns = instructions[instructions.length - 1];
const endAddr = lastIns ? lastIns.addr + lastIns.size : START;
const totalBytes = endAddr - START;

console.log(`\nTarget: ${hex(START, 6)}`);
console.log(`End: ${hex(endAddr - 1, 6)}`);
console.log(`Length: ${totalBytes} bytes, ${instructions.length} instructions`);

console.log('\n=== DISASSEMBLY OF 0x09BBA6 ===\n');
printDisassembly(instructions);

// ---------- Classification ----------
console.log('\n=== INSTRUCTION CLASSIFICATION ===\n');

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
}

console.log('CP comparisons:');
for (const ins of cps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);

console.log('\nCALL targets:');
for (const ins of calls) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);

console.log('\nJP targets:');
for (const ins of jps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);

console.log('\nRET instructions:');
for (const ins of rets) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);

console.log('\nIY-relative operations:');
for (const ins of iyOps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; => ${hex(ins.iyAddr, 6)}`);

console.log('\nRAM accesses:');
for (const ins of ramAccesses) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);

// ---------- Dispatch table ----------
console.log('\n=== DISPATCH TABLE (CP -> conditional branch) ===\n');
for (let i = 0; i < instructions.length - 1; i++) {
  const ins = instructions[i];
  if (!ins.mnemonic.startsWith('CP ')) continue;
  for (let j = i + 1; j < Math.min(i + 4, instructions.length); j++) {
    const next = instructions[j];
    const mn = next.mnemonic;
    const condMatch = mn.match(/^(JP|JR) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]+)$/);
    if (condMatch) {
      const cond = condMatch[2];
      const target = parseInt(condMatch[3], 16);
      const cpVal = ins.mnemonic.replace('CP ', '');
      let meaning = '';
      if (cond === 'Z') meaning = `A == ${cpVal}`;
      else if (cond === 'NZ') meaning = `A != ${cpVal}`;
      else if (cond === 'C') meaning = `A < ${cpVal}`;
      else if (cond === 'NC') meaning = `A >= ${cpVal}`;
      console.log(`  ${hex(ins.addr, 6)} ${ins.mnemonic} -> ${hex(next.addr, 6)} ${mn}  [${meaning}] -> ${hex(target, 6)}`);
      break;
    }
    if (mn.startsWith('CP ') || mn === 'RET' || mn.startsWith('JP ')) break;
  }
}

// ========== ROM CALLERS OF 0x09BBA6 ==========
console.log('\n=== ROM CALLERS OF 0x09BBA6 ===\n');

const targetLo = START & 0xFF;
const targetMid = (START >> 8) & 0xFF;
const targetHi = (START >> 16) & 0xFF;

const callers = [];
for (let a = 0; a < rom.length - 3; a++) {
  if (rom[a + 1] === targetLo && rom[a + 2] === targetMid && rom[a + 3] === targetHi) {
    if (rom[a] === 0xCD) callers.push({ addr: a, type: 'CALL' });
    else if (rom[a] === 0xC3) callers.push({ addr: a, type: 'JP' });
    else if ((rom[a] & 0xC7) === 0xC4) {
      const cond = cc[(rom[a] >> 3) & 7];
      callers.push({ addr: a, type: `CALL ${cond}` });
    }
    else if ((rom[a] & 0xC7) === 0xC2) {
      const cond = cc[(rom[a] >> 3) & 7];
      callers.push({ addr: a, type: `JP ${cond}` });
    }
  }
}

for (const c of callers) {
  console.log(`  ${hex(c.addr, 6)}  ${c.type} 0x09BBA6`);
}
console.log(`\nTotal: ${callers.length} callers`);

// Also check for JR references (relative jumps within ~127 bytes)
console.log('\n=== JR REFERENCES TO 0x09BBA6 (within range) ===\n');
const jrCallers = [];
for (let a = START - 128; a < START + 128; a++) {
  if (a < 0 || a >= rom.length - 1) continue;
  const op = rom[a];
  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const disp = s8(rom[a + 1]);
    const target = a + 2 + disp;
    if (target === START) {
      const ins = decode(a);
      jrCallers.push({ addr: a, mnemonic: ins.mnemonic });
      console.log(`  ${hex(a, 6)}  ${ins.mnemonic}`);
    }
  }
}
if (jrCallers.length === 0) console.log('  (none)');

// ========== SURROUNDING CLUSTER: 0x09BB80 - 0x09BC60 ==========
console.log('\n=== FULL CLUSTER LINEAR SCAN: 0x09BB80 - 0x09BC60 ===\n');
{
  let pc = 0x09BB80;
  const end = 0x09BC60;
  while (pc < end) {
    const ins = decode(pc);
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(pc + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    const marker = pc === START ? ' <<<< TARGET' : '';
    console.log(`  ${hex(pc, 6)}  ${byteStr} ${ins.mnemonic}${marker}`);
    if (ins.mnemonic === 'RET' || (ins.mnemonic.startsWith('JP ') && !ins.mnemonic.match(/^JP (NZ|Z|NC|C|PO|PE|P|M),/) && !ins.mnemonic.startsWith('JP ('))) {
      console.log('  ---');
    }
    pc += ins.size;
  }
}

// ========== DECODE CALL/JP TARGETS ==========
console.log('\n=== CALLEES FROM 0x09BBA6 ===\n');

const callTargets = new Set();
for (const ins of instructions) {
  const mn = ins.mnemonic;
  const callMatch = mn.match(/^CALL (?:(?:NZ|Z|NC|C|PO|PE|P|M),)?0x([0-9A-F]+)$/);
  if (callMatch) callTargets.add(parseInt(callMatch[1], 16));
  const jpMatch = mn.match(/^JP (?:(?:NZ|Z|NC|C|PO|PE|P|M),)?0x([0-9A-F]+)$/);
  if (jpMatch) {
    const target = parseInt(jpMatch[1], 16);
    if (target < START || target >= endAddr) callTargets.add(target);
  }
}

for (const target of [...callTargets].sort((a, b) => a - b)) {
  console.log(`\n--- Callee ${hex(target, 6)} ---`);
  if (target < rom.length) {
    const calleeIns = disassembleFunction(target, 200);
    printDisassembly(calleeIns);
    const last = calleeIns[calleeIns.length - 1];
    if (last) console.log(`  Length: ${last.addr + last.size - target} bytes`);
  } else {
    console.log('  (address outside ROM)');
  }
}

// ========== ALL CALL/JP TARGETS IN CLUSTER ==========
console.log('\n=== ALL CALL/JP TARGETS IN CLUSTER 0x09BB80-0x09BC60 ===\n');
{
  const clusterTargets = new Set();
  let pc = 0x09BB80;
  const end = 0x09BC60;
  while (pc < end) {
    const ins = decode(pc);
    const mn = ins.mnemonic;
    const callMatch = mn.match(/^CALL (?:(?:NZ|Z|NC|C|PO|PE|P|M),)?0x([0-9A-F]+)$/);
    if (callMatch) clusterTargets.add(parseInt(callMatch[1], 16));
    const jpMatch = mn.match(/^JP (?:(?:NZ|Z|NC|C|PO|PE|P|M),)?0x([0-9A-F]+)$/);
    if (jpMatch) {
      const target = parseInt(jpMatch[1], 16);
      if (target < 0x09BB80 || target >= 0x09BC60) clusterTargets.add(target);
    }
    pc += ins.size;
  }
  for (const target of [...clusterTargets].sort((a, b) => a - b)) {
    console.log(`  ${hex(target, 6)}`);
  }
}

// ========== RAM ADDRESS SUMMARY ==========
console.log('\n=== RAM ADDRESSES IN CLUSTER ===\n');
{
  const ramAddrs = new Map();
  let pc = 0x09BB80;
  const end = 0x09BC60;
  while (pc < end) {
    const ins = decode(pc);
    const mn = ins.mnemonic;

    const memMatch = mn.match(/\(0x([0-9A-F]{6})\)/);
    if (memMatch) {
      const addr = parseInt(memMatch[1], 16);
      if (inRam(addr)) {
        if (!ramAddrs.has(addr)) ramAddrs.set(addr, []);
        ramAddrs.get(addr).push({ pc, mnemonic: mn });
      }
    }

    const iyMatch = mn.match(/\(IY([+-]0x[0-9A-F]+)\)/);
    if (iyMatch) {
      const offset = parseInt(iyMatch[1].replace('+', ''), 16);
      const addr = (IY_BASE + offset) & 0xFFFFFF;
      if (inRam(addr)) {
        if (!ramAddrs.has(addr)) ramAddrs.set(addr, []);
        ramAddrs.get(addr).push({ pc, mnemonic: mn, note: `IY${iyMatch[1]}` });
      }
    }

    pc += ins.size;
  }

  for (const [addr, refs] of [...ramAddrs.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${hex(addr, 6)}:`);
    for (const ref of refs) {
      console.log(`    ${hex(ref.pc, 6)}  ${ref.mnemonic}${ref.note ? '  ; ' + ref.note : ''}`);
    }
  }
}

// ========== STRUCTURED SUMMARY ==========
console.log('\n=== STRUCTURED SUMMARY ===\n');
console.log(`Primary function: ${hex(START, 6)} - ${hex(endAddr - 1, 6)} (${totalBytes} bytes, ${instructions.length} instructions)`);
console.log(`Callers: ${callers.length} CALL/JP + ${jrCallers.length} JR`);
console.log(`Callees: ${[...callTargets].map(t => hex(t, 6)).join(', ')}`);
console.log(`CP values: ${cps.map(c => c.mnemonic.replace('CP ', '')).join(', ') || '(none)'}`);
console.log(`Exit paths: ${rets.map(r => `${hex(r.addr, 6)} ${r.mnemonic}`).join(', ') || '(none)'}`);

console.log('\nDone.');
process.exit(0);
