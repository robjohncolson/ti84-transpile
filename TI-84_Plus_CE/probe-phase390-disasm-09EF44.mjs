#!/usr/bin/env node

/**
 * Phase 390
 *
 * Static disassembly of 0x09EF44, a deep callee from 0x04E950.
 * Sessions 388-389 traced 0x03016A -> 0x04E950 -> 0x09EF44.
 * Neither 0x03016A nor 0x04E950 contains the 2ND translation table lookup.
 * 0x09EF44 is the next candidate -- called by 0x04E950 with BC=0x020F,
 * HL=0x0121, DE=0x012A.
 *
 * The probe:
 *   - BFS-disassembles 0x09EF44 following all branches and call targets;
 *   - checks for references to the 2ND sub-table at 0x09F7D3;
 *   - checks for references to the main translation table at 0x09F79B;
 *   - checks for ADD A,0x38 (2ND-mode plane offset);
 *   - documents RAM reads/writes, IY flag touches, external calls;
 *   - searches the full ROM for direct CALL 0x09EF44 sites;
 *   - reports function size (start to last RET).
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

const START = 0x09EF44;
const MAX_INSTRUCTIONS = 500;
const MAX_DECODE_BYTES = 0x1000;
const BFS_MAX_DEPTH = 8;

const TOKEN_TABLE_BASE = 0x09F79B;
const TOKEN_TABLE_2ND = 0x09F7D3;
const TOKEN_TABLE_ALPHA = TOKEN_TABLE_BASE + 0x70;
const TOKEN_TABLE_2ND_ALPHA = TOKEN_TABLE_BASE + 0xA8;
const TOKEN_TABLE_TOTAL_LENGTH = 228;

const DIRECT_CALL_PATTERN = Buffer.from([0xCD, 0x44, 0xEF, 0x09]);

const TARGET_NAMES = {
  0x03016A: 'mode-normalization delegate',
  0x0301F6: '2ND wrapper',
  0x04E950: 'far delegate (caller)',
  0x09EF44: 'this function',
  0x09F79B: 'main translation table base',
  0x09F7D3: '2ND sub-table',
  0x022346: 'shared 0x09F79B lookup helper',
  0x02FF0B: 'shared translation-table entry',
  0x0A239E: 'external helper 0x0A239E',
  0x0A23C0: 'external helper 0x0A23C0',
};

const RAM_NAMES = {
  0xD007E0: 'kbdKey / scancode buffer',
  0xD008D5: 'RAM[D008D5]',
  0xD00587: 'kbdScanCode',
  0xD0058C: 'kbdLGSC',
  0xD0058E: 'kbdPSC',
  0xD00590: 'kbdWUR',
  0xD00080: 'flags',
  0xD40000: 'VRAM base',
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
  return `IY+${hex(inst.displacement, 2)} bit ${inst.bit ?? 'n/a'}`;
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

// BFS disassembly: follows branches, conditional jumps, and fallthrough paths
function bfsDisassemble(rom, entryPoint) {
  const decoded = new Map(); // pc -> row
  const queue = [entryPoint];
  const visited = new Set();
  let instructionCount = 0;

  while (queue.length > 0 && instructionCount < MAX_INSTRUCTIONS) {
    const pc = queue.shift();

    // Skip if already visited or out of bounds
    if (visited.has(pc)) continue;
    if (pc < 0 || pc >= rom.length) continue;
    // Stay within a reasonable range of the entry point
    if (pc < entryPoint - 0x200 && pc >= 0x400000) continue;
    if (pc > entryPoint + MAX_DECODE_BYTES) continue;

    visited.add(pc);

    const inst = safeDecode(rom, pc);
    const length = Math.max(1, inst?.length ?? 1);
    const nextPc = inst?.nextPc ?? (pc + length);

    const row = {
      pc,
      inst,
      length,
      nextPc,
      bytes: formatBytes(rom, pc, length),
    };
    decoded.set(pc, row);
    instructionCount++;

    if (!inst) continue;

    // Follow branch/jump targets (internal only -- within function range)
    const target = getControlTarget(inst);
    if (target !== undefined && isJumpLike(inst)) {
      // Follow internal jump targets
      if (target >= entryPoint - 0x100 && target <= entryPoint + MAX_DECODE_BYTES) {
        if (!visited.has(target)) {
          queue.push(target);
        }
      }
    }

    // Follow fallthrough for conditional branches
    if (inst.tag === 'jp-conditional' || inst.tag === 'jp-cond'
        || inst.tag === 'jr-conditional' || inst.tag === 'jr-cond'
        || inst.tag === 'djnz'
        || inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'call-cond'
        || inst.tag === 'ret-conditional' || inst.tag === 'ret-cond') {
      if (!visited.has(nextPc)) {
        queue.push(nextPc);
      }
    }

    // Follow unconditional fallthrough (not terminators)
    if (!isHardTerminator(inst) && !isJumpLike(inst)) {
      if (!visited.has(nextPc)) {
        queue.push(nextPc);
      }
    }

    // For unconditional JP, only follow the target (already handled above),
    // not the fallthrough
  }

  // Sort by address
  const rows = [...decoded.values()].sort((a, b) => a.pc - b.pc);
  return rows;
}

function buildAnnotations(row) {
  const notes = [];
  const inst = row.inst;
  if (!inst) return notes;

  if (row.pc === START) notes.push('ENTRY');
  if (isHardTerminator(inst)) notes.push('hard terminator');

  const controlTarget = getControlTarget(inst);
  if (controlTarget !== undefined) {
    const location = controlTarget >= START - 0x100 && controlTarget < START + MAX_DECODE_BYTES ? 'internal' : 'external';
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
    notes.push('*** 2ND-table plane offset (+0x38) ***');
  }
  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0x70) {
    notes.push('ALPHA-table plane offset (+0x70)');
  }
  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0xA8) {
    notes.push('2ND+ALPHA plane offset (+0xA8)');
  }

  // Check for immediate loads of table addresses
  if (inst.tag === 'ld-pair-imm') {
    const tableNote = annotateTokenTableAddress(inst.value);
    if (tableNote) notes.push(`*** ${tableNote} ***`);
  }

  const addr = getAbsoluteAddress(inst);
  const tableNote = annotateTokenTableAddress(addr);
  if (tableNote) notes.push(`*** ${tableNote} ***`);

  return notes;
}

function printDisassembly(label, rows) {
  if (rows.length === 0) return;
  const first = rows[0].pc;
  const last = rows.at(-1)?.nextPc ?? first;
  console.log('='.repeat(120));
  console.log(`${label}: ${hex(first)}..${hex(last - 1)} (${last - first} bytes, ${rows.length} instructions)`);
  console.log('='.repeat(120));
  for (const row of rows) {
    if (!row.inst) {
      console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20)}  DB     ${hex(0, 2)}`);
      continue;
    }
    const rendered = formatInstruction(row.inst);
    const { mnemonic, operands } = splitInstruction(rendered);
    const annotations = buildAnnotations(row);
    const suffix = annotations.length ? `  ; ${annotations.join(' | ')}` : '';
    console.log(
      `${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${mnemonic.padEnd(6)} ${operands.padEnd(34)}${suffix}`,
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

// Scan ROM for any 24-bit address load that references a known table address
function scanForTableLoads(rom) {
  const results = [];
  const targets = [
    { addr: TOKEN_TABLE_BASE, label: 'main table base 0x09F79B' },
    { addr: TOKEN_TABLE_2ND, label: '2ND sub-table 0x09F7D3' },
  ];

  for (const { addr, label } of targets) {
    const lo = addr & 0xFF;
    const mid = (addr >> 8) & 0xFF;
    const hi = (addr >> 16) & 0xFF;

    // Search within a region around 0x09EF44
    const searchStart = 0x09EF00;
    const searchEnd = Math.min(rom.length - 3, 0x09FF00);
    for (let i = searchStart; i < searchEnd; i++) {
      if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
        const prevByte = i > 0 ? rom[i - 1] : 0;
        const isPairLoad = prevByte === 0x01 || prevByte === 0x11 || prevByte === 0x21 || prevByte === 0x31;
        results.push({
          offset: i,
          prevByte,
          isPairLoad,
          label,
          context: formatBytes(rom, Math.max(0, i - 2), 6),
        });
      }
    }
  }
  return results;
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
    const location = target >= START - 0x100 && target < START + MAX_DECODE_BYTES ? 'internal' : 'external';
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

function printTableSummary(allRows) {
  const refs = collectTableRefs(allRows);
  console.log('--- Translation-table references / offsets ---');
  if (refs.length === 0) {
    console.log('  No direct 0x09F79B/0x09F7D3 references, no shared lookup helper calls,');
    console.log('  and no ADD A,0x38-style plane offsets found in the decoded window.');
    console.log('');
    return;
  }
  for (const ref of refs) {
    console.log(`  ${hex(ref.pc)}  ${ref.kind.padEnd(8)} ${ref.detail}  ${ref.text}`);
  }
  console.log('');
}

function printCallerSummary(rom, hits) {
  console.log('--- Direct CALL 0x09EF44 sites (CD 44 EF 09) ---');
  if (hits.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const hit of hits) {
    const inst = safeDecode(rom, hit);
    const label = TARGET_NAMES[hit];
    console.log(`  ${hex(hit)}  ${formatInstruction(inst)}${label ? `  [${label}]` : ''}`);
  }
  console.log('');
}

function printRawTableScan(rom) {
  const results = scanForTableLoads(rom);
  console.log('--- Raw byte scan for 0x09F79B / 0x09F7D3 near 0x09EF44 (0x09EF00..0x09FF00) ---');
  if (results.length === 0) {
    console.log('  No occurrences of these 24-bit addresses found in the nearby region.');
    console.log('');
    return;
  }
  for (const r of results) {
    const pairNote = r.isPairLoad ? ' (preceded by LD-pair opcode)' : '';
    console.log(`  offset ${hex(r.offset)}  ${r.label}  bytes: ${r.context}${pairNote}`);
  }
  console.log('');
}

function printConclusion(allRows, callerHits, rom) {
  console.log('='.repeat(120));
  console.log('ANALYSIS');
  console.log('='.repeat(120));
  console.log('');

  const tableRefs = collectTableRefs(allRows);
  const iyRefs = collectIYRefs(allRows);
  const targets = collectTargets(allRows);
  const memRefs = collectMemoryRefs(allRows);

  const externalCalls = [...targets.entries()]
    .filter(([t]) => t < START - 0x100 || t >= START + MAX_DECODE_BYTES)
    .map(([t, sources]) => ({ target: t, label: TARGET_NAMES[t] ?? '', count: sources.length }));

  const internalJumps = [...targets.entries()]
    .filter(([t]) => t >= START - 0x100 && t < START + MAX_DECODE_BYTES)
    .map(([t, sources]) => ({ target: t, count: sources.length }));

  // Calculate function size
  const lastRetRow = [...allRows].reverse().find((r) => r.inst && isReturn(r.inst));
  const functionEnd = lastRetRow ? lastRetRow.nextPc : allRows.at(-1)?.nextPc ?? START;
  const functionSize = functionEnd - START;

  console.log(`  Function at 0x09EF44: decoded ${allRows.length} instructions.`);
  console.log(`  Function size (start to last RET): ${functionSize} bytes (${hex(START)}..${hex(functionEnd - 1)})`);
  console.log(`  External calls/jumps: ${externalCalls.length}`);
  for (const ec of externalCalls) {
    console.log(`    -> ${hex(ec.target)} (${ec.count}x)${ec.label ? ` ${ec.label}` : ''}`);
  }
  console.log(`  Internal branches: ${internalJumps.length}`);
  console.log(`  IY-relative references: ${iyRefs.length}`);
  console.log(`  Absolute memory refs: ${memRefs.filter((r) => r.kind === 'absolute').length}`);
  console.log('');

  console.log('  KEY QUESTIONS:');
  console.log('');

  const has2ndTableRef = tableRefs.some((r) => r.detail.includes('0x09F7D3'));
  const hasMainTableRef = tableRefs.some((r) => r.detail.includes('0x09F79B'));
  const hasAdd38 = tableRefs.some((r) => r.kind === 'offset' && r.detail.includes('0x38'));

  console.log(`  1. References 2ND sub-table at 0x09F7D3?  ${has2ndTableRef ? 'YES' : 'NO'}`);
  console.log(`  2. References main table at 0x09F79B?      ${hasMainTableRef ? 'YES' : 'NO'}`);
  console.log(`  3. Contains ADD A,0x38 (2ND plane offset)? ${hasAdd38 ? 'YES' : 'NO'}`);
  console.log(`  4. Direct callers of 0x09EF44 found:       ${callerHits.length}`);
  for (const hit of callerHits) {
    console.log(`     ${hex(hit)}`);
  }

  const rawResults = scanForTableLoads(rom);
  const hasRawTableRef = rawResults.length > 0;
  console.log(`  5. Raw byte scan for table addrs nearby:   ${hasRawTableRef ? `${rawResults.length} hit(s)` : 'NONE'}`);

  console.log('');

  if (iyRefs.length > 0) {
    console.log('  IY flag activity summary:');
    for (const ref of iyRefs) {
      console.log(`    ${hex(ref.pc)}  ${ref.text}  ${ref.note ?? ''}`);
    }
    console.log('');
  }

  const absoluteMemRefs = memRefs.filter((r) => r.kind === 'absolute');
  if (absoluteMemRefs.length > 0) {
    console.log('  RAM address activity:');
    const seen = new Set();
    for (const ref of absoluteMemRefs) {
      const key = `${ref.address}-${ref.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = RAM_NAMES[ref.address] ?? annotateTokenTableAddress(ref.address) ?? '';
      console.log(`    ${hex(ref.address)}  ${ref.direction.padEnd(10)}  ${label}`);
    }
    console.log('');
  }

  if (!has2ndTableRef && !hasMainTableRef && !hasAdd38 && !hasRawTableRef) {
    console.log('  CONCLUSION: 0x09EF44 does NOT directly reference the translation tables');
    console.log('  or perform the 2ND-mode scan-code remapping. The 2ND remapping must occur');
    console.log('  in a deeper callee or on a different code path entirely.');
  } else {
    console.log('  CONCLUSION: 0x09EF44 DOES contain translation-table references.');
    console.log('  This is likely the function (or a wrapper around) the 2ND key remapper.');
  }
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 390 - Disassemble 0x09EF44 (deep callee from 0x04E950)');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log(`Entry point: ${hex(START)}`);
  console.log(`BFS max instructions: ${MAX_INSTRUCTIONS}`);
  console.log('');

  // BFS disassemble from entry point
  const allRows = bfsDisassemble(rom, START);
  const coveredStart = allRows[0]?.pc ?? START;
  const coveredEnd = allRows.at(-1)?.nextPc ?? START;
  console.log(`BFS decoded: ${hex(coveredStart)}..${hex(coveredEnd - 1)} (${allRows.length} instructions across ${coveredEnd - coveredStart} address-range bytes)`);
  console.log('');

  printDisassembly('BFS disassembly of 0x09EF44', allRows);

  // Summaries
  printTargetSummary(allRows);
  printMemorySummary(allRows);
  printPortSummary(allRows);
  printIYSummary(allRows);
  printTableSummary(allRows);

  // Caller search
  const callerHits = findDirectCallers(rom, DIRECT_CALL_PATTERN);
  printCallerSummary(rom, callerHits);

  // Raw byte scan for table addresses near this function
  printRawTableScan(rom);

  // Final analysis
  printConclusion(allRows, callerHits, rom);
}

main();
