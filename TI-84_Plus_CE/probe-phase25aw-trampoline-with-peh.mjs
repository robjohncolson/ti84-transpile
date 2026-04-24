#!/usr/bin/env node

/**
 * Phase 25AW: trampoline + fixed outer error frame + preinstalled
 * PushErrorHandler-style inner catch probe.
 *
 * This reuses the cold-boot + MEM_INIT scaffold from the Phase 25AV probes and
 * compares four scenarios around ParseInp / the 0x0586E3 trampoline:
 *   A. Trampoline with only the fixed outer catch frame at 0xD1A850
 *   B. Direct ParseInp with OP1 cleared to zeros
 *   C. Trampoline with the fixed outer frame plus an inner simplified
 *      PushErrorHandler frame that catches to 0x099929
 *   D. Direct ParseInp with OP1 pre-seeded to the List bytes written by the
 *      trampoline path
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
const INNER_CATCH_ADDR = 0x099929;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const SCRATCH_TOKEN_BASE = 0xd00800;
const DEEP_ERRFRAME_BASE = 0xd1a850;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const LIST_PRESEED_OP1 = Uint8Array.from([0x05, 0x00, 0x23, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_BUDGET = 100000;
const DIRECT_BUDGET = 2000;
const TRAMPOLINE_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const OP1_TARGET = 5.0;
const OP1_TOLERANCE = 1e-9;

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
  for (let i = 0; i < len; i++) {
    parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, value) { mem[addr] = value & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function formatValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function formatTermination(termination) {
  if (termination === 'err_caught') return 'ERR_CATCH';
  if (termination === 'fake_ret') return 'FAKE_RET';
  if (termination === 'max_steps') return 'budget';
  return termination ?? 'unknown';
}

function decodeOp1(mem) {
  try {
    return readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function isFive(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value - OP1_TARGET) <= OP1_TOLERANCE;
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

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') return;
    throw error;
  }

  throw new Error('MEM_INIT did not return');
}

function seedTokens(mem) {
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);
}

function clearOp1(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
}

function setOp1(mem, bytes) {
  mem.set(bytes, OP1_ADDR);
}

function installSimpleErrFrame(mem, frameBase, catchAddr) {
  mem.fill(0x00, frameBase, frameBase + 6);
  write24(mem, frameBase + 3, catchAddr);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    frameBase,
    frameBytes: hexBytes(mem, frameBase, 6),
  };
}

function placeReturnAddress(mem, sp, returnPc = FAKE_RET) {
  write24(mem, sp, returnPc);
  return {
    sp,
    bytes: hexBytes(mem, sp, 3),
  };
}

function setupScenarioEnv() {
  const env = createEnv();
  coldBoot(env.executor, env.cpu, env.mem);
  runMemInit(env.executor, env.cpu, env.mem);
  prepareCallState(env.cpu, env.mem);
  seedTokens(env.mem);
  clearOp1(env.mem);
  env.mem[ERR_NO_ADDR] = 0x00;
  return env;
}

function runObservedCall(executor, cpu, mem, { entry, budget }) {
  let finalPc = null;
  let stepCount = 0;
  let termination = 'unknown';
  let missingBlock = false;
  let hit099929 = false;
  let hit099929Step = null;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    const currentStep = typeof step === 'number' ? step : stepCount;
    finalPc = norm;
    stepCount = Math.max(stepCount, currentStep + 1);

    if (norm === INNER_CATCH_ADDR && !hit099929) {
      hit099929 = true;
      hit099929Step = currentStep;
    }

    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CATCH__');
    if (norm === FAKE_RET) throw new Error('__FAKE_RET__');
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

    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    finalPc = result.lastPc == null ? finalPc : (result.lastPc & 0xffffff);
  } catch (error) {
    if (error?.message === '__ERR_CATCH__') {
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else if (error?.message === '__FAKE_RET__') {
      termination = 'fake_ret';
      finalPc = FAKE_RET;
    } else {
      throw error;
    }
  }

  return {
    stepCount,
    termination,
    finalPc,
    missingBlock,
    hit099929,
    hit099929Step,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSP: read24(mem, ERR_SP_ADDR),
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded: decodeOp1(mem),
    sp: cpu.sp & 0xffffff,
  };
}

function runScenarioA() {
  const { mem, executor, cpu } = setupScenarioEnv();
  placeReturnAddress(mem, cpu.sp, FAKE_RET);
  const outerFrame = installSimpleErrFrame(mem, DEEP_ERRFRAME_BASE, ERR_CATCH_ADDR);
  const run = runObservedCall(executor, cpu, mem, {
    entry: TRAMPOLINE_CALL,
    budget: TRAMPOLINE_BUDGET,
  });

  return {
    outerFrame,
    ...run,
  };
}

function runScenarioB() {
  const { mem, executor, cpu } = setupScenarioEnv();
  clearOp1(mem);
  placeReturnAddress(mem, cpu.sp, FAKE_RET);
  installSimpleErrFrame(mem, DEEP_ERRFRAME_BASE, ERR_CATCH_ADDR);

  return runObservedCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: DIRECT_BUDGET,
  });
}

function runScenarioC() {
  const { mem, executor, cpu } = setupScenarioEnv();

  const outerFrame = installSimpleErrFrame(mem, DEEP_ERRFRAME_BASE, ERR_CATCH_ADDR);

  // Emulate a caller that already installed PushErrorHandler before it CALLed
  // the 0x0586E3 trampoline. On entry to the trampoline, SP points at the
  // caller's return address, and the error frame lives above that return slot.
  const preCallSp = cpu.sp & 0xffffff;
  const innerFrameBase = (preCallSp - 6) & 0xffffff;
  const innerFrame = installSimpleErrFrame(mem, innerFrameBase, INNER_CATCH_ADDR);
  cpu.sp = (innerFrameBase - 3) & 0xffffff;
  placeReturnAddress(mem, cpu.sp, FAKE_RET);
  write24(mem, ERR_SP_ADDR, innerFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  const run = runObservedCall(executor, cpu, mem, {
    entry: TRAMPOLINE_CALL,
    budget: TRAMPOLINE_BUDGET,
  });

  return {
    outerFrame,
    innerFrame,
    ...run,
  };
}

function runScenarioD() {
  const { mem, executor, cpu } = setupScenarioEnv();
  setOp1(mem, LIST_PRESEED_OP1);
  placeReturnAddress(mem, cpu.sp, FAKE_RET);
  installSimpleErrFrame(mem, DEEP_ERRFRAME_BASE, ERR_CATCH_ADDR);

  return runObservedCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: DIRECT_BUDGET,
  });
}

function printScenario(log, title, result) {
  log(title);
  log(`  Steps: ${result.stepCount}, OP1: ${formatValue(result.op1Decoded)}, errNo: ${hex(result.errNo, 2)}`);
  log(`  Termination: ${formatTermination(result.termination)}`);
}

function looksLikeOuterCatchFailure(result) {
  return formatTermination(result.termination) === 'ERR_CATCH'
    && result.errNo === 0x8d
    && !isFive(result.op1Decoded);
}

async function main() {
  const log = (line = '') => console.log(line);

  const scenarioA = runScenarioA();
  const scenarioB = runScenarioB();
  const scenarioC = runScenarioC();
  const scenarioD = runScenarioD();

  printScenario(log, '=== Scenario A: Trampoline + outer catch only (baseline) ===', scenarioA);
  log(`  Error frame at ${hex(DEEP_ERRFRAME_BASE)}: [${scenarioA.outerFrame.frameBytes}]`);
  log();

  printScenario(log, '=== Scenario B: Direct ParseInp + OP1=zeros (control) ===', scenarioB);
  log();

  printScenario(log, '=== Scenario C: Trampoline + PushErrorHandler(0x099929) ===', scenarioC);
  log(`  Hit ${hex(INNER_CATCH_ADDR)}: ${scenarioC.hit099929 ? 'yes' : 'no'}`);
  log(`  Inner frame at ${hex(scenarioC.innerFrame.frameBase)}: [${scenarioC.innerFrame.frameBytes}]`);
  log();

  printScenario(log, '=== Scenario D: Direct ParseInp + OP1=List pre-seed ===', scenarioD);
  log();

  const op1ContentConfirmed = isFive(scenarioB.op1Decoded)
    && formatTermination(scenarioB.termination) === 'FAKE_RET'
    && looksLikeOuterCatchFailure(scenarioA)
    && looksLikeOuterCatchFailure(scenarioD);
  const pushErrorHandlerWorks = scenarioC.hit099929
    && formatTermination(scenarioC.termination) === 'FAKE_RET'
    && isFive(scenarioC.op1Decoded);

  log('=== VERDICT ===');
  log(`  OP1 content is the divergence: ${op1ContentConfirmed ? 'confirmed' : 'disproved'}`);
  log(`  PushErrorHandler catch at ${hex(INNER_CATCH_ADDR)} works: ${pushErrorHandlerWorks ? 'yes' : 'no'}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
