#!/usr/bin/env node

/**
 * Phase 25AN: run the home-screen second-pass handler (0x0585E9) with
 * A=5 / kEnter under two 500K-step scenarios:
 *   A) baseline state after MEM_INIT
 *   B) baseline state with 0xD01D0B forced to 0x00 before dispatch
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25an-enter-500k-report.md');
const REPORT_TITLE = 'Phase 25AN - ENTER dispatch from 0x0585E9 with a 500K budget';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;
const SECOND_PASS_ENTRY = 0x0585e9;
const SECOND_PASS_BUDGET = 500000;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const CX_MAIN_ADDR = 0xd007ca;
const CX_PPUTAWAY_ADDR = 0xd007cd;
const CX_PUTAWAY_ADDR = 0xd007d0;
const CX_REDISP_ADDR = 0xd007d3;
const CX_ERROREP_ADDR = 0xd007d6;
const CX_SIZEWIND_ADDR = 0xd007d9;
const CX_PAGE_ADDR = 0xd007dc;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_CONTEXT_END_ADDR = 0xd007e1;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FLASH_SIZE_ADDR = 0xd025c5;

const D01D0B_ADDR = 0xd01d0b;

const HOME_SCREEN_APP_ID = 0x40;
const SECOND_PASS_CX_CUR_APP = 0x00;
const K_ENTER = 0x05;
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const ALLOCATOR_LOOP_START = 0x082700;
const ALLOCATOR_LOOP_END = 0x0827ff;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MONITORED_ADDRS = [
  { addr: 0x099914, label: '0x099914 ParseInp' },
  { addr: 0x0973c8, label: '0x0973C8 ENTER key path / dual-ParseInp entry' },
  { addr: 0x0973f8, label: '0x0973F8 ParseInp call #1' },
  { addr: 0x09740a, label: '0x09740A ParseInp call #2' },
  { addr: 0x0921cb, label: '0x0921CB investigated helper' },
  { addr: 0x05862f, label: '0x05862F instruction after CALL 0x0921CB' },
  { addr: 0x05e3a2, label: '0x05E3A2 compaction entry' },
];

const SCENARIOS = [
  {
    id: 'A',
    title: 'Scenario A: 500K budget, baseline state',
    seedD01D0B: undefined,
  },
  {
    id: 'B',
    title: 'Scenario B: 500K budget with 0xD01D0B=0x00',
    seedD01D0B: 0x00,
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function memWrap(mem) {
  return {
    write8(addr, value) { mem[addr] = value & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function safeReadReal(mem, addr) {
  try {
    return readReal(memWrap(mem), addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    flashSize: read24(mem, FLASH_SIZE_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTempCnt=${hex(snapshot.pTempCnt)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `flashSize=${hex(snapshot.flashSize)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
  ].join(' ');
}

function snapshotCxContext(mem) {
  return {
    cxMain: read24(mem, CX_MAIN_ADDR),
    cxPPutaway: read24(mem, CX_PPUTAWAY_ADDR),
    cxPutaway: read24(mem, CX_PUTAWAY_ADDR),
    cxRedisp: read24(mem, CX_REDISP_ADDR),
    cxErrorEP: read24(mem, CX_ERROREP_ADDR),
    cxSizeWind: read24(mem, CX_SIZEWIND_ADDR),
    cxPageLo: mem[CX_PAGE_ADDR] & 0xff,
    cxPageHi: mem[CX_PAGE_ADDR + 1] & 0xff,
    cxCurApp: mem[CX_CUR_APP_ADDR] & 0xff,
    raw: hexBytes(mem, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1),
  };
}

function formatCxSnapshot(snapshot) {
  return [
    `cxMain=${hex(snapshot.cxMain)}`,
    `cxPPutaway=${hex(snapshot.cxPPutaway)}`,
    `cxPutaway=${hex(snapshot.cxPutaway)}`,
    `cxRedisp=${hex(snapshot.cxRedisp)}`,
    `cxErrorEP=${hex(snapshot.cxErrorEP)}`,
    `cxSizeWind=${hex(snapshot.cxSizeWind)}`,
    `cxPage=${hex((snapshot.cxPageLo | (snapshot.cxPageHi << 8)) >>> 0, 4)}`,
    `cxCurApp=${hex(snapshot.cxCurApp, 2)}`,
    `raw=[${snapshot.raw}]`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return boot;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function makeSentinelError(termination, pc) {
  const error = new Error('__SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xffffff;
  return error;
}

function runDirect(executor, entry, options = {}) {
  const sentinelMap = options.sentinels ?? new Map();
  let steps = 0;
  let finalPc = entry & 0xffffff;
  let finalMode = 'adl';
  let termination = 'unknown';
  let loopsForced = 0;
  let missingBlockObserved = false;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced += 1;
        if (options.onLoopBreak) {
          options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
        }
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        missingBlockObserved = true;
        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
      },
      onDynamicTarget(target, mode, fromPc, step) {
        if (options.onDynamicTarget) {
          options.onDynamicTarget(target & 0xffffff, mode, fromPc & 0xffffff, (step ?? 0) + 1);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlockObserved = true;
    }

    return {
      steps,
      finalPc,
      finalMode,
      termination,
      loopsForced,
      missingBlockObserved,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        steps,
        finalPc: error.pc,
        finalMode,
        termination: error.termination,
        loopsForced,
        missingBlockObserved,
      };
    }
    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: 100000,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function seedCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, SECOND_PASS_ENTRY);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  mem[CX_PAGE_ADDR] = 0x00;
  mem[CX_PAGE_ADDR + 1] = 0x00;
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  return snapshotCxContext(mem);
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x20);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, 0x000000);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function createHitState() {
  const hits = new Map();
  for (const target of MONITORED_ADDRS) {
    hits.set(target.addr, {
      addr: target.addr,
      label: target.label,
      totalHits: 0,
      steps: [],
    });
  }
  return hits;
}

function recordHit(hits, pc, step) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.totalHits += 1;
  if (hit.steps.length < 16) hit.steps.push(step);
}

function formatHitSteps(hit) {
  if (hit.totalHits === 0) return 'not hit';
  const shown = hit.steps.join(', ');
  const suffix = hit.totalHits > hit.steps.length ? ` (+${hit.totalHits - hit.steps.length} more)` : '';
  return `${shown}${suffix}`;
}

function describeErrNo(errNo) {
  return errNo === 0x00 ? `${hex(errNo, 2)} (no error)` : hex(errNo, 2);
}

function inAllocatorRange(pc) {
  return pc >= ALLOCATOR_LOOP_START && pc <= ALLOCATOR_LOOP_END;
}

function createAllocatorState() {
  return {
    hitCount: 0,
    firstStep: null,
    lastStep: null,
    firstPc: null,
    lastPc: null,
    uniquePcs: new Set(),
  };
}

function recordAllocatorHit(state, pc, step) {
  if (!inAllocatorRange(pc)) return;
  state.hitCount += 1;
  if (state.firstStep === null) {
    state.firstStep = step;
    state.firstPc = pc;
  }
  state.lastStep = step;
  state.lastPc = pc;
  state.uniquePcs.add(pc);
}

function finalizeAllocatorState(state, run) {
  const reached = state.hitCount > 0;
  const uniquePcCount = state.uniquePcs.size;
  const finalPcInRange = inAllocatorRange(run.finalPc);
  const stepsAfterLastHit = reached && state.lastStep !== null ? Math.max(0, run.steps - state.lastStep) : 0;
  const escapedRange = reached && !finalPcInRange && stepsAfterLastHit > 0;
  const terminatedInLoop = reached && finalPcInRange && run.termination === 'max_steps';
  return {
    reached,
    hitCount: state.hitCount,
    firstStep: state.firstStep,
    lastStep: state.lastStep,
    firstPc: state.firstPc,
    lastPc: state.lastPc,
    uniquePcCount,
    finalPcInRange,
    stepsAfterLastHit,
    escapedRange,
    terminatedInLoop,
  };
}

function getHit(hits, addr) {
  return hits.get(addr) ?? { totalHits: 0, steps: [] };
}

function wasHit(hits, addr) {
  return getHit(hits, addr).totalHits > 0;
}

function firstHitStep(hits, addr) {
  const hit = getHit(hits, addr);
  return hit.steps.length > 0 ? hit.steps[0] : null;
}

function stepDelta(hits, fromAddr, toAddr) {
  const fromStep = firstHitStep(hits, fromAddr);
  const toStep = firstHitStep(hits, toAddr);
  if (fromStep === null || toStep === null) return null;
  return toStep - fromStep;
}

function scenarioProgressScore(scenario) {
  let score = 0;
  if (wasHit(scenario.hits, 0x0921cb)) score = 1;
  if (wasHit(scenario.hits, 0x05862f)) score = 2;
  if (wasHit(scenario.hits, 0x0973c8)) score = 3;
  if (wasHit(scenario.hits, 0x099914)) score = 4;
  return (score * 1000000) + (scenario.run.steps ?? 0);
}

function summarizeScenario(scenario) {
  const reached0921cb = wasHit(scenario.hits, 0x0921cb);
  const reached05862f = wasHit(scenario.hits, 0x05862f);
  const reachedEnterPath = wasHit(scenario.hits, 0x0973c8);
  const reachedParseInp = wasHit(scenario.hits, 0x099914);
  const delta = stepDelta(scenario.hits, 0x0921cb, 0x05862f);
  const parts = [];

  if (!reached0921cb) {
    parts.push('0x0921CB was not reached.');
  } else if (!reached05862f) {
    parts.push('0x0921CB was reached but 0x05862F was not, so the helper did not return within the budget.');
  } else if (delta === 0) {
    parts.push('0x0921CB and 0x05862F were both hit in the same block-step bucket.');
  } else {
    parts.push(`0x0921CB returned to 0x05862F after ${delta} block(s).`);
  }

  if (reachedParseInp) {
    parts.push('ParseInp was reached.');
  } else if (reachedEnterPath) {
    parts.push('The run reached 0x0973C8 but not ParseInp.');
  } else {
    parts.push('Neither 0x0973C8 nor ParseInp was reached.');
  }

  if (!scenario.allocator.reached) {
    parts.push('The tracked 0x0827xx allocator band was never entered.');
  } else if (scenario.allocator.escapedRange) {
    parts.push(`Execution left the 0x0827xx allocator band ${scenario.allocator.stepsAfterLastHit} step(s) before termination.`);
  } else if (scenario.allocator.terminatedInLoop) {
    parts.push('The run terminated at the 500K budget while still inside the 0x0827xx allocator band.');
  } else if (scenario.allocator.finalPcInRange) {
    parts.push('Final PC remained inside the 0x0827xx allocator band.');
  } else {
    parts.push('Allocator activity was observed, but the run state does not prove that the band fully drained.');
  }

  return parts.join(' ');
}

function comparisonConclusion(scenarios) {
  const scenarioA = scenarios.find((scenario) => scenario.id === 'A');
  const scenarioB = scenarios.find((scenario) => scenario.id === 'B');
  const furthest = [...scenarios].sort((a, b) => scenarioProgressScore(b) - scenarioProgressScore(a))[0];

  const aReturned = scenarioA ? wasHit(scenarioA.hits, 0x05862f) : false;
  const bReturned = scenarioB ? wasHit(scenarioB.hits, 0x05862f) : false;
  const aParse = scenarioA ? wasHit(scenarioA.hits, 0x099914) : false;
  const bParse = scenarioB ? wasHit(scenarioB.hits, 0x099914) : false;
  const aEnter = scenarioA ? wasHit(scenarioA.hits, 0x0973c8) : false;
  const bEnter = scenarioB ? wasHit(scenarioB.hits, 0x0973c8) : false;

  if (scenarioA && scenarioB) {
    if (!aReturned && bReturned) {
      return 'Scenario B is the clearest sign that forcing 0xD01D0B to 0x00 changes control flow: 0x0921CB returned to 0x05862F there, but not in Scenario A.';
    }
    if (!aParse && bParse) {
      return 'Scenario B progressed further than Scenario A by reaching ParseInp after forcing 0xD01D0B to 0x00.';
    }
    if (!aEnter && bEnter) {
      return 'Scenario B reached the 0x0973C8 ENTER path while Scenario A did not, which points to the D01D0B seed as the differentiator.';
    }
    if (aReturned && bReturned && aParse === bParse && aEnter === bEnter) {
      return 'Both scenarios advanced through the same monitored milestones, so forcing 0xD01D0B to 0x00 did not materially change the observed path within 500K steps.';
    }
  }

  return `${furthest.title} progressed furthest under the monitored milestones.`;
}

function formatBool(value) {
  return value ? 'true' : 'false';
}

function writeReport(details) {
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Setup',
    '',
    `- Entry: \`${hex(SECOND_PASS_ENTRY)}\` direct (not CoorMon), budget \`${SECOND_PASS_BUDGET}\` steps per scenario`,
    `- Shared seed: cold boot, kernel init, post-init, MEM_INIT, full session-98 cx seed, tokenized \`2+3\` at \`${hex(USERMEM_ADDR)}\`, begPC/curPC/endPC seeded, error frame seeded with \`${hex(FAKE_RET)}\``,
    `- cxCurApp handling: seed the full session-98 cx table with \`${hex(HOME_SCREEN_APP_ID, 2)}\`, then force the live second-pass byte to \`${hex(SECOND_PASS_CX_CUR_APP, 2)}\` before dispatch`,
    `- Registers before dispatch: \`A=${hex(K_ENTER, 2)}\`, \`B=${hex(K_ENTER, 2)}\`, \`IY=${hex(IY_ADDR)}\`, \`IX=${hex(IX_ADDR)}\``,
    `- Token buffer bytes: \`${hexArray(INPUT_TOKENS)}\``,
    '',
    '## Scenario Comparison',
    '',
    '| Scenario | D01D0B before -> after | Termination | Steps | Final PC | 0x0921CB | 0x05862F | 0x0973C8 | 0x099914 | 0x0827xx allocator | errNo |',
    '| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const scenario of details.scenarios) {
    const allocatorSummary = scenario.allocator.reached
      ? `${scenario.allocator.uniquePcCount} pcs / ${scenario.allocator.finalPcInRange ? 'in-range' : 'escaped'}`
      : 'not hit';
    lines.push(
      `| ${scenario.id} | \`${hex(scenario.d01d0bBefore, 2)} -> ${hex(scenario.d01d0bAfter, 2)}\` | \`${scenario.run.termination}\` | ${scenario.run.steps} | \`${hex(scenario.run.finalPc)}\` | \`${formatBool(wasHit(scenario.hits, 0x0921cb))}\` | \`${formatBool(wasHit(scenario.hits, 0x05862f))}\` | \`${formatBool(wasHit(scenario.hits, 0x0973c8))}\` | \`${formatBool(wasHit(scenario.hits, 0x099914))}\` | ${allocatorSummary} | \`${describeErrNo(scenario.errNo)}\` |`,
    );
  }

  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push(comparisonConclusion(details.scenarios));
  lines.push('');

  for (const scenario of details.scenarios) {
    const delta = stepDelta(scenario.hits, 0x0921cb, 0x05862f);
    lines.push(`## ${scenario.title}`);
    lines.push('');
    lines.push('### Setup Snapshot');
    lines.push('');
    lines.push(`- Boot: steps=\`${scenario.boot.steps ?? 'n/a'}\`, lastPc=\`${hex((scenario.boot.lastPc ?? 0) & 0xffffff)}\``);
    lines.push(`- MEM_INIT: termination=\`${scenario.memInit.termination}\`, steps=\`${scenario.memInit.steps}\`, finalPc=\`${hex(scenario.memInit.finalPc)}\``);
    lines.push(`- Post-boot pointers: ${formatPointerSnapshot(scenario.postBootPointers)}`);
    lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(scenario.postMemInitPointers)}`);
    lines.push(`- cx after full seed: ${formatCxSnapshot(scenario.cxSeedSnapshot)}`);
    lines.push(`- cx before dispatch: ${formatCxSnapshot(scenario.cxPreRunSnapshot)}`);
    lines.push(`- D01D0B before run: \`${hex(scenario.d01d0bBefore, 2)}\`${scenario.seedApplied ? ' (forced)' : ' (baseline value)'}`);
    lines.push(`- Tokens @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
    lines.push(`- begPC/curPC/endPC: \`${hex(scenario.prePointers.begPC)}\`, \`${hex(scenario.prePointers.curPC)}\`, \`${hex(scenario.prePointers.endPC)}\``);
    lines.push(`- Error frame @ \`${hex(scenario.errFrame.frameBase)}\`: [${scenario.errFrame.bytes}]`);
    lines.push('');
    lines.push('### Run Result');
    lines.push('');
    lines.push(`- Termination: \`${scenario.run.termination}\``);
    lines.push(`- Steps: \`${scenario.run.steps}\``);
    lines.push(`- Final PC: \`${hex(scenario.run.finalPc)}\``);
    lines.push(`- Final mode: \`${scenario.run.finalMode}\``);
    lines.push(`- Loops forced: \`${scenario.run.loopsForced}\``);
    lines.push(`- Missing block observed: \`${scenario.run.missingBlockObserved}\``);
    lines.push(`- 0x0921CB reached: \`${formatBool(wasHit(scenario.hits, 0x0921cb))}\``);
    lines.push(`- 0x05862F reached: \`${formatBool(wasHit(scenario.hits, 0x05862f))}\``);
    lines.push(`- 0x0921CB -> 0x05862F delta: \`${delta === null ? 'n/a' : delta}\``);
    lines.push(`- 0x0973C8 reached: \`${formatBool(wasHit(scenario.hits, 0x0973c8))}\``);
    lines.push(`- ParseInp reached: \`${formatBool(wasHit(scenario.hits, 0x099914))}\``);
    lines.push('');
    lines.push('### Monitored Address Hits');
    lines.push('');
    lines.push('| Address | Meaning | Hit Count | Step(s) |');
    lines.push('| --- | --- | ---: | --- |');
    for (const { addr } of MONITORED_ADDRS) {
      const hit = getHit(scenario.hits, addr);
      lines.push(`| \`${hex(addr)}\` | ${hit.label} | ${hit.totalHits} | ${formatHitSteps(hit)} |`);
    }
    lines.push('');
    lines.push('### Allocator Band (0x0827xx)');
    lines.push('');
    lines.push(`- Reached allocator band: \`${formatBool(scenario.allocator.reached)}\``);
    lines.push(`- Unique PCs in allocator band: \`${scenario.allocator.uniquePcCount}\``);
    lines.push(`- Allocator hit count: \`${scenario.allocator.hitCount}\``);
    lines.push(`- First allocator hit: \`${scenario.allocator.firstStep === null ? 'n/a' : `${scenario.allocator.firstStep} @ ${hex(scenario.allocator.firstPc)}`}\``);
    lines.push(`- Last allocator hit: \`${scenario.allocator.lastStep === null ? 'n/a' : `${scenario.allocator.lastStep} @ ${hex(scenario.allocator.lastPc)}`}\``);
    lines.push(`- Final PC in allocator band: \`${formatBool(scenario.allocator.finalPcInRange)}\``);
    lines.push(`- Steps after last allocator hit: \`${scenario.allocator.stepsAfterLastHit}\``);
    lines.push(`- Escaped allocator band before termination: \`${formatBool(scenario.allocator.escapedRange)}\``);
    lines.push(`- Terminated in allocator band: \`${formatBool(scenario.allocator.terminatedInLoop)}\``);
    lines.push('');
    lines.push('### Output State');
    lines.push('');
    lines.push(`- OP1 bytes @ \`${hex(OP1_ADDR)}\`: [${scenario.op1Hex}]`);
    lines.push(`- OP1 decoded: \`${String(scenario.op1Decoded)}\``);
    lines.push(`- errNo: \`${describeErrNo(scenario.errNo)}\``);
    lines.push(`- D01D0B after run: \`${hex(scenario.d01d0bAfter, 2)}\``);
    lines.push(`- Final pointer snapshot: ${formatPointerSnapshot(scenario.postPointers)}`);
    lines.push('');
    lines.push('### Analysis');
    lines.push('');
    lines.push(summarizeScenario(scenario));
    lines.push('');
  }

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function runScenario(scenario, log) {
  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  const boot = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  log(`[${scenario.id}] boot: steps=${boot.steps ?? 'n/a'} term=${boot.termination ?? 'n/a'} lastPc=${hex((boot.lastPc ?? 0) & 0xffffff)}`);
  log(`[${scenario.id}] post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  const memInit = runMemInit(runtime);
  const postMemInitPointers = snapshotPointers(mem);
  log(`[${scenario.id}] MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);
  log(`[${scenario.id}] post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  prepareCallState(cpu, mem);
  const cxSeedSnapshot = seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);

  // The 25AN brief wants the full session-98 context seed, but the live
  // second-pass cxCurApp byte should be 0x00 before dispatch.
  mem[CX_CUR_APP_ADDR] = SECOND_PASS_CX_CUR_APP;
  const cxPreRunSnapshot = snapshotCxContext(mem);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const seedApplied = scenario.seedD01D0B !== undefined;
  if (seedApplied) {
    mem[D01D0B_ADDR] = scenario.seedD01D0B & 0xff;
  }

  const d01d0bBefore = mem[D01D0B_ADDR] & 0xff;
  const prePointers = snapshotPointers(mem);
  log(`[${scenario.id}] cx seed (full): ${formatCxSnapshot(cxSeedSnapshot)}`);
  log(`[${scenario.id}] cx pre-run (second pass): ${formatCxSnapshot(cxPreRunSnapshot)}`);
  log(`[${scenario.id}] tokens @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`[${scenario.id}] pre-run pointers: ${formatPointerSnapshot(prePointers)}`);
  log(`[${scenario.id}] error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`[${scenario.id}] dispatch regs: A=${hex(cpu.a, 2)} B=${hex(cpu.b, 2)} SP=${hex(cpu.sp)}`);
  log(`[${scenario.id}] D01D0B before run: ${hex(d01d0bBefore, 2)}${seedApplied ? ' (forced)' : ''}`);

  const hits = createHitState();
  const allocatorState = createAllocatorState();

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      recordHit(hits, pc, stepNumber);
      recordAllocatorHit(allocatorState, pc, stepNumber);
    },
    onMissingBlock(pc, _mode, stepNumber) {
      recordHit(hits, pc, stepNumber);
      recordAllocatorHit(allocatorState, pc, stepNumber);
    },
  });

  const allocator = finalizeAllocatorState(allocatorState, run);
  const postPointers = snapshotPointers(mem);
  const op1Hex = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const d01d0bAfter = mem[D01D0B_ADDR] & 0xff;

  log(`[${scenario.id}] run: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  for (const { addr, label } of MONITORED_ADDRS) {
    const hit = getHit(hits, addr);
    log(`[${scenario.id}] ${hex(addr)} ${label}: count=${hit.totalHits} steps=${formatHitSteps(hit)}`);
  }
  log(
    `[${scenario.id}] allocator 0x0827xx: reached=${allocator.reached} uniquePcs=${allocator.uniquePcCount} `
    + `hitCount=${allocator.hitCount} first=${allocator.firstStep === null ? 'n/a' : `${allocator.firstStep}@${hex(allocator.firstPc)}`} `
    + `last=${allocator.lastStep === null ? 'n/a' : `${allocator.lastStep}@${hex(allocator.lastPc)}`} `
    + `escaped=${allocator.escapedRange} finalPcInRange=${allocator.finalPcInRange}`,
  );
  log(`[${scenario.id}] OP1 @ ${hex(OP1_ADDR)}: [${op1Hex}] decoded=${String(op1Decoded)}`);
  log(`[${scenario.id}] errNo=${describeErrNo(errNo)}`);
  log(`[${scenario.id}] D01D0B after run=${hex(d01d0bAfter, 2)}`);
  log(`[${scenario.id}] post-run pointers: ${formatPointerSnapshot(postPointers)}`);

  return {
    ...scenario,
    seedApplied,
    boot,
    memInit,
    postBootPointers,
    postMemInitPointers,
    cxSeedSnapshot,
    cxPreRunSnapshot,
    errFrame,
    prePointers,
    run,
    hits,
    allocator,
    postPointers,
    op1Hex,
    op1Decoded,
    errNo,
    d01d0bBefore,
    d01d0bAfter,
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AN: ENTER via 0x0585E9 with two 500K scenarios ===');
  log('');

  const scenarios = [];
  for (const scenario of SCENARIOS) {
    log(`--- ${scenario.title} ---`);
    scenarios.push(runScenario(scenario, log));
    log('');
  }

  writeReport({ scenarios, transcript });
  log(`report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}
