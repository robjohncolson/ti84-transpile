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

// Tail-jump target from menu/context handler at 0x030214
const START = 0x08C5D7;
// Disassemble at least 200 bytes; extend to cover sub-functions found in-range
const END = 0x08C700;

const RAM_NAMES = {
  0xD0058A: 'kbdDebncCnt',
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0xD007E0: 'contextFlags',
  0xD007FA: 'RAM[D007FA]',
  0xD00800: 'flags+0x00',
  0xD00802: 'flags+0x02',
  0xD00809: 'flags+0x09',
  0xD0080C: 'flags+0x0C',
  0xD00811: 'flags+0x11',
  0xD00825: 'flags+0x25',
  0xD00828: 'flags+0x28',
  0xD0082E: 'flags+0x2E',
  0xD00832: 'flags+0x32',
  0xD00836: 'flags+0x36',
  0xD0083A: 'flags+0x3A',
  0xD0083B: 'flags+0x3B',
  0xD0083C: 'flags+0x3C',
  0xD00842: 'flags+0x42',
  0xD00857: 'flags+0x57',
  0xD0085A: 'flags+0x5A',
  0xD0085B: 'flags+0x5B',
  0xD0085C: 'flags+0x5C',
  0xD007CD: 'RAM[D007CD]',
  0xD007D0: 'RAM[D007D0]',
  0xD007D3: 'RAM[D007D3]',
  0xD02FD6: 'RAM[D02FD6]',
};

const TARGET_NAMES = {
  0x08C509: 'upstream entry (0x08C509)',
  0x08C5D7: 'THIS FUNCTION — action dispatch entry',
  0x08C607: 'action tail: clear flags + setup',
  0x08C65D: 'action 0x7F handler',
  0x08C667: 'sub-action: LD A,0x29 path',
  0x08C66E: 'sub-path: LD A,0x52 + call 0x08C79F',
  0x08C689: 'sub-function: 0x08C689',
  0x08C69E: 'sub-function: 0x08C69E',
  0x08C6A7: 'sub-function: 0x08C6A7',
  0x08C6F7: 'tail-jump to 0x03FBFD',
  0x08C79F: 'helper 0x08C79F',
  0x08C7AB: 'helper 0x08C7AB',
  0x08C7AD: 'helper 0x08C7AD',
  0x08C745: 'helper 0x08C745',
  0x0003A0: 'RST/system call 0x0003A0',
  0x025396: 'helper 0x025396',
  0x025354: 'helper 0x025354',
  0x027204: 'helper 0x027204',
  0x0551EF: 'helper 0x0551EF',
  0x055B8F: 'helper 0x055B8F',
  0x0620E6: 'helper 0x0620E6',
  0x03FBFD: 'function 0x03FBFD',
  0x03C33D: 'function 0x03C33D',
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
  const d = inst.displacement;
  const b = inst.bit;

  // Known IY flag offsets from OS flag area (IY base = 0xD00080 typically)
  const knownOffsets = {
    0x00: 'flags byte +0x00',
    0x02: 'flags byte +0x02',
    0x09: 'flags byte +0x09',
    0x0C: 'flags byte +0x0C',
    0x11: 'flags byte +0x11',
    0x12: 'flags byte +0x12',
    0x25: 'flags byte +0x25',
    0x28: 'flags byte +0x28',
    0x2E: 'flags byte +0x2E',
    0x32: 'flags byte +0x32',
    0x36: 'flags byte +0x36',
    0x3A: 'flags byte +0x3A',
    0x3B: 'flags byte +0x3B',
    0x3C: 'flags byte +0x3C',
    0x42: 'flags byte +0x42',
    0x57: 'flags byte +0x57',
    0x5A: 'flags byte +0x5A',
    0x5B: 'flags byte +0x5B',
    0x5C: 'flags byte +0x5C',
  };

  const offsetLabel = knownOffsets[d] ?? `IY+${hex(d, 2)}`;
  const bitStr = b !== undefined ? ` bit ${b}` : '';

  if (inst.tag === 'indexed-cb-set') return `SET${bitStr} in ${offsetLabel}`;
  if (inst.tag === 'indexed-cb-res') return `RES${bitStr} in ${offsetLabel}`;
  if (inst.tag === 'indexed-cb-bit') return `TEST${bitStr} in ${offsetLabel}`;
  return `touch ${offsetLabel}${bitStr}`;
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return null;
  }
}

function buildAnnotations(pc, inst) {
  const notes = [];
  const controlTarget = getControlTarget(inst);
  const absAddr = getAbsoluteAddress(inst);
  const memoryDirection = classifyMemoryRef(inst);
  const iyNote = annotateIYFlags(inst);

  if (iyNote) {
    notes.push(iyNote);
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

function searchCallers(rom) {
  console.log('='.repeat(96));
  console.log('CALLER/JUMPER SEARCH: Who references 0x08C5D7?');
  console.log('='.repeat(96));
  console.log('');

  const jpPattern = [0xC3, 0xD7, 0xC5, 0x08];
  const callPattern = [0xCD, 0xD7, 0xC5, 0x08];

  const refs = [];
  for (let i = 0; i < rom.length - 3; i++) {
    const isJp = rom[i] === jpPattern[0] && rom[i+1] === jpPattern[1] &&
                 rom[i+2] === jpPattern[2] && rom[i+3] === jpPattern[3];
    const isCall = rom[i] === callPattern[0] && rom[i+1] === callPattern[1] &&
                   rom[i+2] === callPattern[2] && rom[i+3] === callPattern[3];
    if (isJp || isCall) {
      refs.push({ addr: i, type: isJp ? 'JP' : 'CALL' });
    }
  }

  console.log(`Found ${refs.length} reference(s) to 0x08C5D7:`);
  for (const ref of refs) {
    // Decode surrounding context: 3 instructions before (approximate)
    const contextStart = Math.max(0, ref.addr - 12);
    console.log(`\n  ${hex(ref.addr)}: ${ref.type} 0x08C5D7`);

    // Show a few bytes before for context
    const contextRows = decodeRange(rom, contextStart, ref.addr + 4);
    for (const row of contextRows) {
      if (!row.inst) continue;
      const rendered = formatInstruction(row.inst);
      const marker = row.pc === ref.addr ? ' <<<' : '';
      console.log(`    ${hex(row.pc)}  ${rendered}${marker}`);
    }
  }
  console.log('');

  // Also search for JP 0x08C607 (the internal tail at flags-clear)
  console.log('--- Also searching for references to 0x08C607 (action tail) ---');
  const jp2 = [0xC3, 0x07, 0xC6, 0x08];
  const call2 = [0xCD, 0x07, 0xC6, 0x08];
  const refs2 = [];
  for (let i = 0; i < rom.length - 3; i++) {
    const isJp = rom[i] === jp2[0] && rom[i+1] === jp2[1] && rom[i+2] === jp2[2] && rom[i+3] === jp2[3];
    const isCall = rom[i] === call2[0] && rom[i+1] === call2[1] && rom[i+2] === call2[2] && rom[i+3] === call2[3];
    if (isJp || isCall) {
      refs2.push({ addr: i, type: isJp ? 'JP' : 'CALL' });
    }
  }
  console.log(`Found ${refs2.length} reference(s) to 0x08C607:`);
  for (const ref of refs2) {
    console.log(`  ${hex(ref.addr)}: ${ref.type} 0x08C607`);
  }
  console.log('');
}

function analyzeActionDispatch(rows) {
  console.log('='.repeat(96));
  console.log('ANALYSIS: Action Dispatch at 0x08C5D7');
  console.log('='.repeat(96));
  console.log('');

  // 1. How does A get used?
  console.log('--- How A (action code) is used ---');
  console.log('Entry: A = action code (0x58 from context handler at 0x030214)');
  console.log('');

  // Find all CP instructions (comparison checks on A)
  const cpInstructions = [];
  for (let i = 0; i < rows.length; i++) {
    const inst = rows[i].inst;
    if (!inst) continue;
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') && inst.op === 'cp') {
      let branchTarget = null;
      let branchCondition = null;
      if (i + 1 < rows.length) {
        const next = rows[i + 1].inst;
        if (next && (next.tag === 'jp-conditional' || next.tag === 'jp-cond' ||
            next.tag === 'jr-conditional' || next.tag === 'jr-cond')) {
          branchTarget = next.target;
          branchCondition = next.condition;
        }
      }
      cpInstructions.push({
        pc: rows[i].pc,
        value: inst.value,
        branchTarget,
        branchCondition,
      });
    }
  }

  console.log('  CP-based action code checks:');
  for (const cp of cpInstructions) {
    const valueHex = `0x${cp.value.toString(16).toUpperCase().padStart(2, '0')}`;
    const branchStr = cp.branchTarget
      ? ` -> ${cp.branchCondition?.toUpperCase()} ${hex(cp.branchTarget)}`
      : '';
    const label = TARGET_NAMES[cp.branchTarget] ?? '';
    console.log(`    ${hex(cp.pc)}: CP ${valueHex} (${cp.value})${branchStr}${label ? ` [${label}]` : ''}`);
  }
  console.log('');

  // 2. LD A,B / LD B,A patterns
  console.log('--- Register A save/restore patterns ---');
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (inst.tag === 'ld-reg-reg') {
      if (inst.dest === 'b' && inst.src === 'a') {
        console.log(`  ${hex(row.pc)}: LD B,A  -- save action code to B`);
      }
      if (inst.dest === 'c' && inst.src === 'a') {
        console.log(`  ${hex(row.pc)}: LD C,A  -- save action code to C`);
      }
      if (inst.dest === 'a' && inst.src === 'b') {
        console.log(`  ${hex(row.pc)}: LD A,B  -- restore action code from B`);
      }
      if (inst.dest === 'a' && inst.src === 'c') {
        console.log(`  ${hex(row.pc)}: LD A,C  -- restore action code from C`);
      }
    }
  }
  console.log('');

  // 3. What does A=0x58 mean?
  console.log('--- What does A=0x58 mean? ---');
  console.log('');
  console.log('  The entry sequence at 0x08C5D7 is:');
  console.log('    LD B,A       ; save action code');
  console.log('    CP 0x59      ; is it >= 0x59?');
  console.log('    JR NZ,+0x0A  ; if A != 0x59, skip ahead');
  console.log('');
  console.log('  If A=0x58:');
  console.log('    - CP 0x59 -> NZ is set (0x58 != 0x59), so JR NZ is TAKEN');
  console.log('    - Jumps to 0x08C5E6: LD C,A  (skips kbdToken read)');
  console.log('    - Reads contextFlags from (0xD007E0)');
  console.log('    - CP 0x50 -> checks if contextFlags == 0x50');
  console.log('    - If contextFlags != 0x50: CP 0x52 check');
  console.log('    - Then CALL 0x08C7AD, LD A,B, JP 0x08C519');
  console.log('    - 0x58 passes through as-is to the main dispatcher at 0x08C519');
  console.log('');
  console.log('  If A=0x59 (special case):');
  console.log('    - CP 0x59 -> Z is set, JR NZ is NOT taken');
  console.log('    - Reads kbdToken from (0xD0058E)');
  console.log('    - ADD A,B -> A = kbdToken + 0x59 (composite code)');
  console.log('    - CP 0x5C -> range check');
  console.log('    - This is the only action code that uses kbdToken');
  console.log('');

  // 4. Trace the 0x58 path more carefully
  console.log('  Detailed A=0x58 flow:');
  let tracing = true;
  let pc = START;
  let step = 0;
  for (const row of rows) {
    if (!tracing || step > 40) break;
    if (!row.inst) continue;
    const rendered = formatInstruction(row.inst);
    const annotations = buildAnnotations(row.pc, row.inst);
    const suffix = annotations.length ? `  ; ${annotations.join(' | ')}` : '';
    console.log(`    [${step}] ${hex(row.pc)}  ${rendered}${suffix}`);
    step++;

    // Stop at unconditional JP or RET
    if (row.inst.tag === 'jp' || row.inst.tag === 'ret') {
      console.log(`    -- unconditional ${row.inst.tag === 'jp' ? 'jump' : 'return'}, end of linear trace`);
      break;
    }
  }
  console.log('');

  // 5. IY flag summary
  const iyRefs = collectIYRefs(rows);
  console.log('--- IY flag operations (OS state flags) ---');
  if (iyRefs.length === 0) {
    console.log('  (none)');
  } else {
    for (const ref of iyRefs) {
      const noteStr = ref.note ? `  [${ref.note}]` : '';
      console.log(`  ${hex(ref.pc)}  IY+${hex(ref.displacement, 2)}  bit=${ref.bit ?? 'n/a'}  ${ref.text}${noteStr}`);
    }
  }
  console.log('');

  // 6. Summary
  console.log('--- Summary ---');
  console.log('  0x08C5D7 is an ACTION DISPATCH function.');
  console.log('  It receives an action code in A and dispatches to various handlers.');
  console.log('  Known callers:');
  console.log('    0x02376D: JP 0x08C5D7  (main key dispatcher)');
  console.log('    0x0302E2: JP 0x08C5D7  (context handler at 0x030214, A=0x58)');
  console.log('    0x08AD52: JP 0x08C5D7  (internal caller)');
  console.log('    0x08C497: JP 0x08C5D7  (internal caller)');
  console.log('');
  console.log('  Action codes checked:');
  for (const cp of cpInstructions) {
    const valueHex = `0x${cp.value.toString(16).toUpperCase().padStart(2, '0')}`;
    console.log(`    ${valueHex} (${cp.value})`);
  }
  console.log('');
  console.log('  A=0x58: Passes straight through the entry gate (CP 0x59 -> NZ taken).');
  console.log('  The kbdToken read only happens for A=0x59 (composite dispatch).');
  console.log('  For A=0x58, the code checks contextFlags at (0xD007E0):');
  console.log('    - contextFlags==0x50: if action==0x40, goto XOR A path; else A=0x50');
  console.log('    - contextFlags==0x52 && action==0x40: goto 0x08C593');
  console.log('    - otherwise: CALL 0x08C7AD, then JP 0x08C519 with A=B (=0x58)');
  console.log('  0x58 is a MENU/CONTEXT action code that re-enters the main');
  console.log('  dispatcher at 0x08C519 after validating context flags.');
  console.log('');
  console.log('  Later in the function (0x08C6B5), CP 0x58 is checked against');
  console.log('  contextFlags read from (0xD007E0). When contextFlags==0x58,');
  console.log('  a special cleanup path runs: CALL 0x025354, CALL 0x025396,');
  console.log('  clear multiple IY flags, CALL 0x027204, zero (0xD02FD6),');
  console.log('  CALL 0x0551EF. This is context-exit cleanup for context 0x58.');
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 388 - Disassemble Action Dispatch at 0x08C5D7');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log(`Range: ${hex(START)}..${hex(END)} (${END - START} bytes)`);
  console.log('');
  console.log('Context: The large context handler at 0x030214 ends with');
  console.log('  LD A,0x58; JP 0x08C5D7');
  console.log('This probe disassembles 0x08C5D7 to understand what it does');
  console.log('and what A=0x58 means as an action code.');
  console.log('');

  // Main disassembly
  const rows = printRange('Action Dispatch: 0x08C5D7..0x08C700', rom, START, END);

  // Summary tables
  console.log('='.repeat(96));
  console.log('SUMMARY');
  console.log('='.repeat(96));
  console.log('');

  printTargetSummary(rows);
  printMemorySummary('RAM references', collectMemoryRefs(rows));
  printReturnSummary('RET/RETI/RETN instructions', collectReturns(rows));
  printIYSummary('IY flag references', collectIYRefs(rows));
  printImmediatesSummary('Immediate values (ADD/CP/LD)', collectImmediateValues(rows));

  // Caller search
  searchCallers(rom);

  // Detailed analysis
  analyzeActionDispatch(rows);

  console.log('Phase 388 disassembly complete.');
}

main();
