#!/usr/bin/env node

/**
 * Phase 138 P3 — Stat Pipeline Seed Verification
 *
 * Verifies that newly-seeded stat addresses now have transpiled blocks,
 * tests CreateRList and OneVar with the new blocks, and audits the
 * stat core range 0x094000-0x096000 for coverage gaps.
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

const CREATERL_ENTRY = 0x082398;
const CREATERL_RET = 0x7ffff2;

const ONEVAR_ENTRY = 0x0a9325;
const ONEVAR_RET = 0x7fffee;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const STAT_VARS_OFFSET_ADDR = 0xd0117f;
const STATS_VALID_ADDR = 0xd00089;
const TMEAN_SLOT = 0xd012a8;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const CREATERL_BUDGET = 50000;
const ONEVAR_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10.0
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20.0
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30.0
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40.0
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50.0
];

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const blockKey = (addr, mode = 'adl') =>
  (addr >>> 0).toString(16).padStart(6, '0') + ':' + mode;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function write16(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8a) return 'E_JError';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x8e) return 'E_StatPlot';
  if (code === 0x8f) return 'E_Halted';
  return `unknown(${hex(code, 2)})`;
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(m, a) {
  try {
    return readReal(memWrap(m), a);
  } catch (e) {
    return `readReal error: ${e?.message ?? e}`;
  }
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

// ── Generic run-call helper ────────────────────────────────────────────────

function runCall(executor, cpu, mem, { entry, budget, returnPc, label = 'call' }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];
  const missingBlocks = new Map();

  try {
    const res = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
    finalPc = res.lastPc ?? finalPc;
    termination = res.termination ?? termination;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; termination = 'return_hit'; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; termination = 'err_caught'; }
    else throw e;
  }

  return {
    returnHit, errCaught, termination, finalPc, stepCount, recentPcs, missingBlocks,
    a: cpu.a & 0xff, f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function outcome(run) {
  if (run.returnHit) return 'returned';
  if (run.errCaught) return `error caught (errNo=${hex(run.errNo, 2)} ${errName(run.errNo)})`;
  return `stalled (term=${run.termination} finalPc=${hex(run.finalPc)})`;
}

function logMissing(label, run) {
  if (run.missingBlocks.size === 0) return;
  console.log(`  ${label} missing blocks (${run.missingBlocks.size}):`);
  const sorted = [...run.missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
  for (const [addr, count] of sorted.slice(0, 15)) {
    console.log(`    ${hex(addr)}: ${count} hits`);
  }
}

function logLastPcs(label, run, n = 16) {
  const last = run.recentPcs.slice(-n);
  if (last.length === 0) return;
  console.log(`  ${label} last ${last.length} PCs: ${last.map(p => hex(p)).join(' ')}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 138 P3: Stat Pipeline Seed Verification ===');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part A: Block coverage checks for all seeded stat addresses
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Part A: Block coverage for stat seeds ---');
  const seedAddrs = [
    { name: 'OneVar',       addr: 0x0a9325 },
    { name: 'OneVars0',     addr: 0x0aa978 },
    { name: 'CreateRList',  addr: 0x082398 },
    { name: 'Sto_StatVar',  addr: 0x09a3bd },
    { name: 'StatCore0x94k', addr: 0x094000 },
    { name: 'TwoVars0',    addr: 0x0aaab8 },
    { name: 'InitStatAns',  addr: 0x0ab21b },
  ];

  let coveredCount = 0;
  for (const { name, addr } of seedAddrs) {
    const hasBlock = BLOCKS[blockKey(addr)] !== undefined;
    if (hasBlock) coveredCount++;
    console.log(`  ${name} (${hex(addr)}): ${hasBlock ? 'COVERED' : 'MISSING'}`);
  }
  console.log(`  Coverage: ${coveredCount}/${seedAddrs.length} seeded addresses have blocks`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part B: Boot + MEM_INIT
  // ═══════════════════════════════════════════════════════════════════════════

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  console.log('--- Boot + MEM_INIT ---');
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let meminitOk = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') meminitOk = true; else throw e;
  }
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return; }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part C: CreateRList test
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- CreateRList(L1, 5 elements) ---');
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu._hl = 5;
  seedErrFrame(cpu, mem, CREATERL_RET, ERR_CATCH_ADDR, 0);

  const createRun = runCall(executor, cpu, mem, {
    entry: CREATERL_ENTRY,
    budget: CREATERL_BUDGET,
    returnPc: CREATERL_RET,
    label: 'CreateRList',
  });

  console.log(`  CreateRList: ${outcome(createRun)}`);
  console.log(`  Steps: ${createRun.stepCount}, errNo: ${hex(createRun.errNo, 2)} (${errName(createRun.errNo)})`);
  console.log(`  DE=${hex(createRun.de)} HL=${hex(createRun.hl)}`);
  logMissing('CreateRList', createRun);
  logLastPcs('CreateRList', createRun);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part D: OneVar test (manual list fallback if CreateRList fails)
  // ═══════════════════════════════════════════════════════════════════════════

  if (createRun.returnHit) {
    // CreateRList succeeded — populate the list at DE
    const dataPtr = createRun.de;
    console.log(`  Populating list data at ${hex(dataPtr)}`);
    write16(mem, dataPtr, 5);
    for (let i = 0; i < BCD_VALUES.length; i++) {
      mem.set(BCD_VALUES[i], dataPtr + 2 + i * 9);
    }
  } else {
    // Fallback: manual list creation at userMem
    console.log('--- Fallback: Manual list creation ---');
    prepareCallState(cpu, mem);
    seedAllocator(mem);
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
    if (!ok) { console.log('ABORT: MEM_INIT retry failed'); process.exitCode = 1; return; }

    const dataPtr = USERMEM_ADDR;
    write16(mem, dataPtr, 5);
    for (let i = 0; i < BCD_VALUES.length; i++) {
      mem.set(BCD_VALUES[i], dataPtr + 2 + i * 9);
    }
    write24(mem, NEWDATA_PTR_ADDR, dataPtr + 2 + 5 * 9);
    console.log(`  Manual list at ${hex(dataPtr)}, 5 elements`);
  }

  // Run OneVar
  console.log('');
  console.log('--- OneVar (0x0A9325) ---');
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET, ERR_CATCH_ADDR, 0);
  mem[ERR_NO_ADDR] = 0x00;
  mem.fill(0x00, STAT_VARS_OFFSET_ADDR, STAT_VARS_OFFSET_ADDR + 0x200);

  const onevarRun = runCall(executor, cpu, mem, {
    entry: ONEVAR_ENTRY,
    budget: ONEVAR_BUDGET,
    returnPc: ONEVAR_RET,
    label: 'OneVar',
  });

  console.log(`  OneVar: ${outcome(onevarRun)}`);
  console.log(`  Steps: ${onevarRun.stepCount}, errNo: ${hex(onevarRun.errNo, 2)} (${errName(onevarRun.errNo)})`);
  console.log(`  DE=${hex(onevarRun.de)} HL=${hex(onevarRun.hl)} A=${hex(onevarRun.a, 2)}`);
  logMissing('OneVar', onevarRun);
  logLastPcs('OneVar', onevarRun);

  // Check stat var slots
  console.log('');
  console.log('--- Stat variable slots ---');
  console.log(`  statsValid byte (${hex(STATS_VALID_ADDR)}): ${hex(mem[STATS_VALID_ADDR] & 0xff, 2)} (bit6=${(mem[STATS_VALID_ADDR] >> 6) & 1})`);

  const expectedStats = [
    { name: 'n (count)',  token: 0x00, expected: 5.0 },
    { name: 'meanX',     token: 0x21, expected: 30.0 },
    { name: 'sumX',      token: 0x23, expected: 150.0 },
    { name: 'sumX2',     token: 0x25, expected: 5500.0 },
    { name: 'Sx',        token: 0x27, expected: null },
    { name: 'sigmaX',    token: 0x29, expected: null },
    { name: 'minX',      token: 0x2b, expected: 10.0 },
    { name: 'maxX',      token: 0x2d, expected: 50.0 },
  ];

  let statMatchCount = 0;
  for (const stat of expectedStats) {
    const slotAddr = STAT_VARS_OFFSET_ADDR + 9 * stat.token;
    const val = safeReadReal(mem, slotAddr);
    const bytes = hexBytes(mem, slotAddr, 9);
    let tag = '';
    if (stat.expected !== null && typeof val === 'number' && Math.abs(val - stat.expected) < 0.01) {
      tag = 'MATCH';
      statMatchCount++;
    }
    console.log(`  ${stat.name} (token=${hex(stat.token, 2)}, addr=${hex(slotAddr)}): ${val} [${bytes}] ${tag}`);
  }

  // Non-zero slots scan
  console.log('');
  let nonZeroCount = 0;
  for (let token = 0; token < 64; token++) {
    const slotAddr = STAT_VARS_OFFSET_ADDR + 9 * token;
    let allZero = true;
    for (let b = 0; b < 9; b++) {
      if (mem[slotAddr + b] !== 0) { allZero = false; break; }
    }
    if (!allZero) nonZeroCount++;
  }
  console.log(`  Non-zero stat slots (first 64): ${nonZeroCount}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Part E: Stat core range audit (0x094000 - 0x096000)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('--- Part E: Stat core range audit 0x094000-0x096000 ---');

  const RANGE_START = 0x094000;
  const RANGE_END = 0x096000;
  const RANGE_SIZE = RANGE_END - RANGE_START;

  let erasedBytes = 0;
  let codeBytes = 0;
  for (let i = RANGE_START; i < RANGE_END; i++) {
    if (romBytes[i] === 0xff) erasedBytes++;
    else codeBytes++;
  }
  console.log(`  Total bytes: ${RANGE_SIZE}`);
  console.log(`  Code/data bytes (non-0xFF): ${codeBytes}`);
  console.log(`  Erased bytes (0xFF): ${erasedBytes}`);

  // Find non-0xFF runs of 4+ bytes as candidate seeds
  const codeRuns = [];
  let runStart = -1;
  for (let i = RANGE_START; i <= RANGE_END; i++) {
    if (i < RANGE_END && romBytes[i] !== 0xff) {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1) {
        const runLen = i - runStart;
        if (runLen >= 4) {
          codeRuns.push({ start: runStart, length: runLen });
        }
        runStart = -1;
      }
    }
  }

  console.log(`  Code runs (>= 4 bytes): ${codeRuns.length}`);

  // Check which runs have block coverage
  let coveredRuns = 0;
  let uncoveredRuns = 0;
  const uncoveredCandidates = [];

  for (const run of codeRuns) {
    // Check if any address in this run has a block
    let hasCoverage = false;
    for (let addr = run.start; addr < run.start + run.length; addr++) {
      if (BLOCKS[blockKey(addr)] !== undefined) {
        hasCoverage = true;
        break;
      }
    }
    if (hasCoverage) {
      coveredRuns++;
    } else {
      uncoveredRuns++;
      uncoveredCandidates.push(run);
    }
  }

  console.log(`  Covered runs: ${coveredRuns}`);
  console.log(`  Uncovered runs: ${uncoveredRuns}`);

  if (uncoveredCandidates.length > 0) {
    console.log('');
    console.log('  First 10 uncovered code runs (candidate seeds):');
    for (const run of uncoveredCandidates.slice(0, 10)) {
      const bytes = hexBytes(romBytes, run.start, Math.min(run.length, 8));
      console.log(`    ${hex(run.start)}: ${run.length} bytes [${bytes}${run.length > 8 ? ' ...' : ''}]`);
    }
  }

  // Check block coverage at specific interesting addresses in this range
  console.log('');
  console.log('  Block coverage at 256-byte intervals:');
  let intervalCovered = 0;
  let intervalTotal = 0;
  for (let addr = RANGE_START; addr < RANGE_END; addr += 0x100) {
    intervalTotal++;
    if (BLOCKS[blockKey(addr)] !== undefined) {
      intervalCovered++;
    }
  }
  console.log(`  ${intervalCovered}/${intervalTotal} 256-byte interval starts have blocks`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Seeded stat addresses covered: ${coveredCount}/${seedAddrs.length}`);
  console.log(`  CreateRList outcome: ${outcome(createRun)}`);
  console.log(`  OneVar outcome: ${outcome(onevarRun)}`);
  console.log(`  OneVar steps: ${onevarRun.stepCount}`);
  console.log(`  OneVar errNo: ${hex(onevarRun.errNo, 2)} (${errName(onevarRun.errNo)})`);
  console.log(`  OneVar missing blocks: ${onevarRun.missingBlocks.size}`);
  console.log(`  Stat match count: ${statMatchCount}/${expectedStats.length}`);
  console.log(`  Non-zero stat slots: ${nonZeroCount}`);
  console.log(`  Stat core 0x094000-0x096000: ${codeBytes}/${RANGE_SIZE} code bytes, ${coveredRuns} covered / ${uncoveredRuns} uncovered runs`);
  console.log('');
  console.log('=== Phase 138 P3 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
