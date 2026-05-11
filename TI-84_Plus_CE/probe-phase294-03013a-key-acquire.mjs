#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const START = 0x03013A;
const MAX_INSTRUCTIONS = 500;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
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
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `${formatIndirect(inst.dest)}, ${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${formatIndirect(inst.src)}` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(HL), ${hexByte(inst.value)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}` };
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
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)}, ${upper(inst.src)}` };
    case 'adc-pair':
      return { mnemonic: 'ADC', operands: `HL, ${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL, ${upper(inst.src)}` };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'rotate-ind':
      return { mnemonic: upper(inst.op), operands: formatIndirect(inst.indirectRegister) };
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
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)}, (C)` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A, (${hexByte(inst.port)})` };
    case 'in0':
      return { mnemonic: 'IN0', operands: `${upper(inst.reg)}, (${hexByte(inst.port)})` };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'reti':
      return { mnemonic: 'RETI', operands: '' };
    case 'retn':
      return { mnemonic: 'RETN', operands: '' };
    case 'lea': {
      const sign = inst.displacement < 0 ? '-' : '+';
      return { mnemonic: 'LEA', operands: `${upper(inst.dest)}, ${upper(inst.base)}${sign}${hexByte(Math.abs(inst.displacement))}` };
    }
    case 'rst':
      return { mnemonic: 'RST', operands: hex(inst.target, 2) };
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

function isConditionalBranch(inst) {
  return inst?.tag === 'jp-conditional' || inst?.tag === 'jr-conditional' || inst?.tag === 'djnz';
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
  if (inst?.tag === 'ld-pair-imm') {
    if (isKeyboardMmioAddr(inst.value)) {
      refs.push({ addr: inst.value, label: 'keyboard MMIO literal', register: inst.pair });
    }
    if (inst.value === D0058C) {
      refs.push({ addr: inst.value, label: 'D0058C literal', register: inst.pair });
    }
    if (inst.value === D0058E) {
      refs.push({ addr: inst.value, label: 'D0058E literal', register: inst.pair });
    }
  }
  return refs;
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

function renderInline(row) {
  return `${hex(row.pc)} (${row.mnemonic}${row.operands ? ` ${row.operands}` : ''})`;
}

function formatBranchPaths(row) {
  return `taken -> ${hex(row.inst.target)}, fallthrough -> ${hex(row.pc + row.length)}`;
}

function mmioReferenceTexts(row) {
  const parts = [];
  const mem = absoluteMemAccessInfo(row.inst);
  if (mem && isKeyboardMmioAddr(mem.addr)) {
    parts.push(`${mem.direction} ${hex(mem.addr)}`);
  }
  for (const ref of trackedLiteralReferences(row.inst)) {
    if (isKeyboardMmioAddr(ref.addr)) {
      parts.push(`literal ${hex(ref.addr)} -> ${upper(ref.register)}`);
    }
  }
  return parts;
}

function trackedAccessText(row, address, label) {
  const mem = absoluteMemAccessInfo(row.inst);
  if (mem && mem.addr === address) {
    return `${renderInline(row)} ${mem.direction}`;
  }

  for (const ref of trackedLiteralReferences(row.inst)) {
    if (ref.addr === address) {
      return `${renderInline(row)} literal -> ${label}`;
    }
  }

  return null;
}

function notePieces(row) {
  const { inst } = row;
  const notes = [];
  const mem = absoluteMemAccessInfo(inst);

  if (isInInstruction(inst)) {
    notes.push(inDescription(inst));
  }

  if (isCall(inst)) {
    const prefix = inst.tag === 'call-conditional' ? `${upper(inst.condition)} ` : '';
    notes.push(`CALL target ${prefix}${hex(inst.target)}`.trim());
  }

  if (isConditionalBranch(inst)) {
    notes.push(`branch ${formatBranchPaths(row)}`);
  } else if (isUnconditionalJump(inst)) {
    if (inst.tag === 'jp-indirect') {
      notes.push(`unconditional jump via ${formatIndirect(inst.indirectRegister)}`);
    } else {
      notes.push(`unconditional jump -> ${hex(inst.target)}`);
    }
  }

  if (mem && isKeyboardMmioAddr(mem.addr)) {
    notes.push(`keyboard MMIO ${mem.direction} ${hex(mem.addr)}`);
  }

  if (mem && mem.addr === D0058C) {
    notes.push(`D0058C ${mem.direction}`);
  }

  if (mem && mem.addr === D0058E) {
    notes.push(`D0058E ${mem.direction}`);
  }

  for (const ref of trackedLiteralReferences(inst)) {
    notes.push(`${ref.label} loaded into ${upper(ref.register)}`);
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
let decodeError = null;

while (rows.length < MAX_INSTRUCTIONS && pc < rom.length) {
  let inst;

  try {
    inst = decodeInstruction(rom, pc, mode);
  } catch (error) {
    decodeError = {
      pc,
      message: error instanceof Error ? error.message : String(error),
    };
    break;
  }

  const length = Math.max(1, inst?.length ?? 1);
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
  if (inst?.nextMode) {
    mode = inst.nextMode;
  }

  if (isStopInstruction(inst)) {
    break;
  }
}

if (!rows.length) {
  console.log('# Phase 294: 0x03013A Key Acquisition Delegate Linear Disassembly');
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
const totalBytes = rows.reduce((sum, row) => sum + row.length, 0);

const inRows = rows.filter((row) => isInInstruction(row.inst));
const callRows = rows.filter((row) => isCall(row.inst));
const conditionalBranchRows = rows.filter((row) => isConditionalBranch(row.inst));
const mmioRows = rows.filter((row) => mmioReferenceTexts(row).length > 0);
const d0058cRows = rows.filter((row) => trackedAccessText(row, D0058C, 'D0058C'));
const d0058eRows = rows.filter((row) => trackedAccessText(row, D0058E, 'D0058E'));

let stopReason = `stopped at instruction cap ${MAX_INSTRUCTIONS}`;
if (decodeError) {
  stopReason = `decoder error at ${hex(decodeError.pc)}: ${decodeError.message}`;
} else if (isStopInstruction(finalRow.inst)) {
  stopReason = `stopped at ${finalRow.mnemonic}${finalRow.operands ? ` ${finalRow.operands}` : ''} at ${hex(finalRow.pc)}`;
} else if (pc >= rom.length) {
  stopReason = `reached ROM end at ${hex(pc)}`;
}

console.log('# Phase 294: 0x03013A Key Acquisition Delegate Linear Disassembly');
console.log('');
console.log(`Start: ${hex(START)}`);
console.log('Mode: linear decode starting in ADL; CALLs are noted and fallthrough is followed.');
console.log(`Stop reason: ${stopReason}`);
console.log(`Instructions decoded: ${rows.length}`);
console.log(`Byte range: ${hex(byteStart)}-${hex(byteEnd)} (${totalBytes} byte${totalBytes === 1 ? '' : 's'})`);
console.log('');

console.log('## Key Findings');
if (inRows.length) {
  console.log(`- IN instruction(s): ${inRows.map((row) => `${renderInline(row)} [${inDescription(row.inst)}]`).join(', ')}.`);
} else {
  const callTargets = unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none';
  console.log(`- IN instruction(s): none. No direct port-read instruction was found in the ${hex(byteStart)}-${hex(byteEnd)} linear stream, so deeper analysis should continue into CALL target(s): ${callTargets}.`);
}
console.log(`- Keyboard MMIO references in ${hex(KEYBOARD_MMIO_START)}-${hex(KEYBOARD_MMIO_END)}: ${mmioRows.length ? mmioRows.map((row) => `${renderInline(row)} [${mmioReferenceTexts(row).join('; ')}]`).join(', ') : 'none'}.`);
console.log(`- D0058C access/reference sites: ${d0058cRows.length ? d0058cRows.map((row) => trackedAccessText(row, D0058C, 'D0058C')).join(', ') : 'none'}.`);
console.log(`- D0058E access/reference sites: ${d0058eRows.length ? d0058eRows.map((row) => trackedAccessText(row, D0058E, 'D0058E')).join(', ') : 'none'}.`);
console.log(`- CALL target(s): ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}.`);
console.log(`- Conditional branch site(s): ${conditionalBranchRows.length ? conditionalBranchRows.map((row) => `${renderInline(row)} [${formatBranchPaths(row)}]`).join(', ') : 'none'}.`);
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

console.log('## Summary');
console.log(`- Total instructions: ${rows.length}`);
console.log(`- Total bytes: ${totalBytes}`);
console.log(`- Full byte range covered: ${hex(byteStart)}-${hex(byteEnd)}`);
console.log(`- All CALL targets: ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}`);
console.log(`- All IN instructions: ${inRows.length ? inRows.map((row) => `${hex(row.pc)} [${inDescription(row.inst)}]`).join(', ') : 'none'}`);
console.log(`- All keyboard MMIO references: ${mmioRows.length ? mmioRows.map((row) => `${hex(row.pc)} [${mmioReferenceTexts(row).join('; ')}]`).join(', ') : 'none'}`);
console.log(`- All D0058C accesses/references: ${d0058cRows.length ? d0058cRows.map((row) => `${hex(row.pc)} [${trackedAccessText(row, D0058C, 'D0058C').replace(/^0x[0-9A-F]+ \(|\)$/g, '')}]`).join(', ') : 'none'}`);
console.log(`- All D0058E accesses/references: ${d0058eRows.length ? d0058eRows.map((row) => `${hex(row.pc)} [${trackedAccessText(row, D0058E, 'D0058E').replace(/^0x[0-9A-F]+ \(|\)$/g, '')}]`).join(', ') : 'none'}`);
if (!inRows.length) {
  console.log(`- No IN instructions found. The next layer to inspect is one of the CALL target(s): ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}.`);
}
