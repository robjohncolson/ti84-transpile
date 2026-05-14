#!/usr/bin/env node
/**
 * probe-phase319-display-subsystem-vectors.mjs
 *
 * Traces vectors 224-252 at two layers:
 * - Low ROM API stubs at 0x000200 + vec*4 (the phase 318 display-facing layer)
 * - Mega-table entries at 0x020110 + vec*4 (the layer requested by phase 319)
 *
 * The two layers do not match in this ROM image, so the probe prints both.
 */

import { readFileSync } from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const STUB_BASE = 0x000200;
const MEGA_BASE = 0x020110;
const VEC_START = 224;
const VEC_END = 252;
const CONTROL_TRANSFER_OPS = new Set([
  0xC2, 0xC3, 0xC4, 0xCA, 0xCC, 0xCD,
  0xD2, 0xD4, 0xDA, 0xDC,
  0xE2, 0xE4, 0xEA, 0xEC,
  0xF2, 0xF4, 0xFA, 0xFC,
]);

const EXPECTED = [
  { vec: 224, low: 0x010220, mega: 0x07FFCF, refs: 1, category: 'callback dispatch' },
  { vec: 225, low: 0x010F00, mega: 0x07FFD1, refs: 1, category: 'clear + init' },
  { vec: 226, low: 0x010F87, mega: 0x07FFDC, refs: 0, category: 'status query' },
  { vec: 227, low: 0x010A50, mega: 0x07FFE5, refs: 1, category: 'LCD port op' },
  { vec: 228, low: 0x010A94, mega: 0x080037, refs: 1, category: 'LCD port op' },
  { vec: 229, low: 0x010701, mega: 0x080043, refs: 1, category: 'display parameter / table handler' },
  { vec: 230, low: 0x0107AC, mega: 0x080051, refs: 1, category: 'buffer / mode gate' },
  { vec: 231, low: 0x01095C, mega: 0x080065, refs: 1, category: 'display parameter setter' },
  { vec: 232, low: 0x0106F3, mega: 0x092FA0, refs: 1, category: 'callback flag / status' },
  { vec: 233, low: 0x010948, mega: 0x092FDD, refs: 1, category: 'display parameter setter' },
  { vec: 234, low: 0x0103D7, mega: 0x09E60C, refs: 1, category: 'display parameter getter' },
  { vec: 235, low: 0x010466, mega: 0x0800EC, refs: 2, category: 'LCD status query' },
  { vec: 236, low: 0x010403, mega: 0x080115, refs: 1, category: 'LCD port read' },
  { vec: 237, low: 0x01042E, mega: 0x08011F, refs: 1, category: 'LCD port write / parameter commit' },
  { vec: 238, low: 0x0104CC, mega: 0x08012D, refs: 1, category: 'LCD status query' },
  { vec: 239, low: 0x0104F7, mega: 0x080133, refs: 1, category: 'callback / LCD sync' },
  { vec: 240, low: 0x010AC4, mega: 0x080151, refs: 1, category: 'LCD status query' },
  { vec: 241, low: 0x010AEB, mega: 0x080173, refs: 1, category: 'callback / LCD finalize' },
  { vec: 242, low: 0x010782, mega: 0x08017C, refs: 2, category: 'LCD status query' },
  { vec: 243, low: 0x007B70, mega: 0x080182, refs: 1, category: 'LCD outlier' },
  { vec: 244, low: 0x0103A4, mega: 0x080188, refs: 1, category: 'display parameter setup' },
  { vec: 245, low: 0x010553, mega: 0x08018C, refs: 1, category: 'display mode handler' },
  { vec: 246, low: 0x01058B, mega: 0x080193, refs: 1, category: 'display mode handler' },
  { vec: 247, low: 0x01061D, mega: 0x09A3BD, refs: 1, category: 'display mode handler' },
  { vec: 248, low: 0x01069C, mega: 0x08019F, refs: 2, category: 'callback install' },
  { vec: 249, low: 0x010EDD, mega: 0x0801A8, refs: 1, category: 'callback reset' },
  { vec: 250, low: 0x0109B7, mega: 0x0801BE, refs: 1, category: 'status selector' },
  { vec: 251, low: 0x0109A0, mega: 0x0820B5, refs: 1, category: 'flag / pointer query' },
  { vec: 252, low: 0x0109ED, mega: 0x0820CA, refs: 1, category: 'status translator' },
];

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.log(`  FAIL: ${label}`);
    fail++;
  }
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function hexdump(offset, length = 16) {
  return Array.from(rom.slice(offset, offset + length), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join(' ');
}

function countStubRefs(stubAddr) {
  const callers = [];
  for (let pc = 0; pc < rom.length - 3; pc++) {
    if (!CONTROL_TRANSFER_OPS.has(rom[pc])) continue;
    if (read24(pc + 1) === stubAddr) callers.push(pc);
  }
  return callers;
}

function formatInstruction(inst) {
  let text = inst.tag;
  if (inst.pair) text += ' ' + inst.pair;
  if (inst.dest && !inst.pair) text += ' ' + inst.dest;
  if (inst.src) text += ', ' + inst.src;
  if (inst.value !== undefined) text += ' = ' + hex(inst.value);
  if (inst.addr !== undefined) text += ' [' + hex(inst.addr) + ']';
  if (inst.target !== undefined) text += ' -> ' + hex(inst.target);
  if (inst.condition) text += ' ?' + inst.condition;
  if (inst.indexRegister) {
    const disp = inst.displacement === undefined
      ? ''
      : (inst.displacement >= 0 ? '+' : '') + inst.displacement;
    text += ` (${inst.indexRegister}${disp})`;
  }
  return text;
}

function disasmPrefix(start, maxBytes = 32, maxInstructions = 8) {
  const lines = [];
  let pc = start;
  let used = 0;
  for (let i = 0; i < maxInstructions && used < maxBytes; i++) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const raw = Array.from(rom.slice(pc, pc + inst.length), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join(' ');
      lines.push(`${hex(pc)}  ${raw.padEnd(20)}  ${formatInstruction(inst)}`);
      used += inst.length;
      pc = inst.nextPc;
      if (inst.tag === 'ret' || inst.tag === 'jp-indirect') break;
    } catch (err) {
      lines.push(`${hex(pc)}  ERROR  ${err.message}`);
      break;
    }
  }
  return lines;
}

const rows = EXPECTED.map((expected) => {
  const stub = STUB_BASE + expected.vec * 4;
  const megaEntry = MEGA_BASE + expected.vec * 4;
  const low = read24(stub + 1);
  const mega = read24(megaEntry + 1);
  const callers = countStubRefs(stub);
  return {
    ...expected,
    stub,
    megaEntry,
    lowActual: low,
    megaActual: mega,
    callers,
    megaDump: hexdump(mega, 16),
    megaDisasm: disasmPrefix(mega),
  };
});

console.log('Phase 319: Vectors 224-252');
console.log('==========================\n');

console.log('=== Assertions ===');
check('Trace covers 29 vectors (224-252 inclusive)', rows.length === 29);
check('All low ROM stubs are JP entries', rows.every((row) => rom[row.stub] === 0xC3));
check('All mega-table entries are JP entries', rows.every((row) => rom[row.megaEntry] === 0xC3));
check('All observed low targets match the expected phase 318 display targets',
  rows.every((row) => row.lowActual === row.low));
check('All observed mega-table targets match the captured phase 319 sweep',
  rows.every((row) => row.megaActual === row.mega));
check('All caller counts match the direct stub-reference census',
  rows.every((row) => row.callers.length === row.refs));
check('All 29 mega-table targets differ from their low-stub targets',
  rows.every((row) => row.lowActual !== row.megaActual));
check('Only vec 226 has zero direct stub refs',
  rows.filter((row) => row.callers.length === 0).map((row) => row.vec).join(',') === '226');
check('Exactly vec 235, 242, and 248 have two direct stub refs',
  rows.filter((row) => row.callers.length === 2).map((row) => row.vec).join(',') === '235,242,248');
check('Total direct stub refs across the cluster is 31',
  rows.reduce((sum, row) => sum + row.callers.length, 0) === 31);
check('Vec 224/225/248/249 still resolve to the previously decoded low targets',
  rows.find((row) => row.vec === 224).lowActual === 0x010220 &&
  rows.find((row) => row.vec === 225).lowActual === 0x010F00 &&
  rows.find((row) => row.vec === 248).lowActual === 0x01069C &&
  rows.find((row) => row.vec === 249).lowActual === 0x010EDD);

console.log('\n=== Summary Table ===');
console.log('| Vec | Stub | Low Target | Mega Entry | Mega Target | Stub Refs | Callers | Low Category | Mega Hex Dump |');
console.log('|---:|---|---|---|---|---:|---|:---|:---|');
for (const row of rows) {
  const callerList = row.callers.length
    ? row.callers.map((addr) => hex(addr)).join(', ')
    : '-';
  console.log(
    `| ${row.vec} | ${hex(row.stub)} | ${hex(row.lowActual)} | ${hex(row.megaEntry)} | ` +
    `${hex(row.megaActual)} | ${row.callers.length} | ${callerList} | ${row.category} | ${row.megaDump} |`
  );
}

console.log('\n=== Mega-Target Prefix Disassembly ===');
for (const row of rows) {
  console.log(`\nVec ${row.vec}  low=${hex(row.lowActual)}  mega=${hex(row.megaActual)}  category=${row.category}`);
  for (const line of row.megaDisasm) {
    console.log('  ' + line);
  }
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed out of ${pass + fail} ===`);
process.exit(fail > 0 ? 1 : 0);
