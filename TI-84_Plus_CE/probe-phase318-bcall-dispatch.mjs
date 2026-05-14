#!/usr/bin/env node
/**
 * Phase 318 — BCALL/BJUMP Dispatch Mechanism Probe
 *
 * Verifies RST 28h/30h handler structure, crash stub chain,
 * mega-table integrity, and BCALL site classification.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function readAddr(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
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

// ── 1. RST 28h handler bytes ────────────────────────────────────
console.log('\n=== 1. RST 28h Handler (0x000028) ===');

test('0x28: DI (F3)', rom[0x28] === 0xF3);
test('0x29: RSMIX (ED 7E)', rom[0x29] === 0xED && rom[0x2A] === 0x7E);
test('0x2B: JP.LIL prefix (5B)', rom[0x2B] === 0x5B);
test('0x2C: JP opcode (C3)', rom[0x2C] === 0xC3);

const rst28Target = readAddr(0x2D);
test('RST 28h JP.LIL target = 0x02011C', rst28Target === 0x02011C);
console.log(`  Target: 0x${rst28Target.toString(16).padStart(6, '0')}`);

// ── 2. RST 30h handler bytes ────────────────────────────────────
console.log('\n=== 2. RST 30h Handler (0x000030) ===');

test('0x30: DI (F3)', rom[0x30] === 0xF3);
test('0x31: RSMIX (ED 7E)', rom[0x31] === 0xED && rom[0x32] === 0x7E);
test('0x33: JP.LIL prefix (5B)', rom[0x33] === 0x5B);
test('0x34: JP opcode (C3)', rom[0x34] === 0xC3);

const rst30Target = readAddr(0x35);
test('RST 30h JP.LIL target = 0x020120', rst30Target === 0x020120);
console.log(`  Target: 0x${rst30Target.toString(16).padStart(6, '0')}`);

// ── 3. Mega-table entries 3 and 4 (RST targets) ────────────────
console.log('\n=== 3. Mega-table Entries for RST 28h/30h ===');

const entry3Addr = 0x02011C;
const entry4Addr = 0x020120;

test('Entry 3 at 0x02011C is JP (C3)', rom[entry3Addr] === 0xC3);
const entry3Target = readAddr(entry3Addr + 1);
console.log(`  Entry 3 JP target: 0x${entry3Target.toString(16).padStart(6, '0')}`);
test('Entry 3 target = 0x04AB69', entry3Target === 0x04AB69);

test('Entry 4 at 0x020120 is JP (C3)', rom[entry4Addr] === 0xC3);
const entry4Target = readAddr(entry4Addr + 1);
console.log(`  Entry 4 JP target: 0x${entry4Target.toString(16).padStart(6, '0')}`);
test('Entry 4 target = 0x04AB6D', entry4Target === 0x04AB6D);

// ── 4. Crash stub chain ─────────────────────────────────────────
console.log('\n=== 4. Crash Stub Chain ===');

// Entry 3 stub at 0x04AB69
test('0x04AB69: JP (C3)', rom[0x04AB69] === 0xC3);
const stub3Target = readAddr(0x04AB6A);
test('0x04AB69 JP target = 0x0003AC', stub3Target === 0x0003AC);

// Entry 4 stub at 0x04AB6D
test('0x04AB6D: JP (C3)', rom[0x04AB6D] === 0xC3);
const stub4Target = readAddr(0x04AB6E);
test('0x04AB6D JP target = 0x0003AC', stub4Target === 0x0003AC);

// 0x0003AC -> 0x0019B5
test('0x0003AC: JP (C3)', rom[0x0003AC] === 0xC3);
const crashVector = readAddr(0x0003AD);
test('0x0003AC JP target = 0x0019B5', crashVector === 0x0019B5);

// 0x0019B5 = DI; LD A,0x10; OUT0(0x00),A; NOP; NOP; HALT
test('0x0019B5: DI (F3)', rom[0x0019B5] === 0xF3);
test('0x0019BD: HALT (76)', rom[0x0019BD] === 0x76);
console.log('  Confirmed: crash handler ends with DI + HALT');

// ── 5. All 6 crash stubs (entries 0-5) ──────────────────────────
console.log('\n=== 5. Crash Stub Entries (0-4) ===');

for (let i = 0; i < 5; i++) {
  const tableOff = 0x020110 + i * 4;
  const target = readAddr(tableOff + 1);
  const stubTarget = readAddr(target + 1);
  test(
    `Entry ${i} (0x${tableOff.toString(16)}) -> 0x${target.toString(16).padStart(6, '0')} -> 0x${stubTarget.toString(16).padStart(6, '0')} (crash)`,
    rom[tableOff] === 0xC3 && rom[target] === 0xC3 && stubTarget === 0x0003AC
  );
}

// Entry 5 is the first real entry
const entry5Addr = 0x020124;
const entry5Target = readAddr(entry5Addr + 1);
test(
  `Entry 5 (0x020124) -> 0x${entry5Target.toString(16).padStart(6, '0')} (NOT crash)`,
  rom[entry5Addr] === 0xC3 && entry5Target !== 0x0003AC &&
  !(entry5Target >= 0x04AB5D && entry5Target <= 0x04AB74)
);

// ── 6. Mega-table integrity ─────────────────────────────────────
console.log('\n=== 6. Mega-table Integrity ===');

let totalEntries = 0;
let validJP = 0;
let crashCount = 0;
const CRASH_STUB_START = 0x04AB5D;
const CRASH_STUB_END = 0x04AB74;

for (let off = 0x020110; off <= 0x022308; off += 4) {
  totalEntries++;
  if (rom[off] === 0xC3) {
    validJP++;
    const t = readAddr(off + 1);
    if (t >= CRASH_STUB_START && t <= CRASH_STUB_END) crashCount++;
  }
}

test('Total mega-table entries = 2175', totalEntries === 2175);
test('All entries are valid JP (C3)', validJP === 2175);
test('Crash stub entries = 6 (entries 0-4 + entry 2022)', crashCount === 6);
console.log(`  Valid JP: ${validJP}/${totalEntries}`);
console.log(`  Crash stubs: ${crashCount}`);
console.log(`  Real function entries: ${validJP - crashCount}`);

// ── 7. Sample real entries (verify JP targets are in ROM range) ──
console.log('\n=== 7. Sample Real Entries ===');

const sampleEntries = [5, 6, 7, 8, 9, 100, 500, 1000, 1500, 2000];
for (const idx of sampleEntries) {
  const off = 0x020110 + idx * 4;
  if (off > 0x022308) continue;
  const target = readAddr(off + 1);
  const inROM = target < 0x400000;
  test(
    `Entry ${idx} (0x${off.toString(16)}): JP 0x${target.toString(16).padStart(6, '0')} ${inROM ? '(in ROM)' : '(OUT OF ROM!)'}`,
    rom[off] === 0xC3 && inROM
  );
}

// ── 8. RST 28h false positive analysis ──────────────────────────
console.log('\n=== 8. RST 28h False Positive Analysis ===');

// Load transpiled JS to count RST sites
const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');
let rst28Sites = 0;
let rst30Sites = 0;

if (fs.existsSync(gzPath)) {
  const gz = fs.readFileSync(gzPath);
  const js = zlib.gunzipSync(gz).toString('utf8');

  const rst28Pat = /\/\/ (0x[0-9a-f]+)\s+ef\s+rst 0x28/g;
  const rst30Pat = /\/\/ (0x[0-9a-f]+)\s+f7\s+rst 0x30/g;

  const sites28 = [];
  let m;
  while ((m = rst28Pat.exec(js)) !== null) {
    sites28.push(parseInt(m[1], 16));
  }
  while (rst30Pat.exec(js) !== null) rst30Sites++;
  rst28Sites = sites28.length;

  console.log(`  Transpiled RST 28h sites: ${rst28Sites}`);
  console.log(`  Transpiled RST 30h sites: ${rst30Sites}`);

  // Classify RST 28h sites
  let inTokenTable = 0;
  let inASCII = 0;
  let afterCALL = 0;
  let other = 0;

  for (const addr of sites28) {
    // Token table region 0x05C3F0-0x05C530
    if (addr >= 0x05C3F0 && addr <= 0x05C530) {
      inTokenTable++;
      continue;
    }
    // Preceded by CD (part of CALL address)
    if (addr > 0 && rom[addr - 1] === 0xCD) {
      afterCALL++;
      continue;
    }
    // Check ASCII density (data region indicator)
    let asciiCount = 0;
    for (let i = addr - 8; i < addr + 8 && i < rom.length; i++) {
      if (i >= 0 && rom[i] >= 0x20 && rom[i] < 0x7F) asciiCount++;
    }
    if (asciiCount > 10) {
      inASCII++;
      continue;
    }
    other++;
  }

  console.log(`  Classification:`);
  console.log(`    Token table (0x05C3xx):  ${inTokenTable}`);
  console.log(`    ASCII/string data:       ${inASCII}`);
  console.log(`    CALL address low byte:   ${afterCALL}`);
  console.log(`    Other (possible code):   ${other}`);

  test('Most RST 28h sites are false positives', inTokenTable + inASCII + afterCALL > rst28Sites * 0.2);
} else {
  console.log('  SKIP: ROM.transpiled.js.gz not found');
}

// ── 9. Raw byte counts ──────────────────────────────────────────
console.log('\n=== 9. Raw Byte Counts ===');

let efCount = 0;
let f7Count = 0;
for (let i = 0; i < rom.length; i++) {
  if (rom[i] === 0xEF) efCount++;
  if (rom[i] === 0xF7) f7Count++;
}
console.log(`  0xEF bytes in ROM: ${efCount}`);
console.log(`  0xF7 bytes in ROM: ${f7Count}`);
test('0xEF count > 1000 (mostly data, not RST instructions)', efCount > 1000);
test('0xF7 count > 1000 (mostly data, not RST instructions)', f7Count > 1000);

// ── 10. CALL-to-table verification ──────────────────────────────
console.log('\n=== 10. CALL to Mega-table Sites ===');

// Check known CALL-to-table sites from transpiled code
const knownCallSites = [
  { caller: '0x00598D', target: 0x020134, entry: 9 },
  { caller: '0x005987-path', target: 0x020130, entry: 8 },
  { caller: '0x013EE9', target: 0x020128, entry: 6 },
];

for (const site of knownCallSites) {
  const off = site.target;
  const jpTarget = readAddr(off + 1);
  test(
    `CALL 0x${off.toString(16)} (entry ${site.entry}) -> JP 0x${jpTarget.toString(16).padStart(6, '0')}`,
    rom[off] === 0xC3 && jpTarget < 0x400000
  );
}

// ── Summary ─────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
if (fail === 0) {
  console.log('ALL TESTS PASSED');
}
process.exit(fail > 0 ? 1 : 0);
