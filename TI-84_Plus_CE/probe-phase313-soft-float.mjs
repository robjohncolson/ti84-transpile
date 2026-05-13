#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const rom = readFileSync(ROM_PATH);
const incText = readFileSync(INC_PATH, 'utf8');

const VECTOR_BASE = 0x000200;
const VECTOR_END = 0x000400;
const ENTRY_SIZE = 4;
const FPUNPACK_ADDR = 0x0034A7;
const FLTMAX_ADDR = 0x003565;

const CORE_FUNCTIONS = [
  { name: '_fpunpack', addr: 0x0034A7, end: 0x0034CC, note: 'Unpack BC+A into mantissa / exponent / sign.' },
  { name: '_fpunpack_rhs', addr: 0x0034CC, end: 0x0034EE, note: 'Unpack HL+E into mantissa / exponent / sign.' },
  { name: '_fppack', addr: 0x0034EE, end: 0x003565, note: 'Normalize and repack A:BC + E + D.' },
  { name: '_fadd', addr: 0x003569, end: 0x0035C8, note: 'Exponent align, add/subtract, repack.' },
  { name: '_fcmp', addr: 0x0035C8, end: 0x0035E5, note: 'Packed compare; returns flags only.' },
  { name: '_fdiv', addr: 0x0035E5, end: 0x003663, note: 'Restoring divide, quotient in IY, repack.' },
  { name: '_ftol', addr: 0x003663, end: 0x003704, note: 'Float-to-long conversion.' },
  { name: '_ltof', addr: 0x003704, end: 0x00372B, note: 'Signed long-to-float conversion.' },
  { name: '_fmul', addr: 0x00372B, end: 0x0037EB, note: '24x24 multiply via MLT partial products.' },
  { name: '_fneg', addr: 0x0037EB, end: 0x0037FC, note: 'Flip sign bit unless the value is zero.' },
  { name: '_fsub', addr: 0x0037FC, end: 0x00380D, note: 'Flip rhs sign, call _fadd, restore rhs sign.' },
  { name: '_ultof?', addr: 0x00380D, end: 0x003818, note: 'Commented out as _ultof in ti84pceg.inc; tail-calls _fppack.' },
];

const FUNCTION_NOTES = new Map([
  ['_fpunpack', [
    'Uses byte 2 bit 7 as exponent bit 0 and A bit 7 as the sign bit.',
    'Forces the hidden leading 1 into the saved top mantissa byte.',
    'If the rebuilt exponent is zero, it flushes the operand to 0 and clears the sign.',
  ]],
  ['_fpunpack_rhs', [
    'Mirror unpacker for HL+E.',
    'Uses ADD HL,HL to pull byte 2 bit 7 into carry, then RL E to rebuild the exponent.',
  ]],
  ['_fppack', [
    'Inverse of the unpackers: normalizes a 24-bit mantissa plus one extra byte in A.',
    'Handles underflow by returning 0 and exposes FLTMAX as a separate literal at 0x003565.',
  ]],
  ['_fadd', [
    'Swaps operands so A/BC carries the smaller exponent before alignment.',
    'Right-shifts the smaller mantissa in 0x003593..0x0035A4 until the exponent delta reaches zero.',
    'Uses 0x0035BB for same-sign add, 0x0035B6 for opposite-sign subtract, then calls _fppack.',
  ]],
  ['_fcmp', [
    'Does not call _fpunpack directly.',
    'Calls 0x0023AD to compare the packed 32-bit words, then patches AF so callers can branch on Z/P/M.',
    'Returned flags behave like a subtraction of rhs minus lhs.',
  ]],
  ['_fdiv', [
    'Unpacks both operands, seeds the exponent with 0x96 + exp(lhs) - exp(rhs), and XORs the signs.',
    'The loop at 0x003614..0x00362A is a restoring divider with the quotient accumulated in IY.',
    'Finishes by rounding and packing through _fppack.',
  ]],
  ['_ftol', [
    'Unpacks BC+A, converts the biased exponent into a shift count, and shifts/sign-adjusts into BC+A.',
  ]],
  ['_ltof', [
    'Builds DE=0x96 and then relies on _fppack for normalization and final IEEE packing.',
  ]],
  ['_fmul', [
    'Computes sign = sign(lhs) XOR sign(rhs) and exponent seed = exp(lhs) + exp(rhs) - 0x80.',
    'The MLT sequence at 0x00376D..0x0037C8 is a bytewise 24x24 multiply with stack scratch.',
    'The final two SLA/ADC folds create the A:BC mantissa consumed by _fppack.',
  ]],
  ['_fneg', [
    'Toggles bit 7 of the high byte unless the value is exactly 0.',
  ]],
  ['_fsub', [
    'Implements subtraction by toggling E bit 7, calling _fadd, then restoring E.',
  ]],
  ['_ultof?', [
    'Tiny wrapper around _fppack with D=0 and E=0x96, matching the commented _ultof vector slot.',
  ]],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function signedDisp(value) {
  return value < 0 ? `${value}` : `+${value}`;
}

function parseVectorSymbols(text) {
  const byAddr = new Map();
  const pattern = /^(;?)\?([A-Za-z_][A-Za-z0-9_.]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;

  for (const match of text.matchAll(pattern)) {
    const commented = match[1] === ';';
    const name = match[2];
    const addr = Number.parseInt(match[3], 16);
    const existing = byAddr.get(addr);

    if (!existing || (!commented && existing.commented)) {
      byAddr.set(addr, { name, commented });
    }
  }

  return byAddr;
}

function isSoftFloatVectorName(name) {
  return /^_f/.test(name) || name === '_ultof' || name === 'sqrtf' || name === 'FLTMAX';
}

function readSoftFloatVectors() {
  const symbolByAddr = parseVectorSymbols(incText);
  const rows = [];

  for (let vector = VECTOR_BASE; vector < VECTOR_END; vector += ENTRY_SIZE) {
    const symbol = symbolByAddr.get(vector);
    if (!symbol || !isSoftFloatVectorName(symbol.name)) continue;

    const opcode = rom[vector];
    const target = rom[vector + 1] | (rom[vector + 2] << 8) | (rom[vector + 3] << 16);

    rows.push({
      vector,
      name: symbol.name,
      commented: symbol.commented,
      opcode,
      target,
    });
  }

  return rows.sort((a, b) => a.vector - b.vector);
}

function table(rows, columns) {
  const widths = columns.map((column) => {
    const headerWidth = column.label.length;
    const cellWidth = Math.max(...rows.map((row) => String(row[column.key] ?? '').length), 0);
    return Math.max(headerWidth, cellWidth);
  });

  const header = columns.map((column, i) => column.label.padEnd(widths[i])).join('  ');
  const rule = columns.map((_, i) => '-'.repeat(widths[i])).join('  ');
  const body = rows.map((row) =>
    columns.map((column, i) => String(row[column.key] ?? '').padEnd(widths[i])).join('  ')
  );

  return [header, rule, ...body].join('\n');
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.src}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-pair':
      return `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.pair}`;
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'alu-reg':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op} a, ${inst.src}`;
      }
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op} a, ${hex(inst.value, 2)}`;
      }
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'rotate-reg':
      return `${inst.op} ${inst.reg}`;
    case 'indexed-cb-rotate':
      return `${inst.operation} (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-res':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'scf':
      return 'scf';
    case 'ccf':
      return 'ccf';
    case 'rla':
      return 'rla';
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'neg':
      return 'neg';
    case 'mlt':
      return `mlt ${inst.reg}`;
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disassembleFunction(start, end) {
  const queue = [start];
  const seen = new Set();
  const lines = [];

  while (queue.length > 0) {
    let pc = queue.shift();

    while (pc >= start && pc < end && !seen.has(pc)) {
      const inst = decodeInstruction(rom, pc, 'adl');
      seen.add(pc);

      lines.push({
        addr: pc,
        bytes: bytesAt(pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        target: inst.target,
      });

      const next = pc + inst.length;

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (inst.target >= start && inst.target < end) queue.push(inst.target);
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
        if (inst.target >= start && inst.target < end) queue.push(inst.target);
        pc = inst.fallthrough;
        continue;
      }

      if (inst.tag === 'ret-conditional') {
        if (inst.fallthrough >= start && inst.fallthrough < end) queue.push(inst.fallthrough);
        break;
      }

      if (inst.tag === 'ret' || inst.tag === 'jp-indirect' || inst.tag === 'rst' || inst.tag === 'halt' || inst.tag === 'slp') {
        break;
      }

      pc = next;
    }
  }

  return lines.sort((a, b) => a.addr - b.addr);
}

function bodyHasCallTarget(lines, target) {
  return lines.some((line) => line.tag === 'call' && line.target === target);
}

function inferFloatFormat() {
  return {
    bytesPerFloat: 4,
    storage: 'IEEE-754 single precision, little-endian',
    callConvention: 'lhs = BC(low 24 bits) + A(high byte), rhs = HL(low 24 bits) + E(high byte)',
    layout: [
      'byte0: fraction bits 7..0',
      'byte1: fraction bits 15..8',
      'byte2: bit7 = exponent bit0, bits6..0 = fraction bits 22..16',
      'byte3: bit7 = sign, bits6..0 = exponent bits 7..1',
    ],
    unpackSummary: [
      '_fpunpack and _fpunpack_rhs rebuild the full 8-bit exponent and restore the hidden leading 1.',
      'Exponent 0 is treated as zero, so subnormals are flushed to 0.',
    ],
    fltMaxBytes: bytesAt(FLTMAX_ADDR, 4),
    fltMaxWord: '0x7F7FFFFF',
  };
}

function printDisassemblySection(fn, lines) {
  console.log('');
  console.log('='.repeat(88));
  console.log(`${fn.name} @ ${hex(fn.addr)}..${hex(fn.end)}`);
  console.log('='.repeat(88));
  console.log(`Role: ${fn.note}`);
  for (const note of FUNCTION_NOTES.get(fn.name) || []) {
    console.log(`- ${note}`);
  }
  console.log('');
  for (const line of lines) {
    console.log(`${hex(line.addr)}  ${line.bytes.padEnd(14)}  ${line.text}`);
  }
}

function main() {
  const vectors = readSoftFloatVectors();
  const vectorRows = vectors.map((entry) => ({
    vector: hex(entry.vector),
    name: entry.commented ? `${entry.name} (commented)` : entry.name,
    target: hex(entry.target),
    op: hex(entry.opcode, 2),
  }));

  const format = inferFloatFormat();
  const bodies = new Map();
  for (const fn of CORE_FUNCTIONS) {
    bodies.set(fn.name, disassembleFunction(fn.addr, fn.end));
  }

  const fpunpackChecks = [
    { name: '_fadd', result: bodyHasCallTarget(bodies.get('_fadd'), FPUNPACK_ADDR) },
    { name: '_fmul', result: bodyHasCallTarget(bodies.get('_fmul'), FPUNPACK_ADDR) },
    { name: '_fcmp', result: bodyHasCallTarget(bodies.get('_fcmp'), FPUNPACK_ADDR) },
  ];

  console.log('Phase 313 - Soft-float library decode');
  console.log('');
  console.log('Soft-float vector entries in 0x000200..0x000400');
  console.log(table(vectorRows, [
    { key: 'vector', label: 'Vector' },
    { key: 'name', label: 'Name' },
    { key: 'target', label: 'Target' },
    { key: 'op', label: 'Op' },
  ]));
  console.log('');
  console.log('Inferred float format');
  console.log(`- Bytes per float: ${format.bytesPerFloat}`);
  console.log(`- Storage: ${format.storage}`);
  console.log(`- Calling convention: ${format.callConvention}`);
  for (const line of format.layout) {
    console.log(`- ${line}`);
  }
  for (const line of format.unpackSummary) {
    console.log(`- ${line}`);
  }
  console.log(`- FLTMAX literal at ${hex(FLTMAX_ADDR)}: ${format.fltMaxBytes} = ${format.fltMaxWord}`);
  console.log('');
  console.log('_fpunpack direct-call checks');
  for (const check of fpunpackChecks) {
    const note = check.name === '_fcmp' && !check.result
      ? ' (expected false: _fcmp uses 0x0023AD instead)'
      : '';
    console.log(`- ${check.name}: ${check.result ? 'yes' : 'no'}${note}`);
  }

  for (const fn of CORE_FUNCTIONS) {
    printDisassemblySection(fn, bodies.get(fn.name));
  }
}

main();
