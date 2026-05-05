#!/usr/bin/env node
/**
 * probe-phase189-error-recovery-trace.mjs
 *
 * Phase 189 follow-up to the phase 188 PushErrorHandler + ParseInp probe.
 * Recreates the phase 188 parser setup, stops when the JError recovery path
 * reaches 0x099929, then traces execution from that recovery target.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

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
const BUFINSERT_ENTRY = 0x05E2A0;
const PARSEINP_ENTRY = 0x099914;

const PUSH_ERROR_HANDLER_ENTRY = 0x07C88B;
const PUSH_ERROR_HANDLER_RET = 0x7FFFEA;
const PUSH_ERROR_HANDLER_MAX_STEPS = 8000;

const JERROR_ENTRY = 0x061DB2;
const JERROR_LD_SP_ERRSP = 0x061DCA;

const ERROR_HELPER_RET_BLOCK = 0x03E1B1;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;

const ERROR_RESTORE_STUB = 0x061DD1;
const NORMAL_RETURN_STUB = 0x061E27;
const HLPAYLOAD_TARGET = 0x099929;

const TASK_ERRSP_ADDR = 0xD008A1;
const TASK_ERRNO_ADDR = 0xD008AF;
const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const OP1_ADDR = 0xD005F8;
const OP1_LENGTH = 9;
const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const PARSEINP_RET = 0x7FFFF2;
const PARSEINP_ERR = 0x7FFFEE;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const PARSEINP_MAX_STEPS = 5000;
const RECOVERY_TRACE_MAX_STEPS = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
// Keep the phase 188 token fixture exactly so the same error path is exercised.
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

const RAM_TRACE_START = 0xD00000;
const RAM_TRACE_END = 0xE00000;
const TRACE_STOP = '__PHASE189_TRACE_STOP__';
const INTERCEPT_STOP = '__PHASE189_INTERCEPT__';

const STOP_TARGETS = new Map([
  [PARSEINP_RET, 'ParseInp return sentinel'],
  [PARSEINP_ERR, 'ParseInp error sentinel'],
  [NORMAL_RETURN_STUB, 'normal-return stub'],
  [ERROR_RESTORE_STUB, 'error-restore stub'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let index = 0; index < length; index += 1) {
    out.push(hexByte(buffer[(start + index) & 0xFFFFFF] ?? 0));
  }
  return out.join(' ');
}

function formatSignedHex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  const abs = Math.abs(value);
  return `${value >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase().padStart(width, '0')}`;
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
    if (result.termination !== 'max_steps') break;
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
        throw new Error(TRACE_STOP);
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
      if (error?.message === TRACE_STOP) {
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
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

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
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  cpu._de = token & 0xFF;
  return runUntilHitSegmented(
    executor,
    BUFINSERT_ENTRY,
    'adl',
    { ret: CREATE_REAL_RET },
    BUFINSERT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function prepareMinimalParserState(executor, cpu, mem) {
  const boot = bootRuntime(executor, cpu, mem);

  const memInit = runMemInit(executor, cpu, mem);
  if (memInit.hit !== 'ret') {
    throw new Error(`MEM_INIT failed: hit=${memInit.hit}, termination=${memInit.termination}`);
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit !== 'ret') {
    throw new Error(`CreateReal(Ans) failed: hit=${createReal.hit}, errNo=${hex(mem[ROM_ERRNO_ADDR], 2)}`);
  }

  const allocator = {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
  };

  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  const bufInsertRuns = [];
  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    if (result.hit !== 'ret') {
      throw new Error(`BufInsert(${hex(token, 2)}) failed: hit=${result.hit}, termination=${result.termination}`);
    }
    bufInsertRuns.push({
      token: hex(token, 2),
      steps: result.steps,
      lastPc: hex(result.lastPc),
      termination: result.termination,
    });
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLength = cursor - BUF_START;
  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLength - 1);

  write24(mem, OPBASE_ADDR, allocator.opBase);
  write24(mem, OPS_ADDR, allocator.ops);
  write24(mem, FPSBASE_ADDR, allocator.fpsBase);
  write24(mem, FPS_ADDR, allocator.fps);

  return {
    boot,
    memInit: { steps: memInit.steps, lastPc: hex(memInit.lastPc), termination: memInit.termination },
    createReal: { steps: createReal.steps, lastPc: hex(createReal.lastPc), termination: createReal.termination, errBase: createReal.errBase },
    bufInsertRuns,
    editBuffer: {
      start: hex(BUF_START),
      cursor: hex(cursor),
      preGapLength,
      bytes: hexBytes(mem, BUF_START, Math.max(0, cursor - BUF_START)),
    },
    parserPointers: {
      begPC: hex(read24(mem, BEGPC_ADDR)),
      curPC: hex(read24(mem, CURPC_ADDR)),
      endPC: hex(read24(mem, ENDPC_ADDR)),
    },
    allocatorPointers: {
      fpsBase: hex(read24(mem, FPSBASE_ADDR)),
      fps: hex(read24(mem, FPS_ADDR)),
      opBase: hex(read24(mem, OPBASE_ADDR)),
      ops: hex(read24(mem, OPS_ADDR)),
    },
  };
}

function snapshotWatchedSlots(mem) {
  return {
    taskErrSp: hex(read24(mem, TASK_ERRSP_ADDR)),
    taskErrNo: hex(mem[TASK_ERRNO_ADDR], 2),
    romErrSp: hex(read24(mem, ROM_ERRSP_ADDR)),
    romErrNo: hex(mem[ROM_ERRNO_ADDR], 2),
  };
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function snapshotErrSpArea(mem, baseAddr, length = 18) {
  const base = read24(mem, baseAddr);
  return {
    frameBase: hex(base),
    frameBytes: hexBytes(mem, base, length),
  };
}

function captureRecoveryWatch(mem, cpu) {
  return {
    op1: Array.from(mem.slice(OP1_ADDR, OP1_ADDR + OP1_LENGTH)),
    romErrNo: mem[ROM_ERRNO_ADDR] & 0xFF,
    taskErrNo: mem[TASK_ERRNO_ADDR] & 0xFF,
    iyErrNo: mem[(cpu._iy + 0x0C) & 0xFFFFFF] & 0xFF,
    romErrSp: read24(mem, ROM_ERRSP_ADDR),
    taskErrSp: read24(mem, TASK_ERRSP_ADDR),
  };
}

function formatWatchDiff(before, after) {
  const diffs = [];

  if (before.romErrNo !== after.romErrNo) {
    diffs.push(`ROM errNo ${hex(before.romErrNo, 2)} -> ${hex(after.romErrNo, 2)}`);
  }
  if (before.taskErrNo !== after.taskErrNo) {
    diffs.push(`TASK errNo ${hex(before.taskErrNo, 2)} -> ${hex(after.taskErrNo, 2)}`);
  }
  if (before.iyErrNo !== after.iyErrNo) {
    diffs.push(`IY+0x0C ${hex(before.iyErrNo, 2)} -> ${hex(after.iyErrNo, 2)}`);
  }
  if (before.romErrSp !== after.romErrSp) {
    diffs.push(`ROM errSP ${hex(before.romErrSp)} -> ${hex(after.romErrSp)}`);
  }
  if (before.taskErrSp !== after.taskErrSp) {
    diffs.push(`TASK errSP ${hex(before.taskErrSp)} -> ${hex(after.taskErrSp)}`);
  }

  for (let index = 0; index < OP1_LENGTH; index += 1) {
    if (before.op1[index] !== after.op1[index]) {
      diffs.push(`OP1[${index}] ${hex(before.op1[index], 2)} -> ${hex(after.op1[index], 2)}`);
    }
  }

  return diffs;
}

function runPushErrorHandlerCall(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LENGTH);

  cpu._hl = HLPAYLOAD_TARGET;
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_RET);

  const callResult = runUntilHitSegmented(
    executor,
    PUSH_ERROR_HANDLER_ENTRY,
    'adl',
    { ret: PUSH_ERROR_HANDLER_RET },
    PUSH_ERROR_HANDLER_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );

  return {
    callResult: {
      hit: callResult.hit,
      steps: callResult.steps,
      lastPc: hex(callResult.lastPc),
      lastMode: callResult.lastMode,
      termination: callResult.termination,
      errorMessage: callResult.errorMessage,
    },
    watchedSlots: snapshotWatchedSlots(mem),
    romErrSpArea: snapshotErrSpArea(mem, ROM_ERRSP_ADDR),
    taskErrSpArea: snapshotErrSpArea(mem, TASK_ERRSP_ADDR),
    cpuAfter: snapshotCpu(cpu),
  };
}

function runParseInpUntilRecoveryTarget(executor, cpu, mem) {
  const log = {
    interceptFired: false,
    interceptCount: 0,
    jErrorFired: false,
    ldSpErrSpFired: false,
    hlPayloadReached: false,
    notableEvents: [],
    finalState: null,
  };

  let currentPc = PARSEINP_ENTRY & 0xFFFFFF;
  let currentMode = 'adl';
  let totalSteps = 0;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const sentinels = {
    ret: PARSEINP_RET,
    err: PARSEINP_ERR,
    normalReturn: NORMAL_RETURN_STUB,
    errorRestore: ERROR_RESTORE_STUB,
    hlPayload: HLPAYLOAD_TARGET,
  };

  const notableAddresses = {
    0x061DB2: 'JError entry',
    0x061DCA: 'JError LD SP,(errSP)',
    0x061DD1: 'error-restore stub',
    0x061E27: 'normal-return stub',
    0x03E1B1: 'z80-mode RET block (INTERCEPT TARGET)',
    0x03E1CA: 'wrapper after helper (intercept destination)',
    0x099929: 'hlPayload target',
  };

  while (totalSteps < PARSEINP_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, PARSEINP_MAX_STEPS - totalSteps);

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode) {
          const normalizedPc = pc & 0xFFFFFF;

          if (normalizedPc === JERROR_ENTRY) log.jErrorFired = true;
          if (normalizedPc === JERROR_LD_SP_ERRSP) log.ldSpErrSpFired = true;
          if (normalizedPc === HLPAYLOAD_TARGET) log.hlPayloadReached = true;

          if (notableAddresses[normalizedPc]) {
            log.notableEvents.push({
              step: totalSteps,
              event: notableAddresses[normalizedPc],
              pc: hex(normalizedPc),
              mode,
              sp: hex(cpu.sp),
              a: hex(cpu.a, 2),
              madl: cpu.madl,
            });
          }

          for (const [name, target] of Object.entries(sentinels)) {
            if (normalizedPc === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }

          if (normalizedPc === ERROR_HELPER_RET_BLOCK) {
            log.interceptFired = true;
            log.interceptCount += 1;
            log.notableEvents.push({
              step: totalSteps,
              event: 'INTERCEPT: preventing z80-mode RET at 0x03E1B1',
              pcBefore: hex(normalizedPc),
              modeBefore: mode,
              spAtIntercept: hex(cpu.sp),
              stackTop6: hexBytes(mem, cpu.sp & 0xFFFFFF, 6),
            });
            const interceptError = new Error(INTERCEPT_STOP);
            interceptError.isIntercept = true;
            throw interceptError;
          }
        },
        onMissingBlock(pc) {
          const normalizedPc = pc & 0xFFFFFF;
          for (const [name, target] of Object.entries(sentinels)) {
            if (normalizedPc === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
      });

      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      if (error?.isIntercept) {
        cpu.madl = 1;
        currentPc = ERROR_WRAPPER_AFTER_HELPER;
        currentMode = 'adl';
        log.notableEvents.push({
          step: totalSteps,
          event: 'INTERCEPT APPLIED: pc -> 0x03E1CA, madl -> 1 (ADL)',
          spAfterIntercept: hex(cpu.sp),
        });
        continue;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= PARSEINP_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  log.finalState = {
    hit,
    totalSteps,
    termination,
    errorMessage,
    cpu: snapshotCpu(cpu),
    watchedSlots: snapshotWatchedSlots(mem),
    romErrSpArea: snapshotErrSpArea(mem, ROM_ERRSP_ADDR),
    taskErrSpArea: snapshotErrSpArea(mem, TASK_ERRSP_ADDR),
    op1: hexBytes(mem, OP1_ADDR, OP1_LENGTH),
    errNo_iy0c: hex(mem[(cpu._iy + 0x0C) & 0xFFFFFF], 2),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
  };

  return log;
}

function isTrackedRam(addr) {
  const normalized = addr & 0xFFFFFF;
  return normalized >= RAM_TRACE_START && normalized < RAM_TRACE_END;
}

// __PHASE189_MORE__
