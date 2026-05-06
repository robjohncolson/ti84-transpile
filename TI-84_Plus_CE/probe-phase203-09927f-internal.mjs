#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;

const ENTRY = 0x09927f;
const HELPER_082C50 = 0x082c50;
const HELPER_0846EA = 0x0846ea;
const HELPER_08011F = 0x08011f;
const JERROR_ENTRY = 0x061db2;

const OP1_ADDR = 0xd005f8;
const TOKEN_LENGTH = 9;

const MBASE = 0xd0;
const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const STACK_TOP = 0xd1a87e;
const EXPERIMENT_SP = 0xd1a860;

const MEM_INIT_RET = 0x7ffff6;
const RETURN_SENTINEL = 0x7fffe0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_STEP_LIMIT = 200;
const OS_MAX_LOOP_ITERATIONS = 8192;

const DISASSEMBLY_LINEAR_COUNT = 40;
const DISASSEMBLY_ENTRY_MAX = 64;
const NOTABLE_HIT_LIMIT = 64;

const SYMBOLS = new Map([
  [ENTRY, 'RclVarToEdit'],
  [HELPER_082C50, 'FindEUndef'],
  [HELPER_0846EA, 'TypeCheck bridge'],
  [HELPER_08011F, 'CP 0x5D helper'],
  [0x0972c3, 'SaveEditCursor'],
  [0x0987a2, 'PostDispatch helper'],
  [0x0992c3, 'RclToQueue'],
  [JERROR_ENTRY, 'JError'],
]);

const NOTABLE_PCS = new Map([
  [ENTRY, '0x09927F entry'],
  [HELPER_082C50, '0x082C50'],
  [HELPER_0846EA, '0x0846EA'],
  [HELPER_08011F, '0x08011F'],
  [0x099289, '0x099289'],
  [0x0992c3, '0x0992C3'],
  [JERROR_ENTRY, 'JError'],
]);

const EXPERIMENTS = [
  { id: 'A', label: 'digit 4', tokenByte: 0x34 },
  { id: 'B', label: 'known pass token 0x62', tokenByte: 0x62 },
  { id: 'C', label: 'plus operator token', tokenByte: 0x70 },
  { id: 'D', label: 'boundary token 0x5D', tokenByte: 0x5d },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function carryFlag(flags) {
  return ((flags ?? 0) & 0x01) !== 0;
}

function labelFor(addr) {
  return Number.isInteger(addr) ? (SYMBOLS.get(addr) ?? null) : null;
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function bytesToHexArray(mem, start, length) {
  const out = [];
  for (let index = 0; index < length; index += 1) {
    out.push(hexByte(mem[(start + index) & 0xffffff]));
  }
  return out;
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem, romBytes = rom) {
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function createCPU(mem, peripherals) {
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.memInit = () => runMemInit(executor, cpu, mem);
  return { cpu, executor };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  mem.fill(0xff, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x40));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
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
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc) },
  };
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE203_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xffffff;
  return error;
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations, handlers = {}) {
  let steps = 0;
  let lastPc = entry & 0xffffff;
  let lastMode = mode;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, meta, step) {
        lastPc = pc & 0xffffff;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onBlock) handlers.onBlock(pc, blockMode, meta, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        lastPc = pc & 0xffffff;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onMissingBlock) handlers.onMissingBlock(pc, blockMode, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
    });

    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: (result.lastPc ?? lastPc) & 0xffffff,
      lastMode: result.lastMode ?? lastMode,
      termination: result.termination ?? null,
      errorMessage: result.error ? (result.error.stack || String(result.error)) : null,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        hit: error.hit,
        steps,
        lastPc: error.pc,
        lastMode,
        termination: 'sentinel',
        errorMessage: null,
      };
    }

    return {
      hit: null,
      steps,
      lastPc,
      lastMode,
      termination: 'exception',
      errorMessage: error?.stack || String(error),
    };
  }
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function createBaseline() {
  const mem = createMemory();
  const romBytesLoaded = loadROM(mem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  cpu.mbase = MBASE;
  const boot = coldBoot(executor, cpu, mem);
  const memInit = cpu.memInit();

  return {
    romBytesLoaded,
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: hex(memInit.lastPc),
      errorMessage: memInit.errorMessage,
    },
    baselineMem: new Uint8Array(mem),
  };
}

function createExperimentEnv(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  return { mem, cpu, executor };
}

function memAddr(inst, mbase = MBASE) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((mbase & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const displacement = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const modePrefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${modePrefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${modePrefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${modePrefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${modePrefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${modePrefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${modePrefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${modePrefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${modePrefix}djnz ${hex(inst.target)}`;
    case 'ret': return `${modePrefix}ret`;
    case 'ret-conditional': return `${modePrefix}ret ${inst.condition}`;
    case 'push': return `${modePrefix}push ${inst.pair}`;
    case 'pop': return `${modePrefix}pop ${inst.pair}`;
    case 'ex-de-hl': return `${modePrefix}ex de, hl`;
    case 'ld-pair-imm': return `${modePrefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${modePrefix}ld ${inst.pair}, (${hex(memAddr(inst))})`;
    case 'ld-mem-pair': return `${modePrefix}ld (${hex(memAddr(inst))}), ${inst.pair}`;
    case 'ld-reg-imm': return `${modePrefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${modePrefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${modePrefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${modePrefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${modePrefix}ld ${inst.dest}, (${hex(memAddr(inst))})`;
    case 'ld-mem-reg': return `${modePrefix}ld (${hex(memAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${modePrefix}ld ${inst.dest}, (${inst.indexRegister}${displacement(inst.displacement)})`;
    case 'ld-ixd-reg': return `${modePrefix}ld (${inst.indexRegister}${displacement(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-res': return `${modePrefix}res ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`;
    case 'indexed-cb-set': return `${modePrefix}set ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`;
    case 'indexed-cb-bit': return `${modePrefix}bit ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`;
    case 'alu-imm': return `${modePrefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${modePrefix}${inst.op} ${inst.src}`;
    default: return `${modePrefix}${inst.tag}`;
  }
}

function decodeSequential(startPc, maxInstructions, stopOnRet = false) {
  const rows = [];
  let pc = startPc & 0xffffff;

  for (let index = 0; index < maxInstructions; index += 1) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const isRet = inst.tag === 'ret' || inst.tag === 'ret-conditional';
      rows.push({
        pcValue: inst.pc >>> 0,
        pc: hex(inst.pc),
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        op: inst.op ?? null,
        condition: inst.condition ?? null,
        targetValue: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
        target: Number.isInteger(inst.target) ? hex(inst.target) : null,
        targetLabel: labelFor(inst.target),
      });
      pc = (inst.pc + inst.length) & 0xffffff;
      if (stopOnRet && isRet) break;
    } catch (error) {
      rows.push({
        pcValue: pc,
        pc: hex(pc),
        bytes: bytesFor(rom, pc, 1),
        text: `decode error: ${error.message}`,
        tag: 'decode-error',
        op: null,
        condition: null,
        targetValue: null,
        target: null,
        targetLabel: null,
      });
      pc = (pc + 1) & 0xffffff;
    }
  }

  return rows;
}

function uniqueTargets(rows, tags) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!tags.has(row.tag) || row.targetValue === null || seen.has(row.targetValue)) continue;
    seen.add(row.targetValue);
    out.push({
      address: row.target,
      label: row.targetLabel,
    });
  }
  return out;
}

function analyzeEntryRoutine(rows) {
  const helperCallIndex = rows.findIndex((row) => row.targetValue === HELPER_082C50);
  const beforeHelper = helperCallIndex <= 0 ? [] : rows.slice(0, helperCallIndex);
  const conditionalBeforeHelper = beforeHelper
    .filter((row) => ['call-conditional', 'jp-conditional', 'jr-conditional', 'ret-conditional', 'djnz'].includes(row.tag))
    .map((row) => ({ pc: row.pc, text: row.text }));
  const rangeChecksBeforeHelper = beforeHelper
    .filter((row) => ['cp', 'sub', 'sbc'].includes(row.op))
    .map((row) => ({ pc: row.pc, text: row.text }));
  const indirectJumpsBeforeHelper = beforeHelper
    .filter((row) => row.tag === 'jp-indirect')
    .map((row) => ({ pc: row.pc, text: row.text }));
  const firstRet = rows.find((row) => row.tag === 'ret' || row.tag === 'ret-conditional');

  return {
    firstInstruction: rows[0]?.text ?? null,
    instructionCount: rows.length,
    firstRetPc: firstRet?.pc ?? null,
    helperCallIndex,
    helperCallPc: helperCallIndex >= 0 ? rows[helperCallIndex].pc : null,
    noFastPathBefore082c50: helperCallIndex === 0 && conditionalBeforeHelper.length === 0 && rangeChecksBeforeHelper.length === 0,
    conditionalBranchesBefore082c50: conditionalBeforeHelper,
    rangeChecksBefore082c50: rangeChecksBeforeHelper,
    indirectJumpsBefore082c50: indirectJumpsBeforeHelper,
    callTargetsWithinRoutine: uniqueTargets(rows, new Set(['call', 'call-conditional'])),
    jumpTargetsWithinRoutine: uniqueTargets(rows, new Set(['jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'])),
    note: helperCallIndex === 0
      ? 'The first decoded instruction at 0x09927F is call 0x082C50, so there is no internal pre-call branch or range check in the entry routine.'
      : 'A helper call was not the first decoded instruction; inspect rows for a possible pre-call path.',
  };
}

function analyzeLinearWindow(rows) {
  return {
    instructionCount: rows.length,
    callTargets: uniqueTargets(rows, new Set(['call', 'call-conditional'])),
    jumpTargets: uniqueTargets(rows, new Set(['jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'])),
    retSites: rows
      .filter((row) => row.tag === 'ret' || row.tag === 'ret-conditional')
      .map((row) => ({ pc: row.pc, text: row.text })),
  };
}

function snapshotCpu(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    carry: carryFlag(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
    mbase: hex(cpu.mbase, 2),
    madl: cpu.madl ? 'adl' : 'z80',
  };
}

function seedOp1(mem, tokenByte, categoryByte = 0x00) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  mem[OP1_ADDR] = categoryByte & 0xff;
  mem[OP1_ADDR + 1] = tokenByte & 0xff;
}

function pushReturnSentinel(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, value);
}

function createTraceState() {
  return {
    blockSequence: [],
    uniqueBlocks: [],
    uniqueSet: new Set(),
    firstHitSteps: new Map(),
    notableHits: [],
    missingBlocks: [],
  };
}

function noteBlock(state, cpu, pc, mode, step) {
  const normalizedPc = pc & 0xffffff;
  const renderedPc = hex(normalizedPc);

  state.blockSequence.push(renderedPc);
  if (!state.uniqueSet.has(renderedPc)) {
    state.uniqueSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }
  if (!state.firstHitSteps.has(normalizedPc)) {
    state.firstHitSteps.set(normalizedPc, (step ?? 0) + 1);
  }

  const label = NOTABLE_PCS.get(normalizedPc);
  if (!label) return;

  if (state.notableHits.length < NOTABLE_HIT_LIMIT) {
    state.notableHits.push({
      step: (step ?? 0) + 1,
      pc: renderedPc,
      label,
      mode,
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      carry: carryFlag(cpu.f),
      sp: hex(cpu.sp),
      de: hex(cpu.de),
      hl: hex(cpu.hl),
    });
  }
}

function noteMissingBlock(state, pc, mode, step) {
  state.missingBlocks.push({
    step: (step ?? 0) + 1,
    pc: hex(pc),
    mode,
  });
}

function describeStop(trace) {
  if (trace.hit === 'ret') return 'return sentinel';
  if (trace.hit === 'jerror') return 'JError sentinel';
  if (trace.termination === 'max_steps') return 'step limit';
  if (trace.termination === 'missing_block') return 'missing block';
  if (trace.termination === 'exception') return 'exception';
  return trace.termination ?? 'unknown';
}

function runExperiment(experiment, baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  resetOsState(cpu, mem, EXPERIMENT_SP);
  cpu.mbase = MBASE;
  seedOp1(mem, experiment.tokenByte, 0x00);
  pushReturnSentinel(cpu, mem, RETURN_SENTINEL);

  const beforeCpu = snapshotCpu(cpu);
  const beforeOp1 = bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH);

  const trace = runUntilHit(
    executor,
    ENTRY,
    'adl',
    { ret: RETURN_SENTINEL, jerror: JERROR_ENTRY },
    TRACE_STEP_LIMIT,
    OS_MAX_LOOP_ITERATIONS,
    {
      onBlock(pc, mode, _meta, step) {
        noteBlock(state, cpu, pc, mode, step);
      },
      onMissingBlock(pc, mode, step) {
        noteMissingBlock(state, pc, mode, step);
      },
    },
  );

  const returned = trace.hit === 'ret';

  return {
    id: experiment.id,
    label: experiment.label,
    tokenByte: hexByte(experiment.tokenByte),
    op1Before: beforeOp1,
    beforeCpu,
    steps: trace.steps,
    stopReason: describeStop(trace),
    termination: returned ? 'return_sentinel' : (trace.hit === 'jerror' ? 'jerror_sentinel' : (trace.termination ?? 'unknown')),
    returned,
    carryAtReturn: returned ? carryFlag(cpu.f) : null,
    carryAtStop: carryFlag(cpu.f),
    stopPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    finalCpu: snapshotCpu(cpu),
    op1After: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    reached: {
      entry09927f: state.firstHitSteps.has(ENTRY),
      helper082c50: state.firstHitSteps.has(HELPER_082C50),
      helper0846ea: state.firstHitSteps.has(HELPER_0846EA),
      helper08011f: state.firstHitSteps.has(HELPER_08011F),
      jerror061db2: state.firstHitSteps.has(JERROR_ENTRY) || trace.hit === 'jerror',
    },
    firstHitSteps: {
      entry09927f: state.firstHitSteps.get(ENTRY) ?? null,
      helper082c50: state.firstHitSteps.get(HELPER_082C50) ?? null,
      helper0846ea: state.firstHitSteps.get(HELPER_0846EA) ?? null,
      helper08011f: state.firstHitSteps.get(HELPER_08011F) ?? null,
      jerror061db2: state.firstHitSteps.get(JERROR_ENTRY) ?? null,
    },
    blockSequence: state.blockSequence,
    uniqueBlocks: state.uniqueBlocks,
    notableHits: state.notableHits,
    missingBlocks: state.missingBlocks,
    errorMessage: trace.errorMessage,
  };
}

function buildSummary(entryAnalysis, experiments) {
  const allReach082c50 = experiments.every((experiment) => experiment.reached.helper082c50);
  const anySkip082c50 = experiments.some((experiment) => !experiment.reached.helper082c50);
  const experimentOutcomes = experiments.map((experiment) => ({
    tokenByte: experiment.tokenByte,
    termination: experiment.termination,
    reached082c50: experiment.reached.helper082c50,
    reached0846ea: experiment.reached.helper0846ea,
    reached08011f: experiment.reached.helper08011f,
    carryAtReturn: experiment.carryAtReturn,
    carryAtStop: experiment.carryAtStop,
  }));

  let answer;
  if (entryAnalysis.noFastPathBefore082c50 && allReach082c50) {
    answer = 'No internal fast-path before 0x082C50 was observed. The first decoded instruction at 0x09927F is call 0x082C50, and every standalone token experiment reached 0x082C50.';
  } else if (anySkip082c50) {
    answer = 'At least one runtime experiment did not reach 0x082C50, so inspect the per-experiment traces for an unexpected bypass or earlier failure.';
  } else {
    answer = 'Static decoding shows no pre-call branch before 0x082C50, but inspect the traces for downstream divergence after the helper returns.';
  }

  return {
    question: 'Does 0x09927F branch internally before calling 0x082C50?',
    answer,
    experimentOutcomes,
  };
}

function main() {
  const baseline = createBaseline();
  const entryRoutineRows = decodeSequential(ENTRY, DISASSEMBLY_ENTRY_MAX, true);
  const linearRows = decodeSequential(ENTRY, DISASSEMBLY_LINEAR_COUNT, false);
  const entryAnalysis = analyzeEntryRoutine(entryRoutineRows);
  const linearAnalysis = analyzeLinearWindow(linearRows);
  const experiments = EXPERIMENTS.map((experiment) => runExperiment(experiment, baseline.baselineMem));

  return {
    probe: 'probe-phase203-09927f-internal.mjs',
    generatedAt: new Date().toISOString(),
    setup: {
      romPath: ROM_PATH,
      romBytesLoaded: baseline.romBytesLoaded,
      timerInterrupt: false,
      mbase: hex(MBASE, 2),
      op1Addr: hex(OP1_ADDR),
      entry: hex(ENTRY),
      watchedHelpers: [hex(HELPER_082C50), hex(HELPER_0846EA), hex(HELPER_08011F), hex(JERROR_ENTRY)],
      traceStepLimit: TRACE_STEP_LIMIT,
      baseline: {
        boot: baseline.boot,
        memInit: baseline.memInit,
      },
    },
    disassembly: {
      entryRoutine: {
        start: hex(ENTRY),
        instructions: entryRoutineRows.map((row) => ({
          pc: row.pc,
          bytes: row.bytes,
          text: row.text,
          tag: row.tag,
          op: row.op,
          target: row.target,
          targetLabel: row.targetLabel,
          condition: row.condition,
        })),
        analysis: entryAnalysis,
      },
      linear40FromEntry: {
        start: hex(ENTRY),
        instructions: linearRows.map((row) => ({
          pc: row.pc,
          bytes: row.bytes,
          text: row.text,
          tag: row.tag,
          op: row.op,
          target: row.target,
          targetLabel: row.targetLabel,
          condition: row.condition,
        })),
        analysis: linearAnalysis,
      },
    },
    experiments,
    summary: buildSummary(entryAnalysis, experiments),
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase203-09927f-internal.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
