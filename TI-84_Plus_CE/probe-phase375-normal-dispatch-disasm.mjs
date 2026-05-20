#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

void createExecutor;
void createPeripheralBus;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;
const ROOT_LIMIT = 200;
const SUB_LIMIT = 20;

const TARGETS = [
  { addr: 0x001853, label: '0x001853 - normal key dispatch handler', stopOnDirectJp: false },
  { addr: 0x000721, label: '0x000721 - post-key-process entry', stopOnDirectJp: true },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(buffer.subarray(start, end), (byte) => hexByte(byte)).join(' ');
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  return `${n >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function fmtIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatSigned(displacement)})`;
}

function createMemoryImage(romBytes) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(memory.length, romBytes.length)));
  return memory;
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function fallbackOperands(inst) {
  const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag']);
  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function formatInstruction(inst) {
  const tag = inst?.tag ?? 'unknown';
  const singleWord = new Set([
    'nop', 'halt', 'slp', 'di', 'ei', 'ret', 'reti', 'retn', 'rlca', 'rrca', 'rla', 'rra',
    'daa', 'cpl', 'scf', 'ccf', 'neg', 'rrd', 'rld', 'ldi', 'ldd', 'ldir', 'lddr', 'cpi',
    'cpd', 'cpir', 'cpdr', 'ini', 'ind', 'inir', 'indr', 'outi', 'outd', 'otir', 'otdr',
    'otimr', 'stmix', 'rsmix', 'exx',
  ]);
  if (tag === 'db') return `db ${hexByte(inst.value)}`;
  if (singleWord.has(tag)) return tag;
  switch (tag) {
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'rst': return `rst ${hexByte(inst.target)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-ind': return `ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `ld (${inst.dest}), ${inst.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
    case 'ld-pair-indexed': return `ld ${inst.pair}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `ld ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `ld ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-ixiy-indexed': return `ld ${inst.dest}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `ld ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-special': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-ixd': return `inc ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `dec ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${inst.op} ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg': return `${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'indexed-cb-rotate': return `${inst.operation ?? inst.op ?? 'rotate'} ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    case 'in0': return `in0 ${inst.reg}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg}`;
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-pair': return `ex (sp), ${inst.pair}`;
    case 'im': return `im ${inst.value}`;
    case 'mlt': return `mlt ${inst.reg}`;
    case 'tst-reg': return `tst a, ${inst.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hexByte(inst.value)}`;
    case 'tstio': return `tstio ${hexByte(inst.value)}`;
    case 'lea': return `lea ${inst.dest}, ${fmtIndexed(inst.base, inst.displacement)}`;
    case 'pea': return `pea ${inst.base}${formatSigned(inst.displacement)}`;
    default: return `${tag}${fallbackOperands(inst) ? ` ${fallbackOperands(inst)}` : ''}`;
  }
}

function classifyAddress(addr) {
  const value = Number(addr) >>> 0;
  if (value >= 0xE00000) return 'MMIO';
  if (value >= 0xD00000) return 'RAM';
  return 'ROM';
}

function absLabel(addr) {
  return `${hex(addr)} [${classifyAddress(addr)}]`;
}

function indirectLabel(registerName) {
  return `(${String(registerName).toUpperCase()})`;
}

function addRegister(set, registerName) {
  if (!registerName || typeof registerName !== 'string') return;
  const normalized = registerName.replace(/[()]/g, '').toUpperCase();
  if (normalized) set.add(normalized);
}

function createAggregate() {
  return {
    absReads: new Map(),
    absWrites: new Map(),
    symReads: new Set(),
    symWrites: new Set(),
    portReads: new Set(),
    portWrites: new Set(),
    calls: [],
    jumps: [],
    registers: new Set(),
    setupOps: new Set(),
    stackOps: new Set(),
  };
}

function mergeAggregate(target, source) {
  for (const [addr, label] of source.absReads) target.absReads.set(addr, label);
  for (const [addr, label] of source.absWrites) target.absWrites.set(addr, label);
  for (const value of source.symReads) target.symReads.add(value);
  for (const value of source.symWrites) target.symWrites.add(value);
  for (const value of source.portReads) target.portReads.add(value);
  for (const value of source.portWrites) target.portWrites.add(value);
  target.calls.push(...source.calls);
  target.jumps.push(...source.jumps);
  for (const value of source.registers) target.registers.add(value);
  for (const value of source.setupOps) target.setupOps.add(value);
  for (const value of source.stackOps) target.stackOps.add(value);
}

function analyzeInstruction(inst, pc, nextPc, text) {
  const info = createAggregate();
  const noteRead = (addr) => info.absReads.set(Number(addr) >>> 0, absLabel(addr));
  const noteWrite = (addr) => info.absWrites.set(Number(addr) >>> 0, absLabel(addr));
  const noteSymRead = (label) => info.symReads.add(label);
  const noteSymWrite = (label) => info.symWrites.add(label);

  switch (inst.tag) {
    case 'ld-reg-mem':
      noteRead(inst.addr);
      break;
    case 'ld-mem-reg':
      noteWrite(inst.addr);
      break;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') noteWrite(inst.addr);
      else noteRead(inst.addr);
      break;
    case 'ld-mem-pair':
      noteWrite(inst.addr);
      break;
    case 'ld-reg-ind':
      noteSymRead(indirectLabel(inst.src));
      break;
    case 'ld-ind-reg':
      noteSymWrite(indirectLabel(inst.dest));
      break;
    case 'ld-ind-imm':
      noteSymWrite('(HL)');
      break;
    case 'ld-pair-ind':
      noteSymRead(indirectLabel(inst.src));
      break;
    case 'ld-ind-pair':
      noteSymWrite(indirectLabel(inst.dest));
      break;
    case 'ld-pair-indexed':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'ld-indexed-pair':
      noteSymWrite(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'ld-reg-ixd':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
      noteSymWrite(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'ld-ixiy-indexed':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'ld-indexed-ixiy':
      noteSymWrite(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'alu-ixd':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'bit-test-ind':
      noteSymRead(indirectLabel(inst.indirectRegister));
      break;
    case 'bit-set-ind':
    case 'bit-res-ind':
    case 'rotate-ind':
      noteSymRead(indirectLabel(inst.indirectRegister));
      noteSymWrite(indirectLabel(inst.indirectRegister));
      break;
    case 'indexed-cb-bit':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'indexed-cb-set':
    case 'indexed-cb-res':
    case 'indexed-cb-rotate':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      noteSymWrite(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'inc-ixd':
    case 'dec-ixd':
      noteSymRead(fmtIndexed(inst.indexRegister, inst.displacement));
      noteSymWrite(fmtIndexed(inst.indexRegister, inst.displacement));
      break;
    case 'inc-reg':
    case 'dec-reg':
      if (inst.reg === '(hl)') {
        noteSymRead('(HL)');
        noteSymWrite('(HL)');
      }
      break;
    case 'alu-reg':
      if (inst.src === '(hl)') noteSymRead('(HL)');
      break;
    case 'tst-ind':
      noteSymRead('(HL)');
      break;
    case 'rrd':
    case 'rld':
      noteSymRead('(HL)');
      noteSymWrite('(HL)');
      break;
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
      noteSymRead('(HL)');
      noteSymWrite('(DE)');
      break;
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
      noteSymRead('(HL)');
      break;
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
      noteSymWrite('(HL)');
      info.portReads.add('(C)');
      break;
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
      noteSymRead('(HL)');
      info.portWrites.add('(C)');
      break;
    case 'ex-sp-hl':
    case 'ex-sp-pair':
      noteSymRead('(SP)');
      noteSymWrite('(SP)');
      break;
    case 'in-reg':
      info.portReads.add('(C)');
      break;
    case 'out-reg':
      info.portWrites.add('(C)');
      break;
    case 'in-imm':
    case 'in0':
      info.portReads.add(hexByte(inst.port));
      break;
    case 'out-imm':
    case 'out0':
      info.portWrites.add(hexByte(inst.port));
      break;
    case 'tstio':
      info.portReads.add(hexByte(inst.value));
      break;
    default:
      break;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    info.calls.push({
      pc,
      target: Number(inst.target) >>> 0,
      conditional: inst.tag === 'call-conditional',
      condition: inst.condition ?? null,
      text,
    });
  }

  if (['jr', 'jp', 'jr-conditional', 'jp-conditional', 'djnz', 'ret', 'reti', 'retn', 'ret-conditional', 'jp-indirect'].includes(inst.tag)) {
    info.jumps.push({
      pc,
      kind: inst.tag,
      conditional: ['jr-conditional', 'jp-conditional', 'djnz', 'ret-conditional'].includes(inst.tag),
      condition: inst.tag === 'djnz' ? 'b!=0' : (inst.condition ?? null),
      target: inst.target === undefined ? null : (Number(inst.target) >>> 0),
      fallthrough: inst.fallthrough === undefined ? nextPc : (Number(inst.fallthrough) >>> 0),
      text,
    });
  }

  if (['ld-pair-imm', 'ld-reg-imm', 'ld-sp-hl', 'ld-sp-pair', 'add-pair', 'adc-pair', 'sbc-pair', 'ld-a-mb', 'ld-mb-a', 'im', 'di', 'ei', 'lea', 'pea', 'mlt'].includes(inst.tag)) {
    info.setupOps.add(text);
  }
  if (['push', 'pop', 'ex-af', 'ex-de-hl', 'ex-sp-hl', 'ex-sp-pair', 'exx'].includes(inst.tag)) {
    info.stackOps.add(text);
  }

  for (const field of ['dest', 'src', 'pair', 'reg', 'indirectRegister', 'indexRegister', 'base']) {
    addRegister(info.registers, inst[field]);
  }
  if (['push', 'pop', 'ld-sp-hl', 'ld-sp-pair', 'ex-sp-hl', 'ex-sp-pair'].includes(inst.tag)) addRegister(info.registers, 'sp');
  if (inst.tag === 'ex-af') addRegister(info.registers, 'af');
  if (inst.tag === 'ex-de-hl') {
    addRegister(info.registers, 'de');
    addRegister(info.registers, 'hl');
  }
  if (inst.tag === 'exx') {
    addRegister(info.registers, 'bc');
    addRegister(info.registers, 'de');
    addRegister(info.registers, 'hl');
  }

  return info;
}

function followTargets(inst, nextPc, stopOnDirectJp) {
  const text = formatInstruction(inst);
  if (inst.tag === 'jr') return [{ target: Number(inst.target) >>> 0, reason: `from ${hex(inst.pc)} ${text}` }];
  if (inst.tag === 'jp') return stopOnDirectJp ? [] : [{ target: Number(inst.target) >>> 0, reason: `from ${hex(inst.pc)} ${text}` }];
  if (['jr-conditional', 'jp-conditional', 'djnz'].includes(inst.tag)) {
    return [
      { target: Number(inst.target) >>> 0, reason: `taken ${hex(inst.pc)} ${text}` },
      { target: Number(inst.fallthrough ?? nextPc) >>> 0, reason: `fallthrough ${hex(inst.pc)} ${text}` },
    ];
  }
  if (inst.tag === 'ret-conditional') {
    return [{ target: Number(inst.fallthrough ?? nextPc) >>> 0, reason: `fallthrough ${hex(inst.pc)} ${text}` }];
  }
  return [];
}

function decodeBlock(memory, start, mode, budget, opts) {
  const rows = [];
  const aggregate = createAggregate();
  const branches = [];
  let pc = start;
  let stopReason = 'unknown';

  while (rows.length < budget && pc < opts.romLimit) {
    const inst = safeDecode(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    const nextPc = (pc + length) & 0xFFFFFF;
    const text = formatInstruction(inst);
    const analysis = analyzeInstruction(inst, pc, nextPc, text);
    mergeAggregate(aggregate, analysis);
    rows.push({ pc, bytes: bytesToHex(memory, pc, length), text, decodeError: inst.decodeError ?? null, inst, analysis });
    branches.push(...followTargets({ ...inst, pc }, nextPc, opts.stopOnDirectJp));

    if (['ret', 'reti', 'retn'].includes(inst.tag)) {
      stopReason = 'return';
      break;
    }
    if (['ret-conditional', 'jr', 'jp', 'jr-conditional', 'jp-conditional', 'djnz', 'jp-indirect', 'halt', 'slp'].includes(inst.tag)) {
      stopReason = inst.tag;
      break;
    }
    pc = nextPc;
  }

  if (rows.length >= budget) stopReason = 'instruction budget reached';
  return { start, rows, aggregate, branches, stopReason };
}

function walk(memory, start, opts) {
  const pending = [];
  const queued = new Set();
  const seen = new Set();
  const incoming = new Map();
  const blocks = [];
  const callTargets = new Map();
  let decoded = 0;

  function noteIncoming(addr, reason) {
    if (!incoming.has(addr)) incoming.set(addr, new Set());
    if (reason) incoming.get(addr).add(reason);
  }

  function enqueue(addr, reason) {
    if (!Number.isInteger(addr) || addr < 0 || addr >= opts.romLimit) return;
    noteIncoming(addr, reason);
    if (seen.has(addr) || queued.has(addr)) return;
    pending.push(addr);
    queued.add(addr);
  }

  enqueue(start, 'entry');

  while (pending.length > 0 && decoded < opts.limit) {
    const addr = pending.shift();
    queued.delete(addr);
    if (seen.has(addr)) continue;
    seen.add(addr);
    const block = decodeBlock(memory, addr, opts.mode ?? MODE, opts.limit - decoded, opts);
    block.incoming = [...(incoming.get(addr) ?? [])].sort();
    blocks.push(block);
    decoded += block.rows.length;
    for (const call of block.aggregate.calls) {
      if (!callTargets.has(call.target)) callTargets.set(call.target, new Set());
      callTargets.get(call.target).add(`${hex(call.pc)} ${call.text}`);
    }
    for (const branch of block.branches) enqueue(branch.target, branch.reason);
  }

  blocks.sort((a, b) => a.start - b.start);
  return {
    start,
    label: opts.label ?? hex(start),
    blocks,
    callTargets,
    decoded,
    limit: opts.limit,
    truncated: decoded >= opts.limit && pending.length > 0,
  };
}

function collectSubroutines(memory, romLimit, rootResult, rootStarts) {
  const reports = [];
  for (const [target, sites] of [...rootResult.callTargets.entries()].sort((a, b) => a[0] - b[0])) {
    if (rootStarts.has(target) && target === rootResult.start) {
      reports.push({ target, callSites: [...sites].sort(), reuseRoot: true, rootLabel: rootResult.label });
      continue;
    }
    if (target >= romLimit) {
      reports.push({ target, callSites: [...sites].sort(), skipped: `target outside ROM image (${hex(target)})` });
      continue;
    }
    reports.push({
      target,
      callSites: [...sites].sort(),
      analysis: walk(memory, target, { label: `subroutine ${hex(target)}`, limit: SUB_LIMIT, romLimit, mode: MODE, stopOnDirectJp: false }),
    });
  }
  return reports;
}

function sortedMapValues(map, space = null) {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([addr]) => space === null || classifyAddress(addr) === space)
    .map(([, label]) => label);
}

function sortedSetValues(set) {
  return [...set].sort((a, b) => String(a).localeCompare(String(b)));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function formatList(items, max = 12) {
  const values = unique(items);
  if (values.length === 0) return 'none';
  if (values.length <= max) return values.join(', ');
  return `${values.slice(0, max).join(', ')} ... (+${values.length - max} more)`;
}

function flattenAggregate(result) {
  const aggregate = createAggregate();
  for (const block of result.blocks) mergeAggregate(aggregate, block.aggregate);
  return aggregate;
}

function printSummary(result) {
  const aggregate = flattenAggregate(result);
  const ramReads = sortedMapValues(aggregate.absReads, 'RAM');
  const ramWrites = sortedMapValues(aggregate.absWrites, 'RAM');
  const allAbsReads = sortedMapValues(aggregate.absReads);
  const allAbsWrites = sortedMapValues(aggregate.absWrites);
  const otherReads = allAbsReads.filter((item) => !ramReads.includes(item));
  const otherWrites = allAbsWrites.filter((item) => !ramWrites.includes(item));
  const branches = aggregate.jumps
    .filter((jump) => jump.conditional)
    .map((jump) => `${jump.text} (fallthrough ${hex(jump.fallthrough)})`);

  console.log(`Decoded ${count(result.decoded)} instructions across ${count(result.blocks.length)} reachable blocks${result.truncated ? ` (truncated at ${count(result.limit)})` : ''}.`);
  console.log(`Register/stack activity: ${formatList([...aggregate.setupOps, ...aggregate.stackOps], 16)}`);
  console.log(`Registers touched: ${formatList(sortedSetValues(aggregate.registers), 20)}`);
  console.log(`Absolute RAM reads: ${formatList(ramReads)}`);
  console.log(`Absolute RAM writes: ${formatList(ramWrites)}`);
  console.log(`Other absolute reads: ${formatList(otherReads)}`);
  console.log(`Other absolute writes: ${formatList(otherWrites)}`);
  console.log(`Symbolic reads: ${formatList(sortedSetValues(aggregate.symReads))}`);
  console.log(`Symbolic writes: ${formatList(sortedSetValues(aggregate.symWrites))}`);
  console.log(`Port reads: ${formatList(sortedSetValues(aggregate.portReads))}`);
  console.log(`Port writes: ${formatList(sortedSetValues(aggregate.portWrites))}`);
  console.log(`CALL targets: ${formatList(aggregate.calls.map((call) => call.text), 16)}`);
  console.log(`JP/JR targets: ${formatList(aggregate.jumps.map((jump) => jump.text), 16)}`);
  console.log(`Branch conditions: ${formatList(branches, 16)}`);
}

function printBlock(block) {
  const ramReads = sortedMapValues(block.aggregate.absReads, 'RAM');
  const ramWrites = sortedMapValues(block.aggregate.absWrites, 'RAM');
  const allAbsReads = sortedMapValues(block.aggregate.absReads);
  const allAbsWrites = sortedMapValues(block.aggregate.absWrites);
  const otherReads = allAbsReads.filter((item) => !ramReads.includes(item));
  const otherWrites = allAbsWrites.filter((item) => !ramWrites.includes(item));
  const branches = block.aggregate.jumps
    .filter((jump) => jump.conditional)
    .map((jump) => `${jump.text} (fallthrough ${hex(jump.fallthrough)})`);

  console.log(`Block ${hex(block.start)}${block.incoming.length > 0 ? `  [incoming: ${block.incoming.join('; ')}]` : ''}`);
  for (const row of block.rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
  console.log(`  RAM reads: ${formatList(ramReads)}`);
  console.log(`  RAM writes: ${formatList(ramWrites)}`);
  console.log(`  Other absolute reads: ${formatList(otherReads)}`);
  console.log(`  Other absolute writes: ${formatList(otherWrites)}`);
  console.log(`  Symbolic reads: ${formatList(sortedSetValues(block.aggregate.symReads))}`);
  console.log(`  Symbolic writes: ${formatList(sortedSetValues(block.aggregate.symWrites))}`);
  console.log(`  Port reads: ${formatList(sortedSetValues(block.aggregate.portReads))}`);
  console.log(`  Port writes: ${formatList(sortedSetValues(block.aggregate.portWrites))}`);
  console.log(`  CALL targets: ${formatList(block.aggregate.calls.map((call) => call.text))}`);
  console.log(`  JP/JR targets: ${formatList(block.aggregate.jumps.map((jump) => jump.text))}`);
  console.log(`  Branch conditions: ${formatList(branches)}`);
  console.log(`  Stop reason: ${block.stopReason}`);
  console.log('');
}

function printReport(result, subroutines) {
  console.log('='.repeat(96));
  console.log(result.label);
  console.log('='.repeat(96));
  printSummary(result);
  console.log('');
  console.log('Reachable blocks:');
  console.log('');
  for (const block of result.blocks) printBlock(block);

  console.log('Called subroutines (first 20 instructions each):');
  console.log('');
  if (subroutines.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const report of subroutines) {
    console.log(`Subroutine ${hex(report.target)}  [called from: ${formatList(report.callSites, 8)}]`);
    if (report.reuseRoot) {
      console.log(`  Covered by the primary disassembly section for ${report.rootLabel}.`);
      console.log('');
      continue;
    }
    if (report.skipped) {
      console.log(`  Skipped: ${report.skipped}`);
      console.log('');
      continue;
    }
    printSummary(report.analysis);
    console.log('');
    for (const block of report.analysis.blocks) printBlock(block);
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const memory = createMemoryImage(romBytes);
const rootStarts = new Set(TARGETS.map((target) => target.addr));

console.log('Phase 375 - Static normal key dispatch disassembly');
console.log(`ROM: ${ROM_PATH}`);
console.log('Notes: direct absolute addresses are labeled as ROM/RAM/MMIO; indexed and indirect accesses remain symbolic.');
console.log('');

for (const target of TARGETS) {
  const result = walk(memory, target.addr, {
    label: target.label,
    limit: ROOT_LIMIT,
    romLimit: romBytes.length,
    mode: MODE,
    stopOnDirectJp: target.stopOnDirectJp,
  });
  const subroutines = collectSubroutines(memory, romBytes.length, result, rootStarts);
  printReport(result, subroutines);
}
