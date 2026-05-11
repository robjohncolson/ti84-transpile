#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const START = 0x02FD8F;
const MAX_INSTRUCTIONS = 300;
const D0058C = 0xD0058C;
const KEYBOARD_MMIO_START = 0xE00900;
const KEYBOARD_MMIO_END = 0xE009FF;

function hex(value, width = 6) {
  return `0x${Number(value).toString(16).toUpperCase().padStart(width, '0')}`;
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

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-rotate':
      return { mnemonic: upper(inst.operation), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
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
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister)})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
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

function isJump(inst) {
  return inst?.tag === 'jp' || inst?.tag === 'jp-conditional' || inst?.tag === 'jp-indirect';
}

function isCp(inst) {
  return inst?.tag === 'alu-imm' && inst.op === 'cp';
}

function isReturnBoundary(inst) {
  return ['ret', 'ret-conditional', 'reti', 'retn'].includes(inst?.tag);
}

function isTerminalReturn(inst) {
  return ['ret', 'reti', 'retn'].includes(inst?.tag);
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

function notePieces(inst) {
  const notes = [];
  const mem = absoluteMemAccessInfo(inst);

  if (isInInstruction(inst)) {
    if (inst.tag === 'in-reg') notes.push('IN instruction via BC port');
    else if (inst.tag === 'in-imm') notes.push(`IN instruction from port ${hexByte(inst.port)}`);
    else if (inst.tag === 'in0') notes.push(`IN0 instruction from port ${hexByte(inst.port)}`);
    else notes.push(`IN-family instruction ${upper(inst.tag)}`);
  }

  if (isCall(inst)) {
    const prefix = inst.tag === 'call-conditional' ? `${upper(inst.condition)} ` : '';
    notes.push(`CALL target ${prefix}${hex(inst.target)}`.trim());
  }

  if (isJump(inst)) {
    if (inst.tag === 'jp-indirect') notes.push(`JP indirect via ${upper(inst.indirectRegister)}`);
    else {
      const prefix = inst.tag === 'jp-conditional' ? `${upper(inst.condition)} ` : '';
      notes.push(`JP target ${prefix}${hex(inst.target)}`.trim());
    }
  }

  if (mem && isKeyboardMmioAddr(mem.addr)) {
    notes.push(`keyboard MMIO ${mem.direction} ${hex(mem.addr)}`);
  }

  if (mem && mem.addr === D0058C) {
    notes.push(`D0058C ${mem.direction}`);
  }

  if (isCp(inst)) {
    notes.push(`CP ${hexByte(inst.value)}`);
  }

  if (isReturnBoundary(inst)) {
    notes.push('return boundary');
  }

  return notes.join('; ');
}

const rows = [];
let pc = START;

while (rows.length < MAX_INSTRUCTIONS && pc < rom.length) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const length = Math.max(1, inst?.length ?? 1);
  const formatted = formatInstruction(inst);

  rows.push({
    pc,
    length,
    bytes: bytesToHex(rom.subarray(pc, pc + length)),
    inst,
    mnemonic: formatted.mnemonic,
    operands: formatted.operands,
    notes: notePieces(inst),
  });

  pc += length;
  if (isTerminalReturn(inst)) break;
}

const totalBytes = rows.reduce((sum, row) => sum + row.length, 0);
const inRows = rows.filter((row) => isInInstruction(row.inst));
const callRows = rows.filter((row) => isCall(row.inst));
const jpRows = rows.filter((row) => isJump(row.inst));
const cpRows = rows.filter((row) => isCp(row.inst));
const mmioRows = rows.filter((row) => {
  const mem = absoluteMemAccessInfo(row.inst);
  return mem && isKeyboardMmioAddr(mem.addr);
});
const d0058cRows = rows.filter((row) => {
  const mem = absoluteMemAccessInfo(row.inst);
  return mem && mem.addr === D0058C;
});
const finalRow = rows[rows.length - 1];
const stopReason = isTerminalReturn(finalRow?.inst)
  ? `stopped at ${finalRow.mnemonic} ${hex(finalRow.pc)}`
  : `stopped at instruction cap ${MAX_INSTRUCTIONS}`;

console.log('# Phase 293: 0x02FD8F Key Acquisition Linear Disassembly');
console.log('');
console.log(`Start: ${hex(START)}`);
console.log('Mode: ADL linear decode only; branch targets are reported but not followed.');
console.log(`Stop reason: ${stopReason}`);
console.log(`Instructions decoded: ${rows.length}`);
console.log(`Bytes decoded: ${totalBytes}`);
console.log('');

console.log('## Key Findings');
console.log(`- Direct IN instructions: ${inRows.length ? inRows.map((row) => `${hex(row.pc)} (${row.mnemonic}${row.operands ? ` ${row.operands}` : ''})`).join(', ') : 'none'}.`);
console.log(`- Absolute keyboard MMIO accesses in ${hex(KEYBOARD_MMIO_START)}-${hex(KEYBOARD_MMIO_END)}: ${mmioRows.length ? mmioRows.map((row) => `${hex(row.pc)} (${row.mnemonic} ${row.operands})`).join(', ') : 'none'}.`);
console.log(`- D0058C access sites: ${d0058cRows.length ? d0058cRows.map((row) => `${hex(row.pc)} (${row.mnemonic} ${row.operands})`).join(', ') : 'none'}.`);
console.log(`- CALL targets found: ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}.`);
console.log(`- JP targets found: ${unique(jpRows.map((row) => row.inst.target === undefined ? `(${upper(row.inst.indirectRegister)})` : hex(row.inst.target))).join(', ') || 'none'}.`);
console.log(`- CP sites: ${cpRows.length ? cpRows.map((row) => `${hex(row.pc)}=${hexByte(row.inst.value)}`).join(', ') : 'none'}.`);
console.log(`- Return boundaries: ${rows.filter((row) => isReturnBoundary(row.inst)).map((row) => `${hex(row.pc)} (${row.mnemonic}${row.operands ? ` ${row.operands}` : ''})`).join(', ') || 'none'}.`);
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
console.log(`- IN instruction count: ${inRows.length}`);
console.log(`- CALL targets found: ${unique(callRows.map((row) => hex(row.inst.target))).join(', ') || 'none'}`);
console.log(`- Keyboard MMIO accessed: ${mmioRows.length ? 'yes' : 'no'}`);
