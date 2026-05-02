#!/usr/bin/env node

/**
 * Phase 172 - CPU Method Audit Against eZ80 Specification
 *
 * Tests every FP-critical cpu-runtime.js method against known eZ80 reference
 * values. For each method, constructs test cases with known inputs and expected
 * outputs per the eZ80 CPU User Manual, then calls the method and compares.
 *
 * Key insight: the gcd(12,8) bug produces E_Domain instead of 4. Session 171
 * proved 1421/1423 transpiled blocks match a mini reference interpreter — but
 * both use the SAME cpu-runtime.js methods. So if a method is buggy, both
 * sides agree on the wrong answer. The bug is almost certainly here.
 */

import { CPU } from './cpu-runtime.js';

// Flag constants (must match cpu-runtime.js)
const FLAG_C  = 0x01;
const FLAG_N  = 0x02;
const FLAG_PV = 0x04;
const FLAG_X  = 0x08;
const FLAG_H  = 0x10;
const FLAG_Y  = 0x20;
const FLAG_Z  = 0x40;
const FLAG_S  = 0x80;

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
const failures = [];
const methodResults = new Map(); // method -> { pass, fail }

function recordResult(method, passed, detail) {
  totalTests++;
  if (!methodResults.has(method)) methodResults.set(method, { pass: 0, fail: 0 });
  if (passed) {
    totalPass++;
    methodResults.get(method).pass++;
  } else {
    totalFail++;
    methodResults.get(method).fail++;
    failures.push({ method, detail });
  }
}

function check(method, label, actual, expected) {
  const passed = actual === expected;
  const detail = passed
    ? `${label}: OK`
    : `${label}: expected ${fmt(expected)}, got ${fmt(actual)}`;
  if (!passed) console.log(`    FAIL: ${detail}`);
  recordResult(method, passed, detail);
  return passed;
}

function checkFlags(method, label, cpu, expectedFlags) {
  // expectedFlags: { S?, Z?, H?, PV?, N?, C? } — only check specified flags
  let allOk = true;
  for (const [name, expected] of Object.entries(expectedFlags)) {
    const flagBit = { S: FLAG_S, Z: FLAG_Z, H: FLAG_H, PV: FLAG_PV, N: FLAG_N, C: FLAG_C }[name];
    const actual = (cpu.f & flagBit) !== 0;
    const passed = actual === expected;
    if (!passed) {
      const detail = `${label} flag ${name}: expected ${expected}, got ${actual} (F=0x${cpu.f.toString(16).padStart(2,'0')})`;
      console.log(`    FAIL: ${detail}`);
      allOk = false;
      recordResult(method, false, detail);
    } else {
      recordResult(method, true, `${label} flag ${name}: OK`);
    }
  }
  return allOk;
}

function fmt(v) {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return `0x${(v >>> 0).toString(16).padStart(2, '0')} (${v})`;
  return String(v);
}

function freshCPU() {
  const mem = new Uint8Array(0x1000000);
  return new CPU(mem);
}

// ---------------------------------------------------------------------------
// Test: parity()
// ---------------------------------------------------------------------------

function testParity() {
  console.log('\n--- parity(value) ---');
  // parity is not exported directly, but we can test it through methods that use it.
  // Actually, let's test it indirectly via updateOrXorFlags which sets PV=parity.
  const cpu = freshCPU();

  // XOR A,A (result=0x00) -> parity of 0 bits set = even parity -> PV=1
  cpu.updateOrXorFlags(0x00);
  check('parity', '0x00 even parity', (cpu.f & FLAG_PV) !== 0, true);

  // result=0x01 -> 1 bit -> odd parity -> PV=0
  cpu.updateOrXorFlags(0x01);
  check('parity', '0x01 odd parity', (cpu.f & FLAG_PV) !== 0, false);

  // result=0x03 -> 2 bits -> even parity -> PV=1
  cpu.updateOrXorFlags(0x03);
  check('parity', '0x03 even parity', (cpu.f & FLAG_PV) !== 0, true);

  // result=0x07 -> 3 bits -> odd -> PV=0
  cpu.updateOrXorFlags(0x07);
  check('parity', '0x07 odd parity', (cpu.f & FLAG_PV) !== 0, false);

  // result=0xFF -> 8 bits -> even -> PV=1
  cpu.updateOrXorFlags(0xFF);
  check('parity', '0xFF even parity', (cpu.f & FLAG_PV) !== 0, true);

  // result=0x80 -> 1 bit -> odd -> PV=0
  cpu.updateOrXorFlags(0x80);
  check('parity', '0x80 odd parity', (cpu.f & FLAG_PV) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: _szFlags(result)
// ---------------------------------------------------------------------------

function testSzFlags() {
  console.log('\n--- _szFlags(result) ---');
  const cpu = freshCPU();

  // result=0x00: S=0, Z=1
  cpu.f = 0;
  cpu._szFlags(0x00);
  check('_szFlags', '0x00 S', (cpu.f & FLAG_S) !== 0, false);
  check('_szFlags', '0x00 Z', (cpu.f & FLAG_Z) !== 0, true);

  // result=0x80: S=1, Z=0
  cpu.f = 0;
  cpu._szFlags(0x80);
  check('_szFlags', '0x80 S', (cpu.f & FLAG_S) !== 0, true);
  check('_szFlags', '0x80 Z', (cpu.f & FLAG_Z) !== 0, false);

  // result=0x2A: S=0, Z=0, X=1 (bit3=1), Y=1 (bit5=1)
  cpu.f = 0;
  cpu._szFlags(0x2A); // 0010_1010: bit3=1, bit5=1
  check('_szFlags', '0x2A S', (cpu.f & FLAG_S) !== 0, false);
  check('_szFlags', '0x2A Z', (cpu.f & FLAG_Z) !== 0, false);
  check('_szFlags', '0x2A X(bit3)', (cpu.f & FLAG_X) !== 0, true);
  check('_szFlags', '0x2A Y(bit5)', (cpu.f & FLAG_Y) !== 0, true);

  // result=0x44: X=0 (bit3=0), Y=0 (bit5=0)
  cpu.f = 0xFF;
  cpu._szFlags(0x44); // 0100_0100: bit3=0, bit5=0
  check('_szFlags', '0x44 X(bit3)', (cpu.f & FLAG_X) !== 0, false);
  check('_szFlags', '0x44 Y(bit5)', (cpu.f & FLAG_Y) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: add8(a, b)
// ---------------------------------------------------------------------------

function testAdd8() {
  console.log('\n--- add8(a, b) ---');
  const cpu = freshCPU();

  // 0x44 + 0x11 = 0x55, no flags
  cpu.f = 0;
  let r = cpu.add8(0x44, 0x11);
  check('add8', '0x44+0x11 result', r, 0x55);
  checkFlags('add8', '0x44+0x11', cpu, { S: false, Z: false, H: false, PV: false, N: false, C: false });

  // 0x80 + 0x80 = 0x100 -> 0x00, overflow, carry
  cpu.f = 0;
  r = cpu.add8(0x80, 0x80);
  check('add8', '0x80+0x80 result', r, 0x00);
  checkFlags('add8', '0x80+0x80', cpu, { S: false, Z: true, H: false, PV: true, N: false, C: true });

  // 0x0F + 0x01 = 0x10, half-carry
  cpu.f = 0;
  r = cpu.add8(0x0F, 0x01);
  check('add8', '0x0F+0x01 result', r, 0x10);
  checkFlags('add8', '0x0F+0x01', cpu, { S: false, Z: false, H: true, PV: false, N: false, C: false });

  // 0x7F + 0x01 = 0x80, overflow (pos + pos = neg)
  cpu.f = 0;
  r = cpu.add8(0x7F, 0x01);
  check('add8', '0x7F+0x01 result', r, 0x80);
  checkFlags('add8', '0x7F+0x01', cpu, { S: true, Z: false, H: true, PV: true, N: false, C: false });

  // 0xFF + 0x01 = 0x00, carry + half-carry + zero
  cpu.f = 0;
  r = cpu.add8(0xFF, 0x01);
  check('add8', '0xFF+0x01 result', r, 0x00);
  checkFlags('add8', '0xFF+0x01', cpu, { Z: true, H: true, N: false, C: true });
}

// ---------------------------------------------------------------------------
// Test: subtract8(a, b)
// ---------------------------------------------------------------------------

function testSubtract8() {
  console.log('\n--- subtract8(a, b) ---');
  const cpu = freshCPU();

  // 0x44 - 0x11 = 0x33
  cpu.f = 0;
  let r = cpu.subtract8(0x44, 0x11);
  check('subtract8', '0x44-0x11 result', r, 0x33);
  checkFlags('subtract8', '0x44-0x11', cpu, { S: false, Z: false, H: false, PV: false, N: true, C: false });

  // 0x00 - 0x01 = 0xFF, carry (borrow)
  cpu.f = 0;
  r = cpu.subtract8(0x00, 0x01);
  check('subtract8', '0x00-0x01 result', r, 0xFF);
  checkFlags('subtract8', '0x00-0x01', cpu, { S: true, Z: false, H: true, N: true, C: true });

  // 0x80 - 0x01 = 0x7F, overflow (neg - pos = pos)
  cpu.f = 0;
  r = cpu.subtract8(0x80, 0x01);
  check('subtract8', '0x80-0x01 result', r, 0x7F);
  checkFlags('subtract8', '0x80-0x01', cpu, { S: false, Z: false, H: true, PV: true, N: true, C: false });

  // 0x50 - 0x50 = 0x00, zero
  cpu.f = 0;
  r = cpu.subtract8(0x50, 0x50);
  check('subtract8', '0x50-0x50 result', r, 0x00);
  checkFlags('subtract8', '0x50-0x50', cpu, { S: false, Z: true, H: false, PV: false, N: true, C: false });
}

// ---------------------------------------------------------------------------
// Test: decimalAdjustAccumulator(a) — DAA
// ---------------------------------------------------------------------------

function testDAA() {
  console.log('\n--- decimalAdjustAccumulator(a) — DAA ---');
  const cpu = freshCPU();

  // After ADD: A=0x9A, no C, no H -> correction=0x60 (high nibble>9) + 0x06 (low nibble>9) = 0x66
  // 0x9A + 0x66 = 0x100 -> 0x00, C set
  cpu.f = 0; // N=0 (after add), H=0, C=0
  let r = cpu.decimalAdjustAccumulator(0x9A);
  check('DAA', 'after ADD A=0x9A result', r, 0x00);
  check('DAA', 'after ADD A=0x9A C', (cpu.f & FLAG_C) !== 0, true);
  check('DAA', 'after ADD A=0x9A Z', (cpu.f & FLAG_Z) !== 0, true);

  // After ADD: A=0x0A, no C, no H -> low nibble>9: correction=0x06
  // 0x0A + 0x06 = 0x10
  cpu.f = 0; // N=0
  r = cpu.decimalAdjustAccumulator(0x0A);
  check('DAA', 'after ADD A=0x0A result', r, 0x10);
  check('DAA', 'after ADD A=0x0A C', (cpu.f & FLAG_C) !== 0, false);

  // After SUB: A=0xFA, H=1, N=1 -> subtract correction
  // H set -> correction |= 0x06. Result > 0x99? 0xFA > 0x99 yes but N=1, so only H matters for low nibble
  // Actually with N=1: correction from H=1 is 0x06, correction from C is based on C flag
  // 0xFA - 0x06 = 0xF4
  cpu.f = FLAG_N | FLAG_H; // after subtract, H set
  r = cpu.decimalAdjustAccumulator(0xFA);
  check('DAA', 'after SUB A=0xFA H=1 result', r, 0xF4);

  // After ADD: BCD 15 + 27 = 42
  // First add low digits: 0x15 + 0x27 = 0x3C. DAA: low nibble C > 9 -> +6 = 0x42
  cpu.f = 0; // N=0, after add
  r = cpu.decimalAdjustAccumulator(0x3C);
  check('DAA', 'BCD 15+27 (0x3C) result', r, 0x42);
  check('DAA', 'BCD 15+27 C', (cpu.f & FLAG_C) !== 0, false);

  // After ADD: BCD 99 + 1 = 100 -> 0x00 with C
  // 0x99 + 0x01 = 0x9A. DAA: low nibble A > 9 -> +0x06 = 0xA0, high nibble A > 9 -> +0x60 = 0x100 -> 0x00, C
  cpu.f = 0;
  r = cpu.decimalAdjustAccumulator(0x9A);
  check('DAA', 'BCD 99+01 (0x9A) result', r, 0x00);
  check('DAA', 'BCD 99+01 C', (cpu.f & FLAG_C) !== 0, true);

  // After ADD: half-carry set. A=0x11, H=1 -> correction |= 0x06
  // 0x11 + 0x06 = 0x17
  cpu.f = FLAG_H; // N=0, H=1
  r = cpu.decimalAdjustAccumulator(0x11);
  check('DAA', 'after ADD A=0x11 H=1 result', r, 0x17);

  // DAA H flag: should be set from XOR of old A and new result at bit 4
  // After ADD: A=0x0F, DAA -> 0x0F+0x06=0x15. H = (0x0F ^ 0x15) & 0x10 = 0x1A & 0x10 = 0x10 -> H=1
  cpu.f = 0; // N=0
  r = cpu.decimalAdjustAccumulator(0x0F);
  check('DAA', 'A=0x0F H flag', (cpu.f & FLAG_H) !== 0, true);

  // DAA PV flag: should be parity of result
  // 0x0A -> DAA -> 0x10. Parity of 0x10: 1 bit -> odd -> PV=0
  cpu.f = 0;
  r = cpu.decimalAdjustAccumulator(0x0A);
  check('DAA', 'A=0x0A PV=parity(0x10)', (cpu.f & FLAG_PV) !== 0, false);

  // GCD path realistic: after ADD that produces half-carry
  // e.g. BCD digits where low nibble overflows
  // 0x08 + 0x09 = 0x11 with H=1. DAA with H=1: 0x11 + 0x06 = 0x17
  cpu.f = FLAG_H; // simulate after add with H
  r = cpu.decimalAdjustAccumulator(0x11);
  check('DAA', 'gcd-path A=0x11 H=1 result', r, 0x17);

  // After SUB with C set: A=0x00, C=1, N=1
  // correction from C: 0x60. 0x00 - 0x60 = 0xA0 (unsigned)
  cpu.f = FLAG_N | FLAG_C;
  r = cpu.decimalAdjustAccumulator(0x00);
  check('DAA', 'after SUB A=0x00 C=1 result', r, 0xA0);
  // C should remain set when it was already set
  check('DAA', 'after SUB A=0x00 C=1 C preserved', (cpu.f & FLAG_C) !== 0, true);
}

// ---------------------------------------------------------------------------
// Test: addWord(a, b) — ADD HL,rr
// ---------------------------------------------------------------------------

function testAddWord() {
  console.log('\n--- addWord(a, b) — ADD HL,rr ---');
  const cpu = freshCPU();

  // 16-bit mode test: 0x4000 + 0x1000 = 0x5000
  cpu.madl = 0;
  cpu.f = 0;
  let r = cpu.addWord(0x4000, 0x1000);
  check('addWord', 'z80 0x4000+0x1000 result', r, 0x5000);
  checkFlags('addWord', 'z80 0x4000+0x1000', cpu, { H: false, N: false, C: false });

  // 16-bit mode: 0x8000 + 0x8000 = 0x10000 -> carry
  cpu.madl = 0;
  cpu.f = 0;
  r = cpu.addWord(0x8000, 0x8000);
  check('addWord', 'z80 0x8000+0x8000 result', r, 0x0000);
  checkFlags('addWord', 'z80 0x8000+0x8000', cpu, { N: false, C: true });

  // 16-bit: half-carry from bit 11 -> bit 12
  // 0x0FFF + 0x0001 = 0x1000, H should be set
  cpu.madl = 0;
  cpu.f = 0;
  r = cpu.addWord(0x0FFF, 0x0001);
  check('addWord', 'z80 0x0FFF+0x0001 result', r, 0x1000);
  checkFlags('addWord', 'z80 0x0FFF+0x0001', cpu, { H: true, N: false, C: false });

  // ADL mode: 24-bit. 0x100000 + 0x100000 = 0x200000
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWord(0x100000, 0x100000);
  check('addWord', 'adl 0x100000+0x100000 result', r, 0x200000);
  checkFlags('addWord', 'adl 0x100000+0x100000', cpu, { N: false, C: false });

  // ADL mode carry: 0x800000 + 0x800000 = 0x1000000 -> carry, result masked to 0x000000
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWord(0x800000, 0x800000);
  check('addWord', 'adl 0x800000+0x800000 result', r, 0x000000);
  checkFlags('addWord', 'adl 0x800000+0x800000', cpu, { N: false, C: true });

  // ADL mode H flag: eZ80 spec says H is from bit 11 carry even in ADL mode
  // (The task spec suggested bit 19/20 but the Zilog eZ80 manual says bit 11 for ADD)
  // Test: 0x000FFF + 0x000001 = 0x001000, H=1
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWord(0x000FFF, 0x000001);
  check('addWord', 'adl 0x000FFF+0x000001 H from bit12', (cpu.f & FLAG_H) !== 0, true);

  // CRITICAL CHECK: In ADL mode, does H come from bit 12 or bit 20?
  // eZ80 CPU manual UM0077 says ADD HL,rr in ADL mode: H is set if carry from bit 11
  // (same as Z80, regardless of register width). Let's verify the implementation checks 0x1000.
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWord(0x0FFFFF, 0x000001);
  // bit 20 carry: 0x0FFFFF + 1 = 0x100000. This has carry from bit 19->20.
  // bit 12 carry: low 12 bits are 0xFFF + 0x001 = 0x1000, so H=1 from bit 12.
  check('addWord', 'adl 0x0FFFFF+0x000001 H-from-bit12', (cpu.f & FLAG_H) !== 0, true);

  // No bit 12 carry but bit 20 carry:
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWord(0x0F0000, 0x010000);
  // 0x0F0000 + 0x010000 = 0x100000. Low 12 bits: 0x000 + 0x000 = no bit12 carry.
  check('addWord', 'adl 0x0F0000+0x010000 H-from-bit12 (no carry)', (cpu.f & FLAG_H) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: addWithCarryWord(a, b) — ADC HL,rr
// ---------------------------------------------------------------------------

function testAddWithCarryWord() {
  console.log('\n--- addWithCarryWord(a, b) — ADC HL,rr ---');
  const cpu = freshCPU();

  // CRITICAL: ADL mode flag computation
  // Current code computes S, Z, PV, C from r16 = result & 0xffff
  // In ADL mode, these should be computed from the full 24-bit result.

  // Z80 mode: 0x1000 + 0x2000 + C=0 = 0x3000
  cpu.madl = 0;
  cpu.f = 0;
  let r = cpu.addWithCarryWord(0x1000, 0x2000);
  check('addWithCarryWord', 'z80 0x1000+0x2000 result', r, 0x3000);
  checkFlags('addWithCarryWord', 'z80 0x1000+0x2000', cpu, { S: false, Z: false, PV: false, N: false, C: false });

  // Z80 mode: 0x7FFF + 0x0001 = 0x8000. Overflow (pos + pos = neg in 16-bit signed)
  cpu.madl = 0;
  cpu.f = 0;
  r = cpu.addWithCarryWord(0x7FFF, 0x0001);
  check('addWithCarryWord', 'z80 0x7FFF+0x0001 result', r, 0x8000);
  checkFlags('addWithCarryWord', 'z80 0x7FFF+0x0001', cpu, { S: true, Z: false, PV: true, N: false, C: false });

  // ADL MODE BUG CHECK: 0x010000 + 0x000001 = 0x010001
  // r16 = 0x0001. S from r16 = 0 (correct for 24-bit too).
  // But: 0x010000 + 0x000000 would give r16=0x0000, Z would be TRUE from r16
  // even though 24-bit result is 0x010000 (not zero!)
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWithCarryWord(0x010000, 0x000000);
  check('addWithCarryWord', 'ADL 0x010000+0x000000 result', r, 0x010000);
  // Z should be FALSE because 0x010000 != 0, but implementation checks r16=0
  const zFlag = (cpu.f & FLAG_Z) !== 0;
  const zExpectedCorrect = false; // 24-bit result is not zero
  const zExpectedBuggy = true;    // 16-bit r16 is zero
  if (zFlag === zExpectedBuggy && zFlag !== zExpectedCorrect) {
    console.log(`    *** BUG DETECTED: ADC HL Z flag computed from 16-bit r16, not 24-bit result ***`);
    console.log(`    *** 0x010000 + 0x000000 = 0x010000 -> Z should be FALSE but got TRUE ***`);
    recordResult('addWithCarryWord', false, 'ADL Z-flag from r16 not full result');
  } else {
    check('addWithCarryWord', 'ADL 0x010000+0x000000 Z', zFlag, zExpectedCorrect);
  }

  // ADL MODE: S flag. 0x800000 is "negative" in 24-bit signed.
  // But code checks r16 & 0x8000, which is bit 15, not bit 23.
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWithCarryWord(0x7FFFFF, 0x000001);
  // 24-bit result = 0x800000. S should be TRUE (bit 23 set).
  // r16 = 0x0000. S from r16 bit 15 = FALSE. Bug!
  const sFlag = (cpu.f & FLAG_S) !== 0;
  if (!sFlag) {
    console.log(`    *** BUG DETECTED: ADC HL S flag computed from bit 15 (r16), not bit 23 (24-bit) ***`);
    console.log(`    *** 0x7FFFFF + 0x000001 = 0x800000 -> S should be TRUE but got FALSE ***`);
    recordResult('addWithCarryWord', false, 'ADL S-flag from r16 bit15 not bit23');
  } else {
    check('addWithCarryWord', 'ADL 0x7FFFFF+0x000001 S', sFlag, true);
  }

  // ADL MODE: C flag. Code checks result > 0xffff, but in ADL should check > 0xffffff
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWithCarryWord(0x010000, 0x010000);
  // 24-bit result = 0x020000. No 24-bit carry. But raw sum is 0x020000 > 0xFFFF.
  const cFlag = (cpu.f & FLAG_C) !== 0;
  if (cFlag) {
    console.log(`    *** BUG DETECTED: ADC HL C flag threshold is 0xFFFF, not 0xFFFFFF in ADL mode ***`);
    console.log(`    *** 0x010000 + 0x010000 = 0x020000 -> C should be FALSE but got TRUE ***`);
    recordResult('addWithCarryWord', false, 'ADL C-flag threshold 0xFFFF not 0xFFFFFF');
  } else {
    check('addWithCarryWord', 'ADL 0x010000+0x010000 C', cFlag, false);
  }

  // ADL MODE: PV (overflow). Code checks overflow at bit 15. In ADL should be bit 23.
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.addWithCarryWord(0x7FFFFF, 0x000001);
  // 24-bit signed overflow: 0x7FFFFF + 1 = 0x800000. Overflow!
  // But code checks: ((a ^ result) & (b ^ result) & 0x8000) — bit 15 overflow
  // a=0x7FFFFF, b=0x000001, result=0x800000. At bit 15: a has bit15=1, result bit15=0.
  // (a^result) bit15 = 1, (b^result) bit15 = 0. AND = 0. So PV=0. Bug!
  const pvFlag = (cpu.f & FLAG_PV) !== 0;
  if (!pvFlag) {
    console.log(`    *** BUG DETECTED: ADC HL PV overflow checked at bit 15, not bit 23 in ADL mode ***`);
    recordResult('addWithCarryWord', false, 'ADL PV-flag overflow at bit15 not bit23');
  } else {
    check('addWithCarryWord', 'ADL 0x7FFFFF+0x000001 PV', pvFlag, true);
  }
}

// ---------------------------------------------------------------------------
// Test: subtractWithBorrowWord(a, b) — SBC HL,rr
// ---------------------------------------------------------------------------

function testSubtractWithBorrowWord() {
  console.log('\n--- subtractWithBorrowWord(a, b) — SBC HL,rr ---');
  const cpu = freshCPU();

  // Z80 mode: 0x5000 - 0x2000 - C=0 = 0x3000
  cpu.madl = 0;
  cpu.f = 0;
  let r = cpu.subtractWithBorrowWord(0x5000, 0x2000);
  check('subtractWithBorrowWord', 'z80 0x5000-0x2000 result', r, 0x3000);
  checkFlags('subtractWithBorrowWord', 'z80 0x5000-0x2000', cpu, { S: false, Z: false, N: true, C: false });

  // Z80 mode: 0x0000 - 0x0001 = 0xFFFF, carry
  cpu.madl = 0;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x0000, 0x0001);
  check('subtractWithBorrowWord', 'z80 0x0000-0x0001 result', r, 0xFFFF);
  checkFlags('subtractWithBorrowWord', 'z80 0x0000-0x0001', cpu, { S: true, Z: false, N: true, C: true });

  // Z80: 0x8000 - 0x0001 = 0x7FFF, overflow (neg - pos = pos)
  cpu.madl = 0;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x8000, 0x0001);
  check('subtractWithBorrowWord', 'z80 0x8000-0x0001 result', r, 0x7FFF);
  checkFlags('subtractWithBorrowWord', 'z80 0x8000-0x0001', cpu, { S: false, PV: true, N: true, C: false });

  // ADL MODE BUG CHECK: same pattern as ADC
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x010000, 0x010000);
  // 24-bit: 0x010000 - 0x010000 = 0x000000. Z should be TRUE.
  // r16 = 0x0000. In this case both agree, so Z=TRUE is correct.
  check('subtractWithBorrowWord', 'ADL 0x010000-0x010000 result', r, 0x000000);
  check('subtractWithBorrowWord', 'ADL 0x010000-0x010000 Z', (cpu.f & FLAG_Z) !== 0, true);

  // ADL MODE: 0x020000 - 0x010000 = 0x010000. Z should be FALSE.
  // r16 = 0x0000. Bug: Z would be TRUE from r16.
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x020000, 0x010000);
  check('subtractWithBorrowWord', 'ADL 0x020000-0x010000 result', r, 0x010000);
  const zFlag = (cpu.f & FLAG_Z) !== 0;
  if (zFlag) {
    console.log(`    *** BUG DETECTED: SBC HL Z flag from r16 not 24-bit result ***`);
    console.log(`    *** 0x020000 - 0x010000 = 0x010000 -> Z should be FALSE but got TRUE ***`);
    recordResult('subtractWithBorrowWord', false, 'ADL Z-flag from r16');
  } else {
    check('subtractWithBorrowWord', 'ADL 0x020000-0x010000 Z', zFlag, false);
  }

  // ADL: S flag from bit 23
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x000000, 0x000001);
  // 24-bit: -1 = 0xFFFFFF. S should be TRUE (bit 23 set).
  // r16 = 0xFFFF. S from bit 15 = TRUE. This case happens to agree.
  check('subtractWithBorrowWord', 'ADL 0x000000-0x000001 result', r, 0xFFFFFF);
  check('subtractWithBorrowWord', 'ADL 0x000000-0x000001 S', (cpu.f & FLAG_S) !== 0, true);

  // ADL: C flag check. result < 0 is correct for both 16 and 24-bit.
  cpu.madl = 1;
  cpu.f = 0;
  r = cpu.subtractWithBorrowWord(0x000000, 0x000001);
  check('subtractWithBorrowWord', 'ADL 0x000000-0x000001 C', (cpu.f & FLAG_C) !== 0, true);
}

// ---------------------------------------------------------------------------
// Test: rld() — BCD rotate left digit
// ---------------------------------------------------------------------------

function testRLD() {
  console.log('\n--- rld() ---');

  // eZ80 manual example: A=0x7A, (HL)=0x31 -> A=0x73, (HL)=0x1A
  const cpu = freshCPU();
  cpu.a = 0x7A;
  cpu._hl = 0xD10000; // point to RAM
  cpu.memory[0xD10000] = 0x31;
  cpu.f = FLAG_C; // C should be preserved
  cpu.rld();
  check('rld', 'A=0x7A,(HL)=0x31 -> A', cpu.a, 0x73);
  check('rld', 'A=0x7A,(HL)=0x31 -> (HL)', cpu.memory[0xD10000], 0x1A);
  checkFlags('rld', 'A=0x7A,(HL)=0x31', cpu, { S: false, Z: false, H: false, N: false, C: true });
  // PV = parity(0x73). 0x73 = 0111_0011 = 5 bits -> odd -> PV=0
  check('rld', 'PV=parity(0x73)', (cpu.f & FLAG_PV) !== 0, false);

  // Another case: A=0x00, (HL)=0x00 -> A=0x00, (HL)=0x00, Z=1
  const cpu2 = freshCPU();
  cpu2.a = 0x00;
  cpu2._hl = 0xD10000;
  cpu2.memory[0xD10000] = 0x00;
  cpu2.f = 0;
  cpu2.rld();
  check('rld', 'A=0x00,(HL)=0x00 -> A', cpu2.a, 0x00);
  check('rld', 'A=0x00,(HL)=0x00 -> (HL)', cpu2.memory[0xD10000], 0x00);
  check('rld', 'A=0x00 Z', (cpu2.f & FLAG_Z) !== 0, true);
}

// ---------------------------------------------------------------------------
// Test: rrd() — BCD rotate right digit
// ---------------------------------------------------------------------------

function testRRD() {
  console.log('\n--- rrd() ---');

  // eZ80 manual example: A=0x84, (HL)=0x20 -> A=0x80, (HL)=0x42
  const cpu = freshCPU();
  cpu.a = 0x84;
  cpu._hl = 0xD10000;
  cpu.memory[0xD10000] = 0x20;
  cpu.f = FLAG_C; // C preserved
  cpu.rrd();
  check('rrd', 'A=0x84,(HL)=0x20 -> A', cpu.a, 0x80);
  check('rrd', 'A=0x84,(HL)=0x20 -> (HL)', cpu.memory[0xD10000], 0x42);
  checkFlags('rrd', 'A=0x84,(HL)=0x20', cpu, { S: true, Z: false, H: false, N: false, C: true });
  // PV = parity(0x80). 0x80 = 1 bit -> odd -> PV=0
  check('rrd', 'PV=parity(0x80)', (cpu.f & FLAG_PV) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: testBit(value, bit) — BIT b,r
// ---------------------------------------------------------------------------

function testTestBit() {
  console.log('\n--- testBit(value, bit) ---');
  const cpu = freshCPU();

  // BIT 0, 0x01 -> bit is set: Z=0, PV=0, S=0
  cpu.f = 0;
  cpu.testBit(0x01, 0);
  checkFlags('testBit', 'BIT 0,0x01', cpu, { Z: false, PV: false, S: false, H: true, N: false });

  // BIT 7, 0x80 -> bit 7 set: Z=0, PV=0, S=1
  cpu.f = 0;
  cpu.testBit(0x80, 7);
  checkFlags('testBit', 'BIT 7,0x80', cpu, { Z: false, PV: false, S: true, H: true, N: false });

  // BIT 3, 0x00 -> bit not set: Z=1, PV=1, S=0
  cpu.f = 0;
  cpu.testBit(0x00, 3);
  checkFlags('testBit', 'BIT 3,0x00', cpu, { Z: true, PV: true, S: false, H: true, N: false });

  // BIT 7, 0x00 -> bit 7 not set: Z=1, PV=1, S=0 (S only set if bit7 AND bit is set)
  cpu.f = 0;
  cpu.testBit(0x00, 7);
  checkFlags('testBit', 'BIT 7,0x00', cpu, { Z: true, PV: true, S: false, H: true, N: false });

  // BIT 4, 0xFF -> bit 4 set: Z=0, PV=0, S=0 (S only for bit 7)
  cpu.f = 0;
  cpu.testBit(0xFF, 4);
  checkFlags('testBit', 'BIT 4,0xFF', cpu, { Z: false, PV: false, S: false, H: true, N: false });
}

// ---------------------------------------------------------------------------
// Test: rotateShift8(op, value) — SRL, SRA, SLA, etc.
// ---------------------------------------------------------------------------

function testRotateShift8() {
  console.log('\n--- rotateShift8(op, value) ---');
  const cpu = freshCPU();

  // SRL 0x83 -> 0x41, C=1
  cpu.f = 0;
  let r = cpu.rotateShift8('srl', 0x83);
  check('rotateShift8', 'SRL 0x83 result', r, 0x41);
  check('rotateShift8', 'SRL 0x83 C', (cpu.f & FLAG_C) !== 0, true);
  check('rotateShift8', 'SRL 0x83 S', (cpu.f & FLAG_S) !== 0, false);
  check('rotateShift8', 'SRL 0x83 Z', (cpu.f & FLAG_Z) !== 0, false);
  check('rotateShift8', 'SRL 0x83 H', (cpu.f & FLAG_H) !== 0, false);
  check('rotateShift8', 'SRL 0x83 N', (cpu.f & FLAG_N) !== 0, false);

  // SRL 0x02 -> 0x01, C=0
  cpu.f = 0;
  r = cpu.rotateShift8('srl', 0x02);
  check('rotateShift8', 'SRL 0x02 result', r, 0x01);
  check('rotateShift8', 'SRL 0x02 C', (cpu.f & FLAG_C) !== 0, false);

  // SRL 0x01 -> 0x00, C=1, Z=1
  cpu.f = 0;
  r = cpu.rotateShift8('srl', 0x01);
  check('rotateShift8', 'SRL 0x01 result', r, 0x00);
  check('rotateShift8', 'SRL 0x01 C', (cpu.f & FLAG_C) !== 0, true);
  check('rotateShift8', 'SRL 0x01 Z', (cpu.f & FLAG_Z) !== 0, true);

  // SRA 0x80 -> 0xC0 (arithmetic shift preserves bit 7), C=0
  cpu.f = 0;
  r = cpu.rotateShift8('sra', 0x80);
  check('rotateShift8', 'SRA 0x80 result', r, 0xC0);
  check('rotateShift8', 'SRA 0x80 C', (cpu.f & FLAG_C) !== 0, false);
  check('rotateShift8', 'SRA 0x80 S', (cpu.f & FLAG_S) !== 0, true);

  // SLA 0x80 -> 0x00, C=1
  cpu.f = 0;
  r = cpu.rotateShift8('sla', 0x80);
  check('rotateShift8', 'SLA 0x80 result', r, 0x00);
  check('rotateShift8', 'SLA 0x80 C', (cpu.f & FLAG_C) !== 0, true);
  check('rotateShift8', 'SLA 0x80 Z', (cpu.f & FLAG_Z) !== 0, true);

  // RLC 0x85 -> 0x0B, C=1 (bit7 was 1)
  cpu.f = 0;
  r = cpu.rotateShift8('rlc', 0x85);
  check('rotateShift8', 'RLC 0x85 result', r, 0x0B);
  check('rotateShift8', 'RLC 0x85 C', (cpu.f & FLAG_C) !== 0, true);

  // RRC 0x01 -> 0x80, C=1 (bit0 was 1)
  cpu.f = 0;
  r = cpu.rotateShift8('rrc', 0x01);
  check('rotateShift8', 'RRC 0x01 result', r, 0x80);
  check('rotateShift8', 'RRC 0x01 C', (cpu.f & FLAG_C) !== 0, true);

  // RL with carry: value=0x40, C=1 -> result = 0x81, C=0
  cpu.f = FLAG_C;
  r = cpu.rotateShift8('rl', 0x40);
  check('rotateShift8', 'RL 0x40 C=1 result', r, 0x81);
  check('rotateShift8', 'RL 0x40 C=1 new C', (cpu.f & FLAG_C) !== 0, false);

  // RR with carry: value=0x80, C=1 -> result = 0xC0, C=0
  cpu.f = FLAG_C;
  r = cpu.rotateShift8('rr', 0x80);
  check('rotateShift8', 'RR 0x80 C=1 result', r, 0xC0);
  check('rotateShift8', 'RR 0x80 C=1 new C', (cpu.f & FLAG_C) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: inc8, dec8
// ---------------------------------------------------------------------------

function testIncDec8() {
  console.log('\n--- inc8 / dec8 ---');
  const cpu = freshCPU();

  // INC 0x0F -> 0x10, H=1
  cpu.f = FLAG_C; // C preserved
  let r = cpu.inc8(0x0F);
  check('inc8', 'INC 0x0F result', r, 0x10);
  checkFlags('inc8', 'INC 0x0F', cpu, { H: true, N: false, C: true /* preserved */ });

  // INC 0x7F -> 0x80, PV=1 (overflow)
  cpu.f = 0;
  r = cpu.inc8(0x7F);
  check('inc8', 'INC 0x7F result', r, 0x80);
  checkFlags('inc8', 'INC 0x7F', cpu, { S: true, PV: true, H: true, N: false });

  // INC 0xFF -> 0x00, Z=1
  cpu.f = 0;
  r = cpu.inc8(0xFF);
  check('inc8', 'INC 0xFF result', r, 0x00);
  checkFlags('inc8', 'INC 0xFF', cpu, { Z: true, H: true, N: false });

  // DEC 0x10 -> 0x0F, H=1 (borrow from bit 4)
  // dec8 sets H when low nibble was 0x00 (borrow into nibble)
  cpu.f = FLAG_C; // C preserved
  r = cpu.dec8(0x10);
  check('dec8', 'DEC 0x10 result', r, 0x0F);
  checkFlags('dec8', 'DEC 0x10', cpu, { H: true, N: true, C: true });

  // DEC 0x80 -> 0x7F, PV=1 (overflow)
  cpu.f = 0;
  r = cpu.dec8(0x80);
  check('dec8', 'DEC 0x80 result', r, 0x7F);
  checkFlags('dec8', 'DEC 0x80', cpu, { PV: true, N: true });

  // DEC 0x01 -> 0x00, Z=1
  cpu.f = 0;
  r = cpu.dec8(0x01);
  check('dec8', 'DEC 0x01 result', r, 0x00);
  checkFlags('dec8', 'DEC 0x01', cpu, { Z: true, N: true });

  // DEC 0x00 -> 0xFF, H=1
  cpu.f = 0;
  r = cpu.dec8(0x00);
  check('dec8', 'DEC 0x00 result', r, 0xFF);
  checkFlags('dec8', 'DEC 0x00', cpu, { S: true, H: true, N: true });
}

// ---------------------------------------------------------------------------
// Test: addWithCarry8, subtractWithBorrow8
// ---------------------------------------------------------------------------

function testCarry8() {
  console.log('\n--- addWithCarry8 / subtractWithBorrow8 ---');
  const cpu = freshCPU();

  // ADC: 0x10 + 0x20 + C=1 = 0x31
  cpu.f = FLAG_C;
  let r = cpu.addWithCarry8(0x10, 0x20);
  check('addWithCarry8', '0x10+0x20+C=1 result', r, 0x31);
  checkFlags('addWithCarry8', '0x10+0x20+C=1', cpu, { N: false, C: false });

  // ADC: 0xFF + 0x00 + C=1 = 0x100 -> 0x00, C=1, Z=1
  cpu.f = FLAG_C;
  r = cpu.addWithCarry8(0xFF, 0x00);
  check('addWithCarry8', '0xFF+0x00+C=1 result', r, 0x00);
  checkFlags('addWithCarry8', '0xFF+0x00+C=1', cpu, { Z: true, C: true });

  // SBC: 0x30 - 0x10 - C=1 = 0x1F
  cpu.f = FLAG_C;
  r = cpu.subtractWithBorrow8(0x30, 0x10);
  check('subtractWithBorrow8', '0x30-0x10-C=1 result', r, 0x1F);
  checkFlags('subtractWithBorrow8', '0x30-0x10-C=1', cpu, { N: true, H: true });

  // SBC: 0x00 - 0x00 - C=1 = -1 = 0xFF, C=1
  cpu.f = FLAG_C;
  r = cpu.subtractWithBorrow8(0x00, 0x00);
  check('subtractWithBorrow8', '0x00-0x00-C=1 result', r, 0xFF);
  checkFlags('subtractWithBorrow8', '0x00-0x00-C=1', cpu, { S: true, C: true });
}

// ---------------------------------------------------------------------------
// Test: compare(a, b) — CP
// ---------------------------------------------------------------------------

function testCompare() {
  console.log('\n--- compare(a, b) — CP ---');
  const cpu = freshCPU();

  // CP 0x44, 0x44 -> Z=1, N=1, C=0
  cpu.f = 0;
  cpu.compare(0x44, 0x44);
  checkFlags('compare', 'CP 0x44,0x44', cpu, { Z: true, N: true, C: false });

  // CP 0x44, 0x45 -> Z=0, N=1, C=1 (borrow)
  cpu.f = 0;
  cpu.compare(0x44, 0x45);
  checkFlags('compare', 'CP 0x44,0x45', cpu, { Z: false, N: true, C: true });

  // CP 0x80, 0x01 -> S=0 (result=0x7F), PV=1 (overflow)
  cpu.f = 0;
  cpu.compare(0x80, 0x01);
  checkFlags('compare', 'CP 0x80,0x01', cpu, { S: false, PV: true, N: true });
}

// ---------------------------------------------------------------------------
// Test: updateLogicFlags / updateOrXorFlags
// ---------------------------------------------------------------------------

function testLogicFlags() {
  console.log('\n--- updateLogicFlags / updateOrXorFlags ---');
  const cpu = freshCPU();

  // AND result=0x00: Z=1, H=1, N=0, C=0
  cpu.updateLogicFlags(0x00);
  checkFlags('updateLogicFlags', 'AND 0x00', cpu, { Z: true, H: true, N: false, C: false });

  // AND result=0x80: S=1
  cpu.updateLogicFlags(0x80);
  checkFlags('updateLogicFlags', 'AND 0x80', cpu, { S: true, Z: false, H: true });

  // OR result=0x00: Z=1, H=0
  cpu.updateOrXorFlags(0x00);
  checkFlags('updateOrXorFlags', 'OR 0x00', cpu, { Z: true, H: false, N: false, C: false });

  // XOR result=0xFF: S=1, Z=0
  cpu.updateOrXorFlags(0xFF);
  checkFlags('updateOrXorFlags', 'XOR 0xFF', cpu, { S: true, Z: false, H: false });
}

// ---------------------------------------------------------------------------
// Test: Accumulator rotate instructions (RLCA, RRCA, RLA, RRA)
// ---------------------------------------------------------------------------

function testAccRotates() {
  console.log('\n--- rotateLeftCircular / rotateRightCircular / rotateLeftThroughCarry / rotateRightThroughCarry ---');
  const cpu = freshCPU();

  // RLCA: 0x85 -> bit7=1, result=(0x85<<1|1)&0xFF = 0x0B, C=1
  cpu.f = 0;
  let r = cpu.rotateLeftCircular(0x85);
  check('rotateLeftCircular', 'RLCA 0x85 result', r, 0x0B);
  checkFlags('rotateLeftCircular', 'RLCA 0x85', cpu, { H: false, N: false, C: true });

  // RRCA: 0x01 -> bit0=1, result=(0x00|0x80)=0x80, C=1
  cpu.f = 0;
  r = cpu.rotateRightCircular(0x01);
  check('rotateRightCircular', 'RRCA 0x01 result', r, 0x80);
  checkFlags('rotateRightCircular', 'RRCA 0x01', cpu, { H: false, N: false, C: true });

  // RLA: value=0x80, C=0 -> result=(0x80<<1|0)=0x00, C=1
  cpu.f = 0;
  r = cpu.rotateLeftThroughCarry(0x80);
  check('rotateLeftThroughCarry', 'RLA 0x80 C=0 result', r, 0x00);
  check('rotateLeftThroughCarry', 'RLA 0x80 C=0 C', (cpu.f & FLAG_C) !== 0, true);

  // RRA: value=0x01, C=0 -> result=(0x00|0x00)=0x00, C=1
  cpu.f = 0;
  r = cpu.rotateRightThroughCarry(0x01);
  check('rotateRightThroughCarry', 'RRA 0x01 C=0 result', r, 0x00);
  check('rotateRightThroughCarry', 'RRA 0x01 C=0 C', (cpu.f & FLAG_C) !== 0, true);
}

// ---------------------------------------------------------------------------
// Test: complementCarryFlag / setCarryFlag
// ---------------------------------------------------------------------------

function testCarryFlagOps() {
  console.log('\n--- complementCarryFlag / setCarryFlag ---');
  const cpu = freshCPU();

  // CCF: C was 1 -> C becomes 0, H=old_C=1
  cpu.f = FLAG_C;
  cpu.complementCarryFlag();
  checkFlags('complementCarryFlag', 'CCF C=1', cpu, { C: false, H: true, N: false });

  // CCF: C was 0 -> C becomes 1, H=old_C=0
  cpu.f = 0;
  cpu.complementCarryFlag();
  checkFlags('complementCarryFlag', 'CCF C=0', cpu, { C: true, H: false, N: false });

  // SCF
  cpu.f = 0;
  cpu.setCarryFlag();
  checkFlags('setCarryFlag', 'SCF', cpu, { C: true, H: false, N: false });
}

// ---------------------------------------------------------------------------
// Test: negate(a) — NEG
// ---------------------------------------------------------------------------

function testNegate() {
  console.log('\n--- negate(a) — NEG ---');
  const cpu = freshCPU();

  // NEG 0x01 -> 0xFF, C=1
  cpu.f = 0;
  let r = cpu.negate(0x01);
  check('negate', 'NEG 0x01 result', r, 0xFF);
  checkFlags('negate', 'NEG 0x01', cpu, { S: true, N: true, C: true });

  // NEG 0x00 -> 0x00, C=0, Z=1
  cpu.f = 0;
  r = cpu.negate(0x00);
  check('negate', 'NEG 0x00 result', r, 0x00);
  checkFlags('negate', 'NEG 0x00', cpu, { Z: true, N: true, C: false });

  // NEG 0x80 -> 0x80, PV=1 (overflow: -(-128) can't fit in signed byte)
  cpu.f = 0;
  r = cpu.negate(0x80);
  check('negate', 'NEG 0x80 result', r, 0x80);
  checkFlags('negate', 'NEG 0x80', cpu, { S: true, PV: true, N: true, C: true });
}

// ---------------------------------------------------------------------------
// Test: push/pop
// ---------------------------------------------------------------------------

function testPushPop() {
  console.log('\n--- push / pop ---');

  // ADL mode: 24-bit push/pop
  const cpu = freshCPU();
  cpu.madl = 1;
  cpu.sp = 0xD10010;
  cpu.push(0x123456);
  check('push', 'ADL sp after push', cpu.sp, 0xD1000D);
  const val = cpu.pop();
  check('pop', 'ADL pop value', val, 0x123456);
  check('pop', 'ADL sp after pop', cpu.sp, 0xD10010);

  // Z80 mode: 16-bit push/pop
  // Note: In Z80 mode, SP is 16-bit (max 0xFFFF), which falls in the ROM
  // write-protect zone (< 0x400000). The real eZ80 would use MBASE to form
  // a 24-bit address, but cpu-runtime.js doesn't apply MBASE to push/pop.
  // We test by writing directly to memory to verify pop reads correctly,
  // and check SP arithmetic separately.
  const cpu2 = freshCPU();
  cpu2.madl = 0;
  cpu2.sp = 0x8010;
  // Manually write the value since push would hit ROM protect
  cpu2.memory[0x800E] = 0xCD;
  cpu2.memory[0x800F] = 0xAB;
  cpu2.sp = 0x800E; // simulate post-push SP
  const val2 = cpu2.pop();
  check('pop', 'Z80 pop value', val2 & 0xFFFF, 0xABCD);
  check('pop', 'Z80 sp after pop', cpu2.sp, 0x8010);

  // Verify Z80 push SP arithmetic
  const cpu3 = freshCPU();
  cpu3.madl = 0;
  cpu3.sp = 0x8010;
  const spBefore = cpu3.sp;
  cpu3.push(0x1234); // write silently dropped by ROM protect, but SP still moves
  check('push', 'Z80 sp arithmetic', cpu3.sp, spBefore - 2);
}

// ---------------------------------------------------------------------------
// Test: checkCondition
// ---------------------------------------------------------------------------

function testCheckCondition() {
  console.log('\n--- checkCondition ---');
  const cpu = freshCPU();

  cpu.f = FLAG_Z;
  check('checkCondition', 'z when Z=1', cpu.checkCondition('z'), true);
  check('checkCondition', 'nz when Z=1', cpu.checkCondition('nz'), false);

  cpu.f = FLAG_C;
  check('checkCondition', 'c when C=1', cpu.checkCondition('c'), true);
  check('checkCondition', 'nc when C=1', cpu.checkCondition('nc'), false);

  cpu.f = FLAG_PV;
  check('checkCondition', 'pe when PV=1', cpu.checkCondition('pe'), true);
  check('checkCondition', 'po when PV=1', cpu.checkCondition('po'), false);

  cpu.f = FLAG_S;
  check('checkCondition', 'm when S=1', cpu.checkCondition('m'), true);
  check('checkCondition', 'p when S=1', cpu.checkCondition('p'), false);

  cpu.f = 0;
  check('checkCondition', 'z when Z=0', cpu.checkCondition('z'), false);
  check('checkCondition', 'nz when Z=0', cpu.checkCondition('nz'), true);
}

// ---------------------------------------------------------------------------
// Test: exchange operations
// ---------------------------------------------------------------------------

function testExchange() {
  console.log('\n--- swapMainAlternate / swapAf ---');
  const cpu = freshCPU();

  cpu._bc = 0x111111;
  cpu._de = 0x222222;
  cpu._hl = 0x333333;
  cpu._bc2 = 0xAAAAAA;
  cpu._de2 = 0xBBBBBB;
  cpu._hl2 = 0xCCCCCC;
  cpu.swapMainAlternate();
  check('swapMainAlternate', 'BC after swap', cpu._bc, 0xAAAAAA);
  check('swapMainAlternate', 'DE after swap', cpu._de, 0xBBBBBB);
  check('swapMainAlternate', 'HL after swap', cpu._hl, 0xCCCCCC);
  check('swapMainAlternate', 'BC2 after swap', cpu._bc2, 0x111111);
  check('swapMainAlternate', 'DE2 after swap', cpu._de2, 0x222222);
  check('swapMainAlternate', 'HL2 after swap', cpu._hl2, 0x333333);

  cpu.a = 0x12;
  cpu.f = 0x34;
  cpu._a2 = 0x56;
  cpu._f2 = 0x78;
  cpu.swapAf();
  check('swapAf', 'A after swap', cpu.a, 0x56);
  check('swapAf', 'F after swap', cpu.f, 0x78);
  check('swapAf', 'A2 after swap', cpu._a2, 0x12);
  check('swapAf', 'F2 after swap', cpu._f2, 0x34);
}

// ---------------------------------------------------------------------------
// Test: block transfer (ldi, ldd)
// ---------------------------------------------------------------------------

function testBlockTransfer() {
  console.log('\n--- ldi / ldd ---');

  const cpu = freshCPU();
  cpu.madl = 1;
  cpu.a = 0x00;
  cpu._hl = 0xD10000;
  cpu._de = 0xD20000;
  cpu._bc = 0x000003;
  cpu.memory[0xD10000] = 0xAA;
  cpu.ldi();
  check('ldi', 'byte copied', cpu.memory[0xD20000], 0xAA);
  check('ldi', 'HL incremented', cpu._hl, 0xD10001);
  check('ldi', 'DE incremented', cpu._de, 0xD20001);
  check('ldi', 'BC decremented', cpu._bc, 0x000002);
  check('ldi', 'PV=1 (BC!=0)', (cpu.f & FLAG_PV) !== 0, true);
  check('ldi', 'H=0', (cpu.f & FLAG_H) !== 0, false);
  check('ldi', 'N=0', (cpu.f & FLAG_N) !== 0, false);
}

// ---------------------------------------------------------------------------
// Test: decrementAndCheckB — DJNZ helper
// ---------------------------------------------------------------------------

function testDJNZ() {
  console.log('\n--- decrementAndCheckB ---');
  const cpu = freshCPU();

  cpu.b = 2;
  check('decrementAndCheckB', 'B=2 -> not zero', cpu.decrementAndCheckB(), true);
  check('decrementAndCheckB', 'B=2 -> B now 1', cpu.b, 1);
  check('decrementAndCheckB', 'B=1 -> zero', cpu.decrementAndCheckB(), false);
  check('decrementAndCheckB', 'B=1 -> B now 0', cpu.b, 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('='.repeat(70));
console.log('PHASE 172: CPU METHOD AUDIT AGAINST eZ80 SPECIFICATION');
console.log('='.repeat(70));

testParity();
testSzFlags();
testAdd8();
testSubtract8();
testDAA();
testAddWord();
testAddWithCarryWord();
testSubtractWithBorrowWord();
testRLD();
testRRD();
testTestBit();
testRotateShift8();
testIncDec8();
testCarry8();
testCompare();
testLogicFlags();
testAccRotates();
testCarryFlagOps();
testNegate();
testPushPop();
testCheckCondition();
testExchange();
testBlockTransfer();
testDJNZ();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests: ${totalTests}`);
console.log(`  PASS: ${totalPass}`);
console.log(`  FAIL: ${totalFail}`);
console.log('');

if (totalFail > 0) {
  console.log('--- FAILURES BY METHOD ---');
  const failsByMethod = new Map();
  for (const f of failures) {
    if (!failsByMethod.has(f.method)) failsByMethod.set(f.method, []);
    failsByMethod.get(f.method).push(f.detail);
  }
  for (const [method, details] of failsByMethod) {
    console.log(`\n  ${method}:`);
    for (const d of details) {
      console.log(`    - ${d}`);
    }
  }
  console.log('');
}

console.log('--- PER-METHOD SUMMARY ---');
for (const [method, { pass, fail }] of [...methodResults.entries()].sort((a, b) => b[1].fail - a[1].fail)) {
  const status = fail > 0 ? 'FAIL' : 'PASS';
  console.log(`  ${status} ${method}: ${pass} pass, ${fail} fail`);
}

console.log('');
if (totalFail > 0) {
  console.log(`*** ${totalFail} FAILURES DETECTED — these methods likely contain bugs ***`);
  process.exitCode = 1;
} else {
  console.log('All tests passed.');
  process.exitCode = 0;
}
