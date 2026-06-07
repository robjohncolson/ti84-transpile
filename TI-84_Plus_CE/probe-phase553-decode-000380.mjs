import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const START = 0x000380;
const WINDOW = 0x80;
const MAX_FOLLOW_DEPTH = 8;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function inRom(addr) {
  return addr >= 0 && addr < rom.length;
}

function u16(offset) {
  if (offset + 1 >= rom.length) return undefined;
  return rom[offset] | (rom[offset + 1] << 8);
}

function u24(offset) {
  if (offset + 2 >= rom.length) return undefined;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(offset, length) {
  return [...rom.subarray(offset, Math.min(offset + length, rom.length))]
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function decode(addr) {
  if (!inRom(addr)) {
    return { addr, size: 0, text: '<outside ROM>' };
  }

  const b0 = rom[addr];
  const b1 = rom[addr + 1];

  if (b0 === 0xED && b1 === 0xC3) {
    const target = u24(addr + 2);
    return { addr, size: 5, kind: 'jp', target, text: `JP ${hex(target)}` };
  }

  if (b0 === 0xED && b1 === 0xCD) {
    const target = u24(addr + 2);
    return { addr, size: 5, kind: 'call', target, text: `CALL ${hex(target)}` };
  }

  if (b0 === 0xC3) {
    const target = u16(addr + 1);
    return { addr, size: 3, kind: 'jp', target, text: `JP ${hex(target)}` };
  }

  if (b0 === 0xCD) {
    const target = u16(addr + 1);
    return { addr, size: 3, kind: 'call', target, text: `CALL ${hex(target)}` };
  }

  if (b0 === 0x21) {
    const imm24 = u24(addr + 1);
    return { addr, size: 4, kind: 'ld_hl', value: imm24, text: `LD HL,${hex(imm24)}` };
  }

  if (b0 === 0x11) {
    const imm24 = u24(addr + 1);
    return { addr, size: 4, kind: 'ld_de', value: imm24, text: `LD DE,${hex(imm24)}` };
  }

  if (b0 === 0x01) {
    const imm24 = u24(addr + 1);
    return { addr, size: 4, kind: 'ld_bc', value: imm24, text: `LD BC,${hex(imm24)}` };
  }

  if (b0 === 0x2A) {
    const ptr = u24(addr + 1);
    return { addr, size: 4, kind: 'ld_hl_mem', pointer: ptr, text: `LD HL,(${hex(ptr)})` };
  }

  if (b0 === 0x22) {
    const ptr = u24(addr + 1);
    return { addr, size: 4, kind: 'ld_mem_hl', pointer: ptr, text: `LD (${hex(ptr)}),HL` };
  }

  if (b0 === 0xE9) return { addr, size: 1, kind: 'jp_hl', text: 'JP (HL)' };
  if (b0 === 0xC9) return { addr, size: 1, kind: 'ret', text: 'RET' };
  if (b0 === 0xC0) return { addr, size: 1, kind: 'ret_cond', text: 'RET NZ' };
  if (b0 === 0xC8) return { addr, size: 1, kind: 'ret_cond', text: 'RET Z' };
  if (b0 === 0xD0) return { addr, size: 1, kind: 'ret_cond', text: 'RET NC' };
  if (b0 === 0xD8) return { addr, size: 1, kind: 'ret_cond', text: 'RET C' };
  if (b0 === 0xE0) return { addr, size: 1, kind: 'ret_cond', text: 'RET PO' };
  if (b0 === 0xE8) return { addr, size: 1, kind: 'ret_cond', text: 'RET PE' };
  if (b0 === 0xF0) return { addr, size: 1, kind: 'ret_cond', text: 'RET P' };
  if (b0 === 0xF8) return { addr, size: 1, kind: 'ret_cond', text: 'RET M' };

  const oneByte = new Map([
    [0x00, 'NOP'],
    [0x03, 'INC BC'],
    [0x04, 'INC B'],
    [0x05, 'DEC B'],
    [0x09, 'ADD HL,BC'],
    [0x0B, 'DEC BC'],
    [0x0C, 'INC C'],
    [0x0D, 'DEC C'],
    [0x13, 'INC DE'],
    [0x19, 'ADD HL,DE'],
    [0x1B, 'DEC DE'],
    [0x23, 'INC HL'],
    [0x29, 'ADD HL,HL'],
    [0x2B, 'DEC HL'],
    [0x33, 'INC SP'],
    [0x39, 'ADD HL,SP'],
    [0x3B, 'DEC SP'],
    [0x44, 'LD B,H'],
    [0x45, 'LD B,L'],
    [0x4C, 'LD C,H'],
    [0x4D, 'LD C,L'],
    [0x54, 'LD D,H'],
    [0x55, 'LD D,L'],
    [0x5C, 'LD E,H'],
    [0x5D, 'LD E,L'],
    [0x60, 'LD H,B'],
    [0x61, 'LD H,C'],
    [0x62, 'LD H,D'],
    [0x63, 'LD H,E'],
    [0x64, 'LD H,H'],
    [0x65, 'LD H,L'],
    [0x67, 'LD H,A'],
    [0x68, 'LD L,B'],
    [0x69, 'LD L,C'],
    [0x6A, 'LD L,D'],
    [0x6B, 'LD L,E'],
    [0x6C, 'LD L,H'],
    [0x6D, 'LD L,L'],
    [0x6F, 'LD L,A'],
    [0x78, 'LD A,B'],
    [0x79, 'LD A,C'],
    [0x7A, 'LD A,D'],
    [0x7B, 'LD A,E'],
    [0x7C, 'LD A,H'],
    [0x7D, 'LD A,L'],
    [0x7E, 'LD A,(HL)'],
    [0xEB, 'EX DE,HL'],
    [0xF9, 'LD SP,HL'],
  ]);

  if (oneByte.has(b0)) {
    return { addr, size: 1, text: oneByte.get(b0) };
  }

  const imm8 = new Map([
    [0x06, 'LD B'],
    [0x0E, 'LD C'],
    [0x16, 'LD D'],
    [0x1E, 'LD E'],
    [0x26, 'LD H'],
    [0x2E, 'LD L'],
    [0x3E, 'LD A'],
  ]);

  if (imm8.has(b0)) {
    return { addr, size: 2, text: `${imm8.get(b0)},${hex(rom[addr + 1], 2)}` };
  }

  return { addr, size: 1, text: `DB ${hex(b0, 2)}` };
}

function disassembleBlock(start, limit = WINDOW) {
  const rows = [];
  let pc = start;
  const end = Math.min(start + limit, rom.length);

  while (pc < end) {
    const ins = decode(pc);
    rows.push(ins);
    pc += Math.max(ins.size, 1);
    if (ins.kind === 'ret' || ins.kind === 'jp') break;
  }

  return rows;
}

function formatRows(rows) {
  for (const ins of rows) {
    const raw = bytesAt(ins.addr, Math.max(ins.size, 1)).padEnd(15);
    console.log(`  ${hex(ins.addr)}  ${raw}  ${ins.text}`);
  }
}

function traceEntrypoint(start) {
  const visited = new Set();
  const chain = [];
  let pc = start;
  let depth = 0;
  let hl = undefined;

  while (inRom(pc) && depth < MAX_FOLLOW_DEPTH && !visited.has(pc)) {
    visited.add(pc);
    const rows = disassembleBlock(pc);
    const refs = [];

    for (const ins of rows) {
      if (ins.kind === 'ld_hl') hl = ins.value;
      if (ins.kind === 'ld_hl_mem' && inRom(ins.pointer)) {
        hl = u24(ins.pointer);
      }
      if (ins.kind === 'jp' || ins.kind === 'call') refs.push(ins);
    }

    chain.push({ start: pc, rows, refs, inferredHl: hl });

    const terminalJump = rows.find((ins) => ins.kind === 'jp');
    if (!terminalJump || !inRom(terminalJump.target)) break;

    pc = terminalJump.target;
    depth += 1;
  }

  return { chain, inferredHl: hl };
}

function likelyGlyphTable(addr) {
  if (!inRom(addr)) return { ok: false, reason: 'outside ROM' };
  const sampleGlyphs = 16;
  const needed = sampleGlyphs * 28;
  if (addr + needed > rom.length) return { ok: false, reason: 'not enough bytes for sample' };

  const sample = rom.subarray(addr, addr + needed);
  const nonZero = sample.filter((b) => b !== 0).length;
  const ff = sample.filter((b) => b === 0xFF).length;
  return {
    ok: nonZero > 0 && nonZero < sample.length && ff < sample.length * 0.9,
    nonZero,
    bytes: sample.length,
    firstGlyph: bytesAt(addr, 28),
  };
}

console.log('=== Phase 553: Decode 0x000380 font base provider ===');
console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Entrypoint: ${hex(START)}`);
console.log('');

const initial = decode(START);
console.log('Vector check:');
console.log(`  ${hex(START)} ${bytesAt(START, Math.max(initial.size, 1))}  ${initial.text}`);
if (initial.kind === 'jp') {
  console.log(`  verdict: 0x000380 is a JP vector to ${hex(initial.target)}`);
} else {
  console.log('  verdict: 0x000380 does not begin with a decoded JP vector');
}
console.log('');

const trace = traceEntrypoint(START);
console.log('Disassembly trace:');
for (const block of trace.chain) {
  console.log(`\nBlock ${hex(block.start)}:`);
  formatRows(block.rows);
  if (block.refs.length > 0) {
    console.log('  references:');
    for (const ref of block.refs) {
      console.log(`    ${ref.kind.toUpperCase()} at ${hex(ref.addr)} -> ${hex(ref.target)} (${inRom(ref.target) ? 'in ROM' : 'outside ROM'})`);
    }
  }
}

console.log('');
console.log('HL return analysis:');
if (trace.inferredHl !== undefined) {
  const glyphCheck = likelyGlyphTable(trace.inferredHl);
  console.log(`  inferred HL/font base: ${hex(trace.inferredHl)}`);
  console.log(`  glyph-table sanity: ${glyphCheck.ok ? 'plausible' : 'not confirmed'} (${glyphCheck.reason ?? `${glyphCheck.nonZero}/${glyphCheck.bytes} non-zero sample bytes`})`);
  if (glyphCheck.firstGlyph) {
    console.log(`  first 28 bytes at base: ${glyphCheck.firstGlyph}`);
  }
} else {
  console.log('  inferred HL/font base: not resolved by this lightweight decoder');
  console.log('  note: inspect any decoded CALL target above for a callee that loads or returns HL');
}

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify({
  entrypoint: hex(START),
  isVector: initial.kind === 'jp',
  vectorTarget: initial.kind === 'jp' ? hex(initial.target) : null,
  inferredFontBase: trace.inferredHl === undefined ? null : hex(trace.inferredHl),
  followedBlocks: trace.chain.map((block) => hex(block.start)),
  references: trace.chain.flatMap((block) => block.refs.map((ref) => ({
    at: hex(ref.addr),
    kind: ref.kind,
    target: hex(ref.target),
    inRom: inRom(ref.target),
  }))),
}, null, 2));
