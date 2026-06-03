import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const FUNCTIONS = [
  { name: 'cursor_setup', addr: 0x0b95e0, len: 150 },
  { name: 'cursor_draw', addr: 0x0b968e, len: 150 },
  { name: 'cursor_render', addr: 0x0b96b3, len: 150 },
  { name: 'cursor_erase', addr: 0x0b96e3, len: 150 },
  { name: 'cursor_pair_helper_0B852A', addr: 0x0b852a, len: 100 },
];

function readBytes(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0');
}

function hexWord(w) {
  return '0x' + w.toString(16).padStart(4, '0');
}

function hexAddr(a) {
  return '0x' + a.toString(16).padStart(6, '0');
}

function read16LE(bytes, i) {
  return bytes[i] | (bytes[i + 1] << 8);
}

function read24LE(bytes, i) {
  return bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
}

function signed8(n) {
  return n & 0x80 ? n - 0x100 : n;
}

function inRam(addr) {
  return addr >= 0xd00000 && addr <= 0xd3ffff;
}

function inVram(addr) {
  return addr >= 0xd40000;
}

function iyAbsolute(disp) {
  return 0xd00080 + disp;
}

function opMem(addr, mode) {
  const tags = [];
  if (inRam(addr)) tags.push('RAM');
  if (inVram(addr)) tags.push('VRAM');
  return { addr, mode, tags };
}

function cbMnemonic(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const r = regs[op & 7];
  const y = (op >> 3) & 7;
  const x = op >> 6;
  if (x === 0) return ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y] + ' ' + r;
  if (x === 1) return 'BIT ' + y + ',' + r;
  if (x === 2) return 'RES ' + y + ',' + r;
  return 'SET ' + y + ',' + r;
}

function indexedCbMnemonic(index, disp, op) {
  const y = (op >> 3) & 7;
  const x = op >> 6;
  const target = `(${index}${disp < 0 ? '' : '+'}${disp})`;
  if (x === 0) return ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y] + ' ' + target;
  if (x === 1) return 'BIT ' + y + ',' + target;
  if (x === 2) return 'RES ' + y + ',' + target;
  return 'SET ' + y + ',' + target;
}

function decodeEd(bytes, i) {
  const op = bytes[i + 1];
  const one = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x4d: 'RETI',
    0x4f: 'LD R,A',
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5e: 'IM 2',
    0x5f: 'LD A,R',
    0x67: 'RRD',
    0x6f: 'RLD',
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa2: 'INI',
    0xa3: 'OUTI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xaa: 'IND',
    0xab: 'OUTD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb2: 'INIR',
    0xb3: 'OTIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
    0xba: 'INDR',
    0xbb: 'OTDR',
  };
  return { size: 2, text: one[op] || `ED ${hexByte(op)}` };
}

function decodeBase(bytes, i, addr, prefix = '') {
  const op = bytes[i];
  const index = prefix === 'DD' ? 'IX' : prefix === 'FD' ? 'IY' : null;
  const hl = index || 'HL';
  const h = index ? index + 'H' : 'H';
  const l = index ? index + 'L' : 'L';
  const refs = [];
  const calls = [];
  const jumps = [];
  const iyOps = [];

  const simple = {
    0x00: 'NOP', 0x01: 'LD BC,nn', 0x02: 'LD (BC),A', 0x03: 'INC BC',
    0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA', 0x08: "EX AF,AF'",
    0x09: `ADD ${hl},BC`, 0x0a: 'LD A,(BC)', 0x0b: 'DEC BC', 0x0c: 'INC C',
    0x0d: 'DEC C', 0x0f: 'RRCA', 0x12: 'LD (DE),A', 0x13: 'INC DE',
    0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA', 0x19: `ADD ${hl},DE`,
    0x1a: 'LD A,(DE)', 0x1b: 'DEC DE', 0x1c: 'INC E', 0x1d: 'DEC E',
    0x1f: 'RRA', 0x23: `INC ${hl}`, 0x24: `INC ${h}`, 0x25: `DEC ${h}`,
    0x27: 'DAA', 0x29: `ADD ${hl},${hl}`, 0x2b: `DEC ${hl}`, 0x2c: `INC ${l}`,
    0x2d: `DEC ${l}`, 0x2f: 'CPL', 0x33: 'INC SP', 0x34: `INC (${hl})`,
    0x35: `DEC (${hl})`, 0x37: 'SCF', 0x39: `ADD ${hl},SP`, 0x3b: 'DEC SP',
    0x3c: 'INC A', 0x3d: 'DEC A', 0x3f: 'CCF', 0x76: 'HALT',
    0x7c: `LD A,${h}`, 0x7d: `LD A,${l}`, 0x7e: `LD A,(${hl})`,
    0x77: `LD (${hl}),A`, 0x78: 'LD A,B', 0x79: 'LD A,C', 0x7a: 'LD A,D',
    0x7b: 'LD A,E', 0x87: 'ADD A,A', 0x97: 'SUB A', 0x9f: 'SBC A,A',
    0xa7: 'AND A', 0xaf: 'XOR A', 0xb0: 'OR B', 0xb1: 'OR C', 0xb2: 'OR D',
    0xb3: 'OR E', 0xb4: `OR ${h}`, 0xb5: `OR ${l}`, 0xb6: `OR (${hl})`,
    0xb7: 'OR A', 0xc0: 'RET NZ', 0xc1: 'POP BC', 0xc5: 'PUSH BC',
    0xc8: 'RET Z', 0xc9: 'RET', 0xd0: 'RET NC', 0xd1: 'POP DE', 0xd5: 'PUSH DE',
    0xd8: 'RET C', 0xe1: `POP ${hl}`, 0xe3: `EX (SP),${hl}`, 0xe5: `PUSH ${hl}`,
    0xe9: `JP (${hl})`, 0xeb: 'EX DE,HL', 0xf1: 'POP AF', 0xf3: 'DI',
    0xf5: 'PUSH AF', 0xf9: `LD SP,${hl}`, 0xfb: 'EI',
  };

  // eZ80 suffix prefixes: 0x40=.SIS, 0x49=.LIS, 0x52=.SIL, 0x5B=.LIL
  if (op === 0x40 || op === 0x49 || op === 0x52 || op === 0x5B) {
    const modeMap = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    const mode = modeMap[op];
    // In .SIS mode, addresses are 16-bit; in others they're 24-bit
    // For now, decode the inner instruction normally (ADL mode) and prefix with mode name
    const inner = decodeBase(bytes, i + 1, addr + 1, prefix);
    return {
      ...inner,
      size: inner.size + 1,
      text: `${mode} ${inner.text}`,
      calls: inner.calls,
      jumps: inner.jumps,
      refs: inner.refs,
      iyOps: inner.iyOps,
      stop: inner.stop,
    };
  }

  if (op === 0xdd || op === 0xfd) {
    if (bytes[i + 1] === 0xcb) {
      const disp = signed8(bytes[i + 2]);
      const cb = bytes[i + 3];
      const idx = op === 0xdd ? 'IX' : 'IY';
      if (idx === 'IY') iyOps.push({ disp, abs: iyAbsolute(disp), mode: 'bitop' });
      return { size: 4, text: indexedCbMnemonic(idx, disp, cb), calls, jumps, refs, iyOps };
    }
    const inner = decodeBase(bytes, i + 1, addr + 1, op === 0xdd ? 'DD' : 'FD');
    return {
      ...inner,
      size: inner.size + 1,
      text: inner.text,
      calls: inner.calls,
      jumps: inner.jumps,
      refs: inner.refs,
      iyOps: inner.iyOps,
      stop: inner.stop,
    };
  }

  if (op === 0xed) return { ...decodeEd(bytes, i), calls, jumps, refs, iyOps };
  if (op === 0xcb) return { size: 2, text: cbMnemonic(bytes[i + 1]), calls, jumps, refs, iyOps };

  const rel = () => hexAddr((addr + 2 + signed8(bytes[i + 1])) & 0xffffff);
  const abs24 = (at = i + 1) => read24LE(bytes, at);
  const imm24 = () => hexAddr(abs24());
  const imm16 = () => hexWord(read16LE(bytes, i + 1));

  if (simple[op]) return { size: 1, text: simple[op], calls, jumps, refs, iyOps, stop: op === 0xc9 || op === 0xe9 };

  // 0x40-0x7F register-to-register moves (excluding 0x76 HALT, already in simple)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const dst = regs8[(op >> 3) & 7];
    const src = regs8[op & 7];
    // Handle indexed (IX/IY) displacement for (HL) slot
    if (index && (dst === '(HL)' || src === '(HL)')) {
      const disp = signed8(bytes[i + 1]);
      const target = `(${hl}${disp < 0 ? '' : '+'}${disp})`;
      if (index === 'IY') iyOps.push({ disp, abs: iyAbsolute(disp), mode: 'indexed' });
      const dstR = dst === '(HL)' ? target : dst;
      const srcR = src === '(HL)' ? target : src;
      return { size: 2, text: `LD ${dstR},${srcR}`, calls, jumps, refs, iyOps };
    }
    return { size: 1, text: `LD ${dst},${src}`, calls, jumps, refs, iyOps };
  }

  // 0x80-0xBF ALU operations
  if (op >= 0x80 && op <= 0xBF) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const aluNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const aluIdx = (op >> 3) & 7;
    const src = regs8[op & 7];
    if (index && src === '(HL)') {
      const disp = signed8(bytes[i + 1]);
      const target = `(${hl}${disp < 0 ? '' : '+'}${disp})`;
      if (index === 'IY') iyOps.push({ disp, abs: iyAbsolute(disp), mode: 'indexed' });
      return { size: 2, text: `${aluNames[aluIdx]}${target}`, calls, jumps, refs, iyOps };
    }
    return { size: 1, text: `${aluNames[aluIdx]}${src}`, calls, jumps, refs, iyOps };
  }

  switch (op) {
    case 0x06: return { size: 2, text: `LD B,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x0e: return { size: 2, text: `LD C,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x10: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `DJNZ ${rel()}`, calls, jumps, refs, iyOps };
    case 0x11: return { size: 4, text: `LD DE,${imm24()}`, calls, jumps, refs, iyOps };
    case 0x16: return { size: 2, text: `LD D,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x18: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `JR ${rel()}`, calls, jumps, refs, iyOps, stop: true };
    case 0x1e: return { size: 2, text: `LD E,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x20: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `JR NZ,${rel()}`, calls, jumps, refs, iyOps };
    case 0x21: return { size: 4, text: `LD ${hl},${imm24()}`, calls, jumps, refs, iyOps };
    case 0x22: refs.push(opMem(abs24(), 'write')); return { size: 4, text: `LD (${imm24()}),${hl}`, calls, jumps, refs, iyOps };
    case 0x26: return { size: 2, text: `LD ${h},${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x28: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `JR Z,${rel()}`, calls, jumps, refs, iyOps };
    case 0x2a: refs.push(opMem(abs24(), 'read')); return { size: 4, text: `LD ${hl},(${imm24()})`, calls, jumps, refs, iyOps };
    case 0x2e: return { size: 2, text: `LD ${l},${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x30: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `JR NC,${rel()}`, calls, jumps, refs, iyOps };
    case 0x31: return { size: 4, text: `LD SP,${imm24()}`, calls, jumps, refs, iyOps };
    case 0x32: refs.push(opMem(abs24(), 'write')); return { size: 4, text: `LD (${imm24()}),A`, calls, jumps, refs, iyOps };
    case 0x36: return { size: index ? 3 : 2, text: index ? `LD (${hl}${signed8(bytes[i + 1]) < 0 ? '' : '+'}${signed8(bytes[i + 1])}),${hexByte(bytes[i + 2])}` : `LD (HL),${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0x38: jumps.push(addr + 2 + signed8(bytes[i + 1])); return { size: 2, text: `JR C,${rel()}`, calls, jumps, refs, iyOps };
    case 0x3a: refs.push(opMem(abs24(), 'read')); return { size: 4, text: `LD A,(${imm24()})`, calls, jumps, refs, iyOps };
    case 0x3e: return { size: 2, text: `LD A,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xc2: jumps.push(abs24()); return { size: 4, text: `JP NZ,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xc3: jumps.push(abs24()); return { size: 4, text: `JP ${imm24()}`, calls, jumps, refs, iyOps, stop: true };
    case 0xc4: calls.push(abs24()); return { size: 4, text: `CALL NZ,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xc6: return { size: 2, text: `ADD A,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xc7: return { size: 1, text: 'RST 00h', calls, jumps, refs, iyOps };
    case 0xca: jumps.push(abs24()); return { size: 4, text: `JP Z,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xcc: calls.push(abs24()); return { size: 4, text: `CALL Z,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xcd: calls.push(abs24()); return { size: 4, text: `CALL ${imm24()}`, calls, jumps, refs, iyOps };
    case 0xce: return { size: 2, text: `ADC A,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xd2: jumps.push(abs24()); return { size: 4, text: `JP NC,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xd6: return { size: 2, text: `SUB ${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xda: jumps.push(abs24()); return { size: 4, text: `JP C,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xde: return { size: 2, text: `SBC A,${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xe6: return { size: 2, text: `AND ${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xe7: calls.push(0x000028); return { size: 3, text: `RST 28h / BCALL ${hexWord(read16LE(bytes, i + 1))}`, calls, jumps, refs, iyOps };
    case 0xea: return { size: 4, text: `JP PE,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xee: return { size: 2, text: `XOR ${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xf6: return { size: 2, text: `OR ${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    case 0xfa: return { size: 4, text: `JP M,${imm24()}`, calls, jumps, refs, iyOps };
    case 0xfe: return { size: 2, text: `CP ${hexByte(bytes[i + 1])}`, calls, jumps, refs, iyOps };
    default:
      if (index && [0x34, 0x35, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e, 0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe].includes(op)) {
        const disp = signed8(bytes[i + 1]);
        if (index === 'IY') iyOps.push({ disp, abs: iyAbsolute(disp), mode: 'indexed' });
        const names = {
          0x34: `INC (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x35: `DEC (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x70: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),B`,
          0x71: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),C`,
          0x72: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),D`,
          0x73: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),E`,
          0x74: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),${h}`,
          0x75: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),${l}`,
          0x77: `LD (${hl}${disp < 0 ? '' : '+'}${disp}),A`,
          0x7e: `LD A,(${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x86: `ADD A,(${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x8e: `ADC A,(${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x96: `SUB (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0x9e: `SBC A,(${hl}${disp < 0 ? '' : '+'}${disp})`,
          0xa6: `AND (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0xae: `XOR (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0xb6: `OR (${hl}${disp < 0 ? '' : '+'}${disp})`,
          0xbe: `CP (${hl}${disp < 0 ? '' : '+'}${disp})`,
        };
        return { size: 2, text: names[op], calls, jumps, refs, iyOps };
      }
      return { size: 1, text: `DB ${hexByte(op)}`, calls, jumps, refs, iyOps };
  }
}

function decodeFunction(fn) {
  const bytes = readBytes(fn.addr, fn.len);
  const insns = [];
  const calls = new Set();
  const jumps = new Set();
  const ramRefs = [];
  const vramRefs = [];
  const iyOps = [];
  let off = 0;

  while (off < bytes.length) {
    const addr = fn.addr + off;
    const decoded = decodeBase(bytes, off, addr);
    const raw = bytes.slice(off, off + decoded.size);

    for (const call of decoded.calls || []) calls.add(call);
    for (const jump of decoded.jumps || []) jumps.add(jump & 0xffffff);
    for (const ref of decoded.refs || []) {
      if (ref.tags.includes('RAM')) ramRefs.push(ref);
      if (ref.tags.includes('VRAM')) vramRefs.push(ref);
    }
    for (const op of decoded.iyOps || []) iyOps.push({ at: addr, ...op });

    insns.push({ addr, raw, text: decoded.text });
    off += Math.max(decoded.size, 1);
    if (decoded.stop) break;
  }

  return { fn, bytes, insns, calls, jumps, ramRefs, vramRefs, iyOps };
}

function uniqueRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.mode}:${ref.addr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function printFunction(result) {
  console.log('');
  console.log(`=== ${result.fn.name} @ ${hexAddr(result.fn.addr)} (${result.fn.len} byte window) ===`);
  console.log('Raw hex:');
  for (let i = 0; i < result.bytes.length; i += 16) {
    console.log(`${hexAddr(result.fn.addr + i)}  ${result.bytes.slice(i, i + 16).map(hexByte).join(' ')}`);
  }

  console.log('');
  console.log('Decoded instructions:');
  for (const insn of result.insns) {
    console.log(`${hexAddr(insn.addr)}  ${insn.raw.map(hexByte).join(' ').padEnd(14)}  ${insn.text}`);
  }

  console.log('');
  console.log('CALL targets:');
  if (result.calls.size === 0) console.log('  none');
  for (const addr of [...result.calls].sort((a, b) => a - b)) console.log(`  ${hexAddr(addr)}`);

  console.log('JP/JR targets:');
  if (result.jumps.size === 0) console.log('  none');
  for (const addr of [...result.jumps].sort((a, b) => a - b)) console.log(`  ${hexAddr(addr)}`);

  console.log('RAM reads/writes (D00000-D3FFFF):');
  const ramRefs = uniqueRefs(result.ramRefs);
  if (ramRefs.length === 0) console.log('  none');
  for (const ref of ramRefs) console.log(`  ${ref.mode.padEnd(5)} ${hexAddr(ref.addr)}`);

  console.log('VRAM access (D40000+):');
  const vramRefs = uniqueRefs(result.vramRefs);
  if (vramRefs.length === 0) console.log('  no direct absolute VRAM references in decoded window');
  for (const ref of vramRefs) console.log(`  ${ref.mode.padEnd(5)} ${hexAddr(ref.addr)}`);

  console.log('IY-relative operations (IY base assumed D00080):');
  if (result.iyOps.length === 0) console.log('  none');
  for (const op of result.iyOps) {
    console.log(`  ${hexAddr(op.at)}  disp ${op.disp >= 0 ? '+' : ''}${op.disp} -> ${hexAddr(op.abs)} (${op.mode})`);
  }
}

console.log('TI-84 Plus CE cursor operation decode probe');
console.log(`ROM size: ${rom.length} bytes`);
console.log('IY base assumption: 0xD00080');

for (const fn of FUNCTIONS) {
  printFunction(decodeFunction(fn));
}

process.exit(0);
