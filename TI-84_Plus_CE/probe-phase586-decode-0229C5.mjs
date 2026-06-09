import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0229c5;
const MAX_BYTES = 200;

const rom = readFileSync(ROM_PATH);
function b(addr) { return rom[addr] ?? 0; }
function u16(addr) { return b(addr) | (b(addr + 1) << 8); }
function u24(addr) { return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16); }
function s8(v) { return v & 0x80 ? v - 0x100 : v; }
function hex(v, width = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(width, '0'); }
function hx8(v) { return '0x' + (v & 0xff).toString(16).toUpperCase().padStart(2, '0'); }
function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => b(addr + i).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

const ramNames = new Map([
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd02510, 'expression buffer (65 bytes)'],
  [0xd0058c, 'pending key code'],
  [0xd0058e, 'key code'],
  [0xd02590, 'symbol table start'],
  [0xd00080, 'IY base (OS flags)'],
]);

function annotateRam(addr) {
  const exact = ramNames.get(addr);
  if (exact) return `${hex(addr)} ; ${exact}`;
  for (const [base, name] of ramNames) {
    if (addr > base && addr < base + 0x80) return `${hex(addr)} ; ${name} + ${hex(addr - base, 2)}`;
  }
  return hex(addr);
}

const calls = new Set();
const jumps = new Set();
const rams = new Set();
const iyRefs = [];
const ports = [];

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function maybeRam(addr) {
  if ((addr & 0xff0000) === 0xd00000) rams.add(addr);
}

function decodeEd(addr) {
  const op = b(addr + 1);
  if (op === 0x4b || op === 0x5b || op === 0x6b || op === 0x7b) {
    const target = u24(addr + 2);
    maybeRam(target);
    return { len: 5, text: `LD ${rp[(op >> 4) - 4]},(${annotateRam(target)})` };
  }
  if (op === 0x43 || op === 0x53 || op === 0x63 || op === 0x73) {
    const target = u24(addr + 2);
    maybeRam(target);
    return { len: 5, text: `LD (${annotateRam(target)}),${rp[(op >> 4) - 4]}` };
  }
  if ((op & 0xc7) === 0x40) {
    const reg = r[(op >> 3) & 7].replace('(HL)', 'F');
    ports.push(`IN ${reg},(C) @ ${hex(addr)}`);
    return { len: 2, text: `IN ${reg},(C)` };
  }
  if ((op & 0xc7) === 0x41) {
    const reg = r[(op >> 3) & 7].replace('(HL)', '0');
    ports.push(`OUT (C),${reg} @ ${hex(addr)}`);
    return { len: 2, text: `OUT (C),${reg}` };
  }
  const block = new Map([[0xa0, 'LDI'], [0xa1, 'CPI'], [0xa2, 'INI'], [0xa3, 'OUTI'], [0xa8, 'LDD'], [0xa9, 'CPD'], [0xaa, 'IND'], [0xab, 'OUTD'], [0xb0, 'LDIR'], [0xb1, 'CPIR'], [0xb2, 'INIR'], [0xb3, 'OTIR'], [0xb8, 'LDDR'], [0xb9, 'CPDR'], [0xba, 'INDR'], [0xbb, 'OTDR']]);
  if (block.has(op)) return { len: 2, text: block.get(op) };
  return { len: 2, text: `ED ${hx8(op)}` };
}

function decodeIndexed(addr, prefix) {
  const base = prefix === 0xfd ? 'IY' : 'IX';
  const op = b(addr + 1);
  if (op === 0xcb) {
    const d = s8(b(addr + 2));
    const cb = b(addr + 3);
    const group = cb >> 6;
    const bit = (cb >> 3) & 7;
    const target = `(${base}${d < 0 ? '-' : '+'}${hx8(Math.abs(d))})`;
    const name = group === 0 ? ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit] : group === 1 ? `BIT ${bit},` : group === 2 ? `RES ${bit},` : `SET ${bit},`;
    iyRefs.push(`${target} @ ${hex(addr)}`);
    return { len: 4, text: `${name}${group === 0 ? ' ' : ''}${target}` };
  }
  const dOps = new Set([0x34, 0x35, 0x36, 0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e, 0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe]);
  if (dOps.has(op)) {
    const d = s8(b(addr + 2));
    const mem = `(${base}${d < 0 ? '-' : '+'}${hx8(Math.abs(d))})`;
    const suffix = op === 0x36 ? `,${hx8(b(addr + 3))}` : '';
    const regLoad = (op & 0xc7) === 0x46 ? `LD ${r[(op >> 3) & 7]},${mem}` : (op & 0xf8) === 0x70 ? `LD ${mem},${r[op & 7]}` : null;
    iyRefs.push(`${mem} @ ${hex(addr)}`);
    if (op === 0x34) return { len: 3, text: `INC ${mem}` };
    if (op === 0x35) return { len: 3, text: `DEC ${mem}` };
    if (op === 0x36) return { len: 4, text: `LD ${mem}${suffix}` };
    if (regLoad) return { len: 3, text: regLoad };
    return { len: 3, text: `${alu[(op >> 3) & 7]} ${mem}` };
  }
  if (op === 0x21) return { len: 5, text: `LD ${base},${hex(u24(addr + 2))}` };
  if (op === 0x22 || op === 0x2a) {
    const target = u24(addr + 2);
    maybeRam(target);
    return { len: 5, text: op === 0x22 ? `LD (${annotateRam(target)}),${base}` : `LD ${base},(${annotateRam(target)})` };
  }
  if (op === 0xe5) return { len: 2, text: `PUSH ${base}` };
  if (op === 0xe1) return { len: 2, text: `POP ${base}` };
  return { len: 2, text: `${base} prefix ${hx8(op)}` };
}

function decode(addr) {
  const op = b(addr);
  if (op === 0xed) return decodeEd(addr);
  if (op === 0xdd || op === 0xfd) return decodeIndexed(addr, op);
  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0xc9) return { len: 1, text: 'RET', stop: true };
  if (op === 0xcd) {
    const target = u24(addr + 1);
    calls.add(target);
    return { len: 4, text: `CALL ${hex(target)}` };
  }
  if (op === 0xc3) {
    const target = u24(addr + 1);
    jumps.add(target);
    return { len: 4, text: `JP ${hex(target)}`, stop: true };
  }
  if ((op & 0xc7) === 0xc2) {
    const target = u24(addr + 1);
    jumps.add(target);
    return { len: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(target)}` };
  }
  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const target = addr + 2 + s8(b(addr + 1));
    jumps.add(target);
    const cond = op === 0x18 ? '' : `${cc[(op >> 3) & 3]},`;
    return { len: 2, text: `JR ${cond}${hex(target)}`, stop: op === 0x18 };
  }
  if (op === 0xdb) {
    ports.push(`IN A,(${hx8(b(addr + 1))}) @ ${hex(addr)}`);
    return { len: 2, text: `IN A,(${hx8(b(addr + 1))})` };
  }
  if (op === 0xd3) {
    ports.push(`OUT (${hx8(b(addr + 1))}),A @ ${hex(addr)}`);
    return { len: 2, text: `OUT (${hx8(b(addr + 1))}),A` };
  }
  if (op === 0x3e) return { len: 2, text: `LD A,${hx8(b(addr + 1))}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hx8(b(addr + 1))}` };
  if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(u24(addr + 1))}` };
  if (op === 0x32 || op === 0x3a) {
    const target = u24(addr + 1);
    maybeRam(target);
    return { len: 4, text: op === 0x32 ? `LD (${annotateRam(target)}),A` : `LD A,(${annotateRam(target)})` };
  }
  if (op === 0x22 || op === 0x2a) {
    const target = u24(addr + 1);
    maybeRam(target);
    return { len: 4, text: op === 0x22 ? `LD (${annotateRam(target)}),HL` : `LD HL,(${annotateRam(target)})` };
  }
  if ((op & 0xc0) === 0x40) return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc0) === 0x80) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}` };
  if ((op & 0xc7) === 0xc0) return { len: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0xc4) {
    const target = u24(addr + 1);
    calls.add(target);
    return { len: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(target)}` };
  }
  const one = new Map([[0x02, 'LD (BC),A'], [0x0a, 'LD A,(BC)'], [0x12, 'LD (DE),A'], [0x1a, 'LD A,(DE)'], [0x13, 'INC DE'], [0x1b, 'DEC DE'], [0x23, 'INC HL'], [0x2b, 'DEC HL'], [0x33, 'INC SP'], [0x3b, 'DEC SP'], [0x76, 'HALT'], [0xaf, 'XOR A'], [0xc5, 'PUSH BC'], [0xd5, 'PUSH DE'], [0xe5, 'PUSH HL'], [0xf5, 'PUSH AF'], [0xc1, 'POP BC'], [0xd1, 'POP DE'], [0xe1, 'POP HL'], [0xf1, 'POP AF'], [0xe9, 'JP (HL)'], [0xeb, 'EX DE,HL'], [0xf3, 'DI'], [0xfb, 'EI']]);
  if (one.has(op)) return { len: 1, text: one.get(op), stop: op === 0xe9 };
  return { len: 1, text: `DB ${hx8(op)}` };
}

const rows = [];
let pc = START;
const end = START + MAX_BYTES;
while (pc < end) {
  const ins = decode(pc);
  rows.push({ addr: pc, ...ins });
  pc += ins.len;
  if (ins.stop) break;
}

console.log('Phase 586: decode helper at 0x0229C5');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Function boundary: ${hex(START)} .. ${hex(pc - 1)} (${pc - START} bytes, stopped by ${rows.at(-1)?.text ?? 'limit'})`);
console.log('');
console.log('Disassembly:');
for (const row of rows) {
  console.log(`${hex(row.addr)}  ${bytesAt(row.addr, row.len).padEnd(15)}  ${row.text}`);
}

console.log('');
console.log('CALL targets:');
for (const target of [...calls].sort((a, b) => a - b)) console.log(`  ${hex(target)}`);
if (!calls.size) console.log('  none');

console.log('');
console.log('JP/JR targets:');
for (const target of [...jumps].sort((a, b) => a - b)) console.log(`  ${hex(target)}`);
if (!jumps.size) console.log('  none');

console.log('');
console.log('RAM references (0xD0xxxx):');
for (const target of [...rams].sort((a, b) => a - b)) console.log(`  ${annotateRam(target)}`);
if (!rams.size) console.log('  none');

console.log('');
console.log('IY/IX offset references:');
for (const ref of iyRefs) console.log(`  ${ref}`);
if (!iyRefs.length) console.log('  none');

console.log('');
console.log('Port I/O:');
for (const ref of ports) console.log(`  ${ref}`);
if (!ports.length) console.log('  none');

console.log('');
console.log('Summary:');
console.log('  Static decode of the helper called before type-0x09 event posting.');
console.log('  Review the RAM and IY references above to identify descriptor/key/expression-buffer preparation before the caller invokes 0x0236F9.');
