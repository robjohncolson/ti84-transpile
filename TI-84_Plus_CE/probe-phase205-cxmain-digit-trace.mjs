#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const REQUESTED_SP = 0xD1A860;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const CXMAIN_ENTRY = 0x0585E9;
const CLASS0_HANDLER = 0x05877A;
const CLASS0_FALLTHROUGH = 0x0587E0;
const CLASS0_NZ_TARGET = 0x0589E5;
const BUF_INSERT = 0x05E2A0;
const TOKEN_VALIDATOR = 0x09927F;

const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;
const IY_PLUS_9_ADDR = IY_ADDR + 9;
const IY_PLUS_12_ADDR = IY_ADDR + 12;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STEP_LIMIT = 5000;
const MAX_LOOP_ITERATIONS = 8192;

const WATCHED_PCS = [
  CXMAIN_ENTRY,
  CLASS0_HANDLER,
  CLASS0_FALLTHROUGH,
  CLASS0_NZ_TARGET,
  BUF_INSERT,
  TOKEN_VALIDATOR,
];

const DIGIT4_TOKEN = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const PLUS_TOKEN = Uint8Array.from([0x00, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const EXPERIMENTS = [
  {
    label: 'class0_digit4',
    classValue: 0x00,
    tokenLabel: 'digit4',
    tokenBytes: DIGIT4_TOKEN,
  },
  {
    label: 'class1_plus',
    classValue: 0x01,
    tokenLabel: 'plus',
    tokenBytes: PLUS_TOKEN,
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function resetOsState(cpu, mem) {
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
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }

  return { returned };
}

function createBaseline() {
  const mem = createMemory();
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    mem: new Uint8Array(mem),
    memInitReturned: memInit.returned,
  };
}

function snapshotEditPointers(mem) {
  return {
    top: hex(read24(mem, EDIT_TOP_ADDR)),
    cursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    tail: hex(read24(mem, EDIT_TAIL_ADDR)),
    bottom: hex(read24(mem, EDIT_BTM_ADDR)),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function buildHitMap() {
  return Object.fromEntries(
    WATCHED_PCS.map((pc) => [
      hex(pc),
      {
        reached: false,
        firstStep: null,
      },
    ])
  );
}

function seedExperiment(cpu, mem, spec) {
  resetOsState(cpu, mem);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + 9);
  mem.set(spec.tokenBytes, OP1_ADDR);
  mem.set(spec.tokenBytes, TOKEN_STAGING_ADDR);

  seedEditBuffer(mem);

  const iyPlus9Before = mem[IY_PLUS_9_ADDR] & 0xFF;
  const iyPlus12Before = mem[IY_PLUS_12_ADDR] & 0xFF;
  mem[IY_PLUS_12_ADDR] = iyPlus12Before & 0x7F;

  cpu.a = spec.classValue & 0xFF;
  cpu.b = spec.classValue & 0xFF;
  cpu.c = 0x00;
  cpu.d = 0x00;
  cpu.e = 0x00;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  mem.fill(0xFF, Math.max(0, REQUESTED_SP - 0x40), Math.min(mem.length, REQUESTED_SP + 0x10));
  cpu.sp = REQUESTED_SP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  return {
    requestedRegisters: {
      a: hexByte(spec.classValue),
      b: hexByte(spec.classValue),
      ix: hex(IX_ADDR),
      iy: hex(IY_ADDR),
      spRequested: hex(REQUESTED_SP),
      spAtEntry: hex(cpu.sp),
    },
    tokenBytes: bytesFor(spec.tokenBytes, 0, spec.tokenBytes.length),
    iyFlags: {
      iyPlus9: hexByte(iyPlus9Before),
      iyPlus12Before: hexByte(iyPlus12Before),
      iyPlus12After: hexByte(mem[IY_PLUS_12_ADDR]),
    },
    editPointers: snapshotEditPointers(mem),
    editBufferWindowBefore: bytesFor(mem, EDIT_BUF_START, 0x11),
  };
}

function runExperiment(baselineMem, spec) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);
  const setup = seedExperiment(cpu, mem, spec);

  const hits = buildHitMap();
  const visitedSet = new Set();
  const visitedBlocks = [];
  const missingSet = new Set();
  const missingBlocks = [];

  let steps = 0;
  let lastPc = CXMAIN_ENTRY;
  let termination = 'max_steps';
  let errorMessage = null;

  const notePc = (pc, step) => {
    const normalized = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;
    steps = Math.max(steps, stepNumber);
    lastPc = normalized;

    if (!visitedSet.has(normalized)) {
      visitedSet.add(normalized);
      visitedBlocks.push(hex(normalized));
    }

    const hit = hits[hex(normalized)];
    if (hit && hit.firstStep === null) {
      hit.reached = true;
      hit.firstStep = stepNumber;
    }

    if (normalized === RETURN_SENTINEL) {
      const error = new Error('__RET__');
      error.isReturnSentinel = true;
      throw error;
    }
  };

  try {
    const result = executor.runFrom(CXMAIN_ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        const normalized = pc & 0xFFFFFF;
        notePc(pc, step);
        if (!missingSet.has(normalized)) {
          missingSet.add(normalized);
          missingBlocks.push(hex(normalized));
        }
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.isReturnSentinel) {
      termination = 'return';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  return {
    label: spec.label,
    classValue: hexByte(spec.classValue),
    tokenLabel: spec.tokenLabel,
    setup,
    run: {
      entry: hex(CXMAIN_ENTRY),
      stepLimit: STEP_LIMIT,
      steps,
      termination,
      lastPc: hex(lastPc),
      uniqueBlockCount: visitedBlocks.length,
      uniqueMissingBlockCount: missingBlocks.length,
    },
    hits,
    uniqueBlocks: visitedBlocks,
    missingBlocks,
    final: {
      registers: {
        a: hexByte(cpu.a),
        b: hexByte(cpu.b),
        c: hexByte(cpu.c),
        d: hexByte(cpu.d),
        e: hexByte(cpu.e),
        f: hexByte(cpu.f),
        bc: hex(cpu.bc),
        de: hex(cpu.de),
        hl: hex(cpu.hl),
        sp: hex(cpu.sp),
        ix: hex(cpu.ix),
        iy: hex(cpu.iy),
      },
      iyFlags: {
        iyPlus9: hexByte(mem[IY_PLUS_9_ADDR]),
        iyPlus12: hexByte(mem[IY_PLUS_12_ADDR]),
      },
      editPointers: snapshotEditPointers(mem),
      editBufferD00A00_D00A10: bytesFor(mem, EDIT_BUF_START, 0x11),
      op1: bytesFor(mem, OP1_ADDR, 9),
      tokenStaging: bytesFor(mem, TOKEN_STAGING_ADDR, 9),
    },
    error: errorMessage,
  };
}

function summarizeExperiment(experiment) {
  return {
    reached05877A: experiment.hits[hex(CLASS0_HANDLER)].reached,
    reached0587E0: experiment.hits[hex(CLASS0_FALLTHROUGH)].reached,
    reached0589E5: experiment.hits[hex(CLASS0_NZ_TARGET)].reached,
    reached05E2A0: experiment.hits[hex(BUF_INSERT)].reached,
    reached09927F: experiment.hits[hex(TOKEN_VALIDATOR)].reached,
  };
}

function main() {
  const baseline = createBaseline();
  const experiments = Object.fromEntries(
    EXPERIMENTS.map((spec) => [spec.label, runExperiment(baseline.mem, spec)])
  );

  return {
    probe: 'probe-phase205-cxmain-digit-trace.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
      cxMainEntry: hex(CXMAIN_ENTRY),
      stepLimit: STEP_LIMIT,
    },
    watchedAddresses: {
      class0Handler05877A: hex(CLASS0_HANDLER),
      class0Fallthrough0587E0: hex(CLASS0_FALLTHROUGH),
      class0NzTarget0589E5: hex(CLASS0_NZ_TARGET),
      bufInsert05E2A0: hex(BUF_INSERT),
      tokenValidator09927F: hex(TOKEN_VALIDATOR),
    },
    experiments,
    summary: {
      class0_digit4: summarizeExperiment(experiments.class0_digit4),
      class1_plus: summarizeExperiment(experiments.class1_plus),
    },
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase205-cxmain-digit-trace.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
