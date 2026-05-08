#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const DISPATCHER_ENTRY = 0x02FD8F;
const EVENT_LOOP_REENTRY = 0x02FD99;
const IDLE_HALT_PC = 0x040D40;
const HALT_RESUME_OFFSET = 2;

const STACK_TOP = 0xD1A87E;
const STACK_FILL_SPAN = 0x40;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const SEGMENT_STEP_LIMIT = 2000;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

const FIRST_HALT_STEP_LIMIT = 5000;
const MODE_SWEEP_STEP_LIMIT = 200;

const D00000_ADDR = 0xD00000;
const D0009D_ADDR = 0xD0009D;
const D003E0_ADDR = 0xD003E0;
const D0058C_ADDR = 0xD0058C;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const ERR_NO_ADDR = 0xD008DF;

const KEY_SCAN_CODE = 0x22;
const KEY_CODE_TWO = 0x8F;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const MODE_VALUES = [
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0xFF,
];

const WATCHED_BLOCKS = [
  { addr: 0x0585D3, label: 'JP (HL) dispatch table' },
  { addr: 0x0585E9, label: 'cxMain entry' },
  { addr: 0x05877A, label: 'cascading CP chain' },
  { addr: 0x058AC9, label: 'BufInsert gate' },
  { addr: 0x05E2A0, label: 'BufInsert' },
  { addr: 0x04EDD0, label: 'post-key handler' },
];

const STUB_CONFIGS = [
  { addr: 0x049656, action: 'ret', label: '0x049656 USB/timer HALT bypass' },
  { addr: 0x03FA09, action: 'load-key-ret', label: '0x03FA09 key delivery (A <- D0058E)' },
];

const STUB_MAP = new Map(STUB_CONFIGS.map((stub) => [stub.addr, stub]));

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) {
    return currentMode;
  }
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function installStepShim(cpu, executor, mem) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for block stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;

    const stub = STUB_MAP.get(pc);
    if (stub) {
      if (stub.action === 'load-key-ret') {
        this.a = mem[D0058E_ADDR & MEM_MASK] & 0xFF;
      }
      const retAddr = mem[this.sp & MEM_MASK]
        | (mem[(this.sp + 1) & MEM_MASK] << 8)
        | (mem[(this.sp + 2) & MEM_MASK] << 16);
      this.sp = (this.sp + 3) & 0xFFFFFF;
      this.pc = retAddr & 0xFFFFFF;
      return retAddr & 0xFFFFFF;
    }

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected block result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function snapshotMemoryFocus(mem) {
  return {
    d003e0: mem[D003E0_ADDR] & 0xFF,
    d0058e: mem[D0058E_ADDR] & 0xFF,
    d0059f: mem[D0059F_ADDR] & 0xFF,
    d007e0: mem[D007E0_ADDR] & 0xFF,
    d003e0Block: bytesToHex(mem, D003E0_ADDR, 0x20),
    d00580Block: bytesToHex(mem, D0058C_ADDR, 0x14),
    d007e0Block: bytesToHex(mem, D007E0_ADDR, 0x20),
    iyBlock: bytesToHex(mem, IY_BASE, 0x80),
  };
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase250-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function installD007E0WriteTracer(cpu, mem) {
  const writes = [];
  let currentPhase = 'unlabeled';
  let currentStep = 0;
  let currentPc = null;
  let currentMode = null;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value, kind, startAddr) {
    const norm = addr & 0xFFFFFF;
    if (norm !== D007E0_ADDR) {
      return;
    }
    writes.push({
      phase: currentPhase,
      step: currentStep,
      pc: currentPc,
      mode: currentMode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      addr: norm,
      oldValue: mem[norm] & 0xFF,
      newValue: value & 0xFF,
    });
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 'write8', addr);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value, 'write16', addr);
    recordByte(addr + 1, value >>> 8, 'write16', addr);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value, 'write24', addr);
    recordByte(addr + 1, value >>> 8, 'write24', addr);
    recordByte(addr + 2, value >>> 16, 'write24', addr);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext({ phase, step, pc, mode }) {
      currentPhase = phase ?? currentPhase;
      currentStep = step ?? currentStep;
      currentPc = pc ?? currentPc;
      currentMode = mode ?? currentMode;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations, tracer, phase) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const segmentBase = totalSteps;
    let observedSteps = 0;

    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
      onBlock(pc, dispatchMode, _meta, step) {
        observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = dispatchMode ?? lastMode;
        tracer?.setContext({
          phase,
          step: segmentBase + ((step ?? 0) + 1),
          pc: lastPc,
          mode: lastMode,
        });
      },
      onMissingBlock(pc, dispatchMode, step) {
        observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = dispatchMode ?? lastMode;
        tracer?.setContext({
          phase,
          step: segmentBase + ((step ?? 0) + 1),
          pc: lastPc,
          mode: lastMode,
        });
      },
    });

    totalSteps += Math.max(observedSteps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
    currentPc = lastPc;
    currentMode = lastMode;
    termination = result.termination ?? null;

    if (termination !== 'max_steps') {
      break;
    }
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
  };
}

function runToStopPc(executor, entry, mode, stopPc, totalMaxSteps, maxLoopIterations, tracer, phase) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitStop = false;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hitStop) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const segmentBase = totalSteps;
    let observedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, _meta, step) {
          observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
          lastPc = pc & 0xFFFFFF;
          lastMode = dispatchMode ?? lastMode;
          tracer?.setContext({
            phase,
            step: segmentBase + ((step ?? 0) + 1),
            pc: lastPc,
            mode: lastMode,
          });
          if (lastPc === stopPc) {
            throw new Error('__STOP_PC__');
          }
        },
        onMissingBlock(pc, dispatchMode, step) {
          observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
          lastPc = pc & 0xFFFFFF;
          lastMode = dispatchMode ?? lastMode;
          tracer?.setContext({
            phase,
            step: segmentBase + ((step ?? 0) + 1),
            pc: lastPc,
            mode: lastMode,
          });
          if (lastPc === stopPc) {
            throw new Error('__STOP_PC__');
          }
        },
      });

      totalSteps += Math.max(observedSteps, result.steps ?? 0);
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        break;
      }
    } catch (error) {
      totalSteps += observedSteps;
      if (error?.message === '__STOP_PC__') {
        hitStop = true;
        termination = 'stop_pc';
      } else {
        termination = 'exception';
        errorMessage = error?.stack ?? String(error);
      }
      break;
    }
  }

  if (!hitStop && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitStop,
    errorMessage,
  };
}

function coldBoot(executor, cpu, mem, tracer) {
  const boot = runStageInSegments(
    executor,
    BOOT_ENTRY,
    BOOT_MODE,
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
    tracer,
    'cold_boot',
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(
    executor,
    KERNEL_INIT_ENTRY,
    'adl',
    KERNEL_INIT_MAX_STEPS,
    10000,
    tracer,
    'kernel_init',
  );

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(
    executor,
    POST_INIT_ENTRY,
    'adl',
    POST_INIT_MAX_STEPS,
    32,
    tracer,
    'post_init',
  );

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
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem, tracer) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERR_NO_ADDR] = 0x00;

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
    tracer,
    'mem_init',
  );
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, cpuSnapshot, tracer) {
  const stages = [];

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s1 = runStageInSegments(
    executor,
    STAGE_1_ENTRY,
    'adl',
    30000,
    STAGE_MAX_LOOP_ITERATIONS,
    tracer,
    'stage1_statusbar',
  );
  stages.push({ label: 'stage1_statusbar', entry: STAGE_1_ENTRY, ...s1 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  mem[0xD0009B] &= ~0x40;
  const s2 = runStageInSegments(
    executor,
    STAGE_2_ENTRY,
    'adl',
    30000,
    STAGE_MAX_LOOP_ITERATIONS,
    tracer,
    'stage2_statusdots',
  );
  stages.push({ label: 'stage2_statusdots', entry: STAGE_2_ENTRY, ...s2 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s3 = runStageInSegments(
    executor,
    STAGE_3_ENTRY,
    'adl',
    50000,
    STAGE_MAX_LOOP_ITERATIONS,
    tracer,
    'stage3_homerow',
  );
  stages.push({ label: 'stage3_homerow', entry: STAGE_3_ENTRY, ...s3 });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s4 = runStageInSegments(
    executor,
    STAGE_4_ENTRY,
    'adl',
    50000,
    STAGE_MAX_LOOP_ITERATIONS,
    tracer,
    'stage4_history',
  );
  stages.push({ label: 'stage4_history', entry: STAGE_4_ENTRY, ...s4 });

  return stages;
}

function prepareEventLoopCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = DISPATCHER_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;

  const fillStart = Math.max(0, (cpu.sp - STACK_FILL_SPAN) & MEM_MASK);
  mem.fill(0xFF, fillStart, Math.min(MEM_SIZE, cpu.sp + 3));
  push24(cpu, mem, RETURN_SENTINEL);

  mem[D0058C_ADDR] = 0x00;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D0009D_ADDR] &= ~0x01;

  mem[D00000_ADDR] = 0xCC;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;
}

function stepUntilHalt(cpu, maxSteps, tracer, phase) {
  const firstVisitOrder = [];
  const seenBlocks = new Set();
  const stubbedCalls = [];

  for (let step = 0; step < maxSteps; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    const mode = cpu.madl ? 'adl' : 'z80';

    tracer?.setContext({
      phase,
      step: step + 1,
      pc,
      mode,
    });

    if (!seenBlocks.has(pc)) {
      seenBlocks.add(pc);
      firstVisitOrder.push(pc);
    }

    if (STUB_MAP.has(pc)) {
      stubbedCalls.push({ step: step + 1, pc });
    }

    const result = cpu.step();
    if (result === -1) {
      return {
        completed: true,
        haltPc: pc,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }

    if (result === -2) {
      return {
        completed: false,
        reason: 'sleep',
        finalPc: pc,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }

    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      return {
        completed: false,
        reason: 'returned_sentinel',
        finalPc: cpu.pc & 0xFFFFFF,
        steps: step + 1,
        firstVisitOrder,
        stubbedCalls,
      };
    }
  }

  return {
    completed: false,
    reason: 'step_limit',
    finalPc: cpu.pc & 0xFFFFFF,
    steps: maxSteps,
    firstVisitOrder,
    stubbedCalls,
  };
}

function seedDigitTwo(mem) {
  mem[D0058C_ADDR] = KEY_SCAN_CODE;
  mem[D0058E_ADDR] = KEY_CODE_TWO;
  mem[D0009D_ADDR] |= 0x01;
}

function runModeSweepCase(cpu, mem, modeValue, haltPc) {
  const cpuSnapshot = snapshotCpu(cpu);
  const memorySnapshot = new Uint8Array(mem);
  const beforeSnapshot = snapshotMemoryFocus(mem);

  const watchHits = Object.fromEntries(WATCHED_BLOCKS.map((watch) => [watch.addr, false]));
  const visitedBlocks = [];
  const seenBlocks = new Set();
  const syntheticReentries = [];

  let termination = 'step_limit';
  let errorMessage = null;
  let haltHitPc = null;
  let executedSteps = 0;
  let finalPc = haltPc;

  try {
    mem[D007E0_ADDR] = modeValue & 0xFF;
    seedDigitTwo(mem);

    cpu.halted = false;
    cpu.pc = (haltPc + HALT_RESUME_OFFSET) & 0xFFFFFF;

    for (let step = 0; step < MODE_SWEEP_STEP_LIMIT; step++) {
      const pc = cpu.pc & 0xFFFFFF;

      if (!seenBlocks.has(pc)) {
        seenBlocks.add(pc);
        visitedBlocks.push(pc);
      }

      if (Object.hasOwn(watchHits, pc)) {
        watchHits[pc] = true;
      }

      const result = cpu.step();
      executedSteps = step + 1;
      finalPc = cpu.pc & 0xFFFFFF;

      if (result === -1) {
        termination = 'halt';
        haltHitPc = pc;
        break;
      }

      if (result === -2) {
        termination = 'sleep';
        break;
      }

      if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
        syntheticReentries.push({
          step: step + 1,
          fromPc: pc,
          reentryPc: EVENT_LOOP_REENTRY,
          preservedKey: mem[D0058E_ADDR] & 0xFF,
        });
        cpu.halted = false;
        cpu.pc = EVENT_LOOP_REENTRY;
        cpu.sp = STACK_TOP;
        push24(cpu, mem, RETURN_SENTINEL);
        finalPc = cpu.pc & 0xFFFFFF;
      }
    }
  } catch (error) {
    termination = 'exception';
    errorMessage = error?.stack ?? String(error);
    finalPc = cpu.pc & 0xFFFFFF;
  }

  const afterSnapshot = snapshotMemoryFocus(mem);
  const finalState = {
    d0009d: mem[D0009D_ADDR] & 0xFF,
    d003e0: mem[D003E0_ADDR] & 0xFF,
    d0058c: mem[D0058C_ADDR] & 0xFF,
    d0058d: mem[D0058D_ADDR] & 0xFF,
    d0058e: mem[D0058E_ADDR] & 0xFF,
    d0059f: mem[D0059F_ADDR] & 0xFF,
    d007e0: mem[D007E0_ADDR] & 0xFF,
    d00824: mem[D00824_ADDR] & 0xFF,
    sp: cpu.sp & 0xFFFFFF,
  };

  mem.set(memorySnapshot);
  restoreCpu(cpu, cpuSnapshot);

  return {
    modeValue,
    beforeSnapshot,
    afterSnapshot,
    executedSteps,
    termination,
    haltHitPc,
    finalPc,
    errorMessage,
    visitedBlocks,
    syntheticReentries,
    watchHits,
    finalState,
  };
}

function formatHexDump(buffer, start, endInclusive) {
  const lines = [];
  for (let addr = start; addr <= endInclusive; addr += 16) {
    const lineEnd = Math.min(endInclusive, addr + 15);
    const bytes = [];
    for (let i = addr; i <= lineEnd; i++) {
      bytes.push((buffer[i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines.join('\n');
}

function printBootSummary(bootInfo, memInit, stages) {
  console.log('=== Phase 250: D007E0 Mode Sweep ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
  console.log('');
  console.log('Boot sequence:');
  console.log(`  cold boot: steps=${bootInfo.boot.steps} term=${bootInfo.boot.termination} lastPc=${hex(bootInfo.boot.lastPc)}`);
  console.log(`  kernelInit ${hex(KERNEL_INIT_ENTRY)}: steps=${bootInfo.kernelInit.steps} term=${bootInfo.kernelInit.termination} lastPc=${hex(bootInfo.kernelInit.lastPc)}`);
  console.log(`  postInit ${hex(POST_INIT_ENTRY)}: steps=${bootInfo.postInit.steps} term=${bootInfo.postInit.termination} lastPc=${hex(bootInfo.postInit.lastPc)}`);
  console.log(`  memInit ${hex(MEM_INIT_ENTRY)}: steps=${memInit.steps} term=${memInit.termination} hitStop=${memInit.hitStop} lastPc=${hex(memInit.lastPc)}`);
  for (const stage of stages) {
    console.log(`  ${stage.label}: entry=${hex(stage.entry)} steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)}`);
  }
  console.log('');
}

function printInitialHalt(initialRun, mem) {
  console.log('Idle HALT probe:');
  if (!initialRun.completed) {
    console.log(`  FAILED: reason=${initialRun.reason} steps=${initialRun.steps} finalPc=${hex(initialRun.finalPc)}`);
    console.log('');
    return;
  }

  console.log(`  First HALT reached at ${hex(initialRun.haltPc)} after ${initialRun.steps} block steps`);
  console.log(`  Expected idle HALT: ${hex(IDLE_HALT_PC)} (${initialRun.haltPc === IDLE_HALT_PC ? 'matched' : 'different'})`);
  console.log(`  D007E0 at HALT: ${hexByte(mem[D007E0_ADDR])}`);
  console.log(`  D0058E at HALT: ${hexByte(mem[D0058E_ADDR])}`);
  console.log('');
}

function printD007E0Trace(writeTrace) {
  console.log('D007E0 boot write trace (executed block writes only):');
  if (!writeTrace.length) {
    console.log('  No executed-block writes to D007E0 were observed before idle HALT.');
    console.log('');
    return;
  }

  for (const entry of writeTrace) {
    console.log(
      `  step=${String(entry.step).padStart(6, ' ')} phase=${entry.phase.padEnd(18)} ` +
      `pc=${hex(entry.pc)} mode=${entry.mode ?? 'n/a'} ${hexByte(entry.oldValue)} -> ${hexByte(entry.newValue)} via ${entry.kind}`,
    );
  }

  const last = writeTrace[writeTrace.length - 1];
  console.log('');
  console.log(`Last executed block to write D007E0 before idle HALT: ${hex(last.pc)} in ${last.phase}, ${hexByte(last.oldValue)} -> ${hexByte(last.newValue)}`);
  console.log('Note: phase249-style event-loop prep also seeds D007E0 directly to 0x40 before the idle-HALT probe.');
  console.log('');
}

function printRomDumps(romBytes) {
  console.log('ROM bytes 0x02FFAE-0x02FFD0:');
  console.log(formatHexDump(romBytes, 0x02FFAE, 0x02FFD0));
  console.log('');
  console.log('ROM bytes 0x022346-0x022380:');
  console.log(formatHexDump(romBytes, 0x022346, 0x022380));
  console.log('');
}

function printModeCase(result) {
  console.log(`Mode ${hexByte(result.modeValue)}: term=${result.termination} steps=${result.executedSteps} finalPc=${hex(result.finalPc)} haltPc=${result.haltHitPc !== null ? hex(result.haltHitPc) : 'n/a'}`);
  console.log(`  Hits: ${WATCHED_BLOCKS.map((watch) => `${hex(watch.addr)}=${result.watchHits[watch.addr] ? 'YES' : 'NO'}`).join('  ')}`);
  console.log(`  Final state: D0058E=${hexByte(result.finalState.d0058e)} D0059F=${hexByte(result.finalState.d0059f)} D007E0=${hexByte(result.finalState.d007e0)} D003E0=${hexByte(result.finalState.d003e0)}`);
  console.log(`  Visited blocks (${result.visitedBlocks.length}): ${result.visitedBlocks.map((addr) => hex(addr)).join(' -> ') || '(none)'}`);
  if (result.syntheticReentries.length) {
    console.log(`  Reentries: ${result.syntheticReentries.map((item) => `step ${item.step} ${hex(item.fromPc)} -> ${hex(item.reentryPc)} key=${hexByte(item.preservedKey)}`).join(' | ')}`);
  }
  if (result.errorMessage) {
    console.log('  Error:');
    console.log(result.errorMessage);
  }
  console.log('');
}

function printSummaryTable(results) {
  const columns = [
    { label: 'Mode', width: 6, getter: (result) => hexByte(result.modeValue) },
    ...WATCHED_BLOCKS.map((watch) => ({
      label: hex(watch.addr),
      width: 8,
      getter: (result) => (result.watchHits[watch.addr] ? 'YES' : 'NO'),
    })),
    { label: 'Term', width: 10, getter: (result) => result.termination },
    { label: 'Steps', width: 5, getter: (result) => String(result.executedSteps) },
  ];

  console.log('Summary table:');
  console.log(`  ${columns.map((column) => column.label.padEnd(column.width, ' ')).join(' ')}`);
  console.log(`  ${columns.map((column) => ''.padEnd(column.width, '-')).join(' ')}`);
  for (const result of results) {
    console.log(`  ${columns.map((column) => column.getter(result).padEnd(column.width, ' ')).join(' ')}`);
  }
  console.log('');
}

async function main() {
  const assets = ensureTranspiledModule();

  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
    );

    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;
    installStepShim(cpu, executor, mem);

    const d007e0Tracer = installD007E0WriteTracer(cpu, mem);

    let bootInfo;
    let memInit;
    let postMemInitCpu;
    let stages;
    let initialRun;

    try {
      bootInfo = coldBoot(executor, cpu, mem, d007e0Tracer);
      memInit = runMemInit(executor, cpu, mem, d007e0Tracer);
      if (!memInit.hitStop) {
        throw new Error(
          `memInit did not return via ${hex(MEM_INIT_RET)}. termination=${memInit.termination} lastPc=${hex(memInit.lastPc)}`,
        );
      }

      postMemInitCpu = snapshotCpu(cpu);
      stages = runHomescreenStages(executor, cpu, mem, postMemInitCpu, d007e0Tracer);

      prepareEventLoopCpu(cpu, mem);
      initialRun = stepUntilHalt(cpu, FIRST_HALT_STEP_LIMIT, d007e0Tracer, 'event_loop_idle');
    } finally {
      d007e0Tracer.restore();
    }

    printBootSummary(bootInfo, memInit, stages);
    printInitialHalt(initialRun, mem);
    printD007E0Trace(d007e0Tracer.writes);
    printRomDumps(romBytes);

    if (!initialRun.completed) {
      process.exitCode = 1;
      return;
    }

    const results = [];
    for (const modeValue of MODE_VALUES) {
      results.push(runModeSweepCase(cpu, mem, modeValue, initialRun.haltPc));
    }

    console.log('Per-mode sweep results:');
    console.log('');
    for (const result of results) {
      printModeCase(result);
    }

    printSummaryTable(results);

    process.exitCode = results.some((result) => result.termination === 'exception') ? 1 : 0;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
