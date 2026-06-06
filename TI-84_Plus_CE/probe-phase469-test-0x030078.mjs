#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const ROM_URL = new URL('./ROM.rom', import.meta.url);
const BLOCKS_URL = new URL('./ROM.transpiled.js', import.meta.url);

const ENTRY_PC = 0x030078;
const KEY_PROCESSOR_PC = 0x03fa09;
const GETCSC_PC = 0x003d5a;
const ERROR_HANDLER_PC = 0x003a0f;
const POSSIBLE_SCAN_CALL_PC = 0x040d40;

const D00080 = 0xd00080;
const D00587 = 0xd00587;
const D141B5 = 0xd141b5;
const HALT_TRAP_FLAG = 0xd177b7;
const SCAN_CODE = 0x92;

const VRAM_START = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const MEMORY_SIZE = 0x1000000;

const TRACKED = [
  [ENTRY_PC, '0x030078 entry'],
  [KEY_PROCESSOR_PC, '0x03FA09 key processor'],
  [POSSIBLE_SCAN_CALL_PC, '0x040D40 possible scan helper'],
  [GETCSC_PC, '0x003D5A _GetCSC'],
  [ERROR_HANDLER_PC, '0x003A0F error handler'],
];

function hex(value, width = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '(unknown)';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function addr(value) {
  return hex(value & 0xffffff, 6);
}

function oneByte(value) {
  return hex(value & 0xff, 2);
}

function functionPrefersObject(fn) {
  const source = Function.prototype.toString.call(fn);
  const arrow = source.match(/^\s*(?:async\s*)?\(?\s*([^)=]*)\s*\)?\s*=>/);
  const normal = source.match(/^[^(]*\(([^)]*)\)/);
  const params = (arrow?.[1] ?? normal?.[1] ?? '').trim();
  return params.startsWith('{') || params.startsWith('options') || params.startsWith('opts');
}

function createBus(mem, options) {
  const objectArg = { mem, memory: mem, ram: mem, ...options };
  const attempts = functionPrefersObject(createPeripheralBus)
    ? [
        ['object', () => createPeripheralBus(objectArg)],
        ['memory-options', () => createPeripheralBus(mem, options)],
        ['options-memory', () => createPeripheralBus(options, mem)],
      ]
    : [
        ['memory-options', () => createPeripheralBus(mem, options)],
        ['object', () => createPeripheralBus(objectArg)],
        ['options-memory', () => createPeripheralBus(options, mem)],
      ];

  const errors = [];
  for (const [label, attempt] of attempts) {
    try {
      const bus = attempt();
      if (bus !== undefined && bus !== null) {
        return { bus, label, errors };
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  return { bus: null, label: 'none', errors };
}

function createRunner(blocks, mem, bus, options) {
  let activeOnBlock = null;
  const dispatchOnBlock = (...args) => {
    if (activeOnBlock) activeOnBlock(...args);
  };
  const baseOptions = {
    ...options,
    mem,
    memory: mem,
    ram: mem,
    bus,
    peripheralBus: bus,
    onBlock: dispatchOnBlock,
  };
  const objectArg = {
    blocks,
    preliftedBlocks: blocks,
    PRELIFTED_BLOCKS: blocks,
    ...baseOptions,
  };

  const attempts = functionPrefersObject(createExecutor)
    ? [
        ['object', () => createExecutor(objectArg)],
        ['blocks-options', () => createExecutor(blocks, baseOptions)],
        ['blocks-memory-bus-options', () => createExecutor(blocks, mem, bus, baseOptions)],
        ['memory-blocks-bus-options', () => createExecutor(mem, blocks, bus, baseOptions)],
      ]
    : [
        ['blocks-options', () => createExecutor(blocks, baseOptions)],
        ['object', () => createExecutor(objectArg)],
        ['blocks-memory-bus-options', () => createExecutor(blocks, mem, bus, baseOptions)],
        ['memory-blocks-bus-options', () => createExecutor(mem, blocks, bus, baseOptions)],
      ];

  const errors = [];
  let executor = null;
  let createLabel = null;
  for (const [label, attempt] of attempts) {
    try {
      const candidate = attempt();
      if (isRunnable(candidate)) {
        executor = candidate;
        createLabel = label;
        break;
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  if (!executor) {
    throw new Error(`Unable to create executor. Attempts: ${errors.join('; ') || '(no thrown errors)'}`);
  }

  return {
    executor,
    createLabel,
    createErrors: errors,
    async run(startPc, runOptions = {}) {
      const opts = {
        ...options,
        ...runOptions,
        pc: startPc,
        PC: startPc,
        startPc,
        adl: true,
        ADL: true,
        mode: 'adl',
        mem,
        memory: mem,
        bus,
        peripheralBus: bus,
        onBlock: dispatchOnBlock,
      };
      activeOnBlock = runOptions.onBlock ?? null;
      try {
        const result = await invokeRunnable(executor, startPc, opts);
        return { result, threw: false };
      } catch (error) {
        return { result: { reason: 'threw', errorMessage: error.message, stack: error.stack }, threw: true };
      } finally {
        activeOnBlock = null;
      }
    },
  };
}

function isRunnable(candidate) {
  if (typeof candidate === 'function') return true;
  if (!candidate || typeof candidate !== 'object') return false;
  return ['run', 'execute', 'runFrom', 'executeFrom', 'start'].some((name) => typeof candidate[name] === 'function');
}

function invokeRunnable(executor, startPc, opts) {
  if (typeof executor === 'function') {
    if (functionPrefersObject(executor) || executor.length <= 1) {
      return executor(opts);
    }
    return executor(startPc, opts);
  }

  for (const method of ['run', 'execute', 'runFrom', 'executeFrom', 'start']) {
    if (typeof executor[method] !== 'function') continue;
    const fn = executor[method];
    if (method.endsWith('From') || (!functionPrefersObject(fn) && fn.length >= 2)) {
      return fn.call(executor, startPc, opts);
    }
    return fn.call(executor, opts);
  }

  throw new Error('Executor has no runnable entry point');
}

function nestedObjects(value) {
  const out = [];
  const seen = new Set();
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    for (const key of ['state', 'cpu', 'registers', 'regs', 'context', 'ctx']) {
      if (item[key] && typeof item[key] === 'object') stack.push(item[key]);
    }
  }
  return out;
}

function pcFromArgs(args) {
  for (const arg of args) {
    if (typeof arg === 'number') return arg & 0xffffff;
    for (const object of nestedObjects(arg)) {
      for (const key of ['pc', 'PC', 'address', 'addr', 'entry', 'blockPc', 'startPc']) {
        if (typeof object[key] === 'number') return object[key] & 0xffffff;
      }
    }
  }
  return undefined;
}

function regAFromArgs(args) {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue;
    for (const object of nestedObjects(arg)) {
      for (const key of ['a', 'A']) {
        if (typeof object[key] === 'number') return object[key] & 0xff;
      }
    }
  }
  return undefined;
}

function finalPcFrom(runResult, runner) {
  const sources = [runResult?.result, runResult?.result?.state, runResult?.result?.cpu, runner.executor, runner.executor?.state, runner.executor?.cpu];
  for (const source of sources) {
    for (const object of nestedObjects(source)) {
      for (const key of ['pc', 'PC', 'finalPc', 'finalPC']) {
        if (typeof object[key] === 'number') return object[key] & 0xffffff;
      }
    }
  }
  return undefined;
}

function reasonFrom(runResult) {
  const result = runResult?.result;
  return (
    result?.reason ??
    result?.terminationReason ??
    result?.status ??
    result?.type ??
    result?.errorMessage ??
    (runResult?.threw ? 'threw' : 'completed')
  );
}

function checksumRange(mem, start, length) {
  let a = 1;
  let b = 0;
  const end = Math.min(start + length, mem.length);
  for (let i = start; i < end; i += 1) {
    a = (a + mem[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function createTracker() {
  const trackedMap = new Map(TRACKED);
  const hits = new Map(TRACKED.map(([pc]) => [pc, 0]));
  let firstAAtKeyProcessor;

  const onBlock = (...args) => {
    const pc = pcFromArgs(args);
    if (pc === undefined || !trackedMap.has(pc)) return;
    hits.set(pc, (hits.get(pc) ?? 0) + 1);
    if (pc === KEY_PROCESSOR_PC && firstAAtKeyProcessor === undefined) {
      firstAAtKeyProcessor = regAFromArgs(args);
    }
  };

  return {
    onBlock,
    hits,
    get firstAAtKeyProcessor() {
      return firstAAtKeyProcessor;
    },
  };
}

async function coldBoot(runner) {
  const stages = [
    { name: 'reset', pc: 0x000000, maxSteps: 1000000, maxLoopIterations: 4096 },
    { name: 'resume-1', pc: null, maxSteps: 1000000, maxLoopIterations: 4096 },
    { name: 'resume-2', pc: null, maxSteps: 1000000, maxLoopIterations: 4096 },
  ];
  const reports = [];
  let nextPc = 0x000000;

  for (const stage of stages) {
    const startPc = stage.pc ?? nextPc;
    const run = await runner.run(startPc, {
      adl: true,
      maxSteps: stage.maxSteps,
      maxLoopIterations: stage.maxLoopIterations,
    });
    const finalPc = finalPcFrom(run, runner);
    reports.push({
      name: stage.name,
      startPc,
      finalPc,
      reason: reasonFrom(run),
      threw: run.threw,
    });
    nextPc = finalPc ?? startPc;
  }

  return reports;
}

const rom = await readFile(ROM_URL);
const blocksModule = await import(BLOCKS_URL.href);
const blocks = blocksModule.PRELIFTED_BLOCKS ?? blocksModule.default?.PRELIFTED_BLOCKS ?? blocksModule.default;
if (!blocks) {
  throw new Error('ROM.transpiled.js did not export PRELIFTED_BLOCKS');
}

const mem = new Uint8Array(MEMORY_SIZE);
mem.set(rom.subarray(0, Math.min(rom.length, mem.length)), 0);

const busInfo = createBus(mem, {
  timerInterrupt: true,
  timerInterval: 500,
});
const runner = createRunner(blocks, mem, busInfo.bus, {
  timerInterrupt: true,
  timerInterval: 500,
});

const bootReports = await coldBoot(runner);
mem[HALT_TRAP_FLAG] = 0x00;

mem[D00587] = SCAN_CODE;
mem[D00080] = (mem[D00080] | 0x08) & 0xff;

const vramBefore = checksumRange(mem, VRAM_START, VRAM_SIZE);
const tracker = createTracker();
const testRun = await runner.run(ENTRY_PC, {
  adl: true,
  maxSteps: 500000,
  maxLoopIterations: 256,
  onBlock: tracker.onBlock,
});
const vramAfter = checksumRange(mem, VRAM_START, VRAM_SIZE);

console.log('Phase 469 direct 0x030078 key-injection probe');
console.log('');
console.log(`Peripheral bus creation: ${busInfo.label}`);
if (busInfo.errors.length) {
  console.log(`Peripheral bus fallback errors: ${busInfo.errors.join(' | ')}`);
}
console.log(`Executor creation: ${runner.createLabel}`);
if (runner.createErrors.length) {
  console.log(`Executor fallback errors: ${runner.createErrors.join(' | ')}`);
}

console.log('');
console.log('Cold boot stages:');
for (const report of bootReports) {
  console.log(
    `  ${report.name}: start=${addr(report.startPc)} final=${addr(report.finalPc)} reason=${report.reason}${report.threw ? ' threw' : ''}`,
  );
}

console.log('');
console.log(`Injected key: D00587=${oneByte(SCAN_CODE)}, D00080 bit 3 set`);
console.log('');
console.log('Tracked PC hits:');
for (const [pc, label] of TRACKED) {
  console.log(`  ${addr(pc)} ${label}: ${tracker.hits.get(pc) ?? 0}`);
}

console.log('');
console.log(`A at first 0x03FA09 hit: ${tracker.firstAAtKeyProcessor === undefined ? '(not hit or unavailable)' : oneByte(tracker.firstAAtKeyProcessor)}`);
console.log(`D00587 after run: ${oneByte(mem[D00587])}`);
console.log(`D00080 after run: ${oneByte(mem[D00080])} (bit 3 ${mem[D00080] & 0x08 ? 'set' : 'clear'})`);
console.log(`D141B5 after run: ${oneByte(mem[D141B5])}`);
console.log(`VRAM checksum before: ${hex(vramBefore, 8)}`);
console.log(`VRAM checksum after:  ${hex(vramAfter, 8)}`);
console.log(`VRAM changed: ${vramBefore !== vramAfter ? 'yes' : 'no'}`);
console.log(`Termination reason: ${reasonFrom(testRun)}`);
console.log(`Final PC: ${addr(finalPcFrom(testRun, runner))}`);
