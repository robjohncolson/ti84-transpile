import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x080173;
const READ_LEN = 0x80;

const OP_REGS = new Map([
  [0xD005F8, 'OP1'],
  [0xD00603, 'OP2'],
  [0xD0060E, 'OP3'],
  [0xD00619, 'OP4'],
  [0xD00624, 'OP5'],
  [0xD0062F, 'OP6'],
]);

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function read24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function decodeCb(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) {
    return `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${r[z]}`;
  }
  if (x === 1) return `BIT ${y},${r[z]}`;
  if (x === 2) return `RES ${y},${r[z]}`;
  return `SET ${y},${r[z]}`;
}

function decodeEd(op) {
  const block = new Map([
    [0xA0, 'LDI'],
    [0xA1, 'CPI'],
    [0xA8, 'LDD'],
    [0xB0, 'LDIR'],
    [0xB1, 'CPIR'],
    [0xB8, 'LDDR'],
  ]);
  if (block.has(op)) return block.get(op);

  if ((op & 0xC7) === 0x43) return `LD (${hex(0, 6)}),${rp[(op >> 4) & 3]}`;
  if ((op & 0xC7) === 0x4B) return `LD ${rp[(op >> 4) & 3]},(${hex(0, 6)})`;
  if ((op & 0xC7) === 0x44) return 'NEG';
  if ((op & 0xC7) === 0x45) return 'RETN';
  if ((op & 0xC7) === 0x46) return 'IM 0';
  if ((op & 0xC7) === 0x47) return `LD ${['I', 'R', 'I', 'R'][(op >> 3) & 3]},A`;
  return `ED ${hex(op, 2)}`;
}

function decodeIndexed(bytes, offset, pc, index, adlBytes) {
  const op = bytes[offset + 1];
  if (op === 0xCB) {
    const disp = signed8(bytes[offset + 2]);
    const cb = bytes[offset + 3];
    const base = decodeCb(cb).replace('(HL)', `(${index}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`);
    return { size: 4, text: base, calls: [], refs: [] };
  }

  const dispOps = new Map([
    [0x34, 'INC'],
    [0x35, 'DEC'],
    [0x36, 'LD'],
  ]);
  if (dispOps.has(op)) {
    const disp = signed8(bytes[offset + 2]);
    const mem = `(${index}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`;
    if (op === 0x36) return { size: 4, text: `LD ${mem},${hex(bytes[offset + 3], 2)}`, calls: [], refs: [] };
    return { size: 3, text: `${dispOps.get(op)} ${mem}`, calls: [], refs: [] };
  }

  if (op === 0x21) return { size: 2 + adlBytes, text: `LD ${index},${hex(read24(bytes, offset + 2), 6)}`, calls: [], refs: [] };
  if (op === 0x22) {
    const addr = read24(bytes, offset + 2);
    return { size: 2 + adlBytes, text: `LD (${hex(addr, 6)}),${index}`, calls: [], refs: [addr] };
  }
  if (op === 0x2A) {
    const addr = read24(bytes, offset + 2);
    return { size: 2 + adlBytes, text: `LD ${index},(${hex(addr, 6)})`, calls: [], refs: [addr] };
  }
  if (op === 0xE5) return { size: 2, text: `PUSH ${index}`, calls: [], refs: [] };
  if (op === 0xE1) return { size: 2, text: `POP ${index}`, calls: [], refs: [] };
  if (op === 0xE9) return { size: 2, text: `JP (${index})`, calls: [], refs: [] };
  if (op === 0xF9) return { size: 2, text: `LD SP,${index}`, calls: [], refs: [] };

  return { size: 2, text: `${index === 'IX' ? 'DD' : 'FD'} ${hex(op, 2)}`, calls: [], refs: [] };
}

function decodeOne(bytes, offset, pc) {
  let prefix = '';
  let adlBytes = 3;
  let opOffset = offset;
  if (bytes[opOffset] === 0x52 || bytes[opOffset] === 0x40) {
    prefix = bytes[opOffset] === 0x52 ? '.SIL ' : '.SIS ';
    adlBytes = 2;
    opOffset++;
  }

  const op = bytes[opOffset];
  const base = opOffset - offset;
  const calls = [];
  const refs = [];
  const imm24 = () => read24(bytes, opOffset + 1);
  const immN = () => adlBytes === 3 ? read24(bytes, opOffset + 1) : bytes[opOffset + 1] | (bytes[opOffset + 2] << 8);
  const done = (size, text) => ({ size: base + size, text: prefix + text, calls, refs });

  if (op === 0xDD || op === 0xFD) {
    const out = decodeIndexed(bytes, opOffset, pc + base, op === 0xDD ? 'IX' : 'IY', adlBytes);
    out.size += base;
    out.text = prefix + out.text;
    return out;
  }
  if (op === 0xCB) return done(2, decodeCb(bytes[opOffset + 1]));
  if (op === 0xED) return done(2, decodeEd(bytes[opOffset + 1]));

  if (op === 0x00) return done(1, 'NOP');
  if (op === 0x76) return done(1, 'HALT');
  if (op === 0xC9) return done(1, 'RET');
  if (op === 0xD9) return done(1, 'EXX');
  if (op === 0x08) return done(1, 'EX AF,AF\'');
  if (op === 0xEB) return done(1, 'EX DE,HL');
  if (op === 0xE3) return done(1, 'EX (SP),HL');
  if (op === 0xF3) return done(1, 'DI');
  if (op === 0xFB) return done(1, 'EI');
  if (op === 0x2F) return done(1, 'CPL');
  if (op === 0x37) return done(1, 'SCF');
  if (op === 0x3F) return done(1, 'CCF');

  if ((op & 0xC7) === 0x04) return done(1, `INC ${r[(op >> 3) & 7]}`);
  if ((op & 0xC7) === 0x05) return done(1, `DEC ${r[(op >> 3) & 7]}`);
  if ((op & 0xC7) === 0x06) return done(2, `LD ${r[(op >> 3) & 7]},${hex(bytes[opOffset + 1], 2)}`);
  if ((op & 0xC0) === 0x40) return done(1, `LD ${r[(op >> 3) & 7]},${r[op & 7]}`);
  if ((op & 0xCF) === 0x01) return done(1 + adlBytes, `LD ${rp[(op >> 4) & 3]},${hex(immN(), adlBytes * 2)}`);
  if ((op & 0xCF) === 0x03) return done(1, `INC ${rp[(op >> 4) & 3]}`);
  if ((op & 0xCF) === 0x0B) return done(1, `DEC ${rp[(op >> 4) & 3]}`);
  if ((op & 0xCF) === 0x09) return done(1, `ADD HL,${rp[(op >> 4) & 3]}`);
  if ((op & 0xC7) === 0x80) return done(1, `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} ${r[op & 7]}`);

  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) {
    return done(2, `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} ${hex(bytes[opOffset + 1], 2)}`);
  }

  if (op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = pc + base + 2 + signed8(bytes[opOffset + 1]);
    const cond = op === 0x18 ? '' : ` ${['NZ', 'Z', 'NC', 'C'][(op >> 3) & 3]},`;
    return done(2, `JR${cond}${hex(target, 6)}`);
  }

  if (op === 0xCD) {
    const target = imm24();
    calls.push(target);
    return done(4, `CALL ${hex(target, 6)}`);
  }
  if ((op & 0xC7) === 0xC4) {
    const target = imm24();
    calls.push(target);
    return done(4, `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}`);
  }
  if (op === 0xC3) return done(4, `JP ${hex(imm24(), 6)}`);
  if ((op & 0xC7) === 0xC2) return done(4, `JP ${cc[(op >> 3) & 7]},${hex(imm24(), 6)}`);

  if (op === 0x3A) {
    const addr = imm24();
    refs.push(addr);
    return done(4, `LD A,(${hex(addr, 6)})`);
  }
  if (op === 0x32) {
    const addr = imm24();
    refs.push(addr);
    return done(4, `LD (${hex(addr, 6)}),A`);
  }
  if (op === 0x2A) {
    const addr = imm24();
    refs.push(addr);
    return done(4, `LD HL,(${hex(addr, 6)})`);
  }
  if (op === 0x22) {
    const addr = imm24();
    refs.push(addr);
    return done(4, `LD (${hex(addr, 6)}),HL`);
  }

  if (op === 0x10) return done(2, `DJNZ ${hex(pc + base + 2 + signed8(bytes[opOffset + 1]), 6)}`);
  if (op === 0xE9) return done(1, 'JP (HL)');
  if (op === 0xC5 || op === 0xD5 || op === 0xE5 || op === 0xF5) return done(1, `PUSH ${rp2[(op >> 4) & 3]}`);
  if (op === 0xC1 || op === 0xD1 || op === 0xE1 || op === 0xF1) return done(1, `POP ${rp2[(op >> 4) & 3]}`);
  if ((op & 0xC7) === 0xC7) return done(1, `RST ${hex(op & 0x38, 2)}`);

  return done(1, `DB ${hex(op, 2)}`);
}

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);
const lines = [];
const calls = new Set();
const refs = new Set();

let offset = 0;
while (offset < bytes.length) {
  const pc = START + offset;
  const decoded = decodeOne(bytes, offset, pc);
  const raw = [...bytes.subarray(offset, offset + decoded.size)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  lines.push(`${hex(pc, 6)}  ${raw.padEnd(15)}  ${decoded.text}`);
  decoded.calls.forEach((target) => calls.add(target));
  decoded.refs.forEach((target) => refs.add(target));
  offset += decoded.size;
  if (decoded.text.endsWith('RET')) break;
}

const opRefs = [...refs].filter((addr) => OP_REGS.has(addr));

console.log('Phase 535 decode: 0x080173 setup routine');
console.log(`Read window: ${hex(START, 6)}..${hex(START + READ_LEN - 1, 6)} (${READ_LEN} bytes)`);
console.log(`Decoded function size: ${hex(offset, 4)} (${offset} bytes), end=${hex(START + offset - 1, 6)}`);
console.log('');
console.log(lines.join('\n'));
console.log('');
console.log(`CALL targets: ${[...calls].map((target) => hex(target, 6)).join(', ') || '(none)'}`);
console.log(`OP register references: ${opRefs.map((addr) => `${OP_REGS.get(addr)}=${hex(addr, 6)}`).join(', ') || '(none found by direct absolute access)'}`);
console.log('');
console.log('Purpose hypothesis: setup helper for BCD restoring division. Review the decoded copy/register setup sequence above; direct OP references and CALL targets identify whether it initializes OP registers, copies operands, or delegates setup to shared utilities before the division loop begins.');
