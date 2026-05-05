#!/usr/bin/env node
/**
 * probe-phase193-trig-extended.mjs
 *
 * Phase 193: extend the phase 192 ParseInp trig probe with a longer recovery
 * trace for a single sin(0) fixture. The boot, MEM_INIT, CreateReal("Ans"),
 * edit-buffer setup, PushErrorHandler call, ParseInp entry, and z80 RET
 * intercept all follow the phase 192 pattern.
 *
 * Session 193 requested the edit buffer bytes [0x5E, 0x25, 0x30] for the
 * sin(0) probe case.
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

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;
const OP_LENGTH = 9;
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
const RECOVERY_TRACE_MAX_STEPS = 10000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const CHECKPOINT_STEPS = [2000, 5000, 10000];

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TEST_EXPRESSION = {
  name: 'A',
  label: 'sin(0)',
  tokens: [0x5E, 0x25, 0x30],
};

const TRACE_STOP = '__PHASE193_TRACE_STOP__';
const INTERCEPT_STOP = '__PHASE193_INTERCEPT__';
const MISSING_BLOCK_STOP = '__PHASE193_MISSING_BLOCK__';

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

function interpretBcdFloat(bytes) {
  const typeByte = bytes[0] & 0xFF;
  const sign = (typeByte & 0x80) ? -1 : 1;
  const objType = typeByte & 0x7F;
  const expRaw = bytes[1] & 0xFF;
  const exponent = expRaw - 0x80;

  let mantissaStr = '';
  for (let i = 2; i < 9; i += 1) {
    const b = bytes[i] & 0xFF;
    mantissaStr += hexByte(b);
  }

  if (mantissaStr.length === 0) {
    return { sign, objType, exponent, mantissa: '0', value: 0 };
  }

  let valueStr = mantissaStr[0] + '.' + mantissaStr.slice(1);
  valueStr = valueStr.replace(/0+$/, '').replace(/\.$/, '');

  const mantissaValue = parseFloat(valueStr);
  const value = sign * mantissaValue * Math.pow(10, exponent);

  return {
    sign: sign > 0 ? '+' : '-',
    objType: hex(objType, 2),
    expRaw: hex(expRaw, 2),
    exponent,
    mantissa: mantissaStr,
    value,
    raw: Array.from(bytes).map((b) => hexByte(b)).join(' '),
  };
}

function snapshotOpRegister(mem, addr) {
  const bytes = Array.from(mem.slice(addr, addr + OP_LENGTH));
  return {
    raw: bytes.map((b) => hexByte(b)).join(' '),
    interpreted: interpretBcdFloat(bytes),
  };
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
        onBlock(pc) {
          notePc(pc);
        },
        onMissingBlock(pc) {
          notePc(pc);
        },
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

function prepareMinimalParserState(executor, cpu, mem, tokens) {
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
  for (const token of tokens) {
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

function runPushErrorHandlerCall(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP_LENGTH);

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
    romErrSp: hex(read24(mem, ROM_ERRSP_ADDR)),
    romErrNo: hex(mem[ROM_ERRNO_ADDR], 2),
    sp: hex(cpu.sp),
  };
}

function runParseInpWithIntercept(executor, cpu, mem) {
  const log = {
    interceptFired: false,
    interceptCount: 0,
    jErrorFired: false,
    hlPayloadReached: false,
    notableEvents: [],
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
    [JERROR_ENTRY]: 'JError entry',
    [JERROR_LD_SP_ERRSP]: 'JError LD SP,(errSP)',
    [ERROR_HELPER_RET_BLOCK]: 'z80-mode RET block (INTERCEPT)',
    [ERROR_WRAPPER_AFTER_HELPER]: 'wrapper after helper',
    [HLPAYLOAD_TARGET]: 'hlPayload target',
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
          if (normalizedPc === HLPAYLOAD_TARGET) log.hlPayloadReached = true;

          if (notableAddresses[normalizedPc]) {
            log.notableEvents.push({
              step: totalSteps,
              event: notableAddresses[normalizedPc],
              pc: hex(normalizedPc),
              mode,
              sp: hex(cpu.sp),
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

  return {
    hit,
    totalSteps,
    termination,
    errorMessage,
    interceptFired: log.interceptFired,
    interceptCount: log.interceptCount,
    jErrorFired: log.jErrorFired,
    hlPayloadReached: log.hlPayloadReached,
    notableEvents: log.notableEvents,
  };
}

function recordCheckpointSnapshots(checkpoints, previousSteps, currentSteps, mem) {
  for (const checkpoint of CHECKPOINT_STEPS) {
    if (checkpoints[checkpoint]) continue;
    if (checkpoint > previousSteps && checkpoint <= currentSteps) {
      checkpoints[checkpoint] = snapshotOpRegister(mem, OP1_ADDR);
    }
  }
}

function inRange(pc, startInclusive, endExclusive) {
  return pc >= startInclusive && pc < endExclusive;
}

function traceRecoveryContinuationExtended(executor, cpu, mem, entry, mode) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let hit = null;
  let termination = null;
  let errorMessage = null;
  let interceptCount = 0;
  let missingBlock = null;

  const uniqueBlockKeys = new Set();
  const uniqueVisitOrder = [];
  const checkpoints = Object.fromEntries(CHECKPOINT_STEPS.map((step) => [step, null]));

  const sentinels = {
    ret: PARSEINP_RET,
    err: PARSEINP_ERR,
    normalReturn: NORMAL_RETURN_STUB,
    errorRestore: ERROR_RESTORE_STUB,
  };

  while (totalSteps < RECOVERY_TRACE_MAX_STEPS && !hit) {
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: 1,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, blockMode, meta, stepWithinRun) {
          const normalizedPc = pc & 0xFFFFFF;
          const globalStep = totalSteps + stepWithinRun;
          const key = `${hex(normalizedPc)}:${blockMode}`;

          if (!uniqueBlockKeys.has(key)) {
            uniqueBlockKeys.add(key);
            uniqueVisitOrder.push({
              step: globalStep,
              pc: normalizedPc,
              mode: blockMode,
            });
          }

          for (const [name, target] of Object.entries(sentinels)) {
            if (normalizedPc === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }

          if (normalizedPc === ERROR_HELPER_RET_BLOCK && blockMode === 'z80') {
            interceptCount += 1;
            const interceptError = new Error(INTERCEPT_STOP);
            interceptError.isIntercept = true;
            throw interceptError;
          }
        },
        onMissingBlock(pc, blockMode, stepWithinRun) {
          missingBlock = {
            step: totalSteps + stepWithinRun,
            pc: hex(pc & 0xFFFFFF),
            mode: blockMode,
          };
          const missingError = new Error(MISSING_BLOCK_STOP);
          missingError.isMissingBlock = true;
          throw missingError;
        },
      });

      const previousSteps = totalSteps;
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      recordCheckpointSnapshots(checkpoints, previousSteps, totalSteps, mem);

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
        continue;
      }
      if (error?.isMissingBlock) {
        hit = 'missingBlock';
        termination = 'missing_block';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= RECOVERY_TRACE_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  const visitedTrigBlocks = uniqueVisitOrder
    .filter((item) => inRange(item.pc, 0x075000, 0x076000))
    .map((item) => `${hex(item.pc)}:${item.mode}`);

  const visitedFpBlocks = uniqueVisitOrder
    .filter((item) => inRange(item.pc, 0x07C000, 0x07D000))
    .map((item) => `${hex(item.pc)}:${item.mode}`);

  const visitedFocusBlocks = uniqueVisitOrder
    .filter((item) => inRange(item.pc, 0x075000, 0x07E000))
    .map((item) => `${hex(item.pc)}:${item.mode}`);

  return {
    hit,
    totalSteps,
    termination,
    errorMessage,
    interceptCount,
    totalUniqueBlocks: uniqueBlockKeys.size,
    missingBlock,
    checkpoints,
    reachedTrigArea: visitedTrigBlocks.length > 0,
    reachedFpArea: visitedFpBlocks.length > 0,
    visitedTrigBlocks,
    visitedFpBlocks,
    visitedFocusBlocks,
    uniqueBlocksFirstVisit: uniqueVisitOrder.map((item) => ({
      step: item.step,
      block: `${hex(item.pc)}:${item.mode}`,
    })),
    finalOp1: snapshotOpRegister(mem, OP1_ADDR),
    finalOp2: snapshotOpRegister(mem, OP2_ADDR),
    finalErrNo: hex(mem[ROM_ERRNO_ADDR] & 0xFF, 2),
  };
}

function logCheckpoint(name, snapshot) {
  if (!snapshot) {
    console.log(`    OP1 @ ${name}: <not reached>`);
    return;
  }
  console.log(`    OP1 @ ${name}:`, snapshot.raw);
  console.log(`      interpreted:`, JSON.stringify(snapshot.interpreted));
}

function runExpressionTest(testDef) {
  const { name, label, tokens } = testDef;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST ${name}: "${label}" - tokens [${tokens.map((t) => hex(t, 2)).join(', ')}]`);
  console.log(`${'='.repeat(60)}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('  [1] Booting and preparing parser state...');
  const setup = prepareMinimalParserState(executor, cpu, mem, tokens);
  console.log('    EditBuffer:', JSON.stringify(setup.editBuffer));
  console.log('    ParserPtrs:', JSON.stringify(setup.parserPointers));

  console.log('  [2] Calling PushErrorHandler...');
  const pushEH = runPushErrorHandlerCall(executor, cpu, mem);
  console.log('    PushErrorHandler:', JSON.stringify(pushEH));

  if (pushEH.callResult.hit !== 'ret') {
    return {
      test: name,
      label,
      status: 'PUSH_ERROR_HANDLER_FAILED',
      pushErrorHandler: pushEH,
    };
  }

  cpu.sp -= 3;
  write24(mem, cpu.sp, PARSEINP_RET);
  console.log('  [3] Running ParseInp (max', PARSEINP_MAX_STEPS, 'steps)...');
  console.log('    SP before ParseInp:', hex(cpu.sp));

  const parseResult = runParseInpWithIntercept(executor, cpu, mem);
  console.log('    Hit:', parseResult.hit);
  console.log('    Steps:', parseResult.totalSteps);
  console.log('    Termination:', parseResult.termination);
  console.log('    JError fired:', parseResult.jErrorFired);
  console.log('    Intercept fired:', parseResult.interceptFired, '(count:', parseResult.interceptCount + ')');
  console.log('    hlPayload reached:', parseResult.hlPayloadReached);

  if (parseResult.notableEvents.length > 0) {
    console.log('    Notable events:');
    for (const event of parseResult.notableEvents) {
      console.log('     ', JSON.stringify(event));
    }
  }

  const op1BeforeRecovery = snapshotOpRegister(mem, OP1_ADDR);
  const op2BeforeRecovery = snapshotOpRegister(mem, OP2_ADDR);
  const errNoBeforeRecovery = hex(mem[ROM_ERRNO_ADDR] & 0xFF, 2);

  console.log('    OP1 raw:', op1BeforeRecovery.raw);
  console.log('    OP1 interpreted:', JSON.stringify(op1BeforeRecovery.interpreted));
  console.log('    OP2 raw:', op2BeforeRecovery.raw);
  console.log('    OP2 interpreted:', JSON.stringify(op2BeforeRecovery.interpreted));
  console.log('    errNo:', errNoBeforeRecovery);

  let recoveryTrace = null;
  if (parseResult.hlPayloadReached && parseResult.hit === 'hlPayload') {
    console.log('  [4] Tracing recovery continuation from 0x099929 (max 10000 steps)...');
    recoveryTrace = traceRecoveryContinuationExtended(executor, cpu, mem, HLPAYLOAD_TARGET, 'adl');
    console.log('    Recovery hit:', recoveryTrace.hit);
    console.log('    Recovery steps:', recoveryTrace.totalSteps);
    console.log('    Recovery termination:', recoveryTrace.termination);
    console.log('    Total unique blocks:', recoveryTrace.totalUniqueBlocks);
    console.log('    Missing block:', JSON.stringify(recoveryTrace.missingBlock));
    console.log('    Reached 0x075000-0x076000:', recoveryTrace.reachedTrigArea);
    console.log('    Reached 0x07C000-0x07D000:', recoveryTrace.reachedFpArea);
    console.log('    Final OP1:', recoveryTrace.finalOp1.raw);
    console.log('    Final OP2:', recoveryTrace.finalOp2.raw);
    console.log('    Final errNo:', recoveryTrace.finalErrNo);
    logCheckpoint('2000', recoveryTrace.checkpoints[2000]);
    logCheckpoint('5000', recoveryTrace.checkpoints[5000]);
    logCheckpoint('10000', recoveryTrace.checkpoints[10000]);

    console.log('    Recovery unique blocks (first visit order):');
    for (const item of recoveryTrace.uniqueBlocksFirstVisit) {
      console.log('     ', JSON.stringify(item));
    }

    console.log('    Recovery blocks in 0x075xxx-0x07Dxxx:');
    for (const block of recoveryTrace.visitedFocusBlocks) {
      console.log('     ', block);
    }
  }

  return {
    test: name,
    label,
    tokens: tokens.map((t) => hex(t, 2)),
    parseResult: {
      hit: parseResult.hit,
      totalSteps: parseResult.totalSteps,
      termination: parseResult.termination,
      jErrorFired: parseResult.jErrorFired,
      interceptFired: parseResult.interceptFired,
      interceptCount: parseResult.interceptCount,
      hlPayloadReached: parseResult.hlPayloadReached,
    },
    op1BeforeRecovery,
    op2BeforeRecovery,
    errNoBeforeRecovery,
    recoveryTrace,
  };
}

function main() {
  console.log('=== Phase 193: ParseInp trig extended recovery trace ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Expression to test: "${TEST_EXPRESSION.label}"`);
  console.log(`Recovery step cap: ${RECOVERY_TRACE_MAX_STEPS}\n`);

  let result;
  try {
    result = runExpressionTest(TEST_EXPRESSION);
  } catch (error) {
    result = {
      test: TEST_EXPRESSION.name,
      label: TEST_EXPRESSION.label,
      status: 'CRASHED',
      error: error.stack ?? String(error),
    };
    console.error('\n  TEST CRASHED:', result.error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  FINAL RESULT (JSON)');
  console.log('='.repeat(60));
  console.log(JSON.stringify(result, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  if (result.status === 'CRASHED' || result.status === 'PUSH_ERROR_HANDLER_FAILED') {
    console.log(`  ${result.label}: ${result.status}`);
    return;
  }

  console.log(
    `  ${result.label}: hit=${result.parseResult.hit}, parseSteps=${result.parseResult.totalSteps}, ` +
    `jError=${result.parseResult.jErrorFired}, intercept=${result.parseResult.interceptCount}x, ` +
    `errNo=${result.errNoBeforeRecovery}`,
  );

  if (result.recoveryTrace) {
    console.log(
      `    recovery: hit=${result.recoveryTrace.hit}, steps=${result.recoveryTrace.totalSteps}, ` +
      `uniqueBlocks=${result.recoveryTrace.totalUniqueBlocks}, missing=${JSON.stringify(result.recoveryTrace.missingBlock)}`,
    );
    console.log(
      `    trigArea=${result.recoveryTrace.reachedTrigArea}, fpArea=${result.recoveryTrace.reachedFpArea}, ` +
      `OP1@2000=${result.recoveryTrace.checkpoints[2000]?.raw ?? '<not reached>'}, ` +
      `OP1@5000=${result.recoveryTrace.checkpoints[5000]?.raw ?? '<not reached>'}, ` +
      `OP1@10000=${result.recoveryTrace.checkpoints[10000]?.raw ?? '<not reached>'}`,
    );
  }
}

main();
