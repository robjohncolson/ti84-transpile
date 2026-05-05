#!/usr/bin/env node
/**
 * probe-phase188-pusherrorhandler.mjs
 *
 * Session 188 follow-up to the phase 187 JError intercept probe.
 *
 * Goal:
 *   1. Prepare the same minimal parser state used in phase 187.
 *   2. Call the session 188 target entry at 0x07C88B with HL=0x099929 and
 *      a real return address on the stack.
 *   3. Snapshot the errSP area after that call.
 *   4. Call ParseInp and keep the z80-mode RET intercept at 0x03E1B1 so the
 *      JError cleanup path can continue in ADL mode.
 *   5. Report whether JError reaches 0x099929.
 *
 * Note:
 *   Historical repo reports also identify 0x061DEF as the classic
 *   PushErrorHandler frame builder. This probe intentionally exercises the
 *   newly seeded 0x07C88B entry requested for session 188.
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

const TASK_ERRSP_ADDR = 0xD008A1;
const TASK_ERRNO_ADDR = 0xD008AF;
const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const OP1_ADDR = 0xD005F8;
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
const OS_MAX_LOOP_ITERATIONS = 8192;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

const TRACE_STOP = '__PHASE188_TRACE_STOP__';

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

function runPushErrorHandlerCall(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  const beforeSlots = snapshotWatchedSlots(mem);
  const beforeRomErrSpArea = snapshotErrSpArea(mem, ROM_ERRSP_ADDR);
  const beforeTaskErrSpArea = snapshotErrSpArea(mem, TASK_ERRSP_ADDR);

  cpu._hl = HLPAYLOAD_TARGET;
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_RET);

  const callStackBefore = {
    sp: hex(cpu.sp),
    bytes: hexBytes(mem, cpu.sp & 0xFFFFFF, 18),
  };

  const callResult = runUntilHitSegmented(
    executor,
    PUSH_ERROR_HANDLER_ENTRY,
    'adl',
    { ret: PUSH_ERROR_HANDLER_RET },
    PUSH_ERROR_HANDLER_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );

  const afterSlots = snapshotWatchedSlots(mem);
  const afterRomErrSpArea = snapshotErrSpArea(mem, ROM_ERRSP_ADDR);
  const afterTaskErrSpArea = snapshotErrSpArea(mem, TASK_ERRSP_ADDR);

  return {
    entry: hex(PUSH_ERROR_HANDLER_ENTRY),
    hlPayload: hex(HLPAYLOAD_TARGET),
    returnSentinel: hex(PUSH_ERROR_HANDLER_RET),
    beforeSlots,
    beforeRomErrSpArea,
    beforeTaskErrSpArea,
    callStackBefore,
    callResult: {
      hit: callResult.hit,
      steps: callResult.steps,
      lastPc: hex(callResult.lastPc),
      lastMode: callResult.lastMode,
      termination: callResult.termination,
      errorMessage: callResult.errorMessage,
    },
    afterSlots,
    afterRomErrSpArea,
    afterTaskErrSpArea,
    cpuAfter: snapshotCpu(cpu),
    stackAfter: {
      sp: hex(cpu.sp),
      bytes: hexBytes(mem, cpu.sp & 0xFFFFFF, 24),
    },
  };
}

function runParseInpWithIntercept(executor, cpu, mem) {
  const log = {
    interceptFired: false,
    interceptCount: 0,
    jErrorFired: false,
    ldSpErrSpFired: false,
    hlPayloadReached: false,
    blocksVisited: [],
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

          if (normalizedPc >= 0x03E180 && normalizedPc <= 0x03E1E0) {
            log.blocksVisited.push({
              step: totalSteps,
              pc: hex(normalizedPc),
              mode,
              sp: hex(cpu.sp),
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
            const interceptError = new Error('__INTERCEPT__');
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
    op1: hexBytes(mem, OP1_ADDR, 9),
    errNo_iy0c: hex(mem[(cpu._iy + 0x0C) & 0xFFFFFF], 2),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
  };

  return log;
}

function main() {
  console.log('=== Phase 188: PushErrorHandler pre-call + ParseInp recovery probe ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('[1] Booting and preparing parser state...');
  const setup = prepareMinimalParserState(executor, cpu, mem);
  console.log('  Boot:', JSON.stringify(setup.boot));
  console.log('  MemInit:', JSON.stringify(setup.memInit));
  console.log('  CreateReal:', JSON.stringify(setup.createReal));
  console.log('  BufInserts:', JSON.stringify(setup.bufInsertRuns));
  console.log('  EditBuffer:', JSON.stringify(setup.editBuffer));
  console.log('  ParserPtrs:', JSON.stringify(setup.parserPointers));
  console.log('  AllocPtrs:', JSON.stringify(setup.allocatorPointers));

  console.log('\n[2] Calling PushErrorHandler before ParseInp...');
  const pushErrorHandler = runPushErrorHandlerCall(executor, cpu, mem);
  console.log('  Entry:', pushErrorHandler.entry);
  console.log('  HL payload:', pushErrorHandler.hlPayload);
  console.log('  Return sentinel:', pushErrorHandler.returnSentinel);
  console.log('  Slots before call:', JSON.stringify(pushErrorHandler.beforeSlots));
  console.log('  ROM errSP area before call:', JSON.stringify(pushErrorHandler.beforeRomErrSpArea));
  console.log('  Task errSP area before call:', JSON.stringify(pushErrorHandler.beforeTaskErrSpArea));
  console.log('  Call stack before:', JSON.stringify(pushErrorHandler.callStackBefore));
  console.log('  Call result:', JSON.stringify(pushErrorHandler.callResult));
  console.log('  Slots after call:', JSON.stringify(pushErrorHandler.afterSlots));
  console.log('  ROM errSP area after call:', JSON.stringify(pushErrorHandler.afterRomErrSpArea));
  console.log('  Task errSP area after call:', JSON.stringify(pushErrorHandler.afterTaskErrSpArea));
  console.log('  CPU after call:', JSON.stringify(pushErrorHandler.cpuAfter));
  console.log('  Stack after call:', JSON.stringify(pushErrorHandler.stackAfter));

  cpu.sp -= 3;
  write24(mem, cpu.sp, PARSEINP_RET);

  console.log('\n[3] Running ParseInp with z80-mode RET intercept...');
  console.log('  SP before ParseInp:', hex(cpu.sp));
  console.log('  Return sentinel:', hex(PARSEINP_RET));
  console.log('  Stack top 24 bytes:', hexBytes(mem, cpu.sp & 0xFFFFFF, 24));

  const parseResult = runParseInpWithIntercept(executor, cpu, mem);

  console.log('\n=== RESULTS ===');
  console.log('  PushErrorHandler completed:', pushErrorHandler.callResult.hit === 'ret');
  console.log('  PushErrorHandler steps:', pushErrorHandler.callResult.steps);
  console.log('  ParseInp intercept fired:', parseResult.interceptFired);
  console.log('  ParseInp intercept count:', parseResult.interceptCount);
  console.log('  JError fired:', parseResult.jErrorFired);
  console.log('  JError LD SP,(errSP) fired:', parseResult.ldSpErrSpFired);
  console.log('  hlPayload reached:', parseResult.hlPayloadReached);

  if (parseResult.notableEvents.length > 0) {
    console.log('\n  Notable events:');
    for (const event of parseResult.notableEvents) {
      console.log('   ', JSON.stringify(event));
    }
  }

  if (parseResult.blocksVisited.length > 0) {
    console.log('\n  Blocks in intercept zone (0x03E180-0x03E1E0):');
    for (const block of parseResult.blocksVisited) {
      console.log('   ', JSON.stringify(block));
    }
  }

  console.log('\n  Final state:', JSON.stringify(parseResult.finalState, null, 2));

  console.log('\n=== SUMMARY ===');
  if (pushErrorHandler.callResult.hit !== 'ret') {
    console.log(`  Pre-call at ${hex(PUSH_ERROR_HANDLER_ENTRY)} did not return via the sentinel.`);
  } else {
    console.log(`  Pre-call at ${hex(PUSH_ERROR_HANDLER_ENTRY)} returned after ${pushErrorHandler.callResult.steps} steps.`);
  }
  if (parseResult.hlPayloadReached) {
    console.log(`  JError recovery reached ${hex(HLPAYLOAD_TARGET)}.`);
    console.log(`  OP1: ${parseResult.finalState.op1}`);
    console.log(`  err regs: ROM=${parseResult.finalState.watchedSlots.romErrNo}, TASK=${parseResult.finalState.watchedSlots.taskErrNo}, IY+0x0C=${parseResult.finalState.errNo_iy0c}`);
  } else {
    console.log(`  JError recovery did not reach ${hex(HLPAYLOAD_TARGET)}.`);
    console.log(`  ParseInp hit sentinel: ${parseResult.finalState.hit ?? 'none'}`);
    console.log(`  Termination: ${parseResult.finalState.termination}`);
  }

  console.log('\nDone.');
}

main();
