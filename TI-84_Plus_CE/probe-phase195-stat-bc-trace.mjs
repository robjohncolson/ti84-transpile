#!/usr/bin/env node
/**
 * probe-phase195-stat-bc-trace.mjs
 *
 * Phase 195:
 *   A. Seed L1 and trace BC across the 0x058BA9 STAT path for 5000 steps.
 *   B. Re-run the same seeded trace for 10000 steps and compare STAT-area reach.
 *   C. Statically scan lifted predecessors of 0x092263 for LD BC,<value>.
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
const CALC_AREA_START = 0x091E00;
const CALC_AREA_END = 0x093000;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE195_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const STAT_TRACE_EXTENDED_MAX_STEPS = 10000;
const OS_MAX_LOOP_ITERATIONS = 8192;

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

const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;
const OP_LENGTH = 9;

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

const TARGET_BLOCK_INFO = describeTargetBlock();

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

function lastOf(values) {
  return values.length ? values[values.length - 1] : null;
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
    target: hex(exit.target),
    targetMode: exit.targetMode ?? null,
  };
}

function formatInstructionRef(inst) {
  return `${hex(inst.pc)} ${inst.dasm}`;
}

function blockInstructionLabel(block) {
  return block?.instructions?.[0] ? formatInstructionRef(block.instructions[0]) : 'missing';
}

function snapshotOpRegister(mem, addr) {
  return {
    addr: hex(addr),
    bytes: hexBytes(mem, addr, OP_LENGTH),
    raw: Array.from(mem.slice(addr, addr + OP_LENGTH)),
  };
}

function snapshotFinalState(cpu, mem, pc) {
  return {
    pc: hex(pc),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    sp: hex(cpu.sp),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    op1: snapshotOpRegister(mem, OP1_ADDR),
    op2: snapshotOpRegister(mem, OP2_ADDR),
  };
}

function describeTargetBlock() {
  const block = BLOCKS[blockKey(TARGET_BLOCK)];
  if (!block) {
    return {
      present: false,
      id: blockKey(TARGET_BLOCK),
    };
  }

  return {
    present: true,
    id: block.id,
    instructionCount: block.instructionCount ?? 0,
    instructions: (block.instructions ?? []).map(serializeInstruction),
    exits: (block.exits ?? []).map(serializeExit),
  };
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
          if (onBlock) onBlock({
            pc: norm,
            mode: dispatchMode ?? lastMode,
            meta,
            step: globalStep,
          });
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) onMissingBlock({
            pc: norm,
            mode: dispatchMode ?? lastMode,
            step: globalStep,
          });
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
    note: 'Exact RAM seeding copied from probe-phase194-stat-seeded-lists.mjs.',
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

function recordUniqueVisit(uniqueVisited, seen, step, pc, mode, kind, block) {
  const id = blockKey(pc, mode);
  if (seen.has(id)) return;
  seen.add(id);
  uniqueVisited.push({
    step,
    blockId: id,
    pcRaw: pc,
    pc: hex(pc),
    mode,
    kind,
    instruction: blockInstructionLabel(block),
  });
}

function findLdBcImmediateInstructions(block) {
  return (block?.instructions ?? [])
    .filter((inst) => /^ld bc,\s*0x/i.test(inst.dasm ?? ''))
    .map(formatInstructionRef);
}

function isDefiniteBcWriter(dasm) {
  const text = dasm.toLowerCase();
  return /^ld bc,/i.test(dasm)
    || text === 'pop bc'
    || text === 'inc bc'
    || text === 'dec bc'
    || text === 'mlt bc'
    || /^(ldi|ldir|ldd|lddr|cpi|cpir|cpd|cpdr)$/.test(text);
}

function isPossibleBcWriter(dasm) {
  const text = dasm.toLowerCase();
  return /^ld b,/i.test(dasm)
    || /^ld c,/i.test(dasm)
    || /^(inc|dec) b$/.test(text)
    || /^(inc|dec) c$/.test(text)
    || /^(rl|rr|rlc|rrc|sla|sra|sll|srl) b$/.test(text)
    || /^(rl|rr|rlc|rrc|sla|sra|sll|srl) c$/.test(text)
    || /^set \d+, b$/.test(text)
    || /^set \d+, c$/.test(text)
    || /^res \d+, b$/.test(text)
    || /^res \d+, c$/.test(text);
}

function analyzeBcWriters(block) {
  const definite = [];
  const possible = [];
  const ldImmediate = [];

  for (const inst of block?.instructions ?? []) {
    const dasm = inst?.dasm ?? '';
    if (!dasm) continue;
    const ref = formatInstructionRef(inst);
    if (/^ld bc,\s*0x/i.test(dasm)) ldImmediate.push(ref);
    if (isDefiniteBcWriter(dasm)) {
      definite.push(ref);
    } else if (isPossibleBcWriter(dasm)) {
      possible.push(ref);
    }
  }

  let instruction = null;
  let confidence = 'unidentified';
  if (ldImmediate.length === 1) {
    instruction = ldImmediate[0];
    confidence = 'ld_bc_immediate';
  } else if (ldImmediate.length > 1) {
    instruction = ldImmediate.join(' | ');
    confidence = 'ambiguous_ld_bc_immediate';
  } else if (definite.length === 1) {
    instruction = definite[0];
    confidence = 'definite';
  } else if (definite.length > 1) {
    instruction = definite.join(' | ');
    confidence = 'ambiguous_definite';
  } else if (possible.length === 1) {
    instruction = possible[0];
    confidence = 'possible';
  } else if (possible.length > 1) {
    instruction = possible.join(' | ');
    confidence = 'ambiguous_possible';
  }

  return {
    instruction,
    confidence,
    ldImmediate,
    definite,
    possible,
  };
}

function buildBcChange(previousEntry, observedAt, newBcRaw) {
  const writerInfo = analyzeBcWriters(previousEntry.block);
  return {
    changedAfterStep: previousEntry.step,
    blockPc: hex(previousEntry.pc),
    blockId: previousEntry.blockId,
    blockKind: previousEntry.kind,
    blockInstruction: previousEntry.instruction,
    previousBc: hex(previousEntry.bcRaw),
    previousBcRaw: previousEntry.bcRaw,
    newBc: hex(newBcRaw),
    newBcRaw,
    observedAtStep: observedAt.step,
    observedAtPc: observedAt.pc === null ? null : hex(observedAt.pc),
    writerInstruction: writerInfo.instruction,
    writerConfidence: writerInfo.confidence,
    ldBcImmediateCandidates: writerInfo.ldImmediate,
    bcWriterCandidates: [...writerInfo.definite, ...writerInfo.possible],
  };
}

function traceStatExecution(runtime, options = {}) {
  const stepLimit = options.stepLimit ?? STAT_TRACE_MAX_STEPS;
  const captureBcLog = options.captureBcLog ?? false;
  const { executor, cpu, mem } = runtime;

  resetCpuForStatEntry(cpu, mem);

  const bcLog = [];
  const bcChanges = [];
  const uniqueVisited = [];
  const seenUnique = new Set();
  let previousEntry = null;
  let lddrEntry = null;

  const trace = runTraceSegmented(executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: stepLimit,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [BOOT_ENTRY, 'boot_crash'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(event) {
      observeStep(event.pc, event.mode, 'block', event.meta, event.step);
    },
    onMissingBlock(event) {
      observeStep(event.pc, event.mode, 'missing', null, event.step);
    },
  });

  const finalBcRaw = cpu._bc & 0xFFFFFF;
  if (previousEntry && previousEntry.bcRaw !== finalBcRaw) {
    bcChanges.push(buildBcChange(previousEntry, {
      step: trace.steps + 1,
      pc: trace.lastPc,
    }, finalBcRaw));
  }

  const bcChangesBeforeLddr = lddrEntry
    ? bcChanges.filter((change) => change.changedAfterStep < lddrEntry.step)
    : bcChanges.slice();
  const ldBcChangesBeforeLddr = bcChangesBeforeLddr.filter((change) => change.ldBcImmediateCandidates.length > 0);

  return {
    stepLimit,
    steps: trace.steps,
    termination: trace.termination,
    hitSentinel: trace.hitSentinel,
    errorMessage: trace.errorMessage,
    uniqueVisitedCount: uniqueVisited.length,
    uniqueVisited,
    lddrReached: !!lddrEntry,
    lddrEntry,
    bcAttributionNote: 'BC is sampled at block entry, so a detected change is attributed to the previous executed block.',
    bcLogCount: bcLog.length,
    bcLog: captureBcLog ? bcLog : null,
    bcChangeCount: bcChanges.length,
    bcChanges,
    bcChangesBeforeLddr,
    lastBcChangeBeforeLddr: lastOf(bcChangesBeforeLddr),
    ldBcChangesBeforeLddr,
    lastLdBcChangeBeforeLddr: lastOf(ldBcChangesBeforeLddr),
    finalState: snapshotFinalState(cpu, mem, trace.lastPc),
  };

  function observeStep(pc, mode, kind, block, step) {
    const bcRaw = cpu._bc & 0xFFFFFF;
    const blockId = blockKey(pc, mode);
    const instruction = blockInstructionLabel(block);

    if (previousEntry && previousEntry.bcRaw !== bcRaw) {
      bcChanges.push(buildBcChange(previousEntry, { step, pc }, bcRaw));
    }

    if (captureBcLog) {
      bcLog.push({
        step,
        pc: hex(pc),
        blockId,
        mode,
        kind,
        instruction,
        bc: hex(bcRaw),
        bcRaw,
      });
    }

    recordUniqueVisit(uniqueVisited, seenUnique, step, pc, mode, kind, block);

    if (pc === TARGET_BLOCK && !lddrEntry) {
      lddrEntry = {
        step,
        pc: hex(pc),
        bc: hex(bcRaw),
        bcRaw,
        de: hex(cpu._de),
        hl: hex(cpu._hl),
        sp: hex(cpu.sp),
        op1: snapshotOpRegister(mem, OP1_ADDR),
        op2: snapshotOpRegister(mem, OP2_ADDR),
      };
    }

    previousEntry = {
      step,
      pc,
      blockId,
      mode,
      kind,
      instruction,
      bcRaw,
      block,
    };
  }
}

function collectCalcAreaVisits(uniqueVisited) {
  return uniqueVisited.filter((visit) => visit.pcRaw >= CALC_AREA_START && visit.pcRaw < CALC_AREA_END);
}

function compareCalcAreaCoverage(baseTrace, extendedTrace) {
  const baseCalcArea = collectCalcAreaVisits(baseTrace.uniqueVisited);
  const extendedCalcArea = collectCalcAreaVisits(extendedTrace.uniqueVisited);
  const baseIds = new Set(baseCalcArea.map((visit) => visit.blockId));
  const newCalcAreaBlocks = extendedCalcArea.filter((visit) => !baseIds.has(visit.blockId));

  return {
    baseStepLimit: baseTrace.stepLimit,
    extendedStepLimit: extendedTrace.stepLimit,
    baseUniqueBlockCount: baseTrace.uniqueVisitedCount,
    extendedUniqueBlockCount: extendedTrace.uniqueVisitedCount,
    baseCalcAreaUniqueCount: baseCalcArea.length,
    extendedCalcAreaUniqueCount: extendedCalcArea.length,
    reachedNewCalcAreaBlocks: newCalcAreaBlocks.length > 0,
    newCalcAreaBlocks,
  };
}

function findEdgeInstructionsToTarget(block, targetPc) {
  return (block.instructions ?? [])
    .filter((inst) => inst.target === targetPc || inst.fallthrough === targetPc)
    .map(serializeInstruction);
}

function buildPredecessorRecord(block, matchingExits) {
  const bcWriterInfo = analyzeBcWriters(block);
  const ldBcImmediateInstructions = findLdBcImmediateInstructions(block);

  return {
    predecessorBlock: block.id,
    startPc: hex(block.startPc ?? parseInt(block.id.slice(0, 6), 16)),
    mode: block.mode ?? null,
    firstInstruction: blockInstructionLabel(block),
    exitMatches: matchingExits.map(serializeExit),
    edgeInstructionsToTarget: findEdgeInstructionsToTarget(block, TARGET_BLOCK),
    containsLdBcImmediate: ldBcImmediateInstructions.length > 0,
    ldBcImmediateInstructions,
    bcWriterCandidates: [...bcWriterInfo.definite, ...bcWriterInfo.possible],
  };
}

function runStaticPredecessorAnalysis() {
  const allInboundPredecessors = [];
  const strictJumpOrCallPredecessors = [];

  for (const block of Object.values(BLOCKS)) {
    const matchingExits = (block.exits ?? []).filter((exit) => exit?.target === TARGET_BLOCK && exit?.targetMode === 'adl');
    if (matchingExits.length === 0) continue;

    const record = buildPredecessorRecord(block, matchingExits);
    allInboundPredecessors.push(record);

    if (matchingExits.some((exit) => exit.type === 'branch' || exit.type === 'call')) {
      strictJumpOrCallPredecessors.push(record);
    }
  }

  allInboundPredecessors.sort((left, right) => left.predecessorBlock.localeCompare(right.predecessorBlock));
  strictJumpOrCallPredecessors.sort((left, right) => left.predecessorBlock.localeCompare(right.predecessorBlock));

  return {
    targetBlock: TARGET_BLOCK_INFO,
    scanNote: 'Strict jump/call predecessors are reported separately from all inbound predecessors so fallthrough edges remain visible.',
    strictJumpOrCallPredecessorCount: strictJumpOrCallPredecessors.length,
    strictJumpOrCallPredecessors,
    allInboundPredecessorCount: allInboundPredecessors.length,
    allInboundPredecessors,
  };
}

function main() {
  const runtimeA = prepareRuntime({ seedLists: true });
  const traceA = traceStatExecution(runtimeA, {
    stepLimit: STAT_TRACE_MAX_STEPS,
    captureBcLog: true,
  });

  const runtimeB = prepareRuntime({ seedLists: true });
  const traceB = traceStatExecution(runtimeB, {
    stepLimit: STAT_TRACE_EXTENDED_MAX_STEPS,
    captureBcLog: false,
  });

  const experimentA = {
    boot: runtimeA.boot,
    memInit: summarizeMemInit(runtimeA.memInit),
    seed: runtimeA.seed,
    trace: traceA,
  };

  const experimentB = {
    boot: runtimeB.boot,
    memInit: summarizeMemInit(runtimeB.memInit),
    seed: runtimeB.seed,
    trace: {
      stepLimit: traceB.stepLimit,
      steps: traceB.steps,
      termination: traceB.termination,
      hitSentinel: traceB.hitSentinel,
      errorMessage: traceB.errorMessage,
      uniqueVisitedCount: traceB.uniqueVisitedCount,
      uniqueVisited: traceB.uniqueVisited,
      lddrReached: traceB.lddrReached,
      lddrEntry: traceB.lddrEntry,
      comparisonTo5000: compareCalcAreaCoverage(traceA, traceB),
      finalState: traceB.finalState,
    },
  };

  const experimentC = runStaticPredecessorAnalysis();

  const output = {
    probe: 'probe-phase195-stat-bc-trace.mjs',
    entryAddr: hex(ENTRY_ADDR),
    targetBlock: hex(TARGET_BLOCK),
    calcAreaRange: `${hex(CALC_AREA_START)}..${hex(CALC_AREA_END - 1)}`,
    constraints: {
      timerInterrupt: false,
      mbase: hex(0xD0, 2),
      ix: hex(0xD1A860),
      stackTop: hex(STACK_TOP),
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
