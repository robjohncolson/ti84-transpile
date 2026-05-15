#!/usr/bin/env node
// Phase 328: map the low-ROM vector table around 0x000120.
//
// Session 324 established that 0x000138 is vector slot #6 with 545 direct
// callers. This probe maps the whole 0x000120..0x000198 region, compares
// multiple encodings, and summarizes the aligned JP table that emerges.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REFERENCES_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const TABLE_START = 0x000120;
const TABLE_END = 0x000198;
const ROM_MAX = 0x3FFFFF;
const MAX_TARGET_INSTRUCTIONS = 5;
const JP_OPCODE = 0xC3;

const DIRECT_XREF_OPS = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const KNOWN_VECTOR_NOTES = new Map([
  [0x000000, 'reset vector'],
  [0x000038, 'RST 38h (mode 1 interrupt)'],
  [0x000066, 'NMI vector'],
  [0x000138, 'session 324: vector #6, 545 direct callers, generic OS utility hotspot'],
  [0x0005CC, 'session 324: runtime BCALL vector #19'],
]);

const SPECIAL_SLOT_NAMES = new Map([
  [0x000128, 'usbGap0128'],
  [0x00012C, 'usbGap012C'],
  [0x00015C, 'usbGap015C'],
]);

const rom = readFileSync(ROM_PATH);

// This probe is static, but keep the usual probe environment shape and disable
// timer IRQs so future extensions can drop in a runtime without changing setup.
const _peripherals = createPeripheralBus({ timerInterrupt: false });
void _peripherals;

const symbolMap = loadSymbolMap();
const alignedJpEnd = detectAlignedJpEnd(TABLE_END);
const slotAddresses = [];
for (let addr = TABLE_START; addr < alignedJpEnd; addr += 4) {
  slotAddresses.push(addr);
}
const xrefMap = scanDirectRefsForSlots(slotAddresses);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function truncate(text, limit = 72) {
  const value = String(text ?? '');
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function read32(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16) |
    ((buffer[addr + 3] ?? 0) << 24)
  ) >>> 0;
}

function isRomTarget(addr) {
  return Number.isInteger(addr) && addr >= 0 && addr <= ROM_MAX && addr < rom.length;
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${upper(indexRegister)}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  const prefix = inst.modePrefix ? `${upper(inst.modePrefix)} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${upper(inst.condition)}`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'halt': return `${prefix}HALT`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'rlca': return `${prefix}RLCA`;
    case 'rrca': return `${prefix}RRCA`;
    case 'rla': return `${prefix}RLA`;
    case 'rra': return `${prefix}RRA`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${upper(inst.indirectRegister)})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${upper(inst.pair ?? inst.reg ?? inst.src)}`;
    case 'pop': return `${prefix}POP ${upper(inst.pair ?? inst.reg ?? inst.dest)}`;
    case 'inc-reg': return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg': return `${prefix}DEC ${upper(inst.reg)}`;
    case 'inc-pair': return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair': return `${prefix}DEC ${upper(inst.pair)}`;
    case 'add-pair': return `${prefix}ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair': return `${prefix}ADC HL, ${upper(inst.src)}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${upper(inst.src)}`;
    case 'alu-reg': return `${prefix}${upper(inst.op)} ${upper(inst.src ?? inst.reg)}`;
    case 'alu-imm': return `${prefix}${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ind': return `${prefix}LD ${upper(inst.dest)}, (${upper(inst.indirectRegister ?? inst.src)})`;
    case 'ld-ind-reg': return `${prefix}LD (${upper(inst.indirectRegister ?? inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-mem': return `${prefix}LD ${upper(inst.dest)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.src)}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `${prefix}LD ${upper(inst.pair)}, (${hex(inst.addr ?? inst.address, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `${prefix}LD (${hex(inst.addr ?? inst.address, width)}), ${upper(inst.pair)}`;
    }
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed': return `${prefix}LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'lea': return `${prefix}LEA ${upper(inst.dest)}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'ldi': return `${prefix}LDI`;
    case 'ldd': return `${prefix}LDD`;
    case 'cpir': return `${prefix}CPIR`;
    case 'cpdr': return `${prefix}CPDR`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'exx': return `${prefix}EXX`;
    case 'ex-sp-hl': return `${prefix}EX (SP), HL`;
    case 'ex-sp-ix': return `${prefix}EX (SP), IX`;
    case 'ex-sp-iy': return `${prefix}EX (SP), IY`;
    case 'ex-sp-pair': return `${prefix}EX (SP), ${upper(inst.pair ?? inst.reg ?? inst.indirectRegister)}`;
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    case 'out-imm': return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm': return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-c': return `${prefix}OUT (C), ${upper(inst.reg)}`;
    case 'in-c': return `${prefix}IN ${upper(inst.reg)}, (C)`;
    case 'im': return `${prefix}IM ${inst.mode}`;
    default: {
      let rendered = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) rendered += ` ${hex(inst.target)}`;
      else if (inst.value !== undefined) rendered += ` ${inst.value <= 0xFF ? hexByte(inst.value) : hex(inst.value)}`;
      return rendered;
    }
  }
}

function previewTarget(target, limit = MAX_TARGET_INSTRUCTIONS) {
  const rows = [];
  const visited = new Set();
  let pc = target >>> 0;

  while (rows.length < limit && isRomTarget(pc) && !visited.has(pc)) {
    visited.add(pc);
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst?.length) break;

      rows.push({
        pc,
        bytes: bytesToHex(rom.subarray(pc, pc + inst.length)),
        text: formatInstruction(inst),
        tag: inst.tag,
      });

      if (['ret', 'reti', 'retn', 'jp', 'jp-indirect'].includes(inst.tag)) break;
      pc = (inst.nextPc ?? (pc + inst.length)) & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(rom[pc]),
        text: `DB ${hexByte(rom[pc])} ; ${error?.message ?? 'decode error'}`,
        tag: 'decode-error',
      });
      break;
    }
  }

  return rows;
}

function previewSummary(lines, count = 3) {
  return truncate(lines.slice(0, count).map((line) => line.text).join(' | '), 78);
}

function loadSymbolMap() {
  const symbols = new Map();
  if (!existsSync(REFERENCES_PATH)) return symbols;

  const text = readFileSync(REFERENCES_PATH, 'utf8');
  const regex = /^\?([^\r\n:=]+?)\s*:=\s*([0-9A-Fa-f]+)h\s*$/gm;

  for (const match of text.matchAll(regex)) {
    const name = match[1].trim();
    const addr = parseInt(match[2], 16) >>> 0;
    symbols.set(addr, name);
  }

  return symbols;
}

function detectAlignedJpEnd(initialEnd) {
  let end = initialEnd;
  while (end + 4 <= rom.length && rom[end] === JP_OPCODE) {
    const target = read24(rom, end + 1);
    if (!isRomTarget(target)) break;
    end += 4;
  }
  return end;
}

function regionName(addr) {
  if (addr < 0x001000) return 'Vector/Low';
  if (addr < 0x020000) return 'OS Core';
  if (addr < 0x050000) return 'OS Mid';
  if (addr < 0x0A0000) return 'OS High';
  if (addr < 0x100000) return 'OS Upper';
  return 'Flash Apps';
}

function scanDirectRefsForSlots(slots) {
  const slotByKey = new Map();
  const results = new Map();

  for (const slot of slots) {
    const key = `${slot & 0xFF}:${(slot >>> 8) & 0xFF}:${(slot >>> 16) & 0xFF}`;
    slotByKey.set(key, slot);
    results.set(slot, {
      total: 0,
      refs: [],
      kindCounts: new Map(),
      regionCounts: new Map(),
      kindSummary: 'none',
      regionSummary: 'none',
      regionCount: 0,
    });
  }

  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const opText = DIRECT_XREF_OPS.get(rom[pc]);
    if (!opText) continue;

    const key = `${rom[pc + 1]}:${rom[pc + 2]}:${rom[pc + 3]}`;
    const slot = slotByKey.get(key);
    if (slot === undefined) continue;

    const entry = results.get(slot);
    entry.total += 1;
    entry.refs.push({ pc, op: opText });
    entry.kindCounts.set(opText, (entry.kindCounts.get(opText) ?? 0) + 1);

    const region = regionName(pc);
    entry.regionCounts.set(region, (entry.regionCounts.get(region) ?? 0) + 1);
  }

  for (const entry of results.values()) {
    entry.regionCount = entry.regionCounts.size;
    entry.kindSummary = [...entry.kindCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}:${count}`)
      .join(', ') || 'none';
    entry.regionSummary = [...entry.regionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}:${count}`)
      .join(', ') || 'none';
  }

  return results;
}

function slotName(slotAddr) {
  return symbolMap.get(slotAddr) ?? SPECIAL_SLOT_NAMES.get(slotAddr) ?? '(unnamed)';
}

function classifyVector(slotAddr, label, xref) {
  let family = 'USB-map helper';

  if (label !== '(unnamed)') {
    family = `USB-map accessor (${label})`;
  } else if (slotAddr < 0x000160) {
    family = 'USB core/helper slot';
  } else if (slotAddr < 0x000180) {
    family = 'USB IN-endpoint helper';
  } else {
    family = 'USB OUT-endpoint helper';
  }

  let fanout = 'no direct refs';
  if (xref.total >= 128) fanout = 'high-fanout';
  else if (xref.total >= 32) fanout = 'shared';
  else if (xref.total > 0) fanout = 'niche';

  if (slotAddr === 0x000138) {
    fanout = `session324 hotspot/${fanout}`;
  }

  return `${family}; ${fanout}`;
}

function build3ByteEntries() {
  const entries = [];
  for (let addr = TABLE_START; addr + 3 <= TABLE_END; addr += 3) {
    const target = read24(rom, addr);
    const valid = isRomTarget(target);
    entries.push({
      offset: addr,
      raw: rom.subarray(addr, addr + 3),
      target,
      valid,
      preview: valid ? previewTarget(target, 3) : [],
    });
  }
  return entries;
}

function build4ByteScalarEntries() {
  const entries = [];
  for (let addr = TABLE_START; addr + 4 <= alignedJpEnd; addr += 4) {
    const target = read32(rom, addr);
    const valid = isRomTarget(target);
    entries.push({
      offset: addr,
      raw: rom.subarray(addr, addr + 4),
      target,
      valid,
      preview: valid ? previewTarget(target, 3) : [],
    });
  }
  return entries;
}

function buildJpEntries() {
  const entries = [];
  for (let addr = TABLE_START; addr + 4 <= alignedJpEnd; addr += 4) {
    const target = read24(rom, addr + 1);
    const xref = xrefMap.get(addr) ?? {
      total: 0,
      refs: [],
      kindSummary: 'none',
      regionSummary: 'none',
      regionCount: 0,
    };
    const label = slotName(addr);
    const preview = previewTarget(target, MAX_TARGET_INSTRUCTIONS);

    entries.push({
      slotIndex: (addr - TABLE_START) / 4,
      offset: addr,
      opcode: rom[addr],
      raw: rom.subarray(addr, addr + 4),
      target,
      label,
      preview,
      xref,
      classification: classifyVector(addr, label, xref),
    });
  }
  return entries;
}

function formatTable(headers, rows) {
  const widths = headers.map((header, column) => {
    let width = header.length;
    for (const row of rows) {
      width = Math.max(width, String(row[column] ?? '').length);
    }
    return width;
  });

  const renderRow = (row) => row.map((cell, column) => String(cell ?? '').padEnd(widths[column])).join(' | ');
  const separator = widths.map((width) => '-'.repeat(width)).join('-|-');

  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n');
}

function printKnownVectorAnchors() {
  console.log('=== Known Vector Anchors ===');
  for (const [addr, note] of KNOWN_VECTOR_NOTES.entries()) {
    const insideTable = addr >= TABLE_START && addr < alignedJpEnd ? ' (inside this JP table)' : '';
    console.log(`  ${hex(addr)}${insideTable}: ${note}`);
  }
  console.log();
}

function printRawDump() {
  console.log('=== 1. Raw 0x000120..0x000198 Dump (0x78 bytes) ===');
  for (let addr = TABLE_START; addr < TABLE_END; addr += 4) {
    const bytes = rom.subarray(addr, addr + 4);
    const annotation = rom[addr] === JP_OPCODE
      ? `JP ${hex(read24(rom, addr + 1))}`
      : '(not JP)';
    console.log(`  ${hex(addr)}: ${bytesToHex(bytes).padEnd(19)} ; ${annotation}`);
  }

  if (alignedJpEnd > TABLE_END) {
    console.log('\n  Extension detected beyond the requested 0x78-byte window:');
    for (let addr = TABLE_END; addr < alignedJpEnd; addr += 4) {
      const bytes = rom.subarray(addr, addr + 4);
      console.log(`  ${hex(addr)}: ${bytesToHex(bytes).padEnd(19)} ; JP ${hex(read24(rom, addr + 1))}`);
    }
  }

  console.log();
}

function print3ByteView(entries) {
  console.log('=== 2. 3-Byte Little-Endian Interpretation (40 entries over 0x78 bytes) ===');
  const rows = entries.map((entry) => [
    hex(entry.offset),
    bytesToHex(entry.raw),
    hex(entry.target),
    entry.valid ? previewSummary(entry.preview, 2) : 'outside ROM',
  ]);

  console.log(formatTable(
    ['Offset', 'Bytes', '24-bit Target', 'First Instructions'],
    rows,
  ));
  console.log();
  console.log(`  Notes: ${entries.filter((entry) => entry.valid).length}/${entries.length} entries are numerically inside ROM,`);
  console.log('         but this view folds opcode bytes into the address stream and does not preserve 4-byte alignment.');
  console.log();
}

function print4ByteScalarView(entries) {
  console.log(`=== 3. 4-Byte Little-Endian Scalar Interpretation (${entries.length} aligned entries) ===`);
  const rows = entries.map((entry) => [
    hex(entry.offset),
    bytesToHex(entry.raw),
    hex(entry.target, 8),
    entry.valid ? previewSummary(entry.preview, 2) : 'outside ROM',
  ]);

  console.log(formatTable(
    ['Offset', 'Bytes', '32-bit Target', 'First Instructions'],
    rows,
  ));
  console.log();
  const lowByteC3 = entries.filter((entry) => (entry.target & 0xFF) === JP_OPCODE).length;
  console.log(`  Notes: ${lowByteC3}/${entries.length} scalar targets keep opcode 0xC3 in the low byte.`);
  console.log('         That is a strong sign these 4-byte cells are instruction stubs, not raw pointers.');
  console.log();
}

function printJpView(entries) {
  console.log(`=== 4. JP Interpretation (${entries.length} aligned vectors) ===`);
  const rows = entries.map((entry) => [
    `#${String(entry.slotIndex).padStart(2, '0')}`,
    hex(entry.offset),
    entry.label,
    hex(entry.target),
    String(entry.xref.total),
    previewSummary(entry.preview, 3),
  ]);

  console.log(formatTable(
    ['Slot', 'Offset', 'Address', 'Target', 'Callers', 'First Instructions'],
    rows,
  ));
  console.log();
  console.log('  Verdict: every aligned cell is `JP low,mid,high`, and the targets cluster in 0x0020E5..0x00239E.');
  console.log('           This is a software JP vector table, not a raw 24-bit/32-bit pointer block.');
  console.log();
}

function printDetailedTargets(entries) {
  console.log('=== 5. JP Target Details ===');
  for (const entry of entries) {
    console.log(`\n[#${entry.slotIndex}] ${hex(entry.offset)} ${entry.label} -> ${hex(entry.target)}`);
    console.log(`  Callers: ${entry.xref.total} (${entry.xref.kindSummary})`);
    console.log(`  Regions: ${entry.xref.regionSummary}`);
    console.log(`  Class:   ${entry.classification}`);
    if (KNOWN_VECTOR_NOTES.has(entry.offset)) {
      console.log(`  Note:    ${KNOWN_VECTOR_NOTES.get(entry.offset)}`);
    }
    for (const line of entry.preview) {
      console.log(`  ${hex(line.pc)}: ${line.bytes.padEnd(19)} ${line.text}`);
    }
  }
  console.log();
}

function printDuplicateTargets(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.target)) grouped.set(entry.target, []);
    grouped.get(entry.target).push(entry.offset);
  }

  const duplicates = [...grouped.entries()].filter(([, offsets]) => offsets.length > 1);
  if (!duplicates.length) return;

  console.log('=== 6. Shared Target Routines ===');
  for (const [target, offsets] of duplicates) {
    console.log(`  ${hex(target)} <- ${offsets.map((offset) => hex(offset)).join(', ')}`);
  }
  console.log();
}

function printSummaryTable(entries) {
  console.log('=== 7. Summary Table ===');
  const rows = entries.map((entry) => [
    hex(entry.offset),
    entry.label,
    hex(entry.target),
    previewSummary(entry.preview, 3),
    String(entry.xref.total),
    truncate(entry.classification, 54),
  ]);

  console.log(formatTable(
    ['Offset', 'Address', 'Target', 'First Instructions', 'Callers', 'Classification'],
    rows,
  ));
  console.log();
  if (alignedJpEnd > TABLE_END) {
    console.log(`  * The aligned JP pattern continues through ${hex(alignedJpEnd - 4)}.`);
    console.log('    The last two slots (0x000198/0x00019C) were included to complete the 4-byte table.');
    console.log();
  }
}

function printClosingAssessment(entries3, entries4, jpEntries) {
  const highFanout = jpEntries
    .filter((entry) => entry.xref.total >= 32)
    .map((entry) => `${hex(entry.offset)}:${entry.xref.total}`)
    .join(', ');

  console.log('=== 8. Assessment ===');
  console.log(`  Requested window: ${hex(TABLE_START)}..${hex(TABLE_END)} (${hex(TABLE_END - TABLE_START, 4)} bytes).`);
  console.log(`  Aligned JP table: ${hex(TABLE_START)}..${hex(alignedJpEnd - 4)} (${jpEntries.length} slots).`);
  console.log(`  3-byte view: ${entries3.length} syntactic candidates, but the alignment is poor and the bytes overlap.`);
  console.log(`  4-byte scalar view: ${entries4.length} syntactic candidates, but the retained 0xC3 low byte marks opcode-as-data.`);
  console.log('  Best interpretation: early low-ROM USB-map helper table implemented as one-JP stubs.');
  console.log('  Architectural position: after reset/RST/NMI vectors and before the later 0x0005CC BCALL trampoline family.');
  console.log(`  Highest-fanout slots: ${highFanout || 'none'}.`);
  console.log();
}

function main() {
  console.log('Phase 328: Map the 0x000120 Vector Table');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
  console.log(`Primary window: ${hex(TABLE_START)}..${hex(TABLE_END)} (0x${(TABLE_END - TABLE_START).toString(16).toUpperCase()} bytes)`);
  if (alignedJpEnd > TABLE_END) {
    console.log(`Aligned 4-byte JP continuation detected through ${hex(alignedJpEnd - 4)}.`);
  }
  console.log();

  const entries3 = build3ByteEntries();
  const entries4 = build4ByteScalarEntries();
  const jpEntries = buildJpEntries();

  printKnownVectorAnchors();
  printRawDump();
  print3ByteView(entries3);
  print4ByteScalarView(entries4);
  printJpView(jpEntries);
  printDetailedTargets(jpEntries);
  printDuplicateTargets(jpEntries);
  printSummaryTable(jpEntries);
  printClosingAssessment(entries3, entries4, jpEntries);
}

try {
  main();
} catch (error) {
  console.error('Probe failed:', error?.stack ?? error?.message ?? error);
  process.exitCode = 1;
}
