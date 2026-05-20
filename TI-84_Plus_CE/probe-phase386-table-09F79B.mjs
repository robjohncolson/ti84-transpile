#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TABLE_BASE = 0x09F79B;
const RAW_DUMP_LENGTH = 0x100;
const LOOKUP_HELPER = 0x022346;
const LOOKUP_HELPER_SECONDARY = 0x022359;
const NORMAL_LOOKUP_CALLER = 0x02FF0B;
const NORMAL_LOOKUP_CALLER_END = 0x02FF1A;
const MODIFIER_PATH_START = 0x02FFF6;
const MODIFIER_PATH_END = 0x03012E;
const BASE_REF_PATTERN = [0x11, 0x9B, 0xF7, 0x09];
const MODE = 'adl';

const MATRIX_LAYOUT = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  ['ENTER', '+', '-', 'x', '/', '^', 'CLEAR', null],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

const KEY_CODE_NAMES = new Map([
  [0x00, 'none'],
  [0x01, 'kRight'],
  [0x02, 'kLeft'],
  [0x03, 'kUp'],
  [0x04, 'kDown'],
  [0x05, 'kEnter'],
  [0x06, 'kAlphaEnter'],
  [0x07, 'kAlphaUp'],
  [0x08, 'kAlphaDown'],
  [0x09, 'kClear'],
  [0x0A, 'kDel'],
  [0x0B, 'kIns'],
  [0x0C, 'kRecall'],
  [0x0D, 'kLastEnt'],
  [0x0E, 'kBOL'],
  [0x0F, 'kEOL'],
  [0x2C, 'kApps? / special'],
  [0x2D, 'kPrgm? / special'],
  [0x2E, 'kZoom? / special'],
  [0x30, 'kPi'],
  [0x31, 'kInv'],
  [0x32, 'kSin'],
  [0x33, 'kASin'],
  [0x34, 'kCos'],
  [0x35, 'kACos / kVars'],
  [0x36, 'kTan'],
  [0x37, 'kATan'],
  [0x38, 'kSquare'],
  [0x39, 'kSqrt'],
  [0x40, 'kMath'],
  [0x41, 'kMatrix'],
  [0x44, 'kClrHome? / Graph action'],
  [0x45, 'kClrTable? / Mode action'],
  [0x48, 'kClrAll? / Window action'],
  [0x49, 'kYequ? / Y= action'],
  [0x4A, 'special 0x4A'],
  [0x57, 'kWindow?'],
  [0x5A, 'kMode? / Trace action'],
  [0x80, '+'],
  [0x81, '-'],
  [0x82, '*'],
  [0x83, '/'],
  [0x84, '^'],
  [0x85, '('],
  [0x86, ')'],
  [0x87, '.'],
  [0x88, '(-)'],
  [0x8A, 'STO>'],
  [0x8B, ','],
  [0x8C, 'negate'],
  [0x8D, '.'],
  [0x8E, '0'],
  [0x8F, '1'],
  [0x90, '2'],
  [0x91, '3'],
  [0x92, '4'],
  [0x93, '5'],
  [0x94, '6'],
  [0x95, '7'],
  [0x96, '8'],
  [0x97, '9'],
  [0x98, 'alpha-space / special'],
  [0x99, 'space / special'],
  [0x9A, 'A'],
  [0x9B, 'B'],
  [0x9C, 'C'],
  [0x9D, 'D'],
  [0x9E, 'E'],
  [0x9F, 'F'],
  [0xA0, 'G'],
  [0xA1, 'H'],
  [0xA2, 'I'],
  [0xA3, 'J'],
  [0xA4, 'K'],
  [0xA5, 'L'],
  [0xA6, 'M'],
  [0xA7, 'N'],
  [0xA8, 'O'],
  [0xA9, 'P'],
  [0xAA, 'Q'],
  [0xAB, 'R'],
  [0xAC, 'S'],
  [0xAD, 'T'],
  [0xAE, 'U'],
  [0xAF, 'V'],
  [0xB0, 'W'],
  [0xB1, 'X'],
  [0xB2, 'Y'],
  [0xB3, 'Z'],
  [0xB4, 'X,T,theta,n / special'],
  [0xB6, 'x^-1'],
  [0xB7, 'sin('],
  [0xB8, 'asin('],
  [0xB9, 'cos('],
  [0xBA, 'acos('],
  [0xBB, 'tan('],
  [0xBC, 'atan('],
  [0xBD, 'x^2'],
  [0xBE, 'sqrt('],
  [0xBF, 'ln('],
  [0xC0, 'e^('],
  [0xC1, 'log('],
  [0xC2, '10^('],
  [0xC5, 'Ans / special'],
  [0xCB, 'quote / special'],
  [0xCC, 'theta / special'],
  [0xE2, 'extended/system'],
  [0xE3, 'extended/system'],
  [0xE4, 'extended/system'],
  [0xE5, 'extended/system'],
  [0xE6, 'extended/system'],
  [0xE7, 'extended/system'],
  [0xE8, 'extended/system'],
  [0xE9, 'extended/system'],
  [0xEA, 'extended/system'],
  [0xEB, 'extended/system'],
  [0xEC, 'extended/system'],
  [0xED, 'extended/system'],
  [0xEE, 'extended/system'],
  [0xEF, 'extended/system'],
  [0xF0, 'extended/system'],
  [0xF1, 'extended/system'],
  [0xF2, 'extended/system'],
  [0xF3, 'extended/system'],
  [0xF4, 'extended/system'],
  [0xF5, 'extended/system'],
  [0xF6, 'extended/system'],
  [0xF7, 'extended/system'],
  [0xF8, 'extended/system'],
  [0xF9, 'extended/system'],
  [0xFA, 'extended/system'],
  [0xFB, 'extended/system'],
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteString(value) {
  return hex(value & 0xFF, 2);
}

function bytesToText(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(start + length, buffer.length)),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function printable(value) {
  return value >= 0x20 && value <= 0x7E ? `'${String.fromCharCode(value)}'` : null;
}

function describeKeyCode(value) {
  const known = KEY_CODE_NAMES.get(value);
  if (known) return known;
  const char = printable(value);
  if (char) return char;
  return null;
}

function formatKeyCode(value) {
  const description = describeKeyCode(value);
  return description ? `${byteString(value)} ${description}` : byteString(value);
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : '-'}${hex(Math.abs(value), 2)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatSigned(displacement)})`;
}

function formatInstruction(inst) {
  const tag = inst?.tag ?? 'unknown';
  if (tag === 'db') return `db ${byteString(inst.value)}`;

  const noOperand = new Set([
    'nop', 'halt', 'ret', 'reti', 'retn', 'scf', 'ccf', 'cpl', 'di', 'ei',
    'daa', 'neg', 'rlca', 'rrca', 'rla', 'rra', 'exx', 'ldir', 'lddr', 'ldi',
    'ldd', 'cpir', 'cpdr', 'cpi', 'cpd', 'rrd', 'rld',
  ]);
  if (noOperand.has(tag)) return tag;

  switch (tag) {
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'call': return `call ${hex(inst.target, 6)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target, 6)}`;
    case 'jp': return `jp ${hex(inst.target, 6)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target, 6)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'jr': return `jr ${hex(inst.target, 6)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target, 6)}`;
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value, 6)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${byteString(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr, 6)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr, 6)}), ${inst.src}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'lea': return `lea ${inst.dest}, ${inst.base}${formatSigned(inst.displacement)}`;
    case 'alu-imm': return `${inst.op} ${byteString(inst.value)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default:
      return tag;
  }
}

function decodeRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, MODE);
      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        throw new Error('invalid decode');
      }
    } catch {
      inst = { tag: 'db', value: rom[pc], length: 1, nextPc: pc + 1 };
    }
    rows.push({
      pc,
      bytes: bytesToText(rom, pc, inst.length),
      text: formatInstruction(inst),
      inst,
    });
    pc = inst.nextPc ?? (pc + inst.length);
  }
  return rows;
}

function dumpDisassembly(title, rows, markers = new Map()) {
  console.log(title);
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc, 6)}  ${row.bytes.padEnd(17)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
  console.log('');
}

function hexdump(start, length) {
  for (let offset = 0; offset < length; offset += 16) {
    const slice = rom.subarray(start + offset, Math.min(start + offset + 16, rom.length));
    const ascii = Array.from(slice, (value) => (value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '.')).join('');
    console.log(
      `  ${hex(start + offset, 6)}  ${Array.from(slice, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(47)}  ${ascii}`,
    );
  }
  console.log('');
}

function findPattern(pattern) {
  const hits = [];
  const limit = rom.length - pattern.length;
  for (let i = 0; i <= limit; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function buildCompactSlotMap() {
  const map = new Map();
  for (let group = 0; group < MATRIX_LAYOUT.length; group += 1) {
    for (let bit = 0; bit < MATRIX_LAYOUT[group].length; bit += 1) {
      const name = MATRIX_LAYOUT[group][bit];
      if (!name) continue;
      const compactSlot = (group * 8) + bit + 1;
      const reverseScan = ((6 - group) * 8) + bit + 1;
      map.set(compactSlot, {
        key: name,
        group,
        bit,
        compactSlot,
        reverseScan,
        rawMatrixCode: (group << 4) | bit,
      });
    }
  }
  return map;
}

const compactSlotMap = buildCompactSlotMap();

function analyzeIndexModel() {
  const anchors = [
    { name: 'GRAPH', group: 6, bit: 0 },
    { name: '2ND', group: 6, bit: 5 },
    { name: 'DEL', group: 6, bit: 7 },
    { name: 'ALPHA', group: 5, bit: 7 },
    { name: '0', group: 4, bit: 0 },
    { name: 'ENTER', group: 1, bit: 0 },
    { name: 'CLEAR', group: 1, bit: 6 },
  ];

  console.log('=== Candidate Index Models ===');
  console.log('The bytes line up with compact matrix-order slots, not with the reverse-order _GetCSC sequence from session 378.');
  console.log('');
  console.log('  Key     compact=(group*8)+bit+1  table[compact]           reverse=(6-group)*8+bit+1  table[reverse]');
  console.log('  ------  ------------------------  ----------------------  ---------------------------  ----------------------');
  for (const anchor of anchors) {
    const compact = (anchor.group * 8) + anchor.bit + 1;
    const reverse = ((6 - anchor.group) * 8) + anchor.bit + 1;
    const compactValue = rom[TABLE_BASE + compact];
    const reverseValue = rom[TABLE_BASE + reverse];
    console.log(
      `  ${anchor.name.padEnd(6)}  ${hex(compact, 2).padEnd(24)} ${formatKeyCode(compactValue).padEnd(24)} ${hex(reverse, 2).padEnd(27)} ${formatKeyCode(reverseValue)}`,
    );
  }
  console.log('');
}

function analyzeHelper() {
  const helperRows = decodeRange(LOOKUP_HELPER, LOOKUP_HELPER + 0x40);
  const helper2Rows = decodeRange(LOOKUP_HELPER_SECONDARY, LOOKUP_HELPER_SECONDARY + 0x28);

  dumpDisassembly(
    '=== 0x022346 Helper ===',
    helperRows,
    new Map([
      [LOOKUP_HELPER, '<-- entry'],
      [0x02234E, '<-- loads the table byte'],
      [0x022352, '<-- forwards zero-extended byte to 0x022359'],
      [0x022358, '<-- returns with AF restored'],
    ]),
  );

  dumpDisassembly(
    '=== 0x022359 Follow-On Helper ===',
    helper2Rows,
    new Map([
      [LOOKUP_HELPER_SECONDARY, '<-- descriptor builder'],
      [0x02236A, '<-- reads modifier/flag byte from (IY+0x12)'],
      [0x022375, '<-- hands 6-byte descriptor to 0x0236F9'],
    ]),
  );

  console.log('=== Helper Interpretation ===');
  console.log(`  - 0x022346 does not index the table itself. It expects HL to already point at ${hex(TABLE_BASE, 6)} + A.`);
  console.log('  - DE is not read anywhere inside 0x022346. DE is only used by the caller to form HL = DE + A.');
  console.log('  - A is not consumed as a scan code at helper entry. The helper immediately saves AF, calls 0x000578, then reads A = (HL).');
  console.log('  - The byte from (HL) is zero-extended into HL (LD L,A / LD H,0) and passed to 0x022359.');
  console.log('  - 0x022359 packages that byte plus the current (IY+0x12) flag byte into a small stack descriptor and calls 0x0236F9.');
  console.log('  - Return behavior: 0x022346 restores HL and AF before RET, so the translated byte is not returned in A, HL, or DE.');
  console.log('  - Net effect: this path consumes the looked-up byte through side effects; it is not a plain "return translated token in a register" helper.');
  console.log('');
}

function analyzeCallers() {
  const callerRows = decodeRange(NORMAL_LOOKUP_CALLER, NORMAL_LOOKUP_CALLER_END);
  const modifierRows = decodeRange(MODIFIER_PATH_START, MODIFIER_PATH_END);
  const baseRefHits = findPattern(BASE_REF_PATTERN);

  dumpDisassembly(
    '=== Normal Caller (0x02FF0B) ===',
    callerRows,
    new Map([
      [NORMAL_LOOKUP_CALLER, '<-- caller entry'],
      [0x02FF10, '<-- A becomes L'],
      [0x02FF11, '<-- DE = 0x09F79B'],
      [0x02FF15, '<-- HL = DE + A'],
      [0x02FF16, '<-- CALL 0x022346'],
    ]),
  );

  dumpDisassembly(
    '=== Nearby Modifier Path (0x02FFF6..0x03012D) ===',
    modifierRows,
    new Map([
      [0x030074, '<-- jumps back to 0x02FF0B after offset math'],
      [0x03010D, '<-- adds 0x70 before reuse of the same base'],
      [0x030117, '<-- adds another 0x38'],
      [0x03011C, '<-- direct DE = 0x09F79B load'],
      [0x030121, '<-- direct A = (HL) table read'],
    ]),
  );

  console.log('=== Immediate ROM References To 0x09F79B ===');
  for (const hit of baseRefHits) {
    const context = decodeRange(Math.max(0, hit - 6), Math.min(rom.length, hit + 12));
    console.log(`  Hit at ${hex(hit, 6)}:`);
    for (const row of context) {
      const marker = row.pc === hit ? '  <-- LD DE,0x09F79B' : '';
      console.log(`    ${hex(row.pc, 6)}  ${row.bytes.padEnd(17)}  ${row.text}${marker}`);
    }
  }
  console.log('');

  console.log('=== Caller Interpretation ===');
  console.log('  - The normal path is a flat byte-array lookup: HL = 0 + A, DE = 0x09F79B, HL += DE, CALL 0x022346.');
  console.log('  - That proves the table is not key/value pairs or a linked structure. It is direct indexing by a 1-byte slot.');
  console.log('  - The nearby modifier path reuses the same base and adjusts A first:');
  console.log('      A += 0x70  -> higher plane');
  console.log('      A += 0x38  -> next higher plane');
  console.log('      JP 0x030074 -> JP 0x02FF0B, or direct LD A,(HL) at 0x030121.');
  console.log('  - So ALPHA / 2ND variants are nearby in the same ROM region, not in separate distant tables.');
  console.log('');
}

function printNoModMapping() {
  console.log('=== No-Modifier Table: entry[0x01..0x38] ===');
  console.log('  slot  raw  key          value');
  console.log('  ----  ---  -----------  -------------------------');
  for (let slot = 0x01; slot <= 0x38; slot += 1) {
    const info = compactSlotMap.get(slot);
    const value = rom[TABLE_BASE + slot];
    const key = info ? info.key : '(unused)';
    const raw = info ? hex(info.rawMatrixCode, 2) : '--';
    console.log(
      `  ${hex(slot, 2).padEnd(4)}  ${String(raw).padEnd(3)}  ${key.padEnd(11)}  ${formatKeyCode(value)}`,
    );
  }
  console.log('');
}

function printPlaneSamples() {
  const planes = [
    { name: 'none', add: 0x00, effectiveStart: TABLE_BASE + 0x01, effectiveEnd: TABLE_BASE + 0x38 },
    { name: '2nd', add: 0x38, effectiveStart: TABLE_BASE + 0x39, effectiveEnd: TABLE_BASE + 0x70 },
    { name: 'alpha', add: 0x70, effectiveStart: TABLE_BASE + 0x71, effectiveEnd: TABLE_BASE + 0xA8 },
    { name: 'alpha+2nd', add: 0xA8, effectiveStart: TABLE_BASE + 0xA9, effectiveEnd: TABLE_BASE + 0xE0 },
  ];

  console.log('=== Nearby Modifier Planes ===');
  for (const plane of planes) {
    const enterSlot = 0x09;
    const graphSlot = 0x31;
    const delSlot = 0x38;
    const enterValue = rom[TABLE_BASE + plane.add + enterSlot];
    const graphValue = rom[TABLE_BASE + plane.add + graphSlot];
    const delValue = rom[TABLE_BASE + plane.add + delSlot];
    console.log(
      `  ${plane.name.padEnd(10)} add=${hex(plane.add, 2)}  ` +
      `effective bytes ${hex(plane.effectiveStart, 6)}..${hex(plane.effectiveEnd, 6)}  ` +
      `ENTER=${formatKeyCode(enterValue)}  GRAPH=${formatKeyCode(graphValue)}  DEL=${formatKeyCode(delValue)}`,
    );
  }
  console.log('');

  console.log('=== Boundary Bytes ===');
  for (const offset of [0x00, 0x38, 0x70, 0xA8, 0xE0, 0xE1, 0xE2, 0xE3]) {
    console.log(`  ${hex(TABLE_BASE + offset, 6)} (+${hex(offset, 2)}) = ${formatKeyCode(rom[TABLE_BASE + offset])}`);
  }
  console.log('');

  console.log('=== Reachable Span Conclusion ===');
  console.log(`  - No simple 0x00/0xFF terminator marks the end of the table.`);
  console.log(`  - From the code, the highest reachable address is base + 0xA8 + 0x38 = ${hex(TABLE_BASE + 0xE0, 6)}.`);
  console.log(`  - The first byte outside that reach is ${hex(TABLE_BASE + 0xE1, 6)} = ${byteString(rom[TABLE_BASE + 0xE1])}.`);
  console.log('  - Practically, this is one flat region with four logical modifier windows sharing the same base.');
  console.log('');
}

function printSummary() {
  const samples = [
    { key: 'ENTER', slot: 0x09 },
    { key: 'CLEAR', slot: 0x0F },
    { key: '2', slot: 0x1A },
    { key: 'GRAPH', slot: 0x31 },
    { key: '2ND', slot: 0x36 },
    { key: 'DEL', slot: 0x38 },
  ];

  console.log('=== Summary ===');
  console.log('  Table format: flat 1-byte array indexed by the compact matrix-order slot in A.');
  console.log('  Index formula that matches the data: slot = (group * 8) + bit + 1.');
  console.log('  This path does NOT use the reverse-order session-378 code (6-group)*8+bit+1.');
  console.log('  0x022346 is a table-byte consumer: it reads (HL), forwards the byte through 0x022359 -> 0x0236F9, then restores AF/HL and returns.');
  console.log('  DE is only the caller-side base register. The helper itself never dereferences DE.');
  console.log('  The same ROM region also contains modifier variants addressed by adding 0x38, 0x70, and 0xA8 before reusing the same base.');
  console.log('  Representative unmodified entries:');
  for (const sample of samples) {
    console.log(`    ${sample.key.padEnd(6)} slot ${hex(sample.slot, 2)} -> ${formatKeyCode(rom[TABLE_BASE + sample.slot])}`);
  }
  console.log('  Conclusion: 0x09F79B is the primary unmodified-key translation table for this dispatcher path, with nearby embedded modifier planes.');
  console.log('');
}

console.log('Phase 386 - 0x09F79B table lookup probe');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(rom.length, 8)} (${rom.length.toLocaleString('en-US')} bytes)`);
console.log(`Table base: ${hex(TABLE_BASE, 6)}`);
console.log('');

console.log('=== Raw Bytes 0x09F79B..+0xFF ===');
hexdump(TABLE_BASE, RAW_DUMP_LENGTH);

analyzeIndexModel();
analyzeHelper();
analyzeCallers();
printNoModMapping();
printPlaneSamples();
printSummary();
