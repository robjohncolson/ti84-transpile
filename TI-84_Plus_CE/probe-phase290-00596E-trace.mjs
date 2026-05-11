#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const ROM_TABLE_MIN = 0x050000;
const ROM_TABLE_MAX = 0x0AFFFF;
const CALLER_TARGET = 0x00596E;

const FUNCTION_SPECS = [
  { label: '0x00596E table-base resolver', start: 0x00596E, byteCount: 0x65 },
  { label: '0x005A48 helper', start: 0x005A48, byteCount: 0x1E },
  { label: '0x005A53 helper', start: 0x005A53, byteCount: 0x1E },
];

const REG_ORDER = [
  'a', 'b', 'c', 'd', 'e', 'h', 'l',
  'bc', 'de', 'hl', 'ix', 'iy', 'sp',
  'i', 'r', 'mb',
];

const RETURN_FAMILIES = ['a', 'hl', 'de', 'bc'];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr || !instr.length || instr.length <= 0) return null;
    return instr;
  } catch {
    return null;
  }
}

function formatInstruction(instr) {
  if (!instr) return '(decode failed)';

  const prefix = instr.modePrefix ? `${String(instr.modePrefix).toUpperCase()} ` : '';

  switch (instr.tag) {
    case 'call':
      return `${prefix}CALL ${hex(instr.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(instr.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(instr.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(instr.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(instr.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(instr.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'rst':
      return `${prefix}RST ${hex(instr.target ?? instr.vector, 2)}`;
    case 'push':
      return `${prefix}PUSH ${String(instr.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(instr.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, ${hex(instr.value)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, (${hex(instr.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(instr.addr)}), ${String(instr.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${hexByte(instr.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${String(instr.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, (${String(instr.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(instr.dest).toUpperCase()}), ${String(instr.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, (${hex(instr.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(instr.addr)}), ${String(instr.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(instr.value)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${formatIndexed(instr.indexRegister ?? instr.indexReg, instr.displacement ?? 0)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(instr.indexRegister, instr.displacement)}, ${String(instr.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(instr.indexRegister, instr.displacement)}, ${hexByte(instr.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(instr.indexRegister, instr.displacement)}, ${String(instr.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}LD ${formatIndexed(instr.indexRegister, instr.displacement)}, ${String(instr.src).toUpperCase()}`;
    case 'ld-pair-ind':
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, (${String(instr.src).toUpperCase()})`;
    case 'ld-ind-pair':
      return `${prefix}LD (${String(instr.dest).toUpperCase()}), ${String(instr.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return `${prefix}LD SP, HL`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(instr.pair).toUpperCase()}`;
    case 'ld-special':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${String(instr.src).toUpperCase()}`;
    case 'ld-mb-a':
      return `${prefix}LD MB, A`;
    case 'ld-a-mb':
      return `${prefix}LD A, MB`;
    case 'alu-reg':
      return `${prefix}${String(instr.op).toUpperCase()} ${String(instr.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(instr.op).toUpperCase()} ${hexByte(instr.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(instr.dest ?? 'hl').toUpperCase()}, ${String(instr.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(instr.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(instr.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(instr.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(instr.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(instr.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(instr.pair).toUpperCase()}`;
    case 'inc-ixd':
      return `${prefix}INC ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'dec-ixd':
      return `${prefix}DEC ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${instr.bit}, ${String(instr.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${instr.bit}, (${String(instr.indirectRegister).toUpperCase()})`;
    case 'bit-set':
      return `${prefix}SET ${instr.bit}, ${String(instr.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${instr.bit}, ${String(instr.reg).toUpperCase()}`;
    case 'bit-set-ind':
      return `${prefix}SET ${instr.bit}, (${String(instr.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `${prefix}RES ${instr.bit}, (${String(instr.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${String(instr.operation ?? instr.op).toUpperCase()} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${String(instr.op).toUpperCase()} ${String(instr.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(instr.op).toUpperCase()} (${String(instr.indirectRegister).toUpperCase()})`;
    case 'lea':
      return `${prefix}LEA ${String(instr.dest).toUpperCase()}, ${formatIndexed(instr.base, instr.displacement)}`;
    case 'in0':
      return `${prefix}IN0 ${String(instr.reg).toUpperCase()}, (${hexByte(instr.port)})`;
    case 'out0':
      return `${prefix}OUT0 (${hexByte(instr.port)}), ${String(instr.reg).toUpperCase()}`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(instr.port)})`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(instr.port)}), A`;
    case 'in-reg':
      return `${prefix}IN ${String(instr.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(instr.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'im':
      return `${prefix}IM ${instr.value}`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'slp':
      return `${prefix}SLP`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'ex-sp-hl':
      return `${prefix}EX (SP), HL`;
    case 'ex-sp-pair':
      return `${prefix}EX (SP), ${String(instr.pair).toUpperCase()}`;
    case 'rld':
      return `${prefix}RLD`;
    case 'rrd':
      return `${prefix}RRD`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'cpi':
      return `${prefix}CPI`;
    case 'cpd':
      return `${prefix}CPD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'ini':
      return `${prefix}INI`;
    case 'ind':
      return `${prefix}IND`;
    case 'inir':
      return `${prefix}INIR`;
    case 'indr':
      return `${prefix}INDR`;
    case 'outi':
      return `${prefix}OUTI`;
    case 'outd':
      return `${prefix}OUTD`;
    case 'otir':
      return `${prefix}OTIR`;
    case 'otdr':
      return `${prefix}OTDR`;
    case 'otimr':
      return `${prefix}OTIMR`;
    case 'tst-reg':
      return `${prefix}TST A, ${String(instr.reg).toUpperCase()}`;
    case 'tst-ind':
      return `${prefix}TST A, (HL)`;
    case 'tst-imm':
      return `${prefix}TST A, ${hexByte(instr.value)}`;
    case 'tstio':
      return `${prefix}TSTIO ${hexByte(instr.value)}`;
    case 'mlt':
      return `${prefix}MLT ${String(instr.reg).toUpperCase()}`;
    case 'stmix':
      return `${prefix}STMIX`;
    case 'rsmix':
      return `${prefix}RSMIX`;
    default:
      return `${prefix}[${String(instr.tag).toUpperCase()}] ${JSON.stringify(instr)}`;
  }
}

function disassembleWindow(start, byteCount, maxInstructions = 160) {
  const rows = [];
  const endExclusive = start + byteCount;
  let pc = start;

  while (pc < endExclusive && rows.length < maxInstructions) {
    const instr = safeDecode(pc);
    if (!instr) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `DB ${hexByte(rom[pc])}`,
        instr: null,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length: instr.length,
      bytes: formatBytes(pc, instr.length),
      text: formatInstruction(instr),
      instr,
    });
    pc += Math.max(1, instr.length);
  }

  return rows;
}

function normalizeReg(reg) {
  if (!reg) return null;
  const value = String(reg).toLowerCase();
  if (value === '(hl)' || value === '(ix)' || value === '(iy)') return null;
  if (value === 'af') return 'a';
  return value;
}

function parentRegister(reg) {
  switch (reg) {
    case 'b':
    case 'c':
      return 'bc';
    case 'd':
    case 'e':
      return 'de';
    case 'h':
    case 'l':
      return 'hl';
    default:
      return null;
  }
}

function addRegister(set, reg) {
  const normalized = normalizeReg(reg);
  if (!normalized) return;
  set.add(normalized);
  const parent = parentRegister(normalized);
  if (parent) set.add(parent);
}

function getRegisterTouches(instr) {
  const reads = new Set();
  const writes = new Set();
  const read = (reg) => addRegister(reads, reg);
  const write = (reg) => addRegister(writes, reg);

  switch (instr.tag) {
    case 'ld-pair-imm':
    case 'ld-pair-mem':
      write(instr.pair);
      break;
    case 'ld-mem-pair':
      read(instr.pair);
      break;
    case 'ld-reg-imm':
    case 'ld-reg-mem':
      write(instr.dest);
      break;
    case 'ld-reg-reg':
      read(instr.src);
      write(instr.dest);
      break;
    case 'ld-reg-ind':
      read(instr.src);
      write(instr.dest);
      break;
    case 'ld-ind-reg':
      read(instr.dest);
      read(instr.src);
      break;
    case 'ld-mem-reg':
      read(instr.src);
      break;
    case 'ld-ind-imm':
      read('hl');
      break;
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
      read(instr.indexRegister ?? instr.indexReg);
      write(instr.dest);
      break;
    case 'ld-ixd-reg':
      read(instr.indexRegister);
      read(instr.src);
      break;
    case 'ld-ixd-imm':
      read(instr.indexRegister);
      break;
    case 'ld-pair-indexed':
      read(instr.indexRegister);
      write(instr.pair);
      break;
    case 'ld-indexed-pair':
      read(instr.indexRegister);
      read(instr.pair);
      break;
    case 'ld-ixiy-indexed':
      read(instr.indexRegister);
      write(instr.dest);
      break;
    case 'ld-indexed-ixiy':
      read(instr.indexRegister);
      read(instr.src);
      break;
    case 'ld-pair-ind':
      read(instr.src);
      write(instr.pair);
      break;
    case 'ld-ind-pair':
      read(instr.dest);
      read(instr.pair);
      break;
    case 'ld-sp-hl':
      read('hl');
      write('sp');
      break;
    case 'ld-sp-pair':
      read(instr.pair);
      write('sp');
      break;
    case 'ld-special':
      read(instr.src);
      write(instr.dest);
      break;
    case 'ld-mb-a':
      read('a');
      write('mb');
      break;
    case 'ld-a-mb':
      read('mb');
      write('a');
      break;
    case 'alu-reg':
      read('a');
      read(instr.src);
      write('a');
      break;
    case 'alu-imm':
      read('a');
      write('a');
      break;
    case 'add-pair':
      read(instr.dest ?? 'hl');
      read(instr.src);
      write(instr.dest ?? 'hl');
      break;
    case 'adc-pair':
    case 'sbc-pair':
      read('hl');
      read(instr.src);
      write('hl');
      break;
    case 'inc-reg':
    case 'dec-reg':
      read(instr.reg);
      write(instr.reg);
      break;
    case 'inc-pair':
    case 'dec-pair':
      read(instr.pair);
      write(instr.pair);
      break;
    case 'inc-ixd':
    case 'dec-ixd':
      read(instr.indexRegister);
      break;
    case 'bit-test':
      read(instr.reg);
      break;
    case 'bit-test-ind':
      read(instr.indirectRegister);
      break;
    case 'bit-set':
    case 'bit-res':
      read(instr.reg);
      write(instr.reg);
      break;
    case 'bit-set-ind':
    case 'bit-res-ind':
      read(instr.indirectRegister);
      break;
    case 'indexed-cb-bit':
      read(instr.indexRegister);
      break;
    case 'indexed-cb-set':
    case 'indexed-cb-res':
    case 'indexed-cb-rotate':
      read(instr.indexRegister);
      break;
    case 'rotate-reg':
      read(instr.reg);
      write(instr.reg);
      break;
    case 'rotate-ind':
      read(instr.indirectRegister);
      break;
    case 'lea':
      read(instr.base);
      write(instr.dest);
      break;
    case 'push':
      read(instr.pair);
      break;
    case 'pop':
      write(instr.pair);
      break;
    case 'jp-indirect':
      read(instr.indirectRegister);
      break;
    case 'djnz':
      read('b');
      write('b');
      break;
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
      read('hl');
      read('de');
      read('bc');
      write('hl');
      write('de');
      write('bc');
      break;
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
      read('a');
      read('hl');
      read('bc');
      write('hl');
      write('bc');
      break;
    case 'rrd':
    case 'rld':
      read('a');
      read('hl');
      write('a');
      write('hl');
      break;
    case 'in-imm':
      write('a');
      break;
    case 'out-imm':
      read('a');
      break;
    case 'in-reg':
      read('c');
      write(instr.reg);
      break;
    case 'out-reg':
      read('c');
      read(instr.reg);
      break;
    case 'tst-reg':
      read('a');
      read(instr.reg);
      break;
    case 'tst-ind':
      read('a');
      read('hl');
      break;
    case 'tst-imm':
      read('a');
      break;
    case 'mlt':
      read(instr.reg);
      write(instr.reg);
      break;
    case 'ex-af':
      read('a');
      write('a');
      break;
    case 'exx':
      read('bc');
      read('de');
      read('hl');
      write('bc');
      write('de');
      write('hl');
      break;
    case 'ex-de-hl':
      read('de');
      read('hl');
      write('de');
      write('hl');
      break;
    case 'ex-sp-hl':
      read('sp');
      read('hl');
      write('sp');
      write('hl');
      break;
    case 'ex-sp-pair':
      read('sp');
      read(instr.pair);
      write('sp');
      write(instr.pair);
      break;
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'neg':
      read('a');
      write('a');
      break;
    default:
      break;
  }

  return { reads, writes };
}

function inRomTableRange(value) {
  return Number.isInteger(value) && value >= ROM_TABLE_MIN && value <= ROM_TABLE_MAX;
}

function describeRomTableLoad(row) {
  const instr = row.instr;
  if (!instr) return null;

  if (instr.tag === 'ld-pair-imm' &&
      ['hl', 'ix', 'iy'].includes(String(instr.pair).toLowerCase()) &&
      inRomTableRange(instr.value)) {
    return `${hex(row.pc)}: ${row.text}`;
  }

  if (instr.tag === 'ld-pair-mem' &&
      ['hl', 'ix', 'iy'].includes(String(instr.pair).toLowerCase()) &&
      inRomTableRange(instr.addr)) {
    return `${hex(row.pc)}: ${row.text}  ; pointer source in ROM`;
  }

  return null;
}

function isLikelyTableRead(instr) {
  if (!instr) return false;

  if (instr.tag === 'ld-reg-ind') {
    return ['hl', 'ix', 'iy', 'bc', 'de'].includes(String(instr.src).toLowerCase());
  }
  if (instr.tag === 'ld-reg-ixd' || instr.tag === 'ld-reg-idx') return true;
  if (instr.tag === 'ld-pair-ind') {
    return ['hl', 'ix', 'iy'].includes(String(instr.src).toLowerCase());
  }

  return false;
}

function isLikelyIndexMath(instr) {
  if (!instr) return false;

  if ([
    'mlt',
    'lea',
    'add-pair',
    'adc-pair',
    'sbc-pair',
    'inc-pair',
    'dec-pair',
  ].includes(instr.tag)) {
    return true;
  }

  if (instr.tag === 'ld-reg-reg' &&
      ['a', 'b', 'c', 'd', 'e', 'h', 'l'].includes(String(instr.src).toLowerCase()) &&
      ['b', 'c', 'd', 'e', 'h', 'l'].includes(String(instr.dest).toLowerCase())) {
    return true;
  }

  return false;
}

function sortRegisters(values) {
  return [...values].sort((left, right) => {
    const leftIndex = REG_ORDER.indexOf(left);
    const rightIndex = REG_ORDER.indexOf(right);
    const a = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const b = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return a - b || left.localeCompare(right);
  });
}

function formatRegisterList(values) {
  const items = sortRegisters(values).map((value) => value.toUpperCase());
  return items.length ? items.join(', ') : 'none detected';
}

function formatReturnSource(row) {
  return row ? `${hex(row.pc)} ${row.text}` : 'not written in this window';
}

function analyzeRows(rows) {
  const reads = new Set();
  const writes = new Set();
  const romTableLoads = [];
  const tableReads = [];
  const indexMath = [];
  const returns = [];
  const lastWrites = new Map();

  for (const row of rows) {
    if (!row.instr) continue;

    const touches = getRegisterTouches(row.instr);
    for (const reg of touches.reads) reads.add(reg);
    for (const reg of touches.writes) {
      writes.add(reg);
      if (RETURN_FAMILIES.includes(reg)) {
        lastWrites.set(reg, row);
      }
    }

    const romTableLoad = describeRomTableLoad(row);
    if (romTableLoad) romTableLoads.push(romTableLoad);
    if (isLikelyTableRead(row.instr)) tableReads.push(`${hex(row.pc)}: ${row.text}`);
    if (isLikelyIndexMath(row.instr)) indexMath.push(`${hex(row.pc)}: ${row.text}`);

    if (row.instr.tag === 'ret' || row.instr.tag === 'reti' || row.instr.tag === 'retn') {
      returns.push({
        pc: row.pc,
        text: row.text,
        writers: Object.fromEntries(RETURN_FAMILIES.map((family) => [family, lastWrites.get(family) ?? null])),
      });
    }
  }

  return { reads, writes, romTableLoads, tableReads, indexMath, returns };
}

function findCallerSites(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const matches = [];

  for (let pc = 0; pc <= rom.length - 4; pc++) {
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;

    if (rom[pc] === 0xCD) {
      matches.push({ type: 'CALL', pc });
    } else if (rom[pc] === 0xC3) {
      matches.push({ type: 'JP', pc });
    }
  }

  return matches;
}

function printFunctionSection(spec) {
  const rows = disassembleWindow(spec.start, spec.byteCount);
  const analysis = analyzeRows(rows);
  const endInclusive = spec.start + spec.byteCount - 1;

  console.log(`=== ${spec.label} ===`);
  console.log(`Linear ADL window: ${hex(spec.start)}-${hex(endInclusive)}`);
  console.log('');

  for (const row of rows) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(29)} ${row.text}`);
  }

  console.log('');
  console.log('Register reads : ' + formatRegisterList(analysis.reads));
  console.log('Register writes: ' + formatRegisterList(analysis.writes));

  console.log('ROM table base loads:');
  if (analysis.romTableLoads.length === 0) {
    console.log('  none in the decoded window');
  } else {
    for (const line of analysis.romTableLoads) console.log(`  ${line}`);
  }

  console.log('Likely table dereferences:');
  if (analysis.tableReads.length === 0) {
    console.log('  none detected');
  } else {
    for (const line of analysis.tableReads) console.log(`  ${line}`);
  }

  console.log('Possible multiplication / index math:');
  if (analysis.indexMath.length === 0) {
    console.log('  no explicit MLT/LEA/add-pair style index math detected');
  } else {
    for (const line of analysis.indexMath) console.log(`  ${line}`);
  }

  console.log('Return-value heuristic (latest writes before RET):');
  if (analysis.returns.length === 0) {
    console.log('  no RET/RETI/RETN reached inside this linear window');
  } else {
    for (const ret of analysis.returns) {
      console.log(`  ${hex(ret.pc)} ${ret.text}`);
      console.log(`    A : ${formatReturnSource(ret.writers.a)}`);
      console.log(`    HL: ${formatReturnSource(ret.writers.hl)}`);
      console.log(`    DE: ${formatReturnSource(ret.writers.de)}`);
      console.log(`    BC: ${formatReturnSource(ret.writers.bc)}`);
    }
  }

  console.log('');
}

function printCallerSection() {
  const sites = findCallerSites(CALLER_TARGET);

  console.log(`=== CALL/JP sites to ${hex(CALLER_TARGET)} ===`);
  console.log(`Pattern bytes: CALL ${hexByte(0xCD)} ${hexByte(0x6E)} ${hexByte(0x59)} ${hexByte(0x00)} | JP ${hexByte(0xC3)} ${hexByte(0x6E)} ${hexByte(0x59)} ${hexByte(0x00)}`);
  console.log(`Matches found: ${sites.length}`);
  console.log('');

  if (sites.length === 0) {
    console.log('No direct CALL/JP sites found.');
    console.log('');
    return;
  }

  for (const site of sites) {
    const instr = safeDecode(site.pc);
    const text = instr ? formatInstruction(instr) : `${site.type} ${hex(CALLER_TARGET)}`;
    const bytes = formatBytes(site.pc, 4);
    console.log(`${hex(site.pc)}: ${bytes.padEnd(29)} ${text}`);
  }

  console.log('');
}

console.log('Phase 290: 0x00596E table-base resolver trace');
console.log(`ROM size: ${rom.length} bytes`);
console.log('');

for (const spec of FUNCTION_SPECS) {
  printFunctionSection(spec);
}

printCallerSection();
