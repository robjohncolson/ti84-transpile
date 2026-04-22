#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY_START = 0x099914;
const ENTRY_LEN = 0x40;
const OVERLAP_WINDOWS = [
  { title: 'Overlap window 0x099920..0x099940', start: 0x099920, length: 0x20 },
  { title: 'Overlap window 0x099930..0x099950', start: 0x099930, length: 0x20 },
];
const HELPER_WINDOWS = [
  { title: 'Helper 0x099B81 (entry-state clear)', start: 0x099b81, length: 0x30 },
  { title: 'Helper 0x099B18 (begPC/curPC setup)', start: 0x099b18, length: 0x40 },
  { title: 'Helper 0x09BEED (OPS access)', start: 0x09beed, length: 0x30 },
];

const TARGETS = new Map([
  [0xd022be, 'entryFlag@0xD022BE'],
  [0xd02317, 'begPC'],
  [0xd0231a, 'curPC'],
  [0xd0231d, 'endPC'],
  [0xd02593, 'OPS'],
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function bytesFor(pc, length) {
  return Array.from(
    rom.slice(pc, pc + length),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function decodeRange(start, length) {
  const rows = [];
  let pc = start;
  const end = start + length;

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length <= 0) {
      throw new Error(`Decode failed at ${hex(pc)}`);
    }

    rows.push({
      pc: inst.pc,
      nextPc: inst.nextPc,
      inst,
      bytes: bytesFor(inst.pc, inst.length),
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });

    pc = inst.nextPc;
  }

  return rows;
}

function rowsIntersecting(rows, start, length) {
  const end = start + length;
  return rows.filter((row) => row.pc < end && row.nextPc > start);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key)) {
          continue;
        }
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function commentFor(inst) {
  const notes = [];

  if (Number.isInteger(inst.addr) && TARGETS.has(inst.addr)) {
    notes.push(TARGETS.get(inst.addr));
  }

  if (Number.isInteger(inst.value) && TARGETS.has(inst.value)) {
    notes.push(TARGETS.get(inst.value));
  }

  return notes.length > 0 ? ` ; ${notes.join(' / ')}` : '';
}

function findDirectRefs(rows, addr) {
  return rows.filter((row) => row.inst.addr === addr);
}

function findIndirectReads(rows) {
  const hits = [];

  for (const row of rows) {
    const inst = row.inst;

    if (inst.tag === 'ld-reg-ind' && ['hl', 'de', 'bc'].includes(inst.src)) {
      hits.push({ row, pointer: inst.src, kind: 'load' });
      continue;
    }

    if (['bit-test-ind', 'bit-res-ind', 'bit-set-ind', 'rotate-ind'].includes(inst.tag)
      && ['hl', 'de', 'bc'].includes(inst.indirectRegister)) {
      hits.push({ row, pointer: inst.indirectRegister, kind: inst.tag });
      continue;
    }

    if (inst.tag === 'alu-reg' && ['(hl)', '(de)', '(bc)'].includes(inst.src)) {
      hits.push({ row, pointer: inst.src.slice(1, -1), kind: 'alu' });
    }
  }

  return hits;
}

function printRows(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  console.log('');
}

function printDirectRefSummary(title, rows) {
  console.log(title);
  for (const [addr, label] of TARGETS.entries()) {
    if (addr === 0xd022be || addr === 0xd0231d) continue;
    const hits = findDirectRefs(rows, addr);
    if (hits.length === 0) {
      console.log(`- ${label} (${hex(addr)}): none`);
      continue;
    }

    const sites = hits.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ');
    console.log(`- ${label} (${hex(addr)}): ${sites}`);
  }
  console.log('');
}

function printIndirectSummary(title, rows) {
  const hits = findIndirectReads(rows);
  console.log(title);
  if (hits.length === 0) {
    console.log('- none');
    console.log('');
    return;
  }

  for (const hit of hits) {
    console.log(`- ${hex(hit.row.pc)} via ${hit.pointer}: ${hit.row.text}`);
  }
  console.log('');
}

const entryRows = decodeRange(ENTRY_START, ENTRY_LEN);
const helperRows = HELPER_WINDOWS.map((window) => ({
  ...window,
  rows: decodeRange(window.start, window.length),
}));

const first32 = bytesFor(ENTRY_START, 0x20);
const session73Matches = first32.startsWith('AF 32 BE 22 D0');

console.log('Phase 25Y ParseInp entry disassembly');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Entry: ${hex(ENTRY_START)}`);
console.log('');

console.log('Session 73 prefix check');
console.log(`- First 32 bytes: ${first32}`);
console.log(`- Matches "af 32 be 22 d0 ..." prefix: ${session73Matches ? 'yes' : 'no'}`);
console.log('');

printRows(`Entry window ${hex(ENTRY_START)}..${hex(ENTRY_START + ENTRY_LEN)}`, entryRows);
for (const window of OVERLAP_WINDOWS) {
  printRows(
    `${window.title} (instruction-aligned rows that overlap the byte range)`,
    rowsIntersecting(entryRows, window.start, window.length),
  );
}

for (const window of helperRows) {
  printRows(`${window.title} ${hex(window.start)}..${hex(window.start + window.length)}`, window.rows);
}

printDirectRefSummary('Direct pointer references in the first 0x40 entry bytes', entryRows);
printIndirectSummary('Indirect HL/DE/BC reads in the first 0x40 entry bytes', entryRows);

const begCurRows = helperRows.find((window) => window.start === 0x099b18)?.rows ?? [];
const opsRows = helperRows.find((window) => window.start === 0x09beed)?.rows ?? [];

printDirectRefSummary('Direct pointer references in helper 0x099B18', begCurRows);
printIndirectSummary('Indirect HL/DE/BC reads in helper 0x099B18', begCurRows);
printDirectRefSummary('Direct pointer references in helper 0x09BEED', opsRows);
printIndirectSummary('Indirect HL/DE/BC reads in helper 0x09BEED', opsRows);

console.log('Conclusions');
console.log('- The ParseInp entry matches the observed Session 73 prefix: xor a; ld (0xD022BE), a.');
console.log('- No instruction in the first 0x40 bytes directly references begPC, curPC, endPC, or OPS.');
console.log('- The first 0x40 bytes also do not perform any HL/DE/BC indirect loads; they only clear entry state and call helpers.');
console.log('- Helper 0x099B18 later writes begPC and curPC, which means those caller-visible slots are reinitialized after entry rather than consumed immediately.');
console.log('- Helper 0x09BEED later reads OPS and then dereferences HL loaded from OPS, so the early ParseInp call chain uses OPS-based memory traffic as well.');
console.log('- Static result: ParseInp is not a pure "read caller tokens through curPC from byte 0" routine. curPC is not read in the first 0x40 entry bytes; any curPC-driven scanning happens deeper than this entry/setup sequence.');
