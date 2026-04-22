#!/usr/bin/env node

/**
 * Phase 25AC: Recall offset investigation probe
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. CreateReal("A") — capture DE return value
 *   3. Write 42.0 BCD to DE, DE-9, DE+9, and DE+2 (all plausible data locations)
 *   4. Dump 45-byte region [DE-18 .. DE+27] BEFORE ParseInp
 *   5. Re-seed OP1 with variable name "A", setup tokens "2+3"
 *   6. Run ParseInp at 0x099914 with 1,500,000 step budget
 *   7. Dump same 45-byte region AFTER ParseInp
 *   8. Track newDataPtr, OPBase changes during execution
 *   9. Report which 42.0 copies survived and what OP1 contains
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ac-recall-offset-report.md');
const REPORT_TITLE = 'Phase 25AC - Recall Offset Investigation: Which 42.0 Copies Survive ParseInp';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEM_INIT_ENTRY = 0x09dee0;
const CREATEREAL_ENTRY = 0x08238a;
const PARSEINP_ENTRY = 0x099914;

const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const TOKEN_BUFFER_ADDR = 0xd00800;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEM_INIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const VARIABLE_A = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const STORED_REAL_42 = Uint8Array.from([0x00, 0x81, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED_5 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEM_INIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;
const TOKEN_BUFFER_CLEAR_LEN = 0x80;
const RAM_START = 0xd00000;
const RAM_END = 0xd3ffff;
const TOLERANCE = 1e-6;

// Memory dump range: 18 bytes before DE, 27 bytes after DE (45 total)
const DUMP_BEFORE = 18;
const DUMP_AFTER = 27;
const DUMP_TOTAL = DUMP_BEFORE + DUMP_AFTER;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
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
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
  ].join(' ');
}

function signed24Delta(before, after) {
  let diff = ((after - before) & 0xffffff) >>> 0;
  if (diff & 0x800000) diff -= 0x1000000;
  return diff;
}

function formatTransition(before, after) {
  const delta = signed24Delta(before, after);
  const sign = delta >= 0 ? '+' : '';
  return `${hex(before)} -> ${hex(after)} (delta ${sign}${delta})`;
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function approxEqual(a, b) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
}

function sameBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    if ((mem[addr + i] & 0xff) !== (bytes[i] & 0xff)) return false;
  }
  return true;
}

function isReadablePointer(ptr, len = 1) {
  return Number.isInteger(ptr) && ptr >= 0 && ptr + len <= MEM_SIZE;
}

function isRamPointer(ptr) {
  return Number.isInteger(ptr) && ptr >= RAM_START && ptr <= RAM_END;
}

function snapshotPointerData(mem, memWrap, ptr, len = 9) {
  const readable = isReadablePointer(ptr, len);
  return {
    ptr,
    readable,
    inRam: isRamPointer(ptr),
    bytesHex: readable ? hexBytes(mem, ptr, len) : '(unreadable)',
    decoded: readable ? safeReadReal(memWrap, ptr) : '(unreadable)',
  };
}

function formatPointerData(snapshot) {
  return [
    `ptr=${hex(snapshot.ptr)}`,
    `readable=${snapshot.readable}`,
    `inRam=${snapshot.inRam}`,
    `bytes=[${snapshot.bytesHex}]`,
    `decoded=${formatValue(snapshot.decoded)}`,
  ].join(' ');
}

function classifyOp1(mem, decoded) {
  if (sameBytes(mem, OP1_ADDR, STORED_REAL_42)) {
    return { kind: 'recalled_42_exact', summary: 'OP1 exactly matches stored 42.0.' };
  }
  if (approxEqual(decoded, 42.0)) {
    return { kind: 'recalled_42_decoded', summary: 'OP1 decodes to 42.0, but bytes are not an exact 42.0 BCD match.' };
  }
  if (sameBytes(mem, OP1_ADDR, VARIABLE_A)) {
    return { kind: 'unchanged_variable_name', summary: 'OP1 stayed as the variable name A.' };
  }
  if (sameBytes(mem, OP1_ADDR, EXPECTED_5)) {
    return { kind: 'computed_5_exact', summary: 'OP1 exactly matches computed 5.0.' };
  }
  if (approxEqual(decoded, 5.0)) {
    return { kind: 'computed_5_decoded', summary: 'OP1 decodes to 5.0, but bytes are not an exact 5.0 BCD match.' };
  }
  return { kind: 'other', summary: `OP1 ended in some other state (${formatValue(decoded)}).` };
}

/**
 * Dump a memory region as annotated hex, showing which offset ranges contain 42.0 BCD pattern.
 */
function dumpMemoryRegion(mem, memWrap, baseDE, label) {
  const startAddr = baseDE - DUMP_BEFORE;
  const lines = [];
  lines.push(`${label}: memory region [${hex(startAddr)}..${hex(startAddr + DUMP_TOTAL - 1)}] (DE=${hex(baseDE)})`);

  // Raw hex dump in rows of 9
  for (let offset = 0; offset < DUMP_TOTAL; offset += 9) {
    const addr = startAddr + offset;
    const len = Math.min(9, DUMP_TOTAL - offset);
    const relDE = addr - baseDE;
    const relLabel = relDE >= 0 ? `DE+${relDE}` : `DE${relDE}`;
    lines.push(`  ${hex(addr)} (${relLabel.padStart(6)}): ${hexBytes(mem, addr, len)}`);
  }

  // Check specific offsets for 42.0 pattern
  const checkOffsets = [
    { name: 'DE-9', addr: baseDE - 9 },
    { name: 'DE', addr: baseDE },
    { name: 'DE+2', addr: baseDE + 2 },
    { name: 'DE+9', addr: baseDE + 9 },
  ];

  lines.push('  42.0 pattern checks:');
  for (const { name, addr } of checkOffsets) {
    if (isReadablePointer(addr, 9)) {
      const match = sameBytes(mem, addr, STORED_REAL_42);
      const bytes = hexBytes(mem, addr, 9);
      const decoded = safeReadReal(memWrap, addr);
      lines.push(`    ${name.padEnd(6)} @ ${hex(addr)}: [${bytes}] match=${match} decoded=${formatValue(decoded)}`);
    } else {
      lines.push(`    ${name.padEnd(6)} @ ${hex(addr)}: (out of range)`);
    }
  }

  return lines;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return {
    mem,
    executor,
    cpu: executor.cpu,
    memWrap: wrapMem(mem),
  };
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
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
  cpu._iy = 0xd00080;
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

  return bootResult;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    returnAddr,
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function setOp1VariableA(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(VARIABLE_A, OP1_ADDR);
}

function setupTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
}

function runCall(executor, cpu, mem, options) {
  const {
    entry,
    budget,
    returnPc,
    allowSentinelRet = false,
    label = 'call',
    milestoneInterval = 0,
    onMilestone,
  } = options;

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];
  const milestones = [];
  let nextMilestone = milestoneInterval > 0 ? milestoneInterval : Number.POSITIVE_INFINITY;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;

    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
      if (step >= nextMilestone) {
        const snap = snapshotPointers(mem);
        const text = `${step} steps: PC=${hex(norm)} errNo=${hex(snap.errNo, 2)} FPS=${hex(snap.fps)} OPS=${hex(snap.ops)}`;
        milestones.push(text);
        if (onMilestone) onMilestone(`  [${label} milestone] ${text}`);
        nextMilestone += milestoneInterval;
      }
    }

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (allowSentinelRet && norm === SENTINEL_RET) throw new Error('__SENTINEL_RET__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = returnPc;
      termination = 'return_hit';
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
      termination = 'err_caught';
    } else if (error?.message === '__SENTINEL_RET__') {
      sentinelRet = true;
      finalPc = SENTINEL_RET;
      termination = 'sentinel_ret';
    } else {
      throw error;
    }
  }

  return {
    entry,
    returnPc,
    returnHit,
    errCaught,
    sentinelRet,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    recentPcs,
    milestones,
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff,
    de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSp: read24(mem, ERR_SP_ADDR),
  };
}

function formatRunOutcome(run) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(run.returnPc)}`;
  if (run.sentinelRet) return `reached missing-block sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function summarizeVerdict(details) {
  if (!details.parse) {
    return {
      summary: `No verdict: ParseInp did not run (${details.parseSkippedReason})`,
      outcome: 'not_run',
      foundPathLike: false,
    };
  }

  const foundPathLike = details.parse.run.stepCount <= 300 && details.parse.run.errNo === 0x00;
  const summary = [
    `ParseInp ${formatRunOutcome(details.parse.run)}`,
    `in ${details.parse.run.stepCount} steps`,
    `with errNo=${hex(details.parse.run.errNo, 2)}`,
    `and ${details.parse.op1Class.summary}`,
  ].join('; ');

  return {
    summary: `${summary}.`,
    outcome: details.parse.op1Class.kind,
    foundPathLike,
  };
}

function writeReport(details) {
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Investigate whether ParseInp\'s variable recall returns 0.0 because:');
  lines.push('- (a) Allocator activity during ParseInp overwrites the 9 bytes at DE, or');
  lines.push('- (b) The variable data is at a different offset from DE (e.g., DE+2 past a VAT header).');
  lines.push('');
  lines.push('We write 42.0 BCD to DE, DE-9, DE+9, and DE+2, then run ParseInp and check which copies survived.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot -> `MEM_INIT` -> `CreateReal("A")` -> write `42.0` BCD to DE, DE-9, DE+9, DE+2 -> re-seed OP1 with `A` -> `ParseInp("2+3")`.');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- MEM_INIT entry: \`${hex(MEM_INIT_ENTRY)}\``);
  lines.push(`- CreateReal entry: \`${hex(CREATEREAL_ENTRY)}\``);
  lines.push(`- ParseInp entry: \`${hex(PARSEINP_ENTRY)}\``);
  lines.push(`- Variable seed in OP1: \`${hexArray(VARIABLE_A)}\``);
  lines.push(`- Stored 42.0 bytes: \`${hexArray(STORED_REAL_42)}\``);
  lines.push(`- Token buffer bytes: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push(`- Token pointers seeded to begPC=curPC=\`${hex(TOKEN_BUFFER_ADDR)}\`, endPC=\`${hex(TOKEN_BUFFER_ADDR + INPUT_TOKENS.length)}\`.`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- OP1 outcome: ${details.verdict.outcome}`);
  lines.push(`- Summary: ${details.verdict.summary}`);
  lines.push(`- Found-path-like result (<=300 steps and errNo=0x00): ${details.verdict.foundPathLike}`);
  if (details.parse) {
    lines.push(`- errNo after ParseInp: \`${hex(details.parse.run.errNo, 2)}\``);
    lines.push(`- ParseInp step count: ${details.parse.run.stepCount}`);
    lines.push(`- OP1 post-call bytes: \`${details.parse.op1PostHex}\``);
    lines.push(`- OP1 decoded after ParseInp: ${formatValue(details.parse.op1Decoded)}`);
  }
  lines.push('');

  // Memory dump analysis section
  lines.push('## Memory Dump Analysis');
  lines.push('');
  if (details.memoryDumpBefore) {
    lines.push('### Before ParseInp');
    lines.push('');
    lines.push('```text');
    lines.push(...details.memoryDumpBefore);
    lines.push('```');
    lines.push('');
  }
  if (details.memoryDumpAfter) {
    lines.push('### After ParseInp');
    lines.push('');
    lines.push('```text');
    lines.push(...details.memoryDumpAfter);
    lines.push('```');
    lines.push('');
  }
  if (details.survivalAnalysis) {
    lines.push('### 42.0 Copy Survival Analysis');
    lines.push('');
    for (const line of details.survivalAnalysis) {
      lines.push(line);
    }
    lines.push('');
  }

  // Pointer transitions
  lines.push('## Pointer Transitions (CreateReal -> pre-ParseInp -> post-ParseInp)');
  lines.push('');
  if (details.pointerTransitions) {
    for (const line of details.pointerTransitions) {
      lines.push(line);
    }
    lines.push('');
  }

  lines.push('## Stage 0: Boot');
  lines.push('');
  lines.push(`- Boot result: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=${hex(details.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(details.postBootPointers)}`);
  lines.push('');
  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Call frame @ \`${hex(details.memInitFrame.mainReturnSp)}\`: \`${details.memInitFrame.mainReturnBytes}\``);
  lines.push(`- Outcome: ${formatRunOutcome(details.memInitRun)}`);
  lines.push(`- Steps: ${details.memInitRun.stepCount}`);
  lines.push(`- errNo after MEM_INIT: \`${hex(details.memInitRun.errNo, 2)}\``);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(details.postMemInitPointers)}`);
  lines.push('');
  lines.push('## Stage 2: CreateReal("A") + Write 42.0 to Multiple Offsets');
  lines.push('');
  if (details.createReal) {
    lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${details.createReal.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(details.createReal.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(details.createReal.frame.mainReturnSp)}\`: \`${details.createReal.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(details.createReal.frame.errFrameBase)}\`: \`${details.createReal.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(details.createReal.run)}`);
    lines.push(`- Steps: ${details.createReal.run.stepCount}`);
    lines.push(`- errNo after CreateReal: \`${hex(details.createReal.run.errNo, 2)}\``);
    lines.push(`- Registers after CreateReal: A/F=\`${hex(details.createReal.run.a, 2)} / ${hex(details.createReal.run.f, 2)}\` HL/DE=\`${hex(details.createReal.run.hl)} / ${hex(details.createReal.run.de)}\` SP=\`${hex(details.createReal.run.sp)}\``);
    lines.push(`- OP1 post-call @ \`${hex(OP1_ADDR)}\`: \`${details.createReal.op1PostHex}\``);
    lines.push(`- OP1 decoded after CreateReal: ${formatValue(details.createReal.op1Decoded)}`);
    lines.push(`- Post-CreateReal pointers: ${formatPointerSnapshot(details.createReal.afterPointers)}`);
    lines.push(`- OPBase movement: ${formatTransition(details.createReal.beforePointers.opBase, details.createReal.afterPointers.opBase)}`);
    lines.push(`- newDataPtr movement: ${formatTransition(details.createReal.beforePointers.newDataPtr, details.createReal.afterPointers.newDataPtr)}`);
    lines.push(`- DE data pointer: \`${hex(details.createReal.run.de)}\``);
    lines.push(`- Write locations: DE=${hex(details.createReal.run.de)}, DE-9=${hex(details.createReal.run.de - 9)}, DE+9=${hex(details.createReal.run.de + 9)}, DE+2=${hex(details.createReal.run.de + 2)}`);
  }
  lines.push('');
  lines.push('## Stage 3: ParseInp("2+3")');
  lines.push('');
  if (details.parse) {
    lines.push(`- Tokens @ \`${hex(TOKEN_BUFFER_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
    lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${details.parse.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(details.parse.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(details.parse.frame.mainReturnSp)}\`: \`${details.parse.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(details.parse.frame.errFrameBase)}\`: \`${details.parse.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(details.parse.run)}`);
    lines.push(`- Steps: ${details.parse.run.stepCount}`);
    lines.push(`- errNo after ParseInp: \`${hex(details.parse.run.errNo, 2)}\``);
    lines.push(`- Registers after ParseInp: A/F=\`${hex(details.parse.run.a, 2)} / ${hex(details.parse.run.f, 2)}\` HL/DE=\`${hex(details.parse.run.hl)} / ${hex(details.parse.run.de)}\` SP=\`${hex(details.parse.run.sp)}\``);
    lines.push(`- OP1 post-call @ \`${hex(OP1_ADDR)}\`: \`${details.parse.op1PostHex}\``);
    lines.push(`- OP1 decoded after ParseInp: ${formatValue(details.parse.op1Decoded)}`);
    lines.push(`- OP1 classification: ${details.parse.op1Class.summary}`);
    lines.push(`- Post-ParseInp pointers: ${formatPointerSnapshot(details.parse.afterPointers)}`);
    if (details.parse.run.milestones.length > 0) {
      lines.push(`- ParseInp milestones: \`${details.parse.run.milestones.join(' | ')}\``);
    } else {
      lines.push('- ParseInp milestones: none');
    }
  } else {
    lines.push(`- ParseInp skipped: ${details.parseSkippedReason}`);
  }
  lines.push('');
  lines.push('## Recent PCs');
  lines.push('');
  lines.push(`- MEM_INIT: \`${details.memInitRun.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  lines.push(`- CreateReal: \`${details.createReal ? (details.createReal.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)') : '(skipped)'}\``);
  lines.push(`- ParseInp: \`${details.parse ? (details.parse.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)') : '(skipped)'}\``);
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
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

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AC: Recall offset investigation — which 42.0 copies survive ParseInp ===');

  const { mem, executor, cpu, memWrap } = createRuntime();

  const bootResult = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  log('\n=== STAGE 1: MEM_INIT ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  const memInitFrame = {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
  };

  const memInitRun = runCall(executor, cpu, mem, {
    entry: MEM_INIT_ENTRY,
    budget: MEM_INIT_BUDGET,
    returnPc: MEM_INIT_RET,
    label: 'MEM_INIT',
  });
  const postMemInitPointers = snapshotPointers(mem);
  log(`MEM_INIT outcome: ${formatRunOutcome(memInitRun)}`);
  log(`MEM_INIT steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  let createReal = null;
  let parse = null;
  let parseSkippedReason = null;
  let memoryDumpBefore = null;
  let memoryDumpAfter = null;
  let survivalAnalysis = null;
  let pointerTransitions = null;

  if (!memInitRun.returnHit) {
    parseSkippedReason = `MEM_INIT did not return to ${hex(MEM_INIT_RET)}`;
    log(`CreateReal skipped: ${parseSkippedReason}`);
  } else {
    log('\n=== STAGE 2: CreateReal("A") + write 42.0 to multiple offsets ===');
    setOp1VariableA(mem);
    const createRealBeforePointers = snapshotPointers(mem);
    const createRealOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const createRealFrame = seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

    log(`CreateReal OP1 pre-call @ ${hex(OP1_ADDR)}: [${createRealOp1PreHex}]`);
    log(`CreateReal pre-call pointers: ${formatPointerSnapshot(createRealBeforePointers)}`);
    log(`CreateReal main return @ ${hex(createRealFrame.mainReturnSp)}: [${createRealFrame.mainReturnBytes}]`);
    log(`CreateReal err frame @ ${hex(createRealFrame.errFrameBase)}: [${createRealFrame.errFrameBytes}]`);

    const createRealRun = runCall(executor, cpu, mem, {
      entry: CREATEREAL_ENTRY,
      budget: CREATEREAL_BUDGET,
      returnPc: CREATEREAL_RET,
      allowSentinelRet: true,
      label: 'CreateReal',
    });
    const createRealAfterPointers = snapshotPointers(mem);
    const createRealOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
    const createRealOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

    const dePtr = createRealRun.de;

    createReal = {
      beforePointers: createRealBeforePointers,
      afterPointers: createRealAfterPointers,
      frame: createRealFrame,
      run: createRealRun,
      op1PreHex: createRealOp1PreHex,
      op1PostHex: createRealOp1PostHex,
      op1Decoded: createRealOp1Decoded,
    };

    log(`CreateReal outcome: ${formatRunOutcome(createRealRun)}`);
    log(`CreateReal errNo=${hex(createRealRun.errNo, 2)} DE=${hex(dePtr)}`);
    log(`CreateReal post-call OP1 @ ${hex(OP1_ADDR)}: [${createRealOp1PostHex}] decoded=${formatValue(createRealOp1Decoded)}`);
    log(`CreateReal post-call pointers: ${formatPointerSnapshot(createRealAfterPointers)}`);
    log(`newDataPtr movement: ${formatTransition(createRealBeforePointers.newDataPtr, createRealAfterPointers.newDataPtr)}`);

    const createRealSucceeded =
      createRealRun.errNo === 0x00 &&
      (createRealRun.returnHit || createRealRun.sentinelRet);

    if (!createRealSucceeded) {
      parseSkippedReason = `CreateReal did not complete cleanly (outcome=${formatRunOutcome(createRealRun)} errNo=${hex(createRealRun.errNo, 2)})`;
      log(`ParseInp skipped: ${parseSkippedReason}`);
    } else if (!isReadablePointer(dePtr, 9)) {
      parseSkippedReason = `CreateReal DE pointer ${hex(dePtr)} was not a readable 9-byte region`;
      log(`Write skipped: ${parseSkippedReason}`);
    } else {
      // Write 42.0 to all four plausible offset locations
      const writeLocations = [
        { name: 'DE', addr: dePtr },
        { name: 'DE-9', addr: dePtr - 9 },
        { name: 'DE+9', addr: dePtr + 9 },
        { name: 'DE+2', addr: dePtr + 2 },
      ];

      log(`\nWriting 42.0 BCD [${hexArray(STORED_REAL_42)}] to multiple offsets:`);
      for (const { name, addr } of writeLocations) {
        if (isReadablePointer(addr, 9)) {
          mem.set(STORED_REAL_42, addr);
          log(`  ${name} @ ${hex(addr)}: written`);
        } else {
          log(`  ${name} @ ${hex(addr)}: SKIPPED (out of range)`);
        }
      }

      // Dump memory BEFORE ParseInp
      log('\n=== MEMORY DUMP: BEFORE ParseInp ===');
      memoryDumpBefore = dumpMemoryRegion(mem, memWrap, dePtr, 'BEFORE ParseInp');
      for (const line of memoryDumpBefore) log(line);

      // Now run ParseInp
      log('\n=== STAGE 3: ParseInp("2+3") ===');
      setOp1VariableA(mem);
      setupTokens(mem);
      const parseBeforePointers = snapshotPointers(mem);
      const parseOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);

      prepareCallState(cpu, mem);
      const parseFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET);

      log(`ParseInp tokens @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
      log(`ParseInp OP1 pre-call @ ${hex(OP1_ADDR)}: [${parseOp1PreHex}]`);
      log(`ParseInp pre-call pointers: ${formatPointerSnapshot(parseBeforePointers)}`);
      log(`ParseInp main return @ ${hex(parseFrame.mainReturnSp)}: [${parseFrame.mainReturnBytes}]`);
      log(`ParseInp err frame @ ${hex(parseFrame.errFrameBase)}: [${parseFrame.errFrameBytes}]`);

      const parseRun = runCall(executor, cpu, mem, {
        entry: PARSEINP_ENTRY,
        budget: PARSEINP_BUDGET,
        returnPc: FAKE_RET,
        label: 'ParseInp',
        milestoneInterval: MILESTONE_INTERVAL,
        onMilestone: log,
      });
      const parseAfterPointers = snapshotPointers(mem);
      const parseOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
      const parseOp1Decoded = safeReadReal(memWrap, OP1_ADDR);
      const op1Class = classifyOp1(mem, parseOp1Decoded);

      parse = {
        beforePointers: parseBeforePointers,
        afterPointers: parseAfterPointers,
        frame: parseFrame,
        run: parseRun,
        op1PreHex: parseOp1PreHex,
        op1PostHex: parseOp1PostHex,
        op1Decoded: parseOp1Decoded,
        op1Class,
      };

      log(`ParseInp outcome: ${formatRunOutcome(parseRun)}`);
      log(`ParseInp errNo=${hex(parseRun.errNo, 2)} steps=${parseRun.stepCount}`);
      log(`ParseInp OP1 post-call @ ${hex(OP1_ADDR)}: [${parseOp1PostHex}] decoded=${formatValue(parseOp1Decoded)}`);
      log(`ParseInp OP1 classification: ${op1Class.summary}`);
      log(`ParseInp post-call pointers: ${formatPointerSnapshot(parseAfterPointers)}`);

      // Dump memory AFTER ParseInp
      log('\n=== MEMORY DUMP: AFTER ParseInp ===');
      memoryDumpAfter = dumpMemoryRegion(mem, memWrap, dePtr, 'AFTER ParseInp');
      for (const line of memoryDumpAfter) log(line);

      // Survival analysis
      log('\n=== 42.0 COPY SURVIVAL ANALYSIS ===');
      survivalAnalysis = [];
      const checkOffsets = [
        { name: 'DE-9', addr: dePtr - 9 },
        { name: 'DE', addr: dePtr },
        { name: 'DE+2', addr: dePtr + 2 },
        { name: 'DE+9', addr: dePtr + 9 },
      ];

      for (const { name, addr } of checkOffsets) {
        if (!isReadablePointer(addr, 9)) {
          const line = `- ${name} @ ${hex(addr)}: OUT OF RANGE`;
          survivalAnalysis.push(line);
          log(line);
          continue;
        }
        const match = sameBytes(mem, addr, STORED_REAL_42);
        const bytes = hexBytes(mem, addr, 9);
        const decoded = safeReadReal(memWrap, addr);
        const status = match ? 'SURVIVED' : 'OVERWRITTEN';
        const line = `- ${name} @ ${hex(addr)}: ${status} — bytes=[${bytes}] decoded=${formatValue(decoded)}`;
        survivalAnalysis.push(line);
        log(line);
      }

      // Pointer transitions
      log('\n=== POINTER TRANSITIONS ===');
      pointerTransitions = [];
      const ptrNames = [
        { name: 'newDataPtr', key: 'newDataPtr' },
        { name: 'OPBase', key: 'opBase' },
        { name: 'OPS', key: 'ops' },
        { name: 'FPSbase', key: 'fpsBase' },
        { name: 'FPS', key: 'fps' },
        { name: 'pTemp', key: 'pTemp' },
        { name: 'progPtr', key: 'progPtr' },
      ];

      for (const { name, key } of ptrNames) {
        const afterCreate = createRealAfterPointers[key];
        const beforeParse = parseBeforePointers[key];
        const afterParse = parseAfterPointers[key];
        const line = `- ${name}: afterCreate=${hex(afterCreate)} -> beforeParse=${hex(beforeParse)} -> afterParse=${hex(afterParse)} (total delta ${signed24Delta(afterCreate, afterParse)})`;
        pointerTransitions.push(line);
        log(line);
      }
    }
  }

  const details = {
    transcript,
    bootResult,
    postBootPointers,
    memInitFrame,
    memInitRun,
    postMemInitPointers,
    createReal,
    parse,
    parseSkippedReason,
    memoryDumpBefore,
    memoryDumpAfter,
    survivalAnalysis,
    pointerTransitions,
  };
  details.verdict = summarizeVerdict(details);

  writeReport(details);

  log('\n=== VERDICT ===');
  log(`OP1 outcome: ${details.verdict.outcome}`);
  log(details.verdict.summary);
  log(`report=${REPORT_PATH}`);

  const informative =
    memInitRun.returnHit &&
    createReal &&
    (createReal.run.returnHit || createReal.run.sentinelRet || createReal.run.errCaught) &&
    (!parse || parse.run.returnHit || parse.run.errCaught || parse.run.sentinelRet || parse.run.missingBlock);
  process.exitCode = informative ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
