#!/usr/bin/env node

/**
 * Phase 25AP: trace the empty-ENTER return path into the 0x0827xx allocator band.
 *
 * Setup:
 *   cold boot -> MEM_INIT
 *   seed cxMain=0x058241 and cxCurApp=0x40
 *   seed tokenized "2+3" at userMem
 *   seed the error frame
 *   call 0x0585E9 directly with A/B=0x05 (kEnter)
 *
 * Output:
 *   - first 200 executed instruction PCs
 *   - stack snapshots before CALL 0x0921CB, at the empty-enter RET, and at
 *     the first allocator-band instruction
 *   - RET target for the 0x058C82 RET
 *   - first 30 instructions after that RET
 *   - first 10 unique PCs after the RET target
 *   - allocator entry predecessor
 *   - static loop-condition notes pulled from ROM.transpiled.js block metadata
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ap-allocator-after-enter-report.md');
const REPORT_TITLE = 'Phase 25AP - Allocator Trace After Empty ENTER Return';

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
const DEFAULT_MAX_LOOP_ITER = 8192;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;

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

const D01D0B_ADDR = 0xd01d0b;
const IY_PLUS_68_ADDR = IY_ADDR + 68;

const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const FAKE_RET = 0xfffffe;

const HISTORY_CALL_PC = 0x05862b;
const EMPTY_ENTER_ENTRY = 0x058c65;
const EMPTY_ENTER_RET_PC = 0x058c82;

const ALLOCATOR_RANGE_START = 0x082700;
const ALLOCATOR_RANGE_END = 0x0827ff;
const LOOP_ENTRY_PC = 0x082754;
const LOOP_EXIT_COND_PC = 0x082798;
const LOOP_BACKEDGE_PC = 0x082799;
const LOOP_FLAG_SOURCE_PC = 0x0821b2;

const FIRST_TRACE_COUNT = 200;
const POST_RET_TRACE_COUNT = 30;
const POST_RET_UNIQUE_COUNT = 10;
const TRACE_CAPTURE_LIMIT = 4096;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

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

function inAllocatorRange(pc) {
  return pc >= ALLOCATOR_RANGE_START && pc <= ALLOCATOR_RANGE_END;
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
  write24(mem, frameBase + 3, 0x000000);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function snapshotStack(mem, cpu, label, entry) {
  const sp = cpu.sp & 0xffffff;
  return {
    label,
    instructionIndex: entry?.idx ?? null,
    instructionPc: entry?.pc ?? null,
    blockPc: entry?.blockPc ?? null,
    blockStep: entry?.blockStep ?? null,
    sp,
    topBytes: hexBytes(mem, sp, 6),
    word0: read24(mem, sp),
    word1: read24(mem, sp + 3),
  };
}

function formatStackSnapshot(snapshot) {
  return [
    `${snapshot.label}:`,
    `  instruction=${snapshot.instructionIndex ?? 'n/a'} pc=${hex(snapshot.instructionPc)} block=${hex(snapshot.blockPc)} step=${snapshot.blockStep ?? 'n/a'}`,
    `  SP=${hex(snapshot.sp)} top6=[${snapshot.topBytes}]`,
    `  word0=${hex(snapshot.word0)} word1=${hex(snapshot.word1)}`,
  ].join('\n');
}

function formatInstruction(entry, marks = '') {
  const suffix = marks ? ` ${marks}` : '';
  return `${String(entry.idx).padStart(4, '0')}: ${hex(entry.pc)}  ${entry.dasm}${suffix}`;
}

function writeReport(details) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString());
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hex(K_ENTER, 2)}\`, \`B=${hex(K_ENTER, 2)}\``);
  lines.push(`- MEM_INIT: \`${details.memInit.termination}\`, steps=\`${details.memInit.steps}\`, finalPc=\`${hex(details.memInit.finalPc)}\``);
  lines.push(`- cxMain: \`${hex(HOME_SCREEN_MAIN_HANDLER)}\``);
  lines.push(`- cxCurApp: \`${hex(HOME_SCREEN_APP_ID, 2)}\``);
  lines.push(`- userMem tokens @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push(`- error frame @ \`${hex(details.errFrame.frameBase)}\`: [${details.errFrame.bytes}]`);
  lines.push(`- D01D0B before run: \`${hex(details.numLastEntriesBefore, 2)}\``);
  lines.push(`- IY+68 before run: \`${hex(details.iyPlus68Before, 2)}\``);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  lines.push(`- RET target at \`${hex(EMPTY_ENTER_RET_PC)}\`: \`${hex(details.retTarget)}\``);
  if (details.firstInstructionAfterRet) {
    lines.push(`- First instruction after RET: \`${hex(details.firstInstructionAfterRet.pc)}\` (\`${details.firstInstructionAfterRet.dasm}\`)`);
  }
  if (details.firstAllocator) {
    lines.push(`- First allocator-band instruction: \`${hex(details.firstAllocator.pc)}\` at instruction ${details.firstAllocator.idx}`);
    lines.push(`- Allocator entered from: \`${hex(details.firstAllocator.fromPc)}\` (\`${details.firstAllocator.fromDasm}\`)`);
  } else {
    lines.push('- Allocator-band instruction was not reached before the trace stopped.');
  }
  lines.push('');
  lines.push('## Static Loop Notes');
  lines.push('');
  lines.push(`- \`${hex(LOOP_FLAG_SOURCE_PC)}\` is \`or a ; ret z\`, so the NZ path at \`${hex(LOOP_ENTRY_PC)}\` is effectively "A != 0".`);
  lines.push(`- \`${hex(LOOP_ENTRY_PC)}\` is \`jr nz, 0x082774\`; it chooses the fast side of the allocator prep when NZ is set.`);
  lines.push(`- The actual back-edge is \`${hex(LOOP_BACKEDGE_PC)} -> jp 0x082745\`.`);
  lines.push(`- The actual exit test is \`${hex(LOOP_EXIT_COND_PC)}\` (\`ret c\`): carry set returns and exits; carry clear falls through to the back-edge.`);
  lines.push('');
  lines.push('## Key Stack Snapshots');
  lines.push('');
  if (details.beforeHistoryCall) {
    lines.push('```text');
    lines.push(formatStackSnapshot(details.beforeHistoryCall));
    lines.push('```');
  }
  if (details.retSnapshot) {
    lines.push('```text');
    lines.push(formatStackSnapshot(details.retSnapshot));
    lines.push('```');
  }
  if (details.firstAllocator?.stack) {
    lines.push('```text');
    lines.push(formatStackSnapshot(details.firstAllocator.stack));
    lines.push('```');
  }
  lines.push('');
  lines.push('## First 200 Instructions');
  lines.push('');
  lines.push('```text');
  for (const entry of details.firstTrace) {
    const marks = [];
    if (entry.pc === EMPTY_ENTER_ENTRY) marks.push('[empty-enter]');
    if (entry.pc === EMPTY_ENTER_RET_PC) marks.push('[ret]');
    if (details.firstInstructionAfterRet && entry.idx === details.firstInstructionAfterRet.idx) marks.push('[ret-target]');
    if (details.firstAllocator && entry.idx === details.firstAllocator.idx) marks.push('[allocator-entry]');
    lines.push(formatInstruction(entry, marks.join(' ')));
  }
  lines.push('```');
  lines.push('');
  lines.push('## Instructions After RET');
  lines.push('');
  lines.push('```text');
  for (const entry of details.postRetTrace) {
    const marks = [];
    if (details.firstInstructionAfterRet && entry.idx === details.firstInstructionAfterRet.idx) marks.push('[ret-target]');
    if (details.firstAllocator && entry.idx === details.firstAllocator.idx) marks.push('[allocator-entry]');
    lines.push(formatInstruction(entry, marks.join(' ')));
  }
  lines.push('```');
  lines.push('');
  lines.push('## First 10 Unique PCs After RET Target');
  lines.push('');
  for (const entry of details.postRetUnique) {
    lines.push(`- ${hex(entry.pc)} (${entry.dasm})`);
  }
  lines.push('');
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

function analyzeEnter(runtime) {
  const { mem, cpu, executor } = runtime;

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const numLastEntriesBefore = mem[D01D0B_ADDR] & 0xff;
  const iyPlus68Before = mem[IY_PLUS_68_ADDR] & 0xff;

  const trace = [];
  let instructionCount = 0;
  let lastInstruction = null;
  let beforeHistoryCall = null;
  let retSnapshot = null;
  let retTarget = null;
  let retInstructionIndex = null;
  let firstInstructionAfterRet = null;
  let firstAllocator = null;
  const postRetUnique = [];
  const postRetSeen = new Set();
  let pendingStop = false;

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, meta, stepNumber) {
      if (pendingStop) throw makeSentinelError('trace_complete', pc);

      const instructions = meta?.instructions ?? [{ pc, dasm: '(unknown)' }];
      for (const inst of instructions) {
        instructionCount += 1;
        const entry = {
          idx: instructionCount,
          pc: inst.pc & 0xffffff,
          dasm: inst.dasm ?? '(unknown)',
          blockPc: pc & 0xffffff,
          blockStep: stepNumber,
        };

        if (trace.length < TRACE_CAPTURE_LIMIT) trace.push(entry);

        if (beforeHistoryCall === null && entry.pc === HISTORY_CALL_PC) {
          beforeHistoryCall = snapshotStack(mem, cpu, 'STACK before CALL 0x0921CB', entry);
        }

        if (retSnapshot === null && entry.pc === EMPTY_ENTER_RET_PC) {
          retSnapshot = snapshotStack(mem, cpu, 'STACK at empty-enter RET 0x058C82', entry);
          retTarget = read24(mem, cpu.sp);
          retInstructionIndex = entry.idx;
        } else if (retInstructionIndex !== null && entry.idx > retInstructionIndex) {
          if (firstInstructionAfterRet === null) firstInstructionAfterRet = entry;
          if (!postRetSeen.has(entry.pc) && postRetUnique.length < POST_RET_UNIQUE_COUNT) {
            postRetSeen.add(entry.pc);
            postRetUnique.push(entry);
          }
        }

        if (retInstructionIndex !== null && firstAllocator === null && inAllocatorRange(entry.pc)) {
          firstAllocator = {
            ...entry,
            fromPc: lastInstruction?.pc ?? null,
            fromDasm: lastInstruction?.dasm ?? null,
            fromBlockPc: lastInstruction?.blockPc ?? null,
            stack: snapshotStack(mem, cpu, 'STACK at first allocator-band instruction', entry),
          };
        }

        lastInstruction = entry;
      }

      if (
        retInstructionIndex !== null
        && firstAllocator !== null
        && instructionCount >= Math.max(FIRST_TRACE_COUNT, retInstructionIndex + POST_RET_TRACE_COUNT)
        && instructionCount >= firstAllocator.idx + 20
      ) {
        pendingStop = true;
      }
    },
  });

  const firstTrace = trace.slice(0, FIRST_TRACE_COUNT);
  const postRetTrace = retInstructionIndex === null
    ? []
    : trace.filter((entry) => entry.idx > retInstructionIndex).slice(0, POST_RET_TRACE_COUNT);

  return {
    run,
    errFrame,
    numLastEntriesBefore,
    iyPlus68Before,
    beforeHistoryCall,
    retSnapshot,
    retTarget,
    firstInstructionAfterRet,
    firstAllocator,
    firstTrace,
    postRetTrace,
    postRetUnique,
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AP: allocator trace after empty ENTER return ===');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  const boot = coldBoot(executor, cpu, mem);
  log(`boot: steps=${boot.steps ?? 'n/a'} term=${boot.termination ?? 'n/a'} lastPc=${hex((boot.lastPc ?? 0) & 0xffffff)}`);

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  const details = analyzeEnter(runtime);

  log(`entry=${hex(SECOND_PASS_ENTRY)} A=${hex(K_ENTER, 2)} B=${hex(K_ENTER, 2)}`);
  log(`cxMain=${hex(HOME_SCREEN_MAIN_HANDLER)} cxCurApp=${hex(HOME_SCREEN_APP_ID, 2)}`);
  log(`tokens @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`error frame @ ${hex(details.errFrame.frameBase)}: [${details.errFrame.bytes}]`);
  log(`D01D0B before run=${hex(details.numLastEntriesBefore, 2)} IY+68 before run=${hex(details.iyPlus68Before, 2)}`);
  log(`run: term=${details.run.termination} steps=${details.run.steps} finalPc=${hex(details.run.finalPc)} loopsForced=${details.run.loopsForced}`);
  log('');
  log('=== First 200 Instruction PCs ===');
  for (const entry of details.firstTrace) {
    const marks = [];
    if (entry.pc === EMPTY_ENTER_ENTRY) marks.push('[empty-enter]');
    if (entry.pc === EMPTY_ENTER_RET_PC) marks.push('[ret]');
    if (details.firstInstructionAfterRet && entry.idx === details.firstInstructionAfterRet.idx) marks.push('[ret-target]');
    if (details.firstAllocator && entry.idx === details.firstAllocator.idx) marks.push('[allocator-entry]');
    log(formatInstruction(entry, marks.join(' ')));
  }
  log('');

  if (details.beforeHistoryCall) {
    log(formatStackSnapshot(details.beforeHistoryCall));
    log('');
  }

  if (details.retSnapshot) {
    log(formatStackSnapshot(details.retSnapshot));
    log(`RET TARGET: ${hex(details.retTarget)}`);
    log('');
  } else {
    log('RET TARGET: not observed');
    log('');
  }

  log('=== First 30 Instructions After RET ===');
  for (const entry of details.postRetTrace) {
    const marks = [];
    if (details.firstInstructionAfterRet && entry.idx === details.firstInstructionAfterRet.idx) marks.push('[ret-target]');
    if (details.firstAllocator && entry.idx === details.firstAllocator.idx) marks.push('[allocator-entry]');
    log(formatInstruction(entry, marks.join(' ')));
  }
  log('');

  log('=== First 10 Unique PCs After RET Target ===');
  for (const entry of details.postRetUnique) {
    log(`${hex(entry.pc)}  ${entry.dasm}`);
  }
  log('');

  if (details.firstAllocator) {
    log(formatStackSnapshot(details.firstAllocator.stack));
    log(`ALLOCATOR ENTRY: ${hex(details.firstAllocator.fromPc)} -> ${hex(details.firstAllocator.pc)}`);
    log(`ALLOCATOR FROM DASM: ${details.firstAllocator.fromDasm ?? 'n/a'}`);
    log('');
  } else {
    log('ALLOCATOR ENTRY: not observed');
    log('');
  }

  log('=== Static Loop Notes ===');
  log(`${hex(LOOP_FLAG_SOURCE_PC)}: or a ; ret z`);
  log(`${hex(LOOP_ENTRY_PC)}: jr nz, 0x082774  (NZ means A != 0 from ${hex(LOOP_FLAG_SOURCE_PC)})`);
  log(`${hex(LOOP_EXIT_COND_PC)}: ret c  (carry set exits)`);
  log(`${hex(LOOP_BACKEDGE_PC)}: add hl, bc ; jp 0x082745  (carry clear loops)`);

  writeReport({
    transcript,
    memInit,
    errFrame: details.errFrame,
    numLastEntriesBefore: details.numLastEntriesBefore,
    iyPlus68Before: details.iyPlus68Before,
    retTarget: details.retTarget,
    firstInstructionAfterRet: details.firstInstructionAfterRet,
    firstAllocator: details.firstAllocator,
    beforeHistoryCall: details.beforeHistoryCall,
    retSnapshot: details.retSnapshot,
    firstTrace: details.firstTrace,
    postRetTrace: details.postRetTrace,
    postRetUnique: details.postRetUnique,
  });
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}
