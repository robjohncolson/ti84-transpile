#!/usr/bin/env node

/**
 * Phase 144 — gcd with 11-byte FPS Entries
 *
 * Root cause: FPS entries are 11 bytes each (9 BCD + 2 padding), not 9.
 * Session 143 seeded 9-byte entries, so FpPop (which subtracts 11) reads
 * from misaligned offsets, producing garbage OP2 (1.0 instead of 8.0).
 *
 * Fix: seed each FPS entry as 11 bytes. Set FPS = base + 22 (two entries).
 *
 * Test A: direct gcd handler at 0x068D3D  with 11-byte FPS entries
 * Test B: dispatch entry at 0x06859B with A=0x28, 11-byte FPS entries
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_DIRECT_ADDR = 0x068d3d;
const GCD_DISPATCH_ADDR = 0x06859b;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;  // Well away from allocator state

const FPS_ENTRY_SIZE = 11;  // 9 BCD + 2 padding

// Key addresses to watch
const FPPOP_ADDR = 0x082957;
const TYPE_VALIDATOR_ADDR = 0x07f831;
const ERR_DOMAIN_LOADER = 0x061d0e;

// BCD values (9 bytes each)
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4  = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every(d => d === 0)) return 0;
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

function matchesBCD4(mem, addr) {
  for (let i = 0; i < 9; i++) {
    if ((mem[addr + i] & 0xff) !== BCD_4[i]) return false;
  }
  return true;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return base;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedFPSOperands11Byte(mem) {
  // Set FPS base to clean area
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);

  // Clear the area first (22 bytes for 2 entries)
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 22);

  // Entry 0 (deeper on stack): 12.0 — 9 BCD bytes + 2 zero padding
  mem.set(BCD_12, FPS_CLEAN_AREA);
  // bytes 9,10 already zero from fill

  // Entry 1 (top of stack): 8.0 — 9 BCD bytes + 2 zero padding
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  // bytes 9,10 already zero from fill

  // FPS points past both 11-byte entries
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 2 * FPS_ENTRY_SIZE);  // base + 22

  // Also seed OP1 and OP2 directly
  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

// ── Run a single gcd test ─────────────────────────────────────────────────

function runGcdTest(label, entryAddr, executor, cpu, mem, opts = {}) {
  console.log('='.repeat(72));
  console.log(`  ${label}`);
  console.log('='.repeat(72));
  console.log('');

  // Prepare CPU state
  prepareCallState(cpu, mem);

  // FIXED ORDER: seedAllocator FIRST, then seedFPSOperands SECOND
  seedAllocator(mem);
  seedFPSOperands11Byte(mem);

  mem[FP_CATEGORY_ADDR] = 0x28;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Set register A if needed (for dispatch entry)
  if (opts.regA !== undefined) {
    cpu.a = opts.regA;
  }

  console.log('  Initial state:');
  console.log(`    OP1 at 0xD005F8: [${hexBytes(mem, OP1_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`    OP2 at 0xD00603: [${hexBytes(mem, OP2_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FPS entry size: ${FPS_ENTRY_SIZE} bytes (9 BCD + 2 padding)`);
  console.log(`    FPS entry 0 (12.0): [${hexBytes(mem, FPS_CLEAN_AREA, 11)}]`);
  console.log(`    FPS entry 1 (8.0):  [${hexBytes(mem, FPS_CLEAN_AREA + 11, 11)}]`);
  console.log(`    FP category (0xD0060E): ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`    errNo: ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`    SP: ${hex(cpu.sp)}`);
  if (opts.regA !== undefined) {
    console.log(`    A register: ${hex(cpu.a & 0xff, 2)}`);
  }
  console.log('');

  // Tracking state
  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;
  let fpPopHits = 0;
  let typeValidatorHits = 0;
  let errDomainLoaderHits = 0;
  let errNoSetPC = null;
  let errNoSetStep = null;
  let prevErrNo = 0;
  const missingBlocks = new Map();
  const allPCs = [];
  const pcHitCount = new Map();
  const snapshots = [];

  // Track FPS pointer before/after FpPop
  let fpsPtrBeforePop = null;
  let awaitingPopExit = false;

  function takeSnapshot(snapLabel, pc, step) {
    snapshots.push({
      label: snapLabel,
      pc,
      step,
      op1: hexBytes(mem, OP1_ADDR, 11),
      op2: hexBytes(mem, OP2_ADDR, 11),
      op1Decoded: decodeBCDFloat(mem, OP1_ADDR),
      op2Decoded: decodeBCDFloat(mem, OP2_ADDR),
      fpCategory: mem[FP_CATEGORY_ADDR] & 0xff,
      errNo: mem[ERR_NO_ADDR] & 0xff,
      fpsPtr: read24(mem, FPS_ADDR),
      fpsBase: read24(mem, FPSBASE_ADDR),
      regA: cpu.a & 0xff,
      sp: cpu.sp,
    });
  }

  function handlePC(pc, step, isMissing) {
    const norm = pc & 0xffffff;
    stepCount = Math.max(stepCount, (typeof step === 'number' ? step : stepCount) + 1);

    if (allPCs.length < 10000) allPCs.push(norm);
    pcHitCount.set(norm, (pcHitCount.get(norm) || 0) + 1);

    const curErrNo = mem[ERR_NO_ADDR] & 0xff;
    if (curErrNo !== prevErrNo && curErrNo !== 0x00) {
      errNoSetPC = norm;
      errNoSetStep = stepCount;
      takeSnapshot(`errNo changed to ${hex(curErrNo, 2)} (${errName(curErrNo)})`, norm, stepCount);
      prevErrNo = curErrNo;
    }

    // Track FPS pointer changes around FpPop
    if (awaitingPopExit && norm !== FPPOP_ADDR) {
      const fpsPtrAfterPop = read24(mem, FPS_ADDR);
      const delta = fpsPtrBeforePop - fpsPtrAfterPop;
      const popNum = fpPopHits;
      takeSnapshot(
        `FpPop exit (#${popNum}) — FPS ${hex(fpsPtrBeforePop)} -> ${hex(fpsPtrAfterPop)} (delta=${delta})`,
        norm, stepCount
      );
      awaitingPopExit = false;
    }

    if (norm === FPPOP_ADDR) {
      fpPopHits++;
      fpsPtrBeforePop = read24(mem, FPS_ADDR);
      awaitingPopExit = true;
      if (fpPopHits <= 5) takeSnapshot(`FpPop entry (#${fpPopHits})`, norm, stepCount);
    }
    if (norm === TYPE_VALIDATOR_ADDR) {
      typeValidatorHits++;
      if (typeValidatorHits <= 3) takeSnapshot(`Type validator entry (#${typeValidatorHits})`, norm, stepCount);
    }
    if (norm === ERR_DOMAIN_LOADER) {
      errDomainLoaderHits++;
      takeSnapshot('E_Domain loader entry', norm, stepCount);
    }

    if (isMissing) {
      missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
    }

    if (norm === FAKE_RET) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  }

  try {
    executor.runFrom(entryAddr, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) { handlePC(pc, step, false); },
      onMissingBlock(pc, _m, step) { handlePC(pc, step, true); },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; }
    else if (e?.message === '__ERR__') { errCaught = true; }
    else throw e;
  }

  const finalErrNo = mem[ERR_NO_ADDR] & 0xff;
  const is4 = matchesBCD4(mem, OP1_ADDR);

  // ── Results ────────────────────────────────────────────────────────────

  console.log('  EXECUTION RESULT:');
  console.log(`    Outcome: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`    Steps: ${stepCount}`);
  console.log(`    Unique PCs visited: ${pcHitCount.size}`);
  console.log('');

  console.log('  ERROR STATE:');
  console.log(`    errNo: ${hex(finalErrNo, 2)} (${errName(finalErrNo)})`);
  if (errNoSetPC !== null) {
    console.log(`    errNo was set at PC: ${hex(errNoSetPC)} (step ${errNoSetStep})`);
  }
  console.log('');

  console.log('  KEY ADDRESS HITS:');
  console.log(`    FpPop (0x082957):           ${fpPopHits} times`);
  console.log(`    Type validator (0x07F831):   ${typeValidatorHits} times`);
  console.log(`    E_Domain loader (0x061D0E):  ${errDomainLoaderHits} times`);
  console.log('');

  console.log('  FINAL OPERAND STATE:');
  console.log(`    OP1: [${hexBytes(mem, OP1_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`    OP2: [${hexBytes(mem, OP2_ADDR, 11)}]  decoded: ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`    OP1 = 4.0 (gcd(12,8)): ${is4 ? 'YES' : 'NO'}`);
  console.log('');

  console.log('  FPS POINTER STATE:');
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FPS memory at base: [${hexBytes(mem, FPS_CLEAN_AREA, 22)}]`);
  console.log('');

  // ── Snapshots ──────────────────────────────────────────────────────────

  if (snapshots.length > 0) {
    console.log('  SNAPSHOTS AT KEY POINTS:');
    for (const snap of snapshots) {
      console.log(`    [Step ${snap.step}] ${snap.label} (PC=${hex(snap.pc)})`);
      console.log(`      OP1: [${snap.op1}]  decoded: ${snap.op1Decoded}`);
      console.log(`      OP2: [${snap.op2}]  decoded: ${snap.op2Decoded}`);
      console.log(`      FPS ptr: ${hex(snap.fpsPtr)}, FPS base: ${hex(snap.fpsBase)}, errNo: ${hex(snap.errNo, 2)}, A: ${hex(snap.regA, 2)}`);
    }
    console.log('');
  }

  // ── Missing blocks ────────────────────────────────────────────────────

  const realMissing = [...missingBlocks.entries()]
    .filter(([a]) => a !== FAKE_RET && a !== ERR_CATCH_ADDR);

  if (realMissing.length > 0) {
    console.log('  MISSING BLOCKS:');
    for (const [addr, count] of realMissing.sort((a, b) => b[1] - a[1])) {
      const romOff = addr;
      const romBytesStr = romOff < 0x400000
        ? hexBytes(romBytes, romOff, 8)
        : '(RAM area)';
      console.log(`    ${hex(addr)} (hit ${count}x) — ROM bytes: [${romBytesStr}]`);
    }
    console.log('');
  }

  // ── Last 30 PCs ────────────────────────────────────────────────────────

  console.log('  LAST 30 PCs:');
  const last30 = allPCs.slice(-30);
  for (const pc of last30) {
    let tag = '';
    if (pc === FPPOP_ADDR) tag = ' <-- FpPop';
    else if (pc === TYPE_VALIDATOR_ADDR) tag = ' <-- TypeValidator';
    else if (pc === ERR_DOMAIN_LOADER) tag = ' <-- E_Domain loader';
    else if (pc === ERR_CATCH_ADDR) tag = ' <-- ERR_CATCH';
    else if (pc === FAKE_RET) tag = ' <-- FAKE_RET';
    if (missingBlocks.has(pc)) tag += ' [MISSING]';
    console.log(`    ${hex(pc)}${tag}`);
  }
  console.log('');

  return { is4, finalErrNo, returnHit, errCaught, stepCount, fpPopHits };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 144: gcd with 11-byte FPS Entries ===');
  console.log('');
  console.log('  FIX: FPS entries are 11 bytes each (9 BCD + 2 zero padding)');
  console.log('  FPS = FPS_CLEAN_AREA + 22 (not +18)');
  console.log('  FpPop should decrement FPS by 11 per pop (not 9)');
  console.log('');

  const { mem, executor, cpu } = createRuntime();

  // Cold boot
  console.log('  Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('  Cold boot complete.');
  console.log('');

  // MEM_INIT
  console.log('  Running MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test A: direct gcd handler at 0x068D3D with 11-byte entries
  // ═══════════════════════════════════════════════════════════════════════

  const resultA = runGcdTest(
    'TEST A: direct gcd handler at 0x068D3D (11-byte FPS entries)',
    GCD_DIRECT_ADDR,
    executor, cpu, mem
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Test B: dispatch entry at 0x06859B with A=0x28, 11-byte entries
  // ═══════════════════════════════════════════════════════════════════════

  const resultB = runGcdTest(
    'TEST B: dispatch entry at 0x06859B with A=0x28 (11-byte FPS entries)',
    GCD_DISPATCH_ADDR,
    executor, cpu, mem,
    { regA: 0x28 }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(72));
  console.log('');

  const passA = resultA.is4 && resultA.finalErrNo === 0x00 && resultA.returnHit;
  const passB = resultB.is4 && resultB.finalErrNo === 0x00 && resultB.returnHit;

  console.log(`  Test A (direct 0x068D3D):    ${passA ? 'PASS' : 'FAIL'}`);
  console.log(`    OP1=4.0: ${resultA.is4 ? 'YES' : 'NO'}`);
  console.log(`    errNo: ${hex(resultA.finalErrNo, 2)} (${errName(resultA.finalErrNo)})`);
  console.log(`    Outcome: ${resultA.returnHit ? 'RETURNED' : resultA.errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`    Steps: ${resultA.stepCount}, FpPop hits: ${resultA.fpPopHits}`);
  console.log('');

  console.log(`  Test B (dispatch 0x06859B):  ${passB ? 'PASS' : 'FAIL'}`);
  console.log(`    OP1=4.0: ${resultB.is4 ? 'YES' : 'NO'}`);
  console.log(`    errNo: ${hex(resultB.finalErrNo, 2)} (${errName(resultB.finalErrNo)})`);
  console.log(`    Outcome: ${resultB.returnHit ? 'RETURNED' : resultB.errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`    Steps: ${resultB.stepCount}, FpPop hits: ${resultB.fpPopHits}`);
  console.log('');

  console.log(`  Overall: ${passA && passB ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log('');
  console.log('=== Phase 144 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
