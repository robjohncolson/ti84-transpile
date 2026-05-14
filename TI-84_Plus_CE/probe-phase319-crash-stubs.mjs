#!/usr/bin/env node
/**
 * Phase 319 — Crash Stub Mapping Probe
 *
 * Maps all mega-table entries that chain to the crash path
 * (0x0003AC → 0x0019B5 DI+HALT). Disassembles the crash handler.
 * Finds all ROM-wide references to 0x0003AC and 0x0019B5.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function readAddr(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function hex(n, w = 6) {
  return '0x' + n.toString(16).padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

let pass = 0;
let fail = 0;

function test(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name}`);
    fail++;
  }
}

// ── Constants ───────────────────────────────────────────────────
const MEGA_TABLE_START = 0x020110;
const MEGA_TABLE_ENTRY_SIZE = 4;
const MEGA_TABLE_ENTRIES = 2175;
const MEGA_TABLE_END = MEGA_TABLE_START + (MEGA_TABLE_ENTRIES - 1) * MEGA_TABLE_ENTRY_SIZE;
const CRASH_RELAY = 0x0003AC;
const CRASH_HANDLER = 0x0019B5;

// ── 1. Verify entries 0-4 crash stubs ───────────────────────────
console.log('\n=== 1. Verify Crash Stubs: Entries 0-4 ===');

const crashEntryDetails = [];

for (let i = 0; i < 5; i++) {
  const tableOff = MEGA_TABLE_START + i * MEGA_TABLE_ENTRY_SIZE;
  test(`Entry ${i} starts with JP (C3)`, rom[tableOff] === 0xC3);
  const stubAddr = readAddr(tableOff + 1);
  console.log(`  Entry ${i}: table ${hex(tableOff)} → JP ${hex(stubAddr)}`);

  test(`Stub at ${hex(stubAddr)} starts with JP (C3)`, rom[stubAddr] === 0xC3);
  const stubTarget = readAddr(stubAddr + 1);
  test(`Stub at ${hex(stubAddr)} → JP ${hex(stubTarget)} = 0x0003AC`, stubTarget === CRASH_RELAY);

  crashEntryDetails.push({ entry: i, tableOff, stubAddr, stubTarget });
}

// ── 2. Verify entry 2022 ────────────────────────────────────────
console.log('\n=== 2. Verify Crash Stub: Entry 2022 ===');
{
  const i = 2022;
  const tableOff = MEGA_TABLE_START + i * MEGA_TABLE_ENTRY_SIZE;
  test(`Entry ${i} starts with JP (C3)`, rom[tableOff] === 0xC3);
  const stubAddr = readAddr(tableOff + 1);
  console.log(`  Entry ${i}: table ${hex(tableOff)} → JP ${hex(stubAddr)}`);

  test(`Stub at ${hex(stubAddr)} starts with JP (C3)`, rom[stubAddr] === 0xC3);
  const stubTarget = readAddr(stubAddr + 1);
  test(`Stub at ${hex(stubAddr)} → JP ${hex(stubTarget)} = 0x0003AC`, stubTarget === CRASH_RELAY);

  crashEntryDetails.push({ entry: i, tableOff, stubAddr, stubTarget });
}

// ── 3. Verify crash relay 0x0003AC → 0x0019B5 ──────────────────
console.log('\n=== 3. Crash Relay Chain ===');

test(`0x0003AC is JP (C3)`, rom[CRASH_RELAY] === 0xC3);
const relayTarget = readAddr(CRASH_RELAY + 1);
test(`0x0003AC → JP ${hex(relayTarget)} = 0x0019B5`, relayTarget === CRASH_HANDLER);

// ── 4. Disassemble 0x0019B5 (20 bytes) ─────────────────────────
console.log('\n=== 4. Disassemble Crash Handler at 0x0019B5 (20 bytes) ===');

const disasmStart = CRASH_HANDLER;
const disasmLen = 20;
const rawBytes = [];
for (let i = 0; i < disasmLen; i++) {
  rawBytes.push(rom[disasmStart + i]);
}

console.log(`  Raw bytes at ${hex(disasmStart)}:`);
for (let i = 0; i < disasmLen; i += 8) {
  const slice = rawBytes.slice(i, i + 8);
  const addr = disasmStart + i;
  console.log(`    ${hex(addr)}: ${slice.map(b => hexByte(b)).join(' ')}`);
}

// Manual disassembly based on eZ80 encoding
// F3         DI
// 3E 10      LD A, 0x10
// ED 39 00   OUT0 (0x00), A
// 00         NOP
// 00         NOP
// 76         HALT
console.log('\n  Disassembly:');
let pc = disasmStart;
const disasmLines = [];

function disasmLine(addr, len, mnemonic) {
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(hexByte(rom[addr + i]));
  const line = `    ${hex(addr)}: ${bytes.join(' ').padEnd(14)} ${mnemonic}`;
  console.log(line);
  disasmLines.push({ addr, len, mnemonic });
  return addr + len;
}

// DI
test(`${hex(pc)}: F3 = DI`, rom[pc] === 0xF3);
pc = disasmLine(pc, 1, 'DI');

// LD A, 0x10
test(`${hex(pc)}: 3E 10 = LD A, 0x10`, rom[pc] === 0x3E && rom[pc + 1] === 0x10);
pc = disasmLine(pc, 2, 'LD A, 0x10');

// OUT0 (0x00), A
test(`${hex(pc)}: ED 39 00 = OUT0 (0x00), A`, rom[pc] === 0xED && rom[pc + 1] === 0x39 && rom[pc + 2] === 0x00);
pc = disasmLine(pc, 3, 'OUT0 (0x00), A');

// Show remaining bytes as raw disassembly
while (pc < disasmStart + disasmLen) {
  if (rom[pc] === 0x00) {
    pc = disasmLine(pc, 1, 'NOP');
  } else if (rom[pc] === 0x76) {
    pc = disasmLine(pc, 1, 'HALT');
  } else if (rom[pc] === 0xF3) {
    pc = disasmLine(pc, 1, 'DI');
  } else if (rom[pc] === 0x3E) {
    pc = disasmLine(pc, 2, `LD A, ${hex(rom[pc + 1], 2)}`);
  } else if (rom[pc] === 0xED && rom[pc + 1] === 0x39) {
    pc = disasmLine(pc, 3, `OUT0 (${hex(rom[pc + 2], 2)}), A`);
  } else if (rom[pc] === 0xC3) {
    const target = readAddr(pc + 1);
    pc = disasmLine(pc, 4, `JP ${hex(target)}`);
  } else {
    pc = disasmLine(pc, 1, `DB ${hexByte(rom[pc])}`);
  }
}

console.log('\n  Port 0x00 analysis:');
console.log('    eZ80 port 0x00 = CPU control register');
console.log('    Writing 0x10 likely sets a reset/halt bit');
console.log('    Combined with DI + HALT = hard system crash (unrecoverable)');

// ── 5. Scan ALL 2175 entries for crash stubs ────────────────────
console.log('\n=== 5. Full Mega-Table Crash Scan ===');

const crashEntries = [];
const crashStubAddrs = new Set();
let allJP = 0;

for (let i = 0; i < MEGA_TABLE_ENTRIES; i++) {
  const tableOff = MEGA_TABLE_START + i * MEGA_TABLE_ENTRY_SIZE;

  if (rom[tableOff] !== 0xC3) continue;
  allJP++;

  const target = readAddr(tableOff + 1);

  // Direct jump to crash relay
  if (target === CRASH_RELAY) {
    crashEntries.push({ entry: i, tableOff, stubAddr: null, via: 'direct' });
    continue;
  }

  // One-hop: target is a JP that goes to 0x0003AC
  if (target < rom.length - 3 && rom[target] === 0xC3) {
    const hopTarget = readAddr(target + 1);
    if (hopTarget === CRASH_RELAY) {
      crashEntries.push({ entry: i, tableOff, stubAddr: target, via: 'one-hop' });
      crashStubAddrs.add(target);
    }
  }
}

test(`All ${MEGA_TABLE_ENTRIES} entries are JP (C3)`, allJP === MEGA_TABLE_ENTRIES);
console.log(`  Total crash entries found: ${crashEntries.length}`);

for (const ce of crashEntries) {
  const via = ce.via === 'direct'
    ? `→ JP ${hex(CRASH_RELAY)} (direct)`
    : `→ JP ${hex(ce.stubAddr)} → JP ${hex(CRASH_RELAY)} (one-hop)`;
  console.log(`    Entry ${ce.entry} at ${hex(ce.tableOff)} ${via}`);
}

test('Crash entry count = 6 (entries 0-4 + 2022)', crashEntries.length === 6);

const expectedCrashEntries = [0, 1, 2, 3, 4, 2022];
const foundCrashIndices = crashEntries.map(e => e.entry).sort((a, b) => a - b);
test(
  `Crash entries are exactly [${expectedCrashEntries.join(', ')}]`,
  JSON.stringify(foundCrashIndices) === JSON.stringify(expectedCrashEntries)
);

console.log(`\n  Unique crash stub addresses: ${crashStubAddrs.size}`);
for (const addr of [...crashStubAddrs].sort((a, b) => a - b)) {
  console.log(`    ${hex(addr)}`);
}

// ── 6. ROM-wide references to 0x0003AC and 0x0019B5 ────────────
console.log('\n=== 6. ROM-Wide References to Crash Addresses ===');

// Search for JP/CALL 0x0003AC (C3 AC 03 00 or CD AC 03 00)
// Search for JP/CALL 0x0019B5 (C3 B5 19 00 or CD B5 19 00)
const refs0003AC = [];
const refs0019B5 = [];

for (let i = 0; i < rom.length - 3; i++) {
  if ((rom[i] === 0xC3 || rom[i] === 0xCD) &&
      rom[i + 1] === 0xAC && rom[i + 2] === 0x03 && rom[i + 3] === 0x00) {
    const instr = rom[i] === 0xC3 ? 'JP' : 'CALL';
    const inMegaTable = (i >= MEGA_TABLE_START && i <= MEGA_TABLE_END + 3);
    refs0003AC.push({ addr: i, instr, inMegaTable });
  }
  if ((rom[i] === 0xC3 || rom[i] === 0xCD) &&
      rom[i + 1] === 0xB5 && rom[i + 2] === 0x19 && rom[i + 3] === 0x00) {
    const instr = rom[i] === 0xC3 ? 'JP' : 'CALL';
    refs0019B5.push({ addr: i, instr });
  }
}

console.log(`\n  References to 0x0003AC (crash relay):`);
console.log(`    Total: ${refs0003AC.length}`);
let outsideMegaTable0003AC = 0;
for (const ref of refs0003AC) {
  const loc = ref.inMegaTable ? '(in mega-table)' : '(ROM code)';
  console.log(`    ${hex(ref.addr)}: ${ref.instr} 0x0003AC ${loc}`);
  if (!ref.inMegaTable) outsideMegaTable0003AC++;
}

console.log(`\n  References to 0x0019B5 (crash handler):`);
console.log(`    Total: ${refs0019B5.length}`);
for (const ref of refs0019B5) {
  console.log(`    ${hex(ref.addr)}: ${ref.instr} 0x0019B5`);
}

// The crash stubs JP to 0x0003AC but they are NOT in the mega-table,
// they're in the code region. Count stubs + mega-table references.
const stubRefs = refs0003AC.filter(r => !r.inMegaTable);
console.log(`\n  References to 0x0003AC outside mega-table: ${stubRefs.length}`);
console.log(`  References to 0x0019B5: ${refs0019B5.length}`);

// At minimum: crash stubs (6 unique addrs mapped above) + 0x0003AC itself
test('At least 1 JP to 0x0019B5 (at 0x0003AC)', refs0019B5.length >= 1);

// ── 7. Entry 2022 neighbors (2020-2024) ─────────────────────────
console.log('\n=== 7. Entry 2022 Neighborhood (2020-2024) ===');

for (let i = 2020; i <= 2024; i++) {
  const tableOff = MEGA_TABLE_START + i * MEGA_TABLE_ENTRY_SIZE;
  if (tableOff > MEGA_TABLE_END + 3) {
    console.log(`  Entry ${i}: beyond table end`);
    continue;
  }

  const target = readAddr(tableOff + 1);
  const isCrash = crashEntries.some(e => e.entry === i);
  const label = isCrash ? ' *** CRASH ***' : '';

  // Follow one hop to show what the target does
  let hopInfo = '';
  if (target < rom.length - 3 && rom[target] === 0xC3) {
    const hop = readAddr(target + 1);
    hopInfo = ` → JP ${hex(hop)}`;
  }

  console.log(`  Entry ${i} at ${hex(tableOff)}: JP ${hex(target)}${hopInfo}${label}`);
}

test('Entry 2022 is a crash entry', crashEntries.some(e => e.entry === 2022));
test('Entry 2021 is NOT a crash entry', !crashEntries.some(e => e.entry === 2021));
test('Entry 2023 is NOT a crash entry', !crashEntries.some(e => e.entry === 2023));

// ── 8. Crash stub region layout ─────────────────────────────────
console.log('\n=== 8. Crash Stub Region Layout ===');

const sortedStubs = [...crashStubAddrs].sort((a, b) => a - b);
if (sortedStubs.length > 0) {
  const regionStart = sortedStubs[0];
  const regionEnd = sortedStubs[sortedStubs.length - 1] + 3; // JP is 4 bytes
  console.log(`  Region: ${hex(regionStart)} - ${hex(regionEnd)} (${regionEnd - regionStart + 1} bytes)`);
  console.log(`  Stubs:`);
  for (const addr of sortedStubs) {
    const target = readAddr(addr + 1);
    // Which entries point here?
    const pointingEntries = crashEntries.filter(e => e.stubAddr === addr).map(e => e.entry);
    console.log(`    ${hex(addr)}: JP ${hex(target)}  ← entry ${pointingEntries.join(', ')}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
if (fail === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.log('SOME TESTS FAILED');
}
process.exit(fail > 0 ? 1 : 0);
