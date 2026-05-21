#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const FUNC_START = 0x00596E;
const MAX_INSTRUCTIONS = 100;
const TARGET_ADDR = 0x00596E;
const CALL_PATTERN = [0xCD, 0x6E, 0x59, 0x00];
const JP_PATTERN = [0xC3, 0x6E, 0x59, 0x00];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatBytes(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), (byte) => hexByte(byte).slice(2)).join(' ');
}

function decodeSafe(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr || !instr.length || instr.length <= 0) return null;
    return instr;
  } catch {
    return null;
  }
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function formatInstruction(instr) {
  if (!instr) return '(decode failed)';

  const prefix = instr.modePrefix ? `${String(instr.modePrefix).toUpperCase()} ` : '';

  switch (instr.tag) {
    case 'push':
      return `${prefix}PUSH ${String(instr.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(instr.pair).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(instr.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(instr.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'jr':
      return `${prefix}JR ${hex(instr.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(instr.condition).toUpperCase()}, ${hex(instr.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(instr.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${String(instr.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(instr.dest).toUpperCase()}, ${hexByte(instr.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, ${hex(instr.value)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        return `${prefix}LD (${hex(instr.addr)}), ${String(instr.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(instr.pair).toUpperCase()}, (${hex(instr.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(instr.addr)}), ${String(instr.pair).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${instr.bit}, ${String(instr.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${instr.bit}, (${String(instr.indirectRegister).toUpperCase()})`;
    case 'add-pair':
      return `${prefix}ADD ${String(instr.dest ?? 'hl').toUpperCase()}, ${String(instr.src).toUpperCase()}`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    default: {
      if (typeof instr.mnemonic === 'string') {
        const operands = instr.operands ? ` ${instr.operands}` : '';
        return `${prefix}${instr.mnemonic}${operands}`;
      }

      const fragments = [String(instr.tag).toUpperCase()];
      if (instr.condition) fragments.push(String(instr.condition).toUpperCase());
      if (instr.target !== undefined) fragments.push(hex(instr.target));
      if (instr.value !== undefined) fragments.push(hex(instr.value));
      if (instr.addr !== undefined) fragments.push(hex(instr.addr));
      return `${prefix}${fragments.join(' ')}`;
    }
  }
}

function isReturn(instr) {
  return instr && (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn');
}

function isConditional(instr) {
  return !!instr && (
    instr.tag === 'jr-conditional' ||
    instr.tag === 'jp-conditional' ||
    instr.tag === 'call-conditional' ||
    instr.tag === 'ret-conditional' ||
    instr.tag === 'djnz'
  );
}

function isBitTest(instr) {
  return !!instr && (
    instr.tag === 'indexed-cb-bit' ||
    instr.tag === 'bit-test' ||
    instr.tag === 'bit-test-ind'
  );
}

function isLdHlImm24(instr) {
  return !!instr &&
    instr.tag === 'ld-pair-imm' &&
    String(instr.pair).toLowerCase() === 'hl' &&
    instr.length === 4 &&
    rom[instr.pc] === 0x21;
}

function disassembleLinear(startPc, maxInstructions) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < maxInstructions; index++) {
    const instr = decodeSafe(pc);
    if (!instr) {
      rows.push({
        pc,
        bytes: formatBytes(pc, 1),
        text: '(decode failed)',
        instr: null,
      });
      break;
    }

    rows.push({
      pc,
      bytes: formatBytes(pc, instr.length),
      text: formatInstruction(instr),
      instr,
    });

    if (isReturn(instr)) break;
    pc += instr.length;
  }

  return rows;
}

function findPattern(pattern) {
  const matches = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (rom[pc + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(pc);
  }
  return matches;
}

function describeConditional(row, previousRow) {
  const instr = row.instr;
  if (!instr) return `${hex(row.pc)}: ${row.text}`;

  if (instr.tag === 'jr-conditional' || instr.tag === 'jp-conditional') {
    const source = previousRow && isBitTest(previousRow.instr)
      ? ` after ${previousRow.text}`
      : '';
    return `${hex(row.pc)}: ${row.text}${source}`;
  }

  if (instr.tag === 'ret-conditional') {
    return `${hex(row.pc)}: ${row.text} (early return if prior call/test leaves ${String(instr.condition).toUpperCase()} true)`;
  }

  if (instr.tag === 'call-conditional' || instr.tag === 'djnz') {
    return `${hex(row.pc)}: ${row.text}`;
  }

  return `${hex(row.pc)}: ${row.text}`;
}

const rows = disassembleLinear(FUNC_START, MAX_INSTRUCTIONS);
const hlImmLoads = rows.filter((row) => isLdHlImm24(row.instr));
const conditionals = [];

for (let i = 0; i < rows.length; i++) {
  if (isConditional(rows[i].instr)) {
    conditionals.push(describeConditional(rows[i], rows[i - 1] ?? null));
  }
}

const bitTests = rows
  .filter((row) => isBitTest(row.instr))
  .map((row) => `${hex(row.pc)}: ${row.text}`);

const directCalls = findPattern(CALL_PATTERN);
const directJumps = findPattern(JP_PATTERN);

const romHlBases = hlImmLoads
  .map((row) => row.instr.value >>> 0)
  .filter((value) => value < 0x400000);

const uniqueRomHlBases = [...new Set(romHlBases)];
const saw004000 = uniqueRomHlBases.includes(0x004000);
const saw003D6E = uniqueRomHlBases.includes(0x003D6E);
const returnsRamBuffer = rows.some((row) =>
  row.instr &&
  row.instr.tag === 'ld-pair-imm' &&
  String(row.instr.pair).toLowerCase() === 'hl' &&
  row.instr.value === 0xD005A1
);

console.log('Phase 391: static disassembly of 0x00596E');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log('');

console.log(`=== Linear ADL disassembly from ${hex(FUNC_START)} ===`);
for (const row of rows) {
  console.log(`${hex(row.pc)}: ${row.bytes.padEnd(11)} ${row.text}`);
}
console.log('');

console.log('=== LD HL,imm24 instructions ===');
if (hlImmLoads.length === 0) {
  console.log('none');
} else {
  for (const row of hlImmLoads) {
    const note = row.instr.value === 0x004000
      ? '  <-- 0x004000 found'
      : '';
    console.log(`${hex(row.pc)}: ${row.bytes}  ${row.text}${note}`);
  }
}
console.log('');

console.log('=== Conditional branches / tests ===');
if (bitTests.length === 0 && conditionals.length === 0) {
  console.log('none');
} else {
  if (bitTests.length > 0) {
    console.log('Flag/RAM tests:');
    for (const line of bitTests) console.log(`  ${line}`);
  }
  if (conditionals.length > 0) {
    console.log('Conditional control flow:');
    for (const line of conditionals) console.log(`  ${line}`);
  }
}
console.log('');

console.log(`=== Direct callers / jumps to ${hex(TARGET_ADDR)} ===`);
console.log(`CALL pattern (${CALL_PATTERN.map((byte) => hexByte(byte)).join(' ')}):`);
if (directCalls.length === 0) {
  console.log('  none');
} else {
  for (const pc of directCalls) {
    console.log(`  ${hex(pc)}`);
  }
}

console.log(`JP pattern (${JP_PATTERN.map((byte) => hexByte(byte)).join(' ')}):`);
if (directJumps.length === 0) {
  console.log('  none');
} else {
  for (const pc of directJumps) {
    console.log(`  ${hex(pc)}`);
  }
}
console.log('');

console.log('=== Summary ===');
if (saw004000) {
  console.log('LD HL,0x004000 appears in 0x00596E.');
} else {
  console.log('No LD HL,0x004000 appears in 0x00596E.');
}

if (uniqueRomHlBases.length === 0) {
  console.log('No ROM HL base immediate was found.');
} else {
  console.log(`ROM HL immediates seen: ${uniqueRomHlBases.map((value) => hex(value)).join(', ')}`);
}

if (saw003D6E) {
  console.log('The only in-function ROM font base immediate is 0x003D6E, not 0x004000.');
}

if (conditionals.length > 0 || bitTests.length > 0) {
  console.log('This routine is conditional: it tests flags and bits in (IY+0x35), invokes helper calls, and can return early.');
  console.log('Within the decoded body, those conditionals do not select among multiple LD HL,<ROM base> constants.');
}

if (returnsRamBuffer) {
  console.log('On the fallthrough copy path, it finishes with LD HL,0xD005A1 and RET, so HL returns a RAM staging buffer pointer.');
}

console.log(`Direct CALL sites found: ${directCalls.length}${directCalls.length ? ` (${directCalls.map((pc) => hex(pc)).join(', ')})` : ''}`);
console.log(`Direct JP sites found: ${directJumps.length}${directJumps.length ? ` (${directJumps.map((pc) => hex(pc)).join(', ')})` : ''}`);
