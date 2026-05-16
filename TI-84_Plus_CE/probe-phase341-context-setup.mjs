#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction as importedDecodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

const RANGE_START = 0x08C8CB;
const RANGE_END_EXCLUSIVE = 0x08C961;
const RANGE_TABLE_BASE = 0x08C958;

const CALL_TARGETS = [
  { label: 'CALL 0x08C8CB', target: 0x08C8CB, pattern: [0xCD, 0xCB, 0xC8, 0x08] },
  { label: 'CALL 0x08C900', target: 0x08C900, pattern: [0xCD, 0x00, 0xC9, 0x08] },
];

const CONTEXT_COPY_HELPER = 0x08C782;
const CONTEXT_COPY_DEST = 0xD007CA;
const CONTEXT_COPY_LENGTH = 0x15;
const CONTEXT_RANGE_MIN = 0xD00700;
const CONTEXT_RANGE_MAX = 0xD007FF;
const RAM_MBASE = 0xD0;

const KNOWN_LABELS = new Map([
  [0x023A84, 'bit-2 setup helper'],
  [0x02230C, 'post-context notifier'],
  [0x058222, 'home context install helper'],
  [0x058241, 'HOME_HANDLER'],
  [0x0585D3, 'home context table'],
  [0x0585E9, 'home second-pass cxMain'],
  [0x08BFEC, 'resume/yield helper'],
  [0x08C67C, 'PPutawayPrompt'],
  [0x08C745, 'JP(HL) trampoline'],
  [0x08C782, 'cx table copy helper'],
  [0x08C900, 'dispatch/setup helper'],
]);

const CONTEXT_SLOTS = [
  { addr: 0xD007CA, name: 'cxMain' },
  { addr: 0xD007CD, name: 'cxPPutAway' },
  { addr: 0xD007D0, name: 'cxPutAway' },
  { addr: 0xD007D3, name: 'cxReDisp' },
  { addr: 0xD007D6, name: 'cxErrorEP' },
  { addr: 0xD007D9, name: 'cxSizeWind' },
  { addr: 0xD007DC, name: 'cxPage' },
  { addr: 0xD007E0, name: 'cxCurApp' },
  { addr: 0xD007EB, name: 'cxAppReturn' },
];

const CONTEXT_TABLE_FIELDS = [
  'cxMain',
  'cxPPutAway',
  'cxPutAway',
  'cxReDisp',
  'cxErrorEP',
  'cxSizeWind',
  'cxPage',
];

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0';
  }
  return value >= 0 ? `+0x${value.toString(16).toUpperCase()}` : `-0x${(-value).toString(16).toUpperCase()}`;
}

function read24(addr) {
  return (
    (rom[addr] ?? 0) |
    ((rom[addr + 1] ?? 0) << 8) |
    ((rom[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(addr, length) {
  return Array.from(
    rom.subarray(addr, Math.min(rom.length, addr + Math.max(1, length))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function effectiveMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function formatMemoryAddress(inst) {
  const effective = effectiveMemoryAddress(inst);
  if (effective === null) {
    return 'n/a';
  }
  return hex(effective);
}

function formatGenericProps(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'tag',
    'mode',
    'modePrefix',
    'fallthrough',
    'terminates',
    'direction',
    'kind',
    'nextMode',
  ]);

  const props = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (ignored.has(key) || value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target' || key === 'value') {
        props.push(`${key}=${hex(value)}`);
      } else if (key === 'displacement') {
        props.push(`${key}=${formatDisp(value)}`);
      } else {
        props.push(`${key}=${value}`);
      }
    } else {
      props.push(`${key}=${value}`);
    }
  }

  return props.join(' ');
}

function formatInstructionText(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'mlt': return withPrefix(inst, `mlt ${inst.reg}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${formatMemoryAddress(inst)})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.pair}`);
    case 'ld-pair-ind': return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair': return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${formatMemoryAddress(inst)})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${hexByte(inst.value)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'alu-imm': return withPrefix(inst, inst.op === 'cp' ? `cp ${hexByte(inst.value)}` : `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, inst.op === 'cp' ? `cp ${inst.src}` : `${inst.op} ${inst.src}`);
    case 'alu-ixd':
      return withPrefix(inst, inst.op === 'cp'
        ? `cp (${inst.indexRegister}${formatDisp(inst.displacement)})`
        : `${inst.op} (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ldir':
    case 'lddr':
    case 'ldi':
    case 'ldd':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'halt':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
      return withPrefix(inst, inst.tag);
    default: {
      const props = formatGenericProps(inst);
      return withPrefix(inst, `${inst.tag}${props ? ` ${props}` : ''}`);
    }
  }
}

function splitInstructionText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return { mnemonic: '<unknown>', operands: '' };
  }

  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    return { mnemonic: trimmed, operands: '' };
  }

  return {
    mnemonic: trimmed.slice(0, firstSpace),
    operands: trimmed.slice(firstSpace + 1).trim(),
  };
}

function decodeAt(pc) {
  try {
    const inst = importedDecodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through.
  }

  try {
    const inst = importedDecodeInstruction(rom, pc, true);
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through.
  }

  return { pc, length: 1, tag: 'db', value: rom[pc] ?? 0 };
}

function describeAddress(addr) {
  const exact = CONTEXT_SLOTS.find((slot) => slot.addr === addr);
  if (exact) {
    return `${exact.name} (${hex(addr)})`;
  }
  if (addr >= CONTEXT_RANGE_MIN && addr <= CONTEXT_RANGE_MAX) {
    return `context+0x${(addr - CONTEXT_RANGE_MIN).toString(16).toUpperCase().padStart(2, '0')} (${hex(addr)})`;
  }
  const known = KNOWN_LABELS.get(addr);
  if (known) {
    return `${known} (${hex(addr)})`;
  }
  return hex(addr);
}

function contextWriteAddress(inst) {
  if (!inst) {
    return null;
  }

  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    const addr = effectiveMemoryAddress(inst);
    if (addr !== null && addr >= CONTEXT_RANGE_MIN && addr <= CONTEXT_RANGE_MAX) {
      return addr;
    }
  }

  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    const addr = effectiveMemoryAddress(inst);
    if (addr !== null && addr >= CONTEXT_RANGE_MIN && addr <= CONTEXT_RANGE_MAX) {
      return addr;
    }
  }

  return null;
}

function iyFlagNote(inst) {
  if (!inst || !String(inst.indexRegister ?? '').toLowerCase().includes('iy')) {
    return null;
  }

  if (!['indexed-cb-bit', 'indexed-cb-res', 'indexed-cb-set'].includes(inst.tag)) {
    return null;
  }

  const op = inst.tag === 'indexed-cb-bit' ? 'bit' : inst.tag === 'indexed-cb-res' ? 'res' : 'set';
  return `${op} ${inst.bit}, (IY${formatDisp(inst.displacement)})`;
}

function controlTargetNote(inst) {
  if (!inst) {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    return `CALL -> ${describeAddress(inst.target)}`;
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    return `JP -> ${describeAddress(inst.target)}`;
  }
  if (inst.tag === 'jp-indirect') {
    return `JP indirect via ${String(inst.indirectRegister).toUpperCase()}`;
  }

  return null;
}

function handlerLoadNote(inst) {
  if (!inst || inst.tag !== 'ld-pair-imm' || inst.pair !== 'hl') {
    return null;
  }
  if (!Number.isFinite(inst.value)) {
    return null;
  }
  if (inst.value >= rom.length) {
    return null;
  }
  const known = KNOWN_LABELS.get(inst.value);
  return known ? `HL <- ${known} (${hex(inst.value)})` : `HL <- ROM pointer ${hex(inst.value)}`;
}

function collectNotes(inst) {
  const notes = [];

  const contextWrite = contextWriteAddress(inst);
  if (contextWrite !== null) {
    notes.push(`WRITE ${describeAddress(contextWrite)}`);
  }

  const iyNote = iyFlagNote(inst);
  if (iyNote) {
    notes.push(`IY flag ${iyNote}`);
  }

  const targetNote = controlTargetNote(inst);
  if (targetNote) {
    notes.push(targetNote);
  }

  const hlNote = handlerLoadNote(inst);
  if (hlNote) {
    notes.push(hlNote);
  }

  return notes;
}

function disassembleRange(start, endExclusive) {
  const rows = [];
  let pc = start >>> 0;

  while (pc < endExclusive && pc < rom.length) {
    const inst = decodeAt(pc);
    const length = Math.max(1, inst?.length ?? 1);
    const text = formatInstructionText(inst);
    const split = splitInstructionText(text);
    rows.push({
      pc,
      length,
      bytes: bytesAt(pc, length),
      mnemonic: split.mnemonic,
      operands: split.operands,
      notes: collectNotes(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function printDisassembly(rows) {
  console.log(`=== Disassembly ${hex(RANGE_START)}..${hex(RANGE_END_EXCLUSIVE - 1)} ===`);
  for (const row of rows) {
    const operands = row.operands ? `  ${row.operands}` : '';
    const noteText = row.notes.length ? `  [${row.notes.join('; ')}]` : '';
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(18)}  ${row.mnemonic.padEnd(12)}${operands}${noteText}`);
  }
}

function printLocalContextSummary(rows) {
  const writes = rows.filter((row) => contextWriteAddress(row.inst) !== null);
  const iyOps = rows.filter((row) => iyFlagNote(row.inst));

  console.log('\n=== Local Summary ===');
  console.log(`Direct 0xD007xx writes in slice: ${writes.length}`);
  for (const row of writes) {
    console.log(`  ${hex(row.pc)}  ${row.mnemonic} ${row.operands} -> ${describeAddress(contextWriteAddress(row.inst))}`);
  }

  console.log(`IY flag ops in slice: ${iyOps.length}`);
  for (const row of iyOps) {
    console.log(`  ${hex(row.pc)}  ${iyFlagNote(row.inst)}`);
  }
}

function printPointerTablePreview() {
  console.log('\n=== Pointer Table Preview @ 0x08C958 ===');
  for (let i = 0; i < 3; i++) {
    const entryAddr = RANGE_TABLE_BASE + (i * 3);
    const value = read24(entryAddr);
    const label = KNOWN_LABELS.get(value);
    console.log(
      `  [${i}] ${hex(entryAddr)}  ${bytesAt(entryAddr, 3).padEnd(8)} -> ${hex(value)}${label ? `  (${label})` : ''}`,
    );
  }
}

function findPatternHits(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push(i);
    }
  }
  return hits;
}

function isHlLoad(inst) {
  if (!inst) {
    return false;
  }
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl' && inst.direction !== 'to-mem') {
    return true;
  }
  if (inst.tag === 'ld-pair-ind' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'ld-pair-indexed' && inst.pair === 'hl') {
    return true;
  }
  return false;
}

function describeHlLoad(inst) {
  if (!inst) {
    return 'unknown';
  }

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    return describeAddress(inst.value);
  }
  if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl' && inst.direction !== 'to-mem') {
    return `HL <- (${describeAddress(effectiveMemoryAddress(inst))})`;
  }
  if (inst.tag === 'ld-pair-ind' && inst.pair === 'hl') {
    return `HL <- (${String(inst.src).toUpperCase()})`;
  }
  if (inst.tag === 'ld-pair-indexed' && inst.pair === 'hl') {
    return `HL <- (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
  }

  return 'unknown';
}

function recoverAlignedWindow(callPc, lookback = 16) {
  const candidates = [];
  const startMin = Math.max(0, callPc - lookback);

  for (let start = startMin; start < callPc; start++) {
    const rows = [];
    let pc = start;
    let valid = true;

    while (pc < callPc) {
      const inst = decodeAt(pc);
      const length = Math.max(1, inst?.length ?? 1);
      if (pc + length > callPc) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc += length;
      if (rows.length > 8) {
        valid = false;
        break;
      }
    }

    if (!valid || pc !== callPc || rows.length === 0) {
      continue;
    }

    let score = 0;
    const lastHlIndex = rows.map((row) => row.inst).findLastIndex((inst) => isHlLoad(inst));
    if (lastHlIndex >= 0) {
      score += 1000 + lastHlIndex * 20;
      if (rows[lastHlIndex].inst.tag === 'ld-pair-imm' && rows[lastHlIndex].inst.pair === 'hl') {
        score += 200;
      }
    }
    score -= rows.length * 10;
    score -= (callPc - start);

    candidates.push({ start, rows, score });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.rows ?? [];
}

function writesHl(inst) {
  if (!inst) {
    return false;
  }
  if (isHlLoad(inst)) {
    return true;
  }
  if ((inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-ind' || inst.tag === 'ld-reg-ixd') &&
      (inst.dest === 'h' || inst.dest === 'l')) {
    return true;
  }
  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (inst.reg === 'h' || inst.reg === 'l')) {
    return true;
  }
  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'pop' && inst.pair === 'hl') {
    return true;
  }
  if ((inst.tag === 'add-pair' && inst.dest === 'hl') || inst.tag === 'adc-pair' || inst.tag === 'sbc-pair') {
    return true;
  }
  if (inst.tag === 'ex-de-hl' || inst.tag === 'ex-sp-hl') {
    return true;
  }
  return false;
}

const handlerInstallCache = new Map();

function linearDecodeWindow(start, byteLength = 0x80, maxInstructions = 96) {
  const rows = [];
  let pc = start >>> 0;
  const endExclusive = Math.min(rom.length, start + byteLength);

  while (pc < endExclusive && rows.length < maxInstructions) {
    const inst = decodeAt(pc);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({ pc, inst, length });
    pc += length;
  }

  return rows;
}

function readContextTable(sourceAddr) {
  if (!Number.isFinite(sourceAddr) || sourceAddr < 0 || sourceAddr + CONTEXT_COPY_LENGTH > rom.length) {
    return null;
  }

  return CONTEXT_TABLE_FIELDS.map((name, index) => {
    const entryAddr = sourceAddr + (index * 3);
    return {
      name,
      sourceAddr: entryAddr,
      value: read24(entryAddr),
      label: KNOWN_LABELS.get(read24(entryAddr)) ?? null,
    };
  });
}

function analyzeInstallerWindow(startAddr, inheritedHl, result, depth, rootStart) {
  const visitKey = `${startAddr}:${depth}:${inheritedHl ?? 'na'}`;
  if (result.visited.has(visitKey)) {
    return;
  }
  result.visited.add(visitKey);

  let currentHl = inheritedHl;
  const rows = linearDecodeWindow(startAddr);

  for (const row of rows) {
    const { inst } = row;

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      currentHl = inst.value;
    } else if (writesHl(inst)) {
      currentHl = null;
    }

    const writeAddr = contextWriteAddress(inst);
    if (writeAddr !== null) {
      result.directWrites.add(writeAddr);
      result.evidence.push(`${hex(row.pc)}  ${formatInstructionText(inst)}`);
    }

    const target = inst.target;
    if (target === CONTEXT_COPY_HELPER) {
      result.copyTarget = CONTEXT_COPY_DEST;
      result.copySource = currentHl;
      result.evidence.push(
        `${hex(row.pc)}  ${formatInstructionText(inst)}  with HL=${currentHl !== null ? hex(currentHl) : 'unknown'}`,
      );
      continue;
    }

    if ((inst.tag === 'call' || inst.tag === 'jp') && depth < 1 && Number.isFinite(target)) {
      if (Math.abs(target - rootStart) <= 0x80) {
        analyzeInstallerWindow(target, currentHl, result, depth + 1, rootStart);
      }
    }
  }
}

function analyzeHandlerInstallation(handlerAddr) {
  if (handlerInstallCache.has(handlerAddr)) {
    return handlerInstallCache.get(handlerAddr);
  }

  const result = {
    handlerAddr,
    copySource: null,
    copyTarget: null,
    directWrites: new Set(),
    evidence: [],
    tableEntries: null,
    visited: new Set(),
  };

  analyzeInstallerWindow(handlerAddr, null, result, 0, handlerAddr);

  if (result.copySource !== null) {
    result.tableEntries = readContextTable(result.copySource);
  }

  handlerInstallCache.set(handlerAddr, result);
  return result;
}

function summarizeInstallPath(target, handlerInstall) {
  if (!handlerInstall) {
    return target === 0x08C8CB ? describeAddress(0xD007E0) : 'unknown';
  }

  const parts = [];
  if (target === 0x08C8CB) {
    parts.push(describeAddress(0xD007E0));
  }

  if (handlerInstall.copyTarget !== null) {
    const sourceText = handlerInstall.copySource !== null ? ` via ${describeAddress(handlerInstall.copySource)}` : '';
    parts.push(`${describeAddress(handlerInstall.copyTarget)} block (${CONTEXТ_COPY_LENGTH_TEXT()})${sourceText}`);
  }

  if (handlerInstall.directWrites.size > 0) {
    for (const addr of handlerInstall.directWrites) {
      parts.push(describeAddress(addr));
    }
  }

  return parts.length > 0 ? parts.join(' + ') : 'unknown';
}

function CONTEXТ_COPY_LENGTH_TEXT() {
  return `${hex(CONTEXT_COPY_LENGTH, 2)} bytes`;
}

function analyzeCallSites(spec) {
  const hits = findPatternHits(spec.pattern);
  const records = hits.map((callPc) => {
    const preCallRows = recoverAlignedWindow(callPc);
    const hlRow = [...preCallRows].reverse().find((row) => isHlLoad(row.inst)) ?? null;
    const handlerAddr = hlRow?.inst?.tag === 'ld-pair-imm' && hlRow.inst.pair === 'hl' ? hlRow.inst.value : null;
    const handlerInstall = handlerAddr !== null ? analyzeHandlerInstallation(handlerAddr) : null;
    return {
      callPc,
      target: spec.target,
      preCallRows,
      hlRow,
      handlerAddr,
      handlerLoadText: hlRow ? describeHlLoad(hlRow.inst) : 'unknown',
      slotSummary: summarizeInstallPath(spec.target, handlerInstall),
      handlerInstall,
    };
  });

  return { spec, records };
}

function printCallScan(scan) {
  console.log(`\n=== ${scan.spec.label} Pattern Scan ===`);
  console.log(`Pattern bytes: ${scan.spec.pattern.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);

  if (scan.records.length === 0) {
    console.log('  No direct ADL CALL sites matched this pattern.');
    return;
  }

  console.log(`  Direct CALL sites found: ${scan.records.length}`);
  for (const record of scan.records) {
    console.log(`\n  CALL site ${hex(record.callPc)} -> ${hex(scan.spec.target)}`);
    console.log(`    HL before CALL: ${record.handlerLoadText}`);
    console.log(`    Context destination: ${record.slotSummary}`);
    console.log('    Pre-call decode window:');
    for (const row of record.preCallRows) {
      const text = formatInstructionText(row.inst);
      const marker = row.pc === record.hlRow?.pc ? '  <== HL load' : '';
      console.log(`      ${hex(row.pc)}  ${bytesAt(row.pc, row.inst.length).padEnd(18)}  ${text}${marker}`);
    }
  }
}

function printHandlerInstallDetails(scans) {
  const uniqueHandlers = new Map();
  for (const scan of scans) {
    for (const record of scan.records) {
      if (record.handlerAddr !== null && !uniqueHandlers.has(record.handlerAddr)) {
        uniqueHandlers.set(record.handlerAddr, record.handlerInstall);
      }
    }
  }

  if (uniqueHandlers.size === 0) {
    return;
  }

  console.log('\n=== Handler Install Follow-Up ===');
  for (const [handlerAddr, install] of uniqueHandlers.entries()) {
    const label = KNOWN_LABELS.get(handlerAddr);
    console.log(`\nHandler ${hex(handlerAddr)}${label ? ` (${label})` : ''}`);

    if (install.copyTarget !== null) {
      console.log(
        `  Installs context block at ${describeAddress(install.copyTarget)} using ${KNOWN_LABELS.get(CONTEXT_COPY_HELPER)} (${hex(CONTEXT_COPY_HELPER)})`,
      );
      if (install.copySource !== null) {
        console.log(`  Source table: ${describeAddress(install.copySource)}`);
      } else {
        console.log('  Source table: unknown');
      }
    } else {
      console.log('  No 0x08C782 context-copy helper was found in the first-hop handler scan.');
    }

    if (install.tableEntries?.length) {
      console.log('  Table entries copied into cxMain..cxPage:');
      for (const entry of install.tableEntries) {
        const labelText = entry.label ? `  (${entry.label})` : '';
        console.log(`    ${entry.name.padEnd(11)} ${hex(entry.value)}  from ${hex(entry.sourceAddr)}${labelText}`);
      }
    }

    if (install.directWrites.size > 0) {
      console.log('  Direct 0xD007xx writes seen while scanning handler/helper windows:');
      for (const addr of install.directWrites) {
        console.log(`    ${describeAddress(addr)}`);
      }
    }

    if (install.evidence.length > 0) {
      console.log('  Evidence:');
      for (const line of install.evidence) {
        console.log(`    ${line}`);
      }
    }
  }
}

function printSummaryTable(scans) {
  const rows = [];
  for (const scan of scans) {
    for (const record of scan.records) {
      rows.push({
        caller: hex(record.callPc),
        handler: record.handlerAddr !== null ? describeAddress(record.handlerAddr) : record.handlerLoadText,
        slot: record.slotSummary,
      });
    }
  }

  console.log('\n=== Summary Table ===');
  if (rows.length === 0) {
    console.log('  No direct CALL sites were found for 0x08C8CB or 0x08C900.');
    return;
  }

  const headers = ['caller_address', 'handler_address_loaded', 'which_context_slot_written'];
  const widths = headers.map((header) => header.length);
  for (const row of rows) {
    widths[0] = Math.max(widths[0], row.caller.length);
    widths[1] = Math.max(widths[1], row.handler.length);
    widths[2] = Math.max(widths[2], row.slot.length);
  }

  console.log(headers.map((header, index) => header.padEnd(widths[index])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log([
      row.caller.padEnd(widths[0]),
      row.handler.padEnd(widths[1]),
      row.slot.padEnd(widths[2]),
    ].join('  '));
  }
}

function main() {
  console.log('Phase 341: context setup probe');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${hex(rom.length, 8)} (${rom.length} bytes)`);

  const disasmRows = disassembleRange(RANGE_START, RANGE_END_EXCLUSIVE);
  printDisassembly(disasmRows);
  printLocalContextSummary(disasmRows);
  printPointerTablePreview();

  const scans = CALL_TARGETS.map(analyzeCallSites);
  for (const scan of scans) {
    printCallScan(scan);
  }

  printHandlerInstallDetails(scans);
  printSummaryTable(scans);
}

main();
