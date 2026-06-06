#!/usr/bin/env node
/**
 * probe-phase539-decode-07F7BD.mjs
 * Decode the utility at 0x07F7BD — suspected "load OP1 type into A" function.
 * Hex-dump and disassemble ROM bytes from 0x07F7BD through 0x07F7E0.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const romPath = join(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

const START = 0x07F7BD;
const END   = 0x07F7E0;  // inclusive

// --- Hex dump ---
console.log(`=== Hex dump: 0x${START.toString(16).toUpperCase()} - 0x${END.toString(16).toUpperCase()} ===`);
for (let addr = START; addr <= END; addr += 16) {
  const lineEnd = Math.min(addr + 15, END);
  let hexPart = '';
  let asciiPart = '';
  for (let a = addr; a <= lineEnd; a++) {
    const b = rom[a];
    hexPart += b.toString(16).padStart(2, '0').toUpperCase() + ' ';
    asciiPart += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}:  ${hexPart.padEnd(48)} ${asciiPart}`);
}

// --- Disassembly ---
console.log(`\n=== Disassembly: 0x${START.toString(16).toUpperCase()} - 0x${END.toString(16).toUpperCase()} ===`);

let pc = START;
function readByte() { return rom[pc++]; }
function readAddr24() {
  const lo = readByte();
  const mid = readByte();
  const hi = readByte();
  return (hi << 16) | (mid << 8) | lo;
}
function fmtAddr(a) { return '0x' + a.toString(16).padStart(6, '0').toUpperCase(); }
function fmtHex(b) { return '0x' + b.toString(16).padStart(2, '0').toUpperCase(); }

while (pc <= END) {
  const instrStart = pc;
  const op = readByte();
  let mnemonic = '';
  let comment = '';

  switch (op) {
    case 0x00: mnemonic = 'NOP'; break;
    case 0x3A: {
      const addr = readAddr24();
      mnemonic = `LD A,(${fmtAddr(addr)})`;
      comment = `; load byte from ${fmtAddr(addr)} into A`;
      break;
    }
    case 0x32: {
      const addr = readAddr24();
      mnemonic = `LD (${fmtAddr(addr)}),A`;
      comment = `; store A to ${fmtAddr(addr)}`;
      break;
    }
    case 0x21: {
      const addr = readAddr24();
      mnemonic = `LD HL,${fmtAddr(addr)}`;
      comment = `; HL = ${fmtAddr(addr)}`;
      break;
    }
    case 0x2A: {
      const addr = readAddr24();
      mnemonic = `LD HL,(${fmtAddr(addr)})`;
      comment = `; HL = contents of ${fmtAddr(addr)}`;
      break;
    }
    case 0x7E: mnemonic = 'LD A,(HL)'; comment = '; A = byte at (HL)'; break;
    case 0x77: mnemonic = 'LD (HL),A'; comment = '; store A at (HL)'; break;
    case 0xE6: {
      const imm = readByte();
      mnemonic = `AND ${fmtHex(imm)}`;
      comment = `; A &= ${fmtHex(imm)}, mask to type bits`;
      break;
    }
    case 0xF6: {
      const imm = readByte();
      mnemonic = `OR ${fmtHex(imm)}`;
      comment = `; A |= ${fmtHex(imm)}`;
      break;
    }
    case 0xFE: {
      const imm = readByte();
      mnemonic = `CP ${fmtHex(imm)}`;
      comment = `; compare A with ${fmtHex(imm)}`;
      break;
    }
    case 0xB7: mnemonic = 'OR A'; comment = '; set flags from A (Z if A==0)'; break;
    case 0xAF: mnemonic = 'XOR A'; comment = '; A = 0, Z=1'; break;
    case 0xC9: mnemonic = 'RET'; break;
    case 0xC0: mnemonic = 'RET NZ'; break;
    case 0xC8: mnemonic = 'RET Z'; break;
    case 0xD0: mnemonic = 'RET NC'; break;
    case 0xD8: mnemonic = 'RET C'; break;
    case 0xCD: {
      const addr = readAddr24();
      mnemonic = `CALL ${fmtAddr(addr)}`;
      comment = `; call ${fmtAddr(addr)}`;
      break;
    }
    case 0xC3: {
      const addr = readAddr24();
      mnemonic = `JP ${fmtAddr(addr)}`;
      comment = `; jump ${fmtAddr(addr)}`;
      break;
    }
    case 0x18: {
      const offset = readByte();
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + signedOff;
      mnemonic = `JR ${fmtAddr(target)}`;
      comment = `; relative jump (offset ${signedOff})`;
      break;
    }
    case 0x20: {
      const offset = readByte();
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + signedOff;
      mnemonic = `JR NZ,${fmtAddr(target)}`;
      comment = `; jump if not zero`;
      break;
    }
    case 0x28: {
      const offset = readByte();
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + signedOff;
      mnemonic = `JR Z,${fmtAddr(target)}`;
      comment = `; jump if zero`;
      break;
    }
    case 0x30: {
      const offset = readByte();
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + signedOff;
      mnemonic = `JR NC,${fmtAddr(target)}`;
      comment = `; jump if no carry`;
      break;
    }
    case 0x38: {
      const offset = readByte();
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + signedOff;
      mnemonic = `JR C,${fmtAddr(target)}`;
      comment = `; jump if carry`;
      break;
    }
    case 0xCB: {
      const cb = readByte();
      if (cb === 0x7F) { mnemonic = 'BIT 7,A'; comment = '; test sign bit of A'; }
      else if (cb === 0x77) { mnemonic = 'BIT 6,A'; comment = '; test bit 6 of A'; }
      else if (cb === 0x3F) { mnemonic = 'SRL A'; comment = '; shift A right logical'; }
      else if (cb === 0x27) { mnemonic = 'SLA A'; comment = '; shift A left arithmetic'; }
      else if ((cb & 0xC0) === 0x40) {
        const bit = (cb >> 3) & 7;
        const reg = ['B','C','D','E','H','L','(HL)','A'][cb & 7];
        mnemonic = `BIT ${bit},${reg}`;
        comment = `; test bit ${bit} of ${reg}`;
      }
      else { mnemonic = `CB prefix: ${fmtHex(cb)}`; comment = '; (CB-prefixed)'; }
      break;
    }
    case 0xED: {
      const ed = readByte();
      if (ed === 0x52) { mnemonic = 'SBC HL,DE'; comment = '; HL -= DE - carry'; }
      else { mnemonic = `ED prefix: ${fmtHex(ed)}`; comment = '; (ED-prefixed)'; }
      break;
    }
    case 0x47: mnemonic = 'LD B,A'; break;
    case 0x4F: mnemonic = 'LD C,A'; break;
    case 0x57: mnemonic = 'LD D,A'; break;
    case 0x5F: mnemonic = 'LD E,A'; break;
    case 0x67: mnemonic = 'LD H,A'; break;
    case 0x6F: mnemonic = 'LD L,A'; break;
    case 0x78: mnemonic = 'LD A,B'; break;
    case 0x79: mnemonic = 'LD A,C'; break;
    case 0x7A: mnemonic = 'LD A,D'; break;
    case 0x7B: mnemonic = 'LD A,E'; break;
    case 0x7C: mnemonic = 'LD A,H'; break;
    case 0x7D: mnemonic = 'LD A,L'; break;
    case 0xF5: mnemonic = 'PUSH AF'; break;
    case 0xC5: mnemonic = 'PUSH BC'; break;
    case 0xD5: mnemonic = 'PUSH DE'; break;
    case 0xE5: mnemonic = 'PUSH HL'; break;
    case 0xF1: mnemonic = 'POP AF'; break;
    case 0xC1: mnemonic = 'POP BC'; break;
    case 0xD1: mnemonic = 'POP DE'; break;
    case 0xE1: mnemonic = 'POP HL'; break;
    case 0x23: mnemonic = 'INC HL'; break;
    case 0x2B: mnemonic = 'DEC HL'; break;
    case 0x3C: mnemonic = 'INC A'; break;
    case 0x3D: mnemonic = 'DEC A'; break;
    case 0x36: {
      const imm = readByte();
      mnemonic = `LD (HL),${fmtHex(imm)}`;
      comment = `; store ${fmtHex(imm)} at (HL)`;
      break;
    }
    case 0x06: {
      const imm = readByte();
      mnemonic = `LD B,${fmtHex(imm)}`;
      break;
    }
    case 0x0E: {
      const imm = readByte();
      mnemonic = `LD C,${fmtHex(imm)}`;
      break;
    }
    case 0x16: {
      const imm = readByte();
      mnemonic = `LD D,${fmtHex(imm)}`;
      break;
    }
    case 0x1E: {
      const imm = readByte();
      mnemonic = `LD E,${fmtHex(imm)}`;
      break;
    }
    case 0x26: {
      const imm = readByte();
      mnemonic = `LD H,${fmtHex(imm)}`;
      break;
    }
    case 0x2E: {
      const imm = readByte();
      mnemonic = `LD L,${fmtHex(imm)}`;
      break;
    }
    case 0x3E: {
      const imm = readByte();
      mnemonic = `LD A,${fmtHex(imm)}`;
      comment = `; A = ${fmtHex(imm)}`;
      break;
    }
    case 0xEE: {
      const imm = readByte();
      mnemonic = `XOR ${fmtHex(imm)}`;
      comment = `; A ^= ${fmtHex(imm)}`;
      break;
    }
    case 0xDD: {
      const ixOp = readByte();
      if (ixOp === 0x7E) {
        const d = readByte();
        const signedD = d > 127 ? d - 256 : d;
        mnemonic = `LD A,(IX+${signedD})`;
        comment = `; A = byte at IX+${signedD}`;
      } else if (ixOp === 0x21) {
        const addr = readAddr24();
        mnemonic = `LD IX,${fmtAddr(addr)}`;
      } else {
        mnemonic = `DD prefix: ${fmtHex(ixOp)}`;
        comment = '; (IX-prefixed)';
      }
      break;
    }
    case 0xFD: {
      const iyOp = readByte();
      if (iyOp === 0x7E) {
        const d = readByte();
        const signedD = d > 127 ? d - 256 : d;
        mnemonic = `LD A,(IY+${signedD})`;
        comment = `; A = byte at IY+${signedD}`;
      } else if (iyOp === 0x21) {
        const addr = readAddr24();
        mnemonic = `LD IY,${fmtAddr(addr)}`;
      } else {
        mnemonic = `FD prefix: ${fmtHex(iyOp)}`;
        comment = '; (IY-prefixed)';
      }
      break;
    }
    case 0xE9: mnemonic = 'JP (HL)'; comment = '; jump to address in HL'; break;
    case 0xA7: mnemonic = 'AND A'; comment = '; set flags from A'; break;
    case 0xDE: {
      const imm = readByte();
      mnemonic = `SBC A,${fmtHex(imm)}`;
      comment = `; A -= ${fmtHex(imm)} - carry`;
      break;
    }
    case 0xD6: {
      const imm = readByte();
      mnemonic = `SUB ${fmtHex(imm)}`;
      comment = `; A -= ${fmtHex(imm)}`;
      break;
    }
    case 0xC6: {
      const imm = readByte();
      mnemonic = `ADD A,${fmtHex(imm)}`;
      comment = `; A += ${fmtHex(imm)}`;
      break;
    }
    default:
      mnemonic = `DB ${fmtHex(op)}`;
      comment = '; (unknown opcode)';
      break;
  }

  const instrBytes = [];
  for (let i = instrStart; i < pc; i++) {
    instrBytes.push(rom[i].toString(16).padStart(2, '0').toUpperCase());
  }
  const hexStr = instrBytes.join(' ').padEnd(16);
  console.log(`  ${fmtAddr(instrStart)}:  ${hexStr} ${mnemonic.padEnd(30)} ${comment}`);
}

// --- Analysis ---
console.log('\n=== Analysis ===');
console.log('Known callers of 0x07F7BD:');
console.log('  - 0x07FF03 (zero-type handler): CALL 0x07F7BD for low exponents (<0x1D)');
console.log('  - 0x07CA02 (OP1 sign toggle): CALL 0x07F7BD to load OP1 type');
console.log('  - 0x0686A8 (type sub-dispatch): CALL 0x07F7BD to load type');
console.log('  - 0x09953F (conditional FP validation): CALL 0x07F7BD to load type');
console.log('  - 0x07FF59: CALL 0x07F7BD; RET Z; CP 0x0E; JR Z,0x07FF77');
console.log('  - 0x08017C: CALL 0x07F7BD, JR -> 0x080177');
console.log('');
console.log('OP1 is at D005F8 in standard TI-84 CE memory layout.');
console.log('OP1 type byte is the first byte of the 11-byte OP register.');
console.log('Related: 0x07F7D6 = "type sign strip" (likely AND 0x3F on the type byte)');

process.exit(0);
