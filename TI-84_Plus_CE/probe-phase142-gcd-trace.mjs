#!/usr/bin/env node

/**
 * Phase 142 — gcd E_Domain Detailed Trace
 *
 * Calls gcd handler DIRECTLY at 0x068D3D with FP stack seeded with 12.0 and 8.0.
 * Traces every PC visited, monitors errNo writes, checks FpPop execution,
 * dumps OP1/OP2 at key points, and reports missing CALL targets.
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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1a900;

// Key addresses to watch
const FPPOP_ADDR = 0x082957;
const TYPE_VALIDATOR_ADDR = 0x07f831;
const ERR_DOMAIN_LOADER = 0x061d0e;  // JP target that loads 0x84

// BCD values
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

function seedFPSOperands(mem) {
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  // Push 12.0 first (deeper on stack)
  mem.set(BCD_12, FPS_CLEAN_AREA);
  // Push 8.0 second (top of stack)
  mem.set(BCD_8, FPS_CLEAN_AREA + 9);
  // FPS points past both entries
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);
  // Also seed OP1 and OP2
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 142: gcd E_Domain Detailed Trace ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();

  // Check key blocks
  const hasFpPop = BLOCKS['082957:adl'] !== undefined;
  const hasGcdHandler = BLOCKS['068d3d:adl'] !== undefined;
  const hasTypeValidator = BLOCKS['07f831:adl'] !== undefined;
  const hasErrDomainLoader = BLOCKS['061d0e:adl'] !== undefined;
  console.log('  Block presence:');
  console.log(`    FpPop (0x082957):          ${hasFpPop ? 'PRESENT' : 'MISSING'}`);
  console.log(`    gcd handler (0x068D3D):    ${hasGcdHandler ? 'PRESENT' : 'MISSING'}`);
  console.log(`    Type validator (0x07F831): ${hasTypeValidator ? 'PRESENT' : 'MISSING'}`);
  console.log(`    E_Domain loader (0x061D0E):${hasErrDomainLoader ? 'PRESENT' : 'MISSING'}`);
  console.log('');

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Trace gcd via direct handler 0x068D3D
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TRACE: gcd via direct handler 0x068D3D');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedFPSOperands(mem);
  seedAllocator(mem);
  mem[FP_CATEGORY_ADDR] = 0x28;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log('  Initial state:');
  console.log(`    OP1 at 0xD005F8: [${hexBytes(mem, OP1_ADDR, 11)}]`);
  console.log(`    OP2 at 0xD00603: [${hexBytes(mem, OP2_ADDR, 11)}]`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FP category (0xD0060E): ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`    errNo: ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`    SP: ${hex(cpu.sp)}`);
  console.log('');

  // Tracking state
  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;
  const allPCs = [];                    // Every PC visited (capped at 10000)
  const pcHitCount = new Map();         // PC -> hit count
  const missingBlocks = new Map();      // PC -> hit count for missing blocks
  let fpPopHits = 0;
  let typeValidatorHits = 0;
  let errDomainLoaderHits = 0;
  let errNoSetPC = null;                // PC when errNo was set
  let errNoSetStep = null;
  let prevErrNo = 0;

  // Snapshots at key points
  const snapshots = [];

  function takeSnapshot(label, pc, step) {
    snapshots.push({
      label,
      pc,
      step,
      op1: hexBytes(mem, OP1_ADDR, 11),
      op2: hexBytes(mem, OP2_ADDR, 11),
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

    // Check for errNo changes
    const curErrNo = mem[ERR_NO_ADDR] & 0xff;
    if (curErrNo !== prevErrNo && curErrNo !== 0x00) {
      errNoSetPC = norm;
      errNoSetStep = stepCount;
      takeSnapshot(`errNo changed to ${hex(curErrNo, 2)} (${errName(curErrNo)})`, norm, stepCount);
      prevErrNo = curErrNo;
    }

    // Watch key addresses
    if (norm === FPPOP_ADDR) {
      fpPopHits++;
      if (fpPopHits <= 3) takeSnapshot(`FpPop entry (#${fpPopHits})`, norm, stepCount);
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
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: 50000,
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
  console.log(`    Total PC log entries: ${allPCs.length}`);
  console.log('');

  console.log('  ERROR STATE:');
  console.log(`    errNo: ${hex(finalErrNo, 2)} (${errName(finalErrNo)})`);
  console.log(`    E_Domain hit: ${finalErrNo === 0x84 ? 'YES' : 'NO'}`);
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
  console.log(`    OP1: [${hexBytes(mem, OP1_ADDR, 11)}]`);
  console.log(`    OP2: [${hexBytes(mem, OP2_ADDR, 11)}]`);
  console.log(`    OP1 = 4.0 (gcd(12,8)): ${is4 ? 'YES' : 'NO'}`);
  console.log(`    FP category (0xD0060E): ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log('');

  // ── Snapshots at key points ────────────────────────────────────────────

  if (snapshots.length > 0) {
    console.log('='.repeat(72));
    console.log('  SNAPSHOTS AT KEY POINTS');
    console.log('='.repeat(72));
    console.log('');
    for (const snap of snapshots) {
      console.log(`  [Step ${snap.step}] ${snap.label} (PC=${hex(snap.pc)})`);
      console.log(`    OP1: [${snap.op1}]`);
      console.log(`    OP2: [${snap.op2}]`);
      console.log(`    FP cat: ${hex(snap.fpCategory, 2)}, errNo: ${hex(snap.errNo, 2)}, A: ${hex(snap.regA, 2)}`);
      console.log(`    FPS ptr: ${hex(snap.fpsPtr)}, FPS base: ${hex(snap.fpsBase)}, SP: ${hex(snap.sp)}`);
      console.log('');
    }
  }

  // ── Last 50 PCs before termination ─────────────────────────────────────

  console.log('='.repeat(72));
  console.log('  LAST 50 PCs BEFORE TERMINATION');
  console.log('='.repeat(72));
  console.log('');
  const last50 = allPCs.slice(-50);
  for (let i = 0; i < last50.length; i++) {
    const pc = last50[i];
    const isKey = pc === FPPOP_ADDR || pc === TYPE_VALIDATOR_ADDR || pc === ERR_DOMAIN_LOADER;
    const isMiss = missingBlocks.has(pc);
    let tag = '';
    if (pc === FPPOP_ADDR) tag = ' <-- FpPop';
    else if (pc === TYPE_VALIDATOR_ADDR) tag = ' <-- TypeValidator';
    else if (pc === ERR_DOMAIN_LOADER) tag = ' <-- E_Domain loader';
    else if (pc === ERR_CATCH_ADDR) tag = ' <-- ERR_CATCH';
    else if (pc === FAKE_RET) tag = ' <-- FAKE_RET';
    if (isMiss) tag += ' [MISSING BLOCK]';
    console.log(`    ${hex(pc)}${tag}`);
  }
  console.log('');

  // ── Missing blocks ────────────────────────────────────────────────────

  const realMissing = [...missingBlocks.entries()]
    .filter(([a]) => a !== FAKE_RET && a !== ERR_CATCH_ADDR);

  console.log('='.repeat(72));
  console.log('  MISSING BLOCKS (potential seeds for next session)');
  console.log('='.repeat(72));
  console.log('');
  if (realMissing.length === 0) {
    console.log('    None found during execution.');
  } else {
    for (const [addr, count] of realMissing.sort((a, b) => b[1] - a[1])) {
      // Check the ROM bytes at this address to identify what instruction is there
      const romOff = addr;
      const romBytesAtAddr = romOff < 0x400000
        ? hexBytes(romBytes, romOff, 8)
        : '(RAM area)';
      console.log(`    ${hex(addr)} (hit ${count}x) — ROM bytes: [${romBytesAtAddr}]`);
    }
  }
  console.log('');

  // ── All unique PCs sorted by hit count (top 30) ────────────────────────

  console.log('='.repeat(72));
  console.log('  TOP 30 MOST-HIT PCs');
  console.log('='.repeat(72));
  console.log('');
  const sorted = [...pcHitCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [pc, count] of sorted) {
    let tag = '';
    if (pc === FPPOP_ADDR) tag = ' (FpPop)';
    else if (pc === TYPE_VALIDATOR_ADDR) tag = ' (TypeValidator)';
    else if (pc === ERR_DOMAIN_LOADER) tag = ' (E_Domain loader)';
    else if (pc === GCD_DIRECT_ADDR) tag = ' (gcd handler)';
    if (missingBlocks.has(pc)) tag += ' [MISSING]';
    console.log(`    ${hex(pc)}: ${count}x${tag}`);
  }
  console.log('');

  // ── Call flow: unique PCs in order of first appearance (first 100) ─────

  console.log('='.repeat(72));
  console.log('  CALL FLOW: First 100 unique PCs in execution order');
  console.log('='.repeat(72));
  console.log('');
  const seen = new Set();
  let flowCount = 0;
  for (const pc of allPCs) {
    if (seen.has(pc)) continue;
    seen.add(pc);
    flowCount++;
    if (flowCount > 100) break;
    let tag = '';
    if (pc === FPPOP_ADDR) tag = ' <-- FpPop';
    else if (pc === TYPE_VALIDATOR_ADDR) tag = ' <-- TypeValidator';
    else if (pc === ERR_DOMAIN_LOADER) tag = ' <-- E_Domain loader';
    else if (pc === GCD_DIRECT_ADDR) tag = ' <-- gcd handler entry';
    if (missingBlocks.has(pc)) tag += ' [MISSING BLOCK]';
    console.log(`    ${hex(pc)}${tag}`);
  }
  console.log('');

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  gcd(12,8) = 4.0: ${is4 ? 'YES' : 'NO'}`);
  console.log(`  E_Domain raised: ${finalErrNo === 0x84 ? 'YES' : 'NO'}`);
  console.log(`  FpPop executed: ${fpPopHits > 0 ? `YES (${fpPopHits}x)` : 'NO'}`);
  console.log(`  Missing blocks that need seeds: ${realMissing.length}`);
  if (realMissing.length > 0) {
    console.log('  Seed candidates:');
    for (const [addr, count] of realMissing.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${hex(addr)} (${count}x)`);
    }
  }
  console.log('');
  console.log('=== Phase 142 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
