import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join(process.cwd(), 'TI-84_Plus_CE', 'ROM.rom');
const START = 0x07f920;
const READ_LEN = 0x80;

const ramNames = new Map([
  [0xd005f8, 'OP1'],
  [0xd00603, 'OP2'],
  [0xd0060e, 'OP3'],
  [0xd00619, 'OP4'],
  [0xd00624, 'OP5'],
]);

const rstNames = new Map([
  [0x00, 'RST 00h'],
  [0x08, 'RST 08h'],
  [0x10, 'RST 10h'],
  [0x18, 'RST 18h'],
  [0x20, 'RST 20h'],
  [0x28, 'RST 28h'],
  [0x30, 'RST 30h'],
  [0x38, 'RST 38h'],
]);

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr24(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function word16(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function ramLabel(address) {
  const exact = ramNames.get(address);
  if (exact) return exact;

  for (const [base, name] of ramNames.entries()) {
    if (address > base && address < base + 11) {
      return `${name}+${hex(address - base)}`;
    }
  }

  if (address >= 0xd00000 && address <= 0xd3ffff) {
    return 'RAM';
  }

  return null;
}

function bytesText(bytes) {
  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function decodeCb(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) {
    return `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${r8[z]}`;
  }
  if (x === 1) return `BIT ${y},${r8[z]}`;
  if (x === 2) return `RES ${y},${r8[z]}`;
  return `SET ${y},${r8[z]}`;
}

function decodeEd(bytes, pc, off) {
  const op = bytes[off + 1];
  const common = new Map([
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x46, 'IM 0'],
    [0x47, 'LD I,A'],
    [0x4a, 'ADC HL,BC'],
    [0x4d, 'RETI'],
    [0x4f, 'LD R,A'],
    [0x56, 'IM 1'],
    [0x5e, 'IM 2'],
    [0x67, 'RRD'],
    [0x6f, 'RLD'],
    [0xa0, 'LDI'],
    [0xa1, 'CPI'],
    [0xa2, 'INI'],
    [0xa3, 'OUTI'],
    [0xa8, 'LDD'],
    [0xa9, 'CPD'],
    [0xaa, 'IND'],
    [0xab, 'OUTD'],
    [0xb0, 'LDIR'],
    [0xb1, 'CPIR'],
    [0xb2, 'INIR'],
    [0xb3, 'OTIR'],
    [0xb8, 'LDDR'],
    [0xb9, 'CPDR'],
    [0xba, 'INDR'],
    [0xbb, 'OTDR'],
  ]);

  if (common.has(op)) return { size: 2, text: common.get(op), notes: [] };

  if ((op & 0xc7) === 0x40) return { size: 2, text: `IN ${r8[(op >> 3) & 7]},(C)`, notes: [] };
  if ((op & 0xc7) === 0x41) return { size: 2, text: `OUT (C),${r8[(op >> 3) & 7]}`, notes: [] };
  if ((op & 0xcf) === 0x42) return { size: 2, text: `${op & 0x08 ? 'ADC' : 'SBC'} HL,${rp[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xcf) === 0x43) {
    const address = word16(bytes, off + 2);
    return { size: 4, text: `LD (${hex(address, 4)}),${rp[(op >> 4) & 3]}`, notes: [] };
  }
  if ((op & 0xcf) === 0x4b) {
    const address = word16(bytes, off + 2);
    return { size: 4, text: `LD ${rp[(op >> 4) & 3]},(${hex(address, 4)})`, notes: [] };
  }

  return { size: 2, text: `ED ${hex(op)}`, notes: ['unhandled ED opcode'] };
}

function decodeIndexed(bytes, pc, off, reg) {
  const op = bytes[off + 1];
  const rr = reg === 'IX' ? 'IX' : 'IY';
  const high = reg === 'IX' ? 'IXH' : 'IYH';
  const low = reg === 'IX' ? 'IXL' : 'IYL';
  const indexedR8 = ['B', 'C', 'D', 'E', high, low, `(${rr}+d)`, 'A'];

  if (op === 0xcb) {
    const disp = signed8(bytes[off + 2]);
    const cbOp = bytes[off + 3];
    const x = cbOp >> 6;
    const y = (cbOp >> 3) & 7;
    const z = cbOp & 7;
    const target = z === 6 ? `(${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})` : `${indexedR8[z]},(${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})`;
    const opName = x === 0 ? ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y] : x === 1 ? `BIT ${y}` : x === 2 ? `RES ${y}` : `SET ${y}`;
    return { size: 4, text: `${opName} ${target}`, notes: [`${rr} indexed bit operation`] };
  }

  if (op === 0x21) {
    const value = addr24(bytes, off + 2);
    return { size: 4, text: `LD ${rr},${hex(value, 6)}`, notes: [] };
  }
  if (op === 0x22 || op === 0x2a) {
    const address = addr24(bytes, off + 2);
    const label = ramLabel(address);
    return {
      size: 4,
      text: op === 0x22 ? `LD (${hex(address, 6)}),${rr}` : `LD ${rr},(${hex(address, 6)})`,
      notes: label ? [`RAM reference: ${label}`] : [],
    };
  }
  if (op === 0x23) return { size: 2, text: `INC ${rr}`, notes: [] };
  if (op === 0x2b) return { size: 2, text: `DEC ${rr}`, notes: [] };
  if (op === 0x34 || op === 0x35) {
    const disp = signed8(bytes[off + 2]);
    return { size: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})`, notes: [] };
  }
  if (op === 0x36) {
    const disp = signed8(bytes[off + 2]);
    return { size: 4, text: `LD (${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))}),${hex(bytes[off + 3])}`, notes: [] };
  }
  if (op === 0xe1) return { size: 2, text: `POP ${rr}`, notes: [] };
  if (op === 0xe3) return { size: 2, text: `EX (SP),${rr}`, notes: [] };
  if (op === 0xe5) return { size: 2, text: `PUSH ${rr}`, notes: [] };
  if (op === 0xe9) return { size: 2, text: `JP (${rr})`, notes: ['function boundary: indirect jump'] };
  if (op === 0xf9) return { size: 2, text: `LD SP,${rr}`, notes: [] };

  return { size: 2, text: `${reg === 'IX' ? 'DD' : 'FD'} ${hex(op)}`, notes: [`unhandled ${rr} opcode`] };
}

function decode(bytes, pc, off) {
  const op = bytes[off];

  if (op === 0xcb) return { size: 2, text: decodeCb(bytes[off + 1]), notes: [] };
  if (op === 0xed) return decodeEd(bytes, pc, off);
  if (op === 0xdd) return decodeIndexed(bytes, pc, off, 'IX');
  if (op === 0xfd) return decodeIndexed(bytes, pc, off, 'IY');

  if (op === 0x00) return { size: 1, text: 'NOP', notes: [] };
  if (op === 0x08) return { size: 1, text: "EX AF,AF'", notes: [] };
  if (op === 0x10) {
    const target = pc + 2 + signed8(bytes[off + 1]);
    return { size: 2, text: `DJNZ ${hex(target, 6)}`, notes: [`branch target: ${hex(target, 6)}`] };
  }
  if (op === 0x18 || (op >= 0x20 && op <= 0x38 && (op & 7) === 0)) {
    const target = pc + 2 + signed8(bytes[off + 1]);
    const cond = op === 0x18 ? '' : `${cc[(op >> 3) - 4]} `;
    const boundary = op === 0x18 ? ['function boundary candidate: unconditional JR'] : [];
    return { size: 2, text: `JR ${cond}${hex(target, 6)}`, notes: [`branch target: ${hex(target, 6)}`, ...boundary] };
  }
  if ((op & 0xcf) === 0x01) {
    const value = addr24(bytes, off + 1);
    return { size: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(value, 6)}`, notes: [] };
  }
  if ((op & 0xcf) === 0x03) return { size: 1, text: `INC ${rp[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xcf) === 0x0b) return { size: 1, text: `DEC ${rp[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xcf) === 0x09) return { size: 1, text: `ADD HL,${rp[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xc7) === 0x04) return { size: 1, text: `INC ${r8[(op >> 3) & 7]}`, notes: [] };
  if ((op & 0xc7) === 0x05) return { size: 1, text: `DEC ${r8[(op >> 3) & 7]}`, notes: [] };
  if ((op & 0xc7) === 0x06) return { size: 2, text: `LD ${r8[(op >> 3) & 7]},${hex(bytes[off + 1])}`, notes: [] };

  if (op === 0x07) return { size: 1, text: 'RLCA', notes: [] };
  if (op === 0x0f) return { size: 1, text: 'RRCA', notes: [] };
  if (op === 0x17) return { size: 1, text: 'RLA', notes: [] };
  if (op === 0x1f) return { size: 1, text: 'RRA', notes: [] };
  if (op === 0x27) return { size: 1, text: 'DAA', notes: [] };
  if (op === 0x2f) return { size: 1, text: 'CPL', notes: [] };
  if (op === 0x37) return { size: 1, text: 'SCF', notes: [] };
  if (op === 0x3f) return { size: 1, text: 'CCF', notes: [] };

  if (op === 0x02 || op === 0x12) return { size: 1, text: `LD (${op === 0x02 ? 'BC' : 'DE'}),A`, notes: [] };
  if (op === 0x0a || op === 0x1a) return { size: 1, text: `LD A,(${op === 0x0a ? 'BC' : 'DE'})`, notes: [] };
  if (op === 0x22 || op === 0x2a || op === 0x32 || op === 0x3a) {
    const address = addr24(bytes, off + 1);
    const label = ramLabel(address);
    const text = op === 0x22 ? `LD (${hex(address, 6)}),HL`
      : op === 0x2a ? `LD HL,(${hex(address, 6)})`
      : op === 0x32 ? `LD (${hex(address, 6)}),A`
      : `LD A,(${hex(address, 6)})`;
    return { size: 4, text, notes: label ? [`RAM reference: ${label}`] : [] };
  }

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { size: 1, text: 'HALT', notes: ['function boundary candidate: HALT'] };
    return { size: 1, text: `LD ${r8[(op >> 3) & 7]},${r8[op & 7]}`, notes: [] };
  }
  if (op >= 0x80 && op <= 0xbf) return { size: 1, text: `${alu[(op >> 3) & 7]} ${r8[op & 7]}`, notes: [] };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}`, notes: ['function boundary candidate: conditional RET'] };
  if ((op & 0xc7) === 0xc2) {
    const target = addr24(bytes, off + 1);
    return { size: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(target, 6)}`, notes: [`branch target: ${hex(target, 6)}`] };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = addr24(bytes, off + 1);
    return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}`, notes: [`CALL target: ${hex(target, 6)}`] };
  }
  if ((op & 0xcf) === 0xc1) return { size: 1, text: `POP ${rp2[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xcf) === 0xc5) return { size: 1, text: `PUSH ${rp2[(op >> 4) & 3]}`, notes: [] };
  if ((op & 0xc7) === 0xc6) return { size: 2, text: `${alu[(op >> 3) & 7]} ${hex(bytes[off + 1])}`, notes: [] };
  if ((op & 0xc7) === 0xc7) return { size: 1, text: rstNames.get(op & 0x38), notes: [] };

  if (op === 0xc3) {
    const target = addr24(bytes, off + 1);
    return { size: 4, text: `JP ${hex(target, 6)}`, notes: [`branch target: ${hex(target, 6)}`, 'function boundary: unconditional JP'] };
  }
  if (op === 0xc9) return { size: 1, text: 'RET', notes: ['function boundary: RET'] };
  if (op === 0xcd) {
    const target = addr24(bytes, off + 1);
    return { size: 4, text: `CALL ${hex(target, 6)}`, notes: [`CALL target: ${hex(target, 6)}`] };
  }
  if (op === 0xd3) return { size: 2, text: `OUT (${hex(bytes[off + 1])}),A`, notes: [] };
  if (op === 0xdb) return { size: 2, text: `IN A,(${hex(bytes[off + 1])})`, notes: [] };
  if (op === 0xe3) return { size: 1, text: 'EX (SP),HL', notes: [] };
  if (op === 0xe9) return { size: 1, text: 'JP (HL)', notes: ['function boundary: indirect jump'] };
  if (op === 0xeb) return { size: 1, text: 'EX DE,HL', notes: [] };
  if (op === 0xf3) return { size: 1, text: 'DI', notes: [] };
  if (op === 0xf9) return { size: 1, text: 'LD SP,HL', notes: [] };
  if (op === 0xfb) return { size: 1, text: 'EI', notes: [] };

  return { size: 1, text: `DB ${hex(op)}`, notes: ['unhandled opcode'] };
}

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);

console.log('=== Phase 536: decode syscall helper at 0x07F920 ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${hex(START, 6)}..${hex(START + bytes.length - 1, 6)} (${bytes.length} bytes)`);
console.log(`Raw: ${bytesText(bytes)}`);
console.log('');
console.log('Disassembly:');

const calls = [];
const ramRefs = [];
const boundaries = [];

for (let off = 0; off < bytes.length;) {
  const pc = START + off;
  const decoded = decode(bytes, pc, off);
  const instBytes = bytes.subarray(off, off + decoded.size);
  const annotation = decoded.notes.length ? ` ; ${decoded.notes.join('; ')}` : '';
  console.log(`${hex(pc, 6)}  ${bytesText(instBytes).padEnd(14)}  ${decoded.text}${annotation}`);

  for (const note of decoded.notes) {
    if (note.startsWith('CALL target:')) calls.push({ pc, target: note.slice('CALL target: '.length) });
    if (note.startsWith('RAM reference:')) ramRefs.push({ pc, label: note.slice('RAM reference: '.length) });
    if (note.includes('function boundary')) boundaries.push({ pc, text: decoded.text, note });
  }

  off += Math.max(decoded.size, 1);
}

console.log('');
console.log('Summary:');
console.log(`- CALL targets: ${calls.length ? calls.map((call) => `${hex(call.pc, 6)} -> ${call.target}`).join(', ') : 'none in decoded window'}`);
console.log(`- RAM references: ${ramRefs.length ? ramRefs.map((ref) => `${hex(ref.pc, 6)} -> ${ref.label}`).join(', ') : 'none in decoded window'}`);
console.log(`- Function boundary candidates: ${boundaries.length ? boundaries.map((boundary) => `${hex(boundary.pc, 6)} ${boundary.text} (${boundary.note})`).join(', ') : 'none in decoded window'}`);
console.log('- Purpose: syscall-chain helper immediately before 0x07F8B6 tail call; inspect RAM refs and calls above to classify its OP4/OP5 BCD preparation role.');
