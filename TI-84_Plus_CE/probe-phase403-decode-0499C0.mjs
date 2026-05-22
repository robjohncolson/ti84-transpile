#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase403-notification-handler-report.md');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const EXIT_ADDR = 0x0499C0;
const EXIT_CORE_END = 0x0499D8;
const EXIT_TABLE_ADDR = 0x0499D8;
const EXIT_TAIL_START = 0x049A15;
const EXIT_END = 0x049A23;

const DISPATCH_ADDR = 0x049CCA;
const DISPATCH_CORE_END = 0x049D3A;
const DISPATCH_TABLE_ADDR = 0x049D3A;
const TYPE_REG = 0xD177B9;
const VALUE_REG = 0xD177B8;
const CALL_0499C0 = [0xCD, 0xC0, 0x99, 0x04];
const JP_0499C0 = [0xC3, 0xC0, 0x99, 0x04];

const TYPE_LABELS = new Map([
  [0x00, 'switch / generic'],
  [0x01, 'Home Screen'],
  [0x02, 'Y='],
  [0x03, 'Window / Format'],
  [0x04, 'Zoom'],
  [0x10, 'Menu / Dialog'],
  [0x11, 'Stat / List Editor'],
  [0x12, 'Matrix Editor'],
  [0x13, 'Graph Active'],
  [0x14, 'Table'],
  [0x15, 'Distribution / Finance'],
  [0x16, 'Catalog'],
  [0x17, 'Program Editor'],
  [0x18, 'Apps / Memory'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function labelForType(value) {
  return TYPE_LABELS.get(value) ?? 'unlabeled';
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function formatBytes(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function decodeSafe(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    return inst && inst.length ? inst : null;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair': return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ixd': return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    default: return inst.mnemonic ? `${prefix}${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}` : `${prefix}${inst.tag}`;
  }
}

function parseSeqcase(base) {
  const rawCount = rom[base];
  const numCases = rawCount - 1;
  let off = base + 3;
  const entries = [];
  for (let i = 0; i < numCases; i++) {
    const target = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
    const key = rom[off + 3];
    entries.push({ key, target });
    off += 4;
  }
  const defaultTarget = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
  return { rawCount, numCases, entries, defaultTarget, end: off + 3 };
}

function disassembleLinear(start, endExclusive) {
  const rows = [];
  for (let pc = start; pc < endExclusive;) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    pc = inst.nextPc ?? (pc + inst.length);
  }
  return rows;
}

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function recoverContextRows(endPc, maxLookback = 40) {
  const candidates = [];
  for (let start = Math.max(0, endPc - maxLookback); start < endPc; start++) {
    const rows = [];
    let pc = start;
    let ok = true;
    while (pc < endPc) {
      const inst = decodeSafe(pc);
      if (!inst || inst.nextPc > endPc) {
        ok = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (ok && pc === endPc) candidates.push(rows);
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}

function renderRows(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`);
}

function previewTarget(start, maxInstructions = 8) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInstructions; i++) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    pc = inst.nextPc;
    if (['ret', 'ret-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional'].includes(inst.tag)) break;
  }
  return rows;
}

function describeExitTarget(target) {
  if (target === 0x049A15) return 'JR to epilogue; returns local retval unchanged (still 0x01)';
  if (target === 0x049A1B) return 'direct epilogue; returns local retval unchanged (still 0x01)';
  if (target === 0x049A17) return 'would zero local retval, but no table entry selects this target';
  return 'unknown';
}

function buildReport() {
  const exitCoreRows = disassembleLinear(EXIT_ADDR, EXIT_CORE_END);
  const exitTailRows = disassembleLinear(EXIT_TAIL_START, EXIT_END);
  const dispatchCoreRows = disassembleLinear(DISPATCH_ADDR, DISPATCH_CORE_END);
  const exitTable = parseSeqcase(EXIT_TABLE_ADDR);
  const dispatchTable = parseSeqcase(DISPATCH_TABLE_ADDR);
  const callSites = findPattern(CALL_0499C0);
  const jpSites = findPattern(JP_0499C0);

  const lines = [];
  lines.push('# Phase 403 - Decode 0x0499C0 Notification Handler');
  lines.push('');
  lines.push(`ROM: ${ROM_PATH}`);
  lines.push(`Decoder: ${DECODER_PATH}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('- `0x0499C0` never reads a positive `IX+offset` argument slot. The pushed destination type is ignored.');
  lines.push(`- Its only global RAM read is \`${hex(TYPE_REG)}\`, the current notification type.`);
  lines.push('- All reachable paths return `0x01`, so this ROM image uses `0x0499C0` as an always-allow exit hook.');
  lines.push(`- The ` + '`0x049D3A`' + ` default handler stores `(IX+6)` into ` + `\`${hex(VALUE_REG)}\`` + ` just like every explicit case; it is not the orphan ` + '`0x049DF5`' + ` stub.');
  lines.push('');
  lines.push('## 1. Full Disassembly of 0x0499C0');
  lines.push('');
  lines.push('### 1.1 Executable Prologue');
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(exitCoreRows));
  lines.push('```');
  lines.push('');
  lines.push('### 1.2 Inline _seqcase Table');
  lines.push('');
  lines.push(`- rawCount = ${exitTable.rawCount}`);
  lines.push(`- case count = ${exitTable.numCases}`);
  lines.push(`- default target = ${hex(exitTable.defaultTarget)}`);
  lines.push('');
  lines.push('| Current type | Label | Target | Meaning |');
  lines.push('| --- | --- | --- | --- |');
  for (const entry of exitTable.entries) {
    lines.push(`| ${hex(entry.key, 2)} | ${labelForType(entry.key)} | ${hex(entry.target)} | ${describeExitTarget(entry.target)} |`);
  }
  lines.push(`| default | any unmapped type | ${hex(exitTable.defaultTarget)} | ${describeExitTarget(exitTable.defaultTarget)} |`);
  lines.push('');
  lines.push('### 1.3 Tail / Epilogue Stubs');
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(exitTailRows));
  lines.push('```');
  lines.push('');
  lines.push('## 2. Parameter and RAM Access Map');
  lines.push('');
  lines.push('- Positive `IX+offset` argument reads: none.');
  lines.push('- Local frame slot used: `(IX-1)` only, as a one-byte return value initialized to `0x01`.');
  lines.push(`- Global RAM reads: ${hex(TYPE_REG)} only.`);
  lines.push('- Global RAM writes: none.');
  lines.push('- IY-offset flags touched: none.');
  lines.push('- Calls: `0x00012C` (frame setup), `0x000124` (_seqcase).');
  lines.push('- Return value: `A = (IX-1)`, which stays `0x01` on every reachable path.');
  lines.push('');
  lines.push('## 3. All ROM Callers of 0x0499C0');
  lines.push('');
  lines.push(`- Literal CALL hits: ${callSites.length}`);
  lines.push(`- Literal JP hits: ${jpSites.length}`);
  lines.push('');
  for (const callPc of callSites) {
    const rows = recoverContextRows(callPc);
    lines.push(`### Caller ${hex(callPc)}`);
    lines.push('');
    lines.push('```text');
    lines.push(...renderRows(rows.slice(-5)));
    lines.push(`${hex(callPc)}  ${formatBytes(callPc, 4).padEnd(16)}  CALL ${hex(EXIT_ADDR)}`);
    lines.push('```');
    lines.push('');
    lines.push('- The caller passes `BC = zext((IX+9))`, i.e. the requested destination type.');
    lines.push('- `0x0499C0` does not read that argument.');
    lines.push('');
  }
  lines.push('## 4. Handler Jump Table at 0x049D3A');
  lines.push('');
  lines.push(`- rawCount = ${dispatchTable.rawCount}`);
  lines.push(`- case count = ${dispatchTable.numCases}`);
  lines.push(`- default target = ${hex(dispatchTable.defaultTarget)}`);
  lines.push('');
  lines.push('### 4.1 Unique Handler Bodies');
  lines.push('');
  const uniqueTargets = new Map();
  for (const entry of dispatchTable.entries) {
    if (!uniqueTargets.has(entry.target)) uniqueTargets.set(entry.target, previewTarget(entry.target));
  }
  if (!uniqueTargets.has(dispatchTable.defaultTarget)) uniqueTargets.set(dispatchTable.defaultTarget, previewTarget(dispatchTable.defaultTarget));
  for (const [target, rows] of [...uniqueTargets.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`#### ${hex(target)}`);
    lines.push('');
    lines.push('```text');
    lines.push(...renderRows(rows));
    lines.push('```');
    lines.push('');
  }
  lines.push('### 4.2 Type Map 0x00-0x18');
  lines.push('');
  lines.push('| Type | Label | Target | Selected via | Behavior |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (let type = 0x00; type <= 0x18; type++) {
    const explicit = dispatchTable.entries.find((entry) => entry.key === type);
    const target = explicit ? explicit.target : dispatchTable.defaultTarget;
    lines.push(`| ${hex(type, 2)} | ${labelForType(type)} | ${hex(target)} | ${explicit ? 'explicit' : 'default'} | load \`(IX+6)\`, store to ${hex(VALUE_REG)}, jump epilogue |`);
  }
  lines.push('');
  lines.push('## 5. Cross-Reference With 0x049CCA');
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(dispatchCoreRows));
  lines.push('```');
  lines.push('');
  lines.push('1. `0x049CCA` compares the requested type `(IX+9)` against the current type in `0xD177B9`.');
  lines.push('2. On a mismatch, it pushes the requested type and calls `0x0499C0`.');
  lines.push('3. `0x0499C0` ignores that argument and returns `0x01`.');
  lines.push('4. `0x049CCA` therefore always takes the recursive old-state flush path: `0x049CCA(old_type, 0x00)`.');
  lines.push(`5. After the recursive flush, it commits the new type to ${hex(TYPE_REG)} and stores the new payload into ${hex(VALUE_REG)} through the 0x049D3A selector table.`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push('- `0x0499C0` is not a real teardown routine in this ROM image.');
  lines.push('- It is an exit-hook slot whose implementation always allows the transition.');
  lines.push('- The actual old-state cleanup is the recursive `0x049CCA(old_type, 0)` call, not `0x0499C0` itself.');
  lines.push('');
  lines.push(`Report also written to: ${REPORT_PATH}`);

  return `${lines.join('\n')}\n`;
}

const report = buildReport();
fs.writeFileSync(REPORT_PATH, report);
process.stdout.write(report);
