#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const MAX_INSTRUCTIONS = 500;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const CLEAR_SCAN_CODE = 0x28;

const WATCH_ADDRS = new Map([
  [D0058C, 'D0058C raw scan code'],
  [D0058E, 'D0058E keyExtend'],
]);

const FUNCTIONS = [
  { start: 0x096E22, label: '0x096E22 default-handler callee' },
  { start: 0x025CFC, label: '0x025CFC default-handler follow-up' },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function unique(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function namedAddr(addr) {
  return WATCH_ADDRS.has(addr) ? `${hex(addr)} [${WATCH_ADDRS.get(addr)}]` : hex(addr);
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${hex(Math.abs(displacement), 2)})`;
}

function formatInstruction(inst) {
  if (!inst) return { mnemonic: 'UNKNOWN', operands: '' };

  switch (inst.tag) {
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-rotate':
      return { mnemonic: upper(inst.operation), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.src)}` };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${hex(inst.value)}` };
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${hex(inst.addr)})` }
        : { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest ?? inst.pair)}), ${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${upper(inst.src ?? inst.pair)})` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(HL), ${hexByte(inst.value)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister ?? 'HL')})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'reti':
      return { mnemonic: 'RETI', operands: '' };
    case 'retn':
      return { mnemonic: 'RETN', operands: '' };
    case 'rst':
      return { mnemonic: 'RST', operands: hexByte(inst.target ?? inst.vector) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-ixd':
      return { mnemonic: 'INC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'DEC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)}, ${upper(inst.src)}` };
    case 'adc-pair':
      return { mnemonic: 'ADC', operands: `HL, ${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL, ${upper(inst.src)}` };
    case 'ld-sp-hl':
      return { mnemonic: 'LD', operands: 'SP, HL' };
    case 'ld-sp-pair':
      return { mnemonic: 'LD', operands: `SP, ${upper(inst.pair)}` };
    case 'ex-sp-hl':
      return { mnemonic: 'EX', operands: '(SP), HL' };
    case 'ex-sp-pair':
      return { mnemonic: 'EX', operands: `(SP), ${upper(inst.pair)}` };
    case 'ex-af':
      return { mnemonic: 'EX', operands: "AF, AF'" };
    case 'exx':
      return { mnemonic: 'EXX', operands: '' };
    case 'ex-de-hl':
      return { mnemonic: 'EX', operands: 'DE, HL' };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'halt':
      return { mnemonic: 'HALT', operands: '' };
    case 'slp':
      return { mnemonic: 'SLP', operands: '' };
    case 'di':
      return { mnemonic: 'DI', operands: '' };
    case 'ei':
      return { mnemonic: 'EI', operands: '' };
    case 'scf':
      return { mnemonic: 'SCF', operands: '' };
    case 'ccf':
      return { mnemonic: 'CCF', operands: '' };
    case 'cpl':
      return { mnemonic: 'CPL', operands: '' };
    case 'daa':
      return { mnemonic: 'DAA', operands: '' };
    case 'rlca':
      return { mnemonic: 'RLCA', operands: '' };
    case 'rrca':
      return { mnemonic: 'RRCA', operands: '' };
    case 'rla':
      return { mnemonic: 'RLA', operands: '' };
    case 'rra':
      return { mnemonic: 'RRA', operands: '' };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-test-ind':
      return { mnemonic: 'BIT', operands: `${inst.bit}, (HL)` };
    case 'bit-res-ind':
      return { mnemonic: 'RES', operands: `${inst.bit}, (HL)` };
    case 'bit-set-ind':
      return { mnemonic: 'SET', operands: `${inst.bit}, (HL)` };
    case 'rotate-reg':
      return { mnemonic: upper(inst.op ?? inst.operation), operands: upper(inst.reg) };
    case 'rotate-ind':
      return { mnemonic: upper(inst.op ?? inst.operation), operands: '(HL)' };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A, (${hexByte(inst.port)})` };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hexByte(inst.port)}), A` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg ?? inst.dest)}, (C)` };
    case 'out-reg':
      return { mnemonic: 'OUT', operands: `(C), ${upper(inst.reg ?? inst.src)}` };
    case 'in0':
      return { mnemonic: 'IN0', operands: `${upper(inst.reg ?? inst.dest)}, (${hexByte(inst.port)})` };
    case 'out0':
      return { mnemonic: 'OUT0', operands: `(${hexByte(inst.port)}), ${upper(inst.reg ?? inst.src)}` };
    case 'neg':
      return { mnemonic: 'NEG', operands: '' };
    case 'ld-special':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)}, ${upper(inst.src)}` };
    case 'rrd':
      return { mnemonic: 'RRD', operands: '' };
    case 'rld':
      return { mnemonic: 'RLD', operands: '' };
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
      return { mnemonic: upper(inst.tag), operands: '' };
    case 'mlt':
      return { mnemonic: 'MLT', operands: upper(inst.reg) };
    case 'tst-reg':
      return { mnemonic: 'TST', operands: upper(inst.reg) };
    case 'tst-ind':
      return { mnemonic: 'TST', operands: '(HL)' };
    case 'tst-imm':
      return { mnemonic: 'TST', operands: hexByte(inst.value) };
    case 'tstio':
      return { mnemonic: 'TSTIO', operands: hexByte(inst.value) };
    case 'im':
      return { mnemonic: 'IM', operands: String(inst.value) };
    case 'ld-mb-a':
      return { mnemonic: 'LD', operands: 'MB, A' };
    case 'ld-a-mb':
      return { mnemonic: 'LD', operands: 'A, MB' };
    case 'lea':
      return { mnemonic: 'LEA', operands: `${upper(inst.dest)}, ${upper(inst.base)}${inst.displacement < 0 ? '-' : '+'}${hex(Math.abs(inst.displacement), 2)}` };
    case 'ld-pair-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${upper(inst.src)})` };
    case 'ld-ind-pair':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}), ${upper(inst.pair)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}` };
    case 'stmix':
      return { mnemonic: 'STMIX', operands: '' };
    case 'rsmix':
      return { mnemonic: 'RSMIX', operands: '' };
    default:
      return { mnemonic: upper(inst.tag), operands: '' };
  }
}

function pairFor8BitReg(reg) {
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
    case 'ixh':
    case 'ixl':
      return 'ix';
    case 'iyh':
    case 'iyl':
      return 'iy';
    default:
      return null;
  }
}

function clearTrackedPair(pairState, pair) {
  if (pair) pairState.delete(pair);
}

function clearPairStateForInst(pairState, inst) {
  if (!inst) return;

  if (inst.tag === 'ld-pair-imm') {
    pairState.set(inst.pair, inst.value);
    return;
  }

  if (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-mem') {
    clearTrackedPair(pairState, pairFor8BitReg(inst.dest ?? inst.dst));
  }

  if (inst.tag === 'inc-reg' || inst.tag === 'dec-reg') {
    clearTrackedPair(pairState, pairFor8BitReg(inst.reg));
  }

  if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed') {
    clearTrackedPair(pairState, inst.pair ?? inst.dest);
  }

  if (inst.tag === 'inc-pair' || inst.tag === 'dec-pair' || inst.tag === 'pop') {
    clearTrackedPair(pairState, inst.pair);
  }

  if (inst.tag === 'add-pair' || inst.tag === 'lea') {
    clearTrackedPair(pairState, inst.dest);
  }

  if (inst.tag === 'ex-de-hl') {
    clearTrackedPair(pairState, 'de');
    clearTrackedPair(pairState, 'hl');
  }

  if (inst.tag === 'ld-pair-ind') {
    clearTrackedPair(pairState, inst.pair);
  }

  if (isControlFlow(inst.tag)) {
    pairState.clear();
  }
}

function isControlFlow(tag) {
  return [
    'call',
    'call-conditional',
    'jp',
    'jp-conditional',
    'jp-indirect',
    'jr',
    'jr-conditional',
    'djnz',
    'ret',
    'ret-conditional',
    'reti',
    'retn',
    'rst',
  ].includes(tag);
}

function isHardStop(tag) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'halt', 'slp'].includes(tag);
}

function describeConditional(inst) {
  switch (inst?.tag) {
    case 'jr-conditional':
    case 'jp-conditional':
      return `${upper(inst.condition)} -> ${hex(inst.target)}`;
    case 'call-conditional':
      return `${upper(inst.condition)} -> ${hex(inst.target)}`;
    case 'ret-conditional':
      return `${upper(inst.condition)} -> RET`;
    case 'djnz':
      return `DJNZ -> ${hex(inst.target)}`;
    default:
      return null;
  }
}

function describeIyAccess(inst) {
  if (!inst) return null;
  if (inst.indexRegister !== 'iy') return null;

  switch (inst.tag) {
    case 'indexed-cb-bit':
    case 'indexed-cb-set':
    case 'indexed-cb-res':
      return `${upper(inst.tag.replace('indexed-cb-', ''))} ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'inc-ixd':
      return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-ixd':
      return `${upper(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default:
      return null;
  }
}

function inspectInstruction(row, pairState) {
  const inst = row.inst;
  const notes = [];
  const readRefs = [];
  const writeRefs = [];
  let cpEntry = null;
  let callTarget = null;
  let conditional = null;
  let iyAccess = null;

  if (inst?.tag === 'ld-reg-mem' && WATCH_ADDRS.has(inst.addr)) {
    const label = WATCH_ADDRS.get(inst.addr);
    notes.push(`reads ${label}`);
    readRefs.push(label);
  }

  if (inst?.tag === 'ld-pair-mem' && inst.direction === 'from-mem' && WATCH_ADDRS.has(inst.addr)) {
    const label = WATCH_ADDRS.get(inst.addr);
    notes.push(`reads ${label} into ${upper(inst.pair)}`);
    readRefs.push(label);
  }

  if (inst?.tag === 'ld-reg-ind') {
    const tracked = pairState.get(inst.src ?? inst.pair);
    if (WATCH_ADDRS.has(tracked)) {
      const label = WATCH_ADDRS.get(tracked);
      notes.push(`reads ${label} via ${upper(inst.src ?? inst.pair)}`);
      readRefs.push(label);
    }
  }

  if ((inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-pair') && WATCH_ADDRS.has(inst.addr)) {
    const label = WATCH_ADDRS.get(inst.addr);
    notes.push(`writes ${label}`);
    writeRefs.push(label);
  }

  if (inst?.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && WATCH_ADDRS.has(inst.addr)) {
    const label = WATCH_ADDRS.get(inst.addr);
    notes.push(`writes ${label}`);
    writeRefs.push(label);
  }

  if (inst?.tag === 'ld-ind-reg') {
    const tracked = pairState.get(inst.dest ?? inst.pair);
    if (WATCH_ADDRS.has(tracked)) {
      const label = WATCH_ADDRS.get(tracked);
      notes.push(`writes ${label} via ${upper(inst.dest ?? inst.pair)}`);
      writeRefs.push(label);
    }
  }

  if (inst?.tag === 'ld-pair-imm' && WATCH_ADDRS.has(inst.value)) {
    notes.push(`loads ${upper(inst.pair)} with ${WATCH_ADDRS.get(inst.value)}`);
  }

  if (inst?.tag === 'alu-imm' && inst.op === 'cp') {
    cpEntry = {
      pc: row.pc,
      operand: hexByte(inst.value),
      value: inst.value,
      isClearCompare: inst.value === CLEAR_SCAN_CODE,
    };
    notes.push(`CP ${hexByte(inst.value)}`);
    if (inst.value === CLEAR_SCAN_CODE) notes.push('compares against CLEAR scan code 0x28');
  } else if (inst?.tag === 'alu-reg' && inst.op === 'cp') {
    cpEntry = {
      pc: row.pc,
      operand: upper(inst.src),
      value: null,
      isClearCompare: false,
    };
    notes.push(`CP ${upper(inst.src)}`);
  } else if (inst?.tag === 'alu-ixd' && inst.op === 'cp') {
    const operand = formatIndexed(inst.indexRegister, inst.displacement);
    cpEntry = {
      pc: row.pc,
      operand,
      value: null,
      isClearCompare: false,
    };
    notes.push(`CP ${operand}`);
  }

  iyAccess = describeIyAccess(inst);
  if (iyAccess) notes.push(`IY access: ${iyAccess}`);

  if (inst?.tag === 'call') {
    callTarget = inst.target;
    notes.push(`CALL target ${hex(inst.target)}`);
  } else if (inst?.tag === 'call-conditional') {
    callTarget = inst.target;
    conditional = describeConditional(inst);
    notes.push(`conditional CALL ${conditional}`);
  } else {
    conditional = describeConditional(inst);
    if (conditional) notes.push(`conditional branch ${conditional}`);
  }

  return {
    notes,
    readRefs: unique(readRefs),
    writeRefs: unique(writeRefs),
    cpEntry,
    callTarget,
    conditional,
    iyAccess,
  };
}

function fmtRow(pc, inst) {
  const length = Math.max(1, inst?.length ?? 1);
  const bytes = bytesToHex(rom.subarray(pc, pc + length));
  const rendered = formatInstruction(inst);
  return {
    pc,
    length,
    bytes,
    inst,
    mnemonic: rendered.mnemonic,
    operands: rendered.operands,
  };
}

function analyzeFunction(def) {
  const rows = [];
  const pairState = new Map();
  let pc = def.start;
  let decodeError = null;
  let stopReason = `max ${MAX_INSTRUCTIONS} instructions`;

  for (let index = 0; index < MAX_INSTRUCTIONS; index++) {
    if (pc < 0 || pc >= rom.length) {
      stopReason = 'left ROM range';
      break;
    }

    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch (error) {
      decodeError = { pc, message: error?.message ?? String(error) };
      stopReason = 'decode error';
      break;
    }

    const row = fmtRow(pc, inst);
    const inspection = inspectInstruction(row, pairState);
    Object.assign(row, inspection);
    rows.push(row);

    clearPairStateForInst(pairState, inst);

    if (isHardStop(inst?.tag)) {
      stopReason = `${upper(inst.tag)} at ${hex(pc)}`;
      break;
    }

    pc += row.length;
  }

  const cpCascade = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row.cpEntry) continue;

    const next = rows[index + 1];
    let edge = 'no immediate branch/call';
    if (next && next.pc === row.pc + row.length) {
      if (next.inst?.tag === 'jr-conditional' || next.inst?.tag === 'jp-conditional' || next.inst?.tag === 'call-conditional') {
        edge = `${upper(next.inst.condition)} -> ${hex(next.inst.target)}`;
      } else if (next.inst?.tag === 'ret-conditional') {
        edge = `${upper(next.inst.condition)} -> RET`;
      } else if (next.inst?.tag === 'djnz') {
        edge = `DJNZ -> ${hex(next.inst.target)}`;
      } else if (next.inst?.tag === 'jr' || next.inst?.tag === 'jp') {
        edge = `unconditional -> ${hex(next.inst.target)}`;
      }
    }

    cpCascade.push({
      pc: row.pc,
      operand: row.cpEntry.operand,
      value: row.cpEntry.value,
      isClearCompare: row.cpEntry.isClearCompare,
      edge,
    });
  }

  const callTargets = unique(rows.filter((row) => row.callTarget !== null).map((row) => row.callTarget));
  const conditionalBranches = rows
    .filter((row) => row.conditional)
    .map((row) => ({ pc: row.pc, text: row.conditional }));
  const iyAccesses = unique(rows.filter((row) => row.iyAccess).map((row) => ({ pc: row.pc, text: row.iyAccess })));
  const readRefs = unique(rows.flatMap((row) => row.readRefs));
  const cpValues = unique(cpCascade.filter((entry) => entry.value !== null).map((entry) => entry.value));

  const start = rows[0]?.pc ?? def.start;
  const end = rows.length ? rows[rows.length - 1].pc + rows[rows.length - 1].length - 1 : def.start;

  return {
    ...def,
    rows,
    cpCascade,
    callTargets,
    conditionalBranches,
    iyAccesses,
    readRefs,
    cpValues,
    hasClearCpCompare: cpCascade.some((entry) => entry.isClearCompare),
    decodeError,
    stopReason,
    byteStart: start,
    byteEnd: end,
  };
}

function printFunctionReport(report) {
  console.log(`## ${report.label}`);
  console.log(`Start: ${hex(report.start)}`);
  console.log(`Byte range: ${hex(report.byteStart)}-${hex(report.byteEnd)} (${report.byteEnd - report.byteStart + 1} bytes)`);
  console.log(`Instruction count: ${report.rows.length}`);
  console.log(`Stop reason: ${report.stopReason}`);
  if (report.decodeError) {
    console.log(`Decode error: ${hex(report.decodeError.pc)} ${report.decodeError.message}`);
  }
  console.log('');

  console.log('### Instruction Listing');
  for (const row of report.rows) {
    const ops = row.operands ? ` ${row.operands}` : '';
    const notes = row.notes.length ? ` ; ${row.notes.join('; ')}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.mnemonic}${ops}${notes}`);
  }
  console.log('');

  console.log('### CP Cascade Map');
  if (!report.cpCascade.length) {
    console.log('  none');
  } else {
    for (const entry of report.cpCascade) {
      const clearTag = entry.isClearCompare ? ' [CLEAR 0x28]' : '';
      console.log(`  ${hex(entry.pc)}  CP ${entry.operand}${clearTag} ; ${entry.edge}`);
    }
  }
  console.log('');

  console.log('### Summary');
  console.log(`  Reads D0058C: ${report.readRefs.includes(WATCH_ADDRS.get(D0058C)) ? 'yes' : 'no'}`);
  console.log(`  Reads D0058E: ${report.readRefs.includes(WATCH_ADDRS.get(D0058E)) ? 'yes' : 'no'}`);
  console.log(`  CP values: ${report.cpValues.length ? report.cpValues.map((value) => hexByte(value)).join(', ') : 'none'}`);
  console.log(`  CALL targets: ${report.callTargets.length ? report.callTargets.map((target) => hex(target)).join(', ') : 'none'}`);
  console.log(`  Conditional branches/calls: ${report.conditionalBranches.length ? report.conditionalBranches.map((entry) => `${hex(entry.pc)} ${entry.text}`).join(' | ') : 'none'}`);
  console.log(`  IY flag accesses: ${report.iyAccesses.length ? report.iyAccesses.map((entry) => `${hex(entry.pc)} ${entry.text}`).join(' | ') : 'none'}`);
  console.log(`  CP compares against CLEAR 0x28: ${report.hasClearCpCompare ? 'yes' : 'no'}`);
  console.log('');
}

const reports = FUNCTIONS.map(analyzeFunction);
const fn096E22 = reports.find((report) => report.start === 0x096E22);
const fn025CFC = reports.find((report) => report.start === 0x025CFC);

console.log('# Phase 294: Default Handler Trace (0x096E22 / 0x025CFC)');
console.log('');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Mode: static ROM disassembly only, ADL decode, max ${MAX_INSTRUCTIONS} instructions per function`);
console.log('');

for (const report of reports) {
  printFunctionReport(report);
}

console.log('## Conclusions');
if (fn096E22) {
  console.log(`- 0x096E22 has ${fn096E22.cpCascade.length ? 'a CP cascade' : 'no CP cascade'} in its own body. It is a ${fn096E22.rows.map((row) => row.mnemonic).join(' -> ')} stub that immediately delegates to ${fn096E22.callTargets.length ? hex(fn096E22.callTargets[0]) : 'no callee'}.`);
}
if (fn025CFC) {
  console.log(`- 0x025CFC has ${fn025CFC.cpCascade.length ? 'a CP cascade' : 'no CP cascade'} in its own body. Its only conditional control transfer is ${fn025CFC.conditionalBranches.length ? `${hex(fn025CFC.conditionalBranches[0].pc)} ${fn025CFC.conditionalBranches[0].text}` : 'none'}.`);
}
console.log(`- CP compare against CLEAR scan code ${hexByte(CLEAR_SCAN_CODE)} appears in these two functions: ${reports.some((report) => report.hasClearCpCompare) ? 'yes' : 'no'}.`);
console.log(`- Direct reads of D0058C/D0058E across both functions: ${unique(reports.flatMap((report) => report.readRefs)).join(', ') || 'none'}.`);
console.log(`- If CLEAR dispatch continues deeper than 0x096E22, the next static target is ${fn096E22?.callTargets.length ? hex(fn096E22.callTargets[0]) : 'unknown'}.`);
