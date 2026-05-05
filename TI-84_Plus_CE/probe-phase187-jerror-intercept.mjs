#!/usr/bin/env node
/**
 * probe-phase187-jerror-intercept.mjs
 *
 * Tests whether hard-coding a PC intercept at the broken z80-mode RET
 * (block 0x03E1B1) fixes the JError handler chain so ParseInp errors
 * can be recovered.
 *
 * The z80-mode RET at 0x03E1B1 pops a 2-byte garbage value instead of
 * properly returning to ADL mode. The correct return is:
 *   PC = 0x03E1CA  (instruction after CALL 0x03E187 in the wrapper)
 *   madl = 1       (back to ADL mode)
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

// ── Constants ──────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;
const BUFINSERT_ENTRY = 0x05E2A0;
const PARSEINP_ENTRY = 0x099914;

const JERROR_ENTRY = 0x061DB2;
const JERROR_LD_SP_ERRSP = 0x061DCA;

const ERROR_WRAPPER_ENTRY = 0x03E1B4;
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

const TRACE_STOP = '__PHASE187_TRACE_STOP__';

// ── Utility helpers ────────────────────────────────────────────────

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

// ── Executor wrappers ──────────────────────────────────────────────

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

// ── Boot + setup (copied from phase186) ────────────────────────────

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

// ── Error handler frame setup (from phase186) ──────────────────────

function seedPushErrorHandlerFrame(cpu, mem, previousErrSp) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  const opsDelta = (read24(mem, OPS_ADDR) - read24(mem, OPBASE_ADDR)) & 0xFFFFFF;
  const fpsDelta = (read24(mem, FPS_ADDR) - read24(mem, FPSBASE_ADDR)) & 0xFFFFFF;

  // Build the PushErrorHandler-style frame on the stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, HLPAYLOAD_TARGET);  // hlPayload
  cpu.sp -= 3;
  write24(mem, cpu.sp, previousErrSp);     // previous errSP
  cpu.sp -= 3;
  write24(mem, cpu.sp, fpsDelta);          // FPS delta
  cpu.sp -= 3;
  write24(mem, cpu.sp, opsDelta);          // OPS delta
  cpu.sp -= 3;
  write24(mem, cpu.sp, ERROR_RESTORE_STUB); // error-restore stub
  cpu.sp -= 3;
  write24(mem, cpu.sp, NORMAL_RETURN_STUB); // normal-return stub

  const frameBase = cpu.sp & 0xFFFFFF;
  write24(mem, ROM_ERRSP_ADDR, frameBase);
  write24(mem, TASK_ERRSP_ADDR, frameBase);
  mem[TASK_ERRNO_ADDR] = 0x8D;
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x8D;

  return {
    frameBase: hex(frameBase),
    frameBytes: hexBytes(mem, frameBase, 18),
    previousErrSp: hex(previousErrSp),
  };
}

// ── Snapshot helpers ───────────────────────────────────────────────

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

// ── ParseInp with z80-mode RET intercept ───────────────────────────

function runParseInpWithIntercept(executor, cpu, mem) {
  const log = {
    interceptFired: false,
    interceptCount: 0,
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

  // Sentinels we watch for
  const sentinels = {
    ret: PARSEINP_RET,
    err: PARSEINP_ERR,
    normalReturn: NORMAL_RETURN_STUB,
    errorRestore: ERROR_RESTORE_STUB,
    hlPayload: HLPAYLOAD_TARGET,
  };

  // Notable addresses to log when visited
  const notableAddresses = {
    0x061DB2: 'JError entry',
    0x061DCA: 'JError LD SP,(errSP)',
    0x061DD1: 'error-restore stub',
    0x061E27: 'normal-return stub',
    0x03E1B4: 'error wrapper entry',
    0x03E187: 'error helper entry',
    0x03E191: 'RSMIX in helper',
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

          // Log notable addresses
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

          // Track blocks near the intercept zone
          if (normalizedPc >= 0x03E180 && normalizedPc <= 0x03E1E0) {
            log.blocksVisited.push({
              step: totalSteps,
              pc: hex(normalizedPc),
              mode,
              sp: hex(cpu.sp),
              madl: cpu.madl,
            });
          }

          // Check sentinels
          for (const [name, target] of Object.entries(sentinels)) {
            if (normalizedPc === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }

          // ── THE INTERCEPT ──
          // When we see the z80-mode RET block at 0x03E1B1 about to
          // execute, throw to prevent it from running and handle the
          // redirect in the catch block below.
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
            // Throw to prevent the block from executing
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
        // Apply the intercept: redirect to wrapper after helper
        cpu.madl = 1;
        currentPc = ERROR_WRAPPER_AFTER_HELPER;
        currentMode = 'adl';
        log.notableEvents.push({
          step: totalSteps,
          event: 'INTERCEPT APPLIED: pc -> 0x03E1CA, madl -> 1 (ADL)',
          spAfterIntercept: hex(cpu.sp),
        });
        // Continue the execution loop — don't break
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
    op1: hexBytes(mem, OP1_ADDR, 9),
    errNo_iy0c: hex(mem[(cpu._iy + 0x0C) & 0xFFFFFF], 2),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
  };

  return log;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 187: JError z80-mode RET intercept probe ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ── Stage 1: Boot + BufInsert setup ──
  console.log('[1] Booting and preparing parser state...');
  const setup = prepareMinimalParserState(executor, cpu, mem);
  console.log('  Boot:', JSON.stringify(setup.boot));
  console.log('  MemInit:', JSON.stringify(setup.memInit));
  console.log('  CreateReal:', JSON.stringify(setup.createReal));
  console.log('  BufInserts:', JSON.stringify(setup.bufInsertRuns));
  console.log('  EditBuffer:', JSON.stringify(setup.editBuffer));
  console.log('  ParserPtrs:', JSON.stringify(setup.parserPointers));
  console.log('  AllocPtrs:', JSON.stringify(setup.allocatorPointers));

  // ── Stage 2: Set up error handler frame ──
  console.log('\n[2] Seeding error handler frame...');
  const previousErrSp = read24(mem, ROM_ERRSP_ADDR);
  const frameInfo = seedPushErrorHandlerFrame(cpu, mem, previousErrSp);
  console.log('  Frame:', JSON.stringify(frameInfo));
  console.log('  Slots before ParseInp:', JSON.stringify(snapshotWatchedSlots(mem)));

  // Push ParseInp return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, PARSEINP_RET);

  console.log('  SP before ParseInp:', hex(cpu.sp));
  console.log('  Return sentinel:', hex(PARSEINP_RET));
  console.log('  Stack top 18 bytes:', hexBytes(mem, cpu.sp & 0xFFFFFF, 18));

  // ── Stage 3: Run ParseInp with intercept ──
  console.log('\n[3] Running ParseInp with z80-mode RET intercept...');
  const parseResult = runParseInpWithIntercept(executor, cpu, mem);

  console.log('\n=== INTERCEPT RESULTS ===');
  console.log('  Intercept fired:', parseResult.interceptFired);
  console.log('  Intercept count:', parseResult.interceptCount);

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

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const finalState = parseResult.finalState;
  if (parseResult.interceptFired) {
    console.log('  The z80-mode RET intercept FIRED.');
    if (finalState.hit === 'ret') {
      console.log('  ParseInp returned normally after intercept — SUCCESS!');
    } else if (finalState.hit === 'err') {
      console.log('  ParseInp hit the error sentinel — error was propagated.');
    } else if (finalState.hit === 'normalReturn') {
      console.log('  Normal return stub reached — error handler popped successfully.');
    } else if (finalState.hit === 'errorRestore') {
      console.log('  Error restore stub reached — error recovery path taken.');
    } else if (finalState.hit === 'hlPayload') {
      console.log('  hlPayload target reached — JError completed full recovery chain.');
    } else {
      console.log(`  Hit sentinel: ${finalState.hit ?? 'none'}`);
      console.log(`  Termination: ${finalState.termination}`);
    }
    console.log(`  errNo (ROM): ${finalState.watchedSlots.romErrNo}`);
    console.log(`  errNo (task): ${finalState.watchedSlots.taskErrNo}`);
    console.log(`  errNo (IY+0x0C): ${finalState.errNo_iy0c}`);
    console.log(`  OP1: ${finalState.op1}`);
  } else {
    console.log('  The z80-mode RET intercept did NOT fire.');
    console.log(`  Termination: ${finalState.termination}`);
    console.log(`  Last PC: ${finalState.cpu.pc}`);
  }

  console.log('\nDone.');
}

main();
