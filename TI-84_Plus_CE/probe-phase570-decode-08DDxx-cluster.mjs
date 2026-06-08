/**
 * probe-phase570-decode-08DDxx-cluster.mjs
 * Decode 0x08DD60, 0x08DD8C, 0x08DDA5 — Token Classification Cluster
 * Session 569 identified these neighboring functions near the token-type
 * classifier at 0x08DD45. They reference lookup tables at 0x08DDBF and 0x08DDD9.
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
    // LEA instructions (eZ80 specific)
    if (op2 === 0x02) return { size: 3, mnemonic: `LEA BC,IX${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x03) return { size: 3, mnemonic: `LEA BC,IY${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x12) return { size: 3, mnemonic: `LEA DE,IX${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x13) return { size: 3, mnemonic: `LEA DE,IY${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x22) return { size: 3, mnemonic: `LEA HL,IX${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x23) return { size: 3, mnemonic: `LEA HL,IY${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x32) return { size: 3, mnemonic: `LEA IX,IX${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
    if (op2 === 0x33) return { size: 3, mnemonic: `LEA IY,IY${s8(romByte(pc + 2)) >= 0 ? '+' : ''}${s8(romByte(pc + 2))}` };
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

// ---------- Disassemble following all conditional paths ----------
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

// ---------- Analysis helpers ----------

function analyzeFunction(name, start, maxBytes = MAX_BYTES) {
  const instructions = disassembleFunction(start, maxBytes);
  const lastIns = instructions[instructions.length - 1];
  const endAddr = lastIns ? lastIns.addr + lastIns.size : start;
  const totalBytes = endAddr - start;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${name} (${hex(start, 6)}) ===`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Start: ${hex(start, 6)}, End: ${hex(endAddr - 1, 6)}, Length: ${totalBytes} bytes, ${instructions.length} instructions`);

  console.log('\n--- Disassembly ---\n');
  for (const ins of instructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }

  // Collect metadata
  const cps = [];
  const calls = [];
  const jps = [];
  const rets = [];
  const ramAccesses = [];
  const iyOps = [];
  const callTargets = new Set();

  for (const ins of instructions) {
    const mn = ins.mnemonic;
    if (mn.startsWith('CP ')) cps.push(ins);
    if (mn.startsWith('CALL ')) {
      calls.push(ins);
      const target = parseInt(mn.match(/0x([0-9A-F]+)/)?.[1], 16);
      if (target) callTargets.add(target);
    }
    if (mn.startsWith('JP ') && !mn.startsWith('JP (')) {
      jps.push(ins);
      const target = parseInt(mn.match(/,?0x([0-9A-F]+)/)?.[1], 16);
      if (target) callTargets.add(target);
    }
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

    // Also catch LD rr,imm24 where the immediate is a RAM address
    const ldImmMatch = mn.match(/^LD (BC|DE|HL|IX|IY),0x([0-9A-F]{6})$/);
    if (ldImmMatch) {
      const addr = parseInt(ldImmMatch[2], 16);
      if (inRam(addr)) ramAccesses.push({ ...ins, ramAddr: addr });
    }
  }

  if (cps.length > 0) {
    console.log('\n--- CP comparisons ---');
    for (const ins of cps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
  }

  if (calls.length > 0) {
    console.log('\n--- CALL targets ---');
    for (const ins of calls) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
  }

  if (jps.length > 0) {
    console.log('\n--- JP targets ---');
    for (const ins of jps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
  }

  if (rets.length > 0) {
    console.log('\n--- RET instructions ---');
    for (const ins of rets) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
  }

  if (iyOps.length > 0) {
    console.log('\n--- IY-relative operations ---');
    for (const ins of iyOps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; => ${hex(ins.iyAddr, 6)}`);
  }

  if (ramAccesses.length > 0) {
    console.log('\n--- RAM accesses ---');
    for (const ins of ramAccesses) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);
  }

  // Dispatch table analysis
  console.log('\n--- Dispatch table (CP -> conditional branch) ---');
  let dispatchCount = 0;
  for (let i = 0; i < instructions.length - 1; i++) {
    const ins = instructions[i];
    if (!ins.mnemonic.startsWith('CP ')) continue;
    for (let j = i + 1; j < Math.min(i + 4, instructions.length); j++) {
      const next = instructions[j];
      const mn = next.mnemonic;
      const cMatch = mn.match(/^(JP|JR) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]+)$/);
      if (cMatch) {
        const cond = cMatch[2];
        const target = parseInt(cMatch[3], 16);
        const cpVal = ins.mnemonic.replace('CP ', '');
        let meaning = '';
        if (cond === 'Z') meaning = `A == ${cpVal}`;
        else if (cond === 'NZ') meaning = `A != ${cpVal}`;
        else if (cond === 'C') meaning = `A < ${cpVal}`;
        else if (cond === 'NC') meaning = `A >= ${cpVal}`;
        console.log(`  ${hex(ins.addr, 6)} ${ins.mnemonic} -> ${hex(next.addr, 6)} ${mn}  [${meaning}] -> ${hex(target, 6)}`);
        dispatchCount++;
        break;
      }
      if (mn.startsWith('CP ') || mn === 'RET' || mn.startsWith('JP ')) break;
    }
  }
  if (dispatchCount === 0) console.log('  (none found)');

  return { instructions, callTargets, endAddr };
}

function findCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const callers = [];
  for (let a = 0; a < rom.length - 3; a++) {
    if (rom[a + 1] === lo && rom[a + 2] === mid && rom[a + 3] === hi) {
      if (rom[a] === 0xCD) callers.push({ addr: a, type: 'CALL' });
      else if (rom[a] === 0xC3) callers.push({ addr: a, type: 'JP' });
      // Conditional CALL: C4,CC,D4,DC,E4,EC,F4,FC
      else if ((rom[a] & 0xC7) === 0xC4) {
        const cond = cc[(rom[a] >> 3) & 7];
        callers.push({ addr: a, type: `CALL ${cond}` });
      }
      // Conditional JP: C2,CA,D2,DA,E2,EA,F2,FA
      else if ((rom[a] & 0xC7) === 0xC2) {
        const cond = cc[(rom[a] >> 3) & 7];
        callers.push({ addr: a, type: `JP ${cond}` });
      }
    }
  }
  return callers;
}

// =====================================================================
console.log('PHASE 570: Decode 0x08DD60 + 0x08DD8C + 0x08DDA5 — Token Classification Cluster');
console.log('==================================================================================');
console.log(`ROM size: ${rom.length} bytes`);

// =====================================================================
// Function 1: 0x08DD60
// =====================================================================
const fn1 = analyzeFunction('FUNCTION 1 — 0x08DD60', 0x08DD60, 100);

// =====================================================================
// Function 2: 0x08DD8C
// =====================================================================
const fn2 = analyzeFunction('FUNCTION 2 — 0x08DD8C', 0x08DD8C, 80);

// =====================================================================
// Function 3: 0x08DDA5
// =====================================================================
const fn3 = analyzeFunction('FUNCTION 3 — 0x08DDA5', 0x08DDA5, 80);

// =====================================================================
// Linear scan of the entire region 0x08DD60 - 0x08DE20 for full context
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('=== LINEAR SCAN 0x08DD60 - 0x08DE20 (full context) ===');
console.log('='.repeat(60) + '\n');
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

// =====================================================================
// Lookup table dumps
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('=== LOOKUP TABLE AT 0x08DDBF (19 entries) ===');
console.log('='.repeat(60) + '\n');

// Dump as 1-byte entries
console.log('As 1-byte entries:');
for (let i = 0; i < 19; i++) {
  console.log(`  [${i.toString().padStart(2)}] ${hex(0x08DDBF + i, 6)} = ${hex(romByte(0x08DDBF + i), 2)}`);
}

// Dump as 2-byte entries (LE)
console.log('\nAs 2-byte (LE) entries:');
for (let i = 0; i < 19; i++) {
  const val = romByte(0x08DDBF + i * 2) | (romByte(0x08DDBF + i * 2 + 1) << 8);
  console.log(`  [${i.toString().padStart(2)}] ${hex(0x08DDBF + i * 2, 6)} = ${hex(val, 4)}`);
}

// Raw hex dump
console.log('\nRaw hex dump (64 bytes from 0x08DDBF):');
{
  let line = '  ';
  for (let i = 0; i < 64; i++) {
    line += romByte(0x08DDBF + i).toString(16).toUpperCase().padStart(2, '0') + ' ';
    if ((i + 1) % 16 === 0) { console.log(line); line = '  '; }
  }
  if (line.trim()) console.log(line);
}

console.log('\n' + '='.repeat(60));
console.log('=== LOOKUP TABLE AT 0x08DDD9 (11 entries) ===');
console.log('='.repeat(60) + '\n');

// Dump as 1-byte entries
console.log('As 1-byte entries:');
for (let i = 0; i < 11; i++) {
  console.log(`  [${i.toString().padStart(2)}] ${hex(0x08DDD9 + i, 6)} = ${hex(romByte(0x08DDD9 + i), 2)}`);
}

// Dump as 2-byte entries (LE)
console.log('\nAs 2-byte (LE) entries:');
for (let i = 0; i < 11; i++) {
  const val = romByte(0x08DDD9 + i * 2) | (romByte(0x08DDD9 + i * 2 + 1) << 8);
  console.log(`  [${i.toString().padStart(2)}] ${hex(0x08DDD9 + i * 2, 6)} = ${hex(val, 4)}`);
}

// Raw hex dump
console.log('\nRaw hex dump (32 bytes from 0x08DDD9):');
{
  let line = '  ';
  for (let i = 0; i < 32; i++) {
    line += romByte(0x08DDD9 + i).toString(16).toUpperCase().padStart(2, '0') + ' ';
    if ((i + 1) % 16 === 0) { console.log(line); line = '  '; }
  }
  if (line.trim()) console.log(line);
}

// =====================================================================
// Callers scan for all three functions
// =====================================================================
const targets = [
  { addr: 0x08DD60, name: '0x08DD60' },
  { addr: 0x08DD8C, name: '0x08DD8C' },
  { addr: 0x08DDA5, name: '0x08DDA5' },
];

for (const t of targets) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ROM CALLERS of ${t.name} ===`);
  console.log('='.repeat(60) + '\n');

  const callers = findCallers(t.addr);
  for (const c of callers) {
    console.log(`  ${hex(c.addr, 6)}  ${c.type} ${t.name}`);
  }
  console.log(`\n  Total: ${callers.length} callers`);
}

// =====================================================================
// Decode CALL/JP targets found in these functions
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('=== CALLEES — decode 10+ bytes of each target ===');
console.log('='.repeat(60));

const allCallTargets = new Set();
for (const fn of [fn1, fn2, fn3]) {
  for (const t of fn.callTargets) allCallTargets.add(t);
}

// Remove the three functions themselves from callee list
allCallTargets.delete(0x08DD60);
allCallTargets.delete(0x08DD8C);
allCallTargets.delete(0x08DDA5);

for (const target of [...allCallTargets].sort()) {
  console.log(`\n--- Callee ${hex(target, 6)} (first 15 instructions) ---\n`);
  const calleeIns = disassembleFunction(target, 100);
  const show = calleeIns.slice(0, 15);
  for (const ins of show) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(16);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
  }
  if (calleeIns.length > 15) console.log(`  ... (${calleeIns.length - 15} more instructions)`);
  const last = calleeIns[calleeIns.length - 1];
  if (last) console.log(`  Total: ${last.addr + last.size - target} bytes`);
}

// =====================================================================
// Summary
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('=== STRUCTURED SUMMARY ===');
console.log('='.repeat(60));

console.log(`
Function 1: 0x08DD60
  Size: ${fn1.endAddr - 0x08DD60} bytes
  Call targets: ${[...fn1.callTargets].map(a => hex(a, 6)).join(', ') || 'none'}

Function 2: 0x08DD8C
  Size: ${fn2.endAddr - 0x08DD8C} bytes
  Call targets: ${[...fn2.callTargets].map(a => hex(a, 6)).join(', ') || 'none'}

Function 3: 0x08DDA5
  Size: ${fn3.endAddr - 0x08DDA5} bytes
  Call targets: ${[...fn3.callTargets].map(a => hex(a, 6)).join(', ') || 'none'}

Lookup tables:
  0x08DDBF: 19-entry table (used by fn at 0x08DD8C)
  0x08DDD9: 11-entry table (used by fn at 0x08DDA5)
`);

console.log('\nDone.');
process.exit(0);
