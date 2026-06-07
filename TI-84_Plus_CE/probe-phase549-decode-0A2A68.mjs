import fs from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TARGET = 0x0A2A68;
const READ_LEN = 0x180;
const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function readU24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(offset, len) {
  return Array.from(rom.slice(offset, offset + len));
}

function bytesText(offset, len) {
  return bytesAt(offset, len).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function printableByte(byte) {
  return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.';
}

function dumpHex(start, len) {
  console.log(`Raw bytes at ${hex(start, 6)} (${len} bytes):`);
  for (let off = 0; off < len; off += 16) {
    const row = bytesAt(start + off, Math.min(16, len - off));
    const hexPart = row.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(47, ' ');
    const asciiPart = row.map(printableByte).join('');
    console.log(`${hex(start + off, 6)}  ${hexPart}  ${asciiPart}`);
  }
}

function decodeInstruction(pc) {
  const op = rom[pc];
  const op1 = rom[pc + 1];
  const op2 = rom[pc + 2];
  const op3 = rom[pc + 3];

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,${hex(readU24(pc + 1), 6)}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,${hex(op1)}` };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x08: return { len: 1, text: "EX AF,AF'" };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0A: return { len: 1, text: 'LD A,(BC)' };
    case 0x0B: return { len: 1, text: 'DEC BC' };
    case 0x0C: return { len: 1, text: 'INC C' };
    case 0x0D: return { len: 1, text: 'DEC C' };
    case 0x0E: return { len: 2, text: `LD C,${hex(op1)}` };
    case 0x0F: return { len: 1, text: 'RRCA' };
    case 0x10: return { len: 2, text: `DJNZ ${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x11: return { len: 4, text: `LD DE,${hex(readU24(pc + 1), 6)}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x14: return { len: 1, text: 'INC D' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x16: return { len: 2, text: `LD D,${hex(op1)}` };
    case 0x17: return { len: 1, text: 'RLA' };
    case 0x18: return { len: 2, text: `JR ${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1A: return { len: 1, text: 'LD A,(DE)' };
    case 0x1B: return { len: 1, text: 'DEC DE' };
    case 0x1C: return { len: 1, text: 'INC E' };
    case 0x1D: return { len: 1, text: 'DEC E' };
    case 0x1E: return { len: 2, text: `LD E,${hex(op1)}` };
    case 0x1F: return { len: 1, text: 'RRA' };
    case 0x20: return { len: 2, text: `JR NZ,${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x21: return { len: 4, text: `LD HL,${hex(readU24(pc + 1), 6)}` };
    case 0x22: return { len: 4, text: `LD (${hex(readU24(pc + 1), 6)}),HL` };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x26: return { len: 2, text: `LD H,${hex(op1)}` };
    case 0x27: return { len: 1, text: 'DAA' };
    case 0x28: return { len: 2, text: `JR Z,${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x2A: return { len: 4, text: `LD HL,(${hex(readU24(pc + 1), 6)})` };
    case 0x2B: return { len: 1, text: 'DEC HL' };
    case 0x2C: return { len: 1, text: 'INC L' };
    case 0x2D: return { len: 1, text: 'DEC L' };
    case 0x2E: return { len: 2, text: `LD L,${hex(op1)}` };
    case 0x2F: return { len: 1, text: 'CPL' };
    case 0x30: return { len: 2, text: `JR NC,${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x31: return { len: 4, text: `LD SP,${hex(readU24(pc + 1), 6)}` };
    case 0x32: return { len: 4, text: `LD (${hex(readU24(pc + 1), 6)}),A` };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x34: return { len: 1, text: 'INC (HL)' };
    case 0x35: return { len: 1, text: 'DEC (HL)' };
    case 0x36: return { len: 2, text: `LD (HL),${hex(op1)}` };
    case 0x37: return { len: 1, text: 'SCF' };
    case 0x38: return { len: 2, text: `JR C,${hex((pc + 2 + (op1 << 24 >> 24)) & 0xFFFFFF, 6)}` };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x3A: return { len: 4, text: `LD A,(${hex(readU24(pc + 1), 6)})` };
    case 0x3B: return { len: 1, text: 'DEC SP' };
    case 0x3C: return { len: 1, text: 'INC A' };
    case 0x3D: return { len: 1, text: 'DEC A' };
    case 0x3E: return { len: 2, text: `LD A,${hex(op1)}` };
    case 0x3F: return { len: 1, text: 'CCF' };
    case 0x76: return { len: 1, text: 'HALT' };
    case 0xC0: return { len: 1, text: 'RET NZ', terminal: true };
    case 0xC1: return { len: 1, text: 'POP BC' };
    case 0xC2: return { len: 4, text: `JP NZ,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'JP' };
    case 0xC3: return { len: 4, text: `JP ${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'JP', terminal: true };
    case 0xC4: return { len: 4, text: `CALL NZ,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'CALL' };
    case 0xC5: return { len: 1, text: 'PUSH BC' };
    case 0xC6: return { len: 2, text: `ADD A,${hex(op1)}` };
    case 0xC7: return { len: 1, text: 'RST 00h' };
    case 0xC8: return { len: 1, text: 'RET Z', terminal: true };
    case 0xC9: return { len: 1, text: 'RET', terminal: true };
    case 0xCA: return { len: 4, text: `JP Z,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'JP' };
    case 0xCC: return { len: 4, text: `CALL Z,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'CALL' };
    case 0xCD: return { len: 4, text: `CALL ${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'CALL' };
    case 0xD0: return { len: 1, text: 'RET NC', terminal: true };
    case 0xD2: return { len: 4, text: `JP NC,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'JP' };
    case 0xD4: return { len: 4, text: `CALL NC,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'CALL' };
    case 0xD8: return { len: 1, text: 'RET C', terminal: true };
    case 0xDA: return { len: 4, text: `JP C,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'JP' };
    case 0xDC: return { len: 4, text: `CALL C,${hex(readU24(pc + 1), 6)}`, target: readU24(pc + 1), kind: 'CALL' };
    case 0xE1: return { len: 1, text: 'POP HL' };
    case 0xE5: return { len: 1, text: 'PUSH HL' };
    case 0xE6: return { len: 2, text: `AND ${hex(op1)}` };
    case 0xEB: return { len: 1, text: 'EX DE,HL' };
    case 0xF1: return { len: 1, text: 'POP AF' };
    case 0xF5: return { len: 1, text: 'PUSH AF' };
    case 0xF6: return { len: 2, text: `OR ${hex(op1)}` };
    case 0xFE: return { len: 2, text: `CP ${hex(op1)}` };
    case 0xDD:
    case 0xFD: {
      const reg = op === 0xDD ? 'IX' : 'IY';
      if (op1 === 0x21) return { len: 5, text: `LD ${reg},${hex(readU24(pc + 2), 6)}` };
      if (op1 === 0x22) return { len: 5, text: `LD (${hex(readU24(pc + 2), 6)}),${reg}` };
      if (op1 === 0x2A) return { len: 5, text: `LD ${reg},(${hex(readU24(pc + 2), 6)})` };
      if (op1 === 0x36) return { len: 4, text: `LD (${reg}+${hex(op2)}),${hex(op3)}` };
      if (op1 === 0xCB) return { len: 4, text: `${reg} CB ${hex(op2)} ${hex(op3)}` };
      return { len: 2, text: `${reg} prefix ${hex(op1)}` };
    }
    case 0xED:
      if (op1 === 0x27) return { len: 2, text: 'LD HL,(HL)' };
      if (op1 === 0x28) return { len: 2, text: 'LD IY,(HL)' };
      if (op1 === 0x2A) return { len: 2, text: 'LEA HL,IY+0' };
      if (op1 === 0x38) return { len: 4, text: `IN0 A,(${hex(op2)})` };
      if (op1 === 0x39) return { len: 4, text: `OUT0 (${hex(op2)}),A` };
      return { len: 2, text: `ED ${hex(op1)}` };
    case 0xCB:
      return { len: 2, text: `CB ${hex(op1)}` };
    default:
      if (op >= 0x40 && op <= 0x7F) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        return { len: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
      }
      if (op >= 0x80 && op <= 0xBF) {
        const groups = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        return { len: 1, text: `${groups[(op >> 3) & 7]} ${regs[op & 7]}` };
      }
      return { len: 1, text: `DB ${hex(op)}` };
  }
}

function disassemble(start, maxLen) {
  const rows = [];
  const calls = [];
  let pc = start;
  const end = Math.min(rom.length, start + maxLen);
  while (pc < end) {
    const ins = decodeInstruction(pc);
    rows.push({ pc, ...ins });
    if (ins.kind === 'CALL' || ins.kind === 'JP') calls.push({ pc, kind: ins.kind, target: ins.target, text: ins.text });
    pc += ins.len;
    if (ins.terminal && rows.length > 6) break;
  }
  return { rows, calls, end: pc };
}

function findXrefs(target) {
  const needle = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const refs = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    const op = rom[i];
    if ((op === 0xCD || op === 0xC3) &&
        rom[i + 1] === needle[0] &&
        rom[i + 2] === needle[1] &&
        rom[i + 3] === needle[2]) {
      refs.push({ offset: i, kind: op === 0xCD ? 'CALL' : 'JP' });
    }
  }
  return refs;
}

function inferPurpose(rows, calls) {
  const hasDeRead = rows.some((row) => row.text === 'LD A,(DE)' || row.text === 'EX DE,HL');
  const hasHlDeref = rows.some((row) => row.text === 'LD HL,(HL)');
  const compares = rows.filter((row) => row.text.startsWith('CP ')).map((row) => row.text.slice(3));
  const absoluteWrites = rows.filter((row) => row.text.startsWith('LD (') && row.text.endsWith('),A'));
  const subCallTargets = calls.filter((call) => call.kind === 'CALL').map((call) => hex(call.target, 6));

  console.log('\nSummary / likely purpose:');
  console.log(`- Function entry: ${hex(TARGET, 6)}; first decoded return/terminal at ${hex(rows.at(-1).pc, 6)}; decoded size ${hex(rows.at(-1).pc + rows.at(-1).len - TARGET, 4)} bytes.`);
  console.log(`- Input clues: ${hasDeRead ? 'reads or exchanges DE/HL, matching token-template bytes passed in DE' : 'no direct DE memory read was decoded in the first linear path'}.`);
  console.log(`- Table/global clues: ${hasHlDeref ? 'uses eZ80 LD HL,(HL), so it follows a 24-bit pointer/table entry' : 'no eZ80 LD HL,(HL) pointer dereference found in the first linear path'}.`);
  console.log(`- Comparisons seen: ${compares.length ? compares.join(', ') : 'none in decoded linear path'}.`);
  console.log(`- Absolute A writes seen: ${absoluteWrites.length ? absoluteWrites.map((row) => `${hex(row.pc, 6)} ${row.text}`).join('; ') : 'none in decoded linear path'}.`);
  console.log(`- Sub-calls seen: ${subCallTargets.length ? subCallTargets.join(', ') : 'none in decoded linear path'}.`);
  console.log('- Interpretation: this appears to be a compact primary token/character output wrapper used by display-template rendering. Its exact LCD effect depends on the sub-call targets and globals it touches; direct full-screen LCD-memory writes are not assumed unless shown in the annotated disassembly above.');
}

dumpHex(TARGET, 100);

const decoded = disassemble(TARGET, READ_LEN);
console.log('\nAnnotated eZ80 ADL disassembly:');
for (const row of decoded.rows) {
  const raw = bytesText(row.pc, row.len).padEnd(14, ' ');
  const targetNote = row.target !== undefined ? ` ; target=${hex(row.target, 6)}` : '';
  console.log(`${hex(row.pc, 6)}  ${raw}  ${row.text}${targetNote}`);
}

console.log('\nSub-calls / jumps in decoded linear path:');
if (decoded.calls.length === 0) {
  console.log('none');
} else {
  for (const call of decoded.calls) {
    console.log(`${hex(call.pc, 6)}  ${call.kind.padEnd(4)} ${hex(call.target, 6)}  ${call.text}`);
  }
}

const xrefs = findXrefs(TARGET);
const callCount = xrefs.filter((ref) => ref.kind === 'CALL').length;
const jpCount = xrefs.filter((ref) => ref.kind === 'JP').length;
console.log(`\nCALL/JP xrefs to ${hex(TARGET, 6)}: ${xrefs.length} total (${callCount} CALL, ${jpCount} JP)`);
if (xrefs.length === 0) {
  console.log('none found');
} else {
  for (const ref of xrefs) {
    console.log(`${hex(ref.offset, 6)}  ${ref.kind} ${hex(TARGET, 6)}`);
  }
}

inferPurpose(decoded.rows, decoded.calls);
