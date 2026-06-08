#!/usr/bin/env node
/**
 * probe-phase564-decode-080259.mjs
 * Decode function at 0x080259 - called from 0x0800AE (non-Z path of split-screen flag cluster).
 * Session 563 decoded 0x0800A0 cluster; 0x080259 was identified as CALL target but never decoded.
 * IY base = 0xD00080.
 * Read-only probe: no modifications to any existing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const PRIMARY = 0x080259;
const DUMP_LEN = 96;

// Hex dump of primary region
console.log(`\n=== HEX DUMP: 0x${PRIMARY.toString(16).toUpperCase()} - 0x${(PRIMARY + DUMP_LEN).toString(16).toUpperCase()} (${DUMP_LEN} bytes) ===`);
for (let i = 0; i < DUMP_LEN; i += 16) {
  const addr = PRIMARY + i;
  const hexParts = [];
  const asciiParts = [];
  for (let j = 0; j < 16 && i + j < DUMP_LEN; j++) {
    const b = romBytes[addr + j];
    hexParts.push(b.toString(16).padStart(2, '0'));
    asciiParts.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${hexParts.join(' ').padEnd(48)}  ${asciiParts.join('')}`);
}

// --- eZ80 ADL-mode disassembler (minimal inline, same pattern as probe-phase563-decode-0800A0) ---

function read24(off) {
  return romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function hex(v, digits) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0');
}

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) {
    ioAddrs.push(addr);
  } else if (addr >= 0xD00000) {
    ramAddrs.push(addr);
  }
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function disassemble(startAddr, maxBytes) {
  const instructions = [];
  const callTargets = [];
  const ramAddrs = [];
  const ioAddrs = [];
  const iyAccesses = [];
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
            iyAccesses.push({ addr: ramAddr, offset: disp, rw: 'read', bit: bitNum });
          }
        } else if ((cbOp & 0xC0) === 0x80) {
          mnemonic = `${sisStr}RES ${bitNum}, (${indexReg}${dispStr})`;
          if (indexReg === 'IY') {
            const iyBase = 0xD00080;
            const ramAddr = iyBase + (disp & 0xFF);
            comment = `clears bit ${bitNum} of RAM ${hex(ramAddr, 6)}`;
            ramAddrs.push(ramAddr);
            iyAccesses.push({ addr: ramAddr, offset: disp, rw: 'write', bit: bitNum });
          }
        } else if ((cbOp & 0xC0) === 0xC0) {
          mnemonic = `${sisStr}SET ${bitNum}, (${indexReg}${dispStr})`;
          if (indexReg === 'IY') {
            const iyBase = 0xD00080;
            const ramAddr = iyBase + (disp & 0xFF);
            comment = `sets bit ${bitNum} of RAM ${hex(ramAddr, 6)}`;
            ramAddrs.push(ramAddr);
            iyAccesses.push({ addr: ramAddr, offset: disp, rw: 'write', bit: bitNum });
          }
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
        case 0x57: mnemonic = `${sisStr}LD A, I`; break;
        case 0x5F: mnemonic = `${sisStr}LD A, R`; break;
        case 0x47: mnemonic = `${sisStr}LD I, A`; break;
        case 0x4F: mnemonic = `${sisStr}LD R, A`; break;
        case 0x46: mnemonic = `${sisStr}IM 0`; break;
        case 0x56: mnemonic = `${sisStr}IM 1`; break;
        case 0x5E: mnemonic = `${sisStr}IM 2`; break;
        case 0xA0: mnemonic = `${sisStr}LDI`; break;
        case 0xA8: mnemonic = `${sisStr}LDD`; break;
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
        case 0x08: mnemonic = `${sisStr}EX AF, AF'`; break;
        case 0x27: mnemonic = `${sisStr}DAA`; break;
        case 0x2F: mnemonic = `${sisStr}CPL`; break;
        case 0x3C: mnemonic = `${sisStr}INC A`; break;
        case 0x3D: mnemonic = `${sisStr}DEC A`; break;
        case 0x04: mnemonic = `${sisStr}INC B`; break;
        case 0x0C: mnemonic = `${sisStr}INC C`; break;
        case 0x14: mnemonic = `${sisStr}INC D`; break;
        case 0x1C: mnemonic = `${sisStr}INC E`; break;
        case 0x24: mnemonic = `${sisStr}INC ${prefix ? indexH : 'H'}`; break;
        case 0x2C: mnemonic = `${sisStr}INC ${prefix ? indexL : 'L'}`; break;
        case 0x05: mnemonic = `${sisStr}DEC B`; break;
        case 0x0D: mnemonic = `${sisStr}DEC C`; break;
        case 0x15: mnemonic = `${sisStr}DEC D`; break;
        case 0x1D: mnemonic = `${sisStr}DEC E`; break;
        case 0x25: mnemonic = `${sisStr}DEC ${prefix ? indexH : 'H'}`; break;
        case 0x2D: mnemonic = `${sisStr}DEC ${prefix ? indexL : 'L'}`; break;

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
              if (dst === '(HL)') { dst = `(${indexReg}${ds})`; }
              if (src === '(HL)') { src = `(${indexReg}${ds})`; }
            }
          }
          mnemonic = `${sisStr}LD ${dst}, ${src}`;
          break;
        }

        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6:
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE:
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6:
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: {
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

        case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x3E: {
          let reg = r8[(op >> 3) & 7];
          if (prefix && reg === 'H') reg = indexH;
          if (prefix && reg === 'L') reg = indexL;
          const n = romBytes[pc++];
          mnemonic = `${sisStr}LD ${reg}, ${hex(n)}`;
          break;
        }
        case 0x36: {
          if (prefix) {
            const d = signedByte(romBytes[pc++]);
            const ds = d >= 0 ? `+${hex(d)}` : `-${hex(-d)}`;
            const n = romBytes[pc++];
            mnemonic = `${sisStr}LD (${indexReg}${ds}), ${hex(n)}`;
          } else {
            const n = romBytes[pc++];
            mnemonic = `${sisStr}LD (HL), ${hex(n)}`;
          }
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

        case 0xDB: { const p = romBytes[pc++]; mnemonic = `${sisStr}IN A, (${hex(p)})`; break; }
        case 0xD3: { const p = romBytes[pc++]; mnemonic = `${sisStr}OUT (${hex(p)}), A`; break; }

        default:
          mnemonic = `${sisStr}DB ${hex(op)}  ; unknown`;
          break;
      }
    }

    const bytesArr = [];
    for (let i = instrStart; i < pc; i++) bytesArr.push(romBytes[i].toString(16).padStart(2, '0'));
    instructions.push({ addr: instrStart, bytes: bytesArr.join(' '), mnemonic, comment });

    // Stop at unconditional RET past the first byte
    if (mnemonic === 'RET' && pc - startAddr > 1) {
      break;
    }

    // Stop at unconditional JP that branches outside this function (tail call)
    if (!sisMode && mnemonic.match(/^JP 0x/) && !mnemonic.match(/JP (NZ|Z|NC|C|PO|PE|P|M)/)) {
      const targetHex = mnemonic.split(' ')[1];
      const target = parseInt(targetHex, 16);
      if (target < startAddr || target > startAddr + maxBytes) {
        break;
      }
    }
  }

  return { instructions, callTargets, ramAddrs, ioAddrs, iyAccesses, length: pc - startAddr };
}

// Disassemble up to 256 bytes to catch the full function
const MAX_DECODE = 256;
const result = disassemble(PRIMARY, MAX_DECODE);

console.log(`\n=== DISASSEMBLY: 0x${PRIMARY.toString(16).toUpperCase()} (up to ${MAX_DECODE} bytes) ===`);
for (const instr of result.instructions) {
  const addrStr = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(20);
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${instr.comment ? '  ; ' + instr.comment : ''}`);
}

// Summary
console.log(`\n=== ANALYSIS: 0x${PRIMARY.toString(16).toUpperCase()} ===`);
console.log(`  Function start : ${hex(PRIMARY, 6)}`);
console.log(`  Function size  : ${result.length} bytes`);
console.log(`  Instructions   : ${result.instructions.length}`);

if (result.ramAddrs.length > 0) {
  const unique = [...new Set(result.ramAddrs)].sort((a, b) => a - b);
  console.log(`\n  RAM addresses accessed:`);
  for (const a of unique) {
    const iyBase = 0xD00080;
    const offset = a - iyBase;
    if (offset >= 0 && offset < 0x200) {
      console.log(`    ${hex(a, 6)} = IY+${hex(offset)} (OS flag offset 0x${offset.toString(16).toUpperCase()})`);
    } else {
      console.log(`    ${hex(a, 6)}`);
    }
  }
}

if (result.iyAccesses.length > 0) {
  console.log(`\n  IY-relative accesses (IY base = 0xD00080):`);
  for (const acc of result.iyAccesses) {
    const dispStr = acc.offset >= 0 ? `+${hex(acc.offset)}` : `-${hex(-acc.offset)}`;
    const rw = acc.rw.toUpperCase().padEnd(5);
    const bitStr = acc.bit !== undefined ? `, bit ${acc.bit}` : '';
    console.log(`    IY${dispStr} = ${hex(acc.addr, 6)}  [${rw}${bitStr}]`);
  }
}

if (result.ioAddrs.length > 0) {
  const unique = [...new Set(result.ioAddrs)].sort((a, b) => a - b);
  console.log(`\n  I/O addresses accessed:`);
  for (const a of unique) console.log(`    ${hex(a, 6)}`);
}

if (result.callTargets.length > 0) {
  console.log(`\n  Branch / call targets:`);
  const seen = new Set();
  for (const t of result.callTargets) {
    const key = `${t.type}:${t.addr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const region = t.addr < 0x400000 ? ' (ROM)' : t.addr >= 0xD00000 ? ' (RAM)' : '';
    console.log(`    ${t.type.padEnd(10)} -> ${hex(t.addr, 6)}${region}`);
  }
}

// Interpretation
console.log(`\n=== INTERPRETATION ===`);

const mnemonics = result.instructions.map(i => i.mnemonic);
const instrCount = result.instructions.length;
const hasBit = mnemonics.some(m => m.includes('BIT '));
const hasCall = mnemonics.some(m => m.startsWith('CALL '));
const hasRet = mnemonics.includes('RET');
const hasCondRet = mnemonics.some(m => m.match(/^RET (NZ|Z|NC|C|PO|PE|P|M)/));
const hasJP = mnemonics.some(m => m.match(/^JP 0x/));

if (instrCount <= 4 && hasBit && hasRet) {
  console.log(`  Structure: Simple BIT-test stub (${instrCount} instructions)`);
  const bitInstr = result.instructions.find(i => i.mnemonic.includes('BIT '));
  console.log(`  Flag test: ${bitInstr.mnemonic}`);
  if (bitInstr.comment) console.log(`  -> ${bitInstr.comment}`);
  console.log(`  Returns: Z=1 (bit clear) or Z=0 (bit set)`);
} else if (hasCondRet || (hasBit && hasCall)) {
  console.log(`  Structure: Conditional dispatch / multi-path (${instrCount} instructions)`);
  const bitInstrs = result.instructions.filter(i => i.mnemonic.includes('BIT '));
  for (const b of bitInstrs) {
    console.log(`  Tests: ${b.mnemonic}${b.comment ? ' ; ' + b.comment : ''}`);
  }
  const callInstrs = result.instructions.filter(i => i.mnemonic.startsWith('CALL '));
  for (const c of callInstrs) {
    console.log(`  Calls: ${c.mnemonic}`);
  }
} else {
  console.log(`  Structure: General function (${instrCount} instructions, ${result.length} bytes)`);
  console.log(`  Has BIT test : ${hasBit}`);
  console.log(`  Has CALL     : ${hasCall}`);
  console.log(`  Has RET      : ${hasRet}`);
  console.log(`  Has JP       : ${hasJP}`);
  if (instrCount > 0) {
    const last = result.instructions[result.instructions.length - 1];
    console.log(`  Terminator   : ${last.mnemonic} at ${hex(last.addr, 6)}`);
  }
}

// Caller context
console.log(`\n=== CALLER CONTEXT (session 563) ===`);
console.log(`  0x0800A0: BIT 3,(IY+0x14) -- split-screen active flag`);
console.log(`  0x0800AE: CALL 0x080259   -- this function (non-Z path: bit was SET)`);
console.log(`  After CALL: 0x0800A0 continues with BIT 0,(IY+0x14) and 0x0800C2 RES 3`);
console.log(`  Context: called when split-screen is active; likely manages split-screen state`);

console.log(`\nDone.`);
