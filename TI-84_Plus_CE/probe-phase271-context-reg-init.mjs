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
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x020028;
const MEM_INIT_ENTRY = 0x020830;
const HOME_STAGES = [
  { label: 'home_stage_1', entry: 0x021070 },
  { label: 'home_stage_2', entry: 0x0210b4 },
  { label: 'home_stage_3', entry: 0x0210e4 },
  { label: 'home_stage_4', entry: 0x021124 },
];

const CONTEXT_REG_ENTRY = 0x09e2ec;
const HOME_BODY_ENTRY = 0x0582bc;
const EVENT_LOOP_ENTRY = 0x082be2;
const TRACE_RETURN_SENTINEL = 0x7ffffe;

const STACK_TOP = 0xd1a87e;
const IX_BASE = 0xd1a860;
const IY_BASE = 0xd00080;
const MBASE = 0xd0;

const D007E0 = 0xd007e0;
const D007E8 = 0xd007e8;
const D007FA = 0xd007fa;
const D0230F = 0xd0230f;
const D0259D = 0xd0259d;
const D025A3 = 0xd025a3;

const TRACE_STEPS_CONTEXT = 2000;
const TRACE_STEPS_HOME = 10000;
const TRACE_STEPS_DUMP = 500;
const BOOT_STAGE_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const POINTER_RANGE_START = 0xd02500;
const POINTER_RANGE_END = 0xd026ff;
const TABLE_RANGE_START = 0xd3f000;
const TABLE_RANGE_END = 0xd3ffff;
const ALL_WRITE_PRINT_LIMIT = 200;

const POLLING_BLOCKS = new Set([
  0x082be2,
  0x084716,
  0x08471b,
  0x084723,
  0x084711,
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', 'pc',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function bytesAt(mem, addr, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(mem[(addr + index) & MEM_MASK]));
  }
  return bytes.join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xff;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xff;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xff;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase271-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function createCPU(rom, blocks, peripherals) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.run = (maxSteps, options = {}) => {
    const mode = options.mode ?? (cpu.madl ? 'adl' : 'z80');
    const result = executor.runFrom(cpu.pc & 0xffffff, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? BOOT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xffffff;
    cpu.madl = result.lastMode === 'adl' ? 1 : 0;
    return result;
  };

  return { cpu, mem, executor };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotBootState(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    ram: new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
  };
}

function restoreBootState(cpu, mem, snapshot) {
  mem.set(snapshot.ram, RAM_SNAPSHOT_START);
  restoreCpu(cpu, snapshot.cpu);
}

function sanitizeForManualStage(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
}

function runBootStage(cpu, label, entry, mode, maxSteps, maxLoopIterations) {
  sanitizeForManualStage(cpu);
  cpu.pc = entry & 0xffffff;
  cpu.madl = mode === 'adl' ? 1 : 0;
  const result = cpu.run(maxSteps, {
    mode,
    maxLoopIterations,
  });
  return {
    label,
    entry,
    mode,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced,
    missingBlocks: result.missingBlocks,
  };
}

function bootSystem(runtime) {
  const { cpu } = runtime;
  const stages = [];

  cpu.pc = BOOT_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.mbase = MBASE;
  cpu.madl = 0;
  stages.push(runBootStage(cpu, 'cold_boot', BOOT_ENTRY, 'z80', BOOT_STAGE_STEPS, 32));

  stages.push(runBootStage(cpu, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));
  stages.push(runBootStage(cpu, 'mem_init', MEM_INIT_ENTRY, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));

  for (const stage of HOME_STAGES) {
    cpu.ix = IX_BASE;
    stages.push(runBootStage(cpu, stage.label, stage.entry, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));
  }

  return stages;
}

function prepareContextCallState(cpu, mem, returnPc) {
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
  cpu._bc = (cpu._bc & 0xff) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3f;

  cpu.sp = STACK_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnPc & 0xffffff);
  write24(mem, D007FA, cpu.sp);
}

function prepareHomeBodyState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu._bc = (cpu._bc & 0xff) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3f;

  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, TRACE_RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);
}

function readPointerState(mem) {
  return {
    d0259d: {
      addr: D0259D,
      bytes: bytesAt(mem, D0259D, 3),
      value: read24(mem, D0259D),
    },
    d025a3: {
      addr: D025A3,
      bytes: bytesAt(mem, D025A3, 3),
      value: read24(mem, D025A3),
    },
  };
}

function formatPointerLine(label, pointer) {
  return `${label}: bytes=[${pointer.bytes}] value=${hex(pointer.value)}`;
}

function isTrackedRange(addr) {
  const normalized = addr & 0xffffff;
  return (
    (normalized >= POINTER_RANGE_START && normalized <= POINTER_RANGE_END) ||
    (normalized >= TABLE_RANGE_START && normalized <= TABLE_RANGE_END)
  );
}

function installWriteWatcher(cpu, mem) {
  const allWrites = [];
  const trackedWrites = [];
  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, startAddr, width, value) {
    for (let offset = 0; offset < width; offset += 1) {
      const addr = (startAddr + offset) & 0xffffff;
      const entry = {
        step: currentStep,
        pc: currentPc,
        mode: currentMode,
        kind,
        startAddr: startAddr & 0xffffff,
        addr,
        oldValue: mem[addr & MEM_MASK] & 0xff,
        newValue: (value >>> (offset * 8)) & 0xff,
      };
      allWrites.push(entry);
      if (isTrackedRange(addr)) {
        trackedWrites.push(entry);
      }
    }
  }

  cpu.write8 = (addr, value) => {
    record('write8', addr, 1, value & 0xff);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record('write16', addr, 2, value & 0xffff);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record('write24', addr, 3, value & 0xffffff);
    return originalWrite24(addr, value);
  };

  return {
    allWrites,
    trackedWrites,
    setContext({ step, pc, mode }) {
      currentStep = step;
      currentPc = pc & 0xffffff;
      currentMode = mode;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function resolveNextMode(meta, returnedPc, currentMode) {
  if (!meta?.exits) {
    return currentMode;
  }
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function runTrace(executor, cpu, options) {
  const {
    entry,
    mode = 'adl',
    maxSteps,
    stopPc = null,
    watcher = null,
  } = options;

  let pc = entry & 0xffffff;
  let currentMode = mode;
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let error = null;

  const missingBlocks = [];
  const visitedSequence = [];
  const uniqueMap = new Map();

  while (steps < maxSteps) {
    cpu.madl = currentMode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = `${pc.toString(16).padStart(6, '0')}:${currentMode}`;
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode: currentMode });
      break;
    }

    const visit = {
      step: steps + 1,
      pc,
      mode: currentMode,
    };
    visitedSequence.push(visit);

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        key,
        pc,
        mode: currentMode,
        firstStep: steps + 1,
        visits: 0,
      });
    }
    uniqueMap.get(key).visits += 1;

    watcher?.setContext({ step: steps + 1, pc, mode: currentMode });

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    steps += 1;

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      break;
    }

    const nextPc = result & 0xffffff;
    if (stopPc !== null && nextPc === (stopPc & 0xffffff)) {
      termination = 'stop_pc';
      lastPc = nextPc;
      break;
    }

    currentMode = resolveNextMode(meta, result, currentMode);
    pc = nextPc;
    lastPc = pc;
  }

  return {
    steps,
    termination,
    lastPc,
    lastMode: currentMode,
    error,
    missingBlocks,
    visitedSequence,
    uniqueBlocks: [...uniqueMap.values()].sort((left, right) => left.firstStep - right.firstStep),
  };
}

function combineTraces(...traces) {
  let stepOffset = 0;
  const visitedSequence = [];
  const uniqueMap = new Map();

  for (const trace of traces) {
    for (const visit of trace.visitedSequence) {
      const shifted = {
        step: visit.step + stepOffset,
        pc: visit.pc,
        mode: visit.mode,
      };
      visitedSequence.push(shifted);

      const key = `${visit.pc.toString(16).padStart(6, '0')}:${visit.mode}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          key,
          pc: visit.pc,
          mode: visit.mode,
          firstStep: shifted.step,
          visits: 0,
        });
      }
      uniqueMap.get(key).visits += 1;
    }
    stepOffset += trace.steps;
  }

  return {
    steps: stepOffset,
    visitedSequence,
    uniqueBlocks: [...uniqueMap.values()].sort((left, right) => left.firstStep - right.firstStep),
  };
}

function analyzePollingExit(visitedSequence) {
  const firstEventIndex = visitedSequence.findIndex((visit) => visit.pc === EVENT_LOOP_ENTRY);
  if (firstEventIndex === -1) {
    return {
      hitEventLoop: false,
      firstEventStep: null,
      exitedPollingSet: false,
      outsideBlocks: [],
    };
  }

  const outsideMap = new Map();
  for (const visit of visitedSequence.slice(firstEventIndex)) {
    if (POLLING_BLOCKS.has(visit.pc)) {
      continue;
    }
    const key = `${visit.pc.toString(16).padStart(6, '0')}:${visit.mode}`;
    if (!outsideMap.has(key)) {
      outsideMap.set(key, {
        pc: visit.pc,
        mode: visit.mode,
        firstStep: visit.step,
      });
    }
  }

  return {
    hitEventLoop: true,
    firstEventStep: visitedSequence[firstEventIndex].step,
    exitedPollingSet: outsideMap.size > 0,
    outsideBlocks: [...outsideMap.values()].sort((left, right) => left.firstStep - right.firstStep),
  };
}

function printBootSummary(bootStages) {
  console.log('=== Boot Summary ===');
  for (const stage of bootStages) {
    console.log(
      `${stage.label.padEnd(14)} entry=${hex(stage.entry)}:${stage.mode} ` +
      `steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)} lastMode=${stage.lastMode}`
    );
  }
  console.log('');
}

function printUniqueBlocks(title, uniqueBlocks) {
  console.log(`${title} (${uniqueBlocks.length})`);
  if (uniqueBlocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of uniqueBlocks) {
    console.log(
      `  ${hex(block.pc)}:${block.mode} firstStep=${String(block.firstStep).padStart(4, '0')} visits=${block.visits}`
    );
  }
}

function printPointerSummary(before, after, labelAfter = 'after') {
  console.log(`  ${formatPointerLine('D0259D before', before.d0259d)}`);
  console.log(`  ${formatPointerLine(`D0259D ${labelAfter}`, after.d0259d)}`);
  console.log(`  ${formatPointerLine('D025A3 before', before.d025a3)}`);
  console.log(`  ${formatPointerLine(`D025A3 ${labelAfter}`, after.d025a3)}`);
}

function printOutsideBlocks(outsideBlocks) {
  if (outsideBlocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of outsideBlocks) {
    console.log(`  ${hex(block.pc)}:${block.mode} firstStep=${block.firstStep}`);
  }
}

function printExperimentSummary(title, trace, pointersBefore, pointersAfter, pollingAnalysis, extraLines = []) {
  console.log(`=== ${title} ===`);
  console.log(`Steps executed: ${trace.steps}`);
  console.log(`Termination: ${trace.termination}`);
  console.log(`Last PC: ${hex(trace.lastPc)}:${trace.lastMode}`);
  if (trace.error) {
    console.log(`Error: ${trace.error?.stack ?? String(trace.error)}`);
  }
  printPointerSummary(pointersBefore, pointersAfter);
  for (const line of extraLines) {
    console.log(`  ${line}`);
  }
  console.log(`  Hit 0x082BE2: ${pollingAnalysis.hitEventLoop}${pollingAnalysis.firstEventStep ? ` (firstStep=${pollingAnalysis.firstEventStep})` : ''}`);
  console.log(`  Exited 5-block polling set: ${pollingAnalysis.exitedPollingSet}`);
  console.log('  Blocks outside polling set after first 0x082BE2:');
  printOutsideBlocks(pollingAnalysis.outsideBlocks);
  printUniqueBlocks('Unique blocks visited', trace.uniqueBlocks);
  if (trace.missingBlocks.length > 0) {
    console.log('Missing blocks:');
    for (const missing of trace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  console.log('');
}

function printWriteEntries(title, writes, limit = writes.length) {
  console.log(`${title} (${writes.length})`);
  if (writes.length === 0) {
    console.log('  none');
    return;
  }
  for (const write of writes.slice(0, limit)) {
    console.log(
      `  step=${String(write.step).padStart(4, '0')} pc=${hex(write.pc)}:${write.mode} ` +
      `${write.kind} addr=${hex(write.addr)} old=${hexByte(write.oldValue)} new=${hexByte(write.newValue)} ` +
      `start=${hex(write.startAddr)}`
    );
  }
  if (writes.length > limit) {
    console.log(`  ... ${writes.length - limit} more`);
  }
}

function printBlockTrace(title, visitedSequence) {
  console.log(`${title} (${visitedSequence.length})`);
  if (visitedSequence.length === 0) {
    console.log('  none');
    return;
  }
  for (const visit of visitedSequence) {
    console.log(`  step=${String(visit.step).padStart(4, '0')} pc=${hex(visit.pc)}:${visit.mode}`);
  }
}

function experimentAorB(runtime, bootSnapshot, aValue, label) {
  const { cpu, mem, executor } = runtime;
  restoreBootState(cpu, mem, bootSnapshot);

  const before = readPointerState(mem);
  prepareContextCallState(cpu, mem, EVENT_LOOP_ENTRY);
  cpu.a = aValue & 0xff;

  const trace = runTrace(executor, cpu, {
    entry: CONTEXT_REG_ENTRY,
    mode: 'adl',
    maxSteps: TRACE_STEPS_CONTEXT,
  });

  const after = readPointerState(mem);
  const pollingAnalysis = analyzePollingExit(trace.visitedSequence);

  printExperimentSummary(
    label,
    trace,
    before,
    after,
    pollingAnalysis,
    [`A=${hexByte(aValue)}`],
  );
}

function experimentC(runtime, bootSnapshot) {
  const { cpu, mem, executor } = runtime;
  restoreBootState(cpu, mem, bootSnapshot);

  const before = readPointerState(mem);

  mem[D007E0 & MEM_MASK] = 0x49;
  write24(mem, D007E8, 0x06c546);

  prepareContextCallState(cpu, mem, TRACE_RETURN_SENTINEL);
  cpu.a = 0x49;

  const contextTrace = runTrace(executor, cpu, {
    entry: CONTEXT_REG_ENTRY,
    mode: 'adl',
    maxSteps: TRACE_STEPS_CONTEXT,
    stopPc: TRACE_RETURN_SENTINEL,
  });

  const afterContext = readPointerState(mem);

  prepareHomeBodyState(cpu, mem);
  const homeTrace = runTrace(executor, cpu, {
    entry: HOME_BODY_ENTRY,
    mode: 'adl',
    maxSteps: TRACE_STEPS_HOME,
  });

  const afterFullSequence = readPointerState(mem);
  const combined = combineTraces(contextTrace, homeTrace);
  const pollingAnalysis = analyzePollingExit(combined.visitedSequence);

  console.log('=== Experiment C — D007E0=0x49 + D007E8=0x06C546 + 0x09E2EC + 0x0582BC ===');
  console.log(`Steps executed: context=${contextTrace.steps} home=${homeTrace.steps} total=${combined.steps}`);
  console.log(`Context trace: term=${contextTrace.termination} lastPc=${hex(contextTrace.lastPc)}:${contextTrace.lastMode}`);
  console.log(`Home trace:    term=${homeTrace.termination} lastPc=${hex(homeTrace.lastPc)}:${homeTrace.lastMode}`);
  printPointerSummary(before, afterContext, 'after context');
  console.log(`  ${formatPointerLine('D0259D after full sequence', afterFullSequence.d0259d)}`);
  console.log(`  ${formatPointerLine('D025A3 after full sequence', afterFullSequence.d025a3)}`);
  console.log(`  Hit 0x082BE2: ${pollingAnalysis.hitEventLoop}${pollingAnalysis.firstEventStep ? ` (firstStep=${pollingAnalysis.firstEventStep})` : ''}`);
  console.log(`  Exited 5-block polling set: ${pollingAnalysis.exitedPollingSet}`);
  console.log('  Blocks outside polling set after first 0x082BE2:');
  printOutsideBlocks(pollingAnalysis.outsideBlocks);
  printUniqueBlocks('Unique blocks visited', combined.uniqueBlocks);
  if (contextTrace.missingBlocks.length > 0) {
    console.log('Context missing blocks:');
    for (const missing of contextTrace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  if (homeTrace.missingBlocks.length > 0) {
    console.log('Home missing blocks:');
    for (const missing of homeTrace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  console.log('');
}

function experimentD(runtime, bootSnapshot) {
  const { cpu, mem, executor } = runtime;
  restoreBootState(cpu, mem, bootSnapshot);

  const before = readPointerState(mem);
  prepareContextCallState(cpu, mem, TRACE_RETURN_SENTINEL);
  cpu.a = 0x49;

  const watcher = installWriteWatcher(cpu, mem);
  let trace;
  try {
    trace = runTrace(executor, cpu, {
      entry: CONTEXT_REG_ENTRY,
      mode: 'adl',
      maxSteps: TRACE_STEPS_DUMP,
      stopPc: TRACE_RETURN_SENTINEL,
      watcher,
    });
  } finally {
    watcher.restore();
  }

  const after = readPointerState(mem);
  const pollingAnalysis = analyzePollingExit(trace.visitedSequence);

  console.log('=== Experiment D — 0x09E2EC block/write dump ===');
  console.log(`Steps executed: ${trace.steps}`);
  console.log(`Termination: ${trace.termination}`);
  console.log(`Last PC: ${hex(trace.lastPc)}:${trace.lastMode}`);
  printPointerSummary(before, after);
  console.log(`  Hit 0x082BE2: ${pollingAnalysis.hitEventLoop}${pollingAnalysis.firstEventStep ? ` (firstStep=${pollingAnalysis.firstEventStep})` : ''}`);
  console.log(`  Exited 5-block polling set: ${pollingAnalysis.exitedPollingSet}`);
  console.log('  Blocks outside polling set after first 0x082BE2:');
  printOutsideBlocks(pollingAnalysis.outsideBlocks);
  printUniqueBlocks('First 50 unique blocks visited', trace.uniqueBlocks.slice(0, 50));
  printBlockTrace('Block trace', trace.visitedSequence);
  printWriteEntries('All memory writes (first 200)', watcher.allWrites, ALL_WRITE_PRINT_LIMIT);
  printWriteEntries('Tracked writes in D025xx-D026xx and D3Fxxx', watcher.trackedWrites);
  if (trace.missingBlocks.length > 0) {
    console.log('Missing blocks:');
    for (const missing of trace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  console.log('');
}

async function main() {
  console.log('Phase 271 probe: context registration before event loop');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log(`ROM bytes=${rom.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log('');

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(rom, blocks, peripherals);
    const { cpu, mem } = runtime;

    const bootStages = bootSystem(runtime);
    printBootSummary(bootStages);

    const bootSnapshot = snapshotBootState(cpu, mem);

    experimentAorB(runtime, bootSnapshot, 0x49, 'Experiment A — A=0x49, 0x09E2EC then event loop');
    experimentAorB(runtime, bootSnapshot, 0x40, 'Experiment B — A=0x40, 0x09E2EC then event loop');
    experimentC(runtime, bootSnapshot);
    experimentD(runtime, bootSnapshot);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
