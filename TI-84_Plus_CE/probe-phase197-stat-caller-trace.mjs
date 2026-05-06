#!/usr/bin/env node
/**
 * probe-phase197-stat-caller-trace.mjs
 *
 * Seed L1 with three TI-OS FP values, run the STAT 1-Var Stats path from
 * 0x058BA9, and stop on first entry to lifted block 0x09224B so the caller/
 * stack state feeding the later 0x092259 -> 0x092263 backward-copy path can
 * be inspected directly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const TARGET_BLOCK = 0x09224B;
const FOLLOWUP_BLOCK = 0x092259;
const LDDR_BLOCK = 0x092263;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE197_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const STACK_DUMP_LEN = 16;
const CALL_HISTORY_LIMIT = 20;
const EXPECTED_BC = 0x00001B;

const LIST_DATA_ADDR = 0xD10000;
const VAT_ENTRY_ADDR = 0xD1A800;

const LIST_PTR_TABLE_ADDR = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;

const CURR_LIST_HIGHLIGHT_ADDR = 0xD0244B;
const LIST_NAME1_ADDR = 0xD02459;
const LIST_NAME_STRIDE = 5;
const LIST_NAME_SLOTS = 20;

const STATFLAGS_ADDR = 0xD00089;
const STATFLAGS2_ADDR = 0xD0009A;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

const LIST_DATA_LEN = 2 + (LIST_ELEMENTS.length * 9);
const LIST_DATA_END = LIST_DATA_ADDR + LIST_DATA_LEN;
const VAT_ENTRY_BYTES = Uint8Array.from([
  0x01,
  LIST_DATA_ADDR & 0xFF,
  (LIST_DATA_ADDR >>> 8) & 0xFF,
  (LIST_DATA_ADDR >>> 16) & 0xFF,
  0x00,
  0x00,
  0x01,
  0x00,
]);

const TARGET_BLOCK_INFO = describeBlock(TARGET_BLOCK);
const FOLLOWUP_BLOCK_INFO = describeBlock(FOLLOWUP_BLOCK);
const LDDR_BLOCK_INFO = describeBlock(LDDR_BLOCK);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function read24Raw(mem, addr) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  return mem[a & mask] | (mem[(a + 1) & mask] << 8) | (mem[(a + 2) & mask] << 16);
}

function write24(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
  mem[(a + 2) & mask] = (value >>> 16) & 0xFF;
}

function write16(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & mask] = bytes[index] & 0xFF;
  }
}

function hexBytes(mem, addr, len) {
  const parts = [];
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < len; index += 1) {
    parts.push((mem[(a + index) & mask] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function serializeInstruction(inst) {
  return {
    pc: hex(inst.pc),
    dasm: inst.dasm,
    tag: inst.tag ?? null,
    target: inst.target === undefined ? null : hex(inst.target),
    fallthrough: inst.fallthrough === undefined ? null : hex(inst.fallthrough),
  };
}

function serializeExit(exit) {
  return {
    type: exit.type,
    condition: exit.condition ?? null,
    target: exit.target === undefined ? null : hex(exit.target),
    targetMode: exit.targetMode ?? null,
  };
}

function describeBlock(pc) {
  const block = BLOCKS[blockKey(pc)];
  return {
    present: !!block,
    id: block?.id ?? blockKey(pc),
    instructionCount: block?.instructionCount ?? 0,
    instructions: (block?.instructions ?? []).map(serializeInstruction),
    exits: (block?.exits ?? []).map(serializeExit),
  };
}

function blockInstructionLabel(block) {
  return block?.instructions?.[0]?.dasm ?? 'missing';
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
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

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? STAT_TRACE_MAX_STEPS;
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
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, meta, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) {
            onBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              meta,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) {
            onMissingBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentObservedSteps;
      if (error?.message === TRACE_STOP) {
        hitSentinel = {
          name: error.stopName,
          pc: hex(error.stopPc),
        };
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

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForStatEntry(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function seedStatLists(mem) {
  const allocatorBefore = {
    fpsBase: hex(read24Raw(mem, FPSBASE_ADDR)),
    fps: hex(read24Raw(mem, FPS_ADDR)),
    opBase: hex(read24Raw(mem, OPBASE_ADDR)),
    ops: hex(read24Raw(mem, OPS_ADDR)),
    pTemp: hex(read24Raw(mem, PTEMP_ADDR)),
    progPtr: hex(read24Raw(mem, PROGPTR_ADDR)),
    newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
  };

  write16(mem, LIST_DATA_ADDR, LIST_ELEMENTS.length);
  for (let index = 0; index < LIST_ELEMENTS.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), LIST_ELEMENTS[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES);

  write24(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  write24(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_END);

  write24(mem, LIST_PTR_TABLE_ADDR, LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    note: 'Exact seeded-list setup copied from probe-phase194-stat-seeded-lists.mjs.',
    expectedBcForThreeElements: hex(EXPECTED_BC),
    listDataAddr: hex(LIST_DATA_ADDR),
    listDataBytes: hexBytes(mem, LIST_DATA_ADDR, LIST_DATA_LEN),
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    vatEntryBytes: hexBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES.length),
    allocatorBefore,
    allocatorAfter: {
      fpsBase: hex(read24Raw(mem, FPSBASE_ADDR)),
      fps: hex(read24Raw(mem, FPS_ADDR)),
      opBase: hex(read24Raw(mem, OPBASE_ADDR)),
      ops: hex(read24Raw(mem, OPS_ADDR)),
      pTemp: hex(read24Raw(mem, PTEMP_ADDR)),
      progPtr: hex(read24Raw(mem, PROGPTR_ADDR)),
      newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
    },
    pointerTableCandidate: {
      pointer0: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
      countByte: hex(mem[LIST_COUNT_ADDR], 2),
      activeListByte: hex(mem[ACTIVE_LIST_ADDR], 2),
    },
    listEditorState: {
      currListHighlight: hex(mem[CURR_LIST_HIGHLIGHT_ADDR] | (mem[CURR_LIST_HIGHLIGHT_ADDR + 1] << 8), 4),
      listName1Bytes: hexBytes(mem, LIST_NAME1_ADDR, 5),
    },
    statFlags: {
      d00089: hex(mem[STATFLAGS_ADDR], 2),
      d0009A: hex(mem[STATFLAGS2_ADDR], 2),
    },
  };
}

function prepareRuntime({ seedLists = false } = {}) {
  const runtime = createRuntime();
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  const seed = seedLists ? seedStatLists(runtime.mem) : null;
  return { ...runtime, boot, memInit, seed };
}

function summarizeMemInit(memInit) {
  return {
    steps: memInit.steps,
    termination: memInit.termination,
    hitSentinel: memInit.hitSentinel,
    finalPc: hex(memInit.lastPc),
    errorMessage: memInit.errorMessage,
  };
}

function snapshotRegisters(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    a: hex(cpu.a, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    sp: hex(cpu.sp),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    f: hex(cpu.f, 2),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function describeStack(mem, sp, len = STACK_DUMP_LEN) {
  const slots = [];
  for (let offset = 0; offset + 2 < len; offset += 3) {
    slots.push({
      offset,
      addr: hex((sp + offset) & 0xFFFFFF),
      value: hex(read24Raw(mem, sp + offset)),
      bytes: hexBytes(mem, sp + offset, 3),
    });
  }

  return {
    start: hex(sp),
    length: len,
    bytes: hexBytes(mem, sp, len),
    wordAtSp: hex(read24Raw(mem, sp)),
    wordAtSpPlus3: hex(read24Raw(mem, sp + 3)),
    wordAtSpPlus6: hex(read24Raw(mem, sp + 6)),
    wordAtSpPlus9: hex(read24Raw(mem, sp + 9)),
    wordAtSpPlus12: hex(read24Raw(mem, sp + 12)),
    slots,
  };
}

function captureTargetEntry(cpu, mem, visitSequence, step) {
  const entryBc = cpu._bc & 0xFFFFFF;
  const entryDe = cpu._de & 0xFFFFFF;
  const entryStack = describeStack(mem, cpu.sp, STACK_DUMP_LEN);

  return {
    step,
    registers: snapshotRegisters(cpu),
    stack: entryStack,
    callHistoryBeforeTarget: visitSequence.slice(-CALL_HISTORY_LIMIT),
    requestedEntryStackInterpretation: {
      wordAtSp: entryStack.wordAtSp,
      wordAtSpPlus3: entryStack.wordAtSpPlus3,
      bcFromSpPlus3LooksCorrect: read24Raw(mem, cpu.sp + 3) === EXPECTED_BC,
      expectedBcForThreeElements: hex(EXPECTED_BC),
    },
    actualLifted09224bInterpretation: {
      popHlWillReceiveEntryBcAfterLocalPush: hex(entryBc),
      popBcWillReceiveEntryDeAfterLocalPush: hex(entryDe),
      popBcMatchesExpectedCount: entryDe === EXPECTED_BC,
      entryBcRegisterMatchesExpectedCount: entryBc === EXPECTED_BC,
      note: 'The lifted 0x09224B block starts with PUSH DE / LD DE,0xD0150B / PUSH BC / POP HL / POP BC, so the raw entry [SP] and [SP+3] words are not the values POP HL/POP BC consume after the block mutates the stack.',
    },
  };
}

function recordVisit(sequence, step, pc, mode, kind, block) {
  sequence.push({
    step,
    blockId: blockKey(pc, mode),
    pc: hex(pc),
    mode,
    kind,
    instruction: blockInstructionLabel(block),
  });
}

function traceStatCaller(runtime) {
  const { executor, cpu, mem } = runtime;
  resetCpuForStatEntry(cpu, mem);

  const visitSequence = [];
  let targetEntry = null;

  const trace = runTraceSegmented(executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [TARGET_BLOCK, 'target_entry'],
      [BOOT_ENTRY, 'boot_crash'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(event) {
      if (event.pc === TARGET_BLOCK && !targetEntry) {
        targetEntry = captureTargetEntry(cpu, mem, visitSequence, event.step);
      }
      recordVisit(visitSequence, event.step, event.pc, event.mode, 'block', event.meta);
    },
    onMissingBlock(event) {
      recordVisit(visitSequence, event.step, event.pc, event.mode, 'missing', null);
    },
  });

  return {
    stepLimit: STAT_TRACE_MAX_STEPS,
    steps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    errorMessage: trace.errorMessage,
    reachedTarget: !!targetEntry,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    targetEntry,
    lastVisitsIncludingTarget: visitSequence.slice(-(CALL_HISTORY_LIMIT + 1)),
  };
}

function findInboundPredecessors(targetPc) {
  const results = [];
  for (const block of Object.values(BLOCKS)) {
    const matches = (block?.exits ?? []).filter((exit) => exit?.target === targetPc && exit?.targetMode === 'adl');
    if (!matches.length) continue;
    results.push({
      predecessorBlock: block.id,
      firstInstruction: blockInstructionLabel(block),
      matchingExits: matches.map(serializeExit),
    });
  }

  results.sort((left, right) => left.predecessorBlock.localeCompare(right.predecessorBlock));
  return results;
}

function main() {
  const runtime = prepareRuntime({ seedLists: true });
  const trace = traceStatCaller(runtime);

  const output = {
    probe: 'probe-phase197-stat-caller-trace.mjs',
    entryAddr: hex(ENTRY_ADDR),
    targetBlock: hex(TARGET_BLOCK),
    followupBlock: hex(FOLLOWUP_BLOCK),
    lddrBlock: hex(LDDR_BLOCK),
    expectedBcForSeededL1: hex(EXPECTED_BC),
    constraints: {
      timerInterrupt: false,
      stackTop: hex(STACK_TOP),
      segmentStepLimit: SEGMENT_STEP_LIMIT,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      callHistoryLimit: CALL_HISTORY_LIMIT,
      stackDumpLength: STACK_DUMP_LEN,
    },
    targetBlockInfo: TARGET_BLOCK_INFO,
    followupBlockInfo: FOLLOWUP_BLOCK_INFO,
    lddrBlockInfo: LDDR_BLOCK_INFO,
    staticPredecessors: {
      to09224B: findInboundPredecessors(TARGET_BLOCK),
      to092259: findInboundPredecessors(FOLLOWUP_BLOCK),
    },
    boot: runtime.boot,
    memInit: summarizeMemInit(runtime.memInit),
    seed: runtime.seed,
    trace,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
