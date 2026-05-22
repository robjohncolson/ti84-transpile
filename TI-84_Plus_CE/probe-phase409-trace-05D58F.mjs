#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const ENTRY_START = 0x05D58F;
const TRACE_BYTES = 0x1C0;
const TRACE_END = ENTRY_START + TRACE_BYTES;
const ENTRY_RET = 0x05D5C1;
const FIRST_ACTION_READER = 0x07FDD6;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function rawBytes(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return { pc, nextPc: pc + 1, length: 1, tag: 'db', value: rom[pc] ?? 0 };
  }
}

function formatInstruction(inst) {
  const t = inst.tag;

  switch (t) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}),${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()},(${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ixd':
      return `${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'add-pair': return `ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${String(inst.src).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'lea':
      return `LEA ${String(inst.dest).toUpperCase()},${String(inst.base).toUpperCase()}${signedDisp(inst.displacement)}`;
    case 'ld-sp-pair': return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},(${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},(${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'db': return `DB ${hex(inst.value, 2)}`;
    default: return `[${t}]`;
  }
}

function previewRange(start, end) {
  const lines = [];
  for (let pc = start; pc < end;) {
    const inst = safeDecode(pc);
    lines.push(`${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(16)} ${formatInstruction(inst)}`);
    pc = inst.nextPc;
  }
  return lines;
}

function chunk(items, width) {
  const rows = [];
  for (let i = 0; i < items.length; i += width) {
    rows.push(items.slice(i, i + width));
  }
  return rows;
}

const instructions = [];
for (let pc = ENTRY_START; pc < TRACE_END;) {
  const inst = safeDecode(pc);
  instructions.push(inst);
  pc = inst.nextPc;
}

const entryInstructions = instructions.filter((inst) => inst.pc <= ENTRY_RET);

const cpInstructions = instructions.filter(
  (inst) => (inst.tag === 'alu-imm' || inst.tag === 'alu-reg' || inst.tag === 'alu-ixd') && inst.op === 'cp',
);

const indirectJumps = instructions.filter(
  (inst) => inst.tag === 'jp-indirect' || inst.tag === 'call-indirect',
);

const entryUsesKeyAsIndex =
  entryInstructions.some((inst) => inst.tag === 'ld-reg-ixd' && inst.dest === 'a' && inst.indexRegister === 'ix' && inst.displacement === 6)
  && entryInstructions.filter((inst) => inst.tag === 'add-pair' && inst.dest === 'hl' && inst.src === 'hl').length >= 2
  && entryInstructions.some((inst) => inst.tag === 'ld-pair-mem' && inst.pair === 'bc' && inst.addr === 0xD1441D)
  && entryInstructions.some((inst) => inst.tag === 'call' && inst.target === 0x0000A4);

const controlTargets = [];
const seenControlTargets = new Set();
for (const inst of instructions) {
  if (![
    'call',
    'call-conditional',
    'jp',
    'jp-conditional',
    'jr',
    'jr-conditional',
    'djnz',
  ].includes(inst.tag)) {
    continue;
  }
  if (typeof inst.target !== 'number') continue;
  if (seenControlTargets.has(inst.target)) continue;
  seenControlTargets.add(inst.target);
  controlTargets.push({
    from: inst.pc,
    kind: inst.tag,
    target: inst.target,
  });
}

const uniqueCallTargets = [];
const seenCalls = new Set();
for (const inst of instructions) {
  if (!['call', 'call-conditional'].includes(inst.tag)) continue;
  if (typeof inst.target !== 'number') continue;
  if (seenCalls.has(inst.target)) continue;
  seenCalls.add(inst.target);
  uniqueCallTargets.push(inst.target);
}

const absoluteReads = [];
const seenReadRefs = new Set();
const absoluteWrites = [];
const seenWriteRefs = new Set();

for (const inst of instructions) {
  if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-pair-mem') && typeof inst.addr === 'number') {
    const key = `${inst.addr}:read`;
    if (!seenReadRefs.has(key)) {
      seenReadRefs.add(key);
      absoluteReads.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
    }
  }
  if ((inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') && typeof inst.addr === 'number') {
    const key = `${inst.addr}:write`;
    if (!seenWriteRefs.has(key)) {
      seenWriteRefs.add(key);
      absoluteWrites.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
    }
  }
}

const indexedTouches = [];
for (const inst of instructions) {
  if (inst.indexRegister === 'ix' || inst.indexRegister === 'iy') {
    indexedTouches.push({
      pc: inst.pc,
      text: formatInstruction(inst),
    });
  }
}

const firstActionReaderSites = instructions
  .filter((inst) => inst.tag === 'call' && inst.target === FIRST_ACTION_READER)
  .map((inst) => inst.pc);

console.log('=== Phase 409: Trace 0x05D58F ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Trace window: ${hex(ENTRY_START)} .. ${hex(TRACE_END - 1)} (${TRACE_BYTES} bytes)`);
console.log('');

console.log('-- Mechanism Answers --');
console.log(`Dispatch table indexed by key: ${entryUsesKeyAsIndex ? 'YES' : 'NO'}`);
console.log('Table entry type: 4-byte record copied by memcpy helper, not a direct JP/CALL target');
console.log(`CP cascade inside traced window: ${cpInstructions.length > 0 ? 'YES' : 'NO'}`);
console.log(`Computed jump in traced window: ${indirectJumps.length > 0 ? 'YES' : 'NO'}`);
console.log(`Entry return: ${hex(ENTRY_RET)}`);
console.log(`Action-byte reader 0x07FDD6 reached later in the chain: ${firstActionReaderSites.length > 0 ? firstActionReaderSites.map((pc) => hex(pc)).join(', ') : 'not in this window'}`);
console.log('');

console.log('-- Entry Function (0x05D58F..RET) --');
for (const line of previewRange(ENTRY_START, ENTRY_RET + 1)) {
  console.log(line);
}
console.log('');

console.log('-- First 20 Unique Control Targets --');
for (const entry of controlTargets.slice(0, 20)) {
  console.log(`${hex(entry.from)}  ${entry.kind.padEnd(16)} -> ${hex(entry.target)}`);
}
console.log('');

console.log('-- Unique CALL Targets In Window --');
for (const row of chunk(uniqueCallTargets.map((value) => hex(value)), 6)) {
  console.log(row.join(', '));
}
console.log('');

console.log('-- Absolute RAM Reads --');
if (absoluteReads.length === 0) {
  console.log('none');
} else {
  for (const entry of absoluteReads) {
    console.log(`${hex(entry.pc)}  ${entry.text}`);
  }
}
console.log('');

console.log('-- Absolute RAM Writes --');
if (absoluteWrites.length === 0) {
  console.log('none');
} else {
  for (const entry of absoluteWrites) {
    console.log(`${hex(entry.pc)}  ${entry.text}`);
  }
}
console.log('');

console.log('-- Indexed Memory Touches (Stack / Flag Slots) --');
for (const entry of indexedTouches) {
  console.log(`${hex(entry.pc)}  ${entry.text}`);
}
console.log('');

console.log('-- Gate Helper Notes --');
console.log('0x000130 -> 0x00218A is a compiler/frame helper; it contains JP (HL), but that is not a key-indexed dispatch.');
console.log('0x000138 -> 0x0021C2 is a zero-test helper used to check whether D1441D is null.');
console.log('0x0000A4 -> 0x0027E8 is a memcpy-style copy helper; here it copies 4 bytes from table_base + 4*key.');
console.log('');

console.log('-- Key Findings --');
console.log('1. The raw key code is not compared against constants in 0x05D58F. It is loaded from (IX+6), widened into HL, multiplied by 4, and used as a table index.');
console.log('2. The table base lives in RAM[0xD1441D]. If that pointer is zero, 0x05D58F returns immediately via JR Z,0x05D5BD.');
console.log('3. The destination buffer pointer comes from (IX+9). The function then calls 0x0000A4/0x0027E8 to copy the 4-byte record into that buffer.');
console.log('4. No CP nn ladder and no key-driven JP (HL) appear anywhere in the traced window.');
console.log('5. The deeper chain at 0x05D5D8+ is call-heavy and flag-driven. Later in the same window it reaches 0x07FDC9 and 0x07FDD6, which is consistent with action-record interpretation rather than direct code-pointer dispatch.');
