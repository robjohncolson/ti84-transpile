#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';

const TAIL_START = 0x0200FA;
const TAIL_END = 0x020104;
const JP_TABLE_START = 0x020104;
const JP_TABLE_END = 0x020200;
const TARGET_RANGE_START = 0x020100;
const TARGET_RANGE_END = 0x020200;
const CONTROL_SCAN_LIMIT = 0x100000;
const TARGET_PREVIEW_BYTES = 8;
const TARGET_DECODE_COUNT = 3;
const RAW_CONTEXT_RADIUS = 4;
const MAX_HIT_SITES_PER_TARGET = 8;

const KNOWN_TARGETS = new Map([
  [0x003A73, ['event loop']],
  [0x003A7D, ['dispatch']],
  [0x003D5A, ['_GetCSC']],
  [0x001713, ['0x001713']],
  [0x001853, ['0x001853']],
  [0x001933, ['0x001933']],
  [0x000721, ['0x000721']],
  [0x003C63, ['keyboard scan']],
  [0x0067F8, ['GPIO checker']],
  [0x001C33, ['table parser compare loop']],
  [0x001C4F, ['table parser match helper']],
  [0x001CA6, ['table parser token decoder']],
]);

const CONTROL_FLOW_TAGS = new Set([
  'jp',
  'jp-conditional',
  'call',
  'call-conditional',
]);

const CONTROL_FLOW_CANDIDATE_BYTES = new Set([
  0x40,
  0x49,
  0x52,
  0x5B,
  0xC2,
  0xC3,
  0xC4,
  0xCA,
  0xCC,
  0xCD,
  0xD2,
  0xD4,
  0xDA,
  0xDC,
  0xE2,
  0xE4,
  0xEA,
  0xEC,
  0xF2,
  0xF4,
  0xFA,
  0xFC,
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0)
    | ((buffer[offset + 1] ?? 0) << 8)
    | ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesToHex(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(
    buffer.subarray(safeStart, safeEnd),
    (value) => (value & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function previewBytes(buffer, start, length = TARGET_PREVIEW_BYTES) {
  return bytesToHex(buffer, start, Math.min(length, Math.max(0, buffer.length - start)));
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function signedDisplacement(value) {
  const signed = value >= 0x80 ? value - 0x100 : value;
  return signed >= 0 ? `+${signed}` : String(signed);
}

function indexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${signedDisplacement(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind':
      return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
      return withPrefix(inst, 'ccf');
    case 'cpl':
      return withPrefix(inst, 'cpl');
    case 'db':
      return `db ${hexByte(inst.value)}`;
    case 'dec-pair':
      return withPrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withPrefix(inst, `dec ${inst.reg}`);
    case 'di':
      return withPrefix(inst, 'di');
    case 'djnz':
      return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'ei':
      return withPrefix(inst, 'ei');
    case 'ex-af':
      return withPrefix(inst, "ex af, af'");
    case 'ex-de-hl':
      return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-pair':
      return withPrefix(inst, `ex (sp), ${inst.pair}`);
    case 'exx':
      return withPrefix(inst, 'exx');
    case 'halt':
      return withPrefix(inst, 'halt');
    case 'im':
      return withPrefix(inst, `im ${inst.value ?? inst.mode}`);
    case 'inc-pair':
      return withPrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withPrefix(inst, `inc ${inst.reg}`);
    case 'inc-ixd':
      return withPrefix(inst, `inc ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation} ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-a-mb':
      return withPrefix(inst, 'ld a, mb');
    case 'ld-ind-imm':
      return withPrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${indexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${indexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-mb-a':
      return withPrefix(inst, 'ld mb, a');
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `ld (${hex(inst.addr)}), ${inst.pair}`
          : `ld ${inst.pair}, (${hex(inst.addr)})`,
      );
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${indexedOperand(inst.indexRegister, inst.displacement)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'lea':
      return withPrefix(inst, `lea ${inst.dest}, ${indexedOperand(inst.base, inst.displacement)}`);
    case 'neg':
      return withPrefix(inst, 'neg');
    case 'nop':
      return withPrefix(inst, 'nop');
    case 'out0':
      return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'out-imm':
      return withPrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'pop':
      return withPrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withPrefix(inst, 'ret');
    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);
    case 'reti':
      return withPrefix(inst, 'reti');
    case 'retn':
      return withPrefix(inst, 'retn');
    case 'rotate-ind':
      return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'rotate-reg':
      return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rla':
      return withPrefix(inst, 'rla');
    case 'rlca':
      return withPrefix(inst, 'rlca');
    case 'rra':
      return withPrefix(inst, 'rra');
    case 'rrca':
      return withPrefix(inst, 'rrca');
    case 'rst':
      return withPrefix(inst, `rst ${hex(inst.target ?? inst.vector, 2)}`);
    case 'sbc-pair':
      return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'scf':
      return withPrefix(inst, 'scf');
    default: {
      const fields = Object.entries(inst ?? {})
        .filter(([key, value]) => ![
          'pc',
          'length',
          'nextPc',
          'tag',
          'mode',
          'modePrefix',
          'target',
          'fallthrough',
          'terminates',
          'kind',
          'nextMode',
        ].includes(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`);
      return fields.length > 0 ? `${inst?.tag ?? 'unknown'} ${fields.join(', ')}` : `${inst?.tag ?? 'unknown'}`;
    }
  }
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const inst = decodeInstruction(memory, pc, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('invalid decode length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      length: 1,
      value: memory[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function decodeWindow(memory, start, countLimit = TARGET_DECODE_COUNT, mode = MODE) {
  const rows = [];
  let pc = start;

  for (let index = 0; index < countLimit && pc < memory.length; index += 1) {
    const inst = safeDecode(memory, pc, mode);
    rows.push(inst);
    pc += Math.max(inst.length ?? 1, 1);
  }

  return rows;
}

function parseDescriptor(memory, descriptorAddr) {
  const token = memory[descriptorAddr] ?? 0;
  const lowNibble = token & 0x0F;

  if (lowNibble === 0x0D) {
    return {
      token,
      lowNibble,
      kind: 'len8',
      consumed: 2,
      payloadSize: memory[descriptorAddr + 1] ?? 0,
      carry: false,
    };
  }

  if (lowNibble === 0x0E) {
    return {
      token,
      lowNibble,
      kind: 'len16',
      consumed: 3,
      payloadSize: ((memory[descriptorAddr + 1] ?? 0) << 8) | (memory[descriptorAddr + 2] ?? 0),
      carry: false,
    };
  }

  if (lowNibble === 0x0F) {
    const marker = memory[descriptorAddr + 1] ?? 0;
    if (marker !== 0x00) {
      return {
        token,
        lowNibble,
        kind: 'ptr24-invalid',
        consumed: 2,
        marker,
        carry: true,
      };
    }

    return {
      token,
      lowNibble,
      kind: 'ptr24',
      consumed: 5,
      pointer24: (
        ((memory[descriptorAddr + 2] ?? 0) << 16)
        | ((memory[descriptorAddr + 3] ?? 0) << 8)
        | (memory[descriptorAddr + 4] ?? 0)
      ) >>> 0,
      carry: false,
    };
  }

  return {
    token,
    lowNibble,
    kind: 'len4',
    consumed: 1,
    payloadSize: lowNibble,
    carry: false,
  };
}

function parseEntry(memory, entryStart) {
  const key0 = memory[entryStart] ?? 0;
  const descriptorAddr = entryStart + 1;
  const descriptor = parseDescriptor(memory, descriptorAddr);
  const key1 = memory[descriptorAddr] ?? 0;
  const payloadStart = descriptorAddr + descriptor.consumed;

  let entryEnd = payloadStart;
  if (descriptor.kind === 'len4' || descriptor.kind === 'len8' || descriptor.kind === 'len16') {
    entryEnd = payloadStart + descriptor.payloadSize;
  }

  return {
    entryStart,
    key0,
    key1,
    matchNibble: key1 & 0xF0,
    descriptorAddr,
    descriptor,
    payloadStart,
    entryEnd,
  };
}

function describeDescriptor(descriptor) {
  if (descriptor.kind === 'len4') {
    return `len4=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'len8') {
    return `len8=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'len16') {
    return `len16=${count(descriptor.payloadSize)}`;
  }
  if (descriptor.kind === 'ptr24') {
    return `ptr24=${hex(descriptor.pointer24)}`;
  }
  return `ptr24-invalid marker=${hexByte(descriptor.marker)}`;
}

function classifyTarget(memory, target, decodedWindow) {
  if (target < 0 || target >= memory.length) {
    return 'out-of-rom';
  }

  const firstBytes = Array.from(memory.subarray(target, Math.min(target + 4, memory.length)));
  if (firstBytes.length === 0) {
    return 'out-of-rom';
  }
  if (firstBytes.every((value) => value === 0x00)) {
    return 'zero-fill/data';
  }
  if (firstBytes.every((value) => value === 0xFF)) {
    return 'ff-fill/data';
  }

  const [first, second] = decodedWindow;
  if (!first) {
    return 'undecoded';
  }
  if (first.tag === 'jp' || first.tag === 'jp-conditional' || first.tag === 'jp-indirect') {
    return 'trampoline';
  }
  if (first.tag === 'call' || first.tag === 'call-conditional') {
    return 'call stub';
  }
  if (first.tag === 'ret' || first.tag === 'reti' || first.tag === 'retn' || first.tag === 'rst') {
    return 'stub/terminator';
  }
  if (first.tag === 'db') {
    return 'data/undecoded';
  }
  if (
    first.tag === 'push'
    || first.tag === 'ld-pair-imm'
    || first.tag === 'ld-reg-imm'
    || first.tag === 'ld-reg-reg'
    || first.tag === 'ld-sp-pair'
    || first.tag === 'inc-pair'
    || first.tag === 'dec-pair'
    || first.tag === 'di'
    || first.tag === 'ei'
    || first.tag === 'lea'
  ) {
    return 'probable function entry';
  }
  if (
    first.tag === 'nop'
    && (
      second?.tag === 'push'
      || second?.tag === 'ld-pair-imm'
      || second?.tag === 'ld-reg-imm'
      || second?.tag === 'call'
    )
  ) {
    return 'probable function entry';
  }
  return 'probable code entry';
}

function annotateRegionAddress(value) {
  if (value >= TAIL_START && value < TAIL_END) {
    if (value === TAIL_START) {
      return 'tail descriptor entry';
    }
    if (value >= 0x020100 && value < TAIL_END) {
      return 'flash-test trailer';
    }
    return 'tail descriptor bytes';
  }
  if (value >= JP_TABLE_START && value < JP_TABLE_END) {
    const slot = Math.floor((value - JP_TABLE_START) / 4);
    const slotBase = JP_TABLE_START + slot * 4;
    const displacement = value - slotBase;
    return displacement === 0 ? `JP slot ${slot}` : `inside JP slot ${slot} +${displacement}`;
  }
  return 'region hit';
}

function formatPointerContext(memory, offset) {
  const contextStart = Math.max(0, offset - RAW_CONTEXT_RADIUS);
  const before = bytesToHex(memory, contextStart, offset - contextStart);
  const middle = bytesToHex(memory, offset, 3);
  const afterStart = offset + 3;
  const after = bytesToHex(
    memory,
    afterStart,
    Math.min(RAW_CONTEXT_RADIUS, Math.max(0, memory.length - afterStart)),
  );
  return `${before}${before ? ' ' : ''}[${middle}]${after ? ` ${after}` : ''}`;
}

function findRaw24RangeReferences(memory, rangeStart, rangeEnd) {
  const grouped = new Map();

  for (let offset = 0; offset + 2 < memory.length; offset += 1) {
    const value = read24LE(memory, offset);
    if (value < rangeStart || value >= rangeEnd) {
      continue;
    }

    let group = grouped.get(value);
    if (!group) {
      group = { target: value, hits: [] };
      grouped.set(value, group);
    }

    group.hits.push({
      offset,
      context: formatPointerContext(memory, offset),
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.target - right.target);
}

function findControlFlowReferences(memory, scanLimit, rangeStart, rangeEnd) {
  const hits = [];
  const limit = Math.min(scanLimit, memory.length);

  for (let offset = 0; offset < limit; offset += 1) {
    if (!CONTROL_FLOW_CANDIDATE_BYTES.has(memory[offset] ?? 0)) {
      continue;
    }

    const inst = safeDecode(memory, offset, MODE);
    if (!CONTROL_FLOW_TAGS.has(inst.tag) || !Number.isInteger(inst.target)) {
      continue;
    }
    if (inst.target < rangeStart || inst.target >= rangeEnd) {
      continue;
    }

    hits.push({
      site: offset,
      target: inst.target,
      text: formatInstruction(inst),
      bytes: bytesToHex(memory, offset, Math.max(inst.length ?? 1, 1)),
      targetNote: annotateRegionAddress(inst.target),
    });
  }

  return hits;
}

function decodeJpTable(memory) {
  const entries = [];
  let stopReason = `reached ${hex(JP_TABLE_END)}`;

  for (let addr = JP_TABLE_START; addr + 3 < Math.min(JP_TABLE_END, memory.length); addr += 4) {
    const opcode = memory[addr] ?? 0;
    if (opcode !== 0xC3) {
      stopReason = `non-C3 ${hexByte(opcode)} at ${hex(addr)}`;
      break;
    }

    const target = read24LE(memory, addr + 1);
    const decoded = decodeWindow(memory, target);
    const first = decoded[0] ?? { tag: 'db', length: 1, value: memory[target] ?? 0 };
    entries.push({
      addr,
      target,
      first,
      decoded,
      classification: classifyTarget(memory, target, decoded),
      knownMatches: KNOWN_TARGETS.get(target) ?? [],
    });
  }

  return { entries, stopReason };
}

function describeTailRegion(memory) {
  const entry = parseEntry(memory, TAIL_START);
  const entryBytes = bytesToHex(memory, entry.entryStart, Math.max(0, entry.entryEnd - entry.entryStart));
  const trailerBytes = bytesToHex(memory, entry.entryEnd, Math.max(0, TAIL_END - entry.entryEnd));

  let pointerSummary = null;
  if (entry.descriptor.kind === 'ptr24') {
    const target = entry.descriptor.pointer24;
    const decoded = decodeWindow(memory, target);
    const first = decoded[0] ?? { tag: 'db', length: 1, value: memory[target] ?? 0 };
    pointerSummary = {
      target,
      first,
      classification: classifyTarget(memory, target, decoded),
      knownMatches: KNOWN_TARGETS.get(target) ?? [],
    };
  }

  return {
    entry,
    entryBytes,
    trailerBytes,
    pointerSummary,
  };
}

function main() {
  const tail = describeTailRegion(rom);
  const jpTable = decodeJpTable(rom);
  const rawRefs = findRaw24RangeReferences(rom, TARGET_RANGE_START, TARGET_RANGE_END);
  const controlRefs = findControlFlowReferences(rom, CONTROL_SCAN_LIMIT, TARGET_RANGE_START, TARGET_RANGE_END);
  const classificationCounts = new Map();

  for (const entry of jpTable.entries) {
    classificationCounts.set(
      entry.classification,
      (classificationCounts.get(entry.classification) ?? 0) + 1,
    );
  }

  console.log('=== PROBE: PHASE 377 JP TABLE @ 0x020104 ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');

  console.log('=== 0x0200FA-0x020103 TAIL / FLASH-TEST REGION ===');
  console.log(`${hex(TAIL_START)}..${hex(TAIL_END - 1)}: ${bytesToHex(rom, TAIL_START, TAIL_END - TAIL_START)}`);
  console.log(
    `descriptor entry: key0=${hexByte(tail.entry.key0)} key1=${hexByte(tail.entry.key1)} hi=${hexByte(tail.entry.matchNibble)} ${describeDescriptor(tail.entry.descriptor)} entry-bytes=${tail.entryBytes} next=${hex(tail.entry.entryEnd)}`,
  );
  if (tail.pointerSummary) {
    const known = tail.pointerSummary.knownMatches.length > 0
      ? ` known=${tail.pointerSummary.knownMatches.join(', ')}`
      : '';
    console.log(
      `descriptor target: ${hex(tail.pointerSummary.target)} -> ${formatInstruction(tail.pointerSummary.first)} (${tail.pointerSummary.classification})${known}`,
    );
  }
  if (tail.trailerBytes) {
    console.log(
      `trailer ${hex(tail.entry.entryEnd)}..${hex(TAIL_END - 1)}: ${tail.trailerBytes}  (flash magic ${hexByte(rom[0x020100])} ${hexByte(rom[0x020101])}, trailing ${hexByte(rom[0x020102])} ${hexByte(rom[0x020103])})`,
    );
  }
  console.log('');

  console.log('=== JP TABLE ENTRIES ===');
  for (const entry of jpTable.entries) {
    const known = entry.knownMatches.length > 0 ? ` | known=${entry.knownMatches.join(', ')}` : '';
    console.log(
      `${hex(entry.addr)}: JP ${hex(entry.target)} | ${entry.classification} | first=${formatInstruction(entry.first)} | head=${previewBytes(rom, entry.target)}${known}`,
    );
  }
  console.log(`total entries: ${count(jpTable.entries.length)} (${jpTable.stopReason})`);
  if (classificationCounts.size > 0) {
    const summary = Array.from(classificationCounts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([label, value]) => `${label}=${count(value)}`)
      .join(', ');
    console.log(`classification summary: ${summary}`);
  }
  console.log('');

  console.log('=== KNOWN TARGET MATCHES ===');
  const matches = jpTable.entries.filter((entry) => entry.knownMatches.length > 0);
  if (matches.length === 0) {
    console.log('none');
  } else {
    for (const entry of matches) {
      console.log(`${hex(entry.addr)} -> ${hex(entry.target)} (${entry.knownMatches.join(', ')})`);
    }
  }
  console.log('');

  console.log('=== RAW 24-BIT REFERENCES INTO 0x020100-0x0201FF ===');
  const totalRawHits = rawRefs.reduce((sum, group) => sum + group.hits.length, 0);
  console.log(`distinct targets: ${count(rawRefs.length)}, total raw hits: ${count(totalRawHits)}`);
  if (rawRefs.length === 0) {
    console.log('none');
  } else {
    for (const group of rawRefs) {
      console.log(`${hex(group.target)} (${annotateRegionAddress(group.target)}): ${count(group.hits.length)} raw hit(s)`);
      for (const hit of group.hits.slice(0, MAX_HIT_SITES_PER_TARGET)) {
        console.log(`  ${hex(hit.offset)}: ${hit.context}`);
      }
      if (group.hits.length > MAX_HIT_SITES_PER_TARGET) {
        console.log(`  ... ${count(group.hits.length - MAX_HIT_SITES_PER_TARGET)} more`);
      }
    }
  }
  console.log('');

  console.log(`=== CALL/JP TARGETS INTO TABLE REGION (0x000000..${hex(CONTROL_SCAN_LIMIT - 1)}) ===`);
  console.log(`hits: ${count(controlRefs.length)}`);
  if (controlRefs.length === 0) {
    console.log('none');
  } else {
    for (const hit of controlRefs) {
      console.log(`${hex(hit.site)}: ${hit.text} | bytes=${hit.bytes} | target=${hex(hit.target)} (${hit.targetNote})`);
    }
  }
}

main();
