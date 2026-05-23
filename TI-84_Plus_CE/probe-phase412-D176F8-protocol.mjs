#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0xD176F8;
const TARGET_WINDOW_START = 0xD176F0;
const TARGET_WINDOW_END = 0xD17700;

const PATTERNS = {
  writeA: [0x32, 0xF8, 0x76, 0xD1],
  writeHL: [0x22, 0xF8, 0x76, 0xD1],
  writeBC: [0xED, 0x43, 0xF8, 0x76, 0xD1],
  readA: [0x3A, 0xF8, 0x76, 0xD1],
  readHL: [0x2A, 0xF8, 0x76, 0xD1],
  readBC: [0xED, 0x4B, 0xF8, 0x76, 0xD1],
};

const KNOWN_VALUES = new Map([
  [0x0A, 'active transfer'],
  [0x0C, 'header'],
  [0x0D, 'complete'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0');
}

function read24(pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length)).map(hexByte).join(' ');
}

function findPattern(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc += 1) {
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[pc + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(pc);
  }
  return hits;
}

function tryDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.nextPc <= pc) return null;
    return inst;
  } catch {
    return null;
  }
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'nop':
      return `${prefix}nop`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.reg}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.reg}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-mem':
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `${prefix}ld (hl), 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-indexed':
      return `${prefix}ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `${prefix}ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${inst.pair}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-imm':
      return `${prefix}${inst.op} 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'lea':
      return `${prefix}lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'pea':
      return `${prefix}pea ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'ld-special':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-res':
      return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-set':
      return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'di':
      return `${prefix}di`;
    case 'ei':
      return `${prefix}ei`;
    case 'halt':
      return `${prefix}halt`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function findPredecessorSequence(hit, maxBack = 48) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);
  for (let start = searchStart; start <= hit; start += 1) {
    let pc = start;
    const rows = [];
    let valid = true;
    while (pc < hit) {
      const inst = tryDecode(pc);
      if (!inst || inst.nextPc > hit) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }
  return sequences;
}

function collectContextRows(hit, beforeBytes = 16, afterBytes = 16) {
  const wantedStart = Math.max(0, hit - beforeBytes);
  const sequences = findPredecessorSequence(hit, beforeBytes + 32);
  let prefixRows = [];

  const withEnoughLead = sequences
    .filter((rows) => rows.length > 0 && rows[0].pc <= wantedStart)
    .sort((a, b) => b[0].pc - a[0].pc);

  if (withEnoughLead.length > 0) {
    prefixRows = withEnoughLead[0];
  } else if (sequences.length > 0) {
    prefixRows = sequences.sort((a, b) => a.length - b.length)[0];
  }

  const rows = prefixRows.filter((row) => row.pc >= wantedStart);
  let pc = hit;
  const wantedEnd = Math.min(rom.length, hit + afterBytes);

  while (pc < wantedEnd) {
    const inst = tryDecode(pc);
    if (!inst) {
      rows.push({
        pc,
        inst: {
          length: 1,
          nextPc: pc + 1,
        },
        decodeError: true,
      });
      pc += 1;
      continue;
    }
    rows.push({ pc, inst });
    pc = inst.nextPc;
  }

  return rows;
}

function inferWrittenValue(hit) {
  // Try decoder-based inference first
  const sequences = findPredecessorSequence(hit, 24);
  if (sequences.length > 0) {
    const rows = sequences.sort((a, b) => a.length - b.length)[0].slice(-4);
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const inst = row.inst;
      if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
        return {
          value: inst.value,
          sourcePc: row.pc,
          sourceText: formatInstruction(inst),
        };
      }
      if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
        return {
          value: 0,
          sourcePc: row.pc,
          sourceText: 'xor a',
        };
      }
    }
  }

  // Fallback: raw byte scan backwards for 3E xx (LD A,imm) or AF (XOR A)
  for (let j = hit - 1; j >= Math.max(0, hit - 12); j--) {
    if (rom[j] === 0xaf) {
      return { value: 0, sourcePc: j, sourceText: 'xor a (raw)' };
    }
    if (rom[j] === 0x3e) {
      return { value: rom[j + 1], sourcePc: j, sourceText: `ld a, 0x${rom[j + 1].toString(16).padStart(2, '0')} (raw)` };
    }
    // Stop at control-flow boundaries
    if (rom[j] === 0xc9 || rom[j] === 0xc3 || rom[j] === 0xcd ||
        rom[j] === 0x18 || rom[j] === 0x20 || rom[j] === 0x28 ||
        rom[j] === 0x30 || rom[j] === 0x38) break;
  }

  return null;
}

function inferReaderUse(hit) {
  let pc = hit;
  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    const inst = tryDecode(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    pc = inst.nextPc;
  }

  const first = rows[1]?.inst;
  const second = rows[2]?.inst;
  const third = rows[3]?.inst;
  const fourth = rows[4]?.inst;
  const fifth = rows[5]?.inst;

  if (first?.tag === 'alu-imm' && first.op === 'cp') {
    return {
      kind: 'direct-cp',
      values: [first.value],
      summary: `cp 0x${first.value.toString(16).padStart(2, '0')}`,
    };
  }

  if (
    first?.tag === 'alu-reg' &&
    first.op === 'or' &&
    first.src === 'a' &&
    (second?.tag === 'jp-conditional' || second?.tag === 'jr-conditional')
  ) {
    return {
      kind: 'zero-check',
      values: [0],
      summary: `${formatInstruction(first)} then ${formatInstruction(second)}`,
    };
  }

  if (
    first?.tag === 'alu-reg' &&
    first.op === 'or' &&
    first.src === 'a' &&
    second?.tag === 'sbc-pair' &&
    third?.tag === 'ld-reg-reg' &&
    third.dest === 'l' &&
    third.src === 'a' &&
    fourth?.tag === 'call'
  ) {
    return {
      kind: 'table-index',
      values: [],
      summary: `state byte is turned into a small index and passed to ${formatInstruction(fourth)}`,
    };
  }

  if (
    first?.tag === 'alu-reg' &&
    first.op === 'or' &&
    first.src === 'a' &&
    second?.tag === 'sbc-pair' &&
    third?.tag === 'ld-reg-reg' &&
    third.dest === 'l' &&
    third.src === 'a' &&
    fourth?.tag === 'alu-reg' &&
    fourth.op === 'or' &&
    fourth.src === 'a' &&
    fifth?.tag === 'ld-pair-imm'
  ) {
    return {
      kind: 'subtractive-equality',
      values: [fifth.value & 0xFF],
      summary: `state byte is normalized into HL and compared against 0x${(fifth.value & 0xFF).toString(16).padStart(2, '0')}`,
    };
  }

  return {
    kind: 'other',
    values: [],
    summary: rows.slice(1, 4).map((row) => formatInstruction(row.inst)).join(' ; '),
  };
}

function groupWriterValues(writerDetails) {
  const groups = new Map();
  for (const detail of writerDetails) {
    const value = detail.value;
    const key = value === null ? 'unknown' : value;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(detail);
  }
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === 'unknown') return 1;
    if (b[0] === 'unknown') return -1;
    return a[0] - b[0];
  });
}

function scanIndexedAliases() {
  const hits = [];
  let pc = 0;
  while (pc < rom.length) {
    const inst = tryDecode(pc);
    if (!inst) {
      pc += 1;
      continue;
    }

    if (
      inst.tag === 'ld-pair-imm' &&
      (inst.pair === 'ix' || inst.pair === 'iy') &&
      inst.value >= (TARGET - 0x7F) &&
      inst.value <= (TARGET + 0x7F)
    ) {
      hits.push({
        pc,
        text: formatInstruction(inst),
      });
    }

    if (
      inst.tag === 'ld-pair-mem' &&
      (inst.pair === 'ix' || inst.pair === 'iy') &&
      inst.addr >= TARGET_WINDOW_START &&
      inst.addr <= TARGET_WINDOW_END
    ) {
      hits.push({
        pc,
        text: formatInstruction(inst),
      });
    }

    pc = inst.nextPc;
  }
  return hits;
}

function scanNearbyWindow() {
  const rows = new Map();

  function note(addr, kind, pc) {
    if (addr < TARGET_WINDOW_START || addr > TARGET_WINDOW_END) return;
    if (!rows.has(addr)) {
      rows.set(addr, { addr, reads: 0, writes: 0, samples: [] });
    }
    const row = rows.get(addr);
    row[kind] += 1;
    if (row.samples.length < 6) {
      row.samples.push(`${hex(pc)}:${kind}`);
    }
  }

  for (let pc = 0; pc < rom.length; pc += 1) {
    const op = rom[pc];
    if ((op === 0x3A || op === 0x32 || op === 0x2A || op === 0x22) && pc + 3 < rom.length) {
      const addr = read24(pc + 1);
      note(addr, (op === 0x3A || op === 0x2A) ? 'reads' : 'writes', pc);
    }
    if (op === 0xED && pc + 4 < rom.length) {
      const op2 = rom[pc + 1];
      if ([0x43, 0x4B, 0x53, 0x5B, 0x63, 0x6B, 0x73, 0x7B].includes(op2)) {
        const addr = read24(pc + 2);
        note(addr, [0x4B, 0x5B, 0x6B, 0x7B].includes(op2) ? 'reads' : 'writes', pc);
      }
    }
  }

  return [...rows.values()].sort((a, b) => a.addr - b.addr);
}

const writerHits = {
  a: findPattern(PATTERNS.writeA),
  hl: findPattern(PATTERNS.writeHL),
  bc: findPattern(PATTERNS.writeBC),
};

const readerHits = {
  a: findPattern(PATTERNS.readA),
  hl: findPattern(PATTERNS.readHL),
  bc: findPattern(PATTERNS.readBC),
};

const writerDetails = writerHits.a.map((pc) => {
  const inferred = inferWrittenValue(pc);
  return {
    pc,
    value: inferred?.value ?? null,
    sourcePc: inferred?.sourcePc ?? null,
    sourceText: inferred?.sourceText ?? 'not inferred',
    context: collectContextRows(pc),
  };
});

const readerDetails = readerHits.a.map((pc) => ({
  pc,
  usage: inferReaderUse(pc),
  context: collectContextRows(pc),
}));

const comparedValues = new Set();
for (const detail of readerDetails) {
  for (const value of detail.usage.values) {
    comparedValues.add(value & 0xFF);
  }
}

console.log('======================================================================');
console.log('Phase 412: D176F8 protocol byte scan');
console.log('======================================================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Target: ${hex(TARGET)} (bytes f8 76 d1)`);
console.log('');

console.log('Absolute direct hits');
console.log(`  LD (${hex(TARGET)}),A   : ${writerHits.a.length}`);
console.log(`  LD (${hex(TARGET)}),HL  : ${writerHits.hl.length}`);
console.log(`  LD (${hex(TARGET)}),BC  : ${writerHits.bc.length}`);
console.log(`  LD A,(${hex(TARGET)})   : ${readerHits.a.length}`);
console.log(`  LD HL,(${hex(TARGET)})  : ${readerHits.hl.length}`);
console.log(`  LD BC,(${hex(TARGET)})  : ${readerHits.bc.length}`);
console.log('');

console.log('Observed written values');
for (const [value, group] of groupWriterValues(writerDetails)) {
  if (value === 'unknown') {
    console.log(`  unknown : ${group.map((item) => hex(item.pc)).join(', ')}`);
    continue;
  }
  const label = KNOWN_VALUES.get(value) ? ` (${KNOWN_VALUES.get(value)})` : '';
  console.log(`  0x${value.toString(16).padStart(2, '0')}${label}: ${group.map((item) => hex(item.pc)).join(', ')}`);
}
console.log('');

console.log('Direct compare constants and arithmetic state tests seen on readers');
const comparedList = [...comparedValues].sort((a, b) => a - b).map((value) => `0x${value.toString(16).padStart(2, '0')}`);
console.log(`  direct CP values: ${comparedList.join(', ') || 'none'}`);
console.log('  arithmetic tests : 0x03 at 0x014A35, 0x07 at 0x0482E2, 0x09 at 0x0656A9');
console.log('  zero tests        : 0x00 via OR A at 0x00F2F4, 0x0480C9, 0x0637AB, and peers');
console.log('');

console.log('IX/IY-relative alias scan');
const indexedAliases = scanIndexedAliases();
if (indexedAliases.length === 0) {
  console.log('  No direct `ld ix/iy,<near D176F8>` or `ld ix/iy,(nearby RAM)` aliases were found.');
  console.log('  All concrete D176F8 hits are absolute byte reads/writes.');
} else {
  for (const hit of indexedAliases) {
    console.log(`  ${hex(hit.pc)} ${hit.text}`);
  }
}
console.log('');

console.log('Nearby RAM window (D176F0-D17700) absolute refs');
for (const row of scanNearbyWindow()) {
  console.log(`  ${hex(row.addr)} reads=${row.reads} writes=${row.writes} samples=${row.samples.join(', ')}`);
}
console.log('');

console.log('Writer details');
for (const detail of writerDetails) {
  const label = detail.value === null
    ? 'unknown'
    : `0x${detail.value.toString(16).padStart(2, '0')}${KNOWN_VALUES.get(detail.value) ? ` (${KNOWN_VALUES.get(detail.value)})` : ''}`;
  console.log('');
  console.log(`${hex(detail.pc)} -> ${label}`);
  if (detail.sourcePc !== null) {
    console.log(`  source: ${hex(detail.sourcePc)} ${detail.sourceText}`);
  } else {
    console.log('  source: not inferred from the preceding aligned instructions');
  }
  console.log(`  raw window: ${rawBytes(Math.max(0, detail.pc - 16), Math.min(rom.length, detail.pc + 20) - Math.max(0, detail.pc - 16))}`);
  for (const row of detail.context) {
    if (row.decodeError) {
      console.log(`    ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(15)} db 0x${hexByte(rom[row.pc])}`);
      continue;
    }
    console.log(`    ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(15)} ${formatInstruction(row.inst)}`);
  }
}
console.log('');

console.log('Reader details');
for (const detail of readerDetails) {
  console.log('');
  console.log(`${hex(detail.pc)} -> ${detail.usage.summary}`);
  console.log(`  raw window: ${rawBytes(Math.max(0, detail.pc - 16), Math.min(rom.length, detail.pc + 20) - Math.max(0, detail.pc - 16))}`);
  for (const row of detail.context) {
    if (row.decodeError) {
      console.log(`    ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(15)} db 0x${hexByte(rom[row.pc])}`);
      continue;
    }
    console.log(`    ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(15)} ${formatInstruction(row.inst)}`);
  }
}

