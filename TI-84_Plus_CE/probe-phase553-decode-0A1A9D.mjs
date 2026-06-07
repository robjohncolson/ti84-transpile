#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';
const IY_BASE = 0xD00080;
const MIN_TRACE_BYTES = 0x80;
const MAX_TRACE_INSTRUCTIONS = 256;

const TARGETS = [
  { entry: 0x0A1A9D, label: '0x0A1A9D framebuffer row address (first)' },
  { entry: 0x0A1B1C, label: '0x0A1B1C framebuffer row address (second)' },
];

const KNOWN_DATA_ADDRS = {
  0xD0059C: 'framebuffer pointer (vram base)',
  0xD008D5: 'display coord save',
  0xD005A1: 'glyph header',
  0xD005A4: 'glyph height',
  0xD005A5: 'glyph data start',
  0xD02A76: 'display y coord',
  0xD006C0: 'display buffer',
  0xD020A6: 'mode buffer',
};

const KNOWN_CODE_TARGETS = {
  0x0A1A9D: 'framebuffer row addr (this fn)',
  0x0A1B1C: 'framebuffer row addr (second fn)',
  0x0A23E5: 'character renderer blit loop',
  0x0A23C0: 'pre-render setup',
  0x07BF3E: 'glyph table lookup',
  0x04C979: 'char width clipping',
  0x0A26D6: 'renderer early exit',
};

const GEOMETRY_CONSTANTS = {
  0x0140: '320 decimal — framebuffer row stride (8bpp or half-row 16bpp)',
  0x0280: '640 decimal — full row stride at 16bpp (320px x 2B)',
  0x00F0: '240 — LCD height pixels',
};

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function read16LE(buffer, offset) {
  return ((buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8)) >>> 0;
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesHex(buffer) {
  return Array.from(buffer, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return hex(value, 4);
  if (modePrefix === 'sil' || modePrefix === 'lil') return hex(value, 6);
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function formatSignedDisplacement(displacement) {
  const magnitude = Math.abs(displacement);
  const sign = displacement < 0 ? '-' : '+';
  return `${sign}${hex(magnitude, magnitude <= 0xFF ? 2 : 4)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatSignedDisplacement(displacement)})`;
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function fallbackFormat(inst) {
  const skip = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag']);
  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'number') {
      if (key === 'displacement') parts.push(`${key}=${value >= 0 ? `+${value}` : `${value}`}`);
      else if (key === 'bit') parts.push(`${key}=${value}`);
      else parts.push(`${key}=${hex(value, value <= 0xFF ? 2 : 6)}`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return withPrefix(inst, parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

function formatInstruction(inst) {
  if (!inst || !inst.tag) return '???';
  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'NOP');
    case 'ret': return withPrefix(inst, 'RET');
    case 'reti': return withPrefix(inst, 'RETI');
    case 'retn': return withPrefix(inst, 'RETN');
    case 'ret-conditional': return withPrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'call': return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'jp': return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `JP (${String(inst.indirectRegister ?? inst.reg ?? 'hl').toUpperCase()})`);
    case 'jr': return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return withPrefix(inst, `PUSH ${String(inst.pair).toUpperCase()}`);
    case 'pop': return withPrefix(inst, `POP ${String(inst.pair).toUpperCase()}`);
    case 'inc-reg': return withPrefix(inst, `INC ${String(inst.reg).toUpperCase()}`);
    case 'dec-reg': return withPrefix(inst, `DEC ${String(inst.reg).toUpperCase()}`);
    case 'inc-pair': return withPrefix(inst, `INC ${String(inst.pair).toUpperCase()}`);
    case 'dec-pair': return withPrefix(inst, `DEC ${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-imm': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${hexByte(inst.value)}`);
    case 'ld-pair-imm': return withPrefix(inst, `LD ${String(inst.pair).toUpperCase()},${formatValue(inst.value, inst.modePrefix)}`);
    case 'ld-reg-reg': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`);
    case 'ld-reg-mem':
    case 'ld-a-mem': return withPrefix(inst, `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`);
    case 'ld-mem-reg':
    case 'ld-mem-a': return withPrefix(inst, `LD (${hex(inst.addr ?? inst.address)}),${String(inst.src ?? 'a').toUpperCase()}`);
    case 'ld-pair-mem': return withPrefix(inst, `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`);
    case 'ld-mem-pair': return withPrefix(inst, `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-ind': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`);
    case 'ld-ind-reg': return withPrefix(inst, `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`);
    case 'ld-reg-ixd': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg': return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`);
    case 'ld-ixd-imm': return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hexByte(inst.value)}`);
    case 'ld-pair-indexed': return withPrefix(inst, `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair': return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`);
    case 'ld-ixiy-indexed': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy': return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`);
    case 'alu-imm':
      if (inst.op === 'cp') return withPrefix(inst, `CP ${hexByte(inst.value)}`);
      if (inst.op === 'sub') return withPrefix(inst, `SUB ${hexByte(inst.value)}`);
      if (inst.op === 'and') return withPrefix(inst, `AND ${hexByte(inst.value)}`);
      if (inst.op === 'xor') return withPrefix(inst, `XOR ${hexByte(inst.value)}`);
      if (inst.op === 'or') return withPrefix(inst, `OR ${hexByte(inst.value)}`);
      return withPrefix(inst, `${String(inst.op).toUpperCase()} A,${hexByte(inst.value)}`);
    case 'alu-reg':
      if (inst.op === 'cp') return withPrefix(inst, `CP ${String(inst.src).toUpperCase()}`);
      if (inst.op === 'sub') return withPrefix(inst, `SUB ${String(inst.src).toUpperCase()}`);
      if (inst.op === 'and') return withPrefix(inst, `AND ${String(inst.src).toUpperCase()}`);
      if (inst.op === 'xor') return withPrefix(inst, `XOR ${String(inst.src).toUpperCase()}`);
      if (inst.op === 'or') return withPrefix(inst, `OR ${String(inst.src).toUpperCase()}`);
      return withPrefix(inst, `${String(inst.op).toUpperCase()} A,${String(inst.src).toUpperCase()}`);
    case 'alu-ixd':
      if (inst.op === 'cp') return withPrefix(inst, `CP ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      if (inst.op === 'sub') return withPrefix(inst, `SUB ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      if (inst.op === 'and') return withPrefix(inst, `AND ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      if (inst.op === 'xor') return withPrefix(inst, `XOR ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      if (inst.op === 'or') return withPrefix(inst, `OR ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      return withPrefix(inst, `${String(inst.op).toUpperCase()} A,${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'bit-test': return withPrefix(inst, `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`);
    case 'bit-test-ind': return withPrefix(inst, `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`);
    case 'indexed-cb-bit': return withPrefix(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set': return withPrefix(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res': return withPrefix(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'inc-ixd': return withPrefix(inst, `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withPrefix(inst, `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'in-reg': return withPrefix(inst, `IN ${String(inst.reg ?? inst.dest).toUpperCase()},(C)`);
    case 'out-reg': return withPrefix(inst, `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`);
    case 'in0': return withPrefix(inst, `IN0 ${String(inst.reg).toUpperCase()},(${hexByte(inst.port)})`);
    case 'out0': return withPrefix(inst, `OUT0 (${hexByte(inst.port)}),${String(inst.reg).toUpperCase()}`);
    case 'add-pair': return withPrefix(inst, `ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`);
    case 'adc-pair': return withPrefix(inst, `ADC ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`);
    case 'sbc-pair': return withPrefix(inst, `SBC ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`);
    case 'mlt': return withPrefix(inst, `MLT ${String(inst.pair).toUpperCase()}`);
    case 'ex-sp-pair': return withPrefix(inst, `EX (SP),${String(inst.pair ?? 'hl').toUpperCase()}`);
    case 'ex-de-hl': return withPrefix(inst, 'EX DE,HL');
    case 'ex-af': return withPrefix(inst, "EX AF,AF'");
    case 'exx': return withPrefix(inst, 'EXX');
    case 'ldir': return withPrefix(inst, 'LDIR');
    case 'lddr': return withPrefix(inst, 'LDDR');
    case 'ldi': return withPrefix(inst, 'LDI');
    case 'ldd': return withPrefix(inst, 'LDD');
    case 'cpir': return withPrefix(inst, 'CPIR');
    case 'cpdr': return withPrefix(inst, 'CPDR');
    case 'cpi': return withPrefix(inst, 'CPI');
    case 'cpd': return withPrefix(inst, 'CPD');
    case 'di': return withPrefix(inst, 'DI');
    case 'ei': return withPrefix(inst, 'EI');
    case 'im': return withPrefix(inst, `IM ${inst.mode ?? inst.value ?? 0}`);
    case 'halt': return withPrefix(inst, 'HALT');
    case 'slp': return withPrefix(inst, 'SLP');
    case 'scf': return withPrefix(inst, 'SCF');
    case 'ccf': return withPrefix(inst, 'CCF');
    case 'cpl': return withPrefix(inst, 'CPL');
    case 'neg': return withPrefix(inst, 'NEG');
    case 'daa': return withPrefix(inst, 'DAA');
    case 'rla': return withPrefix(inst, 'RLA');
    case 'rra': return withPrefix(inst, 'RRA');
    case 'rlca': return withPrefix(inst, 'RLCA');
    case 'rrca': return withPrefix(inst, 'RRCA');
    case 'rl-reg': return withPrefix(inst, `RL ${String(inst.reg).toUpperCase()}`);
    case 'rr-reg': return withPrefix(inst, `RR ${String(inst.reg).toUpperCase()}`);
    case 'rlc-reg': return withPrefix(inst, `RLC ${String(inst.reg).toUpperCase()}`);
    case 'rrc-reg': return withPrefix(inst, `RRC ${String(inst.reg).toUpperCase()}`);
    case 'sla-reg': return withPrefix(inst, `SLA ${String(inst.reg).toUpperCase()}`);
    case 'sra-reg': return withPrefix(inst, `SRA ${String(inst.reg).toUpperCase()}`);
    case 'srl-reg': return withPrefix(inst, `SRL ${String(inst.reg).toUpperCase()}`);
    case 'bit-set': return withPrefix(inst, `SET ${inst.bit},${String(inst.reg).toUpperCase()}`);
    case 'bit-res': return withPrefix(inst, `RES ${inst.bit},${String(inst.reg).toUpperCase()}`);
    case 'ld-sp-pair': return withPrefix(inst, `LD SP,${String(inst.pair ?? 'hl').toUpperCase()}`);
    case 'set-ind': return withPrefix(inst, `SET ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`);
    case 'res-ind': return withPrefix(inst, `RES ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`);
    default: return fallbackFormat(inst);
  }
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return { pc, length: 1, nextPc: pc + 1, tag: 'db', value: rom[pc] ?? 0, mode: MODE, modePrefix: null };
  }
}

function isConditionalBranch(inst) {
  return inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz';
}
function isUnconditionalJump(inst) {
  return inst.tag === 'jp' || inst.tag === 'jr';
}
function isCallLike(inst) {
  return inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst';
}
function isTerminator(inst) {
  return inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'jp-indirect' || inst.tag === 'halt' || inst.tag === 'slp';
}

function traceFunction(rom, entry) {
  const queue = [entry];
  const decoded = new Map();
  let order = 0;
  let totalBytes = 0;

  while (queue.length > 0 && decoded.size < MAX_TRACE_INSTRUCTIONS) {
    let pc = queue.shift();
    while (pc >= 0 && pc < rom.length && !decoded.has(pc) && decoded.size < MAX_TRACE_INSTRUCTIONS) {
      const inst = safeDecode(rom, pc);
      const item = {
        ...inst,
        order: order += 1,
        bytes: bytesHex(rom.subarray(pc, pc + inst.length)),
        text: formatInstruction(inst),
      };
      decoded.set(pc, item);
      totalBytes += inst.length;

      if (isCallLike(inst)) {
        pc = inst.fallthrough ?? inst.nextPc ?? (pc + inst.length);
        continue;
      }
      if (isConditionalBranch(inst)) {
        if (typeof inst.target === 'number' && !decoded.has(inst.target)) queue.push(inst.target);
        if (typeof inst.fallthrough === 'number') { pc = inst.fallthrough; continue; }
        break;
      }
      if (inst.tag === 'ret-conditional') {
        if (typeof inst.fallthrough === 'number') { pc = inst.fallthrough; continue; }
        break;
      }
      if (isUnconditionalJump(inst)) {
        if (typeof inst.target === 'number' && !decoded.has(inst.target)) queue.push(inst.target);
        break;
      }
      if (isTerminator(inst)) break;
      pc = inst.nextPc ?? (pc + inst.length);
    }
    if (totalBytes >= MIN_TRACE_BYTES && queue.length === 0) break;
  }

  return {
    instructions: Array.from(decoded.values()).sort((left, right) => left.pc - right.pc),
    totalBytes,
  };
}

function resolveIndexedAddress(inst) {
  if (inst.indexRegister !== 'iy' || typeof inst.displacement !== 'number') return null;
  return (IY_BASE + inst.displacement) & 0xFFFFFF;
}

function labelAddress(addr) {
  if (Object.prototype.hasOwnProperty.call(KNOWN_DATA_ADDRS, addr)) return `${hex(addr)} ${KNOWN_DATA_ADDRS[addr]}`;
  if (addr >= IY_BASE && addr < IY_BASE + 0x100) return `${hex(addr)} (IY+${hex(addr - IY_BASE, 2)})`;
  return hex(addr);
}

function collectMemoryAccesses(instructions) {
  const accesses = new Map();
  function add(addr, kind, pc) {
    if (addr === null || addr === undefined) return;
    const entry = accesses.get(addr) ?? { addr, reads: [], writes: [] };
    if (kind === 'read') entry.reads.push(pc);
    if (kind === 'write') entry.writes.push(pc);
    accesses.set(addr, entry);
  }
  for (const inst of instructions) {
    const iyAddr = resolveIndexedAddress(inst);
    switch (inst.tag) {
      case 'ld-reg-mem': case 'ld-a-mem': case 'ld-pair-mem':
        add(inst.addr, 'read', inst.pc); break;
      case 'ld-mem-reg': case 'ld-mem-a': case 'ld-mem-pair':
        add(inst.addr, 'write', inst.pc); break;
      case 'ld-reg-ixd': case 'ld-pair-indexed': case 'ld-ixiy-indexed':
        add(iyAddr, 'read', inst.pc); break;
      case 'ld-ixd-reg': case 'ld-ixd-imm': case 'ld-indexed-pair': case 'ld-indexed-ixiy':
        add(iyAddr, 'write', inst.pc); break;
      case 'alu-ixd': case 'indexed-cb-bit':
        add(iyAddr, 'read', inst.pc); break;
      case 'indexed-cb-set': case 'indexed-cb-res':
        add(iyAddr, 'read', inst.pc); add(iyAddr, 'write', inst.pc); break;
    }
  }
  return accesses;
}

function detectMultiplicationPatterns(instructions) {
  const patterns = [];
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst.tag === 'mlt') {
      patterns.push({ type: 'MLT', pc: inst.pc, detail: `MLT ${String(inst.pair).toUpperCase()} — 8x8 multiply in ${String(inst.pair).toUpperCase()}` });
    }
    if (inst.tag === 'add-pair' && inst.dest === 'hl' && inst.src === 'hl') {
      patterns.push({ type: 'SHL', pc: inst.pc, detail: 'ADD HL,HL — shift HL left by 1 (x2)' });
    }
    if (inst.tag === 'add-pair' && inst.dest === 'hl' && (inst.src === 'de' || inst.src === 'bc')) {
      patterns.push({ type: 'ADD', pc: inst.pc, detail: `ADD HL,${String(inst.src).toUpperCase()} — accumulate offset` });
    }
    if (inst.tag === 'sla-reg') {
      patterns.push({ type: 'SLA', pc: inst.pc, detail: `SLA ${String(inst.reg).toUpperCase()} — shift left (x2)` });
    }
    if (inst.tag === 'srl-reg') {
      patterns.push({ type: 'SRL', pc: inst.pc, detail: `SRL ${String(inst.reg).toUpperCase()} — shift right (/2)` });
    }
    if (inst.tag === 'rl-reg') {
      patterns.push({ type: 'RL', pc: inst.pc, detail: `RL ${String(inst.reg).toUpperCase()} — rotate left through carry` });
    }
  }
  return patterns;
}

function detectGeometryConstants(instructions) {
  const found = [];
  const geometryValues = new Set([0x0140, 0x0280, 0x00F0, 320, 640, 240]);
  for (const inst of instructions) {
    let value = null;
    if (inst.tag === 'ld-pair-imm') value = inst.value;
    if (inst.tag === 'ld-reg-imm') value = inst.value;
    if (inst.tag === 'alu-imm') value = inst.value;

    if (value !== null && geometryValues.has(value)) {
      const meaning = GEOMETRY_CONSTANTS[value] ?? `${value} decimal`;
      found.push({ pc: inst.pc, value, text: inst.text ?? formatInstruction(inst), meaning });
    }
  }
  return found;
}

// === Main ===

const rom = fs.readFileSync(ROM_PATH);
if (rom.length !== EXPECTED_ROM_SIZE) {
  console.error(`ERROR: ROM size ${rom.length} !== expected ${EXPECTED_ROM_SIZE}`);
  process.exit(1);
}

console.log('=== PROBE phase553: Decode 0x0A1A9D and 0x0A1B1C (framebuffer row address) ===\n');
console.log('Context: These two functions are called from the blit loop (0x0A24C8-0x0A2536).');
console.log('They compute framebuffer addresses from x,y pixel coordinates.');
console.log('Framebuffer pointer at D0059C, row strides 0x140 (320B) or 0x280 (640B).\n');

for (const target of TARGETS) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`=== ${target.label} ===`);
  console.log(`${'='.repeat(72)}\n`);

  // Raw bytes
  const rawStart = target.entry;
  const rawLen = 64;
  console.log(`Raw bytes at ${hex(rawStart)}:`);
  const rawBytes = rom.subarray(rawStart, rawStart + rawLen);
  for (let row = 0; row < rawLen; row += 16) {
    const slice = rawBytes.subarray(row, Math.min(row + 16, rawLen));
    console.log(`  ${hex(rawStart + row)}: ${bytesHex(slice)}`);
  }
  console.log('');

  // Trace the function
  const trace = traceFunction(rom, target.entry);
  console.log(`Disassembly (${trace.instructions.length} instructions, ${trace.totalBytes} bytes):\n`);

  for (const inst of trace.instructions) {
    const addrStr = hex(inst.pc);
    const bytePad = inst.bytes.padEnd(20);
    let annotation = '';

    if (typeof inst.addr === 'number' && KNOWN_DATA_ADDRS[inst.addr]) {
      annotation = ` ; ${KNOWN_DATA_ADDRS[inst.addr]}`;
    }
    if (typeof inst.target === 'number' && KNOWN_CODE_TARGETS[inst.target]) {
      annotation = ` ; ${KNOWN_CODE_TARGETS[inst.target]}`;
    }
    const iyAddr = resolveIndexedAddress(inst);
    if (iyAddr !== null) {
      annotation = ` ; ${labelAddress(iyAddr)}`;
    }

    console.log(`  ${addrStr}: ${bytePad} ${inst.text}${annotation}`);
  }

  // Memory accesses
  const accesses = collectMemoryAccesses(trace.instructions);
  if (accesses.size > 0) {
    console.log(`\n  Memory accesses:`);
    for (const [addr, entry] of [...accesses.entries()].sort((a, b) => a[0] - b[0])) {
      const rw = [];
      if (entry.reads.length) rw.push(`R x${entry.reads.length} at ${entry.reads.map(p => hex(p)).join(',')}`);
      if (entry.writes.length) rw.push(`W x${entry.writes.length} at ${entry.writes.map(p => hex(p)).join(',')}`);
      console.log(`    ${labelAddress(addr)}: ${rw.join(' | ')}`);
    }
  }

  // Multiplication patterns
  const mults = detectMultiplicationPatterns(trace.instructions);
  if (mults.length > 0) {
    console.log(`\n  Multiplication / shift patterns:`);
    for (const m of mults) {
      console.log(`    ${hex(m.pc)}: ${m.detail}`);
    }
  }

  // Geometry constants
  const geom = detectGeometryConstants(trace.instructions);
  if (geom.length > 0) {
    console.log(`\n  Geometry constants detected:`);
    for (const g of geom) {
      console.log(`    ${hex(g.pc)}: ${g.text} — ${g.meaning}`);
    }
  }

  // Calls made
  const calls = trace.instructions.filter(i => i.tag === 'call' || i.tag === 'call-conditional');
  if (calls.length > 0) {
    console.log(`\n  Calls made:`);
    for (const c of calls) {
      const label = KNOWN_CODE_TARGETS[c.target] ?? '';
      console.log(`    ${hex(c.pc)}: CALL ${hex(c.target)} ${label}`);
    }
  }

  console.log('');
}

// Cross-reference: check if the two functions share code
console.log('\n=== CROSS-REFERENCE ===\n');
const trace1 = traceFunction(rom, TARGETS[0].entry);
const trace2 = traceFunction(rom, TARGETS[1].entry);
const pcs1 = new Set(trace1.instructions.map(i => i.pc));
const pcs2 = new Set(trace2.instructions.map(i => i.pc));
const shared = [...pcs1].filter(pc => pcs2.has(pc));
if (shared.length > 0) {
  console.log(`Shared code addresses (${shared.length}):`);
  for (const pc of shared.sort((a, b) => a - b)) {
    console.log(`  ${hex(pc)}`);
  }
} else {
  console.log('No shared code between the two functions.');
}

const gap = TARGETS[1].entry - TARGETS[0].entry;
console.log(`\nDistance between entries: ${gap} bytes (${hex(gap)})`);
console.log(`0x0A1A9D ends at approximately ${hex(TARGETS[0].entry + trace1.totalBytes)}`);
console.log(`0x0A1B1C ends at approximately ${hex(TARGETS[1].entry + trace2.totalBytes)}`);

// Summary analysis
console.log('\n=== ANALYSIS SUMMARY ===\n');
console.log('Expected pattern for y*stride+x*bpp+base:');
console.log('  1. Load y coordinate');
console.log('  2. Multiply by row stride (320 or 640) using MLT or ADD HL,HL chain');
console.log('  3. Add x*2 (16bpp) for column offset');
console.log('  4. Add framebuffer base from (D0059C)');
console.log('  5. Return address in HL\n');

const allMults1 = detectMultiplicationPatterns(trace1.instructions);
const allMults2 = detectMultiplicationPatterns(trace2.instructions);
console.log(`Function 1 (0x0A1A9D): ${allMults1.length} multiply/shift ops, ${trace1.totalBytes} bytes`);
console.log(`Function 2 (0x0A1B1C): ${allMults2.length} multiply/shift ops, ${trace2.totalBytes} bytes`);

console.log('\n=== DONE ===');
