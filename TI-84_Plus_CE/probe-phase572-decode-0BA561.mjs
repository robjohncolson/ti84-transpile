/**
 * probe-phase572-decode-0BA561.mjs
 * Decode function at 0x0BA561 — unknown, needs identification.
 * Uses inline eZ80 ADL decoder (same pattern as phase 571 probes).
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

// ---------- Inline eZ80 ADL decoder (with mode prefix support) ----------
const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

// eZ80 mode prefix bytes (in ADL mode, these replace LD B,B / LD C,C / LD D,D / LD E,E)
const MODE_PREFIXES = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };

// Immediate width: .SIS/.LIS use 2-byte immediates, .SIL/.LIL use 3-byte, default ADL = 3
function immWidth(prefix) {
  if (prefix === 0x40 || prefix === 0x49) return 2; // .SIS, .LIS
  if (prefix === 0x52 || prefix === 0x5B) return 3; // .SIL, .LIL
  return 3; // ADL default
}

function uImm(addr, width) {
  if (width === 2) return romByte(addr) | (romByte(addr + 1) << 8);
  return romByte(addr) | (romByte(addr + 1) << 8) | (romByte(addr + 2) << 16);
}

function hexImm(addr, width) {
  return hex(uImm(addr, width), width * 2);
}

function decodeCb(startPc, cbPc) {
  const op = romByte(cbPc + 1);
  const reg = regs8[op & 7];
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${reg}` :
    group === 1 ? `BIT ${bit},${reg}` :
    group === 2 ? `RES ${bit},${reg}` :
    `SET ${bit},${reg}`;
  return { size: cbPc + 2 - startPc, mnemonic };
}

function decodeIdxCb(startPc, idxPc, reg) {
  const d = s8(romByte(idxPc + 2));
  const op = romByte(idxPc + 3);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mem = `(${reg}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
  return { size: idxPc + 4 - startPc, mnemonic };
}

function decodeIdx(startPc, idxPc, reg, iw) {
  const op = romByte(idxPc + 1);
  if (op === 0xCB) return decodeIdxCb(startPc, idxPc, reg);
  const d = s8(romByte(idxPc + 2));
  const idxMem = `(${reg}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const base = idxPc + 2; // byte after DD/FD + op

  if (op === 0x21) return { size: base + iw - startPc, mnemonic: `LD ${reg},${hexImm(base, iw)}` };
  if (op === 0x22) return { size: base + iw - startPc, mnemonic: `LD (${hexImm(base, iw)}),${reg}` };
  if (op === 0x2A) return { size: base + iw - startPc, mnemonic: `LD ${reg},(${hexImm(base, iw)})` };
  if (op === 0xE1) return { size: idxPc + 2 - startPc, mnemonic: `POP ${reg}` };
  if (op === 0xE5) return { size: idxPc + 2 - startPc, mnemonic: `PUSH ${reg}` };
  if (op === 0xE9) return { size: idxPc + 2 - startPc, mnemonic: `JP (${reg})` };
  if (op === 0xF9) return { size: idxPc + 2 - startPc, mnemonic: `LD SP,${reg}` };
  if (op === 0x23) return { size: idxPc + 2 - startPc, mnemonic: `INC ${reg}` };
  if (op === 0x2B) return { size: idxPc + 2 - startPc, mnemonic: `DEC ${reg}` };
  if (op === 0x34) return { size: idxPc + 3 - startPc, mnemonic: `INC ${idxMem}` };
  if (op === 0x35) return { size: idxPc + 3 - startPc, mnemonic: `DEC ${idxMem}` };
  if (op === 0x36) return { size: idxPc + 4 - startPc, mnemonic: `LD ${idxMem},${hex(romByte(idxPc + 3), 2)}` };
  if ((op & 0xCF) === 0x09) return { size: idxPc + 2 - startPc, mnemonic: `ADD ${reg},${rp[(op >> 4) & 3]}` };

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return { size: idxPc + 3 - startPc, mnemonic: `LD ${regs8[(op >> 3) & 7]},${idxMem}` };
  if (loadTo.includes(op)) return { size: idxPc + 3 - startPc, mnemonic: `LD ${idxMem},${regs8[op & 7]}` };
  if (aluFrom.includes(op)) return { size: idxPc + 3 - startPc, mnemonic: `${alu[(op >> 3) & 7]} ${idxMem}` };

  return { size: idxPc + 2 - startPc, mnemonic: `${reg === 'IX' ? 'DD' : 'FD'} ${hex(op, 2)}` };
}

function decode(origPc) {
  let pc = origPc;
  let prefix = null;
  let prefixName = '';

  // Check for eZ80 mode prefix bytes
  const first = romByte(pc);
  if (first in MODE_PREFIXES) {
    prefix = first;
    prefixName = MODE_PREFIXES[first] + ' ';
    pc++;
  }

  const iw = immWidth(prefix); // immediate width (2 or 3 bytes)
  const op = romByte(pc);

  if (op === 0xDD || op === 0xFD) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const result = decodeIdx(origPc, pc, reg, iw);
    return { ...result, mnemonic: prefixName + result.mnemonic };
  }

  if (op === 0xCB) {
    const result = decodeCb(origPc, pc);
    return { ...result, mnemonic: prefixName + result.mnemonic };
  }

  // Size helper: total size = (pc - origPc) + innerSize
  const pfx = pc - origPc; // 0 or 1

  if (op === 0x00) return { size: pfx + 1, mnemonic: prefixName + 'NOP' };
  if (op === 0x76) return { size: pfx + 1, mnemonic: prefixName + 'HALT' };
  if (op === 0xF3) return { size: pfx + 1, mnemonic: prefixName + 'DI' };
  if (op === 0xFB) return { size: pfx + 1, mnemonic: prefixName + 'EI' };
  if (op === 0xC9) return { size: pfx + 1, mnemonic: prefixName + 'RET' };
  if (op === 0xD9) return { size: pfx + 1, mnemonic: prefixName + 'EXX' };
  if (op === 0xE3) return { size: pfx + 1, mnemonic: prefixName + 'EX (SP),HL' };
  if (op === 0xEB) return { size: pfx + 1, mnemonic: prefixName + 'EX DE,HL' };
  if (op === 0xF9) return { size: pfx + 1, mnemonic: prefixName + 'LD SP,HL' };
  if (op === 0xE9) return { size: pfx + 1, mnemonic: prefixName + 'JP (HL)' };
  if (op === 0x07) return { size: pfx + 1, mnemonic: prefixName + 'RLCA' };
  if (op === 0x0F) return { size: pfx + 1, mnemonic: prefixName + 'RRCA' };
  if (op === 0x17) return { size: pfx + 1, mnemonic: prefixName + 'RLA' };
  if (op === 0x1F) return { size: pfx + 1, mnemonic: prefixName + 'RRA' };
  if (op === 0x27) return { size: pfx + 1, mnemonic: prefixName + 'DAA' };
  if (op === 0x2F) return { size: pfx + 1, mnemonic: prefixName + 'CPL' };
  if (op === 0x37) return { size: pfx + 1, mnemonic: prefixName + 'SCF' };
  if (op === 0x3F) return { size: pfx + 1, mnemonic: prefixName + 'CCF' };
  if (op === 0x08) return { size: pfx + 1, mnemonic: prefixName + 'EX AF,AF\'' };

  if ((op & 0xC7) === 0xC0) return { size: pfx + 1, mnemonic: prefixName + `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC7) return { size: pfx + 1, mnemonic: prefixName + `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xCF) === 0xC5) return { size: pfx + 1, mnemonic: prefixName + `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { size: pfx + 1, mnemonic: prefixName + `POP ${rp2[(op >> 4) & 3]}` };

  // JP/CALL/JR use iw for address width
  if (op === 0xC3) return { size: pfx + 1 + iw, mnemonic: prefixName + `JP ${hexImm(pc + 1, iw)}` };
  if ((op & 0xC7) === 0xC2) return { size: pfx + 1 + iw, mnemonic: prefixName + `JP ${cc[(op >> 3) & 7]},${hexImm(pc + 1, iw)}` };
  if (op === 0xCD) return { size: pfx + 1 + iw, mnemonic: prefixName + `CALL ${hexImm(pc + 1, iw)}` };
  if ((op & 0xC7) === 0xC4) return { size: pfx + 1 + iw, mnemonic: prefixName + `CALL ${cc[(op >> 3) & 7]},${hexImm(pc + 1, iw)}` };
  // JR/DJNZ always use 1-byte displacement (not affected by prefix)
  if (op === 0x18) return { size: pfx + 2, mnemonic: prefixName + `JR ${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: pfx + 2, mnemonic: prefixName + `JR ${cc[(op >> 3) & 3]},${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };
  if (op === 0x10) return { size: pfx + 2, mnemonic: prefixName + `DJNZ ${hex(relTarget(pc, 2, romByte(pc + 1)), 6)}` };

  // Memory loads use iw for address width
  if (op === 0x3A) return { size: pfx + 1 + iw, mnemonic: prefixName + `LD A,(${hexImm(pc + 1, iw)})` };
  if (op === 0x32) return { size: pfx + 1 + iw, mnemonic: prefixName + `LD (${hexImm(pc + 1, iw)}),A` };
  if (op === 0x2A) return { size: pfx + 1 + iw, mnemonic: prefixName + `LD HL,(${hexImm(pc + 1, iw)})` };
  if (op === 0x22) return { size: pfx + 1 + iw, mnemonic: prefixName + `LD (${hexImm(pc + 1, iw)}),HL` };

  if (op === 0x02) return { size: pfx + 1, mnemonic: prefixName + 'LD (BC),A' };
  if (op === 0x0A) return { size: pfx + 1, mnemonic: prefixName + 'LD A,(BC)' };
  if (op === 0x12) return { size: pfx + 1, mnemonic: prefixName + 'LD (DE),A' };
  if (op === 0x1A) return { size: pfx + 1, mnemonic: prefixName + 'LD A,(DE)' };

  if (op === 0xED) {
    const op2 = romByte(pc + 1);
    if (op2 === 0xB0) return { size: pfx + 2, mnemonic: prefixName + 'LDIR' };
    if (op2 === 0xB8) return { size: pfx + 2, mnemonic: prefixName + 'LDDR' };
    if (op2 === 0xB1) return { size: pfx + 2, mnemonic: prefixName + 'CPIR' };
    if (op2 === 0xB9) return { size: pfx + 2, mnemonic: prefixName + 'CPDR' };
    if (op2 === 0xA0) return { size: pfx + 2, mnemonic: prefixName + 'LDI' };
    if (op2 === 0xA8) return { size: pfx + 2, mnemonic: prefixName + 'LDD' };
    if (op2 === 0xA1) return { size: pfx + 2, mnemonic: prefixName + 'CPI' };
    if (op2 === 0xA9) return { size: pfx + 2, mnemonic: prefixName + 'CPD' };
    if (op2 === 0x44) return { size: pfx + 2, mnemonic: prefixName + 'NEG' };
    if (op2 === 0x4D) return { size: pfx + 2, mnemonic: prefixName + 'RETI' };
    if (op2 === 0x45) return { size: pfx + 2, mnemonic: prefixName + 'RETN' };
    if (op2 === 0x46) return { size: pfx + 2, mnemonic: prefixName + 'IM 0' };
    if (op2 === 0x56) return { size: pfx + 2, mnemonic: prefixName + 'IM 1' };
    if (op2 === 0x5E) return { size: pfx + 2, mnemonic: prefixName + 'IM 2' };
    if (op2 === 0x47) return { size: pfx + 2, mnemonic: prefixName + 'LD I,A' };
    if (op2 === 0x4F) return { size: pfx + 2, mnemonic: prefixName + 'LD R,A' };
    if (op2 === 0x57) return { size: pfx + 2, mnemonic: prefixName + 'LD A,I' };
    if (op2 === 0x5F) return { size: pfx + 2, mnemonic: prefixName + 'LD A,R' };
    if (op2 === 0x67) return { size: pfx + 2, mnemonic: prefixName + 'RRD' };
    if (op2 === 0x6F) return { size: pfx + 2, mnemonic: prefixName + 'RLD' };
    // ED loads use iw for address
    if ([0x4B, 0x5B, 0x6B, 0x7B].includes(op2)) return { size: pfx + 2 + iw, mnemonic: prefixName + `LD ${rp[(op2 >> 4) & 3]},(${hexImm(pc + 2, iw)})` };
    if ([0x43, 0x53, 0x63, 0x73].includes(op2)) return { size: pfx + 2 + iw, mnemonic: prefixName + `LD (${hexImm(pc + 2, iw)}),${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xCF) === 0x42) return { size: pfx + 2, mnemonic: prefixName + `SBC HL,${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xCF) === 0x4A) return { size: pfx + 2, mnemonic: prefixName + `ADC HL,${rp[(op2 >> 4) & 3]}` };
    if ((op2 & 0xC7) === 0x40) return { size: pfx + 2, mnemonic: prefixName + `IN ${regs8[(op2 >> 3) & 7]},(C)` };
    if ((op2 & 0xC7) === 0x41) return { size: pfx + 2, mnemonic: prefixName + `OUT (C),${regs8[(op2 >> 3) & 7]}` };
    return { size: pfx + 2, mnemonic: prefixName + `ED ${hex(op2, 2)}` };
  }

  if (op === 0xFE) return { size: pfx + 2, mnemonic: prefixName + `CP ${hex(romByte(pc + 1), 2)}` };
  if ((op & 0xF8) === 0xB8) return { size: pfx + 1, mnemonic: prefixName + `CP ${regs8[op & 7]}` };

  if ((op & 0xC0) === 0x40) return { size: pfx + 1, mnemonic: prefixName + `LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}` };
  if ((op & 0xC0) === 0x80) return { size: pfx + 1, mnemonic: prefixName + `${alu[(op >> 3) & 7]} ${regs8[op & 7]}` };
  if ((op & 0xC7) === 0x04) return { size: pfx + 1, mnemonic: prefixName + `INC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { size: pfx + 1, mnemonic: prefixName + `DEC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { size: pfx + 2, mnemonic: prefixName + `LD ${regs8[(op >> 3) & 7]},${hex(romByte(pc + 1), 2)}` };
  // LD rp,imm uses iw
  if ((op & 0xCF) === 0x01) return { size: pfx + 1 + iw, mnemonic: prefixName + `LD ${rp[(op >> 4) & 3]},${hexImm(pc + 1, iw)}` };
  if ((op & 0xCF) === 0x03) return { size: pfx + 1, mnemonic: prefixName + `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { size: pfx + 1, mnemonic: prefixName + `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { size: pfx + 1, mnemonic: prefixName + `ADD HL,${rp[(op >> 4) & 3]}` };

  if (op === 0xD3) return { size: pfx + 2, mnemonic: prefixName + `OUT (${hex(romByte(pc + 1), 2)}),A` };
  if (op === 0xDB) return { size: pfx + 2, mnemonic: prefixName + `IN A,(${hex(romByte(pc + 1), 2)})` };

  const immAlu = {
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR',
  };
  if (op in immAlu) return { size: pfx + 2, mnemonic: prefixName + `${immAlu[op]} ${hex(romByte(pc + 1), 2)}` };

  return { size: pfx + 1, mnemonic: prefixName + `DB ${hex(op, 2)}` };
}

// ---------- Disassemble until function boundary ----------
function disassembleFunction(start, maxBytes = 200) {
  const instructions = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end) {
    const ins = decode(pc);
    instructions.push({ addr: pc, ...ins });

    // Unconditional RET = function boundary
    if (ins.mnemonic === 'RET') break;
    // Unconditional JP (not conditional) also ends a function
    if (ins.mnemonic.startsWith('JP ') && !ins.mnemonic.includes(',') && !ins.mnemonic.includes('(')) break;

    pc += ins.size;
  }
  return instructions;
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

// ==========================================================
// MAIN
// ==========================================================

const START = 0x0BA561;

console.log('PHASE 572: Decode 0x0BA561');
console.log('==========================');
console.log(`ROM size: ${rom.length} bytes`);

// ---------- 1. Raw bytes (first 64) ----------
console.log('\n=== RAW BYTES (first 64 from 0x0BA561) ===\n');
{
  const bytes = [];
  for (let i = START; i < START + 64 && i < rom.length; i++) {
    bytes.push(romByte(i).toString(16).toUpperCase().padStart(2, '0'));
  }
  for (let r = 0; r < bytes.length; r += 16) {
    const row = bytes.slice(r, r + 16).join(' ');
    console.log(`  ${hex(START + r, 6)}  ${row}`);
  }
}

// ---------- 2. Function disassembly ----------
console.log('\n=== FUNCTION DISASSEMBLY (0x0BA561, up to 200 bytes or RET) ===\n');
const funcInstructions = disassembleFunction(START, 200);
for (const ins of funcInstructions) {
  const bytes = [];
  for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
  const byteStr = bytes.join(' ').padEnd(20);
  console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
}
const lastIns = funcInstructions[funcInstructions.length - 1];
const funcEnd = lastIns.addr + lastIns.size;
const funcSize = funcEnd - START;
console.log(`\n  Total instructions: ${funcInstructions.length}, function size: ${funcSize} bytes`);
console.log(`  Range: ${hex(START, 6)} - ${hex(funcEnd - 1, 6)}`);
console.log(`  Ends with: ${lastIns.mnemonic}`);

// ---------- 3. Extended context (what comes after) ----------
console.log('\n=== CONTEXT AFTER FUNCTION (next 32 bytes) ===\n');
{
  const contextInstructions = disassembleLinear(funcEnd, funcEnd + 32);
  for (const ins of contextInstructions) {
    const bytes = [];
    for (let i = 0; i < ins.size; i++) bytes.push(romByte(ins.addr + i).toString(16).toUpperCase().padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);
    console.log(`  ${hex(ins.addr, 6)}  ${byteStr} ${ins.mnemonic}`);
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

for (const ins of funcInstructions) {
  const mn = ins.mnemonic;
  if (mn.startsWith('CP ') || mn === 'CP (HL)') cps.push(ins);
  if (mn.startsWith('CALL ')) calls.push(ins);
  if (mn.startsWith('JP ') && !mn.startsWith('JP (')) jps.push(ins);
  if (mn === 'RET' || mn.match(/^RET /)) rets.push(ins);

  const iyMatch = mn.match(/\(IY([+-]0x[0-9A-F]+)\)/);
  if (iyMatch) {
    const offsetStr = iyMatch[1];
    const offset = offsetStr.startsWith('-')
      ? -parseInt(offsetStr.slice(1), 16)
      : parseInt(offsetStr.replace('+', ''), 16);
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

console.log('CALL targets:');
for (const ins of calls) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (calls.length === 0) console.log('  (none)');

console.log('\nJP targets:');
for (const ins of jps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (jps.length === 0) console.log('  (none)');

console.log('\nRET instructions:');
for (const ins of rets) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (rets.length === 0) console.log('  (none)');

console.log('\nCP comparisons:');
for (const ins of cps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
if (cps.length === 0) console.log('  (none)');

console.log('\nIY-relative operations:');
for (const ins of iyOps) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; => ${hex(ins.iyAddr, 6)}`);
if (iyOps.length === 0) console.log('  (none)');

console.log('\nRAM accesses (0xD00000-0xD3FFFF):');
for (const ins of ramAccesses) console.log(`  ${hex(ins.addr, 6)}  ${ins.mnemonic}  ; RAM ${hex(ins.ramAddr, 6)}`);
if (ramAccesses.length === 0) console.log('  (none)');

// ---------- 5. Callers of 0x0BA561 ----------
console.log('\n=== CALLERS OF 0x0BA561 ===\n');
const callers = scanCallers(0x0BA561);
for (const c of callers) {
  console.log(`  ${hex(c.addr, 6)}  ${c.type} 0x0BA561`);
}
console.log(`\n  Total: ${callers.length} callers`);

// ---------- 6. Fall-through check ----------
console.log('\n=== FALL-THROUGH CHECK (what precedes 0x0BA561?) ===\n');
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
    console.log(`\n  Last instruction before 0x0BA561: ${mn}`);
    console.log(`  Falls through: ${fallsThrough ? 'YES' : 'NO — 0x0BA561 is a clean entry point'}`);
  }
}

// ---------- 7. Cross-reference unique RAM addresses ----------
console.log('\n=== RAM ADDRESS CROSS-REFERENCES ===\n');
const uniqueRam = [...new Set(ramAccesses.map(r => r.ramAddr))];
for (const ramAddr of uniqueRam) {
  const lo = ramAddr & 0xFF;
  const mid = (ramAddr >> 8) & 0xFF;
  const hi = (ramAddr >> 16) & 0xFF;
  let refCount = 0;
  for (let a = 0; a < rom.length - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      refCount++;
    }
  }
  console.log(`  ${hex(ramAddr, 6)}: ${refCount} byte-pattern occurrences in ROM`);
}
if (uniqueRam.length === 0) console.log('  (no RAM addresses found in function body)');

// ---------- 8. Sub-call targets decode (first 16 bytes of each) ----------
console.log('\n=== SUB-CALL TARGET PREVIEWS ===\n');
const callTargets = [...new Set(calls.map(c => {
  const m = c.mnemonic.match(/0x([0-9A-F]{6})/);
  return m ? parseInt(m[1], 16) : null;
}).filter(Boolean))];

for (const target of callTargets) {
  console.log(`  --- ${hex(target, 6)} ---`);
  const preview = disassembleLinear(target, target + 16);
  for (const ins of preview) {
    console.log(`    ${hex(ins.addr, 6)}  ${ins.mnemonic}`);
  }
}

// ---------- 9. Data references ----------
console.log('\n=== DATA REFERENCES TO 0x0BA561 (non-CALL/JP) ===\n');
{
  const lo = 0x61, mid = 0xA5, hi = 0x0B;
  let count = 0;
  for (let a = 0; a < rom.length - 2; a++) {
    if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
      const isCaller = callers.some(c => c.addr + 1 === a);
      if (!isCaller) {
        console.log(`  ${hex(a, 6)}  (bytes: ${hex(rom[a > 0 ? a-1 : 0], 2)} ${hex(lo)} ${hex(mid)} ${hex(hi)} ${hex(rom[a+3] || 0, 2)})`);
        count++;
      }
    }
  }
  console.log(`  Total non-CALL/JP data references: ${count}`);
}

// ---------- 10. Summary ----------
console.log('\n=== STRUCTURED SUMMARY ===\n');
console.log(`Function: 0x0BA561`);
console.log(`Size: ${funcSize} bytes (${hex(START, 6)} - ${hex(funcEnd - 1, 6)})`);
console.log(`Instructions: ${funcInstructions.length}`);
console.log(`Ends with: ${lastIns.mnemonic}`);
console.log(`Callers: ${callers.length}`);
for (const c of callers) console.log(`  ${hex(c.addr, 6)}  ${c.type}`);
console.log(`Sub-calls: ${calls.length}`);
for (const ins of calls) console.log(`  ${ins.mnemonic}`);
console.log(`RAM addresses: ${uniqueRam.length}`);
for (const addr of uniqueRam) console.log(`  ${hex(addr, 6)}`);
console.log(`IY ops: ${iyOps.length}`);
for (const ins of iyOps) console.log(`  ${ins.mnemonic} => ${hex(ins.iyAddr, 6)}`);
console.log(`Comparisons: ${cps.length}`);
for (const ins of cps) console.log(`  ${ins.mnemonic}`);

console.log('\nDone.');
process.exit(0);
