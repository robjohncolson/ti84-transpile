// Phase 537: Decode 0x07FEF5 - "valid type" path after 0x07FEE1
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const startAddr = 0x07FEF5;
const bytes = rom.slice(startAddr, startAddr + 40);

console.log('=== Raw bytes at 0x07FEF5 ===');
for (let i = 0; i < bytes.length; i += 16) {
  const addr = startAddr + i;
  const hex = Array.from(bytes.slice(i, i + 16), b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hex}`);
}

const hex8 = value => value.toString(16).padStart(2, '0').toUpperCase();
const hex24 = value => value.toString(16).padStart(6, '0').toUpperCase();
const rel8 = value => (value & 0x80) ? value - 0x100 : value;

function imm16(offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function imm24(offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function decodeAt(pc) {
  const i = pc - startAddr;
  const op = bytes[i];

  switch (op) {
    case 0x00: return { size: 1, text: 'NOP' };
    case 0x04: return { size: 1, text: 'INC B' };
    case 0x05: return { size: 1, text: 'DEC B' };
    case 0x06: return { size: 2, text: `LD B,0x${hex8(bytes[i + 1])}` };
    case 0x0C: return { size: 1, text: 'INC C' };
    case 0x0D: return { size: 1, text: 'DEC C' };
    case 0x0E: return { size: 2, text: `LD C,0x${hex8(bytes[i + 1])}` };
    case 0x10: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `DJNZ 0x${hex24(target)}` };
    }
    case 0x11: return { size: 4, text: `LD DE,0x${hex24(imm24(i + 1))}` };
    case 0x13: return { size: 1, text: 'INC DE' };
    case 0x18: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `JR 0x${hex24(target)}` };
    }
    case 0x19: return { size: 1, text: 'ADD HL,DE' };
    case 0x1A: return { size: 1, text: 'LD A,(DE)' };
    case 0x20: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `JR NZ,0x${hex24(target)}` };
    }
    case 0x21: return { size: 4, text: `LD HL,0x${hex24(imm24(i + 1))}` };
    case 0x23: return { size: 1, text: 'INC HL' };
    case 0x28: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `JR Z,0x${hex24(target)}` };
    }
    case 0x2A: return { size: 4, text: `LD HL,(0x${hex24(imm24(i + 1))})` };
    case 0x30: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `JR NC,0x${hex24(target)}` };
    }
    case 0x31: return { size: 4, text: `LD SP,0x${hex24(imm24(i + 1))}` };
    case 0x32: return { size: 4, text: `LD (0x${hex24(imm24(i + 1))}),A` };
    case 0x37: return { size: 1, text: 'SCF' };
    case 0x38: {
      const target = pc + 2 + rel8(bytes[i + 1]);
      return { size: 2, text: `JR C,0x${hex24(target)}` };
    }
    case 0x3A: return { size: 4, text: `LD A,(0x${hex24(imm24(i + 1))})` };
    case 0x3E: return { size: 2, text: `LD A,0x${hex8(bytes[i + 1])}` };
    case 0x77: return { size: 1, text: 'LD (HL),A' };
    case 0x7E: return { size: 1, text: 'LD A,(HL)' };
    case 0xA6: return { size: 1, text: 'AND (HL)' };
    case 0xAE: return { size: 1, text: 'XOR (HL)' };
    case 0xAF: return { size: 1, text: 'XOR A' };
    case 0xB6: return { size: 1, text: 'OR (HL)' };
    case 0xC0: return { size: 1, text: 'RET NZ', terminal: true };
    case 0xC2: return { size: 4, text: `JP NZ,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xC3: return { size: 4, text: `JP 0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xC8: return { size: 1, text: 'RET Z', terminal: true };
    case 0xC9: return { size: 1, text: 'RET', terminal: true };
    case 0xCA: return { size: 4, text: `JP Z,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xCD: return { size: 4, text: `CALL 0x${hex24(imm24(i + 1))}` };
    case 0xD0: return { size: 1, text: 'RET NC', terminal: true };
    case 0xD2: return { size: 4, text: `JP NC,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xD8: return { size: 1, text: 'RET C', terminal: true };
    case 0xDA: return { size: 4, text: `JP C,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xE0: return { size: 1, text: 'RET PO', terminal: true };
    case 0xE2: return { size: 4, text: `JP PO,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xE6: return { size: 2, text: `AND 0x${hex8(bytes[i + 1])}` };
    case 0xE8: return { size: 1, text: 'RET PE', terminal: true };
    case 0xEA: return { size: 4, text: `JP PE,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xEE: return { size: 2, text: `XOR 0x${hex8(bytes[i + 1])}` };
    case 0xF0: return { size: 1, text: 'RET P', terminal: true };
    case 0xF2: return { size: 4, text: `JP P,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xF6: return { size: 2, text: `OR 0x${hex8(bytes[i + 1])}` };
    case 0xF8: return { size: 1, text: 'RET M', terminal: true };
    case 0xFA: return { size: 4, text: `JP M,0x${hex24(imm24(i + 1))}`, terminal: true };
    case 0xFE: return { size: 2, text: `CP 0x${hex8(bytes[i + 1])}` };
    default:
      return { size: 1, text: `DB 0x${hex8(op)}` };
  }
}

console.log('\n=== Decoded instructions ===');
let pc = startAddr;
let firstTerminal = null;
while (pc < startAddr + bytes.length) {
  if (pc === 0x07FEFC) {
    console.log('  -- 0x07FEFC sub-transform entry --');
  }

  const decoded = decodeAt(pc);
  const raw = Array.from(bytes.slice(pc - startAddr, pc - startAddr + decoded.size), hex8).join(' ');
  console.log(`  ${hex24(pc)}: ${raw.padEnd(11, ' ')} ${decoded.text}`);

  pc += decoded.size;
  if (!firstTerminal && decoded.terminal) {
    firstTerminal = pc;
  }
}

const firstSeven = Array.from(bytes.slice(0, 7), hex8).join(' ');
const standalone = firstTerminal !== null && firstTerminal <= 0x07FEFC;

console.log('\n=== Analysis ===');
console.log(`0x07FEF5 raw 7-byte window before 0x07FEFC: ${firstSeven}`);
console.log(`0x07FEFC is the next known entry point, so 0x07FEF5 has at most 7 bytes before that boundary.`);
if (standalone) {
  console.log(`0x07FEF5 terminates before 0x07FEFC at 0x${hex24(firstTerminal)}; it is a standalone continuation.`);
  console.log('The valid-type path does the decoded operation(s) above and returns/jumps without executing the merge helper at 0x07FEFC.');
} else {
  console.log('No unconditional terminator was decoded before 0x07FEFC; 0x07FEF5 falls through into the sub-transform at 0x07FEFC.');
  console.log('The valid-type path therefore skips the caller-side XOR A / CALL / OR (HL) merge setup, then enters the shared transform body directly.');
}
console.log('All absolute immediates decoded by this probe use eZ80 ADL 3-byte addresses.');
