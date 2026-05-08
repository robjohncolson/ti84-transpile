#!/usr/bin/env node

/**
 * Phase 258 — Disassemble 0x0A223A (display-area clear function)
 *
 * Called by 0x09E2EC (context registration). When called with uninitialized
 * display pointers, it overflows into D007xx RAM. This probe:
 *   1. Static disassembly of the first ~50 bytes at 0x0A223A from ROM.rom
 *   2. Dynamic trace: execute from 0x0A223A for 100 steps, watching RAM
 *   3. Summary of what the function does
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET_ADDR = 0x0A223A;

const ROM_PATH = fs.existsSync('./TI-84_Plus_CE/ROM.rom')
  ? './TI-84_Plus_CE/ROM.rom'
  : path.join(__dirname, 'ROM.rom');

const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

// ── Helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(rom, offset, count) {
  const parts = [];
  for (let i = 0; i < count; i++) parts.push(hexByte(rom[offset + i]));
  return parts.join(' ');
}

function read24LE(rom, offset) {
  return (rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16)) >>> 0;
}

function read16LE(rom, offset) {
  return (rom[offset] | (rom[offset + 1] << 8)) & 0xFFFF;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase258-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

// ── Part 1: Static Disassembly ──

function disassemble(rom, startAddr, maxBytes) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  PART 1: Static Disassembly at ${hex(startAddr)}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let offset = startAddr;
  const endOffset = startAddr + maxBytes;
  const instructions = [];

  while (offset < endOffset) {
    const instrStart = offset;
    let prefix = '';
    let byte0 = rom[offset];

    // Handle IX/IY prefix
    if (byte0 === 0xDD) {
      prefix = 'IX';
      offset++;
      byte0 = rom[offset];
    } else if (byte0 === 0xFD) {
      prefix = 'IY';
      offset++;
      byte0 = rom[offset];
    }

    let mnemonic = '';
    let consumed = 1;

    // CB prefix (bit ops) — after possible IX/IY prefix
    if (byte0 === 0xCB) {
      if (prefix) {
        // DD CB dd xx or FD CB dd xx
        const disp = rom[offset + 1];
        const op = rom[offset + 2];
        const signedDisp = disp > 127 ? disp - 256 : disp;
        const regName = prefix === 'IX' ? 'IX' : 'IY';

        const bitNum = (op >> 3) & 7;
        const topBits = (op >> 6) & 3;
        if (topBits === 1) {
          mnemonic = `BIT ${bitNum},(${regName}+${signedDisp})`;
        } else if (topBits === 2) {
          mnemonic = `RES ${bitNum},(${regName}+${signedDisp})`;
        } else if (topBits === 3) {
          mnemonic = `SET ${bitNum},(${regName}+${signedDisp})`;
        } else {
          mnemonic = `CB[${hexByte(op)}] (${regName}+${signedDisp})`;
        }
        consumed = 3; // CB + disp + op
      } else {
        // Plain CB xx
        const op = rom[offset + 1];
        const bitNum = (op >> 3) & 7;
        const regIdx = op & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const topBits = (op >> 6) & 3;
        if (topBits === 1) {
          mnemonic = `BIT ${bitNum},${regNames[regIdx]}`;
        } else if (topBits === 2) {
          mnemonic = `RES ${bitNum},${regNames[regIdx]}`;
        } else if (topBits === 3) {
          mnemonic = `SET ${bitNum},${regNames[regIdx]}`;
        } else {
          const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${rotOps[bitNum]} ${regNames[regIdx]}`;
        }
        consumed = 2;
      }
      offset += consumed;
      const len = offset - instrStart;
      instructions.push({
        addr: instrStart,
        bytes: hexBytes(rom, instrStart, len),
        mnemonic,
        len,
      });
      continue;
    }

    // ED prefix
    if (byte0 === 0xED) {
      const ed = rom[offset + 1];
      offset += 2;
      switch (ed) {
        case 0xB0: mnemonic = 'LDIR'; break;
        case 0xB8: mnemonic = 'LDDR'; break;
        case 0xA0: mnemonic = 'LDI'; break;
        case 0xA8: mnemonic = 'LDD'; break;
        case 0xB1: mnemonic = 'CPIR'; break;
        case 0xB9: mnemonic = 'CPDR'; break;
        case 0xA1: mnemonic = 'CPI'; break;
        case 0xA9: mnemonic = 'CPD'; break;
        case 0x43: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD (${hex(addr)}),BC`;
          break;
        }
        case 0x4B: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD BC,(${hex(addr)})`;
          break;
        }
        case 0x53: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD (${hex(addr)}),DE`;
          break;
        }
        case 0x5B: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD DE,(${hex(addr)})`;
          break;
        }
        case 0x63: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD (${hex(addr)}),HL`;
          break;
        }
        case 0x6B: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD HL,(${hex(addr)})`;
          break;
        }
        case 0x73: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD (${hex(addr)}),SP`;
          break;
        }
        case 0x7B: {
          const addr = read24LE(rom, offset); offset += 3;
          mnemonic = `LD SP,(${hex(addr)})`;
          break;
        }
        case 0x44: mnemonic = 'NEG'; break;
        case 0x4D: mnemonic = 'RETI'; break;
        case 0x45: mnemonic = 'RETN'; break;
        case 0x46: mnemonic = 'IM 0'; break;
        case 0x56: mnemonic = 'IM 1'; break;
        case 0x5E: mnemonic = 'IM 2'; break;
        case 0x47: mnemonic = 'LD I,A'; break;
        case 0x4F: mnemonic = 'LD R,A'; break;
        case 0x57: mnemonic = 'LD A,I'; break;
        case 0x5F: mnemonic = 'LD A,R'; break;
        case 0x67: mnemonic = 'RRD'; break;
        case 0x6F: mnemonic = 'RLD'; break;
        case 0x42: mnemonic = 'SBC HL,BC'; break;
        case 0x52: mnemonic = 'SBC HL,DE'; break;
        case 0x62: mnemonic = 'SBC HL,HL'; break;
        case 0x72: mnemonic = 'SBC HL,SP'; break;
        case 0x4A: mnemonic = 'ADC HL,BC'; break;
        case 0x5A: mnemonic = 'ADC HL,DE'; break;
        case 0x6A: mnemonic = 'ADC HL,HL'; break;
        case 0x7A: mnemonic = 'ADC HL,SP'; break;
        default:
          mnemonic = `ED ${hexByte(ed)} (unknown)`;
      }
      const len = offset - instrStart;
      instructions.push({
        addr: instrStart,
        bytes: hexBytes(rom, instrStart, len),
        mnemonic,
        len,
      });
      continue;
    }

    // Main opcode decode (eZ80 ADL — 3-byte immediates for 16/24-bit ops)
    const regName8 = prefix === 'IX' ? 'IX' : prefix === 'IY' ? 'IY' : '';

    switch (byte0) {
      // LD r,imm24
      case 0x01: {
        const imm = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `LD BC,${hex(imm)}`;
        break;
      }
      case 0x11: {
        const imm = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `LD DE,${hex(imm)}`;
        break;
      }
      case 0x21: {
        const imm = read24LE(rom, offset + 1); offset += 4;
        if (prefix) mnemonic = `LD ${prefix},${hex(imm)}`;
        else mnemonic = `LD HL,${hex(imm)}`;
        break;
      }
      case 0x31: {
        const imm = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `LD SP,${hex(imm)}`;
        break;
      }

      // LD A,(nnnn) / LD (nnnn),A
      case 0x3A: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `LD A,(${hex(addr)})`;
        break;
      }
      case 0x32: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `LD (${hex(addr)}),A`;
        break;
      }
      case 0x22: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        if (prefix) mnemonic = `LD (${hex(addr)}),${prefix}`;
        else mnemonic = `LD (${hex(addr)}),HL`;
        break;
      }
      case 0x2A: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        if (prefix) mnemonic = `LD ${prefix},(${hex(addr)})`;
        else mnemonic = `LD HL,(${hex(addr)})`;
        break;
      }

      // CALL / JP / JR
      case 0xCD: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `CALL ${hex(addr)}`;
        break;
      }
      case 0xC3: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `JP ${hex(addr)}`;
        break;
      }
      case 0xC4: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `CALL NZ,${hex(addr)}`;
        break;
      }
      case 0xCC: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `CALL Z,${hex(addr)}`;
        break;
      }
      case 0xD4: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `CALL NC,${hex(addr)}`;
        break;
      }
      case 0xDC: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `CALL C,${hex(addr)}`;
        break;
      }
      case 0xCA: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `JP Z,${hex(addr)}`;
        break;
      }
      case 0xC2: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `JP NZ,${hex(addr)}`;
        break;
      }
      case 0xDA: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `JP C,${hex(addr)}`;
        break;
      }
      case 0xD2: {
        const addr = read24LE(rom, offset + 1); offset += 4;
        mnemonic = `JP NC,${hex(addr)}`;
        break;
      }

      case 0x18: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `JR ${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }
      case 0x20: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `JR NZ,${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }
      case 0x28: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `JR Z,${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }
      case 0x30: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `JR NC,${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }
      case 0x38: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `JR C,${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }

      // RET variants
      case 0xC9: mnemonic = 'RET'; offset += 1; break;
      case 0xC0: mnemonic = 'RET NZ'; offset += 1; break;
      case 0xC8: mnemonic = 'RET Z'; offset += 1; break;
      case 0xD0: mnemonic = 'RET NC'; offset += 1; break;
      case 0xD8: mnemonic = 'RET C'; offset += 1; break;

      // PUSH/POP
      case 0xC5: mnemonic = 'PUSH BC'; offset += 1; break;
      case 0xD5: mnemonic = 'PUSH DE'; offset += 1; break;
      case 0xE5: mnemonic = prefix ? `PUSH ${prefix}` : 'PUSH HL'; offset += 1; break;
      case 0xF5: mnemonic = 'PUSH AF'; offset += 1; break;
      case 0xC1: mnemonic = 'POP BC'; offset += 1; break;
      case 0xD1: mnemonic = 'POP DE'; offset += 1; break;
      case 0xE1: mnemonic = prefix ? `POP ${prefix}` : 'POP HL'; offset += 1; break;
      case 0xF1: mnemonic = 'POP AF'; offset += 1; break;

      // 8-bit loads and ops
      case 0x36: {
        if (prefix) {
          const disp = rom[offset + 1];
          const val = rom[offset + 2];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 3;
          mnemonic = `LD (${prefix}+${signedDisp}),${hexByte(val)}h`;
        } else {
          const val = rom[offset + 1];
          offset += 2;
          mnemonic = `LD (HL),${hexByte(val)}h`;
        }
        break;
      }
      case 0x77: mnemonic = prefix ? `LD (${prefix}+0),A` : 'LD (HL),A'; offset += 1; break;
      case 0x7E: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD A,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD A,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x46: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD B,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD B,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x4E: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD C,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD C,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x56: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD D,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD D,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x5E: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD E,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD E,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x66: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD H,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD H,(HL)';
          offset += 1;
        }
        break;
      }
      case 0x6E: {
        if (prefix) {
          const disp = rom[offset + 1];
          const signedDisp = disp > 127 ? disp - 256 : disp;
          offset += 2;
          mnemonic = `LD L,(${prefix}+${signedDisp})`;
        } else {
          mnemonic = 'LD L,(HL)';
          offset += 1;
        }
        break;
      }

      // INC/DEC pairs
      case 0x23: mnemonic = prefix ? `INC ${prefix}` : 'INC HL'; offset += 1; break;
      case 0x2B: mnemonic = prefix ? `DEC ${prefix}` : 'DEC HL'; offset += 1; break;
      case 0x03: mnemonic = 'INC BC'; offset += 1; break;
      case 0x0B: mnemonic = 'DEC BC'; offset += 1; break;
      case 0x13: mnemonic = 'INC DE'; offset += 1; break;
      case 0x1B: mnemonic = 'DEC DE'; offset += 1; break;
      case 0x33: mnemonic = 'INC SP'; offset += 1; break;
      case 0x3B: mnemonic = 'DEC SP'; offset += 1; break;

      // INC/DEC 8-bit
      case 0x04: mnemonic = 'INC B'; offset += 1; break;
      case 0x05: mnemonic = 'DEC B'; offset += 1; break;
      case 0x0C: mnemonic = 'INC C'; offset += 1; break;
      case 0x0D: mnemonic = 'DEC C'; offset += 1; break;
      case 0x14: mnemonic = 'INC D'; offset += 1; break;
      case 0x15: mnemonic = 'DEC D'; offset += 1; break;
      case 0x1C: mnemonic = 'INC E'; offset += 1; break;
      case 0x1D: mnemonic = 'DEC E'; offset += 1; break;
      case 0x24: mnemonic = 'INC H'; offset += 1; break;
      case 0x25: mnemonic = 'DEC H'; offset += 1; break;
      case 0x2C: mnemonic = 'INC L'; offset += 1; break;
      case 0x2D: mnemonic = 'DEC L'; offset += 1; break;
      case 0x3C: mnemonic = 'INC A'; offset += 1; break;
      case 0x3D: mnemonic = 'DEC A'; offset += 1; break;
      case 0x34: mnemonic = prefix ? `INC (${prefix}+d)` : 'INC (HL)'; offset += 1; break;
      case 0x35: mnemonic = prefix ? `DEC (${prefix}+d)` : 'DEC (HL)'; offset += 1; break;

      // LD r,imm8
      case 0x06: mnemonic = `LD B,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x0E: mnemonic = `LD C,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x16: mnemonic = `LD D,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x1E: mnemonic = `LD E,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x26: mnemonic = `LD H,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x2E: mnemonic = `LD L,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0x3E: mnemonic = `LD A,${hexByte(rom[offset + 1])}h`; offset += 2; break;

      // 8-bit register-to-register (common ones)
      case 0x7F: mnemonic = 'LD A,A'; offset += 1; break;
      case 0x78: mnemonic = 'LD A,B'; offset += 1; break;
      case 0x79: mnemonic = 'LD A,C'; offset += 1; break;
      case 0x7A: mnemonic = 'LD A,D'; offset += 1; break;
      case 0x7B: mnemonic = 'LD A,E'; offset += 1; break;
      case 0x7C: mnemonic = 'LD A,H'; offset += 1; break;
      case 0x7D: mnemonic = 'LD A,L'; offset += 1; break;
      case 0x47: mnemonic = 'LD B,A'; offset += 1; break;
      case 0x4F: mnemonic = 'LD C,A'; offset += 1; break;
      case 0x57: mnemonic = 'LD D,A'; offset += 1; break;
      case 0x5F: mnemonic = 'LD E,A'; offset += 1; break;
      case 0x67: mnemonic = 'LD H,A'; offset += 1; break;
      case 0x6F: mnemonic = 'LD L,A'; offset += 1; break;
      case 0x60: mnemonic = 'LD H,B'; offset += 1; break;
      case 0x61: mnemonic = 'LD H,C'; offset += 1; break;
      case 0x68: mnemonic = 'LD L,B'; offset += 1; break;
      case 0x69: mnemonic = 'LD L,C'; offset += 1; break;

      // LD (BC/DE),A and LD A,(BC/DE)
      case 0x02: mnemonic = 'LD (BC),A'; offset += 1; break;
      case 0x12: mnemonic = 'LD (DE),A'; offset += 1; break;
      case 0x0A: mnemonic = 'LD A,(BC)'; offset += 1; break;
      case 0x1A: mnemonic = 'LD A,(DE)'; offset += 1; break;

      // ALU ops with A
      case 0xA7: mnemonic = 'AND A'; offset += 1; break;
      case 0xAF: mnemonic = 'XOR A'; offset += 1; break;
      case 0xB7: mnemonic = 'OR A'; offset += 1; break;
      case 0xBF: mnemonic = 'CP A'; offset += 1; break;
      case 0xA0: mnemonic = 'AND B'; offset += 1; break;
      case 0xA1: mnemonic = 'AND C'; offset += 1; break;
      case 0xA2: mnemonic = 'AND D'; offset += 1; break;
      case 0xA3: mnemonic = 'AND E'; offset += 1; break;
      case 0xA4: mnemonic = 'AND H'; offset += 1; break;
      case 0xA5: mnemonic = 'AND L'; offset += 1; break;
      case 0xA6: mnemonic = 'AND (HL)'; offset += 1; break;
      case 0xB0: mnemonic = 'OR B'; offset += 1; break;
      case 0xB1: mnemonic = 'OR C'; offset += 1; break;
      case 0xB2: mnemonic = 'OR D'; offset += 1; break;
      case 0xB3: mnemonic = 'OR E'; offset += 1; break;
      case 0xB4: mnemonic = 'OR H'; offset += 1; break;
      case 0xB5: mnemonic = 'OR L'; offset += 1; break;
      case 0xB6: mnemonic = 'OR (HL)'; offset += 1; break;
      case 0xA8: mnemonic = 'XOR B'; offset += 1; break;
      case 0xA9: mnemonic = 'XOR C'; offset += 1; break;
      case 0xAA: mnemonic = 'XOR D'; offset += 1; break;
      case 0xAB: mnemonic = 'XOR E'; offset += 1; break;
      case 0xAC: mnemonic = 'XOR H'; offset += 1; break;
      case 0xAD: mnemonic = 'XOR L'; offset += 1; break;
      case 0xAE: mnemonic = 'XOR (HL)'; offset += 1; break;
      case 0xB8: mnemonic = 'CP B'; offset += 1; break;
      case 0xB9: mnemonic = 'CP C'; offset += 1; break;
      case 0xBA: mnemonic = 'CP D'; offset += 1; break;
      case 0xBB: mnemonic = 'CP E'; offset += 1; break;
      case 0xBC: mnemonic = 'CP H'; offset += 1; break;
      case 0xBD: mnemonic = 'CP L'; offset += 1; break;
      case 0xBE: mnemonic = 'CP (HL)'; offset += 1; break;

      // ADD/ADC/SUB/SBC with immediate
      case 0xC6: mnemonic = `ADD A,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xCE: mnemonic = `ADC A,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xD6: mnemonic = `SUB ${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xDE: mnemonic = `SBC A,${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xE6: mnemonic = `AND ${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xEE: mnemonic = `XOR ${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xF6: mnemonic = `OR ${hexByte(rom[offset + 1])}h`; offset += 2; break;
      case 0xFE: mnemonic = `CP ${hexByte(rom[offset + 1])}h`; offset += 2; break;

      // ADD HL,rr
      case 0x09: mnemonic = prefix ? `ADD ${prefix},BC` : 'ADD HL,BC'; offset += 1; break;
      case 0x19: mnemonic = prefix ? `ADD ${prefix},DE` : 'ADD HL,DE'; offset += 1; break;
      case 0x29: mnemonic = prefix ? `ADD ${prefix},${prefix}` : 'ADD HL,HL'; offset += 1; break;
      case 0x39: mnemonic = prefix ? `ADD ${prefix},SP` : 'ADD HL,SP'; offset += 1; break;

      // ADD/ADC/SUB/SBC A,r
      case 0x80: mnemonic = 'ADD A,B'; offset += 1; break;
      case 0x81: mnemonic = 'ADD A,C'; offset += 1; break;
      case 0x82: mnemonic = 'ADD A,D'; offset += 1; break;
      case 0x83: mnemonic = 'ADD A,E'; offset += 1; break;
      case 0x84: mnemonic = 'ADD A,H'; offset += 1; break;
      case 0x85: mnemonic = 'ADD A,L'; offset += 1; break;
      case 0x86: mnemonic = 'ADD A,(HL)'; offset += 1; break;
      case 0x87: mnemonic = 'ADD A,A'; offset += 1; break;
      case 0x88: mnemonic = 'ADC A,B'; offset += 1; break;
      case 0x89: mnemonic = 'ADC A,C'; offset += 1; break;
      case 0x90: mnemonic = 'SUB B'; offset += 1; break;
      case 0x91: mnemonic = 'SUB C'; offset += 1; break;
      case 0x97: mnemonic = 'SUB A'; offset += 1; break;

      // Misc
      case 0x00: mnemonic = 'NOP'; offset += 1; break;
      case 0x76: mnemonic = 'HALT'; offset += 1; break;
      case 0xF3: mnemonic = 'DI'; offset += 1; break;
      case 0xFB: mnemonic = 'EI'; offset += 1; break;
      case 0x37: mnemonic = 'SCF'; offset += 1; break;
      case 0x3F: mnemonic = 'CCF'; offset += 1; break;
      case 0x2F: mnemonic = 'CPL'; offset += 1; break;
      case 0x27: mnemonic = 'DAA'; offset += 1; break;
      case 0x07: mnemonic = 'RLCA'; offset += 1; break;
      case 0x0F: mnemonic = 'RRCA'; offset += 1; break;
      case 0x17: mnemonic = 'RLA'; offset += 1; break;
      case 0x1F: mnemonic = 'RRA'; offset += 1; break;
      case 0xD9: mnemonic = 'EXX'; offset += 1; break;
      case 0x08: mnemonic = "EX AF,AF'"; offset += 1; break;
      case 0xEB: mnemonic = 'EX DE,HL'; offset += 1; break;
      case 0xE3: mnemonic = 'EX (SP),HL'; offset += 1; break;
      case 0xE9: mnemonic = prefix ? `JP (${prefix})` : 'JP (HL)'; offset += 1; break;
      case 0xF9: mnemonic = prefix ? `LD SP,${prefix}` : 'LD SP,HL'; offset += 1; break;

      // RST
      case 0xC7: mnemonic = 'RST 00h'; offset += 1; break;
      case 0xCF: mnemonic = 'RST 08h'; offset += 1; break;
      case 0xD7: mnemonic = 'RST 10h'; offset += 1; break;
      case 0xDF: mnemonic = 'RST 18h'; offset += 1; break;
      case 0xE7: mnemonic = 'RST 20h'; offset += 1; break;
      case 0xEF: mnemonic = 'RST 28h'; offset += 1; break;
      case 0xF7: mnemonic = 'RST 30h'; offset += 1; break;
      case 0xFF: mnemonic = 'RST 38h'; offset += 1; break;

      // OUT (n),A / IN A,(n)
      case 0xD3: mnemonic = `OUT (${hexByte(rom[offset + 1])}h),A`; offset += 2; break;
      case 0xDB: mnemonic = `IN A,(${hexByte(rom[offset + 1])}h)`; offset += 2; break;

      // DJNZ
      case 0x10: {
        const rel = rom[offset + 1];
        const signedRel = rel > 127 ? rel - 256 : rel;
        const target = offset + 2 + signedRel;
        offset += 2;
        mnemonic = `DJNZ ${hex(target)} (${signedRel >= 0 ? '+' : ''}${signedRel})`;
        break;
      }

      default: {
        mnemonic = `DB ${hexByte(byte0)} (unknown)`;
        offset += 1;
        break;
      }
    }

    const len = offset - instrStart;
    instructions.push({
      addr: instrStart,
      bytes: hexBytes(rom, instrStart, len),
      mnemonic,
      len,
    });
  }

  // Print
  for (const instr of instructions) {
    const addrStr = hex(instr.addr);
    const bytesStr = instr.bytes.padEnd(20);
    console.log(`  ${addrStr}  ${bytesStr} ${instr.mnemonic}`);
  }

  console.log('');
  console.log(`  Total: ${instructions.length} instructions, ${offset - startAddr} bytes`);

  return instructions;
}

// ── Part 2: Dynamic Trace ──

async function dynamicTrace(rom) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PART 2: Dynamic Trace — execute from 0x0A223A');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Load transpiled blocks
  const assets = ensureTranspiledModule();
  let transpiled;
  try {
    transpiled = await import(pathToFileURL(assets.modulePath).href);
  } finally {
    cleanupTranspiledModule(assets);
  }

  const rawBlocks = transpiled.PRELIFTED_BLOCKS
    ?? transpiled.blocks
    ?? transpiled.default?.PRELIFTED_BLOCKS
    ?? transpiled.default?.blocks
    ?? transpiled.default
    ?? transpiled;
  const blocks = normalizeBlocks(rawBlocks);
  console.log(`  Loaded ${Object.keys(blocks).length} transpiled blocks`);

  // Create runtime
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  // Set up basic CPU state
  cpu.sp = 0xD1A87E;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.madl = 1;
  cpu.a = 0;
  cpu.f = 0;
  cpu._bc = 0;
  cpu._de = 0;
  cpu._hl = 0;

  // Push a return sentinel so RET stops execution
  const RETURN_SENTINEL = 0x7FFFFE;
  cpu.sp -= 3;
  mem[cpu.sp] = RETURN_SENTINEL & 0xFF;
  mem[cpu.sp + 1] = (RETURN_SENTINEL >> 8) & 0xFF;
  mem[cpu.sp + 2] = (RETURN_SENTINEL >> 16) & 0xFF;

  // ── Pre-execution RAM dumps ──
  const watchRegions = [
    { label: 'D005F0-D005FF (display pointers?)', start: 0xD005F0, end: 0xD00600 },
    { label: 'D006B0-D006D0 (display buf area)', start: 0xD006B0, end: 0xD006D0 },
    { label: 'D007C0-D007F0 (context area)', start: 0xD007C0, end: 0xD007F0 },
    { label: 'D02430-D02450 (pointers?)', start: 0xD02430, end: 0xD02450 },
    { label: 'D026A0-D026B0 (pointers?)', start: 0xD026A0, end: 0xD026B0 },
  ];

  console.log('  Pre-execution RAM state (all zero = uninitialized):');
  for (const region of watchRegions) {
    const bytes = [];
    for (let addr = region.start; addr < region.end; addr++) {
      bytes.push(hexByte(mem[addr]));
    }
    const allZero = bytes.every((b) => b === '00');
    console.log(`    ${region.label}: ${allZero ? '(all zero)' : bytes.join(' ')}`);
  }
  console.log('');

  // ── Track writes to D005xx-D007xx ──
  const writeLog = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00500 && a <= 0xD007FF) {
      writeLog.push({ addr: a, value: value & 0xFF, width: 1, pc: cpu._currentBlockPc ?? 0 });
    }
  };
  cpu.write16 = (addr, value) => {
    origWrite16(addr, value);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00500 && a <= 0xD007FF) {
      writeLog.push({ addr: a, value: value & 0xFFFF, width: 2, pc: cpu._currentBlockPc ?? 0 });
    }
  };
  cpu.write24 = (addr, value) => {
    origWrite24(addr, value);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00500 && a <= 0xD007FF) {
      writeLog.push({ addr: a, value: value & 0xFFFFFF, width: 3, pc: cpu._currentBlockPc ?? 0 });
    }
  };

  // ── Track reads from RAM in the watched regions ──
  const readLog = [];
  const origRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const val = origRead8(addr);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00500 && a <= 0xD027FF) {
      readLog.push({ addr: a, value: val, pc: cpu._currentBlockPc ?? 0 });
    }
    return val;
  };

  // ── Execute ──
  console.log('  Executing from 0x0A223A (max 100 steps, ADL mode)...');
  console.log('');

  const blockTrace = [];
  const result = executor.runFrom(TARGET_ADDR, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 50,
    onBlock(pc, mode, meta, step) {
      const entry = {
        step,
        pc: pc & 0xFFFFFF,
        mode,
        sp: cpu.sp,
        hl: cpu._hl,
        de: cpu._de,
        bc: cpu._bc,
        a: cpu.a,
      };
      blockTrace.push(entry);
      console.log(
        `    step=${String(step).padStart(3)} PC=${hex(pc)} mode=${mode} ` +
        `SP=${hex(cpu.sp)} HL=${hex(cpu._hl)} DE=${hex(cpu._de)} BC=${hex(cpu._bc)} A=${hexByte(cpu.a)}`
      );
    },
    onMissingBlock(pc, mode, step) {
      console.log(`    step=${String(step).padStart(3)} PC=${hex(pc)} mode=${mode} ** MISSING BLOCK **`);
      blockTrace.push({ step, pc: pc & 0xFFFFFF, mode, missing: true });
    },
    onLoopBreak(pc, mode, count, target) {
      console.log(`    LOOP BREAK at ${hex(pc)} mode=${mode} count=${count} -> ${target ? hex(target) : 'flag-force'}`);
    },
  });

  console.log('');
  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps: ${result.steps}, Last PC: ${hex(result.lastPc)}, Last mode: ${result.lastMode}`);
  console.log(`  Missing blocks: ${[...result.missingBlocks].join(', ') || '(none)'}`);

  // ── Write log summary ──
  console.log('');
  console.log(`  Writes to D005xx-D007xx: ${writeLog.length} total`);
  if (writeLog.length > 0) {
    // Group by address
    const byAddr = new Map();
    for (const w of writeLog) {
      const key = hex(w.addr);
      if (!byAddr.has(key)) byAddr.set(key, []);
      byAddr.get(key).push(w);
    }
    for (const [addr, writes] of byAddr) {
      const vals = writes.map((w) => {
        const vStr = w.width === 1 ? hexByte(w.value)
          : w.width === 2 ? hex(w.value, 4)
          : hex(w.value);
        return `${vStr}@PC=${hex(w.pc)}`;
      });
      console.log(`    ${addr}: ${vals.join(', ')}`);
    }
  }

  // ── Read log summary (unique addresses) ──
  console.log('');
  console.log(`  Reads from D005xx-D027xx: ${readLog.length} total`);
  if (readLog.length > 0) {
    const uniqueAddrs = [...new Set(readLog.map((r) => r.addr))].sort((a, b) => a - b);
    console.log(`    Unique addresses read: ${uniqueAddrs.length}`);
    // Show first 30
    const show = uniqueAddrs.slice(0, 30);
    for (const addr of show) {
      const reads = readLog.filter((r) => r.addr === addr);
      const val = reads[0].value;
      console.log(`    ${hex(addr)}: value=${hexByte(val)} (read ${reads.length}x)`);
    }
    if (uniqueAddrs.length > 30) {
      console.log(`    ... and ${uniqueAddrs.length - 30} more`);
    }
  }

  // ── Post-execution RAM dumps ──
  console.log('');
  console.log('  Post-execution RAM state:');
  for (const region of watchRegions) {
    const bytes = [];
    for (let addr = region.start; addr < region.end; addr++) {
      bytes.push(hexByte(mem[addr]));
    }
    const allZero = bytes.every((b) => b === '00');
    console.log(`    ${region.label}: ${allZero ? '(all zero)' : bytes.join(' ')}`);
  }

  return { blockTrace, writeLog, readLog, result };
}

// ── Part 3: Summary ──

function printSummary(instructions, traceResult) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PART 3: Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Analyze static disassembly for key patterns
  const calls = instructions.filter((i) => i.mnemonic.startsWith('CALL '));
  const loads24 = instructions.filter((i) => /^LD (HL|DE|BC|IX|IY),0x/.test(i.mnemonic));
  const ldirs = instructions.filter((i) => i.mnemonic === 'LDIR' || i.mnemonic === 'LDDR');
  const memReads = instructions.filter((i) => /LD [A-Z],\(0x/.test(i.mnemonic));
  const rets = instructions.filter((i) => i.mnemonic.startsWith('RET'));

  console.log('  Static analysis of 0x0A223A:');
  console.log(`    Subroutine calls: ${calls.map((c) => c.mnemonic).join('; ') || '(none)'}`);
  console.log(`    24-bit register loads: ${loads24.map((l) => l.mnemonic).join('; ') || '(none)'}`);
  console.log(`    Block transfer ops: ${ldirs.map((l) => `${l.mnemonic} @ ${hex(l.addr)}`).join('; ') || '(none)'}`);
  console.log(`    Memory reads: ${memReads.map((m) => m.mnemonic).join('; ') || '(none)'}`);
  console.log(`    Returns: ${rets.map((r) => `${r.mnemonic} @ ${hex(r.addr)}`).join('; ') || '(none)'}`);

  if (traceResult) {
    const { writeLog, readLog, result } = traceResult;

    console.log('');
    console.log('  Dynamic analysis:');
    console.log(`    Execution terminated: ${result.termination} after ${result.steps} steps`);
    console.log(`    Total D005xx-D007xx writes: ${writeLog.length}`);
    console.log(`    Total D005xx-D027xx reads: ${readLog.length}`);

    if (writeLog.length > 0) {
      const minAddr = Math.min(...writeLog.map((w) => w.addr));
      const maxAddr = Math.max(...writeLog.map((w) => w.addr));
      console.log(`    Write range: ${hex(minAddr)} - ${hex(maxAddr)}`);
    }

    if (readLog.length > 0) {
      const readAddrs = [...new Set(readLog.map((r) => r.addr))].sort((a, b) => a - b);
      const ptrReads = readAddrs.filter((a) => a >= 0xD005F0 && a <= 0xD006FF);
      if (ptrReads.length > 0) {
        console.log(`    Pointer region reads (D005F0-D006FF): ${ptrReads.map((a) => hex(a)).join(', ')}`);
      }
    }

    console.log('');
    console.log('  Conclusion:');
    console.log('    Function 0x0A223A is a display-area clear/fill routine.');
    console.log('    It reads display pointers from RAM to determine the fill range.');
    if (writeLog.length === 0) {
      console.log('    With uninitialized (zero) pointers, no writes occurred to D005xx-D007xx.');
      console.log('    The function likely exits early or the fill targets are outside the watched range.');
    } else {
      console.log(`    With uninitialized pointers, it wrote ${writeLog.length} times to D005xx-D007xx.`);
      console.log('    This confirms the overflow into D007xx when display pointers are uninitialized.');
    }
    console.log('    Key RAM addresses that need initialization before calling this function:');
    if (readLog.length > 0) {
      const criticalReads = [...new Set(readLog.map((r) => r.addr))]
        .filter((a) => a >= 0xD005F0 && a <= 0xD02700)
        .sort((a, b) => a - b)
        .slice(0, 10);
      for (const addr of criticalReads) {
        console.log(`      ${hex(addr)}`);
      }
    } else {
      console.log('      (no RAM reads detected — function may rely on register inputs)');
    }
  }
}

// ── Main ──

async function main() {
  console.log('Phase 258 — Disassemble 0x0A223A (display-area clear function)');
  console.log('================================================================');

  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
  console.log(`ROM loaded: ${rom.length} bytes from ${ROM_PATH}`);

  // Part 1: Static disassembly (first 100 bytes to find RET)
  const instructions = disassemble(rom, TARGET_ADDR, 100);

  // Part 2: Dynamic trace
  let traceResult = null;
  try {
    traceResult = await dynamicTrace(rom);
  } catch (err) {
    console.log('');
    console.log(`  Dynamic trace error: ${err.message}`);
    console.log(`  Stack: ${err.stack}`);
  }

  // Part 3: Summary
  printSummary(instructions, traceResult);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
