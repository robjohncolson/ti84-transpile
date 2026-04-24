#!/usr/bin/env node

/**
 * Phase 25AS: Pointer-watchpoint probe for ENTER handler.
 *
 * Runs the ENTER handler at 0x0585E9 block-by-block, watching OPBase,
 * pTemp, and progPtr for changes from their seeded 0xD3FFFF values.
 * Logs every change event with step number, PC, pointer name, old/new
 * values, and SP. Goal: identify exactly which call in the early chain
 * zeroes the allocator pointers.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25as-pointer-watchpoint-report.md');
const REPORT_TITLE = 'Phase 25AS - Pointer Watchpoint on ENTER Handler';

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

const WATCHPOINT_BUDGET = 50000;

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

// Allocator pointer addresses from ti84pceg.inc
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const INSERTMEM_SCRATCH_ADDR = 0xd02577;

// Known call targets in the ENTER early chain
const EARLY_CALL_TARGETS = new Map([
  [0x058d54, 'call_058D54'],
  [0x058ba3, 'call_058BA3'],
  [0x058b5c, 'call_058B5C'],
  [0x03fbf9, 'call_03FBF9'],
  [0x05840b, 'call_05840B'],
  [0x058212, 'call_058212'],
  [0x05e7d8, 'call_05E7D8'],
  [0x058693, 'common_tail'],
  [0x0586e3, 'ParseInp_call_site'],
  [0x099910, 'trampoline_099910'],
  [0x099914, 'ParseInp_entry'],
  [0x0921cb, 'history_manager'],
  [0x058c65, 'empty_ENTER_path'],
  [0x082745, 'VAT_walker_loop'],
  [0x082754, 'allocator_core'],
  [0x083865, 'FindSym_loop'],
]);

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x73, 0x3f]);

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
  ].join(' ');
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

  return snapshotAllocatorPointers(mem);
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AS: Pointer Watchpoint on ENTER Handler ===');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  const allocatorSeed = seedAllocatorPointers(mem);
  log(`Allocator re-seed (CORRECTED): ${formatAllocatorSnapshot(allocatorSeed)}`);

  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  const histSeed = seedHistoryBuffer(mem);

  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);
  log(`History seed: entry @ ${hex(histSeed.entryAddr)}: [${histSeed.entryBytes}]`);

  // Re-seed allocator pointers AFTER prepareCallState (which may clobber memory)
  seedAllocatorPointers(mem);

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  // Watched pointers: name, address, previous value
  const watchedPointers = [
    { name: 'OPBase',  addr: OPBASE_ADDR,  prev: EMPTY_VAT_ADDR },
    { name: 'OPS',     addr: OPS_ADDR,     prev: EMPTY_VAT_ADDR },
    { name: 'pTemp',   addr: PTEMP_ADDR,   prev: EMPTY_VAT_ADDR },
    { name: 'progPtr', addr: PROGPTR_ADDR,  prev: EMPTY_VAT_ADDR },
  ];

  // Change events log
  const changeEvents = [];

  // Call stack tracking: keep a rolling window of recent PCs to identify
  // which function is active when a change occurs
  const recentPcs = [];
  const RECENT_PC_WINDOW = 20;

  // Track which known call targets have been visited
  const callTargetFirstStep = new Map();

  log('');
  log(`Running ENTER handler @ ${hex(SECOND_PASS_ENTRY)} with pointer watchpoints`);
  log(`  Watching: OPBase @ ${hex(OPBASE_ADDR)}, OPS @ ${hex(OPS_ADDR)}, pTemp @ ${hex(PTEMP_ADDR)}, progPtr @ ${hex(PROGPTR_ADDR)}`);
  log(`  Seeded value: ${hex(EMPTY_VAT_ADDR)}`);
  log(`  Budget: ${WATCHPOINT_BUDGET} block steps`);
  log('');

  let totalSteps = 0;
  let finalPc = SECOND_PASS_ENTRY;
  let termination = 'unknown';
  let loopsForced = 0;
  let missingBlockObserved = false;

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: WATCHPOINT_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode;
      void meta;
      totalSteps = stepNumber;

      // Track recent PCs
      recentPcs.push(pc);
      if (recentPcs.length > RECENT_PC_WINDOW) recentPcs.shift();

      // Track known call target visits
      if (EARLY_CALL_TARGETS.has(pc) && !callTargetFirstStep.has(pc)) {
        callTargetFirstStep.set(pc, stepNumber);
      }

      // Check each watched pointer
      for (const wp of watchedPointers) {
        const current = read24(mem, wp.addr);
        if (current !== wp.prev) {
          // Find the most recent known call target in recentPcs
          let activeCall = 'unknown';
          for (let i = recentPcs.length - 1; i >= 0; i -= 1) {
            if (EARLY_CALL_TARGETS.has(recentPcs[i])) {
              activeCall = EARLY_CALL_TARGETS.get(recentPcs[i]);
              break;
            }
          }

          const event = {
            step: stepNumber,
            pc,
            pointer: wp.name,
            oldValue: wp.prev,
            newValue: current,
            sp: cpu.sp & 0xffffff,
            activeCall,
            recentPcSnapshot: recentPcs.slice(-5).map(p => hex(p)),
          };
          changeEvents.push(event);

          log(`  [CHANGE] step=${stepNumber} PC=${hex(pc)} ${wp.name}: ${hex(wp.prev)} -> ${hex(current)} SP=${hex(cpu.sp & 0xffffff)} active=${activeCall}`);

          wp.prev = current;
        }
      }
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      totalSteps = stepNumber;
      missingBlockObserved = true;
      recentPcs.push(pc);
      if (recentPcs.length > RECENT_PC_WINDOW) recentPcs.shift();

      // Check pointers on missing blocks too
      for (const wp of watchedPointers) {
        const current = read24(mem, wp.addr);
        if (current !== wp.prev) {
          let activeCall = 'unknown';
          for (let i = recentPcs.length - 1; i >= 0; i -= 1) {
            if (EARLY_CALL_TARGETS.has(recentPcs[i])) {
              activeCall = EARLY_CALL_TARGETS.get(recentPcs[i]);
              break;
            }
          }
          const event = {
            step: stepNumber,
            pc,
            pointer: wp.name,
            oldValue: wp.prev,
            newValue: current,
            sp: cpu.sp & 0xffffff,
            activeCall,
            recentPcSnapshot: recentPcs.slice(-5).map(p => hex(p)),
          };
          changeEvents.push(event);
          log(`  [CHANGE] step=${stepNumber} PC=${hex(pc)} ${wp.name}: ${hex(wp.prev)} -> ${hex(current)} SP=${hex(cpu.sp & 0xffffff)} active=${activeCall} (missing block)`);
          wp.prev = current;
        }
      }
    },
  });

  log('');
  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log('');

  // Summary of pointer final values
  const postAllocator = snapshotAllocatorPointers(mem);
  log(`Post-run allocator: ${formatAllocatorSnapshot(postAllocator)}`);
  log('');

  // Summary of change events
  log(`=== Pointer Change Events: ${changeEvents.length} total ===`);
  for (const evt of changeEvents) {
    log(`  step=${evt.step} PC=${hex(evt.pc)} ${evt.pointer}: ${hex(evt.oldValue)} -> ${hex(evt.newValue)} SP=${hex(evt.sp)} call=${evt.activeCall}`);
  }
  log('');

  // Known call target visit order
  log('=== Known Call Target Visit Order ===');
  const sortedTargets = [...callTargetFirstStep.entries()].sort((a, b) => a[1] - b[1]);
  for (const [pc, step] of sortedTargets) {
    log(`  step=${step} ${hex(pc)} ${EARLY_CALL_TARGETS.get(pc)}`);
  }
  log('');

  // Build report
  const reportLines = [];
  reportLines.push(`# ${REPORT_TITLE}`);
  reportLines.push('');
  reportLines.push('## Date');
  reportLines.push('');
  reportLines.push(new Date().toISOString());
  reportLines.push('');
  reportLines.push('## Setup');
  reportLines.push('');
  reportLines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=${hexByte(K_ENTER)}\``);
  reportLines.push(`- Budget: \`${WATCHPOINT_BUDGET}\` block steps`);
  reportLines.push(`- MEM_INIT: \`${memInit.termination}\`, steps=\`${memInit.steps}\``);
  reportLines.push(`- Allocator seed: \`${formatAllocatorSnapshot(allocatorSeed)}\``);
  reportLines.push(`- Watched pointers: OPBase @ \`${hex(OPBASE_ADDR)}\`, OPS @ \`${hex(OPS_ADDR)}\`, pTemp @ \`${hex(PTEMP_ADDR)}\`, progPtr @ \`${hex(PROGPTR_ADDR)}\``);
  reportLines.push(`- Seeded value: \`${hex(EMPTY_VAT_ADDR)}\``);
  reportLines.push('');
  reportLines.push('## Run Result');
  reportLines.push('');
  reportLines.push(`- Termination: \`${run.termination}\``);
  reportLines.push(`- Steps: \`${run.steps}\``);
  reportLines.push(`- Final PC: \`${hex(run.finalPc)}\``);
  reportLines.push(`- Loops forced: \`${run.loopsForced}\``);
  reportLines.push(`- Missing block observed: \`${run.missingBlockObserved}\``);
  reportLines.push('');
  reportLines.push('## Post-Run Allocator State');
  reportLines.push('');
  reportLines.push(`\`${formatAllocatorSnapshot(postAllocator)}\``);
  reportLines.push('');
  reportLines.push('## Pointer Change Events');
  reportLines.push('');
  if (changeEvents.length === 0) {
    reportLines.push('No pointer changes detected within the budget.');
  } else {
    reportLines.push(`Total change events: **${changeEvents.length}**`);
    reportLines.push('');
    reportLines.push('| # | Step | PC | Pointer | Old Value | New Value | SP | Active Call | Recent PCs |');
    reportLines.push('|---|------|----|---------|-----------|-----------|----|------------|------------|');
    for (let i = 0; i < changeEvents.length; i += 1) {
      const evt = changeEvents[i];
      reportLines.push(`| ${i + 1} | ${evt.step} | \`${hex(evt.pc)}\` | ${evt.pointer} | \`${hex(evt.oldValue)}\` | \`${hex(evt.newValue)}\` | \`${hex(evt.sp)}\` | ${evt.activeCall} | ${evt.recentPcSnapshot.join(', ')} |`);
    }
  }
  reportLines.push('');
  reportLines.push('## Known Call Target Visit Order');
  reportLines.push('');
  reportLines.push('| Step | PC | Label |');
  reportLines.push('|------|----|-------|');
  for (const [pc, step] of sortedTargets) {
    reportLines.push(`| ${step} | \`${hex(pc)}\` | ${EARLY_CALL_TARGETS.get(pc)} |`);
  }
  reportLines.push('');
  reportLines.push('## Analysis');
  reportLines.push('');

  // Determine which call is the primary zeroing culprit
  const zeroingEvents = changeEvents.filter(e => e.newValue === 0);
  const nonZeroChanges = changeEvents.filter(e => e.newValue !== 0);

  if (zeroingEvents.length > 0) {
    const culprits = new Map();
    for (const evt of zeroingEvents) {
      const key = evt.activeCall;
      if (!culprits.has(key)) culprits.set(key, []);
      culprits.get(key).push(evt);
    }

    reportLines.push('### Zeroing Events by Active Call');
    reportLines.push('');
    for (const [call, events] of culprits) {
      reportLines.push(`**${call}**: zeroed ${events.map(e => e.pointer).join(', ')} at step(s) ${events.map(e => e.step).join(', ')}`);
      reportLines.push('');
    }
  } else {
    reportLines.push('No pointers were zeroed within the budget.');
    reportLines.push('');
  }

  if (nonZeroChanges.length > 0) {
    reportLines.push('### Non-Zero Changes');
    reportLines.push('');
    for (const evt of nonZeroChanges) {
      reportLines.push(`- step ${evt.step}: ${evt.pointer} changed to \`${hex(evt.newValue)}\` at PC \`${hex(evt.pc)}\` (active: ${evt.activeCall})`);
    }
    reportLines.push('');
  }

  reportLines.push('## Conclusion');
  reportLines.push('');
  if (zeroingEvents.length > 0) {
    const primaryCulprit = zeroingEvents[0].activeCall;
    const firstZeroStep = zeroingEvents[0].step;
    const firstZeroPc = hex(zeroingEvents[0].pc);
    reportLines.push(`The primary zeroing culprit is **${primaryCulprit}** — first zeroing event at step ${firstZeroStep} (PC \`${firstZeroPc}\`).`);
    reportLines.push(`Pointer(s) zeroed: ${[...new Set(zeroingEvents.map(e => e.pointer))].join(', ')}.`);
  } else if (changeEvents.length > 0) {
    reportLines.push(`Pointers changed but were not zeroed. First change at step ${changeEvents[0].step} by ${changeEvents[0].activeCall}.`);
  } else {
    reportLines.push('No pointer changes detected. The pointers may be zeroed after the budget limit or through a mechanism not captured by block-level watchpoints.');
  }
  reportLines.push('');

  reportLines.push('## Console Output');
  reportLines.push('');
  reportLines.push('```text');
  reportLines.push(...transcript);
  reportLines.push('```');

  writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n');
  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n## Error\n\n\`\`\`text\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
