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

const EXACT_SEARCH_TARGETS = [0x05849F, 0x0584A3];
const HOME_HANDLER_BRANCH_ENTRY = 0x058293;
const HOME_HANDLER_TOKEN_CHAIN_ENTRY = 0x058483;
const HOME_COPY9_BLOCK = 0x05849B;
const HOME_COPY9_ENTRY = 0x0584A3;
const BUF_INSERT_ENTRY = 0x05E2A0;

const JERROR_ENTRY = 0x061DB2;
const JERROR_AFTER_CALL = 0x061DBA;
const ERROR_WRAPPER_ENTRY = 0x03E1B4;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;
const ERROR_HELPER_RET_BLOCK = 0x03E1B1;

const TOKEN_STAGING_ADDR = 0xD0230E;
const TOKEN_STAGING_DIGIT_4 = Uint8Array.from([0x00, 0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TOKEN_LENGTH = 9;
const OP1_ADDR = 0xD005F8;

const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_RESET_TOP = 0xD1A87E;
const EXPERIMENT_SP = 0xD1A860;
const MBASE = 0xD0;

const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const K4_KEY_CODE = 0x92;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;
const TASK_ERRSP_ADDR = 0xD008A1;
const TASK_ERRNO_ADDR = 0xD008AF;

const NORMAL_RETURN_STUB = 0x061E27;
const ERROR_RESTORE_STUB = 0x061DD1;
const HLPAYLOAD_TARGET = 0x099929;

const MEMINIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;

const SEARCH_DEPTH = 5;
const STACK_SNAPSHOT_BYTES = 18;
const WRITE_EVENT_LIMIT = 32;

const WATCH_PCS = new Map([
  [0x058293, 'caller branch bit-test'],
  [0x058297, 'caller branch jump'],
  [0x058483, 'token-chain entry'],
  [0x058493, 'post 0x0800EC'],
  [0x058497, 'post 0x0A223A'],
  [0x05849B, 'copy chain local block'],
  [0x0584A3, 'Copy9 entry'],
  [0x0584A7, 'KeyClassifier callsite'],
  [0x07F7BD, 'KeyClassifier'],
  [0x09927F, 'dispatch helper'],
  [0x082C50, 'dispatch helper'],
  [0x0846EA, 'dispatch helper'],
  [0x061D3A, 'ErrUndefined'],
  [0x061DB2, 'JError'],
  [0x061DBA, 'JError after wrapper'],
  [0x03E1B4, 'error wrapper'],
  [0x03E1CA, 'wrapper after helper'],
  [0x03E1B1, 'z80 pop af / ret block'],
  [0x05E2A0, 'BufInsert'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function hexWord(value) {
  return hex(value & 0xFFFF, 4);
}

function normalizeHex(value, width = 6) {
  return (Number(value) >>> 0).toString(16).padStart(width, '0');
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

function overlapSlice(addr, width, start, length) {
  const overlapStart = Math.max(addr, start);
  const overlapEnd = Math.min(addr + width, start + length);
  if (overlapStart >= overlapEnd) return null;
  return {
    start: overlapStart,
    length: overlapEnd - overlapStart,
    offset: overlapStart - addr,
  };
}

function cap(list, value, limit = WRITE_EVENT_LIMIT) {
  if (list.length < limit) list.push(value);
}

function ensureTranspiledAssets() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      source: 'js',
      text: fs.readFileSync(TRANSPILED_JS_PATH, 'utf8'),
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const decompressed = gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH));
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase198-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, decompressed);
  return {
    source: 'gz',
    text: decompressed.toString('utf8'),
    modulePath: tempModulePath,
    tempModulePath,
  };
}

const transpiledAssets = ensureTranspiledAssets();
const romModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE198_SENTINEL__');
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
  write24(mem, cpu.sp, MEMINIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEMINIT_RET },
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

function seedPushErrorHandlerFrame(cpu, mem) {
  const previousErrSp = read24(mem, ROM_ERRSP_ADDR);
  const opsDelta = 0;
  const fpsDelta = 0;

  cpu.sp -= 3;
  write24(mem, cpu.sp, HLPAYLOAD_TARGET);
  cpu.sp -= 3;
  write24(mem, cpu.sp, previousErrSp);
  cpu.sp -= 3;
  write24(mem, cpu.sp, fpsDelta);
  cpu.sp -= 3;
  write24(mem, cpu.sp, opsDelta);
  cpu.sp -= 3;
  write24(mem, cpu.sp, ERROR_RESTORE_STUB);
  cpu.sp -= 3;
  write24(mem, cpu.sp, NORMAL_RETURN_STUB);

  const frameBase = cpu.sp & 0xFFFFFF;
  write24(mem, ROM_ERRSP_ADDR, frameBase);
  write24(mem, TASK_ERRSP_ADDR, frameBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  mem[TASK_ERRNO_ADDR] = 0x00;

  return {
    previousErrSp: hex(previousErrSp),
    frameBase: hex(frameBase),
    frameBytes: bytesToHexArray(mem, frameBase, 18),
    normalReturnStub: hex(NORMAL_RETURN_STUB),
    errorRestoreStub: hex(ERROR_RESTORE_STUB),
    hlPayload: hex(HLPAYLOAD_TARGET),
  };
}

function seedTraceReturn(cpu, mem) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);
  return {
    traceReturnAddr: hex(cpu.sp),
    traceReturnBytes: bytesToHexArray(mem, cpu.sp, 3),
    traceReturnValue: hex(TRACE_RET),
  };
}

function installOp1WriteWatch(cpu, mem, state) {
  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordWrite(addr, width, beforeBytes) {
    const overlap = overlapSlice(addr, width, OP1_ADDR, TOKEN_LENGTH);
    if (!overlap) return;
    cap(state.op1Writes, {
      blockPc: hex(cpu._currentBlockPc ?? cpu.pc ?? 0),
      writeAddr: hex(addr),
      width,
      before: Array.from(
        beforeBytes.slice(overlap.offset, overlap.offset + overlap.length),
        (value) => hexByte(value),
      ),
      after: bytesToHexArray(mem, overlap.start, overlap.length),
      op1After: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    });
  }

  function wrap(width, fn) {
    return (addr, value) => {
      const normalizedAddr = Number(addr) & 0xFFFFFF;
      const beforeBytes = Array.from(mem.slice(normalizedAddr, normalizedAddr + width));
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

function extractRelevantLines(source, needles) {
  const lowerNeedles = needles.map((needle) => needle.toLowerCase());
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => lowerNeedles.some((needle) => line.toLowerCase().includes(needle)))
    .slice(0, 6);
}

function blockMetaFromId(id, source, reasons = []) {
  const [pcHex, mode] = id.split(':');
  return {
    id,
    startPc: parseInt(pcHex, 16),
    startPcHex: hex(parseInt(pcHex, 16)),
    mode,
    reasons,
    relevantLines: extractRelevantLines(source, reasons.length ? reasons : ['0x0584a3']),
  };
}

function collectMatchingBlocks(predicate) {
  const out = [];
  for (const [id, block] of Object.entries(BLOCKS)) {
    const source = block?.source || '';
    const lower = source.toLowerCase();
    if (predicate(lower, source, id, block)) out.push(blockMetaFromId(id, source));
  }
  return out;
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = 0;
  while (true) {
    const next = text.indexOf(needle, index);
    if (next === -1) return count;
    count += 1;
    index = next + needle.length;
  }
}

function buildCallerSearch() {
  const text = transpiledAssets.text.toLowerCase();
  const exactPatterns = EXACT_SEARCH_TARGETS.flatMap((target) => {
    const targetHex = `0x${normalizeHex(target)}`;
    return [
      { pattern: `call ${targetHex}`, kind: 'call' },
      { pattern: `jp ${targetHex}`, kind: 'jp' },
    ];
  });

  const exactTextHits = exactPatterns
    .map(({ pattern, kind }) => ({ kind, pattern, count: countOccurrences(text, pattern) }))
    .filter((entry) => entry.count > 0);

  const directCallerBlocks = [];
  for (const [id, block] of Object.entries(BLOCKS)) {
    const source = block?.source || '';
    const lower = source.toLowerCase();
    const hits = exactPatterns.filter(({ pattern }) => lower.includes(pattern));
    if (hits.length > 0) {
      directCallerBlocks.push(blockMetaFromId(id, source, hits.map((hit) => hit.pattern)));
    }
  }

  const containingBlocks = [];
  for (const [id, block] of Object.entries(BLOCKS)) {
    const source = block?.source || '';
    const lower = source.toLowerCase();
    const reasons = [];
    if (lower.includes('// 0x05849f')) reasons.push('// 0x05849f');
    if (lower.includes('// 0x0584a3')) reasons.push('// 0x0584a3');
    if (reasons.length > 0) containingBlocks.push(blockMetaFromId(id, source, reasons));
  }

  const seen = new Set(containingBlocks.map((block) => block.startPc));
  let frontier = new Set(containingBlocks.map((block) => block.startPc));
  const recursiveLevels = [];

  for (let depth = 1; depth <= SEARCH_DEPTH && frontier.size > 0; depth += 1) {
    const nextFrontier = [];
    for (const [id, block] of Object.entries(BLOCKS)) {
      const source = block?.source || '';
      const lower = source.toLowerCase();
      const reasons = [];
      for (const target of frontier) {
        const pattern = `return 0x${normalizeHex(target)}`;
        if (lower.includes(pattern)) reasons.push(pattern);
      }
      if (reasons.length === 0) continue;
      const [pcHex] = id.split(':');
      const startPc = parseInt(pcHex, 16);
      if (seen.has(startPc)) continue;
      seen.add(startPc);
      nextFrontier.push(blockMetaFromId(id, source, reasons));
    }
    if (nextFrontier.length === 0) break;
    recursiveLevels.push({
      depth,
      targets: [...frontier].map((value) => hex(value)),
      callers: nextFrontier.sort((a, b) => a.startPc - b.startPc),
    });
    frontier = new Set(nextFrontier.map((block) => block.startPc));
  }

  const recursiveCallers = recursiveLevels.flatMap((level) => level.callers);
  const preferredCaller = recursiveCallers.find((block) => block.startPc === HOME_HANDLER_BRANCH_ENTRY)
    ?? recursiveCallers.find((block) => block.startPc === 0x058297)
    ?? recursiveCallers.find((block) => block.startPc === HOME_HANDLER_TOKEN_CHAIN_ENTRY)
    ?? directCallerBlocks[0]
    ?? containingBlocks.find((block) => block.startPc === HOME_COPY9_BLOCK)
    ?? null;

  return {
    transpiledSource: transpiledAssets.source,
    exactTextHits,
    directCallerBlocks,
    containingBlocks,
    recursiveLevels,
    preferredCaller,
    inferredChain: [
      hex(HOME_HANDLER_BRANCH_ENTRY),
      hex(HOME_HANDLER_TOKEN_CHAIN_ENTRY),
      hex(0x058493),
      hex(0x058497),
      hex(HOME_COPY9_BLOCK),
      hex(HOME_COPY9_ENTRY),
    ],
  };
}

function createTraceState() {
  return {
    blockTrace: [],
    uniqueBlocks: [],
    uniqueBlockSet: new Set(),
    missingBlocks: [],
    missingBlockSet: new Set(),
    watchHits: [],
    op1Writes: [],
  };
}

function noteBlock(state, cpu, mem, pc, mode, step, missing) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);
  state.blockTrace.push(renderedPc);

  if (missing) {
    if (!state.missingBlockSet.has(renderedPc)) {
      state.missingBlockSet.add(renderedPc);
      state.missingBlocks.push(renderedPc);
    }
    return;
  }

  if (!state.uniqueBlockSet.has(renderedPc)) {
    state.uniqueBlockSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }

  const label = WATCH_PCS.get(normalizedPc);
  if (!label) return;
  cap(state.watchHits, {
    step: (step ?? 0) + 1,
    pc: renderedPc,
    label,
    mode,
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    sp: hex(cpu.sp),
    madl: cpu.madl ? 'adl' : 'z80',
    stackTop: bytesToHexArray(mem, cpu.sp & 0xFFFFFF, STACK_SNAPSHOT_BYTES),
  }, 96);
}

function stopReason(trace) {
  if (trace.hit === 'bufInsert') return 'BufInsert sentinel';
  if (trace.hit === 'ret') return 'TRACE_RET sentinel';
  if (trace.termination === 'max_steps') return 'step limit';
  if (trace.termination === 'missing_block') return 'missing block';
  if (trace.termination === 'exception') return 'exception';
  return trace.termination ?? 'unknown';
}

function configureScenarioCommon(cpu, mem) {
  resetOsState(cpu, mem, EXPERIMENT_SP);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  mem.set(TOKEN_STAGING_DIGIT_4, TOKEN_STAGING_ADDR);
  mem[KBD_KEY_ADDR] = K4_KEY_CODE;
  mem[KBD_GETKY_ADDR] = K4_KEY_CODE;
  cpu.a = K4_KEY_CODE;
}

function prepareCallerBranchScenario(cpu, mem, scenario) {
  const frame = seedPushErrorHandlerFrame(cpu, mem);
  const traceReturn = seedTraceReturn(cpu, mem);
  mem[(IY_ADDR + 12) & 0xFFFFFF] |= 0x80;
  return {
    scenario: scenario.id,
    entry: hex(scenario.entry),
    traceReturn,
    errorFrame: frame,
    tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    iy12: hex(mem[(IY_ADDR + 12) & 0xFFFFFF], 2),
    keyCode: hex(K4_KEY_CODE, 2),
  };
}

function prepareDirectScenario(cpu, mem, scenario) {
  const frame = seedPushErrorHandlerFrame(cpu, mem);
  const traceReturn = seedTraceReturn(cpu, mem);
  return {
    scenario: scenario.id,
    entry: hex(scenario.entry),
    traceReturn,
    errorFrame: frame,
    tokenStaging: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    keyCode: hex(K4_KEY_CODE, 2),
  };
}

const SEARCH_RESULT = buildCallerSearch();

const SCENARIOS = [
  {
    id: 'caller_branch_058293',
    entry: SEARCH_RESULT.preferredCaller?.startPc === HOME_HANDLER_BRANCH_ENTRY
      ? SEARCH_RESULT.preferredCaller.startPc
      : HOME_HANDLER_BRANCH_ENTRY,
    mode: 'adl',
    description: 'Home-handler branch that gates entry into the 0x058483 -> 0x05849B -> 0x0584A3 token path.',
    prepare: prepareCallerBranchScenario,
  },
  {
    id: 'caller_chain_058483',
    entry: HOME_HANDLER_TOKEN_CHAIN_ENTRY,
    mode: 'adl',
    description: 'Immediate upstream token-chain block before the 0x05849B / 0x0584A3 copy-and-dispatch sequence.',
    prepare: prepareDirectScenario,
  },
  {
    id: 'direct_0584A3',
    entry: HOME_COPY9_ENTRY,
    mode: 'adl',
    description: 'Fallback direct entry with a seeded PushErrorHandler-style frame so the run can document the mixed-mode unwind path.',
    prepare: prepareDirectScenario,
  },
];

function runScenario(scenario, baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  configureScenarioCommon(cpu, mem);
  const seed = scenario.prepare(cpu, mem, scenario);
  const op1Before = bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH);
  const releaseWatch = installOp1WriteWatch(cpu, mem, state);

  let trace;
  try {
    trace = runUntilHit(
      executor,
      scenario.entry,
      scenario.mode,
      { ret: TRACE_RET, bufInsert: BUF_INSERT_ENTRY },
      TRACE_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
      {
        onBlock(pc, mode, _meta, step) {
          noteBlock(state, cpu, mem, pc, mode, step, false);
        },
        onMissingBlock(pc, mode, step) {
          noteBlock(state, cpu, mem, pc, mode, step, true);
        },
      },
    );
  } finally {
    releaseWatch();
  }

  const op1After = bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH);
  const lastWatch = state.watchHits[state.watchHits.length - 1] ?? null;

  return {
    id: scenario.id,
    description: scenario.description,
    entry: hex(scenario.entry),
    mode: scenario.mode,
    seed,
    steps: trace.steps,
    steppedPast49: trace.steps >= 50,
    stopReason: stopReason(trace),
    termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
    bufInsertReached: trace.hit === 'bufInsert' || state.watchHits.some((hit) => hit.pc === hex(BUF_INSERT_ENTRY)),
    first64Blocks: state.blockTrace.slice(0, 64),
    last16Blocks: state.blockTrace.slice(-16),
    uniqueBlocksVisited: state.uniqueBlocks.length,
    op1: {
      before: op1Before,
      after: op1After,
      writes: state.op1Writes,
    },
    watchHits: state.watchHits,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    finalSp: hex(cpu.sp),
    finalA: hex(cpu.a, 2),
    finalF: hex(cpu.f, 2),
    finalStackTop: bytesToHexArray(mem, cpu.sp & 0xFFFFFF, STACK_SNAPSHOT_BYTES),
    lastWatchHit: lastWatch,
    missingBlocks: state.missingBlocks,
    errorMessage: trace.errorMessage,
  };
}

function buildStaticReturnEvidence() {
  return {
    callerIntoWrapper: {
      address: hex(0x061DB6),
      pushesReturnTo: hex(JERROR_AFTER_CALL),
      evidence: extractRelevantLines(BLOCKS['061db2:adl']?.source || '', ['0x061db6', '0x03e1b4', '0x061dba']),
    },
    wrapperIntoHelper: {
      expectedAdlReturn: hex(ERROR_WRAPPER_AFTER_HELPER),
      evidence: [
        '0x03E1B4 eventually calls 0x03E187 and should resume at 0x03E1CA.',
        '0x03E1B1 executes `pop af` then `ret` in z80 mode, so it consumes only 2-byte slots.',
      ],
    },
    implication: [
      'Pre-seeding a top-level ADL return frame is sufficient for the caller-entry experiments.',
      'It is not sufficient to repair the internal 0x03E1B4 -> 0x03E187 -> 0x03E1B1 mixed-mode unwind if the run actually takes JError.',
      'The caller-entry path is therefore preferred: if digit-4 is accepted as valid input, the run should reach BufInsert before JError matters.',
    ],
  };
}

function main() {
  const baseline = createBaseline();
  const scenarios = SCENARIOS.map((scenario) => runScenario(scenario, baseline.baselineMem));

  const payload = {
    probe: 'phase198-caller-dispatch',
    generatedAt: new Date().toISOString(),
    romPath: ROM_PATH,
    transpiledSource: {
      source: SEARCH_RESULT.transpiledSource,
      modulePath: transpiledAssets.source === 'js' ? TRANSPILED_JS_PATH : transpiledAssets.modulePath,
      usedTemporaryModule: Boolean(transpiledAssets.tempModulePath),
    },
    stepBudget: TRACE_MAX_STEPS,
    successCriterion: 'BufInsert reached, or the mixed-mode JError stack requirements are documented with ROM-backed evidence.',
    baselineSetup: {
      romBytesLoaded: baseline.romBytesLoaded,
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    callerSearch: SEARCH_RESULT,
    stackEvidence: buildStaticReturnEvidence(),
    scenarios,
    summary: {
      preferredCaller: SEARCH_RESULT.preferredCaller?.startPcHex ?? null,
      exactDirectCallHitCount: SEARCH_RESULT.exactTextHits.reduce((sum, hit) => sum + hit.count, 0),
      inferredCallerChain: SEARCH_RESULT.inferredChain,
      anyScenarioPast49: scenarios.some((scenario) => scenario.steppedPast49),
      anyScenarioHitBufInsert: scenarios.some((scenario) => scenario.bufInsertReached),
      directScenarioReachedErrorRetBlock: scenarios
        .find((scenario) => scenario.id === 'direct_0584A3')
        ?.watchHits.some((hit) => hit.pc === hex(ERROR_HELPER_RET_BLOCK)) ?? false,
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
