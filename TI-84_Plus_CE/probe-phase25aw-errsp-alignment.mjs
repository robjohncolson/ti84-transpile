#!/usr/bin/env node

/**
 * Phase 25AW: errSP alignment fix for trampoline ParseInp.
 *
 * ChkFindSym always fails (carry=1) after MEM_INIT because the VAT is empty.
 * JError reads errSP to find a PushErrorHandler-style frame (18 bytes).
 * JError's POP HL (at errSP+3) must land on the CALL-pushed return address
 * 0x099929 for ParseInp's error handler to catch correctly.
 *
 * Scenario A: Control — direct ParseInp, errSP=SP-6=0xD1A86C (correct)
 * Scenario B: Trampoline with WRONG errSP=0xD1A86C (POP HL reads 0x0586E7)
 * Scenario C: Trampoline with CORRECT errSP=0xD1A869 (POP HL reads 0x099929)
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

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;
const TRAMPOLINE_ENTRY = 0x0586e3;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MEMINIT_BUDGET = 100000;
const SCENARIO_A_BUDGET = 2000;
const SCENARIO_BC_BUDGET = 200000;
const MAX_LOOP_ITER = 8192;

const ALLOCATOR_LO = 0x082200;
const ALLOCATOR_HI = 0x082900;
const HALT_LOOP_ADDR = 0x006202;

// Trampoline call chain: 0x0586E3 → CALL 0x099910 → ... → 0x099914
// After ParseInp returns, execution goes back through the trampoline chain
// and eventually needs to reach FAKE_RET

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);

  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let done = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === (MEMINIT_RET & 0xffffff)) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === (MEMINIT_RET & 0xffffff)) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__MEMINIT_RET__') done = true;
    else throw e;
  }
  if (!done) throw new Error('MEM_INIT did not return');
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12; // 0xD1A872
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedTokens(mem) {
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
}

function setupErrSP(mem, errSpValue) {
  write24(mem, ERR_SP_ADDR, errSpValue);
  // Write safety-net catch address at errSP+3
  write24(mem, errSpValue + 3, ERR_CATCH_ADDR);
  // Zero the AF slot at errSP
  mem[errSpValue] = 0x00;
  mem[errSpValue + 1] = 0x00;
  mem[errSpValue + 2] = 0x00;
  mem[ERR_NO_ADDR] = 0x00;
}

function runScenario(executor, cpu, mem, entryPC, budget, opts = {}) {
  let steps = 0;
  let termination = 'budget_exhausted';
  let allocatorHits = 0;
  let hit099929 = false;
  const lastPcs = [];
  const pcCounts = new Map();

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    if (norm === 0x099929) hit099929 = true;
    steps = Math.max(steps, (step ?? 0) + 1);
    if (norm >= ALLOCATOR_LO && norm < ALLOCATOR_HI) allocatorHits++;
    if (norm === FAKE_RET) throw new Error('__FAKE_RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CATCH__');
    if (norm === HALT_LOOP_ADDR && (pcCounts.get(norm) || 0) > 50) throw new Error('__HALT_LOOP__');
    // Track last 20 PCs
    lastPcs.push(norm);
    if (lastPcs.length > 20) lastPcs.shift();
    // Track hottest PCs
    pcCounts.set(norm, (pcCounts.get(norm) || 0) + 1);
  };

  try {
    const result = executor.runFrom(entryPC, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) { notePc(pc, step); },
      onMissingBlock(pc, _mode, step) { notePc(pc, step); },
    });
    steps = Math.max(steps, result.steps ?? 0);
  } catch (e) {
    if (e?.message === '__FAKE_RET__') termination = 'FAKE_RET';
    else if (e?.message === '__ERR_CATCH__') termination = 'ERR_CATCH';
    else if (e?.message === '__HALT_LOOP__') termination = 'HALT_LOOP(0x006202)';
    else throw e;
  }

  let op1Value;
  try {
    op1Value = readReal(wrapMem(mem), OP1_ADDR);
  } catch (err) {
    op1Value = `readReal error: ${err?.message ?? err}`;
  }

  // Find top 10 hottest PCs
  const hotPcs = [...pcCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pc, count]) => `${hex(pc)}:${count}`);

  return {
    steps,
    termination,
    op1Value,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    allocatorHits,
    lastPcs: lastPcs.map(pc => hex(pc)),
    hotPcs,
    hit099929,
    finalSp: cpu.sp & 0xffffff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
  };
}

function formatOp1(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function isFive(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value - 5) < 1e-9;
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AW: errSP Alignment Fix for Trampoline ParseInp ===');
  log();

  // ── Scenario A: Control (direct ParseInp, errSP = SP-6 = 0xD1A86C) ──
  {
    log('=== Scenario A: Control (errSP=0xD1A86C) ===');
    const { mem, executor, cpu } = createEnv();
    coldBoot(executor, cpu, mem);
    runMemInit(executor, cpu, mem);
    prepareCallState(cpu, mem);
    seedTokens(mem);

    // SP = 0xD1A872, FAKE_RET at SP
    write24(mem, cpu.sp, FAKE_RET);

    // errSP = SP - 6 = 0xD1A86C
    const errSp = (cpu.sp - 6) & 0xffffff; // 0xD1A86C
    setupErrSP(mem, errSp);

    log(`  SP=${hex(cpu.sp)}, errSP=${hex(errSp)}`);

    const result = runScenario(executor, cpu, mem, PARSEINP_ENTRY, SCENARIO_A_BUDGET);
    log(`  Steps: ${result.steps}, OP1: ${formatOp1(result.op1Value)}, errNo: ${hex(result.errNo, 2)}`);
    log(`  Termination: ${result.termination}`);
    log(`  Allocator hits: ${result.allocatorHits}`);
    log(`  Hit 0x099929 (error catch): ${result.hit099929}`);
    log(`  Final SP: ${hex(result.finalSp)}, Final errSP: ${hex(result.finalErrSp)}`);
    log();
  }

  // ── Scenario B: Trampoline + WRONG errSP=0xD1A86C ──
  let resultB;
  {
    log('=== Scenario B: Trampoline + wrong errSP=0xD1A86C ===');
    const { mem, executor, cpu } = createEnv();
    coldBoot(executor, cpu, mem);
    runMemInit(executor, cpu, mem);
    prepareCallState(cpu, mem);
    seedTokens(mem);

    // SP = 0xD1A872, FAKE_RET at SP
    write24(mem, cpu.sp, FAKE_RET);

    // errSP = 0xD1A86C (same as control — WRONG for trampoline path)
    const errSp = (cpu.sp - 6) & 0xffffff; // 0xD1A86C
    setupErrSP(mem, errSp);

    log(`  SP=${hex(cpu.sp)}, errSP=${hex(errSp)}`);

    resultB = runScenario(executor, cpu, mem, TRAMPOLINE_ENTRY, SCENARIO_BC_BUDGET);
    log(`  Steps: ${resultB.steps}, OP1: ${formatOp1(resultB.op1Value)}, errNo: ${hex(resultB.errNo, 2)}`);
    log(`  Termination: ${resultB.termination}`);
    log(`  Allocator hits: ${resultB.allocatorHits}`);
    log(`  Hit 0x099929 (error catch): ${resultB.hit099929}`);
    log(`  Final SP: ${hex(resultB.finalSp)}, Final errSP: ${hex(resultB.finalErrSp)}`);
    if (resultB.termination !== 'FAKE_RET') {
      log(`  Last 20 PCs: ${resultB.lastPcs.join(' ')}`);
      log(`  Hot PCs: ${resultB.hotPcs.join(' | ')}`);
    }
    log();
  }

  // ── Scenario C: Trampoline + CORRECT errSP=0xD1A869 ──
  let resultC;
  {
    log('=== Scenario C: Trampoline + fixed errSP=0xD1A869 ===');
    const { mem, executor, cpu } = createEnv();
    coldBoot(executor, cpu, mem);
    runMemInit(executor, cpu, mem);
    prepareCallState(cpu, mem);
    seedTokens(mem);

    // SP = 0xD1A872, FAKE_RET at SP
    write24(mem, cpu.sp, FAKE_RET);

    // errSP = SP - 9 = 0xD1A869 (3 bytes lower to account for trampoline CALL)
    const errSp = (cpu.sp - 9) & 0xffffff; // 0xD1A869
    setupErrSP(mem, errSp);

    log(`  SP=${hex(cpu.sp)}, errSP=${hex(errSp)}`);

    resultC = runScenario(executor, cpu, mem, TRAMPOLINE_ENTRY, SCENARIO_BC_BUDGET);
    log(`  Steps: ${resultC.steps}, OP1: ${formatOp1(resultC.op1Value)}, errNo: ${hex(resultC.errNo, 2)}`);
    log(`  Termination: ${resultC.termination}`);
    log(`  Allocator hits: ${resultC.allocatorHits}`);
    log(`  Hit 0x099929 (error catch): ${resultC.hit099929}`);
    log(`  Final SP: ${hex(resultC.finalSp)}, Final errSP: ${hex(resultC.finalErrSp)}`);
    if (resultC.termination !== 'FAKE_RET') {
      log(`  Last 20 PCs: ${resultC.lastPcs.join(' ')}`);
      log(`  Hot PCs: ${resultC.hotPcs.join(' | ')}`);
    }
    log();
  }

  // ── VERDICT ──
  log('=== VERDICT ===');
  const errSpFixRoutesCorrectly = resultC.hit099929 && !resultB.hit099929;
  const errSpFixAvoidsAllocatorLoop = resultC.allocatorHits <= 30 && resultB.allocatorHits > 1000;
  const fullFixWorks = isFive(resultC.op1Value) && !isFive(resultB.op1Value);

  log(`  errSP alignment routes to 0x099929: ${errSpFixRoutesCorrectly ? 'YES' : 'NO'} (C=${resultC.hit099929}, B=${resultB.hit099929})`);
  log(`  errSP alignment avoids allocator loop: ${errSpFixAvoidsAllocatorLoop ? 'YES' : 'NO'} (C=${resultC.allocatorHits}, B=${resultB.allocatorHits})`);
  log(`  OP1=5 end-to-end via trampoline: ${fullFixWorks ? 'YES' : 'NO'}`);
  log(`  OP1 via trampoline with fix: ${formatOp1(resultC.op1Value)}`);
  log(`  OP1 via trampoline without fix: ${formatOp1(resultB.op1Value)}`);
  log();
  if (errSpFixRoutesCorrectly && !fullFixWorks) {
    log('  NOTE: errSP fix correctly routes JError to ParseInp error handler (0x099929),');
    log('  but the trampoline return chain does not reach FAKE_RET.');
    log(`  Control final SP=${hex(0xD1A875)}, Trampoline+fix final SP=${hex(resultC.finalSp)}`);
    log(`  Scenario C termination: ${resultC.termination}`);
    log('  The trampoline CALL pushes an extra 3-byte return addr, so after ParseInp returns,');
    log('  the trampoline\'s own return unwinds to an OS path that HALTs instead of FAKE_RET.');
    log('  Fix: place FAKE_RET where the trampoline return chain will actually land.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
