#!/usr/bin/env node

/**
 * Phase 25AR (numLastEntries=2 + direct common-tail):
 *
 * Scenario A: ENTER handler with numLastEntries=2 so after decrement (2->1),
 *             the recall check sees 1 -> recall path -> JR 0x058693 -> ParseInp.
 *             Seeds TWO history entries in the buffer.
 *
 * Scenario B: Direct call to 0x058693 (common tail) bypassing the ENTER handler
 *             entirely. Seeds "2+3\n" tokens, error frame, allocator pointers,
 *             and calls common tail directly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ar-numlast2-and-direct-report.md');
const REPORT_TITLE = 'Phase 25AR - numLastEntries=2 + Direct Common-Tail';

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
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

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

const NUM_LAST_ENTRIES_ADDR = 0xd01d0b;
const HISTORY_BUF_START = 0xd0150b;
const HISTORY_END_PTR_ADDR = 0xd01508;

const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SECOND_PASS_ENTRY = 0x0585e9;

const POP_ERROR_HANDLER = 0x061dd1;
const OP1_ADDR = 0xd005f8;

// CORRECT allocator pointer addresses from ti84pceg.inc
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;  // 4 bytes
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const INSERTMEM_SCRATCH_ADDR = 0xd02577;

// Key PCs to track
const HISTORY_MANAGER_PC = 0x0921cb;
const EMPTY_ENTER_PC = 0x058c65;
const COMMON_TAIL_PC = 0x058693;
const PARSEINP_CALL_SITE = 0x0586e3;
const TRAMPOLINE_PC = 0x099910;
const PARSEINP_PC = 0x099914;
const VAT_WALKER_LOOP_PC = 0x082745;
const ALLOCATOR_CORE_PC = 0x082754;
const FINDSYM_LOOP_PC = 0x083865;
const PARSE_HANDLER_PC = 0x082961;
const FINDSYM_PC = 0x09215e;
const MEM_CHK_PC = 0x0a27dd;

const TRACE_HEAD_LIMIT = 100;
const TRACE_TAIL_LIMIT = 50;

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x73, 0x3f]);

// ---------- Scenario A key PCs ----------
const SCENARIO_A_PCS = new Map([
  [HISTORY_MANAGER_PC, 'history manager'],
  [EMPTY_ENTER_PC, 'empty ENTER path'],
  [COMMON_TAIL_PC, 'common tail'],
  [PARSEINP_CALL_SITE, 'ParseInp call site'],
  [TRAMPOLINE_PC, '0x099910 trampoline'],
  [PARSEINP_PC, 'ParseInp entry'],
  [VAT_WALKER_LOOP_PC, 'VAT walker loop'],
]);

// ---------- Scenario B key PCs ----------
const SCENARIO_B_PCS = new Map([
  [COMMON_TAIL_PC, 'common tail'],
  [PARSEINP_CALL_SITE, 'ParseInp call site'],
  [TRAMPOLINE_PC, '0x099910 trampoline'],
  [PARSEINP_PC, 'ParseInp entry'],
  [VAT_WALKER_LOOP_PC, 'VAT walker loop'],
  [PARSE_HANDLER_PC, '0x082961 parse handler'],
  [FINDSYM_PC, '0x09215E FindSym'],
  [MEM_CHK_PC, '0x0A27DD MemChk'],
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

function write16(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
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
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
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

    return { steps, finalPc, finalMode, termination, loopsForced, missingBlockObserved };
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
  write24(mem, CX_MAIN_ADDR, HOME_SCREEN_MAIN_HANDLER);
  write24(mem, CX_PPUTAWAY_ADDR, 0x000000);
  write24(mem, CX_PUTAWAY_ADDR, 0x000000);
  write24(mem, CX_REDISP_ADDR, 0x000000);
  write24(mem, CX_ERROREP_ADDR, 0x000000);
  write24(mem, CX_SIZEWIND_ADDR, 0x000000);
  mem[CX_PAGE_ADDR] = 0x00;
  mem[CX_PAGE_ADDR + 1] = 0x00;
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x20);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, POP_ERROR_HANDLER);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function seedAllocatorPointers(mem) {
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem[PTEMPCNT_ADDR] = 0;
  mem[PTEMPCNT_ADDR + 1] = 0;
  mem[PTEMPCNT_ADDR + 2] = 0;
  mem[PTEMPCNT_ADDR + 3] = 0;
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
  write24(mem, INSERTMEM_SCRATCH_ADDR, USERMEM_ADDR);
}

function snapshotAllocatorPointers(mem) {
  return {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: ((mem[PTEMPCNT_ADDR] & 0xff) |
               ((mem[PTEMPCNT_ADDR + 1] & 0xff) << 8) |
               ((mem[PTEMPCNT_ADDR + 2] & 0xff) << 16) |
               ((mem[PTEMPCNT_ADDR + 3] & 0xff) << 24)) >>> 0,
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    scratch: read24(mem, INSERTMEM_SCRATCH_ADDR),
  };
}

function formatAllocatorSnapshot(snapshot) {
  return [
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTempCnt=${hex(snapshot.pTempCnt, 8)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `scratch=${hex(snapshot.scratch)}`,
  ].join(' ');
}

/**
 * Seed TWO history entries in the buffer.
 * Entry 1: 2-byte LE size (0x0004) at 0xD0150B, 4 bytes tokens at 0xD0150D
 * Entry 2: 2-byte LE size (0x0004) at 0xD01511, 4 bytes tokens at 0xD01513
 * End pointer at 0xD01508 = 0xD01517 (past second entry)
 * numLastEntries = 2
 */
function seedHistoryBufferTwo(mem) {
  const entrySize = INPUT_TOKENS.length; // 4

  // Entry 1 at 0xD0150B
  write16(mem, 0xd0150b, entrySize);
  mem.set(INPUT_TOKENS, 0xd0150d);

  // Entry 2 at 0xD01511
  write16(mem, 0xd01511, entrySize);
  mem.set(INPUT_TOKENS, 0xd01513);

  // End pointer past second entry = 0xD01517
  const endAddr = 0xd01517;
  write24(mem, HISTORY_END_PTR_ADDR, endAddr);

  // numLastEntries = 2
  mem[NUM_LAST_ENTRIES_ADDR] = 0x02;

  return {
    entry1Addr: 0xd0150b,
    entry2Addr: 0xd01511,
    endAddr,
    entry1Bytes: hexBytes(mem, 0xd0150b, 6),
    entry2Bytes: hexBytes(mem, 0xd01511, 6),
    endPtrBytes: hexBytes(mem, HISTORY_END_PTR_ADDR, 3),
  };
}

function createHitState(keyPcs) {
  const hits = new Map();
  for (const [pc, label] of keyPcs) {
    hits.set(pc, { pc, label, hitCount: 0, firstStep: null });
  }
  return hits;
}

function recordHit(hits, pc, stepNumber) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.hitCount += 1;
  if (hit.firstStep === null) hit.firstStep = stepNumber;
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

// ===== SCENARIO A: numLastEntries=2 + ENTER handler =====
function runScenarioA(log) {
  log('');
  log('========================================');
  log('=== SCENARIO A: numLastEntries=2 + ENTER handler ===');
  log('========================================');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  seedAllocatorPointers(mem);
  log(`Allocator re-seed (CORRECTED): ${formatAllocatorSnapshot(snapshotAllocatorPointers(mem))}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  const histSeed = seedHistoryBufferTwo(mem);
  const numLastEntriesBefore = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;

  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`History entry 1 @ ${hex(histSeed.entry1Addr)}: [${histSeed.entry1Bytes}]`);
  log(`History entry 2 @ ${hex(histSeed.entry2Addr)}: [${histSeed.entry2Bytes}]`);
  log(`History end ptr @ ${hex(HISTORY_END_PTR_ADDR)}: [${histSeed.endPtrBytes}] = ${hex(histSeed.endAddr)}`);
  log(`numLastEntries before run = ${numLastEntriesBefore}`);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const hits = createHitState(SCENARIO_A_PCS);
  const traceHead = [];
  const traceTail = [];
  const uniquePcs = new Set();
  let parseInpStep = null;

  const BUDGET_A = 500000;

  const notePc = (pc, stepNumber) => {
    recordTrace(traceHead, traceTail, stepNumber, pc);
    recordHit(hits, pc, stepNumber);
    uniquePcs.add(pc);
    if (pc === PARSEINP_PC && parseInpStep === null) {
      parseInpStep = stepNumber;
    }
  };

  log(`Running ENTER handler @ ${hex(SECOND_PASS_ENTRY)} with A=0x05, B=0x05, budget=${BUDGET_A}`);
  log('');

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: BUDGET_A,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode; void meta;
      notePc(pc, stepNumber);
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      notePc(pc, stepNumber);
    },
  });

  const postAllocator = snapshotAllocatorPointers(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const op1Value = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const numLastEntriesAfter = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;
  const sp = cpu.sp & 0xffffff;
  const parseInpReached = parseInpStep !== null;

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log(`ParseInp reached: ${parseInpReached}${parseInpReached ? ` @ step ${parseInpStep}` : ''}`);
  log(`Unique PCs: ${uniquePcs.size}`);
  log('');

  log('--- Key PC Hits (Scenario A) ---');
  for (const [pc] of SCENARIO_A_PCS) {
    const hit = hits.get(pc);
    if (hit.hitCount > 0) {
      log(`  [HIT]  ${hex(pc)} ${hit.label} @ step ${hit.firstStep} (count=${hit.hitCount})`);
    } else {
      log(`  [MISS] ${hex(pc)} ${hit.label}`);
    }
  }
  log('');

  log(`OP1 @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);
  log(`OP1 decoded: ${String(op1Value)}`);
  log(`errNo @ ${hex(ERR_NO_ADDR)}: ${hexByte(errNo)}`);
  log(`numLastEntries after run: ${numLastEntriesAfter}`);
  log(`SP: ${hex(sp)}`);
  log(`Post-run allocator: ${formatAllocatorSnapshot(postAllocator)}`);
  log('');

  log('--- First 100 Block PCs (Scenario A) ---');
  for (const entry of traceHead) {
    log(formatTraceEntry(entry));
  }
  log('');
  log('--- Last 50 Block PCs (Scenario A) ---');
  for (const entry of traceTail) {
    log(formatTraceEntry(entry));
  }
  log('');

  return {
    memInit,
    histSeed,
    errFrame,
    numLastEntriesBefore,
    run,
    hits,
    parseInpReached,
    parseInpStep,
    op1Bytes,
    op1Value,
    errNo,
    numLastEntriesAfter,
    sp,
    postAllocator,
    traceHead,
    traceTail,
    uniquePcCount: uniquePcs.size,
  };
}

// ===== SCENARIO B: Direct common-tail call =====
function runScenarioB(log) {
  log('');
  log('========================================');
  log('=== SCENARIO B: Direct common-tail call @ 0x058693 ===');
  log('========================================');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  seedAllocatorPointers(mem);
  log(`Allocator re-seed (CORRECTED): ${formatAllocatorSnapshot(snapshotAllocatorPointers(mem))}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);

  // Seed "2+3\n" tokens at userMem
  seedParserState(mem);

  // Clear OP1 to zeros
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Push FAKE_RET as return address for the common tail
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Seed error frame below that
  const errFrame = seedErrorFrame(cpu, mem);

  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`Tokenized input @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  log(`OP1 cleared: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  log(`SP=${hex(cpu.sp)}`);

  const hits = createHitState(SCENARIO_B_PCS);
  const traceHead = [];
  const traceTail = [];
  const uniquePcs = new Set();
  let parseInpStep = null;

  const BUDGET_B = 50000;

  const notePc = (pc, stepNumber) => {
    recordTrace(traceHead, traceTail, stepNumber, pc);
    recordHit(hits, pc, stepNumber);
    uniquePcs.add(pc);
    if (pc === PARSEINP_PC && parseInpStep === null) {
      parseInpStep = stepNumber;
    }
  };

  log(`Calling common tail DIRECTLY @ ${hex(COMMON_TAIL_PC)}, budget=${BUDGET_B}`);
  log('');

  const run = runDirect(executor, COMMON_TAIL_PC, {
    maxSteps: BUDGET_B,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode; void meta;
      notePc(pc, stepNumber);
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      notePc(pc, stepNumber);
    },
  });

  const postAllocator = snapshotAllocatorPointers(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const op1Value = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const sp = cpu.sp & 0xffffff;
  const parseInpReached = parseInpStep !== null;

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log(`ParseInp reached: ${parseInpReached}${parseInpReached ? ` @ step ${parseInpStep}` : ''}`);
  log(`Unique PCs: ${uniquePcs.size}`);
  log('');

  log('--- Key PC Hits (Scenario B) ---');
  for (const [pc] of SCENARIO_B_PCS) {
    const hit = hits.get(pc);
    if (hit.hitCount > 0) {
      log(`  [HIT]  ${hex(pc)} ${hit.label} @ step ${hit.firstStep} (count=${hit.hitCount})`);
    } else {
      log(`  [MISS] ${hex(pc)} ${hit.label}`);
    }
  }
  log('');

  log(`OP1 @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);
  log(`OP1 decoded: ${String(op1Value)}`);
  log(`errNo @ ${hex(ERR_NO_ADDR)}: ${hexByte(errNo)}`);
  log(`SP: ${hex(sp)}`);
  log(`Post-run allocator: ${formatAllocatorSnapshot(postAllocator)}`);
  log('');

  log('--- First 100 Block PCs (Scenario B) ---');
  for (const entry of traceHead) {
    log(formatTraceEntry(entry));
  }
  log('');
  log('--- Last 50 Block PCs (Scenario B) ---');
  for (const entry of traceTail) {
    log(formatTraceEntry(entry));
  }
  log('');

  return {
    memInit,
    errFrame,
    run,
    hits,
    parseInpReached,
    parseInpStep,
    op1Bytes,
    op1Value,
    errNo,
    sp,
    postAllocator,
    traceHead,
    traceTail,
    uniquePcCount: uniquePcs.size,
  };
}

function buildCombinedReport(transcript, resultA, resultB) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString());
  lines.push('');

  // ---- Scenario A ----
  lines.push('---');
  lines.push('');
  lines.push('## Scenario A: numLastEntries=2 + ENTER handler');
  lines.push('');
  lines.push('### Setup');
  lines.push('');
  lines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hexByte(K_ENTER)}\`, \`B=${hexByte(K_ENTER)}\``);
  lines.push(`- Budget: \`500000\` block steps`);
  lines.push(`- MEM_INIT: \`${resultA.memInit.termination}\`, steps=\`${resultA.memInit.steps}\``);
  lines.push(`- numLastEntries seeded: \`2\` (expect decrement to 1 -> recall path)`);
  lines.push(`- History entry 1 @ \`${hex(resultA.histSeed.entry1Addr)}\`: [${resultA.histSeed.entry1Bytes}]`);
  lines.push(`- History entry 2 @ \`${hex(resultA.histSeed.entry2Addr)}\`: [${resultA.histSeed.entry2Bytes}]`);
  lines.push(`- History end ptr: \`${hex(resultA.histSeed.endAddr)}\``);
  lines.push(`- Error frame @ \`${hex(resultA.errFrame.frameBase)}\`: [${resultA.errFrame.bytes}]`);
  lines.push('');
  lines.push('### Run Result');
  lines.push('');
  lines.push(`- Termination: \`${resultA.run.termination}\``);
  lines.push(`- Steps: \`${resultA.run.steps}\``);
  lines.push(`- Final PC: \`${hex(resultA.run.finalPc)}\``);
  lines.push(`- Loops forced: \`${resultA.run.loopsForced}\``);
  lines.push(`- Missing block: \`${resultA.run.missingBlockObserved}\``);
  lines.push(`- **ParseInp reached: \`${resultA.parseInpReached}\`**${resultA.parseInpReached ? ` @ step ${resultA.parseInpStep}` : ''}`);
  lines.push(`- Unique PCs: \`${resultA.uniquePcCount}\``);
  lines.push('');
  lines.push('### Key PC Hits');
  lines.push('');
  lines.push('| PC | Label | Hit? | First Step | Count |');
  lines.push('|----|-------|------|------------|-------|');
  for (const [pc] of SCENARIO_A_PCS) {
    const hit = resultA.hits.get(pc);
    lines.push(`| \`${hex(pc)}\` | ${hit.label} | ${hit.hitCount > 0 ? 'YES' : 'NO'} | ${hit.firstStep ?? '-'} | ${hit.hitCount} |`);
  }
  lines.push('');
  lines.push('### Output State');
  lines.push('');
  lines.push(`- OP1: [${resultA.op1Bytes}] = \`${String(resultA.op1Value)}\``);
  lines.push(`- errNo: \`${hexByte(resultA.errNo)}\``);
  lines.push(`- numLastEntries after: \`${resultA.numLastEntriesAfter}\``);
  lines.push(`- SP: \`${hex(resultA.sp)}\``);
  lines.push(`- Post-run allocator: \`${formatAllocatorSnapshot(resultA.postAllocator)}\``);
  lines.push('');
  lines.push('### First 100 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of resultA.traceHead) lines.push(formatTraceEntry(entry));
  lines.push('```');
  lines.push('');
  lines.push('### Last 50 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of resultA.traceTail) lines.push(formatTraceEntry(entry));
  lines.push('```');
  lines.push('');

  // ---- Scenario B ----
  lines.push('---');
  lines.push('');
  lines.push('## Scenario B: Direct common-tail call @ 0x058693');
  lines.push('');
  lines.push('### Setup');
  lines.push('');
  lines.push(`- Entry: \`${hex(COMMON_TAIL_PC)}\` (common tail, bypasses ENTER handler)`);
  lines.push(`- Budget: \`50000\` block steps`);
  lines.push(`- MEM_INIT: \`${resultB.memInit.termination}\`, steps=\`${resultB.memInit.steps}\``);
  lines.push(`- Tokens "2+3\\n" @ \`${hex(USERMEM_ADDR)}\`: [${hexArray(INPUT_TOKENS)}]`);
  lines.push(`- Error frame @ \`${hex(resultB.errFrame.frameBase)}\`: [${resultB.errFrame.bytes}]`);
  lines.push(`- FAKE_RET pushed as return address`);
  lines.push(`- OP1 cleared to zeros`);
  lines.push('');
  lines.push('### Run Result');
  lines.push('');
  lines.push(`- Termination: \`${resultB.run.termination}\``);
  lines.push(`- Steps: \`${resultB.run.steps}\``);
  lines.push(`- Final PC: \`${hex(resultB.run.finalPc)}\``);
  lines.push(`- Loops forced: \`${resultB.run.loopsForced}\``);
  lines.push(`- Missing block: \`${resultB.run.missingBlockObserved}\``);
  lines.push(`- **ParseInp reached: \`${resultB.parseInpReached}\`**${resultB.parseInpReached ? ` @ step ${resultB.parseInpStep}` : ''}`);
  lines.push(`- Unique PCs: \`${resultB.uniquePcCount}\``);
  lines.push('');
  lines.push('### Key PC Hits');
  lines.push('');
  lines.push('| PC | Label | Hit? | First Step | Count |');
  lines.push('|----|-------|------|------------|-------|');
  for (const [pc] of SCENARIO_B_PCS) {
    const hit = resultB.hits.get(pc);
    lines.push(`| \`${hex(pc)}\` | ${hit.label} | ${hit.hitCount > 0 ? 'YES' : 'NO'} | ${hit.firstStep ?? '-'} | ${hit.hitCount} |`);
  }
  lines.push('');
  lines.push('### Output State');
  lines.push('');
  lines.push(`- OP1: [${resultB.op1Bytes}] = \`${String(resultB.op1Value)}\``);
  lines.push(`- errNo: \`${hexByte(resultB.errNo)}\``);
  lines.push(`- SP: \`${hex(resultB.sp)}\``);
  lines.push(`- Post-run allocator: \`${formatAllocatorSnapshot(resultB.postAllocator)}\``);
  lines.push('');
  lines.push('### First 100 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of resultB.traceHead) lines.push(formatTraceEntry(entry));
  lines.push('```');
  lines.push('');
  lines.push('### Last 50 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of resultB.traceTail) lines.push(formatTraceEntry(entry));
  lines.push('```');
  lines.push('');

  // ---- Console transcript ----
  lines.push('---');
  lines.push('');
  lines.push('## Full Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AR: numLastEntries=2 + Direct Common-Tail ===');

  const resultA = runScenarioA(log);
  const resultB = runScenarioB(log);

  writeFileSync(REPORT_PATH, buildCombinedReport(transcript, resultA, resultB));
  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
