#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TARGET24 = 0x0159C0;
const TARGET16 = TARGET24 & 0xFFFF;
const PATTERN24 = [0xC0, 0x59, 0x01];
const PATTERN16 = [0xC0, 0x59];

const CONTEXT_RADIUS = 16;
const CODE_REGION_END = 0x0C0000;
const DATA_PREFERRED_START = 0x080000;
const TABLE_ENTRY_SIZE = 3;
const TABLE_MIN_ENTRIES = 3;
const TABLE_SCAN_RADIUS = 32;
const MAX_INSTRUCTION_LOOKBACK = 6;

const MODE_PREFIXES = new Set([0x40, 0x49, 0x52, 0x5B]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function formatBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return '(none)';
  }
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatContext(buffer, offset, length) {
  const start = Math.max(0, offset - CONTEXT_RADIUS);
  const end = Math.min(buffer.length, offset + length + CONTEXT_RADIUS);
  const before = formatBytes(buffer.subarray(start, offset));
  const middle = formatBytes(buffer.subarray(offset, offset + length));
  const after = formatBytes(buffer.subarray(offset + length, end));
  return `${before} [${middle}] ${after}`;
}

function read24(buffer, offset) {
  return (
    ((buffer[offset] ?? 0) & 0xFF) |
    (((buffer[offset + 1] ?? 0) & 0xFF) << 8) |
    (((buffer[offset + 2] ?? 0) & 0xFF) << 16)
  ) >>> 0;
}

function findAll(buffer, pattern) {
  const hits = [];

  for (let offset = 0; offset <= buffer.length - pattern.length; offset += 1) {
    let match = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (buffer[offset + index] !== pattern[index]) {
        match = false;
        break;
      }
    }

    if (match) {
      hits.push(offset);
    }
  }

  return hits;
}

function instructionReferencesValue(inst, targetValue) {
  if (!inst) {
    return false;
  }

  const candidates = [];
  if (typeof inst.target === 'number') candidates.push(inst.target >>> 0);
  if (typeof inst.addr === 'number') candidates.push(inst.addr >>> 0);
  if (typeof inst.value === 'number' && inst.value > 0xFF) candidates.push(inst.value >>> 0);

  return candidates.some((candidate) => candidate === (targetValue >>> 0));
}

function isDirectBranchTag(tag) {
  return tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional';
}

function describeInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    default:
      if (inst.dasm) return inst.dasm;
      if (typeof inst.target === 'number') return `${inst.tag} ${hex(inst.target)}`;
      if (typeof inst.addr === 'number') return `${inst.tag} ${hex(inst.addr)}`;
      if (typeof inst.value === 'number' && inst.value > 0xFF) return `${inst.tag} ${hex(inst.value)}`;
      return inst.tag;
  }
}

function findRst28InlineReference(buffer, hit, patternLength) {
  if (hit >= 1 && buffer[hit - 1] === 0xEF) {
    return {
      start: hit - 1,
      length: patternLength + 1,
      mode: 'inline',
      text: 'RST 0x28 + inline target',
    };
  }

  if (hit >= 2 && MODE_PREFIXES.has(buffer[hit - 2]) && buffer[hit - 1] === 0xEF) {
    return {
      start: hit - 2,
      length: patternLength + 2,
      mode: 'inline',
      text: 'prefixed RST 0x28 + inline target',
    };
  }

  return null;
}

function findInstructionReference(buffer, hit, patternLength, targetValue) {
  if (hit >= CODE_REGION_END) {
    return null;
  }

  const matches = [];
  const startFloor = Math.max(0, hit - MAX_INSTRUCTION_LOOKBACK);

  for (let start = hit; start >= startFloor; start -= 1) {
    for (const mode of ['adl', 'z80']) {
      let inst;

      try {
        inst = decodeInstruction(buffer, start, mode);
      } catch {
        continue;
      }

      const length = Math.max(1, inst?.length ?? 1);
      const relative = hit - start;

      if (relative < 0 || relative + patternLength > length) {
        continue;
      }

      if (!instructionReferencesValue(inst, targetValue)) {
        continue;
      }

      matches.push({
        start,
        mode,
        inst,
        length,
        text: describeInstruction(inst),
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => {
    const leftRank = isDirectBranchTag(left.inst.tag) ? 0 : 1;
    const rightRank = isDirectBranchTag(right.inst.tag) ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (left.start !== right.start) {
      return right.start - left.start;
    }
    return left.length - right.length;
  });

  return matches[0];
}

function isLikelyCodePointer(value) {
  return value > 0 && value < CODE_REGION_END;
}

function detectPointerTable24(buffer, hit) {
  const windowStart = Math.max(0, hit - TABLE_SCAN_RADIUS);
  const windowEnd = Math.min(buffer.length, hit + TABLE_ENTRY_SIZE + TABLE_SCAN_RADIUS);

  let tableStart = hit;
  while (tableStart - TABLE_ENTRY_SIZE >= windowStart) {
    const prev = read24(buffer, tableStart - TABLE_ENTRY_SIZE);
    if (!isLikelyCodePointer(prev)) {
      break;
    }
    tableStart -= TABLE_ENTRY_SIZE;
  }

  let tableEnd = hit + TABLE_ENTRY_SIZE;
  while (tableEnd + 2 < windowEnd) {
    const next = read24(buffer, tableEnd);
    if (!isLikelyCodePointer(next)) {
      break;
    }
    tableEnd += TABLE_ENTRY_SIZE;
  }

  const entries = [];
  for (let offset = tableStart; offset < tableEnd; offset += TABLE_ENTRY_SIZE) {
    const value = read24(buffer, offset);
    if (!isLikelyCodePointer(value)) {
      return null;
    }
    entries.push({ offset, value });
  }

  if (entries.length < TABLE_MIN_ENTRIES) {
    return null;
  }

  return {
    start: tableStart,
    endExclusive: tableEnd,
    hitIndex: Math.floor((hit - tableStart) / TABLE_ENTRY_SIZE),
    entries,
  };
}

function classify24BitHit(buffer, hit) {
  const inlineRef = findRst28InlineReference(buffer, hit, PATTERN24.length);
  if (inlineRef) {
    return {
      classification: 'skip/direct-rst28-inline',
      reference: inlineRef,
    };
  }

  const instruction = findInstructionReference(buffer, hit, PATTERN24.length, TARGET24);
  if (instruction && isDirectBranchTag(instruction.inst.tag)) {
    return {
      classification: 'skip/direct-call-or-jp',
      reference: instruction,
    };
  }

  const table = detectPointerTable24(buffer, hit);
  if (table) {
    return {
      classification: 'data/table-candidate',
      table,
    };
  }

  if (instruction) {
    return {
      classification: 'code/instruction-reference',
      reference: instruction,
    };
  }

  if (hit >= DATA_PREFERRED_START) {
    return {
      classification: 'data/high-rom',
    };
  }

  return {
    classification: 'code/raw-bytes',
  };
}

function classify16BitHit(buffer, hit, hit24Set) {
  if (hit24Set.has(hit)) {
    return {
      classification: 'skip/covered-by-24-bit-hit',
    };
  }

  const inlineRef = findRst28InlineReference(buffer, hit, PATTERN16.length);
  if (inlineRef) {
    return {
      classification: 'skip/direct-rst28-inline',
      reference: inlineRef,
    };
  }

  const instruction = findInstructionReference(buffer, hit, PATTERN16.length, TARGET16);
  if (instruction && isDirectBranchTag(instruction.inst.tag)) {
    return {
      classification: 'skip/direct-call-or-jp',
      reference: instruction,
    };
  }

  if (instruction) {
    return {
      classification: 'code/instruction-reference',
      reference: instruction,
    };
  }

  if (hit >= DATA_PREFERRED_START) {
    return {
      classification: 'data/high-rom',
    };
  }

  return {
    classification: 'code/raw-bytes',
  };
}

function collectUniqueTables(results) {
  const tables = new Map();

  for (const result of results) {
    if (!result.table) {
      continue;
    }

    const key = `${result.table.start}:${result.table.endExclusive}`;
    if (!tables.has(key)) {
      tables.set(key, result.table);
    }
  }

  return Array.from(tables.values()).sort((left, right) => left.start - right.start);
}

function countByPrefix(results, prefix) {
  return results.filter((result) => result.classification.startsWith(prefix)).length;
}

function printReference(result) {
  if (!result.reference) {
    return;
  }

  const start = hex(result.reference.start);
  const mode = result.reference.mode ? ` mode=${result.reference.mode}` : '';
  const text = result.reference.text ?? '(unknown reference)';
  console.log(`  reference      : ${start}${mode}  ${text}`);
}

function printResults(title, patternLabel, patternLength, results) {
  const reportable = results.filter((result) => !result.classification.startsWith('skip/'));
  const skipped = results.filter((result) => result.classification.startsWith('skip/'));

  console.log(`--- ${title} ---`);
  console.log(`pattern         : ${patternLabel}`);
  console.log(`total matches   : ${results.length}`);
  console.log(`skipped direct  : ${skipped.length}`);
  console.log(`reportable      : ${reportable.length}`);
  console.log('');

  if (reportable.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const result of reportable) {
    console.log(`${hex(result.hit)}  ${result.classification}`);
    console.log(`  context        : ${formatContext(rom, result.hit, patternLength)}`);
    printReference(result);
    if (result.table) {
      console.log(
        `  table candidate: ${hex(result.table.start)}..${hex(result.table.endExclusive - 1)} ` +
        `entries=${result.table.entries.length} hitIndex=${result.table.hitIndex}`
      );
    }
    console.log('');
  }
}

function printTableDumps(tables) {
  console.log('--- 24-bit Table Candidates ---');

  if (tables.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const table of tables) {
    console.log(
      `${hex(table.start)}..${hex(table.endExclusive - 1)}  ` +
      `entries=${table.entries.length} stride=${TABLE_ENTRY_SIZE}`
    );

    for (const [index, entry] of table.entries.entries()) {
      const mark = entry.value === TARGET24 ? '  TARGET' : '';
      console.log(
        `  [${String(index).padStart(2, '0')}] rom=${hex(entry.offset)} -> ${hex(entry.value)}${mark}`
      );
    }

    console.log('');
  }
}

function printSummary(results24, results16, tables) {
  console.log('--- Summary ---');
  console.log(`24-bit total matches            : ${results24.length}`);
  console.log(`24-bit skipped direct hits      : ${countByPrefix(results24, 'skip/')}`);
  console.log(`24-bit data matches             : ${countByPrefix(results24, 'data/')}`);
  console.log(`24-bit code matches             : ${countByPrefix(results24, 'code/')}`);
  console.log(`24-bit table candidates         : ${tables.length}`);
  console.log(`16-bit total matches            : ${results16.length}`);
  console.log(`16-bit skipped direct/overlap   : ${countByPrefix(results16, 'skip/')}`);
  console.log(`16-bit data matches             : ${countByPrefix(results16, 'data/')}`);
  console.log(`16-bit code matches             : ${countByPrefix(results16, 'code/')}`);
}

const rom = fs.readFileSync(ROM_PATH);
const hits24 = findAll(rom, PATTERN24);
const hit24Set = new Set(hits24);
const results24 = hits24.map((hit) => ({
  hit,
  ...classify24BitHit(rom, hit),
}));
const results16 = findAll(rom, PATTERN16).map((hit) => ({
  hit,
  ...classify16BitHit(rom, hit, hit24Set),
}));
const tables = collectUniqueTables(results24);

console.log('=== Phase 287: 0x0159C0 Indirect-Caller Literal Scan ===');
console.log(`ROM path        : ${ROM_PATH}`);
console.log(`ROM bytes       : ${rom.length}`);
console.log(`target 24-bit   : ${hex(TARGET24)}  bytes=${PATTERN24.map((value) => hexByte(value)).join(' ')}`);
console.log(`target 16-bit   : ${hex(TARGET16, 4)}  bytes=${PATTERN16.map((value) => hexByte(value)).join(' ')}`);
console.log(`code region hint: ${hex(0)}..${hex(CODE_REGION_END - 1)}`);
console.log(`data hint start : ${hex(DATA_PREFERRED_START)}`);
console.log('');

printResults('24-bit Pattern Hits', 'C0 59 01', PATTERN24.length, results24);
printTableDumps(tables);
printResults('16-bit Pattern Hits', 'C0 59', PATTERN16.length, results16);
printSummary(results24, results16, tables);
