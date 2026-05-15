#!/usr/bin/env node
/**
 * Phase 334 - Verify fixed-font base addresses 0x0040EE vs 0x003D6E.
 *
 * This probe compares three interpretations:
 *   1. 0x0040EE + (char - 0x20) * 28      -> printable ASCII base
 *   2. 0x003D6E + (char - 0x20) * 28      -> earlier printable-base hypothesis
 *   3. 0x003D6E + char * 28               -> legacy raw-char indexing
 *
 * The key question is whether 0x003D6E is a different table, or just the same
 * fixed-width table viewed with a different index origin.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const VRAM_BASE = 0xD40000;

const PRINTABLE_BASE = 0x0040EE;
const LEGACY_BASE = 0x003D6E;
const FIXED_STRIDE = 28;
const PRINTABLE_SHIFT = 0x20 * FIXED_STRIDE;

const TEST_CHARS = [
  { code: 0x20, label: 'space' },
  { code: 0x30, label: "'0'" },
  { code: 0x41, label: "'A'" },
  { code: 0x42, label: "'B'" },
  { code: 0x61, label: "'a'" },
  { code: 0x7E, label: "'~'" },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16(buf, addr) {
  return ((buf[addr] ?? 0) | ((buf[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(buf, addr) {
  return (
    (buf[addr] ?? 0) |
    ((buf[addr + 1] ?? 0) << 8) |
    ((buf[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function render16x14(buf, addr) {
  const lines = [];
  for (let row = 0; row < 14; row++) {
    const b0 = buf[addr + row * 2];
    const b1 = buf[addr + row * 2 + 1];
    let line = '';
    for (let bit = 7; bit >= 0; bit--) line += ((b0 >> bit) & 1) ? '#' : '.';
    for (let bit = 7; bit >= 0; bit--) line += ((b1 >> bit) & 1) ? '#' : '.';
    lines.push(line);
  }
  return lines;
}

function render8x12(buf, addr) {
  const lines = [];
  for (let row = 0; row < 12; row++) {
    const b = buf[addr + row];
    let line = '';
    for (let bit = 7; bit >= 0; bit--) line += ((b >> bit) & 1) ? '#' : '.';
    lines.push(line);
  }
  return lines;
}

function render8x16(buf, addr) {
  const lines = [];
  for (let row = 0; row < 16; row++) {
    const b = buf[addr + row];
    let line = '';
    for (let bit = 7; bit >= 0; bit--) line += ((b >> bit) & 1) ? '#' : '.';
    lines.push(line);
  }
  return lines;
}

function countSet(lines) {
  let total = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch === '#') total++;
    }
  }
  return total;
}

function dumpBytes(buf, addr, length) {
  return Array.from(buf.slice(addr, addr + length), (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function printGlyphDump(title, resolver, renderer, byteLength) {
  console.log(title);
  console.log(`${'='.repeat(title.length)}\n`);

  for (const { code, label } of TEST_CHARS) {
    const addr = resolver(code);
    const lines = renderer(rom, addr);
    console.log(`--- Char ${hex(code, 2)} ${label} at ${hex(addr)} ---`);
    console.log(`Raw: ${dumpBytes(rom, addr, byteLength)}`);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log(`  (${countSet(lines)} set pixels)\n`);
  }
}

function dumpDescriptorRecord(label, ptr) {
  console.log(`\n--- ${label} ---`);
  console.log(`  ptr: ${hex(ptr)}`);

  if (ptr >= rom.length || ptr + 11 >= rom.length) {
    console.log('  pointer is not inside ROM, skipping record decode');
    return;
  }

  console.log(`  raw: ${dumpBytes(rom, ptr, 12)}`);
  console.log(`  +0 selector/field0 : ${hex(read24(rom, ptr + 0))}`);
  console.log(`  +3 draw/field1     : ${hex(read24(rom, ptr + 3))}`);
  console.log(`  +6 width/field2    : ${hex(read24(rom, ptr + 6))}`);
  console.log(`  +9 height/field3   : ${hex(read24(rom, ptr + 9))}`);
}

function coldBoot() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + 320 * 240 * 2);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
  }

  return { mem };
}

console.log('=== Phase 334 - Font Base Address Verification ===\n');
console.log(`Printable base : ${hex(PRINTABLE_BASE)}`);
console.log(`Legacy base    : ${hex(LEGACY_BASE)}`);
console.log(`Delta          : ${hex(PRINTABLE_BASE - LEGACY_BASE)} = 0x20 * 28 = ${hex(PRINTABLE_SHIFT)}`);
console.log('Implication    : 0x0040EE + (char-0x20)*28 should alias 0x003D6E + char*28.\n');

const { mem } = coldBoot();
console.log('Boot complete.\n');

printGlyphDump(
  '1. 0x0040EE printable-base hypothesis (16x14, stride 28)',
  (code) => PRINTABLE_BASE + (code - 0x20) * FIXED_STRIDE,
  render16x14,
  28,
);

printGlyphDump(
  '2. 0x003D6E printable-base hypothesis (16x14, stride 28)',
  (code) => LEGACY_BASE + (code - 0x20) * FIXED_STRIDE,
  render16x14,
  28,
);

printGlyphDump(
  '3. 0x003D6E small-font hypothesis (8x12, stride 12)',
  (code) => LEGACY_BASE + (code - 0x20) * 12,
  render8x12,
  12,
);

printGlyphDump(
  '4. 0x003D6E small-font hypothesis (8x16, stride 16)',
  (code) => LEGACY_BASE + (code - 0x20) * 16,
  render8x16,
  16,
);

printGlyphDump(
  '5. 0x003D6E raw-char hypothesis (16x14, stride 28, char*28)',
  (code) => LEGACY_BASE + code * FIXED_STRIDE,
  render16x14,
  28,
);

console.log('6. Alias check: printable base vs legacy raw-char base');
console.log('====================================================\n');
for (const { code, label } of TEST_CHARS) {
  const printableAddr = PRINTABLE_BASE + (code - 0x20) * FIXED_STRIDE;
  const legacyRawAddr = LEGACY_BASE + code * FIXED_STRIDE;
  console.log(
    `${hex(code, 2)} ${label}: printable=${hex(printableAddr)} raw-char=${hex(legacyRawAddr)} ` +
    `${printableAddr === legacyRawAddr ? 'MATCH' : 'DIFF'}`,
  );
}

console.log('\n7. Explicit A comparison');
console.log('========================\n');
const printableA = PRINTABLE_BASE + (0x41 - 0x20) * FIXED_STRIDE;
const legacyPrintableA = LEGACY_BASE + (0x41 - 0x20) * FIXED_STRIDE;
const legacyRawA = LEGACY_BASE + 0x41 * FIXED_STRIDE;

console.log(`0x0040EE + (0x41-0x20)*28 = ${hex(printableA)}  (expected 0x00448A)`);
console.log(`0x003D6E + (0x41-0x20)*28 = ${hex(legacyPrintableA)}  (expected 0x00410A)`);
console.log(`0x003D6E + 0x41*28        = ${hex(legacyRawA)}  (legacy raw-char alias)\n`);

console.log("Printable-base 'A':");
for (const line of render16x14(rom, printableA)) console.log(`  ${line}`);

console.log("\nLegacy printable-hypothesis 'A':");
for (const line of render16x14(rom, legacyPrintableA)) console.log(`  ${line}`);

console.log("\nLegacy raw-char-hypothesis 'A':");
for (const line of render16x14(rom, legacyRawA)) console.log(`  ${line}`);

console.log('\n8. Descriptor / draw state RAM after boot');
console.log('=========================================\n');

console.log('--- D005E0-D005FF ---');
for (let base = 0xD005E0; base < 0xD00600; base += 16) {
  console.log(`  ${hex(base)}: ${dumpBytes(mem, base, 16)}`);
}

const d005e9 = read24(mem, 0xD005E9);
const d005ed = read24(mem, 0xD005ED);
const d005f0 = read24(mem, 0xD005F0);

console.log(`\n  D005E9 descriptor ptr : ${hex(d005e9)}`);
console.log(`  D005EC scale level    : ${hex(mem[0xD005EC], 2)}`);
console.log(`  D005ED font metric    : ${hex(d005ed)}`);
console.log(`  D005F0 scale record   : ${hex(d005f0)}`);

dumpDescriptorRecord('D005E9 record decode', d005e9);
dumpDescriptorRecord('D005F0 record decode', d005f0);

console.log('\n--- D02680-D0268F ---');
console.log(`  ${hex(0xD02680)}: ${dumpBytes(mem, 0xD02680, 16)}`);

console.log('\n--- D02680-D0268F decoded ---');
for (let offset = 0; offset < 16; offset += 2) {
  const addr = 0xD02680 + offset;
  console.log(`  ${hex(addr)} word = ${hex(read16(mem, addr), 4)}`);
}

console.log('\n--- Known draw/text color slots ---');
const colorSlots = [
  [0xD02688, 'drawFgColor'],
  [0xD0268A, 'drawBgColor'],
  [0xD02694, 'textFGColor'],
  [0xD02696, 'textBGColor'],
];
for (const [addr, label] of colorSlots) {
  console.log(`  ${label.padEnd(12)} ${hex(addr)} = ${hex(read16(mem, addr), 4)}`);
}

const aliasMatches = TEST_CHARS.every(({ code }) => {
  const printableAddr = PRINTABLE_BASE + (code - 0x20) * FIXED_STRIDE;
  const legacyRawAddr = LEGACY_BASE + code * FIXED_STRIDE;
  return printableAddr === legacyRawAddr;
});

console.log('\n9. Conclusion');
console.log('=============\n');
console.log(`Alias formula check: ${aliasMatches ? 'PASS' : 'FAIL'}`);
console.log(`0x0040EE printable base = 0x003D6E + 0x20*28: ${PRINTABLE_BASE === LEGACY_BASE + PRINTABLE_SHIFT ? 'PASS' : 'FAIL'}`);
console.log('');
console.log('Verdict:');
console.log('  - 0x0040EE is the authoritative printable-ASCII base for the main fixed-width font.');
console.log('  - 0x003D6E is not a separate printable base; it is the same fixed-width table indexed by raw char code (char*28).');
console.log('  - Therefore: 0x003D6E + char*28 aliases 0x0040EE + (char-0x20)*28 for printable ASCII.');
console.log('  - The earlier printable formula 0x003D6E + (char-0x20)*28 lands 0x380 bytes too early and should render incorrectly.');
console.log('  - If the 8x12 / 8x16 dumps above also look wrong, this probe does not support 0x003D6E being a distinct small/menu font table.');

console.log('\n=== Phase 334 complete ===');
