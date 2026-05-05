#!/usr/bin/env node

/**
 * Phase 186: JError SP trace probe
 *
 * Traces the exact SP register value at every block step through
 * the JError error dispatch chain:
 *   0x061DB2 (JError) -> 0x03E1B4 (error wrapper) -> 0x03E187 (RSMIX helper)
 *   -> z80-mode RET at 0x03E1B1
 *
 * Does NOT modify any runtime files. Monkey-patches popReturn locally.
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

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const JERROR_ENTRY = 0x061DB2;
const JERROR_AFTER_CALL = 0x061DBA;
const JERROR_LD_SP_ERRSP = 0x061DCA;
const ERROR_WRAPPER_ENTRY = 0x03E1B4;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;
const ERROR_HELPER_ENTRY = 0x03E187;
const ERROR_HELPER_Z80_BODY = 0x03E193;
const ERROR_HELPER_RET_BLOCK = 0x03E1B1;

const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;

// A sentinel address for where JError would "return" if it ever does
const JERROR_RET = 0x7FFFF0;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const JERROR_MAX_STEPS = 200;

const SENTINEL_STOP = '__PHASE186_SENTINEL__';

// Key PCs to annotate
const KEY_PCS = {
  0x061DB2: 'JERROR_ENTRY',
  0x061DBA: 'JERROR_AFTER_CALL',
  0x061DCA: 'JERROR_LD_SP_ERRSP',
  0x03E1B4: 'ERROR_WRAPPER_ENTRY',
  0x03E1CA: 'ERROR_WRAPPER_AFTER_HELPER',
  0x03E187: 'ERROR_HELPER_ENTRY',
  0x03E193: 'ERROR_HELPER_Z80_BODY',
  0x03E1B1: 'ERROR_HELPER_RET_BLOCK',
};

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) => hexByte(value)).join(' ');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });

    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;

    if (result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw new Error(SENTINEL_STOP);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) {
          errorMessage = result.error?.stack ?? String(result.error);
        }
        break;
      }
    } catch (error) {
      if (error?.message === SENTINEL_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, KERNEL_INIT_MAX_LOOP_ITERATIONS);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, POST_INIT_MAX_LOOP_ITERATIONS);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERRNO_ADDR] = 0x00;

  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Boot ---
  const boot = bootRuntime(executor, cpu, mem);

  // --- MemInit ---
  const memInit = runMemInit(executor, cpu, mem);
  if (memInit.hit !== 'ret') {
    throw new Error(`MEM_INIT failed: hit=${memInit.hit}, termination=${memInit.termination}`);
  }

  // --- Set up CPU state for JError call ---
  resetCpuForOsCall(cpu, mem);

  // Set errNo = 0x8D (E_Undefined)
  mem[ERRNO_ADDR] = 0x8D;

  // Set up a return address on the stack for JError (it should never return normally)
  cpu.sp -= 3;
  write24(mem, cpu.sp, JERROR_RET);

  // Set up an error handler frame that PushErrorHandler would have created.
  // The errSP frame is: [errCatchPC (3 bytes)] [saved data (3 bytes)]
  // PushErrorHandler pushes: errCatch target address, then 3 bytes of saved state
  // errSP points to the base of this frame
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);   // error catch target PC
  write24(mem, errBase + 3, 0x000000); // saved state (zeroed)
  write24(mem, ERRSP_ADDR, errBase);

  // Snapshot pre-JError state
  const preJErrorState = {
    sp: hex(cpu.sp),
    errNo: hex(mem[ERRNO_ADDR], 2),
    errSp: hex(read24(mem, ERRSP_ADDR)),
    errSpTarget: hex(errBase),
    errSpContent: hexBytes(mem, errBase, 6),
    stackTop6: hexBytes(mem, cpu.sp, 6),
    madl: cpu.madl,
  };

  // --- Run JError with per-block SP tracing ---
  const trace = [];
  let previousSp = cpu.sp;
  let currentPc = JERROR_ENTRY;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hitSentinel = null;

  // Monkey-patch popReturn for MADL intercept at the z80-mode RET block
  const interceptLog = [];
  const originalPopReturn = cpu.popReturn.bind(cpu);
  cpu.popReturn = function popReturnMadlIntercept() {
    const currentBlockPc = (cpu._currentBlockPc ?? 0) & 0xFFFFFF;
    if (!cpu.madl && currentBlockPc === ERROR_HELPER_RET_BLOCK) {
      const addr = cpu.sp & 0xFFFFFF;
      const value = read24(mem, addr);
      interceptLog.push({
        event: 'MADL_INTERCEPT',
        blockPc: hex(currentBlockPc),
        sp: hex(addr),
        stackBytes: hexBytes(mem, addr, 6),
        returnedPc: hex(value),
        modeBefore: 'z80',
        modeAfter: 'adl',
      });
      cpu.sp = (cpu.sp + 3) & 0xFFFFFF;
      cpu.madl = 1;
      return value;
    }
    return originalPopReturn();
  };

  const notePc = (pc, mode, meta, steps) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;

    const sp = cpu.sp & 0xFFFFFF;
    const annotation = KEY_PCS[normalizedPc] || null;
    const romBytesAtPc = hexBytes(romBytes, normalizedPc, 4);

    const entry = {
      step: totalSteps + steps,
      pc: hex(normalizedPc),
      sp: hex(sp),
      spDelta: sp !== previousSp ? (sp - previousSp) : 0,
      madl: cpu.madl ? 'adl' : 'z80',
      opcodeBytes: romBytesAtPc,
      stackTop6: hexBytes(mem, sp, 6),
    };

    if (annotation) {
      entry.annotation = annotation;
    }

    // Special logging for key addresses
    if (normalizedPc === JERROR_LD_SP_ERRSP) {
      entry.detail = {
        event: 'BEFORE_LD_SP_ERRSP',
        currentSp: hex(sp),
        errSpValue: hex(read24(mem, ERRSP_ADDR)),
        errSpContentAt: hexBytes(mem, read24(mem, ERRSP_ADDR), 6),
        note: 'Next block will have SP set to errSP value',
      };
    }

    if (normalizedPc === ERROR_WRAPPER_ENTRY) {
      entry.detail = {
        event: 'CALL_TO_WRAPPER',
        sp: hex(sp),
        returnAddrOnStack: hex(read24(mem, sp)),
        stackContent: hexBytes(mem, sp, 9),
      };
    }

    if (normalizedPc === ERROR_HELPER_ENTRY) {
      entry.detail = {
        event: 'CALL_TO_HELPER',
        sp: hex(sp),
        returnAddrOnStack: hex(read24(mem, sp)),
        stackContent: hexBytes(mem, sp, 9),
      };
    }

    if (normalizedPc === ERROR_HELPER_RET_BLOCK) {
      entry.detail = {
        event: 'Z80_RET_BLOCK',
        sp: hex(sp),
        madl: cpu.madl ? 'adl' : 'z80',
        returnAddrOnStack: hex(read24(mem, sp)),
        stackContent: hexBytes(mem, sp, 9),
        note: 'This is the problematic z80-mode RET',
      };
    }

    trace.push(entry);
    previousSp = sp;

    // Check sentinels
    if (normalizedPc === ERR_CATCH) {
      hitSentinel = 'err_catch';
      throw new Error(SENTINEL_STOP);
    }
    if (normalizedPc === JERROR_RET) {
      hitSentinel = 'jerror_ret';
      throw new Error(SENTINEL_STOP);
    }
    if (normalizedPc === FAKE_RET) {
      hitSentinel = 'fake_ret';
      throw new Error(SENTINEL_STOP);
    }
  };

  while (totalSteps < JERROR_MAX_STEPS && !hitSentinel) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, JERROR_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode, meta, steps) { notePc(pc, mode, meta, steps); },
        onMissingBlock(pc, mode, steps) {
          const normalizedPc = pc & 0xFFFFFF;
          lastPc = normalizedPc;
          trace.push({
            step: totalSteps + steps,
            pc: hex(normalizedPc),
            sp: hex(cpu.sp & 0xFFFFFF),
            madl: cpu.madl ? 'adl' : 'z80',
            annotation: 'MISSING_BLOCK',
            stackTop6: hexBytes(mem, cpu.sp & 0xFFFFFF, 6),
          });
        },
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) {
          errorMessage = result.error?.stack ?? String(result.error);
        }
        break;
      }
    } catch (error) {
      if (error?.message === SENTINEL_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= JERROR_MAX_STEPS && !hitSentinel) {
    termination = 'max_steps_exhausted';
  }

  cpu.popReturn = originalPopReturn;

  // --- Build report ---
  const report = {
    probe: 'phase186-jerror-sp-trace',
    generatedAt: new Date().toISOString(),
    setup: {
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
      },
      preJErrorState,
    },
    execution: {
      totalSteps,
      termination,
      hitSentinel,
      lastPc: hex(lastPc),
      lastMode,
      errNo: hex(mem[ERRNO_ADDR], 2),
      errSp: hex(read24(mem, ERRSP_ADDR)),
      errorMessage: errorMessage ? errorMessage.split('\n').slice(0, 5).join('\n') : null,
    },
    madlIntercept: {
      fired: interceptLog.length > 0,
      count: interceptLog.length,
      log: interceptLog,
    },
    trace,
    analysis: {
      traceLength: trace.length,
      errSpInitialized: read24(mem, ERRSP_ADDR) !== 0,
      errSpValuePreJError: preJErrorState.errSp,
      keyAddressesReached: Object.fromEntries(
        Object.entries(KEY_PCS).map(([addr, name]) => [
          name,
          trace.some((t) => t.pc === hex(parseInt(addr, 10))),
        ])
      ),
      spAtLdSpErrSp: trace.find((t) => t.annotation === 'JERROR_LD_SP_ERRSP')?.sp ?? 'not reached',
      spAtZ80Ret: trace.find((t) => t.annotation === 'ERROR_HELPER_RET_BLOCK')?.sp ?? 'not reached',
      stackAtZ80Ret: trace.find((t) => t.annotation === 'ERROR_HELPER_RET_BLOCK')?.stackTop6 ?? 'not reached',
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase186-jerror-sp-trace',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
