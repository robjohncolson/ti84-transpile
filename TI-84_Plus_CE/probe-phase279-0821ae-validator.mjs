#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const ENTRY_VALIDATOR = 0x0821AE;
const UPPER_BYTE_HELPER = 0x04C8A3;
const CHK_IN_RAM_JT = 0x021F98;
const SET_A_TO_DEU_JT = 0x021D58;
const SCRAP_MEM = 0xD02AD7;

const TERMINATORS = new Set(['ret', 'jp', 'jp-indirect', 'reti', 'retn']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function disp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function up(name) {
  if (name === '(hl)') return '(HL)';
  return String(name ?? '').toUpperCase();
}

function parseIncSymbols(text) {
  const symbols = new Map();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\?[A-Za-z0-9_+]+)\s*:=\s*0([0-9A-Fa-f]+)h/);
    if (!match) continue;

    const [, name, rawHex] = match;
    const address = parseInt(rawHex, 16) >>> 0;
    if (!symbols.has(address)) symbols.set(address, []);
    symbols.get(address).push(name);
  }

  return symbols;
}

function symbolNames(symbolMap, address) {
  return symbolMap.get(address) ?? [];
}

function symbolSuffix(symbolMap, address) {
  const names = symbolNames(symbolMap, address);
  return names.length ? ` (${names.join(', ')})` : '';
}

function fallbackInstruction(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'kind',
    'nextMode',
    'tag',
  ]);

  const extra = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (ignored.has(key) || value === undefined || value === null) continue;
    extra.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
  }

  const prefix = inst?.modePrefix ? `${inst.modePrefix} ` : '';
  return extra.length ? `${prefix}${inst.tag} ${extra.join(', ')}` : `${prefix}${inst?.tag ?? 'decode-error'}`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${up(inst.indirectRegister ?? 'hl')})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'reti': return `${prefix}reti`;
    case 'retn': return `${prefix}retn`;
    case 'push': return `${prefix}push ${up(inst.pair)}`;
    case 'pop': return `${prefix}pop ${up(inst.pair)}`;
    case 'ld-pair-imm': return `${prefix}ld ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}ld ${up(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-mem': return `${prefix}ld ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(inst.addr)}), ${up(inst.src)}`;
    case 'ld-reg-ind': return `${prefix}ld ${up(inst.dest)}, (${up(inst.src)})`;
    case 'ld-ind-reg': return `${prefix}ld (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-reg-ixd': return `${prefix}ld ${up(inst.dest)}, (${up(inst.indexRegister)}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${up(inst.indexRegister)}${disp(inst.displacement)}), ${up(inst.src)}`;
    case 'ld-ixd-imm': return `${prefix}ld (${up(inst.indexRegister)}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `${prefix}ld (${hex(inst.addr)}), ${up(inst.pair)}`;
      return `${prefix}ld ${up(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(inst.addr)}), ${up(inst.pair)}`;
    case 'ld-ind-imm': return `${prefix}ld (HL), ${hexByte(inst.value)}`;
    case 'inc-pair': return `${prefix}inc ${up(inst.pair)}`;
    case 'dec-pair': return `${prefix}dec ${up(inst.pair)}`;
    case 'inc-reg': return `${prefix}inc ${up(inst.reg)}`;
    case 'dec-reg': return `${prefix}dec ${up(inst.reg)}`;
    case 'add-pair': return `${prefix}add ${up(inst.dest)}, ${up(inst.src)}`;
    case 'adc-pair': return `${prefix}adc HL, ${up(inst.src)}`;
    case 'sbc-pair': return `${prefix}sbc HL, ${up(inst.src)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${up(inst.src)}`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${prefix}${inst.op} (${up(inst.indexRegister)}${disp(inst.displacement)})`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${up(inst.reg)}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (HL)`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${up(inst.indexRegister)}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${up(inst.indexRegister)}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${up(inst.indexRegister)}${disp(inst.displacement)})`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'ccf': return `${prefix}ccf`;
    case 'cpl': return `${prefix}cpl`;
    case 'scf': return `${prefix}scf`;
    case 'neg': return `${prefix}neg`;
    case 'rst': return `${prefix}rst ${hex(inst.target, 2)}`;
    case 'rlca': return `${prefix}rlca`;
    case 'rrca': return `${prefix}rrca`;
    case 'rla': return `${prefix}rla`;
    case 'rra': return `${prefix}rra`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'ldi': return `${prefix}ldi`;
    case 'ldd': return `${prefix}ldd`;
    case 'cpir': return `${prefix}cpir`;
    case 'cpdr': return `${prefix}cpdr`;
    case 'cpi': return `${prefix}cpi`;
    case 'cpd': return `${prefix}cpd`;
    case 'ld-sp-hl': return `${prefix}ld sp, HL`;
    case 'ex-de-hl': return `${prefix}ex DE, HL`;
    default: return fallbackInstruction(inst);
  }
}

function decodeChecked(romBytes, pc) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  if (!inst || !inst.length) {
    throw new Error(`Decode failed at ${hex(pc)}`);
  }
  return inst;
}

function disassembleUntilStop(romBytes, startPc, maxInstructions = 64) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < maxInstructions && pc < romBytes.length; index += 1) {
    const inst = decodeChecked(romBytes, pc);
    const bytes = romBytes.subarray(inst.pc, inst.pc + inst.length);

    rows.push({
      pc: inst.pc,
      bytes,
      text: formatInstruction(inst),
      inst,
    });

    pc = inst.nextPc;
    if (TERMINATORS.has(inst.tag)) break;
  }

  return rows;
}

function scanPattern(romBytes, pattern) {
  const matches = [];

  for (let offset = 0; offset <= romBytes.length - pattern.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (romBytes[offset + index] !== pattern[index]) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(offset);
  }

  return matches;
}

function collectDirectCallers(romBytes, target) {
  const low = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const high = (target >>> 16) & 0xFF;

  const callPattern = [0xCD, low, mid, high];
  const jpPattern = [0xC3, low, mid, high];

  return [
    ...scanPattern(romBytes, callPattern).map((address) => ({ address, kind: 'CALL' })),
    ...scanPattern(romBytes, jpPattern).map((address) => ({ address, kind: 'JP' })),
  ].sort((left, right) => left.address - right.address);
}

function printDisassembly(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${formatBytes(row.bytes).padEnd(24)} ${row.text}`);
  }
  console.log('');
}

function printCallerList(title, callers, symbolMap) {
  console.log(title);
  console.log(`count=${callers.length}`);
  for (const caller of callers) {
    console.log(`${hex(caller.address)}  ${caller.kind.padEnd(4)}${symbolSuffix(symbolMap, caller.address)}`);
  }
  console.log('');
}

function analyzeValidator(symbolMap, callersValidator, callersHelper) {
  const lines = [];
  const sampleHelperCallers = callersHelper
    .filter((caller) => caller.address !== UPPER_BYTE_HELPER && caller.address !== SET_A_TO_DEU_JT)
    .slice(0, 4)
    .map((caller) => hex(caller.address))
    .join(', ');

  lines.push('Validation analysis');
  lines.push(`- Exported trampoline: ${hex(CHK_IN_RAM_JT)}${symbolSuffix(symbolMap, CHK_IN_RAM_JT)} -> ${hex(ENTRY_VALIDATOR)}.`);
  lines.push(`- Helper trampoline: ${hex(SET_A_TO_DEU_JT)}${symbolSuffix(symbolMap, SET_A_TO_DEU_JT)} -> ${hex(UPPER_BYTE_HELPER)}.`);
  lines.push(`- Input register: DE is the pointer being classified. ${hex(UPPER_BYTE_HELPER)} does not read HL/BC as its source; it writes DE to ${hex(SCRAP_MEM)}${symbolSuffix(symbolMap, SCRAP_MEM)} and then reloads A from ${hex(SCRAP_MEM + 2)}.`);
  lines.push(`- ${hex(UPPER_BYTE_HELPER)} is not a RAM/VAT/flash range checker. It is just an "upper-byte of DE" helper.`);
  lines.push(`- ${hex(ENTRY_VALIDATOR)} logic: OR A; RET Z; CP ${hexByte(0xD0)}; RET C; XOR A; RET.`);
  lines.push(`- Valid result: Z=1 and C=0. This happens when DEU == ${hexByte(0x00)} or DEU >= ${hexByte(0xD0)}.`);
  lines.push(`- Invalid result: NZ=1 and C=1. This happens when ${hexByte(0x01)} <= DEU <= ${hexByte(0xCF)}.`);
  lines.push(`- Raw accepted 24-bit ranges: ${hex(0x000000)}-${hex(0x00FFFF)} and ${hex(0xD00000)}-${hex(0xFFFFFF)}.`);
  lines.push(`- Raw rejected 24-bit range: ${hex(0x010000)}-${hex(0xCFFFFF)}.`);
  lines.push(`- This is not a precise "RAM only" check like ${hex(0xD00000)}-${hex(0xD65800)}, and it is not a VAT-bounds check either. There is no compare against VAT pointers such as ?OPBase/?pTemp/?progPtr.`);
  lines.push(`- Inference: the ${hex(0x00FFFF)} low-page allowance likely exists so zero-extended 16-bit legacy pointers are treated as valid, which is why the exported name is ${symbolNames(symbolMap, CHK_IN_RAM_JT).join(', ') || '?ChkInRam'}.`);
  lines.push(`- Utility breadth: ${hex(UPPER_BYTE_HELPER)} is general-purpose, not VAT-specific. It is exported as ${symbolNames(symbolMap, SET_A_TO_DEU_JT).join(', ') || '?SetAToDEU'}, and its direct callers include non-VAT sites such as ${sampleHelperCallers}.`);
  lines.push(`- Direct-call footprint: ${hex(ENTRY_VALIDATOR)} has ${callersValidator.length} exact CALL/JP sites by the requested byte scan; ${hex(UPPER_BYTE_HELPER)} has ${callersHelper.length}.`);

  return lines;
}

function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const incText = fs.existsSync(INC_PATH) ? fs.readFileSync(INC_PATH, 'utf8') : '';
  const symbolMap = parseIncSymbols(incText);

  const validatorRows = disassembleUntilStop(romBytes, ENTRY_VALIDATOR);
  const helperRows = disassembleUntilStop(romBytes, UPPER_BYTE_HELPER);
  const validatorCallers = collectDirectCallers(romBytes, ENTRY_VALIDATOR);
  const helperCallers = collectDirectCallers(romBytes, UPPER_BYTE_HELPER);
  const analysisLines = analyzeValidator(symbolMap, validatorCallers, helperCallers);

  console.log('Phase 279: 0x0821AE entry pointer validator');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');

  printDisassembly(`Disassembly ${hex(ENTRY_VALIDATOR)}${symbolSuffix(symbolMap, CHK_IN_RAM_JT)}`, validatorRows);
  printDisassembly(`Disassembly ${hex(UPPER_BYTE_HELPER)}${symbolSuffix(symbolMap, SET_A_TO_DEU_JT)}`, helperRows);

  for (const line of analysisLines) {
    console.log(line);
  }
  console.log('');

  printCallerList(`Direct callers of ${hex(ENTRY_VALIDATOR)} (scan for CD AE 21 08 / C3 AE 21 08)`, validatorCallers, symbolMap);
  printCallerList(`Direct callers of ${hex(UPPER_BYTE_HELPER)} (scan for CD A3 C8 04 / C3 A3 C8 04)`, helperCallers, symbolMap);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
