#!/usr/bin/env node
/**
 * probe-phase192-parseinp-trig.mjs
 *
 * Phase 192: test whether ParseInp can evaluate trigonometric expressions
 * containing two-byte tokens. This reuses the same boot, allocator,
 * PushErrorHandler, ParseInp intercept, and recovery pipeline as phase 190,
 * but swaps in sin()/cos() expressions encoded as raw token bytes.
 *
 * Test A: "sin(0)" = tokens [0x5E, 0x25, 0x30, 0x11]
 * Test B: "cos(0)" = tokens [0x5E, 0x26, 0x30, 0x11]
 * Test C: "sin(1)" = tokens [0x5E, 0x25, 0x31, 0x11]
 * Test D: "cos(1)" = tokens [0x5E, 0x26, 0x31, 0x11]
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

// Memory layout
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

// Entry points
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

// JError / recovery addresses
const JERROR_ENTRY = 0x061DB2;
const JERROR_LD_SP_ERRSP = 0x061DCA;

const ERROR_HELPER_RET_BLOCK = 0x03E1B1;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;

const ERROR_RESTORE_STUB = 0x061DD1;
const NORMAL_RETURN_STUB = 0x061E27;
const HLPAYLOAD_TARGET = 0x099929;

// OS RAM addresses
const TASK_ERRSP_ADDR = 0xD008A1;
const TASK_ERRNO_ADDR = 0xD008AF;
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

// Sentinel addresses
const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const PARSEINP_RET = 0x7FFFF2;
const PARSEINP_ERR = 0x7FFFEE;

// Step limits
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

// Fixture data
const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const TEST_EXPRESSIONS = [
  { name: 'A', label: 'sin(0)', tokens: [0x5E, 0x25, 0x30, 0x11] },
  { name: 'B', label: 'cos(0)', tokens: [0x5E, 0x26, 0x30, 0x11] },
  { name: 'C', label: 'sin(1)', tokens: [0x5E, 0x25, 0x31, 0x11] },
  { name: 'D', label: 'cos(1)', tokens: [0x5E, 0x26, 0x31, 0x11] },
];

// Trace control strings
const TRACE_STOP = '__PHASE192_TRACE_STOP__';
const INTERCEPT_STOP = '__PHASE192_INTERCEPT__';

const STOP_TARGETS = new Map([
  [PARSEINP_RET, 'ParseInp return sentinel'],
  [PARSEINP_ERR, 'ParseInp error sentinel'],
  [NORMAL_RETURN_STUB, 'normal-return stub'],
  [ERROR_RESTORE_STUB, 'error-restore stub'],
]);

// Utility functions
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

/**
 * Interpret a TI-OS 9-byte BCD float from OP1/OP2.
 * Format: [type/sign, exponent, d1d2, d3d4, d5d6, d7d8, d9d10, d11d12, d13d14]
 * sign = bit 7 of byte 0, exponent biased by 0x80, mantissa is BCD digits.
 * Example: 5.0 = [0x00, 0x80, 0x50, 0x00, ...]
 */
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

  if (mantissaStr.length === 0) return { sign, objType, exponent, mantissa: '0', value: 0 };

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
    raw: Array.from(bytes).map(b => hexByte(b)).join(' '),
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

// Boot + parser state setup

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

// PushErrorHandler

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

// ParseInp with z80-mode RET intercept

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
    0x061DB2: 'JError entry',
    0x061DCA: 'JError LD SP,(errSP)',
    0x03E1B1: 'z80-mode RET block (INTERCEPT)',
    0x03E1CA: 'wrapper after helper',
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

// Recovery continuation trace

function traceRecoveryContinuation(executor, cpu, mem, entry, mode) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let hit = null;
  let termination = null;
  let errorMessage = null;
  const trace = [];

  const sentinels = {
    ret: PARSEINP_RET,
    err: PARSEINP_ERR,
    normalReturn: NORMAL_RETURN_STUB,
    errorRestore: ERROR_RESTORE_STUB,
  };

  while (totalSteps < RECOVERY_TRACE_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, RECOVERY_TRACE_MAX_STEPS - totalSteps);

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, blockMode) {
          const normalizedPc = pc & 0xFFFFFF;
          trace.push({ pc: hex(normalizedPc), mode: blockMode, sp: hex(cpu.sp) });

          for (const [name, target] of Object.entries(sentinels)) {
            if (normalizedPc === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }

          if (normalizedPc === ERROR_HELPER_RET_BLOCK) {
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

  if (totalSteps >= RECOVERY_TRACE_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  return {
    hit,
    totalSteps,
    termination,
    errorMessage,
    traceLength: trace.length,
    firstBlocks: trace.slice(0, 30),
    lastBlocks: trace.slice(-10),
  };
}

// Run one expression test

function runExpressionTest(testDef) {
  const { name, label, tokens } = testDef;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST ${name}: "${label}" - tokens [${tokens.map(t => hex(t, 2)).join(', ')}]`);
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

  const op1Raw = Array.from(mem.slice(OP1_ADDR, OP1_ADDR + OP_LENGTH));
  const op2Raw = Array.from(mem.slice(OP2_ADDR, OP2_ADDR + OP_LENGTH));
  const errNo = mem[ROM_ERRNO_ADDR] & 0xFF;

  const op1Interp = interpretBcdFloat(op1Raw);
  const op2Interp = interpretBcdFloat(op2Raw);

  console.log('    OP1 raw:', hexBytes(mem, OP1_ADDR, OP_LENGTH));
  console.log('    OP1 interpreted:', JSON.stringify(op1Interp));
  console.log('    OP2 raw:', hexBytes(mem, OP2_ADDR, OP_LENGTH));
  console.log('    OP2 interpreted:', JSON.stringify(op2Interp));
  console.log('    errNo:', hex(errNo, 2));

  let recoveryTrace = null;
  if (parseResult.hlPayloadReached && parseResult.hit === 'hlPayload') {
    console.log('  [4] Tracing recovery continuation from 0x099929...');
    recoveryTrace = traceRecoveryContinuation(executor, cpu, mem, HLPAYLOAD_TARGET, 'adl');
    console.log('    Recovery hit:', recoveryTrace.hit);
    console.log('    Recovery steps:', recoveryTrace.totalSteps);
    console.log('    Recovery termination:', recoveryTrace.termination);

    const op1After = Array.from(mem.slice(OP1_ADDR, OP1_ADDR + OP_LENGTH));
    const op2After = Array.from(mem.slice(OP2_ADDR, OP2_ADDR + OP_LENGTH));
    const errNoAfter = mem[ROM_ERRNO_ADDR] & 0xFF;

    console.log('    OP1 after recovery:', hexBytes(mem, OP1_ADDR, OP_LENGTH));
    console.log('    OP1 interpreted:', JSON.stringify(interpretBcdFloat(op1After)));
    console.log('    OP2 after recovery:', hexBytes(mem, OP2_ADDR, OP_LENGTH));
    console.log('    errNo after recovery:', hex(errNoAfter, 2));

    if (recoveryTrace.firstBlocks.length > 0) {
      console.log('    First blocks:');
      for (const block of recoveryTrace.firstBlocks) {
        console.log('     ', JSON.stringify(block));
      }
    }
  }

  return {
    test: name,
    label,
    tokens: tokens.map(t => hex(t, 2)),
    parseResult: {
      hit: parseResult.hit,
      totalSteps: parseResult.totalSteps,
      termination: parseResult.termination,
      jErrorFired: parseResult.jErrorFired,
      interceptFired: parseResult.interceptFired,
      interceptCount: parseResult.interceptCount,
      hlPayloadReached: parseResult.hlPayloadReached,
    },
    op1: { raw: op1Interp.raw, value: op1Interp.value, mantissa: op1Interp.mantissa, exponent: op1Interp.exponent },
    op2: { raw: op2Interp.raw, value: op2Interp.value, mantissa: op2Interp.mantissa, exponent: op2Interp.exponent },
    errNo: hex(errNo, 2),
    recoveryTrace: recoveryTrace ? {
      hit: recoveryTrace.hit,
      totalSteps: recoveryTrace.totalSteps,
      termination: recoveryTrace.termination,
      op1After: hexBytes(mem, OP1_ADDR, OP_LENGTH),
      op2After: hexBytes(mem, OP2_ADDR, OP_LENGTH),
      errNoAfter: hex(mem[ROM_ERRNO_ADDR] & 0xFF, 2),
    } : null,
  };
}

// Main

function main() {
  console.log('=== Phase 192: ParseInp trigonometric expression tests ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Expressions to test: ${TEST_EXPRESSIONS.map(e => `"${e.label}"`).join(', ')}\n`);

  const results = [];

  for (const testDef of TEST_EXPRESSIONS) {
    try {
      const result = runExpressionTest(testDef);
      results.push(result);
    } catch (error) {
      console.error(`\n  TEST ${testDef.name} CRASHED:`, error.stack ?? String(error));
      results.push({
        test: testDef.name,
        label: testDef.label,
        status: 'CRASHED',
        error: error.stack ?? String(error),
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  FINAL RESULTS (JSON)');
  console.log('='.repeat(60));
  console.log(JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    if (r.status === 'CRASHED' || r.status === 'PUSH_ERROR_HANDLER_FAILED') {
      console.log(`  ${r.test} "${r.label}": ${r.status}`);
      continue;
    }
    console.log(`  ${r.test} "${r.label}": hit=${r.parseResult.hit}, steps=${r.parseResult.totalSteps}, ` +
      `jError=${r.parseResult.jErrorFired}, intercept=${r.parseResult.interceptCount}x, ` +
      `errNo=${r.errNo}, OP1=${r.op1.value} (${r.op1.raw})`);
    if (r.recoveryTrace) {
      console.log(`    recovery: hit=${r.recoveryTrace.hit}, steps=${r.recoveryTrace.totalSteps}, ` +
        `errNoAfter=${r.recoveryTrace.errNoAfter}, OP1after=${r.recoveryTrace.op1After}`);
    }
  }
}

main();
