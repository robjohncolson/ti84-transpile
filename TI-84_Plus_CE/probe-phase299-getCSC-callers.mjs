#!/usr/bin/env node

/**
 * probe-phase299-getCSC-callers.mjs
 *
 * Trace the caller chain for the primary keyboard scanner at 0x0159C0.
 *
 * Key insight: there are ZERO static CALL/JP references to 0x0159C0 in the
 * entire 4MB ROM. The scanner is invoked indirectly via a ROM-to-RAM copy
 * framework at 0x000D7E. The parameter block address 0x0159BD is loaded into
 * IX, then 0x000D7E copies 282 bytes from ROM to RAM and executes via JP (IX).
 *
 * This probe:
 *   1. Scans for all references to 0x0159BD (the parameter block)
 *   2. Scans for all CALL/JP to the code-copy framework 0x000D7E
 *   3. Decodes the caller chain around 0x015960-0x0159BF
 *   4. Maps the _GetCSC data flow (scanner -> 0xD00587 -> _GetCSC)
 *   5. Searches for callers of the function containing 0x015980
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

// --- Helpers ---

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function read24LE(offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function read16LE(offset) {
  return ((rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8)) >>> 0;
}

function bytesHex(start, length) {
  const end = Math.min(rom.length, start + length);
  const clamped = Math.max(0, start);
  return Array.from(rom.subarray(clamped, end), (b) => hexByte(b)).join(' ');
}

function contextDump(addr, radius = 16) {
  const start = Math.max(0, addr - radius);
  const end = Math.min(rom.length, addr + radius);
  return `  ${hex(start)}: ${bytesHex(start, end - start)}`;
}

// --- Section 1: Search for references to 0x0159BD (parameter block) ---

function scanForParamBlockRefs() {
  console.log('='.repeat(72));
  console.log('SECTION 1: References to parameter block 0x0159BD');
  console.log('='.repeat(72));

  // LD IX, 0x0159BD -> DD 21 BD 59 01
  const ldIxPattern = [0xDD, 0x21, 0xBD, 0x59, 0x01];
  // LD HL, 0x0159BD -> 21 BD 59 01
  const ldHlPattern = [0x21, 0xBD, 0x59, 0x01];

  let found = 0;

  // Scan for LD IX, 0x0159BD
  for (let i = 0; i < ROM_SIZE - ldIxPattern.length; i++) {
    let match = true;
    for (let j = 0; j < ldIxPattern.length; j++) {
      if (rom[i + j] !== ldIxPattern[j]) { match = false; break; }
    }
    if (match) {
      console.log(`\n  [LD IX] ${hex(i)}: ${bytesHex(i, ldIxPattern.length)}`);
      console.log(`    LD IX, 0x0159BD`);
      console.log(contextDump(i));
      found++;
    }
  }

  // Scan for LD HL, 0x0159BD (excluding DD prefix matches)
  for (let i = 0; i < ROM_SIZE - ldHlPattern.length; i++) {
    let match = true;
    for (let j = 0; j < ldHlPattern.length; j++) {
      if (rom[i + j] !== ldHlPattern[j]) { match = false; break; }
    }
    if (match) {
      // Skip if this is part of the DD 21 match (IX variant)
      if (i > 0 && rom[i - 1] === 0xDD) continue;
      console.log(`\n  [LD HL] ${hex(i)}: ${bytesHex(i, ldHlPattern.length)}`);
      console.log(`    LD HL, 0x0159BD`);
      console.log(contextDump(i));
      found++;
    }
  }

  // Scan for the raw 3-byte address 0x0159BD in CALL or JP operands
  for (let i = 0; i < ROM_SIZE - 4; i++) {
    if (rom[i + 1] === 0xBD && rom[i + 2] === 0x59 && rom[i + 3] === 0x01) {
      const opcode = rom[i];
      if (opcode === 0xCD || opcode === 0xC3) {
        const mnemonic = opcode === 0xCD ? 'CALL' : 'JP';
        console.log(`\n  [${mnemonic}] ${hex(i)}: ${bytesHex(i, 4)}`);
        console.log(`    ${mnemonic} 0x0159BD`);
        console.log(contextDump(i));
        found++;
      }
    }
  }

  console.log(`\n  Total references to 0x0159BD: ${found}`);
}

// --- Section 2: All CALL/JP to code-copy framework 0x000D7E ---

function scanForCopyCalls() {
  console.log('\n' + '='.repeat(72));
  console.log('SECTION 2: All CALL/JP to code-copy framework 0x000D7E');
  console.log('='.repeat(72));

  const target = [0x7E, 0x0D, 0x00];
  const results = [];

  for (let i = 0; i < ROM_SIZE - 4; i++) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) &&
        rom[i + 1] === target[0] &&
        rom[i + 2] === target[1] &&
        rom[i + 3] === target[2]) {
      const mnemonic = opcode === 0xCD ? 'CALL' : 'JP';
      results.push({ addr: i, mnemonic });
    }
  }

  console.log(`\n  Found ${results.length} references to 0x000D7E:\n`);

  for (const { addr, mnemonic } of results) {
    console.log(`  ${hex(addr)}: ${mnemonic} 0x000D7E`);
    console.log(`    bytes: ${bytesHex(addr, 4)}`);

    // Look backwards for a LD IX,imm24 (DD 21 xx xx xx) within 20 bytes
    for (let back = 1; back <= 20; back++) {
      const check = addr - back;
      if (check >= 1 && rom[check] === 0x21 && rom[check - 1] === 0xDD) {
        const paramAddr = read24LE(check + 1);
        console.log(`    preceding LD IX: ${hex(check - 1)} -> LD IX, ${hex(paramAddr)}`);

        // Read the 2-byte length from the parameter block
        if (paramAddr < ROM_SIZE - 2) {
          const copyLen = read16LE(paramAddr);
          console.log(`    param block at ${hex(paramAddr)}: length = ${copyLen} (${hex(copyLen, 4)}) bytes`);
          console.log(`    code source: ${hex(paramAddr + 2)}..${hex(paramAddr + 2 + copyLen - 1)}`);
        }
        break;
      }
    }
    console.log(`    context: ${bytesHex(Math.max(0, addr - 8), 20)}`);
    console.log('');
  }
}

// --- Section 3: Decode the instruction stream around 0x015960-0x0159BF ---

function decodeCallerChain() {
  console.log('='.repeat(72));
  console.log('SECTION 3: Instruction decode around 0x015960-0x0159C0');
  console.log('='.repeat(72));
  console.log('');

  const START = 0x015960;
  const END = 0x0159C0;
  let pc = START;

  while (pc < END) {
    const startPc = pc;
    const byte0 = rom[pc];

    let mnemonic = '';
    let len = 1;

    if (byte0 === 0xDD) {
      const byte1 = rom[pc + 1];
      if (byte1 === 0x21) {
        const imm = read24LE(pc + 2);
        mnemonic = `LD IX, ${hex(imm)}`;
        len = 5;
      } else if (byte1 === 0xE5) {
        mnemonic = 'PUSH IX';
        len = 2;
      } else if (byte1 === 0xE1) {
        mnemonic = 'POP IX';
        len = 2;
      } else if (byte1 === 0x7E) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD A, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0xE9) {
        mnemonic = 'JP (IX)';
        len = 2;
      } else {
        mnemonic = `DD ${hexByte(byte1)} (IX prefix)`;
        len = 2;
      }
    } else if (byte0 === 0xED) {
      const byte1 = rom[pc + 1];
      if (byte1 === 0xB0) {
        mnemonic = 'LDIR';
        len = 2;
      } else if (byte1 === 0xB8) {
        mnemonic = 'LDDR';
        len = 2;
      } else if (byte1 === 0x43) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD (${hex(addr)}), BC`;
        len = 5;
      } else if (byte1 === 0x53) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD (${hex(addr)}), DE`;
        len = 5;
      } else if (byte1 === 0x73) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD (${hex(addr)}), SP`;
        len = 5;
      } else if (byte1 === 0x4B) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD BC, (${hex(addr)})`;
        len = 5;
      } else if (byte1 === 0x5B) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD DE, (${hex(addr)})`;
        len = 5;
      } else if (byte1 === 0x7B) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD SP, (${hex(addr)})`;
        len = 5;
      } else {
        mnemonic = `ED ${hexByte(byte1)}`;
        len = 2;
      }
    } else if (byte0 === 0xCB) {
      const byte1 = rom[pc + 1];
      const bit = (byte1 >> 3) & 7;
      const reg = byte1 & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      if ((byte1 & 0xC0) === 0x40) {
        mnemonic = `BIT ${bit}, ${regNames[reg]}`;
      } else if ((byte1 & 0xC0) === 0xC0) {
        mnemonic = `SET ${bit}, ${regNames[reg]}`;
      } else if ((byte1 & 0xC0) === 0x80) {
        mnemonic = `RES ${bit}, ${regNames[reg]}`;
      } else {
        mnemonic = `CB ${hexByte(byte1)}`;
      }
      len = 2;
    } else {
      switch (byte0) {
        case 0x00: mnemonic = 'NOP'; break;
        case 0x01: { const imm = read24LE(pc + 1); mnemonic = `LD BC, ${hex(imm)}`; len = 4; break; }
        case 0x11: { const imm = read24LE(pc + 1); mnemonic = `LD DE, ${hex(imm)}`; len = 4; break; }
        case 0x21: { const imm = read24LE(pc + 1); mnemonic = `LD HL, ${hex(imm)}`; len = 4; break; }
        case 0x31: { const imm = read24LE(pc + 1); mnemonic = `LD SP, ${hex(imm)}`; len = 4; break; }
        case 0x3E: { mnemonic = `LD A, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x06: { mnemonic = `LD B, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x0E: { mnemonic = `LD C, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x16: { mnemonic = `LD D, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x1E: { mnemonic = `LD E, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x26: { mnemonic = `LD H, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0x2E: { mnemonic = `LD L, ${hex(rom[pc + 1], 2)}`; len = 2; break; }

        case 0x32: { const addr = read24LE(pc + 1); mnemonic = `LD (${hex(addr)}), A`; len = 4; break; }
        case 0x3A: { const addr = read24LE(pc + 1); mnemonic = `LD A, (${hex(addr)})`; len = 4; break; }
        case 0x22: { const addr = read24LE(pc + 1); mnemonic = `LD (${hex(addr)}), HL`; len = 4; break; }
        case 0x2A: { const addr = read24LE(pc + 1); mnemonic = `LD HL, (${hex(addr)})`; len = 4; break; }

        case 0x76: mnemonic = 'HALT'; break;

        case 0x78: mnemonic = 'LD A, B'; break;
        case 0x79: mnemonic = 'LD A, C'; break;
        case 0x7A: mnemonic = 'LD A, D'; break;
        case 0x7B: mnemonic = 'LD A, E'; break;
        case 0x7C: mnemonic = 'LD A, H'; break;
        case 0x7D: mnemonic = 'LD A, L'; break;
        case 0x7E: mnemonic = 'LD A, (HL)'; break;
        case 0x7F: mnemonic = 'LD A, A'; break;
        case 0x47: mnemonic = 'LD B, A'; break;
        case 0x4F: mnemonic = 'LD C, A'; break;
        case 0x57: mnemonic = 'LD D, A'; break;
        case 0x5F: mnemonic = 'LD E, A'; break;
        case 0x67: mnemonic = 'LD H, A'; break;
        case 0x6F: mnemonic = 'LD L, A'; break;
        case 0x77: mnemonic = 'LD (HL), A'; break;

        case 0xAF: mnemonic = 'XOR A'; break;
        case 0xA7: mnemonic = 'AND A'; break;
        case 0xB7: mnemonic = 'OR A'; break;
        case 0xBF: mnemonic = 'CP A'; break;
        case 0xFE: { mnemonic = `CP ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0xE6: { mnemonic = `AND ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0xF6: { mnemonic = `OR ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0xEE: { mnemonic = `XOR ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0xC6: { mnemonic = `ADD A, ${hex(rom[pc + 1], 2)}`; len = 2; break; }
        case 0xD6: { mnemonic = `SUB ${hex(rom[pc + 1], 2)}`; len = 2; break; }

        case 0xB8: mnemonic = 'CP B'; break;
        case 0xB9: mnemonic = 'CP C'; break;
        case 0xBA: mnemonic = 'CP D'; break;
        case 0xBB: mnemonic = 'CP E'; break;
        case 0xBC: mnemonic = 'CP H'; break;
        case 0xBD: mnemonic = 'CP L'; break;
        case 0xBE: mnemonic = 'CP (HL)'; break;

        case 0x87: mnemonic = 'ADD A, A'; break;
        case 0x80: mnemonic = 'ADD A, B'; break;
        case 0x81: mnemonic = 'ADD A, C'; break;
        case 0x90: mnemonic = 'SUB B'; break;
        case 0x91: mnemonic = 'SUB C'; break;

        case 0x3C: mnemonic = 'INC A'; break;
        case 0x04: mnemonic = 'INC B'; break;
        case 0x0C: mnemonic = 'INC C'; break;
        case 0x14: mnemonic = 'INC D'; break;
        case 0x1C: mnemonic = 'INC E'; break;
        case 0x24: mnemonic = 'INC H'; break;
        case 0x2C: mnemonic = 'INC L'; break;
        case 0x34: mnemonic = 'INC (HL)'; break;

        case 0x3D: mnemonic = 'DEC A'; break;
        case 0x05: mnemonic = 'DEC B'; break;
        case 0x0D: mnemonic = 'DEC C'; break;
        case 0x15: mnemonic = 'DEC D'; break;
        case 0x1D: mnemonic = 'DEC E'; break;
        case 0x25: mnemonic = 'DEC H'; break;
        case 0x2D: mnemonic = 'DEC L'; break;
        case 0x35: mnemonic = 'DEC (HL)'; break;

        case 0x03: mnemonic = 'INC BC'; break;
        case 0x13: mnemonic = 'INC DE'; break;
        case 0x23: mnemonic = 'INC HL'; break;
        case 0x33: mnemonic = 'INC SP'; break;
        case 0x0B: mnemonic = 'DEC BC'; break;
        case 0x1B: mnemonic = 'DEC DE'; break;
        case 0x2B: mnemonic = 'DEC HL'; break;
        case 0x3B: mnemonic = 'DEC SP'; break;

        case 0x09: mnemonic = 'ADD HL, BC'; break;
        case 0x19: mnemonic = 'ADD HL, DE'; break;
        case 0x29: mnemonic = 'ADD HL, HL'; break;
        case 0x39: mnemonic = 'ADD HL, SP'; break;

        case 0xC5: mnemonic = 'PUSH BC'; break;
        case 0xD5: mnemonic = 'PUSH DE'; break;
        case 0xE5: mnemonic = 'PUSH HL'; break;
        case 0xF5: mnemonic = 'PUSH AF'; break;
        case 0xC1: mnemonic = 'POP BC'; break;
        case 0xD1: mnemonic = 'POP DE'; break;
        case 0xE1: mnemonic = 'POP HL'; break;
        case 0xF1: mnemonic = 'POP AF'; break;

        case 0xC9: mnemonic = 'RET'; break;
        case 0xC0: mnemonic = 'RET NZ'; break;
        case 0xC8: mnemonic = 'RET Z'; break;
        case 0xD0: mnemonic = 'RET NC'; break;
        case 0xD8: mnemonic = 'RET C'; break;
        case 0xE0: mnemonic = 'RET PO'; break;
        case 0xE8: mnemonic = 'RET PE'; break;
        case 0xF0: mnemonic = 'RET P'; break;
        case 0xF8: mnemonic = 'RET M'; break;

        case 0xCD: { const addr = read24LE(pc + 1); mnemonic = `CALL ${hex(addr)}`; len = 4; break; }
        case 0xC3: { const addr = read24LE(pc + 1); mnemonic = `JP ${hex(addr)}`; len = 4; break; }

        case 0xC4: { const addr = read24LE(pc + 1); mnemonic = `CALL NZ, ${hex(addr)}`; len = 4; break; }
        case 0xCC: { const addr = read24LE(pc + 1); mnemonic = `CALL Z, ${hex(addr)}`; len = 4; break; }
        case 0xD4: { const addr = read24LE(pc + 1); mnemonic = `CALL NC, ${hex(addr)}`; len = 4; break; }
        case 0xDC: { const addr = read24LE(pc + 1); mnemonic = `CALL C, ${hex(addr)}`; len = 4; break; }
        case 0xE4: { const addr = read24LE(pc + 1); mnemonic = `CALL PO, ${hex(addr)}`; len = 4; break; }
        case 0xEC: { const addr = read24LE(pc + 1); mnemonic = `CALL PE, ${hex(addr)}`; len = 4; break; }
        case 0xF4: { const addr = read24LE(pc + 1); mnemonic = `CALL P, ${hex(addr)}`; len = 4; break; }
        case 0xFC: { const addr = read24LE(pc + 1); mnemonic = `CALL M, ${hex(addr)}`; len = 4; break; }

        case 0xC2: { const addr = read24LE(pc + 1); mnemonic = `JP NZ, ${hex(addr)}`; len = 4; break; }
        case 0xCA: { const addr = read24LE(pc + 1); mnemonic = `JP Z, ${hex(addr)}`; len = 4; break; }
        case 0xD2: { const addr = read24LE(pc + 1); mnemonic = `JP NC, ${hex(addr)}`; len = 4; break; }
        case 0xDA: { const addr = read24LE(pc + 1); mnemonic = `JP C, ${hex(addr)}`; len = 4; break; }
        case 0xE2: { const addr = read24LE(pc + 1); mnemonic = `JP PO, ${hex(addr)}`; len = 4; break; }
        case 0xEA: { const addr = read24LE(pc + 1); mnemonic = `JP PE, ${hex(addr)}`; len = 4; break; }
        case 0xF2: { const addr = read24LE(pc + 1); mnemonic = `JP P, ${hex(addr)}`; len = 4; break; }
        case 0xFA: { const addr = read24LE(pc + 1); mnemonic = `JP M, ${hex(addr)}`; len = 4; break; }

        case 0x18: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `JR ${hex(target)}`;
          len = 2;
          break;
        }
        case 0x20: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `JR NZ, ${hex(target)}`;
          len = 2;
          break;
        }
        case 0x28: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `JR Z, ${hex(target)}`;
          len = 2;
          break;
        }
        case 0x30: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `JR NC, ${hex(target)}`;
          len = 2;
          break;
        }
        case 0x38: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `JR C, ${hex(target)}`;
          len = 2;
          break;
        }

        case 0xE9: mnemonic = 'JP (HL)'; break;
        case 0xF3: mnemonic = 'DI'; break;
        case 0xFB: mnemonic = 'EI'; break;
        case 0x37: mnemonic = 'SCF'; break;
        case 0x3F: mnemonic = 'CCF'; break;
        case 0x2F: mnemonic = 'CPL'; break;
        case 0x17: mnemonic = 'RLA'; break;
        case 0x1F: mnemonic = 'RRA'; break;
        case 0x07: mnemonic = 'RLCA'; break;
        case 0x0F: mnemonic = 'RRCA'; break;
        case 0x27: mnemonic = 'DAA'; break;

        case 0x10: {
          const offset = rom[pc + 1];
          const signed = offset > 127 ? offset - 256 : offset;
          const target = pc + 2 + signed;
          mnemonic = `DJNZ ${hex(target)}`;
          len = 2;
          break;
        }

        case 0xC7: mnemonic = 'RST 0x00'; break;
        case 0xCF: mnemonic = 'RST 0x08'; break;
        case 0xD7: mnemonic = 'RST 0x10'; break;
        case 0xDF: mnemonic = 'RST 0x18'; break;
        case 0xE7: mnemonic = 'RST 0x20'; break;
        case 0xEF: mnemonic = 'RST 0x28'; break;
        case 0xF7: mnemonic = 'RST 0x30'; break;
        case 0xFF: mnemonic = 'RST 0x38'; break;

        case 0x08: mnemonic = 'EX AF, AF\''; break;
        case 0xD9: mnemonic = 'EXX'; break;
        case 0xEB: mnemonic = 'EX DE, HL'; break;
        case 0xE3: mnemonic = 'EX (SP), HL'; break;

        case 0x02: mnemonic = 'LD (BC), A'; break;
        case 0x0A: mnemonic = 'LD A, (BC)'; break;
        case 0x12: mnemonic = 'LD (DE), A'; break;
        case 0x1A: mnemonic = 'LD A, (DE)'; break;

        case 0x36: { mnemonic = `LD (HL), ${hex(rom[pc + 1], 2)}`; len = 2; break; }

        default:
          mnemonic = `db ${hex(byte0, 2)}`;
          break;
      }
    }

    const bytes = bytesHex(startPc, len);
    console.log(`  ${hex(startPc)}: ${bytes.padEnd(20)} ${mnemonic}`);
    pc = startPc + len;
  }
}

// --- Section 4: _GetCSC data flow mapping ---

function mapGetCSCDataFlow() {
  console.log('\n' + '='.repeat(72));
  console.log('SECTION 4: _GetCSC data flow (scanner -> 0xD00587 -> _GetCSC)');
  console.log('='.repeat(72));

  // _GetCSC entry at 0x03FA09
  const getCSCAddr = 0x03FA09;
  console.log(`\n  _GetCSC entry point: ${hex(getCSCAddr)}`);
  console.log(`  Bytes at _GetCSC: ${bytesHex(getCSCAddr, 32)}`);
  console.log('');

  // Decode first ~40 bytes of _GetCSC
  console.log('  _GetCSC disassembly (first 40 bytes):');
  let pc = getCSCAddr;
  const endDecode = getCSCAddr + 40;
  while (pc < endDecode) {
    const byte0 = rom[pc];
    let mnemonic = '';
    let len = 1;

    if (byte0 === 0x21) {
      const imm = read24LE(pc + 1);
      mnemonic = `LD HL, ${hex(imm)}`;
      len = 4;
    } else if (byte0 === 0x2A) {
      const addr = read24LE(pc + 1);
      mnemonic = `LD HL, (${hex(addr)})`;
      len = 4;
    } else if (byte0 === 0x3A) {
      const addr = read24LE(pc + 1);
      mnemonic = `LD A, (${hex(addr)})`;
      len = 4;
    } else if (byte0 === 0x32) {
      const addr = read24LE(pc + 1);
      mnemonic = `LD (${hex(addr)}), A`;
      len = 4;
    } else if (byte0 === 0x7E) {
      mnemonic = 'LD A, (HL)';
    } else if (byte0 === 0x36) {
      mnemonic = `LD (HL), ${hex(rom[pc + 1], 2)}`;
      len = 2;
    } else if (byte0 === 0xCD) {
      const addr = read24LE(pc + 1);
      mnemonic = `CALL ${hex(addr)}`;
      len = 4;
    } else if (byte0 === 0xC3) {
      const addr = read24LE(pc + 1);
      mnemonic = `JP ${hex(addr)}`;
      len = 4;
    } else if (byte0 === 0xC9) {
      mnemonic = 'RET';
    } else if (byte0 === 0xAF) {
      mnemonic = 'XOR A';
    } else if (byte0 === 0xB7) {
      mnemonic = 'OR A';
    } else if (byte0 === 0xA7) {
      mnemonic = 'AND A';
    } else if (byte0 === 0xFE) {
      mnemonic = `CP ${hex(rom[pc + 1], 2)}`;
      len = 2;
    } else if (byte0 === 0xF5) {
      mnemonic = 'PUSH AF';
    } else if (byte0 === 0xF1) {
      mnemonic = 'POP AF';
    } else if (byte0 === 0xE5) {
      mnemonic = 'PUSH HL';
    } else if (byte0 === 0xE1) {
      mnemonic = 'POP HL';
    } else if (byte0 === 0xC5) {
      mnemonic = 'PUSH BC';
    } else if (byte0 === 0xC1) {
      mnemonic = 'POP BC';
    } else if (byte0 === 0xD5) {
      mnemonic = 'PUSH DE';
    } else if (byte0 === 0xD1) {
      mnemonic = 'POP DE';
    } else if (byte0 === 0x20) {
      const offset = rom[pc + 1];
      const signed = offset > 127 ? offset - 256 : offset;
      mnemonic = `JR NZ, ${hex(pc + 2 + signed)}`;
      len = 2;
    } else if (byte0 === 0x28) {
      const offset = rom[pc + 1];
      const signed = offset > 127 ? offset - 256 : offset;
      mnemonic = `JR Z, ${hex(pc + 2 + signed)}`;
      len = 2;
    } else if (byte0 === 0xCB) {
      const byte1 = rom[pc + 1];
      const bit = (byte1 >> 3) & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const reg = byte1 & 7;
      if ((byte1 & 0xC0) === 0x40) {
        mnemonic = `BIT ${bit}, ${regNames[reg]}`;
      } else {
        mnemonic = `CB ${hexByte(byte1)}`;
      }
      len = 2;
    } else if (byte0 === 0x18) {
      const offset = rom[pc + 1];
      const signed = offset > 127 ? offset - 256 : offset;
      mnemonic = `JR ${hex(pc + 2 + signed)}`;
      len = 2;
    } else if (byte0 === 0xC0) {
      mnemonic = 'RET NZ';
    } else if (byte0 === 0xC8) {
      mnemonic = 'RET Z';
    } else if (byte0 === 0x77) {
      mnemonic = 'LD (HL), A';
    } else if (byte0 === 0x23) {
      mnemonic = 'INC HL';
    } else if (byte0 === 0x2B) {
      mnemonic = 'DEC HL';
    } else {
      mnemonic = `db ${hex(byte0, 2)}`;
    }

    console.log(`    ${hex(pc)}: ${bytesHex(pc, len).padEnd(16)} ${mnemonic}`);
    pc += len;
    if (mnemonic === 'RET' || mnemonic.startsWith('JP ')) break;
  }

  // Search for references to 0xD00587 in ROM
  console.log('\n  References to scan code buffer 0xD00587 in ROM:');
  const target = [0x87, 0x05, 0xD0];
  let refCount = 0;
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i] === target[0] && rom[i + 1] === target[1] && rom[i + 2] === target[2]) {
      const prevByte = i > 0 ? rom[i - 1] : 0;
      let context = '';
      if (prevByte === 0x21) context = 'LD HL, 0xD00587';
      else if (prevByte === 0x3A) context = 'LD A, (0xD00587)';
      else if (prevByte === 0x32) context = 'LD (0xD00587), A';
      else if (prevByte === 0x2A) context = 'LD HL, (0xD00587)';
      else if (prevByte === 0x22) context = 'LD (0xD00587), HL';
      else context = `preceded by ${hex(prevByte, 2)}`;

      console.log(`    ${hex(i - 1)}: ${context}  [${bytesHex(Math.max(0, i - 4), 10)}]`);
      refCount++;
    }
  }
  console.log(`\n  Total references to 0xD00587: ${refCount}`);
}

// --- Section 5: Search for callers of the function containing 0x015980 ---

function scanForFunctionCallers() {
  console.log('\n' + '='.repeat(72));
  console.log('SECTION 5: Callers of function containing 0x015980');
  console.log('  Searching for CALL/JP to range 0x015940-0x015990');
  console.log('='.repeat(72));

  const callOpcodes = new Set([
    0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
  ]);
  const jpOpcodes = new Set([
    0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA,
  ]);
  const condCodes = {
    0xCD: '', 0xC3: '',
    0xC4: ' NZ,', 0xC2: ' NZ,', 0xCC: ' Z,', 0xCA: ' Z,',
    0xD4: ' NC,', 0xD2: ' NC,', 0xDC: ' C,', 0xDA: ' C,',
    0xE4: ' PO,', 0xE2: ' PO,', 0xEC: ' PE,', 0xEA: ' PE,',
    0xF4: ' P,', 0xF2: ' P,', 0xFC: ' M,', 0xFA: ' M,',
  };

  // Search range 0x015940-0x015990
  const results = [];
  for (let i = 0; i < ROM_SIZE - 4; i++) {
    const opcode = rom[i];
    const isCall = callOpcodes.has(opcode);
    const isJp = jpOpcodes.has(opcode);
    if (!isCall && !isJp) continue;

    const target = read24LE(i + 1);
    if (target >= 0x015940 && target < 0x015990) {
      const mnemonic = isCall ? 'CALL' : 'JP';
      const cond = condCodes[opcode] || '';
      results.push({ addr: i, target, text: `${mnemonic}${cond} ${hex(target)}` });
    }
  }

  console.log(`\n  Found ${results.length} CALL/JP to range 0x015940-0x015990:\n`);
  for (const r of results) {
    console.log(`  ${hex(r.addr)}: ${r.text}`);
    console.log(`    bytes: ${bytesHex(r.addr, 4)}`);
    console.log(`    context: ${bytesHex(Math.max(0, r.addr - 8), 20)}`);
    console.log('');
  }

  // Extend search to 0x015900-0x015940
  console.log('  Extending search: CALL/JP to 0x015900-0x015940:\n');
  const results2 = [];
  for (let i = 0; i < ROM_SIZE - 4; i++) {
    const opcode = rom[i];
    const isCall = callOpcodes.has(opcode);
    const isJp = jpOpcodes.has(opcode);
    if (!isCall && !isJp) continue;

    const target = read24LE(i + 1);
    if (target >= 0x015900 && target < 0x015940) {
      const mnemonic = isCall ? 'CALL' : 'JP';
      const cond = condCodes[opcode] || '';
      results2.push({ addr: i, target, text: `${mnemonic}${cond} ${hex(target)}` });
    }
  }

  console.log(`  Found ${results2.length} CALL/JP to range 0x015900-0x015940:\n`);
  for (const r of results2) {
    console.log(`  ${hex(r.addr)}: ${r.text}`);
    console.log(`    bytes: ${bytesHex(r.addr, 4)}`);
    console.log(`    context: ${bytesHex(Math.max(0, r.addr - 8), 20)}`);
    console.log('');
  }
}

// --- Section 6: Decode 0x000D7E (code-copy framework) ---

function decodeCopyFramework() {
  console.log('='.repeat(72));
  console.log('SECTION 6: Decode code-copy framework at 0x000D7E');
  console.log('='.repeat(72));
  console.log('');

  const START = 0x000D7E;
  const END = 0x000DC0;
  let pc = START;

  while (pc < END) {
    const startPc = pc;
    const byte0 = rom[pc];
    let mnemonic = '';
    let len = 1;

    if (byte0 === 0xDD) {
      const byte1 = rom[pc + 1];
      if (byte1 === 0x21) {
        const imm = read24LE(pc + 2);
        mnemonic = `LD IX, ${hex(imm)}`;
        len = 5;
      } else if (byte1 === 0xE9) {
        mnemonic = 'JP (IX)';
        len = 2;
      } else if (byte1 === 0x7E) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD A, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0x6E) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD L, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0x66) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD H, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0x46) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD B, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0x4E) {
        const disp = rom[pc + 2];
        const signed = disp > 127 ? disp - 256 : disp;
        mnemonic = `LD C, (IX${signed >= 0 ? '+' : ''}${signed})`;
        len = 3;
      } else if (byte1 === 0xE5) {
        mnemonic = 'PUSH IX';
        len = 2;
      } else if (byte1 === 0xE1) {
        mnemonic = 'POP IX';
        len = 2;
      } else {
        mnemonic = `DD ${hexByte(byte1)}`;
        len = 2;
      }
    } else if (byte0 === 0xED) {
      const byte1 = rom[pc + 1];
      if (byte1 === 0xB0) {
        mnemonic = 'LDIR';
        len = 2;
      } else if (byte1 === 0xB8) {
        mnemonic = 'LDDR';
        len = 2;
      } else if (byte1 === 0x4B) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD BC, (${hex(addr)})`;
        len = 5;
      } else if (byte1 === 0x5B) {
        const addr = read24LE(pc + 2);
        mnemonic = `LD DE, (${hex(addr)})`;
        len = 5;
      } else {
        mnemonic = `ED ${hexByte(byte1)}`;
        len = 2;
      }
    } else {
      switch (byte0) {
        case 0x21: { const imm = read24LE(pc + 1); mnemonic = `LD HL, ${hex(imm)}`; len = 4; break; }
        case 0x11: { const imm = read24LE(pc + 1); mnemonic = `LD DE, ${hex(imm)}`; len = 4; break; }
        case 0x01: { const imm = read24LE(pc + 1); mnemonic = `LD BC, ${hex(imm)}`; len = 4; break; }
        case 0xCD: { const addr = read24LE(pc + 1); mnemonic = `CALL ${hex(addr)}`; len = 4; break; }
        case 0xC3: { const addr = read24LE(pc + 1); mnemonic = `JP ${hex(addr)}`; len = 4; break; }
        case 0xC9: mnemonic = 'RET'; break;
        case 0xF5: mnemonic = 'PUSH AF'; break;
        case 0xF1: mnemonic = 'POP AF'; break;
        case 0xE5: mnemonic = 'PUSH HL'; break;
        case 0xE1: mnemonic = 'POP HL'; break;
        case 0xC5: mnemonic = 'PUSH BC'; break;
        case 0xC1: mnemonic = 'POP BC'; break;
        case 0xD5: mnemonic = 'PUSH DE'; break;
        case 0xD1: mnemonic = 'POP DE'; break;
        case 0x3A: { const addr = read24LE(pc + 1); mnemonic = `LD A, (${hex(addr)})`; len = 4; break; }
        case 0x32: { const addr = read24LE(pc + 1); mnemonic = `LD (${hex(addr)}), A`; len = 4; break; }
        case 0xCB: {
          const byte1 = rom[pc + 1];
          const bit = (byte1 >> 3) & 7;
          const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
          const reg = byte1 & 7;
          if ((byte1 & 0xC0) === 0x40) mnemonic = `BIT ${bit}, ${regNames[reg]}`;
          else mnemonic = `CB ${hexByte(byte1)}`;
          len = 2;
          break;
        }
        case 0x20: {
          const offset = rom[pc + 1]; const signed = offset > 127 ? offset - 256 : offset;
          mnemonic = `JR NZ, ${hex(pc + 2 + signed)}`;
          len = 2; break;
        }
        case 0x28: {
          const offset = rom[pc + 1]; const signed = offset > 127 ? offset - 256 : offset;
          mnemonic = `JR Z, ${hex(pc + 2 + signed)}`;
          len = 2; break;
        }
        case 0x18: {
          const offset = rom[pc + 1]; const signed = offset > 127 ? offset - 256 : offset;
          mnemonic = `JR ${hex(pc + 2 + signed)}`;
          len = 2; break;
        }
        case 0xAF: mnemonic = 'XOR A'; break;
        case 0xF3: mnemonic = 'DI'; break;
        case 0xFB: mnemonic = 'EI'; break;
        case 0x7E: mnemonic = 'LD A, (HL)'; break;
        case 0x77: mnemonic = 'LD (HL), A'; break;
        case 0x23: mnemonic = 'INC HL'; break;
        case 0x2B: mnemonic = 'DEC HL'; break;
        case 0x09: mnemonic = 'ADD HL, BC'; break;
        case 0x19: mnemonic = 'ADD HL, DE'; break;
        case 0xEB: mnemonic = 'EX DE, HL'; break;
        case 0xE9: mnemonic = 'JP (HL)'; break;
        default:
          mnemonic = `db ${hex(byte0, 2)}`;
          break;
      }
    }

    const bytes = bytesHex(startPc, len);
    console.log(`  ${hex(startPc)}: ${bytes.padEnd(20)} ${mnemonic}`);
    pc = startPc + len;
    if (mnemonic === 'RET' || mnemonic === 'JP (IX)') break;
  }

  // Also decode 0x000DB6 (conditional-EI-then-RET)
  console.log(`\n  --- 0x000DB6 (conditional-EI-then-RET, scanner exit) ---\n`);
  let pc2 = 0x000DB6;
  const end2 = 0x000DD0;
  while (pc2 < end2) {
    const startPc = pc2;
    const byte0 = rom[pc2];
    let mnemonic = '';
    let len = 1;

    switch (byte0) {
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      case 0x3A: { const addr = read24LE(pc2 + 1); mnemonic = `LD A, (${hex(addr)})`; len = 4; break; }
      case 0xCB: {
        const byte1 = rom[pc2 + 1];
        const bit = (byte1 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const reg = byte1 & 7;
        if ((byte1 & 0xC0) === 0x40) mnemonic = `BIT ${bit}, ${regNames[reg]}`;
        else mnemonic = `CB ${hexByte(byte1)}`;
        len = 2; break;
      }
      case 0x20: {
        const offset = rom[pc2 + 1]; const signed = offset > 127 ? offset - 256 : offset;
        mnemonic = `JR NZ, ${hex(pc2 + 2 + signed)}`;
        len = 2; break;
      }
      case 0x28: {
        const offset = rom[pc2 + 1]; const signed = offset > 127 ? offset - 256 : offset;
        mnemonic = `JR Z, ${hex(pc2 + 2 + signed)}`;
        len = 2; break;
      }
      case 0xFB: mnemonic = 'EI'; break;
      case 0xC9: mnemonic = 'RET'; break;
      default: mnemonic = `db ${hex(byte0, 2)}`; break;
    }

    const bytes = bytesHex(startPc, len);
    console.log(`  ${hex(startPc)}: ${bytes.padEnd(20)} ${mnemonic}`);
    pc2 = startPc + len;
    if (mnemonic === 'RET') break;
  }
}

// --- Summary ---

function printSummary() {
  console.log('\n' + '='.repeat(72));
  console.log('SUMMARY: Keyboard scanner invocation chain');
  console.log('='.repeat(72));
  console.log(`
  The primary keyboard scanner at 0x0159C0 is never called directly.
  Instead, the invocation chain is:

    1. Some caller CALLs/JPs to the function around 0x015960-0x01598B
    2. That function does:
       - 0x01598B: LD IX, 0x0159BD   (load parameter block address)
       - 0x015990: CALL 0x000D7E     (invoke code-copy framework)
    3. 0x000D7E reads the param block at 0x0159BD:
       - Bytes 0-1: length = 0x011A (282 bytes)
       - Bytes 2+:  source code at 0x0159BF
       - Copies 282 bytes from ROM 0x0159BF to RAM (~0xD18B62)
       - Executes via JP (IX) -> runs scanner from RAM
    4. The scanner at 0x0159C0 (now in RAM):
       - Reads keyboard matrix via memory-mapped I/O at 0xE00900
       - Writes scan code to 0xD00587
       - Ends with JP 0x000DB6 (conditional EI + RET)
    5. _GetCSC at 0x03FA09 reads scan code from 0xD00587

  Data flow: HW matrix -> scanner -> RAM 0xD00587 -> _GetCSC -> application
`);
}

// --- Main ---

console.log('probe-phase299-getCSC-callers.mjs');
console.log('Tracing caller chain for primary keyboard scanner 0x0159C0\n');

scanForParamBlockRefs();
scanForCopyCalls();
decodeCopyFramework();
decodeCallerChain();
mapGetCSCDataFlow();
scanForFunctionCallers();
printSummary();
