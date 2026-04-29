#!/usr/bin/env node

/**
 * Phase 132 — FP Category Byte Seeds: gcd(12,8) via ParseInp
 *
 * Tests whether the 12 new FP category byte writer seeds enable the
 * FP dispatch system to compute gcd(12,8) = 4.  Monitors the FP
 * category byte at 0xD0060E before and after ParseInp.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

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
const PARSEINP_ENTRY = 0x099914;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

// gcd(12,8): 0xBB 0x18 = gcd(, 0x31 0x32 = "12", 0x2B = comma, 0x38 = "8", 0x11 = ), 0x3F = end
const INPUT_TOKENS = Uint8Array.from([0xbb, 0x18, 0x31, 0x32, 0x2b, 0x38, 0x11, 0x3f]);
const EXPECTED = 4.0;
const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 2000000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;
const TOLERANCE = 1e-6;

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

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(w, a) {
  try { return readReal(w, a); }
  catch (e) { return `readReal error: ${e?.message ?? e}`; }
}

const approxEqual = (a, b) =>
  typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;

function formatValue(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? v.toFixed(6).replace(/\.?0+$/, '')
    : String(v);
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu, wrap: memWrap(mem) };
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

// ── Run helper with sentinel detection ─────────────────────────────────────

function runCall(executor, cpu, mem, { entry, budget, returnPc, label = 'call' }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  let loopsForced = 0;
  const recentPcs = [];
  const pcHitCounts = new Map();

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
    if (norm === returnPc) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  };

  try {
    const res = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onLoopBreak() { loopsForced += 1; },
      onBlock(pc, _m, _meta, step) { notePc(pc, step); },
      onMissingBlock(pc, _m, step) { missingBlock = true; notePc(pc, step); },
    });
    finalPc = (res.lastPc ?? finalPc) & 0xffffff;
    termination = res.termination ?? termination;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; termination = 'return_hit'; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; termination = 'err_caught'; }
    else throw e;
  }

  return {
    label, returnHit, errCaught, missingBlock, termination, finalPc,
    stepCount, loopsForced, recentPcs, pcHitCounts,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

// ── Pipeline ──────────────────────────────────────────────────────────────

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY, budget: MEMINIT_BUDGET, returnPc: MEMINIT_RET, label: 'MEM_INIT',
  });
}

function seedTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
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

function runParseInp(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
  return runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY, budget: PARSEINP_BUDGET, returnPc: FAKE_RET, label: 'ParseInp',
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 132: FP Category Byte Seeds — gcd(12,8) ===');
  console.log(`Input tokens: [${Array.from(INPUT_TOKENS, (b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log(`Expected result: ${EXPECTED}`);
  console.log('');

  const { mem, executor, cpu, wrap } = createRuntime();
  coldBoot(executor, cpu, mem);

  // MEM_INIT
  const mi = runMemInit(executor, cpu, mem);
  console.log(`MEM_INIT: ${mi.termination} steps=${mi.stepCount} finalPc=${hex(mi.finalPc)}`);
  if (!mi.returnHit) {
    console.log('ABORT: MEM_INIT did not return.');
    process.exitCode = 1;
    return;
  }
  console.log('');

  // Seed tokens and allocator
  seedTokens(mem);
  seedAllocator(mem);

  // Read FP category byte before ParseInp
  const fpCatBefore = mem[FP_CATEGORY_ADDR] & 0xff;
  console.log(`FP category byte (0xD0060E) BEFORE ParseInp: ${hex(fpCatBefore, 2)}`);

  // Read OP1 before
  console.log(`OP1 BEFORE: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log('');

  // Run ParseInp
  const parseRun = runParseInp(executor, cpu, mem);
  console.log(`ParseInp: ${parseRun.termination} steps=${parseRun.stepCount} finalPc=${hex(parseRun.finalPc)}`);
  console.log(`  returnHit=${parseRun.returnHit} errCaught=${parseRun.errCaught} missingBlock=${parseRun.missingBlock}`);
  console.log(`  loopsForced=${parseRun.loopsForced} errNo=${hex(parseRun.errNo, 2)}`);
  console.log('');

  // Read FP category byte after ParseInp
  const fpCatAfter = mem[FP_CATEGORY_ADDR] & 0xff;
  console.log(`FP category byte (0xD0060E) AFTER ParseInp: ${hex(fpCatAfter, 2)}`);
  console.log(`FP category byte changed: ${fpCatBefore !== fpCatAfter ? 'YES' : 'NO'} (${hex(fpCatBefore, 2)} -> ${hex(fpCatAfter, 2)})`);
  console.log('');

  // Read OP1 and decode
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  console.log(`OP1 AFTER: [${op1Bytes}]`);

  const op1Value = safeReadReal(wrap, OP1_ADDR);
  console.log(`OP1 decoded: ${formatValue(op1Value)}`);
  console.log('');

  // Check recent PCs for key FP addresses
  const fpAddresses = [
    { addr: 0x06859b, label: 'FP handler cat 0x28 (gcd)' },
    { addr: 0x0689de, label: 'FP handler dispatcher' },
    { addr: 0x0689f9, label: 'Jump table base' },
    { addr: 0x095722, label: 'Wildcard cat writer (0xFF)' },
    { addr: 0x095765, label: 'Wildcard cat writer' },
    { addr: 0x0957ff, label: 'Wildcard cat writer' },
    { addr: 0x0989d0, label: 'Specific cat writer (0x1A)' },
    { addr: 0x07cad2, label: 'FP eval chain writer' },
    { addr: 0x07e105, label: 'FP eval chain writer' },
    { addr: 0x07e2a2, label: 'FP eval chain writer' },
    { addr: 0x07ec0d, label: 'FP eval chain writer' },
    { addr: 0x07f5d3, label: 'FP eval chain writer' },
  ];

  console.log('FP seed address hit counts:');
  for (const { addr, label } of fpAddresses) {
    const hits = parseRun.pcHitCounts.get(addr) || 0;
    console.log(`  ${hex(addr)}: ${hits} hits  (${label})`);
  }
  console.log('');

  // Last 16 PCs for debugging
  const lastPcs = parseRun.recentPcs.slice(-16);
  console.log(`Last 16 PCs: ${lastPcs.map((pc) => hex(pc)).join(' ')}`);
  console.log('');

  // Verdict
  const isCorrect = approxEqual(op1Value, EXPECTED);
  const returnedCleanly = parseRun.returnHit;
  const errored = parseRun.errCaught;

  console.log('=== VERDICT ===');
  console.log(`ParseInp returned cleanly: ${returnedCleanly ? 'YES' : 'NO'}`);
  console.log(`ParseInp error caught: ${errored ? 'YES (errNo=' + hex(parseRun.errNo, 2) + ')' : 'NO'}`);
  console.log(`OP1 = ${formatValue(op1Value)} (expected ${EXPECTED}): ${isCorrect ? 'PASS' : 'FAIL'}`);
  console.log(`FP category byte written: ${fpCatBefore !== fpCatAfter ? 'PASS' : 'FAIL (unchanged)'}`);

  if (isCorrect && returnedCleanly) {
    console.log('RESULT: gcd(12,8) = 4 -- FULL SUCCESS');
    process.exitCode = 0;
  } else if (returnedCleanly) {
    console.log(`RESULT: ParseInp returned but OP1=${formatValue(op1Value)} (expected ${EXPECTED})`);
    process.exitCode = 1;
  } else if (errored) {
    console.log(`RESULT: ParseInp hit error handler (errNo=${hex(parseRun.errNo, 2)})`);
    process.exitCode = 1;
  } else {
    console.log(`RESULT: ParseInp did not complete (termination=${parseRun.termination})`);
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
