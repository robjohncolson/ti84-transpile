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

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const TOKEN_LENGTH = 9;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const COPY9_ENTRY = 0x07F9FB;
const KEY_CLASSIFIER_ENTRY = 0x07F7BD;
const BUF_INSERT_ENTRY = 0x05E2A0;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const TRACE_MAX_STEPS = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const RAW_YEQ_TOKEN = 0x8D;
const ENTRY_CANDIDATES = [0x05849F, 0x05848F];
const YEQ_EDITOR_RANGE = { start: 0x09C000, end: 0x09D000, label: '0x09C000-0x09D000 Y= editor range' };

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const HYPOTHESES = [
  { id: 'A', label: 'type=0x05 special, token=0x8D', bytes: Uint8Array.from([0x05, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
  { id: 'B', label: 'type=0x00 variable, token=0x8D', bytes: Uint8Array.from([0x00, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
  { id: 'C', label: 'type=0x0D raw-token type, token=0x8D', bytes: Uint8Array.from([0x0D, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
  { id: 'D', label: 'type=0x06 error, token=0x8D', bytes: Uint8Array.from([0x06, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
  { id: 'E', label: 'type=0x05 with prefix 0x5E, token=0x8D', bytes: Uint8Array.from([0x05, 0x5E, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
];

const WATCH_LABELS = new Map([
  [0x05848F, 'entry before helper calls'],
  [0x05849F, 'ld hl, TOKEN_STAGING'],
  [0x0584A3, 'call Copy9 TOKEN_STAGING->OP1'],
  [0x0584A7, 'call key classifier'],
  [0x0584AB, 'cp 0x06'],
  [0x0584B1, 'cp 0x05'],
  [0x0584B5, 'type-5 branch'],
  [0x0584C1, 'general insertion branch'],
  [0x058569, 'post-general helper'],
  [0x0585D3, 'dispatch table jp (hl)'],
  [0x05E2A0, 'BufInsert'],
  [0x061D42, 'type-6 error handler'],
  [0x07F7BD, 'key classifier'],
  [0x07F9FB, 'Copy9 helper'],
  [0x09CB14, 'Y= attribute status line'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let index = 0; index < length; index += 1) out.push(hexByte(buffer[(start + index) & 0xFFFFFF] ?? 0));
  return out.join(' ');
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

function makeSentinelError(termination, pc) {
  const error = new Error('__PHASE192_SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
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
    const result = executor.runFrom(currentPc, currentMode, { maxSteps: segmentBudget, maxLoopIterations });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }
  return { steps: totalSteps, lastPc: lastResult.lastPc ?? currentPc, lastMode: lastResult.lastMode ?? currentMode, termination: lastResult.termination ?? null };
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
        throw makeSentinelError('sentinel', normalizedPc);
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
        termination = error.termination;
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
    ...runUntilHitSegmented(executor, CREATE_REAL_ENTRY, 'adl', { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR }, CREATE_REAL_MAX_STEPS, OS_MAX_LOOP_ITERATIONS),
  };
}

function traceAttempt(executor, cpu, mem, hypothesis, entry) {
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.set(hypothesis.bytes, TOKEN_STAGING_ADDR);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);

  resetCpuForOsCall(cpu, mem);
  cpu.a = RAW_YEQ_TOKEN;
  cpu._hl = TOKEN_STAGING_ADDR;
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const uniqueBlocks = [];
  const uniqueSet = new Set();
  const yeqHits = [];
  const yeqSet = new Set();
  const missingBlocks = [];
  const missingSet = new Set();
  const visitedCounts = new Map();

  let currentPc = entry & 0xFFFFFF;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let copy9Snapshot = null;
  let classifierSnapshot = null;
  let cp06A = null;
  let cp05A = null;
  let branchKind = 'unknown';
  let branchObserved = false;
  let dispatchPath = null;
  let bufInsertReached = false;
  let helper058569Reached = false;
  let jumpTableReached = false;

  const noteBlock = (pc, mode, missing = false) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    lastMode = mode ?? lastMode;
    visitedCounts.set(normalizedPc, (visitedCounts.get(normalizedPc) ?? 0) + 1);
    if (!uniqueSet.has(normalizedPc)) {
      uniqueSet.add(normalizedPc);
      uniqueBlocks.push(normalizedPc);
    }
    if (missing && !missingSet.has(normalizedPc)) {
      missingSet.add(normalizedPc);
      missingBlocks.push(normalizedPc);
    }
    if (normalizedPc >= YEQ_EDITOR_RANGE.start && normalizedPc < YEQ_EDITOR_RANGE.end && !yeqSet.has(normalizedPc)) {
      yeqSet.add(normalizedPc);
      const labels = [YEQ_EDITOR_RANGE.label];
      if (WATCH_LABELS.has(normalizedPc)) labels.push(WATCH_LABELS.get(normalizedPc));
      yeqHits.push({ pc: hex(normalizedPc), labels });
    }
    if (normalizedPc === COPY9_ENTRY && !copy9Snapshot) {
      copy9Snapshot = {
        hl: hex(cpu._hl),
        tokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
        op1BeforeCopy: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
      };
    }
    if (normalizedPc === KEY_CLASSIFIER_ENTRY && !classifierSnapshot) {
      classifierSnapshot = {
        op1Bytes: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
        op1_0: mem[OP1_ADDR] & 0xFF,
        classValue: mem[OP1_ADDR] & 0x3F,
        aAtEntry: cpu.a & 0xFF,
        hl: hex(cpu._hl),
      };
    }
    if (normalizedPc === 0x0584AB && cp06A === null) cp06A = cpu.a & 0xFF;
    if (normalizedPc === 0x0584B1 && cp05A === null) cp05A = cpu.a & 0xFF;
    if (branchKind === 'unknown' && normalizedPc === 0x061D42) {
      branchKind = 'cp_06';
      branchObserved = true;
      dispatchPath = 'cp 0x06 matched -> jp z, 0x061D42';
    }
    if (branchKind === 'unknown' && normalizedPc === 0x0584B5) {
      branchKind = 'cp_05';
      branchObserved = true;
      dispatchPath = 'cp 0x05 matched -> type-5 branch';
    }
    if (branchKind === 'unknown' && normalizedPc === 0x0584C1) {
      branchKind = 'fallthrough';
      branchObserved = true;
      dispatchPath = 'cp 0x06 no, cp 0x05 no -> general insertion branch';
    }
    if (normalizedPc === BUF_INSERT_ENTRY) bufInsertReached = true;
    if (normalizedPc === 0x058569) helper058569Reached = true;
    if (normalizedPc === 0x0585D3) jumpTableReached = true;
    if (normalizedPc === TRACE_RET) {
      hit = 'ret';
      throw makeSentinelError('sentinel', normalizedPc);
    }
  };

  while (totalSteps < TRACE_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode) { noteBlock(pc, mode, false); },
        onMissingBlock(pc, mode) { noteBlock(pc, mode, true); },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      lastPc = currentPc;
      lastMode = currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = error.termination;
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= TRACE_MAX_STEPS && !hit) termination = 'step_limit';
  else if (termination === null) termination = 'completed';

  if (branchKind === 'unknown' && classifierSnapshot) {
    if (classifierSnapshot.classValue === 0x06) {
      branchKind = 'cp_06';
      dispatchPath = 'inferred from classValue 0x06';
    } else if (classifierSnapshot.classValue === 0x05) {
      branchKind = 'cp_05';
      dispatchPath = 'inferred from classValue 0x05';
    } else {
      branchKind = 'fallthrough';
      dispatchPath = `inferred fall-through from classValue ${hex(classifierSnapshot.classValue, 2)}`;
    }
  }

  const topPcs = [...visitedCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([pc, count]) => ({ pc: hex(pc), count, label: WATCH_LABELS.get(pc) ?? null }));

  return {
    hypothesisId: hypothesis.id,
    hypothesisLabel: hypothesis.label,
    hypothesisBytes: formatBytes(hypothesis.bytes),
    entry: hex(entry),
    inputA: hex(RAW_YEQ_TOKEN, 2),
    totalSteps,
    termination,
    finalPc: hex(lastPc),
    finalMode: lastMode,
    sentinelHit: hit,
    copy9Fired: Boolean(copy9Snapshot),
    copy9Snapshot,
    classificationFired: Boolean(classifierSnapshot),
    classifierSnapshot: classifierSnapshot ? {
      op1Bytes: classifierSnapshot.op1Bytes,
      op1_0: hex(classifierSnapshot.op1_0, 2),
      classValue: { hex: hex(classifierSnapshot.classValue, 2), decimal: classifierSnapshot.classValue },
      aAtEntry: hex(classifierSnapshot.aAtEntry, 2),
      hl: classifierSnapshot.hl,
    } : null,
    classValue: classifierSnapshot ? { hex: hex(classifierSnapshot.classValue, 2), decimal: classifierSnapshot.classValue } : null,
    branchKind,
    branchObserved,
    dispatchPath,
    cp06A: cp06A === null ? null : hex(cp06A, 2),
    cp05A: cp05A === null ? null : hex(cp05A, 2),
    bufInsertReached,
    yeqEditorReached: yeqHits.length > 0,
    yeqHits,
    helper058569Reached,
    jumpTableReached,
    uniqueBlockCount: uniqueBlocks.length,
    uniqueBlockPcs: uniqueBlocks.map((pc) => hex(pc)),
    missingBlocks: missingBlocks.map((pc) => hex(pc)),
    topPcs,
    op1After: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
    tokenStagingAfter: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
    finalCpu: snapshotCpu(cpu),
    errorMessage,
  };
}

function scoreAttempt(attempt) {
  let score = 0;
  if (attempt.yeqEditorReached) score += 1000000 + (attempt.yeqHits.length * 1000);
  if (attempt.branchKind === 'cp_05') score += 200000;
  else if (attempt.branchKind === 'fallthrough') score += 100000;
  else if (attempt.branchKind === 'cp_06') score += 50000;
  if (attempt.bufInsertReached) score += 20000;
  if (attempt.jumpTableReached) score += 5000;
  if (attempt.helper058569Reached) score += 2000;
  if (attempt.branchObserved) score += 500;
  return score + attempt.uniqueBlockCount;
}

function scoreReasons(attempt) {
  const reasons = [];
  if (attempt.yeqEditorReached) reasons.push('reached the Y= editor range');
  if (attempt.branchKind === 'cp_05') reasons.push('took the type-5 branch');
  if (attempt.bufInsertReached) reasons.push('reached BufInsert');
  if (attempt.jumpTableReached) reasons.push('reached the jump-table dispatcher');
  if (attempt.helper058569Reached) reasons.push('reached helper 0x058569');
  if (reasons.length === 0) reasons.push('did not reach a stronger Y= dispatch landmark');
  return reasons;
}

function pickBestAttempt(attempts) {
  if (attempts.length === 0) return null;
  return [...attempts].sort((left, right) => {
    const scoreDiff = scoreAttempt(right) - scoreAttempt(left);
    if (scoreDiff !== 0) return scoreDiff;
    const uniqueDiff = right.uniqueBlockCount - left.uniqueBlockCount;
    if (uniqueDiff !== 0) return uniqueDiff;
    return right.totalSteps - left.totalSteps;
  })[0];
}

function summarizeBest(attempt) {
  if (!attempt) return null;
  return {
    hypothesisId: attempt.hypothesisId,
    hypothesisLabel: attempt.hypothesisLabel,
    hypothesisBytes: attempt.hypothesisBytes,
    entry: attempt.entry,
    score: scoreAttempt(attempt),
    reasons: scoreReasons(attempt),
    classValue: attempt.classValue,
    branchKind: attempt.branchKind,
    branchObserved: attempt.branchObserved,
    dispatchPath: attempt.dispatchPath,
    bufInsertReached: attempt.bufInsertReached,
    yeqEditorReached: attempt.yeqEditorReached,
    yeqHits: attempt.yeqHits,
    uniqueBlockCount: attempt.uniqueBlockCount,
    finalPc: attempt.finalPc,
    termination: attempt.termination,
    op1After: attempt.op1After,
    tokenStagingAfter: attempt.tokenStagingAfter,
  };
}

function printAttempt(attempt) {
  const classValue = attempt.classValue ? `${attempt.classValue.hex} (${attempt.classValue.decimal})` : 'n/a';
  const branch = attempt.branchKind === 'unknown' ? 'unknown' : attempt.branchObserved ? attempt.branchKind : `${attempt.branchKind} (inferred)`;
  console.log(`  Entry ${attempt.entry} -> class=${classValue}, branch=${branch}, uniqueBlocks=${attempt.uniqueBlockCount}, bufInsert=${attempt.bufInsertReached}, yeqRange=${attempt.yeqEditorReached}, termination=${attempt.termination}, finalPc=${attempt.finalPc}`);
  console.log(`    OP1 after: [${attempt.op1After}]`);
  console.log(`    TOKEN_STAGING after: [${attempt.tokenStagingAfter}]`);
  if (attempt.yeqHits.length > 0) {
    console.log(`    Y= hits: ${attempt.yeqHits.map((hit) => `${hit.pc} [${hit.labels.join('; ')}]`).join(', ')}`);
  }
}

function emitJsonReport(report) {
  console.log('\n=== JSON Summary ===');
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  console.log('=== Phase 192: TOKEN_STAGING format experiments for Y= key ===\n');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('[0] Booting runtime and preparing baseline state\n');
  const boot = bootRuntime(executor, cpu, mem);
  console.log(`  Boot: ${JSON.stringify(boot.boot)}`);
  console.log(`  KernelInit: ${JSON.stringify(boot.kernelInit)}`);
  console.log(`  PostInit: ${JSON.stringify(boot.postInit)}`);

  const memInit = runMemInit(executor, cpu, mem);
  console.log(`  MemInit: hit=${memInit.hit} steps=${memInit.steps} termination=${memInit.termination}`);
  if (memInit.hit !== 'ret') {
    emitJsonReport({
      probe: 'phase192-token-staging-format',
      status: 'aborted',
      reason: 'MemInit did not return',
      boot,
      memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination, lastPc: hex(memInit.lastPc), errorMessage: memInit.errorMessage },
    });
    return;
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  console.log(`  CreateReal(Ans): hit=${createReal.hit} steps=${createReal.steps} termination=${createReal.termination} errBase=${createReal.errBase}`);
  if (createReal.hit !== 'ret') {
    emitJsonReport({
      probe: 'phase192-token-staging-format',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination, lastPc: hex(memInit.lastPc), errorMessage: memInit.errorMessage },
      createReal: { hit: createReal.hit, steps: createReal.steps, termination: createReal.termination, lastPc: hex(createReal.lastPc), errBase: createReal.errBase, errorMessage: createReal.errorMessage },
    });
    return;
  }

  const baselineMem = mem.slice();
  const hypothesisResults = [];
  const allAttempts = [];

  console.log('\n[1] Hypothesis matrix\n');
  for (const hypothesis of HYPOTHESES) {
    console.log(`--- Hypothesis ${hypothesis.id}: ${hypothesis.label} ---`);
    console.log(`  TOKEN_STAGING seed: [${formatBytes(hypothesis.bytes)}]`);
    const entryResults = [];
    for (const entry of ENTRY_CANDIDATES) {
      mem.set(baselineMem);
      const attempt = traceAttempt(executor, cpu, mem, hypothesis, entry);
      entryResults.push(attempt);
      allAttempts.push(attempt);
      printAttempt(attempt);
    }
    hypothesisResults.push({
      id: hypothesis.id,
      label: hypothesis.label,
      tokenStagingBytes: formatBytes(hypothesis.bytes),
      entryResults,
    });
    console.log('');
  }

  const bestOverall = pickBestAttempt(allAttempts);
  const bestByEntry = Object.fromEntries(ENTRY_CANDIDATES.map((entry) => {
    const entryHex = hex(entry);
    return [entryHex, summarizeBest(pickBestAttempt(allAttempts.filter((attempt) => attempt.entry === entryHex)))];
  }));
  const type5Hits = allAttempts.filter((attempt) => attempt.branchKind === 'cp_05');
  const yeqRangeHits = allAttempts.filter((attempt) => attempt.yeqEditorReached);

  console.log('=== Best Overall ===');
  if (bestOverall) {
    console.log(`  ${bestOverall.hypothesisId} at ${bestOverall.entry} scored ${scoreAttempt(bestOverall)}: ${scoreReasons(bestOverall).join('; ')}`);
  }

  console.log('\n=== Type-5 Branch Hits ===');
  if (type5Hits.length === 0) console.log('  none');
  else for (const attempt of type5Hits) console.log(`  Hypothesis ${attempt.hypothesisId} at ${attempt.entry} -> class=${attempt.classValue ? attempt.classValue.hex : 'n/a'} finalPc=${attempt.finalPc}`);

  console.log('\n=== Y= Editor Range Hits ===');
  if (yeqRangeHits.length === 0) console.log('  none');
  else for (const attempt of yeqRangeHits) console.log(`  Hypothesis ${attempt.hypothesisId} at ${attempt.entry} -> ${attempt.yeqHits.map((hit) => `${hit.pc} [${hit.labels.join('; ')}]`).join(', ')}`);

  emitJsonReport({
    probe: 'phase192-token-staging-format',
    status: 'completed',
    boot,
    memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination, lastPc: hex(memInit.lastPc), errorMessage: memInit.errorMessage },
    createReal: { hit: createReal.hit, steps: createReal.steps, termination: createReal.termination, lastPc: hex(createReal.lastPc), errBase: createReal.errBase, errorMessage: createReal.errorMessage },
    notes: [
      'All runs keep register A at 0x8D so the experiment isolates TOKEN_STAGING object formatting.',
      'Each run starts from the same post-boot baseline snapshot and re-seeds TOKEN_STAGING and OP1 before tracing.',
      'The final JSON block is the machine-readable comparison output for all hypotheses and both entry points.',
    ],
    hypotheses: hypothesisResults,
    bestOverall: summarizeBest(bestOverall),
    bestByEntry,
    type5Hits: type5Hits.map((attempt) => summarizeBest(attempt)),
    yeqRangeHits: yeqRangeHits.map((attempt) => summarizeBest(attempt)),
  });
}

main();
