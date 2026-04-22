#!/usr/bin/env node

/**
 * Phase 25X - Disassembly of ROM routine at 0x08A98F
 *
 * Graph-window initializer: copies 10 bytes of default graph parameters
 * to RAM starting at YOffset (0xD014FC).
 *
 * Two entry points:
 *   0x08A98F  primary   (source = 0x08A97B)
 *   0x08A995  alternate (source = 0x08A971)
 *
 * Both tail-call 0x07F976 (Mov10B = 10x LDI block copy).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

// --- Helpers ---

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function dumpBytes(start, length) {
  const bytes = rom.slice(start, start + length);
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

// --- Graph window parameter field labels ---

const GRAPH_FIELD_NAMES = [
  'graph param byte 0',
  'graph param byte 1',
  'graph param byte 2',
  'graph param byte 3',
  'graph param byte 4',
  'graph param byte 5',
  'graph param byte 6',
  'graph param byte 7',
  'graph param byte 8',
  'graph param byte 9',
];

// --- Disassembly of the routine ---

console.log('=== Phase 25X: Disassembly of 0x08A98F (Graph-Window Initializer) ===');
console.log();

const instructions = [
  {
    pc: 0x08a98f,
    len: 4,
    asm: 'LD HL, 0x08A97B',
    comment: 'source = primary ROM data table',
  },
  {
    pc: 0x08a993,
    len: 2,
    asm: 'JR +4',
    comment: 'skip alternate entry point',
  },
  {
    pc: 0x08a995,
    len: 4,
    asm: 'LD HL, 0x08A971',
    comment: 'alternate entry: source = alternate ROM data table',
  },
  {
    pc: 0x08a999,
    len: 4,
    asm: 'LD DE, 0xD014FC',
    comment: 'dest = YOffset (graph variable RAM)',
  },
  {
    pc: 0x08a99d,
    len: 4,
    asm: 'JP 0x07F976',
    comment: 'tail-call Mov10B (10x LDI, copies 10 bytes)',
  },
];

console.log('--- Code Listing ---');
console.log();
for (const instr of instructions) {
  const bytesHex = dumpBytes(instr.pc, instr.len);
  const pcStr = hex(instr.pc);
  console.log(`  ${pcStr}:  ${bytesHex.padEnd(14)}  ${instr.asm.padEnd(22)}  ; ${instr.comment}`);
}

console.log();
console.log('--- Data Block: Primary Source (0x08A97B, 10 bytes) ---');
console.log();
const primaryData = rom.slice(0x08a97b, 0x08a97b + 10);
console.log(`  Address: ${hex(0x08a97b)}`);
console.log(`  Hex:     ${dumpBytes(0x08a97b, 10)}`);
console.log();
console.log('  Offset  Hex   Dec   Description');
console.log('  ------  ----  ----  -----------');
for (let i = 0; i < 10; i++) {
  const b = primaryData[i];
  console.log(`  +${i}      ${hexByte(b)}    ${String(b).padStart(3)}   ${GRAPH_FIELD_NAMES[i]}`);
}

console.log();
console.log('--- Data Block: Alternate Source (0x08A971, 10 bytes) ---');
console.log();
const altData = rom.slice(0x08a971, 0x08a971 + 10);
console.log(`  Address: ${hex(0x08a971)}`);
console.log(`  Hex:     ${dumpBytes(0x08a971, 10)}`);
console.log();
console.log('  Offset  Hex   Dec   Description');
console.log('  ------  ----  ----  -----------');
for (let i = 0; i < 10; i++) {
  const b = altData[i];
  console.log(`  +${i}      ${hexByte(b)}    ${String(b).padStart(3)}   ${GRAPH_FIELD_NAMES[i]}`);
}

console.log();
console.log('--- Mov10B subroutine at 0x07F976 ---');
console.log();
console.log('  10x LDI (ED A0) then RET:');
const mov10bBytes = rom.slice(0x07f976, 0x07f976 + 21);
const mov10bHex = Array.from(mov10bBytes, (b) => hexByte(b)).join(' ');
console.log(`  Hex: ${mov10bHex}`);
let ldiCount = 0;
for (let i = 0; i < 20; i += 2) {
  if (mov10bBytes[i] === 0xed && mov10bBytes[i + 1] === 0xa0) {
    ldiCount++;
  }
}
console.log(`  LDI count: ${ldiCount}`);
console.log(`  Final byte: ${hexByte(mov10bBytes[20])} (${mov10bBytes[20] === 0xc9 ? 'RET - confirmed' : 'unexpected'})`);

console.log();
console.log('--- Verification: ROM byte check ---');
console.log();

const checks = [
  { addr: 0x08a98f, expected: 0x21, desc: 'LD HL,nn opcode' },
  { addr: 0x08a993, expected: 0x18, desc: 'JR opcode' },
  { addr: 0x08a994, expected: 0x04, desc: 'JR displacement (+4)' },
  { addr: 0x08a995, expected: 0x21, desc: 'LD HL,nn opcode (alt entry)' },
  { addr: 0x08a999, expected: 0x11, desc: 'LD DE,nn opcode' },
  { addr: 0x08a99d, expected: 0xc3, desc: 'JP nn opcode' },
];

let allPass = true;
for (const chk of checks) {
  const actual = rom[chk.addr];
  const ok = actual === chk.expected;
  if (!ok) allPass = false;
  console.log(`  ${hex(chk.addr)}: expected ${hexByte(chk.expected)}, got ${hexByte(actual)} ${ok ? 'PASS' : 'FAIL'} (${chk.desc})`);
}

console.log();
console.log('--- Summary ---');
console.log();
console.log('0x08A98F is a graph-window initializer that copies 10 bytes of default');
console.log('graph parameters to RAM starting at YOffset (0xD014FC).');
console.log();
console.log('Entry points:');
console.log('  0x08A98F  primary   (source = 0x08A97B)');
console.log('  0x08A995  alternate (source = 0x08A971)');
console.log();
console.log('Both tail-call 0x07F976 (Mov10B = 10x LDI block copy).');
console.log();
console.log('RAM written: 0xD014FC..0xD01505 (10 bytes at YOffset).');
console.log();
console.log('This routine does NOT affect ParseInp memory allocation.');
console.log('It initializes graph window variables, which are irrelevant');
console.log('to the expression parser free-space check.');
console.log();
console.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
