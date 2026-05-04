#!/usr/bin/env node

/**
 * Phase 184: MADL Bypass Probe
 *
 * Tests a targeted bypass for the z80-mode RET after ADL-mode CALL problem.
 * When JError at 0x061DB6 does ADL CALL 0x03E1B4, the wrapper eventually
 * does RSMIX -> z80 mode -> POP AF -> RET. The z80-mode RET pops from
 * {MBASE=0xD0, SPS&0xFFFF} which is different memory than where the ADL CALL
 * wrote (0xD1xxxx). This causes a jump to 0x001DBA instead of 0x061DBA.
 *
 * Bypass: Monkey-patch popReturn() to detect the z80-mode RET returning 0x1DBA,
 * fix it to 0x061DBA, and restore ADL mode (simulating what a MADL suffix would do).
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
const CREATE_REAL_ENTRY = 0x08238A;
const PARSEINP_ENTRY = 0x099914;
const BUFINSERT_ENTRY = 0x05E2A0;

const OP1_ADDR = 0xD005F8;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPS_ADDR = 0xD02593;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const PARSEINP_MAX_STEPS = 2000000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

// Key addresses in the error dispatch chain
const JERROR_CALL_ADDR = 0x061DB6;    // ADL CALL 0x03E1B4
const JERROR_RETURN_ADDR = 0x061DBA;  // Return address pushed by that CALL
const JERROR_LD_SP_ERRSP = 0x061DCA;  // LD SP, (errSP) in JError continuation
const JERROR_RET = 0x061DD0;          // Final RET in JError error handler

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]); // "2+3"

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
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

    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

const SENTINEL_STOP = '__PHASE184_SENTINEL__';

function runUntilHitSegmented(executor, mem, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hit = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const norm = pc & 0xFFFFFF;
    lastPc = norm;
    for (const [name, target] of Object.entries(sentinels)) {
      if (norm === target) {
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
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
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

  return runUntilHitSegmented(executor, mem, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return runUntilHitSegmented(executor, mem, CREATE_REAL_ENTRY, 'adl', { ret: FAKE_RET, err: ERR_CATCH }, CREATE_REAL_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;

  return runUntilHitSegmented(executor, mem, BUFINSERT_ENTRY, 'adl', { ret: FAKE_RET }, BUFINSERT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Boot stages ---
  const boot = bootRuntime(executor, cpu, mem);

  const memInit = runMemInit(executor, cpu, mem);
  if (memInit.hit !== 'ret') {
    throw new Error(`MEM_INIT failed: hit=${memInit.hit}, termination=${memInit.termination}`);
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit !== 'ret') {
    throw new Error(`CreateReal(Ans) failed: hit=${createReal.hit}, errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  }

  const postCreatePointers = {
    ops: read24(mem, OPS_ADDR),
    fps: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
  };

  // --- Set up edit buffer with "2+3" ---
  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    if (result.hit !== 'ret') {
      throw new Error(`BufInsert(${hex(token, 2)}) failed: hit=${result.hit}`);
    }
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLen = cursor - BUF_START;

  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLen - 1);

  write24(mem, OPS_ADDR, postCreatePointers.ops);
  write24(mem, FPS_ADDR, postCreatePointers.fps);
  write24(mem, FPSBASE_ADDR, postCreatePointers.fpsBase);

  // --- Set up error frame for ParseInp ---
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Set up errSP frame: when JError does LD SP,(errSP), SP gets set to errBase,
  // and then the next RET pops ERR_CATCH.
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);   // Return address for final RET after LD SP,(errSP)
  write24(mem, errBase + 3, 0);       // Padding
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;

  // --- Install MADL bypass monkey-patch ---
  const bypassLog = [];
  let bypassFired = false;
  let pcAtBypass = null;

  const originalPopReturn = cpu.popReturn.bind(cpu);
  cpu.popReturn = function() {
    const val = originalPopReturn();

    // Detect z80-mode RET popping 0x1DBA (low 16 bits of 0x061DBA)
    if (!cpu.madl && val === 0x1DBA) {
      bypassFired = true;
      pcAtBypass = cpu.pc;
      bypassLog.push({
        event: 'MADL_BYPASS_INTERCEPT',
        poppedValue: hex(val, 4),
        correctedTo: hex(JERROR_RETURN_ADDR),
        cpuMode: 'z80',
        sp: hex(cpu.sp),
        mbase: hex(cpu.mbase, 2),
        note: 'Switching back to ADL mode and returning full 24-bit address',
      });
      cpu.madl = 1; // Switch back to ADL mode (simulating MADL suffix byte)
      return JERROR_RETURN_ADDR; // 0x061DBA
    }

    // Also catch any other z80-mode RET that pops a value that looks like
    // it could be a truncated ADL return address (for diagnostics)
    if (!cpu.madl && val !== 0 && val < 0x4000) {
      bypassLog.push({
        event: 'Z80_RET_DIAGNOSTIC',
        poppedValue: hex(val, 4),
        cpuMode: 'z80',
        sp: hex(cpu.sp),
        mbase: hex(cpu.mbase, 2),
        note: 'z80-mode RET popped suspicious low value (potential truncated ADL address)',
      });
    }

    return val;
  };

  // --- Track key addresses reached ---
  const addressesReached = {
    jerrorReturnAddr: false,  // 0x061DBA - after the CALL returns
    jerrorLdSpErrSp: false,   // 0x061DCA - LD SP,(errSP)
    jerrorFinalRet: false,    // 0x061DD0 - final RET in error handler
    errCatch: false,          // ERR_CATCH sentinel
    fakeRet: false,           // FAKE_RET sentinel
  };

  const pcLog = [];
  let pcLogCount = 0;
  const PC_LOG_MAX = 200;

  // --- Run ParseInp with monitoring ---
  let currentPc = PARSEINP_ENTRY;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hitSentinel = null;

  const monitorPc = (pc) => {
    const norm = pc & 0xFFFFFF;
    lastPc = norm;

    if (norm === JERROR_RETURN_ADDR) addressesReached.jerrorReturnAddr = true;
    if (norm === JERROR_LD_SP_ERRSP) addressesReached.jerrorLdSpErrSp = true;
    if (norm === JERROR_RET) addressesReached.jerrorFinalRet = true;

    // Log PCs after bypass fires (to trace what happens next)
    if (bypassFired && pcLogCount < PC_LOG_MAX) {
      pcLog.push({ pc: hex(norm), mode: cpu.madl ? 'adl' : 'z80' });
      pcLogCount++;
    }

    if (norm === ERR_CATCH) {
      addressesReached.errCatch = true;
      hitSentinel = 'err_catch';
      throw new Error(SENTINEL_STOP);
    }
    if (norm === FAKE_RET) {
      addressesReached.fakeRet = true;
      hitSentinel = 'fake_ret';
      throw new Error(SENTINEL_STOP);
    }
  };

  while (totalSteps < PARSEINP_MAX_STEPS && !hitSentinel) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, PARSEINP_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) { monitorPc(pc); },
        onMissingBlock(pc) { monitorPc(pc); },
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
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

  if (totalSteps >= PARSEINP_MAX_STEPS && !hitSentinel) {
    termination = 'max_steps_exhausted';
  }

  // --- Build report ---
  const report = {
    probe: 'phase184-madl-bypass',
    generatedAt: new Date().toISOString(),
    setup: {
      boot,
      errFrameBase: hex(errBase),
      errSP_written: hex(read24(mem, ERRSP_ADDR)),
    },
    madlBypass: {
      fired: bypassFired,
      pcAtBypass: pcAtBypass !== null ? hex(pcAtBypass) : null,
      log: bypassLog,
    },
    addressesReached,
    execution: {
      totalSteps,
      termination,
      hitSentinel,
      lastPc: hex(lastPc),
      lastMode,
      errNo: hex(mem[ERRNO_ADDR] & 0xFF, 2),
      errSP: hex(read24(mem, ERRSP_ADDR)),
      errorMessage: errorMessage ? errorMessage.split('\n').slice(0, 5).join('\n') : null,
    },
    postBypassPcTrace: pcLog.length > 0 ? pcLog.slice(0, 50) : 'bypass did not fire or no PCs logged',
    analysis: {
      bypassSuccess: bypassFired && addressesReached.jerrorLdSpErrSp,
      errorCaught: hitSentinel === 'err_catch',
      noHalt: termination !== 'halted' && !errorMessage?.includes('HALT'),
      summary: bypassFired
        ? (addressesReached.errCatch
          ? 'SUCCESS: MADL bypass fired, error was caught at ERR_CATCH sentinel'
          : addressesReached.jerrorLdSpErrSp
            ? 'PARTIAL: MADL bypass fired and reached LD SP,(errSP), but did not reach ERR_CATCH'
            : `PARTIAL: MADL bypass fired but execution diverged (lastPc=${hex(lastPc)})`)
        : 'BYPASS DID NOT FIRE: z80-mode RET with value 0x1DBA was never observed',
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase184-madl-bypass',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
