#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const RANGE_START = 0x08C331;
const RANGE_END = 0x08C449;
const RANGE_LENGTH = RANGE_END - RANGE_START;
const KEY_DISPATCH_START = 0x08C449;
const KNOWN_IY_BASE = 0xD00080;

const KNOWN_CALL_TARGETS = new Map([
  [0x08BF22, 'narrow CoorMon (GetCSC + VRAM refresh)'],
  [0x08C72F, 'cxMain dispatch wrapper'],
  [0x08C745, 'JP (HL) trampoline'],
  [0x022331, 'token deposit'],
  [0x04C973, 'CP comparison helper'],
  [0x0800C2, 'status bar related'],
]);

const BRANCH_TAGS = new Set([
  'jp',
  'jp-conditional',
  'jr',
  'jr-conditional',
  'djnz',
]);

const CONDITIONAL_BRANCH_TAGS = new Set([
  'jp-conditional',
  'jr-conditional',
  'djnz',
  'ret-conditional',
]);

const MODE_PREFIXES = new Set(['sis', 'lis', 'sil', 'lil']);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstructionText(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} (${inst.indexRegister}${signed(inst.displacement)})`);
    case 'indexed-cb-bit': return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`);
    case 'indexed-cb-res': return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`);
    case 'indexed-cb-set': return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`);
    case 'ld-reg-ixd': return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${signed(inst.displacement)})`);
    case 'ld-ixd-reg': return withPrefix(inst, `ld (${inst.indexRegister}${signed(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm': return withPrefix(inst, `ld (${inst.indexRegister}${signed(inst.displacement)}), ${hexByte(inst.value)}`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-af': return withPrefix(inst, "ex af, af'");
    case 'rlca': return withPrefix(inst, 'rlca');
    case 'rrca': return withPrefix(inst, 'rrca');
    case 'rla': return withPrefix(inst, 'rla');
    case 'rra': return withPrefix(inst, 'rra');
    case 'cpl': return withPrefix(inst, 'cpl');
    case 'scf': return withPrefix(inst, 'scf');
    case 'ccf': return withPrefix(inst, 'ccf');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'db': return withPrefix(inst, `db ${hexByte(inst.value ?? 0)}`);
    default: return withPrefix(inst, inst.tag ?? 'unknown');
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

  const firstToken = trimmed.slice(0, firstSpace);
  if (MODE_PREFIXES.has(firstToken)) {
    const rest = trimmed.slice(firstSpace + 1);
    const secondSpace = rest.indexOf(' ');
    if (secondSpace === -1) {
      return { mnemonic: trimmed, operands: '' };
    }
    return {
      mnemonic: `${firstToken} ${rest.slice(0, secondSpace)}`,
      operands: rest.slice(secondSpace + 1).trim(),
    };
  }

  return {
    mnemonic: firstToken,
    operands: trimmed.slice(firstSpace + 1).trim(),
  };
}

function instructionBytes(rom, pc, length) {
  return Array.from(
    rom.subarray(pc, Math.min(rom.length, pc + Math.max(1, length))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function safeDecode(rom, pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through.
  }
  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
  };
}

function describeBranchTarget(pc, target) {
  if (!Number.isInteger(target)) {
    return null;
  }
  if (target === RANGE_START) {
    return `${hex(target)} backward loop to CoorMon entry`;
  }
  if (target === KEY_DISPATCH_START) {
    return `${hex(target)} handoff to key dispatch cascade`;
  }
  if (target < pc) {
    return `${hex(target)} backward jump/loop`;
  }
  if (target >= RANGE_END) {
    return `${hex(target)} forward branch beyond setup window`;
  }
  return `${hex(target)} forward branch inside setup window`;
}

function extractIYAccess(inst) {
  if (inst?.indexRegister !== 'iy') {
    return null;
  }

  const offset = Number(inst.displacement ?? 0);
  const effective = (KNOWN_IY_BASE + offset) & 0xFFFFFF;
  switch (inst.tag) {
    case 'indexed-cb-bit':
      return { offset, effective, category: 'check', detail: `BIT ${inst.bit}` };
    case 'indexed-cb-set':
      return { offset, effective, category: 'set', detail: `SET ${inst.bit}` };
    case 'indexed-cb-res':
      return { offset, effective, category: 'res', detail: `RES ${inst.bit}` };
    case 'ld-reg-ixd':
      return { offset, effective, category: 'ld-read', detail: `LD read -> ${inst.dest}` };
    case 'ld-ixd-reg':
      return { offset, effective, category: 'ld-write', detail: `LD write <- ${inst.src}` };
    case 'ld-ixd-imm':
      return { offset, effective, category: 'ld-write', detail: `LD write <- ${hexByte(inst.value)}` };
    case 'alu-ixd':
      return { offset, effective, category: 'read', detail: `${String(inst.op).toUpperCase()} test` };
    default:
      return null;
  }
}

function instructionReadsAbsoluteRam(inst) {
  if (!inst) {
    return [];
  }

  const reads = [];
  if (inst.tag === 'ld-reg-mem') {
    reads.push({ addr: inst.addr >>> 0, kind: 'absolute', detail: `read -> ${inst.dest}` });
  } else if (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem') {
    reads.push({ addr: inst.addr >>> 0, kind: 'absolute', detail: `read -> ${inst.pair}` });
  }
  return reads.filter((entry) => entry.addr >= 0xD00000 && entry.addr <= 0xDFFFFF);
}

function instructionWritesAbsoluteRam(inst) {
  if (!inst) {
    return [];
  }

  const writes = [];
  if (inst.tag === 'ld-mem-reg') {
    writes.push({ addr: inst.addr >>> 0, kind: 'absolute', detail: `write <- ${inst.src}` });
  } else if (inst.tag === 'ld-mem-pair') {
    writes.push({ addr: inst.addr >>> 0, kind: 'absolute', detail: `write <- ${inst.pair}` });
  } else if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    writes.push({ addr: inst.addr >>> 0, kind: 'absolute', detail: `write <- ${inst.pair}` });
  }
  return writes.filter((entry) => entry.addr >= 0xD00000 && entry.addr <= 0xDFFFFF);
}

function updatesHL(inst) {
  if (!inst) {
    return false;
  }
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'inc-pair' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'dec-pair' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'pop' && inst.pair === 'hl') {
    return true;
  }
  if (inst.tag === 'add-pair' && inst.dest === 'hl') {
    return true;
  }
  if (inst.tag === 'ex-de-hl') {
    return true;
  }
  if (inst.tag === 'ld-reg-imm' && (inst.dest === 'h' || inst.dest === 'l')) {
    return true;
  }
  if (inst.tag === 'ld-reg-reg' && (inst.dest === 'h' || inst.dest === 'l')) {
    return true;
  }
  return false;
}

function nextHLValue(current, inst) {
  if (!inst) {
    return null;
  }
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    return inst.value >>> 0;
  }
  if (inst.tag === 'inc-pair' && inst.pair === 'hl' && Number.isInteger(current)) {
    return (current + 1) & 0xFFFFFF;
  }
  if (inst.tag === 'dec-pair' && inst.pair === 'hl' && Number.isInteger(current)) {
    return (current - 1) & 0xFFFFFF;
  }
  if (updatesHL(inst)) {
    return null;
  }
  return current;
}

function disassembleRange(rom) {
  const rows = [];
  let pc = RANGE_START;
  let hlValue = null;

  while (pc < RANGE_END && pc < rom.length) {
    const inst = safeDecode(rom, pc);
    const length = Math.max(1, inst.length ?? 1);
    const text = formatInstructionText(inst);
    const parts = splitInstructionText(text);
    const row = {
      pc,
      inst,
      length,
      hlValue,
      bytes: instructionBytes(rom, pc, length),
      mnemonic: parts.mnemonic,
      operands: parts.operands,
      annotations: [],
      ramReads: [],
      ramWrites: [],
      iyAccess: null,
    };

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      const known = KNOWN_CALL_TARGETS.get(inst.target >>> 0);
      row.annotations.push(
        known
          ? `CALL ${hex(inst.target)} = ${known}`
          : `CALL ${hex(inst.target)}`,
      );
    }

    if (BRANCH_TAGS.has(inst.tag)) {
      const branchNote = describeBranchTarget(pc, inst.target);
      if (branchNote) {
        row.annotations.push(branchNote);
      }
    }

    const iyAccess = extractIYAccess(inst);
    if (iyAccess) {
      row.iyAccess = iyAccess;
      row.annotations.push(
        `IY${signed(iyAccess.offset)} -> ${hex(iyAccess.effective)} [${iyAccess.detail}]`,
      );
    }

    if (
      inst.tag === 'ld-pair-mem' &&
      inst.pair === 'hl' &&
      inst.direction !== 'to-mem' &&
      inst.addr >= 0xD00700 &&
      inst.addr <= 0xD007FF
    ) {
      row.annotations.push(`context handler table read ${hex(inst.addr)}`);
    }

    row.ramReads.push(...instructionReadsAbsoluteRam(inst));
    row.ramWrites.push(...instructionWritesAbsoluteRam(inst));

    if (inst.tag === 'ld-reg-ind' && inst.src === 'hl' && Number.isInteger(hlValue) && hlValue >= 0xD00000 && hlValue <= 0xDFFFFF) {
      row.ramReads.push({ addr: hlValue >>> 0, kind: 'indirect-hl', detail: 'read -> a via HL' });
      row.annotations.push(`RAM read via HL currently ${hex(hlValue)}`);
    }

    if (inst.tag === 'ld-ind-reg' && inst.dest === 'hl' && Number.isInteger(hlValue) && hlValue >= 0xD00000 && hlValue <= 0xDFFFFF) {
      row.ramWrites.push({ addr: hlValue >>> 0, kind: 'indirect-hl', detail: `write <- ${inst.src} via HL` });
      row.annotations.push(`RAM write via HL currently ${hex(hlValue)}`);
    }

    rows.push(row);
    hlValue = nextHLValue(hlValue, inst);
    pc = (pc + length) >>> 0;
  }

  return rows;
}

function aggregateAccessCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.addr >>> 0}:${entry.detail}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries(), ([key, count]) => {
    const [kind, rawAddr, detail] = key.split(':');
    return {
      kind,
      addr: Number(rawAddr),
      detail,
      count,
    };
  }).sort((left, right) => left.addr - right.addr || left.kind.localeCompare(right.kind));
}

function summarize(rows) {
  const calls = rows.filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional');
  const iyChecks = rows.filter((row) => row.iyAccess?.category === 'check');
  const iySets = rows.filter((row) => row.iyAccess?.category === 'set');
  const iyResets = rows.filter((row) => row.iyAccess?.category === 'res');
  const iyLoads = rows.filter((row) => row.iyAccess?.category === 'ld-read' || row.iyAccess?.category === 'ld-write');
  const conditionalBranches = rows.filter((row) => CONDITIONAL_BRANCH_TAGS.has(row.inst.tag));
  const ramReads = aggregateAccessCounts(rows.flatMap((row) => row.ramReads));
  const ramWrites = aggregateAccessCounts(rows.flatMap((row) => row.ramWrites));
  const iyOffsets = Array.from(
    new Set(rows.filter((row) => row.iyAccess).map((row) => row.iyAccess.offset)),
  ).sort((left, right) => left - right);
  const contextHlLoads = rows.filter(
    (row) =>
      row.inst.tag === 'ld-pair-mem' &&
      row.inst.pair === 'hl' &&
      row.inst.direction !== 'to-mem' &&
      row.inst.addr >= 0xD00700 &&
      row.inst.addr <= 0xD007FF,
  );

  const purpose = [];
  if (iyResets.length > 0) {
    purpose.push('Front half is flag cleanup: it clears several sticky IY bits before and during key-state normalization.');
  }
  if (ramWrites.some((entry) => entry.addr === 0xD0058C) || ramWrites.some((entry) => entry.addr === 0xD0058E)) {
    purpose.push('It actively normalizes key RAM at D0058C/D0058E, including a zeroing path when IY+31 bit 5 is clear.');
  }
  if (rows.some((row) => row.inst.target === RANGE_START)) {
    purpose.push('This is not a straight-line prologue: it can loop back to 0x08C331 and retry after helper/gating checks.');
  }
  if (rows.some((row) => row.inst.target === 0x08C72F)) {
    purpose.push('Tail block performs an 8-step HL walk starting from D0065A, translating each non-zero byte and sending it through 0x08C72F before key dispatch.');
  }
  if (rows.some((row) => row.inst.target === KEY_DISPATCH_START)) {
    purpose.push('Branches to 0x08C449 are the final handoff into the previously decoded key-dispatch cascade.');
  }

  return {
    calls,
    iyChecks,
    iySets,
    iyResets,
    iyLoads,
    conditionalBranches,
    ramReads,
    ramWrites,
    iyOffsets,
    contextHlLoads,
    purpose,
  };
}

function main() {
  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
  const rows = disassembleRange(rom);
  const summary = summarize(rows);

  console.log('Phase 341: full CoorMon entry setup disassembly');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Window: ${hex(RANGE_START)} .. ${hex(RANGE_END)} (${RANGE_LENGTH} bytes, ADL decode)`);
  console.log(`Assumed IY base for effective flag addresses: ${hex(KNOWN_IY_BASE)}`);

  for (const row of rows) {
    const operandPart = row.operands ? `  ${row.operands}` : '';
    const annotationPart = row.annotations.length ? `  [${row.annotations.join('; ')}]` : '';
    console.log(
      `${hex(row.pc)}: ${row.bytes.padEnd(20)}  ${row.mnemonic.padEnd(10)}${operandPart}${annotationPart}`,
    );
  }

  console.log('\nSummary');
  console.log(`CALL instructions: ${summary.calls.length}`);
  for (const row of summary.calls) {
    const tag = row.inst.tag === 'call-conditional' ? ` ${String(row.inst.condition).toUpperCase()}` : '';
    const known = KNOWN_CALL_TARGETS.get(row.inst.target >>> 0);
    console.log(`  ${hex(row.pc)}${tag} -> ${hex(row.inst.target)}${known ? ` (${known})` : ''}`);
  }

  console.log(
    `IY flag checks: ${summary.iyChecks.length} | SETs: ${summary.iySets.length} | RESets: ${summary.iyResets.length} | indexed LDs: ${summary.iyLoads.length}`,
  );
  console.log(
    `IY offsets touched: ${summary.iyOffsets.length > 0 ? summary.iyOffsets.map((offset) => `${offset >= 0 ? '+' : ''}${offset}`).join(', ') : 'none'}`,
  );

  console.log(`Conditional branches: ${summary.conditionalBranches.length}`);
  for (const row of summary.conditionalBranches) {
    const targetText = Number.isInteger(row.inst.target) ? describeBranchTarget(row.pc, row.inst.target) : 'conditional return';
    console.log(`  ${hex(row.pc)} ${formatInstructionText(row.inst)} -> ${targetText}`);
  }

  console.log(`Absolute/indirect RAM reads: ${summary.ramReads.reduce((sum, entry) => sum + entry.count, 0)}`);
  if (summary.ramReads.length === 0) {
    console.log('  none');
  } else {
    for (const entry of summary.ramReads) {
      console.log(`  ${hex(entry.addr)} ${entry.kind} ${entry.detail} x${entry.count}`);
    }
  }

  console.log(`Absolute/indirect RAM writes: ${summary.ramWrites.reduce((sum, entry) => sum + entry.count, 0)}`);
  if (summary.ramWrites.length === 0) {
    console.log('  none');
  } else {
    for (const entry of summary.ramWrites) {
      console.log(`  ${hex(entry.addr)} ${entry.kind} ${entry.detail} x${entry.count}`);
    }
  }

  console.log(
    `Context-table LD HL,(D007xx) loads: ${summary.contextHlLoads.length}`,
  );
  if (summary.contextHlLoads.length === 0) {
    console.log('  none inside 0x08C331..0x08C449');
  }

  console.log('Likely setup purpose:');
  if (summary.purpose.length === 0) {
    console.log('  No strong heuristic summary was derived.');
  } else {
    for (const line of summary.purpose) {
      console.log(`  ${line}`);
    }
  }
}

main();
