#!/usr/bin/env node
/**
 * probe-phase191-stat-extended.mjs
 *
 * Boot the runtime, run MemInit, then trace the two STAT context entries that
 * previously stalled on a missing block or had no transpiled entry block.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TARGET_BLOCK = 0x092263;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CONTEXT_ENTRY_MAX_STEPS = 1000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const RAM_WATCH_START = 0xD00000;
const RAM_WATCH_END = 0xD01000;

const ENTRY_CONFIGS = [
  { contextIndex: 4, name: 'context-entry-4', entryAddr: 0x058BA9 },
  { contextIndex: 5, name: 'context-entry-5', entryAddr: 0x058C01 },
];

const TRACE_STOP = '__PHASE191_TRACE_STOP__';

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
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

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
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
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
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
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
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
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function instructionLabel(pc) {
  if (pc < 0 || pc >= romBytes.length) return 'out-of-rom';
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    return inst.dasm ?? inst.tag ?? 'decode-failed';
  } catch {
    return 'decode-failed';
  }
}

function diffRamWrites(mem, ramBefore) {
  const ramWrites = [];
  for (let addr = RAM_WATCH_START; addr < RAM_WATCH_END; addr++) {
    const before = ramBefore[addr - RAM_WATCH_START];
    const after = mem[addr];
    if (before !== after) {
      ramWrites.push({
        addr: hex(addr),
        before: hex(before, 2),
        after: hex(after, 2),
      });
    }
  }
  return ramWrites;
}

function recordUniqueVisit(uniqueVisits, seenPcs, pc, kind) {
  const norm = pc & 0xFFFFFF;
  if (seenPcs.has(norm)) return;
  seenPcs.add(norm);
  uniqueVisits.push({
    pc: norm,
    pcHex: hex(norm),
    kind,
    instruction: instructionLabel(norm),
  });
}

function summarizeAfterTarget(uniqueVisits, targetIndex) {
  if (targetIndex < 0) return [];
  return uniqueVisits.slice(targetIndex + 1).map((visit) => ({
    pc: visit.pcHex,
    kind: visit.kind,
    instruction: visit.instruction,
  }));
}

function runContextEntryTrace(executor, cpu, mem, entryConfig) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const ramBefore = new Uint8Array(RAM_WATCH_END - RAM_WATCH_START);
  ramBefore.set(mem.subarray(RAM_WATCH_START, RAM_WATCH_END));

  const uniqueVisits = [];
  const seenPcs = new Set();
  let totalSteps = 0;
  let currentPc = entryConfig.entryAddr & 0xFFFFFF;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let firstMissingBlock = null;

  while (totalSteps < CONTEXT_ENTRY_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, CONTEXT_ENTRY_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          recordUniqueVisit(uniqueVisits, seenPcs, norm, 'block');
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          recordUniqueVisit(uniqueVisits, seenPcs, norm, 'missing');
          firstMissingBlock ??= norm;
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= CONTEXT_ENTRY_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  const targetIndex = uniqueVisits.findIndex((visit) => visit.pc === TARGET_BLOCK);
  const ramWrites = diffRamWrites(mem, ramBefore);

  return {
    contextIndex: entryConfig.contextIndex,
    name: entryConfig.name,
    entryAddr: hex(entryConfig.entryAddr),
    steps: totalSteps,
    termination,
    hit,
    firstMissingBlock: firstMissingBlock === null ? null : hex(firstMissingBlock),
    targetReached: targetIndex >= 0,
    targetVisitIndex: targetIndex,
    targetInstruction: targetIndex >= 0 ? uniqueVisits[targetIndex].instruction : null,
    afterTarget: summarizeAfterTarget(uniqueVisits, targetIndex),
    uniqueVisitedCount: uniqueVisits.length,
    uniqueVisited: uniqueVisits.map((visit) => ({
      pc: visit.pcHex,
      kind: visit.kind,
      instruction: visit.instruction,
    })),
    cpuAtExit: snapshotCpu(cpu),
    ramWriteCount: ramWrites.length,
    ramWrites,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function printEntrySummary(result) {
  console.log(`[${result.name}] ${result.entryAddr}`);
  console.log(`  steps=${result.steps} termination=${result.termination} hit=${result.hit ?? 'none'}`);
  console.log(`  uniqueVisited=${result.uniqueVisitedCount} firstMissing=${result.firstMissingBlock ?? 'none'}`);
  console.log(`  target ${hex(TARGET_BLOCK)} reached=${result.targetReached}`);
  if (result.targetReached) {
    const after = result.afterTarget.length === 0
      ? 'none'
      : result.afterTarget.map((visit) => `${visit.pc} (${visit.kind}) ${visit.instruction}`).join(' -> ');
    console.log(`  after target: ${after}`);
  }
  console.log(`  RAM writes=${result.ramWriteCount}`);
  console.log(`  unique PCs: ${result.uniqueVisited.map((visit) => `${visit.pc}${visit.kind === 'missing' ? ' [missing]' : ''}`).join(', ')}`);
  if (result.errorMessage) {
    console.log(`  error=${result.errorMessage}`);
  }
}

function main() {
  const output = {
    targetBlock: hex(TARGET_BLOCK),
    maxStepsPerEntry: CONTEXT_ENTRY_MAX_STEPS,
    entries: [],
  };

  console.log('=== Phase 191: extended STAT context probe ===\n');

  for (const entryConfig of ENTRY_CONFIGS) {
    const runtime = createRuntime();
    const bootInfo = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
    const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);

    const entryOutput = {
      contextIndex: entryConfig.contextIndex,
      name: entryConfig.name,
      entryAddr: hex(entryConfig.entryAddr),
      boot: bootInfo,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
        errorMessage: memInit.errorMessage ? memInit.errorMessage.split('\n')[0] : null,
      },
    };

    if (memInit.hit !== 'ret') {
      entryOutput.error = 'memInit failed';
      output.entries.push(entryOutput);
      console.log(`[${entryConfig.name}] MemInit failed, skipping trace.`);
      continue;
    }

    const traceResult = runContextEntryTrace(runtime.executor, runtime.cpu, runtime.mem, entryConfig);
    Object.assign(entryOutput, traceResult);
    output.entries.push(entryOutput);
    printEntrySummary(traceResult);
    console.log('');
  }

  console.log('=== FULL OUTPUT JSON ===');
  console.log(JSON.stringify(output, null, 2));
}

main();
