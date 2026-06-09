import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function b(addr) { return rom[addr] ?? 0; }
function u16(addr) { return b(addr) | (b(addr + 1) << 8); }
function u24(addr) { return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16); }
function s8(v) { return v & 0x80 ? v - 0x100 : v; }
function hex(n, width = 6) { return `0x${(n >>> 0).toString(16).toUpperCase().padStart(width, '0')}`; }
function hexByte(n) { return (n & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
function pad(s, n) { return s.padEnd(n, ' '); }

const START = 0x0843B3;
const MAX_BYTES = 200;

const ramNames = new Map([
  [0xD005F8, 'descriptor buffer (9-byte search key area)'],
  [0xD005F9, 'search key type byte'],
  [0xD02510, 'expression buffer (65 bytes)'],
  [0xD02590, 'symbol table start'],
  [0xD0259D, 'symbol table current pointer'],
  [0xD02AD7, 'last-match buffer byte 0'],
  [0xD02AD8, 'last-match buffer byte 1'],
  [0xD02AD9, 'last-match buffer byte 2'],
]);

function annotateRam(addr) {
  if (ramNames.has(addr)) return ramNames.get(addr);
  if (addr >= 0xD005F8 && addr <= 0xD00600) return 'descriptor buffer range';
  if (addr >= 0xD02510 && addr <= 0xD02550) return 'expression buffer range';
  if (addr >= 0xD02590 && addr <= 0xD0259D) return 'symbol table pointer range';
  if (addr >= 0xD02AD7 && addr <= 0xD02AD9) return 'last-match buffer range';
  return null;
}

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const regs16 = ['BC', 'DE', 'HL', 'SP'];
const conditions = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const aluOps = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

function collectMeta(meta, out) {
  if (meta.call !== undefined) out.calls.add(meta.call);
  if (meta.jump !== undefined) out.jumps.add(meta.jump);
  if (meta.ram !== undefined) {
    const note = annotateRam(meta.ram);
    out.ramRefs.push({ addr: meta.ram, note, at: meta.at, text: meta.text });
  }
  if (meta.iy !== undefined) out.iyRefs.push({ off: meta.iy, at: meta.at, text: meta.text });
  if (meta.port !== undefined) out.ports.push({ port: meta.port, at: meta.at, text: meta.text });
}

function decodeIndex(addr, prefix, out) {
  const op = b(addr + 1);
  const ixiy = prefix === 0xDD ? 'IX' : 'IY';
  const mem = (disp) => `(${ixiy}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`;
  const meta = [];
  let len = 2;
  let text = `${ixiy}-prefix ${hex(op, 2)}`;

  if (op === 0x21) { len = 5; text = `LD ${ixiy},${hex(u24(addr + 2))}`; }
  else if (op === 0x22) { const a = u24(addr + 2); len = 5; text = `LD (${hex(a)}),${ixiy}`; meta.push({ ram: a }); }
  else if (op === 0x2A) { const a = u24(addr + 2); len = 5; text = `LD ${ixiy},(${hex(a)})`; meta.push({ ram: a }); }
  else if (op === 0x36) { const d = s8(b(addr + 2)); len = 4; text = `LD ${mem(d)},${hex(b(addr + 3), 2)}`; meta.push({ iy: d }); }
  else if ((op & 0xC7) === 0x46) { const d = s8(b(addr + 2)); len = 3; text = `LD ${regs8[(op >> 3) & 7]},${mem(d)}`; meta.push({ iy: d }); }
  else if ((op & 0xF8) === 0x70) { const d = s8(b(addr + 2)); len = 3; text = `LD ${mem(d)},${regs8[op & 7]}`; meta.push({ iy: d }); }
  else if ((op & 0xC7) === 0x86) { const d = s8(b(addr + 2)); len = 3; text = `${aluOps[(op >> 3) & 7]} ${mem(d)}`; meta.push({ iy: d }); }
  else if (op === 0xCB) {
    const d = s8(b(addr + 2));
    const cb = b(addr + 3);
    len = 4;
    const bit = (cb >> 3) & 7;
    const r = regs8[cb & 7];
    if ((cb & 0xC0) === 0x40) text = `BIT ${bit},${mem(d)}${r === '(HL)' ? '' : ` -> ${r}`}`;
    else if ((cb & 0xC0) === 0x80) text = `RES ${bit},${mem(d)}${r === '(HL)' ? '' : ` -> ${r}`}`;
    else if ((cb & 0xC0) === 0xC0) text = `SET ${bit},${mem(d)}${r === '(HL)' ? '' : ` -> ${r}`}`;
    else text = `CB ${hex(cb, 2)} ${mem(d)}`;
    meta.push({ iy: d });
  }
  if (prefix === 0xDD) meta.length = 0;
  return { len, text, meta };
}

function decodeED(addr) {
  const op = b(addr + 1);
  let len = 2;
  let text = `ED ${hex(op, 2)}`;
  const meta = [];
  if (op === 0xB0) text = 'LDIR';
  else if (op === 0xB8) text = 'LDDR';
  else if (op === 0xA0) text = 'LDI';
  else if (op === 0xA8) text = 'LDD';
  else if (op === 0x44) text = 'NEG';
  else if (op === 0x45 || op === 0x4D) text = 'RETN';
  else if (op === 0x57) text = 'LD A,I';
  else if (op === 0x5F) text = 'LD A,R';
  else if ((op & 0xC7) === 0x43) { const a = u24(addr + 2); len = 5; text = `LD (${hex(a)}),${regs16[(op >> 4) & 3]}`; meta.push({ ram: a }); }
  else if ((op & 0xC7) === 0x4B) { const a = u24(addr + 2); len = 5; text = `LD ${regs16[(op >> 4) & 3]},(${hex(a)})`; meta.push({ ram: a }); }
  else if ((op & 0xC7) === 0x40) text = `IN ${regs8[(op >> 3) & 7]},(C)`;
  else if ((op & 0xC7) === 0x41) text = `OUT (C),${regs8[(op >> 3) & 7]}`;
  return { len, text, meta };
}

function decode(addr, out) {
  const op = b(addr);
  let len = 1;
  let text = `DB ${hex(op, 2)}`;
  const meta = [];

  if (op === 0xDD || op === 0xFD) return decodeIndex(addr, op, out);
  if (op === 0xED) return decodeED(addr);

  if (op === 0x00) text = 'NOP';
  else if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) { len = 4; text = `LD ${regs16[op >> 4]},${hex(u24(addr + 1))}`; }
  else if (op === 0x02) text = 'LD (BC),A';
  else if (op === 0x0A) text = 'LD A,(BC)';
  else if (op === 0x12) text = 'LD (DE),A';
  else if (op === 0x1A) text = 'LD A,(DE)';
  else if (op === 0x22) { const a = u24(addr + 1); len = 4; text = `LD (${hex(a)}),HL`; meta.push({ ram: a }); }
  else if (op === 0x2A) { const a = u24(addr + 1); len = 4; text = `LD HL,(${hex(a)})`; meta.push({ ram: a }); }
  else if (op === 0x32) { const a = u24(addr + 1); len = 4; text = `LD (${hex(a)}),A`; meta.push({ ram: a }); }
  else if (op === 0x3A) { const a = u24(addr + 1); len = 4; text = `LD A,(${hex(a)})`; meta.push({ ram: a }); }
  else if ((op & 0xCF) === 0x03) text = `INC ${regs16[(op >> 4) & 3]}`;
  else if ((op & 0xCF) === 0x0B) text = `DEC ${regs16[(op >> 4) & 3]}`;
  else if ((op & 0xC7) === 0x04) text = `INC ${regs8[(op >> 3) & 7]}`;
  else if ((op & 0xC7) === 0x05) text = `DEC ${regs8[(op >> 3) & 7]}`;
  else if ((op & 0xC7) === 0x06) { len = 2; text = `LD ${regs8[(op >> 3) & 7]},${hex(b(addr + 1), 2)}`; }
  else if (op === 0x10) { const target = addr + 2 + s8(b(addr + 1)); len = 2; text = `DJNZ ${hex(target)}`; meta.push({ jump: target }); }
  else if (op === 0x18) { const target = addr + 2 + s8(b(addr + 1)); len = 2; text = `JR ${hex(target)}`; meta.push({ jump: target, unconditional: true }); }
  else if ([0x20, 0x28, 0x30, 0x38].includes(op)) { const target = addr + 2 + s8(b(addr + 1)); len = 2; text = `JR ${conditions[(op >> 3) & 3]},${hex(target)}`; meta.push({ jump: target }); }
  else if (op === 0x76) text = 'HALT';
  else if ((op & 0xC0) === 0x40) text = `LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}`;
  else if ((op & 0xC0) === 0x80) text = `${aluOps[(op >> 3) & 7]} ${regs8[op & 7]}`;
  else if (op === 0xC3) { const target = u24(addr + 1); len = 4; text = `JP ${hex(target)}`; meta.push({ jump: target, unconditional: true }); }
  else if ((op & 0xC7) === 0xC2) { const target = u24(addr + 1); len = 4; text = `JP ${conditions[(op >> 3) & 7]},${hex(target)}`; meta.push({ jump: target }); }
  else if (op === 0xC9) text = 'RET';
  else if ((op & 0xC7) === 0xC0) text = `RET ${conditions[(op >> 3) & 7]}`;
  else if (op === 0xCD) { const target = u24(addr + 1); len = 4; text = `CALL ${hex(target)}`; meta.push({ call: target }); }
  else if ((op & 0xC7) === 0xC4) { const target = u24(addr + 1); len = 4; text = `CALL ${conditions[(op >> 3) & 7]},${hex(target)}`; meta.push({ call: target }); }
  else if (op === 0xC6 || op === 0xCE || op === 0xD6 || op === 0xDE || op === 0xE6 || op === 0xEE || op === 0xF6 || op === 0xFE) { len = 2; text = `${aluOps[(op - 0xC6) >> 3]} ${hex(b(addr + 1), 2)}`; }
  else if (op === 0xD3) { len = 2; text = `OUT (${hex(b(addr + 1), 2)}),A`; meta.push({ port: b(addr + 1) }); }
  else if (op === 0xDB) { len = 2; text = `IN A,(${hex(b(addr + 1), 2)})`; meta.push({ port: b(addr + 1) }); }
  else if (op === 0xE9) { text = 'JP (HL)'; meta.push({ jump: -1, unconditional: true }); }
  else if (op === 0xEB) text = 'EX DE,HL';
  else if (op === 0xF3) text = 'DI';
  else if (op === 0xFB) text = 'EI';
  else if ((op & 0xCF) === 0xC5) text = `PUSH ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}`;
  else if ((op & 0xCF) === 0xC1) text = `POP ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}`;
  else if ((op & 0xC7) === 0xC7) text = `RST ${hex(op & 0x38, 2)}`;

  return { len, text, meta };
}

const found = {
  calls: new Set(),
  jumps: new Set(),
  ramRefs: [],
  iyRefs: [],
  ports: [],
};

console.log('Phase 586 static decode: CALL target 0x0843B3');
console.log(`ROM bytes: ${rom.length}`);
console.log(`Function start: ${hex(START)}`);
console.log('');
console.log(`${pad('Addr', 10)} ${pad('Bytes', 17)} Instruction`);
console.log(`${'-'.repeat(10)} ${'-'.repeat(17)} ${'-'.repeat(56)}`);

let pc = START;
const end = START + MAX_BYTES;
let boundary = 'max byte limit';

while (pc < end) {
  const ins = decode(pc, found);
  for (const m of ins.meta) collectMeta({ ...m, at: pc, text: ins.text }, found);
  const bytes = Array.from({ length: ins.len }, (_, i) => hexByte(b(pc + i))).join(' ');
  const annotations = [];
  for (const m of ins.meta) {
    if (m.ram !== undefined) {
      const note = annotateRam(m.ram);
      annotations.push(note ? `${hex(m.ram)} ${note}` : `${hex(m.ram)} RAM`);
    }
    if (m.iy !== undefined) annotations.push(`IY${m.iy < 0 ? '-' : '+'}${hex(Math.abs(m.iy), 2)}`);
    if (m.port !== undefined) annotations.push(`port ${hex(m.port, 2)}`);
  }
  console.log(`${pad(hex(pc), 10)} ${pad(bytes, 17)} ${ins.text}${annotations.length ? ` ; ${annotations.join('; ')}` : ''}`);
  pc += ins.len;
  if (ins.text === 'RET' || ins.text === 'RETN') { boundary = `${ins.text} at ${hex(pc - ins.len)}`; break; }
  if (ins.meta.some((m) => m.unconditional)) { boundary = `unconditional jump at ${hex(pc - ins.len)}`; break; }
}

console.log('');
console.log('Summary');
console.log(`- Boundary: ${boundary}`);
console.log(`- Decoded range: ${hex(START)}..${hex(pc - 1)} (${pc - START} bytes)`);
console.log(`- CALL targets: ${found.calls.size ? [...found.calls].map((x) => hex(x)).join(', ') : 'none'}`);
console.log(`- JP/JR targets: ${found.jumps.size ? [...found.jumps].map((x) => x < 0 ? 'indirect' : hex(x)).join(', ') : 'none'}`);
console.log(`- Port I/O: ${found.ports.length ? found.ports.map((p) => `${hex(p.at)} ${p.text}`).join('; ') : 'none'}`);
console.log('');

console.log('RAM references');
if (!found.ramRefs.length) {
  console.log('- none decoded in direct absolute operands');
} else {
  for (const r of found.ramRefs) console.log(`- ${hex(r.at)} ${r.text}: ${hex(r.addr)}${r.note ? ` (${r.note})` : ''}`);
}

console.log('');
console.log('IY indexed references');
if (!found.iyRefs.length) {
  console.log('- none');
} else {
  for (const r of found.iyRefs) console.log(`- ${hex(r.at)} ${r.text}: IY${r.off < 0 ? '-' : '+'}${hex(Math.abs(r.off), 2)}`);
}

console.log('');
console.log('Buffer interpretation hints');
const touchedDescriptor = found.ramRefs.some((r) => r.addr >= 0xD005F8 && r.addr <= 0xD00600);
const touchedExpression = found.ramRefs.some((r) => r.addr >= 0xD02510 && r.addr <= 0xD02550);
const touchedSymbol = found.ramRefs.some((r) => r.addr >= 0xD02590 && r.addr <= 0xD0259D);
const touchedLastMatch = found.ramRefs.some((r) => r.addr >= 0xD02AD7 && r.addr <= 0xD02AD9);
console.log(`- D005F8/D005F9 descriptor/search-key direct refs: ${touchedDescriptor ? 'yes' : 'no'}`);
console.log(`- D02510 expression-buffer direct refs: ${touchedExpression ? 'yes' : 'no'}`);
console.log(`- D02590/D0259D symbol-table pointer direct refs: ${touchedSymbol ? 'yes' : 'no'}`);
console.log(`- D02AD7-D02AD9 last-match direct refs: ${touchedLastMatch ? 'yes' : 'no'}`);
console.log('- Indirect effects through CALL targets require decoding the listed callees separately.');
