// Phase 537: Decode 0x07FEFC - sub-transform called from 0x07FEE1
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const startAddr = 0x07FEFC;
const bytes = rom.slice(startAddr, startAddr + 60);

const hex2 = n => n.toString(16).padStart(2, '0');
const hex6 = n => n.toString(16).padStart(6, '0');
const u24 = off => bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
const s8 = n => n < 0x80 ? n : n - 0x100;

console.log('=== Raw bytes at 0x07FEFC ===');
for (let i = 0; i < bytes.length; i += 16) {
  const addr = startAddr + i;
  const hex = Array.from(bytes.slice(i, i + 16), b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hex}`);
}

function decodeAt(off) {
  const addr = startAddr + off;
  const op = bytes[off];
  const op2 = bytes[off + 1];

  switch (op) {
    case 0x00: return { size: 1, text: 'NOP' };
    case 0x04: return { size: 1, text: 'INC B' };
    case 0x05: return { size: 1, text: 'DEC B' };
    case 0x06: return { size: 2, text: `LD B,$${hex2(bytes[off + 1])}` };
    case 0x0C: return { size: 1, text: 'INC C' };
    case 0x0D: return { size: 1, text: 'DEC C' };
    case 0x0E: return { size: 2, text: `LD C,$${hex2(bytes[off + 1])}` };
    case 0x14: return { size: 1, text: 'INC D' };
    case 0x15: return { size: 1, text: 'DEC D' };
    case 0x16: return { size: 2, text: `LD D,$${hex2(bytes[off + 1])}` };
    case 0x18: return { size: 2, text: `JR $${hex6(addr + 2 + s8(bytes[off + 1]))}` };
    case 0x1C: return { size: 1, text: 'INC E' };
    case 0x1D: return { size: 1, text: 'DEC E' };
    case 0x1E: return { size: 2, text: `LD E,$${hex2(bytes[off + 1])}` };
    case 0x20: return { size: 2, text: `JR NZ,$${hex6(addr + 2 + s8(bytes[off + 1]))}` };
    case 0x21: return { size: 4, text: `LD HL,$${hex6(u24(off + 1))}` };
    case 0x22: return { size: 4, text: `LD ($${hex6(u24(off + 1))}),HL` };
    case 0x23: return { size: 1, text: 'INC HL' };
    case 0x24: return { size: 1, text: 'INC H' };
    case 0x25: return { size: 1, text: 'DEC H' };
    case 0x26: return { size: 2, text: `LD H,$${hex2(bytes[off + 1])}` };
    case 0x28: return { size: 2, text: `JR Z,$${hex6(addr + 2 + s8(bytes[off + 1]))}` };
    case 0x2A: return { size: 4, text: `LD HL,($${hex6(u24(off + 1))})` };
    case 0x2B: return { size: 1, text: 'DEC HL' };
    case 0x2C: return { size: 1, text: 'INC L' };
    case 0x2D: return { size: 1, text: 'DEC L' };
    case 0x2E: return { size: 2, text: `LD L,$${hex2(bytes[off + 1])}` };
    case 0x30: return { size: 2, text: `JR NC,$${hex6(addr + 2 + s8(bytes[off + 1]))}` };
    case 0x31: return { size: 4, text: `LD SP,$${hex6(u24(off + 1))}` };
    case 0x32: return { size: 4, text: `LD ($${hex6(u24(off + 1))}),A` };
    case 0x37: return { size: 1, text: 'SCF' };
    case 0x38: return { size: 2, text: `JR C,$${hex6(addr + 2 + s8(bytes[off + 1]))}` };
    case 0x3A: return { size: 4, text: `LD A,($${hex6(u24(off + 1))})` };
    case 0x3C: return { size: 1, text: 'INC A' };
    case 0x3D: return { size: 1, text: 'DEC A' };
    case 0x3E: return { size: 2, text: `LD A,$${hex2(bytes[off + 1])}` };
    case 0x77: return { size: 1, text: 'LD (HL),A' };
    case 0x7E: return { size: 1, text: 'LD A,(HL)' };
    case 0x87: return { size: 1, text: 'ADD A,A' };
    case 0xA7: return { size: 1, text: 'AND A' };
    case 0xAF: return { size: 1, text: 'XOR A' };
    case 0xB0: return { size: 1, text: 'OR B' };
    case 0xB1: return { size: 1, text: 'OR C' };
    case 0xB6: return { size: 1, text: 'OR (HL)' };
    case 0xB7: return { size: 1, text: 'OR A' };
    case 0xC0: return { size: 1, text: 'RET NZ', terminal: true };
    case 0xC3: return { size: 4, text: `JP $${hex6(u24(off + 1))}`, terminal: true, jump: u24(off + 1) };
    case 0xC8: return { size: 1, text: 'RET Z', terminal: true };
    case 0xC9: return { size: 1, text: 'RET', terminal: true };
    case 0xCD: return { size: 4, text: `CALL $${hex6(u24(off + 1))}`, call: u24(off + 1) };
    case 0xD0: return { size: 1, text: 'RET NC', terminal: true };
    case 0xD6: return { size: 2, text: `SUB $${hex2(bytes[off + 1])}` };
    case 0xD8: return { size: 1, text: 'RET C', terminal: true };
    case 0xE6: return { size: 2, text: `AND $${hex2(bytes[off + 1])}` };
    case 0xF6: return { size: 2, text: `OR $${hex2(bytes[off + 1])}` };
    case 0xFE: return { size: 2, text: `CP $${hex2(bytes[off + 1])}` };
    case 0xCB:
      if (op2 === 0x7F) return { size: 2, text: 'BIT 7,A' };
      if (op2 === 0x87) return { size: 2, text: 'RES 0,A' };
      if (op2 === 0xC7) return { size: 2, text: 'SET 0,A' };
      return { size: 2, text: `CB $${hex2(op2)}` };
    default:
      if (op >= 0x40 && op <= 0x7F) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        return { size: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
      }
      return { size: 1, text: `DB $${hex2(op)}`, unknown: true };
  }
}

console.log('\n=== Decoded instructions ===');
const decoded = [];
const calls = new Set();
let off = 0;
let boundary = null;

while (off < bytes.length) {
  const ins = decodeAt(off);
  const raw = Array.from(bytes.slice(off, off + ins.size), hex2).join(' ');
  decoded.push({ addr: startAddr + off, off, ...ins });
  if (ins.call !== undefined) calls.add(ins.call);
  console.log(`  ${hex6(startAddr + off)}: ${raw.padEnd(11)} ${ins.text}`);
  off += ins.size;

  if (ins.terminal) {
    boundary = startAddr + off;
    break;
  }
}

if (boundary !== null && off < bytes.length) {
  console.log(`  -- probable next code/data begins at 0x${hex6(boundary)} --`);
  while (off < bytes.length) {
    const ins = decodeAt(off);
    const raw = Array.from(bytes.slice(off, off + ins.size), hex2).join(' ');
    console.log(`  ${hex6(startAddr + off)}: ${raw.padEnd(11)} ${ins.text}`);
    off += ins.size;
    if (ins.terminal) break;
  }
}

const hasReads = decoded.filter(i => /\(\$[0-9a-f]{6}\)/.test(i.text));
const hasWrites = decoded.filter(i => /^LD \(\$[0-9a-f]{6}\),/.test(i.text) || /^LD \(HL\),/.test(i.text));
const returnIns = decoded.find(i => i.terminal);

console.log('\n=== Analysis ===');
console.log(`Start: 0x${hex6(startAddr)}`);
console.log(`Probable function end: ${boundary === null ? 'not found in 60-byte window' : `0x${hex6(boundary)}`}`);
console.log(`Probable size: ${boundary === null ? 'unknown' : `${boundary - startAddr} bytes`}`);
console.log(`Terminator: ${returnIns ? `${returnIns.text} at 0x${hex6(returnIns.addr)}` : 'none in decoded window'}`);
console.log(`CALL targets: ${calls.size ? Array.from(calls, a => `0x${hex6(a)}`).join(', ') : 'none in probable function'}`);
console.log(`Absolute reads: ${hasReads.length ? hasReads.map(i => `${i.text} at 0x${hex6(i.addr)}`).join('; ') : 'none decoded in probable function'}`);
console.log(`Absolute/direct writes: ${hasWrites.length ? hasWrites.map(i => `${i.text} at 0x${hex6(i.addr)}`).join('; ') : 'none decoded in probable function'}`);

console.log('\nInterpretation guide: 0x07FEE1 calls this with A=0 on invalid type, then ORs returned A into OP1 type at D005F8.');
console.log('If the decoded body is straight-line arithmetic/bit operations ending in RET, treat A as the returned transform mask/value.');
console.log('If the body loads from OP1/OP2 or another absolute address, the transform depends on that memory; use the read/write summary above.');
