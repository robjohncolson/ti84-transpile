#!/usr/bin/env node

/**
 * Phase 185: MADL intercept probe
 *
 * This keeps the shared runtime untouched and locally monkey-patches
 * cpu.popReturn() during the probe. The intercept is limited to the known
 * z80-mode RET block at 0x03E1B1, where the ROM returns from the RSMIX helper
 * back into ADL-mode code.
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

const ERR_UNDEFINED_LOAD = 0x061D3A;
const JERROR_ENTRY = 0x061DB2;
const JERROR_AFTER_CALL = 0x061DBA;
const JERROR_LD_SP_ERRSP = 0x061DCA;
const ERROR_WRAPPER_ENTRY = 0x03E1B4;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;
const ERROR_HELPER_ENTRY = 0x03E187;
const ERROR_HELPER_Z80_BODY = 0x03E193;
const ERROR_HELPER_RET_BLOCK = 0x03E1B1;

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

const SENTINEL_STOP = '__PHASE185_SENTINEL__';
const MADL_INTERCEPT_PCS = new Set([ERROR_HELPER_RET_BLOCK]);

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]); // "2+3"

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

function decodeBcd(bytes) {
  const negative = (bytes[0] & 0x80) !== 0;
  const exponent = (bytes[1] & 0xFF) - 0x80;
  let mantissa = 0;
  for (let index = 2; index < 9; index += 1) {
    mantissa = (mantissa * 100) + (((bytes[index] >> 4) & 0xF) * 10) + (bytes[index] & 0xF);
  }
  const value = mantissa * Math.pow(10, exponent - 13);
  return negative ? -value : value;
}

function decodeOp1(mem) {
  try {
    const value = decodeBcd(mem.slice(OP1_ADDR, OP1_ADDR + 9));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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

  return runUntilHitSegmented(executor, CREATE_REAL_ENTRY, 'adl', { ret: FAKE_RET, err: ERR_CATCH }, CREATE_REAL_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;

  return runUntilHitSegmented(executor, BUFINSERT_ENTRY, 'adl', { ret: FAKE_RET }, BUFINSERT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

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

  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;

  const interceptLog = [];
  let interceptCount = 0;
  let lastInterceptPc = null;
  let lastInterceptReturn = null;

  const originalPopReturn = cpu.popReturn.bind(cpu);
  cpu.popReturn = function popReturnMadlIntercept() {
    const currentPc = (cpu._currentBlockPc ?? 0) & 0xFFFFFF;
    if (!cpu.madl && MADL_INTERCEPT_PCS.has(currentPc)) {
      const addr = cpu.sp & 0xFFFFFF;
      const value = read24(mem, addr);
      interceptCount += 1;
      lastInterceptPc = currentPc;
      lastInterceptReturn = value;
      interceptLog.push({
        event: 'MADL_INTERCEPT',
        blockPc: hex(currentPc),
        stackAddr: hex(addr),
        stackBytes: hexBytes(mem, addr, 6),
        returnedPc: hex(value),
        modeBefore: 'z80',
        modeAfter: 'adl',
        note: 'Simulated MADL suffix by popping a 24-bit return from SPL-addressed ADL stack',
      });
      cpu.sp = (cpu.sp + 3) & 0xFFFFFF;
      cpu.madl = 1;
      return value;
    }
    return originalPopReturn();
  };

  const addressesReached = {
    errUndefinedLoad: false,
    jerror: false,
    jerrorAfterCall: false,
    jerrorLdSpErrSp: false,
    errorWrapper: false,
    errorWrapperAfterHelper: false,
    errorHelper: false,
    errorHelperZ80Body: false,
    errorHelperRetBlock: false,
    errCatch: false,
    fakeRet: false,
  };

  const postInterceptTrace = [];
  const POST_INTERCEPT_TRACE_MAX = 64;
  let traceEnabled = false;

  let currentPc = PARSEINP_ENTRY;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hitSentinel = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;

    if (normalizedPc === ERR_UNDEFINED_LOAD) addressesReached.errUndefinedLoad = true;
    if (normalizedPc === JERROR_ENTRY) addressesReached.jerror = true;
    if (normalizedPc === JERROR_AFTER_CALL) addressesReached.jerrorAfterCall = true;
    if (normalizedPc === JERROR_LD_SP_ERRSP) addressesReached.jerrorLdSpErrSp = true;
    if (normalizedPc === ERROR_WRAPPER_ENTRY) addressesReached.errorWrapper = true;
    if (normalizedPc === ERROR_WRAPPER_AFTER_HELPER) addressesReached.errorWrapperAfterHelper = true;
    if (normalizedPc === ERROR_HELPER_ENTRY) addressesReached.errorHelper = true;
    if (normalizedPc === ERROR_HELPER_Z80_BODY) addressesReached.errorHelperZ80Body = true;
    if (normalizedPc === ERROR_HELPER_RET_BLOCK) addressesReached.errorHelperRetBlock = true;

    if (interceptCount > 0) {
      traceEnabled = true;
    }
    if (traceEnabled && postInterceptTrace.length < POST_INTERCEPT_TRACE_MAX) {
      postInterceptTrace.push({
        pc: hex(normalizedPc),
        mode: currentMode,
        madlFlag: cpu.madl ? 'adl' : 'z80',
      });
    }

    if (normalizedPc === ERR_CATCH) {
      addressesReached.errCatch = true;
      hitSentinel = 'err_catch';
      throw new Error(SENTINEL_STOP);
    }
    if (normalizedPc === FAKE_RET) {
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

  if (totalSteps >= PARSEINP_MAX_STEPS && !hitSentinel) {
    termination = 'max_steps_exhausted';
  }

  cpu.popReturn = originalPopReturn;

  const op1Bytes = mem.slice(OP1_ADDR, OP1_ADDR + 9);
  const op1Value = decodeOp1(mem);
  const errNo = mem[ERRNO_ADDR] & 0xFF;

  const report = {
    probe: 'phase185-madl-intercept',
    generatedAt: new Date().toISOString(),
    setup: {
      boot,
      memInit,
      createReal,
      editCursor: hex(cursor),
      preGapLen,
      parserPointers: {
        begPC: hex(read24(mem, BEGPC_ADDR)),
        curPC: hex(read24(mem, CURPC_ADDR)),
        endPC: hex(read24(mem, ENDPC_ADDR)),
      },
      postCreatePointers: {
        ops: hex(postCreatePointers.ops),
        fps: hex(postCreatePointers.fps),
        fpsBase: hex(postCreatePointers.fpsBase),
      },
      errFrameBase: hex(errBase),
      errSp: hex(read24(mem, ERRSP_ADDR)),
      inputTokens: Array.from(INSERT_TOKENS, (value) => hex(value, 2)),
    },
    madlIntercept: {
      targetBlocks: Array.from(MADL_INTERCEPT_PCS, (pc) => hex(pc)),
      fired: interceptCount > 0,
      count: interceptCount,
      lastInterceptPc: lastInterceptPc === null ? null : hex(lastInterceptPc),
      lastInterceptReturn: lastInterceptReturn === null ? null : hex(lastInterceptReturn),
      log: interceptLog,
    },
    addressesReached,
    execution: {
      totalSteps,
      termination,
      hitSentinel,
      lastPc: hex(lastPc),
      lastMode,
      errNo: hex(errNo, 2),
      errSp: hex(read24(mem, ERRSP_ADDR)),
      op1Bytes: Array.from(op1Bytes, (value) => hexByte(value)).join(' '),
      op1Value,
      errorMessage: errorMessage ? errorMessage.split('\n').slice(0, 5).join('\n') : null,
    },
    postInterceptTrace,
    analysis: {
      errNoIsNotUndefined: errNo !== 0x8D,
      returnedToWrapper: addressesReached.errorWrapperAfterHelper,
      returnedToJError: addressesReached.jerrorAfterCall,
      hitParseReturn: hitSentinel === 'fake_ret',
      op1LooksLikeFive: typeof op1Value === 'number' && Math.abs(op1Value - 5) < 1e-9,
      summary: interceptCount === 0
        ? 'Intercept did not fire at the targeted z80 RET block'
        : hitSentinel === 'fake_ret'
          ? 'ParseInp returned to FAKE_RET after the targeted MADL intercept'
          : hitSentinel === 'err_catch'
            ? 'Intercept fired, but ParseInp still exited through the error catch sentinel'
            : `Intercept fired; execution stopped with termination=${termination}`,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase185-madl-intercept',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
