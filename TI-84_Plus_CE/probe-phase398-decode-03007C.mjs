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

const TARGET_ENTRY = 0x03007C;
const TARGET_LABEL = '0x03007C key dispatch (translated key code in A)';

const KNOWN_DATA_ADDRS = {
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0xD0058F: 'key state',
  0xD007E0: 'mode byte',
  0x09F79B: 'translation table',
};

const KNOWN_CODE_TARGETS = {
  0x02FD99: 'common dispatcher tail',
  0x02237E: 'post-translation commit',
  0x03007C: 'key dispatch (this function)',
  0x030084: 'local port-write helper',
  0x0301F6: 'mode-normalization',
  0x04CA87: 'key handler lookup (low-range adapter)',
  0x04CA94: 'key handler lookup (high-range adapter)',
};

const CONTROL_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL' },
  { opcode: 0xC4, mnemonic: 'CALL NZ' },
  { opcode: 0xCC, mnemonic: 'CALL Z' },
  { opcode: 0xD4, mnemonic: 'CALL NC' },
  { opcode: 0xDC, mnemonic: 'CALL C' },
  { opcode: 0xE4, mnemonic: 'CALL PO' },
  { opcode: 0xEC, mnemonic: 'CALL PE' },
  { opcode: 0xF4, mnemonic: 'CALL P' },
  { opcode: 0xFC, mnemonic: 'CALL M' },
  { opcode: 0xC3, mnemonic: 'JP' },
  { opcode: 0xC2, mnemonic: 'JP NZ' },
  { opcode: 0xCA, mnemonic: 'JP Z' },
  { opcode: 0xD2, mnemonic: 'JP NC' },
  { opcode: 0xDA, mnemonic: 'JP C' },
  { opcode: 0xE2, mnemonic: 'JP PO' },
  { opcode: 0xEA, mnemonic: 'JP PE' },
  { opcode: 0xF2, mnemonic: 'JP P' },
  { opcode: 0xFA, mnemonic: 'JP M' },
];

const PREFIX_PATTERNS = [
  { prefix: 0x52, label: 'SIL', width: 3 },
  { prefix: 0x5B, label: 'LIL', width: 3 },
  { prefix: 0x40, label: 'SIS', width: 2 },
  { prefix: 0x49, label: 'LIS', width: 2 },
];

const CONTROL_BY_OPCODE = new Map(CONTROL_PATTERNS.map((entry) => [entry.opcode, entry]));
const PREFIX_BY_OPCODE = new Map(PREFIX_PATTERNS.map((entry) => [entry.prefix, entry]));

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

function widthForValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return 4;
  if (modePrefix === 'sil' || modePrefix === 'lil') return 6;
  if (value <= 0xFF) return 2;
  if (value <= 0xFFFF) return 4;
  return 6;
}

function formatValue(value, modePrefix = null) {
  return hex(value, widthForValue(value, modePrefix));
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
  const skip = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'tag',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'number') {
      if (key === 'displacement') {
        parts.push(`${key}=${value >= 0 ? `+${value}` : `${value}`}`);
      } else if (key === 'bit') {
        parts.push(`${key}=${value}`);
      } else {
        parts.push(`${key}=${hex(value, value <= 0xFF ? 2 : 6)}`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return withPrefix(inst, parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

function formatInstruction(inst) {
  if (!inst || !inst.tag) return '???';

  switch (inst.tag) {
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'reti':
      return withPrefix(inst, 'RETI');
    case 'retn':
      return withPrefix(inst, 'RETN');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(
        inst,
        `JP (${String(inst.indirectRegister ?? inst.reg ?? 'hl').toUpperCase()})`,
      );
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`);
    case 'djnz':
      return withPrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${String(inst.pair).toUpperCase()}`);
    case 'pop':
      return withPrefix(inst, `POP ${String(inst.pair).toUpperCase()}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${String(inst.reg).toUpperCase()}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${String(inst.reg).toUpperCase()}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${String(inst.pair).toUpperCase()}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${hexByte(inst.value)}`);
    case 'ld-pair-imm':
      return withPrefix(
        inst,
        `LD ${String(inst.pair).toUpperCase()},${formatValue(inst.value, inst.modePrefix)}`,
      );
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`);
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return withPrefix(
        inst,
        `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`,
      );
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return withPrefix(
        inst,
        `LD (${hex(inst.addr ?? inst.address)}),${String(inst.src ?? 'a').toUpperCase()}`,
      );
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`);
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`,
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`,
      );
    case 'ld-ixd-imm':
      return withPrefix(
        inst,
        `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hexByte(inst.value)}`,
      );
    case 'ld-pair-indexed':
      return withPrefix(
        inst,
        `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`,
      );
    case 'ld-indexed-pair':
      return withPrefix(
        inst,
        `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`,
      );
    case 'ld-ixiy-indexed':
      return withPrefix(
        inst,
        `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`,
      );
    case 'ld-indexed-ixiy':
      return withPrefix(
        inst,
        `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`,
      );
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
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`);
    case 'bit-test-ind':
      return withPrefix(inst, `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'inc-ixd':
      return withPrefix(inst, `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd':
      return withPrefix(inst, `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${String(inst.reg ?? inst.dest).toUpperCase()},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`);
    case 'in0':
      return withPrefix(inst, `IN0 ${String(inst.reg).toUpperCase()},(${hexByte(inst.port)})`);
    case 'out0':
      return withPrefix(inst, `OUT0 (${hexByte(inst.port)}),${String(inst.reg).toUpperCase()}`);
    default:
      return fallbackFormat(inst);
  }
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      mode: MODE,
      modePrefix: null,
    };
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
  return (
    inst.tag === 'ret' ||
    inst.tag === 'reti' ||
    inst.tag === 'retn' ||
    inst.tag === 'jp-indirect' ||
    inst.tag === 'halt' ||
    inst.tag === 'slp'
  );
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
        if (typeof inst.target === 'number' && !decoded.has(inst.target)) {
          queue.push(inst.target);
        }
        if (typeof inst.fallthrough === 'number') {
          pc = inst.fallthrough;
          continue;
        }
        break;
      }

      if (inst.tag === 'ret-conditional') {
        if (typeof inst.fallthrough === 'number') {
          pc = inst.fallthrough;
          continue;
        }
        break;
      }

      if (isUnconditionalJump(inst)) {
        if (typeof inst.target === 'number' && !decoded.has(inst.target)) {
          queue.push(inst.target);
        }
        break;
      }

      if (isTerminator(inst)) {
        break;
      }

      pc = inst.nextPc ?? (pc + inst.length);
    }

    if (totalBytes >= MIN_TRACE_BYTES && queue.length === 0) {
      break;
    }
  }

  return {
    instructions: Array.from(decoded.values()).sort((left, right) => left.order - right.order),
    totalBytes,
  };
}

function resolveIndexedAddress(inst) {
  if (inst.indexRegister !== 'iy' || typeof inst.displacement !== 'number') {
    return null;
  }
  return (IY_BASE + inst.displacement) & 0xFFFFFF;
}

function labelAddress(addr) {
  if (Object.prototype.hasOwnProperty.call(KNOWN_DATA_ADDRS, addr)) {
    return `${hex(addr)} ${KNOWN_DATA_ADDRS[addr]}`;
  }
  if (addr >= IY_BASE && addr < IY_BASE + 0x100) {
    return `${hex(addr)} (IY+${hex(addr - IY_BASE, 2)})`;
  }
  return hex(addr);
}

function annotationForInstruction(inst) {
  const notes = new Set();

  if (typeof inst.addr === 'number') {
    notes.add(labelAddress(inst.addr));
  }

  const indexedAddr = resolveIndexedAddress(inst);
  if (indexedAddr !== null) {
    notes.add(labelAddress(indexedAddr));
  }

  if (
    typeof inst.target === 'number' &&
    (inst.tag === 'call' ||
      inst.tag === 'call-conditional' ||
      inst.tag === 'jp' ||
      inst.tag === 'jp-conditional' ||
      inst.tag === 'rst')
  ) {
    if (Object.prototype.hasOwnProperty.call(KNOWN_CODE_TARGETS, inst.target)) {
      notes.add(KNOWN_CODE_TARGETS[inst.target]);
    }
  }

  return Array.from(notes).join(' ; ');
}

function addMemoryAccess(map, addr, kind, pc, note) {
  if (addr === null || addr === undefined) return;
  const entry = map.get(addr) ?? {
    addr,
    reads: new Set(),
    writes: new Set(),
    notes: new Set(),
  };

  if (kind === 'read') entry.reads.add(pc);
  if (kind === 'write') entry.writes.add(pc);
  if (note) entry.notes.add(note);
  map.set(addr, entry);
}

function collectMemoryAccesses(instructions) {
  const accesses = new Map();

  for (const inst of instructions) {
    const indexedAddr = resolveIndexedAddress(inst);
    const indexedNote =
      indexedAddr !== null ? `${String(inst.indexRegister).toUpperCase()}${formatSignedDisplacement(inst.displacement)}` : null;

    switch (inst.tag) {
      case 'ld-reg-mem':
      case 'ld-a-mem':
      case 'ld-pair-mem':
        addMemoryAccess(accesses, inst.addr, 'read', inst.pc, null);
        break;
      case 'ld-mem-reg':
      case 'ld-mem-a':
      case 'ld-mem-pair':
        addMemoryAccess(accesses, inst.addr, 'write', inst.pc, null);
        break;
      case 'ld-reg-ixd':
      case 'ld-pair-indexed':
      case 'ld-ixiy-indexed':
      case 'alu-ixd':
      case 'indexed-cb-bit':
        addMemoryAccess(accesses, indexedAddr, 'read', inst.pc, indexedNote);
        break;
      case 'ld-ixd-reg':
      case 'ld-ixd-imm':
      case 'ld-indexed-pair':
      case 'ld-indexed-ixiy':
        addMemoryAccess(accesses, indexedAddr, 'write', inst.pc, indexedNote);
        break;
      case 'inc-ixd':
      case 'dec-ixd':
      case 'indexed-cb-set':
      case 'indexed-cb-res':
        addMemoryAccess(accesses, indexedAddr, 'read', inst.pc, indexedNote);
        addMemoryAccess(accesses, indexedAddr, 'write', inst.pc, indexedNote);
        break;
      default:
        break;
    }
  }

  return Array.from(accesses.values()).sort((left, right) => left.addr - right.addr);
}

function collectControlTargets(instructions) {
  const items = [];

  for (const inst of instructions) {
    if (
      (inst.tag === 'call' ||
        inst.tag === 'call-conditional' ||
        inst.tag === 'jp' ||
        inst.tag === 'jp-conditional') &&
      typeof inst.target === 'number'
    ) {
      items.push({
        pc: inst.pc,
        kind: inst.tag === 'call' || inst.tag === 'call-conditional' ? 'CALL' : 'JP',
        condition: inst.condition ?? null,
        target: inst.target,
      });
    }
  }

  return items;
}

function collectTableRefs(instructions) {
  return instructions
    .filter(
      (inst) =>
        inst.tag === 'ld-pair-imm' &&
        (inst.pair === 'hl' || inst.pair === 'de') &&
        typeof inst.value === 'number',
    )
    .map((inst) => ({
      pc: inst.pc,
      pair: inst.pair,
      addr: inst.value,
    }));
}

function collectKnownHits(instructions) {
  const hits = new Map(
    Object.keys(KNOWN_DATA_ADDRS)
      .map((key) => Number(key))
      .map((addr) => [addr, []]),
  );

  for (const inst of instructions) {
    const refs = [];

    if (typeof inst.addr === 'number') refs.push(inst.addr);
    if (
      inst.tag === 'ld-pair-imm' &&
      (inst.pair === 'hl' || inst.pair === 'de') &&
      typeof inst.value === 'number'
    ) {
      refs.push(inst.value);
    }
    if (typeof inst.target === 'number') refs.push(inst.target);
    const indexedAddr = resolveIndexedAddress(inst);
    if (indexedAddr !== null) refs.push(indexedAddr);

    for (const addr of refs) {
      if (hits.has(addr)) {
        hits.get(addr).push({
          pc: inst.pc,
          text: formatInstruction(inst),
        });
      }
    }
  }

  return hits;
}

function collectAEvents(instructions) {
  const events = [];

  for (const inst of instructions) {
    switch (inst.tag) {
      case 'ld-reg-mem':
      case 'ld-a-mem':
        if (inst.dest === 'a' || !inst.dest) {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: `loads A from ${labelAddress(inst.addr)}`,
          });
        }
        break;
      case 'ld-reg-imm':
        if (inst.dest === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: `loads A with ${hexByte(inst.value)}`,
          });
        }
        break;
      case 'ld-reg-reg':
        if (inst.dest === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: `loads A from ${String(inst.src).toUpperCase()}`,
          });
        } else if (inst.src === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `copies A into ${String(inst.dest).toUpperCase()}`,
          });
        }
        break;
      case 'ld-mem-reg':
      case 'ld-mem-a':
        if (inst.src === 'a' || !inst.src) {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `stores A to ${labelAddress(inst.addr)}`,
          });
        }
        break;
      case 'ld-ind-reg':
        if (inst.src === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `stores A through (${String(inst.dest).toUpperCase()})`,
          });
        }
        break;
      case 'push':
        if (inst.pair === 'af') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: 'saves A/F on the stack',
          });
        }
        break;
      case 'pop':
        if (inst.pair === 'af') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: 'restores A/F from the stack',
          });
        }
        break;
      case 'alu-imm':
        if (inst.op === 'cp') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `compares A with ${hexByte(inst.value)}`,
          });
        } else if (inst.op === 'xor' && inst.value === 0x00) {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: 'zeros A',
          });
        } else {
          events.push({
            pc: inst.pc,
            kind: 'readwrite',
            note: `${String(inst.op).toUpperCase()} ${hexByte(inst.value)} on A`,
          });
        }
        break;
      case 'alu-reg':
        if (inst.op === 'cp') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `compares A with ${String(inst.src).toUpperCase()}`,
          });
        } else if (inst.op === 'xor' && inst.src === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: 'zeros A via XOR A',
          });
        } else if (inst.op === 'or' && inst.src === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: 'tests A via OR A',
          });
        } else {
          events.push({
            pc: inst.pc,
            kind: 'readwrite',
            note: `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()} with A`,
          });
        }
        break;
      case 'alu-ixd':
        events.push({
          pc: inst.pc,
          kind: inst.op === 'cp' ? 'read' : 'readwrite',
          note: `${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)} with A`,
        });
        break;
      case 'ld-reg-ixd':
        if (inst.dest === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: `loads A from ${formatIndexed(inst.indexRegister, inst.displacement)}`,
          });
        }
        break;
      case 'ld-ixd-reg':
        if (inst.src === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `stores A to ${formatIndexed(inst.indexRegister, inst.displacement)}`,
          });
        }
        break;
      case 'in-reg':
        if ((inst.reg ?? inst.dest) === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: 'loads A from port (C)',
          });
        }
        break;
      case 'out-reg':
        if ((inst.reg ?? inst.src) === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: 'writes A to port (C)',
          });
        }
        break;
      case 'in0':
        if (inst.reg === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'write',
            note: `loads A from port ${hexByte(inst.port)}`,
          });
        }
        break;
      case 'out0':
        if (inst.reg === 'a') {
          events.push({
            pc: inst.pc,
            kind: 'read',
            note: `writes A to port ${hexByte(inst.port)}`,
          });
        }
        break;
      default:
        break;
    }
  }

  return events;
}

function scanRomForCallers(rom, target) {
  const matches = [];
  const seen = new Set();

  for (let offset = 0; offset <= rom.length - 4; offset += 1) {
    const plain = CONTROL_BY_OPCODE.get(rom[offset]);
    if (plain) {
      const value = read24LE(rom, offset + 1);
      if (value === target) {
        const key = `plain:${offset}:${plain.mnemonic}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            caller: offset,
            mnemonic: plain.mnemonic,
            bytes: bytesHex(rom.subarray(offset, offset + 4)),
          });
        }
      }
    }

    const prefix = PREFIX_BY_OPCODE.get(rom[offset]);
    if (!prefix) continue;

    const control = CONTROL_BY_OPCODE.get(rom[offset + 1]);
    if (!control) continue;

    const operandOffset = offset + 2;
    const value = prefix.width === 2 ? read16LE(rom, operandOffset) : read24LE(rom, operandOffset);
    if (value !== target) continue;

    const length = 2 + prefix.width;
    const key = `${prefix.label}:${offset}:${control.mnemonic}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({
        caller: offset,
        mnemonic: `${prefix.label} ${control.mnemonic}`,
        bytes: bytesHex(rom.subarray(offset, offset + length)),
      });
    }
  }

  matches.sort((left, right) => left.caller - right.caller);
  return matches;
}

function printSectionTitle(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function printDivider() {
  console.log('-'.repeat(88));
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);

  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(
      `Expected ROM size ${hex(EXPECTED_ROM_SIZE, 8)} (${EXPECTED_ROM_SIZE}) bytes, got ${hex(rom.length, 8)} (${rom.length}) bytes.`,
    );
  }

  console.log(`Phase 398 - Decode ${hex(TARGET_ENTRY)} key dispatch function`);
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Size: ${hex(rom.length, 8)} (${rom.length}) bytes`);
  console.log(`Decoder mode: ${MODE}`);
  console.log(`Minimum branch-follow trace budget: ${MIN_TRACE_BYTES} bytes`);

  // --- Disassemble the function ---
  printSectionTitle(TARGET_LABEL);

  const trace = traceFunction(rom, TARGET_ENTRY);

  const memoryAccesses = collectMemoryAccesses(trace.instructions);
  const controlTargets = collectControlTargets(trace.instructions);
  const tableRefs = collectTableRefs(trace.instructions);
  const knownHits = collectKnownHits(trace.instructions);
  const aEvents = collectAEvents(trace.instructions);

  console.log(
    `Trace coverage: ${trace.instructions.length} instructions, ${trace.totalBytes} bytes, branch-following from ${hex(TARGET_ENTRY)}.`,
  );
  if (aEvents.length > 0 && aEvents[0].kind === 'write') {
    console.log(`A-register headline: incoming A is overwritten before any visible use at ${hex(aEvents[0].pc)}.`);
  } else if (aEvents.length > 0) {
    console.log(`A-register headline: incoming A is used before being clobbered.`);
  } else {
    console.log('A-register headline: no explicit A activity captured in the walked trace.');
  }

  console.log('');
  console.log('Known-address checks:');
  for (const addr of Object.keys(KNOWN_DATA_ADDRS).map((key) => Number(key))) {
    const hits = knownHits.get(addr) ?? [];
    if (hits.length === 0) {
      console.log(`  ${labelAddress(addr)}: no direct reference in traced instructions`);
      continue;
    }
    const sites = hits.map((hit) => `${hex(hit.pc)} (${hit.text})`).join('; ');
    console.log(`  ${labelAddress(addr)}: ${sites}`);
  }

  console.log('');
  console.log('RAM reads / writes:');
  if (memoryAccesses.length === 0) {
    console.log('  none found');
  } else {
    for (const access of memoryAccesses) {
      const reads = Array.from(access.reads).sort((left, right) => left - right).map((pc) => hex(pc));
      const writes = Array.from(access.writes).sort((left, right) => left - right).map((pc) => hex(pc));
      const note = access.notes.size > 0 ? ` [${Array.from(access.notes).join(', ')}]` : '';
      console.log(
        `  ${labelAddress(access.addr)}${note}:` +
        `${reads.length ? ` read @ ${reads.join(', ')}` : ''}` +
        `${reads.length && writes.length ? ';' : ''}` +
        `${writes.length ? ` write @ ${writes.join(', ')}` : ''}`,
      );
    }
  }

  console.log('');
  console.log('CALL / JP targets seen in traced code:');
  if (controlTargets.length === 0) {
    console.log('  none found');
  } else {
    for (const item of controlTargets) {
      const qualifier = item.condition ? ` ${String(item.condition).toUpperCase()}` : '';
      const targetLabel = KNOWN_CODE_TARGETS[item.target] ? ` ; ${KNOWN_CODE_TARGETS[item.target]}` : '';
      console.log(`  ${hex(item.pc)}  ${item.kind}${qualifier} -> ${hex(item.target)}${targetLabel}`);
    }
  }

  console.log('');
  console.log('Table-candidate loads (LD HL/DE,<addr>):');
  if (tableRefs.length === 0) {
    console.log('  none found');
  } else {
    for (const ref of tableRefs) {
      console.log(`  ${hex(ref.pc)}  LD ${String(ref.pair).toUpperCase()},${hex(ref.addr)}${KNOWN_DATA_ADDRS[ref.addr] ? ` ; ${KNOWN_DATA_ADDRS[ref.addr]}` : ''}`);
    }
  }

  console.log('');
  console.log('A-register usage timeline:');
  if (aEvents.length === 0) {
    console.log('  none found');
  } else {
    for (const event of aEvents) {
      console.log(`  ${hex(event.pc)}  ${event.note}`);
    }
  }

  console.log('');
  console.log('Instruction listing:');
  for (const inst of trace.instructions) {
    const note = annotationForInstruction(inst);
    console.log(
      `  ${hex(inst.pc)}  ${inst.bytes.padEnd(16)}  ${inst.text}${note ? `  ; ${note}` : ''}`,
    );
  }

  // --- Scan entire ROM for callers ---
  printSectionTitle(`ROM-wide caller scan for ${hex(TARGET_ENTRY)}`);

  const callers = scanRomForCallers(rom, TARGET_ENTRY);
  console.log(`Found ${callers.length} CALL/JP references to ${hex(TARGET_ENTRY)} in entire 4MB ROM:`);
  console.log('');

  if (callers.length === 0) {
    console.log('  none found');
  } else {
    for (const caller of callers) {
      console.log(
        `  ${hex(caller.caller)}  ${caller.bytes.padEnd(14)}  ${caller.mnemonic.padEnd(9)}  ${hex(TARGET_ENTRY)}`,
      );
    }
  }

  // --- Summary ---
  printSectionTitle('Summary');

  console.log(`Function at ${hex(TARGET_ENTRY)} receives translated key code in register A.`);
  console.log(`Traced ${trace.instructions.length} instructions (${trace.totalBytes} bytes).`);
  console.log(`Found ${callers.length} caller(s) across the entire ROM.`);
  console.log('');

  if (aEvents.length > 0) {
    console.log('A-register flow:');
    const firstUse = aEvents[0];
    console.log(`  First A event at ${hex(firstUse.pc)}: ${firstUse.note}`);
  }

  console.log('');
  console.log('Known callers from session 397: 0x04CA87 and 0x04CA94 both JP here with translated key in A.');
  console.log('This function is the final key->action mapping point in the OS key dispatch chain.');

  printDivider();
  console.log('Done.');
}

main();
