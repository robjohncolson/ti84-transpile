#!/usr/bin/env node

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
const TRACE_RET = 0x7FFFFE;
const BOOT_CRASH_PC = 0x000000;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;
const WRITE_EVENT_LIMIT = 512;

// Y= editor addresses
const YEQ_ENTRY_FULL = 0x09CB14;
const YEQ_ENTRY_LOOP = 0x09CB08;
const ATTR_UPDATER = 0x0A2B72;
const SCREEN_UPDATE = 0x0A1B59;
const D00596_ADDR = 0xD00596;
const D00595_ADDR = 0xD00595;

const RAM_WATCH_START = 0xD00590;
const RAM_WATCH_END = 0xD005B1;  // 0xD00590-0xD005B0 inclusive (32 bytes)

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function bytesToString(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatWriteValue(width, value) {
  return hex(value, Math.max(2, width * 2));
}

function snapshotCpu(cpu, pc = cpu._currentBlockPc ?? 0) {
  return {
    pc: hex(pc),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
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

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE196_SENTINEL__');
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

function overlapRange(addr, width, start, end) {
  const normalizedAddr = addr & 0xFFFFFF;
  const normalizedWidth = Math.max(1, width | 0);
  const overlapStart = Math.max(normalizedAddr, start);
  const overlapEnd = Math.min(normalizedAddr + normalizedWidth, end);
  if (overlapStart >= overlapEnd) return null;
  return {
    start: overlapStart,
    length: overlapEnd - overlapStart,
  };
}

function installWriteWatcher(cpu, mem, state, start, end) {
  const events = [];
  let totalWrites = 0;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordWrite(addr, width, value, originalWrite) {
    const normalizedAddr = Number(addr) & 0xFFFFFF;
    const hit = overlapRange(normalizedAddr, width, start, end);
    const before = hit ? Array.from(mem.slice(hit.start, hit.start + hit.length)) : null;
    const result = originalWrite(normalizedAddr, value);
    if (!hit) return result;

    totalWrites += 1;
    if (events.length < WRITE_EVENT_LIMIT) {
      const after = Array.from(mem.slice(hit.start, hit.start + hit.length));
      events.push({
        step: state.currentStep,
        pc: hex(state.currentPc),
        addr: hex(normalizedAddr),
        width,
        value: formatWriteValue(width, value),
        overlap: `${hex(hit.start)}+${hit.length}`,
        before: bytesToString(before),
        after: bytesToString(after),
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
    return { totalWrites, events };
  };
}

function normalizeTermination(hit, termination, maxStepsReached) {
  if (hit === 'ret') return 'returned';
  if (hit === 'boot') return 'boot_crash';
  if (termination === 'exception') return 'exception';
  if (termination === 'error') return 'error';
  if (termination === 'missing_block') return 'missing_block';
  if (termination === 'halt') return 'halt';
  if (termination === 'sleep') return 'sleep';
  if (termination === 'no_return') return 'no_return';
  if (maxStepsReached || termination === 'max_steps') return 'step_limit';
  return termination ?? 'completed';
}

// ── Experiment A: Static disassembly of 0x0A1B59 (screen update) ──

function runExperimentA() {
  const instructions = [];
  let pc = SCREEN_UPDATE;
  const maxInstructions = 50;

  for (let i = 0; i < maxInstructions; i++) {
    const instr = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(romBytes.slice(pc, pc + instr.length)).map(b => hexByte(b)).join(' ');

    const instrInfo = {
      pc: hex(pc),
      length: instr.length,
      bytes: rawBytes,
      tag: instr.tag,
    };

    // Copy all decoded fields except pc/length/nextPc/mode/modePrefix
    for (const key of Object.keys(instr)) {
      if (!['pc', 'length', 'nextPc', 'mode', 'modePrefix'].includes(key)) {
        instrInfo[key] = instr[key];
      }
    }

    // Flag interesting references
    if (typeof instr.value === 'number') {
      const val = instr.value & 0xFFFFFF;
      if (val >= 0xD00590 && val <= 0xD005B0) {
        instrInfo.note = `References RAM near D00596 range`;
      }
      if (val >= 0xD17000 && val <= 0xD18000) {
        instrInfo.note = `References Y-variable data area`;
      }
    }
    if (typeof instr.addr === 'number') {
      const adr = instr.addr & 0xFFFFFF;
      if (adr >= 0xD00590 && adr <= 0xD005B0) {
        instrInfo.note = `References RAM near D00596 range`;
      }
    }
    if (typeof instr.target === 'number') {
      instrInfo.targetHex = hex(instr.target);
    }

    instructions.push(instrInfo);

    // Stop at RET
    if (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn') {
      break;
    }

    pc = instr.nextPc;
  }

  return {
    experiment: 'A',
    description: 'Static disassembly of screen update subroutine at 0x0A1B59',
    entry: hex(SCREEN_UPDATE),
    instructionCount: instructions.length,
    instructions,
  };
}

// ── Experiment B: RAM snapshot diff between row iterations ──

function runExperimentB(executor, cpu, mem, baselineMem) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);
  mem[D00596_ADDR] = 0x19;  // full 25 iterations
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  // Snapshot BEFORE
  const ramBefore = Array.from(mem.slice(RAM_WATCH_START, RAM_WATCH_START + 32));

  // Run for 100 steps (~1 iteration)
  const MAX_STEPS = 100;
  let totalSteps = 0;
  let currentPc = YEQ_ENTRY_FULL;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;

  try {
    while (totalSteps < MAX_STEPS) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MAX_STEPS - totalSteps);
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      lastPc = currentPc;
      termination = result.termination ?? null;
      if (result.error) errorMessage = result.error?.stack ?? String(result.error);
      if (termination !== 'max_steps') break;
    }
  } catch (error) {
    errorMessage = error?.stack ?? String(error);
    termination = 'exception';
  }

  // Snapshot AFTER
  const ramAfter = Array.from(mem.slice(RAM_WATCH_START, RAM_WATCH_START + 32));

  // Compute diff
  const diffs = [];
  for (let i = 0; i < 32; i++) {
    if (ramBefore[i] !== ramAfter[i]) {
      diffs.push({
        addr: hex(RAM_WATCH_START + i),
        offset: i,
        before: hexByte(ramBefore[i]),
        after: hexByte(ramAfter[i]),
      });
    }
  }

  return {
    experiment: 'B',
    description: 'RAM snapshot diff 0xD00590-0xD005B0 before/after ~100 steps from 0x09CB14',
    entry: hex(YEQ_ENTRY_FULL),
    steps: totalSteps,
    lastPc: hex(lastPc),
    termination: termination ?? 'completed',
    d00596Final: hex(mem[D00596_ADDR], 2),
    ramBefore: bytesToString(ramBefore),
    ramAfter: bytesToString(ramAfter),
    changedCount: diffs.length,
    diffs,
    errorMessage,
  };
}

// ── Experiment C: Trace RAM writes near 0xD00596 during one iteration ──

function runExperimentC(executor, cpu, mem, baselineMem) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);
  mem[D00596_ADDR] = 0x19;
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const MAX_STEPS = 100;
  const state = { currentPc: YEQ_ENTRY_FULL, currentStep: 0 };

  const restoreWatcher = installWriteWatcher(cpu, mem, state, RAM_WATCH_START, RAM_WATCH_END);

  let totalSteps = 0;
  let currentPc = YEQ_ENTRY_FULL;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastObservedStep = 0;

  const noteBlock = (pc, mode, stepBase, stepInSegment) => {
    const normalizedPc = pc & 0xFFFFFF;
    const visitStep = stepBase + (stepInSegment ?? 0) + 1;
    lastObservedStep = Math.max(lastObservedStep, visitStep);
    state.currentPc = normalizedPc;
    state.currentStep = visitStep;
    lastPc = normalizedPc;
  };

  try {
    while (totalSteps < MAX_STEPS) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MAX_STEPS - totalSteps);
      const stepBase = totalSteps;
      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step); },
          onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step); },
        });
        totalSteps += result.steps ?? 0;
        currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
        currentMode = result.lastMode ?? currentMode;
        lastPc = currentPc;
        state.currentPc = currentPc;
        state.currentStep = totalSteps;
        termination = result.termination ?? null;
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        if (termination !== 'max_steps') break;
      } catch (error) {
        totalSteps = Math.max(totalSteps, lastObservedStep);
        errorMessage = error?.stack ?? String(error);
        termination = 'exception';
        break;
      }
    }
  } catch (_) { /* handled above */ }

  const watched = restoreWatcher();

  return {
    experiment: 'C',
    description: 'Trace ALL RAM writes to 0xD00590-0xD005B0 during ~100 steps from 0x09CB14',
    entry: hex(YEQ_ENTRY_FULL),
    steps: totalSteps,
    lastPc: hex(lastPc),
    termination: termination ?? 'completed',
    d00596Final: hex(mem[D00596_ADDR], 2),
    ramWriteCount: watched.totalWrites,
    ramWrites: watched.events,
    errorMessage,
  };
}

// ── Experiment D: 0x0A2B72 attribute updater with non-init counter ──

function runExperimentD(executor, cpu, mem, baselineMem) {
  const testValues = [0x18, 0x17, 0x10, 0x05, 0x01];
  const results = [];

  for (const initValue of testValues) {
    mem.set(baselineMem);
    resetCpuForOsCall(cpu, mem);

    mem[D00596_ADDR] = initValue;
    mem[D00595_ADDR] = 0x00;

    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);

    const state = { currentPc: ATTR_UPDATER, currentStep: 0 };
    const restoreWatcher = installWriteWatcher(cpu, mem, state, RAM_WATCH_START, RAM_WATCH_END);

    let totalSteps = 0;
    let currentPc = ATTR_UPDATER;
    let currentMode = 'adl';
    let termination = null;
    let errorMessage = null;
    let hit = null;
    let lastPc = currentPc;
    let lastMode = currentMode;
    let lastObservedStep = 0;

    const d00596Before = mem[D00596_ADDR];
    const d00595Before = mem[D00595_ADDR];

    // Also snapshot wider RAM to find any equation index
    const wideRamBefore = Array.from(mem.slice(0xD00590, 0xD005B0));

    const noteBlock = (pc, mode, stepBase, stepInSegment) => {
      const normalizedPc = pc & 0xFFFFFF;
      const visitStep = stepBase + (stepInSegment ?? 0) + 1;
      lastObservedStep = Math.max(lastObservedStep, visitStep);
      state.currentPc = normalizedPc;
      state.currentStep = visitStep;
      lastPc = normalizedPc;
      lastMode = mode ?? lastMode;

      if (normalizedPc === TRACE_RET) throw makeSentinelError('ret', normalizedPc);
      if (normalizedPc === BOOT_CRASH_PC) throw makeSentinelError('boot', normalizedPc);
    };

    const TRACE_MAX = 3000;

    try {
      while (totalSteps < TRACE_MAX && !hit) {
        const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX - totalSteps);
        const stepBase = totalSteps;
        try {
          const result = executor.runFrom(currentPc, currentMode, {
            maxSteps: segmentBudget,
            maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
            onBlock(pc, mode, _meta, step) { noteBlock(pc, mode, stepBase, step); },
            onMissingBlock(pc, mode, step) { noteBlock(pc, mode, stepBase, step); },
          });
          totalSteps += result.steps ?? 0;
          currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
          currentMode = result.lastMode ?? currentMode;
          lastPc = currentPc;
          lastMode = currentMode;
          state.currentPc = currentPc;
          state.currentStep = totalSteps;
          termination = result.termination ?? null;
          if (result.error) errorMessage = result.error?.stack ?? String(result.error);
          if (termination !== 'max_steps') break;
        } catch (error) {
          if (error?.isSentinel) {
            hit = error.hit;
            termination = 'sentinel';
            lastPc = error.pc;
            totalSteps = Math.max(totalSteps, lastObservedStep);
            break;
          }
          totalSteps = Math.max(totalSteps, lastObservedStep);
          errorMessage = error?.stack ?? String(error);
          termination = 'exception';
          break;
        }
      }
    } catch (_) { /* handled above */ }

    const watched = restoreWatcher();
    const maxStepsReached = totalSteps >= TRACE_MAX && hit === null;
    const normalizedTermination = normalizeTermination(hit, termination, maxStepsReached);

    const wideRamAfter = Array.from(mem.slice(0xD00590, 0xD005B0));
    const wideRamDiffs = [];
    for (let i = 0; i < wideRamBefore.length; i++) {
      if (wideRamBefore[i] !== wideRamAfter[i]) {
        wideRamDiffs.push({
          addr: hex(0xD00590 + i),
          before: hexByte(wideRamBefore[i]),
          after: hexByte(wideRamAfter[i]),
        });
      }
    }

    results.push({
      initD00596: hex(d00596Before, 2),
      initD00595: hex(d00595Before, 2),
      finalD00596: hex(mem[D00596_ADDR], 2),
      finalD00595: hex(mem[D00595_ADDR], 2),
      steps: totalSteps,
      termination: normalizedTermination,
      lastPc: hex(lastPc),
      ramWrites: watched.events,
      ramWriteCount: watched.totalWrites,
      wideRamDiffs,
      errorMessage,
    });
  }

  return {
    experiment: 'D',
    description: '0x0A2B72 standalone with non-init counter values',
    entry: hex(ATTR_UPDATER),
    testCases: results,
  };
}

// ── Experiment E: Search ROM for Y-variable tokens near Y= editor ──

function runExperimentE() {
  const ROM_SEARCH_START = 0x09C000;
  const ROM_SEARCH_END = 0x0A3000;

  // Y-variable tokens: 0x5E 0x10=Y1, 0x5E 0x11=Y2, 0x5E 0x12=Y3, etc.
  const yTokenPatterns = [
    { name: 'Y1', bytes: [0x5E, 0x10] },
    { name: 'Y2', bytes: [0x5E, 0x11] },
    { name: 'Y3', bytes: [0x5E, 0x12] },
    { name: 'Y4', bytes: [0x5E, 0x13] },
    { name: 'Y5', bytes: [0x5E, 0x14] },
    { name: 'Y6', bytes: [0x5E, 0x15] },
    { name: 'Y7', bytes: [0x5E, 0x16] },
    { name: 'Y8', bytes: [0x5E, 0x17] },
    { name: 'Y9', bytes: [0x5E, 0x18] },
    { name: 'Y0', bytes: [0x5E, 0x19] },
  ];

  // Also search for ASCII "Y1=" etc.
  const asciiPatterns = [
    { name: 'ASCII Y1=', bytes: [0x59, 0x31, 0x3D] },
    { name: 'ASCII Y2=', bytes: [0x59, 0x32, 0x3D] },
    { name: 'ASCII Y3=', bytes: [0x59, 0x33, 0x3D] },
  ];

  const allPatterns = [...yTokenPatterns, ...asciiPatterns];
  const matches = [];

  for (const pattern of allPatterns) {
    const patternBytes = pattern.bytes;
    for (let addr = ROM_SEARCH_START; addr < ROM_SEARCH_END - patternBytes.length; addr++) {
      let found = true;
      for (let j = 0; j < patternBytes.length; j++) {
        if (romBytes[addr + j] !== patternBytes[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        // Get surrounding context (8 bytes before, 8 after)
        const contextStart = Math.max(0, addr - 8);
        const contextEnd = Math.min(romBytes.length, addr + patternBytes.length + 8);
        const context = Array.from(romBytes.slice(contextStart, contextEnd)).map(b => hexByte(b)).join(' ');

        matches.push({
          name: pattern.name,
          addr: hex(addr),
          context,
          contextStartAddr: hex(contextStart),
        });
      }
    }
  }

  // Also look for a table of Y-token second bytes (0x10, 0x11, 0x12, ..., 0x19)
  // in sequence, which would indicate a lookup table
  const tableCandidates = [];
  for (let addr = ROM_SEARCH_START; addr < ROM_SEARCH_END - 10; addr++) {
    // Look for sequential bytes 0x10, 0x11, 0x12 (Y1, Y2, Y3 token second bytes)
    if (romBytes[addr] === 0x10 && romBytes[addr + 1] === 0x11 && romBytes[addr + 2] === 0x12) {
      const contextStart = Math.max(0, addr - 4);
      const contextEnd = Math.min(romBytes.length, addr + 16);
      const context = Array.from(romBytes.slice(contextStart, contextEnd)).map(b => hexByte(b)).join(' ');
      tableCandidates.push({
        addr: hex(addr),
        context,
        note: 'Sequential Y-token second bytes (0x10, 0x11, 0x12)',
      });
    }
  }

  // Search for 0x5E anywhere followed by ADD/index computation
  // Also look for references to D00596 or similar in the range
  const d00596Refs = [];
  for (let addr = ROM_SEARCH_START; addr < ROM_SEARCH_END - 3; addr++) {
    // LD (addr),A or LD A,(addr) pattern for D00596 = 96 05 D0
    if (romBytes[addr] === 0x96 && romBytes[addr + 1] === 0x05 && romBytes[addr + 2] === 0xD0) {
      const contextStart = Math.max(0, addr - 4);
      const contextEnd = Math.min(romBytes.length, addr + 8);
      const context = Array.from(romBytes.slice(contextStart, contextEnd)).map(b => hexByte(b)).join(' ');
      d00596Refs.push({
        addr: hex(addr),
        instrApproxPc: hex(addr - 1),  // The instruction likely starts 1-3 bytes before
        context,
        note: 'Little-endian reference to 0xD00596',
      });
    }
  }

  // Also search for D00594, D00595 references
  const nearbyRefs = [];
  for (let offset = 0x90; offset <= 0xA0; offset++) {
    const target = 0xD00500 + offset;
    const b0 = target & 0xFF;
    const b1 = (target >> 8) & 0xFF;
    const b2 = (target >> 16) & 0xFF;
    for (let addr = ROM_SEARCH_START; addr < ROM_SEARCH_END - 3; addr++) {
      if (romBytes[addr] === b0 && romBytes[addr + 1] === b1 && romBytes[addr + 2] === b2) {
        nearbyRefs.push({
          targetAddr: hex(target),
          foundAt: hex(addr),
          instrApproxPc: hex(addr - 1),
        });
      }
    }
  }

  return {
    experiment: 'E',
    description: 'Search ROM 0x09C000-0x0A3000 for Y-variable tokens and D00596 references',
    searchRange: `${hex(ROM_SEARCH_START)}-${hex(ROM_SEARCH_END)}`,
    yTokenMatches: matches,
    yTokenMatchCount: matches.length,
    tableCandidates,
    d00596References: d00596Refs,
    nearbyRAMReferences: nearbyRefs,
  };
}

// ── Main ──

function main() {
  // Experiment A is purely static — run it first
  const experimentA = runExperimentA();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Boot + MemInit + CreateReal(Ans)
  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase196-yeq-row-labels',
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
      probe: 'phase196-yeq-row-labels',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      createReal: {
        hit: createReal.hit,
        steps: createReal.steps,
        termination: createReal.termination,
        lastPc: hex(createReal.lastPc),
        errorMessage: createReal.errorMessage,
      },
    }, null, 2));
    return;
  }

  const baselineMem = mem.slice();

  // Run experiments B-E
  const experimentB = runExperimentB(executor, cpu, mem, baselineMem);
  const experimentC = runExperimentC(executor, cpu, mem, baselineMem);
  const experimentD = runExperimentD(executor, cpu, mem, baselineMem);
  const experimentE = runExperimentE();

  console.log(JSON.stringify({
    probe: 'phase196-yeq-row-labels',
    status: 'completed',
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
      E: experimentE,
    },
  }, null, 2));
}

main();
