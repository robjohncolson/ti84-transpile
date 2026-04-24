#!/usr/bin/env node

/**
 * Phase 25AT: bypass common-tail blockers by entering after 0x09215E.
 *
 * This repo's runtime exposes createExecutor/createPeripheralBus rather than a
 * createCPU helper, so this probe follows the existing Phase 25 scaffold used
 * by the checked-in probes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25at-bypass-common-tail-report.md');
const REPORT_TITLE = 'Phase 25AT - Bypass Common Tail at 0x0586CE / 0x0586E3 / 0x099914';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_JT_SLOT = 0x020164;
const MEMINIT_BUDGET = 100000;
const MEMINIT_RET = 0xcecef6;
const FAKE_RET = 0xcecece;
const CALL_BUDGET = 50000;
const DEFAULT_MAX_LOOP_ITER = 8192;

const COMMON_TAIL_BYPASS_ENTRY = 0x0586ce;
const TRAMPOLINE_CALLSITE_ENTRY = 0x0586e3;
const PARSEINP_TRAMPOLINE = 0x099910;
const PARSEINP_ENTRY = 0x099914;
const PARSEINP_ERROR_CATCH = 0x099929;

const PRE_PARSE_CALL_082961 = 0x082961;
const PRE_PARSE_CALL_09215E = 0x09215e;
const PRE_PARSE_CALL_082902 = 0x082902;
const PRE_PARSE_CALL_0A1FD1 = 0x0a1fd1;
const PRE_PARSE_CALL_0A27DD = 0x0a27dd;
const POST_PARSE_JR_TARGET = 0x0586f3;
const POST_PARSE_CALL_05822A = 0x05822a;
const POST_PARSE_CALL_083623 = 0x083623;
const POST_PARSE_CALL_083764 = 0x083764;
const LCD_REFRESH_LOOP_PC = 0x0bd19f;
const LCD_LOOP_BAND_0A2A45 = 0x0a2a45;
const LCD_LOOP_BAND_0A2B51 = 0x0a2b51;

const PUSH_ERROR_HANDLER_ERR_STUB = 0x061dd1;
const PUSH_ERROR_HANDLER_RET_STUB = 0x061e27;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const MAIN_STACK_TOP = 0xd1a860;
const ERR_FRAME_RET_SP = 0xd1a700;

const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_FLAGS_ADDR = 0xd008af;
const ERR_FLAGS_LEN = 3;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x71, 0x3f]);
const TRACE_HEAD_LIMIT = 32;
const TRACE_TAIL_LIMIT = 24;
const RECENT_PC_LIMIT = 24;

const SCENARIOS = [
  {
    id: 'A',
    title: 'Scenario A',
    entry: COMMON_TAIL_BYPASS_ENTRY,
    description: 'Enter at 0x0586CE, past 0x09215E and the 0x0586CC JR NZ gate.',
  },
  {
    id: 'B',
    title: 'Scenario B',
    entry: TRAMPOLINE_CALLSITE_ENTRY,
    description: 'Enter at 0x0586E3 and execute the CALL 0x099910 trampoline site.',
  },
  {
    id: 'C',
    title: 'Scenario C',
    entry: PARSEINP_ENTRY,
    description: 'Direct ParseInp control at 0x099914.',
  },
];

const KEY_PCS = new Map([
  [PRE_PARSE_CALL_082961, 'pre-ParseInp call 0x082961'],
  [PRE_PARSE_CALL_09215E, 'pre-ParseInp call 0x09215E'],
  [PRE_PARSE_CALL_082902, 'pre-ParseInp call 0x082902'],
  [PRE_PARSE_CALL_0A1FD1, 'post-branch helper 0x0A1FD1'],
  [PRE_PARSE_CALL_0A27DD, 'post-branch helper 0x0A27DD'],
  [COMMON_TAIL_BYPASS_ENTRY, 'scenario-A entry 0x0586CE'],
  [TRAMPOLINE_CALLSITE_ENTRY, 'scenario-B entry 0x0586E3'],
  [PARSEINP_TRAMPOLINE, 'ParseInp trampoline 0x099910'],
  [PARSEINP_ENTRY, 'ParseInp entry 0x099914'],
  [POST_PARSE_JR_TARGET, 'post-ParseInp JR target 0x0586F3'],
  [POST_PARSE_CALL_05822A, 'post-ParseInp call 0x05822A'],
  [POST_PARSE_CALL_083623, 'post-ParseInp call 0x083623'],
  [POST_PARSE_CALL_083764, 'post-ParseInp call 0x083764'],
  [LCD_REFRESH_LOOP_PC, 'LCD refresh loop 0x0BD19F'],
  [LCD_LOOP_BAND_0A2A45, 'LCD loop band 0x0A2A45'],
  [LCD_LOOP_BAND_0A2B51, 'LCD loop band 0x0A2B51'],
  [PUSH_ERROR_HANDLER_ERR_STUB, 'PushErrorHandler error-restore stub'],
  [PUSH_ERROR_HANDLER_RET_STUB, 'PushErrorHandler normal-return stub'],
  [FAKE_RET, 'FAKE_RET sentinel'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
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
  const bytes = [];
  for (let index = 0; index < len; index += 1) {
    bytes.push((mem[(addr + index) & 0xffffff] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function memWrap(mem) {
  return {
    write8(addr, value) { mem[addr & 0xffffff] = value & 0xff; },
    read8(addr) { return mem[addr & 0xffffff] & 0xff; },
  };
}

function safeReadReal(mem, addr) {
  try {
    return readReal(memWrap(mem), addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function formatValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
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
  cpu.sp = MAIN_STACK_TOP;
  mem.fill(0xff, MAIN_STACK_TOP - 0x80, MAIN_STACK_TOP + 3);
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
  } catch (error) {
    if (error?.isSentinel) {
      termination = error.termination;
      finalPc = error.pc;
    } else {
      throw error;
    }
  }

  return {
    termination,
    steps,
    finalPc,
    finalMode,
    loopsForced,
    missingBlockObserved,
  };
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_JT_SLOT, {
    maxSteps: MEMINIT_BUDGET,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function seedAllocatorPointers(mem) {
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x80);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.fill(0x00, ERR_FLAGS_ADDR, ERR_FLAGS_ADDR + ERR_FLAGS_LEN);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedMainReturnStack(cpu, mem) {
  cpu.sp = MAIN_STACK_TOP;
  mem.fill(0x00, MAIN_STACK_TOP - 0x40, MAIN_STACK_TOP + 3);
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, FAKE_RET);
  return {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
  };
}

function seedPushErrorHandlerFrame(mem) {
  mem.fill(0x00, ERR_FRAME_RET_SP - 0x40, ERR_FRAME_RET_SP + 3);
  write24(mem, ERR_FRAME_RET_SP, FAKE_RET);

  const opsDelta = (read24(mem, OPS_ADDR) - read24(mem, OPBASE_ADDR)) & 0xffffff;
  const fpsDelta = (read24(mem, FPS_ADDR) - read24(mem, FPSBASE_ADDR)) & 0xffffff;

  let cursor = ERR_FRAME_RET_SP;
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, PARSEINP_ERROR_CATCH);
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, 0x000000);
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, fpsDelta);
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, opsDelta);
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, PUSH_ERROR_HANDLER_ERR_STUB);
  cursor = (cursor - 3) & 0xffffff;
  write24(mem, cursor, PUSH_ERROR_HANDLER_RET_STUB);

  write24(mem, ERR_SP_ADDR, cursor);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    frameBase: cursor,
    frameBytes: hexBytes(mem, cursor, 18),
    frameReturnSp: ERR_FRAME_RET_SP,
    frameReturnBytes: hexBytes(mem, ERR_FRAME_RET_SP, 3),
    opsDelta,
    fpsDelta,
    hlPayload: PARSEINP_ERROR_CATCH,
  };
}

function snapshotPointers(mem) {
  return {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errFlags: hexBytes(mem, ERR_FLAGS_ADDR, ERR_FLAGS_LEN),
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `errFlags=[${snapshot.errFlags}]`,
  ].join(' ');
}

function createHitState() {
  const hits = new Map();
  for (const [pc, label] of KEY_PCS) {
    hits.set(pc, { pc, label, hitCount: 0, firstStep: null });
  }
  return hits;
}

function recordHit(hits, pc, stepNumber) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.hitCount += 1;
  if (hit.firstStep === null) {
    hit.firstStep = stepNumber;
  }
}

function hitAt(hits, pc) {
  return hits.get(pc) ?? { pc, label: hex(pc), hitCount: 0, firstStep: null };
}

function recordTrace(head, tail, stepNumber, pc) {
  const entry = { step: stepNumber, pc };
  if (head.length < TRACE_HEAD_LIMIT) head.push(entry);
  tail.push(entry);
  if (tail.length > TRACE_TAIL_LIMIT) tail.shift();
}

function formatTraceEntry(entry) {
  return `${String(entry.step).padStart(6)}: ${hex(entry.pc)}`;
}

function summarizeHits(hits) {
  return [...hits.values()].map((hit) => ({
    pc: hit.pc,
    label: hit.label,
    hitCount: hit.hitCount,
    firstStep: hit.firstStep,
  }));
}

function determineBlocker(scenario, hits, run) {
  if (hitAt(hits, LCD_REFRESH_LOOP_PC).hitCount > 0) {
    return {
      label: '0x09215E -> 0x0BD19F LCD refresh loop',
      step: hitAt(hits, LCD_REFRESH_LOOP_PC).firstStep,
      reason: 'The known display-loop blocker was still reached.',
    };
  }

  const parseHit = hitAt(hits, PARSEINP_ENTRY).hitCount > 0;
  const trampolineHit = hitAt(hits, PARSEINP_TRAMPOLINE).hitCount > 0;

  if (scenario.id === 'A' && !parseHit) {
    if (hitAt(hits, PRE_PARSE_CALL_0A1FD1).hitCount > 0 && hitAt(hits, PRE_PARSE_CALL_0A27DD).hitCount === 0) {
      return {
        label: '0x0A1FD1',
        step: hitAt(hits, PRE_PARSE_CALL_0A1FD1).firstStep,
        reason: 'Entered 0x0A1FD1 but never reached 0x0A27DD or ParseInp.',
      };
    }
    if (hitAt(hits, PRE_PARSE_CALL_0A27DD).hitCount > 0 && !trampolineHit) {
      return {
        label: '0x0A27DD',
        step: hitAt(hits, PRE_PARSE_CALL_0A27DD).firstStep,
        reason: 'Entered 0x0A27DD but never reached the ParseInp trampoline.',
      };
    }
  }

  if (scenario.id === 'B' && !parseHit && !trampolineHit) {
    return {
      label: '0x0586E3 callsite',
      step: hitAt(hits, TRAMPOLINE_CALLSITE_ENTRY).firstStep,
      reason: 'Executed the callsite but never reached 0x099910 or 0x099914.',
    };
  }

  if (scenario.id === 'C' && !parseHit) {
    return {
      label: '0x099914 entry',
      step: hitAt(hits, PARSEINP_ENTRY).firstStep,
      reason: 'ParseInp entry itself was not observed.',
    };
  }

  if (!parseHit && run.termination === 'max_steps') {
    if (run.finalPc === LCD_LOOP_BAND_0A2A45 || run.finalPc === LCD_LOOP_BAND_0A2B51) {
      return {
        label: hex(run.finalPc),
        step: null,
        reason: 'Timed out inside the known LCD loop band.',
      };
    }
    return {
      label: hex(run.finalPc),
      step: null,
      reason: 'Timed out before ParseInp with no earlier blocker uniquely identified.',
    };
  }

  return null;
}

function runScenario(scenario) {
  const runtime = createRuntime();
  const { mem, executor, cpu } = runtime;

  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(runtime);

  if (memInit.termination !== 'return_hit') {
    throw new Error(`MEM_INIT JT slot failed for ${scenario.id}: ${memInit.termination} @ ${hex(memInit.finalPc)}`);
  }

  prepareCallState(cpu, mem);
  seedAllocatorPointers(mem);
  seedParserState(mem);
  const mainReturn = seedMainReturnStack(cpu, mem);
  const errFrame = seedPushErrorHandlerFrame(mem);
  const seededPointers = snapshotPointers(mem);

  const hits = createHitState();
  const traceHead = [];
  const traceTail = [];
  const recentPcs = [];
  const uniquePcs = new Set();

  const notePc = (pc, stepNumber) => {
    recordHit(hits, pc, stepNumber);
    recordTrace(traceHead, traceTail, stepNumber, pc);
    uniquePcs.add(pc);
    recentPcs.push(pc);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
  };

  const run = runDirect(executor, scenario.entry, {
    maxSteps: CALL_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode;
      void meta;
      notePc(pc, stepNumber);
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      notePc(pc, stepNumber);
    },
  });

  const parseHit = hitAt(hits, PARSEINP_ENTRY).hitCount > 0;
  const trampolineHit = hitAt(hits, PARSEINP_TRAMPOLINE).hitCount > 0;
  const blocker = determineBlocker(scenario, hits, run);
  const op1Decoded = safeReadReal(mem, OP1_ADDR);
  const op1Bytes = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const errFlags = hexBytes(mem, ERR_FLAGS_ADDR, ERR_FLAGS_LEN);
  const postPointers = snapshotPointers(mem);
  const iy52 = mem[IY_ADDR + 52] & 0xff;

  return {
    id: scenario.id,
    title: scenario.title,
    entry: scenario.entry,
    description: scenario.description,
    memInit,
    mainReturn,
    errFrame,
    seededPointers,
    run,
    hits: summarizeHits(hits),
    parseHit,
    trampolineHit,
    blocker,
    op1Decoded,
    op1Bytes,
    errNo,
    errFlags,
    iy52,
    postPointers,
    uniquePcCount: uniquePcs.size,
    traceHead,
    traceTail,
    recentPcs: recentPcs.map((pc) => hex(pc)),
  };
}

function formatHitFlag(hitCount) {
  return hitCount > 0 ? 'YES' : 'NO';
}

function compareScenarios(results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const scenarioA = byId.get('A');
  const scenarioB = byId.get('B');
  const scenarioC = byId.get('C');
  const lines = [];

  const bMatchesC = Boolean(
    scenarioB &&
    scenarioC &&
    scenarioB.parseHit === scenarioC.parseHit &&
    scenarioB.errNo === scenarioC.errNo &&
    scenarioB.op1Bytes === scenarioC.op1Bytes &&
    formatValue(scenarioB.op1Decoded) === formatValue(scenarioC.op1Decoded)
  );

  if (scenarioC) {
    lines.push(`- Scenario C control: ParseInp hit=\`${scenarioC.parseHit}\`, errNo=\`${hex(scenarioC.errNo, 2)}\`, errFlags=\`[${scenarioC.errFlags}]\`, OP1=${formatValue(scenarioC.op1Decoded)}.`);
  }
  if (scenarioB) {
    lines.push(`- Scenario B vs C match: \`${bMatchesC}\`.`);
  }
  if (scenarioA) {
    if (scenarioA.parseHit) {
      lines.push('- Scenario A reached ParseInp after bypassing the known 0x09215E blocker.');
    } else if (scenarioA.blocker) {
      lines.push(`- Scenario A still stalled before ParseInp at \`${scenarioA.blocker.label}\`${scenarioA.blocker.step ? ` (first hit step ${scenarioA.blocker.step})` : ''}.`);
    } else {
      lines.push(`- Scenario A did not reach ParseInp and timed out at \`${hex(scenarioA.run.finalPc)}\`.`);
    }
  }

  return lines;
}

function buildReport(results) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString());
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Cold boot -> MEM_INIT via JT slot \`${hex(MEMINIT_JT_SLOT)}\` -> per-scenario entry.`);
  lines.push(`- JT slot bytes at \`${hex(MEMINIT_JT_SLOT)}\`: \`${hexBytes(rom, MEMINIT_JT_SLOT, 4)}\` (JP stub).`);
  lines.push(`- Tokenized input @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\`.`);
  lines.push(`- Parser pointers seeded to begPC/curPC=\`${hex(USERMEM_ADDR)}\`, endPC=\`${hex(USERMEM_ADDR + INPUT_TOKENS.length)}\`.`);
  lines.push(`- Allocator pointers seeded: FPSbase/FPS=\`${hex(USERMEM_ADDR)}\`, OPBase/OPS/pTemp/progPtr=\`${hex(EMPTY_VAT_ADDR)}\`.`);
  lines.push(`- Main stack sentinel: \`${hex(FAKE_RET)}\` pushed with SP based at \`${hex(MAIN_STACK_TOP)}\`.`);
  lines.push(`- Separate PushErrorHandler-style frame built at \`${hex(ERR_FRAME_RET_SP)}\` with hlPayload=\`${hex(PARSEINP_ERROR_CATCH)}\`.`);
  lines.push(`- \`errNo\` reported from \`${hex(ERR_NO_ADDR)}\`; task-requested bytes at \`${hex(ERR_FLAGS_ADDR)}\` are also recorded as \`errFlags\`.`);
  lines.push(`- Step budget per scenario: \`${CALL_BUDGET}\`.`);
  lines.push('');
  lines.push('## Scenario Table');
  lines.push('');
  lines.push('| Scenario | Entry | Termination | Steps | Final PC | 0x099910 | 0x099914 | errNo | errFlags | OP1 decoded | Blocker |');
  lines.push('|----------|-------|-------------|-------|----------|----------|----------|-------|----------|-------------|---------|');
  for (const result of results) {
    lines.push(
      `| ${result.id} | \`${hex(result.entry)}\` | \`${result.run.termination}\` | ${result.run.steps} | \`${hex(result.run.finalPc)}\` | \`${result.trampolineHit}\` | \`${result.parseHit}\` | \`${hex(result.errNo, 2)}\` | \`[${result.errFlags}]\` | \`${formatValue(result.op1Decoded)}\` | ${result.blocker ? `\`${result.blocker.label}\`` : 'none'} |`,
    );
  }
  lines.push('');
  lines.push('## Comparison');
  lines.push('');
  lines.push(...compareScenarios(results));
  lines.push('');

  for (const result of results) {
    lines.push(`## ${result.title}`);
    lines.push('');
    lines.push(`- Entry: \`${hex(result.entry)}\`.`);
    lines.push(`- Description: ${result.description}`);
    lines.push(`- MEM_INIT: \`${result.memInit.termination}\`, steps=\`${result.memInit.steps}\`, finalPc=\`${hex(result.memInit.finalPc)}\`.`);
    lines.push(`- Seeded pointers: ${formatPointerSnapshot(result.seededPointers)}`);
    lines.push(`- Main return frame @ \`${hex(result.mainReturn.mainReturnSp)}\`: \`${result.mainReturn.mainReturnBytes}\`.`);
    lines.push(`- Error frame @ \`${hex(result.errFrame.frameBase)}\`: \`${result.errFrame.frameBytes}\`.`);
    lines.push(`- Error-frame return slot @ \`${hex(result.errFrame.frameReturnSp)}\`: \`${result.errFrame.frameReturnBytes}\`.`);
    lines.push(`- Run result: term=\`${result.run.termination}\`, steps=\`${result.run.steps}\`, finalPc=\`${hex(result.run.finalPc)}\`, loopsForced=\`${result.run.loopsForced}\`, missingBlock=\`${result.run.missingBlockObserved}\`.`);
    lines.push(`- ParseInp hit: \`${result.parseHit}\`; trampoline hit: \`${result.trampolineHit}\`.`);
    lines.push(`- IY+52 after run: \`${hexByte(result.iy52)}\`.`);
    lines.push(`- OP1 @ \`${hex(OP1_ADDR)}\`: \`${result.op1Bytes}\` -> ${formatValue(result.op1Decoded)}.`);
    lines.push(`- errNo @ \`${hex(ERR_NO_ADDR)}\`: \`${hex(result.errNo, 2)}\`.`);
    lines.push(`- errFlags @ \`${hex(ERR_FLAGS_ADDR)}\`: \`[${result.errFlags}]\`.`);
    lines.push(`- Post-run pointers: ${formatPointerSnapshot(result.postPointers)}`);
    lines.push(`- Unique PCs: \`${result.uniquePcCount}\`.`);
    if (result.blocker) {
      lines.push(`- Blocker assessment: \`${result.blocker.label}\`${result.blocker.step ? ` at step \`${result.blocker.step}\`` : ''} (${result.blocker.reason}).`);
    } else {
      lines.push('- Blocker assessment: none.');
    }
    lines.push('- Key hits:');
    for (const hit of result.hits) {
      lines.push(`  ${hex(hit.pc)} ${hit.label}: ${formatHitFlag(hit.hitCount)}${hit.firstStep !== null ? ` @ step ${hit.firstStep}` : ''}${hit.hitCount > 0 ? ` (count=${hit.hitCount})` : ''}`);
    }
    lines.push('- First trace slice:');
    for (const entry of result.traceHead) {
      lines.push(`  ${formatTraceEntry(entry)}`);
    }
    lines.push('- Tail trace slice:');
    for (const entry of result.traceTail) {
      lines.push(`  ${formatTraceEntry(entry)}`);
    }
    lines.push(`- Recent PCs: \`${result.recentPcs.join(' ')}\`.`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const results = SCENARIOS.map((scenario) => runScenario(scenario));
  const report = buildReport(results);
  writeFileSync(REPORT_PATH, report);
  process.stdout.write(report);
}

try {
  await main();
} catch (error) {
  const failure = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '```text',
    String(error?.stack || error),
    '```',
    '',
  ].join('\n');
  writeFileSync(REPORT_PATH, failure);
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
