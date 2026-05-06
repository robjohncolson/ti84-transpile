#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const OP1_ADDR = 0xD005F8;
const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 1000;
const EXTRA_STACK_SENTINELS = 8;
const WRITE_EVENT_LIMIT_PER_BLOCK = 16;

const SCREEN_UPDATE_LOOP = 0x0A1B59;
const ROW_INDEX_COMP = 0x0A29D6;
const D00595_ADDR = 0xD00595;
const D00596_ADDR = 0xD00596;
const D02505_ADDR = 0xD02505;

const STATE_RAM_START = 0xD00590;
const STATE_RAM_END = 0xD005B1;
const GENERAL_RAM_START = 0xD00000;
const GENERAL_RAM_END = 0xD40000;
const STACK_RAM_START = 0xD1A000;
const STACK_RAM_END = 0xD1B000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;
const MMIO_START = 0xE00000;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesToString(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function captureRange(mem, start, end) {
  return Array.from(mem.slice(start, end));
}

function diffByteRanges(before, after, startAddr) {
  const diffs = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      diffs.push({
        addr: hex(startAddr + i),
        offset: i,
        before: hexByte(before[i]),
        after: hexByte(after[i]),
      });
    }
  }
  return diffs;
}

function sortHexAddresses(set) {
  return Array.from(set, (addr) => addr & 0xFFFFFF)
    .sort((a, b) => a - b)
    .map((addr) => hex(addr));
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE199_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
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

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw makeSentinelError(name, normalizedPc);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = 'sentinel';
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
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
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function normalizeStopReason(hit, termination, totalSteps, maxSteps) {
  if (hit === 'ret') return 'sentinel';
  if (termination === 'exception') return 'exception';
  if (termination === 'error') return 'error';
  if (termination === 'missing_block') return 'missing_block';
  if (termination === 'halt') return 'halt';
  if (termination === 'sleep') return 'sleep';
  if (termination === 'no_return') return 'no_return';
  if (totalSteps >= maxSteps || termination === 'max_steps') return 'step_limit';
  return termination ?? 'completed';
}

function installAttributedWriteTracer(cpu, state) {
  const byBlock = new Map();
  let totalWriteOps = 0;
  let totalRamWriteOps = 0;
  let totalVramWriteOps = 0;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function ensureBlockEntry(pc) {
    const normalizedPc = (pc ?? 0) & 0xFFFFFF;
    if (!byBlock.has(normalizedPc)) {
      byBlock.set(normalizedPc, {
        writeCount: 0,
        stateAddrs: new Set(),
        stackAddrs: new Set(),
        otherRamAddrs: new Set(),
        vramAddrs: new Set(),
        mmioAddrs: new Set(),
        otherAddrs: new Set(),
        sampleWrites: [],
      });
    }
    return byBlock.get(normalizedPc);
  }

  function recordWrite(addr, width, value, originalWrite) {
    const normalizedAddr = Number(addr) & 0xFFFFFF;
    const byteAddrs = [];
    for (let i = 0; i < Math.max(1, width | 0); i++) {
      byteAddrs.push((normalizedAddr + i) & 0xFFFFFF);
    }

    const result = originalWrite(normalizedAddr, value);
    if (normalizedAddr < 0x400000) return result;

    totalWriteOps++;
    const entry = ensureBlockEntry(state.currentPc);
    entry.writeCount++;

    const stateBytes = [];
    const stackBytes = [];
    const otherRamBytes = [];
    const vramBytes = [];
    const mmioBytes = [];
    const otherBytes = [];

    for (const byteAddr of byteAddrs) {
      if (byteAddr >= STATE_RAM_START && byteAddr < STATE_RAM_END) {
        entry.stateAddrs.add(byteAddr);
        stateBytes.push(byteAddr);
      } else if (byteAddr >= STACK_RAM_START && byteAddr < STACK_RAM_END) {
        entry.stackAddrs.add(byteAddr);
        stackBytes.push(byteAddr);
      } else if (byteAddr >= GENERAL_RAM_START && byteAddr < GENERAL_RAM_END) {
        entry.otherRamAddrs.add(byteAddr);
        otherRamBytes.push(byteAddr);
      } else if (byteAddr >= VRAM_START && byteAddr < VRAM_END) {
        entry.vramAddrs.add(byteAddr);
        vramBytes.push(byteAddr);
      } else if (byteAddr >= MMIO_START) {
        entry.mmioAddrs.add(byteAddr);
        mmioBytes.push(byteAddr);
      } else {
        entry.otherAddrs.add(byteAddr);
        otherBytes.push(byteAddr);
      }
    }

    if (stateBytes.length || stackBytes.length || otherRamBytes.length) totalRamWriteOps++;
    if (vramBytes.length) totalVramWriteOps++;

    if (entry.sampleWrites.length < WRITE_EVENT_LIMIT_PER_BLOCK) {
      entry.sampleWrites.push({
        step: state.currentStep,
        pc: hex(state.currentPc),
        addr: hex(normalizedAddr),
        width,
        value: hex(value, Math.max(2, width * 2)),
        stateBytes: stateBytes.map((byteAddr) => hex(byteAddr)),
        stackBytes: stackBytes.map((byteAddr) => hex(byteAddr)),
        otherRamBytes: otherRamBytes.map((byteAddr) => hex(byteAddr)),
        vramBytes: vramBytes.map((byteAddr) => hex(byteAddr)),
        mmioBytes: mmioBytes.map((byteAddr) => hex(byteAddr)),
        otherBytes: otherBytes.map((byteAddr) => hex(byteAddr)),
      });
    }

    return result;
  }

  cpu.write8 = (addr, value) => recordWrite(addr, 1, value, originalWrite8);
  cpu.write16 = (addr, value) => recordWrite(addr, 2, value, originalWrite16);
  cpu.write24 = (addr, value) => recordWrite(addr, 3, value, originalWrite24);

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    return { byBlock, totalWriteOps, totalRamWriteOps, totalVramWriteOps };
  };
}

function runLoopEntryExperiment(label, counterValue, executor, cpu, mem, baselineMem) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  cpu._ix = IX_ADDR;
  cpu._iy = IY_ADDR;
  mem[D00595_ADDR] = 0xFF;
  mem[D02505_ADDR] = 0x00;
  mem[D00596_ADDR] = counterValue;

  const stateBefore = captureRange(mem, STATE_RAM_START, STATE_RAM_END);

  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);
  for (let i = 0; i < EXTRA_STACK_SENTINELS; i++) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }

  const blockTrace = [];
  const uniqueBlockOrder = [];
  const uniqueBlockSet = new Set();
  const blockVisitCounts = new Map();
  const blockFirstSeenStep = new Map();
  let rowIndexCompReached = false;
  let totalSteps = 0;
  let currentPc = SCREEN_UPDATE_LOOP;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;

  const traceState = { currentPc: currentPc & 0xFFFFFF, currentStep: 0 };
  const restoreTracer = installAttributedWriteTracer(cpu, traceState);

  function noteBlock(pc, step) {
    const normalizedPc = pc & 0xFFFFFF;
    traceState.currentPc = normalizedPc;
    traceState.currentStep = step;
    blockTrace.push(normalizedPc);
    blockVisitCounts.set(normalizedPc, (blockVisitCounts.get(normalizedPc) || 0) + 1);
    if (!uniqueBlockSet.has(normalizedPc)) {
      uniqueBlockSet.add(normalizedPc);
      uniqueBlockOrder.push(normalizedPc);
      blockFirstSeenStep.set(normalizedPc, step);
    }
    if (normalizedPc === ROW_INDEX_COMP) rowIndexCompReached = true;
    if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
  }

  try {
    while (totalSteps < TRACE_MAX_STEPS && !hit) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
      const stepBase = totalSteps;

      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, _mode, _meta, step) {
            noteBlock(pc, stepBase + (step ?? 0) + 1);
          },
          onMissingBlock(pc, _mode, step) {
            noteBlock(pc, stepBase + (step ?? 0) + 1);
          },
        });
        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        traceState.currentPc = currentPc;
        traceState.currentStep = totalSteps;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        if (error?.isSentinel) {
          hit = error.hit;
          termination = 'sentinel';
          currentPc = error.pc;
          break;
        }
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } finally {
    const tracedWrites = restoreTracer();
    const stateAfter = captureRange(mem, STATE_RAM_START, STATE_RAM_END);
    const result = {
      label,
      counterValue: hex(counterValue, 2),
      steps: totalSteps,
      stopReason: normalizeStopReason(hit, termination, totalSteps, TRACE_MAX_STEPS),
      uniqueBlockCount: uniqueBlockSet.size,
      uniqueBlocks: uniqueBlockOrder.map((pc) => hex(pc)),
      totalBlocksVisited: blockTrace.length,
      first20Blocks: blockTrace.slice(0, 20).map((pc) => hex(pc)),
      rowIndexCompReached,
      totalWriteOps: tracedWrites.totalWriteOps,
      totalRamWriteOps: tracedWrites.totalRamWriteOps,
      totalVramWriteOps: tracedWrites.totalVramWriteOps,
      finalD00596: hex(mem[D00596_ADDR], 2),
      finalPc: hex(currentPc),
      stateArea: {
        range: `${hex(STATE_RAM_START)}-${hex(STATE_RAM_END - 1)}`,
        before: bytesToString(stateBefore),
        after: bytesToString(stateAfter),
        diffCount: diffByteRanges(stateBefore, stateAfter, STATE_RAM_START).length,
        diffs: diffByteRanges(stateBefore, stateAfter, STATE_RAM_START),
      },
      errorMessage,
    };

    Object.defineProperty(result, '__internal', {
      enumerable: false,
      value: {
        uniqueBlockOrder,
        uniqueBlockSet,
        blockVisitCounts,
        blockFirstSeenStep,
        writeInfoByBlock: tracedWrites.byBlock,
      },
    });

    return result;
  }
}

function compactRunSummary(run) {
  return {
    label: run.label,
    counterValue: run.counterValue,
    steps: run.steps,
    stopReason: run.stopReason,
    uniqueBlockCount: run.uniqueBlockCount,
    uniqueBlocks: run.uniqueBlocks,
    totalBlocksVisited: run.totalBlocksVisited,
    first20Blocks: run.first20Blocks,
    finalD00596: run.finalD00596,
    finalPc: run.finalPc,
    totalWriteOps: run.totalWriteOps,
    totalRamWriteOps: run.totalRamWriteOps,
    totalVramWriteOps: run.totalVramWriteOps,
    stateAreaDiffCount: run.stateArea.diffCount,
    errorMessage: run.errorMessage,
  };
}

function compareRunBlockSets(runA, runB) {
  const onlyInA = runA.__internal.uniqueBlockOrder.filter((pc) => !runB.__internal.uniqueBlockSet.has(pc));
  const onlyInB = runB.__internal.uniqueBlockOrder.filter((pc) => !runA.__internal.uniqueBlockSet.has(pc));
  return {
    sameUniqueBlockSet: onlyInA.length === 0 && onlyInB.length === 0,
    onlyInA,
    onlyInB,
  };
}

function formatInstruction(instruction) {
  const item = {
    pc: hex(instruction.pc),
    dasm: instruction.dasm,
    tag: instruction.tag,
  };
  if (instruction.condition) item.condition = instruction.condition;
  if (typeof instruction.target === 'number') item.target = hex(instruction.target);
  if (typeof instruction.fallthrough === 'number') item.fallthrough = hex(instruction.fallthrough);
  return item;
}

function getControlTargets(block) {
  const callTargets = [];
  const jumpTargets = [];
  const branchTargets = [];

  for (const instruction of block?.instructions ?? []) {
    if (typeof instruction.target !== 'number') continue;
    const item = formatInstruction(instruction);
    if (instruction.tag?.startsWith('call') || instruction.tag === 'rst') {
      callTargets.push(item);
    } else if (instruction.tag?.startsWith('jp')) {
      jumpTargets.push(item);
    } else if (instruction.tag?.startsWith('jr') || instruction.tag === 'djnz') {
      branchTargets.push(item);
    }
  }

  return {
    callTargets,
    jumpTargets,
    branchTargets,
    exitSummary: (block?.exits ?? []).map((exit) => ({
      type: exit.type,
      condition: exit.condition ?? null,
      target: typeof exit.target === 'number' ? hex(exit.target) : null,
      targetMode: exit.targetMode ?? null,
    })),
  };
}

function describeExtraBlock(pc, run) {
  const block = BLOCKS[blockKey(pc)];
  const writeInfo = run.__internal.writeInfoByBlock.get(pc) ?? {
    writeCount: 0,
    stateAddrs: new Set(),
    stackAddrs: new Set(),
    otherRamAddrs: new Set(),
    vramAddrs: new Set(),
    mmioAddrs: new Set(),
    otherAddrs: new Set(),
    sampleWrites: [],
  };
  const controlTargets = getControlTargets(block);

  return {
    block: hex(pc),
    key: blockKey(pc),
    firstSeenStep: run.__internal.blockFirstSeenStep.get(pc) ?? null,
    visitCount: run.__internal.blockVisitCounts.get(pc) ?? 0,
    instructionCount: block?.instructionCount ?? 0,
    callTargets: controlTargets.callTargets,
    jumpTargets: controlTargets.jumpTargets,
    branchTargets: controlTargets.branchTargets,
    exitSummary: controlTargets.exitSummary,
    stateWriteAddresses: sortHexAddresses(writeInfo.stateAddrs),
    stackWriteAddresses: sortHexAddresses(writeInfo.stackAddrs),
    otherRamWriteAddresses: sortHexAddresses(writeInfo.otherRamAddrs),
    vramWriteAddresses: sortHexAddresses(writeInfo.vramAddrs),
    mmioWriteAddresses: sortHexAddresses(writeInfo.mmioAddrs),
    otherWriteAddresses: sortHexAddresses(writeInfo.otherAddrs),
    sampleWrites: writeInfo.sampleWrites,
    instructions: (block?.instructions ?? []).map((instruction) => formatInstruction(instruction)),
    transpiledSource: block?.source ?? null,
  };
}

function compareStateDiffs(runA, runB) {
  const byAddrA = new Map(runA.stateArea.diffs.map((diff) => [diff.addr, diff]));
  const byAddrB = new Map(runB.stateArea.diffs.map((diff) => [diff.addr, diff]));

  const onlyInA = runA.stateArea.diffs.filter((diff) => !byAddrB.has(diff.addr));
  const onlyInB = runB.stateArea.diffs.filter((diff) => !byAddrA.has(diff.addr));
  const sameAddressSameAfter = [];
  const sameAddressDifferentAfter = [];

  for (const diff of runA.stateArea.diffs) {
    const other = byAddrB.get(diff.addr);
    if (!other) continue;
    if (other.after === diff.after) {
      sameAddressSameAfter.push({
        addr: diff.addr,
        after: diff.after,
      });
    } else {
      sameAddressDifferentAfter.push({
        addr: diff.addr,
        counterAAfter: diff.after,
        counterBAfter: other.after,
      });
    }
  }

  return { onlyInA, onlyInB, sameAddressSameAfter, sameAddressDifferentAfter };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase199-yeq-init-blocks',
      status: 'aborted',
      reason: 'MemInit did not return',
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
        lastPc: hex(memInit.lastPc),
        errorMessage: memInit.errorMessage,
      },
    }, null, 2));
    return;
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase199-yeq-init-blocks',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
      },
      createReal: {
        hit: createReal.hit,
        steps: createReal.steps,
        termination: createReal.termination,
        lastPc: hex(createReal.lastPc),
        errBase: createReal.errBase,
        errorMessage: createReal.errorMessage,
      },
    }, null, 2));
    return;
  }

  const baselineMem = mem.slice();

  const run19 = runLoopEntryExperiment('counter=0x19', 0x19, executor, cpu, mem, baselineMem);
  const run15 = runLoopEntryExperiment('counter=0x15', 0x15, executor, cpu, mem, baselineMem);
  const run1A = runLoopEntryExperiment('counter=0x1A', 0x1A, executor, cpu, mem, baselineMem);

  const compare19vs15 = compareRunBlockSets(run19, run15);
  const compare1Avs19 = compareRunBlockSets(run1A, run19);
  const compare1Avs15 = compareRunBlockSets(run1A, run15);
  const extraBlocks19 = compare19vs15.onlyInA;
  const extraBlockDetails = extraBlocks19.map((pc) => describeExtraBlock(pc, run19));
  const stateDiffComparison = compareStateDiffs(run19, run15);

  const experimentA = {
    title: 'Identify the extra init-path blocks',
    counter19: compactRunSummary(run19),
    counter15: compactRunSummary(run15),
    extraBlocksOnlyIn0x19: extraBlocks19.map((pc) => hex(pc)),
    extraBlockCount: extraBlocks19.length,
    blocksOnlyIn0x15: compare19vs15.onlyInB.map((pc) => hex(pc)),
    conclusion: extraBlocks19.length === 0
      ? 'No extra blocks were found for counter=0x19 relative to counter=0x15.'
      : 'counter=0x19 reaches an extra block set relative to counter=0x15, consistent with the wrap/init path.',
  };

  const experimentB = {
    title: 'Trace what the extra blocks do',
    extraBlocks: extraBlockDetails,
  };

  const experimentC = {
    title: 'Does counter=0x1A also trigger the init path?',
    counter1A: compactRunSummary(run1A),
    compareTo0x19: {
      sameUniqueBlockSet: compare1Avs19.sameUniqueBlockSet,
      onlyIn0x1A: compare1Avs19.onlyInA.map((pc) => hex(pc)),
      onlyIn0x19: compare1Avs19.onlyInB.map((pc) => hex(pc)),
    },
    compareTo0x15: {
      sameUniqueBlockSet: compare1Avs15.sameUniqueBlockSet,
      onlyIn0x1A: compare1Avs15.onlyInA.map((pc) => hex(pc)),
      onlyIn0x15: compare1Avs15.onlyInB.map((pc) => hex(pc)),
    },
    conclusion: compare1Avs19.sameUniqueBlockSet
      ? 'counter=0x1A matches the 0x19 block set.'
      : (compare1Avs15.sameUniqueBlockSet
        ? 'counter=0x1A matches the 0x15 block set.'
        : 'counter=0x1A produces a third block-set pattern distinct from both 0x19 and 0x15.'),
  };

  const experimentD = {
    title: 'RAM diff for the init path',
    range: `${hex(STATE_RAM_START)}-${hex(STATE_RAM_END - 1)}`,
    counter19: run19.stateArea,
    counter15: run15.stateArea,
    comparison: {
      onlyCounter19Changed: stateDiffComparison.onlyInA,
      onlyCounter15Changed: stateDiffComparison.onlyInB,
      sameAddressSameAfter: stateDiffComparison.sameAddressSameAfter,
      sameAddressDifferentAfter: stateDiffComparison.sameAddressDifferentAfter,
    },
  };

  console.log(JSON.stringify({
    probe: 'phase199-yeq-init-blocks',
    status: 'completed',
    description: 'Compare Y= loop entry behavior at 0x0A1B59 for counters 0x19, 0x15, and 0x1A, then explain the extra init-path blocks and RAM-side effects.',
    setup: {
      memInit: true,
      mbase: hex(MBASE, 2),
      ix: hex(IX_ADDR),
      iy: hex(IY_ADDR),
      timerInterrupt: false,
      traceEntry: hex(SCREEN_UPDATE_LOOP),
      rowCounterAddr: hex(D00596_ADDR),
      attrFlagAddr: hex(D00595_ADDR),
      compareTargetAddr: hex(D02505_ADDR),
      maxSteps: TRACE_MAX_STEPS,
    },
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
    },
    createReal: {
      hit: createReal.hit,
      steps: createReal.steps,
      termination: createReal.termination,
      errBase: createReal.errBase,
    },
    experiments: {
      A: experimentA,
      B: experimentB,
      C: experimentC,
      D: experimentD,
    },
  }, null, 2));
}

main();
