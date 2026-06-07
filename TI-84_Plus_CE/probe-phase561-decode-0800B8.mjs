#!/usr/bin/env node
/**
 * probe-phase561-decode-0800B8.mjs
 * Decode function at 0x0800B8 — low-ROM syscall called from 0x0A2013 Y-advance wrapper.
 * Read-only probe: no modifications to any existing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const BASE = 0x0800B8;
const READ_LEN = 200;

// ── Hex dump ──
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

// ── eZ80 ADL-mode disassembler (minimal, sufficient for OS syscalls) ──

function read16(off) {
  return romBytes[off] | (romBytes[off + 1] << 8);
}

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
const r16 = ['BC', 'DE', 'HL', 'SP'];
const r16af = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function disassemble(startAddr, maxBytes) {
  const instructions = [];
  const callTargets = [];
  const ramAddrs = [];
  const ioAddrs = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;
  let foundRet = false;
  let retCount = 0;

  while (pc < end) {
    const instrStart = pc;
    let prefix = null;   // DD=IX, FD=IY
    let indexReg = 'HL';
    let indexH = 'H';
    let indexL = 'L';
    let sisMode = false;
    let op = romBytes[pc++];

    // Check for .SIS prefix (0x40 before an opcode that isn't LD B,B)
    if (op === 0x40) {
      // Peek: if the next byte looks like a real opcode, treat 0x40 as .SIS
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
        // It's LD B,B
        instructions.push({
          addr: instrStart,
          bytes: '40',
          mnemonic: 'LD B, B',
          comment: '',
        });
        continue;
      }
    }

    // Check IX/IY prefix
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

    // Handle CB prefix (bit operations)
    if (op === 0xCB) {
      if (prefix) {
        const disp = signedByte(romBytes[pc++]);
        const cbOp = romBytes[pc++];
        const bitNum = (cbOp >> 3) & 7;
        const dispStr = disp >= 0 ? `+${hex(disp)}` : `-${hex(-disp)}`;
        if ((cbOp & 0xC0) === 0x40) {
          mnemonic = `${sisStr}BIT ${bitNum}, (${indexReg}${dispStr})`;
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
    // Handle ED prefix
    else if (op === 0xED) {
      const edOp = romBytes[pc++];
      switch (edOp) {
        case 0x78: mnemonic = `${sisStr}IN A, (C)`; break;
        case 0x79: mnemonic = `${sisStr}OUT (C), A`; break;
        case 0x70: mnemonic = `${sisStr}IN (C)`; break;
        case 0x71: mnemonic = `${sisStr}OUT (C), 0`; break;
        case 0x40: mnemonic = `${sisStr}IN B, (C)`; break;
        case 0x41: mnemonic = `${sisStr}OUT (C), B`; break;
        case 0x48: mnemonic = `${sisStr}IN C, (C)`; break;
        case 0x49: mnemonic = `${sisStr}OUT (C), C`; break;
        case 0x50: mnemonic = `${sisStr}IN D, (C)`; break;
        case 0x51: mnemonic = `${sisStr}OUT (C), D`; break;
        case 0x58: mnemonic = `${sisStr}IN E, (C)`; break;
        case 0x59: mnemonic = `${sisStr}OUT (C), E`; break;
        case 0x60: mnemonic = `${sisStr}IN H, (C)`; break;
        case 0x61: mnemonic = `${sisStr}OUT (C), H`; break;
        case 0x68: mnemonic = `${sisStr}IN L, (C)`; break;
        case 0x69: mnemonic = `${sisStr}OUT (C), L`; break;
        case 0x42: mnemonic = `${sisStr}SBC HL, BC`; break;
        case 0x52: mnemonic = `${sisStr}SBC HL, DE`; break;
        case 0x62: mnemonic = `${sisStr}SBC HL, HL`; break;
        case 0x72: mnemonic = `${sisStr}SBC HL, SP`; break;
        case 0x4A: mnemonic = `${sisStr}ADC HL, BC`; break;
        case 0x5A: mnemonic = `${sisStr}ADC HL, DE`; break;
        case 0x6A: mnemonic = `${sisStr}ADC HL, HL`; break;
        case 0x7A: mnemonic = `${sisStr}ADC HL, SP`; break;
        case 0x43: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), BC`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x53: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), DE`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x63: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), HL`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x73: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), SP`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x4B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x5B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x6B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD HL, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x7B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x44: mnemonic = `${sisStr}NEG`; break;
        case 0x45: mnemonic = `${sisStr}RETN`; foundRet = true; retCount++; break;
        case 0x4D: mnemonic = `${sisStr}RETI`; foundRet = true; retCount++; break;
        case 0x46: mnemonic = `${sisStr}IM 0`; break;
        case 0x56: mnemonic = `${sisStr}IM 1`; break;
        case 0x5E: mnemonic = `${sisStr}IM 2`; break;
        case 0x47: mnemonic = `${sisStr}LD I, A`; break;
        case 0x4F: mnemonic = `${sisStr}LD R, A`; break;
        case 0x57: mnemonic = `${sisStr}LD A, I`; break;
        case 0x5F: mnemonic = `${sisStr}LD A, R`; break;
        case 0x67: mnemonic = `${sisStr}RRD`; break;
        case 0x6F: mnemonic = `${sisStr}RLD`; break;
        case 0xA0: mnemonic = `${sisStr}LDI`; break;
        case 0xB0: mnemonic = `${sisStr}LDIR`; break;
        case 0xA8: mnemonic = `${sisStr}LDD`; break;
        case 0xB8: mnemonic = `${sisStr}LDDR`; break;
        case 0xA1: mnemonic = `${sisStr}CPI`; break;
        case 0xB1: mnemonic = `${sisStr}CPIR`; break;
        case 0xA9: mnemonic = `${sisStr}CPD`; break;
        case 0xB9: mnemonic = `${sisStr}CPDR`; break;
        case 0xA2: mnemonic = `${sisStr}INI`; break;
        case 0xB2: mnemonic = `${sisStr}INIR`; break;
        case 0xAA: mnemonic = `${sisStr}IND`; break;
        case 0xBA: mnemonic = `${sisStr}INDR`; break;
        case 0xA3: mnemonic = `${sisStr}OUTI`; break;
        case 0xB3: mnemonic = `${sisStr}OTIR`; break;
        case 0xAB: mnemonic = `${sisStr}OUTD`; break;
        case 0xBB: mnemonic = `${sisStr}OTDR`; break;
        default:
          mnemonic = `${sisStr}ED ${hex(edOp)}  ; unknown ED op`;
          break;
      }
    }
    // Main opcode table
    else {
      switch (op) {
        case 0x00: mnemonic = `${sisStr}NOP`; break;
        case 0x76: mnemonic = `${sisStr}HALT`; break;
        case 0xF3: mnemonic = `${sisStr}DI`; break;
        case 0xFB: mnemonic = `${sisStr}EI`; break;
        case 0xC9: mnemonic = `${sisStr}RET`; foundRet = true; retCount++; break;
        case 0xD9: mnemonic = `${sisStr}EXX`; break;
        case 0x08: mnemonic = `${sisStr}EX AF, AF'`; break;
        case 0xE3: mnemonic = `${sisStr}EX (SP), ${indexReg}`; break;
        case 0xEB: mnemonic = `${sisStr}EX DE, HL`; break;
        case 0xE9: mnemonic = `${sisStr}JP (${indexReg})`; break;
        case 0xF9: mnemonic = `${sisStr}LD SP, ${indexReg}`; break;
        case 0x37: mnemonic = `${sisStr}SCF`; break;
        case 0x3F: mnemonic = `${sisStr}CCF`; break;
        case 0x2F: mnemonic = `${sisStr}CPL`; break;
        case 0x27: mnemonic = `${sisStr}DAA`; break;
        case 0x07: mnemonic = `${sisStr}RLCA`; break;
        case 0x0F: mnemonic = `${sisStr}RRCA`; break;
        case 0x17: mnemonic = `${sisStr}RLA`; break;
        case 0x1F: mnemonic = `${sisStr}RRA`; break;

        // LD r, r' (0x40-0x7F except 0x76=HALT)
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

        // ALU A, r (0x80-0xBF)
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

        // ALU A, imm8
        case 0xC6: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADD A, ${hex(n)}`; break; }
        case 0xCE: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADC A, ${hex(n)}`; break; }
        case 0xD6: { const n = romBytes[pc++]; mnemonic = `${sisStr}SUB ${hex(n)}`; break; }
        case 0xDE: { const n = romBytes[pc++]; mnemonic = `${sisStr}SBC A, ${hex(n)}`; break; }
        case 0xE6: { const n = romBytes[pc++]; mnemonic = `${sisStr}AND ${hex(n)}`; break; }
        case 0xEE: { const n = romBytes[pc++]; mnemonic = `${sisStr}XOR ${hex(n)}`; break; }
        case 0xF6: { const n = romBytes[pc++]; mnemonic = `${sisStr}OR ${hex(n)}`; break; }
        case 0xFE: { const n = romBytes[pc++]; mnemonic = `${sisStr}CP ${hex(n)}`; break; }

        // INC/DEC r8
        case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x34: case 0x3C: {
          let reg = r8[(op >> 3) & 7];
          if (prefix) {
            if (reg === 'H') reg = indexH;
            if (reg === 'L') reg = indexL;
            if (reg === '(HL)') { const d = signedByte(romBytes[pc++]); const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`; reg = `(${indexReg}${ds})`; }
          }
          mnemonic = `${sisStr}INC ${reg}`;
          break;
        }
        case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x35: case 0x3D: {
          let reg = r8[(op >> 3) & 7];
          if (prefix) {
            if (reg === 'H') reg = indexH;
            if (reg === 'L') reg = indexL;
            if (reg === '(HL)') { const d = signedByte(romBytes[pc++]); const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`; reg = `(${indexReg}${ds})`; }
          }
          mnemonic = `${sisStr}DEC ${reg}`;
          break;
        }

        // LD r, imm8
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

        // 16-bit loads
        case 0x01: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, ${hex(a,6)}`; break; }
        case 0x11: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, ${hex(a,6)}`; break; }
        case 0x21: {
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}LD ${indexReg}, ${hex(a,6)}`;
          break;
        }
        case 0x31: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, ${hex(a,6)}`; break; }

        // INC/DEC r16
        case 0x03: mnemonic = `${sisStr}INC BC`; break;
        case 0x13: mnemonic = `${sisStr}INC DE`; break;
        case 0x23: mnemonic = `${sisStr}INC ${indexReg}`; break;
        case 0x33: mnemonic = `${sisStr}INC SP`; break;
        case 0x0B: mnemonic = `${sisStr}DEC BC`; break;
        case 0x1B: mnemonic = `${sisStr}DEC DE`; break;
        case 0x2B: mnemonic = `${sisStr}DEC ${indexReg}`; break;
        case 0x3B: mnemonic = `${sisStr}DEC SP`; break;

        // ADD HL, r16
        case 0x09: mnemonic = `${sisStr}ADD ${indexReg}, BC`; break;
        case 0x19: mnemonic = `${sisStr}ADD ${indexReg}, DE`; break;
        case 0x29: mnemonic = `${sisStr}ADD ${indexReg}, ${indexReg}`; break;
        case 0x39: mnemonic = `${sisStr}ADD ${indexReg}, SP`; break;

        // PUSH/POP
        case 0xC5: mnemonic = `${sisStr}PUSH BC`; break;
        case 0xD5: mnemonic = `${sisStr}PUSH DE`; break;
        case 0xE5: mnemonic = `${sisStr}PUSH ${indexReg}`; break;
        case 0xF5: mnemonic = `${sisStr}PUSH AF`; break;
        case 0xC1: mnemonic = `${sisStr}POP BC`; break;
        case 0xD1: mnemonic = `${sisStr}POP DE`; break;
        case 0xE1: mnemonic = `${sisStr}POP ${indexReg}`; break;
        case 0xF1: mnemonic = `${sisStr}POP AF`; break;

        // JP / CALL
        case 0xC3: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}JP ${hex(a,6)}`; callTargets.push({addr: a, type: 'JP'}); break; }
        case 0xCD: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}CALL ${hex(a,6)}`; callTargets.push({addr: a, type: 'CALL'}); break; }

        // Conditional JP
        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const c = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}JP ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `JP ${c}`});
          break;
        }

        // Conditional CALL
        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}CALL ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `CALL ${c}`});
          break;
        }

        // Conditional RET
        case 0xC0: mnemonic = `${sisStr}RET NZ`; break;
        case 0xC8: mnemonic = `${sisStr}RET Z`; break;
        case 0xD0: mnemonic = `${sisStr}RET NC`; break;
        case 0xD8: mnemonic = `${sisStr}RET C`; break;
        case 0xE0: mnemonic = `${sisStr}RET PO`; break;
        case 0xE8: mnemonic = `${sisStr}RET PE`; break;
        case 0xF0: mnemonic = `${sisStr}RET P`; break;
        case 0xF8: mnemonic = `${sisStr}RET M`; break;

        // JR
        case 0x18: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR'}); break; }
        case 0x20: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NZ, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NZ'}); break; }
        case 0x28: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR Z, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR Z'}); break; }
        case 0x30: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NC, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NC'}); break; }
        case 0x38: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR C, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR C'}); break; }

        // DJNZ
        case 0x10: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}DJNZ ${hex(t,6)}`; callTargets.push({addr: t, type: 'DJNZ'}); break; }

        // RST
        case 0xC7: case 0xCF: case 0xD7: case 0xDF: case 0xE7: case 0xEF: case 0xF7: case 0xFF: {
          const vec = op & 0x38;
          mnemonic = `${sisStr}RST ${hex(vec)}`;
          break;
        }

        // LD A, (addr) / LD (addr), A
        case 0x3A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD A, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x32: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), A`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x2A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD ${indexReg}, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); break; }
        case 0x22: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), ${indexReg}`; trackAddr(a, ramAddrs, ioAddrs); break; }

        // LD (BC)/(DE), A and reverse
        case 0x02: mnemonic = `${sisStr}LD (BC), A`; break;
        case 0x12: mnemonic = `${sisStr}LD (DE), A`; break;
        case 0x0A: mnemonic = `${sisStr}LD A, (BC)`; break;
        case 0x1A: mnemonic = `${sisStr}LD A, (DE)`; break;

        // OUT (n), A / IN A, (n)
        case 0xD3: { const n = romBytes[pc++]; mnemonic = `${sisStr}OUT (${hex(n)}), A`; break; }
        case 0xDB: { const n = romBytes[pc++]; mnemonic = `${sisStr}IN A, (${hex(n)})`; break; }

        default:
          mnemonic = `${sisStr}DB ${hex(op)}  ; unknown`;
          break;
      }
    }

    const bytes = [];
    for (let i = instrStart; i < pc; i++) bytes.push(romBytes[i].toString(16).padStart(2, '0'));
    instructions.push({
      addr: instrStart,
      bytes: bytes.join(' '),
      mnemonic,
      comment,
    });

    // Stop after unconditional RET past the prologue
    if (mnemonic === 'RET' && pc - startAddr > 4) {
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

// ── Run disassembly ──
console.log(`\n=== DISASSEMBLY: 0x${BASE.toString(16).toUpperCase()} ===`);
const result = disassemble(BASE, READ_LEN);

for (const instr of result.instructions) {
  const addrStr = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(18);
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${instr.comment ? '  ; ' + instr.comment : ''}`);
}

// ── Summary ──
console.log(`\n=== SUMMARY ===`);
console.log(`Function start: ${hex(BASE, 6)}`);
console.log(`Function length: ${result.length} bytes (ends at ${hex(BASE + result.length, 6)})`);

if (result.ramAddrs.length > 0) {
  const unique = [...new Set(result.ramAddrs)].sort();
  console.log(`\nRAM addresses accessed:`);
  for (const a of unique) {
    let label = '';
    if (a >= 0xD00000 && a < 0xD00080) label = '  (OS low RAM)';
    else if (a >= 0xD00080 && a < 0xD00100) label = '  (OS flags near IY base 0xD00080)';
    else if (a >= 0xD00100 && a < 0xD00800) label = '  (OS state)';
    else if (a >= 0xD00800 && a < 0xD00900) label = '  (display/cursor state)';
    else if (a >= 0xD00900 && a < 0xD01000) label = '  (OS flags / low RAM)';
    else if (a >= 0xD02000 && a < 0xD03000) label = '  (cursor / text state)';
    else if (a >= 0xD40000 && a < 0xD70000) label = '  (VRAM)';
    console.log(`  ${hex(a, 6)}${label}`);
  }
}

if (result.ioAddrs.length > 0) {
  const unique = [...new Set(result.ioAddrs)].sort();
  console.log(`\nLCD/IO addresses accessed:`);
  for (const a of unique) {
    let label = '';
    if (a === 0xE30000) label = '  (LCD timing 0)';
    else if (a === 0xE30004) label = '  (LCD timing 1)';
    else if (a === 0xE30008) label = '  (LCD timing 2)';
    else if (a === 0xE30010) label = '  (LCD panel base)';
    else if (a === 0xE30014) label = '  (LCD VRAM base / upper panel)';
    else if (a === 0xE30018) label = '  (LCD control)';
    else if (a === 0xE3001C) label = '  (LCD IMSC / interrupt mask)';
    else if (a === 0xE30020) label = '  (LCD RIS / raw interrupt status)';
    else if (a === 0xE30024) label = '  (LCD MIS / masked interrupt status)';
    else if (a === 0xE30028) label = '  (LCD ICR / interrupt clear)';
    else if (a >= 0xE30200 && a < 0xE30600) label = '  (LCD palette)';
    console.log(`  ${hex(a, 6)}${label}`);
  }
}

if (result.callTargets.length > 0) {
  console.log(`\nBranch/call targets:`);
  for (const t of result.callTargets) {
    let label = '';
    if (t.addr >= 0x080000 && t.addr < 0x090000) label = '  (OS syscall range)';
    else if (t.addr >= 0x0A0000 && t.addr < 0x0B0000) label = '  (OS high-level)';
    else if (t.addr >= 0x040000 && t.addr < 0x060000) label = '  (OS mid-level)';
    else if (t.addr >= BASE && t.addr < BASE + READ_LEN) label = '  (within this function)';
    console.log(`  ${t.type.padEnd(8)} -> ${hex(t.addr, 6)}${label}`);
  }
}

// ── Interpretation ──
console.log(`\n=== INTERPRETATION ===`);
const hasLCD = result.ioAddrs.some(a => a >= 0xE30000 && a <= 0xE30FFF);
const hasDMA = result.instructions.some(i => i.mnemonic.includes('LDIR') || i.mnemonic.includes('LDDR'));
const hasInterrupt = result.instructions.some(i => i.mnemonic === 'DI' || i.mnemonic === 'EI' || i.mnemonic === 'HALT');
const hasPorts = result.instructions.some(i => i.mnemonic.includes('IN ') || i.mnemonic.includes('OUT '));

if (hasLCD) console.log(`- LCD I/O: YES (accesses E300xx registers)`);
else console.log(`- LCD I/O: NO (no E300xx references)`);
if (hasDMA) console.log(`- DMA/block transfer: YES (LDIR/LDDR present)`);
if (hasInterrupt) console.log(`- Interrupt control: YES (DI/EI/HALT)`);
if (hasPorts) console.log(`- Port I/O: YES (IN/OUT instructions)`);

const ramAccesses = [...new Set(result.ramAddrs)];
if (ramAccesses.some(a => a >= 0xD00800 && a < 0xD00900)) {
  console.log(`- Accesses D008xx range (display/cursor state)`);
}
if (ramAccesses.some(a => a >= 0xD00080 && a < 0xD00100)) {
  console.log(`- Accesses D000xx range (OS flags near IY base)`);
}

// Try to classify
const callAddrs = result.callTargets.filter(t => t.type === 'CALL').map(t => t.addr);
const jpAddrs = result.callTargets.filter(t => t.type === 'JP').map(t => t.addr);

console.log(`\nFunction calls ${callAddrs.length} subroutine(s), ${jpAddrs.length} tail-jump(s)`);
console.log(`Total instructions: ${result.instructions.length}`);
console.log(`Return count: ${result.instructions.filter(i => i.mnemonic === 'RET').length}`);

console.log(`\nDone.`);
