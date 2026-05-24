#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x00E06D;
const SCAN_BYTES = 800;
const SCAN_END_EXCLUSIVE = START + SCAN_BYTES;
const RAM_MIN = 0xD10000;
const RAM_MAX = 0xD1FFFF;
const EPILOGUE_PATTERN = [0xDD, 0xF9, 0xDD, 0xE1, 0xC9];
const ALLOC_CALL_PATTERN = [0xCD, 0x6D, 0xE0, 0x00];
const ALLOC_JP_PATTERN = [0xC3, 0x6D, 0xE0, 0x00];

const CALL_LABELS = new Map([
  [0x002197, '__frameset'],
  [0x00211B, '_seqcase sparse dispatcher'],
  [0x00276B, 'zero-extend BC -> HL helper'],
  [0x0022F9, 'shift-left helper (HL <<= A)'],
]);

const RAM_LABELS = new Map([
  [0xD13FFC, 'descriptor pointer A'],
  [0xD13FFF, 'descriptor pointer B'],
  [0xD14002, 'descriptor pointer C'],
  [0xD1401A, 'selector-0 slab base'],
  [0xD14020, 'selector-2 slab base'],
  [0xD1405C, 'selector-0 slot-state array (16 entries)'],
  [0xD1406C, 'selector-2 slot-state array (6 entries)'],
  [0xD140AC, 'current allocated-block scratch / return slot'],
  [0xD141BE, 'bootstrap selector-2 block'],
]);

const CALLER_LABELS = new Map([
  [0x00CE7D, 'descriptor triplet setup A'],
  [0x00CE9C, 'descriptor triplet setup B'],
  [0x00CEDC, 'descriptor triplet setup C'],
  [0x00DFFF, 'USB helper: selector-0 descriptor alloc'],
  [0x00E369, 'pool bootstrap: selector-2 alloc'],
  [0x00EBB4, 'USB helper: selector-0 descriptor alloc with error 2 on null'],
  [0x010F9F, 'port-gated selector-2 wrapper'],
]);

const CALLER_NOTES = new Map([
  [0x00CE7D, 'pushes selector 0, stores HL into D13FFC'],
  [0x00CE9C, 'pushes selector 0, stores HL into D13FFF'],
  [0x00CEDC, 'pushes selector 0, stores HL into D14002'],
  [0x00DFFF, 'pushes selector 0, stores HL into a local, then null-checks'],
  [0x00E369, 'pushes selector 2, stores HL into D141BE during allocator bootstrap'],
  [0x00EBB4, 'pushes selector 0, stores HL into a local, jumps to error 2 if null'],
  [0x010F9F, 'pushes selector 2 after an IN A,(0x3082) bit-4 gate in the wrapper at 0x010F8C'],
]);

const BRANCH_NOTES = new Map([
  [0x00E098, 'selector 0 loop: if slotIndex < 16, inspect D1405C[slotIndex]'],
  [0x00E09A, 'selector 0 exhausted: return null'],
  [0x00E0C0, 'slot state != 1, so advance to the next selector-0 slot'],
  [0x00E156, 'selector 0 loop back-edge'],
  [0x00E165, 'selector 2 loop: if slotIndex < 6, inspect D1406C[slotIndex]'],
  [0x00E167, 'selector 2 exhausted: return null'],
  [0x00E18B, 'slot state != 1, so advance to the next selector-2 slot'],
  [0x00E1C2, 'selector 2 loop back-edge'],
]);

const PC_COMMENTS = new Map([
  [0x00E075, ['load selector argument from IX+6']],
  [0x00E07C, ['dispatch on selector through the inline _seqcase table']],
  [0x00E09E, ['selector 0: initialize local slot index to 0']],
  [0x00E08D, ['selector 0: loop bound is 16 slots']],
  [0x00E0B4, ['selector 0: read D1405C[slotIndex]']],
  [0x00E0D0, ['selector 0: write D1405C[slotIndex] = 2 to claim the slab']],
  [0x00E0E3, ['selector 0 return pointer = D1401A + slotIndex * 0x20']],
  [0x00E0E4, ['cache the selector-0 return pointer in D140AC']],
  [0x00E0F0, ['set bit 0 at block offset +0x00']],
  [0x00E102, ['set bit 0 at block offset +0x04']],
  [0x00E114, ['clear bit 7 at block offset +0x08']],
  [0x00E128, ['rewrite byte +0x09 as (old & 0x73) | 0x83']],
  [0x00E13F, ['zero the 24-bit field at offsets +0x0C..+0x0E']],
  [0x00E142, ['zero byte +0x0F']],
  [0x00E146, ['load the final selector-0 return pointer into HL']],
  [0x00E169, ['selector 2: initialize local slot index to 0']],
  [0x00E15A, ['selector 2: loop bound is 6 slots']],
  [0x00E17F, ['selector 2: read D1406C[slotIndex]']],
  [0x00E199, ['selector 2: write D1406C[slotIndex] = 2 to claim the slab']],
  [0x00E1A7, ['shift count 10, used to scale slotIndex by 0x400']],
  [0x00E1AD, ['selector 2 return pointer = D14020 + slotIndex * 0x400']],
  [0x00E1AE, ['cache the selector-2 return pointer in D140AC']],
  [0x00E1B2, ['load the final selector-2 return pointer into HL']],
  [0x00E1C4, ['unsupported selector or full pool: force HL = 0']],
  [0x00E1C7, ['common epilogue']],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function labelFor(map, value) {
  return map.get(value) ?? null;
}

function formatAddress(addr, width, labels) {
  const label = labelFor(labels, addr);
  return `${hex(addr, width)}${label ? ` (${label})` : ''}`;
}

function isRam(addr) {
  return addr >= RAM_MIN && addr <= RAM_MAX;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
      }
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `LD (HL),${hex(inst.value, 2)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return withPrefix(inst, `LEA ${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}`);
    }
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'in-imm':
      return withPrefix(inst, `IN A,(${hex(inst.port, 2)})`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'out-imm':
      return withPrefix(inst, `OUT (${hex(inst.port, 2)}),A`);
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function matchesAt(offset, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    if (rom[offset + i] !== bytes[i]) {
      return false;
    }
  }
  return true;
}

function findSelectorTableStart() {
  for (let pc = START; pc < START + 0x20; ) {
    const inst = safeDecode(pc);
    if (inst.tag === 'call' && inst.target === 0x00211B) {
      return inst.nextPc;
    }
    pc = inst.nextPc;
  }
  throw new Error('Could not locate the inline _seqcase table.');
}

function parseSelectorTable(tableStart) {
  const count = read16(tableStart);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryPc = tableStart + 2 + i * 4;
    entries.push({
      pc: entryPc,
      key: rom[entryPc],
      target: read24(entryPc + 1),
    });
  }
  const defaultPc = tableStart + 2 + count * 4;
  const defaultTarget = read24(defaultPc);
  return {
    tableStart,
    count,
    entries,
    defaultPc,
    defaultTarget,
    bodyStart: defaultPc + 3,
  };
}

function findAllocatorEnd() {
  for (let offset = START; offset <= SCAN_END_EXCLUSIVE - EPILOGUE_PATTERN.length; offset++) {
    if (matchesAt(offset, EPILOGUE_PATTERN)) {
      return offset + EPILOGUE_PATTERN.length - 1;
    }
  }
  throw new Error('Could not locate the allocator epilogue within the 800-byte scan window.');
}

function analyzeInstruction(pc, inst, comments, summary) {
  if (inst.tag === 'call') {
    summary.callSites.push({ pc, target: inst.target });
    const label = CALL_LABELS.get(inst.target);
    if (label) {
      comments.push(`call ${hex(inst.target)} (${label})`);
    }
  }

  if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    summary.branches.push({
      pc,
      text: formatInstruction(inst),
      note: BRANCH_NOTES.get(pc) ?? null,
    });
    if (BRANCH_NOTES.has(pc)) {
      comments.push(BRANCH_NOTES.get(pc));
    }
  }

  if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    const addr = inst.addr;
    if (typeof addr === 'number' && isRam(addr)) {
      if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || inst.direction === 'to-mem') {
        summary.ramWrites.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM write ${formatAddress(addr, 6, RAM_LABELS)}`);
      } else {
        summary.ramReads.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM read ${formatAddress(addr, 6, RAM_LABELS)}`);
      }
    }
  }

  if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
    summary.portIo.push({ pc, text: formatInstruction(inst) });
  }

  const extraComments = PC_COMMENTS.get(pc);
  if (extraComments) {
    comments.push(...extraComments);
  }
}

function disassembleRange(start, stopExclusive, rows, summary) {
  for (let pc = start; pc < stopExclusive; ) {
    const inst = safeDecode(pc);
    const comments = [];
    analyzeInstruction(pc, inst, comments, summary);
    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
      comments,
    });
    pc = inst.nextPc;
  }
}

function emitSelectorTable(table, rows) {
  rows.push({
    pc: table.tableStart,
    length: 2,
    bytes: formatBytes(table.tableStart, 2),
    text: `DW ${hex(table.count, 4)}`,
    comments: ['_seqcase entry count'],
  });
  for (const entry of table.entries) {
    rows.push({
      pc: entry.pc,
      length: 4,
      bytes: formatBytes(entry.pc, 4),
      text: `CASE ${hex(entry.key, 2)} -> ${hex(entry.target)}`,
      comments: [entry.key === 0 ? 'selector 0 path' : entry.key === 2 ? 'selector 2 path' : 'selector case'],
    });
  }
  rows.push({
    pc: table.defaultPc,
    length: 3,
    bytes: formatBytes(table.defaultPc, 3),
    text: `DEFAULT ${hex(table.defaultTarget)}`,
    comments: ['unsupported selectors fall through to the null-return path'],
  });
}

function scanDirectCallers() {
  const callers = [];
  for (let pc = 0; pc <= rom.length - ALLOC_CALL_PATTERN.length; pc++) {
    if (!matchesAt(pc, ALLOC_CALL_PATTERN)) {
      continue;
    }

    let selector = null;
    if (pc >= 5 && rom[pc - 5] === 0x01 && rom[pc - 1] === 0xC5) {
      selector = read24(pc - 4);
    }

    callers.push({
      pc,
      selector,
      label: CALLER_LABELS.get(pc) ?? null,
      note: CALLER_NOTES.get(pc) ?? null,
    });
  }
  return callers;
}

function scanJumpThunks() {
  const hits = [];
  for (let pc = 0; pc <= rom.length - ALLOC_JP_PATTERN.length; pc++) {
    if (matchesAt(pc, ALLOC_JP_PATTERN)) {
      hits.push(pc);
    }
  }
  return hits;
}

function pushUniqueAddress(list, addr) {
  if (!list.includes(addr)) {
    list.push(addr);
  }
}

function buildDerivedRamSummary() {
  return [
    `${hex(0x00E0B4)} / ${hex(0x00E0D0)} -> ${formatAddress(0xD1405C, 6, RAM_LABELS)} + slotIndex (read state, then write 0x02 on success)`,
    `${hex(0x00E17F)} / ${hex(0x00E199)} -> ${formatAddress(0xD1406C, 6, RAM_LABELS)} + slotIndex (read state, then write 0x02 on success)`,
    `${hex(0x00E0ED)}..${hex(0x00E142)} -> selector-0 payload header writes at returnPtr + {0x00, 0x04, 0x08, 0x09, 0x0C..0x0F}`,
  ];
}

const selectorTableStart = findSelectorTableStart();
const selectorTable = parseSelectorTable(selectorTableStart);
const END = findAllocatorEnd();
const NEXT_FUNCTION_START = END + 1;

const rows = [];
const summary = {
  callSites: [],
  ramReads: [],
  ramWrites: [],
  portIo: [],
  branches: [],
};

disassembleRange(START, selectorTable.tableStart, rows, summary);
emitSelectorTable(selectorTable, rows);
disassembleRange(selectorTable.bodyStart, END + 1, rows, summary);

const callers = scanDirectCallers();
const jumpThunks = scanJumpThunks();
const uniqueCallTargets = [...new Set(summary.callSites.map((site) => site.target))].sort((a, b) => a - b);
const uniqueRamReads = [];
const uniqueRamWrites = [];
for (const entry of summary.ramReads) {
  pushUniqueAddress(uniqueRamReads, entry.addr);
}
for (const entry of summary.ramWrites) {
  pushUniqueAddress(uniqueRamWrites, entry.addr);
}

const lines = [];
lines.push('# Phase 424 Probe: Static Trace of 0x00E06D', '');
lines.push(`Scanned ${SCAN_BYTES} bytes starting at ${hex(START)} (${hex(START)}..${hex(SCAN_END_EXCLUSIVE - 1)}) to locate the allocator epilogue.`);
lines.push(`Detected function span: ${hex(START)}..${hex(END)} (${END - START + 1} bytes).`);
lines.push(`Inline _seqcase table: ${hex(selectorTable.tableStart)}..${hex(selectorTable.bodyStart - 1)} (${selectorTable.bodyStart - selectorTable.tableStart} bytes).`);
lines.push(`Next function begins immediately at ${hex(NEXT_FUNCTION_START)} (the selector-driven free helper traced in phase 422).`);
lines.push('');
lines.push('Selector table:');
for (const entry of selectorTable.entries) {
  lines.push(`- ${hex(entry.key, 2)} -> ${hex(entry.target)}${entry.key === 0 ? ' (selector-0 slab pool)' : entry.key === 2 ? ' (selector-2 slab pool)' : ''}`);
}
lines.push(`- default -> ${hex(selectorTable.defaultTarget)} (return HL = 0)`);
lines.push('');
lines.push('Disassembly:');
for (const row of rows) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(34, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');
lines.push('Control-flow notes:');
lines.push(`- Entry ${hex(START)} -> _seqcase at ${hex(0x00E07C)} -> selector 0 case ${hex(0x00E09E)}, selector 2 case ${hex(0x00E169)}, default ${hex(0x00E1C4)}.`);
lines.push(`- Selector 0 loop header ${hex(0x00E08D)} scans D1405C linearly from slot 0 upward; success path is ${hex(0x00E0C4)}..${hex(0x00E146)}, failure loops via ${hex(0x00E14C)}..${hex(0x00E156)}.`);
lines.push(`- Selector 2 loop header ${hex(0x00E15A)} scans D1406C linearly from slot 0 upward; success path is ${hex(0x00E18D)}..${hex(0x00E1B2)}, failure loops via ${hex(0x00E1B8)}..${hex(0x00E1C2)}.`);
lines.push(`- Common failure path ${hex(0x00E1C4)} forces HL = 0, then both success and failure exit through ${hex(0x00E1C7)}..${hex(0x00E1CB)}.`);
lines.push('');
lines.push('CALL targets:');
for (const target of uniqueCallTargets) {
  const sites = summary.callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
  lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
}
lines.push('');
lines.push('Absolute D1xxxx RAM reads inside 0x00E06D:');
for (const addr of uniqueRamReads) {
  lines.push(`- ${formatAddress(addr, 6, RAM_LABELS)}`);
}
lines.push('');
lines.push('Absolute D1xxxx RAM writes inside 0x00E06D:');
for (const addr of uniqueRamWrites) {
  lines.push(`- ${formatAddress(addr, 6, RAM_LABELS)}`);
}
lines.push('');
lines.push('Derived RAM activity:');
for (const line of buildDerivedRamSummary()) {
  lines.push(`- ${line}`);
}
lines.push('');
lines.push('Port I/O inside 0x00E06D:');
if (!summary.portIo.length) {
  lines.push('- none');
} else {
  for (const access of summary.portIo) {
    lines.push(`- ${hex(access.pc)} ${access.text}`);
  }
}
lines.push('');
lines.push('Direct callers of 0x00E06D:');
for (const caller of callers) {
  const selectorText = caller.selector == null ? 'selector unknown' : `selector ${hex(caller.selector, caller.selector <= 0xFF ? 2 : 6)}`;
  lines.push(`- ${hex(caller.pc)} ${selectorText}${caller.label ? ` | ${caller.label}` : ''}${caller.note ? ` | ${caller.note}` : ''}`);
}
lines.push('');
lines.push('Direct JP thunks to 0x00E06D:');
if (!jumpThunks.length) {
  lines.push('- none');
} else {
  for (const thunk of jumpThunks) {
    lines.push(`- ${hex(thunk)} low-ROM jump-table thunk`);
  }
}
lines.push('');
lines.push('Assessment:');
lines.push('- 0x00E06D is a selector-driven slab allocator, not a variable-size heap allocator.');
lines.push('- Selector 0 returns D1401A + slotIndex * 0x20 after a first-fit scan over D1405C[0..15] for state byte 1, then writes state 2 and initializes the first 0x10 bytes of the descriptor slab.');
lines.push('- Selector 2 returns D14020 + slotIndex * 0x400 after a first-fit scan over D1406C[0..5] for state byte 1, then writes state 2 and returns without per-block header initialization.');
lines.push('- The so-called free "bitmaps" are actually byte arrays in this code path: the allocator tests each slot byte against 1 and stores 2 on allocation.');
lines.push('- This is symmetric with the free helper at 0x00E1CC: both use the same selector table and the same slot-index formulas (shift 5 for 0x20-byte slabs, shift 10 for 0x400-byte slabs), but free flips the state byte back to 1 and wipes only selector-0 payloads.');

console.log(lines.join('\n'));
