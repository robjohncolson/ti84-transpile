#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
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

const TRACE_ENTRY = 0x0584A3;
const BUF_INSERT_ENTRY = 0x05E2A0;
const BUF_INSERT_RANGE_START = 0x05E200;
const BUF_INSERT_RANGE_END = 0x05E2FF;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const IY_PLUS_68_ADDR = 0xD000C4;
const BIT5_MASK = 0x20;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const EDIT_BUF_ADDR = 0xD00A00;
const EDIT_BUF_LENGTH = 0x11;
const TOKEN_LENGTH = 9;
const DIGIT_4_TOKEN_SEED = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEM_INIT_RET = 0x7FFFF6;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 1000;
const OS_MAX_LOOP_ITERATIONS = 8192;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHexArray(mem, start, length) {
  return Array.from(mem.slice(start, start + length), (value) => hexByte(value));
}

function bytesToHexString(mem, start, length) {
  return bytesToHexArray(mem, start, length).join(' ');
}

function write24(mem, addr, value) {
  const normalizedAddr = addr & 0xFFFFFF;
  mem[normalizedAddr] = value & 0xFF;
  mem[normalizedAddr + 1] = (value >>> 8) & 0xFF;
  mem[normalizedAddr + 2] = (value >>> 16) & 0xFF;
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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase201-${process.pid}.mjs`);
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
  const error = new Error('__PHASE201_SENTINEL__');
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

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  mem.fill(0xFF, Math.max(0, stackTop - 0x60), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
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
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: {
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc),
    },
    postInit: {
      steps: postInit.steps,
      termination: postInit.termination,
      lastPc: hex(postInit.lastPc),
    },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
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
    iyPlus68AfterMemInit: hexByte(mem[IY_PLUS_68_ADDR]),
    baselineMem: new Uint8Array(mem),
  };
}

function createExperimentEnv(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  return { mem, cpu, executor };
}

function createTraceState() {
  return {
    uniqueBlocks: [],
    uniqueSet: new Set(),
    missingBlocks: [],
    missingSet: new Set(),
  };
}

function noteUniqueBlock(state, pc, mode, step) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);
  if (state.uniqueSet.has(renderedPc)) return;
  state.uniqueSet.add(renderedPc);
  state.uniqueBlocks.push({
    step: (step ?? 0) + 1,
    pc: renderedPc,
    mode: mode ?? 'adl',
  });
}

function noteMissingBlock(state, pc, mode, step) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);
  if (state.missingSet.has(renderedPc)) return;
  state.missingSet.add(renderedPc);
  state.missingBlocks.push({
    step: (step ?? 0) + 1,
    pc: renderedPc,
    mode: mode ?? 'adl',
  });
}

function isPcInRange(renderedPc, start, end) {
  const value = parseInt(String(renderedPc).slice(2), 16);
  return value >= start && value <= end;
}

function normalizeTermination(trace) {
  switch (trace.termination) {
    case 'max_steps':
      return 'step_limit';
    case 'halt':
      return 'HALT';
    case 'missing_block':
      return 'missing_block';
    case 'sleep':
      return 'sleep';
    case 'exception':
      return 'exception';
    case 'sentinel':
      return 'sentinel';
    default:
      return trace.termination ?? 'unknown';
  }
}

function prepareTrace(cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.set(DIGIT_4_TOKEN_SEED, TOKEN_STAGING_ADDR);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  cpu.hl = TOKEN_STAGING_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = STACK_TOP;
}

function runExtendedBit5Trace(baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  prepareTrace(cpu, mem);

  const iyPlus68Before = mem[IY_PLUS_68_ADDR] & 0xFF;
  mem[IY_PLUS_68_ADDR] = iyPlus68Before | BIT5_MASK;
  const iyPlus68AfterSetup = mem[IY_PLUS_68_ADDR] & 0xFF;

  const op1Before = bytesToHexString(mem, OP1_ADDR, TOKEN_LENGTH);
  const tokenStagingBefore = bytesToHexString(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH);
  const editBufferBefore = bytesToHexString(mem, EDIT_BUF_ADDR, EDIT_BUF_LENGTH);

  const trace = runUntilHit(
    executor,
    TRACE_ENTRY,
    'adl',
    {},
    TRACE_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
    {
      onBlock(pc, blockMode, _meta, step) {
        noteUniqueBlock(state, pc, blockMode, step);
      },
      onMissingBlock(pc, blockMode, step) {
        noteMissingBlock(state, pc, blockMode, step);
      },
    },
  );

  const blocksIn05E2xx = state.uniqueBlocks.filter((entry) => isPcInRange(entry.pc, BUF_INSERT_RANGE_START, BUF_INSERT_RANGE_END));
  const missingBlocksIn05E2xx = state.missingBlocks.filter((entry) => isPcInRange(entry.pc, BUF_INSERT_RANGE_START, BUF_INSERT_RANGE_END));
  const bufInsertReached = blocksIn05E2xx.some((entry) => entry.pc === hex(BUF_INSERT_ENTRY))
    || missingBlocksIn05E2xx.some((entry) => entry.pc === hex(BUF_INSERT_ENTRY));

  return {
    totalSteps: trace.steps,
    uniqueBlocks: state.uniqueBlocks.length,
    blockTrace: state.uniqueBlocks.slice(0, 200),
    bufInsertReached,
    blocksIn05E2xx,
    finalOP1: bytesToHexString(mem, OP1_ADDR, TOKEN_LENGTH),
    tokenStaging: bytesToHexString(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    editBuffer: bytesToHexString(mem, EDIT_BUF_ADDR, EDIT_BUF_LENGTH),
    termination: {
      reason: normalizeTermination(trace),
      raw: trace.termination ?? 'unknown',
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      errorMessage: trace.errorMessage,
    },
    traceContext: {
      entry: hex(TRACE_ENTRY),
      stepLimit: TRACE_MAX_STEPS,
      ix: hex(cpu.ix),
      hl: hex(cpu.hl),
      iyPlus68Before: hexByte(iyPlus68Before),
      iyPlus68AfterSetup: hexByte(iyPlus68AfterSetup),
      iyPlus68AfterRun: hexByte(mem[IY_PLUS_68_ADDR]),
      op1Before,
      tokenStagingBefore,
      editBufferBefore,
      missingBlocks: state.missingBlocks,
      missingBlocksIn05E2xx,
    },
  };
}

function main() {
  const baseline = createBaseline();
  const trace = runExtendedBit5Trace(baseline.baselineMem);

  console.log(JSON.stringify({
    probe: 'phase201-bit5-extended-trace',
    generatedAt: new Date().toISOString(),
    transpiledSource: {
      source: transpiledAssets.source,
      modulePath: transpiledAssets.source === 'js' ? TRANSPILED_JS_PATH : transpiledAssets.modulePath,
      usedTemporaryModule: Boolean(transpiledAssets.tempModulePath),
    },
    setup: {
      romPath: ROM_PATH,
      tokenStagingAddr: hex(TOKEN_STAGING_ADDR),
      op1Addr: hex(OP1_ADDR),
      editBufferWindow: `${hex(EDIT_BUF_ADDR)}-${hex(EDIT_BUF_ADDR + EDIT_BUF_LENGTH - 1)}`,
      iyPlus68Addr: hex(IY_PLUS_68_ADDR),
      bit5Mask: hexByte(BIT5_MASK),
      ix: hex(IX_ADDR),
      hlSeed: hex(TOKEN_STAGING_ADDR),
      tokenSeed: Array.from(DIGIT_4_TOKEN_SEED, (value) => hexByte(value)),
    },
    baselineSetup: {
      romBytesLoaded: baseline.romBytesLoaded,
      boot: baseline.boot,
      memInit: baseline.memInit,
      iyPlus68AfterMemInit: baseline.iyPlus68AfterMemInit,
    },
    totalSteps: trace.totalSteps,
    uniqueBlocks: trace.uniqueBlocks,
    blockTrace: trace.blockTrace,
    bufInsertReached: trace.bufInsertReached,
    blocksIn05E2xx: trace.blocksIn05E2xx,
    finalOP1: trace.finalOP1,
    tokenStaging: trace.tokenStaging,
    editBuffer: trace.editBuffer,
    termination: trace.termination,
    traceContext: trace.traceContext,
  }, null, 2));
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
