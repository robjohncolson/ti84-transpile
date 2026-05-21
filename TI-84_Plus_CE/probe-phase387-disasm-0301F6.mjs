#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';

// 2ND-mode translation subroutine
const START = 0x0301F6;
// Next known function boundary
const END = 0x0302EB;

// Token table base and sub-table offsets
const TOKEN_TABLE_BASE = 0x09F79B;
const TOKEN_TABLE_DEFAULT = TOKEN_TABLE_BASE;         // +0
const TOKEN_TABLE_2ND = TOKEN_TABLE_BASE + 56;        // +56 = 0x09F7D3
const TOKEN_TABLE_ALPHA = TOKEN_TABLE_BASE + 112;     // +112 = 0x09F80B
const TOKEN_TABLE_2ND_ALPHA = TOKEN_TABLE_BASE + 168; // +168 = 0x09F843

const RAM_NAMES = {
  0xD0058A: 'kbdDebncCnt',
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0xD0058F: 'kbdState+0x08',
  0xD007E0: 'RAM[D007E0]',
  0xD00824: 'RAM[D00824]',
  0xD0082E: 'RAM[D0082E]',
  0xD00836: 'RAM[D00836]',
};

const TARGET_NAMES = {
  0x02FD99: 'common dispatcher tail',
  0x02FE84: 'shared translated-key return path',
  0x02FF0B: 'shared 0x09F79B lookup entry',
  0x02FF1B: 'shared post-lookup token stage',
  0x02FFAE: 'shared accept-current-HL path',
  0x02FFF6: '2ND-mode continuation entry',
  0x022346: '0x09F79B table lookup helper',
  0x02237E: 'post-translation commit helper',
  0x0300CB: 'ALPHA-mode handler',
  0x0301F6: '2ND translation subroutine',
  0x030300: 'translated-key output helper',
  0x08773F: 'external helper 0x08773F',
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
    bytes.push(rom[pc + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function formatDisplacement(displacement) {
  const value = displacement & 0xFF;
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
    case 'ld-sp-hl':
      return 'LD SP,HL';
    case 'ld-reg-idx':
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-idx-reg':
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
    case 'jp-idx':
      return `JP (${String(inst.indexRegister).toUpperCase()})`;
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
    case 'out-reg':
      return `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'out-a-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
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
      return `${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
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

function getAbsoluteAddress(inst) {
  return inst.addr ?? inst.address ?? undefined;
}

function classifyMemoryRef(inst) {
  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-a-mem') return 'read';
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-a') return 'write';
  if (inst.tag === 'ld-pair-mem') return inst.direction === 'to-mem' ? 'write' : 'read';
  return null;
}

function getControlTarget(inst) {
  return inst.target ?? undefined;
}

function isJumpLike(inst) {
  return inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jp-cond' ||
    inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'jr-cond' ||
    inst.tag === 'djnz';
}

function isCallLike(inst) {
  return inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'call-cond';
}

function isReturn(inst) {
  return inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' ||
    inst.tag === 'ret-conditional' || inst.tag === 'ret-cond';
}

function isPortIo(inst) {
  return inst.tag === 'in-reg' || inst.tag === 'in-a-imm' ||
    inst.tag === 'out-reg' || inst.tag === 'out-a-imm';
}

function annotateIYFlags(inst) {
  if (!inst.indexRegister || String(inst.indexRegister).toLowerCase() !== 'iy') return null;
  if (inst.displacement === 0x12) {
    if (inst.bit === 3) {
      if (inst.tag === 'indexed-cb-set') return 'set 2ND flag in IY+0x12';
      if (inst.tag === 'indexed-cb-res') return 'clear 2ND flag in IY+0x12';
      return 'test 2ND flag in IY+0x12';
    }
    if (inst.bit === 4) {
      if (inst.tag === 'indexed-cb-set') return 'set ALPHA flag in IY+0x12';
      if (inst.tag === 'indexed-cb-res') return 'clear ALPHA flag in IY+0x12';
      return 'test ALPHA flag in IY+0x12';
    }
    if (inst.bit === 5) {
      if (inst.tag === 'indexed-cb-set') return 'set 2ND+ALPHA flag in IY+0x12';
      if (inst.tag === 'indexed-cb-res') return 'clear 2ND+ALPHA flag in IY+0x12';
      return 'test 2ND+ALPHA flag in IY+0x12';
    }
    return `touch IY+0x12 bit ${inst.bit}`;
  }
  if (inst.displacement === 0x15) {
    return `touch IY+0x15 bit ${inst.bit}`;
  }
  return null;
}

function annotateTokenTable(inst) {
  const addr = getAbsoluteAddress(inst);
  if (addr === undefined) return null;
  if (addr === TOKEN_TABLE_BASE) return 'token table base (DEFAULT sub-table)';
  if (addr === TOKEN_TABLE_2ND) return 'token table 2ND sub-table (+56)';
  if (addr === TOKEN_TABLE_ALPHA) return 'token table ALPHA sub-table (+112)';
  if (addr === TOKEN_TABLE_2ND_ALPHA) return 'token table 2ND+ALPHA sub-table (+168)';
  if (addr >= TOKEN_TABLE_BASE && addr < TOKEN_TABLE_BASE + 224) {
    return `token table offset +${addr - TOKEN_TABLE_BASE}`;
  }
  return null;
}

function buildAnnotations(pc, inst) {
  const notes = [];
  const controlTarget = getControlTarget(inst);
  const absAddr = getAbsoluteAddress(inst);
  const memoryDirection = classifyMemoryRef(inst);
  const iyNote = annotateIYFlags(inst);
  const tokenNote = annotateTokenTable(inst);

  if (iyNote) {
    notes.push(iyNote);
  }
  if (tokenNote) {
    notes.push(tokenNote);
  }
  if (controlTarget !== undefined) {
    const scope = controlTarget >= START && controlTarget < END ? 'internal' : 'external';
    const targetLabel = TARGET_NAMES[controlTarget];
    notes.push(`${scope} target ${hex(controlTarget)}${targetLabel ? ` (${targetLabel})` : ''}`);
  }
  if (absAddr !== undefined) {
    const ramLabel = RAM_NAMES[absAddr];
    if (memoryDirection) {
      notes.push(`${memoryDirection} ${ramLabel ?? hex(absAddr)}`);
    }
  }
  if (isPortIo(inst)) {
    notes.push('port I/O');
  }
  if (isReturn(inst)) {
    notes.push('return');
  }
  return notes;
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return null;
  }
}

function decodeRange(rom, start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = safeDecode(rom, pc);
    const length = Math.max(1, inst?.length ?? 1);
    const bytes = formatBytes(rom, pc, length);
    rows.push({
      pc,
      inst,
      length,
      nextPc: inst?.nextPc ?? (pc + length),
      bytes,
    });
    pc += length;
  }

  return rows;
}

function printRange(title, rom, start, end) {
  console.log('='.repeat(96));
  console.log(title);
  console.log(`${hex(start)}..${hex(end)} (${end - start} bytes)`);
  console.log('='.repeat(96));

  const rows = decodeRange(rom, start, end);

  for (const row of rows) {
    if (!row.inst) {
      console.log(`${hex(row.pc)}  ${row.bytes.padEnd(18)}  DB     ${hex(rom[row.pc], 2)}`);
      continue;
    }

    const rendered = formatInstruction(row.inst);
    const { mnemonic, operands } = splitInstruction(rendered);
    const annotations = buildAnnotations(row.pc, row.inst);
    const suffix = annotations.length ? `  ; ${annotations.join(' | ')}` : '';
    console.log(
      `${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${mnemonic.padEnd(6)} ${operands.padEnd(30)}${suffix}`,
    );
  }

  console.log('');
  return rows;
}

function collectTargets(rows) {
  const targets = new Map();
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
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
    const inst = row.inst;
    if (!inst) continue;
    const addr = getAbsoluteAddress(inst);
    const direction = classifyMemoryRef(inst);
    if (addr === undefined || !direction) continue;
    refs.push({
      pc: row.pc,
      address: addr,
      direction,
      text: formatInstruction(inst),
    });
  }
  return refs;
}

function collectPortOps(rows) {
  return rows
    .filter((row) => row.inst && isPortIo(row.inst))
    .map((row) => ({ pc: row.pc, text: formatInstruction(row.inst) }));
}

function collectReturns(rows) {
  return rows
    .filter((row) => row.inst && isReturn(row.inst))
    .map((row) => ({ pc: row.pc, text: formatInstruction(row.inst) }));
}

function collectIYRefs(rows) {
  return rows
    .filter((row) => {
      const inst = row.inst;
      if (!inst) return false;
      return inst.indexRegister && String(inst.indexRegister).toLowerCase() === 'iy';
    })
    .map((row) => ({
      pc: row.pc,
      displacement: row.inst.displacement,
      bit: row.inst.bit,
      tag: row.inst.tag,
      text: formatInstruction(row.inst),
      note: annotateIYFlags(row.inst),
    }));
}

function collectImmediateValues(rows) {
  const values = [];
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (inst.value !== undefined && (inst.tag === 'alu-imm' || inst.tag === 'alu-immediate' ||
        inst.tag === 'ld-reg-imm' || inst.tag === 'ld-pair-imm')) {
      values.push({
        pc: row.pc,
        value: inst.value,
        text: formatInstruction(inst),
      });
    }
  }
  return values;
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
    const location = target >= START && target < END ? 'internal' : 'external';
    const label = TARGET_NAMES[target];
    console.log(`  ${hex(target)}  ${location}${label ? `  ${label}` : ''}`);
    for (const source of inbound) {
      console.log(`    <- ${hex(source.pc)}  ${source.kind}  ${source.text}`);
    }
  }
  console.log('');
}

function printMemorySummary(title, refs) {
  console.log(`--- ${title} ---`);
  if (refs.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const ref of refs) {
    const label = RAM_NAMES[ref.address] ?? (ref.address >= 0xD00000 && ref.address < 0xE00000 ? 'RAM' : '');
    console.log(`  ${hex(ref.pc)}  ${ref.direction.padEnd(5)} ${hex(ref.address)}${label ? ` (${label})` : ''}  ${ref.text}`);
  }
  console.log('');
}

function printPortSummary(title, ops) {
  console.log(`--- ${title} ---`);
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

function printReturnSummary(title, returns) {
  console.log(`--- ${title} ---`);
  if (returns.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const item of returns) {
    console.log(`  ${hex(item.pc)}  ${item.text}`);
  }
  console.log('');
}

function printIYSummary(title, iyRefs) {
  console.log(`--- ${title} ---`);
  if (iyRefs.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const ref of iyRefs) {
    const noteStr = ref.note ? `  [${ref.note}]` : '';
    console.log(`  ${hex(ref.pc)}  IY+${hex(ref.displacement, 2)}  bit=${ref.bit ?? 'n/a'}  ${ref.text}${noteStr}`);
  }
  console.log('');
}

function printImmediatesSummary(title, values) {
  console.log(`--- ${title} ---`);
  if (values.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const v of values) {
    const decimal = `(${v.value})`;
    console.log(`  ${hex(v.pc)}  value=${hex(v.value, 2)} ${decimal.padEnd(6)}  ${v.text}`);
  }
  console.log('');
}

function printAnalysis(rows) {
  console.log('='.repeat(96));
  console.log('ANALYSIS: 2ND Translation Subroutine 0x0301F6');
  console.log('='.repeat(96));
  console.log('');

  // Check for token table references
  console.log('--- Token table references ---');
  let foundTokenRef = false;
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    const addr = getAbsoluteAddress(inst);
    if (addr !== undefined && addr >= TOKEN_TABLE_BASE && addr < TOKEN_TABLE_BASE + 224) {
      const offset = addr - TOKEN_TABLE_BASE;
      let subtable = '';
      if (offset < 56) subtable = 'DEFAULT';
      else if (offset < 112) subtable = '2ND';
      else if (offset < 168) subtable = 'ALPHA';
      else subtable = '2ND+ALPHA';
      console.log(`  ${hex(row.pc)}  refs ${hex(addr)} = base+${offset} (${subtable} sub-table)  ${formatInstruction(inst)}`);
      foundTokenRef = true;
    }
  }
  if (!foundTokenRef) {
    console.log('  No direct token table references found in this range.');
    console.log('  The subroutine may use computed offsets or delegate to another function.');
  }
  console.log('');

  // Check for computed lookup vs individual scan code branching
  console.log('--- Lookup strategy analysis ---');
  let cpCount = 0;
  let addCount = 0;
  let tableLoadCount = 0;
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'cp') {
      cpCount++;
      console.log(`  CP at ${hex(row.pc)}: ${formatInstruction(inst)} -- individual scan code check`);
    }
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add') {
      addCount++;
      console.log(`  ADD at ${hex(row.pc)}: ${formatInstruction(inst)} -- offset computation`);
    }
    if (inst.tag === 'ld-pair-imm') {
      const val = inst.value;
      if (val >= 0x090000 && val < 0x0A0000) {
        tableLoadCount++;
        console.log(`  TABLE LOAD at ${hex(row.pc)}: ${formatInstruction(inst)}`);
      }
    }
  }
  if (cpCount > 3) {
    console.log(`  Strategy: individual scan code branching (${cpCount} CP instructions found)`);
  } else if (addCount > 0 || tableLoadCount > 0) {
    console.log(`  Strategy: computed lookup (ADD-based offset into table)`);
  } else {
    console.log(`  Strategy: unclear from immediate values alone; check register-indirect ops`);
  }
  console.log('');

  // Does it reference the +56 sub-table at 0x09F7D3?
  console.log('--- Does it reference 0x09F7D3 (2ND sub-table at base+56)? ---');
  let found09F7D3 = false;
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    const addr = getAbsoluteAddress(inst);
    if (addr === TOKEN_TABLE_2ND) {
      console.log(`  YES: ${hex(row.pc)} directly references 0x09F7D3`);
      found09F7D3 = true;
    }
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'add' && inst.value === 0x38) {
      console.log(`  INDIRECT: ${hex(row.pc)} ADD A,0x38 (56 decimal = 2ND sub-table offset)`);
      found09F7D3 = true;
    }
  }
  if (!found09F7D3) {
    console.log('  No direct or ADD A,0x38 references found. May use a different mechanism.');
  }
  console.log('');

  // Special 2ND function handlers
  console.log('--- Special 2ND function handlers (CP-based branches) ---');
  let handlerCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const inst = rows[i].inst;
    if (!inst) continue;
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'cp') {
      const scanCode = inst.value;
      // Look for the following conditional jump
      let targetInfo = '';
      if (i + 1 < rows.length) {
        const next = rows[i + 1].inst;
        if (next && (next.tag === 'jp-conditional' || next.tag === 'jp-cond' ||
            next.tag === 'jr-conditional' || next.tag === 'jr-cond')) {
          targetInfo = ` -> ${next.condition} ${hex(next.target)}`;
          const label = TARGET_NAMES[next.target];
          if (label) targetInfo += ` (${label})`;
        }
      }
      console.log(`  scan code 0x${scanCode.toString(16).toUpperCase().padStart(2, '0')} (${scanCode}) at ${hex(rows[i].pc)}${targetInfo}`);
      handlerCount++;
    }
  }
  if (handlerCount === 0) {
    console.log('  No CP-based scan code handlers found.');
  }
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 387 - Disassemble 2ND Translation Subroutine at 0x0301F6');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log(`Range: ${hex(START)}..${hex(END)} (${END - START} bytes)`);
  console.log('');
  console.log('Context: The 2ND-mode key-processing path at 0x02FFF6 calls 0x0301F6 as a');
  console.log('dedicated 2ND translation subroutine. This is distinct from the default');
  console.log("path's 0x022346 flat table lookup. The token table has 4 sub-tables at");
  console.log('0x09F79B (DEFAULT +0, 2ND +56, ALPHA +112, 2ND+ALPHA +168).');
  console.log('');

  const rows = printRange('2ND Translation Subroutine: 0x0301F6..0x0302EB', rom, START, END);

  console.log('='.repeat(96));
  console.log('SUMMARY');
  console.log('='.repeat(96));
  console.log('');

  printTargetSummary(rows);
  printMemorySummary('RAM references (0xD0xxxx)', collectMemoryRefs(rows));
  printPortSummary('Port I/O', collectPortOps(rows));
  printReturnSummary('RET/RETI/RETN instructions', collectReturns(rows));
  printIYSummary('IY flag references', collectIYRefs(rows));
  printImmediatesSummary('Immediate values (ADD/CP/LD)', collectImmediateValues(rows));

  printAnalysis(rows);
}

main();
