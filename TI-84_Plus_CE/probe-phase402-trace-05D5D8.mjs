#!/usr/bin/env node
// Phase 402 P1: Trace key→action dispatch in 0x05D5D8+
//
// Session 400 identified 0x05D58F as the key action dispatcher. It loads a
// 4-byte table entry (indexed by scan code from 0xD1441D) via memcpy into
// a buffer at (IX+9). Session 401 confirmed 0x0027E8 = memcpy.
//
// This probe disassembles 0x05D5D8..~0x05D6A0 to find WHERE the 4-byte
// buffer is consumed and WHAT subroutines receive it for action execution.
//
// Run:  node TI-84_Plus_CE/probe-phase402-trace-05D5D8.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).padStart(width, '0');
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function disp(d) {
  return d >= 0 ? `+${d}` : `${d}`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  let text = t;

  switch (t) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ixd':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-ixd-imm':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `inc (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `dec (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd':
      text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    default: text = `[${t}]`; break;
  }
  return prefix + text;
}

// ---------------------------------------------------------------------------
// Disassemble a range and return instruction objects
// ---------------------------------------------------------------------------
function disassembleRange(start, end) {
  const instructions = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) {
      instructions.push({ pc, tag: 'unknown-byte', length: 1, _raw: rom[pc] });
      pc += 1;
      continue;
    }
    instructions.push(inst);
    pc += inst.length;
  }
  return instructions;
}

// ---------------------------------------------------------------------------
// Analysis: identify buffer reads, calls, compares, jumps
// ---------------------------------------------------------------------------
function isIxBufferAccess(inst) {
  // The 4-byte buffer is at (IX+9)..(IX+12)
  if (!inst) return false;
  const d = inst.displacement;
  if (d === undefined) return false;
  const reg = inst.indexRegister;
  if (reg !== 'ix') return false;
  return d >= 9 && d <= 12;
}

function isCallOrJump(inst) {
  return ['call', 'call-conditional', 'jp', 'jp-conditional', 'jp-indirect', 'rst'].includes(inst.tag);
}

function isCompare(inst) {
  return (inst.tag === 'alu-imm' && inst.op === 'cp') ||
         (inst.tag === 'alu-reg' && inst.op === 'cp') ||
         (inst.tag === 'alu-ixd' && inst.op === 'cp');
}

function isReturn(inst) {
  return inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti';
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const REGION_START = 0x05D5D8;
// Scan further to catch the full dispatch body — stop at 0x05D750 or first
// unconditional RET after a reasonable run
const REGION_END = 0x05D750;

console.log('=== Phase 402: Trace Key→Action Dispatch in 0x05D5D8+ ===\n');
console.log(`Disassembly region: ${hex(REGION_START)} .. ${hex(REGION_END)}\n`);

const instructions = disassembleRange(REGION_START, REGION_END);

// --- Section 1: Full disassembly listing ---
console.log('--- FULL DISASSEMBLY ---\n');
for (const inst of instructions) {
  const rawBytes = [];
  for (let i = 0; i < inst.length; i++) {
    rawBytes.push(rom[inst.pc + i].toString(16).padStart(2, '0'));
  }
  const bytesStr = rawBytes.join(' ').padEnd(16);
  const formatted = formatInstruction(inst);
  console.log(`  ${hex(inst.pc)}  ${bytesStr}  ${formatted}`);
}

// --- Section 2: IX buffer accesses ---
console.log('\n--- IX BUFFER ACCESSES (IX+9 through IX+12) ---\n');
const bufferAccesses = [];
for (const inst of instructions) {
  if (isIxBufferAccess(inst)) {
    bufferAccesses.push(inst);
    console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}  [buffer byte ${inst.displacement - 9}]`);
  }
}
if (bufferAccesses.length === 0) {
  console.log('  (none found in this range)');
}

// Also check broader IX accesses (any displacement) for context
console.log('\n--- ALL IX-INDEXED ACCESSES ---\n');
for (const inst of instructions) {
  const d = inst.displacement;
  const reg = inst.indexRegister;
  if (reg === 'ix' && d !== undefined) {
    const marker = (d >= 9 && d <= 12) ? '  *** BUFFER ***' : '';
    console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}${marker}`);
  }
}

// --- Section 3: Calls and jumps ---
console.log('\n--- CALL/JP TARGETS ---\n');
const callTargets = new Map();
for (const inst of instructions) {
  if (isCallOrJump(inst)) {
    const target = inst.target ?? `(${inst.indirectRegister})`;
    const targetStr = typeof target === 'number' ? hex(target) : target;
    const existing = callTargets.get(targetStr) || [];
    existing.push(inst);
    callTargets.set(targetStr, existing);
    console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}`);
  }
}

// --- Section 4: Compares ---
console.log('\n--- COMPARE INSTRUCTIONS ---\n');
for (const inst of instructions) {
  if (isCompare(inst)) {
    console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}`);
  }
}

// --- Section 5: Returns (function boundaries) ---
console.log('\n--- RETURNS (function boundaries) ---\n');
for (const inst of instructions) {
  if (isReturn(inst)) {
    console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}`);
  }
}

// --- Section 6: Trace the data flow around buffer reads ---
console.log('\n--- DATA FLOW ANALYSIS ---\n');
console.log('Tracing what happens after each IX buffer read:\n');

for (let i = 0; i < instructions.length; i++) {
  const inst = instructions[i];
  if (!isIxBufferAccess(inst)) continue;

  const bufferByte = inst.displacement - 9;
  console.log(`  Buffer byte ${bufferByte} read at ${hex(inst.pc)}: ${formatInstruction(inst)}`);

  // Show the next few instructions for context
  for (let j = 1; j <= 8 && (i + j) < instructions.length; j++) {
    const next = instructions[i + j];
    const formatted = formatInstruction(next);
    let annotation = '';
    if (isCompare(next)) annotation = '  <-- COMPARE';
    if (isCallOrJump(next)) annotation = '  <-- BRANCH/CALL';
    if (isIxBufferAccess(next)) annotation = '  <-- ANOTHER BUFFER READ';
    console.log(`    +${j}: ${hex(next.pc)}  ${formatted}${annotation}`);
  }
  console.log('');
}

// --- Section 7: Also disassemble CALL targets that are nearby ---
console.log('\n--- NEARBY CALL TARGET PEEK (first 10 instructions of each) ---\n');
const uniqueTargets = new Set();
for (const inst of instructions) {
  if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
    uniqueTargets.add(inst.target);
  }
}

for (const target of [...uniqueTargets].sort((a, b) => a - b)) {
  // Only peek at targets within the ROM (< 0x400000) and not too far away
  if (target >= 0x400000) continue;
  console.log(`  --- Peek at CALL target ${hex(target)} ---`);
  const peek = disassembleRange(target, Math.min(target + 40, 0x400000));
  let count = 0;
  for (const inst of peek) {
    if (count >= 10) break;
    console.log(`    ${hex(inst.pc)}  ${formatInstruction(inst)}`);
    if (isReturn(inst) || inst.tag === 'jp' || inst.tag === 'halt') break;
    count++;
  }
  console.log('');
}

// --- Section 8: Also scan backward from 0x05D5D8 to see the memcpy call ---
console.log('\n--- CONTEXT: 0x05D5A0..0x05D5D8 (the memcpy setup) ---\n');
const contextInstructions = disassembleRange(0x05D5A0, REGION_START);
for (const inst of contextInstructions) {
  const rawBytes = [];
  for (let i = 0; i < inst.length; i++) {
    rawBytes.push(rom[inst.pc + i].toString(16).padStart(2, '0'));
  }
  const bytesStr = rawBytes.join(' ').padEnd(16);
  const formatted = formatInstruction(inst);
  let annotation = '';
  if (inst.tag === 'call' && inst.target === 0x0027E8) annotation = '  <-- MEMCPY';
  console.log(`  ${hex(inst.pc)}  ${bytesStr}  ${formatted}${annotation}`);
}

console.log('\n=== Phase 402 probe complete ===');
