#!/usr/bin/env node

/**
 * Phase 25AU: Mid-execution snapshot probe.
 *
 * Hypothesis: ParseInp SUCCEEDS via the trampoline, but the probe never
 * detects it because ParseInp RETs to 0x0586E6 (the instruction after
 * CALL 0x099910 in the common tail), NOT to FAKE_RET. The post-ParseInp
 * common-tail code then triggers the allocator loop.
 *
 * This probe runs ONE scenario: trampoline entry at 0x0586E3, SP=0xD1A875.
 * It snapshots OP1/errNo/SP/FPS/OPBase at step milestones around the
 * expected ParseInp return (~step 925), and tracks when specific PCs are hit.
 *
 * If 0x0586E6 is hit AND OP1=5.0 at that moment, ParseInp succeeds via
 * the trampoline and the allocator loop is a POST-ParseInp issue.
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
const POST_PARSEINP_PC = 0x0586e6;

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
const CALL_BUDGET = 5000;
const MAX_LOOP_ITER = 8192;

const ALLOCATOR_REGION_START = 0x082200;
const ALLOCATOR_REGION_END = 0x082900;

const MILESTONE_STEPS = [900, 910, 920, 925, 930, 940, 950, 1000, 1050, 1100];

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

function snapshotState(mem, cpu) {
  let op1Decoded;
  try {
    op1Decoded = readReal(wrapMem(mem), OP1_ADDR);
  } catch (e) {
    op1Decoded = `readReal error: ${e?.message ?? e}`;
  }
  return {
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    sp: cpu.sp & 0xffffff,
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
  };
}

function formatSnapshot(s) {
  return `OP1=[${s.op1Bytes}] (${formatNumber(s.op1Decoded)}) errNo=${hex(s.errNo, 2)} SP=${hex(s.sp)} FPS=${hex(s.fps)} OPBase=${hex(s.opBase)}`;
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
  };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AU: Mid-Execution Snapshot — Trampoline entry at 0x0586E3, SP=0xD1A875 ===');
  log(`Tokens: [${Array.from(INPUT_TOKENS, b => b.toString(16).padStart(2, '0')).join(' ')}] at ${hex(SCRATCH_TOKEN_BASE)}`);
  log(`endPC=${hex(SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1)} (AT final 0x3F byte)`);
  log(`FAKE_RET=${hex(FAKE_RET)} ERR_CATCH=${hex(ERR_CATCH_ADDR)} budget=${CALL_BUDGET}`);
  log(`Monitoring: ParseInp entry (${hex(PARSEINP_ENTRY)}), post-ParseInp (${hex(POST_PARSEINP_PC)}), allocator region (${hex(ALLOCATOR_REGION_START)}-${hex(ALLOCATOR_REGION_END)})`);
  log();

  // --- Setup ---
  const { mem, executor, cpu } = createEnv();
  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitDone = false;
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
    if (e?.message === '__MEMINIT_RET__') memInitDone = true;
    else throw e;
  }
  if (!memInitDone) throw new Error('MEM_INIT did not return');
  log('MEM_INIT complete.');
  log();

  // --- Prepare trampoline scenario ---
  prepareCallState(cpu, mem);
  seedScenario(mem, cpu);

  // SP adjustment: set cpu.sp = 0xD1A875 (STACK_RESET_TOP - 9)
  cpu.sp = STACK_RESET_TOP - 9; // 0xD1A875
  // Re-write return address at new SP
  write24(mem, cpu.sp, FAKE_RET);
  // Re-write error frame
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);

  log(`Entry: ${hex(TRAMPOLINE_CALL)}, SP=${hex(cpu.sp & 0xffffff)}`);
  log();

  // --- Run with detailed tracking ---
  const allPcs = [];           // {pc, step}
  const stepSnapshots = {};    // step -> snapshot
  let parseInpStep = null;
  let postParseInpStep = null;
  let postParseInpSnapshot = null;
  let allocatorStep = null;
  let allocatorSnapshot = null;
  let termination = 'unknown';
  let finalPc = null;
  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;

  const milestoneSet = new Set(MILESTONE_STEPS);

  try {
    const result = executor.runFrom(TRAMPOLINE_CALL, 'adl', {
      maxSteps: CALL_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        const s = typeof step === 'number' ? step : stepCount;
        stepCount = Math.max(stepCount, s + 1);
        finalPc = norm;

        allPcs.push({ pc: norm, step: s });

        // Track ParseInp entry
        if (norm === PARSEINP_ENTRY && parseInpStep === null) {
          parseInpStep = s;
        }

        // Track post-ParseInp PC (0x0586E6)
        if (norm === POST_PARSEINP_PC && postParseInpStep === null) {
          postParseInpStep = s;
          postParseInpSnapshot = snapshotState(mem, cpu);
        }

        // Track allocator region entry
        if (norm >= ALLOCATOR_REGION_START && norm < ALLOCATOR_REGION_END && allocatorStep === null) {
          allocatorStep = s;
          allocatorSnapshot = snapshotState(mem, cpu);
        }

        // Step milestone snapshots
        if (milestoneSet.has(s)) {
          stepSnapshots[s] = snapshotState(mem, cpu);
        }

        // Detect FAKE_RET and ERR_CATCH
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        const s = typeof step === 'number' ? step : stepCount;
        stepCount = Math.max(stepCount, s + 1);
        finalPc = norm;
        allPcs.push({ pc: norm, step: s });

        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
    });

    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    finalPc = result.lastPc ?? finalPc;
  } catch (e) {
    if (e?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
    } else if (e?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
    } else {
      throw e;
    }
  }

  // --- Output ---
  log('=== RESULTS ===');
  log();

  // Milestones
  if (parseInpStep !== null) {
    log(`MILESTONE: ParseInp (${hex(PARSEINP_ENTRY)}) entered at step ${parseInpStep}`);
  } else {
    log(`MILESTONE: ParseInp (${hex(PARSEINP_ENTRY)}) was NEVER entered`);
  }

  if (postParseInpStep !== null) {
    log(`MILESTONE: ${hex(POST_PARSEINP_PC)} hit at step ${postParseInpStep} (ParseInp returned!) — ${formatSnapshot(postParseInpSnapshot)}`);
  } else {
    log(`MILESTONE: ${hex(POST_PARSEINP_PC)} was NEVER hit (ParseInp did not return to common tail)`);
  }

  if (allocatorStep !== null) {
    log(`MILESTONE: Allocator region (${hex(ALLOCATOR_REGION_START)}) entered at step ${allocatorStep} — ${formatSnapshot(allocatorSnapshot)}`);
  } else {
    log(`MILESTONE: Allocator region was NEVER entered`);
  }

  log();
  log(`Termination: ${termination}, steps=${stepCount}, finalPc=${hex(finalPc ?? 0)}`);
  log(`returnHit=${returnHit} errCaught=${errCaught}`);
  log();

  // Final state
  const finalState = snapshotState(mem, cpu);
  log(`Final state: ${formatSnapshot(finalState)}`);
  log();

  // Step snapshots
  log('Step snapshots:');
  for (const step of MILESTONE_STEPS) {
    if (stepSnapshots[step]) {
      log(`  step ${step}: ${formatSnapshot(stepSnapshots[step])}`);
    } else {
      log(`  step ${step}: (not reached)`);
    }
  }
  log();

  // First 50 PCs
  const first50 = allPcs.slice(0, 50).map(e => hex(e.pc));
  log(`First 50 PCs: ${first50.join(' ')}`);
  log();

  // PCs around ParseInp return (steps 920-940)
  const aroundReturn = allPcs.filter(e => e.step >= 920 && e.step <= 940);
  log(`PCs around ParseInp return (steps 920-940):`);
  for (const e of aroundReturn) {
    log(`  step ${e.step}: ${hex(e.pc)}`);
  }
  log();

  // Last 20 PCs
  const last20 = allPcs.slice(-20).map(e => `${hex(e.pc)}@${e.step}`);
  log(`Last 20 PCs: ${last20.join(' ')}`);
  log();

  // --- Verdict ---
  log('=== VERDICT ===');
  if (postParseInpStep !== null && postParseInpSnapshot) {
    if (postParseInpSnapshot.op1Decoded === 5) {
      log('*** MAJOR FINDING: ParseInp SUCCEEDS via trampoline! ***');
      log(`OP1=5.0 at step ${postParseInpStep} when PC=${hex(POST_PARSEINP_PC)}.`);
      log('The allocator loop is a POST-ParseInp issue in the common-tail code.');
      log('This reframes the entire investigation — the trampoline entry works correctly.');
    } else {
      log(`ParseInp returned to common tail at step ${postParseInpStep}, but OP1=${formatNumber(postParseInpSnapshot.op1Decoded)} (expected 5.0).`);
      log('ParseInp may have failed or produced an unexpected result.');
    }
  } else if (allocatorStep !== null && parseInpStep !== null) {
    log(`ParseInp entered at step ${parseInpStep} but never returned to ${hex(POST_PARSEINP_PC)}.`);
    log(`Allocator entered at step ${allocatorStep}. ParseInp may still be running when allocator is hit.`);
  } else {
    log('Neither post-ParseInp PC nor allocator region was hit. Unexpected execution path.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
