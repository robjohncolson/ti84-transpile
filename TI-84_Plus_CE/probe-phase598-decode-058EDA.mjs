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
  [0x058eda, 'key classifier'],
  [0x0587e9, 'convergence point'],
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
    if (kind === 'CP' || kind === 'BIT') tags.push('classifier predicate candidate');
    if ((kind === 'JP' || kind === 'JR')) tags.push('branch candidate');
    if (kind === 'CALL') tags.push('call edge');

    const line = `${hex(offset)}  ${bytes.join(' ').padEnd(20)}  ${dasm}${tags.length ? `    ; ${tags.join('; ')}` : ''}`;
    lines.push(line);
    records.push({ address: offset, bytes, dasm, target, known, kind, line });

    if (kind === 'RET' && insn.tag === 'ret') {
      unconditionalRets += 1;
      if (options.stopAfterMultipleRets && unconditionalRets >= options.stopAfterMultipleRets) break;
    }

    offset += insn.length || 1;
  }

  return { lines, records };
}

function printSection(title, decoded) {
  console.log(`=== ${title} ===`);
  decoded.lines.forEach((line) => console.log(line));
}

function printCrossReferences(...decodedSets) {
  const refs = [];
  for (const decoded of decodedSets) {
    for (const record of decoded.records) {
      if (!['CALL', 'JP', 'JR'].includes(record.kind)) continue;
      refs.push(record);
    }
  }

  console.log('\n=== CALL/JP/JR Cross References ===');
  for (const ref of refs) {
    const target = ref.target === null ? 'unparsed/indirect' : hex(ref.target);
    const known = ref.known ? ` (${ref.known})` : '';
    console.log(`${hex(ref.address)}  ${ref.dasm.padEnd(26)} -> ${target}${known}`);
  }
}

function printBranchPredicates(decoded058eda) {
  console.log('\n=== 0x058EDA Predicate/Branch Candidates ===');
  for (let i = 0; i < decoded058eda.records.length; i += 1) {
    const record = decoded058eda.records[i];
    if (record.kind !== 'CP' && record.kind !== 'BIT') continue;

    console.log(record.line);
    for (let j = i + 1; j < Math.min(decoded058eda.records.length, i + 6); j += 1) {
      const next = decoded058eda.records[j];
      if (['JR', 'JP', 'RET', 'CALL'].includes(next.kind) || next.kind === 'CP' || next.kind === 'BIT') {
        console.log(`  next control: ${next.line}`);
      }
    }
  }
}

function printTableReferences(...decodedSets) {
  console.log('\n=== Immediate ROM Address References ===');
  const seen = new Set();
  for (const decoded of decodedSets) {
    for (const record of decoded.records) {
      const dasm = record.dasm;
      for (const match of dasm.matchAll(/0x([0-9a-f]{5,6})|\$([0-9a-f]{5,6})/gi)) {
        const value = Number.parseInt(match[1] || match[2], 16);
        if (knownTargets.has(value)) continue;
        const key = `${record.address}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`${hex(record.address)}  ${dasm.padEnd(26)} references ${hex(value)}`);
      }
    }
  }
}

const generalKeyHandler = decode(0x05877a, 0x058eda - 0x05877a + 96);
const keyClassifier = decode(0x058eda, 250, { stopAfterMultipleRets: 3 });
const convergencePoint = decode(0x0587e9, 150);

printSection('0x05877A - General Key Handler', generalKeyHandler);
console.log('');
printSection('0x058EDA - Key Classifier', keyClassifier);
console.log('');
printSection('0x0587E9 - Convergence Point', convergencePoint);
printCrossReferences(generalKeyHandler, keyClassifier, convergencePoint);
printBranchPredicates(keyClassifier);
printTableReferences(generalKeyHandler, keyClassifier, convergencePoint);
