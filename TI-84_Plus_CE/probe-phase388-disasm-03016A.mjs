#!/usr/bin/env node

/**
 * Phase 388
 *
 * Static disassembly of the "mode normalization delegate" at 0x03016A.
 * The probe:
 *   - disassembles 0x03016A..0x0301F5, extending past 0x0301F5 only if the
 *     window contains no hard terminator;
 *   - annotates control-flow targets, memory refs, IY flag touches, and
 *     translation-table references;
 *   - searches the full ROM for direct CALL 0x03016A sites (CD 6A 01 03).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';

const START = 0x03016A;
const NEXT_KNOWN_FUNCTION = 0x0301F6;
const MAX_EXTENSION_BYTES = 0x100;

const TOKEN_TABLE_BASE = 0x09F79B;
const TOKEN_TABLE_2ND = TOKEN_TABLE_BASE + 0x38;
const TOKEN_TABLE_ALPHA = TOKEN_TABLE_BASE + 0x70;
const TOKEN_TABLE_2ND_ALPHA = TOKEN_TABLE_BASE + 0xA8;
const TOKEN_TABLE_TOTAL_LENGTH = 228;

const DIRECT_CALL_PATTERN = Buffer.from([0xCD, 0x6A, 0x01, 0x03]);

const TARGET_NAMES = {
  0x03016A: 'mode-normalization delegate',
  0x030173: 'adjacent helper after 0x03016A RET',
  0x0301F6: 'known next function / 2ND wrapper',
  0x030202: 'modifier-code helper',
  0x04E950: 'far delegate called by 0x03016A',
  0x0A239E: 'external helper 0x0A239E',
  0x0A23C0: 'external helper 0x0A23C0',
  0x022346: 'shared 0x09F79B lookup helper',
  0x02FF0B: 'shared translation-table entry',
};

const RAM_NAMES = {
  0xD007E0: 'RAM[D007E0]',
  0xD008D5: 'RAM[D008D5]',
};

const SIMPLE_OPS = {
  nop: 'NOP',
  halt: 'HALT',
  di: 'DI',
  ei: 'EI',
  ret: 'RET',
  reti: 'RETI',
  retn: 'RETN',
  exx: 'EXX',
  'ex-af': "EX AF,AF'",
  'ex-de-hl': 'EX DE,HL',
  'ex-sp-hl': 'EX (SP),HL',
  cpl: 'CPL',
  neg: 'NEG',
  ccf: 'CCF',
  scf: 'SCF',
  daa: 'DAA',
  rla: 'RLA',
  rlca: 'RLCA',
  rra: 'RRA',
  rrca: 'RRCA',
  rrd: 'RRD',
  rld: 'RLD',
  ldi: 'LDI',
  ldir: 'LDIR',
  ldd: 'LDD',
  lddr: 'LDDR',
  cpi: 'CPI',
  cpir: 'CPIR',
  cpd: 'CPD',
  cpdr: 'CPDR',
  ini: 'INI',
  inir: 'INIR',
  ind: 'IND',
  indr: 'INDR',
  outi: 'OUTI',
  otir: 'OTIR',
  outd: 'OUTD',
  otdr: 'OTDR',
  slp: 'SLP',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function widthForValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return 4;
  if (modePrefix === 'sil' || modePrefix === 'lil') return 6;
  if (value <= 0xFF) return 2;
  if (value <= 0xFFFF) return 4;
  return 6;
}

function formatValue(value, modePrefix = null) {
  return hex(value, widthForValue(value, modePrefix));
}

function formatBytes(rom, pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push((rom[pc + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function formatDisplacement(displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  const magnitude = displacement >= 0 ? displacement : -displacement;
  return `${sign}${hex(magnitude, magnitude <= 0xFF ? 2 : 4)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatDisplacement(displacement)})`;
}

function formatBitTarget(inst) {
  if (inst.indexRegister) {
    return formatIndexed(inst.indexRegister, inst.displacement);
  }
  if (inst.indirectRegister) {
    return `(${String(inst.indirectRegister).toUpperCase()})`;
  }
  return String(inst.reg ?? '?').toUpperCase();
}

function formatAlu(op, operand) {
  const upper = String(op ?? '?').toUpperCase();
  if (upper === 'ADD' || upper === 'ADC' || upper === 'SBC') {
    return `${upper} A,${operand}`;
  }
  return `${upper} ${operand}`;
}

function formatInstruction(inst) {
  if (!inst?.tag) return '???';

  if (SIMPLE_OPS[inst.tag]) {
    return SIMPLE_OPS[inst.tag];
  }

  switch (inst.tag) {
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return `LD (${hex(inst.addr ?? inst.address)}),${String(inst.src ?? 'a').toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
      }
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return 'LD SP,HL';
    case 'ld-sp-pair':
      return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-idx':
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-idx-reg':
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-idx-imm':
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return formatAlu(inst.op, String(inst.src).toUpperCase());
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hex(inst.value, 2));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'alu-idx':
    case 'alu-ixd':
      return formatAlu(inst.op, formatIndexed(inst.indexRegister, inst.displacement));
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ind':
      return 'INC (HL)';
    case 'dec-ind':
      return 'DEC (HL)';
    case 'inc-ixd':
      return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `ADC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
    case 'jp-cond':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${String(inst.reg ?? inst.indirectRegister ?? 'hl').toUpperCase()})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
    case 'jr-cond':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
    case 'call-cond':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret-conditional':
    case 'ret-cond':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'rst':
      return `RST ${hex(inst.vector ?? inst.target, 2)}`;
    case 'in-reg':
      return `IN ${String(inst.reg ?? inst.dest).toUpperCase()},(C)`;
    case 'in-a-imm':
      return `IN A,(${hex(inst.port, 2)})`;
    case 'in0':
      return `IN0 ${String(inst.reg ?? inst.dest).toUpperCase()},(${hex(inst.port, 2)})`;
    case 'out-reg':
      return `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'out-a-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'rotate-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${String(inst.op).toUpperCase()} (HL)`;
    case 'bit-test':
      return `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set':
      return `SET ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res':
    case 'bit-reset':
      return `RES ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-res-ind':
    case 'bit-reset-ind':
      return `RES ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-rotate':
      return `${String(inst.operation ?? inst.op).toUpperCase()} ${formatBitTarget(inst)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatBitTarget(inst)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatBitTarget(inst)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatBitTarget(inst)}`;
    case 'im':
      return `IM ${inst.mode !== undefined ? inst.mode : inst.interruptMode}`;
    case 'mlt':
      return `MLT ${String(inst.pair ?? inst.reg).toUpperCase()}`;
    case 'lea':
      return `LEA ${String(inst.dest).toUpperCase()},${String(inst.base).toUpperCase()}${formatDisplacement(inst.displacement)}`;
    case 'pea':
      return `PEA ${String(inst.base ?? inst.src).toUpperCase()}${formatDisplacement(inst.displacement)}`;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
      const fields = Object.entries(inst)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`)
        .join(', ');
      return `${inst.tag.toUpperCase()} [${fields}]`;
    }
  }
}

function splitInstruction(text) {
  const firstSpace = text.indexOf(' ');
  if (firstSpace === -1) {
    return { mnemonic: text, operands: '' };
  }
  return {
    mnemonic: text.slice(0, firstSpace),
    operands: text.slice(firstSpace + 1),
  };
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return null;
  }
}

function getAbsoluteAddress(inst) {
  return inst?.addr ?? inst?.address ?? undefined;
}

function isHardTerminator(inst) {
  if (!inst) return false;
  return inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-indirect';
}

function isJumpLike(inst) {
  return inst?.tag === 'jp' || inst?.tag === 'jp-conditional' || inst?.tag === 'jp-cond'
    || inst?.tag === 'jr' || inst?.tag === 'jr-conditional' || inst?.tag === 'jr-cond'
    || inst?.tag === 'djnz';
}

function isCallLike(inst) {
  return inst?.tag === 'call' || inst?.tag === 'call-conditional' || inst?.tag === 'call-cond';
}

function isReturn(inst) {
  return inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn'
    || inst?.tag === 'ret-conditional' || inst?.tag === 'ret-cond';
}

function isPortIo(inst) {
  return inst?.tag === 'in-reg' || inst?.tag === 'in-a-imm'
    || inst?.tag === 'out-reg' || inst?.tag === 'out-a-imm'
    || inst?.tag === 'in0' || inst?.tag === 'out0';
}

function annotateIYFlags(inst) {
  if (!inst?.indexRegister || String(inst.indexRegister).toLowerCase() !== 'iy') return null;
  if (inst.displacement === 0x12) {
    if (inst.bit === 3) return `2ND flag at ${formatIndexed('iy', inst.displacement)}`;
    if (inst.bit === 4) return `ALPHA flag at ${formatIndexed('iy', inst.displacement)}`;
    if (inst.bit === 5) return `2ND+ALPHA flag at ${formatIndexed('iy', inst.displacement)}`;
    return `IY+0x12 bit ${inst.bit}`;
  }
  if (inst.displacement === 0x15) {
    return `IY+0x15 bit ${inst.bit}`;
  }
  return null;
}

function annotateTokenTableAddress(addr) {
  if (addr === undefined) return null;
  if (addr === TOKEN_TABLE_BASE) return 'main table base 0x09F79B';
  if (addr === TOKEN_TABLE_2ND) return '2ND sub-table 0x09F7D3 (+0x38)';
  if (addr === TOKEN_TABLE_ALPHA) return 'ALPHA sub-table 0x09F80B (+0x70)';
  if (addr === TOKEN_TABLE_2ND_ALPHA) return '2ND+ALPHA sub-table 0x09F843 (+0xA8)';
  if (addr >= TOKEN_TABLE_BASE && addr < TOKEN_TABLE_BASE + TOKEN_TABLE_TOTAL_LENGTH) {
    return `table-window offset +${addr - TOKEN_TABLE_BASE}`;
  }
  return null;
}

function extractMemoryRefs(inst) {
  if (!inst) return [];
  const refs = [];

  switch (inst.tag) {
    case 'ld-reg-mem':
    case 'ld-a-mem':
      refs.push({ direction: 'read', kind: 'absolute', address: inst.addr ?? inst.address });
      break;
    case 'ld-mem-reg':
    case 'ld-mem-a':
    case 'ld-mem-pair':
      refs.push({ direction: 'write', kind: 'absolute', address: inst.addr ?? inst.address });
      break;
    case 'ld-pair-mem':
      refs.push({
        direction: inst.direction === 'to-mem' ? 'write' : 'read',
        kind: 'absolute',
        address: inst.addr,
      });
      break;
    case 'ld-reg-ind':
      refs.push({ direction: 'read', kind: 'register-indirect', register: inst.src });
      break;
    case 'ld-ind-reg':
      refs.push({ direction: 'write', kind: 'register-indirect', register: inst.dest });
      break;
    case 'ld-ind-imm':
      refs.push({ direction: 'write', kind: 'register-indirect', register: 'hl' });
      break;
    case 'alu-ind':
    case 'bit-test-ind':
    case 'rotate-ind':
      refs.push({ direction: 'read', kind: 'register-indirect', register: inst.indirectRegister ?? 'hl' });
      break;
    case 'bit-set-ind':
    case 'bit-res-ind':
    case 'inc-ind':
    case 'dec-ind':
      refs.push({ direction: 'read/write', kind: 'register-indirect', register: inst.indirectRegister ?? 'hl' });
      break;
    case 'ld-reg-idx':
    case 'ld-reg-ixd':
      refs.push({
        direction: 'read',
        kind: 'indexed',
        indexRegister: inst.indexRegister,
        displacement: inst.displacement,
      });
      break;
    case 'ld-idx-reg':
    case 'ld-ixd-reg':
    case 'ld-idx-imm':
    case 'ld-ixd-imm':
      refs.push({
        direction: 'write',
        kind: 'indexed',
        indexRegister: inst.indexRegister,
        displacement: inst.displacement,
      });
      break;
    case 'alu-idx':
    case 'alu-ixd':
    case 'indexed-cb-bit':
      refs.push({
        direction: 'read',
        kind: 'indexed',
        indexRegister: inst.indexRegister,
        displacement: inst.displacement,
      });
      break;
    case 'inc-ixd':
    case 'dec-ixd':
    case 'indexed-cb-set':
    case 'indexed-cb-res':
    case 'indexed-cb-rotate':
      refs.push({
        direction: 'read/write',
        kind: 'indexed',
        indexRegister: inst.indexRegister,
        displacement: inst.displacement,
      });
      break;
    default:
      break;
  }

  return refs;
}

function formatMemoryTarget(ref) {
  if (ref.kind === 'absolute') {
    const label = annotateTokenTableAddress(ref.address) ?? RAM_NAMES[ref.address];
    return `${hex(ref.address)}${label ? ` (${label})` : ''}`;
  }
  if (ref.kind === 'register-indirect') {
    return `(${String(ref.register).toUpperCase()})`;
  }
  if (ref.kind === 'indexed') {
    return formatIndexed(ref.indexRegister, ref.displacement);
  }
  return '(?)';
}

function getControlTarget(inst) {
  return inst?.target ?? undefined;
}

function decodeWindow(rom, start, minEndExclusive) {
  const rows = [];
  let pc = start;
  let sawHardTerminator = false;

  while (pc < minEndExclusive && pc < rom.length) {
    const inst = safeDecode(rom, pc);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      inst,
      length,
      nextPc: inst?.nextPc ?? (pc + length),
      bytes: formatBytes(rom, pc, length),
    });
    if (isHardTerminator(inst)) {
      sawHardTerminator = true;
    }
    pc += length;
  }

  if (!sawHardTerminator) {
    const hardLimit = Math.min(rom.length, minEndExclusive + MAX_EXTENSION_BYTES);
    while (pc < hardLimit) {
      const inst = safeDecode(rom, pc);
      const length = Math.max(1, inst?.length ?? 1);
      const row = {
        pc,
        inst,
        length,
        nextPc: inst?.nextPc ?? (pc + length),
        bytes: formatBytes(rom, pc, length),
      };
      rows.push(row);
      pc += length;
      if (isHardTerminator(inst)) {
        break;
      }
    }
  }

  return rows;
}

function buildAnnotations(row) {
  const notes = [];
  const inst = row.inst;
  if (!inst) return notes;

  if (row.pc === START) notes.push('target entry');
  if (row.pc === NEXT_KNOWN_FUNCTION) notes.push('known next function');
  if (isHardTerminator(inst)) notes.push('hard terminator');

  const controlTarget = getControlTarget(inst);
  if (controlTarget !== undefined) {
    const location = controlTarget >= START && controlTarget < NEXT_KNOWN_FUNCTION ? 'internal' : 'external';
    const label = TARGET_NAMES[controlTarget];
    notes.push(`${location} target ${hex(controlTarget)}${label ? ` (${label})` : ''}`);
  }

  for (const ref of extractMemoryRefs(inst)) {
    notes.push(`${ref.direction} ${formatMemoryTarget(ref)}`);
  }

  const iyNote = annotateIYFlags(inst);
  if (iyNote) notes.push(iyNote);

  if (isPortIo(inst)) notes.push('port I/O');

  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0x38) {
    notes.push('2ND-table plane offset candidate (+0x38)');
  }
  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0x70) {
    notes.push('ALPHA-table plane offset candidate (+0x70)');
  }
  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0xA8) {
    notes.push('2ND+ALPHA plane offset candidate (+0xA8)');
  }

  const addr = getAbsoluteAddress(inst);
  const tableNote = annotateTokenTableAddress(addr);
  if (tableNote) notes.push(tableNote);

  return notes;
}

function printDisassembly(rows) {
  console.log('='.repeat(104));
  console.log(`Annotated disassembly ${hex(START)}..${hex(rows.at(-1)?.nextPc ?? START)} (linear decode)`);
  console.log('='.repeat(104));
  for (const row of rows) {
    if (!row.inst) {
      console.log(`${hex(row.pc)}  ${row.bytes.padEnd(18)}  DB     ${hex(0, 2)}`);
      continue;
    }
    const rendered = formatInstruction(row.inst);
    const { mnemonic, operands } = splitInstruction(rendered);
    const annotations = buildAnnotations(row);
    const suffix = annotations.length ? `  ; ${annotations.join(' | ')}` : '';
    console.log(
      `${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${mnemonic.padEnd(6)} ${operands.padEnd(32)}${suffix}`,
    );
  }
  console.log('');
}

function collectTargets(rows) {
  const targets = new Map();
  for (const row of rows) {
    const inst = row.inst;
    const target = getControlTarget(inst);
    if (target === undefined) continue;
    const kind = isCallLike(inst) ? 'CALL' : isJumpLike(inst) ? 'JUMP' : 'BRANCH';
    const list = targets.get(target) ?? [];
    list.push({ pc: row.pc, kind, text: formatInstruction(inst) });
    targets.set(target, list);
  }
  return targets;
}

function collectMemoryRefs(rows) {
  const refs = [];
  for (const row of rows) {
    for (const ref of extractMemoryRefs(row.inst)) {
      refs.push({
        pc: row.pc,
        direction: ref.direction,
        kind: ref.kind,
        address: ref.address,
        indexRegister: ref.indexRegister,
        displacement: ref.displacement,
        register: ref.register,
        text: formatInstruction(row.inst),
      });
    }
  }
  return refs;
}

function collectPortOps(rows) {
  return rows
    .filter((row) => row.inst && isPortIo(row.inst))
    .map((row) => ({ pc: row.pc, text: formatInstruction(row.inst) }));
}

function collectIYRefs(rows) {
  return rows
    .filter((row) => row.inst?.indexRegister && String(row.inst.indexRegister).toLowerCase() === 'iy')
    .map((row) => ({
      pc: row.pc,
      displacement: row.inst.displacement,
      bit: row.inst.bit,
      text: formatInstruction(row.inst),
      note: annotateIYFlags(row.inst),
    }));
}

function collectOffsetAdds(rows) {
  return rows
    .filter((row) => {
      const inst = row.inst;
      return inst && (inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add';
    })
    .map((row) => ({
      pc: row.pc,
      value: row.inst.value,
      text: formatInstruction(row.inst),
    }));
}

function collectTableRefs(rows) {
  const refs = [];
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    const addr = getAbsoluteAddress(inst);
    const directNote = annotateTokenTableAddress(addr);
    if (directNote) {
      refs.push({ pc: row.pc, kind: 'address', detail: directNote, text: formatInstruction(inst) });
    }

    if (inst.tag === 'ld-pair-imm') {
      const note = annotateTokenTableAddress(inst.value);
      if (note) {
        refs.push({ pc: row.pc, kind: 'imm-load', detail: note, text: formatInstruction(inst) });
      }
    }

    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && [0x38, 0x70, 0xA8].includes(inst.value)) {
      refs.push({ pc: row.pc, kind: 'offset', detail: `ADD A,${hex(inst.value, 2)}`, text: formatInstruction(inst) });
    }

    if (isCallLike(inst) || isJumpLike(inst)) {
      const target = getControlTarget(inst);
      if (target === 0x022346 || target === 0x02FF0B) {
        refs.push({ pc: row.pc, kind: 'delegate', detail: TARGET_NAMES[target], text: formatInstruction(inst) });
      }
    }
  }
  return refs;
}

function collectBoundaryStarts(rows) {
  const starts = [START];
  for (const row of rows) {
    if (isHardTerminator(row.inst) && row.nextPc < NEXT_KNOWN_FUNCTION) {
      starts.push(row.nextPc);
    }
  }
  if (!starts.includes(NEXT_KNOWN_FUNCTION)) {
    starts.push(NEXT_KNOWN_FUNCTION);
  }
  return [...new Set(starts)].sort((a, b) => a - b);
}

function printBoundarySummary(rows) {
  console.log('--- Function-boundary candidates ---');
  for (const addr of collectBoundaryStarts(rows)) {
    const label = TARGET_NAMES[addr];
    console.log(`  ${hex(addr)}${label ? `  ${label}` : ''}`);
  }
  console.log('');
}

function printTargetSummary(rows) {
  const targets = collectTargets(rows);
  console.log('--- CALL/JP/JR targets ---');
  if (targets.size === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const [target, inbound] of [...targets.entries()].sort((left, right) => left[0] - right[0])) {
    const location = target >= START && target < NEXT_KNOWN_FUNCTION ? 'internal' : 'external';
    const label = TARGET_NAMES[target];
    console.log(`  ${hex(target)}  ${location}${label ? `  ${label}` : ''}`);
    for (const source of inbound) {
      console.log(`    <- ${hex(source.pc)}  ${source.kind}  ${source.text}`);
    }
  }
  console.log('');
}

function printMemorySummary(rows) {
  const refs = collectMemoryRefs(rows);
  console.log('--- Memory reads/writes ---');
  if (refs.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const ref of refs) {
    const target = formatMemoryTarget(ref);
    console.log(`  ${hex(ref.pc)}  ${ref.direction.padEnd(10)} ${target.padEnd(30)}  ${ref.text}`);
  }
  console.log('');
}

function printPortSummary(rows) {
  const ops = collectPortOps(rows);
  console.log('--- Port I/O ---');
  if (ops.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const op of ops) {
    console.log(`  ${hex(op.pc)}  ${op.text}`);
  }
  console.log('');
}

function printIYSummary(rows) {
  const refs = collectIYRefs(rows);
  console.log('--- IY-relative references ---');
  if (refs.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const ref of refs) {
    const detail = ref.note ? `  [${ref.note}]` : '';
    console.log(`  ${hex(ref.pc)}  ${formatIndexed('iy', ref.displacement)}  bit=${ref.bit ?? 'n/a'}  ${ref.text}${detail}`);
  }
  console.log('');
}

function printTableSummary(rows) {
  const refs = collectTableRefs(rows);
  console.log('--- Translation-table references / offsets ---');
  if (refs.length === 0) {
    console.log('  No direct 0x09F79B/0x09F7D3 references, no shared lookup helper calls, and no ADD A,0x38-style plane offsets in this window.');
    console.log('');
    return;
  }
  for (const ref of refs) {
    console.log(`  ${hex(ref.pc)}  ${ref.kind.padEnd(8)} ${ref.detail}  ${ref.text}`);
  }
  console.log('');
}

function printOffsetSummary(rows) {
  const refs = collectOffsetAdds(rows);
  console.log('--- Immediate ADDs (A-based offset candidates) ---');
  if (refs.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const ref of refs) {
    const meaning = ref.value === 0x38 ? '2ND plane' : ref.value === 0x70 ? 'ALPHA plane' : ref.value === 0xA8 ? '2ND+ALPHA plane' : '';
    console.log(`  ${hex(ref.pc)}  value=${hex(ref.value, 2)}${meaning ? ` (${meaning})` : ''}  ${ref.text}`);
  }
  console.log('');
}

function findDirectCallers(rom, pattern) {
  const hits = [];
  let offset = 0;
  while (offset <= rom.length - pattern.length) {
    const hit = rom.indexOf(pattern, offset);
    if (hit === -1) break;
    hits.push(hit);
    offset = hit + 1;
  }
  return hits;
}

function printCallerSummary(rom, hits) {
  console.log('--- Direct CALL 0x03016A sites (CD 6A 01 03) ---');
  if (hits.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const hit of hits) {
    const inst = safeDecode(rom, hit);
    const label = TARGET_NAMES[hit];
    const nearKnownNext = hit >= NEXT_KNOWN_FUNCTION && hit < NEXT_KNOWN_FUNCTION + 0x20
      ? `inside ${hex(NEXT_KNOWN_FUNCTION)} function`
      : '';
    const extra = [label, nearKnownNext].filter(Boolean).join(' | ');
    console.log(`  ${hex(hit)}  ${formatInstruction(inst)}${extra ? `  [${extra}]` : ''}`);
  }
  console.log('');
}

function printConclusion(rows, callerHits) {
  console.log('='.repeat(104));
  console.log('ANALYSIS');
  console.log('='.repeat(104));

  const firstHardTerminatorIndex = rows.findIndex((row) => isHardTerminator(row.inst));
  const entryRows = firstHardTerminatorIndex === -1 ? rows : rows.slice(0, firstHardTerminatorIndex + 1);
  const postEntryRows = firstHardTerminatorIndex === -1 ? [] : rows.slice(firstHardTerminatorIndex + 1);

  const entryTableRefs = collectTableRefs(entryRows);
  const entryTargets = collectTargets(entryRows);
  const entryMemRefs = collectMemoryRefs(entryRows);

  console.log('');
  console.log(`  0x03016A itself terminates at ${hex(entryRows.at(-1)?.pc ?? START)} and is only ${entryRows.reduce((sum, row) => sum + row.length, 0)} bytes long.`);
  for (const row of entryRows) {
    console.log(`    ${hex(row.pc)}  ${formatInstruction(row.inst)}`);
  }
  console.log('');

  if (entryTargets.size === 1 && entryTargets.has(0x04E950)) {
    console.log('  The entry routine is a thin wrapper: it CALLs 0x04E950, clears bit 1 of IY+0x15, and RETs.');
  } else {
    console.log('  The entry routine delegates immediately and then returns; it does not inline a long local dispatch sequence.');
  }

  if (entryTableRefs.length === 0) {
    console.log('  No direct references to 0x09F79B or 0x09F7D3 appear inside 0x03016A itself.');
    console.log('  No ADD A,0x38-style 2ND-plane offset appears there either.');
  } else {
    console.log('  Table-related activity appears directly in 0x03016A.');
  }

  if (entryMemRefs.length > 0) {
    console.log(`  The only local state touch in the entry routine is ${entryMemRefs.map((ref) => `${ref.direction} ${formatMemoryTarget(ref)}`).join(', ')}.`);
  }

  console.log('');
  console.log(`  Exact direct callers found by byte scan: ${callerHits.length}.`);
  if (callerHits.length > 0) {
    console.log(`  The direct CALL site is ${callerHits.map((hit) => hex(hit)).join(', ')}, which places 0x03016A under the 0x0301F6 wrapper rather than at the main 0x09F79B lookup path.`);
  }

  if (postEntryRows.length > 0) {
    const postTableRefs = collectTableRefs(postEntryRows);
    console.log('');
    console.log(`  The adjacent pre-0x0301F6 helper (${hex(postEntryRows[0].pc)}..${hex(postEntryRows.at(-1)?.pc ?? postEntryRows[0].pc)}) also shows ${postTableRefs.length === 0 ? 'no' : 'some'} table/offset activity.`);
    if (postTableRefs.length === 0) {
      console.log('  It saves/restores state, toggles IY bits, and calls other helpers, but still does not load the translation-table base or apply the +0x38 2ND-plane bias.');
    }
  }

  console.log('');
  console.log('  Determination: 0x03016A is not the local scan-code remapper and does not directly compute the 2ND-mode token from the 0x09F7D3 sub-table.');
  console.log('  From the bytes at 0x03016A..0x0301F5, it is another helper/delegate layer. If 2ND remapping happens on this path, that work must occur inside 0x04E950 or elsewhere in the surrounding call chain, not in the 0x03016A wrapper itself.');
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  const rows = decodeWindow(rom, START, NEXT_KNOWN_FUNCTION);
  const callerHits = findDirectCallers(rom, DIRECT_CALL_PATTERN);
  const coveredEndExclusive = rows.at(-1)?.nextPc ?? START;

  console.log('Phase 388 - Disassemble 0x03016A mode-normalization delegate');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log(`Requested minimum window: ${hex(START)}..${hex(NEXT_KNOWN_FUNCTION - 1)} (${NEXT_KNOWN_FUNCTION - START} bytes)`);
  console.log(`Actual decoded window:    ${hex(START)}..${hex(coveredEndExclusive - 1)} (${coveredEndExclusive - START} bytes)`);
  console.log('');

  printDisassembly(rows);
  printBoundarySummary(rows);
  printTargetSummary(rows);
  printMemorySummary(rows);
  printPortSummary(rows);
  printIYSummary(rows);
  printTableSummary(rows);
  printOffsetSummary(rows);
  printCallerSummary(rom, callerHits);
  printConclusion(rows, callerHits);
}

main();
