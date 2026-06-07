import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const TARGET = 0x0A23C0;
const MAX_DISASM_BYTES = 0x80;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr(value) {
  return hex(value, 6);
}

function u24le(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function s8(value) {
  return value > 0x7F ? value - 0x100 : value;
}

function disp(value) {
  const signed = s8(value);
  return signed < 0 ? `-${hex(-signed)}` : `+${hex(signed)}`;
}

function bytesAt(offset, length) {
  return Array.from(rom.slice(offset, offset + length))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function decodeIndexed(prefixName, offset) {
  const op = rom[offset + 1];
  const d = rom[offset + 2];
  const cbOp = rom[offset + 3];
  const p = prefixName;

  if (op === 0x21) return { size: 5, text: `LD ${p},${addr(u24le(offset + 2))}` };
  if (op === 0x22) return { size: 5, text: `LD (${addr(u24le(offset + 2))}),${p}` };
  if (op === 0x2A) return { size: 5, text: `LD ${p},(${addr(u24le(offset + 2))})` };
  if (op === 0x23) return { size: 2, text: `INC ${p}` };
  if (op === 0x2B) return { size: 2, text: `DEC ${p}` };
  if (op === 0x34) return { size: 3, text: `INC (${p}${disp(d)})` };
  if (op === 0x35) return { size: 3, text: `DEC (${p}${disp(d)})` };
  if (op === 0x36) return { size: 4, text: `LD (${p}${disp(d)}),${hex(rom[offset + 3])}` };
  if (op === 0x46) return { size: 3, text: `LD B,(${p}${disp(d)})` };
  if (op === 0x4E) return { size: 3, text: `LD C,(${p}${disp(d)})` };
  if (op === 0x56) return { size: 3, text: `LD D,(${p}${disp(d)})` };
  if (op === 0x5E) return { size: 3, text: `LD E,(${p}${disp(d)})` };
  if (op === 0x66) return { size: 3, text: `LD H,(${p}${disp(d)})` };
  if (op === 0x6E) return { size: 3, text: `LD L,(${p}${disp(d)})` };
  if (op === 0x70) return { size: 3, text: `LD (${p}${disp(d)}),B` };
  if (op === 0x71) return { size: 3, text: `LD (${p}${disp(d)}),C` };
  if (op === 0x72) return { size: 3, text: `LD (${p}${disp(d)}),D` };
  if (op === 0x73) return { size: 3, text: `LD (${p}${disp(d)}),E` };
  if (op === 0x74) return { size: 3, text: `LD (${p}${disp(d)}),H` };
  if (op === 0x75) return { size: 3, text: `LD (${p}${disp(d)}),L` };
  if (op === 0x77) return { size: 3, text: `LD (${p}${disp(d)}),A` };
  if (op === 0x7E) return { size: 3, text: `LD A,(${p}${disp(d)})` };
  if (op === 0x86) return { size: 3, text: `ADD A,(${p}${disp(d)})` };
  if (op === 0x8E) return { size: 3, text: `ADC A,(${p}${disp(d)})` };
  if (op === 0x96) return { size: 3, text: `SUB (${p}${disp(d)})` };
  if (op === 0x9E) return { size: 3, text: `SBC A,(${p}${disp(d)})` };
  if (op === 0xA6) return { size: 3, text: `AND (${p}${disp(d)})` };
  if (op === 0xAE) return { size: 3, text: `XOR (${p}${disp(d)})` };
  if (op === 0xB6) return { size: 3, text: `OR (${p}${disp(d)})` };
  if (op === 0xBE) return { size: 3, text: `CP (${p}${disp(d)})` };
  if (op === 0xCB) {
    const bitOp = Math.floor((cbOp & 0x38) / 8);
    if ((cbOp & 0xC0) === 0x40) return { size: 4, text: `BIT ${bitOp},(${p}${disp(d)})` };
    if ((cbOp & 0xC0) === 0x80) return { size: 4, text: `RES ${bitOp},(${p}${disp(d)})` };
    if ((cbOp & 0xC0) === 0xC0) return { size: 4, text: `SET ${bitOp},(${p}${disp(d)})` };
    return { size: 4, text: `${p} CB ${hex(d)} ${hex(cbOp)}` };
  }

  return { size: 2, text: `${p} prefix opcode ${hex(op)}` };
}

function decodeEd(offset) {
  const op = rom[offset + 1];
  if (op === 0x17) return { size: 2, text: 'LD DE,(HL)' };
  if (op === 0x4B) return { size: 5, text: `LD BC,(${addr(u24le(offset + 2))})` };
  if (op === 0x5B) return { size: 5, text: `LD DE,(${addr(u24le(offset + 2))})` };
  if (op === 0x6B) return { size: 5, text: `LD HL,(${addr(u24le(offset + 2))})` };
  if (op === 0x43) return { size: 5, text: `LD (${addr(u24le(offset + 2))}),BC` };
  if (op === 0x53) return { size: 5, text: `LD (${addr(u24le(offset + 2))}),DE` };
  if (op === 0x63) return { size: 5, text: `LD (${addr(u24le(offset + 2))}),HL` };
  if (op === 0x44) return { size: 2, text: 'NEG' };
  if (op === 0x45) return { size: 2, text: 'RETN' };
  if (op === 0x4D) return { size: 2, text: 'RETI' };
  if (op === 0xA0) return { size: 2, text: 'LDI' };
  if (op === 0xA8) return { size: 2, text: 'LDD' };
  if (op === 0xB0) return { size: 2, text: 'LDIR' };
  if (op === 0xB8) return { size: 2, text: 'LDDR' };
  return { size: 2, text: `ED ${hex(op)}` };
}

function decode(offset) {
  const op = rom[offset];

  if (op === 0xDD) return decodeIndexed('IX', offset);
  if (op === 0xFD) return decodeIndexed('IY', offset);
  if (op === 0xED) return decodeEd(offset);
  if (op === 0x40) {
    const next = rom[offset + 1];
    if (next === 0xCD) return { size: 5, text: `SIS CALL ${hex(rom[offset + 2] | (rom[offset + 3] << 8), 4)}` };
    if (next === 0xC3) return { size: 5, text: `SIS JP ${hex(rom[offset + 2] | (rom[offset + 3] << 8), 4)}` };
    return { size: 1, text: 'LD B,B / SIS prefix candidate' };
  }

  const oneByte = {
    0x00: 'NOP',
    0x02: 'LD (BC),A',
    0x03: 'INC BC',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x08: "EX AF,AF'",
    0x09: 'ADD HL,BC',
    0x0A: 'LD A,(BC)',
    0x0B: 'DEC BC',
    0x0C: 'INC C',
    0x0D: 'DEC C',
    0x0F: 'RRCA',
    0x12: 'LD (DE),A',
    0x13: 'INC DE',
    0x14: 'INC D',
    0x15: 'DEC D',
    0x17: 'RLA',
    0x19: 'ADD HL,DE',
    0x1A: 'LD A,(DE)',
    0x1B: 'DEC DE',
    0x1C: 'INC E',
    0x1D: 'DEC E',
    0x1F: 'RRA',
    0x23: 'INC HL',
    0x29: 'ADD HL,HL',
    0x2B: 'DEC HL',
    0x2F: 'CPL',
    0x32: `LD (${addr(u24le(offset + 1))}),A`,
    0x37: 'SCF',
    0x3A: `LD A,(${addr(u24le(offset + 1))})`,
    0x3F: 'CCF',
    0x76: 'HALT',
    0x77: 'LD (HL),A',
    0x7E: 'LD A,(HL)',
    0xA7: 'AND A',
    0xAF: 'XOR A',
    0xB7: 'OR A',
    0xC0: 'RET NZ',
    0xC8: 'RET Z',
    0xC9: 'RET',
    0xD0: 'RET NC',
    0xD8: 'RET C',
    0xE0: 'RET PO',
    0xE8: 'RET PE',
    0xE9: 'JP (HL)',
    0xF0: 'RET P',
    0xF8: 'RET M',
  };

  if (oneByte[op]) {
    const wideImmediateOps = new Set([0x32, 0x3A]);
    return { size: wideImmediateOps.has(op) ? 4 : 1, text: oneByte[op] };
  }

  if ([0x01, 0x11, 0x21, 0x31].includes(op)) {
    const rr = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' }[op];
    return { size: 4, text: `LD ${rr},${addr(u24le(offset + 1))}` };
  }
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(op)) {
    const r = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x36: '(HL)', 0x3E: 'A' }[op];
    return { size: 2, text: `LD ${r},${hex(rom[offset + 1])}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cc = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' }[op];
    const target = offset + 2 + s8(rom[offset + 1]);
    return { size: 2, text: `${cc},${addr(target)}` };
  }
  if ([0xC2, 0xC3, 0xCA, 0xD2, 0xDA].includes(op)) {
    const jp = { 0xC2: 'JP NZ', 0xC3: 'JP', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C' }[op];
    return { size: 4, text: `${jp},${addr(u24le(offset + 1))}` };
  }
  if ([0xC4, 0xCC, 0xCD, 0xD4, 0xDC].includes(op)) {
    const call = { 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xCD: 'CALL', 0xD4: 'CALL NC', 0xDC: 'CALL C' }[op];
    return { size: 4, text: `${call} ${addr(u24le(offset + 1))}` };
  }
  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) {
    const alu = { 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' }[op];
    return { size: 2, text: `${alu},${hex(rom[offset + 1])}` };
  }

  if ((op & 0xC0) === 0x40 && op !== 0x76) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  }
  if ((op & 0xC7) === 0x04) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `INC ${regs[(op >> 3) & 7]}` };
  }
  if ((op & 0xC7) === 0x05) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `DEC ${regs[(op >> 3) & 7]}` };
  }
  if ((op & 0xF8) === 0x80) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `ADD A,${regs[op & 7]}` };
  }
  if ((op & 0xF8) === 0x90) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `SUB ${regs[op & 7]}` };
  }
  if ((op & 0xF8) === 0xA0) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `AND ${regs[op & 7]}` };
  }
  if ((op & 0xF8) === 0xB0) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `OR ${regs[op & 7]}` };
  }
  if ((op & 0xF8) === 0xB8) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { size: 1, text: `CP ${regs[op & 7]}` };
  }

  return { size: 1, text: `DB ${hex(op)}` };
}

function disassembleFunction(start) {
  const lines = [];
  let pc = start;
  const end = Math.min(rom.length, start + MAX_DISASM_BYTES);

  while (pc < end) {
    const decoded = decode(pc);
    lines.push({
      address: pc,
      size: decoded.size,
      bytes: bytesAt(pc, decoded.size),
      text: decoded.text,
    });
    pc += decoded.size;

    if (/^RET/.test(decoded.text) || /^JP /.test(decoded.text)) {
      break;
    }
  }

  return lines;
}

function findRefs(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];

  for (let i = 0; i <= rom.length - 4; i += 1) {
    const op = rom[i];
    if ((op === 0xCD || op === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      refs.push({ address: i, kind: op === 0xCD ? 'CALL' : 'JP' });
    }
  }

  return refs;
}

function collectEffects(lines) {
  const calls = [];
  const reads = new Set();
  const writes = new Set();

  for (const line of lines) {
    const text = line.text;
    const callMatch = text.match(/^CALL(?: [A-Z]+)? (0x[0-9A-F]+)/);
    if (callMatch) calls.push(callMatch[1]);

    for (const match of text.matchAll(/\((0x[0-9A-F]{6})\)/g)) {
      if (/^LD \(0x[0-9A-F]{6}\),/.test(text)) writes.add(match[1]);
      else reads.add(match[1]);
    }
    for (const match of text.matchAll(/\((I[XY][+-]0x[0-9A-F]+)\)/g)) {
      if (/^LD \(I[XY][+-]0x[0-9A-F]+\),/.test(text) || /^INC \(I[XY]/.test(text) || /^DEC \(I[XY]/.test(text)) {
        writes.add(match[1]);
      } else {
        reads.add(match[1]);
      }
    }
  }

  return { calls, reads: [...reads], writes: [...writes] };
}

const raw = bytesAt(TARGET, MAX_DISASM_BYTES);
const lines = disassembleFunction(TARGET);
const refs = findRefs(TARGET);
const effects = collectEffects(lines);
const last = lines[lines.length - 1];
const boundary = last ? last.address + last.size : TARGET;

console.log('Phase 551 decode: 0x0A23C0 pre-render setup');
console.log('='.repeat(64));
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Target: ${addr(TARGET)}`);
console.log(`Raw bytes (${hex(MAX_DISASM_BYTES)} max):`);
console.log(raw);
console.log('');

console.log('Disassembly:');
for (const line of lines) {
  console.log(`${addr(line.address)}  ${line.bytes.padEnd(15)}  ${line.text}`);
}
console.log('');

console.log('Function boundary assessment:');
console.log(`Start: ${addr(TARGET)}`);
console.log(`Stop:  ${addr(boundary)} (${last?.text ?? 'no decoded instruction'})`);
console.log(`Size:  ${hex(boundary - TARGET)} bytes`);
console.log('');

console.log('Observed references to 0x0A23C0:');
console.log(`Total CALL/JP refs: ${refs.length}`);
for (const ref of refs) {
  console.log(`${addr(ref.address)}  ${ref.kind} ${addr(TARGET)}`);
}
console.log('');

console.log('Static read/write/call summary from decoded window:');
console.log(`Calls:  ${effects.calls.length ? effects.calls.join(', ') : '(none)'}`);
console.log(`Reads:  ${effects.reads.length ? effects.reads.join(', ') : '(none detected by simple parser)'}`);
console.log(`Writes: ${effects.writes.length ? effects.writes.join(', ') : '(none detected by simple parser)'}`);
console.log('');

console.log('Interpretation notes:');
console.log('- Entry appears to be from the 0x0A23E5 character renderer before glyph rendering.');
console.log('- Treat registers and flags as live unless the disassembly shows explicit initialization.');
console.log('- Use the decoded reads/writes and calls above to classify this as coordinate/font/window setup or a fast return stub.');
console.log('- If the first terminating instruction is a JP, inspect the target as a tail-call continuation rather than a normal local RET boundary.');
