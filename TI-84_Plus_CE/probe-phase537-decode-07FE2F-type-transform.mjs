// Phase 537: Decode 0x07FE2F - type transform called from 0x07FE24
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const startAddr = 0x07FE2F;
const bytes = rom.slice(startAddr, startAddr + 80);

const hex2 = n => n.toString(16).padStart(2, '0').toUpperCase();
const hex6 = n => n.toString(16).padStart(6, '0').toUpperCase();
const signed = n => (n & 0x80 ? n - 0x100 : n);
const nn24 = i => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
const instrBytes = (off, len) =>
  Array.from(bytes.slice(off, off + len), hex2).join(' ').padEnd(14, ' ');

function decodeOne(off) {
  const addr = startAddr + off;
  const op = bytes[off];
  const next = bytes[off + 1];

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,0x${hex6(nn24(off + 1))}` };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,0x${hex2(next)}` };
    case 0x0B: return { len: 1, text: 'DEC BC' };
    case 0x0C: return { len: 1, text: 'INC C' };
    case 0x0D: return { len: 1, text: 'DEC C' };
    case 0x0E: return { len: 2, text: `LD C,0x${hex2(next)}` };
    case 0x11: return { len: 4, text: `LD DE,0x${hex6(nn24(off + 1))}` };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x16: return { len: 2, text: `LD D,0x${hex2(next)}` };
    case 0x18: {
      const target = addr + 2 + signed(next);
      return { len: 2, text: `JR 0x${hex6(target)}`, exits: true };
    }
    case 0x1A: return { len: 1, text: 'LD A,(DE)' };
    case 0x1B: return { len: 1, text: 'DEC DE' };
    case 0x1C: return { len: 1, text: 'INC E' };
    case 0x1D: return { len: 1, text: 'DEC E' };
    case 0x1E: return { len: 2, text: `LD E,0x${hex2(next)}` };
    case 0x20: {
      const target = addr + 2 + signed(next);
      return { len: 2, text: `JR NZ,0x${hex6(target)}` };
    }
    case 0x21: return { len: 4, text: `LD HL,0x${hex6(nn24(off + 1))}` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x26: return { len: 2, text: `LD H,0x${hex2(next)}` };
    case 0x28: {
      const target = addr + 2 + signed(next);
      return { len: 2, text: `JR Z,0x${hex6(target)}` };
    }
    case 0x2B: return { len: 1, text: 'DEC HL' };
    case 0x2C: return { len: 1, text: 'INC L' };
    case 0x2D: return { len: 1, text: 'DEC L' };
    case 0x2E: return { len: 2, text: `LD L,0x${hex2(next)}` };
    case 0x30: {
      const target = addr + 2 + signed(next);
      return { len: 2, text: `JR NC,0x${hex6(target)}` };
    }
    case 0x32: return { len: 4, text: `LD (0x${hex6(nn24(off + 1))}),A` };
    case 0x36: return { len: 2, text: `LD (HL),0x${hex2(next)}` };
    case 0x38: {
      const target = addr + 2 + signed(next);
      return { len: 2, text: `JR C,0x${hex6(target)}` };
    }
    case 0x3A: return { len: 4, text: `LD A,(0x${hex6(nn24(off + 1))})` };
    case 0x3C: return { len: 1, text: 'INC A' };
    case 0x3D: return { len: 1, text: 'DEC A' };
    case 0x3E: return { len: 2, text: `LD A,0x${hex2(next)}` };
    case 0x47: return { len: 1, text: 'LD B,A' };
    case 0x4F: return { len: 1, text: 'LD C,A' };
    case 0x57: return { len: 1, text: 'LD D,A' };
    case 0x5F: return { len: 1, text: 'LD E,A' };
    case 0x67: return { len: 1, text: 'LD H,A' };
    case 0x6F: return { len: 1, text: 'LD L,A' };
    case 0x77: return { len: 1, text: 'LD (HL),A' };
    case 0x78: return { len: 1, text: 'LD A,B' };
    case 0x79: return { len: 1, text: 'LD A,C' };
    case 0x7A: return { len: 1, text: 'LD A,D' };
    case 0x7B: return { len: 1, text: 'LD A,E' };
    case 0x7C: return { len: 1, text: 'LD A,H' };
    case 0x7D: return { len: 1, text: 'LD A,L' };
    case 0x7E: return { len: 1, text: 'LD A,(HL)' };
    case 0x80: return { len: 1, text: 'ADD A,B' };
    case 0x81: return { len: 1, text: 'ADD A,C' };
    case 0x82: return { len: 1, text: 'ADD A,D' };
    case 0x83: return { len: 1, text: 'ADD A,E' };
    case 0x87: return { len: 1, text: 'ADD A,A' };
    case 0x90: return { len: 1, text: 'SUB B' };
    case 0x91: return { len: 1, text: 'SUB C' };
    case 0x92: return { len: 1, text: 'SUB D' };
    case 0x93: return { len: 1, text: 'SUB E' };
    case 0x97: return { len: 1, text: 'SUB A' };
    case 0xA0: return { len: 1, text: 'AND B' };
    case 0xA1: return { len: 1, text: 'AND C' };
    case 0xA7: return { len: 1, text: 'AND A' };
    case 0xA8: return { len: 1, text: 'XOR B' };
    case 0xA9: return { len: 1, text: 'XOR C' };
    case 0xAF: return { len: 1, text: 'XOR A' };
    case 0xB0: return { len: 1, text: 'OR B' };
    case 0xB1: return { len: 1, text: 'OR C' };
    case 0xB7: return { len: 1, text: 'OR A' };
    case 0xC0: return { len: 1, text: 'RET NZ', exits: true };
    case 0xC2: return { len: 4, text: `JP NZ,0x${hex6(nn24(off + 1))}` };
    case 0xC3: return { len: 4, text: `JP 0x${hex6(nn24(off + 1))}`, exits: true };
    case 0xC4: return { len: 4, text: `CALL NZ,0x${hex6(nn24(off + 1))}`, call: nn24(off + 1) };
    case 0xC6: return { len: 2, text: `ADD A,0x${hex2(next)}` };
    case 0xC8: return { len: 1, text: 'RET Z', exits: true };
    case 0xC9: return { len: 1, text: 'RET', exits: true };
    case 0xCA: return { len: 4, text: `JP Z,0x${hex6(nn24(off + 1))}` };
    case 0xCC: return { len: 4, text: `CALL Z,0x${hex6(nn24(off + 1))}`, call: nn24(off + 1) };
    case 0xCD: return { len: 4, text: `CALL 0x${hex6(nn24(off + 1))}`, call: nn24(off + 1) };
    case 0xD0: return { len: 1, text: 'RET NC', exits: true };
    case 0xD2: return { len: 4, text: `JP NC,0x${hex6(nn24(off + 1))}` };
    case 0xD4: return { len: 4, text: `CALL NC,0x${hex6(nn24(off + 1))}`, call: nn24(off + 1) };
    case 0xD6: return { len: 2, text: `SUB 0x${hex2(next)}` };
    case 0xD8: return { len: 1, text: 'RET C', exits: true };
    case 0xDA: return { len: 4, text: `JP C,0x${hex6(nn24(off + 1))}` };
    case 0xDC: return { len: 4, text: `CALL C,0x${hex6(nn24(off + 1))}`, call: nn24(off + 1) };
    case 0xE6: return { len: 2, text: `AND 0x${hex2(next)}` };
    case 0xEE: return { len: 2, text: `XOR 0x${hex2(next)}` };
    case 0xF6: return { len: 2, text: `OR 0x${hex2(next)}` };
    case 0xFE: return { len: 2, text: `CP 0x${hex2(next)}` };
    default: return { len: 1, text: `DB 0x${hex2(op)} ; unknown in this probe decoder` };
  }
}

console.log('=== Raw bytes at 0x07FE2F ===');
for (let i = 0; i < bytes.length; i += 16) {
  const addr = startAddr + i;
  const hex = Array.from(bytes.slice(i, i + 16), b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hex}`);
}

console.log('\n=== Decoded instructions ===');
const decoded = [];
const calls = new Set();
let off = 0;
let boundary = null;
while (off < bytes.length) {
  const ins = decodeOne(off);
  decoded.push({ off, ...ins });
  console.log(`${hex6(startAddr + off)}: ${instrBytes(off, ins.len)} ${ins.text}`);
  if (ins.call !== undefined) calls.add(ins.call);
  off += ins.len;
  if (ins.exits) {
    boundary = startAddr + off;
    break;
  }
}

console.log('\n=== Analysis ===');
console.log(`Function entry: 0x${hex6(startAddr)}`);
console.log(boundary
  ? `First apparent boundary after exit instruction: 0x${hex6(boundary)} (${boundary - startAddr} bytes)`
  : `No unconditional boundary found in the first ${bytes.length} bytes.`);
console.log(calls.size
  ? `CALL targets: ${Array.from(calls, a => `0x${hex6(a)}`).join(', ')}`
  : 'CALL targets: none found before the apparent boundary.');
console.log('A is the input and output type byte. Read the decoded CP/AND/OR/XOR/ADD/SUB/LD A instructions above as the transform logic;');
console.log('relative branches are printed with resolved 24-bit ROM addresses, and LD/CALL/JP absolute operands are decoded as 3-byte ADL addresses.');
