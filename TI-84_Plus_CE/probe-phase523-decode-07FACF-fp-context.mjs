import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07facf;
const MAX_BYTES = 220;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function u24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => hex(byte(addr + i))).join(' ');
}

function classifyAddress(addr) {
  if (addr >= 0xd00000 && addr <= 0xd3ffff) {
    if (addr >= 0xd02500 && addr <= 0xd025ff) return 'RAM, FP/OPS stack page';
    return 'RAM';
  }
  if (addr < rom.length) return 'ROM';
  return 'unknown';
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const conditions = new Map([
  [0xc0, 'NZ'],
  [0xc8, 'Z'],
  [0xd0, 'NC'],
  [0xd8, 'C'],
  [0xe0, 'PO'],
  [0xe8, 'PE'],
  [0xf0, 'P'],
  [0xf8, 'M'],
]);

const calls = [];
const jumps = [];
const reads = [];
const writes = [];
const control = [];

function recordMemory(kind, addr, source) {
  const item = { addr, source, className: classifyAddress(addr) };
  if (kind === 'read') reads.push(item);
  else writes.push(item);
}

function decodeCB(addr) {
  const op = byte(addr + 1);
  const bit = (op >> 3) & 7;
  const reg = r8[op & 7];
  if (op >= 0x40 && op <= 0x7f) return { len: 2, text: `BIT ${bit},${reg}` };
  if (op >= 0x80 && op <= 0xbf) return { len: 2, text: `RES ${bit},${reg}` };
  if (op >= 0xc0) return { len: 2, text: `SET ${bit},${reg}` };
  const cbOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  return { len: 2, text: `${cbOps[(op >> 3) & 7]} ${reg}` };
}

function decodeED(addr) {
  const op = byte(addr + 1);
  const known = new Map([
    [0x42, ['SBC HL,BC', 2]],
    [0x52, ['SBC HL,DE', 2]],
    [0x5a, ['ADC HL,DE', 2]],
    [0x72, ['SBC HL,SP', 2]],
    [0x7a, ['ADC HL,SP', 2]],
    [0xa0, ['LDI', 2]],
    [0xa8, ['LDD', 2]],
    [0xb0, ['LDIR', 2]],
    [0xb8, ['LDDR', 2]],
  ]);
  const hit = known.get(op);
  if (hit) return { text: hit[0], len: hit[1] };
  return { text: `ED ${hex(op)} ; unclassified`, len: 2 };
}

function decode(addr) {
  const op = byte(addr);

  if (op === 0xcb) return decodeCB(addr);
  if (op === 0xed) return decodeED(addr);

  if (op === 0xcd) {
    const target = u24(addr + 1);
    calls.push({ addr, target });
    return { len: 4, text: `CALL ${hex(target, 6)}` };
  }
  if (op === 0xc3 || op === 0xca || op === 0xc2 || op === 0xda || op === 0xd2) {
    const names = new Map([[0xc3, 'JP'], [0xca, 'JP Z'], [0xc2, 'JP NZ'], [0xda, 'JP C'], [0xd2, 'JP NC']]);
    const target = u24(addr + 1);
    jumps.push({ addr, target, kind: names.get(op) });
    return { len: 4, text: `${names.get(op)} ${hex(target, 6)}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const names = new Map([[0x18, 'JR'], [0x20, 'JR NZ'], [0x28, 'JR Z'], [0x30, 'JR NC'], [0x38, 'JR C']]);
    const target = addr + 2 + s8(byte(addr + 1));
    jumps.push({ addr, target, kind: names.get(op) });
    return { len: 2, text: `${names.get(op)} ${hex(target, 6)}` };
  }

  if (op === 0x3a) {
    const target = u24(addr + 1);
    recordMemory('read', target, 'LD A,(nn)');
    return { len: 4, text: `LD A,(${hex(target, 6)})` };
  }
  if (op === 0x32) {
    const target = u24(addr + 1);
    recordMemory('write', target, 'LD (nn),A');
    return { len: 4, text: `LD (${hex(target, 6)}),A` };
  }
  if (op === 0x2a) {
    const target = u24(addr + 1);
    recordMemory('read', target, 'LD HL,(nn)');
    return { len: 4, text: `LD HL,(${hex(target, 6)})` };
  }
  if (op === 0x22) {
    const target = u24(addr + 1);
    recordMemory('write', target, 'LD (nn),HL');
    return { len: 4, text: `LD (${hex(target, 6)}),HL` };
  }
  if (op === 0x21 || op === 0x11 || op === 0x01) {
    const names = new Map([[0x21, 'HL'], [0x11, 'DE'], [0x01, 'BC']]);
    return { len: 4, text: `LD ${names.get(op)},${hex(u24(addr + 1), 6)}` };
  }
  if (op === 0x31) return { len: 4, text: `LD SP,${hex(u24(addr + 1), 6)}` };
  if (op === 0x36) return { len: 2, text: `LD (HL),${hex(byte(addr + 1))}` };
  if (op === 0x3e) return { len: 2, text: `LD A,${hex(byte(addr + 1))}` };
  if (op === 0x06 || op === 0x0e || op === 0x16 || op === 0x1e || op === 0x26 || op === 0x2e) {
    const names = new Map([[0x06, 'B'], [0x0e, 'C'], [0x16, 'D'], [0x1e, 'E'], [0x26, 'H'], [0x2e, 'L']]);
    return { len: 2, text: `LD ${names.get(op)},${hex(byte(addr + 1))}` };
  }
  if (op === 0xfe) return { len: 2, text: `CP ${hex(byte(addr + 1))}` };
  if (op === 0xe6) return { len: 2, text: `AND ${hex(byte(addr + 1))}` };
  if (op === 0xf6) return { len: 2, text: `OR ${hex(byte(addr + 1))}` };

  if ((op & 0xc0) === 0x40 && op !== 0x76) {
    const dst = r8[(op >> 3) & 7];
    const src = r8[op & 7];
    return { len: 1, text: `LD ${dst},${src}` };
  }
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r8[(op >> 3) & 7]}` };

  const oneByte = new Map([
    [0x00, 'NOP'], [0x02, 'LD (BC),A'], [0x03, 'INC BC'], [0x07, 'RLCA'],
    [0x09, 'ADD HL,BC'], [0x0a, 'LD A,(BC)'], [0x0b, 'DEC BC'], [0x0f, 'RRCA'],
    [0x12, 'LD (DE),A'], [0x13, 'INC DE'], [0x17, 'RLA'], [0x19, 'ADD HL,DE'],
    [0x1a, 'LD A,(DE)'], [0x1b, 'DEC DE'], [0x1f, 'RRA'], [0x23, 'INC HL'],
    [0x27, 'DAA'], [0x29, 'ADD HL,HL'], [0x2b, 'DEC HL'], [0x2f, 'CPL'],
    [0x33, 'INC SP'], [0x37, 'SCF'], [0x39, 'ADD HL,SP'], [0x3b, 'DEC SP'],
    [0x3f, 'CCF'], [0x76, 'HALT'], [0x77, 'LD (HL),A'], [0x7e, 'LD A,(HL)'],
    [0x87, 'ADD A,A'], [0x90, 'SUB B'], [0x91, 'SUB C'], [0x92, 'SUB D'],
    [0x93, 'SUB E'], [0x94, 'SUB H'], [0x95, 'SUB L'], [0x97, 'SUB A'],
    [0xa0, 'AND B'], [0xa1, 'AND C'], [0xa7, 'AND A'], [0xaf, 'XOR A'],
    [0xb0, 'OR B'], [0xb1, 'OR C'], [0xb7, 'OR A'], [0xbf, 'CP A'],
    [0xc5, 'PUSH BC'], [0xc9, 'RET'], [0xd5, 'PUSH DE'], [0xe1, 'POP HL'],
    [0xe3, 'EX (SP),HL'], [0xe5, 'PUSH HL'], [0xe9, 'JP (HL)'], [0xeb, 'EX DE,HL'],
    [0xef, 'RST 0x28 ; bcall'], [0xf1, 'POP AF'], [0xf3, 'DI'], [0xf5, 'PUSH AF'],
    [0xf9, 'LD SP,HL'], [0xfb, 'EI'],
  ]);
  if (oneByte.has(op)) {
    const text = oneByte.get(op);
    if (text.startsWith('RET')) control.push({ addr, text });
    return { len: 1, text };
  }
  if (conditions.has(op)) {
    const text = `RET ${conditions.get(op)}`;
    control.push({ addr, text });
    return { len: 1, text };
  }

  return { len: 1, text: `DB ${hex(op)} ; unclassified` };
}

function disassemble() {
  const rows = [];
  let pc = START;
  const end = Math.min(rom.length, START + MAX_BYTES);
  while (pc < end) {
    const ins = decode(pc);
    rows.push({ addr: pc, len: ins.len, text: ins.text, raw: bytesAt(pc, ins.len) });
    pc += ins.len;
    if (ins.text === 'RET') break;
  }
  return rows;
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const rows = disassemble();
const ramReads = reads.filter((x) => x.className.startsWith('RAM'));
const ramWrites = writes.filter((x) => x.className.startsWith('RAM'));
const fpTouches = [...ramReads, ...ramWrites].filter((x) => x.addr >= 0xd02500 && x.addr <= 0xd025ff);

console.log('=== Probe phase 523: decode 0x07FACF FP/context setup ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range decoded: ${hex(START, 6)}..${hex(rows.at(-1).addr + rows.at(-1).len - 1, 6)} (${rows.length} instructions)`);
console.log('');

console.log('--- Disassembly (eZ80 ADL, linear through first RET or max window) ---');
for (const row of rows) {
  console.log(`${hex(row.addr, 6)}  ${row.raw.padEnd(17)}  ${row.text}`);
}
console.log('');

console.log('--- CALL / JP targets ---');
for (const call of calls) console.log(`${hex(call.addr, 6)}  CALL -> ${hex(call.target, 6)} (${classifyAddress(call.target)})`);
for (const jump of jumps) console.log(`${hex(jump.addr, 6)}  ${jump.kind} -> ${hex(jump.target, 6)} (${classifyAddress(jump.target)})`);
if (calls.length === 0 && jumps.length === 0) console.log('No CALL or JP/JR targets found in decoded window.');
console.log('');

console.log('--- Absolute memory references ---');
const allRefs = [
  ...reads.map((x) => ({ ...x, kind: 'read' })),
  ...writes.map((x) => ({ ...x, kind: 'write' })),
];
for (const ref of uniqBy(allRefs, (x) => `${x.kind}:${x.addr}:${x.source}`)) {
  console.log(`${ref.kind.toUpperCase().padEnd(5)} ${hex(ref.addr, 6)}  ${ref.className}  via ${ref.source}`);
}
if (allRefs.length === 0) console.log('No absolute nn memory references decoded. Check HL/DE indirect operations in the disassembly.');
console.log('');

console.log('--- FP/OPS stack focus ---');
if (fpTouches.length === 0) {
  console.log('No direct D025xx absolute references were decoded in this linear window.');
  console.log('If the routine touches the OPS stack, it likely does so indirectly through HL/DE or in a called helper.');
} else {
  for (const ref of fpTouches) console.log(`${hex(ref.addr, 6)} ${ref.className} via ${ref.source}`);
}
console.log('');

console.log('--- Structured interpretation ---');
console.log(`Entry ${hex(START, 6)} is decoded linearly because the caller at 0x09BB35 reaches it after PUSH AF.`);
console.log(`The probe separates direct absolute RAM references from ROM control transfers so the routine can be classified as FP stack setup, token context setup, or a helper trampoline.`);
console.log(`Direct RAM reads: ${ramReads.length}; direct RAM writes: ${ramWrites.length}; direct D025xx FP/OPS references: ${fpTouches.length}; calls: ${calls.length}; jumps: ${jumps.length}.`);
console.log('Review LD HL/DE/BC immediates followed by LD (HL),A, LD A,(HL), LDIR, or LDDR for indirect RAM movement; these are listed in the disassembly even when the exact target is data-dependent.');
