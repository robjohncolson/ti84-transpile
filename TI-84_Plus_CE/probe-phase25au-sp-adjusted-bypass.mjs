#!/usr/bin/env node

/**
 * Phase 25AU: SP-adjusted bypass — fix the 3-byte SP mismatch.
 *
 * Session 105 proved that entering at 0x0586CE or 0x0586E3 shifts SP by -3
 * relative to the validated baseline (ParseInp at SP=0xD1A872). The CALL at
 * 0x0586E3 pushes 3 bytes, so ParseInp starts at SP=0xD1A86F instead of
 * 0xD1A872. This causes ParseInp to trigger the allocator loop and fail.
 *
 * Fix: raise SP by 3 bytes for bypass/trampoline scenarios so that after the
 * CALL frames, ParseInp starts at the same SP=0xD1A872 as the baseline.
 *
 * Three scenarios:
 *   C: direct ParseInp at 0x099914 — SP = STACK_RESET_TOP - 12 = 0xD1A872 (control)
 *   B: trampoline at 0x0586E3   — SP = STACK_RESET_TOP - 9  = 0xD1A875 (CALL pushes 3 → 0xD1A872)
 *   A: bypass at 0x0586CE       — SP = STACK_RESET_TOP - 9  = 0xD1A875 (net -3 to ParseInp)
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
const TRAMPOLINE_CALL = 0x0586e3;
const BYPASS_ENTRY = 0x0586ce;
const PREFUNC_ADDR = 0x07ff81;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const MEMINIT_BUDGET = 100000;
const CALL_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 40;

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

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
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

  return bootResult;
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
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

/**
 * Seed scenario using the EXACT validated-scratch pattern from probe-phase25ao.
 * Tokens at 0xD00800, endPC AT the final token byte (0xD00803), NOT past-end.
 *
 * MUST be called AFTER setting the final SP (including any SP adjustment).
 */
function seedScenario(mem, cpu) {
  // Clear scratch area and write tokens
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  // Set begPC/curPC/endPC — endPC points AT the last token byte (0x3F)
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1); // 0xD00803

  // Clear OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Set up return address on stack
  write24(mem, cpu.sp, FAKE_RET);

  // Error frame: errSP at sp-6, with ERR_CATCH_ADDR as handler
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainSp: cpu.sp & 0xffffff,
    errFrameBase,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function runCall(executor, cpu, mem, { entry, returnPc, budget }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  let hitParseInp = false;
  let hitTrampoline = false;
  let visitedPrefunc = false;
  const recentPcs = [];
  const milestones = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    if (norm === PARSEINP_ENTRY && !hitParseInp) {
      hitParseInp = true;
      milestones.push({ pc: norm, step: stepCount, sp: cpu.sp & 0xffffff });
    }
    if (norm === 0x099910 && !hitTrampoline) {
      hitTrampoline = true;
      milestones.push({ pc: norm, step: stepCount, sp: cpu.sp & 0xffffff });
    }
    if (norm === PREFUNC_ADDR) visitedPrefunc = true;

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = returnPc;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  let op1Decoded;
  try {
    op1Decoded = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    op1Decoded = `readReal error: ${error?.message ?? error}`;
  }

  return {
    entry,
    returnHit,
    errCaught,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded,
    hitParseInp,
    hitTrampoline,
    visitedPrefunc,
    milestones,
    recentPcs: recentPcs.map((pc) => hex(pc)),
    after: snapshotPointers(mem),
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const result = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    returnPc: MEMINIT_RET,
    budget: MEMINIT_BUDGET,
  });

  if (!result.returnHit) {
    throw new Error(`MEM_INIT failed: termination=${result.termination} finalPc=${hex(result.finalPc ?? 0)}`);
  }

  return result;
}

/**
 * Run a scenario with optional SP adjustment.
 *
 * @param {string} label - Scenario label
 * @param {number} entry - Entry point address
 * @param {number|null} spOverride - If non-null, override SP after prepareCallState
 */
function runScenario(label, entry, spOverride) {
  const { mem, executor, cpu } = createEnv();
  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  const postMemInit = snapshotPointers(mem);

  prepareCallState(cpu, mem);

  // Apply SP override for bypass/trampoline scenarios
  if (spOverride !== null) {
    cpu.sp = spOverride;
    // Clear the stack area from the new SP up to STACK_RESET_TOP
    const clearLen = STACK_RESET_TOP - cpu.sp;
    if (clearLen > 0) {
      mem.fill(0xff, cpu.sp, cpu.sp + clearLen);
    }
  }

  // Seed AFTER final SP is set (writes FAKE_RET at cpu.sp, error frame at cpu.sp - 6)
  const frame = seedScenario(mem, cpu);
  const seeded = snapshotPointers(mem);

  const call = runCall(executor, cpu, mem, {
    entry,
    returnPc: FAKE_RET,
    budget: CALL_BUDGET,
  });

  return { label, entry, spOverride, postMemInit, frame, seeded, call };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AU: SP-adjusted bypass — fix the 3-byte SP mismatch ===');
  log(`Seeding: tokens at ${hex(SCRATCH_TOKEN_BASE)}, endPC=${hex(SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1)} (AT final 0x3F byte)`);
  log(`Tokens: [${Array.from(INPUT_TOKENS, b => b.toString(16).padStart(2, '0')).join(' ')}]`);
  log(`FAKE_RET=${hex(FAKE_RET)} ERR_CATCH=${hex(ERR_CATCH_ADDR)} budget=${CALL_BUDGET}`);
  log(`STACK_RESET_TOP=${hex(STACK_RESET_TOP)}`);
  log(`  Control SP:  STACK_RESET_TOP - 12 = ${hex(STACK_RESET_TOP - 12)} (baseline)`);
  log(`  Adjusted SP: STACK_RESET_TOP - 9  = ${hex(STACK_RESET_TOP - 9)} (raised by 3 to compensate CALL)`);
  log();

  const scenarios = [
    { label: 'C (direct ParseInp — control)', entry: PARSEINP_ENTRY, spOverride: null },
    { label: 'B (SP-adjusted trampoline)', entry: TRAMPOLINE_CALL, spOverride: STACK_RESET_TOP - 9 },
    { label: 'A (SP-adjusted bypass)', entry: BYPASS_ENTRY, spOverride: STACK_RESET_TOP - 9 },
  ];

  const results = [];

  for (const { label, entry, spOverride } of scenarios) {
    log(`--- Scenario ${label} (entry=${hex(entry)}, spOverride=${spOverride !== null ? hex(spOverride) : 'none'}) ---`);
    const r = runScenario(label, entry, spOverride);
    results.push(r);

    log(`  Cold boot + MEM_INIT complete.`);
    log(`  post-MEM_INIT: ${formatPointerSnapshot(r.postMemInit)}`);
    log(`  seeded:        ${formatPointerSnapshot(r.seeded)}`);
    log(`  frame: mainSP=${hex(r.frame.mainSp)} [${r.frame.mainReturnBytes}] errFrame=${hex(r.frame.errFrameBase)} [${r.frame.errFrameBytes}]`);
    log(`  Tokens at ${hex(SCRATCH_TOKEN_BASE)}: [${hexBytes(new Uint8Array(INPUT_TOKENS.buffer), 0, INPUT_TOKENS.length)}]`);

    if (r.call.milestones.length > 0) {
      for (const m of r.call.milestones) {
        log(`  MILESTONE: hit ${hex(m.pc)} at step ${m.step} SP=${hex(m.sp)}`);
      }
    }

    log(`  Result: termination=${r.call.termination} steps=${r.call.stepCount}`);
    log(`  finalPc=${hex(r.call.finalPc ?? 0)} returnHit=${r.call.returnHit} errCaught=${r.call.errCaught} missingBlock=${r.call.missingBlock}`);
    log(`  hitParseInp=${r.call.hitParseInp} hitTrampoline=${r.call.hitTrampoline}`);
    log(`  errNo=${hex(r.call.errNo, 2)} OP1=[${r.call.op1Bytes}] decoded=${formatNumber(r.call.op1Decoded)}`);
    log(`  After: ${formatPointerSnapshot(r.call.after)}`);
    log(`  Recent PCs: ${r.call.recentPcs.slice(-20).join(' ')}`);
    log();
  }

  log('=== SUMMARY ===');
  for (const r of results) {
    const spStr = r.spOverride !== null ? `SP=${hex(r.spOverride)}` : `SP=${hex(STACK_RESET_TOP - 12)}`;
    log(`  ${r.label}: ${spStr} term=${r.call.termination} steps=${r.call.stepCount} errNo=${hex(r.call.errNo, 2)} OP1=${formatNumber(r.call.op1Decoded)} hitParseInp=${r.call.hitParseInp} returnHit=${r.call.returnHit}`);
  }

  // Check control matches expected
  const control = results[0];
  if (control.call.op1Decoded === 5 && control.call.errNo === 0x8d) {
    log('\nCONTROL OK: Scenario C matches expected (OP1=5.0, errNo=0x8D).');
  } else {
    log(`\nCONTROL MISMATCH: Scenario C returned OP1=${formatNumber(control.call.op1Decoded)} errNo=${hex(control.call.errNo, 2)} (expected 5.0, 0x8D).`);
  }

  // Check if A and B match control
  let allMatch = true;
  for (const r of results.slice(1)) {
    if (r.call.op1Decoded === control.call.op1Decoded && r.call.errNo === control.call.errNo) {
      log(`MATCH: ${r.label} matches control.`);
    } else {
      allMatch = false;
      log(`DIFF: ${r.label} differs from control — OP1=${formatNumber(r.call.op1Decoded)} errNo=${hex(r.call.errNo, 2)}`);
    }
  }

  if (allMatch && control.call.op1Decoded === 5 && control.call.errNo === 0x8d) {
    log('\nPASS: SP adjustment fixes the bypass path');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
