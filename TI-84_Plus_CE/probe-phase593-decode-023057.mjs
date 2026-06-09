import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x023057;
const MAX_BYTES = 256;

const ramNames = new Map([
  [0xd00080, 'IY_base'],
  [0xd00082, 'IY+2_flags'],
  [0xd000ce, 'IY+0x4E'],
  [0xd005f8, 'primaryDescriptorBuffer'],
  [0xd007e0, 'displayMode'],
]);

const iyNames = new Map([
  [0x00, 'IY_base'],
  [0x02, 'IY+2_flags'],
  [0x4e, 'IY+0x4E'],
]);

const callTargets = new Set();
const iyRefs = [];
const branchTargets = new Set();

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value ?? 0).toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(pos) {
  return rom[pos] | (rom[pos + 1] << 8);
}

function u24(pos) {
  return rom[pos] | (rom[pos + 1] << 8) | (rom[pos + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), hexByte).join(' ');
}

function annotateAddr(addr) {
  const name = ramNames.get(addr);
  return name ? `${hex(addr)} <${name}>` : hex(addr);
}

function annotateIY(disp) {
  const offset = disp & 0xff;
  const signed = signed8(offset);
  const addr = 0xd00080 + signed;
  const dispText = signed < 0 ? `-${hex(-signed, 2)}` : `+${hex(signed, 2)}`;
  const name = iyNames.get(offset) ?? ramNames.get(addr);
  return `(IY${dispText})${name ? ` <${name}; ${hex(addr)}>` : ` <${hex(addr)}>`}`;
}

function relTarget(addr, len, disp) {
  return (addr + len + signed8(disp)) & 0xffffff;
}

function reg8(id) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][id] ?? `r${id}`;
}

function reg16(id, spName = 'SP') {
  return ['BC', 'DE', 'HL', spName][id] ?? `rp${id}`;
}

function cond(id) {
  return ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][id] ?? `cc${id}`;
}

function cbName(op, memText) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y];
  if (x === 0) return `${rot} ${memText}${z === 6 ? '' : `, ${reg8(z)}`}`;
  if (x === 1) return `BIT ${y}, ${memText}${z === 6 ? '' : `, ${reg8(z)}`}`;
  if (x === 2) return `RES ${y}, ${memText}${z === 6 ? '' : `, ${reg8(z)}`}`;
  return `SET ${y}, ${memText}${z === 6 ? '' : `, ${reg8(z)}`}`;
}

function decodeED(addr, sis) {
  const op = rom[addr + 1];
  const immBytes = sis ? 2 : 3;
  const memBytes = sis ? 4 : 5;
  const widthName = sis ? '.SIS ' : '';
  if ((op & 0xcf) === 0x43) {
    const rp = reg16((op >> 4) & 3);
    const nn = sis ? u16(addr + 2) : u24(addr + 2);
    return { len: memBytes, text: `${widthName}LD (${annotateAddr(nn)}), ${rp}`, targets: [] };
  }
  if ((op & 0xcf) === 0x4b) {
    const rp = reg16((op >> 4) & 3);
    const nn = sis ? u16(addr + 2) : u24(addr + 2);
    return { len: memBytes, text: `${widthName}LD ${rp}, (${annotateAddr(nn)})`, targets: [] };
  }
  const edMap = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I, A'],
    [0x4d, 'RETI'], [0x4f, 'LD R, A'], [0x57, 'LD A, I'], [0x5f, 'LD A, R'],
    [0x67, 'RRD'], [0x6f, 'RLD'], [0xa0, 'LDI'], [0xa1, 'CPI'],
    [0xa2, 'INI'], [0xa3, 'OUTI'], [0xa8, 'LDD'], [0xa9, 'CPD'],
    [0xaa, 'IND'], [0xab, 'OUTD'], [0xb0, 'LDIR'], [0xb1, 'CPIR'],
    [0xb2, 'INIR'], [0xb3, 'OTIR'], [0xb8, 'LDDR'], [0xb9, 'CPDR'],
    [0xba, 'INDR'], [0xbb, 'OTDR'],
  ]);
  return { len: 2, text: edMap.get(op) ?? `ED ${hexByte(op)}`, targets: [] };
}

function decodeFD(addr, sis) {
  const op = rom[addr + 1];
  const immBytes = sis ? 2 : 3;
  const widthName = sis ? '.SIS ' : '';
  if (op === 0xcb) {
    const disp = rom[addr + 2];
    const cb = rom[addr + 3];
    const text = cbName(cb, annotateIY(disp));
    iyRefs.push({ addr, text });
    return { len: 4, text, targets: [] };
  }
  if (op === 0x21) {
    const nn = sis ? u16(addr + 2) : u24(addr + 2);
    return { len: 2 + immBytes, text: `${widthName}LD IY, ${annotateAddr(nn)}`, targets: [] };
  }
  if (op === 0x22) {
    const nn = sis ? u16(addr + 2) : u24(addr + 2);
    return { len: 2 + immBytes, text: `${widthName}LD (${annotateAddr(nn)}), IY`, targets: [] };
  }
  if (op === 0x2a) {
    const nn = sis ? u16(addr + 2) : u24(addr + 2);
    return { len: 2 + immBytes, text: `${widthName}LD IY, (${annotateAddr(nn)})`, targets: [] };
  }
  if (op === 0x36) {
    const mem = annotateIY(rom[addr + 2]);
    const n = rom[addr + 3];
    iyRefs.push({ addr, text: `LD ${mem}, ${hex(n, 2)}` });
    return { len: 4, text: `LD ${mem}, ${hex(n, 2)}`, targets: [] };
  }
  if ((op & 0xc7) === 0x46) {
    const r = reg8((op >> 3) & 7);
    const mem = annotateIY(rom[addr + 2]);
    iyRefs.push({ addr, text: `LD ${r}, ${mem}` });
    return { len: 3, text: `LD ${r}, ${mem}`, targets: [] };
  }
  if ((op & 0xf8) === 0x70) {
    const r = reg8(op & 7);
    const mem = annotateIY(rom[addr + 2]);
    iyRefs.push({ addr, text: `LD ${mem}, ${r}` });
    return { len: 3, text: `LD ${mem}, ${r}`, targets: [] };
  }
  if ((op & 0xc7) === 0x86) {
    const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    const mem = annotateIY(rom[addr + 2]);
    iyRefs.push({ addr, text: `${alu} ${mem}` });
    return { len: 3, text: `${alu} ${mem}`, targets: [] };
  }
  if (op === 0x34 || op === 0x35) {
    const mem = annotateIY(rom[addr + 2]);
    const text = `${op === 0x34 ? 'INC' : 'DEC'} ${mem}`;
    iyRefs.push({ addr, text });
    return { len: 3, text, targets: [] };
  }
  const map = new Map([
    [0x09, 'ADD IY, BC'], [0x19, 'ADD IY, DE'], [0x23, 'INC IY'],
    [0x29, 'ADD IY, IY'], [0x2b, 'DEC IY'], [0x39, 'ADD IY, SP'],
    [0xe1, 'POP IY'], [0xe3, 'EX (SP), IY'], [0xe5, 'PUSH IY'],
    [0xe9, 'JP (IY)'], [0xf9, 'LD SP, IY'],
  ]);
  return { len: 2, text: map.get(op) ?? `FD ${hexByte(op)}`, targets: [] };
}

function decode(addr, sis = false) {
  const op = rom[addr];
  const immBytes = sis ? 2 : 3;
  const widthName = sis ? '.SIS ' : '';
  if ([0x40, 0x49, 0x52, 0x5b].includes(op)) {
    const inner = decode(addr + 1, true);
    return { len: inner.len + 1, text: `.SIS ${inner.text.replace(/^\.SIS /, '')}`, targets: inner.targets ?? [], terminal: inner.terminal };
  }
  if (op === 0xed) return decodeED(addr, sis);
  if (op === 0xfd) return decodeFD(addr, sis);

  if (op === 0x00) return { len: 1, text: 'NOP', targets: [] };
  if (op === 0x76) return { len: 1, text: 'HALT', targets: [], terminal: true };
  if (op === 0xc9) return { len: 1, text: 'RET', targets: [], terminal: true };
  if (op === 0xd9) return { len: 1, text: 'EXX', targets: [] };
  if (op === 0x08) return { len: 1, text: 'EX AF, AF\'', targets: [] };
  if (op === 0xeb) return { len: 1, text: 'EX DE, HL', targets: [] };
  if (op === 0xf3) return { len: 1, text: 'DI', targets: [] };
  if (op === 0xfb) return { len: 1, text: 'EI', targets: [] };

  if ((op & 0xcf) === 0x01) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    return { len: 1 + immBytes, text: `${widthName}LD ${reg16((op >> 4) & 3)}, ${annotateAddr(nn)}`, targets: [] };
  }
  if (op === 0x3a) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    return { len: 1 + immBytes, text: `${widthName}LD A, (${annotateAddr(nn)})`, targets: [] };
  }
  if (op === 0x32) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    return { len: 1 + immBytes, text: `${widthName}LD (${annotateAddr(nn)}), A`, targets: [] };
  }
  if (op === 0xcd) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    callTargets.add(nn);
    return { len: 1 + immBytes, text: `${widthName}CALL ${hex(nn)}`, targets: [] };
  }
  if (op === 0xc3) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    return { len: 1 + immBytes, text: `${widthName}JP ${hex(nn)}`, targets: [nn], terminal: true };
  }
  if ((op & 0xc7) === 0xc2) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    return { len: 1 + immBytes, text: `${widthName}JP ${cond((op >> 3) & 7)}, ${hex(nn)}`, targets: [nn] };
  }
  if ((op & 0xc7) === 0xc4) {
    const nn = sis ? u16(addr + 1) : u24(addr + 1);
    callTargets.add(nn);
    return { len: 1 + immBytes, text: `${widthName}CALL ${cond((op >> 3) & 7)}, ${hex(nn)}`, targets: [] };
  }
  if (op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(addr, 2, rom[addr + 1]);
    const c = op === 0x18 ? '' : `${cond((op >> 3) & 3)}, `;
    return { len: 2, text: `JR ${c}${hex(target)}`, targets: [target], terminal: op === 0x18 };
  }
  if (op === 0x10) {
    const target = relTarget(addr, 2, rom[addr + 1]);
    return { len: 2, text: `DJNZ ${hex(target)}`, targets: [target] };
  }
  if ((op & 0xc0) === 0x40) return { len: 1, text: `LD ${reg8((op >> 3) & 7)}, ${reg8(op & 7)}`, targets: [] };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${reg8((op >> 3) & 7)}, ${hex(rom[addr + 1], 2)}`, targets: [] };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${reg8((op >> 3) & 7)}`, targets: [] };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${reg8((op >> 3) & 7)}`, targets: [] };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${reg16((op >> 4) & 3)}`, targets: [] };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${reg16((op >> 4) & 3)}`, targets: [] };
  if ((op & 0xcf) === 0xc5) return { len: 1, text: `PUSH ${reg16((op >> 4) & 3, 'AF')}`, targets: [] };
  if ((op & 0xcf) === 0xc1) return { len: 1, text: `POP ${reg16((op >> 4) & 3, 'AF')}`, targets: [] };
  if ((op & 0xc7) === 0xc0) return { len: 1, text: `RET ${cond((op >> 3) & 7)}`, targets: [], terminal: false };
  if ((op & 0xc0) === 0x80) {
    const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 1, text: `${alu} ${reg8(op & 7)}`, targets: [] };
  }
  if ([0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe].includes(op)) {
    const alu = new Map([[0xc6, 'ADD A,'], [0xce, 'ADC A,'], [0xd6, 'SUB'], [0xde, 'SBC A,'], [0xe6, 'AND'], [0xee, 'XOR'], [0xf6, 'OR'], [0xfe, 'CP']]).get(op);
    return { len: 2, text: `${alu} ${hex(rom[addr + 1], 2)}`, targets: [] };
  }
  if ([0x07, 0x0f, 0x17, 0x1f, 0x27, 0x2f, 0x37, 0x3f].includes(op)) {
    return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][(op >> 3) & 7], targets: [] };
  }
  if ([0x02, 0x12, 0x0a, 0x1a].includes(op)) {
    return { len: 1, text: new Map([[0x02, 'LD (BC), A'], [0x12, 'LD (DE), A'], [0x0a, 'LD A, (BC)'], [0x1a, 'LD A, (DE)']]).get(op), targets: [] };
  }
  if ([0xe9, 0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff].includes(op)) {
    if (op === 0xe9) return { len: 1, text: 'JP (HL)', targets: [], terminal: true };
    return { len: 1, text: `RST ${hex(op & 0x38, 2)}`, targets: [] };
  }

  return { len: 1, text: `DB ${hex(op, 2)}`, targets: [] };
}

function scanXrefs() {
  const callNeedle = [0xcd, 0x57, 0x30, 0x02];
  const jpNeedle = [0xc3, 0x57, 0x30, 0x02];
  const hits = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    const isCall = callNeedle.every((b, j) => rom[i + j] === b);
    const isJp = jpNeedle.every((b, j) => rom[i + j] === b);
    if (isCall || isJp) hits.push({ addr: i, kind: isCall ? 'CALL' : 'JP' });
  }
  return hits;
}

function disassembleFunction() {
  const limit = Math.min(rom.length, START + MAX_BYTES);
  const queue = [START];
  const visited = new Set();
  const insns = new Map();

  while (queue.length) {
    let pc = queue.shift();
    while (pc >= START && pc < limit && !visited.has(pc)) {
      visited.add(pc);
      const insn = decode(pc);
      insns.set(pc, insn);
      for (const target of insn.targets ?? []) {
        branchTargets.add(target);
        if (target >= START && target < limit && !visited.has(target)) queue.push(target);
      }
      pc += insn.len;
      if (insn.terminal) break;
    }
  }
  return [...insns.entries()].sort((a, b) => a[0] - b[0]);
}

const xrefs = scanXrefs();
const insns = disassembleFunction();
const last = insns.reduce((max, [addr, insn]) => Math.max(max, addr + insn.len), START);

console.log('=== probe-phase593: decode ROM function 0x023057 ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Start: ${hex(START)}`);
console.log(`Decode window: ${MAX_BYTES} bytes (${hex(START)}..${hex(START + MAX_BYTES - 1)})`);
console.log('');
console.log('Cross-references to 0x023057:');
for (const hit of xrefs) {
  console.log(`  ${hex(hit.addr)}: ${hit.kind} ${hex(START)}  bytes=${bytesAt(hit.addr, 4)}`);
}
if (!xrefs.length) console.log('  (none found)');
console.log('');
console.log('Disassembly:');
for (const [addr, insn] of insns) {
  const label = branchTargets.has(addr) || addr === START ? `${hex(addr)}:` : '        ';
  console.log(`${label}  ${bytesAt(addr, insn.len).padEnd(15)} ${insn.text}`);
}

const internalBranches = [...branchTargets].filter((target) => target >= START && target < START + MAX_BYTES).sort((a, b) => a - b);
const externalBranches = [...branchTargets].filter((target) => target < START || target >= START + MAX_BYTES).sort((a, b) => a - b);
console.log('');
console.log('Summary:');
console.log(`  Function bytes decoded: ${last - START} (${hex(START)}..${hex(last - 1)})`);
console.log(`  Function boundary: ${hex(START)} to ${hex(last)} (exclusive), bounded by terminal RET/JP or 256-byte window`);
console.log(`  Internal branch targets: ${internalBranches.length ? internalBranches.map((v) => hex(v)).join(', ') : '(none)'}`);
console.log(`  External branch targets: ${externalBranches.length ? externalBranches.map((v) => hex(v)).join(', ') : '(none)'}`);
console.log(`  CALL targets: ${callTargets.size ? [...callTargets].sort((a, b) => a - b).map((v) => hex(v)).join(', ') : '(none)'}`);
console.log(`  IY flag refs: ${iyRefs.length ? iyRefs.map((r) => `${hex(r.addr)} ${r.text}`).join('; ') : '(none)'}`);
console.log(`  Caller count: ${xrefs.length}`);
console.log('  Purpose hypothesis: stack frame / OS-core helper used before graph action dispatch; confirm by checking IY+0x4E guard refs above.');
