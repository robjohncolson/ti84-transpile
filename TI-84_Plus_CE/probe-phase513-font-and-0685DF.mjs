import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const entry = 0x0685df;
const fontBase = 0x003d6e;
const glyphSize = 28;
const glyphCount = 128;

function hex(value, width = 6) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function u8(addr) {
  return rom[addr] ?? 0;
}

function u24(addr) {
  return u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
}

function rel8(addr) {
  const value = u8(addr);
  return value >= 0x80 ? value - 0x100 : value;
}

function bytes(addr, len) {
  return Array.from(rom.subarray(addr, addr + len));
}

function bytesText(addr, len) {
  return bytes(addr, len).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function disassemble(addr, maxBytes = 260) {
  const out = [];
  const calls = new Set();
  const ramRefs = new Set();
  const jumps = new Set();
  const start = addr;
  let pc = addr;
  let stopReason = 'byte limit';

  while (pc < rom.length && pc - start < maxBytes) {
    const at = pc;
    const op = u8(pc);
    let len = 1;
    let text = `DB ${hex(op, 2)}`;
    let terminal = false;

    switch (op) {
      case 0x00:
        text = 'NOP';
        break;
      case 0x01:
        len = 4;
        text = `LD BC,${hex(u24(pc + 1))}`;
        break;
      case 0x06:
        len = 2;
        text = `LD B,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x0e:
        len = 2;
        text = `LD C,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x11:
        len = 4;
        text = `LD DE,${hex(u24(pc + 1))}`;
        break;
      case 0x16:
        len = 2;
        text = `LD D,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x1e:
        len = 2;
        text = `LD E,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x21:
        len = 4;
        text = `LD HL,${hex(u24(pc + 1))}`;
        break;
      case 0x26:
        len = 2;
        text = `LD H,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x2e:
        len = 2;
        text = `LD L,${hex(u8(pc + 1), 2)}`;
        break;
      case 0x31:
        len = 4;
        text = `LD SP,${hex(u24(pc + 1))}`;
        break;
      case 0x32: {
        const target = u24(pc + 1);
        len = 4;
        text = `LD (${hex(target)}),A`;
        if (target >= 0xd00000) ramRefs.add(target);
        break;
      }
      case 0x3a: {
        const target = u24(pc + 1);
        len = 4;
        text = `LD A,(${hex(target)})`;
        if (target >= 0xd00000) ramRefs.add(target);
        break;
      }
      case 0x3e:
        len = 2;
        text = `LD A,${hex(u8(pc + 1), 2)}`;
        break;
      case 0xc2: {
        const target = u24(pc + 1);
        len = 4;
        text = `JP NZ,${hex(target)}`;
        jumps.add(target);
        break;
      }
      case 0xc3: {
        const target = u24(pc + 1);
        len = 4;
        text = `JP ${hex(target)}`;
        jumps.add(target);
        terminal = true;
        stopReason = 'unconditional JP';
        break;
      }
      case 0xc4: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL NZ,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xc8:
        text = 'RET Z';
        break;
      case 0xc9:
        text = 'RET';
        terminal = true;
        stopReason = 'RET';
        break;
      case 0xca: {
        const target = u24(pc + 1);
        len = 4;
        text = `JP Z,${hex(target)}`;
        jumps.add(target);
        break;
      }
      case 0xcc: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL Z,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xcd: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL ${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xd0:
        text = 'RET NC';
        break;
      case 0xd2: {
        const target = u24(pc + 1);
        len = 4;
        text = `JP NC,${hex(target)}`;
        jumps.add(target);
        break;
      }
      case 0xd4: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL NC,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xd8:
        text = 'RET C';
        break;
      case 0xda: {
        const target = u24(pc + 1);
        len = 4;
        text = `JP C,${hex(target)}`;
        jumps.add(target);
        break;
      }
      case 0xdc: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL C,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xe8:
        text = 'RET PE';
        break;
      case 0xec: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL PE,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0xf8:
        text = 'RET M';
        break;
      case 0xfc: {
        const target = u24(pc + 1);
        len = 4;
        text = `CALL M,${hex(target)}`;
        calls.add(target);
        break;
      }
      case 0x18: {
        const target = pc + 2 + rel8(pc + 1);
        len = 2;
        text = `JR ${hex(target)}`;
        jumps.add(target);
        terminal = true;
        stopReason = 'unconditional JR';
        break;
      }
      case 0x20:
      case 0x28:
      case 0x30:
      case 0x38: {
        const names = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
        const target = pc + 2 + rel8(pc + 1);
        len = 2;
        text = `JR ${names[op]},${hex(target)}`;
        jumps.add(target);
        break;
      }
      case 0x40:
        len = decodePrefixed(pc, '.SIS');
        text = len.text;
        len = len.len;
        break;
      case 0xed:
        len = decodeEd(pc);
        text = len.text;
        len = len.len;
        break;
      case 0xdd:
      case 0xfd:
        len = decodeIndex(pc, op === 0xdd ? 'IX' : 'IY');
        text = len.text;
        len = len.len;
        break;
      default:
        text = decodeCommonOneByte(op);
        break;
    }

    out.push({ addr: at, bytes: bytesText(at, len), text });
    pc += len;
    if (terminal) break;
  }

  return { out, calls: [...calls].sort((a, b) => a - b), ramRefs: [...ramRefs].sort((a, b) => a - b), jumps: [...jumps].sort((a, b) => a - b), stopReason, end: pc };
}

function decodeCommonOneByte(op) {
  const names = {
    0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0a: 'LD A,(BC)', 0x0b: 'DEC BC', 0x0c: 'INC C', 0x0d: 'DEC C', 0x0f: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA',
    0x19: 'ADD HL,DE', 0x1a: 'LD A,(DE)', 0x1b: 'DEC DE', 0x1c: 'INC E', 0x1d: 'DEC E', 0x1f: 'RRA',
    0x22: 'LD (imm24),HL', 0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x29: 'ADD HL,HL', 0x2a: 'LD HL,(imm24)', 0x2b: 'DEC HL', 0x2c: 'INC L', 0x2d: 'DEC L', 0x2f: 'CPL',
    0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x36: 'LD (HL),imm8', 0x37: 'SCF',
    0x39: 'ADD HL,SP', 0x3b: 'DEC SP', 0x3c: 'INC A', 0x3d: 'DEC A', 0x3f: 'CCF',
    0x76: 'HALT', 0x77: 'LD (HL),A', 0x7e: 'LD A,(HL)', 0xaf: 'XOR A',
    0xb7: 'OR A', 0xc1: 'POP BC', 0xc5: 'PUSH BC', 0xd1: 'POP DE', 0xd5: 'PUSH DE',
    0xe1: 'POP HL', 0xe5: 'PUSH HL', 0xeb: 'EX DE,HL', 0xf1: 'POP AF', 0xf5: 'PUSH AF'
  };
  if (names[op]) return names[op];
  if (op >= 0x40 && op <= 0x7f) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`;
  }
  if (op >= 0x80 && op <= 0xbf) {
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return `${ops[(op >> 3) & 7]} ${regs[op & 7]}`;
  }
  return `DB ${hex(op, 2)}`;
}

function decodePrefixed(pc, mode) {
  const next = u8(pc + 1);
  if (next === 0xcd) return { len: 5, text: `${mode} CALL ${hex(u24(pc + 2))}` };
  if (next === 0xc3) return { len: 5, text: `${mode} JP ${hex(u24(pc + 2))}` };
  if (next === 0x21) return { len: 5, text: `${mode} LD HL,${hex(u24(pc + 2))}` };
  return { len: 2, text: `${mode} ${decodeCommonOneByte(next)}` };
}

function decodeEd(pc) {
  const op = u8(pc + 1);
  const names = {
    0x44: 'NEG', 0x45: 'RETN', 0x47: 'LD I,A', 0x4d: 'RETI', 0x57: 'LD A,I',
    0x5b: 'LD DE,(imm24)', 0x73: 'LD (imm24),SP', 0x7b: 'LD SP,(imm24)',
    0xa0: 'LDI', 0xa1: 'CPI', 0xa8: 'LDD', 0xa9: 'CPD', 0xb0: 'LDIR', 0xb1: 'CPIR',
    0xb8: 'LDDR', 0xb9: 'CPDR'
  };
  if ([0x43, 0x4b, 0x53, 0x5b, 0x63, 0x6b, 0x73, 0x7b].includes(op)) {
    return { len: 5, text: names[op] ?? `ED ${hex(op, 2)} ${hex(u24(pc + 2))}` };
  }
  return { len: 2, text: names[op] ?? `ED ${hex(op, 2)}` };
}

function decodeIndex(pc, reg) {
  const op = u8(pc + 1);
  if (op === 0xcb) {
    const d = rel8(pc + 2);
    const cb = u8(pc + 3);
    const bitOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (cb < 0x40) return { len: 4, text: `${bitOps[(cb >> 3) & 7]} (${reg}${d < 0 ? '' : '+'}${d})` };
    if (cb < 0x80) return { len: 4, text: `BIT ${(cb >> 3) & 7},(${reg}${d < 0 ? '' : '+'}${d})` };
    if (cb < 0xc0) return { len: 4, text: `RES ${(cb >> 3) & 7},(${reg}${d < 0 ? '' : '+'}${d})` };
    return { len: 4, text: `SET ${(cb >> 3) & 7},(${reg}${d < 0 ? '' : '+'}${d})` };
  }
  if (op === 0x21) return { len: 5, text: `LD ${reg},${hex(u24(pc + 2))}` };
  if (op === 0x22) return { len: 5, text: `LD (${hex(u24(pc + 2))}),${reg}` };
  if (op === 0x2a) return { len: 5, text: `LD ${reg},(${hex(u24(pc + 2))})` };
  if (op === 0x36) return { len: 4, text: `LD (${reg}${rel8(pc + 2) < 0 ? '' : '+'}${rel8(pc + 2)}),${hex(u8(pc + 3), 2)}` };
  if ([0x34, 0x35, 0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e].includes(op)) {
    return { len: 3, text: `${reg}-indexed ${decodeCommonOneByte(op)} d=${rel8(pc + 2)}` };
  }
  return { len: 2, text: `${reg} ${decodeCommonOneByte(op)}` };
}

function glyphData(code) {
  const start = fontBase + code * glyphSize;
  return rom.subarray(start, start + glyphSize);
}

function renderGlyph(code, layout) {
  const data = glyphData(code);
  const rows = [];
  for (let y = 0; y < layout.rows; y++) {
    let row = '';
    for (let x = 0; x < layout.width; x++) {
      let bit = 0;
      if (layout.kind === '2bytes-msb') {
        const rowValue = (data[y * 2] << 8) | data[y * 2 + 1];
        bit = (rowValue >> (15 - x)) & 1;
      } else if (layout.kind === '2bytes-lsb') {
        const rowValue = data[y * 2] | (data[y * 2 + 1] << 8);
        bit = (rowValue >> x) & 1;
      } else if (layout.kind === 'packed-msb') {
        const bitIndex = y * layout.width + x;
        bit = (data[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
      } else if (layout.kind === 'packed-lsb') {
        const bitIndex = y * layout.width + x;
        bit = (data[bitIndex >> 3] >> (bitIndex & 7)) & 1;
      }
      row += bit ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

function countPixels(code, layout) {
  return renderGlyph(code, layout).join('').replaceAll('.', '').length;
}

function printGlyph(label, code, layout) {
  console.log(`${label} ${hex(code, 2)} using ${layout.name}`);
  for (const row of renderGlyph(code, layout)) console.log(row);
  console.log(`pixels=${countPixels(code, layout)} bytes=${Array.from(glyphData(code)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
}

function scoreLayout(layout) {
  const space = countPixels(0x20, layout);
  const zero = countPixels(0x30, layout);
  const a = countPixels(0x41, layout);
  let score = 0;
  if (space === 0) score += 50;
  if (zero >= 10 && zero <= 90) score += 20;
  if (a >= 10 && a <= 90) score += 20;
  score -= Math.abs(zero - a) / 4;
  return score;
}

console.log('=== Part A: decode function at 0x0685DF ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`First 224 bytes: ${bytesText(entry, 224)}`);

const decoded = disassemble(entry, 300);
for (const ins of decoded.out) {
  console.log(`${hex(ins.addr)}  ${ins.bytes.padEnd(14)} ${ins.text}`);
}
console.log(`Stopped at ${hex(decoded.end)} due to ${decoded.stopReason}`);
console.log(`CALL targets: ${decoded.calls.map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`JP/JR targets: ${decoded.jumps.map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`RAM references: ${decoded.ramRefs.map((v) => hex(v)).join(', ') || '(none detected by direct 24-bit loads/stores)'}`);

const known = new Map([
  [0x0a1799, 'known rasterizer'],
  [0x07c8b7, 'known BCD position calc'],
  [0x07d583, 'known descriptor populator']
]);
for (const [target, name] of known) {
  const connected = decoded.calls.includes(target) || decoded.jumps.includes(target);
  console.log(`Connection to ${hex(target)} (${name}): ${connected ? 'direct' : 'not direct in decoded linear stream'}`);
}

console.log('\n=== Part B: font atlas at 0x003D6E ===');
const atlas = rom.subarray(fontBase, fontBase + glyphCount * glyphSize);
console.log(`Extracted ${atlas.length} bytes for ${glyphCount} glyphs (${glyphSize} bytes each)`);
console.log(`Font base sample: ${bytesText(fontBase, 128)}`);

const layouts = [
  { name: '12x14, two bytes per row, MSB-left', kind: '2bytes-msb', width: 12, rows: 14 },
  { name: '12x14, two bytes per row, LSB-left', kind: '2bytes-lsb', width: 12, rows: 14 },
  { name: '14x16, packed bits, MSB-left', kind: 'packed-msb', width: 14, rows: 16 },
  { name: '14x16, packed bits, LSB-left', kind: 'packed-lsb', width: 14, rows: 16 },
  { name: '16x14, two bytes per row, MSB-left', kind: '2bytes-msb', width: 16, rows: 14 },
  { name: '16x14, two bytes per row, LSB-left', kind: '2bytes-lsb', width: 16, rows: 14 }
];

for (const layout of layouts) {
  console.log(`Layout score ${scoreLayout(layout).toFixed(2)}: ${layout.name}; space=${countPixels(0x20, layout)}, 0=${countPixels(0x30, layout)}, A=${countPixels(0x41, layout)}`);
}

const best = layouts.slice().sort((a, b) => scoreLayout(b) - scoreLayout(a))[0];
console.log(`\nSelected likely layout: ${best.name}`);
printGlyph('space', 0x20, best);
printGlyph("'0'", 0x30, best);
printGlyph("'A'", 0x41, best);

console.log('\nAdditional printable samples with selected layout:');
for (const code of [0x21, 0x2b, 0x2d, 0x31, 0x39, 0x42, 0x5a, 0x61, 0x7e]) {
  printGlyph(`'${String.fromCharCode(code)}'`, code, best);
}

console.log('\nPrintable ASCII density summary:');
for (let code = 0x20; code <= 0x7e; code += 16) {
  const line = [];
  for (let c = code; c <= 0x7e && c < code + 16; c++) {
    line.push(`${String.fromCharCode(c)}:${countPixels(c, best).toString().padStart(2, ' ')}`);
  }
  console.log(line.join('  '));
}
