import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const START = 0x098a94;
const CONTEXT = [
  { name: 'frameCalc', addr: 0x098a3d, limit: 0x80 },
  { name: 'OP2 restorer', addr: 0x098a13, limit: 0x40 },
  { name: 'FP save to frame', addr: 0x0989e9, limit: 0x60 },
  { name: 'frame teardown', addr: START, limit: 0x40 },
];

function hex2(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function hex4(n) {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

function hex6(n) {
  return n.toString(16).toUpperCase().padStart(6, '0');
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

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex2(b(addr + i))).join(' ');
}

function rel(n) {
  return n < 0x80 ? n : n - 0x100;
}

function sdisp(n) {
  const d = rel(n);
  return d < 0 ? `-${hex2(-d)}` : `+${hex2(d)}`;
}

function jrTarget(addr) {
  return (addr + 2 + rel(b(addr + 1))) & 0xffffff;
}

const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const edRegs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

const calls = new Set();
const jumps = new Set();
const ramReads = new Set();
const ramWrites = new Set();
const ixOffsets = new Map();
const iyOffsets = new Map();
const decoded = new Map();

function noteOffset(map, off, use) {
  const key = rel(off);
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(use);
}

function classifyRamRead(addr) {
  ramReads.add(addr);
}

function classifyRamWrite(addr) {
  ramWrites.add(addr);
}

function decodeCb(addr) {
  const op = b(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return { size: 2, text: `CB ${hex2(op)} ; rotate/shift ${regs[z]}` };
  if (x === 1) return { size: 2, text: `BIT ${y},${regs[z]}` };
  if (x === 2) return { size: 2, text: `RES ${y},${regs[z]}` };
  return { size: 2, text: `SET ${y},${regs[z]}` };
}

function decodeEd(addr) {
  const op = b(addr + 1);
  if (op === 0xa0) return { size: 2, text: 'LDI' };
  if (op === 0xb0) return { size: 2, text: 'LDIR' };
  if (op === 0xa8) return { size: 2, text: 'LDD' };
  if (op === 0xb8) return { size: 2, text: 'LDDR' };
  if ((op & 0xc7) === 0x40) return { size: 2, text: `IN ${edRegs[(op >> 3) & 7]},(C)` };
  if ((op & 0xc7) === 0x41) return { size: 2, text: `OUT (C),${edRegs[(op >> 3) & 7]}` };
  if ((op & 0xcf) === 0x43) {
    const a = u16(addr + 2);
    classifyRamWrite(a);
    return { size: 4, text: `LD (${hex4(a)}),${rp[(op >> 4) & 3]}` };
  }
  if ((op & 0xcf) === 0x4b) {
    const a = u16(addr + 2);
    classifyRamRead(a);
    return { size: 4, text: `LD ${rp[(op >> 4) & 3]},(${hex4(a)})` };
  }
  return { size: 2, text: `ED ${hex2(op)}` };
}

function decodeIndex(addr, prefix) {
  const r = prefix === 0xdd ? 'IX' : 'IY';
  const map = prefix === 0xdd ? ixOffsets : iyOffsets;
  const op = b(addr + 1);

  if (op === 0xcb) {
    const d = b(addr + 2);
    const cb = b(addr + 3);
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    let action = 'rotate/shift';
    if (x === 1) action = `BIT ${y}`;
    if (x === 2) action = `RES ${y}`;
    if (x === 3) action = `SET ${y}`;
    noteOffset(map, d, action);
    return { size: 4, text: `${action},(${r}${sdisp(d)})${z === 6 ? '' : ` -> ${regs[z]}`}` };
  }

  if (op === 0x21) return { size: 4, text: `LD ${r},${hex4(u16(addr + 2))}` };
  if (op === 0x22) {
    const a = u16(addr + 2);
    classifyRamWrite(a);
    return { size: 4, text: `LD (${hex4(a)}),${r}` };
  }
  if (op === 0x2a) {
    const a = u16(addr + 2);
    classifyRamRead(a);
    return { size: 4, text: `LD ${r},(${hex4(a)})` };
  }
  if (op === 0x23) return { size: 2, text: `INC ${r}` };
  if (op === 0x2b) return { size: 2, text: `DEC ${r}` };
  if (op === 0x34) {
    const d = b(addr + 2);
    noteOffset(map, d, 'INC');
    return { size: 3, text: `INC (${r}${sdisp(d)})` };
  }
  if (op === 0x35) {
    const d = b(addr + 2);
    noteOffset(map, d, 'DEC');
    return { size: 3, text: `DEC (${r}${sdisp(d)})` };
  }
  if (op === 0x36) {
    const d = b(addr + 2);
    noteOffset(map, d, `LD n=${hex2(b(addr + 3))}`);
    return { size: 4, text: `LD (${r}${sdisp(d)}),${hex2(b(addr + 3))}` };
  }
  if (op === 0x39) return { size: 2, text: `ADD ${r},SP` };
  if (op === 0x7e) {
    const d = b(addr + 2);
    noteOffset(map, d, 'read A');
    return { size: 3, text: `LD A,(${r}${sdisp(d)})` };
  }
  if (op === 0x77) {
    const d = b(addr + 2);
    noteOffset(map, d, 'write A');
    return { size: 3, text: `LD (${r}${sdisp(d)}),A` };
  }
  if ((op & 0xc7) === 0x46) {
    const d = b(addr + 2);
    noteOffset(map, d, `read ${regs[(op >> 3) & 7]}`);
    return { size: 3, text: `LD ${regs[(op >> 3) & 7]},(${r}${sdisp(d)})` };
  }
  if ((op & 0xf8) === 0x70) {
    const d = b(addr + 2);
    noteOffset(map, d, `write ${regs[op & 7]}`);
    return { size: 3, text: `LD (${r}${sdisp(d)}),${regs[op & 7]}` };
  }
  if (op === 0xe1) return { size: 2, text: `POP ${r}` };
  if (op === 0xe5) return { size: 2, text: `PUSH ${r}` };
  if (op === 0xe9) return { size: 2, text: `JP (${r})`, stop: true };
  if (op === 0xf9) return { size: 2, text: `LD SP,${r}` };

  return { size: 2, text: `${r} prefix ${hex2(op)}` };
}

function decode(addr) {
  const op = b(addr);

  if (op === 0xcb) return decodeCb(addr);
  if (op === 0xed) return decodeEd(addr);
  if (op === 0xdd || op === 0xfd) return decodeIndex(addr, op);
  if (op === 0x40) {
    const inner = decode(addr + 1);
    return { ...inner, size: inner.size + 1, text: `SIS ${inner.text}` };
  }

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x3e) return { size: 2, text: `LD A,${hex2(b(addr + 1))}` };
  if (op === 0x06) return { size: 2, text: `LD B,${hex2(b(addr + 1))}` };
  if (op === 0x0e) return { size: 2, text: `LD C,${hex2(b(addr + 1))}` };
  if (op === 0x16) return { size: 2, text: `LD D,${hex2(b(addr + 1))}` };
  if (op === 0x1e) return { size: 2, text: `LD E,${hex2(b(addr + 1))}` };
  if (op === 0x26) return { size: 2, text: `LD H,${hex2(b(addr + 1))}` };
  if (op === 0x2e) return { size: 2, text: `LD L,${hex2(b(addr + 1))}` };
  if (op === 0x21) return { size: 3, text: `LD HL,${hex4(u16(addr + 1))}` };
  if (op === 0x11) return { size: 3, text: `LD DE,${hex4(u16(addr + 1))}` };
  if (op === 0x01) return { size: 3, text: `LD BC,${hex4(u16(addr + 1))}` };
  if (op === 0x31) return { size: 3, text: `LD SP,${hex4(u16(addr + 1))}` };
  if (op === 0x3a) {
    const a = u16(addr + 1);
    classifyRamRead(a);
    return { size: 3, text: `LD A,(${hex4(a)})` };
  }
  if (op === 0x32) {
    const a = u16(addr + 1);
    classifyRamWrite(a);
    return { size: 3, text: `LD (${hex4(a)}),A` };
  }
  if (op === 0x2a) {
    const a = u16(addr + 1);
    classifyRamRead(a);
    return { size: 3, text: `LD HL,(${hex4(a)})` };
  }
  if (op === 0x22) {
    const a = u16(addr + 1);
    classifyRamWrite(a);
    return { size: 3, text: `LD (${hex4(a)}),HL` };
  }
  if (op === 0xcd) {
    const target = u24(addr + 1);
    calls.add(target);
    return { size: 4, text: `CALL ${hex6(target)}`, call: target };
  }
  if (op === 0xc3) {
    const target = u24(addr + 1);
    jumps.add(target);
    return { size: 4, text: `JP ${hex6(target)}`, jump: target, stop: true };
  }
  if ([0xc2, 0xca, 0xd2, 0xda].includes(op)) {
    const target = u24(addr + 1);
    jumps.add(target);
    const name = { 0xc2: 'NZ', 0xca: 'Z', 0xd2: 'NC', 0xda: 'C' }[op];
    return { size: 4, text: `JP ${name},${hex6(target)}`, jump: target };
  }
  if (op === 0xc9) return { size: 1, text: 'RET', stop: true };
  if (op === 0x18) {
    const target = jrTarget(addr);
    jumps.add(target);
    return { size: 2, text: `JR ${hex6(target)}`, jump: target, stop: true };
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = jrTarget(addr);
    jumps.add(target);
    const name = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' }[op];
    return { size: 2, text: `JR ${name},${hex6(target)}`, jump: target };
  }
  if (op === 0xfe) return { size: 2, text: `CP ${hex2(b(addr + 1))}` };
  if (op === 0xb7) return { size: 1, text: 'OR A' };
  if (op === 0xa7) return { size: 1, text: 'AND A' };
  if (op === 0xaf) return { size: 1, text: 'XOR A' };
  if (op === 0x37) return { size: 1, text: 'SCF' };
  if (op === 0x3f) return { size: 1, text: 'CCF' };
  if ([0xc5, 0xd5, 0xe5, 0xf5].includes(op)) return { size: 1, text: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ([0xc1, 0xd1, 0xe1, 0xf1].includes(op)) return { size: 1, text: `POP ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xc0) === 0x40) return { size: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  if ((op & 0xc7) === 0x04) return { size: 1, text: `INC ${regs[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { size: 1, text: `DEC ${regs[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { size: 2, text: `LD ${regs[(op >> 3) & 7]},${hex2(b(addr + 1))}` };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}`, stop: true };
  if ((op & 0xc7) === 0xc2) {
    const target = u24(addr + 1);
    jumps.add(target);
    return { size: 4, text: `JP ${cc[(op >> 3) & 7]},${hex6(target)}`, jump: target };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = u24(addr + 1);
    calls.add(target);
    return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex6(target)}`, call: target };
  }

  return { size: 1, text: `DB ${hex2(op)}` };
}

function disassembleBlock(start, limit, label, depth = 0) {
  const end = Math.min(start + limit, rom.length);
  const lines = [];
  let pc = start;

  while (pc < end) {
    if (decoded.has(pc)) break;
    const inst = decode(pc);
    decoded.set(pc, inst);
    lines.push({ addr: pc, inst });
    pc += inst.size;
    if (inst.stop) break;
  }

  return { label, start, lines, depth };
}

const blocks = [];
const queue = CONTEXT.map((entry) => ({ ...entry, depth: 0 }));
const queued = new Set(queue.map((entry) => entry.addr));

for (let i = 0; i < queue.length; i++) {
  const item = queue[i];
  const block = disassembleBlock(item.addr, item.limit, item.name, item.depth);
  blocks.push(block);

  if (item.depth >= 3) continue;
  for (const { inst } of block.lines) {
    for (const target of [inst.call, inst.jump]) {
      if (typeof target !== 'number') continue;
      if (target >= rom.length || queued.has(target)) continue;
      queued.add(target);
      queue.push({
        name: `follow ${hex6(target)}`,
        addr: target,
        limit: 0x80,
        depth: item.depth + 1,
      });
    }
  }
}

function printSet(title, set, formatter = hex6) {
  console.log(`\n${title}:`);
  if (set.size === 0) {
    console.log('  (none)');
    return;
  }
  for (const value of [...set].sort((a, b) => a - b)) {
    console.log(`  ${formatter(value)}`);
  }
}

function printOffsets(title, map) {
  console.log(`\n${title}:`);
  if (map.size === 0) {
    console.log('  (none)');
    return;
  }
  for (const [off, uses] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    const label = off < 0 ? `-${hex2(-off)}` : `+${hex2(off)}`;
    console.log(`  ${label}: ${[...uses].sort().join(', ')}`);
  }
}

console.log('Phase 528 decode: 0x098A94 frame teardown');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Start: ${hex6(START)}`);

for (const block of blocks) {
  console.log(`\n== ${block.label} @ ${hex6(block.start)} ==`);
  for (const { addr, inst } of block.lines) {
    console.log(`${hex6(addr)}  ${bytes(addr, inst.size).padEnd(14)}  ${inst.text}`);
  }
}

printSet('CALL targets discovered', calls);
printSet('JP/JR targets discovered', jumps);
printSet('Absolute RAM reads discovered', ramReads, hex4);
printSet('Absolute RAM writes discovered', ramWrites, hex4);
printOffsets('IX-relative frame offsets discovered', ixOffsets);
printOffsets('IY-relative offsets discovered', iyOffsets);

console.log('\nFrame layout notes:');
console.log('  IX-09: OP1 save slot from the known 0x0989E9 frame-save routine.');
console.log('  IX-12: probable intermediate frame slot when frameCalc is called with L=F4.');
console.log('  IX-18: OP2 save/restore slot from the known 0x098A13 restorer and 0x0989E9 saver.');
console.log('  Other IX offsets above are raw discoveries from the decoded instruction stream.');

console.log('\nSummary:');
const teardownInsts = blocks.find((block) => block.start === START)?.lines.map(({ inst }) => inst.text) ?? [];
if (teardownInsts.some((text) => text === 'LD SP,IX') && teardownInsts.some((text) => text === 'POP IX')) {
  console.log('  0x098A94 is a conventional frame teardown: LD SP,IX restores SP to the frame base, then POP IX restores the caller frame pointer.');
  console.log('  The following instruction stream identifies whether the routine returns directly or chains into another epilogue target.');
} else {
  console.log('  0x098A94 did not decode as the expected LD SP,IX / POP IX sequence in this ROM image; inspect the byte listing above.');
}
