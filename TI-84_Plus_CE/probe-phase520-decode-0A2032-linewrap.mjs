import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const IY_BASE = 0xD00080;
const RAM_START = 0xD00000;
const RAM_END = 0xD3FFFF;
const VRAM_START = 0xD40000;

const watched = new Map([
  [0xD00595, 'curRow'],
  [0xD00596, 'curCol'],
  [0xD02504, 'D02504'],
  [0xD02505, 'D02505'],
]);

const functions = [
  { name: 'lineWrapScroll_0A2032', addr: 0x0A2032, len: 300 },
  { name: 'initPath_0A2013', addr: 0x0A2013, len: 100 },
  { name: 'initPath_0A201B', addr: 0x0A201B, len: 100 },
  { name: 'cursorStateCheck_0A1F48', addr: 0x0A1F48, len: 100 },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function word(addr) {
  return byte(addr) | (byte(addr + 1) << 8);
}

function addr24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function signed8(v) {
  return v & 0x80 ? v - 0x100 : v;
}

function signed16(v) {
  return v & 0x8000 ? v - 0x10000 : v;
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => byte(addr + i));
}

function bytesText(addr, len) {
  return bytesAt(addr, len).map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function classifyAddress(value) {
  const notes = [];
  if (value >= RAM_START && value <= RAM_END) {
    notes.push(`RAM ${hex(value)}${watched.has(value) ? ` (${watched.get(value)})` : ''}`);
  }
  if (value >= VRAM_START) notes.push(`VRAM ${hex(value)}`);
  return notes;
}

function iyAddress(disp) {
  return (IY_BASE + signed8(disp)) & 0xFFFFFF;
}

function make(addr, len, text, meta = {}) {
  return { addr, len, text, bytes: bytesText(addr, len), ...meta };
}

function decodeCB(addr, prefixLen, ixiy) {
  const op = byte(addr + prefixLen);
  const cbNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (ixiy) {
    const disp = byte(addr + prefixLen);
    const cb = byte(addr + prefixLen + 1);
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const target = iyAddress(disp);
    if (cb < 0x40) return make(addr, prefixLen + 2, `${cbNames[(cb >> 3) & 7]} (${ixiy}+${signed8(disp)})`, { iy: [{ disp: signed8(disp), target }], ram: classifyAddress(target) });
    if (cb < 0x80) return make(addr, prefixLen + 2, `BIT ${y},(${ixiy}+${signed8(disp)})`, { iy: [{ disp: signed8(disp), target }], ram: classifyAddress(target) });
    if (cb < 0xC0) return make(addr, prefixLen + 2, `RES ${y},(${ixiy}+${signed8(disp)})`, { iy: [{ disp: signed8(disp), target }], ram: classifyAddress(target) });
    return make(addr, prefixLen + 2, `SET ${y},(${ixiy}+${signed8(disp)})`, { iy: [{ disp: signed8(disp), target }], ram: classifyAddress(target) });
  }
  if (op < 0x40) return make(addr, prefixLen + 1, `${cbNames[(op >> 3) & 7]} ${regs[op & 7]}`);
  if (op < 0x80) return make(addr, prefixLen + 1, `BIT ${(op >> 3) & 7},${regs[op & 7]}`);
  if (op < 0xC0) return make(addr, prefixLen + 1, `RES ${(op >> 3) & 7},${regs[op & 7]}`);
  return make(addr, prefixLen + 1, `SET ${(op >> 3) & 7},${regs[op & 7]}`);
}

function decodeED(addr, prefixLen) {
  const op = byte(addr + prefixLen);
  const block = {
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA2: 'INI',
    0xA3: 'OUTI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xAA: 'IND',
    0xAB: 'OUTD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB2: 'INIR',
    0xB3: 'OTIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
    0xBA: 'INDR',
    0xBB: 'OTDR',
  };
  if (block[op]) return make(addr, prefixLen + 1, block[op], { bulk: block[op] });
  return make(addr, prefixLen + 1, `ED ${op.toString(16).toUpperCase().padStart(2, '0')}`);
}

function decode(addr) {
  let prefixLen = 0;
  let ixiy = null;
  let op = byte(addr);
  if (op === 0xDD || op === 0xFD) {
    ixiy = op === 0xDD ? 'IX' : 'IY';
    prefixLen = 1;
    op = byte(addr + 1);
  }
  if (op === 0xCB) return decodeCB(addr, prefixLen + 1, ixiy);
  if (op === 0xED) return decodeED(addr, prefixLen + 1);

  const p = addr + prefixLen;
  const reg = ixiy ?? 'HL';
  const rr = ixiy ?? 'HL';
  const r8 = ['B', 'C', 'D', 'E', ixiy ? `${ixiy}H` : 'H', ixiy ? `${ixiy}L` : 'L', '(HL)', 'A'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const len0 = prefixLen + 1;
  const imm8 = byte(p + 1);
  const imm16 = word(p + 1);
  const imm24 = addr24(p + 1);

  const mem24 = (text, access) => make(addr, prefixLen + 4, text, { [access]: classifyAddress(imm24), target: imm24 });
  const jump24 = (text) => make(addr, prefixLen + 4, text, { branch: imm24 });
  const jr = (text) => {
    const target = (p + 2 + signed8(imm8)) & 0xFFFFFF;
    return make(addr, prefixLen + 2, `${text} ${hex(target)}`, { branch: target });
  };

  if (op >= 0x40 && op <= 0x7F) {
    if (op === 0x76) return make(addr, len0, 'HALT');
    const dst = r8[(op >> 3) & 7];
    const src = r8[op & 7];
    return make(addr, len0, `LD ${dst},${src}`);
  }
  if (op >= 0x80 && op <= 0xBF) return make(addr, len0, `${alu[(op >> 3) & 7]} ${r8[op & 7]}`);
  if (op >= 0xC0 && (op & 0x07) === 0x00) return make(addr, len0, `RET ${cc[(op >> 3) & 7]}`);
  if (op >= 0xC2 && (op & 0x07) === 0x02) return jump24(`JP ${cc[(op >> 3) & 7]},${hex(imm24)}`);
  if (op >= 0xC4 && (op & 0x07) === 0x04) return jump24(`CALL ${cc[(op >> 3) & 7]},${hex(imm24)}`);

  switch (op) {
    case 0x00: return make(addr, len0, 'NOP');
    case 0x01: return make(addr, prefixLen + 3, `LD BC,${hex(imm16, 4)}`);
    case 0x02: return mem24(`LD (${hex(imm24)}),A`, 'write');
    case 0x03: return make(addr, len0, 'INC BC');
    case 0x04: return make(addr, len0, 'INC B');
    case 0x05: return make(addr, len0, 'DEC B');
    case 0x06: return make(addr, prefixLen + 2, `LD B,${hex(imm8, 2)}`);
    case 0x07: return make(addr, len0, 'RLCA');
    case 0x08: return make(addr, len0, 'EX AF,AF\'');
    case 0x09: return make(addr, len0, `ADD ${rr},BC`);
    case 0x0A: return mem24(`LD A,(${hex(imm24)})`, 'read');
    case 0x0B: return make(addr, len0, 'DEC BC');
    case 0x0C: return make(addr, len0, 'INC C');
    case 0x0D: return make(addr, len0, 'DEC C');
    case 0x0E: return make(addr, prefixLen + 2, `LD C,${hex(imm8, 2)}`);
    case 0x0F: return make(addr, len0, 'RRCA');
    case 0x10: return jr('DJNZ');
    case 0x11: return make(addr, prefixLen + 3, `LD DE,${hex(imm16, 4)}`);
    case 0x12: return mem24(`LD (${hex(imm24)}),HL`, 'write');
    case 0x13: return make(addr, len0, 'INC DE');
    case 0x14: return make(addr, len0, 'INC D');
    case 0x15: return make(addr, len0, 'DEC D');
    case 0x16: return make(addr, prefixLen + 2, `LD D,${hex(imm8, 2)}`);
    case 0x17: return make(addr, len0, 'RLA');
    case 0x18: return jr('JR');
    case 0x19: return make(addr, len0, `ADD ${rr},DE`);
    case 0x1A: return mem24(`LD HL,(${hex(imm24)})`, 'read');
    case 0x1B: return make(addr, len0, 'DEC DE');
    case 0x1C: return make(addr, len0, 'INC E');
    case 0x1D: return make(addr, len0, 'DEC E');
    case 0x1E: return make(addr, prefixLen + 2, `LD E,${hex(imm8, 2)}`);
    case 0x1F: return make(addr, len0, 'RRA');
    case 0x20: return jr('JR NZ,');
    case 0x21: return make(addr, prefixLen + 4, `LD ${reg},${hex(imm24)}`, { target: imm24, read: classifyAddress(imm24) });
    case 0x22: return mem24(`LD (${hex(imm24)}),${reg}`, 'write');
    case 0x23: return make(addr, len0, `INC ${rr}`);
    case 0x24: return make(addr, len0, `INC ${ixiy ? `${ixiy}H` : 'H'}`);
    case 0x25: return make(addr, len0, `DEC ${ixiy ? `${ixiy}H` : 'H'}`);
    case 0x26: return make(addr, prefixLen + 2, `LD ${ixiy ? `${ixiy}H` : 'H'},${hex(imm8, 2)}`);
    case 0x27: return make(addr, len0, 'DAA');
    case 0x28: return jr('JR Z,');
    case 0x29: return make(addr, len0, `ADD ${rr},${rr}`);
    case 0x2A: return mem24(`LD ${reg},(${hex(imm24)})`, 'read');
    case 0x2B: return make(addr, len0, `DEC ${rr}`);
    case 0x2C: return make(addr, len0, `INC ${ixiy ? `${ixiy}L` : 'L'}`);
    case 0x2D: return make(addr, len0, `DEC ${ixiy ? `${ixiy}L` : 'L'}`);
    case 0x2E: return make(addr, prefixLen + 2, `LD ${ixiy ? `${ixiy}L` : 'L'},${hex(imm8, 2)}`);
    case 0x2F: return make(addr, len0, 'CPL');
    case 0x30: return jr('JR NC,');
    case 0x31: return make(addr, prefixLen + 4, `LD SP,${hex(imm24)}`, { target: imm24 });
    case 0x32: return mem24(`LD (${hex(imm24)}),A`, 'write');
    case 0x33: return make(addr, len0, 'INC SP');
    case 0x34: {
      if (!ixiy) return make(addr, len0, 'INC (HL)');
      const target = iyAddress(imm8);
      return make(addr, prefixLen + 2, `INC (${ixiy}+${signed8(imm8)})`, { iy: [{ disp: signed8(imm8), target }], write: classifyAddress(target) });
    }
    case 0x35: {
      if (!ixiy) return make(addr, len0, 'DEC (HL)');
      const target = iyAddress(imm8);
      return make(addr, prefixLen + 2, `DEC (${ixiy}+${signed8(imm8)})`, { iy: [{ disp: signed8(imm8), target }], write: classifyAddress(target) });
    }
    case 0x36: {
      if (!ixiy) return make(addr, prefixLen + 2, `LD (HL),${hex(imm8, 2)}`);
      const target = iyAddress(imm8);
      return make(addr, prefixLen + 3, `LD (${ixiy}+${signed8(imm8)}),${hex(byte(p + 2), 2)}`, { iy: [{ disp: signed8(imm8), target }], write: classifyAddress(target) });
    }
    case 0x37: return make(addr, len0, 'SCF');
    case 0x38: return jr('JR C,');
    case 0x39: return make(addr, len0, `ADD ${rr},SP`);
    case 0x3A: return mem24(`LD A,(${hex(imm24)})`, 'read');
    case 0x3B: return make(addr, len0, 'DEC SP');
    case 0x3C: return make(addr, len0, 'INC A');
    case 0x3D: return make(addr, len0, 'DEC A');
    case 0x3E: return make(addr, prefixLen + 2, `LD A,${hex(imm8, 2)}`);
    case 0x3F: return make(addr, len0, 'CCF');
    case 0xC1: return make(addr, len0, 'POP BC');
    case 0xC3: return jump24(`JP ${hex(imm24)}`);
    case 0xC5: return make(addr, len0, 'PUSH BC');
    case 0xC6: return make(addr, prefixLen + 2, `ADD A,${hex(imm8, 2)}`);
    case 0xC9: return make(addr, len0, 'RET');
    case 0xCD: return jump24(`CALL ${hex(imm24)}`);
    case 0xD1: return make(addr, len0, 'POP DE');
    case 0xD3: return make(addr, prefixLen + 2, `OUT (${hex(imm8, 2)}),A`);
    case 0xD5: return make(addr, len0, 'PUSH DE');
    case 0xD6: return make(addr, prefixLen + 2, `SUB ${hex(imm8, 2)}`);
    case 0xD9: return make(addr, len0, 'EXX');
    case 0xDB: return make(addr, prefixLen + 2, `IN A,(${hex(imm8, 2)})`);
    case 0xE1: return make(addr, len0, `POP ${reg}`);
    case 0xE3: return make(addr, len0, `EX (SP),${reg}`);
    case 0xE5: return make(addr, len0, `PUSH ${reg}`);
    case 0xE6: return make(addr, prefixLen + 2, `AND ${hex(imm8, 2)}`);
    case 0xE9: return make(addr, len0, `JP (${reg})`);
    case 0xEB: return make(addr, len0, 'EX DE,HL');
    case 0xF1: return make(addr, len0, 'POP AF');
    case 0xF3: return make(addr, len0, 'DI');
    case 0xF5: return make(addr, len0, 'PUSH AF');
    case 0xF6: return make(addr, prefixLen + 2, `OR ${hex(imm8, 2)}`);
    case 0xF9: return make(addr, len0, `LD SP,${reg}`);
    case 0xFB: return make(addr, len0, 'EI');
    case 0xFE: return make(addr, prefixLen + 2, `CP ${hex(imm8, 2)}`);
    default: return make(addr, len0, `DB ${hex(op, 2)}`);
  }
}

function renderMeta(ins) {
  const notes = [];
  if (ins.branch !== undefined) notes.push(`target=${hex(ins.branch)}`);
  for (const key of ['read', 'write', 'ram']) {
    if (ins[key]?.length) notes.push(`${key}=${ins[key].join(', ')}`);
  }
  if (ins.iy?.length) notes.push(`IY=${ins.iy.map((x) => `${x.disp >= 0 ? '+' : ''}${x.disp}->${hex(x.target)}${watched.has(x.target) ? ` ${watched.get(x.target)}` : ''}`).join(', ')}`);
  if (ins.bulk) notes.push(`bulk=${ins.bulk}`);
  if (ins.target !== undefined) {
    const addressNotes = classifyAddress(ins.target);
    if (addressNotes.length) notes.push(`addr=${addressNotes.join(', ')}`);
  }
  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function collectSummary(instructions) {
  const calls = [];
  const branches = [];
  const reads = new Set();
  const writes = new Set();
  const iy = [];
  const bulk = [];
  const vram = new Set();

  for (const ins of instructions) {
    if (ins.branch !== undefined) {
      branches.push(`${hex(ins.addr)} ${ins.text}`);
      if (ins.text.startsWith('CALL')) calls.push(ins.branch);
    }
    for (const item of ins.read ?? []) reads.add(item);
    for (const item of ins.write ?? []) writes.add(item);
    for (const item of ins.ram ?? []) reads.add(item);
    for (const item of ins.iy ?? []) iy.push(`${hex(ins.addr)} ${ins.text} => ${hex(item.target)}`);
    if (ins.bulk) bulk.push(`${hex(ins.addr)} ${ins.bulk}`);
    for (const value of [ins.target, ins.branch]) {
      if (value !== undefined && value >= VRAM_START) vram.add(hex(value));
    }
  }

  return { calls, branches, reads, writes, iy, bulk, vram };
}

function disassembleFunction(fn) {
  console.log(`\n=== ${fn.name} @ ${hex(fn.addr)} (${fn.len} bytes) ===`);
  const end = fn.addr + fn.len;
  const instructions = [];
  for (let pc = fn.addr; pc < end;) {
    const ins = decode(pc);
    instructions.push(ins);
    console.log(`${hex(ins.addr)}  ${ins.bytes.padEnd(14)} ${ins.text}${renderMeta(ins)}`);
    pc += Math.max(ins.len, 1);
  }

  const summary = collectSummary(instructions);
  console.log(`\n--- ${fn.name} decoded facts ---`);
  console.log(`CALL targets: ${[...new Set(summary.calls)].map((x) => hex(x)).join(', ') || '(none)'}`);
  console.log(`JP/JR/CALL targets: ${summary.branches.join(' | ') || '(none)'}`);
  console.log(`RAM reads: ${[...summary.reads].join(', ') || '(none detected)'}`);
  console.log(`RAM writes: ${[...summary.writes].join(', ') || '(none detected)'}`);
  console.log(`IY-relative ops: ${summary.iy.join(' | ') || '(none detected)'}`);
  console.log(`VRAM address patterns: ${[...summary.vram].join(', ') || '(none detected)'}`);
  console.log(`LDIR/LDDR bulk copies: ${summary.bulk.join(' | ') || '(none detected)'}`);
  return { fn, instructions, summary };
}

function inferLinewrap(result) {
  const allText = result.instructions.map((ins) => ins.text).join('\n');
  const facts = [];
  const accesses = new Set([...result.summary.reads, ...result.summary.writes]);
  for (const item of accesses) {
    if (item.includes('D00595')) facts.push('touches D00595/curRow');
    if (item.includes('D00596')) facts.push('touches D00596/curCol');
    if (item.includes('D02504')) facts.push('touches D02504');
    if (item.includes('D02505')) facts.push('touches D02505');
  }
  if (result.summary.bulk.length) facts.push('uses block copy instruction(s), likely scroll/copy movement');
  if (/LD \(0xD00596\),A|LD \(IY\+/.test(allText)) facts.push('appears to reset/update cursor column');
  if (/INC A|INC \(.*D00595|LD \(0xD00595\),A/.test(allText)) facts.push('appears to increment/update cursor row');
  if (result.summary.calls.length) facts.push(`calls ${[...new Set(result.summary.calls)].map((x) => hex(x)).join(', ')}`);
  return facts.length ? facts : ['No high-confidence wrap/scroll inference from decoded static patterns alone.'];
}

console.log('Probe phase 520: decode 0x0A2032 line wrap/scroll function');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('ADL-mode decode: CALL/JP/absolute LD operands use 24-bit little-endian addresses.');
console.log(`IY base assumed: ${hex(IY_BASE)}`);
console.log(`Watched RAM: ${[...watched].map(([addr, name]) => `${hex(addr)}=${name}`).join(', ')}`);

const results = functions.map(disassembleFunction);
const linewrap = results[0];

console.log('\n=== SUMMARY: 0x0A2032 line wrap/scroll ===');
console.log(`Decoded bytes: ${linewrap.fn.len} starting at ${hex(linewrap.fn.addr)}`);
console.log(`CALL targets: ${[...new Set(linewrap.summary.calls)].map((x) => hex(x)).join(', ') || '(none)'}`);
console.log(`RAM reads: ${[...linewrap.summary.reads].join(', ') || '(none detected)'}`);
console.log(`RAM writes: ${[...linewrap.summary.writes].join(', ') || '(none detected)'}`);
console.log(`IY-relative ops: ${linewrap.summary.iy.join(' | ') || '(none detected)'}`);
console.log(`VRAM patterns: ${[...linewrap.summary.vram].join(', ') || '(none detected)'}`);
console.log(`Bulk copies: ${linewrap.summary.bulk.join(' | ') || '(none detected)'}`);
console.log('Static interpretation:');
for (const fact of inferLinewrap(linewrap)) console.log(`- ${fact}`);
console.log('- Session 519 calls this function after curCol at D00596 reaches 0x1A, so accesses to D00596 indicate wrap handling and accesses to D00595/D02505 indicate row advance or bottom-row scroll decisions.');
