#!/usr/bin/env node

/**
 * Phase 25AR: re-seed allocator pointers after MEM_INIT and run the home-screen
 * ENTER handler through the empty-ENTER path with numLastEntries=0.
 *
 * This probe follows the same runtime scaffold as phase25aq-history-seed:
 *   cold boot -> MEM_INIT -> allocator reseed -> cx/parser/error-frame seed
 *   -> direct call to 0x0585E9 with A/B = kEnter
 *
 * Output:
 *   - key PC hit/miss state with first-hit step numbers
 *   - OP1 / errNo / allocator pointers after the run
 *   - first 100 and last 50 block PCs
 *   - unique PC count and SP
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ar-opbase-enter-empty-report.md');
const REPORT_TITLE = 'Phase 25AR - OPBase reseed + ENTER handler (empty ENTER, numLastEntries=0)';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// Runtime constants
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

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;
const SYM_TABLE_END = 0xd3ffff;

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
const OP1_ADDR = 0xd005f8;

// Canonical allocator layout used by the ROM disassembly and existing probes.
const INSERTMEM_BOUNDARY_ADDR = 0xd02577;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SECOND_PASS_ENTRY = 0x0585e9;
const POP_ERROR_HANDLER = 0x061dd1;

const EMPTY_ENTER_PC = 0x058c65;
const EMPTY_ENTER_RET_PC = 0x058c82;
const COMMON_TAIL_PC = 0x058693;
const PARSEINP_CALL_SITE = 0x0586e3;
const PARSEINP_TRAMPOLINE_PC = 0x099910;
const PARSEINP_ENTRY_PC = 0x099914;
const VAT_WALKER_PC = 0x082745;
const HISTORY_MANAGER_PC = 0x0921cb;

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x73, 0x3f]);

const FIRST_TRACE_LIMIT = 100;
const LAST_TRACE_LIMIT = 50;

const KEY_PCS = new Map([
  [EMPTY_ENTER_PC, 'empty_ENTER_handler_0x058C65'],
  [EMPTY_ENTER_RET_PC, 'empty_ENTER_ret_0x058C82'],
  [COMMON_TAIL_PC, 'common_tail_0x058693'],
  [PARSEINP_CALL_SITE, 'ParseInp_call_site_0x0586E3'],
  [PARSEINP_TRAMPOLINE_PC, 'ParseInp_trampoline_0x099910'],
  [PARSEINP_ENTRY_PC, 'ParseInp_entry_0x099914'],
  [VAT_WALKER_PC, 'VAT_walker_loop_0x082745'],
  [HISTORY_MANAGER_PC, 'history_manager_0x0921CB'],
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
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
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

function snapshotAllocator(mem) {
  return {
    insertMemBoundary: read24(mem, INSERTMEM_BOUNDARY_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
  };
}

function formatAllocatorSnapshot(snapshot) {
  return [
    `boundary=${hex(snapshot.insertMemBoundary)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTempCnt=${hex(snapshot.pTempCnt)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
  ].join(' ');
}

function reseedAllocatorPointers(mem) {
  write24(mem, OPBASE_ADDR, SYM_TABLE_END);
  write24(mem, OPS_ADDR, SYM_TABLE_END);
  write24(mem, PTEMP_ADDR, SYM_TABLE_END);
  write24(mem, PROGPTR_ADDR, SYM_TABLE_END);
  write24(mem, INSERTMEM_BOUNDARY_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
  mem[NUM_LAST_ENTRIES_ADDR] = 0x00;
  return snapshotAllocator(mem);
}

function noteKeyHit(hitMap, pc, stepNumber) {
  if (!KEY_PCS.has(pc) || hitMap.has(pc)) return;
  hitMap.set(pc, {
    label: KEY_PCS.get(pc),
    firstStep: stepNumber,
  });
}

function createTraceState() {
  return {
    firstPcs: [],
    lastPcs: [],
    uniquePcs: new Set(),
  };
}

function noteTracePc(traceState, pc) {
  if (traceState.firstPcs.length < FIRST_TRACE_LIMIT) {
    traceState.firstPcs.push(pc);
  }
  traceState.lastPcs.push(pc);
  if (traceState.lastPcs.length > LAST_TRACE_LIMIT) {
    traceState.lastPcs.shift();
  }
  traceState.uniquePcs.add(pc);
}

function renderTraceList(lines, title, pcs) {
  lines.push(title);
  lines.push('');
  lines.push('```text');
  for (let i = 0; i < pcs.length; i += 1) {
    lines.push(`${String(i).padStart(4)}: ${hex(pcs[i])}`);
  }
  lines.push('```');
  lines.push('');
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
  lines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hexByte(K_ENTER)}\`, \`B=${hexByte(K_ENTER)}\``);
  lines.push(`- Budget: \`${SECOND_PASS_BUDGET}\` steps, maxLoopIterations=\`${DEFAULT_MAX_LOOP_ITER}\``);
  lines.push(`- MEM_INIT: \`${details.memInit.termination}\`, steps=\`${details.memInit.steps}\`, finalPc=\`${hex(details.memInit.finalPc)}\``);
  lines.push(`- Post-MEM_INIT allocator snapshot: \`${formatAllocatorSnapshot(details.postMemInitAllocator)}\``);
  lines.push(`- Reseeded allocator snapshot: \`${formatAllocatorSnapshot(details.reseedAllocator)}\``);
  lines.push(`- cxMain: \`${hex(HOME_SCREEN_MAIN_HANDLER)}\`, cxCurApp: \`${hexByte(HOME_SCREEN_APP_ID)}\``);
  lines.push(`- userMem tokens @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push(`- Error frame @ \`${hex(details.errFrame.frameBase)}\`: [${details.errFrame.bytes}]`);
  lines.push(`- numLastEntries before run: \`${hexByte(details.numLastEntriesBefore)}\``);
  lines.push('');

  lines.push('## Run Result');
  lines.push('');
  lines.push(`- Termination: \`${details.run.termination}\``);
  lines.push(`- Steps: \`${details.run.steps}\``);
  lines.push(`- Final PC: \`${hex(details.run.finalPc)}\``);
  lines.push(`- Final mode: \`${details.run.finalMode}\``);
  lines.push(`- Loops forced: \`${details.run.loopsForced}\``);
  lines.push(`- Missing block observed: \`${details.run.missingBlockObserved}\``);
  lines.push(`- Unique PC count: \`${details.traceState.uniquePcs.size}\``);
  lines.push('');

  lines.push('## Key PC Hits');
  lines.push('');
  lines.push('| PC | Label | Hit? | First Step |');
  lines.push('| --- | --- | --- | ---: |');
  for (const [pc, label] of KEY_PCS) {
    const hit = details.hitPcs.get(pc);
    if (hit) {
      lines.push(`| \`${hex(pc)}\` | ${hit.label} | YES | ${hit.firstStep} |`);
    } else {
      lines.push(`| \`${hex(pc)}\` | ${label} | NO | - |`);
    }
  }
  lines.push('');

  lines.push('## Post-Run State');
  lines.push('');
  lines.push(`- OP1 @ \`${hex(OP1_ADDR)}\`: \`[${details.op1Bytes}]\``);
  lines.push(`- errNo @ \`${hex(ERR_NO_ADDR)}\`: \`${hexByte(details.errNo)}\``);
  lines.push(`- numLastEntries after run: \`${hexByte(details.numLastEntriesAfter)}\``);
  lines.push(`- SP: \`${hex(details.sp)}\``);
  lines.push(`- Allocator snapshot after run: \`${formatAllocatorSnapshot(details.postRunAllocator)}\``);
  lines.push(`- Requested summary: \`OPBase=${hex(details.postRunAllocator.opBase)} pTemp=${hex(details.postRunAllocator.pTemp)} progPtr=${hex(details.postRunAllocator.progPtr)}\``);
  lines.push('');

  renderTraceList(lines, '## First 100 Block PCs', details.traceState.firstPcs);
  renderTraceList(lines, '## Last 50 Block PCs', details.traceState.lastPcs);

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

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AR: OPBase reseed + ENTER handler (empty ENTER, numLastEntries=0) ===');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  const postMemInitAllocator = snapshotAllocator(mem);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);
  log(`Allocator after MEM_INIT: ${formatAllocatorSnapshot(postMemInitAllocator)}`);

  const reseedAllocator = reseedAllocatorPointers(mem);
  log(`Allocator after reseed: ${formatAllocatorSnapshot(reseedAllocator)}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);

  const numLastEntriesBefore = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;
  log(`numLastEntries before run=${hexByte(numLastEntriesBefore)}`);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  const traceState = createTraceState();
  const hitPcs = new Map();

  log(`Running ENTER handler @ ${hex(SECOND_PASS_ENTRY)} with budget=${SECOND_PASS_BUDGET}`);

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: SECOND_PASS_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      noteTracePc(traceState, pc);
      noteKeyHit(hitPcs, pc, stepNumber);
    },
    onMissingBlock(pc, _mode, stepNumber) {
      noteTracePc(traceState, pc);
      noteKeyHit(hitPcs, pc, stepNumber);
    },
  });

  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const numLastEntriesAfter = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;
  const postRunAllocator = snapshotAllocator(mem);
  const sp = cpu.sp & 0xffffff;

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log('');
  log('=== Key PC Hits ===');
  for (const [pc, label] of KEY_PCS) {
    const hit = hitPcs.get(pc);
    if (hit) {
      log(`  [HIT]  ${hex(pc)} ${hit.label} @ step ${hit.firstStep}`);
    } else {
      log(`  [MISS] ${hex(pc)} ${label}`);
    }
  }
  log('');
  log(`OP1 @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);
  log(`errNo @ ${hex(ERR_NO_ADDR)}: ${hexByte(errNo)}`);
  log(`numLastEntries after run: ${hexByte(numLastEntriesAfter)}`);
  log(`Allocator after run: ${formatAllocatorSnapshot(postRunAllocator)}`);
  log(`Unique PCs: ${traceState.uniquePcs.size}`);
  log(`SP: ${hex(sp)}`);

  writeReport({
    transcript,
    memInit,
    postMemInitAllocator,
    reseedAllocator,
    errFrame,
    numLastEntriesBefore,
    run,
    hitPcs,
    traceState,
    op1Bytes,
    errNo,
    numLastEntriesAfter,
    postRunAllocator,
    sp,
  });

  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}
