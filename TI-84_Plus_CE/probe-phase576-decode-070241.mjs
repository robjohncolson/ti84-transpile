#!/usr/bin/env node
// Phase 576: Decode 0x070241 — Path C exit target from font param writer.
// Session 575 found that 0x06F717 exits via JP 0x070241 instead of the
// shared tail at 0x06F7B9. D02AC8 (font/display mode selector) has 6 refs
// in the 0x070xxx region: 0x070249, 0x070270, 0x0702DC, 0x070387, 0x0703B1, 0x07040F.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

console.log(`ROM size: 0x${rom.length.toString(16)} bytes`);

// ---- Helpers ----

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signed8(v) {
  return v < 0x80 ? v : v - 0x100;
}

function disp(v) {
  const s = signed8(v);
  return s >= 0 ? `+${hex(s, 2)}` : `-${hex(-s, 2)}`;
}

// Known D02AC8 refs from session 575
const D02AC8_REF_ADDRS = new Set([0x070249, 0x070270, 0x0702DC, 0x070387, 0x0703B1, 0x07040F]);

// ---- Minimal eZ80 ADL-mode disassembler ----

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const SHIFT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decode(pc) {
  const start = pc;
  let op = rom[pc++];

  // DD/FD prefix
  if (op === 0xDD || op === 0xFD) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    const op2 = rom[pc++];

    // DD/FD CB dd op — indexed bit ops
    if (op2 === 0xCB) {
      const d = rom[pc++];
      const cb = rom[pc++];
      const bit = (cb >> 3) & 7;
      const hi = cb >> 6;
      const target = `(${reg}${disp(d)})`;
      if (hi === 1) return mk(start, pc, 'BIT', `${bit},${target}`);
      if (hi === 2) return mk(start, pc, 'RES', `${bit},${target}`);
      if (hi === 3) return mk(start, pc, 'SET', `${bit},${target}`);
      return mk(start, pc, SHIFT[bit], target);
    }

    // LD reg,nn24
    if (op2 === 0x21) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `${reg},${hex(nn)}`); }
    // LD (nn),reg
    if (op2 === 0x22) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `(${hex(nn)}),${reg}`); }
    // LD reg,(nn)
    if (op2 === 0x2A) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `${reg},(${hex(nn)})`); }
    // LD (reg+d),n
    if (op2 === 0x36) { const d2 = rom[pc++]; const n = rom[pc++]; return mk(start, pc, 'LD', `(${reg}${disp(d2)}),${hex(n, 2)}`); }
    // ADD reg,rp
    if (op2 === 0x09 || op2 === 0x19 || op2 === 0x29 || op2 === 0x39) {
      return mk(start, pc, 'ADD', `${reg},${RP[(op2 >> 4) & 3]}`);
    }
    // INC/DEC reg
    if (op2 === 0x23) return mk(start, pc, 'INC', reg);
    if (op2 === 0x2B) return mk(start, pc, 'DEC', reg);
    // PUSH/POP
    if (op2 === 0xE5) return mk(start, pc, 'PUSH', reg);
    if (op2 === 0xE1) return mk(start, pc, 'POP', reg);
    // JP (reg)
    if (op2 === 0xE9) return mk(start, pc, 'JP', `(${reg})`);
    // LD SP,reg
    if (op2 === 0xF9) return mk(start, pc, 'LD', `SP,${reg}`);
    // EX (SP),reg
    if (op2 === 0xE3) return mk(start, pc, 'EX', `(SP),${reg}`);
    // LD r,(reg+d) / LD (reg+d),r
    if ((op2 & 0xC7) === 0x46 && op2 !== 0x76) {
      const d2 = rom[pc++];
      return mk(start, pc, 'LD', `${R8[(op2 >> 3) & 7]},(${reg}${disp(d2)})`);
    }
    if ((op2 & 0xF8) === 0x70 && op2 !== 0x76) {
      const d2 = rom[pc++];
      return mk(start, pc, 'LD', `(${reg}${disp(d2)}),${R8[op2 & 7]}`);
    }
    // ALU (reg+d)
    if ((op2 & 0xC7) === 0x86) {
      const d2 = rom[pc++];
      return mk(start, pc, ALU[(op2 >> 3) & 7], `(${reg}${disp(d2)})`);
    }
    // INC/DEC (reg+d)
    if (op2 === 0x34) { const d2 = rom[pc++]; return mk(start, pc, 'INC', `(${reg}${disp(d2)})`); }
    if (op2 === 0x35) { const d2 = rom[pc++]; return mk(start, pc, 'DEC', `(${reg}${disp(d2)})`); }

    return mk(start, pc, 'DB', `${hexByte(op)} ${hexByte(op2)}`);
  }

  // ED prefix
  if (op === 0xED) {
    const op2 = rom[pc++];
    if (op2 === 0xB0) return mk(start, pc, 'LDIR', '');
    if (op2 === 0xB8) return mk(start, pc, 'LDDR', '');
    if (op2 === 0xB1) return mk(start, pc, 'CPIR', '');
    if (op2 === 0xB9) return mk(start, pc, 'CPDR', '');
    if (op2 === 0xA0) return mk(start, pc, 'LDI', '');
    if (op2 === 0xA8) return mk(start, pc, 'LDD', '');
    if ((op2 & 0xCF) === 0x43) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `(${hex(nn)}),${RP[(op2 >> 4) & 3]}`); }
    if ((op2 & 0xCF) === 0x4B) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `${RP[(op2 >> 4) & 3]},(${hex(nn)})`); }
    if ((op2 & 0xCF) === 0x42) return mk(start, pc, 'SBC', `HL,${RP[(op2 >> 4) & 3]}`);
    if ((op2 & 0xCF) === 0x4A) return mk(start, pc, 'ADC', `HL,${RP[(op2 >> 4) & 3]}`);
    if ((op2 & 0xCF) === 0x4C) return mk(start, pc, 'MLT', RP[(op2 >> 4) & 3]);
    if (op2 === 0x44) return mk(start, pc, 'NEG', '');
    if (op2 === 0x45) return mk(start, pc, 'RETN', '');
    if (op2 === 0x4D) return mk(start, pc, 'RETI', '');
    if (op2 === 0x46) return mk(start, pc, 'IM', '0');
    if (op2 === 0x56) return mk(start, pc, 'IM', '1');
    if (op2 === 0x5E) return mk(start, pc, 'IM', '2');
    if (op2 === 0x57) return mk(start, pc, 'LD', 'A,I');
    if (op2 === 0x5F) return mk(start, pc, 'LD', 'A,R');
    if (op2 === 0x47) return mk(start, pc, 'LD', 'I,A');
    if (op2 === 0x4F) return mk(start, pc, 'LD', 'R,A');
    if (op2 === 0x78) return mk(start, pc, 'IN', 'A,(C)');
    if (op2 === 0x79) return mk(start, pc, 'OUT', '(C),A');
    if (op2 === 0x64) { const n = rom[pc++]; return mk(start, pc, 'TST', `A,${hex(n, 2)}`); }
    // LEA rr,IX/IY+d (eZ80)
    if (op2 === 0x02) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `BC,IX${disp(d2)}`); }
    if (op2 === 0x03) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `BC,IY${disp(d2)}`); }
    if (op2 === 0x12) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `DE,IX${disp(d2)}`); }
    if (op2 === 0x13) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `DE,IY${disp(d2)}`); }
    if (op2 === 0x32) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `HL,IX${disp(d2)}`); }
    if (op2 === 0x33) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `HL,IY${disp(d2)}`); }
    if (op2 === 0x54) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `IX,IX${disp(d2)}`); }
    if (op2 === 0x55) { const d2 = rom[pc++]; return mk(start, pc, 'LEA', `IY,IY${disp(d2)}`); }
    return mk(start, pc, 'DB', `ED ${hexByte(op2)}`);
  }

  // CB prefix (non-indexed bit ops)
  if (op === 0xCB) {
    const op2 = rom[pc++];
    const bit = (op2 >> 3) & 7;
    const reg = R8[op2 & 7];
    const hi = op2 >> 6;
    if (hi === 0) return mk(start, pc, SHIFT[bit], reg);
    if (hi === 1) return mk(start, pc, 'BIT', `${bit},${reg}`);
    if (hi === 2) return mk(start, pc, 'RES', `${bit},${reg}`);
    return mk(start, pc, 'SET', `${bit},${reg}`);
  }

  // Main opcode table
  if (op === 0x00) return mk(start, pc, 'NOP', '');
  if (op === 0x76) return mk(start, pc, 'HALT', '');
  if (op === 0xC9) return mk(start, pc, 'RET', '');
  if (op === 0xF3) return mk(start, pc, 'DI', '');
  if (op === 0xFB) return mk(start, pc, 'EI', '');
  if (op === 0x37) return mk(start, pc, 'SCF', '');
  if (op === 0x3F) return mk(start, pc, 'CCF', '');
  if (op === 0x2F) return mk(start, pc, 'CPL', '');
  if (op === 0x27) return mk(start, pc, 'DAA', '');
  if (op === 0x07) return mk(start, pc, 'RLCA', '');
  if (op === 0x0F) return mk(start, pc, 'RRCA', '');
  if (op === 0x17) return mk(start, pc, 'RLA', '');
  if (op === 0x1F) return mk(start, pc, 'RRA', '');
  if (op === 0xD9) return mk(start, pc, 'EXX', '');
  if (op === 0x08) return mk(start, pc, 'EX', "AF,AF'");
  if (op === 0xEB) return mk(start, pc, 'EX', 'DE,HL');
  if (op === 0xE3) return mk(start, pc, 'EX', '(SP),HL');
  if (op === 0xE9) return mk(start, pc, 'JP', '(HL)');

  // Conditional RET
  if ((op & 0xC7) === 0xC0) return mk(start, pc, 'RET', CC[(op >> 3) & 7]);

  // PUSH/POP
  if ((op & 0xCF) === 0xC5) return mk(start, pc, 'PUSH', RP2[(op >> 4) & 3]);
  if ((op & 0xCF) === 0xC1) return mk(start, pc, 'POP', RP2[(op >> 4) & 3]);

  // JP nn
  if (op === 0xC3) { const nn = u24(pc); pc += 3; return mk(start, pc, 'JP', hex(nn)); }
  // JP cc,nn
  if ((op & 0xC7) === 0xC2) { const nn = u24(pc); pc += 3; return mk(start, pc, 'JP', `${CC[(op >> 3) & 7]},${hex(nn)}`); }
  // CALL nn
  if (op === 0xCD) { const nn = u24(pc); pc += 3; return mk(start, pc, 'CALL', hex(nn)); }
  // CALL cc,nn
  if ((op & 0xC7) === 0xC4) { const nn = u24(pc); pc += 3; return mk(start, pc, 'CALL', `${CC[(op >> 3) & 7]},${hex(nn)}`); }

  // RST
  if ((op & 0xC7) === 0xC7) return mk(start, pc, 'RST', hex(op & 0x38, 2));

  // JR e
  if (op === 0x18) { const e = signed8(rom[pc++]); return mk(start, pc, 'JR', hex(pc + e)); }
  // JR cc,e
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const ccIdx = (op >> 3) & 3;
    const e = signed8(rom[pc++]);
    return mk(start, pc, 'JR', `${['NZ', 'Z', 'NC', 'C'][ccIdx]},${hex(pc + e)}`);
  }
  // DJNZ
  if (op === 0x10) { const e = signed8(rom[pc++]); return mk(start, pc, 'DJNZ', hex(pc + e)); }

  // LD rr,nn24
  if ((op & 0xCF) === 0x01) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `${RP[(op >> 4) & 3]},${hex(nn)}`); }

  // LD (nn),A / LD A,(nn) / LD (nn),HL / LD HL,(nn)
  if (op === 0x32) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `(${hex(nn)}),A`); }
  if (op === 0x3A) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `A,(${hex(nn)})`); }
  if (op === 0x22) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `(${hex(nn)}),HL`); }
  if (op === 0x2A) { const nn = u24(pc); pc += 3; return mk(start, pc, 'LD', `HL,(${hex(nn)})`); }

  // INC/DEC rr
  if ((op & 0xCF) === 0x03) return mk(start, pc, 'INC', RP[(op >> 4) & 3]);
  if ((op & 0xCF) === 0x0B) return mk(start, pc, 'DEC', RP[(op >> 4) & 3]);
  // INC/DEC r
  if ((op & 0xC7) === 0x04) return mk(start, pc, 'INC', R8[(op >> 3) & 7]);
  if ((op & 0xC7) === 0x05) return mk(start, pc, 'DEC', R8[(op >> 3) & 7]);

  // LD r,n
  if ((op & 0xC7) === 0x06) { const n = rom[pc++]; return mk(start, pc, 'LD', `${R8[(op >> 3) & 7]},${hex(n, 2)}`); }

  // ADD HL,rr
  if ((op & 0xCF) === 0x09) return mk(start, pc, 'ADD', `HL,${RP[(op >> 4) & 3]}`);

  // LD r,r'
  if ((op & 0xC0) === 0x40) return mk(start, pc, 'LD', `${R8[(op >> 3) & 7]},${R8[op & 7]}`);

  // ALU A,r
  if ((op & 0xC0) === 0x80) return mk(start, pc, ALU[(op >> 3) & 7], R8[op & 7]);

  // ALU A,n
  if ((op & 0xC7) === 0xC6) { const n = rom[pc++]; return mk(start, pc, ALU[(op >> 3) & 7], hex(n, 2)); }

  // LD (BC/DE),A / LD A,(BC/DE)
  if (op === 0x02) return mk(start, pc, 'LD', '(BC),A');
  if (op === 0x12) return mk(start, pc, 'LD', '(DE),A');
  if (op === 0x0A) return mk(start, pc, 'LD', 'A,(BC)');
  if (op === 0x1A) return mk(start, pc, 'LD', 'A,(DE)');

  // OUT (n),A / IN A,(n)
  if (op === 0xD3) { const n = rom[pc++]; return mk(start, pc, 'OUT', `(${hex(n, 2)}),A`); }
  if (op === 0xDB) { const n = rom[pc++]; return mk(start, pc, 'IN', `A,(${hex(n, 2)})`); }

  return mk(start, pc, 'DB', hexByte(op));
}

function mk(start, end, mnemonic, operands) {
  const bytes = [];
  for (let i = start; i < end; i++) bytes.push(rom[i]);
  return { addr: start, len: end - start, bytes, mnemonic, operands };
}

// ---- Disassemble the full range ----

const RANGE_START = 0x070241;
const RANGE_END = 0x070440;

console.log(`\n=== Phase 576: Decode 0x070241 (Font Param Writer Path C Exit) ===`);
console.log(`Range: ${hex(RANGE_START)} - ${hex(RANGE_END)} (${RANGE_END - RANGE_START} bytes)\n`);

const instructions = [];
let pc = RANGE_START;
while (pc < RANGE_END) {
  const inst = decode(pc);
  instructions.push(inst);
  pc += inst.len;
}

// ---- Collect analysis data ----

const callTargets = new Map();  // target -> [caller addrs]
const jpTargets = new Map();
const jrTargets = new Map();
const ramRefs = new Map();      // ram addr -> [{addr, mnemonic, operands}]
const retAddrs = [];
const iyOps = [];

for (const inst of instructions) {
  const fullAsm = `${inst.mnemonic} ${inst.operands}`.trim();

  // RET
  if (inst.mnemonic === 'RET') retAddrs.push({ addr: inst.addr, cond: inst.operands });

  // CALL targets
  if (inst.mnemonic === 'CALL') {
    // Parse target from operands
    const m = inst.operands.match(/0x([0-9A-F]+)/);
    if (m) {
      const t = parseInt(m[1], 16);
      if (!callTargets.has(t)) callTargets.set(t, []);
      callTargets.get(t).push(inst.addr);
    }
  }

  // JP targets
  if (inst.mnemonic === 'JP' && !inst.operands.startsWith('(')) {
    const m = inst.operands.match(/0x([0-9A-F]+)/);
    if (m) {
      const t = parseInt(m[1], 16);
      if (!jpTargets.has(t)) jpTargets.set(t, []);
      jpTargets.get(t).push(inst.addr);
    }
  }

  // JR/DJNZ targets
  if (inst.mnemonic === 'JR' || inst.mnemonic === 'DJNZ') {
    const m = inst.operands.match(/0x([0-9A-F]+)/);
    if (m) {
      const t = parseInt(m[1], 16);
      if (!jrTargets.has(t)) jrTargets.set(t, []);
      jrTargets.get(t).push(inst.addr);
    }
  }

  // RAM references (any 0xD0xxxx or 0xD1xxxx etc in operands)
  for (const match of inst.operands.matchAll(/0x([0-9A-F]{6})/g)) {
    const addr = parseInt(match[1], 16);
    if (addr >= 0xD00000) {
      if (!ramRefs.has(addr)) ramRefs.set(addr, []);
      ramRefs.get(addr).push({ addr: inst.addr, mnemonic: inst.mnemonic, operands: inst.operands });
    }
  }

  // IY operations (FD CB prefix)
  if (inst.bytes[0] === 0xFD && inst.bytes.length >= 2) {
    if (inst.bytes[1] === 0xCB && inst.bytes.length >= 4) {
      iyOps.push({ addr: inst.addr, asm: fullAsm, type: 'bit-op' });
    } else {
      iyOps.push({ addr: inst.addr, asm: fullAsm, type: 'indexed' });
    }
  }
}

// ---- Print disassembly ----

console.log('--- Disassembly ---');
for (const inst of instructions) {
  const addrStr = hex(inst.addr);
  const bytesStr = inst.bytes.map(hexByte).join(' ').padEnd(16);
  const asmStr = `${inst.mnemonic} ${inst.operands}`.trim().padEnd(32);

  const markers = [];
  if (D02AC8_REF_ADDRS.has(inst.addr)) markers.push('<<< D02AC8 REF (session 575)');
  if (inst.mnemonic === 'RET' && inst.operands === '') markers.push('<<< RET');
  if (inst.mnemonic === 'RET' && inst.operands !== '') markers.push('<<< COND RET');

  // Check if this instruction references D02AC8
  if (inst.operands.includes('0x0D02AC8') || inst.operands.includes('D02AC8')) markers.push('<<< D02AC8');

  const markerStr = markers.length ? `  ; ${markers.join(' | ')}` : '';
  console.log(`${addrStr}  ${bytesStr}  ${asmStr}${markerStr}`);
}

// ---- Summary sections ----

console.log('\n--- RET instructions (function boundaries) ---');
if (retAddrs.length === 0) {
  console.log('  (none found in range)');
} else {
  for (const r of retAddrs) {
    console.log(`  ${hex(r.addr)}${r.cond ? ` (${r.cond})` : ''}`);
  }
}

console.log('\n--- CALL targets ---');
for (const [target, callers] of [...callTargets.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${hex(target)} called from: ${callers.map(a => hex(a)).join(', ')}`);
}

console.log('\n--- JP targets ---');
for (const [target, sources] of [...jpTargets.entries()].sort((a, b) => a[0] - b[0])) {
  const inRange = target >= RANGE_START && target < RANGE_END ? ' (in range)' : '';
  console.log(`  ${hex(target)}${inRange} from: ${sources.map(a => hex(a)).join(', ')}`);
}

console.log('\n--- JR/DJNZ targets ---');
for (const [target, sources] of [...jrTargets.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${hex(target)} from: ${sources.map(a => hex(a)).join(', ')}`);
}

console.log('\n--- RAM address references ---');
for (const [addr, refs] of [...ramRefs.entries()].sort((a, b) => a[0] - b[0])) {
  const d02ac8Mark = addr === 0xD02AC8 ? ' *** D02AC8 ***' : '';
  console.log(`  ${hex(addr)}${d02ac8Mark}: ${refs.map(r => `${hex(r.addr)} ${r.mnemonic} ${r.operands}`).join('; ')}`);
}

console.log('\n--- IY flag/register operations ---');
for (const op of iyOps) {
  console.log(`  ${hex(op.addr)}: ${op.asm} [${op.type}]`);
}

// ---- Scan ROM for callers of 0x070241 ----

console.log('\n--- ROM-wide callers/jumpers to 0x070241 ---');
const targetBytes = [0x41, 0x02, 0x07]; // little-endian 0x070241
const callerOpcodes = {
  0xCD: 'CALL',
  0xC3: 'JP',
  0xC2: 'JP NZ',
  0xCA: 'JP Z',
  0xD2: 'JP NC',
  0xDA: 'JP C',
  0xC4: 'CALL NZ',
  0xCC: 'CALL Z',
  0xD4: 'CALL NC',
  0xDC: 'CALL C',
  0xE4: 'CALL PO',
  0xEC: 'CALL PE',
  0xF4: 'CALL P',
  0xFC: 'CALL M',
  0xE2: 'JP PO',
  0xEA: 'JP PE',
  0xF2: 'JP P',
  0xFA: 'JP M',
};

const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === targetBytes[0] && rom[i + 2] === targetBytes[1] && rom[i + 3] === targetBytes[2]) {
    const opName = callerOpcodes[rom[i]];
    if (opName) {
      callers.push({ addr: i, type: opName });
    }
  }
}

for (const c of callers) {
  console.log(`  ${hex(c.addr)}: ${c.type} 0x070241`);
}
console.log(`Total: ${callers.length} callers/jumpers`);

// ---- D02AC8 byte-pattern scan in wider region ----

console.log('\n--- D02AC8 byte pattern (C8 2A D0) scan in 0x070000-0x070500 ---');
const d02ac8Hits = [];
for (let i = 0x070000; i < 0x070500 && i + 2 < rom.length; i++) {
  if (rom[i] === 0xC8 && rom[i + 1] === 0x2A && rom[i + 2] === 0xD0) {
    // Check preceding opcode
    const prev = i > 0 ? rom[i - 1] : null;
    const ctx = [];
    for (let j = Math.max(0, i - 3); j < Math.min(rom.length, i + 6); j++) {
      ctx.push(hexByte(rom[j]));
    }
    d02ac8Hits.push({ immAddr: i, prevByte: prev, ctx });
    console.log(`  imm@${hex(i)}: prev=${prev !== null ? hexByte(prev) : '--'} ctx=[${ctx.join(' ')}]`);
  }
}
console.log(`Total D02AC8 pattern hits in 0x070000-0x070500: ${d02ac8Hits.length}`);

// Cross-check with session 575's known list
console.log('\n--- Session 575 D02AC8 ref validation ---');
for (const knownAddr of [...D02AC8_REF_ADDRS].sort((a, b) => a - b)) {
  // The ref address points to the instruction, the immediate bytes are typically 1-4 bytes later
  const found = d02ac8Hits.some(h => h.immAddr >= knownAddr && h.immAddr <= knownAddr + 4);
  console.log(`  ${hex(knownAddr)}: ${found ? 'CONFIRMED' : 'NOT FOUND in byte scan (may be indirect)'}`);
}

// ---- Known function cross-references ----

console.log('\n--- Known function references in disassembly ---');
const knownFunctions = {
  0x06F7B9: 'FONT_PARAM_WRITER_TAIL',
  0x06F6E7: 'FONT_PARAM_WRITER',
  0x0A89FE: 'LCD_PARAMETER_COMPUTATION',
  0x0BA57E: 'LCD_PARAMETER_SETTER',
  0x0A8A1D: 'LCD_ROW_HEIGHT_HELPER',
  0x058241: 'OS_MAIN_DISPLAY_REFRESH',
};

for (const [addr, name] of Object.entries(knownFunctions)) {
  const addrNum = Number(addr);
  const callHits = callTargets.get(addrNum) || [];
  const jpHits = jpTargets.get(addrNum) || [];
  if (callHits.length > 0 || jpHits.length > 0) {
    console.log(`  ${hex(addrNum)} (${name}):`);
    for (const c of callHits) console.log(`    CALL from ${hex(c)}`);
    for (const j of jpHits) console.log(`    JP from ${hex(j)}`);
  }
}

console.log('\nDone.');
