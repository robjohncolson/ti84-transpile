#!/usr/bin/env node
/**
 * Phase 600: Static decode of 0x058D54 — key type classifier function.
 *
 * Called from:
 *   - character path convergence 0x0587E9
 *   - command handler 0x05899D
 * Returns a type code (1-4 = character, >=5 = command).
 * CP 0x05 at 0x0587F3 splits on its return value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const knownTargets = new Map([
  [0x058ec6, 'nearby helper (0x058EC6)'],
  [0x0008a8, 'bcall helper (0x0008A8)'],
  [0x058d54, 'THIS FUNCTION — recursive/self-ref'],
  [0x058b73, 'REAL key type classifier (11B type-7 check)'],
  [0x0587e9, 'convergence point (character path)'],
  [0x05899d, 'command handler entry'],
  [0x099921, '38-entry command dispatcher'],
  [0x0922b2, 'token deposit'],
  [0x058eda, '11B catalog-key detector'],
  [0x0bd341, 'OS helper (0x0BD341)'],
  [0x069a8d, 'OS helper (0x069A8D)'],
  [0x058c65, 'nearby helper (0x058C65)'],
  [0x058d2e, 'nearby helper (0x058D2E)'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function instructionKind(insn) {
  const tag = insn.tag || '';
  if (tag.startsWith('call')) return 'CALL';
  if (tag.startsWith('jp')) return 'JP';
  if (tag.startsWith('jr')) return 'JR';
  if (tag === 'ret' || tag.startsWith('ret-')) return 'RET';
  if (tag.startsWith('bit-test')) return 'BIT';
  if ((tag.startsWith('alu') || tag.startsWith('cp')) && insn.op === 'cp') return 'CP';
  if (tag === 'ld-reg-imm' || tag === 'ld-reg-reg' || tag === 'ld-reg-mem' || tag === 'ld-mem-reg') return 'LD';
  return '';
}

function formatInsn(insn) {
  const tag = insn.tag || '???';
  const parts = [tag.toUpperCase()];

  if (insn.condition) parts.push(insn.condition.toUpperCase());
  if (insn.target !== undefined) parts.push(hex(insn.target));
  else if (insn.value !== undefined) parts.push(`0x${insn.value.toString(16).padStart(2, '0')}`);
  else if (insn.dest && insn.src) parts.push(`${insn.dest},${insn.src}`);
  else if (insn.pair) parts.push(insn.pair.toUpperCase());
  else if (insn.src) parts.push(insn.src);
  else if (insn.dest) parts.push(insn.dest);
  if (insn.op && tag.startsWith('alu')) parts[0] = insn.op.toUpperCase();
  if (insn.bit !== undefined) parts.push(`${insn.bit}`);
  if (insn.displacement !== undefined) parts.push(`d=${insn.displacement}`);
  if (insn.indirectRegister) parts.push(`(${insn.indirectRegister.toUpperCase()})`);

  return parts.join(' ');
}

function decode(startAddr, maxLength, options = {}) {
  let offset = startAddr;
  const end = startAddr + maxLength;
  const lines = [];
  const records = [];
  let unconditionalRets = 0;

  while (offset < end) {
    const insn = decodeInstruction(romBytes, offset, 'adl');
    const dasm = formatInsn(insn);
    const bytes = [];
    for (let i = 0; i < insn.length; i += 1) {
      bytes.push(romBytes[offset + i].toString(16).padStart(2, '0'));
    }

    const target = insn.target ?? null;
    const known = target === null ? '' : knownTargets.get(target);
    const kind = instructionKind(insn);
    const tags = [];
    if (known) tags.push(known);
    if (kind === 'CP') tags.push('*** CP COMPARISON ***');
    if (kind === 'BIT') tags.push('bit test');
    if (kind === 'JP' || kind === 'JR') tags.push('branch');
    if (kind === 'CALL') tags.push('call');
    if (kind === 'RET') tags.push('return');

    const line = `${hex(offset)}  ${bytes.join(' ').padEnd(24)}  ${dasm}${tags.length ? `    ; ${tags.join('; ')}` : ''}`;
    lines.push(line);
    records.push({ address: offset, bytes, dasm, target, known, kind, insn, line });

    // Stop on unconditional RET
    if (kind === 'RET' && insn.tag === 'ret') {
      unconditionalRets += 1;
      if (options.stopAfterRet && unconditionalRets >= options.stopAfterRet) break;
    }

    offset += insn.length || 1;
  }

  return { lines, records };
}

function printSection(title, decoded) {
  console.log(`\n=== ${title} ===`);
  decoded.lines.forEach((line) => console.log(line));
}

// --- Main decode ---

console.log('Phase 600: Static decode of key type classifier at 0x058D54');
console.log(`ROM size: ${romBytes.length} bytes`);

// Primary: decode 0x058D54, at least 128 bytes, stop after 2 unconditional RETs
const primary = decode(0x058d54, 192, { stopAfterRet: 2 });
printSection('0x058D54 - Key Type Classifier (up to 192B, stop after 2 RETs)', primary);

// --- Follow CALL/JP targets within 0x058000-0x059000, one level deep ---

console.log('\n=== FOLLOWING NEARBY CALL/JP TARGETS (0x058000-0x059000) ===');
const nearbyTargets = new Set();
for (const r of primary.records) {
  if (['CALL', 'JP'].includes(r.kind) && r.target !== null) {
    if (r.target >= 0x058000 && r.target < 0x059000 && r.target !== 0x058d54) {
      nearbyTargets.add(r.target);
    }
  }
}

const followDecoded = [];
for (const addr of [...nearbyTargets].sort()) {
  const sub = decode(addr, 96, { stopAfterRet: 1 });
  printSection(`${hex(addr)} - Followed from 0x058D54 (up to 96B)`, sub);
  followDecoded.push(sub);
}

// --- Also decode callers for context ---

console.log('\n=== CALLER CONTEXT ===');
const convergence = decode(0x0587e9, 48);
printSection('0x0587E9 - Convergence Point / Character Path Caller (48B)', convergence);

const commandPath = decode(0x05899d, 48);
printSection('0x05899D - Command Handler / Command Path Caller (48B)', commandPath);

// --- Summary: CP comparison values ---

console.log('\n=== SUMMARY: CP Comparison Values in 0x058D54 ===');
const cpRecords = primary.records.filter((r) => r.kind === 'CP');
if (cpRecords.length === 0) {
  console.log('  (none found in primary decode)');
} else {
  for (const r of cpRecords) {
    const val = r.insn.value !== undefined
      ? `0x${r.insn.value.toString(16).padStart(2, '0')}`
      : '(indirect)';
    console.log(`  ${hex(r.address)}  CP ${val}    ; type threshold`);
  }
}

// Also check followed targets for CP
for (const decoded of followDecoded) {
  const subCp = decoded.records.filter((r) => r.kind === 'CP');
  if (subCp.length > 0) {
    console.log(`  -- In followed subroutine at ${hex(decoded.records[0].address)} --`);
    for (const r of subCp) {
      const val = r.insn.value !== undefined
        ? `0x${r.insn.value.toString(16).padStart(2, '0')}`
        : '(indirect)';
      console.log(`  ${hex(r.address)}  CP ${val}    ; type threshold`);
    }
  }
}

// --- Summary: All CALL/JP/JR targets ---

console.log('\n=== SUMMARY: CALL/JP/JR Targets from 0x058D54 ===');
const branchRecords = primary.records.filter((r) => ['CALL', 'JP', 'JR'].includes(r.kind));
if (branchRecords.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of branchRecords) {
    const targetStr = r.target === null ? 'indirect' : hex(r.target);
    const known = r.known ? ` (${r.known})` : '';
    console.log(`  ${hex(r.address)}  ${r.dasm.padEnd(35)} -> ${targetStr}${known}`);
  }
}

// --- Summary: All RET instructions ---

console.log('\n=== SUMMARY: RET Instructions in 0x058D54 ===');
const retRecords = primary.records.filter((r) => r.kind === 'RET');
for (const r of retRecords) {
  const cond = r.insn.condition ? ` ${r.insn.condition.toUpperCase()}` : ' (unconditional)';
  console.log(`  ${hex(r.address)}  RET${cond}`);
}

// --- Raw bytes dump for verification ---

console.log('\n=== RAW BYTES at 0x058D54 (first 64 bytes) ===');
const rawSlice = [];
for (let i = 0; i < 64; i += 1) {
  rawSlice.push(romBytes[0x058d54 + i].toString(16).padStart(2, '0'));
}
console.log(rawSlice.join(' '));

console.log('\nPhase 600 decode complete.');
