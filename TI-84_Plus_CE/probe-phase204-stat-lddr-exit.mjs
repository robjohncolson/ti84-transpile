#!/usr/bin/env node
/**
 * probe-phase204-stat-lddr-exit.mjs
 *
 * Investigate control flow around STAT block 0x092263 and explain why probes
 * never observe 0x092265 as a dispatched successor block after LDDR completes.
 *
 * Output: one JSON object on stdout with:
 *   - static transpiled/runtime analysis for 0x092259 / 0x092263 / 0x092265
 *   - a focused near-seed trace starting at the first dispatch of 0x092263
 *   - a conclusion describing the real post-LDDR control flow
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');
const RUNTIME_SOURCE_PATH = path.join(__dirname, 'cpu-runtime.js');
const TRANSPILER_SOURCE_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

ensureTranspiled();

const romBytes = fs.readFileSync(ROM_PATH);
const runtimeSource = fs.readFileSync(RUNTIME_SOURCE_PATH, 'utf8');
const transpilerSource = fs.readFileSync(TRANSPILER_SOURCE_PATH, 'utf8');

const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase204', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const RAW_BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
const TRACE_BLOCKS = instrumentBlocks(RAW_BLOCKS);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const BLOCK_092259 = 0x092259;
const BLOCK_092263 = 0x092263;
const SUCCESSOR_PC = 0x092265;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE204_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 10000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const NEAR_LIST_DATA_ADDR = 0xD01600;
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

const LIST_ELEMENTS = [
  Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
];

function ensureTranspiled() {
  if (fs.existsSync(TRANSPILED_PATH)) return;

  const result = spawnSync(process.execPath, [TRANSPILE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Transpile failed with status ${result.status ?? 'unknown'}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function instrumentBlocks(blocks) {
  const instrumented = { ...blocks };
  const key = '092263:adl';
  const block = blocks[key];
  if (!block?.source) return instrumented;

  let source = block.source;
  source = source.replace(
    /function block_092263_adl\(cpu\) \{\n/,
    "function block_092263_adl(cpu) {\n  if (cpu._phase204Log) cpu._phase204Log('enter_092263');\n",
  );
  source = source.replace(
    /  cpu\.lddr\(\);\n/,
    "  cpu.lddr();\n  if (cpu._phase204Log) cpu._phase204Log('after_lddr_before_092265');\n",
  );
  source = source.replace(
    /  cpu\.bc = cpu\.pop\(\);\n/,
    "  cpu.bc = cpu.pop();\n  if (cpu._phase204Log) cpu._phase204Log('after_pop_bc');\n",
  );
  source = source.replace(
    /  cpu\.ldir\(\);\n/,
    "  cpu.ldir();\n  if (cpu._phase204Log) cpu._phase204Log('after_ldir');\n",
  );
  source = source.replace(
    /  return cpu\.popReturn\(\);\n\}/,
    "  if (cpu._phase204Log) cpu._phase204Log('before_ret');\n  const _phase204ReturnPc = cpu.popReturn();\n  if (cpu._phase204Log) cpu._phase204Log('ret_target', { returnPc: _phase204ReturnPc });\n  return _phase204ReturnPc;\n}",
  );

  instrumented[key] = {
    ...block,
    source,
  };
  return instrumented;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24Raw(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8) | (mem[(a + 2) & MEM_MASK] << 16);
}

function write16Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const a = addr & MEM_MASK;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & MEM_MASK] = bytes[index] & 0xFF;
  }
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function flagsFromByte(f) {
  return {
    s: (f & 0x80) !== 0,
    z: (f & 0x40) !== 0,
    h: (f & 0x10) !== 0,
    pv: (f & 0x04) !== 0,
    n: (f & 0x02) !== 0,
    c: (f & 0x01) !== 0,
  };
}

function captureRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    flags: flagsFromByte(cpu.f & 0xFF),
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
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) {
            onMissingBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
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

function seedStatList(mem, listDataAddr) {
  const listDataLen = 2 + (LIST_ELEMENTS.length * 9);
  const listDataEnd = listDataAddr + listDataLen;
  const vatEntryBytes = Uint8Array.from([
    0x01,
    listDataAddr & 0xFF,
    (listDataAddr >>> 8) & 0xFF,
    (listDataAddr >>> 16) & 0xFF,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);

  write16Raw(mem, listDataAddr, LIST_ELEMENTS.length);
  for (let index = 0; index < LIST_ELEMENTS.length; index += 1) {
    writeBytes(mem, listDataAddr + 2 + (index * 9), LIST_ELEMENTS[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + vatEntryBytes.length);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24Raw(mem, LIST_PTR_TABLE_ADDR, listDataAddr);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    listDataAddr: hex(listDataAddr),
    listLength: LIST_ELEMENTS.length,
    expectedLddrDistance: hex((listDataAddr - LIST_COUNT_ADDR) & 0xFFFFFF),
    listPointer: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
    newDataPtr: hex(read24Raw(mem, NEWDATA_PTR_ADDR)),
  };
}

function inlinePcForEvent(kind) {
  switch (kind) {
    case 'enter_092263': return BLOCK_092263;
    case 'after_lddr_before_092265': return SUCCESSOR_PC;
    case 'after_pop_bc': return 0x09226A;
    case 'after_ldir': return 0x092279;
    case 'before_ret': return 0x09227E;
    case 'ret_target': return 0x09227E;
    default: return null;
  }
}

function pushTraceEvent(events, cpu, kind, step, extra = {}) {
  events.push({
    kind,
    step,
    ...extra,
    ...captureRegisters(cpu),
  });
}

function simplifyBlock(block) {
  if (!block) return null;
  return {
    id: block.id,
    startPc: hex(block.startPc),
    mode: block.mode,
    instructionCount: block.instructionCount,
    instructions: (block.instructions ?? []).map((instruction) => ({
      pc: hex(instruction.pc),
      bytes: instruction.bytes,
      dasm: instruction.dasm,
      tag: instruction.tag,
      target: hex(instruction.target),
      fallthrough: hex(instruction.fallthrough),
    })),
    exits: block.exits ?? [],
    source: block.source ?? null,
  };
}

function findIncomingEdges(targetPc) {
  const incoming = [];
  for (const block of Object.values(RAW_BLOCKS)) {
    for (const exit of block?.exits ?? []) {
      if (exit.target === targetPc) {
        incoming.push({
          from: block.id,
          type: exit.type,
          condition: exit.condition ?? null,
          target: hex(exit.target),
          targetMode: exit.targetMode ?? null,
        });
      }
    }
  }
  return incoming;
}

function extractMethodSnippet(source, name) {
  const match = source.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)\\n  \\}`, 'm'));
  if (!match) return null;
  return `${name}() {${match[1]}\n  }`;
}

function extractTranspilerRule(source, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`if \\(tag === '${escaped}'\\) return \\[[^\\n]+\\];`));
  return match ? match[0] : null;
}

function buildStaticAnalysis() {
  const block092259 = RAW_BLOCKS['092259:adl'] ?? null;
  const block092263 = RAW_BLOCKS['092263:adl'] ?? null;
  const block092265 = RAW_BLOCKS['092265:adl'] ?? null;
  const incoming092265 = findIncomingEdges(SUCCESSOR_PC);

  return {
    blockPresence: {
      block092259: Boolean(block092259),
      block092263: Boolean(block092263),
      block092265: Boolean(block092265),
    },
    predecessorBlock: simplifyBlock(block092259),
    lddrBlock: simplifyBlock(block092263),
    successorBlock: simplifyBlock(block092265),
    incomingEdgesTo092265: incoming092265,
    runtimeHelpers: {
      lddr: extractMethodSnippet(runtimeSource, 'lddr'),
      ldir: extractMethodSnippet(runtimeSource, 'ldir'),
    },
    transpilerRules: {
      lddr: extractTranspilerRule(transpilerSource, 'lddr'),
      ldir: extractTranspilerRule(transpilerSource, 'ldir'),
    },
    interpretation: {
      lddrLoopsInsideRuntimeHelper: /do \{ this\.ldd\(\); \} while \(this\.bc !== 0\);/.test(runtimeSource),
      block092263FallsThroughTo092265AsSeparateExit: (block092263?.exits ?? []).some((exit) => exit.target === SUCCESSOR_PC),
      block092263ContainsInline092265Instructions: (block092263?.instructions ?? []).some((instruction) => instruction.pc === SUCCESSOR_PC),
      block092259CanBranchDirectlyTo092265: incoming092265.some((edge) => edge.from === '092259:adl'),
    },
  };
}

function runNearSeedFocusTrace(baselineMem) {
  const runtime = createRuntime(TRACE_BLOCKS);
  runtime.mem.set(baselineMem);
  const seed = seedStatList(runtime.mem, NEAR_LIST_DATA_ADDR);
  resetCpuForStatEntry(runtime.cpu, runtime.mem);

  const events = [];
  let focusActive = false;
  let afterRetTarget = false;
  let first092263Step = null;
  let inline092265Reached = false;
  let standalone092265Dispatched = false;
  let postRetDispatch = null;
  let retTarget = null;

  runtime.cpu._probeStep = 0;
  runtime.cpu._phase204Log = (kind, extra = {}) => {
    if (!focusActive) return;
    const inlinePc = inlinePcForEvent(kind);
    if (kind === 'after_lddr_before_092265') inline092265Reached = true;
    if (kind === 'ret_target') {
      retTarget = extra.returnPc ?? null;
      afterRetTarget = true;
    }
    pushTraceEvent(events, runtime.cpu, `inline:${kind}`, runtime.cpu._probeStep ?? null, {
      blockPc: hex(runtime.cpu._currentBlockPc ?? 0),
      inlinePc: hex(inlinePc),
      returnPc: hex(extra.returnPc),
    });
  };

  const trace = runTraceSegmented(runtime.executor, STAT_ENTRY, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [RETURN_SENTINEL, 'return_hit'],
      [BOOT_ENTRY, 'boot_crash'],
    ]),
    onBlock(event) {
      runtime.cpu._probeStep = event.step;
      if (event.pc === SUCCESSOR_PC) standalone092265Dispatched = true;
      if (!focusActive && event.pc !== BLOCK_092263) return;
      if (!focusActive) first092263Step = event.step;
      focusActive = true;
      pushTraceEvent(events, runtime.cpu, 'dispatch', event.step, {
        pc: hex(event.pc),
        mode: event.mode,
        blockId: event.meta?.id ?? null,
      });
      if (afterRetTarget) {
        postRetDispatch = {
          kind: 'dispatch',
          step: event.step,
          pc: hex(event.pc),
          mode: event.mode,
          blockId: event.meta?.id ?? null,
        };
        throw makeStop('post_ret_dispatch', event.pc);
      }
    },
    onMissingBlock(event) {
      runtime.cpu._probeStep = event.step;
      if (event.pc === SUCCESSOR_PC) standalone092265Dispatched = true;
      if (!focusActive) return;
      pushTraceEvent(events, runtime.cpu, 'missing-block', event.step, {
        pc: hex(event.pc),
        mode: event.mode,
      });
      if (afterRetTarget) {
        postRetDispatch = {
          kind: 'missing-block',
          step: event.step,
          pc: hex(event.pc),
          mode: event.mode,
          blockId: null,
        };
        throw makeStop('post_ret_dispatch', event.pc);
      }
    },
  });

  delete runtime.cpu._phase204Log;

  return {
    seed,
    focusReached: focusActive,
    first092263Step,
    inline092265Reached,
    standalone092265Dispatched,
    retTarget: hex(retTarget),
    postRetDispatch,
    traceWindowTermination: {
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      errorMessage: trace.errorMessage,
      steps: trace.steps,
    },
    events,
  };
}

function buildConclusion(staticAnalysis, nearSeedTrace) {
  const separate092265BlockMissing = !staticAnalysis.blockPresence.block092265;
  const inlineContinuation = staticAnalysis.interpretation.block092263ContainsInline092265Instructions;
  const lddrLoopsInHelper = staticAnalysis.interpretation.lddrLoopsInsideRuntimeHelper;
  const nextPc = nearSeedTrace.postRetDispatch?.pc ?? nearSeedTrace.retTarget ?? nearSeedTrace.traceWindowTermination.finalPc;

  return {
    answer:
      inlineContinuation && lddrLoopsInHelper
        ? 'After LDDR completes, execution stays inside block 0x092263 and runs the instructions at 0x092265 inline inside the same transpiled function. The next dispatched PC is the RET target popped at 0x09227E, not 0x092265 as a separate block.'
        : 'The probe did not find the expected inline post-LDDR continuation pattern; inspect the static analysis and focused trace events.',
    successorWiring: {
      inlinePathInside092263Works: inlineContinuation && lddrLoopsInHelper,
      separateBlock092265Exists: !separate092265BlockMissing,
      why092265IsNotObservedAsPc:
        'The executor only reports block dispatch PCs. Because 0x092265 is embedded inside block_092263_adl rather than emitted as its own block, probes see 0x092263 followed by the RET target, not an intermediate dispatch to 0x092265.',
    },
    branchTargetRisk: {
      branchFrom092259To092265Exists: staticAnalysis.interpretation.block092259CanBranchDirectlyTo092265,
      standaloneTargetMissing: staticAnalysis.interpretation.block092259CanBranchDirectlyTo092265 && separate092265BlockMissing,
      impact:
        staticAnalysis.interpretation.block092259CanBranchDirectlyTo092265 && separate092265BlockMissing
          ? 'The current near-seed LDDR path is not broken by this, but the explicit JR Z -> 0x092265 edge in 0x092259 has no compiled destination. If that branch is taken, execution depends on missing-block recovery instead of a real lifted block.'
          : 'No missing direct branch target was detected in the lifted CFG.',
      suggestedFix:
        staticAnalysis.interpretation.block092259CanBranchDirectlyTo092265 && separate092265BlockMissing
          ? 'Split the lifted block at 0x092265 so the transpiler emits a standalone 092265:adl tail block. Then make 092263 end by returning 0x092265 after cpu.lddr(), and keep 092259\'s JR Z target pointed at that same block.'
          : 'No CFG fix suggested from this probe.',
    },
    observedNextPcAfterRet: nextPc,
  };
}

const baseline = createBaselineState();
const staticAnalysis = buildStaticAnalysis();
const nearSeedTrace = runNearSeedFocusTrace(baseline.baselineMem);
const conclusion = buildConclusion(staticAnalysis, nearSeedTrace);

console.log(JSON.stringify({
  probe: 'phase204-stat-lddr-exit',
  generatedAt: new Date().toISOString(),
  addresses: {
    statEntry: hex(STAT_ENTRY),
    predecessorBlock: hex(BLOCK_092259),
    lddrBlock: hex(BLOCK_092263),
    successorPc: hex(SUCCESSOR_PC),
    returnSentinel: hex(RETURN_SENTINEL),
  },
  baseline: {
    boot: baseline.boot,
    memInit: baseline.memInit,
  },
  staticAnalysis,
  nearSeedTrace,
  conclusion,
}, null, 2));
