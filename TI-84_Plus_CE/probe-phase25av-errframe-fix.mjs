#!/usr/bin/env node

/**
 * Phase 25AV: error-frame placement fix probe.
 *
 * This reuses the Phase 25AU cold-boot + MEM_INIT + token-seeding scaffold,
 * then compares four scenarios:
 *   A. Direct ParseInp with the standard SP-6 frame
 *   B. Trampoline entry with the known-clobbered SP-6 frame at 0xD1A86F
 *   C. Trampoline entry with a lower frame at 0xD1A860
 *   D. Trampoline entry with an even lower frame at 0xD1A850
 *
 * The goal is to see whether moving errSP below the deepest trampoline CALL
 * chain causes thrown errors to land at ERR_CATCH_ADDR instead of falling
 * through into the common-tail / allocator path.
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
const CLOBBERED_HANDLER_PC = 0x0586e7;
const ERROR_THROW_PC = 0x061d3a;
const JERROR_PC = 0x061db2;

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
const DIRECT_BUDGET = 2000;
const TRAMPOLINE_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;

const ALLOCATOR_REGION_START = 0x082200;
const ALLOCATOR_REGION_END = 0x082900;

const CLOBBERED_ERRFRAME_BASE = 0xd1a86f;
const FIXED_ERRFRAME_BASE = 0xd1a860;
const DEEP_ERRFRAME_BASE = 0xd1a850;

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

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatStep(value) {
  return typeof value === 'number' ? `${value}` : 'n/a';
}

function decodeOp1(mem) {
  try {
    return readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
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
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  write24(mem, cpu.sp, FAKE_RET);

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

function runMemInit(executor, cpu, mem) {
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
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') memInitDone = true;
    else throw error;
  }

  if (!memInitDone) throw new Error('MEM_INIT did not return');
}

function installErrorFrame(mem, errFrameBase) {
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase, 0x000000);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
  return hexBytes(mem, errFrameBase, 6).toUpperCase();
}

function setupScenarioEnv() {
  const env = createEnv();
  coldBoot(env.executor, env.cpu, env.mem);
  runMemInit(env.executor, env.cpu, env.mem);
  prepareCallState(env.cpu, env.mem);
  const seeded = seedScenario(env.mem, env.cpu);
  return { ...env, seeded };
}

function createTracker() {
  return {
    parseInpHit: false,
    parseInpStep: null,
    errCatchHit: false,
    errCatchStep: null,
    errorThrown: false,
    errorThrownStep: null,
    jErrorHit: false,
    jErrorStep: null,
    allocatorSteps: 0,
    postParseInpHit: false,
    postParseInpStep: null,
    clobberedHandlerHit: false,
    clobberedHandlerStep: null,
    fakeRetHit: false,
    fakeRetStep: null,
  };
}

function noteTrackedPc(tracker, norm, step) {
  if (norm === PARSEINP_ENTRY && !tracker.parseInpHit) {
    tracker.parseInpHit = true;
    tracker.parseInpStep = step;
  }
  if (norm === ERROR_THROW_PC && !tracker.errorThrown) {
    tracker.errorThrown = true;
    tracker.errorThrownStep = step;
  }
  if (norm === JERROR_PC && !tracker.jErrorHit) {
    tracker.jErrorHit = true;
    tracker.jErrorStep = step;
  }
  if (norm === POST_PARSEINP_PC && !tracker.postParseInpHit) {
    tracker.postParseInpHit = true;
    tracker.postParseInpStep = step;
  }
  if (norm === CLOBBERED_HANDLER_PC && !tracker.clobberedHandlerHit) {
    tracker.clobberedHandlerHit = true;
    tracker.clobberedHandlerStep = step;
  }
  if (norm >= ALLOCATOR_REGION_START && norm < ALLOCATOR_REGION_END) {
    tracker.allocatorSteps += 1;
  }
  if (norm === ERR_CATCH_ADDR) {
    tracker.errCatchHit = true;
    if (tracker.errCatchStep === null) tracker.errCatchStep = step;
    throw new Error('__ERR_CATCH__');
  }
  if (norm === FAKE_RET) {
    tracker.fakeRetHit = true;
    if (tracker.fakeRetStep === null) tracker.fakeRetStep = step;
    throw new Error('__FAKE_RET__');
  }
}

function runObservedCall(executor, cpu, mem, { entry, budget }) {
  const tracker = createTracker();
  let finalPc = null;
  let termination = 'unknown';
  let stepCount = 0;
  let missingBlock = false;

  const recordPc = (pc, step) => {
    const norm = pc & 0xffffff;
    const currentStep = typeof step === 'number' ? step : stepCount;
    stepCount = Math.max(stepCount, currentStep + 1);
    finalPc = norm;
    noteTrackedPc(tracker, norm, currentStep);
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        recordPc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        recordPc(pc, step);
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
    ...tracker,
    finalPc,
    termination,
    stepCount,
    missingBlock,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSPAfter: read24(mem, ERR_SP_ADDR),
    op1Decoded: decodeOp1(mem),
    sp: cpu.sp & 0xffffff,
  };
}

function runScenarioA() {
  const { mem, executor, cpu, seeded } = setupScenarioEnv();
  const errSPBefore = read24(mem, ERR_SP_ADDR);
  const run = runObservedCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: DIRECT_BUDGET,
  });

  return {
    id: 'A',
    label: 'Control (direct ParseInp, standard frame)',
    errFrameBase: seeded.errFrameBase,
    errSPBefore,
    ...run,
  };
}

function runTrampolineScenario({ id, label, errFrameBase }) {
  const { mem, executor, cpu } = setupScenarioEnv();

  cpu.sp = STACK_RESET_TOP - 9;
  write24(mem, cpu.sp, FAKE_RET);

  const preFrame = installErrorFrame(mem, errFrameBase);
  const run = runObservedCall(executor, cpu, mem, {
    entry: TRAMPOLINE_CALL,
    budget: TRAMPOLINE_BUDGET,
  });
  const postFrame = hexBytes(mem, errFrameBase, 6).toUpperCase();

  return {
    id,
    label,
    errFrameBase,
    preFrame,
    postFrame,
    frameChanged: preFrame !== postFrame,
    ...run,
  };
}

function printScenarioA(log, scenario) {
  log(`--- Scenario ${scenario.id}: ${scenario.label} ---`);
  log(`  errFrameBase=${hex(scenario.errFrameBase)}, errSP=${hex(scenario.errSPBefore)}`);
  log(`  Result: ${scenario.stepCount} steps, OP1=${formatNumber(scenario.op1Decoded)}, errNo=${hex(scenario.errNo, 2)}, ERR_CATCH hit: ${formatYesNo(scenario.errCatchHit)}`);
  log();
}

function printTrampolineScenario(log, scenario, { showClobbered = false } = {}) {
  log(`--- Scenario ${scenario.id}: ${scenario.label} ---`);
  log(`  Pre-run frame: [${scenario.preFrame}]`);
  log(`  Post-run frame: [${scenario.postFrame}]${showClobbered ? ` (clobbered? ${formatYesNo(scenario.frameChanged)})` : ''}`);
  log(`  Result: ${scenario.stepCount} steps, OP1=${formatNumber(scenario.op1Decoded)}, errNo=${hex(scenario.errNo, 2)}, ERR_CATCH hit: ${formatYesNo(scenario.errCatchHit)}`);
  log(`  Allocator steps: ${scenario.allocatorSteps}`);
  log(`  ParseInp entry: ${formatYesNo(scenario.parseInpHit)}${scenario.parseInpHit ? ` @ step ${formatStep(scenario.parseInpStep)}` : ''}`);
  log(`  ERR_THROW ${hex(ERROR_THROW_PC)}: ${formatYesNo(scenario.errorThrown)}${scenario.errorThrown ? ` @ step ${formatStep(scenario.errorThrownStep)}` : ''}`);
  log(`  JError ${hex(JERROR_PC)}: ${formatYesNo(scenario.jErrorHit)}${scenario.jErrorHit ? ` @ step ${formatStep(scenario.jErrorStep)}` : ''}`);
  log(`  Common tail ${hex(POST_PARSEINP_PC)}: ${formatYesNo(scenario.postParseInpHit)}${scenario.postParseInpHit ? ` @ step ${formatStep(scenario.postParseInpStep)}` : ''}`);
  log(`  Clobbered handler ${hex(CLOBBERED_HANDLER_PC)}: ${formatYesNo(scenario.clobberedHandlerHit)}${scenario.clobberedHandlerHit ? ` @ step ${formatStep(scenario.clobberedHandlerStep)}` : ''}`);
  log(`  Final SP=${hex(scenario.sp)}, errSP=${hex(scenario.errSPAfter)}, term=${scenario.termination}, finalPc=${hex(scenario.finalPc ?? 0)}`);
  log();
}

function printAnalysis(log, scenarioA, scenarioB, scenarioC, scenarioD) {
  const lowFrames = [scenarioC, scenarioD];
  const lowCatch = lowFrames.filter((scenario) => scenario.errCatchHit);
  const lowIntact = lowFrames.filter((scenario) => !scenario.frameChanged);
  const lowCommonTail = lowFrames.filter((scenario) => scenario.clobberedHandlerHit);
  const lowAllocatorOnly = lowFrames.filter((scenario) => scenario.allocatorSteps > 0 && !scenario.errCatchHit);

  log('--- ANALYSIS ---');
  log(`  Allocator-region hits: B=${scenarioB.allocatorSteps}, C=${scenarioC.allocatorSteps}, D=${scenarioD.allocatorSteps}`);

  if (!scenarioB.errCatchHit) {
    log(`  Scenario B never reached ${hex(ERR_CATCH_ADDR)} and the frame at ${hex(scenarioB.errFrameBase)} ${scenarioB.frameChanged ? 'was overwritten' : 'did not stay stable'}, which matches the trampoline clobber-zone hypothesis.`);
  } else {
    log(`  Scenario B unexpectedly reached ${hex(ERR_CATCH_ADDR)} at step ${formatStep(scenarioB.errCatchStep)}.`);
  }

  if (lowCatch.length > 0) {
    log(`  Low-frame catch confirmed: ${lowCatch.map((scenario) => `Scenario ${scenario.id} @ ${hex(scenario.errFrameBase)} (step ${formatStep(scenario.errCatchStep)})`).join('; ')}.`);
    const allocatorAfterCatch = lowCatch.filter((scenario) => scenario.allocatorSteps > 0);
    if (allocatorAfterCatch.length === 0) {
      log('  The caught low-frame scenarios avoided the allocator region entirely.');
    } else {
      log(`  ERR_CATCH was reached, but allocator-region activity still appeared in ${allocatorAfterCatch.map((scenario) => `Scenario ${scenario.id}`).join(', ')}.`);
    }
  } else if (lowIntact.length > 0) {
    log(`  Neither low-frame scenario reached ${hex(ERR_CATCH_ADDR)}, but ${lowIntact.map((scenario) => hex(scenario.errFrameBase)).join(' and ')} stayed intact. That would imply frame placement alone is not sufficient and the remaining failure is control-flow related.`);
  } else {
    log(`  Neither low-frame scenario reached ${hex(ERR_CATCH_ADDR)}, and both low frames changed. That would imply a deeper stack write or another overwrite source beyond the currently known CALL chain.`);
  }

  if (lowAllocatorOnly.length > 0) {
    log(`  The allocator loop still appeared without ERR_CATCH in ${lowAllocatorOnly.map((scenario) => `Scenario ${scenario.id}`).join(', ')}.`);
  }

  if (lowCommonTail.length > 0) {
    log(`  Fallthrough into ${hex(CLOBBERED_HANDLER_PC)} still occurred in ${lowCommonTail.map((scenario) => `Scenario ${scenario.id}`).join(', ')}.`);
  }

  log(`  Control Scenario A: steps=${scenarioA.stepCount}, ERR_CATCH hit=${formatYesNo(scenarioA.errCatchHit)}, errNo=${hex(scenarioA.errNo, 2)}, OP1=${formatNumber(scenarioA.op1Decoded)}.`);
}

async function main() {
  const log = (line = '') => console.log(line);

  const scenarioA = runScenarioA();
  const scenarioB = runTrampolineScenario({
    id: 'B',
    label: `Trampoline, CLOBBERED frame at ${hex(CLOBBERED_ERRFRAME_BASE)}`,
    errFrameBase: CLOBBERED_ERRFRAME_BASE,
  });
  const scenarioC = runTrampolineScenario({
    id: 'C',
    label: `Trampoline, FIXED frame at ${hex(FIXED_ERRFRAME_BASE)}`,
    errFrameBase: FIXED_ERRFRAME_BASE,
  });
  const scenarioD = runTrampolineScenario({
    id: 'D',
    label: `Trampoline, DEEP frame at ${hex(DEEP_ERRFRAME_BASE)}`,
    errFrameBase: DEEP_ERRFRAME_BASE,
  });

  log('=== Phase 25AV: Error Frame Placement Fix ===');
  log();

  printScenarioA(log, scenarioA);
  printTrampolineScenario(log, scenarioB, { showClobbered: true });
  printTrampolineScenario(log, scenarioC);
  printTrampolineScenario(log, scenarioD);
  printAnalysis(log, scenarioA, scenarioB, scenarioC, scenarioD);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
