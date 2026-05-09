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

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const ENTRY_PC = 0x09E2EC;
const OUTER_FILL_ENTRY = 0x09EFCB;
const FILL_REGION_START = 0x09E000;
const FILL_REGION_END = 0x09FFFF;
const TRACE_STEPS = 10000;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D0059C = 0xD0059C;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;
const D02AC0 = 0xD02AC0;

const VRAM_BASE = 0xD40000;
const VRAM_END = 0xD52BFF;

const DISPATCH_RANGE_START = 0xD3F000;
const DISPATCH_RANGE_END = 0xD3FFFF;
const D3FF_RANGE_START = 0xD3FF00;
const D3FF_RANGE_END = 0xD3FFFF;

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
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function inRange(value, start, end) {
  const normalized = value & 0xFFFFFF;
  return normalized >= start && normalized <= end;
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase274-${process.pid}.mjs`);
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

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(memory, blocks, peripherals) {
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  cpu.run = (maxSteps, options = {}) => {
    const mode = options.mode ?? (cpu.madl ? 'adl' : 'z80');
    const result = executor.runFrom(cpu.pc & 0xFFFFFF, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? KERNEL_INIT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xFFFFFF;
    cpu.madl = result.lastMode === 'adl' ? 1 : 0;
    return result;
  };

  return { cpu, executor, mem: memory };
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    {
      key: '000280:adl',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'adl',
      note: 'direct lifted block for requested PC 0x000280',
    },
    {
      key: '000280:z80',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'z80',
      note: 'z80 lifted block for requested PC 0x000280',
    },
    {
      key: '020028:adl',
      pc: KERNEL_INIT_FALLBACK_PC,
      mode: 'adl',
      note: 'fallback lifted entry corresponding to kernelInit',
    },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function prefillVram(mem) {
  mem.fill(0xFF, VRAM_BASE, VRAM_END + 1);
}

function prepareTraceState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.sp = STACK_TOP;
  cpu.pc = ENTRY_PC & 0xFFFFFF;
  cpu.a = 0x49;
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3F;
  write24(mem, D007FA, cpu.sp & 0xFFFFFF);
  write24(mem, cpu.sp & 0xFFFFFF, RETURN_SENTINEL);
  write24(mem, D0059C, VRAM_BASE);
  mem[D02AC0 & MEM_MASK] = 0xFF;
  mem[(D02AC0 + 1) & MEM_MASK] = 0xFF;

  prefillVram(mem);
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

function installDispatchWatcher(cpu, mem) {
  const dispatchWrites = [];
  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordWrite(kind, addr, width, beforeBytes, afterBytes) {
    const changedBytes = [];
    for (let index = 0; index < width; index += 1) {
      const byteAddr = (addr + index) & 0xFFFFFF;
      const before = beforeBytes[index] & 0xFF;
      const after = afterBytes[index] & 0xFF;
      if (before === after) {
        continue;
      }
      if (!inRange(byteAddr, DISPATCH_RANGE_START, DISPATCH_RANGE_END)) {
        continue;
      }
      changedBytes.push({
        addr: byteAddr,
        before,
        after,
      });
    }

    if (changedBytes.length === 0) {
      return;
    }

    dispatchWrites.push({
      step: currentStep,
      pc: currentPc & 0xFFFFFF,
      mode: currentMode,
      kind,
      startAddr: addr & 0xFFFFFF,
      width,
      changedBytes,
    });
  }

  function wrapWrite(kind, width, invoke, addr) {
    const base = addr & 0xFFFFFF;
    const beforeBytes = [];
    for (let index = 0; index < width; index += 1) {
      beforeBytes.push(mem[(base + index) & MEM_MASK] & 0xFF);
    }
    invoke();
    const afterBytes = [];
    for (let index = 0; index < width; index += 1) {
      afterBytes.push(mem[(base + index) & MEM_MASK] & 0xFF);
    }
    recordWrite(kind, base, width, beforeBytes, afterBytes);
  }

  cpu.write8 = (addr, value) => wrapWrite('write8', 1, () => originalWrite8(addr, value), addr);
  cpu.write16 = (addr, value) => wrapWrite('write16', 2, () => originalWrite16(addr, value), addr);
  cpu.write24 = (addr, value) => wrapWrite('write24', 3, () => originalWrite24(addr, value), addr);

  return {
    setContext(context) {
      currentStep = context.step;
      currentPc = context.pc;
      currentMode = context.mode;
    },
    getWrites() {
      return dispatchWrites.slice();
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function recordUniqueVisit(map, list, key, step, pc, mode) {
  const existing = map.get(key);
  if (existing) {
    existing.visits += 1;
    return existing;
  }

  const record = {
    key,
    step,
    pc,
    mode,
    visits: 1,
  };
  map.set(key, record);
  list.push(record);
  return record;
}

function runTrace(executor, cpu, options) {
  const entry = options.entry & 0xFFFFFF;
  const maxSteps = options.maxSteps;
  const watcher = options.watcher ?? null;

  let pc = entry;
  let mode = options.mode ?? 'adl';
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let lastMode = mode;
  let error = null;

  const uniqueMap = new Map();
  const uniqueBlocks = [];
  const postFillMap = new Map();
  const postFillUniqueBlocks = [];
  const missingBlocks = [];
  const tail = [];

  let fillSkipApplied = false;
  let fillSkipStep = null;
  let fillSkipOriginalA = null;
  let postFillStarted = false;
  let postFillStartStep = null;
  let postFillStartPc = null;

  while (steps < maxSteps) {
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode });
      lastPc = pc;
      lastMode = mode;
      break;
    }

    const step = steps + 1;
    recordUniqueVisit(uniqueMap, uniqueBlocks, key, step, pc, mode);
    if (postFillStarted && !inRange(pc, FILL_REGION_START, FILL_REGION_END)) {
      recordUniqueVisit(postFillMap, postFillUniqueBlocks, key, step, pc, mode);
    }

    tail.push({ step, pc, mode });
    if (tail.length > 32) {
      tail.shift();
    }

    if (!fillSkipApplied && pc === OUTER_FILL_ENTRY) {
      fillSkipApplied = true;
      fillSkipStep = step;
      fillSkipOriginalA = cpu.a & 0xFF;
      cpu.a = 0x01;
    }

    watcher?.setContext({ step, pc, mode });

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      lastPc = pc;
      lastMode = mode;
      break;
    }

    steps += 1;

    if (result === undefined || result === null) {
      termination = 'no_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    const nextPc = result & 0xFFFFFF;
    const nextMode = resolveNextMode(meta, result, mode);
    lastPc = nextPc;
    lastMode = nextMode;

    if (fillSkipApplied && !postFillStarted && !inRange(nextPc, FILL_REGION_START, FILL_REGION_END)) {
      postFillStarted = true;
      postFillStartStep = steps + 1;
      postFillStartPc = nextPc;
    }

    pc = nextPc;
    mode = nextMode;
  }

  cpu.pc = lastPc & 0xFFFFFF;
  cpu.madl = lastMode === 'adl' ? 1 : 0;

  return {
    steps,
    termination,
    lastPc,
    lastMode,
    error,
    missingBlocks,
    tail,
    uniqueBlocks,
    postFillUniqueBlocks,
    fillSkipApplied,
    fillSkipStep,
    fillSkipOriginalA,
    postFillStarted,
    postFillStartStep,
    postFillStartPc,
  };
}

function filterEventBytes(event, start, end) {
  return event.changedBytes.filter((byte) => inRange(byte.addr, start, end));
}

function formatWriteEvent(event, start, end) {
  return {
    step: event.step,
    pc: hex(event.pc),
    mode: event.mode,
    kind: event.kind,
    startAddr: hex(event.startAddr),
    width: event.width,
    changedBytes: filterEventBytes(event, start, end).map((byte) => ({
      addr: hex(byte.addr),
      before: hexByte(byte.before),
      after: hexByte(byte.after),
    })),
  };
}

function summarizeWriteBytes(events, start, end) {
  const buckets = new Map();

  for (const event of events) {
    for (const byte of filterEventBytes(event, start, end)) {
      const bucket = buckets.get(byte.addr) ?? {
        addr: byte.addr,
        values: new Set(),
        steps: new Set(),
        pcs: new Set(),
      };
      bucket.values.add(byte.after & 0xFF);
      bucket.steps.add(event.step);
      bucket.pcs.add(event.pc & 0xFFFFFF);
      buckets.set(byte.addr, bucket);
    }
  }

  return [...buckets.values()]
    .sort((left, right) => left.addr - right.addr)
    .map((bucket) => ({
      addr: hex(bucket.addr),
      values: [...bucket.values].sort((left, right) => left - right).map((value) => hexByte(value)),
      steps: [...bucket.steps].sort((left, right) => left - right),
      pcs: [...bucket.pcs].sort((left, right) => left - right).map((pc) => hex(pc)),
    }));
}

function formatBlockRecord(record) {
  return {
    step: record.step,
    pc: hex(record.pc),
    mode: record.mode,
    visits: record.visits,
  };
}

function formatError(error) {
  if (!error) {
    return null;
  }
  return error?.stack ?? String(error);
}

function printSection(label, value) {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
  console.log('');
}

async function main() {
  console.log('Phase 274 probe: 0x09E2EC post-fill dispatch watch');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const kernelInitEntry = resolveKernelInitEntry(blocks);
    const memory = createMemory(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(memory, blocks, peripherals);
    const { cpu, executor } = runtime;

    cpu.pc = kernelInitEntry.pc & 0xFFFFFF;
    cpu.sp = STACK_TOP;
    cpu.ix = IX_BASE;
    cpu.iy = IY_BASE;
    cpu.mbase = MBASE;
    cpu.madl = kernelInitEntry.mode === 'adl' ? 1 : 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.im = 0;
    cpu.i = 0;

    const kernelInit = cpu.run(KERNEL_INIT_STEPS, {
      mode: kernelInitEntry.mode,
      maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    });

    const kernelSnapshot = snapshotRuntime(cpu, memory);
    restoreRuntime(cpu, memory, kernelSnapshot);
    prepareTraceState(cpu, memory);

    const watcher = installDispatchWatcher(cpu, memory);
    let trace;
    try {
      trace = runTrace(executor, cpu, {
        entry: ENTRY_PC,
        mode: 'adl',
        maxSteps: TRACE_STEPS,
        watcher,
      });
    } finally {
      watcher.restore();
    }

    const dispatchWrites = watcher.getWrites();
    const d3ffWrites = dispatchWrites.filter(
      (event) => filterEventBytes(event, D3FF_RANGE_START, D3FF_RANGE_END).length > 0,
    );

    printSection('KERNEL INIT', {
      romBytes: romBytes.length,
      transpiledSource: assets.source,
      blockCount: Object.keys(blocks).length,
      requestedPc: hex(KERNEL_INIT_REQUEST_PC),
      usedPc: hex(kernelInitEntry.pc),
      usedMode: kernelInitEntry.mode,
      note: kernelInitEntry.note,
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc),
      lastMode: kernelInit.lastMode,
    });

    printSection('FILL SKIP', {
      vramPrefill: {
        start: hex(VRAM_BASE),
        end: hex(VRAM_END),
        pattern: '0xFFFF',
      },
      outerFillEntry: hex(OUTER_FILL_ENTRY),
      applied: trace.fillSkipApplied,
      appliedStep: trace.fillSkipStep,
      originalA: hexByte(trace.fillSkipOriginalA),
      forcedA: trace.fillSkipApplied ? hexByte(0x01) : null,
      note: '0x09EFCB decrements A before the branch, so forcing A=0x01 exits the outer fill loop immediately.',
    });

    printSection('TRACE SUMMARY', {
      entryPc: hex(ENTRY_PC),
      stackTop: hex(STACK_TOP),
      ix: hex(IX_BASE),
      iy: hex(IY_BASE),
      mbase: hexByte(MBASE),
      steps: trace.steps,
      maxSteps: TRACE_STEPS,
      termination: trace.termination,
      lastPc: hex(trace.lastPc),
      lastMode: trace.lastMode,
      error: formatError(trace.error),
      missingBlocks: trace.missingBlocks.map((entry) => ({
        step: entry.step,
        pc: hex(entry.pc),
        mode: entry.mode,
      })),
      postFillStarted: trace.postFillStarted,
      postFillStartStep: trace.postFillStartStep,
      postFillStartPc: hex(trace.postFillStartPc),
      uniqueBlockCount: trace.uniqueBlocks.length,
      postFillBlockCount: trace.postFillUniqueBlocks.length,
      dispatchWriteEventCount: dispatchWrites.length,
      d3ffWriteEventCount: d3ffWrites.length,
      d3ffWriteDetected: d3ffWrites.length > 0,
      tail: trace.tail.map((entry) => ({
        step: entry.step,
        pc: hex(entry.pc),
        mode: entry.mode,
      })),
    });

    printSection('DISPATCH-RANGE WRITE SUMMARY', summarizeWriteBytes(
      dispatchWrites,
      DISPATCH_RANGE_START,
      DISPATCH_RANGE_END,
    ));

    printSection('DISPATCH-RANGE WRITES', dispatchWrites.map((event) => formatWriteEvent(
      event,
      DISPATCH_RANGE_START,
      DISPATCH_RANGE_END,
    )));

    printSection('D3FFxx WRITE SUMMARY', summarizeWriteBytes(
      dispatchWrites,
      D3FF_RANGE_START,
      D3FF_RANGE_END,
    ));

    printSection('D3FFxx WRITES', d3ffWrites.map((event) => formatWriteEvent(
      event,
      D3FF_RANGE_START,
      D3FF_RANGE_END,
    )));

    printSection('POST-FILL BLOCKS', trace.postFillUniqueBlocks.map(formatBlockRecord));
    printSection('ALL UNIQUE BLOCKS', trace.uniqueBlocks.map(formatBlockRecord));
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
