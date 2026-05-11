#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const START = 0x04E966;
const MAX_BYTES = 200;
const KEYBOARD_MMIO_START = 0xE00900;
const KEYBOARD_MMIO_END = 0xE009FF;

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

function unique(values) {
  return [...new Set(values)];
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${hexByte(Math.abs(displacement))})`;
}

function formatIndirect(registerName) {
  return `(${upper(registerName)})`;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${hex(inst.value)}` };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.src)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})` };
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` }
        : { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${hex(inst.addr)})` };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
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
      return { mnemonic: 'JP', operands: formatIndirect(inst.indirectRegister) };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'reti':
      return { mnemonic: 'RETI', operands: '' };
    case 'retn':
      return { mnemonic: 'RETN', operands: '' };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-test-ind':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndirect(inst.indirectRegister)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-res-ind':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndirect(inst.indirectRegister)}` };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-set-ind':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndirect(inst.indirectRegister)}` };
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-rotate':
      return { mnemonic: upper(inst.operation), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)}, (C)` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A, (${hexByte(inst.port)})` };
    case 'in0':
      return { mnemonic: 'IN0', operands: `${upper(inst.reg)}, (${hexByte(inst.port)})` };
    default:
      return { mnemonic: upper(inst?.tag ?? 'UNKNOWN'), operands: '' };
  }
}

function isInInstruction(inst) {
  return ['in-reg', 'in-imm', 'in0', 'ini', 'inir', 'ind', 'indr'].includes(inst?.tag);
}

function isCall(inst) {
  return inst?.tag === 'call' || inst?.tag === 'call-conditional';
}

function isUnconditionalJump(inst) {
  return inst?.tag === 'jp' || inst?.tag === 'jr' || inst?.tag === 'jp-indirect';
}

function isTerminalReturn(inst) {
  return inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn';
}

function isStopInstruction(inst) {
  return isTerminalReturn(inst) || isUnconditionalJump(inst) || inst?.tag === 'halt' || inst?.tag === 'slp';
}

function isKeyboardMmioAddr(addr) {
  return addr >= KEYBOARD_MMIO_START && addr <= KEYBOARD_MMIO_END;
}

function absoluteMemAccessInfo(inst) {
  if (inst?.tag === 'ld-reg-mem') {
    return { addr: inst.addr, direction: 'read' };
  }
  if (inst?.tag === 'ld-pair-mem') {
    return { addr: inst.addr, direction: inst.direction === 'to-mem' ? 'write' : 'read' };
  }
  if (inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-pair') {
    return { addr: inst.addr, direction: 'write' };
  }
  return null;
}

function trackedLiteralReferences(inst) {
  const refs = [];
  if (inst?.tag === 'ld-pair-imm' && isKeyboardMmioAddr(inst.value)) {
    refs.push({ addr: inst.value, register: inst.pair });
  }
  return refs;
}

function isIyFlagOp(inst) {
  return ['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(inst?.tag) && inst.indexRegister === 'iy';
}

function renderInline(row) {
  return `${hex(row.pc)} (${row.mnemonic}${row.operands ? ` ${row.operands}` : ''})`;
}

function inDescription(inst) {
  switch (inst?.tag) {
    case 'in-reg':
      return 'IN via port in BC';
    case 'in-imm':
      return `IN from port ${hexByte(inst.port)}`;
    case 'in0':
      return `IN0 from port ${hexByte(inst.port)}`;
    case 'ini':
    case 'inir':
    case 'ind':
    case 'indr':
      return `${upper(inst.tag)} via port in BC`;
    default:
      return upper(inst?.tag ?? 'IN');
  }
}

function notePieces(row) {
  const { inst } = row;
  const notes = [];
  const mem = absoluteMemAccessInfo(inst);

  if (inst?.modePrefix) {
    notes.push(`${upper(inst.modePrefix)} prefix`);
  }

  if (mem) {
    notes.push(`absolute ${mem.direction} ${hex(mem.addr)}`);
  }

  if (isInInstruction(inst)) {
    notes.push(inDescription(inst));
  }

  if (mem && isKeyboardMmioAddr(mem.addr)) {
    notes.push(`keyboard MMIO ${mem.direction} ${hex(mem.addr)}`);
  }

  for (const ref of trackedLiteralReferences(inst)) {
    notes.push(`keyboard MMIO literal ${hex(ref.addr)} loaded into ${upper(ref.register)}`);
  }

  if (isCall(inst)) {
    const prefix = inst.tag === 'call-conditional' ? `${upper(inst.condition)} ` : '';
    notes.push(`delegation target ${prefix}${hex(inst.target)}`.trim());
  }

  if (isUnconditionalJump(inst)) {
    if (inst.tag === 'jp-indirect') {
      notes.push(`unconditional jump via ${formatIndirect(inst.indirectRegister)}`);
    } else {
      notes.push(`unconditional jump -> ${hex(inst.target)}`);
    }
  }

  if (isIyFlagOp(inst)) {
    notes.push(`OS flag ${row.mnemonic} on ${formatIndexed(inst.indexRegister, inst.displacement)}`);
  }

  if (inst?.tag === 'ret-conditional') {
    notes.push(`conditional return; fallthrough -> ${hex(row.pc + row.length)}`);
  }

  if (isTerminalReturn(inst)) {
    notes.push('terminal return');
  }

  return notes.join('; ');
}

const rows = [];
let pc = START;
let mode = 'adl';
let decodedBytes = 0;
let decodeError = null;
let stopReason = `stopped at ${MAX_BYTES}-byte cap`;

while (pc < rom.length && decodedBytes < MAX_BYTES) {
  let inst;

  try {
    inst = decodeInstruction(rom, pc, mode);
  } catch (error) {
    decodeError = {
      pc,
      message: error instanceof Error ? error.message : String(error),
    };
    stopReason = `decoder error at ${hex(pc)}: ${decodeError.message}`;
    break;
  }

  const length = Math.max(1, inst?.length ?? 1);
  if (decodedBytes + length > MAX_BYTES) {
    stopReason = `hit ${MAX_BYTES}-byte cap before instruction at ${hex(pc)}`;
    break;
  }

  const formatted = formatInstruction(inst);
  const row = {
    pc,
    length,
    inst,
    mnemonic: formatted.mnemonic,
    operands: formatted.operands,
    bytes: bytesToHex(rom.subarray(pc, Math.min(rom.length, pc + length))),
  };
  row.notes = notePieces(row);
  rows.push(row);

  pc += length;
  decodedBytes += length;
  if (inst?.nextMode) {
    mode = inst.nextMode;
  }

  if (isStopInstruction(inst)) {
    stopReason = `stopped at ${row.mnemonic}${row.operands ? ` ${row.operands}` : ''} at ${hex(row.pc)}`;
    break;
  }
}

if (!rows.length) {
  console.log('# Phase 295: 0x04E966 Fifth-Level Keyboard Acquisition Disassembly');
  console.log('');
  console.log(`Start: ${hex(START)}`);
  console.log('No instructions were decoded.');
  if (decodeError) {
    console.log(`Decoder error at ${hex(decodeError.pc)}: ${decodeError.message}`);
  }
  process.exit(0);
}

const firstRow = rows[0];
const finalRow = rows[rows.length - 1];
const byteStart = firstRow.pc;
const byteEnd = finalRow.pc + finalRow.length - 1;

const inRows = rows.filter((row) => isInInstruction(row.inst));
const keyboardMmioRows = rows.filter((row) => {
  const mem = absoluteMemAccessInfo(row.inst);
  return (mem && isKeyboardMmioAddr(mem.addr)) || trackedLiteralReferences(row.inst).length > 0;
});
const callRows = rows.filter((row) => isCall(row.inst));
const iyFlagRows = rows.filter((row) => isIyFlagOp(row.inst));
const terminalRows = rows.filter((row) => isStopInstruction(row.inst));

const directHardwareReadRows = rows.filter((row) => {
  const mem = absoluteMemAccessInfo(row.inst);
  return isInInstruction(row.inst) || (mem && mem.direction === 'read' && isKeyboardMmioAddr(mem.addr));
});

const primaryTarget = callRows.find((row) => row.inst.tag === 'call')?.inst.target;
const conditionalTargets = unique(
  callRows
    .filter((row) => row.inst.tag === 'call-conditional')
    .map((row) => `${upper(row.inst.condition)} ${hex(row.inst.target)}`),
);

console.log('# Phase 295: 0x04E966 Fifth-Level Keyboard Acquisition Disassembly');
console.log('');
console.log(`Start: ${hex(START)}`);
console.log('Mode: linear decode starting in ADL; CALLs are noted and fallthrough is followed.');
console.log(`Stop reason: ${stopReason}`);
console.log(`Instructions decoded: ${rows.length}`);
console.log(`Byte range: ${hex(byteStart)}-${hex(byteEnd)} (${decodedBytes} byte${decodedBytes === 1 ? '' : 's'})`);
console.log('');

console.log('## Key Findings');
console.log(`- IN instruction(s): ${inRows.length ? inRows.map((row) => `${renderInline(row)} [${inDescription(row.inst)}]`).join(', ') : 'none'}.`);
console.log(`- 0xE009xx LD/literal references: ${keyboardMmioRows.length ? keyboardMmioRows.map((row) => renderInline(row)).join(', ') : 'none'}.`);
console.log(`- IY flag operations: ${iyFlagRows.length ? iyFlagRows.map((row) => `${renderInline(row)} [OS flag touch]`).join(', ') : 'none'}.`);
console.log(`- CALL target(s): ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}.`);
console.log(`- Stop instruction(s): ${terminalRows.map((row) => renderInline(row)).join(', ') || 'none'}.`);
if (directHardwareReadRows.length) {
  console.log(`- Determination: this block contains direct hardware-read activity at ${directHardwareReadRows.map((row) => renderInline(row)).join(', ')}.`);
} else {
  console.log(`- Determination: this block still does not read keyboard hardware directly. It delegates first to ${primaryTarget !== undefined ? hex(primaryTarget) : 'none'}${conditionalTargets.length ? ` and may conditionally continue to ${conditionalTargets.join(', ')}` : ''}.`);
}
if (decodeError) {
  console.log(`- Decoder warning: ${decodeError.message}`);
}
console.log('');

console.log('## Full Instruction Listing');
console.log('| Address | Bytes | Mnemonic | Operands | Notes |');
console.log('|---|---|---|---|---|');
for (const row of rows) {
  console.log(`| ${hex(row.pc)} | ${row.bytes} | ${row.mnemonic} | ${row.operands || '&nbsp;'} | ${row.notes || '&nbsp;'} |`);
}
console.log('');

console.log('## Conclusion');
console.log(`- Verdict: ${directHardwareReadRows.length ? 'contains hardware keyboard reads' : 'delegates further; no IN or 0xE009xx keyboard MMIO read appears in this block'}.`);
console.log(`- First further delegation target: ${primaryTarget !== undefined ? hex(primaryTarget) : 'none'}.`);
console.log(`- Additional conditional delegation target(s): ${conditionalTargets.join(', ') || 'none'}.`);
