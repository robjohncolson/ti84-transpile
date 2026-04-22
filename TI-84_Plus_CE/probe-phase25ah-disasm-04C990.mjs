#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ADL_MODE = 'adl';
const START_ADDR = 0x04c950;
const END_ADDR = 0x04ca50;
const TARGET_ADDR = 0x04c990;

const CX_MAIN_ADDR = 0xd007ca;
const CX_CUR_APP_ADDR = 0xd007e0;

const KNOWN_TARGETS = new Map([
  [0x001881, 'RAM CLEAR'],
  [0x04c896, 'store-HL-with-sign helper'],
  [0x04c8b4, 'save-HL-load-sign helper'],
  [0x058241, 'home-screen handler'],
  [0x08238a, 'CreateReal'],
  [0x08c331, 'CoorMon'],
  [0x08c72f, 'CoorMon dispatch sub'],
  [0x08c79f, 'NewContext'],
  [0x08c7ad, 'NewContext0'],
  [0x099914, 'ParseInp'],
]);

const KNOWN_CX_CUR_APP_READ_SITES = [
  0x08c408,
  0x08c4c7,
  0x08c59c,
  0x08c5c8,
  0x08c5e7,
];

const XREF_SITE_NOTES = new Map([
  [0x021da8, 'jump alias into the negate-BC helper'],
  [0x02796f, 'generic arithmetic helper caller'],
  [0x082198, 'allocator path after newDataPtr save'],
  [0x08221e, 'InsertMem full path after LDDR'],
  [0x082237, 'InsertMem short Z path'],
  [0x08272c, 'InsertMem post-move pointer-adjust path'],
  [0x08322e, 'editor/data-shift helper'],
  [0x091d9a, 'block-move tail helper'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, pc, length) {
  return Array.from(
    buffer.slice(pc, pc + length),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-pair-indexed': text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'cpir': text = 'cpir'; break;
    case 'ccf': text = 'ccf'; break;
    case 'rla': text = 'rla'; break;
    default: {
      const details = [];
      for (const [key, value] of Object.entries(inst)) {
        if ([
          'pc',
          'length',
          'nextPc',
          'tag',
          'mode',
          'modePrefix',
          'fallthrough',
          'terminates',
        ].includes(key)) {
          continue;
        }
        details.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = details.length > 0 ? `${inst.tag} ${details.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function scanPattern(buffer, pattern) {
  const hits = [];

  outer: for (let i = 0; i <= buffer.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (buffer[i + j] !== pattern[j]) continue outer;
    }
    hits.push(i);
  }

  return hits;
}

function scanWindow(buffer, start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = decodeInstruction(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      throw new Error(`Decode failed at ${hex(pc)}`);
    }

    rows.push({
      pc: inst.pc,
      bytes: bytesFor(buffer, inst.pc, inst.length),
      text: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function annotationFor(row) {
  const notes = [];
  const inst = row.inst;

  if (inst.target !== undefined && KNOWN_TARGETS.has(inst.target)) {
    notes.push(KNOWN_TARGETS.get(inst.target));
  }

  if (inst.addr === CX_CUR_APP_ADDR) {
    if (inst.tag === 'ld-mem-reg' && inst.src === 'a') notes.push('WRITE cxCurApp');
    if (inst.tag === 'ld-reg-mem') notes.push('READ cxCurApp');
  }

  if (inst.addr === CX_MAIN_ADDR) {
    if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && inst.pair === 'hl') {
      notes.push('WRITE cxMain');
    }
    if (inst.tag === 'ld-pair-mem' && inst.direction === 'from-mem' && inst.pair === 'hl') {
      notes.push('READ cxMain');
    }
  }

  return notes.length > 0 ? ` ; ${notes.join('; ')}` : '';
}

function helperBoundaries(rows) {
  const boundaries = [];
  let start = rows[0]?.pc ?? START_ADDR;

  for (const row of rows) {
    if (row.inst.tag === 'ret') {
      boundaries.push({ start, end: row.pc });
      start = row.pc + row.inst.length;
    }
  }

  if (start < END_ADDR) {
    boundaries.push({ start, end: END_ADDR - 1 });
  }

  return boundaries;
}

function exactCxWrites(rows) {
  return rows.filter((row) => (
    (row.inst.tag === 'ld-mem-reg' && row.inst.addr === CX_CUR_APP_ADDR && row.inst.src === 'a') ||
    (
      row.inst.tag === 'ld-pair-mem' &&
      row.inst.addr === CX_MAIN_ADDR &&
      row.inst.direction === 'to-mem' &&
      row.inst.pair === 'hl'
    )
  ));
}

function exactCxReads(rows) {
  return rows.filter((row) => (
    (row.inst.tag === 'ld-reg-mem' && row.inst.addr === CX_CUR_APP_ADDR && row.inst.dest === 'a') ||
    (
      row.inst.tag === 'ld-pair-mem' &&
      row.inst.addr === CX_MAIN_ADDR &&
      row.inst.direction === 'from-mem' &&
      row.inst.pair === 'hl'
    )
  ));
}

function renderXrefList(addrs) {
  if (addrs.length === 0) return '(none)';
  return addrs.map((addr) => {
    const note = XREF_SITE_NOTES.get(addr);
    return note ? `${hex(addr)} (${note})` : hex(addr);
  }).join(', ');
}

const rom = readFileSync(ROM_PATH);
const rows = scanWindow(rom, START_ADDR, END_ADDR);
const writes = exactCxWrites(rows);
const reads = exactCxReads(rows);
const boundaries = helperBoundaries(rows);

const callXrefs = scanPattern(rom, [0xcd, 0x90, 0xc9, 0x04]);
const jpXrefs = scanPattern(rom, [0xc3, 0x90, 0xc9, 0x04]);

console.log('Phase 25AH - 0x04C990 disassembly');
console.log(`Window: ${hex(START_ADDR)}..${hex(END_ADDR - 1)}`);
console.log(`Target helper: ${hex(TARGET_ADDR)}`);
console.log('');
console.log('Direct cx writes inside this window:');
console.log(`- cxCurApp ${hex(CX_CUR_APP_ADDR)} via "ld (${hex(CX_CUR_APP_ADDR)}), a": ${writes.some((row) => row.inst.addr === CX_CUR_APP_ADDR) ? renderXrefList(writes.filter((row) => row.inst.addr === CX_CUR_APP_ADDR).map((row) => row.pc)) : '(none)'}`);
console.log(`- cxMain ${hex(CX_MAIN_ADDR)} via "ld (${hex(CX_MAIN_ADDR)}), hl": ${writes.some((row) => row.inst.addr === CX_MAIN_ADDR) ? renderXrefList(writes.filter((row) => row.inst.addr === CX_MAIN_ADDR).map((row) => row.pc)) : '(none)'}`);
console.log('Direct cx reads inside this window:');
console.log(`- cxCurApp ${hex(CX_CUR_APP_ADDR)} via "ld a, (${hex(CX_CUR_APP_ADDR)})": ${reads.some((row) => row.inst.addr === CX_CUR_APP_ADDR) ? renderXrefList(reads.filter((row) => row.inst.addr === CX_CUR_APP_ADDR).map((row) => row.pc)) : '(none)'}`);
console.log(`- cxMain ${hex(CX_MAIN_ADDR)} via "ld hl, (${hex(CX_MAIN_ADDR)})": ${reads.some((row) => row.inst.addr === CX_MAIN_ADDR) ? renderXrefList(reads.filter((row) => row.inst.addr === CX_MAIN_ADDR).map((row) => row.pc)) : '(none)'}`);
console.log('');
console.log('Whole-ROM direct xrefs to 0x04C990:');
console.log(`- call 0x04C990: ${renderXrefList(callXrefs)}`);
console.log(`- jp 0x04C990: ${renderXrefList(jpXrefs)}`);
console.log('');
console.log('Known CoorMon cxCurApp read sites:');
for (const site of KNOWN_CX_CUR_APP_READ_SITES) {
  const inst = decodeInstruction(rom, site, ADL_MODE);
  console.log(`- ${hex(site)}  ${bytesFor(rom, site, inst.length).padEnd(14)} ${formatInstruction(inst)}`);
}
console.log('');
console.log('RET-delimited helper boundaries in this window:');
for (const boundary of boundaries) {
  const marker = boundary.start <= TARGET_ADDR && TARGET_ADDR <= boundary.end ? ' <-- contains 0x04C990' : '';
  console.log(`- ${hex(boundary.start)}..${hex(boundary.end)}${marker}`);
}
console.log('');
console.log('Disassembly:');
for (const row of rows) {
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annotationFor(row)}`);
}
