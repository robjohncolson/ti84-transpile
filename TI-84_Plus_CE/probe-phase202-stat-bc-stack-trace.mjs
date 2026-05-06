#!/usr/bin/env node
/**
 * probe-phase202-stat-bc-stack-trace.mjs
 *
 * Phase 202: trace the stack chain that feeds POP BC at 0x092260 and the
 * LDDR at 0x092263 on the seeded STAT 1-Var path.
 *
 * The probe:
 *   1. Cold-boots once and snapshots post-memInit RAM.
 *   2. Replays STAT entry from 0x058BA9 with seeded list sizes 1, 3, and 5.
 *   3. Instruments every executed PUSH, POP, CALL push, and RET pop by
 *      rewriting lifted block source to call probe wrappers.
 *   4. Emits a full stack ledger plus a focused analysis for the 0x09224b /
 *      0x092259 / 0x092263 chain.
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
const RAW_BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
const TRACE_BLOCKS = instrumentBlocks(RAW_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const BLOCK_09201E = 0x09201E;
const BLOCK_09224B = 0x09224B;
const BLOCK_092259 = 0x092259;
const BLOCK_092263 = 0x092263;
const POP_BC_PC = 0x092260;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE202_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
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
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const STAT_STRUCT_BASE = 0xD008E6;
const STAT_CURSOR_ADDR = 0xD008F0;
const STAT_WINDOW_START = 0xD008E0;
const STAT_WINDOW_LENGTH = 0x40;

const LIST_VARIANTS = [
  [1],
  [1, 2, 3],
  [1, 2, 3, 4, 5],
];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function instrumentBlocks(blocks) {
  const instrumented = {};
  for (const [key, block] of Object.entries(blocks)) {
    instrumented[key] = {
      ...block,
      source: instrumentBlockSource(block),
    };
  }
  return instrumented;
}

function instrumentBlockSource(block) {
  if (!block?.source || !Array.isArray(block.instructions)) return block?.source ?? '';
  const instructionsByPc = new Map(block.instructions.map((instruction) => [instruction.pc, instruction]));
  let currentInstruction = null;

  return block.source.split('\n').map((line) => {
    const commentMatch = line.match(/^\s*\/\/\s+0x([0-9a-fA-F]{6})\s+/);
    if (commentMatch) {
      currentInstruction = instructionsByPc.get(parseInt(commentMatch[1], 16)) ?? null;
      return line;
    }
    if (!currentInstruction) return line;

    const pcLiteral = `0x${currentInstruction.pc.toString(16)}`;
    const dasmLiteral = JSON.stringify(currentInstruction.dasm);

    if (line.includes('cpu.popReturn()')) {
      return line.replace(/cpu\.popReturn\(\)/g, `cpu._probePopReturn(${pcLiteral}, ${dasmLiteral})`);
    }
    if (line.includes('cpu.pop()')) {
      return line.replace(/cpu\.pop\(\)/g, `cpu._probePop(${pcLiteral}, ${dasmLiteral})`);
    }
    if (line.includes('cpu.push(')) {
      const method = currentInstruction.tag === 'push' ? '_probePush' : '_probeCallPush';
      return line.replace(/cpu\.push\(/g, `cpu.${method}(${pcLiteral}, ${dasmLiteral}, `);
    }
    return line;
  }).join('\n');
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16Raw(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[a + 1] << 8);
}

function read24Raw(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function write16Raw(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[a + index] = bytes[index] & 0xFF;
  }
}

function hexSlice(buffer, addr, len) {
  const parts = [];
  for (let index = 0; index < len; index += 1) {
    parts.push((buffer[addr + index] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
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
  cpu.mbase = SHORT_MBASE;
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
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function createRuntime(blocks = RAW_BLOCKS) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function createBaselineState() {
  const runtime = createRuntime(RAW_BLOCKS);
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
    },
    baselineMem: new Uint8Array(runtime.mem),
  };
}

function makeListElements(values) {
  return values.map((value) => Uint8Array.from([
    0x00,
    0x80,
    ((Number(value) & 0x0F) << 4) & 0xF0,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]));
}

function seedStatLists(mem, values) {
  const listElementBytes = makeListElements(values);
  const listDataLen = 2 + (listElementBytes.length * 9);
  const listDataEnd = LIST_DATA_ADDR + listDataLen;
  const vatEntryBytes = Uint8Array.from([
    0x01,
    LIST_DATA_ADDR & 0xFF,
    (LIST_DATA_ADDR >>> 8) & 0xFF,
    (LIST_DATA_ADDR >>> 16) & 0xFF,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);

  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_ADDR + 0x200);
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + 0x20);
  write16Raw(mem, LIST_DATA_ADDR, listElementBytes.length);
  for (let index = 0; index < listElementBytes.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), listElementBytes[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    listLength: listElementBytes.length,
    listDataBytes: hexSlice(mem, LIST_DATA_ADDR, listDataLen),
    vatEntryBytes: hexSlice(mem, VAT_ENTRY_ADDR, vatEntryBytes.length),
    listPointer: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
    newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
  };
}

function stackWidth(cpu) {
  return cpu.madl ? 3 : 2;
}

function stackAddress(cpu) {
  if (cpu.madl) return cpu.sp & 0xFFFFFF;
  return ((cpu.mbase << 16) | (cpu.sp & 0xFFFF)) & 0xFFFFFF;
}

function readStackValue(mem, addr, width) {
  return width === 3 ? read24Raw(mem, addr) : read16Raw(mem, addr);
}

function coreRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    bcRaw: cpu.bc,
    de: hex(cpu.de),
    deRaw: cpu.de,
    hl: hex(cpu.hl),
    hlRaw: cpu.hl,
    sp: hex(cpu.sp),
    spRaw: cpu.sp,
  };
}

function snapshotStackWindow(mem, cpu, bytes = 18) {
  const addr = stackAddress(cpu);
  return {
    stackAddr: hex(addr),
    bytes: hexSlice(mem, addr, bytes),
  };
}

function captureBlockEntry(cpu, mem) {
  return {
    ...coreRegisters(cpu),
    stack: snapshotStackWindow(mem, cpu),
  };
}

function inferRegisterName(dasm) {
  if (typeof dasm !== 'string') return null;
  if (dasm.startsWith('push ')) return dasm.slice(5);
  if (dasm.startsWith('pop ')) return dasm.slice(4);
  return null;
}

function findWordOccurrences(mem, start, length, target16) {
  const hits = [];
  for (let offset = 0; offset < length - 1; offset += 1) {
    const addr = start + offset;
    const word = read16Raw(mem, addr);
    if (word === target16) {
      hits.push({
        addr: hex(addr),
        offset: hex(offset, 2),
      });
    }
  }
  return hits;
}

function capturePop092260Snapshot(mem, cpu, valueRaw, sourceEntry) {
  const target16 = valueRaw & 0xFFFF;
  return {
    value: hex(valueRaw),
    valueLow16: hex(target16, 4),
    sourceEventId: sourceEntry?.eventId ?? null,
    sourceInstruction: sourceEntry?.instruction ?? null,
    sourcePc: sourceEntry ? hex(sourceEntry.pcRaw) : null,
    cpuBefore: captureBlockEntry(cpu, mem),
    statWindow: {
      start: hex(STAT_WINDOW_START),
      bytes: hexSlice(mem, STAT_WINDOW_START, STAT_WINDOW_LENGTH),
      structSize16: hex(read16Raw(mem, STAT_STRUCT_BASE), 4),
      structSize16Raw: read16Raw(mem, STAT_STRUCT_BASE),
      structCursor24: hex(read24Raw(mem, STAT_CURSOR_ADDR)),
      structCursor24Raw: read24Raw(mem, STAT_CURSOR_ADDR),
      low16Occurrences: findWordOccurrences(mem, STAT_WINDOW_START, STAT_WINDOW_LENGTH, target16),
    },
  };
}

function attachStackProbe(cpu, mem) {
  const originalPush = cpu.push.bind(cpu);
  const originalPop = cpu.pop.bind(cpu);
  const originalPopReturn = cpu.popReturn.bind(cpu);
  const ledger = [];
  const shadowStack = [];
  const shadowWarnings = [];
  let pop092260Snapshot = null;

  function nextOrderInBlock() {
    cpu._probeOrderInBlock = (cpu._probeOrderInBlock ?? 0) + 1;
    return cpu._probeOrderInBlock;
  }

  function popShadow(expectedAddress, width, pc) {
    for (let index = shadowStack.length - 1; index >= 0; index -= 1) {
      const entry = shadowStack[index];
      if (entry.address === expectedAddress && entry.width === width) {
        shadowStack.splice(index, 1);
        return entry;
      }
    }
    if (shadowStack.length > 0) {
      const fallback = shadowStack.pop();
      shadowWarnings.push({
        pc: hex(pc),
        reason: 'shadow_stack_address_mismatch',
        expectedAddress: hex(expectedAddress),
        fallbackEventId: fallback.eventId,
      });
      return fallback;
    }
    shadowWarnings.push({
      pc: hex(pc),
      reason: 'shadow_stack_underflow',
      expectedAddress: hex(expectedAddress),
    });
    return null;
  }

  function recordPush(kind, pc, instruction, value) {
    const mode = cpu.madl ? 'adl' : 'z80';
    const widthBefore = stackWidth(cpu);
    const spBefore = cpu.sp & 0xFFFFFF;
    const coreBefore = coreRegisters(cpu);
    originalPush(value);
    const spAfter = cpu.sp & 0xFFFFFF;
    const physicalAddress = stackAddress(cpu);
    const storedValue = readStackValue(mem, physicalAddress, widthBefore);
    const event = {
      id: ledger.length,
      kind,
      step: cpu._probeStep ?? null,
      orderInBlock: nextOrderInBlock(),
      blockPc: hex(cpu._currentBlockPc ?? 0),
      blockPcRaw: (cpu._currentBlockPc ?? 0) & 0xFFFFFF,
      pc: hex(pc),
      pcRaw: pc & 0xFFFFFF,
      instruction,
      mode,
      width: widthBefore,
      spBefore: hex(spBefore),
      spAfter: hex(spAfter),
      stackAddress: hex(physicalAddress),
      value: hex(storedValue, widthBefore === 3 ? 6 : 4),
      valueRaw: storedValue,
      register: inferRegisterName(instruction),
      coreBefore,
    };
    shadowStack.push({
      address: physicalAddress,
      width: widthBefore,
      valueRaw: storedValue,
      eventId: event.id,
      instruction: event.instruction,
      pcRaw: event.pcRaw,
      blockPcRaw: event.blockPcRaw,
      kind: event.kind,
      register: event.register,
      coreBefore: event.coreBefore,
    });
    ledger.push(event);
  }

  function recordPop(kind, pc, instruction, popFn) {
    const mode = cpu.madl ? 'adl' : 'z80';
    const widthBefore = stackWidth(cpu);
    const spBefore = cpu.sp & 0xFFFFFF;
    const physicalAddress = stackAddress(cpu);
    const stackedValue = readStackValue(mem, physicalAddress, widthBefore);
    const sourceEntry = popShadow(physicalAddress, widthBefore, pc);
    if ((pc & 0xFFFFFF) === POP_BC_PC && !pop092260Snapshot) {
      pop092260Snapshot = capturePop092260Snapshot(mem, cpu, stackedValue, sourceEntry);
    }
    const coreBefore = coreRegisters(cpu);
    const value = popFn();
    const event = {
      id: ledger.length,
      kind,
      step: cpu._probeStep ?? null,
      orderInBlock: nextOrderInBlock(),
      blockPc: hex(cpu._currentBlockPc ?? 0),
      blockPcRaw: (cpu._currentBlockPc ?? 0) & 0xFFFFFF,
      pc: hex(pc),
      pcRaw: pc & 0xFFFFFF,
      instruction,
      mode,
      width: widthBefore,
      spBefore: hex(spBefore),
      spAfter: hex(cpu.sp),
      stackAddress: hex(physicalAddress),
      value: hex(value, widthBefore === 3 ? 6 : 4),
      valueRaw: value,
      register: inferRegisterName(instruction),
      sourceEventId: sourceEntry?.eventId ?? null,
      sourcePc: sourceEntry ? hex(sourceEntry.pcRaw) : null,
      sourceInstruction: sourceEntry?.instruction ?? null,
      sourceKind: sourceEntry?.kind ?? null,
      sourceRegister: sourceEntry?.register ?? null,
      sourceValue: sourceEntry ? hex(sourceEntry.valueRaw, widthBefore === 3 ? 6 : 4) : null,
      coreBefore,
    };
    ledger.push(event);
    return value;
  }

  cpu._probePush = (pc, instruction, value) => {
    recordPush('push', pc, instruction, value);
  };

  cpu._probeCallPush = (pc, instruction, value) => {
    recordPush('call-push', pc, instruction, value);
  };

  cpu._probePop = (pc, instruction) => recordPop('pop', pc, instruction, originalPop);
  cpu._probePopReturn = (pc, instruction) => recordPop('ret-pop', pc, instruction, originalPopReturn);

  return {
    ledger,
    shadowWarnings,
    getPop092260Snapshot: () => pop092260Snapshot,
  };
}

function analyzeScenario(result) {
  const byId = new Map(result.stackLedger.map((event) => [event.id, event]));
  const popEvent = result.stackLedger.find((event) => event.kind === 'pop' && event.pcRaw === POP_BC_PC) ?? null;
  const sourceEvent = popEvent?.sourceEventId !== null && popEvent?.sourceEventId !== undefined
    ? byId.get(popEvent.sourceEventId) ?? null
    : null;
  const block09224b = result.keyBlockEntries[hex(BLOCK_09224B)] ?? null;
  const block092263 = result.keyBlockEntries[hex(BLOCK_092263)] ?? null;

  const derivation = block09224b && sourceEvent
    ? {
        entryBc: block09224b.bc,
        entryBcRaw: block09224b.bcRaw,
        subtractAddr: hex(LIST_COUNT_ADDR),
        expectedWrappedDelta: hex((block09224b.bcRaw - LIST_COUNT_ADDR) & 0xFFFFFF),
        matchesEntryBcMinusD0150B: (((block09224b.bcRaw - LIST_COUNT_ADDR) & 0xFFFFFF) === sourceEvent.valueRaw),
      }
    : null;

  const statWindow = result.pop092260Snapshot?.statWindow ?? null;
  const statStructureCheck = statWindow && popEvent
    ? {
        popValueLow16: hex(popEvent.valueRaw & 0xFFFF, 4),
        structSize16: statWindow.structSize16,
        structCursor24: statWindow.structCursor24,
        low16OccursInsideWindow: statWindow.low16Occurrences.length > 0,
        low16Occurrences: statWindow.low16Occurrences,
        matchesStructSize16: (popEvent.valueRaw & 0xFFFF) === statWindow.structSize16Raw,
        matchesStructCursorLow16: (popEvent.valueRaw & 0xFFFF) === (statWindow.structCursor24Raw & 0xFFFF),
      }
    : null;

  const sourceSummary = sourceEvent
    ? {
        eventId: sourceEvent.id,
        pc: sourceEvent.pc,
        blockPc: sourceEvent.blockPc,
        instruction: sourceEvent.instruction,
        register: sourceEvent.register,
        value: sourceEvent.value,
        valueRaw: sourceEvent.valueRaw,
      }
    : null;

  return {
    popEvent: popEvent
      ? {
          eventId: popEvent.id,
          pc: popEvent.pc,
          blockPc: popEvent.blockPc,
          instruction: popEvent.instruction,
          value: popEvent.value,
          valueRaw: popEvent.valueRaw,
          sourceEventId: popEvent.sourceEventId,
        }
      : null,
    sourceEvent: sourceSummary,
    lddrEntry: block092263
      ? {
          bc: block092263.bc,
          bcRaw: block092263.bcRaw,
          de: block092263.de,
          hl: block092263.hl,
          sp: block092263.sp,
        }
      : null,
    derivation,
    statStructureCheck,
  };
}

function runScenario(baselineMem, values) {
  const runtime = createRuntime(TRACE_BLOCKS);
  runtime.mem.set(baselineMem);
  const seed = seedStatLists(runtime.mem, values);
  resetCpuForStatEntry(runtime.cpu, runtime.mem);
  const probe = attachStackProbe(runtime.cpu, runtime.mem);
  const keyBlockEntries = {};

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      runtime.cpu._probeStep = event.step;
      runtime.cpu._probeOrderInBlock = 0;
      if ([BLOCK_09201E, BLOCK_09224B, BLOCK_092259, BLOCK_092263].includes(event.pc) && !keyBlockEntries[hex(event.pc)]) {
        keyBlockEntries[hex(event.pc)] = captureBlockEntry(runtime.cpu, runtime.mem);
      }
    },
  });

  const stackLedger = probe.ledger.map((event) => ({
    ...event,
    coreBefore: {
      bc: event.coreBefore.bc,
      de: event.coreBefore.de,
      hl: event.coreBefore.hl,
      sp: event.coreBefore.sp,
    },
  }));
  const focusedLedger = stackLedger.filter((event) => event.pcRaw >= BLOCK_09201E && event.pcRaw <= 0x09227E);

  const result = {
    listValues: values,
    seed,
    trace: {
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      errorMessage: trace.errorMessage,
    },
    keyBlockEntries,
    pop092260Snapshot: probe.getPop092260Snapshot(),
    stackLedger,
    focusedLedger,
    shadowWarnings: probe.shadowWarnings,
  };

  result.analysis = analyzeScenario(result);
  return result;
}

function buildComparison(scenarios) {
  const rows = scenarios.map((scenario) => ({
    listSize: scenario.listValues.length,
    listValues: scenario.listValues,
    lddrBc: scenario.analysis.lddrEntry?.bc ?? null,
    sourcePush: scenario.analysis.sourceEvent
      ? `${scenario.analysis.sourceEvent.instruction} @ ${scenario.analysis.sourceEvent.pc}`
      : null,
    sourceValue: scenario.analysis.sourceEvent?.value ?? null,
    popValue: scenario.analysis.popEvent?.value ?? null,
    derivedFromEntryBcMinusD0150B: scenario.analysis.derivation?.matchesEntryBcMinusD0150B ?? null,
  }));

  const firstBc = rows[0]?.lddrBc ?? null;
  const firstSource = rows[0]?.sourcePush ?? null;
  const firstValue = rows[0]?.sourceValue ?? null;

  return {
    rows,
    allLddrBcMatch: rows.every((row) => row.lddrBc === firstBc),
    allSourcePushesMatch: rows.every((row) => row.sourcePush === firstSource),
    allSourceValuesMatch: rows.every((row) => row.sourceValue === firstValue),
  };
}

function main() {
  const baseline = createBaselineState();
  const scenarios = LIST_VARIANTS.map((values) => runScenario(baseline.baselineMem, values));

  const output = {
    probe: 'probe-phase202-stat-bc-stack-trace',
    generatedAt: new Date().toISOString(),
    constraints: {
      timerInterrupt: false,
      statEntry: hex(STAT_ENTRY),
      lddrBlock: hex(BLOCK_092263),
      popBcPc: hex(POP_BC_PC),
      statStructBase: hex(STAT_STRUCT_BASE),
      statCursorAddr: hex(STAT_CURSOR_ADDR),
      listDataAddr: hex(LIST_DATA_ADDR),
      vatEntryAddr: hex(VAT_ENTRY_ADDR),
      iy: hex(0xD00080),
      maxSteps: STAT_TRACE_MAX_STEPS,
    },
    baseline: {
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    scenarios,
    comparison: buildComparison(scenarios),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
