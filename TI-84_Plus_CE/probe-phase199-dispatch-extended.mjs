#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as ez80Decoder from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const HOME_COPY9_BLOCK = 0x05849B;
const DISPATCH_HELPER_ENTRY = 0x09927F;
const BUF_INSERT_BLOCK = 0x05851C;
const BUF_INSERT_ENTRY = 0x05E2A0;

const PUSH_ERROR_HANDLER_ENTRY = 0x07C88B;
const PUSH_ERROR_HANDLER_TARGET = 0x099929;

const TOKEN_STAGING_ADDR = 0xD0230E;
const TOKEN_LENGTH = 9;
const OP1_ADDR = 0xD005F8;
const EDIT_BUF_ADDR = 0xD00A00;
const EDIT_BUF_WINDOW_LENGTH = 0x11;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;
const TASK_ERRSP_ADDR = 0xD008A1;
const TASK_ERRNO_ADDR = 0xD008AF;

const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_RESET_TOP = 0xD1A87E;
const EXPERIMENT_SP = 0xD1A860;
const MBASE = 0xD0;

const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const K4_KEY_CODE = 0x92;

const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;
const PUSH_ERROR_HANDLER_RET = 0x7FFFEA;
const SCENARIO_C_RET = 0x7FFFE6;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const PUSH_ERROR_HANDLER_MAX_STEPS = 8000;
const SCENARIO_AB_MAX_STEPS = 5000;
const SCENARIO_C_MAX_STEPS = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const RAM_WATCH_START = 0xD00000;
const RAM_WATCH_END = 0xE00000;
const WRITE_EVENT_LIMIT = 256;
const NOTABLE_HIT_LIMIT = 128;

const TOKEN_DIGIT_4 = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TOKEN_BYPASS_62 = Uint8Array.from([0x00, 0x62, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const NOTABLE_PCS = new Map([
  [HOME_COPY9_BLOCK, 'Copy9 staging block'],
  [0x0584A3, 'Copy9 entry'],
  [0x0584A7, 'KeyClassifier callsite'],
  [DISPATCH_HELPER_ENTRY, '0x09927F entry'],
  [0x082C50, '0x082C50'],
  [0x082C54, '0x082C54'],
  [0x082C58, '0x082C58'],
  [0x082C3F, '0x082C3F'],
  [0x099283, '0x099283'],
  [0x0972C3, '0x0972C3'],
  [0x058518, 'carry gate before BufInsert'],
  [BUF_INSERT_BLOCK, 'BufInsert pre-call block'],
  [BUF_INSERT_ENTRY, 'BufInsert entry'],
  [0x061DB2, 'JError'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function bytesToHexArray(mem, start, length) {
  const out = [];
  for (let i = 0; i < length; i += 1) out.push(hexByte(mem[(start + i) & 0xFFFFFF]));
  return out;
}

function cap(list, value, limit = WRITE_EVENT_LIMIT) {
  if (list.length < limit) list.push(value);
}

function carryFlag(flags) {
  return ((flags ?? 0) & 0x01) !== 0;
}

function ensureTranspiledAssets() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      source: 'js',
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const decompressed = gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH));
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase199-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, decompressed);
  return {
    source: 'gz',
    modulePath: tempModulePath,
    tempModulePath,
  };
}

const transpiledAssets = ensureTranspiledAssets();
const romModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE199_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations, handlers = {}) {
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, meta, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onBlock) handlers.onBlock(pc, blockMode, meta, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onMissingBlock) handlers.onMissingBlock(pc, blockMode, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
    });

    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: (result.lastPc ?? lastPc) & 0xFFFFFF,
      lastMode: result.lastMode ?? lastMode,
      termination: result.termination ?? null,
      errorMessage: result.error ? (result.error.stack || String(result.error)) : null,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        hit: error.hit,
        steps,
        lastPc: error.pc,
        lastMode,
        termination: 'sentinel',
        errorMessage: null,
      };
    }
    return {
      hit: null,
      steps,
      lastPc,
      lastMode,
      termination: 'exception',
      errorMessage: error?.stack || String(error),
    };
  }
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem) {
  const romBytes = fs.readFileSync(ROM_PATH);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function resetOsState(cpu, mem, stackTop = STACK_RESET_TOP) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x40));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_RESET_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function createCPU(mem, peripherals) {
  const executor = cpuRuntime.createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.memInit = () => runMemInit(executor, cpu, mem);
  return { cpu, executor };
}

function createBaseline() {
  const mem = createMemory();
  const romBytesLoaded = loadROM(mem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  cpu.mbase = MBASE;
  const boot = coldBoot(executor, cpu, mem);
  const memInit = cpu.memInit();

  return {
    romBytesLoaded,
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: hex(memInit.lastPc),
      errorMessage: memInit.errorMessage,
    },
    baselineMem: new Uint8Array(mem),
  };
}

function createExperimentEnv(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  return { mem, cpu, executor };
}

function pushReturnSentinel(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value);
}

function snapshotCpu(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    carry: carryFlag(cpu.f),
    sp: hex(cpu.sp),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    mbase: hex(cpu.mbase, 2),
    madl: cpu.madl ? 'adl' : 'z80',
  };
}

function snapshotErrState(mem) {
  return {
    romErrSp: hex(read24(mem, ROM_ERRSP_ADDR)),
    romErrNo: hexByte(mem[ROM_ERRNO_ADDR]),
    taskErrSp: hex(read24(mem, TASK_ERRSP_ADDR)),
    taskErrNo: hexByte(mem[TASK_ERRNO_ADDR]),
  };
}

function snapshotFrame(mem, pointerAddr, length = 18) {
  const frameBase = read24(mem, pointerAddr);
  return {
    frameBase: hex(frameBase),
    frameBytes: bytesToHexArray(mem, frameBase, length),
  };
}

function snapshotEditBufferWindow(mem) {
  return bytesToHexArray(mem, EDIT_BUF_ADDR, EDIT_BUF_WINDOW_LENGTH);
}

function seedTokenStaging(mem, seedBytes) {
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.set(seedBytes, TOKEN_STAGING_ADDR);
}

function seedOp1(mem, seedBytes) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  mem.set(seedBytes, OP1_ADDR);
}

function configureDispatchCpu(cpu, keyCode = K4_KEY_CODE) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.a = keyCode & 0xFF;
}

function configureDispatchMemory(mem, keyCode = K4_KEY_CODE) {
  mem[KBD_KEY_ADDR] = keyCode & 0xFF;
  mem[KBD_GETKY_ADDR] = keyCode & 0xFF;
}

function createTraceState(trackRamWrites = false) {
  return {
    uniqueBlocks: [],
    uniqueSet: new Set(),
    missingBlockEvents: [],
    notableHits: [],
    bufInsertBlockHits: [],
    bufInsertEntryHits: [],
    currentStep: 0,
    ramWrites: trackRamWrites ? {
      byteMap: new Map(),
      events: [],
    } : null,
  };
}

function noteBlock(state, cpu, pc, mode, step) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);

  if (!state.uniqueSet.has(renderedPc)) {
    state.uniqueSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }

  const label = NOTABLE_PCS.get(normalizedPc);
  if (label) {
    cap(state.notableHits, {
      step: (step ?? 0) + 1,
      pc: renderedPc,
      label,
      mode,
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      sp: hex(cpu.sp),
    }, NOTABLE_HIT_LIMIT);
  }

  if (normalizedPc === BUF_INSERT_BLOCK) {
    cap(state.bufInsertBlockHits, { step: (step ?? 0) + 1, pc: renderedPc, mode }, NOTABLE_HIT_LIMIT);
  }

  if (normalizedPc === BUF_INSERT_ENTRY) {
    cap(state.bufInsertEntryHits, { step: (step ?? 0) + 1, pc: renderedPc, mode }, NOTABLE_HIT_LIMIT);
  }
}

function noteMissingBlock(state, pc, mode, step) {
  cap(state.missingBlockEvents, {
    step: (step ?? 0) + 1,
    pc: hex(pc),
    mode,
  }, WRITE_EVENT_LIMIT);
}

function installRamWriteWatch(cpu, mem, state) {
  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordWrite(addr, width, beforeBytes) {
    const touched = [];
    for (let i = 0; i < width; i += 1) {
      const byteAddr = (addr + i) & 0xFFFFFF;
      if (byteAddr < RAM_WATCH_START || byteAddr >= RAM_WATCH_END) continue;
      const after = mem[byteAddr] & 0xFF;
      const before = beforeBytes[i] & 0xFF;
      const existing = state.ramWrites.byteMap.get(byteAddr);
      if (existing) {
        existing.after = after;
      } else {
        state.ramWrites.byteMap.set(byteAddr, { before, after });
      }
      touched.push({
        addr: hex(byteAddr),
        before: hexByte(before),
        after: hexByte(after),
      });
    }

    if (touched.length === 0) return;

    cap(state.ramWrites.events, {
      step: (state.currentStep ?? 0) + 1,
      blockPc: hex(cpu._currentBlockPc ?? cpu.pc ?? 0),
      writeAddr: hex(addr),
      width,
      touched,
    }, WRITE_EVENT_LIMIT);
  }

  function wrap(width, fn) {
    return (addr, value) => {
      const normalizedAddr = Number(addr) & 0xFFFFFF;
      const beforeBytes = [];
      for (let i = 0; i < width; i += 1) beforeBytes.push(mem[(normalizedAddr + i) & 0xFFFFFF] & 0xFF);
      fn(normalizedAddr, value);
      recordWrite(normalizedAddr, width, beforeBytes);
    };
  }

  cpu.write8 = wrap(1, original.write8);
  cpu.write16 = wrap(2, original.write16);
  cpu.write24 = wrap(3, original.write24);

  return () => {
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function summarizeModifiedRanges(byteMap) {
  const addresses = [...byteMap.keys()].sort((a, b) => a - b);
  if (addresses.length === 0) return [];

  const ranges = [];
  let rangeStart = addresses[0];
  let rangeEnd = addresses[0];

  function flush(start, end) {
    const before = [];
    const after = [];
    for (let addr = start; addr <= end; addr += 1) {
      const entry = byteMap.get(addr);
      before.push(hexByte(entry.before));
      after.push(hexByte(entry.after));
    }
    ranges.push({
      start: hex(start),
      end: hex(end),
      length: end - start + 1,
      before,
      after,
    });
  }

  for (let i = 1; i < addresses.length; i += 1) {
    const addr = addresses[i];
    if (addr === rangeEnd + 1) {
      rangeEnd = addr;
      continue;
    }
    flush(rangeStart, rangeEnd);
    rangeStart = addr;
    rangeEnd = addr;
  }

  flush(rangeStart, rangeEnd);
  return ranges;
}

function describeStop(trace) {
  if (trace.hit === 'ret') return 'return sentinel';
  if (trace.termination === 'max_steps') return 'step limit';
  if (trace.termination === 'missing_block') return 'missing block';
  if (trace.termination === 'halt') return 'halt';
  if (trace.termination === 'sleep') return 'sleep';
  if (trace.termination === 'exception') return 'exception';
  return trace.termination ?? 'unknown';
}

function runTrackedTrace(executor, cpu, mem, entry, mode, stepLimit, returnSentinel, { trackRamWrites = false } = {}) {
  const state = createTraceState(trackRamWrites);
  const releaseRamWatch = trackRamWrites ? installRamWriteWatch(cpu, mem, state) : null;

  let trace;
  try {
    trace = runUntilHit(
      executor,
      entry,
      mode,
      { ret: returnSentinel },
      stepLimit,
      OS_MAX_LOOP_ITERATIONS,
      {
        onBlock(pc, blockMode, _meta, step) {
          state.currentStep = step ?? 0;
          noteBlock(state, cpu, pc, blockMode, step);
        },
        onMissingBlock(pc, blockMode, step) {
          state.currentStep = step ?? 0;
          noteMissingBlock(state, pc, blockMode, step);
        },
      },
    );
  } finally {
    if (releaseRamWatch) releaseRamWatch();
  }

  return {
    hit: trace.hit,
    steps: trace.steps,
    termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
    stopReason: describeStop(trace),
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    errorMessage: trace.errorMessage,
    uniqueBlockCount: state.uniqueBlocks.length,
    uniqueBlocks: state.uniqueBlocks,
    missingBlockEvents: state.missingBlockEvents,
    bufInsertBlockReached: state.bufInsertBlockHits.length > 0,
    bufInsertEntryReached: state.bufInsertEntryHits.length > 0,
    bufInsertHits: {
      block05851C: state.bufInsertBlockHits,
      entry05E2A0: state.bufInsertEntryHits,
    },
    notableHits: state.notableHits,
    ramWrites: state.ramWrites ? {
      eventCount: state.ramWrites.events.length,
      uniqueByteCount: state.ramWrites.byteMap.size,
      events: state.ramWrites.events,
      modifiedRanges: summarizeModifiedRanges(state.ramWrites.byteMap),
    } : null,
  };
}

function callPushErrorHandler(executor, cpu, mem) {
  const beforeErrState = snapshotErrState(mem);
  const beforeRomErrFrame = snapshotFrame(mem, ROM_ERRSP_ADDR);
  const beforeTaskErrFrame = snapshotFrame(mem, TASK_ERRSP_ADDR);

  configureDispatchCpu(cpu, 0x00);
  cpu.hl = PUSH_ERROR_HANDLER_TARGET;
  pushReturnSentinel(cpu, mem, PUSH_ERROR_HANDLER_RET);

  const trace = runUntilHit(
    executor,
    PUSH_ERROR_HANDLER_ENTRY,
    'adl',
    { ret: PUSH_ERROR_HANDLER_RET },
    PUSH_ERROR_HANDLER_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );

  return {
    entry: hex(PUSH_ERROR_HANDLER_ENTRY),
    target: hex(PUSH_ERROR_HANDLER_TARGET),
    steps: trace.steps,
    hit: trace.hit,
    termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
    stopReason: describeStop(trace),
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    cpuAfter: snapshotCpu(cpu),
    errStateBefore: beforeErrState,
    errStateAfter: snapshotErrState(mem),
    romErrFrameBefore: beforeRomErrFrame,
    taskErrFrameBefore: beforeTaskErrFrame,
    romErrFrameAfter: snapshotFrame(mem, ROM_ERRSP_ADDR),
    taskErrFrameAfter: snapshotFrame(mem, TASK_ERRSP_ADDR),
    errorMessage: trace.errorMessage,
  };
}

function runScenarioA(baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  resetOsState(cpu, mem, EXPERIMENT_SP);
  configureDispatchMemory(mem, K4_KEY_CODE);
  seedTokenStaging(mem, TOKEN_DIGIT_4);
  seedOp1(mem, Uint8Array.from(TOKEN_DIGIT_4));

  const before = {
    tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    editBufferWindow: snapshotEditBufferWindow(mem),
    errState: snapshotErrState(mem),
  };

  const pushErrorHandler = callPushErrorHandler(executor, cpu, mem);
  if (pushErrorHandler.hit !== 'ret') {
    return {
      id: 'A',
      label: 'PushErrorHandler bypass',
      entry: hex(HOME_COPY9_BLOCK),
      stepLimit: SCENARIO_AB_MAX_STEPS,
      tokenSeed: Array.from(TOKEN_DIGIT_4, (value) => hexByte(value)),
      before,
      pushErrorHandler,
      setupFailed: true,
      reason: 'PushErrorHandler did not return via the sentinel.',
    };
  }

  configureDispatchCpu(cpu, K4_KEY_CODE);
  pushReturnSentinel(cpu, mem, TRACE_RET);

  const trace = runTrackedTrace(
    executor,
    cpu,
    mem,
    HOME_COPY9_BLOCK,
    'adl',
    SCENARIO_AB_MAX_STEPS,
    TRACE_RET,
  );

  return {
    id: 'A',
    label: 'PushErrorHandler bypass',
    entry: hex(HOME_COPY9_BLOCK),
    stepLimit: SCENARIO_AB_MAX_STEPS,
    tokenSeed: Array.from(TOKEN_DIGIT_4, (value) => hexByte(value)),
    before,
    pushErrorHandler,
    after: {
      tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
      op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
      editBufferWindow: snapshotEditBufferWindow(mem),
      errState: snapshotErrState(mem),
      cpu: snapshotCpu(cpu),
    },
    trace: {
      ...trace,
      bufInsertReached: trace.bufInsertBlockReached || trace.bufInsertEntryReached,
    },
  };
}

function runScenarioB(baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  resetOsState(cpu, mem, EXPERIMENT_SP);
  configureDispatchMemory(mem, K4_KEY_CODE);
  seedTokenStaging(mem, TOKEN_BYPASS_62);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  configureDispatchCpu(cpu, K4_KEY_CODE);
  pushReturnSentinel(cpu, mem, TRACE_RET);

  const before = {
    tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    editBufferWindow: snapshotEditBufferWindow(mem),
  };

  const trace = runTrackedTrace(
    executor,
    cpu,
    mem,
    HOME_COPY9_BLOCK,
    'adl',
    SCENARIO_AB_MAX_STEPS,
    TRACE_RET,
  );

  return {
    id: 'B',
    label: 'TOKEN_STAGING[1] >= 0x5D bypass',
    entry: hex(HOME_COPY9_BLOCK),
    stepLimit: SCENARIO_AB_MAX_STEPS,
    tokenSeed: Array.from(TOKEN_BYPASS_62, (value) => hexByte(value)),
    before,
    after: {
      tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
      op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
      editBufferWindow: snapshotEditBufferWindow(mem),
      cpu: snapshotCpu(cpu),
    },
    trace: {
      ...trace,
      bufInsertReached: trace.bufInsertBlockReached || trace.bufInsertEntryReached,
    },
  };
}

function runScenarioC(baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  resetOsState(cpu, mem, EXPERIMENT_SP);
  seedOp1(mem, TOKEN_DIGIT_4);
  configureDispatchCpu(cpu, 0x00);
  pushReturnSentinel(cpu, mem, SCENARIO_C_RET);

  const before = {
    op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    editBufferWindow: snapshotEditBufferWindow(mem),
    cpu: snapshotCpu(cpu),
  };

  const trace = runTrackedTrace(
    executor,
    cpu,
    mem,
    DISPATCH_HELPER_ENTRY,
    'adl',
    SCENARIO_C_MAX_STEPS,
    SCENARIO_C_RET,
    { trackRamWrites: true },
  );

  return {
    id: 'C',
    label: 'Standalone 0x09927F investigation',
    entry: hex(DISPATCH_HELPER_ENTRY),
    stepLimit: SCENARIO_C_MAX_STEPS,
    before,
    after: {
      op1: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
      editBufferWindow: snapshotEditBufferWindow(mem),
      cpu: snapshotCpu(cpu),
    },
    trace: {
      ...trace,
      returned: trace.hit === 'ret',
      carryOnReturn: trace.hit === 'ret' ? carryFlag(cpu.f) : null,
      finalCarry: carryFlag(cpu.f),
      bufInsertReached: trace.bufInsertBlockReached || trace.bufInsertEntryReached,
    },
  };
}

function main() {
  const baseline = createBaseline();
  const scenarioA = runScenarioA(baseline.baselineMem);
  const scenarioB = runScenarioB(baseline.baselineMem);
  const scenarioC = runScenarioC(baseline.baselineMem);

  const payload = {
    probe: 'phase199-dispatch-extended',
    generatedAt: new Date().toISOString(),
    romPath: ROM_PATH,
    transpiledSource: {
      source: transpiledAssets.source,
      modulePath: transpiledAssets.source === 'js' ? TRANSPILED_JS_PATH : transpiledAssets.modulePath,
      usedTemporaryModule: Boolean(transpiledAssets.tempModulePath),
    },
    setup: {
      decoderLoaded: typeof ez80Decoder.decodeInstruction === 'function',
      entryPoints: {
        scenarioAB: hex(HOME_COPY9_BLOCK),
        scenarioC: hex(DISPATCH_HELPER_ENTRY),
      },
      bufInsertTargets: [hex(BUF_INSERT_BLOCK), hex(BUF_INSERT_ENTRY)],
      tokenStagingAddr: hex(TOKEN_STAGING_ADDR),
      op1Addr: hex(OP1_ADDR),
      editBufferWindow: `${hex(EDIT_BUF_ADDR)}-${hex(EDIT_BUF_ADDR + EDIT_BUF_WINDOW_LENGTH - 1)}`,
      mbase: hex(MBASE, 2),
      ix: hex(IX_ADDR),
      stepBudgets: {
        scenarioAB: SCENARIO_AB_MAX_STEPS,
        scenarioC: SCENARIO_C_MAX_STEPS,
        pushErrorHandler: PUSH_ERROR_HANDLER_MAX_STEPS,
      },
    },
    baselineSetup: {
      romBytesLoaded: baseline.romBytesLoaded,
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    scenarios: {
      A: scenarioA,
      B: scenarioB,
      C: scenarioC,
    },
    summary: {
      scenarioABufInsertReached: Boolean(scenarioA.trace?.bufInsertReached),
      scenarioBBufInsertReached: Boolean(scenarioB.trace?.bufInsertReached),
      scenarioCReturned: Boolean(scenarioC.trace?.returned),
      scenarioCCarryOnReturn: scenarioC.trace?.carryOnReturn ?? null,
      anyMissingBlockEvents: (
        (scenarioA.trace?.missingBlockEvents?.length ?? 0)
        + (scenarioB.trace?.missingBlockEvents?.length ?? 0)
        + (scenarioC.trace?.missingBlockEvents?.length ?? 0)
      ) > 0,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
}

try {
  main();
} finally {
  if (transpiledAssets.tempModulePath) {
    try {
      fs.unlinkSync(transpiledAssets.tempModulePath);
    } catch {
      // Best effort cleanup only.
    }
  }
}
