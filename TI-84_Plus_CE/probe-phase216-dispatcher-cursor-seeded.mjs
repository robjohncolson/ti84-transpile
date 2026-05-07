#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  throw new Error(
    existsSync(transpiledGzipPath)
      ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
      : 'ROM.transpiled.js is missing.',
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(romPath);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;
const MEM_INIT_RET = 0x7ffff6;

const DISPATCHER_ENTRY = 0x061290;
const PATH_NONZERO = 0x06129c;
const PATH_ZERO = 0x0612b6;
const SET4_PC = 0x0612b0;
const ALT_SET4_PC = 0x0612e4;

const SUBCALL_06121E = 0x06121e;
const SUBCALL_0605A4 = 0x0605a4;
const SUBCALL_06C737 = 0x06c737;
const HELPER_06C732 = 0x06c732;
const HELPER_061234 = 0x061234;
const HELPER_060056 = 0x060056;

const TRACE_A = 0x03;
const TRACE_MAX_STEPS = 500;
const SUBCALL_TRACE_STEPS = 200;
const MAX_LOOP_ITERATIONS = 8192;

const DEFAULT_STACK_TOP = 0xd1a87e;
const HOME_STACK_TOP = 0xd1a860;
const IX_ADDR = 0xd1a860;
const IY_ADDR = 0xd00080;
const MBASE = 0xd0;

const IY_PLUS_5 = IY_ADDR + 0x05;
const IY_PLUS_9 = IY_ADDR + 0x09;
const IY_PLUS_12 = IY_ADDR + 0x0c;
const IY_PLUS_18 = IY_ADDR + 0x18;
const IY_PLUS_44 = IY_ADDR + 0x44;

const D02575_ADDR = 0xd02575;

const EDIT_TOP = 0xd02437;
const EDIT_CURSOR = 0xd0243a;
const EDIT_TAIL = 0xd0243d;
const EDIT_BOTTOM = 0xd02440;
const EDIT_BUFFER_START = 0xd00a00;

const TRACE_RET_SENTINEL = 0x7ffffe;
const SUBCALL_RET_SENTINEL_BASE = 0x7fff00;

const DISPATCHER_SUBCALLS = [
  { addr: SUBCALL_06121E, label: '0x06121E' },
  { addr: SUBCALL_0605A4, label: '0x0605A4' },
  { addr: SUBCALL_06C737, label: '0x06C737' },
];

const INTERESTING_DISPATCHER_ADDRS = [
  PATH_NONZERO,
  PATH_ZERO,
  SET4_PC,
  ALT_SET4_PC,
  SUBCALL_06121E,
  SUBCALL_0605A4,
  SUBCALL_06C737,
  HELPER_06C732,
  HELPER_061234,
  HELPER_060056,
];

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }

  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function hexSized(value, size) {
  return size === 1 ? hexByte(value) : hex(value, size * 2);
}

function bytesToHex(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (value) =>
    (value & 0xff).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return ((mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, value & 0xffffff);
}

function summarizeBlock(meta) {
  if (Array.isArray(meta?.instructions) && meta.instructions.length > 0) {
    return meta.instructions.map((instruction) => instruction.dasm).join(' ; ');
  }

  if (typeof meta?.source === 'string') {
    return meta.source
      .split('\n')
      .filter((line) => line.includes('// 0x'))
      .map((line) => line.replace(/^\s*\/\/\s*/, '').trim())
      .slice(0, 4)
      .join(' ; ');
  }

  return '(no lifted metadata)';
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem, stackTop = DEFAULT_STACK_TOP) {
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
  mem.fill(0xff, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

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
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: {
      steps: boot.steps,
      termination: boot.termination,
      lastPc: hex(boot.lastPc ?? 0),
    },
    kernelInit: {
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc ?? 0),
    },
    postInit: {
      steps: postInit.steps,
      termination: postInit.termination,
      lastPc: hex(postInit.lastPc ?? 0),
    },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, DEFAULT_STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return', hex(pc));
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return', hex(pc));
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE216_STOP__' && error.stopName === 'mem_init_return') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
  };
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE216_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function stateSnapshot(cpu, mem) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    sp: hex(cpu.sp),
    iy: hex(cpu.iy),
    ix: hex(cpu.ix),
    d02575: hexByte(mem[D02575_ADDR]),
    d02575LowNibble: hexByte(mem[D02575_ADDR] & 0x0f),
    iyPlus5: hexByte(mem[IY_PLUS_5]),
    iyPlus9: hexByte(mem[IY_PLUS_9]),
    iyPlus12: hexByte(mem[IY_PLUS_12]),
    iyPlus18: hexByte(mem[IY_PLUS_18]),
    iyPlus44: hexByte(mem[IY_PLUS_44]),
    editTop: hex(read24(mem, EDIT_TOP)),
    editCursor: hex(read24(mem, EDIT_CURSOR)),
    editTail: hex(read24(mem, EDIT_TAIL)),
    editBottom: hex(read24(mem, EDIT_BOTTOM)),
    editBuffer16Hex: bytesToHex(mem, EDIT_BUFFER_START, 16),
  };
}

function registerSnapshot(cpu, lastPc, lastMode) {
  return {
    pc: hex(lastPc),
    mode: lastMode,
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
    mbase: hexByte(cpu.mbase),
  };
}

function installAccessTracer(cpu, accessLog) {
  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function record(kind, addr, size, value) {
    const normalizedAddr = addr & 0xffffff;
    accessLog.push({
      index: accessLog.length + 1,
      pc: hex(cpu._currentBlockPc ?? 0),
      kind,
      addr: hex(normalizedAddr),
      addrValue: normalizedAddr,
      size,
      value: hexSized(value, size),
      droppedRomWrite: kind.startsWith('write') && normalizedAddr < 0x400000,
    });
  }

  cpu.read8 = (addr) => {
    const value = originals.read8(addr);
    record('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originals.read16(addr);
    record('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originals.read24(addr);
    record('read24', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    record('write8', addr, 1, value);
    return originals.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record('write16', addr, 2, value);
    return originals.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record('write24', addr, 3, value);
    return originals.write24(addr, value);
  };

  return () => {
    cpu.read8 = originals.read8;
    cpu.read16 = originals.read16;
    cpu.read24 = originals.read24;
    cpu.write8 = originals.write8;
    cpu.write16 = originals.write16;
    cpu.write24 = originals.write24;
  };
}

function summarizeAccesses(accessLog) {
  const touched = new Map();
  let readCount = 0;
  let writeCount = 0;

  for (const access of accessLog) {
    const entry = touched.get(access.addrValue) ?? {
      addr: access.addr,
      addrValue: access.addrValue,
      reads: 0,
      writes: 0,
      lastReadValue: null,
      lastWriteValue: null,
    };

    if (access.kind.startsWith('read')) {
      entry.reads += 1;
      entry.lastReadValue = access.value;
      readCount += 1;
    } else {
      entry.writes += 1;
      entry.lastWriteValue = access.value;
      writeCount += 1;
    }

    touched.set(access.addrValue, entry);
  }

  return {
    totalAccesses: accessLog.length,
    readCount,
    writeCount,
    touchedAddresses: [...touched.values()].sort((left, right) => left.addrValue - right.addrValue),
  };
}

function countVisits(blockTrace) {
  const counts = new Map();

  for (const event of blockTrace) {
    if (event.missing) continue;
    counts.set(event.addrValue, (counts.get(event.addrValue) ?? 0) + 1);
  }

  return counts;
}

function countsToObject(counts, addrs) {
  return Object.fromEntries(addrs.map((addr) => [hex(addr), counts.get(addr) ?? 0]));
}

function inferDispatcherBranch(visitCounts) {
  if ((visitCounts.get(PATH_NONZERO) ?? 0) > 0) return '0x06129C non-zero-nibble path';
  if ((visitCounts.get(PATH_ZERO) ?? 0) > 0) return '0x0612B6 zero-nibble path';
  return 'unknown';
}

function diagnoseIncompleteScenario(result) {
  if (result.set4Completed) {
    return 'Reached the SET 4 block.';
  }

  if (result.dispatcherBranch === '0x0612B6 zero-nibble path') {
    return '0x061294 took JR Z -> 0x0612B6 because 0xD02575 & 0x0F evaluated to 0, so the SET 4 path at 0x0612B0 was never selected.';
  }

  if ((result.visitCounts[hex(SUBCALL_06C737)] ?? 0) > 0 && (result.visitCounts[hex(HELPER_061234)] ?? 0) === 0) {
    return '0x06C737 was visited, but execution never resumed far enough to enter 0x061234.';
  }

  if ((result.visitCounts[hex(HELPER_061234)] ?? 0) > 0 && !result.set4SiteVisited) {
    return '0x061234 (or one of its descendants) did not return to 0x0612B0 before the dispatcher unwound.';
  }

  if ((result.visitCounts[hex(SUBCALL_0605A4)] ?? 0) > 0 && (result.visitCounts[hex(SUBCALL_06C737)] ?? 0) === 0) {
    return '0x0605A4 was entered, but control never reached 0x06C737 afterward.';
  }

  if (result.lastNonMissingBlock) {
    return `Execution stopped before 0x0612B0; last non-missing block was ${result.lastNonMissingBlock.pc} (${result.lastNonMissingBlock.summary}).`;
  }

  return 'Execution stopped before 0x0612B0.';
}

function runDispatcherScenario(baselineMemory, scenario) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem, scenario.stackTop ?? DEFAULT_STACK_TOP);
  cpu.a = TRACE_A;
  mem[IY_PLUS_18] |= 0x80;
  write24(mem, EDIT_CURSOR, EDIT_BUFFER_START);
  scenario.apply?.(cpu, mem);

  const initialState = stateSnapshot(cpu, mem);
  const initialIyPlus5Value = mem[IY_PLUS_5] & 0xff;
  push24(cpu, mem, TRACE_RET_SENTINEL);

  const blockTrace = [];
  const missingBlocks = [];
  let result = null;
  let termination = 'max_steps';
  let stopDetail = null;
  let errorMessage = null;

  try {
    result = executor.runFrom(DISPATCHER_ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        blockTrace.push({
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          addrValue: pc & 0xffffff,
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          sp: hex(cpu.sp),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          d02575: hexByte(mem[D02575_ADDR]),
          editCursor: hex(read24(mem, EDIT_CURSOR)),
          missing: false,
          summary: summarizeBlock(meta),
        });
      },
      onMissingBlock(pc, mode, step) {
        const event = {
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          addrValue: pc & 0xffffff,
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          sp: hex(cpu.sp),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          d02575: hexByte(mem[D02575_ADDR]),
          editCursor: hex(read24(mem, EDIT_CURSOR)),
          missing: true,
          summary: '(missing block)',
        };
        blockTrace.push(event);
        missingBlocks.push(event);
        if ((pc & 0xffffff) === TRACE_RET_SENTINEL) {
          throw makeStop('returned_to_sentinel', hex(pc));
        }
      },
    });

    termination = result?.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE216_STOP__') {
      termination = error.stopName;
      stopDetail = error.detail ?? null;
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const finalState = stateSnapshot(cpu, mem);
  const finalIyPlus5Value = mem[IY_PLUS_5] & 0xff;
  const visitCounts = countVisits(blockTrace);
  const set4SiteVisited = (visitCounts.get(SET4_PC) ?? 0) > 0 || (visitCounts.get(ALT_SET4_PC) ?? 0) > 0;
  const bit4Transitioned = (initialIyPlus5Value & 0x10) === 0 && (finalIyPlus5Value & 0x10) !== 0;
  const set4Completed = set4SiteVisited || bit4Transitioned;
  const lastNonMissingBlock = [...blockTrace].reverse().find((event) => !event.missing) ?? null;
  const lastPc = result?.lastPc ?? lastNonMissingBlock?.addrValue ?? TRACE_RET_SENTINEL;
  const lastMode = result?.lastMode ?? lastNonMissingBlock?.mode ?? 'adl';
  const scenarioResult = {
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    entryPc: hex(DISPATCHER_ENTRY),
    returnSentinel: hex(TRACE_RET_SENTINEL),
    initialState,
    finalState,
    finalRegisters: registerSnapshot(cpu, lastPc, lastMode),
    stepsTaken: Math.max(result?.steps ?? 0, blockTrace.length),
    termination,
    stopDetail,
    errorMessage,
    uniqueBlocksVisited: [...new Set(blockTrace.filter((event) => !event.missing).map((event) => event.pc))],
    missingBlocks: missingBlocks.map((event) => event.pc),
    dispatcherBranch: inferDispatcherBranch(visitCounts),
    set4SiteVisited,
    set4Completed,
    set4Evidence: set4SiteVisited
      ? 'Visited the SET 4 block directly.'
      : bit4Transitioned
        ? 'IY+5 transitioned from bit-4 clear to bit-4 set.'
        : 'No SET 4 block visit or bit-4 transition was observed.',
    visitCounts: countsToObject(visitCounts, INTERESTING_DISPATCHER_ADDRS),
    visitedSubcalls: countsToObject(
      visitCounts,
      DISPATCHER_SUBCALLS.map((item) => item.addr),
    ),
    lastNonMissingBlock,
    blockTrace,
  };

  scenarioResult.blocker = diagnoseIncompleteScenario(scenarioResult);
  return scenarioResult;
}

function runSubcallTrace(baselineMemory, subcall, index) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);
  const returnSentinel = (SUBCALL_RET_SENTINEL_BASE + index) & 0xffffff;

  resetOsState(cpu, mem, DEFAULT_STACK_TOP);
  cpu.a = TRACE_A;
  write24(mem, EDIT_CURSOR, EDIT_BUFFER_START);
  push24(cpu, mem, returnSentinel);

  const initialState = stateSnapshot(cpu, mem);
  const blockTrace = [];
  const accessLog = [];
  const restoreAccessTracer = installAccessTracer(cpu, accessLog);

  let result = null;
  let termination = 'max_steps';
  let stopDetail = null;
  let errorMessage = null;

  try {
    result = executor.runFrom(subcall.addr, 'adl', {
      maxSteps: SUBCALL_TRACE_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        blockTrace.push({
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          addrValue: pc & 0xffffff,
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          sp: hex(cpu.sp),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          editCursor: hex(read24(mem, EDIT_CURSOR)),
          missing: false,
          summary: summarizeBlock(meta),
        });
      },
      onMissingBlock(pc, mode, step) {
        const event = {
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          addrValue: pc & 0xffffff,
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          sp: hex(cpu.sp),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          editCursor: hex(read24(mem, EDIT_CURSOR)),
          missing: true,
          summary: '(missing block)',
        };
        blockTrace.push(event);
        if ((pc & 0xffffff) === returnSentinel) {
          throw makeStop('returned_to_sentinel', hex(pc));
        }
      },
    });

    termination = result?.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE216_STOP__') {
      termination = error.stopName;
      stopDetail = error.detail ?? null;
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  } finally {
    restoreAccessTracer();
  }

  const visitCounts = countVisits(blockTrace);
  const lastNonMissingBlock = [...blockTrace].reverse().find((event) => !event.missing) ?? null;
  const lastPc = result?.lastPc ?? lastNonMissingBlock?.addrValue ?? returnSentinel;
  const lastMode = result?.lastMode ?? lastNonMissingBlock?.mode ?? 'adl';

  return {
    label: subcall.label,
    entryPc: hex(subcall.addr),
    description: `Direct 200-step trace from ${subcall.label} with editCursor seeded to ${hex(EDIT_BUFFER_START)}.`,
    returnSentinel: hex(returnSentinel),
    initialState,
    finalState: stateSnapshot(cpu, mem),
    finalRegisters: registerSnapshot(cpu, lastPc, lastMode),
    termination,
    stopDetail,
    errorMessage,
    stepsTaken: Math.max(result?.steps ?? 0, blockTrace.length),
    uniqueBlocksVisited: [...new Set(blockTrace.filter((event) => !event.missing).map((event) => event.pc))],
    visitCounts: countsToObject(visitCounts, INTERESTING_DISPATCHER_ADDRS),
    blockTrace,
    memoryAccessSummary: summarizeAccesses(accessLog),
    memoryAccesses: accessLog,
  };
}

function buildComparison(partA, partB, partC) {
  const parts = [partA, partB, partC];
  const completionParts = parts.filter((part) => part.set4Completed).map((part) => part.id);
  let conclusion = '';

  if (partA.set4Completed) {
    conclusion =
      `Part A already reached ${hex(SET4_PC)} with only editCursor seeded; later context in Parts B/C does not appear necessary for the dispatcher itself.`;
  } else if (partB.set4Completed) {
    conclusion =
      `Seeding editCursor alone was not enough. Adding editTail, a clean 16-byte edit buffer, and an explicitly cleared ${hex(IY_PLUS_5)} in Part B enabled the SET 4 path.`;
  } else if (partC.set4Completed) {
    conclusion =
      `Parts A and B still failed. The extra home-screen flag and stack context from Part C was the first setup that allowed the dispatcher to complete the SET 4 path.`;
  } else {
    conclusion =
      `None of Parts A, B, or C reached ${hex(SET4_PC)}. The failure mode should be diagnosed from the per-part blocker summaries and the individual sub-call traces.`;
  }

  return {
    completionParts,
    conclusion,
    partSummaries: parts.map((part) => ({
      id: part.id,
      label: part.label,
      set4Completed: part.set4Completed,
      set4Evidence: part.set4Evidence,
      dispatcherBranch: part.dispatcherBranch,
      stepsTaken: part.stepsTaken,
      termination: part.termination,
      finalIyPlus5: part.finalState.iyPlus5,
      d02575LowNibble: part.initialState.d02575LowNibble,
      blocker: part.blocker,
    })),
  };
}

function main() {
  const baseline = createBaseline();

  const partA = runDispatcherScenario(baseline.memory, {
    id: 'partA',
    label: 'Part A',
    description:
      'Dispatcher trace from 0x061290 with A=0x03, BIT 7 at (IY+0x18) forced set, and editCursor seeded to 0xD00A00.',
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUFFER_START);
    },
  });

  const partB = runDispatcherScenario(baseline.memory, {
    id: 'partB',
    label: 'Part B',
    description:
      'Part A plus editTail seeded to 0xD00A00, a zeroed 16-byte edit buffer, and (IY+5) cleared before entry.',
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUFFER_START);
      write24(mem, EDIT_TAIL, EDIT_BUFFER_START);
      mem.fill(0x00, EDIT_BUFFER_START, EDIT_BUFFER_START + 16);
      mem[IY_PLUS_5] = 0x00;
    },
  });

  const partC = runDispatcherScenario(baseline.memory, {
    id: 'partC',
    label: 'Part C',
    description:
      'Part B plus home-screen flag cleanup: IY+12 bit 7 clear, IY+9 clear, IY+0x44 bit 5 clear, and SP seeded to 0xD1A860.',
    stackTop: HOME_STACK_TOP,
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUFFER_START);
      write24(mem, EDIT_TAIL, EDIT_BUFFER_START);
      mem.fill(0x00, EDIT_BUFFER_START, EDIT_BUFFER_START + 16);
      mem[IY_PLUS_5] = 0x00;
      mem[IY_PLUS_12] &= ~0x80;
      mem[IY_PLUS_9] = 0x00;
      mem[IY_PLUS_44] &= ~0x20;
    },
  });

  const partD = DISPATCHER_SUBCALLS.map((subcall, index) => runSubcallTrace(baseline.memory, subcall, index));
  const comparison = buildComparison(partA, partB, partC);

  const report = {
    probe: 'probe-phase216-dispatcher-cursor-seeded.mjs',
    generatedAt: new Date().toISOString(),
    notes: [
      'This probe reuses the same post-boot baseline as phase 215: 0x000000 -> 0x08C331 -> 0x0802B2 -> 0x09DEE0.',
      'Parts A/B/C start directly at 0x061290 with A=0x03 and a synthetic return sentinel on the stack.',
      'Part D seeds only editCursor as requested; it does not apply the extra Part B/C context unless the sub-call itself reads it from the baseline snapshot.',
    ],
    bootBaseline: {
      recipe: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
      boot: baseline.boot,
      memInit: baseline.memInit,
      pointersAfterMemInit: {
        editTop: hex(read24(baseline.memory, EDIT_TOP)),
        editCursor: hex(read24(baseline.memory, EDIT_CURSOR)),
        editTail: hex(read24(baseline.memory, EDIT_TAIL)),
        editBottom: hex(read24(baseline.memory, EDIT_BOTTOM)),
      },
    },
    partA,
    partB,
    partC,
    partD,
    comparison,
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase216-dispatcher-cursor-seeded.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
