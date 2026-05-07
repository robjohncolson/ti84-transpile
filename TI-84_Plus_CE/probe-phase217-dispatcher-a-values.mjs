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

const PARENT_ENTRY = 0x06003c;
const PARENT_AFTER_BIT7 = 0x060048;
const DISPATCHER_ENTRY = 0x061290;
const PATH_NONZERO = 0x06129c;
const PATH_ZERO = 0x0612b6;
const SET4_PC = 0x0612b0;
const ALT_SET4_PC = 0x0612e4;

const TEST_A_VALUES = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x1e];
const D02575_ADDR = 0xd02575;
const PASS2_A_VALUES = [0x03, 0x04];
const PASS2_D02575_VALUES = [0x01, 0x02, 0x03, 0x05, 0x0f];

const TRACE_MAX_STEPS = 200;
const MAX_LOOP_ITERATIONS = 8192;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

const DEFAULT_STACK_TOP = 0xd1a87e;
const IX_ADDR = 0xd1a860;
const IY_ADDR = 0xd00080;
const MBASE = 0xd0;

const IY_PLUS_5 = IY_ADDR + 0x05;
const IY_PLUS_18 = IY_ADDR + 0x18;

const EDIT_CURSOR = 0xd0243a;
const EDIT_TAIL = 0xd0243d;
const EDIT_CURSOR_SEED = 0xd00a00;
const EDIT_TAIL_SEED = 0xd00b00;

const TRACE_RET_SENTINEL = 0x7ffffe;

const INTERESTING_ADDRS = [
  PARENT_ENTRY,
  PARENT_AFTER_BIT7,
  DISPATCHER_ENTRY,
  PATH_NONZERO,
  PATH_ZERO,
  SET4_PC,
  ALT_SET4_PC,
];

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

function makeStop(name, detail = null) {
  const error = new Error('__PHASE217_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
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
    if (error?.message === '__PHASE217_STOP__' && error.stopName === 'mem_init_return') {
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

function findBlocksReferencingPc(pc) {
  const hits = [];

  for (const block of Object.values(BLOCKS)) {
    if (!Array.isArray(block?.instructions)) continue;
    if (!block.instructions.some((instruction) => instruction.pc === pc)) continue;
    hits.push(block);
  }

  hits.sort((left, right) => left.startPc - right.startPc);
  return hits;
}

function chooseContainingBlock(pc) {
  const blocks = findBlocksReferencingPc(pc);
  return blocks.find((block) => block.startPc <= pc) ?? null;
}

function resolveTraceEntry() {
  if (BLOCKS[blockKey(PARENT_AFTER_BIT7, 'adl')]) {
    return {
      requestedEntryPc: hex(PARENT_AFTER_BIT7),
      resolvedEntryPc: PARENT_AFTER_BIT7,
      reason: `Direct lifted block exists at ${hex(PARENT_AFTER_BIT7)}.`,
    };
  }

  if (BLOCKS[blockKey(PARENT_ENTRY, 'adl')]) {
    return {
      requestedEntryPc: hex(PARENT_ENTRY),
      resolvedEntryPc: PARENT_ENTRY,
      reason: `Direct lifted block exists at ${hex(PARENT_ENTRY)}.`,
    };
  }

  const containing = chooseContainingBlock(PARENT_AFTER_BIT7) ?? chooseContainingBlock(PARENT_ENTRY);
  if (containing) {
    return {
      requestedEntryPc: hex(PARENT_AFTER_BIT7),
      resolvedEntryPc: containing.startPc,
      reason:
        `${hex(PARENT_AFTER_BIT7)} is inside lifted block ${hex(containing.startPc)}; ` +
        'starting there keeps the parent-side control flow intact before the dispatcher.',
    };
  }

  return {
    requestedEntryPc: hex(PARENT_AFTER_BIT7),
    resolvedEntryPc: PARENT_AFTER_BIT7,
    reason: `Fallback to ${hex(PARENT_AFTER_BIT7)}; no containing lifted block was found in metadata.`,
  };
}

function stateSnapshot(cpu, mem) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    sp: hex(cpu.sp),
    iy: hex(cpu.iy),
    ix: hex(cpu.ix),
    iyPlus5: hexByte(mem[IY_PLUS_5]),
    iyPlus18: hexByte(mem[IY_PLUS_18]),
    editCursor: hex(read24(mem, EDIT_CURSOR)),
    editTail: hex(read24(mem, EDIT_TAIL)),
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

function interestingVisitStepsFrom(firstVisitSteps) {
  return {
    [hex(PARENT_ENTRY)]: firstVisitSteps.get(PARENT_ENTRY) ?? null,
    [hex(PARENT_AFTER_BIT7)]: firstVisitSteps.get(PARENT_AFTER_BIT7) ?? null,
    [hex(DISPATCHER_ENTRY)]: firstVisitSteps.get(DISPATCHER_ENTRY) ?? null,
    [hex(PATH_NONZERO)]: firstVisitSteps.get(PATH_NONZERO) ?? null,
    [hex(PATH_ZERO)]: firstVisitSteps.get(PATH_ZERO) ?? null,
    [hex(SET4_PC)]: firstVisitSteps.get(SET4_PC) ?? null,
    [hex(ALT_SET4_PC)]: firstVisitSteps.get(ALT_SET4_PC) ?? null,
  };
}

function runScenario(baselineMemory, entryInfo, aValue) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem, DEFAULT_STACK_TOP);
  cpu.a = aValue;
  mem[IY_PLUS_18] |= 0x80;
  write24(mem, EDIT_CURSOR, EDIT_CURSOR_SEED);
  write24(mem, EDIT_TAIL, EDIT_TAIL_SEED);

  const initialState = stateSnapshot(cpu, mem);
  const initialIyPlus5Value = mem[IY_PLUS_5] & 0xff;

  push24(cpu, mem, TRACE_RET_SENTINEL);

  const blockTrace = [];
  const uniqueBlockKeys = new Set();
  const uniqueBlocksVisited = [];
  const firstVisitSteps = new Map();

  let result = null;
  let termination = 'max_steps';
  let stopDetail = null;
  let errorMessage = null;

  function recordEvent(pc, mode, meta, step, missing) {
    const traceStep = (step ?? blockTrace.length) + 1;
    const addrValue = pc & 0xffffff;
    const pcHex = hex(pc);

    blockTrace.push({
      step: traceStep,
      pc: pcHex,
      mode,
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      sp: hex(cpu.sp),
      iyPlus5: hexByte(mem[IY_PLUS_5]),
      editCursor: hex(read24(mem, EDIT_CURSOR)),
      editTail: hex(read24(mem, EDIT_TAIL)),
      missing,
      summary: missing ? '(missing block)' : summarizeBlock(meta),
      addrValue,
    });

    if (!missing) {
      const uniqueKey = `${pcHex}:${mode}`;
      if (!uniqueBlockKeys.has(uniqueKey)) {
        uniqueBlockKeys.add(uniqueKey);
        uniqueBlocksVisited.push(pcHex);
      }
      if (!firstVisitSteps.has(addrValue)) {
        firstVisitSteps.set(addrValue, traceStep);
      }
    }
  }

  try {
    result = executor.runFrom(entryInfo.resolvedEntryPc, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        recordEvent(pc, mode, meta, step, false);
      },
      onMissingBlock(pc, mode, step) {
        if ((pc & 0xffffff) === TRACE_RET_SENTINEL) {
          throw makeStop('returned_to_sentinel', hex(pc));
        }
        recordEvent(pc, mode, null, step, true);
      },
    });

    termination = result?.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE217_STOP__') {
      termination = error.stopName;
      stopDetail = error.detail ?? null;
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const visitCounts = countVisits(blockTrace);
  const finalState = stateSnapshot(cpu, mem);
  const finalIyPlus5Value = mem[IY_PLUS_5] & 0xff;
  const visited0612B0 = (visitCounts.get(SET4_PC) ?? 0) > 0;
  const visited0612E4 = (visitCounts.get(ALT_SET4_PC) ?? 0) > 0;
  const bit4Initial = (initialIyPlus5Value & 0x10) !== 0;
  const bit4Final = (finalIyPlus5Value & 0x10) !== 0;
  const bit4BecameSet = !bit4Initial && bit4Final;
  const reachesSet4 = visited0612B0 || visited0612E4 || bit4BecameSet;
  const lastNonMissingBlock = [...blockTrace].reverse().find((event) => !event.missing) ?? null;
  const lastPc = result?.lastPc ?? lastNonMissingBlock?.addrValue ?? TRACE_RET_SENTINEL;
  const lastMode = result?.lastMode ?? lastNonMissingBlock?.mode ?? 'adl';

  let set4Evidence = 'No SET 4 evidence observed.';
  if (visited0612B0 && visited0612E4) {
    set4Evidence = `Visited both ${hex(SET4_PC)} and ${hex(ALT_SET4_PC)}.`;
  } else if (visited0612B0) {
    set4Evidence = `Visited ${hex(SET4_PC)} directly.`;
  } else if (visited0612E4) {
    set4Evidence = `Visited ${hex(ALT_SET4_PC)} directly.`;
  } else if (bit4BecameSet) {
    set4Evidence = 'BIT 4 at (IY+5) transitioned from clear to set without a separate lifted SET 4 site visit.';
  }

  return {
    aHex: hexByte(aValue),
    aValue,
    requestedEntryPc: entryInfo.requestedEntryPc,
    resolvedEntryPc: hex(entryInfo.resolvedEntryPc),
    entryReason: entryInfo.reason,
    stepsTaken: Math.max(result?.steps ?? 0, blockTrace.length),
    termination,
    stopDetail,
    errorMessage,
    initialState,
    finalState,
    finalRegisters: registerSnapshot(cpu, lastPc, lastMode),
    iyPlus5Changed: initialIyPlus5Value !== finalIyPlus5Value,
    bit4Initial,
    bit4Final,
    bit4BecameSet,
    dispatcherVisited: (visitCounts.get(DISPATCHER_ENTRY) ?? 0) > 0,
    visited06129C: (visitCounts.get(PATH_NONZERO) ?? 0) > 0,
    visited0612B6: (visitCounts.get(PATH_ZERO) ?? 0) > 0,
    visited0612B0,
    visited0612E4,
    reachesSet4,
    set4Evidence,
    uniqueBlockCount: uniqueBlocksVisited.length,
    uniqueBlocksVisited,
    interestingVisitSteps: interestingVisitStepsFrom(firstVisitSteps),
    interestingVisitCounts: countsToObject(visitCounts, INTERESTING_ADDRS),
    lastNonMissingBlock,
    blockTrace,
  };
}

function runScenarioWithD02575(baselineMemory, entryInfo, aValue, d02575Value) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem, DEFAULT_STACK_TOP);
  cpu.a = aValue;
  mem[IY_PLUS_18] |= 0x80;
  write24(mem, EDIT_CURSOR, EDIT_CURSOR_SEED);
  write24(mem, EDIT_TAIL, EDIT_TAIL_SEED);
  mem[IY_PLUS_5] = 0x00;
  mem[D02575_ADDR] = d02575Value;

  const initialIyPlus5Value = mem[IY_PLUS_5] & 0xff;

  push24(cpu, mem, TRACE_RET_SENTINEL);

  const blockTrace = [];

  let result = null;
  let termination = 'max_steps';

  try {
    result = executor.runFrom(entryInfo.resolvedEntryPc, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const addrValue = pc & 0xffffff;
        blockTrace.push({
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          missing: false,
          summary: summarizeBlock(meta),
          addrValue,
        });
      },
      onMissingBlock(pc, mode, step) {
        const addrValue = pc & 0xffffff;
        blockTrace.push({
          step: (step ?? blockTrace.length) + 1,
          pc: hex(pc),
          mode,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          iyPlus5: hexByte(mem[IY_PLUS_5]),
          missing: true,
          summary: '(missing block)',
          addrValue,
        });
        if (addrValue === TRACE_RET_SENTINEL) {
          throw makeStop('returned_to_sentinel', hex(pc));
        }
      },
    });
    termination = result?.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE217_STOP__') {
      termination = error.stopName;
    } else {
      termination = 'exception';
    }
  }

  const visitCounts = countVisits(blockTrace);
  const finalIyPlus5Value = mem[IY_PLUS_5] & 0xff;
  const visited0612B0 = (visitCounts.get(SET4_PC) ?? 0) > 0;
  const visited0612E4 = (visitCounts.get(ALT_SET4_PC) ?? 0) > 0;
  const bit4BecameSet = (initialIyPlus5Value & 0x10) === 0 && (finalIyPlus5Value & 0x10) !== 0;

  return {
    aHex: hexByte(aValue),
    aValue,
    d02575Hex: hexByte(d02575Value),
    d02575Value,
    stepsTaken: Math.max(result?.steps ?? 0, blockTrace.length),
    termination,
    finalIyPlus5: hexByte(finalIyPlus5Value),
    bit4BecameSet,
    visited0612B0,
    visited0612E4,
    reachesSet4: visited0612B0 || visited0612E4 || bit4BecameSet,
    interestingVisitCounts: countsToObject(visitCounts, INTERESTING_ADDRS),
    blockTrace,
  };
}

function buildSummary(results) {
  const reachedSet4 = results.filter((result) => result.reachesSet4).map((result) => result.aHex);
  const visitedB0 = results.filter((result) => result.visited0612B0).map((result) => result.aHex);
  const visitedE4 = results.filter((result) => result.visited0612E4).map((result) => result.aHex);
  const bit4Only = results
    .filter((result) => !result.visited0612B0 && !result.visited0612E4 && result.bit4BecameSet)
    .map((result) => result.aHex);

  let conclusion = 'No tested A value reached either lifted SET 4 site.';
  if (reachedSet4.length > 0) {
    conclusion =
      `SET 4 was reached for A=${reachedSet4.join(', ')}. ` +
      `Direct ${hex(SET4_PC)} visits: ${visitedB0.length ? visitedB0.join(', ') : 'none'}. ` +
      `Direct ${hex(ALT_SET4_PC)} visits: ${visitedE4.length ? visitedE4.join(', ') : 'none'}.`;
  }

  if (bit4Only.length > 0) {
    conclusion += ` BIT 4 also became set without a direct lifted site hit for A=${bit4Only.join(', ')}.`;
  }

  return {
    reachedSet4,
    visited0612B0: visitedB0,
    visited0612E4: visitedE4,
    bit4TransitionWithoutDirectSite: bit4Only,
    conclusion,
  };
}

function main() {
  const baseline = createBaseline();
  const entryInfo = resolveTraceEntry();

  // Pass 1: Default D02575 from baseline, sweep A values
  const pass1Results = TEST_A_VALUES.map((aValue) => runScenario(baseline.memory, entryInfo, aValue));

  // Pass 2: Seed D02575 with non-zero low nibble for A=0x03 and A=0x04
  // A=0x03 path at 0x061294 checks (D02575 & 0x0F): zero -> 0x0612B6, non-zero -> 0x06129C -> 0x0612B0
  const pass2Results = [];
  for (const aValue of PASS2_A_VALUES) {
    for (const d02575Val of PASS2_D02575_VALUES) {
      pass2Results.push(runScenarioWithD02575(baseline.memory, entryInfo, aValue, d02575Val));
    }
  }

  const pass2Summary = pass2Results.map((r) => ({
    aHex: r.aHex,
    d02575Hex: r.d02575Hex,
    bit4BecameSet: r.bit4BecameSet,
    visited0612B0: r.visited0612B0,
    visited0612E4: r.visited0612E4,
    reachesSet4: r.reachesSet4,
    termination: r.termination,
    steps: r.stepsTaken,
    finalIyPlus5: r.finalIyPlus5,
  }));

  const pass2WinnersB0 = pass2Summary.filter((s) => s.visited0612B0).map((s) => `A=${s.aHex},D02575=${s.d02575Hex}`);
  const pass2WinnersE4 = pass2Summary.filter((s) => s.visited0612E4).map((s) => `A=${s.aHex},D02575=${s.d02575Hex}`);
  const pass2WinnersBit4 = pass2Summary.filter((s) => s.bit4BecameSet).map((s) => `A=${s.aHex},D02575=${s.d02575Hex}`);

  const report = {
    probe: 'probe-phase217-dispatcher-a-values.mjs',
    generatedAt: new Date().toISOString(),
    bootBaseline: {
      recipe: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
      boot: baseline.boot,
      memInit: baseline.memInit,
      pointersAfterMemInit: {
        editCursor: hex(read24(baseline.memory, EDIT_CURSOR)),
        editTail: hex(read24(baseline.memory, EDIT_TAIL)),
      },
    },
    setup: {
      requestedParentEntry: hex(PARENT_ENTRY),
      requestedPostBit7Entry: hex(PARENT_AFTER_BIT7),
      dispatcherEntry: hex(DISPATCHER_ENTRY),
      testAValues: TEST_A_VALUES.map((value) => hexByte(value)),
      forcedIyPlus18Bit7: true,
      seededEditCursor: hex(EDIT_CURSOR_SEED),
      seededEditTail: hex(EDIT_TAIL_SEED),
      observedIyPlus5: hex(IY_PLUS_5),
      maxStepsPerRun: TRACE_MAX_STEPS,
      resolvedEntryPc: hex(entryInfo.resolvedEntryPc),
      entryReason: entryInfo.reason,
    },
    pass1: {
      description: 'Default D02575 from baseline, sweep all A values',
      results: pass1Results,
      summary: buildSummary(pass1Results),
    },
    pass2: {
      description: 'A=0x03 and A=0x04 with D02575 seeded to non-zero low nibble values',
      note: 'A=0x03 path at 0x061294 reads (D02575 & 0x0F): zero -> 0x0612B6 (skips SET 4), non-zero -> 0x06129C -> 0x0612B0 (SET 4 site)',
      summary: pass2Summary,
      conclusion: {
        combosVisiting0x0612B0: pass2WinnersB0,
        combosVisiting0x0612E4: pass2WinnersE4,
        combosThatSetBit4: pass2WinnersBit4,
      },
      results: pass2Results,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase217-dispatcher-a-values.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
