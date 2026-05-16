#!/usr/bin/env node

import { readFileSync } from 'fs';
import process from 'process';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = new Uint8Array(readFileSync(ROM_PATH));

const TABLE_BASE = 0x08C958;
const TABLE_STRIDE = 3;
const ENTRY_COUNT = 28;
const WINDOW_BYTES = 30;
const MAX_INSTRUCTIONS = 10;
const RAM_MBASE = 0xD0;
const SHORT_PREFIXES = new Set(['sis', 'lis']);

// Local Phase 307/308-style sequential scan codes. These are the codes used
// by the repo's existing key/token probes (for example 0x09=ENTER, 0x31=GRAPH).
const SDK_SCAN_LABELS = new Map([
  [0x00, 'NONE/DOWN*'],
  [0x01, 'DOWN'],
  [0x02, 'LEFT'],
  [0x03, 'RIGHT'],
  [0x04, 'UP'],
  [0x09, 'ENTER'],
  [0x0A, '+'],
  [0x0B, '-'],
  [0x0C, '*'],
  [0x0D, '/'],
  [0x0E, '^'],
  [0x0F, 'CLEAR'],
  [0x11, '(-)'],
  [0x12, '3'],
  [0x13, '6'],
  [0x14, '9'],
  [0x15, ')'],
  [0x16, 'TAN'],
  [0x17, 'VARS'],
  [0x19, '.'],
  [0x1A, '2'],
  [0x1B, '5'],
  [0x1C, '8'],
  [0x1D, '('],
  [0x1E, 'COS'],
  [0x1F, 'PRGM'],
  [0x20, 'STAT'],
  [0x21, '0'],
  [0x22, '1'],
  [0x23, '4'],
  [0x24, '7'],
  [0x25, ','],
  [0x26, 'SIN'],
  [0x27, 'APPS'],
  [0x28, 'X,T,theta,n'],
  [0x2A, 'STO>'],
  [0x2B, 'LN'],
  [0x2C, 'LOG'],
  [0x2D, 'x^2'],
  [0x2E, 'x^-1'],
  [0x2F, 'MATH'],
  [0x30, 'ALPHA'],
  [0x31, 'GRAPH'],
  [0x32, 'TRACE'],
  [0x33, 'ZOOM'],
  [0x34, 'WINDOW'],
  [0x35, 'Y='],
  [0x36, '2ND'],
  [0x37, 'MODE'],
  [0x38, 'DEL'],
]);

// Raw keyboard-matrix nibble codes: (keyMatrixIndex << 4) | bit.
const KEY_MATRIX_ROWS = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP'],
  ['ENTER', '+', '-', '*', '/', '^', 'CLEAR'],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS'],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

const RAW_MATRIX_LABELS = new Map();
for (let keyMatrixIndex = 0; keyMatrixIndex < KEY_MATRIX_ROWS.length; keyMatrixIndex += 1) {
  const row = KEY_MATRIX_ROWS[keyMatrixIndex];
  for (let bit = 0; bit < row.length; bit += 1) {
    const label = row[bit];
    if (label) {
      RAW_MATRIX_LABELS.set((keyMatrixIndex << 4) | bit, label);
    }
  }
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function truncate(value, width) {
  const text = String(value);
  if (text.length <= width) {
    return text;
  }
  return `${text.slice(0, Math.max(0, width - 3))}...`;
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function signedDisp(value) {
  const byte = (value ?? 0) & 0xFF;
  const signed = byte < 0x80 ? byte : byte - 0x100;
  return signed < 0 ? `-${hexByte(-signed)}` : `+${hexByte(signed)}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function effectiveAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (SHORT_PREFIXES.has(inst.modePrefix)) {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function formatAddress(inst) {
  const value = effectiveAddress(inst);
  return value === null ? '???' : hex(value);
}

function formatIndexed(inst) {
  return `(${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through to a raw-byte placeholder.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    modePrefix: null,
  };
}

function mnemonicFor(inst) {
  switch (inst?.tag) {
    case 'call':
    case 'call-conditional':
      return 'CALL';
    case 'jp':
    case 'jp-conditional':
    case 'jp-indirect':
      return 'JP';
    case 'jr':
    case 'jr-conditional':
      return 'JR';
    case 'ret':
    case 'ret-conditional':
    case 'reti':
    case 'retn':
      return 'RET';
    case 'push':
      return 'PUSH';
    case 'pop':
      return 'POP';
    case 'ld-pair-imm':
    case 'ld-pair-mem':
    case 'ld-mem-pair':
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-mem':
    case 'ld-mem-reg':
    case 'ld-reg-ind':
    case 'ld-ind-reg':
    case 'ld-ind-imm':
    case 'ld-reg-ixd':
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
    case 'ld-sp-hl':
    case 'ld-sp-pair':
    case 'ld-special':
      return 'LD';
    case 'inc-reg':
    case 'inc-pair':
    case 'inc-ixd':
      return 'INC';
    case 'dec-reg':
    case 'dec-pair':
    case 'dec-ixd':
      return 'DEC';
    case 'add-pair':
      return 'ADD';
    case 'adc-pair':
      return 'ADC';
    case 'sbc-pair':
      return 'SBC';
    case 'alu-imm':
    case 'alu-reg':
    case 'alu-ixd':
      return upper(inst.op);
    case 'bit-test':
    case 'bit-test-ind':
    case 'indexed-cb-bit':
      return 'BIT';
    case 'bit-set':
    case 'bit-set-ind':
    case 'indexed-cb-set':
      return 'SET';
    case 'bit-res':
    case 'bit-res-ind':
    case 'indexed-cb-res':
      return 'RES';
    case 'rotate-reg':
    case 'rotate-ind':
    case 'indexed-cb-rotate':
      return upper(inst.operation ?? inst.op ?? 'ROT');
    case 'rst':
      return 'RST';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'ex-af':
    case 'exx':
    case 'ex-de-hl':
    case 'ex-sp-hl':
      return 'EX';
    case 'scf':
      return 'SCF';
    case 'ccf':
      return 'CCF';
    case 'cpl':
      return 'CPL';
    case 'daa':
      return 'DAA';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'djnz':
      return 'DJNZ';
    case 'db':
      return 'DB';
    default:
      return upper(inst?.tag ?? 'UNKNOWN');
  }
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `call ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(inst, `jp (${upper(inst.indirectRegister ?? 'hl')})`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'ret');
    case 'ret-conditional':
      return withPrefix(inst, `ret ${upper(inst.condition)}`);
    case 'reti':
      return withPrefix(inst, 'reti');
    case 'retn':
      return withPrefix(inst, 'retn');
    case 'push':
      return withPrefix(inst, `push ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `pop ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${upper(inst.pair)}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${formatAddress(inst)}), ${upper(inst.pair)}`)
        : withPrefix(inst, `ld ${upper(inst.pair)}, (${formatAddress(inst)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${formatAddress(inst)}), ${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${upper(inst.dest)}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${upper(inst.dest)}, (${formatAddress(inst)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${formatAddress(inst)}), ${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${upper(inst.dest)}, (${upper(inst.src ?? inst.pair)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${upper(inst.dest ?? inst.pair)}), ${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `ld (HL), ${hexByte(inst.value)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${upper(inst.dest)}, ${formatIndexed(inst)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst)}, ${upper(inst.src)}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst)}, ${hexByte(inst.value)}`);
    case 'ld-sp-hl':
      return withPrefix(inst, 'ld SP, HL');
    case 'ld-sp-pair':
      return withPrefix(inst, `ld SP, ${upper(inst.pair)}`);
    case 'ld-special':
      return withPrefix(inst, `ld ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'inc-reg':
      return withPrefix(inst, `inc ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `dec ${upper(inst.reg)}`);
    case 'inc-pair':
      return withPrefix(inst, `inc ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `dec ${upper(inst.pair)}`);
    case 'inc-ixd':
      return withPrefix(inst, `inc ${formatIndexed(inst)}`);
    case 'dec-ixd':
      return withPrefix(inst, `dec ${formatIndexed(inst)}`);
    case 'add-pair':
      return withPrefix(inst, `add ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'adc-pair':
      return withPrefix(inst, `adc HL, ${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `sbc HL, ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-ixd':
      return withPrefix(inst, `${upper(inst.op)} ${formatIndexed(inst)}`);
    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-test-ind':
      return withPrefix(inst, `bit ${inst.bit}, (HL)`);
    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-set-ind':
      return withPrefix(inst, `set ${inst.bit}, (HL)`);
    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-res-ind':
      return withPrefix(inst, `res ${inst.bit}, (HL)`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${upper(inst.operation ?? inst.op)} ${upper(inst.reg)}`);
    case 'rotate-ind':
      return withPrefix(inst, `${upper(inst.operation ?? inst.op)} (HL)`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${upper(inst.operation ?? inst.op ?? 'ROT')} ${formatIndexed(inst)}`);
    case 'rst':
      return withPrefix(inst, `rst ${hexByte(inst.target ?? inst.vector)}`);
    case 'di':
      return withPrefix(inst, 'di');
    case 'ei':
      return withPrefix(inst, 'ei');
    case 'nop':
      return withPrefix(inst, 'nop');
    case 'halt':
      return withPrefix(inst, 'halt');
    case 'ex-af':
      return withPrefix(inst, "ex AF, AF'");
    case 'exx':
      return withPrefix(inst, 'exx');
    case 'ex-de-hl':
      return withPrefix(inst, 'ex DE, HL');
    case 'ex-sp-hl':
      return withPrefix(inst, 'ex (SP), HL');
    case 'scf':
      return withPrefix(inst, 'scf');
    case 'ccf':
      return withPrefix(inst, 'ccf');
    case 'cpl':
      return withPrefix(inst, 'cpl');
    case 'daa':
      return withPrefix(inst, 'daa');
    case 'rlca':
      return withPrefix(inst, 'rlca');
    case 'rrca':
      return withPrefix(inst, 'rrca');
    case 'rla':
      return withPrefix(inst, 'rla');
    case 'rra':
      return withPrefix(inst, 'rra');
    case 'djnz':
      return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'db':
      return withPrefix(inst, `db ${hexByte(inst.value)}`);
    default:
      return withPrefix(inst, inst?.tag ?? 'unknown');
  }
}

function describeScanCode(value) {
  if (SDK_SCAN_LABELS.has(value)) {
    return `sdk:${SDK_SCAN_LABELS.get(value)}`;
  }
  if (RAW_MATRIX_LABELS.has(value)) {
    return `mmio:${RAW_MATRIX_LABELS.get(value)}`;
  }
  return 'unmapped';
}

function disassembleWindow(address) {
  const rows = [];
  let pc = address;
  let consumed = 0;

  while (pc < rom.length && consumed < WINDOW_BYTES && rows.length < MAX_INSTRUCTIONS) {
    const inst = safeDecode(pc);
    const length = Math.max(1, inst.length || 1);
    const bytes = bytesToHex(rom.subarray(pc, Math.min(rom.length, pc + length)));
    const text = formatInstruction(inst);
    const cpValue = inst.tag === 'alu-imm' && inst.op === 'cp' ? (inst.value & 0xFF) : null;

    rows.push({
      pc,
      bytes,
      length,
      mnemonic: mnemonicFor(inst),
      text,
      cpValue,
    });

    pc += length;
    consumed += length;
  }

  return rows;
}

function readHandlers() {
  const handlers = [];

  for (let index = 0; index < ENTRY_COUNT; index += 1) {
    const offset = TABLE_BASE + index * TABLE_STRIDE;
    const address = read24LE(rom, offset);
    const rows = disassembleWindow(address);
    const counts = new Map();

    for (const row of rows) {
      if (row.cpValue !== null) {
        counts.set(row.cpValue, (counts.get(row.cpValue) ?? 0) + 1);
      }
    }

    const comparisons = Array.from(counts, ([value, count]) => ({
      value,
      count,
      label: describeScanCode(value),
    }));

    handlers.push({
      index,
      address,
      rows,
      comparisons,
    });
  }

  return handlers;
}

function formatComparison(compare) {
  const suffix = compare.count > 1 ? ` x${compare.count}` : '';
  return `${hexByte(compare.value)} [${compare.label}]${suffix}`;
}

function printSummaryTable(handlers) {
  console.log('=== Summary Table ===');
  console.log('');
  console.log(
    `${pad('IDX', 4)}${pad('ADDRESS', 12)}${pad('CP SCAN CODES', 44)}MNEMONICS`,
  );
  console.log('-'.repeat(120));

  for (const handler of handlers) {
    const cpText = handler.comparisons.length > 0
      ? handler.comparisons.map(formatComparison).join(', ')
      : '-';
    const mnemonicText = handler.rows.map((row) => row.mnemonic).join(' ');

    console.log(
      `${pad(handler.index, 4)}${pad(hex(handler.address), 12)}${pad(truncate(cpText, 42), 44)}${truncate(mnemonicText, 58)}`,
    );
  }

  console.log('');
}

function printDetail(handlers) {
  console.log('=== First 30 Bytes / First ~10 Instructions Per Handler ===');
  console.log('');

  for (const handler of handlers) {
    const cpText = handler.comparisons.length > 0
      ? handler.comparisons.map(formatComparison).join(', ')
      : 'none';

    console.log(`[${handler.index}] ${hex(handler.address)}  CP: ${cpText}`);
    for (const row of handler.rows) {
      console.log(`  ${hex(row.pc)}  ${pad(row.bytes, 18)}  ${row.text}`);
    }
    console.log('');
  }
}

function main() {
  const handlers = readHandlers();
  const tableEnd = TABLE_BASE + ENTRY_COUNT * TABLE_STRIDE - 1;

  console.log('Phase 343: all 28 context table handlers');
  console.log(`ROM: TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
  console.log(`Table: ${hex(TABLE_BASE)}..${hex(tableEnd)} (${ENTRY_COUNT} entries, 3-byte little-endian stride)`);
  console.log(`Decode window: first ${WINDOW_BYTES} bytes, capped at ${MAX_INSTRUCTIONS} instructions`);
  console.log('Scan labels: prefer repo-local sequential SDK codes (for example 0x09=ENTER, 0x31=GRAPH);');
  console.log('             fall back to raw keyMatrix nibble codes ((keyMatrixIndex << 4) | bit) when needed.');
  console.log('');

  printSummaryTable(handlers);
  printDetail(handlers);
}

main();
