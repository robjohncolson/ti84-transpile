#!/usr/bin/env node

/**
 * Phase 25AT: re-seed allocator pointers immediately after compaction zeroes
 * them on the ENTER handler's NZ path.
 *
 * The runtime in this repo exposes `createExecutor`, not `createCPU`, so this
 * probe uses a small local adapter while keeping the task's ROM-loading shape.
 *
 * High-level plan:
 *   1. Cold boot the ROM.
 *   2. Attempt the requested "full MEM_INIT" via JT slot 0x020164 first.
 *   3. Fall back to the known direct MEM_INIT entry (0x09DEE0) if that slot
 *      does not return to the sentinel within budget.
 *   4. Seed the ENTER/NZ-path environment.
 *   5. Step 0x0585E9 one lifted block at a time for up to 200K blocks.
 *   6. Whenever OPBase transitions from non-zero to zero, immediately re-seed
 *      the allocator family and continue.
 *   7. Write a markdown report with hit-state, final memory state, and the top
 *      20 most-hit PCs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25at-reseed-after-compaction-report.md');
const REPORT_TITLE = 'Phase 25AT - Reseed Allocator Pointers After Compaction';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const transpiled = await import('./ROM.transpiled.js');
const BLOCKS = transpiled.default ?? transpiled.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_COPY_LIMIT = 0x400000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_JT_SLOT = 0x020164;
const MEMINIT_FALLBACK_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;
const MEMINIT_BUDGET = 200000;

const SECOND_PASS_ENTRY = 0x0585e9;
const STEP_BUDGET = 200000;
const DEFAULT_MAX_LOOP_ITER = 8192;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const ENTER_STACK_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const FAKE_RET = 0xfffffe;
const JT_STACK_PTR_ADDR = 0xd007fa;

const OP1_ADDR = 0xd005f8;
const ERR_NO_TASK_ADDR = 0xd008af;
const ERR_NO_LATCH_ADDR = 0xd008df;
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

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;

const FORCE_NZ_ADDR = IY_ADDR + 0x44;
const FORCE_NZ_MASK = 0x20;

const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;

const COMMON_TAIL_PC = 0x058693;
const PARSEINP_CALL_SITE = 0x0586e3;
const PARSEINP_ENTRY = 0x099914;

const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x71, 0x3f]);

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
  for (let index = 0; index < len; index += 1) {
    parts.push((mem[addr + index] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (value) => (value & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function memWrap(mem) {
  return {
    read8(addr) {
      return mem[addr] & 0xff;
    },
    write8(addr, value) {
      mem[addr] = value & 0xff;
    },
  };
}

function safeReadReal(mem, addr) {
  try {
    return readReal(memWrap(mem), addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function createCPU(romBytes, blocks, options = {}) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, ROM_COPY_LIMIT));
  const peripherals = createPeripheralBus({ timerInterrupt: options.timerInterrupt ?? false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
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
  cpu.sp = STACK_RESET_TOP - 0x20;
  mem.fill(0xff, cpu.sp, cpu.sp + 0x20);
}

function prepareEnterState(cpu, mem) {
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
  cpu.sp = ENTER_STACK_ADDR;
  mem.fill(0xff, cpu.sp - 0x20, cpu.sp + 0x20);
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

function runMemInitViaJumpSlot(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.b = 0x00;

  const jtStackTop = (STACK_RESET_TOP - 0x30) & 0xffffff;
  write24(mem, JT_STACK_PTR_ADDR, jtStackTop);
  write24(mem, jtStackTop, MEMINIT_RET);
  cpu.sp = jtStackTop;

  return runDirect(executor, MEMINIT_JT_SLOT, {
    maxSteps: MEMINIT_BUDGET,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function runMemInitDirect(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_FALLBACK_ENTRY, {
    maxSteps: MEMINIT_BUDGET,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function runFullMemInit(runtime) {
  const attempts = [];

  const jtRun = runMemInitViaJumpSlot(runtime);
  attempts.push({
    label: `JT slot ${hex(MEMINIT_JT_SLOT)}`,
    entry: MEMINIT_JT_SLOT,
    ...jtRun,
  });

  if (jtRun.termination === 'return_hit') {
    return {
      attempts,
      selected: attempts[0],
    };
  }

  const directRun = runMemInitDirect(runtime);
  attempts.push({
    label: `direct entry ${hex(MEMINIT_FALLBACK_ENTRY)}`,
    entry: MEMINIT_FALLBACK_ENTRY,
    ...directRun,
  });

  return {
    attempts,
    selected: attempts[attempts.length - 1],
  };
}

function seedAllocatorPointers(mem) {
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
}

function seedCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, HOME_SCREEN_MAIN_HANDLER);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
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
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_TASK_ADDR] = 0x00;
  mem[ERR_NO_LATCH_ADDR] = 0x00;
  mem[NUM_LAST_ENTRIES_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, 0x000000);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_TASK_ADDR] = 0x00;
  mem[ERR_NO_LATCH_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function forceNzPath(mem) {
  mem[FORCE_NZ_ADDR] = (mem[FORCE_NZ_ADDR] | FORCE_NZ_MASK) & 0xff;
}

function snapshotAllocator(mem) {
  return {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
  };
}

function formatAllocator(snapshot) {
  return [
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
  ].join(' ');
}

function stepBlock(executor, pc, mode) {
  let executedPc = null;
  let executedMode = mode;

  const result = executor.runFrom(pc, mode, {
    maxSteps: 1,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    onBlock(blockPc, blockMode) {
      executedPc = blockPc & 0xffffff;
      executedMode = blockMode;
    },
  });

  return {
    executedPc,
    executedMode,
    nextPc: (result.lastPc ?? pc) & 0xffffff,
    nextMode: result.lastMode ?? mode,
    termination: result.termination ?? 'unknown',
    missingBlocks: result.missingBlocks ?? [],
  };
}

function buildTopPcList(pcHits, limit = 20) {
  return Array.from(pcHits.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0] - right[0];
    })
    .slice(0, limit)
    .map(([pc, hits]) => ({ pc, hits }));
}

function buildReport(details) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Cold boot + kernel init + post-init, then requested MEM_INIT path starting at JT slot \`${hex(MEMINIT_JT_SLOT)}\`.`);
  lines.push(`- If JT slot \`${hex(MEMINIT_JT_SLOT)}\` did not return, the probe fell back to direct MEM_INIT entry \`${hex(MEMINIT_FALLBACK_ENTRY)}\`.`);
  lines.push(`- ENTER handler executed block-by-block from \`${hex(SECOND_PASS_ENTRY)}\` with a \`${STEP_BUDGET}\` block budget.`);
  lines.push(`- Forced NZ path by setting bit 5 at \`${hex(FORCE_NZ_ADDR)}\` (\`${hexByte(details.forceNzBefore)}\` -> \`${hexByte(details.forceNzAfter)}\`).`);
  lines.push(`- Seeded allocator family to \`${hex(EMPTY_VAT_ADDR)}\`, FPSbase/FPS to \`${hex(USERMEM_ADDR)}\`, and tokenized \`2+3\` to [${hexArray(INPUT_TOKENS)}].`);
  lines.push(`- Seeded begPC/curPC/endPC to \`${hex(USERMEM_ADDR)}\`, \`${hex(USERMEM_ADDR)}\`, \`${hex(USERMEM_ADDR + INPUT_TOKENS.length)}\`.`);
  lines.push(`- Error frame @ \`${hex(details.errFrame.frameBase)}\`: [${details.errFrame.bytes}]`);
  lines.push('');
  lines.push('## MEM_INIT Attempts');
  lines.push('');
  for (const attempt of details.memInit.attempts) {
    lines.push(`- ${attempt.label}: termination=\`${attempt.termination}\`, steps=\`${attempt.steps}\`, finalPc=\`${hex(attempt.finalPc)}\``);
  }
  lines.push(`- Selected setup path: \`${details.memInit.selected.label}\``);
  lines.push('');
  lines.push('## Run Result');
  lines.push('');
  lines.push(`- Steps executed: \`${details.steps}\``);
  lines.push(`- Termination: \`${details.termination}\``);
  lines.push(`- Final PC: \`${hex(details.finalPc)}\``);
  lines.push(`- Final mode: \`${details.finalMode}\``);
  lines.push(`- Re-seed count: \`${details.reseedEvents.length}\``);
  lines.push(`- Hit common tail \`${hex(COMMON_TAIL_PC)}\`: \`${details.hits.commonTail.hit}\`${details.hits.commonTail.firstStep !== null ? ` (first at step ${details.hits.commonTail.firstStep})` : ''}`);
  lines.push(`- Hit ParseInp call site \`${hex(PARSEINP_CALL_SITE)}\`: \`${details.hits.parseCallSite.hit}\`${details.hits.parseCallSite.firstStep !== null ? ` (first at step ${details.hits.parseCallSite.firstStep})` : ''}`);
  lines.push(`- Hit ParseInp entry \`${hex(PARSEINP_ENTRY)}\`: \`${details.hits.parseInp.hit}\`${details.hits.parseInp.firstStep !== null ? ` (first at step ${details.hits.parseInp.firstStep})` : ''}`);
  lines.push('');
  lines.push('## Re-seed Events');
  lines.push('');
  lines.push('| # | Step | Block PC | Next PC | Before Step | After Zero | After Re-seed |');
  lines.push('|---|------|----------|---------|-------------|------------|---------------|');
  for (let index = 0; index < details.reseedEvents.length; index += 1) {
    const event = details.reseedEvents[index];
    lines.push(
      `| ${index + 1} | ${event.step} | \`${hex(event.blockPc)}\` | \`${hex(event.nextPc)}\` | \`${formatAllocator(event.before)}\` | \`${formatAllocator(event.afterZero)}\` | \`${formatAllocator(event.afterReseed)}\` |`,
    );
  }
  if (details.reseedEvents.length === 0) {
    lines.push('| - | - | - | - | no OPBase zero transition observed | - | - |');
  }
  lines.push('');
  lines.push('## Final State');
  lines.push('');
  lines.push(`- OP1 @ \`${hex(OP1_ADDR)}\`: [${details.op1Bytes}]`);
  lines.push(`- OP1 decoded: \`${String(details.op1Decoded)}\``);
  lines.push(`- errNo @ \`${hex(ERR_NO_TASK_ADDR)}\`: \`${hexByte(details.errNoTask)}\``);
  lines.push(`- errNo latch @ \`${hex(ERR_NO_LATCH_ADDR)}\`: \`${hexByte(details.errNoLatch)}\``);
  lines.push(`- errSP @ \`${hex(ERR_SP_ADDR)}\`: \`${hex(details.errSp)}\``);
  lines.push(`- Final allocator family: \`${formatAllocator(details.finalAllocator)}\``);
  lines.push(`- begPC/curPC/endPC: \`${hex(details.finalBegPc)}\`, \`${hex(details.finalCurPc)}\`, \`${hex(details.finalEndPc)}\``);
  lines.push('');
  lines.push('## Top 20 PCs');
  lines.push('');
  for (const entry of details.topPcs) {
    lines.push(`- \`${hex(entry.pc)}\`: ${entry.hits}`);
  }
  if (details.topPcs.length === 0) {
    lines.push('- No lifted blocks executed.');
  }
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  if (details.hits.parseInp.hit) {
    lines.push(`- Pointer re-seeding let the NZ path reach ParseInp at \`${hex(PARSEINP_ENTRY)}\`.`);
  } else if (details.hits.parseCallSite.hit) {
    lines.push(`- Pointer re-seeding advanced the NZ path to the ParseInp call site \`${hex(PARSEINP_CALL_SITE)}\`, but the direct ParseInp entry \`${hex(PARSEINP_ENTRY)}\` was not observed.`);
  } else if (details.hits.commonTail.hit) {
    lines.push(`- Pointer re-seeding advanced execution into the common tail \`${hex(COMMON_TAIL_PC)}\`, but it stalled before the ParseInp call site \`${hex(PARSEINP_CALL_SITE)}\`.`);
  } else if (details.reseedEvents.length > 0) {
    lines.push(`- The probe did re-seed after compaction, but execution still stalled before the common tail; current blocker ended at \`${hex(details.finalPc)}\` after ${details.steps} steps.`);
  } else {
    lines.push(`- No compaction-triggered OPBase zero transition was observed before termination at \`${hex(details.finalPc)}\`.`);
  }
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(errorText, transcript = []) {
  return [
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
  ].join('\n');
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AT: reseed allocator pointers after compaction ===');

  const runtime = createCPU(rom, BLOCKS, { timerInterrupt: false });
  const { mem, executor, cpu } = runtime;

  coldBoot(executor, cpu, mem);
  log('boot: completed cold-boot scaffolding');

  const memInit = runFullMemInit(runtime);
  for (const attempt of memInit.attempts) {
    log(`meminit attempt: ${attempt.label} term=${attempt.termination} steps=${attempt.steps} finalPc=${hex(attempt.finalPc)}`);
  }

  prepareEnterState(cpu, mem);
  seedAllocatorPointers(mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  const forceNzBefore = mem[FORCE_NZ_ADDR] & 0xff;
  forceNzPath(mem);
  const forceNzAfter = mem[FORCE_NZ_ADDR] & 0xff;

  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  log(`force NZ: ${hex(FORCE_NZ_ADDR)} ${hexByte(forceNzBefore)} -> ${hexByte(forceNzAfter)}`);
  log(`tokens @ ${hex(USERMEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);

  let pc = SECOND_PASS_ENTRY;
  let mode = 'adl';
  let steps = 0;
  let termination = 'budget_exhausted';
  let finalPc = pc;
  let finalMode = mode;
  let opBaseBeforeStep = read24(mem, OPBASE_ADDR);

  const pcHits = new Map();
  const reseedEvents = [];
  const hitState = {
    commonTail: { hit: false, firstStep: null },
    parseCallSite: { hit: false, firstStep: null },
    parseInp: { hit: false, firstStep: null },
  };

  for (let stepNumber = 1; stepNumber <= STEP_BUDGET; stepNumber += 1) {
    if (pc === FAKE_RET) {
      termination = 'return_hit';
      finalPc = pc;
      finalMode = mode;
      break;
    }

    const before = snapshotAllocator(mem);
    const stepResult = stepBlock(executor, pc, mode);

    if (stepResult.executedPc === null) {
      steps = stepNumber - 1;
      termination = stepResult.missingBlocks.length > 0 ? 'missing_block' : stepResult.termination;
      finalPc = stepResult.nextPc;
      finalMode = stepResult.nextMode;
      break;
    }

    steps = stepNumber;
    finalPc = stepResult.nextPc;
    finalMode = stepResult.nextMode;

    pcHits.set(stepResult.executedPc, (pcHits.get(stepResult.executedPc) ?? 0) + 1);

    if (!hitState.commonTail.hit && stepResult.executedPc === COMMON_TAIL_PC) {
      hitState.commonTail.hit = true;
      hitState.commonTail.firstStep = stepNumber;
      log(`hit common tail at step ${stepNumber}: ${hex(stepResult.executedPc)}`);
    }
    if (!hitState.parseCallSite.hit && stepResult.executedPc === PARSEINP_CALL_SITE) {
      hitState.parseCallSite.hit = true;
      hitState.parseCallSite.firstStep = stepNumber;
      log(`hit ParseInp call site at step ${stepNumber}: ${hex(stepResult.executedPc)}`);
    }
    if (!hitState.parseInp.hit && stepResult.executedPc === PARSEINP_ENTRY) {
      hitState.parseInp.hit = true;
      hitState.parseInp.firstStep = stepNumber;
      log(`hit ParseInp at step ${stepNumber}: ${hex(stepResult.executedPc)}`);
    }

    const opBaseAfterStep = read24(mem, OPBASE_ADDR);
    if (opBaseBeforeStep !== 0x000000 && opBaseAfterStep === 0x000000) {
      const afterZero = snapshotAllocator(mem);
      log(`reseed trigger at step ${stepNumber}: blockPc=${hex(stepResult.executedPc)} nextPc=${hex(stepResult.nextPc)}`);
      seedAllocatorPointers(mem);
      const afterReseed = snapshotAllocator(mem);
      reseedEvents.push({
        step: stepNumber,
        blockPc: stepResult.executedPc,
        nextPc: stepResult.nextPc,
        before,
        afterZero,
        afterReseed,
      });
    }

    opBaseBeforeStep = read24(mem, OPBASE_ADDR);
    pc = stepResult.nextPc;
    mode = stepResult.nextMode;

    if (pc === FAKE_RET) {
      termination = 'return_hit';
      finalPc = pc;
      finalMode = mode;
      break;
    }

    if (stepResult.termination !== 'max_steps') {
      termination = stepResult.termination;
      finalPc = stepResult.nextPc;
      finalMode = stepResult.nextMode;
      break;
    }
  }

  if (steps === STEP_BUDGET && termination === 'budget_exhausted') {
    finalPc = pc;
    finalMode = mode;
  }

  const topPcs = buildTopPcList(pcHits, 20);
  const finalAllocator = snapshotAllocator(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(mem, OP1_ADDR);
  const errNoTask = mem[ERR_NO_TASK_ADDR] & 0xff;
  const errNoLatch = mem[ERR_NO_LATCH_ADDR] & 0xff;
  const errSp = read24(mem, ERR_SP_ADDR);

  const report = buildReport({
    transcript,
    memInit,
    errFrame,
    forceNzBefore,
    forceNzAfter,
    steps,
    termination,
    finalPc,
    finalMode,
    reseedEvents,
    hits: hitState,
    topPcs,
    finalAllocator,
    finalBegPc: read24(mem, BEGPC_ADDR),
    finalCurPc: read24(mem, CURPC_ADDR),
    finalEndPc: read24(mem, ENDPC_ADDR),
    op1Bytes,
    op1Decoded,
    errNoTask,
    errNoLatch,
    errSp,
  });

  writeFileSync(REPORT_PATH, report);

  const summary = {
    reportPath: REPORT_PATH,
    memInit: {
      attempts: memInit.attempts.map((attempt) => ({
        label: attempt.label,
        termination: attempt.termination,
        steps: attempt.steps,
        finalPc: hex(attempt.finalPc),
      })),
      selected: memInit.selected.label,
    },
    run: {
      steps,
      termination,
      finalPc: hex(finalPc),
      finalMode,
      reseedCount: reseedEvents.length,
    },
    hits: {
      commonTail: hitState.commonTail,
      parseCallSite: hitState.parseCallSite,
      parseInp: hitState.parseInp,
    },
    op1: {
      bytes: op1Bytes,
      decoded: op1Decoded,
    },
    errNo: {
      taskAddr: hex(ERR_NO_TASK_ADDR),
      taskValue: hexByte(errNoTask),
      latchAddr: hex(ERR_NO_LATCH_ADDR),
      latchValue: hexByte(errNoLatch),
    },
    topPcs: topPcs.map((entry) => ({
      pc: hex(entry.pc),
      hits: entry.hits,
    })),
  };

  log();
  log('Summary JSON:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const text = error?.stack ?? String(error);
  console.error(text);
  writeFileSync(REPORT_PATH, `${buildFailureReport(text)}\n`);
  process.exitCode = 1;
});
