#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

import { pathToFileURL } from 'node:url';
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const rom = fs.readFileSync(ROM_PATH);

const START_PC = 0x005A75;
const MAX_INSTRUCTIONS = 200;
const PATTERN_SCAN_END = 0x005BFF;
const TARGET_OUTPUT = 0xD0058C;
const NEARBY_DELTA = 0x20;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(base).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function formatInstruction(instr) {
  if (!instr) return '???';

  if (typeof instr.mnemonic === 'string') {
    const operands = instr.operands ? ` ${instr.operands}` : '';
    return `${instr.mnemonic}${operands}`;
  }

  let text;
  switch (instr.tag) {
    case 'nop': text = 'NOP'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'ret': text = 'RET'; break;
    case 'reti': text = 'RETI'; break;
    case 'retn': text = 'RETN'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'mlt': text = `MLT ${String(instr.reg).toUpperCase()}`; break;
    case 'push': text = `PUSH ${String(instr.pair).toUpperCase()}`; break;
    case 'pop': text = `POP ${String(instr.pair).toUpperCase()}`; break;
    case 'jp': text = `JP ${hex(instr.target)}`; break;
    case 'jr': text = `JR ${hex(instr.target)}`; break;
    case 'call': text = `CALL ${hex(instr.target)}`; break;
    case 'jp-conditional': text = `JP ${String(instr.condition).toUpperCase()},${hex(instr.target)}`; break;
    case 'jr-conditional': text = `JR ${String(instr.condition).toUpperCase()},${hex(instr.target)}`; break;
    case 'call-conditional': text = `CALL ${String(instr.condition).toUpperCase()},${hex(instr.target)}`; break;
    case 'ret-conditional': text = `RET ${String(instr.condition).toUpperCase()}`; break;
    case 'ld-pair-imm':
      text = `LD ${String(instr.pair).toUpperCase()},${hex(instr.value)}`;
      break;
    case 'ld-reg-imm':
      text = `LD ${String(instr.dest).toUpperCase()},${hexByte(instr.value)}`;
      break;
    case 'ld-reg-reg':
      text = `LD ${String(instr.dest).toUpperCase()},${String(instr.src).toUpperCase()}`;
      break;
    case 'ld-reg-mem':
      text = `LD ${String(instr.dest).toUpperCase()},(${hex(instr.addr)})`;
      break;
    case 'ld-mem-reg':
      text = `LD (${hex(instr.addr)}),${String(instr.src).toUpperCase()}`;
      break;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        text = `LD (${hex(instr.addr)}),${String(instr.pair).toUpperCase()}`;
      } else {
        text = `LD ${String(instr.pair).toUpperCase()},(${hex(instr.addr)})`;
      }
      break;
    case 'ld-mem-pair':
      text = `LD (${hex(instr.addr)}),${String(instr.pair).toUpperCase()}`;
      break;
    case 'ld-reg-ind':
      text = `LD ${String(instr.dest).toUpperCase()},(${String(instr.src).toUpperCase()})`;
      break;
    case 'ld-ind-reg':
      text = `LD (${String(instr.dest).toUpperCase()}),${String(instr.src).toUpperCase()}`;
      break;
    case 'ld-ind-imm':
      text = `LD (HL),${hexByte(instr.value)}`;
      break;
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
      text = `LD ${String(instr.dest).toUpperCase()},${formatIndexed(instr.indexRegister ?? instr.indexReg, instr.displacement ?? 0)}`;
      break;
    case 'indexed-cb-bit':
      text = `BIT ${instr.bit},${formatIndexed(instr.indexRegister, instr.displacement)}`;
      break;
    case 'indexed-cb-res':
      text = `RES ${instr.bit},${formatIndexed(instr.indexRegister, instr.displacement)}`;
      break;
    case 'indexed-cb-set':
      text = `SET ${instr.bit},${formatIndexed(instr.indexRegister, instr.displacement)}`;
      break;
    case 'inc-pair':
      text = `INC ${String(instr.pair).toUpperCase()}`;
      break;
    case 'dec-pair':
      text = `DEC ${String(instr.pair).toUpperCase()}`;
      break;
    case 'inc-reg':
      text = `INC ${String(instr.reg).toUpperCase()}`;
      break;
    case 'dec-reg':
      text = `DEC ${String(instr.reg).toUpperCase()}`;
      break;
    case 'add-pair':
      text = `ADD ${String(instr.dest).toUpperCase()},${String(instr.src).toUpperCase()}`;
      break;
    case 'alu-imm':
      text = `${String(instr.op).toUpperCase()} ${hexByte(instr.value)}`;
      break;
    case 'alu-reg':
      text = `${String(instr.op).toUpperCase()} ${String(instr.src).toUpperCase()}`;
      break;
    case 'rotate-reg':
      text = `${String(instr.op).toUpperCase()} ${String(instr.reg).toUpperCase()}`;
      break;
    case 'bit-test':
      text = `BIT ${instr.bit},${String(instr.reg).toUpperCase()}`;
      break;
    default:
      text = String(instr.tag ?? '???').toUpperCase();
      break;
  }

  if (instr.modePrefix) {
    return `${String(instr.modePrefix).toUpperCase()} ${text}`;
  }
  return text;
}

function decodeAt(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr || !instr.length) return null;
    return instr;
  } catch {
    return null;
  }
}

function isDirectAbsoluteWrite(instr) {
  if (!instr) return false;
  if (instr.tag === 'ld-mem-reg' || instr.tag === 'ld-mem-pair') return true;
  if (instr.tag === 'ld-pair-mem' && instr.direction === 'to-mem') return true;
  return false;
}

function isCall(instr) {
  return instr?.tag === 'call' || instr?.tag === 'call-conditional';
}

function isTableLookup(instr) {
  if (!instr) return false;
  if ((instr.tag === 'ld-reg-ixd' || instr.tag === 'ld-reg-idx') && String(instr.dest).toLowerCase() === 'a') {
    return true;
  }
  if (instr.tag === 'ld-reg-ind' &&
      String(instr.dest).toLowerCase() === 'a' &&
      String(instr.src).toLowerCase() === 'hl') {
    return true;
  }
  return false;
}

function touchesRegisterAsRead(instr, reg) {
  if (!instr) return false;
  const want = reg.toLowerCase();

  switch (instr.tag) {
    case 'alu-imm':
    case 'alu-reg':
      return want === 'a' || String(instr.src ?? '').toLowerCase() === want;
    case 'ld-reg-reg':
      return String(instr.src).toLowerCase() === want;
    case 'ld-reg-ind':
      return String(instr.src).toLowerCase() === want;
    case 'ld-ind-reg':
      return String(instr.src).toLowerCase() === want || String(instr.dest).toLowerCase() === want;
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
      return String(instr.indexRegister ?? instr.indexReg ?? '').toLowerCase() === want;
    case 'add-pair':
      return String(instr.dest).toLowerCase() === want || String(instr.src).toLowerCase() === want;
    case 'inc-pair':
    case 'dec-pair':
      return String(instr.pair).toLowerCase() === want;
    case 'rotate-reg':
      return String(instr.reg).toLowerCase() === want;
    case 'bit-test':
      return String(instr.reg).toLowerCase() === want;
    case 'indexed-cb-bit':
      return String(instr.indexRegister).toLowerCase() === want;
    case 'push':
      return String(instr.pair).toLowerCase() === want;
    case 'mlt':
      return String(instr.reg).toLowerCase() === want;
    default:
      return false;
  }
}

function writesRegister(instr, reg) {
  if (!instr) return false;
  const want = reg.toLowerCase();

  switch (instr.tag) {
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-mem':
    case 'ld-reg-ind':
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
      return String(instr.dest).toLowerCase() === want;
    case 'alu-imm':
    case 'alu-reg':
    case 'rotate-reg':
      return want === 'a' || String(instr.reg ?? '').toLowerCase() === want;
    case 'inc-reg':
    case 'dec-reg':
      return String(instr.reg).toLowerCase() === want;
    case 'ld-pair-imm':
    case 'ld-pair-mem':
      return String(instr.pair).toLowerCase() === want;
    case 'inc-pair':
    case 'dec-pair':
    case 'add-pair':
    case 'mlt':
      return String(instr.pair ?? instr.dest ?? instr.reg).toLowerCase() === want;
    case 'pop':
      return String(instr.pair).toLowerCase() === want;
    default:
      return false;
  }
}

function isClearExit(instr) {
  if (!instr) return false;
  if (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn') return true;
  if (instr.tag === 'jp' && typeof instr.target === 'number') {
    return instr.target < START_PC || instr.target > PATTERN_SCAN_END;
  }
  return false;
}

function findPatternInRange(start, endInclusive, pattern) {
  const matches = [];
  const last = Math.min(endInclusive, rom.length - pattern.length);
  for (let pc = start; pc <= last; pc++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (rom[pc + i] !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(pc);
  }
  return matches;
}

const rows = [];
const calls = [];
const exactWrites = [];
const nearbyWrites = [];
const nearbyReads = [];
const tableLookups = [];

let pc = START_PC;
let stopReason = 'instruction limit reached';

for (let i = 0; i < MAX_INSTRUCTIONS && pc < rom.length; i++) {
  const instr = decodeAt(pc);
  if (!instr) {
    rows.push({ pc, text: `DB ${hexByte(rom[pc])}`, instr: null });
    pc += 1;
    continue;
  }

  const text = formatInstruction(instr);
  rows.push({ pc, text, instr });

  if (isCall(instr)) {
    calls.push({ pc, text, target: instr.target });
  }

  if (isDirectAbsoluteWrite(instr)) {
    const addr = instr.addr;
    if (addr === TARGET_OUTPUT) {
      exactWrites.push({ pc, text, addr });
    } else if (Math.abs(addr - TARGET_OUTPUT) <= NEARBY_DELTA) {
      nearbyWrites.push({ pc, text, addr });
    }
  }

  if (instr.tag === 'ld-reg-mem') {
    const addr = instr.addr;
    if (Math.abs(addr - TARGET_OUTPUT) <= NEARBY_DELTA) {
      nearbyReads.push({ pc, text, addr });
    }
  }

  if (isTableLookup(instr)) {
    tableLookups.push({ pc, text });
  }

  if (isClearExit(instr)) {
    stopReason = `clear exit at ${hex(pc)}: ${text}`;
    break;
  }

  pc += Math.max(1, instr.length);
}

const patternMatches = findPatternInRange(START_PC, PATTERN_SCAN_END, [0x8C, 0x05, 0xD0]);

let firstReadA = null;
let firstWriteA = null;
for (const row of rows) {
  if (row.instr && firstReadA === null && touchesRegisterAsRead(row.instr, 'a')) {
    firstReadA = row;
  }
  if (row.instr && firstWriteA === null && writesRegister(row.instr, 'a')) {
    firstWriteA = row;
  }
  if (firstReadA && firstWriteA) break;
}

const ldLA = rows.find((row) => row.instr?.tag === 'ld-reg-reg' &&
  String(row.instr.dest).toLowerCase() === 'l' &&
  String(row.instr.src).toLowerCase() === 'a');
const popIX = rows.find((row) => row.instr?.tag === 'pop' && String(row.instr.pair).toLowerCase() === 'ix');
const firstIxRead = tableLookups.find((row) => row.text.includes('(IX'));

console.log('=== Phase 289: 0x005A75 Scan-Code Decoder ===');
console.log('');
console.log(`ROM disassembly start: ${hex(START_PC)}`);
console.log(`Pattern scan range: ${hex(START_PC)}-${hex(PATTERN_SCAN_END)}`);
console.log('');
console.log('--- Disassembly ---');
for (const row of rows) {
  console.log(`${hex(row.pc)}: ${row.text}`);
}
console.log('');
console.log(`Stop reason: ${stopReason}`);
console.log('');

console.log('--- CALL Targets ---');
if (calls.length === 0) {
  console.log('No CALL instructions found.');
} else {
  for (const call of calls) {
    console.log(`${hex(call.pc)}: ${call.text}`);
  }
}
console.log('');

console.log(`--- Direct Writes To ${hex(TARGET_OUTPUT)} Or Nearby (+/- ${hex(NEARBY_DELTA)}) ---`);
if (exactWrites.length === 0) {
  console.log(`Exact ${hex(TARGET_OUTPUT)} writes: none in linear disassembly.`);
} else {
  for (const hit of exactWrites) {
    console.log(`${hex(hit.pc)}: ${hit.text}`);
  }
}

if (nearbyWrites.length === 0) {
  console.log(`Nearby direct writes: none within ${hex(TARGET_OUTPUT - NEARBY_DELTA)}-${hex(TARGET_OUTPUT + NEARBY_DELTA)}.`);
} else {
  for (const hit of nearbyWrites) {
    const delta = hit.addr - TARGET_OUTPUT;
    const signed = delta >= 0 ? `+0x${delta.toString(16).toUpperCase()}` : `-0x${(-delta).toString(16).toUpperCase()}`;
    console.log(`${hex(hit.pc)}: ${hit.text}  ; addr=${hex(hit.addr)} delta=${signed}`);
  }
}
console.log('');

console.log(`--- Nearby Reads Around ${hex(TARGET_OUTPUT)} (+/- ${hex(NEARBY_DELTA)}) ---`);
if (nearbyReads.length === 0) {
  console.log('No nearby absolute reads found.');
} else {
  for (const hit of nearbyReads) {
    const delta = hit.addr - TARGET_OUTPUT;
    const signed = delta >= 0 ? `+0x${delta.toString(16).toUpperCase()}` : `-0x${(-delta).toString(16).toUpperCase()}`;
    console.log(`${hex(hit.pc)}: ${hit.text}  ; addr=${hex(hit.addr)} delta=${signed}`);
  }
}
console.log('');

console.log('--- Table / Indexed Lookup Reads ---');
if (tableLookups.length === 0) {
  console.log('No indexed lookup reads found.');
} else {
  for (const hit of tableLookups) {
    console.log(`${hex(hit.pc)}: ${hit.text}`);
  }
}
console.log('');

console.log('--- Register Usage Heuristic ---');
if (firstReadA && (!firstWriteA || firstReadA.pc <= firstWriteA.pc)) {
  console.log(`Entry scan code likely arrives in A.`);
  console.log(`  First A read: ${hex(firstReadA.pc)} ${firstReadA.text}`);
  if (firstWriteA) {
    console.log(`  First A write in routine: ${hex(firstWriteA.pc)} ${firstWriteA.text}`);
  }
} else {
  console.log('Could not prove an A live-in from the first decoded block.');
}

if (ldLA) {
  console.log(`  ${hex(ldLA.pc)} moves A into L, feeding HL-based indexing.`);
}
if (popIX) {
  console.log(`  ${hex(popIX.pc)} loads IX from the helper-produced pointer, suggesting IX is the table-row cursor.`);
}
if (firstIxRead) {
  console.log(`  ${hex(firstIxRead.pc)} begins indexed byte reads from IX.`);
}
console.log('');

console.log(`--- Raw LE Pattern Scan For ${hex(TARGET_OUTPUT)} (${['8C', '05', 'D0'].join(' ')}) ---`);
if (patternMatches.length === 0) {
  console.log(`No raw ${hex(TARGET_OUTPUT)} byte pattern found between ${hex(START_PC)} and ${hex(PATTERN_SCAN_END)}.`);
} else {
  for (const match of patternMatches) {
    console.log(`Pattern hit at ${hex(match)}`);
  }
}
