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

const START = 0x02FF00;
const END = 0x030000;

const CONTINUATION_START = 0x02FFF6;
const CONTINUATION_END = 0x0300A1;
const ALPHA_START = 0x0300CB;
const ALPHA_END = 0x030137;
const HELPER_START = 0x0301F6;
const HELPER_END = 0x030202;

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
  0x0301F6: 'mode-normalization helper',
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
  if (inst.displacement !== 0x12) return null;
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
  return `touch IY+0x12 bit ${inst.bit}`;
}

function buildAnnotations(pc, inst, sectionStart, sectionEnd) {
  const notes = [];
  const controlTarget = getControlTarget(inst);
  const absAddr = getAbsoluteAddress(inst);
  const memoryDirection = classifyMemoryRef(inst);
  const iyNote = annotateIYFlags(inst);

  if (pc === 0x02FFED) {
    notes.push('key site: OR A result gate');
  }
  if (pc === 0x02FFF6) {
    notes.push('key site: 2ND-mode JP target');
  }
  if (iyNote) {
    notes.push(iyNote);
  }
  if (controlTarget !== undefined) {
    const scope = controlTarget >= sectionStart && controlTarget < sectionEnd ? 'internal' : 'external';
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
    const annotations = buildAnnotations(row.pc, row.inst, start, end);
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

function printTargetSummary(rows, sectionStart, sectionEnd) {
  const targets = collectTargets(rows);
  console.log('--- CALL/JP/JR targets in main window ---');
  if (targets.size === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const [target, inbound] of [...targets.entries()].sort((left, right) => left[0] - right[0])) {
    const location = target >= sectionStart && target < sectionEnd ? 'internal' : 'external';
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

function printFindings() {
  console.log('--- Findings ---');
  console.log('  0x02FFED is the shared zero/nonzero gate. OR A feeds JP NZ,0x02FE84 (shared translated-key return path),');
  console.log('  while the zero case falls through to JP 0x02FD99 (dispatcher/event-loop tail).');
  console.log('');
  console.log('  The 2ND-mode target at 0x02FFF6 immediately clears bit 3 of IY+0x12, so it consumes the 2ND latch before');
  console.log('  continuing. It then CALLs 0x0301F6, which only does work when bit 1 of IY+0x15 is set; otherwise it returns');
  console.log('  immediately. The general 2ND path eventually does ADD A,0x38 and JP 0x02FF0B, reusing the 0x09F79B lookup');
  console.log('  table through the 2ND bank.');
  console.log('');
  console.log('  The ALPHA handler at 0x0300CB uses different flag choreography. After special cases for A=0x30 and A=0x36,');
  console.log('  it does D=1 and ADD A,0x70; when bit 5 of IY+0x12 is already set it adds another 0x38 before rejoining the');
  console.log('  same 0x09F79B table path. In other words: 2ND selects the +0x38 bank, while ALPHA selects later banks');
  console.log('  (+0x70 or +0xA8) and has an extra token-staging case that can write 0xD0058E.');
  console.log('');
  console.log('  No direct 0xD0058C..0xD00591 accesses appear inside 0x02FF00..0x02FFFF itself. The first continuation-range');
  console.log('  accesses are just past the boundary: 0x03002E/0x030078 touch 0xD0058F, 0x030048 writes 0xD0058A, and');
  console.log('  0x03012A writes 0xD0058E on the ALPHA token path.');
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 386 - Disassemble 0x02FF00..0x030000');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log('');

  const mainRows = printRange('Main translation-dispatch continuation window', rom, START, END);
  const secondRows = printRange('Focused 2ND-mode continuation (crosses the 0x030000 boundary)', rom, CONTINUATION_START, CONTINUATION_END);
  const alphaRows = printRange('Focused ALPHA-mode target at 0x0300CB', rom, ALPHA_START, ALPHA_END);
  const helperRows = printRange('Focused helper at 0x0301F6', rom, HELPER_START, HELPER_END);

  console.log('='.repeat(96));
  console.log('Summary');
  console.log('='.repeat(96));
  printTargetSummary(mainRows, START, END);
  printMemorySummary('RAM reads/writes in main window', collectMemoryRefs(mainRows));
  printMemorySummary('RAM reads/writes in focused 2ND continuation', collectMemoryRefs(secondRows));
  printMemorySummary('RAM reads/writes in focused ALPHA target', collectMemoryRefs(alphaRows));
  printPortSummary('Port I/O in main window', collectPortOps(mainRows));
  printPortSummary('Port I/O in focused 2ND continuation', collectPortOps(secondRows));
  printReturnSummary('RET/RETI/RETN in main window', collectReturns(mainRows));
  printReturnSummary('RET/RETI/RETN in focused helper', collectReturns(helperRows));
  printFindings();
}

main();
