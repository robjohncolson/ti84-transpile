import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = readFileSync(ROM_PATH);

const TARGETS = [
  { name: 'exit path 0x07F7FA (bit6 clear)', start: 0x07f7fa },
  { name: 'exit path 0x07EFF0 (bit6 set)', start: 0x07eff0 },
];

const KNOWN = new Map([
  [0x0a1799, 'glyph/rasterizer candidate'],
  [0x07c8b7, 'BCD position calc'],
  [0x07f7fa, 'numeric renderer exit path A'],
  [0x07eff0, 'numeric renderer exit path B'],
]);

const RST_NAMES = new Map([
  [0x00, 'RST 00h'],
  [0x08, 'RST 08h'],
  [0x10, 'RST 10h'],
  [0x18, 'RST 18h'],
  [0x20, 'RST 20h'],
  [0x28, 'RST 28h'],
  [0x30, 'RST 30h'],
  [0x38, 'RST 38h'],
]);

const CONDITIONS = new Map([
  [0x20, 'NZ'],
  [0x28, 'Z'],
  [0x30, 'NC'],
  [0x38, 'C'],
  [0xc2, 'NZ'],
  [0xca, 'Z'],
  [0xd2, 'NC'],
  [0xda, 'C'],
  [0xe2, 'PO'],
  [0xea, 'PE'],
  [0xf2, 'P'],
  [0xfa, 'M'],
  [0xc4, 'NZ'],
  [0xcc, 'Z'],
  [0xd4, 'NC'],
  [0xdc, 'C'],
  [0xe4, 'PO'],
  [0xec, 'PE'],
  [0xf4, 'P'],
  [0xfc, 'M'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function b(addr) {
  return rom[addr] ?? 0;
}

function w16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function w24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function byteList(addr, len) {
  return Array.from({ length: len }, (_, i) => b(addr + i).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function classifyAddress(addr) {
  if (addr >= 0xd40000 && addr <= 0xd7ffff) return 'VRAM';
  if (addr >= 0xd00000 && addr <= 0xffffff) return 'RAM/MMIO';
  if (addr < rom.length) return 'ROM';
  return 'external/unknown';
}

function knownName(addr) {
  const name = KNOWN.get(addr);
  return name ? ` ; ${name}` : '';
}

function decodeCB(addr, prefix = '') {
  const op = b(addr + 1);
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (group === 0) return { len: 2, text: `${ops[bit]} ${prefix || reg}` };
  if (group === 1) return { len: 2, text: `BIT ${bit},${prefix || reg}` };
  if (group === 2) return { len: 2, text: `RES ${bit},${prefix || reg}` };
  return { len: 2, text: `SET ${bit},${prefix || reg}` };
}

function decodeIndexedCB(addr, index) {
  const off = signed8(b(addr + 2));
  const op = b(addr + 3);
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const disp = `${index}${off < 0 ? '-' : '+'}${hex(Math.abs(off), 2)}`;
  if (group === 1) return { len: 4, text: `BIT ${bit},(${disp})`, iyAccess: { index, off, kind: 'bit' } };
  if (group === 2) return { len: 4, text: `RES ${bit},(${disp})`, iyAccess: { index, off, kind: 'write' } };
  if (group === 3) return { len: 4, text: `SET ${bit},(${disp})`, iyAccess: { index, off, kind: 'write' } };
  const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  return { len: 4, text: `${ops[bit]} (${disp})`, iyAccess: { index, off, kind: 'write' } };
}

function decode(addr) {
  const op = b(addr);

  if (op === 0xdd || op === 0xfd) {
    const index = op === 0xdd ? 'IX' : 'IY';
    const op2 = b(addr + 1);
    if (op2 === 0xcb) return decodeIndexedCB(addr, index);
    if (op2 === 0x21) return { len: 5, text: `LD ${index},${hex(w24(addr + 2))}` };
    if (op2 === 0x22) return { len: 5, text: `LD (${hex(w24(addr + 2))}),${index}`, mem: [{ kind: 'write', addr: w24(addr + 2) }] };
    if (op2 === 0x2a) return { len: 5, text: `LD ${index},(${hex(w24(addr + 2))})`, mem: [{ kind: 'read', addr: w24(addr + 2) }] };
    if ([0x34, 0x35].includes(op2)) {
      const off = signed8(b(addr + 2));
      return { len: 3, text: `${op2 === 0x34 ? 'INC' : 'DEC'} (${index}${off < 0 ? '-' : '+'}${hex(Math.abs(off), 2)})`, iyAccess: { index, off, kind: 'write' } };
    }
    if ([0x36, 0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e].includes(op2)) {
      const off = signed8(b(addr + 2));
      const regs = new Map([[0x46, 'B'], [0x4e, 'C'], [0x56, 'D'], [0x5e, 'E'], [0x66, 'H'], [0x6e, 'L'], [0x7e, 'A'], [0x70, 'B'], [0x71, 'C'], [0x72, 'D'], [0x73, 'E'], [0x74, 'H'], [0x75, 'L'], [0x77, 'A']]);
      const disp = `(${index}${off < 0 ? '-' : '+'}${hex(Math.abs(off), 2)})`;
      if (op2 === 0x36) return { len: 4, text: `LD ${disp},${hex(b(addr + 3), 2)}`, iyAccess: { index, off, kind: 'write' } };
      if (op2 < 0x70 || op2 === 0x7e) return { len: 3, text: `LD ${regs.get(op2)},${disp}`, iyAccess: { index, off, kind: 'read' } };
      return { len: 3, text: `LD ${disp},${regs.get(op2)}`, iyAccess: { index, off, kind: 'write' } };
    }
    return { len: 2, text: `${index} prefix opcode ${hex(op2, 2)}` };
  }

  if (op === 0xcb) return decodeCB(addr);
  if (op === 0xc9) return { len: 1, text: 'RET', stop: true };
  if (op === 0xd9) return { len: 1, text: 'EXX' };
  if (op === 0xeb) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { len: 1, text: 'DI' };
  if (op === 0xfb) return { len: 1, text: 'EI' };
  if (op === 0x76) return { len: 1, text: 'HALT', stop: true };

  if (op === 0xcd) {
    const target = w24(addr + 1);
    return { len: 4, text: `CALL ${hex(target)}${knownName(target)}`, call: target };
  }
  if (CONDITIONS.has(op) && (op & 0xc7) === 0xc4) {
    const target = w24(addr + 1);
    return { len: 4, text: `CALL ${CONDITIONS.get(op)},${hex(target)}${knownName(target)}`, call: target };
  }
  if (op === 0xc3) {
    const target = w24(addr + 1);
    return { len: 4, text: `JP ${hex(target)}${knownName(target)}`, jump: target, stop: true };
  }
  if (CONDITIONS.has(op) && (op & 0xc7) === 0xc2) {
    const target = w24(addr + 1);
    return { len: 4, text: `JP ${CONDITIONS.get(op)},${hex(target)}${knownName(target)}`, branch: target };
  }
  if (op === 0x18 || op === 0x10 || CONDITIONS.has(op) && op < 0x40) {
    const target = (addr + 2 + signed8(b(addr + 1))) & 0xffffff;
    const mnemonic = op === 0x18 ? 'JR' : op === 0x10 ? 'DJNZ' : `JR ${CONDITIONS.get(op)}`;
    return { len: 2, text: `${mnemonic},${hex(target)}`, branch: target, stop: op === 0x18 };
  }

  if (op === 0x3a) {
    const memAddr = w24(addr + 1);
    return { len: 4, text: `LD A,(${hex(memAddr)}) ; ${classifyAddress(memAddr)} read`, mem: [{ kind: 'read', addr: memAddr }] };
  }
  if (op === 0x32) {
    const memAddr = w24(addr + 1);
    return { len: 4, text: `LD (${hex(memAddr)}),A ; ${classifyAddress(memAddr)} write`, mem: [{ kind: 'write', addr: memAddr }] };
  }
  if (op === 0x21) return { len: 4, text: `LD HL,${hex(w24(addr + 1))}` };
  if (op === 0x11) return { len: 4, text: `LD DE,${hex(w24(addr + 1))}` };
  if (op === 0x01) return { len: 4, text: `LD BC,${hex(w24(addr + 1))}` };
  if (op === 0x31) return { len: 4, text: `LD SP,${hex(w24(addr + 1))}` };
  if ([0x06, 0x0e, 0x16, 0x1e, 0x26, 0x2e, 0x36, 0x3e, 0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe].includes(op)) {
    const names = new Map([[0x06, 'LD B'], [0x0e, 'LD C'], [0x16, 'LD D'], [0x1e, 'LD E'], [0x26, 'LD H'], [0x2e, 'LD L'], [0x36, 'LD (HL)'], [0x3e, 'LD A'], [0xc6, 'ADD A'], [0xce, 'ADC A'], [0xd6, 'SUB'], [0xde, 'SBC A'], [0xe6, 'AND'], [0xee, 'XOR'], [0xf6, 'OR'], [0xfe, 'CP']]);
    return { len: 2, text: `${names.get(op)},${hex(b(addr + 1), 2)}` };
  }
  if ((op & 0xc7) === 0x06) {
    return { len: 2, text: `LD r${(op >> 3) & 7},${hex(b(addr + 1), 2)}` };
  }
  if ((op & 0xc7) === 0xc7) {
    return { len: 1, text: RST_NAMES.get(op & 0x38) ?? `RST ${hex(op & 0x38, 2)}` };
  }

  const oneByte = new Map([
    [0x00, 'NOP'], [0x02, 'LD (BC),A'], [0x03, 'INC BC'], [0x04, 'INC B'], [0x05, 'DEC B'],
    [0x07, 'RLCA'], [0x08, 'EX AF,AF`'], [0x09, 'ADD HL,BC'], [0x0a, 'LD A,(BC)'], [0x0b, 'DEC BC'],
    [0x0c, 'INC C'], [0x0d, 'DEC C'], [0x0f, 'RRCA'], [0x12, 'LD (DE),A'], [0x13, 'INC DE'],
    [0x14, 'INC D'], [0x15, 'DEC D'], [0x17, 'RLA'], [0x19, 'ADD HL,DE'], [0x1a, 'LD A,(DE)'],
    [0x1b, 'DEC DE'], [0x1c, 'INC E'], [0x1d, 'DEC E'], [0x1f, 'RRA'], [0x23, 'INC HL'],
    [0x24, 'INC H'], [0x25, 'DEC H'], [0x27, 'DAA'], [0x29, 'ADD HL,HL'], [0x2b, 'DEC HL'],
    [0x2c, 'INC L'], [0x2d, 'DEC L'], [0x2f, 'CPL'], [0x33, 'INC SP'], [0x34, 'INC (HL)'],
    [0x35, 'DEC (HL)'], [0x37, 'SCF'], [0x39, 'ADD HL,SP'], [0x3b, 'DEC SP'], [0x3c, 'INC A'],
    [0x3d, 'DEC A'], [0x3f, 'CCF'], [0x77, 'LD (HL),A'], [0x7e, 'LD A,(HL)'], [0xaf, 'XOR A'],
    [0xb7, 'OR A'], [0xc1, 'POP BC'], [0xc5, 'PUSH BC'], [0xd1, 'POP DE'], [0xd5, 'PUSH DE'],
    [0xe1, 'POP HL'], [0xe3, 'EX (SP),HL'], [0xe5, 'PUSH HL'], [0xe9, 'JP (HL)'], [0xf1, 'POP AF'],
    [0xf5, 'PUSH AF'], [0xf9, 'LD SP,HL'],
  ]);
  if (oneByte.has(op)) return { len: 1, text: oneByte.get(op) };
  if (op >= 0x40 && op <= 0x7f) return { len: 1, text: `LD r${(op >> 3) & 7},r${op & 7}` };
  if (op >= 0x80 && op <= 0xbf) return { len: 1, text: `ALU ${hex(op, 2)}` };

  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function mapFunction(target) {
  const queue = [target.start];
  const seen = new Set();
  const instructions = [];
  const calls = new Set();
  const branches = new Set();
  const mem = [];
  const indexAccesses = [];
  let bytesCovered = 0;

  while (queue.length && bytesCovered < 260) {
    let pc = queue.shift();
    let localBytes = 0;

    while (!seen.has(pc) && pc >= target.start - 0x200 && pc < rom.length && localBytes < 180 && bytesCovered < 260) {
      const ins = decode(pc);
      seen.add(pc);
      instructions.push({ addr: pc, bytes: byteList(pc, ins.len), ...ins });
      bytesCovered += ins.len;
      localBytes += ins.len;

      if (ins.call !== undefined) calls.add(ins.call);
      if (ins.branch !== undefined) {
        branches.add(ins.branch);
        if (!seen.has(ins.branch) && Math.abs(ins.branch - target.start) < 0x300) queue.push(ins.branch);
      }
      if (ins.jump !== undefined) {
        branches.add(ins.jump);
        if (!KNOWN.has(ins.jump) && !seen.has(ins.jump) && Math.abs(ins.jump - target.start) < 0x300) queue.push(ins.jump);
      }
      if (ins.mem) mem.push(...ins.mem);
      if (ins.iyAccess) indexAccesses.push({ addr: pc, ...ins.iyAccess });

      pc += ins.len;
      if (ins.stop) break;
    }
  }

  return { ...target, instructions: instructions.sort((a, b) => a.addr - b.addr), bytesCovered, calls, branches, mem, indexAccesses };
}

function formatSet(set) {
  if (!set.size) return 'none observed';
  return [...set].sort((a, b) => a - b).map((addr) => `${hex(addr)}${knownName(addr)}`).join(', ');
}

function printFunction(result) {
  console.log(`\n=== ${result.name} @ ${hex(result.start)} ===`);
  console.log(`Decoded bytes: ${result.bytesCovered} (${result.bytesCovered >= 100 ? 'meets' : 'below'} 100-byte target)`);
  console.log('');

  for (const ins of result.instructions) {
    const padded = ins.bytes.padEnd(14, ' ');
    console.log(`${hex(ins.addr)}  ${padded}  ${ins.text}`);
  }

  const callsRasterizer = result.calls.has(0x0a1799);
  const callsBcdPos = result.calls.has(0x07c8b7);
  const vram = result.mem.filter((entry) => entry.addr >= 0xd40000 && entry.addr <= 0xd7ffff);
  const ram = result.mem.filter((entry) => entry.addr >= 0xd00000 && entry.addr <= 0xffffff);
  const indexedWrites = result.indexAccesses.filter((entry) => entry.kind === 'write');
  const cursorLike = [
    ...result.mem.filter((entry) => entry.kind === 'write' && entry.addr >= 0xd00000 && entry.addr <= 0xffffff),
    ...indexedWrites,
  ];

  console.log('\n--- Summary ---');
  console.log(`Calls: ${formatSet(result.calls)}`);
  console.log(`Branches/Jumps: ${formatSet(result.branches)}`);
  console.log(`Calls rasterizer ${hex(0x0a1799)}: ${callsRasterizer ? 'yes' : 'no direct call observed'}`);
  console.log(`Calls BCD position calc ${hex(0x07c8b7)}: ${callsBcdPos ? 'yes' : 'no direct call observed'}`);
  console.log(`Direct VRAM absolute accesses: ${vram.length ? vram.map((m) => `${m.kind} ${hex(m.addr)}`).join(', ') : 'none observed'}`);
  console.log(`Direct RAM/MMIO absolute accesses: ${ram.length ? ram.map((m) => `${m.kind} ${hex(m.addr)}`).join(', ') : 'none observed'}`);
  console.log(`Indexed IX/IY accesses: ${result.indexAccesses.length ? result.indexAccesses.map((m) => `${hex(m.addr)} ${m.kind} (${m.index}${m.off < 0 ? '-' : '+'}${hex(Math.abs(m.off), 2)})`).join(', ') : 'none observed'}`);
  console.log(`Cursor/position advance evidence: ${cursorLike.length ? 'possible writes to RAM/indexed state observed' : 'no direct cursor-state write observed'}`);
}

// Deep subroutine follow: decode each CALL target recursively (2 levels)
function followSubroutine(addr, maxBytes) {
  const instructions = [];
  let pc = addr;
  const end = addr + maxBytes;
  const subcalls = new Set();
  const mem = [];
  const indexAccesses = [];

  while (pc < end) {
    const ins = decode(pc);
    instructions.push({ addr: pc, bytes: byteList(pc, ins.len), ...ins });
    if (ins.call !== undefined) subcalls.add(ins.call);
    if (ins.mem) mem.push(...ins.mem);
    if (ins.iyAccess) indexAccesses.push({ addr: pc, ...ins.iyAccess });
    pc += ins.len;
    if (ins.stop) break;
  }

  return { instructions, subcalls, mem, indexAccesses, bytesCovered: pc - addr };
}

function printSubroutine(name, addr, maxBytes, depth = 0) {
  const indent = '  '.repeat(depth);
  const result = followSubroutine(addr, maxBytes);
  console.log(`${indent}--- ${name} @ ${hex(addr)} (${result.bytesCovered} bytes) ---`);
  for (const ins of result.instructions) {
    console.log(`${indent}${hex(ins.addr)}  ${ins.bytes.padEnd(14)}  ${ins.text}`);
  }

  // Summarize memory accesses
  if (result.mem.length) {
    console.log(`${indent}  Memory accesses:`);
    for (const m of result.mem) {
      console.log(`${indent}    ${m.kind} ${hex(m.addr)} [${classifyAddress(m.addr)}]`);
    }
  }
  if (result.indexAccesses.length) {
    console.log(`${indent}  Indexed accesses:`);
    for (const ia of result.indexAccesses) {
      console.log(`${indent}    ${hex(ia.addr)} ${ia.kind} (${ia.index}${ia.off < 0 ? '-' : '+'}${hex(Math.abs(ia.off), 2)})`);
    }
  }

  // Follow subcalls one more level if depth < 2
  if (depth < 2) {
    for (const target of result.subcalls) {
      if (KNOWN.has(target)) {
        console.log(`${indent}  [Known target: ${hex(target)} = ${KNOWN.get(target)}]`);
      } else {
        console.log('');
        printSubroutine(`sub_${hex(target)}`, target, 120, depth + 1);
      }
    }
  }

  return result;
}

console.log(`Loaded ${ROM_PATH}: ${rom.length} bytes`);
const results = TARGETS.map(mapFunction);
for (const result of results) printFunction(result);

// Now follow ALL called subroutines deeply
console.log('\n\n========== DEEP SUBROUTINE ANALYSIS ==========');

for (const result of results) {
  console.log(`\n\n### Deep follow for ${result.name} @ ${hex(result.start)} ###`);
  for (const callTarget of result.calls) {
    if (KNOWN.has(callTarget)) {
      console.log(`\n[Known: ${hex(callTarget)} = ${KNOWN.get(callTarget)}]`);
    } else {
      console.log('');
      printSubroutine(`sub_${hex(callTarget)}`, callTarget, 150, 0);
    }
  }
}

console.log('\n\n=== Cross-path conclusion hints ===');
for (const result of results) {
  const vramWrites = result.mem.some((entry) => entry.kind === 'write' && entry.addr >= 0xd40000 && entry.addr <= 0xd7ffff);
  const stateWrites = result.mem.some((entry) => entry.kind === 'write' && entry.addr >= 0xd00000 && entry.addr <= 0xffffff) ||
    result.indexAccesses.some((entry) => entry.kind === 'write');
  const renderCalls = result.calls.has(0x0a1799) || result.calls.has(0x07c8b7);
  console.log(`${hex(result.start)}: render-related direct calls=${renderCalls ? 'yes' : 'no'}, direct VRAM writes=${vramWrites ? 'yes' : 'no'}, cursor/state writes=${stateWrites ? 'yes' : 'no'}`);
}

// Follow JP targets found in subroutines
console.log('\n\n========== JP TARGETS FROM SUBROUTINES ==========');
const extraTargets = [
  { name: 'JP target from 0x07C9AF loop (0x07FAC2)', addr: 0x07FAC2 },
  { name: 'JP target from end of 0x07C9AF (0x07FE1A)', addr: 0x07FE1A },
];
for (const t of extraTargets) {
  console.log('');
  printSubroutine(t.name, t.addr, 150, 0);
}

// Dump the lookup tables referenced by 0x07FE65 and 0x07FE2F
console.log('\n\n========== LOOKUP TABLES ==========');
console.log('Table at 0x07FE8A (referenced by 0x07FE2F and 0x07FE65):');
const table8A = [];
for (let i = 0; i < 16; i++) table8A.push(rom[0x07FE8A + i].toString(16).toUpperCase().padStart(2, '0'));
console.log('  ' + table8A.join(' '));

console.log('Table at 0x07FE91 (CPIR search table from 0x07FE65):');
const table91 = [];
for (let i = 0; i < 16; i++) table91.push(rom[0x07FE91 + i].toString(16).toUpperCase().padStart(2, '0'));
console.log('  ' + table91.join(' '));

// Follow additional discovered targets
const moreTargets = [
  { name: 'JR target from 0x07FAC2 (0x07FA7A)', addr: 0x07FA7A },
  { name: 'JP to 0x061D02 (from 0x07FE1A)', addr: 0x061D02 },
  { name: 'JR NZ fallthrough 0x07FE85 (from 0x07FE65)', addr: 0x07FE85 },
  { name: 'JR Z target 0x07FE43 (from 0x07FE2F)', addr: 0x07FE43 },
  { name: 'JR target 0x07FE49 (from 0x07FE2F)', addr: 0x07FE49 },
  { name: 'JR target 0x07FA86 (from 0x07FA82)', addr: 0x07FA86 },
  { name: 'JR target 0x061D24 (from 0x061D04)', addr: 0x061D24 },
];
for (const t of moreTargets) {
  console.log('');
  printSubroutine(t.name, t.addr, 100, 0);
}

// Dump the BCD buffer area at D005F8-D00610
console.log('\nRAM addresses referenced:');
console.log('  D005F8 — BCD number buffer / flag byte (both paths read/write)');
console.log('  D005F9 — digit count / position');
console.log('  D005FA — BCD digit data start');
console.log('  D00601 — BCD digit data (upper portion)');
console.log('  D00603 — second buffer (loaded by 0x07F7FA second pass)');

// Note about ED 6F = RLD (Rotate Left Digit)
console.log('\nNote: ED 6F at 0x07FB48 area = RLD instruction (BCD rotate left digit through accumulator)');
console.log('  This confirms 0x07FB48 is a BCD digit shift/clear routine.');
console.log('  RLD rotates the low nibble of (HL) left into the high nibble, old high nibble into A low nibble.');

// Additional: check if any sub-calls eventually reach rasterizer or BCD calc
console.log('\n=== Transitive call chain analysis ===');
function traceCallsDeep(addr, maxDepth, visited = new Set()) {
  if (visited.has(addr) || maxDepth <= 0) return new Set();
  visited.add(addr);
  const result = followSubroutine(addr, 200);
  const allCalls = new Set(result.subcalls);
  for (const sub of result.subcalls) {
    if (!KNOWN.has(sub)) {
      for (const deep of traceCallsDeep(sub, maxDepth - 1, visited)) {
        allCalls.add(deep);
      }
    } else {
      allCalls.add(sub);
    }
  }
  return allCalls;
}

for (const target of TARGETS) {
  const allTransitive = traceCallsDeep(target.start, 4);
  console.log(`\n${target.name} @ ${hex(target.start)} — all transitive calls (up to depth 4):`);
  for (const addr of [...allTransitive].sort((a, b) => a - b)) {
    console.log(`  ${hex(addr)}${knownName(addr)}`);
  }
  console.log(`  Reaches rasterizer: ${allTransitive.has(0x0a1799) ? 'YES' : 'no'}`);
  console.log(`  Reaches BCD calc:   ${allTransitive.has(0x07c8b7) ? 'YES' : 'no'}`);
}
