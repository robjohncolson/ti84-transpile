#!/usr/bin/env node

/**
 * Phase 127 — Post-ParseInp Allocator Loop Investigation
 *
 * After ParseInp("2+3") returns OP1=5.0, the post-ParseInp cleanup calls
 * at 0x05822A / 0x083623 / 0x083764 trigger an infinite allocator loop at
 * 0x082745 because OPS overflow during ParseInp corrupts OPBase.
 *
 * This probe:
 *   Scenario 1: Dump allocator state after ParseInp, re-seed OPBase and
 *               friends, then continue from 0x05822A with 50K budget.
 *   Scenario 2: Skip post-ParseInp cleanup entirely (jump to FAKE_RET)
 *               and confirm OP1=5.0 is preserved.
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

const POST_PARSE_CALL_05822A = 0x05822a;
const POST_PARSE_CALL_083623 = 0x083623;
const POST_PARSE_CALL_083764 = 0x083764;
const ALLOCATOR_LOOP = 0x082745;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

// Allocator pointer addresses (from working probes)
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3" + end
const EXPECTED = 5.0;
const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 2000000;
const POST_PARSE_BUDGET = 50000;
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

// ── Allocator snapshot ─────────────────────────────────────────────────────

function snapshot(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMPCNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function printSnapshot(label, s) {
  console.log(`  [${label}]`);
  console.log(`    tempMem=${hex(s.tempMem)}  FPSbase=${hex(s.fpsBase)}  FPS=${hex(s.fps)}`);
  console.log(`    OPBase=${hex(s.opBase)}  OPS=${hex(s.ops)}`);
  console.log(`    pTempCnt=${hex(s.pTempCnt)}  pTemp=${hex(s.pTemp)}  progPtr=${hex(s.progPtr)}  newDataPtr=${hex(s.newDataPtr)}`);
  console.log(`    errSP=${hex(s.errSP)}  errNo=${hex(s.errNo, 2)}`);
  console.log(`    begPC=${hex(s.begPC)}  curPC=${hex(s.curPC)}  endPC=${hex(s.endPC)}`);
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

  // Count allocator loop hits
  const allocatorHits = pcHitCounts.get(ALLOCATOR_LOOP) || 0;
  const postParseHits = {
    '0x05822A': pcHitCounts.get(POST_PARSE_CALL_05822A) || 0,
    '0x083623': pcHitCounts.get(POST_PARSE_CALL_083623) || 0,
    '0x083764': pcHitCounts.get(POST_PARSE_CALL_083764) || 0,
  };

  return {
    label, returnHit, errCaught, missingBlock, termination, finalPc,
    stepCount, loopsForced, recentPcs, allocatorHits, postParseHits,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

// ── Pipeline: MEM_INIT + seed tokens + ParseInp ────────────────────────────

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

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 127: Post-ParseInp Allocator Loop Investigation ===');
  console.log(`Tokens: "2+3" = [${Array.from(INPUT_TOKENS, (b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log('');

  // ── Scenario 1: Re-seed allocator then continue from post-ParseInp ──

  console.log('--- Scenario 1: Re-seed OPBase after ParseInp, continue from 0x05822A ---');
  {
    const { mem, executor, cpu, wrap } = createRuntime();
    coldBoot(executor, cpu, mem);

    // MEM_INIT
    const mi = runMemInit(executor, cpu, mem);
    console.log(`  MEM_INIT: ${mi.termination} steps=${mi.stepCount}`);
    if (!mi.returnHit) {
      console.log('  ABORT: MEM_INIT did not return.');
      process.exitCode = 1;
      return;
    }
    const postMI = snapshot(mem);
    printSnapshot('post-MEM_INIT', postMI);
    console.log('');

    // Seed tokens + allocator + ParseInp
    seedTokens(mem);
    seedAllocator(mem);
    const parseRun = runParseInp(executor, cpu, mem);

    const postParse = snapshot(mem);
    const op1val = safeReadReal(wrap, OP1_ADDR);
    console.log(`  ParseInp: ${parseRun.termination} steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1val)}`);
    printSnapshot('post-ParseInp (BEFORE re-seed)', postParse);
    console.log('');

    if (!parseRun.returnHit && !parseRun.errCaught) {
      console.log('  ParseInp did not return or error-catch. Cannot continue.');
      console.log(`  final PC: ${hex(parseRun.finalPc)} recent: ${parseRun.recentPcs.map(hex).join(' ')}`);
      console.log('');
    }

    // Re-seed allocator pointers to post-MEM_INIT values
    console.log('  Re-seeding allocator to post-MEM_INIT values...');
    write24(mem, OPBASE_ADDR, postMI.opBase);
    write24(mem, OPS_ADDR, postMI.opBase);    // OPS = OPBase (stack empty)
    write24(mem, FPS_ADDR, postMI.fpsBase);   // FPS = FPSbase (stack empty)
    write24(mem, FPSBASE_ADDR, postMI.fpsBase);
    write24(mem, PTEMP_ADDR, postMI.progPtr); // pTemp = progPtr
    write24(mem, PROGPTR_ADDR, postMI.progPtr);
    write24(mem, NEWDATA_PTR_ADDR, postMI.newDataPtr);
    const reseeded = snapshot(mem);
    printSnapshot('post-reseed', reseeded);
    console.log('');

    // Continue from the first post-ParseInp call
    console.log('  Running from 0x05822A with 50K budget...');
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    const postRun = runCall(executor, cpu, mem, {
      entry: POST_PARSE_CALL_05822A, budget: POST_PARSE_BUDGET,
      returnPc: FAKE_RET, label: 'post-ParseInp',
    });

    const afterCleanup = snapshot(mem);
    const op1after = safeReadReal(wrap, OP1_ADDR);
    console.log(`  Result: ${postRun.termination} steps=${postRun.stepCount} errNo=${hex(postRun.errNo, 2)}`);
    console.log(`  returnHit=${postRun.returnHit} errCaught=${postRun.errCaught} missingBlock=${postRun.missingBlock}`);
    console.log(`  loopsForced=${postRun.loopsForced} allocatorLoopHits=${postRun.allocatorHits}`);
    console.log(`  postParseHits: ${JSON.stringify(postRun.postParseHits)}`);
    console.log(`  OP1 after: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1after)}`);
    console.log(`  finalPc=${hex(postRun.finalPc)}`);
    printSnapshot('post-cleanup', afterCleanup);
    if (!postRun.returnHit) {
      console.log(`  recent PCs: ${postRun.recentPcs.map(hex).join(' ')}`);
    }
    console.log('');

    const s1pass = postRun.returnHit && approxEqual(op1after, EXPECTED);
    console.log(`  Scenario 1 verdict: ${s1pass ? 'PASS' : 'FAIL'}`);
    console.log('');
  }

  // ── Scenario 2: Skip post-ParseInp cleanup entirely ──

  console.log('--- Scenario 2: Skip cleanup, verify OP1=5.0 preserved ---');
  {
    const { mem, executor, cpu, wrap } = createRuntime();
    coldBoot(executor, cpu, mem);

    const mi = runMemInit(executor, cpu, mem);
    console.log(`  MEM_INIT: ${mi.termination} steps=${mi.stepCount}`);
    if (!mi.returnHit) {
      console.log('  ABORT: MEM_INIT did not return.');
      process.exitCode = 1;
      return;
    }

    seedTokens(mem);
    seedAllocator(mem);
    const parseRun = runParseInp(executor, cpu, mem);

    const op1val = safeReadReal(wrap, OP1_ADDR);
    console.log(`  ParseInp: ${parseRun.termination} steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1val)}`);

    const parseOk = parseRun.returnHit || parseRun.errCaught;
    const op1is5 = approxEqual(op1val, EXPECTED);

    console.log(`  ParseInp returned/caught=${parseOk} OP1=5.0=${op1is5}`);
    console.log('');

    // Don't continue execution at all — just check OP1 directly
    const s2pass = op1is5;
    console.log(`  Scenario 2 verdict: ${s2pass ? 'PASS' : 'FAIL'} — OP1 is${op1is5 ? '' : ' NOT'} 5.0 after ParseInp (no cleanup needed)`);
    console.log('');
  }

  console.log('=== Phase 127 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
