#!/usr/bin/env node
/**
 * probe-phase562-decode-08C308.mjs
 * Decode function at 0x08C308 - BPP mode test predicate.
 * Called from 0x0A1A9D; returns Z=8bpp, NZ=16bpp.
 * Session 553 labeled this as "BIT 2,D000C6 BPP mode" - verify.
 * Read-only probe: no modifications to any existing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const BASE = 0x08C308;
const READ_LEN = 100;

// Hex dump
console.log(`\n=== HEX DUMP: 0x${BASE.toString(16).toUpperCase()} (${READ_LEN} bytes) ===`);
for (let i = 0; i < READ_LEN; i += 16) {
  const addr = BASE + i;
  const hex_ = [];
  const ascii = [];
  for (let j = 0; j < 16 && i + j < READ_LEN; j++) {
    const b = romBytes[addr + j];
    hex_.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${hex_.join(' ').padEnd(48)}  ${ascii.join('')}`);
}

// eZ80 ADL-mode disassembler (minimal)

function read24(off) {
  return romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function hex(v, digits) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0');
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function disassemble(startAddr, maxBytes) {
  const instructions = [];
  const callTargets = [];
  const ramAddrs = [];
  const ioAddrs = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const instrStart = pc;
    let prefix = null;
    let indexReg = 'HL';
    let indexH = 'H';
    let indexL = 'L';
    let sisMode = false;
    let op = romBytes[pc++];

    if (op === 0x40) {
      const next = romBytes[pc];
      if (next === 0xDD || next === 0xFD || next === 0xED || next === 0xCB ||
          next === 0xCD || next === 0xC3 || next === 0xC9 ||
          (next >= 0xC0 && next <= 0xFF) ||
          next === 0x21 || next === 0x01 || next === 0x11 || next === 0x31 ||
          next === 0x3A || next === 0x32 || next === 0x2A || next === 0x22 ||
          next === 0xE5 || next === 0xE1) {
        sisMode = true;
        op = romBytes[pc++];
      } else {
        instructions.push({ addr: instrStart, bytes: '40', mnemonic: 'LD B, B', comment: '' });
        continue;
      }
    }

    if (op === 0xDD || op === 0xFD) {
      prefix = op;
      indexReg = op === 0xDD ? 'IX' : 'IY';
      indexH = op === 0xDD ? 'IXH' : 'IYH';
      indexL = op === 0xDD ? 'IXL' : 'IYL';
      op = romBytes[pc++];
    }

    const sisStr = sisMode ? '.SIS ' : '';
    let mnemonic = '';
    let comment = '';

    if (op === 0xCB) {
      if (prefix) {
        const disp = signedByte(romBytes[pc++]);
        const cbOp = romBytes[pc++];
        const bitNum = (cbOp >> 3) & 7;
        const dispStr = disp >= 0 ? `+${hex(disp)}` : `-${hex(-disp)}`;
        if ((cbOp & 0xC0) === 0x40) {
          mnemonic = `${sisStr}BIT ${bitNum}, (${indexReg}${dispStr})`;
          if (indexReg === 'IY') {
            const iyBase = 0xD00080;
            const ramAddr = iyBase + (disp & 0xFF);
            comment = `tests bit ${bitNum} of RAM ${hex(ramAddr, 6)}`;
            ramAddrs.push(ramAddr);
          }
        } else if ((cbOp & 0xC0) === 0x80) {
          mnemonic = `${sisStr}RES ${bitNum}, (${indexReg}${dispStr})`;
        } else if ((cbOp & 0xC0) === 0xC0) {
          mnemonic = `${sisStr}SET ${bitNum}, (${indexReg}${dispStr})`;
        } else {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${sisStr}${shifts[(cbOp >> 3) & 7]} (${indexReg}${dispStr})`;
        }
      } else {
        const cbOp = romBytes[pc++];
        const bitNum = (cbOp >> 3) & 7;
        const reg = r8[cbOp & 7];
        if ((cbOp & 0xC0) === 0x40) {
          mnemonic = `${sisStr}BIT ${bitNum}, ${reg}`;
        } else if ((cbOp & 0xC0) === 0x80) {
          mnemonic = `${sisStr}RES ${bitNum}, ${reg}`;
        } else if ((cbOp & 0xC0) === 0xC0) {
          mnemonic = `${sisStr}SET ${bitNum}, ${reg}`;
        } else {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${sisStr}${shifts[(cbOp >> 3) & 7]} ${reg}`;
        }
      }
    }
    else if (op === 0xED) {
      const edOp = romBytes[pc++];
      switch (edOp) {
        case 0x43: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), BC`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x53: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), DE`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x63: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), HL`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x4B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x5B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x6B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD HL, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x7B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0xB0: mnemonic = `${sisStr}LDIR`; break;
        case 0xB8: mnemonic = `${sisStr}LDDR`; break;
        default: mnemonic = `${sisStr}ED ${hex(edOp)}`; break;
      }
    }
    else {
      switch (op) {
        case 0x00: mnemonic = `${sisStr}NOP`; break;
        case 0x76: mnemonic = `${sisStr}HALT`; break;
        case 0xF3: mnemonic = `${sisStr}DI`; break;
        case 0xFB: mnemonic = `${sisStr}EI`; break;
        case 0xC9: mnemonic = `${sisStr}RET`; break;
        case 0xD9: mnemonic = `${sisStr}EXX`; break;
        case 0xEB: mnemonic = `${sisStr}EX DE, HL`; break;
        case 0xE9: mnemonic = `${sisStr}JP (${indexReg})`; break;
        case 0x37: mnemonic = `${sisStr}SCF`; break;
        case 0x3F: mnemonic = `${sisStr}CCF`; break;

        case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
        case 0x48: case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
        case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: case 0x57:
        case 0x58: case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5E: case 0x5F:
        case 0x60: case 0x61: case 0x62: case 0x63: case 0x64: case 0x65: case 0x66: case 0x67:
        case 0x68: case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6E: case 0x6F:
        case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77:
        case 0x78: case 0x79: case 0x7A: case 0x7B: case 0x7C: case 0x7D: case 0x7E: case 0x7F: {
          let dst = r8[(op >> 3) & 7];
          let src = r8[op & 7];
          if (prefix) {
            if (dst === 'H') dst = indexH;
            if (dst === 'L') dst = indexL;
            if (src === 'H') src = indexH;
            if (src === 'L') src = indexL;
            if (dst === '(HL)' || src === '(HL)') {
              const d = signedByte(romBytes[pc++]);
              const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`;
              if (dst === '(HL)') dst = `(${indexReg}${ds})`;
              if (src === '(HL)') src = `(${indexReg}${ds})`;
            }
          }
          mnemonic = `${sisStr}LD ${dst}, ${src}`;
          break;
        }

        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF: {
          const aluOps = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
          const aluIdx = (op >> 3) & 7;
          let operand = r8[op & 7];
          if (prefix) {
            if (operand === 'H') operand = indexH;
            if (operand === 'L') operand = indexL;
            if (operand === '(HL)') {
              const d = signedByte(romBytes[pc++]);
              const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`;
              operand = `(${indexReg}${ds})`;
            }
          }
          mnemonic = `${sisStr}${aluOps[aluIdx]} ${operand}`;
          break;
        }

        case 0xC6: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADD A, ${hex(n)}`; break; }
        case 0xCE: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADC A, ${hex(n)}`; break; }
        case 0xD6: { const n = romBytes[pc++]; mnemonic = `${sisStr}SUB ${hex(n)}`; break; }
        case 0xDE: { const n = romBytes[pc++]; mnemonic = `${sisStr}SBC A, ${hex(n)}`; break; }
        case 0xE6: { const n = romBytes[pc++]; mnemonic = `${sisStr}AND ${hex(n)}`; break; }
        case 0xEE: { const n = romBytes[pc++]; mnemonic = `${sisStr}XOR ${hex(n)}`; break; }
        case 0xF6: { const n = romBytes[pc++]; mnemonic = `${sisStr}OR ${hex(n)}`; break; }
        case 0xFE: { const n = romBytes[pc++]; mnemonic = `${sisStr}CP ${hex(n)}`; break; }

        case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x36: case 0x3E: {
          let reg = r8[(op >> 3) & 7];
          if (prefix && reg === 'H') reg = indexH;
          if (prefix && reg === 'L') reg = indexL;
          if (prefix && reg === '(HL)') {
            const d = signedByte(romBytes[pc++]);
            const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`;
            reg = `(${indexReg}${ds})`;
          }
          const n = romBytes[pc++];
          mnemonic = `${sisStr}LD ${reg}, ${hex(n)}`;
          break;
        }

        case 0x01: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, ${hex(a,6)}`; break; }
        case 0x11: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, ${hex(a,6)}`; break; }
        case 0x21: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD ${indexReg}, ${hex(a,6)}`; break; }
        case 0x31: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, ${hex(a,6)}`; break; }

        case 0x03: mnemonic = `${sisStr}INC BC`; break;
        case 0x13: mnemonic = `${sisStr}INC DE`; break;
        case 0x23: mnemonic = `${sisStr}INC ${indexReg}`; break;
        case 0x33: mnemonic = `${sisStr}INC SP`; break;
        case 0x0B: mnemonic = `${sisStr}DEC BC`; break;
        case 0x1B: mnemonic = `${sisStr}DEC DE`; break;
        case 0x2B: mnemonic = `${sisStr}DEC ${indexReg}`; break;
        case 0x3B: mnemonic = `${sisStr}DEC SP`; break;

        case 0xC5: mnemonic = `${sisStr}PUSH BC`; break;
        case 0xD5: mnemonic = `${sisStr}PUSH DE`; break;
        case 0xE5: mnemonic = `${sisStr}PUSH ${indexReg}`; break;
        case 0xF5: mnemonic = `${sisStr}PUSH AF`; break;
        case 0xC1: mnemonic = `${sisStr}POP BC`; break;
        case 0xD1: mnemonic = `${sisStr}POP DE`; break;
        case 0xE1: mnemonic = `${sisStr}POP ${indexReg}`; break;
        case 0xF1: mnemonic = `${sisStr}POP AF`; break;

        case 0xC3: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}JP ${hex(a,6)}`; callTargets.push({addr: a, type: 'JP'}); break; }
        case 0xCD: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}CALL ${hex(a,6)}`; callTargets.push({addr: a, type: 'CALL'}); break; }

        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const c = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}JP ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `JP ${c}`});
          break;
        }

        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}CALL ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `CALL ${c}`});
          break;
        }

        case 0xC0: mnemonic = `${sisStr}RET NZ`; break;
        case 0xC8: mnemonic = `${sisStr}RET Z`; break;
        case 0xD0: mnemonic = `${sisStr}RET NC`; break;
        case 0xD8: mnemonic = `${sisStr}RET C`; break;
        case 0xE0: mnemonic = `${sisStr}RET PO`; break;
        case 0xE8: mnemonic = `${sisStr}RET PE`; break;
        case 0xF0: mnemonic = `${sisStr}RET P`; break;
        case 0xF8: mnemonic = `${sisStr}RET M`; break;

        case 0x18: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR'}); break; }
        case 0x20: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NZ, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NZ'}); break; }
        case 0x28: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR Z, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR Z'}); break; }
        case 0x30: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NC, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NC'}); break; }
        case 0x38: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR C, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR C'}); break; }

        case 0x10: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}DJNZ ${hex(t,6)}`; callTargets.push({addr: t, type: 'DJNZ'}); break; }

        case 0x3A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD A, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x32: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), A`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x2A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD ${indexReg}, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x22: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), ${indexReg}`; trackAddr(a, ramAddrs, ioAddrs); break; }

        case 0x02: mnemonic = `${sisStr}LD (BC), A`; break;
        case 0x12: mnemonic = `${sisStr}LD (DE), A`; break;
        case 0x0A: mnemonic = `${sisStr}LD A, (BC)`; break;
        case 0x1A: mnemonic = `${sisStr}LD A, (DE)`; break;

        default:
          mnemonic = `${sisStr}DB ${hex(op)}  ; unknown`;
          break;
      }
    }

    const bytes = [];
    for (let i = instrStart; i < pc; i++) bytes.push(romBytes[i].toString(16).padStart(2, '0'));
    instructions.push({ addr: instrStart, bytes: bytes.join(' '), mnemonic, comment });

    // Stop after unconditional RET past the first byte
    if (mnemonic === 'RET' && pc - startAddr > 2) {
      break;
    }

    // Stop on unconditional JP (tail call) to outside this function
    if (mnemonic.match(/^JP 0x/) && !mnemonic.match(/JP (NZ|Z|NC|C|PO|PE|P|M)/)) {
      const target = parseInt(mnemonic.split(' ')[1], 16);
      if (target < startAddr || target > startAddr + maxBytes) {
        break;
      }
    }
  }

  return { instructions, callTargets, ramAddrs, ioAddrs, length: pc - startAddr };
}

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) {
    ioAddrs.push(addr);
  } else if (addr >= 0xD00000) {
    ramAddrs.push(addr);
  }
}

// Run disassembly
console.log(`\n=== DISASSEMBLY: 0x${BASE.toString(16).toUpperCase()} ===`);
const result = disassemble(BASE, READ_LEN);

for (const instr of result.instructions) {
  const addrStr = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(18);
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${instr.comment ? '  ; ' + instr.comment : ''}`);
}

// Summary
console.log(`\n=== SUMMARY ===`);
console.log(`Function start: ${hex(BASE, 6)}`);
console.log(`Function length: ${result.length} bytes (ends at ${hex(BASE + result.length, 6)})`);
console.log(`Total instructions: ${result.instructions.length}`);

if (result.ramAddrs.length > 0) {
  const unique = [...new Set(result.ramAddrs)].sort();
  console.log(`\nRAM addresses accessed:`);
  for (const a of unique) {
    let label = '';
    const iyBase = 0xD00080;
    const offset = a - iyBase;
    if (offset >= 0 && offset < 0x100) {
      label = `  (IY+${hex(offset)}, OS flag byte)`;
    } else if (a >= 0xD00000 && a < 0xD00080) {
      label = '  (OS low RAM)';
    }
    console.log(`  ${hex(a, 6)}${label}`);
  }
}

if (result.callTargets.length > 0) {
  console.log(`\nBranch/call targets:`);
  for (const t of result.callTargets) {
    console.log(`  ${t.type.padEnd(8)} -> ${hex(t.addr, 6)}`);
  }
}

// Interpretation
console.log(`\n=== INTERPRETATION ===`);

const mnemonics = result.instructions.map(i => i.mnemonic);
const isBitRetStub = result.instructions.length <= 3 &&
  mnemonics.some(m => m.startsWith('BIT ')) &&
  mnemonics.includes('RET');

if (isBitRetStub) {
  console.log(`Structure: Simple BIT/RET flag-test stub`);
  const bitInstr = result.instructions.find(i => i.mnemonic.startsWith('BIT '));
  console.log(`Flag test: ${bitInstr.mnemonic}`);
  if (bitInstr.comment) console.log(`  ${bitInstr.comment}`);
  console.log(`Returns: Z flag reflects the tested bit`);
  console.log(`  Z=1 (bit clear) -> caller takes Z path (8bpp)`);
  console.log(`  Z=0 (bit set)   -> caller takes NZ path (16bpp)`);
} else {
  console.log(`Structure: NOT a simple BIT/RET stub (${result.instructions.length} instructions)`);
  console.log(`Further analysis needed.`);
}

// Verify session 553 claim
console.log(`\n=== VERIFICATION: Session 553 claim ===`);
console.log(`Claim: "BIT 2, D000C6 BPP mode"`);
console.log(`Expected encoding: FD CB 46 56`);
console.log(`  FD = IY prefix`);
console.log(`  CB = bit-operation prefix`);
console.log(`  46 = displacement (IY+0x46 = 0xD00080+0x46 = 0xD000C6)`);
console.log(`  56 = BIT 2,(IY+d) opcode`);

const expectedBytes = [0xFD, 0xCB, 0x46, 0x56];
const actualBytes = [];
for (let i = 0; i < 4; i++) actualBytes.push(romBytes[BASE + i]);
const match = expectedBytes.every((b, i) => b === actualBytes[i]);
console.log(`\nActual bytes at ${hex(BASE,6)}: ${actualBytes.map(b => hex(b)).join(' ')}`);
console.log(`Expected bytes:                 ${expectedBytes.map(b => hex(b)).join(' ')}`);
console.log(`Match: ${match ? 'YES - session 553 CONFIRMED' : 'NO - session 553 INCORRECT'}`);

if (!match) {
  console.log(`\nActual instruction decoded above - see disassembly for correct interpretation.`);
}

console.log(`\nDone.`);