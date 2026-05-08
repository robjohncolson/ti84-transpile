#!/usr/bin/env node

/**
 * Phase 246: trace 0x08C102 post-display common path
 *
 * Goals:
 *   1. Build a control-flow-aware static disassembly of the 0x08C102 function
 *      body (up to ~200 bytes), following conditional branches inside the body.
 *   2. Full-boot to warm home-screen state (boot -> kernelInit -> postInit ->
 *      memInit -> home stages 1-4 with IX=0xD1A860), then capture a real
 *      0x08C102 entry snapshot from 0x08BFEC and trace 2000 steps from there.
 *   3. Verify whether 0x08C102 reaches 0x09EF44 / 0x09EFDE and how many steps
 *      it takes.
 *   4. Investigate D0008A across boot/home stages and during a short event-loop
 *      run from 0x08BF22.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const HOME_STAGE_1_ENTRY = 0x0A2B72;
const HOME_STAGE_2_ENTRY = 0x0A3301;
const HOME_STAGE_3_ENTRY = 0x0A29EC;
const HOME_STAGE_4_ENTRY = 0x0A2854;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

const RETURN_SENTINEL = 0x7FFFFE;
const MEMINIT_RET = 0x7FFFF6;

const PRECURSOR_ENTRY = 0x08BFEC;
const EVENT_LOOP_ENTRY = 0x08BF22;
const TARGET_ENTRY = 0x08C102;
const VRAM_STAGING_ENTRY = 0x09EF44;
const VRAM_FILL_ENTRY = 0x09EFDE;

const D0008A_ADDR = 0xD0008A;
const D007E0_ADDR = 0xD007E0;

const STATIC_BODY_BUDGET = 0xC8;
const TRACE_BUDGET = 2000;
const ENTRY_CAPTURE_BUDGET = 1024;
const EVENT_LOOP_BUDGET = 6000;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const SEGMENT_STEP_BUDGET = 2000;
const HOME_STAGE_MAX_LOOP_ITERATIONS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;

const IY_FLAG_WINDOW = 0x80;
const D0_RAM_START = 0xD00000;
const D0_RAM_END = 0xD10000;

const CPU_SNAPSHOT_FIELDS = [
  'pc', 'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const HOME_STAGE_DEFS = [
  { label: 'home-stage-1 status background', entry: HOME_STAGE_1_ENTRY, maxSteps: 30000 },
  { label: 'home-stage-2 status dots', entry: HOME_STAGE_2_ENTRY, maxSteps: 30000 },
  { label: 'home-stage-3 home row', entry: HOME_STAGE_3_ENTRY, maxSteps: 50000 },
  { label: 'home-stage-4 history area', entry: HOME_STAGE_4_ENTRY, maxSteps: 50000 },
];

const TABLE_TARGETS = new Map([
  [0, 0x08B4EC],
  [1, 0x08B500],
  [2, 0x08B514],
]);

const TRACE_STOP = '__PHASE246_TRACE_STOP__';

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    mem[base] |
    (mem[(base + 1) & MEM_MASK] << 8) |
    (mem[(base + 2) & MEM_MASK] << 16)
  ) >>> 0;
}

function readBytes(mem, addr, width) {
  const out = new Uint8Array(width);
  for (let i = 0; i < width; i += 1) {
    out[i] = mem[(addr + i) & MEM_MASK];
  }
  return out;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createInstructionMap(blocks) {
  const map = new Map();
  for (const block of Object.values(blocks)) {
    for (const inst of block.instructions ?? []) {
      if (!map.has(inst.pc)) {
        map.set(inst.pc, {
          bytes: inst.bytes,
          dasm: inst.dasm,
        });
      }
    }
  }
  return map;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase246-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function createRuntime(blocks, romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const budget = Math.min(SEGMENT_STEP_BUDGET, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: budget,
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

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? MEM_INIT_MAX_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;
  const onMissingBlock = options.onMissingBlock ?? null;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitSentinel = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hitSentinel) {
    const budget = Math.min(SEGMENT_STEP_BUDGET, totalMaxSteps - totalSteps);
    let observedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: budget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, meta, step) {
          const normPc = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          observedSteps = Math.max(observedSteps, localStep);
          lastPc = normPc;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) onBlock({ pc: normPc, mode: dispatchMode ?? lastMode, meta, step: totalSteps + localStep });
          if (sentinels.has(normPc)) throw makeStop(sentinels.get(normPc), normPc);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const normPc = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          observedSteps = Math.max(observedSteps, localStep);
          lastPc = normPc;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) onMissingBlock({ pc: normPc, mode: dispatchMode ?? lastMode, step: totalSteps + localStep });
          if (sentinels.has(normPc)) throw makeStop(sentinels.get(normPc), normPc);
        },
      });

      totalSteps += result.steps ?? observedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += observedSteps;
      if (error?.message === TRACE_STOP) {
        hitSentinel = { name: error.stopName, pc: error.stopPc & 0xFFFFFF };
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (!hitSentinel && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitSentinel,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

function snapshotModeState(mem, label) {
  const d0008a = mem[D0008A_ADDR & MEM_MASK] & 0xFF;
  return {
    label,
    d0008a,
    d0008aLow2: d0008a & 0x03,
    d007e0: mem[D007E0_ADDR & MEM_MASK] & 0xFF,
  };
}

function selectorTarget(value) {
  const target = TABLE_TARGETS.get(value & 0x03);
  return target === undefined ? 'no direct table captured' : hex(target);
}

function restoreCpuForHomescreen(cpu, mem, snapshot) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._ix = IX_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function prepareMemInitCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._ix = IX_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEMINIT_RET);
  mem[0xD008DF & MEM_MASK] = 0x00;
}

function prepareDirectEntry(cpu, mem, baseCpuSnapshot, entryPc, returnPc = RETURN_SENTINEL) {
  restoreCpu(cpu, baseCpuSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._ix = IX_HOME;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;
  cpu.pc = entryPc & 0xFFFFFF;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, returnPc);
}

function buildWarmHomeState(runtime) {
  const { executor, cpu, mem } = runtime;
  const snapshots = [];

  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);
  snapshots.push(snapshotModeState(mem, 'after boot'));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);
  snapshots.push(snapshotModeState(mem, 'after kernelInit'));

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);
  snapshots.push(snapshotModeState(mem, 'after postInit'));

  prepareMemInitCall(cpu, mem);
  const memInit = runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEMINIT_RET, 'memInit_return']]),
  });
  snapshots.push(snapshotModeState(mem, 'after memInit'));

  const postMemInitCpuSnapshot = snapshotCpu(cpu);
  const stages = [];

  for (const stage of HOME_STAGE_DEFS) {
    restoreCpuForHomescreen(cpu, mem, postMemInitCpuSnapshot);
    if (stage.entry === HOME_STAGE_2_ENTRY) {
      mem[0xD0009B & MEM_MASK] &= ~0x40;
    }
    const result = runStageInSegments(executor, stage.entry, 'adl', stage.maxSteps, HOME_STAGE_MAX_LOOP_ITERATIONS);
    stages.push({
      label: stage.label,
      entry: stage.entry,
      steps: result.steps,
      lastPc: result.lastPc,
      termination: result.termination,
    });
    snapshots.push(snapshotModeState(mem, `after ${stage.label}`));
  }

  return {
    boot,
    kernelInit,
    postInit,
    memInit,
    stages,
    modeSnapshots: snapshots,
    warmMemSnapshot: new Uint8Array(mem),
    warmCpuSnapshot: snapshotCpu(cpu),
  };
}
