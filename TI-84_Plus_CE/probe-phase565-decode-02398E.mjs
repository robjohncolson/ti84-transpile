#!/usr/bin/env node
/**
 * probe-phase565-decode-02398E.mjs
 * Decode function at 0x02398E -- font ROM helper called from 0x0A5424 (small font glyph loader).
 *
 * Context:
 *   - 0x0A5424 (session 564): small font glyph loader, 25B/glyph LDIR, ROM table 0x0A3AFA
 *   - 0x0A5424 conditionally calls 0x02398E when BIT 1,(IY+0x35) is set (IY+0x35 = D000B5)
 *   - Likely: font ROM bank enable, secondary table select, or glyph workspace setup
 *
 * Related addresses:
 *   - 0x07BF3E = large font glyph table lookup (76B, session 552)
 *   - 0x000380 = font base vector (256x28B glyph table, session 553)
 *   - 0x0A3AFA = small font ROM glyph data
 *   - D005C5  = small font workspace
 *
 * Read-only probe: no modifications to any existing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x02398E;
const DUMP_LEN = 192;

// --- Utilities ---
function read24(off) {
  return romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
}
function signedByte(b) { return b < 128 ? b : b - 256; }
function hex(v, digits) { return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0'); }

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

// --- Hex dump ---
console.log(`\n=== HEX DUMP: ${hex(START, 6)} (${DUMP_LEN} bytes) ===`);
for (let i = 0; i < DUMP_LEN; i += 16) {
  const addr = START + i;
  const parts = [];
  const ascii = [];
  for (let j = 0; j < 16 && i + j < DUMP_LEN; j++) {
    const b = romBytes[addr + j];
    parts.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${parts.join(' ').padEnd(48)}  ${ascii.join('')}`);
}

// --- Tracking ---
const callTargets = [];
const ramAddrs = [];
const ioAddrs = [];
const iyOffsets = [];

function trackAddr(addr, label) {
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) ioAddrs.push({ addr, label });
  else if (addr >= 0xD00000) ramAddrs.push({ addr, label });
}

// --- Inline eZ80 ADL-mode disassembler ---
function disassemble(startAddr, maxBytes) {
  const instructions = [];
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

    // .SIS prefix
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
        instructions.push({ addr: instrStart, len: pc - instrStart, mnemonic: 'LD B, B', terminator: false });
        continue;
      }
    }

    // IX/IY prefix
    if (op === 0xDD || op === 0xFD) {
      prefix = op;
      indexReg = op === 0xDD ? 'IX' : 'IY';
      indexH = op === 0xDD ? 'IXH' : 'IYH';
      indexL = op === 0xDD ? 'IXL' : 'IYL';
      op = romBytes[pc++];
    }

    const s = sisMode ? '.SIS ' : '';
    let mnemonic = '';
    let isTerminator = false;

    // CB prefix (bit ops)
    if (op === 0xCB) {
      if (prefix) {
        const disp = signedByte(romBytes[pc++]);
        const cbOp = romBytes[pc++];
        const bit = (cbOp >> 3) & 7;
        const ds = disp >= 0 ? '+' + hex(disp) : '-' + hex(-disp);
        const target = '(' + indexReg + ds + ')';
        if ((cbOp & 0xC0) === 0x40) {
          mnemonic = s + 'BIT ' + bit + ', ' + target;
          // Track IY offset
          if (indexReg === 'IY') iyOffsets.push({ pc: instrStart, offset: disp, mnemonic: mnemonic.trim() });
        }
        else if ((cbOp & 0xC0) === 0x80) mnemonic = s + 'RES ' + bit + ', ' + target;
        else if ((cbOp & 0xC0) === 0xC0) mnemonic = s + 'SET ' + bit + ', ' + target;
        else {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = s + shifts[(cbOp >> 3) & 7] + ' ' + target;
        }
      } else {
        const cbOp = romBytes[pc++];
        const bit = (cbOp >> 3) & 7;
        const reg = r8[cbOp & 7];
        if ((cbOp & 0xC0) === 0x40) mnemonic = s + 'BIT ' + bit + ', ' + reg;
        else if ((cbOp & 0xC0) === 0x80) mnemonic = s + 'RES ' + bit + ', ' + reg;
        else if ((cbOp & 0xC0) === 0xC0) mnemonic = s + 'SET ' + bit + ', ' + reg;
        else {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = s + shifts[(cbOp >> 3) & 7] + ' ' + reg;
        }
      }
    }
    // ED prefix
    else if (op === 0xED) {
      const edOp = romBytes[pc++];
      switch (edOp) {
        case 0x78: mnemonic = s + 'IN A, (C)'; ioAddrs.push({ addr: 'C-reg', label: 'IN A,(C)' }); break;
        case 0x79: mnemonic = s + 'OUT (C), A'; ioAddrs.push({ addr: 'C-reg', label: 'OUT (C),A' }); break;
        case 0x42: mnemonic = s + 'SBC HL, BC'; break;
        case 0x52: mnemonic = s + 'SBC HL, DE'; break;
        case 0x62: mnemonic = s + 'SBC HL, HL'; break;
        case 0x72: mnemonic = s + 'SBC HL, SP'; break;
        case 0x4A: mnemonic = s + 'ADC HL, BC'; break;
        case 0x5A: mnemonic = s + 'ADC HL, DE'; break;
        case 0x6A: mnemonic = s + 'ADC HL, HL'; break;
        case 0x7A: mnemonic = s + 'ADC HL, SP'; break;
        case 0x43: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), BC'; trackAddr(a, 'LD (nn),BC'); break; }
        case 0x53: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), DE'; trackAddr(a, 'LD (nn),DE'); break; }
        case 0x63: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), HL'; trackAddr(a, 'LD (nn),HL'); break; }
        case 0x73: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), SP'; trackAddr(a, 'LD (nn),SP'); break; }
        case 0x4B: { const a = read24(pc); pc += 3; mnemonic = s + 'LD BC, (' + hex(a,6) + ')'; trackAddr(a, 'LD BC,(nn)'); break; }
        case 0x5B: { const a = read24(pc); pc += 3; mnemonic = s + 'LD DE, (' + hex(a,6) + ')'; trackAddr(a, 'LD DE,(nn)'); break; }
        case 0x6B: { const a = read24(pc); pc += 3; mnemonic = s + 'LD HL, (' + hex(a,6) + ')'; trackAddr(a, 'LD HL,(nn)'); break; }
        case 0x7B: { const a = read24(pc); pc += 3; mnemonic = s + 'LD SP, (' + hex(a,6) + ')'; trackAddr(a, 'LD SP,(nn)'); break; }
        case 0x44: mnemonic = s + 'NEG'; break;
        case 0x45: mnemonic = s + 'RETN'; isTerminator = true; break;
        case 0x4D: mnemonic = s + 'RETI'; isTerminator = true; break;
        case 0x46: mnemonic = s + 'IM 0'; break;
        case 0x56: mnemonic = s + 'IM 1'; break;
        case 0x5E: mnemonic = s + 'IM 2'; break;
        case 0x47: mnemonic = s + 'LD I, A'; break;
        case 0x4F: mnemonic = s + 'LD R, A'; break;
        case 0x57: mnemonic = s + 'LD A, I'; break;
        case 0x5F: mnemonic = s + 'LD A, R'; break;
        case 0x67: mnemonic = s + 'RRD'; break;
        case 0x6F: mnemonic = s + 'RLD'; break;
        case 0xA0: mnemonic = s + 'LDI'; break;
        case 0xB0: mnemonic = s + 'LDIR'; break;
        case 0xA8: mnemonic = s + 'LDD'; break;
        case 0xB8: mnemonic = s + 'LDDR'; break;
        case 0xA1: mnemonic = s + 'CPI'; break;
        case 0xB1: mnemonic = s + 'CPIR'; break;
        case 0xA9: mnemonic = s + 'CPD'; break;
        case 0xB9: mnemonic = s + 'CPDR'; break;
        case 0x4C: mnemonic = s + 'MLT BC'; break;
        case 0x5C: mnemonic = s + 'MLT DE'; break;
        case 0x6C: mnemonic = s + 'MLT HL'; break;
        case 0x7C: mnemonic = s + 'MLT SP'; break;
        default: mnemonic = s + 'ED ' + hex(edOp) + ' ; unknown'; break;
      }
    }
    // Main opcode table
    else {
      switch (op) {
        case 0x00: mnemonic = s + 'NOP'; break;
        case 0x76: mnemonic = s + 'HALT'; isTerminator = true; break;
        case 0xF3: mnemonic = s + 'DI'; break;
        case 0xFB: mnemonic = s + 'EI'; break;
        case 0xC9: mnemonic = s + 'RET'; isTerminator = true; break;
        case 0xD9: mnemonic = s + 'EXX'; break;
        case 0x08: mnemonic = s + "EX AF, AF'"; break;
        case 0xE3: mnemonic = s + 'EX (SP), ' + indexReg; break;
        case 0xEB: mnemonic = s + 'EX DE, HL'; break;
        case 0xE9: mnemonic = s + 'JP (' + indexReg + ')'; isTerminator = true; break;
        case 0xF9: mnemonic = s + 'LD SP, ' + indexReg; break;
        case 0x37: mnemonic = s + 'SCF'; break;
        case 0x3F: mnemonic = s + 'CCF'; break;
        case 0x2F: mnemonic = s + 'CPL'; break;
        case 0x27: mnemonic = s + 'DAA'; break;
        case 0x07: mnemonic = s + 'RLCA'; break;
        case 0x0F: mnemonic = s + 'RRCA'; break;
        case 0x17: mnemonic = s + 'RLA'; break;
        case 0x1F: mnemonic = s + 'RRA'; break;

        // LD r, r'
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
            if (dst === 'H') dst = indexH; if (dst === 'L') dst = indexL;
            if (src === 'H') src = indexH; if (src === 'L') src = indexL;
            if (dst === '(HL)' || src === '(HL)') {
              const d = signedByte(romBytes[pc++]);
              const ds = d >= 0 ? '+' + hex(d) : '-' + hex(-d);
              if (dst === '(HL)') dst = '(' + indexReg + ds + ')';
              if (src === '(HL)') src = '(' + indexReg + ds + ')';
            }
          }
          mnemonic = s + 'LD ' + dst + ', ' + src;
          break;
        }

        // ALU A, r
        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF: {
          const aluOps = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
          const idx = (op >> 3) & 7;
          let operand = r8[op & 7];
          if (prefix) {
            if (operand === 'H') operand = indexH;
            if (operand === 'L') operand = indexL;
            if (operand === '(HL)') {
              const d = signedByte(romBytes[pc++]);
              operand = '(' + indexReg + (d >= 0 ? '+' + hex(d) : '-' + hex(-d)) + ')';
            }
          }
          mnemonic = s + aluOps[idx] + ' ' + operand;
          break;
        }

        // ALU A, imm8
        case 0xC6: { const n = romBytes[pc++]; mnemonic = s + 'ADD A, ' + hex(n); break; }
        case 0xCE: { const n = romBytes[pc++]; mnemonic = s + 'ADC A, ' + hex(n); break; }
        case 0xD6: { const n = romBytes[pc++]; mnemonic = s + 'SUB ' + hex(n); break; }
        case 0xDE: { const n = romBytes[pc++]; mnemonic = s + 'SBC A, ' + hex(n); break; }
        case 0xE6: { const n = romBytes[pc++]; mnemonic = s + 'AND ' + hex(n); break; }
        case 0xEE: { const n = romBytes[pc++]; mnemonic = s + 'XOR ' + hex(n); break; }
        case 0xF6: { const n = romBytes[pc++]; mnemonic = s + 'OR ' + hex(n); break; }
        case 0xFE: { const n = romBytes[pc++]; mnemonic = s + 'CP ' + hex(n); break; }

        // INC/DEC r8
        case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x34: case 0x3C: {
          let reg = r8[(op >> 3) & 7];
          if (prefix) {
            if (reg === 'H') reg = indexH; if (reg === 'L') reg = indexL;
            if (reg === '(HL)') { const d = signedByte(romBytes[pc++]); reg = '(' + indexReg + (d >= 0 ? '+' + hex(d) : '-' + hex(-d)) + ')'; }
          }
          mnemonic = s + 'INC ' + reg;
          break;
        }
        case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x35: case 0x3D: {
          let reg = r8[(op >> 3) & 7];
          if (prefix) {
            if (reg === 'H') reg = indexH; if (reg === 'L') reg = indexL;
            if (reg === '(HL)') { const d = signedByte(romBytes[pc++]); reg = '(' + indexReg + (d >= 0 ? '+' + hex(d) : '-' + hex(-d)) + ')'; }
          }
          mnemonic = s + 'DEC ' + reg;
          break;
        }

        // LD r, imm8
        case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x36: case 0x3E: {
          let reg = r8[(op >> 3) & 7];
          if (prefix && reg === 'H') reg = indexH;
          if (prefix && reg === 'L') reg = indexL;
          if (prefix && reg === '(HL)') {
            const d = signedByte(romBytes[pc++]);
            reg = '(' + indexReg + (d >= 0 ? '+' + hex(d) : '-' + hex(-d)) + ')';
          }
          const n = romBytes[pc++];
          mnemonic = s + 'LD ' + reg + ', ' + hex(n);
          break;
        }

        // 16-bit loads (ADL = 3-byte imm)
        case 0x01: { const a = read24(pc); pc += 3; mnemonic = s + 'LD BC, ' + hex(a,6); break; }
        case 0x11: { const a = read24(pc); pc += 3; mnemonic = s + 'LD DE, ' + hex(a,6); break; }
        case 0x21: { const a = read24(pc); pc += 3; mnemonic = s + 'LD ' + indexReg + ', ' + hex(a,6); break; }
        case 0x31: { const a = read24(pc); pc += 3; mnemonic = s + 'LD SP, ' + hex(a,6); break; }

        // INC/DEC r16
        case 0x03: mnemonic = s + 'INC BC'; break;
        case 0x13: mnemonic = s + 'INC DE'; break;
        case 0x23: mnemonic = s + 'INC ' + indexReg; break;
        case 0x33: mnemonic = s + 'INC SP'; break;
        case 0x0B: mnemonic = s + 'DEC BC'; break;
        case 0x1B: mnemonic = s + 'DEC DE'; break;
        case 0x2B: mnemonic = s + 'DEC ' + indexReg; break;
        case 0x3B: mnemonic = s + 'DEC SP'; break;

        // ADD HL/IX/IY, r16
        case 0x09: mnemonic = s + 'ADD ' + indexReg + ', BC'; break;
        case 0x19: mnemonic = s + 'ADD ' + indexReg + ', DE'; break;
        case 0x29: mnemonic = s + 'ADD ' + indexReg + ', ' + indexReg; break;
        case 0x39: mnemonic = s + 'ADD ' + indexReg + ', SP'; break;

        // PUSH/POP
        case 0xC5: mnemonic = s + 'PUSH BC'; break;
        case 0xD5: mnemonic = s + 'PUSH DE'; break;
        case 0xE5: mnemonic = s + 'PUSH ' + indexReg; break;
        case 0xF5: mnemonic = s + 'PUSH AF'; break;
        case 0xC1: mnemonic = s + 'POP BC'; break;
        case 0xD1: mnemonic = s + 'POP DE'; break;
        case 0xE1: mnemonic = s + 'POP ' + indexReg; break;
        case 0xF1: mnemonic = s + 'POP AF'; break;

        // JP / CALL / RET cc
        case 0xC3: { const a = read24(pc); pc += 3; mnemonic = s + 'JP ' + hex(a,6); callTargets.push({ addr: a, type: 'JP' }); isTerminator = true; break; }
        case 0xCD: { const a = read24(pc); pc += 3; mnemonic = s + 'CALL ' + hex(a,6); callTargets.push({ addr: a, type: 'CALL' }); break; }

        // Conditional JP
        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const cond = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = s + 'JP ' + cond + ', ' + hex(a,6);
          callTargets.push({ addr: a, type: 'JP ' + cond });
          break;
        }

        // Conditional CALL
        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const cond = cc[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = s + 'CALL ' + cond + ', ' + hex(a,6);
          callTargets.push({ addr: a, type: 'CALL ' + cond });
          break;
        }

        // Conditional RET
        case 0xC0: mnemonic = s + 'RET NZ'; break;
        case 0xC8: mnemonic = s + 'RET Z'; break;
        case 0xD0: mnemonic = s + 'RET NC'; break;
        case 0xD8: mnemonic = s + 'RET C'; break;
        case 0xE0: mnemonic = s + 'RET PO'; break;
        case 0xE8: mnemonic = s + 'RET PE'; break;
        case 0xF0: mnemonic = s + 'RET P'; break;
        case 0xF8: mnemonic = s + 'RET M'; break;

        // JR
        case 0x18: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'JR ' + hex(t,6); callTargets.push({ addr: t, type: 'JR' }); isTerminator = true; break; }
        case 0x20: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'JR NZ, ' + hex(t,6); callTargets.push({ addr: t, type: 'JR NZ' }); break; }
        case 0x28: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'JR Z, ' + hex(t,6); callTargets.push({ addr: t, type: 'JR Z' }); break; }
        case 0x30: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'JR NC, ' + hex(t,6); callTargets.push({ addr: t, type: 'JR NC' }); break; }
        case 0x38: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'JR C, ' + hex(t,6); callTargets.push({ addr: t, type: 'JR C' }); break; }
        case 0x10: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = s + 'DJNZ ' + hex(t,6); callTargets.push({ addr: t, type: 'DJNZ' }); break; }

        // LD A, (nn) / LD (nn), A
        case 0x3A: { const a = read24(pc); pc += 3; mnemonic = s + 'LD A, (' + hex(a,6) + ')'; trackAddr(a, 'LD A,(nn)'); break; }
        case 0x32: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), A'; trackAddr(a, 'LD (nn),A'); break; }
        case 0x2A: { const a = read24(pc); pc += 3; mnemonic = s + 'LD ' + indexReg + ', (' + hex(a,6) + ')'; trackAddr(a, 'LD HL,(nn)'); break; }
        case 0x22: { const a = read24(pc); pc += 3; mnemonic = s + 'LD (' + hex(a,6) + '), ' + indexReg; trackAddr(a, 'LD (nn),HL'); break; }

        // LD A, (BC/DE) / LD (BC/DE), A
        case 0x0A: mnemonic = s + 'LD A, (BC)'; break;
        case 0x1A: mnemonic = s + 'LD A, (DE)'; break;
        case 0x02: mnemonic = s + 'LD (BC), A'; break;
        case 0x12: mnemonic = s + 'LD (DE), A'; break;

        // RST
        case 0xC7: mnemonic = s + 'RST 0x00'; break;
        case 0xCF: mnemonic = s + 'RST 0x08'; break;
        case 0xD7: mnemonic = s + 'RST 0x10'; break;
        case 0xDF: mnemonic = s + 'RST 0x18'; break;
        case 0xE7: mnemonic = s + 'RST 0x20'; break;
        case 0xEF: mnemonic = s + 'RST 0x28'; break;
        case 0xF7: mnemonic = s + 'RST 0x30'; break;
        case 0xFF: mnemonic = s + 'RST 0x38'; break;

        // Port I/O (8-bit port)
        case 0xDB: { const p = romBytes[pc++]; mnemonic = s + 'IN A, (' + hex(p) + ')'; ioAddrs.push({ addr: p, label: 'IN A,(n)' }); break; }
        case 0xD3: { const p = romBytes[pc++]; mnemonic = s + 'OUT (' + hex(p) + '), A'; ioAddrs.push({ addr: p, label: 'OUT (n),A' }); break; }

        default:
          mnemonic = s + 'DB ' + hex(op) + ' ; unhandled';
          break;
      }
    }

    const len = pc - instrStart;
    const bytesArr = [];
    for (let b = instrStart; b < pc; b++) bytesArr.push(romBytes[b].toString(16).padStart(2, '0'));
    instructions.push({ addr: instrStart, len, bytes: bytesArr.join(' '), mnemonic, terminator: isTerminator });
    if (isTerminator) break;
  }
  return instructions;
}

// --- Disassemble ---
console.log(`\n=== DISASSEMBLY: ${hex(START, 6)} ===`);
const instrs = disassemble(START, DUMP_LEN);
for (const inst of instrs) {
  console.log(`  ${hex(inst.addr, 6)}: ${inst.bytes.padEnd(24)} ${inst.mnemonic}`);
}

const funcSize = instrs.length > 0 ? (instrs[instrs.length - 1].addr + instrs[instrs.length - 1].len - START) : 0;
const hitTerminator = instrs.length > 0 && instrs[instrs.length - 1].terminator;

// --- Summary ---
console.log('\n=== SUMMARY ===');
console.log(`Function size: ${funcSize} bytes (${hex(START, 6)}..${hex(START + funcSize - 1, 6)})`);
console.log(`Instructions: ${instrs.length}`);
console.log(`Hit terminator: ${hitTerminator ? 'yes' : 'no (may continue)'}`);

console.log('\nCALL/JP/JR targets:');
if (callTargets.length === 0) console.log('  (none)');
for (const t of callTargets) {
  const inRom = typeof t.addr === 'number' && t.addr < 0x400000;
  const inRam = typeof t.addr === 'number' && t.addr >= 0xD00000;
  const note = inRom ? ' [ROM]' : inRam ? ' [RAM]' : '';
  console.log(`  ${t.type.padEnd(10)} -> ${typeof t.addr === 'number' ? hex(t.addr, 6) : t.addr}${note}`);
}

console.log('\nRAM addresses:');
if (ramAddrs.length === 0) console.log('  (none)');
for (const r of ramAddrs) console.log(`  ${hex(r.addr, 6)}  (${r.label})`);

console.log('\nPort I/O:');
if (ioAddrs.length === 0) console.log('  (none)');
for (const p of ioAddrs) console.log(`  ${typeof p.addr === 'number' ? hex(p.addr, 4) : p.addr}  (${p.label})`);

console.log('\nIY offsets (IY base = 0xD00080):');
if (iyOffsets.length === 0) console.log('  (none)');
for (const iy of iyOffsets) {
  const absAddr = 0xD00080 + iy.offset;
  console.log(`  IY+${hex(iy.offset, 2)} = ${hex(absAddr, 6)}  at ${hex(iy.pc, 6)}  (${iy.mnemonic})`);
}

// --- Hypothesis ---
console.log('\n=== HYPOTHESIS ===');
const hasFlashPorts = ioAddrs.some(p => typeof p.addr === 'number' && [0x06, 0x21, 0x22].includes(p.addr));
if (hasFlashPorts) {
  console.log('Flash/bank port access detected -- likely font ROM bank enable.');
} else if (ioAddrs.length > 0) {
  console.log('Port I/O detected -- hardware state change, possibly memory-mapped font control.');
} else if (ramAddrs.length > 0 || iyOffsets.length > 0) {
  console.log('RAM/IY access without port I/O -- likely font state setup or secondary table select.');
} else if (callTargets.length > 0) {
  console.log('Delegates to sub-routines -- inspect listed targets for font ROM behavior.');
} else {
  console.log('No port/RAM/call activity detected -- register-only helper or decoder missed operands.');
}
