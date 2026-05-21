#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MODE = 'adl';
const EXPECTED_ROM_SIZE = 0x400000;
const IY_DISPLACEMENT = 0x12;

const REQUESTED_SET_ADDR = 0x02FEEB;
const REQUESTED_SET_WINDOW_START = 0x02FEE0;
const REQUESTED_SET_WINDOW_END = 0x02FF20;
const EXPANDED_SET_WINDOW_START = 0x02FECF;
const EXPANDED_SET_WINDOW_END = 0x02FF20;

const REQUESTED_RES_ADDR = 0x0302CA;
const REQUESTED_RES_WINDOW_START = 0x0302C0;
const REQUESTED_RES_WINDOW_END = 0x0302E0;
const CLEAR_GATE_START = 0x03029F;
const CLEAR_GATE_END = 0x0302E6;

const KEY_DISPATCH_SCAN_START = 0x02FE00;
const KEY_DISPATCH_SCAN_END = 0x030400;

const PATTERNS = [
  { name: 'SET', label: 'SET 2,(IY+0x12)', bytes: [0xFD, 0xCB, 0x12, 0xD6] },
  { name: 'RES', label: 'RES 2,(IY+0x12)', bytes: [0xFD, 0xCB, 0x12, 0x96] },
  { name: 'BIT', label: 'BIT 2,(IY+0x12)', bytes: [0xFD, 0xCB, 0x12, 0x56] },
];

const ABS_ADDR_LABELS = new Map([
  [0xD0058C, 'kbdKey'],
  [0xD007E0, 'context byte'],
  [0xD007FA, 'saved stack pointer'],
  [0xD0082E, '8-byte scratch/state source'],
]);

const TARGET_LABELS = new Map([
  [0x022346, '0x09F79B lookup helper'],
  [0x02237E, 'modifier-state helper'],
  [0x024027, 'copy/setup helper'],
  [0x04A52C, 'pre-cleanup helper'],
  [0x08C5D7, 'post-cleanup jump'],
  [0x02FD99, 'shared post-key tail'],
  [0x0300CB, 'alpha-mode handler'],
  [0x09F79B, 'translation table base'],
]);

const PC_LABELS = new Map([
  [0x02FECF, 'mode-flag decision tree'],
  [0x02FEDB, 'requested SET-site address from task'],
  [0x03029F, 'pre-clear gate'],
  [0x0302CA, 'actual clear site'],
]);

const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedHexByte(value) {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : '+'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedHexByte(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return hex(value, 4);
  if (modePrefix === 'sil' || modePrefix === 'lil') return hex(value, 6);
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const upperOp = upper(op);
  if (upperOp === 'ADD' || upperOp === 'ADC' || upperOp === 'SBC') {
    return `${upperOp} A, ${operand}`;
  }
  return `${upperOp} ${operand}`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedHexByte(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';

  switch (inst.tag) {
    case 'db':
      return `DB ${hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ex-af':
      return 'EX AF, AF\'';
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'cpl':
      return 'CPL';
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'daa':
      return 'DAA';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, MODE);
  const length = Math.max(1, inst?.length ?? 1);
  const nextPc = inst?.nextPc ?? (pc + length);
  return {
    pc,
    bytes: bytesHex(pc, length),
    inst,
    text: renderInstruction(inst),
    nextPc,
  };
}

function annotationForRow(row) {
  const notes = [];
  const pcLabel = PC_LABELS.get(row.pc);
  if (pcLabel) notes.push(pcLabel);

  if (Number.isInteger(row.inst?.target) && TARGET_LABELS.has(row.inst.target)) {
    notes.push(`target: ${TARGET_LABELS.get(row.inst.target)}`);
  }

  if (Number.isInteger(row.inst?.addr) && ABS_ADDR_LABELS.has(row.inst.addr)) {
    notes.push(`mem: ${ABS_ADDR_LABELS.get(row.inst.addr)}`);
  }

  return notes;
}

function printRows(rows, highlightAddrs = new Set()) {
  for (const row of rows) {
    const marker = highlightAddrs.has(row.pc) ? '>' : ' ';
    const notes = annotationForRow(row);
    const suffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text}${suffix}`);
  }
}

function collectRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }
  return rows;
}

function scanPattern(bytes, start = 0, end = rom.length) {
  const hits = [];
  const limit = Math.min(end, rom.length) - bytes.length;

  outer: for (let pc = Math.max(0, start); pc <= limit; pc += 1) {
    for (let index = 0; index < bytes.length; index += 1) {
      if (rom[pc + index] !== bytes[index]) continue outer;
    }
    hits.push(pc);
  }

  return hits;
}

function formatAddressList(addresses) {
  return addresses.length ? addresses.map((value) => hex(value)).join(', ') : 'none';
}

function isIy12BitOp(inst, tag, bit) {
  return (
    inst?.tag === tag &&
    upper(inst.indexRegister) === 'IY' &&
    ((inst.displacement ?? 0) & 0xFF) === IY_DISPLACEMENT &&
    inst.bit === bit
  );
}

function tryDecodePath(start, target, maxSteps = 48) {
  const rows = [];
  let pc = start;

  for (let step = 0; step < maxSteps && pc <= target; step += 1) {
    const row = decodeRow(pc);
    rows.push(row);

    if (pc === target) {
      return rows;
    }

    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) {
      return null;
    }

    pc = row.nextPc;
  }

  return null;
}

function findAlignedRows(target, maxLookback = 0x20) {
  const minStart = Math.max(0, target - maxLookback);
  let best = null;

  for (let start = minStart; start <= target; start += 1) {
    const rows = tryDecodePath(start, target);
    if (!rows) continue;

    const beforeCount = rows.length - 1;
    const byteSpan = target - start;
    const score = beforeCount * 1000 - byteSpan;

    if (!best || score > best.score) {
      best = { score, rows };
    }
  }

  return best?.rows ?? [decodeRow(target)];
}

function buildContext(target, before = 2, after = 3) {
  const rows = [...findAlignedRows(target)];
  let targetIndex = rows.findIndex((row) => row.pc === target);

  if (targetIndex === -1) {
    return [decodeRow(target)];
  }

  let pc = rows[rows.length - 1].nextPc;
  while (rows.length < targetIndex + 1 + after && pc < rom.length) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }

  targetIndex = rows.findIndex((row) => row.pc === target);
  const startIndex = Math.max(0, targetIndex - before);
  const endIndex = Math.min(rows.length, targetIndex + after + 1);
  return rows.slice(startIndex, endIndex);
}

function describeImmediateBranch(hitAddr) {
  const hitRow = decodeRow(hitAddr);
  const nextRow = decodeRow(hitRow.nextPc);
  const inst = nextRow.inst;
  const fallthrough = nextRow.nextPc;

  if (!inst) {
    return 'no immediate flag consumer';
  }

  if (inst.tag === 'ret-conditional') {
    if (inst.condition === 'z') return `Z -> RET, NZ -> ${hex(fallthrough)}`;
    if (inst.condition === 'nz') return `NZ -> RET, Z -> ${hex(fallthrough)}`;
    return `${upper(inst.condition)} -> RET`;
  }

  if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'call-conditional') {
    if (inst.condition === 'z') return `Z -> ${hex(inst.target)}, NZ -> ${hex(fallthrough)}`;
    if (inst.condition === 'nz') return `NZ -> ${hex(inst.target)}, Z -> ${hex(fallthrough)}`;
    return `${upper(inst.condition)} -> ${hex(inst.target)}, else -> ${hex(fallthrough)}`;
  }

  return 'no immediate Z/NZ consumer';
}

function printPatternStats() {
  console.log('Pattern Inventory');
  console.log('-----------------');
  for (const pattern of PATTERNS) {
    const globalHits = scanPattern(pattern.bytes);
    const localHits = scanPattern(pattern.bytes, KEY_DISPATCH_SCAN_START, KEY_DISPATCH_SCAN_END);
    console.log(`${pattern.label}`);
    console.log(`  Global (${globalHits.length}): ${formatAddressList(globalHits)}`);
    console.log(
      `  ${hex(KEY_DISPATCH_SCAN_START)}..${hex(KEY_DISPATCH_SCAN_END)} (${localHits.length}): ${formatAddressList(localHits)}`,
    );
  }
  console.log('');
}

function printRequestedSetWindow() {
  console.log('Requested Dispatch Window');
  console.log('------------------------');
  console.log(
    `Task asked for ${hex(REQUESTED_SET_WINDOW_START)}..${hex(REQUESTED_SET_WINDOW_END)} around ${hex(REQUESTED_SET_ADDR)}.`,
  );
  console.log(
    `Expanded aligned decode: ${hex(EXPANDED_SET_WINDOW_START)}..${hex(EXPANDED_SET_WINDOW_END)} to show the full decision tree.`,
  );
  console.log('');
  printRows(
    collectRange(EXPANDED_SET_WINDOW_START, EXPANDED_SET_WINDOW_END),
    new Set([REQUESTED_SET_ADDR]),
  );
  console.log('');

  const requestedRow = decodeRow(REQUESTED_SET_ADDR);
  const localSetHits = scanPattern(PATTERNS[0].bytes, KEY_DISPATCH_SCAN_START, KEY_DISPATCH_SCAN_END);
  console.log(`Observed at ${hex(REQUESTED_SET_ADDR)}: ${requestedRow.text}`);
  if (!isIy12BitOp(requestedRow.inst, 'indexed-cb-set', 2)) {
    console.log(
      `Note: ${hex(REQUESTED_SET_ADDR)} is not ${PATTERNS[0].label}. No ${PATTERNS[0].label} appears in ${hex(KEY_DISPATCH_SCAN_START)}..${hex(KEY_DISPATCH_SCAN_END)}.`,
    );
  }
  console.log(`Local bit-2 SET hits in scan window: ${formatAddressList(localSetHits)}`);
  console.log('');
}

function printRequestedResWindow() {
  console.log('Requested Clear Window');
  console.log('----------------------');
  console.log(
    `Task asked for ${hex(REQUESTED_RES_WINDOW_START)}..${hex(REQUESTED_RES_WINDOW_END)} around ${hex(REQUESTED_RES_ADDR)}.`,
  );
  console.log('');
  printRows(
    collectRange(REQUESTED_RES_WINDOW_START, REQUESTED_RES_WINDOW_END),
    new Set([REQUESTED_RES_ADDR]),
  );
  console.log('');
  console.log('Pre-Clear Gate');
  console.log('--------------');
  console.log(`Expanded gate block: ${hex(CLEAR_GATE_START)}..${hex(CLEAR_GATE_END)}`);
  console.log('');
  printRows(
    collectRange(CLEAR_GATE_START, CLEAR_GATE_END),
    new Set([CLEAR_GATE_START, REQUESTED_RES_ADDR]),
  );
  console.log('');
}

function printDispatchBit2Tests() {
  console.log('BIT 2 Tests In Key Dispatch Region');
  console.log('----------------------------------');
  const hits = scanPattern(PATTERNS[2].bytes, KEY_DISPATCH_SCAN_START, KEY_DISPATCH_SCAN_END);

  if (!hits.length) {
    console.log(`None found in ${hex(KEY_DISPATCH_SCAN_START)}..${hex(KEY_DISPATCH_SCAN_END)}.`);
    console.log('');
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit)}  ${describeImmediateBranch(hit)}`);
    printRows(buildContext(hit, 2, 3), new Set([hit]));
    console.log('');
  }
}

function printGlobalBit2Reference() {
  console.log('Global BIT 2 Reference Sites');
  console.log('----------------------------');
  const hits = scanPattern(PATTERNS[2].bytes);

  for (const hit of hits) {
    console.log(`${hex(hit)}  ${describeImmediateBranch(hit)}`);
    printRows(buildContext(hit, 2, 3), new Set([hit]));
    console.log('');
  }
}

function printSummary() {
  const globalSetHits = scanPattern(PATTERNS[0].bytes);
  const globalResHits = scanPattern(PATTERNS[1].bytes);
  const globalBitHits = scanPattern(PATTERNS[2].bytes);
  const localSetHits = scanPattern(PATTERNS[0].bytes, KEY_DISPATCH_SCAN_START, KEY_DISPATCH_SCAN_END);
  const localBitHits = scanPattern(PATTERNS[2].bytes, KEY_DISPATCH_SCAN_START, KEY_DISPATCH_SCAN_END);
  const gateBranch = describeImmediateBranch(CLEAR_GATE_START);

  console.log('Summary');
  console.log('-------');
  console.log(
    `- ${hex(REQUESTED_SET_ADDR)} decodes as ${decodeRow(REQUESTED_SET_ADDR).text}, not ${PATTERNS[0].label}.`,
  );
  if (!localSetHits.length) {
    console.log(
      `- Edit/input mode is not entered by a local bit-2 SET in ${hex(KEY_DISPATCH_SCAN_START)}..${hex(KEY_DISPATCH_SCAN_END)}; this dispatch block is steering bits 3, 4, and 5 instead.`,
    );
  } else {
    console.log(`- Local bit-2 SET sites: ${formatAddressList(localSetHits)}.`);
  }
  console.log(
    `- The only bit-2 operation inside ${hex(KEY_DISPATCH_SCAN_START)}..${hex(KEY_DISPATCH_SCAN_END)} is ${PATTERNS[1].label} at ${hex(REQUESTED_RES_ADDR)}.`,
  );
  console.log(
    `- Clear path gate: ${hex(CLEAR_GATE_START)} is ${decodeRow(CLEAR_GATE_START).text}; ${gateBranch}. Non-zero fallthrough runs CALL ${hex(0x04A52C)}, CALL ${hex(0x024027)}, LDIR 8 bytes from ${hex(0xD0082E)}, then clears bit 2 at ${hex(REQUESTED_RES_ADDR)} and jumps to ${hex(0x08C5D7)}.`,
  );
  if (!localBitHits.length) {
    console.log(
      `- ${PATTERNS[2].label} is never tested in the requested key-dispatch scan window; the actual global tests are ${formatAddressList(globalBitHits)}.`,
    );
  }
  console.log(
    `- Global bit-2 inventory: SET x${globalSetHits.length}, RES x${globalResHits.length}, BIT x${globalBitHits.length}. Global SET sites are ${formatAddressList(globalSetHits)}.`,
  );
  console.log('');
}

function main() {
  console.log('Phase 395 - Trace Bit 2 of IY+0x12 in Key Dispatch');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Expected ROM size: ${hex(EXPECTED_ROM_SIZE)} (${EXPECTED_ROM_SIZE} bytes)`);
  console.log(`Observed ROM size: ${hex(rom.length)} (${rom.length} bytes)`);
  console.log('');

  if (rom.length !== EXPECTED_ROM_SIZE) {
    console.log('WARNING: ROM size does not match the expected 4 MiB image.');
    console.log('');
  }

  printPatternStats();
  printRequestedSetWindow();
  printRequestedResWindow();
  printDispatchBit2Tests();
  printGlobalBit2Reference();
  printSummary();
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        probe: 'probe-phase395-iy12-bit2-dispatch.mjs',
        error: {
          message: error?.message ?? String(error),
          stack: error?.stack ?? String(error),
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
