#!/usr/bin/env node
/**
 * probe-phase194-stat-seeded-lists.mjs
 *
 * Seed a minimal L1 list into RAM, then re-run the STAT handler trace that
 * reaches the fused LDDR block at 0x092263.
 *
 * Experiments:
 *   A. Seeded STAT trace from 0x058BA9 with sentinel watch and 5000-step budget
 *   B. Compare BC at 0x092263 with seeded vs unseeded RAM
 *   C. Directly enter 0x092263 with BC=3 and safe RAM buffers
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
const TARGET_BLOCK = 0x092263;
const SUCCESSOR_BLOCK = 0x092265;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE194_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const DIRECT_LDDR_MAX_STEPS = 8;
const OS_MAX_LOOP_ITERATIONS = 8192;

const LIST_DATA_ADDR = 0xD10000;
const VAT_ENTRY_ADDR = 0xD1A800;
const SAFE_COPY_SRC = 0xD11000;
const SAFE_COPY_DEST = 0xD11020;

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

const TARGET_BLOCK_INFO = inspectTargetBlock();

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

function formatFlags(flags) {
  return {
    hex: hex(flags, 2),
    s: !!(flags & 0x80),
    z: !!(flags & 0x40),
    h: !!(flags & 0x10),
    pv: !!(flags & 0x04),
    n: !!(flags & 0x02),
    c: !!(flags & 0x01),
  };
}

function peekStack(cpu, mem) {
  return {
    spValue: hex(read24Raw(mem, cpu.sp)),
    spPlus3Value: hex(read24Raw(mem, cpu.sp + 3)),
    spPlus6Value: hex(read24Raw(mem, cpu.sp + 6)),
  };
}

function snapshotCpu(cpu, mem) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: formatFlags(cpu.f),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
    stack: peekStack(cpu, mem),
  };
}

function inspectTargetBlock() {
  const block = BLOCKS[blockKey(TARGET_BLOCK)];
  const successor = BLOCKS[blockKey(SUCCESSOR_BLOCK)];
  const nextInstruction = block?.instructions?.[1] ?? null;
  return {
    targetPresent: !!block,
    successorPresent: !!successor,
    targetInstructionCount: block?.instructionCount ?? 0,
    hasInlineSuccessor: block?.instructions?.some((inst) => inst.pc === SUCCESSOR_BLOCK) ?? false,
    nextInstructionAfterLddr: nextInstruction
      ? {
          pc: hex(nextInstruction.pc),
          dasm: nextInstruction.dasm,
        }
      : null,
    returnsViaPopReturn: block?.source?.includes('return cpu.popReturn();') ?? false,
  };
}

function blockInstructionLabel(block) {
  return block?.instructions?.[0]?.dasm ?? 'missing';
}

function recordVisit(sequence, uniqueVisits, seen, pc, kind, block) {
  const norm = pc & 0xFFFFFF;
  const visit = {
    index: sequence.length,
    pc: hex(norm),
    kind,
    instruction: blockInstructionLabel(block),
  };
  sequence.push(visit);
  if (seen.has(norm)) return;
  seen.add(norm);
  uniqueVisits.push(visit);
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

function runUntilHitSegmented(executor, entry, mode, options = {}) {
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
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) onBlock(norm, dispatchMode, meta, step ?? 0);
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) onMissingBlock(norm, dispatchMode, step ?? 0);
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
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', {
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
  const pointerBefore = {
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
    note: 'Seeded confirmed allocator/VAT slots. Prompt-candidate 0xD0258E/0xD02591 overlap FPS/OPBase/OPS, so they are reported after seeding instead of being forced to conflicting values.',
    listDataAddr: hex(LIST_DATA_ADDR),
    listDataBytes: hexBytes(mem, LIST_DATA_ADDR, LIST_DATA_LEN),
    vatEntryAddr: hex(VAT_ENTRY_ADDR),
    vatEntryBytes: hexBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES.length),
    allocatorBefore: pointerBefore,
    allocatorAfter: {
      fpsBase: hex(read24Raw(mem, FPSBASE_ADDR)),
      fps: hex(read24Raw(mem, FPS_ADDR)),
      opBase: hex(read24Raw(mem, OPBASE_ADDR)),
      ops: hex(read24Raw(mem, OPS_ADDR)),
      pTemp: hex(read24Raw(mem, PTEMP_ADDR)),
      progPtr: hex(read24Raw(mem, PROGPTR_ADDR)),
      newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
    },
    promptCandidateBytes: {
      pTemp_0xD0258E: hexBytes(mem, 0xD0258E, 3),
      progPtr_0xD02591: hexBytes(mem, 0xD02591, 3),
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

function runFullStatTrace(runtime) {
  const { executor, cpu, mem } = runtime;
  resetCpuForStatEntry(cpu, mem);

  const visitSequence = [];
  const uniqueVisited = [];
  const seen = new Set();
  let lddrEntry = null;

  const trace = runUntilHitSegmented(executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [SUCCESSOR_BLOCK, 'successor_block'],
      [BOOT_ENTRY, 'boot_crash'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(pc, mode, meta, step) {
      recordVisit(visitSequence, uniqueVisited, seen, pc, 'block', meta);
      if (pc === TARGET_BLOCK && !lddrEntry) {
        lddrEntry = {
          step: step + 1,
          bcRaw: cpu._bc & 0xFFFFFF,
          bc: hex(cpu._bc),
          de: hex(cpu._de),
          hl: hex(cpu._hl),
          sp: hex(cpu.sp),
          stack: peekStack(cpu, mem),
        };
      }
    },
    onMissingBlock(pc, mode, step) {
      recordVisit(visitSequence, uniqueVisited, seen, pc, 'missing', null);
    },
  });

  const finalCpu = snapshotCpu(cpu, mem);
  const inferredSuccessorReached = !!lddrEntry
    && TARGET_BLOCK_INFO.hasInlineSuccessor
    && trace.hitSentinel?.name !== 'boot_crash'
    && trace.termination !== 'exception';

  return {
    entryAddr: hex(ENTRY_ADDR),
    steps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    uniqueVisitedCount: uniqueVisited.length,
    uniqueVisited: uniqueVisited.slice(0, 128),
    lastVisits: visitSequence.slice(-16),
    lddrTriggered: !!lddrEntry,
    lddrEntry,
    targetBlockHasInlineSuccessor: TARGET_BLOCK_INFO.hasInlineSuccessor,
    proceededPastLddr: inferredSuccessorReached,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    finalCpu,
    errorMessage: trace.errorMessage,
  };
}

function traceToLddrEntry(runtime) {
  const { executor, cpu, mem } = runtime;
  resetCpuForStatEntry(cpu, mem);

  const visitSequence = [];
  const uniqueVisited = [];
  const seen = new Set();
  let lddrEntry = null;

  const trace = runUntilHitSegmented(executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [TARGET_BLOCK, 'lddr_entry'],
      [BOOT_ENTRY, 'boot_crash'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(pc, mode, meta, step) {
      recordVisit(visitSequence, uniqueVisited, seen, pc, 'block', meta);
      if (pc === TARGET_BLOCK && !lddrEntry) {
        lddrEntry = {
          step: step + 1,
          bcRaw: cpu._bc & 0xFFFFFF,
          bc: hex(cpu._bc),
          de: hex(cpu._de),
          hl: hex(cpu._hl),
          sp: hex(cpu.sp),
          stack: peekStack(cpu, mem),
        };
      }
    },
    onMissingBlock(pc) {
      recordVisit(visitSequence, uniqueVisited, seen, pc, 'missing', null);
    },
  });

  return {
    steps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    uniqueVisitedCount: uniqueVisited.length,
    uniqueVisited: uniqueVisited.slice(0, 128),
    lastVisits: visitSequence.slice(-12),
    lddrEntry,
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    errorMessage: trace.errorMessage,
  };
}

function compareBcSnapshots(seeded, unseeded) {
  const seededBc = seeded.lddrEntry?.bcRaw ?? null;
  const unseededBc = unseeded.lddrEntry?.bcRaw ?? null;
  return {
    seededBc: seeded.lddrEntry?.bc ?? null,
    unseededBc: unseeded.lddrEntry?.bc ?? null,
    changed: seededBc !== null && unseededBc !== null ? seededBc !== unseededBc : null,
    bothReachedLddr: !!seeded.lddrEntry && !!unseeded.lddrEntry,
  };
}

function runDirectLddrBypass(runtime) {
  const { executor, cpu, mem } = runtime;
  resetCpuForOsCall(cpu, mem);

  writeBytes(mem, SAFE_COPY_SRC, Uint8Array.from([0x11, 0x22, 0x33]));
  writeBytes(mem, SAFE_COPY_DEST, Uint8Array.from([0x00, 0x00, 0x00]));

  cpu._hl = SAFE_COPY_SRC + 2;
  cpu._de = SAFE_COPY_DEST + 2;
  cpu._bc = 0x000003;
  write24(mem, cpu.sp, 0x000001);
  write24(mem, cpu.sp + 3, RETURN_SENTINEL);

  const entrySnapshot = snapshotCpu(cpu, mem);
  const sourceBefore = hexBytes(mem, SAFE_COPY_SRC, 3);
  const destBefore = hexBytes(mem, SAFE_COPY_DEST, 3);

  const result = executor.runFrom(TARGET_BLOCK, 'adl', {
    maxSteps: DIRECT_LDDR_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
  });

  const destAfter = hexBytes(mem, SAFE_COPY_DEST, 3);
  const finalCpu = snapshotCpu(cpu, mem);
  const returnedToSentinel = ((result.lastPc ?? -1) & 0xFFFFFF) === RETURN_SENTINEL;
  const copySucceeded = destAfter === sourceBefore;
  const inferredSuccessorReached = TARGET_BLOCK_INFO.hasInlineSuccessor
    && returnedToSentinel
    && result.termination !== 'error';

  return {
    entryPc: hex(TARGET_BLOCK),
    targetBlockHasInlineSuccessor: TARGET_BLOCK_INFO.hasInlineSuccessor,
    sourceAddr: hex(SAFE_COPY_SRC),
    destAddr: hex(SAFE_COPY_DEST),
    sourceBefore,
    destBefore,
    entryCpu: entrySnapshot,
    steps: result.steps,
    termination: result.termination,
    finalPc: hex(result.lastPc),
    finalMode: result.lastMode ?? 'adl',
    returnedToSentinel,
    inferredSuccessorReached,
    copySucceeded,
    destAfter,
    finalCpu,
  };
}

function main() {
  const experimentASeeded = prepareRuntime({ seedLists: true });
  const experimentA = {
    boot: experimentASeeded.boot,
    memInit: {
      steps: experimentASeeded.memInit.steps,
      termination: experimentASeeded.memInit.termination,
      hitSentinel: experimentASeeded.memInit.hitSentinel,
      finalPc: hex(experimentASeeded.memInit.lastPc),
    },
    seed: experimentASeeded.seed,
    trace: runFullStatTrace(experimentASeeded),
  };

  const seededCompareRuntime = prepareRuntime({ seedLists: true });
  const unseededCompareRuntime = prepareRuntime({ seedLists: false });
  const seededLddrEntry = traceToLddrEntry(seededCompareRuntime);
  const unseededLddrEntry = traceToLddrEntry(unseededCompareRuntime);

  const experimentB = {
    seeded: {
      boot: seededCompareRuntime.boot,
      memInit: {
        steps: seededCompareRuntime.memInit.steps,
        termination: seededCompareRuntime.memInit.termination,
        hitSentinel: seededCompareRuntime.memInit.hitSentinel,
        finalPc: hex(seededCompareRuntime.memInit.lastPc),
      },
      seed: seededCompareRuntime.seed,
      trace: seededLddrEntry,
    },
    unseeded: {
      boot: unseededCompareRuntime.boot,
      memInit: {
        steps: unseededCompareRuntime.memInit.steps,
        termination: unseededCompareRuntime.memInit.termination,
        hitSentinel: unseededCompareRuntime.memInit.hitSentinel,
        finalPc: hex(unseededCompareRuntime.memInit.lastPc),
      },
      trace: unseededLddrEntry,
    },
    comparison: compareBcSnapshots(seededLddrEntry, unseededLddrEntry),
  };

  const directLddrRuntime = prepareRuntime({ seedLists: false });
  const experimentC = {
    boot: directLddrRuntime.boot,
    memInit: {
      steps: directLddrRuntime.memInit.steps,
      termination: directLddrRuntime.memInit.termination,
      hitSentinel: directLddrRuntime.memInit.hitSentinel,
      finalPc: hex(directLddrRuntime.memInit.lastPc),
    },
    directRun: runDirectLddrBypass(directLddrRuntime),
  };

  const output = {
    targetBlock: hex(TARGET_BLOCK),
    successorBlock: hex(SUCCESSOR_BLOCK),
    constraints: {
      timerInterrupt: false,
      segmentStepLimit: SEGMENT_STEP_LIMIT,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    },
    targetBlockInfo: TARGET_BLOCK_INFO,
    experimentA,
    experimentB,
    experimentC,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
