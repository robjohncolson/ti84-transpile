#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const knownTargets = new Map([
  [0x099921, '38-entry command dispatcher'],
  [0x080259, 'descriptor helper'],
  [0x058eda, '11B catalog-key detector (NOT real classifier)'],
  [0x058b73, 'REAL key type classifier'],
  [0x0587e9, 'convergence point'],
  [0x05883e, 'flag cleanup path'],
  [0x0922b2, 'token deposit'],
  [0x05884c, 'command path entry'],
  [0x05899d, 'command handler entry'],
  [0x07bf19, 'quit handler'],
  [0x061d1a, 'key-to-token'],
  [0x03e1b4, 'token processor'],
  [0x022331, 'key processor suite'],
  [0x08c72f, 'display refresh dispatch'],
  [0x05622e, 'key-code-to-token mapper'],
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
  // CP is an ALU op with insn.op === 'cp'
  if ((tag.startsWith('alu') || tag.startsWith('cp')) && insn.op === 'cp') return 'CP';
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

function decode(startAddr, length, options = {}) {
  let offset = startAddr;
  const end = startAddr + length;
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

    const line = `${hex(offset)}  ${bytes.join(' ').padEnd(20)}  ${dasm}${tags.length ? `    ; ${tags.join('; ')}` : ''}`;
    lines.push(line);
    records.push({ address: offset, bytes, dasm, target, known, kind, insn, line });

    if (kind === 'RET' && insn.tag === 'ret') {
      unconditionalRets += 1;
      if (options.stopAfterMultipleRets && unconditionalRets >= options.stopAfterMultipleRets) break;
    }

    offset += insn.length || 1;
  }

  return { lines, records };
}

function printSection(title, decoded) {
  console.log(`\n=== ${title} ===`);
  decoded.lines.forEach((line) => console.log(line));
}

// --- Decode all regions ---

console.log('Phase 599: Static decode of REAL key type classifier at 0x058b73');
console.log(`ROM size: ${romBytes.length} bytes`);

const classifier = decode(0x058b73, 64, { stopAfterMultipleRets: 2 });
const convergence = decode(0x0587e9, 48);
const flagCleanup = decode(0x05883e, 32);
const tokenDeposit = decode(0x0922b2, 32);
const commandEntry = decode(0x05884c, 32);
const commandHandler = decode(0x05899d, 64);

printSection('0x058B73 - REAL Key Type Classifier (64B)', classifier);
printSection('0x0587E9 - Convergence Point / Caller Context (48B)', convergence);
printSection('0x05883E - Flag Cleanup Path (32B)', flagCleanup);
printSection('0x0922B2 - Token Deposit (32B)', tokenDeposit);
printSection('0x05884C - Command Path Entry after CP 0x05 (32B)', commandEntry);
printSection('0x05899D - Command Handler Entry (64B)', commandHandler);

// --- Summary: CP comparison values in the classifier ---

console.log('\n=== SUMMARY: CP Comparison Values in 0x058B73 ===');
const cpRecords = classifier.records.filter((r) => r.kind === 'CP');
if (cpRecords.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of cpRecords) {
    const val = r.insn.value !== undefined ? `0x${r.insn.value.toString(16).padStart(2, '0')}` : '(indirect)';
    console.log(`  ${hex(r.address)}  CP ${val}    ; type threshold`);
  }
}

// --- Summary: CALL/JP targets from the classifier ---

console.log('\n=== SUMMARY: CALL/JP/JR Targets from 0x058B73 ===');
const branchRecords = classifier.records.filter((r) => ['CALL', 'JP', 'JR'].includes(r.kind));
if (branchRecords.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of branchRecords) {
    const targetStr = r.target === null ? 'indirect' : hex(r.target);
    const known = r.known ? ` (${r.known})` : '';
    console.log(`  ${hex(r.address)}  ${r.dasm.padEnd(30)} -> ${targetStr}${known}`);
  }
}

// --- Cross-references from all regions ---

console.log('\n=== ALL CALL/JP/JR Cross References ===');
const allDecoded = [classifier, convergence, flagCleanup, tokenDeposit, commandEntry, commandHandler];
for (const decoded of allDecoded) {
  for (const r of decoded.records) {
    if (!['CALL', 'JP', 'JR'].includes(r.kind)) continue;
    const targetStr = r.target === null ? 'indirect' : hex(r.target);
    const known = r.known ? ` (${r.known})` : '';
    console.log(`  ${hex(r.address)}  ${r.dasm.padEnd(30)} -> ${targetStr}${known}`);
  }
}
