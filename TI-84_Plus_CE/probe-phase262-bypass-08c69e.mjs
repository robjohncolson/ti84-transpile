#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPeripheralBus } from './peripherals.js';

const cpuRuntime = await import('./cpu-runtime.js');
const { createExecutor } = cpuRuntime;

// cpu-runtime.js currently exports createExecutor rather than createCPU.
// Keep a local createCPU-style helper so this probe still exposes the
// requested runtime shape without modifying shared runtime files.
function createCPU(blocks, mem, peripherals) {
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.pc = 0;
  return { cpu, executor, mem };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TRACE_ENTRY = 0x062055;
const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 5000;
const TRACE_MAX_LOOP_ITERATIONS = 8192;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const D0009B_ADDR = 0xD0009B;
const D0009D_ADDR = 0xD0009D;
const D000A5_ADDR = 0xD000A5;
const D0052C_ADDR = 0xD0052C;
const D0052D_ADDR = 0xD0052D;
const D00587_ADDR = 0xD00587;
const D0058C_ADDR = 0xD0058C;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D007D0_ADDR = 0xD007D0;
const D007E0_ADDR = 0xD007E0;

const DIGIT_ONE_SCAN_CODE = 0x22;
const DIGIT_ONE_KEY_CODE = 0x8F;
const DIGIT_ONE_MATRIX_INDEX = 4;
const DIGIT_ONE_MATRIX_BIT = 1;

const BYPASS_MASK = 0x20;
const GATE_ENTRY = 0x080151;
const GATE_BRANCH = 0x06205A;
const GATE_FALLTHROUGH = 0x06205C;
const PUTAWAY_ENTRY = 0x08C69E;
const PUTAWAY_FALLTHROUGH = 0x08C6A3;
const DISPATCH_JP_HL = 0x08C745;
const CXMAIN_ENTRY = 0x058241;
const CXMAIN_DISPATCH = 0x0585E9;
const COLD_BOOT_VECTOR = 0x000000;

const INTERESTING_TARGETS = [
  { addr: GATE_ENTRY, label: '0x080151 gate entry' },
  { addr: GATE_BRANCH, label: '0x06205A gate branch' },
  { addr: GATE_FALLTHROUGH, label: '0x06205C gate fallthrough' },
  { addr: PUTAWAY_ENTRY, label: '0x08C69E PutAway entry' },
  { addr: PUTAWAY_FALLTHROUGH, label: '0x08C6A3 PutAway fallthrough' },
  { addr: DISPATCH_JP_HL, label: '0x08C745 JP (HL)' },
  { addr: CXMAIN_ENTRY, label: '0x058241 cxMain entry' },
  { addr: CXMAIN_DISPATCH, label: '0x0585E9 cxMain dispatch' },
  { addr: COLD_BOOT_VECTOR, label: '0x000000 cold boot vector' },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24Raw(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function seedAscii(mem, start, text) {
  for (let index = 0; index < text.length; index += 1) {
    mem[start + index] = text.charCodeAt(index);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function snapshotTraceRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function formatRegs(regs) {
  return (
    `A=${hexByte(regs.a)} F=${hexByte(regs.f)} ` +
    `BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} ` +
    `IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)}`
  );
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return;
  }

  console.log(`[setup] ${path.basename(TRANSPILED_PATH)} missing, running transpiler first`);
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiler finished without creating ${TRANSPILED_PATH}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  ensureTranspiledModule();
  const moduleUrl = pathToFileURL(TRANSPILED_PATH).href;
  const romModule = await import(moduleUrl);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS ??
    romModule.default?.PRELIFTED_BLOCKS ??
    romModule.default ??
    romModule,
  );

  if (!blocks || !Object.keys(blocks).length) {
    throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  return blocks;
}

function createRuntime(romBytes, blocks, seededMem = null) {
  const mem = new Uint8Array(MEM_SIZE);
  if (seededMem) {
    mem.set(seededMem.subarray(0, Math.min(seededMem.length, MEM_SIZE)));
  } else {
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  }

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const runtime = createCPU(blocks, mem, peripherals);
  return {
    mem,
    peripherals,
    cpu: runtime.cpu,
    executor: runtime.executor,
  };
}

function runStage(executor, label, entry, mode, maxSteps, maxLoopIterations) {
  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
  });

  return {
    label,
    entry,
    steps: result.steps ?? 0,
    termination: result.termination ?? 'unknown',
    lastPc: result.lastPc ?? entry,
    lastMode: result.lastMode ?? mode,
  };
}

function runToStopPc(executor, entry, mode, stopPc, maxSteps, maxLoopIterations) {
  const STOP_TOKEN = '__PHASE262_STOP_PC__';
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;
  let termination = 'step_limit';
  let hitStop = false;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, _meta, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      hitStop = true;
      termination = 'stop_pc';
    } else {
      throw error;
    }
  }

  return {
    steps,
    lastPc,
    lastMode,
    termination,
    hitStop,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = runStage(executor, 'cold_boot', BOOT_ENTRY, BOOT_MODE, BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStage(executor, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', 100000, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStage(executor, 'post_init', POST_INIT_ENTRY, 'adl', 100, 32);

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    100000,
    TRACE_MAX_LOOP_ITERATIONS,
  );
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, postMemInitSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage1_statusbar', STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  mem[D0009B_ADDR] &= ~0x40;
  stages.push(runStage(executor, 'stage2_statusdots', STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  seedAscii(mem, MODE_BUF_START, MODE_BUF_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_BUF_TEXT);
  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage3_homerow', STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage4_history', STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  return stages;
}

function buildBaseline(romBytes, blocks) {
  const runtime = createRuntime(romBytes, blocks);
  const { executor, cpu, mem } = runtime;

  const bootInfo = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  if (!memInit.hitStop) {
    throw new Error(
      `memInit did not return via ${hex(MEM_INIT_RET)} ` +
      `(termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`,
    );
  }

  const postMemInitSnapshot = snapshotCpu(cpu);
  const homescreenStages = runHomescreenStages(executor, cpu, mem, postMemInitSnapshot);

  return {
    mem: new Uint8Array(mem),
    cpuSnapshot: snapshotCpu(cpu),
    summary: {
      bootInfo,
      memInit,
      homescreenStages,
      d000a5: mem[D000A5_ADDR] & 0xFF,
      d007d0: read24Raw(mem, D007D0_ADDR),
      d007e0: mem[D007E0_ADDR] & 0xFF,
    },
  };
}

function seedDigitOne(runtime) {
  const { mem, peripherals } = runtime;

  mem[D0052C_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0052D_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D00587_ADDR] = DIGIT_ONE_SCAN_CODE;
  mem[D0058C_ADDR] = DIGIT_ONE_SCAN_CODE;
  mem[D0058D_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0058E_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0009D_ADDR] |= 0x01;

  let keyMatrixValue = null;
  if (peripherals?.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.keyMatrix[DIGIT_ONE_MATRIX_INDEX] &= ~(1 << DIGIT_ONE_MATRIX_BIT);
    keyMatrixValue = peripherals.keyboard.keyMatrix[DIGIT_ONE_MATRIX_INDEX] & 0xFF;
    if (typeof peripherals.setKeyboardIRQ === 'function') {
      peripherals.setKeyboardIRQ(true);
    }
  }

  return {
    d0052c: mem[D0052C_ADDR] & 0xFF,
    d0052d: mem[D0052D_ADDR] & 0xFF,
    d00587: mem[D00587_ADDR] & 0xFF,
    d0058c: mem[D0058C_ADDR] & 0xFF,
    d0058d: mem[D0058D_ADDR] & 0xFF,
    d0058e: mem[D0058E_ADDR] & 0xFF,
    d0009d: mem[D0009D_ADDR] & 0xFF,
    keyMatrixIndex: DIGIT_ONE_MATRIX_INDEX,
    keyMatrixValue,
  };
}

function installD007E0AccessTracer(cpu, mem) {
  const reads = [];
  const writes = [];
  const context = {
    step: 0,
    pc: null,
    mode: 'adl',
  };

  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function currentPc() {
    return context.pc ?? (cpu._currentBlockPc ?? null);
  }

  function recordRead(addr, kind, startAddr) {
    const normalizedAddr = addr & 0xFFFFFF;
    if (normalizedAddr !== D007E0_ADDR) {
      return;
    }

    reads.push({
      step: context.step,
      pc: currentPc(),
      mode: context.mode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      addr: normalizedAddr,
      value: mem[normalizedAddr] & 0xFF,
    });
  }

  function recordWrite(addr, value, kind, startAddr) {
    const normalizedAddr = addr & 0xFFFFFF;
    if (normalizedAddr !== D007E0_ADDR) {
      return;
    }

    writes.push({
      step: context.step,
      pc: currentPc(),
      mode: context.mode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      addr: normalizedAddr,
      oldValue: mem[normalizedAddr] & 0xFF,
      newValue: value & 0xFF,
    });
  }

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    recordRead(addr, 'read8', addr);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    recordRead(addr, 'read16', addr);
    recordRead(addr + 1, 'read16', addr);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    recordRead(addr, 'read24', addr);
    recordRead(addr + 1, 'read24', addr);
    recordRead(addr + 2, 'read24', addr);
    return value;
  };

  cpu.write8 = (addr, value) => {
    recordWrite(addr, value, 'write8', addr);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite(addr, value, 'write16', addr);
    recordWrite(addr + 1, value >>> 8, 'write16', addr);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite(addr, value, 'write24', addr);
    recordWrite(addr + 1, value >>> 8, 'write24', addr);
    recordWrite(addr + 2, value >>> 16, 'write24', addr);
    return origWrite24(addr, value);
  };

  return {
    reads,
    writes,
    setContext(nextContext) {
      Object.assign(context, nextContext);
    },
    restore() {
      cpu.read8 = origRead8;
      cpu.read16 = origRead16;
      cpu.read24 = origRead24;
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function prepareTraceState(runtime, baselineCpuSnapshot) {
  const { cpu, mem } = runtime;

  restoreCpu(cpu, baselineCpuSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.a = 0x03;
  cpu.b = 0x03;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RETURN);
  cpu.pc = TRACE_ENTRY;

  const keySeed = seedDigitOne(runtime);
  const bypassBefore = cpu.mem[D000A5_ADDR] & 0xFF;
  cpu.mem[D000A5_ADDR] |= BYPASS_MASK;
  const bypassAfter = cpu.mem[D000A5_ADDR] & 0xFF;

  return {
    aSeed: cpu.a & 0xFF,
    bSeed: cpu.b & 0xFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    bypassBefore,
    bypassAfter,
    d007d0Before: read24Raw(mem, D007D0_ADDR),
    d007e0Before: mem[D007E0_ADDR] & 0xFF,
    keySeed,
  };
}

function finalizeRepeatedBlocks(visitCounts) {
  return [...visitCounts.entries()]
    .map(([pc, count]) => ({ pc, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.pc - right.pc;
    });
}

function runTraceCase(romBytes, blocks, baseline) {
  const runtime = createRuntime(romBytes, blocks, baseline.mem);
  const { executor, cpu, mem } = runtime;
  const setup = prepareTraceState(runtime, baseline.cpuSnapshot);
  const accessTracer = installD007E0AccessTracer(cpu, mem);

  const STOP_TOKEN = '__PHASE262_TRACE_STOP__';
  const seenBlocks = new Set();
  const uniqueBlocks = [];
  const visitCounts = new Map();
  const missingBlocks = [];
  const hits = Object.fromEntries(
    INTERESTING_TARGETS.map((target) => [
      target.addr,
      {
        label: target.label,
        reached: false,
        firstStep: null,
      },
    ]),
  );

  const putAwayEvents = [];
  const dispatchEvents = [];

  let pendingPutAway = null;
  let pendingDispatch = null;

  let steps = 0;
  let finalPc = TRACE_ENTRY;
  let finalMode = 'adl';
  let termination = 'step_limit';
  let errorMessage = null;
  let loopsForced = 0;

  function closePendingTransitions(nextPc, nextMode, stepNumber) {
    if (pendingPutAway) {
      putAwayEvents.push({
        enterStep: pendingPutAway.enterStep,
        nextStep: stepNumber,
        returnAddr: pendingPutAway.returnAddr,
        iy25Value: pendingPutAway.iy25Value,
        nextPc,
        nextMode,
        retNzTaken: nextPc === pendingPutAway.returnAddr,
        fellThrough: nextPc === PUTAWAY_FALLTHROUGH,
        d007d0Value: read24Raw(mem, D007D0_ADDR),
        d007e0Value: mem[D007E0_ADDR] & 0xFF,
        regsAfter: snapshotTraceRegs(cpu),
      });
      pendingPutAway = null;
    }

    if (pendingDispatch) {
      dispatchEvents.push({
        enterStep: pendingDispatch.enterStep,
        nextStep: stepNumber,
        hlAtEntry: pendingDispatch.hlAtEntry,
        topOfStack: pendingDispatch.topOfStack,
        nextPc,
        nextMode,
        jumpedToZero: nextPc === COLD_BOOT_VECTOR,
        jumpedToCxMain: nextPc === CXMAIN_ENTRY || nextPc === CXMAIN_DISPATCH,
        regsAfter: snapshotTraceRegs(cpu),
      });
      pendingDispatch = null;
    }
  }

  function noteVisit(pc, mode, step, missing) {
    const normalizedPc = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;

    steps = Math.max(steps, stepNumber);
    finalPc = normalizedPc;
    finalMode = mode ?? finalMode;
    accessTracer.setContext({
      step: stepNumber,
      pc: normalizedPc,
      mode: finalMode,
    });

    closePendingTransitions(normalizedPc, finalMode, stepNumber);

    visitCounts.set(normalizedPc, (visitCounts.get(normalizedPc) ?? 0) + 1);

    if (!seenBlocks.has(normalizedPc)) {
      seenBlocks.add(normalizedPc);
      uniqueBlocks.push({
        step: stepNumber,
        pc: normalizedPc,
        mode: finalMode,
        regs: snapshotTraceRegs(cpu),
        d007e0: mem[D007E0_ADDR] & 0xFF,
      });
    }

    if (missing) {
      missingBlocks.push({
        step: stepNumber,
        pc: normalizedPc,
        mode: finalMode,
      });
    }

    if (Object.hasOwn(hits, normalizedPc) && hits[normalizedPc].firstStep === null) {
      hits[normalizedPc].reached = true;
      hits[normalizedPc].firstStep = stepNumber;
    }

    if (normalizedPc === PUTAWAY_ENTRY) {
      pendingPutAway = {
        enterStep: stepNumber,
        returnAddr: read24Raw(mem, cpu.sp),
        iy25Value: mem[D000A5_ADDR] & 0xFF,
      };
    }

    if (normalizedPc === DISPATCH_JP_HL) {
      pendingDispatch = {
        enterStep: stepNumber,
        hlAtEntry: cpu.hl & 0xFFFFFF,
        topOfStack: read24Raw(mem, cpu.sp),
      };
    }

    if (normalizedPc === TRACE_RETURN) {
      const stop = new Error(STOP_TOKEN);
      stop.reason = 'return';
      throw stop;
    }
  }

  try {
    const result = executor.runFrom(TRACE_ENTRY, 'adl', {
      maxSteps: TRACE_STEP_LIMIT,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, _meta, step) {
        noteVisit(pc, mode, step, false);
      },
      onMissingBlock(pc, mode, step) {
        noteVisit(pc, mode, step, true);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xFFFFFF;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? termination;
    loopsForced = result.loopsForced ?? 0;

    if (result.error) {
      errorMessage = result.error?.stack ?? String(result.error);
    }
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      termination = error.reason ?? 'return';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  } finally {
    accessTracer.restore();
  }

  if (pendingPutAway) {
    putAwayEvents.push({
      enterStep: pendingPutAway.enterStep,
      nextStep: null,
      returnAddr: pendingPutAway.returnAddr,
      iy25Value: pendingPutAway.iy25Value,
      nextPc: null,
      nextMode: null,
      retNzTaken: false,
      fellThrough: false,
      d007d0Value: read24Raw(mem, D007D0_ADDR),
      d007e0Value: mem[D007E0_ADDR] & 0xFF,
      regsAfter: snapshotTraceRegs(cpu),
      unresolved: true,
    });
  }

  if (pendingDispatch) {
    dispatchEvents.push({
      enterStep: pendingDispatch.enterStep,
      nextStep: null,
      hlAtEntry: pendingDispatch.hlAtEntry,
      topOfStack: pendingDispatch.topOfStack,
      nextPc: null,
      nextMode: null,
      jumpedToZero: false,
      jumpedToCxMain: false,
      regsAfter: snapshotTraceRegs(cpu),
      unresolved: true,
    });
  }

  const repeatedBlocks = finalizeRepeatedBlocks(visitCounts);
  const coldBootVectorReached =
    finalPc === COLD_BOOT_VECTOR ||
    visitCounts.has(COLD_BOOT_VECTOR) ||
    dispatchEvents.some((entry) => entry.nextPc === COLD_BOOT_VECTOR);

  return {
    setup,
    run: {
      termination,
      steps,
      finalPc,
      finalMode,
      loopsForced,
      uniqueBlockCount: uniqueBlocks.length,
      missingBlockCount: missingBlocks.length,
      coldBootVectorReached,
      stepBudget: TRACE_STEP_LIMIT,
    },
    hits,
    putAwayEvents,
    dispatchEvents,
    d007e0Reads: accessTracer.reads,
    d007e0Writes: accessTracer.writes,
    uniqueBlocks,
    missingBlocks,
    repeatedBlocks,
    errorMessage,
    finalState: {
      d000a5: mem[D000A5_ADDR] & 0xFF,
      d007d0: read24Raw(mem, D007D0_ADDR),
      d007e0: mem[D007E0_ADDR] & 0xFF,
      regs: snapshotTraceRegs(cpu),
    },
  };
}

function printBootSummary(baseline) {
  const { bootInfo, memInit, homescreenStages, d000a5, d007d0, d007e0 } = baseline.summary;

  console.log('=== Phase 262: Bypass 0x08C69E via IY+0x25 bit 5 ===');
  console.log('Boot sequence: cold boot -> kernelInit -> postInit -> memInit -> homescreen stages 1-4');
  console.log('');

  for (const item of [bootInfo.boot, bootInfo.kernelInit, bootInfo.postInit, memInit, ...homescreenStages]) {
    console.log(
      `  ${item.label}: entry=${hex(item.entry)} steps=${item.steps} ` +
      `term=${item.termination} lastPc=${hex(item.lastPc)}`,
    );
  }

  console.log('');
  console.log(
    `Post-boot baseline: D000A5=${hexByte(d000a5)} ` +
    `D007D0=${hex(d007d0)} D007E0=${hexByte(d007e0)}`,
  );
  console.log('');
}

function printHits(hits) {
  console.log('Reached targets:');
  for (const target of INTERESTING_TARGETS) {
    const hit = hits[target.addr];
    if (hit.reached) {
      console.log(`  ${target.label}: YES at step ${hit.firstStep}`);
    } else {
      console.log(`  ${target.label}: NO`);
    }
  }
  console.log('');
}

function printPutAwayEvents(trace) {
  console.log('0x08C69E PutAway transitions:');
  if (trace.putAwayEvents.length === 0) {
    console.log('  (0x08C69E not reached)');
    console.log('');
    return;
  }

  for (const entry of trace.putAwayEvents) {
    const outcome = entry.unresolved
      ? 'UNRESOLVED'
      : entry.retNzTaken
        ? 'RET NZ taken'
        : entry.fellThrough
          ? 'fell through to 0x08C6A3'
          : 'other exit';
    console.log(
      `  enterStep=${entry.enterStep} nextStep=${entry.nextStep ?? 'n/a'} ` +
      `IY+0x25=${hexByte(entry.iy25Value)} returnAddr=${hex(entry.returnAddr)} ` +
      `nextPc=${hex(entry.nextPc)} outcome=${outcome}`,
    );
    console.log(
      `    D007D0=${hex(entry.d007d0Value)} D007E0=${hexByte(entry.d007e0Value)} ` +
      `${formatRegs(entry.regsAfter)}`,
    );
  }
  console.log('');
}

function printDispatchEvents(trace) {
  console.log('0x08C745 JP (HL) transitions:');
  if (trace.dispatchEvents.length === 0) {
    console.log('  (0x08C745 not reached)');
    console.log('');
    return;
  }

  for (const entry of trace.dispatchEvents) {
    const outcome = entry.unresolved
      ? 'UNRESOLVED'
      : entry.jumpedToZero
        ? 'jumped to cold boot vector'
        : entry.jumpedToCxMain
          ? 'jumped into cxMain'
          : 'jumped elsewhere';
    console.log(
      `  enterStep=${entry.enterStep} nextStep=${entry.nextStep ?? 'n/a'} ` +
      `HL@entry=${hex(entry.hlAtEntry)} stackTop=${hex(entry.topOfStack)} ` +
      `nextPc=${hex(entry.nextPc)} outcome=${outcome}`,
    );
    console.log(`    ${formatRegs(entry.regsAfter)}`);
  }
  console.log('');
}

function printD007E0Accesses(trace) {
  console.log(`D007E0 access log: reads=${trace.d007e0Reads.length} writes=${trace.d007e0Writes.length}`);

  if (trace.d007e0Reads.length === 0) {
    console.log('  reads: (none)');
  } else {
    console.log('  reads:');
    for (const entry of trace.d007e0Reads) {
      console.log(
        `    step=${String(entry.step).padStart(4, ' ')} pc=${hex(entry.pc)} ` +
        `value=${hexByte(entry.value)} via ${entry.kind}`,
      );
    }
  }

  if (trace.d007e0Writes.length === 0) {
    console.log('  writes: (none)');
  } else {
    console.log('  writes:');
    for (const entry of trace.d007e0Writes) {
      console.log(
        `    step=${String(entry.step).padStart(4, ' ')} pc=${hex(entry.pc)} ` +
        `${hexByte(entry.oldValue)} -> ${hexByte(entry.newValue)} via ${entry.kind}`,
      );
    }
  }

  console.log('');
}

function printMissingBlocks(trace) {
  console.log(`Missing blocks (${trace.missingBlocks.length}):`);
  if (trace.missingBlocks.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of trace.missingBlocks) {
      console.log(
        `  step=${String(entry.step).padStart(4, ' ')} pc=${hex(entry.pc)} mode=${entry.mode}`,
      );
    }
  }
  console.log('');
}

function printRepeatedBlocks(trace) {
  const topBlocks = trace.repeatedBlocks.slice(0, 10);
  console.log('Most repeated blocks:');
  if (topBlocks.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of topBlocks) {
      console.log(`  pc=${hex(entry.pc)} count=${entry.count}`);
    }
  }
  console.log('');
}

function printUniqueBlocks(trace) {
  console.log(`Unique blocks visited (${trace.uniqueBlocks.length}):`);
  for (const [index, entry] of trace.uniqueBlocks.entries()) {
    console.log(
      `  [${String(index + 1).padStart(3, '0')}] step=${String(entry.step).padStart(4, ' ')} ` +
      `pc=${hex(entry.pc)} mode=${entry.mode} D007E0=${hexByte(entry.d007e0)} ${formatRegs(entry.regs)}`,
    );
  }
  console.log('');
}

function printTraceCase(trace) {
  console.log('=== Trace: 0x062055 with B=0x03 after forcing IY+0x25 bit 5 ===');
  console.log(
    `Seed: A=${hexByte(trace.setup.aSeed)} B=${hexByte(trace.setup.bSeed)} ` +
    `IX=${hex(trace.setup.ix)} IY=${hex(trace.setup.iy)} SP=${hex(trace.setup.sp)}`,
  );
  console.log(
    `Bypass: D000A5 ${hexByte(trace.setup.bypassBefore)} -> ${hexByte(trace.setup.bypassAfter)} ` +
    `(bit 5 set), pre-run D007D0=${hex(trace.setup.d007d0Before)} ` +
    `D007E0=${hexByte(trace.setup.d007e0Before)}`,
  );
  console.log(
    `Key seed: D00587=${hexByte(trace.setup.keySeed.d00587)} ` +
    `D0058C=${hexByte(trace.setup.keySeed.d0058c)} ` +
    `D0058D=${hexByte(trace.setup.keySeed.d0058d)} ` +
    `D0058E=${hexByte(trace.setup.keySeed.d0058e)} ` +
    `keyMatrix[${trace.setup.keySeed.keyMatrixIndex}]=${hexByte(trace.setup.keySeed.keyMatrixValue)}`,
  );
  console.log('');

  console.log(
    `Run result: term=${trace.run.termination} steps=${trace.run.steps}/${trace.run.stepBudget} ` +
    `finalPc=${hex(trace.run.finalPc)} finalMode=${trace.run.finalMode} ` +
    `uniqueBlocks=${trace.run.uniqueBlockCount} missingBlocks=${trace.run.missingBlockCount} ` +
    `loopsForced=${trace.run.loopsForced}`,
  );
  console.log(
    `Final state: D000A5=${hexByte(trace.finalState.d000a5)} ` +
    `D007D0=${hex(trace.finalState.d007d0)} D007E0=${hexByte(trace.finalState.d007e0)} ` +
    `${formatRegs(trace.finalState.regs)}`,
  );
  console.log(
    `Crash/loop summary: coldBootVectorReached=${trace.run.coldBootVectorReached ? 'YES' : 'NO'} ` +
    `stepLimitHit=${trace.run.termination === 'step_limit' ? 'YES' : 'NO'}`,
  );
  console.log('');

  printHits(trace.hits);
  printPutAwayEvents(trace);
  printDispatchEvents(trace);
  printD007E0Accesses(trace);
  printMissingBlocks(trace);
  printRepeatedBlocks(trace);
  printUniqueBlocks(trace);

  if (trace.errorMessage) {
    console.log('Error:');
    console.log(trace.errorMessage);
    console.log('');
  }

  console.log('Summary:');
  console.log(
    `  0x08C69E reached: ${trace.hits[PUTAWAY_ENTRY].reached ? 'YES' : 'NO'}; ` +
    `RET NZ taken: ${trace.putAwayEvents.some((entry) => entry.retNzTaken) ? 'YES' : 'NO'}`,
  );
  console.log(
    `  cxMain reached: ${trace.hits[CXMAIN_ENTRY].reached ? '0x058241' : 'NO'}; ` +
    `cxMain dispatch reached: ${trace.hits[CXMAIN_DISPATCH].reached ? '0x0585E9' : 'NO'}`,
  );
  console.log(`  D007E0 writes observed: ${trace.d007e0Writes.length}`);
  console.log(`  Final PC: ${hex(trace.run.finalPc)}`);
  console.log('');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  console.log('Building baseline (phase 261 boot sequence)...');
  const baseline = buildBaseline(romBytes, blocks);
  printBootSummary(baseline);

  const trace = runTraceCase(romBytes, blocks, baseline);
  printTraceCase(trace);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
