#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

const INIT_ROUTINE = 0x08C9AC;
const CONTEXT_TABLE_START = 0x08C958;
const CONTEXT_TABLE_END = 0x08C9AC;
const BLOCK_START = 0x08CA09;
const BLOCK_LENGTH = 0x28;
const BLOCK_END = BLOCK_START + BLOCK_LENGTH - 1;
const DEST_START = 0xD031CB;
const DEST_END = DEST_START + BLOCK_LENGTH - 1;
const POST_LDIR_BYTES = 0x28;
const RAM_MBASE = 0xD0;

const BRANCH_FORMS = new Map([
  [0xC3, 'jp'],
  [0xC2, 'jp nz'],
  [0xCA, 'jp z'],
  [0xD2, 'jp nc'],
  [0xDA, 'jp c'],
  [0xE2, 'jp po'],
  [0xEA, 'jp pe'],
  [0xF2, 'jp p'],
  [0xFA, 'jp m'],
  [0xCD, 'call'],
  [0xC4, 'call nz'],
  [0xCC, 'call z'],
  [0xD4, 'call nc'],
  [0xDC, 'call c'],
  [0xE4, 'call po'],
  [0xEC, 'call pe'],
  [0xF4, 'call p'],
  [0xFC, 'call m'],
]);

const REF_SCAN_START_BYTES = new Set([
  0x01,
  0x11,
  0x21,
  0x22,
  0x2A,
  0x31,
  0x32,
  0x3A,
  0x40,
  0x49,
  0x52,
  0x5B,
  0xDD,
  0xFD,
  0xED,
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0';
  }
  return value >= 0 ? `+0x${value.toString(16).toUpperCase()}` : `-0x${(-value).toString(16).toUpperCase()}`;
}

function read24LE(buffer, offset) {
  return (
    ((buffer[offset] ?? 0) & 0xFF) |
    (((buffer[offset + 1] ?? 0) & 0xFF) << 8) |
    (((buffer[offset + 2] ?? 0) & 0xFF) << 16)
  ) >>> 0;
}

function bytesAt(buffer, offset, length) {
  return Array.from(
    buffer.subarray(offset, Math.min(buffer.length, offset + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function printHexDump(buffer, baseOffset, length, bytesPerLine = 16) {
  for (let cursor = 0; cursor < length; cursor += bytesPerLine) {
    const lineLength = Math.min(bytesPerLine, length - cursor);
    console.log(`  ${hex(baseOffset + cursor)}: ${bytesAt(buffer, baseOffset + cursor, lineLength)}`);
  }
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

function effectiveImmediateValue(inst) {
  if (!Number.isInteger(inst?.value)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((RAM_MBASE << 16) | (inst.value & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.value >>> 0) & 0xFFFFFF;
}

function formatMemoryAddress(inst) {
  const effective = effectiveMemoryAddress(inst);
  return effective === null ? 'n/a' : hex(effective);
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'retn': return withPrefix(inst, 'retn');
    case 'reti': return withPrefix(inst, 'reti');
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
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
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(effectiveImmediateValue(inst) ?? inst.value)}`);
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
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd':
      return withPrefix(inst, `${inst.op} (${inst.indexRegister}${formatDisp(inst.displacement)})`);
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
    case 'lea':
      return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'halt':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'rrd':
    case 'rld':
    case 'daa':
    case 'cpl':
    case 'neg':
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
      return withPrefix(inst, inst.tag);
    default: {
      const extras = [];
      for (const [key, value] of Object.entries(inst)) {
        if (
          key === 'pc' ||
          key === 'length' ||
          key === 'nextPc' ||
          key === 'tag' ||
          key === 'mode' ||
          key === 'modePrefix' ||
          key === 'fallthrough' ||
          key === 'terminates' ||
          value === null ||
          value === undefined
        ) {
          continue;
        }
        if (typeof value === 'number') {
          if (key === 'addr') {
            extras.push(`${key}=${hex(effectiveMemoryAddress(inst) ?? value)}`);
          } else if (key === 'value') {
            extras.push(`${key}=${hex(effectiveImmediateValue(inst) ?? value)}`);
          } else if (key === 'target') {
            extras.push(`${key}=${hex(value)}`);
          } else {
            extras.push(`${key}=${value}`);
          }
        } else {
          extras.push(`${key}=${value}`);
        }
      }
      return withPrefix(inst, `${inst.tag}${extras.length ? ` ${extras.join(' ')}` : ''}`);
    }
  }
}

function decodeAt(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function disassembleFrom(start, maxBytes, maxInstructions = 24) {
  const rows = [];
  let pc = start;
  const end = Math.min(rom.length, start + maxBytes);

  while (pc < end && rows.length < maxInstructions) {
    const inst = decodeAt(pc);
    if (!inst) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesAt(rom, pc, 1),
        text: `db ${hexByte(rom[pc])}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length: inst.length,
      bytes: bytesAt(rom, pc, inst.length),
      inst,
      text: formatInstruction(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('');
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(17)} ${row.text}`);
  }
  console.log('');
}

function readContextTable() {
  const entries = [];
  const indexByValue = new Map();
  for (let addr = CONTEXT_TABLE_START; addr < CONTEXT_TABLE_END; addr += 3) {
    const value = read24LE(rom, addr);
    const index = entries.length;
    entries.push({ index, tableAddr: addr, value });
    if (!indexByValue.has(value)) {
      indexByValue.set(value, []);
    }
    indexByValue.get(value).push(index);
  }
  return { entries, indexByValue };
}

const contextTable = readContextTable();
const block = rom.subarray(BLOCK_START, BLOCK_START + BLOCK_LENGTH);

function classifyPointer(value) {
  const inRom = value >= 0 && value < rom.length;
  const previewInst = inRom ? decodeAt(value) : null;
  const tableMatches = contextTable.indexByValue.get(value) ?? [];
  return {
    value,
    inRom,
    tableMatches,
    codeLike: Boolean(previewInst),
    preview: previewInst ? formatInstruction(previewInst) : null,
  };
}

function analyzeAligned24Windows() {
  const rows = [];
  for (let offset = 0; offset + 2 < block.length; offset += 3) {
    const value = read24LE(block, offset);
    rows.push({
      blockOffset: offset,
      bytes: bytesAt(block, offset, 3),
      info: classifyPointer(value),
    });
  }
  return rows;
}

function analyzeSlidingHandlerMatches() {
  const rows = [];
  for (let offset = 0; offset + 2 < block.length; offset += 1) {
    const value = read24LE(block, offset);
    const info = classifyPointer(value);
    if (!info.tableMatches.length) {
      continue;
    }
    rows.push({
      blockOffset: offset,
      bytes: bytesAt(block, offset, 3),
      info,
    });
  }
  return rows;
}

function analyzeSmallBytes() {
  const rows = [];
  const histogram = new Map();
  for (let offset = 0; offset < block.length; offset += 1) {
    const value = block[offset];
    histogram.set(value, (histogram.get(value) ?? 0) + 1);
    if (value <= 0x1F) {
      rows.push({ blockOffset: offset, value });
    }
  }
  const frequent = Array.from(histogram.entries())
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
    .slice(0, 8);
  return { rows, frequent };
}

function analyzeStride(stride) {
  const recordCount = Math.floor(block.length / stride);
  const remainder = block.length % stride;
  const records = [];

  for (let index = 0; index < recordCount; index += 1) {
    const blockOffset = index * stride;
    const pointerValue = stride >= 3 ? read24LE(block, blockOffset) : null;
    const pointerInfo = pointerValue === null ? null : classifyPointer(pointerValue);
    const tail = Array.from(block.subarray(blockOffset + 3, blockOffset + stride));
    records.push({ index, blockOffset, pointerValue, pointerInfo, tail });
  }

  const pointerLikeCount = records.filter((record) => record.pointerInfo?.codeLike).length;
  const tableMatchCount = records.filter((record) => (record.pointerInfo?.tableMatches.length ?? 0) > 0).length;
  const tailBytes = records.flatMap((record) => record.tail);
  const smallTailCount = tailBytes.filter((value) => value <= 0x1F).length;

  return {
    stride,
    recordCount,
    remainder,
    records,
    pointerLikeCount,
    tableMatchCount,
    tailBytes: tailBytes.length,
    smallTailCount,
  };
}

function printPointerAnalysis() {
  console.log('=== Context Handler Reference Set ===');
  console.log('');
  console.log(
    `  Table range ${hex(CONTEXT_TABLE_START)}..${hex(CONTEXT_TABLE_END - 1)} ` +
    `contains ${contextTable.entries.length} 24-bit entries.`,
  );
  for (const entry of contextTable.entries) {
    console.log(`  [${String(entry.index).padStart(2, '0')}] ${hex(entry.tableAddr)} -> ${hex(entry.value)}`);
  }
  console.log('');

  console.log('=== Raw Initialization Block ===');
  console.log('');
  console.log(`  Source range: ${hex(BLOCK_START)}..${hex(BLOCK_END)} (${BLOCK_LENGTH} bytes)`);
  printHexDump(rom, BLOCK_START, BLOCK_LENGTH);
  console.log('');

  const aligned = analyzeAligned24Windows();
  console.log('=== 24-bit LE Windows Aligned From Block Start ===');
  console.log('');
  for (const row of aligned) {
    const notes = [];
    notes.push(row.info.inRom ? 'in-ROM' : 'out-of-ROM');
    notes.push(row.info.codeLike ? `code-like (${row.info.preview})` : 'not-code-like');
    if (row.info.tableMatches.length) {
      notes.push(`context-table match [${row.info.tableMatches.join(', ')}]`);
    }
    console.log(
      `  +${row.blockOffset.toString(16).toUpperCase().padStart(2, '0')} ` +
      `${row.bytes} -> ${hex(row.info.value)} ; ${notes.join(' ; ')}`,
    );
  }
  console.log('');

  const slidingMatches = analyzeSlidingHandlerMatches();
  console.log('=== Sliding 3-byte Windows That Match Context Handlers ===');
  console.log('');
  if (!slidingMatches.length) {
    console.log('  none');
  } else {
    for (const row of slidingMatches) {
      console.log(
        `  +${row.blockOffset.toString(16).toUpperCase().padStart(2, '0')} ` +
        `${row.bytes} -> ${hex(row.info.value)} ; handler index [${row.info.tableMatches.join(', ')}]`,
      );
    }
  }
  console.log('');

  const small = analyzeSmallBytes();
  console.log('=== Flag / Small-Integer Byte Check ===');
  console.log('');
  console.log(
    `  Bytes <= 0x1F: ${small.rows.length}/${block.length}` +
    (small.rows.length ? ` at offsets ${small.rows.map((row) => `+${row.blockOffset.toString(16).toUpperCase().padStart(2, '0')}=${hexByte(row.value)}`).join(', ')}` : ''),
  );
  console.log(
    `  Most common byte values: ${small.frequent.map(([value, count]) => `${hexByte(value)}x${count}`).join(', ')}`,
  );
  console.log('');

  console.log('=== Record-Stride Heuristics ===');
  console.log('');
  for (const stride of [3, 4, 5, 8, 10]) {
    const result = analyzeStride(stride);
    console.log(
      `  stride ${stride}: ${result.recordCount} full record(s), remainder ${result.remainder}, ` +
      `pointer-like ${result.pointerLikeCount}/${result.recordCount}, ` +
      `context-table matches ${result.tableMatchCount}/${result.recordCount}, ` +
      `small tail bytes ${result.smallTailCount}/${result.tailBytes || 0}`,
    );
    for (const record of result.records) {
      const tailText = record.tail.length ? ` tail=[${record.tail.map((value) => hexByte(value)).join(' ')}]` : '';
      const pointerText = record.pointerValue === null ? 'n/a' : hex(record.pointerValue);
      const previewText = record.pointerInfo?.preview ? ` ; ${record.pointerInfo.preview}` : '';
      const tableText = record.pointerInfo?.tableMatches.length
        ? ` ; table=[${record.pointerInfo.tableMatches.join(', ')}]`
        : '';
      console.log(
        `    [${record.index}] +${record.blockOffset.toString(16).toUpperCase().padStart(2, '0')} ` +
        `ptr=${pointerText}${tailText}${tableText}${previewText}`,
      );
    }
  }
  console.log('');
}

function printPostLdirFlow() {
  const prologueRows = disassembleFrom(INIT_ROUTINE, 0x20, 8);
  printDisassembly('=== Copy Prologue @ 0x08C9AC ===', prologueRows);

  const ldirRow = prologueRows.find((row) => row.inst?.tag === 'ldir');
  if (!ldirRow) {
    console.log('Could not locate the terminating LDIR in the initialization prologue.');
    console.log('');
    return;
  }

  const afterLdir = ldirRow.pc + ldirRow.length;
  const postRows = disassembleFrom(afterLdir, POST_LDIR_BYTES, 24);
  printDisassembly(
    `=== Code After LDIR (starting ${hex(afterLdir)}, next ${POST_LDIR_BYTES} bytes) ===`,
    postRows,
  );
}

function scanBranchesToTarget(target) {
  const hits = [];
  for (let pc = 0; pc + 3 < rom.length; pc += 1) {
    const mnemonic = BRANCH_FORMS.get(rom[pc]);
    if (!mnemonic) {
      continue;
    }
    if (read24LE(rom, pc + 1) !== target) {
      continue;
    }
    hits.push({
      pc,
      mnemonic,
      bytes: bytesAt(rom, pc, 4),
      decoded: formatInstruction(decodeAt(pc)),
    });
  }
  return hits;
}

function printCallerScan() {
  const hits = scanBranchesToTarget(INIT_ROUTINE);
  console.log('=== CALL / JP References To 0x08C9AC ===');
  console.log('');
  if (!hits.length) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const hit of hits) {
    console.log(`  ${hex(hit.pc)}: ${hit.bytes}  ${hit.decoded ?? hit.mnemonic}`);
  }
  console.log('');
}

function extractRefs(inst) {
  const refs = [];

  if (!inst) {
    return refs;
  }

  if (inst.tag === 'ld-reg-mem' || (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem')) {
    const value = effectiveMemoryAddress(inst);
    if (value !== null) {
      refs.push({ role: 'read', value });
    }
  }

  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')) {
    const value = effectiveMemoryAddress(inst);
    if (value !== null) {
      refs.push({ role: 'write', value });
    }
  }

  if (inst.tag === 'ld-pair-imm') {
    const value = effectiveImmediateValue(inst);
    if (value !== null) {
      refs.push({ role: 'address-load', value });
    }
  }

  return refs;
}

function scanRamRangeRefs() {
  const hits = [];
  const seen = new Set();

  for (let pc = 0; pc < rom.length; pc += 1) {
    if (!REF_SCAN_START_BYTES.has(rom[pc])) {
      continue;
    }

    const inst = decodeAt(pc);
    if (!inst) {
      continue;
    }

    for (const ref of extractRefs(inst)) {
      if (ref.value < DEST_START || ref.value > DEST_END) {
        continue;
      }

      const key = `${pc}:${ref.role}:${ref.value}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      hits.push({
        pc,
        ref,
        inst,
        bytes: bytesAt(rom, pc, inst.length),
        text: formatInstruction(inst),
      });
    }
  }

  hits.sort((a, b) => a.pc - b.pc || a.ref.value - b.ref.value);
  return hits;
}

function printRamRangeScan() {
  const hits = scanRamRangeRefs();
  const direct = hits.filter((hit) => hit.ref.role === 'read' || hit.ref.role === 'write');
  const materialized = hits.filter((hit) => hit.ref.role === 'address-load');

  console.log(`=== Cross-References To RAM ${hex(DEST_START)}..${hex(DEST_END)} ===`);
  console.log('');

  console.log('  Direct reads/writes:');
  if (!direct.length) {
    console.log('    none');
  } else {
    for (const hit of direct) {
      console.log(
        `    ${hex(hit.pc)}: ${hit.bytes.padEnd(17)} ${hit.text} ` +
        `; ${hit.ref.role} ${hex(hit.ref.value)} (+${(hit.ref.value - DEST_START).toString(16).toUpperCase()})`,
      );
    }
  }
  console.log('');

  console.log('  Address materializations / pointer loads:');
  if (!materialized.length) {
    console.log('    none');
  } else {
    for (const hit of materialized) {
      console.log(
        `    ${hex(hit.pc)}: ${hit.bytes.padEnd(17)} ${hit.text} ` +
        `; loads ${hex(hit.ref.value)} (+${(hit.ref.value - DEST_START).toString(16).toUpperCase()})`,
      );
    }
  }
  console.log('');
}

function main() {
  console.log('=== Phase 343 Init-Block Decode Probe ===');
  console.log('');
  console.log(`  ROM: ${ROM_PATH}`);
  console.log(`  Init routine: ${hex(INIT_ROUTINE)}`);
  console.log(`  Copy source: ${hex(BLOCK_START)}..${hex(BLOCK_END)}`);
  console.log(`  Copy destination: ${hex(DEST_START)}..${hex(DEST_END)}`);
  console.log('');

  printPointerAnalysis();
  printPostLdirFlow();
  printCallerScan();
  printRamRangeScan();
}

main();
