#!/usr/bin/env node

/**
 * Phase 25AR: re-seed allocator pointers after MEM_INIT, seed the history
 * buffer with a single "2+3" entry, and test whether ENTER reaches
 * 0x058693 -> 0x099910 -> 0x099914 (ParseInp).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ar-opbase-history-recall-report.md');
const REPORT_TITLE = 'Phase 25AR - Seed OPBase + History Recall to ParseInp';

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

const SECOND_PASS_BUDGET = 500000;
const POST_PARSEINP_STEPS = 2000;

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

// Per the task brief / session notes, use these exact slots when re-seeding.
const INSERTMEM_SCRATCH_ADDR = 0xd02577;
const OPBASE_ADDR = 0xd02590;
const PTEMP_ADDR = 0xd02593;
const OPS_ADDR = 0xd02596;
const PROGPTR_ADDR = 0xd0259c;
const NEWDATA_PTR_ADDR = 0xd025a0;

const HISTORY_MANAGER_PC = 0x0921cb;
const EMPTY_ENTER_PC = 0x058c65;
const COMMON_TAIL_PC = 0x058693;
const PARSEINP_CALL_SITE = 0x0586e3;
const TRAMPOLINE_PC = 0x099910;
const PARSEINP_PC = 0x099914;
const VAT_WALKER_LOOP_PC = 0x082745;
const ALLOCATOR_CORE_PC = 0x082754;

const TRACE_HEAD_LIMIT = 100;
const TRACE_TAIL_LIMIT = 50;

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x73, 0x3f]);

const KEY_PCS = new Map([
  [HISTORY_MANAGER_PC, 'history manager'],
  [EMPTY_ENTER_PC, 'empty ENTER path'],
  [COMMON_TAIL_PC, 'common tail'],
  [PARSEINP_CALL_SITE, 'ParseInp call site'],
  [TRAMPOLINE_PC, '0x099910 trampoline'],
  [PARSEINP_PC, 'ParseInp entry'],
  [VAT_WALKER_LOOP_PC, 'VAT walker loop'],
  [ALLOCATOR_CORE_PC, 'allocator core'],
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

function seedHistoryBuffer(mem) {
  const entrySize = INPUT_TOKENS.length;
  write16(mem, HISTORY_BUF_START, entrySize);
  mem.set(INPUT_TOKENS, HISTORY_BUF_START + 2);
  const endAddr = HISTORY_BUF_START + 2 + entrySize;
  write24(mem, HISTORY_END_PTR_ADDR, endAddr);
  mem[NUM_LAST_ENTRIES_ADDR] = 0x01;

  return {
    entryAddr: HISTORY_BUF_START,
    entrySize,
    endAddr,
    endPtrValue: endAddr,
    entryBytes: hexBytes(mem, HISTORY_BUF_START, 2 + entrySize),
    endPtrBytes: hexBytes(mem, HISTORY_END_PTR_ADDR, 3),
  };
}

function snapshotAllocatorPointers(mem) {
  return {
    opBase: read24(mem, OPBASE_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    ops: read24(mem, OPS_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    scratch: read24(mem, INSERTMEM_SCRATCH_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
  };
}

function formatAllocatorSnapshot(snapshot) {
  return [
    `OPBase=${hex(snapshot.opBase)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `OPS=${hex(snapshot.ops)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `scratch=${hex(snapshot.scratch)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
  ].join(' ');
}

function seedAllocatorPointers(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, INSERTMEM_SCRATCH_ADDR, USERMEM_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
  return snapshotAllocatorPointers(mem);
}

function createHitState() {
  const hits = new Map();
  for (const [pc, label] of KEY_PCS) {
    hits.set(pc, {
      pc,
      label,
      hitCount: 0,
      firstStep: null,
    });
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

function buildReport(details) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString());
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hexByte(K_ENTER)}\`, \`B=${hexByte(K_ENTER)}\``);
  lines.push(`- Budget: \`${SECOND_PASS_BUDGET}\` block steps, plus up to \`${POST_PARSEINP_STEPS}\` extra steps after first \`${hex(PARSEINP_PC)}\``);
  lines.push(`- MEM_INIT: \`${details.memInit.termination}\`, steps=\`${details.memInit.steps}\`, finalPc=\`${hex(details.memInit.finalPc)}\``);
  lines.push(`- Allocator re-seed: \`${formatAllocatorSnapshot(details.allocatorSeed)}\``);
  lines.push(`- History entry @ \`${hex(details.histSeed.entryAddr)}\`: [${details.histSeed.entryBytes}]`);
  lines.push(`- History end ptr @ \`${hex(HISTORY_END_PTR_ADDR)}\`: \`${hex(details.histSeed.endPtrValue)}\` [${details.histSeed.endPtrBytes}]`);
  lines.push(`- numLastEntries before run: \`${hex(details.numLastEntriesBefore, 2)} (${details.numLastEntriesBefore})\``);
  lines.push(`- Error frame @ \`${hex(details.errFrame.frameBase)}\`: [${details.errFrame.bytes}]`);
  lines.push(`- Tokenized input @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push('');
  lines.push('## Run Result');
  lines.push('');
  lines.push(`- Termination: \`${details.run.termination}\``);
  lines.push(`- Steps: \`${details.run.steps}\``);
  lines.push(`- Final PC: \`${hex(details.run.finalPc)}\``);
  lines.push(`- Final mode: \`${details.run.finalMode}\``);
  lines.push(`- Loops forced: \`${details.run.loopsForced}\``);
  lines.push(`- Missing block observed: \`${details.run.missingBlockObserved}\``);
  lines.push(`- ParseInp reached: \`${details.parseInpReached}\``);
  lines.push(`- ParseInp first step: \`${details.parseInpStep ?? 'n/a'}\``);
  lines.push(`- Post-ParseInp steps executed: \`${details.postParseInpSteps}\``);
  lines.push(`- Returned to FAKE_RET: \`${details.run.termination === 'return_hit'}\``);
  lines.push('');
  lines.push('## Key PC Hits');
  lines.push('');
  lines.push('| PC | Label | Hit? | First Step | Hit Count |');
  lines.push('|----|-------|------|------------|-----------|');
  for (const [pc] of KEY_PCS) {
    const hit = details.hits.get(pc);
    lines.push(
      `| \`${hex(pc)}\` | ${hit.label} | ${hit.hitCount > 0 ? 'YES' : 'NO'} | ${hit.firstStep ?? '-'} | ${hit.hitCount} |`,
    );
  }
  lines.push('');
  lines.push('## Output State');
  lines.push('');
  lines.push(`- OP1 bytes @ \`${hex(OP1_ADDR)}\`: [${details.op1Bytes}]`);
  lines.push(`- OP1 decoded: \`${String(details.op1Value)}\``);
  lines.push(`- errNo: \`${hexByte(details.errNo)}\``);
  lines.push(`- numLastEntries after run: \`${hex(details.numLastEntriesAfter, 2)} (${details.numLastEntriesAfter})\``);
  lines.push(`- SP: \`${hex(details.sp)}\``);
  lines.push(`- Post-run allocator pointers: \`${formatAllocatorSnapshot(details.postAllocator)}\``);
  lines.push('');
  lines.push('## First 100 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of details.traceHead) {
    lines.push(formatTraceEntry(entry));
  }
  lines.push('```');
  lines.push('');
  lines.push('## Last 50 Block PCs');
  lines.push('');
  lines.push('```text');
  for (const entry of details.traceTail) {
    lines.push(formatTraceEntry(entry));
  }
  lines.push('```');
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(errorText) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AR: Seed OPBase + history recall to ParseInp ===');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  const allocatorSeed = seedAllocatorPointers(mem);
  log(`Allocator re-seed: ${formatAllocatorSnapshot(allocatorSeed)}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  const histSeed = seedHistoryBuffer(mem);
  const numLastEntriesBefore = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;

  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`History entry @ ${hex(histSeed.entryAddr)}: [${histSeed.entryBytes}]`);
  log(`History end ptr @ ${hex(HISTORY_END_PTR_ADDR)}: [${histSeed.endPtrBytes}] = ${hex(histSeed.endPtrValue)}`);
  log(`numLastEntries before run = ${numLastEntriesBefore}`);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const hits = createHitState();
  const traceHead = [];
  const traceTail = [];
  let parseInpStep = null;

  const notePc = (pc, stepNumber) => {
    recordTrace(traceHead, traceTail, stepNumber, pc);
    recordHit(hits, pc, stepNumber);
    if (pc === PARSEINP_PC && parseInpStep === null) {
      parseInpStep = stepNumber;
    }
  };

  log('');
  log(`Running ENTER handler @ ${hex(SECOND_PASS_ENTRY)} with A=0x05, B=0x05, budget=${SECOND_PASS_BUDGET}`);
  log('');

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET + POST_PARSEINP_STEPS,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode;
      void meta;
      notePc(pc, stepNumber);

      if (parseInpStep === null) {
        if (stepNumber >= SECOND_PASS_BUDGET) {
          throw makeSentinelError('budget_hit', pc);
        }
        return;
      }

      if (stepNumber >= parseInpStep + POST_PARSEINP_STEPS) {
        throw makeSentinelError('post_parseinp_budget', pc);
      }
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      notePc(pc, stepNumber);

      if (parseInpStep === null) {
        if (stepNumber >= SECOND_PASS_BUDGET) {
          throw makeSentinelError('budget_hit', pc);
        }
        return;
      }

      if (stepNumber >= parseInpStep + POST_PARSEINP_STEPS) {
        throw makeSentinelError('post_parseinp_budget', pc);
      }
    },
  });

  const postAllocator = snapshotAllocatorPointers(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const op1Value = safeReadReal(mem, OP1_ADDR);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const numLastEntriesAfter = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;
  const sp = cpu.sp & 0xffffff;
  const parseInpReached = parseInpStep !== null;
  const postParseInpSteps = parseInpReached ? Math.max(0, run.steps - parseInpStep) : 0;

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log(`ParseInp reached: ${parseInpReached}${parseInpReached ? ` @ step ${parseInpStep}` : ''}`);
  log(`Post-ParseInp steps executed: ${postParseInpSteps}`);
  log('');

  log('=== Key PC Hits ===');
  for (const [pc] of KEY_PCS) {
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

  log('=== First 100 Block PCs ===');
  for (const entry of traceHead) {
    log(formatTraceEntry(entry));
  }
  log('');

  log('=== Last 50 Block PCs ===');
  for (const entry of traceTail) {
    log(formatTraceEntry(entry));
  }
  log('');

  writeFileSync(REPORT_PATH, buildReport({
    transcript,
    memInit,
    allocatorSeed,
    histSeed,
    errFrame,
    run,
    hits,
    parseInpReached,
    parseInpStep,
    postParseInpSteps,
    op1Bytes,
    op1Value,
    errNo,
    numLastEntriesBefore,
    numLastEntriesAfter,
    sp,
    postAllocator,
    traceHead,
    traceTail,
  }));
  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFileSync(REPORT_PATH, buildFailureReport(message));
  process.exitCode = 1;
}
