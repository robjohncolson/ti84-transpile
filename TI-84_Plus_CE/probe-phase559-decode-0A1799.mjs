import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x0A1799;
const MAX_BYTES = 256;
const FONT_TABLE = 0x07BF3E;
const FONT_BASE_OFFSET = 0x0380;

const ramNames = new Map([
  [0xD00080, 'IY system flags base'],
  [0xD000C6, 'BPP mode flags (bit 2)'],
  [0xD0059C, 'computed framebuffer address'],
  [0xD008D5, 'primary Y coordinate'],
  [0xD0231A, 'cursor position'],
  [0xD09466, 'double-buffer pointer/state A'],
  [0xD0EA1F, 'double-buffer pointer/state B'],
]);

const knownCalls = new Map([
  [0x07B75F, 'known 4BPP glyph renderer'],
  [0x0A1B14, 'mono/4BPP/16BPP routing region'],
  [0x0A1B1C, 'BPP routing dispatch'],
]);

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const cond = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

const hits = {
  calls: [],
  jumps: [],
  ram: new Map(),
  immediates: [],
  bitTests: [],
  fontRefs: [],
  pixelHints: [],
  terminator: null,
};

function hex(value, width = 2) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function b(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function noteAddress(addr, kind) {
  if (addr >= 0xD00000 && addr <= 0xD3FFFF) {
    const cur = hits.ram.get(addr) ?? { count: 0, kinds: new Set() };
    cur.count++;
    cur.kinds.add(kind);
    hits.ram.set(addr, cur);
  }
  if (addr === FONT_TABLE || addr === FONT_TABLE + FONT_BASE_OFFSET || Math.abs(addr - FONT_TABLE) < 0x1000) {
    hits.fontRefs.push({ addr, kind });
  }
  if (addr === 0xD0059C || addr >= 0xD40000) {
    hits.pixelHints.push({ addr, kind });
  }
}

function annotate(text, args = {}) {
  const comments = [];
  const allText = `${text} ${Object.values(args).join(' ')}`;

  if (args.imm24 !== undefined) {
    noteAddress(args.imm24, text);
    if (ramNames.has(args.imm24)) comments.push(ramNames.get(args.imm24));
    if (knownCalls.has(args.imm24)) comments.push(knownCalls.get(args.imm24));
    if (args.imm24 === FONT_TABLE) comments.push('font table base');
    if (args.imm24 === FONT_TABLE + FONT_BASE_OFFSET) comments.push('font glyph data base offset');
    if (args.imm24 >= 0xD40000) comments.push('VRAM/framebuffer range');
    hits.immediates.push(args.imm24);
  }

  if (args.disp !== undefined) {
    comments.push(`indexed displacement ${args.disp >= 0 ? '+' : ''}${args.disp}`);
  }

  if (/CALL|JP|JR/.test(text)) {
    if (args.imm24 !== undefined && knownCalls.has(args.imm24)) {
      comments.push(`dispatches to ${knownCalls.get(args.imm24)}`);
    }
  }

  if (/BIT 2/.test(allText) && (/D000C6|IY/.test(allText))) {
    comments.push('tests BPP mode flag bit 2');
    hits.bitTests.push(text);
  }

  if (/LDI|LDIR|CPI|CPIR|OUT|IN/.test(text)) {
    comments.push('block or port operation; possible pixel/font copy support');
  }

  return comments.length ? ' ; ' + comments.join('; ') : '';
}

function decodeCB(pc, prefix = '') {
  const op = b(pc + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix ? `(${prefix})` : reg8[z];
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  let text;
  if (x === 0) text = `${groups[y]} ${target}`;
  else if (x === 1) text = `BIT ${y}, ${target}`;
  else if (x === 2) text = `RES ${y}, ${target}`;
  else text = `SET ${y}, ${target}`;
  return { len: 2, text, comment: annotate(text) };
}

function decodeIndexed(pc, prefixByte) {
  const ix = prefixByte === 0xDD ? 'IX' : 'IY';
  const op = b(pc + 1);
  if (op === 0xCB) {
    const disp = signed8(b(pc + 2));
    const cb = b(pc + 3);
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const target = `(${ix}${disp >= 0 ? '+' : ''}${disp})`;
    let text;
    if (x === 0) text = `${groups[y]} ${target}`;
    else if (x === 1) text = `BIT ${y}, ${target}`;
    else if (x === 2) text = `RES ${y}, ${target}`;
    else text = `SET ${y}, ${target}`;
    return { len: 4, text, comment: annotate(text, { disp }) };
  }

  const replacement = ix;
  if (op === 0x21) {
    const imm = u24(pc + 2);
    const text = `LD ${replacement}, ${hex(imm, 6)}`;
    return { len: 5, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x22) {
    const imm = u24(pc + 2);
    const text = `LD (${hex(imm, 6)}), ${replacement}`;
    return { len: 5, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x2A) {
    const imm = u24(pc + 2);
    const text = `LD ${replacement}, (${hex(imm, 6)})`;
    return { len: 5, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x36) {
    const disp = signed8(b(pc + 2));
    const imm = b(pc + 3);
    const text = `LD (${ix}${disp >= 0 ? '+' : ''}${disp}), ${hex(imm)}`;
    return { len: 4, text, comment: annotate(text, { disp }) };
  }
  if ([0x34, 0x35].includes(op)) {
    const disp = signed8(b(pc + 2));
    const text = `${op === 0x34 ? 'INC' : 'DEC'} (${ix}${disp >= 0 ? '+' : ''}${disp})`;
    return { len: 3, text, comment: annotate(text, { disp }) };
  }
  if ((op & 0xC7) === 0x46) {
    const r = reg8[(op >> 3) & 7];
    const disp = signed8(b(pc + 2));
    const text = `LD ${r}, (${ix}${disp >= 0 ? '+' : ''}${disp})`;
    return { len: 3, text, comment: annotate(text, { disp }) };
  }
  if ((op & 0xF8) === 0x70) {
    const r = reg8[op & 7];
    const disp = signed8(b(pc + 2));
    const text = `LD (${ix}${disp >= 0 ? '+' : ''}${disp}), ${r}`;
    return { len: 3, text, comment: annotate(text, { disp }) };
  }

  const fallback = decodeBase(pc + 1);
  return {
    len: fallback.len + 1,
    text: fallback.text.replace(/\bHL\b/g, replacement).replace(/\bH\b/g, `${ix}H`).replace(/\bL\b/g, `${ix}L`),
    comment: fallback.comment || ` ; ${ix}-prefixed form`,
  };
}

function decodeED(pc) {
  const op = b(pc + 1);
  const imm24Opcodes = new Map([
    [0x43, 'LD ({imm}), BC'],
    [0x4B, 'LD BC, ({imm})'],
    [0x53, 'LD ({imm}), DE'],
    [0x5B, 'LD DE, ({imm})'],
    [0x63, 'LD ({imm}), HL'],
    [0x6B, 'LD HL, ({imm})'],
    [0x73, 'LD ({imm}), SP'],
    [0x7B, 'LD SP, ({imm})'],
  ]);
  if (imm24Opcodes.has(op)) {
    const imm = u24(pc + 2);
    const text = imm24Opcodes.get(op).replace('{imm}', hex(imm, 6));
    return { len: 5, text, comment: annotate(text, { imm24: imm }) };
  }

  const simple = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I, A'],
    [0x4D, 'RETI'], [0x56, 'IM 1'], [0x57, 'LD A, I'], [0x5E, 'IM 2'],
    [0x5F, 'LD A, R'], [0x67, 'RRD'], [0x6F, 'RLD'], [0xA0, 'LDI'],
    [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'], [0xA8, 'LDD'],
    [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'], [0xB0, 'LDIR'],
    [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'], [0xB8, 'LDDR'],
    [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (simple.has(op)) {
    const text = simple.get(op);
    return { len: 2, text, comment: annotate(text) };
  }

  if ((op & 0xC7) === 0x40) {
    const text = `IN ${reg8[(op >> 3) & 7]}, (C)`;
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xC7) === 0x41) {
    const text = `OUT (C), ${reg8[(op >> 3) & 7]}`;
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xC7) === 0x42) {
    const alu = ['SBC HL,', 'ADC HL,'][(op >> 3) & 1];
    const text = `${alu} ${rp[(op >> 4) & 3]}`;
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xCF) === 0x4C) {
    const text = `MLT ${rp[(op >> 4) & 3]}`;
    return { len: 2, text, comment: ' ; eZ80 multiply, likely glyph offset math' };
  }

  return { len: 2, text: `ED ${hex(op)} ; unknown/ez80 extended`, comment: '' };
}

function decodeBase(pc) {
  const op = b(pc);
  if (op === 0xCB) return decodeCB(pc);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(pc, op);
  if (op === 0xED) return decodeED(pc);

  const imm8Alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
  const single = new Map([
    [0x00, 'NOP'], [0x02, 'LD (BC), A'], [0x03, 'INC BC'], [0x04, 'INC B'],
    [0x05, 'DEC B'], [0x07, 'RLCA'], [0x08, 'EX AF, AF\''], [0x09, 'ADD HL, BC'],
    [0x0A, 'LD A, (BC)'], [0x0B, 'DEC BC'], [0x0C, 'INC C'], [0x0D, 'DEC C'],
    [0x0F, 'RRCA'], [0x12, 'LD (DE), A'], [0x13, 'INC DE'], [0x14, 'INC D'],
    [0x15, 'DEC D'], [0x17, 'RLA'], [0x19, 'ADD HL, DE'], [0x1A, 'LD A, (DE)'],
    [0x1B, 'DEC DE'], [0x1C, 'INC E'], [0x1D, 'DEC E'], [0x1F, 'RRA'],
    [0x23, 'INC HL'], [0x24, 'INC H'], [0x25, 'DEC H'], [0x27, 'DAA'],
    [0x29, 'ADD HL, HL'], [0x2B, 'DEC HL'], [0x2C, 'INC L'], [0x2D, 'DEC L'],
    [0x2F, 'CPL'], [0x33, 'INC SP'], [0x34, 'INC (HL)'], [0x35, 'DEC (HL)'],
    [0x37, 'SCF'], [0x39, 'ADD HL, SP'], [0x3A, 'LD A, (HL)'], [0x3B, 'DEC SP'],
    [0x3C, 'INC A'], [0x3D, 'DEC A'], [0x3F, 'CCF'], [0x76, 'HALT'],
    [0xC9, 'RET'], [0xD9, 'EXX'], [0xE3, 'EX (SP), HL'], [0xE9, 'JP (HL)'],
    [0xEB, 'EX DE, HL'], [0xF3, 'DI'], [0xF9, 'LD SP, HL'], [0xFB, 'EI'],
  ]);
  if (single.has(op)) {
    const text = single.get(op);
    return { len: 1, text, comment: annotate(text) };
  }

  if ((op & 0xC7) === 0x06) {
    const text = `LD ${reg8[(op >> 3) & 7]}, ${hex(b(pc + 1))}`;
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xCF) === 0x01) {
    const text = `LD ${rp[(op >> 4) & 3]}, ${hex(u16(pc + 1), 4)}`;
    return { len: 3, text, comment: annotate(text) };
  }
  if (op === 0x21) {
    const imm = u24(pc + 1);
    const text = `LD HL, ${hex(imm, 6)}`;
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x22) {
    const imm = u24(pc + 1);
    const text = `LD (${hex(imm, 6)}), HL`;
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x2A) {
    const imm = u24(pc + 1);
    const text = `LD HL, (${hex(imm, 6)})`;
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x32) {
    const imm = u24(pc + 1);
    const text = `LD (${hex(imm, 6)}), A`;
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x3A) {
    const imm = u24(pc + 1);
    const text = `LD A, (${hex(imm, 6)})`;
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0x36) {
    const text = `LD (HL), ${hex(b(pc + 1))}`;
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xC0) === 0x40) {
    const text = `LD ${reg8[(op >> 3) & 7]}, ${reg8[op & 7]}`;
    return { len: 1, text, comment: annotate(text) };
  }
  if ((op & 0xC0) === 0x80) {
    const text = `${imm8Alu[(op >> 3) & 7]} ${reg8[op & 7]}`.replace('SUB ', 'SUB ');
    return { len: 1, text, comment: annotate(text) };
  }
  if ((op & 0xC7) === 0xC0) {
    const text = `RET ${cond[(op >> 3) & 7]}`;
    return { len: 1, text, comment: annotate(text) };
  }
  if ((op & 0xC7) === 0xC2) {
    const imm = u24(pc + 1);
    const text = `JP ${cond[(op >> 3) & 7]}, ${hex(imm, 6)}`;
    hits.jumps.push(imm);
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if ((op & 0xC7) === 0xC4) {
    const imm = u24(pc + 1);
    const text = `CALL ${cond[(op >> 3) & 7]}, ${hex(imm, 6)}`;
    hits.calls.push(imm);
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if ((op & 0xC7) === 0xC7) {
    const text = `RST ${hex(op & 0x38)}`;
    return { len: 1, text, comment: annotate(text) };
  }
  if ((op & 0xC7) === 0xC6) {
    const text = `${imm8Alu[(op >> 3) & 7]} ${hex(b(pc + 1))}`.replace('SUB ', 'SUB ');
    return { len: 2, text, comment: annotate(text) };
  }
  if ((op & 0xCF) === 0xC1) {
    const qq = ['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3];
    const text = `${op & 0x04 ? 'PUSH' : 'POP'} ${qq}`;
    return { len: 1, text, comment: annotate(text) };
  }
  if (op === 0x10) {
    const off = signed8(b(pc + 1));
    const target = pc + 2 + off;
    const text = `DJNZ ${hex(target, 6)}`;
    hits.jumps.push(target);
    return { len: 2, text, comment: annotate(text) };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const off = signed8(b(pc + 1));
    const target = pc + 2 + off;
    const c = op === 0x18 ? '' : ` ${['NZ', 'Z', 'NC', 'C'][(op >> 3) & 3]},`;
    const text = `JR${c} ${hex(target, 6)}`;
    hits.jumps.push(target);
    return { len: 2, text, comment: annotate(text) };
  }
  if (op === 0xC3) {
    const imm = u24(pc + 1);
    const text = `JP ${hex(imm, 6)}`;
    hits.jumps.push(imm);
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }
  if (op === 0xCD) {
    const imm = u24(pc + 1);
    const text = `CALL ${hex(imm, 6)}`;
    hits.calls.push(imm);
    return { len: 4, text, comment: annotate(text, { imm24: imm }) };
  }

  return { len: 1, text: `DB ${hex(op)} ; undecoded`, comment: '' };
}

function byteText(pc, len) {
  return Array.from({ length: len }, (_, i) => hex(b(pc + i))).join(' ');
}

const lines = [];
let pc = START;
const end = START + MAX_BYTES;

while (pc < end) {
  const decoded = decodeBase(pc);
  lines.push({
    pc,
    len: decoded.len,
    bytes: byteText(pc, decoded.len),
    text: decoded.text,
    comment: decoded.comment,
  });
  pc += decoded.len;
  if (/^(RET|RETI|RETN)\b/.test(decoded.text) || /^JP\b/.test(decoded.text)) {
    hits.terminator = { pc: lines.at(-1).pc, text: decoded.text };
    break;
  }
}

const size = pc - START;
const uniqueCalls = [...new Set(hits.calls)].sort((a, b) => a - b);
const uniqueJumps = [...new Set(hits.jumps)].sort((a, b) => a - b);
const uniqueImmediates = [...new Set(hits.immediates)].sort((a, b) => a - b);

function inferEntryRegisters() {
  const firstWrites = new Set();
  const firstReads = new Set();
  for (const line of lines.slice(0, 16)) {
    const [mnemonic, rest = ''] = line.text.split(/\s+/, 2);
    if (mnemonic === 'PUSH' || mnemonic === 'CP' || mnemonic === 'ADD' || mnemonic === 'ADC' || mnemonic === 'SUB' || mnemonic === 'SBC' || mnemonic === 'AND' || mnemonic === 'XOR' || mnemonic === 'OR') {
      for (const r of ['A', 'BC', 'DE', 'HL', 'IX', 'IY', 'B', 'C', 'D', 'E', 'H', 'L']) {
        if (rest.includes(r)) firstReads.add(r);
      }
    }
    if (mnemonic === 'LD') {
      const [dst, src = ''] = rest.split(',').map(s => s.trim());
      if (dst) firstWrites.add(dst.replace(/[()]/g, ''));
      for (const r of ['A', 'BC', 'DE', 'HL', 'IX', 'IY', 'B', 'C', 'D', 'E', 'H', 'L']) {
        if (src.includes(r)) firstReads.add(r);
      }
    }
  }
  return {
    likely: 'A holds the character/token from caller 0x0A1B5B; IY is expected to already point at D00080 system flags.',
    earlyReads: [...firstReads],
    earlyWrites: [...firstWrites],
  };
}

function inferFontIndexing() {
  const fontNearby = uniqueImmediates.filter(v => Math.abs(v - FONT_TABLE) < 0x2000);
  const mlt = lines.filter(l => l.text.startsWith('MLT '));
  const adds = lines.filter(l => /ADD .*HL|ADD .*IX|ADD .*IY|ADD A/.test(l.text));
  return {
    directFontReferences: fontNearby.map(v => hex(v, 6)),
    expectedTable: hex(FONT_TABLE, 6),
    expectedGlyphDataStart: hex(FONT_TABLE + FONT_BASE_OFFSET, 6),
    multiplyOrAddHints: [...mlt, ...adds].map(l => `${hex(l.pc, 6)} ${l.text}`),
    interpretation: fontNearby.length
      ? 'Function directly references the known font region; inspect the address arithmetic above for char-to-glyph offset.'
      : 'No direct literal font-table address in this window; this routine may receive a precomputed glyph pointer or call a helper that indexes the table.',
  };
}

function inferBppDispatch() {
  const bit2 = lines.filter(l => /BIT 2/.test(l.text) || /D000C6/.test(l.text));
  const known = uniqueCalls.concat(uniqueJumps).filter(v => knownCalls.has(v));
  return {
    bit2ModeTests: bit2.map(l => `${hex(l.pc, 6)} ${l.text}${l.comment}`),
    knownDispatchTargets: known.map(v => `${hex(v, 6)} ${knownCalls.get(v)}`),
    interpretation: bit2.length || known.length
      ? 'This window contains direct BPP-mode dispatch evidence.'
      : 'No direct D000C6 bit-2 test or known BPP router call found in the decoded window; mode may be selected by caller 0x0A1B5B or by a callee.',
  };
}

function inferPixelWrites() {
  const writes = lines.filter(l =>
    /\(HL\)|\(DE\)|LDI|LDIR/.test(l.text) ||
    /D0059C|D400/.test(l.text + l.comment)
  );
  return {
    writeLikeInstructions: writes.map(l => `${hex(l.pc, 6)} ${l.text}${l.comment}`),
    pixelAddressHints: hits.pixelHints.map(h => `${hex(h.addr, 6)} via ${h.kind}`),
    interpretation: writes.length
      ? 'Write-like operations are present; indirect writes through HL/DE likely touch the computed framebuffer or glyph buffer once those registers are loaded.'
      : 'No obvious pixel writes decoded before terminator.',
  };
}

const summary = {
  start: hex(START, 6),
  decodedBytes: size,
  decodedInstructions: lines.length,
  terminator: hits.terminator ? `${hex(hits.terminator.pc, 6)} ${hits.terminator.text}` : 'none within limit',
  purpose: 'Decode candidate actual glyph renderer at 0x0A1799 in the OS text pipeline.',
  entryRegisters: inferEntryRegisters(),
  fontIndexing: inferFontIndexing(),
  pixelWrites: inferPixelWrites(),
  bppDispatch: inferBppDispatch(),
  callTargets: uniqueCalls.map(v => `${hex(v, 6)}${knownCalls.has(v) ? ' ' + knownCalls.get(v) : ''}`),
  jumpTargets: uniqueJumps.map(v => hex(v, 6)),
  ramAddresses: [...hits.ram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([addr, info]) => ({
      address: hex(addr, 6),
      name: ramNames.get(addr) ?? 'unnamed RAM',
      count: info.count,
      contexts: [...info.kinds],
    })),
};

console.log(`Disassembly of 0x0A1799 (${summary.decodedBytes} bytes, ${summary.decodedInstructions} instructions)`);
console.log('');
for (const line of lines) {
  console.log(`${hex(line.pc, 6)}  ${line.bytes.padEnd(17)} ${line.text}${line.comment}`);
}

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify(summary, null, 2));
